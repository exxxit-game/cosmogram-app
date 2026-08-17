'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет отсутствие TODO/FIXME/XXX/HACK комментариев в коде
const jsDir = path.join(__dirname, '../js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

let foundTodos = [];
for (const file of files) {
  const filePath = path.join(jsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(/(TODO|FIXME|XXX|HACK)[^\n]*/g);
  if (matches) {
    foundTodos.push({ file, matches });
  }
}

if (foundTodos.length > 0) {
  const details = foundTodos.map(t => 
    `${t.file}: ${t.matches.join('; ')}`
  ).join('\n');
  assert.fail(`Найдены незавершенные комментарии:\n${details}`);
}

console.log('No TODO comments guard ok');
process.exit(0);
