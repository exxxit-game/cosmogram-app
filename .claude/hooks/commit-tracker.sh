#!/usr/bin/env bash
# 26.09.2026: компаньон repeat-edit-tracker.sh — ставит метку category=commit в тот же
# signal-trail при успешном git commit, это и есть точка "сброса" счётчика пяти попыток
# (успешный коммит = раунд правок завершён благополучно).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d); const cmd=(j.tool_input&&j.tool_input.command)||''; process.stdout.write(/\bgit\s+commit\b/.test(cmd)?'1':'0'); }
  catch(e){ process.stdout.write('0'); }
});
")
if [ "$out" != "1" ]; then exit 0; fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$DIR/lib/signal-trail.mjs" record commit 1 "git commit" >/dev/null 2>&1
exit 0
