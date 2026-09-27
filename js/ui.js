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
  // 11.09.2026 (владелец, живое устройство): «✕» окна «явления» гасится там, где есть родная
  // «Назад» Telegram (см. .ghost у #angarPvZoomClose) — значит родная «Назад» обязана сама
  // закрывать именно это окно первой, раньше обычного перехода по экрану. Проверка — первой
  // строкой, до screenName: модалка лежит ПОВЕРХ экрана «ангар», не является отдельным screenName.
  const zoomModal=$('angarPvZoomModal');
  if(zoomModal && zoomModal.classList.contains('open')){ angarPvZoomClose(); return; }
  if(screenName==='game') pauseGame();
  else if(screenName==='pause') resumeGame();
  else if(screenName==='hangar') toMenu();
  else if(screenName==='ach') closeAch();
  else if(screenName==='settings') closeSettings();
  else if(screenName==='diag') setScreen('settings'); // v1.66.3: сервисный центр — назад в настройки
  else if(screenName==='forge') setScreen('menu'); // 08.09.2026 (владелец, живой баг): было setScreen('modes') с v1.68.0, когда Конструктор открывался только изнутри Соревнований; вход переехал на главное меню 05.09.2026 (см. js/forge.js:1011, та же правка для кнопки forgeBack), а эту нативную/аппаратную ветку тогда забыли — тот же класс бага, что уже трижды чинили в этой же функции сегодня (modes/modesTop/relayMine)
  else if(screenName==='relayMine') setScreen('menu'); // 15.09.2026: было setScreen('modes') — экран-посредник удалён, «Статус» эстафеты теперь открывается с карточки на главном
  else if(screenName==='card') setScreen('over'); // v1.73.0: карточка — назад к итогам забега
  else if(screenName==='over') toMenu();
  else if(screenName==='feedback') closeFeedback(); // 02.09.2026: владелец, живое устройство — нативная «Назад» на этом экране молчала, ветки не было вовсе
  else if(screenName==='equality') toMenu(); // 15.09.2026: тот же пропуск, что у feedback выше — «Равноправие»/«Благодарность» появились в setScreen(), сюда добавить забыли
  else if(screenName==='gratitude') toMenu();
  else if(screenName==='flightGallery') toMenu(); // 17.09.2026 (владелец, ревизия по памяти о повторяющемся баге): тот же пропуск в четвёртый раз — экран добавлен 16.09.2026 в setScreen(), сюда (нативная/аппаратная «Назад» Telegram) добавить забыли; круглая кнопка flightGalleryBackBtn работала, эта ветка — нет
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
  // 27.09.2026 (владелец, живой hwshot-скриншот телефона): в Telegram Fullscreen-режиме
  // нативная «Назад» физически НЕ рисуется в шапке (только «Закрыть»), даже когда
  // tg.BackButton.isVisible держит true — это свойство отражает то, что игра сама попросила
  // у моста, не то, что мост реально отрисовал. Раньше nativeBack не проверял isFullscreen —
  // свои кнопки «Назад» гасли именно тогда, когда родной альтернативы не видно, оставляя
  // игрока с одной «Закрыть» (закрыть игру целиком) и без единого пути назад по экранам.
  const nativeBack=!!(tg && tg.BackButton && tgv('6.1') && !tg.isFullscreen);
  toggleCls('pauseBtn','ghost', nativeBack);
  // firstFlightClose исключён: плеер открывается поверх текущего экрана (galleryCardOpen() в
  // js/cinema.js не зовёт setScreen()) — если это меню, родная «Назад» Telegram там всегда
  // скрыта (setBack(name!=='menu')). Это «Закрыть» плеера, не «Назад» экрана, заменить её
  // в этот момент нечем. 16.09.2026: было firstFlightOpen() — функция убрана вместе со старой
  // широкой карточкой, комментарий обновлён под новое имя (см. «Галерея видео-рекордов»).
  // 16.09.2026: #ffDelBtn — тот же .menuBack-материал (кольцо-«крылья»), но это «Удалить», не
  // «Назад» — исключён по той же причине, что и «Закрыть», иначе родная кнопка Telegram гасила бы
  // единственный способ удалить «Первый полёт».
  document.querySelectorAll('.menuBack:not(#firstFlightClose):not(#ffDelBtn)').forEach(function(el){ el.classList.toggle('ghost', nativeBack); });
  // 11.09.2026: тот же приём для «✕» окна «явления» — не .menuBack (свой стиль, без обруча,
  // владелец 10.09.2026), но та же логика «родная Назад есть — своя дверь гаснет».
  toggleCls('angarPvZoomClose','ghost', nativeBack);
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
  toggleCls('equalityScreen','hidden', name!=='equality'); // 15.09.2026: «Равноправие» — текст Хартии
  toggleCls('gratitudeScreen','hidden', name!=='gratitude'); // 15.09.2026: «Благодарность» — заглушка «Скоро»
  toggleCls('flightGalleryScreen','hidden', name!=='flightGallery'); // 16.09.2026: «Галерея видео-рекордов»
  toggleCls('relayMineScreen','hidden', name!=='relayMine'); // 07.09.2026: «Мои эстафеты» — единственный способ узнать судьбу этапа после сдачи
  toggleCls('forgeScreen','hidden', name!=='forge'); // v1.68.0: конструктор трассы; 06.09.2026: Мастерская внутри, своего экрана 'workshop' больше нет
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
  // 15.09.2026: экран «Топ соревнований» (modesTop, двухсловный заголовок, упирался в кнопку
  // «Назад» — прежний фикс жил здесь) удалён целиком, вместе с ним и этот особый случай.
  /* 15.09.2026 (владелец, живой Oppo, «криво»/«выше кнопок»): настоящая причина сдвига заголовка —
     не формула центра и не шрифт, а гонка со входной CSS-анимацией экрана. #startScreen/#pauseScreen/
     #settingsScreen/#gameOverScreen/#hangarScreen/#achScreen открываются через @keyframes scrIn
     (translateY(12px)→none, 300мс, index.html) — а центрирование раньше запускалось через
     requestAnimationFrame сразу после setScreen(), то есть на первом кадре этой анимации, пока сам
     экран ещё едет вверх на 12px: формула считала верно, но от ВРЕМЕННО смещённой опорной точки.
     Первая попытка чинить (второй, поправочный расчёт на 'animationend') сама стала новой бедой —
     владелец, живьём: «дёргается и бесит», «название чуть выше, потом в своё место» — два разных
     margin подряд, между ними самый настоящий видимый прыжок. Правильный приём — не считать дважды,
     а на миг СНЯТЬ саму CSS-анимацию (scr.style.animation='none'), замерить устоявшуюся геометрию
     (тот же getBoundingClientRect, но без transform:translateY(12px) поверх него), посчитать margin
     ОДИН раз верно и тут же вернуть анимацию обратно — заголовок с самого начала уже на своём месте,
     едет вместе со всем экраном единым блоком, прыжка нет вообще. Работает и на экранах без scrIn
     (диагностика/поддержка/карточка/эстафета/Конструктор) — там animation изначально 'none', снимать
     нечего, код просто измеряет как раньше. */
  retitleScreen(name);
}
/* 16.09.2026 (владелец, живой скрин: «кнопка заходит за нашу область запаса», Конструктор,
   «Играть»/«Создать» наехали на заголовок) — вынесено из setScreen() в свою функцию: раньше
   заголовок центрировался (centerTitleOnHeader) ТОЛЬКО в момент входа на экран, одним разом.
   --sat-menu (index.html) — «правда» Telegram о вырезе/шапке — часто приходит НЕ сразу
   (см. tgInsetsSync, js/core.js: «поздняя правда Telegram приходит через тишину»), уже ПОСЛЕ
   входа на экран. Всё, что читает --sat-menu через CSS (padding-top экрана, «Назад», сама
   вкладка «Играть»/«Создать» — обычный поток внутри .scrBody) пересчитывается само, браузер
   это делает бесплатно. Заголовок — единственный, кто считает своё место ЖИВЬЁМ через JS
   (centerTitleOnHeader/shrinkScreenTitle) один раз на входе — если правда о вырезе доехала
   позже, весь экран корректно уехал вниз под НОВЫЙ --sat-menu, а заголовок остался на месте,
   посчитанном под старое (обычно меньшее) значение — отсюда и наезд. tgInsetsSync теперь тоже
   зовёt retitleScreen(screenName) после каждого обновления --sat-menu, тем же приёмом, что уже
   есть у syncScoreHudGap() (полёт) — просто то же самое для заголовков меню-экранов. Гипотеза,
   не подтверждённая на живом устройстве владельца (здесь нет моста Telegram, который присылает
   safeAreaChanged с задержкой) — код при этом совершенно точно НЕ перевызывал центрирование при
   такой задержке, это не «похоже на причину», это реальный пропуск вызова. */
function retitleScreen(name){
  const stid=SCREEN_TITLE_ID[name];
  if(!stid) return;
  const t=$(stid);
  const scr=$(name+'Screen');
  const prevAnim = scr ? scr.style.animation : null;
  if(scr) scr.style.animation='none'; // на миг — только чтобы замерить устоявшуюся геометрию
  shrinkScreenTitle(t);
  centerTitleOnHeader(t);
  // 22.09.2026: «Создать» подменяет обычный #forgeTitle своим #forgeStepTitle (Карта/Небо/
  // Сохранить) — та же поздняя правда Telegram, что выше пересчитала forgeTitle, должна
  // долетать и до него, когда он реально на экране (forgeTitle тогда спрятан forgeStepEnter).
  if(name==='forge' && t && t.classList.contains('hidden') && typeof forgeStepRetitle==='function') forgeStepRetitle();
  if(scr) scr.style.animation = prevAnim || ''; // возвращаем — экран (и уже верно стоящий заголовок) анимируется как обычно
}
/* 14.09.2026 (владелец, живые телефоны): задача — заголовок помещается МЕЖДУ кнопками родной
   шапки Telegram («Назад»/крестик слева, chevron+три точки справа), в одной с ними строке И
   по центру их высоты, а не просто где-то в той же строке. Родная шапка — отдельный слой поверх
   WebView, игра не измеряет её напрямую (см. RESEARCH-2026-09-SAFE-AREA-AUTODETECT.md), но её
   ВЫСОТУ игра уже знает живьём — это и есть contentSafeAreaInset.top (46px на всех трёх
   проверенных телефонах владельца, число самого Telegram, не догадка). Раньше здесь стоял
   фиксированный --menu-buf, подобранный на глаз на одном устройстве — владелец справедливо
   указал, что это противоречит всей задаче автонастройки (после того, как формула --sat-menu
   уже однажды была так же на глаз откалибрована и сломалась при пересчёте). Вместо этого центр
   заголовка теперь СЧИТАЕТСЯ на каждом реальном устройстве из двух живых чисел: высоты шапки
   Telegram (notch+contentSafeAreaInset/2) и собственной высоты заголовка (getBoundingClientRect
   после подгонки шрифта) — никакого числа руками, ни здесь, ни на другом телефоне.
   28% ширины экрана с каждой стороны (авто-сжатие ниже) — тоже не догадка, измерено по 7 живым
   скриншотам владельца в разных языках Telegram (Назад/Tillbaka/Indietro/Tilbake/بازگشت/
   Kembali/Back — самые широкие пилюли «Tillbaka»/«Indietro» укладывались в этот запас). */
const SCREEN_TITLE_ID={pause:'pauseTitle',settings:'settingsTitle',diag:'diagTitle',
  feedback:'feedbackTitle',hangar:'hangarTitle', // 15.09.2026: 'modes' убран — экран «Турниры» удалён
  ach:'achTitle',relayMine:'relayMineTitle',card:'cardTitle',forge:'forgeTitle',
  equality:'equalityTitle',gratitude:'gratitudeTitle',flightGallery:'flightGalleryTitle'}; // 15.09.2026: см. UNIFORM_TITLE_IDS ниже — оба НЕ в общем наборе, каждый считает свой минимум сам; 16.09.2026: галерея видео-рекордов добавлена тем же приёмом
  /* 15.09.2026 (владелец: «и конструктор чтобы он поместился между кнопок по размеру текста, в
     один ряд с ними поставь»): 'forge' раньше сюда не входил — старый одиночный shrinkScreenTitle()
     сажал «КОНСТРУКТОР» на пол 24px и он всё равно не влезал в 28%-зону (владелец: «стало тупо»),
     поэтому экран держал свой отдельный текст-под-шапкой без центрирования. Теперь, когда пятёрка
     меню-заголовков делит один общий кегль (см. UNIFORM_TITLE_IDS ниже), проверено живьём:
     «Конструктор» (173px) и «Достижения» (171px, уже входит в общий набор и уже подтверждена
     живьём хорошо смотрится) на полу 24px превышают номинальную 158px зону практически одинаково —
     это тот же, уже принятый класс, не новая проблема. #forgeScreen получает тот же общий
     padding-top через `.overlay:has(.menuBack)` (index.html), что и остальные — geometрия
     совпадает без отдельной формулы. */
/* 15.09.2026 (владелец, живой Oppo, «одного размера с другим текстом, как было ранее» → «сделай
   текст одного размера во всех меню»): у каждого заголовка независимый shrinkScreenTitle() — при
   разной длине слова на одном узком экране получались РАЗНЫЕ итоговые кегли (проверено живьём:
   «Настройки»/«КОЛЛЕКЦИЯ» садились на 25px, «Достижения»/«Статус» оставались крупнее). Кегль
   теперь один общий на ВСЕ статичные меню-заголовки (заранее известный текст, не зависящий от
   данных игрока) — минимум, требуемый самым широким словом набора («Достижения» — самое длинное,
   тянет всех на пол 24px), измеренный на офскрин-пробнике тем же самым алгоритмом (ниже), а не
   подобранный на глаз. «Отладка»/«Поддержка» присоединились 15.09.2026, когда оба слова стали
   короче исходных «Диагностика»/«Написать разработчику» и перестали требовать переноса.
   «Конструктор» присоединился следом (см. комментарий у SCREEN_TITLE_ID выше) — тот же общий
   кегль, тот же класс небольшого превышения 28%-зоны, что уже принят у «Достижения». Только
   карточка (cardTitle, текст произвольной длины — имя явления/скина игрока) намеренно снаружи —
   утащила бы общий кегль вниз без всякой пользы. */
const UNIFORM_TITLE_IDS={pauseTitle:1,settingsTitle:1,hangarTitle:1,achTitle:1,relayMineTitle:1,diagTitle:1,feedbackTitle:1,forgeTitle:1};
let _uniformTitleSize=null, _uniformTitleSizeW=0;
function resetUniformTitleSize(){ _uniformTitleSize=null; } // applyLang() зовёт при смене языка — тексты набора другие
function uniformMenuTitleSize(){
  const w=window.innerWidth;
  if(_uniformTitleSize!=null && _uniformTitleSizeW===w) return _uniformTitleSize;
  let probe=document.getElementById('__titleSizeProbe');
  if(!probe){
    probe=document.createElement('div');
    probe.id='__titleSizeProbe'; probe.className='screenTitle';
    probe.style.cssText='position:fixed;left:-9999px;top:0;visibility:hidden;';
    document.body.appendChild(probe);
  }
  const texts=[L.pause,L.settingsTitle,L.hangar,L.achTitle,L.relayMineTitle,L.diagBtn,L.feedbackTitle,L.forgeTitle];
  let min=Infinity;
  texts.forEach(function(txt){
    if(!txt) return;
    probe.textContent=txt;
    shrinkScreenTitle(probe); // тот же алгоритм ниже, на пробнике не в UNIFORM_TITLE_IDS — считает независимо
    const size=parseFloat(getComputedStyle(probe).fontSize);
    if(size<min) min=size;
  });
  _uniformTitleSize=(min===Infinity?null:min);
  _uniformTitleSizeW=w;
  return _uniformTitleSize;
}
function shrinkScreenTitle(el){
  if(!el) return;
  el.style.fontSize=''; el.style.whiteSpace='nowrap';
  if(UNIFORM_TITLE_IDS[el.id]){
    const uni=uniformMenuTitleSize();
    if(uni!=null){ el.style.fontSize=uni+'px'; return; }
  }
  const SAFE=0.28, floor=24;
  const avail=window.innerWidth*(1-SAFE*2);
  /* 16.09.2026 (живой Performance-трейс, соседняя сессия — ForcedReflow): было до 40 пар
     read(scrollWidth)→write(fontSize) подряд, size-- на каждом шаге. scrollWidth монотонно
     убывает с уменьшением шрифта — тот же самый итоговый размер (наибольший, что влезает)
     находится бинарным поиском по числу шагов уменьшения k∈[1,maxK], без изменения самой
     логики (тот же floor, тот же guard-предел maxK=min(40, size0-floor), тот же финальный
     whitespace-перенос, если не влезло даже на floor). Страж 224. */
  const size0=parseFloat(getComputedStyle(el).fontSize);
  const maxK=Math.min(40, Math.floor(size0-floor));
  if(maxK>0 && el.scrollWidth>avail){
    let lo=1, hi=maxK, best=maxK;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      el.style.fontSize=(size0-mid)+'px';
      if(el.scrollWidth<=avail){ best=mid; hi=mid-1; } else { lo=mid+1; }
    }
    el.style.fontSize=(size0-best)+'px';
  }
  if(el.scrollWidth>avail) el.style.whiteSpace=''; // не влезло даже на полу — перенос на 2 строки вместо нечитаемого шрифта
}
function centerTitleOnHeader(el){
  if(!el) return;
  el.style.marginTop=''; // сброс перед новым замером — на резюме/смене языка высота могла измениться
  const t=(typeof tgApp==='function')?tgApp():null;
  if(!t || !t.isFullscreen) return; // не fullscreen — родной шапки в этом виде нет, центрировать не от чего
  const c=t.contentSafeAreaInset, s=t.safeAreaInset;
  const H=+((c&&c.top)||0); if(!H) return; // платформа не подтвердила высоту шапки — не гадаем, оставляем CSS как есть
  const notch=+((s&&s.top)||0);
  /* 15.09.2026 (владелец, живой Oppo CPH2565, маркер-тест): getBoundingClientRect() ЭЛЕМЕНТА несёт
     полную строчную коробку шрифта (line-height), а не сами буквы — у ЗАГЛАВНОГО текста (без
     спускаемых элементов вроде «y»/«p»/«у»/«р») это оставляет неиспользуемый запас снизу под
     несуществующие «хвосты», геометрический центр коробки уезжает НИЖЕ видимых букв. Маркер,
     поставленный ровно на formula-центр, прошёл через середину родной «Назад» верно — но сами
     буквы заголовка сидели заметно выше маркера. Правильная мера — Range на текстовый узел:
     настоящие границы отрисованного текста, не строчная коробка шрифта. */
  let rect=el.getBoundingClientRect();
  try{
    const tn=el.firstChild;
    if(tn && tn.nodeType===3){
      const rg=document.createRange(); rg.selectNodeContents(tn);
      const gr=rg.getBoundingClientRect();
      if(gr.height>0) rect=gr;
    }
  }catch(e){}
  const titleH=rect.height;
  const desiredTop=notch+H/2-titleH/2; // центр заголовка = центр высоты родной шапки
  const delta=desiredTop-rect.top;
  const curMargin=parseFloat(getComputedStyle(el).marginTop)||0;
  el.style.marginTop=(curMargin+delta)+'px';
}

/* ---------- Потоки ---------- */
/* ---------- Режимы забега (v1.42.0 «Пять дисциплин») ---------- */
let runMode='classic'; // v1.92.1 «Дом — это классика»: выбранная дисциплина — сессия, не прописка; дом всегда просыпается классикой (как PLAY у Geometry Dash)
let theaterDay='';      // v1.94.0 «Театр призраков» Т1: день, чьё небо стоит на сцене
let theaterTrack=null;  // лента твоего прыжка ({xs,ys,ds} — призраковый формат), живёт до конца сессии
let theaterChamp=null;  // v1.100.1 «Трибуна чемпиона»: {name,skin} гостя на сцене — null, когда идёт твой собственный повтор
let champTrack=null;    // v1.100.1: лента чемпиона — отдельный моток: твой билет (theaterTrack) спектакль не съедает
let relayPrevGhost=null, relayPrevName='', relayPrevSkin=-1; // 06.09.2026 «Эстафета»: лента этапа, который сейчас смотрим перед тем, как взять руль
let theaterRecord=false; // v1.284.4: сцена — повтор чужого рекорда, а не спектакль дня. Читает goldstar (страж 126)
Store.del('runMode'); // v1.92.1: старая прописка любой дисциплины снимается — большая кнопка священна
Store.del('pact'); // v1.70.0: модификаторы удалённого режима больше не нужны
function setRunMode(m){ runMode=m; } // v1.92.1: сессия — живёт через «Ещё раз?» и рестарт из паузы, умирает в меню и на перезапуске
let runStartBusy=false;
function runStart(){
  if(runStartBusy) return;
  runStartBusy=true;
  try{ startGame(); }
  finally{ setTimeout(()=>{ runStartBusy=false; },350); }
} // «ЛЕТЕТЬ» — в выбранной дисциплине; короткий lock защищает от двойного тапа
window.addEventListener('pointerdown', function tgImmKick(){ // полный экран просит жест — первый тап добирает, если автостарт не смог (v1.58.0; v1.477.27: не только во время полёта — погружение теперь живёт и в меню)
  if (typeof tgImmersion==='function') tgImmersion(true);
  window.removeEventListener('pointerdown', tgImmKick);
});
/* 07.09.2026 «Пуля/Блиц»: Caravan получил второй тайминг (10с рядом со старыми 60с) — владелец
   явно попросил, чтобы это осталось ОДНОЙ кнопкой режима с быстрым переключателем внутри, не
   вторым пунктом в списке и не отдельным экраном подтверждения (тап по карточке = сразу полёт,
   как у всех остальных дисциплин). Тир хранится отдельно от caravanCardFill() (которая просто
   перерисовывает карточку) — put() в heroCarouselFill() ниже перезаписывает innerHTML #modeCaravan
   целиком при каждом заходе на экран/смене языка, поэтому сегменты нужно пересобирать тем же
   вызовом, а не один раз при загрузке. */
// 07.09.2026: три тайминга (10с/60с/180с) — 60 остаётся дефолтом и единственной серверной
// категорией ('caravan'/'bestCaravan', владелец отклонил лишние вкладки в Топе), 10 и 180 —
// личные локальные рекорды (bestCaravan10/bestCaravan180, см. gameOver() в этом же файле).
// Список тиров — один массив, не разбросанные тройные ternary: третий тайминг добавился
// одной строкой, без переписывания caravanCardFill()/caravanTierGet() заново.
const CARAVAN_TIERS=[15,60,180];
function caravanTierGet(){ const v=Number(Store.get('caravanTier',60)); return CARAVAN_TIERS.includes(v)?v:60; }
function caravanTierSet(v){ Store.set('caravanTier', CARAVAN_TIERS.includes(v)?v:60); caravanCardFill(); }
function caravanTierLabel(v){ return v===15?L.caravanBullet:(v===180?L.caravan180:L.caravanBlitz); }
function caravanTierDesc(v){ return v===15?L.modeCaravanD15:(v===180?L.modeCaravanD180:L.modeCaravanD); }
function caravanCardFill(){
  // 07.09.2026: карточка теперь статичная разметка (index.html) — #modeCaravanFly настоящая
  // кнопка полёта, #caravanTierSeg отдельная строка под ней. Эта функция только обновляет
  // текст/выбор внутри них, ничего не перестраивает с нуля (та вложенная версия и вызывала
  // «кнопку на кнопке», отклонённую владельцем вживую).
  const flyBtn=$('modeCaravanFly'), seg=$('caravanTierSeg'); if(!flyBtn||!seg) return;
  const cur=caravanTierGet();
  const desc=flyBtn.querySelector('.modeDesc'); if(desc) desc.textContent=caravanTierDesc(cur);
  if(!seg.children.length){
    // 15.09.2026 (владелец: «время убрать») — «Время» стояло сверху колонки один заход, снято
    // тем же днём; «с» на пилюлях («15»/«60»/«180») остаётся снятой (i18n.js), страж 195 живёт
    // не от неё, а от кольца-орбиты (см. .forgeSegBtn::before ниже) — текст сам по себе никогда
    // не обрезался.
    CARAVAN_TIERS.forEach(function(v){
      const b=document.createElement('button');
      b.type='button'; b.className='forgeSegBtn'; b.dataset.tier=v;
      b.addEventListener('click', function(){ caravanTierSet(v); sfx.click(); haptic('light'); });
      seg.appendChild(b);
    });
  }
  const btns=seg.querySelectorAll('.forgeSegBtn');
  CARAVAN_TIERS.forEach(function(v,i){ btns[i].textContent=caravanTierLabel(v); btns[i].classList.toggle('sel',cur===v); });
}
/* 11.09.2026 «Speedrun RSG»: тот же каркас/приём, что у Caravan выше — постоянная трасса
   (SSG, было и остаётся единственным вариантом до сих пор) плюс новая, случайная (RSG).
   Owner: «в других режимах не вижу правильности в том что можно запоминать» — но Speedrun сам
   по себе genre-accurate (SSG — официальная категория спидраннинга), поэтому не замена, а
   второй вариант рядом; см. [[project_biathlon_slalom_random_seed]] в памяти. */
function speedrunRSGGet(){ return !!Store.get('speedrunRSG', false); }
function speedrunRSGSet(v){ Store.set('speedrunRSG', !!v); speedrunCardFill(); }
function speedrunCardFill(){
  const flyBtn=$('modeSpeedrunFly'), seg=$('speedrunVariantSeg'); if(!flyBtn||!seg) return;
  const rsg=speedrunRSGGet();
  const desc=flyBtn.querySelector('.modeDesc'); if(desc) desc.textContent = rsg?L.modeSpeedrunRSGD:L.modeSpeedrunD;
  if(!seg.children.length){
    [false,true].forEach(function(v){
      const b=document.createElement('button');
      b.type='button'; b.className='forgeSegBtn';
      b.addEventListener('click', function(){ speedrunRSGSet(v); sfx.click(); haptic('light'); });
      seg.appendChild(b);
    });
  }
  // 15.09.2026 (владелец: «в спидран будут иконки» — SSG=цель/фикс, RSG=shuffle/случайное) →
  // 17.09.2026 (владелец, живой макет speedrun-ikonki-ssg-rsg-17-09-2026.html, «Да, делай»):
  // #i-target/#i-shuffle не читались как пара — мишень (i-target) была из другого смыслового
  // семейства, не сам shuffle. Свой i-repeat вместо мишени тогда прижился. →
  // 19.09.2026 (владелец, прямое слово): RSG вернулась к исходному замыслу 15.09 — #i-shuffle
  // (те же скрещенные стрелки), i-repeat у SSG остаётся — пара «повтор/перемешать», тот же
  // язык, что у любого плеера. #i-shuffle освобождён от «Перемешать» в Партитуре (см. #i-help,
  // ptRandomSkyBtn ниже) — больше не конфликтует. title несёт подпись — SSG/RSG остаются
  // доступны на подсказке/скринридеру, просто не печатаются буквами на самой пилюле.
  seg.children[0].innerHTML='<svg class="ic" style="width:12px;height:12px" aria-hidden="true"><use href="#i-repeat"></use></svg>';
  seg.children[0].title=L.speedrunSSG; seg.children[0].classList.toggle('sel', !rsg);
  seg.children[1].innerHTML='<svg class="ic" style="width:12px;height:12px" aria-hidden="true"><use href="#i-shuffle"></use></svg>';
  seg.children[1].title=L.speedrunRSG; seg.children[1].classList.toggle('sel', rsg);
}
/* 15.09.2026: заменяет modesFill() — экран «Турниры» удалён, те же 7 подписей теперь льются
   в карточки карусели на главном (id карточек не поменялись, put()/speedrunCardFill()/
   caravanCardFill() работают без изменений). «Выбранная дисциплина» (.sel, лёд «Единой палубы»)
   убрана — в карусели её роль играют точки-индикатор под ней, не рамка на карточке. */
function heroCarouselFill(){
  const put=(id,n,d)=>{ $(id).innerHTML='<span class="modeName">'+n+'</span><span class="modeDesc">'+d+'</span>'; };
  put('startBtn',L.modeClassic,L.modeClassicD);
  const tk=trackDayKey(), ak=attemptDayKey(); // 05.09.2026: tk — какое небо (месяц), ak — счётчик попыток (день), больше не одно и то же
  /* v1.282.20: печать дня ставится в СПИСОК отыгранных дней, а не в одну запись.
     Одна запись снималась за двадцать секунд: перевёл часы телефона на завтра — запись
     перезаписалась завтрашней датой, вернул назад — дверь снова открыта, и так сколько
     угодно раз. Список помнит все дни (храним последние 10), поэтому возврат упирается
     в уже стоящую печать. */
  const dr=Store.get('dailyRun',null), usedN=(dr&&dr.d===ak)?(dr.n||0):dailyDoneGet(ak); // 05.09.2026: ключ счётчика — реальный день (ak), не месяц-сид (tk); счётчик восстанавливается из журнала, если dailyRun не за сегодня (сброс хранилища)
  const dl = usedN>=DAILY_ATTEMPTS;
  const dbBest=Store.get('dailyBest',null), dbSc=(dbBest&&dbBest.d===tk)?dbBest.s:0;
  put('modeDaily',L.modeDaily, dl?L.dailyLocked(dbSc):L.modeDailyD+' · '+tk.slice(5,7)+'.'+tk.slice(0,4)+' · '+(usedN>0?L.dailyLeft(DAILY_ATTEMPTS-usedN):L.dailyOnce)); // 03.09.2026 «Небо месяца»: было tk.slice(8)+'.'+tk.slice(5,7) (день.месяц) — день теперь всегда «01», показывал бы «01.MM» всегда; месяц.год честнее
  const dailyCard=$('modeDaily').closest('.heroCard'); if(dailyCard) dailyCard.classList.toggle('locked',dl); // 15.09.2026: .locked гасит ВСЮ карточку (.heroCard), а id теперь на вложенной кнопке — .closest() достаёт правильный элемент
  speedrunCardFill(); // 11.09.2026: своя перерисовка вместо put() — несёт ещё переключатель Постоянная/Случайная
  caravanCardFill(); // 07.09.2026: своя перерисовка вместо put() — несёт ещё переключатель тира
  put('modeSlalom',L.modeSlalom,L.modeSlalomD); // 06.09.2026
  put('modeBiathlon',L.modeBiathlon,L.modeBiathlonD); // 06.09.2026
  put('modeRelay',L.modeRelay,L.modeRelayD); // 06.09.2026
  heroDotsInit();
  heroRecordBadgesFill();
  heroPlayHintsFill();
  heroTrailsFill();
  heroRelayChainFill();
}
/* 15.09.2026 «Бейдж-рекорд на карточке»: тот же источник чисел, что уже копится по ходу игры
   (Store-ключи, которыми же топ считает «моё место» — myBestFor выше). Score Attack показывает
   лучший из трёх способов управления (владелец: «просто иконка рядом с рекордом» — здесь ещё
   даже без иконки, число одно, способ виден только в самом топе построчно). Пусто — бейдж скрыт:
   нечем хвастаться, нечего показывать. */
function heroRecordFor(cat){
  if(cat==='touch') return { val:Math.max(saneNumber(Store.get('bestTouch',0),0),saneNumber(Store.get('bestGyro',0),0),saneNumber(Store.get('bestKeys',0),0)), isTime:false };
  if(cat==='daily'){ const tk=trackDayKey(), db=Store.get('dailyBest',null); return { val:(db&&db.d===tk)?saneNumber(db.s,0):0, isTime:false }; }
  if(cat==='speedrun'){ // 15.09.2026 (владелец: «два рекорда? исправь на один, тот что больше... или лучше»):
    // раньше показывал ТОЛЬКО рекорд текущего переключателя (ПОСТОЯННАЯ/СЛУЧАЙНАЯ) — при смене
    // варианта бейдж «прыгал» на другое число, выглядело как два разных рекорда. Теперь один
    // лучший из двух: время (isTime) — чем меньше, тем лучше, 0 значит «рекорда ещё нет», из
    // сравнения исключается, если у второго варианта уже есть время.
    const a=saneNumber(Store.get('srBest',0),0), b=saneNumber(Store.get('srBestRSG',0),0);
    const best=(a>0&&b>0)?Math.min(a,b):(a>0?a:b);
    return { val:best, isTime:true };
  }
  if(cat==='caravan') return { val:saneNumber(Store.get('bestCaravan',0),0), isTime:false };
  if(cat==='slalom') return { val:saneNumber(Store.get('slalomBest',0),0), isTime:true };
  if(cat==='biathlon') return { val:saneNumber(Store.get('biathlonBest',0),0), isTime:true };
  return { val:0, isTime:false };
}
function heroRecordBadgesFill(){
  // 21.09.2026 (владелец: «пока рекорда нет, там просто глаза отображаются») — лента теперь
  // видна ВСЕГДА (форма+характер — живая декорация режима, не привязана к наличию рекорда).
  // 21.09.2026, дословно повторено владельцем после отката: без рекорда — глаза ВМЕСТЕ с
  // фразой L.heroRibbonNoRecord («ПОЛЕТЕЛИ?»), не пустая строка — геометрия ленты уже не
  // зависит от того, есть рекорд или нет (см. index.html у .recordBadge .band), так что
  // текст в .num безопасен для уже посчитанной центровки в обоих случаях.
  [['recBadgeClassic','touch'],['recBadgeDaily','daily'],['recBadgeSpeedrun','speedrun'],
   ['recBadgeCaravan','caravan'],['recBadgeSlalom','slalom'],['recBadgeBiathlon','biathlon']].forEach(function(pair){
    const el=$(pair[0]); if(!el) return;
    const r=heroRecordFor(pair[1]);
    const numEl=el.querySelector('.num');
    el.classList.remove('hidden');
    if(numEl){
      numEl.textContent = r.val>0 ? (r.isTime?fmtTime(r.val):fmtN(r.val)) : L.heroRibbonNoRecord;
      // 21.09.2026: фраза шире любого числа (проверено координатно) — свой меньший размер,
      // чтобы реально помещаться на видимой части ленты с запасом, не впритык.
      numEl.classList.toggle('txt', r.val<=0);
    }
  });
}
/* 16.09.2026 (владелец, третий заход того же вечера): круглая иконка-самолётик заменена текстовой
   подсказкой («нажми, оставь след») — просто заполняет L.heroHintTap в каждый .playHint, видимость
   (показана/спрятана) решает heroTrailsFill() ниже, по тому же признаку, что красит саму линию
   следа. Эстафета (#playHintRelay) в этот цикл не входит — своего .trail у неё нет вообще
   (HERO_TRAIL_EL), подсказка остаётся всегда видна. */
function heroPlayHintsFill(){
  document.querySelectorAll('.heroCard .playHint').forEach(function(el){ el.textContent=L.heroHintTap; });
}
/* 15.09.2026 «Траектория рекорда фоном» (владелец, макет trayektoriya-rekorda-na-fone-kartochki,
   «отлично, мне нравится, есть личное»): та же лента, что несёт «смотреть»/«лететь рядом» в
   Турнирах (ghostPack/ghostParse, js/game.js) — но не проигрывается, а рисуется один раз статичной
   линией. Бакет ключа — тот же, что теперь пишет ghostSave() (js/game.js): один на все три
   способа управления Score Attack, один на все тиры Caravan. Пусто — просто рекорда ещё нет,
   линии рисовать нечем, карточка остаётся градиентом (как раньше). */
