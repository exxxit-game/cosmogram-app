'use strict';
/* ============================================================
   НАГРАДЫ-ДОСЬЕ (модуль). 02.10.2026 владелец: «достижение, которое выглядит как статистика, как чек из магазина, — не достижение»;
   макет «Награды — архив досье» (claude.ai/artifact/FmZVGKQ5YQPG5Hnrr1WWhH), «Делаем». Награда — сама эмблема и строка истории, без звёзд ✦ и без
   связи со скинами/покупками (владелец: «это формирует зависимость покупать их»). Пять открытых наград (видно, как получить) и девять секретных
   «досье» (условие не показывается, на закрытых — замок и намёк). Условия — только то, что игра реально определяет (см. achRunCheck).
   Исследование и проверенные космические факты: .knowledge/RESEARCH-2026-10-ACHIEVEMENTS-SECRETS.md.
   Зависит от core.js (Store, L, toast, haptic, sfx, saneNumber), game.js (Stats, S, rec), ui.js (setScreen) — грузится после game.js.
   ============================================================ */

const fmtN=n=>String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
const needOf=a=>typeof a.need==='function'?a.need():a.need;
const aT=a=>(a[typeof langEff!=='undefined'?langEff:'ru'] || a.en || a.ru);

/* Строки экрана наград: пока только по-русски (как и текст Хартии) — ovT() берёт русскую, если на языке игрока строки нет. */
Object.assign(I18N.ru,{
  achSumOpen:(n,t)=>'Открыто '+n+' из '+t, achLast:'Последняя находка', achNotYet:'Ещё не найдено',
  achFoundHd:'Найдено', achNotFoundHd:'Не найдено', achSecretHd:(f,t)=>'Засекречено · найдено '+f+' из '+t,
  achSecretLbl:n=>'Засекречено · досье №'+n, achDossier:n=>'досье №'+n,
  achClaimCls:'Достижение', achClaimSec:n=>'Секретное досье №'+n, achNext:'Дальше'
});

/* ---------- Список: открытые (open) — видно, как получить; секретные (secret, no — номер досье) — условие скрыто ----------
   em — эмблема (символ #ea-<em> в спрайте index.html); val/need — прогресс для открытых; события секретных см. achRunCheck().
   id c1/f1/d1/d2 оставлены прежними — уже полученные награды игроков не теряются. Скины и «Тюнинг» убраны совсем. */
const ACH=[
  {id:'c1', em:'karman', need:100000, val:()=>Stats.totalDist,
    ru:{n:'Линия Кармана', d:'Сто километров вверх. Граница космоса для всех, кроме американцев: им хватает восьмидесяти.'}},
  {id:'f1', em:'pilot', need:1, val:()=>Store.get('gyroGold',0),
    ru:{n:'Пилот', d:'Самолёт послушался наклона. Подозрительно.'}},
  {id:'d1', em:'vyzov', need:1, val:()=>Stats.duelsSent||0,
    ru:{n:'Первый вызов', d:'Бросил другу вызов. Друг пока не знает, что это было предупреждение.'}},
  {id:'d2', em:'pobeditel', need:1, val:()=>Stats.duelsWon||0,
    ru:{n:'Победитель дуэли', d:'Побил чужую планку. Друг называет это случайностью.'}},
  {id:'o5', em:'lishniy', ev:true,
    ru:{n:'Лишний манёвр', d:'За один полёт проехать по горизонтали двадцать пять ширин экрана. Самолёт не жаловался.'}},
  {id:'s1', em:'poekhali', secret:true, no:1,
    ru:{n:'Поехали!', d:'12 апреля 1961. Одно слово, которое запомнили лучше всего остального.', h:'Начало всегда одно.'}},
  {id:'s2', em:'vernulis', secret:true, no:2,
    ru:{n:'Все вернулись', d:'Белка и Стрелка: семнадцать витков вокруг Земли. Вернулись все, и мыши тоже.', h:'Счёт идёт подряд.'}},
  {id:'s3', em:'laika', secret:true, no:3,
    ru:{n:'Лайка', d:'3 ноября 1957. Долго говорили, что она прожила неделю. Правда стала известна в 2002 году.', h:'Тишина — тоже ответ.'}},
  {id:'s4', em:'wow', secret:true, no:4,
    ru:{n:'Wow!', d:'15 августа 1977. Сигнал длился 72 секунды и больше не повторился.', h:'Он длился чуть больше минуты.'}},
  {id:'s5', em:'g2373', secret:true, no:5,
    ru:{n:'23 на 73', d:'16 ноября 1974. 1679 точек, посланных к звёздному скоплению. Ответа ждём до сих пор.', h:'Если разложить, получится картинка.'}},
  {id:'s6', em:'pylinka', secret:true, no:6,
    ru:{n:'Пылинка', d:'14 февраля 1990. С шести миллиардов километров Земля — точка меньше пикселя.', h:'Чем меньше, тем лучше видно.'}},
  {id:'s7', em:'panic', secret:true, no:7,
    ru:{n:'Не паникуй', d:'Эта надпись стоит на приборной панели «Стармена», который летит мимо Земли с 6 февраля 2018 года.', h:'Ответ на главный вопрос.'}},
  {id:'s8', em:'mir', secret:true, no:8,
    ru:{n:'Мир', d:'23 марта 2001. Станция прожила пятнадцать лет и затонула в Тихом океане.', h:'Четыре этапа — один путь.'}},
  {id:'s9', em:'gdevse', secret:true, no:9,
    ru:{n:'Где все?', d:'Парадокс Ферми, 1950. Если они есть, где они? Пустое небо месяца — тоже ответ.', h:'Если они есть, где они?'}}
];

