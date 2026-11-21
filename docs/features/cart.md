# 購物車（`src/routes/cartRoutes.js`）

## 雙模式認證 `dualAuth`

定義在 `cartRoutes.js` 內（不是共用 middleware），所有購物車端點都使用：

1. 有 `Authorization: Bearer ...` header：驗證 JWT（HS256）並確認使用者仍存在。
   - 成功：`req.user` 有值，購物車歸屬 `user_id`。
   - 失敗（無效、過期、使用者不存在）：**立即回 401，不會退回 session**。
2. 沒有 Bearer，但有 `X-Session-Id`（由 `sessionMiddleware` 設為 `req.sessionId`）：以訪客身分，歸屬 `session_id`。
3. 兩者都沒有：401 `請提供有效的登入 Token 或 X-Session-Id`。

`getOwnerCondition(req)` 回傳 `{ field: 'user_id' | 'session_id', value }`，用於組 SQL 的欄位名（僅限這兩個固定值）。

前端 `Auth.getAuthHeaders()` 永遠同時送出 `X-Session-Id` 與（若已登入）`Authorization`，因此登入後走 user 模式。

## 登入／註冊時合併訪客購物車（`src/services/cartService.js`）

`POST /api/auth/login`（密碼驗證通過後）與 `POST /api/auth/register`（建立使用者後）會呼叫 `mergeSessionCartIntoUser(userId, req.sessionId)`，把該 `X-Session-Id` 的訪客購物車併入帳號。前端 `apiFetch` 每個請求都會帶 `X-Session-Id`，所以瀏覽器流程不需額外處理。

- 單一 `db.transaction`，只處理 `session_id = ? AND user_id IS NULL` 的項目。
- 帳號已有同商品：數量 = `max(原數量, min(原數量 + 訪客數量, 庫存))`，也就是**相加、以庫存為上限、不報錯**，且不會把帳號原有的數量往下調。更新帳號那一列，刪除訪客那一列。
- 帳號沒有該商品：訪客那一列改成 `user_id = 帳號、session_id = NULL`，數量 `min(訪客數量, 庫存)`；庫存為 0 就直接刪除（不帶入）。
- 沒有帶 `X-Session-Id`、或密碼錯誤（登入失敗）時不合併；只合併請求所帶的那個 session，不動其他 session。
- 合併失敗（例外）不會讓登入／註冊失敗：交易回滾、訪客項目保留、記錄 `console.error`，下次登入可重試。回應格式不變。
- 安全：`X-Session-Id` 未經驗證、只當購物車歸屬鍵；持有者可把該 session 的商品併入自己的帳號，與訪客模式的信任程度一致。

## GET `/api/cart`
回傳 `{ items, total }`。每個 item：`{ id, product_id, quantity, product: { name, price, stock, image_url } }`；`total` 為 `price × quantity` 總和。

## POST `/api/cart`（200，新增與累加都回 200）
- Body：`productId`（必填）、`quantity`（選填，預設 1，經 `parseInt`，必須 ≥ 1，否則 400 `VALIDATION_ERROR`）。
- 商品不存在回 404 `NOT_FOUND`。
- 該商品已在購物車：新數量 = 原數量 + 本次數量；超過 `stock` 回 400 `STOCK_INSUFFICIENT`，否則更新原列。
- 不在購物車：本次數量超過 `stock` 回 400 `STOCK_INSUFFICIENT`，否則新增一列。
- 回傳 `{ id, product_id, quantity }`（quantity 為累加後的值），message `已加入購物車`。

## PATCH `/api/cart/:itemId`
- Body：`quantity`（必須為 ≥ 1 的整數）。**覆蓋**數量，不是累加。
- 只能改自己的項目；找不到或不屬於自己回 404 `購物車項目不存在`。
- 超過商品庫存回 400 `STOCK_INSUFFICIENT`。

## DELETE `/api/cart/:itemId`
- 只能刪自己的項目；成功回 `data: null`，message `已從購物車移除`。

## 注意事項
- 庫存在加入時檢查，但商品庫存之後可能被別人買走；最終以建立訂單時的檢查為準（見 [orders.md](./orders.md)）。
- 建立訂單只讀取 `user_id` 的購物車，訪客購物車無法結帳（訪客登入／註冊時會先合併，見上方）。