const HERO_TRAIL_COLOR={touch:'#dfe8ff',daily:'#f0c040',speedrun:'#ffb27a',caravan:'#ffd76b',slalom:'#6be0ff',biathlon:'#7cf0af'};
const HERO_TRAIL_EL={touch:'trailClassic',daily:'trailDaily',speedrun:'trailSpeedrun',caravan:'trailCaravan',slalom:'trailSlalom',biathlon:'trailBiathlon'};
function heroTrailsFill(){
  Object.keys(HERO_TRAIL_EL).forEach(function(cat){
    const svg=$(HERO_TRAIL_EL[cat]); if(!svg) return;
    // 16.09.2026: та же карточка, что и .trail — подсказка «нажми, оставь след» нужна, только
    // пока следа ещё нет; querySelector, не $() — id не всегда совпадает с cat (playHintTouch, не playHinttouch)
    const hintEl=document.querySelector('.heroCard .playHint[data-cat="'+cat+'"]');
    const gr=Store.get('ghostRun_'+cat, null);
    const track=(gr && typeof gr==='object')?gr.track:'';
    const g=(typeof ghostParse==='function' && track)?ghostParse(track):null;
    if(!g || !g.xs || g.xs.length<2){ svg.innerHTML=''; if(hintEl) hintEl.classList.remove('hidden'); return; }
    const n=g.xs.length, STEP=Math.max(1,Math.floor(n/26)); // прореживаем до ~26 точек — узор, не полная лента
    let d='';
    for(let i=0;i<n;i+=STEP){ d += (d?' L':'M')+(g.xs[i]*320).toFixed(1)+','+(g.ys[i]*112).toFixed(1); }
    svg.innerHTML='<path d="'+d+'" fill="none" stroke="'+(HERO_TRAIL_COLOR[cat]||'#fff')+'" stroke-width="1.4" stroke-linecap="round"/>';
    if(hintEl) hintEl.classList.add('hidden');
  });
}
/* 20.09.2026 «Живая цепочка Эстафеты» (макет, владелец: «Отлично, делай»): честный снимок
   очереди relay_get_open в момент захода на главный экран — если есть открытая цепочка,
   светится её реальный этап; если открытой нет, светится 1 (новая цепочка и правда начнётся
   с 1-го, это не выдумка). Без входа/при отказе сети — оставляем обычный текст .playHint
   (heroPlayHintsFill выше), ромбики не подставляются: не показываем то, чего не проверили.
   Пока только снимок на заход в меню, не живое обновление на месте — как часто заново
   спрашивать сервер, пока сидишь на меню, не трогая карточку, владелец ещё не решил отдельно
   (это настоящий сетевой вызов, не бесплатный трюк на клиенте). */
function heroRelayChainFill(){
  const hint=$('playHintRelay'); if(!hint) return;
  if (!syncAvailable() || typeof syncRelayGetOpen!=='function') return;
  syncRelayGetOpen().then(r=>{
    if (screenName!=='menu') return; // ушёл с меню, пока ответ шёл
    const hintNow=$('playHintRelay'); if(!hintNow) return;
    if (!r || !r.ok) return; // сеть подвела — оставляем обычный текст, не гадаем
    const leg = r.chain ? r.chain.leg : 1;
    hintNow.classList.remove('hidden');
    hintNow.style.opacity='1';
    hintNow.innerHTML='<span class="relayChainRow">'+[1,2,3,4].map(n=>
      '<span class="relayChainNode'+(n===leg?' on':'')+'"><span>'+n+'</span></span>'
    ).join('')+'</span>';
  }).catch(()=>{});
}
function openAchTop(cat){ // 15.09.2026: тап по бейджу-рекорду на карточке — сразу в Достижения→Турниры на нужной дисциплине
  sfx.click(); haptic('light');
  topCat=cat;
  setScreen('ach'); achTabSel(false);
  document.querySelectorAll('#topCats .topCat').forEach(x=>x.classList.toggle('sel',x.dataset.cat===cat));
}
document.querySelectorAll('.recordBadge').forEach(function(b){
  b.addEventListener('click', function(e){ e.stopPropagation(); openAchTop(b.dataset.cat); });
});
/* 17.09.2026 (владелец, «да, но спрятать» — Eruda): консоль отладки только для владельца,
   не для игроков — ничего не грузится, пока её явно не позвали. Обычный игрок физически не
   может наткнуться на это случайно — держать палец 2 секунды без движения не бывает в
   обычной игре ни разу.
   17.09.2026, второй заход (владелец вживую, матом: «сделай удобно, но чтоб случайно не
   нажималось»): было 7 тапов за 3 секунды по #brandName (логотип COSMOGRAM на главном) —
   тот же приём, что в Telegram Settings, но на практике неудобно ловить окно. Заодно
   выяснилось: владелец жал вообще не туда — на СВОЙ логотип студии (.exxxitCard,
   exxxitLogoHTML() ниже, экран «Написать разработчику»), «я разработчик, это мой логотип».
   Долгое нажатие (2000мс) вместо счёта тапов, и на правильном элементе — .exxxitCard живёт в
   innerHTML, который aboutFill() перерисовывает заново при каждом входе на экран, поэтому
   слушатель — делегированный на document (переживает любую перерисовку), не подвешен на сам
   узел напрямую. */
(function debugConsoleWire(){
  // 17.09.2026, десятая находка того же вечера — настоящая причина, доказана бортовым журналом
  // (не догадка): владелец 8 раз подряд отпускал ровно на ~1.0с (±0.1с) — естественная длина
  // «долгого нажатия» для реального пальца оказалась вдвое короче порога в 2000мс, который я
  // придумал на глаз, ничем не измерив. 900мс — с запасом выше случайного тапа (тот <300мс) и
  // комфортно ниже того, что владелец и так делает каждый раз.
  const HOLD_MS = 900;
  let timer = null;
  // 17.09.2026, девятая находка того же вечера — вместо ещё одной догадки: полная трассировка
  // в тот же бортовой журнал, что уже ДВАЖДЫ подряд честно дошёл через «Добавить
  // автодиагностику» (единственный канал сегодня, ни разу не подведший). Следующая лента
  // покажет буквально, на каком именно шаге обрывается — старт/отмена/срабатывание/какой
  // именно код дальше выполнился, без единого предположения с моей стороны.
  function dbg(msg){ if (typeof BB!=='undefined') BB.log('debug','hold: '+msg); }
  function cancel(reason){ if (timer){ clearTimeout(timer); timer = null; dbg('отменено — '+reason); } }
  document.addEventListener('pointerdown', function(e){
    if (!e.target.closest('.exxxitCard')) return;
    dbg('pointerdown на карточке, старт таймера '+HOLD_MS+'мс');
    cancel('новый pointerdown поверх старого');
    timer = setTimeout(function(){
      timer = null;
      dbg('таймер дожил до конца — зову toggleDebugConsole()');
      try{ toggleDebugConsole(); dbg('toggleDebugConsole() отработал без исключения'); }
      catch(e){ dbg('toggleDebugConsole() упал — '+String(e).slice(0,80)); }
      try{ showEnvAlert(); dbg('showEnvAlert() отработал без исключения'); }
      catch(e){ dbg('showEnvAlert() упал — '+String(e).slice(0,80)); }
    }, HOLD_MS);
  });
  document.addEventListener('pointerup', function(){ cancel('pointerup'); });
  document.addEventListener('pointercancel', function(){ cancel('pointercancel — браузер сам оборвал последовательность'); });
  document.addEventListener('pointerleave', function(){ cancel('pointerleave'); });
  if (Store.get('debugConsole', false)) loadDebugConsole();
})();
// 17.09.2026, шестая находка того же вечера: Eruda (сеть/Shadow DOM/иконка — три разных повода
// не показаться) оказалась слишком ненадёжной именно для того единственного, что было нужно
// прямо сейчас, — реальные цифры safe-area с телефона владельца. alert() рисует сама
// операционная система поверх абсолютно всего, без сети, без Shadow DOM, без z-index игры —
// то же долгое нажатие показывает его сразу, никакого второго действия («Добавить
// автодиагностику») не нужно. Полноценная Eruda (loadDebugConsole ниже) продолжает
// пытаться загрузиться параллельно, для будущей полной отладки — но эта строка не ждёт её.
function showEnvAlert(){
  // 17.09.2026, восьмая находка того же вечера, вероятная настоящая причина полной тишины даже
  // от системного alert(): реальный Telegram WebView (в отличие от моего браузера, где `tg`
  // всегда null — нет настоящей initData) часто молча подавляет нативные alert()/confirm() —
  // официально рекомендованная замена внутри Telegram именно поэтому и существует:
  // tg.showAlert() (мост уже подключён, js/vendor/telegram-web-app.js). `tg` в моей среде
  // ВСЕГДА null (initData настоящего Телеграма у меня быть не может) — эту находку было
  // физически невозможно поймать своим тестированием, не по невнимательности.
  const dbg = function(msg){ if (typeof BB!=='undefined') BB.log('debug','alert: '+msg); };
  const env = (typeof BEACON!=='undefined' && BEACON.envCtx) ? BEACON.envCtx() : 'BEACON.envCtx недоступен';
  const text = 'Cosmogram v'+GAME_VERSION+' · '+((typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?')+'\n'+env;
  const hasTg = typeof tg!=='undefined' && !!tg;
  const hasShowAlert = hasTg && typeof tg.showAlert==='function';
  dbg('tg='+hasTg+' tg.showAlert='+hasShowAlert);
  try{
    if (hasShowAlert){ tg.showAlert(text); dbg('tg.showAlert() вызван без исключения'); return; }
  }catch(e){ dbg('tg.showAlert() упал — '+String(e).slice(0,80)); }
  try{ alert(text); dbg('нативный alert() вызван без исключения'); }
  catch(e){ dbg('нативный alert() тоже упал — '+String(e).slice(0,80)); }
}
function loadDebugConsole(){
  if (window.eruda){ window.eruda.show(); erudaVisCheck(); return; }
  const s = document.createElement('script');
  // 17.09.2026 (владелец вживую, матом — третья находка): грузили с cdn.jsdelivr.net — на его
  // реальном телефоне (Telegram WebView) до чужого сайта не достучаться (сеть/ограничения самого
  // Telegram), скрипт молча не загружался, хотя жест срабатывал (вибрация была). Файл теперь
  // свой, js/vendor/eruda.min.js, с того же источника, что и сама игра — тот же приём, что уже
  // у mp4-muxer/telegram-web-app в этой же папке. Ничего внешнего дёргать больше не нужно.
  // ?v=GAME_VERSION — тот же хвост, что у остальных script-тегов в index.html (bump-version.mjs
  // его туда пишет); sw.js кэширует файл ровно под этим URL — без хвоста здесь был бы промах
  // мимо кэша при каждом обращении, даже офлайн.
  s.src = 'js/vendor/eruda.min.js?v='+GAME_VERSION;
  if (typeof BB!=='undefined') BB.log('debug','eruda: script tag appended, ждём onload');
  // 17.09.2026 (та же находка, что выше по треку — «нашёл в коде»): eruda.init() САМ ПО СЕБЕ
  // только ставит маленькую иконку-вход, панель не открывает — нужен ещё отдельный тап по ней.
  // Иконка мелкая, тёмная, в нижнем углу — на реальном телефоне владелец её физически не нашёл.
  // eruda.show() сразу после init() — панель раскрыта сама, без поиска иконки.
  // 17.09.2026, пятая находка — даже локальный файл (см. выше) с подтверждённой правильной
  // версией у владельца всё ещё не показал панель (только вибро). Раз причина не воспроизвелась
  // у меня ни разу — пишем в тот же бортовой журнал, что уже умеет читать «Добавить
  // автодиагностику» (без нового действия от владельца), каждый шаг отдельно, чтобы при
  // следующей попытке разрыв был виден в самой ленте, не только «сработало / не сработало».
  s.onload = function(){
    if (typeof BB!=='undefined') BB.log('debug','eruda: onload, window.eruda='+(typeof window.eruda));
    if (window.eruda){ window.eruda.init(); window.eruda.show(); erudaVisCheck(); }
  };
  s.onerror = function(){ haptic('error'); if (typeof BB!=='undefined') BB.log('debug','eruda: onerror — файл не отдался'); };
  document.head.appendChild(s);
}
function erudaVisCheck(){ // 17.09.2026: реальная видимость после show(), не только факт вызова.
  // Первая версия мерила getBoundingClientRect() на #eruda самом — у Eruda Shadow DOM, хост-
  // элемент честно 0×0 даже когда панель внутри тени видна и работает (собственная layout-рамка
  // хоста не включает position:fixed содержимое тени) — смотрим внутрь тени, не на хост.
  setTimeout(function(){
    try{
      const el = document.getElementById('eruda');
      if (!el){ if (typeof BB!=='undefined') BB.log('debug','eruda: НЕТ #eruda в DOM'); return; }
      const sr = el.shadowRoot;
      if (!sr){ if (typeof BB!=='undefined') BB.log('debug','eruda: #eruda есть, но shadowRoot нет'); return; }
      const panel = sr.querySelector('.eruda-dev-tools, [class*="eruda"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      const msg = panel
        ? ('shadow-панель w'+Math.round(r.width)+'h'+Math.round(r.height)+' cs-display:'+getComputedStyle(panel).display+' cs-vis:'+getComputedStyle(panel).visibility)
        : ('shadowRoot есть, детей '+sr.children.length+', первый: '+(sr.children[0]?sr.children[0].className:'-'));
      if (typeof BB!=='undefined') BB.log('debug','eruda: '+msg);
    }catch(e){ if (typeof BB!=='undefined') BB.log('debug','eruda: erudaVisCheck упал — '+String(e).slice(0,60)); }
  }, 400);
}
function toggleDebugConsole(){
  const on = !Store.get('debugConsole', false);
  Store.set('debugConsole', on);
  sfx.click(); haptic('success');
  if (on) loadDebugConsole();
  else location.reload(); // 17.09.2026: у Eruda нет честного «выгрузиться совсем» — проще перезагрузить экран без неё
}
function heroDotsInit(){ // точки-индикатор — создаются один раз, дальше только heroCarouselDotsSync() переключает .on
  const car=$('heroCarousel'), dots=$('heroDots'); if(!car||!dots||dots.children.length) return;
  for(let i=0;i<car.children.length;i++){ const d=document.createElement('div'); d.className='heroDot'+(i===0?' on':''); dots.appendChild(d); }
}
function runPassFill(){ // 30.08.2026 «Единый паспорт забега»: режим+управление одной тихой строкой сверху
  // (было продублировано пилюлей и значком в двух разных местах), все 8 чисел забега — одним
  // визуальным языком (.statGrid.stats4, та же плитка, что уже стоит на других экранах)
  const head=$('runHead'), grid=$('runPass'); if(!head||!grid) return;
  const names={classic:L.modeClassic,speedrun:L.modeSpeedrun,daily:L.modeDaily,custom:L.modeForge,caravan:L.modeCaravan,slalom:L.modeSlalom,biathlon:L.modeBiathlon,relay:L.modeRelay}; // v1.68.0: + своя трасса; 06.09.2026: + Слалом/Биатлон/Эстафета; 07.09.2026: 1CC убран; 07.09.2026: Ironman ушёл в Конструктор; 07.09.2026: 100% удалён — звёзды спавнятся без честного коридора (как раньше бонусы), 100%-сбор нечестно недостижим по RNG
  const mode=(typeof controlMode==='function')?controlMode():'touch';
  const ctlName=mode==='gyro'?L.modeGyro:(mode==='keys'?L.modeKeys:L.modeTouch);
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
  { const __t=performance.now(); audio(); TAKEOFF_T.audio=performance.now()-__t; } // 11.09.2026 «Разбивка взлёта»: см. TAKEOFF_T в core.js
  { const __t=performance.now(); keepAwake(); TAKEOFF_T.wake=performance.now()-__t; }
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
  const freshSeed = Math.floor(Math.random()*4294967296); // v1.280.0: чеканится один раз за забег — источник для Классики/Caravan ниже
  /* v1.282.15: ключ трассы называется ОДИН раз и живёт рядом с самим потоком — из него
     же шьются личные потоки каждого спавна (см. withTrack в core.js). Разъехаться им
     нельзя: иначе поле снова станет зависеть от того, что делал игрок. */
  /* 11.09.2026 (владелец, через друга: «в других режимах не вижу правильности в том что можно
     запоминать где что находится»): Биатлон/Без-касаний (Слалом) сняты с вечного сида. Причина
     не «скопировали по аналогии со Speedrun и не подумали» — настоящий биатлон/слалом переставляют
     трассу перед КАЖДЫМ стартом, это часть сути дисциплины, а не случайность; вечный сид как у
     Speedrun (SSG — официальная категория спидраннинга) им не подходил жанрово. Speedrun остаётся
     как есть — там постоянство трассы genre-accurate, второй (случайный) режим для него будет
     отдельным RSG-вариантом, не заменой. Сервер (cosmogram-daily) сид никогда не хранил и не
     проверял — day был чистой формальностью, менять на сервере нечего, старые рекорды снесены
     напрямую в базе (biathlon_runs/slalom_runs, оба пусты). */
  const srRSG = runMode==='speedrun' && typeof speedrunRSGGet==='function' && speedrunRSGGet(); // 11.09.2026 «Speedrun RSG»: второй вариант, читается один раз на взлёте, как caravanTierGet()
  mapSeedKey = (runMode==='daily') ? trackDayKey() // v1.282.20: ключ трассы — по общему времени; 07.09.2026: 1CC убран; 07.09.2026: 100% удалён
    : runMode==='theater' ? String(theaterDay||trackDayKey())
    : (runMode==='speedrun' && !srRSG) ? (SPEEDRUN_ETERNAL_DAY+'·speedrun') // 03.09.2026 «Set Seed»: постоянный ключ, не привязан к дате вообще (SSG — вариант по умолчанию)
    : runMode==='relay' ? (S.relaySeed+'·relay·'+(S.relayWatching?(S.relayLeg-1):S.relayLeg)) // 06.09.2026: во время просмотра — сид ЭТАПА, который показываем; дальше relayHandoffToLive() в game.js переставит на сид своего этапа
    : runMode==='custom' && typeof forgeCfgGet==='function' ? String(forgeCfgGet().seed||0)
    : String(freshSeed); // 11.09.2026: Слалом/Биатлон/Speedrun-RSG сюда же, свежий сид каждый забег, как Caravan/Классика
  mapSeqReset();
  if (typeof nebulaReseed==='function') nebulaReseed(); // v1.282.15: узор туманностей — свой на забег; раньше он менялся раз в секунду прямо в полёте
  mapRNG = (runMode==='daily') ? dailyRNG()
    : runMode==='theater' ? keyRNG(theaterDay||trackDayKey())
    : (runMode==='speedrun' && !srRSG) ? keyRNG(SPEEDRUN_ETERNAL_DAY+'·speedrun') // 03.09.2026 «Set Seed»: тот же поток каждый забег, навсегда — SSG, не по дню
    : runMode==='relay' ? keyRNG(S.relaySeed+'·relay·'+(S.relayWatching?(S.relayLeg-1):S.relayLeg))
    : runMode==='custom' && typeof forgeCfgGet==='function' ? keyRNG(String(forgeCfgGet().seed||0)) // v1.108.1: тот же код друга — та же расстановка, не только те же настройки
    : keyRNG(String(freshSeed)); // v1.280.0 «Честная Классика»: свой сид каждый забег — раньше был голый Math.random(), из которого нечего восстановить; призрак теперь может унести этот сид и показать те же самые препятствия при просмотре/гонке; 11.09.2026: Слалом/Биатлон/Speedrun-RSG тоже сюда
  if (typeof gyroKick==='function' && typeof tgPkt==='number' && tgPkt===0){ const __t=performance.now(); gyroKick(); TAKEOFF_T.gyro=performance.now()-__t; } // мост мог заглохнуть при загрузке — перезапуск по жесту «играть» (идемпотентно); 11.09.2026: время моста — тоже в разбивку взлёта
  if (typeof calReset==='function'){ const __t=performance.now(); calReset(false,undefined,'takeoff'); TAKEOFF_T.cal=performance.now()-__t; } else { input.baseG=null; input.baseB=null; } // автокалибровка нуля на старте — из неподвижной позы (v1.4.5); v1.109.1: источник — каждый взлёт это честный сброс, не дребезг, но партии 18 не хватало его в разбивке; 11.09.2026: время — тоже в разбивку взлёта
  input.tiltX=0; input.tiltY=0; // сброс low-pass — не тянет из меню
  tDown=false; tActive=false; input.touchX=null; input.touchY=null; // залипший жест (пропавший touchend в WebView) не паркует самолётик и не глушит гироскоп
  if (typeof echoReset==='function') echoReset(); // эхо-шлейф Призрака: чистый забег
  if (typeof trailHistReset==='function') trailHistReset(); // 04.09.2026: связные следы премиум (Лента/Нить-жемчуг) — чистый забег
  if (typeof graceReset==='function') graceReset(); // v1.108.1: новый забег — новый счёт благодати, лимит не переносится из прошлого полёта
  Object.assign(S,{running:true,paused:false,score:0,mission:1,lives:(runMode==='slalom'?1:3),invuln:1.5,speed:3.4,dist:0, // 06.09.2026: Слалом — 1 жизнь вместо 3; 07.09.2026: 1CC убран; 07.09.2026: Ironman ушёл в Конструктор
    combo:0,comboMax:0,starsCollected:0,shield:0,magnet:0,slowmo:0,dash:0,time:0,flash:0,shake:0,hueShift:0,timeScale:1,dying:0,dyingT:0,dyingWin:0,pausing:0, // v1.40.0: Таран и часы полёта — с чистого листа; dyingWin — 13.09.2026 «Ворота финиша»
    gyroSec:0,manSec:0,touchSec:0,keysSec:0,mouseSec:0,smooth:1,mode:runMode,hits:0,bonuses:0,nearMiss:0,everDash:0,everNova:0,srWin:0,caravanTimeUp:0,starsSpawned:0,slalomWin:0,slalomFail:0, // v1.280.0: сид этого забега — призрак унесёт его с собой; touchSec/keysSec — честная категория, не тонут в общем manSec
    caravanTime:(runMode==='caravan'?caravanTierGet():60), // 07.09.2026 «Пуля/Блиц»: выбор игрока на кнопке режима, снимается один раз на старте — смена переключателя посреди полёта (невозможна физически, экран другой) всё равно не задела бы текущий забег
    speedrunRSG:srRSG, // 11.09.2026 «Speedrun RSG»: тот же приём, что у caravanTime — снимается один раз на старте, не читается заново посреди полёта
    biathlonWin:0,biathlonR1Done:0,biathlonMisses:0,biathlonSnapSpawned:0,biathlonSnapCollected:0,relayLegDone:0,seed:freshSeed,
    mapWin:0,customName:'',customE:0,customD:1,customS:1,customL:0,customW:1,customFlat:0,customB:2,customLv:3,customWG:0,customHS:0,customHSTier:0,customH1:232,customH2:200,customMood:50, // v1.282.14: customLv тоже сбрасывается — единственное поле семейства, которое переживало забег; v1.282.15: и признак поколения кода // v1.42.0: дисциплина и паспорт — с чистого листа; v1.68.0/v1.69.0: трасса — тоже; 31.08.2026: customHS — «Высокая ставка»; 23.09.2026: customHSTier — «Ставка ×8» (0/1/2); 01.09.2026: customH1/H2 — «Свой фон»; customMood — «Настроение неба»
  lastHitKind:'', wasRestored:0}); // v1.282.20: метка восстановленного забега — с чистого листа // v1.282.13: причина гибели ставится только в hitPlane и раньше нигде не стиралась — забег без удара наследовал препятствие ПРОШЛОГО забега, и Мозг неба подкручивал сложность под то, чего в этой попытке не было
  if(typeof BB!=='undefined') BB.log('takeoff', String(runMode||'')); // v1.99.7 «Чёрный ящик»: взлёт — на ленту
  prevTiltX=0; prevTiltY=0; prevTX=null; prevTY=null; lastSmoothShown=-1; // Smooth Flight: чистый замер
  smoothWasPerfect=true; // старт полёта = потолок плавности сам по себе, попап «Плавный полёт» не за это
  lastDistKm=0; // новый забег — золотая вспышка километров начинается с нуля, не с прошлого полёта
  if (typeof cinemaClipHide==='function') cinemaClipHide(); // 31.08.2026 «Момент полёта»: кнопка «Клип» не донашивает клип с прошлой посадки, если в ЭТОМ полёте запись не сработает
  S.dailyDay = runMode==='theater' ? theaterDay : (runMode==='daily' ? (saved&&saved.dailyDay ? saved.dailyDay : trackDayKey()) : ''); // v1.282.20: день соревнования общий // v1.93 «Одна попытка»: прыжок принадлежит дню взлёта — даже через полночь; v1.94.0: театр помнит день спектакля; 07.09.2026: 1CC убран; 07.09.2026: 100% удалён
  if (runMode==='daily' && !saved){ // 23.08.2026 «5 попыток»: счётчик +1 на взлёте — та же защита от читерства, что была у одной попытки, порог просто выше; 07.09.2026: 100% удалён
    const ak0=attemptDayKey(); // 05.09.2026: счётчик попыток живёт по реальному дню, не по S.dailyDay (тот — месячный сид неба, не трогаем)
    const dr0=Store.get('dailyRun',null), curN=(dr0&&dr0.d===ak0)?(dr0.n||0):dailyDoneGet(ak0); // после сброса хранилища — восстанавливаем счётчик из журнала, не начинаем с нуля
    const nextN=curN+1;
    Store.set('dailyRun',{d:ak0,n:nextN}); dailyDoneMark(ak0,nextN);
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
    S.customHSTier=fc.hsTier||0; // 23.09.2026 «Ставка ×8»: 0/1/2 — источник истины для scoreMult() (js/game.js), customHS выше остаётся булевым дублем
    S.customWind=fc.wind||0; // 06.09.2026 «Солнечный ветер» — 0 у старых кодов без поля, обычные режимы этот флаг вообще не читают
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
  // 06.09.2026 «Эстафета»: очки/жизни — не с нуля (Object.assign выше уже поставил 0/3), а
  // унаследованные от предыдущего этапа цепочки (relay_get_open/relay_start, ui.js click).
  // Только не при восстановлении автосейва — тот уже несёт свои честные числа этого же этапа.
  if (runMode==='relay' && !saved){
    S.score=saneNumber(S.relayInheritScore,0);
    S.lives=clamp(saneNumber(S.relayInheritLives,3),1,3);
  }
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
  if (typeof finishReset==='function') finishReset(); // 13.09.2026 «Ворота финиша»: новый взлёт — чистый лист, тот же приём, что у goldReset() выше
  /* v1.282.20: раньше сброс пропускался при восстановлении автосейва — и вёрсты оставались от
     ПРОШЛОГО забега: восстановленный на 1 км после забега на 4 км молчал всполохами до 5 км.
     Теперь чистим всегда, а вёрсты честно подводим под уже пройденное. */
  if (typeof planetReset==='function') planetReset();
  if (typeof morseDayCheck==='function') morseDayCheck(); // виброэфир: первый полёт дня (v1.54.0) // v1.87.0: призрак рекорда со старта убран — мотиваций хватает без тени
  if (typeof livingFlashCheck==='function') livingFlashCheck(); // 05.09.2026 «Живые вспышки»: веха/возвращение — СТРОГО до streakDayCheck ниже, читает старый streakDay до его перезаписи
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
  // 06.09.2026 «Эстафета»: тот же приём, что у Театра — но только когда правда есть, что смотреть
  // (relayWatching взводится в клике по кнопке только если предыдущий этап дал валидную ленту).
  else if (runMode==='relay' && S.relayWatching && relayPrevGhost){
    ghost=relayPrevGhost; ghostIdx=0; ghostOn=false; ghostFade=0; ghostA=0; ghostTagT=0;
    ghostForeign=true; ghostName=relayPrevName||''; ghostSkin=(relayPrevSkin!=null)?relayPrevSkin:-1; }
  else if (typeof ghostLoad==='function') ghostLoad(); // v1.280.0 «Воскрешение»: определена с самого начала, но никогда не звалась — «Призрак из топа» и свой рекорд первых 7 игр молчали физически, не из-за сида
  /* 06.09.2026 «Толпа Неба месяца»: чистим на КАЖДЫЙ взлёт (не только Небо месяца) — иначе
     толпа с прошлого полёта в Небе месяца пережила бы смену режима и летела бы дальше в
     Классике/Спидране/где угодно. Загружаем только для 'daily' и только не восстановленный
     автосейв (тот же приём, что у наследования очков Эстафеты выше — свежая толпа на каждый
     настоящий взлёт). Асинхронно, полёт не ждёт ответа сервера — силуэты появятся, когда придут.*/
  if (typeof crowdGhostsClear==='function') crowdGhostsClear();
  if (runMode==='daily' && !saved && typeof syncDailyCrowd==='function'){
    const crowdDay=trackDayKey(), crowdRunMode=runMode;
    syncDailyCrowd(crowdDay).then(r=>{
      if (runMode!==crowdRunMode || S.dailyDay!==crowdDay) return; // забег уже сменился, пока летел ответ — не подсаживаем толпу не в тот полёт
      if (r && r.ok && Array.isArray(r.ghosts) && typeof crowdGhostsLoad==='function') crowdGhostsLoad(r.ghosts);
    }).catch(()=>{});
  }
  if(saved){ // восстановление автосейва (Блок 8)
    S.score=saneNumber(saved.score,0); S.mission=saneNumber(saved.mission,1);
    S.lives=clamp(saneNumber(saved.lives,3),1,3); S.dist=saneNumber(saved.dist,0);
    S.starsCollected=saneNumber(saved.starsCollected,0);
    S.comboMax=saneNumber(saved.comboMax,0); S.hueShift=saneNumber(saved.hueShift,0);
    // v1.282.20: возвращаем и то, что раньше обнулялось при восстановлении
    S.smooth=clamp(saneNumber(saved.smooth,1),.5,1); S.time=saneNumber(saved.time,0);
    S.hits=saneNumber(saved.hits,0); S.bonuses=saneNumber(saved.bonuses,0);
    S.goldStar=!!saved.goldStar; S.wasRestored=1;
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
  toggleCls('modeHud','hidden', !(runMode==='speedrun'||runMode==='daily'||runMode==='custom'||runMode==='theater'||runMode==='caravan'||runMode==='slalom'||runMode==='biathlon'||runMode==='relay')); // HUD дисциплины (v1.42.0/v1.47.0/v1.68.0/v1.94.0; v1.70.0: Пакт удалён; 05.09.2026: + Caravan; 06.09.2026: + Слалом/Биатлон/Эстафета; 07.09.2026: 1CC убран; 07.09.2026: 100% удалён
  $('modeHud')._t=0; // новый забег — табло дисциплины пересобирается (v1.43.0)
  sfx.launch(SKINS_BY_ID.get(S.skin)||SKINS[0]); // фирменный аккорд скина (или обычный старт); v1.87.0: баннер «Добро пожаловать» убран — каждый забег он был лишним
  music.start('game'); // адаптивный полёт: дрон сразу, слои — по волнам/жизням
  engine.start(); // голос самолётика: шелест следует за скоростью
  if (runMode!=='theater'){ Stats.games++; saveStats(); } // v1.70.0: разведки Пакта больше нет — каждый старт считается; v1.94.0: просмотр в театре — не забег, счётчик молчит
  Store.del('savedRun');
}
function retryRun(){ startGame(); } // «ЕЩЁ РАЗ» — в той же дисциплине (v1.42.0)
/* 18.09.2026 (владелец, живой телефон: «поиграл кучу раз в разные режимы, линии на карточках
   меню так и не появились») — ghostSave(cat) писал линию (heroTrailsFill(), выше в этом файле)
   только В МОМЕНТ, когда счёт бьёт СТАРЫЙ личный рекорд. У владельца рекорды старые и высокие —
   свежие тестовые забеги их не превышали, а значит НИ ОДНОЙ линии никогда не появлялось, хотя
   полётов было много. Та же логика, что уже чинили для видео первого полёта раньше в этой же
   сессии (cinemaHighlightEligible: первый забег в чистом режиме тоже должен засчитаться, не
   только второй) — здесь тот же принцип: если линии для категории ещё нет вообще, первый же
   полёт должен её оставить, даже не побив старое число. Дальше — как раньше, только настоящие
   новые рекорды двигают линию дальше. */
function ghostSaveIfFirstEver(cat){
  if (typeof ghostSave!=='function' || typeof ghostCatBucket!=='function') return;
  if (Store.get('ghostRun_'+ghostCatBucket(cat), null)) return; // линия для этой категории уже есть — ничего не трогаем
  ghostSave(cat); // сам ghostSave коротко отсеет слишком короткий забег (rec.length<20)
}
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
  let sc=Math.floor(S.score*(0.5+S.smooth*0.5)); // Smooth Flight: итог × плавность (0.75..1.0)
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
    // 08.09.2026 «Clear Check»: настоящий пройденный забег на ЭТОМ коде — с длиной только
    // через честный финиш (S.mapWin), без длины (∞, финиша нет по определению) — любой
    // естественный забег до конца уже засчитывается. Без этого «Поделиться» не даёт публиковать.
    if((S.customL===0 || S.mapWin) && typeof forgeVerifyCode==='function' && typeof forgeEncode==='function' && typeof forgeSanitize==='function' && typeof forgeCfg!=='undefined'){
      forgeVerifyCode(forgeEncode(forgeSanitize(forgeCfg)));
    }
    theaterTrack=null; toggleCls('watchBtn','hidden',true); mapOver(sc); return;
  }
  const mode=controlMode(); // категория управления: gyro / touch / keys
  // 05.09.2026 «Caravan»: одна общая таблица на дисциплину, не по управлению (владелец
  // выбрал так явно — мало игроков, дробить рано).
  // 06.09.2026 «Эстафета»: своя изолированная локальная категория (bestRelayLeg), не
  // touch/gyro/keys — счёт этапа несёт унаследованные очки чужих этапов цепочки, писать его
  // в личный рекорд СПОСОБА управления было бы нечестно (тот же принцип, что увёл Caravan
  // в свои ключи ниже).
  // 07.09.2026 «Три тайминга Caravan»: 15с/60с/180с не сравнимы по очкам между собой — свой
  // локальный рекорд на каждый тайминг. Только 60с (дефолт) остаётся старой серверной
  // категорией 'caravan'/'bestCaravan' (владелец отклонил лишние вкладки в Топе — «занимать
  // лишнее место»); 15с и 180с — bestCaravan15/bestCaravan180, только на устройстве, не в sync.
  const caravanOtherTier = S.mode==='caravan' && S.caravanTime && S.caravanTime!==60 ? S.caravanTime : 0;
  const cat=caravanOtherTier?('caravan'+caravanOtherTier):(S.mode==='caravan'?'caravan':(S.mode==='relay'?'relay':mode));
  const modeKey=caravanOtherTier?('bestCaravan'+caravanOtherTier):(S.mode==='caravan'?'bestCaravan':(S.mode==='relay'?'bestRelayLeg':(mode==='gyro'?'bestGyro':(mode==='keys'?'bestKeys':'bestTouch')))); // v1.280.0: добавлена ветка keys
  const prevCat=saneNumber(Store.get(modeKey,0),0);
  // 17.09.2026: у Неба месяца/Спидрана/Слалома/Биатлона свой личный рекорд (dailyBest/srBest/
  // slalomBest/biathlonBest, ниже) — caravan/relay уже были исключены через cat/modeKey выше,
  // а эти четыре нет: их sc проваливался в bestTouch/bestGyro/bestKeys (т.к. cat=mode — способ
  // управления, не режим), тихо переписывая чужой личный рекорд Score Attack чужим счётом и
  // чужим следом полёта. Страж 262 (tests/guard.mjs) поймал это живым тестом.
  const foreignRecordMode = S.mode==='daily'||S.mode==='speedrun'||S.mode==='slalom'||S.mode==='biathlon';
  const isRecord = !foreignRecordMode && sc>prevCat && sc>0;
  const ghostBeatNow=!!(typeof ghostForeign!=='undefined' && ghostForeign && foreignFrom==='top' &&
    ghostPid>0 && ghostCat && cat===ghostCat && ghostBest>0 && sc>ghostBest); // призрачная месть: призрак из топа, та же категория, счёт выше его планки
  if (isRecord){ Store.set(modeKey,sc); haptic('success'); if (typeof confetti==='function') confetti(); // вау-момент
    setTimeout(()=>{ if (typeof hapticMorse==='function') hapticMorse(myCallsign()); },950); // виброэфир: позывной «передан в эфир» (v1.54.0)
    if (typeof ghostSave==='function') ghostSave(cat); } // призрак: траектория рекордного забега — 15.09.2026: своя лента на дисциплину, cat уже посчитан выше
  else if (!foreignRecordMode && sc>0) ghostSaveIfFirstEver(cat); // 18.09.2026: не побил старый рекорд — но если линии для этой категории ещё нет вообще, первый полёт её всё равно оставляет
  if (isRecord && prevCat>0) Stats.recBeats=(Stats.recBeats||0)+1; // побит СУЩЕСТВУЮЩИЙ рекорд категории (первый зачёт — не в счёт)
  if (sc>S.best){ S.best=sc; Store.set('best',sc); } // общий максимум — для HUD и меню
  const distM=Math.floor(S.dist); // чистый пробег: без бонусов, единый для всех режимов
  const prevDist=saneNumber(Store.get('bestDist',0),0);
  const isDistRecord = distM>prevDist && distM>0;
  if (isDistRecord){ Store.set('bestDist',distM); if (!isRecord) haptic('success'); }
  let srNewBest=false; // Спидран: рекорд — лучшее время до цели (v1.42.0)
  if (S.mode==='speedrun' && S.srWin && !S.wasRestored){ // v1.282.20: часы восстановленного забега начинались бы с нуля — такой рекорд нечестен
    const srKey = S.speedrunRSG ? 'srBestRSG' : 'srBest'; // 11.09.2026 «Speedrun RSG»: свой личный рекорд, не мешается с постоянным SSG
    const prevSr=saneNumber(Store.get(srKey,0),0);
    if (!prevSr || S.time<prevSr){ Store.set(srKey,S.time); srNewBest=true;
      if (typeof ghostSave==='function') ghostSave('speedrun'); } // 15.09.2026: своя ветка победы (S.srWin) — ghostSave выше в общем isRecord её не видел, след не сохранялся ни на одной победе
    else ghostSaveIfFirstEver('speedrun'); // 18.09.2026: победа есть, старое время не побито — но линия для категории может быть ещё пустой
  }
  let slalomNewBest=false; // 06.09.2026 «Слалом»: тот же приём, что у Спидрана — рекорд считается только на настоящей победе
  if (S.mode==='slalom' && S.slalomWin && !S.wasRestored){
    const prevSl=saneNumber(Store.get('slalomBest',0),0);
    if (!prevSl || S.time<prevSl){ Store.set('slalomBest',S.time); slalomNewBest=true;
      if (typeof ghostSave==='function') ghostSave('slalom'); } // 15.09.2026: та же дыра, что у Спидрана — своя ветка победы, общий ghostSave(cat) выше её не касался
    else ghostSaveIfFirstEver('slalom'); // 18.09.2026: та же добавка, что у Спидрана
  }
  let biathlonNewBest=false; // 06.09.2026 «Биатлон»: тот же приём — S.time уже несёт штрафы на этот момент
  if (S.mode==='biathlon' && S.biathlonWin && !S.wasRestored){
    const prevBi=saneNumber(Store.get('biathlonBest',0),0);
    if (!prevBi || S.time<prevBi){ Store.set('biathlonBest',S.time); biathlonNewBest=true;
      if (typeof ghostSave==='function') ghostSave('biathlon'); } // 15.09.2026: та же дыра — своя ветка победы
    else ghostSaveIfFirstEver('biathlon'); // 18.09.2026: та же добавка, что у Спидрана/Слалома
  }
  S.wallet += S.starsCollected;
  Store.set('wallet', S.wallet);
  if (ghostBeatNow) Stats.ghostBeats=(Stats.ghostBeats||0)+1; // сколько чужих призраков повержено (ачивка gv1)
  Stats.deaths++; Stats.totalStars+=S.starsCollected;
  Stats.totalDist+=distM; // профиль: суммарная дистанция — база космической шкалы
  if(S.comboMax>Stats.bestCombo)Stats.bestCombo=S.comboMax;
  if(S.mission>Stats.bestWave)Stats.bestWave=S.mission;
  if(S.smooth>=0.99)Stats.perfectRuns++;
  if(mode==='gyro')Stats.gGames++; else if(mode==='keys')Stats.kGames++; else Stats.tGames++;
  if(distM===42)Stats.e42=1; if(sc>9000)Stats.e9000=1; if(sc===1337)Stats.e1337=1; // пасхалки
  /* 05.09.2026 «No-Miss / Pacifist»: бейджи поверх обычных забегов, не отдельные режимы.
     No-Miss честно достижим только там, где есть финиш БЕЗ смерти — gameOver() в остальных
     режимах (Классика/Небо месяца) вызывается исключительно через S.lives<=0, то есть
     «0 попаданий» на итогах там противоречиво по конструкции самого кода. */
  const noMissNow = ((S.mode==='speedrun'&&S.srWin) || (S.mode==='caravan'&&S.caravanTimeUp) || (S.mode==='slalom'&&S.slalomWin) || (S.mode==='biathlon'&&S.biathlonWin) || (S.mode==='relay'&&S.relayLegDone)) && S.hits===0; // 06.09.2026: победа в Слаломе/Биатлоне/сдача этапа Эстафеты — тоже честный триггер (S.hits — про столкновения, не про промахи по звёздам)
  // Pacifist: ни разу не подобрал Таран/Сверхновую — только уклонение. bonuses>0 требует хотя бы
  // одного взятого бонуса — иначе флаг был бы честен формально, но бессмысленен (не было выбора).
  const pacifistNow = !S.everDash && !S.everNova && S.bonuses>0;
  if (noMissNow) Stats.noMissRuns=(Stats.noMissRuns||0)+1;
  if (pacifistNow) Stats.pacifistRuns=(Stats.pacifistRuns||0)+1;
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
  // Caravan (05.09.2026): своей медали-иконки нет — новая медаль это визуал, а по правилу
  // проекта визуал идёт только через макет. Рекорд объявляется текстовой плашкой
  // ниже (recChips), как уже сделано для Спидрана, а не золотой медалью с иконкой.
  if (isRecord && S.mode!=='caravan' && S.mode!=='relay') medals.push(medalHTML(mode==='gyro'?'gyro':(mode==='keys'?'keys':'touch'), 0)); // 06.09.2026: Эстафета — своя изолированная категория, та же логика, что уже исключает Caravan из медали по способу управления
  if (isDistRecord) medals.push(medalHTML('dist', medals.length*80));
  setHTML('recordMedals', medals.join(''));

  // остальные особые моменты — золотые плашки в ряд с иконками категорий (не строки текста)
  const recChips=[];
  if (S.mode==='speedrun' && S.srWin) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('timer')+(srNewBest?L.srNewBest:L.srFinish)+' '+fmtTime(S.time)+'</span>');
  if (S.mode==='slalom'){ // 06.09.2026: победа — время финиша (как Спидран), срыв — отдельная плашка, без времени (нечестно сравнивать недоезд)
    if (S.slalomWin) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('timer')+(slalomNewBest?L.slalomNewBest:L.slalomFinish)+' '+fmtTime(S.time)+'</span>');
    else if (S.slalomFail) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('x')+L.slalomDQ+'</span>');
  }
  if (S.mode==='biathlon' && S.biathlonWin) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('timer')+(biathlonNewBest?L.biathlonNewBest:L.biathlonFinish)+' '+fmtTime(S.time)+(S.biathlonMisses?' ('+L.biathlonMisses(S.biathlonMisses)+')':'')+'</span>');
  if (S.mode==='relay'){ // 06.09.2026: сдал — плашка с номером этапа (сеть решает, дошла ли она — см. дальше в этой функции), сорвался — плашка без сети, как slalomDQ
    if (S.relayLegDone) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('plane')+L.relayLegSent(S.relayLeg)+'</span>');
    else recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('x')+L.relayFail+'</span>');
  }
  if (S.mode==='caravan' && isRecord) recChips.push('<span class="recChip rise" style="animation-delay:0ms">'+ic('target')+L.caravanNewBest+'</span>'); // 05.09.2026: текстовый рекорд вместо новой медали-иконки
  if (S.mode==='daily' && sc>0){ // рекорд трассы дня (v1.47.0): свой день — свой рекорд; v1.93: зачёт — в день взлёта, даже через полночь
    const dd=S.dailyDay||trackDayKey();
    const prevDl=Store.get('dailyBest',null), prevDlSc=(prevDl && prevDl.d===dd)?prevDl.s:0;
    if (sc>prevDlSc){ Store.set('dailyBest',{d:dd,s:sc});
      if (rec.length>=20 && typeof ghostSave==='function') ghostSave('daily'); // 17.09.2026: своей ветки не было вообще — карточка дня не могла нарисовать след ни разу, тем же приёмом, что и у Спидрана/Слалома/Биатлона 15.09.2026
      recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('plane')+L.dlNewBest+'</span>'); }
    else if (rec.length>=20) ghostSaveIfFirstEver('daily'); // 18.09.2026: та же добавка — сегодняшнее число не рекорд дня, но линия для «Неба месяца» может быть ещё пустой
  }
  // 07.09.2026: 1CC убран из игры (владелец: 2 попытки в реальный день на общий месячный сид
  // убивали саму идею «одного шанса», ради которой аркадный 1CC существует) — daily1ccBest
  // больше нигде не читается и не пишется, старое значение в Store просто лежит без дела.
  if (S.mode==='daily'||S.mode==='relay'){ runMode='classic'; } // 23.08.2026 «5 попыток»: счётчик уже увеличен на взлёте (dailyBest уже обновлён выше) — здесь только режим возвращается к classic; 06.09.2026: + Эстафета — «Ещё раз» после этапа улетает в обычный полёт, новую цепочку/этап игрок выбирает заново через кнопку режима; 07.09.2026: 1CC убран; 07.09.2026: 100% удалён
  if (noMissNow) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('checkbadge')+L.noMiss+'</span>');
  if (pacifistNow) recChips.push('<span class="recChip rise" style="animation-delay:'+(recChips.length*60)+'ms">'+ic('shield')+L.pacifist+'</span>');
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
  // призрак рекорда — в топ: трек + мой скин (все живые категории — v1.280.0; шеринг включён; тихо, как таблица)
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
/* 23.09.2026 (аудит видимости ошибок, владелец: «нужно это всё исправлять»): тот же приём,
   что уже 12.08.2026 вылечил молчаливую потерю призрачного следа (ghostUpload выше, «30 из 35
   рекордов без ленты») — syncDailySubmit/syncSpeedrunSubmit/syncSlalomSubmit/syncBiathlonSubmit
   честно возвращают true/false (sync.js), но вызывались голыми выражениями ниже, без единого
   .then — неудачная отправка означала, что реально пройденный забег просто не появлялся в
   таблице, без единого сигнала кому бы то ни было. Один маленький хелпер вместо четырёх копий
   одного и того же .then(ok=>{...}). */
