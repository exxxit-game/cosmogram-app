'use strict';
/* ============================================================
   FORGE v1.69.0 «Своя трасса»: конструктор забега — полная редакция.
   10 ручек в трёх группах: сложность / состав / настроение.
   Карта = компактный JSON-конфиг → код CG1.xxx → ссылка Telegram
   (?startapp=map_...). Сервер не нужен: конфиг едет в самой ссылке.
   Схема v2; коды v1 (v1.68.0) читаются и дополняются дефолтами.
   Забег по трассе — НЕ в зачёт (ни рекордов, ни кошелька): иначе
   лёгкие карты стали бы фермой звёзд. Честно — как разведка Пакта.
   Зависит от core.js ($, Store, L, clamp, toast, tg), ui.js (setScreen).
   ============================================================ */

/* ---------- Схема конфига и кодек ---------- */
const FORGE_KINDS=['rock','debris','drift','mine','sat','comet','seeker','gate']; // порядок = веса в spawnObstacle
const FORGE_LENS=[500,1000,1500,2500,4000,0]; // 0 = бесконечная
const FORGE_SKYS=[0,60,120,180,240,300]; // сдвиг оттенка неба: синее → индиго → фиолет → пурпур → маджента → роза
// по умолчанию — ровная средняя трасса на полтора километра
const FORGE_DEF={v:2,n:'',d:50,s:50,e:15,l:1500,lv:3,w:1,fl:0,b:2,sky:0,fog:0};
const FORGE_PRESETS=[ // точки входа: тапнул — и сразу летишь; докрутить можно под себя
  {k:'fpWarm', c:{n:'',d:25,s:40,e:15,l:1000,lv:3,w:1,fl:0,b:3,sky:0,fog:0}},
  {k:'fpRain', c:{n:'',d:90,s:65,e:35,l:2500,lv:3,w:3,fl:1,b:2,sky:120,fog:0}},
  {k:'fpHell', c:{n:'',d:80,s:85,e:255,l:4000,lv:1,w:5,fl:1,b:0,sky:240,fog:0}},
  {k:'fpFog',  c:{n:'',d:45,s:50,e:13,l:1500,lv:3,w:2,fl:0,b:2,sky:180,fog:2}},
  // v1.83.0 «Галерея мастера»: эталонные трассы с выверенным характером — карты в галерее рядом с базовыми
  {k:'fpGarden', c:{n:'',d:35,s:45,e:33,l:2500,lv:3,w:2,fl:0,b:3,sky:300,fog:0}}, // розовое небо, камни+кометы, щедрые звёзды — медитация
  {k:'fpSlalom', c:{n:'',d:55,s:70,e:132,l:2500,lv:3,w:3,fl:0,b:2,sky:60,fog:0}}, // дрейфы+врата в индиго — чистое мастерство
  {k:'fpHunt',  c:{n:'',d:60,s:60,e:72,l:2500,lv:2,w:4,fl:1,b:1,sky:240,fog:1}},  // искатели+мины в мадженте, фонарик, дымка — охота
  {k:'fpPulse', c:{n:'',d:70,s:95,e:17,l:1000,lv:2,w:5,fl:0,b:3,sky:120,fog:0}}   // камни+спутники во фиолете — короткий спринт на пределе
];

