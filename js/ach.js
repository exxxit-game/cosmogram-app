'use strict';
/* ============================================================
   ACHIEVEMENTS + ПРОФИЛЬ (модуль): ОДНО достижение (v1.29.0) —
   «Линия Кармана»: самолётик долетел до космоса. Реестр из 60
   ярусов вычеркнут как лишний. Карман наград (achQ), экран,
   профиль и онбординг остались — механика ждёт новых целей.
   v1.13.0: эмодзи-иконки убраны из интерфейса (поля ic: оставлены в данных
   как карта смыслов — линейные иконки нарисуем под финальный состав).
   Зависит от core.js (Store, L, toast, haptic, sfx, saneNumber),
   game.js (Stats, S), ui.js (setScreen) — грузится после game.js,
   используется из ui.js.
   ============================================================ */

const fmtN=n=>String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const aT=a=>(L===I18N.en?a.en:a.ru); // имя/описание на активном языке

/* Профиль: счётчики живут в game.js (Stats). Старые сохранения мержатся
   на дефолты в boot (ui.js) — новых полей там просто не было. */

/* ---------- Список достижений: cat, need, val(), rw (награда ✦) ---------- */
const ACH=[
  // Единственная цель — суммарная дистанция 100 м: ты в космосе (v1.29.0)
  {id:'c1', cat:'cosmos', ic:'🌍', need:100, rw:25, val:()=>Stats.totalDist, ru:{n:'Линия Кармана',d:'Ты в космосе! Официально.'}, en:{n:'Karman Line',d:'You are in space! Officially.'}},
];
const CATS=['cosmos']; // одна цель — одна категория (v1.29.0)
const CAT_N={ cosmos:{ru:'Космическая шкала',en:'Cosmic ladder'} };

function achUnlockedSet(){ return Store.get('ach',[]); }

/* Карман наград: открытые, но ещё не отпразднованные. Праздник — по одной
   карточке (модуль Н2), здесь — только тихий учёт и бейдж-счётчик. */
function achQueue(){ return Store.get('achQ',[]); }
function achQShow(){
  const el=$('achBadge'); if(!el) return;
  const n=achQueue().length;
  el.textContent=n>9?'9+':String(n);
  el.classList.toggle('hidden', n<=0);
}

/* Проверка и выдача. Вызывать после gameOver, стрика, покупки в ангаре.
   Тихо: свежие открытия складываются в карман — никакого тост-спама,
   каждая награда получит свой отдельный момент. */
function achCheck(){
  const un=achUnlockedSet(); const fresh=[];
  for(const a of ACH){
    if(un.indexOf(a.id)>=0) continue;
    let v=0; try{ v=a.val(); }catch(e){}
    if(v>=a.need){ un.push(a.id); fresh.push(a); }
  }
  if(!fresh.length) return;
  Store.set('ach',un);
  const q=achQueue(); // ✦ не начисляются здесь — только по «Забрать» в карточке награды
  for(const a of fresh) if(q.indexOf(a.id)<0) q.push(a.id);
  Store.set('achQ',q);
  achQShow();
}

/* ---------- Н2: карточка награды — праздник по одной ---------- */
let claimOpen=false, claimTotal=0, claimPos=0, walletCountGen=0;
function achTier(a){ return a.rw>=400?'mGold':(a.rw>=100?'mSilver':'mBronze'); }
function walletCountUp(from,to){ // кошелёк в меню досчитывает награду (0.5с, easeOutCubic)
  const el=$('walletMenu'); if(!el) return;
  const t0=performance.now(), g=++walletCountGen;
  requestAnimationFrame(function tick(now){
    if(g!==walletCountGen) return;
    const k=Math.min(1,(now-t0)/500);
    const v=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));
    el.innerHTML = v>0 ? L.wallet+v : '';
    if(k<1) requestAnimationFrame(tick);
  });
}
function achClaimMaybe(){ // автопоказ при возврате в меню с непустым карманом
  if(claimOpen || screenName!=='menu') return;
  if(!achQueue().length) return;
  claimTotal=achQueue().length; claimPos=0;
  achClaimShow();
}
function achClaimShow(){
  const q=achQueue(); if(!q.length){ achClaimHide(); return; }
  const a=ACH.find(x=>x.id===q[0]);
  if(!a){ Store.set('achQ',q.slice(1)); achQShow(); achClaimShow(); return; } // мусор в кармане — выкинуть
  claimOpen=true;
  const tier=achTier(a), tt=aT(a);
  const md=$('claimMedal');
  md.className='claimMedal '+tier;
  md.innerHTML=ic('trophy'); // линейный трофей вместо эмодзи; класс медали — по награде
  $('claimCls').textContent = tier==='mGold'?L.achClsG:(tier==='mSilver'?L.achClsS:L.achClsB);
  $('claimName').textContent=tt.n;
  $('claimDesc').textContent=tt.d;
  $('claimRw').innerHTML='+'+a.rw+ic('star4','i-s4');
  claimPos++;
  $('claimQ').textContent=claimPos+' / '+claimTotal;
  $('claimBtn').textContent = q.length>1 ? L.achClaim : L.achDone;
  // звёздный веер вокруг медали (DOM-частицы — виден поверх любого экрана)
  const br=$('claimBurst'); br.innerHTML='';
  for(let i=0;i<10;i++){
    const st=document.createElement('i');
    const ang=(i/10)*6.283, dist=70+Math.random()*46;
    st.style.setProperty('--dx',(Math.cos(ang)*dist).toFixed(0)+'px');
    st.style.setProperty('--dy',(Math.sin(ang)*dist).toFixed(0)+'px');
    st.style.animationDelay=(Math.random()*0.12)+'s';
    br.appendChild(st);
  }
  $('claimScreen').classList.remove('hidden');
  haptic('success'); sfx.ach(); // колокольчик; золото — двойной
  if(tier==='mGold') setTimeout(()=>{ if(claimOpen) sfx.ach(); },160);
}
function achClaimTake(){
  const q=achQueue(); const a=ACH.find(x=>x.id===q[0]);
  if(!a){ achClaimHide(); return; }
  const from=S.wallet;
  S.wallet+=a.rw; Store.set('wallet',S.wallet);
  Store.set('achQ',q.slice(1)); achQShow();
  haptic('light');
  walletCountUp(from,S.wallet);
  if(achQueue().length) achClaimShow(); else achClaimHide();
}
function achClaimHide(){ claimOpen=false; $('claimScreen').classList.add('hidden'); }
if(typeof $==='function' && $('claimBtn')) $('claimBtn').addEventListener('click', achClaimTake);

