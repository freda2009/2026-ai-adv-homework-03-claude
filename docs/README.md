# 作業3:花漾生活 Flower Life

花卉電商示範專案：訪客可瀏覽商品、加入購物車；登入後可選擇配送方式（宅配／超商取貨，含偏遠地區與當日急件加價）結帳，運費由後端計算並計入訂單總額，再以綠界（ECPay）付款；管理員可管理商品與查看訂單。

## 技術棧

| 層 | 技術 |
|----|------|
| 執行環境 | Node.js（CommonJS，本機測試版本 v25；CI 使用 Node 24） |
| 後端 | Express 4.16、better-sqlite3 12（WAL）、jsonwebtoken、bcrypt、cors、dotenv |
| 前端 | EJS 5 版面 + Vue 3（unpkg CDN，無打包）、Tailwind CSS 4（CLI 建置） |
| 金流 | 綠界 ECPay 全方位金流（AIO），測試環境；本機以 QueryTradeInfo 主動查詢驗證付款（見 [features/payment-ecpay.md](./features/payment-ecpay.md)） |
| API 文件 | swagger-jsdoc（只產出 `openapi.json`，專案內沒有 Swagger UI 路由） |
| 測試 | Vitest 2 + supertest、Playwright（E2E）；GitHub Actions 在 push／PR 時執行 unit＋integration（見 [TESTING.md](./TESTING.md#cigithub-actions)） |

## 快速開始

```bash
cp .env.example .env      # 編輯 .env，至少設定 JWT_SECRET
npm install
npm start                 # 建置 CSS 並啟動，http://localhost:3001
```

首次啟動會建立 `database.sqlite`，並 seed 管理員帳號與 8 項花卉商品。
預設管理員：`admin@hexschool.com` / `12345678`（可由 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 覆寫）。

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | `css:build` 後執行 `node server.js` |
| `npm run dev:server` | 只啟動伺服器 |
| `npm run dev:css` | Tailwind 監聽模式（輸出 `public/css/output.css`） |
| `npm run css:build` | Tailwind 壓縮建置 |
| `npm run openapi` | 產生 `openapi.json`（寫在專案根目錄） |
| `npm run postman` | 產生 `openapi.json` 並轉成 `postman/flower-life.postman_collection.json`（不提交） |
| `npm test` | unit＋integration（Vitest，記憶體資料庫） |
| `npm run test:unit` | `test/unit` |
| `npm run test:integration` | `test/integration`（supertest） |
| `npm run test:e2e` | Playwright 測已啟動的站台與綠界付款（先 `npm start`） |

## 文件索引

| 文件 | 內容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、認證、回應格式 |
| [architecture/api-routes.md](./architecture/api-routes.md) | 完整路由表 |
| [architecture/database.md](./architecture/database.md) | 資料表 schema、seed 資料 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 命名規則、環境變數、新增功能與計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 功能總覽；細節見 [features/](./features/)（運費規則：[features/shipping.md](./features/shipping.md)） |
| [TESTING.md](./TESTING.md) | 測試指令、檔案、資料隔離；E2E 與 Postman 見 [testing/](./testing/) |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
| [plans/](./plans/) | 進行中計畫；已完成的在 `plans/archive/` |
