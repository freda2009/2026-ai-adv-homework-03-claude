# CLAUDE.md

## 專案概述
作業1:花漾生活 Flower Life — 花卉電商 REST API 加前後台頁面。
Node.js（CommonJS）+ Express 4 + better-sqlite3（SQLite）+ JWT/bcrypt + EJS + Vue 3（CDN）+ Tailwind CSS 4 + Vitest/supertest + Playwright。

## 常用指令
```bash
npm install
cp .env.example .env     # 必填 JWT_SECRET，否則 server.js 直接結束
npm start                # css:build 後啟動，預設 http://localhost:3001
npm run dev:server       # 只啟動伺服器（不重建 CSS）
npm run dev:css          # Tailwind watch
npm run openapi          # 由 src/routes/*.js 的 @openapi 註解產生 openapi.json
npm run postman          # openapi.json → postman/flower-life.postman_collection.json（不提交）
npm test                 # unit＋integration（記憶體資料庫，不碰 database.sqlite，不需 .env）
npm run test:unit        # test/unit
npm run test:integration # test/integration（supertest）
npm run test:e2e         # Playwright，需先 npm start；會在開發資料庫建立已付款訂單
```

## 關鍵規則
- API 一律回 `{ data, error, message }`：成功時 `error: null`；失敗時 `data: null`、`error` 為錯誤碼（如 `VALIDATION_ERROR`、`NOT_FOUND`），`message` 為繁體中文。
- SQL 一律用 `db.prepare(...)` 參數化；字串拼接只允許程式內固定值（如 cartRoutes 的 `owner.field`）。
- 新增或修改路由時，同步更新該檔的 `@openapi` JSDoc 註解。
- 後端是 CommonJS（`require`／`module.exports`）；前端是 Vue 3 CDN，沒有打包流程。
- 金額（`price`、`total_amount`、運費）一律是整數，不使用小數。
- 運費只由後端 `src/utils/shipping.js` 計算（宅配 120、滿 1,500 免基本運費；超商 60；偏遠 +200；急件 +250）；`total_amount = subtotal_amount + shipping_fee`，不接受前端傳入金額；前端預估用 `GET /api/shipping/quote`（見 docs/features/shipping.md）。
- 測試放在 `test/unit`、`test/integration`、`test/e2e`（不是 `tests/`）；純邏輯模組放 `src/utils/` 並寫單元測試（見 docs/TESTING.md）。
- 訂單只能由後端呼叫綠界 QueryTradeInfo、驗證通過（CheckMacValue、MerchantTradeNo、金額、`TradeStatus=1`）後變成 `paid`；不信任瀏覽器帶回的付款結果，不新增繞過驗證的付款端點（見 docs/features/payment-ecpay.md）。
- 功能開發先複製 docs/plans/_template.md 建立計畫；完成後填寫「執行結果」並移至 docs/plans/archive/。

## 詳細文件
<!-- 以純路徑引用，需要時再讀取；勿改成 @ 匯入（會整份載入 context） -->
- ./docs/README.md — 技術棧、快速開始、文件索引
- ./docs/ARCHITECTURE.md — 目錄結構、啟動流程、認證、回應格式（路由表與 DB Schema 在 ./docs/architecture/）
- ./docs/DEVELOPMENT.md — 開發規範、命名規則、環境變數、新增功能流程、計畫歸檔
- ./docs/FEATURES.md — 功能清單與行為描述（各區塊細節在 ./docs/features/）
- ./docs/TESTING.md — 測試規範與已知陷阱
- ./docs/CHANGELOG.md — 更新日誌
- ./docs/plans/ — 開發計畫（完成後移至 archive/）

## 必要遵守項目
- 不要讀取、輸出或提交 `.env`；機密只放 `.env`，範例值放 `.env.example`。綠界 HashKey／HashIV 只讀環境變數，不寫進程式碼。
- 測試必須使用記憶體資料庫（`vitest.config.js` 的 `DB_PATH=:memory:`，`test/integration/setup.js` 有安全閥）；不要移除這個設定，也不要讓測試連到 `database.sqlite`。
- 受保護的路由必須掛 `authMiddleware`；後台路由再加 `adminMiddleware`（兩者順序不可對調）。
- 前端渲染使用者資料用 `{{ }}` 或 `textContent`；避免 `innerHTML`／`v-html` 插入未跳脫內容。
- 本檔與 docs/ 下每份文件不超過 500 行（目標 100 行內）；超過時精簡或拆至 docs/ 子資料夾，本檔只留概述與連結。
