'use strict';
/* ============================================================
   CORE: Telegram init, утилиты, i18n, хранилище, звук, тактиль,
   wake lock, канвас/вьюпорт, тосты. Не зависит от других модулей.
   ============================================================ */

/* v1.109.2 «Подпись не едет в чужие руки», партия 16 — второй заход.
   Telegram кладёт tgWebAppData (user, auth_date, HASH — верительную грамоту игрока)
   прямо в адрес страницы и сам его не убирает. Адрес уходит наружу: Sentry — с каждой
   ошибкой, Amplitude — с каждым событием. Стирать хеш нужно ПОСЛЕ того, как мост
   (js/vendor/telegram-web-app.js, тоже defer) его прочитал — иначе initData не долетает
   до игры вовсе, и внутри Telegram человек становится гостем. Раньше это стояло
   инлайновым <script> в index.html и исполнялось сразу при разборе, до того как мост
   вообще успевал отработать — `defer` на встроенном скрипте ничего не значит, только на
   внешнем. core.js — сам defer и в HTML идёт ПОСЛЕ тега моста, поэтому здесь, в самой
   первой строке файла, мост уже гарантированно отработал: можно стирать хеш, не боясь
   опередить его. */
(function(){
  try{
    if(!location.hash || location.hash.indexOf('tgWebApp')<0) return;
    var clean = location.pathname + location.search;
    history.replaceState(null, '', clean);
  }catch(e){}
})();

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
/* ============================================================
   v1.282.15 «Одна трасса на всех» — детерминизм поля.

   Беда, которую это лечит. Поток трассы был ОДИН и расходовался в том
   порядке, в каком игрок доигрался: волна поднималась в том числе по очкам
   (а очки — это собранные звёзды и пролёты впритык), переполненное поле
   пропускало выборку вовсе, а разные виды преград тратят разное число
   обращений к кубику (камень 10, ворота 2). Достаточно одного расхождения —
   и дальше потоки двух игроков расходятся НАВСЕГДА. То есть «Трасса дня»,
   обещающая одно небо на всех, у двоих была разной, а таблица дня сравнивала
   несравнимое. Тем же корнем болели гонка с призраком и Театр.

   Лечение. У каждого спавна теперь СВОЙ поток, сшитый из ключа трассы и
   порядкового номера этого спавна. Сколько бы обращений ни съел спавн №37,
   спавн №38 получит ровно тот же кубик у любого игрока. Порядок и количество
   выборок внутри перестают что-либо решать.
   Ключ трассы (mapSeedKey) — тот же, из которого шьётся mapRNG: день для
   Трассы дня, день спектакля для Театра, сид автора для своей трассы.
   ============================================================ */
let mapSeedKey='0';                       // ключ нынешней трассы — ставится там же, где mapRNG
const mapSeq={ob:0,st:0,pw:0};            // порядковые номера спавнов: преграды, звёзды, бонусы
function mapSeqReset(){ mapSeq.ob=0; mapSeq.st=0; mapSeq.pw=0; }
/* Подменяем общий поток на личный поток этого спавна — тогда весь существующий код
   внутри (mapRand и прямые mapRNG()) сам собой становится детерминированным, без правки
   каждой строки. Возврат потока — в finally: исключение внутри не должно оставить
   трассу на чужом кубике. */
function withTrack(kind, fn){
  const prev=mapRNG;
  mapRNG=keyRNG(mapSeedKey+'\u00b7'+kind+'\u00b7'+(mapSeq[kind]++));
  try{ return fn(); } finally{ mapRNG=prev; }
}

/* ---------- Трасса дня: одна трасса на всех (v1.47.0 «Трасса дня») ---------- */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); } // v1.108.1: чужое имя в innerHTML — никогда без экранирования
/* v1.108.1 «Печать лаборатории — на всех дверях»: раньше верстак-щит стоял только у
   Почты неба (beacon.js). Синк честного топа (sync.js) и Звезда-статус (star.js) писали
   на настоящий сервер даже с localhost — тестовый забег мог попасть в боевую таблицу.
   Теперь одна печать на все три двери сразу: window.__labOpen=true снимает её везде разом. */
function isLabEnv(){
  let onLocal=false; try{ const h=location.hostname; onLocal=h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'; }catch(e){}
  return onLocal && !(typeof window!=='undefined' && window.__labOpen===true);
}
function dateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); } // v1.108.1: общий форматтер — todayKey() и streakDayCheck() делят один источник правды
function todayKey(){ return dateKey(new Date()); } // день игрока — локальный: сутки начинаются, когда начинаются у него
/* v1.282.20 «Один день на всех». День СОРЕВНОВАНИЯ теперь общий (UTC), а не локальный.
   Раньше ключ трассы шился из местной даты, и «11 августа» открывалось в UTC+14, а
   закрывалось в UTC−12: окно одной и той же трассы тянулось около пятидесяти часов.
   Игрок из западного пояса успевал изучить расстановку по чужим роликам и рассказам
   до своей единственной попытки — притом что попытка одна и вернуть её нельзя.
   Сутки трассы теперь совпадают у всех, окно сжалось до 24 часов.
   Личный день (todayKey) остаётся локальным: серия дней — это про твой вечер, а не
   про мировое соревнование, и переносить её на UTC значило бы рвать серию посреди ночи. */
