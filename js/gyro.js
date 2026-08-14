'use strict';
/* ============================================================
   «ПОЛЁТ БЕЗ РУК» (v1.16.0 «Интуиция») — единственный урок игры.
   Школа и учебный полёт вычеркнуты: бонус и опасность интуитивны,
   игрок сразу летит. Наклон — единственное, чему нужен свой момент:
   после 2 минут накопленной игры (Store playSec) мир мягко замирает
   («Склейка») и прямо в полёте вплывает оффер. Согласие — разрешение
   iOS по тапу + спокойная калибровка нуля, полёт продолжается уже на
   гироскопе. Отказ — вежливо вернёмся через 4 минуты игры. Золотая
   секунда (самолёт впервые послушался наклона) — гордость + голос
   один раз за жизнь аккаунта. Десктоп без датчика оффер не видит.
   ============================================================ */
const GOFFER_SEC = 120;    // первое предложение — после двух минут неба
const GOFFER_SNOOZE = 240; // «остаюсь на пальце» — вернёмся через четыре минуты игры
const GOFFER_MAX_DECLINES = 3; // v1.108.1 «Утром привет, потом не мешает»: раньше оффер повторялся
  // бесконечно каждые 4 минуты без права сказать «больше не спрашивай» — единственное место в игре,
  // где не уважался явный выбор игрока. После трёх отказов подряд игра перестаёт спрашивать сама;
  // включить «Полёт без рук» вручную можно в Настройках всегда, эта дверь никогда не закрывается.
const GYRO = { live:false, goldFired:false };

let gyroAccSec = 0; // секундомер живой игры: тикает в update, переживает сессии в Store
let playSecPending = 0; // v1.66.1: секунды копим в памяти — каждый Store.set пишет ВСЁ хранилище + зовёт облачный мост
function gyroPlaySecTick(dt){
  gyroAccSec += dt;
  if (gyroAccSec>=1){ gyroAccSec-=1; playSecPending++; if (playSecPending>=15) playSecFlush(); } // пачка по 15 секунд
}
function playSecFlush(){ // сброс накопленного: из update пачкой, из gameOver/onHidden — принудительно
  if (!playSecPending) return;
  Store.set('playSec', Store.get('playSec',0)+playSecPending); playSecPending=0;
}

function gyroSensorThere(){ // оффер только там, где наклон реален
  // v1.108.1: iOS — разрешение только по тапу, заранее проверить нечем, доверяем API как и раньше;
  // мобильный Telegram (Android) — датчик почти гарантирован; всё остальное (ноутбук, ТВ, десктоп,
  // веб без подтверждённой мобильности) — только по настоящим данным, не по факту существования API.
  if (typeof NEEDS_TILT_PERMISSION!=='undefined' && NEEDS_TILT_PERMISSION) return HAS_GYRO;
  if (typeof IS_LIKELY_MOBILE!=='undefined' && IS_LIKELY_MOBILE) return HAS_GYRO;
  return HAS_GYRO && (typeof realGyroSeen!=='undefined' && realGyroSeen);
}
function gyroOfferDue(){
  if (GYRO.live || gyroUnlocked() || !gyroSensorThere()) return false;
  if (!S.running || S.paused || S.dying || S.bullet) return false;
  if (Store.get('gyroDeclines',0) >= GOFFER_MAX_DECLINES) return false; // v1.108.1: наспрашивались — тишина, дверь в Настройках открыта всегда
  return Store.get('playSec',0) >= (Store.get('gyroSnooze',0) || GOFFER_SEC);
}

function gyroOfferShow(){
  GYRO.live=true;
  S.pausing=1; grantGrace(.6); // «Склейка»: мир мягко замирает под оффером, не срезом — v1.108.1: через общий лимит
  const gb=$('tutGyroBtn'); if (gb){ gb.disabled=false; gb.textContent=L.tutGyroBtn; }
  const tb=$('tutTouchBtn'); if (tb) tb.textContent=L.tutTouchBtn;
  /* v1.284.3: блок объяснения не заполнялся ВООБЩЕ — оверлей вставал посреди полёта с двумя
     кнопками и без единого слова о том, что предлагают. Ключа под этот текст не было ни в
     одном из пяти словарей. Единственное, что сюда когда-либо писалось, — «Держи телефон
     ровно…» уже ПОСЛЕ согласия (строка ниже по файлу), то есть при повторном показе игрок
     видел ответ на вопрос, которого ему не задали. Страж 124. */
  const bd=$('tutBeatB'); if (bd) bd.textContent=(L&&L.tutGyroBody)||'';
  $('tutBeat').classList.remove('hidden');
  haptic('light');
}

/* v1.282.13: часовой калибровки живёт в переменной модуля, а не только в замыкании —
   иначе его нечем погасить. Прежде игрок жал «остаюсь на пальце», оффер закрывался,
   а через секунду датчик всё же калибровался, интервал доживал свой век и звал
   gyroAct2(true): гироскоп разблокировался ВОПРЕКИ отказу, а заодно снимал паузу и
   выдавал благодать — в произвольном состоянии экрана, куда игрок успел уйти. */
