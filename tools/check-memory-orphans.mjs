#!/usr/bin/env node
/* 16.09.2026 (владелец: «как от этого защититься в будущем?» — после находки, что 70 из 238
   файлов памяти потерялись из MEMORY.md при более ранней чистке, ни один не был реально
   бесполезен). Формализует ручную проверку (`comm -23` между списком файлов и списком ссылок
   в MEMORY.md), которую делала руками сегодня — теперь один вызов перед/после любой чистки
   индекса памяти. НЕ хук (не блокирует Edit — решение, что ретайрить, а что нет, требует
   прочитать файл, не автоматизируется), просто быстрый отчёт.
   Использование: node tools/check-memory-orphans.mjs [путь-к-папке-memory] */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || path.join(
  process.env.USERPROFILE || process.env.HOME || '.',
  '.claude', 'projects',
  'C--Users-admin-Documents-GitHub-cosmogram-app', 'memory'
);

const files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').map(f => f.slice(0, -3));
const indexSrc = readFileSync(path.join(dir, 'MEMORY.md'), 'utf8');
const linked = new Set([...indexSrc.matchAll(/\(([a-zA-Z0-9_.-]+)\.md\)/g)].map(m => m[1]));

const orphans = files.filter(f => !linked.has(f));
const dangling = [...linked].filter(f => !files.includes(f) && !f.startsWith('RESEARCH-'));

console.log(`Файлов памяти: ${files.length}, ссылок в индексе: ${linked.size}`);
if (orphans.length) {
  console.log(`\n❌ ${orphans.length} файлов памяти НЕ в индексе (невидимы будущей сессии):`);
  orphans.forEach(f => console.log('  ' + f));
} else {
  console.log('\n✅ Все файлы памяти проиндексированы.');
}
if (dangling.length) {
  console.log(`\n⚠️  ${dangling.length} ссылок в индексе указывают на несуществующий файл:`);
  dangling.forEach(f => console.log('  ' + f));
}
process.exit(orphans.length || dangling.length ? 1 : 0);
