'use strict';
/* ============================================================
   UI: экраны, BackButton, потоки игры, ангар, шаринг,
   системные события, привязка кнопок, загрузка.
   Зависит от всех модулей выше.
   ============================================================ */

/* ---------- Экраны + нативные кнопки Telegram (Блок 4) ---------- */
let screenName='menu'; // menu | game | pause | over | hangar (не "screen" — конфликт с window.screen)
function hideMain(){ // v1.62.0: синяя MainButton дублировала экранные кнопки — всегда прячем
  if(tg&&tg.MainButton){ try{ tg.MainButton.hide(); }catch(e){} }
}
function setBack(visible){
  if(!tg||!tg.BackButton||!tgv('6.1'))return;
  try{ visible?tg.BackButton.show():tg.BackButton.hide(); }catch(e){}
}
// v1.108.1 «Своя кнопка Назад»: осмысленный переход по экрану, не просто «шаг назад» —
// раньше жил только внутри tg.BackButton.onClick; вынесен отдельно, чтобы тем же самым
// правилом пользовалась и history-ловушка для аппаратной/жестовой «Назад» вне Telegram.
function backAction(){
  if(screenName==='game') pauseGame();
  else if(screenName==='pause') resumeGame();
  else if(screenName==='hangar') toMenu();
  else if(screenName==='ach') closeAch();
  else if(screenName==='settings') closeSettings();
  else if(screenName==='diag') setScreen('settings'); // v1.66.3: сервисный центр — назад в настройки
  else if(screenName==='modes') setScreen('menu'); // v1.108.1: та же дверь, что у modesBack — раньше нативная/аппаратная «Назад» тут молчала, хотя кнопка была видна
  else if(screenName==='forge') setScreen('modes'); // v1.68.0: конструктор — назад к дисциплинам
  else if(screenName==='card') setScreen('over'); // v1.73.0: карточка — назад к итогам забега
  else if(screenName==='over') toMenu();
}
if (tg && tg.BackButton && tgv('6.1')){
  try{ tg.BackButton.onClick(backAction); }catch(e){}
}
// v1.280.0 «Третья дверь»: шестерёнка в шапке Telegram — Меню/Пауза уже умеют её открывать
// (openSettings), просто раньше не было видимой кнопки в самой шапке. Показывается/прячется
// в setScreen() ниже — вместе с той же видимостью, что и своя кнопка настроек экрана.
// Полёт исключён нарочно: соблазн потыкать шестерёнку посреди забега ни к чему.
if (tg && tg.SettingsButton && tgv('6.10')){
  try{ tg.SettingsButton.onClick(()=>openSettings(screenName==='pause'?'pause':'menu')); }catch(e){}
}
// Вне Telegram аппаратная/жестовая «Назад» на Android раньше закрывала вкладку/приложение целиком —
// history здесь никогда не наполнялась. Ловушка: держим один пустой кадр истории всегда наготове;
// когда браузер его «съедает» (это и есть нажатие «Назад»), тут же кладём новый и вызываем то же
// правило перехода, что и у tg.BackButton. На экране меню — честно отпускаем: там уже «дом».
if(!(tg && tg.BackButton && tgv('6.1'))){
  try{ history.pushState({},''); }catch(e){}
  window.addEventListener('popstate', ()=>{
    if(screenName==='menu') return; // дом — дальше пусть ведёт себя как обычная страница
    try{ history.pushState({},''); }catch(e){}
    backAction();
  });
}
// v1.101.0 «Чистое небо»: где у Telegram есть своя «Назад», наша пауза — призрак
// (невидимая подушка-след под ней); где родной кнопки нет — наша видна всегда
function pauseGhostSync(){
  const nativeBack=!!(tg && tg.BackButton && tgv('6.1'));
  $('pauseBtn').classList.toggle('ghost', nativeBack);
}
pauseGhostSync();
function setScreen(name){
  if(name==='menu' && typeof runMode!=='undefined' && runMode!=='classic') runMode='classic'; // v1.92.1 «Дом — это классика»: вышел в меню — сессия любой дисциплины закрыта, большая кнопка всегда ведёт домой
  screenName=name;
  $('startScreen').classList.toggle('hidden', name!=='menu');
  $('pauseScreen').classList.toggle('hidden', name!=='pause');
  $('hangarScreen').classList.toggle('hidden', name!=='hangar');
  $('achScreen').classList.toggle('hidden', name!=='ach');
  $('settingsScreen').classList.toggle('hidden', name!=='settings');
  $('diagScreen').classList.toggle('hidden', name!=='diag'); // v1.66.3: сервисный центр — свой экран
  $('modesScreen').classList.toggle('hidden', name!=='modes');
  $('forgeScreen').classList.toggle('hidden', name!=='forge'); // v1.68.0: конструктор трассы
  // v1.282.7: _fSkyRun нигде не сбрасывался обратно в false — однажды запущенный
  // (forgeSkyKick при первом входе в Кузницу) requestAnimationFrame-цикл превью-неба крутился
  // БЕСКОНЕЧНО до конца всей сессии, даже часы спустя, соревнуясь за кадр с настоящей игрой.
  if(name!=='forge' && typeof _fSkyRun!=='undefined' && _fSkyRun) _fSkyRun=false;
  $('cardScreen').classList.toggle('hidden', name!=='card'); // v1.73.0: карточка для скриншота
  $('gameOverScreen').classList.toggle('hidden', name!=='over');
  const inGame = (name==='game'||name==='pause');
  document.body.classList.toggle('flying', inGame); // v1.108.1: зум/жесты блокируются только тут, не везде
  $('hud').classList.toggle('hidden', name!=='game');
  $('topHud').classList.toggle('hidden', !inGame); // v1.46.0: верхняя панель одним рядом
  $('telemHud').classList.toggle('hidden', !inGame); // v1.67.0: нативная шапка — телеметрия одной строкой под счётом
  $('pauseBtn').classList.toggle('hidden', name!=='game');
  $('dim').classList.toggle('on', name==='pause');
  setBack(name!=='menu');
  // v1.280.0: та же видимость, что у собственной кнопки настроек экрана — Меню и Пауза, нигде больше
  if (tg && tg.SettingsButton && tgv('6.10')){
    try{ (name==='menu'||name==='pause') ? tg.SettingsButton.show() : tg.SettingsButton.hide(); }catch(e){}
  }
  hideMain(); // v1.62.0: нативная кнопка убрана — у каждого экрана есть своя
  if(name==='menu' && typeof achClaimMaybe==='function') achClaimMaybe(); // карман наград: праздник при возврате в меню
  // v1.103.0 «Тихий нуль»: пульс диода — только пока открыты настройки; ушёл — лампа спит
  if(name==='settings'){ calLampUpdate(); if(!calLampT) calLampT=setInterval(calLampUpdate,1000); }
  else if(calLampT){ clearInterval(calLampT); calLampT=null; }
  if(name==='settings') accFill(); // ленивый монтаж виджета входа: сторонний скрипт не летит при загрузке игры (v1.51.0)
  if(typeof duelBanner==='function') duelBanner(); // дуэль: плашка в меню, планка в HUD — по текущему экрану
}

