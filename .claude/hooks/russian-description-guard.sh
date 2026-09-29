#!/usr/bin/env bash
# 29.09.2026 (владелец: «мы память исследовали две недели, а толку — надо больше, чем
# запись»). Аудит ABSOLUTE-правил в памяти на тот же класс дыры, что только что нашёлся
# у деплоя (feedback_manual_transcription_risk.md, десятый случай): «всегда отвечать
# по-русски» (feedback_always_russian.md) — ABSOLUTE, 6 задокументированных нарушений
# за 6 разных сессий, механики НОЛЬ — ни один хук это не проверял. Память сама точно
# называет узкое место (не основной ответ — он оставался русским все 6 раз, а короткое
# поле `description` у Bash-вызовов, особенно в плотных сериях технических шагов, где
# внимание уходит на сам технический шаг, а description заполняется рефлекторно).
# Узкая, точная цель — меньше риска ложных срабатываний, чем «весь ответ должен быть
# по-русски» (там законно много кода/путей/английских терминов).
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{
    const j=JSON.parse(d);
    const desc=String((j.tool_input&&j.tool_input.description)||'');
    if(!desc){ process.stdout.write('ok\n'); return; }
    const cyr=(desc.match(/[а-яёА-ЯЁ]/g)||[]).length;
    const lat=(desc.match(/[A-Za-z]/g)||[]).length;
    // порог: заметная английская проза (много латинских букв), ни одной кириллической —
    // не спотыкается о единичные технические термины/имена файлов внутри русской фразы
    if(cyr===0 && lat>=8){
      process.stdout.write('BLOCK\nПоле description похоже на английскую прозу (' + lat + ' латинских букв, 0 кириллических): \"' + desc.slice(0,80) + '\". feedback_always_russian.md — ABSOLUTE, уже 6 раз повторялось именно в этом поле (короткая метка, заполняется рефлекторно в плотной серии технических вызовов). Перепиши description по-русски.\n');
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
