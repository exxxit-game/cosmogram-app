#!/usr/bin/env node
/*
 * category-db-verify-guard.mjs — 30.09.2026. Stop-хук: в этом ходу правились списки категорий рекордов
 * CATS / RUN_CATS в файлах _supabase/functions/ИМЯ/index.ts (изменился состав), а триггер scores_guard в базе
 * после правки не читали — конец хода блокируется.
 *
 * Зачем: список допустимых категорий живёт ещё и в базе — в триггерной функции public.scores_guard().
 * Когда в игру добавили 'caravan', списки в коде обновили, а в триггере — нет; каждая отправка Caravan
 * молча отклонялась (случай 6, feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md).
 * Поиск по репозиторию этого не видит: вторая копия списка лежит в базе, не в файле.
 *
 * Как проверяет: правка (Edit/MultiEdit — по old_string/new_string; Write — против версии из git HEAD)
 * меняет состав массива CATS или RUN_CATS → после неё в этом же ходу должен быть execute_sql, в тексте
 * запроса которого есть «scores_guard». Хук не читает базу сам и не сверяет списки: он требует, чтобы
 * чтение состоялось; сверять списки — задача читающего (сравнить с новым CATS).
 * Не проверяет: другие копии списка (клиент игры, cosmogram-daily), не связанные с CATS/RUN_CATS имена.
 *
 * Режимы (CATEGORY_DB_VERIFY_MODE): block (по умолчанию) | warn | off. Структура — по образцу deploy-readback-guard.
 */
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

const FN_FILE_RE = /_supabase\/functions\/[^/]+\/index\.ts$/;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const emitOk = () => emit({ continue: true, suppressOutput: true });

/** Состав каждого массива CATS / RUN_CATS в тексте: { CATS: 'a,b,c', RUN_CATS: '…' } (отсортировано). */
function catArrays(text) {
  const out = {};
  const re = /\b((?:RUN_)?CATS)\s*=\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(String(text)))) {
    out[m[1]] = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).sort().join(',');
  }
  return out;
}

/** Меняет ли пара «было → стало» состав CATS/RUN_CATS. */
function catsChanged(before, after) {
  const b = catArrays(before), a = catArrays(after);
  return Object.keys(a).some((k) => a[k] !== b[k]);
}

function gitHead(file) {
  try {
    return execFileSync('git', ['-C', path.dirname(file), 'show', 'HEAD:./' + path.basename(file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}

function editChangesCats(b) {
  const name = String(b.name || '');
  const input = b.input || {};
  const file = String(input.file_path || '').replace(/\\/g, '/');
  if (!EDIT_TOOLS.has(name) || !FN_FILE_RE.test(file)) return false;
  if (name === 'Edit') return catsChanged(input.old_string || '', input.new_string || '');
  if (name === 'MultiEdit') return (Array.isArray(input.edits) ? input.edits : []).some((e) => catsChanged(e.old_string || '', e.new_string || ''));
  const head = gitHead(file);
  if (head === null) return false;
  let disk; try { disk = fs.readFileSync(file, 'utf8'); } catch { disk = String(input.content || ''); }
  return catsChanged(head, disk);
}

function main() {
  const mode = (process.env.CATEGORY_DB_VERIFY_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();

  let hookData = {};
  try { hookData = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk();
  if (!hookData.transcript_path) emitOk();

  let pending = false;
  for (const b of collectCurrentTurnBlocks(hookData.transcript_path)) {
    if (!b || b.type !== 'tool_use') continue;
    if (editChangesCats(b)) pending = true;
    else if (/execute_sql$/.test(String(b.name || '')) && /scores_guard/i.test(String((b.input && (b.input.query || b.input.sql)) || ''))) pending = false;
  }
  if (!pending) emitOk();

  const reason =
    `⚠️  category-db-verify — в этом ходу изменён состав CATS/RUN_CATS в функции Supabase, но триггер scores_guard в базе после правки не читали.\n\n` +
    `Список допустимых категорий рекордов лежит ещё и в базе, в public.scores_guard(): новая категория, которой там нет, молча отклоняется на КАЖДОЙ отправке (так было с Caravan). Поиск по файлам этого не видит.\n` +
    `Перед завершением хода:\n` +
    `  1. execute_sql (только чтение): select pg_get_functiondef('public.scores_guard'::regproc);\n` +
    `  2. Сравни список категорий в триггере с новым CATS. Если категории в триггере нет — скажи владельцу; изменение триггера — запись в живую базу, только по его слову.\n\n` +
    `Отключить на раз: CATEGORY_DB_VERIFY_MODE=off`;

  try { recordSignal('category-db-verify', mode === 'block' ? 4 : 3, 'CATS/RUN_CATS изменён без чтения scores_guard'); } catch { /* след необязателен */ }
  if (mode === 'warn') emit({ continue: true, systemMessage: reason });
  emit({ decision: 'block', reason });
}

try { main(); } catch { emitOk(); }
