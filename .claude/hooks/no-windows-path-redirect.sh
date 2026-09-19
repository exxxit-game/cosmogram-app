#!/usr/bin/env bash
# 19.09.2026 (владелец: «везде поставь технические хуки, где я уже заебался объяснять
# одно и то же»). Реальный, дважды случившийся инцидент 14.09.2026
# (feedback_bash_redirect_path_mangling.md): `> C:\tmp\file.log` в Git Bash не
# перенаправляет туда, куда кажется — обратные слэши и двоеточие уходят почти
# буквально в имя файла внутри текущей POSIX-cwd (`C:tmpfile.log`), тихо, без ошибки.
# Память записана 14.09 — технической защиты от повтора не было, чиню сейчас же.
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
pat='>[[:space:]]*"?[A-Za-z]:\\'

if [[ "$tool" == "Bash" && "$cmd" =~ $pat ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Redirect (>/>>) целится в путь вида C:\\... — в Git Bash это дважды (14.09.2026) тихо создавало мусорный файл C:tmpXXX прямо в текущей папке вместо реального пути, без единой ошибки. Используй прямые слэши: /c/tmp/... вместо C:\\tmp\\..."}}'
  exit 0
fi
exit 0
