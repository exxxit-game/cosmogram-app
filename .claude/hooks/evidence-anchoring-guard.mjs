#!/usr/bin/env node
/*
 * evidence-anchoring-guard.mjs — 27.09.2026, по прямому требованию владельца после
 * реального провала: владелец прислал скриншоты «как было раньше» (прямое доказательство
 * нужного состояния), а я вместо того чтобы пересмотреть СВОЮ уже сложившуюся техническую
 * гипотезу («нужна наша кнопка-замена, просто криво стоит») — подогнал доказательства ПОД
 * неё (стал калибровать пиксели позиции), вместо того чтобы проверить саму гипотезу.
 * Владелец: «если ты не понял задачу — ты у меня спрашиваешь», «тут какой-то хук надо».
 *
 * Механика (тот же Stop-хук/transcript-паттерн, что ask-then-act-guard.mjs, не изобретено
 * заново): если ПОСЛЕДНЕЕ настоящее сообщение владельца содержало изображения (image
 * content-блок — скриншот, доказательство состояния), и в текущем ходе есть вызов
 * состояние-меняющего инструмента (Edit/Write/Bash) БЕЗ единого AskUserQuestion до него —
 * предупредить. Не блокирует: иногда картинка достаточно однозначна для прямого действия,
 * это напоминание сверить план с доказательством, а не жёсткий гейт.
 *
 * Режимы (EVIDENCE_ANCHOR_ENFORCE_MODE): warn (по умолчанию) | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_MODE = 'warn';
const STATE_CHANGING_TOOL_RE = /^(Edit|MultiEdit|Write|NotebookEdit|Bash)$/i;
// 29.09.2026: было своей копией функции здесь — вынесено в lib/read-transcript-tail.mjs,
// после того как тот же баг нашёлся ЕЩЁ в четырёх хуках отдельно от этого. Один модуль,
// не шесть копий.
let readTail;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'read-transcript-tail.mjs');
  ({ readTail } = await import(pathToFileURL(modPath).href));
}

function isToolResultUserEntry(entry) {
  if (entry.type !== 'user') return false;
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && b.type === 'tool_result');
}
function isGenuineUserEntry(entry) {
  if (entry.type !== 'user') return false;
  return !isToolResultUserEntry(entry);
}
function userEntryHasImage(entry) {
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && (b.type === 'image' ||
    (b.type === 'tool_result' && Array.isArray(b.content) && b.content.some((c) => c && c.type === 'image'))));
}

// Идём с конца транскрипта: сначала собираем блоки ТЕКУЩЕГО хода (всё после последнего
// настоящего user-сообщения), затем смотрим, содержало ли ТО САМОЕ user-сообщение картинку.
function analyze(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let lines;
  try { lines = readTail(transcriptPath).split('\n'); } catch { return null; }

  const currentTurnBlocks = [];
  let lastGenuineUserEntry = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (isGenuineUserEntry(entry)) { lastGenuineUserEntry = entry; break; }
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) currentTurnBlocks.unshift(content[j]);
  }
  if (!lastGenuineUserEntry || !userEntryHasImage(lastGenuineUserEntry)) return null;

  let sawAskUserQuestion = false;
  for (const b of currentTurnBlocks) {
    if (!b || typeof b !== 'object' || b.type !== 'tool_use') continue;
    const name = String(b.name || '');
    if (name === 'AskUserQuestion') { sawAskUserQuestion = true; continue; }
    if (STATE_CHANGING_TOOL_RE.test(name) && !sawAskUserQuestion) {
      return { tool: name };
    }
  }
  return null;
}

function emitOk() { process.stdout.write('{"continue": true, "suppressOutput": true}\n'); process.exit(0); }
function emitWarn(msg) { process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n'); process.exit(0); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

function main() {
  const mode = (process.env.EVIDENCE_ANCHOR_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
  if (mode === 'off') emitOk();

  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk();

  const violation = analyze(hookData.transcript_path);
  if (!violation) emitOk();

  emitWarn(
    `⚠️  evidence-anchoring — владелец только что прислал изображение(я) (доказательство ` +
    `состояния), а в этом же ходе вызван ${violation.tool} без единого AskUserQuestion до него. ` +
    `Проверь: план действия выведен ИЗ присланного доказательства, или это старая гипотеза, ` +
    `под которую доказательство просто подогнано? Если не уверен — спроси, не действуй по ` +
    `инерции прежнего плана.\n` +
    `Отключить на раз: EVIDENCE_ANCHOR_ENFORCE_MODE=off`
  );
}

try { main(); } catch { emitOk(); }
