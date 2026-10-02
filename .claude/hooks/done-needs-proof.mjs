#!/usr/bin/env node
/*
 * done-needs-proof.mjs — 02.10.2026, по слову владельца («работай» после итога исследования). Stop-хук: ответ с «готово / проверено / исправлено»
 * после правки файлов, когда после последней правки в этом ходу не было ни одной проверки (Bash, Read, Grep, снимок экрана и др.) — один раз
 * не даёт закончить ход. Проверка идёт по журналу действий хода, а не по оценке текста (измерено: простые проверки по журналу ловят ложный
 * успех лучше, чем модель-судья по тексту, arXiv 2606.09863). Законный выход оставлен: если в ответе есть «не проверено», «не проверял»
 * или «не знаю», хук пропускает (замер: лазейка «не могу» снижает жульничество с 23,6% до 5,3%, arXiv 2608.29460).
 * Не зацикливается: stop_hook_active пропускает. Режим: DONE_PROOF_MODE = block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODE = (process.env.DONE_PROOF_MODE || 'block').toLowerCase();
const EDIT = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
const CHECK = (n) => n === 'Bash' || n === 'Read' || n === 'Grep' || n === 'Glob' || /^mcp__.*(browser|screenshot|preview|execute_sql|get_edge_function|list_)/i.test(n);
const CLAIM = /(^|[\s«"'(*_>-])(готов[оа]|проверен[оа]|исправлен[оа]|починен[оа]|починил[аи]?|исправил[аи]?|сделан[оа]|работает|внесен[оа]|внесён[оа]|всё в порядке|подтверждаю)(?=$|[\s.,;:!?»"')*_<-])/gi;
const HONEST = /(не\s+проверен[оа]|не\s+проверял|не\s+знаю|не\s+могу\s+проверить)/i;

export function judge(blocks) {
  let lastEdit = -1;
  blocks.forEach((b, i) => { if (b && b.type === 'tool_use' && EDIT.has(b.name)) lastEdit = i; });
  if (lastEdit < 0) return null;
  const checked = blocks.slice(lastEdit + 1).some((b) => b && b.type === 'tool_use' && CHECK(String(b.name || '')));
  if (checked) return null;
  // итоговый текст: подряд идущие text-блоки в конце хода
  const tail = [];
  for (let i = blocks.length - 1; i >= 0; i--) { if (blocks[i] && blocks[i].type === 'text') tail.unshift(String(blocks[i].text || '')); else break; }
  const text = tail.join('\n');
  if (!text || HONEST.test(text)) return null;
  let m, hit = null;
  CLAIM.lastIndex = 0;
  while ((m = CLAIM.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 14), m.index + (m[1] ? m[1].length : 0));
    if (/(^|\s)не\s*$/i.test(before) || /(ещё|еще)\s+не\s*$/i.test(before)) continue; // «не готово», «ещё не проверено»
    hit = m[2]; break;
  }
  return hit;
}

async function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
  if (MODE === 'off' || input.stop_hook_active) process.exit(0);
  const { collectCurrentTurnBlocks } = await import(pathToFileURL(path.join(HERE, 'lib', 'current-turn-blocks.mjs')).href);
  const hit = judge(collectCurrentTurnBlocks(input.transcript_path || ''));
  if (!hit) process.exit(0);
  const reason = 'ХУК done-needs-proof. В этом ходу ты менял файлы, а после последней правки не запускал ни одной проверки (команда, чтение результата, снимок экрана), и при этом пишешь «' + hit + '». ' +
    'Либо запусти проверку и покажи, что запускал и что увидел, либо перепиши ответ: «не проверено» и что именно не проверено. «Не проверено» и «не знаю» это правильные ответы, не провал.';
  if (MODE === 'warn') { process.stderr.write(reason + '\n'); process.exit(0); }
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
if (process.argv[1] && process.argv[1].endsWith('done-needs-proof.mjs')) await main();
