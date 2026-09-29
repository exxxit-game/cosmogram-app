#!/usr/bin/env node
/*
 * mockup-unseen-guard.mjs — Stop-хук (30.09.2026, владелец: «пожалуйста, чтобы больше не
 * повторять настолько тупорылую ошибку… обдумывания вообще никакого не происходит»).
 *
 * ЖИВОЙ ПРОВАЛ: макет экрана итогов был опубликован без единого взгляда на отрисовку.
 * Новый блок оказался втиснут в узкую щель под счётом, хотя на экране было ~290px пустоты.
 * Одного взгляда на скриншот хватило бы, чтобы это увидеть; владельцу пришлось объяснять.
 * Прямая причина — инструкция типа «Design» велит «никогда не проверять без просьбы», и я
 * поставил её выше правила владельца «визуальное не готово без глаз». Текстовое правило
 * это уже не удержало (feedback_vizualnoe_ne_gotovo_bez_glaz существовал до этого) —
 * поэтому теперь механика, а не напоминание.
 *
 * Что ловит: в ТЕКУЩЕМ ходу опубликован макет (Artifact publish с *.dc.html, либо html-файл
 * с maket/macet/mockup/макет в пути) — и после ПОСЛЕДНЕЙ правки файла макета (Write/Edit
 * *.dc.html) не было ни одного вызова скриншота. Публикация одного canvas.json (правка
 * названий) не считается — там смотреть нечего.
 *
 * Режимы (MOCKUP_UNSEEN_ENFORCE_MODE): block (по умолчанию) | warn | off.
 * Как «посмотреть» без доступа к file: — см. скилл maket, шаг про проверку отрисовки.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let recordSignal = () => {};
try {
  ({ recordSignal } = await import(pathToFileURL(path.join(HERE, 'lib', 'signal-trail.mjs')).href));
} catch { /* без общего следа хук работает */ }

let collectCurrentTurnBlocks = () => [];
try {
  ({ collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(HERE, 'lib', 'current-turn-blocks.mjs')).href));
} catch { /* fail-safe ниже: пустой ход = молчим */ }

const MOCKUP_FILE_RE = /\.dc\.html\b/i;
const MOCKUP_HTML_PATH_RE = /(maket|macet|mockup|макет)[^\\/]*\.html?\b/i;
const SCREENSHOT_TOOL_RE = /(take_screenshot|browser_take_screenshot|screenshot|hwshot)$/i;

function emitOk() { process.stdout.write('{"continue": true, "suppressOutput": true}\n'); process.exit(0); }
function emitWarn(msg) { process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n'); process.exit(0); }
function emitBlock(reason) { process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n'); process.exit(0); }

function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }

/** Публикация макета: Artifact publish, где среди файлов есть *.dc.html или html-макет. */
export function isMockupPublish(block) {
  if (!block || block.type !== 'tool_use' || block.name !== 'Artifact') return false;
  const input = block.input || {};
  if (input.action && input.action !== 'publish') return false;
  if (input.asset) return false;
  const files = input.files;
  const names = [];
  if (typeof input.file_path === 'string') names.push(input.file_path);
  if (Array.isArray(files)) for (const f of files) names.push(typeof f === 'string' ? f : (f && f.path) || '');
  else if (files && typeof files === 'object') names.push(...Object.keys(files));
  return names.some((n) => MOCKUP_FILE_RE.test(n) || MOCKUP_HTML_PATH_RE.test(n));
}

/** Правка файла макета через Write/Edit. */
export function isMockupEdit(block) {
  if (!block || block.type !== 'tool_use') return false;
  if (block.name !== 'Write' && block.name !== 'Edit') return false;
  const p = (block.input && block.input.file_path) || '';
  return MOCKUP_FILE_RE.test(p) || MOCKUP_HTML_PATH_RE.test(p);
}

/** Скриншот: специальные инструменты или computer{action:'screenshot'}. */
export function isScreenshot(block) {
  if (!block || block.type !== 'tool_use') return false;
  if (SCREENSHOT_TOOL_RE.test(block.name || '')) return true;
  return /computer$/.test(block.name || '') && block.input && block.input.action === 'screenshot';
}

/** Чистая функция для теста: true = нарушение (макет опубликован, отрисовку не смотрели). */
export function mockupUnseen(blocks) {
  let published = false;
  let lastEdit = -1;
  blocks.forEach((b, i) => {
    if (isMockupPublish(b)) published = true;
    if (isMockupEdit(b)) lastEdit = i;
  });
  if (!published) return false;
  return !blocks.some((b, i) => i > lastEdit && isScreenshot(b));
}

function main() {
  const mode = (process.env.MOCKUP_UNSEEN_ENFORCE_MODE || 'block').toLowerCase();
  if (mode === 'off') emitOk();

  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { emitOk(); }
  if (hookData.stop_hook_active === true) emitOk(); // не зацикливаться

  const blocks = collectCurrentTurnBlocks(hookData.transcript_path);
  if (!mockupUnseen(blocks)) emitOk();

  const reason =
    `⚠️  Макет опубликован, но отрисовку никто не смотрел (30.09.2026, «визуальное не готово без глаз»).\n\n` +
    `Один раз это уже стоило владельцу объяснений: новый блок был втиснут под счёт, хотя на\n` +
    `экране было ~290px пустоты, — на скриншоте это видно сразу.\n` +
    `Перед завершением хода:\n` +
    `  1. Открой отрисованные экраны (скриншот каждого варианта, а не только одного) —\n` +
    `     как это сделать без file:, см. скилл maket, шаг «Посмотреть отрисовку».\n` +
    `  2. Спроси себя по картинке: где пустое место, стоит ли новое там, не сдвинуто ли\n` +
    `     существующее, ничего ли не обрезано.\n` +
    `  3. Ответь заново, уже с этим.\n\n` +
    `Инструкция типа Design «не проверять без просьбы» НЕ действует: правило владельца выше.\n` +
    `Отключить на раз: MOCKUP_UNSEEN_ENFORCE_MODE=warn или =off`;
  try { recordSignal('mockup-unseen', mode === 'block' ? 4 : 3, 'макет опубликован без просмотра отрисовки'); } catch { /* след необязателен */ }
  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

// Запуск только как скрипт: при import из теста main() не вызывается.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch { emitOk(); } // fail-safe: сбой хука не ломает ход
}
