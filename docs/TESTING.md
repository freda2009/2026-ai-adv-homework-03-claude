# 測試規範

框架：Vitest 2.1.9（`globals: true`，`describe`／`it`／`expect` 不需 import）+ supertest。執行：`npm test`（`vitest run`）。

## 設定（`vitest.config.js`）

- `env`：`DB_PATH=:memory:`、`JWT_SECRET`（測試用固定值）、`ADMIN_EMAIL`／`ADMIN_PASSWORD`（`admin@hexschool.com`／`12345678`）。測試因此不依賴 `.env`，也不會碰 `database.sqlite`。`dotenv` 不覆寫既有環境變數，所以這些值優先於 `.env`。
- `fileParallelism: false`：測試檔逐一執行。
- `sequence.files` 列出了 6 個檔案的順序，但**實測沒有生效**（一次實測的順序為 orders → cart → adminProducts → auth → adminOrders → products）。各檔案都自行建立所需資料，沒有順序依賴，請不要依賴這個設定。
- `hookTimeout: 10000`。

## 測試檔案

| 檔案 | 測試數 | 涵蓋 |
|------|--------|------|
| `auth.test.js` | 6 | 註冊成功／Email 重複 409、登入成功／密碼錯 401、profile 有無 token |
| `products.test.js` | 4 | 列表、分頁、詳情、不存在 404 |
| `cart.test.js` | 6 | 訪客新增／查看／改數量／刪除、登入者新增、不存在商品 404 |
| `orders.test.js` | 6 | 建立訂單、空購物車 400、未登入 401、列表、詳情、不存在 404 |
| `adminProducts.test.js` | 6 | 列表、新增、更新、刪除（並確認 404）、一般使用者 403、無 token 401 |
| `adminOrders.test.js` | 4 | 列表、`status` 篩選、詳情、一般使用者 403 |

尚未涵蓋：`PATCH /api/orders/:id/pay`、註冊與商品欄位驗證錯誤、`STOCK_INSUFFICIENT`、購物車登入模式的改／刪、頁面路由、`errorHandler`。

## 輔助函式（`tests/setup.js`）

| 匯出 | 說明 |
|------|------|
| `app` | `require('../app')`，供 supertest 使用 |
| `request` | supertest |
| `getAdminToken()` | 以 `admin@hexschool.com` / `12345678` 登入並回傳 token（帳密寫死，需與 `vitest.config.js` 的 `test.env.ADMIN_*` 一致，改一處要同步另一處） |
| `registerUser(overrides?)` | 註冊隨機 email 的新使用者，回傳 `{ token, user }`；可覆寫 `email`、`password`、`name` |

## 撰寫新測試

1. 檔案放 `tests/<資源>.test.js`，開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`。
2. 需要使用者就在 `beforeAll` 呼叫 `registerUser()`（每次產生不重複 email）；需要管理員用 `getAdminToken()`。
3. 驗證統一格式：`expect(res.body).toHaveProperty('error', null)`（成功）或 `toHaveProperty('data', null)` 加 `error` 非 null（失敗）。
4. 需要商品時從 `GET /api/products` 取 `products[0].id`，不要寫死 id（id 為隨機 uuid）。
5. 測試檔彼此獨立（各有自己的資料庫），不需要設定執行順序；不要寫依賴其他檔案資料的測試。

```js
it('should return 404 for unknown order', async () => {
  const res = await request(app)
    .get('/api/orders/non-existent')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
  expect(res.body).toHaveProperty('data', null);
});
```

## 常見陷阱

- **資料庫是每個測試檔各自獨立的記憶體資料庫**：每個檔案載入全新的 `app` 與資料庫（含 seed 的管理員與 8 項商品），庫存不會跨檔案或跨次執行累積（已實測連跑 10 次皆通過）。**同一個檔案內**的測試共用同一個資料庫，會看到彼此留下的資料。
- **安全閥**：`tests/setup.js` 檢查 `db.memory`，不是記憶體資料庫就丟錯中止。不要移除；改 `vitest.config.js` 時不要拿掉 `DB_PATH`。
- 測試可以與 `npm start` 同時執行，也不需要 `.env`（已實測：他處持有開發資料庫寫入鎖、副本沒有 `.env` 時仍全數通過）。
- 測試啟動時 Vitest 會設 `NODE_ENV=test`，僅影響管理員 seed 的 bcrypt cost；註冊仍固定 cost 10，所以註冊相關測試較慢。
- 想手動檢查資料時，`npm test` 結束後記憶體資料庫就消失了；需要檢視請在測試中印出內容，不要改用實體資料庫。
