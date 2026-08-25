'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const start = source.indexOf('let W=0, H=0, DPR=1, dprCap=2, SC=1, capPx=2560, SC_MIN=0.5;');
const end = source.indexOf('gfxCap(); resize();');
const snippet = source.slice(start, end + 'gfxCap(); resize();'.length);

const makeCanvas = () => {
  const state = { width: 0, height: 0, style: { width: '', height: '' }, _ctx: null };
  const ctx = {
    setTransform(){},
    fillRect(){},
    clearRect(){},
    save(){},
    restore(){},
    translate(){},
    scale(){},
    beginPath(){},
    moveTo(){},
    lineTo(){},
    arc(){},
    closePath(){},
    fill(){},
    stroke(){},
    clip(){},
    createLinearGradient(){ return { addColorStop(){} }; },
    createRadialGradient(){ return { addColorStop(){} }; }
  };
  state._ctx = ctx;
  Object.defineProperty(state, 'width', {
    get(){ return this._width || 0; },
    set(v){ this._width = v; }
  });
  Object.defineProperty(state, 'height', {
    get(){ return this._height || 0; },
    set(v){ this._height = v; }
  });
  state.getContext = () => ctx;
  return state;
};

const canvas = makeCanvas();
const ctx = canvas.getContext();
const context = {
  console,
  window: {
    devicePixelRatio: 2,
    innerWidth: 390,
    innerHeight: 844,
    addEventListener(){},
    removeEventListener(){}
  },
  document: {
    activeElement: { tagName: 'DIV', isContentEditable: false },
    body: {},
    addEventListener(){},
    createElement: () => makeCanvas(),
    getElementById: () => ({ classList: { toggle(){} } })
  },
  matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }),
  requestAnimationFrame: (fn) => { fn(0); return 1; },
  cancelAnimationFrame(){},
  performance: { now: () => 0 },
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout(){},
  Store: { get: (key, fallback) => fallback, set(){}, del(){}, has(){ return false; } },
  tg: null,
  location: { href: 'https://example.test/' },
  navigator: { userAgent: 'Mozilla/5.0', hardwareConcurrency: 8 },
  screen: { width: 390, height: 844 },
  canvas,
  ctx,
  drawKick(){},
  tgInsetsSoon(){},
  tgInsetsSync(){},
  tgFullscreenFailed(){},
  tooNarrowText(){},
  syncScoreHudGap(){}, // 23.08.2026: resize() зовёт её через rAF (core.js) — определена вне вырезанного куска, как и соседи выше
  tgApp: () => null,
  queueMicrotask,
  console,
  Math,
  setInterval,
  clearInterval,
  Date
};
context.self = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(snippet, context);

let writes = 0;
const widthSetter = Object.getOwnPropertyDescriptor(canvas, 'width').set;
const heightSetter = Object.getOwnPropertyDescriptor(canvas, 'height').set;
Object.defineProperty(canvas, 'width', {
  get(){ return this._width || 0; },
  set(v){ writes++; this._width = v; }
});
Object.defineProperty(canvas, 'height', {
  get(){ return this._height || 0; },
  set(v){ this._height = v; }
});
context.resize();
context.resize();
assert.strictEqual(writes, 0, 'resize should be idempotent when viewport geometry is unchanged');
console.log('resize thrash regression ok');
