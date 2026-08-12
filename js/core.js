'use strict';
/* ============================================================
   CORE: Telegram init, утилиты, i18n, хранилище, звук, тактиль,
   wake lock, канвас/вьюпорт, тосты. Не зависит от других модулей.
   ============================================================ */

/* ---------- Telegram WebApp (Блок 1) ---------- */
const tg = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp : null;
// v1.14.0: мост без initData = браузер, а не Telegram — включаем веб-запасные пути (вибро и др.)
function tgv(v){ // feature-gating по версии клиента
  try{ return !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v)); }catch(e){ return false; }
}
if (tg) {
  try {
    tg.ready(); tg.expand();
    tg.setHeaderColor('#0a0e2a'); tg.setBackgroundColor('#0a0e2a');
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    // v1.75.0: безусловный замок при загрузке убран — он запирал в альбоме тех,
    // кто открыл игру лёжа. Замок теперь только из портрета: tgOrientLock() ниже.
    if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  } catch(e){}
}

/* ---------- Утилиты ---------- */
const $ = id=>document.getElementById(id);
/* SVG-иконка интерфейса: одинаковая на любом телефоне (эмодзи — нет).
   Спрайт со <symbol id="i-*"> лежит в index.html. */
const ic = (n,cls)=>'<svg class="ic'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+n+'"></use></svg>';
let RNG=Math.random; // поток эффектов (частицы): трасса живёт в своём mapRNG, эффекты карту не сдвигают
let mapRNG=Math.random; // выделенный поток случайности трассы — эффекты (частицы) не сдвигают карту
const mapRand=(a,b)=>a+mapRNG()*(b-a);

/* ---------- Трасса дня: одна трасса на всех (v1.47.0 «Трасса дня») ---------- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); } // день игрока — локальный: сутки начинаются, когда начинаются у него
function keyRNG(k){ let h=2166136261; for(let i=0;i<k.length;i++){ h^=k.charCodeAt(i); h=Math.imul(h,16777619); } return mulberry32(h>>>0); } // FNV-1a от ключа-даты → детерминированный поток
function dailyRNG(){ return keyRNG(todayKey()); } // сегодняшнее небо — одинаковое у всех игроков
const rand=(a,b)=>a+RNG()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const deadzone=v=>Math.abs(v)<.07?0:v*1.08;

/* ---------- Тост: сообщение поверх ЛЮБОГО экрана ----------
   (canvas-попапы под оверлеями не видны — используем DOM) */
let toastTimer=null;
function toast(txt,color){
  const t=$('toast'); if(!t) return;
  t.textContent=txt;
  t.style.borderColor=color||'rgba(140,170,255,.3)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),1500);
}
/* v1.103.0 «Тихий нуль»: сервисный сорт тоста. В полёте молчит — в небе только
   небо, калибровка не кричит посреди трассы (бывало ×5 за заезд). Но молчание
   не бесследно: строка уходит в самописец, диагностика не слепнет. В ангаре
   звучит как обычный тост. */
function svcToast(txt,color){
  if(typeof screenName!=='undefined' && screenName==='game'){
    if(typeof BB!=='undefined') BB.log('svc',txt);
    return;
  }
  toast(txt,color);
}

