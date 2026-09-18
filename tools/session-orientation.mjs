#!/usr/bin/env node
/* 18.09.2026 (владелец: «можешь создать новые инструменты, которых у нас ещё нету») —
   CLAUDE.md уже требует ручной чек-лист В НАЧАЛЕ КАЖДОЙ сессии, до первой правки:
   «git remote -v, git log -1, сверить GAME_VERSION в js/core.js с тем, что реально отдаёт
   https://exxxit-game.github.io/cosmogram-app/. На этой машине бывает несколько несвязанных
   копий папки одновременно — рабочей считается только та, что подключена к git и совпадает
   по версии с живым сайтом.» Плюс отдельное правило «не давать незакоммиченным файлам
   копиться» (feedback_dont_let_untracked_files_pile_up) и «страж — единственный источник
   правды по числу стражей» (не хранить число в тексте документов). Одна команда вместо
   пяти ручных проверок в начале каждой сессии — самый частый повторяющийся ритуал в этом
   проекте, судя по истории CLAUDE.md.

   Использование:
     node tools/session-orientation.mjs [--app=<путь>] [--crew=<путь>] [--live-url=<URL>]
   По умолчанию: --app=. (сам cosmogram-app), --crew=../cosmogram-crew,
                 --live-url=https://exxxit-game.github.io/cosmogram-app/ */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const get = (flag, def) => { const a = args.find(x => x.startsWith(flag + '=')); return a ? a.slice(flag.length + 1) : def; };
const APP_DIR = get('--app', path.join(__dirname, '..'));
const CREW_DIR = get('--crew', path.join(APP_DIR, '..', 'cosmogram-crew'));
const LIVE_URL = get('--live-url', 'https://exxxit-game.github.io/cosmogram-app/');

function sh(cmd, cwd){
  try { return execSync(cmd, { cwd, encoding: 'utf8' }).trim(); }
  catch (e) { return '(ошибка: ' + (e.stderr || e.message).trim().split('\n')[0] + ')'; }
}

function section(title){ console.log('\n== ' + title + ' =='); }

section('cosmogram-app — git');
console.log('путь: ' + APP_DIR);
console.log('remote: ' + sh('git remote -v', APP_DIR).split('\n')[0]);
console.log('последний коммит: ' + sh('git log -1 --format="%h %ci %s"', APP_DIR));
const appStatus = sh('git status --short', APP_DIR);
console.log('незакоммиченное: ' + (appStatus ? '\n' + appStatus : '(чисто)'));

section('cosmogram-crew — git');
console.log('путь: ' + CREW_DIR);
console.log('remote: ' + sh('git remote -v', CREW_DIR).split('\n')[0]);
console.log('последний коммит: ' + sh('git log -1 --format="%h %ci %s"', CREW_DIR));
const crewStatus = sh('git status --short', CREW_DIR);
console.log('незакоммиченное: ' + (crewStatus ? '\n' + crewStatus : '(чисто)'));

section('Версия: локально vs живой сайт');
let localVersion = '(не найдено)';
try {
  const core = readFileSync(path.join(APP_DIR, 'js', 'core.js'), 'utf8');
  const m = core.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (m) localVersion = m[1];
} catch {}
console.log('локально (js/core.js): ' + localVersion);

let liveVersion = '(не удалось получить)';
try {
  const res = await fetch(LIVE_URL + 'js/core.js?probe=' + Date.now());
  if (res.ok) {
    const txt = await res.text();
    const m = txt.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (m) liveVersion = m[1];
  } else {
    liveVersion = '(HTTP ' + res.status + ')';
  }
} catch (e) { liveVersion = '(сеть недоступна: ' + e.message + ')'; }
console.log('живой сайт (' + LIVE_URL + '): ' + liveVersion);

if (localVersion !== '(не найдено)' && liveVersion === localVersion) {
  console.log('✅ совпадают — эта копия и есть то, что видят игроки (SW может кэшировать старое дольше, сверь при сомнении).');
} else if (localVersion !== '(не найдено)' && !liveVersion.startsWith('(')) {
  console.log(`⚠ РАСХОЖДЕНИЕ: локально ${localVersion}, на сайте ${liveVersion} — либо есть неотправленные коммиты (нормально в разгар сессии), либо это НЕ та рабочая копия, что подключена к живому гиту.`);
}

section('Стражи');
try {
  const guardSrc = readFileSync(path.join(CREW_DIR, 'tests', 'guard.mjs'), 'utf8');
  // 18.09.2026: считать регуляркой по объявлениям `async function guardXxx(browser){` даёт
  // МЕНЬШЕ реального числа (333 вместо 347 живых) — не все объявления страж-функций совпадают
  // с этим точным шаблоном (пробелы, другая сигнатура). Единственный надёжный источник —
  // сам массив GUARDS=[...], который guard.mjs реально прогоняет.
  const start = guardSrc.indexOf('const GUARDS = [');
  const end = guardSrc.indexOf('];', start);
  if (start === -1 || end === -1) throw new Error('не нашёл массив GUARDS=[...] — формат файла изменился?');
  const names = guardSrc.slice(start, end).match(/\bguard\w+/g) || [];
  console.log(`число стражей в tests/guard.mjs: ${names.length} (считано из самого массива GUARDS=[...], не из текста документов и не из regex по объявлениям функций)`);
} catch (e) { console.log('не удалось прочитать guard.mjs: ' + e.message); }

console.log('\nГотово. Если git status показал что-то неожиданное или версии разошлись без видимой причины — разбираться ДО первой правки, не считать текущую директорию рабочей по умолчанию.');
