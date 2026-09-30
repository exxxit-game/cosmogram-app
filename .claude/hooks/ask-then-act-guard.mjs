#!/usr/bin/env node
/*
 * ask-then-act-guard.mjs — 26.09.2026, по прямому требованию владельца после
 * повторившегося 4 раза за вечер одного и того же сбоя: задаю вопрос владельцу
 * и, не дождавшись ответа, в том же ходе вызываю инструмент, который что-то
 * показывает/меняет/публикует. Реальный источник методики — не выдумано:
 *   - авиация, "silent checklist" / self-answered challenge: первый пилот
 *     сам озвучивает challenge И сам на него отвечает без реального ответа
 *     второго пилота — формально признанное нарушение дисциплины
 *     Challenge-Response, не мелочь (code7700.com/checklist_philosophy.htm,
 *     airliners.net "Silent Review/Silent Checklist").
 *   - WHO Surgical Safety Checklist, "time out": действие не начинается, пока
 *     каждый член команды не ответил ВСЛУХ — правило именно про то, что
 *     ответственный не может сам за всех продолжить.
 *   - Ask-when-Needed (агентный ИИ): агент должен ЛИБО спросить, ЛИБО
 *     действовать — не оба сразу в одном ходе без разделяющего реального
 *     ответа пользователя.
 * Структура файла — по образцу claim-check-hook.mjs (тот же Stop-хук, тот же
 * формат ответа, тот же fail-safe), не изобретено заново.
 *
 * Режимы (ASK_THEN_ACT_ENFORCE_MODE): warn (по умолчанию) | block | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 29.09.2026: было своей копией функции здесь — вынесено в lib/read-transcript-tail.mjs,
// после того как тот же баг (ERR_STRING_TOO_LONG на транскриптах с картинками, >512МБ)
// нашёлся ЕЩЁ в четырёх хуках отдельно от этого. Один модуль — не шесть копий.
let readTail;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'read-transcript-tail.mjs');
  ({ readTail } = await import(pathToFileURL(modPath).href));
}
// 30.09.2026 (владелец: «что может стать лучше, где может объединиться») —
// isGenuineUserEntry/isToolResultUserEntry/collectCurrentTurnBlocks были побайтово
// одинаковы в этом файле и evidence-anchoring-guard.mjs — не похожи, скопированы.
let isGenuineUserEntry;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'current-turn-blocks.mjs');
  ({ isGenuineUserEntry } = await import(pathToFileURL(modPath).href));
}

let recordSignal = () => {};
try {
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'signal-trail.mjs');
  const { recordSignal: rs } = await import(pathToFileURL(modPath).href);
  recordSignal = rs;
} catch { /* модуль недоступен — хук продолжает работать без общего следа */ }

// 30.09.2026: ответ владельца через окно выбора (AskUserQuestion) приходит в журнал не как
// обычное сообщение владельца, а как user-запись с tool_result на мой же вызов AskUserQuestion
// (в ней toolUseResult.answers и текст "Your questions have been answered..."). Общий
// collectCurrentTurnBlocks такие записи пропускает как "ответ на мой инструмент" — и хук
// считал вопрос без ответа, блокируя ход ПОСЛЕ того, как владелец уже ответил окном.
// Здесь собираем блоки хода по порядку и на месте настоящего ответа окна ставим метку
// {type:'owner_answer'}. Ответом считается ТОЛЬКО tool_result с id моего AskUserQuestion из
// этого же хода и без is_error (отказ/закрытие окна — не ответ).
function isAskAnswer(block, askIds, entry) {
  if (!block || block.type !== 'tool_result' || !askIds.has(block.tool_use_id)) return false;
  if (block.is_error === true) return false;
  const tur = entry.toolUseResult;
  if (tur && typeof tur === 'object' && tur.answers && typeof tur.answers === 'object' && Object.keys(tur.answers).length) return true;
  const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content || '');
  return /have been answered|user answered/i.test(text);
}

