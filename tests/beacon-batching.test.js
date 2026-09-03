const assert = require('assert');

const { pickDispatchCandidate } = require('../js/skymail.js');

const queue = [
  { kind: 'signal', msg: 'fps_drop', ts: 1 },
  { kind: 'signal', msg: 'fps_drop', ts: 2 },
  { kind: 'signal', msg: 'liar', ts: 3 },
  { kind: 'error', msg: 'boom', ts: 4 }
];

const result = pickDispatchCandidate(queue, 2);
assert.strictEqual(result.length, 2, 'should keep batch limited');
assert.strictEqual(result[0].kind, 'error', 'errors must win priority');
assert.strictEqual(result[1].kind, 'signal', 'signals keep order after error');

const deduped = pickDispatchCandidate([
  { kind: 'signal', msg: 'fps_drop:60', ts: 1 },
  { kind: 'signal', msg: 'fps_drop:60', ts: 2 },
  { kind: 'signal', msg: 'fps_drop:61', ts: 3 }
], 3);
assert.strictEqual(deduped.length, 2, 'duplicate signal keys should be collapsed');

console.log('beacon batching contract ok');
