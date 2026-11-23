# 完整測試流程：Integration、E2E（綠界網路 ATM）與 Postman

- 狀態：已完成
- 建立日期：2026-11-23 ／ 完成日期：2026-11-23
- 相關連結：[TESTING.md](../../TESTING.md)、[features/shipping.md](../../features/shipping.md)、[features/payment-ecpay.md](../../features/payment-ecpay.md)

## User Story
身為開發者，我想要一組指令分別驗證單元邏輯、後端 API 與資料庫寫入、瀏覽器實際購買與綠界付款流程，並能把 API 匯入 Postman 手動測試，以便每次修改後確認整條購物流程沒有壞掉。

## Spec
- **目錄**：`test/unit/`（純邏輯與前端 vm 測試）、`test/integration/`（supertest + 記憶體 SQLite）、`test/e2e/`（Playwright）。Vitest 只收 unit 與 integration，排除 e2e。
- **Integration**（`npm run test:integration`）：`DB_PATH=:memory:`，不碰 `database.sqlite`；新增 `test/integration/checkoutFlow.test.js`，每個測試在 `beforeEach` 建立自己的會員並記錄庫存快照，`afterEach` 刪除該會員的訂單、訂單品項、付款、購物車與帳號並還原庫存，再確認沒有殘留。驗證：狀態碼與回應格式、`orders`／`order_items` 寫入、運費與總額、庫存扣除、購物車清空；失敗情境（配送選項不合法、庫存不足、空購物車、未登入、交易中途失敗）不留下訂單、不扣庫存、購物車保留。
- **E2E**（`npm run test:e2e`）：Playwright 直接測已啟動的 `http://localhost:3001`（不設定 `webServer`），使用系統 Google Chrome（`channel: 'chrome'`）。以 `admin@hexschool.com` 登入 → 加入商品 → 結帳選配送方式 → 建立訂單 → 綠界測試環境選「網路 ATM」→「台灣土地銀行」→ 前往付款 → 關閉提示視窗 → 土地銀行測試頁按 `Save` → 等待付款成功 → 返回商店 → 驗證畫面「已付款」與 API `status === 'paid'`，並存成功截圖。伺服器沒啟動時明確提示。
- **Postman**（`npm run postman`）：`npm run openapi` 產生最新 `openapi.json`，再以 `openapi-to-postmanv2` 轉成 `postman/flower-life.postman_collection.json`（提交進 git）。後處理：`{{baseUrl}}`（預設 `http://localhost:3001`）、`token`、`sessionId` 變數；collection 層級 Bearer `{{token}}`，公開端點設 `noauth`；登入／註冊成功自動存 `token`；購物車帶 `X-Session-Id: {{sessionId}}`（空的時自動產生）；輸出後驗證 JSON 與結構。
- **指令**：`test:unit`、`test:integration`、`test:e2e`、`postman`；`npm test` 維持執行 unit＋integration。
- 測試產物（影片、截圖、Trace、報告）輸出到已被 `.gitignore` 的 `test-results/`、`playwright-report/`。

## Tasks
- [x] 1. 安裝 `@playwright/test`、`openapi-to-postmanv2`（固定版本、發布滿兩週）
- [x] 2. 測試分成 `test/unit`、`test/integration`、`test/e2e`；更新 `vitest.config.js` 與 require 路徑
- [x] 3. `test/integration/checkoutFlow.test.js`（含每個測試的建立與清除）
- [x] 4. `playwright.config.js` 與 `test/e2e/ecpay-webatm.spec.js`；以已啟動的伺服器實跑通過並取得成功截圖
- [x] 5. `scripts/generate-postman.js` 與 `postman/flower-life.postman_collection.json`；`test/unit/postmanCollection.test.js`
- [x] 6. `package.json` 指令，逐一執行確認
- [x] 7. 文件：TESTING、README、DEVELOPMENT、ARCHITECTURE、CHANGELOG、CLAUDE.md、`.claude/rules/testing.md`、`.claude/agents/test-runner.md`

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：`test/` 分成 `unit`／`integration`／`e2e`；新增 `test/integration/checkoutFlow.test.js`、`testData.js`、`test/unit/postmanCollection.test.js`、`test/e2e/ecpay-webatm.spec.js`、`playwright.config.js`、`scripts/generate-postman.js`、`postman/flower-life.postman_collection.json`；`package.json` 新增四個指令與 devDependencies `@playwright/test@1.65.0`、`openapi-to-postmanv2@6.4.2`（固定版本，皆發布滿兩週）；`vitest.config.js` 加 include／exclude。
- 與計畫差異：
  - 綠界付款完成後實測**自動以 OrderResultURL 返回商店**，只顯示約 5 秒「交易資料傳輸中…」，沒有「付款成功／返回商店」頁。第 12、13 步改為兩種情況都支援（有按鈕就點；自動返回則確認經過 `POST /ecpay/return`）。本專案仍保留 `OrderResultURL`，因為回站後才能自動查詢付款結果。
  - 綠界頁面選擇器依實測 DOM 改用 `#liWebATM`、`#selWebATMBank`、`#WebATMPaySubmit`、`#btnClose`，且先篩可見元素；導覽只等 `commit`（綠界頁面的 `load` 事件等不到）。
  - Postman 不輸出 converter 以亂數產生的範例回應，否則每次產生的內容都不同。
  - Postman Collection 原規劃提交進 git，使用者之後改為列入 `.gitignore`（`/postman/`，不提交）；`postmanCollection.test.js` 改為由目前路由在記憶體產生 collection 檢查，不再比對檔案。
  - E2E 在 Claude Code sandbox 內無法執行（Chrome 需要 Unix socket，也連不到本機伺服器），經使用者要求後於 sandbox 外執行。
- 測試結果：`npm run test:unit` 8 檔 89 個、`npm run test:integration` 11 檔 96 個全數通過；integration 前後 `database.sqlite`（含 -wal／-shm）雜湊值相同。`npm run test:e2e` 通過（23 秒，訂單 ORD-20261123-20B66，NT$ 1,260＝890＋120＋250，`paid`），成功截圖 `test-results/ecpay-webatm-paid.png`。`npm run postman` 產生 21 個請求的有效 collection，重複產生內容相同。
- 文件更新：TESTING.md（改寫）、新增 testing/e2e.md、testing/postman.md；README、CLAUDE.md、ARCHITECTURE、DEVELOPMENT、features/frontend、features/payment-ecpay（E2E 實測）、CHANGELOG、`.claude/rules/testing.md`、`.claude/agents/test-runner.md`。
- 遺留事項：
  - 調整選擇器期間有 2 次執行在建立訂單後、付款前失敗，開發資料庫留下 2 筆管理員的 `pending` 訂單（ORD-20261123-E60AE、ORD-20261123-7EFC4），另有 1 次在第 13 步失敗但訂單已付款（2A9FB）。4 次執行共扣「季節鮮花訂閱（月配）」4 件庫存。專案沒有取消訂單功能，未刪除。
  - E2E 只涵蓋網路 ATM；信用卡與離線付款仍未驗證。
