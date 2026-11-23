# GitHub Actions 自動測試（Unit＋Integration）

- 狀態：進行中
- 建立日期：2026-11-23 ／ 完成日期：
- 相關連結：[2026-11-23-test-pipeline](./archive/2026-11-23-test-pipeline.md)

## User Story
身為開發者，我想要在程式碼推上 GitHub 時自動執行 Unit 與 Integration 測試，以便及早發現改壞的地方。

## Spec
- 檔案：`.github/workflows/test.yml`。
- 觸發：push 任何分支、對 `main` 的 pull request、手動 `workflow_dispatch`；同一分支有新的推送時取消舊的執行。
- 環境：`ubuntu-latest`、Node.js 24（LTS；`better-sqlite3` 12.8.0 只支援 Node 20～25，Node 26 沒有預編譯檔）、`npm ci`（使用 `package-lock.json`，以 setup-node 快取 npm）。
- 權限最小化：`permissions: contents: read`，不使用任何 secrets。
- 兩個明確的測試步驟：`npm run test:unit`、`npm run test:integration`。
- 不執行 Playwright E2E、不啟動前端或後端服務、不需要 `.env`（測試環境變數在 `vitest.config.js`，資料庫為記憶體 SQLite）。
- 驗收：YAML 格式正確；乾淨 clone（只有已提交的檔案）＋ `npm ci` 後兩個指令都通過；推上 GitHub 後 Actions 狀態為通過。

## Tasks
- [x] 1. 建立 `.github/workflows/test.yml`
- [x] 2. 驗證 YAML 格式與 workflow 結構
- [x] 3. 以乾淨 clone 模擬 CI：`npm ci`、`npm run test:unit`、`npm run test:integration`（含 Node 24）
- [x] 4. 更新文件：TESTING、README、ARCHITECTURE、DEVELOPMENT、CLAUDE.md、CHANGELOG、`.claude/rules/testing.md`
- [ ] 5. 推上 GitHub 確認 Actions 通過（需使用者提供 remote 並同意 push）

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：
- 與計畫差異：
- 測試結果：
- 文件更新：
- 遺留事項：
