#!/usr/bin/env bash
# 30.09.2026 (владелец: «полностью применил метод или отступил на первой сложности?»).
# «Визуальное — только через макет» механизировано ЖЁСТКИМ deny только для ui.js/index.html
# (protect-core.sh) — остальные файлы, где реально рисуется то, что видит игрок
# (forge.js/ach.js/cinema.js/card.js/star.js/goldstar.js/finish.js/partitura.js), там
# держатся ТОЛЬКО как текст в CLAUDE.md. Жёсткий deny туда — плохая идея (в этих файлах
# вперемешку и вёрстка, и обычная игровая логика, блокировка душила бы легитимные правки
# постоянными PROTECT_CORE_MODE=off). Средний вариант между «жёсткий блок» и «ничего» —
# мягкое напоминание PostToolUse, не мешает работе, не требует обхода. Не различает
# визуальную правку от логической внутри файла (сознательно просто — усложнять ценой
# надёжности не стоит), но подсказка после правки лучше, чем полное молчание.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    process.stdout.write((j.tool_input&&j.tool_input.file_path)||'');
  }catch(e){ process.stdout.write(''); }
});
")
file_lower=$(printf '%s' "$out" | tr '[:upper:]' '[:lower:]')
case "$file_lower" in
  *forge.js|*ach.js|*cinema.js|*card.js|*star.js|*goldstar.js|*finish.js|*partitura.js)
    echo "💡 Напоминание: этот файл рисует то, что видит игрок. Если правка визуальная (не только логика/числа) — правило «визуальное только через макет» (CLAUDE.md) просит сначала показать макет, не вносить в игру напрямую." >&2
    ;;
esac
exit 0
