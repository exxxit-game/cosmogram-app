// last-assistant-message.mjs — 30.09.2026, по требованию владельца («что может стать
// лучше, где может объединиться»). До этой правки claim-check-hook.mjs, excuse-words-guard.mjs
// и device-claim-guard.mjs каждый нёс СВОЮ копию «прочитать последнее сообщение ассистента,
// отбросить устаревшее» — три независимых реализации одной и той же логики. Именно из-за
// такого дублирования 29.09.2026 excuse-words-guard.mjs унаследовал STALE_THRESHOLD_S не
// полностью при копировании (задокументировано в его же комментарии), а 29.09.2026 device-
// claim-guard.mjs жил с реальным ложным срабатыванием (проверка близости слов), которое
// теоретически могло скрываться и в двух других копиях, просто ещё не найдено. Один модуль —
// одна точка починки; следующий баг того же класса физически некуда будет забыть починить.
import fs from 'node:fs';
import { readTail } from './read-transcript-tail.mjs';

const DEFAULT_STALE_THRESHOLD_S = 30;

/**
 * Последнее сообщение ассистента в транскрипте — текст всех text-блоков, склеенный
 * через \n. Устаревший ход (штамп времени старше staleThresholdS секунд назад — защита
 * от гонки при сбросе транскрипта на диск) отдаёт пустую строку, как и отсутствие
 * транскрипта/сообщения.
 * @param {string} transcriptPath
 * @param {number} [staleThresholdS]
 * @returns {string}
 */
export function readLastAssistantMessage(transcriptPath, staleThresholdS = DEFAULT_STALE_THRESHOLD_S) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return '';
  }
  const nowTs = Date.now() / 1000;
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
    const tsStr = entry.timestamp;
    if (tsStr) {
      const ts = new Date(tsStr).getTime() / 1000;
      if (!Number.isNaN(ts) && nowTs - ts > staleThresholdS) return ''; // устаревший ход
    }
    const content = entry.message && entry.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    }
    return '';
  }
  return '';
}
