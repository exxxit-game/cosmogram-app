#!/usr/bin/env node
/*
 * worst-case.mjs — «проверять на САМОМ ТЯЖЁЛОМ РЕАЛИСТИЧНОМ случае» как исполняемая проверка (30.09.2026).
 *
 * ЖИВОЙ ПРОВАЛ (владелец, три раза за вечер: «я тебя учил всегда на самый тяжёлый случай… мне
 * постоянно приходится тебе об этом напоминать… это не должно быть просто текстом»): карточку места
 * рисовал и снимал на `#4` и коротких числах; на месте в тысячах цифра вылезла из плитки, а на
 * скриншоте владельца всё слиплось. Каждый раз смотрел лёгкий случай, потому что он приятнее.
 *
 * Как устроено (текст здесь не держит — держит хук .claude/hooks/worst-case-gate.mjs, он не даёт
 * закончить ход с правкой экрана итогов или макетом без свежего прогона этого файла):
 *   node tools/worst-case.mjs                 — живая игра: экран итогов, все режимы, все 5 языков, два реальных размера
 *   node tools/worst-case.mjs --fast          — то же, но русский и один размер (для быстрых кругов; хуку НЕ достаточно)
 *   node tools/worst-case.mjs macet <папка>   — макет: тяжёлые данные внутри и отрисовка без вылезания/обрезания
 *   node tools/worst-case.mjs --waive "почему" — осознанное освобождение (видно владельцу, минимум 20 знаков причины)
 * Данные — tools/worst-case-fixtures.json: РЕАЛИСТИЧНЫЕ потолки (измерено в живой базе / правило игры / слово
 * владельца) с источником у каждого числа. Выдуманные числа в файл не попадают.
 *
 * Что проверяется на каждом (сценарий × язык × размер):
 *   1) ничего не выходит за края экрана и за края своей карточки;
 *   2) текст не обрезан молча (многоточие допускается только у имён — это решение дизайна);
 *   3) соседние блоки не наезжают друг на друга, «Ещё раз» и ряд кнопок целиком на экране (без прокрутки);
 *   4) стикер и подпись «Твоего полёта» внутри своей карточки.
 * След прогона: ~/.claude/state/worst_case/log.jsonl (читает хук).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(HERE, 'worst-case-fixtures.json'), 'utf8'));
const H = FIX.heavy;
const LOG_DIR = path.join(os.homedir(), '.claude', 'state', 'worst_case');
const LOG = path.join(LOG_DIR, 'log.jsonl');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);

function writeLog(entry) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...entry }) + '\n'); } catch { /* след необязателен для самой проверки */ }
}

// --- осознанное освобождение: видно, записано, не молчит ---
const wi = args.indexOf('--waive');
if (wi >= 0) {
  const reason = String(args[wi + 1] || '').trim();
  if (reason.length < 20) { console.error('⛔ --waive требует причину минимум 20 знаков (что именно здесь не применимо и почему).'); process.exit(2); }
  writeLog({ mode: 'waive', ok: true, reason });
  console.log('⚠️  ОСВОБОЖДЕНИЕ от проверки на тяжёлом случае записано. Причина: ' + reason + '\n   Скажи владельцу об этом в ответе — оно видно в журнале.');
  process.exit(0);
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch { /* нет npm */ }
  tries.push('/opt/node-tools/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules');
  for (const base of tries) { try { return req(path.join(base, 'playwright')).chromium; } catch { /* дальше */ } }
  try { return req('playwright').chromium; } catch { /* дальше */ }
  console.error('⛔ Не найден playwright (ни в проекте, ни в глобальных модулях).'); process.exit(2);
}

