'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8');
const store = { mem: {} };
store.get = (key, fallback) => Object.prototype.hasOwnProperty.call(store.mem, key) ? store.mem[key] : fallback;
store.set = (key, value) => { store.mem[key] = value; };
store.del = (key) => { delete store.mem[key]; };

const context = {
  console,
  performance: { now: () => 1000 },
  window: {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; }
  },
  document: {
    addEventListener() {},
    createElement() { return {}; },
    body: {}
  },
  navigator: { platform: 'ios', userAgent: 'ios test' },
  DeviceOrientationEvent: { requestPermission: () => Promise.resolve('granted') },
  tg: null,
  Store: store,
  clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  deadzone: (v, d) => Math.abs(v) < d ? 0 : v,
  audio() {},
  haptic() {},
  toast() {},
  L: { noTilt: 'no tilt', tiltOn: 'tilt on', calWait: 'cal wait', calZero: 'zero', calIng: 'ing' },
  screenName: 'settings',
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
  HAS_GYRO: true,
  GAME_VERSION: 'test',
  BB: undefined,
  BEACON: undefined,
  isFinite,
  Math,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Date,
  RegExp
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

assert.strictEqual(typeof context.tiltPermissionGranted, 'function', 'permission helper must exist');
assert.strictEqual(context.tiltPermissionGranted(), false, 'no permission grant should be false');
store.set('tiltPermission', 1);
assert.strictEqual(context.tiltPermissionGranted(), true, 'stored permission grant should be true');
console.log('permission persistence contract ok');
process.exit(0);
