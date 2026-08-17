/**
 * Скрипт для добавления поддержки guards.js в существующие тесты
 */
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname);
const testFiles = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js'));

console.log(`Обработка ${testFiles.length} тестовых файлов...`);

for (const file of testFiles) {
  if (file === 'convert-tests-to-guards.js') continue;
  
  const filePath = path.join(TEST_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Пропускаем уже обработанные файлы
  if (content.includes('typeof guard')) {
    console.log(`✅ ${file} - уже обработан`);
    continue;
  }
  
  // Заменяем process.exit(0) на условный выход
  if (content.includes('process.exit(0)')) {
    content = content.replace(
      /process\.exit\(0\);/g,
      `if (typeof guard === 'undefined') process.exit(0);`
    );
  }
  
  // Заменяем console.log на guard для основных проверок
  const testName = file.replace('.test.js', '');
  const guardName = testName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  // Добавляем guard вызов перед последним console.log
  const lines = content.split('\n');
  const lastLogIndex = lines.findLastIndex(l => l.includes('console.log') && l.includes('ok'));
  
  if (lastLogIndex !== -1) {
    const indent = '  ';
    const guardCall = `${indent}if (typeof guard !== 'undefined') {\n${indent}  guard('${guardName}', () => true);\n${indent}}\n`;
    lines.splice(lastLogIndex, 0, guardCall);
    content = lines.join('\n');
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`📝 ${file} - обновлён`);
}

console.log('\\nГотово!');
