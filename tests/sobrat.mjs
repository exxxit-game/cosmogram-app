/* Сборщик двух архивов. Решение владельца от 14.08.2026 (вопрос 6, вариант А):
   наружу — только игра, остальное остаётся у экипажа. Списком правит tests/relizy.mjs,
   его же стережёт страж 137. Запуск: node tests/sobrat.mjs <версия> */
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitTree } from './relizy.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v = process.argv[2];
if(!v){ console.error('Укажи версию: node tests/sobrat.mjs 1.284.9'); process.exit(2); }
const OUT = process.argv[3] || '/home/claude/dok';
/* -z обязателен: без него git отдаёт имена с не-ASCII символами В КАВЫЧКАХ и восьмеричными
   последовательностями (core.quotepath). Такого файла на диске нет, и всякий, кто читает
   этот список, тихо теряет русские имена. Именно так пропали семь документов. */
const files = execSync('git ls-files -z',{cwd:ROOT}).toString().split('\0').filter(Boolean);
const { igra, ekipazh, spornye } = splitTree(files);
if(spornye.length){ console.error('Список противоречив:\n  '+spornye.join('\n  ')); process.exit(3); }
/* Первая редакция кормила zip списком через stdin (`-@`) и молча теряла все файлы
   с кириллицей в имени: выбрано 33, в архив легло 26. Семь документов исчезли без
   единого слова — ровно тот класс, против которого у нас закон «никаких молчаливых
   усечений». Теперь имена уходят аргументами (без оболочки, без перекодировки),
   имена внутри архива принудительно в UTF-8, а в конце сборщик ПЕРЕСЧИТЫВАЕТ то,
   что реально легло, и падает, если сошлось не всё. Архив, собранный не полностью,
   опаснее отсутствующего: его заливают, ничего не заметив. */
function zip(name, list){
  const out = path.join(OUT, name);
  try{ fs.unlinkSync(out); }catch(e){}
  execFileSync('zip', ['-q','-X','-UN=UTF8', out, ...list], { cwd: ROOT });
  const vnutri = execFileSync('unzip', ['-Z1', out], { encoding:'utf8' })
    .split('\n').filter(Boolean).filter(x=>!x.endsWith('/'));
  if(vnutri.length !== list.length){
    const net = list.filter(f => !vnutri.includes(f));
    console.error(`\n❌ ${name}: выбрано ${list.length}, в архив легло ${vnutri.length}.`);
    console.error('   Не попали: ' + (net.join(' · ') || '(имена разошлись при упаковке)'));
    process.exit(4);
  }
  const kb = (fs.statSync(out).size/1024).toFixed(0);
  console.log(`  ${name} — ${vnutri.length} файлов, ${kb} КБ (сверено пофайлово)`);
}
console.log(`Космограмма ${v}: разделяю ${files.length} файлов`);
zip(`cosmogram_${v}_igra.zip`, igra);
zip(`cosmogram_${v}_ekipazh.zip`, ekipazh);
console.log('\nВ публичный GitHub уходит ТОЛЬКО первый архив.');
