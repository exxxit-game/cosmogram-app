'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const render = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');

assert.ok(!/let SPEED_STREAKS=true/.test(core), 'speed streaks should be disabled by default');
assert.ok(!/SPEED_STREAKS/.test(render.replace(/const streaksOn = .*?;/s, '')), 'render should no longer reference speed streak toggle');
console.log('speed streaks fully disabled contract ok');
