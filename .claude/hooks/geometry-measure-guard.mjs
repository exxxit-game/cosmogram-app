#!/usr/bin/env node
/*
 * geometry-measure-guard.mjs — 26.09.2026, шорт-лист аудита памяти, пункт #5
 * (изначально отложен как "слишком шумный" без дополнительной проработки —
 * владелец прямо спросил, не потолок ли это раньше времени; пробую честно,
 * не отказываюсь заранее).
 *
 * Механизирует ABSOLUTE-правило feedback_izmeryat_ne_gadat_geometriya (11.09.2026,
 * дословно владельца): "никогда не гадай/оценивай пиксельный размер, отступ или
 * коллизию — всегда измеряй реальный живой DOM (getBoundingClientRect) перед тем
 * как предлагать или заявлять число расположения".
 *
 * Сузил область намеренно, чтобы не шуметь: реагирует ТОЛЬКО когда правка меняет
 * ЧИСЛОВОЕ значение позиционирующего CSS-свойства (margin/padding/top/left/right/
 * bottom/width/height/inset/gap) на ДРУГОЕ число для того же свойства — не на
 * любую правку файла. Не проверяет "точно ли это число измерено" (это семантика,
 * не выразить кодом) — проверяет более грубый, но честный прокси: был ли ВООБЩЕ
 * недавно вызов, который измеряет живой DOM (javascript_tool с getBoundingClientRect).
 *
 * PreToolUse-хук на Edit/Write. Не блокирует — предупреждает (allow + systemMessage
 * через контекст, тот же стиль ненавязчивости, что у shared-constant-guard.mjs).
 *
 * Режим: GEOMETRY_MEASURE_GUARD_MODE=off отключает.
 */
import fs from 'node:fs';

const WINDOW_MIN = 20;

const POS_PROP = String.raw`(?:margin(?:-(?:top|bottom|left|right))?|padding(?:-(?:top|bottom|left|right))?|top|left|right|bottom|width|height|inset|gap)`;
const NUM = String.raw`-?\d+(?:\.\d+)?(?:px|rem|em|%)`;
const PROP_NUM_RE = new RegExp(String.raw`\b(${POS_PROP})\s*:\s*(${NUM})`, 'gi');

function extractPropNumbers(text) {
  const map = new Map(); // prop -> Set(numbers)
  if (!text) return map;
  const re = new RegExp(PROP_NUM_RE.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const prop = m[1].toLowerCase();
    const num = m[2].toLowerCase();
    if (!map.has(prop)) map.set(prop, new Set());
    map.get(prop).add(num);
  }
  return map;
}

function findChangedGeometry(oldText, newText) {
  const before = extractPropNumbers(oldText);
  const after = extractPropNumbers(newText);
  const changed = [];
  for (const [prop, nums] of before) {
    const afterNums = after.get(prop);
    if (!afterNums) continue; // свойство исчезло — не про новое число
    // если набор чисел для этого свойства реально изменился (не то же самое число)
    const same = nums.size === afterNums.size && [...nums].every((n) => afterNums.has(n));
    if (!same) changed.push(prop);
  }
  return changed;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function hasRecentMeasurement(transcriptPath, windowMin) {
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
      if (Number.isFinite(ts) && nowMs - ts > windowMs) break;
    }
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b && b.type === 'tool_use') {
        const name = String(b.name || '');
        const input = b.input || {};
        const inputText = JSON.stringify(input);
        if (/javascript_tool/i.test(name) && /getBoundingClientRect/.test(inputText)) return true;
        if (/read_page/i.test(name)) return true; // read_page тоже даёт реальные координаты элементов
      }
    }
  }
  return false;
}

function main() {
  const mode = (process.env.GEOMETRY_MEASURE_GUARD_MODE || 'warn').toLowerCase();
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

  const toolInput = hookData.tool_input || {};
  const pairs = [];
  if (typeof toolInput.old_string === 'string') pairs.push([toolInput.old_string, toolInput.new_string]);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (e && typeof e.old_string === 'string') pairs.push([e.old_string, e.new_string]);
    }
  }
  if (typeof toolInput.content === 'string' && !pairs.length) {
    // Write целиком — нет "before", сравнивать не с чем однозначно; пропускаем,
    // это не про точечную правку числа, а про запись всего файла.
  }

  let changedProps = [];
  for (const [oldS, newS] of pairs) {
    changedProps.push(...findChangedGeometry(oldS, newS));
  }
  changedProps = [...new Set(changedProps)];

  if (!changedProps.length) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const transcriptPath = hookData.transcript_path;
  if (hasRecentMeasurement(transcriptPath, WINDOW_MIN)) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const msg =
    `⚠️  geometry-measure-guard — меняется число позиционирования (${changedProps.join(', ')})\n` +
    `без живого измерения (getBoundingClientRect/read_page) за последние ${WINDOW_MIN} мин.\n` +
    `feedback_izmeryat_ne_gadat_geometriya: никогда не гадать пиксельный отступ — измерить\n` +
    `реальный живой DOM перед тем как заявлять число. Если число уже было измерено раньше\n` +
    `в этом разговоре (не в окне) — это ложное срабатывание, можно игнорировать.\n\n` +
    `Отключить на раз: GEOMETRY_MEASURE_GUARD_MODE=off`;

  process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n');
}

try {
  main();
} catch {
  process.stdout.write('{"continue": true, "suppressOutput": true}\n');
}
