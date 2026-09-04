'use strict';
/* ============================================================
   CORE: Telegram init, утилиты, i18n, хранилище, звук, тактиль,
   wake lock, канвас/вьюпорт, тосты. Не зависит от других модулей.
   ============================================================ */
/* Глоссарий коротких глобалов (22.08.2026): переименование отклонено — риск 638+ правок
   в защищённых файлах ядра не оправдан ради одной лишь читаемости. Вместо этого — расшифровка
   здесь и в шапках других файлов, где эти имена используются.
     AC — AudioContext (объявлен ниже, в этом файле). Создаётся/возобновляется строго по
          жесту игрока; может быть null, 'closed', 'suspended', 'interrupted', 'running'.
     S  — центральное состояние забега (running, paused, score, combo, speed, dist, lives,
          shield/magnet/slowmo/dash, timeScale, skin...). Объявлено в game.js.
     Q  — профиль адаптивного качества графики (level 0-3, fps, mode, служебные счётчики
          автоподстройки). Объявлено в render.js. */

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
const tgWebApp = window.Telegram && window.Telegram.WebApp;
const tg = tgWebApp && tgWebApp.initData ? tgWebApp : null;

/* v1.284.14 «Мост не глотает» — ЯДРО, правка по прямому решению владельца (14.08).
   Мост оборачивает КАЖДЫЙ вызов нашего колбэка в собственный try/catch и молчит
   (`callEventCallbacks` в vendor/telegram-web-app.js). Значит всё, что падает внутри
   обработчиков viewport, полного экрана, безопасных зон, гироскопа и сворачивания,
   не доходит ни до window.onerror, ни до «Почты неба», ни до самописца: весь этот тракт
   работал под непроницаемым колпаком, и охота на шторм калибровок заняла шесть партий
   именно поэтому. Сам мост не правим — он чужой и восстанавливается с сервера Telegram.
   Оборачиваем ВХОД: любой колбэк, отданный мосту, сперва докладывает о падении сам.
   Одно место вместо восьми — и девятая подписка, добавленная завтра, защищена сразу.
   Ошибку после доклада отпускаем дальше: мост её всё равно проглотит, но след уже есть. */
if (tg && typeof tg.onEvent === 'function' && !tg.__cgSafe) {
  const rodnoyOn = tg.onEvent.bind(tg);
  tg.onEvent = function(ev, cb){
    if (typeof cb !== 'function') return rodnoyOn(ev, cb);
    if (cb.__cgWrap) return rodnoyOn(ev, cb.__cgWrap); // повторная подписка тем же колбэком
    const obolochka = function(){
      try { return cb.apply(this, arguments); }
      catch(e){
        const gde = 'мост ' + ev + ': ' + ((e && (e.message || e.name)) || e);
        try { if (typeof BB !== 'undefined' && BB.log) BB.log('err', gde); } catch(_){}
        try { if (typeof BEACON !== 'undefined' && BEACON.err) BEACON.err(gde); } catch(_){}
        throw e;
      }
    };
    try { cb.__cgWrap = obolochka; } catch(_){} // чтобы offEvent снял ту же функцию, а не исходную
    return rodnoyOn(ev, obolochka);
  };
  if (typeof tg.offEvent === 'function') {
    const rodnoyOff = tg.offEvent.bind(tg);
    /* Без этого отписка молча перестала бы работать: мост держит обёртку, а снять просили
       исходный колбэк. Обработчики копились бы навсегда — беда тише исходной. */
    tg.offEvent = function(ev, cb){ return rodnoyOff(ev, (cb && cb.__cgWrap) || cb); };
  }
  tg.__cgSafe = 1;
}
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
   Спрайт со <symbol id="i-*"> лежит в index.html.
   26.08.2026: сама функция переехала в js/i18n.js (I18N зовёт её сразу при
   построении словаря, не лениво — а тот файл теперь грузится ДО этого). Имя
   ic остаётся глобальным и доступным здесь и дальше как раньше. */
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
   Почты неба (skymail.js). Синк честного топа (sync.js) и Звезда-статус (star.js) писали
   на настоящий сервер даже с localhost — тестовый забег мог попасть в боевую таблицу.
   Теперь одна печать на все три двери сразу: window.__labOpen=true снимает её везде разом. */
