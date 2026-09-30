#!/usr/bin/env node
/* feedback-needs-mechanism-guard.mjs — 30.09.2026. Владелец, зло: «если ты будешь просто это записывать,
   нахуй ты вообще такой нужен» (порог «3-5 повторов» отменён — теперь механизм с первой записи).

   Что делает: PostToolUse на Write. Если записан НОВЫЙ файл памяти memory/feedback_*.md и в нём нет
   строки «Механизм:» (жирной **Механизм:** или в начале строки) — exit 2: запись правила считается
   недоделанной. В строке надо назвать, ЧТО исполняет это правило автоматически (какой хук/страж/код
   и где), либо честно написать, почему механизм невозможен («Механизм: нет — потому что …»).
   Голая запись в память без строки «Механизм:» больше не проходит тихо.
   Не проверяет: правды строки (можно написать что угодно) — но пустое «просто записал» исчезает,
   а явное «нет — потому что» видно владельцу. Режим: FEEDBACK_MECHANISM_MODE=block (по умолчанию)|warn|off. */
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const MODE = (process.env.FEEDBACK_MECHANISM_MODE || 'block').toLowerCase();
function main() {
  if (MODE === 'off') return 0;
  let d; try { d = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  if (d.tool_name && d.tool_name !== 'Write') return 0;
  const file = String((d.tool_input && d.tool_input.file_path) || '').replace(/\\/g, '/');
  if (!/\/memory\/feedback_[^/]+\.md$/.test(file) || !existsSync(file)) return 0;
  const text = readFileSync(file, 'utf8');
  if (/^[ \t]*(\*\*)?Механизм:(\*\*)?[ \t]*[^\s*]/m.test(text)) return 0;
  console.error(
    `❌ feedback-needs-mechanism-guard: записано правило ${basename(file)}, но в нём нет строки «Механизм:».\n` +
    `  Записать правило в память — половина работы (владелец, 30.09.2026: «если просто записывать — нахуй ты нужен»).\n` +
    `  Добавь в файл строку:  **Механизм:** <какой хук/страж/код и где исполняет это автоматически>\n` +
    `  либо честно:  **Механизм:** нет — потому что <причина>  (и владелец это увидит).\n` +
    `  Если механизма ещё нет — построй его в ЭТОМ ЖЕ ходу (порог теперь 1 запись, не 3-5).\n` +
    `  Отключить на раз: FEEDBACK_MECHANISM_MODE=warn или =off`);
  return MODE === 'warn' ? 0 : 2;
}
let code = 0;
try { code = main(); } catch { code = 0; }
process.exit(code);
