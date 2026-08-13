/* ============================================================
   ПОЧТА НЕБА (v1.107.0): ошибки прилетают сами — игрок не носит письма.
   Модуль: ловит падения борта (те же события, что пишет самописец),
   заворачивает открытку (паспорт + вердикт цепи руля + хвост ленты)
   и шлёт на свою дверку. Хартия: анонимно (случайная метка устройства,
   ни имени, ни id), минимум, честный выключатель в настройках —
   выкл значит молчание, даже очередь не копится.
   Офлайн: очередь по образцу syncFlush — долетит при следующей сети.
   Законы: дедуп (одна ошибка — одно письмо за сессию), сервер тормозит
   флуд сам; ядро получает по одной строке-вызову (сигналы-симптомы).
   ============================================================ */
const BEACON=(()=>{
  const URL='https://cwpijvgdrrvnvldhnmbj.supabase.co/functions/v1/cosmogram-beacon';
  const seen=new Set(); let flushing=false, calN=0, calStormed=false, calSources={};
  const sessStart=Date.now(); let errCount=0; // v1.108.1: слой 3 — открытка сессии считает от загрузки страницы

  function on(){ return Store.get('beaconOn',1)===1; }
  /* Печать лаборатории (v1.107.0, вынесена в core.js как isLabEnv() — v1.108.1):
     верстак молчит — письма только с настоящего неба. window.__labOpen=true снимает печать. */
  function sealed(){ return typeof isLabEnv==='function' && isLabEnv(); }
  function anon(){ let a=Store.get('beaconAnon',null);
    if(!a){ a=Math.random().toString(36).slice(2,10); Store.set('beaconAnon',a); } return a; }
  // v1.108.1 «Слой 2»: то, что уже постоянно живёт в памяти ради Адаптивного I.Q. и тира устройства —
  // ни одного нового измерения, просто читаем готовые значения в момент, когда и так уже плохо.
  function perfCtx(){
    try{
      const fps=(typeof Q!=='undefined'&&Q)?Math.round(Q.fps):'?';
      const lvl=(typeof Q!=='undefined'&&Q)?Q.level:'?';
      const tier=(typeof gfxTier==='function')?gfxTier():'?';
      return 'fps:'+fps+' lvl:'+lvl+' tier:'+tier;
    }catch(e){ return ''; }
  }
  function postcard(kind,msg){
    let verdict='', tail='';
    try{ verdict=bbVerdict(); }catch(e){}
    try{ tail=BB._tape().slice(-12).map(e=>'['+e.t+'] '+e.ev+(e.d?': '+e.d:'')).join('\n'); }catch(e){}
    let pf='?'; try{ pf=(typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?'; }catch(e){}
    return { v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'), pf:pf, kind:kind,
      msg:String(msg==null?'':msg).slice(0,300), verdict:verdict, tail:tail,
      ua:(navigator.userAgent||'').slice(0,200), anon:anon(), ts:Date.now() };
  }
  /* v1.282.13: отправка с поводком и честным чтением ответа.
     Было две беды. Первая: fetch без таймаута — если сервер завис (а не отказал),
     await не разрешался никогда, finally не отрабатывал, flushing оставался true
     до конца сессии, и почта неба молча умирала целиком.
     Вторая: сервер на задушенное антиспамом письмо отвечает 200 с {quiet:true} —
     клиент считал это доставкой, показывал «Экипаж уже знает» и ВЫБРАСЫВАЛ письмо,
     хотя в базе ничего не легло. Теперь quiet — это «не доставлено, попробуй позже». */
  const SEND_TIMEOUT=8000;
  async function send(pc){
    const ctl=(typeof AbortController==='function')?new AbortController():null;
    const t=ctl?setTimeout(()=>{ try{ctl.abort();}catch(e){} },SEND_TIMEOUT):0;
    try{
      const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(pc), keepalive:true, signal:ctl?ctl.signal:undefined});
      if(!r||!r.ok) return {ok:false};
      let body=null; try{ body=await r.json(); }catch(e){}
      if(body && body.quiet) return {ok:false, quiet:true}; // антиспам сервера: строки в базе нет — письмо ждёт
      return {ok:true};
    }catch(e){ return {ok:false}; }
    finally{ if(t) clearTimeout(t); }
  }
  /* Окошко «экипаж знает» — три ступени честности по свежести момента (v1.107.0, суд слов):
     в моменте — полное «Экипаж уже знает об ЭТОЙ ошибке»: человек только что видел сбой;
     минуты спустя (после заезда) — мягкое, без «этой»: «Борт заметил неполадку…» — не тычем
     в пустоту; часы и дни спустя — молчание: письмо долетело, а окошко лишь озадачит.
     Небо — тишина всегда (закон «Тихого нуля»): в полёте — в закладку с меткой времени. */
  function note(){
    if(typeof screenName!=='undefined' && screenName==='game'){ // небо тихо: закладка, метку не трогаем — свежесть от момента ошибки
      if(!Store.get('beaconNote',0)) Store.set('beaconNote',Date.now()); return; }
    const t=Store.get('beaconNote',0);
    if(typeof svcToast==='function'&&typeof L!=='undefined'){
      if(t===0){ if(L.beaconSent) svcToast(L.beaconSent,'rgba(159,232,255,.5)'); } // в моменте
      else if(Date.now()-t<6*3600*1000){ if(L.beaconNoteSoft) svcToast(L.beaconNoteSoft,'rgba(159,232,255,.5)'); } // минуты
      // дольше 6 часов — молчание: момент ушёл, письмо давно у экипажа
    }
    Store.set('beaconNote',0);
  }
  setInterval(()=>{ if(Store.get('beaconNote',0)>0) note(); },2000); // спрашиваем: небо отпустило?

  function queue(){ return saneArray(Store.get('beaconQ',[]),[]); } // v1.282.13: очередь читается через санацию, как syncQ в sync.js — битое значение (облако, скос версий) роняло flush прямо внутри async, и отказ уходил в unhandledrejection → drop → flush → круг
  async function flush(){ if(flushing||!on()||sealed()) return; // печать: с верстака не летит
    if(typeof navigator!=='undefined' && navigator.onLine===false) return; // v1.282.13: офлайн — не бьёмся в закрытую дверь, дождёмся события 'online'
    flushing=true;
    try{
      const q=queue().slice();          // снимок: drop во время отправки дописывает в живую очередь
      const sent=new Set();
      for(const pc of q){
        let res={ok:false};
        try{ res=await send(pc); }catch(e){}
        if(res.ok){ sent.add(pc); note(); }
      }
      /* v1.282.13: вычитаем только реально доставленное, а не перезаписываем очередь
         своим устаревшим списком. Раньше письмо, попавшее в очередь во время await,
         затиралось финальной записью flush — и терялось НАВСЕГДА: его ключ уже лежал
         в seen, так что второй раз оно бы не сложилось. */
      Store.set('beaconQ', queue().filter(pc=>!sent.has(pc)).slice(-10));
    } finally{ flushing=false; }
  }
  /* ctx — переменная приправа (fps/качество/тир). Держим её ОТДЕЛЬНО от msg:
     v1.282.13 — раньше perfCtx() вклеивался в текст письма, а ключ дедупа режется
     из текста. fps меняется каждую секунду, значит одна и та же ошибка давала
     десятки разных ключей: закон «одна ошибка — одно письмо за сессию» не работал,
     а сервер считал почти каждое письмо новым типом и слал разработчику «🆕 Новый тип». */
  function drop(kind,msg,ctx){ if(!on()||sealed()) return; // выкл значит выкл: ни писем, ни очереди; печать — то же молчание
    const key=kind+'|'+String(msg==null?'':msg).slice(0,60);
    if(seen.has(key)) return; seen.add(key); // дедуп: одна ошибка — одно письмо за сессию
    if(kind==='error') errCount++; // v1.108.1: слой 3 считает именно падения, не сигналы-симптомы
    const text=(ctx?'['+ctx+'] ':'')+String(msg==null?'':msg);
    const q=queue(); q.push(postcard(kind,text));
    Store.set('beaconQ',q.slice(-10)); // очередь — не архив: десять последних
    flush().catch(()=>{}); // отказ отправки не должен всплыть необработанным и вернуться сюда же через слушатель
  }
  // падения борта — те же события, что пишет самописец (свои слушатели, чужой мост не трогаем)
  window.addEventListener('error',e=>{ if(e&&e.message){
    // v1.108.1: раньше письмо несло только текст ошибки — «что», без «где» и «на чём». Файл:строка:столбец
    // берутся напрямую из события; fps/тир/качество — уже вычислены ради Адаптивного I.Q., просто читаем.
    // При отсутствии (редкий браузер) — просто не добавляется, письмо всё равно уходит.
    // v1.282.13: loc (файл:строка:столбец) устойчив — он часть личности ошибки и остаётся в msg,
    // а перчинка perfCtx уходит третьим доводом, мимо ключа дедупа.
    const loc=e.filename?(String(e.filename).split('/').pop()+':'+e.lineno+':'+e.colno):'';
    drop('error',(loc?loc+' ':'')+e.message, perfCtx());
  } });
  window.addEventListener('unhandledrejection',e=>drop('error','promise: '+String(e&&e.reason), perfCtx()));

  /* v1.108.1 «Слой 3»: открытка сессии — не поток данных, а одна короткая отправка в естественный
     момент выхода. Даёт полное покрытие (не только упавшие сессии), не только жалобы. sendBeacon,
     не fetch — гарантированно долетает даже когда страница уже закрывается, не блокирует, не держит
     вкладку живой. Отдельный путь от очереди (beaconQ/flush): очередь — для гарантированной доставки,
     когда игра продолжает жить; здесь ретраить нечего — если не долетело в момент закрытия, повторной
     попытки не будет физически. Уважает тот же переключатель и печать лаборатории, что и все письма. */
  let sessSent=0; // v1.282.13: сколько раз открытка сессии уже уходила
  function sessionBeacon(){
    if(!on()||sealed()) return;
    /* v1.282.13: одна открытка за выход, а не на каждое сворачивание. В Telegram и на
       телефоне visibilitychange+hidden случается при каждом уведомлении, блокировке
       экрана, переключении приложения — модуль слал письмо каждый раз. Строк в базе от
       этого не прибавлялось (сервер душит), зато каждая попытка стоила вызова функции,
       preflight и запроса к базе. Держим паузу в 10 минут между открытками. */
    const nowT=Date.now();
    if(sessSent && nowT-sessSent < 10*60*1000) return;
    sessSent=nowT;
    if(typeof navigator==='undefined'||typeof navigator.sendBeacon!=='function') return; // старый браузер — честно молчим, не подменяем fetch'ем (он ненадёжен именно в этот момент)
    const dur=Math.round((Date.now()-sessStart)/1000);
    const pc=postcard('session', perfCtx()+' dur:'+dur+' err:'+errCount);
    try{
      const blob=new Blob([JSON.stringify(pc)],{type:'application/json'});
      navigator.sendBeacon(URL, blob);
    }catch(e){}
  }
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) sessionBeacon(); });
  }

  /* сигналы-симптомы — крючки-однострочники зовут оттуда, где родился симптом:
     gfx_fix (нажал «Снизить графику» — кадры болели), liar (суд нашёл лжеца —
     датчик врёт), cal_storm (калибруется без конца — ноль не держится) */
  function signal(kind,msg){ drop('signal',kind+(msg?': '+msg:'')); }
  // v1.109.0: источник сброса (orientation/flip/manual) — без этого cal_storm нельзя
  // разобрать по корню; несколько разных дорог в calReset() дают один и тот же симптом.
  // v1.109.3 (партия 21): взлёт — честный сброс, не дребезг; при пороге ×5 за сессию
  // активная игра сама набирала «шторм» без единой поломки. Решение владельца (закон 11):
  // 'takeoff' в счётчик шторма не идёт вовсе, остальные источники — как и раньше.
  function calTick(source){
    const key=source||'unknown';
    if(key==='takeoff') return;
    calN++;
    calSources[key]=(calSources[key]||0)+1;
    if(calN>=5&&!calStormed){
      calStormed=true;
      const breakdown=Object.keys(calSources).map(k=>k+':'+calSources[k]).join(' ');
      signal('cal_storm','calReset ×'+calN+' за сессию ('+breakdown+')');
    }
  }

  setTimeout(()=>flush().catch(()=>{}),4000); // доотправка очереди прошлой сессии — как syncFlush
  // v1.282.13: сеть вернулась — вот честный повод разослать накопившееся, вместо того
  // чтобы биться в каждую ошибку офлайном (flush теперь выходит сразу, если сети нет).
  if(typeof window!=='undefined') window.addEventListener('online',()=>flush().catch(()=>{}));
  /* «Гость виден» (13.08.2026): дневник дней у невошедшего игрока.
     Гость ведёт журнал с первого полёта — dayMark() и dayAdd() в core.js зовутся без
     всякой проверки входа и держат до 60 дней. Но отправить его ему было нечем:
     syncSubmit() начинается с раннего возврата на syncAvailable(), и таких возвратов
     в sync.js двенадцать. Данные были собраны и лежали у человека в браузере, а мы
     считали, что «гостей не видно». Везём их тем же анонимным каналом, что и письма.
     У вошедшего молчим намеренно: его дневник едет именным путём вместе с рекордом,
     и если бы ехал ещё и здесь, один и тот же день лёг бы в две таблицы разом.
     Свой список отправленного (daysSentAnon), а НЕ общий с именным каналом: иначе
     человек, который однажды войдёт, не довезёт до своего аккаунта то, что уже отдал
     гостем — день был бы помечен отправленным и в личную таблицу уже не поехал. */
  async function days(){
    if(!on() || sealed()) return false;                       // тумблер и печать лаборатории — те же, что у писем
    if(typeof syncAvailable==='function' && syncAvailable()) return false; // вошёл — везёт именной канал
    if(typeof daysToSend!=='function') return false;
    let list=[]; try{ list=daysToSend()||[]; }catch(e){ return false; }
    const sentRaw=Store.get('daysSentAnon',[]);
    const sent=new Set(Array.isArray(sentRaw)?sentRaw:[]);
    const today=(typeof todayKey==='function')?todayKey():'';
    list=list.filter(r=>r && r.d && (r.d===today || !sent.has(r.d))); // сегодняшний везём всегда: он ещё меняется
    if(!list.length) return false;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false; // офлайн — дождёмся следующей посадки
    const ctl=(typeof AbortController==='function')?new AbortController():null;
    const t=ctl?setTimeout(()=>{ try{ctl.abort();}catch(e){} },SEND_TIMEOUT):0;
    try{
      const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'),
                              anon:anon(), days:list }),
        keepalive:true, signal:ctl?ctl.signal:undefined});
      if(!r||!r.ok) return false;
      let body=null; try{ body=await r.json(); }catch(e){}
      /* Вычёркиваем день ТОЛЬКО по слову сервера, а не по факту двухсотки: тот же закон,
         что уже выучен на quiet и на days_ack именного дневника. Иначе день, который
         сервер подрезал или отбросил, для клиента считался бы сданным навсегда. */
      const ack=(body && Array.isArray(body.days_ack)) ? body.days_ack : [];
      if(ack.length){
        ack.forEach(d=>{ if(d && d!==today) sent.add(d); });
        Store.set('daysSentAnon', Array.from(sent).sort().slice(-60));
      }
      return ack.length>0;
    }catch(e){ return false; }
    finally{ if(t) clearTimeout(t); }
  }

  return { signal, calTick, days, _flush:flush, _state:()=>({q:queue().length,on:on(),seen:seen.size}) };
})();
