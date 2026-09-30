#!/usr/bin/env node
/*
 * worst-case-gate.mjs — Stop-хук (30.09.2026): «проверять на САМОМ ТЯЖЁЛОМ РЕАЛИСТИЧНОМ случае» — не текстом, а делом.
 *
 * ЖИВОЙ ПРОВАЛ (владелец, трижды за один вечер: «я тебя учил всегда на самый тяжёлый случай… мне
 * постоянно приходится напоминать… это не должно быть просто текстом… не самый выдуманный, а самый
 * реалистичный тяжёлый»): карточку места рисовал и снимал на `#4`; на месте в тысячах цифра вылезала
 * из плитки, и всё слиплось. Я каждый раз смотрел лёгкий случай, потому что он приятнее.
 *
 * Что ловит: в ТЕКУЩЕМ ходу
 *   • правлен код экрана итогов (index.html / ui.js / cinema.js / partitura.js / forge.js / i18n.js с признаками
 *     итогов), или
 *   • написан/опубликован макет (*.dc.html),
 * и после ПОСЛЕДНЕЙ такой правки нет запуска `node tools/worst-case.mjs` (для макета — `... macet <папка>`),
 * который в журнале ~/.claude/state/worst_case/log.jsonl прошёл БЕЗ нарушений. Быстрый круг (--fast) не считается:
 * он для итераций, а не для «готово».
 * Осознанное освобождение: `node tools/worst-case.mjs --waive "почему не применимо"` (≥20 знаков) — запись остаётся
 * в журнале, а хук показывает причину владельцу, а не молчит.
 *
 * Данные тяжёлого случая — tools/worst-case-fixtures.json: реальные потолки с источником у каждого числа (не выдумка).
 * Режимы (WORST_CASE_ENFORCE_MODE): block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let recordSignal = () => {};
try { ({ recordSignal } = await import(pathToFileURL(path.join(HERE, 'lib', 'signal-trail.mjs')).href)); } catch { /* без общего следа хук работает */ }
let collectCurrentTurnBlocks = () => [];
try { ({ collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(HERE, 'lib', 'current-turn-blocks.mjs')).href)); } catch { /* пустой ход = молчим */ }
let isMockupPublish = () => false, isMockupEdit = () => false;
try { ({ isMockupPublish, isMockupEdit } = await import(pathToFileURL(path.join(HERE, 'mockup-unseen-guard.mjs')).href)); } catch { /* без определения макета работает только ветка игры */ }

const LOG = path.join(os.homedir(), '.claude', 'state', 'worst_case', 'log.jsonl');
const FRESH_MS = 90 * 60 * 1000;

// файлы, где рисуется экран итогов; правка засчитывается, только если в тексте правки есть признак итогов
const RESULTS_FILE_RE = /(^|[\\/])(index\.html|js[\\/](ui|cinema|partitura|forge|gyro|i18n)\.js)$/i;
const RESULTS_TOKEN_RE = /(gameOver|overFlight|overRank|overTimeRank|overLoc|finishDelta|finalScore|recordMedals|newRecord|recChip|\.ofBox|\.ofStk|\.orHead|rkTile|overFinishFill|ofAcc\b|medalHTML|MEDAL_CAT|gameOverScreen|\bover[A-Z]\w*\s*:)/;