/* ---------- Потоки ---------- */
/* ---------- Режимы забега (v1.42.0 «Пять дисциплин») ---------- */
let runMode='classic'; // v1.92.1 «Дом — это классика»: выбранная дисциплина — сессия, не прописка; дом всегда просыпается классикой (как PLAY у Geometry Dash)
let theaterDay='';      // v1.94.0 «Театр призраков» Т1: день, чьё небо стоит на сцене
let theaterTrack=null;  // лента твоего прыжка ({xs,ys,ds} — призраковый формат), живёт до конца сессии
let theaterChamp=null;  // v1.100.1 «Трибуна чемпиона»: {name,skin} гостя на сцене — null, когда идёт твой собственный повтор
let champTrack=null;    // v1.100.1: лента чемпиона — отдельный моток: твой билет (theaterTrack) спектакль не съедает
Store.del('runMode'); // v1.92.1: старая прописка любой дисциплины снимается — большая кнопка священна
Store.del('pact'); // v1.70.0: модификаторы удалённого режима больше не нужны
function setRunMode(m){ runMode=m; } // v1.92.1: сессия — живёт через «Ещё раз?» и рестарт из паузы, умирает в меню и на перезапуске
function runStart(){ if(window.amplitude) amplitude.track('Started Flight', {mode:runMode||'classic'}); runMode==='bullet'?startBullet():startGame(); } // «ЛЕТЕТЬ» — в выбранной дисциплине
window.addEventListener('pointerdown', function tgImmKick(){ // полный экран просит жест — первый тап добирает, если автостарт не смог (v1.58.0)
  if (S.running && typeof tgImmersion==='function') tgImmersion(true);
  window.removeEventListener('pointerdown', tgImmKick);
});
function modesFill(){ // подписи + отметка выбранного режима
  $('modesTitle').textContent=L.modes;
  const put=(id,n,d)=>{ $(id).innerHTML='<span class="modeName">'+n+'</span><span class="modeDesc">'+d+'</span>'; };
  const tk=todayKey();
  const dr=Store.get('dailyRun',null), dl=!!(dr&&dr.d===tk&&dr.done); // v1.93 «Одна попытка»: дверь закрыта до полуночи — с тёплой табличкой
  put('modeDaily',L.modeDaily, dl?L.dailyLocked(dr.s|0):L.modeDailyD+' · '+tk.slice(8)+'.'+tk.slice(5,7)+' · '+L.dailyOnce);
  $('modeDaily').classList.toggle('locked',dl);
  put('modeBullet',L.bullet,L.modeBulletD); // v1.45.0 «Для Про»: Классика — на большой кнопке «Начать полёт», здесь только дисциплины
  put('modeSpeedrun',L.modeSpeedrun,L.modeSpeedrunD);
  const fl=Store.get('forgeLast',null); // v1.90.0: дверь помнит гостя — трасса ждёт за ней по имени (как последний курс в Course World)
  put('modeForge',L.modeForge,L.modeForgeD+(fl&&fl.n?' · «'+fl.n+'»':''));
  const sel={daily:'modeDaily',bullet:'modeBullet',speedrun:'modeSpeedrun'};
  for (const k in sel) $(sel[k]).classList.toggle('sel', k===runMode);
}
function runPassFill(){ // паспорт забега: режим, время, удары, бонусы, плавность
  const el=$('runPass'); if(!el) return;
  const names={classic:L.modeClassic,bullet:L.bullet,speedrun:L.modeSpeedrun,daily:L.modeDaily,custom:L.modeForge}; // v1.68.0: + своя трасса
  const pills=[names[S.mode||'classic'], L.passTime+' '+fmtTime(S.time), L.passHits+' '+S.hits,
    L.passBonus+' '+S.bonuses, L.passSmooth+' '+Math.round(S.smooth*100)+'%'];
  el.innerHTML=pills.map(p=>'<span class="passPill">'+p+'</span>').join('');
}
function startGame(saved){
  if (saved && saved.mode==='daily') runMode='daily'; // v1.93 «Одна попытка»: крах не жжёт попытку — автосейв дня возвращает ровно в тот же прыжок
  audio(); keepAwake();
  const freshSeed = Math.floor(Math.random()*4294967296); // v1.280.0: чеканится один раз за забег — источник для Классики/Bullet ниже
  mapRNG = runMode==='daily' ? dailyRNG()
    : runMode==='theater' ? keyRNG(theaterDay||todayKey())
    : runMode==='speedrun' ? keyRNG(todayKey()+'·speedrun') // v1.108.1 «Честный жар»: свой поток на день, как у Трассы дня — время сравнимо между попытками и между игроками
    : runMode==='custom' && typeof forgeCfgGet==='function' ? keyRNG(String(forgeCfgGet().seed||0)) // v1.108.1: тот же код друга — та же расстановка, не только те же настройки
    : keyRNG(String(freshSeed)); // v1.280.0 «Честная Классика»: свой сид каждый забег — раньше был голый Math.random(), из которого нечего восстановить; призрак теперь может унести этот сид и показать те же самые препятствия при просмотре/гонке
  if (typeof gyroKick==='function' && typeof tgPkt==='number' && tgPkt===0) gyroKick(); // мост мог заглохнуть при загрузке — перезапуск по жесту «играть» (идемпотентно)
  if (typeof calReset==='function') calReset(false); else { input.baseG=null; input.baseB=null; } // автокалибровка нуля на старте — из неподвижной позы (v1.4.5)
  input.tiltX=0; input.tiltY=0; // сброс low-pass — не тянет из меню
  tDown=false; tActive=false; input.touchX=null; input.touchY=null; // залипший жест (пропавший touchend в WebView) не паркует самолётик и не глушит гироскоп
  if (typeof echoReset==='function') echoReset(); // эхо-шлейф Призрака: чистый забег
  if (typeof graceReset==='function') graceReset(); // v1.108.1: новый забег — новый счёт благодати, лимит не переносится из прошлого полёта
  Object.assign(S,{running:true,paused:false,score:0,mission:1,lives:3,invuln:1.5,speed:3.4,dist:0,
    combo:0,comboMax:0,starsCollected:0,shield:0,magnet:0,slowmo:0,dash:0,time:0,flash:0,shake:0,hueShift:0,timeScale:1,dying:0,dyingT:0,pausing:0, // v1.40.0: Таран и часы полёта — с чистого листа
    gyroSec:0,manSec:0,touchSec:0,keysSec:0,smooth:1,bullet:false,bt:0,mode:runMode,hits:0,bonuses:0,srWin:0,seed:freshSeed, // v1.280.0: сид этого забега — призрак унесёт его с собой; touchSec/keysSec — честная категория, не тонут в общем manSec
    mapWin:0,customName:'',customE:0,customD:1,customS:1,customL:0,customW:1,customFlat:0,customB:2}); // v1.42.0: дисциплина и паспорт — с чистого листа; v1.68.0/v1.69.0: трасса — тоже
  if(typeof BB!=='undefined') BB.log('takeoff', String(runMode||'')); // v1.99.7 «Чёрный ящик»: взлёт — на ленту
  prevTiltX=0; prevTiltY=0; prevTX=null; prevTY=null; lastSmoothShown=-1; // Smooth Flight: чистый замер
  S.dailyDay = runMode==='theater' ? theaterDay : (runMode==='daily' ? (saved&&saved.dailyDay ? saved.dailyDay : todayKey()) : ''); // v1.93 «Одна попытка»: прыжок принадлежит дню взлёта — даже через полночь; v1.94.0: театр помнит день спектакля
  if (runMode==='daily' && !saved) Store.set('dailyRun',{d:S.dailyDay,fly:1}); // взлёт = попытка; печать дня поставлена
  if (runMode==='custom' && typeof forgeCfgGet==='function'){ // Своя трасса: конфиг автора на борт (v1.68.0, v1.69.0 — полная палуба)
    const fc=forgeCfgGet();
    const am=(typeof Adaptive!=='undefined')?Adaptive.mult():{d:1,s:1}; // v1.108.1 «Мозг неба»: множитель поверх авторских настроек, не вместо них
    S.customE=fc.e; S.customD=forgeDensityMul(fc.d)*am.d; S.customS=forgeSpeedMul(fc.s)*am.s; S.customL=fc.l; S.customName=fc.n||L.forgeDefName;
    S.customW=fc.w; S.customFlat=fc.fl; S.customB=fc.b; S.customLv=fc.lv; // потолок жизней автора — бонус-жизнь его не пробьёт (v1.70.0)
    if(!saved){ S.lives=fc.lv; S.mission=fc.w; } // жизни и жара автора (автосейв честнее — не переписываем)
    S.hueShift=fc.sky; // небо автора: сдвиг оттенка стартует с его палитры
    const fogEl=document.getElementById('fog');
    if(fogEl){ fogEl.classList.toggle('f1',fc.fog===1); fogEl.classList.toggle('f2',fc.fog===2); }
  } else { const fogEl=document.getElementById('fog'); if(fogEl){ fogEl.classList.remove('f1'); fogEl.classList.remove('f2'); } }
  rec=[]; recFrame=0; if (typeof morseArm==='function') morseArm(); // морзянка: позывной в шлейфе
  if (typeof goldReset==='function') goldReset(); // v1.100.2 «Золотая звезда дня»: маяк переставлен на этот взлёт (своим кубиком дня)
  if (!saved && typeof planetReset==='function') planetReset(); // v1.106.0: отметины тысяч — с чистого забега (страж П5: вторая попытка молчала до прошлого максимума)
  if (typeof morseDayCheck==='function') morseDayCheck(); // виброэфир: первый полёт дня (v1.54.0) // v1.87.0: призрак рекорда со старта убран — мотиваций хватает без тени
  if (typeof streakDayCheck==='function') streakDayCheck(); // v1.108.1: серия дней — тот же момент, тот же принцип
  if (runMode==='theater'){ // v1.94.0 «Театр призраков» Т1: на сцене — твоя лента дня; теней нет, зритель смотрит сам самолётик
    ghost=(theaterChamp&&champTrack)?champTrack:theaterTrack; ghostIdx=0; ghostOn=false; ghostFade=0; ghostA=0; ghostTagT=0; ghostForeign=false; ghostName='';
    if (theaterChamp){ ghostForeign=true; ghostName=theaterChamp.name; ghostSkin=theaterChamp.skin; } // v1.100.1 «Трибуна чемпиона»: гость назван по имени и одет в свой скин
    else ghostSkin=-1; }
  else if (typeof ghostLoad==='function') ghostLoad(); // v1.280.0 «Воскрешение»: определена с самого начала, но никогда не звалась — «Призрак из топа» и свой рекорд первых 7 игр молчали физически, не из-за сида
  if(saved){ // восстановление автосейва (Блок 8)
    S.score=saneNumber(saved.score,0); S.mission=saneNumber(saved.mission,1);
    S.lives=clamp(saneNumber(saved.lives,3),1,3); S.dist=saneNumber(saved.dist,0);
    S.starsCollected=saneNumber(saved.starsCollected,0);
    S.comboMax=saneNumber(saved.comboMax,0); S.hueShift=saneNumber(saved.hueShift,0);
  }
  for(const o of obstacles)poolOb.give(o); obstacles=[];
  for(const s of stars)poolStar.give(s); stars=[];
  for(const p of powerups)poolPow.give(p); powerups=[];
  for(const p of particles)poolPart.give(p); particles=[];
  for(const p of popups)poolPop.give(p); popups=[];
  plane.x=W/2; plane.y=H*.72; plane.vx=0; plane.vy=0;
  spawnT=.8; starT=.4; powT=6; lastScoreShown=-1; lastDistShown=-1; // v1.36.0: первая подмога раньше — небо сразу показывает, что делится
  updateLives(); updateCombo(); updateStarsHud();
  setScreen('game');
  if (typeof tgImmersion==='function') tgImmersion(true); // погружение: полный экран + замок + защита (v1.58.0)
  $('modeHud').classList.toggle('hidden', !(runMode==='speedrun'||runMode==='daily'||runMode==='custom'||runMode==='theater')); // HUD дисциплины (v1.42.0/v1.47.0/v1.68.0/v1.94.0; v1.70.0: Пакт удалён)
  $('modeHud')._t=0; // новый забег — табло дисциплины пересобирается (v1.43.0)
  sfx.launch(SKINS[S.skin]||SKINS[0]); // фирменный аккорд скина (или обычный старт); v1.87.0: баннер «Добро пожаловать» убран — каждый забег он был лишним
  music.start('game'); // адаптивный полёт: дрон сразу, слои — по волнам/жизням
  engine.start(); // голос самолётика: шелест следует за скоростью
  if (runMode!=='theater'){ Stats.games++; saveStats(); } // v1.70.0: разведки Пакта больше нет — каждый старт считается; v1.94.0: просмотр в театре — не забег, счётчик молчит
  Store.del('savedRun');
}
function startBullet(){ // отдельный режим: каждый near-miss замедляет мир до 0.4 на 0.5с
  startGame(); S.bullet=true; // v1.280.0: свой сид уже честно поставлен внутри startGame() — раньше эта строка тут же его затирала обратно на голый Math.random()
  Stats.bulletRuns++; saveStats(); // профиль: счётчик забегов Bullet Time
  showBanner(L.bullet);
}
function retryRun(){ runMode==='bullet'?startBullet():startGame(); } // «ЕЩЁ РАЗ» — в той же дисциплине (v1.42.0)
function gameOver(){
  S.running=false; S.paused=false; S.dying=0; S.pausing=0; // «Склейка»: все занавесы закрыты
  releaseAwake();
  if(typeof BB!=='undefined') BB.log('landing','score '+Math.floor(S.score)+' · '+S.mode); // v1.99.7 «Чёрный ящик»
  if (typeof playSecFlush==='function') playSecFlush(); // v1.66.1: секунды неба — в хранилище разом, не по одной
  if (typeof tgImmersion==='function') tgImmersion(false); // забег кончился — защита от свайпа больше не нужна (v1.58.0)
  const sc=Math.floor(S.score*(0.5+S.smooth*0.5)); // Smooth Flight: итог × плавность (0.75..1.0)
  if (S.mode==='custom' && typeof mapOver==='function'){ // Своя трасса: не в зачёт — иначе лёгкие карты стали бы фермой звёзд (v1.68.0); v1.94.0: театр здесь не ставится — занавес опущен
    if (typeof Adaptive!=='undefined') Adaptive.onDeath(S.time, S.lastHitKind); // v1.108.1 «Мозг неба»: тот же момент, что уже шлёт анонимную телеметрию — здесь только локально, для подстройки
    theaterTrack=null; $('watchBtn').classList.add('hidden'); mapOver(sc); return;
  }
  const mode=controlMode(); // категория управления: gyro / touch / keys
  const cat=S.bullet?'bullet':mode; // v1.280.0: категория забега для всего, что касается призраков — Bullet не выражается через controlMode()
  const modeKey=S.bullet?'bestBullet':(mode==='gyro'?'bestGyro':(mode==='keys'?'bestKeys':'bestTouch')); // v1.280.0: добавлена ветка keys
  const prevCat=saneNumber(Store.get(modeKey,0),0);
  const isRecord = sc>prevCat && sc>0;
  const ghostBeatNow=!!(typeof ghostForeign!=='undefined' && ghostForeign && foreignFrom==='top' &&
    ghostPid>0 && ghostCat && cat===ghostCat && ghostBest>0 && sc>ghostBest); // призрачная месть: призрак из топа, та же категория, счёт выше его планки — v1.280.0: сравниваем с cat (Bullet больше не исключение)
  if (isRecord){ Store.set(modeKey,sc); haptic('success'); if (typeof confetti==='function') confetti(); // вау-момент
    setTimeout(()=>{ if (typeof hapticMorse==='function') hapticMorse(myCallsign()); },950); // виброэфир: позывной «передан в эфир» (v1.54.0)
    if (typeof ghostSave==='function') ghostSave(); } // призрак: траектория рекордного забега — v1.280.0: Bullet больше не исключение
  if (isRecord && prevCat>0) Stats.recBeats=(Stats.recBeats||0)+1; // побит СУЩЕСТВУЮЩИЙ рекорд категории (первый зачёт — не в счёт)
  if (sc>S.best){ S.best=sc; Store.set('best',sc); } // общий максимум — для HUD и меню
  const distM=Math.floor(S.dist); // чистый пробег: без бонусов, единый для всех режимов
  const prevDist=saneNumber(Store.get('bestDist',0),0);
  const isDistRecord = distM>prevDist && distM>0;
  if (isDistRecord){ Store.set('bestDist',distM); if (!isRecord) haptic('success'); }
  let srNewBest=false; // Спидран: рекорд — лучшее время до цели (v1.42.0)
  if (S.mode==='speedrun' && S.srWin){
    const prevSr=saneNumber(Store.get('srBest',0),0);
    if (!prevSr || S.time<prevSr){ Store.set('srBest',S.time); srNewBest=true; }
  }
  S.wallet += S.starsCollected;
  Store.set('wallet', S.wallet);
  if (ghostBeatNow) Stats.ghostBeats=(Stats.ghostBeats||0)+1; // сколько чужих призраков повержено (ачивка gv1)
  Stats.deaths++; Stats.totalStars+=S.starsCollected;
  Stats.totalDist+=distM; // профиль: суммарная дистанция — база космической шкалы
  if(S.comboMax>Stats.bestCombo)Stats.bestCombo=S.comboMax;
  if(S.mission>Stats.bestWave)Stats.bestWave=S.mission;
  if(S.smooth>=0.99)Stats.perfectRuns++;
  if(S.bullet)Stats.bGames++; else if(mode==='gyro')Stats.gGames++; else if(mode==='keys')Stats.kGames++; else Stats.tGames++;
  if(distM===42)Stats.e42=1; if(sc>9000)Stats.e9000=1; if(sc===1337)Stats.e1337=1; // пасхалки
  saveStats();
  Store.del('savedRun');
  $('myRank').textContent=''; // ранг прошлого забега не течёт в этот
  webJoinFill(); // гость видит мостик: «войди — и полёт в общей таблице» (v1.51.0)
  $('finalScore').textContent=sc; // синхронно финал — для мгновенного отображения и тестов
  const sg=++scoreCountGen, fsEl=$('finalScore'), t0=performance.now(); // count-up 0→sc за 0.8s
  requestAnimationFrame(function tick(now){
    if(sg!==scoreCountGen || screenName!=='over') return; // устаревший цикл молчит
    const k=Math.min(1,(now-t0)/800);
    fsEl.textContent=String(Math.round(sc*(1-Math.pow(1-k,3)))); // easeOutCubic
    if(k<1) requestAnimationFrame(tick);
  });
  // рекорды — золотые плашки в ряд с иконками категорий (не строки текста)
  const recChips=[];
  if (isRecord) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic(S.bullet?'timer':(mode==='gyro'?'phone':(mode==='keys'?'keys':'hand')))+
    (S.bullet?L.recordBullet:(mode==='gyro'?L.recordGyro:(mode==='keys'?L.recordKeys:L.recordTouch)))+'</span>');
  if (isDistRecord) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('ruler')+L.recordDist+'</span>');
  if (S.mode==='speedrun' && S.srWin) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('timer')+(srNewBest?L.srNewBest:L.srFinish)+' '+fmtTime(S.time)+'</span>');
  if (S.mode==='daily' && sc>0){ // рекорд трассы дня (v1.47.0): свой день — свой рекорд; v1.93: зачёт — в день взлёта, даже через полночь
    const dd=S.dailyDay||todayKey();
    const prevDl=Store.get('dailyBest',null), prevDlSc=(prevDl && prevDl.d===dd)?prevDl.s:0;
    if (sc>prevDlSc){ Store.set('dailyBest',{d:dd,s:sc});
      recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('plane')+L.dlNewBest+'</span>'); }
  }
  if (S.mode==='daily'){ Store.set('dailyRun',{d:S.dailyDay||todayKey(),s:sc,done:1}); runMode='classic'; } // v1.93 «Одна попытка»: попытка сгорела — сессия закрыта, «Ещё раз?» — уже тренировка классикой
  if (ghostBeatNow) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('ghost')+' '+L.ghostBeat(ghostName,sc,ghostBest)+'</span>');
  // v1.108.1 «Пасхалки заговорили»: e42/e9000/e1337 взводились в Stats и молчали — теперь есть момент
  if (distM===42) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg42+'</span>');
  if (sc>9000) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg9000+'</span>');
  if (sc===1337) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg1337+'</span>');
  $('newRecord').innerHTML = recChips.join('');
  if (typeof cardCapture==='function') cardCapture(sc,{rec:isRecord||srNewBest}); // v1.73.0: карточка для скриншота — данные итога на борт
  const cardBtnEl=$('cardBtn'); if(cardBtnEl) cardBtnEl.classList.remove('hidden'); // v1.282.10: настоящий забег — кнопка снова видна, если Театр её прятал раньше в этой сессии
  $('toRecord').textContent = (!isRecord && sc>0 && prevCat>sc) ? L.toRecord+(prevCat-sc) : ''; // мотивация: сколько не хватило
  const nl=(typeof achNextLoc==='function')?achNextLoc():null; // космическая шкала: «До Луны: 200 м»
  $('toLoc').textContent = nl ? L.toLoc(aT(nl).n, fmtN(nl.need-Stats.totalDist)) : '';
  if (typeof achCheck==='function') achCheck(); // достижения: проверка после забега
  const dl=duelGet();
  const duelWinNow=!!(dl && distM>dl.best); // победа в дуэли — сервер оповестит вызвавшего (проверит по своим данным)
  const syncExtra={};
  if (duelWinNow) syncExtra.duel_win=dl.pid;
  if (ghostBeatNow){ syncExtra.ghost_beat=ghostPid; syncExtra.ghost_cat=ghostCat; } // сервер сам сверит свежий рекорд с его планкой
  if (typeof syncSubmit==='function') syncSubmit(syncLocalScores(), Object.keys(syncExtra).length?syncExtra:undefined); // честная таблица: локальные рекорды → сервер (тихо)
  // призрак рекорда — в топ: трек + мой скин (все живые категории, включая Bullet — v1.280.0; шеринг включён; тихо, как таблица)
  const trackForGhost = (rec.length>=20 && typeof ghostPack==='function') ? ghostPack(rec) : null;
  if (isRecord && trackForGhost && Store.get('shareGhost',1) && typeof syncGhostUp==='function')
    syncGhostUp({category:cat, track:trackForGhost, skin:S.skin, best:sc, seed:S.seed});
  // v1.280.0 «Хартия»: дистанция — тоже честная категория с призраком, отдельно от того, каким способом её пролетели
  if (isDistRecord && trackForGhost && Store.get('shareGhost',1) && typeof syncGhostUp==='function')
    syncGhostUp({category:'dist', track:trackForGhost, skin:S.skin, best:distM, seed:S.seed});
  // v1.100.1 «Трибуна чемпиона»: прыжок дня уходит в зал — результат всегда, лента (коридорные координаты) — если призраки не скрыты
  if (S.mode==='daily' && sc>0 && rec.length>=20 &&
    typeof syncDailySubmit==='function' && typeof ghostPackDaily==='function')
    syncDailySubmit({ day:S.dailyDay||todayKey(), score:sc, skin:S.skin, star:!!S.goldStar,
      track: Store.get('shareGhost',1) ? ghostPackDaily() : undefined });
  // живой ранг: своё место в мире (только Telegram; прилетит асинхронно, экран не ждёт)
  if (typeof syncTop==='function' && syncAvailable()){
    const rankCat=cat; // v1.280.0: та же категория, что и везде — раньше здесь отдельно повторялась своя логика, включая пропущенную ветку keys
    syncTop(rankCat).then(d=>{
      if(!d||!d.ok||!d.me||!d.me.rank) return;
      const rank=d.me.rank;
      // v1.282.5: раньше здесь жил Stats.topBest + achCheck() — «питает ачивки t1–t3»,
      // но реестр ACH таких ачивок не содержит уже давно (тот же класс осколка, что
      // v1.108.1 уже чинил строкой выше по файлу для других мест). topBest нигде
      // больше не читался — чистый мёртвый груз в Store. Сам виброэфир топ-10 жив,
      // ему это не было нужно.
      if(rank<=10 && !isRecord && typeof hapticMorse==='function')
        setTimeout(()=>hapticMorse(myCallsign()),1100); // виброэфир: аплодисменты топ-10 (v1.54.0)
      if(screenName==='over'){ const rl=$('myRank'); if(rl) rl.textContent=L.rankWorld(rank); }
    });
  }
  // дуэль: сравнение чистого пробега с планкой друга (любой забег участвует)
  if (dl){
    const win = duelWinNow;
    if (win){
      Stats.duelsWon=(Stats.duelsWon||0)+1; saveStats();
      $('duelRes').innerHTML='<span class="duelWin">'+L.duelWin(dl.name,dl.best)+'</span>';
      duelSet(null); // вызов закрыт победой
      if (typeof achCheck==='function') achCheck(); // «Победитель дуэли»
    } else {
      $('duelRes').innerHTML='<span class="duelLose">'+L.duelLose(dl.name,dl.best)+'</span>';
    }
    haptic(win?'success':'light');
  } else $('duelRes').innerHTML='';
  $('duelBtn').classList.remove('hidden'); // «Вызов» виден всегда: вне Telegram тап объяснит, как его включить
  if (typeof starStatusGate==='function') starStatusGate(isRecord||isDistRecord); // v1.98.0 «Звезда-статус»: рекорд → искра в статус (Premium, мост 8.0)
  // статы забега — сетка 2×2 метрик; под ней плашки: режим забега + рекорды категорий
  const statCell=(v,l)=>'<div class="statCell"><b>'+v+'</b><span>'+l+'</span></div>';
  const bestPill=(icn,v)=>'<span class="miniPill">'+ic(icn)+'<b>'+v+'</b></span>';
  $('stats').innerHTML =
    '<div class="statGrid rise" style="animation-delay:120ms">'+
      statCell(S.mission,L.missionLbl)+statCell(distM+' м',L.dist)+
      statCell(S.starsCollected,L.stars)+statCell('×'+S.comboMax,L.maxCombo)+
    '</div>'+
    '<div class="bestPills rise" style="animation-delay:200ms">'+
      '<span class="miniPill runMode">'+ic(S.bullet?'timer':(mode==='gyro'?'phone':(mode==='keys'?'keys':'hand')))+
        (S.bullet?L.bullet:(mode==='gyro'?L.modeGyro:(mode==='keys'?L.modeKeys:L.modeTouch)))+'</span>'+
      bestPill('phone',saneNumber(Store.get('bestGyro',0),0))+
      bestPill('hand',saneNumber(Store.get('bestTouch',0),0))+
      bestPill('keys',saneNumber(Store.get('bestKeys',0),0))+
      bestPill('timer',saneNumber(Store.get('bestBullet',0),0))+
      bestPill('ruler',saneNumber(Store.get('bestDist',0),0)+' м')+
    '</div>';
  runPassFill(); // паспорт забега (v1.42.0)
  tryOnRevert(); // примерка: забег окончен — возвращаем свой скин (нет «ЕЩЁ РАЗ» с чужим)
  music.sting(isRecord?'record':'death'); // кода: фанфары рекорда или три ноты вниз
  music.stop(2); // музыка полёта уходит, кода звучит поверх тишины
  engine.stop();
  // v1.11.0 «Ни одной лишней механики»: гостей больше нет — gfxHint вычеркнут (v1.27.0), совет стоит один
  $('overMore').classList.add('hidden'); $('overDetailsBtn').classList.remove('open'); // v1.84.0: спойлер каждый финиш свёрнут
  theaterTrack = (S.mode==='daily' && rec.length>=20)
    ? { xs:rec.map(r=>r[0]/91), ys:rec.map(r=>r[1]/91), ds:rec.map(r=>r[2]) }
    : null; // v1.94.0 «Театр призраков» Т1: билет снимается со свежего финиша — потом лента может уйти под новый забег
  if (theaterTrack) theaterDay=S.dailyDay||todayKey();
  theaterChamp=null; champTrack=null; // v1.100.1: свежий финиш — сцена снова твоя, гость уходит за кулисы до нового зова
  $('watchBtn').classList.toggle('hidden', !theaterTrack); // «Смотреть полёт» — только с билетом: честный забег дня с живой лентой
  $('tribuneBtn').classList.toggle('hidden', !theaterTrack || typeof syncDailyChampion!=='function' || !syncAvailable()); // «Трибуна чемпиона» — рядом с билетом: день завершён, можно смотреть мастера
  $('goldChip').classList.toggle('hidden', !(S.mode==='daily' && S.goldStar)); // v1.100.2: знак дня сияет рядом с рекордными плашками
  $('dayStats').classList.add('hidden'); // счётчик звезды прилетит асинхронно — экран не ждёт
  if (S.mode==='daily' && typeof syncDailyStats==='function' && syncAvailable())
    syncDailyStats(S.dailyDay||todayKey()).then(st=>{ // «сегодня её взяли N из M» — чувство живого мира без гонки
      if (st && st.ok && screenName==='over'){ $('dayStats').textContent=L.goldStarStats(st.catchers,st.flyers); $('dayStats').classList.remove('hidden'); } });
  setScreen('over');
  const f=$('flash'); f.style.transition='none'; f.style.opacity=.7;
  requestAnimationFrame(()=>{ f.style.transition='opacity .5s'; f.style.opacity=0; });
}
function pauseGame(){
  if(!S.running||S.paused||S.pausing||S.dying)return; // занавес смерти прерывать нельзя
  S.pausing=1; grantGrace(.6); // «Склейка»: мир замирает плавно, пока вплывает меню паузы — v1.108.1: через общий лимит
  releaseAwake(); autosave();
  music.duck(true); // пауза: музыка в фон, не обрываем
  engine.duck(true);
  setScreen('pause'); sfx.click(); haptic('light');
}
function resumeGame(){
  if(!S.paused&&!S.pausing)return;
  S.paused=false; S.pausing=0; grantGrace(.35); // «Склейка»: timeScale сам доползёт до 1 — плавный разгон — v1.108.1: через общий лимит
  keepAwake();
  music.duck(false);
  engine.duck(false);
  setScreen('game'); sfx.go(); // v1.87.0: и здесь — тихо, без баннера
}
function toMenu(){
  if(S.running){
    if (runMode==='theater'){ endTheater(); return; } // v1.94.0: «Меню» из театра — тихий занавес обратно на итоги, не в дом
    if (S.mode==='daily'){ // v1.93 «Одна попытка»: сошёл с трамплина — прыжок засчитан как есть, тихо, без экрана итогов
      const sc=Math.floor(S.score*(0.5+S.smooth*0.5)), dd=S.dailyDay||todayKey();
      const prevDl=Store.get('dailyBest',null);
      if (sc>0 && sc>((prevDl&&prevDl.d===dd)?prevDl.s:0)) Store.set('dailyBest',{d:dd,s:sc});
      Store.set('dailyRun',{d:dd,s:sc,done:1}); runMode='classic';
    }
    S.running=false; S.paused=false; S.dying=0; S.pausing=0; releaseAwake();
    if(typeof BB!=='undefined') BB.log('landing','menu exit · score '+Math.floor(S.score)); // v1.99.8: добровольный уход — тоже посадка на ленте
  }
  if (typeof tgImmersion==='function') tgImmersion(false); // в меню — без защиты закрытия (v1.58.0)
  tryOnRevert(); // бросил примерочный забег — примерка закончилась
  refreshMenu();
  setScreen('menu');
  music.start('menu'); // вернулись в меню — медленные пэды
  engine.stop(); // в меню самолётик молчит
}
function endTheater(){ // v1.94.0 «Театр призраков» Т1: занавес — спектакль кончился, возвращаемся на итоги; книги и касса не тронуты
  S.running=false; S.paused=false; S.dying=0; S.pausing=0; releaseAwake();
  if (typeof tgImmersion==='function') tgImmersion(false);
  runMode='classic'; // сессия снова чиста — дом просыпается классикой
  music.stop(1); engine.stop();
  // v1.282.10: карточка для скриншота не вызывается для Театра (cardCapture зовётся только из
  // gameOver/mapOver, эта функция — отдельный путь) — но сама кнопка «Карточка» на экране итогов
  // видна всегда, без разбора. Нажми её после спектакля — увидишь чужие/устаревшие данные от
  // последнего настоящего забега (или нули, если такого забега в этой сессии ещё не было),
  // будто это твой результат. Прячем кнопку именно для этого захода на итоги.
  const cb=$('cardBtn'); if(cb) cb.classList.add('hidden');
  setScreen('over');
}