/* ---------- i18n (Блок 9) ---------- */
const I18N = {
  ru: {
    start:'Начать полёт', retry:'Ещё раз?', menu:'Меню', watchFlight:'Смотреть полёт', theaterChip:'Повтор полёта',
    tribune:'Трибуна чемпиона', tribuneNone:'Мастер ещё не показал полёт',
    goldStarStats:(c,f)=>'Золотую звезду сегодня взяли '+c+' из '+f,
    goldChip:'★ Знак дня',
    pause:'Пауза', ariaPause:'Пауза', resume:'Продолжить', restart:'Заново', calib:'Калибровка наклона',
    lampGreen:'Оба компаса дышат — наклон рулит', lampAmber:'Один канал спит или молчит — наклон рулит, запаса нет', lampRed:'Датчик молчит — руль только пальцем',
    hangar:'Ангар', best:'Рекорд',
    recordGyro:'Рекорд гироскопа', recordTouch:'Рекорд касания',
    dist:'Дистанция', recordDist:'Рекорд дистанции',
    bullet:'Затишье', recordBullet:'Рекорд затишья',
    modes:'Режимы', modesBack:'Назад',
    modeClassic:'Классика',
    modeBulletD:'Каждый пролёт впритык замедляет мир',
    modeSpeedrun:'Спидран', modeSpeedrunD:'10 000 очков на время — чистый хронометраж',
    // v1.70.0: Пакт и «Без ударов» удалены — их ручки переехали в конструктор «Своя трасса»
    srGoal:'Цель', srFinish:'Финиш!', srNewBest:'Новый рекорд времени',
    modeDaily:'Трасса дня', modeDailyD:'Одна трасса на всех игроков — поставь рекорд дня', dlNewBest:'Новый рекорд трассы дня',
    dailyOnce:'одна попытка', dailyLocked:(s)=>'Сегодня ты уже прыгнул · твой полёт: '+s+' · новая трасса завтра',
    modeForge:'Своя трасса', modeForgeD:'Конструктор забега: собери и поделись кодом', // v1.68.0
    forgeTitle:'Своя трасса', forgeNamePh:'Название трассы', forgeDefName:'Трасса пилота',
    forgeDen:'Плотность', forgeSpd:'Скорость', forgeEn:'Преграды', forgeLen:'Длина трассы', forgeInf:'∞',
    forgeCodeLbl:'Трасса друга — вставь код или ссылку',
    forgeCopied:'Код скопирован — шли другу!', forgeBadCode:'Код не распознан', forgeWin:'Финиш!',
    forgeGuest:'Трасса друга загружена — жми «Лететь»', forgeShareTxt:'Лети на мою трассу «%s» в Cosmogram!',
    fkRock:'Астероид', fkDebris:'Обломок', fkDrift:'Дрейфер', fkMine:'Мина',
    fkSat:'Спутник', fkComet:'Комета', fkSeeker:'Ловец', fkGate:'Ворота',
    forgeGrpHard:'Сложность', forgeGrpEn:'Состав', forgeGrpMood:'Настроение', // v1.69.0
    forgeFine:'Тонкая настройка', forgeHeat:'Жар', // v1.85.0 «Сначала небо»
    forgeLives:'Жизни', forgeWave:'Стартовая жара', forgeFlat:'Ровный жар — без разгона',
    forgeBonus:'Бонусы', forgeSky:'Небо', forgeFog:'Туман',
    bOff:'Выкл', bRare:'Редко', bNorm:'Норма', bOften:'Часто',
    fog0:'Нет', fog1:'Лёгкий', fog2:'Густой',
    fpWarm:'Разминка', fpRain:'Метеоритный дождь', fpHell:'Ад на одну жизнь', fpFog:'Туманная ночь',
    fpGarden:'Кометный сад', fpSlalom:'Коридор ворот', fpHunt:'Сафари с искателями', fpPulse:'Пульсар',
    cardBtn:'Карточка', cardTitle:'Карточка результата', // v1.73.0 «Карточка для скриншота»
    cardHint:'Сохрани — и кинь друзьям', cardRec:'Рекорд побит!', cardBeat:'Сможешь больше?', // v1.96.0: скриншот не нужен — есть файл
    cardSave:'Сохранить', cardShare:'Поделиться текстом', // v1.96.0 «Одна дверь»: файл — главная дверь, текст — тихая
    cardChat:'В чат', cardChatErr:'Не вышло — сохрани файлом', // v1.97.0 «Живая карточка»: картинка сама летит в чат
    cardStory:'В сторис', cardStoryBtn:'Играть', // v1.97.1 «Сторис»: та же карточка — в истории
    statusStar:'✨ В статус', statusStarOk:'Искра в статусе — на 3 дня', // v1.98.0 «Звезда-статус»
    statusStarErr:'Не вышло — попробуй позже', statusStarDeny:'Telegram не дал разрешения',
    passTime:'Время', passHits:'Удары', passBonus:'Бонусы', passSmooth:'Плавность',
    pillGyro:'Рекорд гироскопа', pillTouch:'Рекорд касания', pillDist:'Рекорд дистанции', pillBullet:'Рекорд затишья',
    scoreLbl:'Счёт', distLbl:'Расстояние', smoothLbl:'Плавность',
    settings:'Настройки', settingsTitle:'Настройки', back:'Назад',
    setSound:'Звук', setMusic:'Музыка',
    setLang:'Язык', langAuto:'Авто',
    channel:'Наш канал', toRecord:'До рекорда: ',
    setVibro:'Виброотклик',
    setGfx:'Графика', gfxAuto:'Авто', gfxLow:'Низкая', gfxMed:'Средняя', gfxHigh:'Высокая', gfxUltra:'Ультра',
    aboutBtn:'Об игре',
    modeGyro:'Гироскоп', modeTouch:'Касание',
    tiltAllow:'Разрешить управление наклоном?', tiltOn:'Наклон включён', sens:'Чувствительность',
    gyroStatTg:'Датчик: Telegram · жив', gyroStatWeb:'Датчик: веб-канал · жив', gyroStatNone:'Датчик молчит — играй пальцем',
    stars:'Звёзды', maxCombo:'Макс. комбо', share:'Поделиться', invite:'Позвать друзей',
    home:'На экран «Домой»',
    shield:'Щит', magnet:'Магнит', slowmo:'Замедление', life:'+Жизнь', dash:'Таран', nova:'Сверхновая', shieldDown:'Щит снят', nearMiss:'Впритык', gate:'Ворота',
    overDetails:'Подробности полёта',
    combo:'Комбо', notEnough:'Не хватает звёзд', owned:'Выбран', buy:ic('star4','i-s4'),
    calibrated:'Наклон откалиброван', calWait:'Держи телефон ровно…', calIng:'калибр…', calZero:'нуль', noTilt:'Нет данных датчика', wallet:ic('star4','i-s4')+' ',
    gyroUnlockBtn:'Открыть «Полёт без рук»', gyroUnlockedOk:'«Полёт без рук» открыт!',
    setGyroOff:'Полёт без рук', gyroOffOk:'Штурвал возвращён пальцу',
    setBeacon:'Помогать экипажу отчётами', beaconSent:'Экипаж уже знает об этой ошибке — скоро починим',
    beaconNoteSoft:'Борт заметил неполадку и уже доложил экипажу — чиним',
    diagBtn:'Сервисный центр', diagSensorOk:'Датчик жив · ', diagChanTg:'канал Telegram', diagChanWeb:'веб-канал',
    diagSensorDead:'Датчик молчит — пакеты не идут', diagFixSensor:'Оживить',
    diagNoSensor:'На этом устройстве нет датчика — рули пальцем или мышью, это норма',
    diagZeroOk:'Нуль принят:', diagZeroSkew:'Нуль расходится с позой — перекалибруй:', diagZeroWait:'Калибровка идёт — держи телефон ровно', diagFixCal:'Калибровка',
    diagPadOk:'Штурвал на борту:', diagPadNone:'Штурвал не подключён — это нормально: рулят и палец, и мышь',
    diagChain:'Цепь руля:', diagTape:'Лента самописца:', diagTapeBtn:'Скопировать самописец', diagTapeEvt:'событий',
    bbVNoSensor:'в устройстве нет датчика наклона', bbVLock:'замок закрыт — не пройден «Полёт без рук»',
    bbVSilent:'каналы молчат — ни одного пакета от датчика', bbVNoChan:'эстафета канала не началась',
    bbVNoZero:'ноль не принят — калибровка не завершилась', bbVSkew:'ноль перекошен:',
    bbVStale:'пакеты датчика старше 0.6с — руль спит', bbVOk:'цепь цела — гироскоп рулит',
    bbVStorm:'канал штормит — штурвал переходит к тихому',
    diagWorld:'Мир неба:', diagSheet:'Лист холста:', diagMotion:'Бережный режим:', diagInk:'Чернила:', diagOn:'вкл', diagOff:'выкл',
    diagZeroIdle:'Нуль появится сам на первых секундах полёта',
    diagFpsOk:'Кадры в норме:', diagFpsLow:'Мало кадров:', diagFixGfx:'Снизить графику',
    diagSoundOn:'Звук включён', diagSoundOff:'Звук выключен — кнопка «Звук» выше',
    diagWgSilent:'Кнопка входа Telegram молчит — проверь /setdomain у BotFather',
    diagLocked:'«Полёт без рук» пока заперт — откроется в учебном полёте',
    diagKicked:'Запросили датчик заново — подвигай телефон',
    diagReportBtn:'Скопировать отчёт', diagCopied:'Отчёт скопирован — вставь его в сообщение',
    diagCopyFail:'Не смог скопировать — выдели текст ниже вручную', diagSupportBtn:'Написать в поддержку',
    shareText:s=>'🚀 Мой рекорд в Cosmogram: '+s+' очков! Сможешь больше?',
    shareTextGyro:s=>'📱 Лечу гироскопом в Cosmogram — так в Telegram почти никто не умеет! Рекорд: '+s+' · попробуй угнаться',
    tutGyroBtn:'Попробовать без рук', tutTouchBtn:'Остаться на пальце',
    missionLbl:'Волна', skinNames:['Бумажный','Лазурь','Золото','Алый','Неон','Аврора','Плазма','Хром','Призрак'],
    tryOn:'Примерить', tryOnWait:'Завтра', tryOnGo:n=>'Примерка: '+n+' — один забег!',
    achTitle:'Достижения', achOf:'Открыто',
    achClsB:'Бронзовая награда', achClsS:'Серебряная награда', achClsG:'Золотая награда', achClaim:'Забрать', achDone:'Готово',
    statFlights:'Полётов', statDist:'Дистанция всего', statStars:'Звёзд всего', statCombo:'Лучшее комбо',
    toLoc:(n,d)=>'До «'+n+'»: '+d+' м', rankWorld:n=>'Ты #'+n+' в мире',
    duelBtn:'Вызов', duelBar:(n,b)=>'Вызов от '+n+': побей '+fmtN(b)+' м', duelHud:(b)=>'Вызов: '+b+' м', duelOff:'Вызов отклонён',
    duelTgOnly:'Вызов доступен, когда игра открыта через кнопку бота',
    duelWin:(n,b)=>'Вызов побит! Планка '+fmtN(b)+' м от '+n+' — твоя.',
    duelLose:(n,b)=>'Не побито: у '+n+' — '+fmtN(b)+' м. Реванш?',
    duelShareText:(d,w)=>'Я пролетел '+fmtN(d)+' м на Волне '+w+' в Cosmogram. Сможешь лучше? ⚔️',
    mineTab:'Мои', topTab:'Топ', topMe:'Твоё место: ', topLoading:'Загрузка…',
    topEmpty:'Пока пусто — будь первым!', topTgOnly:'Войди через Telegram — таблица одна на всех',
    webJoin:'Войди через Telegram — этот полёт встанет в общую таблицу',
    accGuest:'Общая таблица одна на всех — войди через Telegram',
    accIn:n=>n?('Ты в общей таблице как '+n):'Ты в общей таблице', accOut:'Выйти',
    dcLogin:'Войти через Discord',
    setMorse:'Морзянка', csDefault:'Пилот',
    setMorseHap:'Виброэфир',
    setGrpSound:'Звук и эфир', setGrpGame:'Игра и экран', setGrpProf:'Профиль', moreLbl:'Ещё',
    setWellAll:'Всё звучит', setWellSome:'Кое-что приглушено', setWellNone:'Тишина', // v1.91.0: шёпот самочувствия групп
    csCap:'Позывной — звучит в морзянке и виброэфире',
    diagVibro:'Проверка виброэфира', vibChTg:'Канал: Telegram API — импульсы отчётливые', vibChWeb:'Канал: только системная вибрация — предел веба', vibChNone:'Вибрация недоступна — проверь настройки телефона',
    setGhost:'Призрак',
    ghostGo:'Полететь с призраком этого рекорда', ghostNone:'Призрак недоступен: владелец скрыл трек',
    ghostWith:(n)=>'Призрак '+(n||'игрока')+' — рядом с тобой',
    ghostBeat:(n,sc,b)=>'Призрак '+(n||'игрока')+' повержен: '+fmtN(sc)+' против '+fmtN(b)
  },
  en: {
    start:'Start flight', retry:'Fly again?', menu:'Menu', watchFlight:'Watch flight', theaterChip:'Flight replay',
    tribune:'Champion’s stand', tribuneNone:'The master hasn’t shown a flight yet',
    goldStarStats:(c,f)=>'Today’s golden star was caught by '+c+' of '+f,
    goldChip:'★ Sign of the day',
    pause:'Paused', ariaPause:'Pause', resume:'Resume', restart:'Restart', calib:'Calibrate tilt',
    lampGreen:'Both compasses breathe — tilt steering live', lampAmber:'One channel asleep or silent — tilt steering live, no backup', lampRed:'No sensor data — touch steering only',
    hangar:'Hangar', best:'Best',
    recordGyro:'Gyro record', recordTouch:'Touch record',
    dist:'Distance', recordDist:'Distance record',
    bullet:'Lull', recordBullet:'Lull record',
    modes:'Modes', modesBack:'Back',
    modeClassic:'Classic',
    modeBulletD:'Every near miss slows the world down',
    modeSpeedrun:'Speedrun', modeSpeedrunD:'10,000 points against the clock',
    // v1.70.0: Pact and Hitless removed — their knobs moved into the Custom track builder
    srGoal:'Goal', srFinish:'Finish!', srNewBest:'New time record',
    modeDaily:'Track of the day', modeDailyD:'One track for every player — set the day record', dlNewBest:'New track of the day record',
    dailyOnce:'one attempt', dailyLocked:(s)=>'You already jumped today · your flight: '+s+' · new track tomorrow',
    modeForge:'Custom track', modeForgeD:'Run builder: tune it and share the code', // v1.68.0
    forgeTitle:'Custom track', forgeNamePh:'Track name', forgeDefName:'Pilot track',
    forgeDen:'Density', forgeSpd:'Speed', forgeEn:'Obstacles', forgeLen:'Track length', forgeInf:'∞',
    forgeCodeLbl:"Friend's track — paste the code or link",
    forgeCopied:'Code copied — send it to a friend!', forgeBadCode:'Code not recognized', forgeWin:'Finish!',
    forgeGuest:"Friend's track loaded — hit Fly", forgeShareTxt:'Fly my track «%s» in Cosmogram!',
    fkRock:'Asteroid', fkDebris:'Debris', fkDrift:'Drifter', fkMine:'Mine',
    fkSat:'Satellite', fkComet:'Comet', fkSeeker:'Seeker', fkGate:'Gate',
    forgeGrpHard:'Difficulty', forgeGrpEn:'Lineup', forgeGrpMood:'Mood', // v1.69.0
    forgeFine:'Fine tuning', forgeHeat:'Heat', // v1.85.0 «Сначала небо»
    forgeLives:'Lives', forgeWave:'Starting heat', forgeFlat:'Flat heat — no ramp-up',
    forgeBonus:'Bonuses', forgeSky:'Sky', forgeFog:'Fog',
    bOff:'Off', bRare:'Rare', bNorm:'Normal', bOften:'Often',
    fog0:'None', fog1:'Light', fog2:'Thick',
    fpWarm:'Warm-up', fpRain:'Meteor shower', fpHell:'One-life hell', fpFog:'Foggy night',
    fpGarden:'Comet garden', fpSlalom:'Gate slalom', fpHunt:'Seeker safari', fpPulse:'Pulsar',
    cardBtn:'Score card', cardTitle:'Run score card', // v1.73.0 "Screenshot card"
    cardHint:'Save it — send it to friends', cardRec:'New record!', cardBeat:'Can you beat it?', // v1.96.0: no screenshot — there is a file
    cardSave:'Save', cardShare:'Share as text', // v1.96.0 "One door": file is the main door, text is the quiet one
    cardChat:'To chat', cardChatErr:'No luck — save it as a file', // v1.97.0 "Living card": the image flies to chat itself
    cardStory:'To story', cardStoryBtn:'Play', // v1.97.1 "Story": the same card goes to stories
    statusStar:'✨ To status', statusStarOk:'Star is on — for 3 days', // v1.98.0 "Star Status"
    statusStarErr:'No luck — try later', statusStarDeny:'Telegram said no',
    passTime:'Time', passHits:'Hits', passBonus:'Bonuses', passSmooth:'Smooth',
    pillGyro:'Gyro record', pillTouch:'Touch record', pillDist:'Distance record', pillBullet:'Lull record',
    scoreLbl:'Score', distLbl:'Distance', smoothLbl:'Flow',
    settings:'Settings', settingsTitle:'Settings', back:'Back',
    setSound:'Sound', setMusic:'Music',
    setLang:'Language', langAuto:'Auto',
    channel:'Our channel', toRecord:'To beat: ',
    setVibro:'Haptics',
    setGfx:'Graphics', gfxAuto:'Auto', gfxLow:'Low', gfxMed:'Medium', gfxHigh:'High', gfxUltra:'Ultra',
    aboutBtn:'About',
    modeGyro:'Gyro', modeTouch:'Touch',
    tiltAllow:'Allow tilt control?', tiltOn:'Tilt enabled', sens:'Sensitivity',
    gyroStatTg:'Sensor: Telegram · live', gyroStatWeb:'Sensor: web channel · live', gyroStatNone:'Sensor silent — use your finger',
    stars:'Stars', maxCombo:'Max combo', share:'Share', invite:'Invite friends',
    home:'Add to Home',
    shield:'Shield', magnet:'Magnet', slowmo:'Slow-mo', life:'+Life', dash:'Ram', nova:'Supernova', shieldDown:'Shield down', nearMiss:'Close call', gate:'Gate',
    overDetails:'Flight details',
    combo:'Combo', notEnough:'Not enough stars', owned:'Selected', buy:ic('star4','i-s4'),
    calibrated:'Tilt calibrated', calWait:'Hold the phone steady…', calIng:'calibr…', calZero:'zero', noTilt:'No sensor data', wallet:ic('star4','i-s4')+' ',
    gyroUnlockBtn:'Unlock “Hands-Free Flight”', gyroUnlockedOk:'“Hands-Free Flight” unlocked!',
    setGyroOff:'Hands-Free Flight', gyroOffOk:'Helm returned to finger',
    setBeacon:'Help the crew with reports', beaconSent:'The crew already knows about this error — a fix is coming',
    beaconNoteSoft:'The board noticed a glitch and already told the crew — fixing it',
    diagBtn:'Service center', diagSensorOk:'Sensor alive · ', diagChanTg:'Telegram channel', diagChanWeb:'web channel',
    diagSensorDead:'Sensor silent — no packets', diagFixSensor:'Wake up',
    diagNoSensor:'No sensor on this device — finger or mouse works, that’s fine',
    diagZeroOk:'Zero set:', diagZeroSkew:'Zero drifts from pose — recalibrate:', diagZeroWait:'Calibrating — hold the phone steady', diagFixCal:'Calibrate',
    diagPadOk:'Gamepad on board:', diagPadNone:'No gamepad connected — fine: finger and mouse steer too',
    diagChain:'Steering chain:', diagTape:'Recorder tape:', diagTapeBtn:'Copy flight recorder', diagTapeEvt:'events',
    bbVNoSensor:'no tilt sensor on this device', bbVLock:'locked — finish the “Hands-Free Flight” first',
    bbVSilent:'channels are silent — not a single sensor packet', bbVNoChan:'channel handover never started',
    bbVNoZero:'zero not set — calibration never finished', bbVSkew:'zero is skewed:',
    bbVStale:'sensor packets older than 0.6s — rudder asleep', bbVOk:'chain intact — gyro is steering',
    bbVStorm:'channel is storming — wheel goes to the calm one',
    diagWorld:'Sky world:', diagSheet:'Canvas sheet:', diagMotion:'Gentle motion:', diagInk:'Inks:', diagOn:'on', diagOff:'off',
    diagZeroIdle:'Zero sets itself in the first flight seconds',
    diagFpsOk:'FPS ok:', diagFpsLow:'Low FPS:', diagFixGfx:'Lower graphics',
    diagSoundOn:'Sound on', diagSoundOff:'Sound off — “Sound” button above',
    diagWgSilent:'Telegram login button is silent — check /setdomain in BotFather',
    diagLocked:'“Hands-Free Flight” is locked — it opens in the tutorial flight',
    diagKicked:'Sensor re-requested — move the phone',
    diagReportBtn:'Copy report', diagCopied:'Report copied — paste it into your message',
    diagCopyFail:'Couldn’t copy — select the text below manually', diagSupportBtn:'Contact support',
    shareText:s=>'🚀 My Cosmogram record: '+s+' points! Beat it?',
    shareTextGyro:s=>'📱 Flying hands-free (gyro) in Cosmogram — almost no Telegram game can! Record: '+s+' · try to catch me',
    tutGyroBtn:'Try hands-free', tutTouchBtn:'Keep the finger',
    missionLbl:'Wave', skinNames:['Paper','Azure','Gold','Crimson','Neon','Aurora','Plasma','Chrome','Ghost'],
    tryOn:'Try on', tryOnWait:'Tomorrow', tryOnGo:n=>'Try-on: '+n+' — one run!',
    achTitle:'Achievements', achOf:'Unlocked',
    achClsB:'Bronze award', achClsS:'Silver award', achClsG:'Gold award', achClaim:'Claim', achDone:'Done',
    statFlights:'Flights', statDist:'Total distance', statStars:'Total stars', statCombo:'Best combo',
    toLoc:(n,d)=>'To "'+n+'": '+d+' m', rankWorld:n=>'You are #'+n+' in the world',
    duelBtn:'Duel', duelBar:(n,b)=>'Challenge from '+n+': beat '+fmtN(b)+' m', duelHud:(b)=>'Duel: '+b+' m', duelOff:'Challenge dismissed',
    duelTgOnly:'Open the game via the bot button to challenge friends',
    duelWin:(n,b)=>'Challenge beaten! The '+fmtN(b)+' m bar from '+n+' is yours.',
    duelLose:(n,b)=>'Not beaten: '+n+' holds '+fmtN(b)+' m. Rematch?',
    duelShareText:(d,w)=>'I flew '+fmtN(d)+' m on Wave '+w+' in Cosmogram. Beat that! ⚔️',
    mineTab:'Mine', topTab:'Top', topMe:'Your rank: ', topLoading:'Loading…',
    topEmpty:'Empty so far — be the first!', topTgOnly:'Sign in with Telegram — one shared leaderboard',
    webJoin:'Sign in with Telegram — this flight joins the shared leaderboard',
    accGuest:'One leaderboard for everyone — sign in with Telegram',
    accIn:n=>n?('You are on the leaderboard as '+n):'You are on the leaderboard', accOut:'Sign out',
    dcLogin:'Sign in with Discord',
    setMorse:'Morse trail', csDefault:'Pilot',
    setMorseHap:'Haptic morse',
    setGrpSound:'Sound & air', setGrpGame:'Game & screen', setGrpProf:'Profile', moreLbl:'More',
    setWellAll:'All sounding', setWellSome:'Partly muted', setWellNone:'Silence', // v1.91.0: group wellness whispers
    csCap:'Callsign — sounds in morse trail and haptic air',
    diagVibro:'Haptic morse test', vibChTg:'Channel: Telegram API — crisp impulses', vibChWeb:'Channel: system vibration only — web limit', vibChNone:'No vibration — check phone settings',
    setGhost:'Ghost',
    ghostGo:'Fly with this record’s ghost', ghostNone:'Ghost unavailable: the owner hid the track',
    ghostWith:(n)=>(n||'Player')+'’s ghost flies with you',
    ghostBeat:(n,sc,b)=>'Ghost of '+(n||'player')+' beaten: '+fmtN(sc)+' vs '+fmtN(b)
  }
};
const LANG = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user &&
  (tg.initDataUnsafe.user.language_code||'ru').toLowerCase().startsWith('en')) ? 'en' : 'ru';
