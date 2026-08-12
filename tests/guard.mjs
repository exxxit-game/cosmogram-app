/* ============================================================
   СТРАЖИ КОСМОГРАММЫ — стенд партии «Пожар» (v1.282.13)

   Зачем: дисциплина проекта требует ставить стража ПЕРЕД тем, как
   идти в комнату с молотком. Здесь — по одному стражу на каждую
   систему, которую правит партия «Пожар», и ни одного лишнего:
   пустые комнаты не охраняем.

   Как работает: поднимает статический сервер над папкой игры и
   открывает НАСТОЯЩИЙ index.html в настоящем Chromium (Playwright).
   Это не разбор исходников — игра реально загружается и реально
   зовётся gameOver(). Поэтому страж ловит и то, чего в тексте кода
   не видно.

   Запуск:  node tests/guard.mjs
   Ответ:   код 0 — все стражи на посту; код 1 — кто-то пропустил беду.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

/* Playwright берём из глобальной установки — чтобы в папке игры не заводилось
   node_modules и package.json: игра остаётся папкой со статикой, как и была. */
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

/* ---------- рапорт ---------- */
const report = [];
let failed = 0;
function post(name, ok, detail){
  report.push({name, ok, detail});
  if(!ok) failed++;
  console.log(`${ok?'  ✅':'  ❌'} ${name}${detail?`\n       ${String(detail).replace(/\n/g,'\n       ')}`:''}`);
}

/* Страница с уже загруженной игрой. cdn:'block' — рвём сторонние
   CDN, как это делает недоступная сеть у игрока. */
async function openGame(browser, {cdn='block', init=null, timeout=15000}={}){
  const ctx = await browser.newContext({ viewport:{width:412,height:915}, deviceScaleFactor:3 });
  const page = await ctx.newPage();
  const thirdParty = /sentry-cdn\.com|cdn\.amplitude\.com|telegram\.org\/js|discord\.com/;
  await page.route('**/*', route=>{
    const url = route.request().url();
    if(thirdParty.test(url)){
      if(cdn==='block') return route.abort('connectionfailed');
      if(cdn==='hang')  return new Promise(()=>{});      // висит вечно — «полусеть»
    }
    if(/supabase\.co/.test(url)) return route.fulfill({status:200, contentType:'application/json', body:'{"ok":true}'});
    return route.continue();
  });
  // печать лаборатории снимаем: иначе sync молчит и стража нечем кормить
  await page.addInitScript(()=>{ window.__labOpen = true; window.__beaconLab = true; });
  if(init) await page.addInitScript(init);
  await page.goto(BASE, { waitUntil:'domcontentloaded', timeout });
  await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined' && typeof startGame==='function', null, { timeout });
  return { ctx, page };
}

/* Подготовка чистого борта: пустое хранилище + вход, чтобы sync был «доступен». */
const FRESH = ()=>{ try{ localStorage.clear(); }catch(e){} };

let BASE = '';

/* ============================================================
   СТРАЖИ
   ============================================================ */

/* Страж 0 — ОБЩИЙ: игра просто работает и не сорит ошибками.
   Стоит перед всеми и переживает все партии. Его дело — не какой-то
   один баг, а правило «не создавать новых»: любая правка, которая
   уронит загрузку, взлёт, паузу или посадку, спотыкается здесь. */
async function guardNothingBroken(browser){
  const name = '0. Общий: игра работает, консоль чистая (страж от новых поломок)';
  let ctx;
  try{
    const o = await openGame(browser, { cdn:'block', init:FRESH });
    ctx = o.ctx;
    const errs = [];
    o.page.on('console', m=>{ if(m.type()==='error'){ const t=m.text();
      if(!/net::ERR|Failed to load resource|sentry|amplitude/i.test(t)) errs.push('консоль: '+t); } });
    o.page.on('pageerror', e=>errs.push('исключение: '+e.message));
    const st = await o.page.evaluate(async ()=>{
      const seen = { steps:[] };
      const step = (s,f)=>{ try{ f(); seen.steps.push(s); }catch(e){ seen.steps.push(s+' ✗ '+e.message); } };
      step('взлёт классики', ()=>{ runMode='classic'; startGame(); });
      step('пауза',          ()=>pauseGame());
      step('снятие паузы',   ()=>resumeGame());
      step('посадка',        ()=>{ S.score=1200; S.smooth=.9; S.dist=300; gameOver(); });
      step('меню',           ()=>toMenu());
      step('взлёт своей трассы', ()=>{ runMode='custom'; startGame(); });
      step('финиш трассы',   ()=>{ S.mapWin=1; S.score=800; gameOver(); });
      step('взлёт трассы дня',()=>{ runMode='daily'; startGame(); });
      step('уход в меню',    ()=>toMenu());
      await new Promise(r=>setTimeout(r,250));
      seen.version = typeof GAME_VERSION!=='undefined' ? GAME_VERSION : null;
      return seen;
    });
    await o.page.waitForTimeout(250);
    const broke = st.steps.filter(s=>s.includes('✗'));
    if(broke.length) return post(name,false,broke.join('\n'));
    if(errs.length)  return post(name,false,errs.slice(0,6).join('\n'));
    post(name,true,`версия ${st.version}; пройдено без единой ошибки: ${st.steps.length} шагов (взлёт → пауза → посадка → меню → своя трасса → трасса дня)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 1 — Игра грузится, даже когда Sentry и Amplitude недоступны.
   Стережёт: index.html, подключение сторонних наблюдателей.
   Беда, которую ловит: render-blocking <script> у стороннего CDN
   запирает парсер — спиннер крутится, игры нет. */
async function guardBootWithoutCdn(browser){
  const name = '1. Загрузка переживает недоступный Sentry/Amplitude';
  let ctx;
  try{
    const o = await openGame(browser, { cdn:'hang', init:FRESH, timeout:12000 });
    ctx = o.ctx;
    const st = await o.page.evaluate(()=>({
      boot: !document.getElementById('bootLoad'),
      canvas: !!document.getElementById('game'),
      ver: typeof GAME_VERSION!=='undefined' ? GAME_VERSION : null,
      screens: typeof setScreen==='function',
    }));
    if(!st.ver) return post(name,false,'GAME_VERSION не определён — скрипты игры не исполнились');
    if(!st.canvas) return post(name,false,'канвас не создан');
    if(!st.boot) return post(name,false,'спиннер #bootLoad не снят — загрузка не завершилась');
    post(name,true,`версия ${st.ver}, канвас есть, спиннер снят`);
  }catch(e){
    post(name,false,`страница не догрузилась за отведённое время: ${e.message.split('\n')[0]}`);
  }finally{ if(ctx) await ctx.close(); }
}

/* Страж 2 — Призрак рекорда уходит на сервер ПОСЛЕ того, как рекорд записан.
   Стережёт: хвост gameOver() в ui.js.
   Беда, которую ловит: syncGhostUp летит параллельно с syncSubmit,
   сервер отвечает 403 unverified — призрак рекордного забега теряется. */
async function guardGhostAfterSubmit(browser){
  const name = '2. Призрак уходит после записи рекорда, а не параллельно';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('tgWebAuth',{id:1,hash:'x',first_name:'T'});   // вход есть → sync доступен
      ['bestGyro','bestTouch','bestBullet','bestDist','bestKeys'].forEach(k=>Store.set(k,0));
      Store.set('shareGhost',1);
      const order=[]; let releaseSubmit;
      const submitDone = new Promise(res=>releaseSubmit=res);
      window.syncSubmit  = ()=>{ order.push('submit:start'); return submitDone.then(()=>order.push('submit:done')); };
      window.syncGhostUp = ()=>{ order.push('ghost'); return Promise.resolve(true); };
      window.syncTop     = ()=>{ order.push('top'); return Promise.resolve(null); };
      window.syncDailySubmit = ()=>Promise.resolve(null);

      startGame();
      rec.length=0; for(let i=0;i<40;i++) rec.push([i%91,i%40,i*3]);  // лента для призрака
      S.score=5000; S.smooth=1; S.dist=900; S.mode='classic'; S.gyroSec=10;
      gameOver();
      await new Promise(r=>setTimeout(r,60));
      const beforeRelease = order.slice();
      releaseSubmit();
      await new Promise(r=>setTimeout(r,120));
      return { order, beforeRelease };
    });
    const ghostEarly = r.beforeRelease.includes('ghost');
    const ghostAtAll = r.order.includes('ghost');
    if(!ghostAtAll) return post(name,false,`призрак не ушёл вообще. Порядок: [${r.order.join(' → ')}]`);
    if(ghostEarly)  return post(name,false,`призрак ушёл ДО ответа сервера на submit — сервер отобьёт 403.\nПорядок до ответа: [${r.beforeRelease.join(' → ')}]`);
    post(name,true,`порядок верный: [${r.order.join(' → ')}]`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 3 — Финиш «Своей трассы» стирает автосейв.
   Стережёт: ранний выход custom в gameOver() (ui.js).
   Беда: savedRun переживает финиш, при следующем запуске очки
   самодельной карты восстанавливаются УЖЕ КАК КЛАССИКА — идут в
   общий рекорд и в кошелёк. */
async function guardCustomFinishClearsSave(browser){
  const name = '3. Финиш «Своей трассы» не оставляет автосейв';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      runMode='custom'; startGame();
      S.score=4000; S.smooth=1; S.dist=500; S.mapWin=1;
      autosave();                                   // пауза на трассе — автосейв записан
      const savedBefore = !!Store.get('savedRun',null);
      gameOver();                                   // долетел
      await new Promise(r=>setTimeout(r,50));
      return { savedBefore, savedAfter: !!Store.get('savedRun',null) };
    });
    if(!r.savedBefore) return post(name,false,'автосейв не записался — сценарий не воспроизведён, страж слеп');
    if(r.savedAfter)   return post(name,false,'savedRun пережил финиш своей трассы → очки уйдут в общий рекорд и кошелёк');
    post(name,true,'автосейв стёрт на финише');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 4 — Уход в меню с Трассы дня стирает автосейв.
   Стережёт: ветку daily в toMenu() (ui.js).
   Беда: «одна попытка» обходится — при следующем запуске bootFly
   возвращает игрока в тот же прыжок с сохранённым прогрессом. */
async function guardDailyMenuClearsSave(browser){
  const name = '4. Уход в меню с Трассы дня не оставляет автосейв';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      runMode='daily'; startGame();
      S.score=3000; S.smooth=1; S.dist=400;
      autosave();
      const savedBefore = !!Store.get('savedRun',null);
      toMenu();                                     // сошёл с трамплина
      await new Promise(r=>setTimeout(r,50));
      const dr = Store.get('dailyRun',null);
      return { savedBefore, savedAfter: !!Store.get('savedRun',null), done: !!(dr&&dr.done) };
    });
    if(!r.savedBefore) return post(name,false,'автосейв не записался — сценарий не воспроизведён, страж слеп');
    if(!r.done)        return post(name,false,'попытка дня не закрылась — сценарий не тот');
    if(r.savedAfter)   return post(name,false,'savedRun пережил уход в меню → «одна попытка» обходится перезапуском');
    post(name,true,'попытка закрыта, автосейв стёрт');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 5 — Победа на трассе не записывается в Мозг неба как смерть.
   Стережёт: Adaptive.onDeath в gameOver() (ui.js) + adaptive.js.
   Беда: прошёл трассу до конца — получил +1 смерть и подкрутку
   сложности под препятствие, о которое не разбивался. */
async function guardWinIsNotDeath(browser){
  const name = '5. Победа на трассе не учитывается как смерть';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.del('adaptiveProfile');
      runMode='custom'; startGame();
      S.score=4000; S.smooth=1; S.time=30; S.mapWin=1; S.lastHitKind='';
      gameOver();
      await new Promise(r=>setTimeout(r,50));
      const win = Adaptive.profile();
      // контроль: настоящая гибель обязана считаться
      Store.del('adaptiveProfile');
      runMode='custom'; startGame();
      S.score=100; S.smooth=1; S.time=5; S.mapWin=0; S.lastHitKind='rock';
      gameOver();
      await new Promise(r=>setTimeout(r,50));
      return { winRuns: win.runs|0, winKinds: Object.keys(win.deathsByKind||{}), deathRuns: Adaptive.profile().runs|0 };
    });
    if(r.deathRuns!==1) return post(name,false,`настоящая гибель не засчиталась (runs=${r.deathRuns}) — страж смотрит не туда`);
    if(r.winRuns!==0)   return post(name,false,`победа записана как смерть: runs=${r.winRuns}, причины=[${r.winKinds.join(',')}]`);
    post(name,true,'победа не считается, гибель считается');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 6 — Битый профиль Мозга неба не роняет взлёт.
   Стережёт: Adaptive.profile()/mult() (adaptive.js).
   Беда: профиль без deathsByKind (частичная запись, облако Telegram,
   версионный скос) → TypeError прямо из startGame → взлёта нет. */
async function guardBrokenProfileSurvives(browser){
  const name = '6. Битый профиль Мозга неба не роняет взлёт';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const bad = [ {runs:5}, {avgSurvival:'нет', deathsByKind:null, runs:'три'},
                    {deathsByKind:'rock', runs:2}, [], 'мусор', {avgSurvival:NaN,deathsByKind:{},runs:NaN} ];
      const bruises=[];
      for(const b of bad){
        Store.set('adaptiveProfile', b);
        try{
          const m = Adaptive.mult();
          if(!m || !isFinite(m.d) || !isFinite(m.s)) bruises.push(`${JSON.stringify(b)} → множитель ${JSON.stringify(m)}`);
          runMode='custom'; startGame();            // настоящий взлёт на битом профиле
        }catch(e){ bruises.push(`${JSON.stringify(b)} → ${e.message}`); }
      }
      return bruises;
    });
    if(r.length) return post(name,false,`битый профиль ломает взлёт или даёт негодный множитель:\n${r.join('\n')}`);
    post(name,true,'шесть видов битого профиля пережиты, множитель всегда конечный');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 7 — Причина гибели не течёт из прошлого забега в следующий.
   Стережёт: сброс состояния в startGame() (ui.js).
   Беда: S.lastHitKind не обнуляется — забег без удара наследует
   препятствие прошлого и подкручивает сложность под то, чего не было. */
async function guardLastHitKindReset(browser){
  const name = '7. Причина гибели не течёт между забегами';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      startGame(); S.lastHitKind='rock';
      startGame();                                  // новый забег — стол должен быть чист
      return { after: S.lastHitKind };
    });
    if(r.after) return post(name,false,`новый забег стартовал с причиной гибели «${r.after}» из прошлого`);
    post(name,true,'новый забег стартует без причины гибели');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 2 — визуал и UI
   ============================================================ */

/* Страж 8 — Виньетка накрывает ровно кадр, не больше.
   Стережёт: render.js, отрисовку затемнения краёв.
   Беда: спрайт сделан в НАСТОЯЩИХ пикселях (W*DPR), а рисуется без
   размеров назначения поверх трансформа DPR*SC — на телефоне с DPR 2-3
   затемнение уезжает за экран, глубины кадра нет. На десктопе DPR=1,
   поэтому глазами на верстаке беда не видна. */
async function guardVignetteFitsFrame(browser){
  const name = '8. Виньетка накрывает ровно кадр (а не в DPR раз больше)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });   // контекст создан с deviceScaleFactor:3
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Q.level = 3;                                        // высокая ступень: виньетка рисуется только в hq
      runMode='classic'; startGame();
      const sprite = vignetteSprite();
      const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
      let seen = null;
      proto.drawImage = function(img, ...a){ if(img===sprite) seen = a.slice(); return orig.apply(this, [img, ...a]); };
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      proto.drawImage = orig;
      return { seen, W, H, DPR, spriteW: sprite.width, spriteH: sprite.height };
    });
    if(!r.seen) return post(name,false,'виньетка не нарисовалась за два кадра — страж не смог посмотреть (проверь Q.level/hq)');
    if(r.seen.length < 4)
      return post(name,false,`нарисована без размеров назначения (${r.seen.length} арг.) — спрайт ${r.spriteW}×${r.spriteH} ляжет поверх трансформа DPR=${r.DPR} и выйдет за кадр ${r.W}×${r.H}`);
    const [,,dw,dh] = r.seen;
    if(Math.abs(dw-r.W)>1 || Math.abs(dh-r.H)>1)
      return post(name,false,`размер назначения ${dw}×${dh} не равен кадру ${r.W}×${r.H}`);
    post(name,true,`кадр ${r.W}×${r.H} при DPR=${r.DPR}, спрайт ${r.spriteW}×${r.spriteH} посажен на ${dw}×${dh}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 9 — Салют золотой звезды имеет живой цвет на любом экране.
   Стережёт: burst() в game.js.
   Беда: на флагманах с широким охватом цвет приходит строкой
   color(display-p3 …). burst считал «не rgba — значит hex», резал её
   как hex и получал rgba(NaN,NaN,NaN,) — canvas молча игнорирует
   негодный цвет и рисует предыдущим. */
/* Страж 101 — Всплывающий текст на канвасе всегда заглавный, как и весь остальной текст игры.
   Стережёт: showPopup() в game.js и отрисовку имени призрака в render.js.
   Беда: CSS-правило text-transform:uppercase на html,body не действует на канвас вообще —
   всплывающие очки/подписи («впритык», «щит» и т.п.) рисуются ровно так, как записаны
   в словаре L.xxx, минуя правило заглавных букв, принятое для всей остальной игры. */
async function guardPopupTextIsUppercase(browser){
  const name = '101. Всплывающий текст на канвасе заглавный';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      popups.length = 0;
      showPopup('щит sHield', 10, 10, '#7fd8ff'); // смешанный регистр — честная проверка, не совпадение с уже верхним
      const got = popups.length ? popups[popups.length-1].txt : null;
      return { got };
    });
    if(r.got==null) return post(name,false,'showPopup не создал всплывающий текст — страж не смог проверить регистр');
    if(r.got !== r.got.toUpperCase()) return post(name,false,`showPopup вернул «${r.got}» — не заглавный, хотя весь текст игры заглавный`);
    post(name,true,`showPopup отдаёт «${r.got}» — заглавный, как и остальной текст игры`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

async function guardBurstColorValid(browser){
  const name = '9. Салют звезды даёт годный цвет (и sRGB, и P3)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const probe = document.createElement('canvas').getContext('2d');
      const check = (input)=>{
        particles.length = 0;
        burst(50, 50, input, 2);
        const raw = particles.length ? particles[particles.length-1].color : null;
        if(raw == null) return { input, ok:false, why:'частица не родилась' };
        if(/NaN/.test(raw)) return { input, raw, ok:false, why:'в цвете NaN' };
        const full = raw + '0.9)';
        probe.fillStyle = '#000000'; probe.fillStyle = full;      // негодный цвет оставит #000000
        const applied = probe.fillStyle;
        return { input, raw, full, applied, ok: applied !== '#000000' };
      };
      return [ check('#ffd76a'), check('color(display-p3 1 .86 .44)'), check('rgba(255,215,106,') ];
    });
    const bad = r.filter(x=>!x.ok);
    if(bad.length) return post(name,false, bad.map(b=>`${b.input} → «${b.full||b.raw}» ${b.why||'не принят canvas'}`).join('\n'));
    post(name,true, r.map(x=>`${x.input.slice(0,22)} ✓`).join('  ·  '));
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 10 — Возврат из свёрнутого не включает звук на полную, если игра на паузе.
   Стережёт: слушатели visibilitychange в ui.js.
   Беда: их два, и второй безусловно снимает приглушение — игрок
   разворачивает приложение и слышит музыку и двигатель во весь голос
   на экране паузы. */
async function guardDuckSurvivesPause(browser){
  const name = '10. Возврат из свёрнутого не будит звук на паузе';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      let hid = false;
      Object.defineProperty(document, 'hidden', { configurable:true, get:()=>hid });
      Object.defineProperty(document, 'visibilityState', { configurable:true, get:()=>hid?'hidden':'visible' });
      runMode='classic'; startGame();
      pauseGame();
      const onPause = music._ducked();
      hid = true;  document.dispatchEvent(new Event('visibilitychange'));   // свернули
      await new Promise(r=>setTimeout(r,20));
      hid = false; document.dispatchEvent(new Event('visibilitychange'));   // развернули
      await new Promise(r=>setTimeout(r,20));
      return { onPause, afterReturn: music._ducked(), paused: !!(S.paused||S.pausing) };
    });
    if(!r.onPause)  return post(name,false,'музыка не приглушилась даже на паузе — сценарий не тот');
    if(!r.paused)   return post(name,false,'игра не осталась на паузе — сценарий не тот');
    if(!r.afterReturn) return post(name,false,'после разворачивания музыка зазвучала в полный голос, хотя игра на паузе');
    post(name,true,'на паузе приглушено и после возврата остаётся приглушённым');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 11 — Тонкие слайдеры Кузницы записываются в конфиг.
   Стережёт: привязку forgeDen/forgeSpd в forge.js.
   Беда: обработчик менял только подпись, а конфиг не трогал — стоило
   тронуть другой виджет, и forgeSyncWidgets возвращал слайдер назад,
   правка автора пропадала. */
async function guardForgeSlidersPersist(browser){
  const name = '11. Слайдеры Кузницы пишутся в конфиг и не откатываются';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      forgeOpen();
      const out = [];
      for(const [id, key] of [['forgeDen','d'], ['forgeSpd','s']]){
        const el = document.getElementById(id);
        el.value = String(Math.min(+el.max || 100, (+el.value || 10) + 7));
        const target = String(el.value);   // у слайдера есть шаг — браузер округляет; правда та, что показана
        el.dispatchEvent(new Event('input'));
        const inCfg = String(forgeCfg[key]);
        forgeSyncWidgets();                       // тронули другой виджет — конфиг перерисовывает слайдеры
        out.push({ id, target, inCfg, afterSync: String(el.value) });
      }
      return out;
    });
    const bad = r.filter(x => x.inCfg !== x.target || x.afterSync !== x.target);
    if(bad.length) return post(name,false, bad.map(b=>`${b.id}: выставили ${b.target}, в конфиге ${b.inCfg}, после пересборки ${b.afterSync}`).join('\n'));
    post(name,true, r.map(x=>`${x.id}=${x.target} держится`).join('  ·  '));
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 12 — Выбор вида преград обновляет живое небо Кузницы.
   Стережёт: обработчик чипа в forge.js.
   Беда: чип менял состав, но не звал пересборку — мини-небо и подсветка
   пресета оставались от прошлого состава, хотя комментарий модуля
   обещает перерисовку «на каждый поворот ручки». */
