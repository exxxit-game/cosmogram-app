const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// Caravan (05.09.2026) использует свежий случайный сид на каждый забег, точно как Classic —
// значит гонка с призраком там тоже «личное небо» и должна подхватывать сид призрака,
// как это уже делает Classic. ghostLoad() до правки проверяла только runMode==='classic'.
const source = fs.readFileSync(require('path').join(__dirname, '../js/game.js'), 'utf8');
const start = source.indexOf('function ghostLoad(');
const end = source.indexOf('function ghostStep(');
assert(start >= 0 && end > start, 'ghostLoad snippet not found in js/game.js');
const snippet = source.slice(start, end);

function runGhostLoad(runMode, opts){
  const sandbox = {
    ghost:null, ghostIdx:0, ghostOn:false, ghostFade:0, ghostA:0,
    ghostForeign:false, ghostSkin:-1, ghostName:'', ghostPid:0, ghostBest:0, ghostCat:'', ghostTagT:0,
    runMode,
    mapRNG:null, mapSeedKey:null,
    mapSeqReset(){},
    S:{ seed: opts.startSeed },
    keyRNG(seedStr){ return { seedUsed: seedStr }; },
    Store: { get(key, dflt){ return opts.ghostRun !== undefined ? opts.ghostRun : dflt; } },
    ghostActive(){ return true; },
    ghostTakeForeign(){ return opts.foreignGhost || null; },
    ghostParse(track){ return track ? { ds:[0,1], px:[0,0], py:[0,0], sk:0 } : null; },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet + '\nthis.__ghostLoad = ghostLoad;', sandbox);
  sandbox.__ghostLoad();
  return sandbox;
}

// --- Случай 1: чужой призрак из топа (fg-ветка), Caravan должна подхватить его сид ---
const fgSeed = 'foreign-seed-123';
const rClassic = runGhostLoad('classic', { foreignGhost: { track:'t', seed:fgSeed, skin:0 } });
const rCaravan = runGhostLoad('caravan', { foreignGhost: { track:'t', seed:fgSeed, skin:0 } });
const rSpeedrun = runGhostLoad('speedrun', { foreignGhost: { track:'t', seed:fgSeed, skin:0 } });

assert.strictEqual(rClassic.S.seed, fgSeed, 'classic: сид чужого призрака должен подхватываться (было и есть)');
assert.strictEqual(rCaravan.S.seed, fgSeed, 'caravan: сид чужого призрака должен подхватываться так же, как в classic');
assert.notStrictEqual(rSpeedrun.S.seed, fgSeed, 'speedrun: зачётный режим — сид призрака НЕ должен подменять сид дня/спидрана');

// --- Случай 2: свой призрак (Store.ghostRun), Caravan должна подхватить его сид ---
const ownSeed = 'own-seed-456';
const r2Classic = runGhostLoad('classic', { ghostRun: { track:'t', seed: ownSeed } });
const r2Caravan = runGhostLoad('caravan', { ghostRun: { track:'t', seed: ownSeed } });
const r2Speedrun = runGhostLoad('speedrun', { ghostRun: { track:'t', seed: ownSeed } });

assert.strictEqual(r2Classic.S.seed, ownSeed, 'classic: сид своего призрака должен подхватываться (было и есть)');
assert.strictEqual(r2Caravan.S.seed, ownSeed, 'caravan: сид своего призрака должен подхватываться так же, как в classic');
assert.notStrictEqual(r2Speedrun.S.seed, ownSeed, 'speedrun: зачётный режим — сид своего призрака НЕ должен подменять сид дня/спидрана');

console.log('caravan ghost ownSky contract ok');
