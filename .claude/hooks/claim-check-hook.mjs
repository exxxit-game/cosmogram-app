#!/usr/bin/env node
/*
 * claim-check-hook.mjs — Node.js порт claim_check_hook.py (PrimeFoldTools/andon,
 * https://github.com/PrimeFoldTools/andon, MIT-подобная лицензия проверена перед
 * установкой 19.09.2026). Оригинал требует Python 3 — на этой машине Python не
 * установлен, а ставить новый рантайм ради одного хука противоречит правилу
 * проекта «не тащи новый сервис, если уже есть готовое» (у нас уже Node везде).
 * Логика 1:1 с оригиналом, включая все регулярки и fail-safe поведение — ничего
 * не додумано заново, только язык рантайма другой.
 *
 * Блокирует (или предупреждает, в зависимости от режима) конец хода, если
 * последнее сообщение ассистента содержит «готово/исправлено/проверено» без
 * свежей записи в журнале верификации (log_claim.mjs пишет эту запись).
 *
 * Режимы (переменная окружения CLAIM_CHECK_ENFORCE_MODE):
 *   warn   — предупредить, не блокировать (по умолчанию, пока не проверено)
 *   block  — блокировать конец хода без свежей записи
 *   off    — молча пропускать
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAIM_CHECKS_LOG = path.resolve(
  process.env.CLAIM_CHECKS_LOG_PATH ||
    path.join(os.homedir(), '.claude', 'state', 'claim_checks', 'log.jsonl')
);
const CLAIM_CHECK_FRESH_MIN = 15;   // минут — записи свежее этого считаются актуальными
const STALE_THRESHOLD_S = 30;       // защита от гонки при сбросе транскрипта на диск
const DEFAULT_MODE = 'warn';

// Однозначные слова-закрытия — узкий список, чтобы не срабатывать на обычной
// прозе («данные актуальны», «мы закончили?»).
const COMPLETION_VERBS = [
  'ready', 'shipped', 'complete', 'completed', 'done',
  'verified', 'fixed', 'resolved', 'production[\\s-]ready',
];
const VERBS = COMPLETION_VERBS.join('|');

const CLAIM_PATTERNS = [
  // "Done.", "All set.", "Shipped:", "Ready — ..." — в начале строки/предложения
  new RegExp(
    String.raw`(?:^|(?<=[.!?])\s+|\n)\s*` +
      String.raw`(?:done|complete|completed|ready|verified|fixed|resolved|shipped|` +
      String.raw`production[\s-]ready|all\s+set)\b` +
      String.raw`(?:\s*(?:[.!:;]|—|-)|\s*$)`,
    'im'
  ),
  // "Shipped the fix.", "Fixed the tests." — глагол + определитель + объект,
  // чтобы НЕ срабатывать на обычных причастиях («Fixed income securities…»)
  new RegExp(
    String.raw`(?:^|(?<=[.!?])\s+|\n)\s*` +
      String.raw`(?:shipped|fixed|verified|resolved|completed|implemented)\s+` +
      String.raw`(?:the|this|that|these|those|all|our|your|its|my)\b[^\n.!?]{0,80}`,
    'im'
  ),
  // "X is/are [already/now/fully] $VERB"
  new RegExp(
    String.raw`\b(?:is|are|has\s+been|have\s+been|now|finally|fully|officially|already)` +
      String.raw`(?:\s+(?:already|just|now|fully))?` +
      String.raw`\s+(?:${VERBS})\b`,
    'i'
  ),
  // Жирные маркеры
  /\*\*(?:SHIPPED|DONE|COMPLETE|READY|VERIFIED|LIVE|FIXED|RESOLVED|CLOSED)\*\*/,
  // "verified end-to-end"
  /\bverified\s+end[\s-]to[\s-]end\b/i,

  /* 24.09.2026 (владелец: «размышляй дальше, ищи») — до этой правки все паттерны
     выше были ТОЛЬКО на английском, хотя правило проекта требует отвечать
     ПО-РУССКИ всегда (ABSOLUTE). Значит хук был декоративным весь вечер —
     «готово»/«исправлено»/«проверено» на русском не ловились НИ РАЗУМ. \b в
     JS regex не понимает кириллицу (основан на \w, туда кириллица не входит) —
     границы слова ниже сделаны через (?:^|\s|["«]) / (?=[\s.,!?:;—-]|$), не \b. */
  // "Готово.", "Исправлено:", "Проверено —", в начале строки/предложения
  new RegExp(
    String.raw`(?:^|(?<=[.!?])\s+|\n)\s*` +
      String.raw`(?:готово|исправлено|проверено|сделано|решено|запущено|работает|` +
      String.raw`закончено|завершено|закрыто|починено|отправлено|доделано)` +
      String.raw`(?=[\s.,!:;—-]|$)`,
    'im'
  ),
  // "Исправил X", "Проверил X", "Починил X", "Запустил X", "Сделал X", "Решил X"
  new RegExp(
    String.raw`(?:^|(?<=[.!?])\s+|\n)\s*` +
      String.raw`(?:исправил|проверил|починил|запустил|сделал|решил|доделал|` +
      String.raw`отправил|завершил|закрыл|реализовал)\S{0,3}\s+` +
      String.raw`[^\n.!?]{0,80}`,
    'im'
  ),
  // "X готово/исправлено/работает/проверено" (подлежащее + предикат)
  new RegExp(
    String.raw`[^\n.!?]{0,60}\s+` +
      String.raw`(?:уже|теперь|наконец|полностью|окончательно)?\s*` +
      String.raw`(?:готово|исправлено|проверено|работает|решено|сделано|запущено)` +
      String.raw`(?=[\s.,!:;—-]|$)`,
    'i'
  ),
  // Жирные маркеры на русском
  /\*\*(?:ГОТОВО|ИСПРАВЛЕНО|ПРОВЕРЕНО|СДЕЛАНО|РЕШЕНО|ЗАПУЩЕНО|ЗАВЕРШЕНО|ЗАКРЫТО)\*\*/,
];

