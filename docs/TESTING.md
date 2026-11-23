# 測試規範

| 指令 | 範圍 | 工具 | 需要 |
|------|------|------|------|
| `npm run test:unit` | `test/unit/`：純邏輯、前端腳本（Node `vm`）、Postman Collection 檢查 | Vitest | 無 |
| `npm run test:integration` | `test/integration/`：API＋記憶體 SQLite | Vitest＋supertest | 無（不需 `.env`、不碰 `database.sqlite`） |
| `npm test` | unit＋integration | Vitest | 無 |
| `npm run test:e2e` | `test/e2e/`：瀏覽器＋綠界測試環境 | Playwright | **先 `npm start`**、系統 Google Chrome、網路，見 [testing/e2e.md](./testing/e2e.md) |
| `npm run postman` | 產生 `openapi.json` 與 Postman Collection | openapi-to-postmanv2 | 無，見 [testing/postman.md](./testing/postman.md) |

單檔：`npx vitest run test/unit/shipping.test.js`。Vitest 2.1.9（`globals: true`，不需 import `describe`／`it`／`expect`）。

## CI（GitHub Actions）
`.github/workflows/test.yml`：push 任何分支、對 `main` 的 pull request、手動觸發時，在 `ubuntu-latest`＋Node 24 執行 `npm ci` →「Unit Test」`npm run test:unit` →「Integration Test」`npm run test:integration`。不跑 E2E、不啟動伺服器、不需要 `.env` 或 secrets（`permissions: contents: read`）。
- checkout 會一併取得 submodule `.claude/skills/ecpay`；沒有它時 `ecpay.test.js` 會略過 7 個綠界官方向量測試（本機 89 個、少 submodule 時 82 個）。
- Node 版本受 `better-sqlite3` 12.8.0 限制（20～25，Node 26 沒有預編譯檔），升級 Node 前先升級它。
- 因此 unit／integration 測試不可依賴 `.env`、已啟動的伺服器、`database.sqlite` 或未提交的檔案（如 `openapi.json`、`postman/`）。

## Vitest 設定（`vitest.config.js`）
- `include` 只有 `test/unit/**`、`test/integration/**`；`test/e2e/**` 被排除（Playwright 的 `.spec.js` 不能被 Vitest 執行）。
- `env`：`DB_PATH=:memory:`、測試用 `JWT_SECRET`、`ADMIN_EMAIL`／`ADMIN_PASSWORD`、綠界公開測試帳號與 `BASE_URL`。`dotenv` 不覆寫既有環境變數，所以這些值優先於 `.env`。
- `fileParallelism: false`；`sequence.files` **實測沒有生效**，不要依賴執行順序；`hookTimeout: 10000`。

## 測試檔案
**unit（82＋7）**：`shipping`（22，運費規則與邊界 1,499／1,500）、`ecpay`（24，CheckMacValue、官方向量、日期、查詢解析）、`schemaMigrations`（4，舊 schema 補欄位與回填）、`postmanCollection`（7，由目前路由在記憶體產生 collection，檢查變數、驗證、存 token、`X-Session-Id`、請求數與輸出穩定）、前端 `apiFetch`（6）、`headerInit`（7）、`checkoutPage`（10）、`orderDetailPage`（9）。前端測試以 Node `vm` 載入 `public/js/**` 並注入假的 `Auth`／`fetch`／`document`／`Vue`，驗證邏輯但不等於瀏覽器實測。

**integration（96）**：

| 檔案 | 測試數 | 涵蓋 |
|------|--------|------|
| `checkoutFlow.test.js` | 9 | 完整結帳：會員註冊＋登入 → 商品 → 購物車 → 含配送資訊的訂單；檢查回應格式、`orders`／`order_items` 寫入、運費與總額、庫存扣除、購物車清空；失敗（配送選項、收件資訊、庫存不足、空購物車、未登入、交易中途失敗）不留訂單、不扣庫存、購物車保留 |
| `orders.test.js`／`orderShipping.test.js` | 6／9 | 訂單 CRUD 與 401／404；運費整合、忽略 body 金額 |
| `cart.test.js`／`cartMerge.test.js` | 6／10 | 訪客與登入購物車；登入／註冊合併訪客購物車 |
| `payments.test.js` | 23 | 綠界 checkout／verify（mock `fetch`）、限流、`/ecpay/return` |
| `auth`／`products`／`shippingQuote`／`adminProducts`／`adminOrders` | 6／4／13／6／4 | 各端點成功、400、401／403、404 |

**綠界在 Vitest 一律 mock**（`vi.stubGlobal('fetch', ...)`），不會連線；官方向量來自 git submodule `.claude/skills/ecpay`，不存在時略過。真實綠界流程由 E2E 驗證。

## 資料隔離（integration）
- **資料庫**：每個測試檔各自載入全新的記憶體 SQLite（含 seed 管理員與 8 項商品），檔案結束即消失；`test/integration/setup.js` 的安全閥檢查 `db.memory`，不是記憶體資料庫就中止。不要移除 `DB_PATH`。
- **每個測試自建自清**（`test/integration/testData.js`）：`beforeEach` 記錄庫存快照並 `createMember()`（註冊＋登入）；`afterEach` 以 `deleteMemberData()` 在單一交易內刪除該會員的付款、訂單品項、訂單、購物車與帳號，`restoreStock()` 還原庫存，並確認沒有殘留；`afterAll` 確認各表筆數與庫存回到檔案開始前。
- 交易中途失敗以暫時的 SQLite trigger 模擬（測試內建立、`finally` 移除），驗證整筆回滾。
- 同一個檔案內的其他舊測試共用資料庫、靠檔案結束時丟棄記憶體資料庫清除；新測試請比照 `checkoutFlow.test.js` 自建自清。

## 輔助函式
| 檔案 | 匯出 |
|------|------|
| `test/integration/setup.js` | `app`、`request`（supertest）、`getAdminToken()`（帳密需與 `test.env.ADMIN_*` 一致）、`registerUser(overrides?)` |
| `test/integration/testData.js` | `db`、`createMember()`、`countRows()`、`snapshotStock()`／`restoreStock()`、`deleteMemberData(userId)`、`memberRowCounts(userId)` |

## 撰寫新測試
1. 純邏輯放 `test/unit/<名稱>.test.js`，直接 `require('../../src/...')`；API 放 `test/integration/<資源>.test.js`，開頭 `require('./setup')`。
2. 成功斷言 `error: null`；失敗斷言 `data: null` 且 `error` 不為 null，並檢查狀態碼。
3. 商品 id 從 `GET /api/products` 取得，不寫死；要檢查寫入結果時可直接查 `db`。
4. Postman Collection（`postman/`）不提交；`postmanCollection.test.js` 直接由路由的 `@openapi` 註解產生並檢查，新增路由不需另外執行 `npm run postman`。

## 常見陷阱
- 測試可與 `npm start` 同時執行（unit／integration 不碰開發資料庫）；**E2E 則會在開發資料庫建立真實訂單**。
- Vitest 會設 `NODE_ENV=test`，只影響管理員 seed 的 bcrypt cost；註冊固定 cost 10，註冊相關測試較慢。
- 測試產物（`test-results/`、`playwright-report/`，含影片、截圖、Trace）與產生的 `openapi.json`、`postman/` 都已列入 `.gitignore`。
