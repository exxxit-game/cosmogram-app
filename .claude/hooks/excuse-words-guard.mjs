#!/usr/bin/env node
/*
 * excuse-words-guard.mjs — 26.09.2026, из аудита журнала правил (кластер #13,
 * ~5 отдельных инцидентов: feedback_nikogda_ne_opravdyvatsya_slovami_24_09,
 * feedback_ne_nazyvat_oshibku_zabyl). Оба правила уже ABSOLUTE в памяти —
 * этот хук их МЕХАНИЗИРУЕТ, а не изобретает заново.
 *
 * Ловит смягчающие слова о СВОЕЙ же ошибке («случайно», «неосторожность»,
 * «не заметил», «забыл» и т.п.) — Стюарт Чейз, «Tyranny of Words»: у меня нет
 * человеческой памяти, которая могла бы «забыть», только шаг, которого не
 * было — смягчающее слово выдаёт вывод за факт.
 *
 * Структура — по образцу claim-check-hook.mjs (тот же Stop-хук, тот же
 * формат ответа, тот же fail-safe, та же цитатная экспозиция).
 *
 * Режимы (EXCUSE_WORDS_ENFORCE_MODE): warn (по умолчанию) | block | off.
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

// Узкий список — по образцу claim-check: лучше пропустить редкий случай, чем
// шуметь на обычной прозе. \b не годится для кириллицы в JS-regex (основан на
// \w) — границы через (?:^|\s|["«]) / (?=[\s.,!?:;—-]|$), тот же приём.
const EXCUSE_PATTERNS = [
  new RegExp(String.raw`(?:^|\s|["«])(?:случайно|неосторожно|небрежно)(?=[\s.,!:;—-]|$)`, 'i'),
  new RegExp(String.raw`(?:^|\s|["«])(?:неосторожность|небрежность|невнимательность)(?=[\s.,!:;—-]|$)`, 'i'),
  new RegExp(String.raw`(?:^|\s|["«])не\s+(?:заметил|приметил|уследил|доглядел|учёл)(?=[\s.,!:;—-]|$)`, 'i'),
  new RegExp(String.raw`(?:^|\s|["«])по\s+невнимательности(?=[\s.,!:;—-]|$)`, 'i'),
  new RegExp(String.raw`(?:^|\s|["«])я\s+забыл(?=[\s.,!:;—-]|$)`, 'i'),
];

const EXEMPT_CONTEXT = [
  // цитирование чужих слов — «случайно» в кавычках соседа не моя формулировка.
  // \b не годится для кириллицы в JS (основан на \w) — та же ловушка, что уже
  // задокументирована в claim-check-hook.mjs; границы через явные классы символов.
  /[«"][^«»"]{0,80}(?:случайно|небрежно|неосторожно|забыл)(?=[^«»"]{0,80}[»"])/i,
  // обсуждение самого правила/термина, не признание собственной ошибки
  /(?:правило|термин|слово|запрет|ABSOLUTE|не\s+говорить)[^\n.!?]{0,40}$/i,
  // 26.09.2026, feedback_test_kejs_sam_pro_sebya_26_09 — описываю САМ ХУК в прозе
  // без кавычек (например, в отчёте о работе этого вечера) ложно срабатывало:
  // «слово» должно быть РЯДОМ с match, не обязательно в последних 40 символах
  // окна. Отдельная, более широкая проверка: обсуждение хука/примера ГДЕ-ТО в
  // окрестности матча (±80 символов уже вырезаны в ctx), не только в конце.
  /(?:ловит|хук|guard\.mjs|например|вроде\s+фраз|описыва\S*|тест-кейс|паттерн)/i,
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

function findExcuses(text) {
  const found = [];
  for (const pat of EXCUSE_PATTERNS) {
    const re = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const mStart = m.index, mEnd = m.index + m[0].length;
      const ctx = text.slice(Math.max(0, mStart - 80), Math.min(text.length, mEnd + 80));
      if (EXEMPT_CONTEXT.some((ex) => ex.test(ctx))) continue;
      found.push(m[0].trim());
      if (found.length >= 5) return found;
    }
  }
  return found;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const mode = (process.env.EXCUSE_WORDS_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
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

  const message = readLastAssistantMessage(transcriptPath);
  if (!message) emitOk();

  const excuses = findExcuses(message);
  if (!excuses.length) emitOk();

  const bullets = excuses.map((p) => `  - "${p}"`).join('\n');
  const reason =
    `⚠️  excuse-words — смягчающее слово о собственной ошибке вместо точного действия.\n` +
    `Совпадения:\n${bullets}\n\n` +
    `У меня нет человеческой памяти, которая «забывает» — только шаг, которого не было.\n` +
    `Назвать точное действие вместо смягчения (не «случайно»/«не заметил», а что именно\n` +
    `сделал или не сделал).\n\n` +
    `Отключить на раз: EXCUSE_WORDS_ENFORCE_MODE=off`;

  try { recordSignal('excuse-words', mode === 'block' ? 3 : 2, excuses[0] || 'excuse word'); } catch { /* см. импорт выше */ }

  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

try {
  main();
} catch {
  emitOk();
}
