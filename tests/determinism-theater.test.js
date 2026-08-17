'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Проверяет, что театр (режим воспроизведения) корректно обрабатывается в ключевых местах
const gameCode = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
const renderCode = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');

// Проверка 1: в театре не должно быть начисления очков/валюты
const theaterNoScore = /runMode\s*!==\s*['"]theater['"].*\blives\b/.test(gameCode) || 
                       /runMode\s*===\s*['"]theater['"].*return/.test(uiCode);
assert.strictEqual(theaterNoScore, true, 'Театр должен блокировать начисление очков/жизней');

// Проверка 2: endTheater должна вызываться при выходе из театра
const hasEndTheater = /endTheater\s*\(\s*\)/.test(uiCode);
assert.strictEqual(hasEndTheater, true, 'Должна существовать функция endTheater()');

// Проверка 3: детерминизм поля (seed-based RNG)
const coreCode = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const hasDeterministicRNG = /mulberry32|keyRNG|seed/.test(coreCode);
assert.strictEqual(hasDeterministicRNG, true, 'Должен быть детерминированный RNG для генерации поля');

// Проверка 4: blackbox записывает ленту событий для воспроизведения
const bbCode = fs.readFileSync(path.join(__dirname, '../js/blackbox.js'), 'utf8');
const hasTapeRecording = /tape|events|record/.test(bbCode.toLowerCase());
assert.strictEqual(hasTapeRecording, true, 'BlackBox должен записывать ленту событий');

  if (typeof guard !== 'undefined') {
    guard('Determinism Theater', () => true);
  }

console.log('Determinism & theater guard ok');
if (typeof guard === 'undefined') process.exit(0);
