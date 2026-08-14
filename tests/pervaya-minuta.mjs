/* ============================================================
   ПЕРВАЯ МИНУТА КОСМОГРАММЫ

   Зачем: телеметрия 13.08 показала новичка — 26 забегов, 427 секунд, средний
   забег 16.4 с, 16 смертей из 26 от камня, все в Классике, все пальцем.
   Бот-испытатель меряет темп всей трассы; здесь мерится только то, что видит
   человек в первые секунды, и мерится не «сложность», а ПРОХОДИМОСТЬ:
   успевает ли самолёт физически уйти из-под того, что на него летит.

   Метод. Классика берёт свежий сид каждый забег, поэтому первая минута у
   новичка КАЖДЫЙ раз другая — значит одну трассу мерить бессмысленно. Прибор
   гоняет N сидов и печатает распределение. Два пилота:
     · «столб»    — не двигается вовсе. Показывает, что небо делает само.
     · «идеальный» — каждый шаг уходит в самый широкий свободный проход.
       Если гибнет ИДЕАЛЬНЫЙ, виновата не рука игрока, а расстановка.

   Единицы: меры неба. Шаг физики 1/60 с. Радиус самолёта 16, зазор столкновения
   ещё -6, значит на проход нужно 2*(16+16-6)=52 меры между центрами соседних
   камней среднего размера — прибор считает честно по каждому объекту.

   Запуск:  node tests/pervaya-minuta.mjs
            node tests/pervaya-minuta.mjs --seeds=200 --meters=1400
   ============================================================ */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const req=createRequire(import.meta.url);
let chromium; for(const b of [(()=>{try{return execSync('npm root -g',{encoding:'utf8'}).trim()}catch(e){return ''}})(),'/opt/node-tools/node_modules','/usr/lib/node_modules']){ try{ chromium=req(path.join(b,'playwright')).chromium; break; }catch(e){} }
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{ const a=process.argv.find(x=>x.startsWith('--'+k+'=')); return a?+a.split('=')[1]:d; };
const SEEDS=arg('seeds',120), METERS=arg('meters',1400);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml'};
const srv=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT)){r.writeHead(403);return r.end();}
  fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(d); }); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const BASE=`http://127.0.0.1:${srv.address().port}/index.html`;
const br=await chromium.launch({args:['--no-sandbox','--mute-audio']});
const ctxB=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const pg=await ctxB.newPage();
await pg.goto(BASE,{waitUntil:'load'}); await pg.waitForFunction(()=>window.__gameUp===1,{timeout:20000});

const R = await pg.evaluate(({SEEDS,METERS})=>{
  const out=[];
  function freeSegments(){ // свободные отрезки коридора на линии самолёта
    const L=fieldL()+20, Rr=fieldL()+fieldW()-20;
    const bands=[];
    for(const o of obstacles){
      // объект опасен, если пересечёт линию самолёта в ближайшие 0.9 с
      const dy=plane.y-o.y; if(dy<0) continue;
      const t=o.vy>0?dy/o.vy:1e9; if(t>54) continue;   // 54 шага ≈ 0.9 с
      const half=(o.r||16)+plane.r-6;
      bands.push([o.x-half,o.x+half]);
    }
    bands.sort((a,b)=>a[0]-b[0]);
    const free=[]; let cur=L;
    for(const [a,b] of bands){ if(a>cur) free.push([cur,Math.min(a,Rr)]); cur=Math.max(cur,b); if(cur>=Rr) break; }
    if(cur<Rr) free.push([cur,Rr]);
    return free.filter(s=>s[1]-s[0]>0);
  }
  function widest(free){ let best=null,w=-1; for(const s of free){ const d=s[1]-s[0]; if(d>w){w=d;best=s;} } return {w:Math.max(0,w),c:best?(best[0]+best[1])/2:195}; }

  for(let si=0; si<SEEDS; si++){
    for(const pilot of ['stolb','ideal']){
      if(!window.__spawnHooked){ window.__spawnHooked=1; const _so=spawnObstacle; window.spawnObstacle=function(...a){ window.__spawnLog.push(Math.round(S.dist)); return _so.apply(this,a); }; }
      window.__spawnLog=[];
      runMode='classic'; startGame();
      mapSeedKey=String(100000+si); mapSeqReset(); mapRNG=keyRNG(mapSeedKey);
      input.touchX=null; input.touchY=null;
      let steps=0, firstObsMeter=null, firstStarMeter=null, firstPowMeter=null;
      let minGap=1e9, minGapMeter=null, blocked=0, spawnCount=0, seenIds=new Set();
      let deathMeter=null, deathKind=null, deathWave=null, deathSec=null;
      let reactMin=1e9, reactSum=0, reactN=0;
      const per100={};
      while(S.running && !S.dying && S.dist<METERS && steps<60*180){
        if(pilot==='ideal'){
          const g=widest(freeSegments());
          input.touchX=g.c; input.touchY=plane.y+90; // позиционное руление: цель = центр самого широкого прохода
        }
        update(1/60); steps++;
        if(obstacles.length && firstObsMeter===null) firstObsMeter=Math.round(S.dist);
        if(stars.length && firstStarMeter===null) firstStarMeter=Math.round(S.dist);
        if(powerups.length && firstPowMeter===null) firstPowMeter=Math.round(S.dist);
        for(const o of obstacles){ if(o.__r) continue; o.__r=1;
          const dy=plane.y-o.y; if(dy>0 && o.vy>0){ const sec=(dy/o.vy)/60; reactSum+=sec; reactN++; if(sec<reactMin) reactMin=sec; } }
        const g=widest(freeSegments());
        if(g.w<minGap){ minGap=g.w; minGapMeter=Math.round(S.dist); }
        if(g.w<2*plane.r) blocked++;               // прохода шире самолёта нет вовсе
      }
      spawnCount=window.__spawnLog.length;
      for(const m of window.__spawnLog){ const b=Math.floor(m/100)*100; per100[b]=(per100[b]||0)+1; }
      // время реакции: преграда рождается на y=-50 и идёт до линии самолёта
      if(S.dying||!S.running){ deathMeter=Math.round(S.dist); deathKind=S.lastHitKind||'?'; deathWave=S.mission; deathSec=+(steps/60).toFixed(1); }
      out.push({seed:si,pilot,firstObsMeter,firstStarMeter,firstPowMeter,
                minGap:Math.round(minGap),minGapMeter,blocked,spawns:spawnCount,
                deathMeter,deathKind,deathWave,deathSec,reached:Math.round(S.dist),sec:+(steps/60).toFixed(1),per100,
                reactMin:isFinite(reactMin)?+reactMin.toFixed(2):null, reactAvg:reactN?+(reactSum/reactN).toFixed(2):null});
      for(const o of obstacles) delete o.__r;
    }
  }
  return out;
},{SEEDS,METERS});
await br.close(); srv.close();

