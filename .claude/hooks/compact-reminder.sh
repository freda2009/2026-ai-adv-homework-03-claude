#!/usr/bin/env bash
# SessionStart(compact)：context 壓縮後重新注入 CLAUDE.md 的關鍵規則。
cat <<'EOF'
【專案關鍵規則提醒：作業1:花漾生活 Flower Life】
- API 一律回 { data, error, message }；失敗時 data 為 null、error 為錯誤碼、message 為繁體中文。
- SQL 一律用 db.prepare 參數化；後端是 CommonJS；金額為整數。
- 受保護路由先掛 authMiddleware，後台再加 adminMiddleware（順序不可對調）。
- 新增或修改路由要同步更新 @openapi 註解。
- 不要讀取、輸出或提交 .env；測試沒有資料庫隔離，會寫入 database.sqlite 並消耗庫存。
- 功能開發先複製 docs/plans/_template.md 建立計畫；完成後填寫「執行結果」並移至 docs/plans/archive/。
- CLAUDE.md 與 docs/ 每份文件不超過 500 行（目標 100 行內）。詳細文件從 ./docs/README.md 開始。
EOF
exit 0
