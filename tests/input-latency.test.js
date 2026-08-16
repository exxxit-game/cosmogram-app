'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8');

function DeviceOrientationEventCtor() {}
DeviceOrientationEventCtor.requestPermission = undefined;
const tgv = () => true;

const listeners = {};
const context = {
  console,
  DeviceOrientationEvent: DeviceOrientationEventCtor,
  tgv,
  window: {
    addEventListener(type, fn, options) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push({ fn, options });
    },
    removeEventListener() {},
    DeviceOrientationEvent: DeviceOrientationEventCtor,
    orientation: 0,
    screen: { orientation: { angle: 0 } }
  },
  document: {
    addEventListener() {},
    getElementById() { return null; },
    hidden: false,
    createElement() { return { style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } }, getContext(){ return {}; } }; }
  },
  navigator: { getGamepads(){ return []; } },
  performance: { now: () => 0 },
  Store: { get: () => undefined, set(){}, del(){}, has(){ return false; } },
  tg: {
    platform: 'android',
    DeviceOrientation: { start() {}, stop() {} },
    onEvent() {}
  },
  screenName: 'game',
  screen: { orientation: { angle: 0 } },
  setTimeout,
  clearTimeout,
  haptic() {},
  toast() {},
  svcToast() {},
  BB: { log(){} },
  BEACON: { signal(){} },
  L: { calIng: 'cal', calZero: 'zero', noTilt: 'no tilt', calibrated: 'calibrated', gyroStatTg: 'tg', gyroStatWeb: 'web', gyroStatNone: 'none' },
  $: () => null,
  isFinite,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  deadzone: (v, t = 0.07) => Math.abs(v) < t ? 0 : v * 1.08,
  withTrack: (kind, fn) => fn(),
  eq: () => false,
  safeNumber: (v, d) => Number.isFinite(v) ? v : d,
  maybeMenu: () => null,
  audio() {},
  gamepadRumble() {},
  runStart() {},
  retryRun() {},
  pauseGame() {},
  resumeGame() {},
  runMode: 'classic',
  myCallsign: () => 'N0CALL',
  showPopup() {},
  izan: () => false,
  timeStamp: () => 0,
  toFixedSafe: (v) => v,
  ic: () => ''
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

assert.ok(Array.isArray(listeners.touchstart) && listeners.touchstart.some(l => l.options && l.options.passive === false),
  'at least one touchstart listener must stay active on Android so the steering gesture is low-latency');
assert.ok(Array.isArray(listeners.touchmove) && listeners.touchmove.some(l => l.options && l.options.passive === false),
  'touchmove must remain active so the browser does not steal the scroll/steering gesture and the drag is processed immediately');
console.log('input latency guard ok');
