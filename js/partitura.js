'use strict';
/* ============================================================
   ПАРТИТУРА (часть «Конструктора», 01.09.2026) — точная расстановка
   событий по дистанции: точки на ленте, стикеры пауза/заметка/8 видов
   препятствий, перетаскивание, список с секундами до каждой точки.
   Источник — macet-31-08-kuznica-partitura.html («Кузница целиком»,
   владелец подтвердил как цель). Первый заход — только UI и запись
   в forgeCfg.sc (схема уже есть в forge.js, никакой новой правки
   формата). Игровой эффект (game.js честно выполняет pause/kind) —
   отдельный следующий шаг, здесь не трогаем.
   Зависит от core.js ($, sfx, haptic), forge.js (forgeCfg, FORGE_KINDS,
   forgeSyncWidgets — куда добавлен один вызов ptRender()).
   ============================================================ */

const PT_KIND_LABEL={rock:'Астероид',debris:'Обломок',drift:'Дрейфер',mine:'Мина',sat:'Спутник',comet:'Комета',seeker:'Ловец',gate:'Ворота'}; // сверено с js/i18n.js: fkRock..fkGate
const PT_KIND_COLOR={rock:'#d99a4e',debris:'#6fa3e0',drift:'#b073ea',mine:'#ff5f6d',sat:'#4f7fe6',comet:'#ff9a52',seeker:'#ffa53a',gate:'#22b8dd'};
const PT_ICON_SVG={
  pause:'<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6.5" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="13.5" y="4" width="4" height="16" rx="1.5" fill="currentColor"/></svg>',
  marker:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 21l1.2-5.6L15.6 3.9a1.6 1.6 0 0 1 2.3 0l2.2 2.2a1.6 1.6 0 0 1 0 2.3L8.6 19.8 3 21z" fill="currentColor"/></svg>',
  rock:'<svg viewBox="0 0 24 24" width="22" height="22"><polygon points="12,2.5 18,6.5 20.5,13 16,20 8,19.5 3.5,13.5 5.5,6" fill="currentColor"/></svg>',
  debris:'<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="8" width="18" height="8" rx="2" fill="currentColor"/><rect x="3" y="11.2" width="18" height="1.6" fill="rgba(0,0,0,.3)"/></svg>',
  drift:'<svg viewBox="0 0 24 24" width="22" height="22"><polygon points="2,12 7,5.5 17,5 22,12 16,19 6,18.5" fill="currentColor"/></svg>',
  mine:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="6" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="12" x2="22" y2="12"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="7.8" y1="16.2" x2="4.9" y2="19.1"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="7.8" y1="7.8" x2="4.9" y2="4.9"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/></g></svg>',
  sat:'<svg viewBox="0 0 24 24" width="22" height="22"><rect x="10" y="9.5" width="4" height="5" rx="1" fill="currentColor"/><rect x="1.5" y="8.5" width="6" height="7" rx="1.3" fill="currentColor" opacity=".85"/><rect x="16.5" y="8.5" width="6" height="7" rx="1.3" fill="currentColor" opacity=".85"/><line x1="7.5" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.6"/><line x1="14" y1="12" x2="16.5" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>',
  comet:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="16" cy="8" r="3.4" fill="currentColor"/><path d="M14 10.2C10 12 5.5 15 2 21c5.5-2.6 9.5-5.3 12.6-9.4z" fill="currentColor" opacity=".55"/></svg>',
  seeker:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.1"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="2.1"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
  gate:'<svg viewBox="0 0 24 24" width="22" height="22"><line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="5" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="19" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
};
const PT_MAX=50;
let ptSelIdx=-1;

function ptPins(){ if(!forgeCfg.sc) forgeCfg.sc=[]; return forgeCfg.sc; }
function ptLen(){ return forgeCfg.l>0?forgeCfg.l:5000; } // «бесконечная» (l=0) — лента размечена под условную длину, точки всё равно ставятся в метрах