/* v1.6.0 «Сразу в полёт»: любой запуск (кроме первого обучения и дуэльной ссылки) — сразу геймплей.
   Меню больше не парадное крыльцо, а чёрный ход через паузу. */
function bootFly(){
  const saved = Store.get('savedRun', null);
  startGame(saved || undefined); // автосейв — возвращаем ровно в тот же полёт
  grantGrace(2.5); // благодать на разгон: пара секунд сориентироваться в небе — v1.108.1: через общий лимит
}
function refreshMenu(){
  $('bestScore').textContent = S.best>0 ? L.best+': '+S.best : '';
  $('walletMenu').innerHTML = S.wallet>0 ? L.wallet+S.wallet : '';
  const bg=saneNumber(Store.get('bestGyro',0),0), bt=saneNumber(Store.get('bestTouch',0),0),
        bd=saneNumber(Store.get('bestDist',0),0), bb=saneNumber(Store.get('bestBullet',0),0);
  $('bpG').textContent=bg; $('bpT').textContent=bt; $('bpD').textContent=bd>0?bd+' м':'0'; $('bpB').textContent=bb;
  $('bestRow').classList.toggle('hidden', bg+bt+bd+bb===0);
  gridBalance($('menuRow')); // v1.45.0: «Продолжить полёт» убран — перезапуск сам возвращает в небо (bootFly), в сессии есть пауза // «Единая палуба»: сетка меню без одиноких половинок
  if (typeof duelBanner==='function') duelBanner(); // дуэль: плашка вызова в меню
}
function autosave(){
  if(S.running && runMode!=='theater'){ // v1.94.0: театр не оставляет автосейва — из просмотра не рождается «второй шанс»
    Store.set('savedRun',{score:S.score,mission:S.mission,lives:S.lives,dist:S.dist,
      starsCollected:S.starsCollected,comboMax:S.comboMax,hueShift:S.hueShift,mode:S.mode,dailyDay:S.dailyDay||''}); // v1.93: крах дня помнит дисциплину и день взлёта
  }
}