let gyroBeatIv=0;
function gyroBeatStop(){ if(gyroBeatIv){ clearInterval(gyroBeatIv); gyroBeatIv=0; } }
function gyroAct2(ok){ // выбор сделан — полёт продолжается с того же места
  gyroBeatStop(); // выбор сделан — часовой больше не нужен, чей бы ни был выбор
  GYRO.live=false;
  $('tutBeat').classList.add('hidden');
  S.paused=false; S.pausing=0; grantGrace(.35); // «Склейка»: плавный разгон — v1.108.1: через общий лимит
  if (ok){
    Store.set('gyroUnlocked',1); // замок открывается ровно в свой момент — «Полёт без рук»
    if(typeof BB!=='undefined') BB.log('lock','gyro unlocked'); // v1.99.7 «Чёрный ящик»
  } else {
    Store.set('gyroSnooze', Store.get('playSec',0)+GOFFER_SNOOZE); // вежливо отстанем на четыре минуты игры
  }
}
function gyroBeatTouch(){ sfx.click(); gyroDecline(); gyroAct2(false); }
/* v1.282.13: отказ игрока и неудача железа — разные вещи, и считать надо только первый.
   Прежде gyroBeatFail() шёл через тот же gyroAct2(false), который увеличивал счётчик
   отказов. Три попытки, где датчик не успел откалиброваться за 7 секунд, навсегда
   затыкали предложение «Полёт без рук» — хотя игрок трижды отвечал «да, хочу». Бил
   этот механизм ровно по той аудитории, у которой мост Telegram болен, то есть по тем,
   кому починка гироскопа нужнее всех. */
function gyroDecline(){ Store.set('gyroDeclines', Store.get('gyroDeclines',0)+1); }
async function gyroBeatGyro(){
  audio(); sfx.click();
  const gb=$('tutGyroBtn'); if (gb) gb.disabled=true;
  if (NEEDS_TILT_PERMISSION){ // iOS: системный диалог — строго по этому тапу
    let r='';
    try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    /* v1.282.14: «Don't Allow» в системном диалоге — это осознанный отказ игрока, и
       считать его надо. Прошлая редакция разделила отказ и техническую неудачу, но
       забыла, что этот путь — первое, а не второе: iOS запоминает denied и отвечает
       мгновенно, поэтому оффер всплывал бы каждые четыре минуты игры ВЕЧНО, каждый раз
       со своей паузой. Лимит отказов должен наступать. */
    if (r==='denied'){ gyroDecline(); gyroAct2(false); return; }
    if (r!=='granted'){ gyroBeatFail(); return; }
    if (!GYRO.live) return; // v1.282.14: пока ждали ответа диалога, игрок мог выбрать «остаюсь на пальце» — не сбрасываем ему калибровку
  }
  if (typeof gyroKick==='function') gyroKick(); // будим мост Telegram (идемпотентно)
  calReset(false,undefined,'gyro-unlock'); // свежий стабильный ноль под спокойную позу
  $('tutBeatB').textContent=L.calWait; // «Держи телефон ровно…»
  const t0=performance.now();
  gyroBeatStop();
  gyroBeatIv=setInterval(()=>{
    if (!GYRO.live){ gyroBeatStop(); return; } // оффер уже закрыт другим путём — молча уходим
    if (input.baseG!=null){ gyroBeatStop(); gyroAct2(true); }
    else if (performance.now()-t0>7000){ gyroBeatStop(); gyroBeatFail(); } // датчик молчит — не держим заложников
  },100);
}
function gyroBeatFail(){ gyroAct2(false); } // fallback: палец всегда работает — молча, без упрёка (v1.27.0); v1.282.13: техническая неудача НЕ считается отказом игрока

/* Золотая секунда — без голоса (v1.20.0): праздник рисует свет, не диктор */

/* Страж залипшего нуля (v1.99.5 «Свежий ноль»): руль прижат к упору секундами —
   это не поза пилота, это неверный ноль (перекос кадров каналов, скачок remap осей).
   Снимаем его сами: свежая калибровка переловит позу за доли секунды,
   тост «Откалибровано» сам расскажет, что случилось. Честный наклон — не трогаем. */
/* v1.99.8 «Тихий штурман»: штормящий штурман сдаёт штурвал тихому. Шторм —
   разброс сигнала >80° за 2с (быстрее любой руки: руль в полном размахе даёт
   лишь ~48°), тишь — <40°. Буря на ОБОИХ каналах — настоящие кульбиты
   телефона: никому не отдаём, буря физическая, не канальная. Калибровку
   при передаче сбрасывает сам gyroChanIn. Живая регрессия: поза β~80° у
   сингулярности Эйлера гнала веб-канал в бред (нули 89° → −84° за 8 секунд),
   а мост в те же секунды был тих — но арбитраж видел «молчит/замёрз», не «бредит».
   v1.102.2 «Два компаса»: тишина без ДЫХАНИЯ — не тишина. Живая регрессия с чёрного
   ящика: мост вечно трещал замороженным γ0° β1° («телефон лежит») — ровным голосом
   врал, где низ; шторм веба отдавал ему штурвал, ноль принимался из фантазии,
   руль залипал, «Верная рука» спасала с тостом — 5 кругов за полёт. */