let L = I18N[LANG]; // let: настройка языка переключает словарь на лету

/* ---------- Хранилище (Блок 8: CloudStorage primary, localStorage fallback) ---------- */
function gyroUnlocked(){ return Store.get('gyroUnlocked',0)===1; } // замок гироскопа (v1.5.2): рулит только после «Полёта без рук» — новичку наклоны не ломают первые полёты
const Store = {
  mem:{}, cloud:null, _loaded:false,
  _load(){ // v1.70.0: ленивая загрузка — раньше gfxCap() на парсинге core.js писал gfxTier в пустой mem
    if(this._loaded) return; this._loaded=true; // ДО init() и затирал весь blob (настройки, runMode, forgeLast…)
    try{ const raw=localStorage.getItem('cosmogram_v2'); if(raw) this.mem=JSON.parse(raw)||{}; }catch(e){ this.mem={}; }
  },
  init(done){
    this._load();
    if (this.mem.best==null){ // миграция рекорда v1
      const ob=+(localStorage.getItem('cosmogram_best')||0); if(ob) this.mem.best=ob;
    }
    if (tg && tg.CloudStorage && tgv('6.9')){
      this.cloud = tg.CloudStorage;
      let answered=false; // v1.100.3 «Тихий ноль»: мост может солгать — облако, не ответившее за 3с, не держит взлёт
      const finish=()=>{ if(answered) return; answered=true; done&&done(); }; // (живая находка: мост, воскресивший initData из sessionStorage вкладки, вешал getItems навечно — игра навсегда оставалась в меню)
      setTimeout(finish, 3000);
      try{
        this.cloud.getItems(['best','wallet','ownedSkins','skin','savedRun','stats','refBy'],(err,res)=>{
          if(!err && res){
            for(const k in res){
              const v=res[k];
              if(v!==''&&v!=null){ try{ this.mem[k]=JSON.parse(v); }catch(e){ this.mem[k]=v; } }
            }
          }
          finish();
        });
      }catch(e){ finish(); }
    } else done&&done();
  },
  get(k,def){ this._load(); const v=this.mem[k]; return v==null?def:v; },
  set(k,v){
    this._load(); this.mem[k]=v;
    try{ localStorage.setItem('cosmogram_v2',JSON.stringify(this.mem)); }catch(e){}
    if(this.cloud){ try{ this.cloud.setItem(k,JSON.stringify(v),()=>{}); }catch(e){} }
  },
  del(k){
    this._load(); delete this.mem[k];
    try{ localStorage.setItem('cosmogram_v2',JSON.stringify(this.mem)); }catch(e){}
    if(this.cloud){ try{ this.cloud.removeItem(k,()=>{}); }catch(e){} }
  }
};
// санация значений из облака — мусор не должен ронять игру
function saneNumber(v,def){ v=+v; return isFinite(v)?v:def; }
function saneArray(v,def){ return Array.isArray(v)?v:def; }

