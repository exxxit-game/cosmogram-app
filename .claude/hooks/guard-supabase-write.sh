#!/usr/bin/env bash
# 22.09.2026 (владелец, по итогам ревизии инструментов после марафона): та же логика, что
# уже применена к deploy_edge_function (guard-deploy-content.sh) — механическая проверка
# для ЛЮБОЙ записи в живую внешнюю систему, не текстовое правило, которое можно пропустить
# в спешке. Покрывает execute_sql (только явно деструктивные запросы) и apply_migration
# (только пустой/заглушечный SQL — реальные миграции проходят, как обычно, только
# пустышки блокируются).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{
    const j=JSON.parse(d);
    const ti=j.tool_input||{};
    const toolName=String(j.tool_name||'');
    if(/execute_sql/i.test(toolName)){
      const q=String(ti.query||ti.sql||'');
      const noComments=q.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
      if(/\bDROP\s+(TABLE|SCHEMA|DATABASE|FUNCTION|VIEW)\b/i.test(noComments)){
        process.stdout.write('BLOCK\nЗапрос содержит DROP — необратимая операция на живой базе. Это не read-only (CLAUDE.md: «Supabase — через MCP, только для чтения, если явно не попросили писать»). Останови и явно спроси владельца, прежде чем выполнять.\\n');
        return;
      }
      if(/\bTRUNCATE\b/i.test(noComments)){
        process.stdout.write('BLOCK\nЗапрос содержит TRUNCATE — необратимо очищает таблицу целиком. Останови и явно спроси владельца.\\n');
        return;
      }
      if(/\bDELETE\s+FROM\b/i.test(noComments) && !/\bWHERE\b/i.test(noComments)){
        process.stdout.write('BLOCK\nDELETE без WHERE — удалит ВСЕ строки таблицы. Если это правда нужно — добавь явное условие или подтверди с владельцем отдельно.\\n');
        return;
      }
      if(/\bUPDATE\b/i.test(noComments) && !/\bWHERE\b/i.test(noComments)){
        process.stdout.write('BLOCK\nUPDATE без WHERE — изменит ВСЕ строки таблицы. Проверь, действительно ли нужно менять всю таблицу, или забыто условие.\\n');
        return;
      }
      process.stdout.write('ok\n');
      return;
    }
    if(/apply_migration/i.test(toolName)){
      const q=String(ti.query||ti.sql||'');
      if(q.trim().length<20 || /placeholder/i.test(q)){
        process.stdout.write('BLOCK\nТело миграции пустое, подозрительно короткое или содержит \"placeholder\" — та же ошибка класса, что уже была с деплоем Edge Function. Прочитай реальный SQL ещё раз перед отправкой.\\n');
        return;
      }
      process.stdout.write('ok\n');
      return;
    }
    process.stdout.write('ok\n');
  }catch(e){ process.stdout.write('ok\n'); }
});
")
verdict=$(printf '%s' "$out" | sed -n '1p')
reason=$(printf '%s' "$out" | sed -n '2p')

if [[ "$verdict" == "BLOCK" ]]; then
  reason_json=$(printf '%s' "$reason" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d)));")
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":${reason_json}}}"
  exit 0
fi
exit 0
