/* ============================================================
   БОТ-ИСПЫТАТЕЛЬ КОСМОГРАММЫ

   Зачем: стражи проверяют правила, глаза приносят кадры — но ни те, ни другие
   не отвечают на вопрос, который задаёт игрок: «стало легче или тяжелее?».
   Темп, плотность неба, плавность и ширина коридора — величины, а не правила:
   их надо мерить числом и сравнивать с прошлым замером, иначе «мне кажется,
   стало скучнее» останется спором двух мнений.

   Как устроено. Прибор НЕ играет «по-человечески» и не притворяется игроком.
   Он летит по жёстко заданному сценарию с ЗАФИКСИРОВАННЫМ сидом и меряет то,
   что даёт небо: сколько метров до каждой волны, сколько преград и звёзд на
   километр, как ведёт себя плавность, где стены коридора. Сценарий важнее
   мастерства: два прогона обязаны совпасть ДО МЕТРА, иначе врёт прибор, а не игра.
   Поэтому вместо requestAnimationFrame здесь ручные тики update(STEP) — время
   в измерении не участвует вовсе, и замер не зависит от того, чем занят компьютер.

   База. Если рядом лежит tests/playtest-baseline.json — прибор сравнивает с ней
   и выносит вердикт GO / CONDITIONAL / NO-GO. Если базы нет, он НЕ придумывает
   вердикт, а честно печатает показания и говорит, что сравнивать не с чем.
   База пишется только ключом --write-baseline и только с той сборки, в которую
   владелец сыграл и она ему понравилась: база, снятая со сломанной сборки,
   узаконивает поломку.

   Запуск:  node tests/playtest.mjs
            node tests/playtest.mjs --write-baseline   (после «мне нравится»)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const chromium = (()=>{
  const req = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(execSync('npm root -g',{encoding:'utf8'}).trim()); } catch(e){}
  tries.push('/opt/node-tools/node_modules', '/usr/lib/node_modules', '/usr/local/lib/node_modules');
  for(const base of tries){ try { return req(path.join(base,'playwright')).chromium; } catch(e){} }
  try { return req('playwright').chromium; } catch(e){}
  console.error('\n❌ Не найден playwright. Поставь: npm i -g playwright\n'); process.exit(2);
})();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tests', 'playtest-baseline.json');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.woff2':'font/woff2', '.png':'image/png',
  '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml' };

function serve(){
  return new Promise(res=>{
    const s = http.createServer((req,rep)=>{
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      if(!f.startsWith(ROOT)) { rep.writeHead(403); return rep.end(); }
      fs.readFile(f,(e,d)=>{ if(e){ rep.writeHead(404); return rep.end('404'); }
        rep.writeHead(200,{'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); rep.end(d); });
    });
    s.listen(0,'127.0.0.1',()=>res(s));
  });
}

/* Замер выполняется внутри страницы: физика игры живёт там, и тащить её наружу
   значило бы мерить копию, а не игру. Сюда возвращаются только числа. */