/* ---------- Звук (Блок 5, WebAudio-синтез — форматы не нужны) ---------- */
let AC=null;
function audio(){ // создавать/возобновлять строго по жесту
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  if(AC&&AC.state==='suspended')AC.resume(); return AC;
}
const CHANNEL_URL='https://t.me/cosmogram_public'; // паблик сообщества: новости, ошибки, предложения
const SUPPORT_URL='https://t.me/cosmogram_public'; // поддержка из «Сервисного центра»: пока паблик; личку владельца — когда даст @username
const GAME_VERSION='1.108.0'; // «Об игре» в настройках — при репортах багов спрашивать её
let MUTED=false; // настройка звука (экран настроек), персист 'muted'
let VIBRO=true; // настройка виброотклика, персист 'vibro'
function beep(f,dur,type,vol,slide){
  if(MUTED)return;
  const ac=audio(); if(!ac)return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type||'sine'; o.frequency.setValueAtTime(f,ac.currentTime);
  if(slide)o.frequency.exponentialRampToValueAtTime(slide,ac.currentTime+dur);
  g.gain.setValueAtTime(vol||.12,ac.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+dur);
}
let NOISE_BUF=null; // белый шум для свистов/взмахов (Фаза Б), кэшируется на AudioContext
function noiseBuf(ac){
  if(NOISE_BUF) return NOISE_BUF;
  const len=ac.sampleRate|0, b=ac.createBuffer(1,len,ac.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  return NOISE_BUF=b;
}
function swoosh(dur,f0,f1,vol,q){ // шум через поющий bandpass — свист пролёта, взмах, шипение
  if(MUTED)return;
  const ac=audio(); if(!ac)return;
  const src=ac.createBufferSource(); src.buffer=noiseBuf(ac);
  const flt=ac.createBiquadFilter(); flt.type='bandpass'; flt.Q.value=q||1.2;
  flt.frequency.setValueAtTime(f0,ac.currentTime);
  flt.frequency.exponentialRampToValueAtTime(f1,ac.currentTime+dur);
  const g=ac.createGain();
  g.gain.setValueAtTime(vol||.1,ac.currentTime);
  g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);
  src.connect(flt); flt.connect(g); g.connect(ac.destination);
  src.start(); src.stop(ac.currentTime+dur);
}
const SFX_PEAK={hit:.11, nova:.13}; // v1.48.0 «Микс»: пики приручены — эффекты бьют сайдчейном, а не громкостью
/* Гамма игры — пентатоника A-минор (A C D E G), две октавы (v1.49.0 «В тон»):
   эффекты звучат В ТОНАЛЬНОСТИ музыки — звёзды и бонусы не глушат мелодию, а дополняют её (приём Rez/Tetris Effect) */
