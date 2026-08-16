'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');

const context = {
  console,
  performance: { now: () => 0 },
  window: {
    Telegram: {
      WebApp: {
        initData: 'test-data',
        isVersionAtLeast: () => false,
        HapticFeedback: {
          impactOccurred() { return 'impact'; },
          notificationOccurred() { return 'notification'; }
        },
        ready() {},
        expand() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        enableClosingConfirmation() {}
      }
    },
    location: { hash: '', pathname: '/', search: '' },
    history: { replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
    document: {
      getElementById(id) {
        if (id !== 'game') return null;
        return {
          style: {},
          classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
          getContext() { return { imageSmoothingQuality: '', clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, measureText() { return { width: 0 }; }, canvas: {} }; }
        };
      },
      addEventListener() {},
      createElement() {
        return {
          style: {},
          classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
          getContext() { return { imageSmoothingQuality: '', clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, measureText() { return { width: 0 }; }, canvas: {} }; }
        };
      },
      body: {}
    },
    navigator: {},
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  },
  location: { hash: '', pathname: '/', search: '' },
  history: { replaceState() {} },
  document: {
    getElementById(id) {
      if (id !== 'game') return null;
      return {
        style: {},
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        getContext() { return { imageSmoothingQuality: '', clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, measureText() { return { width: 0 }; }, canvas: {} }; }
      };
    },
    addEventListener() {},
    createElement() {
      return {
        style: {},
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        getContext() { return { imageSmoothingQuality: '', clearRect() {}, fillRect() {}, drawImage() {}, setTransform() {}, save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, measureText() { return { width: 0 }; }, canvas: {} }; }
      };
    },
    body: {}
  },
  navigator: {},
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
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
  performance: { now: () => 0 }
};
context.globalThis = context;
context.self = context;
vm.createContext(context);
vm.runInContext(code, context);

assert.strictEqual(context.morseHF(), null, 'Telegram HapticFeedback must be rejected on unsupported client versions');
console.log('telegram haptics contract ok');
