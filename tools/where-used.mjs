#!/usr/bin/env node
/* 18.09.2026 (владелец: «можешь создать новые инструменты, которых у нас ещё нету») — в тот
   же день соло-аудит «мёртвого кода» ошибочно назвал SKINS[].extra:true осиротевшим полем:
   грепнул только js/*.js внутри cosmogram-app, не заглянул в cosmogram-crew/tests/guard.mjs,
   где поле реально читает страж 77. Удаление сразу уронило полный прогон стражей — поймано,
   но только ПОСЛЕ правки, не до (см. feedback_dead_code_grep_both_repos, RESEARCH-2026-09-
   INCOMPLETE-DEAD-CODE-AUDIT.md). Этот скрипт — дешёвая проверка ДО удаления: один вызов,
   грепает оба репозитория разом (cosmogram-app — игра, cosmogram-crew — стражи/инструменты),
   печатает КАЖДОЕ найденное место с файлом и номером строки, чтобы «нигде не читается» было
   выводом одной команды, а не памятью о том, что где-то что-то грепнул.

   Использование:
     node tools/where-used.mjs <строка-или-regex> [--app=<путь>] [--crew=<путь>]
   По умолчанию: --app=. (сам cosmogram-app, раз скрипт лежит внутри него),
                 --crew=../cosmogram-crew (соседняя папка на этой же машине).
   Пример:
     node tools/where-used.mjs "extra:true"
     node tools/where-used.mjs "\\bghostAccessStateForAuth\\b"    (для точного имени функции —
                                                                     regex с границами слова) */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const pattern = args.find(a => !a.startsWith('--'));
if (!pattern) {
  console.error('usage: node tools/where-used.mjs <строка-или-regex> [--app=path] [--crew=path]');
  process.exit(1);
}
const appArg = args.find(a => a.startsWith('--app='));
const crewArg = args.find(a => a.startsWith('--crew='));
const APP_DIR = appArg ? appArg.slice(6) : path.join(__dirname, '..');
const CREW_DIR = crewArg ? crewArg.slice(7) : path.join(APP_DIR, '..', 'cosmogram-crew');

function grepDir(dir, label){
  let out;
  try {
    // -r рекурсивно, -n номера строк, -I пропускать бинарники, --exclude-dir служебные папки
    out = execSync(
      `grep -rnI --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.claude -E "${pattern.replace(/"/g, '\\"')}" "${dir}"`,
      { encoding: 'utf8' }
    );
  } catch (e) {
    // grep возвращает код 1, если совпадений нет — это не ошибка вызова
    out = e.status === 1 ? '' : (() => { throw e; })();
  }
  const lines = out.split('\n').filter(Boolean);
  console.log(`\n[${label}] ${dir} — ${lines.length} совпадений`);
  lines.forEach(l => console.log('  ' + l.replace(dir + path.sep, '').replace(dir + '/', '')));
  return lines.length;
}

console.log(`Ищу "${pattern}" в обоих репозиториях...`);
const appCount = grepDir(APP_DIR, 'cosmogram-app');
const crewCount = grepDir(CREW_DIR, 'cosmogram-crew');

console.log(`\n===== ИТОГ =====`);
console.log(`cosmogram-app: ${appCount}, cosmogram-crew: ${crewCount}, всего: ${appCount + crewCount}`);
if (appCount <= 1 && crewCount === 0) {
  console.log('Похоже на мёртвый код (единственное совпадение — вероятно само объявление). Но: это НЕ доказательство само по себе — dynamic-вызовы (window[name], eval) грепом не ловятся, проверь их отдельно.');
} else if (appCount <= 1 && crewCount > 0) {
  console.log('⚠ ВНИМАНИЕ: не читается внутри cosmogram-app, НО есть совпадения в cosmogram-crew — почти наверняка НЕ мёртвый код (пример 18.09.2026: SKINS[].extra:true).');
}