const SCALE_MIDI=[69,72,74,76,79,81,84,86,88,91]; // A4 C5 D5 E5 G5 A5 C6 D6 E6 G6
function scaleF(i){ const m=SCALE_MIDI[Math.max(0,Math.min(SCALE_MIDI.length-1,i|0))]; return 440*Math.pow(2,(m-69)/12); }
/* ---------- Морзянка (v1.53.0): шлейф пишет позывной ----------
   Космограмма = «послание из космоса»: полёт оставляет имя в небе.
   Дёшево для любого железа: пунктирные сегменты, ноль частиц и shadowBlur. */
const MORSE={ // ITU + русская азбука
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',
  N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  'А':'.-','Б':'-...','В':'.--','Г':'--.','Д':'-..','Е':'.','Ё':'.','Ж':'...-','З':'--..','И':'..','Й':'.---',
  'К':'-.-','Л':'.-..','М':'--','Н':'-.','О':'---','П':'.--.','Р':'.-.','С':'...','Т':'-','У':'..-','Ф':'..-.',
  'Х':'....','Ц':'-.-.','Ч':'---.','Ш':'----','Щ':'--.-','Ъ':'--.--','Ы':'-.--','Ь':'-..-','Э':'..-..','Ю':'..--','Я':'.-.-'};
function morseUnits(s){ // позывной → строка единиц/нулей: точка=1, тире=111, внутри буквы пауза=0, между буквами=000
  let u=''; const ch=String(s||'').toUpperCase();
  for(let i=0;i<ch.length;i++){ const m=MORSE[ch[i]]; if(!m) continue;
    if(u) u+='000';
    for(let j=0;j<m.length;j++){ if(j) u+='0'; u+= m[j]==='-'?'111':'1'; } }
  return u;
}
const CS_BAD=['ХУЙ','ХУЕ','ХУИ','ХУЯ','ПИЗД','БЛЯД','БЛЯТ','БЛЯ','СУКА','МУДА','МУДИ','ЕБА','ЕБУ','ЕБЁ','FUCK','SHIT','CUNT','DICK','NAZI','NIGG']; // позывной летит в чужие небеса через призраков — фильтр обязателен
function sanitizeCallsign(s){
  const c=String(s||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,'').slice(0,10);
  if(!c) return '';
  for(const b of CS_BAD) if(c.indexOf(b)>=0) return '';
  return c;
}
function myCallsign(){ // свой позывной → имя аккаунта → нейтральный
  const c=sanitizeCallsign(Store.get('callsign',''));
  if(c) return c;
  const n=(typeof syncAuthName==='function')?syncAuthName():null;
  return sanitizeCallsign(n||'') || sanitizeCallsign(L.csDefault);
}
function morseElemsOf(pat){ // паттерн 1/0 → элементы-глифы: точка — кружок, тире — чёрточка (v1.55.0)
  const els=[]; let i=0;
  while(i<pat.length){
    if(pat[i]==='1'){ let j=i; while(j<pat.length&&pat[j]==='1')j++;
      els.push({off:i,len:j-i,k:(j-i)>=3?'dash':'dot'}); i=j; }
    else i++;
  }
  return els;
}
function morseOn(){ return Store.get('morseOn',0)===1; } // v1.53.0: лента скрыта из неба — включается только вручную в настройках; виброэфир живёт своей жизнью

/* ---------- Виброэфир (v1.54.0): позывной в ладонь ----------
   Только события, не рутина: первый полёт дня, новый рекорд, вход в топ-10.
   Telegram даёт импульсы light/heavy — из них собираются точки/тире;
   в вебе запасной путь — vibrate-паттерн. Где нет ни того, ни другого — тишина. */
