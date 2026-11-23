// 整合測試的資料建立與清除工具：每個測試建立自己的會員與資料，結束後刪除並還原庫存。
// 資料庫是 vitest.config.js 指定的記憶體 SQLite（DB_PATH=:memory:），不會碰到 database.sqlite。
const { app, request } = require('./setup');
const db = require('../../src/database');

const TABLES = ['users', 'orders', 'order_items', 'payments', 'cart_items'];

// 各資料表筆數，用來確認失敗時沒有留下資料、清除後回到原狀。
function countRows() {
  const counts = {};
  for (const table of TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; // 表名為上方固定清單
  }
  return counts;
}

function snapshotStock() {
  return Object.fromEntries(db.prepare('SELECT id, stock FROM products').all().map((p) => [p.id, p.stock]));
}

function restoreStock(snapshot) {
  const update = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
  db.transaction(() => {
    for (const [id, stock] of Object.entries(snapshot)) update.run(stock, id);
  })();
}

// 刪除某會員建立的所有資料（訂單品項、付款、訂單、購物車、帳號），依 FK 順序在單一交易內完成。
function deleteMemberData(userId) {
  db.transaction(() => {
    const orderIds = db.prepare('SELECT id FROM orders WHERE user_id = ?').all(userId).map((o) => o.id);
    const deletePayments = db.prepare('DELETE FROM payments WHERE order_id = ?');
    const deleteItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');
    for (const orderId of orderIds) {
      deletePayments.run(orderId);
      deleteItems.run(orderId);
    }
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
}

function memberRowCounts(userId) {
  return {
    users: db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId).n,
    orders: db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(userId).n,
    cart_items: db.prepare('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?').get(userId).n,
  };
}

// 建立測試會員（註冊）並以登入取得 token，回傳 { id, email, password, token }。
async function createMember() {
  const email = `it-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'password123';
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ email, password, name: '整合測試會員' });
  if (registered.status !== 201) {
    throw new Error(`建立測試會員失敗：${registered.status} ${JSON.stringify(registered.body)}`);
  }
  const loggedIn = await request(app).post('/api/auth/login').send({ email, password });
  if (loggedIn.status !== 200) {
    throw new Error(`測試會員登入失敗：${loggedIn.status} ${JSON.stringify(loggedIn.body)}`);
  }
  return { id: loggedIn.body.data.user.id, email, password, token: loggedIn.body.data.token };
}

module.exports = { db, countRows, snapshotStock, restoreStock, deleteMemberData, memberRowCounts, createMember };
