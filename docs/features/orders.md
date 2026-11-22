# 訂單與付款（`src/routes/orderRoutes.js`）

整個 router 先掛 `authMiddleware`，所有端點都需要 Bearer token。訂單查詢一律以 `user_id` 過濾，只能看到自己的訂單。

## POST `/api/orders`（201）建立訂單

Body 必填：`recipientName`、`recipientEmail`、`recipientAddress`（超商取貨時填取貨門市）。
Body 可選（配送，見 [shipping.md](./shipping.md)）：`shippingMethod`（`home_delivery`｜`convenience_store`，預設宅配）、`isRemoteArea`、`isUrgent`（JSON 布林，預設 `false`）。

驗證順序與錯誤：
1. 三個欄位缺任一個 → 400 `VALIDATION_ERROR`。
2. `recipientEmail` 不符 email regex → 400 `VALIDATION_ERROR`。
3. 配送選項不合法（未知配送方式、非布林）→ 400 `VALIDATION_ERROR`。
4. 讀取該使用者（`user_id`）的購物車並 JOIN 商品；空的 → 400 `CART_EMPTY`。
5. 任一項 `quantity > stock` → 400 `STOCK_INSUFFICIENT`，message 列出商品名稱（`以下商品庫存不足：A, B`）。

通過後計算金額（**一律由後端計算**，body 夾帶的金額欄位被忽略）：
- `subtotal_amount = Σ price × quantity`
- `shipping_fee` 由 `src/utils/shipping.js` 的 `calculateShipping` 計算（宅配 120、滿 1,500 免基本運費；超商 60；偏遠 +200；急件 +250）
- `total_amount = subtotal_amount + shipping_fee`（綠界付款金額）

產生 `order_no`（`ORD-YYYYMMDD-XXXXX`），在**單一 `db.transaction`** 內：
1. 寫入 `orders`（status 預設 `pending`，含運費明細快照）。
2. 每個購物車項目寫入 `order_items`（複製 `product_name`、`product_price`，保留下單當下的快照）。
3. 逐項 `UPDATE products SET stock = stock - ?`。
4. 刪除該使用者的 `cart_items`。

回傳 `{ id, order_no, subtotal_amount, shipping_method, base_shipping_fee, remote_surcharge, urgent_surcharge, shipping_fee, total_amount, status, items: [{ product_name, product_price, quantity }], created_at }`。
`order_no` 的 5 碼隨機尾巴沒有重試機制，撞號時 UNIQUE 約束會使請求失敗（500）。

## GET `/api/orders`
回傳 `{ orders: [{ id, order_no, total_amount, status, created_at }] }`，`created_at DESC`，**沒有分頁**。

## GET `/api/orders/:id`
回傳訂單所有欄位（含運費明細）加 `items`（`order_items` 全欄位）。運費功能上線前的舊訂單 `shipping_method` 為 `null`、運費為 0。不存在或不屬於自己回 404 `訂單不存在`。

## 付款
付款走綠界：`POST /api/orders/:id/ecpay/checkout` 建立付款、`POST /api/orders/:id/ecpay/verify` 由後端呼叫綠界查詢並更新訂單狀態。完整流程、驗證規則與限制見 [payment-ecpay.md](./payment-ecpay.md)。
舊的模擬付款端點 `PATCH /api/orders/:id/pay` 已移除：訂單只能由綠界查詢驗證後變成 `paid`。

## 已知行為與限制
- 訂單狀態 `pending → paid` 只由綠界查詢驗證觸發（verify，或 checkout 時對舊交易的檢查）；`failed` 狀態目前沒有任何流程會設定（綠界「交易未成立」只讓該筆付款交易失敗，訂單仍是 `pending`，可重新付款）。
- 付款不成功不會還原庫存，也沒有取消訂單端點。
- 前端 `/orders/:id?payment=checking` 只用來決定「是否自動向後端查詢」，不信任網址上的其他值。