function morseHapOn(){ return Store.get('morseHap',1)!==0; }
const MH_DOT=90, MH_DASH=210, MH_CGAP=80, MH_BUDGET=1900, MH_CHARS=4; // v1.57.0 «Телеграф»: бодрый темп — в 1.9с влезает 3-4 русские буквы
function morseHapSeq(cs){ // позывной → расписание импульсов [{t, k:'dot'|'dash'}]
  const s=String(cs||'').toUpperCase().slice(0,MH_CHARS), seq=[]; let t=0;
  for(let i=0;i<s.length;i++){
    const m=MORSE[s[i]]; if(!m) continue;
    if (seq.length) t+=MH_CGAP; // пауза между буквами
    for(const el of m){
      const k=el==='-'?'dash':'dot', dur=k==='dash'?MH_DASH:MH_DOT;
      if (t+dur>MH_BUDGET) return seq; // бюджет вышел — хвост молча отрезаем
      seq.push({t:t,k:k}); t+=dur;
    }
  }
  return seq;
}
function morseHF(){ // тактильный мост Telegram — по факту умения, без версий
  try{
    const w=window.Telegram&&window.Telegram.WebApp;
    if (w&&w.HapticFeedback&&w.HapticFeedback.impactOccurred) return w.HapticFeedback;
  }catch(e){}
  return null;
}
function hapticMorse(cs){
  if (!morseHapOn()) return;
  const seq=morseHapSeq(cs); if (!seq.length) return;
  const hf=morseHF();
  if (hf){ // точка — лёгкий импульс, тире — тяжёлый, по расписанию
    seq.forEach(e=>setTimeout(()=>{ try{ hf.impactOccurred(e.k==='dash'?'heavy':'light'); }catch(_){ } }, e.t));
  } else if (navigator.vibrate){ // веб: точка 50мс, тире 150мс, паузы по расписанию
    const pat=[]; let prevEnd=0;
    seq.forEach((e,i)=>{ const d=e.k==='dash'?150:50;
      if (i) pat.push(Math.max(0,e.t-prevEnd));
      pat.push(d); prevEnd=e.t+d; });
    try{ navigator.vibrate(pat); }catch(e){}
  }
}
function morseDayCheck(){ // первый полёт дня: «проверил эфир» — дальше тишина до завтра
  const k=todayKey();
  if (Store.get('morseDay','')===k) return false;
  Store.set('morseDay',k);
  hapticMorse(myCallsign());
  return true;
}

/* ---------- Погружение (v1.58.0): полный экран, замок ориентации, защита от свайпа ----------
   Только в Telegram и только на клиентах 8.0+; в вебе и на старых клиентах — тишина.
   Защита от закрытия живёт отдельно: она старше и есть почти везде. */
function vibroChannel(){ // 2=Telegram API, 1=системная веб-вибрация, 0=тишина (v1.60.0, диагност в Сервисном центре)
  if (morseHF()) return 2;
  if (navigator.vibrate) return 1;
  return 0;
}
function tgApp(){ // мост Telegram: живая ссылка или свежий window.Telegram (тесты подменяют)
  if (typeof tg!=='undefined' && tg) return tg;
  try{ const w=window.Telegram&&window.Telegram.WebApp; return (w&&w.initData)?w:null; }catch(e){ return null; }
}
function tgVerAtLeast(t,v){ // «8.0»+ → true; версия моста — строка «мажор.минор»
  const p=String((t&&t.version)||'0').split('.').map(Number), q=String(v).split('.').map(Number);
  for(let i=0;i<q.length;i++){ if((p[i]||0)>q[i]) return true; if((p[i]||0)<q[i]) return false; }
  return true;
}
function satProbe(){ // честный замер env(safe-area-inset-top): на Android-WebView Telegram он мёртвый ноль
  try{
    const d=document.createElement('div');
    d.style.cssText='position:fixed;left:0;top:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    document.body.appendChild(d); const v=d.getBoundingClientRect().height; d.remove(); return v;
  }catch(e){ return 0; }
}
// v1.102.1 «Ровная земля»: подушка не ходит под ногами (скачки при загрузке и конце игры)
let cgImm=null; // оптимистичное погружение: что МЫ попросили у Telegram (true=полный экран) — раньше его событий
let satNow=-1;  // действующая подушка: от неё меряем дрожь
let satTimer=0; // таймер тишины для событийных замеров
function tgInsetsSync(){ // v1.59.0 «Подушка»: безопасная зона в CSS-переменные --js-sat/--js-sab
  const r=document.documentElement && document.documentElement.style; if(!r) return;
  let top=0, bot=0;
  const t=tgApp();
  try{ const c=t&&(t.contentSafeAreaInset||t.safeAreaInset); if(c){ top=+c.top||0; bot=+c.bottom||0; } }catch(e){}
  if (!top && satProbe()<1 && ('ontouchstart' in window)) top=28; // мобильный WebView с мёртвым env: статус-бар всё равно есть
  // v1.82.0 «Крупная рамка»: мост на связи, шапка НЕ скрыта, а отступ сообщён < 64 —
  // число врёт (превью с фейковым мостом, старые клиенты без API инсетов).
  // Не верим: раз Telegram рядом и не в полном экране — шапка видима, пол 96px.
  // v1.102.1: «в полном экране ли мы» спрашиваем у НАШЕГО флага — isFullscreen отстаёт
  // от просьбы на десятки миллисекунд, и в этот зазор экран итогов рисовался криво.
  const cgFs=(cgImm!==null ? cgImm : !!(t&&t.isFullscreen));
  if (t && !cgFs && ('ontouchstart' in window) && top<64) top=96;
  // v1.102.1: дрожь ≤ 24px игнорируется — маржа HUD её перекрывает, а прыжок виден всегда
  // (поздний честный инсет на загрузке: 96 → 76 больше не двигает землю)
  if (satNow>=0 && Math.abs(top-satNow)<=24) top=satNow;
  satNow=top;
  // v1.102.0 «Остров и материк»: остров — iPhone/Mac, где середину верхней полосы занимает
  // железо (чёлка/островок: сырой инсет ≥ 40) или старый клиент без API инсетов (сырой верх = 0) —
  // там счёт остаётся колонной под рамкой. Все остальные — материк: середина полосы свободна,
  // счёт возвращается в неё. Пересматривается при каждом замере подушки.
  try{
    const ios=!!(t && /^(ios|macos)$/i.test(t.platform||''));
    let rawTop=0; const c0=t&&(t.contentSafeAreaInset||t.safeAreaInset); if(c0) rawTop=+c0.top||0;
    document.documentElement.classList.toggle('island', ios && (rawTop>=40 || rawTop<=0));
  }catch(e){}
  r.setProperty('--js-sat', top+'px');
  r.setProperty('--js-sab', bot+'px');
}
// v1.102.1 «Ровная земля»: событийный замер — шквал Telegram (полный экран, вьюпорт, инсеты
// сыплются пачкой) слипается в ОДИН замер после 350мс тишины; прямые вызовы остаются мгновенными
function tgInsetsSoon(){ clearTimeout(satTimer); satTimer=setTimeout(tgInsetsSync,350); }
function tgImmersion(on){
  const t=tgApp(); if(!t) return;
  cgImm=on; // v1.102.1: фиксируем намерение ДО просьбы — подушка пересчитается честно и сразу
  try{
    if (on){
      if (tgVerAtLeast(t,'8.0')){
        if (t.requestFullscreen && !t.isFullscreen){
          t.requestFullscreen(); // шапка мессенджера уходит — небо на весь экран
          setTimeout(()=>{ resize(); tgInsetsSoon(); },300); // v1.71.0: Telegram пересчитывает viewport не мгновенно — canvas добирает высоту следом; v1.102.1: замер — через тишину
        }
        tgOrientLock(); // «Полёт без рук»: экран не кувыркается вместе с телефоном (v1.75.0: через стража — старт полёта в альбоме не запрёт в альбоме)
      }
      if (t.enableClosingConfirmation) t.enableClosingConfirmation(); // свайп-закрытие спросит «выйти?», а не убьёт забег
    } else {
      if (t.disableClosingConfirmation) t.disableClosingConfirmation();
      if (t.exitFullscreen && t.isFullscreen) t.exitFullscreen(); // v1.71.0: меню — обратно в рамку мессенджера
    }
  }catch(e){}
  tgInsetsSync(); // полный экран меняет безопасную зону — подушка пересчитывается сразу
}