function trackDayKey(){ const d=new Date(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
/* v1.108.1 «Благодать не бесконечна»: четыре места (вход/выход из паузы, оффер гироскопа,
   автосейв-возврат) независимо раздавали S.invuln=Math.max(...) — каждое честно смягчает свой
   собственный переход, но вместе, без общего счётчика, давали бесплатную неуязвимость по требованию:
   встал на паузу перед ударом — прошёл сквозь него. Один общий страж на всех четырёх — не переделывает
   ни одного перехода, просто считает, сколько раз благодать уже сработала в этом забеге. */
const GRACE_LIMIT=3; // щедро для честной игры (свернул проверить телефон, посмотрел настройки) — тесно для фарма
let graceUsed=0;
function grantGrace(sec){
  if(graceUsed>=GRACE_LIMIT) return; // лимит исчерпан — переход смягчаем анимацией, неуязвимость больше не подкидываем
  if(typeof S!=='undefined' && S) S.invuln=Math.max(S.invuln||0, sec);
  graceUsed++;
}
function graceReset(){ graceUsed=0; } // новый забег — новый счёт; старый честно выбранный лимит не переносится
function keyRNG(k){ let h=2166136261; for(let i=0;i<k.length;i++){ h^=k.charCodeAt(i); h=Math.imul(h,16777619); } return mulberry32(h>>>0); } // FNV-1a от ключа-даты → детерминированный поток
function dailyRNG(){ return keyRNG(trackDayKey()); } // сегодняшнее небо — одинаковое у всех игроков; v1.282.20: по общему времени, иначе «одинаковое» растягивалось на 50 часов
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
    recordGyro:'Рекорд гироскопа', recordTouch:'Рекорд касания', recordKeys:'Рекорд клавиатуры',
    topVerified:'Результат подтверждён забегом', unitM:'м', dist:'Дистанция', recordDist:'Рекорд дистанции',
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
    setVibro:'Виброотклик', setContrast:'Высокий контраст', setColorblind:'Для дальтоников', setStreaks:'Скоростные полосы',
    setGfx:'Графика', gfxAuto:'Авто', gfxLow:'Низкая', gfxMed:'Средняя', gfxHigh:'Высокая', gfxUltra:'Ультра',
    aboutBtn:'Об игре',
    modeGyro:'Гироскоп', modeTouch:'Касание', modeKeys:'Клавиатура',
    tiltAllow:'Разрешить управление наклоном?', tiltOn:'Наклон включён', sens:'Чувствительность',
    gyroStatTg:'Датчик: Telegram · жив', gyroStatWeb:'Датчик: веб-канал · жив', gyroStatNone:'Датчик молчит — играй пальцем',
    stars:'Звёзды', maxCombo:'Макс. комбо', share:'Поделиться', invite:'Позвать друзей',
    home:'На экран «Домой»',
    shield:'Щит', magnet:'Магнит', slowmo:'Замедление', life:'+Жизнь', dash:'Таран', nova:'Сверхновая', shieldDown:'Щит снят', nearMiss:'Впритык', gate:'Ворота',
    overDetails:'Подробности полёта',
    combo:'Комбо', notEnough:'Не хватает звёзд', owned:'Выбран', buy:ic('star4','i-s4'),
    calibrated:'Наклон откалиброван', calWait:'Держи телефон ровно…', calIng:'калибр…', calZero:'нуль', noTilt:'Нет данных датчика', wallet:ic('star4','i-s4')+' ',
    gyroUnlockBtn:'Открыть «Полёт без рук»', gyroUnlockedOk:'«Полёт без рук» открыт!',
    tooNarrowTitle:'Экран слишком узкий', tooNarrowHint:'Разверните окно или поверните экран, чтобы полететь',
    setGyroOff:'Полёт без рук', gyroOffOk:'Штурвал возвращён пальцу',
    setBeacon:'Помогать экипажу отчётами и статистикой', beaconSent:'Экипаж уже знает об этой ошибке — скоро починим',
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
    achTitle:'Достижения', achOf:'Открыто',
    achClsB:'Бронзовая награда', achClsS:'Серебряная награда', achClsG:'Золотая награда', achClaim:'Забрать', achDone:'Готово',
    statFlights:'Полётов', statDist:'Дистанция всего', statStars:'Звёзд всего', statCombo:'Лучшее комбо',
    statNearMiss:'Впритык', statDuelsWon:'Дуэлей выиграно', statPerfect:'Идеальных забегов', statRecBeats:'Рекордов побито',
    toLoc:(n,d)=>'До «'+n+'»: '+d+' м', rankWorld:n=>'Ты #'+n+' в мире',
    duelBtn:'Вызов', duelBar:(n,b)=>'Вызов от '+escapeHtml(n)+': побей '+fmtN(b)+' м', duelHud:(b)=>'Вызов: '+b+' м', duelOff:'Вызов отклонён',
    duelReplaceQ:(o,n)=>'У тебя уже есть вызов от '+escapeHtml(o)+'. Заменить на вызов от '+escapeHtml(n)+'?',
    egg42:'42 метра — ответ найден', egg9000:'Больше 9000!', egg1337:'1337 — ты в деле',
    duelTgOnly:'Вызов доступен, когда игра открыта через кнопку бота',
    duelWin:(n,b)=>'Вызов побит! Планка '+fmtN(b)+' м от '+escapeHtml(n)+' — твоя.',
    duelLose:(n,b)=>'Не побито: у '+escapeHtml(n)+' — '+fmtN(b)+' м. Реванш?',
    duelShareText:(d,w)=>myCallsign()+': '+fmtN(d)+' м на Волне '+w+' в Cosmogram. Сможешь лучше? ⚔️',
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
    ghostBeat:(n,sc,b)=>'Призрак '+escapeHtml(n||'игрока')+' повержен: '+fmtN(sc)+' против '+fmtN(b)
  },
  en: {
    start:'Start flight', retry:'Fly again?', menu:'Menu', watchFlight:'Watch flight', theaterChip:'Flight replay',
    tribune:'Champion’s stand', tribuneNone:'The master hasn’t shown a flight yet',
    goldStarStats:(c,f)=>'Today’s golden star was caught by '+c+' of '+f,
    goldChip:'★ Sign of the day',
    pause:'Paused', ariaPause:'Pause', resume:'Resume', restart:'Restart', calib:'Calibrate tilt',
    lampGreen:'Both compasses breathe — tilt steering live', lampAmber:'One channel asleep or silent — tilt steering live, no backup', lampRed:'No sensor data — touch steering only',
    hangar:'Hangar', best:'Best',
    recordGyro:'Gyro record', recordTouch:'Touch record', recordKeys:'Keyboard record',
    topVerified:'Result confirmed by the run', unitM:'m', dist:'Distance', recordDist:'Distance record',
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
    setVibro:'Haptics', setContrast:'High contrast', setColorblind:'Colorblind assist', setStreaks:'Speed streaks',
    setGfx:'Graphics', gfxAuto:'Auto', gfxLow:'Low', gfxMed:'Medium', gfxHigh:'High', gfxUltra:'Ultra',
    aboutBtn:'About',
    modeGyro:'Gyro', modeTouch:'Touch', modeKeys:'Keyboard',
    tiltAllow:'Allow tilt control?', tiltOn:'Tilt enabled', sens:'Sensitivity',
    gyroStatTg:'Sensor: Telegram · live', gyroStatWeb:'Sensor: web channel · live', gyroStatNone:'Sensor silent — use your finger',
    stars:'Stars', maxCombo:'Max combo', share:'Share', invite:'Invite friends',
    home:'Add to Home',
    shield:'Shield', magnet:'Magnet', slowmo:'Slow-mo', life:'+Life', dash:'Ram', nova:'Supernova', shieldDown:'Shield down', nearMiss:'Close call', gate:'Gate',
    overDetails:'Flight details',
    combo:'Combo', notEnough:'Not enough stars', owned:'Selected', buy:ic('star4','i-s4'),
    calibrated:'Tilt calibrated', calWait:'Hold the phone steady…', calIng:'calibr…', calZero:'zero', noTilt:'No sensor data', wallet:ic('star4','i-s4')+' ',
    gyroUnlockBtn:'Unlock “Hands-Free Flight”', gyroUnlockedOk:'“Hands-Free Flight” unlocked!',
    tooNarrowTitle:'Screen too narrow', tooNarrowHint:'Widen the window or rotate the screen to fly',
    setGyroOff:'Hands-Free Flight', gyroOffOk:'Helm returned to finger',
    setBeacon:'Help the crew with reports and stats', beaconSent:'The crew already knows about this error — a fix is coming',
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
    tutGyroBtn:'Try hands-free', tutTouchBtn:'Stick with finger',
    missionLbl:'Wave', skinNames:['Paper','Azure','Gold','Crimson','Neon','Aurora','Plasma','Chrome','Ghost'],
    achTitle:'Achievements', achOf:'Unlocked',
    achClsB:'Bronze award', achClsS:'Silver award', achClsG:'Gold award', achClaim:'Claim', achDone:'Done',
    statFlights:'Flights', statDist:'Total distance', statStars:'Total stars', statCombo:'Best combo',
    statNearMiss:'Close calls', statDuelsWon:'Duels won', statPerfect:'Perfect runs', statRecBeats:'Records beaten',
    toLoc:(n,d)=>'To "'+n+'": '+d+' m', rankWorld:n=>'You are #'+n+' in the world',
    duelBtn:'Duel', duelBar:(n,b)=>'Challenge from '+escapeHtml(n)+': beat '+fmtN(b)+' m', duelHud:(b)=>'Duel: '+b+' m', duelOff:'Challenge dismissed',
    duelReplaceQ:(o,n)=>'You already have a challenge from '+escapeHtml(o)+'. Replace it with a challenge from '+escapeHtml(n)+'?',
    egg42:'42 meters — the answer, found', egg9000:'Over 9000!', egg1337:'1337 — you\u2019re in',
    duelTgOnly:'Open the game via the bot button to challenge friends',
    duelWin:(n,b)=>'Challenge beaten! The '+fmtN(b)+' m bar from '+escapeHtml(n)+' is yours.',
    duelLose:(n,b)=>'Not beaten: '+escapeHtml(n)+' holds '+fmtN(b)+' m. Rematch?',
    duelShareText:(d,w)=>myCallsign()+': '+fmtN(d)+' m on Wave '+w+' in Cosmogram. Beat that! ⚔️',
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
    ghostBeat:(n,sc,b)=>'Ghost of '+escapeHtml(n||'player')+' beaten: '+fmtN(sc)+' vs '+fmtN(b)
  },
  es:{
    start:'Iniciar vuelo', retry:'¿Otra vez?', menu:'Menú', watchFlight:'Ver vuelo', theaterChip:'Repetición de vuelo',
    tribune:'Tribuna del campeón', tribuneNone:'El maestro aún no mostró su vuelo',
    goldStarStats:(c,f)=>'Hoy tomaron la estrella dorada '+c+' de '+f,
    goldChip:'★ Marca del día',
    pause:'Pausa', ariaPause:'Pausa', resume:'Continuar', restart:'Reiniciar',
    calib:'Calibrar inclinación',
    lampGreen:'Ambas brújulas respiran — la inclinación controla',
    lampAmber:'Un canal duerme o calla — la inclinación controla, sin respaldo',
    lampRed:'Sensor en silencio — control solo con el dedo',
    hangar:'Hangar', best:'Récord', recordGyro:'Récord de giroscopio', recordTouch:'Récord de toque', recordKeys:'Récord de teclado',
    topVerified:'Resultado confirmado por la partida', unitM:'m', dist:'Distancia', recordDist:'Récord de distancia', bullet:'Calma', recordBullet:'Récord de calma',
    modes:'Modos', modesBack:'Atrás', modeClassic:'Clásico',
    modeBulletD:'Cada roce cercano ralentiza el mundo',
    modeSpeedrun:'Speedrun', modeSpeedrunD:'10.000 puntos contra el reloj — cronometraje puro',
    srGoal:'Meta', srFinish:'¡Meta!', srNewBest:'Nuevo récord de tiempo',
    modeDaily:'Pista del día', modeDailyD:'Una pista para todos los jugadores — marca el récord del día',
    dlNewBest:'Nuevo récord de la pista del día', dailyOnce:'un intento',
    dailyLocked:(s)=>'Hoy ya saltaste · tu vuelo: '+s+' · pista nueva mañana',
    modeForge:'Pista propia', modeForgeD:'Constructor de vuelo: arma y comparte el código',
    forgeTitle:'Pista propia', forgeNamePh:'Nombre de la pista', forgeDefName:'Pista del piloto',
    forgeDen:'Densidad', forgeSpd:'Velocidad', forgeEn:'Obstáculos', forgeLen:'Longitud de la pista', forgeInf:'∞',
    forgeCodeLbl:'Pista de un amigo — pega el código o el enlace',
    forgeCopied:'Código copiado — ¡envíalo a un amigo!', forgeBadCode:'Código no reconocido',
    forgeWin:'¡Meta!', forgeGuest:'Pista de un amigo cargada — pulsa Volar',
    forgeShareTxt:'¡Vuela mi pista «%s» en Cosmogram!',
    fkRock:'Asteroide', fkDebris:'Escombro', fkDrift:'Vagabundo', fkMine:'Mina', fkSat:'Satélite',
    fkComet:'Cometa', fkSeeker:'Buscador', fkGate:'Puerta',
    forgeGrpHard:'Dificultad', forgeGrpEn:'Composición', forgeGrpMood:'Ambiente',
    forgeFine:'Ajuste fino', forgeHeat:'Calor', forgeLives:'Vidas', forgeWave:'Calor inicial',
    forgeFlat:'Calor plano — sin progresión', forgeBonus:'Bonos', forgeSky:'Cielo', forgeFog:'Niebla',
    bOff:'Apagado', bRare:'Raro', bNorm:'Normal', bOften:'Frecuente',
    fog0:'Sin niebla', fog1:'Ligera', fog2:'Densa',
    fpWarm:'Calentamiento', fpRain:'Lluvia de meteoritos', fpHell:'Infierno de una vida',
    fpFog:'Noche de niebla', fpGarden:'Jardín de cometas', fpSlalom:'Pasillo de puertas',
    fpHunt:'Safari de buscadores', fpPulse:'Púlsar',
    cardBtn:'Tarjeta', cardTitle:'Tarjeta de resultado', cardHint:'Guárdala y compártela con amigos',
    cardRec:'¡Récord superado!', cardBeat:'¿Puedes superarlo?', cardSave:'Guardar', cardShare:'Compartir como texto',
    cardChat:'Al chat', cardChatErr:'No se pudo — guarda el archivo', cardStory:'A la historia', cardStoryBtn:'Jugar',
    statusStar:'✨ Al estado', statusStarOk:'Chispa en el estado — por 3 días',
    statusStarErr:'No se pudo — intenta más tarde', statusStarDeny:'Telegram no dio permiso',
    passTime:'Tiempo', passHits:'Golpes', passBonus:'Bonos', passSmooth:'Fluidez',
    pillGyro:'Récord de giroscopio', pillTouch:'Récord de toque', pillDist:'Récord de distancia', pillBullet:'Récord de calma',
    scoreLbl:'Puntos', distLbl:'Distancia', smoothLbl:'Fluidez',
    settings:'Ajustes', settingsTitle:'Ajustes', back:'Atrás',
    setSound:'Sonido', setMusic:'Música', setLang:'Idioma', langAuto:'Auto', channel:'Nuestro canal',
    toRecord:'Para el récord: ',
    setVibro:'Vibración', setContrast:'Alto contraste', setColorblind:'Asistencia daltonismo', setStreaks:'Estelas de velocidad', setGfx:'Gráficos', gfxAuto:'Auto', gfxLow:'Baja', gfxMed:'Media', gfxHigh:'Alta', gfxUltra:'Ultra',
    aboutBtn:'Acerca del juego',
    modeGyro:'Giroscopio', modeTouch:'Toque', modeKeys:'Teclado',
    tiltAllow:'¿Permitir control por inclinación?', tiltOn:'Inclinación activada', sens:'Sensibilidad',
    gyroStatTg:'Sensor: Telegram · activo', gyroStatWeb:'Sensor: canal web · activo',
    gyroStatNone:'Sensor en silencio — juega con el dedo',
    stars:'Estrellas', maxCombo:'Combo máx.', share:'Compartir', invite:'Invitar amigos', home:'Añadir a inicio',
    shield:'Escudo', magnet:'Imán', slowmo:'Cámara lenta', life:'+Vida', dash:'Embestida', nova:'Supernova',
    shieldDown:'Escudo caído', nearMiss:'Al límite', gate:'Puerta',
    overDetails:'Detalles del vuelo', combo:'Combo',
    notEnough:'Faltan estrellas', owned:'Elegido', buy:ic('star4','i-s4'), // v1.282.15: значок валюты вернулся — цена без него читалась как голое число
    calibrated:'Inclinación calibrada', calWait:'Sostén el teléfono firme…', calIng:'calibr…', calZero:'cero',
    noTilt:'Sin datos del sensor', wallet:ic('star4','i-s4')+' ', // v1.282.15: и в кошельке
    gyroUnlockBtn:'Abrir «Vuelo sin manos»', gyroUnlockedOk:'¡«Vuelo sin manos» abierto!',
    tooNarrowTitle:'Pantalla muy angosta', tooNarrowHint:'Ensancha la ventana o gira la pantalla para volar',
    setGyroOff:'Vuelo sin manos', gyroOffOk:'Mando devuelto al dedo',
    setBeacon:'Ayudar a la tripulación con informes y estadísticas',
    beaconSent:'La tripulación ya conoce este error — lo arreglaremos pronto',
    beaconNoteSoft:'La nave notó un fallo y ya avisó a la tripulación — lo están arreglando',
    diagBtn:'Centro de servicio',
    diagSensorOk:'Sensor activo · ', diagChanTg:'canal Telegram', diagChanWeb:'canal web',
    diagSensorDead:'Sensor en silencio — no llegan paquetes', diagFixSensor:'Reactivar',
    diagNoSensor:'Este dispositivo no tiene sensor — usa el dedo o el ratón, es normal',
    diagZeroOk:'Cero aceptado:', diagZeroSkew:'El cero se desvía de la postura — recalibra:',
    diagZeroWait:'Calibrando — sostén el teléfono firme', diagFixCal:'Calibrar',
    diagPadOk:'Mando a bordo:', diagPadNone:'Sin mando conectado — normal: el dedo y el ratón también controlan',
    diagChain:'Cadena de mando:', diagTape:'Cinta de la caja negra:', diagTapeBtn:'Copiar caja negra', diagTapeEvt:'eventos',
    bbVNoSensor:'este dispositivo no tiene sensor de inclinación',
    bbVLock:'bloqueado — falta completar «Vuelo sin manos»',
    bbVSilent:'los canales callan — ni un solo paquete del sensor',
    bbVNoChan:'el relevo de canal nunca empezó',
    bbVNoZero:'cero no aceptado — la calibración no terminó',
    bbVSkew:'el cero está desviado:',
    bbVStale:'paquetes del sensor con más de 0.6s — el mando duerme',
    bbVOk:'cadena intacta — el giroscopio controla',
    bbVStorm:'el canal está en tormenta — el mando pasa al tranquilo',
    diagWorld:'Mundo del cielo:', diagSheet:'Hoja del lienzo:', diagMotion:'Modo suave:', diagInk:'Tintas:',
    diagOn:'activado', diagOff:'desactivado',
    diagZeroIdle:'El cero se fija solo en los primeros segundos de vuelo',
    diagFpsOk:'Fotogramas normales:', diagFpsLow:'Pocos fotogramas:', diagFixGfx:'Bajar gráficos',
    diagSoundOn:'Sonido activado', diagSoundOff:'Sonido desactivado — botón «Sonido» arriba',
    diagWgSilent:'El botón de acceso de Telegram calla — revisa /setdomain en BotFather',
    diagLocked:'«Vuelo sin manos» aún cerrado — se abre en el vuelo de práctica',
    diagKicked:'Sensor solicitado de nuevo — mueve el teléfono',
    diagReportBtn:'Copiar informe', diagCopied:'Informe copiado — pégalo en tu mensaje',
    diagCopyFail:'No se pudo copiar — selecciona el texto abajo manualmente',
    diagSupportBtn:'Escribir a soporte',
    shareText:s=>'🚀 Mi récord en Cosmogram: '+s+' puntos! ¿Puedes superarlo?',
    shareTextGyro:s=>'📱 ¡Vuelo con giroscopio en Cosmogram — casi nadie en Telegram sabe hacerlo! Récord: '+s+' · intenta alcanzarme',
    tutGyroBtn:'Probar sin manos', tutTouchBtn:'Quedarme con el dedo',
    missionLbl:'Oleada',
    skinNames:['Papel','Azur','Oro','Escarlata','Neón','Aurora','Plasma','Cromo','Fantasma'], // v1.282.14: было строкой — потребитель индексирует как массив, и Ангар показывал по одной букве
    achTitle:'Logros', achOf:'Desbloqueado',
    achClsB:'Premio de bronce', achClsS:'Premio de plata', achClsG:'Premio de oro',
    achClaim:'Reclamar', achDone:'Hecho',
    statFlights:'Vuelos', statDist:'Distancia total', statStars:'Estrellas totales', statCombo:'Mejor combo',
    statNearMiss:'Al límite', statDuelsWon:'Duelos ganados', statPerfect:'Vuelos perfectos', statRecBeats:'Récords superados',
    toLoc:(n,d)=>'Para «'+n+'»: '+d+' m',
    rankWorld:n=>'Eres #'+n+' en el mundo',
    duelBtn:'Duelo',
    duelBar:(n,b)=>'Reto de '+escapeHtml(n)+': supera '+fmtN(b)+' m',
    duelHud:(b)=>'Duelo: '+b+' m',
    duelOff:'Reto rechazado',
    duelReplaceQ:(o,n)=>'Ya tienes un reto de '+escapeHtml(o)+'. ¿Reemplazarlo con el reto de '+escapeHtml(n)+'?',
    egg42:'42 metros — la respuesta', egg9000:'¡Más de 9000!', egg1337:'1337 — estás dentro',
    duelTgOnly:'El duelo está disponible cuando el juego se abre desde el botón del bot',
    duelWin:(n,b)=>'¡Reto superado! La marca de '+fmtN(b)+' m de '+escapeHtml(n)+' es tuya.',
    duelLose:(n,b)=>'No superado: '+escapeHtml(n)+' tiene '+fmtN(b)+' m. ¿Revancha?',
    duelShareText:(d,w)=>myCallsign()+': '+fmtN(d)+' m en la Oleada '+w+' en Cosmogram. ¿Puedes hacerlo mejor? ⚔️',
    mineTab:'Mías', topTab:'Top', topMe:'Tu puesto: ', topLoading:'Cargando…',
    topEmpty:'Vacío por ahora — ¡sé el primero!',
    topTgOnly:'Inicia sesión con Telegram — una tabla para todos',
    webJoin:'Inicia sesión con Telegram — este vuelo se sumará a la tabla común',
    accGuest:'Una tabla para todos — inicia sesión con Telegram',
    accIn:n=>n?('Estás en la tabla común como '+n):'Estás en la tabla común',
    accOut:'Cerrar sesión', dcLogin:'Iniciar sesión con Discord',
    setMorse:'Estela Morse', csDefault:'Piloto', setMorseHap:'Pulso vibrátil',
    setGrpSound:'Sonido y aire', setGrpGame:'Juego y pantalla', setGrpProf:'Perfil',
    moreLbl:'Más',
    setWellAll:'Todo suena', setWellSome:'Algo silenciado', setWellNone:'Silencio',
    csCap:'Distintivo — suena en la estela Morse y el pulso vibrátil',
    diagVibro:'Prueba de pulso vibrátil',
    vibChTg:'Canal: API de Telegram — pulsos nítidos',
    vibChWeb:'Canal: solo vibración del sistema — límite de la web',
    vibChNone:'Vibración no disponible — revisa los ajustes del teléfono',
    setGhost:'Fantasma', ghostGo:'Volar con el fantasma de este récord',
    ghostNone:'Fantasma no disponible: el dueño ocultó la pista',
    ghostWith:(n)=>'El fantasma de '+(n||'un jugador')+' vuela contigo',
    ghostBeat:(n,sc,b)=>'Fantasma de '+escapeHtml(n||'jugador')+' superado: '+fmtN(sc)+' contra '+fmtN(b)
  },
  pt:{
    start:'Iniciar voo', retry:'De novo?', menu:'Menu', watchFlight:'Ver voo', theaterChip:'Repetição de voo',
    tribune:'Tribuna do campeão', tribuneNone:'O mestre ainda não mostrou seu voo',
    goldStarStats:(c,f)=>'Hoje pegaram a estrela dourada '+c+' de '+f,
    goldChip:'★ Marca do dia',
    pause:'Pausa', ariaPause:'Pausa', resume:'Continuar', restart:'Recomeçar',
    calib:'Calibrar inclinação',
    lampGreen:'As duas bússolas respiram — a inclinação controla',
    lampAmber:'Um canal dorme ou está mudo — a inclinação controla, sem reserva',
    lampRed:'Sensor em silêncio — controle só com o dedo',
    hangar:'Hangar', best:'Recorde', recordGyro:'Recorde de giroscópio', recordTouch:'Recorde de toque', recordKeys:'Recorde de teclado',
    topVerified:'Resultado confirmado pela partida', unitM:'m', dist:'Distância', recordDist:'Recorde de distância', bullet:'Calmaria', recordBullet:'Recorde de calmaria',
    modes:'Modos', modesBack:'Voltar', modeClassic:'Clássico',
    modeBulletD:'Cada quase-toque desacelera o mundo',
    modeSpeedrun:'Speedrun', modeSpeedrunD:'10.000 pontos contra o relógio — cronometragem pura',
    srGoal:'Meta', srFinish:'Chegada!', srNewBest:'Novo recorde de tempo',
    modeDaily:'Pista do dia', modeDailyD:'Uma pista para todos os jogadores — bata o recorde do dia',
    dlNewBest:'Novo recorde da pista do dia', dailyOnce:'uma tentativa',
    dailyLocked:(s)=>'Hoje você já voou · seu voo: '+s+' · pista nova amanhã',
    modeForge:'Pista própria', modeForgeD:'Construtor de voo: monte e compartilhe o código',
    forgeTitle:'Pista própria', forgeNamePh:'Nome da pista', forgeDefName:'Pista do piloto',
    forgeDen:'Densidade', forgeSpd:'Velocidade', forgeEn:'Obstáculos', forgeLen:'Comprimento da pista', forgeInf:'∞',
    forgeCodeLbl:'Pista de um amigo — cole o código ou o link',
    forgeCopied:'Código copiado — envie a um amigo!', forgeBadCode:'Código não reconhecido',
    forgeWin:'Chegada!', forgeGuest:'Pista de um amigo carregada — toque em Voar',
    forgeShareTxt:'Voe na minha pista «%s» no Cosmogram!',
    fkRock:'Asteroide', fkDebris:'Destroço', fkDrift:'Errante', fkMine:'Mina', fkSat:'Satélite',
    fkComet:'Cometa', fkSeeker:'Perseguidor', fkGate:'Portal',
    forgeGrpHard:'Dificuldade', forgeGrpEn:'Composição', forgeGrpMood:'Clima',
    forgeFine:'Ajuste fino', forgeHeat:'Calor', forgeLives:'Vidas', forgeWave:'Calor inicial',
    forgeFlat:'Calor constante — sem progressão', forgeBonus:'Bônus', forgeSky:'Céu', forgeFog:'Neblina',
    bOff:'Desligado', bRare:'Raro', bNorm:'Normal', bOften:'Frequente',
    fog0:'Nenhuma', fog1:'Leve', fog2:'Densa',
    fpWarm:'Aquecimento', fpRain:'Chuva de meteoros', fpHell:'Inferno de uma vida',
    fpFog:'Noite de neblina', fpGarden:'Jardim de cometas', fpSlalom:'Corredor de portões',
    fpHunt:'Safári de perseguidores', fpPulse:'Pulsar',
    cardBtn:'Cartão', cardTitle:'Cartão de resultado', cardHint:'Salve e mande para os amigos',
    cardRec:'Recorde batido!', cardBeat:'Consegue superar?', cardSave:'Salvar', cardShare:'Compartilhar como texto',
    cardChat:'No chat', cardChatErr:'Não deu — salve como arquivo', cardStory:'No stories', cardStoryBtn:'Jogar',
    statusStar:'✨ No status', statusStarOk:'Brilho no status — por 3 dias',
    statusStarErr:'Não deu — tente mais tarde', statusStarDeny:'O Telegram não deu permissão',
    passTime:'Tempo', passHits:'Batidas', passBonus:'Bônus', passSmooth:'Fluidez',
    pillGyro:'Recorde de giroscópio', pillTouch:'Recorde de toque', pillDist:'Recorde de distância', pillBullet:'Recorde de calmaria',
    scoreLbl:'Pontos', distLbl:'Distância', smoothLbl:'Fluidez',
    settings:'Ajustes', settingsTitle:'Ajustes', back:'Voltar',
    setSound:'Som', setMusic:'Música', setLang:'Idioma', langAuto:'Automático', channel:'Nosso canal',
    toRecord:'Para o recorde: ',
    setVibro:'Vibração', setContrast:'Alto contraste', setColorblind:'Assistência daltonismo', setStreaks:'Rastros de velocidade', setGfx:'Gráficos', gfxAuto:'Automático', gfxLow:'Baixa', gfxMed:'Média', gfxHigh:'Alta', gfxUltra:'Ultra',
    aboutBtn:'Sobre o jogo',
    modeGyro:'Giroscópio', modeTouch:'Toque', modeKeys:'Teclado',
    tiltAllow:'Permitir controle por inclinação?', tiltOn:'Inclinação ativada', sens:'Sensibilidade',
    gyroStatTg:'Sensor: Telegram · ativo', gyroStatWeb:'Sensor: canal web · ativo',
    gyroStatNone:'Sensor em silêncio — jogue com o dedo',
    stars:'Estrelas', maxCombo:'Combo máx.', share:'Compartilhar', invite:'Convidar amigos', home:'Adicionar à tela inicial',
    shield:'Escudo', magnet:'Ímã', slowmo:'Câmera lenta', life:'+Vida', dash:'Investida', nova:'Supernova',
    shieldDown:'Escudo caído', nearMiss:'Por pouco', gate:'Portal',
    overDetails:'Detalhes do voo', combo:'Combo',
    notEnough:'Faltam estrelas', owned:'Selecionado', buy:ic('star4','i-s4'), // v1.282.15: значок валюты вернулся
    calibrated:'Inclinação calibrada', calWait:'Segure o telefone firme…', calIng:'calibr…', calZero:'zero',
    noTilt:'Sem dados do sensor', wallet:ic('star4','i-s4')+' ', // v1.282.15: и в кошельке
    gyroUnlockBtn:'Abrir «Voo sem mãos»', gyroUnlockedOk:'«Voo sem mãos» aberto!',
    tooNarrowTitle:'Tela muito estreita', tooNarrowHint:'Alargue a janela ou gire a tela para voar',
    setGyroOff:'Voo sem mãos', gyroOffOk:'Comando devolvido ao dedo',
    setBeacon:'Ajudar a tripulação com relatórios e estatísticas',
    beaconSent:'A tripulação já sabe desse erro — vamos consertar logo',
    beaconNoteSoft:'A nave notou uma falha e já avisou a tripulação — estamos consertando',
    diagBtn:'Central de serviço',
    diagSensorOk:'Sensor ativo · ', diagChanTg:'canal Telegram', diagChanWeb:'canal web',
    diagSensorDead:'Sensor em silêncio — sem pacotes', diagFixSensor:'Reativar',
    diagNoSensor:'Este aparelho não tem sensor — use o dedo ou o mouse, é normal',
    diagZeroOk:'Zero aceito:', diagZeroSkew:'O zero se desviou da postura — recalibre:',
    diagZeroWait:'Calibrando — segure o telefone firme', diagFixCal:'Calibrar',
    diagPadOk:'Controle a bordo:', diagPadNone:'Nenhum controle conectado — normal: o dedo e o mouse também controlam',
    diagChain:'Cadeia de comando:', diagTape:'Fita da caixa-preta:', diagTapeBtn:'Copiar caixa-preta', diagTapeEvt:'eventos',
    bbVNoSensor:'este aparelho não tem sensor de inclinação',
    bbVLock:'bloqueado — falta concluir «Voo sem mãos»',
    bbVSilent:'os canais estão mudos — nenhum pacote do sensor',
    bbVNoChan:'o revezamento de canal nunca começou',
    bbVNoZero:'zero não aceito — a calibração não terminou',
    bbVSkew:'o zero está desviado:',
    bbVStale:'pacotes do sensor com mais de 0.6s — o comando dorme',
    bbVOk:'cadeia intacta — o giroscópio está no comando',
    bbVStorm:'o canal está em tempestade — o comando passa para o calmo',
    diagWorld:'Mundo do céu:', diagSheet:'Folha da tela:', diagMotion:'Modo suave:', diagInk:'Tintas:',
    diagOn:'ligado', diagOff:'desligado',
    diagZeroIdle:'O zero se ajusta sozinho nos primeiros segundos de voo',
    diagFpsOk:'Quadros normais:', diagFpsLow:'Poucos quadros:', diagFixGfx:'Baixar gráficos',
    diagSoundOn:'Som ligado', diagSoundOff:'Som desligado — botão «Som» acima',
    diagWgSilent:'O botão de acesso do Telegram está mudo — confira /setdomain no BotFather',
    diagLocked:'«Voo sem mãos» ainda trancado — abre no voo de treino',
    diagKicked:'Sensor solicitado de novo — mexa o telefone',
    diagReportBtn:'Copiar relatório', diagCopied:'Relatório copiado — cole na sua mensagem',
    diagCopyFail:'Não consegui copiar — selecione o texto abaixo manualmente',
    diagSupportBtn:'Falar com o suporte',
    shareText:s=>'🚀 Meu recorde no Cosmogram: '+s+' pontos! Consegue superar?',
    shareTextGyro:s=>'📱 Estou voando de giroscópio no Cosmogram — quase ninguém no Telegram sabe fazer isso! Recorde: '+s+' · tente me alcançar',
    tutGyroBtn:'Tentar sem mãos', tutTouchBtn:'Ficar com o dedo',
    missionLbl:'Onda',
    skinNames:['Papel','Azul','Ouro','Escarlate','Neon','Aurora','Plasma','Cromo','Fantasma'], // v1.282.14: то же — единственное расхождение типов во всём словаре
    achTitle:'Conquistas', achOf:'Desbloqueado',
    achClsB:'Prêmio de bronze', achClsS:'Prêmio de prata', achClsG:'Prêmio de ouro',
    achClaim:'Resgatar', achDone:'Concluído',
    statFlights:'Voos', statDist:'Distância total', statStars:'Estrelas totais', statCombo:'Melhor combo',
    statNearMiss:'Por pouco', statDuelsWon:'Duelos vencidos', statPerfect:'Voos perfeitos', statRecBeats:'Recordes batidos',
    toLoc:(n,d)=>'Para «'+n+'»: '+d+' m',
    rankWorld:n=>'Você é #'+n+' no mundo',
    duelBtn:'Duelo',
    duelBar:(n,b)=>'Desafio de '+escapeHtml(n)+': supere '+fmtN(b)+' m',
    duelHud:(b)=>'Duelo: '+b+' m',
    duelOff:'Desafio recusado',
    duelReplaceQ:(o,n)=>'Você já tem um desafio de '+escapeHtml(o)+'. Substituir pelo desafio de '+escapeHtml(n)+'?',
    egg42:'42 metros — a resposta', egg9000:'Mais de 9000!', egg1337:'1337 — você chegou',
    duelTgOnly:'O duelo fica disponível quando o jogo é aberto pelo botão do bot',
    duelWin:(n,b)=>'Desafio superado! A marca de '+fmtN(b)+' m de '+escapeHtml(n)+' é sua.',
    duelLose:(n,b)=>'Não superado: '+escapeHtml(n)+' tem '+fmtN(b)+' m. Revanche?',
    duelShareText:(d,w)=>myCallsign()+': '+fmtN(d)+' m na Onda '+w+' no Cosmogram. Consegue fazer melhor? ⚔️',
    mineTab:'Minhas', topTab:'Top', topMe:'Sua posição: ', topLoading:'Carregando…',
    topEmpty:'Vazio por enquanto — seja o primeiro!',
    topTgOnly:'Entre com o Telegram — uma tabela para todos',
    webJoin:'Entre com o Telegram — este voo entra na tabela geral',
    accGuest:'Uma tabela para todos — entre com o Telegram',
    accIn:n=>n?('Você está na tabela geral como '+n):'Você está na tabela geral',
    accOut:'Sair', dcLogin:'Entrar com Discord',
    setMorse:'Rastro Morse', csDefault:'Piloto', setMorseHap:'Pulso vibrátil',
    setGrpSound:'Som e ar', setGrpGame:'Jogo e tela', setGrpProf:'Perfil',
    moreLbl:'Mais',
    setWellAll:'Tudo soando', setWellSome:'Algo abafado', setWellNone:'Silêncio',
    csCap:'Codinome — soa no rastro Morse e no pulso vibrátil',
    diagVibro:'Teste de pulso vibrátil',
    vibChTg:'Canal: API do Telegram — pulsos nítidos',
    vibChWeb:'Canal: só vibração do sistema — limite da web',
    vibChNone:'Vibração indisponível — confira as configurações do telefone',
    setGhost:'Fantasma', ghostGo:'Voar com o fantasma deste recorde',
    ghostNone:'Fantasma indisponível: o dono escondeu a pista',
    ghostWith:(n)=>'O fantasma de '+(n||'um jogador')+' voa com você',
    ghostBeat:(n,sc,b)=>'Fantasma de '+escapeHtml(n||'jogador')+' superado: '+fmtN(sc)+' contra '+fmtN(b)
  },
  fr:{
    start:'Décoller', retry:'Revoler ?', menu:'Menu', watchFlight:'Voir le vol', theaterChip:'Replay du vol',
    tribune:'Tribune du champion', tribuneNone:'Le maître n\u2019a pas encore montré de vol',
    goldStarStats:(c,f)=>'L\u2019étoile dorée du jour a été attrapée par '+c+' sur '+f,
    goldChip:'★ Signe du jour',
    pause:'Pause', ariaPause:'Pause', resume:'Reprendre', restart:'Recommencer', calib:'Calibrer l\u2019inclinaison',
    lampGreen:'Les deux boussoles respirent — pilotage à l\u2019inclinaison actif', lampAmber:'Un canal endormi ou silencieux — pilotage à l\u2019inclinaison actif, sans secours', lampRed:'Aucune donnée du capteur — pilotage tactile uniquement',
    hangar:'Hangar', best:'Meilleur',
    recordGyro:'Record gyroscope', recordTouch:'Record tactile', recordKeys:'Record clavier',
    topVerified:'Résultat confirmé par la partie', unitM:'m', dist:'Distance', recordDist:'Record de distance',
    bullet:'Accalmie', recordBullet:'Record d\u2019accalmie',
    modes:'Modes', modesBack:'Retour',
    modeClassic:'Classique',
    modeBulletD:'Chaque frôlement ralentit le monde',
    modeSpeedrun:'Speedrun', modeSpeedrunD:'10 000 points contre la montre',
    srGoal:'Objectif', srFinish:'Arrivée !', srNewBest:'Nouveau record de temps',
    modeDaily:'Trace du jour', modeDailyD:'Une trace pour tous les joueurs — décroche le record du jour', dlNewBest:'Nouveau record de la Trace du jour',
    dailyOnce:'un seul essai', dailyLocked:(s)=>'Tu as déjà sauté aujourd\u2019hui · ton vol : '+s+' · nouvelle trace demain',
    modeForge:'Trace personnalisée', modeForgeD:'Créateur de trace : règle-la et partage le code',
    forgeTitle:'Trace personnalisée', forgeNamePh:'Nom de la trace', forgeDefName:'Trace du pilote',
    forgeDen:'Densité', forgeSpd:'Vitesse', forgeEn:'Obstacles', forgeLen:'Longueur de la trace', forgeInf:'∞',
    forgeCodeLbl:"Trace d'un ami — colle le code ou le lien",
    forgeCopied:'Code copié — envoie-le à un ami !', forgeBadCode:'Code non reconnu', forgeWin:'Arrivée !',
    forgeGuest:"Trace d'un ami chargée — appuie sur Voler", forgeShareTxt:'Vole sur ma trace « %s » dans Cosmogram !',
    fkRock:'Astéroïde', fkDebris:'Débris', fkDrift:'Dériveur', fkMine:'Mine',
    fkSat:'Satellite', fkComet:'Comète', fkSeeker:'Chercheur', fkGate:'Portail',
    forgeGrpHard:'Difficulté', forgeGrpEn:'Composition', forgeGrpMood:'Ambiance',
    forgeFine:'Réglage fin', forgeHeat:'Intensité',
    forgeLives:'Vies', forgeWave:'Intensité de départ', forgeFlat:'Intensité fixe — pas de montée',
    forgeBonus:'Bonus', forgeSky:'Ciel', forgeFog:'Brouillard',
    bOff:'Désactivé', bRare:'Rare', bNorm:'Normal', bOften:'Fréquent',
    fog0:'Aucun', fog1:'Léger', fog2:'Épais',
    fpWarm:'Échauffement', fpRain:'Pluie de météores', fpHell:'Enfer à une vie', fpFog:'Nuit brumeuse',
    fpGarden:'Jardin de comètes', fpSlalom:'Slalom de portails', fpHunt:'Safari chercheurs', fpPulse:'Pulsar',
    cardBtn:'Carte de score', cardTitle:'Carte de score du vol',
    cardHint:'Enregistre-la — envoie-la à tes amis', cardRec:'Nouveau record !', cardBeat:'Peux-tu faire mieux ?',
    cardSave:'Enregistrer', cardShare:'Partager en texte',
    cardChat:'Vers le chat', cardChatErr:'Ça n\u2019a pas marché — enregistre-la en fichier',
    cardStory:'Vers story', cardStoryBtn:'Jouer',
    statusStar:'✨ En statut', statusStarOk:'Étoile activée — pour 3 jours',
    statusStarErr:'Ça n\u2019a pas marché — réessaie plus tard', statusStarDeny:'Telegram a refusé',
    passTime:'Temps', passHits:'Impacts', passBonus:'Bonus', passSmooth:'Fluidité',
    pillGyro:'Record gyroscope', pillTouch:'Record tactile', pillDist:'Record de distance', pillBullet:'Record d\u2019accalmie',
    scoreLbl:'Score', distLbl:'Distance', smoothLbl:'Fluidité',
    settings:'Réglages', settingsTitle:'Réglages', back:'Retour',
    setSound:'Son', setMusic:'Musique',
    setLang:'Langue', langAuto:'Auto',
    channel:'Notre chaîne', toRecord:'À battre : ',
    setVibro:'Vibrations', setContrast:'Contraste élevé', setColorblind:'Assistance daltonisme', setStreaks:'Traînées de vitesse',
    setGfx:'Graphismes', gfxAuto:'Auto', gfxLow:'Faible', gfxMed:'Moyen', gfxHigh:'Élevé', gfxUltra:'Ultra',
    aboutBtn:'À propos',
    modeGyro:'Gyroscope', modeTouch:'Tactile', modeKeys:'Clavier',
    tiltAllow:'Autoriser le pilotage à l\u2019inclinaison ?', tiltOn:'Inclinaison activée', sens:'Sensibilité',
    gyroStatTg:'Capteur : Telegram · actif', gyroStatWeb:'Capteur : canal web · actif', gyroStatNone:'Capteur silencieux — utilise ton doigt',
    stars:'Étoiles', maxCombo:'Combo max', share:'Partager', invite:'Inviter des amis',
    home:'Ajouter à l\u2019accueil',
    shield:'Bouclier', magnet:'Aimant', slowmo:'Ralenti', life:'+Vie', dash:'Percussion', nova:'Supernova', shieldDown:'Bouclier tombé', nearMiss:'Frôlement', gate:'Portail',
    overDetails:'Détails du vol',
    combo:'Combo', notEnough:'Pas assez d\u2019étoiles', owned:'Sélectionné', buy:ic('star4','i-s4'),
    calibrated:'Inclinaison calibrée', calWait:'Garde le téléphone immobile…', calIng:'calibr…', calZero:'zéro', noTilt:'Aucune donnée du capteur', wallet:ic('star4','i-s4')+' ',
    gyroUnlockBtn:'Débloquer « Vol mains libres »', gyroUnlockedOk:'« Vol mains libres » débloqué !',
    tooNarrowTitle:'Écran trop étroit', tooNarrowHint:'Élargis la fenêtre ou tourne l\u2019écran pour voler',
    setGyroOff:'Vol mains libres', gyroOffOk:'Commandes rendues au doigt',
    setBeacon:'Aider l\u2019équipage avec des rapports et statistiques', beaconSent:'L\u2019équipage connaît déjà cette erreur — un correctif arrive',
    beaconNoteSoft:'Le bord a remarqué un problème et a déjà prévenu l\u2019équipage — en cours de réparation',
    diagBtn:'Centre de service', diagSensorOk:'Capteur actif · ', diagChanTg:'Canal Telegram', diagChanWeb:'canal web',
    diagSensorDead:'Capteur silencieux — aucun paquet', diagFixSensor:'Réveiller',
    diagNoSensor:'Aucun capteur sur cet appareil — le doigt ou la souris marche très bien',
    diagZeroOk:'Zéro réglé :', diagZeroSkew:'Le zéro dérive de la position — recalibre :', diagZeroWait:'Calibration en cours — garde le téléphone immobile', diagFixCal:'Calibrer',
    diagPadOk:'Manette détectée :', diagPadNone:'Aucune manette connectée — pas de souci : le doigt et la souris pilotent aussi',
    diagChain:'Chaîne de pilotage :', diagTape:'Bande de l\u2019enregistreur :', diagTapeBtn:'Copier l\u2019enregistreur de vol', diagTapeEvt:'événements',
    bbVNoSensor:'aucun capteur d\u2019inclinaison sur cet appareil', bbVLock:'verrouillé — termine d\u2019abord le « Vol mains libres »',
    bbVSilent:'les canaux sont silencieux — pas un seul paquet du capteur', bbVNoChan:'le transfert de canal n\u2019a jamais commencé',
    bbVNoZero:'zéro non réglé — calibration jamais terminée', bbVSkew:'le zéro est faussé :',
    bbVStale:'paquets du capteur vieux de plus de 0,6s — gouvernail endormi', bbVOk:'chaîne intacte — le gyroscope pilote',
    bbVStorm:'le canal est en tempête — le volant passe au canal calme',
    diagWorld:'Monde du ciel :', diagSheet:'Feuille du canevas :', diagMotion:'Mouvement doux :', diagInk:'Encres :', diagOn:'activé', diagOff:'désactivé',
    diagZeroIdle:'Le zéro se règle seul dans les premières secondes du vol',
    diagFpsOk:'FPS ok :', diagFpsLow:'FPS faible :', diagFixGfx:'Baisser les graphismes',
    diagSoundOn:'Son activé', diagSoundOff:'Son désactivé — bouton « Son » ci-dessus',
    diagWgSilent:'Le bouton de connexion Telegram est silencieux — vérifie /setdomain dans BotFather',
    diagLocked:'« Vol mains libres » est verrouillé — il s\u2019ouvre pendant le vol d\u2019entraînement',
    diagKicked:'Capteur redemandé — bouge le téléphone',
    diagReportBtn:'Copier le rapport', diagCopied:'Rapport copié — colle-le dans ton message',
    diagCopyFail:'Impossible de copier — sélectionne le texte ci-dessous manuellement', diagSupportBtn:'Contacter le support',
    shareText:s=>'🚀 Mon record Cosmogram : '+s+' points ! Peux-tu faire mieux ?',
    shareTextGyro:s=>'📱 Je vole mains libres (gyroscope) dans Cosmogram — presque aucun jeu Telegram ne le peut ! Record : '+s+' · essaie de me rattraper',
    tutGyroBtn:'Essayer mains libres', tutTouchBtn:'Rester au doigt',
    missionLbl:'Vague', skinNames:['Papier','Azur','Or','Cramoisi','Néon','Aurore','Plasma','Chrome','Fantôme'],
    achTitle:'Succès', achOf:'Débloqué',
    achClsB:'Prix bronze', achClsS:'Prix argent', achClsG:'Prix or', achClaim:'Réclamer', achDone:'Terminé',
    statFlights:'Vols', statDist:'Distance totale', statStars:'Étoiles totales', statCombo:'Meilleur combo',
    statNearMiss:'Frôlements', statDuelsWon:'Duels gagnés', statPerfect:'Vols parfaits', statRecBeats:'Records battus',
    toLoc:(n,d)=>'Vers « '+n+' » : '+d+' m', rankWorld:n=>'Tu es #'+n+' dans le monde',
    duelBtn:'Duel', duelBar:(n,b)=>'Défi de '+escapeHtml(n)+' : dépasse '+fmtN(b)+' m', duelHud:(b)=>'Duel : '+b+' m', duelOff:'Défi refusé',
    duelReplaceQ:(o,n)=>'Tu as déjà un défi de '+escapeHtml(o)+'. Le remplacer par un défi de '+escapeHtml(n)+' ?',
    egg42:'42 mètres — la réponse, trouvée', egg9000:'Plus de 9000 !', egg1337:'1337 — tu es dedans',
    duelTgOnly:'Ouvre le jeu via le bouton du bot pour défier tes amis',
    duelWin:(n,b)=>'Défi battu ! La barre de '+fmtN(b)+' m de '+escapeHtml(n)+' est à toi.',
    duelLose:(n,b)=>'Pas battu : '+escapeHtml(n)+' tient '+fmtN(b)+' m. Revanche ?',
    duelShareText:(d,w)=>myCallsign()+' : '+fmtN(d)+' m Vague '+w+' dans Cosmogram. Fais mieux ! ⚔️',
    mineTab:'Moi', topTab:'Classement', topMe:'Ton rang : ', topLoading:'Chargement…',
    topEmpty:'Vide pour l\u2019instant — sois le premier !', topTgOnly:'Connecte-toi avec Telegram — un classement partagé',
    webJoin:'Connecte-toi avec Telegram — ce vol rejoint le classement partagé',
    accGuest:'Un classement pour tous — connecte-toi avec Telegram',
    accIn:n=>n?('Tu es sur le classement sous le nom '+n):'Tu es sur le classement', accOut:'Se déconnecter',
    dcLogin:'Connecte-toi avec Discord',
    setMorse:'Traînée morse', csDefault:'Pilote',
    setMorseHap:'Morse haptique',
    setGrpSound:'Son et air', setGrpGame:'Jeu et écran', setGrpProf:'Profil', moreLbl:'Plus',
    setWellAll:'Tout sonore', setWellSome:'Partiellement muet', setWellNone:'Silence',
    csCap:'Indicatif — résonne dans la traînée morse et l\u2019air haptique',
    diagVibro:'Test morse haptique', vibChTg:'Canal : API Telegram — impulsions nettes', vibChWeb:'Canal : vibration système uniquement — limite web', vibChNone:'Aucune vibration — vérifie les réglages du téléphone',
    setGhost:'Fantôme',
    ghostGo:'Voler avec le fantôme de ce record', ghostNone:'Fantôme indisponible : le propriétaire a caché la trace',
    ghostWith:(n)=>'Le fantôme de '+(n||'Joueur')+' vole avec toi',
    ghostBeat:(n,sc,b)=>'Fantôme de '+escapeHtml(n||'joueur')+' battu : '+fmtN(sc)+' contre '+fmtN(b)
  }
};
const SUPPORTED_LANGS = ['ru','en','es','pt','fr']; // v1.108.1: добавляются сюда по мере перевода I18N — порядок не важен
const LANG = (()=>{
  const raw = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code || '').toLowerCase();
  const found = SUPPORTED_LANGS.find(l => raw.startsWith(l));
  return found || 'ru'; // не распознали — честный дефолт, тот же, что был всегда
})();
let L = I18N[LANG]; // let: настройка языка переключает словарь на лету
/* v1.282.15: выбор игрока применяем СРАЗУ. L инициализировался только из language_code
   Telegram, а сохранённый выбор доезжал из ui.js внутри колбэка Store.init — то есть за
   облаком, до трёх секунд ожидания. Всё это время интерфейс был нарисован автоопределённым
   языком, потом мигал и перерисовывался. Ключ lang локальный, localStorage читается
   синхронно уже здесь — ждать нечего. */
