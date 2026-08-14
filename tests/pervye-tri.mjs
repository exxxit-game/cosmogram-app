import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const req=createRequire(import.meta.url); let chromium;
for(const b of [(()=>{try{return execSync('npm root -g',{encoding:'utf8'}).trim()}catch(e){return ''}})(),'/opt/node-tools/node_modules']){ try{ chromium=req(path.join(b,'playwright')).chromium; break; }catch(e){} }
const ROOT='/root/cosmo';
const M={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain','.svg':'image/svg+xml'};
const s=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>s.listen(0,'127.0.0.1',r));
const br=await chromium.launch({args:['--no-sandbox','--mute-audio']});
const c=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const pg=await c.newPage(); await pg.goto(`http://127.0.0.1:${s.address().port}/index.html`,{waitUntil:'load'});
await pg.waitForFunction(()=>window.__gameUp===1,{timeout:20000});
const R=await pg.evaluate(()=>{
  const rows=[];
  for(let si=0;si<200;si++){
    runMode='classic'; startGame();
    mapSeedKey=String(500000+si); mapSeqReset(); mapRNG=keyRNG(mapSeedKey);
    input.touchX=null; input.touchY=null;
    const startX=plane.x, seen=[]; let steps=0, inFlightMax=0;
    while(steps<60*12 && seen.length<3){
      update(1/60); steps++;
      inFlightMax=Math.max(inFlightMax, obstacles.filter(o=>o.y<plane.y).length);
      for(const o of obstacles){ if(o.__s) continue; o.__s=1;
        if(seen.length<3) seen.push({m:Math.round(S.dist),x:Math.round(o.x),r:Math.round(o.r||16),kind:o.kind,
          dx:Math.round(Math.abs(o.x-startX)), hit:Math.abs(o.x-startX) < ((o.r||16)+plane.r-6)}); }
    }
    for(const o of obstacles) delete o.__s;
    rows.push({startX:Math.round(startX), seen, inFlightMax});
  }
  return rows;
});
await br.close(); s.close();
const first=R.map(r=>r.seen[0]).filter(Boolean);
const hitN=first.filter(f=>f.hit).length;
const pct=(n,d)=>Math.round(100*n/d);
const med=a=>{const x=a.slice().sort((p,q)=>p-q);return x[Math.floor(x.length/2)];};
console.log(`\nПЕРВЫЕ ТРИ ПРЕГРАДЫ · 200 сидов Классики · старт самолёта x=${R[0].startX} из 390\n`);
console.log(`ПЕРВАЯ преграда:`);
console.log(`  метр рождения: медиана ${med(first.map(f=>f.m))} · разброс ${Math.min(...first.map(f=>f.m))}–${Math.max(...first.map(f=>f.m))}`);
console.log(`  вид: ${Object.entries(first.reduce((a,f)=>(a[f.kind]=(a[f.kind]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${pct(v,first.length)}%`).join(', ')}`);
console.log(`  боковое расстояние от старта: медиана ${med(first.map(f=>f.dx))} мер`);
console.log(`  ЛЕТИТ ПРЯМО В САМОЛЁТ (без движения — удар): ${hitN} из ${first.length} = ${pct(hitN,first.length)}%`);
const three=R.filter(r=>r.seen.length===3);
console.log(`\nПЕРВЫЕ ТРИ вместе:`);
console.log(`  третья преграда рождается к ${med(three.map(r=>r.seen[2].m))}-му метру = ${(med(three.map(r=>r.seen[2].m))/27.2).toFixed(1)} с полёта`);
console.log(`  сколько преград одновременно в воздухе в первые 12 с: медиана ${med(R.map(r=>r.inFlightMax))} · максимум ${Math.max(...R.map(r=>r.inFlightMax))}`);
const anyHit=R.filter(r=>r.seen.some(f=>f.hit)).length;
console.log(`  хотя бы одна из первых трёх летит прямо в неподвижный самолёт: ${pct(anyHit,R.length)}% забегов`);