function forgeSanitize(c){ // вход недоверенный — код приходит извне; режем всё до рамок
  if(!c||typeof c!=='object') c={};
  const o={v:2};
  o.n=String(c.n==null?'':c.n).replace(/[<>&"'\\]/g,'').trim().slice(0,20);
  o.d=clamp(Math.round(isFinite(+c.d)?+c.d:50),10,100);
  o.s=clamp(Math.round(isFinite(+c.s)?+c.s:50),10,100);
  o.e=clamp(Math.round(isFinite(+c.e)?+c.e:15),1,255); // минимум один вид преград
  o.l=FORGE_LENS.indexOf(+c.l)>=0?+c.l:1500;
  o.lv=clamp(Math.round(isFinite(+c.lv)?+c.lv:3),1,3);
  o.w=clamp(Math.round(isFinite(+c.w)?+c.w:1),1,6);
  o.fl=c.fl?1:0;
  o.b=clamp(Math.round(isFinite(+c.b)?+c.b:2),0,3);
  o.sky=FORGE_SKYS.indexOf(+c.sky)>=0?+c.sky:0;
  o.fog=clamp(Math.round(isFinite(+c.fog)?+c.fog:0),0,2);
  return o;
}
function forgeEncode(cfg){
  const a=[2,cfg.n||'',cfg.d,cfg.s,cfg.e,cfg.l,cfg.lv,cfg.w,cfg.fl,cfg.b,cfg.sky,cfg.fog];
  const b=btoa(unescape(encodeURIComponent(JSON.stringify(a))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'CG1.'+b;
}
function forgeDecode(str){ // принимает код, полную ссылку t.me или startapp-строку; v1 и v2
  try{
    let s=String(str||'').trim();
    const m=s.match(/map_(CG1\.[A-Za-z0-9\-_]+)/); if(m) s=m[1]; // вытащили из ссылки
    if(s.indexOf('CG1.')!==0) return null;
    let b=s.slice(4).replace(/-/g,'+').replace(/_/g,'/');
    while(b.length%4) b+='=';
    const a=JSON.parse(decodeURIComponent(escape(atob(b))));
    if(!Array.isArray(a)) return null;
    if(a[0]===1) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5]}); // v1: остальное — дефолты
    if(a[0]===2) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5],lv:a[6],w:a[7],fl:a[8],b:a[9],sky:a[10],fog:a[11]});
    return null;
  }catch(e){ return null; }
}
function forgeDensityMul(d){ return 1.6-(d/100)*1.05; } // 10→×1.5 (пустое небо) … 100→×0.55 (метеоритный дождь)
function forgeSpeedMul(s){ return 0.8+(s/100)*0.5; }     // 10→×0.85 … 100→×1.3
function forgeBonusGapMul(b){ return b===1?2:b===3?.55:1; } // редко ×2 пауза … норма ×1 … часто ×0.55

/* ---------- v1.85.0 «Сначала небо»: ручка «Жар» и живое мини-небо ---------- */
function forgeHeatSet(h){ // одна ручка вместо трёх: плотность + скорость + стартовая жара
  h=clamp(Math.round(h)||4,1,10);
  forgeCfg.d=Math.min(100,8+h*9); forgeCfg.s=15+h*8; forgeCfg.w=Math.max(1,Math.round(h/2));
}
function forgeHeatGet(){ return clamp(Math.round((forgeCfg.d-8)/9),1,10); } // обратно: из плотности автора

