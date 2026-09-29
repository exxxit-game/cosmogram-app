#!/usr/bin/env bash
# 26.09.2026: механизация «правило пяти попыток» (feedback_pyat_popytok_dazhe_s_novoy_gipotezoy.md,
# ABS в CLAUDE.md 25.08.2026) — до сих пор существовало только как текст, который нужно было
# вспомнить самому посреди правок. Использует уже существующую инфраструктуру signal-trail.mjs
# (муравьиный след с угасанием, .claude/hooks/lib/) вместо отдельного дублирующего счётчика.
#
# Логика: каждая правка (Edit/Write) одного и того же файла оставляет метку в категории
# edit:<файл>. Если файл правился ≥5 раз С МОМЕНТА ПОСЛЕДНЕГО коммита (коммит — метка
# category=commit, которую отдельно ставит commit-tracker.sh) — это механический признак
# «чиню одно и то же снова и снова», не идеальный (не различает 5 разных мелких правок от
# 5 попыток одного бага), но настоящий сигнал вместо полагания на память в моменте.
input=$(cat)
file=$(printf '%s' "$input" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try{ const j=JSON.parse(d); process.stdout.write((j.tool_input&&j.tool_input.file_path)||''); }
  catch(e){ process.stdout.write(''); }
});
")
if [ -z "$file" ]; then exit 0; fi

# 29.09.2026 (владелец: «покрыть все непокрытые моменты») — реальный баг найден при
# первом же живом тесте: `pwd` под git-bash отдаёт POSIX-путь (/c/...), которым node
# отлично пользуется как argv (следующая строка работала всегда), но `fs.existsSync`/
# `readFileSync` ВНУТРИ запущенного JS такой путь не понимают на Windows (проверено
# численно: existsSync('/c/...')===false, existsSync('C:/...')===true) — значит блок
# ниже (>=5 и ===3 проверки) не мог сработать НИ РАЗУ с момента создания 26.09.2026,
# хотя запись (эта строка) исправно писалась. `pwd -W` — тот же git-bash, но отдаёт
# Windows-путь, которым node-fs пользуется правильно и там, и там.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
node "$DIR/lib/signal-trail.mjs" record "edit:$file" 1 "" >/dev/null 2>&1

node -e "
const {readFileSync,existsSync}=require('fs');
const path='$DIR/../state/signal-trail.jsonl'.replace(/\\\\/g,'/');
if(!existsSync(path)) process.exit(0);
const lines=readFileSync(path,'utf8').split('\n').filter(Boolean);
const entries=lines.map(l=>{ try{return JSON.parse(l);}catch(e){return null;} }).filter(Boolean);
let lastCommit=0;
for(const e of entries){ if(e.category==='commit' && e.ts>lastCommit) lastCommit=e.ts; }
const target='edit:$file';
const since=entries.filter(e=>e.category===target && e.ts>=lastCommit);
if(since.length>=5){
  console.error('⚠ Файл \"$file\" правится '+since.length+'-й раз подряд без коммита между правками (порог 5, feedback_pyat_popytok_dazhe_s_novoy_gipotezoy.md) — остановиться, откатиться к последнему рабочему коммиту (git diff/git log, не git reset --hard), заново пройти разбор причин с начала, не чинить поверх пяти неудачных слоёв.');
} else if(since.length===3){
  // 29.09.2026 (CLAUDE.md: «промежуточный сигнал между 0 и 5», andon Toyota — два уровня,
  // не один) — та же инфраструктура, более мягкий сигнал РАНЬШЕ полного стопа. Печатается
  // ровно один раз на третьей правке (===3, не >=3), не на каждой следующей — иначе шумит.
  console.error('⚠ Файл \"$file\" правится 3-й раз подряд без коммита — не стоп, но повод честно зафиксировать «гипотеза не подтвердилась, неуверен», прежде чем пробовать снова (порог 3-5, не жёсткая граница — AIAG-VDA).');
}
" 2>&1 1>/dev/null
exit 0
