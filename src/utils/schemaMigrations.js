// 輕量 schema 補欄位：src/database.js 只有 CREATE TABLE IF NOT EXISTS，既有的 database.sqlite 不會自動加欄位。
// 這裡以 PRAGMA table_info 檢查，缺少才 ALTER TABLE ADD COLUMN；可重複執行（冪等）。
// 欄位名與定義都是程式內固定字串，沒有任何使用者輸入進入 SQL。

// orders 的運費欄位（金額快照，與 order_items 的 product_price 快照同理：日後調整費率不影響舊訂單）。
const ORDER_SHIPPING_COLUMNS = [
  { name: 'subtotal_amount', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_amount >= 0)' },
  // NULL 代表運費功能上線前建立的舊訂單（沒有選擇配送方式）。
  {
    name: 'shipping_method',
    definition: "TEXT CHECK(shipping_method IS NULL OR shipping_method IN ('home_delivery', 'convenience_store'))",
  },
  { name: 'base_shipping_fee', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK(base_shipping_fee >= 0)' },
  { name: 'remote_surcharge', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK(remote_surcharge >= 0)' },
  { name: 'urgent_surcharge', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK(urgent_surcharge >= 0)' },
  { name: 'shipping_fee', definition: 'INTEGER NOT NULL DEFAULT 0 CHECK(shipping_fee >= 0)' },
];

// 回傳本次新增的欄位名稱（已是最新時回傳空陣列）。
function addOrderShippingColumns(db) {
  const migrate = db.transaction(() => {
    const existing = new Set(db.prepare('PRAGMA table_info(orders)').all().map((col) => col.name));
    const added = [];
    for (const column of ORDER_SHIPPING_COLUMNS) {
      if (!existing.has(column.name)) {
        db.exec(`ALTER TABLE orders ADD COLUMN ${column.name} ${column.definition}`);
        added.push(column.name);
      }
    }
    // 舊訂單沒有運費：商品小計就是原本的 total_amount。
    if (added.includes('subtotal_amount')) {
      db.prepare('UPDATE orders SET subtotal_amount = total_amount').run();
    }
    return added;
  });
  return migrate();
}

module.exports = { ORDER_SHIPPING_COLUMNS, addOrderShippingColumns };
