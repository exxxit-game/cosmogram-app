#!/usr/bin/env bash
# 26.08.2026: Закон К10 (кэшбастер, cosmogram-crew/.knowledge Каталог ошибок) —
# «bump_version — обязательный финальный шаг каждого релиза для синхронизации
# sw.js, ?v= и GAME_VERSION». Нарушено дважды подряд в одной сессии (коммиты
# 837fab0/b471920) — версия текстом в CLAUDE.md не удержала. Тот же приём, что
# у protect-core.sh: не совет, технический отказ прямо на git commit.
#
# На node, не jq — jq на этой машине не установлен (см. запись в protect-core.sh
# о том же самом, найдено при первом же тесте ЭТОГО хука: он молча не сработал).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_name||'')+'\n'+((j.tool_input&&j.tool_input.command)||'')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')

if [[ "$tool" == "Bash" && "$cmd" == git\ commit* ]]; then
  staged=$(git diff --cached --name-only)
  needs_bump=false
  for f in js/core.js js/game.js js/render.js js/input.js js/ach.js js/skymail.js \
           js/blackbox.js js/card.js js/forge.js js/goldstar.js js/gyro.js \
           js/music.js js/planetarium.js js/star.js js/sync.js js/ui.js js/i18n.js \
           index.html sw.js; do
    if echo "$staged" | grep -qx "$f"; then needs_bump=true; fi
  done
  if [[ "$needs_bump" == true ]]; then
    ver_touched=$(git diff --cached -- js/core.js 2>/dev/null | grep -c "GAME_VERSION=")
    if [[ "$ver_touched" -eq 0 ]]; then
      echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Закон К10: в этом коммите меняются игровые файлы, а GAME_VERSION (js/core.js) не тронута. Адрес модуля (?v=) не сменится — браузер вправе отдать старый кэш. Сначала поднять версию в трёх местах (sw.js const V, js/core.js GAME_VERSION, все ?v= в index.html — bump_version.py или его ручной эквивалент), потом коммит."}}'
      exit 0
    fi
  fi
fi
exit 0
