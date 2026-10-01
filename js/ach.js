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
const needOf=a=>typeof a.need==='function'?a.need():a.need; // 08.09.2026: та же гибкость, что уже была у val() — нужна h2 (SKINS.length растёт с каждым сезоном, число не должно застревать)
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
    ru:{n:'Первый скин',d:'Купил свой первый скин в Тюнинге.'}, en:{n:'First Skin',d:'Bought your first skin in Tuning.'},
    es:{n:'Primera piel',d:'Compraste tu primera piel en Tuning.'}, pt:{n:'Primeira skin',d:'Comprou sua primeira skin em Tuning.'},
    fr:{n:'Première skin',d:'Tu as acheté ta première skin dans Tuning.'}},
  {id:'h2', cat:'hangar', ic:'👑', need:()=>(typeof SKINS!=='undefined'?SKINS.length:9), rw:400,
    /* 09.09.2026: val() раньше был S.ownedSkins.length — просто ЧИСЛО купленных когда-либо id,
       включая уже удалённые из игры (архив партий). Оно могло случайно совпасть с текущим
       SKINS.length (need) по количеству, а не по составу — например владелец держал 45 старых
       id из давно снятых партий, ровно когда SKINS.length тоже стал 45 — достижение открылось
       бы «сам собой», хотя ни одного из 45 ТЕКУЩИХ скинов игрок не покупал. Поймано при сверке
       партии «физика/культура-2» (44 новых скина разом подняли и опускали SKINS.length несколько
       раз за день). Теперь считаем настоящее пересечение: сколько из СЕЙЧАС существующих id
       реально есть в S.ownedSkins — так v может дойти до need() только когда владеет каждым
       текущим скином по-настоящему, число в «x/y» на экране Достижений при этом остаётся честным
       живым прогрессом, не 0/1. */
    val:()=>{ if(typeof S==='undefined'||!S.ownedSkins||typeof SKINS==='undefined') return 0;
      const owned=new Set(S.ownedSkins); let n=0; for(const sk of SKINS) if(owned.has(sk.id)) n++; return n; },
    ru:{n:'Вся коллекция',d:'Собрал все скины Тюнинга.'}, en:{n:'Full Collection',d:'Collected every skin in Tuning.'},
    es:{n:'Colección completa',d:'Reuniste todas las pieles de Tuning.'}, pt:{n:'Coleção completa',d:'Reuniu todas as skins de Tuning.'},
    fr:{n:'Collection complète',d:'Tu as réuni toutes les skins de Tuning.'}}, // 08.09.2026: было захардкожено need:9, разошлось до 49 реальных скинов — теперь читает SKINS.length живьём, растёт сама с каждым новым сезонным добавлением, обновлять вручную больше не нужно
];
const CATS=['cosmos','flight','duel','hangar']; // v1.108.1: было одно «одна цель — одна категория», теперь честно по числу целей
const CAT_N={
  cosmos:{ru:'Космическая шкала',en:'Cosmic ladder',es:'Escala cósmica',pt:'Escala cósmica',fr:'Échelle cosmique'},
  flight:{ru:'Полёт',en:'Flight',es:'Vuelo',pt:'Voo',fr:'Vol'},
  duel:{ru:'Дуэль',en:'Duel',es:'Duelo',pt:'Duelo',fr:'Duel'},
  hangar:{ru:'Тюнинг',en:'Tuning',es:'Tuning',pt:'Tuning',fr:'Tuning'} // 07.09.2026: было «Ангар»/«Hangar» на всех 5 языках — экран переименован в Тюнинг ещё 30.08.2026, здесь забыли обновить
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
    if(v>=needOf(a)){ un.push(a.id); fresh.push(a); }
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
  for(const a of ACH) if(a.cat==='cosmos' && d<needOf(a)) return a;
  return null;
}

