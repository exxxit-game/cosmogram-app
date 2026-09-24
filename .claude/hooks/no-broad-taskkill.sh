#!/usr/bin/env bash
# 19.09.2026 (владелец: «везде поставь технические хуки»). Реальный риск, записанный
# 07.09.2026 (feedback_close_tools_when_done.md): убить claude.exe по имени образа
# (/IM) вместо конкретного /PID может уронить ВСЁ приложение целиком, включая ту
# вкладку/сессию, что сама зовёт taskkill, и соседние сессии владельца. Сегодня
# ночью PID-килл (taskkill /F /PID 1748) был правильным и безопасным — этот хук не
# мешает такому вызову, блокирует только широкий /IM-килл по имени образа.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const cmd=(j.tool_input&&j.tool_input.command)||'';
    process.stdout.write((j.tool_name||'')+'\n'+cmd.replace(/\n/g,' ')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')
# 25.09.2026, adversarial-тестом найдено: Windows-команда taskkill и её флаги
# регистронезависимы (taskkill/TASKKILL, /IM//im — одно и то же на Windows),
# а bash == внутри [[ ]] регистрозависим — "taskkill /F /im ..." и "TASKKILL
# /F /IM ..." оба проходили молча. Сравнение теперь по нижнему регистру.
cmd_lower="${cmd,,}"
# 25.09.2026, найдено буквально на собственном коммите этого же фикса: git commit
# с heredoc-сообщением, ОПИСЫВАЮЩИМ пример "taskkill /F /im" текстом (не исполняющим
# его) — ловился тем же условием, потому что проверка ищет подстроки где угодно в
# команде, не различая реальный вызов от цитаты внутри сообщения коммита.
is_git_commit=false
[[ "$cmd_lower" =~ ^[[:space:]]*git[[:space:]]+commit ]] && is_git_commit=true

if [[ "$tool" == "Bash" && "$is_git_commit" == false && "$cmd_lower" == *taskkill* && "$cmd_lower" == *"/im"* ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"taskkill по имени образа (/IM) может задеть ВСЕ процессы этого имени разом — для claude.exe/node.exe это соседние сессии и вкладки владельца, риск уронить всё приложение (feedback_close_tools_when_done.md, 07.09.2026). Убивать только конкретный, заранее подтверждённый /PID."}}'
  exit 0
fi
exit 0
