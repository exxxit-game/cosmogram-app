#!/usr/bin/env node
/*
 * tool-read-log.mjs — 30.09.2026. PostToolUse-хук на Read|Grep|Bash: если вызов открыл для чтения файл
 * инструмента проекта (tools/ИМЯ.mjs), имя дописывается в маленький файл сессии
 * .claude/state/tools-read-<id сессии>.txt. Ничего не блокирует и ничего не печатает.
 * По этому файлу tool-usage-read-guard.mjs решает, запускать ли инструмент. Почему не по журналу сессии —
 * см. шапку lib/tool-read-names.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { readNames, stateFile, stateDir } = await import(pathToFileURL(path.join(here, 'lib', 'tool-read-names.mjs')).href);

try {
  const d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const names = readNames(d.tool_name, d.tool_input);
  if (names.length) {
    fs.mkdirSync(stateDir(here), { recursive: true });
    const file = stateFile(here, d.session_id);
    const have = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : []);
    const fresh = names.filter((n) => !have.has(n));
    if (fresh.length) fs.appendFileSync(file, fresh.join('\n') + '\n', 'utf8');
  }
} catch { /* запись необязательна: хук молча выходит */ }
process.exit(0);