/* ---------- Настройки (звук, язык, гироскоп, помощь) ---------- */
let settingsFrom='menu'; // куда вернуться: меню или пауза
let langPref='auto';
function openSettings(from){ settingsFrom=from||'menu'; refreshGyroLock(); rowSw('setBeaconBtn', Store.get('beaconOn',1)===1); setScreen('settings'); gyroStatus(); setWellFill(); sfx.click(); } // v1.91.0: шёпот самочувствия — свежий при каждом входе // v1.45.0: замок гироскопа — свежий при каждом входе; v1.66.1: диагностика датчика — свежая при входе (в полёте она в DOM не пишется); v1.107.0: и выключатель почты — честный при входе
function closeSettings(){ setScreen(settingsFrom); sfx.click(); }
function rowV(btnId,val,on){ // v1.63.0: строка настроек «параметр — значение» (цикл-значения)
  const b=$(btnId); if(!b) return; const v=b.querySelector('.setV'); if(!v) return;
  v.textContent=val; v.classList.toggle('on',!!on);
}
function rowSw(btnId,on){ // v1.64.0: свитч — вкл/выкл движком, без слов
  const b=$(btnId); if(!b) return; const s=b.querySelector('.setSw'); if(!s) return;
  s.classList.toggle('on',!!on); s.setAttribute('aria-checked', on?'true':'false');
}
function setWellFill(){ // v1.91.0 «Настройки по полочкам»: закрытая группа шёпотом отвечает, как себя чувствует — чек-лист самочувствия, не склад
  const put=(id,t)=>{ const e=$(id); if(e) e.textContent=t; };
  const onN=(typeof MUTED!=='undefined'&&!MUTED?1:0)+(typeof MUSIC_ON!=='undefined'&&MUSIC_ON?1:0)+(typeof VIBRO!=='undefined'&&VIBRO?1:0)
    +((typeof morseOn==='function'&&morseOn())?1:0)+((typeof morseHapOn==='function'&&morseHapOn())?1:0);
  put('setGrpSoundSub', onN===5?L.setWellAll:(onN===0?L.setWellNone:L.setWellSome));
  if(typeof Q!=='undefined'){ const gfxT=(Q.mode==='auto'?L.gfxAuto:(Q.mode==='low'?L.gfxLow:(Q.mode==='med'?L.gfxMed:(Q.mode==='ultra'&&gfxUltraOk()?L.gfxUltra:L.gfxHigh))));
    put('setGrpGameSub', gfxT+' · ×'+input.sens); }
  put('setGrpProfSub', (typeof myCallsign==='function'?myCallsign():'')||L.csDefault);
}
function soundLabel(){ rowSw('setSoundBtn', !MUTED); setWellFill(); }
function langLabel(){ const names={ru:'Русский',en:'English',es:'Español',pt:'Português',fr:'Français'}; rowV('setLangBtn', langPref==='auto'?L.langAuto:(names[langPref]||langPref)); }
let langEff='ru'; // v1.108.1: активный язык наружу — единый источник для aT() и всего, что спросит «на каком языке мы сейчас»
function applyLangPref(){ // 'auto' → язык Telegram, иначе выбор игрока
  const base=LANG; // автоопределение уже посчитано в core.js
  const eff=langPref==='auto'?base:langPref;
  langEff=eff;
  L = I18N[eff];
  // v1.108.1 «Манифест говорит на своём языке»: паспорт приложения (имя/описание при установке)
  // подстраивается под тот же язык, что и сама игра — не только internal L. Новый язык интерфейса
  // добавляется тем же способом: файл manifest.XX.json + одна строка в MANIFEST_BY_LANG.
  const MANIFEST_BY_LANG={ru:'manifest.ru.json', en:'manifest.en.json', es:'manifest.es.json', pt:'manifest.pt.json', fr:'manifest.fr.json'};
  const mLink=document.getElementById('manifestLink');
  if(mLink) mLink.href=MANIFEST_BY_LANG[eff]||MANIFEST_BY_LANG.ru;
}

/* ---------- Ангар (Блок 4/7: магазин за внутриигровые ✦) ---------- */
/* Примерка: один забег в день с любым не купленным скином (UTC-дата в Store 'tryOn').
   Скин НЕ покупается и НЕ сохраняется — только S.skin на время забега;
   возврат — в gameOver (нет повторного «ЕЩЁ РАЗ») и toMenu (бросил забег). */
let tryOnId=null;
let scoreCountGen=0; // поколение анимации count-up счёта на итогах
function tryOnRevert(){
  if(tryOnId===null) return;
  tryOnId=null; S.skin=saneNumber(Store.get('skin',0),0); updateLives();
}
function tryOnSkin(sk){
  if(tryOnId!==null) return; // уже в примерке
  tryOnId=sk.id; Store.set('tryOn',todayKey()); // v1.108.1: локальный день игрока, как у Трассы дня — было UTC, рассинхрон на дальних часовых поясах
  S.skin=sk.id; // временно — Store 'skin' не трогаем
  toast(L.tryOnGo(L.skinNames[sk.name]),'rgba(127,216,255,.5)');
  haptic('light'); updateLives();
  startGame();
}
function renderHangar(){
  $('hangarWallet').innerHTML = L.wallet+S.wallet;
  const today=todayKey(); // v1.108.1: было UTC — теперь тот же «день игрока», что у Трассы дня
  const canTry=Store.get('tryOn','')!==today;
  const list=$('shipList'); list.innerHTML='';
  SKINS.forEach((sk,skI)=>{
    const owned = S.ownedSkins.includes(sk.id);
    const sel = S.skin===sk.id;
    const div=document.createElement('div');
    div.className='shipItem'+(sel?' sel':'');
    div.style.animationDelay=(Math.min(skI,10)*60)+'ms'; // каскад +60ms, потолок 600ms
    div.innerHTML='<canvas class="shipPv" width="96" height="72"></canvas>'+
      '<div class="nm">'+L.skinNames[sk.name]+(sk.fx?' <span class="fxTag">✦</span>':'')+'</div>'+
      (sel?'<div class="own">'+L.owned+'</div>':(owned?'<div class="own isOwn">'+ic('check')+'</div>':
        '<div class="pr">'+L.buy+sk.price+'</div>'+
        '<div class="try'+(canTry?'':' off')+'">'+(canTry?L.tryOn:L.tryOnWait)+'</div>'));
    // превью — мини-модель скина: та же отрисовка, что жизни в HUD (форма + цвета)
    const pv=div.querySelector('.shipPv').getContext('2d');
    pv.setTransform(2,0,0,2,0,0); pv.clearRect(0,0,48,36);
    pv.save(); pv.translate(24,20); pv.scale(.62,.62);
    pv.shadowColor=sk.glow; pv.shadowBlur=7;
    pv.fillStyle=sk.body;
    pv.beginPath(); pv.moveTo(0,-22); pv.lineTo(-16,14); pv.lineTo(0,6); pv.lineTo(16,14); pv.closePath(); pv.fill();
    pv.fillStyle=sk.fold;
    pv.beginPath(); pv.moveTo(0,-22); pv.lineTo(0,6); pv.lineTo(16,14); pv.closePath(); pv.fill();
    pv.shadowBlur=0; pv.strokeStyle='rgba(120,140,180,.5)'; pv.lineWidth=1.6;
    pv.beginPath(); pv.moveTo(0,-22); pv.lineTo(0,6); pv.stroke();
    pv.restore();
    div.addEventListener('click',()=>{
      if(sel) return;
      if(owned){ S.skin=sk.id; Store.set('skin',sk.id); sfx.click(); haptic('light'); renderHangar(); updateLives(); } // жизни-модельки — под новый скин
      else if(S.wallet>=sk.price){
        S.wallet-=sk.price; S.ownedSkins.push(sk.id); S.skin=sk.id;
        Store.set('wallet',S.wallet); Store.set('ownedSkins',S.ownedSkins); Store.set('skin',sk.id);
        sfx.buy(); haptic('success'); renderHangar(); refreshMenu(); updateLives(); // «кассовый» аккорд покупки
        if (typeof achCheck==='function') achCheck(); // достижения ангара (первый скин / вся коллекция)
      } else {
        toast(L.notEnough,'rgba(255,159,176,.5)'); haptic('error'); // тост виден поверх ангара
      }
    });
    const tryEl=div.querySelector('.try'); // клик по примерке — не по карточке (покупка)
    if(tryEl && canTry) tryEl.addEventListener('click',ev=>{ ev.stopPropagation(); tryOnSkin(sk); });
    list.appendChild(div);
  });
}

/* ---------- Шаринг (Блок 9) ---------- */
function shareTextFor(){ // гиро-гордость: забег на гироскопе — другой текст шаринга
  const b=Math.floor(S.best);
  return (S.gyroSec>S.manSec && S.gyroSec>3 && L.shareTextGyro) ? L.shareTextGyro(b) : L.shareText(b);
}
function shareScore(){
  const text=shareTextFor();
  const gameUrl='https://t.me/realcosmogrambot/app';
  const url='https://t.me/share/url?url='+encodeURIComponent(gameUrl)+'&text='+encodeURIComponent(text); // v1.96.0: дверь ведёт в игру, а не в пустой домен
  if(tg&&tg.openTelegramLink){ // внутри Telegram — родной диалог остаётся первым, ничего не меняем
    if(window.amplitude) amplitude.track('Shared Run', {method:'text', confirmed:false}); // v1.108.1: диалог Telegram открыт, доставку подтвердить нечем
    try{ tg.openTelegramLink(url); return; }catch(e){}
  }
  // v1.108.1 «Дверь пошире»: вне Telegram (веб-версия на GitHub Pages) раньше шли прямиком на
  // Telegram-ссылку — честно работает, но принудительно сужает выбор до одного мессенджера.
  // Системный лист ОС (WhatsApp/SMS/почта/что угодно) — то, чего здесь не хватало.
  if(navigator.share){
    if(window.amplitude) amplitude.track('Shared Run', {method:'webshare', confirmed:false}); // Promise молчит, какое приложение выбрал игрок — тот же честный предел, что у остальных каналов
    navigator.share({text:text, url:gameUrl}).catch(()=>{}); // отмена/отказ — тихо, ничего не ломаем
    return;
  }
  if(window.amplitude) amplitude.track('Shared Run', {method:'text', confirmed:false});
  window.open(url,'_blank');
}

/* ---------- Дуэль (вызов друга): побей верифицированный рекорд дистанции ----------
   Планка приходит с сервера (syncDuel) — цифры в ссылке нет, подделать нечего.
   Активный вызов хранится в Store (переживает перезапуск), закрывается победой или отказом. */
let DUEL=null;
function duelParse(sp){ const m=/^duel_(\d{1,15})$/.exec(String(sp||'')); return m?Number(m[1]):null; }
const DUEL_TTL_MS = 30*24*60*60*1000; // v1.108.1 «Срок годности вызова»: 30 дней — баннер раньше висел вечно,
  // даже если challenger давно не играет или сам факт вызова забылся; после этого срока вызов
  // тихо считается неактуальным и снимается сам, как будто истёк — не «отклонён», просто устарел.
