# 配送費用（Shipping）模組

- 狀態：已完成（瀏覽器畫面待使用者實機確認）
- 建立日期：2026-11-22 ／ 完成日期：2026-11-22
- 相關連結：[features/orders.md](../../features/orders.md)、[features/payment-ecpay.md](../../features/payment-ecpay.md)

## 背景
建立訂單時 `total_amount = Σ price × quantity`，**後端完全沒有運費**；購物車與結帳頁卻寫死「滿 500 免運、否則 150」，畫面總計與實際付款金額（綠界 `TotalAmount` 取自 `order.total_amount`）不一致。

## User Story
身為顧客，我想要在結帳時選擇宅配或超商取貨、標示偏遠地區與當日急件，並在送出前看到正確的運費與總額；身為店家，我想要運費只由後端計算，付款金額一定包含運費。

## Spec
規則（單位：元，皆整數）：

| 情境 | 基本運費 | 偏遠地區 | 當日急件 |
|---|---|---|---|
| 宅配 `home_delivery`，商品小計 < 1,500 | 120 | +200 | +250 |
| 宅配，商品小計 ≥ 1,500 | 0（免基本運費） | +200 | +250 |
| 超商取貨 `convenience_store`（任何小計，不是基本運費，不適用免運） | 60 | +200 | +250 |

- `shipping_fee = base_shipping_fee + remote_surcharge + urgent_surcharge`；`total_amount = subtotal_amount + shipping_fee`。
- 偏遠地區由使用者結帳時勾選（`isRemoteArea`），後端不另行判定；附加費適用所有配送方式且可疊加。
- 模組：`src/utils/shipping.js`（純函式，不碰 DB）匯出 `SHIPPING_METHODS`、`SHIPPING_RATES`、`validateShippingOptions`、`calculateShipping`。
- `POST /api/orders` body 新增可選 `shippingMethod`（預設 `home_delivery`）、`isRemoteArea`、`isUrgent`（預設 `false`，必須是 JSON 布林）；不合法回 400 `VALIDATION_ERROR`。回應新增 `subtotal_amount`、`shipping_method`、`base_shipping_fee`、`remote_surcharge`、`urgent_surcharge`、`shipping_fee`。
- `orders` 新增上述 6 個欄位（金額快照）；`src/utils/schemaMigrations.js` 的 `addOrderShippingColumns(db)` 冪等補欄位，舊訂單回填 `subtotal_amount = total_amount`、`shipping_method = NULL`。
- 新增公開試算 API `GET /api/shipping/quote?subtotal=&shippingMethod=&isRemoteArea=&isUrgent=`，回傳運費明細、`total_amount` 與 `rates`；前端預估只用它，規則只有一份。
- 綠界不需改：`payments.amount`、`TotalAmount` 都取 `order.total_amount`，自然含運費。
- 測試資料夾 `tests/` 統一改名為 `test/`。

驗收：8 個指定情境的單元測試通過；建立訂單與試算 API 回傳正確運費與總額；既有測試全部通過；舊資料庫副本啟動後可正常建單。

## Tasks
- [x] 1. `git mv tests test`，更新 `vitest.config.js`
- [x] 2. 建立 `src/utils/shipping.js` 與 `test/shipping.test.js`（宅配、超商、1,499、1,500、偏遠、急件、多項附加費、滿額免運＋附加費）
- [x] 3. `src/utils/schemaMigrations.js` + `src/database.js` 呼叫；`test/schemaMigrations.test.js`
- [x] 4. `orderRoutes.js` 建立訂單整合運費、更新 `@openapi`（含 `adminOrderRoutes.js`）；`test/orderShipping.test.js`
- [x] 5. `shippingRoutes.js` 試算 API、`app.js` 掛載；`test/shippingQuote.test.js`
- [x] 6. 前端：結帳頁選項與預估、購物車免運提示、訂單詳情與後台明細、首頁文案；更新 `test/checkoutPage.test.js`
- [x] 7. 文件：新增 `docs/features/shipping.md`，更新 FEATURES、orders、api-routes、database、ARCHITECTURE、DEVELOPMENT、TESTING、frontend、payment-ecpay、README、CHANGELOG、CLAUDE.md、`.claude/rules`、`.claude/agents/test-runner.md`
- [x] 8. `npm run openapi` 重新產生 `openapi.json`；`npm test`；以 `database.sqlite` 副本實測遷移與建單

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：新增 `src/utils/shipping.js`、`src/utils/schemaMigrations.js`、`src/routes/shippingRoutes.js`；修改 `src/database.js`、`src/routes/orderRoutes.js`、`src/routes/adminOrderRoutes.js`（@openapi）、`app.js`；前端 `checkout`、`cart`、`order-detail`、`admin/orders`、`index` 頁面與腳本；`tests/` → `test/`、`vitest.config.js`。尚未 commit。
- 與計畫差異：
  - 資料表沒有在 `CREATE TABLE` 加欄位，而是全新與既有資料庫都由 `addOrderShippingColumns` 補上，確保兩者 schema 一致。
  - 試算 API 回應多了 `rates`（費率表），讓結帳頁標籤與購物車免運門檻不必寫死數字。
  - `checkout.js` 以 `encodeURIComponent` 組查詢字串（不用 `URLSearchParams`），前端測試的 `vm` 環境才不需額外注入。
- 測試結果：`npm test` → 17 個檔案、169 個測試全數通過（原 116 個；新增 shipping 22、shippingQuote 13、orderShipping 9、schemaMigrations 4，checkoutPage +5）。另以 `database.sqlite` 的唯讀備份副本（`DB_PATH` 指向 `$TMPDIR`）啟動伺服器實測：4 筆舊訂單補欄位後 `subtotal_amount = total_amount`、`shipping_method = NULL`、運費 0；試算 1,499＋偏遠＝320；建單「超商＋偏遠＋急件」小計 980 → 運費 510、總額 1,490；`/`、`/cart`、`/checkout` 回 200。原始 `database.sqlite` 未被修改。
- 文件更新：新增 `docs/features/shipping.md`；更新 FEATURES、features/orders、features/frontend、features/admin、features/payment-ecpay、architecture/api-routes、architecture/database、ARCHITECTURE、DEVELOPMENT、TESTING、README、CHANGELOG、CLAUDE.md、`.claude/rules/{testing,database,api-design,security}.md`、`.claude/agents/test-runner.md`；`npm run openapi` 重新產生 `openapi.json`（已被 `.gitignore`，不會進 commit）。
- 遺留事項：
  - 瀏覽器實機確認結帳選項切換、購物車免運提示、訂單詳情與後台明細的畫面（Vue 模板只在瀏覽器編譯，本次未能在 sandbox 內檢查）。
  - 偏遠地區由使用者自行勾選，後端不依地址判定；超商取貨未串接綠界物流選店；綠界 `ItemName` 未列運費項目。
  - 首頁「滿額免運」為靜態文案，調整費率時需手動同步。
