#!/usr/bin/env node
/*
 * tools/patch.mjs — правка файлов без экранирования (владелец 01.10.2026: «сделай так, чтобы они никогда не ломались» —
 * у ассистента на Windows то и дело ломались пути и обратные слэши в одноразовых скриптах).
 *
 * Как пользоваться: описание правки пишется ИНСТРУМЕНТОМ Write в обычный текстовый файл (в папку scratchpad), текст идёт как есть —
 * слэши, кавычки, скобки, кириллица, ничего не экранируется. Потом одна команда:
 *     node tools/patch.mjs <файл-с-правками> [--dry]
 *
 * Формат файла правок (маркеры стоят на своих строках, начало строки обязательно):
 *     === FILE: js/ui.js
 *     <<<<
 *     старый текст (ровно один раз в файле)
 *     ====
 *     новый текст
 *     >>>>
 *     <<<<
 *     второй старый кусок того же файла
 *     ====
 *     второй новый
 *     >>>>
 *     === FILE: ../cosmogram-crew/tests/guard.mjs
 *     ...
 *
 * Что делает за меня: путь — относительно папки игры или абсолютный, слэши любые; переводы строк файла (CRLF/LF) сохраняет;
 * «старый» кусок обязан встретиться ровно один раз, иначе ничего не пишется и показывается, сколько раз он нашёлся;
 * всё или ничего: файл перезаписывается только когда прошли ВСЕ правки; --dry только проверяет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const specPath = args.find(a => !a.startsWith('--'));
if (!specPath) { console.error('Использование: node tools/patch.mjs <файл-с-правками> [--dry]'); process.exit(2); }

const spec = fs.readFileSync(path.resolve(specPath), 'utf8').replace(/\r\n/g, '\n').split('\n');
const jobs = []; let cur = null, mode = '', oldB = [], newB = [], lineNo = 0;
function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
for (const line of spec) {
  lineNo++;
  if (mode === '' ) {
    const f = /^=== FILE:\s*(.+?)\s*$/.exec(line);
    if (f) { cur = { file: f[1], edits: [] }; jobs.push(cur); continue; }
    if (line === '<<<<') { if (!cur) fail('строка ' + lineNo + ': «<<<<» до «=== FILE:»'); mode = 'old'; oldB = []; newB = []; continue; }
    if (line.trim() === '') continue;
    fail('строка ' + lineNo + ': лишний текст вне блока: «' + line.slice(0, 60) + '»');
  } else if (mode === 'old') {
    if (line === '====') { mode = 'new'; continue; }
    oldB.push(line);
  } else if (mode === 'new') {
    if (line === '>>>>') { cur.edits.push({ old: oldB.join('\n'), neu: newB.join('\n'), at: lineNo }); mode = ''; continue; }
    newB.push(line);
  }
}
if (mode !== '') fail('файл правок оборван: блок не закрыт «>>>>»');
if (!jobs.length) fail('в файле правок нет ни одного «=== FILE:»');

const results = [];
for (const j of jobs) {
  const p = path.isAbsolute(j.file) ? j.file : path.resolve(ROOT, j.file);
  if (!fs.existsSync(p)) fail('нет файла: ' + p);
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = crlf ? raw.replace(/\r\n/g, '\n') : raw;
  for (const e of j.edits) {
    if (!e.old) fail(j.file + ' (блок со строки ' + e.at + '): «старый» текст пуст');
    const n = t.split(e.old).length - 1;
    if (n !== 1) fail(j.file + ' (блок, заканчивающийся на строке ' + e.at + '): «старый» текст найден ' + n + ' раз(а), нужно ровно 1. Начало: «' + e.old.slice(0, 70).replace(/\n/g, '⏎') + '»');
    t = t.replace(e.old, () => e.neu);
  }
  results.push({ p, out: crlf ? t.replace(/\n/g, '\r\n') : t, n: j.edits.length, file: j.file });
}
for (const r of results) {
  if (!dry) fs.writeFileSync(r.p, r.out);
  console.log((dry ? '✓ (проверка) ' : '✓ ') + r.file + ': правок ' + r.n);
}