function submitFailSignal(kind, ok){
  if (ok) return;
  if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal(kind+'_fail');
}
  /* 10.09.2026 (владелец: «так у всех почти» — большинство рекордов, включая давние
     собственные владельца, без ленты вообще). Найдено живой проверкой базы: cosmogram-sync
     после upsert честно перечитывает scores и возвращает accepted[cat]/accepted.dist —
     РЕАЛЬНОЕ число, что легло в базу после её же округления/потолков (CAPS, score_strict).
     Здесь же в ghostUpload раньше слался локально посчитанный sc/distM — тот же забег, но
     не всегда то же число. cosmogram-sync/ghost_up отклоняет ленту 403'unverified', если
     best>cur.best (защита от подделки) — малейшее расхождение клиента с сервером и лента
     молча не сохранялась НАВСЕГДА для этого рекорда, до следующего личного лучшего. Правило
     починки то же, что и у cosmogram-workshop/daily/relay сегодня: не гадать число, а взять
     то, что реально подтвердил сервер — afterSubmit уже резолвится телом ответа (sync.js:303,
     r.json()), просто раньше никто не читал res, только сам факт «долетело». */
  if (isRecord && trackForGhost)
    afterSubmit.then(res=>ghostUpload(cat, trackForGhost, ghSkin, (res&&res.accepted&&res.accepted[cat]!=null)?res.accepted[cat]:sc, ghSeed));
  // v1.280.0 «Хартия»: дистанция — тоже честная категория с призраком, отдельно от того, каким способом её пролетели
  if (isDistRecord && trackForGhost)
    afterSubmit.then(res=>ghostUpload('dist', trackForGhost, ghSkin, (res&&res.accepted&&res.accepted.dist!=null)?res.accepted.dist:distM, ghSeed));
  // v1.100.1 «Трибуна чемпиона»: прыжок дня уходит в зал — результат всегда, лента (коридорные координаты) едет тоже всегда
  // (22.08.2026: скрыть её больше нельзя — тот же принцип «улика, не украшение», что и у обычных призраков)
  if (S.mode==='daily' && sc>0 && !S.wasRestored && rec.length>=20 && // v1.282.20: восстановленный прыжок дня в зал не идёт
    typeof syncDailySubmit==='function' && typeof ghostPackDaily==='function')
    syncDailySubmit({ day:S.dailyDay||trackDayKey(), score:sc, skin:S.skin, star:!!S.goldStar,
      time_sec:Math.round(S.time), // 14.09.2026 (аудит «борьба с читерами», находка 1.2): тот же
      // приём, что уже есть у Спидрана/Слалома/Биатлона строками ниже — раньше «Трасса дня»
      // была единственной дисциплиной без времени в паспорте, сервер не мог проверить правдоподобие
      dist:distM, // 14.09.2026 (находка 1.3): звезда дня стоит на фиксированной метке GOLD_DIST=1800м
      // (js/goldstar.js) — заявка star:true при малой пройденной дистанции физически невозможна,
      // сервер теперь может её отбить, не веря голому булеву флагу
      track: ghostPackDaily() }).then(ok=>submitFailSignal('daily',ok)); // 23.09.2026: было голым вызовом без .then — см. комментарий у submitFailSignal
  // 03.09.2026 «Спидран получает свою таблицу»: тот же приём, что у Трассы дня — только
  // реально добежавший до цели (srWin), не восстановленный забег (часы начались бы с нуля).
  if (S.mode==='speedrun' && S.srWin && !S.wasRestored && rec.length>=20 &&
    typeof syncSpeedrunSubmit==='function' && typeof ghostPackDaily==='function')
    syncSpeedrunSubmit({ day:(S.speedrunRSG?SPEEDRUN_RSG_DAY:SPEEDRUN_ETERNAL_DAY), time_sec:S.time, skin:S.skin, // 03.09.2026 «Set Seed» / 11.09.2026 «RSG»: свой постоянный ключ на каждый вариант, одна и та же таблица
      track: ghostPackDaily() }).then(ok=>submitFailSignal('speedrun',ok));
  // 06.09.2026 «Слалом»: тот же приём, что у Спидрана — только настоящая победа (slalomWin), не срыв
  if (S.mode==='slalom' && S.slalomWin && !S.wasRestored && rec.length>=20 &&
    typeof syncSlalomSubmit==='function' && typeof ghostPackDaily==='function')
    syncSlalomSubmit({ day:SLALOM_ETERNAL_DAY, time_sec:S.time, skin:S.skin,
      track: ghostPackDaily() }).then(ok=>submitFailSignal('slalom',ok));
  // 06.09.2026 «Биатлон»: тот же приём — S.time на этот момент уже несёт штрафы за промахи
  if (S.mode==='biathlon' && S.biathlonWin && !S.wasRestored && rec.length>=20 &&
    typeof syncBiathlonSubmit==='function' && typeof ghostPackDaily==='function')
    syncBiathlonSubmit({ day:BIATHLON_ETERNAL_DAY, time_sec:S.time, skin:S.skin,
      track: ghostPackDaily() }).then(ok=>submitFailSignal('biathlon',ok));
  /* 06.09.2026 «Эстафета»: сдача этапа — только настоящая (relayLegDone), сорванный этап
     на сервер вообще не идёт (владелец: «цепочка остаётся открытой на том же этапе, ничего
     не пишем») — relayLegDone уже гарантирует это условие, отдельная проверка тут не нужна.
     chain_id хранится в S с момента входа (relayEnterFromChain) — без него отправлять некуда. */
  if (S.mode==='relay' && S.relayLegDone && S.relayChainId && rec.length>=20 &&
    typeof syncRelaySubmitLeg==='function' && typeof ghostPackDaily==='function'){
    const relayLegAtSubmit=S.relayLeg;
    syncRelaySubmitLeg({ chain_id:S.relayChainId, leg:relayLegAtSubmit, track: ghostPackDaily(),
      time_sec:Math.round(S.time), score_end:sc, lives_end:S.lives, skin:S.skin
    }).then(d=>{ if (d && d.ok) toast(d.done?L.relayChainDone:L.relayLegSent(relayLegAtSubmit),'rgba(150,255,190,.5)'); });
  }
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
  // 15.09.2026 (владелец): «если у человека нет гироскопа зачем ему такая кнопка» — та же честная
  // проверка, что уже отвечает за сам оффер гироскопа (gyro.js), не факт API (HAS_GYRO один
  // всегда true даже на ноутбуке без датчика).
  const hasGyro=(typeof gyroSensorThere==='function')?gyroSensorThere():HAS_GYRO;
  setHTML('stats',
    '<div class="bestLbl rise" style="animation-delay:120ms">'+L.bestByControl+'</div>'+
    '<div class="bestPills rise" style="animation-delay:200ms">'+
      (hasGyro?bestPill('phone',saneNumber(Store.get('bestGyro',0),0)):'')+
      bestPill('hand',saneNumber(Store.get('bestTouch',0),0))+
      bestPill('keys',saneNumber(Store.get('bestKeys',0),0))+
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
  // 12.09.2026: оффер «Полёт без рук» — экран итогов, не середина полёта, см. js/gyro.js
  if (typeof gyroOverOfferDue==='function' && gyroOverOfferDue()) gyroOverOfferShow();
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
         счётчиком n>=5 (heroCarouselFill), но bootFly() эту дверь обходил: при следующем
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
  /* 18.09.2026 (владелец, версии на двух телефонах разошлись на пять правок из-за долгой
     вкладки без перезагрузки — index.html, controllerchange) — здесь ВСЁ уже безопасно
     свёрнуто (S.running=false выше, попытка дня не потеряна): если пока игрок летал,
     подъехала новая версия, применяем её именно сейчас, а не посреди управления самолётом. */
  if (typeof swReloadPending!=='undefined' && swReloadPending && typeof swApplyReload==='function') swApplyReload();
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
  // 13.09.2026 «Честный долёт после разрыва сессии» (владелец, баг 1): workshopPlayingCode
  // (js/forge.js) — обычная переменная модуля, не переживала перезапуск сама по себе, хотя
  // S.mode/forgeCfg восстанавливались честно. Долетал до конца код Мастерской, экран итогов
  // показывал трофей, а mapOver() не знал, какой код зачесть — лайк оставался заблокирован
  // навсегда. Теперь код едет тем же снимком, что и остальной забег.
  if(saved && saved.wpc) workshopPlayingCode = saved.wpc;
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
  if (typeof galleryBtnRefresh==='function') galleryBtnRefresh(); // 16.09.2026 «Галерея видео-рекордов»: дверь появляется/число обновляется, если есть хоть одно видео
  if (typeof heroRecordBadgesFill==='function') heroRecordBadgesFill(); // 15.09.2026: только что мог появиться новый рекорд — бейджи карусели догоняют его сразу, не ждут смены языка
  if (typeof heroTrailsFill==='function') heroTrailsFill(); // 15.09.2026: только что мог появиться новый рекорд — линия траектории догоняет его тут же; 16.09.2026: заодно гасит текстовую подсказку .playHint, если след теперь есть
  if (typeof zondTick==='function') zondTick(); // 25.09.2026: Зонд — один эпизод на первый визит совсем нового игрока, см. комментарий у самих функций
}
function autosave(){
  /* v1.282.14: занавес смерти не сохраняем. pauseGame честно отказывается работать при
     S.dying, но onHidden зовёт autosave() отдельной строкой, мимо этого стража. Игрок,
     свернувший приложение в те 0.9с, пока идёт занавес последней жизни, получал записанный
     забег с lives=0 → при восстановлении clamp поднимал их до 1, и смерть просто не
     случалась: ни статистики, ни submit, а счёт целиком на месте. Детерминированный обход. */
  if(S.running && runMode!=='theater' && runMode!=='relay' && !S.dying && S.lives>0){ // v1.94.0: театр не оставляет автосейва — из просмотра не рождается «второй шанс»; 06.09.2026: Эстафета туда же — chain_id/seed/лента предыдущего этапа живут вне S (relayChainId и т.п. не входят в этот снимок), восстановление без них пересеяло бы трассу мусорным ключом (undefined·relay·N) и потеряло бы возможность сдать этап; честнее считать закрытое приложение сорванным этапом — цепочка просто ждёт снова, как и от столкновения
    /* v1.282.20: в автосейв кладём и то, что раньше терялось. Прежде восстанавливались
       только счёт/волна/жизни/дистанция/звёзды — а плавность, часы полёта и паспорт
       начинались с чистого листа. Это был готовый приём: перед неизбежным ударом закрыть
       мини-апп и открыть заново — счёт целиком на месте, множитель плавности с 0.75
       подскакивает до 1.0 (+33% к итогу), часы Спидрана обнуляются (рекорд «за 10 секунд»),
       благодать выдаётся заново. Флаг wasRestored помечает такой забег: рекорд Спидрана и
       знак дня он больше не приносит. */
    Store.set('savedRun',{score:S.score,mission:S.mission,lives:S.lives,dist:S.dist,
      smooth:S.smooth,time:S.time,hits:S.hits,bonuses:S.bonuses,goldStar:!!S.goldStar,restored:1,
      starsCollected:S.starsCollected,comboMax:S.comboMax,hueShift:S.hueShift,mode:S.mode,dailyDay:S.dailyDay||'',
      wpc:workshopPlayingCode||''}); // v1.93: крах дня помнит дисциплину и день взлёта; 13.09.2026: и код Мастерской — иначе честный долёт после разрыва сессии не засчитывался (баг 1, владелец)
  }
}

/* ---------- Настройки (звук, язык, гироскоп, помощь) ---------- */
let settingsFrom='menu'; // куда вернуться: меню или пауза
let langPref='auto';
function openSettings(from){ settingsFrom=from||'menu'; refreshGyroLock(); rowSw('setBeaconBtn', Store.get('beaconOn',1)===1); againLabel(); setScreen('settings'); gyroStatus(); setWellFill(); sfx.click();
  /* 06.09.2026, найдено попутно: contrastLabel()/colorblindLabel() нигде не звались при
     открытии экрана — тумблеры «Высокий контраст»/«Для дальтоников» всегда рисовались
     выключенными на свежий вход, даже если фильтр реально активен со прошлой сессии
     (сам CONTRAST/COLORBLIND читается верно, canvasFilterSync() применяет фильтр к
     канвасу — расходился только вид строки). calmFxLabel() — новый тумблер, тот же приём. */
  contrastLabel(); colorblindLabel(); calmFxLabel(); textScaleLabel(); keyBindAllLabels(); // 09.09.2026: тот же приём для «Размера текста»/переназначения клавиш
} // v1.91.0: шёпот самочувствия — свежий при каждом входе // v1.45.0: замок гироскопа — свежий при каждом входе; v1.66.1: диагностика датчика — свежая при входе (в полёте она в DOM не пишется); v1.107.0: и выключатель почты — честный при входе
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
  // 05.09.2026: morseOn() убран из счёта — это больше не тумблер Настроек, а выбор Следа (Тюнинг); было 5, стало 4
  const onN=(typeof MUTED!=='undefined'&&!MUTED?1:0)+(typeof MUSIC_ON!=='undefined'&&MUSIC_ON?1:0)+(typeof VIBRO!=='undefined'&&VIBRO?1:0)
    +((typeof morseHapOn==='function'&&morseHapOn())?1:0);
  put('setGrpSoundSub', onN===4?L.setWellAll:(onN===0?L.setWellNone:L.setWellSome));
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

/* 09.09.2026 «Явление → корпус» (владелец, макет-артефакт d5c119ac, часть рекламной подачи):
   у премиум-скинов с узором (PREM_FX_MAP, физика/культура/материалы) окно предпросмотра сперва
   показывает сам узор крупно и без обрезки силуэтом — «явление», как самостоятельная красота —
   и только потом, кинематографичным переходом (не рывком), узор садится на корпус, как обычно.
   Один раз на каждую смену скина, не бесконечный цикл (макет специально зациклен только ради
   показа). Тайминги и кривая — дословно из макета: 3.2с явление, 1.4с переход. */
let angarPvFxKey=null, angarPvFxStart=0;
const ANGAR_FX_EVENT=3200, ANGAR_FX_TRANS=1400; // мс — макет владельца, не мной придуманные числа
/* 09.09.2026, владелец (второй заход, живой макет): 1.35 было «чуть крупнее», а нужно
   «на весь экран, как отдаление камеры» — явление начинается огромным, самолёт проступает
   под ним, пока оба не сойдутся в одной точке «без склейки». Большое число, не 1.35. */
const ANGAR_FX_BIG=4.2; // во сколько раз явление крупнее, чем осевший на корпус узор
function angarPvFxEase(p){ return p<0.4 ? Math.pow(p/0.4,2)*0.4 : 0.4+(1-Math.pow(1-(p-0.4)/0.6,3))*0.6; } // «кинематографичная» кривая макета: мягкий разгон, ещё более протяжное торможение
function angarPvFxPhase(key){
  if(key!==angarPvFxKey){ angarPvFxKey=key; angarPvFxStart=performance.now(); }
  const t=performance.now()-angarPvFxStart;
  if(t<ANGAR_FX_EVENT) return {phase:'event', t, tt:0};
  if(t<ANGAR_FX_EVENT+ANGAR_FX_TRANS) return {phase:'trans', t, tt:angarPvFxEase((t-ANGAR_FX_EVENT)/ANGAR_FX_TRANS)};
  return {phase:'hold', t, tt:1};
}
/* «Рэк-фокус»: между двумя резкими точками (явление само по себе → явление на корпусе)
   объектив у операторов проходит через мягкий, не в фокусе кадр — щелчок без этого читался бы
   как склейка, не как непрерывный кадр (тот же принцип, что уже применён к кривой перехода).
   blur() в canvas — в текущих (уже отмасштабированных) единицах контекста, поэтому берём
   реальный масштаб через getTransform(), а не гадаем пиксель под конкретный DPR/размер превью. */
function angarPvFxBlurPx(x, realPx){
  if(realPx<=0) return 0;
  const m=x.getTransform ? x.getTransform() : null;
  const sc=m ? Math.hypot(m.a,m.b) : 1;
  return sc>0 ? realPx/sc : 0;
}
/* 09.09.2026, владелец: «для каждого скина» — у однотонных (без sk.fx) нет узора, который
   можно показать крупно, поэтому явление — это их же цвет (sk.trail/sk.glow), большим
   пульсирующим сиянием, оседающим в обычную ауру. Мягкий радиальный градиент сам гаснет
   к краям — диафрагма (жёсткий край) ему не нужна и не идёт, в отличие от геометричных
   узоров, поэтому angarPvFxReveal ниже зовёт её только когда узор настоящий (fxFn задан). */
function angarPvFxPlainGlow(x, sk, pvNow){
  const pulse=0.85+0.15*Math.sin(pvNow/420);
  const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
  const g=x.createRadialGradient(0,-4,0,0,-4,20);
  g.addColorStop(0, base+(0.5*pulse).toFixed(2)+')'); g.addColorStop(.55, base+(0.2*pulse).toFixed(2)+')'); g.addColorStop(1, base+'0)');
  x.save(); x.globalCompositeOperation='lighter';
  x.fillStyle=g; x.beginPath(); x.arc(0,-4,20,0,6.283); x.fill();
  const g2=x.createRadialGradient(0,10,0,0,10,13);
  g2.addColorStop(0, sk.trail+(0.55*pulse).toFixed(2)+')'); g2.addColorStop(1, sk.trail+'0)');
  x.fillStyle=g2; x.beginPath(); x.arc(0,10,13,0,6.283); x.fill();
  x.restore();
}
function angarPvFxReveal(x, sk, pvNow, phase, tt, fxFn){
  const scale = phase==='event' ? ANGAR_FX_BIG : 1+(ANGAR_FX_BIG-1)*(1-tt);
  const sinceStart = pvNow - angarPvFxStart;
  const blurReal = phase==='event'
    ? Math.max(0, 1-Math.min(1,sinceStart/300))*2.4   // явление «наводится на резкость» первые 300мс — не выскакивает готовым
    : Math.sin(tt*Math.PI)*2.6;                          // рэк-фокус: мягко на середине перехода, резко на обоих концах
  x.save();
  /* 09.09.2026, владелец («картинка вверх съехала», листая скины): почти все узоры сами
     сдвигают себя на translate(0,-4) — якорь к зрительному центру корпуса (clipShipBody
     занимает y:-22..14, центр около -4), это верно на «осевшем» виде (scale=1). Но во время
     «явления» узор ещё и увеличен в scale раз (до ANGAR_FX_BIG=4.2×) — тот же -4 внутри
     увеличенного масштаба даёт на экране -4×scale, то есть при 4.2× улетает почти в 4 раза
     выше, чем должен. Компенсация здесь, ОДИН раз для всех узоров, а не в каждой из 44
     функций: сдвигаем на -4×(1-scale) ДО масштабирования — при scale=1 (осело) поправка равна
     нулю, при scale=4.2 сдвигает вниз ровно настолько, чтобы после умножения на scale узор
     снова лёг на тот же -4, что и в осевшем виде. */
  x.translate(0, -4*(1-scale));
  x.scale(scale,scale);
  const blurPx=angarPvFxBlurPx(x, blurReal);
  if(blurPx>0.04) x.filter='blur('+blurPx.toFixed(2)+'px)';
  if(fxFn){
    /* 09.09.2026, владелец, живой макет: плоский тёмный прямоугольник поверх «лишнего» узора
       не совпадал цветом с настоящим небом витрины — на подходе к посадке читался как чёрное
       пятно. Убран.
       09.09.2026, второй заход (владелец: «идеальный ли match cut?», проверено покадрово
       заморозкой performance.now — на границе явление→переход настоящий clipShipBody(),
       включённый ОДНИМ кадром, реально обрубал узор по силуэту сразу и заметно: секунду назад
       зритель видел узор БЕЗ обрезки вообще, тут — резкий срез, это и есть шов. Диафрагма
       (та же форма силуэта, но заведомо шире — IRIS_SAFETY) закрывается ПОСТЕПЕННО вместе со
       сжатием узора, а не одним кадром на границе фаз; к моменту tt=1 совпадает с настоящим
       clipShipBody координата в координату — дальше («осело») использует его уже напрямую,
       без диафрагмы, шва между «переходом» и «осевшим» тоже нет. */
    const _clip=clipShipBody;
    if(phase==='trans'){
      const IRIS_SAFETY=2.3; // запас, чтобы в начале перехода диафрагма заведомо шире любого узора — проверено вживую на диске (нужно было ≥1.46×)
      const irisK=1+(IRIS_SAFETY-1)*(1-tt);
      x.scale(irisK,irisK); _clip(x); x.scale(1/irisK,1/irisK);
    }
    clipShipBody=function(){}; // либо диафрагма выше, либо (на «явлении») вообще без обрезки — внутренний вызов не должен резать по новой
    fxFn(x, sk, pvNow);
    clipShipBody=_clip;
  } else {
    angarPvFxPlainGlow(x, sk, pvNow);
  }
  x.filter='none';
  if(phase==='trans' && tt>0.82){ // короткая вспышка-блик в момент, когда узор «защёлкивается» на корпусе
    const a=(tt-0.82)/0.18;
    x.save(); x.globalCompositeOperation='lighter';
    const g=x.createRadialGradient(0,-4,0,0,-4,26);
    g.addColorStop(0, sk.trail+(0.55*(1-a)*a*4).toFixed(2)+')'); g.addColorStop(1, sk.trail+'0)');
    x.fillStyle=g; x.beginPath(); x.arc(0,-4,26,0,6.283); x.fill();
    x.restore();
  }
  x.restore();
}
/* Один рисунок корабля на все места ангара: и в жетоне, и в большом небе.
   Форма — та же, что в полёте (render.js drawPlane): нос, крылья, складка. */
