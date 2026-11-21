# 串接綠界 ECPay 金流（以主動查詢驗證付款）

- 狀態：已完成
- 建立日期：2026-11-21 ／ 完成日期：2026-11-21
- 相關連結：`.claude/skills/ecpay`（guides/01、13、24）、官方 QueryTradeInfo https://developers.ecpay.com.tw/2890.md、docs/features/orders.md

## 背景
- 目前付款是模擬：`PATCH /api/orders/:id/pay` 讓任何登入者把自己的 pending 訂單改成 paid／failed。`.env.example` 已有 `ECPAY_*`、`BASE_URL`，程式未使用。
- 專案只在本機執行，綠界無法呼叫 ReturnURL（Server Notify）。因此付款結果一律由本機**主動呼叫 QueryTradeInfo 驗證**，不信任瀏覽器帶回的任何付款結果。

## User Story
身為消費者，我想要在綠界付完款後回到訂單頁看到經過驗證的結果；身為店家，我想要訂單只在綠界確認已付款且金額相符時才變成已付款。

## Spec
### 流程
1. 訂單頁按「前往綠界付款」→ `POST /api/orders/:id/ecpay/checkout`（Bearer）→ 回傳 `{ action, method, fields }`；前端用 `createElement` 建隱藏表單 POST 到綠界（全頁跳轉，不用 iframe、不用 innerHTML）。
2. 消費者在綠界付款，`ChoosePayment=ALL`（使用者決定）。
3. 回站：`OrderResultURL`（瀏覽器 POST `/ecpay/return`）只用 `MerchantTradeNo` 查出訂單 id，303 轉到 `/orders/:id?payment=checking`，**不改任何狀態**；`ClientBackURL` 回 `/orders/:id`（離線付款與取消走這條）。
4. 訂單頁在 `payment=checking` 時自動呼叫 `POST /api/orders/:id/ecpay/verify`，也可按「重新查詢付款結果」。
5. **Server 呼叫 QueryTradeInfo API 進行驗證 → 更新訂單狀態**（取代 Server Notify，是唯一能讓訂單變成 paid 的路徑）：verify 端點由後端以 `MerchantID`＋`MerchantTradeNo`＋`TimeStamp`＋`CheckMacValue` 呼叫 `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5`，依下方「驗證規則」判斷後，才更新 `payments` 與 `orders.status`，再把結果回給前端顯示。

### 驗證規則（verify：全部成立才 paid）
- 回應 CheckMacValue 以 timing-safe 比對通過；`MerchantTradeNo` 與本地一致；`Number(TradeAmt) === total_amount`；`TradeStatus === '1'`。
- 單一 `db.transaction` 同時更新 `payments` 與 `orders`；訂單已 paid 則直接回傳（冪等）。
- `TradeStatus='0'` → 維持 pending，回「尚未確認」；`10200095` → 該筆交易標 failed、訂單仍 pending 可重付；查詢失敗或 CMV 不符 → 502 `PAYMENT_QUERY_FAILED`，不改狀態。
- 同一筆交易兩次查詢至少間隔 10 秒（`last_checked_at`），否則 429；綠界頻率過高會回 403 並封鎖 30 分鐘。

