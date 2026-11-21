# 資料庫

SQLite，預設檔案為專案根目錄的 `database.sqlite`；可用環境變數 `DB_PATH` 覆寫（`:memory:` 為記憶體資料庫，相對路徑以專案根目錄解析）。測試固定使用 `:memory:`，不會碰開發資料庫。
連線設定：`journal_mode = WAL`、`foreign_keys = ON`。所有 id 為 `uuid v4` 字串；時間為 SQLite `datetime('now')`（UTC，字串格式）。
`db` 是同步 API（better-sqlite3），路由中不需要 `await`；多步驟寫入使用 `db.transaction(() => {...})`。

## 資料表

### users
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| email | TEXT | UNIQUE NOT NULL |
| password_hash | TEXT | NOT NULL（bcrypt） |
| name | TEXT | NOT NULL |
| role | TEXT | NOT NULL DEFAULT `'user'`，CHECK IN (`user`, `admin`) |
| created_at | TEXT | NOT NULL DEFAULT `datetime('now')` |

### products
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| description | TEXT | 可為 NULL |
| price | INTEGER | NOT NULL，CHECK `price > 0` |
| stock | INTEGER | NOT NULL DEFAULT 0，CHECK `stock >= 0` |
| image_url | TEXT | 可為 NULL |
| created_at / updated_at | TEXT | NOT NULL DEFAULT `datetime('now')`；更新商品時手動寫入 `updated_at` |

### cart_items
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| session_id | TEXT | 訪客使用；與 `user_id` 擇一有值 |
| user_id | TEXT | 登入者使用；FK → `users(id)` |
| product_id | TEXT | NOT NULL，FK → `products(id)` |
| quantity | INTEGER | NOT NULL DEFAULT 1，CHECK `quantity > 0` |

沒有 UNIQUE 約束與索引；「同一商品只有一列」由 `cartRoutes.js` 的程式邏輯維持。

### orders
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| order_no | TEXT | UNIQUE NOT NULL，格式 `ORD-YYYYMMDD-XXXXX`（日期為 UTC，XXXXX 為 uuid 前 5 碼大寫） |
| user_id | TEXT | NOT NULL，FK → `users(id)` |
| recipient_name / recipient_email / recipient_address | TEXT | NOT NULL |
| total_amount | INTEGER | NOT NULL |
| status | TEXT | NOT NULL DEFAULT `'pending'`，CHECK IN (`pending`, `paid`, `failed`) |
| created_at | TEXT | NOT NULL DEFAULT `datetime('now')` |

### order_items
| 欄位 | 型別 | 約束 |
|------|------|------|
| id | TEXT | PRIMARY KEY |
| order_id | TEXT | NOT NULL，FK → `orders(id)` |
| product_id | TEXT | NOT NULL（沒有 FK，商品刪除後仍保留） |
| product_name / product_price | TEXT / INTEGER | NOT NULL，下單當下的快照 |
| quantity | INTEGER | NOT NULL |

## 關聯與刪除行為

- `cart_items.product_id` 有 FK 且 `foreign_keys = ON`：商品若仍在任何人的購物車中，`DELETE FROM products` 依程式碼推論會因 FK 失敗而回 500（未實測；後台刪除只檢查待付款訂單，沒有清購物車）。
- `order_items.product_id` 沒有 FK，所以歷史訂單不受商品刪除影響。
- 訂單狀態只會 `pending → paid` 或 `pending → failed`；失敗不會還原庫存，也沒有重新付款流程。

## Seed 資料（`src/database.js`）

- 管理員：以 `ADMIN_EMAIL`、`ADMIN_PASSWORD`（預設 `admin@hexschool.com`、`12345678`）建立，email 已存在就跳過。
- 商品：`products` 表為空時才寫入 8 項（粉色玫瑰花束、白色百合花禮盒、繽紛向日葵花束、紫色鬱金香盆栽、乾燥花藝術花圈、迷你多肉組合盆、經典紅玫瑰花束、季節鮮花訂閱），價格 580–3980，庫存 15–100。
- 重置資料：停止伺服器後刪除 `database.sqlite`、`-shm`、`-wal` 三個檔案，重新啟動即重建。
