#!/usr/bin/env bash
# bash-safety-guard.sh — 30.09.2026 (владелец: «что может стать лучше, где может
# объединиться»). Слияние трёх мелких PreToolUse-хуков на Bash — каждый был по 3
# строки настоящей проверки, но заново парсил tool_input отдельным node-подпроцессом:
# no-double-background.sh, no-windows-path-redirect.sh, no-broad-taskkill.sh. Логика
# каждой проверки перенесена ДОСЛОВНО (не переписана по памяти) — один разбор
# tool_input вместо трёх, три процесса на каждый Bash-вызов вместо девяти (node+bash
# на каждый). Первое совпадение — сразу отказ, дальше не проверяем (тот же порядок,
# что раньше шёл тремя отдельными вызовами хуков в settings.json).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const cmdRaw=(j.tool_input&&j.tool_input.command)||'';
    const bg=!!(j.tool_input&&j.tool_input.run_in_background);
    process.stdout.write((j.tool_name||'')+'\n'+(bg?'1':'0')+'\n'+cmdRaw.replace(/\n/g,'\\\\n')+'\n'+cmdRaw.replace(/\n/g,' ')+'\n');
  }catch(e){ process.stdout.write('\n0\n\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
bg=$(printf '%s' "$out" | sed -n '2p')
cmd_nl=$(printf '%s' "$out" | sed -n '3p')   # переводы строк экранированы \n — для проверки double-background (её regex завязан на конец строки)
cmd=$(printf '%s' "$out" | sed -n '4p')      # переводы строк схлопнуты в пробел — для остальных двух проверок, как раньше

[[ "$tool" == "Bash" ]] || exit 0

# --- 1) no-double-background: завершающий одиночный & при run_in_background:true ---
# (16.09.2026, feedback_dvoynoy_background_lozhnoe_zavershenie.md)
if [[ "$bg" == "1" ]]; then
  if [[ "$cmd_nl" =~ [^\&]\&[[:space:]]*(\#.*)?$ ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Команда уже помечена run_in_background:true, а сама строка ЕЩЁ РАЗ заканчивается на & — это двойной фон: харнесс рапортует «завершено» почти сразу, а настоящий процесс живёт независимо и не отслеживается. Убери завершающий & из самой команды (харнесс уже фонит её целиком), redirect (> log 2>&1) можно оставить."}}'
    exit 0
  fi
fi

# --- 2) no-windows-path-redirect: > C:\... вместо /c/... в Git Bash ---
# (14.09.2026, feedback_bash_redirect_path_mangling.md)
pat='>[[:space:]]*["'"'"']?[A-Za-z]:\\'
if [[ "$cmd" =~ $pat ]]; then
  node "$(dirname "$0")/lib/signal-trail.mjs" record windows-path-redirect 2 "> C:\\... вместо /c/..." --trail=rules --half-life-hours=720 --just-culture=atrisk >/dev/null 2>&1
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Redirect (>/>>) целится в путь вида C:\\... — в Git Bash это дважды (14.09.2026) тихо создавало мусорный файл C:tmpXXX прямо в текущей папке вместо реального пути, без единой ошибки. Используй прямые слэши: /c/tmp/... вместо C:\\tmp\\..."}}'
  exit 0
fi

# --- 3) no-broad-taskkill: taskkill /IM (по имени образа) вместо /PID ---
# (07.09.2026, feedback_close_tools_when_done.md)
cmd_lower="${cmd,,}"
is_git_commit=false
[[ "$cmd_lower" =~ ^[[:space:]]*git[[:space:]]+commit ]] && is_git_commit=true
if [[ "$is_git_commit" == false && "$cmd_lower" == *taskkill* && "$cmd_lower" == *"/im"* ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"taskkill по имени образа (/IM) может задеть ВСЕ процессы этого имени разом — для claude.exe/node.exe это соседние сессии и вкладки владельца, риск уронить всё приложение (feedback_close_tools_when_done.md, 07.09.2026). Убивать только конкретный, заранее подтверждённый /PID."}}'
  exit 0
fi

exit 0
