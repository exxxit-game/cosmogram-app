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

let recordSignal = () => {};
try {
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'signal-trail.mjs');
  const { recordSignal: rs } = await import(pathToFileURL(modPath).href);
  recordSignal = rs;
} catch { /* модуль недоступен — хук продолжает работать без общего следа */ }

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

// Собирает content-блоки всех assistant-сообщений с конца транскрипта назад,
// до первого НАСТОЯЩЕГО пользовательского сообщения (tool_result — не в счёт,
// это ответ на мой же вызов инструмента внутри того же хода).
function collectCurrentTurnBlocks(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return [];
  }
  const collected = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (isGenuineUserEntry(entry)) break; // граница хода — дальше не наш ход
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) collected.unshift(content[j]);
  }
  return collected;
}

function findViolation(blocks) {
  let sawQuestion = false;
  let questionText = '';
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
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

  const blocks = collectCurrentTurnBlocks(transcriptPath);
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
