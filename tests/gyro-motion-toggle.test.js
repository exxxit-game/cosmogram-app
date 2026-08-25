'use strict';

// WCAG 2.5.4 (закон Д4, .knowledge/LAWS.md): управление движением устройства обязано
// иметь UI-выключатель и полностью отключаемую реакцию на движение.
// Страж проверяет контракт «Штурман по желанию» (v1.106.0) сквозь три файла:
// ui.js — тумблер в настройках зовёт Store.set('gyroUnlocked',0);
// core.js — gyroUnlocked() честно читает этот ключ;
// game.js — руление гироскопом идёт ТОЛЬКО когда gyroUnlocked() правда (иначе — палец).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

assert.ok(/function gyroUnlocked\(\)\{\s*return Store\.get\('gyroUnlocked',0\)===1;\s*\}/.test(core),
  'gyroUnlocked() must read its state from Store, not a hardcoded value');

const offHandler = ui.match(/wireOn\('setGyroOffBtn', 'click', \(\)=>\{[\s\S]*?\n\}\);/);
assert.ok(offHandler, 'settings must have a click handler wired to setGyroOffBtn');
assert.ok(/Store\.set\('gyroUnlocked',0\)/.test(offHandler[0]),
  'the gyro-off toggle must actually lock the gyro back (Store.set gyroUnlocked=0), or the UI switch lies');

assert.ok(/input\.useGyro\s*=\s*gyroUnlocked\(\)/.test(game),
  'gyro steering must be gated by gyroUnlocked() — otherwise turning the toggle off would not stop motion reacting to tilt');

console.log('gyro motion-actuation toggle (WCAG 2.5.4) contract verified across ui.js/core.js/game.js');