function duelGet(){
  if(DUEL) return DUEL;
  const d=Store.get('duel',null);
  if(d && d.pid>0 && d.best>0){
    if(d.ts && (Date.now()-d.ts)>DUEL_TTL_MS){ Store.del('duel'); DUEL=null; return null; } // истёк — тихо снимаем, не ошибка
    DUEL=d;
  } else DUEL=null;
  return DUEL;
}
function duelSet(d){
  if(d) d={pid:Math.floor(d.pid), name:String(d.name||'Игрок').replace(/[<>&]/g,'').slice(0,64), best:Math.floor(d.best), ts:Date.now()};
  DUEL=d;
  if(d) Store.set('duel',d); else Store.del('duel');
  if(!d && foreignFrom==='duel') ghostSetForeign(null); // вызов закрыт — его призрак больше не ждёт старта
  duelBanner();
}
/* Д3 Склейка: призрак вызвавшего летит рядом, пока дуэль жива (раз в сессию; gyro-трек, нет — touch) */
let duelGhostTriedPid=0, foreignFrom=null; // foreignFrom: 'top' | 'duel' — чей призрак ждёт старта
function duelGhostFetch(){
  const dl=duelGet(); if(!dl || typeof syncGhostGet!=='function' || typeof ghostSetForeign!=='function') return;
  // v1.282.6: раньше флаг был один булев на всю сессию — вызов A получал попытку, а если его
  // заменял вызов B от ДРУГОГО человека (уже честно поддержанная замена — v1.108.1 «Настоящий
  // выбор»), попытка для B никогда не случалась: флаг уже израсходован на A. Привязка к pid
  // самого вызова — новый соперник снова получает шанс на призрака рядом.
  if (duelGhostTriedPid===dl.pid) return;
  duelGhostTriedPid=dl.pid;
  syncGhostGet(dl.pid,'gyro').then(g=>{ return (g && g.ok) ? g : syncGhostGet(dl.pid,'touch'); }).then(g=>{
    if (!duelGet()) return; // дуэль уже закрылась, пока летел ответ
    if (g && g.ok){ ghostSetForeign({track:g.track, skin:g.skin, name:dl.name}); foreignFrom='duel';
      toast(L.ghostWith(dl.name),'rgba(191,232,255,.45)'); }
  });
}
function duelBanner(){ // плашка вызова в меню + планка цели в HUD (по текущему экрану)
  const b=$('duelBanner'), d=duelGet();
  if(b){
    if(!d || screenName==='game'){ b.classList.add('hidden'); b.innerHTML=''; }
    else{
      b.innerHTML='<span class="duelTxt">'+L.duelBar(d.name, d.best)+'</span><button class="duelX" id="duelX">'+ic('x')+'</button>';
      b.classList.remove('hidden');
      $('duelX').addEventListener('click', ()=>{ duelSet(null); haptic('light'); toast(L.duelOff,'rgba(255,159,176,.5)'); });
    }
  }
  const h=$('duelHud');
  if(h){
    if(d && screenName==='game'){ h.textContent=L.duelHud(fmtN(d.best)); h.classList.remove('hidden'); }
    else h.classList.add('hidden');
  }
  if(d && typeof duelGhostFetch==='function') duelGhostFetch(); // склейка: призрак вызвавшего — рядом в забеге
}
function duelBoot(){ // deep-link ?startapp=duel_<pid>: забрать планку вызвавшего с сервера
  try{
    const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    const pid = duelParse(sp);
    if(!pid || (typeof syncMyId==='function' && pid===syncMyId())){ duelBanner(); return false; } // не вызов / сам себе
    syncDuel(pid).then(d=>{
      if(d && d.ok && d.best>0){
        // v1.108.1 «Настоящий выбор»: раньше новый вызов тихо стирал старый (потом — тихо с тостом
        // постфактум). Теперь — реальный вопрос игроку ДО замены, с правом отказаться и оставить
        // старый вызов как есть. Этот путь целиком живёт внутри Telegram (start_param не бывает
        // вне него) — значит tg.showConfirm() здесь родной, не чужеродный интерфейс поверх своего.
        const old=(typeof duelGet==='function')?duelGet():null;
        const apply=()=>{ duelSet({pid:pid, name:d.name, best:d.best}); haptic('success');
          if(typeof syncDuelAccept==='function') syncDuelAccept(pid); }; // v1.108.1: сервер узнаёт о смене — старый вызывающий получит уведомление, если был кто-то другой
        if(old && old.pid && old.pid!==pid && typeof L!=='undefined' && L.duelReplaceQ){
          const msg=L.duelReplaceQ(old.name||'', d.name||'');
          if(tg && typeof tg.showConfirm==='function'){
            tg.showConfirm(msg, ok=>{ if(ok) apply(); });
          } else if(typeof confirm==='function'){
            if(confirm(msg)) apply();
          } else apply(); // нет способа спросить — честнее применить, чем тихо потерять вызов
        } else apply();
      }
      else duelBanner();
    });
    return true; // v1.6.0: вызов ждёт баннера — этот запуск единственный начинается с меню
  }catch(e){ duelBanner(); return false; }
}

/* v1.7.0 «Точная настройка»: подсказка «телефон тянет больше» — авто-режим прижал красоту,
   а тир устройства средний/флагман и сыграно ≥5 игр; максимум 3 показа, клик — навсегда */
/* ---------- Системные события (Блок 1/8) ---------- */
// сторож звука (v1.20.0): первый жест в WebView ненадёжен — будим контекст на каждом тапе,
// а раз в 2 секунды проверяем, что музыка живёт там, где должна звучать. Лечит и «умерла
// после голосового/звонка», и «не проснулась с первого тапа» — на любом телефоне.
function audioKeep(){
  if (MUTED || !MUSIC_ON) return;
  audio(); // создание/пробуждение контекста — в жесте надёжнее всего
  if (S.running) music.start('game');
  else if (screenName==='menu') music.start('menu');
}
function onHidden(){ if(S.running&&!S.paused) pauseGame(); autosave(); if (typeof playSecFlush==='function') playSecFlush(); stopLoop(); } // v1.66.1: + секунды неба
function onShown(){ startLoop(); if(S.running&&!S.paused) keepAwake(); audioKeep(); }
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden') onHidden(); else onShown();
});
window.addEventListener('pagehide', autosave);
if (tg && tg.onEvent){
  try{
    tg.onEvent('deactivated', onHidden);
    tg.onEvent('activated', onShown);
  }catch(e){}
}

/* ---------- Привязка кнопок ---------- */
$('startBtn').addEventListener('click', runStart); // в выбранной дисциплине (v1.42.0)
$('retryBtn').addEventListener('click', retryRun);
$('watchBtn').addEventListener('click', ()=>{ // v1.94.0 «Театр призраков» Т1: смотрим свой прыжок дня на том самом небе
  if (!theaterTrack || screenName!=='over'){ haptic('light'); return; } // билет снят на финише забега дня — без него дверь не открывается
  theaterChamp=null; runMode='theater'; startGame(); haptic('light');
});
$('tribuneBtn').addEventListener('click', ()=>{ // v1.100.1 «Трибуна чемпиона»: спектакль — так сегодня летел лучший (только после твоей посадки, дверь сторожит сервер)
  if (!theaterTrack || screenName!=='over'){ haptic('light'); return; } // тот же билет: день должен быть завершён
  haptic('light');
  const day=S.dailyDay||todayKey();
  syncDailyChampion(day).then(r=>{
    if (screenName!=='over' || runMode==='theater') return; // зритель уже ушёл со сцены итогов
    if (!r || !r.ok){ toast(L.tribuneNone,'rgba(191,232,255,.45)'); return; } // мастер ещё не показал полёт (или скрыл его) — трибуна молчит, не врёт
    const g=ghostParse(r.champion.track);
    if (!g){ toast(L.tribuneNone,'rgba(191,232,255,.45)'); return; }
    g.cx=true; // лента чемпиона — в коридорных координатах: ghostStep положит её в мой коридор чести
    champTrack=g; theaterDay=day; // гость занимает свой моток — твой билет «Смотреть полёт» остаётся нетронутым
    theaterChamp={ name:r.champion.name||'', skin:r.champion.skin|0 };
    runMode='theater'; startGame();
  });
});
$('modesBtn').addEventListener('click', ()=>{ sfx.click(); haptic('light'); modesFill(); setScreen('modes'); });
$('modesBack').addEventListener('click', ()=>{ sfx.click(); setScreen('menu'); });
[['modeDaily','daily'],['modeBullet','bullet'],['modeSpeedrun','speedrun']].forEach(function(pair){
  $(pair[0]).addEventListener('click', ()=>{
    if (pair[1]==='daily'){ const dr=Store.get('dailyRun',null); if (dr&&dr.d===todayKey()&&dr.done){ haptic('light'); return; } } // v1.93: дверь закрыта до завтра — табличка на ней всё говорит
    setRunMode(pair[1]); sfx.click(); haptic('light'); runStart(); }); // тап = сразу полёт (v1.43.0)
});
$('modeForge').addEventListener('click', ()=>{ sfx.click(); haptic('light'); if(typeof forgeOpen==='function')forgeOpen(); setScreen('forge'); }); // v1.68.0: конструктор трассы
$('menuBtn').addEventListener('click', toMenu);
$('pauseBtn').addEventListener('click', pauseGame);
$('resumeBtn').addEventListener('click', resumeGame);
$('restartBtn').addEventListener('click', ()=>{ if(runMode==='daily'&&S.running){ gameOver(); } else runStart(); }); // рестарт из паузы — в той же дисциплине (v1.42.0); v1.93: прыжок не переигрывают — «рестарт» дня = сдача с честными итогами
$('pauseMenuBtn').addEventListener('click', toMenu);
$('settingsBtn').addEventListener('click', ()=>openSettings('menu'));
$('pauseSettingsBtn').addEventListener('click', ()=>openSettings('pause'));
$('settingsBackBtn').addEventListener('click', closeSettings);
/* v1.103.0 «Тихий нуль»: лампочка-диод дыхания компасов на строке калибровки.
   Зелёный — оба дышат; янтарь — один спит или молчит (наклон рулит, запаса нет);
   красный — датчик молчит, руль только пальцем. Пульс — раз в секунду и только
   на экране настроек: в полёте лампа спит, цена на скорость — ноль. */
let calLampT=null;
function calLampUpdate(){
  const l=$('calLamp'); if(!l) return;
  const alive=(typeof chanAlive==='function')?chanAlive:null;
  const tg=!!(alive&&alive('tg')), web=!!(alive&&alive('web'));
  const st=(tg&&web)?'green':((tg||web)?'amber':'red');
  l.dataset.state=st;
  l.title=(st==='green'?L.lampGreen:(st==='amber'?L.lampAmber:L.lampRed));
}
$('setCalibBtn').addEventListener('click', calibrateTilt);
$('setSoundBtn').addEventListener('click', ()=>{
  MUTED=!MUTED; Store.set('muted',MUTED?1:0); soundLabel(); haptic('light'); if(!MUTED) sfx.click();
  if(MUTED){ music.stop(.3); engine.stop(); } // звук выключен — молчит всё
  else { if(MUSIC_ON) music.start(screenName==='game'?'game':'menu'); if(S.running&&!S.paused) engine.start(); }
});
function musicLabel(){ rowSw('setMusicBtn', MUSIC_ON); setWellFill(); }
function contrastLabel(){ rowSw('setContrastBtn', CONTRAST); }
function colorblindLabel(){ rowSw('setColorblindBtn', COLORBLIND); }
function streaksLabel(){ rowSw('setStreaksBtn', SPEED_STREAKS); }
function canvasFilterSync(){ // v1.280.0: класс на самом canvas — оба фильтра независимы, могут стоять вместе
  const cv=$('game'); if(!cv) return;
  cv.classList.toggle('hc', CONTRAST);
  cv.classList.toggle('cb', COLORBLIND);
}
$('setContrastBtn').addEventListener('click', ()=>{
  CONTRAST=!CONTRAST; Store.set('contrast',CONTRAST?1:0); contrastLabel(); canvasFilterSync(); haptic('light'); sfx.click();
});
$('setColorblindBtn').addEventListener('click', ()=>{
  COLORBLIND=!COLORBLIND; Store.set('colorblind',COLORBLIND?1:0); colorblindLabel(); canvasFilterSync(); haptic('light'); sfx.click();
});
$('setStreaksBtn').addEventListener('click', ()=>{
  SPEED_STREAKS=!SPEED_STREAKS; Store.set('speedStreaks',SPEED_STREAKS?1:0); streaksLabel(); haptic('light'); sfx.click();
});
$('setMusicBtn').addEventListener('click', ()=>{
  MUSIC_ON=!MUSIC_ON; Store.set('music',MUSIC_ON?1:0); musicLabel(); haptic('light'); sfx.click();
  if(!MUSIC_ON) music.stop(.3);
  else music.start(screenName==='game'?'game':'menu'); // включили — играем там, где находимся
});
$('setLangBtn').addEventListener('click', ()=>{
  const order=['auto','ru','en','es','pt','fr']; // v1.108.1: добавляются языки по мере перевода
  langPref=order[(order.indexOf(langPref)+1)%order.length];
  Store.set('lang',langPref); applyLangPref(); applyLang(); refreshMenu(); langLabel(); sfx.click();
});
$('diagBtn').addEventListener('click', ()=>{ // v1.66.3: сервисный центр — отдельный экран, не спойлер
  setScreen('diag'); diagLastT=0; diagBuild(); gyroStatus(); // свежие галочки и строка датчика на входе
  haptic('light'); sfx.click();
});
$('diagBackBtn').addEventListener('click', ()=>{ setScreen('settings'); sfx.click(); });
// --- «Сервисный центр» (v1.5.3): игра сама ставит диагноз и предлагает лекарство из готовых инструментов ---
function diagRows(){
  const R=[]; const now=performance.now();
  const fresh=Math.max(input._t||0, (typeof tgOrientLast==='number'?tgOrientLast:0));
  const alive=(typeof lastGamma!=='undefined' && lastGamma!=null) && (now-fresh)<1500;
  if (!HAS_GYRO) R.push({st:'info', txt:L.diagNoSensor});
  else if (alive) R.push({st:'ok', txt:L.diagSensorOk+(gyroSrc==='tg'?L.diagChanTg:L.diagChanWeb)});
  else R.push({st:'warn', txt:L.diagSensorDead, fix:L.diagFixSensor, act:diagFixSensor});
  if (HAS_GYRO){
    if (input.baseG!=null){ // v1.99.5 «Свежий ноль»: ноль должен не просто существовать, а совпадать с позой
      const zm=(lastGamma!=null&&typeof remapAxes==='function')?remapAxes(lastGamma,lastBeta==null?0:lastBeta):null;
      const skew=zm?Math.abs(zm[0]-input.baseG):0;
      if (alive && skew>25) R.push({st:'warn', txt:L.diagZeroSkew+' '+Math.round(input.baseG)+'° → '+Math.round(zm[0])+'°', fix:L.diagFixCal, act:()=>calibrateTilt()});
      else R.push({st:'ok', txt:L.diagZeroOk+' '+Math.round(input.baseG)+'°'});
    }
    else if (alive) R.push({st:'warn', txt:L.diagZeroWait, fix:L.diagFixCal, act:()=>calibrateTilt()});
    else R.push({st:'info', txt:L.diagZeroIdle});
    if (typeof bbVerdict==='function'){ // v1.99.7 «Чёрный ящик»: первое сломанное звено цепи — одной строкой
      const v=bbVerdict();
      R.push({st:(v===L.bbVOk)?'ok':((v.indexOf(L.bbVSkew)===0)?'warn':'info'), txt:L.diagChain+' '+v});
    }
  }
  if (Q.fps>=45) R.push({st:'ok', txt:L.diagFpsOk+' '+Math.round(Q.fps)});
  else R.push({st:'warn', txt:L.diagFpsLow+' '+Math.round(Q.fps), fix:L.diagFixGfx, act:diagFixGfx});
  R.push({st: MUTED?'info':'ok', txt: MUTED?L.diagSoundOff:L.diagSoundOn});
  // v1.99.6 «Паспорт штурвала»: сервисный центр знает всю новую кабину —
  // геймпад, мерку неба, лист с потолком, бережный режим, чернила.
  let pads=[]; try{ if(typeof navigator!=='undefined'&&navigator.getGamepads)
    pads=Array.from(navigator.getGamepads()).filter(p=>p&&p.connected); }catch(e){}
  if (pads.length) R.push({st:'ok', txt:L.diagPadOk+' '+pads[0].id.split('(')[0].trim()});
  else R.push({st:'info', txt:L.diagPadNone});
  if (typeof BB!=='undefined') R.push({st:'info', txt:L.diagTape+' '+BB.count()+' '+L.diagTapeEvt}); // v1.99.7
  R.push({st:'info', txt:L.diagWorld+' '+W+'×'+H+' · ×'+(Math.round(SC*100)/100)});
  R.push({st:'info', txt:L.diagSheet+' '+canvas.width+'×'+canvas.height+' ≤'+capPx});
  R.push({st:'info', txt:L.diagMotion+' '+(RM?L.diagOn:L.diagOff)});
  R.push({st:'info', txt:L.diagInk+' '+(P3?'display-p3':'srgb')});
  if (window.__tgWgSilent) R.push({st:'warn', txt:L.diagWgSilent}); // v1.84.0: виджет входа промолчал — сцена чиста, здесь честно
  if (HAS_GYRO && !gyroUnlocked()) R.push({st:'info', txt:L.diagLocked});
  return R;
}
let diagLastT=0;
function diagRefresh(){ if (screenName!=='diag') return; // v1.66.3: живые галочки — только на экране сервисного центра
  const now=performance.now(); if(now-diagLastT<500) return; diagLastT=now; diagBuild(); }
