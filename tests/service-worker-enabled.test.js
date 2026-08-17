'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет, что Service Worker включен в index.html
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// Проверка 1: должна быть регистрация serviceWorker.register, а не unregister
const hasRegister = /navigator\.serviceWorker\.register\s*\(/.test(html);
assert.strictEqual(hasRegister, true, 'Service Worker должен быть зарегистрирован через register()');

// Проверка 2: не должно быть unregister для sw.js
const hasUnregister = /if\s*\([^)]*serviceWorker[^)]*\)[\s\S]{0,500}unregister/.test(html);
assert.strictEqual(hasUnregister, false, 'Не должно быть кода unregister для Service Worker');

// Проверка 3: файл sw.js должен существовать
const swPath = path.join(__dirname, '../sw.js');
const swExists = fs.existsSync(swPath);
assert.strictEqual(swExists, true, 'Файл sw.js должен существовать');

// Проверка 4: sw.js должен содержать обработчики install и activate
const swCode = fs.readFileSync(swPath, 'utf8');
const hasInstall = /addEventListener\s*\(\s*['"]install['"]/.test(swCode);
const hasActivate = /addEventListener\s*\(\s*['"]activate['"]/.test(swCode);
const hasFetch = /addEventListener\s*\(\s*['"]fetch['"]/.test(swCode);
assert.strictEqual(hasInstall, true, 'SW должен иметь обработчик install');
assert.strictEqual(hasActivate, true, 'SW должен иметь обработчик activate');
assert.strictEqual(hasFetch, true, 'SW должен иметь обработчик fetch');

// Для браузерного запуска через guards.js
if (typeof guard !== 'undefined') {
  guard('Service Worker enabled', () => {
    return hasRegister && !hasUnregister && swExists && hasInstall && hasActivate && hasFetch;
  });
} else {
  console.log('Service Worker enabled guard ok');
  process.exit(0);
}