// v1.75.0 «Портретный замок»: игра задумана вертикальной, альбом раскладывал HUD по высоте,
// которой нет. Замок Telegram держит ТЕКУЩУЮ ориентацию — поэтому просим его только из
// портрета (попросить из альбома = запереться в альбоме). Раньше замок стоял только на старте
// полёта: открыл игру лёжа — заперся лёжа. Теперь просим сразу при загрузке и на каждом
// повороте: первый же портрет — и экран больше не ложится. Открытый сразу в альбоме
// (или старый клиент/браузер) — подхватывает альбомная страховка в CSS.
function tgOrientLock(){
  const t=tgApp(); if(!t || !tgVerAtLeast(t,'8.0') || !t.lockOrientation) return;
  if(window.innerHeight >= window.innerWidth){ try{ t.lockOrientation(); }catch(e){} }
}
tgOrientLock();
window.addEventListener('orientationchange', ()=>setTimeout(tgOrientLock,200));
// часть Android-клиентов глотает orientationchange (сплит-скрин, замок поворота в системе) —
// дублируем на resize с лёгким дебаунсом: первый портретный кадр довзводит замок
let _olT=0;
window.addEventListener('resize', ()=>{ if(_olT) return; _olT=setTimeout(()=>{ _olT=0; tgOrientLock(); },250); });

const sfx={
  coin:c=>{ const f=scaleF(c-1); beep(f,.14,'sine',.09,f*1.5); beep(f*2,.09,'sine',.028,f*2.4); }, // звезда — перезвон в тон музыке: комбо поднимается по пентатонике, серия = мелодия (v1.49.0)
  hit:()=>{ swoosh(.16,900,180,SFX_PEAK.hit,.7); beep(110,.25,'sine',SFX_PEAK.hit,55); }, // столкновение — шелест смятой бумаги + глухой удар
  power:kind=>{ // у каждого бонуса — свой оттенок, общий взлёт оставлен как фолбэк
    if(kind==='shield'){ beep(scaleF(0),.2,'triangle',.11,scaleF(2)); } // A4→D5 — в тон (v1.49.0)
    else if(kind==='magnet'){ beep(scaleF(4),.22,'sine',.095,scaleF(2)); } // G5→D5 — в тон
    else if(kind==='slowmo'){ beep(scaleF(2),.35,'sine',.095,220); } // D5→A3 — в тон
    else if(kind==='life'){ beep(523,.14,'sine',.1,784); setTimeout(()=>beep(784,.2,'sine',.09,1046),110); }
    else if(kind==='dash'){ swoosh(.25,400,2400,.1,1.3); beep(220,.2,'sawtooth',.09,880); } // запал Пули (v1.40.0, логика v1.19.0)
    else if(kind==='nova'){ beep(55,.4,'sine',SFX_PEAK.nova,110); swoosh(.3,3000,300,.09,.8); setTimeout(()=>beep(scaleF(4)*2,.3,'sine',.05,scaleF(9)),150); } // Сверхновая: тоника A1→A2 + блеск в тон (v1.49.0)
    else { beep(scaleF(0),.25,'triangle',.14,scaleF(5)); } // A4→A5 — в тон
  },
  nearMiss:()=>{ swoosh(.32,500,2600,.105,1.1); }, // свист пролёта — самый адреналиновый момент
  gate:()=>{ beep(scaleF(6),.16,'sine',.09,scaleF(9)); setTimeout(()=>beep(scaleF(9),.24,'sine',.08,scaleF(9)*1.335),90); }, // ворота — C6→G6, в тон (v1.49.0)
  shieldBlock:()=>{ beep(220,.09,'square',.12,180); beep(466,.12,'triangle',.09,415); swoosh(.06,3000,1200,.06,2); }, // металлический блок щита
  smash:()=>{ swoosh(.12,1500,400,.09,.9); beep(180,.15,'sawtooth',.075,90); }, // таран Пули — хруст и провал вниз (v1.40.0, логика v1.19.0)
  combo:n=>{ const k=Math.min(4,1+((n/5)|0)); for(let i=0;i<k;i++) setTimeout(()=>beep(scaleF(2+i),.1,'sine',.06,scaleF(3+i)),i*70); }, // вехи ×5/×10/×15/×20 — восходят по гамме (v1.49.0)
  buy:()=>{ beep(scaleF(5),.1,'triangle',.1); setTimeout(()=>beep(scaleF(7),.14,'triangle',.09),80); setTimeout(()=>beep(scaleF(8),.22,'triangle',.08),170); }, // покупка — A5→C6→D6, праздник в тон (v1.49.0)
  streak:()=>{ beep(330,.28,'sine',.08,660); swoosh(.18,900,2400,.045,1); }, // тёплый огонёк серии дней
  mission:()=>{ beep(523,.12,'triangle',.08); setTimeout(()=>beep(659,.12,'triangle',.08),90); setTimeout(()=>beep(784,.24,'triangle',.09),180); }, // новая волна — арфовое трио
  ach:()=>{ beep(scaleF(5),.25,'sine',.07,scaleF(6)); setTimeout(()=>beep(scaleF(8),.45,'sine',.06),150); }, // ачивка — A5→C6, колокольчик в тон (v1.49.0)
  go:()=>{ swoosh(.22,600,2000,.07,1); beep(392,.18,'sine',.08,784); }, // старт — взмах бумажных крыльев
  launch:skin=>{ // фирменный аккорд старта у ярких/легендарных скинов (только звук, не бонус)
    const fx=skin&&skin.fx;
    if(!fx){ sfx.go(); return; }
    if(fx==='neon'){ beep(620,.08,'triangle',.06,1240); setTimeout(()=>beep(930,.11,'triangle',.05,1860),70); }
    else if(fx==='aurora'){ beep(440,.2,'sine',.09,660); setTimeout(()=>{ beep(660,.25,'sine',.08,990); beep(880,.35,'sine',.035); },120); }
    else if(fx==='plasma'){ swoosh(.18,300,1200,.06,.8); beep(180,.15,'sawtooth',.06,360); setTimeout(()=>beep(270,.14,'sawtooth',.05,540),90); }
    else if(fx==='chrome'){ beep(1320,.06,'triangle',.07); setTimeout(()=>beep(1980,.09,'triangle',.05),60); }
    else if(fx==='ghost'){ beep(330,.35,'sine',.05,495); swoosh(.4,800,300,.03,1); setTimeout(()=>beep(495,.4,'sine',.04,742),160); }
  },
  click:()=>{beep(760,.045,'sine',.05,940);} // мягкий тик вместо бипа
};

/* ---------- Тактиль (Блок 5: rate-limit 100мс + vibrate fallback) ---------- */
let lastHap=0;
function haptic(kind){
  if(!VIBRO)return;
  const now=performance.now(); if(now-lastHap<100)return; lastHap=now;
  let done=false;
  try{
    if(tg&&tg.HapticFeedback&&tgv('6.1')){
      if(kind==='success'||kind==='error') tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind);
      done=true;
    }
  }catch(e){}
  if(!done && navigator.vibrate){ try{ navigator.vibrate(kind==='heavy'?70:kind==='medium'?40:15); }catch(e){} }
}

