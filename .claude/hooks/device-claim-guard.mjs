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

const DEFAULT_MODE = 'warn';
const WINDOW_MIN = 30;

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

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readLastAssistantMessage(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
  } catch {
    return '';
  }
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
    const content = entry.message && entry.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    }
    return '';
  }
  return '';
}

function hasRecentDeviceToolCall(transcriptPath, windowMin) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return false;
  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
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

  const message = readLastAssistantMessage(transcriptPath);
  if (!message || !CLAIM_WORD_RE.test(message) || !DEVICE_WORD_RE.test(message)) {
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