async function guardForgeChipRepaints(browser){
  const name = '12. Чип вида преграды обновляет превью Кузницы';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      forgeOpen();
      let kicks = 0;
      const origKick = window.forgeSkyKick, origSync = window.forgeSyncWidgets;
      window.forgeSkyKick = function(){ kicks++; return origKick.apply(this, arguments); };
      window.forgeSyncWidgets = function(){ kicks++; return origSync.apply(this, arguments); };
      const chip = document.getElementById('forgeChips').children[2];
      const before = forgeCfg.e;
      chip.click();
      window.forgeSkyKick = origKick; window.forgeSyncWidgets = origSync;
      return { kicks, changed: forgeCfg.e !== before };
    });
    if(!r.changed) return post(name,false,'состав преград не изменился — сценарий не тот');
    if(!r.kicks)   return post(name,false,'состав изменился, но превью и подсветка пресета не пересобраны');
    post(name,true,`состав сменился, пересборка вызвана (${r.kicks})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 13 — Предупреждение «экран слишком узкий» видно поверх меню.
   Стережёт: слои index.html.
   Беда: у #tooNarrow тот же z-index, что у экранов, но он раньше в
   разметке и без фона — меню рисуется поверх. Момент, когда
   предупреждение нужнее всего, — как раз тот, когда его не видно. */
async function guardTooNarrowOnTop(browser){
  const name = '13. «Экран слишком узкий» видно поверх меню';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      setScreen('menu');
      const warn = document.getElementById('tooNarrow');
      warn.classList.remove('hidden');
      // у экранов есть переход прозрачности .3s, и во время него уходящее окно ещё
      // ловит нажатия — ждём, пока слои улягутся, иначе страж выходит плавающим
      await new Promise(r=>setTimeout(r,450));
      await new Promise(r=>requestAnimationFrame(r));
      const top = document.elementFromPoint(innerWidth/2, innerHeight/2);
      const inWarn = !!(top && (top===warn || warn.contains(top)));
      const chain = []; for(let n=top; n && n!==document.body; n=n.parentElement) chain.push(n.id||n.className||n.tagName);
      const cs = getComputedStyle(warn);
      return { inWarn, topId: chain.join(' ← ') || null, z: cs.zIndex, bg: cs.backgroundColor };
    });
    if(!r.inWarn) return post(name,false,`в центре экрана поверх предупреждения лежит «${r.topId}» (z-index предупреждения ${r.z}, фон ${r.bg})`);
    post(name,true,`предупреждение сверху (z-index ${r.z}, фон ${r.bg})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 3 — телеметрия и сеть
   ============================================================ */

/* Открывает игру с подставной дверкой почты неба: письма никуда не
   летят, но мы видим каждое и решаем, чем ответить. */
async function openWithMailDoor(browser, reply){
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();
  const posts = [];
  await page.route('**/*', async route=>{
    const url = route.request().url();
    if(/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(url)) return route.abort();
    if(/cosmogram-beacon/.test(url)){
      posts.push(route.request().postData());
      const r = reply ? reply(posts.length) : { status:200, body:'{"ok":true}' };
      if(r === 'hang') return new Promise(()=>{});
      return route.fulfill({ status:r.status, contentType:'application/json', body:r.body });
    }
    if(/supabase\.co/.test(url)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    return route.continue();
  });
  page.setDefaultTimeout(90000); // стенд гоняет 67 проверок подряд — короткий общий срок делает стражей плавающими
  await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof BEACON!=='undefined' && typeof GAME_VERSION!=='undefined');
  return { ctx, page, posts };
}

/* Страж 14 — Одна ошибка = одно письмо, сколько бы ни скакал fps.
   Стережёт: ключ дедупа в beacon.js.
   Беда: перчинка perfCtx (fps/качество/тир) вклеивалась в текст письма,
   а ключ дедупа режется из текста. fps меняется каждую секунду — одна
   ошибка давала десятки ключей, закон «одно письмо за сессию» не
   работал, и сервер слал разработчику «🆕 Новый тип» почти на каждое. */
async function guardDedupIgnoresFps(browser){
  const name = '14. Одна ошибка — одно письмо, даже когда fps скачет';
  let ctx;
  try{
    const o = await openWithMailDoor(browser);
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const fire=(fps)=>{ Q.fps=fps; window.dispatchEvent(new ErrorEvent('error',{
        message:'одна и та же беда', filename:'http://x/js/game.js', lineno:42, colno:7,
        error:new Error('одна и та же беда') })); };
      fire(60); fire(41); fire(23); fire(58);          // та же ошибка, разный кадровый ритм
      await new Promise(r=>setTimeout(r,80));
      return BEACON._state().seen;
    });
    if(r !== 1) return post(name,false,`четыре раза одна ошибка при разном fps дали ${r} разных ключей — дедуп не держит, письма и «новые типы» полетят пачкой`);
    post(name,true,'четыре срабатывания при fps 60/41/23/58 → один ключ');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 15 — Задушенное сервером письмо не выбрасывается.
   Стережёт: разбор ответа в beacon.js.
   Беда: сервер на «слишком часто» отвечает 200 с {quiet:true} — клиент
   считал это доставкой и удалял письмо, хотя в базе строки нет. */
async function guardQuietIsNotDelivered(browser){
  const name = '15. Письмо, задушенное антиспамом, остаётся в очереди';
  let ctx;
  try{
    const o = await openWithMailDoor(browser, ()=>({status:200, body:'{"ok":true,"quiet":true}'}));
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      BEACON.signal('страж','письмо-проверка');
      await new Promise(r=>setTimeout(r,150));
      return BEACON._state().q;
    });
    if(r < 1) return post(name,false,'письмо исчезло из очереди, хотя сервер его не принял (quiet) — телеметрия теряется молча');
    post(name,true,`письмо дождалось следующей попытки (в очереди ${r})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 16 — Битая очередь писем не роняет почту и не зацикливает её.
   Стережёт: чтение beaconQ в beacon.js.
   Беда: очередь читалась без санации (в sync.js для того же есть
   saneArray). Битое значение роняло flush внутри async → отказ уходил
   в unhandledrejection → тот же слушатель → drop → flush → круг. */
async function guardBrokenQueueSurvives(browser){
  const name = '16. Битая очередь писем не роняет почту и не зацикливает';
  let ctx;
  try{
    const o = await openWithMailDoor(browser);
    ctx = o.ctx;
    const errs = [];
    o.page.on('pageerror', e=>errs.push(e.message));
    const r = await o.page.evaluate(async ()=>{
      const bad=['мусор', {a:1}, 42, null];
      for(const b of bad){
        Store.set('beaconQ', b);
        try{ await BEACON._flush(); }catch(e){ return {crash:String(e&&e.message)}; }
      }
      Store.set('beaconQ','мусор');
      BEACON.signal('страж','после мусора');          // очередь должна ожить
      await new Promise(r=>setTimeout(r,150));
      return { crash:null, q:BEACON._state().q };
    });
    if(r.crash)   return post(name,false,`flush упал на битой очереди: ${r.crash}`);
    if(errs.length) return post(name,false,`битая очередь подняла исключение: ${errs[0]}`);
    post(name,true,'четыре вида мусора пережиты, почта продолжает работать');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 17 — Зависший сервер не убивает почту до конца сессии.
   Стережёт: таймаут отправки в beacon.js.
   Беда: fetch без поводка — при зависшем (не отказавшем) сервере await
   не разрешался, finally не отрабатывал, flushing оставался true
   навсегда, и все последующие письма молча выходили ни с чем. */
async function guardHungServerReleasesMail(browser){
  const name = '17. Зависший сервер не убивает почту навсегда';
  let ctx;
  try{
    let hang = true;
    const o = await openWithMailDoor(browser, ()=> hang ? 'hang' : ({status:200, body:'{"ok":true}'}));
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      // укорачиваем ожидание: настоящий поводок 8с, стражу столько ждать незачем
      BEACON.signal('страж','первое письмо в зависший сервер');
      await new Promise(r=>setTimeout(r,300));
      return { queuedWhileHanging: BEACON._state().q };
    });
    // Чиним сервер и ждём, пока поводок отпустит отправку. Не караулим секундомер —
    // проверяемое свойство «отпустит рано или поздно», поэтому стучимся до срока,
    // а не ровно через 8.6с: иначе страж сам становится плавающим.
    hang = false;
    const r2 = await o.page.evaluate(async ()=>{
      const deadline = Date.now() + 45000; // поводок отправки 8с, но под нагрузкой стенда бывает дольше — срок с запасом, чтобы страж не плавал
      while(Date.now() < deadline){
        await BEACON._flush();
        if(BEACON._state().q === 0) return 0;
        await new Promise(r=>setTimeout(r,250));
      }
      return BEACON._state().q;
    });
    if(r.queuedWhileHanging < 1) return post(name,false,'письмо не встало в очередь — сценарий не тот');
    if(r2 !== 0) return post(name,false,`после починки сервера очередь не разошлась (осталось ${r2}) — почта осталась запертой зависшим запросом`);
    post(name,true,'поводок отпустил отправку, после починки сервера очередь ушла');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 18 — Батч рекордов не уходит дважды.
   Стережёт: syncFlush в sync.js.
   Беда: два почти одновременных повода (посадка и мостик входа) читали
   одну очередь и слали батч дважды. Антиспам на сервере НЕ атомарен,
   поэтому оба проходят, и duel_win улетает в бота два раза. */
async function guardSyncFlushOnce(browser){
  const name = '18. Батч рекордов не отправляется дважды разом';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('tgWebAuth',{id:1,hash:'x',first_name:'T'});
      let posts=0, release;
      const gate=new Promise(res=>release=res);
      window.syncPost = (payload)=>{ if(payload && payload.action==='submit') posts++;
        return gate.then(()=>({ok:true,status:200,json:()=>Promise.resolve({ok:true})})); };
      const a=syncSubmit({gyro:100}), b=syncSubmit({gyro:100});   // два повода в один миг
      release();
      await Promise.all([a,b]); await new Promise(r=>setTimeout(r,50));
      return posts;
    });
    if(r > 1) return post(name,false,`батч ушёл ${r} раза за один миг — сервер пропустит оба, разовые поля (duel_win) сработают дважды`);
    if(r < 1) return post(name,false,'батч не ушёл вовсе — сценарий не тот');
    post(name,true,'два одновременных повода — одна отправка');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 19 — Хандра сервера не прячет кнопку Discord навсегда.
   Стережёт: кэш syncDcClientId в sync.js.
   Беда: любой не-ok ответ кэшировался как «не настроено» — одна 503
   (а сервер отдаёт именно её, когда не прочитал токен) убирала вход
   через Discord до перезагрузки страницы. */
async function guardDiscord5xxNotCached(browser){
  const name = '19. 503 от сервера не прячет вход Discord навсегда';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      let mode='fail';
      window.syncPost = ()=> Promise.resolve(mode==='fail'
        ? { ok:false, status:503, json:()=>Promise.resolve(null) }
        : { ok:true,  status:200, json:()=>Promise.resolve({ok:true, discord_client_id:'123'}) });
      const first = await syncDcClientId();      // сервер хандрит
      mode='good';
      const second = await syncDcClientId();     // сервер выздоровел
      return { first, second };
    });
    if(r.second !== '123') return post(name,false,`после выздоровления сервера кнопка не вернулась (получили ${JSON.stringify(r.second)}) — 503 закэширована как «не настроено»`);
    post(name,true,'503 не закэширована, следующий заход получил настройку');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 20 — В облако Telegram уезжает только то, что оттуда читают.
   Стережёт: Store.set в core.js (ЯДРО).
   Беда: зеркалился каждый ключ, а init читает семь. Лента самописца
   (~10-15 КБ) и очередь писем (~18 КБ) при лимите облака 4096 байт
   уезжали гарантированно впустую, и самописец дёргал это каждые 4 с. */
async function guardCloudWhitelist(browser){
  const name = '20. В облако Telegram уезжают только читаемые обратно ключи';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const sent=[];
      Store.cloud = { setItem:(k,v,cb)=>{ sent.push(k); cb&&cb(); }, removeItem:(k,cb)=>{ sent.push('-'+k); cb&&cb(); } };
      ['best','wallet','bbTape','beaconQ','adaptiveProfile','savedRun','beaconAnon'].forEach(k=>Store.set(k, k==='bbTape'?['x'.repeat(500)]:1));
      Store.cloud = null;
      return { sent, allowed: Store.CLOUD_KEYS };
    });
    const strays = r.sent.filter(k=>r.allowed.indexOf(k)<0);
    if(strays.length) return post(name,false,`в облако уехало лишнее: ${strays.join(', ')} (лимит 4096 байт на значение, обратно они не читаются)`);
    if(!r.sent.length) return post(name,false,'в облако не уехало вообще ничего — сценарий не тот');
    post(name,true,`уехали только свои: ${r.sent.join(', ')}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 21 — Переполнение хранилища не проходит молча.
   Стережёт: Store.set/_write в core.js (ЯДРО).
   Беда: всё лежит в одном ключе, и отказ записи ронял разом рекорды,
   кошелёк и очереди — а пустой catch делал это невидимым: в памяти всё
   на месте, после перезагрузки нет ничего. */
async function guardQuotaNotSilent(browser){
  const name = '21. Переполнение хранилища не проходит молча';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      Store.set('bbTape', ['лента']); Store.set('best', 777);
      const realSet = Storage.prototype.setItem;
      let full = true, signalled = null;
      const realSignal = BEACON.signal;
      BEACON.signal = (k,m)=>{ signalled = k; };
      Storage.prototype.setItem = function(k,v){
        if(k==='cosmogram_v2' && full){
          // «полно», пока в блобе есть тяжёлое; после сброса — пускаем
          if(/лента/.test(v)){ const e=new Error('quota'); e.name='QuotaExceededError'; throw e; }
        }
        return realSet.apply(this, arguments);
      };
      Store.set('wallet', 5);              // запись, которая упрётся в потолок
      Storage.prototype.setItem = realSet; BEACON.signal = realSignal;
      const raw = localStorage.getItem('cosmogram_v2') || '';
      return { signalled, shed: !/лента/.test(raw), kept: /777/.test(raw) && /"wallet":5/.test(raw) };
    });
    if(!r.shed) return post(name,false,'тяжёлое (лента самописца) не сброшено при переполнении — запись так и не прошла');
    if(!r.kept) return post(name,false,'ценное (рекорд и кошелёк) не доехало до хранилища после разгрузки');
    post(name,true,`при переполнении сброшено тяжёлое, ценное записано${r.signalled?'':' (сигнал не понадобился — разгрузка помогла)'}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 22 — Битое хранилище можно спасти, а не только потерять.
   Стережёт: Store._load в core.js (ЯДРО).
   Беда: неудачный разбор ставил пустой mem, и первая же запись
   затирала ещё восстановимую сырую строку — потеря становилась
   необратимой. */
async function guardBrokenStoreKeepsRaw(browser){
  const name = '22. Битое хранилище откладывается, а не затирается';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844} });
    ctx = ctx0;
    const page = await ctx0.newPage();
    await page.route('**/*', rt=>/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(rt.request().url())?rt.abort():
      (/supabase\.co/.test(rt.request().url())?rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}):rt.continue()));
    await page.addInitScript(()=>{ window.__labOpen=true;
      try{ localStorage.clear(); localStorage.setItem('cosmogram_v2','{это не json'); }catch(e){} });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof Store!=='undefined' && typeof GAME_VERSION!=='undefined');
    const r = await page.evaluate(()=>{
      Store.set('best', 1);                                  // первая запись поверх битого
      return { broken: localStorage.getItem('cosmogram_v2_broken'), live: localStorage.getItem('cosmogram_v2') };
    });
    if(!r.broken) return post(name,false,'сырьё битого хранилища не сохранено — данные игрока потеряны безвозвратно');
    post(name,true,`сырьё отложено в cosmogram_v2_broken («${String(r.broken).slice(0,20)}…»), игра стартовала чистой`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 23 — Открытка сессии уходит раз, а не на каждое сворачивание.
   Стережёт: sessionBeacon в beacon.js.
   Беда: в Telegram и на телефоне visibilitychange+hidden случается при
   каждом уведомлении и блокировке экрана — письмо уходило каждый раз.
   Строк в базе не прибавлялось (сервер душит), но каждая попытка стоила
   вызова функции, preflight и запроса к базе. */
async function guardSessionBeaconThrottled(browser){
  const name = '23. Открытка сессии не уходит на каждое сворачивание';
  let ctx;
  try{
    const o = await openWithMailDoor(browser);
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      let hid=false, calls=0;
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>hid});
      navigator.sendBeacon = ()=>{ calls++; return true; };
      for(let i=0;i<5;i++){ hid=true; document.dispatchEvent(new Event('visibilitychange'));
                            hid=false; document.dispatchEvent(new Event('visibilitychange')); }
      await new Promise(r=>setTimeout(r,60));
      return calls;
    });
    if(r > 1) return post(name,false,`пять сворачиваний дали ${r} открыток — каждая стоит вызова функции и запроса к базе`);
    if(r < 1) return post(name,false,'открытка сессии не ушла ни разу — сценарий не тот');
    post(name,true,'пять сворачиваний → одна открытка');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 4 — игровая логика
   ============================================================ */

/* Страж 24 — Театр без ленты не превращается в зачётный забег.
   Стережёт: ветку театра в game.js и вход в gameOver (ui.js).
   Беда: и неуязвимость зрителя, и занавес по концу ленты жили ВНУТРИ
   проверки «лента есть». Без ленты зритель становился смертным, забег
   не кончался сам, гибель шла по полному тракту посадки — писала
   статистику, near-miss-очки в рекорд категории — и съедала билет. */
async function guardTheaterNeverScores(browser){
  const name = '24. Театр без ленты не превращается в зачётный забег';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('bestTouch', 0); Store.set('bestGyro', 0);
      const before = { deaths: Stats.deaths|0, touch: Store.get('bestTouch',0)|0 };
      theaterTrack = null; theaterChamp = null;      // билет есть, ленты нет
      runMode='theater'; startGame();
      S.score = 9000; S.smooth = 1; S.dist = 700;
      gameOver();                                     // сюда зритель попасть не должен
      await new Promise(r=>setTimeout(r,80));
      return { before, deaths: Stats.deaths|0, touch: Store.get('bestTouch',0)|0, screen: screenName, mode: runMode };
    });
    if(r.deaths !== r.before.deaths) return post(name,false,`зрителю записана гибель в статистику (${r.before.deaths} → ${r.deaths})`);
    if(r.touch   !== r.before.touch)  return post(name,false,`очки зрителя ушли в рекорд категории (${r.before.touch} → ${r.touch})`);
    post(name,true,`касса молчит: статистика и рекорды не тронуты, занавес опущен (экран «${r.screen}», режим «${r.mode}»)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 25 — Выбор автора трассы сильнее волнового гейта.
   Стережёт: веса спавна в game.js.
   Беда: маска умела только гасить. Автор, собравший трассу из одних
   Ворот (гейт «волна 6+») с «Ровным жаром» и низкой стартовой жарой,
   получал небо из одних камней навсегда: волна не растёт, гейт не
   откроется, все веса нули, срабатывает страховка на камень. */
async function guardCustomKindsBeatWaveGate(browser){
  const name = '25. Выбранные автором виды преград появляются на ровном жаре';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='custom'; startGame();
      // трасса автора: только Ворота (бит 7, гейт «волна 6+») + Ловцы (бит 6, «волна 5+»)
      S.mode='custom'; S.customE=(1<<7)|(1<<6); S.customFlat=1; S.customW=1; S.mission=1;
      const kinds={};
      for(let i=0;i<400;i++){ obstacles.length=0; spawnObstacle();
        if(obstacles[0]) kinds[obstacles[0].kind]=(kinds[obstacles[0].kind]||0)+1; }
      return kinds;
    });
    const wanted = (r.gate||0)+(r.seeker||0);
    if(!wanted) return post(name,false,`за 400 спавнов не появилось ни Ворот, ни Ловцов — только ${JSON.stringify(r)}. Небо автора игнорируется полностью`);
    if(r.rock)  return post(name,false,`в небо просочился невыбранный камень: ${JSON.stringify(r)}`);
    post(name,true,`400 спавнов — только выбранное автором: ${JSON.stringify(r)}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 26 — После ворот есть обещанная передышка.
   Стережёт: возврат паузы из spawnObstacle (game.js).
   Беда: строка spawnT += .4 внутри ветки ворот была мёртвым кодом —
   вызывающий код безусловно присваивал spawnT сразу после возврата.
   Задуманная передышка не работала ни разу. */
async function guardGateGivesRoom(browser){
  const name = '26. После ворот следующая преграда встаёт не вплотную';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame(); S.mode='classic'; S.mission=9; // волна, где ворота уже летают
      let gateExtra=null, plainExtra=null;
      for(let i=0;i<400 && (gateExtra===null||plainExtra===null);i++){
        obstacles.length=0;
        const extra=spawnObstacle();
        const kind=obstacles[0] && obstacles[0].kind;
        if(kind==='gate' && gateExtra===null) gateExtra=extra;
        else if(kind && kind!=='gate' && plainExtra===null) plainExtra=extra;
      }
      return { gateExtra, plainExtra };
    });
    if(r.gateExtra===null) return post(name,false,'ворота не выпали за 400 спавнов — сценарий не тот');
    if(!(r.gateExtra>0))   return post(name,false,`ворота не дали передышки (вернули ${JSON.stringify(r.gateExtra)}) — прибавка снова теряется`);
    if(r.plainExtra)       return post(name,false,`обычная преграда тоже даёт передышку (${r.plainExtra}) — так быть не должно`);
    post(name,true,`ворота дают +${r.gateExtra}с, обычная преграда — ничего`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 27 — Трасса друга переживает выход из Кузницы.
   Стережёт: forgeLoadCode в forge.js.
   Беда: чужая карта жила только в памяти, а forgeOpen перечитывает
   forgeLast из хранилища — и молча возвращал прошлую свою, хотя тост
   «трасса гостя» игрок уже видел. */
async function guardGuestTrackSurvives(browser){
  const name = '27. Загруженная трасса друга не подменяется своей';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      forgeOpen();
      forgeCfg.n='МОЯ СТАРАЯ'; Store.set('forgeLast', JSON.parse(JSON.stringify(forgeCfg)));
      const guest=Object.assign({}, forgeCfg, { n:'ТРАССА ДРУГА', d:77 });
      const code=(typeof forgeEncode==='function')?forgeEncode(guest):null;
      if(!code) return { skip:true };
      document.getElementById('forgeCode').value=code;
      forgeLoadCode();
      const loaded=forgeCfgGet().n;
      setScreen('modes'); forgeOpen();                 // вышел и вернулся
      return { loaded, afterReturn: forgeCfgGet().n };
    });
    if(r.skip) return post(name,false,'не нашёл forgeEncode — страж не смог собрать код гостя');
    if(r.loaded!=='ТРАССА ДРУГА') return post(name,false,`код друга не загрузился (получили «${r.loaded}»)`);
    if(r.afterReturn!=='ТРАССА ДРУГА') return post(name,false,`после выхода и возврата трасса друга подменена на «${r.afterReturn}»`);
    post(name,true,'трасса друга на месте и после выхода из Кузницы');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 28 — Клавиши не крадут буквы у полей ввода и не залипают.
   Стережёт: слушатели клавиатуры в input.js.
   Беда: WASD с preventDefault работали, когда игрок печатал позывной
   или название трассы. Отдельно: Ctrl+W / Cmd+S ловились по коду, руль
   вставал в true, а keyup до окна уже не доходил — клавиша залипала,
   и самолёт уводило до конца забега. */
async function guardKeysRespectFields(browser){
  const name = '28. Клавиши не крадут ввод у полей и не залипают на Ctrl+W';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const fire=(opts)=>window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({bubbles:true,cancelable:true},opts)));
      input.keyL=input.keyR=input.keyU=input.keyD=false;

      // 1. печатаем в поле — руль молчит
      const field=document.getElementById('forgeName')||document.querySelector('input[type=text]');
      const evField=new KeyboardEvent('keydown',{key:'a',code:'KeyA',bubbles:true,cancelable:true});
      Object.defineProperty(evField,'target',{value:field});
      window.dispatchEvent(evField);
      const stoleFromField=input.keyL;
      const preventedInField=evField.defaultPrevented;

      // 2. Ctrl+W — сочетание системы, руль не встаёт (иначе залипнет: keyup не придёт)
      input.keyU=false; fire({key:'w',code:'KeyW',ctrlKey:true});
      const stuckOnCtrl=input.keyU;

      // 3. обычная клавиша в небе — руль обязан работать
      input.keyL=false; fire({key:'a',code:'KeyA'});
      const worksInSky=input.keyL;

      // 4. отпускание слушаем всегда, даже «из поля» — иначе зажатая клавиша залипнет
      input.keyL=true;
      const up=new KeyboardEvent('keyup',{key:'a',code:'KeyA',bubbles:true,cancelable:true});
      Object.defineProperty(up,'target',{value:field});
      window.dispatchEvent(up);
      const released=!input.keyL;

      return { stoleFromField, preventedInField, stuckOnCtrl, worksInSky, released };
    });
    if(r.stoleFromField || r.preventedInField) return post(name,false,'буква, набранная в поле ввода, ушла в штурвал — в позывной и название трассы нельзя напечатать w/a/s/d');
    if(r.stuckOnCtrl)  return post(name,false,'Ctrl+W поднял руль — keyup не придёт, клавиша залипнет и самолёт будет уводить');
    if(!r.worksInSky)  return post(name,false,'в небе клавиша перестала рулить — правка сломала управление');
    if(!r.released)    return post(name,false,'отпускание не услышано — зажатая до фокуса клавиша залипнет');
    post(name,true,'в поле молчит, на Ctrl+W не встаёт, в небе рулит, отпускание слышит всегда');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 5 — инфраструктура
   ============================================================ */

/* Страж 29 — Всё, что обещает кэшировать воркер, существует на диске.
   Стережёт: список SHELL в sw.js.
   Беда: caches.addAll атомарен — один 404 роняет install целиком,
   воркер не активируется, офлайна нет. В списке лежал fonts/OFL.txt,
   которого в репозитории нет: мина ровно под ту минуту, когда PWA
   включат обратно. Заодно сверяем, что все скрипты страницы попали
   в список и что версия в нём совпадает с версией тегов. */
async function guardShellPathsExist(browser){
  const name = '29. Все пути из SHELL воркера существуют (мина под будущий PWA)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const shell = await o.page.evaluate(async ()=>{
      const src = await (await fetch('sw.js')).text();
      const V = (src.match(/const V\s*=\s*'([^']+)'/)||[])[1];
      const js = (src.match(/const JS_FILES\s*=\s*\[([\s\S]*?)\]/)||[])[1]||'';
      const files = js.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);
      const statics = (src.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/)||[])[1]||'';
      const plain = statics.split('\n').join(' ').match(/'([^']+)'/g)||[];
      const list = plain.map(s=>s.replace(/'/g,'')).filter(s=>s!=='./' && !/^js\//.test(s) && s.indexOf('.')>0);
      const all = list.concat(files.map(f=>'js/'+f+'.js?v='+V));
      const tags = [...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src'))
                   .filter(s=>/^js\//.test(s));
      const results = [];
      for(const p of all){ try{ const r=await fetch(p,{cache:'no-store'}); results.push({p, ok:r.ok, status:r.status}); }
                           catch(e){ results.push({p, ok:false, status:'сеть'}); } }
      return { results, V, tags, shellJs: files.map(f=>'js/'+f+'.js?v='+V) };
    });
    const missing = shell.results.filter(r=>!r.ok);
    if(missing.length) return post(name,false, missing.map(m=>`${m.p} → ${m.status}`).join('\n') + `\n(один 404 роняет caches.addAll целиком — воркер не установится)`);
    const notInShell = shell.tags.filter(t=>shell.shellJs.indexOf(t)<0);
    if(notInShell.length) return post(name,false,`скрипты страницы не попали в SHELL: ${notInShell.join(', ')}`);
    post(name,true,`${shell.results.length} путей на месте, ${shell.tags.length} скриптов страницы сверены с SHELL, версия ${shell.V}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 30 — Упавший скрипт не оставляет игрока перед чёрным экраном.
   Стережёт: снятие спиннера в index.html.
   Беда: __bootFail взводился только при СЕТЕВОЙ ошибке core.js/game.js.
   Файл, который приехал и упал при исполнении, спиннер не удерживал —
   игрок видел пустую тьму без подсказки, даже не понимая, обновлять ли. */
async function guardBootFailureIsVisible(browser){
  const name = '30. Упавший при старте скрипт не даёт чёрный экран молча';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844} });
    ctx = ctx0;
    const page = await ctx0.newPage();
    await page.route('**/*', route=>{
      const u = route.request().url();
      if(/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(u)) return route.abort();
      if(/js\/ui\.js/.test(u))                                        // скрипт приехал — и упал при исполнении
        return route.fulfill({ status:200, contentType:'text/javascript', body:'throw new Error("страж: скрипт упал при исполнении");' });
      if(/supabase\.co/.test(u)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      return route.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForTimeout(700);
    const r = await page.evaluate(()=>{
      const b=document.getElementById('bootLoad');
      return { spinnerThere: !!b, text: b?(b.textContent||'').trim().slice(0,80):null };
    });
    if(!r.spinnerThere) return post(name,false,'спиннер снят, хотя скрипт упал — игрок остался перед чёрным экраном без подсказки');
    if(!r.text)         return post(name,false,'экран загрузки остался, но молчит — подсказки для игрока нет');
    post(name,true,`игрок видит объяснение: «${r.text}»`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 31 — Ярлык на домашний экран берёт язык игрока сразу.
   Стережёт: манифест в <head> index.html.
   Беда: язык манифеста правился из init, то есть уже после того, как
   браузер прочитал стартовый manifest.ru.json. Telegram WebApp и Safari
   манифест повторно не разбирают — англоязычный игрок получал ярлык
   «Космограмма». Заодно проверяем, что осиротевший manifest.json не
   расходится с языковыми по политике ориентации. */
async function guardManifestLangEarly(browser){
  const name = '31. Ярлык берёт язык игрока сразу, манифесты согласованы';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844}, locale:'en-US' });
    ctx = ctx0;
    const page = await ctx0.newPage();
    /* Гонку с загрузкой не караулим — она нас обгоняет. Вместо этого физически не даём
       defer-скриптам исполниться: подвешиваем core.js. Тогда applyLangPref не отработает
       никогда, и всё, что мы видим в href, поставлено разметкой и встроенным скриптом
       <head> — ровно то свойство, которое проверяем. */
    await page.route('**/*', rt=>{
      const u=rt.request().url();
      if(/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(u)) return rt.abort();
      if(/js\/core\.js/.test(u)) return new Promise(()=>{});          // висит — defer не стартует
      if(/supabase\.co/.test(u)) return rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      return rt.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'commit'});
    await page.waitForFunction(()=>!!document.getElementById('bootLoad') && !!document.getElementById('manifestLink'));
    const early = await page.evaluate(()=>({
      href: document.getElementById('manifestLink').getAttribute('href'),
      beforeScripts: typeof GAME_VERSION==='undefined'          // defer-скрипты подвешены и не исполнялись
    }));
    if(!early.beforeScripts)
      return post(name,false,'defer-скрипты неожиданно отработали — страж не изолировал момент');
    const cross = await page.evaluate(async ()=>{
      const names=['manifest.json','manifest.ru.json','manifest.en.json','manifest.es.json','manifest.pt.json','manifest.fr.json'];
      const out={};
      for(const n of names){ try{ const d=await (await fetch(n)).json(); out[n]={o:d.orientation,id:d.id,start:d.start_url}; }
                             catch(e){ out[n]={err:String(e.message||e)}; } }
      return out;
    });
    if(early.href!=='manifest.en.json')
      return post(name,false,`в <head> манифест остался «${early.href}» при языке браузера en — ярлык уедет на домашний экран с русским именем`);
    const bad=Object.entries(cross).filter(([,v])=>v.err);
    if(bad.length) return post(name,false,`манифест не читается: ${bad.map(([k,v])=>k+' → '+v.err).join(', ')}`);
    const orients=new Set(Object.values(cross).map(v=>v.o));
    if(orients.size>1) return post(name,false,`манифесты расходятся по ориентации: ${JSON.stringify(cross,null,1)}`);
    post(name,true,`при en-браузере сразу «${early.href}» (до defer-скриптов); шесть манифестов согласованы (orientation: ${[...orients][0]})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 32 — Старая дверь /app/ ведёт в игру, а не в заглушку.
   Стережёт: app/index.html.
   Беда: там стояла страница «идёт переезд» с обещанием смениться
   боевым файлом — обещание просрочено на 174 версии. Всякий, кто
   заходил старым адресом или ярлыком, видел заглушку вместо игры. */
async function guardAppPathRedirects(browser){
  const name = '32. Старая дверь /app/ ведёт в игру, а не в заглушку';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844} });
    ctx = ctx0;
    const page = await ctx0.newPage();
    await page.route('**/*', rt=>/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(rt.request().url())?rt.abort():
      (/supabase\.co/.test(rt.request().url())?rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}):rt.continue()));
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE.replace('/index.html','/app/index.html'),{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1200);
    const r = await page.evaluate(()=>({ url:location.pathname, ver:(typeof GAME_VERSION!=='undefined')?GAME_VERSION:null,
                                          stub:/переезжает|переезд/i.test(document.body.textContent||'') }));
    if(r.stub) return post(name,false,'по адресу /app/ по-прежнему стоит заглушка «идёт переезд»');
    if(!r.ver) return post(name,false,`с /app/ не попали в игру (сейчас ${r.url})`);
    post(name,true,`/app/ уводит в игру (${r.url}, версия ${r.ver})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 6 — ГИРОСКОП (корень)

   Здесь стражи подделывают то, что на верстаке не воспроизвести руками:
   больной мост Telegram, который шлёт пакеты вечно, но с замороженными
   значениями («мёртвый лжец с пульсом»), рядом с честным веб-каналом.
   Именно эта пара давала 27 писем «liar: tg» и 25 писем «cal_storm»
   с живых устройств — один симптом, а не два.
   ============================================================ */

/* Кормит канал пакетами напрямую, минуя браузерные события. */
const FEED = `
  function feedFrozen(chan, n, g, b){ for(let i=0;i<n;i++) chanFeed(chan, g, b); }
  function feedLive(chan, n, g0, b0, amp){ for(let i=0;i<n;i++) chanFeed(chan, g0+Math.sin(i/2)*amp, b0+Math.cos(i/3)*amp); }
`;

/* Страж 33 — Переброс штурвала больше не стоит калибровки.
   Стережёт: поканальный ноль в input.js.
   Беда (корень «cal_storm»): ноль был ОДИН на два канала, и каждая смена
   штурвала его выбрасывала. А смена — обычное дело: два канала одного
   датчика спорят постоянно. Каждый переброс = секунда без руля. */
async function guardZeroPerChannel(browser){
  const name = '33. Переброс штурвала не выбрасывает ноль (корень cal_storm)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      let storms=0; const realTick=BEACON.calTick; BEACON.calTick=()=>{storms++;};
      calReset(false); storms=0;                       // честный сброс на взлёте не считаем

      // Мост берёт штурвал и получает свой ноль. Пакетов с запасом: после любого
      // сброса калибровка идёт в тихом режиме — нужно 10 ровных подряд.
      gyroChanIn('tg');
      for(let i=0;i<16;i++) onTilt({gamma:0, beta:1});
      const tgZero = input.baseG;

      // веб отбирает штурвал и получает СВОЙ ноль в своём кадре.
      // Пакетов больше: у канала без нуля калибровка идёт в тихом режиме (10 ровных подряд).
      gyroChanIn('web');
      for(let i=0;i<16;i++) onTilt({gamma:79, beta:40});
      const webZero = input.baseG;

      // штурвал возвращается мосту — его ноль должен просто вернуться
      gyroChanIn('tg');
      const restored = input.baseG;
      BEACON.calTick = realTick;
      return { tgZero, webZero, restored, storms };
    `));
    if(r.tgZero==null || r.webZero==null) return post(name,false,'каналы не смогли снять ноль — сценарий не тот');
    if(r.tgZero===r.webZero) return post(name,false,'оба канала получили один ноль — кадры не разделены');
    if(r.restored==null) return post(name,false,'при возврате штурвала ноль выброшен — канал снова уходит в калибровку (это и есть cal_storm)');
    if(Math.round(r.restored)!==Math.round(r.tgZero)) return post(name,false,`вернулся чужой ноль: ${r.restored} вместо ${r.tgZero}`);
    if(r.storms) return post(name,false,`смена канала засчитана как ${r.storms} перекалибровок — счётчик шторма всё ещё растёт от обычного арбитража`);
    post(name,true,`у моста ноль ${Math.round(r.tgZero)}, у веба ${Math.round(r.webZero)}, возврат штурвала — без единой перекалибровки`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 34 — Ноль не снимают с мёртвого канала, когда рядом живой.
   Стережёт: нижний гейт живости в calFeed (input.js).
   Беда: проверка «неподвижной позы» для замёрзшего канала проходит
   ИДЕАЛЬНО — он же не шевелится. Мёртвый мост брал ноль за три пакета,
   честная рука — за десять подряд ровных или через лавочку в 80.
   Отсюда «zero: accept 0/0» в первые миллисекунды и мёртвый руль следом. */
async function guardNoZeroFromDeadChannel(browser){
  const name = '34. Ноль не снимается с мёртвого канала при живом соседе';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      calReset(false);
      feedLive('web', 24, 40, 30, 25);        // честная рука дышит
      feedFrozen('tg', 24, 0, 1);             // мост шлёт пакеты, но значения заморожены
      gyroChanIn('tg');
      for(let i=0;i<12;i++) onTilt({gamma:0, beta:1});   // мост пытается снять ноль с трупа
      const zeroFromDead = input.baseG;

      // контроль: когда живой канал сам берёт штурвал, ноль обязан взяться
      calReset(false);
      gyroChanIn('web');
      for(let i=0;i<14;i++) onTilt({gamma:40, beta:30});
      return { zeroFromDead, zeroFromLive: input.baseG, webAlive: chanAlive('web'), tgAlive: chanAlive('tg') };
    `));
    if(!r.webAlive) return post(name,false,'веб-канал не признан живым — сценарий не тот');
    if(r.tgAlive)   return post(name,false,'замёрзший мост признан живым — метрика дыхания всё ещё врёт');
    if(r.zeroFromDead!=null) return post(name,false,`мёртвый мост снял ноль ${Math.round(r.zeroFromDead)} при живом соседе — руль будет мёртвым`);
    if(r.zeroFromLive==null) return post(name,false,'живой канал не смог снять ноль — правка перекрыла кислород честной руке');
    post(name,true,'с трупа ноль не взят, живая рука откалибровалась');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 35 — Диагональный наклон считается живым каналом.
   Стережёт: chanSpread в input.js.
   Беда: разброс мерился по СУММЕ γ+β. Уводишь руку по диагонали
   (γ растёт, β падает) — сумма постоянна, размах ≈0, и живой канал
   объявлялся замёрзшим. Зеркально: порог 0.4° был НИЖЕ дрожи мёртвого
   моста, то есть труп всегда считался живым. */
async function guardSpreadPerAxis(browser){
  const name = '35. Диагональный наклон — живой канал, дрожь трупа — нет';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      chanHist.web.length=0; chanHist.tg.length=0;
      for(let i=0;i<20;i++) chanFeed('web', 20+i*2, 60-i*2);   // чистая диагональ: сумма не меняется вовсе
      const diagSpread=chanSpread('web'), diagAlive=chanAlive('web');
      chanHist.tg.length=0;
      for(let i=0;i<20;i++) chanFeed('tg', (i%2?0.4:-0.4), 1+(i%2?0.4:-0.4)); // мёртвый мост: дрожь около 1°
      return { diagSpread, diagAlive, deadSpread:chanSpread('tg'), deadAlive:chanAlive('tg'), deadFrozen:chanFrozen('tg') };
    `));
    if(!r.diagAlive) return post(name,false,`диагональ (размах ${r.diagSpread}) не признана живой — честный канал объявляется замёрзшим`);
    if(r.deadAlive) return post(name,false,`дрожь мёртвого моста (${r.deadSpread}) признана жизнью — труп отбирает штурвал`);
    if(!r.deadFrozen) return post(name,false,'мёртвый мост не опознан как замёрзший');
    post(name,true,`диагональ ${Math.round(r.diagSpread)}° = живая; дрожь трупа ${r.deadSpread.toFixed(1)}° = замёрзший`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 36 — Суд компасов заседает и при отрицательной бете.
   Стережёт: chanBetaMed в input.js.
   Беда: «судить рано» обозначалось числом −1, а β бывает отрицательной
   (телефон наклонён от себя — обычнейшая поза). Проверка mc<0 молча
   распускала суд: вся защита версии 1.104.0 не работала у половины поз —
   и ровно у тех, где мост врёт чаще всего. */
async function guardCourtWorksWithNegativeBeta(browser){
  const name = '36. Суд компасов работает и при отрицательной бете';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      chanHist.tg.length=0; chanHist.web.length=0; liarMark.tg=0; liarMark.web=0;
      // рука честно держит телефон наклонённым ОТ себя: β около −20, канал дышит
      for(let i=0;i<24;i++) chanFeed('web', Math.sin(i/2)*30, -20+Math.cos(i/2)*25);
      // мост заморожен и врёт, где низ: β −85 против руки −20 (разница 65°)
      for(let i=0;i<24;i++) chanFeed('tg', 0, -85);
      liarCourt();
      return { liar: chanLiar('tg'), medTg: chanBetaMed('tg'), medWeb: chanBetaMed('web'), spreadWeb: chanSpread('web') };
    `));
    if(r.medTg==null||r.medWeb==null) return post(name,false,'медиана беты не посчитана — окна не набраны');
    if(!r.liar) return post(name,false,`мост НЕ осуждён при медианах β ${Math.round(r.medTg)} против ${Math.round(r.medWeb)} — суд молчит на отрицательной бете, защита 1.104.0 не работает`);
    post(name,true,`мост осуждён: β ${Math.round(r.medTg)} против руки β ${Math.round(r.medWeb)} (сосед дышит ${Math.round(r.spreadWeb)}°)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 37 — Руль не залипает, пока идёт калибровка.
   Стережёт: onTilt в input.js.
   Беда, самая обидная: на время калибровки функция уходила в ранний
   выход, НЕ трогая сглаженный tiltX, а метка «датчик жив» ставилась
   выше — игровой цикл продолжал применять ПОСЛЕДНИЙ наклон до сброса.
   От 0.16 до 1.3 секунды самолёт уводило туда, где рука была в момент
   перекалибровки: «смерть на ровном месте». */
async function guardWheelDoesNotStick(browser){
  const name = '37. Руль не залипает во время перекалибровки';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      calReset(false);
      chanHist.web.length=0;
      for(let i=0;i<24;i++) chanFeed('web', (i%2?220:-220), 0);  // шторм: калибровка заведомо не завершится
      gyroChanIn('web');
      input.baseG=null; input.baseB=null;      // перекалибровка застала руку в уводе
      input.tiltX=0.9; input.tiltY=-0.7;
      const before=input.tiltX;
      const trail=[];
      for(let i=0;i<12;i++){ onTilt({gamma:(i%2?220:-220), beta:0}); trail.push(+input.tiltX.toFixed(3)); }
      return { before, after:input.tiltX, afterY:input.tiltY, calibrating:input.baseG==null, trail };
    `));
    if(!r.calibrating) return post(name,false,'калибровка неожиданно завершилась — сценарий не тот');
    if(Math.abs(r.after) > Math.abs(r.before)*0.5)
      return post(name,false,`руль остался в уводе: было ${r.before}, стало ${r.after.toFixed(3)} (${r.trail.join(' → ')}) — самолёт уводит всю калибровку`);
    post(name,true,`руль отпущен за 12 пакетов: ${r.before} → ${r.after.toFixed(3)} (по Y: ${r.afterY.toFixed(3)})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 38 — Осуждённый лжец не забирает штурвал на паузе соседа.
   Стережёт: порядок правил в maySteer (input.js).
   Беда: молчание соседа проверялось РАНЬШЕ приговора, поэтому любая
   пауза веб-канала дольше секунды отдавала руль уже осуждённому мосту.
   А пауза наступала ровно тогда, когда пилот замирал, чтобы дать тихой
   калибровке добраться до конца. Это и замыкало круг перебросов. */
async function guardLiarCannotGrabWheel(browser){
  const name = '38. Осуждённый лжец не забирает штурвал на паузе соседа';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(new Function(FEED + `
      chanHist.tg.length=0; chanHist.web.length=0; liarMark.tg=0; liarMark.web=0;
      for(let i=0;i<24;i++) chanFeed('web', Math.sin(i/2)*30, 85+Math.cos(i/2)*25); // рука дышит, низ на β85
      for(let i=0;i<24;i++) chanFeed('tg', 0, 1);                                   // мост заморожен и врёт про низ
      liarCourt();
      if(!chanLiar('tg')) return { setup:'мост не осуждён' };
      gyroChanIn('web');
      // пилот замер, чтобы дать калибровке дойти: веб молчит 1.5с — но не ушёл насовсем
      const now=performance.now();
      for(const p of chanHist.web) p.t = now-1500;
      chanCalc.web=null; chanCalc.tg=null;
      const grabsOnPause = maySteer('tg');
      // а вот если сосед пропал совсем (3с+) — руль нужен хоть какой-то
      for(const p of chanHist.web) p.t = now-4000;
      chanCalc.web=null; chanCalc.tg=null;
      const grabsWhenGone = maySteer('tg');
      return { grabsOnPause, grabsWhenGone };
    `));
    if(r.setup) return post(name,false,r.setup+' — сценарий не тот');
    if(r.grabsOnPause) return post(name,false,'осуждённый мост отобрал штурвал, стоило пилоту замереть на 1.5с — круг перебросов замыкается ровно здесь');
    if(!r.grabsWhenGone) return post(name,false,'сосед пропал насовсем (4с), а руль так и не отдан — игрок остался без управления');
    post(name,true,'на паузе соседа руль не отдан, при полном уходе соседа — отдан');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 39 — Оффер «Полёт без рук» уважает выбор игрока.
   Стережёт: gyro.js.
   Две беды: часовой калибровки не гасился при отказе (через секунду
   разблокировал гироскоп ВОПРЕКИ «остаюсь на пальце», заодно снимая
   паузу), и таймаут датчика засчитывался игроку как отказ — три
   технические неудачи навсегда затыкали предложение у тех, у кого мост
   болен, то есть у кого починка нужнее всех. */
async function guardOfferRespectsChoice(browser){
  const name = '39. Оффер гироскопа: отказ окончателен, таймаут не в счёт';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      Store.set('gyroDeclines',0);
      gyroBeatFail();                                   // датчик не успел — это НЕ отказ игрока
      const afterTimeout = Store.get('gyroDeclines',0);
      Store.set('gyroDeclines',0);
      gyroBeatTouch();                                  // «остаюсь на пальце» — вот это отказ
      const afterChoice = Store.get('gyroDeclines',0);
      // часовой обязан гаснуть при любом исходе
      gyroBeatIv = setInterval(()=>{},1000);
      gyroAct2(false);
      const stopped = gyroBeatIv===0;
      return { afterTimeout, afterChoice, stopped };
    });
    if(r.afterTimeout!==0) return post(name,false,`таймаут датчика засчитан игроку как отказ (${r.afterTimeout}) — три неудачи заткнут оффер навсегда`);
    if(r.afterChoice!==1)  return post(name,false,`осознанный отказ не засчитан (${r.afterChoice}) — оффер будет надоедать`);
    if(!r.stopped)         return post(name,false,'часовой калибровки не погашен — через секунду он разблокирует гироскоп вопреки отказу и снимет паузу');
    post(name,true,'таймаут не считается, отказ считается, часовой гаснет');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}


/* ============================================================
   ПАРТИЯ 7 — глубокий аудит: находки в ядре и мои собственные регрессии
   ============================================================ */

/* Страж 40 — Игра грузится в альбомной ориентации.
   Стережёт: resize() в core.js (ЯДРО).
   Беда: `S` — это const из game.js, который грузится ПОЗЖЕ core.js. На
   первом вызове resize() привязки ещё нет, и голое `S` бросает не
   undefined, а ReferenceError. Срабатывало при cssH<422 — то есть у
   любого телефона, положенного набок: resize обрывался, не доходя до
   setTransform, холст оставался 300×150, W и H нулями. */
async function guardLandscapeBoot(browser){
  const name = '40. Игра грузится в альбомной ориентации (ЯДРО: resize)';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:3 });
    ctx = ctx0;
    const page = await ctx0.newPage();
    const errs=[];
    page.on('pageerror', e=>errs.push(e.message));
    await page.route('**/*', rt=>/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(rt.request().url())?rt.abort():
      (/supabase\.co/.test(rt.request().url())?rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}):rt.continue()));
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined',null,{timeout:12000});
    await page.waitForTimeout(300);
    const r = await page.evaluate(()=>{
      const c=document.getElementById('game');
      return { W:typeof W!=='undefined'?W:null, H:typeof H!=='undefined'?H:null,
               cw:c.width, ch:c.height, warn:!document.getElementById('tooNarrow').classList.contains('hidden') };
    });
    const refErr = errs.filter(e=>/is not defined/.test(e));
    if(refErr.length) return post(name,false,`при загрузке набок брошено исключение: ${refErr[0]}`);
    if(!r.W || !r.H) return post(name,false,`мир нулевого размера (W=${r.W}, H=${r.H}) — resize оборвался на полпути`);
    if(r.cw<=300)   return post(name,false,`холст остался дефолтным ${r.cw}×${r.ch} — setTransform не выполнился`);
    if(!r.warn)     return post(name,false,'предупреждение о тесном экране не показано, хотя экран тесный');
    post(name,true,`мир ${Math.round(r.W)}×${Math.round(r.H)}, холст ${r.cw}×${r.ch}, предупреждение показано`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 41 — Упавшее ядро даёт подсказку, а не вечный спиннер.
   Стережёт: проверку взлёта в index.html.
   Беда (МОЯ РЕГРЕССИЯ v1.282.13): проверка спрашивала `typeof GAME_VERSION`,
   а это const в середине core.js. Если core.js упал ДО своей строки const,
   привязка навсегда в мёртвой зоне, и typeof БРОСАЕТ ReferenceError вместо
   'undefined' — обработчик обрывался на первой строке, подсказка не
   появлялась. Проверка падала ровно в том случае, ради которого написана. */
async function guardCoreCrashIsVisible(browser){
  const name = '41. Упавшее ядро даёт подсказку, а не вечный спиннер';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844} });
    ctx = ctx0;
    const page = await ctx0.newPage();
    await page.route('**/*', async route=>{
      const u=route.request().url();
      if(/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(u)) return route.abort();
      if(/js\/core\.js/.test(u)){
        const real = await route.fetch();
        const body = await real.text();
        // роняем core.js ДО объявления const GAME_VERSION — самый злой случай
        return route.fulfill({ status:200, contentType:'text/javascript',
          body:'null.boom;\n'+body });
      }
      if(/supabase\.co/.test(u)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      return route.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForTimeout(800);
    const r = await page.evaluate(()=>{
      const b=document.getElementById('bootLoad');
      return { there:!!b, text:b?(b.textContent||'').trim():'' };
    });
    if(!r.there) return post(name,false,'спиннер снят при упавшем ядре — игрок перед чёрным экраном');
    if(/загружается/i.test(r.text) || !r.text)
      return post(name,false,`экран загрузки молчит («${r.text}») — проверка сама упала по мёртвой зоне и подсказку не подставила`);
    post(name,true,`игрок видит объяснение: «${r.text.slice(0,60)}»`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 42 — Живое небо Кузницы запускается при входе.
   Стережёт: порядок setScreen/forgeOpen в ui.js + гейт forgeSkyKick.
   Беда (МОЯ РЕГРЕССИЯ v1.282.13): гейт «не рисовать вне своего экрана»
   срабатывал при входе, потому что forgeOpen звался ДО setScreen — экран
   ещё скрыт. Превью не оживало вовсе, пока не тронешь любой виджет. */
async function guardForgeSkyStartsOnEntry(browser){
  const name = '42. Живое небо Кузницы оживает при входе';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      let paints=0; const real=window.forgeSkyPaint;
      window.forgeSkyPaint=function(){ paints++; return real.apply(this,arguments); };
      document.getElementById('modeForge').click();      // обычный вход игрока
      await new Promise(r=>setTimeout(r,300));
      window.forgeSkyPaint=real;
      return { paints, screen:screenName, hidden:document.getElementById('forgeScreen').classList.contains('hidden') };
    });
    if(r.screen!=='forge') return post(name,false,`не попали в Кузницу (экран «${r.screen}») — сценарий не тот`);
    if(r.hidden)  return post(name,false,'экран Кузницы остался скрытым');
    if(!r.paints) return post(name,false,'превью не нарисовано ни разу за 300мс — небо не ожило при входе');
    post(name,true,`небо ожило при входе (${r.paints} кадров за 300мс)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 43 — Прерванный забег возвращается в СВОЕЙ дисциплине.
   Стережёт: восстановление автосейва в startGame (ui.js).
   Беда: восстанавливался только daily, поэтому свёрнутый посреди забега
   полёт по своей трассе поднимался КЛАССИКОЙ — очки заведомо лёгкой
   самодельной карты уходили в общий рекорд, кошелёк и мировую таблицу. */
async function guardSavedRunKeepsMode(browser){
  const name = '43. Прерванный забег возвращается в своей дисциплине';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const out={};
      for(const m of ['custom','bullet','speedrun']){
        Store.del('savedRun');
        runMode=m; startGame(); S.score=3000; S.dist=400; S.smooth=1;
        autosave();
        const saved=Store.get('savedRun',null);
        runMode='classic';                       // как после перезапуска приложения
        startGame(saved||undefined);
        out[m]={ savedMode:saved&&saved.mode, restored:S.mode };
      }
      return out;
    });
    const bad=Object.entries(r).filter(([m,v])=>v.restored!==v.savedMode);
    if(bad.length) return post(name,false, bad.map(([m,v])=>`${m}: сохранён как «${v.savedMode}», восстановлен как «${v.restored}» → очки уйдут в чужой зачёт`).join('\n'));
    post(name,true,'custom, bullet и speedrun восстанавливаются сами собой');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 44 — Смерть нельзя отменить сворачиванием приложения.
   Стережёт: autosave (ui.js).
   Беда: pauseGame честно отказывается работать при S.dying, но onHidden
   зовёт autosave() отдельной строкой, мимо этого стража. Свернувший
   приложение во время занавеса последней жизни получал сохранённый забег
   с lives=0, который при восстановлении поднимался до 1 — смерть просто
   не случалась, а счёт оставался целиком. */