try{ const _lp=Store.get('lang','auto'); if(_lp!=='auto' && I18N[_lp]) L=I18N[_lp]; }catch(e){}

/* ---------- Хранилище (Блок 8: CloudStorage primary, localStorage fallback) ---------- */
function gyroUnlocked(){ return Store.get('gyroUnlocked',0)===1; } // замок гироскопа (v1.5.2): рулит только после «Полёта без рук» — новичку наклоны не ломают первые полёты
const Store = {
  mem:{}, cloud:null, _loaded:false,
  _load(){ // v1.70.0: ленивая загрузка — раньше gfxCap() на парсинге core.js писал gfxTier в пустой mem
    if(this._loaded) return; this._loaded=true; // ДО init() и затирал весь blob (настройки, runMode, forgeLast…)
    /* v1.282.13: битое хранилище не затираем молча. Раньше catch просто ставил пустой
       mem — и первый же Store.set перезаписывал ещё восстановимую сырую строку пустотой,
       то есть неудачный разбор превращался в необратимую потерю рекордов и кошелька.
       Теперь сырьё откладывается в сторону: игра стартует чистой, но данные можно вынуть. */
    try{ const raw=localStorage.getItem('cosmogram_v2'); if(raw) this.mem=JSON.parse(raw)||{}; }
    catch(e){ this.mem={};
      try{ const raw=localStorage.getItem('cosmogram_v2');
        if(raw && !localStorage.getItem('cosmogram_v2_broken')) localStorage.setItem('cosmogram_v2_broken',raw); }catch(e2){}
    }
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
        this.cloud.getItems(this.CLOUD_KEYS,(err,res)=>{ // v1.282.13: тот же список, что и на запись — расходиться им нельзя
          /* v1.282.15: числовые максимумы СЛИВАЕМ, а не затираем. Облако выигрывало
             безусловно, а запись в него молча игнорирует ошибку — значит достаточно
             одного не долетевшего setItem (самолётный режим, плохая сеть), чтобы
             следующий запуск онлайн принёс устаревший рекорд и стёр им настоящий.
             Самая обидная потеря в игре: «я побил вчера, а сегодня он старый».
             Плюс поздний ответ облака (после сторожа в 3с) больше не трогает память:
             ui.js к тому времени уже разобрал значения по S, и запись затёрла бы их. */
          if(answered) return;
          if(!err && res) this._mergeCloud(res);
          finish();
        });
      }catch(e){ finish(); }
    } else done&&done();
  },
  /* v1.282.13 «Что уезжает в облако». Раньше в Telegram CloudStorage зеркалился КАЖДЫЙ
     ключ, а обратно init() читает ровно семь — остальные уезжали впустую. Среди них
     bbTape (лента самописца, ~10-15 КБ) и beaconQ (очередь писем, до 18 КБ) при лимите
     облака 4096 байт на значение: гарантированно неудачные записи, и самописец дёргал
     их каждые четыре секунды. Список ниже — тот же, что в init(): один источник правды. */
  /* v1.282.15: список расширен. Прежние семь возвращали игроку на новом телефоне общий
     рекорд и звёзды — и молчали про достижения, позывной, открытый «Полёт без рук» и все
     рекорды по режимам. Ощущалось как «вернулась половина» и читалось как поломка синка.
     Лимит облака — 4096 байт на ЗНАЧЕНИЕ, а не на весь список; каждый из добавленных
     ключей на порядки меньше. Тяжёлое (лента самописца, очередь писем) сюда по-прежнему
     не входит — см. правку v1.282.13. */
  CLOUD_KEYS:['best','wallet','ownedSkins','skin','savedRun','stats','refBy',
              'ach','achQ','callsign','gyroUnlocked','bestGyro','bestTouch','bestKeys','bestDist','bestBullet','srBest'],
  /* v1.282.13: переполнение больше не проходит молча. Всё хранилище — один ключ, поэтому
     отказ записи роняет разом рекорды, кошелёк и очереди, а прежний пустой catch делал
     это невидимым: в памяти всё на месте, после перезагрузки — ничего. Сначала пробуем
     сбросить объёмное и некритичное (ленту, очередь писем, автосейв) и записать снова;
     если и это не спасло — сигналим в почту неба, чтобы беда была видна. */
  _write(){
    try{ localStorage.setItem('cosmogram_v2',JSON.stringify(this.mem)); return true; }
    catch(e){
      /* v1.282.14: разгружаем ТОЛЬКО при настоящем переполнении. Первая редакция сносила
         тяжёлые ключи на любой отказ записи — а в WebView с запрещённым хранилищем
         (Telegram при заблокированных cookies, приватный Safari) setItem бросает
         SecurityError на КАЖДУЮ запись. Тогда очередь писем удалялась сразу после того,
         как её туда положили, и «Почта неба» не отправляла ничего именно там, где сломано.
         savedRun из списка убран совсем: это данные игрока, а не кэш, и самописец, пишущий
         ленту каждые 4 секунды, стирал им чужой автосейв. */
      const quota = !!(e && (e.name==='QuotaExceededError' || e.name==='NS_ERROR_DOM_QUOTA_REACHED' || e.code===22 || e.code===1014));
      if(!quota) return false;                       // хранилище недоступно — память не трогаем, сессия живёт
      let freed=false;
      for(const k of ['bbTape','beaconQ']) if(this.mem[k]!=null){ delete this.mem[k]; freed=true; }
      if(freed){ try{ localStorage.setItem('cosmogram_v2',JSON.stringify(this.mem)); return true; }catch(e2){} }
      // сигнал шлём вне текущего кадра: иначе он идёт через тот же Store.set и падает в ту же стену
      setTimeout(()=>{ try{ if(typeof BEACON!=='undefined'&&BEACON.signal) BEACON.signal('store_full',String((e&&e.name)||'quota')); }catch(e3){} },0);
      return false;
    }
  },
  /* v1.282.15: слияние вынесено отдельно — и чтобы читалось, и чтобы страж мог его
     проверить, не поднимая настоящий мост Telegram. */
  MAX_KEYS:{best:1,wallet:1,bestGyro:1,bestTouch:1,bestKeys:1,bestDist:1,bestBullet:1,srBest:1},
  _mergeCloud(res){
    for(const k in res){
      const v=res[k];
      if(v===''||v==null) continue;
      let nv; try{ nv=JSON.parse(v); }catch(e){ nv=v; }
      const cur=this.mem[k];
      if(this.MAX_KEYS[k] && typeof nv==='number' && typeof cur==='number') this.mem[k]=Math.max(cur,nv); // рекорд не крадём ни в одну сторону
      else if(k==='ownedSkins' && Array.isArray(nv) && Array.isArray(cur)) this.mem[k]=[...new Set(cur.concat(nv))]; // купленное не пропадает
      else if(k==='ach' && Array.isArray(nv) && Array.isArray(cur)) this.mem[k]=[...new Set(cur.concat(nv))]; // и открытые достижения тоже
      else this.mem[k]=nv;
    }
  },
  get(k,def){ this._load(); const v=this.mem[k]; return v==null?def:v; },
  set(k,v){
    this._load(); this.mem[k]=v;
    this._write();
    if(this.cloud && this.CLOUD_KEYS.indexOf(k)>=0){ try{ this.cloud.setItem(k,JSON.stringify(v),()=>{}); }catch(e){} }
  },
  del(k){
    this._load(); delete this.mem[k];
    this._write();
    if(this.cloud && this.CLOUD_KEYS.indexOf(k)>=0){ try{ this.cloud.removeItem(k,()=>{}); }catch(e){} }
  }
};
// санация значений из облака — мусор не должен ронять игру
function saneNumber(v,def){ if(v==null||v==='') return def; v=+v; return isFinite(v)?v:def; } // v1.282.15: +null и +'' дают 0, а не дефолт — saneNumber(null,3) возвращал 0. Сейчас не стреляет только потому, что Store.get сам отсекает null; это латентная мина под чтением автосейва (жизни, волна, чувствительность)
function saneArray(v,def){ return Array.isArray(v)?v:def; }

