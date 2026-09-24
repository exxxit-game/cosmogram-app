#!/usr/bin/env bash
# 19.09.2026 (владелец, напрямую, после того как ноут завис ~40 минут):
# правило «не запускать полный набор guard.mjs в фоне без присмотра» уже
# существовало как ABSOLUTE в памяти (feedback_polny_guard_progon_ne_bez_prismotra.md,
# с 17.09.2026) — и всё равно было нарушено в этой же самой ночной сессии.
# Тот же урок, что уже применён к protect-core.sh/version-guard.sh: текст в
# памяти не держит поведение под давлением, технический hook — держит.
# Правило: полный прогон guard.mjs (без --only=) можно запускать, но НЕ в
# фоне (run_in_background) без явного подтверждения владельца каждый раз —
# каждый Chromium-контекст стражей реально грузит слабую машину.
#
# 24.09.2026 (владелец, тот же класс ошибки в ЭТОЙ ЖЕ сессии, уже ПОСЛЕ того,
# как этот hook существовал): условие ловило только явный run_in_background:true,
# а полный прогон без флага сам ушёл в фон по истечении таймаута Bash-инструмента
# (600с) — hook не сработал, потому что bg был false в момент вызова, хотя
# результат («долгий прогон на слабой машине без присмотра») тот же самый. Плюс
# теперь у проекта есть `.github/workflows/guard.yml` (22.09.2026) — полный набор
# должен идти ТАМ, не на ноутбуке, вообще без исключений, независимо от фона.
# Условие ниже больше не требует bg==1 — спрашивает про ЛЮБОЙ полный прогон.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const cmd=(j.tool_input&&j.tool_input.command)||'';
    const bg=!!(j.tool_input&&j.tool_input.run_in_background);
    process.stdout.write((j.tool_name||'')+'\n'+cmd.replace(/\n/g,' ')+'\n'+(bg?'1':'0')+'\n');
  }catch(e){ process.stdout.write('\n\n0\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')
bg=$(printf '%s' "$out" | sed -n '3p')

if [[ "$tool" == "Bash" && "$cmd" == *guard.mjs* && "$cmd" != *--only=* ]]; then
  # 25.09.2026: подключено к живому трейлу rules — повторные ПОПЫТКИ локального
  # полного прогона в течение сессии (даже каждая по отдельности пойманная) сами
  # по себе значимый паттерн, стоящий отслеживания через сессии, не только эта одна.
  node "$(dirname "$0")/lib/signal-trail.mjs" record guard-full-suite-attempt 3 "попытка полного прогона локально" --trail=rules --half-life-hours=720 --just-culture=atrisk >/dev/null 2>&1
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Полный набор guard.mjs (без --only=) — эта же ошибка уже вешала машину на ~40-50 минут (17.09, 19.09.2026) и повторилась 24.09.2026 (ушёл в фон по таймауту Bash, не по явному run_in_background — старая версия этого hook такое не ловила). У проекта есть .github/workflows/guard.yml — полный прогон должен идти там, не локально, независимо от фона. Если это правда нужно локально — подтвердите явно, почему CI сейчас не годится."}}'
  exit 0
fi
exit 0
