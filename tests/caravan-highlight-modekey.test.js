const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// «Момент полёта, куратор» (cinemaHighlightStart) до правки считал modeKey только по
// управлению (gyro/keys/touch) — в Caravan «клип почти рекорда» сравнивал S.score с чужим
// bestTouch/bestGyro/bestKeys вместо bestCaravan. ui.js gameOver() уже решает это верно
// (строка 435) — cinema.js должен считать modeKey тем же способом.
const source = fs.readFileSync(require('path').join(__dirname, '../js/cinema.js'), 'utf8');
const start = source.indexOf('function cinemaHighlightStart(');
const end = source.indexOf('function saneNumberSafe(');
assert(start >= 0 && end > start, 'cinemaHighlightStart snippet not found in js/cinema.js');
const snippet = source.slice(start, end);

function modeKeyFor(controlMode, sMode){
  const sandbox = {
    cinemaHighlightEligible(){ return true; },
    cinemaActive(){ return false; },
    _cinemaOwner: null,
    controlMode(){ return controlMode; },
    S: sMode === undefined ? undefined : { mode: sMode, score: 0 },
    Store: { get(key, dflt){ sandbox.__requestedKey = key; return dflt; } },
    saneNumberSafe(v){ return v; },
    cinemaStart(){ return { then(){} }; }, // не резолвим — modeKey нужно поймать до этого
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(snippet + '\nthis.__start = cinemaHighlightStart;', sandbox);
  sandbox.__start({});
  return sandbox.__requestedKey;
}

assert.strictEqual(modeKeyFor('touch', 'caravan'), 'bestCaravan', 'Caravan (touch) должен читать bestCaravan, а не bestTouch');
assert.strictEqual(modeKeyFor('gyro', 'caravan'), 'bestCaravan', 'Caravan (gyro) должен читать bestCaravan, а не bestGyro');
assert.strictEqual(modeKeyFor('keys', 'caravan'), 'bestCaravan', 'Caravan (keys) должен читать bestCaravan, а не bestKeys');
assert.strictEqual(modeKeyFor('touch', 'classic'), 'bestTouch', 'Classic (touch) не должен затронуться правкой');
assert.strictEqual(modeKeyFor('gyro', 'classic'), 'bestGyro', 'Classic (gyro) не должен затронуться правкой');
assert.strictEqual(modeKeyFor('keys', 'classic'), 'bestKeys', 'Classic (keys) не должен затронуться правкой');
assert.strictEqual(modeKeyFor('touch', undefined), 'bestTouch', 'S ещё не создан — не должно падать TypeError, тихий откат на control-mode');

console.log('caravan highlight modeKey contract ok');