/* ---------- Звук (Блок 5, WebAudio-синтез — форматы не нужны) ---------- */
let AC=null;
function audio(){ // создавать/возобновлять строго по жесту
  /* v1.282.20: пятое состояние — 'closed'. iOS-WebView вправе закрыть контекст под давлением
     памяти. Тогда AC истинный, значит новый не создаётся никогда, а resume() на закрытом
     контексте отклоняется — игра немеет до перезагрузки. Отпускаем труп и делаем новый; шумовой
     буфер привязан к старому контексту, его тоже забываем. */
  if(AC && AC.state==='closed'){ AC=null; try{ NOISE_BUF=null; }catch(e){} }
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  /* v1.282.20: у AudioContext четыре состояния, не три. На iOS входящий звонок, Siri или
     голосовое в другом чате переводят его в 'interrupted', и сам он оттуда не выходит —
     нужен явный resume. Сторож звука проверял только 'suspended' и каждые две секунды
     проходил мимо: после звонка игра оставалась НЕМОЙ до перезагрузки страницы, о которой
     игрок не догадывается. Комментарий над сторожем обещал ровно обратное. */
  if(AC && (AC.state==='suspended' || AC.state==='interrupted')) AC.resume().catch(()=>{});
  return AC; // v1.282.15: сторож звука дёргает это по таймеру каждые 2с, а resume вне жеста отклоняется — отказ уходил в глобальный обработчик и улетал письмом как «ошибка борта», маскируя настоящие падения
}
const CHANNEL_URL='https://t.me/cosmogram_public'; // паблик сообщества: новости, ошибки, предложения
const SUPPORT_URL='https://t.me/cosmogram_public'; // поддержка из «Сервисного центра»: пока паблик; личку владельца — когда даст @username
const GAME_VERSION='1.282.21'; // «Об игре» в настройках — при репортах багов спрашивать её
let MUTED=false; // настройка звука (экран настроек), персист 'muted'
let VIBRO=true; // настройка виброотклика, персист 'vibro'
let CONTRAST=false, COLORBLIND=false; // v1.280.0: усиление контраста/насыщенности на canvas, персист 'contrast'/'colorblind'
let SPEED_STREAKS=true; // v1.280.0: звёзды тянутся в штрихи на скорости — персист 'speedStreaks', по умолчанию включено
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
const CS_BAD=['ХУЙ','ХУЕ','ХУИ','ХУЯ','ПИЗД','БЛЯД','БЛЯТ','БЛЯ','СУКА','МУДА','МУДИ','ЕБА','ЕБУ','ЕБЁ','FUCK','SHIT','CUNT','DICK','NAZI','NIGG',
  'PUTA','PUTO','MIERDA','CABRON','VERGA','PENDEJO',
  'CARALHO','FODASE','BOSTA','VIADO',
  'MERDE','CONNA','ENCULE','SALOPE','NIQUE','BORDEL']; // v1.108.1: французский добавлен в интерфейс — тот же принцип, список расширяется на каждый новый язык позывного. PUTAIN не добавлен отдельно — уже ловится через PUTA (испанский корень, тот же префикс)
