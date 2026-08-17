'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/blackbox.js'), 'utf8');
const context = {
  console,
  setInterval,
  clearInterval,
  setTimeout,
  clearTimeout,
  performance: { now: () => 1000 },
  window: {
    innerWidth: 458,
    innerHeight: 844,
    devicePixelRatio: 3,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; }
  },
  document: {
    addEventListener() {},
    hidden: false
  },
  Store: {
    get(key, fallback) {
      const map = { bbTape: [] };
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
    },
    set() {},
    del() {}
  },
  navigator: { userAgent: 'test', platform: 'android' },
  GAME_VERSION: 'test',
  HAS_GYRO: true,
  L: {
    bbVNoSensor: 'no sensor',
    bbVLock: 'locked',
    bbVSilent: 'silent',
    bbVNoChan: 'no channel',
    bbVNoZero: 'no zero',
    bbVSkew: 'skew',
    bbVStale: 'stale',
    bbVOk: 'chain intact — gyro is steering',
    bbVStorm: 'storm',
    bbVLiar: 'liar channel active'
  },
  gyroUnlocked: () => true,
  tgPkt: 0,
  webPkt: 1,
  steerChan: 'tg',
  chanSilent: () => false,
  chanSpread: () => 22,
  input: { baseG: 0, baseB: 0, useGyro: true },
  chanLiar: () => true,
  remapAxes: (g, b) => [g, b],
  saneArray: (v, def) => Array.isArray(v) ? v : def,
  isLabEnv: () => false,
  BB: { _tape: () => [] }
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

assert.strictEqual(context.bbVerdict(), context.L.bbVLiar, 'a condemned liar channel must fail the gyro verdict');
  if (typeof guard !== 'undefined') {
    guard('Blackbox Verdict', () => true);
  }

console.log('blackbox verdict liar contract ok');
if (typeof guard === 'undefined') process.exit(0);
