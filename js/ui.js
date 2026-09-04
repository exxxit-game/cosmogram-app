'use strict';
/* ============================================================
   UI: экраны, BackButton, потоки игры, ангар, шаринг,
   системные события, привязка кнопок, загрузка.
   Зависит от всех модулей выше.
   ============================================================ */
/* Глоссарий коротких глобалов (см. также core.js) — переименование отклонено 22.08.2026:
     S — состояние забега (game.js), Q — качество графики (render.js), AC — AudioContext (core.js). */

/* ---------- Экраны + нативные кнопки Telegram (Блок 4) ---------- */
let screenName='menu'; // menu | game | pause | over | hangar (не "screen" — конфликт с window.screen)

/* v1.400.3 «Замок держит дверь»: боевой крэш v1.284.22 (Uncaught TypeError:
   Cannot read properties of null (reading 'addEventListener'), ui.js:1133,
   вердикт «замок закрыт — не пройден «Полёт без рук»»). Раньше 51 привязка
   кнопок шла напрямую $('id').addEventListener(...) без проверки: один
   отсутствующий в DOM элемент (устаревший закэшированный index.html при
   новом ui.js, недогрузившаяся разметка) ронял весь boot-скрипт целиком —
   ни один обработчик после места падения не навешивался, startLoop() в
   хвосте файла не вызывался, игра не взлетала вовсе. Один общий вход:
   элемент есть — вешаем как раньше; элемента нет — тихо пропускаем и
   сигналим в «Почту неба», чтобы пропажа была видна, а не убивала игру. */
function wireOn(id, ev, fn){
  const el = $(id);
  if (el){ el.addEventListener(ev, fn); }
  else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}
/* 23.08.2026 «Тот же замок для текста»: applyLang() держала ~70 прямых $('id').textContent=
   без проверки — тот же класс краша, что wireOn() уже закрыл для 51 обработчика (v1.400.3).
   Один отсутствующий элемент обрывал ВСЮ функцию перевода на середине — остальные строки
   после места падения не выполнялись. setText/setAttr — тот же приём, для двух других форм
   обращения (applyLang() их использует; setScreen() — отдельным заходом позже). */
function setText(id, val){
  const el = $(id);
  if (el){ el.textContent = val; }
  else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}
function setAttr(id, attr, val){
  const el = $(id);
  if (el){ el.setAttribute(attr, val); }
  else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}
function toggleCls(id, cls, val){
  const el = $(id);
  if (el){ el.classList.toggle(cls, val); }
  else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}
function setHTML(id, val){
  const el = $(id);
  if (el){ el.innerHTML = val; }
  else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}
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
  else if(screenName==='feedback') closeFeedback(); // 02.09.2026: владелец, живое устройство — нативная «Назад» на этом экране молчала, ветки не было вовсе
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
// 31.08.2026 (владелец, живое устройство: «сразу видно две кнопки назад — нашу и от
// телеграм»): тот же приём раньше стоял ТОЛЬКО у #pauseBtn — все девять .menuBack-кнопок
// (Настройки/Сервисный центр/Обратная связь/Режимы/Конструктор/Ангар/Достижения/Карточка/
// Первый полёт) не проверялись вовсе и показывались всегда, хотя setScreen() уже показывает
// нативную «Назад» Telegram на каждом экране кроме меню (setBack(name!=='menu')) — то же
// условие, что и у паузы, просто не было доведено до остальных восьми кнопок тогда же.
function pauseGhostSync(){
  const nativeBack=!!(tg && tg.BackButton && tgv('6.1'));
  toggleCls('pauseBtn','ghost', nativeBack);
  // firstFlightClose исключён: открывается прямо на экране меню (firstFlightOpen() не зовёт
  // setScreen()), а там родная «Назад» Telegram всегда скрыта (setBack(name!=='menu')) — это
  // «Закрыть» карточки, не «Назад» экрана, заменить её в этот момент нечем.
  document.querySelectorAll('.menuBack:not(#firstFlightClose)').forEach(function(el){ el.classList.toggle('ghost', nativeBack); });
}
pauseGhostSync();
function setScreen(name){
  if(name==='menu' && typeof runMode!=='undefined' && runMode!=='classic') runMode='classic'; // v1.92.1 «Дом — это классика»: вышел в меню — сессия любой дисциплины закрыта, большая кнопка всегда ведёт домой
  /* 04.09.2026 (владелец): курсор пропадал даже на паузе — Pointer Lock (input.js) не
     отпускается сам по себе, когда поверх канваса ложится пауза/итоги (это та же страница,
     не переход). setScreen — единственное место всех переходов (см. коммент про рамку
     коридора ниже), поэтому один вызов здесь ловит уход из полёта куда угодно разом. */
  if(name!=='game' && document.exitPointerLock) document.exitPointerLock();
  screenName=name;
  /* 24.08.2026: рамка коридора (#corrEdgeL/#corrEdgeR) раньше перепроверялась ТОЛЬКО из
     resize() в core.js — то есть только когда меняется размер окна. На статичном рабочем
     столе (окно не двигали) переход меню→полёт никогда не запускал перепроверку: рамка
     задумана только на широком экране ВО ВРЕМЯ полёта, но правильное условие ни разу не
     доходило до DOM, и рамка не показывалась вообще (владелец: «в обычном браузере рамку
     не видно»). setScreen — единственное место, через которое проходят все переходы
     меню/пауза/полёт/итоги, поэтому один вызов здесь закрывает все случаи разом. */
  if (typeof corridorEdgesSync==='function') corridorEdgesSync();
  toggleCls('startScreen','hidden', name!=='menu');
  toggleCls('pauseScreen','hidden', name!=='pause');
  toggleCls('hangarScreen','hidden', name!=='hangar');
  toggleCls('achScreen','hidden', name!=='ach');
  toggleCls('settingsScreen','hidden', name!=='settings');
  toggleCls('diagScreen','hidden', name!=='diag'); // v1.66.3: сервисный центр — свой экран
  toggleCls('feedbackScreen','hidden', name!=='feedback'); // 30.08.2026: написать разработчику
  toggleCls('modesScreen','hidden', name!=='modes');
  toggleCls('forgeScreen','hidden', name!=='forge'); // v1.68.0: конструктор трассы
  // v1.282.7: _fSkyRun нигде не сбрасывался обратно в false — однажды запущенный
  // (forgeSkyKick при первом входе в Кузницу) requestAnimationFrame-цикл превью-неба крутился
  // БЕСКОНЕЧНО до конца всей сессии, даже часы спустя, соревнуясь за кадр с настоящей игрой.
  if(name!=='forge' && typeof _fSkyRun!=='undefined' && _fSkyRun) _fSkyRun=false;
  toggleCls('cardScreen','hidden', name!=='card'); // v1.73.0: карточка для скриншота
  toggleCls('gameOverScreen','hidden', name!=='over');
  const inGame = (name==='game'||name==='pause');
  document.body.classList.toggle('flying', inGame); // v1.108.1: зум/жесты блокируются только тут, не везде
  toggleCls('hud','hidden', name!=='game');
  // 28.08.2026: на паузе владелец не хочет ни счёта собранных звёзд, ни расстояния/
  // плавности/жизней — только замёрзшее небо (фоновые звёзды канвасa) под меню.
  // Все HUD-накладки теперь гасятся одинаково — строго на 'game', как #hud/#pauseBtn.
  toggleCls('topHud','hidden', name!=='game'); // v1.46.0: верхняя панель одним рядом
  toggleCls('telemHud','hidden', name!=='game'); // v1.67.0: нативная шапка — телеметрия одной строкой под счётом
  toggleCls('livesCanvas','hidden', name!=='game');
  toggleCls('pauseBtn','hidden', name!=='game');
  // 28.08.2026: #dim (72% черноты, z-index:9) — настоящая вуаль паузы, найдена только сейчас;
  // #pauseScreen.background была обнулена раньше, но темноту всё это время давал этот, другой
  // слой. Владелец: «ровно как в игре» — больше не включаем его на паузе.
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
let theaterRecord=false; // v1.284.4: сцена — повтор чужого рекорда, а не спектакль дня. Читает goldstar (страж 126)
Store.del('runMode'); // v1.92.1: старая прописка любой дисциплины снимается — большая кнопка священна
Store.del('pact'); // v1.70.0: модификаторы удалённого режима больше не нужны
function setRunMode(m){ runMode=m; } // v1.92.1: сессия — живёт через «Ещё раз?» и рестарт из паузы, умирает в меню и на перезапуске
let runStartBusy=false;
function runStart(){
  if(runStartBusy) return;
  runStartBusy=true;
  try{ runMode==='bullet'?startBullet():startGame(); }
  finally{ setTimeout(()=>{ runStartBusy=false; },350); }
} // «ЛЕТЕТЬ» — в выбранной дисциплине; короткий lock защищает от двойного тапа
window.addEventListener('pointerdown', function tgImmKick(){ // полный экран просит жест — первый тап добирает, если автостарт не смог (v1.58.0; v1.477.27: не только во время полёта — погружение теперь живёт и в меню)
  if (typeof tgImmersion==='function') tgImmersion(true);
  window.removeEventListener('pointerdown', tgImmKick);
});
function modesFill(){ // подписи + отметка выбранного режима
  setText('modesTitle',L.modes);
  const put=(id,n,d)=>{ $(id).innerHTML='<span class="modeName">'+n+'</span><span class="modeDesc">'+d+'</span>'; };
  const tk=trackDayKey(); // v1.282.20: дверь дня — по общему времени, как и сама трасса
  /* v1.282.20: печать дня ставится в СПИСОК отыгранных дней, а не в одну запись.
     Одна запись снималась за двадцать секунд: перевёл часы телефона на завтра — запись
     перезаписалась завтрашней датой, вернул назад — дверь снова открыта, и так сколько
     угодно раз. Список помнит все дни (храним последние 10), поэтому возврат упирается
     в уже стоящую печать. */
  const dr=Store.get('dailyRun',null), usedN=(dr&&dr.d===tk)?(dr.n||0):dailyDoneGet(tk); // 23.08.2026 «5 попыток»: счётчик восстанавливается из журнала, если dailyRun не за сегодня (сброс хранилища)
  const dl = usedN>=5;
  const dbBest=Store.get('dailyBest',null), dbSc=(dbBest&&dbBest.d===tk)?dbBest.s:0;
  put('modeDaily',L.modeDaily, dl?L.dailyLocked(dbSc):L.modeDailyD+' · '+tk.slice(5,7)+'.'+tk.slice(0,4)+' · '+(usedN>0?L.dailyLeft(5-usedN):L.dailyOnce)); // 03.09.2026 «Небо месяца»: было tk.slice(8)+'.'+tk.slice(5,7) (день.месяц) — день теперь всегда «01», показывал бы «01.MM» всегда; месяц.год честнее
  toggleCls('modeDaily','locked',dl);
  put('modeBullet',L.bullet,L.modeBulletD); // v1.45.0 «Для Про»: Классика — на большой кнопке «Начать полёт», здесь только дисциплины
  put('modeSpeedrun',L.modeSpeedrun,L.modeSpeedrunD);
  const fl=Store.get('forgeLast',null); // v1.90.0: дверь помнит гостя — трасса ждёт за ней по имени (как последний курс в Course World)
  /* v1.282.13: имя чистим и на чтении. Все нынешние пути записи forgeLast уже проходят
     forgeSanitize, так что боевого вектора нет — но эта строка кладёт значение из Store
     прямо в innerHTML, а Store зеркалится из облака Telegram и переживает смену версий.
     Санация на чтении стоит один вызов и снимает целый класс «а если туда попало не то». */
  const flName=(fl&&fl.n&&typeof sanitizeTrackName==='function')?sanitizeTrackName(fl.n):(fl&&fl.n?String(fl.n).replace(/[<>&"'\\]/g,''):'');
  put('modeForge',L.modeForge,L.modeForgeD+(flName?' · «'+flName+'»':''));
  const sel={daily:'modeDaily',bullet:'modeBullet',speedrun:'modeSpeedrun'};
  for (const k in sel) $(sel[k]).classList.toggle('sel', k===runMode);
}
function runPassFill(){ // 30.08.2026 «Единый паспорт забега»: режим+управление одной тихой строкой сверху
  // (было продублировано пилюлей и значком в двух разных местах), все 8 чисел забега — одним
  // визуальным языком (.statGrid.stats4, та же плитка, что уже стоит на других экранах)
  const head=$('runHead'), grid=$('runPass'); if(!head||!grid) return;
  const names={classic:L.modeClassic,bullet:L.bullet,speedrun:L.modeSpeedrun,daily:L.modeDaily,custom:L.modeForge}; // v1.68.0: + своя трасса
  const mode=(typeof controlMode==='function')?controlMode():'touch';
  const ctlName=S.bullet?L.bullet:(mode==='gyro'?L.modeGyro:(mode==='keys'?L.modeKeys:L.modeTouch));
  head.innerHTML='<span>'+names[S.mode||'classic']+'</span><span class="runCtl">· '+ctlName+'</span>';
  const statCell=(v,l)=>'<div class="statCell"><b>'+v+'</b><span>'+l+'</span></div>';
  grid.className='statGrid stats4';
  grid.innerHTML=statCell(Math.floor(S.dist)+' '+(L.unitM||'м'),L.dist)+statCell(fmtTime(S.time),L.passTime)+
    statCell(S.starsCollected,L.stars)+statCell('×'+S.comboMax,L.maxCombo)+
    statCell(S.mission,L.missionLbl)+statCell(S.hits,L.passHits)+
    statCell(S.bonuses,L.passBonus)+statCell(Math.round(S.smooth*100)+'%',L.passSmooth)+
    statCell(S.nearMiss,L.nearMiss); // 05.09.2026: девятая ячейка — не додумывал точное место в сетке, владелец сам решит после первого показа (потом разберёмся)
}
/* ============================================================
   ПОКОЛЕНИЕ ЗАБЕГА (v1.282.20 «Ответ из прошлого»)

   Беда, которую это лечит: сетевой ответ живёт до 10 секунд, а забег — сколько
   угодно. Ответ, начатый в забеге N, спокойно прилетает в забег N+1 и пишет в
   свежее состояние старые данные. Все прежние защиты проверяли ЭКРАН («мы всё
   ещё на итогах?»), но экран итогов у следующего забега точно такой же — они
   пропускали устаревший ответ насквозь.

   Один монотонный счётчик решает весь класс: перед запросом снимаем номер, при
   ответе сверяем. Не совпало — молча уходим, ничего не трогая. Тот же приём уже
   годится в проекте для анимации счёта (scoreCountGen), просто сеть его не знала.
   ============================================================ */
let runGen=0;
function runNow(){ return runGen; }
function runSame(g){ return g===runGen; }
function startGame(saved){
  runGen++; // всё, что было заказано до этой строки, к нынешнему забегу больше не относится
  /* v1.282.14: автосейв возвращает СВОЮ дисциплину, а не Классику. Раньше восстанавливался
     только daily, поэтому прерванный забег по своей трассе (или Затишье, или Спидран)
     поднимался как классический: очки заведомо лёгкой самодельной карты уходили в общий
     рекорд, в кошелёк и в мировую таблицу. Прошлая версия закрыла соседнюю дверь (финиш
     custom стирает автосейв), но эта — «свернул приложение посреди забега» — осталась
     открытой, и ключ savedRun ещё и зеркалится в облако, то есть переживает смену телефона.
     theater исключён: из просмотра автосейв не рождается вовсе. */
  if (saved && saved.mode && saved.mode!=='theater') runMode=saved.mode; // v1.93 «Одна попытка»: крах не жжёт попытку — автосейв дня возвращает ровно в тот же прыжок
  audio(); keepAwake();
  if (typeof BEACON!=='undefined' && BEACON.deviceProfileProbe) BEACON.deviceProfileProbe(); // 27.08.2026: паспорт слабого борта — разрешение/DPR/ядра/дребезг кадров, разово за сессию, именно с момента взлёта (там настоящая нагрузка)
  /* 24.08.2026: initBg() раньше звалась ровно один раз при загрузке скрипта (js/game.js,
     верхний уровень) и ни разу больше — 140 фоновых звёзд оставались одним и тем же
     случайным полем на ВСЮ сессию, сколько бы забегов подряд ни было. Владелец видел
     «мигающую звезду под жизнями на одном и том же месте» дважды в разных диалогах —
     доказано покадровым замером видео (24.08.2026): не баг мерцания как такового
     (декоративный твинкл работает как задуман), а то, что скопление в этом пятне неба
     просто никогда не менялось между полётами одной вкладки. Каждый новый забег теперь
     получает свежее поле. */
  if (typeof initBg === 'function') initBg();
  const freshSeed = Math.floor(Math.random()*4294967296); // v1.280.0: чеканится один раз за забег — источник для Классики/Bullet ниже
  /* v1.282.15: ключ трассы называется ОДИН раз и живёт рядом с самим потоком — из него
     же шьются личные потоки каждого спавна (см. withTrack в core.js). Разъехаться им
     нельзя: иначе поле снова станет зависеть от того, что делал игрок. */
  mapSeedKey = runMode==='daily' ? trackDayKey() // v1.282.20: ключ трассы — по общему времени
    : runMode==='theater' ? String(theaterDay||trackDayKey())
    : runMode==='speedrun' ? (SPEEDRUN_ETERNAL_DAY+'·speedrun') // 03.09.2026 «Set Seed»: постоянный ключ, не привязан к дате вообще
    : runMode==='custom' && typeof forgeCfgGet==='function' ? String(forgeCfgGet().seed||0)
    : String(freshSeed);
  mapSeqReset();
  if (typeof nebulaReseed==='function') nebulaReseed(); // v1.282.15: узор туманностей — свой на забег; раньше он менялся раз в секунду прямо в полёте
  mapRNG = runMode==='daily' ? dailyRNG()
    : runMode==='theater' ? keyRNG(theaterDay||trackDayKey())
    : runMode==='speedrun' ? keyRNG(SPEEDRUN_ETERNAL_DAY+'·speedrun') // 03.09.2026 «Set Seed»: тот же поток каждый забег, навсегда — SSG, не по дню
    : runMode==='custom' && typeof forgeCfgGet==='function' ? keyRNG(String(forgeCfgGet().seed||0)) // v1.108.1: тот же код друга — та же расстановка, не только те же настройки
    : keyRNG(String(freshSeed)); // v1.280.0 «Честная Классика»: свой сид каждый забег — раньше был голый Math.random(), из которого нечего восстановить; призрак теперь может унести этот сид и показать те же самые препятствия при просмотре/гонке
  if (typeof gyroKick==='function' && typeof tgPkt==='number' && tgPkt===0) gyroKick(); // мост мог заглохнуть при загрузке — перезапуск по жесту «играть» (идемпотентно)
  if (typeof calReset==='function') calReset(false,undefined,'takeoff'); else { input.baseG=null; input.baseB=null; } // автокалибровка нуля на старте — из неподвижной позы (v1.4.5); v1.109.1: источник — каждый взлёт это честный сброс, не дребезг, но партии 18 не хватало его в разбивке
  input.tiltX=0; input.tiltY=0; // сброс low-pass — не тянет из меню
  tDown=false; tActive=false; input.touchX=null; input.touchY=null; // залипший жест (пропавший touchend в WebView) не паркует самолётик и не глушит гироскоп
  if (typeof echoReset==='function') echoReset(); // эхо-шлейф Призрака: чистый забег
  if (typeof trailHistReset==='function') trailHistReset(); // 04.09.2026: связные следы премиум (Лента/Нить-жемчуг) — чистый забег
  if (typeof graceReset==='function') graceReset(); // v1.108.1: новый забег — новый счёт благодати, лимит не переносится из прошлого полёта
  Object.assign(S,{running:true,paused:false,score:0,mission:1,lives:3,invuln:1.5,speed:3.4,dist:0,
    combo:0,comboMax:0,starsCollected:0,shield:0,magnet:0,slowmo:0,dash:0,time:0,flash:0,shake:0,hueShift:0,timeScale:1,dying:0,dyingT:0,pausing:0, // v1.40.0: Таран и часы полёта — с чистого листа
    gyroSec:0,manSec:0,touchSec:0,keysSec:0,mouseSec:0,smooth:1,bullet:false,bt:0,mode:runMode,hits:0,bonuses:0,nearMiss:0,srWin:0,seed:freshSeed, // v1.280.0: сид этого забега — призрак унесёт его с собой; touchSec/keysSec — честная категория, не тонут в общем manSec
    mapWin:0,customName:'',customE:0,customD:1,customS:1,customL:0,customW:1,customFlat:0,customB:2,customLv:3,customWG:0,customHS:0,customH1:232,customH2:200,customMood:50, // v1.282.14: customLv тоже сбрасывается — единственное поле семейства, которое переживало забег; v1.282.15: и признак поколения кода // v1.42.0: дисциплина и паспорт — с чистого листа; v1.68.0/v1.69.0: трасса — тоже; 31.08.2026: customHS — «Высокая ставка»; 01.09.2026: customH1/H2 — «Свой фон»; customMood — «Настроение неба»
  lastHitKind:'', wasRestored:0}); // v1.282.20: метка восстановленного забега — с чистого листа // v1.282.13: причина гибели ставится только в hitPlane и раньше нигде не стиралась — забег без удара наследовал препятствие ПРОШЛОГО забега, и Мозг неба подкручивал сложность под то, чего в этой попытке не было
  if(typeof BB!=='undefined') BB.log('takeoff', String(runMode||'')); // v1.99.7 «Чёрный ящик»: взлёт — на ленту
  prevTiltX=0; prevTiltY=0; prevTX=null; prevTY=null; lastSmoothShown=-1; // Smooth Flight: чистый замер
  smoothWasPerfect=true; // старт полёта = потолок плавности сам по себе, попап «Плавный полёт» не за это
  lastDistKm=0; // новый забег — золотая вспышка километров начинается с нуля, не с прошлого полёта
  if (typeof cinemaClipHide==='function') cinemaClipHide(); // 31.08.2026 «Момент полёта»: кнопка «Клип» не донашивает клип с прошлой посадки, если в ЭТОМ полёте запись не сработает
  S.dailyDay = runMode==='theater' ? theaterDay : (runMode==='daily' ? (saved&&saved.dailyDay ? saved.dailyDay : trackDayKey()) : ''); // v1.282.20: день соревнования общий // v1.93 «Одна попытка»: прыжок принадлежит дню взлёта — даже через полночь; v1.94.0: театр помнит день спектакля
  if (runMode==='daily' && !saved){ // 23.08.2026 «5 попыток»: счётчик +1 на взлёте — та же защита от читерства, что была у одной попытки, порог просто выше
    const dr0=Store.get('dailyRun',null), curN=(dr0&&dr0.d===S.dailyDay)?(dr0.n||0):dailyDoneGet(S.dailyDay); // после сброса хранилища — восстанавливаем счётчик из журнала, не начинаем с нуля
    const nextN=curN+1;
    Store.set('dailyRun',{d:S.dailyDay,n:nextN}); dailyDoneMark(S.dailyDay,nextN);
  } // попытка сгорает на ВЗЛЁТЕ — раньше жёсткое убийство процесса возвращало свежую
  if (runMode==='custom' && typeof forgeCfgGet==='function'){ // Своя трасса: конфиг автора на борт (v1.68.0, v1.69.0 — полная палуба)
    const fc=forgeCfgGet();
    const am=(typeof Adaptive!=='undefined')?Adaptive.mult():{d:1,s:1}; // v1.108.1 «Мозг неба»: множитель поверх авторских настроек, не вместо них
    /* v1.282.20: множитель Мозга ДЕЛИТ, а не умножает. customD попадает в паузу между
       спавнами (game.js), то есть меньшее значение = более плотное небо. Модуль отдаёт
       новичку d=0.6 в смысле «плотность 60%», а умножение превращало это в пазу ×0.6,
       то есть в НЕБО В 1.67 РАЗА ПЛОТНЕЕ. Измерено: разрыв между новичком и асом
       составлял 2.17× в пользу аса — ровно наоборот замыслу. Скорость (am.s) применяется
       к S.speed напрямую и была верна, её не трогаем. */
    S.customE=fc.e; S.customD=forgeDensityMul(fc.d)/(am.d||1); S.customS=forgeSpeedMul(fc.s)*am.s; S.customL=fc.l; S.customName=fc.n||L.forgeDefName;
    S.customW=fc.w; S.customFlat=fc.fl; S.customB=fc.b; S.customLv=fc.lv; S.customWG=fc.wg?1:0; S.customHS=fc.hs?1:0; // v1.282.15: старые коды (v1/v2) летят со старой раскладкой преград // потолок жизней автора — бонус-жизнь его не пробьёт (v1.70.0); 31.08.2026: «Высокая ставка»
    S.customH1=fc.h1; S.customH2=fc.h2; // 01.09.2026 «Свой фон»: forgeSanitize уже гарантирует оба поля (выводит из legacy sky, если автор не трогал свободный цвет явно)
    S.customMood=fc.mood; // 01.09.2026 «Настроение неба»: forgeSanitize гарантирует поле (50 по умолчанию — сегодняшний вид)
    S.customSc=Array.isArray(fc.sc)?fc.sc:[]; S.customScIdx=0; // 01.09.2026 «Расстановка — реальный эффект»: точки Партитуры едут на борт тем же приёмом, что и весь остальной авторский конфиг — game.js читает их через spawnObstacle()
    if(!saved){ S.lives=fc.lv; S.mission=fc.w; } // жизни и жара автора (автосейв честнее — не переписываем)
    // 01.09.2026 «Свой фон»: раньше — S.hueShift=fc.sky (дрейф стартовал со значения-индекса
    // палитры). Теперь базовый цвет живёт в customH1/H2 (см. render.js), а hueShift — просто
    // «сколько дрейфа накопилось с взлёта», стартует с нуля. Для старых кодов (без явного
    // цвета) customH1/H2 уже равны 232+fc.sky*.3/200+fc.sky*.3 — та же картинка в кадре 0,
    // что давала старая формула 232+fc.sky*.3 (проверено вручную, не только по формуле).
    S.hueShift=0;
    const fogEl=document.getElementById('fog');
    if(fogEl){ fogEl.classList.toggle('f1',fc.fog===1); fogEl.classList.toggle('f2',fc.fog===2); }
  } else { const fogEl=document.getElementById('fog'); if(fogEl){ fogEl.classList.remove('f1'); fogEl.classList.remove('f2'); } }
  /* v1.282.20 «Ничего не течёт из прошлого забега». Три утечки, найденные разбором:
     — plane.bank: занавес смерти доводит крен до 1.15, и новый забег стартовал с завалом на 36°;
     — prevKX/prevKY: положение клавиш переживало забег, и первый же кадр ронял плавность на 0.03
       (−1.5% к итоговому счёту ни за что) — единственная утечка, влиявшая на результат;
     — input.byMouse: метка мыши не снималась ничем, кроме следующего касания. */
  if (typeof plane!=='undefined' && plane) plane.bank=0;
  /* v1.282.20: у бесконечной Своей трассы step всегда -1, и флаг _t2 с прошлого забега делал
     условие ложным — табло не переписывалось НИ РАЗУ, весь полёт висело название прошлой трассы.
     Единственная найденная утечка, показывавшая игроку прямо неверные данные. */
  { const mh=document.getElementById('modeHud'); if(mh){ mh._t=0; mh._t2=undefined; } }
  if (typeof prevKX!=='undefined'){ prevKX=0; prevKY=0; }
  input.byMouse=false;
  rec=[]; recFrame=0; if (typeof morseArm==='function') morseArm(); // морзянка: позывной в шлейфе
  if (typeof goldReset==='function') goldReset(); // v1.100.2 «Золотая звезда дня»: маяк переставлен на этот взлёт (своим кубиком дня)
  /* v1.282.20: раньше сброс пропускался при восстановлении автосейва — и вёрсты оставались от
     ПРОШЛОГО забега: восстановленный на 1 км после забега на 4 км молчал всполохами до 5 км.
     Теперь чистим всегда, а вёрсты честно подводим под уже пройденное. */
  if (typeof planetReset==='function') planetReset();
  if (typeof morseDayCheck==='function') morseDayCheck(); // виброэфир: первый полёт дня (v1.54.0) // v1.87.0: призрак рекорда со старта убран — мотиваций хватает без тени
  if (typeof streakDayCheck==='function') streakDayCheck(); // v1.108.1: серия дней — тот же момент, тот же принцип
  if (typeof welcomeDayCheck==='function' && welcomeDayCheck() && typeof welcomeShow==='function') welcomeShow(); // 28.08.2026: «Добро пожаловать» — раз в день, тем же моментом
  if (!saved && typeof cinemaFirstFlightStart==='function'){ const gc=document.getElementById('game'); if(gc) cinemaFirstFlightStart(gc); } // 28.08.2026: «Кино полёта» — только самый первый полёт, не восстановленный автосейвом
  if (Store.get('cinemaTestArmed',0) && typeof cinemaTestStart==='function'){ Store.set('cinemaTestArmed',0); const gc=document.getElementById('game'); if(gc) cinemaTestStart(gc); } // 30.08.2026: разовый тест цены записи по кнопке в Сервисном центре
  if (typeof cinemaHighlightStart==='function'){ const gc=document.getElementById('game'); if(gc) cinemaHighlightStart(gc); } // 30.08.2026 «Момент полёта»: авто, без кнопки — сама решает по Q._baseFps, слот First Flight/Test не перехватывает
  S.dayKey = todayKey(); // 27.08.2026: день ВЗЛЁТА, читаем часы один раз — посадка (dayAdd) использует его же, а не читает часы заново
  if (typeof dayMark==='function') dayMark(S.dayKey); // v1.282.20 «Дневник борта»: день засчитывается на взлёте — забег может не долететь до отправки, день был
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
    // v1.282.20: возвращаем и то, что раньше обнулялось при восстановлении
    S.smooth=clamp(saneNumber(saved.smooth,1),.5,1); S.time=saneNumber(saved.time,0);
    S.hits=saneNumber(saved.hits,0); S.bonuses=saneNumber(saved.bonuses,0);
    S.goldStar=!!saved.goldStar; S.wasRestored=1;
    /* v1.284.11: у автосейвов, записанных до этой версии, поля `bullet` нет — для них
       восстанавливаем режим по дисциплине забега, иначе игрок, свернувшийся вчера,
       завтра доиграет Затишье как классику и получит рекорд в чужой категории. */
    S.bullet = (saved.bullet!=null) ? !!saved.bullet : (saved.mode==='bullet');
    // v1.282.20: вёрсты подводим ПОСЛЕ восстановления дистанции — иначе всполохи «каждая тысяча»
    // молчали бы от нуля до уже пройденного километража (страж П5, но с другой стороны двери)
    if (typeof PLANET!=='undefined' && PLANET && PLANET._poke) PLANET._poke('mile');
  }
  for(const o of obstacles)poolOb.give(o); obstacles=[];
  for(const s of stars)poolStar.give(s); stars=[];
  for(const p of powerups)poolPow.give(p); powerups=[];
  for(const p of particles)poolPart.give(p); particles=[];
  for(const p of popups)poolPop.give(p); popups=[];
  plane.x=W/2; plane.y=(typeof fieldT==='function'?fieldT()+fieldH()*.72:H*.72); plane.vx=0; plane.vy=0; // v1.282.20: старт от коридора — иначе на вытянутом экране самолёт стартовал ниже относительно поля
  spawnT=.8; starT=.4; powT=6; lastScoreShown=-1; lastDistShown=-1; // v1.36.0: первая подмога раньше — небо сразу показывает, что делится
  updateLives(); updateCombo(); updateStarsHud();
  setScreen('game');
  if (typeof tgImmersion==='function') tgImmersion(true); // погружение: полный экран + замок + защита (v1.58.0)
  toggleCls('modeHud','hidden', !(runMode==='speedrun'||runMode==='daily'||runMode==='custom'||runMode==='theater')); // HUD дисциплины (v1.42.0/v1.47.0/v1.68.0/v1.94.0; v1.70.0: Пакт удалён)
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
  if (typeof premSkinPerfReport==='function') premSkinPerfReport(); // 05.09.2026: диагностика fx-времени 30 доп. премиум-скинов — одно сообщение на посадку, не каждый кадр
  if (typeof cinemaFirstFlightStop==='function') cinemaFirstFlightStop(); // 28.08.2026: стоп до любого раннего return ниже — первый полёт всегда должен сохраниться, каким бы ни оказался финиш
  if (typeof cinemaTestStop==='function') cinemaTestStop(); // 30.08.2026: тот же порядок — до любого раннего return
  if (typeof cinemaHighlightStop==='function') cinemaHighlightStop(); // 30.08.2026 «Момент полёта»: тот же порядок — до любого раннего return
  /* v1.282.13: страховка кассы. В театре единственный выход — endTheater(); если сюда
     всё-таки попали (лента пропала, неуязвимость не встала), нельзя пускать зрителя по
     полному тракту посадки: он запишет статистику смертей, near-miss-очки уйдут в рекорд
     категории, а theaterTrack обнулится — кнопка «Смотреть полёт» исчезнет вместе с билетом.
     Корень закрыт в game.js, это второй замок на той же двери. */
  if (runMode==='theater' && typeof endTheater==='function'){ endTheater(); return; }
  S.running=false; S.paused=false; S.dying=0; S.pausing=0; // «Склейка»: все занавесы закрыты
  releaseAwake();
  if(typeof BB!=='undefined') BB.log('landing','score '+Math.floor(S.score)+' · '+S.mode); // v1.99.7 «Чёрный ящик»
  if (typeof playSecFlush==='function') playSecFlush(); // v1.66.1: секунды неба — в хранилище разом, не по одной
  const sc=Math.floor(S.score*(0.5+S.smooth*0.5)); // Smooth Flight: итог × плавность (0.75..1.0)
  if (S.mode==='custom' && typeof mapOver==='function'){ // Своя трасса: не в зачёт — иначе лёгкие карты стали бы фермой звёзд (v1.68.0); v1.94.0: театр здесь не ставится — занавес опущен
    /* v1.282.13: автосейв обязан сгореть ЗДЕСЬ. Ранний выход стоит выше общего
       Store.del('savedRun') в конце функции, а mapOver его не трогает — и автосейв
       своей трассы переживал финиш. Дальше он поднимался через bootFly() уже как
       КЛАССИКА (runMode для custom при восстановлении не возвращается), и очки
       самодельной лёгкой карты уходили в общий рекорд и в кошелёк — ровно то, от чего
       этот ранний выход и защищает. */
    Store.del('savedRun');
    // v1.282.13: победа — не гибель. Финиш трассы (S.mapWin) идёт через тот же gameOver(),
    // и Мозг неба записывал прошедшему трассу +1 забег и +1 «причину смерти», подкручивая
    // сложность под препятствие, о которое игрок не разбивался.
    if (!S.mapWin && typeof Adaptive!=='undefined') Adaptive.onDeath(S.time, S.lastHitKind); // v1.108.1 «Мозг неба»: тот же момент, что уже шлёт анонимную телеметрию — здесь только локально, для подстройки
    theaterTrack=null; toggleCls('watchBtn','hidden',true); mapOver(sc); return;
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
  if (S.mode==='speedrun' && S.srWin && !S.wasRestored){ // v1.282.20: часы восстановленного забега начинались бы с нуля — такой рекорд нечестен
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
  setText('myRank',''); // ранг прошлого забега не течёт в этот
  webJoinFill(); // гость видит мостик: «войди — и полёт в общей таблице» (v1.51.0)
  setText('finalScore',sc); // синхронно финал — для мгновенного отображения и тестов
  const sg=++scoreCountGen, fsEl=$('finalScore'), t0=performance.now(); // count-up 0→sc за 0.8s
  requestAnimationFrame(function tick(now){
    if(sg!==scoreCountGen || screenName!=='over') return; // устаревший цикл молчит
    const k=Math.min(1,(now-t0)/800);
    fsEl.textContent=String(Math.round(sc*(1-Math.pow(1-k,3)))); // easeOutCubic
    if(k<1) requestAnimationFrame(tick);
  });
  /* 02.09.2026 «Медали над результатом»: рекорд по типу управления/дистанции — золотая
     медаль с настоящей иконкой игры + цветная лента, НАД счётом (#recordMedals), а не
     плашкой под ним — три раунда макетов у владельца перед этой версией (см. index.html,
     комментарий у #recordMedals). Остальные особые моменты (спидран/трасса дня/призрак/
     пасхалки) остаются старыми текстовыми плашками ниже — их текст динамический (имя
     соперника, время), под формат «золотая медаль + короткая подпись» не ложится. */
  const MEDAL_CAT = {
    touch:  { cls:'cat-touch',  icon:'i-medal-touch',  vb:'0 -960 960 960', label:L.recordTouch },
    gyro:   { cls:'cat-gyro',   icon:'i-medal-gyro',   vb:'0 0 24 24',      label:L.recordGyro },
    keys:   { cls:'cat-keys',   icon:'i-medal-keys',   vb:'0 0 24 24',      label:L.recordKeys },
    bullet: { cls:'cat-bullet', icon:'i-medal-bullet', vb:'0 0 24 24',      label:L.recordBullet },
    dist:   { cls:'cat-dist',   icon:'i-medal-dist',   vb:'0 0 24 24',      label:L.recordDist },
  };
  function medalHTML(cat, delayMs){
    const m=MEDAL_CAT[cat];
    return '<div class="medalCol" style="animation-delay:'+delayMs+'ms">'
      +'<div class="medalBox">'
      +'<svg class="medalRibbon '+m.cls+'" viewBox="0 0 60 64"><use href="#i-medal-ribbon"></use></svg>'
      +'<svg class="medalDisc" viewBox="0 0 60 64"><use href="#i-medal-disc"></use></svg>'
      +'<svg class="medalIcon" viewBox="'+m.vb+'"><use href="#'+m.icon+'"></use></svg>'
      +'</div>'
      +'<div class="medalCap">'+m.label+'</div>'
      +'</div>';
  }
  const medals=[];
  if (isRecord) medals.push(medalHTML(S.bullet?'bullet':(mode==='gyro'?'gyro':(mode==='keys'?'keys':'touch')), 0));
  if (isDistRecord) medals.push(medalHTML('dist', medals.length*80));
  setHTML('recordMedals', medals.join(''));

  // остальные особые моменты — золотые плашки в ряд с иконками категорий (не строки текста)
  const recChips=[];
  if (S.mode==='speedrun' && S.srWin) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('timer')+(srNewBest?L.srNewBest:L.srFinish)+' '+fmtTime(S.time)+'</span>');
  if (S.mode==='daily' && sc>0){ // рекорд трассы дня (v1.47.0): свой день — свой рекорд; v1.93: зачёт — в день взлёта, даже через полночь
    const dd=S.dailyDay||trackDayKey();
    const prevDl=Store.get('dailyBest',null), prevDlSc=(prevDl && prevDl.d===dd)?prevDl.s:0;
    if (sc>prevDlSc){ Store.set('dailyBest',{d:dd,s:sc});
      recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('plane')+L.dlNewBest+'</span>'); }
  }
  if (S.mode==='daily'){ runMode='classic'; } // 23.08.2026 «5 попыток»: счётчик уже увеличен на взлёте (dailyBest уже обновлён выше) — здесь только режим возвращается к classic
  if (ghostBeatNow) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('ghost')+' '+L.ghostBeat(ghostName,sc,ghostBest)+'</span>');
  // v1.108.1 «Пасхалки заговорили»: e42/e9000/e1337 взводились в Stats и молчали — теперь есть момент
  if (distM===42) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg42+'</span>');
  if (sc>9000) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg9000+'</span>');
  if (sc===1337) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('target')+L.egg1337+'</span>');
  setHTML('newRecord', recChips.join(''));
  /* v1.282.14: возвращаем блоки, которые мог спрятать финиш своей трассы. mapOver гасит
     #stats и #runPass, а снимал этот hidden кто-то — никто: во всём проекте нет ни одного
     remove('hidden') для них. После одного забега по своей трассе «Подробности полёта» на
     всех последующих обычных итогах оставались без сетки и паспорта до перезагрузки
     страницы — притом что gameOver честно писал в них innerHTML. */
  toggleCls('stats','hidden',false); toggleCls('runPass','hidden',false); toggleCls('runHead','hidden',false);
  if (typeof cardCapture==='function') cardCapture(sc,{rec:isRecord||srNewBest}); // v1.73.0: карточка для скриншота — данные итога на борт
  const cardBtnEl=$('cardBtn'); if(cardBtnEl) cardBtnEl.classList.remove('hidden'); // v1.282.10: настоящий забег — кнопка снова видна, если Театр её прятал раньше в этой сессии
  setText('toRecord', (!isRecord && sc>0 && prevCat>sc) ? L.toRecord+(prevCat-sc) : ''); // мотивация: сколько не хватило
  const nl=(typeof achNextLoc==='function')?achNextLoc():null; // космическая шкала: «До Луны: 200 м»
  setText('toLoc', nl ? L.toLoc(aT(nl).n, fmtN(nl.need-Stats.totalDist)) : '');
  if (typeof achCheck==='function') achCheck(); // достижения: проверка после забега
  const dl=duelGet();
  const duelWinNow=!!(dl && distM>dl.best); // победа в дуэли — сервер оповестит вызвавшего (проверит по своим данным)
  const syncExtra={};
  if (duelWinNow) syncExtra.duel_win=dl.pid;
  if (ghostBeatNow){ syncExtra.ghost_beat=ghostPid; syncExtra.ghost_cat=ghostCat; } // сервер сам сверит свежий рекорд с его планкой
  /* v1.282.13 «Сначала рекорд, потом призрак». Раньше submit и ghost_up уходили с этого
     экрана одновременно, наперегонки. Сервер сверяет присланную ленту с УЖЕ записанным
     рекордом и честно отбивает ghost_up как 403 unverified — а рекорд в этот момент ещё
     летел по сети. Итог: призрак рекордного забега не сохранялся НИКОГДА; в таблице
     оседали только ленты забегов слабее серверного максимума (в базе это видно прямо:
     у каждого сохранённого призрака best ниже, чем best в scores той же категории).
     Порядок теперь честный: ждём ответа на submit, потом шлём ленту.
     Тот же порядок нужен и живому рангу ниже — «твоё место в мире» считалось по ещё
     не записанному результату, то есть по прошлой цифре. */
  /* v1.282.20: к отправке прикладывается ПАСПОРТ этого забега. Раньше на сервер уходил
     только срез локальных рекордов — то есть содержимое хранилища, а не результат игры:
     проверить там было нечего в принципе. Теперь рядом едут счёт, пробег, длительность,
     категория, сид и режим. Сервер уже сегодня может отбить невозможное (очки без
     времени, счёт выше потолка скорости), а завтра — воспроизвести трассу по сиду и
     сверить её с лентой призрака: поле стало детерминированным в v1.282.15, половина
     этой работы уже сделана. Поле незнакомое, старый сервер его просто игнорирует. */
  const runPass = { cat:cat, score:sc, dist:distM, sec:Math.round(S.time),
                    seed:S.seed, mode:S.mode, restored:S.wasRestored?1:0,
                    v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?') };
  /* 27.08.2026 «Replay-защита записи рекорда» (S5, шаг 3 из трёх запрошенных владельцем):
     одна строка на ЭТОТ забег, не на одну попытку отправки — генерируется здесь один раз
     и едет внутри syncExtra, а значит переживает сетевые ретраи того же забега (см. пометку
     v1.282.14 у syncFlush в sync.js: занятую линию не подменяем, становимся в очередь —
     тот же объект с тем же nonce уйдёт повторно, если первая попытка не долетела). Сервер
     (cosmogram-sync) гасит nonce атомарно при первом успехе — второй раз тот же не пройдёт. */
  const runNonce = (()=>{ try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2); })();
  /* v1.282.20 «Дневник борта»: посадка пишет строку дня. Счётное — всегда, поведенческое
     (режим, способ управления, от чего погиб) — внутри dayAdd только при разрешённых отчётах. */
  if (typeof dayAdd==='function') dayAdd({ score:sc, dist:distM, sec:Math.round(S.time),
    stars:S.starsCollected, mode:(S.mode||runMode||'classic'), ctl:cat,
    death:(S.mapWin?'win':(S.lastHitKind||'?')), day:S.dayKey }); // day: тот же день, что и на взлёте (см. startGame) — не читаем часы заново
  const submitP = (typeof syncSubmit==='function')
    ? syncSubmit(syncLocalScores(), Object.assign({run:runPass, nonce:runNonce,
        profile:(typeof playerProfile==='function'?playerProfile():null),
        days:(typeof daysToSend==='function'?daysToSend():null)}, syncExtra)) // честная таблица: локальные рекорды + паспорт забега + дневник → сервер (тихо)
    : null;
  /* v1.282.20: сервер подтверждает принятые дни — только после этого перестаём их слать.
     Не «отправили и забыли»: без сети, без входа или при отказе сервера дневник обязан
     дождаться следующей посадки, иначе дни теряются молча — ровно та беда, что уже была
     у «Почты неба» (HTTP 200 не значит «дело сделано»). */
  Promise.resolve(submitP).then(d=>{ if(d && d.ok && d.days_ack && typeof daysAck==='function') daysAck(d.days_ack); }).catch(()=>{});
  /* «Гость виден»: у невошедшего строка выше не сделает ничего — syncSubmit() вернулся
     на первой же проверке. Его дневник везёт анонимный канал «Почты неба»; внутри
     BEACON.days() стоит обратная проверка, поэтому у вошедшего этот вызов молчит. */
  if (typeof BEACON==='object' && BEACON && typeof BEACON.days==='function') BEACON.days();
  const afterSubmit = Promise.resolve(submitP).catch(()=>{}); // отправка молчит о сбоях — экран итогов не должен от них зависеть
  // призрак рекорда — в топ: трек + мой скин (все живые категории, включая Bullet — v1.280.0; шеринг включён; тихо, как таблица)
  const trackForGhost = (rec.length>=20 && typeof ghostPack==='function') ? ghostPack(rec) : null;
  /* v1.282.20: скин и сид ЭТОГО забега снимаем сейчас, а не в момент ответа сервера. Раньше они
     читались из живого S внутри колбэка: игрок жал «ещё раз», S.seed становился новым — и лента
     рекордного забега уезжала на сервер с сидом ЧУЖОГО неба. Скачавший такого призрака летел по
     другой трассе, а будущая серверная сверка по сиду отбила бы честный рекорд как подделку. */
  const ghSkin=S.skin, ghSeed=S.seed;
  /* v1.284.5: выгрузка ленты больше НЕ стоит за тумблером. Лента — доказательство рекорда,
     а не украшение: пока результат заявлен в общей таблице, его должно быть можно посмотреть
     и воспроизвести. Скрывший призрака по-прежнему невидим чужим (сервер спрашивает
     share_ghost при выдаче) — но улика существует. Страж 128. */
