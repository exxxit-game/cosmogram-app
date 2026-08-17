'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет, что OffscreenCanvas используется с проверкой поддержки
const code = fs.readFileSync(path.join(__dirname, '../js/canvas-effects.js'), 'utf8');

// Проверка 1: OffscreenCanvas должен быть в try-catch
const hasTryCatch = /try\s*\{[\s\S]*?offscreen\s*=\s*new\s+OffscreenCanvas/.test(code);
assert.strictEqual(hasTryCatch, true, 'OffscreenCanvas должен создаваться в try-catch для fallback');

// Проверка 2: должен быть fallback на обычный canvas
const hasFallback = /catch\s*\([^)]*\)\s*\{[\s\S]*?createElement\s*\(\s*['"]canvas['"]/.test(code);
assert.strictEqual(hasFallback, true, 'Должен быть fallback на document.createElement("canvas")');

// Проверка 3: должно быть как минимум 2 использования OffscreenCanvas (фон и lightMap)
const offscreenCount = (code.match(/new\s+OffscreenCanvas/g) || []).length;
assert.strictEqual(offscreenCount >= 2, true, 'Должно быть как минимум 2 использования OffscreenCanvas');

  if (typeof guard !== 'undefined') {
    guard('Offscreen Canvas Fallback', () => true);
  }

console.log('OffscreenCanvas fallback guard ok');
if (typeof guard === 'undefined') process.exit(0);