async function zamer(page, opts){
  return await page.evaluate((o)=>{
    /* Неуязвимость на всё время замера. Прибор меряет НЕБО, а не мастерство:
       если бот погибнет на 400 метрах, мы не узнаем ничего про волну шестую.
       Именно поэтому он не «играет» — играть будет владелец, а прибор считает. */
    const STEP = 1/60;
    Store.set('ghostAgain', 0);          // тень в замере не участвует — она рисуется, но на числа не влияет
    runMode = o.rezhim; startGame();
    /* Фиксируем сид: без этого каждый прогон летит по своему небу и два замера
       нельзя сравнить ни между собой, ни с базой. */
    if (typeof keyRNG === 'function'){
      mapRNG = keyRNG(String(o.sid)); mapSeedKey = String(o.sid);
      if (typeof mapSeqReset === 'function') mapSeqReset();
      S.seed = o.sid;
    }
    S.lives = 9999;

    const volny = {};          // волна → на каком метре наступила
    let spawnov = 0, zvyozd = 0, bonusov = 0;
    let prevMission = S.mission, prevObs = obstacles.length, prevStars = stars.length, prevPow = powerups.length;
    let plavnostMin = 1, kadrov = 0;

    while (S.dist < o.metrov && kadrov < o.maxKadrov){
      S.invuln = 10;                       // держим щит от смерти, не трогая ничего другого
      /* Сценарий руления: ровная синусоида поперёк коридора. Не мастерство, а
         повторяемое движение — оно одинаково в любом прогоне и на любой сборке,
         поэтому плавность и «сколько собрал» сравнимы между замерами. */
      const fl = (typeof fieldL==='function') ? fieldL() : 0;
      const fw = (typeof fieldW==='function') ? fieldW() : W;
      const faza = kadrov / 90;
      input.touchX = fl + fw*(0.5 + 0.42*Math.sin(faza));
      input.touchY = null;

      update(STEP);
      kadrov++;

      if (S.mission !== prevMission){ volny[S.mission] = Math.round(S.dist); prevMission = S.mission; }
      // прирост длины массивов считаем как появление новых: убыль — это уход за экран
      if (obstacles.length > prevObs) spawnov += obstacles.length - prevObs;
      if (stars.length     > prevStars) zvyozd  += stars.length - prevStars;
      if (powerups.length  > prevPow)  bonusov += powerups.length - prevPow;
      prevObs = obstacles.length; prevStars = stars.length; prevPow = powerups.length;
      if (S.smooth < plavnostMin) plavnostMin = S.smooth;
    }

    const km = S.dist / 1000;
    return {
      rezhim: o.rezhim,
      metrov: Math.round(S.dist),
      kadrov,
      sekund: Math.round(kadrov * STEP),
      ochkov: Math.round(S.score),
      volny,
      volna_na_konce: S.mission,
      spawnov_na_km: +(spawnov / km).toFixed(1),
      zvyozd_na_km:  +(zvyozd  / km).toFixed(1),
      bonusov_na_km: +(bonusov / km).toFixed(1),
      plavnost_min:  +plavnostMin.toFixed(3),
      koridor: { levaya: Math.round((typeof fieldL==='function')?fieldL():0),
                 shirina: Math.round((typeof fieldW==='function')?fieldW():W) },
      shag_volny: (typeof waveDistTarget==='function')
        ? [1,2,3,4,5,6,7,8].map(m=>Math.round(waveDistTarget(m))) : null,
      versiya: (typeof GAME_VERSION!=='undefined') ? GAME_VERSION : '?',
    };
  }, opts);
}

/* Сверка с базой. Порог намеренно не нулевой: небо считается числами с плавающей
   точкой, и требовать побайтового совпадения значило бы получать красный на пустом
   месте. Но ДВА ПРОГОНА ОДНОЙ СБОРКИ обязаны совпасть точно — это проверяется
   отдельно и строже, потому что расхождение там означает, что врёт прибор. */
const DOPUSK = {
  metrov: 0.02, ochkov: 0.10, spawnov_na_km: 0.10,
  zvyozd_na_km: 0.10, bonusov_na_km: 0.15, plavnost_min: 0.05,
};

function sverka(bylo, stalo){
  const stroki = [];
  let hudshee = 0;
  for(const k of Object.keys(DOPUSK)){
    const a = bylo[k], b = stalo[k];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const otkl = a === 0 ? (b === 0 ? 0 : 1) : Math.abs(b - a) / Math.abs(a);
    hudshee = Math.max(hudshee, otkl / DOPUSK[k]);
    stroki.push(`  ${otkl <= DOPUSK[k] ? '✅' : '⚠️ '} ${k}: было ${a}, стало ${b} (${(otkl*100).toFixed(1)}%, допуск ${DOPUSK[k]*100}%)`);
  }
  for(const m of Object.keys(stalo.volny||{})){
    const a = (bylo.volny||{})[m], b = stalo.volny[m];
    if (typeof a !== 'number') continue;
    const otkl = Math.abs(b-a)/Math.max(a,1);
    if (otkl > 0.03) stroki.push(`  ⚠️  волна ${m}: была на ${a} м, стала на ${b} м`);
  }
  return { stroki, verdikt: hudshee <= 1 ? 'GO' : (hudshee <= 2 ? 'CONDITIONAL' : 'NO-GO') };
}

