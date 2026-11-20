# 測試規範

框架：Vitest 2.1.9（`globals: true`，`describe`／`it`／`expect` 不需 import）+ supertest。執行：`npm test`（`vitest run`）。

## 設定（`vitest.config.js`）

- `fileParallelism: false`：測試檔逐一執行（共用同一個 SQLite 檔案）。
- `sequence.files` 列出了 6 個檔案的順序（auth → products → cart → orders → adminProducts → adminOrders）。**未驗證**：在 Vitest 2.1.9 找不到這個選項的官方依據，不要依賴它保證順序；各檔案目前都是自行建立所需資料，彼此沒有順序依賴。
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
| `getAdminToken()` | 以 `admin@hexschool.com` / `12345678` 登入並回傳 token（**寫死**，改了 `ADMIN_*` 環境變數測試會失敗） |
| `registerUser(overrides?)` | 註冊隨機 email 的新使用者，回傳 `{ token, user }`；可覆寫 `email`、`password`、`name` |

## 撰寫新測試

1. 檔案放 `tests/<資源>.test.js`，開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`。
2. 需要使用者就在 `beforeAll` 呼叫 `registerUser()`（每次產生不重複 email）；需要管理員用 `getAdminToken()`。
3. 驗證統一格式：`expect(res.body).toHaveProperty('error', null)`（成功）或 `toHaveProperty('data', null)` 加 `error` 非 null（失敗）。
4. 需要商品時從 `GET /api/products` 取 `products[0].id`，不要寫死 id（id 為隨機 uuid）。
5. 新檔案若依賴順序，同步在 `vitest.config.js` 的 `sequence.files` 加入。

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

- **沒有資料庫隔離**：`src/database.js` 固定使用專案根目錄的 `database.sqlite`，測試會寫入開發資料（新增使用者、訂單，並扣庫存）。
- **庫存會被持續消耗**：`orders.test.js` 與 `adminOrders.test.js` 每次各下單一件 `products[0]`；多次執行後該商品庫存耗盡，結帳會回 `STOCK_INSUFFICIENT`。停止伺服器後刪除 `database.sqlite*` 重建即可還原。
- **`JWT_SECRET` 必須在 `.env`**：測試直接載入 `app.js`，不經過 `server.js` 的檢查，缺少時註冊或登入會失敗。
- 測試啟動時 Vitest 會設 `NODE_ENV=test`，僅影響管理員 seed 的 bcrypt cost。
- 不要與 `npm start` 同時跑測試：兩者共用同一個 SQLite 檔案。
