#!/usr/bin/env node
/*
 * deploy-readback-guard.mjs — 30.09.2026. Stop-хук: в этом ходу была выкладка серверной функции
 * (deploy_edge_function), а прочитать её обратно (get_edge_function) для сверки — нет.
 *
 * Зачем: правило «после каждого деплоя читать функцию обратно и сверять» записано в CLAUDE.md
 * и в скилле deploy-edge, но нарушалось (4 случая по разбору правил 30.09; 27.08 — заглушка
 * вместо кода, 18.09 — Мастерская лежала ~3 минуты). Текст не помог — нужна проверка кодом.
 *
 * Что ловит: для каждой функции (поле name у deploy, поле function_slug у get) — последняя
 * выкладка в ходе должна быть ПОСЛЕ которой есть чтение той же функции. Что НЕ ловит: что
 * содержимое сверено с файлом и что сделан живой запрос — это остаётся на скилле deploy-edge.
 *
 * Режимы (DEPLOY_READBACK_ENFORCE_MODE): block (по умолчанию) | warn | off.
 * Структура — по образцу ask-then-act-guard.mjs (тот же Stop-хук, тот же формат ответа).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
let collectCurrentTurnBlocks;
{
  ({ collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(here, 'lib', 'current-turn-blocks.mjs')).href));
}
let recordSignal = () => {};
try {
  ({ recordSignal } = await import(pathToFileURL(path.join(here, 'lib', 'signal-trail.mjs')).href));
} catch { /* общий след недоступен — хук работает без него */ }

const DEPLOY_RE = /deploy_edge_function$/;
const READ_RE = /get_edge_function$/;

/** Функции, выложенные в этом ходу и не прочитанные обратно после последней выкладки. */
function unverifiedDeploys(blocks) {
  const pending = new Set();
  for (const b of blocks) {
    if (!b || b.type !== 'tool_use') continue;
    const name = String(b.name || '');
    const input = b.input || {};
    if (DEPLOY_RE.test(name)) pending.add(String(input.name || '(имя не указано)'));
    else if (READ_RE.test(name)) pending.delete(String(input.function_slug || ''));
  }
  return [...pending];
}

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const emitOk = () => emit({ continue: true, suppressOutput: true });

function main() {
  const mode = (process.env.DEPLOY_READBACK_ENFORCE_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();

  let hookData = {};
  try { hookData = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk();
  if (!hookData.transcript_path) emitOk();

  const pending = unverifiedDeploys(collectCurrentTurnBlocks(hookData.transcript_path));
  if (!pending.length) emitOk();

  const reason =
    `⚠️  deploy-readback — в этом ходу выложена серверная функция, но не прочитана обратно: ${pending.join(', ')}.\n\n` +
    `Статус «успешно» от деплоя не доказывает, что на сервере лежит то, что ты отправил (27.08: заглушка вместо кода).\n` +
    `Перед завершением хода:\n` +
    `  1. get_edge_function (function_slug = имя функции) и сравни с локальным файлом программно (sha256), не глазами.\n` +
    `  2. Один безобидный живой запрос (для cosmogram-sync — {"action":"public_config"}), убедись, что пришёл настоящий ответ.\n` +
    `  3. Запиши: node .claude/hooks/log-claim.mjs "что утверждаю" "как проверил".\n` +
    `Порядок — в скилле deploy-edge, раздел 4.\n\n` +
    `Отключить на раз: DEPLOY_READBACK_ENFORCE_MODE=off`;

  try { recordSignal('deploy-readback', mode === 'block' ? 4 : 3, pending.join(',')); } catch { /* след необязателен */ }
  if (mode === 'warn') emit({ continue: true, systemMessage: reason });
  emit({ decision: 'block', reason });
}

try { main(); } catch { emitOk(); }
