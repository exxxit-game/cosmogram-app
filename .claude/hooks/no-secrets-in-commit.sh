#!/usr/bin/env bash
# 16.09.2026 (исследование: "плагины/скрипты, убирающие у тебя ошибки"). Лёгкий сканер секретов
# на git commit — без нового бинарника (gitleaks и т.п. требуют отдельной установки, а проект
# принципиально «чистый JS», без новых зависимостей). Проверяет STAGED diff (не весь репозиторий —
# гонять по всей истории на каждый коммит слишком дорого и не то, что нужно здесь) на несколько
# самых частых, высокоуверенных сигнатур секретов. Не замена настоящему сканеру (gitleaks и т.п.
# ловят ~60+ типов) — последний рубеж на случай, если что-то явно похожее на ключ вставлено
# буквально в код по ошибке.
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

if [[ "$tool" == "Bash" && "$cmd" == git\ commit* ]]; then
  diff=$(git diff --cached)
  hit=$(printf '%s' "$diff" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const added=d.split('\n').filter(l=>l.startsWith('+')&&!l.startsWith('+++')).join('\n');
  const pats=[
    [/AKIA[0-9A-Z]{16}/,'AWS Access Key ID'],
    [/-----BEGIN[ A-Z]*PRIVATE KEY-----/,'приватный ключ (PEM)'],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,'похоже на JWT (service_role/anon ключ Supabase?)'],
    [/sk-(live|proj)-[A-Za-z0-9]{20,}/,'ключ вида sk-live-/sk-proj- (Stripe/OpenAI-подобный)'],
    [/xox[baprs]-[A-Za-z0-9-]{10,}/,'Slack token'],
    [/ghp_[A-Za-z0-9]{36}/,'GitHub personal access token']
  ];
  for(const [re,label] of pats){ if(re.test(added)){ console.log(label); process.exit(0); } }
});
")
  if [[ -n "$hit" ]]; then
    node "$(dirname "$0")/lib/signal-trail.mjs" record secrets 5 "похоже на секрет в застейдженном diff: $hit" >/dev/null 2>&1
    echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"В застейдженных изменениях найдено похожее на секрет: ${hit}. Это ложное срабатывание (пример в комментарии/тесте) или реальный ключ, который нужно убрать и перевыпустить?\"}}"
    exit 0
  fi
fi
exit 0
