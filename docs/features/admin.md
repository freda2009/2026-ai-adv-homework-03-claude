# 後台（`adminProductRoutes.js`、`adminOrderRoutes.js`）

兩個 router 都以 `router.use(authMiddleware, adminMiddleware)` 保護：未登入 401、非管理員 403 `權限不足`。
管理員身分取自 token 內的 `role`，不重查資料庫。

## 商品管理 `/api/admin/products`

**GET `/`**：分頁同公開商品（`page` 預設 1、`limit` 預設 10 上限 100），`created_at DESC`。

**POST `/`**（201）
- `name` 必填（空值 400）；`price` 必須是正整數；`stock` 必須是非負整數（`Number.isInteger`，字串數字會被拒絕）。
- `description`、`image_url` 選填，未提供存為 `NULL`。回傳新建商品，message `商品新增成功`。

**PUT `/:id`**（部分更新）
- 商品不存在 404。只更新有帶的欄位，其餘沿用原值。
- 有帶 `name` 時不可為空白（`trim()` 後空字串回 400）；`price`、`stock` 規則同新增。
- 一律更新 `updated_at`。回傳更新後商品，message `商品更新成功`。

**DELETE `/:id`**
- 商品不存在 404。
- 若該商品存在於任何 **`pending`** 訂單的 `order_items`，回 409 `CONFLICT`（`此商品存在未完成的訂單，無法刪除`）。
- 通過後直接刪除；若商品仍在某人的購物車，依程式碼推論會觸發 FK 錯誤而回 500（未實測，見 [../architecture/database.md](../architecture/database.md)）。

## 訂單管理 `/api/admin/orders`

**GET `/`**
- 查詢參數：`page`、`limit`（同上）、`status`（`pending`｜`paid`｜`failed`）。
- `status` 為其他值時**被忽略**（回傳全部），不會報錯。
- 回傳 `{ orders, pagination }`，`orders` 為 `orders` 表全欄位，`created_at DESC`。

**GET `/:id`**
- 回傳訂單全欄位加 `items`（`order_items`）與 `user`（`{ name, email }`，使用者已不存在時為 `null`）。
- 不存在 404 `訂單不存在`。

後台**沒有**修改訂單狀態或刪除訂單的端點。

## 後台頁面
`/admin/products`、`/admin/orders` 由 `pageRoutes.js` 渲染，伺服器端不驗證身分；`layouts/admin.ejs` 在 `DOMContentLoaded` 呼叫 `Auth.requireAdmin()`，非管理員導向 `/login`。實際資料權限仍由 API 端 middleware 把關。
