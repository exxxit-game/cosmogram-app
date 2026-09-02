/* v1.99.7 «Чёрный ящик» — бортовой самописец.
   У авиации честный порядок: когда что-то идёт не так, никто не гадает —
   вскрывают ящик и читают ленту. Теперь и у нас: игра записывает события
   (борт, канал датчика, ноль, страж, штурвал, взлёты, ошибки) в кольцевую
   ленту, лента переживает перезагрузку (последние 120 событий — в хранилище),
   а в сервисном центре кнопка «Скопировать самописец» отдаёт всю картину
   разом: паспорт борта + вердикт цепи руля + лента с метками времени.
   Ядро не трогаем: модуль только слушает крючки-однострочники в других
   файлах; без них лента просто короче — игра цела. */
const BB=(()=>{
  const MAX=180, SAVE=120; // кольцо в памяти / сколько переживает перезагрузку
  let tape=[], dirty=false;
  const t0=performance.now();
  /* v1.282.20: лента читается через санацию. Битое значение (строка вместо массива)
     проходило проверку old.length, tape становился строкой, и первый же tape.push бросал
     TypeError ВНУТРИ инициализатора const BB — после чего привязка BB навсегда оставалась
     в мёртвой зоне, и каждое typeof BB!=='undefined' в проекте бросало ReferenceError
     вместо 'undefined'. Игра не взлетала вовсе. Ключ пишется каждые 4 секунды и легко
     бьётся при скосе версий. */
  try{ const old=(typeof saneArray==='function')?saneArray(Store.get('bbTape',[]),[]):[];
    tape=old.filter(x=>x&&typeof x==='object').slice(-SAVE); }catch(e){ tape=[]; }
  function stamp(){ const s=(performance.now()-t0)/1000;
    return '+'+(s<100?(s<10?'00':'0'):'')+s.toFixed(1)+'s'; }
  function log(ev,d){
    tape.push({t:stamp(), ev:String(ev).slice(0,12), d:String(d==null?'':d).slice(0,80)});
    while(tape.length>MAX) tape.shift();
    dirty=true;
  }
  function flush(){ if(!dirty) return; dirty=false;
    try{ Store.set('bbTape', tape.slice(-SAVE)); }catch(e){} }
  setInterval(flush, 4000); // бережём хранилище: пишем пачкой, не на каждый вздох
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) flush(); });
  // ошибки — самое ценное на ленте: пишем сами, без крючков в чужом коде
  window.addEventListener('error', e=>{ if(e&&e.message) log('error', String(e.message).slice(0,60)); });
  window.addEventListener('unhandledrejection', e=>log('error', 'promise: '+String(e&&e.reason).slice(0,50)));
  function text(){
    const Ln=['Cosmogram v'+GAME_VERSION+' blackbox · '+tape.length+' events'];
    try{ Ln.push('verdict: '+bbVerdict()); }catch(e){}
    try{ Ln.push('audio: '+audioVerdict()); }catch(e){}
    try{ if(typeof diagReport==='function') Ln.push(diagReport()); }catch(e){}
    // 27.08.2026: паспорт слабого борта (BEACON.deviceProfileProbe) — та же строка, что летит
    // телеметрией, но здесь видна сразу на экране, без ожидания письма на почту неба.
    try{ if(typeof BEACON!=='undefined' && BEACON.profileText && BEACON.profileText()) Ln.push('device: '+BEACON.profileText()); }catch(e){}
    /* 02.09.2026 (владелец, вживую — «эти данные так же будут в диагностике? их можно
       скопировать с телефона?»): паспорт окружения и полёта раньше видел только сервер,
       когда письмо реально долетало. Тот же приём, что и у паспорта слабого борта строкой
       выше — видно сразу на экране, без ожидания письма на почту неба. */
    try{ if(typeof BEACON!=='undefined' && BEACON.envCtx) Ln.push('env: '+BEACON.envCtx()); }catch(e){}
    try{ if(typeof BEACON!=='undefined' && BEACON.flightCtx && BEACON.flightCtx()) Ln.push('flight: '+BEACON.flightCtx()); }catch(e){}
    Ln.push('--- tape ---');
    for(const e of tape) Ln.push('['+e.t+'] '+e.ev+(e.d?': '+e.d:''));
    return Ln.join('\n');
  }
  // Строка борта: версия, платформа, экран — паспорт этого сеанса
  log('boot', 'v'+GAME_VERSION+' '+((typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?')+
    ' '+window.innerWidth+'x'+window.innerHeight+' dpr'+(window.devicePixelRatio||1));
  return { log, text, flush, count:()=>tape.length, _tape:()=>tape };
})();

