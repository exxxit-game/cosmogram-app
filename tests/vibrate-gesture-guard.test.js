'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');

let vibrateCalls = 0;
let nowValue = 0;
const listeners = {};
const canvasStub = {
  style: {},
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  getContext() {
    return {
      imageSmoothingQuality: '',
      clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {},
      fillText() {}, measureText() { return { width: 0 }; }, canvas: {}
    };
  }
};
const context = {
  console,
  performance: { now: () => nowValue },
  window: {
    Telegram: {
      WebApp: {
        initData: 'test-data',
        isVersionAtLeast: () => false,
        HapticFeedback: null,
        ready() {},
        expand() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        enableClosingConfirmation() {}
      }
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener() {},
    dispatchEvent() { return false; },
    navigator: {
      vibrate() { vibrateCalls++; }
    }
  },
  document: {
    addEventListener(type, fn) { listeners[type] = fn; },
    getElementById(id) { return id === 'game' ? canvasStub : null; },
    createElement() { return canvasStub; },
    body: {}
  },
  navigator: {
    vibrate() { vibrateCalls++; }
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: clearTimeout,
  URL,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  RegExp,
  isFinite,
  parseInt,
  parseFloat,
  performance: { now: () => nowValue },
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  matchMedia() { return { matches: false }; }
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

context.haptic('light');
assert.strictEqual(vibrateCalls, 0, 'vibrate fallback must be blocked before user interaction');
if (listeners.pointerdown) listeners.pointerdown();
nowValue = 200;
context.haptic('light');
assert.ok(vibrateCalls >= 1, 'after a user gesture, the vibrate fallback may be used');
  if (typeof guard !== 'undefined') {
    guard('Vibrate Gesture Guard', () => true);
  }

console.log('vibrate gesture guard ok');
