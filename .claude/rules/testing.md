---
paths:
  - "test/**"
  - "vitest.config.js"
  - "playwright.config.js"
  - "scripts/generate-postman.js"
  - ".github/workflows/**"
---

# 測試規則（Vitest + supertest + Playwright）

- 位置（資料夾是 `test/`，不是 `tests/`）：純邏輯與前端 vm 測試放 `test/unit/`；API 測試放 `test/integration/<資源>.test.js`，開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`；瀏覽器測試放 `test/e2e/*.spec.js`（Playwright，Vitest 已排除）。`globals: true`，不需 import `describe`／`it`／`expect`。
- 指令：`npm run test:unit`、`npm run test:integration`、`npm test`（兩者）、`npm run test:e2e`（需先 `npm start`，會在開發資料庫建立真實訂單）。
- 新的 integration 測試要自建自清：比照 `test/integration/checkoutFlow.test.js`，用 `testData.js` 的 `createMember()`、`snapshotStock()`，在 `afterEach` 以 `deleteMemberData()`、`restoreStock()` 清除並確認沒有殘留。
- CI（`.github/workflows/test.yml`）以 Node 24 執行 `npm ci`、`test:unit`、`test:integration`，checkout 含 submodule；unit／integration 不可依賴 `.env`、已啟動的伺服器、`database.sqlite` 或未提交的檔案。CI 不跑 E2E。改 Node 版本前確認 `better-sqlite3` 有該版本的預編譯檔。
- E2E 不可設定 `webServer`、不可另外啟動伺服器；綠界頁面的選擇器用文字比對並搜尋所有分頁／iframe。
- `npm run postman` 產生的 `postman/` 已列入 `.gitignore`，不提交；`test/unit/postmanCollection.test.js` 直接由路由的 `@openapi` 註解在記憶體產生 collection 檢查，不讀該檔。
- 需要使用者用 `registerUser()`（隨機 email）；需要管理員用 `getAdminToken()`（寫死 `admin@hexschool.com`／`12345678`）。
- 商品 id 從 `GET /api/products` 取得，不寫死。
- 成功斷言 `error` 為 `null`；失敗斷言 `data` 為 `null` 且 `error` 不為 `null`；同時檢查 HTTP 狀態碼。
- 每個測試檔自行準備資料，不依賴其他檔案；`sequence.files` 實測沒有生效，不要依賴執行順序。
- 測試使用記憶體資料庫（`vitest.config.js` 的 `test.env.DB_PATH=:memory:`），每個測試檔各有一份全新資料（含 seed）。不要移除該設定；`test/integration/setup.js` 的 `db.memory` 安全閥會在連到實體資料庫時中止測試。同一檔案內的測試共用資料庫，會看到彼此的資料。
- `getAdminToken()` 的帳密需與 `test.env.ADMIN_EMAIL`／`ADMIN_PASSWORD` 一致。
- 新增端點時至少補：成功案例、驗證失敗（400）、未授權（401）／權限不足（403）、不存在（404）。
- 純邏輯模組（`src/utils/*.js`，如 `shipping.js`）寫單元測試，直接 `require` 模組，不需要 `setup.js`；邊界值（如免運門檻 1,499／1,500）要明確列出。
- 完整說明見 docs/TESTING.md。
