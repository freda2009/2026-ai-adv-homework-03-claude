---
paths:
  - "src/database.js"
  - "src/routes/**"
---

# 資料庫規則（better-sqlite3，同步 API）

- 查詢一律 `db.prepare('... ?').get/all/run(...)` 參數化；不可把使用者輸入串進 SQL。唯一例外是欄位名，且必須來自程式內固定值（如 `cartRoutes.js` 的 `owner.field` 只會是 `user_id` 或 `session_id`）。
- 多步驟寫入（建立訂單、扣庫存、清購物車）必須包在 `db.transaction(() => {...})` 內。
- 命名：表名複數 `snake_case`、欄位 `snake_case`；id 為 `uuidv4()` 產生的 TEXT；時間用 `datetime('now')` 的 TEXT；金額與庫存用 INTEGER。
- 業務限制同時寫成 CHECK 約束（`price > 0`、`stock >= 0`、`status IN (...)`）與路由驗證。
- `foreign_keys = ON`：刪除被參照的資料前先確認引用（`cart_items.product_id` 有 FK；`order_items.product_id` 沒有）。
- `src/database.js` 只有 `CREATE TABLE IF NOT EXISTS`，**沒有遷移**：修改既有資料表不會套用到現有的 `database.sqlite`，需另行處理資料或刪檔重建。
- 訂單明細複製 `product_name`、`product_price` 作為下單快照，不要改成即時 JOIN 商品。
- Seed 必須冪等（先檢查是否已存在）。
- 改動 schema 後同步更新 docs/architecture/database.md。