function emitOk() { process.stdout.write('{"continue": true, "suppressOutput": true}\n'); process.exit(0); }
function emitWarn(msg) { process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n'); process.exit(0); }
function emitBlock(reason) { process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n'); process.exit(0); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

/** Правка экрана итогов через Edit/Write. */
export function isResultsEdit(block) {
  if (!block || block.type !== 'tool_use' || (block.name !== 'Edit' && block.name !== 'Write')) return false;
  const input = block.input || {};
  if (!RESULTS_FILE_RE.test(String(input.file_path || ''))) return false;
  return RESULTS_TOKEN_RE.test(String(input.new_string || '') + '\n' + String(input.content || ''));
}
/** Правка экрана итогов Python-/node-скриптом через Bash (так тоже правятся файлы) — признак: команда трогает ui.js/index.html и пишет в них. */
export function isResultsBashEdit(block) {
  if (!block || block.type !== 'tool_use' || block.name !== 'Bash') return false;
  const c = String((block.input && block.input.command) || '');
  return /writeFileSync\s*\(\s*['"`](?:[^'"`]*[\\/])?(?:js[\\/]ui\.js|ui\.js|index\.html)['"`]/.test(c) && RESULTS_TOKEN_RE.test(c);
}

/** Аргументы РЕАЛЬНОГО запуска `node …/worst-case.mjs …`; null — команда его не запускает (слова в heredoc / тексте коммита не считаются). */
export function invocationArgs(cmd) {
  const head = String(cmd).split(/<<-?\s*['"]?\w+/)[0]; // всё после heredoc — текст, не команда
  const m = /(?:^|[\n;&|]\s*|&&\s*)node\s+(?:--\S+\s+)*[^\s;&|'"]*worst-case\.mjs\b([^\n;&|]*)/.exec(head);
  return m ? m[1] : null;
}
function bashCommands(blocks) {
  const out = [];
  blocks.forEach((b, i) => {
    if (!(b && b.type === 'tool_use' && b.name === 'Bash')) return;
    const cmd = String((b.input && b.input.command) || '');
    out.push({ i, cmd, args: invocationArgs(cmd) });
  });
  return out;
}
function readLog() {
  try { return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}

/** Чистая функция для теста: что нужно и чего не хватает. */
export function evaluate(blocks, log, now = Date.now()) {
  let lastGame = -1, lastMacet = -1;
  const publishIdx = []; // публикации макета: проверка должна быть ДО них, не после (опубликованное уже увидели)
  const macetFiles = new Set();
  blocks.forEach((b, i) => {
    if (isResultsEdit(b) || isResultsBashEdit(b)) lastGame = i;
    const edit = isMockupEdit(b), pub = isMockupPublish(b);
    if (edit) lastMacet = i;
    if (pub) publishIdx.push(i);
    if (edit || pub) {
      const inp = (b && b.input) || {};
      const names = [inp.file_path, ...(Array.isArray(inp.files) ? inp.files.map((f) => (typeof f === 'string' ? f : f && f.path)) : Object.keys(inp.files || {}))];
      names.filter((n) => typeof n === 'string' && /\.dc\.html$/i.test(n)).forEach((n) => macetFiles.add(path.basename(n)));
    }
  });
  const cmds = bashCommands(blocks);
  const fresh = (e) => now - e.t <= FRESH_MS;
  const res = { needGame: lastGame >= 0, needMacet: macetFiles.size > 0, problems: [], waived: null };
  const firstPublish = publishIdx.find((i) => i > lastMacet); // первая публикация после последней правки макета
  const waiveAfter = (idx) => cmds.find((c) => c.i > idx && c.args !== null && /--waive/.test(c.args));
  const lastLog = (mode) => [...log].reverse().find((e) => e.mode === mode && fresh(e));

  if (res.needGame) {
    const ran = cmds.find((c) => c.i > lastGame && c.args !== null && !/\bmacet\b/.test(c.args) && !/--fast/.test(c.args) && !/--waive/.test(c.args));
    const w = waiveAfter(lastGame);
    const e = lastLog('game');
    if (ran && e && e.ok && !e.fast) { /* хорошо */ }
    else if (w) { const wl = lastLog('waive'); if (wl) res.waived = wl.reason; else res.problems.push('game: --waive без записи в журнале'); }
    else if (ran && e && !e.ok) res.problems.push('game: прогон на тяжёлом случае КРАСНЫЙ (' + e.violations + ' нарушений: ' + (e.head || []).slice(0, 2).join('; ') + ') — почини и прогони снова');
    else res.problems.push('game: после последней правки экрана итогов нет полного прогона `node tools/worst-case.mjs` (быстрый --fast не считается)');
  }
  if (res.needMacet) {
    const ran = cmds.find((c) => c.i > lastMacet && (firstPublish === undefined || c.i < firstPublish) && c.args !== null && /\bmacet\b/.test(c.args));
    const w = waiveAfter(lastMacet);
    const e = lastLog('macet');
    if (ran && e && e.ok && [...macetFiles].every((f) => (e.files || []).includes(f))) { /* хорошо */ }
    else if (w) { const wl = lastLog('waive'); if (wl) res.waived = wl.reason; else res.problems.push('macet: --waive без записи в журнале'); }
    else if (ran && e && !e.ok) res.problems.push('macet: проверка макета КРАСНАЯ (' + e.violations + ': ' + (e.head || []).slice(0, 2).join('; ') + ')');
    else res.problems.push('macet: до публикации и после последней правки макета нет `node tools/worst-case.mjs macet <папка>` со всеми досками (' + [...macetFiles].join(', ') + ') — проверка идёт ДО публикации, не после');
  }
  return res;
}

function main() {
  const mode = (process.env.WORST_CASE_ENFORCE_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();
  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk(); // не зацикливаться
  const blocks = collectCurrentTurnBlocks(hookData.transcript_path);
  const r = evaluate(blocks, readLog());
  if (!r.needGame && !r.needMacet) emitOk();
  if (!r.problems.length) {
    if (r.waived) emitWarn('⚠️  Проверка на самом тяжёлом реалистичном случае ОСВОБОЖДЕНА. Причина: ' + r.waived + ' — владельцу сказать в ответе.');
    emitOk();
  }
  const reason =
    `⚠️  Экран/макет правился, а на САМОМ ТЯЖЁЛОМ РЕАЛИСТИЧНОМ случае не проверен (30.09.2026, владелец: «я тебя учил всегда на самый тяжёлый случай… это не должно быть просто текстом»).\n\n` +
    r.problems.map((p) => '  • ' + p).join('\n') + '\n\n' +
    `Что сделать перед завершением хода:\n` +
    `  1. Игра:  node tools/worst-case.mjs            (все 5 языков × 360×800 и 360×700; ~4 мин; быстрый круг: --fast)\n` +
    `     Макет: node tools/worst-case.mjs macet <папка с *.dc.html>   (в макете должны быть тяжёлые данные, не только #4)\n` +
    `  2. Красное — чинить и гнать снова; снимки из .playwright-mcp/worst/ ПОСМОТРЕТЬ глазами (Read картинки).\n` +
    `  3. Числа тяжёлого случая — tools/worst-case-fixtures.json (реальные потолки с источником). Не придумывать свои;\n` +
    `     менять — только с новым источником (запрос к базе / правило игры / слово владельца).\n` +
    `  4. Если проверка правда не применима: node tools/worst-case.mjs --waive "причина ≥20 знаков" — владельцу будет видно.\n\n` +
    `Отключить на раз: WORST_CASE_ENFORCE_MODE=warn или =off`;
  try { recordSignal('worst-case', mode === 'block' ? 4 : 3, r.problems[0]); } catch { /* след необязателен */ }
  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch { emitOk(); } // fail-safe: сбой хука не ломает ход
}
