# 更新日誌

格式：新的在上。每項功能完成並歸檔計畫時，在此新增一筆，並連結到 `plans/archive/` 的計畫。

## 2026-11-22

### 新功能：配送費用（Shipping 模組）
- 新增 `src/utils/shipping.js`：宅配 120（商品小計滿 1,500 免基本運費）、超商取貨 60（不是基本運費，滿額不免）、偏遠地區 +200、當日急件 +250；附加費適用所有配送方式且可疊加。純函式，可獨立單元測試。
- **建立訂單改由後端計算運費**：`POST /api/orders` 新增可選 `shippingMethod`、`isRemoteArea`、`isUrgent`（預設宅配、非偏遠、非急件），`total_amount = subtotal_amount + shipping_fee`；回應與訂單詳情新增 `subtotal_amount`、`shipping_method`、`base_shipping_fee`、`remote_surcharge`、`urgent_surcharge`、`shipping_fee`。原本後端完全沒有運費，畫面上「滿 500 免運、否則 150」與實際付款金額不一致。綠界 `TotalAmount` 取 `order.total_amount`，自然含運費。
- 新增公開試算 API `GET /api/shipping/quote`；購物車與結帳頁的運費預估改用它，前端不再寫死費率。
- `orders` 新增 6 個運費欄位，由 `src/utils/schemaMigrations.js` 冪等補上：既有 `database.sqlite` 不需刪檔，舊訂單 `subtotal_amount` 回填為原總額、運費 0、`shipping_method` 為 `NULL`（已用資料庫副本實測）。
- 前端：結帳頁加配送方式與附加服務選項、運費明細；購物車免運提示改為 1,500；訂單詳情與後台詳情顯示運費明細；首頁文案改為「宅配消費滿 NT$ 1,500 免基本運費」。
- 測試資料夾 `tests/` 改名為 `test/`；新增 `shipping`（22）、`shippingQuote`（13）、`orderShipping`（9）、`schemaMigrations`（4），`checkoutPage` 5 → 10，總計 169 個。
- 已知限制：偏遠地區由使用者自行勾選，後端不依地址判定（見 [features/shipping.md](./features/shipping.md)）。
- 計畫：[shipping-fee](./plans/archive/2026-11-22-shipping-fee.md)

## 2026-11-21

### 修正：登入後購物車與結帳資料
- **登入／註冊會合併訪客購物車**：新增 `src/services/cartService.js`，`login`（密碼驗證通過後）與 `register` 依 `X-Session-Id` 把訪客項目併入帳號（同商品數量相加、以庫存為上限、不會調低原有數量、庫存 0 不帶入；單一交易，失敗不影響登入）。原本訪客加入的商品留在 `session_id`、登入後讀 `user_id` 而看似消失，導致「訪客加商品 → 結帳 → 登入」後結帳頁是空的。
- **結帳預填**：收件人姓名與 Email 自動帶入登入帳號（`Auth.getUser()`），可自行修改；地址仍須自填。
- 新增 `tests/cartMerge.test.js`（10）、`tests/checkoutPage.test.js`（5）。
- 計畫：[cart-merge-and-checkout-prefill](./plans/2026-11-21-cart-merge-and-checkout-prefill.md)

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
- 計畫：[test-db-isolation](./plans/archive/2026-11-21-test-db-isolation.md)

## 2026-11-20

### 文件
- 以 init-project-docs 建立專案文件結構：`CLAUDE.md`、`docs/`（README、ARCHITECTURE、DEVELOPMENT、FEATURES、TESTING、CHANGELOG、plans）。
- 記錄既有行為：雙模式購物車、訂單 transaction、模擬付款、後台商品／訂單管理。
- 記錄既有的已知限制（見 [TESTING.md](./TESTING.md)、[features/orders.md](./features/orders.md)、[features/frontend.md](./features/frontend.md)）。
