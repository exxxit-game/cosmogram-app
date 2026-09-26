#!/usr/bin/env node
/* device-idle-nudge.mjs — 26.09.2026, построен по прямому требованию владельца в моменте
   ("толку от повтора записанного, надо хук") после ВТОРОГО за один день провала того же
   класса: телефон специально подключён под задачу, несколько часов правок render.js —
   ни разу не тронут. device-claim-guard.mjs уже существовал, но ловит только СЛОВА
   ("исправлено на телефоне" без реального вызова) — здесь провал был ТИХИЙ, я вообще
   не упоминал телефон, значит слов-триггеров не было и старый хук молчал. Этот хук не
   про слова, а про ДЕЙСТВИЕ: N правок perf-файлов подряд без единого вызова
   live-device.mjs между ними, при реально подключённом устройстве.

   Механика (тот же сигнальный след, что repeat-edit-tracker.sh, отдельный trail):
   - PostToolUse Edit/Write на js/render.js или js/game.js -> метка category=perf-edit
   - PostToolUse Bash, команда содержит live-device.mjs -> метка category=device-used
     (эта метка не для эскалации, а как сброс счётчика — считаем perf-edit ПОСЛЕ неё)
   - Если perf-edit меток после последней device-used (или с начала трейла, если её ещё
     не было) накопилось >= THRESHOLD, и `adb devices` прямо сейчас показывает реально
     подключённое устройство — предупредить (warn, не блокировать: правка кода сама по
     себе не опасна, опасно ЗАБЫТЬ, что есть более авторитетный канал проверки).
   Отключить на раз: DEVICE_IDLE_NUDGE_MODE=off */
import { execSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODE = (process.env.DEVICE_IDLE_NUDGE_MODE || 'warn').toLowerCase();
const THRESHOLD = 3;
const TRAIL = 'device-idle';
const PERF_FILE_RE = /[\\/]js[\\/](render|game)\.js$/;
const LIVE_DEVICE_RE = /live-device\.mjs/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '..', 'state');
const TRAIL_PATH = join(STATE_DIR, `signal-trail-${TRAIL}.jsonl`);

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function record(category) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(TRAIL_PATH, JSON.stringify({ ts: Date.now(), category }) + '\n', 'utf8');
}

function readEntries() {
  if (!existsSync(TRAIL_PATH)) return [];
  return readFileSync(TRAIL_PATH, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function perfEditsSinceLastDeviceUse(entries) {
  let lastDeviceTs = 0;
  for (const e of entries) if (e.category === 'device-used' && e.ts > lastDeviceTs) lastDeviceTs = e.ts;
  return entries.filter(e => e.category === 'perf-edit' && e.ts > lastDeviceTs).length;
}

function hasConnectedDevice() {
  try {
    const out = execSync('adb devices', { encoding: 'utf8', timeout: 5000 });
    return out.split('\n').slice(1).some(l => /\tdevice$/.test(l.trim()));
  } catch { return false; }
}

function main() {
  if (MODE === 'off') return;
  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { return; }

  const toolName = hookData.tool_name || '';
  const input = hookData.tool_input || {};

  if (toolName === 'Bash') {
    const cmd = String(input.command || '');
    if (LIVE_DEVICE_RE.test(cmd)) record('device-used');
    return; // Bash-вызовы сами по себе не считаются perf-правкой
  }

  if (toolName === 'Edit' || toolName === 'Write') {
    const file = String(input.file_path || '');
    if (!PERF_FILE_RE.test(file)) return;
    record('perf-edit');
    const entries = readEntries();
    const n = perfEditsSinceLastDeviceUse(entries);
    if (n >= THRESHOLD && hasConnectedDevice()) {
      console.error(
        `⚠ device-idle-nudge: ${n}-я правка ${file.match(PERF_FILE_RE)[0]} подряд без единого ` +
        `вызова tools/live-device.mjs, а телефон СЕЙЧАС подключён (adb devices подтверждает). ` +
        `Десктопные числа могут системно занижать реальную цену на слабом железе (26.09.2026: ` +
        `id125 — 2.12мс на Samsung SM-A032F против ~0.4мс на десктопе, разница в 5 раз) — ` +
        `перепроверить живьём: node tools/live-device.mjs forward <serial> && ... eval <pageId> "...".\n` +
        `Отключить на раз: DEVICE_IDLE_NUDGE_MODE=off`
      );
    }
  }
}

try { main(); } catch { /* fail-safe: тихо не мешать основной работе */ }
