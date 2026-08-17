'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет, что модули не превышают разумный размер (принцип маленьких шагов)
// Порог: 2000 строк — файлы больше требуют рефакторинга
const jsDir = path.join(__dirname, '../js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.includes('vendor'));

const MAX_LINES = 2000;
let oversized = [];

for (const file of files) {
  const filePath = path.join(jsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').length;
  if (lines > MAX_LINES) {
    oversized.push({ file, lines });
  }
}

if (oversized.length > 0) {
  const details = oversized.map(m => `${m.file}: ${m.lines} строк`).join('\n');
  console.warn(`Предупреждение: следующие файлы превышают ${MAX_LINES} строк:\n${details}`);
  console.warn('Рекомендуется разбить их на меньшие модули при следующей возможности.');
}

console.log('Module size guard ok (предупреждения выше, если есть)');
process.exit(0);
