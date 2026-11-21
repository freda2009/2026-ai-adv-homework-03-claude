// 購物車服務：登入／註冊時把訪客（session）購物車合併進帳號購物車。
const db = require('../database');

const selectGuestItems = db.prepare(
  `SELECT ci.id, ci.product_id, ci.quantity, p.stock
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
    WHERE ci.session_id = ? AND ci.user_id IS NULL`
);
const selectOwnItem = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?');
const updateQuantity = db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?');
const adoptItem = db.prepare('UPDATE cart_items SET user_id = ?, session_id = NULL, quantity = ? WHERE id = ?');
const deleteItem = db.prepare('DELETE FROM cart_items WHERE id = ?');

// 單一交易：任何一步失敗都會整體回滾，訪客項目保留，下次登入可重試。
const merge = db.transaction((userId, sessionId) => {
  let merged = 0;
  for (const item of selectGuestItems.all(sessionId)) {
    const own = selectOwnItem.get(userId, item.product_id);
    if (own) {
      // 數量相加，超過庫存以庫存為上限；但不會把帳號原有的數量往下調。
      const quantity = Math.max(own.quantity, Math.min(own.quantity + item.quantity, item.stock));
      updateQuantity.run(quantity, own.id);
      deleteItem.run(item.id);
      merged += 1;
    } else {
      const quantity = Math.min(item.quantity, item.stock);
      if (quantity < 1) {
        deleteItem.run(item.id); // 庫存為 0：不帶入，也不留在訪客端
      } else {
        adoptItem.run(userId, quantity, item.id);
        merged += 1;
      }
    }
  }
  return merged;
});

// 回傳帶入帳號的項目數。沒有 sessionId（沒帶 X-Session-Id）就不合併。
function mergeSessionCartIntoUser(userId, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return 0;
  return merge(userId, sessionId);
}

module.exports = { mergeSessionCartIntoUser };