function ptRenderRuler(){
  const ruler=$('ptRuler'); if(!ruler) return; ruler.innerHTML='';
  const len=ptLen(), steps=4;
  for(let i=0;i<=steps;i++){
    const s=document.createElement('span');
    s.textContent=Math.round(len*i/steps)+(L.unitM||'м');
    ruler.appendChild(s);
  }
}
function ptXToAt(track,clientX){
  const r=track.getBoundingClientRect();
  const p=Math.max(0,Math.min(1,(clientX-r.left)/r.width));
  return Math.round(p*ptLen()/5)*5;
}
function ptAtToPct(at){ return (at/ptLen()*100).toFixed(2)+'%'; }
function ptClampAt(v){ return Math.max(0,Math.min(ptLen(),v)); }
function ptOverRect(x,y,el){ const r=el.getBoundingClientRect(); return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom; }
function ptPinSizeFor(n){ if(n<=10) return 48; if(n<=20) return 40; if(n<=35) return 32; return 26; }
function ptSpreadOffsets(pins){
  const sorted=pins.map((p,i)=>({i,at:p.at})).sort((a,b)=>a.at-b.at);
  const offs=new Array(pins.length).fill(0);
  const THRESH=ptLen()*0.035, ROWS=3, ROW_H=28;
  let streak=0;
  for(let k=1;k<sorted.length;k++){
    if(sorted[k].at-sorted[k-1].at<THRESH){ streak++; offs[sorted[k].i]=(streak%ROWS)*ROW_H; } else streak=0;
  }
  return offs;
}
function ptPinName(p){ return p.type==='pause'?'передышку':p.type==='marker'?'заметку':(PT_KIND_LABEL[FORGE_KINDS[p.kind]]||'').toLowerCase(); }

let ptToastTimer=null;
function ptShowToast(text,undoFn){
  let t=document.querySelector('.ptToast');
  if(!t){ t=document.createElement('div'); t.className='ptToast';
    t.innerHTML='<span class="ptToastTxt"></span><span class="undo">вернуть</span>';
    document.body.appendChild(t); }
  t.querySelector('.ptToastTxt').textContent=text;
  t.classList.add('show');
  clearTimeout(ptToastTimer);
  ptToastTimer=setTimeout(()=>t.classList.remove('show'),3000);
  t.querySelector('.undo').onclick=()=>{ undoFn(); t.classList.remove('show'); clearTimeout(ptToastTimer); };
}

function ptRender(justPoppedIdx){
  const track=$('ptTrack'); if(!track) return;
  const pins=ptPins();
  track.querySelectorAll('.pin,.pin-lbl').forEach(e=>e.remove());
  track.classList.toggle('has-pins',pins.length>0);
  const pinSz=ptPinSizeFor(pins.length);
  track.style.setProperty('--pinSz',pinSz+'px');
  const pinTop=60-pinSz/2;
  const offs=ptSpreadOffsets(pins);
  pins.forEach((p,i)=>{
    const kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
    const lbl=document.createElement('div');
    lbl.className='pin-lbl'+(i===ptSelIdx?' sel':''); lbl.style.left=ptAtToPct(p.at);
    lbl.style.top=(15+offs[i])+'px';
    lbl.textContent=p.at+(L.unitM||'м')+(kindName?' · '+PT_KIND_LABEL[kindName]:'');
    track.appendChild(lbl);
    const el=document.createElement('div');
    el.className='pin '+p.type+(i===ptSelIdx?' sel':'')+(i===justPoppedIdx?' pop':'');
    el.style.left=ptAtToPct(p.at);
    el.style.top=(pinTop+offs[i])+'px';
    const sw=document.createElement('div'); sw.className='sw';
    if(p.type==='kind'){ const c=PT_KIND_COLOR[kindName]||'#8fa3c8'; sw.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; sw.style.boxShadow='0 0 10px '+c+'66, inset 0 0 0 1px rgba(255,255,255,.14)'; }
    sw.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
    el.appendChild(sw);
    el.addEventListener('pointerdown',ev=>ptStartPinDrag(ev,i));
    track.appendChild(el);
  });
  const cnt=$('ptCnt'); if(cnt) cnt.textContent=pins.length;
  const tray=$('ptTray');
  if(tray){ tray.classList.toggle('nearMax',pins.length>=45&&pins.length<PT_MAX); tray.classList.toggle('atMax',pins.length>=PT_MAX); }
  ptRenderPanel();
  ptRenderList();
}

