#!/usr/bin/env node
/*
 * tool-usage-read-guard.mjs — 30.09.2026. PreToolUse-хук на Bash: команда запускает инструмент проекта
 * (node tools/ИМЯ.mjs), а файл этого инструмента в текущей сессии ни разу не открывали — запуск блокируется.
 *
 * Зачем: в шапке каждого инструмента написано, какие аргументы и в каком порядке. 30.09 команда
 * `live-device.mjs eval` была запущена трижды с серийником телефона на месте id страницы (порядок стоял в
 * шапке файла, я прочитал его только после третьей ошибки), и владелец, назвав это, сказал: «сначала
 * сделаешь, а потом обдумаешь» (18.09). Знания лежали рядом, но ничто не отправляло к ним в момент действия.
 * Хук ставит этот шаг в момент действия.
 *
 * Как узнаёт, что файл открывали: не читает журнал сессии (он вырастает до гигабайта и целиком не читается —
 * первая версия хука из-за этого молча пропускала всё). Смотрит в маленький файл сессии
 * .claude/state/tools-read-<id сессии>.txt, который ведёт PostToolUse-хук tool-read-log.mjs (Read, Grep, и Bash с
 * cat/head/tail/sed/less/more/awk/grep/rg по файлу инструмента). Чтение в той же команде перед запуском
 * (`head -60 tools/x.mjs && node tools/x.mjs`) тоже считается.
 * Не блокирует: запуск с --help или -h; команды, которые не запускают tools/*.mjs; хуки из .claude/hooks.
 * Не проверяет: что справка прочитана внимательно и аргументы поняты верно — только факт открытия файла.
 * Ограничение: чтения, сделанные до подключения записи, не видны — первый запуск каждого инструмента в старой
 * сессии потребует одного открытия файла.
 *
 * Режимы (TOOL_USAGE_READ_MODE): block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { norm, readNames, stateFile } = await import(pathToFileURL(path.join(here, 'lib', 'tool-read-names.mjs')).href);
let recordSignal = () => {};
try {
  ({ recordSignal } = await import(pathToFileURL(path.join(here, 'lib', 'signal-trail.mjs')).href));
} catch { /* общий след недоступен — хук работает без него */ }

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const ok = () => out({ continue: true, suppressOutput: true });

// node [--флаги] [кавычка] [любой/путь/]tools/ИМЯ.mjs
const RUN_RE = /\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*["']?(?:\S*\/)?tools\/([\w.-]+\.mjs)\b/g;

function toolsRun(command) {
  const names = new Set();
  let m;
  RUN_RE.lastIndex = 0;
  while ((m = RUN_RE.exec(command))) names.add(m[1]);
  return [...names];
}

function main() {
  const mode = (process.env.TOOL_USAGE_READ_MODE || 'block').toLowerCase();
  if (mode === 'off') ok();

  let d = {};
  try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { ok(); }
  if (String(d.tool_name || '') !== 'Bash') ok();

  const command = norm((d.tool_input || {}).command);
  const names = toolsRun(command);
  if (!names.length) ok();
  if (/\s(--help|-h)(\s|$)/.test(command)) ok();

  const opened = new Set(readNames('Bash', { command }));
  try {
    const file = stateFile(here, d.session_id);
    if (fs.existsSync(file)) for (const n of fs.readFileSync(file, 'utf8').split('\n')) if (n) opened.add(n);
  } catch { /* нет записи — считаем, что ничего не открывали */ }

  const unread = names.filter((n) => !opened.has(n));
  if (!unread.length) ok();

  const list = unread.map((n) => 'tools/' + n).join(', ');
  const reason =
    `Ты запускаешь ${list}, но в этой сессии не открывал ${unread.length > 1 ? 'эти файлы' : 'этот файл'}.\n` +
    `В шапке каждого инструмента написано, какие аргументы и в каком порядке. 30.09 команда live-device.mjs eval была запущена три раза с серийником телефона вместо id страницы: порядок стоял в шапке файла.\n` +
    `Сначала прочитай начало файла (Read tools/${unread[0]}, первые 70 строк), потом запусти. Не угадывай порядок аргументов.\n` +
    `Отключить на раз: TOOL_USAGE_READ_MODE=off`;

  try { recordSignal('tool-usage-read', mode === 'block' ? 4 : 3, 'запуск без чтения: ' + list); } catch { /* след необязателен */ }
  if (mode === 'warn') out({ continue: true, systemMessage: reason });
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

try { main(); } catch { ok(); }
