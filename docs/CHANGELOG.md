# 更新日誌

格式：新的在上。每項功能完成並歸檔計畫時，在此新增一筆，並連結到 `plans/archive/` 的計畫。

## 2026-11-21

### 測試
- 測試改用記憶體資料庫：`src/database.js` 新增 `DB_PATH` 環境變數，`vitest.config.js` 的 `test.env` 設為 `:memory:`，並提供測試用的 `JWT_SECRET` 與管理員帳密。測試不再讀寫 `database.sqlite`、不再消耗庫存，也不需要 `.env`。
- `tests/setup.js` 新增安全閥：資料庫不是記憶體資料庫時中止測試。
- 實測確認 `vitest.config.js` 的 `sequence.files` 沒有生效。
- 計畫：[test-db-isolation](./plans/2026-11-21-test-db-isolation.md)

## 2026-11-20

### 文件
- 以 init-project-docs 建立專案文件結構：`CLAUDE.md`、`docs/`（README、ARCHITECTURE、DEVELOPMENT、FEATURES、TESTING、CHANGELOG、plans）。
- 記錄既有行為：雙模式購物車、訂單 transaction、模擬付款、後台商品／訂單管理。
- 記錄既有的已知限制（見 [TESTING.md](./TESTING.md)、[features/orders.md](./features/orders.md)、[features/frontend.md](./features/frontend.md)）。
