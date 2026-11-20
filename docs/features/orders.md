# 訂單與付款（`src/routes/orderRoutes.js`）

整個 router 先掛 `authMiddleware`，所有端點都需要 Bearer token。訂單查詢一律以 `user_id` 過濾，只能看到自己的訂單。

## POST `/api/orders`（201）建立訂單

Body 必填：`recipientName`、`recipientEmail`、`recipientAddress`。

驗證順序與錯誤：
1. 三個欄位缺任一個 → 400 `VALIDATION_ERROR`。
2. `recipientEmail` 不符 email regex → 400 `VALIDATION_ERROR`。
3. 讀取該使用者（`user_id`）的購物車並 JOIN 商品；空的 → 400 `CART_EMPTY`。
4. 任一項 `quantity > stock` → 400 `STOCK_INSUFFICIENT`，message 列出商品名稱（`以下商品庫存不足：A, B`）。

通過後計算 `total_amount = Σ price × quantity`，產生 `order_no`（`ORD-YYYYMMDD-XXXXX`），在**單一 `db.transaction`** 內：
1. 寫入 `orders`（status 預設 `pending`）。
2. 每個購物車項目寫入 `order_items`（複製 `product_name`、`product_price`，保留下單當下的快照）。
3. 逐項 `UPDATE products SET stock = stock - ?`。
4. 刪除該使用者的 `cart_items`。

回傳 `{ id, order_no, total_amount, status, items: [{ product_name, product_price, quantity }], created_at }`。
`order_no` 的 5 碼隨機尾巴沒有重試機制，撞號時 UNIQUE 約束會使請求失敗（500）。

## GET `/api/orders`
回傳 `{ orders: [{ id, order_no, total_amount, status, created_at }] }`，`created_at DESC`，**沒有分頁**。

## GET `/api/orders/:id`
回傳訂單所有欄位加 `items`（`order_items` 全欄位）。不存在或不屬於自己回 404 `訂單不存在`。

## PATCH `/api/orders/:id/pay` 模擬付款
- Body：`action` 必須是 `success`（→ `paid`）或 `fail`（→ `failed`），否則 400 `VALIDATION_ERROR`。
- 訂單不存在／不屬於自己 → 404。
- 訂單狀態不是 `pending` → 400 `INVALID_STATUS`（已付款或已失敗都不能再付款）。
- 成功回傳更新後的訂單加 `items`；message 為 `付款成功` 或 `付款失敗`。

## 已知行為與限制
- 付款失敗不會還原庫存，也沒有重新付款流程；失敗的訂單只是留在 `failed` 狀態。
- 沒有取消訂單端點。
- `.env.example` 含 `ECPAY_*`、`BASE_URL`，但程式碼沒有使用，付款完全是模擬。
- 前端 `/orders/:id?payment=success|failed|cancel` 只是用來顯示提示橫幅，不代表實際付款結果。