async function guardDyingIsNotSaved(browser){
  const name = '44. Смерть нельзя отменить сворачиванием приложения';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      Store.del('savedRun');
      runMode='classic'; startGame();
      S.score=8000; S.dist=900; S.lives=0; S.dying=1; S.dyingT=.9;   // занавес последней жизни
      autosave();
      const afterDying = Store.get('savedRun',null);
      Store.del('savedRun');
      S.dying=0; S.lives=2; autosave();                              // контроль: живой забег сохраняться обязан
      return { afterDying:!!afterDying, alive:!!Store.get('savedRun',null) };
    });
    if(r.afterDying) return post(name,false,'занавес смерти сохранён в автосейв → перезапуск воскресит проигранный забег со всеми очками');
    if(!r.alive)     return post(name,false,'живой забег перестал сохраняться — правка задела лишнее');
    post(name,true,'занавес не сохраняется, живой забег сохраняется');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 45 — Случайным тапом звёзды не потратить.
   Стережёт: Ангар (ui.js).
   История: у неактивной надписи «Примерка завтра» не было своего слушателя,
   и клик всплывал на карточку прямо в ветку покупки — скин молча покупался
   за звёзды. Дыру закрыли в v1.282.14, а в v1.282.16 владелец решил убрать
   и саму «Примерку». Страж следит, что фича не вернулась тихой тропой и что
   в Ангаре не осталось элементов, чей тап уводит деньги мимо намерения.
   Покупка тапом по самой карточке — задуманное действие, её не трогаем. */
