#!/usr/bin/env node
/*
 * shared-constant-guard.mjs — 26.09.2026, из аудита журнала правил (кластер #9,
 * ~6 инцидентов: feedback_shared_constant_landmine, feedback_dead_code_grep_both_repos,
 * feedback_pri_sdvige_elementa_iskat_parnye, feedback_stale_uprominaniya_posle_pravki).
 * Реальный случай: AUTH_MAX_AGE_SEC одновременно значил и окно свежести подписи
 * Telegram, и срок жизни веб-сессии Discord/Google — правка одного значения
 * ради одной причины тихо ломала другую.
 *
 * PreToolUse-хук на Edit/MultiEdit: если правка меняет строку объявления
 * константы (`const NAME = ...`), считает, сколько раз NAME реально встречается
 * в файле — если больше, чем один раз (объявление + хотя бы одно применение),
 * предупреждает свериться со ВСЕМИ местами перед тем как продолжать.
 *
 * Не блокирует (permissionDecision не задаётся = allow с предупреждением в
 * контексте) — это подсказка себе самому в момент правки, не отказ.
 */
import fs from 'node:fs';

const DECL_RE = /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]{2,})\s*=/g;

function extractChangedConstants(oldString) {
  const names = new Set();
  if (!oldString) return names;
  let m;
  const re = new RegExp(DECL_RE.source, 'g');
  while ((m = re.exec(oldString)) !== null) names.add(m[1]);
  return names;
}

function countOccurrences(fileText, name) {
  const re = new RegExp(String.raw`\b${name}\b`, 'g');
  const matches = fileText.match(re);
  return matches ? matches.length : 0;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  if ((process.env.SHARED_CONSTANT_GUARD_MODE || '').toLowerCase() === 'off') {
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
  const filePath = toolInput.file_path;
  const oldStrings = [];
  if (typeof toolInput.old_string === 'string') oldStrings.push(toolInput.old_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) if (e && typeof e.old_string === 'string') oldStrings.push(e.old_string);
  }

  if (!filePath || !fs.existsSync(filePath) || oldStrings.length === 0) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const changedNames = new Set();
  for (const os of oldStrings) for (const n of extractChangedConstants(os)) changedNames.add(n);
  if (changedNames.size === 0) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  let fileText;
  try {
    fileText = fs.readFileSync(filePath, 'utf8');
  } catch {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const flagged = [];
  for (const name of changedNames) {
    const count = countOccurrences(fileText, name);
    if (count >= 3) flagged.push({ name, count }); // объявление + минимум 2 применения
  }

  if (!flagged.length) {
    process.stdout.write('{"continue": true, "suppressOutput": true}\n');
    return;
  }

  const bullets = flagged.map((f) => `  - ${f.name}: встречается ${f.count} раз(а) в этом файле`).join('\n');
  const msg =
    `⚠️  shared-constant-guard — меняется значение константы, у которой несколько\n` +
    `применений в файле:\n${bullets}\n\n` +
    `Перед тем как продолжать: grep по всему файлу (и по cosmogram-crew, если правка\n` +
    `логики) — все ли эти применения означают ОДНО и то же, или имя случайно несёт\n` +
    `два разных смысла (см. feedback_shared_constant_landmine).`;

  process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n');
}

try {
  main();
} catch {
  process.stdout.write('{"continue": true, "suppressOutput": true}\n');
}
