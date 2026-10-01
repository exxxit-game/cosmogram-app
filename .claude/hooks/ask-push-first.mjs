#!/usr/bin/env node
/*
 * ask-push-first.mjs — 01.10.2026, по слову владельца: «раньше мне все вопросы приходили на телефон и не исчезали,
 * они были обязательными… сейчас такого нету. Подумай, как это вернуть».
 * Причина: окно вопроса (AskUserQuestion) всплывает в сессии на компьютере, а на телефон не доходит — владелец его не видит,
 * а я стою и жду. Выход: перед КАЖДЫМ окном-вопросом сначала пуш на телефон (инструмент PushNotification, он при подключённом
 * Remote Control уходит и на телефон) с самим вопросом, потом окно. Окно по-прежнему обязательное — не исчезает, пока не ответят.
 *
 * PreToolUse на AskUserQuestion: если в текущем ходе (после последнего настоящего сообщения владельца) не было вызова
 * PushNotification — отказ с подсказкой. Режим ASK_PUSH_MODE: block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.env.ASK_PUSH_MODE || 'block';
function readStdin() { try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; } }

if (MODE === 'off') process.exit(0);
const input = readStdin();
if (input.tool_name && input.tool_name !== 'AskUserQuestion') process.exit(0);
let pushed = false;
try {
  const { collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(HERE, 'lib', 'current-turn-blocks.mjs')).href);
  const blocks = collectCurrentTurnBlocks(input.transcript_path || '');
  pushed = blocks.some((b) => b && b.type === 'tool_use' && b.name === 'PushNotification');
} catch { process.exit(0); } // не смогли прочитать ход — не мешаем работе
if (pushed) process.exit(0);

const reason = 'Сначала пуш на телефон: вызови PushNotification (status:"proactive", одной строкой до 200 знаков — сам вопрос и что нужно решить), ' +
  'потом снова AskUserQuestion. Окно вопроса всплывает на компьютере, на телефон не доходит — владелец его не увидит, а ты будешь ждать (владелец 01.10.2026).';
if (MODE === 'warn') { process.stderr.write(reason + '\n'); process.exit(0); }
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
process.exit(0);
