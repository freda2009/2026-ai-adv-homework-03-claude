# 前端頁面

## 版面與載入順序

| 版面 | 載入的腳本（依序） |
|------|--------------------|
| `layouts/front.ejs` | Vue 3（unpkg CDN）→ `auth.js` → `api.js` → `notification.js` → `header-init.js` → `pages/<pageScript>.js` |
| `layouts/admin.ejs` | Vue 3 → `auth.js` → `api.js` → `notification.js` → 內嵌 `Auth.requireAdmin()` → `pages/<pageScript>.js` |

`pageScript` 由 `pageRoutes.js` 傳入；每個頁面 `.ejs` 有 `<div id="app">`（Vue 掛載點），對應 `public/js/pages/<pageScript>.js` 以 `createApp({...}).mount('#app')`。
伺服器端資料用 `data-*` 屬性傳遞（`data-product-id`、`data-order-id`、`data-payment-result`）。

## 共用模組

**`Auth`（`auth.js`）**：localStorage 鍵 `flower_token`、`flower_user`、`flower_session_id`。
- `login(token, user)`／`logout()`（清除並導向 `/`）、`isLoggedIn()`、`isAdmin()`。
- `getSessionId()`：沒有就用 `crypto.randomUUID()` 產生並存起來。
- `getAuthHeaders()`：永遠帶 `X-Session-Id`，已登入再帶 `Authorization: Bearer`。
- `requireAuth()`：未登入導向 `/login?redirect=<目前路徑>`；`requireAdmin()`：非管理員導向 `/login`。

**`apiFetch(url, options)`（`api.js`）**：自動加 `Content-Type: application/json` 與 `Auth.getAuthHeaders()`。
- 回應 401（登入過期）：清除 localStorage、導向 `/login`、回傳 `undefined`；已在 `/login` 頁時只清除、不重複導向。
- **例外**：對 `/api/auth/login`、`/api/auth/register` 的 401 是「帳密錯誤」，不清除、不導向，照一般錯誤 `throw { status, data }`，由 `login.js` 顯示 `err.data.message`（比對時忽略查詢字串）。
- 非 2xx：`throw { status, data }`（`data` 為伺服器回應 JSON，頁面用 `err.data.message` 顯示）。

**`Notification.show(message, type)`（`notification.js`）**：`success`｜`error`｜`warning`｜`info`，3 秒後淡出；需要 `partials/notification.ejs` 的 `#notification-toast`。

**`header-init.js`**（僅前台）：依登入狀態渲染 `#auth-nav`（管理員多一個「後台管理」連結）、顯示「我的訂單」連結、以 `/api/cart` 項目數更新 `#cart-badge`。節點以 `createElement`＋`textContent`＋`replaceChildren` 建立，不使用 `innerHTML`，使用者名稱不會被當成 HTML 解析。

## 頁面行為重點

| 頁面 | 行為 |
|------|------|
| 首頁 | `limit=9` 分頁；「加入購物車」成功後前端自行把徽章 +1（不重新請求） |
| 商品詳情 | 數量選擇器上限為商品 `stock`；加入購物車後徽章 +1 |
| 購物車 | 修改數量呼叫 PATCH；結帳前未登入導向 `/login?redirect=/checkout` |
| 結帳 | `Auth.requireAuth()`；購物車為空就導回 `/cart`；**收件人姓名與 Email 預填登入帳號的 `Auth.getUser()`**（可自行修改，地址仍須自填）；成功後導向 `/orders/<id>` |
| 登入 | 登入／註冊兩個分頁；成功後導向 `?redirect=` 或 `/` |
| 訂單詳情 | 「前往綠界付款」呼叫 checkout 並以 `createElement` 建隱藏表單全頁 POST 到綠界；「重新查詢付款結果」呼叫 verify。`?payment=checking` 時載入後自動查詢；網址上其他 `payment` 值一律忽略（結果以後端為準） |
| 後台商品 | 列表、新增／編輯 modal、刪除確認 |
| 後台訂單 | 狀態篩選、分頁、詳情 modal |

## 已知陷阱

- 新增「帳密驗證型」的端點（回 401 但不代表登入過期）時，要比照登入／註冊，把它加進 `api.js` 的 `isCredentialRequest` 判斷，否則會被導向 `/login`。
- 前端腳本沒有瀏覽器測試環境；`tests/apiFetch.test.js`、`tests/headerInit.test.js` 以 Node `vm` 注入假的 DOM 與 `fetch` 驗證邏輯，不等於瀏覽器實機驗證。
- Tailwind 的自訂色（`rose-primary`、`sage`、`apricot`、`cream` 等）定義在 `public/css/input.css` 的 `@theme`；新增樣式後必須重新 `npm run css:build`（或開 `dev:css`）。
