#!/usr/bin/env bash
# 15.09.2026 (владелец, после ПОВТОРНОГО случая одной и той же ошибки — 27.08.2026
# и снова 15.09.2026): деплой Edge Function с содержимым-заглушкой вместо реального
# кода. Уже было ОДИН РАЗ (запись в CLAUDE.md от 27.08.2026, «Сверка деплоя — ДО
# отправки»), написанное правило не помешало повторить ту же ошибку — значит,
# одного текста в CLAUDE.md недостаточно, нужна механическая проверка, которую
# невозможно случайно пропустить в спешке или в панике («чиню только что
# сломанное этой же рукой»). Это жёсткий технический отказ (deny), не «ask» —
# заглушка вместо кода никогда не может быть тем, что владелец согласится
# пропустить, поэтому здесь не нужно окно подтверждения, только блокировка.
input=$(cat)
out=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{
    const j=JSON.parse(d);
    const ti=j.tool_input||{};
    if(ti.verify_jwt===undefined){
      process.stdout.write('BLOCK\nПараметр verify_jwt не передан вообще — инструмент тихо подставит своё умолчание (true), что 18.09.2026 уронило живую Мастерскую на ~3 минуты (UNAUTHORIZED_NO_AUTH_HEADER), потому что функция использует свою авторизацию (initData/webAuth/dcAuth/gAuth), не Supabase JWT. Реши явно и передай verify_jwt:true или verify_jwt:false — не полагайся на умолчание инструмента.\\n');
      return;
    }
    const files=Array.isArray(ti.files)?ti.files:[];
    let minLen=Infinity, hasPlaceholder=false, sample='';
    for(const f of files){
      const c=String((f&&f.content)||'');
      if(c.length<minLen) minLen=c.length;
      if(/placeholder/i.test(c)){ hasPlaceholder=true; if(!sample) sample=c.slice(0,80); }
    }
    if(files.length===0){ process.stdout.write('ok\n'); return; }
    if(hasPlaceholder){
      process.stdout.write('BLOCK\nСодержимое файла деплоя содержит слово \"placeholder\" — похоже на служебную заглушку вместо настоящего кода (та же ошибка, что уже была 27.08.2026 и 15.09.2026). Прочитай файл ещё раз и передай реальное содержимое.\n');
      return;
    }
    if(minLen<200){
      process.stdout.write('BLOCK\nСодержимое файла деплоя короче 200 символов (' + minLen + ') — для настоящей Edge Function это подозрительно мало, похоже на заглушку или недописанный контент. Прочитай файл ещё раз и передай реальное содержимое целиком.\n');
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