function diagBuild(){
  const list=$('diagList'); if(!list) return; list.innerHTML='';
  for (const r of diagRows()){
    const d=document.createElement('div'); d.className='drow';
    const icn=r.st==='ok'?'OK':(r.st==='warn'?'!':'i');
    const col=r.st==='ok'?'#8fff9f':(r.st==='warn'?'#ff9fb0':'#8fd0ff');
    d.innerHTML='<span class="dst" style="color:'+col+'">'+icn+'</span><span>'+r.txt+'</span>';
    if (r.fix){ const b=document.createElement('button'); b.className='btn ghost dbtn';
      b.style.cssText='font-size:12px;padding:6px 12px;min-height:0;margin:0 0 0 auto';
      b.textContent=r.fix; b.addEventListener('click',()=>{ sfx.click(); r.act(); }); d.appendChild(b); }
    list.appendChild(d);
  }
}
async function diagFixSensor(){
  audio();
  if (NEEDS_TILT_PERMISSION){ let r=''; try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    if (r!=='granted'){ toast(L.noTilt,'rgba(255,159,176,.5)'); return; } }
  if (typeof gyroKick==='function') gyroKick();
  toast(L.diagKicked,'rgba(143,255,159,.5)');
}
function diagFixGfx(){ Q.mode='low'; Store.set('gfx','low'); gfxCap(); resize(); gfxLabel(); diagLastT=0; diagRefresh(); haptic('light'); if(typeof BEACON!=='undefined') BEACON.signal('gfx_fix',''); } // v1.107.0: нажал «Снизить графику» — кадры болели, почта знает
function diagReport(){ // слепок для поддержки: игрок вставляет его в сообщение — и мы видим всё сразу
  const Ln=[];
  Ln.push('Cosmogram v'+GAME_VERSION);
  Ln.push('platform: '+((typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?'));
  Ln.push('screen: '+W+'x'+H+' dpr '+(window.devicePixelRatio||1));
  Ln.push('sensor: '+(HAS_GYRO?((gyroSrc||'none')+' pkts '+tgPkt+'/'+webPkt+' γ'+Math.round(lastGamma||0)+'° β'+Math.round(lastBeta||0)+'°'+(input.baseG!=null?' zero '+Math.round(input.baseG)+'°':' no-zero')+' tx '+(+input.tiltX.toFixed(2))):'none'));
  if (gyroLastErr) Ln.push('sensor-err: '+gyroLastErr);
  Ln.push('fps: '+Math.round(Q.fps)+' gfx '+Q.mode+'/'+Q.level);
  Ln.push('gpu: '+(gpuRenderer()||'?')+' tier '+gfxTier()); // v1.7.0: паспорт устройства в репорте
  Ln.push('display: ~'+Store.get('dispHz',0)+'hz dpr-cap '+dprCap+(Store.get('dispP3',0)?' p3':' srgb')); // v1.12.0: паспорт экрана
  Ln.push('sound: '+(MUTED?'off':'on')+' music '+(MUSIC_ON?'on':'off'));
  Ln.push('audio: '+(AC?AC.state:'нет')+' theme '+(music._theme()||'—')); // сторож звука (v1.20.0): видим, жив ли конвейер, на любом телефоне
  Ln.push('gyro: '+(gyroUnlocked()?'unlocked':'locked'));
  let padsN=0, padId=''; try{ if(navigator.getGamepads){ const ps=Array.from(navigator.getGamepads()).filter(p=>p&&p.connected);
    padsN=ps.length; padId=ps.length?ps[0].id.split('(')[0].trim():''; } }catch(e){}
  Ln.push('helm: '+(padsN?padsN+' · '+padId:'none')); // v1.99.6 «Паспорт штурвала»
  Ln.push('world: '+W+'x'+H+' sc '+(Math.round(SC*100)/100)+' sheet '+canvas.width+'x'+canvas.height+' cap '+capPx);
  Ln.push('motion: '+(RM?'reduce':'full')+' ink '+(P3?'display-p3':'srgb'));
  Ln.push('lang: '+LANG);
  return Ln.join('\n');
}
$('diagVibroBtn').addEventListener('click', ()=>{ // v1.60.0: длинный сильный сигнал + честный диагноз канала
  sfx.click();
  const ch=typeof vibroChannel==='function'?vibroChannel():0;
  $('diagVibroStat').textContent = ch===2?L.vibChTg : ch===1?L.vibChWeb : L.vibChNone;
  const hf=morseHF();
  if (hf){ try{ hf.notificationOccurred('error'); }catch(e){}
    [0,260,520].forEach(t=>setTimeout(()=>{ try{ hf.impactOccurred('heavy'); }catch(e){} },t)); }
  else if (navigator.vibrate){ try{ navigator.vibrate([300,120,300,120,300]); }catch(e){} }
});
$('diagReportBtn').addEventListener('click', ()=>{
  sfx.click(); haptic('light');
  const rep=diagReport();
  const done=()=>toast(L.diagCopied,'rgba(143,255,159,.5)');
  const fail=()=>{ const box=$('diagReportBox'); if(box){ box.textContent=rep; box.classList.remove('hidden'); } toast(L.diagCopyFail,'rgba(255,159,176,.5)'); };
  try{ navigator.clipboard.writeText(rep).then(done).catch(fail); }catch(e){ fail(); }
});
$('diagTapeBtn').addEventListener('click', ()=>{ // v1.99.7 «Чёрный ящик»: вся лента разом — паспорт, вердикт, события
  sfx.click(); haptic('light');
  if(typeof BB==='undefined'){ toast(L.diagCopyFail,'rgba(255,159,176,.5)'); return; }
  const rep=BB.text();
  const done=()=>toast(L.diagCopied,'rgba(143,255,159,.5)');
  const fail=()=>{ const box=$('diagReportBox'); if(box){ box.textContent=rep; box.classList.remove('hidden'); } toast(L.diagCopyFail,'rgba(255,159,176,.5)'); };
  try{ navigator.clipboard.writeText(rep).then(done).catch(fail); }catch(e){ fail(); }
});
$('diagSupportBtn').addEventListener('click', ()=>{
  sfx.click(); haptic('light');
  try{ if (typeof tg!=='undefined'&&tg&&tg.openTelegramLink) tg.openTelegramLink(SUPPORT_URL); else window.open(SUPPORT_URL,'_blank'); }
  catch(e){ try{ window.open(SUPPORT_URL,'_blank'); }catch(e2){} }
});
$('moreBtn').addEventListener('click', ()=>{ // редкое — калибровка, позывной, диагностика, «Об игре» (v1.63.0)
  const b=$('moreBox'); b.classList.toggle('hidden'); const open=!b.classList.contains('hidden');
  $('moreBtn').classList.toggle('open', open);
  if (open){ try{ $('moreBtn').scrollIntoView({block:'nearest'}); }catch(e){} }
  haptic('light'); sfx.click();
});
// v1.65.0 «Спойлеры»: категории — аккордеон. Открыта всегда одна панель — ничего ни на что не налезает,
// закрытый экран помещается целиком; экран скроллится как страховка + подскролл к открытой шапке
const SET_GRPS=[['setGrpSound','panelSound'],['setGrpGame','panelGame'],['setGrpProf','accPanel']];
SET_GRPS.forEach(([gId,pId])=>{
  const g=$(gId), p=$(pId); if(!g||!p) return;
  g.addEventListener('click', ()=>{
    const willOpen=p.classList.contains('hidden');
    SET_GRPS.forEach(([gg,pp])=>{ const G=$(gg),P=$(pp); if(!G||!P) return;
      P.classList.add('hidden'); G.classList.remove('open'); });
    if (willOpen){
      p.classList.remove('hidden'); g.classList.add('open');
      try{ g.scrollIntoView({block:'nearest'}); }catch(e){}
    }
    haptic('light'); sfx.click();
  });
});
$('aboutBtn').addEventListener('click', ()=>{
  $('aboutBox').classList.toggle('hidden');
  $('aboutBtn').classList.toggle('open', !$('aboutBox').classList.contains('hidden')); haptic('light');
});
function vibroLabel(){ rowSw('setVibroBtn', VIBRO); setWellFill(); }
$('setVibroBtn').addEventListener('click', ()=>{
  VIBRO=!VIBRO; Store.set('vibro',VIBRO?1:0); vibroLabel(); if(VIBRO) haptic('medium');
});
function gfxModes(){ return ['auto','low','med','high'].concat(gfxUltraOk()?['ultra']:[]); } // v1.35.0: четыре честных ступени; «Ультра» в цикле только у флагманов
function gfxLabel(){ rowV('setGfxBtn',
  (Q.mode==='auto'?L.gfxAuto:(Q.mode==='low'?L.gfxLow:(Q.mode==='med'?L.gfxMed:(Q.mode==='ultra'&&gfxUltraOk()?L.gfxUltra:L.gfxHigh))))); setWellFill(); }
$('setGfxBtn').addEventListener('click', ()=>{
  const ms=gfxModes(); Q.mode=ms[(ms.indexOf(Q.mode)+1)%ms.length];
  Store.set('gfx',Q.mode); gfxCap(); resize(); // HD-резолюция следует за режимом
  gfxLabel(); haptic('light'); sfx.click();
});
function aboutFill(){ $('aboutBox').innerHTML='Cosmogram · v'+GAME_VERSION+'<br/>'+L.channel+': '+
  CHANNEL_URL.replace('https://',''); } // aboutTags вычеркнуты (v1.27.0)
// iOS: системный запрос доступа к датчикам — только по явному тапу красивой кнопки
function refreshGyroLock(){ const has=(typeof gyroSensorThere==='function')?gyroSensorThere():HAS_GYRO; // v1.108.1: та же честная проверка, что и у автооффера — не просто факт API
  const b=$('gyroUnlockBtn'); if(b) b.classList.toggle('hidden', !has || gyroUnlocked());
  const o=$('setGyroOffBtn'); if(o){ o.classList.toggle('hidden', !has || !gyroUnlocked()); rowSw('setGyroOffBtn', gyroUnlocked()); } } // v1.106.0 «Штурман по желанию»: ряд-выключатель виден только при открытом замке
$('gyroUnlockBtn').addEventListener('click', async ()=>{ // открытие «Полёта без рук» из настроек — тем же ритуалом: разрешение + «держи ровно»
  audio(); sfx.click();
  if (NEEDS_TILT_PERMISSION){ let r=''; try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    if (r!=='granted'){ toast(L.noTilt,'rgba(255,159,176,.5)'); return; } }
  Store.set('gyroUnlocked',1);
  refreshGyroLock();
  if (typeof gyroKick==='function') gyroKick();
  if (typeof calibrateTilt==='function') calibrateTilt(); else toast(L.gyroUnlockedOk,'rgba(143,255,159,.5)');
  haptic('success');
});
$('setGyroOffBtn').addEventListener('click', ()=>{ // v1.106.0 «Штурман по желанию»: запереть замок обратно — штурвал пальцу; рекорды гироскопа священны, не трогаем
  Store.set('gyroUnlocked',0);
  if (typeof calReset==='function') calReset(false,true); // при переоткрытии ноль найдём заново — только из настоящей тишины (закон v1.100.3)
  refreshGyroLock();
  haptic('light'); sfx.click();
  toast(L.gyroOffOk,'rgba(159,232,255,.5)');
});
$('setBeaconBtn').addEventListener('click', ()=>{ // v1.107.0 «Почта неба»: честный выключатель — выкл значит молчание (даже очередь не копится)
  const on = Store.get('beaconOn',1)===1 ? 0 : 1;
  Store.set('beaconOn',on);
  rowSw('setBeaconBtn', on===1);
  haptic('light'); sfx.click();
});
$('tiltBtn').addEventListener('click', ()=>{
  audio();
  try{
    DeviceOrientationEvent.requestPermission().then(r=>{
      if(r==='granted'){
        $('tiltBtn').classList.add('hidden');
        toast(L.tiltOn,'rgba(143,255,159,.5)'); haptic('success');
      } else toast(L.noTilt,'rgba(255,159,176,.5)');
    }).catch(()=>toast(L.noTilt,'rgba(255,159,176,.5)'));
  }catch(e){ toast(L.noTilt,'rgba(255,159,176,.5)'); }
});
// чувствительность гироскопа (планшеты: меньший угол наклона для поворота)
const SENS_STEPS=[0.75,1,1.25,1.5];
function sensLabel(){ rowV('setSensBtn','×'+input.sens); setWellFill(); }
$('setSensBtn').addEventListener('click', ()=>{
  const i=SENS_STEPS.indexOf(input.sens);
  input.sens=SENS_STEPS[(i+1)%SENS_STEPS.length];
  Store.set('sens',input.sens); sensLabel(); haptic('light'); sfx.click();
});
$('overDetailsBtn').addEventListener('click', ()=>{ // спойлер «Подробности полёта»: мотивация, ранг, паспорт и сетка — по желанию (v1.44.0; v1.84.0 — вся вторая сцена)
  const hid=$('overMore').classList.toggle('hidden');
  $('overDetailsBtn').classList.toggle('open',!hid); sfx.click(); haptic('light'); });
$('hangarBtn').addEventListener('click', ()=>{ renderHangar(); setScreen('hangar'); sfx.click(); });
$('hangarBackBtn').addEventListener('click', toMenu);
/* ---------- Достижения + онбординг (модуль ach.js) ---------- */
function openAch(){ renderAch(); setScreen('ach'); sfx.click(); }
function closeAch(){ toMenu(); }
$('achBtn').addEventListener('click', openAch);
$('achBackBtn').addEventListener('click', closeAch);
/* Вкладка «🌍 Топ»: честная таблица (модуль sync.js) */
let topCat='touch';
function achTabSel(mine){
  $('tabMine').classList.toggle('sel',mine); $('tabTop').classList.toggle('sel',!mine);
  $('achMineWrap').classList.toggle('hidden',!mine); $('achTopWrap').classList.toggle('hidden',mine);
  if(!mine) renderTop();
}
$('tabMine').addEventListener('click',()=>{ achTabSel(true); sfx.click(); });
$('tabTop').addEventListener('click',()=>{ achTabSel(false); sfx.click(); });
document.querySelectorAll('.topCat').forEach(b=>b.addEventListener('click',()=>{
  topCat=b.dataset.cat;
  document.querySelectorAll('.topCat').forEach(x=>x.classList.toggle('sel',x===b));
  renderTop(); sfx.click();
}));
/* ---------- Одна таблица, много входов (v1.51.0) ----------
   Гость играет полноценно, рекорд ждёт локально; вход — Telegram Login Widget (только браузер).
   Анонимных записей нет: без подписи Telegram в таблицу не встать — доверие дороже охвата. */
function accFill(){ // настройки: статус входа + виджет (гость) / «Выйти» (веб-сессия)
  const st=$('accStatus'), wg=$('accWidget'), out=$('accOutBtn');
  if(!st || typeof syncAvailable!=='function') return;
  const dw=$('dcWidget');
  if (syncAvailable()){
    st.textContent=L.accIn(typeof syncAuthName==='function'?(syncAuthName()||''):'');
    wg.innerHTML=''; if(dw) dw.innerHTML='';
    out.classList.toggle('hidden', !!syncInitData()); // из мини-аппа «выходить» нечего — ты дома
  } else {
    st.textContent=L.accGuest;
    out.classList.add('hidden');
    if(!syncInitData()){ tgWidgetMount(wg); if(dw) dcMount(dw); } else { wg.innerHTML=''; if(dw) dw.innerHTML=''; }
  }
}
function webJoinFill(){ // экран итогов: гостю — приглашение и кнопка входа, вошедшему — чисто
  const wj=$('webJoin'); if(!wj || typeof syncAvailable!=='function') return;
  const guest=!syncAvailable();
  wj.classList.toggle('hidden', !guest);
  if (guest){ $('webJoinTxt').textContent=L.webJoin; tgWidgetMount($('webJoinWidget')); dcMount($('dcJoinWidget')); }
  else { $('webJoinWidget').innerHTML=''; const dj=$('dcJoinWidget'); if(dj) dj.innerHTML=''; }
}
function syncAuthChanged(){ // зовёт sync.js после входа виджетом, выхода или 401
  accFill(); webJoinFill();
  if (screenName==='ach' && $('achTopWrap') && !$('achTopWrap').classList.contains('hidden')) renderTop();
}
$('accOutBtn').addEventListener('click',()=>{ Store.del('tgWebAuth'); Store.del('dcAuth'); sfx.click(); haptic('light'); syncAuthChanged(); });

function renderTop(){
  const list=$('topList'), me=$('topMe');
  me.textContent=''; list.innerHTML='<div class="topMsg">'+L.topLoading+'</div>';
  const tl=$('topLogin');
  if (typeof syncTop!=='function' || !syncAvailable()){
    list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>';
    const dl=$('dcLogin');
    if (tl){ tl.classList.remove('hidden'); if(!syncInitData()) tgWidgetMount(tl); } // гостю — вход прямо здесь (v1.51.0)
    if (dl){ dl.classList.remove('hidden'); if(!syncInitData()) dcMount(dl); } // …или через Discord (v1.52.0)
    return;
  }
  if (tl){ tl.classList.add('hidden'); tl.innerHTML=''; }
  { const dl=$('dcLogin'); if (dl){ dl.classList.add('hidden'); dl.innerHTML=''; } }
  syncTop(topCat).then(d=>{
    if(screenName!=='ach') return; // игрок уже ушёл — не трогаем DOM
    if(!d || !d.ok){ list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; return; }
    me.textContent = d.me ? (L.topMe+'#'+d.me.rank+' · '+fmtN(d.me.best)+(topCat==='dist'?' м':'')) : '';
    if(!d.top || !d.top.length){ list.innerHTML='<div class="topMsg">'+L.topEmpty+'</div>'; return; }
    list.innerHTML=d.top.map((r,i)=>'<div class="topIt'+(r.me?' me':'')+'" style="animation-delay:'+(Math.min(i,10)*60)+'ms"><span class="topN'+(i<3?' m'+(i+1):'')+'">'+(i+1)+'</span>'+
      '<span class="topNm">'+String(r.name).replace(/[<>&]/g,'')+(r.provider&&r.provider!=='tg'?' <b class="pvTag">'+String(r.provider).replace(/[<>&]/g,'')+'</b>':'')+(r.username?' <i>@'+String(r.username).replace(/[<>&]/g,'')+'</i>':'')+'</span>'+
      '<span class="topSc">'+fmtN(r.best)+(topCat==='dist'?' м':'')+'</span>'+
      ((topCat==='gyro'||topCat==='touch')&&!r.me&&r.pid?'<button class="topGh" data-gh="'+r.pid+'" data-best="'+Math.floor(Number(r.best)||0)+'" title="'+L.ghostGo+'">'+ic('ghost')+'</button>':'')+'</div>').join('');
  });
}
/* ---------- Призрак из топа: скачать чужой трек и лететь рядом ----------
   Учимся тактике и манёврам рекордсмена + живая витрина скинов (его самолётик виден в полёте). */
let foreignGhost=null;
function ghostSetForeign(f){
  foreignGhost=(f && typeof f.track==='string')?{track:f.track, skin:Math.floor(Number(f.skin))||0,
    name:String(f.name||'').replace(/[<>&]/g,'').slice(0,64),
    pid:Math.floor(Number(f.pid))||0, cat:String(f.cat||''), best:Math.floor(Number(f.best))||0,
    seed:(f.seed!=null && isFinite(Number(f.seed)))?Math.floor(Number(f.seed)):null}:null; // v1.280.0: сид едет с призраком, если сервер его знает
}
function ghostTakeForeign(){ const f=foreignGhost; foreignGhost=null; return f; } // разовый: съедается при старте
$('topList').addEventListener('click', e=>{
  const b=e.target.closest('.topGh'); if(!b) return;
  const pid=Math.floor(Number(b.dataset.gh));
  if(!pid || typeof syncGhostGet!=='function') return;
  sfx.click(); haptic('light'); b.textContent='…';
  syncGhostGet(pid, topCat).then(d=>{
    // v1.103.0 «Тихий нуль»: знак результата рисуется ПОСЛЕ результата — неудача возвращает призрака, галочка не врёт
    if(!d || !d.ok){ b.innerHTML=ic('ghost'); toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; } // владелец скрыл трек
    b.innerHTML=ic('check');
    ghostSetForeign({track:d.track, skin:d.skin, name:d.name, pid:pid, cat:topCat, best:Math.floor(Number(b.dataset.best))||0, seed:d.seed});
    foreignFrom='top';
    toast(L.ghostWith(d.name||''),'rgba(191,232,255,.45)');
    startGame(); // призрак подхватится в ghostLoad — окно онбординга его не трогает
  });
});

/* Приватность призрака: Делюсь — трек летит в топ; Скрыт — сервер стирает мои треки */
function ghostShareLabel(){ rowSw('setGhostBtn', Store.get('shareGhost',1)); }
/* typeof-страховки: при миксе версий из кэша (старый core + новый ui) подписи молчат, но applyLang не падает (v1.55.0) */
function morseLabel(){ rowSw('setMorseBtn', typeof morseOn==='function'&&morseOn()); setWellFill(); }
function morseHapLabel(){ rowSw('setMorseHapBtn', typeof morseHapOn==='function'&&morseHapOn()); setWellFill(); }
const setMorseHapBtn=$('setMorseHapBtn');
if (setMorseHapBtn) setMorseHapBtn.addEventListener('click', ()=>{
  const on=!(typeof morseHapOn==='function'&&morseHapOn());
  Store.set('morseHap', on?1:0); morseHapLabel(); haptic('light'); sfx.click();
  if (on && typeof hapticMorse==='function') hapticMorse(myCallsign()); // включил — сразу почувствуй свою подпись
});
const setMorseBtnEl=$('setMorseBtn');
if (setMorseBtnEl) setMorseBtnEl.addEventListener('click', ()=>{
  Store.set('morseOn', (typeof morseOn==='function'&&morseOn())?0:1); morseLabel(); haptic('light'); sfx.click();
});
const csInput=$('csInput');
if (csInput) csInput.addEventListener('change', ()=>{ // позывной: белый список знаков + фильтр — чистится в core
  const c=sanitizeCallsign(csInput.value);
  if (c) Store.set('callsign',c); else Store.del('callsign');
  csInput.value=Store.get('callsign','');
  csInput.placeholder=myCallsign(); haptic('light'); setWellFill(); // v1.91.0: позывной сразу звучит в шёпоте профиля
});
function csFill(){ if(!csInput) return; csInput.value=Store.get('callsign',''); csInput.placeholder=typeof myCallsign==='function'?myCallsign():''; }
$('setGhostBtn').addEventListener('click', ()=>{
  const v=Store.get('shareGhost',1)?0:1; Store.set('shareGhost',v);
  if (typeof syncGhostShare==='function') syncGhostShare(!!v); // выкл — сервер удаляет мои призраки сразу
  ghostShareLabel(); haptic('light'); sfx.click();
});

// v1.96.0 «Одна дверь»: кнопка «Поделиться» с итогов ушла — текстовая дверь живёт внутри карточки (cardShare, card.js).
// Особая вода своей трассы (mapShare) переехала туда же.
$('duelBtn').addEventListener('click', ()=>{ // вызвать друга: deep-link, планку друг получит с сервера
  const pid=(typeof syncMyId==='function')?syncMyId():null;
  if(!pid){ toast(L.duelTgOnly,'rgba(255,159,176,.5)'); haptic('error'); return; } // вне мини-аппа нет верифицированной личности
  Stats.duelsSent=(Stats.duelsSent||0)+1; saveStats();
  if(typeof achCheck==='function') achCheck(); // «Первый вызов»
  haptic('success'); sfx.click();
  const link='https://t.me/realcosmogrambot/app?startapp=duel_'+pid;
  const text=L.duelShareText(Math.floor(S.dist), S.mission);
  const url='https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(text);
  if(tg&&tg.openTelegramLink){ try{ tg.openTelegramLink(url); return; }catch(e){} }
  window.open(url,'_blank');
});
$('inviteBtn').addEventListener('click', shareScore);
function openChannel(){ // сообщество: нативно в Telegram, иначе новая вкладка
  try{ if(tg && tg.openTelegramLink){ tg.openTelegramLink(CHANNEL_URL); return; } }catch(e){}
  try{ window.open(CHANNEL_URL,'_blank'); }catch(e){}
}
$('channelBtn').addEventListener('click', openChannel); // v1.84.0: на сцене итогов канал не кричит — он дома, в меню

/* ---------- Локализация DOM ---------- */
function applyLang(){
  // v1.34.0 «Единая палуба»: иконки перед текстом убраны из всех окон — кнопки говорят текстом
  $('pillG').title=L.pillGyro; $('pillT').title=L.pillTouch;
  $('pillD').title=L.pillDist; $('pillB').title=L.pillBullet;
  $('startBtn').textContent=L.start;
  $('tooNarrowTitle').textContent=L.tooNarrowTitle; $('tooNarrowHint').textContent=L.tooNarrowHint; // v1.108.1: «Пол листа»
  $('modesBtn').textContent=L.modes; $('modesBack').textContent=L.modesBack; modesFill(); // дисциплины (v1.42.0; v1.70.0: Пакт удалён)
  if (typeof forgeFill==='function') forgeFill(); // конструктор трассы — свой язык (v1.68.0)
  if (typeof cardFill==='function') cardFill(); // карточка для скриншота — свой язык (v1.73.0)
  $('hangarBtn').textContent=L.hangar;
  $('inviteBtn').textContent=L.invite;
  $('duelBtn').textContent=L.duelBtn;
  $('settingsBtn').textContent=L.settings;
  $('channelBtn').textContent=L.channel;
  $('homeBtn').textContent=L.home;
  $('pauseTitle').textContent=L.pause;
  $('pauseBtn').setAttribute('aria-label',L.ariaPause); // v1.47.1: скринридер говорит на языке игрока — метка из словаря, не из разметки
  $('resumeBtn').textContent=L.resume;
  $('pauseSettingsBtn').textContent=L.settings;
  $('settingsTitle').textContent=L.settingsTitle;
  $('setCalibTxt').textContent=L.calib; // v1.103.0: текст отдельно от диода — локализация лампу не стирает
  $('aboutBtn').textContent=L.aboutBtn; aboutFill();
  $('accOutBtn').textContent=L.accOut; // v1.51.0: вход в общую таблицу — на языке игрока
  if(screenName==='settings') accFill(); if(screenName==='over') webJoinFill(); // виджет монтируется лениво — только на открытом экране
  $('settingsBackBtn').textContent=L.back;
  $('restartBtn').textContent=L.restart;
  $('pauseMenuBtn').textContent=L.menu;
  $('hangarTitle').textContent=L.hangar;
  $('hangarBackBtn').textContent=L.menu;
  $('retryBtn').textContent=L.retry;
  $('watchBtn').textContent=L.watchFlight;
  $('tribuneBtn').textContent=L.tribune; // v1.100.1 «Трибуна чемпиона» — на языке игрока
  $('goldChip').textContent=L.goldChip; // v1.100.2 «Золотая звезда дня» — на языке игрока
  $('overDetailsBtn').textContent=L.overDetails;
  $('statusBtn').textContent=L.statusStar; // v1.98.0 «Звезда-статус» — на языке игрока
  // заголовок «РАЗБИЛСЯ!» убран (v1.27.0): никто не разбивается — экран поражения добрый и компактный
  $('menuBtn').textContent=L.menu;
  $('scoreLbl').textContent=L.scoreLbl;
  $('distCap').textContent=L.distLbl;
  $('smoothCap').textContent=L.smoothLbl;
  $('tiltBtn').textContent=L.tiltAllow;
  $('gyroUnlockBtn').textContent=L.gyroUnlockBtn; refreshGyroLock(); // замок гироскопа: кнопка открытия — только пока заперт
  $('achTitle').textContent=L.achTitle;
  $('achBtnTxt').textContent=L.achTitle;
  $('achBackBtn').textContent=L.back;
  $('tabMine').textContent=L.mineTab; $('tabTop').textContent=L.topTab;
  $('diagBtn').textContent=L.diagBtn;
  $('diagTitle').textContent=L.diagBtn; $('diagBackBtn').textContent=L.back; // v1.66.3: экран сервисного центра
  $('csCap').textContent=L.csCap; // v1.66.3: подпись позывного в «Профиле»
  $('diagReportBtn').textContent=L.diagReportBtn;
  $('diagTapeBtn').textContent=L.diagTapeBtn; // v1.99.7 «Чёрный ящик»
  $('diagSupportBtn').textContent=L.diagSupportBtn;
  sensLabel(); soundLabel(); musicLabel(); langLabel(); vibroLabel(); gfxLabel(); gyroStatus(); ghostShareLabel(); morseLabel(); morseHapLabel(); csFill(); setWellFill();
  const grpT=(id,t)=>{ const e=$(id); if(e){ const s=e.querySelector('.setGrpT'); if(s) s.textContent=t; } }; // v1.91.0: заголовок живёт в .setGrpT — рядом шёпот самочувствия
  grpT('setGrpSound',L.setGrpSound); grpT('setGrpGame',L.setGrpGame); // v1.63.0: две группы вместо четырёх
  grpT('setGrpProf',L.setGrpProf); // v1.64.0: карточка «Профиль»
  $('moreBtn').textContent=L.moreLbl;
  [['setSoundBtn','setSound'],['setMusicBtn','setMusic'],['setVibroBtn','setVibro'],['setMorseBtn','setMorse'],
   ['setMorseHapBtn','setMorseHap'],['setSensBtn','sens'],['setGfxBtn','setGfx'],['setContrastBtn','setContrast'],
   ['setColorblindBtn','setColorblind'],['setStreaksBtn','setStreaks'],['setLangBtn','setLang'],
   ['setGhostBtn','setGhost'],['setGyroOffBtn','setGyroOff'],['setBeaconBtn','setBeacon']].forEach(p=>{ const b=$(p[0]); if(b) b.querySelector('.setK').textContent=L[p[1]]; });
  $('diagVibroBtn').textContent=L.diagVibro;
}
/* баланс сетки 2 колонки: нечётная последняя видимая кнопка растягивается на всю ширину (v1.34.0) */
function gridBalance(row){ if(!row) return;
  const vis=[].slice.call(row.children).filter(b=>!b.classList.contains('hidden'));
  vis.forEach(b=>b.classList.remove('span2'));
  if(vis.length%2===1) vis[vis.length-1].classList.add('span2');
}

/* ---------- Загрузка ---------- */
Store.init(()=>{
  // санация: мусор из облака/localStorage не должен ронять игру
  S.best = saneNumber(Store.get('best',0),0);
  S.wallet = saneNumber(Store.get('wallet',0),0);
  S.ownedSkins = saneArray(Store.get('ownedSkins',[0]),[0]);
  S.skin = saneNumber(Store.get('skin',0),0);
  Stats = Object.assign(Stats, Store.get('stats',{})||{}); // миграция: старые сейвы без новых полей дополняются дефолтами
  // чувствительность гироскопа (персист) — только известные ступени
  const sv=saneNumber(Store.get('sens',1),1);
  input.sens = SENS_STEPS.includes(sv)?sv:1;
  // Input Fallback System: iOS — красивая кнопка разрешения наклона (только если
  // нет родного моста Telegram: там системное разрешение не нужно вовсе);
  // устройство без датчика — гиро-кнопки не показываем вовсе
  if(NEEDS_TILT_PERMISSION && !TG_ORIENT) $('tiltBtn').classList.remove('hidden');
  gyroStatus(); // диагностика датчика в настройках: Telegram / браузер / молчит
  if(!HAS_GYRO){ $('setCalibBtn').classList.add('hidden'); $('setSensBtn').classList.add('hidden'); }
  // настройки: звук, вибро, графика, язык из хранилища
  MUTED = Store.get('muted',0)===1;
  VIBRO = Store.get('vibro',1)!==0;
  CONTRAST = Store.get('contrast',0)===1; COLORBLIND = Store.get('colorblind',0)===1; canvasFilterSync(); // v1.280.0
  SPEED_STREAKS = Store.get('speedStreaks',1)===1; // v1.280.0: по умолчанию включено
  MUSIC_ON = Store.get('music',1)!==0; // музыка — отдельная настройка от звуков
  if (typeof achQShow==='function') achQShow(); // карман наград: бейдж «ждут N» на кнопке 🏆
  // сторож звука: каждый тап — шанс разбудить; раз в 2с — самопроверка (v1.20.0)
  document.addEventListener('pointerdown', audioKeep);
  setInterval(audioKeep, 2000);
  // v1.108.1 «Клавиатура для всех»: 22 кастомные ARIA-кнопки (role="button" на div) получали фокус
  // по Tab (после tabindex="0" в разметке), но Enter/Space их не нажимали — так работают только
  // настоящие <button>. Один делегированный слушатель вместо 22 отдельных — жмёт уже существующий
  // click(), ни один из них не переписан и не продублирован.
  document.addEventListener('keydown', function(e){
    if ((e.key==='Enter' || e.key===' ') && e.target && e.target.getAttribute &&
        e.target.getAttribute('role')==='button'){
      e.preventDefault(); // пробел не должен ещё и прокручивать страницу
      e.target.click();
    }
  });
  // свернули приложение — музыка и шелест в фон; вернулись — обратно
  document.addEventListener('visibilitychange', ()=>{
    music.duck(document.hidden);
    engine.duck(document.hidden);
  });
  const gm=Store.get('gfx','auto'); Q.mode = (gm==='low'||gm==='med'||gm==='high')?gm:(gm==='ultra'&&gfxUltraOk()?'ultra':'auto'); // v1.35.0: «Средняя» и «Ультра» (у флагмана) восстанавливаются как ручные
  // v1.282.11: восстановление Q.level ПЕРЕД gfxCap() — раньше было наоборот. Пока gfxCap() не различала
  // уровни 0/1/2 (кроме особого случая 3), порядок был не важен. Но v1.282.3 сделала gfxCap()
  // чувствительной именно к Q.level — и «дефолт 2 из объявления, восстановление позже» стало
  // означать: игрок с уже выученным слабым уровнем на КАЖДОЙ загрузке стартовал бы с раздутым
  // разрешением, пока авто-качество заново его не понизит — заикание на каждом запуске подряд,
  // не один раз. Регрессия моей же вчерашней правки, найдена сегодня же.
  if (Q.mode==='auto') Q.level = Store.get('gfxLv', gfxTier()>=2?3:1); // v1.7.0/v1.12.0: выученный уровень; флагману — сразу «Ультра», просадка сама отучит
  gfxCap(); resize(); // применяем сохранённый режим к резолюции (в т.ч. HD на флагманах) — теперь с верным Q.level уже на месте
  dispProbe(); // паспорт экрана: герцовка и охват — авто-качество считает по-честному
  const lp=Store.get('lang','auto');
  langPref = SUPPORTED_LANGS.includes(lp)?lp:'auto';
  applyLangPref();
  if(!S.ownedSkins.includes(0)) S.ownedSkins.push(0);
  if(!S.ownedSkins.includes(S.skin)) S.skin=0;
  // реферальный параметр (Блок 9)
  try{
    const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if(sp && String(sp).indexOf('map_')!==0 && !(typeof duelParse==='function' && duelParse(sp)) && !Store.get('refBy',null)) Store.set('refBy', String(sp).slice(0,64)); // map_ — не рефералка, а трасса (v1.68.0)
  }catch(e){}
  // addToHomeScreen (API 8.0+)
  if (tgv('8.0') && tg.addToHomeScreen){
    const hb=$('homeBtn');
    hb.addEventListener('click', ()=>{ try{ tg.addToHomeScreen(); }catch(e){} });
    try{ tg.checkHomeScreenStatus(st=>{ if(st!=='added'){ hb.classList.remove('hidden'); gridBalance($('menuRow')); } }); }
    catch(e){ hb.classList.remove('hidden'); gridBalance($('menuRow')); }
  }
  applyLang();
  refreshMenu();
  // v1.16.0 «Интуиция»: школа и учебный полёт вычеркнуты — первый запуск тоже сразу в небо; единственный урок — «Полёт без рук» (js/gyro.js)
  Store.del('seenIntro'); Store.del('tutDone'); Store.del('lesson'); Store.del('lsnPass'); Store.del('lsnV'); // гигиена: ключи школы больше не нужны
  Store.del('tutVoice'); // гигиена: голос вычеркнут (v1.20.0)
  const mapPending = (typeof forgeBoot==='function') ? forgeBoot() : false; // трасса друга по ссылке (v1.68.0)
  const duelPending = !mapPending && (typeof duelBoot==='function') ? duelBoot() : false; // дуэль по ссылке: планка с сервера, баннер живёт в меню
  // v1.108.1 «Одно событие, не платформа за платформой»: платформа — свойство, не отдельное событие.
  // Reddit и любая будущая платформа впишутся сюда новым значением platform, без нового имени события.
  if (window.amplitude) {
    const platform = (typeof syncInitData==='function' && syncInitData()) ? 'telegram'
      : (typeof syncWebAuth==='function' && syncWebAuth()) ? 'telegram_web'
      : (typeof syncDcAuth==='function' && syncDcAuth()) ? 'discord'
      : 'guest';
    amplitude.track('Opened Game', { platform, prompt_version: 'BA400.4' });
  }
  if (S.running){ /* v1.100.4: взлёт случился однажды — поздний ответ облака (сторож Store.init) не перезапускает небо посреди полёта */ }
  else if (mapPending){ forgeOpen(); setScreen('forge'); toast(L.forgeGuest,'rgba(255,215,106,.5)'); } // ссылка с трассой — сразу в конструктор
  else if (duelPending) setScreen('menu'); // v1.6.0: вызов — единственное исключение с меню при загрузке
  else bootFly(); // v1.6.0 «Сразу в полёт»: нажал «Открыть» — и уже летишь
  if (typeof syncFlush==='function') syncFlush(); // доотправка очереди с прошлых сессий
});
applyLang();
plane.x=W/2; plane.y=H*.72;
startLoop();

/* v1.108.1 «Клавиатура и пульт»: div role="button" по умолчанию не получает фокус
   клавиатурой/пультом — только настоящий <button>. Один общий страж вместо ручной
   правки каждого места: даёт фокус и Enter/Space-активацию всем таким кнопкам разом,
   включая те, что появятся позже. ТВ-пульт и клавиатура получают доступ туда же,
   куда уже дотягивается мышь и тач. */
(function a11yButtons(){
  function wire(el){
    if(el.hasAttribute('tabindex')) return;
    el.setAttribute('tabindex','0');
    el.addEventListener('keydown', e=>{
      if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){ e.preventDefault(); el.click(); }
    });
  }
  document.querySelectorAll('[role="button"]').forEach(wire);
  // экраны строятся и заново рисуются в рантайме (Настройки, Сервисный центр) — следим за новыми
  new MutationObserver(muts=>{
    for(const m of muts) for(const n of m.addedNodes){
      if(n.nodeType!==1) continue;
      if(n.matches && n.matches('[role="button"]')) wire(n);
      if(n.querySelectorAll) n.querySelectorAll('[role="button"]').forEach(wire);
    }
  }).observe(document.body,{childList:true,subtree:true});
})();