/* ---------------------------------------------------------- */
const pishemBazu = process.argv.includes('--write-baseline');
const server = await serve();
const PORT = server.address().port;
console.log(`\nБОТ-ИСПЫТАТЕЛЬ КОСМОГРАММЫ\nборт: http://127.0.0.1:${PORT}/index.html\n`);

const browser = await chromium.launch({ args:['--no-sandbox','--mute-audio'] });
const progony = [];
for(let i=0;i<2;i++){                       // ДВА прогона: расхождение между ними судит прибор, а не игру
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:3 });
  const page = await ctx.newPage();
  await page.addInitScript(()=>{ try{ localStorage.clear(); }catch(e){} });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(()=>window.__gameUp===1, null, { timeout:15000 });
  progony.push(await zamer(page, { rezhim:'classic', sid:20260813, metrov:6000, maxKadrov:60000 }));
  await ctx.close();
}
await browser.close(); server.close();

const [a, b] = progony;
const sovpali = JSON.stringify(a) === JSON.stringify(b);
console.log(sovpali
  ? '✅ Два прогона совпали до метра — прибору можно верить.\n'
  : '❌ ДВА ПРОГОНА РАЗОШЛИСЬ. Это неисправность прибора или потеря детерминизма — замер недействителен.\n');
if(!sovpali){
  const raz = Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));
  console.log('   разошлись поля: ' + raz.join(', ') + '\n');
}

const z = a;
console.log(`Сборка ${z.versiya} · режим ${z.rezhim} · сид 20260813`);
console.log(`  пролетел ${z.metrov} м за ${z.sekund} с, очков ${z.ochkov}, волна на конце ${z.volna_na_konce}`);
console.log(`  на километр: преград ${z.spawnov_na_km}, звёзд ${z.zvyozd_na_km}, бонусов ${z.bonusov_na_km}`);
console.log(`  плавность (минимум за забег, 1 = безупречно): ${z.plavnost_min}`);
console.log(`  коридор: ширина ${z.koridor.shirina} мер, левая стена на ${z.koridor.levaya}`);
console.log(`  волны наступили на метрах: ${Object.entries(z.volny).map(([m,d])=>m+'→'+d).join(', ') || '—'}`);
console.log(`  расчётный шаг волн: ${z.shag_volny ? z.shag_volny.join(', ') : '—'}`);

if(pishemBazu){
  if(!sovpali){ console.log('\n❌ База НЕ записана: прогоны разошлись, писать нечего.\n'); process.exit(1); }
  fs.writeFileSync(BASELINE, JSON.stringify(z, null, 2));
  console.log(`\n📌 База записана: tests/playtest-baseline.json`);
  console.log(`   Помни закон: база, снятая со сборки, в которую не играли, узаконивает поломку.\n`);
  process.exit(0);
}

if(!fs.existsSync(BASELINE)){
  console.log('\n📭 Базы нет — сравнивать не с чем, вердикт не выношу.');
  console.log('   Это не ошибка: база пишется ключом --write-baseline и только с той сборки,');
  console.log('   в которую владелец сыграл и она ему понравилась.\n');
  process.exit(0);
}

const bylo = JSON.parse(fs.readFileSync(BASELINE,'utf8'));
const { stroki, verdikt } = sverka(bylo, z);
console.log(`\nСверка с базой (сборка ${bylo.versiya}):`);
stroki.forEach(s=>console.log(s));
console.log(`\n${verdikt === 'GO' ? '✅' : verdikt === 'CONDITIONAL' ? '🟡' : '❌'} ${verdikt}\n`);
process.exit(verdikt === 'NO-GO' ? 1 : 0);
