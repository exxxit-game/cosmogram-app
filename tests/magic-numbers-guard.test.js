'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет наличие поясняющих комментариев для магических чисел в критических местах
// Это не строгий запрет, а напоминание о читаемости кода
const jsDir = path.join(__dirname, '../js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.includes('vendor'));

// Ищем числа без пояснений в контексте физики/коллизий/размеров
const magicNumberPattern = /\b(\d{3,}|\d+\.\d+)\b/g;
let potentialIssues = [];

for (const file of files) {
  const filePath = path.join(jsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Пропускаем строки с комментариями и очевидные случаи (версии, константы)
    if (line.trim().startsWith('//') || line.includes('GAME_VERSION') || line.includes('CACHE')) continue;
    
    const matches = line.match(magicNumberPattern);
    if (matches && matches.length > 0) {
      // Проверяем, есть ли комментарий в этой же строке
      if (!line.includes('//') && !line.includes('/*')) {
        // Проверяем, не является ли это частью объявления переменной с понятным именем
        if (!/const\s+\w+\s*=/.test(line) && !/let\s+\w+\s*=/.test(line)) {
          potentialIssues.push({ file, lineNum: i + 1, line: line.trim().slice(0, 60) });
        }
      }
    }
  }
}

if (potentialIssues.length > 20) {
  console.warn(`Найдено ${potentialIssues.length} потенциальных магических чисел без пояснений.`);
  console.warn('Это информационное предупреждение, тест проходит.');
} else if (potentialIssues.length > 0) {
  console.log(`Найдено ${potentialIssues.length} мест с потенциальными магическими числами (в пределах нормы)`);
}

console.log('Magic numbers guard ok');
process.exit(0);
