# 綠界 ECPay 付款（本機以主動查詢驗證）

程式：`src/services/ecpay.js`（簽章、表單欄位、查詢）、`src/routes/ecpayRoutes.js`（checkout、verify）、`src/routes/pageRoutes.js`（`POST /ecpay/return`）。
計畫與驗證紀錄：[plans/2026-11-21-ecpay-payment.md](../plans/2026-11-21-ecpay-payment.md)。

## 為什麼用主動查詢
專案只在本機執行，綠界無法呼叫 ReturnURL（Server Notify）。所以付款結果**只由後端呼叫 QueryTradeInfo 確認**，不信任瀏覽器帶回的任何內容。訂單變成 `paid` 的唯一路徑是 `ecpayRoutes.js` 的 `checkAttempt`（呼叫 QueryTradeInfo 並驗證），由 verify 與 checkout 的舊交易檢查呼叫。

## 流程
1. 訂單頁「前往綠界付款」→ `POST /api/orders/:id/ecpay/checkout` → `{ action, method, fields }`；前端建隱藏表單全頁 POST 到綠界（不可用 iframe）。
2. 消費者在綠界付款（`ChoosePayment=ALL`）。
3. 回站：信用卡由綠界瀏覽器 POST `OrderResultURL`（`/ecpay/return`）；其餘方式與取消走 `ClientBackURL`（`/orders/:id`）。`/ecpay/return` 只用 `MerchantTradeNo` 找出訂單並 303 轉到 `/orders/:id?payment=checking`，**不改任何狀態**。
4. 訂單頁在 `?payment=checking` 時自動呼叫 `POST /api/orders/:id/ecpay/verify`，也可按「重新查詢付款結果」。
5. 後端呼叫 `QueryTradeInfo/V5` 驗證後才更新 `payments` 與 `orders.status`。

## checkout（201）
- 只能對自己的 `pending` 訂單（否則 404／400 `INVALID_STATUS`）。
- 每次呼叫產生新的 `MerchantTradeNo`（綠界永久唯一）：`P` + UTC+8 `yyMMddHHmmss` + 5 碼隨機＝18 字，並寫入 `payments`（`created`）。
- 建立前先查詢該訂單最近 3 筆未完成的舊交易（10 秒內查過的略過）：已付款則標為 paid 並回 409，避免重複付款；查詢失敗不阻擋。
- 欄位：`MerchantTradeDate` 為 UTC+8；`ItemName` 以 `#` 串接「商品名 x數量」，移除 `# < > & + % =` 與控制字元並截至 200 字；`EncryptType=1`；`ReturnURL` 必填但本機收不到（預設 `${BASE_URL}/api/ecpay/notify`，未實作該端點）。

## verify（200）：全部成立才變 paid
- 回應 `CheckMacValue` 以 timing-safe 比對通過、`MerchantTradeNo` 與本地一致、`Number(TradeAmt)` 同時等於交易金額與訂單 `total_amount`、`TradeStatus === '1'`。
- 單一 `db.transaction` 同時更新 `payments` 與 `orders`；訂單已 `paid` 時直接回傳，不再呼叫綠界（冪等）。

| 綠界 TradeStatus | `data.result` | 效果 |
|------------------|---------------|------|
| `1` 且驗證通過 | `paid` | 交易與訂單變 `paid` |
| `1` 但金額不符 | — | 409 `PAYMENT_AMOUNT_MISMATCH`，不改狀態 |
| `0`（未付款） | `pending` | 維持 pending |
| `10200047`（查無此筆） | `pending` | 訊息提示「綠界尚無此筆交易」 |
| `10200095`（交易未成立） | `failed` | 該筆交易 `failed`，訂單仍 pending，可重新付款 |
| 查詢失敗、簽章不符、MerchantTradeNo 不符、未知狀態 | — | 502 `PAYMENT_QUERY_FAILED`，不改狀態 |

- 同一筆交易兩次查詢至少間隔 10 秒，否則 429 `TOO_MANY_REQUESTS`（附 `Retry-After`）。綠界查詢過快會回 403 並封鎖約 30 分鐘。
- 沒有任何付款交易時回 400 `NO_PAYMENT`；金流未設定回 503 `PAYMENT_NOT_CONFIGURED`。

## 設定
`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENV`（只有 `production` 連正式環境，其他值一律用測試環境）、`BASE_URL`、選填 `ECPAY_RETURN_URL`。金鑰只讀環境變數。
測試帳號（公開值）：`3002607`／`pwFHCqoQZGmho4w6`／`EkRm7iFT261dpevs`；測試信用卡 `4311-9522-2222-2222`、CVV 任意 3 碼、有效期任意未來日期、3DS 驗證碼 `1234`。

## 對綠界測試環境的實測結果（2026-11-21）
- `QueryTradeInfo` 回應為 HTTP 200、`text/html`、URL-encoded 字串；查無訂單為 `TradeStatus=10200047`、`TradeAmt=0`；建單後未付款為 `TradeStatus=0`（有 `TradeNo`、`TradeDate`）。
- 錯誤的 CheckMacValue 會得到 HTTP 500、`TradeStatus=10200073`，所以 `queryTradeInfo` 對非 2xx 也會把 TradeStatus 帶進錯誤訊息。
- 建單（`AioCheckOut/V5`）的付款頁在 `http://localhost:3001` 回傳網址下能正常顯示；但**錯誤的 CheckMacValue 也能顯示付款頁**，所以建單簽章是否被檢查要到付款時才知道。
- **尚未用真實綠界驗證**：付款成功後 `TradeStatus=1` 的回應內容、信用卡付款後多久查得到、綠界是否真的導回 `http://localhost` 的 `OrderResultURL`、ATM／超商付款後查詢是否為 `1`。測試帳號付款頁上的「測試付款請點此」會開啟需填卡號的模擬表單，不是一鍵付款。

## 已知限制
- `ChoosePayment=ALL` 含 ATM／超商／條碼：官方要求離線付款「等待綠界通知」，查詢 API 是否反映這類付款未證實，訂單可能長時間停在 pending；這些方式不支援 `OrderResultURL`。
- 信用卡建議付款後約 10 分鐘再查，銀行未回覆時 `TradeStatus` 仍為 0。
- 沒有退款、對帳、發票；失敗的交易不會還原庫存。

## 綠界 skill
`.claude/skills/ecpay` 以 **git submodule** 引用綠界官方 repo（`https://github.com/ECPay/ECPay-API-Skill.git`），只記錄指標、不複製內容：該 repo 授權為 All Rights Reserved，禁止重新散布。取得專案後執行 `git submodule update --init`，或 clone 時加 `--recurse-submodules`。`tests/ecpay.test.js` 會讀取其中的 `test-vectors/checkmacvalue.json`，submodule 未初始化時略過該組測試。

## 上線前
正式環境改用 `ECPAY_ENV=production` 與正式的 MerchantID／HashKey／HashIV（只放環境變數）；需要可公開存取的 https 網址與接收 Server Notify 的端點，並重新確認官方規格。
