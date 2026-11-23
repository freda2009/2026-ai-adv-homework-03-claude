// orders 運費欄位補欄位測試：自建獨立的記憶體資料庫模擬「功能上線前」的舊 schema，不使用 app 的資料庫。
const Database = require('better-sqlite3');
const { ORDER_SHIPPING_COLUMNS, addOrderShippingColumns } = require('../../src/utils/schemaMigrations');

const COLUMN_NAMES = ORDER_SHIPPING_COLUMNS.map((c) => c.name);

function createLegacyDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount, status)
     VALUES ('o1', 'ORD-20261121-AAAAA', 'u1', '舊訂單', 'old@example.com', '台北市', 1680, 'paid')`
  ).run();
  return db;
}

describe('addOrderShippingColumns（orders 運費欄位）', () => {
  it('舊資料庫：補上全部運費欄位，舊訂單小計回填為原總額、運費為 0、配送方式為 NULL', () => {
    const db = createLegacyDb();

    expect(addOrderShippingColumns(db)).toEqual(COLUMN_NAMES);

    const names = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(COLUMN_NAMES));
    expect(db.prepare('SELECT * FROM orders WHERE id = ?').get('o1')).toMatchObject({
      total_amount: 1680,
      status: 'paid',
      subtotal_amount: 1680,
      shipping_method: null,
      base_shipping_fee: 0,
      remote_surcharge: 0,
      urgent_surcharge: 0,
      shipping_fee: 0,
    });
  });

  it('可重複執行：第二次不新增欄位、不改動資料', () => {
    const db = createLegacyDb();
    addOrderShippingColumns(db);
    db.prepare("UPDATE orders SET subtotal_amount = 1000, shipping_fee = 120 WHERE id = 'o1'").run();

    expect(addOrderShippingColumns(db)).toEqual([]);
    expect(db.prepare('SELECT subtotal_amount, shipping_fee FROM orders').get()).toEqual({ subtotal_amount: 1000, shipping_fee: 120 });
  });

  it('CHECK 約束生效：不接受未知配送方式與負數運費', () => {
    const db = createLegacyDb();
    addOrderShippingColumns(db);

    expect(() => db.prepare("UPDATE orders SET shipping_method = 'drone'").run()).toThrow(/CHECK/);
    expect(() => db.prepare('UPDATE orders SET shipping_fee = -1').run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE orders SET shipping_method = 'convenience_store'").run()).not.toThrow();
  });

  it('app 使用的資料庫已有運費欄位', () => {
    const appDb = require('../../src/database');
    expect(appDb.memory).toBe(true); // 與 test/setup.js 相同的安全閥：只檢查記憶體資料庫
    const names = appDb.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(COLUMN_NAMES));
    expect(addOrderShippingColumns(appDb)).toEqual([]);
  });
});
