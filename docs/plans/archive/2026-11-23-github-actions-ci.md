# GitHub Actions 自動測試（Unit＋Integration）

- 狀態：已完成
- 建立日期：2026-11-23 ／ 完成日期：2026-11-23
- 相關連結：[2026-11-23-test-pipeline](./2026-11-23-test-pipeline.md)、[Actions run 45206954603](https://github.com/freda2009/2026-ai-adv-homework-03-claude/actions/runs/45206954603)

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
- [x] 5. 推上 GitHub 確認 Actions 通過（需使用者提供 remote 並同意 push）

## 執行結果（完成後填寫，歸檔前必填）
- 實際變更：新增 `.github/workflows/test.yml`（commit `1c723d9`，分支 `feature/github-actions`）。依使用者提供的網址設定 `origin` 為 `freda2009/2026-ai-adv-homework-03-claude`（公開 repo），推送 `main` 與 `feature/github-actions`；推送前掃描 19 個 commit，只有公開測試值，沒有 `.env`、資料庫或私密金鑰。
- 與計畫差異：
  - checkout 加上 `submodules: true`：乾淨 clone 模擬時發現沒有 submodule `.claude/skills/ecpay`，`ecpay.test.js` 會略過 7 個綠界官方向量測試（unit 只剩 82 個）。
  - action 版本用 `actions/checkout@v7`、`actions/setup-node@v7`（v7.0.1／v7.1.0，皆發布滿兩週）。
  - Claude Code sandbox 內 `.git/config` 不可寫、也讀不到 gh 登入資訊，設定 remote、推送與查詢 Actions 在 sandbox 外執行；推送時以 `gh auth git-credential` 提供認證，沒有修改全域 git 設定。
- 測試結果：
  - YAML：`yaml` 套件嚴格模式解析＋SchemaStore `github-workflow.json`（ajv）驗證通過；另以 4 種故意寫壞的版本（缺 `runs-on`、同時有 `uses` 與 `run`、鍵名錯字、縮排錯誤）確認驗證會失敗。
  - 本機模擬：乾淨 clone＋官方 Node 24.22.3（核對 SHA256）＋`npm ci`：unit 89、integration 96 通過，未產生 `database.sqlite`。
  - GitHub Actions：run 45206954603（push `feature/github-actions`）**success**，約 20 秒；Node 24.22.3、submodule `e8cc595`、unit 89、integration 96，沒有警告或錯誤註記。
- 文件更新：TESTING（新增 CI 章節）、README、ARCHITECTURE、DEVELOPMENT、CLAUDE.md、CHANGELOG、`.claude/rules/testing.md`。
- 遺留事項：
  - `feature/github-actions` 尚未合併回 `main`；合併並推送 `main` 後會再觸發一次 Actions。
  - npm 11.19 對 better-sqlite3、bcrypt、esbuild、@parcel/watcher 的安裝腳本顯示 `install-scripts` 提醒（目前仍會執行）；若日後 npm 預設封鎖安裝腳本，需在 `package.json` 允許這幾個套件，否則 better-sqlite3 會缺少原生模組。
