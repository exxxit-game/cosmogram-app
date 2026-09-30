#!/usr/bin/env node
/*
 * only-what-owner-said.mjs — 01.10.2026, по прямому слову владельца («тут надо противодействие,
 * хук или шо, используй»). Сбой, который он называл много раз за сессию: ассистент делает ЧТО-ТО
 * СВЕРХ сказанного (лишняя подпись, галочка, рамка, «заодно») и владельцу приходится убирать.
 * Слова в ответе это не останавливали — останавливает только проверка до конца хода.
 *
 * Два режима (argv[2]):
 *   prompt — событие UserPromptSubmit: запоминает состояние кода в начале хода (git diff HEAD
 *            обоих репозиториев) и кладёт в контекст короткое напоминание «ровно сказанное».
 *   stop   — событие Stop: если за ход изменился код, один раз не даёт закончить ответ и требует
 *            сверить каждую правку со словами владельца. Заранее находит новые видимые русские
 *            слова в добавленных строках, которых нет в последних сообщениях владельца.
 *            Второй раз (stop_hook_active) пропускает — не зацикливается.
 * Режим блокировки: ONLY_OWNER_WORDS_MODE = block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.CLAUDE_PROJECT_DIR || path.resolve(HERE, '..', '..');
const REPOS = { app: PROJECT, crew: path.resolve(PROJECT, '..', 'cosmogram-crew') };
const STATE = path.join(PROJECT, '.claude', 'state', 'only-what-owner-said.json');
const MODE = process.env.ONLY_OWNER_WORDS_MODE || 'block';
const CODE_RE = /^(index\.html|sw\.js|js\/.+\.js|tests\/guard\.mjs|_supabase\/.+)$/;

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
function gitDiff(dir) {
  try {
    if (!fs.existsSync(dir)) return '';
    return execFileSync('git', ['-C', dir, 'diff', 'HEAD', '--unified=0', '--no-color', '--no-ext-diff'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return ''; }
}
// добавленные строки кода: [{file, text}]
function addedLines(diff) {
  const out = []; let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ b\//, '').replace(/^\+\+\+ /, '').trim(); continue; }
    if (line.startsWith('+') && CODE_RE.test(file)) out.push({ file, text: line.slice(1).replace(/\r$/, '') });
  }
  return out;
}
function stem(w) { return w.toLowerCase().replace(/ё/g, 'е').slice(0, 5); }
function ownerStems(transcriptPath) {
  const stems = new Set();
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return Promise.resolve(stems);
  try {
    const lib = path.join(HERE, 'lib');
    return import(pathToFileURL(path.join(lib, 'read-transcript-tail.mjs')).href).then(async ({ readTail }) => {
      const { isGenuineUserEntry } = await import(pathToFileURL(path.join(lib, 'current-turn-blocks.mjs')).href);
      const lines = readTail(transcriptPath).split('\n').filter(Boolean);
      let n = 0;
      for (let i = lines.length - 1; i >= 0 && n < 14; i--) {
        let e; try { e = JSON.parse(lines[i]); } catch { continue; }
        if (!isGenuineUserEntry(e)) continue;
        const c = e.message && e.message.content;
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '';
        if (!text || text.includes('<system-reminder>') && text.length > 4000) continue;
        n++;
        for (const w of text.match(/[А-Яа-яЁё]+/g) || []) stems.add(stem(w));
      }
      return stems;
    });
  } catch { return Promise.resolve(stems); }
}
function visibleCyrillic(text) {
  let t = text;
  t = t.replace(/<!--.*?-->/g, ' ').replace(/\/\*.*?\*\//g, ' ');
  t = t.replace(/(^|\s)\/\/.*$/, '$1');
  if (/^\s*(\*|\/\*|<!--)/.test(t)) return [];
  return t.match(/[А-Яа-яЁё]+(?:[ \-—«»:,.!?;…0-9]+[А-Яа-яЁё]+)*/g) || [];
}

const mode = process.argv[2];
const input = readStdin();

if (mode === 'prompt') {
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    const snap = { ts: Date.now(), diffs: {} };
    for (const [k, dir] of Object.entries(REPOS)) snap.diffs[k] = gitDiff(dir);
    fs.writeFileSync(STATE, JSON.stringify(snap));
  } catch { /* не мешаем работе */ }
  process.stdout.write(
    'ПРАВИЛО ВЛАДЕЛЬЦА (хук only-what-owner-said): делай РОВНО то, что владелец сказал или показал на макете. ' +
    'Ничего сверх: ни подписей, ни значков, ни рамок, ни «заодно», ни своих решений. ' +
    'Чего не хватает в задаче — не додумывай, а спроси одной строкой. В конце хода код сверяется с его словами.\n');
  process.exit(0);
}

if (mode === 'stop') {
  if (MODE === 'off' || input.stop_hook_active) process.exit(0);
  let snap;
  try { snap = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { process.exit(0); }
  const extras = [];
  let changed = 0;
  for (const [k, dir] of Object.entries(REPOS)) {
    const before = new Set(addedLines(snap.diffs[k] || '').map((x) => x.file + '\u0000' + x.text));
    for (const l of addedLines(gitDiff(dir))) {
      if (before.has(l.file + '\u0000' + l.text)) continue;
      changed++;
      extras.push(l);
    }
  }
  if (!changed) process.exit(0);
  const stems = await ownerStems(input.transcript_path || '').catch(() => new Set()); // нет транскрипта — считаем, что слов владельца нет
  const flagged = [];
  for (const l of extras) {
    for (const run of visibleCyrillic(l.text)) {
      const words = (run.match(/[А-Яа-яЁё]+/g) || []).filter((w) => w.length >= 4);
      if (words.length && words.some((w) => !stems.has(stem(w)))) { flagged.push(run.trim().slice(0, 90) + '  [' + l.file + ']'); break; }
    }
  }
  const uniq = [...new Set(flagged)].slice(0, 10);
  const reason =
    'ХУК «только то, что сказал владелец». За этот ход изменён код (' + changed + ' добавленных строк). ' +
    (uniq.length ? 'Новые видимые слова, которых владелец не произносил:\n• ' + uniq.join('\n• ') + '\n' : '') +
    'Сверь КАЖДУЮ правку со словами владельца и его макетом. Всё, чего он не просил, убери сейчас же, потом отвечай. ' +
    'В ответе два списка: «Твои пометки» (его слова дословно) и «Сделано» (напротив каждой пометки — что изменено); сверх пометок в «Сделано» ничего нет.';
  if (MODE === 'warn') { process.stderr.write(reason + '\n'); process.exit(0); }
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
process.exit(0);
