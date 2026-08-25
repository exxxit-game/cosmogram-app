#!/usr/bin/env bash
# 25.08.2026: правило проекта «ядро не трогать без явной просьбы» — закреплено
# не текстом в CLAUDE.md (модель может забыть), а тут: технический отказ.
# chmod 444 — подстраховка на случай известного бага, когда deny у Edit
# иногда игнорируется (issue #37210 в anthropics/claude-code).
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name')
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')
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