async function guardHangarNoAccidentalSpend(browser){
  const name = '45. В Ангаре нельзя потратить звёзды случайным тапом';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('ownedSkins',[0]); S.ownedSkins=[0];
      S.wallet=9999; Store.set('wallet',9999);
      renderHangar();
      const leftovers = document.querySelectorAll('.shipItem .try').length;
      const dictLeft = Object.keys(I18N).filter(lg=>I18N[lg].tryOn!=null || I18N[lg].tryOnGo!=null);
      const storeKey = Store.get('tryOn', null);
      // не хватает звёзд — тап по карточке ничего не должен списать
      S.wallet=1; Store.set('wallet',1); renderHangar();
      const card=[...document.querySelectorAll('.shipItem')].find(d=>d.querySelector('.pr'));
      const before={ wallet:S.wallet, owned:S.ownedSkins.length };
      if(card) card.click();
      await new Promise(res=>setTimeout(res,40));
      return { leftovers, dictLeft, storeKey, before, wallet:S.wallet, owned:S.ownedSkins.length };
    });
    if(r.leftovers) return post(name,false,`в Ангаре осталось ${r.leftovers} кнопок «Примерка» — фича вернулась`);
    if(r.dictLeft.length) return post(name,false,`строки примерки остались в словарях: ${r.dictLeft.join(', ')}`);
    if(r.storeKey!=null)  return post(name,false,`ключ tryOn всё ещё пишется в хранилище (${r.storeKey})`);
    if(r.wallet!==r.before.wallet || r.owned!==r.before.owned)
      return post(name,false,`тап при нехватке звёзд что-то списал: кошелёк ${r.before.wallet}→${r.wallet}, скинов ${r.before.owned}→${r.owned}`);
    post(name,true,'кнопок примерки нет, строк в словарях нет, тап без денег ничего не тратит');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 46 — Сетка статистики возвращается после забега по своей трассе.
   Стережёт: gameOver / mapOver (ui.js, forge.js).
   Беда: mapOver прячет #stats и #runPass, а снимал этот hidden никто —
   во всём проекте не было ни одного remove('hidden') для них. Один забег
   по своей трассе — и «Подробности полёта» на всех последующих обычных
   итогах оставались без сетки и паспорта до перезагрузки страницы. */
async function guardStatsComeBack(browser){
  const name = '46. Сетка статистики возвращается после своей трассы';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      runMode='custom'; startGame(); S.score=500; S.smooth=1; gameOver();   // через mapOver
      await new Promise(r=>setTimeout(r,50));
      const afterCustom = document.getElementById('stats').classList.contains('hidden');
      runMode='classic'; startGame(); S.score=1500; S.smooth=1; gameOver(); // обычный забег
      await new Promise(r=>setTimeout(r,50));
      return { afterCustom,
               stats:document.getElementById('stats').classList.contains('hidden'),
               pass:document.getElementById('runPass').classList.contains('hidden') };
    });
    if(!r.afterCustom) return post(name,false,'своя трасса не спрятала сетку — сценарий не тот');
    if(r.stats || r.pass) return post(name,false,'после обычного забега сетка и паспорт так и не вернулись — блок экрана итогов потерян до перезагрузки');
    post(name,true,'своя трасса прячет, обычный забег возвращает');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 47 — Салют любого цвета остаётся своим цветом.
   Стережёт: burst / hexToRgba (game.js, ЯДРО).
   Беда: прошлая правка научила burst широкому охвату, но рядом остались
   две незакрытые формы, дававшие тот же rgba(NaN,…): полная rgba(...)
   с альфой (дым занавеса смерти) и короткий hex '#fff' (салют бонуса).
   Canvas молча отвергает негодный цвет и рисует предыдущим. */
async function guardAllBurstColorForms(browser){
  const name = '47. Салют не теряет цвет ни в одной из пяти форм';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const probe=document.createElement('canvas').getContext('2d');
      const check=(input)=>{
        particles.length=0; burst(50,50,input,2);
        const raw=particles.length?particles[particles.length-1].color:null;
        if(raw==null) return {input,ok:false,why:'частица не родилась'};
        if(/NaN/.test(raw)) return {input,raw,ok:false,why:'в цвете NaN'};
        const full=raw+'0.9)';
        probe.fillStyle='#000000'; probe.fillStyle=full;
        return {input,raw,full,ok:probe.fillStyle!=='#000000'};
      };
      return ['#ffd76a','#fff','rgba(160,165,180,.45)','rgba(255,215,106,','color(display-p3 1 .86 .44)'].map(check);
    });
    const bad=r.filter(x=>!x.ok);
    if(bad.length) return post(name,false, bad.map(b=>`${b.input} → «${b.full||b.raw}» ${b.why||'не принят canvas'}`).join('\n'));
    post(name,true,`все пять форм дают годный цвет`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 48 — Имена скинов читаются на всех пяти языках.
   Стережёт: словари в core.js (ЯДРО).
   Беда: в испанском и португальском skinNames был СТРОКОЙ, а потребитель
   индексирует как массив — Ангар показывал имена из одной буквы. */
async function guardSkinNamesAllLangs(browser){
  const name = '48. Имена скинов — массив во всех пяти языках';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const bad=[];
      for(const lg of Object.keys(I18N)){
        const v=I18N[lg].skinNames;
        if(!Array.isArray(v)) bad.push(lg+': '+typeof v+' («'+String(v).slice(0,18)+'…»)');
        else if(v.length<9 || v.some(x=>String(x).length<2)) bad.push(lg+': массив негодный '+JSON.stringify(v.slice(0,3)));
      }
      return bad;
    });
    if(r.length) return post(name,false, r.join('\n')+'\n(Ангар индексирует это как массив — выйдут имена по одной букве)');
    post(name,true,'во всех языках массив из девяти читаемых имён');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 49 — Отказ хранилища не уносит автосейв и очередь писем.
   Стережёт: Store._write (core.js, ЯДРО).
   Беда (МОЯ РЕГРЕССИЯ v1.282.13): разгрузка тяжёлых ключей срабатывала на
   ЛЮБОЙ отказ записи. В WebView с запрещённым хранилищем setItem бросает
   SecurityError на каждую запись — и очередь писем удалялась сразу после
   того, как её туда положили, а самописец каждые 4 секунды сносил игроку
   автосейв, к которому не имеет отношения. */
async function guardStorageDenialKeepsData(browser){
  const name = '49. Отказ хранилища не уносит автосейв и почту';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      Store.set('savedRun',{score:100,mode:'classic'});
      Store.set('beaconQ',[{kind:'test'}]);
      const real=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k){ if(k==='cosmogram_v2'){ const e=new Error('denied'); e.name='SecurityError'; throw e; } return real.apply(this,arguments); };
      Store.set('bbTape',['лента']);                 // самописец пишет каждые 4 секунды
      Storage.prototype.setItem=real;
      return { saved:!!Store.get('savedRun',null), queue:(Store.get('beaconQ',[])||[]).length };
    });
    if(!r.saved) return post(name,false,'запрещённое хранилище стёрло автосейв игрока из памяти — а его туда никто не просил трогать');
    if(!r.queue) return post(name,false,'очередь писем стёрта — «Почта неба» замолчит именно там, где сломано');
    post(name,true,'при SecurityError память не тронута: автосейв и очередь на месте');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 50 — Имя трассы не стирается, пока его печатают.
   Стережёт: forgeSyncWidgets (forge.js).
   Беда: у поля имени не было слушателя ввода, а forgeSyncWidgets — общая
   точка выхода всех виджетов — безусловно переписывала value из конфига.
   Игрок печатал имя, трогал любой чип, и имя молча возвращалось к старому. */
async function guardForgeNameSurvives(browser){
  const name = '50. Имя трассы не стирается при касании других виджетов';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      document.getElementById('modeForge').click();
      const nm=document.getElementById('forgeName');
      nm.value='АД ПИЛОТА'; nm.dispatchEvent(new Event('input',{bubbles:true}));
      const inCfg=forgeCfgGet().n;
      document.getElementById('forgeChips').children[3].click();   // тронули чип
      return { inCfg, afterChip:nm.value, cfgAfter:forgeCfgGet().n };
    });
    if(r.inCfg!=='АД ПИЛОТА') return post(name,false,`набранное имя не попало в конфиг (там «${r.inCfg}»)`);
    if(r.afterChip!=='АД ПИЛОТА') return post(name,false,`после касания чипа имя в поле стало «${r.afterChip}» — ввод игрока потерян`);
    post(name,true,'имя дошло до конфига и пережило касание чипа');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}


/* ============================================================
   ПАРТИЯ 8 — детерминизм трассы, фон, поколения кодов
   ============================================================ */

/* Страж 51 — Одна трасса на всех: поле не зависит от того, как играл игрок.
   Стережёт: под-потоки спавна в core.js + волну в game.js (ЯДРО).
   Беда: поток трассы был один и расходовался в порядке, зависящем от
   действий игрока — волну поднимали очки, переполненное поле пропускало
   выборку, разные виды преград тратят разное число обращений к кубику.
   Одно расхождение — и дальше поля двух игроков расходятся навсегда:
   «Трасса дня» у двоих была разной, а таблица сравнивала несравнимое. */
async function guardTrackIsSameForEveryone(browser){
  const name = '51. Одна трасса на всех: поле не зависит от игры игрока (ЯДРО)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      // Прогон трассы: координата одна и та же, поведение игрока — разное
      function run(opts){
        runMode='daily'; startGame();
        mapSeedKey='СТРАЖ-СИД'; mapSeqReset();
        const seq=[];
        for(let i=0;i<80;i++){
          S.dist = i*40;                                  // координата на трассе — общая
          S.mission = 1+Math.floor(S.dist/500);
          if(opts.rich){ S.score += 1234; S.timeScale=.4; S.dash=1; input.useGyro=true; }
          else { S.score=0; S.timeScale=1; S.dash=0; input.useGyro=false; }
          obstacles.length = (opts.full && opts.full.indexOf(i)>=0) ? 14 : 0;
          const before=obstacles.length;
          withTrack('ob', function(){ spawnObstacle(); });
          seq.push(obstacles.length>before ? obstacles[obstacles.length-1].kind : 'полно');
        }
        return seq;
      }
      const plain = run({});
      const rich  = run({rich:true});                     // игрок собирает очки, тянет слоу-мо, рулит наклоном
      const full  = run({full:[5,17,33]});                // трижды поле было переполнено
      // сравниваем только те позиции, где обе стороны реально спавнили
      const diffRich = plain.filter((k,i)=>rich[i]!==k).length;
      const shifted = plain.filter((k,i)=>[5,17,33].indexOf(i)<0 && full[i]!==k).length;
      return { diffRich, shifted, sample:plain.slice(0,8).join(','), kinds:[...new Set(plain)].length };
    });
    if(r.kinds<3) return post(name,false,`трасса вырождена (видов всего ${r.kinds}) — сценарий не тот`);
    if(r.diffRich) return post(name,false,`${r.diffRich} из 80 преград отличаются у «богатого» игрока — очки, слоу-мо и Таран всё ещё сдвигают поле`);
    if(r.shifted)  return post(name,false,`${r.shifted} преград съехали после переполнения поля — пропуск выборки сдвигает всю трассу дальше`);
    post(name,true,`80 спавнов совпали до одного при разном поведении игрока и трижды переполненном поле (${r.sample}…)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 52 — Очки больше не поднимают волну.
   Стережёт: продвижение волны в game.js (ЯДРО).
   Беда: волну двигали и очки, а очки — это мастерство игрока. Волна
   меняет таблицу весов, значит в одной точке трассы двое видели разное.
   Побочно уходит лавина «дингов» от Сверхновой: до 11 подряд за 180мс. */
async function guardWaveIsDistanceOnly(browser){
  const name = '52. Волну поднимает только дистанция, не очки';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame();
      S.dist=10; S.mission=1; S.score=50000;              // гора очков, дистанции почти нет
      for(let i=0;i<30;i++) update(1/60);
      const byScore=S.mission;
      startGame(); S.score=0; S.mission=1;
      S.dist=waveDistTarget(1)+10;                         // дистанция есть, очков нет
      for(let i=0;i<10;i++) update(1/60);
      return { byScore, byDist:S.mission };
    });
    if(r.byScore>1) return post(name,false,`50000 очков подняли волну до ${r.byScore} — поле снова зависит от мастерства игрока`);
    if(r.byDist<2)  return post(name,false,`дистанция волну не подняла (осталась ${r.byDist}) — сломали продвижение вовсе`);
    post(name,true,`очки волну не двигают, дистанция двигает (1 → ${r.byDist})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 53 — Фон не пересобирается в кадре.
   Стережёт: nebulaField в render.js (ЯДРО).
   Беда: кэш ключевался округлённым hueShift, а тот растёт на 1.2 в
   СЕКУНДУ — промах каждые 833мс, и на каждый промах новый холст ~12МБ,
   пять полноэкранных градиентных заливок и 240 точек пыли синхронно в
   кадре. Плюс сид шился оттуда же, поэтому весь узор телепортировался. */
async function guardNebulaNotRebuiltInFrame(browser){
  const name = '53. Фон не пересобирается каждую секунду (ЯДРО)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame(); Q.level=3;
      const proto=HTMLCanvasElement.prototype;
      let made=0; const realCtx=proto.getContext;
      const realCreate=document.createElement.bind(document);
      document.createElement=function(t){ if(String(t).toLowerCase()==='canvas') made++; return realCreate(t); };
      const first=nebulaField(210,240);
      const madeAfterFirst=made;
      // 60 секунд полёта: hueShift растёт на 1.2 в секунду
      let rebuilds=0, prev=first;
      for(let sec=0; sec<60; sec++){
        S.hueShift += 1.2;
        const c=nebulaField(210,240);
        if(c!==prev || made>madeAfterFirst+rebuilds){ rebuilds++; prev=c; }
      }
      document.createElement=realCreate;
      return { rebuilds, canvases:made-madeAfterFirst };
    });
    if(r.rebuilds>3) return post(name,false,`за минуту полёта фон пересобран ${r.rebuilds} раз — это подёргивание кадра ровно раз в секунду`);
    if(r.canvases>1) return post(name,false,`создано ${r.canvases} новых холстов вместо переиспользования одного (каждый ~12МБ мусора)`);
    post(name,true,`за минуту полёта пересборок ${r.rebuilds}, новых холстов ${r.canvases}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 54 — Розданные раньше коды трасс не поменяли расстановку.
   Стережёт: поколения формата в forge.js + гейт в game.js.
   Беда: правка «воля автора сильнее волнового гейта» применилась и к уже
   разосланным ссылкам — карта, вылизанная под свой рекорд, поехала. */
async function guardOldTrackCodesUnchanged(browser){
  const name = '54. Старые коды трасс сохраняют прежнюю расстановку';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const mk=(ver)=>{ const a=[ver,'ТЕСТ',50,50,(1<<7)|(1<<6),1500,3,1,1,2,0,0,777];
        return 'CG1.'+btoa(unescape(encodeURIComponent(JSON.stringify(a)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
      const old2=forgeDecode(mk(2)), fresh=forgeDecode(mk(3));
      function kinds(wg){
        runMode='custom'; startGame();
        S.mode='custom'; S.customE=(1<<7)|(1<<6); S.customFlat=1; S.customW=1; S.mission=1; S.customWG=wg;
        const k={};
        for(let i=0;i<200;i++){ obstacles.length=0; withTrack('ob',function(){ spawnObstacle(); });
          if(obstacles[0]) k[obstacles[0].kind]=1; }
        return Object.keys(k).sort().join(',');
      }
      return { oldWg:old2&&old2.wg, freshWg:fresh&&fresh.wg, oldKinds:kinds(1), newKinds:kinds(0),
               encodedVer:JSON.parse(decodeURIComponent(escape(atob(forgeEncode(fresh).slice(4).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-forgeEncode(fresh).slice(4).length%4)%4)))))[0] };
    });
    if(r.oldWg!==1)   return post(name,false,`код поколения 2 не помечен как старая раскладка (wg=${r.oldWg})`);
    if(r.freshWg!==0) return post(name,false,`код поколения 3 помечен старым (wg=${r.freshWg})`);
    if(r.encodedVer!==3) return post(name,false,`новые коды пишутся с версией ${r.encodedVer}, а не 3`);
    if(r.oldKinds!=='rock') return post(name,false,`старый код изменил расстановку: было «rock», стало «${r.oldKinds}» — чужие розданные трассы поехали`);
    if(r.newKinds==='rock') return post(name,false,'новый код не получил волю автора — гейт не снят');
    post(name,true,`старый код: ${r.oldKinds} (как было), новый: ${r.newKinds} (воля автора)`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}


/* ============================================================
   ПАРТИЯ 9 — честность, доступность, качество кадра
   ============================================================ */

/* Страж 55 — Облако не крадёт рекорд.
   Стережёт: Store.init (core.js, ЯДРО).
   Беда: облачное значение затирало локальное безусловно, а запись в облако
   молча игнорирует ошибку. Достаточно одного не долетевшего setItem (плохая
   сеть, самолётный режим), чтобы следующий запуск онлайн принёс устаревший
   рекорд и стёр им настоящий. Самая обидная потеря в игре. */
async function guardCloudDoesNotEatRecord(browser){
  const name = '55. Облако не крадёт рекорд, а сливает максимумы';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('best',9000); Store.set('bestGyro',7000); Store.set('ownedSkins',[0,3]);
      // облако отдаёт устаревшие цифры — так бывает, когда прошлая запись не долетела
      Store._mergeCloud({ best:'1000', bestGyro:'12000', ownedSkins:'[0,5]' });
      return { best:Store.get('best',0), gyro:Store.get('bestGyro',0), skins:Store.get('ownedSkins',[]) };
    });
    if(r.best!==9000)  return post(name,false,`локальный рекорд 9000 затёрт облачным ${r.best} — игрок потерял результат`);
    if(r.gyro!==12000) return post(name,false,`облачный рекорд 12000 не принят (осталось ${r.gyro}) — слияние работает в одну сторону`);
    if(r.skins.length!==3) return post(name,false,`скины не слились: ${JSON.stringify(r.skins)} (ждали объединение [0,3] и [0,5])`);
    post(name,true,`взят максимум с обеих сторон: рекорд ${r.best}, гироскоп ${r.gyro}, скины ${JSON.stringify(r.skins)}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 56 — Клавиатура платит за резкость наравне с пальцем.
   Стережёт: smoothStep (game.js, ЯДРО).
   Беда: плавность мерилась только для пальца и гироскопа. Руление
   клавишами всегда давало ×1.0 к итогу (палец платит до −25%) и
   засчитывало «безупречный полёт» каждый забег. */
async function guardKeyboardPaysForJerk(browser){
  const name = '56. Клавиатура платит за резкость, как палец';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      function fly(jerky){
        runMode='classic'; startGame();
        input.touchX=null; input.useGyro=false;
        input.keyL=input.keyR=input.keyU=input.keyD=false;
        for(let i=0;i<120;i++){
          if(jerky){ const l=i%2===0; input.keyL=l; input.keyR=!l; }   // дёргаем руль каждый кадр
          else { input.keyR=true; input.keyL=false; }                   // ровное удержание
          smoothStep();
        }
        return +S.smooth.toFixed(3);
      }
      return { jerky:fly(true), steady:fly(false) };
    });
    if(r.jerky>=1)          return post(name,false,`дёрганое руление клавишами оставило плавность ${r.jerky} — итог всегда ×1.0, а палец за то же платит до −25%`);
    if(r.steady<=r.jerky)   return post(name,false,`ровное удержание (${r.steady}) не лучше дёрганого (${r.jerky}) — замер бессмыслен`);
    post(name,true,`дёрганое ${r.jerky}, ровное ${r.steady} — резкость наказывается`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 57 — Бережное небо гасит стробоскоп неуязвимости.
   Стережёт: мигание в render.js (ЯДРО).
   Беда: мигание переключалось каждые 90мс — это 5.5 вспышки в секунду
   при пороге фотосенситивности WCAG в 3, и шло 2.2 секунды после каждого
   удара. Системный флаг «уменьшить движение» этот эффект не касался —
   а он единственный в игре, кто порог превышает. */
async function guardReducedMotionStopsBlink(browser){
  const name = '57. «Уменьшить движение» гасит мигание 5.5 Гц';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844}, reducedMotion:'reduce' });
    ctx = ctx0;
    const page = await ctx0.newPage();
    await page.route('**/*', rt=>/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(rt.request().url())?rt.abort():
      (/supabase\.co/.test(rt.request().url())?rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}):rt.continue()));
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined');
    const r = await page.evaluate(async ()=>{
      if(!RM) return { skip:'система не сообщила о бережном режиме' };
      const seen=new Set();
      for(let i=0;i<40;i++){ seen.add(invulnDim()); await new Promise(res=>setTimeout(res,25)); }
      return { rm:RM, values:[...seen] };
    });
    if(r.skip) return post(name,false,r.skip);
    if(r.values.length>1) return post(name,false,`за секунду мигание переключилось (значения ${JSON.stringify(r.values)}) — стробоскоп 5.5 Гц идёт вопреки системному флагу`);
    post(name,true,'при бережном небе видимость ровная, без вспышек');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 58 — Авто-качество не раздувается в меню.
   Стережёт: qualityTick в цикле render.js (ЯДРО).
   Беда: метрика считала ТИКИ rAF, а на оверлеях мы рисуем намеренно вдвое
   реже. Q.fps показывал 60 при тридцати реальных кадрах — авто уверенно
   лезло вверх и снимало «потолок-памятку». Постоял в меню полминуты, и
   следующий полёт начинался с заикания. */
