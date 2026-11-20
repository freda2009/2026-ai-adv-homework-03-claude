#!/usr/bin/env bash
# PreToolUse(Edit|Write)：阻止編輯機密、鎖定檔與資料庫檔。
# 以 node 解析 stdin JSON（專案本來就依賴 node，不需要 jq）。
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch(e){}})')
[ -z "$file" ] && exit 0

base=$(basename "$file")
case "$base" in
  .env.example) exit 0 ;;
  .env|.env.*|*.lock|package-lock.json|*.sqlite|*.sqlite3|*.sqlite-shm|*.sqlite-wal|*.db)
    echo "禁止編輯受保護檔案：$file（機密、鎖定檔或資料庫檔）。如確實需要，請由使用者手動修改。" >&2
    exit 2
    ;;
esac

case "$file" in
  */.git/*|*/node_modules/*)
    echo "禁止編輯：$file" >&2
    exit 2
    ;;
esac

exit 0
