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
const aT=a=>(a[typeof langEff!=='undefined'?langEff:'ru'] || a.en || a.ru); // v1.108.1: было бинарно en/ru — теперь честно по активному языку, с запасным путём

/* Профиль: счётчики живут в game.js (Stats). Старые сохранения мержатся
   на дефолты в boot (ui.js) — новых полей там просто не было. */

/* ---------- Список достижений: cat, need, val(), rw (награда ✦) ---------- */
const ACH=[
  // Единственная цель — суммарная дистанция 100 м: ты в космосе (v1.29.0)
  {id:'c1', cat:'cosmos', ic:'🌍', need:100000, rw:25, val:()=>Stats.totalDist,
    ru:{n:'Линия Кармана',d:'Ты в космосе! Официально.'}, en:{n:'Karman Line',d:'You are in space! Officially.'},
    es:{n:'Línea de Kármán',d:'¡Estás en el espacio! Oficialmente.'}, pt:{n:'Linha de Kármán',d:'Você está no espaço! Oficialmente.'},
    fr:{n:'Ligne de Kármán',d:'Tu es dans l\u2019espace ! Officiellement.'}},
  // v1.108.1 «Ачивки-призраки»: achCheck() звал их по имени в комментариях с v1.99.7/v1.100.1/v1.6.0 —
  // сам реестр после «Одна цель — одна категория» (v1.29.0) их не содержал. Стучались в пустую комнату,
  // теперь дверь на месте — по одному достижению на каждый момент, что уже честно проверяется в коде.
  {id:'f1', cat:'flight', ic:'📡', need:1, rw:15, val:()=>Store.get('gyroGold',0),
    ru:{n:'Пилот',d:'Впервые послушался наклона — «Полёт без рук» ожил.'}, en:{n:'Pilot',d:'Tilt obeyed for the first time — "Hands-Free Flight" came alive.'},
    es:{n:'Piloto',d:'La inclinación respondió por primera vez — «Vuelo sin manos» cobró vida.'}, pt:{n:'Piloto',d:'A inclinação obedeceu pela primeira vez — «Voo sem mãos» ganhou vida.'},
    fr:{n:'Pilote',d:'L\u2019inclinaison a obéi pour la première fois — le « Vol mains libres » a pris vie.'}},
  {id:'d1', cat:'duel', ic:'⚔️', need:1, rw:10, val:()=>Stats.duelsSent||0,
    ru:{n:'Первый вызов',d:'Бросил другу вызов на Дуэль.'}, en:{n:'First Challenge',d:'Sent a friend a Duel challenge.'},
    es:{n:'Primer reto',d:'Le enviaste a un amigo un reto de Duelo.'}, pt:{n:'Primeiro desafio',d:'Enviou a um amigo um desafio de Duelo.'},
    fr:{n:'Premier défi',d:'Tu as envoyé un défi de Duel à un ami.'}},
  {id:'d2', cat:'duel', ic:'🏆', need:1, rw:20, val:()=>Stats.duelsWon||0,
    ru:{n:'Победитель дуэли',d:'Побил чужую планку в Дуэли.'}, en:{n:'Duel Winner',d:'Beat someone\u2019s bar in a Duel.'},
    es:{n:'Ganador del duelo',d:'Superaste la marca de alguien en un Duelo.'}, pt:{n:'Vencedor do duelo',d:'Superou a marca de alguém em um Duelo.'},
    fr:{n:'Vainqueur du duel',d:'Tu as battu la marque de quelqu\u2019un en Duel.'}},
  {id:'h1', cat:'hangar', ic:'🎨', need:2, rw:10, val:()=>(typeof S!=='undefined'&&S.ownedSkins?S.ownedSkins.length:0),
    ru:{n:'Первый скин',d:'Купил свой первый скин в Ангаре.'}, en:{n:'First Skin',d:'Bought your first skin in the Hangar.'},
    es:{n:'Primera piel',d:'Compraste tu primera piel en el Hangar.'}, pt:{n:'Primeira skin',d:'Comprou sua primeira skin no Hangar.'},
    fr:{n:'Première skin',d:'Tu as acheté ta première skin dans le Hangar.'}},
  {id:'h2', cat:'hangar', ic:'👑', need:9, rw:50, val:()=>(typeof S!=='undefined'&&S.ownedSkins?S.ownedSkins.length:0),
    ru:{n:'Вся коллекция',d:'Собрал все скины Ангара.'}, en:{n:'Full Collection',d:'Collected every skin in the Hangar.'},
    es:{n:'Colección completa',d:'Reuniste todas las pieles del Hangar.'}, pt:{n:'Coleção completa',d:'Reuniu todas as skins do Hangar.'},
    fr:{n:'Collection complète',d:'Tu as réuni toutes les skins du Hangar.'}}, // need=9: SKINS.length сегодня — обновить вместе, если добавите скин
];
const CATS=['cosmos','flight','duel','hangar']; // v1.108.1: было одно «одна цель — одна категория», теперь честно по числу целей
const CAT_N={
  cosmos:{ru:'Космическая шкала',en:'Cosmic ladder',es:'Escala cósmica',pt:'Escala cósmica',fr:'Échelle cosmique'},
  flight:{ru:'Полёт',en:'Flight',es:'Vuelo',pt:'Voo',fr:'Vol'},
  duel:{ru:'Дуэль',en:'Duel',es:'Duelo',pt:'Duelo',fr:'Duel'},
  hangar:{ru:'Ангар',en:'Hangar',es:'Hangar',pt:'Hangar',fr:'Hangar'}
};