async function guardQualityFrozenOnOverlays(browser){
  const name = '58. Авто-качество не растёт от стояния в меню';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      setScreen('menu');
      // Контроль: если бы метрику снимали на оверлеях, «потолок-памятка» слетел бы за 20с
      Q.mode='auto'; Q.level=1; Q._ceil=2; Q._up=0; Q._prove=0; Q._hold=0; Q.fps=60;
      for(let i=0;i<25*60;i++) qualityTick(1/60);
      const direct={ ceil:Q._ceil, prove:Q._prove };
      // А теперь как в жизни: полторы секунды настоящего цикла на экране меню
      Q.level=1; Q._ceil=2; Q._up=0; Q._prove=0; Q.fps=60; Q._n=0; Q._acc=0; Q._t=0;
      await new Promise(res=>setTimeout(res,1500));
      return { direct, real:{ ceil:Q._ceil, prove:Q._prove }, n:Q._n };
    });
    if(r.direct.ceil!==-1) return post(name,false,'контрольный прогон не снял потолок-памятку — сценарий не показателен');
    if(r.real.ceil===-1 || r.real.prove>0)
      return post(name,false,`полторы секунды в меню сдвинули метрику (потолок ${r.real.ceil}, зачёт ${r.real.prove}) — авто меряет тики rAF там, где кадры намеренно душатся`);
    if(r.n>2) return post(name,false,`метрика набрала ${r.n} тиков на экране меню — она не заморожена`);
    post(name,true,`контроль снимает потолок, живое меню — нет (потолок ${r.real.ceil}, тиков ${r.n})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}


/* ============================================================
   ПАРТИЯ 10 — равные условия: логика, честность, одинаковость
   ============================================================ */

/* Страж 59 — Призрак не подменяет небо зачётных режимов.
   Стережёт: ghostLoad в game.js (ЯДРО).
   Беда (МОЯ РЕГРЕССИЯ v1.282.15): вместе с сидом призрака подменялся ключ
   трассы, и делалось это в ЛЮБОМ режиме. ghostLoad зовётся из startGame
   после того, как поставлен ключ дня — то есть «Трасса дня», Спидран и
   чужой код летели по сиду призрака. Один игрок неделями получал одну и
   ту же заученную трассу, а «одно небо на всех» переставало существовать. */
async function guardGhostDoesNotHijackSeed(browser){
  const name = '59. Призрак не подменяет небо Трассы дня и Спидрана';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      // у игрока есть свой призрак с посторонним сидом
      Store.set('ghostRun',{track:'#'.repeat(90), seed:777777});
      const out={};
      for(const m of ['daily','speedrun','classic']){ runMode=m; startGame(); out[m]=mapSeedKey; }
      return { out, today:todayKey() };
    });
    if(r.out.daily!==r.today)  return post(name,false,`Трасса дня полетела по ключу «${r.out.daily}» вместо дня «${r.today}» — небо у каждого своё`);
    if(r.out.speedrun.indexOf('speedrun')<0) return post(name,false,`Спидран полетел по ключу «${r.out.speedrun}» вместо дневного`);
    if(r.out.classic!=='777777') return post(name,false,`в Классике сид призрака НЕ поднялся (${r.out.classic}) — гонка идёт по чужому полю`);
    post(name,true,`день «${r.out.daily}», спидран «${r.out.speedrun}», классика по призраку «${r.out.classic}»`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 60 — Гироскоп не получает больше звёзд и бонусов на метр.
   Стережёт: темп спавна в game.js (ЯДРО).
   Беда: под гироскопом мир идёт на 15% медленнее (GYRO_ASSIST), паузу
   между преградами честно растягивали обратно, а звёзды и бонусы считались
   в секундах — на метр трассы их выпадало на 17.6% больше. Фора в общих
   таблицах (дистанция, Затишье, Трасса дня) и разъезд геометрии сида. */
async function guardGyroNoExtraPickups(browser){
  const name = '60. Гироскоп не собирает лишних звёзд и бонусов на метр';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      /* update() каждый кадр пересчитывает input.useGyro сам (замок + сторож свежести
         пакета), поэтому просто выставить флаг снаружи мало — он тут же затирался, и обе
         половины теста летели одинаково (ложная зелень). Открываем замок и держим метку
         пакета свежей, чтобы гироскопная ветка была настоящей. */
      function fly(useGyro){
        Store.set('gyroUnlocked', useGyro?1:0);
        runMode='classic'; startGame();
        mapSeedKey='СТРАЖ-ТЕМП'; mapSeqReset();   // общий сид обеим половинам — иначе страж плавает на случайных паузах
        input.touchX=null;
        let stars=0, pows=0, obs=0;
        S.dist=0;
        const realStar=window.spawnStar, realPow=window.spawnPowerup, realOb=window.spawnObstacle;
        window.spawnStar=function(){ stars++; };
        window.spawnPowerup=function(){ pows++; };
        window.spawnObstacle=function(){ obs++; return 0; };
        /* Летим до одной и той же ДИСТАНЦИИ, а не одно и то же время. Иначе половины
           сравнивают разные участки трассы: плотность бонусов растёт со сложностью, и
           более медленный гироскоп просто не доезжает до плотной части. */
        let guardN=0;
        while(S.dist<15000 && guardN++<60*900){ if(useGyro) input._t=performance.now(); update(1/60); } // 15 км: бонусов набирается ~33, один лишний уже не даёт 15% шума
        window.spawnStar=realStar; window.spawnPowerup=realPow; window.spawnObstacle=realOb;
        const km=S.dist/1000;
        return { stars:stars/km, pows:pows/km, obs:obs/km, gyro:input.useGyro };
      }
      const touch=fly(false), gyro=fly(true);
      if(!gyro.gyro) return { setup:'гироскопная ветка не включилась — сценарий не тот' };
      const d=(a,b)=>Math.abs(a-b)/((a+b)/2)*100;
      return { touch, gyro, dStars:d(touch.stars,gyro.stars), dPows:d(touch.pows,gyro.pows), dObs:d(touch.obs,gyro.obs) };
    });
    if(r.setup) return post(name,false,r.setup);
    if(r.dObs>6)   return post(name,false,`преград на километр расходится на ${r.dObs.toFixed(1)}% — сломали базовую компенсацию`);
    if(r.dStars>6) return post(name,false,`звёзд на километр у гироскопа ${r.gyro.stars.toFixed(1)} против ${r.touch.stars.toFixed(1)} у пальца (+${r.dStars.toFixed(1)}%) — фора в общих таблицах`);
    if(r.dPows>8)  return post(name,false,`бонусов на километр расходится на ${r.dPows.toFixed(1)}% (${r.touch.pows.toFixed(2)} против ${r.gyro.pows.toFixed(2)})`);
    post(name,true,`на километр: звёзды ${r.touch.stars.toFixed(1)}/${r.gyro.stars.toFixed(1)}, бонусы ${r.touch.pows.toFixed(2)}/${r.gyro.pows.toFixed(2)}, преграды ${r.touch.obs.toFixed(1)}/${r.gyro.obs.toFixed(1)}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 61 — До стены коридора одинаково далеко на любом экране.
   Стережёт: цель пальца в game.js (ЯДРО).
   Беда: цель зажималась шириной ЭКРАНА. Управление позиционное (скорость =
   0.12 от расстояния до цели), поэтому запас за стеной решал всё: на
   телефоне 390 мер он был 4 меры — самолёт замирал в четырёх мерах от
   стены и прижаться не мог физически; на десктопе запас 500 мер давал
   мгновенный прижим на полной скорости. */
async function guardWallReachableEverywhere(browser){
  const name = '61. Стена коридора достижима одинаково на узком и широком экране';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      function timeToWall(worldW){
        runMode='classic'; startGame();
        W=worldW; H=844;                                  // подменяем мир, как это делает resize
        const fl=fieldL(), wall=fl+20;
        plane.x=fl+fieldW()/2; plane.vx=0;
        input.touchX=fl-500; input.touchY=plane.y;        // палец уводит далеко за левый край
        input.useGyro=false;
        for(let i=0;i<600;i++){ update(1/60); if(plane.x<=wall+2) return i/60; }
        return null;                                       // не дошёл
      }
      return { narrow:timeToWall(390), wide:timeToWall(1500) };
    });
    if(r.narrow===null) return post(name,false,'на экране 390 мер самолёт ТАК И НЕ дошёл до стены коридора за 10 секунд — манёвр физически недоступен');
    if(r.wide===null)   return post(name,false,'на широком экране не дошёл — сценарий не тот');
    const ratio=Math.max(r.narrow,r.wide)/Math.min(r.narrow,r.wide);
    if(ratio>1.35) return post(name,false,`время прижима к стене расходится в ${ratio.toFixed(2)} раза (узкий ${r.narrow.toFixed(2)}с против широкого ${r.wide.toFixed(2)}с)`);
    post(name,true,`узкий ${r.narrow.toFixed(2)}с, широкий ${r.wide.toFixed(2)}с — расхождение ${((ratio-1)*100).toFixed(0)}%`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 62 — Вытянутый экран не даёт лишнего обзора.
   Стережёт: вертикальный коридор в game.js (ЯДРО).
   Беда: потолок и пол самолётика мерили H — высоту конкретного экрана.
   H не меньше 844, но у 21:9 доходит до 910: игрок видел небо на 8.5%
   дальше и получал лишние 0.13с на реакцию просто за форму устройства. */
async function guardVerticalCorridor(browser){
  const name = '62. Вытянутый экран не даёт лишнего поля по вертикали';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      function span(worldH){
        runMode='classic'; startGame(); W=390; H=worldH;
        input.touchX=plane.x; input.useGyro=false;
        input.touchY=-9999; for(let i=0;i<400;i++) update(1/60); const top=plane.y;
        input.touchY=99999; for(let i=0;i<400;i++) update(1/60); const bot=plane.y;
        return +(bot-top).toFixed(1);
      }
      return { normal:span(844), tall:span(910) };
    });
    const diff=Math.abs(r.tall-r.normal)/r.normal*100;
    if(diff>2) return post(name,false,`поле по вертикали на экране 910 мер — ${r.tall} против ${r.normal} на 844 (+${diff.toFixed(1)}%): вытянутый телефон видит дальше и реагирует дольше`);
    post(name,true,`поле по вертикали одинаково: ${r.normal} и ${r.tall} мер`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 63 — Мозг неба помогает новичку, а не мешает.
   Стережёт: применение множителя в ui.js + adaptive.js.
   Беда: d читается как «доля плотности», но попадает в ПАУЗУ между
   спавнами — умножение переворачивало знак. Измерено: новичок получал
   небо в 1.67 раза ПЛОТНЕЕ, разрыв с асом 2.17× в пользу аса. */
async function guardAdaptiveHelpsNewbie(browser){
  const name = '63. Мозг неба разряжает небо новичку, а не сгущает';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      function densityFor(avg,runs){
        Store.set('adaptiveProfile',{avgSurvival:avg,deathsByKind:{},runs:runs});
        runMode='custom'; startGame();
        return +S.customD.toFixed(3); // множитель ПАУЗЫ: больше = небо реже
      }
      return { newbie:densityFor(5,10), ace:densityFor(200,10), unknown:densityFor(30,1) };
    });
    if(!(r.newbie>r.unknown)) return post(name,false,`новичку пауза между преградами ${r.newbie} против ${r.unknown} у неизвестного — небо для него НЕ разрежено`);
    if(!(r.ace<r.unknown))    return post(name,false,`асу пауза ${r.ace} против ${r.unknown} — небо для него не сгущено`);
    if(!(r.newbie>r.ace))     return post(name,false,`новичок ${r.newbie} против аса ${r.ace} — знак подкрутки перевёрнут`);
    post(name,true,`пауза: новичок ${r.newbie} > обычный ${r.unknown} > ас ${r.ace} — помощь идёт в нужную сторону`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 64 — Перезапуск приложения не отмывает забег.
   Стережёт: автосейв и восстановление в ui.js.
   Беда: восстанавливались только счёт и жизни. Плавность прыгала с 0.75
   до 1.0 (+33% к итогу), часы Спидрана обнулялись (рекорд «за 10 секунд»),
   благодать выдавалась заново — то есть закрыть приложение перед ударом
   и открыть заново было выгодной стратегией. */
async function guardRestartDoesNotLaunder(browser){
  const name = '64. Перезапуск приложения не отмывает забег';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='speedrun'; startGame();
      S.score=9000; S.dist=800; S.lives=1; S.smooth=0.5; S.time=180; S.hits=7; S.bonuses=3;
      autosave();
      const saved=Store.get('savedRun',null);
      runMode='classic'; startGame(saved||undefined);
      const after={ smooth:+S.smooth.toFixed(3), time:Math.round(S.time), hits:S.hits, restored:S.wasRestored|0, invuln:+S.invuln.toFixed(2) };
      // и контроль: свежий взлёт получает благодать как обычно
      Store.del('savedRun'); bootFly();
      return { after, freshInvuln:+S.invuln.toFixed(2) };
    });
    if(r.after.smooth>0.6) return post(name,false,`плавность после восстановления ${r.after.smooth} вместо 0.5 — множитель итога подскочил, это +33% к очкам за перезапуск`);
    if(r.after.time<170)   return post(name,false,`часы полёта после восстановления ${r.after.time}с вместо 180 — рекорд Спидрана берётся из воздуха`);
    if(!r.after.restored)  return post(name,false,'забег не помечен как восстановленный — рекорд дня и Спидрана пройдут как свежие');
    if(r.freshInvuln<2)    return post(name,false,`свежий взлёт потерял благодать на разгон (${r.freshInvuln}с) — правка задела лишнее`);
    post(name,true,`плавность ${r.after.smooth}, часы ${r.after.time}с, метка восстановления стоит; свежему взлёту благодать ${r.freshInvuln}с`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 65 — Попытку дня не вернуть переводом часов.
   Стережёт: журнал отыгранных дней в ui.js.
   Беда: печать стояла одной записью. Перевёл часы на завтра — запись
   перезаписалась, вернул назад — дверь снова открыта. Ритуал «один
   прыжок в день» обходился за двадцать секунд настройками телефона. */
async function guardDailyAttemptSurvivesClockChange(browser){
  const name = '65. Попытку дня не вернуть переводом часов телефона';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const today=todayKey();
      runMode='daily'; startGame();                       // взлёт — попытка сгорела
      S.score=1000; S.smooth=1; gameOver();
      await new Promise(res=>setTimeout(res,40));
      const lockedNow=dailyDoneHas(today);
      // игрок «перевёл часы на завтра» и слетал ещё раз
      const tomorrow='2999-12-31';
      Store.set('dailyRun',{d:tomorrow,s:1,done:1});
      // и вернул часы назад
      const lockedBack=dailyDoneHas(today);
      return { lockedNow, lockedBack, journal:dailyDoneList().length };
    });
    if(!r.lockedNow)  return post(name,false,'после забега день не помечен в журнале — печать не ставится');
    if(!r.lockedBack) return post(name,false,'после подмены записи дня печать пропала — попытка возвращается переводом часов');
    post(name,true,`день отмечен в журнале и переживает подмену записи (записей в журнале: ${r.journal})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 66 — Битое хранилище не мешает игре взлететь.
   Стережёт: чтение bbTape (blackbox.js) и ach/achQ (ach.js).
   Беда: битая лента самописца проходила проверку .length, tape становился
   строкой, tape.push бросал TypeError ВНУТРИ инициализатора const BB — и
   привязка BB навсегда оставалась в мёртвой зоне, из-за чего каждое
   typeof BB!=='undefined' бросало ReferenceError. Игра не взлетала вовсе. */
async function guardBrokenTapeDoesNotKillBoot(browser){
  const name = '66. Битая лента и битые достижения не роняют игру';
  let ctx;
  try{
    const ctx0 = await browser.newContext({ viewport:{width:390,height:844} });
    ctx = ctx0;
    const page = await ctx0.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/*', rt=>/sentry-cdn|cdn\.amplitude|telegram\.org\/js/.test(rt.request().url())?rt.abort():
      (/supabase\.co/.test(rt.request().url())?rt.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}):rt.continue()));
    await page.addInitScript(()=>{ window.__labOpen=true;
      try{ localStorage.clear();
        localStorage.setItem('cosmogram_v2', JSON.stringify({ bbTape:'мусор', ach:'мусор', achQ:42, stats:{} }));
      }catch(e){} });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined',null,{timeout:12000});
    const r = await page.evaluate(async ()=>{
      const steps=[];
      try{ runMode='classic'; startGame(); steps.push('взлёт'); }catch(e){ return {crash:'взлёт: '+e.message}; }
      try{ S.score=500; S.smooth=1; gameOver(); steps.push('посадка'); }catch(e){ return {crash:'посадка: '+e.message}; }
      await new Promise(res=>setTimeout(res,60));
      return { crash:null, steps };
    });
    if(r.crash) return post(name,false,`битое хранилище уронило игру на шаге «${r.crash}»`);
    const hard=errs.filter(e=>/is not defined|is not a function|Cannot read/.test(e));
    if(hard.length) return post(name,false,`исключение при битом хранилище: ${hard[0]}`);
    post(name,true,`взлёт и посадка пережиты на битых bbTape/ach/achQ (${r.steps.join(' → ')})`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 11 — ЧЕСТНОСТЬ ЦИФР, ПРИВАТНОСТЬ И КАДР
   ============================================================ */

/* Страж 67 — Тумблер телеметрии гасит все каналы, а не один.
   Стережёт: __telemetryAllowed() в index.html.
   Беда: выключатель в настройках назывался «помогать отчётами», но
   гасил только «Почту неба». Sentry и Amplitude собирали независимо и
   выключателя не имели вовсе — человек нажал «нет», а данные шли. */
async function guardTelemetryToggleStopsAll(browser){
  const name = '67. Выключатель телеметрии гасит и Sentry, и Amplitude';
  let ctx;
  try{
    const o = await openGame(browser, { init:()=>{ try{ localStorage.clear();
      localStorage.setItem('cosmogram_v2', JSON.stringify({beaconOn:0})); }catch(e){} } });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      if(typeof __telemetryAllowed!=='function') return {missing:true};
      const off = __telemetryAllowed();
      let sentryInit=0, ampInit=0;
      window.Sentry = { init:()=>{ sentryInit++; }, setTag:()=>{} };
      window.amplitude = { init:()=>{ ampInit++; }, add:()=>{}, sessionReplayPlugin:()=>({}) };
      try{ __sentryBoot(); }catch(e){}
      try{ __amplitudeBoot(); }catch(e){}
      // а теперь игрок разрешил — те же ворота должны открыться
      const raw=JSON.parse(localStorage.getItem('cosmogram_v2')||'{}'); raw.beaconOn=1;
      localStorage.setItem('cosmogram_v2', JSON.stringify(raw));
      const on = __telemetryAllowed();
      try{ __sentryBoot(); }catch(e){}
      try{ __amplitudeBoot(); }catch(e){}
      return { off, on, sentryInit, ampInit };
    });
    if(r.missing) return post(name,false,'общих ворот телеметрии нет — Sentry и Amplitude выключателя не знают');
    if(r.off!==false) return post(name,false,'при выключенном тумблере ворота всё равно открыты');
    if(r.sentryInit!==1) return post(name,false,`Sentry инициализировался ${r.sentryInit} раз вместо одного (при «нет» — молчание, при «да» — работа)`);
    if(r.ampInit!==1) return post(name,false,`Amplitude инициализировался ${r.ampInit} раз вместо одного`);
    if(r.on!==true) return post(name,false,'после согласия ворота не открылись — тумблер сломал наблюдение совсем');
    post(name,true,'при «нет» оба канала молчат, при «да» поднимаются по одному разу');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 68 — Подпись Telegram не остаётся в адресе страницы.
   Стережёт: чистку хеша в index.html.
   Беда: Telegram кладёт initData вместе с подписью в адрес и не убирает.
   Sentry шлёт полный адрес с каждой ошибкой, Amplitude — с каждым
   событием: у кого есть доступ к проектам, тот может действовать от
   имени игрока. Мост данные к себе уже забрал — в адресе они лишние. */
async function guardTgSignatureStrippedFromUrl(browser){
  const name = '68. Подпись Telegram не остаётся в адресе страницы';
  let ctx;
  try{
    ctx = await browser.newContext({ viewport:{width:390,height:844} });
    const page = await ctx.newPage();
    await page.route('**/*', route=>{
      const url=route.request().url();
      if(/sentry-cdn\.com|cdn\.amplitude\.com|telegram\.org\/js|discord\.com/.test(url)) return route.abort('connectionfailed');
      if(/supabase\.co/.test(url)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      return route.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    const dirty = '#tgWebAppData=user%3D%257B%2522id%2522%253A1%257D%26auth_date%3D1%26hash%3Ddeadbeefcafe&tgWebAppVersion=8.0';
    await page.goto(BASE + dirty, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined', null, {timeout:15000});
    const r = await page.evaluate(()=>({ hash:location.hash, href:location.href }));
    if(/hash%3D|hash=|tgWebAppData/.test(r.href)) return post(name,false,`подпись осталась в адресе: ${r.href.slice(-70)}`);
    if(r.hash) return post(name,false,`хеш не снят: ${r.hash.slice(0,60)}`);
    post(name,true,'хеш с подписью снят сразу после моста — в Sentry и Amplitude уходит чистый адрес');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 69 — Трасса дня одна и та же по обе стороны линии смены дат.
   Стережёт: trackDayKey() (UTC) в core.js и его 15 мест применения.
   Беда: ключ трассы брался из МЕСТНОЙ даты. «11 августа» открывалось в
   UTC+14 и закрывалось в UTC−12 — окно почти 50 часов, и всё это время
   игроки летели по РАЗНЫМ трассам, попадая в одну таблицу. Западный
   пояс вдобавок мог изучить трассу по чужим роликам до своей попытки. */
async function guardDailyTrackIsUtc(browser){
  const name = '69. Трасса дня одинакова по обе стороны линии смены дат';
  const ctxs = [];
  try{
    const seeds = [];
    for(const tz of ['Pacific/Kiritimati','Etc/GMT+12']){   // UTC+14 и UTC−12: 26 часов разницы
      const c = await browser.newContext({ viewport:{width:390,height:844}, timezoneId:tz });
      ctxs.push(c);
      const page = await c.newPage();
      await page.route('**/*', route=>{
        const url=route.request().url();
        if(/sentry-cdn\.com|cdn\.amplitude\.com|telegram\.org\/js|discord\.com/.test(url)) return route.abort('connectionfailed');
        if(/supabase\.co/.test(url)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
        return route.continue();
      });
      await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
      await page.goto(BASE,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof startGame==='function', null, {timeout:15000});
      seeds.push(await page.evaluate(()=>{
        runMode='daily'; startGame();
        const day = mapSeedKey;
        runMode='speedrun'; startGame();
        return { day, speed:mapSeedKey, local:todayKey(), utc:(typeof trackDayKey==='function'?trackDayKey():null) };
      }));
    }
    const [a,b] = seeds;
    if(a.utc==null) return post(name,false,'отдельного ключа трассы по UTC нет — трасса по-прежнему привязана к часовому поясу');
    if(a.day!==b.day) return post(name,false,`трасса дня разная: «${a.day}» в UTC+14 и «${b.day}» в UTC−12`);
    if(a.speed!==b.speed) return post(name,false,`трасса Спидрана разная: «${a.speed}» и «${b.speed}»`);
    if(a.local===b.local) return post(name,false,'местные даты совпали — сценарий не проверил ничего, стража надо чинить');
    post(name,true,`трасса «${a.day}» по обе стороны, при местных датах ${a.local} и ${b.local}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ for(const c of ctxs) await c.close(); }
}

/* Страж 70 — У очков есть потолок правдоподобия, а с отправкой едет паспорт забега.
   Стережёт: saneScore/SCORE_CEIL в sync.js и runPass в ui.js.
   Беда: в мировую таблицу уходил не результат забега, а СОДЕРЖИМОЕ
   localStorage — пять ключей, прочитанных как есть. Подпись Telegram
   удостоверяет личность, но не результат. Потолок и паспорт не делают
   накрутку невозможной, но поднимают её цену и дают серверу что сверять. */
