---
paths:
  - "src/routes/**"
  - "src/middleware/**"
---

# API 設計規則

- 回應一律 `{ data, error, message }`：成功 `error: null`；失敗 `data: null`、`error` 為 `UPPER_SNAKE_CASE` 錯誤碼、`message` 為繁體中文。
- 既有錯誤碼：`VALIDATION_ERROR`、`STOCK_INSUFFICIENT`、`CART_EMPTY`、`INVALID_STATUS`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`，以及付款相關的 `NO_PAYMENT`、`PAYMENT_AMOUNT_MISMATCH`、`TOO_MANY_REQUESTS`、`PAYMENT_QUERY_FAILED`、`PAYMENT_NOT_CONFIGURED`。新增前先沿用，確實需要再新增並更新 docs/ARCHITECTURE.md 的錯誤碼表。
- **訂單 `paid` 只能由 `src/routes/ecpayRoutes.js` 的 `checkAttempt` 設定**（由 verify 與 checkout 的舊交易檢查呼叫）：必須先呼叫綠界 QueryTradeInfo，並通過 CheckMacValue、`MerchantTradeNo`、金額（同時等於交易金額與訂單金額）與 `TradeStatus === '1'` 檢查，且在單一 `db.transaction` 內更新 `payments` 與 `orders`。不可新增其他能把訂單改成 `paid` 的端點，也不可依 request body 或網址參數決定付款結果。
- 呼叫綠界的端點要限流（同一筆交易兩次查詢至少間隔 10 秒），並把 `EcpayError` 轉成 502／503，不可把綠界的原始回應或金鑰回傳給用戶端。
- 狀態碼：建立資源 201（註冊、建立訂單、新增商品）、其餘成功 200；缺欄位或格式錯誤 400、未登入 401、權限不足 403、不存在 404、衝突 409。
- 分頁：`page` 預設 1 且最小 1；`limit` 預設 10 並限制在 1–100；回傳 `pagination: { total, page, limit, totalPages }`。
- 驗證順序：必填欄位 → 格式 → 資源是否存在 → 業務規則（庫存、狀態）。
- 只屬於使用者自己的資源，查詢時加 `AND user_id = ?`；找不到或不屬於自己都回 404，不回 403。
- 受保護路由用 `authMiddleware`；後台路由再加 `adminMiddleware`，順序不可對調。管理員身分不可由 request body 決定。
- 錯誤訊息不洩漏內部細節；登入失敗不區分「帳號不存在」與「密碼錯誤」。
- 回應不得包含 `password_hash`。
- 每個端點上方寫 `@openapi` 註解（`tags`、`security`、`responses`），並更新 docs/architecture/api-routes.md。
- 路徑用複數名詞（`/api/products`），後台在 `/api/admin/` 之下。
