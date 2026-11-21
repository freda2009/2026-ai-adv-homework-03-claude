---
paths:
  - "views/**"
  - "public/js/**"
---

# 前端／模板規則（EJS + Vue 3 CDN + Tailwind 4）

- 頁面 = `views/pages/<name>.ejs`（含 `<div id="app">`）+ `public/js/pages/<pageScript>.js`（`createApp({...}).mount('#app')`）；`pageScript` 由 `src/routes/pageRoutes.js` 傳入。後台頁面放 `views/pages/admin/`。
- 沒有打包流程：共用模組是全域變數（`Auth`、`apiFetch`、`Notification`），載入順序由 `layouts/front.ejs`、`layouts/admin.ejs` 決定。
- 呼叫 API 一律用 `apiFetch`（自動帶 token 與 `X-Session-Id`）；失敗時從 `err.data.message` 取訊息，用 `Notification.show(msg, type)` 顯示。不要直接 `fetch` 受保護的 API。
- 伺服器資料用 `data-*` 屬性傳給 Vue（`data-product-id`、`data-order-id`）。
- 顯示使用者資料用 Vue 的 `{{ }}`、EJS 的 `<%= %>` 或 `textContent`；避免 `innerHTML`、`v-html`、`<%- %>`（`<%- body %>`、`<%- include() %>` 這類版面用途除外）。目前前端沒有任何 `innerHTML` 例外，新程式碼請用 `createElement`＋`textContent`（範例見 `public/js/header-init.js`）。
- 需要登入的頁面腳本開頭呼叫 `Auth.requireAuth()`；後台版面已統一呼叫 `Auth.requireAdmin()`。頁面保護只是 UX，真正的權限在 API。
- Tailwind 自訂色（`rose-primary`、`sage`、`apricot`、`cream`、`text-secondary` 等）定義在 `public/css/input.css` 的 `@theme`；新增 class 或主題色後要 `npm run css:build`（或開 `npm run dev:css`）。`public/css/output.css` 是建置產物，不要手改。
- 介面文案使用繁體中文，風格與現有頁面一致（品牌名「花漾生活」）。