### 資料與設定
- 新表 `payments`：id、order_id(FK)、merchant_trade_no(UNIQUE)、amount、status(created|paid|failed)、ecpay_trade_no、trade_status、payment_type、paid_at、last_checked_at、created_at。用 `CREATE TABLE IF NOT EXISTS`（專案沒有遷移機制）；`orders.status` 不動。
- `MerchantTradeNo` 每次嘗試重新產生（綠界要求永久唯一、≤20 英數）：`P` + UTC+8 `yyMMddHHmmss` + 5 碼隨機＝18 字。
- 建新交易前，先查該訂單最近 3 筆 created 的舊交易；已付款就標 paid 並回 409，避免重複付款。
- 欄位：`MerchantTradeDate` 以 UTC+8 產生 `yyyy/MM/dd HH:mm:ss`；`ItemName` 以 `#` 串接商品名、去除 `#<>` 與控制字元、截 200 字；`TradeDesc` 固定；`EncryptType=1`。
- 環境變數沿用 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`（staging→`payment-stage.ecpay.com.tw`）、`BASE_URL`；新增 `ECPAY_RETURN_URL`（必填欄位，預設 `${BASE_URL}/api/ecpay/notify`，本機收不到屬預期，不實作該端點）。金鑰只讀環境變數。
- 新增 `src/services/ecpay.js`（`ecpayUrlEncode`、`generateCheckMacValue`、`verifyCheckMacValue` 依 skill guides/13 Node.js 版；`buildCheckoutFields`；`queryTradeInfo` 用內建 `fetch`，逾時 10 秒）與 `src/routes/ecpayRoutes.js`。
- **移除** `PATCH /api/orders/:id/pay`、前端「付款成功／失敗」按鈕與 `simulatePay`（使用者決定）。
- 非目標：接收 ReturnURL、離線付款取號資訊、退款（DoAction）、對帳檔、發票、定期定額。

### 已知限制（需寫入文件）
- `ALL` 含 ATM／超商／條碼：官方要求離線付款「等待綠界通知」，查詢 API 能否反映這類付款文件未證實，訂單可能長時間停在 pending；這類方式不支援 `OrderResultURL`。
- 信用卡建議付款後約 10 分鐘再查，銀行未回覆時 TradeStatus 仍為 0。
- 官方頁面**未說明**查詢回應格式（URL-encoded 或 JSON）與「查無訂單」的回應；skill 內 `10200047` 說明互相矛盾（guides/01 稱不存在、guides/20 稱重複）。以 Task 0 驗證，解析器先同時支援兩種格式。

## Tasks
- [x] 0. Spike（staging，帳號 3002607）：確認 ① 綠界是否接受 `http://localhost:3001` 的 `OrderResultURL`／`ReturnURL`（skill 稱僅支援 80/443、要 https）② 查詢回應格式 ③ 查無訂單的回應 ④ 信用卡付款後多久查得到 `TradeStatus=1` ⑤ ATM 模擬付款後查詢是否為 1。結果寫入「與計畫差異」並視需要修訂 Spec。**（②③ 以 API 實測；①④ 已由使用者實機確認；⑤ 未驗證，見執行結果）**
- [x] 1. 先寫 `tests/ecpay.test.js`：CheckMacValue 向量（讀 skill 的 `test-vectors/checkmacvalue.json`，不存在則 skip，不複製第三方檔案）。
- [x] 2. 實作 `src/services/ecpay.js`。
- [x] 3. `src/database.js` 新增 `payments`；`.env.example`、`vitest.config.js` 補 ECPAY／`BASE_URL` 測試值。
- [x] 4. 先寫 `tests/payments.test.js`（mock `global.fetch`，不連網）：checkout 欄位與簽章、非本人 404、非 pending 400、verify 成功／金額不符／CMV 不符／狀態 0／10200095／502／冪等／10 秒限流／重複付款偵測、`/ecpay/return` 只轉址不改狀態。
- [x] 5. 實作路由並掛載於 `app.js`；刪除 `PATCH /:id/pay` 與其 `@openapi`。
- [x] 6. 前端 `order-detail.ejs`、`order-detail.js`：付款按鈕、重新查詢、`checking` 狀態與橫幅；表單以 DOM API 建立。
- [x] 7. 實機驗收（staging，由使用者在瀏覽器完成）：實測的是網路 ATM（`WebATM_LAND`）；信用卡（測試卡 `4311-9522-2222-2222`）與離線付款（ATM 虛擬帳號／超商／條碼）未實測。
- [x] 8. 文件與規則：docs（ARCHITECTURE、api-routes、database、DEVELOPMENT 環境變數、features/orders、TESTING、CHANGELOG）、新增 `docs/features/payment-ecpay.md`、`.claude/rules`（api-design、security）、CLAUDE.md 關鍵規則「訂單只能由綠界查詢驗證後變成 paid」；`.claude/skills/ecpay` 以 git submodule 引用（授權為 All Rights Reserved、禁止重新散布，不複製內容）。
- [x] 9. 填寫「執行結果」，`git mv` 至 `docs/plans/archive/`。