function sanitizeCallsign(s){
  // v1.108.1: раньше буква с диакритикой (é, ç, ü, ã) не превращалась в обычную — вырезалась
  // целиком (José→JOS, François→FRANOIS). NFD-разложение отделяет букву от знака ударения как
  // двух отдельных символов; \u0300-\u036f — сами эти знаки, вырезаем только их, буква остаётся.
  const c=String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,'').slice(0,10);
  if(!c) return '';
  for(const b of CS_BAD) if(c.indexOf(b)>=0) return '';
  return c;
}
function sanitizeTrackName(s){ // v1.108.1: имя трассы Кузницы неба — расшаривается публично, как и позывной,
  // но шире по алфавиту (пробелы, до 20 символов) — тот же чёрный список CS_BAD, другой белый список символов
  const raw=String(s||'').trim().slice(0,20);
  const check=raw.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,''); // пробелы убраны именно для проверки — «P U T A» не должно обходить фильтр
  for(const b of CS_BAD) if(check.indexOf(b)>=0) return '';
  return raw.replace(/[<>&"'\\]/g,''); // сама вывеска — с пробелами и как ввёл автор, просто без HTML-опасных символов
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
function streakDayCheck(){ // v1.108.1 «Серия дней»: sfx.streak() существовал с самого начала («тёплый огонёк
  // серии дней») — самой серии не было, звук ждал механику. Тот же принцип, что у морзянки: тихая
  // проверка раз в день, честный сброс при пропуске, огонёк только когда серия РЕАЛЬНО продолжается.
  const k=todayKey();
  const last=Store.get('streakDay','');
  if(last===k) return Store.get('streakCount',0); // уже сегодня — просто вернуть текущий счёт, ничего не менять
  const y=new Date(); y.setDate(y.getDate()-1);
  const cont = last===dateKey(y); // вчера играл — серия продолжается; иначе — начинается заново
  const count = cont ? (Store.get('streakCount',0)+1) : 1;
  Store.set('streakDay', k);
  Store.set('streakCount', count);
  if (cont && count>=2 && typeof sfx!=='undefined' && sfx.streak) sfx.streak(); // не на первом дне серии — только когда она реально длится
  Store.set('daysTotal', saneNumber(Store.get('daysTotal',0),0)+1); // v1.282.20: сколько дней человек вообще прилетал — считается ровно здесь, один раз в день
  if(!Store.get('firstDay','')) Store.set('firstDay', k);                // ...и когда прилетел впервые: без этой даты «удержание» не посчитать вовсе
  return count;
}

/* ============================================================
   ЖУРНАЛ ДНЕЙ (v1.282.20 «Дневник борта»)

   Зачем отдельно от Stats: Stats — это «всего за всю жизнь», одна строка без времени.
   По ней нельзя ответить на главный вопрос про игру — ВОЗВРАЩАЮТСЯ ли люди. Журнал
   держит по строке на день: сколько забегов, лучший счёт, сколько пролетел, сколько
   был в небе, сколько звёзд собрал — и, если игрок разрешил отчёты, чем играл и от
   чего погибал.

   Почему на клиенте, а не «событиями на сервер»: игра работает без сети, забег
   заканчивается офлайн так же часто, как онлайн. Журнал копится локально и уезжает
   вместе с ближайшей отправкой рекорда — ни одного лишнего запроса.

   Хранится 60 дней. Отправленные дни помечаются, чтобы не гонять одно и то же;
   сегодняшний день переотправляется всегда — он ещё меняется.
   ============================================================ */
const DAYS_KEEP = 60;
function dayJournal(){ const j=Store.get('dayJournal',null); return (j && typeof j==='object' && !Array.isArray(j)) ? j : {}; }
function dayRow(j,k){
  let r=j[k];
  if(!r || typeof r!=='object' || Array.isArray(r)) r=j[k]={runs:0,best:0,dist:0,sec:0,stars:0,modes:{},ctl:{},deaths:{}};
  // санитайзер того же покроя, что у профиля Мозга неба: битая запись не роняет посадку
  for(const f of ['runs','best','dist','sec','stars']) r[f]=saneNumber(r[f],0);
  for(const f of ['modes','ctl','deaths']) if(!r[f] || typeof r[f]!=='object' || Array.isArray(r[f])) r[f]={};
  return r;
}
function dayJournalSave(j){
  // подрезаем хвост: 60 дней — это и полная картина возврата на 30-й день, и меньше килобайта
  const keys=Object.keys(j).sort();
  while(keys.length>DAYS_KEEP) delete j[keys.shift()];
  Store.set('dayJournal', j);
}
function dayMark(){ // взлёт: день начался, даже если забег не долетит до отправки
  const j=dayJournal(); dayRow(j,todayKey()); dayJournalSave(j);
}
/* Посадка. Счётные поля (забеги, счёт, метры, секунды, звёзды) — факты аккаунта, они
   едут всегда. Поведенческие (чем играл, от чего погиб) пишутся только при включённом
   тумблере «Помогать экипажу отчётами и статистикой»: это уже наблюдение за игроком,
   а не его собственный результат. Выключил — их просто нет ни в журнале, ни в базе. */
function dayAdd(o){
  try{
    const j=dayJournal(), r=dayRow(j,todayKey());
    r.runs++;
    r.best=Math.max(r.best, saneNumber(o.score,0));
    r.dist+=saneNumber(o.dist,0);
    r.sec+=saneNumber(o.sec,0);
    r.stars+=saneNumber(o.stars,0);
    if (Store.get('beaconOn',1)===1){
      const bump=(m,k)=>{ if(!k) return; m[k]=(saneNumber(m[k],0))+1; };
      bump(r.modes, o.mode); bump(r.ctl, o.ctl); bump(r.deaths, o.death);
    }
    dayJournalSave(j);
  }catch(e){}
}
function daysToSend(){ // что ещё не подтверждено сервером + сегодняшний (он ещё меняется)
  const j=dayJournal(), sentRaw=Store.get('daysSent',[]);
  const sent=new Set(Array.isArray(sentRaw)?sentRaw:[]);
  const today=todayKey();
  return Object.keys(j).sort().filter(k=>k===today || !sent.has(k))
    .slice(-DAYS_KEEP).map(k=>Object.assign({d:k}, j[k]));
}
function daysAck(list){ // сервер принял — вчерашние и старше больше не гоняем
  try{
    const today=todayKey(), prev=Store.get('daysSent',[]);
    const set=new Set(Array.isArray(prev)?prev:[]);
    (list||[]).forEach(d=>{ if(d && d!==today) set.add(d); });
    const keep=Array.from(set).sort().slice(-DAYS_KEEP);
    Store.set('daysSent', keep);
  }catch(e){}
}
/* Слепок «кто этот игрок сейчас». Собирается из того, что УЖЕ лежит в хранилище, —
   ни одного нового измерения. Счётная часть едет всегда, наблюдательная (устройство,
   как играет) — по тумблеру. */
function playerProfile(){
  try{
    const owned=Store.get('ownedSkins',[0]);
    const St=(typeof Stats!=='undefined' && Stats) ? Stats : {};
    const p={
      first: Store.get('firstDay','') || '',
      days:  saneNumber(Store.get('daysTotal',0),0),
      streak:saneNumber(Store.get('streakCount',0),0),
      runs:  saneNumber((St.games)||0,0),
      deaths:saneNumber((St.deaths)||0,0),
      wallet:saneNumber(Store.get('wallet',0),0),
      stars: saneNumber((St.totalStars)||0,0),
      dist:  saneNumber((St.totalDist)||0,0),
      wave:  saneNumber((St.bestWave)||0,0),
      combo: saneNumber((St.bestCombo)||0,0),
      skins: Array.isArray(owned)?owned.length:1,
      spent: 0,
      v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'),
      lang:(typeof LANG!=='undefined'?LANG:'?'),
    };
    // потрачено звёзд = цена всего купленного (кроме бесплатного стартового)
    try{ if(Array.isArray(owned) && typeof SKINS!=='undefined')
      p.spent = owned.reduce((a,id)=>{ const s=SKINS[id]; return a+((s&&s.price)||0); },0); }catch(e){}
    if (Store.get('beaconOn',1)===1){ // наблюдательная часть — только с разрешения
      p.obs = {
        tier:(typeof gfxTier==='function')?gfxTier():'?',
        w:(typeof W!=='undefined')?Math.round(W):0, h:(typeof H!=='undefined')?Math.round(H):0,
        dpr:+(typeof DPR!=='undefined'?DPR:1).toFixed(2),
        g:saneNumber((St.gGames)||0,0), t:saneNumber((St.tGames)||0,0),
        k:saneNumber((St.kGames)||0,0), b:saneNumber((St.bGames)||0,0),
        perfect:saneNumber((St.perfectRuns)||0,0),
        gyroOn:Store.get('gyroUnlocked',0)===1?1:0,
      };
    }
    return p;
  }catch(e){ return null; }
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
  /* Каталог ошибок №30 «Голый край»: все шаги выше зависят от сигналов Telegram (t.contentSafeAreaInset,
     «родная шапка 96px»). Вне Telegram (t=null — обычная вкладка браузера, установленное PWA) ни один
     из них не срабатывает, top остаётся 0, и весь верхний HUD (счёт, пауза, звёзды, кораблики) падает
     к минимумам вёрстки — вплотную к краю экрана, хотя внутри Telegram под родную шапку всегда
     выделено ~96px. Берём то же число: не «чуть больше нуля», а то самое место, под которое уже
     свёрстан весь верхний ряд — тогда HUD совпадает между окружениями, а не просто перестаёт быть 0. */
  if (!t && top<96) top=96;
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
/* v1.282.20 «Отказ в полном экране»: cgImm — это НАША просьба, и она нарочно опережает
   ответ Telegram. Если ответом стал отказ (старый клиент, режим окна, десктоп), события
   fullscreenChanged не будет вовсе — флаг навсегда остаётся вруном, подушка считает шапку
   скрытой, и счёт с кнопками уезжают под рамку мессенджера. Слушаем отказ и возвращаем
   флаг к правде: ALREADY_FULLSCREEN — единственный отказ, означающий «уже да». */
function tgFullscreenFailed(e){
  const err=(e && (e.error||e.err))||'';
  cgImm = (String(err).toUpperCase()==='ALREADY_FULLSCREEN');
  resize(); tgInsetsSoon();
}
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
async function keepAwake(){ if(wakeLock) return; try{ if('wakeLock' in navigator) wakeLock=await navigator.wakeLock.request('screen'); }catch(e){} } // v1.282.15: второй вызов до releaseAwake присваивал новый замок поверх старого — старый не отпускался никогда, и экран мог остаться незасыпающим после выхода в меню
function releaseAwake(){ try{ wakeLock&&wakeLock.release(); }catch(e){} wakeLock=null; }

/* ---------- Канвас / вьюпорт (Блок 3) ---------- */
const canvas = $('game');
/* v1.99.3 «Сочные чернила»: флагманский экран (охват P3) умеет краски сочнее sRGB —
   зажигаем их только у коронного золота (звезда, её салют, вспышка рекорда).
   sRGB-краски в P3-холсте звучат ровно как раньше: экран без P3 не заметит ничего. */
const P3 = (typeof matchMedia==='function') && matchMedia('(color-gamut: p3)').matches;
function juicy(srgb, p3){ return P3 ? p3 : srgb; } // пара чернил: обычные — всем, сочные — флагману
const ctx = canvas.getContext('2d', P3?{colorSpace:'display-p3'}:undefined); // v1.99.3: флагману — расширенный набор чернил
/* v1.282.20 «Сочные чернила и в кэшах»: офскрин-холсты (свечения, туманности, виньетка)
   создавались обычным getContext('2d') — то есть всегда в sRGB. Всё, что нарисовано в них
   красками juicy(), обрезалось до охвата sRGB ещё до попадания на главный холст: сочные
   чернила зажигались только там, где рисуют напрямую. Один общий вход — и кэши говорят на
   том же языке цвета, что и небо. sRGB-краски в P3-холсте звучат ровно как раньше. */
function ctx2d(c, opt){ try{ return c.getContext('2d', Object.assign({}, P3?{colorSpace:'display-p3'}:null, opt||null)); }catch(e){ return c.getContext('2d'); } }
let W=0, H=0, DPR=1, dprCap=2, SC=1, capPx=2560, SC_MIN=0.5; // SC — «Метр неба» (v1.99.0): цена одного логического пикселя в css-пикселях; capPx — «Потолок листа» (v1.99.1): длинная сторона холста в настоящих пикселях; SC_MIN — «Пол листа» (v1.108.1): ниже — не рисуем нерабочую крошку, честно просим больше места
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
  if(/apple gpu/.test(g)){
    // v1.282.3 «Честный iPhone»: с февраля 2020 (iOS 12.2+) ВСЕ iPhone отдают одну и ту же
    // строку «Apple GPU» — Apple намеренно скрыла модель чипа (подтверждено официальным
    // обсуждением в gpuweb/gpuweb#2195). Раньше это означало: iPhone SE первого поколения
    // (2016, 2 ядра) и iPhone 16 Pro (2024, 6 ядер) получали ОДИН И ТОТ ЖЕ тир 2 (флагман)
    // безусловно. Хуже того — gfxCap() читает именно ТИР (кэш навсегда), не текущий Q.level:
    // даже когда авто-качество честно понижало сами эффекты из-за низкого fps, разрешение
    // холста оставалось раздутым НАВСЕГДА для любого iPhone. deviceMemory на iOS не существует
    // вовсе (undefined всегда) — единственный оставшийся честный сигнал: число ядер.
    // Не идеально (Apple не даёt точнее), но честнее безусловной двойки для всех подряд.
    const cores=navigator.hardwareConcurrency||4;
    return cores>=6?2:(cores>=4?1:0);
  }
  const ad=g.match(/adreno[^0-9]*(\d{3})/); if(ad){ const n=+ad[1]; return n>=640?2:(n>=610?1:0); } // 640+ флагман, 610-639 средний, 5xx и ниже — слабый
  if(/immortalis|xclipse|mali-gx/.test(g)) return 2; // топы ARM/Samsung/Dimensity 9500
  const mg=g.match(/mali-g(\d{2,3})/); if(mg){ const n=+mg[1]; return n>=710?2:(n>=76?1:0); } // G710+ флагман, G76-G615 средний, G57/G52/G72 и ниже — слабый
  if(/powervr|sgx|mali-4|mali-t|maleoon/.test(g)) return 0;
  return null; // неизвестный чип — решают ядра и память
}
/* v1.282.20 «Телеграм сам говорит, какое это железо».
   Android-клиент Telegram кладёт свой вердикт прямо в UA:
   Telegram-Android/{версия} ({вендор} {модель}; Android {v}; SDK {sdk}; {LOW|AVERAGE|HIGH})
   Это честный сигнал от того, кто видел устройство изнутри, и он бесплатен. Мы же до сих пор
   гадали по строке WebGL-рендерера — а в части Android-WebView она замаскирована, и тогда тир
   считался по deviceMemory, которого в WebView Telegram часто нет вовсе. */
function tgPerfClass(){
  try{ const m=/Telegram-Android\/[^)]*;\s*(LOW|AVERAGE|HIGH)\s*\)/i.exec(navigator.userAgent||'');
    return m?m[1].toUpperCase():null; }catch(e){ return null; }
}
const GFX_TIER_LOGIC_V=2; // v1.282.20: бито под чтение performance_class — иначе исправленная логика никогда бы не выполнилась у тех, кто уже открывал игру // v1.282.9: бито на v1.282.3 (честная классификация Apple GPU по числу ядер вместо
  // безусловной двойки для любого iPhone) — «кэш навсегда» без версии означал: фикс работал бы ТОЛЬКО
  // для новых игроков, у кого ещё нет записи в хранилище; любой, кто уже открывал игру ДО этого фикса,
  // навечно держал бы старый неверный тир, и исправленная логика никогда не выполнилась бы для него.
