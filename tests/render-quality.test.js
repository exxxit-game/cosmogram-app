'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/render.js'), 'utf8');
const context = {
  console,
  location: { href: 'https://example.test/' },
  Store: { get: (key, fallback) => fallback },
  gfxTier: () => 2,
  gfxUltraOk: () => true,
  lerp: (a, b, t) => a + (b - a) * t,
  performance: { now: () => 0 },
  resize() {},
  gfxCap() {},
  S: { running: true, paused: false },
  screenName: 'game'
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

const thr = context.qThr();
assert.strictEqual(thr.dn, 38, 'high-end tier should degrade gently');
assert.strictEqual(thr.up, 54, 'high-end tier should recover only after enough headroom');
console.log('render auto-quality thresholds ok');
