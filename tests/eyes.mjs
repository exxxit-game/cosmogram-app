/* ============================================================
   ГЛАЗА КОСМОГРАММЫ

   Зачем: стражи доказывают, что код делает то, что описано в страже. Они не
   доказывают, что игрок это УВИДИТ. Между «зелёный стенд» и «человек смотрит на
   экран» помещается целый класс бед: спрайт в DPR раз крупнее кадра, счёт под
   рамкой мессенджера, подпись за краем экрана, чёрное небо после потери контекста.
   Каждая из них в этом проекте уже случалась, и ни одну не поймал стенд.

   Что делает: поднимает статический сервер над папкой игры, открывает НАСТОЯЩИЙ
   index.html в настоящем Chromium и снимает игру на трёх устройствах — эталонном
   телефоне, планшете и ноутбуке. Планшет тут не для полноты: «метр неба» (SC) на
   нём заведомо не единица, а каждое умножение на масштаб — место возможной ошибки,
   невидимой на эталоне. Ноутбук — чтобы своими глазами видеть «коридор чести».

   Прибор НИЧЕГО не проверяет и не выносит вердикта. Он приносит кадры. Смотреть —
   человеку: снимок, на который не посмотрели, ничем не отличается от неснятого.

   Запуск:  node tests/eyes.mjs
   Кадры:   tests/shots/<устройство>/<сцена>.png
   Витрина: tests/shots/index.html — открыть в браузере, все кадры на одной странице

   Отправка наружу на стенде запечатана сама: isLabEnv() видит localhost и глушит
   и «Почту неба», и таблицу рекордов. Ни одно письмо и ни один рекорд отсюда
   в боевую базу не уйдёт.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

/* Playwright берём из глобальной установки — тем же способом, что и стенд стражей:
   в папке игры не должно заводиться node_modules, она остаётся папкой со статикой. */
const chromium = (()=>{
  const req = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(execSync('npm root -g',{encoding:'utf8'}).trim()); } catch(e){}
  tries.push('/opt/node-tools/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules');
  for(const base of tries){
    try { return req(path.join(base,'playwright')).chromium; } catch(e){}
  }
  try { return req('playwright').chromium; } catch(e){}
  console.error('\n❌ Не найден playwright. Поставь: npm i -g playwright\n');
  process.exit(2);
})();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.woff2':'font/woff2', '.png':'image/png',
  '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml' };

