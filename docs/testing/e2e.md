# E2E 測試（Playwright）

檔案：`playwright.config.js`、`test/e2e/ecpay-webatm.spec.js`。執行：`npm run test:e2e`。

## 執行前準備
1. **先啟動專案**：另開終端機執行 `npm start`（E2E 不設定 `webServer`，只測已啟動的 `http://localhost:3001`；可用 `E2E_BASE_URL` 覆寫）。修改程式後要重新啟動，否則會測到舊版（測試會檢查 `/api/shipping/quote` 是否存在）。
2. **`.env` 需設定綠界測試環境**（`ECPAY_MERCHANT_ID`／`HASH_KEY`／`HASH_IV`，見 [../features/payment-ecpay.md](../features/payment-ecpay.md)），付款完成後才能回到 `BASE_URL`。
3. **瀏覽器**：使用系統安裝的 Google Chrome（`channel: 'chrome'`），不需要 `npx playwright install`。要改用 Playwright 的 Chromium 時設 `E2E_BROWSER_CHANNEL=chromium` 並先安裝瀏覽器。
4. 需要能連到綠界測試環境（`payment-stage.ecpay.com.tw`）。Claude Code 的 sandbox 內無法啟動 Chrome，也連不到本機伺服器，請在一般終端機執行（或在 Claude Code 輸入 `! npm run test:e2e`）。

## 流程（單一測試，15 個 `test.step`）
1. 以 `admin@hexschool.com`／`12345678` 登入，取得 localStorage 的 JWT。
2. 先清空該帳號購物車；挑一項有庫存、單價低於 1,500 的商品，從首頁商品卡「加入購物車」。
3. 購物車 →「前往結帳」。
4. 填收件資料，選「宅配」並勾「當日急件」，確認摘要為「商品價格＋120＋250」。
5. 「確認送出訂單」，以 API 確認訂單為 `pending`、運費 370。
6. 「前往綠界付款」進入綠界測試環境（只等導覽開始，綠界頁面的 `load` 事件常常等不到）。
7. 選「網路ATM」（`li#liWebATM`）→ 8. 下拉選單 `select#selWebATMBank` 選「台灣土地銀行」（值 `…@WebATM_LAND`）→ 9.「前往付款」（`a#WebATMPaySubmit`）→ 10. 關閉提示框「綠界科技貼心提醒您，將跳轉至銀行頁面…」（`#btnClose`，沒有文字）。
11. 在土地銀行測試頁（`pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm`）按 `Save`。
12. 等待付款成功 → 13. 返回商店：**實測（2026-11-23）綠界只顯示約 5 秒「交易資料傳輸中…」就自動 POST 到 `OrderResultURL`（`/ecpay/return`）回站，不會出現「付款成功／返回商店」按鈕**。測試兩種情況都支援：有按鈕就點，自動返回則確認確實經過 `POST /ecpay/return`，並在報告註記實際路徑。
14. 等待頁面顯示「已付款」（回站後自動查詢；必要時每 12 秒按一次「重新查詢付款結果」，最多 2 分鐘），存成功截圖。
15. 以 API 確認訂單 `status === 'paid'`、金額不變。

綠界頁面不屬於本專案：優先使用上述實測的元素 id，找不到再退回文字比對；一律先篩「可見」元素（每種付款方式都有隱藏的同名「前往付款」），並同時搜尋所有分頁與 iframe。綠界改版導致失敗時，看 `test-results/<測試>/page-N.html` 更新選擇器。

## 產物（皆已 `.gitignore`）
- 成功截圖：`test-results/ecpay-webatm-paid.png`（也附在 HTML 報告）。
- 報告：`playwright-report/`（`npx playwright show-report` 開啟）。
- 失敗時：`test-results/<測試>/` 內有截圖、影片、`trace.zip`（`npx playwright show-trace <檔案>`），以及每個分頁的 `page-N.html`／`page-N.png`，方便調整綠界頁面的選擇器。

## 注意
- **會修改開發資料庫**：每次執行都在 `database.sqlite` 建立一筆管理員的已付款訂單並扣 1 件庫存，也會清空管理員帳號的購物車。在建立訂單之後、付款完成之前失敗的執行，會留下 `pending` 訂單（收件人「E2E 測試收件人」；專案沒有取消訂單的功能）。
- 每次都在綠界測試環境建立新的交易（測試帳號 `3002607`，不會真的扣款）。
- 綠界查詢 API 太頻繁會被暫時封鎖（見 payment-ecpay.md），請勿連續大量重跑。