function gfxTier(){ // лучшее, что можем дать именно этому устройству; кэш живёт, пока логика классификации не меняется
  const cv=Store.get('gfxTierV',0);
  const c=Store.get('gfxTier',null);
  if(cv===GFX_TIER_LOGIC_V && (c===0||c===1||c===2)) return c;
  let t=null;
  const pc=tgPerfClass();
  if(pc) t=(pc==='LOW'?0:pc==='AVERAGE'?1:2); // слово самого клиента Telegram — сильнее любой эвристики
  if(t===null) t=gfxTierByGpu(gpuRenderer());
  if(t===null){
    const cores=navigator.hardwareConcurrency||4, mem=navigator.deviceMemory||4;
    t=(cores>=8&&mem>=6)?2:(cores>=6?1:0);
  }
  Store.set('gfxTier',t); Store.set('gfxTierV',GFX_TIER_LOGIC_V);
  return t;
}
function gfxUltraOk(){ return gfxTier()>=2; } // «Ультра» — только флагманскому тиру: слабых и средних не дразним
/* v1.108.1 «Android Go»: тир 0 уже ловит слабые устройства по GPU/памяти — этого достаточно для
   обычного бюджетника. Go Edition — отдельный зверь: агрессивнее убивает фон, площе лимит памяти
   на вкладку. Главный признак — сама строка WebView (Go Edition честно называет себя); ≤1 ГБ памяти
   на Android — тоже почти наверняка Go-класс, даже если строка промолчала. Экономнее только там,
   где это реально устройство такого класса, не любой бюджетник — тир 0 не трогаем, добавляем поверх.*/
