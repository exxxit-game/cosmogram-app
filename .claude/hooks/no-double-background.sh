#!/usr/bin/env bash
# 16.09.2026 (честный самоанализ, feedback_dvoynoy_background_lozhnoe_zavershenie.md): реальная
# причина зависания ноутбука владельца сегодня — команда с завершающим `&` внутри вызова,
# который И ТАК уже был run_in_background:true. Второй, неотслеживаемый харнессом процесс жил
# независимо, харнесс рапортовал «завершено» почти сразу, а настоящий node/guard.mjs продолжал
# работать — несколько таких прогонов подряд оставили несколько живых Chromium одновременно.
# Прощение-текстом в памяти это один раз не поймало (я сделала это ДО того, как записала правило).
# Технический отказ, тот же приём, что у version-guard.sh/protect-core.sh — не совет, а отказ
# прямо на попытке повторить.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const cmd=(j.tool_input&&j.tool_input.command)||'';
    const bg=!!(j.tool_input&&j.tool_input.run_in_background);
    process.stdout.write((j.tool_name||'')+'\n'+(bg?'1':'0')+'\n'+cmd.replace(/\n/g,'\\n')+'\n');
  }catch(e){ process.stdout.write('\n0\n\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
bg=$(printf '%s' "$out" | sed -n '2p')
cmd=$(printf '%s' "$out" | sed -n '3p')

if [[ "$tool" == "Bash" && "$bg" == "1" ]]; then
  # завершающий одиночный & (не &&, не внутри кавычек на конце) — trailing whitespace уже неважен, sed выше срезал построчно
  if [[ "$cmd" =~ [^\&]\&[[:space:]]*$ ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Команда уже помечена run_in_background:true, а сама строка ЕЩЁ РАЗ заканчивается на & — это двойной фон: харнесс рапортует «завершено» почти сразу, а настоящий процесс живёт независимо и не отслеживается. Убери завершающий & из самой команды (харнесс уже фонит её целиком), redirect (> log 2>&1) можно оставить."}}'
    exit 0
  fi
fi
exit 0
