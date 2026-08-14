/* ============================================================
   ТЕСНОТА — сколько интерфейса не помещается и не достаётся

   Зачем: владелец прислал снимки с настоящего телефона (мир неба 457×844 ×0.79,
   то есть CSS-вьюпорт ≈361×667 под шапкой Telegram). На них видно, что «Назад»
   лежит поверх строк, а до нижних строк не добраться. Прибор меряет это числом:
   сколько контента за краем, сколько закрыто липкой кнопкой, и прокручивается ли
   экран настоящим пальцем.

   Запуск: node tests/tesnota.mjs
           node tests/tesnota.mjs --w=361 --h=667
   ============================================================ */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const req=createRequire(import.meta.url); let chromium;
for(const b of [(()=>{try{return execSync('npm root -g',{encoding:'utf8'}).trim()}catch(e){return ''}})(),'/opt/node-tools/node_modules']){ try{ chromium=req(path.join(b,'playwright')).chromium; break; }catch(e){} }
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const a=process.argv.find(x=>x.startsWith('--'+k+'='));return a?+a.split('=')[1]:d;};
const M={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain','.svg':'image/svg+xml'};
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);
 if(!f.startsWith(ROOT)){r.writeHead(403);return r.end();}
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':M[path.extname(f)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const br=await chromium.launch({args:['--no-sandbox','--mute-audio']});
const VIEWS=[{n:'ваш телефон под шапкой TG',w:arg('w',361),h:arg('h',667)},
             {n:'малый телефон (SE)',      w:320,h:560},
             {n:'высокий Android',         w:412,h:780}];
console.log('\nТЕСНОТА · сколько интерфейса не помещается и не достаётся\n');
for(const V of VIEWS){
  const c=await br.newContext({viewport:{width:V.w,height:V.h},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const pg=await c.newPage();
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html`,{waitUntil:'load'});
  await pg.waitForFunction(()=>window.__gameUp===1,{timeout:20000});
  const r=await pg.evaluate(async ()=>{
    const out=[];
    const rows=[]; for(let i=0;i<14;i++) rows.push({name:'ПИЛОТ'+i,best:9000-i*500,pid:100+i});
    window.syncTop=()=>Promise.resolve({ok:true,top:rows});
    const screens=[
      ['меню',        ()=>toMenu(),                          '#startScreen',   null],
      ['ангар',       ()=>{renderHangar();setScreen('hangar');}, '#hangarScreen','#hangarBackBtn'],
      ['достижения',  ()=>{openAch();},                       '#achScreen',    '#achBackBtn'],
      ['настройки',   ()=>{openSettings('menu'); document.querySelectorAll('.setGrp').forEach(g=>g.classList.add('open'));}, '#settingsScreen','#settingsBackBtn'],
      ['режимы',      ()=>{modesFill();setScreen('modes');},   '#modesScreen',  null],
      ['кузница',     ()=>{forgeOpen();},                      '#forgeScreen',  null],
    ];
    for(const [nm,go,sel,backSel] of screens){
      try{ go(); }catch(e){}
      await new Promise(r=>setTimeout(r,140));
      const el=document.querySelector(sel); if(!el){ out.push({nm,miss:true}); continue; }
      // где реально прокрутка
      let sc=el, best=el;
      el.querySelectorAll('*').forEach(n=>{ if(n.scrollHeight-n.clientHeight>best.scrollHeight-best.clientHeight) best=n; });
      sc=best;
      const over=Math.max(0, sc.scrollHeight-sc.clientHeight);
      // сколько кнопок/строк ниже нижней кромки окна
      const vh=innerHeight;
      const items=[...el.querySelectorAll('.btn,.angarIt,.topIt,.achIt,.setRow,.modeIt,.achRow')];
      const below=items.filter(n=>n.getBoundingClientRect().top>vh-8).length;
      /* Перекрытие меряем У ДНА ленты, а не в начале: липкая кнопка по замыслу плывёт над
         содержимым по дороге — беда не в этом, а в том, что до последней строки нельзя
         доскроллить из-под неё. Первая версия прибора мерила в начале и обвиняла замысел. */
      sc.scrollTop = sc.scrollHeight;
      await new Promise(r=>setTimeout(r,60));
      let covered=0, bb=null;
      if(backSel){ const b=document.querySelector(backSel);
        if(b){ const r2=b.getBoundingClientRect(); bb={top:Math.round(r2.top),h:Math.round(r2.height)};
          covered=items.filter(n=>{ const q=n.getBoundingClientRect();
            return n!==b && q.bottom>r2.top+2 && q.top<r2.bottom-2 && q.left<r2.right && q.right>r2.left; }).length; } }
      out.push({nm, over:Math.round(over), below, covered, items:items.length, bb});
    }
    return {out, W:(typeof W!=='undefined'?W:0), H:(typeof H!=='undefined'?H:0), SC:(typeof SC!=='undefined'?+SC.toFixed(2):0)};
  });
  console.log(`── ${V.n} · CSS ${V.w}×${V.h} · мир неба ${r.W}×${r.H} ×${r.SC}`);
  for(const o of r.out){
    if(o.miss){ console.log(`   ${o.nm.padEnd(12)} экрана нет`); continue; }
    const flag = o.covered>0 ? '  ⚠ строки недостижимы' : '';
    console.log(`   ${o.nm.padEnd(12)} лента ${String(o.over).padStart(4)} px · ниже кромки ${String(o.below).padStart(2)} · закрыто кнопкой у ДНА ${o.covered}${flag}`);
  }
  console.log('');
  await c.close();
}
// отдельно: клавиатура
const c2=await br.newContext({viewport:{width:361,height:667},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p2=await c2.newPage();
await p2.goto(`http://127.0.0.1:${srv.address().port}/index.html`,{waitUntil:'load'});
await p2.waitForFunction(()=>window.__gameUp===1,{timeout:20000});
console.log('── КЛАВИАТУРА (вьюпорт ужимается снизу, фокус в поле позывного)');
/* Клавиатура поднимается ТОЛЬКО при фокусе в поле — без фокуса короткий вьюпорт это
   честно короткое окно, и предупреждение обязано быть. Имитируем фокус, иначе прибор
   проверяет не тот сценарий. */
await p2.evaluate(()=>{ if(typeof openSettings==='function') openSettings('menu');
  const g=document.getElementById('setGrpProf'); if(g) g.click(); });
await p2.waitForTimeout(220);
for(const h of [667,520,420,340,300]){
  await p2.setViewportSize({width:361,height:h});
  await p2.evaluate(()=>{ const i=document.getElementById('csInput'); if(i) try{ i.focus(); }catch(e){} });
  await p2.waitForTimeout(160);
  const r=await p2.evaluate(()=>({SC:+SC.toFixed(3), W, H,
    narrow:!document.getElementById('tooNarrow').classList.contains('hidden')}));
  console.log(`   высота ${String(h).padStart(3)} px → SC ${r.SC} · мир ${r.W}×${r.H} · «экран слишком узкий»: ${r.narrow?'ДА  ⚠':'нет'}`);
}
await br.close(); srv.close();