function achUnlockedSet(){ return saneArray(Store.get('ach',[]),[]).filter(x=>typeof x==='string'); } // v1.282.20: битое значение роняло achCheck прямо из gameOver — забег и очки терялись
function achDates(){ const o=Store.get('achD',{}); return (o && typeof o==='object' && !Array.isArray(o))?o:{}; } // id → время получения (мс); у наград, полученных до 02.10.2026, даты нет

/* Карман наград: открытые, но ещё не показанные карточкой. */
function achQueue(){ return saneArray(Store.get('achQ',[]),[]).filter(x=>typeof x==='string'); }
function achQShow(){
  const el=$('achBadge'); if(!el) return;
  const n=achQueue().length;
  el.textContent=n>9?'9+':String(n);
  el.classList.toggle('hidden', n<=0);
}

/* Выдача: список id → открытые, дата, карман. Тихо, без тост-спама: каждая награда получит свою карточку. */
function achGrant(ids){
  const un=achUnlockedSet(), d=achDates(), fresh=[];
  for(const id of ids){ if(un.indexOf(id)<0 && ACH.some(a=>a.id===id)){ un.push(id); d[id]=Date.now(); fresh.push(id); } }
  if(!fresh.length) return;
  Store.set('ach',un); Store.set('achD',d);
  const q=achQueue(); for(const id of fresh) if(q.indexOf(id)<0) q.push(id);
  Store.set('achQ',q); achQShow();
}
/* Проверка по счётчикам (после забега, стрика, дуэли, наклона). */
function achCheck(){
  const un=achUnlockedSet(), ids=[];
  for(const a of ACH){
    if(!a.val || un.indexOf(a.id)>=0) continue;
    let v=0; try{ v=a.val(); }catch(e){}
    if(v>=needOf(a)) ids.push(a.id);
  }
  achGrant(ids);
}
/* Проверка секретов и «Лишнего манёвра» по итогам забега — зовёт gameOver() в ui.js. c: {distM}. Всё считается по тому, что игра уже знает (S, rec). */
function achWidths(){ let t=0; for(let i=1;i<rec.length;i++) t+=Math.abs(rec[i][0]-rec[i-1][0]); return t/91; } // сколько ширин экрана самолёт проехал по горизонтали за забег (rec: x в 92 уровнях)
function achRunCheck(c){
  const ids=[], live=!S.wasRestored;
  if(live && Stats.deaths>=1) ids.push('s1'); // «Поехали!» — первый полёт в жизни
  if(live && (S.gateBest||0)>=17) ids.push('s2'); // «Все вернулись» — 17 ворот подряд (game.js: S.gateRun/gateBest)
  if(live && S.wowCenter) ids.push('s4'); // «Wow!» — 72-я секунда по центру (game.js)
  if(live && c.distM===1679) ids.push('s5'); // «23 на 73» — гибель ровно на 1 679-м метре
  if(live && S.time>0 && S.time<2) ids.push('s6'); // «Пылинка» — гибель меньше чем через 2 секунды после взлёта (первые 1,5 с самолёт неуязвим)
  if(c.distM===42) ids.push('s7'); // «Не паникуй» — гибель на 42-м метре (пасхалка уже была в игре)
  if(live && S.mode==='relay' && S.relayLegDone && S.relayLeg>=RELAY_LEGS_TOTAL) ids.push('s8'); // «Мир» — Эстафета пройдена до конца
  if(live && S.mode==='daily' && S.crowdSeen===0) ids.push('s9'); // «Где все?» — «Небо месяца», сервер ответил, и чужих полётов нет
  if(live && rec.length>=20 && achWidths()>=25) ids.push('o5'); // «Лишний манёвр»
  achGrant(ids);
}
/* «Лайка»: победа в «Без касаний» и потом 7 секунд ничего не трогать на экране итогов (тишина — тоже ответ). */
let _laikaT=0;
function achLaikaDisarm(){ if(_laikaT){ clearTimeout(_laikaT); _laikaT=0; } document.removeEventListener('pointerdown',achLaikaDisarm,true); document.removeEventListener('keydown',achLaikaDisarm,true); }
function achLaikaArm(){
  achLaikaDisarm();
  _laikaT=setTimeout(function(){ _laikaT=0; achLaikaDisarm(); if(screenName==='over') achGrant(['s3']); },7000);
  document.addEventListener('pointerdown',achLaikaDisarm,true); document.addEventListener('keydown',achLaikaDisarm,true);
}

