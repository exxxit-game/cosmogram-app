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
    try{ if(typeof diagReport==='function') Ln.push(diagReport()); }catch(e){}
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
