# 架構

路由表見 [architecture/api-routes.md](./architecture/api-routes.md)，資料表見 [architecture/database.md](./architecture/database.md)。

## 目錄結構

```
.
├── server.js            # 入口：直接執行時檢查 JWT_SECRET，listen（PORT 預設 3001）；匯出 app
├── app.js               # 組裝 Express：dotenv、載入 DB、中介層、路由、404、errorHandler；匯出 app（測試用）
├── swagger-config.js    # OpenAPI 3.0.3 設定，定義 bearerAuth、sessionId（X-Session-Id）兩種 scheme
├── generate-openapi.js  # 掃描 ./src/routes/*.js 的 @openapi 註解，寫出 openapi.json
├── vitest.config.js     # globals、fileParallelism: false、sequence.files
├── src/
│   ├── database.js      # 連線 database.sqlite、建表、seed；匯出 db 單例
│   ├── middleware/      # authMiddleware、adminMiddleware、sessionMiddleware、errorHandler
│   └── routes/          # auth / product / cart / order / adminProduct / adminOrder / page
├── views/
│   ├── layouts/         # front.ejs、admin.ejs（載入 Vue CDN 與共用 JS）
│   ├── partials/        # head、header、footer、notification、admin-header、admin-sidebar
│   └── pages/           # 前台頁面；admin/ 為後台頁面（products、orders）
├── public/
│   ├── js/              # auth.js、api.js、notification.js、header-init.js
│   ├── js/pages/        # 每頁一支 Vue createApp 腳本，檔名對應 pageScript
│   ├── css/             # input.css（Tailwind 主題色）→ output.css（建置產物，已 gitignore）
│   └── stylesheets/     # style.css（目前沒有任何模板引用）
└── tests/               # setup.js（輔助函式）+ 6 個 *.test.js
```

## 啟動流程

1. `server.js` 載入 `app.js`；`app.js` 先 `dotenv.config()`。
2. `require('./src/database')`：開啟 `database.sqlite`、`journal_mode = WAL`、`foreign_keys = ON`，`CREATE TABLE IF NOT EXISTS` 建 5 張表，再 seed 管理員與商品。
3. 設定 EJS（`views/`）、靜態檔（`public/`）、`cors`（`origin: FRONTEND_URL`，預設 `http://localhost:3001`）、`express.json()`、`express.urlencoded()`、`sessionMiddleware`。
4. 掛載路由（順序）：`/api/auth`、`/api/admin/products`、`/api/admin/orders`、`/api/products`、`/api/cart`、`/api/orders`，最後 `/` 頁面路由。
5. 404：路徑以 `/api` 開頭回 JSON `NOT_FOUND`，否則渲染 `pages/404`（套用 front 版面）；最後掛 `errorHandler`。
6. `JWT_SECRET` 只在 `node server.js` 直接執行時檢查；測試 `require('../app')` 不會檢查，缺少時登入會在簽發 token 時失敗。

## 認證與授權

| 項目 | 行為 |
|------|------|
| Token | JWT，演算法 HS256，有效期 `7d`，payload：`{ userId, email, role }`，密鑰 `JWT_SECRET` |
| 傳遞方式 | `Authorization: Bearer <token>` |
| `authMiddleware` | 驗證 token；再查 `users` 確認使用者仍存在（不存在回 401 `使用者不存在，請重新登入`）；設定 `req.user = { userId, email, role }` |
| `adminMiddleware` | 只看 `req.user.role`（來自 token，不重查 DB），非 admin 回 403 `FORBIDDEN`；必須放在 `authMiddleware` 之後 |
| `sessionMiddleware` | 全域；有 `X-Session-Id` header 就設 `req.sessionId`，不做任何驗證 |
| 雙模式（僅購物車） | 見 [features/cart.md](./features/cart.md)：有 Bearer 就必須有效；沒有 Bearer 才退回 session |
| 密碼 | bcrypt；註冊固定 cost 10，管理員 seed 在 `NODE_ENV=test` 時用 cost 1 |
| 頁面保護 | 頁面路由（含 `/admin/*`）伺服器端不驗證，僅靠前端 `Auth.requireAdmin()` 導向；資料安全依賴 API 端的 middleware |

## 統一回應格式

```json
{ "data": { }, "error": null, "message": "成功" }
{ "data": null, "error": "NOT_FOUND", "message": "商品不存在" }
```

分頁列表的 `data` 為 `{ <items>: [...], pagination: { total, page, limit, totalPages } }`。

| error 碼 | HTTP | 出現情境 |
|----------|------|----------|
| `VALIDATION_ERROR` | 400 | 欄位缺漏或格式錯誤 |
| `STOCK_INSUFFICIENT` | 400 | 加入購物車、改數量、結帳時庫存不足 |
| `CART_EMPTY` | 400 | 結帳時購物車為空 |
| `INVALID_STATUS` | 400 | 付款時訂單狀態不是 `pending` |
| `UNAUTHORIZED` | 401 | 未帶 token、token 無效或過期、帳密錯誤 |
| `FORBIDDEN` | 403 | 非管理員存取後台 API |
| `NOT_FOUND` | 404 | 資源不存在，或不屬於目前使用者 |
| `CONFLICT` | 409 | Email 重複註冊、商品存在待付款訂單而無法刪除 |
| `INTERNAL_ERROR` | 依狀態碼 | `errorHandler` 的所有輸出都用這個碼；500 的 message 固定為 `伺服器內部錯誤` |

`errorHandler` 注意：無論狀態碼為何，`error` 欄位都是 `INTERNAL_ERROR`；只有 `err.isOperational` 為真時才回傳原始 message。
