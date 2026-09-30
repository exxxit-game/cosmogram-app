// Снимки настоящей игры: экран итогов на самом тяжёлом реалистичном случае, по режимам (360×800, русский).
// Берёт готовые сценарии из tools/ (только читает их текст), сам ничего в игре не меняет.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const ROOT = 'C:/Users/admin/Documents/GitHub/cosmogram-app';
const OUT = process.argv[2]; const IDS = process.argv[3].split(','); const VH = +(process.argv[4] || 800);
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, 'tools/worst-case.mjs'), 'utf8');
const grab = (name) => { const i = src.indexOf("const " + name + " = `"); if (i < 0) throw new Error("нет " + name); const a = i + ("const " + name + " = `").length; const b = src.indexOf("`;", a); return new Function("return `" + src.slice(a, b) + "`")(); };
const AUDIT_SRC = grab('AUDIT_SRC'), ROW_AUDIT_SRC = grab('ROW_AUDIT_SRC'), SETUP_SRC = grab('SETUP_SRC');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/worst-case-fixtures.json'), 'utf8')).heavy;
const req = createRequire(import.meta.url);
const chromium = req(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', mime[path.extname(f).toLowerCase()] || 'application/octet-stream'); fs.createReadStream(f).pipe(s); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const port = srv.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: VH }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof GAME_VERSION !== 'undefined' && typeof startGame === 'function', null, { timeout: 20000 });
await page.evaluate(`(${SETUP_SRC})(${JSON.stringify({ H, lang: 'ru', AUDIT_SRC, ROW_AUDIT_SRC })})`);
const PATCH = process.argv[5] ? fs.readFileSync(process.argv[5], "utf8") : ""; const DUMP = process.argv[6];
for (const id of IDS) {
  const r = await page.evaluate((x) => window.__wc.run(x), id);
  if (DUMP) console.log(await page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.outerHTML.slice(0, 900)).join(" ||| "), DUMP));
  if (PATCH) { const rr = await page.evaluate(PATCH); if (rr) console.log(rr); await page.waitForTimeout(500); }
  await page.screenshot({ path: path.join(OUT, id + '_' + VH + (PATCH ? '_new' : '') + '.png') });
  console.log(id, r.v.length ? 'НАРУШЕНИЯ: ' + r.v.join(' | ') : 'без нарушений', r.tight ? '(тесно, прокрутка)' : '');
}
await browser.close(); srv.close();
