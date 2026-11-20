---
paths:
  - "tests/**"
  - "vitest.config.js"
---

# 測試規則（Vitest + supertest）

- 檔案放 `tests/<資源>.test.js`，開頭 `const { app, request, getAdminToken, registerUser } = require('./setup');`。`globals: true`，不需 import `describe`／`it`／`expect`。
- 需要使用者用 `registerUser()`（隨機 email）；需要管理員用 `getAdminToken()`（寫死 `admin@hexschool.com`／`12345678`）。
- 商品 id 從 `GET /api/products` 取得，不寫死。
- 成功斷言 `error` 為 `null`；失敗斷言 `data` 為 `null` 且 `error` 不為 `null`；同時檢查 HTTP 狀態碼。
- 每個檔案自行準備資料，不依賴其他檔案的執行順序（`sequence.files` 是否生效未驗證）。
- 測試沒有資料庫隔離：會寫入開發用的 `database.sqlite` 並消耗 `products[0]` 的庫存。不要寫會大量扣庫存或刪除既有 seed 商品的測試。
- 新增端點時至少補：成功案例、驗證失敗（400）、未授權（401）／權限不足（403）、不存在（404）。
- 完整說明見 docs/TESTING.md。
