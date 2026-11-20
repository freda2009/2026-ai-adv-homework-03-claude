# 功能清單

端點對照表見 [architecture/api-routes.md](./architecture/api-routes.md)。

| 區塊 | 摘要 | 細節 |
|------|------|------|
| 認證 | 註冊、登入、個人資料（JWT 7 天） | 本檔 |
| 商品（公開） | 列表分頁、詳情 | 本檔 |
| 購物車 | 訪客（session）與登入者雙模式，累加與庫存檢查 | [features/cart.md](./features/cart.md) |
| 訂單與付款 | 由購物車結帳（transaction 扣庫存）、模擬付款 | [features/orders.md](./features/orders.md) |
| 後台 | 商品 CRUD、訂單查詢與狀態篩選 | [features/admin.md](./features/admin.md) |
| 前端頁面 | Auth 物件、apiFetch、頁面腳本慣例 | [features/frontend.md](./features/frontend.md) |

## 認證（`authRoutes.js`）

**POST `/api/auth/register`**（201）
- Body 必填：`email`、`password`、`name`；缺任一個回 400 `VALIDATION_ERROR`。
- Email 以 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` 檢查；密碼至少 6 個字元。
- Email 已存在回 409 `CONFLICT`（`Email 已被註冊`）。
- 角色固定為 `user`（無法由註冊建立管理員）。成功回傳 `{ user: { id, email, name, role }, token }`，註冊後直接視為登入。

**POST `/api/auth/login`**（200）
- Body 必填：`email`、`password`。
- 帳號不存在或密碼錯誤都回同一則 401 `Email 或密碼錯誤`（不洩漏帳號是否存在）。
- 成功回傳格式同註冊。

**GET `/api/auth/profile`**（需 Bearer）
- 回傳 `id, email, name, role, created_at`；使用者不存在回 404。

## 商品（公開，`productRoutes.js`）

**GET `/api/products`**
- 查詢參數：`page`（預設 1，最小 1）、`limit`（預設 10，限制在 1–100）；非數字視為預設值。
- 依 `created_at DESC` 排序，回傳 `{ products, pagination: { total, page, limit, totalPages } }`。
- 前台首頁每頁請求 `limit=9`。

**GET `/api/products/:id`**
- 回傳單一商品所有欄位；找不到回 404 `商品不存在`。

商品在前台沒有搜尋、分類或排序參數。
