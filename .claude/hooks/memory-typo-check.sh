#!/usr/bin/env bash
# 23.09.2026 (владелец, прямо, после того как поймал мусор-опечатку "høvenj" в свежем файле
# памяти: "следить — это ровно до сжатия памяти... разве не можешь автоматизировать"). Тот же
# урок, что уже применён к JS в syntax-check-js.sh: инструмент, который надо ПОМНИТЬ запускать
# руками, ничем не лучше "буду внимательнее" — сам подвержен ровно той же уязвимости, которую
# должен чинить. Этот хук зовёт memory/scan-suspect-tokens.mjs автоматически после КАЖДОЙ
# Edit/Write в файл памяти (.claude/projects/*/memory/*.md), без моего участия, без риска
# забыть в спешке или после сжатия диалога.
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

if [[ ("$tool" == "Edit" || "$tool" == "Write") && "$file" == *"\\memory\\"*.md && "$file" != *"MEMORY.md" ]]; then
  memdir=$(dirname "$file")
  scanner="$memdir/scan-suspect-tokens.mjs"
  if [[ -f "$scanner" ]]; then
    basefile=$(basename "$file")
    hit=$(node "$scanner" 2>&1 | grep -F "$basefile:")
    if [[ -n "$hit" ]]; then
      echo "Подозрительные мусор-токены (смешение кириллица/латиница или лишняя диакритика) в $basefile после правки:" >&2
      echo "$hit" >&2
      echo "Проверь глазами — реальная опечатка или известное легитимное слово (тогда добавь в ALLOW внутри scan-suspect-tokens.mjs)." >&2
      exit 2
    fi
  fi
fi

# 24.09.2026 (владелец: «доработай старые правила, проявляй смекалочку») — audit-memory-
# index.sh существовал с 23.09.2026 и ни разу не запускался с тех пор: тот же класс дыры,
# что уже чинил выше для опечаток — инструмент, который нужно ПОМНИТЬ запускать руками,
# не лучше «буду внимательнее». Именно этот инструмент поймал бы сегодняшний кризис (247
# потерянных файлов из 387) сразу, а не после того, как владелец сам заметил. Теперь —
# каждая правка MEMORY.md сама зовёт аудит.
if [[ ("$tool" == "Edit" || "$tool" == "Write") && "$file" == *"\\memory\\MEMORY.md" ]]; then
  memdir=$(dirname "$file")
  auditor="$memdir/audit-memory-index.sh"
  if [[ -f "$auditor" ]]; then
    out=$(bash "$auditor" "$memdir" 2>&1)
    dead=$(printf '%s' "$out" | grep -c "^МЁРТВАЯ:")
    orphans=$(printf '%s' "$out" | grep -oE "Всего сирот-правил: [0-9]+" | grep -oE "[0-9]+")
    size=$(printf '%s' "$out" | grep -oE "^[0-9]+ MEMORY.md" | grep -oE "^[0-9]+")
    if [[ "$dead" -gt 0 || "${orphans:-0}" -gt 0 || "${size:-0}" -gt 17510 ]]; then
      echo "audit-memory-index.sh поймал проблему после правки MEMORY.md:" >&2
      echo "$out" >&2
      exit 2
    fi
  fi
fi
exit 0
