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
// 30.09.2026 (владелец: «что может стать лучше, где может объединиться») —
// isGenuineUserEntry/isToolResultUserEntry/граничный обход были побайтово одинаковы в
// этом файле и ask-then-act-guard.mjs. collectCurrentTurnWithBoundary() отдаёт и сам
// граничный user-entry (нужен здесь для userEntryHasImage), и блоки хода после него.
let collectCurrentTurnWithBoundary;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'current-turn-blocks.mjs');
  ({ collectCurrentTurnWithBoundary } = await import(pathToFileURL(modPath).href));
}
// 29.09.2026 (владелец: «покрыть все непокрытые моменты») — этот хук единственный из пяти
// Stop-хуков ни разу не писал в signal-trail при срабатывании (excuse-words/ask-then-act/
// claim-check уже это делают) — значит его реальная частота срабатывания невидима для
// guard-gap-finder.mjs и периодической проверки «изменилось ли поведение», не только
// технически ли хук существует. Тот же приём, что у соседей: fail-safe, если импорт не удался.
let recordSignal = () => {};
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'signal-trail.mjs');
  const { recordSignal: rs } = await import(pathToFileURL(modPath).href);
  recordSignal = rs;
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
  const { lastGenuineUserEntry, currentTurnBlocks } = collectCurrentTurnWithBoundary(transcriptPath);
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

  try { recordSignal('evidence-anchoring', 3, violation.tool); } catch { /* см. комментарий у импорта выше */ }

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
