#!/usr/bin/env bash
# 16.09.2026: CLAUDE.md уже запрещает `git add -A`/`git add .` словами («прежде staging —
# добавлять конкретные файлы по имени») — тот же перевод текстового правила в технический
# отказ, что уже сделан для ядра (protect-core.sh) и версии (version-guard.sh). Широкий add
# может незаметно подхватить .env/секрет/чужой временный файл рядом; список файлов по имени —
# всегда осознанный выбор, не «что накопилось».
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_name||'')+'\n'+((j.tool_input&&j.tool_input.command)||'').replace(/\n/g,'\\n')+'\n');
  }catch(e){ process.stdout.write('\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')

if [[ "$tool" == "Bash" ]]; then
  # каждая git-команда в составной строке (после &&/;/|) проверяется отдельно — широкий add
  # мог бы прятаться не первым в цепочке
  if printf '%s' "$cmd" | grep -qE '(^|[;&|]) *git +add +(-A\b|--all\b|\.( |$)|-\.( |$))'; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git add -A/--all/. добавляет всё накопившееся в рабочем дереве, не осознанный список — правило CLAUDE.md. Укажи конкретные файлы по имени (git add path/to/file1 path/to/file2)."}}'
    exit 0
  fi
fi
exit 0
