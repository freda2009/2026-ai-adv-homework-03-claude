# API 與頁面路由表

回應格式與錯誤碼見 [../ARCHITECTURE.md](../ARCHITECTURE.md)。各端點行為細節見 [../FEATURES.md](../FEATURES.md)。

## API 總覽

| 前綴 | 檔案 | 認證 | 說明 |
|------|------|------|------|
| `/api/auth` | `authRoutes.js` | 僅 `/profile` 需要 Bearer | 註冊、登入、個人資料 |
| `/api/products` | `productRoutes.js` | 無 | 公開商品列表與詳情 |
| `/api/cart` | `cartRoutes.js` | 雙模式（Bearer 或 `X-Session-Id`） | 購物車 |
| `/api/orders` | `orderRoutes.js` | Bearer（`router.use(authMiddleware)`） | 自己的訂單、建立、模擬付款 |
| `/api/admin/products` | `adminProductRoutes.js` | Bearer + admin | 後台商品 CRUD |
| `/api/admin/orders` | `adminOrderRoutes.js` | Bearer + admin | 後台訂單查詢 |

## API 端點

| 方法 | 路徑 | 成功碼 | 說明 |
|------|------|--------|------|
| POST | `/api/auth/register` | 201 | 註冊並直接回傳 token |
| POST | `/api/auth/login` | 200 | 登入 |
| GET | `/api/auth/profile` | 200 | 取得目前使用者（`id, email, name, role, created_at`） |
| GET | `/api/products` | 200 | 商品列表，`page`（預設 1）、`limit`（預設 10，上限 100），依 `created_at DESC` |
| GET | `/api/products/:id` | 200 | 商品詳情，不存在回 404 |
| GET | `/api/cart` | 200 | 購物車內容與 `total` |
| POST | `/api/cart` | 200 | 加入商品（已存在則累加數量） |
| PATCH | `/api/cart/:itemId` | 200 | 修改數量（覆蓋，不是累加） |
| DELETE | `/api/cart/:itemId` | 200 | 移除項目 |
| POST | `/api/orders` | 201 | 由購物車建立訂單 |
| GET | `/api/orders` | 200 | 自己的訂單列表（無分頁） |
| GET | `/api/orders/:id` | 200 | 自己的訂單詳情（含 items） |
| PATCH | `/api/orders/:id/pay` | 200 | 模擬付款，body `{ action: "success" \| "fail" }` |
| GET | `/api/admin/products` | 200 | 後台商品列表（分頁同公開） |
| POST | `/api/admin/products` | 201 | 新增商品 |
| PUT | `/api/admin/products/:id` | 200 | 部分更新商品 |
| DELETE | `/api/admin/products/:id` | 200 | 刪除商品 |
| GET | `/api/admin/orders` | 200 | 後台訂單列表，`page`、`limit`、`status` |
| GET | `/api/admin/orders/:id` | 200 | 後台訂單詳情（含 items 與下單者 `user`） |

## 頁面路由（`pageRoutes.js`）

| 路徑 | 版面 | pageScript | 說明 |
|------|------|-----------|------|
| `/` | front | `index` | 商品列表（每頁 9 筆） |
| `/products/:id` | front | `product-detail` | 商品詳情，`productId` 以 `data-product-id` 傳給 Vue |
| `/cart` | front | `cart` | 購物車 |
| `/checkout` | front | `checkout` | 結帳（需登入） |
| `/login` | front | `login` | 登入／註冊分頁，支援 `?redirect=` |
| `/orders` | front | `orders` | 我的訂單（需登入） |
| `/orders/:id` | front | `order-detail` | 訂單詳情與模擬付款；`?payment=` 傳入 `paymentResult` |
| `/admin/products` | admin | `admin-products` | 商品管理 |
| `/admin/orders` | admin | `admin-orders` | 訂單管理 |

頁面渲染方式：先 `res.render('pages/<name>')` 取得 `body`，再把 `body` 傳給 `layouts/front` 或 `layouts/admin`。
