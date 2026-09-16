#!/usr/bin/env bash
# 16.09.2026 (исследование по просьбе владельца: "какие плагины/скрипты уберут у тебя лишние
# действия и ошибки"). node --check <файл> после Edit/Write на .js — то, что раньше делалось
# руками и иногда пропускалось под спешкой ("Smoke-check after bulk edit" в памяти — я уже
# писала это правило текстом, здесь оно становится PostToolUse-хуком: не совет, а сама проверка
# гоняется всегда, автоматически, без риска забыть. PostToolUse не блокирует (действие уже
# случилось) — exit 2 + stderr просто возвращает ошибку синтаксиса в контекст следующим ходом,
# тот же приём «самокоррекции», что и auto-lint/auto-test хуки.
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

if [[ ("$tool" == "Edit" || "$tool" == "Write") && "$file" == *.js && -f "$file" ]]; then
  err=$(node --check "$file" 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "Синтаксическая ошибка в $file после правки:" >&2
    echo "$err" >&2
    exit 2
  fi
fi
exit 0
