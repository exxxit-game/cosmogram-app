'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет, что эхо-веса загружаются из localStorage, а не возвращают пустую заглушку
const code = fs.readFileSync(path.join(__dirname, '../js/canvas-effects.js'), 'utf8');

// Проверка 1: getEchoWeights должен использовать localStorage
const hasLocalStorage = /localStorage\.getItem\s*\(\s*['"]cosmogram_echo_weights['"]/.test(code);
assert.strictEqual(hasLocalStorage, true, 'getEchoWeights должен загружать данные из localStorage');

// Проверка 2: должна быть обработка ошибок (try-catch)
const hasTryCatch = /try\s*\{[\s\S]*?localStorage\.getItem[\s\S]*?catch\s*\([^)]*\)/.test(code);
assert.strictEqual(hasTryCatch, true, 'Должна быть обработка ошибок при загрузке эхо-весов');

// Проверка 3: render должен вызывать getEchoWeights с await
const hasAwaitCall = /await\s+ProceduralBg\.getEchoWeights\s*\(\s*\)/.test(code);
assert.strictEqual(hasAwaitCall, true, 'render должен вызывать getEchoWeights с await');

console.log('Echo weights storage guard ok');
process.exit(0);