function isAndroidGo(){
  const ua=navigator.userAgent||'';
  if(/Android.*\bGo\b/i.test(ua)) return true;
  const mem=navigator.deviceMemory;
  return /Android/i.test(ua) && typeof mem==='number' && mem<=1;
}
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
    const t=gfxTier(), lv=(typeof Q!=='undefined')?Q.level:2;
    // v1.282.3: раньше только Q.level>=3 (Ультра) снижал разрешение у тира 2+ — любое понижение
    // до Q2/Q1/Q0 (авто-качество честно реагирует на низкий fps, включая временный троттлинг
    // у настоящих флагманов, не только неверно определённые устройства) не трогало холст вообще,
    // 3x оставался всегда. Теперь разрешение спускается по той же лестнице, что и сами эффекты.
    dprCap = t>=2 ? (lv>=3?Math.min(raw,3.5):lv===2?3:lv===1?2:1.5)
      : t===0 ? (isAndroidGo()?1:1.5) : ((raw>=2.5&&(navigator.hardwareConcurrency||4)>=8)?3:2);
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
  /* Каталог ошибок №29 «Дно вьюпорта»: Telegram в момент входа/выхода из fullscreen (и раз в
     синюю луну на голом старте) может на один вызов отдать cssW или cssH равным 0, пока свой
     вьюпорт ещё не устаканился. Раньше это тихо протаскивалось в W=0/H=0, canvas.width=0 и в
     кэш vignetteSprite() — а следующий же кадр ронял drawImage() на канвасе нулевого размера.
     Отказ раньше входа честнее подмены нулём: прежняя геометрия остаётся в силе один лишний
     кадр, соседний resize() (событие/таймер/viewportChanged) досчитает правду через мгновение. */
  if (cssW<=0 || cssH<=0) return;
  /* v1.99.0 «Метр неба»: мир меряем эталоном (390×844), а не сырыми пикселями.
     Мерка — по меньшей из двух сторон: небо никогда не уже 390 (поле не гуще эталона)
     и не ниже 844 (окно реакции не короче эталона). Большой экран — просто больше
     неба по бокам; скорости, размеры и ритм уклонения везде эталонные, один в один. */
  SC = Math.min(cssW/390, cssH/844);
  /* v1.108.1 «Пол листа»: симметрично «Потолку листа» сверху — снизу тоже нужна страховка.
     Без неё очень узкое окно (сплит-скрин на телефоне/планшете, ужатое окно на десктопе)
     рисовало игру в нерабочем микро-масштабе — тап-таргеты меньше пальца, читать нечего.
     Ниже SC_MIN честно останавливаем полёт и просим больше места, вместо тихой поломки. */
  const tooNarrow = SC < SC_MIN;
  if (tooNarrow){
    SC = SC_MIN;
    /* v1.282.14: страж typeof обязателен. S — это `const S` в game.js, а game.js грузится
       ПОСЛЕ core.js: на первом же вызове resize() из хвоста этого файла привязки ещё нет,
       и голое `S` бросает не undefined, а ReferenceError. Условие срабатывает при cssH<422,
       то есть у любого телефона, положенного набок, — resize обрывался на этой строке,
       не доходя до setTransform: холст оставался 300×150, W и H нулями, а предупреждение
       о тесном экране не показывалось. Весь остальной файл этот страж носит; здесь забыли. */
    if (typeof S!=='undefined' && S && S.running && !S.paused && typeof pauseGame==='function') pauseGame(); // не даём разбиться в невидимой тесноте
  }
  const tnEl = document.getElementById('tooNarrow');
  if (tnEl) tnEl.classList.toggle('hidden', !tooNarrow);
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
// v1.282.12: resize() физически меняет canvas.width — по спецификации Canvas это стирает
// весь буфер немедленно. Событие 'resize' окна может сыпаться десятками раз в секунду при
// перетаскивании края окна на десктопе (замок ориентации на строке выше уже дебаунсится —
// сам resize() рядом остался безо всякой защиты). Схлопываем в кадр: сколько бы событий ни
// пришло за один rAF-тик, resize() реально отработает не больше одного раза за кадр — без
// искусственной задержки (в отличие от setTimeout-дебаунса), отклик всё ещё в пределах кадра.
let _resizePending=false;
window.addEventListener('resize', ()=>{
  if(_resizePending) return; _resizePending=true;
  requestAnimationFrame(()=>{ _resizePending=false; resize(); });
});
window.addEventListener('orientationchange', ()=>setTimeout(resize,150));
/* v1.282.20 «Потеря холста»: Android под нехваткой памяти (и любой браузер при смене GPU)
   отбирает контекст 2D. preventDefault обязателен — без него браузер даже не пытается
   вернуть контекст, и событие contextrestored не придёт никогда. Пока холста нет, рисовать
   некуда: ставим полёт на паузу, иначе игрок разбивается в чёрный экран. При возврате
   забываем все протухшие градиенты и битмапы и пересчитываем линейку. */
