const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, '../js/sync.js'), 'utf8');
const start = source.indexOf('function ghostAccessStateForAuth');
const end = source.indexOf('function syncAuthName');
const snippet = source.slice(start, end);
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(snippet + '\nthis.ghostAccessStateForAuth = ghostAccessStateForAuth;', sandbox);
const { ghostAccessStateForAuth } = sandbox;

assert.strictEqual(ghostAccessStateForAuth(false, { accGuest: 'Войди через Telegram' }), 'Войди через Telegram');
assert.strictEqual(ghostAccessStateForAuth(true, { accGuest: 'Войди через Telegram' }), null);
assert.strictEqual(ghostAccessStateForAuth(false, {}), 'Sign in with Telegram');

  if (typeof guard !== 'undefined') {
    guard('Ghost Access', () => true);
  }

console.log('ghost access gating ok');