let stormT=0, stormNote=false;
function gyroStormGuard(dt){
  const cur=steerChan;
  if(cur==='none'){ stormT=0; return; }
  const sp=chanSpread(cur);
  if(sp<0) return; // окно не набрано — судить рано
  if(sp>STORM_SPREAD){
    stormT+=dt;
    const other=(cur==='tg')?'web':'tg', osp=chanSpread(other);
    if(stormT>1.5 && osp>=0 && osp<CALM_SPREAD && chanAlive(other) && !chanLiar(other)){ // v1.102.2: тихий, но не дышащий — лжец; v1.104.0: и осуждённый дрожащий — тоже, ему штурвал не отдаём
      if(typeof BB!=='undefined') BB.log('storm',cur+' spread '+Math.round(sp)+' → yield '+other+' '+Math.round(osp));
      gyroChanIn(other); stormT=0; stormNote=false;
    } else if(stormT>1.5 && !stormNote){ stormNote=true;
      if(typeof BB!=='undefined') BB.log('storm',cur+' spread '+Math.round(sp)+' · тихого нет'); }
  } else { stormT=0; stormNote=false; }
}
/* v1.100.4 «Верная рука»: страж смотрит на РУКУ, а не только на руль.
   Руль в упоре, а рука спокойна (крен ≤20°) — это не поза пилота, это ноль
   врёт: перепривязываем ноль к руке мгновенно — без 2.5с залипания и без
   рулетки перекалибровки (живая лента: рулетка принимала рулевую позу −66/84
   за нейтраль посреди спидрана). Руль в упоре при выкрученной руке — либо
   пилот честно рулит (отпустит — страж молчит; живая лента: здоровый ноль
   6/83 погиб от ложной тревоги за честный крен), либо борется с залипом
   (держит >6с — старый сброс, страховка исходной болезни v1.99.5). */
let zeroStuck=0;
function gyroZeroGuard(dt){
  if(!(input.useGyro && input.baseG!=null && (Math.abs(input.tiltX)>.95 || Math.abs(input.tiltY)>.95))){ zeroStuck=0; return; }
  zeroStuck+=dt;
  if(zeroStuck>0.8 && poseSG!=null && Math.abs(poseSG)<=20){ // рука спокойна — ноль врёт: к руке, мгновенно
    zeroStuck=0;
    if(typeof BB!=='undefined') BB.log('guard','reanchor: упор при спокойной руке → ноль к руке '+Math.round(poseSG)+'/'+Math.round(poseSB));
    input.baseG=poseSG; input.baseB=poseSB;
    haptic('light'); svcToast(L.calibrated,'rgba(143,255,159,.5)'); // v1.103.0: в полёте молчит (самописец пишет), в ангаре звучит
    return;
  }
  if(zeroStuck>6){ zeroStuck=0; // борьба дольше 6с — ноль залип по-настоящему: старый путь
    if(typeof BB!=='undefined') BB.log('guard','stuck zero '+(input.baseG==null?'?':Math.round(input.baseG))+'° tx '+input.tiltX.toFixed(2)+' → reset'); // v1.99.7 «Чёрный ящик»
    calReset(true,true,'stuck-zero'); } // v1.100.3 «Тихий ноль»: после залипшего нуля пьём только из настоящей тишины
}

/* Вызывается из update() каждый кадр: секундомер, золотая секунда, оффер */
function gyroUpdate(dt){
  if (!GYRO.live) gyroPlaySecTick(dt);
  gyroZeroGuard(dt); // v1.99.5 «Свежий ноль»
  gyroStormGuard(dt); // v1.99.8 «Тихий штурман»
  if (!GYRO.goldFired && !Store.get('gyroGold',0) && gyroUnlocked() && input.useGyro && Math.abs(input.tiltX)>0.15){
    GYRO.goldFired=true; Store.set('gyroGold',1); // золотая секунда: впервые послушался наклона
    haptic('success'); // золотая секунда: праздник рисует свет, не текст (v1.27.0)
    S.flash=Math.max(S.flash,.35); burst(plane.x,plane.y,'#fff0a8',22); // свет вместо голоса (v1.20.0)
    if (typeof achCheck==='function') achCheck(); // «Пилот» — проверка сразу
  }
  if (gyroOfferDue()) gyroOfferShow();
}

(function(){ // кнопки оффера — DOM уже готов (скрипты в конце body)
  const g=$('tutGyroBtn'), t=$('tutTouchBtn');
  if (g) g.addEventListener('click', gyroBeatGyro);
  if (t) t.addEventListener('click', gyroBeatTouch);
})();