function angarShip(x, sk, s, bolshoy){
  x.save(); x.scale(s,s);
  /* 09.09.2026 «Явление → корпус»: пока узор показывается сам по себе («явление»), самого
     самолётика ещё не видно вообще — ни ауры, ни корпуса, ни кромки; во время перехода он
     проступает вместе с узором (hullAlpha=tt), на осевшем виде всё как раньше (1, без изменений). */
  /* 09.09.2026, владелец: «это для каждого скина нужно сделать» — не только для узорных
     (PREM_FX_MAP). Однотонным (без sk.fx вообще) явление — большое пульсирующее свечение
     их же цвета (angarPvFxPlainGlow), оседающее в обычную ауру. Исключение — «Бумажный»
     (id0, владелец явно попросил кроме него): дефолтный старт-скин, без явления, сразу корпус. */
  /* 11.09.2026 (владелец, живой скрин «Коллекция»/«След»: «всё сразу отображается и вспышка
     и след и явления скина... одно другому мешает, они не должны все сразу работать в одном
     окне») — явление/узор скина, вспышка (правка 29.08.2026) и след (правка 10.09.2026)
     добавлялись в это окно по отдельности, каждый раз по отдельной просьбе — вместе они
     конкурируют за один и тот же маленький борт. Теперь каждый показывается только на СВОЕЙ
     вкладке (angarCat), не на всех сразу — тот же принцип применён к вспышке/следу выше. */
  // 26.09.2026: id0 сохраняет старое исключение («без явления, сразу корпус») даже теперь,
  // когда у него есть sk.fx — «крупное явление без обрезки силуэтом» задумано для только что
  // открытых премиум-скинов, для базового это неуместно. Мерцание «Лунного камня» рисуется
  // отдельным блоком ниже, всегда, обрезанное силуэтом, без общей системы явлений.
  const angarFxFn = bolshoy && angarCat==='color' && sk.fx && sk.id!==0 && typeof PREM_FX_MAP!=='undefined' ? PREM_FX_MAP[sk.fx] : null;
  const fxEntry = bolshoy && angarCat==='color' && (angarFxFn || (!sk.fx && sk.id!==0));
  const fxState = fxEntry ? angarPvFxPhase(sk.id) : null;
  const hullAlpha = fxState ? (fxState.phase==='event' ? 0 : fxState.tt) : 1;
  if(bolshoy && hullAlpha>0){ // в небе борт светится так же, как в полёте: аура кормы и аура корпуса
    x.globalAlpha=hullAlpha;
    const g=x.createRadialGradient(0,16,1,0,16,20);
    g.addColorStop(0,sk.trail+'.5)'); g.addColorStop(.5,sk.trail+'.2)'); g.addColorStop(1,sk.trail+'0)');
    x.globalCompositeOperation='lighter'; x.fillStyle=g; x.fillRect(-20,-4,40,40);
    x.globalCompositeOperation='source-over';
    const gg=x.createRadialGradient(0,-4,2,0,-4,32);
    const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
    gg.addColorStop(0,base+'.40)'); gg.addColorStop(.55,base+'.14)'); gg.addColorStop(1,base+'0)');
    x.fillStyle=gg; x.fillRect(-32,-36,64,64);
    x.globalAlpha=1;
  }
  /* 29.08.2026 «показывать Вспышку тоже»: раньше окно предпросмотра вообще не знало о
     вспышке — её было видно только первые 0.45с настоящего полёта. Здесь — тот же узор
     (renderFlashPattern, общая с полётом и с плиткой каталога), зациклен по кругу (не
     застывший кадр, как на плитке) — витрина живая, а на плитке достаточно одного кадра.
     Только на большом борту (bolshoy) — на мелких квадратиках цвета вспышке не место.
     04.09.2026 (владелец, живое устройство): рисовалась ПОСЛЕ борта — ложилась поверх
     корпуса вместо подложки под ним. Перенесена сюда, до заливки корпуса — тот же порядок,
     что теперь и в render.js:drawScene (drawLaunchFlash до drawPlane). */
  if(bolshoy && hullAlpha>0 && angarCat==='flash'){
    const pvFlash = angarSel;
    /* 07.09.2026, владелец: «Нет» (id0) явным исключением — раньше полагались на то, что
       0 сам по себе ложный в if(pvFlash) (работало и так), но владелец просил явное «для
       Нет вообще не смотрим в каталог вспышек», не полагаться на совпадение с ложным нулём. */
    if(pvFlash!==0 && pvFlash){ const fl=FLASHES_BY_ID.get(pvFlash);
      if(fl && fl.style && fl.style!=='none'){
        const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
        const col=a=>base+Math.max(0,a).toFixed(2)+')';
        const p=(performance.now()%1600)/1600;
        /* 11.09.2026, владелец (живой макет с анимацией, выбрал «над носом»): узор густых
           вспышек (Куб Метатрона/Шри-Янтра/Печать) почти не читался под корпусом — тот же
           приём, что и в render.js:drawLaunchFlash (ядро, правка по его явной просьбе):
           узор над носом + мягкое сияние вокруг. Числа здесь — НЕ те же самые: это окно
           (angarPvDraw, H=130, s=1.6) вчетверо ниже макета/полёта, «-46» там обрезал верх
           густых узоров о крышку канваса (измерено: topPx=0 живьём). Пересчитано численно
           под реальный запас этого окна (75px от центра борта до верхнего края): сдвиг -28
           (не впритык к носу) + сам узор ×0.5 — проверено на 3 самых густых, худший случай
           (Шри-Янтра) укладывается с запасом ~7px. */
        x.save(); x.globalAlpha=hullAlpha; x.translate(0,-28); x.scale(.5,.5);
        const fg=x.createRadialGradient(0,0,2,0,0,26);
        fg.addColorStop(0,base+'.30)'); fg.addColorStop(1,base+'0)');
        x.save(); x.globalCompositeOperation='lighter'; x.fillStyle=fg;
        x.beginPath(); x.arc(0,0,26,0,6.283); x.fill(); x.restore();
        renderFlashPattern(x, fl.style, p, col); x.restore();
      }
    }
  }
  /* 10.09.2026, владелец («след не отображается в окне просмотра. или и не должен?») — тот же
     пробел, что чинили у Вспышки 29.08.2026 (владелец тогда: «окно вообще не знало о вспышке»):
     след показывался только на плитке в сетке (angarBuildGrid, renderTrailPattern), в большое
     окно сверху так и не добавили следом. Тот же приём, что у вспышки чуть выше — только цепляем
     angarSel/S.trail вместо angarSel/S.launchFx, и позиция ниже корпуса (след тянется сзади). */
  if(bolshoy && hullAlpha>0 && angarCat==='trail'){
    const pvTrail = angarSel;
    if(pvTrail!==0 && pvTrail){ const tr=TRAILS_BY_ID.get(pvTrail);
      if(tr && tr.style && tr.style!=='none'){
        const base=sk.glow.slice(0,sk.glow.lastIndexOf(',')+1);
        const col=a=>base+Math.max(0,a).toFixed(2)+')';
        x.save(); x.globalAlpha=hullAlpha; x.translate(0,14); renderTrailPattern(x, tr.style, col); x.restore();
      }
    }
  }
  if(hullAlpha>0){
    x.globalAlpha=hullAlpha;
    x.fillStyle=sk.body;
    x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
    x.fillStyle=sk.fold;
    x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
    // 26.09.2026: «Лунный камень» (id0) — то же самое мерцание, что fxMatMoonstone в render.js,
    // нарисованное здесь напрямую (не через angarFxFn выше — тот путь даёт крупное «явление
    // без обрезки силуэтом», для базового скина неуместное), всегда видно, обрезано силуэтом.
    if(sk.id===0 && typeof clipShipBody==='function'){
      x.save(); clipShipBody(x);
      const mp=(performance.now()%4400)/4400;
      const mgy=-18+((mp*2)%1)*32;
      const mg=x.createLinearGradient(0,mgy-9,0,mgy+9);
      mg.addColorStop(0,'hsla(220,40%,85%,0)'); mg.addColorStop(.5,'hsla(220,45%,88%,.55)'); mg.addColorStop(1,'hsla(220,40%,85%,0)');
      x.fillStyle=mg; x.fillRect(-20,-24,40,48);
      x.restore();
    }
    x.globalAlpha=1;
  }
  /* 04.09.2026 «Эксклюзивные скины за Stars» (владелец, живое устройство — «в окне
     предпросмотра видно ноль от новых скинов»): angarShip() никогда не рисовала fx вообще
     (ни старые Неон/Хром/Плазма, ни новые) — только полёт (render.js:drawPlane) их знал.
     Тот же код, что там, только на большом борту (bolshoy) — на жетоне мелко, не разглядеть.
     drawSkinGem/FACET_PARTS/GEM_SLOTS/FIL_MARKS — общие с render.js, тот файл грузится раньше. */
  if(bolshoy && fxEntry){ // 09.09.2026: было sk.fx — плоские скины (angarFxFn нет, свой fxEntry) тоже должны сюда попасть
    /* 09.09.2026, владелец: удалены шесть мёртвых веток (Спутники/Грани/Инкрустация/Филигрань/
       Ядро/Прицел, sk.fx==='satellites'/'facets'/'inlay'/'filigree'/'core'/'aim') — ни один
       текущий скин в js/game.js такие fx не использует (убраны из каталога ещё в 799be8b
       «партия физика/культура-2 + чистка каталога», код-обработчик здесь забыли удалить
       следом). drawMightyCrystal/FACET_PARTS/GEM_SLOTS/WINGTIP_SLOTS/FIL_MARKS/CORNER_* —
       проверены: нигде больше не используются, безопасно осиротели вместе с этим кодом
       (не удалены отдельно — вне текущей задачи, drawSkinGem/drawSpearGem/metalStroke
       НЕ трогать, их использует премиум-рендерер ниже/render.js). */
    const pvNow = performance.now();
    if(fxState.phase==='hold'){ if(angarFxFn) angarFxFn(x, sk, pvNow); } // отстоялось — узорным рисуем как всегда; однотонным рисовать больше нечего, сияние+корпус уже выше
    else angarPvFxReveal(x, sk, pvNow, fxState.phase, fxState.tt, angarFxFn); // «явление»/переход — крупно, без обрезки силуэтом, с рэк-фокусом
  }
  if(bolshoy && hullAlpha>0){ // кромки крыльев — только на большом борту, в жетоне это каша
    // 02.09.2026 (владелец вживую — «над сердцем... белое пятно, выходит за корпус»):
    // блик-эллипс здесь убран. Тот же самый блик уже убирали 31.08.2026 из render.js
    // (настоящий полёт) — владелец обвёл его жёлтым как ошибку тогда же. angarShip() —
    // отдельная, скопированная функция рисования борта для витрины Ангара/Тюнинга, и
    // блик остался только в этой копии, непочищенным. Страж 149.
    x.globalAlpha=hullAlpha;
    x.strokeStyle='rgba(255,255,255,.32)'; x.lineWidth=1.1;
    x.beginPath();
    x.moveTo(0,-22); x.lineTo(-16,14); x.moveTo(0,-22); x.lineTo(16,14);
    x.moveTo(-16,14); x.lineTo(0,6); x.moveTo(0,6); x.lineTo(16,14);
    x.stroke();
    x.globalAlpha=1;
  } else if(!bolshoy) {
    x.strokeStyle='rgba(120,140,180,.5)'; x.lineWidth=1.6;
    x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.stroke();
  }
  /* 29.08.2026 «живой предпросмотр на всех вкладках» (владелец): раньше здесь всегда
     рисовался НАДЕТЫЙ декаль/иконка/вспышка, даже когда игрок листает каталог и смотрит
     на что-то другое (angarSel) — окно врало «вот как это будет выглядеть», хотя честно
     показывало вчерашний выбор. Теперь: на своей вкладке жетон, на который сейчас смотрит
     игрок (angarSel), подменяет надетый — на всех остальных вкладках показывается то, что
     реально надето, как и раньше. Тот же приём, что уже был только у Цвета. */
  // 24.09.2026: левая половина борта («Декаль на корпусе», 28.08.2026) убрана вместе со
  // всей вкладкой «Эмодзи» (владелец) — см. game.js:137. Правая половина («Иконки») убрана
  // раньше, 06.09.2026 — предпросмотр борта теперь снова просто цвет скина, как и в полёте.
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
  angarPvNameSync(); // 06.09.2026: текст под витриной — та же периодичность и то же условие, что у самой картинки
  const cv=$('angarPv'); if(!cv) return;
  /* 27.08.2026: было SKINS[S.skin] — превью показывало НАДЕТЫЙ борт, а не тот, что игрок
     только что тронул в сетке. angarBuyFill() (кнопка «Купить») рядом уже честно смотрит
     на angarSel («на какой жетон смотрит игрок», см. коммент у объявления) — жалоба
     владельца «выбираешь скин, а в окне его не видно» ровно про это рассогласование. */
  /* 28.08.2026: во вкладке «Цвет» показываем то, на что смотрит игрок (angarSel — живой
     предпросмотр ещё не купленного скина). 29.08.2026: то же самое теперь и у Декали/
     Иконок/Вспышки — angarShip() сама подменяет надетое на angarSel на своей активной
     вкладке (см. её собственный комментарий) — здесь только скин, остальное уже внутри. */
  const sk = (angarCat==='color') ? (SKINS_BY_ID.get(angarSel)||SKINS[0]) : (SKINS_BY_ID.get(S.skin)||SKINS[0]);
  const W=380, H=130, d=Math.min(window.devicePixelRatio||1, dprCap); // 27.08.2026: держим в паре с #angarSky в index.html — иначе холст растянется мимо CSS-бокса
  // 11.09.2026 (владелец, реальное устройство Samsung A3 Core): этот холст рисовал в СЫРОЕ
  // разрешение экрана (devicePixelRatio), обходя dprCap — ту же самую защиту, которой уже
  // подчиняется настоящий полёт (core.js, gfxCap). На слабом GPU это давало зависающий кадр
  // именно здесь, хотя сам полёт оставался гладким. Тот же потолок, что уже есть у игры,
  // не новое число.
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
  /* 10.09.2026 (владелец, живой скрин с кругом): «точка появляется раньше самолёта» — огонёк
     двигателя рисовался БЕЗ проверки той же фазы явления, что внутри angarShip() прячет сам
     корпус (hullAlpha=0 на «явлении», sk.fx-узор ещё сам по себе, борта не видно вообще).
     Тот же расчёт fxState/hullAlpha, что уже есть в angarShip() — повторяю здесь один раз для
     огонька, angarPvFxPhase() без побочных эффектов при повторном вызове тем же ключом (сама
     функция это гарантирует, см. её комментарий). Поднято ДО поворота ниже (было — после
     angarShip()) по той же причине, что и сам фикс покачивания: нужно знать фазу ДО поворота,
     не после. */
  const angarFxFnPv = angarCat==='color' && sk.fx && typeof PREM_FX_MAP!=='undefined' ? PREM_FX_MAP[sk.fx] : null;
  const fxEntryPv = angarCat==='color' && (angarFxFnPv || (!sk.fx && sk.id!==0));
  const fxStatePv = fxEntryPv ? angarPvFxPhase(sk.id) : null;
  const hullAlphaPv = fxStatePv ? (fxStatePv.phase==='event' ? 0 : fxStatePv.tt) : 1;
  x.save(); x.translate(W/2,H/2+10);
  /* 11.09.2026 (владелец: «самолёт должен двигаться в окне просмотра только после того, как
     явление применилось, иначе картинка с явлением тоже двигается в стороны») — покачивание
     поворачивает всю систему координат целиком, а узор явления рисуется ВНУТРИ неё (angarShip
     ниже), в той же самой повёрнутой системе. Пока явление ещё проступает (fxStatePv.phase
     'event'/'trans', борта ещё не видно — hullAlphaPv<1), узор качало вместе с несуществующим
     бортом. Стоит неподвижно, пока не осядет (phase==='hold') — тот же смысл, что и у самого
     hullAlpha, только для поворота, а не прозрачности. */
  const swayOk = !fxStatePv || fxStatePv.phase==='hold';
  x.rotate(swayOk ? (RM?0.06:Math.sin(t/1400)*0.10) : 0); // борт покачивается — под бережным небом стоит ровно, во время явления тоже стоит ровно
  angarShip(x, sk, 1.6, true);
  // огонёк двигателя — живой только когда живо всё превью, и только вместе с корпусом, не раньше
  if(hullAlphaPv>0){
    x.globalAlpha = hullAlphaPv*(RM?.85:(.6+.4*Math.sin(t/70)));
    x.fillStyle=sk.trail+'.95)';
    x.beginPath(); x.arc(0,11*1.6,3.0*1.6,0,6.283); x.fill();
    x.globalAlpha=1;
  }
  x.restore();
  ANGAR_PV.kadrov++;
}
/* 06.09.2026 «Полное имя у витрины»: та же логика «на что сейчас смотрит игрок», что уже
   есть у самой картинки витрины (angarSel на активной вкладке) — только текст, не рисунок.
   Кэш последнего (cat,sel) — не пишем в DOM 30 раз в секунду впустую, angarPvDraw() зовёт
   это на каждом кадре, но реального обновления текста в 99% кадров не требуется. */
let angarPvNameLast=null;
function angarPvNameSync(){
  const key=angarCat+':'+angarSel;
  if(key===angarPvNameLast) return;
  angarPvNameLast=key;
  const el=$('angarPvName'); if(!el) return;
  const cfg=ANGAR_CATS[angarCat];
  const item=cfg && cfg.list.find(d=>d.id===angarSel);
  // 08.09.2026: имена скинов id0-14 идут числовым индексом в L.skinNames (старая схема);
  // новые темы (физика/культура) называются строкой напрямую, как уже давно делают Следы/Вспышки —
  // не расширяем хрупкий короткий массив, просто различаем по типу item.name.
  // 09.09.2026, владелец (живой скрин): подпись «НЕТ» на превью для id0 читается как
  // надпись-ошибка поверх самолётика — но ТОЛЬКО там, где id0 реально значит «нет эффекта»
  // (Эмодзи/След/Вспышка). У category==='color' id0 — это «Бумажный», настоящее имя скина,
  // не плейсхолдер отсутствия — тот самый «один id, разный смысл в разных местах»
  // (feedback_shared_constant_landmine), чуть не наступил на грабли второй раз, поймано
  // живым тестом обеих категорий до коммита.
  const isNonePlaceholder = item && item.id===0 && angarCat!=='color';
  el.textContent = (item && !isNonePlaceholder) ? skinI18nName(item, angarCat) : '';
}

/* «Умное живое»: 30 кадров в секунду вместо 60, засыпает через 20 секунд без касания.
   Меню не имеет права крутить второй игровой цикл: в полёте расход хотя бы оправдан игрой.
   19.09.2026 (владелец, реальные замеры на Samsung SM-A032F после сегодняшней оптимизации
   9 премиум-скинов: худший случай — 0.45мс/кадр, 2.7% бюджета кадра при 60fps): «нулевой
   ярус качества» убран из остановки — правило было от 11.09.2026, до этой оптимизации.
   Слабый ярус теперь крутится наравне со всеми, пока экран/окно реально открыты (тот же
   автосон через 20с без касания уже ограничивает расход, когда витрина не нужна). RM
   («уменьшить движение») — отдельная причина, про доступность, не про мощность устройства,
   не трогаем. */
