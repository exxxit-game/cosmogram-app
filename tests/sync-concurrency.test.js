'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/sync.js'), 'utf8');

function makeStore(seed) {
  const mem = Object.assign({}, seed || {});
  return {
    mem,
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : fallback; },
    set(key, value) { mem[key] = value; },
    del(key) { delete mem[key]; }
  };
}

function buildContext(options) {
  const store = makeStore(options && options.seedStore);
  const calls = [];
  const pending = [];

  function makeResponse(ok, status, body) {
    return {
      ok: !!ok,
      status: status == null ? 200 : status,
      json: () => Promise.resolve(body == null ? { ok: true } : body)
    };
  }

  const context = {
    console,
    tg: { initData: 'signed=1', initDataUnsafe: { user: { first_name: 'Pilot', id: 42 } } },
    Store: store,
    L: { dcLogin: 'Discord', ghostGo: 'ghost', topVerified: 'verified' },
    saneArray: (v, d) => Array.isArray(v) ? v : d,
    saneNumber: (v, d) => Number.isFinite(Number(v)) ? Number(v) : d,
    langEff: 'ru',
    isLabEnv: () => false,
    syncAuthChanged() {},
    location: { origin: 'https://example.test', pathname: '/app', search: '', href: 'https://example.test/app' },
    history: { replaceState() {} },
    URLSearchParams,
    navigator: { userAgent: 'test-agent', onLine: true },
    document: { addEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    fetch: (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      if (options && options.mode === 'deferred') {
        return new Promise((resolve) => pending.push(() => resolve(makeResponse(true, 200, { ok: true }))));
      }
      if (options && options.mode === 'timeout') {
        return new Promise((resolve, reject) => {
          if (opts.signal && opts.signal.aborted) {
            reject(new Error('aborted'));
            return;
          }
          if (opts.signal) {
            opts.signal.onabort = () => reject(new Error('aborted'));
          }
          pending.push(() => resolve(makeResponse(true, 200, { ok: true })));
        });
      }
      return Promise.resolve(makeResponse(true, 200, { ok: true }));
    },
    AbortController: class {
      constructor() {
        this.signal = { aborted: false, onabort: null };
      }
      abort() {
        this.signal.aborted = true;
        if (typeof this.signal.onabort === 'function') this.signal.onabort();
      }
    }
  };

  context.globalThis = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(code + '\nthis.__syncApi={syncSubmit,syncFlush,syncFetch,syncQueue};', context);
  return { context, store, calls, pending, makeResponse };
}

(async () => {
  // 1) Concurrency stress: parallel submit/flush should not lose extra fields.
  {
    const { context, store, calls, pending } = buildContext({ mode: 'deferred' });
    const api = context.__syncApi;

    const p1 = api.syncSubmit({ dist: 100 }, { duel_win: 1 });
    const p2 = api.syncSubmit({ dist: 120 }, { ghost_beat: 1 });

    assert.strictEqual(calls.length, 1, 'second submit should queue behind in-flight request');
    assert.strictEqual(calls[0].body.duel_win, 1, 'first request must carry first extra field');

    pending.shift()();
    await p1;
    await Promise.resolve();
    await Promise.resolve();

    assert.strictEqual(calls.length, 2, 'queued submit must trigger second request after first finishes');
    assert.strictEqual(calls[1].body.ghost_beat, 1, 'second request must keep second extra field');

    pending.shift()();
    await p2;

    const q = store.get('syncQ', []);
    assert.ok(Array.isArray(q) && q.length === 0, 'sync queue should be drained after both successful sends');
  }

  // 2) Timeout stress: syncFetch should abort hanging requests.
  {
    const { context } = buildContext({ mode: 'timeout' });
    const api = context.__syncApi;

    const realSetTimeout = context.setTimeout;
    context.setTimeout = (fn) => {
      fn();
      return 1;
    };

    let timedOut = false;
    try {
      await api.syncFetch('https://example.test/sync', { a: 1 });
    } catch (e) {
      timedOut = true;
    } finally {
      context.setTimeout = realSetTimeout;
    }

    assert.strictEqual(timedOut, true, 'syncFetch should abort and reject on timeout');
  }

  console.log('sync concurrency and timeout contracts ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
