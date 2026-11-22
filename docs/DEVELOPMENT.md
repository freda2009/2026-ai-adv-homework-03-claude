# 開發規範

## 命名規則

| 對象 | 規則 | 範例 |
|------|------|------|
| 資料表／欄位 | `snake_case`，表名複數 | `order_items`、`created_at` |
| API 回應欄位 | 沿用資料庫 `snake_case` | `product_id`、`total_amount` |
| API 請求 body（結帳） | `camelCase` | `recipientName`、`productId` |
| 路由檔 | `<資源>Routes.js`（`camelCase`） | `adminOrderRoutes.js` |
| middleware 檔 | `<名稱>Middleware.js`、`errorHandler.js` | `authMiddleware.js` |
| 前端頁面腳本 | `kebab-case.js`，與 `pageScript` 同名 | `order-detail.js` |
| 錯誤碼 | `UPPER_SNAKE_CASE` | `STOCK_INSUFFICIENT` |
| id | `uuid v4` 字串，由後端產生 | `uuidv4()` |

請求 body 的大小寫並不一致（結帳用 camelCase、後台商品用 `image_url`），新增欄位時請對齊同一資源既有的寫法。

## 模組系統與慣例

- 後端 CommonJS：`require`／`module.exports`。路由檔匯出 `router`，`src/database.js` 匯出 `db` 單例。
- `vitest.config.js` 使用 ESM `import`（由 Vitest 自行處理），測試檔則用 `require`。
- 前端沒有打包：`public/js/*.js` 以全域變數（`Auth`、`apiFetch`、`Notification`）互相使用，載入順序見 [features/frontend.md](./features/frontend.md)。
- 驗證寫在路由內，沒有共用 validator；email regex 在 `authRoutes.js`、`orderRoutes.js`、`checkout.js` 各有一份。例外：配送選項的驗證與運費計算集中在 `src/utils/shipping.js`。
- `src/utils/` 放不依賴 Express 的純邏輯模組（可獨立單元測試）；`src/services/` 放會呼叫外部服務或資料庫的模組。

## 環境變數（`.env`，範例見 `.env.example`）

| 變數 | 用途 | 必要 | 預設 |
|------|------|------|------|
| `JWT_SECRET` | JWT 簽章密鑰 | 是（`node server.js` 缺少時結束） | 無 |
| `PORT` | 伺服器埠號 | 否 | `3001` |
| `FRONTEND_URL` | CORS `origin` | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL`／`ADMIN_PASSWORD` | 管理員 seed 帳密 | 否 | `admin@hexschool.com`／`12345678` |
| `DB_PATH` | 資料庫路徑；`:memory:` 為記憶體資料庫；相對路徑以專案根目錄解析 | 否 | `database.sqlite`（測試由 `vitest.config.js` 設為 `:memory:`） |
| `NODE_ENV` | `test` 時管理員 seed 的 bcrypt cost 為 1 | 否 | 未設 |
| `BASE_URL` | 本站對外網址，用於綠界的 `OrderResultURL`、`ClientBackURL` | 否 | `http://localhost:<PORT>` |
| `ECPAY_MERCHANT_ID`／`ECPAY_HASH_KEY`／`ECPAY_HASH_IV` | 綠界商店代號與金鑰（範例檔為公開測試值）；只放環境變數 | 付款時必要 | 無（缺少時付款端點回 503） |
| `ECPAY_ENV` | `production` 才連正式環境，其他值一律使用測試環境 | 否 | `staging` |
| `ECPAY_RETURN_URL` | 綠界必填的 ReturnURL；本機收不到 Server Notify，不需設定 | 否 | `${BASE_URL}/api/ecpay/notify` |

`.env.example` 的 `FRONTEND_URL` 是 `http://localhost:5173`，與程式預設不同；前端由同一個 Express 提供時不需要改。

## JSDoc／OpenAPI 格式

每個端點上方用 `@openapi` 註解，`npm run openapi` 讀取 `./src/routes/*.js`：

```js
/**
 * @openapi
 * /api/products/{id}:
 *   get:
 *     summary: 取得商品詳情
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: 成功 }
 */
```

需登入的端點加 `security: [ { bearerAuth: [] } ]`；購物車這類雙模式端點可再列 `sessionId`。

## 新增功能流程

**新增 API 端點**
1. 在對應的 `src/routes/*.js` 新增 handler；回應必須是 `{ data, error, message }`。
2. 需登入掛 `authMiddleware`；後台再加 `adminMiddleware`。新資源就建立新的 `*Routes.js`，並在 `app.js` 掛載（`/api/admin/*` 要寫在 `/api/<資源>` 之前，目前沒有衝突但請維持）。
3. 寫 `@openapi` 註解，更新 [architecture/api-routes.md](./architecture/api-routes.md) 與 [FEATURES.md](./FEATURES.md)。
4. 在 `test/` 補測試（見 [TESTING.md](./TESTING.md)）。

**新增資料表／欄位**：`src/database.js` 只有 `CREATE TABLE IF NOT EXISTS`，既有的 `database.sqlite` 不會自動加欄位。新增欄位請比照 `src/utils/schemaMigrations.js`（`PRAGMA table_info` 檢查後 `ALTER TABLE ADD COLUMN`，冪等、欄位定義為程式內固定字串）；修改或刪除既有欄位仍沒有遷移機制，需手動處理或刪檔重建。並更新 [architecture/database.md](./architecture/database.md)。

**調整運費**：只改 `src/utils/shipping.js` 的 `SHIPPING_RATES`；前端費率文字來自 `GET /api/shipping/quote` 的 `rates`，只有首頁的「滿額免運」文案需要手動同步。

**新增前端頁面**：在 `pageRoutes.js` 加路由並傳入 `pageScript`；新增 `views/pages/<name>.ejs`（含 `<div id="app">`）與 `public/js/pages/<pageScript>.js`；用到新的 Tailwind class 要重新建置 CSS。

**新增 middleware**：放 `src/middleware/`，`function xxxMiddleware(req, res, next)`，錯誤回應沿用統一格式。

## 安全注意事項
- 一律參數化 SQL；動態欄位名只能來自程式內固定值。
- 不要在回應或日誌輸出 `password_hash`、token、`.env` 內容。
- 輸出使用者內容時用 `{{ }}`／`textContent`；前端目前沒有任何 `innerHTML`／`v-html`，`test/headerInit.test.js` 會檢查 `header-init.js` 不含 `innerHTML`。

## 計畫歸檔流程

1. 建立計畫：複製 docs/plans/_template.md 為 docs/plans/YYYY-MM-DD-<feature-name>.md
2. 計畫文件結構：User Story → Spec → Tasks → 執行結果
3. 開發中：狀態改為「進行中」，完成一項就勾選一項 Tasks
4. 完成後（歸檔前必做）：
   - 填寫「執行結果」：實際變更、與計畫差異、測試結果、遺留事項
   - 狀態改為「已完成」並填完成日期
   - 更新 docs/FEATURES.md 和 docs/CHANGELOG.md
5. 歸檔：`git mv docs/plans/<檔名>.md docs/plans/archive/<檔名>.md`
6. 放棄的計畫：狀態改為「已放棄」並寫明原因，同樣移至 docs/plans/archive/
7. 每份計畫不超過 500 行（目標 100 行內）；過大的功能拆成多份計畫