function isLabEnv(){
  let onLocal=false; try{ const h=location.hostname; onLocal=location.protocol==='file:'||h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'; }catch(e){}
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
   про мировое соревнование, и переносить её на UTC значило бы рвать серию посреди ночи.
   03.09.2026 «Небо месяца»: раньше «Трасса дня» — редкое, престижное событие раз в
   месяц (владелец, вдохновлено Hudson Caravan Festival — у ежедневного повтора нет
   настоящего аркадного предка, у ежемесячного есть). Имя функции намеренно НЕ
   переименовано в trackMonthKey — она кормит весь путь (сид трассы, таблицу
   рекордов, 5 попыток) без единой другой правки просто через смену возвращаемого
   значения; полное переименование задело бы core/game/ui.js и сервер разом ради
   одних только имён, не ради поведения — осознанный компромисс, не забывчивость. */
function trackDayKey(){ const d=new Date(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-01'; }
/* 05.09.2026 «Небо месяца — вернуть повод заходить каждый день» (владелец): при переезде
   с Трассы дня на Небо месяца число «5 попыток» перекочевало как есть, просто окно стало
   «на весь месяц» вместо «на день» — и вместе с окном тихо пропал тот самый повод
   возвращаться КАЖДЫЙ день, ради которого механику вообще затевали (см. план перехода).
   Это НЕ было продумано заново на том шаге, просто унаследовано. Правка: два попытки
   СЕГОДНЯ, каждый день заново, весь месяц — но небо (сид трассы, trackDayKey выше)
   остаётся одно на весь месяц, эта функция его не трогает. attemptDayKey — только
   для счётчика попыток (dailyRun/dailyDoneMark/dailyDoneGet), не для сида и не для
   day, который едет на сервер в daily_submit (там как был, так и остался месячный
   trackDayKey — иначе таблица месяца перепуталась бы по дням). */
function attemptDayKey(){ const d=new Date(); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
const DAILY_ATTEMPTS=2; // было 5 (унаследовано от старой «на день»-версии) — новое число под новый смысл «попытки в день», не «попытки в месяц»
// 03.09.2026 «Спидран — Set Seed»: исследование (speedrun.com/Minecraft) нашло две
// официальные, раздельные жанровые категории — SSG (один и тот же сид навсегда,
// проверка чистого исполнения) и RSG (свежий случайный сид на попытку, проверка
// адаптивности — популярнее у сообщества). Владелец выбрал начать с SSG: одна
// трасса навсегда, всем одна и та же, ни разу не меняется. «day» на сервере
// остаётся date-полем (регэксп ждёт YYYY-MM-DD) — не настоящая дата, а фиксированный
// якорь: ни к сегодняшнему дню, ни к месяцу отношения не имеет.
const SPEEDRUN_ETERNAL_DAY='2000-01-01';
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

/* ---------- i18n (Блок 9) — 26.08.2026: вынесено в js/i18n.js, грузится ДО этого файла.
   I18N/L/LANG/SUPPORTED_LANGS остаются глобальными именами (проект без модулей) —
   строка ниже (после Store) по-прежнему их читает как раньше. ---------- */
/* v1.282.15: выбор игрока применяем СРАЗУ. L инициализировался только из language_code
   Telegram, а сохранённый выбор доезжал из ui.js внутри колбэка Store.init — то есть за
   облаком, до трёх секунд ожидания. Всё это время интерфейс был нарисован автоопределённым
   языком, потом мигал и перерисовывался. Ключ lang локальный, localStorage читается
   синхронно уже здесь — ждать нечего. */
/* v1.284.3: сама строка переехала ниже — см. хвост блока «Хранилище». Здесь она стояла
   ВЫШЕ `const Store = {`, то есть в мёртвой зоне: обращение бросало ReferenceError,
   его съедал собственный catch, и обещание «применяем выбор игрока СРАЗУ» не работало
   ни одного дня с v1.282.15. Разбор ровно этой ловушки уже был написан в index.html
   (про GAME_VERSION) — урок не перенесли в соседний файл. Страж 119. */

/* ---------- Хранилище (Блок 8: CloudStorage primary, localStorage fallback) ---------- */
function gyroUnlocked(){ return Store.get('gyroUnlocked',0)===1; } // замок гироскопа (v1.5.2): рулит только после «Полёта без рук» — новичку наклоны не ломают первые полёты
const Store = {
  mem:{}, cloud:null, _loaded:false, _lastRaw:'',
  _load(){ // v1.70.0: ленивая загрузка — раньше gfxCap() на парсинге core.js писал gfxTier в пустой mem
    if(this._loaded) return; this._loaded=true; // ДО init() и затирал весь blob (настройки, runMode, forgeLast…)
    /* v1.282.13: битое хранилище не затираем молча. Раньше catch просто ставил пустой
       mem — и первый же Store.set перезаписывал ещё восстановимую сырую строку пустотой,
       то есть неудачный разбор превращался в необратимую потерю рекордов и кошелька.
       Теперь сырьё откладывается в сторону: игра стартует чистой, но данные можно вынуть. */
    try{ const raw=localStorage.getItem('cosmogram_v2'); if(raw){ this.mem=JSON.parse(raw)||{}; this._lastRaw=raw; } }
    catch(e){ this.mem={};
      try{ const raw=localStorage.getItem('cosmogram_v2');
        if(raw && !localStorage.getItem('cosmogram_v2_broken')) localStorage.setItem('cosmogram_v2_broken',raw); }catch(e2){}
    }
  },
  init(done){
    this._load();
    /* v1.284.8 «Чёрный экран заговорит»: миграция старого рекорда стоила взлёта. Там, где
       браузер запретил хранилище (инкогнито, запрет данных сайта в webview), getItem не
       возвращает пустоту, а БРОСАЕТ SecurityError — и он вылетал из Store.init прямо в
       верхний уровень ui.js: колбэк не исполнялся, startLoop() не звался, маяк __gameUp
       не поднимался, игрок видел чёрный немой экран. Строкой выше, в _load, обращение
       к тому же хранилищу уже под try — урок был выучен в одном месте и не перенесён
       в соседнее. Рекорд из прошлой версии — приятная мелочь, взлёт — обещание. */
    if (this.mem.best==null){ // миграция рекорда v1
      try{ const ob=+(localStorage.getItem('cosmogram_best')||0); if(ob) this.mem.best=ob; }catch(e){}
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
  CLOUD_KEYS:['best','wallet','ownedSkins','skin','ownedDecals','decal','ownedIcons','icon','ownedLaunchFx','launchFx',
              'savedRun','stats','refBy',
              'ach','achQ','callsign','gyroUnlocked','bestGyro','bestTouch','bestKeys','bestDist','bestBullet','srBest'],
  /* v1.282.13: переполнение больше не проходит молча. Всё хранилище — один ключ, поэтому
     отказ записи роняет разом рекорды, кошелёк и очереди, а прежний пустой catch делал
     это невидимым: в памяти всё на месте, после перезагрузки — ничего. Сначала пробуем
     сбросить объёмное и некритичное (ленту, очередь писем, автосейв) и записать снова;
     если и это не спасло — сигналим в почту неба, чтобы беда была видна. */
  _write(){
    try{ const raw=JSON.stringify(this.mem); localStorage.setItem('cosmogram_v2',raw); this._lastRaw=raw; return true; }
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
  /* v1.284.9: рекорды отдельно от кошелька. Для облака они слиты в один список MAX_KEYS, и
     там это уместно. Здесь — нет: рекорд не убывает никогда, а кошелёк убывает при каждой
     покупке. Взять максимум для кошелька значило бы отменять списание звёзд. */
  RECORD_KEYS:{best:1,bestGyro:1,bestTouch:1,bestKeys:1,bestDist:1,bestBullet:1,srBest:1},
  /* v1.284.9 «Две вкладки». Диск — такой же чужой источник, как облако: пока мы держим свой
     снимок в памяти, соседняя вкладка пишет туда рекорды и покупки. Снимок снимался ровно
     один раз при загрузке и больше с диском не сверялся, поэтому ЛЮБАЯ запись из старой
     вкладки — морзянка дня, статистика, автосейв, флаш самописца раз в 4 секунды —
     возвращала на диск устаревшее целиком. Рекорд и купленный скин исчезали молча.
     Лечим по закону «новый источник складывается со старым»: перед записью сливаем диск
     в память теми же правилами, что и облако. Дёшево: пока на диске лежит наша же строка,
     разбора не происходит вовсе — сравниваем сырьё и выходим.
     `keep` — ключ, который мы прямо сейчас меняем: там наше намерение сильнее диска,
     иначе покупка скина откатывалась бы соседней вкладкой. Исключение — рекорды: они
     не убывают ни при каких обстоятельствах, даже по собственной просьбе устаревшей вкладки.
     Удаления с диска не переносим намеренно: пропажа ключа у соседа не должна стирать наш. */
  _mergeDisk(keep){
    let raw=null;
    try{ raw=localStorage.getItem('cosmogram_v2'); }catch(e){ return; } // хранилище запрещено — сливать не с чем
    if(raw==null || raw===this._lastRaw) return;
    let disk=null; try{ disk=JSON.parse(raw); }catch(e){ return; } // битое сырьё бережёт _load, здесь молчим
    if(!disk || typeof disk!=='object') return;
    for(const k in disk){
      const nv=disk[k], cur=this.mem[k];
      if(k===keep){
        if(this.RECORD_KEYS[k] && typeof nv==='number' && typeof cur==='number') this.mem[k]=Math.max(cur,nv);
        continue;
      }
      if(this.MAX_KEYS[k] && typeof nv==='number' && typeof cur==='number') this.mem[k]=Math.max(cur,nv);
      else if((k==='ownedSkins'||k==='ownedDecals'||k==='ownedIcons'||k==='ownedLaunchFx'||k==='ach') && Array.isArray(nv) && Array.isArray(cur)) this.mem[k]=[...new Set(cur.concat(nv))];
      else this.mem[k]=nv;
    }
  },
  _mergeCloud(res){
    for(const k in res){
      const v=res[k];
      if(v===''||v==null) continue;
      let nv; try{ nv=JSON.parse(v); }catch(e){ nv=v; }
      const cur=this.mem[k];
      if(this.MAX_KEYS[k] && typeof nv==='number' && typeof cur==='number') this.mem[k]=Math.max(cur,nv); // рекорд не крадём ни в одну сторону
      else if((k==='ownedSkins'||k==='ownedDecals'||k==='ownedIcons'||k==='ownedLaunchFx') && Array.isArray(nv) && Array.isArray(cur)) this.mem[k]=[...new Set(cur.concat(nv))]; // купленное не пропадает
      else if(k==='ach' && Array.isArray(nv) && Array.isArray(cur)) this.mem[k]=[...new Set(cur.concat(nv))]; // и открытые достижения тоже
      else this.mem[k]=nv;
    }
  },
  get(k,def){ this._load(); const v=this.mem[k]; return v==null?def:v; },
  set(k,v){
    this._load(); this.mem[k]=v; this._mergeDisk(k);
    this._write();
    if(this.cloud && this.CLOUD_KEYS.indexOf(k)>=0){ try{ this.cloud.setItem(k,JSON.stringify(v),()=>{}); }catch(e){} }
  },
  del(k){
    this._load(); this._mergeDisk(k); delete this.mem[k]; // сливаем ДО удаления: чужие ключи спасаем, свой убираем
    this._write();
    if(this.cloud && this.CLOUD_KEYS.indexOf(k)>=0){ try{ this.cloud.removeItem(k,()=>{}); }catch(e){} }
  }
};

/* Выбор языка применяем сразу: ключ lang локальный, localStorage читается синхронно,
   ждать облако незачем. Обязано стоять ПОСЛЕ объявления Store (страж 119). */
try{ const _lp=Store.get('lang','auto'); if(_lp!=='auto' && I18N[_lp]) L=I18N[_lp]; }catch(e){}
// санация значений из облака — мусор не должен ронять игру
function saneNumber(v,def){ if(v==null||v==='') return def; v=+v; return isFinite(v)?v:def; } // v1.282.15: +null и +'' дают 0, а не дефолт — saneNumber(null,3) возвращал 0. Сейчас не стреляет только потому, что Store.get сам отсекает null; это латентная мина под чтением автосейва (жизни, волна, чувствительность)
function saneArray(v,def){ return Array.isArray(v)?v:def; }

/* ---------- Звук (Блок 5, WebAudio-синтез — форматы не нужны) ---------- */
let AC=null;
let audioResumeFailReported=false; // 24.08.2026: один сигнал за сессию, не письмо на каждый неудачный тик сторожа
/* 22.08.2026 «Тихая заморозка»: WebKit-баг из AUDIO-SYSTEM.md §4.1 — после возврата
   из фона AudioContext.state продолжает честно врать 'running', а currentTime почти
   не растёт. Ни одной ошибки при этом не бросается — window.onerror тут бессилен,
   бесполезно и просто спросить state. Единственный способ поймать — сравнить два
   замера currentTime во времени. Новый таймер не заводим: цепляемся к уже
   существующему 6-секундному тику audioKeep() (js/ui.js). */
let acPrevT=0, acPrevAt=0, acStalled=false;
function audioSample(){
  if(!AC || AC.state!=='running') return;
  const nowAt=performance.now();
  if(acPrevAt>0){
    const wallDelta=(nowAt-acPrevAt)/1000, ctxDelta=AC.currentTime-acPrevT;
    const wasStalled=acStalled;
    acStalled = wallDelta>1 && ctxDelta < wallDelta*0.3; // время в контексте идёт заметно медленнее настенных часов
    if(acStalled && !wasStalled){
      audioRecoverStall(); // 26.08.2026: раньше только сообщали диагноз (audioVStalled) и ждали — часы контекста, однажды замерев, сами не отходят, ждать нечего
      return; // 26.08.2026: audioRecoverStall() обнуляет AC внутри себя — строка ниже читала AC.currentTime уже у null и падала Uncaught TypeError на каждом тике audioKeep(), молча убивая звук насовсем (баг в самом фиксе, найден по логу телефона + Supabase)
    }
  }
  acPrevT=AC.currentTime; acPrevAt=nowAt;
  audioHeartbeatTick(); // 30.08.2026: см. комментарий над функцией — тот же тик, не новый таймер
}
/* 26.08.2026: «тихая заморозка» неизлечима внутри того же AudioContext (сам баг — в часах
   браузера, не в нашем коде) — единственное лекарство таким же приёмом, что уже был для
   state==='closed' (v1.282.20): бросить труп, дать audio() создать новый. mg/conv/wet в
   music.js (ensureChain) и g/src в engine (engine.start, тот же файл) держат ссылку на
   старый контекст — они сами замечают несовпадение (mg.context!==ac) и пересобираются на
   следующем тике audioKeep() (js/ui.js, каждые 6с), сами узлы здесь, в core.js, не трогаем. */
/* 30.08.2026 «Heartbeat Keepalive» (гипотеза, не подтверждённый факт): источник — «5 нишевых
   исследований Principal Engineer», 25.08.2026. Android WebView (особенно MIUI/HyperOS)
   агрессивно морозит вкладку без звука, если решает, что она «неактивна» — например, после
   свайпа шторки уведомлений. Беззвучный тик (gain 0.001, ультразвук 18кГц — двойная
   подстраховка неслышимости) раз в 2с должен давать ОС тот же сигнал «здесь играет медиа»,
   что и настоящий звук, без осознанного звука для игрока. Совпадает по платформе
   (Android+Telegram) с телеметрией audio_stall_recover, но проверить сам эффект здесь
   нельзя — только живыми сигналами после выхода. Новый таймер не заводим: тик уже
   вызывается из существующего 2с-цикла audioSample() ниже (тот же цикл, что уже ловит
   «тихую заморозку») — тот же принцип экономии таймеров, что и у неё самой. */
function audioHeartbeatTick(){
  if(!AC || AC.state!=='running') return;
  try{
    const osc=AC.createOscillator(), g=AC.createGain();
    g.gain.value=0.001; osc.frequency.value=18000;
    osc.connect(g); g.connect(AC.destination);
    osc.start(); osc.stop(AC.currentTime+0.05);
  }catch(e){}
}
function audioRecoverStall(){
  try{ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('audio_stall_recover', AC.state); }catch(_){}
  try{ AC.close(); }catch(e){}
  AC=null; NOISE_BUF=null; acPrevT=0; acPrevAt=0; acStalled=false;
  audioSuspendedSinceAt=0; audioResumeFailReported=false; audioNeverResumedReported=false; // новый контекст — новая попытка, старые «уже сообщили» не должны душить сигнал о новой поломке
}
/* v1.474.0 «Тихое зависание»: research 24.08.2026 нашёл в самой спецификации Web Audio API
   (webaudio.github.io/web-audio-api, шаг 6 алгоритма resume()) — если контексту «не разрешено
   запуститься» (заблокирован автополитикой), promise просто копится во внутреннем списке
   ожидающих и НЕ отклоняется вовсе. Ни resolve, ни reject — до тех пор, пока не придёт
   настоящий пользовательский жест, разрешающий запуск. Значит .catch() ниже структурно
   слеп именно к этому сценарию — самому вероятному объяснению «33 секунды забега, ни
   единого звука, 0 сигналов audio_resume_fail за 10 дней» (см. комментарий ниже про
   24.08.2026). Единственный надёжный способ поймать зависший resume() — не ждать отказа,
   а мерить время: если контекст не 'running' дольше разумного порога — это и есть сигнал,
   независимо от того, отклонился ли когда-нибудь сам promise. */
let audioNeverResumedReported=false;
let audioSuspendedSinceAt=0;
const AUDIO_NEVER_RESUMED_MS=3000;
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
  /* 24.08.2026: раньше отказ resume() глотался молча (.catch(()=>{})) — ни ошибки, ни строки
     в базе, ничего. Жалоба владельца «музыка не работает вообще» подтверждена живым замером
     видео (33 секунды активной игры, ни одного звука) — но ПОЧЕМУ resume() не срабатывает
     на конкретном устройстве, до сих пор нечем увидеть: 0 сигналов про звук за 10 дней в
     базе. Один раз за сессию — тихий сигнал с настоящей причиной отказа браузера, не смена
     поведения игры, только видимость. */
  if(AC && (AC.state==='suspended' || AC.state==='interrupted')){
    if(!audioSuspendedSinceAt) audioSuspendedSinceAt=performance.now(); // v1.474.0: начало текущей серии «не running»
    AC.resume().catch(e=>{
      if (!audioResumeFailReported) {
        audioResumeFailReported = true;
        try{ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('audio_resume_fail', String((e&&e.name)||e||'?').slice(0,60)); }catch(_){}
      }
    });
    /* v1.474.0: явный отказ (audio_resume_fail) уже объясняет причину — второй сигнал
       про то же самое зависание был бы шумом, не новым знанием. Шлём только когда
       .catch() выше молчал ТАК ДОЛГО, что молчание — само по себе и есть ответ. */
    if (audioSuspendedSinceAt && (performance.now()-audioSuspendedSinceAt)>AUDIO_NEVER_RESUMED_MS
        && !audioNeverResumedReported && !audioResumeFailReported){
      audioNeverResumedReported=true;
      try{ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('audio_never_resumed', AC.state); }catch(_){}
    }
  } else if (AC && AC.state==='running'){
    audioSuspendedSinceAt=0; // v1.474.0: серия закончилась честно — следующее зависание (например, после нового звонка) должно уметь отчитаться заново
  }
  return AC; // v1.282.15: сторож звука дёргает это по таймеру каждые 2с, а resume вне жеста отклоняется — отказ уходил в глобальный обработчик и улетал письмом как «ошибка борта», маскируя настоящие падения
}
const GAME_VERSION='1.478.75'; // «Об игре» в настройках — при репортах багов спрашивать её; «Рассвет космоса»
let MUTED=false; // настройка звука (экран настроек), персист 'muted'
let VIBRO=true; // настройка виброотклика, персист 'vibro'
let CONTRAST=false, COLORBLIND=false; // v1.280.0: усиление контраста/насыщенности на canvas, персист 'contrast'/'colorblind'
// Скоростные полосы полностью удалены: они не участвуют в игровой логике и не должны
// оставаться в настройках, хранилище или рендере. Это безопасный способ отключить эффект
// без ломки оставшихся систем и без побочных зависимостей по флагу.
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
/* 31.08.2026 «Честный байтовый бюджет»: код трассы (forge.js, CG2) делит диплинк Telegram
   (~64 символа) на фиксированный заголовок + имя. Плоский лимит «N символов для всех» бил
   по кириллице вдвое сильнее латиницы (2 байта UTF-8 на букву против 1) — не по отдельному
   правилу, а просто потому что кириллица дороже. Байтовый бюджет (не символьный) сам
   уравнивает: английский получает больше букв, кириллица — меньше, ровно во столько раз,
   во сколько её байт дороже — без единой строки кода «если это кириллица». Проверено
   численно (скрипт до правки): 35 байт = 35 англ. букв ИЛИ 17 кириллических, диплинк не
   превышает 64 символа ни в одном случае. */
function utf8TruncateBytes(str, maxBytes){
  const enc=new TextEncoder(); let out='', bytes=0;
  for(const ch of str){ // for..of строки — по code point, не по code unit: суррогатные пары (эмодзи) режутся целиком, не пополам
    const chBytes=enc.encode(ch).length;
    if(bytes+chBytes>maxBytes) break;
    out+=ch; bytes+=chBytes;
  }
  return out;
}
function sanitizeTrackName(s){ // v1.108.1: имя трассы Кузницы неба — расшаривается публично, как и позывной,
  // но шире по алфавиту (пробелы) — тот же чёрный список CS_BAD, другой белый список символов
  const raw=utf8TruncateBytes(String(s||'').trim(), 35); // 31.08.2026: было .slice(0,20) — символьный лимит, теперь байтовый
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
function morseHF(){ // тактильный мост Telegram — только там, где версия поддерживает Haptics
  try{
    const w=window.Telegram&&window.Telegram.WebApp;
    if (!w || !w.HapticFeedback || !tgv('6.1')) return null;
    const hf=w.HapticFeedback;
    if (typeof hf.impactOccurred==='function' || typeof hf.notificationOccurred==='function') return hf;
  }catch(e){}
  return null;
}
function hapticMorse(cs){
  /* v1.284.3: виброотклик — общий выключатель тактильности, эфир — частный. Раньше эфир
     спрашивал только свой тумблер, и выключенное вибро всё равно отстукивало позывной при
     рекорде, первом полёте дня и входе в топ-10. Согласие даётся на смысл, а не на
     подсистему (закон 11). Страж 120. */
  if (typeof VIBRO!=='undefined' && !VIBRO) return;
  if (!morseHapOn()) return;
  const seq=morseHapSeq(cs); if (!seq.length) return;
  const hf=morseHF();
  if (hf){ // точка — лёгкий импульс, тире — тяжёлый, по расписанию
    seq.forEach(e=>setTimeout(()=>{ try{ hf.impactOccurred(e.k==='dash'?'heavy':'light'); }catch(_){ } }, e.t));
  } else if (navigator.vibrate && userGestureReady){ // веб: точка 50мс, тире 150мс, паузы по расписанию
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
/* 28.08.2026 «Добро пожаловать»: раньше баннер был у КАЖДОГО забега и стал лишним
   (v1.87.0, см. коммент у sfx.launch в ui.js) — убрали совсем. Владелец нашёл старый
   скриншот и попросил вернуть, но не на каждый полёт, а один раз в день, тем же
   приёмом, что у морзянки выше: тихая дневная проверка + собственный ключ в Store. */
let welcomeTimer=null;
function welcomeDayCheck(){
  const k=todayKey();
  if (Store.get('welcomeDay','')===k) return false;
  Store.set('welcomeDay',k);
  return true;
}
function welcomeShow(){
  const e=$('welcomeMsg'); if(!e) return;
  e.textContent=L.welcomeMsg;
  e.classList.add('show');
  clearTimeout(welcomeTimer);
  welcomeTimer=setTimeout(()=>e.classList.remove('show'), 2400);
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
function dayMark(k){ // взлёт: день начался, даже если забег не долетит до отправки
  // 27.08.2026: k — день взлёта (S.dayKey из ui.js), если дан. Раньше здесь и в dayAdd()
  // ниже todayKey() читался НЕЗАВИСИМО в двух разных, разнесённых по времени местах —
  // взлёт сразу, посадка спустя весь забег. Игрок, взлетевший за секунду до местной
  // полуночи, получал взлёт в журнале одного дня, а очки с посадки утекали в следующий:
  // первый день навсегда оставался пустым (runs:0), второй получал забег, которого не
  // начинал. Страж 142 (cosmogram-crew) поймал это на подменённых часах. Лечится тем же
  // приёмом, что уже есть у Трассы дня (S.dailyDay) — день читается один раз, на взлёте.
  const j=dayJournal(); dayRow(j,k||todayKey()); dayJournalSave(j);
}
/* Посадка. Счётные поля (забеги, счёт, метры, секунды, звёзды) — факты аккаунта, они
   едут всегда. Поведенческие (чем играл, от чего погиб) пишутся только при включённом
   тумблере «Помогать экипажу отчётами и статистикой»: это уже наблюдение за игроком,
   а не его собственный результат. Выключил — их просто нет ни в журнале, ни в базе. */
function dayAdd(o){
  try{
    const j=dayJournal(), r=dayRow(j,o.day||todayKey()); // o.day — день ВЗЛЁТА (S.dayKey), не повторное чтение часов на посадке; см. dayMark() выше
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
  try{ const w=window.Telegram&&window.Telegram.WebApp; return (w&&(w.initData||window.TelegramWebviewProxy))?w:null; }catch(e){ return null; }
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
// 28.08.2026 «Живой замер вниз», итог: владелец измерил на реальном устройстве — 24px вниз
// хватает, чтобы жизни вышли из-под кнопки Telegram «⌄ ⋮» целиком. Зашито в index.html
// (#livesCanvas margin-top), временная кнопка в Сервисном центре (cycleSadDbg) снята.
/* Текст окна «тесно»: лежит ли телефон набок. Вынесено отдельно, потому что зовут двое —
   resize() при каждом замере и applyLang() при смене языка; иначе одно затирало другое. */
function tooNarrowText(nabok){
  if (typeof L==='undefined' || !L) return;
  const t=document.getElementById('tooNarrowTitle'), h=document.getElementById('tooNarrowHint');
  if(t) t.textContent = nabok ? (L.landTitle||L.tooNarrowTitle) : L.tooNarrowTitle;
  if(h) h.textContent = nabok ? (L.landHint ||L.tooNarrowHint)  : L.tooNarrowHint;
}
function tgInsetsSync(){ // v1.59.0 «Подушка»: безопасная зона в CSS-переменные --js-sat/--js-sab
  const r=document.documentElement && document.documentElement.style; if(!r) return;
  let top=0, bot=0, right=0;
  const t=tgApp();
  try{ const c=t&&(t.contentSafeAreaInset||t.safeAreaInset); if(c){ top=+c.top||0; bot=+c.bottom||0; right=+c.right||0; } }catch(e){}
  if (!top && satProbe()<1 && ('ontouchstart' in window)) top=28; // мобильный WebView с мёртвым env: статус-бар всё равно есть
  /* 13.08.2026 «Подушка не для меню». Дальше идут две ступени, которые НЕ измеряют
     перекрытие, а назначают его: 96 мер, потому что под столько свёрстан верхний HUD.
     Для полёта это правильно — счёт не должен лепиться к краю. Для экранов меню это
     чистая потеря: 96 + 48 давали 144 меры пустоты, шестую часть телефона, на каждом
     экране. Запоминаем НАСТОЯЩЕЕ перекрытие до назначений — им живут меню, а HUD
     остаётся на назначенной подушке. Две разные величины, а не одна на всех. */
  const realTop = top;
  // v1.82.0 «Крупная рамка»: мост на связи, шапка НЕ скрыта, а отступ сообщён < 64 —
  // число врёт (превью с фейковым мостом, старые клиенты без API инсетов).
  // Не верим: раз Telegram рядом и не в полном экране — шапка видима, пол 96px.
  // v1.102.1: «в полном экране ли мы» спрашиваем у НАШЕГО флага — isFullscreen отстаёт
  // от просьбы на десятки миллисекунд, и в этот зазор экран итогов рисовался криво.
  const cgFs=(cgImm!==null ? cgImm : !!(t&&t.isFullscreen));
  if (t && !cgFs && ('ontouchstart' in window) && top<64) top=96;
  /* 27.08.2026 «Жизни за родными кнопками», часть 2: --sar (index.html) читает те же
     мостовые переменные Telegram (--tg-content-safe-area-inset-right), что и --sat читает
     для верха — но на реальном устройстве владельца (Android, не fullscreen) правый
     инсет пришёл нулём, тем же «мёртвым нулём», что уже документирован для верхнего
     ЗДЕСЬ ЖЕ (satProbe комментарий выше). Жизни в правом углу HUD остались под «⌄»/«⋮».
     Честно: 44px — НЕ измеренное число (в отличие от «96» выше, подобранного владельцем
     ранее по разбору жалоб) — это оценка по стандартному минимальному размеру касания
     Android (48dp), округлённая под один значок. Требует подтверждения на реальном
     устройстве владельца — если этого не хватит или будет с запасом, число перепроверить. */
  if (t && !cgFs && ('ontouchstart' in window) && right<24) right=44;
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
  r.setProperty('--js-sat-real', realTop+'px');   // 13.08.2026: измеренное, а не назначенное
  r.setProperty('--js-sab', bot+'px');
  r.setProperty('--js-sar', right+'px');
  requestAnimationFrame(syncScoreHudGap); // 23.08.2026: --sat только что могла поменяться — ждём кадр, чтобы scorePack успел перекомпоноваться, прежде чем мерить его реальный низ
}
/* 28.08.2026 «Зазор ждёт шрифт»: syncScoreHudGap() перезапускается при смене --sat и при
   изменении ширины окна (см. оба места её вызова) — но НЕ при подгрузке самого файла Exo 2
   (fonts/exo2-*.woff2, сетевой запрос, font-display:swap). Если игра успевает измерить
   #scorePack ДО того, как шрифт доехал (медленная сеть, холодный кэш — ровно то, что чаще
   у настоящего игрока, чем на локальной раздаче), число застревает по запасному системному
   шрифту, а не по Exo 2 — небольшая, но настоящая щель. document.fonts.ready — штатный
   промис браузера, срабатывает ровно раз, как только все объявленные @font-face готовы. */
if (typeof document!=='undefined' && document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{ requestAnimationFrame(syncScoreHudGap); }).catch(()=>{});
}
function syncScoreHudGap(){ // 23.08.2026 «Счёт и HUD — один зазор, не две формулы»: #topHud садится
  // от РЕАЛЬНОГО нижнего края #scorePack — не от отдельной формулы через --sat, которая
  // могла разъехаться с формулой scorePack (жалоба владельца, подтверждена измерением в
  // пикселях, 22-23.08.2026).
  // 26.08.2026: та же дыра держалась и во ВТОРОЙ строке HUD — #telemHud (Расстояние/Плавность,
  // «я много раз это чинил ранее и там до сих пор дыра») — эта правка её ни разу не касалась,
  // формула #telemHud так и осталась отдельной от scorePack. Тот же приём, то же число.
  // 28.08.2026: было +8 — владелец на реальном устройстве всё ещё видел заметную щель между
  // счётом и «Расстояние», просил ближе. +2 — тот же минимальный зазор, что уже держит
  // «СЧЁТ» вплотную к числу над ним (#scorePack, gap:2px) — не слипается, но заметно теснее.
  const sp=document.getElementById('scorePack');
  if(!sp) return;
  const rect=sp.getBoundingClientRect();
  const gapPx = Math.round(rect.bottom+2)+'px';
  document.documentElement.style.setProperty('--topHudTop', gapPx);
  document.documentElement.style.setProperty('--telemHudTop', gapPx);
  /* 01.09.2026 «Полоса коридора впритык»: тот же принцип, один раз ещё — .corrEdge (боковые
     звёзды широкого экрана) держала отдельную забитую руками цифру (190px), унаследованную
     от диагноза, который сам же потом опроверг другой страж (см. историю в index.html у
     .corrEdge). Вместо новой забитой руками цифры — тот же измеритель: РЕАЛЬНЫЙ нижний край
     самого нижнего элемента HUD (телеметрия и левая кучка паузы/жизней — разной высоты на
     разных языках/раскладках), плюс небольшой запас. Владелец — «под HUD почти в притык». */
  const th=document.getElementById('telemHud'), pp=document.getElementById('pausePack');
  const thB=th?th.getBoundingClientRect().bottom:0, ppB=pp?pp.getBoundingClientRect().bottom:0;
  const corrTop=Math.round(Math.max(thB,ppB)+6)+'px';
  document.documentElement.style.setProperty('--corrEdgeTop', corrTop);
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
  const portret = window.innerHeight >= window.innerWidth;
  const t=tgApp();
  if(t && tgVerAtLeast(t,'8.0') && t.lockOrientation){
    if(portret){ try{ t.lockOrientation(); }catch(e){} }
    return;                       // мост справился — второй замок ни к чему
  }
  /* 13.08.2026 «Замок и без моста». Проверка снимком владельца: игра лежала набок не в
     Telegram, а в обычном браузере — там первая же строка прежнего замка (`if(!t) return`)
     выключала его целиком. У браузера есть свой замок, но он даётся только в полном экране;
     в обычной вкладке платформа запрещает странице держать ориентацию, и обойти это нечем.
     Поэтому просим — и спокойно принимаем отказ: окно «Поверните телефон» остаётся
     последней страховкой ровно для этого случая.
     Обещание ОБЯЗАНО быть поймано: браузер отвечает отказом (rejected promise), и без
     .catch каждый поворот телефона печатал бы в консоль необработанную ошибку. */
  try{
    const so = (typeof screen!=='undefined') && screen.orientation;
    if(so && so.lock && portret){
      const p = so.lock('portrait');
      if(p && p.catch) p.catch(()=>{});
    }
  }catch(e){}
}
tgOrientLock();
if (typeof window!=='undefined' && typeof window.addEventListener==='function') {
  window.addEventListener('orientationchange', ()=>setTimeout(tgOrientLock,200));
  // часть Android-клиентов глотает orientationchange (сплит-скрин, замок поворота в системе) —
  // дублируем на resize с лёгким дебаунсом: первый портретный кадр довзводит замок
  let _olT=0;
  window.addEventListener('resize', ()=>{ if(_olT) return; _olT=setTimeout(()=>{ _olT=0; tgOrientLock(); },250); });
}

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
let userGestureReady=false;
function allowHapticsNow(){ userGestureReady=true; }
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
  if(!done && navigator.vibrate && userGestureReady){
    try{ navigator.vibrate(kind==='heavy'?70:kind==='medium'?40:15); }catch(e){}
  }
}
if (typeof window!=='undefined' && typeof window.addEventListener==='function') {
  const unlockHaptics = function(){ allowHapticsNow(); };
  window.addEventListener('pointerdown', unlockHaptics, { passive:true, once:true });
  window.addEventListener('touchstart', unlockHaptics, { passive:true, once:true });
  window.addEventListener('keydown', unlockHaptics, { passive:true, once:true });
  window.addEventListener('click', unlockHaptics, { passive:true, once:true });
}

/* ---------- Wake Lock (Блок 1) ---------- */
let wakeLock=null, _wakeLockPending=false;
async function keepAwake(){ // v1.282.15: второй вызов до releaseAwake присваивал новый замок поверх старого — старый не отпускался никогда, и экран мог остаться незасыпающим после выхода в меню
  if(wakeLock || _wakeLockPending) return; // 30.08.2026: сама проверка wakeLock синхронна, но request() — нет; два вызова подряд ДО того как первый await разрешится, оба проходили эту проверку (она ещё видела wakeLock===null) — _wakeLockPending закрывает окно гонки синхронно, до await
  if(!('wakeLock' in navigator)) return;
  _wakeLockPending=true;
  try{ wakeLock=await navigator.wakeLock.request('screen'); }catch(e){}
  finally{ _wakeLockPending=false; }
}
function releaseAwake(){ try{ wakeLock&&wakeLock.release(); }catch(e){} wakeLock=null; }

/* ---------- Канвас / вьюпорт (Блок 3) ---------- */
const canvas = $('game');
/* v1.99.3 «Сочные чернила»: флагманский экран (охват P3) умеет краски сочнее sRGB —
   зажигаем их только у коронного золота (звезда, её салют, вспышка рекорда).
   sRGB-краски в P3-холсте звучат ровно как раньше: экран без P3 не заметит ничего. */
const P3 = (typeof matchMedia==='function') && matchMedia('(color-gamut: p3)').matches;
function juicy(srgb, p3){ return P3 ? p3 : srgb; } // пара чернил: обычные — всем, сочные — флагману
/* 13.08.2026 «Кадр не платит лишнего».
   alpha:false — небо непрозрачно ВСЕГДА: мы закрашиваем весь кадр каждый раз, и альфа
   у главного холста нужна была ровно затем, чтобы браузер каждый кадр смешивал его со
   страницей под ним. Работа, результат которой не видит никто.
   desynchronized НЕ включаем намеренно: это подсказка «рисуй мимо композитора», она
   меняет то, что игрок видит, и умеет давать разрыв кадра. Такое включают, посмотрев
   на живые снимки, а прибора «глаза» у нас сейчас нет — включим, когда будет чем
   доказать, что стало лучше, а не только быстрее. */
const ctx = canvas.getContext('2d', Object.assign({alpha:false}, P3?{colorSpace:'display-p3'}:null)); // v1.99.3: флагману — расширенный набор чернил
/* Умолчание imageSmoothingQuality зависит от браузера, и часть берёт бикубику ('high') —
   заметно дороже на полноэкранных спрайтах, а разницы на нашем небе не видно. */
try{ ctx.imageSmoothingQuality='low'; }catch(e){}
/* v1.282.20 «Сочные чернила и в кэшах»: офскрин-холсты (свечения, туманности, виньетка)
   создавались обычным getContext('2d') — то есть всегда в sRGB. Всё, что нарисовано в них
   красками juicy(), обрезалось до охвата sRGB ещё до попадания на главный холст: сочные
   чернила зажигались только там, где рисуют напрямую. Один общий вход — и кэши говорят на
   том же языке цвета, что и небо. sRGB-краски в P3-холсте звучат ровно как раньше. */
function ctx2d(c, opt){ try{ return c.getContext('2d', Object.assign({}, P3?{colorSpace:'display-p3'}:null, opt||null)); }catch(e){ return c.getContext('2d'); } }
let W=0, H=0, DPR=1, dprCap=2, SC=1, capPx=2560, SC_MIN=0.5;
let canvasContextLost=false;
let stableH=0; // v1.284.6: последняя высота вьюпорта БЕЗ клавиатуры — см. resize(), страж 131 // SC — «Метр неба» (v1.99.0): цена одного логического пикселя в css-пикселях; capPx — «Потолок листа» (v1.99.1): длинная сторона холста в настоящих пикселях; SC_MIN — «Пол листа» (v1.108.1): ниже — не рисуем нерабочую крошку, честно просим больше места
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
  /* 23.08.2026: картотека знала только мобильные чипы — любой настольный GPU (ноутбук,
     десктоп) давал null и всегда уходил в запасной путь по ядрам/памяти, где Firefox
     терял Ультра навсегда (см. ниже). Дискретные Nvidia/AMD — тир 2: даже бюджетная
     видеокарта последнего десятилетия несравнимо мощнее любого мобильного чипа для
     простого 2D-канваса этой игры. Intel — тир 1: встроенная графика бывает и старой
     слабой (HD), и новой приличной (Iris Xe), безопасная середина без гадания по модели. */
  if(/nvidia|geforce|quadro|rtx|gtx/.test(g)) return 2;
  if(/radeon|\bamd\b/.test(g)) return 2;
  if(/intel/.test(g)) return 1;
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
const GFX_TIER_LOGIC_V=3; // 28.08.2026: бито под смягчённый десктопный порог (см. gfxTier ниже) — иначе уже закэшированный «неверный» тир держался бы у владельца навсегда // v1.282.20: бито под чтение performance_class — иначе исправленная логика никогда бы не выполнилась у тех, кто уже открывал игру // v1.282.9: бито на v1.282.3 (честная классификация Apple GPU по числу ядер вместо
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
    /* 23.08.2026: navigator.deviceMemory — Chrome-only API, в Firefox не существует вовсе
       (не «мало памяти», а именно «браузер не говорит»). Раньше ||4 тихо превращал
       «не знаю» в конкретное число 4 — ниже порога Ультра (mem>=6) навсегда, сколько бы
       ядер ни было у машины. Теперь: память РЕАЛЬНО известна — решаем как раньше; память
       неизвестна — решаем по одним ядрам, порог для тира 1 мягче (нет второго свидетеля). */
    const cores=navigator.hardwareConcurrency||4;
    const memKnown = typeof navigator.deviceMemory==='number';
    /* 28.08.2026 «Firefox прячет видеокарту»: gpuRenderer() всё чаще возвращает пустую или
       нейтральную строку на десктопном Firefox — защита от фингерпринтинга, не признак
       слабого железа (владелец: ноутбук с рабочей видеокартой падал до «Высокая», хотя на
       Android-телефоне та же игра честно получала «Ультра»). До этой ветки код доходит,
       только если И строка GPU, И deviceMemory уже смолчали — остались одни ядра. На
       телефоне 8 ядер бывает и у бюджетника — не показатель, мобильный порог не трогаем.
       На столе/ноутбуке ('ontouchstart' отсутствует — тот же признак мобильности, что уже
       использован в этом файле у tgInsetsSync) 6+ ядер почти никогда не бюджетная встроенная
       графика — порог для тира 2 мягче именно здесь, только для этой безмолвной ветки. */
    const desktopNoTouch = !('ontouchstart' in window);
    if(memKnown){ const mem=navigator.deviceMemory; t=(cores>=8&&mem>=6)?2:(cores>=6?1:0); }
    else if(desktopNoTouch){ t=(cores>=6)?2:(cores>=4?1:0); }
    else { t=(cores>=8)?2:(cores>=4?1:0); }
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
function gfxCap(){ // мобильный потолок DPR: чёткость ограничена, чтобы не платить памятью и нагревом
  const raw=window.devicePixelRatio||1;
  const m=Store.get('gfx','auto');
  const lowMem = (typeof navigator!=='undefined' && typeof navigator.deviceMemory==='number' && navigator.deviceMemory<=2)
    || isAndroidGo();
  if(m==='low') dprCap=1.25;
  else if(m==='med') dprCap=1.75;
  else if(m==='high') dprCap=2.25;
  else if(m==='ultra' && gfxUltraOk()) dprCap=Math.min(raw,2.5);
  else{
    const t=gfxTier(), lv=(typeof Q!=='undefined')?Q.level:2;
    // v1.282.3: раньше только Q.level>=3 (Ультра) снижал разрешение у тира 2+ — любое понижение
    // до Q2/Q1/Q0 (авто-качество честно реагирует на низкий fps, включая временный троттлинг
    // у настоящих флагманов, не только неверно определённые устройства) не трогало холст вообще,
    // 3x оставался всегда. Теперь разрешение спускается по той же лестнице, что и сами эффекты.
    /* 28.08.2026 «Доказательство лучше догадки», часть 2 (render.js: qualityTick, cap=3):
       живой auto-подъём теперь может доказать Q.level 3 на ЛЮБОМ статическом тире t, не
       только t>=2 — но эта строка проверяла lv>=3 ТОЛЬКО внутри ветки t>=2, и не-флагманский
       t получал эффекты «Ультра» на урезанном разрешении (капа не поднимал). lv>=3 проверяем
       первым, до деления по t — та же живая страховка (аварийный откат при просадке fps),
       что уже разрешила эффекты, теперь честно поднимает и чёткость. */
    dprCap = lv>=3 ? Math.min(raw,2.5)
      : t>=2 ? (lv===2?2:lv===1?1.5:1.25)
      : t===0 ? (isAndroidGo()?1:1.25) : ((raw>=2.5&&(navigator.hardwareConcurrency||4)>=8)?2:1.75);
    if(lowMem && dprCap>1.5) dprCap=1.5;
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
  const cssW = window.innerWidth;
  const rt=tgApp(); // v1.71.0: в fullscreen viewportStableHeight на Android может лагать — берём честный innerHeight
  // 02.09.2026 (владелец вживую, iPhone 16, скриншоты): тот же класс бага и в этой ветке —
  // viewportStableHeight занижен, холст короче окна, снизу видна голая чёрная полоса под
  // холстом. window.innerHeight — честная правда браузера о своей же странице, никогда не
  // соврёт В БОЛЬШУЮ сторону; берём больший из двух — заниженный stableHeight не может
  // сделать холст короче того, что браузер сам подтверждает как видимое. Страж 150.
  let cssH = window.innerHeight;
  let vhGap = 0; // 02.09.2026: заполняется ниже, сигнал шлём в конце — после свежего кадра, не раньше (иначе снимок будет пустым)
  if (rt && rt.isFullscreen) cssH = window.innerHeight;
  else if (rt && rt.viewportStableHeight && rt.isExpanded){
    cssH = Math.max(rt.viewportStableHeight, window.innerHeight);
    if (rt.viewportStableHeight < window.innerHeight - 20) vhGap = window.innerHeight - rt.viewportStableHeight;
  }
  if (cssW<=0 || cssH<=0) return;
  /* v1.284.6 «Клавиатура — не узкое окно». Экранная клавиатура съедает 250-350 px высоты
     из 667, SC проваливается ниже пола, и поверх поля, в которое игрок ПЕЧАТАЕТ, встаёт
     полноэкранное «Разверните окно, чтобы полететь». Совет бессмысленный: окно у телефона
     не разворачивается. Замерено прибором «Теснота»: при высоте вьюпорта 420 px и ниже
     срабатывание гарантировано, а Android-клавиатура оставляет 300-420.
     Признак берём самый честный и единственный, который не гадает: клавиатура поднимается
     ТОЛЬКО при фокусе в поле ввода. Пока фокус там — держим последнюю спокойную высоту:
     геометрия мира не пересчитывается, полёт не встаёт, окно тесноты не показывается.
     Настоящая теснота (узко по ШИРИНЕ, сплит-скрин, ужатое окно на десктопе) ловится как
     прежде — ширину клавиатура не трогает. Страж 131. */
  const ae = document.activeElement;
  const kbd = !!(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.isContentEditable));
  if (!kbd || cssH > stableH) stableH = cssH;   // спокойная высота запоминается, пока клавиатуры нет
  const cssHu = kbd ? Math.max(cssH, stableH) : cssH;
  /* v1.99.0 «Метр неба»: мир меряем эталоном (390×844), а не сырыми пикселями.
     Мерка — по меньшей из двух сторон: небо никогда не уже 390 (поле не гуще эталона)
     и не ниже 844 (окно реакции не короче эталона). Большой экран — просто больше
     неба по бокам; скорости, размеры и ритм уклонения везде эталонные, один в один. */
  const nextSC = Math.min(cssW/390, cssHu/844);
  const nextDpr = Math.min(window.devicePixelRatio||1, dprCap);
  const nextW = Math.round(cssW/nextSC);
  const nextH = Math.round(cssHu/nextSC);
  const nextLongest = Math.max(cssW, cssH) * nextDpr;
  let finalDpr = nextDpr;
  if (nextLongest > capPx) finalDpr *= capPx / nextLongest;
  const nextCanvasW = Math.round(cssW*finalDpr);
  const nextCanvasH = Math.round(cssH*finalDpr);
  const sameSize = W===nextW && H===nextH && DPR===finalDpr && SC===nextSC && canvas.width===nextCanvasW && canvas.height===nextCanvasH && canvas.style.width===cssW+'px' && canvas.style.height===cssH+'px';
  if (sameSize) return; // прежняя геометрия уже ровно такая же — без повторного пересоздания холста.
  DPR = finalDpr;
  SC = nextSC;
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
  if (tnEl && tnEl.classList && typeof tnEl.classList.toggle==='function'){
    tnEl.classList.toggle('hidden', !tooNarrow);
    /* 13.08.2026: под одним окном живут ДВЕ разные беды, и совет у них противоположный.
       Настоящий виновник виден в самой формуле выше: SC = min(cssW/390, cssH/844). У телефона
       набок урезает второе слагаемое — не хватает ВЫСОТЫ, а не ширины. Просить «поверните
       экран» человека, который только что повернул, — это отправить его туда, откуда беда. */
    tooNarrowText(cssW > cssH);
  }
  W = Math.round(cssW/SC);
  H = Math.round(cssH/SC);
  /* v1.99.1 «Потолок листа»: лист не шире capPx по длинной стороне. На экранах-монстрах
     (4K-телевизор с двойной чёткостью = 7680×4320 точек, ~130 МБ памяти на один лист)
     ужимаем чёткость листа, а не мир: телевизор сам мягко растянет картинку, с дивана
     глаз не различит. На телефонах и ноутбуках страховка молчит всю жизнь. */
  const capLongest = Math.max(cssW, cssH) * DPR;
  if (capLongest > capPx) DPR = Math.max(1, DPR * capPx / capLongest);
  canvas.width = Math.round(cssW*DPR); canvas.height = Math.round(cssH*DPR); // настоящих пикселей ровно столько же, сколько было (лишь не шире потолка)
  canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
  ctx.setTransform(DPR*SC,0,0,DPR*SC,0,0); // меры неба → пиксели экрана одним поворотом линейки
  if (typeof drawKick==='function') drawKick(); // v1.66.2: спящая пауза/меню — свежий кадр сразу после пересчёта
  if (typeof corridorEdgesGeometry==='function') corridorEdgesGeometry(); // v1.415.2: рамка коридора — геометрия из core.js, видимость из render.js
  requestAnimationFrame(syncScoreHudGap); // 23.08.2026: ширина окна меняет размер шрифта счёта (vw) — та же перепроверка зазора, что и при смене --sat
  if (vhGap && typeof BEACON!=='undefined'){
    // 02.09.2026 (владелец вживую, iPhone 16): гипотеза «Telegram занижает viewportStableHeight»
    // подтвердить без реального устройства нельзя — сигнал даст точные цифры с настоящего
    // телефона. Снимок — вторым кадром (requestAnimationFrame), не сразу: drawKick() только
    // ПРОСИТ перерисовку, красит канвас браузер по своему расписанию — снимок раньше времени
    // поймал бы ещё старый/пустой кадр.
    const gap=vhGap;
    requestAnimationFrame(()=>{ if(typeof BEACON!=='undefined' && BEACON.signalShot) BEACON.signalShot('vh_underreport', gap+'px'); });
  }
}
/* 22.08.2026 «Рамка коридора без мигания»: жалоба владельца — в Telegram линии коридора
   (тогда ещё рисовались внутри canvas) мелькали и пропадали. Причина — window.innerWidth в
   первые кадры после запуска в Telegram WebView часто врёт, устаканивается через 1-2 события
   resize уже после того, как страница успела отрисоваться на неверном значении. В браузере
   такого скачка нет — там держалось ровно. Лекарство — не мгновенно показывать рамку по
   первому же «экран широкий», а подождать короткую паузу стабильности; скрывать, наоборот,
   можно сразу — ложноположительное появление хуже, чем on-tick задержка перед первым показом. */
let corrWideT=0, corrWideOk=false;
function corridorEdgesGeometry(){
  if (typeof fieldL!=='function' || typeof fieldW!=='function') return; // game.js мог ещё не загрузиться
  const fl=fieldL(), fw=fieldW();
  const wide = fl>0;
  if (!wide){ corrWideOk=false; if(corrWideT) clearTimeout(corrWideT); corrWideT=0; }
  else if (!corrWideOk && !corrWideT){
    corrWideT=setTimeout(()=>{ corrWideT=0; corrWideOk=true; if(typeof corridorEdgesSync==='function') corridorEdgesSync(); }, 400);
  }
  const l=document.getElementById('corrEdgeL'), r=document.getElementById('corrEdgeR');
  if (l && r){
    const leftPx=Math.round(fl*SC-13), rightPx=Math.round((fl+fw)*SC-13); // половина ширины .corrEdge (26px)
    l.style.left=leftPx+'px'; r.style.left=rightPx+'px';
  }
  if (!wide && typeof corridorEdgesSync==='function') corridorEdgesSync(); // скрытие — сразу, без ожидания таймера
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
    canvasContextLost=true;
    if (typeof S!=='undefined' && S && S.running && !S.paused && typeof pauseGame==='function') pauseGame();
  });
  canvas.addEventListener('contextrestored', ()=>{
    canvasContextLost=false;
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
/* v1.477.27 «Погружение навсегда»: раньше tgImmersion(true) звался только из startGame() —
   полный экран, замок поворота и защита от свайпа-закрытия жили ровно на время забега и
   гасли в меню (tgImmersion(false) при выходе). Владелец явно попросил держать все три
   постоянно, включая меню. requestFullscreen обычно требует жеста игрока — на голой
   загрузке страницы он может не сработать; events ниже (fullscreenChanged/fullscreenFailed)
   уже подписаны выше и разберутся с ответом Telegram как обычно, а первый тап где угодно
   (не только во время полёта — см. tgImmKick в ui.js) даёт жест и повторяет попытку. */
if (typeof tgImmersion==='function') tgImmersion(true);
if (document.body) tgInsetsSync(); else window.addEventListener('DOMContentLoaded', tgInsetsSync); // первый замер подушки (v1.59.0)
gfxCap(); resize();