/* Вердикт цепи руля — первое сломанное звено, сверху вниз:
   датчик есть? замок открыт? пакеты текут? канал выбран? ноль принят?
   ноль совпадает с позой? пакеты свежие? Отвечает одной фразой —
   её видит и человек в сервисном центре, и мы на присланной ленте. */
function bbVerdict(){
  try{
    if(!HAS_GYRO) return L.bbVNoSensor;
    if(!gyroUnlocked()) return L.bbVLock;
    const tp=(typeof tgPkt==='number'?tgPkt:0), wp=(typeof webPkt==='number'?webPkt:0);
    if(!tp && !wp) return L.bbVSilent; // не текло вообще ни разу
    if(typeof steerChan!=='undefined' && steerChan==='none') return L.bbVNoChan;
    if(typeof chanLiar==='function' && typeof steerChan!=='undefined' && steerChan!=='none' && chanLiar(steerChan))
      return L.bbVLiar;
    // v1.282.4: tp/wp — счётчики ПОЖИЗНЕННЫЕ, никогда не обнуляются. Канал, что честно
    // тёк в начале сеанса и замолчал посреди него (отозвано разрешение, фон убил датчик),
    // проходил проверку выше как «не молчал никогда» и вердикт полз дальше по цепи на
    // ЗАСТЫВШИХ данных. chanSilent() уже существует и уже верно определяет живость канала
    // для самого рулевого арбитража (input.js) — вердикт им просто не пользовался.
    if(typeof chanSilent==='function' && typeof steerChan!=='undefined' && steerChan!=='none' && chanSilent(steerChan))
      return L.bbVSilent+' (умолк)';
    if(typeof chanSpread==='function' && chanSpread(steerChan)>80) return L.bbVStorm; // v1.99.8 «Тихий штурман»
    if(input.baseG==null) return L.bbVNoZero;
    const zm=(lastGamma!=null && typeof remapAxes==='function') ? remapAxes(lastGamma, lastBeta==null?0:lastBeta) : null;
    if(zm && Math.abs(zm[0]-input.baseG)>25) return L.bbVSkew+' '+Math.round(input.baseG)+'° → '+Math.round(zm[0])+'°';
    if(!input.useGyro) return L.bbVStale;
    return L.bbVOk;
  }catch(e){ return 'n/a'; }
}

/* 22.08.2026 «Тот же приём, что и у руля» — вердикт звуковой цепи.
   Первое сломанное звено, сверху вниз: звук выключен? музыка выключена?
   контекст создан? не закрыт браузером? не спит? время в контексте реально
   идёт (не тихая заморозка после фона — WebKit-баг, AUDIO-SYSTEM.md §4.1)?
   тема выбрана? Как и у руля — одна фраза, без гадания по обрывкам. */
function audioVerdict(){
  try{
    if(typeof MUTED!=='undefined' && MUTED) return L.audioVMuted;
    if(typeof MUSIC_ON!=='undefined' && !MUSIC_ON) return L.audioVOff;
    if(typeof AC==='undefined' || !AC) return L.audioVNoCtx;
    if(AC.state==='closed') return L.audioVClosed;
    if(AC.state==='suspended' || AC.state==='interrupted') return L.audioVSuspended+' ('+AC.state+')';
    if(typeof acStalled!=='undefined' && acStalled) return L.audioVStalled;
    if(typeof music==='undefined' || !music._theme()) return L.audioVNoTheme;
    // 31.08.2026 (владелец: «цепь цела, а музыка не играет — вечные проблемы»): всё выше —
    // только состояния (тема выбрана? контекст жив?), реальную громкость шины никто не
    // смотрел. Гейн мог застрять у нуля (недокрученный дак/кик, см. music.js:257-263 —
    // похожий баг там уже ловили раньше) — вердикт всё равно рапортовал «ОК». Порог 0.05
    // заметно ниже любого НАМЕРЕННОГО тихого состояния (дак держит .3 от цели, кик — .32) —
    // ловит только настоящее залипание, не обычное приглушение на паузе/ударе.
    if(typeof music._gain==='function'){ const g=music._gain(); if(g!=null && g<0.05) return L.audioVQuiet; }
    return L.audioVOk;
  }catch(e){ return 'n/a'; }
}
