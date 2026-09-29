// current-turn-blocks.mjs — 30.09.2026, по требованию владельца («где может объединиться»).
// isGenuineUserEntry/isToolResultUserEntry были побайтово одинаковы в ask-then-act-guard.mjs
// и evidence-anchoring-guard.mjs — не похожи, а буквально идентичны, скопированы. Собирает
// content-блоки ТЕКУЩЕГО хода (всё после последнего НАСТОЯЩЕГО user-сообщения — tool_result
// не считается, это ответ на мой же вызов инструмента внутри того же хода), тот же приём,
// что уже независимо изобретён в двух местах.
import fs from 'node:fs';
import { readTail } from './read-transcript-tail.mjs';

/** tool_result — ответ на мой же вызов инструмента, не настоящая реплика владельца. */
export function isToolResultUserEntry(entry) {
  if (entry.type !== 'user') return false;
  const content = entry.message && entry.message.content;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b && b.type === 'tool_result');
}

/** Настоящая пользовательская реплика (начало хода), не tool_result. */
export function isGenuineUserEntry(entry) {
  if (entry.type !== 'user') return false;
  return !isToolResultUserEntry(entry);
}

/**
 * Content-блоки всех assistant-сообщений текущего хода, с конца транскрипта назад,
 * до первого настоящего пользовательского сообщения (границы хода).
 * @param {string} transcriptPath
 * @returns {Array<object>}
 */
export function collectCurrentTurnBlocks(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return [];
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return [];
  }
  const collected = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (isGenuineUserEntry(entry)) break; // граница хода — дальше не наш ход
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) collected.unshift(content[j]);
  }
  return collected;
}

/**
 * Последнее НАСТОЯЩЕЕ user-сообщение (не tool_result) и content-блоки хода ПОСЛЕ него —
 * тот же обход, что и в evidence-anchoring-guard.mjs (нужен и сам граничный user-entry,
 * не только блоки хода — например, чтобы посмотреть, было ли в нём изображение).
 * @param {string} transcriptPath
 * @returns {{lastGenuineUserEntry: object|null, currentTurnBlocks: Array<object>}}
 */
export function collectCurrentTurnWithBoundary(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { lastGenuineUserEntry: null, currentTurnBlocks: [] };
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return { lastGenuineUserEntry: null, currentTurnBlocks: [] };
  }
  const currentTurnBlocks = [];
  let lastGenuineUserEntry = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (isGenuineUserEntry(entry)) { lastGenuineUserEntry = entry; break; }
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) currentTurnBlocks.unshift(content[j]);
  }
  return { lastGenuineUserEntry, currentTurnBlocks };
}
