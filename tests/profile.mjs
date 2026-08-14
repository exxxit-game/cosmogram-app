/* ============================================================
   ЗАМЕР КАДРА КОСМОГРАММЫ

   Зачем: стражи доказывают правила, бот меряет темп, глаза приносят кадры — но
   ни один прибор не отвечает на вопрос «сколько стоит кадр и из чего он состоит».
   Раздел 4 разбора был построен на оценках из кода, и это честно оговаривалось.
   Здесь оценки заменяются счётом.

   Как: подменяем методы контекста счётчиками, гоняем НАСТОЯЩУЮ игру заданное
   число кадров и печатаем, сколько раз за кадр вызван каждый метод и сколько
   пикселей закрашено. Отдельно — время кадра под замедлением процессора (CDP),
   чтобы увидеть слабый Android, а не эту машину.

   Запуск:  node tests/profile.mjs
            node tests/profile.mjs --frames=600 --tier=3
   ============================================================ */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const req=createRequire(import.meta.url);
let chromium; for(const b of [(()=>{try{return execSync('npm root -g',{encoding:'utf8'}).trim()}catch(e){return ''}})(),'/opt/node-tools/node_modules','/usr/lib/node_modules']){ try{ chromium=req(path.join(b,'playwright')).chromium; break; }catch(e){} }
if(!chromium){ console.error('нет playwright'); process.exit(2); }
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?a.split('=')[1]:d; };
const FRAMES=+arg('frames',600), TIER=+arg('tier',2), THROTTLE=+arg('cpu',4);
const HEAVY=process.argv.includes('--heavy'), DPRF=+arg('dpr',0);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
const srv=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT)){r.writeHead(403);return r.end();}
  fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(d); }); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${srv.address().port}/index.html`;
const br=await chromium.launch({args:['--no-sandbox','--mute-audio']});
const ctxB=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const pg=await ctxB.newPage();
console.log(`\nЗАМЕР КАДРА · борт ${BASE}\nэкран 390×844 dpr 3 · тир графики ${TIER} · ${FRAMES} кадров\n`);
await pg.goto(BASE,{waitUntil:'load'});
await pg.waitForFunction(()=>window.__gameUp===1,{timeout:20000});

const counts = await pg.evaluate(({FRAMES,TIER,HEAVY,DPRF})=>{
  const C={}, P={fillPx:0, imgPx:0}; const bump=(k,n)=>{ C[k]=(C[k]||0)+(n||1); };
  const proto=CanvasRenderingContext2D.prototype;
  const WRAP=['fillRect','strokeRect','clearRect','drawImage','stroke','fill','beginPath','moveTo','lineTo','arc','closePath','save','restore','createLinearGradient','createRadialGradient','fillText','strokeText','setTransform','clip','ellipse','quadraticCurveTo','bezierCurveTo','rect','translate','rotate','scale'];
  const orig={};
  for(const m of WRAP){ if(typeof proto[m]!=='function') continue; orig[m]=proto[m];
    proto[m]=function(...a){ bump(m);
      if(m==='fillRect'){ const w=Math.abs(a[2]||0), h=Math.abs(a[3]||0); P.fillPx+=w*h; }
      if(m==='drawImage'){ const w=Math.abs(a.length>=5?a[3]:(a[0]&&a[0].width)||0), h=Math.abs(a.length>=5?a[4]:(a[0]&&a[0].height)||0); P.imgPx+=w*h; }
      return orig[m].apply(this,a); }; }
  const SETS=['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation','lineWidth','font','filter','shadowBlur'];
  const od={};
  for(const s of SETS){ const d=Object.getOwnPropertyDescriptor(proto,s); if(!d||!d.set) continue; od[s]=d;
    Object.defineProperty(proto,s,{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){ bump('set:'+s); return d.set.call(this,v); }}); }
  // Канвасы: сколько создано и сколько из них полноэкранных
  const origCreate=document.createElement.bind(document);
  document.createElement=function(t,o){ if(String(t).toLowerCase()==='canvas') bump('newCanvas'); return origCreate(t,o); };

  runMode='classic'; Q.mode='manual'; Q.level=TIER; if(typeof gfxCap==='function') gfxCap();
  if(DPRF){ dprCap=DPRF; resize(); }             // насильно поднимаем плотность до флагманской
  startGame();
  for(let i=0;i<120;i++) update(1/60);           // прогрев: поле наполняется, кэши печутся
  if(HEAVY){                                      // худший случай: поле под завязку, частицы у капа
    while(obstacles.length<MAXOB) spawnObstacle();
    for(let i=0;i<6;i++) spawnStar();
    for(let i=0;i<40;i++) burst(plane.x, plane.y, '#ff9f5a', 12);
    for(let i=0;i<10;i++) update(1/60);
  }
  for(const k in C) delete C[k]; P.fillPx=0; P.imgPx=0;
  const t0=performance.now();
  for(let i=0;i<FRAMES;i++){ update(1/60); draw(); }
  const ms=performance.now()-t0;

  for(const m of WRAP) if(orig[m]) proto[m]=orig[m];
  for(const s of SETS) if(od[s]) Object.defineProperty(proto,s,od[s]);
  document.createElement=origCreate;
  return { C, P, ms, W, H, DPR, SC, canvasPx:document.getElementById('game').width*document.getElementById('game').height,
           obs:obstacles.length, stars:stars.length, parts:(typeof particles!=='undefined'?particles.length:-1) };
},{FRAMES,TIER,HEAVY,DPRF});

const per = n => (n/FRAMES);
const rows = Object.entries(counts.C).sort((a,b)=>b[1]-a[1]);
console.log(`поле в момент замера: преград ${counts.obs}, звёзд ${counts.stars}, частиц ${counts.parts}`);
console.log(`холст ${counts.canvasPx.toLocaleString('ru')} пикс · мир ${counts.W}×${counts.H} мер · DPR ${counts.DPR} · SC ${counts.SC.toFixed(3)}\n`);
console.log('вызов                          за кадр      в секунду (60 fps)');
for(const [k,v] of rows){ if(per(k)<0.5 && v/FRAMES<0.5) continue;
  console.log(`  ${k.padEnd(28)} ${per(v).toFixed(1).padStart(8)} ${Math.round(per(v)*60).toLocaleString('ru').padStart(14)}`); }
const fillScreens = counts.P.fillPx/FRAMES/(counts.W*counts.H);
const imgScreens  = counts.P.imgPx /FRAMES/(counts.W*counts.H);
console.log(`\nзакраска: fillRect ${fillScreens.toFixed(2)} экрана за кадр · drawImage ${imgScreens.toFixed(2)} экрана за кадр`);
console.log(`итого ${(fillScreens+imgScreens).toFixed(2)} полноэкранных прохода за кадр = ${Math.round((fillScreens+imgScreens)*counts.canvasPx*60/1e6).toLocaleString('ru')} Мпикс/с при 60 fps`);
console.log(`чистое время update+draw без композитинга: ${(counts.ms/FRAMES).toFixed(2)} мс/кадр на этой машине\n`);

// --- время кадра под замедлением процессора ---
const cdp=await ctxB.newCDPSession(pg);
for(const rate of [1,THROTTLE,6]){
  await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  const t=await pg.evaluate(async ({TIER})=>{
    Q.mode='manual'; Q.level=TIER; startGame();
    for(let i=0;i<60;i++){ update(1/60); draw(); }
    const s=[]; for(let i=0;i<180;i++){ const a=performance.now(); update(1/60); draw(); s.push(performance.now()-a); }
    s.sort((x,y)=>x-y);
    return { med:s[90], p95:s[171], max:s[179] };
  },{TIER});
  console.log(`процессор ×${rate}: медиана ${t.med.toFixed(2)} мс · 95-й ${t.p95.toFixed(2)} мс · худший ${t.max.toFixed(2)} мс  (бюджет 16.7 мс)`);
}
await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
await br.close(); srv.close();