let _fSkyT=0, _fSkyRun=false;
function forgeSkyPaint(dt){ // живое мини-небо конструктора: выбранные небо/туман/состав/жар летают в превью
  const cv=$('forgePreview'); if(!cv||!cv.getContext) return;
  const x=cv.getContext('2d'); if(!x) return;
  const W=cv.width, H=cv.height, cfg=forgeCfg;
  const g=x.createLinearGradient(0,0,0,H); // та же формула оттенка, что в свотчах выбора неба
  g.addColorStop(0,'hsl('+(232+cfg.sky*.3)+',60%,22%)'); g.addColorStop(1,'hsl('+(200+cfg.sky*.3)+',65%,10%)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  _fSkyT+=dt;
  let seed=12345; const rnd=function(){ seed=(seed*1103515245+12345)>>>0; return seed/4294967296; };
  for(let i=0;i<70;i++){ // звёздный фон: статичный сид + мягкое дыхание
    const sx=rnd()*W, sy=(rnd()*H+_fSkyT*(8+cfg.s*.25)*(0.3+rnd()))%H;
    x.globalAlpha=.25+rnd()*.55; x.fillStyle=rnd()>.85?'#ffe9b8':'#dfe8ff';
    x.beginPath(); x.arc(sx,sy,rnd()*1.4+.4,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  const kinds=FORGE_KINDS.filter(function(k,i){ return cfg.e>>i&1; });
  if(!kinds.length) kinds.push('rock'); // пустой состав — не повод для мёртвого неба
  for(let i=0;i<9;i++){ // дальняя стая: мелкие тусклые тени — глубина и параллакс (v1.86.0)
    const fx=(i*311+41)%W, fy=(_fSkyT*(5+cfg.s*.12)+i*83)%(H+40)-20;
    x.globalAlpha=.3; x.fillStyle='rgba(120,150,220,.5)';
    x.beginPath(); x.arc(fx,fy,3+(i%3)*2,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  const base=4, n=base+Math.round(cfg.d/11); // базовая стая: небо дышит всегда, жар добавляет к ней, а не включает с нуля (v1.86.0)
  for(let i=0;i<n;i++){
    const k=kinds[i%kinds.length], near=i<base; // первые четыре — ближние и крупные
    const ox=(i*197+53)%W, oy=(_fSkyT*(near?20+cfg.s*.45:13+cfg.s*.35)+i*61)%(H+90)-45;
    const r=near?15+(i%3)*6:7+(i%3)*4;
    x.fillStyle=near?'rgba(5,9,20,.78)':'rgba(8,12,26,.6)'; x.strokeStyle='rgba(150,180,240,.42)'; x.lineWidth=1.5;
    if(k==='gate'){ x.beginPath(); x.arc(ox,oy,r+5,0,6.283); x.stroke(); }
    else if(k==='comet'){ x.beginPath(); x.moveTo(ox+r,oy+r*.4); x.lineTo(ox-r,oy-r*.7); x.lineTo(ox+r*.1,oy+r*.5); x.closePath(); x.fill(); }
    else { x.beginPath(); x.arc(ox,oy,r,0,6.283); x.fill(); x.stroke(); }
  }
  if(cfg.b>0){ x.fillStyle='#ffd76a'; for(let i=0;i<cfg.b+1;i++){ const sx=(i*263+97)%W, sy=(_fSkyT*10+i*47)%H;
    x.globalAlpha=.8; x.beginPath(); x.arc(sx,sy,2.2,0,6.283); x.fill(); } x.globalAlpha=1; }
  if(cfg.fog>0){ x.fillStyle='rgba(190,205,235,'+(cfg.fog===2?'.16':'.08')+')';
    for(let i=0;i<3;i++){ const fy=(_fSkyT*6+i*77)%H; x.fillRect(0,fy,W,26+cfg.fog*10); } }
  if(cfg.fl){ const v=x.createRadialGradient(W/2,H/2,30,W/2,H/2,W*.55); // фонарик: свет вокруг, края тонут
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(2,4,12,.82)');
    x.fillStyle=v; x.fillRect(0,0,W,H); }
}
function forgeSkyLoop(ts){ // мягкий цикл: рисует только пока конструктор на экране
  if(!_fSkyRun) return;
  const sc=$('forgeScreen');
  if(sc&&!sc.classList.contains('hidden')){ const dt=Math.min(.05,(ts-(_fSkyRun===true?ts:_fSkyRun))/1000)||0.016; _fSkyRun=ts; forgeSkyPaint(dt); }
  requestAnimationFrame(forgeSkyLoop);
}
function forgeSkyKick(){ if(_fSkyRun) { forgeSkyPaint(0.016); return; } _fSkyRun=true;
  forgeSkyPaint(0.016); if(typeof requestAnimationFrame==='function') requestAnimationFrame(forgeSkyLoop); }

/* ---------- Состояние конструктора ---------- */
let forgeCfg=forgeSanitize(Store.get('forgeLast',null)||Object.assign({},FORGE_PRESETS[0].c)); // последняя трасса переживает перезапуск; свежая кухня — «Разминка» уже выбрана, ноль обязательных решений (v1.86.0)
function forgeCfgGet(){ return forgeCfg; }
function forgePresetMatch(){ // светится ровно та программа, что сейчас в небе (v1.86.0)
  for(let i=0;i<FORGE_PRESETS.length;i++){ const c=FORGE_PRESETS[i].c;
    if(forgeCfg.d===c.d&&forgeCfg.s===c.s&&forgeCfg.e===c.e&&forgeCfg.l===c.l&&forgeCfg.lv===c.lv&&
       forgeCfg.w===c.w&&forgeCfg.fl===c.fl&&forgeCfg.b===c.b&&forgeCfg.sky===c.sky&&forgeCfg.fog===c.fog) return i; }
  return -1;
}

/* ---------- Виджеты: сегменты, чипы, свотчи ---------- */
function forgeSegBuild(el,items,get,set){ // items: [{v,t}] — значение и текст
  if(!el) return;
  if(el.children.length!==items.length){
    el.innerHTML='';
    items.forEach(function(it){
      const b=document.createElement('button');
      b.className='forgeSegBtn';
      b.addEventListener('click',function(){ set(it.v); forgeSyncWidgets(); sfx.click(); haptic('light'); });
      el.appendChild(b);
    });
  }
  el._items=items; // подписи живут здесь: язык сменился — текст перечитается в _sync
  el._sync=function(){ for(let i=0;i<el.children.length;i++){
    el.children[i].textContent=el._items[i].t;
    el.children[i].classList.toggle('sel',el._items[i].v===get());
  } };
}
function forgeChipBuild(el,text,get,set){
  if(!el) return;
  if(!el.children.length){
    const b=document.createElement('button');
    b.className='forgeChip';
    b.addEventListener('click',function(){ set(!get()?1:0); forgeSyncWidgets(); sfx.click(); haptic('light'); });
    el.appendChild(b);
  }
  el._text=text;
  el._sync=function(){ el.children[0].textContent=el._text; el.children[0].classList.toggle('sel',!!get()); };
}
function forgeSkyBuild(el){
  if(!el||el.children.length===FORGE_SKYS.length) return;
  el.innerHTML='';
  FORGE_SKYS.forEach(function(h){
    const b=document.createElement('button');
    b.className='forgeSkyBtn'; b.title='';
    b.style.background='linear-gradient(180deg, hsl('+(232+h*.3)+',60%,22%), hsl('+(200+h*.3)+',65%,10%))';
    b.addEventListener('click',function(){ forgeCfg.sky=h; forgeSyncWidgets(); sfx.click(); haptic('light'); });
    el.appendChild(b);
  });
  el._sync=function(){ for(let i=0;i<el.children.length;i++) el.children[i].classList.toggle('sel',FORGE_SKYS[i]===forgeCfg.sky); };
}

/* ---------- Экран: наполнение и события ---------- */
function forgeFill(){ // подписи + состояние виджетов по текущему языку (вызывается из applyLang)
  if(typeof L==='undefined'||!L.forgeTitle) return;
  $('forgeTitle').textContent=L.forgeTitle;
  $('modeForge').innerHTML='<span class="modeName">'+L.modeForge+'</span><span class="modeDesc">'+L.modeForgeD+'</span>';
  $('forgeName').placeholder=L.forgeNamePh;
  $('forgeDenLbl').textContent=L.forgeDen; $('forgeSpdLbl').textContent=L.forgeSpd;
  $('forgeHeatLbl').textContent=L.forgeHeat; // v1.85.0
  $('forgeGrpHard').textContent=L.forgeGrpHard; $('forgeGrpEn').textContent=L.forgeGrpEn; $('forgeGrpMood').textContent=L.forgeGrpMood;
  $('forgeEnLbl').textContent=L.forgeEn; $('forgeLenLbl').textContent=L.forgeLen;
  $('forgeLivesLbl').textContent=L.forgeLives; $('forgeWaveLbl').textContent=L.forgeWave;
  $('forgeBonusLbl').textContent=L.forgeBonus; $('forgeSkyLbl').textContent=L.forgeSky; $('forgeFogLbl').textContent=L.forgeFog;
  $('forgeCodeLbl').textContent=L.forgeCodeLbl;
  $('forgePlay').textContent=L.start; $('forgeBack').textContent=L.back; // v1.87.0: «Поделиться» переехала в итоги трассы
  // пресеты — программы мультиварки: тихие плитки со свотчем неба, выбранная мягко светится (v1.86.0)
  const pre=$('forgePresets');
  if(pre && pre.children.length!==FORGE_PRESETS.length){
    pre.innerHTML='';
    FORGE_PRESETS.forEach(function(p){
      const b=document.createElement('button');
      b.className='forgePresetTile';
      b.innerHTML='<i class="sw"></i><span class="nm"></span>';
      b.querySelector('.sw').style.background='linear-gradient(180deg, hsl('+(232+p.c.sky*.3)+',60%,30%), hsl('+(200+p.c.sky*.3)+',65%,14%))';
      b.querySelector('.nm').textContent=L[p.k]||p.k;
      if(p.c.fog>0) b.classList.add('misty'); // туманная программа — дымка на свотче
      b.addEventListener('click',function(){
        const keepName=forgeCfg.n;
        forgeCfg=forgeSanitize(Object.assign({},p.c)); forgeCfg.n=keepName; // имя автора не затираем
        forgeSyncWidgets(); sfx.click(); haptic('medium');
      });
      pre.appendChild(b);
    });
  }
  if(pre) for(let i=0;i<FORGE_PRESETS.length;i++){ const nm=pre.children[i].querySelector('.nm'); if(nm) nm.textContent=L[FORGE_PRESETS[i].k]||''; }
  // враги
  const names=[L.fkRock,L.fkDebris,L.fkDrift,L.fkMine,L.fkSat,L.fkComet,L.fkSeeker,L.fkGate];
  const chips=$('forgeChips');
  if(chips && chips.children.length!==8){
    chips.innerHTML='';
    FORGE_KINDS.forEach(function(k,i){
      const b=document.createElement('button');
      b.className='forgeChip'; b.dataset.bit=i; b.textContent=names[i];
      b.addEventListener('click',function(){
        forgeCfg.e^=(1<<i); if(!forgeCfg.e) forgeCfg.e=(1<<i); // последний вид не гасим — небо не бывает пустым насовсем
        b.classList.toggle('sel',!!(forgeCfg.e>>i&1)); sfx.click(); haptic('light');
      });
      chips.appendChild(b);
    });
  }
  if(chips) for(let i=0;i<8;i++) chips.children[i].textContent=names[i];
  // сегменты
  forgeSegBuild($('forgeSeg'),FORGE_LENS.map(function(m){ return {v:m,t:m>0?m+' м':L.forgeInf}; }),
    function(){return forgeCfg.l;},function(v){forgeCfg.l=v;});
  forgeSegBuild($('forgeLivesSeg'),[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'}],
    function(){return forgeCfg.lv;},function(v){forgeCfg.lv=v;});
  forgeSegBuild($('forgeWaveSeg'),[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'},{v:4,t:'4'},{v:5,t:'5'},{v:6,t:'6'}],
    function(){return forgeCfg.w;},function(v){forgeCfg.w=v;});
  forgeSegBuild($('forgeBonusSeg'),[{v:0,t:L.bOff},{v:1,t:L.bRare},{v:2,t:L.bNorm},{v:3,t:L.bOften}],
    function(){return forgeCfg.b;},function(v){forgeCfg.b=v;});
  forgeSegBuild($('forgeFogSeg'),[{v:0,t:L.fog0},{v:1,t:L.fog1},{v:2,t:L.fog2}],
    function(){return forgeCfg.fog;},function(v){forgeCfg.fog=v;});
  forgeChipBuild($('forgeFlatChip'),L.forgeFlat,function(){return forgeCfg.fl;},function(v){forgeCfg.fl=v;});
  forgeSkyBuild($('forgeSkyRow'));
  // v1.85.0: ручка «Жар» и спойлер тонкой настройки — живут на сцене, не в сегментах
  const heat=$('forgeHeat');
  if(heat&&!heat._bound){ heat._bound=1; heat.addEventListener('input',function(){
    forgeHeatSet(+heat.value); forgeSyncWidgets(); }); }
  const fb=$('forgeFineBtn');
  if(fb){ fb.textContent=L.forgeFine;
    if(!fb._bound){ fb._bound=1; fb.addEventListener('click',function(){
      const hid=$('forgeFine').classList.toggle('hidden');
      fb.classList.toggle('open',!hid); sfx.click(); haptic('light'); }); } }
  forgeSyncWidgets();
}
function forgeSyncWidgets(){ // конфиг → виджеты
  $('forgeName').value=forgeCfg.n;
  $('forgeDen').value=forgeCfg.d; $('forgeDenV').textContent=forgeCfg.d;
  $('forgeSpd').value=forgeCfg.s; $('forgeSpdV').textContent=forgeCfg.s;
  const heat=$('forgeHeat'); if(heat){ heat.value=forgeHeatGet(); $('forgeHeatV').textContent=forgeHeatGet(); } // «Жар» следует за плотностью автора
  const chips=$('forgeChips'); if(chips) for(let i=0;i<chips.children.length;i++)
    chips.children[i].classList.toggle('sel',!!(forgeCfg.e>>i&1));
  ['forgeSeg','forgeLivesSeg','forgeWaveSeg','forgeBonusSeg','forgeFogSeg','forgeFlatChip','forgeSkyRow'].forEach(function(id){
    const el=$(id); if(el&&el._sync) el._sync();
  });
  const pre=$('forgePresets'); // выбранная программа мягко светится — видно, что сейчас в небе (v1.86.0)
  if(pre&&pre.children.length===FORGE_PRESETS.length){ const m=forgePresetMatch();
    for(let i=0;i<FORGE_PRESETS.length;i++) pre.children[i].classList.toggle('sel',i===m); }
  forgeSkyKick(); // небо перерисовывается на каждый поворот ручки
}
function forgeOpen(){ forgeCfg=forgeSanitize(Store.get('forgeLast',null)||forgeCfg); forgeFill(); forgeSkyKick(); } // v1.85.0: небо оживает при входе в конструктор

/* ---------- Чтение формы / действия ---------- */
function forgeReadForm(){
  forgeCfg.n=String($('forgeName').value||'').trim().slice(0,20);
  forgeCfg.d=+$('forgeDen').value; forgeCfg.s=+$('forgeSpd').value;
  forgeCfg=forgeSanitize(forgeCfg);
  return forgeCfg;
}
function forgePlay(){
  const cfg=forgeReadForm(); Store.set('forgeLast',cfg);
  setRunMode('custom'); sfx.click(); haptic('light'); startGame();
}
function forgeCopy(text,done){
  try{ navigator.clipboard.writeText(text).then(function(){done&&done();},function(){done&&done();}); }
  catch(e){ done&&done(); }
}
function mapShare(){ // v1.87.0: «Поделиться» живёт в итогах трассы — там, где случился восторг, а не на панели кузницы
  const cfg=forgeSanitize(forgeCfg);
  const code=forgeEncode(cfg);
  const link='https://t.me/realcosmogrambot/app?startapp=map_'+code; // тот же мост, что и у дуэлей (v1.68.0)
  const txt=(L.forgeShareTxt||'').replace('%s', cfg.n||L.forgeDefName);
  forgeCopy(code, function(){ toast(L.forgeCopied,'rgba(255,215,106,.5)'); });
  const shareUrl='https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(txt);
  try{ if(tg&&tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl,'_blank'); }
  catch(e){ try{ window.open(shareUrl,'_blank'); }catch(e2){} }
  haptic('success');
}
function forgeLoadCode(){
  const cfg=forgeDecode($('forgeCode').value);
  if(!cfg){ toast(L.forgeBadCode,'rgba(255,159,176,.5)'); haptic('light'); return; }
  forgeCfg=cfg; forgeSyncWidgets(); $('forgeCode').value='';
  toast(L.forgeGuest,'rgba(255,215,106,.5)'); haptic('success');
}

/* ---------- Deep-link: ?startapp=map_CG1.xxx (и #map= для браузера) ---------- */
function forgeBoot(){ // true = есть трасса друга: этот запуск открывается в конструкторе, а не в полёте
  try{
    let raw='';
    const sp=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.start_param;
    if(sp&&String(sp).indexOf('map_')===0) raw=String(sp);
    else if(location.hash&&location.hash.indexOf('#map=')===0) raw='map_'+location.hash.slice(5);
    if(!raw) return false;
    const cfg=forgeDecode(raw);
    if(!cfg) return false;
    forgeCfg=cfg; Store.set('forgeLast',cfg); // «трасса друга» становится последней — «Ещё раз» играет её же
    return true;
  }catch(e){ return false; }
}

/* ---------- Финиш трассы: цифры забега, но ничего не пишется (не в зачёт) ---------- */
function mapOver(sc){
  const distM=Math.floor(S.dist);
  $('myRank').textContent=''; $('newRecord').innerHTML=''; $('toRecord').textContent=''; $('toLoc').textContent=''; $('duelRes').innerHTML='';
  $('finalScore').textContent=sc;
  const statCell=function(v,l){ return '<div class="statCell"><b>'+v+'</b><span>'+l+'</span></div>'; };
  const winPill=S.mapWin?'<span class="miniPill">'+ic('trophy')+L.forgeWin+'</span>':'';
  $('stats').innerHTML='<div class="statGrid rise" style="animation-delay:120ms">'+
    statCell(S.mission,L.missionLbl)+statCell(distM+' м',L.dist)+
    statCell(S.starsCollected,L.stars)+statCell('×'+S.comboMax,L.maxCombo)+'</div>'+
    '<div class="bestPills rise" style="animation-delay:200ms"><span class="miniPill runMode">'+ic('plane')+(S.customName||L.forgeDefName)+'</span>'+winPill+'</div>';
  runPassFill();
  if (typeof cardCapture==='function') cardCapture(sc,{win:!!S.mapWin}); // v1.73.0: карточка и для своей трассы — с именем автора
  tryOnRevert(); music.sting(S.mapWin?'record':'death'); music.stop(2); engine.stop();
  $('stats').classList.add('hidden'); $('runPass').classList.add('hidden'); $('overDetailsBtn').classList.remove('open');
  setScreen('over');
  const f=$('flash'); f.style.transition='none'; f.style.opacity=.7;
  requestAnimationFrame(function(){ f.style.transition='opacity .5s'; f.style.opacity=0; });
}

/* ---------- Привязка событий ---------- */
$('forgePlay').addEventListener('click', forgePlay);
$('forgeLoad').addEventListener('click', forgeLoadCode);
$('forgeBack').addEventListener('click', function(){ sfx.click(); setScreen('modes'); });
$('forgeDen').addEventListener('input', function(){ $('forgeDenV').textContent=this.value; });
$('forgeSpd').addEventListener('input', function(){ $('forgeSpdV').textContent=this.value; });
$('forgeCode').addEventListener('keydown', function(e){ if(e.key==='Enter') forgeLoadCode(); });