/* ---------- Карточка награды: праздник по одной (без звёзд) ---------- */
let claimOpen=false, claimTotal=0, claimPos=0;
function achEmb(em,w,filt){ return '<svg viewBox="0 0 64 64" width="'+w+'" height="'+w+'"'+(filt?' style="filter:'+filt+'"':'')+' aria-hidden="true"><use href="#ea-'+em+'"></use></svg>'; }
function achClaimMaybe(){ // автопоказ при возврате в меню с непустым карманом
  if(claimOpen || screenName!=='menu') return;
  if(!achQueue().length) return;
  claimTotal=achQueue().length; claimPos=0;
  achClaimShow();
}
function achClaimShow(){
  const q=achQueue(); if(!q.length){ achClaimHide(); return; }
  const a=ACH.find(x=>x.id===q[0]);
  if(!a){ Store.set('achQ',q.slice(1)); achQShow(); achClaimShow(); return; } // мусор в кармане (например, снятые награды про скины) — выкинуть
  const md=$('claimMedal'), elCls=$('claimCls'), elName=$('claimName'), elDesc=$('claimDesc'),
    elRw=$('claimRw'), elQ=$('claimQ'), elBtn=$('claimBtn'), elBurst=$('claimBurst'), elScreen=$('claimScreen');
  if(!md||!elCls||!elName||!elDesc||!elRw||!elQ||!elBtn||!elBurst||!elScreen){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','claimScreen');
    return;
  }
  claimOpen=true;
  const tt=aT(a);
  md.className='claimMedal '+(a.secret?'mGold':'mSilver');
  md.innerHTML=achEmb(a.em,76); // эмблема награды вместо трофея
  elCls.textContent = a.secret ? ovT('achClaimSec')(a.no) : ovT('achClaimCls');
  elName.textContent=tt.n;
  elDesc.textContent=tt.d;
  elRw.innerHTML=''; elRw.classList.add('hidden'); // 02.10.2026: звёзд за награды нет
  claimPos++;
  elQ.textContent=claimPos+' / '+claimTotal;
  elBtn.textContent = q.length>1 ? ovT('achNext') : L.achDone;
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
  haptic('success'); sfx.ach();
  if(a.secret) setTimeout(()=>{ if(claimOpen) sfx.ach(); },160); // секретное — двойной колокольчик
}
function achClaimTake(){
  const q=achQueue();
  Store.set('achQ',q.slice(1)); achQShow();
  haptic('light');
  if(achQueue().length) achClaimShow(); else achClaimHide();
}
function achClaimHide(){ claimOpen=false; const s=$('claimScreen'); if(s) s.classList.add('hidden'); }
if(typeof $==='function' && $('claimBtn')) $('claimBtn').addEventListener('click', achClaimTake);

