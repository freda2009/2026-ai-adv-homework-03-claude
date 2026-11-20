#!/usr/bin/env bash
# PostToolUse(Edit|Write)：編輯 src/routes/*.js 後重新產生 openapi.json。
# 產生失敗（通常是 @openapi 註解的 YAML 有誤）時以 exit 2 回報給 Claude。
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch(e){}})')

case "$file" in
  */src/routes/*.js) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(npm run openapi 2>&1); then
  echo "openapi.json 產生失敗，請檢查 $file 的 @openapi 註解：" >&2
  echo "$out" | tail -n 15 >&2
  exit 2
fi
exit 0