function ghostUpload(category, track, skin, best, seed){
  /* v1.400.4 «Лента не тонет молча»: syncGhostUp() в sync.js честно возвращает true/false
     по ответу сервера (r.ok — включая отказ 403 unverified, когда best разошёлся с тем,
     что реально осело в scores после серверных ограничителей). Но раньше этот результат
     никто не читал: afterSubmit.then(()=>syncGhostUp(...)) без .then(ok=>...) и без .catch.
     Неудачная загрузка пропадала бесследно — рекорд навсегда оставался без ленты до
     следующего личного рекорда в этой категории. В боевой базе на 12.08.2026: 30 из 35
     рекордов без ленты вообще. Теперь неудача видна — и в самописце, и в «Почте неба». */
  if (typeof syncGhostUp!=='function') return Promise.resolve();
  return syncGhostUp({category, track, skin, best, seed}).then(ok=>{
    if (ok) return;
    if (typeof BB!=='undefined' && BB.log) BB.log('ghost','upload failed: '+category);
    if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('ghost_fail', category);
  });
}
  if (isRecord && trackForGhost)
    afterSubmit.then(()=>ghostUpload(cat, trackForGhost, ghSkin, sc, ghSeed));
  // v1.280.0 «Хартия»: дистанция — тоже честная категория с призраком, отдельно от того, каким способом её пролетели
  if (isDistRecord && trackForGhost)
    afterSubmit.then(()=>ghostUpload('dist', trackForGhost, ghSkin, distM, ghSeed));
  // v1.100.1 «Трибуна чемпиона»: прыжок дня уходит в зал — результат всегда, лента (коридорные координаты) едет тоже всегда
  // (22.08.2026: скрыть её больше нельзя — тот же принцип «улика, не украшение», что и у обычных призраков)
  if (S.mode==='daily' && sc>0 && !S.wasRestored && rec.length>=20 && // v1.282.20: восстановленный прыжок дня в зал не идёт
    typeof syncDailySubmit==='function' && typeof ghostPackDaily==='function')
    syncDailySubmit({ day:S.dailyDay||trackDayKey(), score:sc, skin:S.skin, star:!!S.goldStar,
      track: ghostPackDaily() });
  // 03.09.2026 «Спидран получает свою таблицу»: тот же приём, что у Трассы дня — только
  // реально добежавший до цели (srWin), не восстановленный забег (часы начались бы с нуля).
  if (S.mode==='speedrun' && S.srWin && !S.wasRestored && rec.length>=20 &&
    typeof syncSpeedrunSubmit==='function' && typeof ghostPackDaily==='function')
    syncSpeedrunSubmit({ day:SPEEDRUN_ETERNAL_DAY, time_sec:S.time, skin:S.skin, // 03.09.2026 «Set Seed»: постоянный ключ
      track: ghostPackDaily() });
  // живой ранг: своё место в мире (только Telegram; прилетит асинхронно, экран не ждёт)
  if (typeof syncTop==='function' && syncAvailable()){
    const rankCat=cat; // v1.280.0: та же категория, что и везде — раньше здесь отдельно повторялась своя логика, включая пропущенную ветку keys
    const genR=runNow();
    afterSubmit.then(()=>syncTop(rankCat)).then(d=>{ // v1.282.13: после записи рекорда — иначе ранг считается по прошлой цифре
      if(!runSame(genR)) return; // v1.282.20: ранг прошлого забега не печатается на свежих итогах
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
    }).catch(()=>{}); // v1.282.13: ранг — украшение, его сбой не должен всплывать необработанным отказом
  }
  // дуэль: сравнение чистого пробега с планкой друга (любой забег участвует)
  if (dl){
    const win = duelWinNow;
    if (win){
      Stats.duelsWon=(Stats.duelsWon||0)+1; saveStats();
      setHTML('duelRes', '<span class="duelWin">'+L.duelWin(dl.name,dl.best)+'</span>');
      duelSet(null); // вызов закрыт победой
      if (typeof achCheck==='function') achCheck(); // «Победитель дуэли»
    } else {
      setHTML('duelRes', '<span class="duelLose">'+L.duelLose(dl.name,dl.best)+'</span>');
    }
    haptic(win?'success':'light');
  } else setHTML('duelRes', '');
  toggleCls('duelBtn','hidden',false); // «Вызов» виден всегда: вне Telegram тап объяснит, как его включить
  if (typeof starStatusGate==='function') starStatusGate(isRecord||isDistRecord); // v1.98.0 «Звезда-статус»: рекорд → искра в статус (Premium, мост 8.0)
  // 30.08.2026 «Единый паспорт забега»: числа этого забега и режим+управление переехали в
  // runPassFill() (#runHead/#runPass) — здесь остаются только рекорды по управлению, подписанные,
  // не вперемешку с числами текущего забега (владелец: старая раскладка «сложная и непонятная»).
  const bestPill=(icn,v)=>'<span class="miniPill">'+ic(icn)+'<b>'+v+'</b></span>';
  setHTML('stats',
    '<div class="bestLbl rise" style="animation-delay:120ms">'+L.bestByControl+'</div>'+
    '<div class="bestPills rise" style="animation-delay:200ms">'+
      bestPill('phone',saneNumber(Store.get('bestGyro',0),0))+
      bestPill('hand',saneNumber(Store.get('bestTouch',0),0))+
      bestPill('keys',saneNumber(Store.get('bestKeys',0),0))+
      bestPill('timer',saneNumber(Store.get('bestBullet',0),0))+
      bestPill('ruler',saneNumber(Store.get('bestDist',0),0)+' '+(L.unitM||'м'))+
      bestPill('nearmiss',saneNumber(Stats.nearMiss,0))+ // 05.09.2026: пожизненный счётчик уже копился (game.js), но нигде не показывался игроку — i-nearmiss в SVG-наборе уже был, просто не подключён
    '</div>');
  runPassFill(); // паспорт забега (v1.42.0)
  tryOnRevert(); // примерка: забег окончен — возвращаем свой скин (нет «ЕЩЁ РАЗ» с чужим)
  music.sting(isRecord?'record':'death'); // кода: фанфары рекорда или три ноты вниз
  music.stop(2); // музыка полёта уходит, кода звучит поверх тишины
  engine.stop();
  // v1.11.0 «Ни одной лишней механики»: гостей больше нет — gfxHint вычеркнут (v1.27.0), совет стоит один
  toggleCls('overMore','hidden',true); toggleCls('overDetailsBtn','open',false); // v1.84.0: спойлер каждый финиш свёрнут
  theaterTrack = (S.mode==='daily' && rec.length>=20)
    ? { xs:rec.map(r=>r[0]/91), ys:rec.map(r=>r[1]/91), ds:rec.map(r=>r[2]) }
    : null; // v1.94.0 «Театр призраков» Т1: билет снимается со свежего финиша — потом лента может уйти под новый забег
  if (theaterTrack) theaterDay=S.dailyDay||trackDayKey();
  theaterChamp=null; champTrack=null; theaterRecord=false; // v1.100.1: свежий финиш — сцена снова твоя, гость уходит за кулисы до нового зова. v1.284.4: и признак «повтор рекорда» гаснет, иначе следующий спектакль дня остался бы без золотой звезды
  toggleCls('watchBtn','hidden', !theaterTrack); // «Смотреть полёт» — только с билетом: честный забег дня с живой лентой
  toggleCls('tribuneBtn','hidden', !theaterTrack || typeof syncDailyChampion!=='function' || !syncAvailable()); // «Трибуна чемпиона» — рядом с билетом: день завершён, можно смотреть мастера
  toggleCls('goldChip','hidden', !(S.mode==='daily' && S.goldStar)); // v1.100.2: знак дня сияет рядом с рекордными плашками
  toggleCls('dayStats','hidden',true); // счётчик звезды прилетит асинхронно — экран не ждёт
  if (S.mode==='daily' && typeof syncDailyStats==='function' && syncAvailable())
    (genS=>syncDailyStats(S.dailyDay||trackDayKey()).then(st=>{ // «сегодня её взяли N из M» — чувство живого мира без гонки
      if (!runSame(genS)) return; // v1.282.20: счётчик звезды дня не зажигается на итогах классики
      if (st && st.ok && screenName==='over'){ $('dayStats').textContent=L.goldStarStats(st.catchers,st.flyers); $('dayStats').classList.remove('hidden'); } }))(runNow());
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
/* v1.282.20/23.08.2026: журнал отыгранных дней — защита «пяти попыток» от смены часового
   пояса и от сброса локального хранилища. Раньше хранил просто список дней (одна попытка =
   один факт «играл»/«не играл»). Теперь трасса дня разрешает 5 попыток — журнал обязан
   помнить ЧИСЛО, не только факт, иначе сброс хранилища посреди дня возвращает свежие 5
   попыток заново. Старые записи-строки (версия «одна попытка», уже стоят у части игроков)
   мигрируют в {d,n:5} — трактуются как полностью использованные, чтобы никому не подарить
   лишние попытки задним числом при обновлении игры. */