async function guardScoreCeilingAndPassport(browser){
  const name = '70. Очки не безграничны, а с отправкой едет паспорт забега';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      if(typeof syncLocalScores!=='function') return {missing:'syncLocalScores'};
      Store.set('bestTouch', 9e15); Store.set('bestDist', -50); Store.set('bestGyro', 'мусор');
      const sc = syncLocalScores();
      let seen=null;
      const real = window.syncSubmit;
      window.syncSubmit = (scores, extra)=>{ seen={scores, extra}; return Promise.resolve({ok:true}); };
      runMode='classic'; startGame();
      S.score=1234; S.dist=777; S.time=42; S.smooth=1;
      gameOver();
      await new Promise(res=>setTimeout(res,80));
      window.syncSubmit = real;
      return { sc, seen };
    });
    if(r.missing) return post(name,false,`нет ${r.missing} — сценарий не тот`);
    if(!(r.sc.touch>0 && r.sc.touch<=5000000)) return post(name,false,`потолка нет: 9e15 в хранилище уехало как ${r.sc.touch}`);
    if(r.sc.dist!==0) return post(name,false,`отрицательный рекорд уехал как ${r.sc.dist}`);
    if(r.sc.gyro!==0) return post(name,false,`строка вместо числа уехала как ${r.sc.gyro}`);
    const pass = r.seen && r.seen.extra && r.seen.extra.run;
    if(!pass) return post(name,false,'паспорт забега не приложен — сервер по-прежнему видит только чтение хранилища');
    if(pass.score!==1234) return post(name,false,`в паспорте чужой счёт: ${pass.score} вместо 1234`);
    if(!pass.mode || !pass.v) return post(name,false,'в паспорте нет режима или версии — серверу нечем отличать сборки');
    post(name,true,`потолок 5 000 000 держит (9e15 → ${r.sc.touch}), мусор → 0; паспорт: счёт ${pass.score}, режим ${pass.mode}, версия ${pass.v}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 71 — Единица длины живёт в словаре, а не в коде.
   Стережёт: ключ unitM во всех пяти языках.
   Беда: «м» была зашита кириллицей прямо в строках — итоги, топ,
   карточка шеринга и Кузница показывали русскую букву англичанину,
   испанцу, португальцу и французу. */
async function guardMetreUnitLocalized(browser){
  const name = '71. Единица «м» берётся из словаря во всех пяти языках';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const langs = Object.keys(I18N);
      const missing = langs.filter(k=>typeof I18N[k].unitM!=='string' || !I18N[k].unitM);
      const cyr = langs.filter(k=>k!=='ru' && /[а-яё]/i.test(I18N[k].unitM||''));
      // и в самом коде литерала быть не должно
      const files = ['js/ui.js','js/card.js','js/forge.js','js/game.js'];
      const dirty = [];
      for(const f of files){
        const t = await (await fetch('./'+f+'?probe='+Math.random())).text();
        if(/\+\s*' м'|\+\s*" м"/.test(t)) dirty.push(f);
      }
      return { langs, missing, cyr, dirty };
    });
    if(r.missing.length) return post(name,false,`в словарях нет unitM: ${r.missing.join(', ')}`);
    if(r.cyr.length) return post(name,false,`кириллица в нерусском словаре: ${r.cyr.join(', ')}`);
    if(r.dirty.length) return post(name,false,`литерал ' м' остался в коде: ${r.dirty.join(', ')}`);
    post(name,true,`unitM есть во всех ${r.langs.length} языках, в коде литерала нет`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 72 — Полноэкранный спрайт меряется экраном, а не небом.
   Стережёт: skyPx() в render.js (виньетка и поле туманностей).
   Беда: офскрины на весь кадр рисовались размером W*DPR, где W — меры
   неба (cssW/SC). Клали их через drawImage(...,0,0,W,H), то есть под
   линейкой DPR*SC — на любом экране крупнее эталона спрайт растягивался
   ровно в SC раз. На планшете фон и виньетка шли в ~60% плотности. */
async function guardFullscreenSpritesInDevicePixels(browser){
  const name = '72. Полноэкранные спрайты рисуются в пикселях экрана, а не в мерах неба';
  let ctx;
  try{
    ctx = await browser.newContext({ viewport:{width:1000,height:1400}, deviceScaleFactor:2 }); // планшет: SC заведомо >1
    const page = await ctx.newPage();
    await page.route('**/*', route=>{
      const url=route.request().url();
      if(/sentry-cdn\.com|cdn\.amplitude\.com|telegram\.org\/js|discord\.com/.test(url)) return route.abort('connectionfailed');
      if(/supabase\.co/.test(url)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      return route.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof startGame==='function', null, {timeout:15000});
    const r = await page.evaluate(()=>{
      runMode='classic'; startGame(); S.paused=true;
      const v = vignetteSprite(), n = nebulaField(200,240);
      return { SC:+SC.toFixed(3), cw:canvas.width, ch:canvas.height,
               vw:v.width, vh:v.height, nw:n.width, nh:n.height };
    });
    if(r.SC<=1.05) return post(name,false,`масштаб неба ${r.SC} — сценарий не про крупный экран, стража надо чинить`);
    const near=(a,b)=>Math.abs(a-b)<=2;
    if(!near(r.vw,r.cw)||!near(r.vh,r.ch))
      return post(name,false,`виньетка ${r.vw}×${r.vh} против холста ${r.cw}×${r.ch} — плотность ${Math.round(r.vw/r.cw*100)}%, картинку растягивают`);
    if(!near(r.nw,r.cw)||!near(r.nh,r.ch))
      return post(name,false,`поле туманностей ${r.nw}×${r.nh} против холста ${r.cw}×${r.ch} — плотность ${Math.round(r.nw/r.cw*100)}%`);
    post(name,true,`при масштабе ${r.SC} спрайты ${r.vw}×${r.vh} и ${r.nw}×${r.nh} совпали с холстом ${r.cw}×${r.ch}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 73 — Потеря контекста холста не оставляет игрока в пустоте.
   Стережёт: gfxInvalidate() в render.js и слушатели холста в core.js.
   Беда: браузер вправе отобрать контекст 2D (Android под нехваткой
   памяти, смена GPU). После этого все градиенты и офскрины — мусор, а
   холст пуст. Игра события не слушала: фон и свечения пропадали до
   перезагрузки страницы, о которой игрок в Telegram не догадывается. */
async function guardCanvasContextLossRecovers(browser){
  const name = '73. Потеря контекста холста лечится сама, без перезагрузки';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const errs=[];
    o.page.on('pageerror', e=>errs.push(e.message));
    const r = await o.page.evaluate(()=>{
      if(typeof gfxInvalidate!=='function') return {missing:true};
      runMode='classic'; startGame();
      const v1 = vignetteSprite(), n1 = nebulaField(200,240);
      canvas.dispatchEvent(new Event('contextlost'));
      const paused = !!(S.paused||S.pausing); // pauseGame сначала ставит pausing — «Склейка» доводит паузу за кадр
      canvas.dispatchEvent(new Event('contextrestored'));
      const v2 = vignetteSprite(), n2 = nebulaField(200,240);
      let drew=true; try{ draw(); }catch(e){ drew=false; }
      return { paused, vNew:v1!==v2, nNew:n1!==n2, drew };
    });
    if(r.missing) return post(name,false,'общего сброса кэшей нет — после потери контекста небо остаётся пустым до перезагрузки');
    if(!r.paused) return post(name,false,'полёт не встал на паузу при потере холста — игрок бьётся в чёрный экран');
    if(!r.vNew || !r.nNew) return post(name,false,'после возврата контекста кэши прежние — рисуем протухшими битмапами');
    if(!r.drew) return post(name,false,'кадр после восстановления не нарисовался');
    if(errs.length) return post(name,false,`исключение при потере контекста: ${errs[0]}`);
    post(name,true,'полёт встал на паузу, кэши забыты, кадр после возврата рисуется');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 99 — Нулевой вьюпорт в момент resize() не оставляет канвас-спрайты нулевого размера.
   Стережёт: resize() в core.js (ЯДРО) и vignetteSprite() в render.js.
   Беда (Каталог ошибок №29): Telegram может на миг отдать cssW/cssH=0 в момент входа/выхода
   из fullscreen (viewportChanged до того, как вьюпорт устаканился). resize() тогда пишет W=0,
   vignetteSprite() кэширует офскрин-канвас 0×0, и следующий же ctx.drawImage(vignetteSprite())
   бросает InvalidStateError — источник нулевого размера недопустим для drawImage. */
/* Страж 100 — Вне Telegram верхний HUD не прилипает к самому краю экрана.
   Стережёт: tgInsetsSync() в core.js (ЯДРО).
   Беда: --js-sat считается только из сигналов Telegram (t.contentSafeAreaInset, «родная шапка
   96px»). Вне Telegram (t=null) ни один из них не срабатывает, --js-sat остаётся 0, и
   #scorePack/#topHud падают к минимальным 2px/72px — вплотную к верхнему краю экрана, тогда
   как внутри Telegram под родную шапку выделено ~96px. Разница ощущается как «пауза/звёзды/
   счёт слишком тесно жмутся к краю» на скринах вне Telegram. */
async function guardNonTelegramHudGetsBreathingRoom(browser){
  const name = '100. Вне Telegram HUD получает такую же подушку сверху, как внутри';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const isTg = !!(typeof tgApp==='function' && tgApp());
      tgInsetsSync();
      const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--js-sat')) || 0;
      const scoreTop = parseFloat(getComputedStyle(document.getElementById('scorePack')).top) || 0;
      return { isTg, sat, scoreTop };
    });
    if(r.isTg) return post(name,false,'тестовый стенд неожиданно посчитал себя внутри Telegram — страж не проверил нужный случай');
    if(r.sat<96) return post(name,false,`вне Telegram --js-sat=${r.sat}px — меньше 96px родной шапки Telegram, HUD не совпадёт между окружениями`);
    if(r.scoreTop<15) return post(name,false,`#scorePack.top=${r.scoreTop}px вне Telegram — счёт всё ещё вплотную к верхнему краю`);
    post(name,true,`вне Telegram --js-sat=${r.sat}px, #scorePack.top=${r.scoreTop}px — совпадает с телеграмным отступом`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

async function guardResizeSurvivesZeroViewport(browser){
  const name = '99. Нулевой вьюпорт в момент resize() не ломает vignetteSprite()';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const errs=[];
    o.page.on('pageerror', e=>errs.push(e.message));
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame();
      const beforeW = W, beforeH = H, beforeCw = canvas.width, beforeCh = canvas.height;
      // эмулируем телеграмовский миг нулевого вьюпорта в момент resize()
      const origW = Object.getOwnPropertyDescriptor(window,'innerWidth');
      Object.defineProperty(window,'innerWidth',{configurable:true,get:()=>0});
      let threw=false, thrownMsg='';
      try{
        resize();
        // ровно то, что делает render.js:819 на следующем кадре
        ctx2d(canvas).drawImage(vignetteSprite(),0,0,W||1,H||1);
      }catch(e){ threw=true; thrownMsg=e.message; }
      finally{
        if(origW) Object.defineProperty(window,'innerWidth',origW);
        else delete window.innerWidth;
      }
      const spriteAfterZero = vignetteSprite();
      resize(); // реальный корректирующий resize, как в игре
      const spriteAfterRecover = vignetteSprite();
      return {
        threw, thrownMsg,
        wAfterZero: W, hAfterZero: H,
        cwAfterZero: canvas.width, chAfterZero: canvas.height,
        spriteW0: spriteAfterZero.width, spriteH0: spriteAfterZero.height,
        spriteW1: spriteAfterRecover.width, spriteH1: spriteAfterRecover.height,
        beforeW, beforeH, beforeCw, beforeCh
      };
    });
    if(r.threw) return post(name,false,`drawImage бросил исключение при нулевом вьюпорте: ${r.thrownMsg}`);
    if(r.wAfterZero<=0 || r.hAfterZero<=0)
      return post(name,false,`resize() при cssW=0 обнулил мир (W=${r.wAfterZero}, H=${r.hAfterZero}) вместо того, чтобы оставить прежний`);
    if(r.cwAfterZero<=0 || r.chAfterZero<=0)
      return post(name,false,`resize() при cssW=0 обнулил канвас (${r.cwAfterZero}×${r.chAfterZero})`);
    if(r.spriteW0<=0 || r.spriteH0<=0)
      return post(name,false,`vignetteSprite() вернул спрайт нулевого размера сразу после cssW=0`);
    if(r.spriteW1<=0 || r.spriteH1<=0)
      return post(name,false,`vignetteSprite() остался нулевого размера даже после корректирующего resize()`);
    if(errs.length) return post(name,false,`исключение вне evaluate: ${errs[0]}`);
    post(name,true,`resize() не принял cssW=0 (мир остался ${r.wAfterZero}×${r.hAfterZero}), drawImage не упал`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}


/* Страж 74 — Градиенты спутников и обломков не создаются каждый кадр.
   Стережёт: gradCache в render.js.
   Беда: у спутника 3–6 градиентов, у обломка один, у значка бонуса один —
   и все создавались заново в КАЖДОМ кадре. При десятке предметов на
   экране это 2400–4800 объектов CanvasGradient в секунду, каждый со своим
   разбором цветов; сборщик мусора потом дёргает кадр. */
async function guardGradientsAreCached(browser){
  const name = '74. Градиенты спутников и обломков не пересоздаются каждый кадр';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame(); S.paused=true;
      obstacles.length=0;
      for(let i=0;i<6;i++){
        obstacles.push({kind:'sat',   x:60+i*40, y:200+i*20, r:12+i, rot:.2, skin:i%4, ph:i*.7, vx:0, vy:0});
        obstacles.push({kind:'debris',x:80+i*35, y:520+i*18, w:34+i, h:24+i, rot:.1, skin:i%4, ph:i*.4, vx:0, vy:0});
      }
      let n=0;
      const cl=ctx.createLinearGradient.bind(ctx), cr=ctx.createRadialGradient.bind(ctx);
      ctx.createLinearGradient=function(){ n++; return cl.apply(null,arguments); };
      ctx.createRadialGradient=function(){ n++; return cr.apply(null,arguments); };
      for(let f=0;f<8;f++) draw();
      const warm=n; n=0;
      for(let f=0;f<8;f++) draw();
      const hot=n;
      ctx.createLinearGradient=cl; ctx.createRadialGradient=cr;
      return { warm, hot, items:obstacles.length };
    });
    if(r.warm<10) return post(name,false,`за прогрев создано всего ${r.warm} градиентов — предметы не рисовались, сценарий не тот`);
    if(r.hot>r.warm/4) return post(name,false,`на прогретых кэшах создано ${r.hot} градиентов за 8 кадров (было ${r.warm}) — кэша нет`);
    post(name,true,`${r.items} предметов: прогрев ${r.warm} градиентов, дальше ${r.hot} за 8 кадров`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 75 — Отказ в полном экране возвращает флаг погружения к правде.
   Стережёт: tgFullscreenFailed() в core.js.
   Беда: cgImm — это НАША просьба, она нарочно опережает ответ Telegram.
   Если ответом стал отказ (старый клиент, окно, десктоп), события
   fullscreenChanged не приходит вовсе — флаг навсегда врёт, подушка
   считает шапку скрытой, счёт и кнопки уезжают под рамку мессенджера. */
async function guardFullscreenFailedResetsFlag(browser){
  const name = '75. Отказ Telegram в полном экране не оставляет флаг врать';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      if(typeof tgFullscreenFailed!=='function') return {missing:true};
      cgImm = true;
      tgFullscreenFailed({error:'UNSUPPORTED'});
      const afterRefuse = cgImm;
      cgImm = false;
      tgFullscreenFailed({error:'ALREADY_FULLSCREEN'});
      const afterAlready = cgImm;
      cgImm = null;
      return { afterRefuse, afterAlready, w:W, h:H };
    });
    if(r.missing) return post(name,false,'fullscreenFailed не слушается — после отказа флаг погружения врёт до конца сессии');
    if(r.afterRefuse!==false) return post(name,false,`после отказа флаг остался ${r.afterRefuse} — подушка считает шапку скрытой`);
    if(r.afterAlready!==true) return post(name,false,'ALREADY_FULLSCREEN сброшен как отказ — а это единственный отказ, означающий «уже да»');
    if(!(r.w>0 && r.h>0)) return post(name,false,'после обработки отказа мир нулевого размера — resize оборвался');
    post(name,true,'UNSUPPORTED → погружение снято, ALREADY_FULLSCREEN → оставлено, мир пересчитан');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 76 — Чужое имя из таблицы рекордов не становится разметкой.
   Стережёт: экранирование в renderTop (ui.js).
   Беда: из имени просто вырезались три символа, а pid уходил в атрибут
   без приведения к числу — кавычка в нём разрывала атрибут. Имя приходит
   с сервера, то есть от другого игрока: это чужой ввод в innerHTML. */
