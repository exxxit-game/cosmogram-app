'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');

const calls = { requestFullscreen: 0, lockOrientation: 0, enableClosingConfirmation: 0 };

const mockApp = {
  initData: 'test-data',
  version: '8.0',
  isFullscreen: false,
  isVersionAtLeast: () => true,
  ready() {},
  expand() {},
  setHeaderColor() {},
  setBackgroundColor() {},
  disableVerticalSwipes() {},
  onEvent() {},
  offEvent() {},
  requestFullscreen() { calls.requestFullscreen++; },
  lockOrientation() { calls.lockOrientation++; },
  enableClosingConfirmation() { calls.enableClosingConfirmation++; }
};

const context = {
  console,
  performance: { now: () => 0 },
  window: {
    Telegram: { WebApp: mockApp },
    innerWidth: 390,
    innerHeight: 844,
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

// v1.477.27 «Погружение навсегда»: раньше fullscreen/orientation-lock включались только
// при запуске забега (startGame), а до этого — и в меню — не запрашивались вовсе. Теперь
// tgImmersion(true) должен сработать сразу при загрузке, без единого забега, без S.running.
assert.ok(calls.requestFullscreen >= 1, 'requestFullscreen must fire at load, before any run starts');
assert.ok(calls.lockOrientation >= 1, 'lockOrientation must fire at load, before any run starts');
assert.ok(calls.enableClosingConfirmation >= 1, 'enableClosingConfirmation must fire at load');
console.log('immersion always-on contract ok');