function dailyDoneList(){
  const raw = saneArray(Store.get('dailyDone',[]),[]);
  return raw.map(x => typeof x==='string' ? {d:x,n:5} : (x && typeof x.d==='string' && typeof x.n==='number') ? x : null).filter(Boolean);
}
// 24.08.2026: dailyDoneHas(d) убрана — ни разу не вызывалась нигде в коде. Была булевым
// «сыграл/не сыграл» до системы «5 попыток»; заменена dailyDoneGet(d), который вернулся
// счётчиком, а не флагом, и используется во всех трёх местах, где раньше стояла эта пара.
function dailyDoneGet(d){ const e=dailyDoneList().find(x=>x.d===d); return e ? e.n : 0; }
function dailyDoneMark(d, n){
  if(!d) return;
  const list = dailyDoneList().filter(x=>x.d!==d);
  list.push({d, n});
  Store.set('dailyDone', list.slice(-10)); // десяти дней хватает: назад дальше не отмотать незаметно
}
function toMenu(){
  if(S.running){
    if (runMode==='theater'){ endTheater(); return; } // v1.94.0: «Меню» из театра — тихий занавес обратно на итоги, не в дом
    if (S.mode==='daily'){ // 23.08.2026 «5 попыток»: сошёл с трамплина — прыжок засчитан как есть, тихо, без экрана итогов
      const sc=Math.floor(S.score*(0.5+S.smooth*0.5)), dd=S.dailyDay||trackDayKey();
      const prevDl=Store.get('dailyBest',null);
      if (sc>0 && sc>((prevDl&&prevDl.d===dd)?prevDl.s:0)) Store.set('dailyBest',{d:dd,s:sc});
      runMode='classic'; // счётчик попыток уже увеличен на взлёте — здесь только режим и лучший счёт
      /* v1.282.13: и автосейв дня сгорает вместе с попыткой. Дверь в меню запирается
         счётчиком n>=5 (modesFill), но bootFly() эту дверь обходил: при следующем
         запуске он читал уцелевший savedRun и возвращал игрока в тот же прыжок с
         сохранённым прогрессом, а финиш переписывал dailyBest — попытка не сгорала
         по-настоящему. Стирание savedRun здесь — та же защита, что и раньше. */
      Store.del('savedRun');
    }
    S.running=false; S.paused=false; S.dying=0; S.pausing=0; releaseAwake();
    if(typeof BB!=='undefined') BB.log('landing','menu exit · score '+Math.floor(S.score)); // v1.99.8: добровольный уход — тоже посадка на ленте
  }
  tryOnRevert(); // бросил примерочный забег — примерка закончилась
  refreshMenu();
  setScreen('menu');
  music.start('menu'); // вернулись в меню — медленные пэды
  engine.stop(); // в меню самолётик молчит
}
function endTheater(){ // v1.94.0 «Театр призраков» Т1: занавес — спектакль кончился, возвращаемся на итоги; книги и касса не тронуты
  S.running=false; S.paused=false; S.dying=0; S.pausing=0; releaseAwake();
  runMode='classic'; // сессия снова чиста — дом просыпается классикой
  music.stop(1); engine.stop();
  // v1.282.10: карточка для скриншота не вызывается для Театра (cardCapture зовётся только из
  // gameOver/mapOver, эта функция — отдельный путь) — но сама кнопка «Карточка» на экране итогов
  // видна всегда, без разбора. Нажми её после спектакля — увидишь чужие/устаревшие данные от
  // последнего настоящего забега (или нули, если такого забега в этой сессии ещё не было),
  // будто это твой результат. Прячем кнопку именно для этого захода на итоги.
  const cb=$('cardBtn'); if(cb) cb.classList.add('hidden');
  /* 22.08.2026 «Театр не выдаёт чужой результат за свой»: раньше чистился только cardBtn,
     а finalScore/newRecord/stats/runPass/myRank/duelRes/toRecord/toLoc/goldChip/dayStats/
     statusBtn оставались от ПРЕДЫДУЩЕГО настоящего забега — зритель спектакля видел цифры,
     будто это его полёт. Тот же приём, что уже применён к cardBtn: явно чистим/прячем,
     не оставляем как есть. Найдено в ПЛАН-1.284.2.md. */
  const fsEl=$('finalScore'); if(fsEl) fsEl.textContent='';
  const nr=$('newRecord'); if(nr) nr.innerHTML='';
  const rm=$('recordMedals'); if(rm) rm.innerHTML=''; // 02.09.2026: та же чистка, что у newRecord — театр не должен показывать чужую медаль
  const st=$('stats'); if(st){ st.innerHTML=''; st.classList.add('hidden'); }
  const rp=$('runPass'); if(rp) rp.classList.add('hidden');
  const rh=$('runHead'); if(rh){ rh.innerHTML=''; rh.classList.add('hidden'); } // 30.08.2026: новая строка режима+управления — та же чистка, что у соседей
  const mr=$('myRank'); if(mr) mr.textContent='';
  const dr=$('duelRes'); if(dr) dr.innerHTML='';
  const tr=$('toRecord'); if(tr) tr.textContent='';
  const tl=$('toLoc'); if(tl) tl.textContent='';
  const gc=$('goldChip'); if(gc) gc.classList.add('hidden');
  const ds=$('dayStats'); if(ds){ ds.textContent=''; ds.classList.add('hidden'); }
  const sb=$('statusBtn'); if(sb) sb.classList.add('hidden');
  setScreen('over');
}

/* v1.6.0 «Сразу в полёт»: любой запуск (кроме первого обучения и дуэльной ссылки) — сразу геймплей.
   Меню больше не парадное крыльцо, а чёрный ход через паузу. */
function bootFly(){
  const saved = Store.get('savedRun', null);
  startGame(saved || undefined); // автосейв — возвращаем ровно в тот же полёт
  // v1.282.20: благодать на разгон — только свежему взлёту. Восстановленному забегу она
  // давала 2.5 секунды неуязвимости за каждый перезапуск, то есть бесконечный полёт циклом
  // «закрыл приложение перед ударом — открыл заново».
  if(!saved) grantGrace(2.5); // v1.108.1: через общий лимит
}
function refreshMenu(){
  /* 13.08.2026 «Главный экран — дверь, а не витрина»: отсюда убраны шесть чисел —
     лучший счёт, кошелёк и четыре рекорда по видам управления. Они не пропали:
     рекорды показывает разбор забега и экран Достижений, кошелёк — Ангар. Пятого
     рекорда (клавиатура) в этой строке не было вовсе, и это было отдельной бедой —
     человек, играющий только клавиатурой, не видел строки совсем. Убрав строку,
     мы закрыли и её. Страж 110. */
  gridBalance($('menuRow')); // v1.45.0: «Продолжить полёт» убран — перезапуск сам возвращает в небо (bootFly), в сессии есть пауза // «Единая палуба»: сетка меню без одиноких половинок
  if (typeof duelBanner==='function') duelBanner(); // дуэль: плашка вызова в меню
  if (typeof firstFlightRefresh==='function') firstFlightRefresh(); // 28.08.2026: «Первое воспоминание» — карточка появляется, если запись есть
}
function autosave(){
  /* v1.282.14: занавес смерти не сохраняем. pauseGame честно отказывается работать при
     S.dying, но onHidden зовёт autosave() отдельной строкой, мимо этого стража. Игрок,
     свернувший приложение в те 0.9с, пока идёт занавес последней жизни, получал записанный
     забег с lives=0 → при восстановлении clamp поднимал их до 1, и смерть просто не
     случалась: ни статистики, ни submit, а счёт целиком на месте. Детерминированный обход. */
  if(S.running && runMode!=='theater' && !S.dying && S.lives>0){ // v1.94.0: театр не оставляет автосейва — из просмотра не рождается «второй шанс»
    /* v1.282.20: в автосейв кладём и то, что раньше терялось. Прежде восстанавливались
       только счёт/волна/жизни/дистанция/звёзды — а плавность, часы полёта и паспорт
       начинались с чистого листа. Это был готовый приём: перед неизбежным ударом закрыть
       мини-апп и открыть заново — счёт целиком на месте, множитель плавности с 0.75
       подскакивает до 1.0 (+33% к итогу), часы Спидрана обнуляются (рекорд «за 10 секунд»),
       благодать выдаётся заново. Флаг wasRestored помечает такой забег: рекорд Спидрана и
       знак дня он больше не приносит. */
    /* v1.284.11: `bullet` в автосейве. Затишье — не дисциплина, а флаг поверх классики:
       `runMode='bullet'` доезжает через `mode`, а сам `S.bullet` ставит только startBullet().
       Без этого поля восстановленный забег летел без механики Затишья, а на посадке
       категория считалась как `S.bullet?'bullet':controlMode()` и очки ложились в `bestTouch` —
       и тот же ярлык уезжал в мировую таблицу. */
    Store.set('savedRun',{score:S.score,mission:S.mission,lives:S.lives,dist:S.dist,bullet:!!S.bullet,
      smooth:S.smooth,time:S.time,hits:S.hits,bonuses:S.bonuses,goldStar:!!S.goldStar,restored:1,
      starsCollected:S.starsCollected,comboMax:S.comboMax,hueShift:S.hueShift,mode:S.mode,dailyDay:S.dailyDay||''}); // v1.93: крах дня помнит дисциплину и день взлёта
  }
}

/* ---------- Настройки (звук, язык, гироскоп, помощь) ---------- */
let settingsFrom='menu'; // куда вернуться: меню или пауза
let langPref='auto';
function openSettings(from){ settingsFrom=from||'menu'; refreshGyroLock(); rowSw('setBeaconBtn', Store.get('beaconOn',1)===1); againLabel(); setScreen('settings'); gyroStatus(); setWellFill(); sfx.click(); } // v1.91.0: шёпот самочувствия — свежий при каждом входе // v1.45.0: замок гироскопа — свежий при каждом входе; v1.66.1: диагностика датчика — свежая при входе (в полёте она в DOM не пишется); v1.107.0: и выключатель почты — честный при входе
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
  document.documentElement.lang=eff; // KNOWN-BUGS.md: скринридер иначе всегда читает по русским правилам произношения
  // v1.108.1 «Манифест говорит на своём языке»: паспорт приложения (имя/описание при установке)
  // подстраивается под тот же язык, что и сама игра — не только internal L. Новый язык интерфейса
  // добавляется тем же способом: файл manifest.XX.json + одна строка в MANIFEST_BY_LANG.
  const MANIFEST_BY_LANG={ru:'manifest.ru.json', en:'manifest.en.json', es:'manifest.es.json', pt:'manifest.pt.json', fr:'manifest.fr.json'};
  const mLink=document.getElementById('manifestLink');
  if(mLink) mLink.href=MANIFEST_BY_LANG[eff]||MANIFEST_BY_LANG.ru;
}

/* ---------- Ангар (Блок 4/7: магазин за внутриигровые ✦) ---------- */
/* v1.282.20: «Примерка» удалена из игры по решению владельца.
   Была: один забег в день любым некупленным скином. Убрана целиком — кнопка, логика
   примерочного забега, ключ tryOn в хранилище и строки словаря во всех пяти языках.
   Причина: у неактивной кнопки не было своего слушателя, клик всплывал на карточку и
   молча покупал скин за звёзды. Дыру закрыли (страж 45), но фичу решили не держать.
   tryOnRevert оставлен пустой заглушкой: его зовут три места (gameOver, toMenu, mapOver),
   и тихая заглушка безопаснее, чем правка трёх путей выхода из забега ради удаления. */
function tryOnRevert(){}
let scoreCountGen=0; // поколение анимации count-up счёта на итогах

/* ============================================================
   АНГАР — витрина (13.08.2026, страж 112)

   Прежний ангар был списком товаров: девять строк, у каждой свой холст, и на каждый
   выбор — list.innerHTML='' и полная пересборка с каскадом анимации. Экран мигал,
   скролл прыгал вверх, девять кораблей перерисовывались, чтобы поменять один класс
   на одной карточке.

   Теперь три правила:
   1. Жетоны строятся ОДИН раз. Выбор меняет классы и подписи, узлы живут.
   2. Небо с бортом наверху — настоящий корабль, а не значок: то же, что игрок видит
      в полёте. Живое, но с мерой (см. angarPvStart).
   3. Кошелёк под кнопкой покупки, а не над витриной.
   ============================================================ */

/* Один рисунок корабля на все места ангара: и в жетоне, и в большом небе.
   Форма — та же, что в полёте (render.js drawPlane): нос, крылья, складка. */
