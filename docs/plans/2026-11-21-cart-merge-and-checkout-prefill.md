# 登入後合併訪客購物車與結帳預填收件資料

- 狀態：進行中（待瀏覽器實機確認後歸檔）
- 建立日期：2026-11-21 ／ 完成日期：—
- 相關連結：docs/features/cart.md「雙模式認證」、docs/features/frontend.md、`public/js/pages/checkout.js`

## 背景
1. **登入後訪客購物車「消失」**：訪客加入的商品存在 `cart_items.session_id`，登入後 `GET /api/cart` 只讀 `user_id`，登入／註冊流程完全沒有合併（`docs/features/cart.md` 還把它記成已知行為）。實際症狀：訪客加商品 → 結帳 → 被導去登入 → 回到 `/checkout` 看到空購物車 → 被導回 `/cart`。資料並沒有被刪除，只是歸屬不同。
2. **結帳表單收件人與 Email 是空的**：`checkout.js` 的 `form` 初始值為空字串，但登入時存入 localStorage 的 `Auth.getUser()` 已有 `name`、`email`。

## User Story
身為訪客，我想要登入後仍保有先前加入的商品；身為會員，我想要結帳時自動帶入我的姓名與 Email，並能自行修改。

## Spec
### 1. 登入／註冊時合併購物車（後端）
- 新增 `src/services/cartService.js`：`mergeSessionCartIntoUser(userId, sessionId)`，在單一 `db.transaction` 內處理 `cart_items WHERE session_id = ? AND user_id IS NULL`（JOIN `products` 取庫存）。
- 每個訪客項目：
  - 帳號已有同商品 → 數量 `max(原數量, min(原數量 + 訪客數量, 庫存))`（**數量相加**，使用者決定；超過庫存以庫存為上限、不報錯；不會把帳號原有數量往下調）；更新原列並刪除訪客列。
  - 帳號沒有 → 把該列改成 `user_id = 帳號、session_id = NULL`，數量 `min(訪客數量, 庫存)`。
  - 可用數量 < 1（庫存為 0）→ 直接刪除該訪客列。
- 在 `src/routes/authRoutes.js` 的 `login`（密碼驗證通過後）與 `register`（建立使用者後）呼叫；`sessionId` 取自既有的 `req.sessionId`（`sessionMiddleware` 全域讀 `X-Session-Id`，前端 `apiFetch` 每個請求都會帶）。沒有 `X-Session-Id` 就不合併。
- 合併失敗（例外）不得讓登入／註冊失敗：交易會回滾、訪客項目保留，記錄 `console.error`，下次登入可重試。
- 回應格式不變。`@openapi` 補上 `X-Session-Id` header 說明與合併行為。
- 安全：`X-Session-Id` 本來就未經驗證、只當購物車歸屬鍵；持有者可把該 session 的商品併入自己的帳號，與訪客模式的信任程度一致，文件註明。

### 2. 結帳預填（前端）
- `public/js/pages/checkout.js`：`form` 初始值改為 `recipientName: user?.name || ''`、`recipientEmail: user?.email || ''`（`user = Auth.getUser()`）；`recipientAddress` 仍為空（帳號沒有地址）。仍是 `v-model` 雙向綁定，使用者可自由修改，送出前的驗證不變。
- 非目標：不新增個人資料編輯、不在登入後顯示合併提示、不處理登出時的購物車。

## Tasks
- [x] 1. 先寫 `tests/cartMerge.test.js`（supertest）：註冊與登入兩條路徑都合併；同商品相加；超過庫存取上限；庫存 0 丟棄；不會調低原有數量；沒有／不同的 `X-Session-Id` 不合併且不動別的 session；密碼錯誤不合併；合併後 `POST /api/orders` 可用合併的商品下單（重現原症狀）。確認失敗。
- [x] 2. 實作 `cartService.js` 並接上 `authRoutes.js`。
- [x] 3. 先寫 `tests/checkoutPage.test.js`（Node `vm` 注入假 `Vue`／`Auth`／`apiFetch`）：預填姓名與 Email、地址為空、`getUser()` 為 null 時為空字串、使用者改過的值會原樣送出。確認失敗。
- [x] 4. 修改 `checkout.js`。
- [x] 5. 以真實伺服器＋暫存資料庫做端對端：訪客加商品 → 登入 → `GET /api/cart` 仍有商品 → 建立訂單成功。
- [x] 6. 更新文件與規則：`features/cart.md`（移除「登入不會合併」，寫入合併規則）、`features/frontend.md`（結帳預填）、`FEATURES.md`（認證段落）、`TESTING.md`、`CHANGELOG.md`；`.claude/rules/api-design.md` 補一條。
- [ ] 7. 填寫「執行結果」，`git mv` 至 `docs/plans/archive/`。

## 驗證
- `npm test` 全過；開發資料庫 `database.sqlite` 與基準相同（測試用記憶體資料庫）。
- 端對端（Task 5）以暫存資料庫、不碰開發資料庫。
- 前端預填只以 `vm` 驗證邏輯，**不等於瀏覽器實機驗證**，請使用者在瀏覽器確認：訪客加商品 → 去結帳 → 登入 → 結帳頁有商品且姓名／Email 已帶入、可修改。

## 風險
- 合併邏輯改動 `login`／`register` 這兩個核心端點：以交易、例外隔離與專屬測試降低風險，且回應格式不變。
- 開發資料庫已存在的舊訪客項目（登入前留下的）會在該使用者下次以相同瀏覽器登入時才被合併；已清除 localStorage 的舊 session 無法歸戶。

## 執行結果（完成後填寫，歸檔前必填）
（程式與自動化驗證已完成；Task 7 待使用者在瀏覽器確認後歸檔。）
- 實際變更：新增 `src/services/cartService.js`；`authRoutes.js` 的 `login`／`register` 呼叫 `mergeGuestCart`（失敗只記錄、不影響登入）並補 `@openapi`；`public/js/pages/checkout.js` 的 `form` 預填 `Auth.getUser()` 的姓名與 Email。
- 與計畫差異：無結構性差異。合併數量公式實作為 `max(原數量, min(原數量 + 訪客數量, 庫存))`，與計畫一致。
- 測試結果：
  - `npm test`：13 個檔案、116 個測試全過（原 101 個，新增 `cartMerge` 10、`checkoutPage` 5）；兩組測試都先確認失敗再實作。
  - 端對端（真實伺服器＋暫存資料庫，請求標頭與瀏覽器相同）：訪客加 2 項商品 → 登入後購物車仍有該 2 項、訪客端清空、結帳建立訂單成功（原症狀就是在這一步看到空購物車）；註冊路徑同樣合併；密碼錯誤不合併。
  - 結帳預填只以 Node `vm` 驗證邏輯，**不等於瀏覽器實機驗證**。
- 文件更新：features/cart.md（移除「登入不會合併」並寫入合併規則）、features/frontend.md、FEATURES.md、architecture/api-routes.md、ARCHITECTURE.md、TESTING.md、CHANGELOG.md、`.claude/rules/api-design.md`。
- 遺留事項：
  - 請在瀏覽器確認：訪客加商品 → 去結帳 → 登入 → 結帳頁有商品，且收件人與 Email 已帶入、可修改。
  - 開發資料庫裡登入前就留下的訪客項目（例如 `cart_items` 那 1 筆）會在該瀏覽器下次登入時才被合併；已清除 localStorage 的舊 session 無法歸戶。
  - 登入沒有速率限制（既有的待追蹤風險，未處理）。
