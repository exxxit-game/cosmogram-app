#!/usr/bin/env bash
# 25.09.2026 (владелец, после реального раздутия указателя в MEMORY.md: «я тебе не
# доверяю, сделай страж, чтоб он просто должен быть указателем»). До этого был только
# PostToolUse audit-memory-index.sh (memory-typo-check.sh) — он ловит ПОСЛЕ того, как
# правка уже записана на диск, требует, чтобы я сам заметил и исправил. Не то, что
# просил владелец — механическая защита ДО записи, не после. Это PreToolUse (deny),
# физически не даёт записать длинную строку в MEMORY.md, независимо от того, насколько
# «точным» показалось описание в моменте.
#
# Порог 320 символов на строку — калибровано по реальному распределению текущего файла
# (79 строк, макс 305, медиана 193, 90-й перцентиль 258) — с запасом над максимумом,
# не подогнано искусственно узко.
LINE_LIMIT=320
# 29.09.2026 (владелец: «покрыть все непокрытые моменты» — у CLAUDE.md не было своего
# предохранителя, в отличие от MEMORY.md). Другой стиль текста (ручной перенос строк в
# прозе ~74-97 симв., не длинный однострочный указатель) — свой, более узкий порог,
# калиброванный по РЕАЛЬНОМУ распределению CLAUDE.md (289 строк, макс 97, медиана 74,
# p90 79), с запасом на нормальную прозу, но ловит именно вставку невёрнутого абзаца.
CLAUDE_MD_LINE_LIMIT=250
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const file=(j.tool_input&&j.tool_input.file_path)||'';
    const tool=j.tool_name||'';
    const newString=(j.tool_input&&j.tool_input.new_string)||'';
    const content=(j.tool_input&&j.tool_input.content)||'';
    process.stdout.write(file+'\n'+tool+'\n'+Buffer.from(newString).toString('base64')+'\n'+Buffer.from(content).toString('base64')+'\n');
  }catch(e){ process.stdout.write('\n\n\n\n'); }
});
")
file=$(printf '%s' "$out" | sed -n '1p')
tool=$(printf '%s' "$out" | sed -n '2p')
newStringB64=$(printf '%s' "$out" | sed -n '3p')
contentB64=$(printf '%s' "$out" | sed -n '4p')

case "$file" in
  */MEMORY.md|MEMORY.md)
    payload=""
    if [[ "$tool" == "Edit" ]]; then
      payload=$(printf '%s' "$newStringB64" | base64 -d 2>/dev/null)
    elif [[ "$tool" == "Write" ]]; then
      payload=$(printf '%s' "$contentB64" | base64 -d 2>/dev/null)
    fi
    if [[ -n "$payload" ]]; then
      # 25.09.2026, найдено живым тестом: awk length() считает БАЙТЫ на кириллице, не символы
      # (58 байт против 35 реальных символов) — ложно блокировало бы уже существующие
      # легитимные строки. Счёт через node (реальные символы, тем же способом, каким
      # калибровался порог 320 изначально).
      longest=$(printf '%s' "$payload" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          const lines=d.split('\n');
          let max=0;
          for (const l of lines) if (l.length>max) max=l.length;
          process.stdout.write(String(max));
        });
      ")
      if [[ "$longest" -gt "$LINE_LIMIT" ]]; then
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"MEMORY.md — строка длиннее $LINE_LIMIT символов (реально $longest). Это индекс-указатель, не место для содержания. Сократи строку до короткого указателя, само содержание пиши в целевой файл (rules-ledger-01.md / ledger-project-01.md / отдельный файл), не сюда.\"}}"
        exit 0
      fi
    fi
    ;;
  */CLAUDE.md|CLAUDE.md)
    payload=""
    if [[ "$tool" == "Edit" ]]; then
      payload=$(printf '%s' "$newStringB64" | base64 -d 2>/dev/null)
    elif [[ "$tool" == "Write" ]]; then
      payload=$(printf '%s' "$contentB64" | base64 -d 2>/dev/null)
    fi
    if [[ -n "$payload" ]]; then
      longest=$(printf '%s' "$payload" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          const lines=d.split('\n');
          let max=0;
          for (const l of lines) if (l.length>max) max=l.length;
          process.stdout.write(String(max));
        });
      ")
      if [[ "$longest" -gt "$CLAUDE_MD_LINE_LIMIT" ]]; then
        echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"CLAUDE.md — строка длиннее $CLAUDE_MD_LINE_LIMIT символов (реально $longest). Похоже на невёрнутый абзац — CLAUDE.md пишется прозой с ручным переносом строк (~74-97 симв. обычно), не одной длинной строкой. Перенести строки вручную, не вставлять один длинный кусок текста.\"}}"
        exit 0
      fi
    fi
    ;;
esac
exit 0