function angarShip(x, sk, s, bolshoy){
  x.save(); x.scale(s,s);
  if(bolshoy){ // в небе борт светится так же, как в полёте: аура кормы и аура корпуса
    const g=x.createRadialGradient(0,16,1,0,16,20);
    g.addColorStop(0,sk.trail+'.5)'); g.addColorStop(.5,sk.trail+'.2)'); g.addColorStop(1,sk.trail+'0)');
    x.globalCompositeOperation='lighter'; x.fillStyle=g; x.fillRect(-20,-4,40,40);
    x.globalCompositeOperation='source-over';
    const gg=x.createRadialGradient(0,-4,2,0,-4,32);
    const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
    gg.addColorStop(0,base+'.40)'); gg.addColorStop(.55,base+'.14)'); gg.addColorStop(1,base+'0)');
    x.fillStyle=gg; x.fillRect(-32,-36,64,64);
  }
  /* 29.08.2026 «показывать Вспышку тоже»: раньше окно предпросмотра вообще не знало о
     вспышке — её было видно только первые 0.45с настоящего полёта. Здесь — тот же узор
     (renderFlashPattern, общая с полётом и с плиткой каталога), зациклен по кругу (не
     застывший кадр, как на плитке) — витрина живая, а на плитке достаточно одного кадра.
     Только на большом борту (bolshoy) — на мелких квадратиках цвета вспышке не место.
     04.09.2026 (владелец, живое устройство): рисовалась ПОСЛЕ борта — ложилась поверх
     корпуса вместо подложки под ним. Перенесена сюда, до заливки корпуса — тот же порядок,
     что теперь и в render.js:drawScene (drawLaunchFlash до drawPlane). */
  if(bolshoy){
    const pvFlash = angarCat==='flash' ? angarSel : S.launchFx;
    if(pvFlash){ const fl=FLASHES_BY_ID.get(pvFlash);
      if(fl && fl.style && fl.style!=='none'){
        const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
        const col=a=>base+Math.max(0,a).toFixed(2)+')';
        const p=(performance.now()%1600)/1600;
        x.save(); x.translate(0,-4); renderFlashPattern(x, fl.style, p, col); x.restore();
      }
    }
  }
  x.fillStyle=sk.body;
  x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
  x.fillStyle=sk.fold;
  x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
  /* 04.09.2026 «Эксклюзивные скины за Stars» (владелец, живое устройство — «в окне
     предпросмотра видно ноль от новых скинов»): angarShip() никогда не рисовала fx вообще
     (ни старые Неон/Хром/Плазма, ни новые) — только полёт (render.js:drawPlane) их знал.
     Тот же код, что там, только на большом борту (bolshoy) — на жетоне мелко, не разглядеть.
     drawSkinGem/FACET_PARTS/GEM_SLOTS/FIL_MARKS — общие с render.js, тот файл грузится раньше. */
  if(bolshoy && sk.fx){
    // 04.09.2026, второй заход: витрина подтянута до того же вида, что и в реальном
    // полёте (render.js) — металлический контраст, кристаллы на Спутниках, синхронизация
    // Филиграни, хребет Ядра, наконечник Прицела, угловые камни у Граней/Прицела/Инкрустации.
    // metalStroke/drawMightyCrystal/drawSpearGem/WINGTIP_SLOTS/CORNER_* — общие с render.js,
    // тот файл грузится раньше.
    const pvNow = performance.now();
    if(sk.fx==='satellites'){
      let nearTop=0, nearBottom=0;
      x.save(); x.globalCompositeOperation='lighter';
      for(let i=0;i<3;i++){
        const ph=pvNow/900+i*2.094;
        const ox=Math.cos(ph)*22, oy=-2+Math.sin(ph)*12;
        const r=2.6+0.8*Math.sin(pvNow/300+i);
        const g=x.createRadialGradient(ox,oy,0,ox,oy,r*2.2);
        g.addColorStop(0,sk.trail+'.95)'); g.addColorStop(1,sk.trail+'0)');
        x.fillStyle=g;
        x.beginPath(); x.arc(ox,oy,r*2.2,0,6.283); x.fill();
        const a=((ph%6.283)+6.283)%6.283;
        const topDist=Math.abs(a-4.71);
        nearTop=Math.max(nearTop, Math.max(0,1-topDist/0.4));
        const botDist=Math.abs(a-1.5708);
        nearBottom=Math.max(nearBottom, Math.max(0,1-botDist/0.4));
      }
      x.restore();
      drawMightyCrystal(x,sk.trail,0,-15,2.6,nearTop*.85);
      drawMightyCrystal(x,sk.trail,0,7,2.2,nearBottom*.85);
    } else if(sk.fx==='facets'){
      const cyc=2200;
      const sweep=-26+((pvNow%cyc)/cyc)*52;
      FACET_PARTS.forEach(f=>{
        x.fillStyle=sk.trail+f.base+')';
        x.beginPath(); x.moveTo(f.pts[0][0],f.pts[0][1]); x.lineTo(f.pts[1][0],f.pts[1][1]); x.lineTo(f.pts[2][0],f.pts[2][1]); x.closePath(); x.fill();
        x.strokeStyle=sk.trail+'.5)'; x.lineWidth=.5; x.stroke();
        const glint=Math.max(0,1-Math.abs(f.cx-sweep)/7);
        if(glint>0.02){
          x.save(); x.globalCompositeOperation='lighter';
          x.fillStyle='rgba(255,255,255,'+(glint*glint*0.9).toFixed(2)+')';
          x.beginPath(); x.moveTo(f.pts[0][0],f.pts[0][1]); x.lineTo(f.pts[1][0],f.pts[1][1]); x.lineTo(f.pts[2][0],f.pts[2][1]); x.closePath(); x.fill();
          x.restore();
        }
      });
      const centerGlint=Math.max(0,1-Math.abs(sweep)/7);
      drawSkinGem(x,sk,0,8,1.6,centerGlint*.9);
      drawSkinGem(x,sk,CORNER_NOSE[0],CORNER_NOSE[1],1.2,0);
      drawSkinGem(x,sk,CORNER_LWING[0],CORNER_LWING[1],1.1,0);
      drawSkinGem(x,sk,CORNER_RWING[0],CORNER_RWING[1],1.1,0);
    } else if(sk.fx==='inlay'){
      metalStroke(x, c=>{
        c.moveTo(0,-22); c.lineTo(GEM_SLOTS[1].x,GEM_SLOTS[1].y);
        c.moveTo(0,-22); c.lineTo(GEM_SLOTS[2].x,GEM_SLOTS[2].y);
      }, .75, .4);
      const cyc=2400;
      GEM_SLOTS.concat(WINGTIP_SLOTS).forEach(gm=>{
        const ph=((pvNow+gm.ph*400)%cyc)/cyc;
        const glint=Math.max(0,1-Math.abs(ph-0.15)/0.12);
        drawSkinGem(x,sk,gm.x,gm.y,gm.r,glint);
      });
    } else if(sk.fx==='filigree'){
      x.save(); x.globalCompositeOperation='lighter';
      metalStroke(x, c=>{ c.moveTo(0,-22); c.lineTo(-16,14); c.moveTo(0,-22); c.lineTo(16,14); }, .55, .35);
      const cyc=1800;
      const C=(pvNow/cyc)%1;
      FIL_MARKS.forEach(m=>{
        metalStroke(x, c=>{ c.moveTo(m.x,m.y); c.lineTo(m.x+m.ux*1.6,m.y+m.uy*1.6); }, .7, .4);
        const local=C-m.f*0.5;
        const glint=(local>=0&&local<0.18)?Math.max(0,1-local/0.18):0;
        if(glint>0.02){
          x.fillStyle='rgba(255,255,255,'+glint.toFixed(2)+')';
          x.beginPath(); x.arc(m.x+m.ux*.8,m.y+m.uy*.8,.9*glint+.2,0,6.283); x.fill();
        }
      });
      x.restore();
      const noseGlint=Math.max(0,1-C/0.15);
      drawSkinGem(x,sk,0,-16,1.4,noseGlint*.85);
    } else if(sk.fx==='core'){
      metalStroke(x, c=>{ c.moveTo(0,-22); c.lineTo(0,6); }, .6, .4);
      const spineT=(pvNow/2000)%1;
      const sy=-22+28*spineT;
      x.save(); x.globalCompositeOperation='lighter';
      x.fillStyle='rgba(255,255,255,'+(Math.sin(spineT*Math.PI)*.8).toFixed(2)+')';
      x.beginPath(); x.arc(0,sy,.9,0,6.283); x.fill();
      x.restore();
      const wingGlint=Math.max(0,1-(1-spineT)/0.15);
      drawSkinGem(x,sk,-9,9,1.3,wingGlint);
      drawSkinGem(x,sk,9,9,1.3,wingGlint);
      x.save(); x.translate(0,2);
      metalStroke(x, c=>{
        for(let i=0;i<6;i++){ const a=i*Math.PI/3; const px=Math.cos(a)*5.4, py=Math.sin(a)*5.4; i===0?c.moveTo(px,py):c.lineTo(px,py); }
        c.closePath();
      }, .7, .4);
      x.strokeStyle=sk.trail+'.45)'; x.lineWidth=.4;
      x.beginPath(); x.arc(0,0,3.3,0,6.283); x.stroke();
      x.globalCompositeOperation='lighter';
      const pulse=0.5+0.5*Math.sin(pvNow/500);
      const coreR=1.6+pulse*.5;
      x.fillStyle='rgba(255,255,255,'+(0.5+0.4*pulse).toFixed(2)+')';
      x.beginPath(); x.moveTo(0,-coreR); x.lineTo(coreR*.6,0); x.lineTo(0,coreR); x.lineTo(-coreR*.6,0); x.closePath(); x.fill();
      if(pulse>0.85){
        const rayA=(pulse-0.85)/0.15;
        x.strokeStyle=sk.trail+(rayA*.8).toFixed(2)+')'; x.lineWidth=.5;
        for(let i=0;i<4;i++){
          const ang=i*(Math.PI/2)+Math.PI/4;
          x.beginPath(); x.moveTo(Math.cos(ang)*2,Math.sin(ang)*2); x.lineTo(Math.cos(ang)*(4+rayA*3),Math.sin(ang)*(4+rayA*3)); x.stroke();
        }
      }
      x.restore();
    } else if(sk.fx==='aim'){
      let anyLock=0;
      x.save(); x.globalCompositeOperation='lighter';
      const rot=pvNow/2600;
      for(let i=0;i<4;i++){
        const ang=rot+i*(Math.PI/2);
        const top=((ang-Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
        const distToTop=Math.min(top,Math.PI*2-top);
        const lock=Math.max(0,1-distToTop/0.35);
        const R=26-lock*7, spread=4+lock*3;
        x.save(); x.rotate(ang);
        x.strokeStyle=lock>0.02?'rgba(255,255,255,'+(0.8+lock*0.2).toFixed(2)+')':sk.trail+'.8)';
        x.lineWidth=1+lock*.8;
        x.beginPath(); x.moveTo(-R,-6); x.lineTo(-R,-6-spread); x.lineTo(-R+spread,-6-spread); x.stroke();
        anyLock=Math.max(anyLock,lock);
        x.restore();
      }
      x.restore();
      drawSkinGem(x,sk,-14,12,1.1,0);
      drawSkinGem(x,sk,14,12,1.1,0);
      drawSpearGem(x,sk.trail,0,-17,2.6,anyLock*.9);
    } else if(typeof PREM_FX_MAP!=='undefined' && PREM_FX_MAP[sk.fx]){ // 05.09.2026: 30 доп. премиум-скинов — общий рендерер из render.js
      PREM_FX_MAP[sk.fx](x, sk, pvNow);
    }
  }
  if(bolshoy){ // кромки крыльев — только на большом борту, в жетоне это каша
    // 02.09.2026 (владелец вживую — «над сердцем... белое пятно, выходит за корпус»):
    // блик-эллипс здесь убран. Тот же самый блик уже убирали 31.08.2026 из render.js
    // (настоящий полёт) — владелец обвёл его жёлтым как ошибку тогда же. angarShip() —
    // отдельная, скопированная функция рисования борта для витрины Ангара/Тюнинга, и
    // блик остался только в этой копии, непочищенным. Страж 149.
    x.strokeStyle='rgba(255,255,255,.32)'; x.lineWidth=1.1;
    x.beginPath();
    x.moveTo(0,-22); x.lineTo(-16,14); x.moveTo(0,-22); x.lineTo(16,14);
    x.moveTo(-16,14); x.lineTo(0,6); x.moveTo(0,6); x.lineTo(16,14);
    x.stroke();
  } else {
    x.strokeStyle='rgba(120,140,180,.5)'; x.lineWidth=1.6;
    x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.stroke();
  }
  /* 29.08.2026 «живой предпросмотр на всех вкладках» (владелец): раньше здесь всегда
     рисовался НАДЕТЫЙ декаль/иконка/вспышка, даже когда игрок листает каталог и смотрит
     на что-то другое (angarSel) — окно врало «вот как это будет выглядеть», хотя честно
     показывало вчерашний выбор. Теперь: на своей вкладке жетон, на который сейчас смотрит
     игрок (angarSel), подменяет надетый — на всех остальных вкладках показывается то, что
     реально надето, как и раньше. Тот же приём, что уже был только у Цвета. */
  const pvDecal = angarCat==='decal' ? angarSel : S.decal;
  const pvIcon  = angarCat==='icon'  ? angarSel : S.icon;
  /* 28.08.2026 «Декаль на корпусе» — то же место и та же прикидка размера/позиции, что в
     render.js (полёт): координаты в тех же локальных единицах, масштаб уже даёт x.scale(s,s)
     выше, отдельно пересчитывать не нужно. */
  if(pvDecal){ const dc=DECALS_BY_ID.get(pvDecal);
    if(dc && dc.ch && emojiSupported(dc.ch)){ // 29.08.2026: не рисовать тофу на самом борту — см. angarVisibleList
      x.textAlign='center'; x.textBaseline='middle'; x.font='9px sans-serif';
      x.fillText(dc.ch,-5.3,-0.7);
    }
  }
  // 29.08.2026 «правая сторона, отдельная категория»: иконка — свой слот (S.icon, ICONS),
  // рисуется всегда вместе с декалью выше, не вместо неё; drawDecalSvg — общая функция из
  // render.js (грузится раньше ui.js, см. sw.js JS_FILES), превью совпадает с полётом.
  if(pvIcon){ const ic=ICONS_BY_ID.get(pvIcon);
    if(ic && ic.svg) drawDecalSvg(x, ic, 5.3, -0.7, sk);
  }
  x.restore();
}

/* Небо ангара. Рисуется в мерах 380×190 — тех же логических пикселях, что весь
   интерфейс; настоящие пиксели даёт DPR, как и везде в игре. */
const ANGAR_PV = { kadrov:0 };
try{ window.__angarPv = ANGAR_PV; }catch(e){} // окно наружу — для стража 112
let angarPvRaf=0, angarPvTouch=0;
const ANGAR_PV_SON = 20000;  // 20 секунд без касания — превью засыпает
const ANGAR_PV_SHAG = 33;    // ~30 кадров в секунду, а не 60

function angarPvDraw(t){
  const cv=$('angarPv'); if(!cv) return;
  /* 27.08.2026: было SKINS[S.skin] — превью показывало НАДЕТЫЙ борт, а не тот, что игрок
     только что тронул в сетке. angarBuyFill() (кнопка «Купить») рядом уже честно смотрит
     на angarSel («на какой жетон смотрит игрок», см. коммент у объявления) — жалоба
     владельца «выбираешь скин, а в окне его не видно» ровно про это рассогласование. */
  /* 28.08.2026: во вкладке «Цвет» показываем то, на что смотрит игрок (angarSel — живой
     предпросмотр ещё не купленного скина). 29.08.2026: то же самое теперь и у Декали/
     Иконок/Вспышки — angarShip() сама подменяет надетое на angarSel на своей активной
     вкладке (см. её собственный комментарий) — здесь только скин, остальное уже внутри. */
  const sk = (angarCat==='color') ? (SKINS[angarSel]||SKINS[0]) : (SKINS[S.skin]||SKINS[0]);
  const W=380, H=130, d=(window.devicePixelRatio||1); // 27.08.2026: держим в паре с #angarSky в index.html — иначе холст растянется мимо CSS-бокса
  if(cv.width!==Math.round(W*d)||cv.height!==Math.round(H*d)){ cv.width=Math.round(W*d); cv.height=Math.round(H*d); }
  const x=cv.getContext('2d'); if(!x) return;
  x.setTransform(cv.width/W,0,0,cv.width/W,0,0);
  x.clearRect(0,0,W,H);
  /* Звёзды заданы списком, а не случайны: небо ангара не должно мерцать по-новому
     на каждый вход — это витрина, а не полёт. */
  const ZV=[[40,30,.7,.5],[95,120,.6,.35],[160,50,.5,.4],[240,95,.8,.5],
            [310,40,.6,.45],[350,150,.5,.3],[200,168,.6,.35],[280,155,.5,.25]];
  for(let i=0;i<ZV.length;i++){ const z=ZV[i];
    x.globalAlpha = z[3]*(RM?1:(0.6+0.4*Math.sin(t/700+i)));
    x.fillStyle='#dce8ff'; x.beginPath(); x.arc(z[0],z[1],z[2],0,6.283); x.fill(); }
  x.globalAlpha=1;
  x.save(); x.translate(W/2,H/2+10);
  x.rotate(RM?0.06:Math.sin(t/1400)*0.10); // борт покачивается — под бережным небом стоит ровно
  angarShip(x, sk, 1.6, true);
  // огонёк двигателя — живой только когда живо всё превью
  x.globalAlpha = RM?.85:(.6+.4*Math.sin(t/70));
  x.fillStyle=sk.trail+'.95)';
  x.beginPath(); x.arc(0,11*1.6,3.0*1.6,0,6.283); x.fill();
  x.globalAlpha=1; x.restore();
  ANGAR_PV.kadrov++;
}

/* «Умное живое»: 30 кадров в секунду вместо 60, засыпает через 20 секунд без касания
   и не запускается вовсе на нулевом ярусе качества и под бережным небом. Меню не имеет
   права крутить второй игровой цикл: в полёте расход хотя бы оправдан игрой. */
function angarPvStart(){
  angarPvTouch = performance.now();
  const slabo = (typeof Q!=='undefined' && Q.level===0) || RM;
  if(slabo){ angarPvStop(); angarPvDraw(performance.now()); return; } // один честный кадр — и тишина
  if(angarPvRaf) return;
  let posl=0;
  const tick=(now)=>{
    if(screenName!=='hangar'){ angarPvRaf=0; return; }              // ушли с экрана — цикл умер
    if(now-angarPvTouch>ANGAR_PV_SON){ angarPvRaf=0; return; }       // уснуло само
    if(now-posl>=ANGAR_PV_SHAG){ posl=now; angarPvDraw(now); }
    angarPvRaf=requestAnimationFrame(tick);
  };
  angarPvRaf=requestAnimationFrame(tick);
}
function angarPvStop(){ if(angarPvRaf){ cancelAnimationFrame(angarPvRaf); angarPvRaf=0; } }
function angarPvWake(){ // касание будит уснувшее превью
  if(screenName!=='hangar') return;
  angarPvTouch=performance.now();
  if(!angarPvRaf) angarPvStart();
}

/* 28.08.2026 «Настоящая звезда»: цена скина и кошелёк рисовались плоской иконкой i-star4
   (просто контур) — владелец: «пустое подобие» той золотой искры с гранью и свечением,
   что игрок видит в полёте (drawStarJewel, game.js — своя кисть с v1.95.1). Не рисуем
   copy — зовём ту же самую функцию на новом канвасе, тем же приёмом «нарисовать один раз,
   когда канвas реально появился в DOM», что уже применён к #starJewel в game.js. */
function starJewelHtml(cls){ return '<canvas class="starJewelSm'+(cls?' '+cls:'')+'" width="32" height="32" aria-hidden="true"></canvas>'; }
function starJewelWake(){
  document.querySelectorAll('.starJewelSm').forEach(c=>{ if(!c._drawn && typeof drawStarJewel==='function'){ c._drawn=1; drawStarJewel(c); } });
}
/* 28.08.2026 «Вкладка Декаль»: список данных и ключи S/Store на категорию тюнинга —
   Цвет (было, поведение не меняется) и Декаль (новое, символ вместо канваса корабля).
   29.08.2026: третья — Иконки (ICONS, свой слот S.icon/ownedIcons) — не подкатегория
   декали, а независимая вещь: садится на правую половину борта, носится одновременно
   с декалью, не вместо неё (см. render.js). Четвёртая — Вспышка (FLASHES, S.launchFx/
   ownedLaunchFx — НЕ S.flash, тот уже занят золотой вспышкой подбора звезды) — тоже
   независимая, но НЕ рисуется на самом борту постоянно, а
   проигрывается только первые 0.45с забега (см. drawLaunchFlash в render.js). След/Аура/
   Звук — сюда же отдельным заходом, когда до них дойдёт очередь — не копипастом всей
   секции ещё раз. */
const ANGAR_CATS = {
  color: { list:SKINS,  ownedKey:'ownedSkins',  selKey:'skin' },
  decal: { list:DECALS, ownedKey:'ownedDecals', selKey:'decal' },
  icon:  { list:ICONS,  ownedKey:'ownedIcons',  selKey:'icon' },
  flash: { list:FLASHES, ownedKey:'ownedLaunchFx', selKey:'launchFx' } // 29.08.2026: S.flash уже занят золотой вспышкой подбора — см. game.js
};
/* 29.08.2026 «Избранное нам не нужно» (владелец, после трёх неудачных заходов со звёздочкой-
   тогглом): вместо выбора игроком — 2 фиксированных id на категорию, сразу бесплатные и во
   владении (см. game.js: ownedDecals/ownedIcons/ownedLaunchFx, price:0 у самих записей).
   Тот же приём, что бумажный скин в Цвете — пустые клетки у «Без украшений» заполняет сам
   состав каталога, не действие игрока. */
// 04.09.2026 (владелец, живая сессия): decal/icon поменяны местами со своими старыми
// бесплатными — Ракета/Тарелка(decal) и Ракета/Медаль(icon, вектор) теперь платные,
// вместо них бесплатны Звезда/Сотка(decal) и Сетевой узел/Сияние(icon) — выбраны
// владельцем вживую (клик-ловушка в консоли, не на глаз по коду). flash не менялся.
const ANGAR_FREEBIE = { decal:[3,30], icon:[28,11], flash:[1,2] };
let angarCat = 'color';   // активная вкладка тюнинга
/* «просто можно категории сделать для эмодзи, чтобы не всей кучей» (владелец, 28.08.2026),
   потом «а полный каталог, с разделением на категории в одном списке, а не кучей вкладок»
   (владелец, 29.08.2026): подкатегории — из самих DECALS (поле cat), в порядке первого
   появления в массиве, без «Нет» (id0, cat:'none' — это не подкатегория, а обычный
   бесплатный жетон). Одним проходом по данным, а не отдельным вручную сверяемым списком —
   не разойдётся с составом DECALS. Раньше был ещё angarSubCat — какая подкатегория выбрана
   в отдельной ленте вкладок; сама лента снята, список теперь всегда показывает все
   подкатегории подряд, фильтровать стало нечем. */
const ANGAR_DECAL_CATS = (()=>{ const seen=[]; DECALS.forEach(d=>{ if(d.cat && d.cat!=='none' && seen.indexOf(d.cat)<0) seen.push(d.cat); }); return seen; })();
/* 29.08.2026 «как с эмодзи, по категориям» (владелец): у иконок 267 штук одним списком
   без разделения — то же самое «кучей», от чего уже уходили с декалями. Категории
   реальные (26 штук, cat у каждой записи ICONS — не общий 'icons', как было раньше),
   восстановлены из собственных черновиков этой же сессии (gen_icons*.js — там, где
   каждая иконка предлагалась и одобрялась группами), не придуманы заново задним числом.
   Тот же приём построения списка категорий, что и у ANGAR_DECAL_CATS. */
const ANGAR_ICON_CATS = (()=>{ const seen=[]; ICONS.forEach(d=>{ if(d.cat && d.cat!=='none' && seen.indexOf(d.cat)<0) seen.push(d.cat); }); return seen; })();

/* 28.08.2026 «Один общий, не франкенштейн»: отдельная строка-кнопка под небом снята —
   владелец увидел её как чужеродную деталь и лишнее место. Действие (надеть/купить)
   теперь живёт прямо в карточке жетона, на который сейчас смотрит игрок (angarSel),
   теми же .btn.pri.small токенами, что и везде в игре — не своя выдуманная кнопка.
   Тап по жетону по-прежнему только выбирает его для просмотра (страж 45, беда
   v1.282.20 — случайный тап не должен тратить звёзды); кнопка внутри — отдельный,
   осознанный тап поверх неё. Генерализовано на категорию (28.08.2026): та же логика,
   что раньше умела только SKINS, теперь читает список/ключи из ANGAR_CATS[angarCat]. */
function angarItemFill(el, item){
  const cfg = ANGAR_CATS[angarCat];
  const owned = S[cfg.ownedKey].includes(item.id);
  const worn  = S[cfg.selKey]===item.id;
  el.classList.toggle('sel', worn);
  const nm=el.querySelector('.nm'), pr=el.querySelector('.pr');
  // декали/иконки/вспышки без подписи (эмодзи сам по себе понятен) — КРОМЕ «Нет», у неё
  // .nm задан один раз при постройке плитки (angarBuildGrid) и не должен стираться на
  // каждой перерисовке (29.08.2026, тот же баг, что уже чинили с .angarIt canvas — здесь
  // про специфичность DOM, не CSS).
  if(nm && angarCat==='color') nm.textContent = L.skinNames[item.name];
  if(pr){
    pr.classList.toggle('own', owned);
    // 04.09.2026 «Эксклюзивные скины за Stars»: item.premium — цена в Stars (⭐), не в ✦
    // (starJewelHtml() рисует игровой жетон, тут он неверен по смыслу — деньги настоящие).
    const priceHtml = item.premium ? ('⭐ '+Math.round(item.price)) : (starJewelHtml()+Math.round(item.price));
    if(worn){
      pr.innerHTML = L.owned;
    } else if(angarSel===item.id){
      pr.innerHTML = '<button type="button" class="btn pri small angarTileBuy">'+
        (owned ? L.hangarWear : (L.hangarBuy+' '+priceHtml))+'</button>';
    } else {
      pr.innerHTML = owned ? ic('check') : priceHtml;
    }
  }
}
/* 29.08.2026 «Не всем показывать одно и то же» (владелец): вместо ручного списка «эти эмодзи
   убрать/оставить» — проверка прямо на устройстве игрока. Рисуем символ на скрытом канвасе
   и сравниваем с кодом из приватной области Unicode (U+E000) — глифа под него нет ни в
   одном шрифте нигде, это заведомо «пустой квадрат». Совпали пиксели с ним — значит и у
   проверяемого символа тоже нет картинки на этом устройстве; несовпали — есть, неважно,
   что именно нарисовано (не обязана быть «правильной» эмодзи-версией, просто не тофу).
   Кэш на время сессии — рисовать по 24×24 канвасу на каждую перерисовку сетки не нужно. */
const EMOJI_SUPPORT_CACHE = new Map();
let _emojiProbeCv = null;
function emojiSupported(ch){
  if(!ch) return true;
  if(EMOJI_SUPPORT_CACHE.has(ch)) return EMOJI_SUPPORT_CACHE.get(ch);
  if(!_emojiProbeCv){ _emojiProbeCv=document.createElement('canvas'); _emojiProbeCv.width=_emojiProbeCv.height=24; }
  const x=_emojiProbeCv.getContext('2d');
  const draw=(s)=>{ x.clearRect(0,0,24,24); x.textBaseline='top'; x.font='20px sans-serif'; x.fillText(s,0,0); return x.getImageData(0,0,24,24).data; };
  const blank=draw(''), real=draw(ch);
  let same=true;
  for(let i=0;i<real.length;i++){ if(real[i]!==blank[i]){ same=false; break; } }
  const ok=!same;
  EMOJI_SUPPORT_CACHE.set(ch, ok);
  return ok;
}
function angarVisibleList(){ // список жетонов активной вкладки — у декалей это уже весь каталог разом
  const cfg = ANGAR_CATS[angarCat];
  if(angarCat==='color') return cfg.list;
  // 29.08.2026 «полный каталог, не кучей вкладок»: раньше фильтровали по одной активной
  // angarSubCat — теперь отдаём всё сразу, сгруппированное по категориям в том же порядке,
  // что раньше был у ленты вкладок (ANGAR_DECAL_CATS). «Нет» (id0) не входит ни в одну
  // категорию по построению — держим её первой плиткой списка один раз, не по разу на
  // категорию (была именно эта жалоба владельца — «пустые места в декали»).
  const none = cfg.list.filter(d=>d.id===0);
  /* 29.08.2026 «2 бесплатных вместо Избранного» (владелец, после трёх неудачных заходов со
     звёздочкой): пустые клетки рядом с «Без украшений» заполняют 2 фиксированных id
     (ANGAR_FREEBIE) — не выбор игрока, не клон-дубликат. Просто эти два предмета показаны
     сразу после «Нет», а из обычного места в своей категории убраны (freebieIds ниже),
     чтобы не быть на экране дважды. */
  const freebieIds = ANGAR_FREEBIE[angarCat] || [];
  const freebies = freebieIds.map(id=>cfg.list.find(d=>d.id===id)).filter(Boolean);
  // 29.08.2026: иконки получили реальные категории (ANGAR_ICON_CATS) тем же приёмом, что
  // декали — вкладка «Вспышка» своих подкатегорий не имеет (10 штук, не нужны), остаётся плоской.
  const subCats = angarCat==='decal' ? ANGAR_DECAL_CATS : angarCat==='icon' ? ANGAR_ICON_CATS : null;
  const restBase = subCats
    ? subCats.flatMap(cat=>cfg.list.filter(d=>d.cat===cat))
    : cfg.list.filter(d=>d.id!==0);
  const rest = restBase.filter(d=>freebieIds.indexOf(d.id)<0);
  // 29.08.2026: у декалей ch — эмодзи-глиф, у иконок (icon) его нет вообще (там svg) —
  // emojiSupported(undefined) сама возвращает true, фильтр для иконок безвреден и не нужен,
  // но не мешает оставить его общим для обеих вкладок.
  return none.concat(freebies, rest).filter(d=>emojiSupported(d.ch));
}
function angarBuyFill(){
  const grid=$('angarGrid');
  // 29.08.2026: в сетке декалей теперь ещё .angarCatHead-подзаголовки вперемешку с
  // плитками — считаем позицию только по .angarIt, иначе индекс от заголовков съедет.
  if(grid){ const els=grid.querySelectorAll('.angarIt'); angarVisibleList().forEach((item,i)=>{ const el=els[i]; if(el) angarItemFill(el, item); }); }
  setText('angarWalletN', Math.round(S.wallet));
  starJewelWake();
}
let angarSel = 0;          // на какой жетон смотрит игрок (не то же, что надетый/выбранный элемент)
let angarBuilt = false;    // жетоны построены — второй раз не строим (сбрасывается при смене вкладки)

let angarTabsBuilt = false;
function angarBuildTabs(){
  /* 27.08.2026 «Кнопка не ложится на контент»: #angarTabs раньше был мёртвой заготовкой,
     потом (тем же заходом) — одной нерабочей вкладкой «Цвет». 28.08.2026: вторая вкладка
     «Декаль» с реальным переключением. 29.08.2026: третья — «Иконки» (правая сторона
     борта, носится вместе с декалью, не вместо), четвёртая — «Вспышка» (не на борту,
     проигрывается на старте). След/Аура/Звук — сюда же позже. */
  if(angarTabsBuilt) return;
  const tabs=$('angarTabs');
  if(tabs){
    tabs.innerHTML = '<button class="angarTab" id="angarTabColor"></button>'+
                      '<button class="angarTab" id="angarTabDecal"></button>'+
                      '<button class="angarTab" id="angarTabIcon"></button>'+
                      '<button class="angarTab" id="angarTabFlash"></button>';
    $('angarTabColor').addEventListener('click',()=>angarSwitchCat('color'));
    $('angarTabDecal').addEventListener('click',()=>angarSwitchCat('decal'));
    $('angarTabIcon').addEventListener('click',()=>angarSwitchCat('icon'));
    $('angarTabFlash').addEventListener('click',()=>angarSwitchCat('flash'));
  }
  angarTabsBuilt=true;
}
function angarRenderTabsSel(){
  const tc=$('angarTabColor'), td=$('angarTabDecal'), ti=$('angarTabIcon'), tf=$('angarTabFlash');
  if(tc) tc.classList.toggle('sel', angarCat==='color');
  if(td) td.classList.toggle('sel', angarCat==='decal');
  if(ti) ti.classList.toggle('sel', angarCat==='icon');
  if(tf) tf.classList.toggle('sel', angarCat==='flash');
}
function angarSwitchCat(cat){
  if(angarCat===cat) return;
  angarCat=cat; angarBuilt=false; angarSel=S[ANGAR_CATS[cat].selKey];
  sfx.click(); haptic('light');
  angarRenderTabsSel(); angarBuildGrid(); angarPvDraw(performance.now());
}
function angarBuildGrid(){
  const grid=$('angarGrid'); if(!grid) return;
  if(!angarBuilt){
    grid.innerHTML='';
    let lastCat=null; // 29.08.2026: подзаголовок вставляется перед первой плиткой новой категории
    angarVisibleList().forEach(item=>{
      /* 29.08.2026: подзаголовок для cat:'none' не рисуется рядом — подпись у самой плитки
         «Нет» ниже, точечно на ней одной. Бесплатные (ANGAR_FREEBIE) тоже без заголовка —
         у них есть свой item.cat от оригинала (например 'space'), без исключения заголовок
         той категории ошибочно всплыл бы прямо над ними, а не над её настоящим первым
         предметом дальше по списку. */
      if((angarCat==='decal'||angarCat==='icon') && item.cat && item.cat!=='none' && item.cat!==lastCat
         && (ANGAR_FREEBIE[angarCat]||[]).indexOf(item.id)<0){
        const head=document.createElement('div');
        head.className='angarCatHead';
        head.textContent = (L.decalCatNames && L.decalCatNames[item.cat]) || item.cat;
        grid.appendChild(head);
        lastCat = item.cat;
      }
      const el=document.createElement('div');
      el.className='angarIt';
      if(angarCat==='color'){
        // 02.09.2026: .pr переехал ВНУТРЬ .dot (плашка поверх низа квадрата, не строка под
        // ним) — см. комментарий у .angarIt .pr в index.html. Канвас рисуют через getContext,
        // не innerHTML, так что соседство с .pr внутри одного .dot ему не мешает.
        el.innerHTML='<span class="dot"><canvas width="186" height="144"></canvas><span class="pr"></span></span>'+
                     '<span class="nm"></span>';
        const cv=el.querySelector('canvas');
        const x=cv.getContext('2d');
        x.setTransform(3,0,0,3,0,0); x.translate(31,26); // 62×48 мер при DPR 3
        angarShip(x, item, .92, false);
      } else if(angarCat==='flash'){
        /* 29.08.2026: плитка вспышки — не глиф, а сам узор, заморожен на p=.55 (середина
           анимации, там уже видна форма). Тот же renderFlashPattern, что и в полёте
           (render.js) — плитка не врёт о том, как это будет выглядеть на самом деле.
           Цвет — от НАДЕТОГО сейчас скина (S.skin), как и остальные превью в ангаре.
           02.09.2026: .pr — внутрь .ch, тем же приёмом, что у .dot выше. */
        el.innerHTML='<span class="ch"><canvas class="flashPv" width="52" height="52"></canvas><span class="pr"></span></span>';
        if(item.style && item.style!=='none'){
          const x=el.querySelector('canvas').getContext('2d');
          const skin=SKINS[S.skin]||SKINS[0];
          const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
          const col=a=>base+Math.max(0,a).toFixed(2)+')';
          x.setTransform(2,0,0,2,26,26); x.scale(.28,.28);
          renderFlashPattern(x, item.style, .55, col);
        }
        el.setAttribute('aria-label', item.name);
      } else {
        // 29.08.2026: у «Нет» была подпись только через убранный сейчас заголовок строки — переехала на саму плитку.
        // 02.09.2026: глиф/svg переехал в свой .chGlyph — раньше писался прямо в .ch через
        // textContent/innerHTML, а .pr теперь тоже живёт внутри .ch (плашка поверх низа
        // квадрата); textContent=item.ch стёр бы .pr, если бы она осталась соседкой глифа.
        const nmText = item.id===0 ? ((L.decalCatNames && L.decalCatNames.none) || '') : '';
        el.innerHTML='<span class="ch"><span class="chGlyph"></span><span class="pr"></span></span>'+(nmText?'<span class="nm">'+nmText+'</span>':'');
        const chEl=el.querySelector('.chGlyph');
        if(item.svg){ // векторная декаль — своя иконка вместо текстового глифа, тот же короб .ch
          chEl.innerHTML='<svg viewBox="'+item.vb.join(' ')+'" width="26" height="26"><path d="'+item.svg+'" fill="#eaf2ff"/></svg>';
        } else {
          chEl.textContent = item.ch;
        }
        el.setAttribute('aria-label', item.name); // без видимой подписи (эмодзи и так понятен) — имя остаётся для скринридера
      }
      el.addEventListener('click',()=>{ angarPick(item.id); });
      grid.appendChild(el);
    });
    angarBuilt = true;
  }
  angarBuyFill();
}
function renderHangar(){
  angarBuildTabs();
  angarSel = S[ANGAR_CATS[angarCat].selKey];
  angarRenderTabsSel();
  const tabColor=$('angarTabColor'); if(tabColor) tabColor.textContent=L.angarTabColor;
  const tabDecal=$('angarTabDecal'); if(tabDecal) tabDecal.textContent=L.angarTabDecal;
  const tabIcon=$('angarTabIcon'); if(tabIcon) tabIcon.textContent=L.angarTabIcon;
  const tabFlash=$('angarTabFlash'); if(tabFlash) tabFlash.textContent=L.angarTabFlash;
  angarBuildGrid(); // сама теперь обходит все жетоны активной вкладки (angarItemFill) — отдельный forEach здесь не нужен
  angarPvStart();
}

/* Тап по жетону — только смотрю. Надеть или купить — отдельным действием по кнопке:
   так случайный тап по дорогому борту не тратит звёзды (беда v1.282.20, страж 45). */
function angarPick(id){
  if(angarSel===id) return;
  angarSel=id; sfx.click(); haptic('light');
  const grid=$('angarGrid');
  const els=grid.querySelectorAll('.angarIt'); // см. angarBuyFill — заголовки категорий в счёт не идут
  angarVisibleList().forEach((item,i)=>{ const el=els[i];
    if(el) el.classList.toggle('sel', item.id===angarSel); });
  angarBuyFill(); angarPvWake();
  /* 27.08.2026: было — временно подменить S.skin, нарисовать один кадр, вернуть обратно.
     Не спасало: angarPvDraw() сам читал S.skin, поэтому уже СЛЕДУЮЩИЙ кадр анимационного
     цикла (angarPvStart(), 30 раз в секунду) перерисовывал обратно на надетый борт —
     эффект костыля держался один кадр и на глаз не был виден. Теперь angarPvDraw() сам
     смотрит на angarSel/angarCat, костыль не нужен — небо показывает выбранный жетон
     постоянно, не только на один кадр, даже если борт ещё не надет. */
  angarPvDraw(performance.now());
}
function angarAct(){ // одна кнопка: надеть, если своё; купить, если чужое — теперь по активной категории
  const cfg = ANGAR_CATS[angarCat];
  const item = cfg.list.find(it=>it.id===angarSel) || cfg.list[0];
  const owned = S[cfg.ownedKey].includes(item.id);
  const grid=$('angarGrid');
  // 29.08.2026: тот же приём, что в angarBuyFill()/angarPick() — .angarCatHead-подзаголовки
  // в сетке декалей не плитки, индекс считаем только по .angarIt, иначе съедет.
  const els=grid.querySelectorAll('.angarIt');
  if(owned){
    if(S[cfg.selKey]===item.id) return;
    S[cfg.selKey]=item.id; Store.set(cfg.selKey,item.id); sfx.click(); haptic('light');
    angarApplyPremiumFlash(item); // 04.09.2026: см. ниже — премиум-скин подставляет свою вспышку
    angarVisibleList().forEach((it2,i)=>{ const el=els[i]; if(el) angarItemFill(el,it2); });
    angarBuyFill(); if(angarCat==='color') updateLives(); angarPvWake();
    return;
  }
  if(item.premium){ angarBuyPremium(item, els); return; } // 04.09.2026: Stars, не ✦ — отдельная ветка ниже
  if(S.wallet>=item.price){
    S.wallet-=item.price; S[cfg.ownedKey].push(item.id); S[cfg.selKey]=item.id;
    Store.set('wallet',S.wallet); Store.set(cfg.ownedKey,S[cfg.ownedKey]); Store.set(cfg.selKey,item.id);
    sfx.buy(); haptic('success');
    angarVisibleList().forEach((it2,i)=>{ const el=els[i]; if(el) angarItemFill(el,it2); });
    angarBuyFill(); refreshMenu(); if(angarCat==='color') updateLives(); angarPvWake();
    if (typeof achCheck==='function') achCheck(); // достижения ангара (первый скин / вся коллекция)
  } else {
    toast(L.notEnough,'rgba(255,159,176,.5)'); haptic('error');
  }
}
/* 04.09.2026 «Пакет, не одна вещь» (владелец): у премиум-скина своя вспышка идёт В
   КОМПЛЕКТЕ — при надевании подставляется автоматически, заменяя то, что было выбрано,
   чтобы игрок не носил чужую вспышку поверх эксклюзивного скина по недосмотру. item.flash —
   id из FLASHES; сами новые вспышки под премиум-скины ещё не нарисованы (см. память,
   «новые, не из старых 13» — решение владельца), поэтому пока у всех id9-14 flash не
   задан и функция ничего не делает — провод готов, значений ждём. */
function angarApplyPremiumFlash(item){
  if(!item.premium || item.flash==null) return;
  if(S.launchFx===item.flash) return;
  S.launchFx=item.flash; Store.set('launchFx', item.flash);
}
/* 04.09.2026 «Эксклюзивные скины за Stars»: настоящие деньги, не игровая валюта — отдельный
   путь от angarAct() выше. Ссылку на инвойс даёт только сервер (цена там же, не отсюда,
   см. syncBuySkinInvoice). Владение подтверждает ТОЛЬКО ответ premium_owned после оплаты —
   S.ownedSkins пополняется лишь тогда, локальный кэш никогда не решает сам за себя. */
function angarBuyPremium(item, els){
  const tw = typeof tgApp==='function' ? tgApp() : null;
  if(!tw || !tw.openInvoice){ toast(L.premiumTgOnly,'rgba(255,159,176,.5)'); haptic('error'); return; }
  syncBuySkinInvoice(item.id).then(res=>{
    if(!res || !res.ok || !res.link){ toast(L.notEnough,'rgba(255,159,176,.5)'); haptic('error'); return; }
    tw.openInvoice(res.link, status=>{
      if(status!=='paid') return;
      syncPremiumOwned().then(o=>{
        if(o && o.ok && Array.isArray(o.owned)){
          let changed=false;
          o.owned.forEach(id=>{ if(!S.ownedSkins.includes(id)){ S.ownedSkins.push(id); changed=true; } });
          if(changed) Store.set('ownedSkins', S.ownedSkins);
        }
        S.skin=item.id; Store.set('skin', item.id);
        angarApplyPremiumFlash(item);
        sfx.buy(); haptic('success');
        angarVisibleList().forEach((it2,i)=>{ const el=els[i]; if(el) angarItemFill(el,it2); });
        angarBuyFill(); refreshMenu(); updateLives(); angarPvWake();
        if (typeof achCheck==='function') achCheck();
      });
    });
  });
}
// 28.08.2026: кнопка живёт внутри жетона и пересоздаётся при каждой перерисовке (innerHTML) —
// вешать слушатель на неё саму бессмысленно, он терялся бы. Делегирование на сетку целиком.
if(typeof $==='function' && $('angarGrid')) $('angarGrid').addEventListener('click', e=>{
  if(e.target.closest('.angarTileBuy')){ e.stopPropagation(); angarAct(); }
});
if(typeof $==='function' && $('hangarScreen')) $('hangarScreen').addEventListener('pointerdown', angarPvWake);

/* ---------- Написать разработчику (30.08.2026) ----------
   30.08.2026: заменил «Позвать друзей» (shareScore) — приглашение друзей будет решено
   отдельным способом позже, а прямой связи с владельцем раньше не было вообще. */
let feedbackSending=false;
let feedbackFrom='menu'; // куда вернуться: меню или сервисный центр — тот же приём, что у settingsFrom
/* 03.09.2026 «Снимок к отзыву» (владелец, «с картинкой будет проще показать»): до 5 снимков,
   даунскейл на клиенте до ≤1080px по длинной стороне, JPEG q=0.82 — выше, чем у автоматической
   диагностики (≤480px q=0.6, captureShot() в skymail.js), потому что здесь важна читаемость
   мелкого текста интерфейса (жалоба «кнопка съезжает на испанском» без разборчивого текста
   бесполезна), а не компактность файла. Замерено вживую перед выбором чисел, не на глаз: похожий
   по масштабу base64-payload (клип видео до ~6МБ, cosmogram-sync) уже штатно работает в этом же
   проекте — потолок на один снимок (700000 base64-симв. ≈525КБ) взят с большим запасом ниже
   уже проверенного прецедента. */
const FEEDBACK_PHOTO_MAX=5, FEEDBACK_PHOTO_SIDE=1080, FEEDBACK_PHOTO_Q=0.82, FEEDBACK_PHOTO_B64_MAX=700000;
let feedbackPhotos=[]; // dataURL-строки, готовые к отправке
function feedbackPhotoRender(){
  const btn=$('feedbackPhotoBtn'), thumbs=$('feedbackPhotoThumbs');
  setText('feedbackPhotoLabel', L.feedbackPhotoBtn?L.feedbackPhotoBtn(feedbackPhotos.length):''); // 03.09.2026: не сама кнопка — setText() пишет textContent и стёр бы SVG-иконку рядом
  if(btn) btn.disabled = feedbackPhotos.length>=FEEDBACK_PHOTO_MAX;
  if(!thumbs) return;
  thumbs.innerHTML='';
  feedbackPhotos.forEach((url,i)=>{
    const cell=document.createElement('div');
    cell.style.cssText='position:relative;width:56px;height:56px;border-radius:10px;overflow:hidden;border:1px solid rgba(120,170,255,.3)';
    const img=document.createElement('img');
    img.src=url; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
    const rm=document.createElement('div');
    rm.textContent='×';
    rm.style.cssText='position:absolute;top:2px;right:2px;width:16px;height:16px;background:rgba(8,12,28,.85);color:#eaf0ff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;line-height:1';
    rm.onclick=()=>{ feedbackPhotos.splice(i,1); feedbackPhotoRender(); };
    cell.appendChild(img); cell.appendChild(rm);
    thumbs.appendChild(cell);
  });
}
function feedbackPhotoAdd(file){
  return new Promise(resolve=>{
    try{
      const img=new Image();
      const objUrl=URL.createObjectURL(file);
      img.onload=()=>{
        try{
          const s=Math.min(1, FEEDBACK_PHOTO_SIDE/Math.max(img.naturalWidth,img.naturalHeight));
          const w=Math.max(1,Math.round(img.naturalWidth*s)), h=Math.max(1,Math.round(img.naturalHeight*s));
          const c=document.createElement('canvas'); c.width=w; c.height=h;
          const ctx=c.getContext('2d');
          ctx.drawImage(img,0,0,w,h);
          const dataUrl=c.toDataURL('image/jpeg',FEEDBACK_PHOTO_Q);
          URL.revokeObjectURL(objUrl);
          resolve(dataUrl.length<=FEEDBACK_PHOTO_B64_MAX ? dataUrl : null);
        }catch(e){ URL.revokeObjectURL(objUrl); resolve(null); }
      };
      img.onerror=()=>{ URL.revokeObjectURL(objUrl); resolve(null); };
      img.src=objUrl;
    }catch(e){ resolve(null); }
  });
}
function openFeedback(from){
  feedbackFrom=from||'menu'; setScreen('feedback'); sfx.click();
  const status=$('feedbackStatus'); if(status) status.textContent='';
  feedbackPhotos=[]; feedbackPhotoRender(); // новый заход — чистая коллекция, не старая с прошлого визита
  feedbackUpdateCount();
  aboutFill(); // 04.09.2026: карточка студии + версия переехали сюда из «Об игре» в Настройках (владелец: «я разработчик, это мой логотип», освободило пункт в настройках)
}
function closeFeedback(){ setScreen(feedbackFrom); sfx.click(); }
function feedbackUpdateCount(){
  // 30.08.2026 (владелец): счётчик на убывание — «сколько ещё можно» нагляднее, чем
  // «сколько уже набрано»; ноль сам по себе честно показывает игроку упор в потолок.
  const ta=$('feedbackText'); const c=$('feedbackCount');
  if(!ta||!c) return;
  const left=ta.maxLength-(ta.value||'').length;
  c.textContent=L.feedbackLeft?L.feedbackLeft(left):left;
  c.classList.toggle('feedbackCountLow', left<=0);
}
async function feedbackSend(){
  if(feedbackSending) return;
  const ta=$('feedbackText'); const status=$('feedbackStatus'); const btn=$('feedbackSendBtn');
  const text=(ta&&ta.value||'').trim();
  if(!text){ if(status&&L.feedbackEmpty) status.textContent=L.feedbackEmpty; return; }
  feedbackSending=true;
  if(btn) btn.disabled=true;
  if(status) status.textContent=L.feedbackSending||'';
  const res=await BEACON.feedback(text, feedbackPhotos);
  feedbackSending=false;
  if(btn) btn.disabled=false;
  if(!status) return;
  if(res.ok){
    status.textContent=L.feedbackSent||'';
    if(ta) ta.value='';
    feedbackPhotos=[]; feedbackPhotoRender(); // отправлено — коллекция не переживает успешную отправку
    feedbackUpdateCount();
  } else {
    status.textContent=(res.reason==='rate' ? L.feedbackRate : res.reason==='spam' ? L.feedbackSpam : L.feedbackFail)||'';
  }
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
  const genD=runNow();
  syncGhostGet(dl.pid,'gyro').then(g=>{ return (g && g.ok) ? g : syncGhostGet(dl.pid,'touch'); }).then(g=>{
    /* v1.282.20: цепочка из двух запросов живёт до 20 секунд. Прилетев в чужой забег, она
       перебивала foreignFrom='top' на 'duel' — и заслуженная победа над призраком из топа
       переставала засчитываться на посадке (там требуется именно 'top'). */
    if (!runSame(genD)) return;
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
      wireOn('duelX', 'click', ()=>{ duelSet(null); haptic('light'); toast(L.duelOff,'rgba(255,159,176,.5)'); });
    }
  }
  const h=$('duelHud');
  if(h){
    if(d && screenName==='game'){ h.textContent=L.duelHud(fmtN(d.best)); h.classList.remove('hidden'); }
    else h.classList.add('hidden');
  }
  if(d && typeof duelGhostFetch==='function') duelGhostFetch(); // склейка: призрак вызвавшего — рядом в забеге
}
function duelBoot(){ // deep-link ?startapp=duel_<pid> (Telegram) или #duel=<pid> (веб, тот же приём, что forgeBoot у #map=)
  try{
    const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    let pid = duelParse(sp);
    if(!pid && location.hash && location.hash.indexOf('#duel=')===0) pid = duelParse('duel_'+location.hash.slice(6)); // 30.08.2026: друг без Telegram открыл веб-ссылку
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
    }).catch(()=>{ duelBanner(); }); // 22.08.2026: сбой сети — баннер вызова просто не покажется, не всплывать необработанным отказом
    return true; // v1.6.0: вызов ждёт баннера — этот запуск единственный начинается с меню
  }catch(e){ duelBanner(); return false; }
}