/* Забрать конкретную награду прямо из списка достижений (быстрый путь) */
function achClaimId(id){
  const q=achQueue(); const i=q.indexOf(id); if(i<0) return;
  const a=ACH.find(x=>x.id===id); if(!a) return;
  const from=S.wallet;
  S.wallet+=a.rw; Store.set('wallet',S.wallet);
  q.splice(i,1); Store.set('achQ',q); achQShow();
  haptic('light'); sfx.ach();
  walletCountUp(from,S.wallet);
  renderAch(); // строка стала обычной открытой
}
if(typeof $==='function' && $('achList')) $('achList').addEventListener('click', e=>{
  const b=e.target.closest?e.target.closest('[data-claim]'):null;
  if(b) achClaimId(b.getAttribute('data-claim'));
});

/* Ближайшая непройденная точка космической шкалы — строка мотивации на итогах */
function achNextLoc(){
  const d=Stats.totalDist||0;
  for(const a of ACH) if(a.cat==='cosmos' && d<a.need) return a;
  return null;
}

/* ---------- Экран «🏆 Достижения»: статистика + список ---------- */
function favMode(){
  const g=Stats.gGames||0, t=Stats.tGames||0, b=Stats.bGames||0;
  if(g===0&&t===0&&b===0) return '—';
  return (b>=g&&b>=t)?L.bullet:(g>=t?L.modeGyro:L.modeTouch);
}
function renderAch(){
  const un=achUnlockedSet(), q=achQueue();
  // статистика — ряд метрик с крупными числами; режимы — плашки с иконками
  const statCell=(v,l)=>'<div class="statCell"><b>'+v+'</b><span>'+l+'</span></div>';
  const gN=Stats.gGames||0, tN=Stats.tGames||0, bN=Stats.bGames||0;
  const favIc=(bN>=gN&&bN>=tN)?'timer':(gN>=tN?'phone':'hand');
  $('achStats').innerHTML =
    '<div class="statGrid stats4">'+
      statCell(fmtN(Stats.games||0),L.statFlights)+
      statCell(fmtN(Stats.totalDist||0),L.statDist)+
      statCell(fmtN(Stats.totalStars||0),L.statStars)+
      statCell('×'+(Stats.bestCombo||0),L.statCombo)+
    '</div>'+
    '<div class="bestPills">'+
      (gN+tN+bN>0?'<span class="miniPill runMode">'+ic(favIc)+favMode()+'</span>':'')+
      '<span class="miniPill">'+ic('phone')+'<b>'+fmtN(gN)+'</b></span>'+
      '<span class="miniPill">'+ic('hand')+'<b>'+fmtN(tN)+'</b></span>'+
      '<span class="miniPill">'+ic('timer')+'<b>'+fmtN(bN)+'</b></span>'+
    '</div>';
  $('achProg').innerHTML = ic('trophy')+L.achOf+' '+un.length+' / '+ACH.length;
  $('achProgFill').style.width = (un.length/ACH.length*100)+'%';
  let h='', hI=0; // hI — счётчик каскадной задержки строк (+60ms, потолок 600ms)
  for(const cid of CATS){
    const items=ACH.filter(a=>a.cat===cid); if(!items.length) continue;
    h+='<div class="achCat">'+(L===I18N.en?CAT_N[cid].en:CAT_N[cid].ru)+'</div>';
    for(const a of items){
      const got=un.indexOf(a.id)>=0, tt=aT(a);
      const name=tt.n, desc=tt.d; // секретов в реестре нет (v1.32.0) — имя и описание всегда настоящие
      const pend=q.indexOf(a.id)>=0; // открыто, но ждёт «Забрать»
      let side='', barHtml='';
      if(!got&&!a.secret){ let v=0; try{ v=a.val(); }catch(e){}
        side='<span class="achPr">'+fmtN(Math.min(v,a.need))+'/'+fmtN(a.need)+'</span>';
        barHtml='<span class="achBar"><i style="width:'+Math.min(100,Math.round(v/a.need*100))+'%"></i></span>'; }
      h+='<div class="achIt'+(got?' got':'')+(pend?' pend':'')+'" style="animation-delay:'+(Math.min(hI++,10)*60)+'ms">'+
        '<span class="achTx"><b>'+name+'</b><i>'+desc+'</i>'+barHtml+'</span>'+
        (got?(pend?'<span class="achRw pendBtn" data-claim="'+a.id+'">'+L.achClaim+' +'+a.rw+ic('star4','i-s4')+'</span>':'<span class="achRw">+'+a.rw+ic('star4','i-s4')+'</span>'):side)+'</div>';
    }
  }
  $('achList').innerHTML=h;
}