function achUnlockedSet(){ return saneArray(Store.get('ach',[]),[]).filter(x=>typeof x==='string'); } // v1.282.20: битое значение роняло achCheck прямо из gameOver — забег и очки терялись

/* Карман наград: открытые, но ещё не отпразднованные. Праздник — по одной
   карточке (модуль Н2), здесь — только тихий учёт и бейдж-счётчик. */
function achQueue(){ return saneArray(Store.get('achQ',[]),[]).filter(x=>typeof x==='string'); } // v1.282.20: то же
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
/* v1.284.3: досчёт искал #walletMenu — элемент, которого в разметке НЕТ ни одного:
   кошелёк убрали с главного экрана, а функция осталась искать его и выходить по !el.
   Игрок жал «Забрать» и не видел ни одного признака, что звёзды пришли. Теперь строка
   награды на самой карточке («+25 ✦») превращается в новый итог кошелька, и только
   после досчёта карточка уступает место следующей. Страж 125. */
function walletCountUp(from,to,done){ // строка награды досчитывает до нового кошелька (0.5с, easeOutCubic)
  const el=$('claimRw');
  if(!el){ if(done) done(); return; }
  const t0=performance.now(), g=++walletCountGen;
  requestAnimationFrame(function tick(now){
    if(g!==walletCountGen) return; // праздник перебит следующим — этот досчёт больше не наш
    const k=Math.min(1,(now-t0)/500);
    const v=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));
    el.innerHTML = L.wallet+v;
    if(k<1) requestAnimationFrame(tick);
    else if(done) done();
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
  const md=$('claimMedal'), elCls=$('claimCls'), elName=$('claimName'), elDesc=$('claimDesc'),
    elRw=$('claimRw'), elQ=$('claimQ'), elBtn=$('claimBtn'), elBurst=$('claimBurst'), elScreen=$('claimScreen');
  /* 23.08.2026: тот же приём, что wireOn() в ui.js — один общий вход для всех элементов
     экрана награды. Раньше каждая строка читала $(id) напрямую: отсутствие любого одного
     (устаревший кэш index.html) обрывало бы заполнение на середине, часть карточки
     осталась бы от прошлой награды. Теперь — тихий выход с сигналом, ничего не рисуем наполовину. */
  if(!md||!elCls||!elName||!elDesc||!elRw||!elQ||!elBtn||!elBurst||!elScreen){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','claimScreen');
    return;
  }
  claimOpen=true;
  const tier=achTier(a), tt=aT(a);
  md.className='claimMedal '+tier;
  md.innerHTML=ic('trophy'); // линейный трофей вместо эмодзи; класс медали — по награде
  elCls.textContent = tier==='mGold'?L.achClsG:(tier==='mSilver'?L.achClsS:L.achClsB);
  elName.textContent=tt.n;
  elDesc.textContent=tt.d;
  elRw.innerHTML='+'+a.rw+ic('star4','i-s4');
  claimPos++;
  elQ.textContent=claimPos+' / '+claimTotal;
  elBtn.textContent = q.length>1 ? L.achClaim : L.achDone;
  // звёздный веер вокруг медали (DOM-частицы — виден поверх любого экрана)
  elBurst.innerHTML='';
  for(let i=0;i<10;i++){
    const st=document.createElement('i');
    const ang=(i/10)*6.283, dist=70+Math.random()*46;
    st.style.setProperty('--dx',(Math.cos(ang)*dist).toFixed(0)+'px');
    st.style.setProperty('--dy',(Math.sin(ang)*dist).toFixed(0)+'px');
    st.style.animationDelay=(Math.random()*0.12)+'s';
    elBurst.appendChild(st);
  }
  elScreen.classList.remove('hidden');
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
  /* Досчёт обязан быть виден: раньше карточка пряталась (или переписывалась следующей)
     в тот же кадр, и анимация не успевала родиться. Ждём её конца. */
  walletCountUp(from,S.wallet,()=>{
    if(achQueue().length) achClaimShow(); else achClaimHide();
  });
}
function achClaimHide(){ claimOpen=false; const s=$('claimScreen'); if(s) s.classList.add('hidden'); }
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
  const g=Stats.gGames||0, t=Stats.tGames||0, b=Stats.bGames||0, k=Stats.kGames||0; // v1.280.0: keys — своя честная категория, не тонет в touch
  if(g===0&&t===0&&b===0&&k===0) return '—';
  if(b>=g&&b>=t&&b>=k) return L.bullet;
  if(k>=g&&k>=t) return L.modeKeys;
  return g>=t?L.modeGyro:L.modeTouch;
}
function renderAch(){
  const un=achUnlockedSet(), q=achQueue();
  const elStats=$('achStats'), elProg=$('achProg'), elProgFill=$('achProgFill'), elList=$('achList');
  if(!elStats||!elProg||!elProgFill||!elList){ // 23.08.2026: тот же приём, что и claimScreen выше — единый вход, не падение на середине
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','achStats');
    return;
  }
  // статистика — ряд метрик с крупными числами; режимы — плашки с иконками
  const statCell=(v,l)=>'<div class="statCell"><b>'+v+'</b><span>'+l+'</span></div>';
  const gN=Stats.gGames||0, tN=Stats.tGames||0, bN=Stats.bGames||0, kN=Stats.kGames||0;
  const favIc=(bN>=gN&&bN>=tN&&bN>=kN)?'timer':((kN>=gN&&kN>=tN)?'keys':(gN>=tN?'phone':'hand'));
  elStats.innerHTML =
    '<div class="statGrid stats4">'+
      statCell(fmtN(Stats.games||0),L.statFlights)+
      statCell(fmtN(Stats.totalDist||0),L.statDist)+
      statCell(fmtN(Stats.totalStars||0),L.statStars)+
      statCell('×'+(Stats.bestCombo||0),L.statCombo)+
      statCell(fmtN(Stats.nearMiss||0),L.statNearMiss)+
      statCell(fmtN(Stats.duelsWon||0),L.statDuelsWon)+
      statCell(fmtN(Stats.perfectRuns||0),L.statPerfect)+
      statCell(fmtN(Stats.recBeats||0),L.statRecBeats)+
    '</div>'+
    '<div class="bestPills">'+
      (gN+tN+bN+kN>0?'<span class="miniPill runMode">'+ic(favIc)+favMode()+'</span>':'')+
      '<span class="miniPill">'+ic('phone')+'<b>'+fmtN(gN)+'</b></span>'+
      '<span class="miniPill">'+ic('hand')+'<b>'+fmtN(tN)+'</b></span>'+
      '<span class="miniPill">'+ic('keys')+'<b>'+fmtN(kN)+'</b></span>'+
      '<span class="miniPill">'+ic('timer')+'<b>'+fmtN(bN)+'</b></span>'+
    '</div>';
  elProg.innerHTML = ic('trophy')+L.achOf+' '+un.length+' / '+ACH.length;
  elProgFill.style.width = (un.length/ACH.length*100)+'%';
  let h='', hI=0; // hI — счётчик каскадной задержки строк (+60ms, потолок 600ms)
  for(const cid of CATS){
    const items=ACH.filter(a=>a.cat===cid); if(!items.length) continue;
    h+='<div class="achCat">'+(CAT_N[cid][typeof langEff!=='undefined'?langEff:'ru'] || CAT_N[cid].en || CAT_N[cid].ru)+'</div>';
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
  elList.innerHTML=h;
}
