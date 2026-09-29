#!/usr/bin/env node
/*
 * device-claim-guard.mjs — 26.09.2026, шорт-лист аудита памяти, пункт #3.
 * Механизирует уже существующее ABSOLUTE-правило (feedback_telefon_podklyuchen_
 * ispolzovat_ego_ne_taro, feedback_maket_realnost_pered_kodom, «визуальный баг
 * под конкретное устройство — сначала доказательство, потом код»): заявление
 * «исправлено на телефоне/на реальном устройстве» без реального вызова
 * adb/live-device.mjs в этом же разговоре незадолго до заявления — это
 * заявление на веру, не проверка.
 *
 * Stop-хук, по образцу claim-check-hook.mjs (та же структура чтения последнего
 * сообщения, тот же fail-safe), но источник "свежести" другой: не
 * claim_checks/log.jsonl, а сам транскрипт — был ли в последние WINDOW_MIN минут
 * реальный Bash-вызов adb/live-device.mjs.
 *
 * Режимы (DEVICE_CLAIM_ENFORCE_MODE): warn (по умолчанию) | block | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 29.09.2026 (владелец: «почини себя везде, где только можно») — тот же
// ERR_STRING_TOO_LONG-баг, что уже чинили в claim-check-hook/ask-then-act-guard/
// evidence-anchoring-guard, был ещё и здесь, в двух местах ниже. Общий модуль.
let readTail;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'read-transcript-tail.mjs');
  ({ readTail } = await import(pathToFileURL(modPath).href));
}
// 30.09.2026 (владелец: «что может стать лучше, где может объединиться») — своя копия
// readLastAssistantMessage() вынесена в lib/last-assistant-message.mjs: та же логика жила
// ТРИЖДЫ (здесь, claim-check-hook.mjs, excuse-words-guard.mjs), и именно из-за раздельных
// копий 29.09.2026 близость-проверка (PROXIMITY_CHARS ниже) чинилась только здесь — баг того
// же класса теоретически мог прятаться в двух других. Один модуль — одна точка починки.
let readLastAssistantMessage;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'last-assistant-message.mjs');
  ({ readLastAssistantMessage } = await import(pathToFileURL(modPath).href));
}
// 29.09.2026 (владелец: «покрыть все непокрытые моменты») — вместе с evidence-anchoring-guard
// был единственным из пяти Stop-хуков без записи в signal-trail при срабатывании.
let recordSignal = () => {};
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'signal-trail.mjs');
  const { recordSignal: rs } = await import(pathToFileURL(modPath).href);
  recordSignal = rs;
}

const DEFAULT_MODE = 'warn';
const WINDOW_MIN = 30;
const STALE_THRESHOLD_S = 30; // передаётся в общий readLastAssistantMessage(), не локальная копия

// Узкий список слов-заявлений (подмножество claim-check, не полный список —
// здесь важна КОМБИНАЦИЯ с device-словом, не сама по себе).
const CLAIM_WORD_RE = new RegExp(
  String.raw`(?:готово|исправлено|проверено|сделано|решено|запущено|работает|` +
    String.raw`починено|подтверждено|verified|fixed|resolved|confirmed)`,
  'i'
);

const DEVICE_WORD_RE = new RegExp(
  String.raw`(?:на\s+телефоне|на\s+устройстве|реальн\S*\s+устройств\S*|` +
    String.raw`реальн\S*\s+телефон\S*|живом\s+устройстве|живой\s+телефон\S*|` +
    String.raw`\bWebView\b|на\s+живом\s+сайте|на\s+проде)`,
  'i'
);

const DEVICE_TOOL_RE = /\badb\b|live-device\.mjs|tools[\/\\]live-device/i;

// 26.09.2026, feedback_test_kejs_sam_pro_sebya_26_09 — этот же хук ложно срабатывал
// на прозе, ОПИСЫВАЮЩЕЙ его самого (например, отчёт о вечерней работе, упоминающий
// и claim-слово, и device-слово как пример). Проверка: рядом (±100 символов) с
// матчем есть слово, указывающее на обсуждение/пример, а не на реальное заявление.
const DISCUSSION_MARKER_RE = /(?:ловит|хук|guard\.mjs|например|вроде\s+фраз|описыва\S*|паттерн)/i;

function isDiscussionContext(message) {
  const claimM = CLAIM_WORD_RE.exec(message);
  const deviceM = DEVICE_WORD_RE.exec(message);
  if (!claimM || !deviceM) return false;
  const positions = [claimM.index, deviceM.index];
  for (const pos of positions) {
    const ctx = message.slice(Math.max(0, pos - 100), Math.min(message.length, pos + 100));
    if (DISCUSSION_MARKER_RE.test(ctx)) return true;
  }
  return false;
}

// 29.09.2026, живой провал, найден при самопроверке хуков (не в теории): длинное
// сообщение упомянуло «проверено» (про запись claim-check, ~начало сообщения) и
// «на телефоне» (про то, что живой тест ЕЩЁ НЕ делали, ~конец сообщения) — 1600+
// символов друг от друга, в двух вообще не связанных предложениях. Хук требовал
// подтверждения фикса на телефоне, которого никто не заявлял. Проверка ANYWHERE
// в сообщении достаточна для короткой реплики, но не для длинного отчёта — нужна
// БЛИЗОСТЬ: хотя бы одна пара совпадений claim+device в пределах PROXIMITY_CHARS
// друг от друга (как в одном предложении/соседних), не просто оба слова где-то.
const PROXIMITY_CHARS = 300;

function hasProximateClaim(message) {
  const claimRe = new RegExp(CLAIM_WORD_RE.source, 'gi');
  const deviceRe = new RegExp(DEVICE_WORD_RE.source, 'gi');
  const claimPositions = [];
  const devicePositions = [];
  let m;
  while ((m = claimRe.exec(message)) !== null) { claimPositions.push(m.index); if (m[0] === '') claimRe.lastIndex++; }
  while ((m = deviceRe.exec(message)) !== null) { devicePositions.push(m.index); if (m[0] === '') deviceRe.lastIndex++; }
  for (const c of claimPositions) {
    for (const d of devicePositions) {
      if (Math.abs(c - d) <= PROXIMITY_CHARS) return true;
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

function hasRecentDeviceToolCall(transcriptPath, windowMin) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return false;
  }
  const nowMs = Date.now();
  const windowMs = windowMin * 60_000;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.timestamp) {
      const ts = new Date(entry.timestamp).getTime();
      if (Number.isFinite(ts) && nowMs - ts > windowMs) break; // ушли за окно — дальше только старее
    }
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b && b.type === 'tool_use' && b.name === 'Bash') {
        const cmd = String((b.input && b.input.command) || '');
        if (DEVICE_TOOL_RE.test(cmd)) return true;
      }
    }
  }
  return false;
}

function main() {
  const mode = (process.env.DEVICE_CLAIM_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
  if (mode === 'off') {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  let hookData;
  try {
    hookData = JSON.parse(readStdin() || '{}');
  } catch {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }
  if (hookData.stop_hook_active === true) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const transcriptPath = hookData.transcript_path;
  if (!transcriptPath) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const message = readLastAssistantMessage(transcriptPath, STALE_THRESHOLD_S);
  if (!message || !hasProximateClaim(message)) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  if (isDiscussionContext(message)) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  if (hasRecentDeviceToolCall(transcriptPath, WINDOW_MIN)) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const reason =
    `⚠️  device-claim-guard — заявление о фиксе на реальном устройстве/телефоне без\n` +
    `реального вызова adb/live-device.mjs за последние ${WINDOW_MIN} мин в этом разговоре.\n` +
    `«Похоже по коду» — это гипотеза, не находка (feedback_rm_nenadezhen_webview_25_09).\n` +
    `Подтвердить живым вызовом или переформулировать заявление как гипотезу.\n\n` +
    `Отключить на раз: DEVICE_CLAIM_ENFORCE_MODE=off`;

  try { recordSignal('device-claim', mode === 'block' ? 4 : 3, 'device claim without recent tool call'); } catch { /* см. комментарий у импорта выше */ }

  const mode2 = mode;
  if (mode2 === 'warn') {
    process.stdout.write(JSON.stringify({ continue: true, systemMessage: reason }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
}

try {
  main();
} catch {
  process.stdout.write('{"continue": true, "suppressOutput": true}\n');
}