/* Ближайшая непройденная точка космической шкалы — строка мотивации на итогах («До Линии Кармана») */
function achNextLoc(){
  const a=ACH[0];
  return ((Stats.totalDist||0)<needOf(a)) ? a : null;
}

/* ---------- Экран «Достижения»: статистика + архив досье ---------- */
function favMode(){
  const g=Stats.gGames||0, t=Stats.tGames||0, k=Stats.kGames||0; // v1.280.0: keys — своя честная категория, не тонет в touch
  if(g===0&&t===0&&k===0) return '—';
  if(k>=g&&k>=t) return L.modeKeys;
  return g>=t?L.modeGyro:L.modeTouch;
}
const ACH_STAT_ICO=[
  ['plane','#9fb4d8'],['ruler','#9fe8ff'],['star4','#f0c040'],['combo','#8fff9f'],
  ['nearmiss','#eef4ff'],['trophy','#c58fff'],['checkbadge','#f0c040'],['target','#ff9f8f'],
];
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
/* 01.10.2026 (находка tools/screen-audit.mjs на данных «самое широкое»): ник до 10 знаков из самых широких букв (ЩЩЩЩЩЩЩЩЩЩ, WWWWWWWWWW) не помещался в обложку и обрезался многоточием. Теперь кегль ника уменьшается, пока ник не влезет целиком (минимум 13 px). */
function achFitNick(root){ const nb=root.querySelector('.mpTx b'); if(!nb) return; nb.style.fontSize=''; let fs=22; while(nb.scrollWidth>nb.clientWidth+1 && fs>13){ fs-=1; nb.style.fontSize=fs+'px'; } }
function achPassportFill(root){ requestAnimationFrame(()=>achFitNick(root)); setTimeout(()=>achFitNick(root),350);
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
function achDateTxt(ts){ try{ return new Date(ts).toLocaleDateString((typeof langEff!=='undefined'&&langEff)||'ru',{day:'numeric',month:'short'}).replace(/\.$/,''); }catch(e){ return ''; } }
/* Экран наград по макету «Награды — архив досье»: свёрнутый вид (полоса, последняя находка, значки), найденные, не найденные и засекреченные.
   Проценты игроков и редкость — отдельным шагом с сервером; пока их нет, строка показывает только дату. */
function renderAch(){
  const T=ovT, esc=escapeHtml;
  const ids=ACH.map(a=>a.id), un=achUnlockedSet().filter(id=>ids.indexOf(id)>=0), dates=achDates();
  const elStats=$('achStats'), elProg=$('achProg'), elProgFill=$('achProgFill'), elList=$('achList');
  if(!elStats||!elProg||!elProgFill||!elList){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('dom_missing','achStats');
    return;
  }
  elStats.innerHTML=achPassportHtml(); achPassportFill(elStats); // «Паспорт пилота» не тронут
  const pw=$('achProgWrap'); if(pw) pw.classList.add('hidden'); // старая полоса заменена свёрнутым видом ниже
  const total=ACH.length, got=un.length;
  const byId=id=>ACH.find(a=>a.id===id);
  const found=un.map(byId).filter(Boolean).reverse(); // последняя находка — первой
  const unearnedOpen=ACH.filter(a=>!a.secret && un.indexOf(a.id)<0);
  const secretsLocked=ACH.filter(a=>a.secret && un.indexOf(a.id)<0);
  const secTotal=ACH.filter(a=>a.secret).length, secFound=secTotal-secretsLocked.length;
  const ring=a=>a.secret?'#b073ea':'#9fb4d8';
  const lockSvg='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#8a99bd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>';
  let h='<div class="dsSum"><div class="dsSumTop"><span>'+T('achSumOpen')(got,total)+'</span><b>'+Math.round(got/total*100)+'%</b></div>'
    +'<div class="dsBar"><i style="width:'+(got/total*100)+'%"></i></div>';
  if(found.length){
    const a=found[0], tt=aT(a);
    h+='<div class="dsLab">'+T('achLast')+'</div><div class="dsLast"><div class="dsMico" style="border-color:'+ring(a)+'">'+achEmb(a.em,31)+'</div><div class="dsLastTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span></div></div>'
      +'<div class="dsMini">'+found.slice(0,6).map(x=>'<div class="dsMico" style="border-color:'+ring(x)+'">'+achEmb(x.em,31)+'</div>').join('')+(found.length>6?'<span class="dsMore">+'+(found.length-6)+'</span>':'')+'</div>';
  }
  const lockRest=unearnedOpen.length+secretsLocked.length;
  if(lockRest){
    h+='<div class="dsLab">'+T('achNotYet')+'</div><div class="dsMini">'
      +Array(Math.min(5,lockRest)).fill('<div class="dsMico lk">'+lockSvg+'</div>').join('')+(lockRest>5?'<span class="dsMore">+'+(lockRest-5)+'</span>':'')+'</div>';
  }
  h+='</div>';
  if(found.length){
    h+='<div class="dsSec">'+T('achFoundHd')+'</div>';
    for(const a of found){
      const tt=aT(a), ts=dates[a.id];
      const meta=[ts?achDateTxt(ts):'', a.secret?T('achDossier')(a.no):''].filter(Boolean).join(' · ');
      h+='<div class="dsRow"><div class="dsIco" style="border-color:'+ring(a)+'">'+achEmb(a.em,50)+'</div><div class="dsTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span>'+(meta?'<div class="dsMeta">'+esc(meta)+'</div>':'')+'</div></div>';
    }
  }
  if(unearnedOpen.length){
    h+='<div class="dsSec">'+T('achNotFoundHd')+'</div>';
    for(const a of unearnedOpen){
      const tt=aT(a); let prog='', bar='';
      if(a.val){ let v=0; try{ v=a.val(); }catch(e){} const nd=needOf(a); prog=fmtN(Math.min(v,nd))+' / '+fmtN(nd); bar='<div class="dsPb"><i style="width:'+Math.min(100,Math.round(v/nd*100))+'%"></i></div>'; }
      h+='<div class="dsRow off"><div class="dsIco dim">'+achEmb(a.em,50,'grayscale(1) opacity(.5)')+'</div><div class="dsTx"><b>'+esc(tt.n)+'</b><span>'+esc(tt.d)+'</span>'+(prog?'<div class="dsMeta">'+prog+'</div>':'')+bar+'</div></div>';
    }
  }
  if(secretsLocked.length){
    h+='<div class="dsSec">'+T('achSecretHd')(secFound,secTotal)+'</div>';
    for(const a of secretsLocked){
      h+='<div class="dsRow sec"><div class="dsIco dim"><svg viewBox="0 0 64 64" width="50" height="50" aria-hidden="true"><use href="#ea-lock"></use></svg></div><div class="dsTx"><b class="q">'+T('achSecretLbl')(a.no)+'</b><span class="hint">'+esc(aT(a).h||'')+'</span></div></div>';
    }
  }
  elList.innerHTML=h;
  // слабый телефон / «меньше движения»: эмблемы стоят неподвижно (анимация — удовольствие, не нагрузка)
  try{ const still=(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof Q!=='undefined' && Q.level<2);
    if(still) elList.querySelectorAll('svg').forEach(function(sv){ if(sv.pauseAnimations) sv.pauseAnimations(); }); }catch(e){}
}