function serve(){
  return new Promise(res=>{
    const s = http.createServer((req,rep)=>{
      const u = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if(!f.startsWith(ROOT)) { rep.writeHead(403); return rep.end(); }
      fs.readFile(f,(e,d)=>{
        if(e){ rep.writeHead(404); return rep.end('404'); }
        rep.writeHead(200,{'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
        rep.end(d);
      });
    });
    s.listen(0,'127.0.0.1',()=>res(s));
  });
}

/* Три устройства. Эталон — 390×844: на нём SC=1 и масштаб ничего не искажает,
   поэтому беда, живущая в умножении на масштаб, тут как раз НЕ видна. Планшет и
   ноутбук нужны именно за этим. */
const DEVICES = [
  { id:'telefon',  nazvanie:'Телефон (эталон 390×844, dpr 3)', w:390,  h:844,  dpr:3 },
  { id:'planshet', nazvanie:'Планшет (834×1112, dpr 2) — масштаб не единица', w:834, h:1112, dpr:2 },
  { id:'noutbuk',  nazvanie:'Ноутбук (1440×900, dpr 2) — виден коридор чести', w:1440, h:900, dpr:2 },
];

/* Сцены. Каждая — то, что игрок реально видит, а не внутреннее состояние.
   Драйвер зовёт те же функции, что и кнопки игры; если сцена не открылась,
   прибор не падает, а честно говорит, какой кадр не снят. */
const SCENES = [
  { id:'nebo', nazvanie:'Небо (полёт)', letit:2600, go:null },
  { id:'menu', nazvanie:'Меню', go:()=>{ if(typeof toMenu==='function') toMenu(); else setScreen('menu'); } },
  { id:'rezhimy', nazvanie:'Режимы', go:()=>{ if(typeof modesFill==='function') modesFill(); setScreen('modes'); } },
  { id:'nastroyki', nazvanie:'Настройки', go:()=>{ if(typeof openSettings==='function') openSettings('menu'); else setScreen('settings'); } },
  { id:'angar', nazvanie:'Ангар', go:()=>{ setScreen('hangar'); } },
  { id:'itogi', nazvanie:'Итоги забега', letit:1500, go:()=>{ if(typeof gameOver==='function') gameOver(); } },
  /* Группы настроек — спойлеры, и по умолчанию закрыты. Снимок закрытой группы
     доказывает только то, что группа закрыта: всё, что мы туда кладём, остаётся
     невидимым для прибора. Поэтому отдельная сцена, где группа раскрыта. */
  { id:'nastroyki-igra', nazvanie:'Настройки → Игра и экран (раскрыто)', go:()=>{
      if(typeof openSettings==='function') openSettings('menu'); else setScreen('settings');
      const g=document.getElementById('setGrpGame'); if(g) g.click();
  } },
];

const otchet = [];

async function snyat(browser, dev, port){
  const dir = path.join(SHOTS, dev.id);
  fs.mkdirSync(dir, { recursive:true });
  for(const sc of SCENES){
    const ctx = await browser.newContext({ viewport:{width:dev.w, height:dev.h}, deviceScaleFactor:dev.dpr });
    const page = await ctx.newPage();
    let beda = '';
    try{
      /* Чистая установка на каждый кадр: сцена не должна зависеть от того, что
         накопила предыдущая. Иначе «Итоги» покажут чужой забег, а «Меню» — чужие
         тосты, и мы будем смотреть на историю прибора, а не на игру. */
      await page.addInitScript(()=>{ try{ localStorage.clear(); }catch(e){} });
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(()=>window.__gameUp===1, null, { timeout:15000 });
      if(sc.letit) await page.waitForTimeout(sc.letit);   // дать небу наполниться
      if(sc.go)    await page.evaluate(sc.go);
      await page.waitForTimeout(500);                      // дорисовать кадр после перехода
      await page.screenshot({ path: path.join(dir, sc.id + '.png') });
    }catch(e){ beda = e.message.split('\n')[0]; }
    finally{ await ctx.close(); }
    otchet.push({ dev:dev.id, devName:dev.nazvanie, scene:sc.id, sceneName:sc.nazvanie, beda });
    console.log(`  ${beda?'❌':'📷'} ${dev.id}/${sc.id}${beda?' — '+beda:''}`);
  }
}

/* Витрина: одна страница со всеми кадрами. Смысл прибора в том, чтобы на снимки
   ПОСМОТРЕЛИ, а шесть кадров на трёх устройствах по папкам никто смотреть не станет. */
function vitrina(){
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let h = `<!doctype html><meta charset="utf-8"><title>Глаза Космограммы</title>
<style>body{margin:0;background:#0b0f1c;color:#dbe6ff;font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px} .sub{opacity:.55;margin-bottom:24px}
h2{font-size:16px;margin:28px 0 10px;font-weight:600}
.row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0;background:#121a2e;border-radius:10px;padding:10px;max-width:300px}
img{width:100%;display:block;border-radius:6px;background:#000}
figcaption{opacity:.7;margin-top:8px;font-size:12px}
.bad{color:#ff9fb0}</style>
<h1>Глаза Космограммы</h1>
<div class="sub">Снято ${esc(new Date().toISOString().slice(0,16).replace('T',' '))} UTC · прибор не выносит вердикта, смотреть человеку</div>`;
  for(const dev of DEVICES){
    h += `\n<h2>${esc(dev.nazvanie)}</h2>\n<div class="row">`;
    for(const sc of SCENES){
      const rec = otchet.find(r=>r.dev===dev.id && r.scene===sc.id);
      h += rec && rec.beda
        ? `<figure><figcaption class="bad">${esc(sc.nazvanie)} — не снято: ${esc(rec.beda)}</figcaption></figure>`
        : `<figure><img src="${dev.id}/${sc.id}.png" alt="${esc(sc.nazvanie)}"><figcaption>${esc(sc.nazvanie)}</figcaption></figure>`;
    }
    h += `\n</div>`;
  }
  fs.writeFileSync(path.join(SHOTS,'index.html'), h);
}

const server = await serve();
const PORT = server.address().port;
fs.mkdirSync(SHOTS, { recursive:true });
console.log(`\nГЛАЗА КОСМОГРАММЫ\nборт: http://127.0.0.1:${PORT}/index.html\n`);

const browser = await chromium.launch({ args:['--no-sandbox','--mute-audio'] });
for(const dev of DEVICES){
  console.log(dev.nazvanie);
  await snyat(browser, dev, PORT);
}
await browser.close(); server.close();

vitrina();
const bed = otchet.filter(r=>r.beda).length;
console.log(`\n${bed ? `⚠️  не снято кадров: ${bed} из ${otchet.length}` : `✅ снято ${otchet.length} кадров`}`);
console.log(`Витрина: tests/shots/index.html — открой её и ПОСМОТРИ. Снимок, на который не посмотрели, ничем не отличается от неснятого.\n`);
process.exit(0);
