#!/usr/bin/env bash
# 25.09.2026 (владелец: «раз в день бессмысленно, ловить надо мгновенно, у нас и так раз
# в день что-то разъезжается»). Расписание (cron раз в день) слишком редкое для проблемы,
# которая САМА случается примерно раз в день — проверка должна сидеть в том же месте, где
# происходит причина, а не на отдельном таймере. Срабатывает СРАЗУ после каждого
# `git commit` (в любом из двух репозиториев) — не ждёт следующего дня/сессии.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_name||'')+'\n'+((j.tool_input&&j.tool_input.command)||'').replace(/\n/g,' ')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')

if [[ "$tool" == "Bash" && "$cmd" == *"git commit"* ]]; then
  APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
  CREW_DIR="${CREW_DIR:-$APP_DIR/../cosmogram-crew}"
  if [ -d "$APP_DIR/.git" ] && [ -d "$CREW_DIR/.git" ]; then
    app_dirty=$(cd "$APP_DIR" && git status --short 2>/dev/null | wc -l)
    crew_dirty=$(cd "$CREW_DIR" && git status --short 2>/dev/null | wc -l)
    if [[ "$app_dirty" -gt 0 && "$crew_dirty" -eq 0 ]] || [[ "$crew_dirty" -gt 0 && "$app_dirty" -eq 0 ]]; then
      echo "⚠ Сразу после коммита: один репозиторий (app или crew) имеет незакоммиченные правки, другой — ни одной. Если задача трогала игровую логику — вероятно, страж в другом репозитории забыт (feedback_crew_i_app_odna_igra). Проверь СЕЙЧАС, не откладывая." >&2
      exit 2
    fi
  fi
fi
exit 0