function ptRenderPanel(){
  const qe=$('ptQuickEdit'); if(!qe) return;
  const pins=ptPins();
  if(ptSelIdx<0||!pins[ptSelIdx]){ qe.classList.remove('show'); return; }
  const p=pins[ptSelIdx];
  qe.classList.add('show');
  const kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
  const title=$('ptPanelTitle'); if(title) title.textContent=p.type==='pause'?'Передышка':p.type==='marker'?'Заметка':(PT_KIND_LABEL[kindName]||'');
  const icon=$('ptPanelIcon'); if(icon) icon.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
  const av=$('ptAtVal'); if(av) av.value=p.at;
  const kl=$('ptKindLbl'); if(kl){ kl.style.display=p.type==='kind'?'block':'none'; if(p.type==='kind') kl.textContent='Здесь всегда будет '+(PT_KIND_LABEL[kindName]||'').toLowerCase()+' — не случайный вид.'; }
  const mb=$('ptMarkerBox'); if(mb) mb.style.display=p.type==='marker'?'block':'none';
  const ph=$('ptPauseHint'); if(ph) ph.style.display=p.type==='pause'?'block':'none';
  if(p.type==='marker'){ const ta=$('ptNoteText'); if(ta){ ta.value=p.note||''; ta.oninput=()=>{ p.note=ta.value; ptRenderList(); }; } }
}

function ptFmtTime(s){ const m=Math.floor(s/60), sec=Math.round(s%60); return m+':'+String(sec).padStart(2,'0'); }
function ptSimulateFlightCurve(len){
  const pts=[{t:0,d:0}]; let dist=0,t=0; const dt=1/30;
  while(dist<len&&t<600){
    const opening=.62*(1-Math.exp(-dist/100))*Math.exp(-dist/900);
    const dd=Math.min(1,dist/6000+opening);
    const speed=3.4+dd*4.6;
    dist=Math.min(len,dist+speed*dt*8); t+=dt;
    pts.push({t,d:dist});
  }
  return {pts,total:t||1};
}
function ptTimeAtDistance(curve,dist){
  const pts=curve.pts; if(dist<=0) return 0;
  let lo=0,hi=pts.length-1;
  while(lo<hi-1){ const mid=(lo+hi)>>1; if(pts[mid].d<dist) lo=mid; else hi=mid; }
  const a=pts[lo],b=pts[hi],k=(dist-a.d)/((b.d-a.d)||1);
  return a.t+(b.t-a.t)*k;
}
function ptRenderList(){
  const listPanel=$('ptListPanel'), listSub=$('ptListSub'); if(!listPanel||!listSub) return;
  const pins=ptPins();
  const curve=ptSimulateFlightCurve(ptLen());
  listSub.textContent=pins.length?pins.length+' шт. · весь полёт ~'+ptFmtTime(curve.total):'пусто';
  listPanel.innerHTML='';
  if(!pins.length){ listPanel.innerHTML='<div class="evtEmpty">пока ничего не добавлено</div>'; return; }
  const order=pins.map((p,i)=>i).sort((a,b)=>pins[a].at-pins[b].at);
  order.forEach(i=>{
    const p=pins[i], kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
    const row=document.createElement('div'); row.className='evtRow';
    const ic=document.createElement('div'); ic.className='ic';
    if(p.type==='kind'){ const c=PT_KIND_COLOR[kindName]||'#8fa3c8'; ic.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; }
    else ic.style.background=p.type==='pause'?'linear-gradient(180deg,rgba(160,210,255,.9),rgba(160,210,255,.65))':'linear-gradient(180deg,rgba(240,192,64,.9),rgba(240,192,64,.65))';
    ic.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=p.type==='pause'?'Передышка':p.type==='marker'?'Заметка':(PT_KIND_LABEL[kindName]||'');
    const evtT=ptTimeAtDistance(curve,p.at);
    const mt=document.createElement('div'); mt.className='mt'; mt.style.cssText='font-size:10.5px;color:var(--gold-hi);flex-shrink:0;text-align:right';
    mt.textContent=p.at+(L.unitM||'м')+' · '+ptFmtTime(evtT);
    const rm=document.createElement('div'); rm.className='rm'; rm.textContent='×';
    row.append(ic,nm,mt,rm);
    row.addEventListener('click',ev=>{
      if(ev.target===rm){ ptRemovePin(i); return; }
      ptSelIdx=i; ptRender();
      const qe=$('ptQuickEdit'); if(qe) qe.scrollIntoView({behavior:'smooth',block:'center'});
    });
    listPanel.appendChild(row);
  });
}