function collectTurnItems(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return [];
  }
  const entries = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    try { entries.push(JSON.parse(line)); } catch { /* обрубленная/битая строка — пропускаем */ }
  }
  let start = 0; // граница хода: после последнего НАСТОЯЩЕГО сообщения владельца
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isGenuineUserEntry(entries[i])) { start = i + 1; break; }
  }
  const items = [];
  const askIds = new Set();
  for (let i = start; i < entries.length; i++) {
    const entry = entries[i];
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    if (entry.type === 'assistant') {
      for (const b of content) {
        if (b && b.type === 'tool_use' && b.name === 'AskUserQuestion' && b.id) askIds.add(b.id);
        items.push(b);
      }
    } else if (entry.type === 'user') {
      if (content.some((b) => isAskAnswer(b, askIds, entry))) items.push({ type: 'owner_answer' });
    }
  }
  return items;
}

const DEFAULT_MODE = 'warn';

// Инструменты, которые реально что-то показывают/меняют/публикуют — та же
// граница, что уже действует у protect-core.sh/claim-check, не новая идея.
const STATE_CHANGING_TOOL_RE = new RegExp(
  String.raw`^(Edit|MultiEdit|Write|NotebookEdit)$` +
    String.raw`|mcp__.*__(show_widget|publish|create_design|export_html_to_express|` +
    String.raw`deploy_edge_function|execute_sql|apply_migration|animate_design)$`,
  'i'
);

// "?" — общий символ вопроса в обоих алфавитах, доп. кириллический маркер на
// случай риторического "не так ли"/"верно?" без явного "?" в редких обрубленных
// цитатах не ловим — честная граница, не идеальный детектор диалога.
function endsWithQuestion(text) {
  const t = String(text || '').trimEnd();
  if (!t) return false;
  return /[?？]\s*$/.test(t) || /[?？]["»]?\s*$/.test(t);
}

function questionSnippet(text) {
  const t = String(text || '').trim();
  const lastPeriodGroup = Math.max(t.lastIndexOf('. '), t.lastIndexOf('\n'), t.lastIndexOf('! '));
  const start = lastPeriodGroup === -1 ? 0 : lastPeriodGroup + 1;
  return t.slice(start).trim().slice(-160);
}

function findViolation(blocks) {
  let sawQuestion = false;
  let questionText = '';
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'owner_answer') { sawQuestion = false; questionText = ''; continue; }
    if (b.type === 'text') {
      if (endsWithQuestion(b.text)) {
        sawQuestion = true;
        questionText = questionSnippet(b.text);
      } else if (String(b.text || '').trim()) {
        // новый содержательный текст без вопроса — не сбрасываем sawQuestion:
        // считаем весь ход одним блоком до реального ответа владельца.
      }
      continue;
    }
    if (b.type === 'tool_use' && sawQuestion) {
      const name = String(b.name || '');
      if (STATE_CHANGING_TOOL_RE.test(name)) {
        return { question: questionText, tool: name };
      }
    }
  }
  return null;
}

function emitOk() {
  process.stdout.write('{"continue": true, "suppressOutput": true}\n');
  process.exit(0);
}
function emitWarn(msg) {
  process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n');
  process.exit(0);
}
function emitBlock(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
  process.exit(0);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const mode = (process.env.ASK_THEN_ACT_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
  if (mode === 'off') emitOk();

  let hookData;
  try {
    hookData = JSON.parse(readStdin() || '{}');
  } catch {
    emitOk();
  }

  if (hookData.stop_hook_active === true) emitOk();

  const transcriptPath = hookData.transcript_path;
  if (!transcriptPath) emitOk();

  const blocks = collectTurnItems(transcriptPath);
  if (!blocks.length) emitOk();

  const violation = findViolation(blocks);
  if (!violation) emitOk();

  const reason =
    `⚠️  ask-then-act — в этом же ходе задан вопрос владельцу и вызван инструмент,\n` +
    `меняющий/показывающий что-то, БЕЗ реального ответа владельца между ними.\n` +
    `Вопрос: "${violation.question}"\n` +
    `Инструмент, вызванный после: ${violation.tool}\n\n` +
    `Авиация называет это self-answered challenge (silent checklist) — формальное\n` +
    `нарушение Challenge-Response, не мелочь. Если вопрос был риторическим —\n` +
    `не задавай его как вопрос. Если это правда вопрос — дождись ответа, не\n` +
    `действуй в этом же ответе.\n\n` +
    `Отключить на раз: ASK_THEN_ACT_ENFORCE_MODE=off`;

  try { recordSignal('ask-then-act', mode === 'block' ? 4 : 3, violation.tool); } catch { /* см. комментарий у импорта выше */ }

  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

try {
  main();
} catch {
  emitOk();
}
