'use strict';
/* ============================================================
   «ПОЛЁТ БЕЗ РУК» (v1.16.0 «Интуиция», переосмыслено 12.09.2026) —
   единственный урок игры. Школа и учебный полёт вычеркнуты: бонус и
   опасность интуитивны, игрок сразу летит. Наклон — единственное,
   чему нужен свой момент.
   12.09.2026 (владелец, живая жалоба — «постоянно упирается в это
   сообщение», «резко и случайно вылазит»): раньше (v1.16.0-v1.284.20)
   оффер сам ставил игру на паузу ПОСЕРЕДИНЕ полёта, как только
   набегало 120 накопленных секунд — момент был случайным для игрока,
   не его выбором. Теперь — ОДИН шанс увидеть предложение, на экране
   итогов, сразу после первого в жизни аккаунта приземления, что бы
   это ни было. Показан — не показывается больше никогда, независимо
   от исхода (согласился/отказался/не успел откалиброваться). Мир в
   полёте больше никогда не замирает сам. Дверь в Настройках открыта
   всегда, это по-прежнему единственное место, где разговор
   возобновляется по воле игрока. Золотая секунда (самолёт впервые
   послушался наклона) — гордость + голос один раз за жизнь аккаунта,
   не тронута этим заходом. Десктоп без датчика оффер не видит.
   Макет: .knowledge/macets/gyro-offer-na-itogah-12-09-2026.html.
   ============================================================ */
const GYRO = { goldFired:false };

function gyroSensorThere(){ // оффер только там, где наклон реален
  // v1.108.1: iOS — разрешение только по тапу, заранее проверить нечем, доверяем API как и раньше;
  // мобильный Telegram (Android) — датчик почти гарантирован; всё остальное (ноутбук, ТВ, десктоп,
  // веб без подтверждённой мобильности) — только по настоящим данным, не по факту существования API.
  if (typeof NEEDS_TILT_PERMISSION!=='undefined' && NEEDS_TILT_PERMISSION) return HAS_GYRO;
  if (typeof IS_LIKELY_MOBILE!=='undefined' && IS_LIKELY_MOBILE) return HAS_GYRO;
  return HAS_GYRO && (typeof realGyroSeen!=='undefined' && realGyroSeen);
}
/* 12.09.2026 «Оффер на итогах»: показывается РОВНО ОДИН РАЗ в жизни аккаунта — сразу
   после первого приземления, что бы это ни было. Store.gyroOverOffered=1 ставится в
   gyroOverOfferShow() СРАЗУ, до любого исхода — значит даже если игрок ничего не нажмёт
   и просто уйдёт с экрана итогов, повторно это не всплывёт. Дверь в Настройках, как и
   раньше, открыта всегда — это по-прежнему единственное место, где разговор
   возобновляется по воле игрока (та же строка ниже, не переписана). */
function gyroOverOfferDue(){
  if (typeof gyroRul==='function' && !gyroRul()) return false;
  if (gyroUnlocked() || !gyroSensorThere()) return false;
  return !Store.get('gyroOverOffered',0);
}
function gyroOverOfferShow(){
  Store.set('gyroOverOffered',1); // один шанс — независимо от исхода, см. шапку файла
  const wrap=$('gyroOfferWrap'); if (!wrap) return;
  const hint=$('gyroOfferHint'); if (hint) hint.textContent=L.gyroOverHint||'';
  const btn=$('gyroOfferBtn'); if (btn){ btn.textContent=L.gyroOverBtn||''; btn.classList.remove('hidden'); btn.disabled=false; }
  const wait=$('gyroOfferWait'); if (wait) wait.classList.add('hidden');
  const ok=$('gyroOfferOk'); if (ok) ok.classList.add('hidden');
  wrap.classList.remove('hidden','gone');
}

/* v1.282.13 (сохранено): часовой калибровки живёт в переменной модуля — иначе его нечем
   погасить, если экран итогов сменится раньше, чем откалибруется датчик. */