const EXEMPT_CONTEXT = [
  /[“”]\s*[^“”]{0,80}\bis\s+(?:done|ready|complete)\b[^“”]{0,80}\s*[“”]/,
  /\bwould\s+(?:be|claim|say)\s+(?:is|are)\s+/i,
];

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

function parseTsAsUtc(tsStr) {
  return new Date(tsStr).getTime() / 1000;
}

function readLastAssistantMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return '';
  }
  const nowTs = Date.now() / 1000;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant') continue;
    const tsStr = entry.timestamp;
    if (tsStr) {
      const ts = parseTsAsUtc(tsStr);
      if (!Number.isNaN(ts) && nowTs - ts > STALE_THRESHOLD_S) return ''; // устаревший ход
    }
    const msg = entry.message || {};
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((b) => b && typeof b === 'object' && b.type === 'text')
        .map((b) => b.text || '')
        .join('\n');
    }
    return '';
  }
  return '';
}

function isBacktickWrapped(text, mStart, mEnd) {
  const btOpen = text.lastIndexOf('`', mStart - 1);
  if (btOpen === -1 || btOpen < mStart - 200) return false;
  const btClose = text.indexOf('`', mEnd);
  if (btClose === -1 || btClose > mEnd + 200) return false;
  return !text.slice(btOpen + 1, mStart).includes('`');
}

function isBlockquoteLine(text, mStart) {
  const lineStart = text.lastIndexOf('\n', mStart - 1) + 1;
  let i = lineStart;
  let sawGt = false;
  while (i < mStart) {
    const c = text[i];
    if (c === '>') {
      sawGt = true;
      i++;
    } else if (c === ' ' || c === '\t') {
      i++;
    } else break;
  }
  return sawGt;
}

function endsInQuestion(text, mEnd) {
  for (let i = mEnd; i < Math.min(text.length, mEnd + 160); i++) {
    const c = text[i];
    if (c === '.' || c === '!' || c === '?' || c === '\n') return c === '?';
  }
  return false;
}

function findClaims(text) {
  const matches = [];
  const seen = new Set();
  for (const pat of CLAIM_PATTERNS) {
    const re = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; } // защита от зависания на пустом совпадении
      const phrase = m[0].trim();
      const key = phrase.toLowerCase();
      const mStart = m.index, mEnd = m.index + m[0].length;
      if (seen.has(key)) continue;
      if (endsInQuestion(text, mEnd)) continue;
      if (isBacktickWrapped(text, mStart, mEnd)) continue;
      if (isBlockquoteLine(text, mStart)) continue;
      const ctx = text.slice(Math.max(0, mStart - 80), Math.min(text.length, mEnd + 80));
      if (EXEMPT_CONTEXT.some((ex) => ex.test(ctx))) continue;
      seen.add(key);
      matches.push(phrase);
      if (matches.length >= 5) return matches;
    }
  }
  return matches;
}

function hasFreshLog(windowMin = CLAIM_CHECK_FRESH_MIN) {
  if (!fs.existsSync(CLAIM_CHECKS_LOG)) return false;
  let lines;
  try {
    lines = fs.readFileSync(CLAIM_CHECKS_LOG, 'utf8').split('\n');
  } catch {
    return false;
  }
  const nowTs = Date.now() / 1000;
  const cutoff = nowTs - windowMin * 60;
  const tail = lines.slice(-20);
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i].trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      const tsStr = entry.timestamp || entry.ts;
      if (!tsStr) continue;
      const ts = parseTsAsUtc(tsStr);
      if (!Number.isNaN(ts) && ts >= cutoff) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const mode = (process.env.CLAIM_CHECK_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
  if (mode === 'off') emitOk();

  let hookData;
  try {
    hookData = JSON.parse(readStdin() || '{}');
  } catch {
    emitOk();
  }

  if (hookData.stop_hook_active === true) emitOk(); // не зацикливаться на повторной блокировке

  const transcriptPath = hookData.transcript_path;
  if (!transcriptPath) emitOk();

  const message = readLastAssistantMessage(transcriptPath);
  if (!message) emitOk();

  const claims = findClaims(message);
  if (!claims.length) emitOk();

  if (hasFreshLog()) emitOk();

  const bullets = claims.map((p) => `  - "${p}"`).join('\n');
  const reason =
    `⚠️  Claim-check — заявлено «готово» без свежей записи о верификации.\n` +
    `Совпавшие фразы:\n${bullets}\n\n` +
    `Последняя запись в claim_checks/log.jsonl старше ${CLAIM_CHECK_FRESH_MIN} мин (или её нет).\n` +
    `Перед завершением хода:\n` +
    `  1. Выполни реальную проверку (тест, живой запуск и т.п.)\n` +
    `  2. Запиши: node .claude/hooks/log-claim.mjs "<что утверждаю>" "<как проверил>"\n` +
    `  3. Ответь заново\n\n` +
    `Отключить на раз: CLAIM_CHECK_ENFORCE_MODE=warn или =off`;

  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

try {
  main();
} catch {
  // Настоящий fail-safe: неожиданная ошибка НИКОГДА не должна ломать ход владельца.
  emitOk();
}