/* v1.7.0 «Точная настройка»: подсказка «телефон тянет больше» — авто-режим прижал красоту,
   а тир устройства средний/флагман и сыграно ≥5 игр; максимум 3 показа, клик — навсегда */
/* ---------- Системные события (Блок 1/8) ---------- */
// сторож звука (v1.20.0): первый жест в WebView ненадёжен — будим контекст на каждом тапе,
// а раз в 2 секунды проверяем, что музыка живёт там, где должна звучать. Лечит и «умерла
// после голосового/звонка», и «не проснулась с первого тапа» — на любом телефоне.
/* 02.09.2026 «Звуковая лента» (владелец: видео с телефона + два «Отзыва»). На ленте
   самописца не было ни одного события про звук — взлёт, посадка, гироскоп, — а кто щёлкнул
   выключатель, когда и в каком состоянии пересоздался контекст после «тихой заморозки»
   (core.js, audioRecoverStall), было невидимо: каждый следующий «Отзыв» так же слеп.
   Пишем только ПЕРЕМЕНЫ, не каждый тик: новый контекст (номер, состояние, частота, где мы
   были), смена состояния того же контекста, и нажатия выключателей (в обработчиках
   setSoundBtn/setMusicBtn ниже). Лента — свидетель, не лекарство: сама ничего не чинит.
   Страж: guardAudioTapeSeesTogglesAndContext (cosmogram-crew). */
let audioTapeAC=null, audioTapeState='', audioTapeN=0;
function audioTape(){
  if (typeof BB==='undefined' || typeof AC==='undefined') return;
  const ac=AC;
  if (ac!==audioTapeAC){
    audioTapeAC=ac; audioTapeState=ac?ac.state:''; if(ac) audioTapeN++;
    const where=(typeof S!=='undefined'&&S.running)?((S.paused||S.pausing)?'пауза':'полёт'):screenName;
    BB.log('audio', (ac?'ctx#'+audioTapeN+' '+ac.state+' '+ac.sampleRate+'Hz':'ctx нет')+' · '+where);
    return;
  }
  if (ac && ac.state!==audioTapeState){ audioTapeState=ac.state; BB.log('audio', 'ctx#'+audioTapeN+' → '+ac.state); }
}
function audioKeep(){
  /* v1.282.20: пробуждение контекста вынесено ИЗ-ПОД настроек. Раньше игрок с выключенной
     музыкой, но включёнными звуками не получал ни жестового пробуждения, ни двухсекундной
     самопроверки — то есть после звонка на iPhone у него молчали и звуки тоже. */
  audio(); // создание/пробуждение контекста — в жесте надёжнее всего
  if (typeof audioSample==='function') audioSample(); // 22.08.2026: тот же тик — замер «время идёт?» для audioVerdict()
  audioTape(); // 02.09.2026: звуковая лента — перемены контекста на ленту самописца (см. выше)
  if (MUTED || !MUSIC_ON) return;
  if (S.running) music.start('game');
  else if (screenName==='menu') music.start('menu');
}
let audioKeepIv=0;
function audioKeepStart(){
  if(audioKeepIv || document.hidden) return;
  audioKeepIv=setInterval(audioKeep, 2000); // 30.08.2026: было 6000 — разошлось с собственным комментарием
    // выше («раз в 2 секунды»); «тихая заморозка» (core.js) ловится этим же тиком — на 6с
    // окно немой/зацикленной музыки на слабом Android доходило до 6с при каждой заморозке
    // (живые сигналы audio_stall_recover, владелец, Oppo CPH2565, 9 раз за 4 дня), на 2с втрое короче.
}
function audioKeepStop(){
  if(!audioKeepIv) return;
  clearInterval(audioKeepIv); audioKeepIv=0;
}
/* v1.284.10 «Свернул — не потерял». `pauseGame()` только НАЧИНАЕТ паузу: он ставит
   `S.pausing=1`, а `S.paused` появляется позже, в update(), когда «Склейка» доведёт
   время мира до 5%. Здесь же следом гасился цикл — и разгон, рассчитанный на полсекунды
   плавного замирания, переносился на момент ВОЗВРАТА. Игрок возвращался, видел меню
   паузы, а мир под этим меню пролетал остаток склейки и врезался: на последней жизни
   это стоило всего забега. Прятать плавность некому — экран уже не виден, поэтому
   доводим паузу до конца сразу. Занавес смерти не трогаем: у него свой путь до итогов. */
function onHidden(){
  if(S.running&&!S.paused) pauseGame();
  if(S.pausing && !S.dying){ S.pausing=0; S.paused=true; S.timeScale=.05; } // пауза достигнута ДО остановки цикла
  audioKeepStop();
  autosave(); if (typeof playSecFlush==='function') playSecFlush(); stopLoop(); } // v1.66.1: + секунды неба
