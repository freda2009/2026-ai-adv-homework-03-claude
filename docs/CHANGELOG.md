# 更新日誌

格式：新的在上。每項功能完成並歸檔計畫時，在此新增一筆，並連結到 `plans/archive/` 的計畫。

## 2026-11-21

### 新功能：綠界 ECPay 付款
- 新增 `src/services/ecpay.js`（CheckMacValue、付款表單欄位、QueryTradeInfo 查詢）與 `src/routes/ecpayRoutes.js`：`POST /api/orders/:id/ecpay/checkout` 建立付款、`POST /api/orders/:id/ecpay/verify` 由後端主動查詢綠界並在驗證通過後把訂單改為 `paid`（取代本機收不到的 Server Notify）。
- 新增 `payments` 資料表（付款嘗試）；新增 `POST /ecpay/return`（只轉址、不改狀態）。
- **移除**模擬付款端點 `PATCH /api/orders/:id/pay` 與前端「付款成功／失敗」按鈕：原本任何登入者都能把自己的訂單直接改成已付款。
- 訂單詳情頁改為「前往綠界付款」與「重新查詢付款結果」，且不再信任網址的 `?payment=` 顯示成功。
- 新增 `.env.example` 的 `ECPAY_RETURN_URL`、`DB_PATH` 說明；綠界 ECPay skill 以 git submodule 引用到 `.claude/skills/ecpay`（授權為 All Rights Reserved、禁止重新散布，所以只記錄指標、不複製內容）。
- 測試 +56（`ecpay` 24、`payments` 23、`orderDetailPage` 9），總計 101 個，綠界一律 mock。
- 使用者實機驗證網路 ATM（`WebATM_LAND`）付款成功：自動導回 localhost、自動查詢即變 `paid`；信用卡與離線付款尚未實測。實測結果見 [features/payment-ecpay.md](./features/payment-ecpay.md)。
- 計畫：[ecpay-payment](./plans/archive/2026-11-21-ecpay-payment.md)

### 修正
- `apiFetch`：登入／註冊的 401（帳密錯誤）不再清除登入資料並導向 `/login`，改為丟出錯誤讓登入頁顯示訊息；已在 `/login` 頁時其他 401 不再重複導向。
- `header-init.js`：改用 DOM API 與 `textContent` 建立導覽列，前端不再有任何 `innerHTML`，使用者名稱不會被當成 HTML 解析。
- 新增 `tests/apiFetch.test.js`、`tests/headerInit.test.js`（共 13 個測試，以 Node `vm` 注入假 DOM）。
- 計畫：[frontend-401-and-xss-fixes](./plans/archive/2026-11-21-frontend-401-and-xss-fixes.md)

### 測試
- 測試改用記憶體資料庫：`src/database.js` 新增 `DB_PATH` 環境變數，`vitest.config.js` 的 `test.env` 設為 `:memory:`，並提供測試用的 `JWT_SECRET` 與管理員帳密。測試不再讀寫 `database.sqlite`、不再消耗庫存，也不需要 `.env`。
- `tests/setup.js` 新增安全閥：資料庫不是記憶體資料庫時中止測試。
- 實測確認 `vitest.config.js` 的 `sequence.files` 沒有生效。
- 計畫：[test-db-isolation](./plans/2026-11-21-test-db-isolation.md)

## 2026-11-20

### 文件
- 以 init-project-docs 建立專案文件結構：`CLAUDE.md`、`docs/`（README、ARCHITECTURE、DEVELOPMENT、FEATURES、TESTING、CHANGELOG、plans）。
- 記錄既有行為：雙模式購物車、訂單 transaction、模擬付款、後台商品／訂單管理。
- 記錄既有的已知限制（見 [TESTING.md](./TESTING.md)、[features/orders.md](./features/orders.md)、[features/frontend.md](./features/frontend.md)）。