function angarPvStart(){
  angarPvTouch = performance.now();
  if(RM){ angarPvStop(); angarPvDraw(performance.now()); return; } // один честный кадр — и тишина
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

/* 09.09.2026 «Смотреть явление крупно» (владелец, второй заход — «два меню для одного и
   того же»): раньше была отдельная кнопка-лупа на витрине (только для надетого скина) И
   старый текстовый попап #angarFactPop по ⓘ на плитке (для любого предмета, но без узора) —
   два разных входа на одну и ту же задачу. Кнопка-лупа снята, #angarFactPop снят целиком
   (angarFactOpen был его единственным вызывающим — см. git history); ⓘ на плитке теперь
   открывает ЭТО окно, с узором конкретного предмета под пальцем, не обязательно надетого.
   Открывается по любой из трёх категорий, где вообще бывает .fact (Цвет/Вспышка/След —
   у Декали фактов нет вообще, ⓘ там не появляется). «Бумажный» (id0) — единственное
   исключение, но у него и .fact нет, сюда он попасть не может. */
/* 11.09.2026 (владелец, живой скрин: «изображение за экран выходит», красным на скрине —
   и «пройдись по каждому явлению на мобильном и почини все, там почти все сломаны»):
   ×1.5 от 10.09.2026 (см. ниже) был общим на всю категорию — правильным для одних узоров,
   слишком крупным для других. Измерено ЖИВЬЁ (не на глаз): каждый предмет нарисован на
   холсте без обрезки, найден настоящий пиксельный край рисунка, посчитано отношение к
   половине сцены. Итог: 51 из 54 скинов, 29 из 29 вспышек, оба следа реально вылезали —
   ровно то, что владелец описал. Три таблицы ниже — не выдуманные числа, а измеренный
   коэффициент «на сколько уменьшить именно этот узор», чтобы он доходил до 92% половины
   сцены (запас 8%, не впритык к краю) и не дальше. Предметы, которых нет в таблице, уже
   помещались без правки — их размер не тронут.
   14.09.2026 (владелец, 4 новых скриншота «вылезает за экран»: Навахо-Ganado id77,
   Палестинская татрииз id75, Иней/дендриты id91, Лабрадорит id103) — тем же методом
   перемерены заново эти 4: id75/103 в таблице не было вообще (fallback||1, без коррекции
   совсем), id77/91 были, но недостаточные — узоры этих скинов правились уже ПОСЛЕ
   измерения 11.09.2026, коэффициент не пересчитывался. Метод сверен на 2 контрольных
   id (71, 107) — измеренное значение совпало с уже стоящим в таблице день-в-день,
   подтверждает, что методика не изменилась. Полное измерение ЖИВЬЁМ также показало, что
   почти вся остальная таблица (~46 из 57 узоров) тоже недостаточна — но это отдельная,
   гораздо более широкая задача, которую владелец решил пока не трогать (только эти 4). */
const ANGAR_PV_FIT_COLOR={58:0.767,59:0.729,62:0.772,63:0.823,64:0.627,65:0.462,66:0.776,67:0.51,68:0.338,69:0.906,70:0.723,71:0.462,72:0.458,73:0.377,74:0.493,75:0.359,76:0.417,77:0.52,78:0.417,79:0.181,80:0.59,81:0.493,82:0.431,83:0.263,84:0.365,85:0.706,86:0.36,87:0.415,88:0.357,89:0.317,90:0.88,91:0.359,92:0.591,93:0.348,94:0.444,95:0.888,96:0.417,97:0.49,98:0.49,99:0.49,100:0.49,101:0.49,102:0.358,103:0.171,104:0.271,105:0.271,106:0.602,107:0.54,108:0.444,109:0.357,110:0.271,111:0.3,112:0.315,
  /* 26.09.2026: id113-210 (~98 карточек, несколько заходов добавления скинов) — ни один не
     проходил через этот стол вообще, седьмой случай «новое не подключено везде»
     (feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md). Первая попытка чисел
     (спрятана в истории коммитов) оказалась НЕВЕРНОЙ по методу — bbox мерился на реальном
     холсте angarPvZoomCv, а холст сам ОБРЕЗАЕТ переполнение по границе: значение spanX≈0.99
     означало «хоть немного не влезает», не «насколько именно» — 0.808 от такого измерения почти
     не давало эффекта, владелец поймал живьём. Исправлено: узор рисуется в офскрин-холст с
     запасом ×6 (bigW=W*6), БЕЗ обрезки вообще (clipShipBody временно no-op, тот же приём, что и
     сам angarPvFxReveal использует на фазе 'event') — так измеряется НАСТОЯЩИЙ размер, не
     прижатый к границе. fit=min(1,0.8/max(trueSpanX,trueSpanY)), проверено обратным
     прогоном — с новыми числами trueSpanX действительно ложится на ~0.8 (было проверено на
     id122/124/125/126/140/200/164, самых больших переполнениях). Это первое приближение по
     чистой геометрии, не финальная художественная калибровка (та требует взгляда владельца на
     устройстве, как и вся таблица выше) — если что-то визуально не понравится, поправить
     точечно, не всю таблицу заново. */
  113:0.727,114:0.684,115:0.58,116:0.86,117:0.365,118:0.364,119:0.396,120:0.491,121:0.396,122:0.277,123:0.359,124:0.293,125:0.295,126:0.294,127:0.889,128:0.588,129:0.661,131:0.816,132:0.563,133:0.784,134:0.519,135:0.825,136:0.491,137:0.44,138:0.396,139:0.364,140:0.295,141:0.494,142:0.468,143:0.556,144:0.611,145:0.396,146:0.584,147:0.354,148:0.364,149:0.645,150:0.513,151:0.523,152:0.519,153:0.43,154:0.352,155:0.435,158:0.46,160:0.734,161:0.762,162:0.455,163:0.606,164:0.449,165:0.506,166:0.879,167:0.444,168:0.62,169:0.379,170:0.792,171:0.556,172:0.455,173:0.62,174:0.792,175:0.497,176:0.479,177:0.721,178:0.58,179:0.678,180:0.909,181:0.51,182:0.541,183:0.567,184:0.53,185:0.625,186:0.708,187:0.62,188:0.602,189:0.667,190:0.755,191:0.721,192:0.63,193:0.53,194:0.63,195:0.53,196:0.708,197:0.899,199:0.69,200:0.31,201:0.833,202:0.825,203:0.964,205:0.734,206:0.833,207:0.721,210:0.851
};
const ANGAR_PV_FIT_FLASH={90:0.706,91:0.458,92:0.537,93:0.528,94:0.465,95:0.47,96:0.419,97:0.531,98:0.833,99:0.488,101:0.54,102:0.382,117:0.528,118:0.534,119:0.307,120:0.54,121:0.531,122:0.531,123:0.433,124:0.415,125:0.498,126:0.498,127:0.498,128:0.498,129:0.493,130:0.493,131:0.485,132:0.227,133:0.189};
/* 16.09.2026 «Биполярная туманность — низ обрезан ровной линией» (владелец, три скрина подряд):
   на пике «дыхания» нижняя доля перехлёстывала СТАРУЮ линию обрезки на 49px. Тогдашний фикс —
   ×0.5 (id=62), под допущением «только эта форма так делает, остальным 56 узорам доразмер
   не нужен» — и страж 232 (guardNebulaBottomLobeFitsInsideClip), который проверяет именно
   «форма не обрезается даже на пике дыхания», не «просто нет зазора» (это страж 316, другая
   проверка).
   19.09.2026, владелец попросил тоже починить (не оставлять «отдельной темой»): допущение «57
   узоров без такой формы» подтвердилось верным для ГОРИЗОНТАЛЬНОГО резерва (ANGAR_PV_FIT_COLOR,
   id=59/64/65 её не касалось), но убрал множитель ЦЕЛИКОМ (×1) — страж 316 (мой, про резерв
   плашки) зазеленел, а страж 232 (старый, про сам плоский срез — я его проверить забыл) тут
   же поймал живое наложение на 37.8px при 0.85, отросло дальше при подборе. ×0.55 — красный→
   зелёный на ОБОИХ стражах разом (232: запас 9.2px на худшем кадре цикла; 316: ни один пиксель
   в резерве плашки), не выдумано и не повтор старого готового числа. */
const ANGAR_PV_FIT_VERT={62:0.55};
/* 19.09.2026, живой замер на реальном телефоне (adb+CDP): id=59/64/65 останавливались
   заметно раньше линии обрезки (реальный зазор до плашки 32-56px, из них большая часть —
   рисунок просто не дотягивается, не резерв плашки). Первая попытка чинить через
   ANGAR_PV_FIT_VERT (общий множитель fitC, тот же стол что у id=62) поймана владельцем
   живьём как неверная с другой стороны: масштаб растит узор ВО ВСЕ стороны разом, не только
   вниз — на id=64 это тут же вытолкнуло спираль за правый край экрана (новое горизонтальное
   переполнение, та самая беда, под которую вообще измерялся ANGAR_PV_FIT_COLOR). Нужен был
   сдвиг ВНИЗ, не рост РАЗМЕРА — чистый translate в px, не scale, никак не трогает ширину.
   Общий Havail*0.12 (angarPvZoomDraw) не трогаем — тот сдвигает ВСЕ узоры разом, владелец
   поймал, что это ломает центровку мелких/симметричных (Пульсар-маяк). Здесь — точечно,
   только тем трём, кому реально не хватает, добавочным слагаемым к тому же translate. */
/* 19.09.2026, владелец напрямую: убрать добавленный сегодня же сдвиг вниз у id=65 (Flocculent) —
   мешает, не просил. Убран полностью, не подобран заново — 59/64 не трогаю, жалоба была
   конкретно про 65. */
const ANGAR_PV_ZOOM_EXTRA_DROP={59:28, 64:28};
/* 19.09.2026, вечером, седьмым заходом (владелец, живой скрин: «явление явно смещено вниз») —
   вынесено из литерала в angarPvZoomDraw() в именованную константу, чтобы страж 321 читал то
   же самое число, что и сама формула, не хранил свою копию (тот же класс ловушки, что уже
   учтён у [[feedback_shared_constant_landmine]]). Было 0.12 — компактная шапка (тот же вечер,
   ранее правка) увеличила Havail у ВСЕХ явлений разом, тот же процент стал давать больше
   пикселей в абсолюте. Уменьшено до 0.04 — измерено живьём (adb+CDP): реальное смещение центра
   рисунка от середины видимой части упало с 36-169px до 2-49px по всем 7 явлениям cosmos. */
const ANGAR_PV_ZOOM_DOWN_BIAS=0.04;
const ANGAR_PV_FIT_TRAIL={15:0.467,16:0.467};
let angarPvZoomRaf=0, angarPvZoomCat=null, angarPvZoomItem=null;
function angarPvZoomDraw(t){
  if(screenName!=='hangar'){ angarPvZoomRaf=0; return; }
  const item=angarPvZoomItem; if(!item) return;
  const cv=$('angarPvZoomCv'); if(!cv) return;
  /* 19.09.2026 (страж/живая проверка поймали): мерить от САМОГО холста нельзя — он теперь
     сам растёт (см. ниже), и getBoundingClientRect() на растущем элементе на следующем
     кадре читает уже увеличенное собственное значение → неограниченный рост каждый кадр
     (7956px за пару секунд на живом устройстве). #angarPvZoomStage — стабильный контейнер,
     его размер не зависит от абсолютно спозиционированного потомка (canvas), безопасная
     точка отсчёта. */
  const stageEl=$('angarPvZoomStage');
  const box=(stageEl||cv).getBoundingClientRect();
  /* 11.09.2026 (владелец, реальное устройство Samsung A3 Core, «зависший рисунок» именно
     здесь): этот холст рисовал в сыром devicePixelRatio, в обход dprCap — той же защиты,
     которой подчиняется настоящий полёт (core.js, gfxCap). Хуже того, эта функция вообще
     не проверяла ярус качества — крутилась бесконечно на любом устройстве, хотя у соседней
     витрины скина (angarPvStart) такая защита уже была («один честный кадр — и тишина» на
     Q.level===0/RM). Тот же приём, тот же потолок — не новое число. */
  const d=Math.min(window.devicePixelRatio||1, dprCap);
  /* 19.09.2026, ПЯТЫМ заходом (владелец, номерованная схема, квадрат [2] подтверждён явно):
     холст теперь физически выше box.height — растёт вниз на реальную, измеренную высоту
     ряда плашки/кнопок (#angarPvZoomTopRow), не выдуманное число. Там, где ряд непустой
     (сама плашка COSMOGRAM), она красится ПОЗЖЕ холста в DOM и без явного z-index закрывает
     его собой — визуально ничего не меняется. Там, где ряд был пуст (справа от плашки, когда
     кнопки поделиться/история скрыты) — раньше там просто некуда было дорисовать (холст
     физически кончался), теперь есть настоящая высота для рисунка. */
  const topRowEl=$('angarPvZoomTopRow');
  const extraH=topRowEl ? topRowEl.getBoundingClientRect().height : 0;
  const W=box.width, H=box.height+extraH;
  if(W && H){
    cv.style.height=H+'px';
    if(cv.width!==Math.round(W*d)||cv.height!==Math.round(H*d)){ cv.width=Math.round(W*d); cv.height=Math.round(H*d); }
    const x=cv.getContext('2d');
    if(x){
      x.setTransform(cv.width/W,0,0,cv.height/H,0,0);
      x.clearRect(0,0,W,H);
      const skin=SKINS_BY_ID.get(S.skin)||SKINS[0]; // цвет узора вспышки/следа — от надетого скина, как и на плитке
      const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
      const col=a=>base+Math.max(0,a).toFixed(2)+')';
      x.save();
      /* 11.09.2026 (владелец, живой скрин с кругом: «явление заходит за линию, где золотой
         язычок»): холст (Stage) шире карточки факта под ним (у неё свой отступ 18px, у Stage —
         0) — раньше ничто не мешало рисунку дотянуться до самого низа холста, а для высоких
         форм (две доли друг над другом) это ровно совпадало с линией язычка. Жёсткий clip
         снизу, ДО translate/scale ниже — тот же смысл, что уже есть у ANGAR_PV_FIT_* (держать
         рисунок в границах), только по вертикали и на реальной, измеренной высоте самого
         язычка (getBoundingClientRect), а не на подобранном числе — переживёт любую будущую
         правку размера язычка сам, без пересчёта здесь.
         19.09.2026 (владелец, три живых скрина подряд с телефона, зол: «плашка перекрывает
         явление» — Кольца Сатурна id59, Спиральная галактика id64/65): запас был всего +6px —
         живой замер (adb+CDP, реальный Android, узкий вьюпорт) подтвердил, что clip технически
         НЕ пропускает ни пикселя (getImageData — 0 внутри резерва), но рисунок реально подходит
         к самой линии на ~4px, зрительно это неотличимо от «упирается в плашку». 16.09.2026 для
         id62 чинили тем же способом, что и всегда чинили раньше — точечно, ANGAR_PV_FIT_VERT
         (см. её комментарий) — под ОДНУ форму, с явным выводом «у остальных такой формы нет,
         не нужно» — вывод оказался неверным, беда системная (резерв общий на все cat:'cosmos',
         не в форме конкретного узора дело). +6 → +26: настоящий видимый зазор, не «впритык, но
         формально не пиксель-в-пиксель». Страж 316 (cosmogram-crew) держит зазор для ВСЕХ
         cat:'cosmos' сразу, не одного id.
         19.09.2026, вторым заходом (владелец, живая стрелка на скрине: «вот тут пустое место,
         мешает»): +26 сам по себе только подвинул линию отреза выше — центр (H/2) и отступ вниз
         (H*0.12) ниже остались посчитаны от ПОЛНОЙ высоты холста H, не от того, что реально
         доступно для рисунка (H-pvReserve). Havail (= H-pvReserve) ниже заменяет H в обеих
         формулах — рисунок центруется и тянется вниз от РЕАЛЬНО доступной высоты.
         19.09.2026, третьим заходом (владелец, прямые слова: «должно доставать до плашки и
         даже чуть ниже, до таблички... не надо каждое явление растягивать, вот этому явно
         нужно, но ему что-то мешает»): +26 запаса — тоже неверный путь, тем же способом, что
         уже ловили раньше (шрink/подгонка числа вместо причины) — владелец прямо против
         искусственного растягивания И против искусственного зазора одновременно: у каждого
         узора свой естественный размер, резерв не должен решать за него, где ему остановиться.
         19.09.2026, ЧЕТВЁРТЫМ заходом (владелец, прямые слова: «где я говорил про 28? ты сам
         это выдумал»): +28px запаса — моя же выдумка, владелец её не просил и не подтверждал
         числом. Пробовал убрать резерв почти совсем (+4px) — страж 316 (красный, не на глаз)
         тут же поймал реальное наложение на пике вращения у id=64/65 (alpha 230/179 ровно на
         границе холста) — резерв технически НУЖЕН, просто не выдуманного размера. Итог того
         захода — простой прямой вырез на всю ширину, число подобрано красный→зелёный на
         стражe 316, не придумано: +4 красный (реальное наложение), +10 зелёный трижды подряд.
         19.09.2026, ПЯТЫМ заходом, той же ночью (владелец, номерованная схема с координатами —
         см. feedback_numerovannye_ramki_vmesto_slov в памяти ИИ — квадрат [2] подтверждён явно,
         «холст должен рисовать ниже, вплоть до карточки факта»): предыдущий вывод «вырез по
         форме плашки — лишнее» был про ДРУГУЮ версию того же приёма (полный клип холста, без
         реальной высоты под него) и относился к другому месту в разборе того вечера — при
         точном измерении координат оказалось ровно обратное: место справа от плашки (там, где
         кнопки поделиться/история, когда скрыты) читалось как «что-то перекрывает явление»,
         потому что холст туда физически не дотягивался (кончался на границе плашки). Реальный
         фикс — не L-образный вырез клипа, а холст СТАЛ ВЫШЕ (см. ниже, где считается H) на
         измеренную высоту ряда плашки — плашка красится позже холста в DOM и закрывает его
         собой там, где она есть, ничего дополнительно вырезать не нужно. */
      const markElPv=$('angarPvZoomMark');
      const pvReserve=10; // измерено стражем 316 (красный на +4, зелёный трижды на +10), не подобрано на глаз
      const Havail=Math.max(0,H-pvReserve);
      // 19.09.2026: пробовал вырез по форме плашки (полный клип только под её шириной, правее —
      // до самого низа холста) — владелец прямо отклонил: «эта хуйня справа от космограм не
      // надо, она лишняя», должно останавливаться ровно на одной линии по всей ширине, без
      // особого случая для правой части. Не додумываю дальше — простой прямой вырез, как просил.
      x.beginPath(); x.rect(0,0,W,Havail); x.clip();
      x.translate(W/2,Havail/2);
      // 10.09.2026, владелец («полно пустого места, явление размытое») — исследовано (design
      // principles, много пустого места ), несколькими независимыми источниками: явление —
      // главный герой кадра, должно быть крупным, не тонуть в пустоте; ×1.5 к прежнему
      // масштабу + считаем от короткой стороны экрана (min(W,H)), а не только от ширины —
      // раньше высокий портретный экран не использовался, масштаб был рассчитан под квадрат.
      const m=Math.min(W,H);
      if(angarPvZoomCat==='color'){
        /* 11.09.2026, владелец: явление доходит до карточки факта, не зависает в пустоте
           посередине; 19.09.2026: от Havail, не H — см. комментарий выше.
           19.09.2026, живой замер на реальном телефоне (adb+CDP): пробовал поднять этот общий
           множитель (0.12→0.2), чтобы крупные узоры (кольца, спирали) дотягивались дальше —
           владелец прямо поймал: сдвинуло ВСЕ явления сразу, включая мелкие/симметричные
           (Пульсар-маяк） — сломало их собственную центровку, хотя просил не «растягивать
           каждое». Откачено обратно к 0.12.
           19.09.2026, вечером, седьмым заходом (владелец, живой скрин: «явление явно смещено
           вниз») — тот же 0.12 стал давать СЛИШКОМ много в абсолюте после того, как в этой же
           сессии раньше сжали шапку (padding-top #angarPvZoomCard) — Havail вырос у всех
           разом, та же ДОЛЯ (0.12) от большего числа дала больше пикселей. Не тот же баг, что
           выше (там владелец просил БОЛЬШЕ дотянуться, тут — уже перебор) — уменьшено до 0.04,
           вынесено в ANGAR_PV_ZOOM_DOWN_BIAS (см. её комментарий) — общий множитель по-прежнему
           один на все явления, просто новое число.
           Вторая попытка (ANGAR_PV_FIT_VERT, тот же множитель что у id=62, только расти, не
           падать) — тоже поймана живьём: fitC масштабирует узор целиком, во ВСЕ стороны, не
           только вниз — на id=64 тут же вытолкнуло спираль за правый край экрана. Верный
           рычаг — чистый сдвиг вниз (translate, не scale), см. ANGAR_PV_ZOOM_EXTRA_DROP
           (выше, рядом с ANGAR_PV_FIT_VERT) — добавлен ДО scale, в тех же непомасштабленных
           px, что и Havail*0.12, поэтому не меняет размер узора, только его положение. */
        x.translate(0,Havail*ANGAR_PV_ZOOM_DOWN_BIAS+(ANGAR_PV_ZOOM_EXTRA_DROP[item.id]||0));
        const fitC=(ANGAR_PV_FIT_COLOR[item.id]||1)*(ANGAR_PV_FIT_VERT[item.id]||1);
        x.scale((m/380)*1.6*3.2*1.5*fitC,(m/380)*1.6*3.2*1.5*fitC);
        const angarFxFn=item.fx && typeof PREM_FX_MAP!=='undefined' ? PREM_FX_MAP[item.fx] : null;
        if(item.id===0){ angarShip(x, item, 1, false); } else { angarPvFxReveal(x, item, t, 'event', 0, angarFxFn); }
      } else if(angarPvZoomCat==='flash'){
        const fitF=ANGAR_PV_FIT_FLASH[item.id]||1;
        x.scale((m/380)*9*1.5*fitF,(m/380)*9*1.5*fitF);
        renderFlashPattern(x, item.style, (t/1600)%1, col);
      } else if(angarPvZoomCat==='trail'){
        x.translate(0,-Havail*0.12); // 19.09.2026: от Havail, не H — см. комментарий у ветки 'color' выше
        const fitT=ANGAR_PV_FIT_TRAIL[item.id]||1;
        x.scale((m/380)*6*1.5*fitT,(m/380)*6*1.5*fitT);
        renderTrailPattern(x, item.style, col);
      }
      x.restore();
      const nameEl=$('angarPvZoomName'), nameTxtEl=$('angarPvZoomNameTxt');
      if(nameEl && nameTxtEl){
        const rawName=skinI18nName(item, angarPvZoomCat);
        // 20.09.2026, второй заход (владелец, живой скрин: «АККРЕЦИОННЫЙ ДИСК» и «ЧЁРНОЙ ДЫРЫ» —
        // два слова на строке налезают на родную «Назад»/⌄/⋮): обычный CSS-перенос (max-width)
        // кладёт на строку столько слов, сколько влезает по ширине — у центрированного текста
        // широкая двухсловная строка выходит за безопасную зону по бокам. Ровно одно слово на
        // строке, всегда, независимо от длины имени — <br> между каждым словом, не CSS.
        nameTxtEl.innerHTML=rawName.split(' ').filter(Boolean).map(escapeHtml).join('<br>');
        // centerTitleOnHeader — та же функция, что держит любой другой заголовок игры «в одну
        // строку» с родным «Назад»/⌄/⋮ (js/ui.js). shrinkScreenTitle() НЕ подходит сюда — она
        // уменьшает шрифт ОТ крупного (28-42px, .screenTitle) ДО пола 24px, а тут шрифт и так
        // меньше пола (18px) — функция молча ничего не делает.
        centerTitleOnHeader(nameEl);
      }
      const factEl=$('angarPvZoomFact'), wrapEl=$('angarPvZoomFactWrap');
      if(factEl && wrapEl){
        const factTxt=skinI18nFact(item, angarPvZoomCat);
        if(factTxt){ factEl.textContent=factTxt; wrapEl.classList.remove('hidden'); }
        else wrapEl.classList.add('hidden');
      }
    }
  }
  /* 19.09.2026 (владелец, реальные замеры на Samsung SM-A032F после сегодняшней оптимизации
     9 премиум-скинов: худший случай — 0.45мс/кадр, 2.7% бюджета кадра при 60fps): «нулевой
     ярус качества» убран из остановки — правило от 11.09.2026 (см. ниже, тот же приём у
     angarPvStart) писалось ДО этой оптимизации. Слабый ярус крутится наравне со всеми, пока
     окно реально открыто (закрытие — angarPvZoomClose — по-прежнему честно останавливает
     цикл). RM («уменьшить движение») — отдельная причина, про доступность, не трогаем. */
  if(RM){ angarPvZoomRaf=0; return; }
  angarPvZoomRaf=requestAnimationFrame(angarPvZoomDraw);
}
/* 11.09.2026 (владелец, реальный скрин истории: «изображение потом ужас» — золотое кольцо на
   чёрном, много пустоты) — макет yavlenie-istoriya-vertikalny-kadr-11-09-2026.html, одобрено
   («Да»): «Поделиться»/«В Историю» у явления раньше писали #angarPvZoomCv «как есть» — тот
   холст свёрстан под просмотр В ИГРЕ (рядом шапка с именем, карточка факта), измерено вживую
   375×425, почти квадрат, а история в Telegram — вертикальная 9:16. Telegram добивал разницу
   чёрным (леттербокс), а внутри самого холста явление ещё и вписано в короткую сторону — два
   слоя пустоты друг на друге. Плюс отдельный баг: на слабом ярусе (Q.level===0) окно зума
   рисует один кадр и останавливается ради заряда — тот единственный кадр иногда ловил холст ДО
   того, как карточка факта заняла место, с чужой шириной. Own canvas ниже не имеет этой
   болезни вообще: свой размер, никогда не зависит от разметки окна зума. */
/* 19.09.2026, восьмым заходом (владелец: «когда делятся явлением, должна уходить вся
   карточка — рисунок, название, описание — вместе, иначе непонятно, что там отображается»).
   До этой правки узор+имя уже были (см. историю ниже), а текст-факт — единственное, что
   реально отсутствовало в шаринге, хотя в самом окне «крупно» он есть всегда. Композиция —
   та же, что в живом окне (плашка имени сверху, узор, язычок COSMOGRAM + карточка факта
   снизу), не придумана заново — узор просто ужат, чтобы осталось место снизу под текст. */
function angarPvStoryDraw(x, BW, BH, tMs){
  x.clearRect(0,0,BW,BH);
  const bg=x.createRadialGradient(BW*0.5,BH*0.35,0,BW*0.5,BH*0.35,Math.max(BW,BH)*0.8);
  bg.addColorStop(0,'#12224a'); bg.addColorStop(1,'#0a1030');
  x.fillStyle=bg; x.fillRect(0,0,BW,BH);

  // 19.09.2026, третьим заходом (владелец: «название почему-то внизу, раньше было по-другому» —
  // в живом окне «крупно» плашка имени СВЕРХУ, над рисунком; здесь была нарисована МЕЖДУ
  // рисунком и фактом — не порядок реальной карточки. Имя перенесено ДО рисунка и выше по Y,
  // рисунок сдвинут ниже, чтобы не наезжать на имя). */
  const item=angarPvZoomItem, cat=angarPvZoomCat;
  x.textAlign='center'; x.textBaseline='alphabetic';
  const name=item?skinI18nName(item,cat):'';

  // 19.09.2026, пятым заходом (владелец: «явление на название заходит» — узор физически
  // выше своей точки translate больше, чем есть места до низа плашки имени, у разных узоров
  // это по-разному, подгонять под каждый — не тот путь; владелец явно: узор ДОЛЖЕН заходить
  // ПОД плашку по Z-порядку, не должен становиться меньше). Рисунок теперь красится ПЕРВЫМ,
  // плашка имени — ПОСЛЕ (её непрозрачный фон перекрывает верхушку узора там, где они
  // пересекаются) — тот же приём слоёв, что в живом окне: плашка имени лежит поверх канвы
  // (см. комментарий у #angarPvZoomCv в index.html, 19.09.2026, про то же самое для DOM-версии).
  if(item){
    x.save();
    x.translate(BW/2, BH*0.38);
    const m=BW*0.82; // 19.09.2026: было BW — узор ужат на ~18%, тот же приём (translate, не новая формула), что уже применялся сегодня в angarPvZoomDraw
    const skin=(typeof SKINS_BY_ID!=='undefined')?(SKINS_BY_ID.get(S.skin)||SKINS[0]):null;
    const base=skin?skin.glow.slice(0,skin.glow.lastIndexOf(',')+1):'rgba(255,255,255,';
    const col=a=>base+Math.max(0,a).toFixed(2)+')';
    if(cat==='color'){
      const fitC=ANGAR_PV_FIT_COLOR[item.id]||1;
      x.scale((m/380)*1.6*3.2*1.5*fitC,(m/380)*1.6*3.2*1.5*fitC);
      const fn=item.fx && typeof PREM_FX_MAP!=='undefined' ? PREM_FX_MAP[item.fx] : null;
      if(item.id===0){ angarShip(x, item, 1, false); } else { angarPvFxReveal(x, item, tMs, 'event', 0, fn); }
    } else if(cat==='flash'){
      const fitF=ANGAR_PV_FIT_FLASH[item.id]||1;
      x.scale((m/380)*9*1.5*fitF,(m/380)*9*1.5*fitF);
      renderFlashPattern(x, item.style, (tMs/1600)%1, col);
    } else if(cat==='trail'){
      const fitT=ANGAR_PV_FIT_TRAIL[item.id]||1;
      x.scale((m/380)*6*1.5*fitT,(m/380)*6*1.5*fitT);
      renderTrailPattern(x, item.style, col);
    }
    x.restore();
  }

  x.textAlign='center'; x.textBaseline='alphabetic'; // угол/масштаб узора выше мог сбить настройки контекста
  if(name){
    /* 19.09.2026, четвёртым заходом (владелец: «название без своей оправы — в игре оно в
       своей ячейке, тут просто голый текст»): плашка — та же (градиент+золотая черта сверху),
       что #angarPvZoomName в живом окне (index.html), не рисуется тут отдельным изобретением.
       Перенос строк — тем же приёмом, что уже у карточки факта ниже (measureText+накопление). */
    const fs=Math.round(BW*0.048);
    x.font='700 '+fs+'px "Exo 2", sans-serif';
    const nmaxW=BW*0.78, nPadX=Math.round(BW*0.05), nPadY=Math.round(BW*0.035), nlh=fs*1.25;
    const nWords=name.split(' '); const nLines=[]; let nCur='';
    for(const w of nWords){ const t=nCur?nCur+' '+w:w; if(x.measureText(t).width>nmaxW && nCur){ nLines.push(nCur); nCur=w; } else nCur=t; }
    if(nCur) nLines.push(nCur);
    const plateW=BW*0.82, plateH=nPadY*2+nLines.length*nlh, plateX=BW*0.09, plateY=BH*0.10-plateH/2, pr=14;
    const pGrad=x.createLinearGradient(0,plateY,0,plateY+plateH);
    // 19.09.2026, шестым заходом (владелец, отметил кружком на скрине: тонкая голубая линия
    // узора просвечивает сквозь текст «Grand-design» — измерено, разница до 155 единиц RGB
    // в затронутых пикселях): в живом DOM #angarPvZoomName фон .95-.96 alpha безопасен — под
    // ним ничего не нарисовано, что могло бы просвечивать. Здесь плашка красится ПОВЕРХ уже
    // нарисованного узора (порядок исправлен этим же заходом сессии) — полупрозрачность даёт
    // реальную протечку цвета. Alpha=1 только в этой canvas-копии, не меняет DOM-версию.
    pGrad.addColorStop(0,'rgba(24,42,78,1)'); pGrad.addColorStop(1,'rgba(15,31,61,1)');
    x.fillStyle=pGrad; x.strokeStyle='rgba(255,255,255,.10)'; x.lineWidth=1;
    x.beginPath();
    x.moveTo(plateX+pr,plateY); x.lineTo(plateX+plateW-pr,plateY); x.arcTo(plateX+plateW,plateY,plateX+plateW,plateY+pr,pr);
    x.lineTo(plateX+plateW,plateY+plateH-pr); x.arcTo(plateX+plateW,plateY+plateH,plateX+plateW-pr,plateY+plateH,pr);
    x.lineTo(plateX+pr,plateY+plateH); x.arcTo(plateX,plateY+plateH,plateX,plateY+plateH-pr,pr);
    x.lineTo(plateX,plateY+pr); x.arcTo(plateX,plateY,plateX+pr,plateY,pr);
    x.closePath(); x.fill(); x.stroke();
    // золотая черта сверху — тот же акцент, что #angarPvZoomName:before
    const nAccGrad=x.createLinearGradient(plateX+18,0,plateX+plateW-18,0);
    nAccGrad.addColorStop(0,'rgba(219,169,60,0)'); nAccGrad.addColorStop(.2,'#dba93c');
    nAccGrad.addColorStop(.5,'#f0c040'); nAccGrad.addColorStop(.8,'#dba93c'); nAccGrad.addColorStop(1,'rgba(219,169,60,0)');
    x.fillStyle=nAccGrad;
    x.fillRect(plateX+18, plateY, plateW-36, 2);
    x.fillStyle='#f4f6fb'; x.textAlign='center'; x.textBaseline='alphabetic';
    nLines.forEach((ln,i)=>x.fillText(ln, BW/2, plateY+nPadY+fs*0.85+i*nlh, nmaxW));
  }

  // 19.09.2026, второй заход (владелец, живой скрин: «плохо прорисовывается, особенно
  // COSMOGRAM» + «карточка какая-то старая осталась»): язычок ниже чинит СВОЙ баг геометрии —
  // path строился ТРЕМЯ arcTo вперемешку с одним lineTo (нижний-правый угол по ошибке тоже
  // скруглялся, нижний-левый не замыкался как надо) — реальный CSS #angarPvZoomMark
  // (border-radius:8px 8px 0 0) круглит ТОЛЬКО верхние два угла, нижние — острые. Путь
  // переписан по стандартной схеме «4 стороны + 2 arcTo» (те же вершины, что и у корректно
  // работающей карточки факта чуть ниже), не полу-скруглённый гибрид. Карточка факта заодно
  // получила тот же линейный градиент+акцент слева, что уже стоит у #angarPvZoomFact в
  // живом окне (index.html) — раньше здесь был плоский fillStyle, отсюда «старый вид».
  const fact=skinI18nFact(item,cat);
  const cardX=BW*0.08, cardW=BW*0.84, cardY=BH*0.655, tagH=Math.round(BW*0.09), tagR=8; // 8px — реальный border-radius #angarPvZoomMark (8px 8px 0 0), не придумано
  x.font='700 '+Math.round(BW*0.032)+'px "Exo 2", sans-serif';
  x.textAlign='left';
  const tagText='COSMOGRAM', tagPad=Math.round(BW*0.03);
  const tagW=Math.round(x.measureText(tagText).width+tagPad*2);
  x.fillStyle='#dba93c';
  x.beginPath();
  x.moveTo(cardX, cardY+tagH); // низ-лево (острый угол)
  x.lineTo(cardX, cardY+tagR);
  x.arcTo(cardX, cardY, cardX+tagR, cardY, tagR); // верх-лево скруглён
  x.lineTo(cardX+tagW-tagR, cardY);
  x.arcTo(cardX+tagW, cardY, cardX+tagW, cardY+tagR, tagR); // верх-право скруглён
  x.lineTo(cardX+tagW, cardY+tagH); // низ-право (острый угол)
  x.closePath(); x.fill();
  x.fillStyle='#2c1f08'; x.textBaseline='middle';
  x.fillText(tagText, cardX+tagPad, cardY+tagH/2+1);

  if(fact){
    const boxY=cardY+tagH-2, fs2=Math.round(BW*0.036), lh=fs2*1.4, padX=Math.round(BW*0.045), padY=Math.round(BW*0.04);
    x.font='500 '+fs2+'px "Exo 2", sans-serif';
    const maxW=cardW-padX*2;
    const words=fact.split(' '); const lines=[]; let cur='';
    for(const w of words){ const t=cur?cur+' '+w:w; if(x.measureText(t).width>maxW && cur){ lines.push(cur); cur=w; } else cur=t; }
    if(cur) lines.push(cur);
    const maxLines=6; const shown=lines.slice(0,maxLines);
    if(lines.length>maxLines && shown.length){ shown[shown.length-1]=shown[shown.length-1].replace(/\s*\S*$/,'')+'…'; }
    const boxH=padY*2+shown.length*lh;
    const r2=10;
    const grad=x.createLinearGradient(0,boxY,0,boxY+boxH);
    grad.addColorStop(0,'rgba(24,42,78,.96)'); grad.addColorStop(1,'rgba(15,31,61,.95)');
    x.fillStyle=grad; x.strokeStyle='rgba(255,255,255,.10)'; x.lineWidth=1;
    x.beginPath();
    x.moveTo(cardX,boxY); x.lineTo(cardX+cardW-r2,boxY); x.arcTo(cardX+cardW,boxY,cardX+cardW,boxY+r2,r2);
    x.lineTo(cardX+cardW,boxY+boxH-r2); x.arcTo(cardX+cardW,boxY+boxH,cardX+cardW-r2,boxY+boxH,r2);
    x.lineTo(cardX+r2,boxY+boxH); x.arcTo(cardX,boxY+boxH,cardX,boxY+boxH-r2,r2);
    x.lineTo(cardX,boxY); x.closePath(); x.fill(); x.stroke();
    // золотая полоса вдоль левого края — тот же акцент, что #angarPvZoomFact:before в живом окне
    const accGrad=x.createLinearGradient(0,boxY+8,0,boxY+boxH-8);
    accGrad.addColorStop(0,'rgba(219,169,60,0)'); accGrad.addColorStop(.2,'#dba93c');
    accGrad.addColorStop(.5,'#f0c040'); accGrad.addColorStop(.8,'#dba93c'); accGrad.addColorStop(1,'rgba(219,169,60,0)');
    x.fillStyle=accGrad;
    x.fillRect(cardX, boxY+8, 2, boxH-16);
    x.fillStyle='#dfe6ff'; x.textAlign='center'; x.textBaseline='alphabetic';
    shown.forEach((ln,i)=>x.fillText(ln, BW/2, boxY+padY+fs2*0.85+i*lh, maxW));
  }
}
/* Собственный офскрин-канвас под запись — не размер живого окна, поэтому не ловит ни его
   разметку, ни его же экономию заряда (Q.level===0 «один кадр и тишина» там оправдана для
   бесконечного UI-цикла, тут — 15-секундная ограниченная запись по явному тапу, не то же
   самое). Рисует на протяжении всей записи, даже на слабом ярусе — иначе на нём же ролик
   останется застывшим кадром 15 секунд подряд. */
function angarPvStoryCanvasStart(){
  const d=Math.min(window.devicePixelRatio||1, (typeof dprCap!=='undefined'?dprCap:2));
  const BW=270, BH=480; // логический короб 9:16, тот же приём «короб × dpr», что у angarPvZoomDraw
  const cv=document.createElement('canvas');
  cv.width=Math.round(BW*d); cv.height=Math.round(BH*d);
  const x=cv.getContext('2d');
  x.setTransform(d,0,0,d,0,0);
  let raf=0; const t0=performance.now();
  const loop=()=>{ angarPvStoryDraw(x, BW, BH, performance.now()-t0); raf=requestAnimationFrame(loop); };
  raf=requestAnimationFrame(loop);
  return { canvas:cv, stop(){ if(raf){ cancelAnimationFrame(raf); raf=0; } } };
}
function angarPvZoomOpen(cat,item){
  const m=$('angarPvZoomModal'); if(!m||!item) return;
  angarPvZoomCat=cat; angarPvZoomItem=item;
  m.classList.add('open'); sfx.click(); haptic('light');
  angarPvZoomShareGate();
  if(!angarPvZoomRaf) angarPvZoomRaf=requestAnimationFrame(angarPvZoomDraw);
}
function angarPvZoomClose(){
  const m=$('angarPvZoomModal'); if(!m) return;
  m.classList.remove('open');
  if(angarPvZoomRaf){ cancelAnimationFrame(angarPvZoomRaf); angarPvZoomRaf=0; }
  sfx.click();
}
wireOn('angarPvZoomClose','click',angarPvZoomClose);
wireOn('angarPvZoomModal','click',e=>{ if(e.target && e.target.id==='angarPvZoomModal') angarPvZoomClose(); });
/* 10.09.2026 «Поделиться явлением» — та же дверь-гейт, что cardShareGate() в card.js: кнопка
   скрыта, пока не подтверждено, что этот браузер вообще умеет navigator.share с файлами
   (видео сюда, не картинку — пробный File с video/mp4, не image/png).
   11.09.2026: рядом стояла ещё «В Историю» (#angarPvZoomStory, tg.shareToStory) — владелец
   попросил убрать целиком (качество видео не устроило ни в исходном, ни в переработанном
   виде), осталась только эта кнопка. */
function angarPvZoomShareGate(){
  const b=$('angarPvZoomShare'); if(!b) return;
  let can=false;
  try{
    const probe=new File(['x'],'t.mp4',{type:'video/mp4'});
    can=!!(navigator.share && navigator.canShare && navigator.canShare({files:[probe]}));
  }catch(e){}
  b.classList.toggle('hidden', !can);
}
/* 11.09.2026, владелец: «удаляй возможность делиться в сторис» — качество видео (кодек/
   сжатие) не устроило ни в исходном, ни в переработанном виде, кнопка и весь её путь
   (cinemaAngarZoomStory, тот же кодек-конвейер, что и у «Поделиться») убраны целиком.
   «Поделиться» (файлом, navigator.share) — тот же путь, не тронут, владелец не просил. */
wireOn('angarPvZoomShare','click',()=>{
  const b=$('angarPvZoomShare'); if(!b||!angarPvZoomItem) return;
  // 18.09.2026: cinemaAngarZoomShareEntry (cinema.js) сама выбирает движок (Mediabunny
  // или старый запасной путь) и сама ведёт холст — здесь только кнопка-индикатор.
  cinemaAngarZoomShareEntry(()=>{ b.disabled=true; b.classList.add('recording'); }, ()=>{ b.disabled=false; b.classList.remove('recording'); });
});

/* 28.08.2026 «Настоящая звезда»: цена скина и кошелёк рисовались плоской иконкой i-star4
   (просто контур) — владелец: «пустое подобие» той золотой искры с гранью и свечением,
   что игрок видит в полёте (drawStarJewel, game.js — своя кисть с v1.95.1). Не рисуем
   copy — зовём ту же самую функцию на новом канвасе, тем же приёмом «нарисовать один раз,
   когда канвas реально появился в DOM», что уже применён к #starJewel в game.js. */
function starJewelHtml(cls){ return '<canvas class="starJewelSm'+(cls?' '+cls:'')+'" width="32" height="32" aria-hidden="true"></canvas>'; }
function starJewelWake(){
  document.querySelectorAll('.starJewelSm').forEach(c=>{ if(!c._drawn && typeof drawStarJewel==='function'){ c._drawn=1; drawStarJewel(c); } });
}
/* 28.08.2026 «Вкладка Декаль»: список данных и ключи S/Store на категорию тюнинга.
   06.09.2026: вкладка «Иконки» (была тут третьей, ICONS/S.icon/ownedIcons) убрана из игры
   целиком (владелец) — 268 штук держали слишком много места и мешали новым анимациям
   скина. 24.09.2026: вкладка «Эмодзи» (была декалью — DECALS/S.decal/ownedDecals) убрана
   из игры целиком (владелец) — см. game.js:137 для полного обоснования. Вспышка (FLASHES,
   S.launchFx/ownedLaunchFx — НЕ S.flash, тот уже занят золотой вспышкой подбора звезды) —
   независимая, но НЕ рисуется на самом борту постоянно, а проигрывается только первые
   0.45с забега (см. drawLaunchFlash в render.js). */
const ANGAR_CATS = {
  color: { list:SKINS,  ownedKey:'ownedSkins',  selKey:'skin',  favKey:'favSkins' },
  flash: { list:FLASHES, ownedKey:'ownedLaunchFx', selKey:'launchFx', favKey:'favLaunchFx' }, // 29.08.2026: S.flash уже занят золотой вспышкой подбора — см. game.js
  trail: { list:TRAILS, ownedKey:'ownedTrails', selKey:'trail', favKey:'favTrails' } // 05.09.2026: 5-я вкладка — след, независимый от скина (владелец, см. game.js:TRAILS)
};
/* 29.08.2026 «Избранное нам не нужно» (владелец, после трёх неудачных заходов со звёздочкой-
   тогглом): вместо выбора игроком — 2 фиксированных id на категорию, сразу бесплатные и во
   владении (см. game.js: ownedLaunchFx, price:0 у самих записей).
   Тот же приём, что бумажный скин в Цвете — пустые клетки у «Без украшений» заполняет сам
   состав каталога, не действие игрока.
   07.09.2026, владелец, явный пересмотр этого же решения («это тогда было, сейчас нужно»):
   Избранное возвращается — favKey/favXxx выше и .angarFav ниже. ANGAR_FREEBIE не убирается,
   два механизма не конфликтуют (фрибут — фиксированный подарок, избранное — выбор игрока). */
const ANGAR_FREEBIE = { flash:[1,2] };
let angarCat = 'color';   // активная вкладка тюнинга
// 24.09.2026: ANGAR_DECAL_CATS убран вместе со всей вкладкой «Эмодзи» (владелец) — см.
// game.js:137. Приём построения списка категорий одним проходом по данным (без него
// расходиться) остался у Вспышки/Следа/Цвета ниже — тот же самый, что был здесь.
// 06.09.2026: ANGAR_ICON_CATS убран вместе со всей вкладкой «Иконки» (владелец) — 268 штук
// держали слишком много места, мешали новым анимациям скина.
/* 05.09.2026 «Комфорт большого каталога» (владелец: «огромные каталоги получились» —
   131 Вспышка/16 Следов одной стеной): тот же приём построения списка категорий, что уже
   был у декали (снята 24.09.2026), просто раньше не был подключён к Вспышке/Следу — старый
   комментарий про «10 штук, не нужны категории» устарел. Живой макет (was/became) показан
   и одобрен владельцем перед этой правкой. */
const ANGAR_FLASH_CATS = (()=>{ const seen=[]; FLASHES.forEach(d=>{ if(d.cat && d.cat!=='none' && seen.indexOf(d.cat)<0) seen.push(d.cat); }); return seen; })();
const ANGAR_TRAIL_CATS = (()=>{ const seen=[]; TRAILS.forEach(d=>{ if(d.cat && d.cat!=='none' && seen.indexOf(d.cat)<0) seen.push(d.cat); }); return seen; })();
const ANGAR_SKIN_CATS = (()=>{ const seen=[]; SKINS.forEach(d=>{ if(d.cat && d.cat!=='none' && seen.indexOf(d.cat)<0) seen.push(d.cat); }); return seen; })();

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
  if(nm && angarCat==='color') nm.textContent = skinI18nName(item, angarCat); // 08.09.2026: см. коммент у angarPvNameFill выше — числовой индекс vs строка напрямую
  if(pr){
    pr.classList.toggle('own', owned);
    // 04.09.2026 «Эксклюзивные скины за Stars»: item.premium — цена в Stars (⭐), не в ✦
    // (starJewelHtml() рисует игровой жетон, тут он неверен по смыслу — деньги настоящие).
    const priceHtml = item.premium ? ('⭐ '+Math.round(item.price)) : (starJewelHtml()+Math.round(item.price));
    if(worn){
      // 13.09.2026, владелец: «кнопка надеть/снять вместо нет» — на уже надетой плитке
      // (кроме color, там нельзя остаться без скина) статичная плашка «Выбран» (L.owned)
      // заменена настоящей кнопкой «Снять», см. angarUnwear() и делегированный клик ниже.
      pr.innerHTML = angarCat==='color' ? L.owned :
        '<button type="button" class="btn pri small angarUnwearBtn">'+(L.hangarUnwear||'Снять')+'</button>';
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
  // 05.09.2026: раньше 'color' сразу возвращала cfg.list как есть, в обход категорий/поиска —
  // работало только потому, что id уже шли подряд по разделам (Классика/Яркие/...) случайно
  // совпадая с порядком массива. Теперь идёт тем же общим путём, что декали/иконки/вспышка/след.
  // 29.08.2026 «полный каталог, не кучей вкладок»: раньше фильтровали по одной активной
  // angarSubCat — теперь отдаём всё сразу, сгруппированное по категориям в том же порядке,
  // что раньше был у ленты вкладок (ANGAR_DECAL_CATS). «Нет» (id0) не входит ни в одну
  // категорию по построению — держим её первой плиткой списка один раз, не по разу на
  // категорию (была именно эта жалоба владельца — «пустые места в декали»).
  // 13.09.2026, владелец: плитку «Нет» больше не показываем как выбираемый жетон у
  // декалей/вспышки/следа (id0 там — настоящее «ничего», не предмет) — снять надетое
  // теперь можно тапом по кнопке «Снять» прямо на уже надетой плитке (angarUnwear ниже),
  // как в macets/snyat-cherez-plitku-12-09-2026.html. У цвета (color) id0 — настоящий
  // скин «Бумажный» (cat:'classic', см. комментарий 06.09.2026 ниже), не «ничего» — его
  // по-прежнему показываем как обычную первую плитку.
  const none = angarCat==='color' ? cfg.list.filter(d=>d.id===0) : [];
  /* 29.08.2026 «2 бесплатных вместо Избранного» (владелец, после трёх неудачных заходов со
     звёздочкой): пустые клетки рядом с «Без украшений» заполняют 2 фиксированных id
     (ANGAR_FREEBIE) — не выбор игрока, не клон-дубликат. Просто эти два предмета показаны
     сразу после «Нет», а из обычного места в своей категории убраны (freebieIds ниже),
     чтобы не быть на экране дважды. */
  const freebieIds = ANGAR_FREEBIE[angarCat] || [];
  const freebies = freebieIds.map(id=>cfg.list.find(d=>d.id===id)).filter(Boolean);
  const subCats = angarCat==='flash' ? ANGAR_FLASH_CATS : angarCat==='trail' ? ANGAR_TRAIL_CATS
    : angarCat==='color' ? ANGAR_SKIN_CATS : null;
  /* 06.09.2026, найдено живьём (владелец: «плитка Бумажный дублируется»): у скинов (color)
     id0 несёт настоящую категорию (cat:'classic'), не 'none' как у декалей/иконок — ветка
     subCats.flatMap ниже фильтрует только по d.cat, без исключения id0 (в отличие от соседней
     ветки cfg.list.filter(d=>d.id!==0)). «Бумажный» уже стоит первым через `none` (строка выше)
     и второй раз всплывал здесь же, внутри категории «Классика» — два DOM-узла, оба «выбран». */
  const restBase = subCats
    ? subCats.flatMap(cat=>cfg.list.filter(d=>d.cat===cat && d.id!==0))
    : cfg.list.filter(d=>d.id!==0);
  const rest = restBase.filter(d=>freebieIds.indexOf(d.id)<0);
  // 29.08.2026: у декалей ch — эмодзи-глиф, у иконок (icon) его нет вообще (там svg) —
  // emojiSupported(undefined) сама возвращает true, фильтр для иконок безвреден и не нужен,
  // но не мешает оставить его общим для обеих вкладок.
  const visible = none.concat(freebies, rest).filter(d=>emojiSupported(d.ch));
  /* 06.09.2026 «Чипы вместо поиска по имени»: применяется последним, после категорий/фрибутов —
     тот же lastCat-механизм в angarBuildGrid не путается, подзаголовки просто не появятся перед
     первым непустым совпадением, как раньше у текстового поиска. id0 («Нет») не имеет владения/
     версии — оставляем видимым всегда, как и было у поиска. */
  if(angarFilterMode==='all') return visible;
  const cfg2 = ANGAR_CATS[angarCat];
  // 09.09.2026, владелец (живой скрин): «Нет в новое» — id0 всегда показывался и в этом
  // фильтре тоже (та же строка d.id===0||..., что верна для «Все»/«Куплено», где id0
  // действительно всегда видим/всегда «куплен»). Но «Нет» — постоянный базовый вариант без
  // since, он не может быть «новым» ни при каком выходе версии — здесь оставляем только
  // настоящую проверку версии, без исключения для id0.
  if(angarFilterMode==='new') return visible.filter(d=>d.since && verNewer(d.since, Store.get('angarSeenVersion','0')));
  const owned = d=>S[cfg2.ownedKey].includes(d.id);
  if(angarFilterMode==='owned') return visible.filter(d=>d.id===0 || owned(d));
  // 07.09.2026: 'favorite' заменяет временный 'hasfact' (иконка факта и так видна на плитке).
  if(angarFilterMode==='favorite') return visible.filter(d=>S[cfg2.favKey].includes(d.id));
  return visible;
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
function verNewer(a,b){ // 05.09.2026: простое посегментное сравнение версий «1.478.83» — для метки «новое»
  const pa=String(a).split('.').map(Number), pb=String(b).split('.').map(Number);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){ const x=pa[i]||0, y=pb[i]||0; if(x!==y) return x>y; }
  return false;
}

/* 09.09.2026, владелец (живой скрин, обвёл красным «След»): маска-затухание справа
   (.scrollFade, index.html) раньше висела на #angarTabs/#forgeSubTabs статично — даже
   когда все вкладки уже помещались без прокрутки, последняя выглядела «в тени, размытая»
   без причины. Включаем класс только когда реально есть что прокручивать. */
function scrollFadeSync(el){ if(el) el.classList.toggle('scrollFade', el.scrollWidth>el.clientWidth+1); }
let angarTabsBuilt = false;
function angarBuildTabs(){
  /* 27.08.2026 «Кнопка не ложится на контент»: #angarTabs раньше был мёртвой заготовкой,
     потом (тем же заходом) — одной нерабочей вкладкой «Цвет». 28.08.2026: вторая вкладка
     «Декаль» с реальным переключением. 29.08.2026: третья — «Иконки» (правая сторона
     борта, носится вместе с декалью, не вместо), четвёртая — «Вспышка» (не на борту,
     проигрывается на старте). 05.09.2026: пятая — «След», независимый от скина.
     24.09.2026: «Эмодзи» (была декалью) убрана из игры целиком (владелец) — см. game.js:137.
     Тюнинг теперь 3 вкладки: Цвет / Вспышка / След. Аура/Звук — сюда же позже. */
  if(angarTabsBuilt) return;
  const tabs=$('angarTabs');
  if(tabs){
    tabs.innerHTML = '<button class="angarTab" id="angarTabColor"></button>'+
                      '<button class="angarTab" id="angarTabFlash"></button>'+
                      '<button class="angarTab" id="angarTabTrail"></button>';
    $('angarTabColor').addEventListener('click',()=>angarSwitchCat('color'));
    $('angarTabFlash').addEventListener('click',()=>angarSwitchCat('flash'));
    $('angarTabTrail').addEventListener('click',()=>angarSwitchCat('trail'));
  }
  angarTabsBuilt=true;
}
function angarRenderTabsSel(){
  const tc=$('angarTabColor'), tf=$('angarTabFlash'), tr=$('angarTabTrail');
  if(tc) tc.classList.toggle('sel', angarCat==='color');
  if(tf) tf.classList.toggle('sel', angarCat==='flash');
  if(tr) tr.classList.toggle('sel', angarCat==='trail');
}
function angarSwitchCat(cat){
  if(angarCat===cat) return;
  angarCat=cat; angarBuilt=false; angarSel=S[ANGAR_CATS[cat].selKey];
  angarFilterMode='all'; angarFillFilterChips(); // 06.09.2026: чистый фильтр на каждом разделе, тот же принцип, что был у поиска
  sfx.click(); haptic('light');
  angarRenderTabsSel(); angarBuildGrid(); angarPvDraw(performance.now());
}
/* 06.09.2026 «Чипы вместо поиска по имени»: текстовый поиск искал только по d.name текущего
   языка — бесполезен для ~30 скинов без имени вообще ни на одном языке, и не совпадает
   между языками (набрал «star» на английской раскладке — «Звезда» в русском интерфейсе не
   найдёт). Категории уже решают навигацию; чипы «Все/Новое/Куплено/Не куплено» не требуют
   ни печатать, ни помнить название — тот же приём, что уже есть в Мастерской (workshopSort). */
let angarFilterMode='all';
/* 07.09.2026, владелец: временный чип 'hasfact' убран совсем — иконка факта и так видна на
   плитке (.angarFact), отдельный фильтр дублировал её. 'favorite' — новый, ранжирован ВАЖНЕЕ
   'unowned' («избраное хорошая идея, лучше чм не куплено», владелец), т.е. Все → Новое →
   Куплено → Избранное.
   07.09.2026 вечер, владелец (живой скрин — фильтр «Не куплено» на вкладке «Цвет» отдал
   пустой экран): «убрать не куплено, это лишнее». Чип убран совсем, не почищен — лишний
   пятый вариант при уже имеющемся «Куплено» (обратное и так читается по контексту). */
const ANGAR_FILTERS=['all','new','owned','favorite'];
function angarFillFilterChips(){
  const box=$('angarFilter'); if(!box) return;
  if(box.children.length!==ANGAR_FILTERS.length){
    box.innerHTML='';
    ANGAR_FILTERS.forEach(function(f){
      const b=document.createElement('button'); b.type='button'; b.className='forgeChip';
      b.addEventListener('click', function(){ angarFilterMode=f; angarBuilt=false; angarFillFilterChips(); angarBuildGrid(); sfx.click(); haptic('light'); });
      box.appendChild(b);
    });
  }
  ANGAR_FILTERS.forEach(function(f,i){
    box.children[i].textContent = L['angarFilter_'+f] || f;
    box.children[i].classList.toggle('sel', f===angarFilterMode);
  });
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
      if((angarCat==='flash'||angarCat==='trail'||angarCat==='color') && item.cat && item.cat!=='none' && item.cat!==lastCat
         && (ANGAR_FREEBIE[angarCat]||[]).indexOf(item.id)<0){
        const head=document.createElement('div');
        head.className='angarCatHead';
        head.textContent = (L.decalCatNames && L.decalCatNames[item.cat]) || item.cat;
        // 24.09.2026: сворачиваемые группы (.angarCatHeadToggle/S.angarDecalCollapsed) были
        // только у «Эмодзи» (900 записей, много вкладок нужны были) — убраны вместе с ней,
        // см. game.js:137. У Вспышки/Следа/Цвета такой нужды не было и нет.
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
        /* 06.09.2026, владелец: узор вспышки — абстрактный, в отличие от эмодзи-декали не
           узнаётся с одного взгляда на маленькой плитке (та же причина, по которой название
           уже есть у Цвета — там тоже один и тот же силуэт, отличается только узором/цветом).
           Правило теперь общее: эмодзи — исключение (картинка сама объясняет себя), у всех
           остальных категорий название видно под плиткой. Тот же .nm, что у Цвета.
           07.09.2026, владелец (тот же скрин, что у Эмодзи): у «Нет» канвас всё равно пуст
           (item.style==='') — название переезжает внутрь коробки (.noneLbl), тем же приёмом,
           что уже сделан у Эмодзи, а не отдельной строкой под пустотой. */
        el.innerHTML='<span class="ch"><canvas class="flashPv" width="52" height="52"></canvas>'+
          (item.id===0?'<span class="noneLbl">'+item.name+'</span>':'')+'<span class="pr"></span></span>'+
          (item.id===0?'':'<span class="nm">'+item.name+'</span>');
        if(item.style && item.style!=='none'){
          const x=el.querySelector('canvas').getContext('2d');
          const skin=SKINS_BY_ID.get(S.skin)||SKINS[0];
          const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
          const col=a=>base+Math.max(0,a).toFixed(2)+')';
          x.setTransform(2,0,0,2,26,26); x.scale(.28,.28);
          renderFlashPattern(x, item.style, .55, col);
        }
        el.setAttribute('aria-label', item.name);
      } else if(angarCat==='trail'){
        /* 05.09.2026: тот же приём, что у Вспышки — честная заморозка настоящей формы следа
           (renderTrailPattern, render.js), не рисунок «по мотивам». Самолётик-ориентир рисует
           сама плитка (маленький треугольник сверху), сам след — вызванная функция.
           06.09.2026: + название под плиткой, тем же правилом, что у Вспышки выше.
           07.09.2026, владелец: «Нет» — тоже переезжает внутрь коробки (.noneLbl), тем же
           приёмом, что у Вспышки/Эмодзи. Самолётик-ориентир для «Нет» больше не рисуем —
           след всё равно не к чему привязывать, одинокий треугольник только мешал бы подписи.
           13.09.2026 (владелец, живой скрин: «след на модель налазит у многих») — след
           начинается «чуть ниже носа (y≈8)» по всем стилям (см. комментарий у самой функции
           renderTrailPattern), а порядок отрисовки был обратный: сперва треугольник-ориентир,
           потом след ПОВЕРХ него — у плотных/ярких узоров (не только «Искры») след перекрывал
           сам ориентир. Меняем порядок разом для всех стилей: сперва след, треугольник —
           последним, поверх. */
        el.innerHTML='<span class="ch"><canvas class="flashPv" width="52" height="52"></canvas>'+
          (item.id===0?'<span class="noneLbl">'+item.name+'</span>':'')+'<span class="pr"></span></span>'+
          (item.id===0?'':'<span class="nm">'+item.name+'</span>');
        const x=el.querySelector('canvas').getContext('2d');
        const skin=SKINS_BY_ID.get(S.skin)||SKINS[0];
        if(item.style && item.style!=='none'){
          const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
          const col=a=>base+Math.max(0,a).toFixed(2)+')';
          x.setTransform(1.55,0,0,1.55,26,4);
          renderTrailPattern(x, item.style, col);
          x.setTransform(1,0,0,1,0,0);
        }
        if(item.id!==0){
          x.fillStyle='#eaf2ff'; x.globalAlpha=.9;
          x.beginPath(); x.moveTo(26,14); x.lineTo(21,25); x.lineTo(26,22); x.lineTo(31,25); x.closePath(); x.fill();
          x.globalAlpha=1;
        }
        el.setAttribute('aria-label', item.name);
      } else {
        // 29.08.2026: у «Нет» была подпись только через убранный сейчас заголовок строки — переехала на саму плитку.
        // 02.09.2026: глиф/svg переехал в свой .chGlyph — раньше писался прямо в .ch через
        // textContent/innerHTML, а .pr теперь тоже живёт внутри .ch (плашка поверх низа
        // квадрата); textContent=item.ch стёр бы .pr, если бы она осталась соседкой глифа.
        // 06.09.2026 (владелец): квадрат у «Нет» всё равно пуст (ch:'') — подпись переехала
        // внутрь него самого (.noneLbl), вместо отдельной строки .nm под пустой коробкой.
        // 07.09.2026 (владелец, живьём): подпись была через отдельный L.decalCatNames.none
        // («Без украшений») — длиннее и не похоже на «Нет» у Вспышки/Следа того же самого
        // предмета (id0 везде). Теперь везде один и тот же item.name («Нет»), не два разных слова.
        const nmText = item.id===0 ? item.name : '';
        el.innerHTML='<span class="ch"><span class="chGlyph"></span>'+(nmText?'<span class="noneLbl">'+nmText+'</span>':'')+'<span class="pr"></span></span>';
        const chEl=el.querySelector('.chGlyph');
        if(item.svg){ // векторная декаль — своя иконка вместо текстового глифа, тот же короб .ch
          chEl.innerHTML='<svg viewBox="'+item.vb.join(' ')+'" width="26" height="26"><path d="'+item.svg+'" fill="#eaf2ff"/></svg>';
        } else {
          chEl.textContent = item.ch;
        }
        el.setAttribute('aria-label', item.name); // без видимой подписи (эмодзи и так понятен) — имя остаётся для скринридера
      }
      /* 05.09.2026 «Подсказка-факт»: живёт внутри .dot/.ch (первый span тайла).
         item.fact — только у предметов с реальной задокументированной историей (не выдумано
         для остальных). 15.09.2026 (владелец): точка «новое» на самой плитке убрана целиком —
         уже есть отдельная вкладка-фильтр «Новое» (angarFilterMode==='new', та же проверка
         item.since/verNewer/angarSeenVersion, см. ниже по файлу), точка на плитке дублировала
         тот же факт и по ошибке залезала в угол звёздочки «избранное» (страж 15.09 не заводили —
         чистое удаление, не формула). Само сравнение версий (verNewer/angarSeenVersion) не
         тронуто — фильтр им по-прежнему пользуется. */
      const box = el.querySelector('.dot, .ch');
      if(box){
        if(item.fact){
          // 07.09.2026: была плоская курсивная «i» текстом (на маленьком экране читалась как
          // «/», жалоба владельца) — теперь настоящий контур «ⓘ», тот же язык .ic-иконок,
          // что и везде в игре (i-info добавлена в index.html).
          const fb=document.createElement('button'); fb.type='button'; fb.className='angarFact';
          fb.innerHTML='<svg class="ic"><use href="#i-info"></use></svg>';
          fb.setAttribute('aria-label', L.angarFactBtn||'Факт');
          fb.addEventListener('click', e=>{ e.stopPropagation(); angarPvZoomOpen(angarCat, item); });
          box.appendChild(fb);
        }
        // 07.09.2026 «Избранное» (владелец, пересмотр отклонённого 29.08.2026 решения,
        // явный override — «это тогда было, сейчас нужно»): звезда есть у КАЖДОГО предмета,
        // не только у тех, где есть item.fact — это выбор игрока, не готовая история.
        // Не i-star4 (та же иконка — игровая ВАЛЮТА, .angarTileBuy/кошелёк) — отдельная
        // 5-конечная i-star5, контур/заливка = не в избранном/в избранном.
        (function(){
          const cfg = ANGAR_CATS[angarCat];
          const fav=document.createElement('button'); fav.type='button'; fav.className='angarFav';
          const isFav=()=>S[cfg.favKey].includes(item.id);
          // одна и та же геометрия (i-star5-outline) — заливка переключается классом .on
          // (index.html CSS: .angarFav.on .ic{fill:currentColor}), не сменой symbol.
          fav.innerHTML='<svg class="ic"><use href="#i-star5-outline"></use></svg>';
          const paint=()=>{ fav.classList.toggle('on', isFav()); };
          paint();
          fav.setAttribute('aria-label', L.angarFavBtn||'Избранное');
          fav.addEventListener('click', e=>{
            e.stopPropagation();
            const arr=S[cfg.favKey]; const i=arr.indexOf(item.id);
            if(i<0) arr.push(item.id); else arr.splice(i,1);
            Store.set(cfg.favKey, arr);
            paint();
            sfx.click(); haptic('light');
            if(angarFilterMode==='favorite'){ angarBuilt=false; angarBuildGrid(); }
          });
          box.appendChild(fav);
        })();
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
  const tabFlash=$('angarTabFlash'); if(tabFlash) tabFlash.textContent=L.angarTabFlash;
  const tabTrail=$('angarTabTrail'); if(tabTrail) tabTrail.textContent=L.angarTabTrail;
  /* 09.09.2026, владелец (живой скрин, обвёл красным «След»): scrollFadeSync мерил ширину
     ДО того, как вкладкам проставлялся текст (пустые кнопки на первом рендере) — маска-
     подсказка «тут можно прокрутить» никогда не включалась на первом входе в Тюнинг, даже
     когда реальное переполнение уже есть (подтверждено численно: 360px экран — 4px
     переполнения, hasScrollFadeClass было false). Перенесено после простановки текста. */
  scrollFadeSync($('angarTabs'));
  angarFillFilterChips();
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
/* 13.09.2026 «Снять через плитку, не через «Нет»» (владелец, .knowledge/macets/
   snyat-cherez-plitku-12-09-2026.html, одобрено): тап по «Снять» на уже надетой плитке
   переключает выбор категории на id0 («ничего») напрямую, без отдельной плитки «Нет» в
   сетке. Только для decal/flash/trail — у color нельзя остаться без скина (angarUnwear
   для 'color' не вызывается вообще, кнопка там не рисуется, см. angarItemFill выше).
   14.09.2026, владелец, живой скрин с кружком — «эта кнопка теперь лишняя»: кнопка
   «вернуть» в тосте убрана — «Снять» и так уже кнопка прямо на плитке, вернуть предмет
   так же просто тапом «Надеть» по ней же, отдельная отмена в тосте дублировала это. */
function angarUnwear(){
  if(angarCat==='color') return;
  const cfg = ANGAR_CATS[angarCat];
  const item = cfg.list.find(it=>it.id===S[cfg.selKey]);
  if(!item || item.id===0) return;
  const grid=$('angarGrid'); if(!grid) return;
  const els=grid.querySelectorAll('.angarIt');
  const refill=()=>{ angarVisibleList().forEach((it2,i)=>{ const el=els[i]; if(el) angarItemFill(el,it2); }); angarBuyFill(); angarPvWake(); };
  // 15.09.2026 (владелец, живой скрин с кружком): тост «Снял «…»» убран целиком — плитка
  // сама переключается между «Снять»/«Надеть», отдельное уведомление дублирует это же
  // состояние. Симметрично с «Надеть» — там тоста никогда не было.
  S[cfg.selKey]=0; Store.set(cfg.selKey,0); sfx.click(); haptic('light');
  refill();
}
/* 04.09.2026 «Эксклюзивные скины за Stars»: настоящие деньги, не игровая валюта — отдельный
   путь от angarAct() выше. Ссылку на инвойс даёт только сервер (цена там же, не отсюда,
   см. syncBuySkinInvoice). Владение подтверждает ТОЛЬКО ответ premium_owned после оплаты —
   S.ownedSkins пополняется лишь тогда, локальный кэш никогда не решает сам за себя. */
/* 18.09.2026 (сквозная проверка устойчивости к плохой связи, владелец: «делай») — не было
   защиты от повторного тапа, хотя ровно тот же класс дыры уже находили и чинили у
   «благодарности» (_grSendBusy, grSendBtn выше): медленный syncBuySkinInvoice() или просто
   открытый лист оплаты Stars — окно, где нетерпеливый повторный тап заводит ВТОРОЙ инвойс
   поверх первого. Тот фикс тогда забыли протянуть сюда — тот же повторяющийся паттерн
   «починили в одном месте, забыли в похожем», что уже был в проекте шесть раз за один вечер.
   Снимается не сразу после создания инвойса, а внутри колбэка openInvoice — тем же приёмом и
   по той же причине, что и там: лист оплаты может провисеть открытым долго. */
let _angarBuyBusy=false;
function angarBuyPremium(item, els){
  if(_angarBuyBusy) return;
  const tw = typeof tgApp==='function' ? tgApp() : null;
  if(!tw || !tw.openInvoice){ toast(L.premiumTgOnly,'rgba(255,159,176,.5)'); haptic('error'); return; }
  _angarBuyBusy=true;
  syncBuySkinInvoice(item.id).then(res=>{
    if(!res || !res.ok || !res.link){ _angarBuyBusy=false; toast(L.notEnough,'rgba(255,159,176,.5)'); haptic('error'); return; }
    /* 18.09.2026 (сквозная проверка, найдено при поиске похожих дыр в игре целиком) — если
       tw.openInvoice() сам бросит исключение синхронно (нестандартный/старый клиент Telegram —
       единственный вызов, что ниже реально пробует внешний мост), колбэк ни разу не позовётся,
       _angarBuyBusy=false внутри него не выполнится НИКОГДА, и кнопка покупки замолкнет
       навсегда до перезагрузки игры — без единой подсказки игроку, что случилось. */
    try{
      tw.openInvoice(res.link, status=>{
        _angarBuyBusy=false;
        if(status!=='paid') return;
        syncPremiumOwned().then(o=>{
          if(o && o.ok && Array.isArray(o.owned)){
            let changed=false;
            o.owned.forEach(id=>{ if(!S.ownedSkins.includes(id)){ S.ownedSkins.push(id); changed=true; } });
            if(changed) Store.set('ownedSkins', S.ownedSkins);
          }
          /* 18.09.2026 (сквозная проверка) — оплата уже подтверждена самим Telegram
             (status==='paid' выше) ДО этой строки — но если syncPremiumOwned() не дошёл до
             сервера (сеть), S.skin ставился на предмет, которого нет в S.ownedSkins. Следующая
             загрузка игры сама снимает такой скин (см. проверку при старте hangar), и купленный
             только что скин молча слетал бы без всякой причины для игрока. Раз оплата реальна —
             считаем предмет купленным локально прямо сейчас, не дожидаясь сервера ещё раз. */
          if(!S.ownedSkins.includes(item.id)){ S.ownedSkins.push(item.id); Store.set('ownedSkins', S.ownedSkins); }
          S.skin=item.id; Store.set('skin', item.id);
          angarApplyPremiumFlash(item);
          sfx.buy(); haptic('success');
          angarVisibleList().forEach((it2,i)=>{ const el=els[i]; if(el) angarItemFill(el,it2); });
          angarBuyFill(); refreshMenu(); updateLives(); angarPvWake();
          if (typeof achCheck==='function') achCheck();
        });
      });
    }catch(e){ _angarBuyBusy=false; toast(L.notEnough,'rgba(255,159,176,.5)'); haptic('error'); }
  });
}
// 24.09.2026: «Свёрнутые группы Эмодзи» (angarToggleDecalGroup, S.angarDecalCollapsed,
// .angarCatHeadToggle/.angarHiddenGroup) убраны вместе со всей вкладкой «Эмодзи» (владелец) —
// см. game.js:137. Только у неё было 900 записей и нужда сворачивать группы.
// 28.08.2026: кнопка живёт внутри жетона и пересоздаётся при каждой перерисовке (innerHTML) —
// вешать слушатель на неё саму бессмысленно, он терялся бы. Делегирование на сетку целиком.
if(typeof $==='function' && $('angarGrid')) $('angarGrid').addEventListener('click', e=>{
  if(e.target.closest('.angarTileBuy')){ e.stopPropagation(); angarAct(); }
  if(e.target.closest('.angarUnwearBtn')){ e.stopPropagation(); angarUnwear(); }
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

/* 14.09.2026 «Карусель режимов»: запуск каждого режима вынесен в свою именованную функцию —
   и старые кнопки экрана «Турниры», и новые карточки карусели на главном зовут ОДНУ и ту же
   логику, не две копии. До этой правки код запуска жил прямо внутри wireOn(...)-колбэков —
   карусели звать было бы нечего без дублирования. */
function flyClassic(){ runStart(); } // v1.42.0: просто в выбранной дисциплине — runMode уже 'classic' с главного экрана
function flyDaily(){
  const ak2=attemptDayKey(), dr=Store.get('dailyRun',null), usedN2=(dr&&dr.d===ak2)?(dr.n||0):dailyDoneGet(ak2);
  if (usedN2>=DAILY_ATTEMPTS){ haptic('light'); return; }
  setRunMode('daily'); sfx.click(); haptic('light'); runStart();
}
function flySlalom(){ setRunMode('slalom'); sfx.click(); haptic('light'); runStart(); }
function flyBiathlon(){ setRunMode('biathlon'); sfx.click(); haptic('light'); runStart(); }
function flySpeedrun(){ setRunMode('speedrun'); sfx.click(); haptic('light'); runStart(); }
function flyCaravan(){ setRunMode('caravan'); sfx.click(); haptic('light'); runStart(); }
function flyRelay(){
  // 09.09.2026 (владелец): тост «войди через Telegram» был тупиком — сказал и никуда не ведёт,
  // а вход давно не только через Telegram (Discord/Google туда же, см. syncAuth). Теперь тап
  // без входа сразу открывает Настройки — туда же, где уже стоят настоящие кнопки входа.
  if (!syncAvailable()){ toast(L.relaySignInFirst,'rgba(191,232,255,.45)'); haptic('light'); openSettings('modes'); return; }
  sfx.click(); haptic('light');
  if (typeof syncRelayGetOpen!=='function' || typeof syncRelayStart!=='function') return;
  syncRelayGetOpen().then(r=>{
    if (r && r.ok && r.chain) return r.chain;
    return syncRelayStart({skin:S.skin}).then(r2=>(r2&&r2.ok&&r2.chain)?r2.chain:null);
  }).then(chain=>{
    if (!relayEnterFromChain(chain)){ toast(L.relayFailStart,'rgba(255,150,150,.5)'); return; }
    setRunMode('relay'); runStart();
  }).catch(()=>{ toast(L.relayFailStart,'rgba(255,150,150,.5)'); });
}

/* ---------- Привязка кнопок ---------- */
/* 16.09.2026 (владелец, живой скрин: «текст говорит нажмите здесь, а нажимаешь на текст — не
   работает, надо там нажимать») — .playHint переехал по центру карточки текстом «Нажмите здесь»,
   но сам текст был pointer-events:none (чисто декоративный) — настоящая кнопка полёта осталась
   внизу, где и была. Текст обещал одно, зона клика — другое. Один делегированный обработчик на
   всю карусель: тап по подсказке находит НАСТОящую кнопку той же карточки (общий для всех 7 режимов
   селектор .cardFlyBtn/.speedrunFlyBtn/.caravanFlyBtn/.relayFlyBtn, index.html) и кликает по ней —
   тот же полёт, что и раньше, просто с ещё одной, честной зоной клика вместо декоративной. */
document.getElementById('heroCarousel')?.addEventListener('click', function(e){
  const hint=e.target.closest('.playHint'); if(!hint) return;
  const card=hint.closest('.heroCard'); if(!card) return;
  const btn=card.querySelector('.cardFlyBtn,.speedrunFlyBtn,.caravanFlyBtn,.relayFlyBtn');
  if(btn) btn.click();
});
wireOn('startBtn', 'click', flyClassic); // в выбранной дисциплине (v1.42.0)
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
// 15.09.2026: #modesBtn («Топ соревнований») убран с главного экрана совсем — вход в Турниры
// теперь через Достижения (achBtn) или через бейдж-рекорд прямо на карточке карусели.
wireOn('modeDaily', 'click', flyDaily);
wireOn('modeSlalom', 'click', flySlalom);
wireOn('modeBiathlon', 'click', flyBiathlon);
wireOn('modeSpeedrunFly', 'click', flySpeedrun);
wireOn('modeCaravanFly', 'click', flyCaravan);
/* 06.09.2026 «Эстафета»: единственный режим с асинхронной логикой перед стартом (спросить
   сервер: есть открытая цепочка, ждущая следующий этап, или начать свою) — сама логика теперь
   в flyRelay() выше, relayEnterFromChain() раскладывает ответ сервера в S для обеих карточек
   (старой в «Турнирах» и новой в карусели). */
function relayEnterFromChain(chain){
  if (!chain) return false;
  S.relayChainId=chain.id; S.relayLeg=chain.leg;
  S.relaySeed=String(chain.seed);
  S.relayInheritScore=saneNumber(chain.score,0);
  S.relayInheritLives=clamp(saneNumber(chain.lives,3),1,3);
  const g=(chain.prevTrack && typeof ghostParse==='function') ? ghostParse(chain.prevTrack) : null;
  if (g){ g.cx=true; relayPrevGhost=g; relayPrevName=chain.prevName||''; relayPrevSkin=(chain.prevSkin!=null)?chain.prevSkin:0; S.relayWatching=true; }
  else { relayPrevGhost=null; relayPrevName=''; relayPrevSkin=-1; S.relayWatching=false; }
  return true;
}
wireOn('modeRelay', 'click', flyRelay);
/* 15.09.2026: карточки карусели переиспользуют ТЕ ЖЕ id, что были у кнопок удалённого экрана
   «Турниры» (modeDaily/modeSlalom/modeBiathlon/modeSpeedrunFly/modeCaravanFly/modeRelay,
   startBtn — Классика) — wireOn на них уже стоит выше, второй раз не нужен. */
/* Точки-индикатор под каруселью — какая карточка сейчас видна. Считаем по scrollLeft/ширине
   карточки (все карточки одного размера — страж 219), не по IntersectionObserver: тут всего
   7 элементов в одном контейнере, полный пересчёт на каждый scroll-кадр дешевле новой сущности. */
function heroCarouselDotsSync(){
  const car=$('heroCarousel'), dots=$('heroDots'); if(!car||!dots||!car.children.length) return;
  const w=car.children[0].getBoundingClientRect().width; // 15.09.2026: просвета/gap больше нет — карточка на всю ширину
  if(!w) return;
  const idx=Math.max(0, Math.min(dots.children.length-1, Math.round(car.scrollLeft/w)));
  for(let i=0;i<dots.children.length;i++) dots.children[i].classList.toggle('on', i===idx);
}
wireOn('heroCarousel','scroll',()=>{ requestAnimationFrame(heroCarouselDotsSync); });
/* 15.09.2026 «Сами по очереди»: владелец — «не хочу чтобы другой режим торчал, они просто
   могут сами по очереди показываться перед глазами игрока каждые 7 секунд». Раз в 7с — на
   следующую карточку (по кругу), скроллом, тем же scroll-snap, что и у ручного свайпа —
   heroCarouselDotsSync() подхватывает смену сама, отдельно её не дёргаем. Не крутим, если
   экран сейчас не «меню» (не видно) — бессмысленный скролл невидимого контейнера.
   15.09.2026, второй заход (исследование в .knowledge/RESEARCH-2026-09-MENU-REDESIGN-
   RU-ACCESSIBILITY.md поймало это не как гипотезу — проверено на живом коде): автопрокрутка
   без паузы/стоп-контрола буквально совпадает с формулировкой WCAG 2.2.2. Не убираем автопро-
   крутку совсем (владелец её хотел) — глушим НАСОВСЕМ, как только игрок САМ тронул карусель
   (pointerdown — настоящий жест пальцем/мышью, не путать с событием 'scroll', которое летит и
   от нашего же programmatic scrollTo() ниже). Дальше карусель стоит там, где её оставили. */
let heroCarouselAutoT=setInterval(function(){
  if (screenName!=='menu') return;
  /* 24.09.2026 (владелец: «пусть сперва Score Attack сыграют, а остальное увидят потом» +
     живая жалоба «подсказка появляется намного позже, чем карусель уезжает — можешь и не
     увидеть»): пока игрок вообще ни разу не играл — карусель не крутится сама, стоит на
     Score Attack. Это и решает конфликт таймингов (7с прокрутка vs 15с+ ожидание
     подсказки — сама подсказка теперь ждёт именно эту карточку, ей больше некуда уезжать),
     и не показывает новичку раньше времени 6 режимов, которые ему рано видеть.
     25.09.2026: было `Stats.runs` — такого поля не существует нигде в коде (настоящий
     счётчик — `Stats.games`, `Stats.games++` при каждом старте, js/ui.js:954), значит
     условие было ВСЕГДА истинным и карусель никогда не крутилась сама ни для кого,
     сколько бы игрок ни играл. Найдено стражем Зонда, тот же неверный паттерн скопирован
     туда же — см. комментарий у zondTick(). */
  if(typeof Stats!=='undefined' && (Stats.games||0)===0) return;
  const car=$('heroCarousel'); if(!car || !car.children.length) return;
  const w=car.children[0].getBoundingClientRect().width; if(!w) return;
  const n=car.children.length;
  const cur=Math.round(car.scrollLeft/w);
  const next=(cur+1)%n;
  // 16.09.2026 (владелец, живой скрин: «линия остаётся» на карточках карусели): было
  // next*w — умножение дробной ширины (getBoundingClientRect не целое число px) на индекс
  // копит погрешность с каждой карточкой. offsetLeft — то же самое смещение, что браузер уже
  // сам целочисленно посчитал для реальной раскладки, тот же приём, что уже верно для «Список
  // точек»/якорей Конструктора — не пересчитывать вручную то, что DOM уже точно знает.
  const target = car.children[next].offsetLeft - car.children[0].offsetLeft;
  car.scrollTo({ left: target, behavior:'smooth' });
}, 7000);
wireOn('heroCarousel','pointerdown',()=>{ if(heroCarouselAutoT){ clearInterval(heroCarouselAutoT); heroCarouselAutoT=null; } });
/* 25.09.2026 «Зонд» — персонаж-подсказка для совсем новых игроков, заменяет прежний
   язычок на ленте (владелец: «в научной игре смотрится омерзительно», плюс задел на
   будущую систему рейтинга/кастомизации, отдельная задача, см. память сессии). В
   отличие от язычка — появляется СРАЗУ на пустом меню, не после простоя: сама идея
   «поймай подсказку» и есть обучение, ждать бездействия не нужно. Условие показа —
   то же самое, что было у язычка (Stats.games===0 и центр карусели — Score Attack),
   но БЕЗ таймера ожидания. Один раз за загрузку страницы (zondShown), не при каждом
   возврате в меню — dependency от прежнего idleHintShown-счётчика (5 показов) не
   годится: тут нет серии показов, только один эпизод на первый визит. Бег гасится
   ЛИБО системным `prefers-reduced-motion` (RM, js/core.js), ЛИБО ручным тумблером
   «Смягчить тряску» (CALM_FX) — см. zondMoveNext(). Первая версия держалась только
   на RM; при правке CALM_FX (25.09.2026, дефолт true→false — владелец: доступность
   не включают заранее всем) выяснилось, что сам же код признаёт RM «ненадёжным
   внутри WebView» (комментарий у CALM_FX в core.js) — там играет большинство. Раз
   CALM_FX теперь тоже выключен по умолчанию, добавлять его вторым сигналом стало
   безопасно — не гасит погоню зря никому. Позиции-«карманы» не захардкожены
   в процентах (macet использовал условный демо-экран) — измеряются вживую через
   getBoundingClientRect() тех же элементов, что уже на экране (карточка/точки
   карусели/ряд кнопок), чтобы не гадать координаты отдельно под каждый размер
   телефона. Текст подсказки внутри пузыря — ЗАГЛУШКА (владелец: текст ещё не готов,
   вставить позже отдельной правкой), взято дословно из одобренного макета
   macet-25-09-zond-final.html. */
let zondShown=false, zondCaught=false, zondIdx=0, zondPocketsArr=[], zondMoveT=null;
const ZOND_FACE_NORMAL='<rect x="14" y="23" width="5" height="7" rx="2" fill="#f4f6fb"/>'+
  '<rect x="21" y="23" width="5" height="7" rx="2" fill="#f4f6fb"/>'+
  '<path d="M16,33 L24,33" stroke="var(--gold-hi)" stroke-width="1.8" stroke-linecap="round"/>';
const ZOND_FACE_CAUGHT='<path d="M12,25 Q16,21 20,25" stroke="#f4f6fb" stroke-width="2" fill="none" stroke-linecap="round"/>'+
  '<path d="M20,25 Q24,21 28,25" stroke="#f4f6fb" stroke-width="2" fill="none" stroke-linecap="round"/>'+
  '<circle cx="13" cy="30" r="2" fill="rgba(240,150,150,.55)"/>'+
  '<circle cx="27" cy="30" r="2" fill="rgba(240,150,150,.55)"/>'+
  '<ellipse cx="20" cy="34" rx="2.6" ry="2" fill="var(--gold-hi)"/>';
function zondCentredCard(){
  const car=$('heroCarousel'); if(!car||!car.children.length) return null;
  const w=car.children[0].getBoundingClientRect().width; if(!w) return null;
  const idx=Math.max(0, Math.min(car.children.length-1, Math.round(car.scrollLeft/w)));
  return car.children[idx];
}
/* 25.09.2026 (владелец, живой телефон 360×800, реальные скриншоты): первая версия падала
   в двух местах разом — (1) «карман» между heroDots и .stack на узком экране оказался
   0px зазора (не проверял реальный зазор, только считал середину — Зонд садился прямо на
   границу ленты точек и кнопки), (2) старт был у угла карточки, не внизу, как
   договаривались. Теперь: МИНИМАЛЬНЫЙ зазор (ZOND_MIN_GAP) перед тем, как считать
   «карман» реальным, и явный старт у нижнего края экрана. */
const ZOND_MIN_GAP=30; // px — меньше не считается настоящим карманом, не втискиваем силой
function zondPockets(){
  const pts=[];
  const sw=window.innerWidth, sh=window.innerHeight;
  /* 25.09.2026 (владелец, живьём, два захода подряд): (1) с одним нижним карманом побег
     превратился в скучный маятник «туда-сюда» — нужно несколько точек, не одна; (2) когда
     точки оказались близко друг к другу (0.28-0.72 ширины), мелкие частые перескоки внутри
     тесного пятачка сам читаются как «ёрзает, дёргается», не как «плавает по экрану» —
     хотя формально ни одну кнопку не задевают (проверено live-device). Раздвинуто почти на
     всю ширину экрана (0.10-0.90) — то же самое пустое поле, просто прыжки внутри него
     крупнее и реже выглядят как движение, не подёргивание. */
  const scrFoot=document.querySelector('#startScreen .scrFoot');
  const zoneTop = scrFoot ? scrFoot.getBoundingClientRect().bottom+16 : sh-90;
  const zoneBottom = sh-70;
  const xL=Math.max(16, sw*0.10-21), xR=Math.min(sw-58, sw*0.90-21), xC=sw/2-21;
  pts.push({x:xC, y:Math.min(zoneTop, zoneBottom)});
  if(zoneBottom-zoneTop>=ZOND_MIN_GAP){
    const yFar=Math.min(zoneTop+(zoneBottom-zoneTop)*0.55, zoneBottom);
    pts.push({x:xL, y:yFar});
    pts.push({x:xR, y:Math.min(zoneTop, zoneBottom)});
    pts.push({x:xC, y:yFar});
  }
  const card=zondCentredCard(); const cardR=card&&card.getBoundingClientRect();
  if(cardR) pts.push({x:cardR.right-46, y:cardR.top+14});
  const dots=$('heroDots'); const stackEl=document.querySelector('#startScreen .stack');
  if(dots && stackEl){
    const dR=dots.getBoundingClientRect(), sR=stackEl.getBoundingClientRect();
    if(sR.top-dR.bottom>=ZOND_MIN_GAP) pts.push({x:(dR.left+dR.right)/2-21, y:(dR.bottom+sR.top)/2-24});
  }
  const menuRow=$('menuRow');
  if(menuRow && menuRow.children.length>=4){
    const r1=menuRow.children[1].getBoundingClientRect(), r2=menuRow.children[2].getBoundingClientRect();
    if(r2.top-r1.bottom>=ZOND_MIN_GAP) pts.push({x:menuRow.getBoundingClientRect().left+menuRow.getBoundingClientRect().width*0.5-21, y:(r1.bottom+r2.top)/2-24});
  }
  const brandSub=$('brandSub'); const wrap=document.querySelector('#startScreen .heroCarouselWrap');
  if(brandSub && wrap){
    const bR=brandSub.getBoundingClientRect(), wR=wrap.getBoundingClientRect();
    if(wR.top-bR.bottom>=ZOND_MIN_GAP) pts.push({x:(bR.left+bR.right)/2-21, y:(bR.bottom+wR.top)/2-24});
  }
  return pts;
}
/* 25.09.2026: было `left = x-30` без проверки края экрана — на узком телефоне (360px)
   пузырь с фразой (~190px при реальном тексте) целиком уезжал за правый край, владелец
   физически не мог прочитать текст. Теперь — ставим, ИЗМЕРЯЕМ реальную отрисованную
   ширину, подвигаем обратно в границы экрана, если вылезло. */
function zondClampToViewport(el){
  if(!el) return;
  const pad=8, r=el.getBoundingClientRect();
  if(r.right>window.innerWidth-pad) el.style.left=(parseFloat(el.style.left)-(r.right-(window.innerWidth-pad)))+'px';
  const r2=el.getBoundingClientRect();
  if(r2.left<pad) el.style.left=(parseFloat(el.style.left)+(pad-r2.left))+'px';
}
function zondPlaceTauntNear(x,y){
  const taunt=$('zondTaunt'); if(!taunt) return;
  taunt.style.left=Math.max(4,x-30)+'px';
  taunt.style.top=(y-58)+'px';
  zondClampToViewport(taunt);
}
function zondShowTaunt(){
  const zond=$('zondEl'); if(!zond) return;
  zondPlaceTauntNear(parseFloat(zond.style.left), parseFloat(zond.style.top));
  const taunt=$('zondTaunt'); if(taunt) taunt.classList.add('show');
}
function zondMoveNext(){
  /* 25.09.2026: RM (prefers-reduced-motion) — единственный сигнал не годится, сам же
     код признаёт (js/core.js, коммент у CALM_FX) — «ненадёжен внутри WebView», где
     играет большинство. CALM_FX теперь тоже выключен по умолчанию (владелец: не
     включать заранее всем) — значит безопасно добавить его вторым сигналом: ручной,
     явно поставленный игроком тумблер надёжнее пассивного системного признака внутри
     Telegram. Логика ИЛИ — хватает любого из двух, не оба разом. */
  if(zondCaught || RM || CALM_FX) return;
  const taunt=$('zondTaunt'); if(taunt) taunt.classList.remove('show');
  zondIdx=(zondIdx+1)%zondPocketsArr.length;
  const p=zondPocketsArr[zondIdx]; const zond=$('zondEl'); if(!zond) return;
  zond.style.left=p.x+'px'; zond.style.top=p.y+'px';
}
function zondCatch(){
  if(zondCaught) return;
  zondCaught=true;
  if(zondMoveT){ clearInterval(zondMoveT); zondMoveT=null; }
  const taunt=$('zondTaunt'); if(taunt) taunt.classList.remove('show');
  const face=$('zondFace'); if(face) face.innerHTML=ZOND_FACE_CAUGHT;
  const zond=$('zondEl'); const x=parseFloat(zond.style.left), y=parseFloat(zond.style.top);
  const spark=$('zondSpark'); if(spark){ spark.style.left=(x+8)+'px'; spark.style.top=(y-14)+'px'; spark.classList.add('show'); }
  const hint=$('zondHint');
  if(hint){
    hint.style.left=Math.max(4,x-20)+'px'; hint.style.top=(y-70)+'px';
    hint.textContent='Совет: короткий флик честнее держит скорость'; // ЗАГЛУШКА — текст ждёт владельца
    hint.classList.add('show');
    zondClampToViewport(hint); // 25.09.2026: та же защита от вылезания за узкий экран, что у фразы
  }
  haptic('light'); sfx.click();
}
function zondShow(){
  const layer=$('zondLayer'); if(!layer || zondShown) return;
  zondPocketsArr=zondPockets(); if(!zondPocketsArr.length) return;
  zondShown=true;
  layer.innerHTML='<div class="zondTaunt" id="zondTaunt">Сможешь поймать меня? А-а-а!</div>'+
    '<div class="zond" id="zondEl"><div class="zondHitZone"></div>'+
    '<svg class="zondSvg zondBob" viewBox="0 0 40 46">'+
    '<g class="zondSatWrap"><path d="M14,10 Q20,3 26,10" stroke="rgba(240,192,64,.35)" stroke-width="1.2" fill="none" stroke-dasharray="1.5 3"/>'+
    '<circle class="zondSat glow" cx="26" cy="10" r="2.3" fill="var(--gold-hi)"/></g>'+
    '<polygon points="20,14 30,21 30,33 20,40 10,33 10,21" fill="#0d2038" stroke="var(--gold-hi)" stroke-width="2"/>'+
    '<g id="zondFace">'+ZOND_FACE_NORMAL+'</g></svg></div>'+
    '<div class="zondSpark" id="zondSpark">✦</div><div class="zondHint" id="zondHint"></div>';
  const p=zondPocketsArr[0]; const zond=$('zondEl');
  zond.style.left=p.x+'px'; zond.style.top=p.y+'px';
  requestAnimationFrame(()=>requestAnimationFrame(()=>zond.classList.add('zondIn'))); // 25.09.2026: мягкое появление вместо мгновенного «хоп» — см. .zondIn в index.html
  zond.addEventListener('click', zondCatch);
  setTimeout(zondShowTaunt, 400);
  zondMoveT=setInterval(zondMoveNext, 3600); // 25.09.2026: было 2600 — с широкими точками чаще выглядело как дёрганье, не движение
}
function zondTick(){
  /* 25.09.2026 (владелец, прямо на живом телефоне): убрано условие Stats.games===0.
     Та же логика, что уже решена для будущего «выпускного» ([[project_zond_vypusknoy_bonus_otlozheno_25_09]]
     в памяти сессии) — не гадать по числу забегов, кто «уже не новичок», ждать ЯВНОГО
     отказа игрока. Явного отказа (кнопки «не нужно») пока не существует — значит по
     умолчанию Зонд показывается всем, один раз за загрузку страницы. Когда построим
     кнопку подтверждения — она и станет настоящим условием отказа, не количество игр. */
  if(zondShown) return; // один эпизод за загрузку страницы, не при каждом возврате в меню
  if(screenName!=='menu') return;
  const card=zondCentredCard();
  if(!card || !card.classList.contains('hc-classic')) return;
  zondShow();
}
// v1.282.14: экран открываем ПЕРВЫМ, наполняем вторым — иначе страж forgeSkyKick видит
// #forgeScreen ещё скрытым, молча выходит, и живое мини-небо не стартует до первого касания.
wireOn('konstruktorBtn', 'click', ()=>{ sfx.click(); haptic('light'); setScreen('forge'); if(typeof forgeOpen==='function')forgeOpen(); }); // v1.68.0: конструктор трассы; 05.09.2026: кнопка переехала с modeForge (внутри «Соревнований») на главный экран
wireOn('menuBtn', 'click', toMenu);
wireOn('pauseBtn', 'click', pauseGame);
wireOn('resumeBtn', 'click', resumeGame);
wireOn('restartBtn', 'click', ()=>{ if((runMode==='daily'||runMode==='relay')&&S.running){ gameOver(); } else runStart(); }); // рестарт из паузы — в той же дисциплине (v1.42.0); v1.93: прыжок не переигрывают — «рестарт» дня = сдача с честными итогами; 06.09.2026: + Эстафета — рестарт середины этапа честно считается несдачей, не тихим сбросом; 07.09.2026: 1CC убран; 07.09.2026: 100% удалён
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
function calmFxLabel(){ rowSw('setReduceShakeBtn', CALM_FX); }
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
wireOn('setReduceShakeBtn', 'click', ()=>{
  CALM_FX=!CALM_FX; Store.set('calmFx',CALM_FX?1:0); calmFxLabel(); haptic('light'); sfx.click();
});
/* 09.09.2026 «Размер текста» (владелец, для слабовидящих): масштаб всего UI/HUD/меню, КРОМЕ
   игрового канваса и рамки коридора — см. #uiScaleRoot в index.html. transform вместо
   переписывания сотен font-size по всему index.html. Шаги 100/115/130% — 150% отклонён:
   на узком экране (536px CSS, живой замер) часть строк настроек вылезала за край даже
   после починки .setGrp/.setRow под перенос (см. --ui-scale в index.html). */
const TEXT_SCALE_STEPS=[1,1.15,1.3];
function applyUiScale(k){
  document.documentElement.style.setProperty('--ui-scale', k);
}
function textScaleLabel(){ rowV('setTextScaleBtn', Math.round(UI_TEXT_SCALE*100)+'%'); }
wireOn('setTextScaleBtn', 'click', ()=>{
  const i=TEXT_SCALE_STEPS.indexOf(UI_TEXT_SCALE);
  UI_TEXT_SCALE=TEXT_SCALE_STEPS[(i+1)%TEXT_SCALE_STEPS.length];
  Store.set('uiTextScale',UI_TEXT_SCALE); applyUiScale(UI_TEXT_SCALE); textScaleLabel(); haptic('light'); sfx.click();
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
  /* 11.09.2026 (владелец, три раза подряд — «увеличить список на максимум», волна тестов
     «от телефона до телевизора», подтвердил «оба варианта» доступа): platform выше молчит,
     ОТКУДА игра вообще открыта — из настоящего Telegram (initData/tg.platform живой) или
     напрямую браузером (ТВ без Telegram вообще, только веб-вход Discord/Google). Одна явная
     строка вместо того, чтобы гадать по отсутствию других полей. Полный user agent — тоже
     сюда: для ТВ это единственный способ узнать точную платформу (Tizen/WebOS/Android TV/
     обычный Chrome-на-телевизоре) без специального кода под каждую из них. */
  Ln.push('host: '+((typeof tg!=='undefined'&&tg&&tg.initData)?'telegram':'browser'));
  Ln.push('ua: '+(navigator.userAgent||'?'));
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
  /* 11.09.2026 (владелец, перед волной тестов «от телефона до телевизора»): на ТВ нет ни
     тача, ни курсора — только пульт/геймпад через клавиатурные события (input.js уже
     слушает ArrowLeft/Right/Up/Down+Enter, подтверждено кодом). Без этой строки по одному
     отчёту нельзя было бы отличить «телефон без тача сам не пожалуется» от «тач в принципе
     недоступен на этом устройстве» — matchMedia(pointer) честно различает грубый палец,
     точную мышь и отсутствие указателя вовсе (ровно ТВ-случай). */
  Ln.push('input: touch '+(('ontouchstart' in window)?'yes':'no')+' pts '+(navigator.maxTouchPoints||0)+
    ' pointer '+(matchMedia('(pointer:coarse)').matches?'coarse':(matchMedia('(pointer:fine)').matches?'fine':'none')));
  Ln.push('world: '+W+'x'+H+' sc '+(Math.round(SC*100)/100)+' sheet '+canvas.width+'x'+canvas.height+' cap '+capPx);
  Ln.push('canvas: '+(typeof canvasContextLost!=='undefined'&&canvasContextLost?'context-lost':'ready')+' dpr-cap '+dprCap);
  Ln.push('motion: '+(RM?'reduce':'full')+' ink '+(P3?'display-p3':'srgb'));
  Ln.push('lang: '+LANG);
  /* 15.09.2026 (владелец, живой отчёт): сданный этап Эстафеты не дошёл до сервера
     («Мои эстафеты» пусто), а живых данных для разбора не было — очередь relayQ
     (js/sync.js syncRelayEnqueue/syncRelayFlush) нигде не видна снаружи. Одна строка:
     если очередь пуста — запись даже не встала в очередь (гейт в gameOver() отсёк её,
     скорее всего S.relayChainId/rec.length); если непуста — встала, но ни разу не
     смогла улететь (сеть/сервер), тогда чинить нужно flush, не гейт. */
  try{
    const rq=Store.get('relayQ',[]);
    Ln.push('relayQ: '+(Array.isArray(rq)?rq.length:'?')+(Array.isArray(rq)&&rq.length?' ['+rq.map(x=>x&&(x.chain_id+':'+x.leg)).join(', ')+']':''));
  }catch(e){ Ln.push('relayQ: err'); }
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
/* 09.09.2026 «Переназначение клавиш» (владелец, макет key_rebind_macet.png, одобрен «да»):
   тап по строке → «слушаю», следующая клавиша становится персональной привязкой ВМЕСТО
   дефолтной пары стрелка+буква (KEY_BINDS — js/input.js). Esc отменяет без изменений.
   Слушатель — на capture-фазе, чтобы гарантированно сработать раньше обычного руления
   в input.js независимо от порядка подключения файлов (см. keyRebindListening там же). */
let keyRebindListening=null; // null | 'left'|'right'|'up'|'down'
const KEY_DIR_ROW={left:'setKeyLeftBtn',right:'setKeyRightBtn',up:'setKeyUpBtn',down:'setKeyDownBtn'};
const KEY_DIR_STORE={left:'keyBindLeft',right:'keyBindRight',up:'keyBindUp',down:'keyBindDown'};
function keyCodeLabel(code){ // человекочитаемое имя физической клавиши (KeyboardEvent.code)
  if(!code) return '';
  if(code.startsWith('Key')) return code.slice(3);
  if(code.startsWith('Digit')) return code.slice(5);
  const NAMED={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'Пробел',
    ShiftLeft:'Shift',ShiftRight:'Shift',ControlLeft:'Ctrl',ControlRight:'Ctrl',
    Tab:'Tab',CapsLock:'Caps',Backquote:'`',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
  return NAMED[code]||code;
}
function keyBindLabel(dir){ return KEY_BINDS[dir] ? keyCodeLabel(KEY_BINDS[dir]) : KEY_BIND_DEFAULT_LABEL[dir]; }
function keyBindRowLabel(dir){ rowV(KEY_DIR_ROW[dir], keyBindLabel(dir)); }
function keyBindAllLabels(){ ['left','right','up','down'].forEach(keyBindRowLabel); }
/* 09.09.2026, владелец, живой скрин с телефона (обвёл красным): тап по строке «Влево» на
   сенсорном экране открывает «слушаю клавишу…» и дальше ничего не происходит — физической
   клавиатуры нет, событие KeyboardEvent никогда не придёт, тупик. Переназначение клавиш имеет
   смысл только там, где есть настоящая клавиатура. 'ontouchstart' in window — тот же признак
   мобильного/сенсорного устройства, что core.js уже использует для safe-area/качества графики
   (tgInsetsSync, автоопределение тира) — не новый метод, тот же самый. */
function keyBindRowsVisibility(){
  const touch=('ontouchstart' in window);
  ['left','right','up','down'].forEach(dir=>{ const el=$(KEY_DIR_ROW[dir]); if(el) el.classList.toggle('hidden',touch); });
}
function keyRebindListen(dir){
  if(keyRebindListening) keyBindRowLabel(keyRebindListening); // отменяем прошлое незавершённое ожидание, если было
  keyRebindListening=dir;
  rowV(KEY_DIR_ROW[dir], L.keyListening, true);
  haptic('light'); sfx.click();
}
['left','right','up','down'].forEach(dir=>{
  wireOn(KEY_DIR_ROW[dir], 'click', ()=>keyRebindListen(dir));
});
window.addEventListener('keydown', e=>{
  if(!keyRebindListening) return;
  const dir=keyRebindListening;
  e.preventDefault(); e.stopPropagation();
  if(e.key==='Escape'){ keyRebindListening=null; keyBindRowLabel(dir); return; } // отмена — привязка не меняется
  KEY_BINDS[dir]=e.code; Store.set(KEY_DIR_STORE[dir], e.code);
  ['left','right','up','down'].forEach(other=>{ // конфликт: та же клавиша была персонально занята другим направлением
    if(other!==dir && KEY_BINDS[other]===e.code){ KEY_BINDS[other]=''; Store.set(KEY_DIR_STORE[other],''); keyBindRowLabel(other); }
  });
  keyRebindListening=null; keyBindRowLabel(dir); haptic('success'); sfx.click();
}, true); // capture-фаза — раньше input.js, раньше keysBusy()
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
/* 16.09.2026 (владелец, макет koshelek-makett-final-16-09-2026.html, «одобрен»): постоянный
   текст в пилюле кошелька убран («будет постоянно место занимать») — вместо него подсказка
   #angarWalletTip показывается ровно один раз, при самом первом входе в Коллекцию у игрока,
   дальше никогда (Store-флаг, тот же приём, что welcomeDay/streakDay в core.js). */
function angarWalletTipMaybeShow(){
  if (Store.get('angarWalletTipSeen',0)) return;
  Store.set('angarWalletTipSeen',1);
  toggleCls('angarWalletTip','hidden',false);
  // 22.09.2026 (владелец, живая проверка на телефоне: «долго висит как-то») — раньше гасла
  // только при уходе с экрана (hangarLeave); теперь ещё и сама, через 5с, если игрок остался.
  setTimeout(()=>{ toggleCls('angarWalletTip','hidden',true); }, 5000);
}
wireOn('hangarBtn', 'click', ()=>{
  renderHangar(); setScreen('hangar'); sfx.click();
  angarWalletTipMaybeShow();
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
/* 05.09.2026 «Метка нового»: выходя из Тюнинга — считаем, что игрок пролистал каталог,
   точки «новое» гаснут до следующей реально новой партии (сравнение версий, не разовый флаг). */
function hangarLeave(){ Store.set('angarSeenVersion', GAME_VERSION); toggleCls('angarWalletTip','hidden',true); toMenu(); }
wireOn('hangarBackBtn', 'click', hangarLeave); // 28.08.2026: вернулась — экран был без единой видимой кнопки назад вне Telegram
/* ---------- Достижения + онбординг (модуль ach.js) ---------- */
function openAch(){ renderAch(); setScreen('ach'); sfx.click(); }
function closeAch(){ toMenu(); }
wireOn('achBtn', 'click', openAch);
wireOn('achBackBtn', 'click', closeAch); // 28.08.2026: вернулась, см. коммент у hangarBackBtn
/* Вкладка «Турниры»: честная таблица (модуль sync.js). 15.09.2026: экран «Топ соревнований»
   (modesTopScreen, свой набор compTop-элементов, topCatComp, renderTopComp) удалён целиком —
   его 5 дисциплин переехали в этот же #topCats/topCat/renderTop(), второй набор не нужен. */
let topCat='touch';
function achTabSel(mine){
  toggleCls('tabMine','sel',mine); toggleCls('tabTop','sel',!mine);
  toggleCls('achMineWrap','hidden',!mine); toggleCls('achTopWrap','hidden',mine);
  if(!mine) renderTop();
}
wireOn('tabMine', 'click',()=>{ achTabSel(true); sfx.click(); });
wireOn('tabTop', 'click',()=>{ achTabSel(false); sfx.click(); });
document.querySelectorAll('#topCats .topCat').forEach(b=>b.addEventListener('click',()=>{
  topCat=b.dataset.cat;
  document.querySelectorAll('#topCats .topCat').forEach(x=>x.classList.toggle('sel',x===b));
  renderTop(); sfx.click();
}));
/* 07.09.2026 «Куда делся первый игрок»: список цепочек, где я сыграл хоть один этап — с
   текущим статусом (ждёт этап N / завершена) и общим счётом. Своя строка (.relayMineRow),
   не .topIt — там ровно один факт в строке (место+имя+счёт), здесь два разных (кто играл +
   что сейчас со счётом/статусом), плющить в один формат было бы менее читаемо. */
function renderRelayMine(){
  const list=$('relayMineList'); if(!list) return;
  list.innerHTML='<div class="topMsg">'+L.topLoading+'</div>';
  if (!syncAvailable()){ list.innerHTML='<div class="topMsg">'+L.relaySignInFirst+'</div>'; return; }
  if (typeof syncRelayMyChains!=='function'){ list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; return; }
  /* 14.09.2026 (владелец, живой скрин: «Статус эстафет» тоже «таблица пока не отвечает»,
     баг 9/11 из очереди 13.09) — тот же класс, что уже различён текстом в renderTopFor()
     (баг 2, v1.478.271): офлайн и реальный сбой сервера показывали одно и то же сообщение.
     Этот экран рисуется отдельной функцией (своя строка на цепочку, не .topIt), поэтому
     прошлая правка её не задела — тот же приём здесь же, тем же способом (navigator.onLine),
     без новых строк — L.syncOffline/L.topTgOnly уже существуют. */
  const relayOfflineMsg = ()=> (typeof navigator!=='undefined' && navigator.onLine===false) ? (L.syncOffline||L.topTgOnly) : L.topTgOnly;
  syncRelayMyChains().then(function(d){
    if (screenName!=='relayMine') return; // ушёл с экрана, пока грузилось
    if (!d || !d.ok){ list.innerHTML='<div class="topMsg">'+relayOfflineMsg()+'</div>'; return; }
    if (!d.chains || !d.chains.length){ list.innerHTML='<div class="topMsg">'+L.relayMineEmpty+'</div>'; return; }
    list.innerHTML=d.chains.map(function(c){
      const names=(c.legs||[]).map(function(l){ return escapeHtml(l.name||'?'); }).join(' → ');
      // 20.09.2026 «Мягкое истечение» (владелец, прямое слово — переворачивает решение
      // 07.09.2026 «цепочка держится вечно», см. AI-DECISION-REGISTRY): тот же срок, что у
      // Дуэли (DUEL_TTL_MS), тот же дух — никого не обвиняем, просто честно перестаём висеть
      // «Ждёт» вечно. Ничего не меняет в relay_get_open (кому сервер предлагает подхватить
      // цепочку) — только в том, что видит здесь игрок, который уже вложился в свой этап.
      const expired = c.status==='open' && c.updated_at && (Date.now()-new Date(c.updated_at).getTime())>DUEL_TTL_MS;
      const statusTxt = c.status==='done' ? L.relayMineDone : (expired ? L.relayMineExpired : L.relayMineWaiting(c.leg));
      return '<div class="relayMineRow'+(c.status==='done'?' done':'')+'">'
        +'<div class="relayMineNames">'+names+'</div>'
        +'<div class="relayMineMeta"><span class="relayMineSc">'+fmtN(c.score)+'</span><span class="relayMineStatus">'+statusTxt+'</span></div>'
        +'</div>';
    }).join('');
  }).catch(function(){ if(screenName==='relayMine') list.innerHTML='<div class="topMsg">'+relayOfflineMsg()+'</div>'; });
}
wireOn('relayMineBtn', 'click', ()=>{ sfx.click(); haptic('light'); setScreen('relayMine'); renderRelayMine(); });
wireOn('relayMineBackBtn', 'click', ()=>{ sfx.click(); setScreen('menu'); }); // 17.09.2026: было setScreen('modes') — экран-посредник удалён 15.09.2026, аппаратную «Назад» тогда же поправили (ui.js:77), а эту круглую кнопку — забыли; тот же класс бага третий раз подряд (forgeBack/аппаратная-relayMine/эта)
/* ---------- Одна таблица, много входов (v1.51.0) ----------
   Гость играет полноценно, рекорд ждёт локально; вход — Telegram Login Widget (только браузер).
   Анонимных записей нет: без подписи Telegram в таблицу не встать — доверие дороже охвата. */
function accFill(){ // настройки: статус входа + кнопки (гость) / «Выйти» (веб-сессия)
  const st=$('accStatus'), out=$('accOutBtn'), del=$('accDeleteBtn');
  if(!st || typeof syncAvailable!=='function') return;
  const dw=$('dcWidget'), gw=$('gWidget');
  if (syncAvailable()){
    st.textContent=L.accIn(typeof syncAuthName==='function'?(syncAuthName()||''):'');
    if(dw) dw.innerHTML=''; if(gw) gw.innerHTML='';
    out.classList.toggle('hidden', !!syncInitData()); // из мини-аппа «выходить» нечего — ты дома
    if(del) del.classList.remove('hidden'); // 05.09.2026: в отличие от «Выйти», удалить есть что всегда, если вошёл — хоть из мини-аппа, хоть с веб-сессии
  } else {
    st.textContent=L.accGuest;
    out.classList.add('hidden');
    if(del) del.classList.add('hidden'); // гостю нечего удалять — ничего ещё не сохранял под личностью
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

/* 05.09.2026 «Удалить мои данные»: макет macet-udalit-dannye.html, одобрено. Тот же tg.showConfirm,
   что уже используется для замены вызова на дуэль (ui.js, duelBanner) — родной диалог, не свой поверх
   чужого. В отличие от того места, здесь НЕ применяем действие, если спросить не удалось никак —
   там тихое применение было безопаснее (потеря дуэли-вызова), тут цена ошибки не та же самая. */
wireOn('accDeleteBtn', 'click',()=>{
  sfx.click(); haptic('medium');
  if(typeof deleteMyData!=='function') return;
  const msg=L.accDeleteConfirm||'Это навсегда удалит все ваши данные: рекорды, покупки, трассы Мастерской. Отменить нельзя.';
  const go=()=>{
    deleteMyData().then(res=>{
      if(res && res.ok){
        Store.del('tgWebAuth'); Store.del('dcAuth'); Store.del('gAuth');
        toast(L.accDeleted||'Данные удалены', 'rgba(255,159,176,.5)');
        syncAuthChanged();
      } else {
        toast(L.accDeleteFail||'Не удалось, попробуйте ещё раз', 'rgba(255,159,176,.5)');
      }
    });
  };
  if(tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, ok=>{ if(ok) go(); }); }
  else if(typeof confirm==='function'){ if(confirm(msg)) go(); }
  else toast(L.accDeleteNoConfirm||'Подтверждение недоступно', 'rgba(255,159,176,.5)');
});

/* Свой рекорд в этой категории — тот, что лежит на устройстве. Нужен гостю: сервер про него
   не знает и знать не может, а «ты был бы 9-м из 15» — единственное, что превращает чужую
   таблицу из витрины чужих успехов в разговор о твоём месте в ней. */
function myBestFor(cat){
  const k = cat==='gyro'?'bestGyro' : cat==='touch'?'bestTouch' : cat==='keys'?'bestKeys'
          : cat==='dist'?'bestDist' : cat==='caravan'?'bestCaravan' : null;
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
/* 06.09.2026 «Топ соревнований»: раньше renderTop() жёстко знал свои id (topList/topMe/...)
   и свой единственный экран ('ach'). Когда 6 соревновательных категорий переехали на новый
   экран (modesTopScreen), понадобился второй, независимый набор id и своя переменная
   категории (topCatComp) — вместо копии функции renderTopFor() принимает экран/категорию/id
   параметрами, сама функция ниже (renderTop/renderTopComp) — тонкие обёртки под старые имена. */
function renderTopFor(screen, getCat, ids){
  const list=$(ids.list), me=$(ids.me);
  const wb=$(ids.wouldBe), jn=$(ids.join), dl=$(ids.dcLogin);
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
  const askCat=getCat(); // v1.282.20: медленный ответ прошлой вкладки больше не рисуется под нынешним заголовком
  /* 03.09.2026: «Трасса дня»/«Спидран» — свои двери (cosmogram-daily, action daily_top/
     speedrun_top), не общая scores/CATS таблица (у обоих честное «одно небо на всех»,
     у остальных пяти — нет). Ответ нарочно того же вида ({ok,top,me}), рендер ниже не знает разницы. */
  const topPromise = (askCat==='daily' && typeof syncDailyTop==='function')
    ? syncDailyTop(typeof trackDayKey==='function'?trackDayKey():'')
    : (askCat==='speedrun' && typeof syncSpeedrunTop==='function')
    ? syncSpeedrunTop(typeof SPEEDRUN_ETERNAL_DAY!=='undefined'?(speedrunRSGGet()?SPEEDRUN_RSG_DAY:SPEEDRUN_ETERNAL_DAY):'') // 03.09.2026 «Set Seed» / 11.09.2026 «RSG»: таблица зависит от текущего выбранного варианта на кнопке режима
    : (askCat==='slalom' && typeof syncSlalomTop==='function')
    ? syncSlalomTop(typeof SLALOM_ETERNAL_DAY!=='undefined'?SLALOM_ETERNAL_DAY:'') // 06.09.2026: тот же приём, что у Спидрана
    : (askCat==='biathlon' && typeof syncBiathlonTop==='function')
    ? syncBiathlonTop(typeof BIATHLON_ETERNAL_DAY!=='undefined'?BIATHLON_ETERNAL_DAY:'')
    : syncTop(askCat);
  // Спидран/Слалом/Биатлон меряют секунды (меньше — лучше), не очки/метры — своё форматирование в
  // обоих местах, где счёт показывается («твоё место» и сама строка), одной функцией, не копиями branch'а.
  const topFmt = v => (askCat==='speedrun'||askCat==='slalom'||askCat==='biathlon') ? fmtTime(v) : fmtN(v)+(askCat==='dist'?' '+(L.unitM||'м'):'');
  topPromise.then(d=>{
    if(screenName!==screen || getCat()!==askCat) return; // игрок уже ушёл или переключил категорию — не трогаем DOM
    /* 13.09.2026 (владелец: баг 2 — «Таблица пока не отвечает» одинаково и на офлайне, и
       на реальном сбое сервера, явный вопрос → «различать текстом», рекомендованный
       вариант): navigator.onLine — тот же приём, что уже у Мастерской для того же случая
       (js/forge.js:1328, страж 184) и у самих сетевых функций (js/sync.js). Обе строки уже
       жили в игре (L.syncOffline/L.topTgOnly) — новых текстов не потребовалось. */
    if(!d || !d.ok){
      const offline = typeof navigator!=='undefined' && navigator.onLine===false;
      list.innerHTML='<div class="topMsg">'+(offline?(L.syncOffline||L.topTgOnly):L.topTgOnly)+'</div>';
      return;
    }
    me.textContent = d.me ? (L.topMe+'#'+d.me.rank+' · '+topFmt(d.me.best)) : '';
    /* Гостю — его собственное место в чужой таблице и приглашение. Считаем здесь, а не на
       сервере: сервер не знает, кто это, и спрашивать его второй раз не о чем. */
    if (gost){
      const moy = myBestFor(askCat);
      const spisok = (d.top||[]);
      if (wb){
        if (moy>0 && spisok.length){
          // Спидран/Слалом/Биатлон: «выше тебя» — у кого время МЕНЬШЕ твоего, не больше (зеркально от остальных)
          const vyshe = (askCat==='speedrun'||askCat==='slalom'||askCat==='biathlon') ? spisok.filter(r=>Number(r.best)<moy).length
            : spisok.filter(r=>Number(r.best)>moy).length;
          wb.textContent = L.topWouldBe(topFmt(moy), vyshe+1, spisok.length);
          wb.classList.remove('hidden');
        } else wb.classList.add('hidden');
      }
      if (jn){
        // 06.09.2026: было setText('topJoinTitle'/'topJoinSub', ...) — id фиксированный, значит
        // писал бы в личный экран, даже когда jn на самом деле #compTopJoin. jn.children[0/1] —
        // позиционно, оба контейнера (index.html) держат тот же порядок (título, потом sub).
        if (jn.children[0]) jn.children[0].textContent = L.topJoinTitle;
        if (jn.children[1]) jn.children[1].textContent = L.topJoinSub;
        jn.classList.remove('hidden');
      }
    }
    // 18.09.2026 (сквозная проверка защиты от неожиданной формы ответа сервера): было
    // !d.top.length — правдивая проверка длины у СТРОКИ тоже проходит (труcm непустая строка
    // тоже даёт .length>0), а d.top.forEach/.map ниже это не переживёт. Array.isArray — тот же
    // приём, что уже используют все соседние потребители (syncPremiumOwned/syncGratitudeSky/
    // syncRelayMyChains/workshopList).
    if(!Array.isArray(d.top) || !d.top.length){ list.innerHTML='<div class="topMsg">'+L.topEmpty+'</div>'; return; }
    // 10.09.2026: Слалом/Биатлон/Спидран несут ленту прямо в строке топа — см. FIXED_COURSE_KEY выше
    topFixedTrackByPid={};
    if (FIXED_COURSE_KEY[askCat]) d.top.forEach(r=>{ if(r.pid && typeof r.track==='string') topFixedTrackByPid[r.pid]={track:r.track, skin:r.skin, name:r.name}; });
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
  }).catch(()=>{ if(screenName===screen && getCat()===askCat) list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; }); // 22.08.2026: сбой сети — честное сообщение вместо зависшего «Загрузка…»
}
function renderTop(){
  if (topCat==='touch'){ renderTopScoreAttack(); return; } // 15.09.2026: плитка «Score Attack» — слитый список, не обычная категория
  renderTopFor('ach', ()=>topCat, {list:'topList',me:'topMe',wouldBe:'topWouldBe',join:'topJoin',dcLogin:'dcLogin'});
}
/* 15.09.2026 «Score Attack, один список»: владелец — «какие есть привилегии между гироскоп,
   клавиатура и палец? просто иконка» — сервер по-прежнему хранит три честных, раздельных
   категории (touch/gyro/keys, cosmogram-top/index.ts CATS), но показываем их ОДНИМ списком:
   три параллельных запроса, слияние и сортировка по счёту на клиенте, у каждой строки —
   иконка способа управления (не смешиваем на сервере, только на экране). */
let scoreAttackGen=0;
const CTL_ICON={touch:'i-hand',gyro:'i-phone',keys:'i-keys'};
function renderTopScoreAttack(){
  const list=$('topList'), me=$('topMe'), wb=$('topWouldBe'), jn=$('topJoin'), dl=$('dcLogin');
  const gost=(typeof syncAvailable!=='function')||!syncAvailable();
  me.textContent=''; list.innerHTML='<div class="topMsg">'+L.topLoading+'</div>';
  if(wb) wb.classList.add('hidden'); if(jn) jn.classList.add('hidden');
  if(typeof syncTop!=='function'){ list.innerHTML='<div class="topMsg">'+L.topTgOnly+'</div>'; return; }
  if(gost){ if(dl){ dl.classList.remove('hidden'); if(!syncInitData()) dcMount(dl); } }
  else { if(dl){ dl.classList.add('hidden'); dl.innerHTML=''; } }
  const myGen=++scoreAttackGen;
  Promise.all(['touch','gyro','keys'].map(c=>syncTop(c).then(d=>({c,d})).catch(()=>({c,d:null})))).then(results=>{
    if(screenName!=='ach' || topCat!=='touch' || myGen!==scoreAttackGen) return; // ушёл с вкладки/экрана, пока грузилось
    const ok=results.filter(r=>r.d&&r.d.ok);
    if(!ok.length){
      const offline=typeof navigator!=='undefined' && navigator.onLine===false;
      list.innerHTML='<div class="topMsg">'+(offline?(L.syncOffline||L.topTgOnly):L.topTgOnly)+'</div>';
      return;
    }
    let merged=[];
    ok.forEach(r=>{ (r.d.top||[]).forEach(row=>merged.push(Object.assign({},row,{_ctl:r.c}))); });
    merged.sort((a,b)=>Number(b.best)-Number(a.best));
    merged=merged.slice(0,15);
    // «Моё место»: лучший из трёх личных рекордов — та же логика «выше тебя», что у renderTopFor,
    // просто относительно слитого списка, а не одной категории.
    const myVals={touch:myBestFor('touch'),gyro:myBestFor('gyro'),keys:myBestFor('keys')};
    const myBestCtl=Object.keys(myVals).reduce((a,b)=>myVals[a]>=myVals[b]?a:b);
    const moy=myVals[myBestCtl];
    const meRow=ok.map(r=>r.d.me).find(x=>x && Number(x.best)===moy);
    if(!gost && meRow) me.textContent=L.topMe+'#'+meRow.rank+' · '+fmtN(meRow.best);
    if(gost){
      if(wb){
        if(moy>0 && merged.length){
          const vyshe=merged.filter(r=>Number(r.best)>moy).length;
          wb.textContent=L.topWouldBe(fmtN(moy), vyshe+1, merged.length);
          wb.classList.remove('hidden');
        } else wb.classList.add('hidden');
      }
      if(jn){
        if(jn.children[0]) jn.children[0].textContent=L.topJoinTitle;
        if(jn.children[1]) jn.children[1].textContent=L.topJoinSub;
        jn.classList.remove('hidden');
      }
    }
    if(!merged.length){ list.innerHTML='<div class="topMsg">'+L.topEmpty+'</div>'; return; }
    const CTL_LBL={touch:L.modeTouch,gyro:L.modeGyro,keys:L.modeKeys};
    list.innerHTML=merged.map((r,i)=>'<div class="topIt'+(r.me?' me':'')+'" style="animation-delay:'+(Math.min(i,10)*60)+'ms"><span class="topN'+(i<3?' m'+(i+1):'')+'">'+(i+1)+
      (i<3?'<svg class="crownIc" viewBox="0 0 24 16"><use href="#i-crown"></use></svg>':'')+'</span>'+
      '<svg class="topCtlIc ic" title="'+escapeHtml(CTL_LBL[r._ctl]||'')+'"><use href="#'+CTL_ICON[r._ctl]+'"></use></svg>'+
      '<span class="topNm">'+escapeHtml(r.name)+(r.provider&&r.provider!=='tg'?' <b class="pvTag">'+escapeHtml(r.provider)+'</b>':'')+'</span>'+
      '<span class="topSc">'+fmtN(r.best)+'</span>'+
      (r.verified?'<span class="topVf" title="'+escapeHtml(L.topVerified||'')+'">'+ic('checkbadge')+'</span>':'')+
      (!r.me&&r.pid?'<button class="topGh" data-cat="'+r._ctl+'" data-gh="'+(Math.floor(Number(r.pid))||0)+'" data-best="'+Math.floor(Number(r.best)||0)+'" title="'+L.ghostGo+'">'+ic('ghost')+'</button>':'')+
      (!r.me&&r.pid?'<button class="topWatch" data-cat="'+r._ctl+'" data-wt="'+(Math.floor(Number(r.pid))||0)+'" title="'+L.topWatch+'">'+ic('play')+'</button>':'')+'</div>').join('');
  });
}
/* ---------- Призрак из топа: скачать чужой трек и лететь рядом ----------
   Учимся тактике и манёврам рекордсмена + живая витрина скинов (его самолётик виден в полёте). */
/* 10.09.2026 (владелец: «нужно чтобы в соревнованиях тоже были кнопки просмотра и призрак»):
   Слалом/Биатлон/Спидран — свои таблицы (cosmogram-daily), не scores/ghosts. Кнопки
   .topGh/.topWatch рисуются на их строках тем же общим шаблоном (renderTopFor ниже их не
   различает), но раньше вели в syncGhostGet → GHOST_CATS в cosmogram-sync, где этих трёх
   категорий просто никогда не было — 400 bad_request, «небо не сохранилось» врало на
   каждую строку. У этих трёх трасса ВСЕГДА одна и та же (ETERNAL_DAY), лента едет прямо
   в самой строке топа (track/skin добавлены в _top ниже, cosmogram-daily), отдельный сид
   не нужен вообще — ключ трассы уже известен заранее, тот же, что startGame() сам строит
   для runMode==='slalom'/'biathlon'/'speedrun' (см. mapSeedKey, ui.js:336-338): ДЕНЬ·режим. */
const FIXED_COURSE_KEY = {
  slalom: (typeof SLALOM_ETERNAL_DAY!=='undefined'?SLALOM_ETERNAL_DAY:'')+'·slalom',
  biathlon: (typeof BIATHLON_ETERNAL_DAY!=='undefined'?BIATHLON_ETERNAL_DAY:'')+'·biathlon',
  speedrun: (typeof SPEEDRUN_ETERNAL_DAY!=='undefined'?SPEEDRUN_ETERNAL_DAY:'')+'·speedrun',
};
let topFixedTrackByPid={}; // pid → {track,skin,name} — только для категорий из FIXED_COURSE_KEY, перестраивается на каждый renderTopFor
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
// 06.09.2026 «Топ соревнований»: было жёстко #topList/topCat/'ach' — второй экран
// (#compTopList/topCatComp/'modesTop') нуждается в тех же двух дверях (призрак/смотреть),
// иначе кнопки в соревновательных строках были бы нарисованы, но мертвы. Тело функций не
// менялось, только topCat→getCat(), 'ach'→screen — параметрами, как и renderTopFor выше.
function wireTopGhostButtons(listId, getCat, screen){
  wireOn(listId, 'click', e=>{
    const b=e.target.closest('.topWatch'); if(!b) return;
    const pid=Math.floor(Number(b.dataset.wt));
    if(!pid || b._busy) return;
    const cat0=b.dataset.cat||getCat(); // 15.09.2026: Score Attack — слитый список из 3 категорий, у каждой строки своя настоящая (b.dataset.cat), getCat() тут всегда 'touch'
    const fixedKey=FIXED_COURSE_KEY[cat0];
    if (fixedKey){ // Слалом/Биатлон/Спидран: лента уже в памяти, без сети — см. FIXED_COURSE_KEY выше
      sfx.click(); haptic('light');
      const row=topFixedTrackByPid[pid];
      if (!row || !row.track){ toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; }
      const g=ghostParse(row.track);
      if(!g){ toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; }
      g.cx=true;
      champTrack=g; theaterDay=fixedKey; theaterRecord=true;
      theaterChamp={ name:String(row.name||'').slice(0,64), skin:Math.floor(Number(row.skin))||0 };
      runMode='theater'; startGame();
      return;
    }
    if (typeof syncGhostGet!=='function') return;
    sfx.click(); haptic('light'); b._busy=1; b.textContent='…';
    const gen=runNow(); // то же поколение, что у соседней двери: медленный ответ не должен запускать игру задним числом
    syncGhostGet(pid, cat0).then(d=>{
      b._busy=0; b.innerHTML=ic('play');
      if(!runSame(gen) || screenName!==screen) return; // зритель ушёл, пока летел ответ
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
  wireOn(listId, 'click', e=>{
    const b=e.target.closest('.topGh'); if(!b) return;
    const pid=Math.floor(Number(b.dataset.gh));
    if(!pid) return;
    const cat0=b.dataset.cat||getCat(); // v1.282.20: категорию тоже замораживаем — игрок мог переключить вкладку; 15.09.2026: Score Attack — своя настоящая категория на строке (b.dataset.cat), не общая getCat()
    const fixedKey=FIXED_COURSE_KEY[cat0];
    if (fixedKey){ // Слалом/Биатлон/Спидран: лента уже в памяти, без сети — см. FIXED_COURSE_KEY выше
      sfx.click(); haptic('light');
      const row=topFixedTrackByPid[pid];
      if (!row || !row.track){ b.innerHTML=ic('ghost'); toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; }
      b.innerHTML=ic('check');
      ghostSetForeign({track:row.track, skin:row.skin, name:row.name, pid:pid, cat:cat0, best:Math.floor(Number(b.dataset.best))||0, seed:null});
      foreignFrom='top'; runMode=cat0; // сама трасса всегда одна и та же — сид не нужен, но режим должен совпасть с дисциплиной ленты
      toast(L.ghostWith(row.name||''),'rgba(191,232,255,.45)');
      startGame();
      return;
    }
    if(typeof syncGhostGet!=='function') return;
    sfx.click(); haptic('light'); b.textContent='…';
    const gen=runNow();
    syncGhostGet(pid, cat0).then(d=>{
      /* v1.282.20: этот колбэк ЗАПУСКАЕТ игру. Медленный ответ (до 10с) перезапускал забег
         прямо посреди полёта: состояние стиралось без посадки, очки и лента уходили в никуда,
         а счётчик игр накручивался дважды. Сверяем поколение и экран. */
      if(!runSame(gen) || screenName!==screen) return;
      // v1.103.0 «Тихий нуль»: знак результата рисуется ПОСЛЕ результата — неудача возвращает призрака, галочка не врёт
      if(!d || !d.ok){ b.innerHTML=ic('ghost'); toast(L.ghostNone,'rgba(255,159,176,.5)'); haptic('error'); return; } // владелец скрыл трек
      b.innerHTML=ic('check');
      ghostSetForeign({track:d.track, skin:d.skin, name:d.name, pid:pid, cat:cat0, best:Math.floor(Number(b.dataset.best))||0, seed:d.seed});
      foreignFrom='top';
      toast(L.ghostWith(d.name||''),'rgba(191,232,255,.45)');
      startGame(); // призрак подхватится в ghostLoad — окно онбординга его не трогает
    }).catch(()=>{ if(runSame(gen) && screenName===screen) b.innerHTML=ic('ghost'); }); // 22.08.2026: сбой сети — кнопка не виснет на «…» вечно
  });
}
wireTopGhostButtons('topList', ()=>topCat, 'ach');

/* typeof-страховки: при миксе версий из кэша (старый core + новый ui) подписи молчат, но applyLang не падает (v1.55.0) */
function morseHapLabel(){ rowSw('setMorseHapBtn', typeof morseHapOn==='function'&&morseHapOn()); setWellFill(); }
const setMorseHapBtn=$('setMorseHapBtn');
if (setMorseHapBtn) setMorseHapBtn.addEventListener('click', ()=>{
  const on=!(typeof morseHapOn==='function'&&morseHapOn());
  Store.set('morseHap', on?1:0); morseHapLabel(); haptic('light'); sfx.click();
  if (on && typeof hapticMorse==='function') hapticMorse(myCallsign()); // включил — сразу почувствуй свою подпись
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
// 15.09.2026 «Равноправие»/«Благодарность»: оба — простые статичные экраны, открываются
// только из меню, тот же минимальный приём, что у setScreen+toMenu пары hangar/ach выше.
wireOn('equalityBtn', 'click', ()=>{ setScreen('equality'); sfx.click(); charterSignFill(); });
wireOn('equalityBackBtn', 'click', toMenu);
// 16.09.2026 «Галерея видео-рекордов»: дверь открывает обычный экран (тот же setScreen(), что и
// остальные) — сама галерея (#flightGalleryGrid клики, плеер) живёт в js/cinema.js, здесь только
// навигация, как у всех остальных экранов на этой странице.
wireOn('flightGalleryBtn', 'click', ()=>{ if (typeof galleryOpen==='function') galleryOpen(); });
wireOn('flightGalleryBackBtn', 'click', toMenu);
/* 15.09.2026 «Равноправие»: подпись под Хартией — общий счётчик (cosmogram-charter, js/sync.js).
   charterSignFill() — при каждом открытии экрана, спрашивает status заново (число могло
   вырасти у других игроков, и свежая правда важнее лишнего запроса раз за открытие экрана). */
let _chSignBusy=false;
function charterSignFill(){
  const lead=$('chSignLead'), btn=$('chSignBtn'), lbl=$('chSignBtnLbl'), count=$('chSignCount');
  if(!lead||!btn||!lbl||!count) return;
  lead.textContent=L.chSignLead; lbl.textContent=L.chSignBtnLbl; count.textContent='';
  charterStatus().then(function(r){
    if(!r || !r.ok){ count.textContent=L.chSignOffline; return; }
    count.textContent=L.chSignCount(r.count);
    if(r.signed){ lead.textContent=L.chSignLeadDone; btn.classList.add('sel'); lbl.textContent=L.chSignBtnDone; }
    else { btn.classList.remove('sel'); }
  });
}
wireOn('chSignBtn', 'click', function(){
  const btn=$('chSignBtn');
  if(!btn || btn.classList.contains('sel') || _chSignBusy) return; // уже подписано — необратимо, второй раз не шлём
  if(!syncAvailable()){ toast(L.chSignOffline,'rgba(255,159,176,.5)'); return; }
  _chSignBusy=true; haptic('light'); sfx.click();
  charterSign().then(function(r){
    _chSignBusy=false;
    if(!r || !r.ok){ toast(L.chSignOffline,'rgba(255,159,176,.5)'); return; }
    const lead=$('chSignLead'), lbl=$('chSignBtnLbl'), count=$('chSignCount');
    if(lead) lead.textContent=L.chSignLeadDone;
    if(lbl) lbl.textContent=L.chSignBtnDone;
    if(count) count.textContent=L.chSignCount(r.count);
    btn.classList.add('sel');
    haptic('success');
  });
});
/* 15.09.2026 «Небо благодарности»: заглушка «Скоро» заменена на реальный экран (макет
   macet-15-09-nebo-blagodarnosti.html, одобрено «делай»). Бэкенд (gratitude_stars,
   cosmogram-sync: gratitude_sky/gratitude_star/gratitude_create_invoice/gratitude_report)
   уже жил на сервере до этой правки — здесь только клиент. Позиция звезды НЕ хранится на
   сервере — детерминированный ГПСЧ по id даёт те же координаты при каждом заходе (владелец:
   «звезда = фиксированная позиция, не тасуется при перезаходе»), тот же приём экономит поле в БД. */
let grStars=[], grAmt=28, grBubbleStarId=null, grRaf=0; // 18.09.2026 (владелец, явно: «начинается с 28») — было 50, число подтверждено словами, не подобрано
function grSeeded(id){ // mulberry32 — детерминированный ГПСЧ, та же звезда всегда там же
  let a=(id*2654435761)>>>0;
  return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
function grStarPos(id){
  const rnd=grSeeded(id);
  return { x:20+rnd()*360, y:20+rnd()*190, r:0.7+rnd()*1.6, ph:rnd()*6.28, sp:0.6+rnd()*1.2 };
}
function grResizeCanvas(){
  const cv=$('grSky'); if(!cv) return;
  const rect=cv.getBoundingClientRect(); if(!rect.width||!rect.height) return;
  const dpr=Math.min(2, window.devicePixelRatio||1);
  cv.width=Math.round(rect.width*dpr); cv.height=Math.round(rect.height*dpr);
}
function grDraw(t){
  const scr=$('gratitudeScreen'), cv=$('grSky');
  if(!scr || scr.classList.contains('hidden') || !cv){ grRaf=0; return; }
  const ctx=cv.getContext('2d'), w=cv.width, h=cv.height;
  if(!w||!h){ grRaf=requestAnimationFrame(grDraw); return; }
  ctx.clearRect(0,0,w,h);
  for(const s of grStars){
    const tw=0.5+0.5*Math.sin(t*0.0009*s.sp+s.ph);
    ctx.globalAlpha=tw; ctx.fillStyle='#dfe8ff';
    ctx.beginPath(); ctx.arc(s.x/380*w, s.y/230*h, s.r*(w/380), 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha=1;
  grRaf=requestAnimationFrame(grDraw);
}
function grFillNameRow(){
  const row=$('grNameRow'); if(!row) return;
  const anonRow=$('grAnonRow'), anon = anonRow && anonRow.classList.contains('on');
  row.textContent='';
  // 18.09.2026 (владелец, живой скрин: «эта подсказка вообще лишняя» — галочка «Анонимно» под
  // ней уже говорит то же самое) — раньше сюда писался L.grNameHidden («Имя скрыто — отправите
  // анонимно»), повторяя своими словами состояние чекбокса прямо над собой. Анонимно — строка
  // просто пустая (.grNameRow:empty в index.html схлопывает и отступ под ней).
  if(anon) return;
  const lbl=document.createElement('span'); lbl.textContent=L.grNameShownLbl;
  const b=document.createElement('b'); b.textContent=(typeof syncAuthName==='function' && syncAuthName()) || L.grNameFallback;
  row.appendChild(lbl); row.appendChild(b);
}
function gratitudeSkyFill(){
  grResizeCanvas();
  const signedIn = typeof syncAvailable==='function' && syncAvailable();
  const form=$('grForm'), sendBtn=$('grSendBtn'), signIn=$('grSignIn');
  if(form) form.classList.toggle('hidden', !signedIn);
  if(sendBtn) sendBtn.classList.toggle('hidden', !signedIn);
  if(signIn){ signIn.classList.toggle('hidden', signedIn); if(!signedIn) signIn.textContent=L.gratitudeSignInFirst; }
  if(signedIn) grFillNameRow();
  if(typeof syncGratitudeSky!=='function') return;
  syncGratitudeSky().then(function(r){
    grStars = (r && r.ok && Array.isArray(r.stars)) ? r.stars.map(function(row){ return Object.assign({id:row.id}, grStarPos(row.id)); }) : [];
    const cnt=$('grStarCount'), empty=$('grEmpty');
    if(grStars.length>0){
      // 24.09.2026 (владелец, живой скрин с обводкой: «три места, разные звёзды») — было
      // textContent='★ '+N (обычный текстовый глиф, плоский, без градиента) — расходился с
      // suma/кнопкой отправки ниже, у которых #i-gr-star (объёмный золотой SVG). Теперь везде
      // одна и та же иконка.
      if(cnt){ cnt.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-gr-star"></use></svg>'+grStars.length; cnt.classList.remove('hidden'); }
      if(empty) empty.classList.add('hidden');
    } else {
      if(cnt) cnt.classList.add('hidden');
      if(empty){ empty.textContent=L.gratitudeEmptySky; empty.classList.remove('hidden'); }
    }
    if(!grRaf) grRaf=requestAnimationFrame(grDraw);
  });
}
function grBubbleHide(){ const b=$('grBubble'); if(b) b.classList.remove('show'); grBubbleStarId=null; }
/* 16.09.2026: см. комментарий у .grBubble (index.html) — считает реальную позицию пузырька
   ПОСЛЕ того, как в него лёг текст (offsetWidth/Height настоящие, не догадка), а не заранее
   фиксированным -112%. Зовётся и сразу (примерная сторона по точке), и ещё раз после того, как
   имя/комментарий пришли с сервера (текст мог стать длиннее/короче — высота пузырька меняется). */
function grPositionBubble(hit){
  const bubble=$('grBubble'), wrap=$('grSkyWrap'); if(!bubble||!wrap) return;
  const wrapR=wrap.getBoundingClientRect();
  const px=hit.x/380*wrapR.width, py=hit.y/230*wrapR.height;
  /* 18.09.2026 (пойман стражем 228 в полном прогоне — на узком экране пузырёк вылезал за левый
     край): .grBubble абсолютно спозиционирован только через left (right:auto), а ширина у него
     auto — по правилам CSS shrink-to-fit доступное место для такого элемента отсчитывается ОТ
     его собственного left ДО правого края контейнера, то есть offsetWidth ЗАВИСИТ от текущего
     left. Раньше left читался ДО перепозиционирования — на первом вызове left ещё от прошлой
     точки (или 0/unset), offsetWidth получался НЕ ТЕМ, что будет после переезда, клэмп считал
     по чужой ширине. Сброс left в 0 перед чтением — то же самое сначала-переезд-потом-замер, что
     уже применяется у центрируемых заголовков (centerTitleOnHeader) — даёт задаче ту же ширину,
     что была бы при максимально доступном месте (по факту ограничена max-width:78% в CSS,
     тем самым числом, что и раньше, просто честно измеренным). */
  bubble.style.left='0px';
  const bw=bubble.offsetWidth, bh=bubble.offsetHeight;
  const spaceAbove=py, spaceBelow=wrapR.height-py;
  const above = spaceAbove>=bh+14 || spaceAbove>=spaceBelow;
  let left=Math.max(bw/2+4, Math.min(wrapR.width-bw/2-4, px));
  bubble.style.left=left+'px';
  bubble.style.top=(above ? py-14 : py+14)+'px';
  bubble.style.transform='translate(-50%,'+(above?'-100%':'0')+')';
}
wireOn('grSky','click',function(ev){
  const cv=$('grSky'); if(!cv) return;
  const rect=cv.getBoundingClientRect();
  const px=(ev.clientX-rect.left)/rect.width*380, py=(ev.clientY-rect.top)/rect.height*230;
  let hit=null, best=16;
  for(const s of grStars){ const d=Math.hypot(s.x-px, s.y-py); if(d<best){ best=d; hit=s; } }
  if(!hit){ grBubbleHide(); return; }
  grBubbleStarId=hit.id;
  const bubble=$('grBubble');
  const nameEl=$('grBubbleName'), cEl=$('grBubbleComment');
  if(nameEl) nameEl.textContent=''; if(cEl) cEl.textContent='';
  if(bubble){ bubble.classList.add('show'); grPositionBubble(hit); }
  sfx.click(); haptic('light');
  syncGratitudeStar(hit.id).then(function(r){
    if(grBubbleStarId!==hit.id) return; // игрок уже тапнул другую звезду, пока грузилось
    // 18.09.2026 (владелец, живой скрин: «по комментарию и по имени вообще ничего, почему так?»)
    // — раньше любой сбой запроса молча закрывал пузырёк через grBubbleHide(). Живые логи
    // Supabase (function_edge_logs) нашли настоящую причину именно в его случае: cosmogram-sync
    // на несколько секунд реально ответил 404 (не офлайн — Wi-Fi был, сам поймал себя на ложном
    // выводе про авиарежим), сам восстановился. Раз причина может быть любой (не только офлайн) —
    // текст нейтральный, тот же L.grSendFail, что уже стоит у соседней кнопки «Отправить» этого
    // же экрана, не выдуман заново и не утверждает конкретную причину, которую не проверить.
    if(!r || !r.ok){
      if(nameEl) nameEl.textContent='';
      if(cEl) cEl.textContent=L.grSendFail||'Не получилось — попробуйте ещё раз';
      if(bubble) grPositionBubble(hit);
      return;
    }
    if(nameEl) nameEl.textContent = r.name || L.grAnonLabel;
    if(cEl) cEl.textContent = r.comment || '';
    if(bubble) grPositionBubble(hit); // текст пришёл — высота пузырька могла измениться, пересчитать сторону
  });
});
// 18.09.2026 (владелец: «людям не нужна возможность составлять жалобу, мы сами будем за этим
// смотреть») — обработчик #grBubbleReport убран вместе с самой кнопкой (index.html); syncGratitudeReport
// (js/sync.js) оставлен нетронутым — серверный маршрут может ещё пригодиться нам самим напрямую.
/* 16.09.2026 (владелец: «фиксированная ставка... человек сам выберет сколько угодно, не
   ограничивай его, если у него 7 звёзд есть, ему что по одной мне слать?!») — было ±10: со
   старта в 1 (после «Коснись звезды» правки ниже сумма по умолчанию не менялась, минимум и так
   был 1) шаг в 10 не давал остановиться ровно на 7 — либо 1, либо сразу 11, которых может не
   быть. Шаг ±1 остался тем же — просто без пропусков между значениями.
   18.09.2026 (владелец, живо, матом: «я изначально говорил, что человек может просто ввести...
   от 50 по одному тыкать — это только для таких вафелов, как ты, удобная хуйня») — «физические
   кнопки, не числовые виджеты» (16.09.2026, комментарий выше был написан ДО этого разговора)
   здесь больше не действует: #grAmtNum стал настоящим <input type="number">, печатать теперь
   можно сразу, ± остаются рядом для тех, кому удобнее тапать — не одно вместо другого, оба
   разом. Отдельная память (comfort_over_precision) про ЭТОТ экран не про сумму — там был другой
   инструмент (Партитура, расстановка препятствий на своей трассе), не платёжная форма. */
wireOn('grAmtUp','click',function(){ grAmt=Math.min(100000, grAmt+1); const n=$('grAmtNum'); if(n) n.value=grAmt; sfx.click(); haptic('light'); });
wireOn('grAmtDown','click',function(){ grAmt=Math.max(1, grAmt-1); const n=$('grAmtNum'); if(n) n.value=grAmt; sfx.click(); haptic('light'); });
wireOn('grAmtNum','input',function(){ // печать напрямую — тот же диапазон 1..100000, что и у ±
  const n=$('grAmtNum'); if(!n) return;
  const v=Math.floor(Number(n.value));
  if(Number.isFinite(v) && v>0) grAmt=Math.min(100000, v); // сырое значение НЕ поджимаем на каждый символ — иначе печать «1» на пути к «100» дёргала бы курсор
});
wireOn('grAmtNum','blur',function(){ // ушёл с поля — вот теперь причёсываем (пусто/0/мимо диапазона на самом уходе, не посреди печати)
  const n=$('grAmtNum'); if(!n) return;
  const v=Math.floor(Number(n.value));
  grAmt = (Number.isFinite(v) && v>0) ? Math.min(100000, v) : 1;
  n.value=grAmt;
});
wireOn('grCommentInput','input',function(){ // счётчик символов — тот же язык, что у #feedbackCount
  const el=$('grCommentInput'), cnt=$('grCommentCount'); if(!el || !cnt) return;
  cnt.textContent = el.value.length+' / 300';
});
wireOn('grAnonRow','click',function(){ const row=$('grAnonRow'); if(row) row.classList.toggle('on'); grFillNameRow(); sfx.click(); haptic('light'); });
let _grSendBusy=false;
wireOn('grSendBtn','click',function(){
  if(_grSendBusy) return;
  const tw = typeof tgApp==='function' ? tgApp() : null;
  if(!tw || !tw.openInvoice){ toast(L.premiumTgOnly,'rgba(255,159,176,.5)'); haptic('error'); return; }
  _grSendBusy=true;
  const commentEl=$('grCommentInput');
  const comment = commentEl ? String(commentEl.value||'').slice(0,300) : '';
  const anonRow=$('grAnonRow'), anon = anonRow && anonRow.classList.contains('on');
  syncGratitudeCreateInvoice(grAmt, comment, anon).then(function(res){
    if(!res || !res.ok || !res.link){ _grSendBusy=false; toast(L.grSendFail,'rgba(255,159,176,.5)'); haptic('error'); return; }
    // 15.09.2026: _grSendBusy снимается тут, не сразу после создания инвойса — иначе игрок
    // успевал натыкать «Отправить» ещё несколько раз, пока лист оплаты Stars ещё открыт,
    // и каждый тап заводил в gratitude_stars СВОЮ повисшую запись с telegram_charge_id=NULL
    // (звезда там заводится сразу, до оплаты — иначе негде хранить комментарий между созданием
    // инвойса и вебхуком, см. комментарий у gratitude_create_invoice на сервере). openInvoice
    // по контракту Telegram Web App SDK всегда зовёт колбэк, когда лист закрыт — неважно как
    // (оплата/отмена/провал), запасного таймаута не нужно.
    /* 18.09.2026 (сквозная проверка, найдено при поиске похожих дыр в игре целиком) — та же
       дыра, что и у angarBuyPremium(): если tw.openInvoice() сам бросит исключение синхронно,
       колбэк не позовётся, _grSendBusy не снимется никогда, кнопка «Отправить» замолкнет
       навсегда до перезагрузки. */
    try{
      tw.openInvoice(res.link, function(status){
        _grSendBusy=false;
        if(status!=='paid') return;
        if(commentEl) commentEl.value='';
        /* 25.09.2026 (владелец, живой макет macet-25-09-blagodarnost-tost.html): было 1.5с
           и один и тот же безличный текст всем всегда — «мы получили деньги как спасибо, а
           в ответ невзрачная быстро гаснущая табличка». Теперь 4.5с (подтверждено живьём на
           телефоне) и случайный выбор из нескольких тёплых формулировок — «не должны
           постоянно всем говорить одно и то же». */
        const grSentPool=(L.grSentPool&&L.grSentPool.length)?L.grSentPool:[L.grSent];
        toast(grSentPool[Math.floor(Math.random()*grSentPool.length)],'rgba(240,192,64,.6)',4500);
        sfx.buy(); haptic('success');
        gratitudeSkyFill();
      });
    }catch(e){ _grSendBusy=false; toast(L.grSendFail,'rgba(255,159,176,.5)'); haptic('error'); }
  });
});
window.addEventListener('resize', function(){ const scr=$('gratitudeScreen'); if(scr && !scr.classList.contains('hidden')) grResizeCanvas(); });
wireOn('gratitudeBtn', 'click', ()=>{ setScreen('gratitude'); gratitudeSkyFill(); sfx.click(); });
wireOn('gratitudeBackBtn', 'click', toMenu);
wireOn('feedbackText', 'input', feedbackUpdateCount);

/* ---------- Локализация DOM ---------- */
function applyLang(){
  resetUniformTitleSize(); // 15.09.2026: смена языка — тексты меню-заголовков другие, старый общий кегль не годится
  // v1.34.0 «Единая палуба»: иконки перед текстом убраны из всех окон — кнопки говорят текстом
  /* 13.08.2026: подписи pillGyro/pillTouch/pillDist/pillBullet больше некому раздавать —
     строка рекордов с главного экрана убрана. Сами ключи в словаре core.js оставлены:
     core.js — ядро, и вычищать из него пять языков ради четырёх мёртвых строк дороже,
     чем оставить. Записано в долги. */
  /* 15.09.2026: #startBtn («Начать полёт») стал карточкой карусели «Классика» — своя подпись
     (L.modeClassic/L.modeClassicD) льётся вместе с остальными шестью внутри heroCarouselFill()
     ниже, не отдельным setText('startBtn',L.start) как раньше. */
  /* 13.08.2026: тексты «тесно» зависят от ориентации — их раздаёт tooNarrowText(),
     иначе смена языка возвращала бы совет «поверните экран» лежащему набок телефону. */
  if (typeof tooNarrowText==='function') tooNarrowText(window.innerWidth > window.innerHeight);
  heroCarouselFill(); // 15.09.2026: #modesBtn убран с главного совсем — 7 карточек карусели несут весь язык
  if (typeof forgeFill==='function') forgeFill(); // конструктор трассы — свой язык (v1.68.0)
  // 15.09.2026: заголовок шага и текст кнопки-подтверждения не входят в forgeFill() (у них
  // отдельные функции FORGE_STEP_TITLE()/FORGE_STEP_CONFIRM_LBL(), вызываемые из forgeSubTabSet).
  // Полный forgeSubTabSet(forgeSub) здесь нельзя — он же закрывает лист точек, снимает «взведённый»
  // стикер и сбрасывает ptSelIdx, что стирает середину правки игрока при простой смене языка.
  if (typeof FORGE_STEP_TITLE==='function' && typeof forgeSub!=='undefined'){
    const _fst=$('forgeStepTitle'); if(_fst) _fst.textContent=FORGE_STEP_TITLE()[forgeSub];
    const _fcl=$('forgeStepConfirmLbl'); const _fcLbl=FORGE_STEP_CONFIRM_LBL()[forgeSub]; if(_fcl && _fcLbl) _fcl.textContent=_fcLbl;
  }
  if (typeof workshopFillLabels==='function') workshopFillLabels(); // 05.09.2026 «Мастерская» — свой язык, тот же приём
  angarFillFilterChips(); // 06.09.2026: чипы Тюнинга — свой язык, тот же приём (no-op, если экран сейчас не открыт — box отсутствует в DOM только у скрытых частей своей же разметки, сама разметка всегда в DOM)
  if (typeof ptFill==='function') ptFill(); // 01.09.2026: Партитура — своя лента, тот же вызов смены языка
  if (typeof cardFill==='function') cardFill(); // карточка для скриншота — свой язык (v1.73.0)
  if (typeof galleryFillLabels==='function') galleryFillLabels(); // 16.09.2026 «Галерея видео-рекордов» — дверь/заголовок экрана/подписи, тот же приём
  setText('finalScoreLabel',L.finalScoreLabel);
  setText('hangarBtn',L.hangar);
  setText('feedbackBtn',L.feedbackBtn);
  setText('equalityBtn',L.equalityBtn);
  setText('equalityTitle',L.equalityTitle);
  setText('gratitudeBtn',L.gratitudeBtn);
  setText('gratitudeTitle',L.gratitudeTitle);
  setText('grCaption',L.grLead); setText('grCardT',L.grCardT);
  setText('grAnonLbl',L.grAnonLbl);
  setText('grSendLbl',L.grSendLbl);
  // 18.09.2026 (владелец, живой скрин с разметкой): отдельные ярлыки «Комментарий»/«Сколько Stars —
  // решаете сами» убраны целиком — grCommentLbl/grAmountLbl (i18n.js) и их элементы (index.html)
  // удалены вместе с этим вызовом. Приглашение к комментарию теперь целиком внутри плейсхолдера.
  const grCiEl=$('grCommentInput'); if(grCiEl) grCiEl.placeholder=L.grCommentPh;
  if (typeof grFillNameRow==='function') grFillNameRow(); // 15.09.2026: «Покажется как:»/«Имя скрыто» — свой язык
  // 15.09.2026: signIn/empty заполняются один раз в gratitudeSkyFill() (реальный запрос к серверу) —
  // полный повторный вызов здесь на каждую смену языка был бы лишним сетевым запросом; текст
  // обновляем на месте, только если сейчас реально виден (тот же приём, что у FORGE_STEP_TITLE).
  const _grSignIn=$('grSignIn'); if(_grSignIn && !_grSignIn.classList.contains('hidden')) _grSignIn.textContent=L.gratitudeSignInFirst;
  const _grEmpty=$('grEmpty'); if(_grEmpty && !_grEmpty.classList.contains('hidden')) _grEmpty.textContent=L.gratitudeEmptySky;
  // 15.09.2026: сам текст Хартии (#equalityScreen .charterBody) НЕ переводится язык-переключателем —
  // канонический документ существует только на русском (.knowledge/CHARTER.md), машинный перевод
  // юридически-ценностного текста рискует исказить смысл; заголовок экрана и кнопка меню — переведены.
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
  setText('accDeleteBtn',L.accDelete); // 05.09.2026
  if(screenName==='settings') accFill(); if(screenName==='over') webJoinFill(); // виджет монтируется лениво — только на открытом экране
  setText('restartBtn',L.restart);
  setText('pauseMenuBtn',L.menu);
  setText('hangarTitle',L.hangar);
  setText('brandSub',L.brandSub);          // 13.08.2026: обещание игры — на языке игрока
  setText('angarWalletTip',L.walletYours); // 13.08.2026: подпись кошелька под кнопкой покупки; 16.09.2026 — переехала из постоянной скрытой подписи в тексте всплывающей подсказки-одноразки (angarWalletTipMaybeShow)
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
     режимов — modeTouch/modeGyro/modeKeys/dist/modeDaily/modeSpeedrun/modeCaravan),
     новых переводов не завожу. */
  const TOP_CAT_LBL={touch:L.modeClassic,daily:L.modeDaily,speedrun:L.modeSpeedrun,caravan:L.modeCaravan,slalom:L.modeSlalom,biathlon:L.modeBiathlon}; // 15.09.2026: touch — теперь плитка «Score Attack» (слитый список touch/gyro/keys), gyro/keys/dist отдельными плитками больше не бывают
  document.querySelectorAll('.topCat').forEach(function(b){
    const lbl=b.querySelector('.topCatLbl'); if(lbl) lbl.textContent=TOP_CAT_LBL[b.dataset.cat]||'';
  });
  setText('relayMineTitle', L.relayMineTitle);
  setText('relayMineBtnLbl', L.relayMineBtnLbl);
  setText('diagBtn',L.diagBtn);
  setText('diagTitle',L.diagBtn); // v1.66.3: экран сервисного центра; 28.08.2026: diagBackBtn — круглая иконка, текст не пишем
  setText('csCap',L.csCap); // v1.66.3: подпись позывного в «Профиле»
  setText('diagMoreBtn',L.moreLbl); // 13.08.2026: спойлер «Ещё» — тот же ярлык, что в настройках
  gyroRowLabel(); sensLabel(); soundLabel(); musicLabel(); langLabel(); vibroLabel(); gfxLabel(); gyroStatus(); morseHapLabel(); csFill(); setWellFill(); textScaleLabel(); keyBindAllLabels(); keyBindRowsVisibility(); // v1.284.20: тумблер гироскопа рисуется первым — он гасит соседние строки, значит обязан отработать до них. 05.09.2026: morseLabel() убран — Морзянка больше не тумблер Настроек; 09.09.2026: textScaleLabel()/keyBindAllLabels() — та же роль для «Размера текста»/переназначения клавиш; keyBindRowsVisibility() — прячет переназначение на сенсорных, там нет клавиатуры
  const grpT=(id,t)=>{ const e=$(id); if(e){ const s=e.querySelector('.setGrpT'); if(s) s.textContent=t; } }; // v1.91.0: заголовок живёт в .setGrpT — рядом шёпот самочувствия
  grpT('setGrpSound',L.setGrpSound); grpT('setGrpGame',L.setGrpGame); // v1.63.0: две группы вместо четырёх
  grpT('setGrpProf',L.setGrpProf); // v1.64.0: карточка «Профиль»
  [['setSoundBtn','setSound'],['setMusicBtn','setMusic'],['setVibroBtn','setVibro'],
   ['setMorseHapBtn','setMorseHap'],['setGyroBtn','setGyroRow'],['setSensBtn','sens'],['setGfxBtn','setGfx'],['setContrastBtn','setContrast'],
   ['setColorblindBtn','setColorblind'],['setReduceShakeBtn','setReduceShake'],['setTextScaleBtn','setTextScale'],
   ['setKeyLeftBtn','setKeyLeft'],['setKeyRightBtn','setKeyRight'],['setKeyUpBtn','setKeyUp'],['setKeyDownBtn','setKeyDown'],['setLangBtn','setLang'],
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
  // 24.09.2026: S.ownedDecals/S.decal убраны вместе со всей вкладкой «Эмодзи» (владелец,
  // тихий сброс без тоста) — старое сохранённое значение в Store просто больше никем не
  // читается, безопасно. См. game.js:137.
  // 06.09.2026: S.ownedIcons/S.icon убраны вместе со всей вкладкой «Иконки» — старое
  // сохранённое значение в Store просто больше никем не читается, безопасно.
  S.ownedLaunchFx = Array.from(new Set(saneArray(Store.get('ownedLaunchFx',[0]),[0]).concat(ANGAR_FREEBIE.flash)));
  S.launchFx = saneNumber(Store.get('launchFx',0),0); // 29.08.2026: было S.flash/Store-ключ 'flash' — переименовано, см. game.js
  S.ownedTrails = saneArray(Store.get('ownedTrails',[0]),[0]); // 05.09.2026: след — независимый от скина, все стартуют с «Нет», без ANGAR_FREEBIE (владелец: старая пара скин→след не переносится)
  S.trail = saneNumber(Store.get('trail',0),0);
  // 07.09.2026 «Избранное»: по одному массиву на категорию Тюнинга, пусто по умолчанию
  // (в отличие от ownedX — тут нет фрибута, только личный выбор игрока).
  S.favSkins = saneArray(Store.get('favSkins',[]),[]);
  S.favLaunchFx = saneArray(Store.get('favLaunchFx',[]),[]);
  S.favTrails = saneArray(Store.get('favTrails',[]),[]);
  // 24.09.2026: S.favDecals/S.angarDecalCollapsed убраны вместе со всей вкладкой «Эмодзи» —
  // см. game.js:137.
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
  CALM_FX = Store.get('calmFx',0)===1; // 06.09.2026 «Смягчить тряску и вспышки»; 25.09.2026: дефолт true→false, владелец — доступность не включают заранее всем
  { const tsv=saneNumber(Store.get('uiTextScale',1),1); UI_TEXT_SCALE = TEXT_SCALE_STEPS.includes(tsv)?tsv:1; applyUiScale(UI_TEXT_SCALE); } // 09.09.2026 «Размер текста»
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
  else { refreshMenu(); setScreen('menu'); music.start('menu'); } // 15.09.2026 (владелец): «сразу в полёт» (v1.6.0) убрано совсем — раньше открытие приложения ВСЕГДА минуло меню, карусель режимов было физически не увидеть без паузы/итогов; duelPending раньше был «единственным исключением с меню» — теперь меню не исключение, а правило, ветка не нужна отдельно
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

/* 20.09.2026 (владелец, живой полёт: «табличка перекрывает игровое поле... убери её») —
   видимая табличка «Гироскоп молчит» (18.09.2026) убрана целиком. Причина ложных
   срабатываний была честно починена тем же вечером (game.js: useGyro теперь держится живым
   до 3с, не 0.6с — см. комментарий у input.useGyro в game.js), но сам принцип остался
   неверным для владельца: уведомление ПОВЕРХ игрового поля во время полёта — не то место и
   не то время объяснять игроку про сигнал датчика, даже если срабатывает редко и честно.
   Полёт продолжает вести себя ровно так же (руль плавно уходит к нулю при реальной потере,
   input.js), просто без текста об этом на экране.
   20.09.2026, тем же вечером (владелец: «если гироскоп молчит, это не мы решаем — надо
   следить за этим, а не табличкой во время игры»): раз игрок ничего не должен видеть, а
   реальную частоту настоящих (не ложных) потерь сигнала всё равно стоит знать нам —
   событие тихо идёт в «Чёрный ящик»/BEACON вместо экрана, ни разу не показываясь игроку. */
let gyroLostWasOn = false;
function gyroLostTick(){
  const inFlight = typeof screenName!=='undefined' && screenName==='game'
    && typeof S!=='undefined' && S && S.running && !S.paused
    && typeof input!=='undefined';
  if (inFlight){
    if (gyroLostWasOn && !input.useGyro){
      if (typeof BB!=='undefined') BB.log('gyro','lost'); // v1.99.7 «Чёрный ящик» — та же лента, что у остальных тихих событий гироскопа (chan steer/zero restore)
      if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('gyro_lost_in_flight', gyroSrc||'?');
    }
    gyroLostWasOn = input.useGyro;
  } else {
    gyroLostWasOn = false; // не в полёте — следующий вход не должен решить, что сигнал только что пропал
  }
  requestAnimationFrame(gyroLostTick);
}
requestAnimationFrame(gyroLostTick);

/* v1.282.14 «Маяк взлёта». Последняя исполняемая строка последнего скрипта игры.
   Проверка «поднялись ли мы» в index.html опирается именно на неё: косвенные признаки
   для этого негодны — const в мёртвой зоне бросает ReferenceError вместо 'undefined',
   а объявление функции поднимается даже из упавшего файла. Здесь же признак прямой:
   если управление дошло сюда, значит все скрипты исполнились до конца. */
window.__gameUp = 1;
