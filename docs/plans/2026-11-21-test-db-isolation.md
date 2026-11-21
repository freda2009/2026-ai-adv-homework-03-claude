# 測試資料庫隔離

- 狀態：草稿
- 建立日期：2026-11-21 ／ 完成日期：—
- 相關連結：docs/TESTING.md「常見陷阱」、docs/architecture/database.md

## 背景
`src/database.js` 把資料庫路徑寫死為專案根目錄的 `database.sqlite`，測試直接載入 `app.js`，因此：
- 測試會寫入開發資料（新增使用者、訂單）。
- `orders.test.js`、`adminOrders.test.js` 每次各下單一件 `products[0]`，多次執行後庫存耗盡，結帳回 `STOCK_INSUFFICIENT`。
- 測試不可與 `npm start` 同時執行。
- 測試依賴 `.env` 的 `JWT_SECRET`，且 `getAdminToken()` 寫死預設管理員帳密。

## User Story
身為開發者，我想要讓測試使用獨立且用完即丟的資料庫，以便隨時執行 `npm test` 而不破壞開發資料、也不會因庫存耗盡而失敗。

## Spec
- `src/database.js` 新增環境變數 `DB_PATH`：未設定時行為不變（`<專案根>/database.sqlite`）；設為 `:memory:` 時使用記憶體資料庫。
- `vitest.config.js` 以 `test.env` 設定 `DB_PATH=:memory:`、`JWT_SECRET`（測試用固定值）、`ADMIN_EMAIL`、`ADMIN_PASSWORD`（與 `tests/setup.js` 寫死的值一致）。`dotenv` 預設不覆寫既有環境變數，所以測試不再依賴 `.env`。
- 每個測試檔載入全新的 `app` 與資料庫（含 seed），檔案之間資料互不影響。這項假設需驗證（見 Tasks 3）。
- `tests/setup.js` 加安全閥：載入後檢查 `db.memory === true`，否則直接丟錯中止，避免未來設定被改壞時又寫進開發資料庫。
- 生產行為不變：`npm start` 仍使用 `database.sqlite`，不新增必填變數。
- 非目標：不重構成 app factory、不引入資料庫遷移、不調整註冊的 bcrypt cost（測試速度另案處理）。

### 驗收條件
1. 執行 `npm test` 前後，`database.sqlite` 的大小與修改時間不變，且其中 `orders`、`users` 筆數不變。
2. 連續執行 `npm test` 10 次全部通過（不再因庫存耗盡失敗）。
3. 移除 `.env`（或清空 `JWT_SECRET`）後 `npm test` 仍通過。
4. 與 `npm start` 同時執行 `npm test` 不互相影響。
5. 將 `DB_PATH` 從測試設定移除時，安全閥讓測試明確失敗而不是默默寫入開發資料庫。

## Tasks
- [ ] 1. 記錄基準：目前 `database.sqlite` 大小、修改時間、`orders`／`users` 筆數（備份一份副本供比對，不提交）。
- [ ] 2. 修改 `src/database.js`：讀取 `DB_PATH`，相對路徑以專案根目錄解析。
- [ ] 3. 驗證 Vitest 2.1.9 每個測試檔會得到獨立的模組實例（例如在兩個檔案各印出 `db` 內 `users` 筆數）；若共用同一實例，改用每檔獨立的暫存檔案路徑方案並更新 Spec。
- [ ] 4. 修改 `vitest.config.js` 的 `test.env`。
- [ ] 5. 修改 `tests/setup.js` 加入 `db.memory` 安全閥。
- [ ] 6. 依驗收條件 1–5 逐項驗證，並記錄結果。
- [ ] 7. 更新文件與規則：
  - `docs/TESTING.md`：移除「沒有資料庫隔離」「庫存會被持續消耗」「JWT_SECRET 必須在 .env」等陷阱，改述新機制。
  - `docs/DEVELOPMENT.md` 環境變數表新增 `DB_PATH`；`docs/architecture/database.md` 更新「路徑寫死」的說明。
  - `CLAUDE.md`「必要遵守項目」中關於測試無隔離的那一條。
  - `.claude/rules/testing.md`、`.claude/agents/test-runner.md` 中關於無隔離與庫存耗盡的敘述。
  - `docs/CHANGELOG.md` 新增一筆。
- [ ] 8. 完成後填寫「執行結果」，狀態改為「已完成」，`git mv` 至 `docs/plans/archive/`。

## 風險
- 若 Vitest 在同一 worker 內重用模組快取，`:memory:` 資料庫會在檔案間共用，隔離不完整（Tasks 3 專門驗證）。
- `:memory:` 下 `journal_mode = WAL` 不生效，屬預期行為，不影響測試。
- 既有測試若隱含依賴先前檔案留下的資料，改為每檔獨立後可能失敗；目前閱讀程式碼判斷各檔都自行建立所需資料，但需實跑確認。

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：
- 與計畫差異：
- 測試結果：
- 文件更新：
- 遺留事項：