## 驗證
- `npm test` 全過（記憶體資料庫、mock 綠界）；`grep` 確認已無 `/pay` 模擬端點與 `simulatePay`；開發資料庫 `database.sqlite` 與基準相同。
- staging 實機：付款成功→回站→自動驗證變 paid；中途取消→維持 pending 且可重新付款；手動竄改金額的表單不會變 paid。

## 風險
- 綠界不接受本機 URL：以 Task 0 結果決定改用 `ClientBackURL`（消費者手動按「返回商店」）或調整 `ECPAY_RETURN_URL`。
- 自動化測試無法連線綠界，實機結果需人工記錄；刪除模擬付款後沒有離線展示的替代方案（使用者已決定）。

## 執行結果（完成後填寫，歸檔前必填）
（使用者於 2026-11-21 實機驗收後完成並歸檔。）
- 實際變更：新增 `src/services/ecpay.js`、`src/routes/ecpayRoutes.js`、`payments` 表、`POST /ecpay/return`；移除 `PATCH /api/orders/:id/pay` 與前端模擬付款；`order-detail` 頁改為綠界付款並不再信任 `?payment=`；`.gitmodules`（submodule）、`.env.example`、`vitest.config.js` 更新。
- 與計畫差異：
  - Spike 實測（2026-11-21，測試帳號）：查詢回應為 HTTP 200／`text/html`／URL-encoded；查無訂單 `TradeStatus=10200047`；建單後未付款為 `0`；錯誤簽章為 HTTP 500＋`10200073`；我的 CheckMacValue 被綠界接受。建單的付款頁在 `http://localhost:3001` 回傳網址下能顯示，但錯誤簽章也能顯示，所以建單簽章是否被檢查未知。
  - 新增：`buildItemName` 另外移除 `& + % =`（避免 URL-encoded 回應解析後與簽章不一致）；`queryTradeInfo` 對非 2xx 也帶出 `TradeStatus`；新增 `tests/orderDetailPage.test.js`（9 個）。
  - 原計畫把 skill 加入 `.gitignore`；使用者改為以 git submodule 納入（綠界授權禁止重新散布其內容，所以只記錄指標）。
  - 實機確認（使用者回報，並以開發資料庫紀錄佐證）：① 綠界會導回 `http://localhost:3001` 的 `OrderResultURL`；④ 網路 ATM 付款後約 10 秒內即查得到 `TradeStatus=1`。
  - 修正敘述：checkout 的舊交易檢查也會經 `checkAttempt` 設定 `paid`，並非「只有 verify」。
- 測試結果：`npm test` 全過（含 `ecpay`、`payments`、`orderDetailPage`，綠界一律 mock）；對真實綠界測試環境用暫存資料庫與真實伺服器跑過 checkout→付款頁→verify（pending）→限流 429→`/ecpay/return` 303→`?payment=` 跳脫，皆符合預期；開發資料庫未被改動。
  - 實機：以網路 ATM 付款後自動導回訂單頁、自動查詢即變 `paid`。開發資料庫的 `payments`：`status=paid`、`trade_status=1`、`payment_type=WebATM_LAND`、金額 1280 與訂單相符；付款（18:42:34）後約 10 秒完成驗證。
- 文件更新：新增 `docs/features/payment-ecpay.md`；更新 ARCHITECTURE、api-routes、database、DEVELOPMENT、FEATURES、README、orders、frontend、TESTING、CHANGELOG、CLAUDE.md、`.claude/rules`（api-design、security）與三個 agents。
- 遺留事項：
  - 未實測：信用卡（含 3D 驗證）的付款成功回應與時間；離線付款（ATM 虛擬帳號／超商代碼／條碼）付款後查詢是否為 `1`。`WebATM_LAND` 是即時付款，不能代表離線方式；`ChoosePayment=ALL` 下離線付款的訂單可能長時間停在 pending。
  - 失敗的付款不還原庫存；無退款、對帳、發票。
