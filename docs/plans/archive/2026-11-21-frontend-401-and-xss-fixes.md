# 修正前端 401 導向與 header innerHTML

- 狀態：已完成
- 建立日期：2026-11-21 ／ 完成日期：2026-11-21
- 相關連結：docs/features/frontend.md「已知陷阱」、.claude/rules/security.md「待追蹤的已知風險」

## 背景
1. `public/js/api.js` 的 `apiFetch` 遇到**任何** 401 都清除登入資料並導向 `/login`。登入頁輸入錯誤密碼時，`/api/auth/login` 回 401 也會觸發，頁面被重新載入，`login.js` 的錯誤提示（`Email 或密碼錯誤`）來不及顯示。這是依程式碼推論，未實測。
2. `public/js/header-init.js` 用 `innerHTML` 把 `user.name`（來自 localStorage，未跳脫）組進 HTML。名稱只顯示給本人，屬自我 XSS，但這是專案中唯一的 `innerHTML`，且文件與規則都把它列為例外。

## User Story
身為使用者，我想要在登入或註冊失敗時看到明確的錯誤提示，而不是頁面被重新載入；身為開發者，我想要前端不再有 `innerHTML` 例外，以便規則可以一律適用。

## Spec
### apiFetch（`public/js/api.js`）
- 對 `/api/auth/login`、`/api/auth/register` 的 401：**不**清除登入資料、**不**導向；照一般非 2xx 處理，`throw { status, data }`，讓 `login.js` 顯示 `err.data.message`。
- 其他 API 的 401：維持清除 `flower_token`／`flower_user` 並導向 `/login`；但目前已在 `/login` 頁時不再導向（避免無謂的重新載入），回傳 `undefined`。
- 網址比對忽略查詢字串。

### header-init（`public/js/header-init.js`）
- 改用 `document.createElement`、`textContent`、`addEventListener` 與 `replaceChildren` 建立 `#auth-nav` 內容，**完全不使用** `innerHTML`。
- 輸出的元素、class 與文字維持不變（不新增 Tailwind class，不需要重建 CSS）。
- 登出按鈕改用 `addEventListener('click', ...)` 取代內嵌 `onclick`。

### 測試
- 專案沒有瀏覽器測試環境，也不新增 jsdom。以 Node `vm` 載入前端腳本，注入假的 `Auth`、`fetch`、`localStorage`、`window`、`document`，驗證上述行為。
- 假 DOM 的 `innerHTML` 設為會丟錯的 setter，確保 `header-init.js` 不會碰它；以含 HTML 的名稱（`<img src=x onerror=alert(1)>`）驗證只會成為 `textContent`。
- 非目標：不做瀏覽器端實機測試、不重寫 `admin-header.ejs`（其 `onclick` 是靜態字串，無使用者資料）。

## Tasks
- [x] 1. 新增 `tests/apiFetch.test.js`，先寫出失敗案例（登入 401 不應導向）。
- [x] 2. 修改 `public/js/api.js`。
- [x] 3. 新增 `tests/headerInit.test.js`，先寫出失敗案例（`innerHTML` 被使用）。
- [x] 4. 修改 `public/js/header-init.js`。
- [x] 5. 執行 `npm test` 確認全過；確認專案中不再有 `innerHTML`。
- [x] 6. 更新文件與規則：frontend.md、TESTING.md、DEVELOPMENT.md、`.claude/rules/{frontend,security}.md`、`security-auditor` agent、CHANGELOG。
- [x] 7. 填寫「執行結果」，狀態改為「已完成」，`git mv` 至 `docs/plans/archive/`。

## 風險
- 沒有瀏覽器實機驗證：`vm` 測試只能證明邏輯，不能證明真實瀏覽器的渲染與導向行為，需在執行結果中誠實註明。
- 假 DOM 若與真實 DOM 行為不一致（例如 `replaceChildren`），測試可能誤判；因此只模擬實際用到的最小方法。

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：
  - `public/js/api.js`：登入／註冊的 401 不清除、不導向，照一般錯誤丟出 `{ status, data }`；其他 401 維持清除並導向，但已在 `/login` 時不重複導向。
  - `public/js/header-init.js`：`#auth-nav` 改用 `createElement`＋`textContent`＋`replaceChildren`，登出改用 `addEventListener`；元素與 class 不變。
  - 新增 `tests/apiFetch.test.js`（6 個）、`tests/headerInit.test.js`（7 個）。
- 與計畫差異：
  - 無結構性差異。測試先寫並確認失敗（`apiFetch` 4 個失敗、`headerInit` 7 個全失敗）後才修改程式碼。
  - 先前文件中「依程式碼推論、未實測」的 401 問題，經測試證實：修正前登入 401 時 `apiFetch` 回傳 `undefined` 並導向 `/login`。
  - 修改 `header-init.js` 時，原本註解中的 `innerHTML` 字樣會讓「原始碼不含 innerHTML」的守門測試誤判，已改寫註解。
- 測試結果：
  - `npm test`：8 個檔案、45 個測試全過（原 32 個加新增 13 個）。
  - `grep` 確認 `public/js`、`views` 下已沒有 `innerHTML`／`outerHTML`／`insertAdjacentHTML`／`v-html`／`document.write`。
  - 開發資料庫 `database.sqlite` 的筆數與庫存與基準相同。
  - **未做瀏覽器實機驗證**：`vm` 測試只驗證邏輯，真實瀏覽器的渲染、導向與 `replaceChildren` 行為需要人工確認。
- 文件更新：docs/features/frontend.md、TESTING.md、DEVELOPMENT.md、CHANGELOG.md、`.claude/rules/frontend.md`、`.claude/rules/security.md`、`.claude/agents/security-auditor.md`。
- 遺留事項：
  - 請在瀏覽器手動確認：登入頁輸入錯誤密碼會顯示「Email 或密碼錯誤」且頁面不重新載入；登入後導覽列顯示姓名與登出；註冊名稱含 `<b>x</b>` 時導覽列顯示原文字。
  - `admin-header.ejs` 仍有靜態的 `onclick="Auth.logout()"`（不含使用者資料，風險低，未更動）。
  - 登入端點沒有速率限制（仍列在 security 規則的待追蹤風險）。
