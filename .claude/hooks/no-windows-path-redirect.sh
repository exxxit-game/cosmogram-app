#!/usr/bin/env bash
# 19.09.2026 (владелец: «везде поставь технические хуки, где я уже заебался объяснять
# одно и то же»). Реальный, дважды случившийся инцидент 14.09.2026
# (feedback_bash_redirect_path_mangling.md): `> C:\tmp\file.log` в Git Bash не
# перенаправляет туда, куда кажется — обратные слэши и двоеточие уходят почти
# буквально в имя файла внутри текущей POSIX-cwd (`C:tmpfile.log`), тихо, без ошибки.
# Память записана 14.09 — технической защиты от повтора не было, чиню сейчас же.
#
# 29.09.2026 (владелец, ревизия — 6-й документированный случай, см.
# feedback_ask_permission_ненадёжен_29_09): "ask" от PreToolUse-хука уже как минимум
# 5 раз подряд оказывался слишком слабым барьером в этом проекте (см. историю в
# guard-full-suite-warn.sh — 17.09/19.09/24.09/25.09×2) и сегодня же подтверждён живьём
# на protect-core.sh (окно разрешения не показывалось владельцу вообще). Переведено на
# deny — тот же вывод, уже применённый к guard-full-suite-warn.sh и protect-core.sh.
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
# 25.09.2026, adversarial-тестом найдено: одинарные кавычки (> 'C:\...') не ловились
# (регэксп разрешал только "?). Добавлена '?.
pat='>[[:space:]]*["'"'"']?[A-Za-z]:\\'

if [[ "$tool" == "Bash" && "$cmd" =~ $pat ]]; then
  node "$(dirname "$0")/lib/signal-trail.mjs" record windows-path-redirect 2 "> C:\\... вместо /c/..." --trail=rules --half-life-hours=720 --just-culture=atrisk >/dev/null 2>&1
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Redirect (>/>>) целится в путь вида C:\\... — в Git Bash это дважды (14.09.2026) тихо создавало мусорный файл C:tmpXXX прямо в текущей папке вместо реального пути, без единой ошибки. Используй прямые слэши: /c/tmp/... вместо C:\\tmp\\..."}}'
  exit 0
fi
exit 0