let gyroBeatIv=0;
function gyroBeatStop(){ if(gyroBeatIv){ clearInterval(gyroBeatIv); gyroBeatIv=0; } }
function gyroOverDone(success){ // калибровка кончилась так или иначе — сворачиваем блок насовсем
  gyroBeatStop();
  const wait=$('gyroOfferWait'); if (wait) wait.classList.add('hidden');
  if (success){
    Store.set('gyroUnlocked',1); // замок открывается ровно в свой момент — «Полёт без рук»
    if(typeof BB!=='undefined') BB.log('lock','gyro unlocked (over-screen offer)');
    const ok=$('gyroOfferOk'); if (ok){ ok.textContent=L.gyroOverOk||''; ok.classList.remove('hidden'); }
    setTimeout(()=>{ const wrap=$('gyroOfferWrap'); if (wrap) wrap.classList.add('gone'); }, 1400);
  } else {
    const wrap=$('gyroOfferWrap'); if (wrap) wrap.classList.add('gone'); // тихая неудача/отказ — без упрёка, палец всегда работает
  }
}
async function gyroOverUnlock(){ // тап по «Разблокировать гироскоп» на итогах
  audio(); sfx.click(); haptic('light');
  const btn=$('gyroOfferBtn'); if (btn) btn.classList.add('hidden');
  const hint=$('gyroOfferHint'); if (hint) hint.classList.add('hidden');
  if (NEEDS_TILT_PERMISSION){ // iOS: системный диалог — строго по этому тапу
    let r='';
    try{ r=await DeviceOrientationEvent.requestPermission(); }catch(e){ r=''; }
    if (r!=='granted'){ gyroOverDone(false); return; } // отказ и техническая неудача здесь — один и тот же честный исход: молча работаем пальцем дальше
  }
  if (typeof gyroKick==='function') gyroKick(); // будим мост Telegram (идемпотентно)
  calReset(false,undefined,'gyro-unlock'); // свежий стабильный ноль под спокойную позу
  const wait=$('gyroOfferWait'); if (wait){ wait.textContent=L.calWait||''; wait.classList.remove('hidden'); }
  const t0=performance.now();
  gyroBeatStop();
  gyroBeatIv=setInterval(()=>{
    if (input.baseG!=null){ gyroBeatStop(); gyroOverDone(true); }
    else if (performance.now()-t0>7000){ gyroBeatStop(); gyroOverDone(false); } // датчик молчит — не держим заложников
  },100);
}

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

/* Вызывается из update() каждый кадр: страж нуля, страж шторма, золотая секунда.
   12.09.2026: оффер «Полёт без рук» отсюда убран — живёт на экране итогов
   (gameOver()/mapOver() зовут gyroOverOfferDue()/gyroOverOfferShow()), мир в полёте
   больше никогда не замирает сам. */
function gyroUpdate(dt){
  gyroZeroGuard(dt); // v1.99.5 «Свежий ноль»
  gyroStormGuard(dt); // v1.99.8 «Тихий штурман»
  if (!GYRO.goldFired && !Store.get('gyroGold',0) && gyroUnlocked() && input.useGyro && Math.abs(input.tiltX)>0.15){
    GYRO.goldFired=true; Store.set('gyroGold',1); // золотая секунда: впервые послушался наклона
    haptic('success'); // золотая секунда: праздник рисует свет, не текст (v1.27.0)
    S.flash=Math.max(S.flash,.35); burst(plane.x,plane.y,'#fff0a8',22); // свет вместо голоса (v1.20.0)
    if (typeof achCheck==='function') achCheck(); // «Пилот» — проверка сразу
  }
}

(function(){ // кнопка оффера на итогах — DOM уже готов (скрипты в конце body)
  const b=$('gyroOfferBtn'); if (b) b.addEventListener('click', gyroOverUnlock);
})();
