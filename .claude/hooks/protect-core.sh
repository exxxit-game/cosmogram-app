#!/usr/bin/env bash
# 25.08.2026: правило проекта «ядро не трогать без явной просьбы» — закреплено
# не текстом в CLAUDE.md (модель может забыть), а тут: технический отказ.
# chmod 444 — подстраховка на случай известного бага, когда deny у Edit
# иногда игнорируется (issue #37210 в anthropics/claude-code).
#
# 26.08.2026: было на jq — jq на этой машине не установлен вовсе (проверено:
# PATH и PowerShell Get-Command молчат), хук молча не срабатывал ВСЮ сессию —
# core.js/render.js правились без единого отказа не потому что «разрешение
# уже было», а потому что защита физически не читала вход. Ноль ошибок наружу,
# выглядело как «работает». Переписано на node — он есть точно, и это тот же
# язык, что у остального проекта (закон «чистый JS»).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_name||'')+'\n'+((j.tool_input&&j.tool_input.file_path)||'')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
file=$(printf '%s' "$out" | sed -n '2p')

if [[ "$tool" == "Edit" || "$tool" == "Write" ]]; then
  case "$file" in
    *core.js|*game.js|*render.js|*input.js)
      chmod 444 "$file" 2>/dev/null
      echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Ядровый файл. Правка требует явного разрешения владельца в этом же разговоре, прежде чем что-то менять здесь."}}'
      exit 0
      ;;
  esac
fi
exit 0
