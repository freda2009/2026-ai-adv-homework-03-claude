# 架構

路由表見 [architecture/api-routes.md](./architecture/api-routes.md)，資料表見 [architecture/database.md](./architecture/database.md)。

## 目錄結構

```
.
├── server.js            # 入口：直接執行時檢查 JWT_SECRET，listen（PORT 預設 3001）；匯出 app
├── app.js               # 組裝 Express：dotenv、載入 DB、中介層、路由、404、errorHandler；匯出 app（測試用）
├── swagger-config.js    # OpenAPI 3.0.3 設定，定義 bearerAuth、sessionId（X-Session-Id）兩種 scheme
├── generate-openapi.js  # 掃描 ./src/routes/*.js 的 @openapi 註解，寫出 openapi.json
├── vitest.config.js     # unit＋integration；test.env（DB_PATH=:memory: 等）、排除 test/e2e
├── playwright.config.js # E2E：測已啟動的 localhost:3001、系統 Chrome、不設定 webServer
├── scripts/             # generate-postman.js：openapi.json → Postman Collection
├── postman/             # flower-life.postman_collection.json（npm run postman 產生，已 gitignore）
├── .github/workflows/   # test.yml：GitHub Actions 在 push／PR 時執行 test:unit、test:integration（Node 24）
├── src/
│   ├── database.js      # 連線 database.sqlite、建表、seed；匯出 db 單例
│   ├── middleware/      # authMiddleware、adminMiddleware、sessionMiddleware、errorHandler
│   ├── routes/          # auth / product / cart / shipping / order / ecpay / adminProduct / adminOrder / page
│   ├── services/        # ecpay.js：綠界簽章、付款表單欄位、QueryTradeInfo 查詢；cartService.js：登入／註冊時合併訪客購物車
│   └── utils/           # shipping.js：運費規則與計算（純函式）；schemaMigrations.js：orders 運費欄位補欄位
├── views/
│   ├── layouts/         # front.ejs、admin.ejs（載入 Vue CDN 與共用 JS）
│   ├── partials/        # head、header、footer、notification、admin-header、admin-sidebar
│   └── pages/           # 前台頁面；admin/ 為後台頁面（products、orders）
├── public/
│   ├── js/              # auth.js、api.js、notification.js、header-init.js
│   ├── js/pages/        # 每頁一支 Vue createApp 腳本，檔名對應 pageScript
│   ├── css/             # input.css（Tailwind 主題色）→ output.css（建置產物，已 gitignore）
│   └── stylesheets/     # style.css（目前沒有任何模板引用）
└── test/                # unit/、integration/（setup.js、testData.js）、e2e/（Playwright），見 TESTING.md
```

## 啟動流程

1. `server.js` 載入 `app.js`；`app.js` 先 `dotenv.config()`。
2. `require('./src/database')`：開啟資料庫（預設 `database.sqlite`，可用 `DB_PATH` 覆寫）、`journal_mode = WAL`、`foreign_keys = ON`，`CREATE TABLE IF NOT EXISTS` 建 6 張表、`addOrderShippingColumns` 補 `orders` 運費欄位，再 seed 管理員與商品。
3. 設定 EJS（`views/`）、靜態檔（`public/`）、`cors`（`origin: FRONTEND_URL`，預設 `http://localhost:3001`）、`express.json()`、`express.urlencoded()`、`sessionMiddleware`。
4. 掛載路由（順序）：`/api/auth`、`/api/admin/products`、`/api/admin/orders`、`/api/products`、`/api/cart`、`/api/shipping`、`/api/orders`（`orderRoutes`，再接同前綴的 `ecpayRoutes`），最後 `/` 頁面路由（含 `POST /ecpay/return`）。
5. 404：路徑以 `/api` 開頭回 JSON `NOT_FOUND`，否則渲染 `pages/404`（套用 front 版面）；最後掛 `errorHandler`。
6. `JWT_SECRET` 只在 `node server.js` 直接執行時檢查；測試 `require('../../app')` 不會檢查，由 `vitest.config.js` 的 `test.env` 提供測試用的值。

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
| `VALIDATION_ERROR` | 400 | 欄位缺漏或格式錯誤（含配送選項、運費試算參數） |
| `STOCK_INSUFFICIENT` | 400 | 加入購物車、改數量、結帳時庫存不足 |
| `CART_EMPTY` | 400 | 結帳時購物車為空 |
| `INVALID_STATUS` | 400 | 付款時訂單狀態不是 `pending` |
| `UNAUTHORIZED` | 401 | 未帶 token、token 無效或過期、帳密錯誤 |
| `FORBIDDEN` | 403 | 非管理員存取後台 API |
| `NOT_FOUND` | 404 | 資源不存在，或不屬於目前使用者 |
| `CONFLICT` | 409 | Email 重複註冊、商品存在待付款訂單而無法刪除 |
| `NO_PAYMENT` | 400 | 查詢付款時，訂單尚未建立任何付款交易 |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | 綠界回報已付款，但金額與訂單不符 |
| `TOO_MANY_REQUESTS` | 429 | 同一筆付款交易 10 秒內重複查詢（附 `Retry-After`） |
| `PAYMENT_QUERY_FAILED` | 502 | 無法確認付款結果：綠界連線失敗、簽章不符、回應與本地不一致 |
| `PAYMENT_NOT_CONFIGURED` | 503 | 綠界環境變數未設定 |
| `INTERNAL_ERROR` | 依狀態碼 | `errorHandler` 的所有輸出都用這個碼；500 的 message 固定為 `伺服器內部錯誤` |

`errorHandler` 注意：無論狀態碼為何，`error` 欄位都是 `INTERNAL_ERROR`；只有 `err.isOperational` 為真時才回傳原始 message。
