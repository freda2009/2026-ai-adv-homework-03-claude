# 配送費用（Shipping）

程式：`src/utils/shipping.js`（規則與計算，純函式）、`src/routes/orderRoutes.js`（建立訂單時計算）、`src/routes/shippingRoutes.js`（試算 API）、`src/utils/schemaMigrations.js`（`orders` 運費欄位）。
計畫：[plans/archive/2026-11-22-shipping-fee.md](../plans/archive/2026-11-22-shipping-fee.md)。

## 規則（單位：元，皆整數）

| 項目 | 金額 | 說明 |
|------|------|------|
| 宅配 `home_delivery` 基本運費 | 120 | 商品小計 **≥ 1,500** 免基本運費（1,499 仍收 120） |
| 超商取貨 `convenience_store` | 60 | 不是基本運費，**滿額不免** |
| 偏遠地區 | +200 | 使用者結帳時勾選；適用所有配送方式 |
| 當日急件 | +250 | 適用所有配送方式 |

- `shipping_fee = base_shipping_fee + remote_surcharge + urgent_surcharge`；`total_amount = subtotal_amount + shipping_fee`。
- 附加費可疊加，且不受滿額免運影響：宅配小計 1,500＋偏遠＋急件＝0＋200＋250＝450。
- 範例：宅配 1,000＝120；超商 1,000＝60；宅配 1,000＋偏遠＋急件＝570；超商＋偏遠＋急件＝510。

## 模組 API（`src/utils/shipping.js`）

| 匯出 | 說明 |
|------|------|
| `SHIPPING_METHODS` | `{ HOME_DELIVERY: 'home_delivery', CONVENIENCE_STORE: 'convenience_store' }` |
| `SHIPPING_RATES` | 費率常數（`Object.freeze`）；調整費率只改這裡 |
| `validateShippingOptions(input)` | 回傳 `{ value }` 或 `{ error }`。`undefined` 套預設（宅配、`false`、`false`）；配送方式必須是列舉值，`isRemoteArea`／`isUrgent` 必須是真正的布林（`null`、`"true"`、`1` 都拒絕） |
| `isValidSubtotal(n)` | 0 以上的安全整數 |
| `calculateShipping({ subtotal, shippingMethod, isRemoteArea, isUrgent })` | 回傳 `{ shipping_method, base_shipping_fee, remote_surcharge, urgent_surcharge, shipping_fee, free_shipping_applied }`（key 與 `orders` 欄位一致）；輸入不合法丟 `TypeError`，呼叫端需先驗證 |
| `getShippingRates()` | snake_case 費率表，供 API 回傳 |

## 建立訂單（`POST /api/orders`）
- Body 可選 `shippingMethod`、`isRemoteArea`、`isUrgent`；未提供時為宅配、非偏遠、非急件（舊用戶端不受影響）。不合法回 400 `VALIDATION_ERROR`，購物車不會被清空。
- 小計由購物車與商品價格計算，運費由模組計算；**body 夾帶的 `total_amount`、`shipping_fee` 等金額一律忽略**。
- 寫入 `orders` 的 6 個運費欄位（下單當下的快照，日後調整費率不影響舊訂單），細節見 [orders.md](./orders.md)。
- 綠界付款金額 `TotalAmount` 與 `payments.amount` 都取 `order.total_amount`，已包含運費，`ecpayRoutes.js` 不需修改。

## 試算 API（`GET /api/shipping/quote`）
- 公開、不需登入、不讀寫資料庫；只用於畫面預估，實際金額以建立訂單時重新計算為準。
- 查詢參數：`subtotal`（必填，`/^\d+$/` 且為安全整數）、`shippingMethod`、`isRemoteArea`／`isUrgent`（只接受 `true`／`false`；重複出現的參數視為不合法）。錯誤回 400 `VALIDATION_ERROR`。
- 回傳 `subtotal_amount`、`calculateShipping` 的全部欄位、`total_amount`、`rates`（費率表）。

## 前端
- 結帳頁：配送方式（宅配／超商取貨）radio、偏遠地區與當日急件 checkbox，切換時呼叫試算 API 更新摘要（只採用最後一次請求的結果）；費率文字取自 `rates`，不寫死。試算失敗顯示「將於建立訂單時計算」，不阻擋送出。超商取貨時地址欄改為「取貨門市」。
- 購物車：以試算 API（宅配預設）顯示免運差額、預估運費與預估總計，小計變動時重算。
- 訂單詳情與後台訂單詳情：顯示商品小計、配送方式、基本運費（宅配 0 元顯示「免運」）、各項附加費與總計。
- 首頁「滿額免運」為靜態文案（宅配消費滿 NT$ 1,500 免基本運費），調整費率時需手動同步。

## 已知限制
- **偏遠地區由使用者自行勾選**，後端不依地址判定；故意不勾可少付 200 元，需人工檢查。
- 舊訂單（運費功能上線前）`shipping_method` 為 `NULL`、運費為 0、`subtotal_amount` 等於原 `total_amount`。
- 超商取貨沒有串接綠界物流選店，門市資訊由使用者填在 `recipientAddress`。
- 綠界 `ItemName` 只列商品，沒有列「運費」項目（不影響付款金額驗證）。
