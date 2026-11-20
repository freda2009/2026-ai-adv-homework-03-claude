#!/usr/bin/env bash
# PostToolUse(Edit|Write)：編輯 CLAUDE.md／AGENTS.md／docs/ 後檢查行數。
# 超過 500 行以 exit 2 回報給 Claude；超過 100 行以 additionalContext 提示精簡。
# 以 node 解析 JSON（不需要 jq）。
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch(e){}})')

case "$file" in
  CLAUDE.md|*/CLAUDE.md|AGENTS.md|*/AGENTS.md|docs/*.md|*/docs/*.md) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

lines=$(wc -l < "$file" | tr -d ' ')
if [ "$lines" -gt 500 ]; then
  echo "$file 有 ${lines} 行，超過 500 行上限：請精簡，或拆分至 docs/ 子資料夾並在主檔保留概述與連結" >&2
  exit 2
fi
if [ "$lines" -gt 100 ]; then
  node -e 'console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:process.argv[1]}}))' \
    "$file 有 ${lines} 行，建議精簡至 100 行內"
fi
exit 0
