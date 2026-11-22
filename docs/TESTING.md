# 測試規範

框架：Vitest 2.1.9（`globals: true`，`describe`／`it`／`expect` 不需 import）+ supertest。執行：`npm test`（`vitest run`）。
測試放在 `test/`（2026-11-22 由 `tests/` 改名；Vitest 預設的 `**/*.test.js` 會自動找到）。單檔執行：`npx vitest run test/<name>.test.js`。

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
| `apiFetch.test.js` | 6 | 前端 `api.js`：登入／註冊 401 不導向、登入過期 401 清除並導向、已在 `/login` 不重複導向、其他錯誤碼 |
| `headerInit.test.js` | 7 | 前端 `header-init.js`：不含 `innerHTML`、名稱含 HTML 只當純文字、管理員連結、登出、徽章 |
| `ecpay.test.js` | 24 | `src/services/ecpay.js`：`ecpayUrlEncode`、CheckMacValue 產生與驗證（含 skill 的官方測試向量）、UTC+8 日期、MerchantTradeNo、ItemName 清理、查詢回應解析 |
| `payments.test.js` | 23 | 綠界付款：checkout（欄位、簽章、權限、重複付款偵測）、verify（paid／金額不符／簽章不符／狀態 0／10200047／10200095／502／冪等／10 秒限流）、`/ecpay/return` 只轉址、模擬付款端點已移除 |
| `orderDetailPage.test.js` | 9 | 前端 `order-detail.js`：隱藏表單、409、verify 結果對應、429、`?payment=checking` 自動查詢、不信任網址參數 |
| `cartMerge.test.js` | 10 | 登入／註冊合併訪客購物車：註冊與登入兩條路徑、同商品相加、庫存上限、庫存 0 丟棄、不調低原數量、無／不同 session 不合併、密碼錯誤不合併、合併失敗不影響登入、合併後可結帳 |
| `checkoutPage.test.js` | 10 | 前端 `checkout.js`：預填登入帳號的姓名與 Email、地址空白、取不到資料時為空字串、可自行修改、清空後仍驗證；配送選項預設值、載入後與切換時呼叫試算 API、試算失敗不阻擋送出、只採用最後一次試算、超商取貨的門市提示 |
| `shipping.test.js` | 22 | `src/utils/shipping.js` 單元測試：宅配 120、超商 60、小計 1,499／1,500、偏遠 +200、急件 +250、多項附加費（宅配 570／超商 510）、滿額免運＋附加費（450）、超商滿額不免、預設值、整數、選項與小計驗證、費率表 |
| `shippingQuote.test.js` | 13 | `GET /api/shipping/quote`：明細與費率表、預設值、查詢字串布林、各種 400（缺／負數／小數／過大 subtotal、未知配送方式、非布林、重複參數） |
| `orderShipping.test.js` | 9 | `POST /api/orders` 運費整合：預設宅配、超商＋偏遠＋急件、滿額免運＋急件、忽略 body 夾帶的金額、配送選項 400 且購物車保留、詳情的運費快照與總額等式 |
| `schemaMigrations.test.js` | 4 | `addOrderShippingColumns`：舊 schema 補欄位與回填、冪等、CHECK 約束、app 資料庫已有欄位 |

`apiFetch.test.js`、`headerInit.test.js`、`orderDetailPage.test.js`、`checkoutPage.test.js` 是前端測試：不使用 `test/setup.js`，改用 Node `vm` 載入 `public/js/**/*.js` 並注入假的 `Auth`／`fetch`／`document`／`Vue`，不需要資料庫。它們驗證邏輯，不等於瀏覽器實機驗證。

**綠界一律 mock**：`payments.test.js` 以 `vi.stubGlobal('fetch', ...)` 取代 `fetch`，回傳含正確 CheckMacValue 的 URL-encoded 字串（格式依 2026-11-21 對測試環境的實測），測試不會連線綠界。`ecpay.test.js` 的官方向量來自 `.claude/skills/ecpay/test-vectors/checkmacvalue.json`（git submodule，不複製進本專案），不存在時略過。`vitest.config.js` 的 `test.env` 提供綠界測試帳號與 `BASE_URL`。

尚未涵蓋：註冊與商品欄位驗證錯誤、`STOCK_INSUFFICIENT`、購物車登入模式的改／刪、頁面路由（`/ecpay/return` 除外）、`errorHandler`。真實綠界：已由使用者實機驗證網路 ATM（`WebATM_LAND`）付款成功，**信用卡與離線付款（ATM 虛擬帳號／超商／條碼）尚未實測**，見 [features/payment-ecpay.md](./features/payment-ecpay.md)。

`shipping.test.js` 是純單元測試，`schemaMigrations.test.js` 另建獨立的 `new Database(':memory:')` 模擬舊 schema；兩者都不需要 `test/setup.js`。

## 輔助函式（`test/setup.js`）

| 匯出 | 說明 |
|------|------|
| `app` | `require('../app')`，供 supertest 使用 |
| `request` | supertest |
| `getAdminToken()` | 以 `admin@hexschool.com` / `12345678` 登入並回傳 token（帳密寫死，需與 `vitest.config.js` 的 `test.env.ADMIN_*` 一致，改一處要同步另一處） |
| `registerUser(overrides?)` | 註冊隨機 email 的新使用者，回傳 `{ token, user }`；可覆寫 `email`、`password`、`name` |

## 撰寫新測試

1. 檔案放 `test/<資源>.test.js`，開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`。
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
- **安全閥**：`test/setup.js` 檢查 `db.memory`，不是記憶體資料庫就丟錯中止。不要移除；改 `vitest.config.js` 時不要拿掉 `DB_PATH`。
- 測試可以與 `npm start` 同時執行，也不需要 `.env`（已實測：他處持有開發資料庫寫入鎖、副本沒有 `.env` 時仍全數通過）。
- 測試啟動時 Vitest 會設 `NODE_ENV=test`，僅影響管理員 seed 的 bcrypt cost；註冊仍固定 cost 10，所以註冊相關測試較慢。
- 想手動檢查資料時，`npm test` 結束後記憶體資料庫就消失了；需要檢視請在測試中印出內容，不要改用實體資料庫。