/* ---------- Экран «🏆 Достижения»: статистика + список ---------- */
function favMode(){
  const g=Stats.gGames||0, t=Stats.tGames||0, k=Stats.kGames||0; // v1.280.0: keys — своя честная категория, не тонет в touch
  if(g===0&&t===0&&k===0) return '—';
  if(k>=g&&k>=t) return L.modeKeys;
  return g>=t?L.modeGyro:L.modeTouch;
}
/* 31.08.2026 «Переосмысление вида Достижений» (владелец, макет): своя иконка+цвет на каждой
   плитке статистики и каждом достижении — раньше все плитки были одинаковой серой коробкой.
   6 из 8+6 иконок переиспользуют уже существующие символы игры (i-plane/i-ruler/i-star4/
   i-trophy/i-checkbadge/i-target/i-phone), 6 — новые (i-combo/i-nearmiss/i-karman/i-swords/
   i-palette/i-crown, index.html). Текст/значения/логика — не тронуты, только вид. */
const ACH_STAT_ICO=[
  ['plane','#9fb4d8'],['ruler','#9fe8ff'],['star4','#f0c040'],['combo','#8fff9f'],
  ['nearmiss','#eef4ff'],['trophy','#c58fff'],['checkbadge','#f0c040'],['target','#ff9f8f'],
];
const ACH_ICO={c1:'karman', f1:'phone', d1:'swords', d2:'trophy', h1:'palette', h2:'crown'};
const CAT_COLOR={cosmos:'#9fe8ff', flight:'#8fb4ff', duel:'#ff9f8f', hangar:'#c58fff'};
// 01.10.2026 «Паспорт пилота» (владелец выбрал вариант Б макета «Достижения → Мои»: «Мне очень бы понравилось. Красиво.»): вместо восьми плиток и папки «Управление» —
// обложка пилота (свой самолёт, ник, звание, три числа), рекорды по режимам с местом в мире, полоска «Как ты летаешь» и «Мастерство». «Открыто N / M» и список достижений ниже не тронуты.
function achPassportHtml(){
  const T=ovT, esc=escapeHtml;
  const g=Stats.gGames||0, t=Stats.tGames||0, k=Stats.kGames||0, tot=g+t+k;
  const km=Math.round((Stats.totalDist||0)/1000), sa=heroRecordFor('touch').val, dl=heroRecordFor('daily').val, sl=heroRecordFor('slalom').val, rl=saneNumber(Store.get('bestRelayLeg',0),0);
  const nick=esc((typeof myCallsign==='function'&&myCallsign())||'');
  const month=(function(){ try{ return new Date().toLocaleDateString((typeof langEff!=='undefined'&&langEff)||'ru',{month:'long'}); }catch(e){ return ''; } })();
  const row=function(ico,nm,sub,val,plId,hasVal){
    return '<div class="mpRow">'+ic(ico,'mpMi')+'<div class="mpNm">'+nm+'<small>'+sub+'</small></div>'
      +(hasVal?'<div class="mpVl">'+val+'</div><div class="mpPl hidden" id="'+plId+'"></div>':'<div class="mpVl mpGo">'+val+'</div>')+'</div>';
  };
  const pct=function(n){ return tot>0&&n>0?Math.max(1,Math.round(100*n/tot)):0; };
  const pT=pct(t), pG=pct(g), pK=pct(k);
  const how=tot>0
    ? '<div class="mpSec">'+T('achPassHow')+'</div><div class="mpHow"><div class="mpBar">'
      +(pT?'<i style="flex:'+pT+';background:linear-gradient(90deg,#4fd6c8,#1c978c)"></i>':'')
      +(pG?'<i style="flex:'+pG+';background:linear-gradient(90deg,#7f8cff,#4650c4)"></i>':'')
      +(pK?'<i style="flex:'+pK+';background:linear-gradient(90deg,#ffb84d,#d9831a)"></i>':'')+'</div>'
      +'<div class="mpLeg"><div class="mpLg">'+ic('ctl-touch')+'<div><b>'+L.modeTouch+'</b><br>'+pT+'%</div></div>'
      +'<div class="mpLg">'+ic('ctl-gyro')+'<div><b>'+L.modeGyro+'</b><br>'+pG+'%</div></div>'
      +'<div class="mpLg">'+ic('ctl-keys')+'<div><b>'+L.modeKeys+'</b><br>'+pK+'%</div></div></div></div>'
    : '';
  const cc=function(ico,col,n,lbl){ return '<div class="mpCc">'+ic(ico,'mpCi')+'<div><b>'+n+'</b><span>'+lbl+'</span></div></div>'; };
  return '<div class="mpHero"><div class="mpSt"></div><canvas class="mpShip" width="172" height="172"></canvas>'
    +'<div class="mpTx"><b>'+(nick||T('achPassPilot'))+'</b><span>'+T(km>=100?'achPassC1':'achPassPilot')+'</span><em id="mpBest">'+(sa>0?T('achPassBest')(fmtN(sa)):T('achPassNoRec'))+'</em></div>'
    +'<div class="mpRow3"><div><b style="color:#9fe8ff">'+fmtN(Stats.games||0)+'</b><span>'+T('achPassFlights')+'</span></div>'
    +'<div><b>'+fmtN(km)+' '+T('achPassKm')+'</b><span>'+T('achPassWent')+'</span></div>'
    +'<div><b style="color:#f0c040">'+fmtN(Stats.totalStars||0)+'</b><span>'+T('achPassStars')+'</span></div></div></div>'
    +'<div class="mpSec">'+T('achPassRecs')+'</div>'
    +row('mode-sa',L.modeClassic,T('achPassSubScore'),fmtN(sa),'mpPlSA',sa>0)
    +row('mode-daily',L.modeDaily,esc(month),fmtN(dl),'mpPlDL',dl>0)
    +row('mode-relay',L.modeRelay,rl>0?T('achPassSubLeg'):T('achPassSubNoLeg'),rl>0?fmtN(rl):T('achPassGo'),'mpPlRL',rl>0)
    +row('mode-slalom',L.modeSlalom,T('achPassSubTime'),sl>0?fmtTimeRes(sl):'',  'mpPlSL',sl>0)
    +how
    +'<div class="mpSec">'+T('achPassMast')+'</div><div class="mpChips">'
    +cc('mast-near','#eef4ff',fmtN(Stats.nearMiss||0),T('achPassNear'))+cc('mast-perfect','#f0c040',fmtN(Stats.perfectRuns||0),T('achPassPerfect'))
    +cc('mast-combo','#8fff9f','×'+(Stats.bestCombo||0),T('achPassCombo'))+cc('mast-rec','#ff9f8f',fmtN(Stats.recBeats||0),T('achPassBeat'))+'</div>';
}
let _achPassGen=0;
function achPassportFill(root){
  const cv=root.querySelector('.mpShip'); if(cv && typeof overSkinDraw==='function') overSkinDraw(cv, S.skin); // свой самолёт
  if(typeof syncAvailable!=='function' || !syncAvailable()) return; // гостю места не показываем — только рекорды
  const gen=++_achPassGen, put=function(id,rank){ if(gen!==_achPassGen) return; const el=document.getElementById(id); if(!el||!(rank>0)) return; el.textContent='#'+rank; el.classList.remove('hidden'); el.classList.toggle('g',rank===1); };
  if(typeof syncTop==='function') Promise.all(['touch','gyro','keys'].map(function(c){ return syncTop(c).catch(function(){ return null; }); })).then(function(rs){
    const mine=Math.max(myBestFor('touch'),myBestFor('gyro'),myBestFor('keys')); let rk=0;
    rs.forEach(function(d){ if(d&&d.ok&&d.me&&Number(d.me.best)===mine&&d.me.rank>0) rk=rk?Math.min(rk,d.me.rank):d.me.rank; });
    put('mpPlSA',rk);
    const b=document.getElementById('mpBest'); if(b && rk===1 && mine>0) b.textContent=ovT('achPassBest')(fmtN(mine))+' · '+ovT('achPassFirst');
  });
  if(typeof syncDailyTop==='function') syncDailyTop(trackDayKey()).then(function(d){ if(d&&d.ok&&d.me) put('mpPlDL',d.me.rank); }).catch(function(){});
  if(typeof syncSlalomTop==='function') syncSlalomTop(typeof SLALOM_ETERNAL_DAY!=='undefined'?SLALOM_ETERNAL_DAY:'').then(function(d){ if(d&&d.ok&&d.me) put('mpPlSL',d.me.rank); }).catch(function(){});
}
function renderAch(){
  const un=achUnlockedSet(), q=achQueue();
  const elStats=$('achStats'), elProg=$('achProg'), elProgFill=$('achProgFill'), elList=$('achList'),
    elDummy=null;
  if(!elStats||!elProg||!elProgFill||!elList){ // 23.08.2026: тот же приём, что и claimScreen выше — единый вход, не падение на середине
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','achStats');
    return;
  }
  elStats.innerHTML=achPassportHtml(); achPassportFill(elStats); // 01.10.2026: «Паспорт пилота» вместо плиток и папки «Управление»
  elProg.innerHTML = ic('trophy')+L.achOf+' '+un.length+' / '+ACH.length;
  elProgFill.style.width = (un.length/ACH.length*100)+'%';
  let h='', hI=0; // hI — счётчик каскадной задержки строк (+60ms, потолок 600ms)
  for(const cid of CATS){
    const items=ACH.filter(a=>a.cat===cid); if(!items.length) continue;
    const cc=CAT_COLOR[cid]||'var(--muted)';
    h+='<div class="achCat" style="--cc:'+cc+'">'+(CAT_N[cid][typeof langEff!=='undefined'?langEff:'ru'] || CAT_N[cid].en || CAT_N[cid].ru)+'</div>';
    // 07.09.2026: «Дуэль» — единственная категория без входной точки в меню (кнопка «Вызов»
    // выскакивает сама на итогах хорошего полёта, её нигде заранее не объясняют) — короткая
    // подсказка тем же .hint, что уже стоит под слайдерами Конструктора, без нового компонента.
    if(cid==='duel') h+='<div class="hint" style="padding:0 20px 4px">'+(L.achDuelHint||'')+'</div>';
    for(const a of items){
      const got=un.indexOf(a.id)>=0, tt=aT(a);
      const name=tt.n, desc=tt.d; // секретов в реестре нет (v1.32.0) — имя и описание всегда настоящие
      const pend=q.indexOf(a.id)>=0; // открыто, но ждёт «Забрать»
      const big=a.id==='c1'; // единственная по-настоящему большая веха (владелец, макет) — не выдумано, «Линия Кармана»
      let side='', barHtml='';
      if(!got&&!a.secret){ let v=0; try{ v=a.val(); }catch(e){}
        const nd=needOf(a);
        side='<span class="achPr">'+fmtN(Math.min(v,nd))+'/'+fmtN(nd)+'</span>';
        barHtml='<span class="achBar"><i style="width:'+Math.min(100,Math.round(v/nd*100))+'%"></i></span>'; }
      h+='<div class="achIt'+(got?' got':'')+(pend?' pend':'')+(big?' big':'')+
        '" style="--ac:'+cc+';--acg:'+cc+'55;animation-delay:'+(Math.min(hI++,10)*60)+'ms">'+
        '<span class="achIco">'+ic(ACH_ICO[a.id]||'star4')+'</span>'+
        '<span class="achTx"><b>'+name+'</b><i>'+desc+'</i>'+barHtml+'</span>'+
        (got?(pend?'<span class="achRw pendBtn" data-claim="'+a.id+'">'+L.achClaim+' +'+a.rw+ic('star4','i-s4')+'</span>':'<span class="achRw">+'+a.rw+ic('star4','i-s4')+'</span>'):side)+'</div>';
    }
  }
  elList.innerHTML=h;
}