function ptRemovePin(i){
  const pins=ptPins(); const p=pins[i]; if(!p) return;
  pins.splice(i,1); ptSelIdx=-1;
  sfx.click(); haptic('light');
  ptShowToast('Убрал '+ptPinName(p),()=>{ pins.push(p); pins.sort((a,b)=>a.at-b.at); ptSelIdx=pins.findIndex(x=>x===p); ptRender(); });
  ptRender();
}
function ptNudge(d){
  if(ptSelIdx<0) return; const pins=ptPins(); const p=pins[ptSelIdx]; if(!p) return;
  p.at=ptClampAt(p.at+d); ptRender();
}

let ptGhostEl=null;
function ptMoveGhost(x,y){ if(ptGhostEl){ ptGhostEl.style.left=x+'px'; ptGhostEl.style.top=y+'px'; } }
function ptStartPinDrag(ev,i){
  ev.stopPropagation(); ptSelIdx=i; ptRender();
  const track=$('ptTrack');
  const onMove=e=>{ const pins=ptPins(); if(!pins[i]) return; pins[i].at=ptXToAt(track,e.clientX); ptRender(); ptSelIdx=i; };
  const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); ptRender(); };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}
function ptWireTray(){
  const tray=$('ptTray'); if(!tray||tray._ptWired) return; tray._ptWired=1;
  const stickerDefs=[{t:'pause',k:0,cap:'Передышка'},{t:'marker',k:0,cap:'Заметка'}]
    .concat(FORGE_KINDS.map((k,i)=>({t:'kind',k:i,cap:PT_KIND_LABEL[k]||k})));
  tray.innerHTML='';
  stickerDefs.forEach(function(d){
    const item=document.createElement('div'); item.className='stickerItem';
    const s=document.createElement('div'); s.className='sticker '+(d.t==='kind'?'':d.t); s.dataset.t=d.t; s.dataset.k=d.k;
    if(d.t==='kind'){ const c=PT_KIND_COLOR[FORGE_KINDS[d.k]]||'#8fa3c8'; s.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; s.style.boxShadow='0 0 14px '+c+'77, inset 0 0 0 1px rgba(255,255,255,.28)'; }
    s.innerHTML=d.t==='kind'?(PT_ICON_SVG[FORGE_KINDS[d.k]]||''):PT_ICON_SVG[d.t];
    const cap=document.createElement('div'); cap.className='stickerCap'; cap.textContent=d.cap;
    item.appendChild(s); item.appendChild(cap);
    tray.appendChild(item);
  });
  tray.addEventListener('pointerdown',ev=>{
    const s=ev.target.closest('.sticker'); if(!s) return;
    const pins=ptPins(); if(pins.length>=PT_MAX) return;
    s.classList.add('dragging');
    if(!ptGhostEl){ ptGhostEl=document.createElement('div'); ptGhostEl.className='ptGhost'; document.body.appendChild(ptGhostEl); }
    ptGhostEl.style.display='flex'; ptGhostEl.style.background=getComputedStyle(s).background;
    ptGhostEl.innerHTML=s.innerHTML; ptGhostEl.style.color=getComputedStyle(s).color;
    ptMoveGhost(ev.clientX,ev.clientY);
    const track=$('ptTrack');
    const onMove=e=>{ ptMoveGhost(e.clientX,e.clientY); if(track) track.classList.toggle('dropok',ptOverRect(e.clientX,e.clientY,track)); };
    const onUp=e=>{
      document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
      s.classList.remove('dragging'); ptGhostEl.style.display='none'; if(track) track.classList.remove('dropok');
      if(track && ptOverRect(e.clientX,e.clientY,track)){
        const at=ptXToAt(track,e.clientX);
        const p={at,type:s.dataset.t,kind:+s.dataset.k};
        const pins=ptPins(); pins.push(p); ptSelIdx=pins.length-1;
        sfx.click(); haptic('medium');
        ptRender(ptSelIdx);
        ptShowToast('Поставил '+ptPinName(p),()=>{ const idx=pins.indexOf(p); if(idx>=0) pins.splice(idx,1); ptSelIdx=-1; ptRender(); });
      }
    };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });
}
function ptWireOnce(){
  if(ptWireOnce._done) return; ptWireOnce._done=1;
  const del=$('ptDelBtn'); if(del) del.addEventListener('click',()=>{ if(ptSelIdx>=0) ptRemovePin(ptSelIdx); });
  const m10=$('ptMinus10'); if(m10) m10.addEventListener('click',()=>ptNudge(-10));
  const m1=$('ptMinus1'); if(m1) m1.addEventListener('click',()=>ptNudge(-1));
  const p1=$('ptPlus1'); if(p1) p1.addEventListener('click',()=>ptNudge(1));
  const p10=$('ptPlus10'); if(p10) p10.addEventListener('click',()=>ptNudge(10));
  const av=$('ptAtVal'); if(av) av.addEventListener('change',ev=>{
    if(ptSelIdx<0) return; const pins=ptPins(); const v=Math.round(+ev.target.value);
    pins[ptSelIdx].at=isFinite(v)?ptClampAt(v):pins[ptSelIdx].at; ptRender();
  });
  const lg=$('ptListGrp'), lp=$('ptListPanel');
  if(lg&&lp) lg.addEventListener('click',()=>{ lg.classList.toggle('open'); lp.classList.toggle('hidden'); });
  // 01.09.2026 «Непрерывная длина»: заменяет старые 5 кнопок «Длина неба» — ползунок +
  // отдельная кнопка ∞ (старые кнопки несли и 4 числа, и «бесконечную» одним списком — тут
  // это две разные по природе вещи: число и особый режим, разведены на два разных виджета).
  // Формат кода уже поддерживает любое значение 1000-10000 шагом 250 (forgeBitsPack/Unpack).
  const ls=$('ptLenSlider');
  if(ls) ls.addEventListener('input',()=>{
    forgeCfg.l=+ls.value; ptSyncLenUI();
    ptRenderRuler(); ptRender();
    if(typeof forgeGrpSubSync==='function') forgeGrpSubSync();
  });
  const ib=$('ptInfBtn');
  if(ib) ib.addEventListener('click',()=>{
    forgeCfg.l = forgeCfg.l===0 ? (+($('ptLenSlider')?.value)||1500) : 0; // повторный тап возвращает последнее число на ползунке, не сброс к 1500 всегда
    ptSyncLenUI(); ptRenderRuler(); ptRender();
    if(typeof forgeGrpSubSync==='function') forgeGrpSubSync();
    sfx.click(); haptic('light');
  });
}
function ptSyncLenUI(){
  const ls=$('ptLenSlider'), lv=$('ptLenVal'), ib=$('ptInfBtn'); if(!ls) return;
  const inf=forgeCfg.l===0;
  ls.disabled=inf;
  if(!inf) ls.value=forgeCfg.l;
  if(lv) lv.textContent=inf?(L.forgeInf||'∞'):(ls.value+(L.unitM||'м'));
  if(ib) ib.classList.toggle('sel',inf);
}
function ptFill(){
  if(typeof L==='undefined'||!L.forgeTitle) return; // тот же ранний выход, что и forgeFill — язык ещё не загружен
  const t=$('ptTitle'); if(t) t.textContent='Расстановка';
  const s=$('ptSub'); if(s) s.textContent='Точки на дистанции — где будет передышка или препятствие';
  ptWireTray();
  ptWireOnce();
  ptSyncLenUI();
  ptRender();
  ptRenderRuler();
}
