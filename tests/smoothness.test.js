'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const makeEl = () => ({
  style: {},
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  textContent: '',
  innerHTML: '',
  children: [],
  getContext(){
    return {
      setTransform(){}, clearRect(){}, save(){}, restore(){}, translate(){}, scale(){},
      beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, fill(){}, stroke(){}, arc(){},
      bezierCurveTo(){}, createLinearGradient(){ return { addColorStop(){} }; },
      shadowColor: '', shadowBlur: 0, fillStyle: '', strokeStyle: '', lineWidth: 0
    };
  },
  querySelector(){ return { textContent: '' }; }
});

const context = {
  console,
  document: {
    getElementById: () => makeEl(),
    addEventListener(){},
    createElement: () => makeEl()
  },
  window: { addEventListener(){}, removeEventListener(){} },
  location: { href: 'https://example.test/' },
  setTimeout,
  clearTimeout,
  performance: { now: () => 0 },
  Store: { get: () => undefined, set(){}, del(){}, has(){ return false; } },
  RNG: Math.random,
  mapRNG: Math.random,
  mapRand: (a, b) => a + Math.random() * (b - a),
  rand: (a, b) => a + Math.random() * (b - a),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  deadzone: (v, t = 0.07) => Math.abs(v) < t ? 0 : v * 1.08,
  saneNumber: (v, d) => Number.isFinite(v) ? v : d,
  showPopup(){},
  burst(){},
  updateCombo(){},
  updateLives(){},
  updateStarsHud(){},
  haptic(){},
  sfx: { coin(){}, combo(){}, hit(){}, launch(){}, mission(){}, nearMiss(){}, gate(){}, power(){}, smash(){}, shieldBlock(){}, click(){}, start(){} },
  music: { start(){}, kick(){}, stop(){} },
  planetSpark(){},
  juicy: (...args) => args[0],
  $: (id) => context.document.getElementById(id),
  input: { touchX: null, touchY: null, useGyro: false, tiltX: 0, tiltY: 0, keyR: false, keyL: false, keyU: false, keyD: false, byMouse: false },
  L: { combo: 'combo', unitM: 'm', forgeDefName: 'Pilot track', shieldDown: 'shield', nearMiss: 'near miss', gate: 'gate', shield: 'shield', magnet: 'magnet', slowmo: 'slowmo', life: 'life', dash: 'dash', nova: 'nova' },
  Q: { level: 2 },
  SKINS: [{ body: '#fff', fold: '#000', glow: 'rgba(0,0,0,.5)', trail: 'rgba(0,0,0,' }],
  BB: { log(){} },
  BEACON: { signal(){} },
  Adaptive: { mult(){ return { d: 1, s: 1 }; }, onDeath(){} },
  gyroUnlocked: () => false,
  isAndroidGo: () => false,
  gamepadRumble(){},
  withTrack: (kind, fn) => fn(),
  keyRNG: () => Math.random,
  mapSeqReset(){},
  mapSeedKey: 'seed',
  setScreen(){},
  releaseAwake(){},
  keepAwake(){},
  audio(){},
  engine: { start(){} },
  trackDayKey: () => '2026-01-01',
  dailyRNG: () => Math.random,
  eq(){},
  myCallsign: () => 'N0CALL',
  screenName: 'game'
};
context.globalThis = context;
context.self = context;
context.window = context;

vm.createContext(context);
vm.runInContext(code + '; this.S = S; this.hitPlane = hitPlane;', context);

assert.ok(context.S.smooth >= 0.5 && context.S.smooth <= 1, 'smoothness should start in the valid band');
context.hitPlane('rock');
assert.ok(context.S.smooth < 1, 'collision should reduce smoothness immediately');
assert.ok(context.S.smooth < 0.95, 'impact should noticeably depress the smoothness meter');
console.log('smoothness regression ok');
