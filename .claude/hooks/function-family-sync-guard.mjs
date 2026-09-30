#!/usr/bin/env node
// function-family-sync-guard.mjs — 30.09.2026. Stop-хук: в этом ходу правилась функция Supabase
// (файл index.ts в папке _supabase/functions/ИМЯ), а «родственная» функция осталась со старой версией
// той же строки или без добавленной строки — конец хода блокируется, пока родственницу не посмотрели.
//
// Зачем: общий кусок кода (проверка входа tgAuth и т.п.) живёт в нескольких функциях как отдельные копии.
// 13-20.09 его правили по одной функции, и cosmogram-relay пропустили: relay_get_open отвечал 401 всем
// игрокам три дня (feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md, случай 23.09).
//
// Что считается семьёй (замер 30.09 по 12 функциям): у функций charter, daily, privacy, relay, sync, workshop
// попарно 44-98 одинаковых строк длиной от 40 символов, у остальных не больше 14. Порог 30 стоит в пустой зоне
// между 14 и 44. Семья вычисляется по коду при каждом запуске: родственница = функция, у которой с правленой
// не меньше FAMILY_MIN_SHARED общих строк длиной не меньше LINE_MIN (комментарии не считаются).
//
// Что ловит, по каждой родственнице:
//   (а) старая строка: правка убрала или заменила строку, а родственница всё ещё содержит её старый вид;
//   (б) недостающая строка: правка добавила строку, она уже есть хотя бы у одной другой родственницы, а у этой нет.
// Снимается, если в этом же ходу родственницу «посмотрели»: любой вызов инструмента (Read, Grep, Edit, Bash),
// где упомянуто её имя, либо поиск по всем функциям сразу (путь с functions/ЗВЁЗДОЧКА/).
// Что НЕ ловит: правильность копии, различия намеренные (просто посмотреть и сказать), строки короче LINE_MIN.
//
// Режимы (FUNCTION_FAMILY_MODE): block (по умолчанию) | warn | off. Структура — по образцу deploy-readback-guard.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const { collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(here, 'lib', 'current-turn-blocks.mjs')).href);
let recordSignal = () => {};
try {
  ({ recordSignal } = await import(pathToFileURL(path.join(here, 'lib', 'signal-trail.mjs')).href));
} catch { /* общий след недоступен — хук работает без него */ }

const FAMILY_MIN_SHARED = 30;
const LINE_MIN = 40;
const FN_FILE_RE = /_supabase\/functions\/([^/]+)\/index\.ts$/;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const emitOk = () => emit({ continue: true, suppressOutput: true });

/** Строки кода: обрезанные, не короче LINE_MIN, без комментариев. */
function codeLines(text) {
  const out = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim();
    if (l.length >= LINE_MIN && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*')) out.add(l);
  }
  return out;
}
const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));

function gitHead(file) {
  try {
    return execFileSync('git', ['-C', path.dirname(file), 'show', 'HEAD:./' + path.basename(file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}
const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

/** Пары «было → стало» правок функции: [{ file, before, after }]. */
function editsOf(b) {
  const name = String(b.name || '');
  const input = b.input || {};
  const file = String(input.file_path || '').replace(/\\/g, '/');
  if (!EDIT_TOOLS.has(name) || !FN_FILE_RE.test(file)) return [];
  if (name === 'Edit') return [{ file, before: input.old_string || '', after: input.new_string || '' }];
  if (name === 'MultiEdit') return (Array.isArray(input.edits) ? input.edits : []).map((e) => ({ file, before: e.old_string || '', after: e.new_string || '' }));
  const head = gitHead(file);
  if (head === null) return [];
  return [{ file, before: head, after: readOr(file) ?? String(input.content || '') }];
}

function main() {
  const mode = (process.env.FUNCTION_FAMILY_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();

  let hookData = {};
  try { hookData = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk();
  if (!hookData.transcript_path) emitOk();

  const blocks = collectCurrentTurnBlocks(hookData.transcript_path);
  const edits = blocks.filter((b) => b && b.type === 'tool_use').flatMap(editsOf);
  if (!edits.length) emitOk();

  // «Посмотрели»: тексты входов всех вызовов инструментов хода, кроме самих правок.
  const seen = blocks.filter((b) => b && b.type === 'tool_use' && !EDIT_TOOLS.has(String(b.name || ''))).map((b) => JSON.stringify(b.input || {}));
  const editedInputs = blocks.filter((b) => b && b.type === 'tool_use' && EDIT_TOOLS.has(String(b.name || ''))).map((b) => JSON.stringify(b.input || {}));
  const looked = (fnName) => [...seen, ...editedInputs].some((s) => s.includes(fnName + '/') || s.includes(fnName + '\\\\') || s.includes(fnName + '"'))
    || seen.some((s) => /functions[\\/]+\*/.test(s) || /functions\\\\\*/.test(s));

  const problems = [];
  const done = new Set();
  for (const e of edits) {
    const m = e.file.match(FN_FILE_RE);
    const root = path.dirname(path.dirname(e.file));
    const self = m[1];
    const selfDisk = readOr(e.file);
    if (selfDisk === null) continue;
    const selfLines = codeLines(selfDisk);
    const removed = minus(codeLines(e.before), codeLines(e.after));
    const added = minus(codeLines(e.after), codeLines(e.before));
    if (!removed.size && !added.size) continue;

    let names = [];
    try { names = fs.readdirSync(root); } catch { continue; }
    const family = [];
    for (const n of names) {
      if (n === self) continue;
      const disk = readOr(path.join(root, n, 'index.ts'));
      if (disk === null) continue;
      const lines = codeLines(disk);
      let shared = 0; for (const l of selfLines) if (lines.has(l)) shared++;
      if (shared >= FAMILY_MIN_SHARED) family.push({ name: n, lines });
    }
    for (const sib of family) {
      const key = self + '->' + sib.name;
      if (done.has(key) || looked(sib.name)) continue;
      const stale = [...removed].find((l) => sib.lines.has(l) && !selfLines.has(l));
      const missing = [...added].find((l) => selfLines.has(l) && !sib.lines.has(l) && family.some((o) => o.name !== sib.name && o.lines.has(l)));
      if (stale) { problems.push(`${self} → ${sib.name}: там всё ещё старая строка «${stale.slice(0, 80)}»`); done.add(key); }
      else if (missing) { problems.push(`${self} → ${sib.name}: там нет добавленной строки «${missing.slice(0, 80)}» (у других родственниц она есть)`); done.add(key); }
    }
  }
  if (!problems.length) emitOk();

  const reason =
    `⚠️  function-family-sync — в этом ходу правилась функция Supabase, а её родственница осталась в другом состоянии:\n  • ${problems.join('\n  • ')}\n\n` +
    `Общий кусок кода живёт в нескольких функциях отдельными копиями; так cosmogram-relay пропустили при правке входа tgAuth, и relay_get_open три дня отвечал 401 всем игрокам.\n` +
    `Перед завершением хода, для каждой названной функции: открой её (Read/Grep) и либо внеси ту же правку, либо скажи владельцу, что различие намеренное и почему.\n` +
    `Быстрый обход всех сразу: grep -l "<характерная строка>" _supabase/functions/*/index.ts\n\n` +
    `Отключить на раз: FUNCTION_FAMILY_MODE=off`;

  try { recordSignal('function-family-sync', mode === 'block' ? 4 : 3, problems[0].slice(0, 120)); } catch { /* след необязателен */ }
  if (mode === 'warn') emit({ continue: true, systemMessage: reason });
  emit({ decision: 'block', reason });
}

try { main(); } catch { emitOk(); }