try{
  canvas.addEventListener('contextlost', (e)=>{
    e.preventDefault();
    if (typeof S!=='undefined' && S && S.running && !S.paused && typeof pauseGame==='function') pauseGame();
  });
  canvas.addEventListener('contextrestored', ()=>{
    if (typeof gfxInvalidate==='function') gfxInvalidate();
    resize();
    if (typeof drawKick==='function') drawKick();
  });
}catch(e){}
if (tg && tg.onEvent){ try{ tg.onEvent('viewportChanged', ()=>{ if(tg.isExpanded) resize(); tgInsetsSoon(); }); }catch(e){} // v1.102.1: замер — после тишины
  try{ tg.onEvent('fullscreenChanged', ()=>{ resize(); tgInsetsSoon(); }); }catch(e){} // v1.71.0: вход/выход из fullscreen — canvas и подушка пересчитываются по событию, не только по таймеру; v1.102.1: один замер, не три
  /* v1.282.20 «Отказ в полном экране»: cgImm — это НАША просьба, и она нарочно опережает
     ответ Telegram. Если ответом стал отказ (старый клиент, режим окна, десктоп), события
     fullscreenChanged не будет вовсе — флаг навсегда остаётся вруном, подушка считает шапку
     скрытой, и счёт с кнопками уезжают под рамку мессенджера. Слушаем отказ и возвращаем
     флаг к правде: ALREADY_FULLSCREEN — единственный отказ, означающий «уже да». */
  try{ tg.onEvent('fullscreenFailed', tgFullscreenFailed); }catch(e){}
  ['safeAreaChanged','contentSafeAreaChanged'].forEach(ev=>{ try{ tg.onEvent(ev, tgInsetsSoon); }catch(e){} }); } // v1.102.1: поздняя правда Telegram приходит через тишину
if (document.body) tgInsetsSync(); else window.addEventListener('DOMContentLoaded', tgInsetsSync); // первый замер подушки (v1.59.0)
gfxCap(); resize();
