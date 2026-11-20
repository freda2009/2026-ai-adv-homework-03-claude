# 安全性規則（全域）

- **輸入驗證在伺服器端**：型別用 `Number.isInteger` 等嚴格檢查；不要信任前端驗證，也不要信任 body 內的 `role`、`user_id`、`total_amount`。
- **SQL injection**：只用 `db.prepare` 參數化；動態欄位名限定為程式內固定值。
- **密碼與 token**：密碼用 bcrypt（`password_hash` 永不回傳）；JWT 驗證要明確指定 `algorithms: ['HS256']`；`JWT_SECRET` 只能來自環境變數，不可寫進程式碼或日誌。
- **身分來源**：訂單、購物車等的擁有者一律取自 `req.user.userId`（或訪客的 `req.sessionId`），不接受 body 傳入的使用者 id。`X-Session-Id` 未經驗證，只能當購物車歸屬鍵，不可用於授權。
- **CORS**：`origin` 取自 `FRONTEND_URL`，不要改成 `*`。
- **XSS**：渲染使用者內容用 `{{ }}`／`<%= %>`／`textContent`；`header-init.js` 的 `innerHTML` 是已知待修項目。
- **錯誤處理**：500 一律回通用訊息；不要把例外訊息、SQL 或堆疊回傳給用戶端。
- **機密檔案**：不讀取、輸出或提交 `.env`；範例值放 `.env.example`。`database.sqlite*` 含使用者資料，不要提交。
- **待追蹤的已知風險**：管理員頁面僅前端導向（API 有保護）；登入沒有速率限制；`apiFetch` 遇 401 一律導向 `/login`。
