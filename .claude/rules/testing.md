---
paths:
  - "test/**"
  - "vitest.config.js"
---

# 測試規則（Vitest + supertest）

- 檔案放 `test/<資源>.test.js`（資料夾是 `test/`，不是 `tests/`），開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`。`globals: true`，不需 import `describe`／`it`／`expect`。
- 需要使用者用 `registerUser()`（隨機 email）；需要管理員用 `getAdminToken()`（寫死 `admin@hexschool.com`／`12345678`）。
- 商品 id 從 `GET /api/products` 取得，不寫死。
- 成功斷言 `error` 為 `null`；失敗斷言 `data` 為 `null` 且 `error` 不為 `null`；同時檢查 HTTP 狀態碼。
- 每個測試檔自行準備資料，不依賴其他檔案；`sequence.files` 實測沒有生效，不要依賴執行順序。
- 測試使用記憶體資料庫（`vitest.config.js` 的 `test.env.DB_PATH=:memory:`），每個測試檔各有一份全新資料（含 seed）。不要移除該設定；`test/setup.js` 的 `db.memory` 安全閥會在連到實體資料庫時中止測試。同一檔案內的測試共用資料庫，會看到彼此的資料。
- `getAdminToken()` 的帳密需與 `test.env.ADMIN_EMAIL`／`ADMIN_PASSWORD` 一致。
- 新增端點時至少補：成功案例、驗證失敗（400）、未授權（401）／權限不足（403）、不存在（404）。
- 純邏輯模組（`src/utils/*.js`，如 `shipping.js`）寫單元測試，直接 `require` 模組，不需要 `setup.js`；邊界值（如免運門檻 1,499／1,500）要明確列出。
- 完整說明見 docs/TESTING.md。
