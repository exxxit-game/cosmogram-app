/* ============================================================
   ОЧНАЯ СТАВКА — две сборки на одной мерке

   Зачем: владелец сказал «в 1.108.0 была классная сложность». Это вводные, а не
   мнение (закон о работе с владельцем). Прибор ставит обе сборки рядом и меряет
   их ОДНИМ сценарием, чтобы «стало скучнее» превратилось в числа.

   Запуск: node tests/ochnaya-stavka.mjs /root/v1108 /root/cosmo
   ============================================================ */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const req=createRequire(import.meta.url); let chromium;
for(const b of [(()=>{try{return execSync('npm root -g',{encoding:'utf8'}).trim()}catch(e){return ''}})(),'/opt/node-tools/node_modules']){ try{ chromium=req(path.join(b,'playwright')).chromium; break; }catch(e){} }
const ROOTS=process.argv.slice(2).filter(a=>!a.startsWith('--'));
if(ROOTS.length!==2){ console.error('нужно два пути: node tests/ochnaya-stavka.mjs <старая> <новая>'); process.exit(2); }
const SEEDS=+((process.argv.find(a=>a.startsWith('--runs='))||'--runs=60').split('=')[1]);
const M={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain','.svg':'image/svg+xml'};
function serve(root){ return new Promise(res=>{ const s=http.createServer((q,r)=>{ const u=decodeURIComponent(q.url.split('?')[0]);
  const f=path.join(root,u==='/'?'index.html':u); if(!f.startsWith(root)){r.writeHead(403);return r.end();}
  fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);return r.end();} r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'}); r.end(d); }); });
  s.listen(0,'127.0.0.1',()=>res(s)); }); }

const br=await chromium.launch({args:['--no-sandbox','--mute-audio']});
const out=[];
for(const root of ROOTS){
  const srv=await serve(root);
  const c=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const pg=await c.newPage();
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`,{waitUntil:'load'});
  try{ await pg.waitForFunction(()=>typeof startGame==='function' && typeof update==='function',{timeout:20000}); }
  catch(e){ console.error(`не взлетело: ${root}`); await c.close(); srv.close(); continue; }
  const r = await pg.evaluate(({SEEDS})=>{
    const ver=(typeof GAME_VERSION!=='undefined')?GAME_VERSION:'?';
    const canSeed = typeof mapSeedKey!=='undefined' && typeof keyRNG==='function';
    const hasLull = typeof lullCurve==='function';
    // 1) НАБЛЮДАТЕЛЬ: что меняется за забег (бессмертный, один прогон)
    runMode='classic'; startGame();
    if(canSeed){ mapSeedKey='777'; if(typeof mapSeqReset==='function') mapSeqReset(); mapRNG=keyRNG('777'); }
    const marks=[0,500,1000,2000,3000,5000], snap=[]; let mi=0, steps=0, lullSteps=0;
    const spawnD=[]; let last=0;
    const _so=spawnObstacle; window.spawnObstacle=function(...a){ const z=_so.apply(this,a); spawnD.push(Math.round(S.dist)); return z; };
    const waves={};
    while(S.dist<5000 && steps<60*600){
      S.lives=999; S.dying=0; update(1/60); steps++;
      if(!waves[S.mission]) waves[S.mission]=Math.round(S.dist);
      if(hasLull && lullCurve(S.dist)>1.05) lullSteps++;
      if(mi<marks.length && S.dist>=marks[mi]){ snap.push({m:marks[mi],speed:+S.speed.toFixed(2),wave:S.mission,obs:obstacles.length}); mi++; }
    }
    window.spawnObstacle=_so;
    const per100={}; for(const d of spawnD){ const b=Math.floor(d/100)*100; if(b<3000) per100[b]=(per100[b]||0)+1; }
    const gaps=[]; for(let i=1;i<spawnD.length;i++){ const g=spawnD[i]-spawnD[i-1]; if(g>0) gaps.push(g); }
    gaps.sort((a,b)=>a-b);
    // 2) ПИЛОТ-СТОЛБ: где кончается забег того, кто не двигается
    const deaths=[];
    for(let si=0;si<SEEDS;si++){
      runMode='classic'; startGame();
      if(canSeed){ mapSeedKey=String(200000+si); if(typeof mapSeqReset==='function') mapSeqReset(); mapRNG=keyRNG(mapSeedKey); }
      input.touchX=null; input.touchY=null;
      let st=0;
      while(S.running && !S.dying && st<60*120){ update(1/60); st++; }
      deaths.push({m:Math.round(S.dist), sec:+(st/60).toFixed(1), wave:S.mission, kind:S.lastHitKind||'?'});
    }
    return {ver,canSeed,hasLull,snap,waves,per100,
            gapMed:gaps[Math.floor(gaps.length/2)]||0, spawns:spawnD.length,
            lullPct: hasLull?Math.round(100*lullSteps/steps):0, deaths};
  },{SEEDS});
  out.push({root,...r});
  await c.close(); srv.close();
}
await br.close();

const med=a=>{const x=a.slice().sort((p,q)=>p-q);return x[Math.floor(x.length/2)];};
console.log(`\nОЧНАЯ СТАВКА · ${SEEDS} забегов пилота-столба на сборку · эталон 390×844\n`);
console.log('                              ' + out.map(o=>String(o.ver).padStart(12)).join(''));
const row=(t,f)=>console.log(t.padEnd(30)+out.map(o=>String(f(o)).padStart(12)).join(''));
row('форсируемый сид',            o=>o.canSeed?'да':'нет');
row('«дыхание неба» есть',        o=>o.hasLull?'да':'НЕТ');
row('доля пути в передышке',      o=>o.hasLull?o.lullPct+'%':'—');
row('спавнов на 5000 м',          o=>o.spawns);
row('шаг между спавнами, медиана',o=>o.gapMed+' м');
console.log('');
for(const m of [0,500,1000,2000,3000,5000]){
  row(`скорость на ${m} м`, o=>{const s=o.snap.find(x=>x.m===m);return s?s.speed:'—';});
}
console.log('');
for(const w of [2,3,4,5,6,7,8]) row(`волна ${w} наступает на`, o=>(o.waves[w]!=null?o.waves[w]+' м':'—'));
console.log('');
for(const b of [0,100,200,300,400,500,1000,1500,2000,2500]) row(`преград на ${b}–${b+100} м`, o=>(o.per100[b]||0));
console.log('');
row('столб гибнет: медиана метр', o=>med(o.deaths.map(d=>d.m)));
row('столб гибнет: медиана сек',  o=>med(o.deaths.map(d=>d.sec)));
row('столб гибнет: медиана волна',o=>med(o.deaths.map(d=>d.wave)));
