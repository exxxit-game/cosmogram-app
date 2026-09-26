#!/usr/bin/env node
/* device-eval-vs-hwshot-guard.mjs — 27.09.2026, построен по прямому требованию владельца
   в моменте ("подумай, как сделать так, чтобы я больше на такое не натыкался"), после
   конкретного провала: телефон был подключён, несколько раз подряд спрашивал
   window.Telegram.WebApp.BackButton.isVisible через live-device.mjs eval и ДОВЕРЯЛ ответу
   (true), вместо того чтобы сразу взять hwshot (настоящий adb screencap). Реальный экран в
   этот же момент показывал обратное — кнопки не было. JS-свойство отражает «что игра сама
   попросила у моста», не «что реально отрисовал нативный chrome Telegram».

   Механика (тот же сигнальный след, что device-idle-nudge.mjs, отдельный trail):
   - PostToolUse Bash, команда содержит `live-device.mjs eval` И текст запроса похож на
     проверку видимости/состояния (эвристика: isVisible|isFullscreen|isExpanded|classList|
     getComputedStyle|className) -> метка category=state-eval
   - PostToolUse Bash, команда содержит `live-device.mjs hwshot` -> категория=hwshot-used
     (сбрасывает счётчик — после реального кадра экрана начинаем считать заново)
   - Если state-eval подряд (без hwshot между ними) накопилось >= THRESHOLD — предупредить
     (warn, не блокировать: сам eval не опасен, опасно ДОВЕРЯТЬ ему вместо реального кадра).
   Отключить на раз: DEVICE_EVAL_GUARD_MODE=off */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODE = (process.env.DEVICE_EVAL_GUARD_MODE || 'warn').toLowerCase();
const THRESHOLD = 2;
const TRAIL = 'device-eval-vs-hwshot';
const LIVE_EVAL_RE = /live-device\.mjs\s+eval\b/;
const HWSHOT_RE = /live-device\.mjs\s+hwshot\b/;
const STATE_LOOKING_RE = /isVisible|isFullscreen|isExpanded|classList|getComputedStyle|className|display\s*[:=]|visibility\s*[:=]/;

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
function stateEvalsSinceLastHwshot(entries) {
  let lastHwshotTs = 0;
  for (const e of entries) if (e.category === 'hwshot-used' && e.ts > lastHwshotTs) lastHwshotTs = e.ts;
  return entries.filter(e => e.category === 'state-eval' && e.ts > lastHwshotTs).length;
}

function main() {
  if (MODE === 'off') return;
  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { return; }
  if ((hookData.tool_name || '') !== 'Bash') return;
  const cmd = String((hookData.tool_input || {}).command || '');

  if (HWSHOT_RE.test(cmd)) { record('hwshot-used'); return; }
  if (!LIVE_EVAL_RE.test(cmd) || !STATE_LOOKING_RE.test(cmd)) return;

  record('state-eval');
  const n = stateEvalsSinceLastHwshot(readEntries());
  if (n >= THRESHOLD) {
    console.error(
      `⚠ device-eval-vs-hwshot: ${n}-й подряд live-device.mjs eval про видимость/состояние ` +
      `(isVisible/isFullscreen/classList и т.п.) без единого hwshot между ними. JS-свойство — ` +
      `это то, что игра САМА попросила у моста, не подтверждение, что Telegram реально это ` +
      `отрисовал (27.09.2026: BackButton.isVisible держал true, пока реальный hwshot-скриншот ` +
      `в тот же момент показывал кнопку отсутствующей). Взять hwshot СЕЙЧАС же: ` +
      `node tools/live-device.mjs hwshot <serial> <outPngPath>\n` +
      `Отключить на раз: DEVICE_EVAL_GUARD_MODE=off`
    );
  }
}

try { main(); } catch { /* fail-safe: тихо не мешать основной работе */ }
