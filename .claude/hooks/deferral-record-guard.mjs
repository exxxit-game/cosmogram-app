#!/usr/bin/env node
/*
 * deferral-record-guard.mjs — 30.09.2026. Stop-хук: в ответе есть обещание отложить дело
 * («отложу», «сделаю позже», «оставлю на потом», «вернусь к этому»), а записи в память или
 * в .knowledge/ за этот ход нет — конец хода блокируется, пока запись не сделана.
 *
 * Зачем: правило «намеренно отложенный объём записывать» (память feedback_zapisyvat_namerenno_
 * otlozhennyi_obem) и «слова без записи = балабольство» (feedback_slova_ne_rabotayut_srazu_v_
 * pamyat_24_09) нарушались как минимум 3 раза: обещание в чате не переживает сжатие
 * диалога, и отложенное пропадает. Текст правила этого не остановил — нужна проверка кодом.
 *
 * Что ловит: в тексте хода (без цитат «…» и блоков кода) — обещание в первом лице, будущее
 * время. Записью считается Write/Edit файла, путь которого содержит /memory/ или /.knowledge/.
 * Что НЕ ловит: что запись именно про отложенное дело (проверить смысл кодом нельзя) —
 * достаточно того, что запись за ход была. Прошедшее время («отложил коммит») и вопрос
 * («отложить?») обещанием не считаются.
 *
 * Режимы (DEFERRAL_RECORD_MODE): block (по умолчанию) | warn | off.
 * Структура — по образцу deploy-readback-guard.mjs.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(here, 'lib', 'current-turn-blocks.mjs')).href);
let recordSignal = () => {};
try {
  ({ recordSignal } = await import(pathToFileURL(path.join(here, 'lib', 'signal-trail.mjs')).href));
} catch { /* общий след недоступен — хук работает без него */ }

// Обещание в первом лице, будущее время. «отложить?» и «отложил» сюда не попадают.
const PROMISE_RE = /(?:^|[^а-яё])(?:отложу|отложим|оставлю\s+на\s+потом|оставим\s+на\s+потом|перенесу\s+на\s+потом|(?:сделаю|займусь|вернусь)\s+(?:этим\s+|к\s+этому\s+)?(?:позже|потом|отдельно)|вернусь\s+к\s+этому)(?![а-яё])/i;
const RECORD_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const emitOk = () => emit({ continue: true, suppressOutput: true });

/** Текст без блоков кода и без цитат «…» — обещание внутри цитаты чужим словом не считается. */
function ownText(blocks) {
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text.replace(/```[\s\S]*?```/g, ' ').replace(/«[^»]*»/g, ' ').replace(/`[^`]*`/g, ' '))
    .join('\n');
}

function hasRecord(blocks) {
  return blocks.some((b) => {
    if (!b || b.type !== 'tool_use' || !RECORD_TOOLS.has(String(b.name || ''))) return false;
    const p = String((b.input && (b.input.file_path || b.input.notebook_path)) || '').replace(/\\/g, '/');
    return /\/memory\//.test(p) || /\/\.knowledge\//.test(p);
  });
}

function main() {
  const mode = (process.env.DEFERRAL_RECORD_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();

  let hookData = {};
  try { hookData = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk();
  if (!hookData.transcript_path) emitOk();

  const blocks = collectCurrentTurnBlocks(hookData.transcript_path);
  const m = ownText(blocks).match(PROMISE_RE);
  if (!m) emitOk();
  if (hasRecord(blocks)) emitOk();

  const reason =
    `⚠️  deferral-record — в ответе обещание отложить дело («${m[0].trim()}»), но записи в память или в .knowledge/ за этот ход нет.\n\n` +
    `Обещание в чате не переживает сжатие диалога, и отложенное теряется (правила feedback_zapisyvat_namerenno_otlozhennyi_obem и feedback_slova_ne_rabotayut_srazu_v_pamyat_24_09).\n` +
    `Перед завершением хода:\n` +
    `  1. Запиши отложенное дело в память (файл project_*.md в memory/ + строка в MEMORY.md): что отложено, почему, при каком условии возвращаться.\n` +
    `  2. Либо убери обещание из ответа, если откладывать нечего.\n\n` +
    `Отключить на раз: DEFERRAL_RECORD_MODE=off`;

  try { recordSignal('deferral-record', mode === 'block' ? 4 : 3, m[0].trim()); } catch { /* след необязателен */ }
  if (mode === 'warn') emit({ continue: true, systemMessage: reason });
  emit({ decision: 'block', reason });
}

try { main(); } catch { emitOk(); }