function onShown(){ startLoop(); if(S.running&&!S.paused) keepAwake(); audioKeep(); audioKeepStart();
  /* v1.282.20: замок вертикальных свайпов ставился ОДИН раз на загрузке. После сворачивания и
     возврата Telegram его не восстанавливает — и свайп вниз снова сворачивает мини-апп прямо
     посреди полёта вместо руления. Переподтверждаем при каждом возврате. */
  try{ const t=tgApp(); if(t && t.disableVerticalSwipes) t.disableVerticalSwipes(); }catch(e){} }
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
wireOn('startBtn', 'click', runStart); // в выбранной дисциплине (v1.42.0)
wireOn('retryBtn', 'click', retryRun);
wireOn('watchBtn', 'click', ()=>{ // v1.94.0 «Театр призраков» Т1: смотрим свой прыжок дня на том самом небе
  if (!theaterTrack || screenName!=='over'){ haptic('light'); return; } // билет снят на финише забега дня — без него дверь не открывается
  theaterChamp=null; runMode='theater'; startGame(); haptic('light');
});
wireOn('tribuneBtn', 'click', ()=>{ // v1.100.1 «Трибуна чемпиона»: спектакль — так сегодня летел лучший (только после твоей посадки, дверь сторожит сервер)
  if (!theaterTrack || screenName!=='over'){ haptic('light'); return; } // тот же билет: день должен быть завершён
  haptic('light');
  const day=S.dailyDay||trackDayKey(); // v1.282.20: трибуна спрашивает чемпиона того же дня, что и трасса
  const genT=runNow();
  syncDailyChampion(day).then(r=>{
    if (!runSame(genT)) return; // v1.282.20: пока летел ответ, игрок успел слетать ещё раз — в театр его не тащим
    if (screenName!=='over' || runMode==='theater') return; // зритель уже ушёл со сцены итогов
    // v1.284.3: сервер может сказать «да» и не приложить чемпиона — тогда r.champion.track
    // бросал TypeError внутри .then. Сеть тут ни при чём (syncDailyPost гасит отказы своим
    // .catch) — дыра была ровно в теле обработчика: кнопка залипала без единого слова. Страж 123.
    if (!r || !r.ok || !r.champion){ toast(L.tribuneNone,'rgba(191,232,255,.45)'); return; } // мастер ещё не показал полёт (или скрыл его) — трибуна молчит, не врёт
    const g=ghostParse(r.champion.track);
    if (!g){ toast(L.tribuneNone,'rgba(191,232,255,.45)'); return; }
    g.cx=true; // лента чемпиона — в коридорных координатах: ghostStep положит её в мой коридор чести
    champTrack=g; theaterDay=day; // гость занимает свой моток — твой билет «Смотреть полёт» остаётся нетронутым
    theaterChamp={ name:r.champion.name||'', skin:r.champion.skin|0 };
    runMode='theater'; startGame();
  }).catch(()=>{ toast(L.tribuneNone,'rgba(191,232,255,.45)'); }); // 22.08.2026: сбой сети — та же честная тишина, что и «мастер ещё не показал полёт»
});
wireOn('modesBtn', 'click', ()=>{ sfx.click(); haptic('light'); modesFill(); setScreen('modes'); });
wireOn('modesBack', 'click', ()=>{ sfx.click(); setScreen('menu'); });
[['modeDaily','daily'],['modeBullet','bullet'],['modeSpeedrun','speedrun']].forEach(function(pair){
  wireOn(pair[0], 'click', ()=>{
    if (pair[1]==='daily'){ const tk2=trackDayKey(), dr=Store.get('dailyRun',null), usedN2=(dr&&dr.d===tk2)?(dr.n||0):dailyDoneGet(tk2); if (usedN2>=5){ haptic('light'); return; } } // 23.08.2026 «5 попыток»: сверяемся со счётчиком, восстановленным из журнала
    setRunMode(pair[1]); sfx.click(); haptic('light'); runStart(); }); // тап = сразу полёт (v1.43.0)
});
// v1.282.14: экран открываем ПЕРВЫМ, наполняем вторым — иначе страж forgeSkyKick видит
// #forgeScreen ещё скрытым, молча выходит, и живое мини-небо не стартует до первого касания.
wireOn('modeForge', 'click', ()=>{ sfx.click(); haptic('light'); setScreen('forge'); if(typeof forgeOpen==='function')forgeOpen(); }); // v1.68.0: конструктор трассы
wireOn('menuBtn', 'click', toMenu);
wireOn('pauseBtn', 'click', pauseGame);
wireOn('resumeBtn', 'click', resumeGame);
wireOn('restartBtn', 'click', ()=>{ if(runMode==='daily'&&S.running){ gameOver(); } else runStart(); }); // рестарт из паузы — в той же дисциплине (v1.42.0); v1.93: прыжок не переигрывают — «рестарт» дня = сдача с честными итогами
wireOn('pauseMenuBtn', 'click', toMenu);
wireOn('settingsBtn', 'click', ()=>openSettings('menu'));
wireOn('pauseSettingsBtn', 'click', ()=>openSettings('pause'));
wireOn('settingsBackBtn', 'click', closeSettings);
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
wireOn('setCalibBtn', 'click', calibrateTilt);
wireOn('setSoundBtn', 'click', ()=>{
  MUTED=!MUTED; Store.set('muted',MUTED?1:0); soundLabel(); haptic('light'); if(!MUTED) sfx.click();
  if (typeof BB!=='undefined') BB.log('audio', MUTED?'звук выкл (тап)':'звук вкл (тап)'); // 02.09.2026: звуковая лента — кто щёлкнул выключатель
  if(MUTED){ music.stop(.3); engine.stop(); } // звук выключен — молчит всё
  else { if(MUSIC_ON) music.start(screenName==='game'?'game':'menu'); if(S.running&&!S.paused) engine.start(); }
});
function musicLabel(){ rowSw('setMusicBtn', MUSIC_ON); setWellFill(); }
function contrastLabel(){ rowSw('setContrastBtn', CONTRAST); }
function colorblindLabel(){ rowSw('setColorblindBtn', COLORBLIND); }
/* Скоростные полосы удалены полностью, чтобы не оставлять пустой переключатель и не
   держать эффект в активном состоянии. Остальные настройки не зависят от этого флага. */
/* v1.284.20 «Выключатель руля» (партия 47). Строка гасит не только себя: «Чувствительность»
   и «Калибровка гироскопа» — настройки того же руля, и оставлять их живыми под выключенным
   тумблером значит предлагать настраивать то, чего нет. Гасим видом и снимаем нажатие. */
function gyroRowLabel(){
  const est = (typeof gyroRul==='function') ? gyroRul() : true;
  rowSw('setGyroBtn', est);
  for(const id of ['setSensBtn','setCalibBtn']){
    const el=$(id); if(!el) continue;
    el.style.opacity = est ? '' : '.35';
    el.style.pointerEvents = est ? '' : 'none';
    el.setAttribute('aria-disabled', est ? 'false' : 'true');
  }
}
function canvasFilterSync(){ // v1.280.0: класс на самом canvas — оба фильтра независимы, могут стоять вместе
  const cv=$('game'); if(!cv) return;
  cv.classList.toggle('hc', CONTRAST);
  cv.classList.toggle('cb', COLORBLIND);
}
wireOn('setContrastBtn', 'click', ()=>{
  CONTRAST=!CONTRAST; Store.set('contrast',CONTRAST?1:0); contrastLabel(); canvasFilterSync(); haptic('light'); sfx.click();
});
wireOn('setColorblindBtn', 'click', ()=>{
  COLORBLIND=!COLORBLIND; Store.set('colorblind',COLORBLIND?1:0); colorblindLabel(); canvasFilterSync(); haptic('light'); sfx.click();
});
wireOn('setGyroBtn', 'click', ()=>{
  const budet = !((typeof gyroRul==='function') ? gyroRul() : true);
  Store.set('gyroOn', budet?1:0);
  /* Выключили посреди живого забега — руль обязан отпуститься сейчас, а не на следующем
     пакете датчика: пакета может не быть вовсе, и самолёт остался бы уведённым туда, где
     рука была в момент выключения. Тот же класс беды, что «руль не залипает» (v1.282.13). */
  if(!budet && typeof input!=='undefined'){ input.tiltX=0; input.tiltY=0; input.useGyro=false; }
  gyroRowLabel(); haptic('light'); sfx.click();
});
wireOn('setMusicBtn', 'click', ()=>{
  MUSIC_ON=!MUSIC_ON; Store.set('music',MUSIC_ON?1:0); musicLabel(); haptic('light'); sfx.click();
  if (typeof BB!=='undefined') BB.log('audio', MUSIC_ON?'музыка вкл (тап)':'музыка выкл (тап)'); // 02.09.2026: звуковая лента
  if(!MUSIC_ON) music.stop(.3);
  else music.start(screenName==='game'?'game':'menu'); // включили — играем там, где находимся
});
wireOn('setLangBtn', 'click', ()=>{
  const order=['auto','ru','en','es','pt','fr']; // v1.108.1: добавляются языки по мере перевода
  langPref=order[(order.indexOf(langPref)+1)%order.length];
  Store.set('lang',langPref); applyLangPref(); applyLang(); refreshMenu(); langLabel(); sfx.click();
});
wireOn('diagBtn', 'click', ()=>{ // v1.66.3: сервисный центр — отдельный экран, не спойлер
  setScreen('diag'); diagLastT=0; diagBuild(); gyroStatus(); // свежие галочки и строка датчика на входе
  /* 13.08.2026: спойлер закрываем на каждом входе. Иначе один раз открытое «Ещё» остаётся
     открытым навсегда, и экран возвращается к тому самому отчёту, от которого мы уходим. */
  { const b=$('diagMoreBox'); if(b){ b.classList.add('hidden'); $('diagMoreBtn').classList.remove('open'); } }
  haptic('light'); sfx.click();
});
wireOn('diagBackBtn', 'click', ()=>{ setScreen('settings'); sfx.click(); });
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
    // 02.09.2026: было R.push(info, «Нуль появится сам на первых секундах полёта») —
    // владелец: «зачем это игроку?». Эта ветка (не alive, ноль не принят) срабатывает
    // ровно там же, где и «Датчик молчит» наверху, — сказать больше нечего, строку убрали.
    if (typeof bbVerdict==='function'){ // v1.99.7 «Чёрный ящик»: первое сломанное звено цепи — одной строкой
      const v=bbVerdict();
      // 02.09.2026: bbVLock срабатывает в том же условии, что и убранная «Полёт без рук
      // заперт» ниже (!gyroUnlocked()) — тот же смысл другими словами, не дублируем.
      if (v!==L.bbVLock) R.push({st:(v===L.bbVOk)?'ok':((v.indexOf(L.bbVSkew)===0)?'warn':'info'), txt:L.diagChain+' '+v, rare:true});
    }
  }
  if (Q.fps>=45) R.push({st:'ok', txt:L.diagFpsOk+' '+Math.round(Q.fps)});
  else R.push({st:'warn', txt:L.diagFpsLow+' '+Math.round(Q.fps), fix:L.diagFixGfx, act:diagFixGfx});
  R.push({st: MUTED?'info':'ok', txt: MUTED?L.diagSoundOff:L.diagSoundOn});
  // v1.99.6 «Паспорт штурвала» (02.09.2026: переименован в «Геймпад» — «штурвал» без
  // расшифровки не говорил игроку, что это джойстик/геймпад; EN/ES/PT/FR уже были прямым
  // текстом, только RU оставался поэтичным).
  let pads=[]; try{ if(typeof navigator!=='undefined'&&navigator.getGamepads)
    pads=Array.from(navigator.getGamepads()).filter(p=>p&&p.connected); }catch(e){}
  /* 13.08.2026: у строки появилась метка `rare`. Редкое — не то, что неважно, а то, что
     человек не проверяет: техническое устройство борта. Геймпад — особый случай: пока его
     нет, это самая бесполезная строка на экране; как только он появился, это ответ на
     вопрос «а он вообще виден?». Поэтому редкость у него не постоянная, а по факту. */
  if (pads.length) R.push({st:'ok', txt:L.diagPadOk+' '+pads[0].id.split('(')[0].trim()});
  else R.push({st:'info', txt:L.diagPadNone, rare:true});
  // 02.09.2026 (владелец, «зачем это игроку? он будто знает что это за события»): «Лента
  // самописца: N событий», «Мир неба», «Лист холста», «Чернила» убраны — голые внутренние
  // числа без объяснения и без действия для игрока. Ничего не теряем: diagReport() (паспорт
  // борта, уходит с реальным отчётом) и BB.text() (сама лента) собирают то же самое отдельно,
  // независимо от этого экрана — см. js/ui.js diagReport().
  R.push({st:'info', txt:L.diagMotion+' '+(RM?L.diagOn:L.diagOff), rare:true});
  // 02.09.2026: строка «виджет входа Telegram молчит» отсюда убрана — это инструкция ДЛЯ НАС
  // (проверь /setdomain у BotFather), игрок её не починит и не поймёт. Сигнал теперь уходит
  // молча в BEACON (js/sync.js), а не на верхнюю, самую заметную строку экрана игрока.
  // 02.09.2026: «Полёт без рук пока заперт» тоже убрана — не поломка, а прогресс игры,
  // уже объясняется правильно в Настройках, где этот режим реально открывают.
  return R;
}
let diagLastT=0;
function diagRefresh(){ if (screenName!=='diag') return; // v1.66.3: живые галочки — только на экране сервисного центра
  const now=performance.now(); if(now-diagLastT<500) return; diagLastT=now; diagBuild(); }
function diagRowNode(r){ // одна строка сервисного центра: значок состояния, текст, кнопка лечения
  const d=document.createElement('div'); d.className='drow';
  const icn=r.st==='ok'?'OK':(r.st==='warn'?'!':'i');
  const col=r.st==='ok'?'#8fff9f':(r.st==='warn'?'#ff9fb0':'#8fd0ff');
  d.innerHTML='<span class="dst" style="color:'+col+'">'+icn+'</span><span>'+r.txt+'</span>';
  if (r.fix){ const b=document.createElement('button'); b.className='btn ghost dbtn';
    b.style.cssText='font-size:12px;padding:6px 12px;min-height:0;margin:0 0 0 auto';
    b.textContent=r.fix; b.addEventListener('click',()=>{ sfx.click(); r.act(); }); d.appendChild(b); }
  return d;
}
/* 13.08.2026 «Ответ, а не отчёт». Порядок больше не совпадает с порядком написания кода.
   Сверху — беды, потому что человек пришёл сюда именно с бедой, и она не должна быть
   седьмой строкой. Под ними — то, что проверяют чаще всего: датчик, ноль, кадры, звук.
   Всё техническое — под «Ещё», свёрнутым по умолчанию: оно нужно раз в жизни и мешает
   каждый раз. Страж 111 стережёт все три правила. */
function diagBuild(){
  const list=$('diagList'); if(!list) return;
  const rows=diagRows();
  const bedy=rows.filter(r=>r.st==='warn');            // мешает лететь — всегда наверх
  const glav=rows.filter(r=>r.st!=='warn' && !r.rare); // проверяют часто
  const redk=rows.filter(r=>r.st!=='warn' && r.rare);  // устройство борта — под спойлер
  list.innerHTML='';
  for (const r of bedy.concat(glav)) list.appendChild(diagRowNode(r));
  const rare=$('diagListRare');
  if (rare){ rare.innerHTML=''; for (const r of redk) rare.appendChild(diagRowNode(r)); }
}
wireOn('diagMoreBtn', 'click', ()=>{ // тот же спойлер, что «Ещё» в настройках
  const b=$('diagMoreBox'); b.classList.toggle('hidden');
  const open=!b.classList.contains('hidden');
  toggleCls('diagMoreBtn','open', open);
  if (open){ try{ $('diagMoreBtn').scrollIntoView({block:'nearest'}); }catch(e){} }
  haptic('light'); sfx.click();
});
async function diagFixSensor(){
  audio();
  if (NEEDS_TILT_PERMISSION){ let r=''; try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    if (r!=='granted'){ toast(L.noTilt,'rgba(255,159,176,.5)'); return; } }
  if (typeof gyroKick==='function') gyroKick();
  toast(L.diagKicked,'rgba(143,255,159,.5)');
}
function diagFixGfx(){ Q.mode='low'; Store.set('gfx','low'); gfxCap(); resize(); gfxLabel(); diagLastT=0; diagRefresh(); haptic('light'); if(typeof BEACON!=='undefined') BEACON.signalShot('gfx_fix',''); } // v1.107.0: нажал «Снизить графику» — кадры болели, почта знает; 02.09.2026: + снимок холста
/* 13.08.2026: слепок остался, а кнопка «Скопировать отчёт» ушла. Просить игрока копировать
   текст и вставлять его в сообщение мы больше не будем: «Почта неба» присылает то же самое
   сама и без его участия. Сам diagReport() держим живым намеренно — это готовый паспорт
   борта, и когда мы захотим приложить его к письму об ошибке, он уже написан. */
