#!/usr/bin/env bash
# 19.09.2026 (владелец, напрямую, после того как ноут завис ~40 минут):
# правило «не запускать полный набор guard.mjs в фоне без присмотра» уже
# существовало как ABSOLUTE в памяти (feedback_polny_guard_progon_ne_bez_prismotra.md,
# с 17.09.2026) — и всё равно было нарушено в этой же самой ночной сессии.
# Тот же урок, что уже применён к protect-core.sh/version-guard.sh: текст в
# памяти не держит поведение под давлением, технический hook — держит.
# Правило: полный прогон guard.mjs (без --only=) можно запускать, но НЕ в
# фоне (run_in_background) без явного подтверждения владельца каждый раз —
# каждый Chromium-контекст стражей реально грузит слабую машину.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d);
    const cmd=(j.tool_input&&j.tool_input.command)||'';
    const bg=!!(j.tool_input&&j.tool_input.run_in_background);
    process.stdout.write((j.tool_name||'')+'\n'+cmd.replace(/\n/g,' ')+'\n'+(bg?'1':'0')+'\n');
  }catch(e){ process.stdout.write('\n\n0\n'); }
});
")
tool=$(printf '%s' "$out" | sed -n '1p')
cmd=$(printf '%s' "$out" | sed -n '2p')
bg=$(printf '%s' "$out" | sed -n '3p')

if [[ "$tool" == "Bash" && "$bg" == "1" && "$cmd" == *guard.mjs* && "$cmd" != *--only=* ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Полный набор guard.mjs (без --only=) запускается В ФОНЕ — та же ошибка, что уже вешала эту машину на ~40-50 минут дважды (17.09 и 19.09.2026), даже когда правило уже было записано как ABSOLUTE. Подтвердите явно: ничего другого тяжёлого (браузерная панель, adb/CDP, параллельные agent-вызовы) сейчас не работает, и вы реально проверите прогресс через несколько минут, а не оставите фоновым на час."}}'
  exit 0
fi
exit 0