async function guardTopListEscapesNames(browser){
  const name = '76. Чужое имя и pid из таблицы рекордов не разрывают разметку';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const errs=[];
    o.page.on('pageerror', e=>errs.push(e.message));
    const r = await o.page.evaluate(async ()=>{
      window.syncInitData = ()=>'lab';
      window.syncAvailable = ()=>true;
      window.syncTop = ()=>Promise.resolve({ ok:true, me:null, top:[
        { name:'<img src=x onerror="window.__pwn=1">', username:'"><b>zz</b>', provider:'tg',
          best:100, pid:'1" onmouseover="window.__pwn=2' },
        { name:'Смит & Сын', username:'ok', provider:'tg', best:50, pid:7 }
      ]});
      topCat='touch';
      openAch();   // renderTop бросает работу, если экран не «ach» — открываем по-настоящему
      renderTop();
      await new Promise(res=>setTimeout(res,120));
      const list=$('topList');
      const btn=list.querySelector('.topGh');
      return { pwn:window.__pwn||0, imgs:list.querySelectorAll('img').length,
               bolds:list.querySelectorAll('b:not(.pvTag)').length,
               gh:btn?btn.dataset.gh:null,
               attrs:btn?Array.from(btn.attributes).map(a=>a.name).join(','):'',
               amp:/Смит & Сын|Смит &amp; Сын/.test(list.textContent),
               text:list.textContent.slice(0,60) };
    });
    if(r.pwn) return post(name,false,'чужая разметка исполнилась — имя из таблицы попало в DOM как код');
    if(r.imgs) return post(name,false,`в списке ${r.imgs} чужих <img> — имя вставлено как разметка`);
    if(r.bolds) return post(name,false,'чужой <b> из имени попал в разметку — кавычки не закрыты');
    if(r.gh && !/^\d+$/.test(r.gh)) return post(name,false,`pid в атрибуте не число: «${r.gh}»`);
    if(/on[a-z]+/.test(r.attrs)) return post(name,false,`кнопка призрака получила чужой обработчик из pid: ${r.attrs}`);
    if(!r.amp) return post(name,false,'амперсанд в честном имени пропал — экранирование заменили выкусыванием');
    post(name,true,`разметка цела, pid «${r.gh}» — число, «Смит & Сын» сохранил амперсанд`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 12 — МАГАЗИН, ЛИЦЕНЗИЯ И ЧЕСТНЫЙ ТЕКСТ
   ============================================================ */

/* Страж 77 — Магазин не открывается сам, без единого забега.
   Стережёт: тир-цены SKINS в game.js.
   Беда: с v1.46.0 в коде висела заглушка «ВРЕМЕННО: все скины по 10 ✦ —
   вернуть тир-цены до публикации», и она пережила 236 версий. Награды за
   достижения (130 ✦) превышали стоимость всей коллекции (80 ✦): игрок
   собирал магазин целиком, ни разу не полетев, и звёзды теряли смысл. */
async function guardSkinPricesAreTiered(browser){
  const name = '77. Магазин не открывается наградами за достижения';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const prices = SKINS.map(s=>s.price);
      const paid = prices.slice(1);
      const total = paid.reduce((a,b)=>a+b,0);
      const rewards = (typeof ACH!=='undefined' && Array.isArray(ACH)) ? ACH.reduce((a,x)=>a+(x.rw||0),0) : null;
      let rising = true;
      for(let i=1;i<paid.length;i++) if(paid[i] <= paid[i-1]) rising = false;
      return { prices, total, rewards, rising, free:prices[0] };
    });
    if(r.free!==0) return post(name,false,`стартовый самолётик стоит ${r.free} — он должен быть бесплатным`);
    if(r.prices.some(p=>p===10)) return post(name,false,`временная цена 10 ✦ ещё в коде: ${r.prices.join('/')}`);
    if(!r.rising) return post(name,false,`цены не растут по тирам: ${r.prices.join('/')}`);
    if(r.rewards!=null && r.total <= r.rewards*5)
      return post(name,false,`вся коллекция стоит ${r.total} ✦ при ${r.rewards} ✦ наград за достижения — магазин закрывается почти даром`);
    post(name,true,`цены ${r.prices.slice(1).join('/')}; коллекция ${r.total} ✦ против ${r.rewards} ✦ наград`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 78 — Текст лицензии шрифта лежит рядом со шрифтом.
   Стережёт: fonts/OFL.txt и его строку в SHELL (sw.js).
   Беда: файл отсутствовал в репозитории, хотя Exo 2 распространяется под
   SIL OFL, а лицензия прямо требует класть свой текст рядом со шрифтом.
   Строку из списка кэша пришлось убрать (caches.addAll атомарен, один 404
   рушит установку воркера) — и лицензия исчезла из сборки совсем. */
async function guardFontLicenseShipped(browser){
  const name = '78. Лицензия Exo 2 лежит рядом со шрифтом и попадает в сборку';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      const get = async (p)=>{ try{ const rs = await fetch('./'+p+'?probe='+Math.random());
        return rs.ok ? await rs.text() : null; }catch(e){ return null; } };
      const lic = await get('fonts/OFL.txt');
      const sw  = await get('sw.js');
      return { lic: lic ? lic.slice(0,4000) : null, len: lic?lic.length:0,
               inShell: !!(sw && /['"]fonts\/OFL\.txt['"]/.test(sw)) };
    });
    if(!r.lic) return post(name,false,'fonts/OFL.txt нет в сборке — SIL OFL требует класть текст лицензии рядом со шрифтом');
    if(r.len < 3000) return post(name,false,`fonts/OFL.txt подозрительно короткий (${r.len} байт) — это не полный текст лицензии`);
    if(!/SIL OPEN FONT LICENSE/i.test(r.lic)) return post(name,false,'в fonts/OFL.txt нет заголовка лицензии');
    if(!/Version 1\.1/.test(r.lic)) return post(name,false,'в fonts/OFL.txt не указана версия 1.1');
    if(!/Exo 2/.test(r.lic)) return post(name,false,'в fonts/OFL.txt нет строки авторских прав Exo 2 — лицензия без правообладателя не значит ничего');
    if(!r.inShell) return post(name,false,'fonts/OFL.txt не вписан в SHELL — в офлайн-сборку лицензия не попадёт');
    post(name,true,`лицензия на месте (${r.len} байт, Exo 2, OFL 1.1) и стоит в списке кэша`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 79 — Политика конфиденциальности не расходится с кодом.
   Стережёт: privacy.html.
   Беда: текст обещал «не передаём данные третьим лицам, обработка в рамках
   экосистемы Telegram», а данные фактически уходили в Supabase, Sentry
   (Германия) и Amplitude (ЕС). Обещание, которое код не выполняет, — не
   мелочь текста, а неверные сведения для игрока. */
async function guardPrivacyMatchesCode(browser){
  const name = '79. Политика конфиденциальности называет реальных получателей данных';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      try{
        const rs = await fetch('./privacy.html?probe='+Math.random());
        if(!rs.ok) return { missing:true };
        const t = await rs.text();
        return { t: t.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ') };
      }catch(e){ return { missing:true }; }
    });
    if(r.missing) return post(name,false,'privacy.html не отдаётся');
    const need = ['Supabase','Sentry','Amplitude'];
    const gone = need.filter(w=>!new RegExp(w,'i').test(r.t));
    if(gone.length) return post(name,false,`в политике не названы получатели данных: ${gone.join(', ')}`);
    if(/в рамках экосистемы Telegram/i.test(r.t))
      return post(name,false,'осталось обещание «обработка в рамках экосистемы Telegram» — код его не выполняет');
    if(!/переключател|тумблер|Настройки/i.test(r.t))
      return post(name,false,'в политике не сказано, как выключить телеметрию');
    post(name,true,'названы Supabase, Sentry и Amplitude; описан выключатель; ложного обещания нет');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 13 — ДНЕВНИК БОРТА
   ============================================================ */

/* Страж 80 — День засчитывается на взлёте и наполняется на посадке.
   Стережёт: dayMark/dayAdd в core.js и их вызовы в ui.js.
   Беда до правки: про игрока не было известно ничего, кроме имени и рекордов.
   На главный вопрос — возвращаются ли люди — ответить было нечем.
   Отдельно: день должен считаться на ВЗЛЁТЕ. Забег может кончиться без сети,
   игрок может закрыть приложение на занавесе — день всё равно был. */
async function guardDayJournalCounts(browser){
  const name = '80. Дневник дней ведётся: день на взлёте, цифры на посадке';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      if(typeof dayJournal!=='function') return {missing:true};
      const k = todayKey();
      runMode='classic'; startGame();
      const afterTakeoff = !!dayJournal()[k];       // день открыт уже на взлёте
      S.score=500; S.dist=1200; S.time=40; S.starsCollected=7; S.smooth=1;
      gameOver();
      await new Promise(res=>setTimeout(res,60));
      const a = dayJournal()[k];
      runMode='classic'; startGame();
      S.score=300; S.dist=900; S.time=25; S.starsCollected=3; S.smooth=1;
      gameOver();
      await new Promise(res=>setTimeout(res,60));
      const b = dayJournal()[k];
      return { missing:false, afterTakeoff, a, b, days:Object.keys(dayJournal()).length,
               daysTotal:Store.get('daysTotal',0), first:Store.get('firstDay','') };
    });
    if(r.missing) return post(name,false,'дневника дней нет — удержание игроков посчитать нечем');
    if(!r.afterTakeoff) return post(name,false,'день не отмечен на взлёте — забег без сети потеряет день целиком');
    if(r.b.runs!==2) return post(name,false,`забегов за день ${r.b.runs} вместо 2`);
    if(r.b.best!==500) return post(name,false,`лучший счёт дня ${r.b.best} вместо 500 (второй забег слабее — он не должен побеждать)`);
    if(r.b.dist!==2100) return post(name,false,`метры за день ${r.b.dist} вместо 2100 — не суммируются`);
    if(r.b.stars!==10) return post(name,false,`звёзды за день ${r.b.stars} вместо 10`);
    if(r.b.sec!==65) return post(name,false,`секунды в небе ${r.b.sec} вместо 65`);
    if(r.daysTotal<1) return post(name,false,'счётчик дней в игре не двинулся');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.first)) return post(name,false,`дата первого запуска не записана: «${r.first}»`);
    post(name,true,`день открыт на взлёте; за день ${r.b.runs} забега, лучший ${r.b.best}, ${r.b.dist} м, ${r.b.stars} ✦, ${r.b.sec} с; стаж ${r.daysTotal} дн. с ${r.first}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 81 — Выключенный тумблер убирает наблюдение, но не счёт.
   Стережёт: разделение в dayAdd и playerProfile (core.js).
   Решение владельца: агрегаты аккаунта (дни, забеги, экономика) — это его
   собственные факты, они едут всегда; наблюдение за тем, КАК он играет и от
   чего гибнет, — только с разрешения. Страж следит, что граница именно там,
   а не «выключили всё» и не «выключили ничего». */
async function guardProfileRespectsToggle(browser){
  const name = '81. Тумблер убирает наблюдение за игроком, но не его собственный счёт';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      if(typeof playerProfile!=='function') return {missing:true};
      const play = async ()=>{ runMode='classic'; startGame();
        S.score=400; S.dist=800; S.time=30; S.starsCollected=5; S.smooth=1; S.lastHitKind='rock';
        gameOver(); await new Promise(res=>setTimeout(res,60)); };

      Store.set('beaconOn',1); await play();
      const onProf = playerProfile(), onDay = dayJournal()[todayKey()];

      Store.set('beaconOn',0); await play();
      const offProf = playerProfile(), offDay = dayJournal()[todayKey()];

      return { missing:false, onProf, offProf,
               onDeaths:Object.keys(onDay.deaths||{}).length, offDeaths:Object.keys(offDay.deaths||{}).length,
               runs:offDay.runs };
    });
    if(r.missing) return post(name,false,'слепка профиля нет');
    if(!r.onProf.obs) return post(name,false,'при включённом тумблере наблюдательной части нет — собирать нечего');
    if(r.offProf.obs) return post(name,false,'тумблер выключен, а наблюдательная часть всё равно собирается — выключатель снова лжёт');
    if(!(r.offProf.days>0 && r.offProf.runs>0)) return post(name,false,'выключенный тумблер убил и счётную часть — это не то разделение, о котором договаривались');
    if(r.onDeaths<1) return post(name,false,'причина гибели не пишется даже с разрешения');
    if(r.offDeaths!==r.onDeaths) return post(name,false,'после выключения тумблера причины гибели продолжают копиться');
    if(r.runs!==2) return post(name,false,`забеги перестали считаться при выключенном тумблере (${r.runs} вместо 2)`);
    post(name,true,`с разрешения: причин гибели ${r.onDeaths}, есть слепок устройства; без него: наблюдения нет, а забеги (${r.runs}) и дни (${r.offProf.days}) считаются`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 82 — Дневник вычёркивается только по подтверждению сервера.
   Стережёт: daysToSend/daysAck (core.js) и чтение ответа в syncFlush (sync.js).
   Беда, которую предупреждаем: «отправили и забыли». Без сети, без входа или
   при отказе сервера дни исчезли бы из очереди молча — ровно та беда, что уже
   случалась с «Почтой неба»: HTTP 200 не значит «дело сделано».
   Сегодняшний день переотправляется всегда: он ещё меняется. */
async function guardDaysAckOnlyOnServerWord(browser){
  const name = '82. Дни вычёркиваются из дневника только по слову сервера';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      if(typeof daysToSend!=='function') return {missing:true};
      const today = todayKey();
      // подкладываем два прошлых дня и сегодняшний
      const j = { '2026-08-09':{runs:2,best:100,dist:10,sec:10,stars:1,modes:{},ctl:{},deaths:{}},
                  '2026-08-10':{runs:1,best:50, dist:5, sec:5, stars:0,modes:{},ctl:{},deaths:{}} };
      j[today] = {runs:1,best:70,dist:7,sec:7,stars:2,modes:{},ctl:{},deaths:{}};
      Store.set('dayJournal', j);

      const before = daysToSend().map(x=>x.d);
      // сервер промолчал (сеть/отказ) — не вычёркиваем ничего
      daysAck(null);
      const afterSilence = daysToSend().map(x=>x.d);
      // сервер подтвердил один прошлый день
      daysAck(['2026-08-09']);
      const afterOne = daysToSend().map(x=>x.d);
      // сервер подтвердил и сегодняшний — он всё равно должен остаться в очереди
      daysAck(['2026-08-10', today]);
      const afterAll = daysToSend().map(x=>x.d);
      return { missing:false, before, afterSilence, afterOne, afterAll, today };
    });
    if(r.missing) return post(name,false,'дневник не умеет отдавать неподтверждённые дни');
    if(r.before.length!==3) return post(name,false,`к отправке готово ${r.before.length} дней вместо 3`);
    if(r.afterSilence.length!==3) return post(name,false,'молчание сервера вычеркнуло дни — они потеряны навсегда');
    if(r.afterOne.includes('2026-08-09')) return post(name,false,'подтверждённый день гоняется снова');
    if(r.afterOne.length!==2) return post(name,false,`после подтверждения одного дня осталось ${r.afterOne.length} вместо 2`);
    if(!r.afterAll.includes(r.today)) return post(name,false,'сегодняшний день вычеркнут — его цифры ещё растут, сервер получит устаревшие');
    if(r.afterAll.length!==1) return post(name,false,`в очереди осталось ${r.afterAll.length} дней вместо одного сегодняшнего`);
    post(name,true,'молчание не вычёркивает; подтверждённые уходят; сегодняшний остаётся в очереди');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================
   ПАРТИЯ 14 — ОТВЕТ ИЗ ПРОШЛОГО, СВОЙ ПАЛЕЦ, ЧИСТЫЙ ВЗЛЁТ
   ============================================================ */

/* Страж 83 — Ответ из прошлого забега не перезапускает игру.
   Стережёт: поколение забега (runGen) в ui.js.
   Беда: колбэк «призрака из топа» звал startGame() без единой проверки. Сеть
   живёт до 10 секунд, забег — сколько угодно: медленный ответ перезапускал
   полёт посреди игры, состояние стиралось без посадки, очки и лента уходили
   в никуда, а счётчик игр накручивался дважды. */
async function guardStaleAnswerCannotRestart(browser){
  const name = '83. Ответ из прошлого забега не перезапускает игру и не пишет в свежее состояние';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      if(typeof runNow!=='function') return {missing:true};
      window.syncInitData=()=>'lab'; window.syncAvailable=()=>true;
      let release; const gate=new Promise(res=>release=res);
      window.syncGhostGet=()=>gate.then(()=>({ok:true, track:'!'.repeat(90), skin:0, best:10, name:'Ч', seed:5}));
      window.syncTop=()=>Promise.resolve({ok:true, me:null, top:[{name:'Ч',username:null,provider:'tg',best:999,pid:77}]});
      topCat='touch'; openAch();
      $('achMineWrap').classList.add('hidden'); $('achTopWrap').classList.remove('hidden');
      renderTop(); await new Promise(res=>setTimeout(res,150));
      const btn=$('topList').querySelector('.topGh');
      if(!btn) return {noBtn:true};
      btn.click();                                  // заказали призрака, ответ завис
      runMode='classic'; startGame();               // игрок ушёл и полетел сам
      S.score=1234; S.dist=900;
      const genBefore=runNow();
      release(); await new Promise(res=>setTimeout(res,200));
      return { missing:false, running:S.running, score:S.score, gen:runNow(), genBefore, screen:screenName };
    });
    if(r.missing) return post(name,false,'поколения забега нет — устаревший ответ по-прежнему может всё перезапустить');
    if(r.noBtn) return post(name,false,'кнопка призрака не отрисовалась — сценарий не тот');
    if(r.gen!==r.genBefore) return post(name,false,'поколение сменилось — значит startGame() всё-таки отработал из колбэка');
    if(!r.running) return post(name,false,'забег остановлен ответом из прошлого — полёт стёрт без посадки');
    if(r.score!==1234) return post(name,false,`состояние забега затёрто: счёт ${r.score} вместо 1234`);
    post(name,true,`полёт цел (счёт ${r.score}), поколение не сменилось, экран «${r.screen}»`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 84 — Призрак рекорда уезжает с сидом СВОЕГО забега.
   Стережёт: снимок ghSkin/ghSeed в gameOver (ui.js).
   Беда: скин и сид читались из живого S уже в момент ответа сервера. Нажал
   «ещё раз», пока летела отправка, — и лента рекордного забега уходила с сидом
   НОВОГО неба. Скачавший такого призрака летит по другой трассе, тень бьётся
   в пустоту, а будущая серверная сверка по сиду отбила бы честный рекорд. */
async function guardGhostKeepsItsOwnSeed(browser){
  const name = '84. Призрак рекорда уезжает с сидом своего забега, а не следующего';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      window.syncInitData=()=>'lab'; window.syncAvailable=()=>true;
      let seen=null, release; const gate=new Promise(res=>release=res);
      window.syncGhostUp=(p)=>{ if(!seen) seen=p; return Promise.resolve({ok:true}); };
      window.syncSubmit=()=>gate.then(()=>({ok:true}));   // отправка висит
      Store.set('shareGhost',1);
      runMode='classic'; startGame();
      S.seed=111111; S.skin=0;
      for(let i=0;i<40;i++) rec.push([i%92, (i*3)%92, i*30]);  // лента подлиннее порога
      S.score=5000; S.dist=3000; S.time=60; S.smooth=1;
      gameOver();
      await new Promise(res=>setTimeout(res,40));
      runMode='classic'; startGame();      // «ещё раз» до того, как отправка вернулась
      S.seed=999999; S.skin=3;
      release(); await new Promise(res=>setTimeout(res,150));
      return { seen, nowSeed:S.seed };
    });
    if(!r.seen) return post(name,false,'призрак не ушёл вовсе — сценарий не тот');
    if(r.seen.seed===r.nowSeed) return post(name,false,`призрак уехал с сидом СЛЕДУЮЩЕГО забега (${r.seen.seed}) — скачавший полетит по другой трассе`);
    if(r.seen.seed!==111111) return post(name,false,`в призраке чужой сид ${r.seen.seed} вместо 111111`);
    if(r.seen.skin!==0) return post(name,false,`в призраке скин из следующего забега (${r.seen.skin} вместо 0)`);
    post(name,true,`лента ушла со своим сидом 111111 и своим скином, хотя к тому моменту в небе уже был сид ${r.nowSeed}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 85 — Одна отправка не съедает очередь другой.
   Стережёт: drain() вместо Store.set('syncQ',[]) в sync.js.
   Беда: завершение первой отправки затирало очередь целиком. Вторая просыпалась,
   видела пустоту и выходила НЕ ОТПРАВИВ НИЧЕГО — вместе с очками терялись разовые
   поля, которые больше нигде не живут: duel_win, ghost_beat, паспорт забега и
   дневник дней. Тот же урок, что «Почта неба» выучила: вычитаем доставленное. */
async function guardQueueSubtractsNotWipes(browser){
  const name = '85. Завершение одной отправки не съедает очередь и разовые поля другой';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      Store.set('tgWebAuth',{id:1,hash:'x',first_name:'T'});
      const posts=[]; let release; const gate=new Promise(res=>release=res);
      window.syncPost=(payload)=>{ posts.push(payload);
        return gate.then(()=>({ok:true,status:200,json:()=>Promise.resolve({ok:true})})); };
      const a=syncSubmit({touch:100});                       // первая отправка — висит
      const b=syncSubmit({touch:900},{duel_win:42, days:[{d:'2026-08-10',runs:1}]}); // вторая встала в очередь
      release();
      await Promise.all([a,b]); await new Promise(res=>setTimeout(res,80));
      return { posts, left:Store.get('syncQ',[]) };
    });
    if(r.posts.length<2) return post(name,false,`ушло ${r.posts.length} отправок вместо двух — вторая пропала целиком`);
    const second=r.posts[1];
    if(!second.duel_win) return post(name,false,'во второй отправке нет duel_win — друг не узнает о победе');
    if(!second.days) return post(name,false,'во второй отправке нет дневника дней');
    if(!second.scores || second.scores.touch!==900) return post(name,false,`во второй отправке очки ${second.scores&&second.scores.touch} вместо 900 — запись съедена первой`);
    post(name,true,`обе отправки ушли: вторая несёт очки ${second.scores.touch}, duel_win и дневник; в очереди осталось ${r.left.length}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 86 — Второй палец не угоняет управление.
   Стережёт: отслеживание касания по identifier (input.js).
   Беда: касание бралось как touches[0], по индексу. Убрал первый палец, пока
   лежит второй, — и следующий touchmove отдавал координаты ЧУЖОГО пальца прямо
   в руль, минуя гейт «тап против свайпа». Самолёт телепортируется, обычно в
   препятствие, и рывок вдобавок роняет плавность, которая множит счёт. */
async function guardSecondFingerCannotSteal(browser){
  const name = '86. Второй палец не угоняет руль у первого';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      runMode='classic'; startGame();
      const T=(id,x,y)=>({identifier:id, clientX:x, clientY:y});
      const fire=(type,touches,changed)=>{ const e=new Event(type,{bubbles:true,cancelable:true});
        e.touches=touches; e.changedTouches=changed||touches; window.dispatchEvent(e); };
      fire('touchstart',[T(1,100,400)],[T(1,100,400)]);
      fire('touchmove',[T(1,140,400)]);                 // свой палец повёл — рулим
      const mine=input.touchX;
      fire('touchstart',[T(1,140,400),T(2,330,700)],[T(2,330,700)]); // лёг второй палец
      fire('touchmove',[T(1,145,400),T(2,335,700)]);
      const withSecond=input.touchX;
      // свой палец ушёл, чужой остался лежать
      fire('touchend',[T(2,335,700)],[T(1,145,400)]);
      const afterMineGone=input.touchX;
      fire('touchmove',[T(2,360,700)]);
      const afterAlienMove=input.touchX;
      return { mine, withSecond, afterMineGone, afterAlienMove, SC };
    });
    if(r.mine==null) return post(name,false,'свой палец не взял руль — сценарий не тот');
    if(Math.abs(r.withSecond-r.mine)>10) return post(name,false,`появление второго пальца дёрнуло руль: ${r.mine} → ${r.withSecond}`);
    if(r.afterMineGone!==null) return post(name,false,'свой палец ушёл, а руль остался нажатым — чужой палец продолжает вести самолёт');
    if(r.afterAlienMove!==null) return post(name,false,`чужой палец рулит после ухода своего (${r.afterAlienMove}) — телепорт самолёта`);
    post(name,true,'чужие пальцы не видны игре: руль не дёрнулся и честно отпущен вместе со своим');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 87 — Ничего не течёт из прошлого забега.
   Стережёт: сброс plane.bank / prevKX-prevKY / modeHud._t2 / планетария в startGame.
   Беды: занавес смерти оставлял крен 1.15 — новый забег начинался с завалом на 36°;
   положение клавиш переживало посадку и первым же кадром роняло плавность (это
   −1.5% к итоговому счёту ни за что); табло Своей трассы весь полёт показывало
   название ПРОШЛОЙ трассы; искры и станция планетария прилетали из прошлого забега. */
async function guardNothingLeaksBetweenRuns(browser){
  const name = '87. Из прошлого забега не течёт ни крен, ни клавиши, ни табло, ни искры';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      runMode='classic'; startGame();
      plane.bank=1.15;                                  // как после занавеса смерти
      if(typeof prevKX!=='undefined'){ prevKX=1; prevKY=1; }
      input.byMouse=true;
      const mh=document.getElementById('modeHud'); if(mh) mh._t2=-1;
      if(typeof PLANET!=='undefined' && PLANET._poke){ PLANET._poke('meteor'); PLANET._poke('station'); }
      if(typeof planetSpark==='function') planetSpark(100,100);
      const before = (typeof PLANET!=='undefined' && PLANET._state) ? PLANET._state() : null;
      runMode='classic'; startGame();
      const after = (typeof PLANET!=='undefined' && PLANET._state) ? PLANET._state() : null;
      return { bank:plane.bank, kx:(typeof prevKX!=='undefined'?prevKX:0), ky:(typeof prevKY!=='undefined'?prevKY:0),
               byMouse:input.byMouse, t2:(mh?mh._t2:undefined), before, after };
    });
    if(Math.abs(r.bank)>0.001) return post(name,false,`крен ${r.bank} перетёк в новый забег — самолёт стартует завалённым`);
    if(r.kx!==0 || r.ky!==0) return post(name,false,`положение клавиш перетекло (${r.kx},${r.ky}) — плавность падает в первом же кадре`);
    if(r.byMouse) return post(name,false,'метка мыши перетекла — категория рекорда посчитается неверно');
    if(r.t2!==undefined) return post(name,false,'флаг табло не сброшен — бесконечная Своя трасса покажет название ПРОШЛОЙ трассы весь полёт');
    if(r.before && r.after){
      if(r.after.sparks>0) return post(name,false,`искры прошлого забега (${r.after.sparks}) прилетят в новый`);
      if(r.after.flash) return post(name,false,'недоигранная вспышка крыла перетекла в новый забег');
      if(r.after.met || r.after.sta) return post(name,false,'метеор или станция перетекли из прошлого забега — появятся из середины пролёта');
    }
    post(name,true,'крен, клавиши, метка мыши, табло и планетарий — всё с чистого листа');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 88 — Слово Telegram о железе сильнее наших догадок.
   Стережёт: tgPerfClass() и его место в gfxTier() (core.js).
   Беда: авто-качество гадало по строке WebGL-рендерера, а в части Android-WebView
   она замаскирована — тогда тир считался по deviceMemory, которого в WebView
   Telegram часто нет вовсе. При этом клиент Telegram сам кладёт свой вердикт
   (LOW/AVERAGE/HIGH) прямо в UA, и мы его не читали. */
async function guardTelegramPerfClassRead(browser){
  const name = '88. performance_class из Telegram задаёт тир устройства';
  const ctxs=[];
  try{
    const out=[];
    for(const [cls, want] of [['LOW',0],['AVERAGE',1],['HIGH',2]]){
      const c = await browser.newContext({ viewport:{width:390,height:844},
        userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Telegram-Android/11.2.0 (Google Pixel 7; Android 14; SDK 34; '+cls+')' });
      ctxs.push(c);
      const page = await c.newPage();
      await page.route('**/*', r=>{ const u=r.request().url();
        if(/sentry-cdn|cdn\.amplitude|telegram\.org\/js|discord\.com/.test(u)) return r.abort('connectionfailed');
        if(/supabase\.co/.test(u)) return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
        return r.continue(); });
      await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
      await page.goto(BASE,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>typeof startGame==='function', null, {timeout:15000});
      out.push(await page.evaluate(()=>({
        pc:(typeof tgPerfClass==='function')?tgPerfClass():null,
        tier:(typeof gfxTier==='function')?gfxTier():null })));
    }
    if(out.some(x=>x.pc===null)) return post(name,false,'performance_class из UA Telegram не читается вовсе');
    const got=out.map(x=>x.tier).join('/');
    if(got!=='0/1/2') return post(name,false,`тиры получились ${got} вместо 0/1/2 — слово Telegram не доходит до авто-качества`);
    post(name,true,`LOW/AVERAGE/HIGH → тир ${got}`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ for(const c of ctxs) await c.close(); }
}

/* ============================================================
   ПАРТИЯ 15 — КАДР НЕ СОРИТ
   ============================================================ */

/* Страж 89 — Станция Планетария и Золотая звезда не пекут градиенты в кадре.
   Стережёт: staGrad() в planetarium.js и gsGrad() в goldstar.js.
   Беда: партия 11 закрыла обломки, спутники и значки бонусов в render.js — а эти
   два модуля остались в стороне. Станция создавала ШЕСТЬ CanvasGradient в каждом
   кадре (360 в секунду, пока ползёт по экрану), золотая звезда — до четырёх.
   Каждый объект несёт свой разбор цветов, а мусор потом дёргает кадр. */
async function guardModuleGradientsCached(browser){
  const name = '89. Станция и Золотая звезда не создают градиенты в каждом кадре';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='daily'; startGame();            // sky() молчит на паузе — забег должен идти
      Q.mode='manual'; Q.level=3;              // станция выходит только в богатом небе (Q.level>=2)
      // выкатываем обеих гостей на сцену
      if(typeof PLANET!=='undefined' && PLANET._poke) PLANET._poke('station');
      if(typeof GOLD!=='undefined' && GOLD._poke) GOLD._poke();
      const has=()=>{ const st=(typeof PLANET!=='undefined'&&PLANET._state)?PLANET._state():null; return !!(st&&st.sta); };
      let n=0;
      const cl=ctx.createLinearGradient.bind(ctx), cr=ctx.createRadialGradient.bind(ctx);
      ctx.createLinearGradient=function(){ n++; return cl.apply(null,arguments); };
      ctx.createRadialGradient=function(){ n++; return cr.apply(null,arguments); };
      for(let f=0;f<8;f++){ update(1/60); draw(); }   // родиться, появиться и напечь всё, что нужно
      const station=has();
      const warm=n; n=0;
      for(let f=0;f<8;f++){ update(1/60); draw(); }
      const hot=n;
      ctx.createLinearGradient=cl; ctx.createRadialGradient=cr;
      return { warm, hot, station, gold:(typeof GOLD!=='undefined'&&GOLD._state)?!!GOLD._state().star:null };
    });
    if(!r.station) return post(name,false,'станция не вышла на сцену — сценарий не тот');
    if(r.warm<4) return post(name,false,`за прогрев создано всего ${r.warm} градиентов — гости не рисовались, сценарий не тот`);
    if(r.hot>2) return post(name,false,`на прогретых кэшах создано ${r.hot} градиентов за 8 кадров (прогрев ${r.warm}) — станция и звезда пекут их заново`);
    post(name,true,`станция в кадре${r.gold?' и звезда дня':''}: прогрев ${r.warm} градиентов, дальше ${r.hot} за 8 кадров`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 103 — Сброс холста после потери GPU-контекста чистит градиенты станции, звезды дня
   и хвост кометы, а не только кэши самого render.js (партия 27).
   Стережёт: gfxInvalidate() в render.js (ЯДРО) + новые мостики PLANET._gfxReset()/
   GOLD._gfxReset() в модулях planetarium.js/goldstar.js.
   Беда: владелец сообщил — «спутник на фоне [станция] и другие элементы» пропали, раньше
   были. По коду нашлось: `staG` (planetarium.js) и `gsG` (goldstar.js) кэшируют настоящие
   CanvasGradient «один раз навсегда» — экономия кадра, разумная сама по себе. Но
   `gfxInvalidate()` (написан в партии «Потеря холста», v1.282.20, именно чтобы забыть все
   протухшие градиенты после contextlost/contextrestored) знает только про свои кэши в
   render.js — про эти два модульных кэша забыли. После восстановления контекста станция и
   звезда дня рисуются старыми, уже мёртвыми градиентами — тихо, без ошибки, элемент просто
   перестаёт быть виден до полной перезагрузки страницы. Третий, менее опасный случай того
   же класса — o._tg/o._tgk (хвост кометы, кэш на самом объекте препятствия) — самоисцеляется
   за секунды (кометы живут недолго), но починен заодно, раз уж класс один. */
async function guardGfxInvalidateClearsModuleGradients(browser){
  const name = '103. Сброс холста чистит градиенты станции, звезды дня и хвоста кометы (партия 27)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='daily'; startGame();
      Q.mode='manual'; Q.level=3; // станция выходит только в богатом небе (Q.level>=2)
      if(typeof PLANET!=='undefined' && PLANET._poke) PLANET._poke('station');
      if(typeof GOLD!=='undefined' && GOLD._poke) GOLD._poke();
      const c=poolOb.take(); c.kind='comet'; c.x=100; c.y=100; c.r=15; c.vx=2; c.vy=3; c.rot=0; c._tint=null; c._tg=null; c._tgk=undefined;
      obstacles.push(c);
      for(let f=0;f<8;f++){ update(1/60); draw(); } // прогрев: станция выходит, звезда рождается, комета летит и печёт градиенты
      const staBefore = (typeof PLANET!=='undefined' && PLANET._gradCount)?PLANET._gradCount():-1;
      const goldBefore = (typeof GOLD!=='undefined' && GOLD._gradCount)?GOLD._gradCount():-1;
      const cometBefore = !!c._tg;
      gfxInvalidate();
      const staAfter = (typeof PLANET!=='undefined' && PLANET._gradCount)?PLANET._gradCount():-1;
      const goldAfter = (typeof GOLD!=='undefined' && GOLD._gradCount)?GOLD._gradCount():-1;
      const cometAfter = !!c._tg;
      const idx=obstacles.indexOf(c); if(idx>=0) obstacles.splice(idx,1); // не мешать следующим стражам
      return { staBefore, goldBefore, cometBefore, staAfter, goldAfter, cometAfter };
    });
    if (r.staBefore<1) return post(name,false,'не удалось наполнить кэш градиентов станции перед проверкой — сценарий не тот');
    if (r.goldBefore<1) return post(name,false,'не удалось наполнить кэш градиентов звезды дня перед проверкой — сценарий не тот');
    if (!r.cometBefore) return post(name,false,'не удалось наполнить градиент хвоста кометы перед проверкой — сценарий не тот');
    if (r.staAfter!==0) return post(name,false,`gfxInvalidate() не очистил кэш станции: осталось ${r.staAfter} градиентов — после восстановления холста станция рисовалась бы протухшими`);
    if (r.goldAfter!==0) return post(name,false,`gfxInvalidate() не очистил кэш звезды дня: осталось ${r.goldAfter} градиентов`);
    if (r.cometAfter) return post(name,false,'gfxInvalidate() не сбросил градиент хвоста кометы на живом объекте');
    post(name,true,'станция, звезда дня и хвост кометы переживают восстановление холста без протухших градиентов');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 90 — Цвет частицы не собирается строкой на каждую частицу.
   Стережёт: partCol() и STREAK_COL в render.js.
   Беда: 'rgba(255,120,60,' + 0.7263412... + ')' на КАЖДУЮ частицу в КАЖДОМ кадре —
   это и печать сырого double, и повторный разбор CSS-цвета движком. Сорок живых
   частиц дают 2400 строк в секунду, на пике до двадцати тысяч. Полосы скорости
   собирали три ОДНИ И ТЕ ЖЕ строки по девяносто раз в кадр. */
async function guardFrameStringsCached(browser){
  const name = '90. Цвет частиц и полос берётся из кэша, а не собирается в кадре';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      if(typeof partCol!=='function') return {missing:true};
      // тождественность: кэш обязан давать тот же цвет, что и прежняя склейка
      const same = partCol('rgba(255,120,60,',0.5)==='rgba(255,120,60,0.500)';
      // квант незаметен глазу, но ступеней достаточно много
      const a=partCol('rgba(1,2,3,',0.500), b=partCol('rgba(1,2,3,',0.505);
      const c=partCol('rgba(1,2,3,',0.575);
      const streaks = (typeof STREAK_COL!=='undefined' && STREAK_COL.length===3);
      // и сам горячий путь: сотня частиц, два прогона по кадрам, второй не должен плодить новые ключи
      runMode='classic'; startGame(); S.paused=true;
      for(let i=0;i<100;i++) if(typeof burst==='function') burst(100+i,300,'rgba(255,200,120,',1);
      let keys0=Object.keys(partColC).length;
      for(let f=0;f<10;f++) draw();
      const keys1=Object.keys(partColC).length;
      for(let f=0;f<10;f++) draw();
      const keys2=Object.keys(partColC).length;
      return { missing:false, same, tie:a===b, split:a!==c, streaks, keys0, keys1, keys2, parts:particles.length };
    });
    if(r.missing) return post(name,false,'кэша цвета частиц нет — строка по-прежнему собирается на каждую частицу');
    if(!r.same) return post(name,false,'кэш даёт не тот цвет, что прежняя склейка — картинка изменится');
    if(!r.tie) return post(name,false,'квант альфы слишком мелкий — кэш будет расти как мусор');
    if(!r.split) return post(name,false,'квант альфы слишком грубый — затухание частиц станет ступенчатым');
    if(!r.streaks) return post(name,false,'цвета полос скорости не вынесены в константы');
    if(r.keys2>r.keys1) return post(name,false,`кэш продолжает расти на прогретом пути: ${r.keys1} → ${r.keys2} ключей`);
    post(name,true,`кэш совпадает со старой склейкой, 40 ступеней альфы; на ${r.parts} частицах ключей ${r.keys1}, дальше рост ноль`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 91 — HUD не ищется по документу в тиках.
   Стережёт: elModeHud/elSmoothFill в game.js.
   Беда: табло дисциплин искалось getElementById В КАЖДОМ КАДРЕ Спидрана, Трассы
   дня, Театра и Своей трассы, полоса плавности — 20-30 раз в секунду. Шапка файла
   при этом прямо декларирует «не дёргаем getElementById в тиках», и все остальные
   узлы HUD честно закэшированы с самого начала — эти два просто забыли. */
async function guardHudNotQueriedInTicks(browser){
  const name = '91. HUD не ищется getElementById в каждом кадре';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='speedrun'; startGame();
      let hits=0;
      const real=document.getElementById.bind(document);
      document.getElementById=function(id){ if(id==='modeHud'||id==='smoothFill') hits++; return real(id); };
      for(let f=0;f<30;f++){ update(1/60); draw(); }
      document.getElementById=real;
      return { hits, cached:(typeof elModeHud!=='undefined' && !!elModeHud) };
    });
    if(!r.cached) return post(name,false,'ссылка на табло не закэширована');
    if(r.hits>0) return post(name,false,`за 30 кадров ${r.hits} обращений getElementById в тике — правило файла нарушено`);
    post(name,true,'за 30 кадров Спидрана — ни одного поиска по документу');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 92 — Переворот тоже идёт через дребезг-страж (последний путь calReset(), корень cal_storm).
   Стережёт: flipN>=3 в onTilt (input.js).
   Беда: партия 6 защитила дребезгом orientationchange, а переход на поканальный ноль (v1.282.13)
   убрал полный сброс со смены канала вовсе — но детектор переворота телефона (flipN) как дёргал
   calReset() напрямую в обход дребезга, так и дёргал. На живых устройствах именно этот путь дал
   23 из 31 боевых cal_storm за четыре дня — почти все с одного Android 15: дрожащий канал даёт
   скачки >55° между пакетами без реального переворота, и каждый такой скачок раньше считался
   отдельным честным сбросом. */
async function guardFlipThroughDebounce(browser){
  const name = '92. Переворот идёт через дребезг-страж (корень cal_storm)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      let storms=0; const realTick=BEACON.calTick; BEACON.calTick=()=>{storms++;};
      lastCalResetT=-99999; // страница молодая — дребезг-страж не должен спутать «раньше 400мс» со «сроду не сбрасывали»
      calReset(false); storms=0; // честный сброс на взлёте не считаем

      gyroChanIn('tg');
      for(let i=0;i<16;i++) onTilt({gamma:0, beta:1}); // берём ноль в спокойной позе

      // «переворот» №1 — три скачка подряд >55°, детектор считает это честным переворотом
      onTilt({gamma:90, beta:1});
      onTilt({gamma:0,  beta:1});
      onTilt({gamma:90, beta:1}); // flipN дошёл до 3 — calReset должен сработать

      // сразу, без паузы, калибруемся заново и повторяем ту же дрожь — как дрожащий канал
      for(let i=0;i<16;i++) onTilt({gamma:0, beta:1});
      onTilt({gamma:90, beta:1});
      onTilt({gamma:0,  beta:1});
      onTilt({gamma:90, beta:1}); // «переворот» №2, меньше чем через 400мс после первого

      BEACON.calTick = realTick;
      return { storms };
    });
    if(r.storms===0) return post(name,false,'переворот вообще не вызвал calReset — детектор сломан целиком');
    if(r.storms>1) return post(name,false,`два «переворота» подряд дали ${r.storms} сброса калибровки — путь flipN всё ещё в обход дребезг-стража`);
    post(name,true,'два «переворота» подряд без паузы — один честный сброс, не два');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 93 — Мост дочитывает подпись Telegram РАНЬШЕ, чем адрес очищается.
   Стережёт: порядок между чисткой хеша (js/core.js, самая первая строка) и мостом
   (js/vendor/telegram-web-app.js, тоже defer, идёт раньше по тегу).
   Беда партии 16 (второй заход): страж 68 проверял только «хеш убран из адреса» — и был
   зелён ровно в тот момент, когда правка стояла инлайновым <script> в index.html и
   исполнялась ДО того, как мост успевал прочитать initData из хеша. Внутри Telegram
   игрок молча становился гостем: initData пуст, вход не проходит, рекорд никуда не
   уходит — без единой ошибки в консоли и без единого красного стража. Здесь мост не
   настоящий (сеть заблокирована), а подложный — читает location.hash сам, ровно как
   настоящий, и именно поэтому ловит гонку по-честному: неважно, что внутри мока, важен
   порядок вызовов между тегом моста и core.js. */
async function guardBridgeReadsSignatureBeforeUrlCleared(browser){
  const name = '93. Мост дочитывает подпись Telegram раньше, чем адрес очищается';
  let ctx;
  try{
    ctx = await browser.newContext({ viewport:{width:390,height:844} });
    const page = await ctx.newPage();
    await page.route('**/*', route=>{
      const url=route.request().url();
      if(/sentry-cdn\.com|cdn\.amplitude\.com|discord\.com/.test(url)) return route.abort('connectionfailed');
      if(/supabase\.co/.test(url)) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      // подложный мост: тот же тег, та же defer-очередь, но читает хеш сам — как настоящий
      if(/vendor\/telegram-web-app\.js/.test(url)) return route.fulfill({status:200,contentType:'application/javascript',
        body:`(function(){
          var m=/tgWebAppData=([^&]*)/.exec(location.hash||'');
          window.Telegram={WebApp:{
            initData: m ? decodeURIComponent(m[1]) : '',
            initDataUnsafe:{}, platform:'weba', version:'8.0', colorScheme:'dark',
            ready(){}, expand(){}, close(){}, setHeaderColor(){}, setBackgroundColor(){},
            disableVerticalSwipes(){}, enableClosingConfirmation(){}, isVersionAtLeast(){return true;}
          }};
        })();`});
      return route.continue();
    });
    await page.addInitScript(()=>{ window.__labOpen=true; try{localStorage.clear();}catch(e){} });
    const dirty = '#tgWebAppData=user%3D%257B%2522id%2522%253A1%257D%26auth_date%3D1%26hash%3Ddeadbeefcafe&tgWebAppVersion=8.0';
    await page.goto(BASE + dirty, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(()=>typeof GAME_VERSION!=='undefined', null, {timeout:15000});
    const r = await page.evaluate(()=>({
      initData: (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '',
      href: location.href
    }));
    if(!r.initData) return post(name,false,'мост отработал раньше — но initData пуст: хеш стёрли раньше, чем мост успел его прочитать (гость в Telegram)');
    if(/tgWebAppData|hash%3D/.test(r.href)) return post(name,false,`подпись осталась в адресе после того, как мост её прочитал: ${r.href.slice(-70)}`);
    post(name,true,'мост прочитал initData из хеша, и только после этого адрес очищен — оба условия целы');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 94 — Взлёт не копится в шторм калибровки (Партия 21).
   Стережёт: BEACON.calTick(source) в js/beacon.js.
   Беда: cal_storm рождён ловить дребезг — датчик врёт, ноль не держится. Но взлёт —
   законный сброс: каждый забег его делает (js/ui.js:189, source='takeoff'), и при
   пороге ×5 за сессию любой, кто активно играет несколько заходов подряд, рано или
   поздно наберёт «шторм» просто честной игрой — сигнал перестаёт отличать поломку
   от нормального использования. Партия 19 подписала источник у каждого пути именно
   для того, чтобы такую фильтрацию можно было сделать дёшево. Решение владельца
   (не моё — закон 11): взлёт в счётчик шторма не идёт вовсе, остальные источники
   (ручная калибровка, переворот, дребезг канала, залипший ноль) — как и раньше. */
async function guardTakeoffExcludedFromCalStorm(browser){
  const name = '94. Взлёт не считается в шторм калибровки (честный сброс — не дребезг)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      // signal() внутри beacon.js — приватная функция замыкания, calTick зовёт её напрямую,
      // не через BEACON.signal — снаружи её не подменить. Смотрим на настоящий побочный
      // эффект: письмо действительно ложится в очередь (Store 'beaconQ'), как и у игрока.
      const hasStorm=()=> (Store.get('beaconQ',[])||[]).some(p=>p && p.kind==='signal' && /^cal_storm/.test(p.msg||''));
      for(let i=0;i<8;i++) BEACON.calTick('takeoff'); // восемь честных взлётов подряд — не дребезг, не поломка
      const afterTakeoffs = hasStorm();
      BEACON.calTick('manual'); BEACON.calTick('manual'); BEACON.calTick('manual');
      BEACON.calTick('manual'); BEACON.calTick('manual'); // пять чужих причин — вот это уже настоящий шторм
      const afterManual = hasStorm();
      return { afterTakeoffs, afterManual };
    });
    if(r.afterTakeoffs) return post(name,false,'восемь взлётов подряд посчитались штормом');
    if(!r.afterManual) return post(name,false,'пять честных не-взлётных сбросов не дали cal_storm — счётчик сломан целиком, а не просто отфильтрован взлёт');
    post(name,true,'взлёты не копятся в шторм, а настоящие причины по-прежнему считаются');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 95 — Небо Кузницы не ищет свой экран в каждом кадре (партия 22).
   Стережёт: forgeSkyLoop() в js/forge.js.
   Беда: тот же класс, что закон №27 (аудит 12.08, он же партия 15 для HUD) — DOM-поиск в
   тике вместо кэша ссылки. forgeSkyLoop() каждый requestAnimationFrame звал $('forgeScreen')
   (=document.getElementById), пока открыта «Своя трасса» — лишняя работа всё время, пока
   игрок настраивает трассу. Найдено чтением кода при аудите, не боевым письмом. */
async function guardForgeSkyLoopCachesScreenRef(browser){
  const name = '95. Небо Кузницы не ищет свой экран в каждом кадре';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(async ()=>{
      document.getElementById('modeForge').click(); // вход, как игрок
      await new Promise(res=>setTimeout(res,80)); // дать forgeSkyKick/forgeSkyLoop стартовать
      let calls=0; const real=document.getElementById.bind(document);
      document.getElementById=function(id){ if(id==='forgeScreen') calls++; return real(id); };
      await new Promise(res=>{
        let n=0; function frame(){ n++; if(n>=15) return res(); requestAnimationFrame(frame); }
        requestAnimationFrame(frame);
      });
      document.getElementById=real;
      return { calls, screen:screenName };
    });
    if(r.screen!=='forge') return post(name,false,`не попали в Кузницу (экран «${r.screen}») — сценарий не тот`);
    if(r.calls>0) return post(name,false,`forgeScreen искался через getElementById ${r.calls} раз за 15 кадров превью-неба — кэш не сработал`);
    post(name,true,'экран Кузницы не ищется повторно на каждом кадре превью-неба');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 97 — Шаг волны ускорен решением владельца (партия 23).
   Стережёт: waveDistTarget() в js/game.js.
   Контекст: аудит 12.08 (при разборе отчётов об ошибках) — бот-замер партии 22 честно показал
   падение темпа после партий 8 («волну общего неба двигает только дистанция», закон честности)
   и 10 (убрана дыра — щит давал бесплатные очки за риск): волна на минуте была 6, стала 5;
   очков за минуту 2621→1594. Владельцу через AskUserQuestion дан разбор цены — «оставить»,
   «поднять шаг волны на 10-15%», «начать Режиссёра для Классики», «пересмотреть формулу очков».
   Выбрано: «поднять шаг волны на 10-15%». Дистанция до каждой следующей волны сокращена
   равномерно на 12.5% (середина одобренного диапазона) — форма шага (400,500,600…1000 м)
   не искажена, только масштаб; детерминизм общего неба и закрытая дыра щита не тронуты. */
async function guardWaveDistTargetSped(browser){
  const name = '97. Шаг волны ускорен на 12.5% (партия 23, решение владельца)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      const got={};
      for(let m=1;m<=9;m++) got[m]=waveDistTarget(m);
      return got;
    });
    const PACE=0.875;
    const orig = m => m<=7 ? 300*m+50*m*(m+1) : 4900+1000*(m-7);
    for(let m=1;m<=9;m++){
      const expect = orig(m)*PACE;
      if (Math.abs(r[m]-expect) > 0.01)
        return post(name,false,`волна ${m}: ждали ${expect.toFixed(1)} м (старое×0.875), получили ${r[m]} м`);
    }
    for(let m=1;m<9;m++){
      if (r[m+1] <= r[m]) return post(name,false,`дистанция не растёт монотонно: волна ${m}→${m+1}`);
    }
    post(name,true,'дистанция до волны сокращена на 12.5% на всех волнах, форма шага не искажена');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 102 — Темп волн дышит: короткие передышки чередуются с разгоном, а не тянут монотонную прямую (партия 26).
   Стережёт: lullCurve()/lullMul() в js/game.js.
   Контекст: разбор документа «Темп волн Космограммы» (сверено с кодом и телеметрией, не взято
   на слово) — из четырёх рекомендованных рычагов три уже были в игре (новизна видов по волнам,
   непрерывный рост сложности внутри волны, частичный «сок»), а контраста пиков/затиший
   в духе AI Director Left 4 Dead не было вовсе: единственная попытка (передышка после ворот,
   v1.282.13) — точечная заплатка на 0.4с, не система. WAVE_PACE не тронут: своя телеметрия
   ненадёжна (70 из 80 смертей в выборке — с одного тестового устройства владельца), и документ,
   и разбор сошлись не трогать множитель дистанции сейчас. lullMul() — чистая функция общей для
   всех игроков дистанции (закон 12: общее небо мерят общим числом, не приватным вводом),
   отключена в Своей трассе (воля автора, S.customD важнее автоматики). */
async function guardWaveLullContrast(browser){
  const name = '102. Темп волн дышит: пик передышки чередуется с разгоном, крючок первой волны защищён (партия 26+28)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame();
      const PERIOD=1100, SPAN=320;
      const samples=[];
      for(let d=0; d<=PERIOD; d+=20) samples.push(lullCurve(d));
      const atStart = lullCurve(0);
      const atPeak = lullCurve(SPAN/2);
      const atSpanEnd = lullCurve(SPAN);
      const atFlat = lullCurve(SPAN+150);
      const atNextCycle = lullCurve(PERIOD);
      const wave1Target = waveDistTarget(1);
      S.mode='custom'; S.dist=wave1Target+SPAN/2;
      const customMul = lullMul();
      S.mode='classic';
      S.dist=SPAN/2; // внутри первой волны, ровно в фазе пика передышки — крючок обязан быть защищён
      const hookMul = lullMul();
      S.dist=PERIOD+SPAN/2; // за первой волной, в пике СЛЕДУЮЩЕГО цикла — передышка обязана работать как и раньше
      const classicMul = lullMul();
      return { samples, atStart, atPeak, atSpanEnd, atFlat, atNextCycle, customMul, hookMul, classicMul, wave1Target };
    });
    if (r.samples.some(v=>v<0.999 || v>1.95))
      return post(name,false,`lullCurve вышел за разумные границы [1, 1.9]: макс. отклонение среди сэмплов ${Math.max(...r.samples.map(v=>Math.abs(v-1)))}`);
    if (Math.abs(r.atStart-1)>0.01) return post(name,false,`на дистанции 0 ждали базовый темп (×1) у самой кривой, получили ${r.atStart}`);
    if (r.atPeak < 1.8) return post(name,false,`в середине окна передышки ждали заметный пик кривой (~×1.9), получили ${r.atPeak}`);
    if (Math.abs(r.atSpanEnd-1)>0.01) return post(name,false,`на конце окна передышки ждали возврат кривой к базовому темпу (×1), получили ${r.atSpanEnd}`);
    if (Math.abs(r.atFlat-1)>0.01) return post(name,false,`вне окна передышки кривая должна быть ровно базовой (×1), получили ${r.atFlat}`);
    if (Math.abs(r.atNextCycle-r.atStart)>0.01) return post(name,false,'кривая не повторяется по периоду — цикл сломан');
    if (Math.abs(r.customMul-1)>0.001) return post(name,false,`в Своей трассе передышка обязана быть выключена (воля автора), получили множитель ${r.customMul}`);
    if (Math.abs(r.hookMul-1)>0.001) return post(name,false,`внутри первой волны (dist=${r.wave1Target/1}·½ < цель волны 1 = ${r.wave1Target}) lullMul() обязан быть ровно ×1 — крючок открытия не защищён от передышки, получили ${r.hookMul} (партия 28)`);
    if (r.classicMul<1.8) return post(name,false,`после первой волны на пике окна передышки множитель должен быть заметно выше 1, получили ${r.classicMul}`);
    post(name,true,`крючок первой волны — ×1 без исключений, дальше темп дышит: пик передышки ×${r.classicMul.toFixed(2)}, Своя трасса не тронута`);
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* Страж 98 — Ноты музыки разбросаны по высоте/панораме, корень дрона плывёт (партия 24).
   Стережёт: jitterFreq()/jitterPan() и DRONE_ROOTS-дрейф в js/music.js.
   Контекст: присланные владельцем материалы (сверено с кодом, не взято на слово) — приём
   Брайана Ино «неточность делает звук живым» (±3% по высоте, случайная панорама на каждой
   ноте) и «плывущий центр» (корень дрона медленно ходит по соседним ступеням минорной
   пентатоники, а не стоит на одной ноте вечно). music.js уже был генеративным синтезом
   (партия «Фаза А») — это его усиление, не новая система. Владелец подтвердил объединение
   двух пунктов разбора цены в один цикл. */
async function guardMusicJitterAndDrift(browser){
  const name = '98. Ноты музыки разбросаны, корень дрона плывёт (партия 24)';
  let ctx;
  try{
    const o = await openGame(browser, { init:FRESH });
    ctx = o.ctx;
    const r = await o.page.evaluate(()=>{
      runMode='classic'; startGame();
      const freqs=[], pans=[];
      for(let i=0;i<200;i++){ freqs.push(music._jitterFreq(440)); pans.push(music._jitterPan()); }
      const freqBad = freqs.some(f=>f<440*0.96 || f>440*1.04);
      const freqFlat = new Set(freqs).size < 5; // 200 бросков почти наверняка дадут разброс, если рандом реально применяется
      const panBad = pans.some(p=>p<-1||p>1);
      const panFlat = new Set(pans).size < 5;
      const root0 = music._droneRoot();
      music._kickDrift(1); const root1 = music._droneRoot();
      music._kickDrift(1); music._kickDrift(1); music._kickDrift(1); music._kickDrift(1); music._kickDrift(1);
      const rootClamped = music._droneRoot(); // упёрлись в потолок массива, не улетели в NaN/undefined
      return { freqBad, freqFlat, panBad, panFlat, root0, root1, rootClamped };
    });
    if(r.freqFlat) return post(name,false,'jitterFreq(440) даёт одно и то же значение — разброс не работает');
    if(r.freqBad)  return post(name,false,'jitterFreq(440) вышел за ±3% — слишком сильная расстройка');
    if(r.panFlat)  return post(name,false,'jitterPan() даёт одно и то же значение — панорама не работает');
    if(r.panBad)   return post(name,false,'jitterPan() вышел за границы стерео [-1,1]');
    if(r.root0!==57) return post(name,false,`корень дрона на старте темы должен быть 57 (A3), получили ${r.root0}`);
    if(r.root1===r.root0) return post(name,false,'корень дрона не сдвинулся после принудительного шага дрейфа');
    if(typeof r.rootClamped!=='number' || !isFinite(r.rootClamped))
      return post(name,false,`корень дрона улетел за пределы массива: ${r.rootClamped}`);
    post(name,true,'высота/панорама нот разбросаны в безопасных пределах, корень дрона плывёт и не улетает за массив');
  }catch(e){ post(name,false,e.message.split('\n')[0]); }
  finally{ if(ctx) await ctx.close(); }
}

/* ============================================================ */
const GUARDS = [ guardNothingBroken, guardBootWithoutCdn, guardGhostAfterSubmit, guardCustomFinishClearsSave,
                 guardDailyMenuClearsSave, guardWinIsNotDeath, guardBrokenProfileSurvives,
                 guardLastHitKindReset,
                 guardVignetteFitsFrame, guardBurstColorValid, guardDuckSurvivesPause,
                 guardForgeSlidersPersist, guardForgeChipRepaints, guardTooNarrowOnTop,
                 guardDedupIgnoresFps, guardQuietIsNotDelivered, guardBrokenQueueSurvives,
                 guardHungServerReleasesMail, guardSyncFlushOnce, guardDiscord5xxNotCached,
                 guardCloudWhitelist, guardQuotaNotSilent, guardBrokenStoreKeepsRaw,
                 guardSessionBeaconThrottled,
                 guardTheaterNeverScores, guardCustomKindsBeatWaveGate, guardGateGivesRoom,
                 guardGuestTrackSurvives, guardKeysRespectFields,
                 guardShellPathsExist, guardBootFailureIsVisible, guardManifestLangEarly,
                 guardAppPathRedirects,
                 guardZeroPerChannel, guardNoZeroFromDeadChannel, guardSpreadPerAxis,
                 guardCourtWorksWithNegativeBeta, guardWheelDoesNotStick,
                 guardLiarCannotGrabWheel, guardOfferRespectsChoice,
                 guardLandscapeBoot, guardCoreCrashIsVisible, guardForgeSkyStartsOnEntry,
                 guardSavedRunKeepsMode, guardDyingIsNotSaved, guardHangarNoAccidentalSpend,
                 guardStatsComeBack, guardAllBurstColorForms, guardSkinNamesAllLangs,
                 guardStorageDenialKeepsData, guardForgeNameSurvives,
                 guardTrackIsSameForEveryone, guardWaveIsDistanceOnly,
                 guardNebulaNotRebuiltInFrame, guardOldTrackCodesUnchanged,
                 guardCloudDoesNotEatRecord, guardKeyboardPaysForJerk,
                 guardReducedMotionStopsBlink, guardQualityFrozenOnOverlays,
                 guardGhostDoesNotHijackSeed, guardGyroNoExtraPickups, guardWallReachableEverywhere,
                 guardVerticalCorridor, guardAdaptiveHelpsNewbie, guardRestartDoesNotLaunder,
                 guardDailyAttemptSurvivesClockChange, guardBrokenTapeDoesNotKillBoot,
                 guardTelemetryToggleStopsAll, guardTgSignatureStrippedFromUrl,
                 guardDailyTrackIsUtc, guardScoreCeilingAndPassport,
                 guardMetreUnitLocalized, guardFullscreenSpritesInDevicePixels,
                 guardCanvasContextLossRecovers, guardGradientsAreCached,
                 guardFullscreenFailedResetsFlag, guardTopListEscapesNames,
                 guardSkinPricesAreTiered, guardFontLicenseShipped, guardPrivacyMatchesCode,
                 guardDayJournalCounts, guardProfileRespectsToggle, guardDaysAckOnlyOnServerWord,
                 guardStaleAnswerCannotRestart, guardGhostKeepsItsOwnSeed, guardQueueSubtractsNotWipes,
                 guardSecondFingerCannotSteal, guardNothingLeaksBetweenRuns, guardTelegramPerfClassRead,
                 guardModuleGradientsCached, guardFrameStringsCached, guardHudNotQueriedInTicks,
                 guardFlipThroughDebounce, guardBridgeReadsSignatureBeforeUrlCleared, guardTakeoffExcludedFromCalStorm,
                 guardForgeSkyLoopCachesScreenRef, guardWaveDistTargetSped, guardMusicJitterAndDrift,
                 guardResizeSurvivesZeroViewport, guardNonTelegramHudGetsBreathingRoom,
                 guardPopupTextIsUppercase, guardWaveLullContrast, guardGfxInvalidateClearsModuleGradients ];

const server = await serve();
BASE = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ args:['--no-sandbox','--mute-audio'] });
console.log(`\nСТРАЖИ КОСМОГРАММЫ · партия «Пожар»\nборт: ${BASE}\n`);
for(const g of GUARDS) await g(browser);
await browser.close(); server.close();

console.log(`\n${failed ? `❌ ПРОПУЩЕНО БЕД: ${failed} из ${GUARDS.length}` : `✅ ВСЕ ${GUARDS.length} СТРАЖЕЙ НА ПОСТУ`}\n`);
process.exit(failed ? 1 : 0);
