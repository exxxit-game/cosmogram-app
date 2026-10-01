#!/usr/bin/env node
/*
 * screen-audit.mjs — «всё сразу» (01.10.2026). Владелец: «задачи стали комплексные, где надо учитывать по несколько переменных сразу,
 * а ты подходишь методом, где ремонтируется что-то одно… там, где одну починили, там следующая сломана, и оно по кругу движется»;
 * «мы вообще все языки мира будем брать».
 *
 * Метод (из практики): 1) Galen Framework — требования к вёрстке записаны ФАЙЛОМ (отношения между элементами с допусками), а не в голове;
 * 2) псевдо-локализация — до настоящих переводов подставляют текст другой длины и письменности и смотрят, что ломается; здесь — по
 * профилям реальных языков (tools/screen-specs/languages.json: китайский/японский без пробелов, арабский/иврит справа налево, хинди/тайский,
 * немецкие слитные слова, финский); 3) проверка идёт по МАТРИЦЕ (размер экрана × язык) за один запуск, печатается таблица «что где не
 * держится». Конфликт требований называется вслух, а не «чинится» заменой одного другим.
 *
 *   node tools/screen-audit.mjs --spec=tools/screen-specs/equality.json            — матрица по файлу требований
 *   node tools/screen-audit.mjs <экран> [--cards=.sel] [--sizes=360x800,360x700]   — быстрая проверка одного состояния
 *
 * Требования в файле (допуски; см. tools/screen-specs/equality.json):
 *   overflowX / cardHeightSpreadMax / extraSpaceMax / leadingStretchMax / innerGapSpreadMax / peekMin / blockGapMax / overlaps
 * Код выхода 1, если что-то не держится.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
let spec;
if (opt('spec', '')) spec = JSON.parse(fs.readFileSync(path.resolve(ROOT, opt('spec', '')), 'utf8'));
else {
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) { console.error('Использование: node tools/screen-audit.mjs --spec=tools/screen-specs/<экран>.json  |  node tools/screen-audit.mjs <экран> [--cards=.sel]'); process.exit(2); }
  spec = { screen: target, cards: opt('cards', ''), refit: '', sizes: opt('sizes', '360x800,360x700').split(','), languages: '', textSel: '', constraints: { blockGapMax: +opt('gap', 60) } };
}
const C = Object.assign({ overflowX: 0, cardHeightSpreadMax: 1, extraSpaceMax: 12, leadingStretchMax: 1.25, innerGapSpreadMax: 2, peekMin: 0, blockGapMax: 60, overlaps: 0 }, spec.constraints || {});
const sizes = (spec.sizes || ['360x800']).map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
const langs = spec.languages ? JSON.parse(fs.readFileSync(path.resolve(ROOT, spec.languages), 'utf8')).languages : [{ name: 'как есть', factor: 1, dir: 'ltr', sample: '' }];

// данные, которые МЕНЯЮТСЯ (рекорды, счётчики, ники, места): наборы значений из tools/data-fixtures.json — «ноль / как сейчас / самое тяжёлое / самое широкое»
const cases = spec.cases && spec.cases.length ? spec.cases : [null];
const fx = spec.data ? JSON.parse(fs.readFileSync(path.resolve(ROOT, spec.data), 'utf8')).classes : {};
const dyn = spec.dynamic || [];
const req = createRequire(import.meta.url);
const chromium = req(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webp': 'image/webp' };
const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', mime[path.extname(f).toLowerCase()] || 'application/octet-stream'); fs.createReadStream(f).pipe(s); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const port = srv.address().port;

// --- работает внутри страницы ---
const applyLang = (o) => { // подставить текст профиля: длина = factor × длина оригинала, письменность — из sample; направление письма — dir
  const root = document.querySelector(o.rootSel); if (root) root.dir = o.lang.dir || 'ltr';
  if (!o.textSel) return;
  document.querySelectorAll(o.textSel).forEach((e) => { if (e.childElementCount) return; if (e.dataset.orig === undefined) e.dataset.orig = e.textContent;
    const orig = e.dataset.orig; if (!o.lang.sample) { e.textContent = o.lang.factor === 1 ? orig : (() => { const w = orig.split(/\s+/).filter(Boolean); const n = Math.max(2, Math.round(w.length * o.lang.factor)); const out = []; for (let i = 0; i < n; i++) out.push(w[i % w.length]); return out.join(' '); })(); return; }
    const target = Math.max(6, Math.round(orig.length * o.lang.factor)); let s = ''; while (s.length < target) s += o.lang.sample; e.textContent = s.slice(0, target).trim(); }); };
const measure = (opts) => {
  const root = document.querySelector(opts.rootSel); if (!root) return { err: 'нет корня ' + opts.rootSel };
  const vw = innerWidth, res = { overflow: 0, overflowWho: [], cards: [], gaps: [], overlaps: 0, overlapWho: [] };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inHScroll = (e) => { for (let p = e.parentElement; p && p !== root; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  const leaves = [...root.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('svg') && (e.matches('p,b,h1,h2,h3,button,img,canvas,input,.chSub') || ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.children.length)));
  leaves.forEach((e) => { if (inHScroll(e)) return; const r = e.getBoundingClientRect(); const textCut = e.matches('p,.chSub,h1,h2,h3') && e.scrollWidth > e.clientWidth + 1; // обрезка текста по ширине (слово не помещается); у кнопок-значков без текста не считаем
    if (r.right > vw + 1 || r.left < -1 || textCut) { res.overflow++; if (res.overflowWho.length < 4) res.overflowWho.push((e.textContent || e.tagName).trim().slice(0, 22)); } });
  const cards = opts.cardsSel ? [...root.querySelectorAll(opts.cardsSel)].filter(vis) : [];
  cards.forEach((c) => { const cs = getComputedStyle(c); const ps = [...c.querySelectorAll('p')].filter((x) => vis(x) && x.textContent.trim()); if (!ps.length) return;
    const cr = c.getBoundingClientRect(); const rects = ps.map((p) => p.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    res.cards.push({ h: cr.height, top: rects[0].top - cr.top, bottom: cr.bottom - rects[rects.length - 1].bottom, inner: rects.length > 1 ? rects[1].top - rects[0].bottom : 0, lh: parseFloat(getComputedStyle(ps[0]).lineHeight), cut: ps.some((p) => p.scrollWidth > p.clientWidth + 1) }); });
  if (cards.length > 1) { const tr = cards[0].parentElement, trr = tr.getBoundingClientRect(); const c2 = cards[1].getBoundingClientRect(); res.peek = Math.round(Math.min(trr.right, innerWidth) - c2.left); }
  const lab = (e) => (e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 24);
  const decor = [...root.querySelectorAll('hr,[class*="Gap"],[class*="gap"],[class*="divider"],[class*="Dots"],[class*="dots"]')].filter((e) => vis(e) && !(opts.cardsSel && e.closest(opts.cardsSel)));
  const flow = leaves.filter((e) => !(opts.cardsSel && e.closest(opts.cardsSel))).concat(decor, cards).map((e) => ({ r: e.getBoundingClientRect(), t: lab(e) })).filter((x) => x.r.height > 0).sort((a, b) => a.r.top - b.r.top);
  let reach = -1e9, prevT = ''; flow.forEach((x) => { if (reach > -1e9) { const g = x.r.top - reach; if (g > opts.gapMax) res.gaps.push(Math.round(g) + ' («' + prevT + '» → «' + x.t + '»)'); } if (x.r.bottom > reach) { reach = x.r.bottom; prevT = x.t; } });
  const fl = leaves.filter((e) => !(opts.cardsSel && e.closest(opts.cardsSel)) && !e.querySelector('*')).map((e) => ({ e, r: e.getBoundingClientRect() }));
  for (let a = 0; a < fl.length; a++) for (let b = a + 1; b < fl.length; b++) { const x = Math.min(fl[a].r.right, fl[b].r.right) - Math.max(fl[a].r.left, fl[b].r.left), y = Math.min(fl[a].r.bottom, fl[b].r.bottom) - Math.max(fl[a].r.top, fl[b].r.top); if (x > 4 && y > 4) { res.overlaps++; if (res.overlapWho.length < 2) res.overlapWho.push(lab(fl[a].e) + ' ⨯ ' + lab(fl[b].e)); } }
  return res; };

const applyData = (o) => { if (o.kase) o.dyn.forEach((d) => { const val = o.fx[d.cls] && o.fx[d.cls][o.kase]; if (val === undefined) return; document.querySelectorAll(d.sel).forEach((e) => { e.textContent = (d.fmt || '{n}').replace('{n}', val); }); }); (o.unhide || []).forEach((s) => document.querySelectorAll(s).forEach((e) => e.classList.remove('hidden'))); };
const measureData = (o) => { const out = []; o.dyn.forEach((d) => { document.querySelectorAll(d.sel).forEach((e) => { const cs = getComputedStyle(e); if (cs.display === 'none') return; const r = e.getBoundingClientRect(); if (!r.width) return; const p = e.parentElement.getBoundingClientRect(); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; const t = e.textContent.trim().slice(0, 18);
  if (d.noClip !== false && e.scrollWidth > e.clientWidth + 1) out.push('«' + d.cls + '» обрезано: «' + t + '»');
  if (r.right > p.right + 1 || r.left < p.left - 1) out.push('«' + d.cls + '» вылезает из своего блока: «' + t + '»');
  if (r.right > innerWidth + 1 || r.left < -1) out.push('«' + d.cls + '» за краем экрана: «' + t + '»');
  if (d.noWrap !== false && r.height > lh * 1.7) out.push('«' + d.cls + '» перенеслось на вторую строку: «' + t + '»'); }); }); return [...new Set(out)]; };
const browser = await chromium.launch(); const rows = []; let bad = 0;
const isSel = /^[#.\[]/.test(spec.screen); const rootSel = isSel ? spec.screen : '#' + spec.screen + 'Screen';
for (const sz of sizes) {
  const ctx = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 1, serviceWorkers: 'block' }); const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof setScreen === 'function', null, { timeout: 20000 });
  if (!isSel) await page.evaluate((n) => { const b = document.getElementById(n + 'Btn'); if (b) b.click(); else setScreen(n); }, spec.screen);
  await page.waitForTimeout(1200);
  for (const lang of langs) for (const kase of cases) {
    await page.evaluate(applyLang, { rootSel, textSel: spec.textSel || '', lang });
    await page.evaluate(applyData, { kase, dyn, fx, unhide: spec.unhide || [] });
    if (spec.refit) await page.evaluate((fn) => { try { (0, eval)(fn.includes('(') ? fn : fn + '()'); } catch (e) { window.__refitErr = String(e); } }, spec.refit);
    await page.waitForTimeout(150);
    const m = await page.evaluate(measure, { rootSel, cardsSel: spec.cards || '', gapMax: C.blockGapMax });
    if (m.err) { rows.push({ sz, lang, kase, fail: [m.err], info: {} }); bad++; continue; }
    const fail = [], info = {};
    if (m.overflow > C.overflowX) fail.push('вылезает/обрезано по ширине ' + m.overflow + ' шт. («' + m.overflowWho.join('», «') + '»)');
    if (m.cards.length) {
      const hs = m.cards.map((c) => c.h), spread = Math.max(...hs) - Math.min(...hs); info.spread = Math.round(spread * 10) / 10;
      const minT = Math.min(...m.cards.map((c) => c.top)), minB = Math.min(...m.cards.map((c) => c.bottom)); info.extra = Math.round(Math.max(...m.cards.map((c) => Math.max(c.top - minT, c.bottom - minB))));
      const lhs = m.cards.map((c) => c.lh); info.stretch = Math.round((Math.max(...lhs) / Math.min(...lhs) - 1) * 100);
      const inn = m.cards.map((c) => c.inner); info.inner = Math.round(Math.max(...inn) - Math.min(...inn)); info.h = Math.round(Math.max(...hs));
      if (spread > C.cardHeightSpreadMax) fail.push('карточки разной высоты (разброс ' + info.spread + ' px)');
      if (info.extra > C.extraSpaceMax) fail.push('пустота внутри карточки +' + info.extra + ' px к самой плотной');
      if (info.stretch > Math.round((C.leadingStretchMax - 1) * 100)) fail.push('строки растянуты на ' + info.stretch + '%');
      if (info.inner > C.innerGapSpreadMax) fail.push('«текст → удар» разный (разброс ' + info.inner + ' px)');
      if (C.peekMin && m.peek !== undefined && m.peek < C.peekMin) fail.push('следующая карточка выглядывает ' + m.peek + ' px < ' + C.peekMin);
      if (m.cards.some((c) => c.cut)) fail.push('текст карточки обрезан по ширине');
    }
    if (m.gaps.length) fail.push('пустой промежуток между блоками: ' + m.gaps.join('; '));
    if (m.overlaps > C.overlaps) fail.push('наложения: ' + m.overlapWho.join(' | '));
    if (dyn.length) (await page.evaluate(measureData, { dyn })).forEach((x) => fail.push('данные: ' + x));
    if (lang.limit) { rows.push({ sz, lang, kase, fail: [], warn: fail, info }); continue; } // «предел устойчивости»: показываем, но не считаем провалом (это крайний случай, а не реальный язык)
    rows.push({ sz, lang, kase, fail, info }); bad += fail.length;
  }
  await ctx.close();
}
await browser.close(); srv.close();

console.log('\nЭкран «' + spec.screen + '»: матрица ' + sizes.length + ' размера × ' + langs.length + ' языков' + (dyn.length ? ' × ' + cases.length + ' набора данных' : '') + '\n');
console.log('размер    язык | данные                                высота  разброс  пусто+  растяжение  удар-разброс  итог');
rows.forEach((r) => { const i = r.info || {}; console.log((r.sz.w + '×' + r.sz.h).padEnd(9) + ' ' + (r.lang.name + (r.kase ? ' | ' + r.kase : '')).padEnd(42) + ' ' + String(i.h ?? '—').padEnd(7) + ' ' + String(i.spread ?? '—').padEnd(8) + ' ' + String(i.extra ?? '—').padEnd(7) + ' ' + (i.stretch !== undefined ? i.stretch + '%' : '—').padEnd(11) + ' ' + String(i.inner ?? '—').padEnd(13) + ' ' + (r.fail.length ? '❌ ' + r.fail.length : (r.warn && r.warn.length ? '⚠ предел: ' + r.warn.length : '✅'))); });
const failing = rows.filter((r) => r.fail.length);
const warns = rows.filter((r) => r.warn && r.warn.length); if (warns.length) { console.log('\nПредел устойчивости (информация, не провал):'); warns.forEach((r) => r.warn.forEach((f) => console.log('  • ' + r.sz.w + '×' + r.sz.h + ', ' + r.lang.name + ': ' + f))); }
if (failing.length) { console.log('\nЧто не держится:'); failing.forEach((r) => r.fail.forEach((f) => console.log('  • ' + r.sz.w + '×' + r.sz.h + ', ' + r.lang.name + (r.kase ? ', данные «' + r.kase + '»' : '') + ': ' + f))); }
console.log('\n' + (bad ? '❌ требований не держится: ' + bad : '✅ все требования держатся на всех сочетаниях'));
process.exit(bad ? 1 : 0);