/* ---------- Wake Lock (Блок 1) ---------- */
let wakeLock=null;
async function keepAwake(){ try{ if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen'); }catch(e){} }
function releaseAwake(){ try{ wakeLock&&wakeLock.release(); }catch(e){} wakeLock=null; }

/* ---------- Канвас / вьюпорт (Блок 3) ---------- */
const canvas = $('game');
/* v1.99.3 «Сочные чернила»: флагманский экран (охват P3) умеет краски сочнее sRGB —
   зажигаем их только у коронного золота (звезда, её салют, вспышка рекорда).
   sRGB-краски в P3-холсте звучат ровно как раньше: экран без P3 не заметит ничего. */
const P3 = (typeof matchMedia==='function') && matchMedia('(color-gamut: p3)').matches;
function juicy(srgb, p3){ return P3 ? p3 : srgb; } // пара чернил: обычные — всем, сочные — флагману
const ctx = canvas.getContext('2d', P3?{colorSpace:'display-p3'}:undefined); // v1.99.3: флагману — расширенный набор чернил
let W=0, H=0, DPR=1, dprCap=2, SC=1, capPx=2560; // SC — «Метр неба» (v1.99.0): цена одного логического пикселя в css-пикселях; capPx — «Потолок листа» (v1.99.1): длинная сторона холста в настоящих пикселях
/* ---------- Тир устройства (v1.7.0 «Точная настройка»): почти персональный профиль ---------- */
function gpuRenderer(){ // точное имя GPU через WebGL (незаметно для игрока; null — если скрыто браузером)
  try{
    const c=document.createElement('canvas');
    const gl=c.getContext('webgl')||c.getContext('experimental-webgl');
    if(!gl) return null;
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const r=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    const lc=gl.getExtension('WEBGL_lose_context'); if(lc) lc.loseContext(); // отпускаем контекст сразу
    return r?String(r):null;
  }catch(e){ return null; }
}
function gfxTierByGpu(g){ // карта рынка GPU → тир 0/1/2 (слабый / средний / флагман)
  g=(g||'').toLowerCase();
  if(!g) return null;
  if(/apple gpu/.test(g)) return 2; // любой iPhone с современным Safari тянет всю красоту
  const ad=g.match(/adreno[^0-9]*(\d{3})/); if(ad){ const n=+ad[1]; return n>=640?2:(n>=610?1:0); } // 640+ флагман, 610-639 средний, 5xx и ниже — слабый
  if(/immortalis|xclipse|mali-gx/.test(g)) return 2; // топы ARM/Samsung/Dimensity 9500
  const mg=g.match(/mali-g(\d{2,3})/); if(mg){ const n=+mg[1]; return n>=710?2:(n>=76?1:0); } // G710+ флагман, G76-G615 средний, G57/G52/G72 и ниже — слабый
  if(/powervr|sgx|mali-4|mali-t|maleoon/.test(g)) return 0;
  return null; // неизвестный чип — решают ядра и память
}
function gfxTier(){ // лучшее, что можем дать именно этому устройству; вычисляется один раз, кэш навсегда
  const c=Store.get('gfxTier',null); if(c===0||c===1||c===2) return c;
  let t=gfxTierByGpu(gpuRenderer());
  if(t===null){
    const cores=navigator.hardwareConcurrency||4, mem=navigator.deviceMemory||4;
    t=(cores>=8&&mem>=6)?2:(cores>=6?1:0);
  }
  Store.set('gfxTier',t);
  return t;
}
function gfxUltraOk(){ return gfxTier()>=2; } // «Ультра» — только флагманскому тиру: слабых и средних не дразним
function dispProbe(done){ // паспорт экрана (v1.12.0): частота — медиана кадровых интервалов rAF, охват — media query
  try{ Store.set('dispP3', (typeof matchMedia==='function' && matchMedia('(color-gamut: p3)').matches)?1:0); }catch(e){}
  const deltas=[]; let last=0, n=0;
  function fr(t){ if(last && n>6) deltas.push(t-last); last=t;
    if(++n<40) requestAnimationFrame(fr);
    else{ deltas.sort((a,b)=>a-b); const med=deltas[Math.floor(deltas.length/2)]||16.7;
      const hz=Math.max(30, Math.min(240, Math.round(1000/med/5)*5));
      Store.set('dispHz', hz); if (done) done(hz); } }
  requestAnimationFrame(fr);
}
function gfxCap(){ // HD-резолюция по тиру: ручные режимы без изменений; авто — флагман до 3x, слабый 1.5x экономия
  const raw=window.devicePixelRatio||1;
  const m=Store.get('gfx','auto');
  if(m==='low') dprCap=1.5;
  else if(m==='med') dprCap=2;
  else if(m==='high') dprCap=3;
  else if(m==='ultra' && gfxUltraOk()) dprCap=Math.min(raw,3.5);
  else{
    const t=gfxTier();
    dprCap = t>=2 ? ((typeof Q!=='undefined'&&Q.level>=3)?Math.min(raw,3.5):3)
      : t===0 ? 1.5 : ((raw>=2.5&&(navigator.hardwareConcurrency||4)>=8)?3:2);
  }
}
/* v1.99.2 «Бережное небо»: уважение к системному «уменьшить движение».
   У части людей тряска и вспышки экрана вызывают настоящее укачивание —
   в каждом телефоне для них есть переключатель, и мы его слушаем. Слушаем
   и на лету: человек щёлкнул настройку в полёте — игра подхватит без
   перезагрузки. У 99% он выключен: для них не изменилось ни пикселя. */
let RM=false;
try{ const mqRM=matchMedia('(prefers-reduced-motion: reduce)'); RM=!!mqRM.matches;
  if(mqRM.addEventListener) mqRM.addEventListener('change',e=>{ RM=!!e.matches; }); }catch(e){}
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, dprCap);
  const cssW = window.innerWidth;
  const rt=tgApp(); // v1.71.0: в fullscreen viewportStableHeight на Android может лагать — берём честный innerHeight
  const cssH = (rt && rt.isFullscreen) ? window.innerHeight
    : (rt && rt.viewportStableHeight && rt.isExpanded) ? rt.viewportStableHeight : window.innerHeight;
  /* v1.99.0 «Метр неба»: мир меряем эталоном (390×844), а не сырыми пикселями.
     Мерка — по меньшей из двух сторон: небо никогда не уже 390 (поле не гуще эталона)
     и не ниже 844 (окно реакции не короче эталона). Большой экран — просто больше
     неба по бокам; скорости, размеры и ритм уклонения везде эталонные, один в один. */
  SC = Math.min(cssW/390, cssH/844);
  W = Math.round(cssW/SC);
  H = Math.round(cssH/SC);
  /* v1.99.1 «Потолок листа»: лист не шире capPx по длинной стороне. На экранах-монстрах
     (4K-телевизор с двойной чёткостью = 7680×4320 точек, ~130 МБ памяти на один лист)
     ужимаем чёткость листа, а не мир: телевизор сам мягко растянет картинку, с дивана
     глаз не различит. На телефонах и ноутбуках страховка молчит всю жизнь. */
  const longest = Math.max(cssW, cssH) * DPR;
  if (longest > capPx) DPR *= capPx / longest;
  canvas.width = Math.round(cssW*DPR); canvas.height = Math.round(cssH*DPR); // настоящих пикселей ровно столько же, сколько было (лишь не шире потолка)
  canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  ctx.setTransform(DPR*SC,0,0,DPR*SC,0,0); // меры неба → пиксели экрана одним поворотом линейки
  if (typeof drawKick==='function') drawKick(); // v1.66.2: спящая пауза/меню — свежий кадр сразу после пересчёта
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,150));
if (tg && tg.onEvent){ try{ tg.onEvent('viewportChanged', ()=>{ if(tg.isExpanded) resize(); tgInsetsSoon(); }); }catch(e){} // v1.102.1: замер — после тишины
  try{ tg.onEvent('fullscreenChanged', ()=>{ resize(); tgInsetsSoon(); }); }catch(e){} // v1.71.0: вход/выход из fullscreen — canvas и подушка пересчитываются по событию, не только по таймеру; v1.102.1: один замер, не три
  ['safeAreaChanged','contentSafeAreaChanged'].forEach(ev=>{ try{ tg.onEvent(ev, tgInsetsSoon); }catch(e){} }); } // v1.102.1: поздняя правда Telegram приходит через тишину
if (document.body) tgInsetsSync(); else window.addEventListener('DOMContentLoaded', tgInsetsSync); // первый замер подушки (v1.59.0)
gfxCap(); resize();