const num=a=>a.filter(x=>typeof x==='number'&&isFinite(x));
const q=(a,p)=>{ const s=num(a).slice().sort((x,y)=>x-y); return s.length?s[Math.min(s.length-1,Math.floor(s.length*p))]:NaN; };
const avg=a=>{ const s=num(a); return s.length?s.reduce((x,y)=>x+y,0)/s.length:NaN; };
console.log(`\nПЕРВАЯ МИНУТА · ${SEEDS} сидов Классики · до ${METERS} м · эталон 390×844\n`);
for(const pilot of ['stolb','ideal']){
  const r=R.filter(x=>x.pilot===pilot);
  const died=r.filter(x=>x.deathMeter!==null);
  const nm=pilot==='stolb'?'ПИЛОТ-СТОЛБ (не двигается)':'ЖАДНЫЙ ПИЛОТ (каждый шаг — в центр самого широкого прохода; это не оптимум, а простая эвристика)';
  console.log(`── ${nm} ──`);
  console.log(`  погибло ${died.length} из ${r.length} забегов (${Math.round(100*died.length/r.length)}%)`);
  if(died.length){
    console.log(`  метр гибели: медиана ${q(died.map(x=>x.deathMeter),.5)} · четверть гибнет до ${q(died.map(x=>x.deathMeter),.25)} м`);
    console.log(`  секунда гибели: медиана ${q(died.map(x=>x.deathSec),.5)} с · четверть до ${q(died.map(x=>x.deathSec),.25)} с`);
    const kinds={}; died.forEach(x=>kinds[x.deathKind]=(kinds[x.deathKind]||0)+1);
    console.log(`  от чего: ${Object.entries(kinds).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${Math.round(100*v/died.length)}%`).join(', ')}`);
    const waves={}; died.forEach(x=>waves[x.deathWave]=(waves[x.deathWave]||0)+1);
    console.log(`  на волне: ${Object.entries(waves).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}→${Math.round(100*v/died.length)}%`).join(' · ')}`);
  }
  console.log(`  первая преграда: медиана ${q(r.map(x=>x.firstObsMeter),.5)} м · первая звезда ${q(r.map(x=>x.firstStarMeter),.5)} м · первый бонус ${q(r.map(x=>x.firstPowMeter),.5)} м`);
  console.log(`  самый узкий проход за забег: медиана ${q(r.map(x=>x.minGap),.5)} мер · худшие 10% ${q(r.map(x=>x.minGap),.1)} мер (самолёт шириной ${32})`);
  console.log(`  шагов вовсе без прохода: медиана ${q(r.map(x=>x.blocked),.5)} · худшие 10% ${q(r.map(x=>x.blocked),.9)}`);
  const bands={}; r.forEach(x=>{ for(const k in x.per100) bands[k]=(bands[k]||0)+x.per100[k]; });
  const ks=Object.keys(bands).map(Number).sort((a,b)=>a-b).slice(0,10);
  console.log(`  запас на реакцию (от рождения до линии самолёта): медиана ${q(r.map(x=>x.reactAvg),.5)} с · худший случай ${q(r.map(x=>x.reactMin),.1)} с`);
  console.log(`  преград на 100 м: ${ks.map(k=>`${k}–${k+100}: ${(bands[k]/r.length).toFixed(1)}`).join(' · ')}\n`);
}