function serve(dir) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webp': 'image/webp' };
  return new Promise((resolve) => {
    const srv = http.createServer((q, s) => {
      let f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir)) { s.statusCode = 403; return s.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); }
      s.setHeader('content-type', mime[path.extname(f).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(f).pipe(s);
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// Проверки макета/игры — одна и та же функция, исполняется внутри страницы.
const AUDIT_SRC = `(scope) => {
  const W = innerWidth, Hh = innerHeight, v = [];
  const desc = (e) => (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') || e.tagName.toLowerCase();
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = [...scope.querySelectorAll('*')].filter((e) => !(e instanceof SVGElement && e.tagName.toLowerCase() !== 'svg') && vis(e));
  const cardOf = (e) => e.closest('.rkTile, .ofCell, .ofSeg, .fdRow, .overCard, #overLoc, #recordMedals, #finishDelta, #newRecord, .card, .rk, .sheet > *');
  let ellipsis = 0;
  for (const e of els) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.left < -1 || r.right > W + 1) v.push('вылезает за экран по ширине: ' + desc(e) + ' [' + Math.round(r.left) + '…' + Math.round(r.right) + ' из ' + W + ']');
    const c = cardOf(e);
    if (c && c !== e) { const cr = c.getBoundingClientRect(); if (r.right > cr.right + 1.5 || r.left < cr.left - 1.5) v.push('вылезает из своей карточки по ширине: ' + desc(e) + ' в ' + desc(c) + ' [' + Math.round(r.left - cr.left) + '…' + Math.round(r.right - cr.right) + ']'); }
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && e.scrollWidth > e.clientWidth + 1) {
      if (cs.textOverflow === 'ellipsis') ellipsis++;
      else if (cs.overflowX !== 'visible') v.push('текст обрезан молча: ' + desc(e) + ' «' + e.textContent.trim().slice(0, 30) + '»');
    }
  }
  return { v, ellipsis };
}`;

const ROW_AUDIT_SRC = `(sel) => {
  const scr = document.querySelector(sel); const v = [];
  const kids = [...scr.children].filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed' && r.height > 0 && r.width > 0; });
  kids.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  for (let i = 1; i < kids.length; i++) { const p = kids[i - 1].getBoundingClientRect(), n = kids[i].getBoundingClientRect(); if (n.top < p.bottom - 1) v.push('блоки наезжают: ' + (kids[i - 1].id || kids[i - 1].className) + ' и ' + (kids[i].id || kids[i].className) + ' (' + Math.round(p.bottom - n.top) + 'px)'); }
  return v;
}`;

/* ------------------------------ ИГРА ------------------------------ */
// Устанавливается в страницу один раз на (язык × размер); дальше каждый сценарий гоняется отдельным вызовом — между ними можно снять экран.
const SETUP_SRC = `({ H, lang, AUDIT_SRC, ROW_AUDIT_SRC }) => {
  const audit = eval(AUDIT_SRC), rowAudit = eval(ROW_AUDIT_SRC);
  const $ = (id) => document.getElementById(id);
  const settle = (ms) => new Promise((r) => setTimeout(r, ms));
  Store.set('ballMet', 1); Store.set('lang', lang); L = I18N[lang]; if (typeof applyLang === 'function') applyLang();
  window.syncAvailable = () => false; window.achCheck = () => {};
  const kinds = Object.keys(OF_KIND_NAME); // самая длинная подпись причины на этом языке
  const longKind = kinds.slice().sort((a, b) => String(L[OF_KIND_NAME[b]] || '').length - String(L[OF_KIND_NAME[a]] || '').length)[0];
  const fillRec = (dist) => { rec.length = 0; for (let i = 0; i < 90; i++) rec.push([46 + Math.round(30 * Math.sin(i / 5)), 55 + Math.round(22 * Math.cos(i / 7)), Math.round(i / 90 * dist)]); };
  const name = H.playerName.value;
  const top = (rank, mine, rival, timeMode) => { const t = []; if (rank > 1) t[rank - 2] = { pid: 7, name, best: rival, track: timeMode ? 'x' : undefined, skin: 0 }; t[rank - 1] = { me: true, best: mine }; return t; };
  const scenarios = {
    // Score Attack, глубоко в таблице: огромный номер места, маленькие очки (большой номер и большие очки вместе невозможны — это разные сценарии)
    sa_deep_rank: { mode: 'classic', store: [['bestTouch', 5000], ['bestDist', 20000]], s: { score: 840, dist: 600, bonuses: 3 }, rank: () => overRankFill({ ok: true, me: { rank: H.rank.value, best: 840 }, top: top(H.rank.value, 840, 850) }, 'touch') },
    // Score Attack, верх таблицы: очки в шесть знаков, две медали, награды значками, полный «Цифры»
    sa_top_records: { mode: 'classic', store: [['bestTouch', 90000], ['bestDist', 8000]], s: { score: 99500, dist: H.dist.value, bonuses: 3, comboMax: H.combo.value, starsCollected: H.stars.value, nearMiss: H.nearMiss.value, mission: H.wave.value }, ghost: true,
      rank: () => overRankFill({ ok: true, me: { rank: 2, best: 99500 }, top: [{ pid: 9, name, best: H.rivalScore.value }, { me: true, best: 99500 }] }, 'touch') },
    // первый полёт в жизни: обе медали + разовое предложение гироскопа, которое раскрывается уже после подгонки
    sa_first_flight: { mode: 'classic', store: [['bestTouch', 0], ['bestDist', 0]], s: { score: 380, dist: 240, bonuses: 2 }, gyro: true, rank: () => overRankFill({ ok: true, me: { rank: 37, best: 380 }, top: top(37, 380, 410) }, 'touch') },
    sp_win_deep: { mode: 'speedrun', store: [['srBest', 660]], s: { srWin: 1, time: H.speedrunTimeSec.value, score: 10200, dist: 5200, bonuses: 3 }, rank: () => overTimeRankFill({ ok: true, me: { rank: H.rank.value, best: 600 }, top: top(H.rank.value, 600, 599, true) }, 'speedrun', false) },
    sp_win_slower: { mode: 'speedrun', store: [['srBest', 252.3]], s: { srWin: 1, time: H.speedrunTimeSec.value, score: 10200, dist: 5200 }, rank: () => overTimeRankFill({ ok: true, me: { rank: 3, best: 252.3 }, top: top(3, 252.3, 251, true) }, 'speedrun', false) },
    sp_death: { mode: 'speedrun', store: [['srBest', 252.3]], s: { score: 9999, dist: 4800, time: 400 } },
    sl_win: { mode: 'slalom', store: [['slalomBest', 200]], s: { slalomWin: 1, time: H.slalomTimeSec.value, score: 3200, dist: 4500 }, rank: () => overTimeRankFill({ ok: true, me: { rank: H.rank.value, best: 180 }, top: top(H.rank.value, 180, 179, true) }, 'slalom', false) },
    sl_fail: { mode: 'slalom', s: { slalomFail: 1, dist: 4499, score: 3200 } },
    bi_win: { mode: 'biathlon', store: [['biathlonBest', 130]], s: { biathlonWin: 1, biathlonMisses: H.biathlonMisses.value, time: H.biathlonTimeSec.value, score: 6400, dist: 3000 }, rank: () => overTimeRankFill({ ok: true, me: { rank: H.rank.value, best: 96 }, top: top(H.rank.value, 96, 95, true) }, 'biathlon', false) },
    bi_death: { mode: 'biathlon', s: { score: 5000, dist: 2900, biathlonMisses: H.biathlonMisses.value } },
    daily: { mode: 'daily', s: { dailyDay: '2026-09-30', score: 46430, dist: H.dist.value, bonuses: 3 }, gold: true },
    caravan: { mode: 'caravan', s: { caravanTimeUp: 1, score: 9000, dist: 3000, bonuses: 3 } },
    relay: { mode: 'relay', s: { relayLegDone: 1, relayLeg: H.relayLeg.value, score: 8000, dist: 3000, bonuses: 3 } }
  };
  window.__wc = {
    ids: Object.keys(scenarios),
    run: async (id) => {
      const sc = scenarios[id];
      try {
        Object.assign(S, { running: true, mode: sc.mode, srWin: 0, slalomWin: 0, slalomFail: 0, biathlonWin: 0, biathlonMisses: 0, wasRestored: 0, speedrunRSG: 0, smooth: 1, lives: 0, hits: 1, bonuses: 0, lastHitKind: longKind, starsCollected: 45, comboMax: 12, nearMiss: 7, mission: 6, caravanTimeUp: 0, relayLegDone: 0, time: 50, dist: 2400, score: 4377, everDash: 0, everNova: 0 }, sc.s || {});
        runMode = sc.mode; fillRec(S.dist);
        (sc.store || []).forEach(([k, val]) => Store.set(k, val));
        try { ghostForeign = !!sc.ghost; foreignFrom = sc.ghost ? 'top' : ''; ghostPid = sc.ghost ? 5 : 0; ghostCat = sc.ghost ? 'touch' : ''; ghostBest = sc.ghost ? 1000 : 0; ghostName = name; } catch (e) { /* переменные призрака недоступны — сценарий идёт без него */ }
        const g0 = $('gyroOfferWrap'); if (g0) { g0.style.minHeight = ''; g0.classList.add('hidden'); }
        const gc = $('goldChip'); if (gc) gc.classList.add('hidden');
        gameOver();
        $('webJoin').classList.add('hidden');
        if (sc.rank) sc.rank();
        if (sc.gyro) { const gw = $('gyroOfferWrap'); gw.classList.remove('hidden', 'gone'); gw.style.minHeight = '110px'; }
        if (sc.gold && gc) gc.classList.remove('hidden');
        await settle(1500); // медаль (.55с), счёт (.8с), подгонка (400мс)
        const a = audit($('gameOverScreen'));
        const v = a.v.concat(rowAudit('#gameOverScreen'));
        const retry = $('retryBtn').getBoundingClientRect(), ov = $('overRow').getBoundingClientRect();
        if (retry.bottom > innerHeight + 1) v.push('«Ещё раз» ниже края экрана (' + Math.round(retry.bottom) + ' > ' + innerHeight + ')');
        if (ov.bottom > innerHeight + 1 && !$('overRow').classList.contains('hidden')) v.push('ряд «Вызов / Поделиться / Меню» ниже края экрана (' + Math.round(ov.bottom) + ' > ' + innerHeight + ')');
        const card = $('overFlight');
        if (!card.classList.contains('hidden')) {
          const cr = card.getBoundingClientRect();
          for (const sel of ['.ofStk', '.ofCap', '.ofHook']) { const e = card.querySelector(sel); if (e) { const r = e.getBoundingClientRect(); if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) v.push('в «Твоём полёте» ' + sel + ' вылез из карточки'); } }
          if (card.scrollHeight > card.clientHeight + 1) v.push('карточка «Твой полёт» обрезана по высоте');
          const bx = card.querySelector('.ofBox'); if (bx && bx.getBoundingClientRect().height < 80) v.push('рисунок «Твоего полёта» сжат меньше 80px (' + Math.round(bx.getBoundingClientRect().height) + ')');
        }
        return { id, v, ellipsis: a.ellipsis };
      } catch (e) { return { id, v: ['сценарий упал: ' + String((e && e.message) || e).slice(0, 140)], ellipsis: 0 }; }
    }
  };
  return scenarios ? Object.keys(scenarios).length : 0;
}`;

async function runGame() {
  const chromium = loadPlaywright();
  const { srv, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const fast = flag('--fast');
  const langs = fast ? ['ru'] : H.langs;
  const viewports = fast ? [H.viewports[1]] : H.viewports;
  const outDir = path.join(ROOT, '.playwright-mcp', 'worst');
  fs.mkdirSync(outDir, { recursive: true });
  const found = new Map(); // «сценарий :: нарушение» → языки и размеры
  const shots = [];
  let runs = 0, ellipsis = 0;
  const t0 = Date.now();
  for (const vp of viewports) {
    for (const lang of langs) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof GAME_VERSION !== 'undefined' && typeof startGame === 'function', null, { timeout: 20000 });
      if (process.env.WC_INJECT_CSS) await page.addStyleTag({ content: process.env.WC_INJECT_CSS }); // только для проверки самого инструмента
      const n = await page.evaluate(`(${SETUP_SRC})(${JSON.stringify({ H, lang, AUDIT_SRC, ROW_AUDIT_SRC })})`);
      const ids = await page.evaluate(() => window.__wc.ids);
      for (const id of ids) {
        const r = await page.evaluate((x) => window.__wc.run(x), id);
        runs++; ellipsis += r.ellipsis || 0;
        // снимаем русский на обоих размерах (для просмотра глазами) и всё, где что-то нашли
        if (lang === 'ru' || r.v.length) {
          const f = path.join(outDir, id + '_' + lang + '_' + vp.w + 'x' + vp.h + '.png');
          await page.screenshot({ path: f }); if (lang === 'ru') shots.push(path.relative(ROOT, f));
        }
        for (const msg of r.v) {
          const key = id + ' :: ' + msg;
          if (!found.has(key)) found.set(key, { langs: new Set(), vps: new Set() });
          found.get(key).langs.add(lang); found.get(key).vps.add(vp.w + '×' + vp.h);
        }
      }
      void n;
      await ctx.close();
    }
  }
  await browser.close(); srv.close();
  const list = [...found.entries()].map(([k, x]) => ({ k, langs: [...x.langs].join(','), vps: [...x.vps].join(',') }));
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log('Худший реалистичный случай · экран итогов · ' + runs + ' прогонов (' + langs.join('/') + ' × ' + viewports.map((v) => v.w + '×' + v.h).join(' + ') + ') · ' + mins + ' мин' + (fast ? ' · БЫСТРЫЙ КРУГ (хуку недостаточно)' : ''));
  console.log('Данные от ' + FIX.measuredAt + ': место ' + H.rank.value + ' · имя «' + H.playerName.value + '» · очки до ' + H.scoreAttack.value + ' · Спидран ' + H.speedrunTimeSec.value + ' с · Биатлон ' + H.biathlonMisses.value + ' промахов · многоточий (имена) ' + ellipsis);
  if (list.length) { console.log('\n❌ НАРУШЕНИЙ: ' + list.length); list.forEach((x) => console.log('  • ' + x.k + '   [' + x.langs + ' · ' + x.vps + ']')); }
  else console.log('\n✅ Ни одного нарушения на самом тяжёлом реалистичном случае.');
  console.log('\nСнимки (русский) — ПОСМОТРИ ГЛАЗАМИ каждый: ' + path.relative(ROOT, outDir) + '/ (' + shots.length + ' файлов)');
  writeLog({ mode: 'game', ok: list.length === 0, fast, runs, violations: list.length, head: list.slice(0, 5).map((x) => x.k), langs, vps: viewports.map((v) => v.w + 'x' + v.h), shots: shots.length });
  process.exit(list.length ? 1 : 0);
}

/* ------------------------------ МАКЕТ ------------------------------ */
async function runMacet(dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) { console.error('⛔ Нет папки макета: ' + abs); process.exit(2); }
  const files = fs.readdirSync(abs).filter((f) => /\.dc\.html$/i.test(f));
  if (!files.length) { console.error('⛔ В папке нет *.dc.html'); process.exit(2); }
  const markers = [H.playerName.value, '100 000', '600.0', '10:00.0', '3:00.0', '1:36.0', '×99', '999'];
  const problems = [];
  const chromium = loadPlaywright();
  const { srv, port } = await serve(abs);
  const browser = await chromium.launch();
  for (const f of files) {
    const html = fs.readFileSync(path.join(abs, f), 'utf8');
    const waiver = /<!--\s*worst-case:\s*не применимо[^>]{15,}-->/i.test(html);
    const hits = markers.filter((m) => html.includes(m)).length;
    if (!waiver && hits < 2) problems.push(f + ': в макете нет тяжёлого реалистичного случая (нашёл ' + hits + ' из нужных 2 признаков: ' + markers.join(' | ') + '). Нарисуй его или напиши в файле <!-- worst-case: не применимо — почему -->');
    const m = /"\$preview":\{"width":(\d+),"height":(\d+)\}/.exec(html);
    const w = m ? +m[1] : 360, h = m ? +m[2] : 800;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:' + port + '/' + f, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const res = await page.evaluate(({ AUDIT_SRC }) => {
      const root = document.querySelector('x-dc > *:not(helmet)') || document.body;
      const a = eval(AUDIT_SRC)(root);
      const rr = root.getBoundingClientRect();
      if (root.scrollHeight > root.clientHeight + 1) a.v.push('содержимое выше рамки макета на ' + (root.scrollHeight - root.clientHeight) + 'px (обрезано или прокрутка)');
      if (root.scrollWidth > root.clientWidth + 1) a.v.push('содержимое шире рамки макета');
      return a.v;
    }, { AUDIT_SRC });
    for (const msg of res) problems.push(f + ': ' + msg);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log('Худший реалистичный случай · макет · ' + files.length + ' досок из ' + abs);
  if (problems.length) { console.log('\n❌ ЗАМЕЧАНИЙ: ' + problems.length); problems.forEach((p) => console.log('  • ' + p)); }
  else console.log('\n✅ Во всех досках есть тяжёлый случай и ничего не вылезает.');
  writeLog({ mode: 'macet', ok: problems.length === 0, files, dir: abs, violations: problems.length, head: problems.slice(0, 5) });
  process.exit(problems.length ? 1 : 0);
}

const sub = args.find((a) => !a.startsWith('--'));
if (sub === 'macet') await runMacet(args[args.indexOf('macet') + 1] || '.');
else await runGame();