function diagReport(){
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
  Ln.push('canvas: '+(typeof canvasContextLost!=='undefined'&&canvasContextLost?'context-lost':'ready')+' dpr-cap '+dprCap);
  Ln.push('motion: '+(RM?'reduce':'full')+' ink '+(P3?'display-p3':'srgb'));
  Ln.push('lang: '+LANG);
  return Ln.join('\n');
}
wireOn('diagVibroBtn', 'click', ()=>{ // v1.60.0: длинный сильный сигнал + честный диагноз канала
  sfx.click();
  const ch=typeof vibroChannel==='function'?vibroChannel():0;
  setText('diagVibroStat', ch===2?L.vibChTg : ch===1?L.vibChWeb : L.vibChNone);
  const hf=morseHF();
  if (hf){ try{ hf.notificationOccurred('error'); }catch(e){}
    [0,260,520].forEach(t=>setTimeout(()=>{ try{ hf.impactOccurred('heavy'); }catch(e){} },t)); }
  else if (navigator.vibrate){ try{ navigator.vibrate([300,120,300,120,300]); }catch(e){} }
});
// 31.08.2026 «Приложить диагностику» (владелец): та же лента, что показывала снятая
// 02.09.2026 кнопка «Скопировать самописец» (BB.text()),
// но подставляется прямо в это поле, не через буфер обмена — снимает и лишний экран
// (Сервисный центр → назад → сюда), и Samsung/Telegram WebView, где системная вставка
// иногда просто не срабатывает (жалоба владельца, живое устройство). Метка-разделитель
// защищает от повторного приклеивания той же ленты, если нажать ещё раз не читая.
const FEEDBACK_TAPE_MARK='\n\n— — —\n';
// 02.09.2026 (владелец, живое наблюдение): было ta.value.slice(0,maxLength) на уже склеенной
// строке — резало КОНЕЦ, а BB.text() пишет ленту хронологически (старые сверху, самые свежие —
// в конце), значит терялось именно самое ценное для разбора. Собственный текст игрока тоже
// мог пострадать. Страж 146 (guard.mjs). Здесь — бюджет считается ОТ текста игрока (его
// никогда не режем), а сама лента обрезается по строкам с начала (отбрасываем старые события),
// оставляя заголовок (версия/вердикт/паспорт борта — до «--- tape ---») и как можно больше
// свежих строк с конца.
function feedbackTapeFit(budget){
  let text=''; try{ text=(typeof BB!=='undefined' && BB.text) ? BB.text() : ''; }catch(e){}
  if(!text) text='Cosmogram v'+(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?')+' blackbox · лента пуста';
  if(budget<=0) return '';
  if(text.length<=budget) return text;
  const SEP='--- tape ---\n', OMIT='\n… (старые события пропущены) …';
  const sepAt=text.indexOf(SEP);
  if(sepAt<0) return text.slice(0,budget); // формат неожиданно другой — честная обрезка с конца, не выдумываем
  const head=text.slice(0,sepAt+SEP.length);
  if(head.length+OMIT.length>=budget) return head.slice(0,budget); // потолок совсем тесный — хотя бы заголовок
  const lines=text.slice(sepAt+SEP.length).split('\n').filter(Boolean);
  let bodyBudget=budget-head.length-OMIT.length, kept=[];
  for(let i=lines.length-1;i>=0;i--){ // от самых свежих назад, пока хватает места
    const need=lines[i].length+1;
    if(need>bodyBudget) break;
    kept.unshift(lines[i]); bodyBudget-=need;
  }
  return head+OMIT+(kept.length?'\n'+kept.join('\n'):'');
}
wireOn('feedbackAttachBtn', 'click', ()=>{
  const ta=$('feedbackText'); if(!ta) return;
  sfx.click(); haptic('light');
  if(ta.value.indexOf(FEEDBACK_TAPE_MARK)>=0) return; // уже приложено — не дублируем
  const budget=ta.maxLength-(ta.value||'').length-FEEDBACK_TAPE_MARK.length;
  ta.value=(ta.value||'')+FEEDBACK_TAPE_MARK+feedbackTapeFit(budget);
  feedbackUpdateCount();
  if(typeof toast==='function') toast(L.feedbackAttached,'rgba(159,232,255,.5)');
});
wireOn('feedbackPhotoBtn', 'click', ()=>{
  if(feedbackPhotos.length>=FEEDBACK_PHOTO_MAX) return;
  sfx.click(); haptic('light');
  const inp=$('feedbackPhotoInput'); if(inp) inp.click();
});
wireOn('feedbackPhotoInput', 'change', async ()=>{
  const inp=$('feedbackPhotoInput'); if(!inp) return;
  const room=FEEDBACK_PHOTO_MAX-feedbackPhotos.length;
  const files=Array.from(inp.files||[]).slice(0,room);
  let skipped=false;
  for(const f of files){
    const url=await feedbackPhotoAdd(f);
    if(url) feedbackPhotos.push(url); else skipped=true;
  }
  inp.value='';
  feedbackPhotoRender();
  if(skipped && typeof toast==='function') toast(L.feedbackPhotoTooBig,'rgba(255,180,140,.5)');
});
wireOn('diagCinemaTestBtn', 'click', ()=>{ // 30.08.2026: разовая проверка цены записи на реальном телефоне
  if (typeof cinemaTestArm==='function') cinemaTestArm();
  haptic('light'); sfx.click();
  if (typeof toast==='function') toast('Записано будет — лети', 'rgba(140,220,180,.5)');
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
function vibroLabel(){ rowSw('setVibroBtn', VIBRO); setWellFill(); }
wireOn('setVibroBtn', 'click', ()=>{
  VIBRO=!VIBRO; Store.set('vibro',VIBRO?1:0); vibroLabel(); if(VIBRO) haptic('medium');
});
function gfxModes(){ return ['auto','low','med','high'].concat(gfxUltraOk()?['ultra']:[]); } // v1.35.0: четыре честных ступени; «Ультра» в цикле только у флагманов
function gfxLabel(){ rowV('setGfxBtn',
  (Q.mode==='auto'?L.gfxAuto:(Q.mode==='low'?L.gfxLow:(Q.mode==='med'?L.gfxMed:(Q.mode==='ultra'&&gfxUltraOk()?L.gfxUltra:L.gfxHigh))))); setWellFill(); }
wireOn('setGfxBtn', 'click', ()=>{
  const ms=gfxModes(); Q.mode=ms[(ms.indexOf(Q.mode)+1)%ms.length];
  Store.set('gfx',Q.mode); gfxCap(); resize(); // HD-резолюция следует за режимом
  gfxLabel(); haptic('light'); sfx.click();
});
/* 31.08.2026 «Стоп-кадр»: владелец — «Затишье» уже замедляет мир при near-miss (game.js:
   baseTimeScale, было жёстко .4) — не новый режим, а сила уже готовой машинерии. Тот же
   цикл-паттерн, что у gfxModes/gfxLabel выше. .4 первым — прежнее поведение остаётся
   умолчанием для всех, кто уже играет в «Затишье», ничей опыт не меняется молча. */
let BT_TS = Store.get('btTs', .4);
function btModes(){ return [.4,.2,0]; }
function btLabel(){ rowV('setBtBtn', BT_TS===.2?L.btStrong:(BT_TS===0?L.btFreeze:L.btSoft)); }
wireOn('setBtBtn', 'click', ()=>{
  const ms=btModes(); BT_TS=ms[(ms.indexOf(BT_TS)+1)%ms.length];
  Store.set('btTs',BT_TS); btLabel(); haptic('light'); sfx.click();
});
const EXXXIT_DOOR_PATH='m 148.169,80.709657 v 60.715533 c 6.31638,0.48241 10.5308,5.63536 10.5308,10.31517 v 2.4687 l -2.46869,-0.006 -8.06211,-0.0182 v 12.73893 l 6.08214,5.9854 h -40.12901 l -7.43227,-7.11934 h -9.238704 l 7.432844,7.11934 H 93.428076 l -6.08214,-5.98542 V 125.1738 h 10.66451 c 0.0833,5.9e-4 0.16247,0.004 0.24579,0.004 0.0556,0 0.0832,-0.007 0.13598,-0.008 0.0349,-5.8e-4 0.0686,-0.002 0.10294,-0.004 1.43847,-0.0274 1.750194,-0.28172 2.778784,-1.31031 l 6.24145,-7.37766 c 1.73064,3.78552 3.36138,7.00437 5.08475,10.65995 0.19459,0.37374 0.65441,1.21334 0.30951,1.86731 l -17.152864,34.63575 6.292634,-0.021 c 3.29001,0.0726 4.66137,-2.19803 5.81814,-4.23075 4.63991,-9.35178 9.30161,-18.69659 13.94909,-28.04895 l 0.87733,16.64253 c 0.22955,2.88042 2.17565,3.61243 4.72575,3.69137 l 28.81702,0.0659 c 0,-3.31243 -3.28192,-7.68712 -8.6265,-7.89482 0,0 -10.29203,0.11556 -15.67301,0.13711 -0.68225,0 -0.86922,-0.38098 -0.94846,-0.94845 -0.24993,-4.28189 -0.48763,-8.59103 -0.7533,-12.87205 -0.16632,-2.12536 -0.3528,-3.59821 -0.96949,-5.20708 -2.0106,-4.31016 -4.02228,-8.59953 -6.03491,-12.89424 l 7.36399,-0.0859 c 0.19342,-0.007 0.34356,0.0358 0.44435,0.20823 l 5.32998,9.33771 c 2.19819,4.00865 8.13833,1.08508 6.14813,-3.16681 l -6.53616,-10.93249 c -1.14949,-1.70937 -1.6747,-2.29896 -4.66145,-2.39188 0,0 -13.95626,-0.0222 -20.94497,-0.0222 v -5.8e-4 c -2.27014,-0.0504 -2.52919,0.66163 -3.61401,1.81782 -2.91625,3.5982 -6.10478,7.43502 -8.949664,10.7891 -0.3953,0.47396 -0.61745,0.67583 -1.55836,0.66796 -1.74231,-0.0292 -3.27034,0.002 -4.6188,0.0808 h -4.28821 V 80.709277 Z m -38.64915,8.33748 c -4.00109,0 -7.06757,3.07482 -7.06757,7.09658 0,4.029633 3.06678,7.103983 7.06757,7.103983 4.00049,0 7.07496,-3.07435 7.07496,-7.103983 0,-4.02205 -3.07447,-7.09658 -7.07496,-7.09658 z';
/* 03.09.2026: логотип exxxit game — настоящий знак ISO 7010 E001 (Emergency Exit,
   общественное достояние), дверь перекрашена в космос, человечек/штриховка не тронуты. */
function exxxitLogoHTML(){
  return '<div class="exxxitCard">'+
    '<span class="exxxitRivet tl"></span><span class="exxxitRivet tr"></span>'+
    '<span class="exxxitRivet bl"></span><span class="exxxitRivet br"></span>'+
    '<svg class="exxxitIcon" viewBox="0 0 105.83333 105.83333">'+
      '<defs>'+
        '<radialGradient id="exxxitSpaceGrad" cx="55%" cy="32%" r="78%">'+
          '<stop offset="0%" stop-color="#26356e"/><stop offset="60%" stop-color="#0a1230"/>'+
          '<stop offset="100%" stop-color="#05070f"/></radialGradient>'+
        '<radialGradient id="exxxitPlanetGrad" cx="40%" cy="40%" r="60%">'+
          '<stop offset="0%" stop-color="#f2cf7a"/><stop offset="100%" stop-color="#a97a2c"/></radialGradient>'+
        '<clipPath id="exxxitDoorClip" clipPathUnits="userSpaceOnUse">'+
          '<use href="#exxxitDoorPath" transform="translate(-65.616667,-71.966666)"/></clipPath>'+
      '</defs>'+
      '<g transform="translate(-65.616667,-71.966666)">'+
        '<path id="exxxitDoorPath" fill="url(#exxxitSpaceGrad)" d="'+EXXXIT_DOOR_PATH+'"/>'+
      '</g>'+
      '<g clip-path="url(#exxxitDoorClip)">'+
        '<circle cx="86" cy="80" r="30" fill="url(#exxxitPlanetGrad)" opacity=".9"/>'+
        '<circle cx="26" cy="16" r="1.1" fill="#fff"/><circle cx="20" cy="30" r="0.8" fill="#fff"/>'+
        '<circle cx="34" cy="24" r="1.3" fill="#fff"/><circle cx="16" cy="46" r="0.9" fill="#fff"/>'+
        '<circle cx="40" cy="10" r="1" fill="#fff"/><circle cx="30" cy="58" r="0.8" fill="#fff"/>'+
      '</g>'+
    '</svg>'+
    '<div class="exxxitWord"><b>EXXXIT</b><span>Game Studio</span></div>'+
  '</div>';
}
function aboutFill(){ setHTML('feedbackAbout', 'Cosmogram · v'+GAME_VERSION+exxxitLogoHTML()); } // 28.08.2026: строка канала убрана по просьбе владельца (aboutTags вычеркнуты ещё в v1.27.0); 03.09.2026: + карточка студии; 04.09.2026: переехало из «Об игре» (Настройки) на «Написать разработчику» — владелец: «я разработчик, это мой логотип»
// iOS: системный запрос доступа к датчикам — только по явному тапу красивой кнопки
function refreshGyroLock(){ const has=(typeof gyroSensorThere==='function')?gyroSensorThere():HAS_GYRO; // v1.108.1: та же честная проверка, что и у автооффера — не просто факт API
  const b=$('gyroUnlockBtn'); if(b) b.classList.toggle('hidden', !has || gyroUnlocked());
  const o=$('setGyroOffBtn'); if(o){ o.classList.toggle('hidden', !has || !gyroUnlocked()); rowSw('setGyroOffBtn', gyroUnlocked()); } } // v1.106.0 «Штурман по желанию»: ряд-выключатель виден только при открытом замке
wireOn('gyroUnlockBtn', 'click', async ()=>{ // открытие «Полёта без рук» из настроек — тем же ритуалом: разрешение + «держи ровно»
  audio(); sfx.click();
  if (NEEDS_TILT_PERMISSION){ let r=''; try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    if (r!=='granted'){ toast(L.noTilt,'rgba(255,159,176,.5)'); return; } }
  Store.set('gyroUnlocked',1);
  refreshGyroLock();
  if (typeof gyroKick==='function') gyroKick();
  if (typeof calibrateTilt==='function') calibrateTilt(); else toast(L.gyroUnlockedOk,'rgba(143,255,159,.5)');
  haptic('success');
});
wireOn('setGyroOffBtn', 'click', ()=>{ // v1.106.0 «Штурман по желанию»: запереть замок обратно — штурвал пальцу; рекорды гироскопа священны, не трогаем
  Store.set('gyroUnlocked',0);
  if (typeof calReset==='function') calReset(false,true,'gyro-lock'); // при переоткрытии ноль найдём заново — только из настоящей тишины (закон v1.100.3)
  refreshGyroLock();
  haptic('light'); sfx.click();
  toast(L.gyroOffOk,'rgba(159,232,255,.5)');
});
/* «ЕЩЁ РАЗ?»: тумблер с тремя состояниями за двумя положениями.
   Показываем ФАКТ (летит тень сейчас или нет), а нажатие переводит в явное «да»/«нет» —
   противоположное тому, что игрок видит. Пока он не трогал тумблер, состояние 'auto':
   первые три забега тень есть, дальше нет, и переключатель честно это отражает сам. */
function againLabel(){ rowSw('setAgainBtn', typeof ghostActive==='function' ? ghostActive() : true); }
wireOn('setAgainBtn', 'click', ()=>{
  const bylo = (typeof ghostActive==='function') ? ghostActive() : true;
  Store.set('ghostAgain', bylo ? 0 : 1);
  againLabel();
  haptic('light'); sfx.click();
});
wireOn('setBeaconBtn', 'click', ()=>{ // v1.107.0 «Почта неба»: честный выключатель — выкл значит молчание (даже очередь не копится)
  const on = Store.get('beaconOn',1)===1 ? 0 : 1;
  Store.set('beaconOn',on);
  rowSw('setBeaconBtn', on===1);
  haptic('light'); sfx.click();
});
wireOn('tiltBtn', 'click', ()=>{
  audio();
  try{
    DeviceOrientationEvent.requestPermission().then(r=>{
      if(r==='granted'){
        toggleCls('tiltBtn','hidden',true);
        toast(L.tiltOn,'rgba(143,255,159,.5)'); haptic('success');
      } else toast(L.noTilt,'rgba(255,159,176,.5)');
    }).catch(()=>toast(L.noTilt,'rgba(255,159,176,.5)'));
  }catch(e){ toast(L.noTilt,'rgba(255,159,176,.5)'); }
});
// чувствительность гироскопа (планшеты: меньший угол наклона для поворота)
const SENS_STEPS=[0.75,1,1.25,1.5];
function sensLabel(){ rowV('setSensBtn','×'+input.sens); setWellFill(); }
wireOn('setSensBtn', 'click', ()=>{
  const i=SENS_STEPS.indexOf(input.sens);
  input.sens=SENS_STEPS[(i+1)%SENS_STEPS.length];
  Store.set('sens',input.sens); sensLabel(); haptic('light'); sfx.click();
});
wireOn('overDetailsBtn', 'click', ()=>{ // спойлер «Подробности полёта»: мотивация, ранг, паспорт и сетка — по желанию (v1.44.0; v1.84.0 — вся вторая сцена)
  const om=$('overMore');
  const hid = om ? !om.classList.contains('hidden') : true; // новое состояние после переключения — считаем сами, не полагаемся на return classList.toggle()
  toggleCls('overMore','hidden', hid);
  toggleCls('overDetailsBtn','open',!hid); sfx.click(); haptic('light'); });
wireOn('hangarBtn', 'click', ()=>{
  renderHangar(); setScreen('hangar'); sfx.click();
  // 04.09.2026: подтягиваем владение премиум-скинами с сервера при каждом входе в Ангар —
  // тихо, в фоне, не блокирует открытие экрана; если что-то новое куплено (или куплено
  // с другого устройства) — плитки перерисуются сами, когда ответ придёт.
  if(typeof syncPremiumOwned==='function') syncPremiumOwned().then(o=>{
    if(!(o && o.ok && Array.isArray(o.owned))) return;
    let changed=false;
    o.owned.forEach(id=>{ if(!S.ownedSkins.includes(id)){ S.ownedSkins.push(id); changed=true; } });
    if(changed){ Store.set('ownedSkins', S.ownedSkins); if(angarCat==='color') angarBuyFill(); }
  });
});
wireOn('hangarBackBtn', 'click', toMenu); // 28.08.2026: вернулась — экран был без единой видимой кнопки назад вне Telegram
/* ---------- Достижения + онбординг (модуль ach.js) ---------- */
function openAch(){ renderAch(); setScreen('ach'); sfx.click(); }
function closeAch(){ toMenu(); }
wireOn('achBtn', 'click', openAch);
wireOn('achBackBtn', 'click', closeAch); // 28.08.2026: вернулась, см. коммент у hangarBackBtn
/* Вкладка «🌍 Топ»: честная таблица (модуль sync.js) */
let topCat='touch';
function achTabSel(mine){
  toggleCls('tabMine','sel',mine); toggleCls('tabTop','sel',!mine);
  toggleCls('achMineWrap','hidden',!mine); toggleCls('achTopWrap','hidden',mine);
  if(!mine) renderTop();
}
wireOn('tabMine', 'click',()=>{ achTabSel(true); sfx.click(); });
wireOn('tabTop', 'click',()=>{ achTabSel(false); sfx.click(); });
document.querySelectorAll('.topCat').forEach(b=>b.addEventListener('click',()=>{
  topCat=b.dataset.cat;
  document.querySelectorAll('.topCat').forEach(x=>x.classList.toggle('sel',x===b));
  renderTop(); sfx.click();
}));
/* ---------- Одна таблица, много входов (v1.51.0) ----------
   Гость играет полноценно, рекорд ждёт локально; вход — Telegram Login Widget (только браузер).
   Анонимных записей нет: без подписи Telegram в таблицу не встать — доверие дороже охвата. */
function accFill(){ // настройки: статус входа + кнопки (гость) / «Выйти» (веб-сессия)
  const st=$('accStatus'), out=$('accOutBtn');
  if(!st || typeof syncAvailable!=='function') return;
  const dw=$('dcWidget'), gw=$('gWidget');
  if (syncAvailable()){
    st.textContent=L.accIn(typeof syncAuthName==='function'?(syncAuthName()||''):'');
    if(dw) dw.innerHTML=''; if(gw) gw.innerHTML='';
    out.classList.toggle('hidden', !!syncInitData()); // из мини-аппа «выходить» нечего — ты дома
  } else {
    st.textContent=L.accGuest;
    out.classList.add('hidden');
    if(!syncInitData()){ if(dw) dcMount(dw); if(gw) gMount(gw); } else { if(dw) dw.innerHTML=''; if(gw) gw.innerHTML=''; }
  }
}
function webJoinFill(){ // экран итогов: гостю — приглашение и кнопка входа, вошедшему — чисто
  const wj=$('webJoin'); if(!wj || typeof syncAvailable!=='function') return;
  const guest=!syncAvailable();
  wj.classList.toggle('hidden', !guest);
  /* v1.282.20: раньше виджет входа перемонтировался на КАЖДОЙ смерти — а dcMount/gMount вставляют
     внешнюю кнопку и заводят сторож на 5 секунд. Двадцать смертей за сессию у веб-гостя = двадцать
     вставок подряд. Монтируем один раз и оставляем, пока он жив. */
  if (guest){ $('webJoinTxt').textContent=L.webJoin;
    const dj0=$('dcJoinWidget'); if (dj0 && !dj0.firstChild) dcMount(dj0);
    const gj0=$('gJoinWidget'); if (gj0 && !gj0.firstChild) gMount(gj0); }
  else { const dj=$('dcJoinWidget'); if(dj) dj.innerHTML=''; const gj=$('gJoinWidget'); if(gj) gj.innerHTML=''; }
}
function syncAuthChanged(){ // зовёт sync.js после входа виджетом, выхода или 401
  accFill(); webJoinFill();
  if(typeof syncFlush==='function' && typeof syncAvailable==='function' && syncAvailable()) syncFlush().catch(()=>{});
  if(typeof syncDailyFlush==='function' && typeof syncAvailable==='function' && syncAvailable()) syncDailyFlush().catch(()=>{});
  if (screenName==='ach' && $('achTopWrap') && !$('achTopWrap').classList.contains('hidden')) renderTop();
}
wireOn('accOutBtn', 'click',()=>{ Store.del('tgWebAuth'); Store.del('dcAuth'); Store.del('gAuth'); sfx.click(); haptic('light'); syncAuthChanged(); });

/* Свой рекорд в этой категории — тот, что лежит на устройстве. Нужен гостю: сервер про него
   не знает и знать не может, а «ты был бы 9-м из 15» — единственное, что превращает чужую
   таблицу из витрины чужих успехов в разговор о твоём месте в ней. */
function myBestFor(cat){
  const k = cat==='gyro'?'bestGyro' : cat==='touch'?'bestTouch' : cat==='keys'?'bestKeys'
          : cat==='bullet'?'bestBullet' : cat==='dist'?'bestDist' : null;
  return k ? saneNumber(Store.get(k,0),0) : 0;
}
/* ============================================================
   13.08.2026 «Витрина, а не клуб».
   Было: гость жал «ТОП» и вместо таблицы получал строку «войди через Telegram». В таблице
   при этом пятнадцать живых игроков — то есть человек просил показать, а ему отказывали,
   и выглядело это как поражение по его вине.
   Стало: таблицу видят все. Приглашение стоит ПОД ней и говорит о возможности.
   Своё место гостю считает экран — по уже полученному списку, без второго запроса к серверу.
   ============================================================ */
function renderTop(){
  const list=$('topList'), me=$('topMe');
  const wb=$('topWouldBe'), jn=$('topJoin'), dl=$('dcLogin');
  const gost = (typeof syncAvailable!=='function') || !syncAvailable();
  me.textContent=''; list.innerHTML='<div class="topMsg">'+L.topLoading+'</div>';
  if(wb) wb.classList.add('hidden');
  if(jn) jn.classList.add('hidden');
  if (typeof syncTop!=='function'){ list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; return; }
  /* Кнопка входа: гостю — под таблицей, вошедшему — прочь. Раньше появлялась ВМЕСТО
     таблицы, теперь только рядом с приглашением. */
  if (gost){
    if (dl){ dl.classList.remove('hidden'); if(!syncInitData()) dcMount(dl); } // v1.52.0
  } else {
    if (dl){ dl.classList.add('hidden'); dl.innerHTML=''; }
  }
  const askCat=topCat; // v1.282.20: медленный ответ прошлой вкладки больше не рисуется под нынешним заголовком
  /* 03.09.2026: «Трасса дня»/«Спидран» — свои двери (cosmogram-daily, action daily_top/
     speedrun_top), не общая scores/CATS таблица (у обоих честное «одно небо на всех»,
     у остальных пяти — нет). Ответ нарочно того же вида ({ok,top,me}), рендер ниже не знает разницы. */
  const topPromise = (askCat==='daily' && typeof syncDailyTop==='function')
    ? syncDailyTop(typeof trackDayKey==='function'?trackDayKey():'')
    : (askCat==='speedrun' && typeof syncSpeedrunTop==='function')
    ? syncSpeedrunTop(typeof SPEEDRUN_ETERNAL_DAY!=='undefined'?SPEEDRUN_ETERNAL_DAY:'') // 03.09.2026 «Set Seed»: постоянный ключ
    : syncTop(askCat);
  // Спидран меряет секунды (меньше — лучше), не очки/метры — своё форматирование в обоих местах,
  // где счёт показывается («твоё место» и сама строка), одной функцией, не двумя копиями branch'а.
  const topFmt = v => askCat==='speedrun' ? fmtTime(v) : fmtN(v)+(askCat==='dist'?' '+(L.unitM||'м'):'');
  topPromise.then(d=>{
    if(screenName!=='ach' || topCat!==askCat) return; // игрок уже ушёл или переключил категорию — не трогаем DOM
    if(!d || !d.ok){ list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; return; }
    me.textContent = d.me ? (L.topMe+'#'+d.me.rank+' · '+topFmt(d.me.best)) : '';
    /* Гостю — его собственное место в чужой таблице и приглашение. Считаем здесь, а не на
       сервере: сервер не знает, кто это, и спрашивать его второй раз не о чем. */
    if (gost){
      const moy = myBestFor(askCat);
      const spisok = (d.top||[]);
      if (wb){
        if (moy>0 && spisok.length){
          // Спидран: «выше тебя» — у кого время МЕНЬШЕ твоего, не больше (зеркально от остальных)
          const vyshe = askCat==='speedrun' ? spisok.filter(r=>Number(r.best)<moy).length
            : spisok.filter(r=>Number(r.best)>moy).length;
          wb.textContent = L.topWouldBe(topFmt(moy), vyshe+1, spisok.length);
          wb.classList.remove('hidden');
        } else wb.classList.add('hidden');
      }
      if (jn){
        setText('topJoinTitle', L.topJoinTitle);
        setText('topJoinSub', L.topJoinSub);
        jn.classList.remove('hidden');
      }
    }
    if(!d.top || !d.top.length){ list.innerHTML='<div class="topMsg">'+L.topEmpty+'</div>'; return; }
    list.innerHTML=d.top.map((r,i)=>'<div class="topIt'+(r.me?' me':'')+'" style="animation-delay:'+(Math.min(i,10)*60)+'ms"><span class="topN'+(i<3?' m'+(i+1):'')+'">'+(i+1)+
      /* 03.09.2026 «Рекорд должен быть рекордом»: корона над 1-2-3 местом — цвет берёт CSS
         по классу m1/m2/m3, символ один и тот же (index.html i-crown). */
      (i<3?'<svg class="crownIc" viewBox="0 0 24 16"><use href="#i-crown"></use></svg>':'')+
      '</span>'+
      /* v1.282.20: экранирование вместо выкусывания. Раньше из чужого имени просто вырезались
         три символа — «Смит & Сын» терял амперсанд, а кавычки не трогались вовсе. escapeHtml
         из ядра сохраняет имя как есть и закрывает все пять опасных символов, включая кавычки. */
      '<span class="topNm">'+escapeHtml(r.name)+(r.provider&&r.provider!=='tg'?' <b class="pvTag">'+escapeHtml(r.provider)+'</b>':'')+'</span>'+
      '<span class="topSc">'+topFmt(r.best)+'</span>'+
      // v1.282.20: сервер отдаёт verified — рекорд объяснён паспортом забега, а не чтением хранилища
      (r.verified?'<span class="topVf" title="'+escapeHtml(L.topVerified||'')+'">'+ic('checkbadge')+'</span>':'')+
      /* 28.08.2026: было ограничено askCat==='gyro'||askCat==='touch' — владелец заметил, что
         у клавиатуры/bullet/дистанции нет ни призрака, ни «смотреть», хотя запись и сервер
         (GHOST_CATS в cosmogram-sync) поддерживают все пять категорий с v1.280.0 — кнопки
         просто забыли открыть тогда же. Ограничение снято, категория больше не проверяется. */
      (!r.me&&r.pid?'<button class="topGh" data-gh="'+(Math.floor(Number(r.pid))||0)+'" data-best="'+Math.floor(Number(r.best)||0)+'" title="'+L.ghostGo+'">'+ic('ghost')+'</button>':'')+
      /* v1.284.4: у рекорда появилась вторая дверь. Первая — «лететь рядом» (учиться манёврам),
         вторая — «смотреть» (увидеть полёт целиком, как трибуну чемпиона). До этой партии
         рекорд был числом в таблице: посмотреть его было нельзя ни одним способом. Страж 126. */
      (!r.me&&r.pid?'<button class="topWatch" data-wt="'+(Math.floor(Number(r.pid))||0)+'" title="'+L.topWatch+'">'+ic('play')+'</button>':'')+'</div>').join('');
  }).catch(()=>{ if(screenName==='ach' && topCat===askCat) list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; }); // 22.08.2026: сбой сети — честное сообщение вместо зависшего «Загрузка…»
}
/* ---------- Призрак из топа: скачать чужой трек и лететь рядом ----------
   Учимся тактике и манёврам рекордсмена + живая витрина скинов (его самолётик виден в полёте). */
let foreignGhost=null;
function ghostSetForeign(f){
  foreignGhost=(f && typeof f.track==='string')?{track:f.track, skin:Math.floor(Number(f.skin))||0,
    name:String(f.name||'').replace(/[<>&"']/g,'').slice(0,64),
    pid:Math.floor(Number(f.pid))||0, cat:String(f.cat||''), best:Math.floor(Number(f.best))||0,
    seed:(f.seed!=null && isFinite(Number(f.seed)))?Math.floor(Number(f.seed)):null}:null; // v1.280.0: сид едет с призраком, если сервер его знает
}
function ghostTakeForeign(){ const f=foreignGhost; foreignGhost=null; return f; } // разовый: съедается при старте
/* ---------- v1.284.4: «Смотреть этот полёт» — вторая дверь у чужого рекорда ----------
   Владелец сказал прямо: «есть рекорд, а посмотреть нельзя — это тупо». Так и было:
   единственный способ увидеть чужой полёт целиком вёл через Трибуну чемпиона, а она
   открывается только с итогов Трассы дня. Рекорд Классики оставался числом в таблице.

   Всё, что нужно, уже построено: лента едет через ghost_get, сид едет вместе с ней
   (v1.280.0), Театр умеет ставить на сцену чужой моток (champTrack, v1.100.1). Не было
   только двери.

   Главная тонкость, ради которой написан страж 126: ЛЕНТА НЕ СОДЕРЖИТ НЕБА. ghostStep
   кладёт её на ТЕКУЩУЮ трассу. Значит без сохранённого сида владельца мы показали бы его
   полёт над чужой расстановкой — он уворачивался бы от пустоты и врезался в воздух, а
   зритель решил бы, что рекордсмен жульничает. Поэтому дверь открывается только когда
   сервер знает сид, и честно отказывает, когда не знает.

   cx=true: лента пишется в долях ЭКРАНА (ghostRec: plane.x/W), а коридор чести — 390 мер
   по центру. На телефоне W=390 и это одно и то же, на широком экране — нет: без коридорной
   укладки чужой полёт ушёл бы за стены. Тот же приём, что у Трибуны чемпиона. */
wireOn('topList', 'click', e=>{
  const b=e.target.closest('.topWatch'); if(!b) return;
  const pid=Math.floor(Number(b.dataset.wt));
  if(!pid || typeof syncGhostGet!=='function' || b._busy) return;
  sfx.click(); haptic('light'); b._busy=1; b.textContent='…';
  const gen=runNow(), cat0=topCat; // то же поколение, что у соседней двери: медленный ответ не должен запускать игру задним числом
  syncGhostGet(pid, cat0).then(d=>{
    b._busy=0; b.innerHTML=ic('play');
    if(!runSame(gen) || screenName!=='ach') return; // зритель ушёл, пока летел ответ
    if(!d || !d.ok){ toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; }
    if(d.seed==null || !isFinite(Number(d.seed))){ // небо того полёта неизвестно — показывать нечего, и врать не будем
      toast(L.topWatchNoSky,'rgba(255,159,176,.5)'); haptic('error'); return; }
    const g=ghostParse(d.track);
    if(!g){ toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; }
    g.cx=true;
    champTrack=g; theaterDay=String(Math.floor(Number(d.seed))); theaterRecord=true;
    theaterChamp={ name:String(d.name||'').slice(0,64), skin:Math.floor(Number(d.skin))||0 };
    runMode='theater'; startGame();
  }).catch(()=>{ b._busy=0; b.innerHTML=ic('play'); });
});
wireOn('topList', 'click', e=>{
  const b=e.target.closest('.topGh'); if(!b) return;
  const pid=Math.floor(Number(b.dataset.gh));
  if(!pid || typeof syncGhostGet!=='function') return;
  sfx.click(); haptic('light'); b.textContent='…';
  const gen=runNow(), cat0=topCat; // v1.282.20: категорию тоже замораживаем — игрок мог переключить вкладку
  syncGhostGet(pid, cat0).then(d=>{
    /* v1.282.20: этот колбэк ЗАПУСКАЕТ игру. Медленный ответ (до 10с) перезапускал забег
       прямо посреди полёта: состояние стиралось без посадки, очки и лента уходили в никуда,
       а счётчик игр накручивался дважды. Сверяем поколение и экран. */
    if(!runSame(gen) || screenName!=='ach') return;
    // v1.103.0 «Тихий нуль»: знак результата рисуется ПОСЛЕ результата — неудача возвращает призрака, галочка не врёт
    if(!d || !d.ok){ b.innerHTML=ic('ghost'); toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; } // владелец скрыл трек
    b.innerHTML=ic('check');
    ghostSetForeign({track:d.track, skin:d.skin, name:d.name, pid:pid, cat:cat0, best:Math.floor(Number(b.dataset.best))||0, seed:d.seed});
    foreignFrom='top';
    toast(L.ghostWith(d.name||''),'rgba(191,232,255,.45)');
    startGame(); // призрак подхватится в ghostLoad — окно онбординга его не трогает
  }).catch(()=>{ if(runSame(gen) && screenName==='ach') b.innerHTML=ic('ghost'); }); // 22.08.2026: сбой сети — кнопка не виснет на «…» вечно
});

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
// v1.96.0 «Одна дверь»: кнопка «Поделиться» с итогов ушла — текстовая дверь живёт внутри карточки (cardShare, card.js).
// Особая вода своей трассы (mapShare) переехала туда же.
wireOn('duelBtn', 'click', ()=>{ // вызвать друга: deep-link, планку друг получит с сервера
  const pid=(typeof syncMyId==='function')?syncMyId():null;
  if(!pid){ toast(L.duelTgOnly,'rgba(255,159,176,.5)'); haptic('error'); return; } // вне мини-аппа нет верифицированной личности
  haptic('success'); sfx.click();
  const tgLink='https://t.me/realcosmogrambot/app?startapp=duel_'+pid;
  /* 30.08.2026 (владелец): раньше ссылка ВСЕГДА вела в Telegram — друга без Telegram звать
     было некуда. Веб-версия игры уже умеет Discord/Google (см. duelBoot — тот же приём,
     что forgeBoot уже делает для #map=), поэтому вне Telegram шарим ссылку на неё саму,
     не на t.me. */
  const webLink=location.origin+location.pathname+'#duel='+pid;
  const text=L.duelShareText(Math.floor(S.dist), S.mission);
  /* v1.282.20: счётчик двигаем ТОЛЬКО когда окно отправки реально открылось. Раньше он
     рос по самому нажатию, и достижение «Дуэлянт» (+10 ✦) бралось тапом с немедленным
     закрытием диалога — награда за ничего. */
  const sent=()=>{ Stats.duelsSent=(Stats.duelsSent||0)+1; saveStats(); if(typeof achCheck==='function') achCheck(); };
  if(tg&&tg.openTelegramLink){ // внутри Telegram — родной диалог остаётся первым, ссылка сразу открывает мини-апп
    const url='https://t.me/share/url?url='+encodeURIComponent(tgLink)+'&text='+encodeURIComponent(text);
    try{ tg.openTelegramLink(url); sent(); return; }catch(e){}
  }
  if(navigator.share){ // вне Telegram — системный лист ОС (любой мессенджер), ссылка ведёт на веб-версию
    navigator.share({text:text, url:webLink}).catch(()=>{});
    sent(); return;
  }
  const url='https://t.me/share/url?url='+encodeURIComponent(tgLink)+'&text='+encodeURIComponent(text);
  const w=window.open(url,'_blank'); if(w) sent();
});
wireOn('feedbackBtn', 'click', ()=>openFeedback('menu'));
wireOn('feedbackBackBtn', 'click', closeFeedback);
wireOn('feedbackSendBtn', 'click', feedbackSend);
wireOn('feedbackText', 'input', feedbackUpdateCount);

/* ---------- Локализация DOM ---------- */
function applyLang(){
  // v1.34.0 «Единая палуба»: иконки перед текстом убраны из всех окон — кнопки говорят текстом
  /* 13.08.2026: подписи pillGyro/pillTouch/pillDist/pillBullet больше некому раздавать —
     строка рекордов с главного экрана убрана. Сами ключи в словаре core.js оставлены:
     core.js — ядро, и вычищать из него пять языков ради четырёх мёртвых строк дороже,
     чем оставить. Записано в долги. */
  setText('startBtn',L.start);
  /* 13.08.2026: тексты «тесно» зависят от ориентации — их раздаёт tooNarrowText(),
     иначе смена языка возвращала бы совет «поверните экран» лежащему набок телефону. */
  if (typeof tooNarrowText==='function') tooNarrowText(window.innerWidth > window.innerHeight);
  setText('modesBtn',L.modes); modesFill(); // дисциплины (v1.42.0; v1.70.0: Пакт удалён)
  if (typeof forgeFill==='function') forgeFill(); // конструктор трассы — свой язык (v1.68.0)
  if (typeof ptFill==='function') ptFill(); // 01.09.2026: Партитура — своя лента, тот же вызов смены языка
  if (typeof cardFill==='function') cardFill(); // карточка для скриншота — свой язык (v1.73.0)
  if (typeof firstFlightFill==='function') firstFlightFill(); // 28.08.2026: «Первое воспоминание» — карточка на главном
  setText('finalScoreLabel',L.finalScoreLabel);
  setText('hangarBtn',L.hangar);
  setText('feedbackBtn',L.feedbackBtn);
  setText('duelBtn',L.duelBtn);
  setText('settingsBtn',L.settings);
  setText('homeBtn',L.home);
  setText('feedbackTitle',L.feedbackTitle);
  setText('feedbackHint',L.feedbackHint);
  setAttr('feedbackText','placeholder',L.feedbackPlaceholder);
  setText('feedbackSendBtn',L.feedbackSend);
  setText('feedbackAttachBtn',L.feedbackAttach);
  setText('pauseTitle',L.pause);
  setAttr('pauseBtn','aria-label',L.ariaPause); // v1.47.1: скринридер говорит на языке игрока — метка из словаря, не из разметки
  setText('resumeBtn',L.resume);
  setText('pauseSettingsBtn',L.settings);
  setText('settingsTitle',L.settingsTitle);
  setText('setCalibTxt',L.calib); // v1.103.0: текст отдельно от диода — локализация лампу не стирает
  setText('accOutBtn',L.accOut); // v1.51.0: вход в общую таблицу — на языке игрока
  if(screenName==='settings') accFill(); if(screenName==='over') webJoinFill(); // виджет монтируется лениво — только на открытом экране
  setText('restartBtn',L.restart);
  setText('pauseMenuBtn',L.menu);
  setText('hangarTitle',L.hangar);
  setText('brandSub',L.brandSub);          // 13.08.2026: обещание игры — на языке игрока
  setText('angarWalletLbl',L.walletYours); // 13.08.2026: подпись кошелька под кнопкой покупки
  if(typeof angarBuyFill==='function' && angarBuilt) angarBuyFill();
  setText('retryBtn',L.retry);
  setText('watchBtn',L.watchFlight);
  setText('tribuneBtn',L.tribune); // v1.100.1 «Трибуна чемпиона» — на языке игрока
  setText('goldChip',L.goldChip); // v1.100.2 «Золотая звезда дня» — на языке игрока
  setText('overDetailsBtn',L.overDetails);
  setText('statusBtn',L.statusStar); // v1.98.0 «Звезда-статус» — на языке игрока
  // заголовок «РАЗБИЛСЯ!» убран (v1.27.0): никто не разбивается — экран поражения добрый и компактный
  setText('menuBtn',L.menu);
  setText('scoreLbl',L.scoreLbl);
  setText('distCap',L.distLbl);
  setText('smoothCap',L.smoothLbl);
  setText('tiltBtn',L.tiltAllow);
  setText('gyroUnlockBtn',L.gyroUnlockBtn); refreshGyroLock(); // замок гироскопа: кнопка открытия — только пока заперт
  setText('achTitle',L.achTitle);
  setText('achBtnTxt',L.achTitle);
  setText('tabMine',L.mineTab); setText('tabTop',L.topTab);
  /* 04.09.2026 (владелец): вкладки категорий в «Топ» были без подписей — неясно, что означает
     каждая иконка. Переиспользую уже готовые ключи (те же слова, что у выбора управления и
     режимов — modeTouch/modeGyro/modeKeys/bullet/dist/modeDaily/modeSpeedrun), новых
     переводов не завожу. */
  const TOP_CAT_LBL={touch:L.modeTouch,gyro:L.modeGyro,keys:L.modeKeys,bullet:L.bullet,dist:L.dist,daily:L.modeDaily,speedrun:L.modeSpeedrun};
  document.querySelectorAll('.topCat').forEach(function(b){
    const lbl=b.querySelector('.topCatLbl'); if(lbl) lbl.textContent=TOP_CAT_LBL[b.dataset.cat]||'';
  });
  setText('diagBtn',L.diagBtn);
  setText('diagTitle',L.diagBtn); // v1.66.3: экран сервисного центра; 28.08.2026: diagBackBtn — круглая иконка, текст не пишем
  setText('csCap',L.csCap); // v1.66.3: подпись позывного в «Профиле»
  setText('diagMoreBtn',L.moreLbl); // 13.08.2026: спойлер «Ещё» — тот же ярлык, что в настройках
  gyroRowLabel(); sensLabel(); soundLabel(); musicLabel(); langLabel(); vibroLabel(); gfxLabel(); btLabel(); gyroStatus(); morseLabel(); morseHapLabel(); csFill(); setWellFill(); // v1.284.20: тумблер гироскопа рисуется первым — он гасит соседние строки, значит обязан отработать до них
  const grpT=(id,t)=>{ const e=$(id); if(e){ const s=e.querySelector('.setGrpT'); if(s) s.textContent=t; } }; // v1.91.0: заголовок живёт в .setGrpT — рядом шёпот самочувствия
  grpT('setGrpSound',L.setGrpSound); grpT('setGrpGame',L.setGrpGame); // v1.63.0: две группы вместо четырёх
  grpT('setGrpProf',L.setGrpProf); // v1.64.0: карточка «Профиль»
  [['setSoundBtn','setSound'],['setMusicBtn','setMusic'],['setVibroBtn','setVibro'],['setMorseBtn','setMorse'],
   ['setMorseHapBtn','setMorseHap'],['setGyroBtn','setGyroRow'],['setSensBtn','sens'],['setGfxBtn','setGfx'],['setBtBtn','setBt'],['setContrastBtn','setContrast'],
   ['setColorblindBtn','setColorblind'],['setLangBtn','setLang'],
   ['setAgainBtn','again'],['setGyroOffBtn','setGyroOff'],['setBeaconBtn','setBeacon']].forEach(p=>{ const b=$(p[0]); if(b) b.querySelector('.setK').textContent=L[p[1]]; });
  setText('diagVibroBtn',L.diagVibro);
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
  // 29.08.2026 «2 бесплатных вместо Избранного»: id 1,2 из ANGAR_FREEBIE домешиваются в
  // ownedX явным union — не только через дефолт Store.get (тот сработал бы лишь для
  // игрока без вообще сохранённого массива, а не для уже игравших без этих двух id).
  S.ownedDecals = Array.from(new Set(saneArray(Store.get('ownedDecals',[0]),[0]).concat(ANGAR_FREEBIE.decal)));
  S.decal = saneNumber(Store.get('decal',0),0);
  S.ownedIcons = Array.from(new Set(saneArray(Store.get('ownedIcons',[0]),[0]).concat(ANGAR_FREEBIE.icon)));
  S.icon = saneNumber(Store.get('icon',0),0);
  S.ownedLaunchFx = Array.from(new Set(saneArray(Store.get('ownedLaunchFx',[0]),[0]).concat(ANGAR_FREEBIE.flash)));
  S.launchFx = saneNumber(Store.get('launchFx',0),0); // 29.08.2026: было S.flash/Store-ключ 'flash' — переименовано, см. game.js
  Stats = Object.assign(Stats, Store.get('stats',{})||{}); // миграция: старые сейвы без новых полей дополняются дефолтами
  // чувствительность гироскопа (персист) — только известные ступени
  const sv=saneNumber(Store.get('sens',1),1);
  input.sens = SENS_STEPS.includes(sv)?sv:1;
  // Input Fallback System: iOS — красивая кнопка разрешения наклона (только если
  // нет родного моста Telegram: там системное разрешение не нужно вовсе);
  // устройство без датчика — гиро-кнопки не показываем вовсе
  if(NEEDS_TILT_PERMISSION && !TG_ORIENT) $('tiltBtn').classList.remove('hidden');
  gyroStatus(); // диагностика датчика в настройках: Telegram / браузер / молчит
  if(!HAS_GYRO){ $('setCalibBtn').classList.add('hidden'); $('setSensBtn').classList.add('hidden'); $('setGyroBtn').classList.add('hidden'); } // v1.284.20: нет датчика — нечего и выключать
  // настройки: звук, вибро, графика, язык из хранилища
  MUTED = Store.get('muted',0)===1;
  VIBRO = Store.get('vibro',1)!==0;
  CONTRAST = Store.get('contrast',0)===1; COLORBLIND = Store.get('colorblind',0)===1; canvasFilterSync(); // v1.280.0
  // Скоростные полосы полностью вырезаны: чтение флага хранилища удалено, чтобы не
  // восстанавливать отключённый эффект при старом сохранённом значении.
  MUSIC_ON = Store.get('music',1)!==0; // музыка — отдельная настройка от звуков
  if (typeof achQShow==='function') achQShow(); // карман наград: бейдж «ждут N» на кнопке 🏆
  // сторож звука: каждый тап — шанс разбудить; фоновая самопроверка — только когда вкладка видима.
  document.addEventListener('pointerdown', audioKeep);
  /* 27.08.2026 «Звук через раз» (владелец, жалоба + реальная телеметрия: audio_stall_recover,
     audio_never_resumed, audio_resume_fail — Android и iOS, разные версии): у сторожа выше
     был только pointerdown — каждое касание экрана давало resume() шанс сработать ВНУТРИ
     настоящего жеста браузера (единственный надёжный момент, см. core.js:451 — «resume вне
     жеста отклоняется»). Игрок на клавиатуре (input.js: ArrowLeft/Right, A/D) жмёт клавиши
     весь забег, ни разу не касаясь экрана — но НИ ОДИН keydown-обработчик в игре не звал
     audioKeep(). Единственный шанс разбудить звук у него — один клик «Играть» в самом
     начале; если именно та попытка сорвётся (гонка, звонок, что угодно из уже описанного
     в core.js) — второго шанса не было до конца забега, только ненадёжный 6-секундный
     таймер. Теперь у клавиатуры симметрично тот же сторож, что у касания — каждое
     нажатие тоже шанс. input.js (ядро) не трогаем — свой независимый слушатель здесь. */
  document.addEventListener('keydown', audioKeep);
  /* 27.08.2026 «Звук через раз», часть 2 (владелец подтвердил в чате: играет пальцем,
     держит касание ОДНИМ долгим нажатием весь забег, не отрывая; платформа — Android
     через Telegram). У touchstart тот же дефицит, что был у клавиатуры до правки выше:
     ОДИН шанс разбудить звук в начале забега, дальше пока палец держат — ни одной новой
     попытки, только ненадёжный 6-секундный таймер (audioKeepStart). touchmove стреляет
     непрерывно, пока палец на экране и двигается, — добавочный источник попыток. Не
     чаще раза в секунду (иначе сотни лишних вызовов в секунду при обычном свайпе).
     Это защитная мера, не гарантия: остаётся открытым вопрос, считает ли конкретный
     Android WebView touchmove «жестом» для resume() так же надёжно, как touchstart —
     подтверждать нужно на реальном устройстве владельца, не по чтению кода. */
  let _touchKeepAt=0;
  document.addEventListener('touchmove', ()=>{
    const t=Date.now();
    if(t-_touchKeepAt<1000) return;
    _touchKeepAt=t;
    audioKeep();
  }, {passive:true});
  audioKeepStart();
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
  /* v1.282.13: «обратно» — только если игре есть куда возвращаться. Этот слушатель
     висит на том же событии, что и onHidden/onShown выше по файлу, и срабатывает
     последним, поэтому его слово было решающим: он снимал приглушение даже когда
     pauseGame() только что его поставил. Игрок разворачивал приложение и слышал
     музыку с двигателем в полный голос на экране паузы. Пауза учитывается и в
     переходном состоянии (S.pausing) — «Склейка» ещё вплывает, а звук уже громкий. */
  document.addEventListener('visibilitychange', ()=>{
    const quiet = document.hidden || !!(S.running && (S.paused || S.pausing));
    music.duck(quiet);
    engine.duck(quiet);
  });
  const gm=Store.get('gfx','auto'); Q.mode = (gm==='low'||gm==='med'||gm==='high')?gm:(gm==='ultra'&&gfxUltraOk()?'ultra':'auto'); // v1.35.0: «Средняя» и «Ультра» (у флагмана) восстанавливаются как ручные
  // v1.282.11: восстановление Q.level ПЕРЕД gfxCap() — раньше было наоборот. Пока gfxCap() не различала
  // уровни 0/1/2 (кроме особого случая 3), порядок был не важен. Но v1.282.3 сделала gfxCap()
  // чувствительной именно к Q.level — и «дефолт 2 из объявления, восстановление позже» стало
  // означать: игрок с уже выученным слабым уровнем на КАЖДОЙ загрузке стартовал бы с раздутым
  // разрешением, пока авто-качество заново его не понизит — заикание на каждом запуске подряд,
  // не один раз. Регрессия моей же вчерашней правки, найдена сегодня же.
  if (Q.mode==='auto'){ Q.level = Store.get('gfxLv', gfxTier()>=2?3:1);
    Q._ceil = saneNumber(Store.get('gfxCeil',-1),-1); } // v1.284.22: потолок-памятка поднимается вместе с уровнем — иначе игра каждый запуск заново штурмует то, что уже не потянула // v1.7.0/v1.12.0: выученный уровень; флагману — сразу «Ультра», просадка сама отучит
  gfxCap(); resize(); // применяем сохранённый режим к резолюции (в т.ч. HD на флагманах) — теперь с верным Q.level уже на месте
  dispProbe(); // паспорт экрана: герцовка и охват — авто-качество считает по-честному
  if (typeof BEACON!=='undefined' && BEACON.webcodecsProbe) BEACON.webcodecsProbe(); // v1.473.0: зонд «Кино полёта» — только спрашивает, ничего не строит
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
    if (hb){
      hb.addEventListener('click', ()=>{ try{ tg.addToHomeScreen(); }catch(e){} });
      try{ tg.checkHomeScreenStatus(st=>{ if(st!=='added'){ hb.classList.remove('hidden'); gridBalance($('menuRow')); } }); }
      catch(e){ hb.classList.remove('hidden'); gridBalance($('menuRow')); }
    } else if (typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', 'homeBtn'); }
  }
  applyLang();
  refreshMenu();
  // v1.16.0 «Интуиция»: школа и учебный полёт вычеркнуты — первый запуск тоже сразу в небо; единственный урок — «Полёт без рук» (js/gyro.js)
  Store.del('seenIntro'); Store.del('tutDone'); Store.del('lesson'); Store.del('lsnPass'); Store.del('lsnV'); // гигиена: ключи школы больше не нужны
  Store.del('tutVoice'); // гигиена: голос вычеркнут (v1.20.0)
  const mapPending = (typeof forgeBoot==='function') ? forgeBoot() : false; // трасса друга по ссылке (v1.68.0)
  const duelPending = !mapPending && (typeof duelBoot==='function') ? duelBoot() : false; // дуэль по ссылке: планка с сервера, баннер живёт в меню
  /* Здесь стояла отправка «Opened Game» в Amplitude с полем platform: telegram / telegram_web /
     discord / guest. Канал убран (см. index.html), но САМА мысль верная и ещё пригодится:
     это единственное место, где игра различает вошедшего и гостя. Когда дойдём до партии
     «Гость виден», отличать его надо здесь, а слать — в свою базу, не наружу. */
  if (S.running){ /* v1.100.4: взлёт случился однажды — поздний ответ облака (сторож Store.init) не перезапускает небо посреди полёта */ }
  else if (mapPending){ setScreen('forge'); forgeOpen(); toast(L.forgeGuest,'rgba(255,215,106,.5)'); } // ссылка с трассой — сразу в конструктор; v1.282.14: сначала экран, потом наполнение (см. страж forgeSkyKick)
  else if (duelPending) setScreen('menu'); // v1.6.0: вызов — единственное исключение с меню при загрузке
  else bootFly(); // v1.6.0 «Сразу в полёт»: нажал «Открыть» — и уже летишь
  if (typeof syncFlush==='function') syncFlush(); // доотправка очереди с прошлых сессий
});
applyLang();
plane.x=W/2; plane.y=(typeof fieldT==='function'?fieldT()+fieldH()*.72:H*.72);
startLoop();

/* v1.108.1 «Клавиатура и пульт»: div role="button" по умолчанию не получает фокус
   клавиатурой/пультом — только настоящий <button>. Один общий страж вместо ручной
   правки каждого места: даёт фокус и Enter/Space-активацию всем таким кнопкам разом,
   включая те, что появятся позже. ТВ-пульт и клавиатура получают доступ туда же,
   куда уже дотягивается мышь и тач. */
/* v1.284.21 «Тап не должен пропадать» (партия 48).
   Замер прибором tests/palcem.mjs по одиннадцати строкам настроек, настоящими тач-событиями:
       аккуратно 10/10 · снос 6 px 10/10 · снос 20 px  0/10  на КАЖДОЙ строке.
   И отдельно померено главное: из 44 промахов **прокрутка не объясняет ни одного** — экран
   не двигался, строка оставалась под пальцем, а нажатие пропадало. Браузер отменяет клик,
   как только палец ушёл дальше своего порога, и ему всё равно, было ли куда прокручивать.
   Наши списки почти всегда влезают в экран целиком, значит снос пальца не давал ничего
   и отнимал нажатие. Отсюда и жалоба владельца «тумблеры срабатывают через раз», висевшая
   непроверенной полтора месяца: стенд жмёт кнопки методом el.click() и этой беды не видит
   по построению.

   Лекарство: тап распознаём сами. Условия все четыре, и каждое отсекает свой ложный случай:
     · палец начался и кончился на одной кнопке   — иначе это «промахнулся и увёл»;
     · снос меньше SNOS_MAX                        — иначе это уверенный свайп;
     · не дольше TAP_MAX                           — иначе это удержание, а не тап;
     · прокрутка не сдвинулась                     — иначе палец ЛИСТАЛ, и нажатия не было.
   Последнее условие — главное. Без него мы бы начали нажимать кнопки под пальцем листающего,
   а это хуже пропавшего нажатия: игрок получал бы то, чего не просил.

   И вторая половина, без которой лекарство опаснее болезни: браузер на малом сносе выдаёт
   СВОЙ клик. Сложившись с нашим, он даёт двойное срабатывание, а на тумблере двойное
   срабатывание неотличимо от «не сработало» — вернулось на место. Поэтому после своего
   нажатия мы съедаем один родной клик в течение TAP_ECHO мс, на фазе перехвата.
   Порог браузера мы намеренно НЕ угадываем: он разный на разных платформах, а угаданное
   число здесь означало бы либо дыру, либо двойное нажатие. Страж 148 сторожит все три края. */
(function tapNaKnopku(){
  const SNOS_MAX = 40, TAP_MAX = 600, TAP_ECHO = 400;
  let x0=0, y0=0, t0=0, cel=null, prok0=0, svoyoDo=0, ehoCel=null;
  function knopka(el){ return el && el.closest ? el.closest('[role="button"],button') : null; }
  /* Суммарное положение всех прокручиваемых предков: если поехало хоть что-то — палец листал.
     Считаем по предкам, а не по всей странице: чужая прокрутка в другом углу нас не касается. */
  function prokrutka(el){
    let s = (window.scrollY||0);
    for(let n=el; n && n!==document.body; n=n.parentElement){ if(n.scrollTop) s += n.scrollTop; }
    return s;
  }
  document.addEventListener('touchstart', e=>{
    const t=e.changedTouches && e.changedTouches[0]; if(!t) return;
    cel = knopka(t.target);
    if(!cel) return;
    x0=t.clientX; y0=t.clientY; t0=performance.now(); prok0=prokrutka(cel);
  }, {passive:true, capture:true});
  document.addEventListener('touchend', e=>{
    const el=cel; cel=null;
    if(!el) return;
    const t=e.changedTouches && e.changedTouches[0]; if(!t) return;
    if(knopka(t.target)!==el) return;                         // отпустил не на той же кнопке
    if(performance.now()-t0 > TAP_MAX) return;                // это удержание
    const snos=Math.hypot(t.clientX-x0, t.clientY-y0);
    if(snos > SNOS_MAX) return;                               // это свайп
    if(snos < 1) return;                                      // без сноса браузер и сам справится
    if(prokrutka(el) !== prok0) return;                       // экран поехал — палец листал
    svoyoDo = performance.now() + TAP_ECHO; ehoCel = el;
    /* Своё нажатие шлём событием, а НЕ через el.click(). Первая редакция подменяла
       HTMLElement.prototype.click ради метки «своё» — глобальная правка прототипа в живой
       игре ради одной строки, под неё попадал бы каждый вызов click() в проекте и в мосте. */
    el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
  }, {passive:true, capture:true});
  /* Эхо браузера — родной клик, который придёт следом за нашим на том же месте. Съедаем его
     на фазе перехвата: иначе тумблер переключится дважды и вернётся на место, а двойное
     срабатывание на тумблере неотличимо от «не сработало».
     Отличаем эхо по ДОВЕРЕННОСТИ, а не по времени. Первая редакция глушила любой клик в окне
     700 мс — и съедала заодно следующий честный тык игрока и программные нажатия (так ходит
     клавиатурный Enter и сама игра). Стенд этого не увидел: он проверял одно нажатие на чистом
     состоянии. Нашёл прибор «Пальцем по кнопкам» — уже на зелёном страже.
     e.isTrusted различает их точно: эхо порождено браузером и доверенное, всякое нажатие
     из кода — нет. Плюс окно короче и привязано к той же кнопке. */
  document.addEventListener('click', e=>{
    if(!e.isTrusted) return;                       // из кода — не эхо, пропускаем всегда
    if(performance.now() >= svoyoDo) return;
    if(ehoCel && e.target !== ehoCel && !(ehoCel.contains && ehoCel.contains(e.target))) return; // эхо приходит на ту же кнопку
    svoyoDo = 0; ehoCel = null;
    e.stopPropagation(); e.preventDefault();
  }, true);
})();

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

/* v1.282.14 «Маяк взлёта». Последняя исполняемая строка последнего скрипта игры.
   Проверка «поднялись ли мы» в index.html опирается именно на неё: косвенные признаки
   для этого негодны — const в мёртвой зоне бросает ReferenceError вместо 'undefined',
   а объявление функции поднимается даже из упавшего файла. Здесь же признак прямой:
   если управление дошло сюда, значит все скрипты исполнились до конца. */
window.__gameUp = 1;
