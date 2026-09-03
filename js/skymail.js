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
function pickDispatchCandidate(queue, limit=2){
  if(!Array.isArray(queue)) return [];
  const items=[]; const seen=new Set();
  for(const item of queue){
    if(!item || typeof item!=='object') continue;
    const key=(item.kind||'')+'|'+String(item.msg==null?'':item.msg).slice(0,60);
    if(seen.has(key)) continue;
    seen.add(key); items.push(item);
  }
  items.sort((a,b)=>{
    const pa = a.kind==='error' ? 1 : 0;
    const pb = b.kind==='error' ? 1 : 0;
    if(pa!==pb) return pb-pa;
    return (a.ts||0)-(b.ts||0);
  });
  return items.slice(0, limit);
}
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
  /* 02.09.2026 (владелец, «раз и навсегда отточить инструмент»): версия моста Telegram и
     настоящие отступы безопасной зоны раньше не ехали ни с одним письмом — только косвенно,
     кусками текста, если повезёт. Именно версия tg могла бы сказать, на КАКИХ клиентах
     занижается viewportStableHeight (сегодняшнее расследование, guardCanvasNeverShorterThanWindow).
     Едет с КАЖДЫМ письмом, не только со снимком — дёшево (одна строка), не требует shot. */
  function envCtx(){
    try{
      const rt=(typeof tgApp==='function')?tgApp():null;
      const tgv=(rt&&rt.version)||'-';
      const exp=rt?(rt.isExpanded?1:0):'-';
      const full=rt?(rt.isFullscreen?1:0):'-';
      const stable=rt?(rt.viewportStableHeight||'-'):'-';
      const cs=(typeof getComputedStyle==='function')?getComputedStyle(document.documentElement):null;
      const v=(name)=>cs?cs.getPropertyValue(name).trim():'-';
      /* 02.09.2026: качество сети — отделить «плохой интернет» от «сломанный код» у симптомов
         вроде card_save_fail/card_chat_fail. API есть не везде (Safari его не отдаёт вовсе) —
         честное '-' там, где спросить некого, не подмена значения. Численно проверено: даже
         в наихудшем случае (все поля на максимум) итоговая строка — 207 из 300 символов
         лимита на сервере, запас есть. */
      const conn=(typeof navigator!=='undefined')?(navigator.connection||navigator.mozConnection||navigator.webkitConnection):null;
      const net=conn?(String(conn.effectiveType||'-')+' dl:'+(conn.downlink!=null?conn.downlink:'-')+' rtt:'+(conn.rtt!=null?conn.rtt:'-')):'-';
      return 'tgv:'+tgv+' exp:'+exp+' full:'+full+' stable:'+stable+
        ' iw:'+(window.innerWidth||'-')+' ih:'+(window.innerHeight||'-')+
        ' sat:'+v('--sat')+' satm:'+v('--sat-menu')+' sab:'+v('--sab')+' sar:'+v('--sar')+
        ' net:'+net;
    }catch(e){ return ''; }
  }
  /* 02.09.2026 «Паспорт полёта» (владелец, «раз и навсегда отточить инструмент»): бортовой
     самописец (blackbox.js) знает про руль/датчики, но не про само игровое состояние —
     режим, скин, счёт, дистанцию. На взлёте/посадке эти числа попадают в ленту одной строкой
     (BB.log('takeoff'/'landing',...)), а ошибка СРЕДИ полёта раньше не оставляла следа, что
     именно происходило в этот момент. Пусто вне полёта (S.running=false) — в меню эти поля
     не значат ничего, только шумели бы. */
  function flightCtx(){
    try{
      if(typeof S==='undefined' || !S || !S.running) return '';
      return 'mode:'+(S.mode||'?')+' mission:'+(S.mission!=null?S.mission:'?')+
        ' skin:'+(S.skin!=null?S.skin:'?')+' score:'+Math.floor(S.score||0)+
        ' combo:'+Math.floor(S.combo||0)+' lives:'+(S.lives!=null?S.lives:'?')+
        ' dist:'+Math.floor(S.dist||0);
    }catch(e){ return ''; }
  }
  function postcard(kind,msg,stack,shot){
    let verdict='', tail='', audioV='';
    try{ verdict=bbVerdict(); }catch(e){}
    try{ audioV=audioVerdict(); }catch(e){}
    let flight=''; try{ flight=flightCtx(); }catch(e){}
    /* 23.08.2026: стек вызовов — бесплатно от браузера через e.error.stack, но раньше
       не читался вовсе, ловилось только сообщение+файл:строка:столбец. Кладём стек
       ПЕРЕД хвостом чёрного ящика в уже существующем поле tail (лимит 3000 символов
       на сервере — щедрый, схему БД трогать не пришлось), с явной подписью.
       02.09.2026: паспорт полёта — первой строкой, в том же поле tail, без новой колонки. */
    try{ tail=(flight?('полёт: '+flight+'\n'):'')+(stack?('стек:\n'+String(stack).slice(0,1200)+'\n---\n'):'')+BB._tape().slice(-12).map(e=>'['+e.t+'] '+e.ev+(e.d?': '+e.d:'')).join('\n'); }catch(e){}
    let pf='?'; try{ pf=(typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?'; }catch(e){}
    const pc = { v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'), pf:pf, kind:kind,
      msg:String(msg==null?'':msg).slice(0,300), verdict:verdict, audio:audioV, tail:tail,
      env:envCtx(), ua:(navigator.userAgent||'').slice(0,200), anon:anon(), ts:Date.now() };
    if(shot) pc.shot=shot; // 02.09.2026 «Снимок на подозрение»: см. signalShot() ниже
    return pc;
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
  if(typeof Store!=='undefined'){
    setInterval(()=>{ if(Store.get('beaconNote',0)>0) note(); },2000); // спрашиваем: небо отпустило?
  }

  function queue(){ return saneArray(Store.get('beaconQ',[]),[]); } // v1.282.13: очередь читается через санацию, как syncQ в sync.js — битое значение (облако, скос версий) роняло flush прямо внутри async, и отказ уходил в unhandledrejection → drop → flush → круг

  /* ---- Окно вежливости (v1.284.19, партия 46) ----
     Замер по боевым логам 14.08: функция маяков получила 539 вызовов, а писем в базу
     легло 56; пиковый час — 255 вызовов от одного играющего человека. Три-десять вызовов
     на одно сохранённое письмо.
     Корень не в сервере и не в очереди, а в том, КАК мы стучались. У дверки антифлуд:
     одно письмо в 20 секунд на устройство, лишнее возвращается как quiet. Клиент это
     честно понимает и письмо не выбрасывает (v1.282.13) — но flush() звался на КАЖДОЕ
     новое письмо и каждый раз прогонял ВСЮ очередь по письму за запрос. Очередь из пяти
     плюс одно новое — шесть запросов, из которых пять отвергнутся заведомо. Мы знали
     правило двери и всё равно ломились в неё пачкой.
     Лекарство из двух половин, и обе обязательны:
       1) за один заход уходит РОВНО ОДНО письмо — больше дверь всё равно не примет;
       2) следующий заход не раньше, чем через окно, сколько бы писем ни бросили.
     Цена: письмо из середины очереди ждёт своей двадцатки. Это честная плата — оно и
     раньше ждало, просто мы платили за ожидание вызовами. Ошибка, пришедшая на пустую
     очередь, уходит по-прежнему сразу: окно считается от последней попытки, а не от часов.
     OKNO чуть больше серверных 20 с — запас на расхождение часов и дорогу. */
  const OKNO = 21000;
  let posledniy = 0, budilnik = 0;
  function razbudit(){                 // «есть что отправить» — прийти не раньше, чем можно
    if(budilnik || !on() || sealed()) return;
    const zhdat = Math.max(0, OKNO - (Date.now() - posledniy));
    budilnik = setTimeout(()=>{ budilnik = 0; flush().catch(()=>{}); }, zhdat);
  }
  async function flush(){ if(flushing||!on()||sealed()) return; // печать: с верстака не летит
    if(typeof navigator!=='undefined' && navigator.onLine===false) return; // v1.282.13: офлайн — не бьёмся в закрытую дверь, дождёмся события 'online'
    const q=queue();
    if(!q.length) return;
    flushing=true;
    try{
      /* Одно письмо за заход — дверь всё равно примет одно. Раз выбор всего один, он
         обязан быть в пользу игрока: сначала падения борта, потом наблюдения. Очередь
         держит десять последних, а за живой забег сигналов (смерть, просадка кадра,
         врущий датчик) набегает куда больше, чем ошибок, — без этой строки настоящая
         ошибка вытеснялась бы из очереди чередой обычных сигналов и не уезжала никогда.
         Внутри своей породы порядок прежний: кто раньше встал, тот раньше едет. */
      const pc = q.find(x=>x && x.kind==='error') || q[0];
      posledniy=Date.now();             // отсчёт окна — от попытки, а не от успеха: отказ тоже стоил вызова
      let res={ok:false};
      try{ res=await send(pc); }catch(e){}
      /* v1.284.12 «Смерть — не неполадка». Раньше окно «экипаж знает» открывалось на
         ЛЮБОЕ доставленное письмо, а письмами ходят и обычные сигналы: смерть, просадка
         кадра, врущий датчик. Смертью кончается каждый забег — значит игрок читал
         «борт заметил неполадку и уже доложил» после каждого матча, при том что борт
         был цел. Проверено по боевой базе: 273 сигнала и ноль ошибок за всю историю
         живых версий. Слова про неполадку положены только неполадке. */
      if(res.ok){
        if(pc && pc.kind==='error') note();
        /* v1.282.13: вычитаем только реально доставленное, а не перезаписываем очередь
           своим устаревшим списком. Раньше письмо, попавшее в очередь во время await,
           затиралось финальной записью flush — и терялось НАВСЕГДА: его ключ уже лежал
           в seen, так что второй раз оно бы не сложилось. */
        Store.set('beaconQ', queue().filter(x=>x!==pc).slice(-10));
      }
    } finally{ flushing=false; if(queue().length) razbudit(); } // осталось — придём в следующее окно
  }
  /* ctx — переменная приправа (fps/качество/тир). Держим её ОТДЕЛЬНО от msg:
     v1.282.13 — раньше perfCtx() вклеивался в текст письма, а ключ дедупа режется
     из текста. fps меняется каждую секунду, значит одна и та же ошибка давала
     десятки разных ключей: закон «одна ошибка — одно письмо за сессию» не работал,
     а сервер считал почти каждое письмо новым типом и слал разработчику «🆕 Новый тип». */
  function drop(kind,msg,ctx,stack,shot){ if(!on()||sealed()) return; // выкл значит выкл: ни писем, ни очереди; печать — то же молчание
    const key=kind+'|'+String(msg==null?'':msg).slice(0,60);
    if(seen.has(key)) return; seen.add(key); // дедуп: одна ошибка — одно письмо за сессию
    if(kind==='error') errCount++; // v1.108.1: слой 3 считает именно падения, не сигналы-симптомы
    const text=(ctx?'['+ctx+'] ':'')+String(msg==null?'':msg);
    const q=queue(); q.push(postcard(kind,text,stack,shot));
    Store.set('beaconQ',q.slice(-10)); // очередь — не архив: десять последних
    razbudit(); // v1.284.19: не «отправить сейчас», а «прийти, когда дверь откроется» — см. окно вежливости выше
  }

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
      /* 23.08.2026: раньше здесь стоял тип application/json — не «простой» CORS-тип,
         значит требовался preflight (OPTIONS) перед самой отправкой. Весь смысл sendBeacon — долететь
         в момент закрытия страницы; два прохода туда-обратно не всегда успевают,
         особенно в мобильных WebView. 'text/plain' — «простой» тип, preflight не
         нужен вовсе. Сервер разбирает тело как JSON независимо от заголовка
         (req.json()), для него ничего не меняется. Задокументировано в KNOWN-BUGS.md
         («sessionBeacon не долетает») — лекарство было названо, но не применено. */
      const blob=new Blob([JSON.stringify(pc)],{type:'text/plain'});
      navigator.sendBeacon(URL, blob);
    }catch(e){}
  }
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange', ()=>{ if(document.hidden) sessionBeacon(); });
  }
  if(typeof window!=='undefined'){
    window.addEventListener('error',e=>{ if(e&&e.message){
      const loc=e.filename?(String(e.filename).split('/').pop()+':'+e.lineno+':'+e.colno):'';
      const stack=(e.error && e.error.stack) ? String(e.error.stack) : '';
      drop('error',(loc?loc+' ':'')+e.message, perfCtx(), stack);
    } });
    window.addEventListener('unhandledrejection',e=>{
      const reason=e && e.reason;
      const stack=(reason instanceof Error && reason.stack) ? String(reason.stack) : '';
      drop('error','promise: '+String(reason), perfCtx(), stack);
    });
  }
  if(typeof window!=='undefined' && typeof Store!=='undefined'){
    setTimeout(()=>razbudit(),4000); // доотправка очереди прошлой сессии — как syncFlush; v1.284.19: через окно вежливости, а не напролом
    // v1.282.13: сеть вернулась — вот честный повод разослать накопившееся, вместо того
    // чтобы биться в каждую ошибку офлайном (flush теперь выходит сразу, если сети нет).
    window.addEventListener('online',()=>razbudit());
  }

  /* сигналы-симптомы — крючки-однострочники зовут оттуда, где родился симптом:
     gfx_fix (нажал «Снизить графику» — кадры болели), liar (суд нашёл лжеца —
     датчик врёт), cal_storm (калибруется без конца — ноль не держится) */
  function signal(kind,msg){ drop('signal',kind+(msg?': '+msg:'')); }
  /* 02.09.2026 «Снимок на подозрение» (владелец: «пусть само приходит, не буду просить
     людей играть и слать скрин руками»): для отдельных, редких, по-настоящему подозрительных
     сигналов (не для всех — иначе хранилище раздувается на пустом месте) кладём вместе с
     текстом маленький снимок игрового холста в момент срабатывания. Показывает только то,
     что рисует НАШ canvas — не всю страницу целиком (заголовок Telegram, пробел ПОД холстом
     и подобное снаружи canvas снимок не увидит, это ограничение честно, не тайное).
     Тем не менее для класса «холст короче окна» числа (window.innerHeight vs высота холста)
     уже несёт сам текст сигнала — снимок здесь как подтверждение, что рисуется внутри холста
     корректно, а не замена измерению.
     Даунскейл до ≤480px по длинной стороне и JPEG q=0.6 — предсказуемо мелкий файл
     (диагностика, не витрина), не PNG (тот на градиентах неба весит ощутимо больше).
     Дедуп — тот же самый key в drop(), что и у обычного signal(): один и тот же род один раз
     за сессию, снимок не шлётся повторно на каждое срабатывание. */
  function captureShot(){
    try{
      const src=(typeof canvas!=='undefined'&&canvas)?canvas:document.getElementById('game');
      if(!src||!src.width||!src.height) return '';
      const maxSide=480;
      const s=Math.min(1, maxSide/Math.max(src.width,src.height));
      const w=Math.max(1,Math.round(src.width*s)), h=Math.max(1,Math.round(src.height*s));
      const off=document.createElement('canvas'); off.width=w; off.height=h;
      const octx=off.getContext('2d'); if(!octx) return '';
      octx.drawImage(src,0,0,w,h);
      return off.toDataURL('image/jpeg',0.6);
    }catch(e){ return ''; }
  }
  function signalShot(kind,msg){ drop('signal',kind+(msg?': '+msg:''),null,null,captureShot()); }
  /* 24.08.2026 «Браузер предупреждал, а мы не слушали»: ReportingObserver ловит
     deprecation (используем API, который движок скоро уберёт) и intervention
     (движок САМ отключил что-то у нас на странице ради безопасности/производительности —
     тише, чем падение, но именно такая тишина потом становится «необъяснимым» багом).
     Раньше API был Chromium-only и на iOS бесполезен; с версии Safari 26.4 (март 2026)
     он вошёл в Baseline «Newly available» — теперь ловит на обеих платформах разом.
     Зовём тем же signal(), что и остальные симптомы: kind='report' сервер НЕ уведомляет
     (cosmogram-beacon/index.ts слушает только error/signal) — письмо ушло бы в базу
     молча, а весь смысл в обратном. buffered:true — не теряем то, что случилось
     до того, как этот код успел подписаться. */
  if(typeof window!=='undefined' && typeof ReportingObserver!=='undefined'){
    try{
      new ReportingObserver((reports)=>{
        for(const r of reports){
          const b=r.body||{};
          signal('report', String(r.type||'?')+' '+String(b.id||'').slice(0,40)+': '+String(b.message||'').slice(0,100));
        }
      }, {types:['deprecation','intervention'], buffered:true}).observe();
    }catch(e){}
  }
  /* v1.473.0 «Зонд Кино полёта»: одноразовая (за сессию) проверка возможностей WebCodecs
     на реальном устройстве — не строит видео, только спрашивает браузер «сможешь ли ты?»
     через isConfigSupported() и отправляет ответ телеметрией. Причина: research 24.08.2026
     показал, что аппаратный H.264-энкодер на Android официально надёжен только с
     Chrome/WebView 130.0.6703.0+, и именно на «Дне» (Redmi 9A/10A, Galaxy A03s)
     MediaCodec документированно отказывается создавать энкодер на нестандартных
     разрешениях — а программного отката для H.264 на Android у Chromium нет вовсе.
     Прежде чем строить сам пайплайн «Кино полёта», нужны числа с реального парка
     устройств, а не с телефонов друзей. */
  async function webcodecsProbe(){
    if (typeof VideoEncoder==='undefined' || !on() || sealed()) return; // честное молчание — старый браузер или зонд/телеметрия выключены
    const targets=[[720,1280,'720p'],[1080,1920,'1080p']]; // числа — для VideoEncoder, метка — для письма (короче)
    const prefs=['prefer-hardware','prefer-software'];
    /* 26.08.2026: зонд проверял только H.264 — живые данные (6 устройств, 0 из 26 проб)
       показали отказ и на hw, и на sw, при этом WebView на тех же устройствах уже выше
       версии, которая по прежнему предположению должна была всё решить (151.x против
       порога 130.0.6703.0+) — значит дело не в версии браузера. Добавлены VP8/VP9/AV1:
       у них другая лицензионная история (VP8 вовсе без патентных отчислений), шанс найти
       рабочий путь там, где H.264 недоступен. HEVC не проверяем — Chromium не отдаёт его
       кодировщик через веб ни на одной известной платформе, письма на это не тратим. */
    const codecs=[
      {id:'h264', str:'avc1.42001E'},
      {id:'vp8',  str:'vp8'},
      {id:'vp9',  str:'vp09.00.10.08'},
      {id:'av1',  str:'av01.0.04M.08'},
    ];
    const parts=[];
    for (const [w,h,label] of targets){
      for (const codec of codecs){
        for (const pref of prefs){
          let ok=0;
          try{
            const cfg={ codec:codec.str, width:w, height:h, bitrate:2_000_000, framerate:30, hardwareAcceleration:pref };
            const r=await VideoEncoder.isConfigSupported(cfg);
            ok=(r && r.supported)?1:0;
          }catch(e){ ok=0; } // отказ конфигурации — тоже честный результат, не ошибка зонда
          parts.push(label+':'+codec.id+':'+(pref==='prefer-hardware'?'hw':'sw')+'='+ok);
        }
      }
    }
    const pc=(typeof tgPerfClass==='function')?(tgPerfClass()||'?'):'?';
    const tgv=(typeof tg!=='undefined' && tg && tg.version)||'?';
    /* 16 сочетаний вместо 4 — а postcard() (ниже по файлу) режет ЛЮБОЕ msg до 300 символов,
       свой общий предел на все письма, его не трогаем. Короткие метки 720p/1080p вместо
       WxH держат итог у 271 символа с pc=/tgv= в хвосте (проверено численно) — тратить
       здесь предел больше 280 бессмысленно, всё равно обрежет postcard(). */
    signal('webcodecs_probe', (parts.join(' ')+' pc='+pc+' tgv='+tgv).slice(0,280));
  }
  /* 27.08.2026 «Паспорт слабого борта»: разбор самого слабого из найденных сенсорных
     телефонов (Samsung A032F) шёл вслепую — у нас были только жалобы на кадр, ни одной
     цифры о том, ЧТО именно на этом железе узкое место: экран рисуется крупнее, чем
     тянет чип (высокий DPR), самих ядер/памяти мало, или дело не в мощности вовсе,
     а в НЕРОВНОЙ доставке кадров (просадки, не средняя скорость). Один разовый зонд
     за сессию, свой независимый цикл requestAnimationFrame (не трогает Q/render.js —
     тяжёлая работа ЧУЖОГО кадра всё равно отодвигает наш тик, значит дребезг настоящий).
     Зовётся из момента взлёта (startGame), а не из меню: там нагрузка близка к нулю
     и ничего не покажет. profiled — чтобы не гонять 2.5с цикл на каждый повторный забег. */
  let profiled=false, lastProfile=''; // lastProfile: та же строка, что ушла в телеметрию, но живёт локально —
  // «Скопировать самописец» в сервисном центре её тоже показывает (см. blackbox.js text()),
  // так что паспорт борта виден сразу на экране владельца, не только в письме на почту неба.
  async function deviceProfileProbe(){
    if(profiled || !on() || sealed()) return; profiled=true;
    try{
      const dpr=window.devicePixelRatio||1;
      const effDpr=(typeof DPR!=='undefined')?DPR:'?';
      const capV=(typeof dprCap!=='undefined')?dprCap:'?';
      const cvsW=(typeof canvas!=='undefined'&&canvas)?canvas.width:'?';
      const cvsH=(typeof canvas!=='undefined'&&canvas)?canvas.height:'?';
      const hc=(typeof navigator!=='undefined'&&navigator.hardwareConcurrency)||'?';
      const mem=(typeof navigator!=='undefined'&&navigator.deviceMemory)||'?';
      const lvl=(typeof Q!=='undefined')?Q.level:'?';
      const mode=(typeof Q!=='undefined')?Q.mode:'?';
      const tier=(typeof gfxTier==='function')?gfxTier():'?';
      const deltas=await new Promise(resolve=>{
        const arr=[]; let last=performance.now(); const stop=last+2500;
        function tick(now){ arr.push(now-last); last=now;
          if(now<stop && arr.length<300) requestAnimationFrame(tick); else resolve(arr); }
        requestAnimationFrame(tick);
      });
      deltas.shift(); deltas.sort((a,b)=>a-b); // первый замер после промиса не показателен
      const p50=deltas[Math.floor(deltas.length*0.5)]||0;
      const p95=deltas[Math.floor(deltas.length*0.95)]||0;
      const max=deltas[deltas.length-1]||0;
      lastProfile='dpr:'+dpr+'/'+effDpr+'(cap'+capV+') cvs:'+cvsW+'x'+cvsH+
        ' cpu:'+hc+' mem:'+mem+' tier:'+tier+' Q:'+lvl+'/'+mode+
        ' frame p50:'+p50.toFixed(0)+'ms p95:'+p95.toFixed(0)+'ms max:'+max.toFixed(0)+'ms';
      signal('device_profile', lastProfile);
    }catch(e){}
  }
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

  /* v1.284.14: свой вход для падений, которые ловим МЫ, а не браузер. Мост Telegram
     оборачивает каждый наш колбэк в свой try/catch, поэтому до window.onerror такие
     ошибки не доходят — доложить о них может только тот, кто их поймал. */
  function err(msg){ drop('error', String(msg==null?'':msg), perfCtx()); }

  /* 30.08.2026 «Написать разработчику»: прямая отправка, в обход очереди/окна вежливости
     выше — те настроены под автоматическую телеметрию (дедуп по сессии, одно письмо в 21с),
     а здесь игрок сам нажал «Отправить» и ждёт немедленного ответа, не окна ожидания.
     Сервер отвечает {ok:true} либо {ok:false, reason}; UI (ui.js) сам решает, что показать. */
  async function feedback(text, photos){
    if(sealed()) return {ok:false, reason:'sealed'};
    const t=String(text==null?'':text).trim().slice(0,28000); // 03.09.2026: потолок 7000→28000 (владелец — 170 событий на ленте самописца
      // всё ещё резались даже на 7000, замерено вживую: полное кольцо 180 событий ≈ 8965 симв.,
      // худший случай — 19764), вместе с index.html и живой Edge Function cosmogram-beacon
    if(!t) return {ok:false, reason:'empty'};
    // 03.09.2026 «Снимок к отзыву»: до 5 уже готовых JPEG dataURL от feedbackPhotoAdd() (ui.js) —
    // сервер сам ограничивает и число, и размер каждой, здесь только честная передача того,
    // что реально собрал игрок (лишнее по счёту сервер отбросит, не UI дублирует эту проверку).
    const shots=Array.isArray(photos) ? photos.filter(p=>typeof p==='string' && p.length>0).slice(0,5) : [];
    let pf='?'; try{ pf=(typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?'; }catch(e){}
    const ctl=(typeof AbortController==='function')?new AbortController():null;
    const tmr=ctl?setTimeout(()=>{ try{ctl.abort();}catch(e){} },SEND_TIMEOUT):0;
    try{
      const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'feedback', text:t, anon:anon(),
          v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'), pf:pf, shots:shots}),
        signal:ctl?ctl.signal:undefined});
      if(!r) return {ok:false, reason:'http'};
      /* 30.08.2026: сервер честно отвечает 400/429 С ТЕЛОМ {ok:false, reason:'rate'|'spam'|...} —
         r.ok у fetch означает только «код 200-299», проверка ДО чтения тела топила reason
         в общее 'http' на КАЖДОМ отказе сервера (лимитер, пустой текст, теперь мусор).
         Тело читаем всегда, к статусу возвращаемся только если тело не разобрать вовсе. */
      let body=null; try{ body=await r.json(); }catch(e){}
      if(!body) return {ok:false, reason:'http'};
      if(body.ok!==true) return {ok:false, reason:body.reason||'server'};
      return {ok:true};
    }catch(e){ return {ok:false, reason:'net'}; }
    finally{ if(tmr) clearTimeout(tmr); }
  }
  return { signal, signalShot, err, calTick, days, webcodecsProbe, deviceProfileProbe, profileText:()=>lastProfile, envCtx, flightCtx, feedback, _flush:flush, _okno:()=>OKNO, _state:()=>({q:queue().length,on:on(),seen:seen.size}) };
})();
if(typeof module!=='undefined' && module.exports){ module.exports = { pickDispatchCandidate, BEACON }; }
