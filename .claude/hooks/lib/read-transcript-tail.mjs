// read-transcript-tail.mjs — 29.09.2026, по требованию владельца («почини себя везде»).
// Транскрипты с картинками (base64) легко переваливают за лимит V8-строки (~512МБ) —
// readFileSync на весь файл падает с ERR_STRING_TOO_LONG. Подтверждено на реальной сессии
// (транскрипт >512МБ). Найден и починен 27.09 в двух хуках порознь (ask-then-act-guard,
// evidence-anchoring-guard) — каждый со своей копией функции; 29.09 выяснилось, что ТОТ ЖЕ
// баг остался ещё в четырёх (claim-check-hook, device-claim-guard, excuse-words-guard,
// geometry-measure-guard), потому что фикс не был вынесен в общее место. Один модуль вместо
// шести копий — следующий такой же баг физически некуда будет забыть починить в одном месте.
//
// try/catch вокруг readFileSync на весь файл ЭТУ ошибку не ловит правильно — она ловится, но
// молча превращается в «нарушений нет», хотя файл просто не прочитался. Хуки были нерабочими
// весь вечер именно тогда, когда длинная сессия нужнее всего.
import fs from 'node:fs';

const DEFAULT_TAIL_BYTES = 24 * 1024 * 1024;

/**
 * Читает только хвост файла (по умолчанию последние 24МБ) — этого достаточно, чтобы найти
 * последнее настоящее user-сообщение и весь текущий ход, не читая файл целиком.
 * @param {string} filePath
 * @param {number} [tailBytes]
 * @returns {string}
 */
export function readTail(filePath, tailBytes = DEFAULT_TAIL_BYTES) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - tailBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    const text = buf.toString('utf8');
    if (start === 0) return text; // прочитан весь файл — первая строка цела, не обрубать
    // хвост из середины файла — первая строка почти наверняка обрублена посередине,
    // отбрасываем её, остальные строки парсим как обычно.
    const nl = text.indexOf('\n');
    return nl === -1 ? '' : text.slice(nl + 1);
  } finally {
    fs.closeSync(fd);
  }
}
