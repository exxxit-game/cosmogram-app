'use strict';
/* ============================================================
   SYNC (модуль): честная таблица рекордов через Supabase.
   Ядро не трогаем: gameOver просто зовёт syncSubmit() — и всё.
   Сервер лёг / нет сети / игрок вне Telegram — игра работает
   как раньше, результат ждёт в очереди до следующего раза.
   Зависит от core.js (tg, Store), game.js (S).
   ============================================================ */
const SYNC_URL='https://cwpijvgdrrvnvldhnmbj.supabase.co/functions/v1/cosmogram-sync';
const SYNC_KEY='sb_publishable_0Ut2DUmAbYkJoxVLTMAKqg_Qwn3OMnI'; // публичный ключ: безопасен, доступ решает подпись Telegram
const SYNC_CATS=['gyro','touch','bullet','dist','keys'];
/* v1.282.13 «Поводок»: у всех запросов синка есть предел терпения. Раньше fetch уходил без
   таймаута, и на «полусетевом» канале (соединение открыто, ответа нет) промис висел вечно:
   очередь не чистилась и не повторялась, а вызывающий код ждал ответа, которого не будет.
   В логах сервера уже видны ответы под 2.3 секунды — до висяка недалеко.
   04.09.2026: объявление ПЕРЕНЕСЕНО сюда, к началу файла — жило ниже, у syncFetch() (строка
   ~207), а syncBootOAuth() ниже — IIFE, выполняется сразу при загрузке скрипта и на возврате
   из Google/Discord зовёт syncFetch() раньше, чем скрипт доходит до старого места объявления:
   «can't access lexical declaration 'POST_TIMEOUT' before initialization» — ReferenceError на
   КАЖДОМ возврате из OAuth, без единого исключения. Поймано только через живую консоль
   браузера владельца — сервер эту ошибку никогда не видел (падает раньше сети). */
const POST_TIMEOUT=10000;

/* ---------- Несколько входов, одна таблица ----------
   initData — внутри мини-аппа; webAuth — старая веб-сессия Telegram Login Widget (виджет
   убран 02.09.2026 — см. ниже, но уже выданные сессии этим же способом продолжают
   работать, читаются отсюда же); dcAuth/gAuth — Discord/Google.
   Анонимов в таблице нет и не будет: ник без подписи = флуд и стертое доверие. */
function syncInitData(){ return (tg && tg.initData) || null; } // подпись есть только внутри Telegram
function syncWebAuth(){ const w=Store.get('tgWebAuth',null); return (w && w.id && w.hash) ? w : null; } // веб-сессия виджета (живёт ~неделю, потом вход в один тап)
function syncDcAuth(){ const w=Store.get('dcAuth',null); return (w && w.sess) ? w : null; } // сессия Discord: HMAC-подпись нашего сервера (v1.52.0 «Второй вход»)
function syncGAuth(){ const w=Store.get('gAuth',null); return (w && w.sess) ? w : null; } // 23.08.2026: сессия Google — тот же приём, что у Discord
function syncAuth(){ const d=syncInitData(); if(d) return {initData:d}; const w=syncWebAuth(); if(w) return {webAuth:w}; const c=syncDcAuth(); if(c) return {dcAuth:c}; const g=syncGAuth(); if(g) return {gAuth:g}; return null; }
function syncAvailable(){ return !!syncAuth(); }
function ghostAccessStateForAuth(isAuthed, labels){
  const text = (labels && labels.accGuest) || 'Sign in with Telegram';
  return isAuthed ? null : text;
}
function syncAuthName(){ // имя для «ты в таблице как …»
  try{ const u=tg && tg.initDataUnsafe && tg.initDataUnsafe.user; if(u && u.first_name) return String(u.first_name); }catch(e){}
  const w=syncWebAuth(); if(w) return String(w.first_name||'Игрок');
  const c=syncDcAuth(); if(c) return String(c.name||'Игрок');
  const g=syncGAuth(); return g ? String(g.name||'Игрок') : null;
}

/* 02.09.2026: браузерная кнопка входа Telegram (виджет telegram.org, tgWidgetMount) убрана
   целиком — владелец: игрок внутри Telegram и так входит сам собой через initData, третья
   форма входа рядом с Google/Discord ломала единый вид ряда кнопок и не стоила своей возни
   (чужой iframe: непредсказуемый язык, недоступная изнутри вёрстка — та же беда, что уже не
   раз ловила подгонку Discord/Google под этот же виджет). Уже выданные веб-сессии (Store
   'tgWebAuth') продолжают читаться как обычно — syncWebAuth()/syncAuthName() выше их не
   теряют, теряется только способ завести НОВУЮ такую сессию. window.onTelegramAuth (коллбэк
   виджета) убран вместе с ним — вызывать его больше некому. */

/* ---------- Второй вход: Discord (v1.52.0) ----------
   Кнопка появляется, только когда сервер настроен (public_config отдаёт client_id —
   он публичен по природе: виден в URL авторизации). Код живёт в адресной строке один раз,
   вычёркивается сразу; обмен кода на личность — только на сервере (секрет не покидает БД). */
let _dcCid=undefined; // undefined — ещё не спрашивали; null — не настроено
function syncDcClientId(){
  if(_dcCid!==undefined) return Promise.resolve(_dcCid);
  /* v1.282.13: серверная беда — тоже «спросим в следующий раз». Раньше сюда попадал
     любой не-ok ответ, включая 5xx, и «не настроено» запиралось в кэш до перезагрузки:
     кнопка Discord пропадала насовсем из-за одной минутной хандры сервера. А сервер
     отдаёт именно 503 not_configured, когда не смог прочитать токен, — попадание реальное.
     Кэшируем только осмысленный ответ; на 5xx бросаем в общий .catch, который не кэширует. */
  return syncPost({action:'public_config'})
    .then(r=>{ if(!r.ok){ if(r.status>=500) throw 0; return null; } return r.json().catch(()=>null); })
    .then(d=>{ _dcCid=(d && d.ok && d.discord_client_id) || null; return _dcCid; })
    .catch(()=>null); // сеть или сервер упали — не кэшируем, спросим в следующий раз
}
function dcMount(el){
  if(!el || typeof document==='undefined') return;
  // 30.08.2026: гонка — кнопка появляется только ПОСЛЕ ответа сети (до ~2.3с), а el.firstChild
  // (единственная защита от повтора в вызывающем коде) всё это время пуст. Второй вызов dcMount
  // в то же окно (например, второй gameOver() подряд) проходил мимо и запускал второй запрос
  // и вторую кнопку с своим слушателем. Флаг ставится синхронно, до await, закрывает гонку.
  if(el.firstChild || el.dataset.dcMounting) return;
  el.dataset.dcMounting='1';
  el.innerHTML='';
  syncDcClientId().then(cid=>{
    delete el.dataset.dcMounting;
    if(!cid || !el.isConnected) return;
    const b=document.createElement('button');
    b.className='btn ghost small dcBtn'; b.type='button'; b.innerHTML=ic('discord')+L.dcLogin;
    b.addEventListener('click',()=>dcGo(cid));
    el.appendChild(b);
  });
}
function dcGo(cid){ // уходим на Discord и вернёмся с ?code=
  if(typeof sfx==='function') sfx.click();
  const ru=location.origin+location.pathname;
  // v1.282.8 «Честный вход»: без state любой code в адресной строке принимался как свой.
  // Атака: злоумышленник сам проходит вход Discord у себя, получает код в URL и присылает
  // ЭТУ ссылку жертве — открыв её, жертва тихо входит в игру ПОД ЧУЖОЙ Discord-личностью,
  // весь её последующий прогресс уходит на чужой аккаунт. state — разовый ярлык этого
  // конкретного похода: сверяем на возврате, чужой code без нашего ярлыка молча игнорируем.
  const state=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():String(Math.random()).slice(2)+Date.now();
  /* 29.08.2026 «Google-вход молчал»: было sessionStorage — на реальном возврате с Google
     (владелец, HAR-журнал сети подтвердил: ни одного запроса к cosmogram-sync после
     возврата вообще не было) «бирка» похода не пережила переход. localStorage — тот же
     приём, но переживает более широкий круг накопителей/партиций браузера. */
  try{ localStorage.setItem('oauthState', JSON.stringify({state, provider:'dc'})); }catch(e){} // провайдер идёт вместе со state — возврат должен знать, чей это код
  location.href='https://discord.com/oauth2/authorize?client_id='+cid+'&response_type=code'+
    '&redirect_uri='+encodeURIComponent(ru)+'&scope=identify&state='+encodeURIComponent(state);
}
/* ---------- Третий вход: Google (23.08.2026) ----------
   Тот же протокол OAuth2, тот же порядок, что у Discord — тот же риск подмены,
   та же защита (state). Единственная разница — свой адрес авторизации и свой scope. */
let _gCid=undefined; // undefined — ещё не спрашивали; null — не настроено
function syncGClientId(){
  if(_gCid!==undefined) return Promise.resolve(_gCid);
  return syncPost({action:'public_config'})
    .then(r=>{ if(!r.ok){ if(r.status>=500) throw 0; return null; } return r.json().catch(()=>null); })
    .then(d=>{ _gCid=(d && d.ok && d.google_client_id) || null; return _gCid; })
    .catch(()=>null);
}
function gMount(el){
  if(!el || typeof document==='undefined') return;
  if(el.firstChild || el.dataset.gMounting) return; // 30.08.2026: см. коммент у dcMount — та же гонка, тот же фикс
  el.dataset.gMounting='1';
  el.innerHTML='';
  syncGClientId().then(cid=>{
    delete el.dataset.gMounting;
    if(!cid || !el.isConnected) return;
    const b=document.createElement('button');
    b.className='btn ghost small gBtn'; b.type='button'; b.innerHTML=ic('google')+L.gLogin;
    b.addEventListener('click',()=>gGo(cid));
    el.appendChild(b);
  });
}
function gGo(cid){ // уходим на Google и вернёмся с ?code=
  if(typeof sfx==='function') sfx.click();
  const ru=location.origin+location.pathname;
  const state=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():String(Math.random()).slice(2)+Date.now();
  try{ localStorage.setItem('oauthState', JSON.stringify({state, provider:'gg'})); }catch(e){} // 29.08.2026: см. коммент у dcGo — та же смена sessionStorage→localStorage
  location.href='https://accounts.google.com/o/oauth2/v2/auth?client_id='+cid+'&response_type=code'+
    '&redirect_uri='+encodeURIComponent(ru)+'&scope='+encodeURIComponent('openid profile')+'&state='+encodeURIComponent(state);
}
/* 29.08.2026 «Тишина при сбое входа» (владелец: «выбрал аккаунт — ничего не произошло»):
   раньше .catch(()=>{}) и молчаливый ранний return в syncBootOAuth ниже не оставляли
   игроку ни следа — ни тоста, ни ошибки. Причину найти труднее, а исправить не удастся,
   пока игрок вообще не знает, что что-то пошло не так. toast() — тот же приём, что уже
   есть у «Не хватает звёзд»; L может быть ещё не готов в этот самый ранний момент
   загрузки — оба обращения защищены проверкой typeof. */
function syncAuthFail(){
  if(typeof toast==='function' && typeof L!=='undefined' && L && L.authFailed) toast(L.authFailed,'rgba(255,159,176,.5)');
}
function syncDiscordCode(code, ru){ // возврат из Discord: код → сессия → мостик гостя
  return syncPost({action:'discord_login', code:code, redirect_uri:ru}).then(r=>r.ok?r.json():null).then(d=>{
    if(d && d.ok && d.dcAuth){
      Store.set('dcAuth',d.dcAuth);
      Store.set('syncQ',[]);
      syncSubmit(syncLocalScores());
      if(typeof syncAuthChanged==='function') syncAuthChanged();
    } else syncAuthFail();
  }).catch(syncAuthFail);
}
function syncGoogleCode(code, ru){ // 23.08.2026: возврат из Google — тот же путь, что у Discord
  return syncPost({action:'google_login', code:code, redirect_uri:ru}).then(r=>r.ok?r.json():null).then(d=>{
    if(d && d.ok && d.gAuth){
      Store.set('gAuth',d.gAuth);
      Store.set('syncQ',[]);
      syncSubmit(syncLocalScores());
      if(typeof syncAuthChanged==='function') syncAuthChanged();
    } else syncAuthFail();
  }).catch(syncAuthFail);
}
(function syncBootOAuth(){ // 23.08.2026: было syncBootDiscord — обобщено на любого OAuth2-гостя (Discord, Google, ...)
  try{
    const q=new URLSearchParams(location.search), code=q.get('code'), state=q.get('state');
    if(!code) return;
    const ru=location.origin+location.pathname;
    history.replaceState(null,'',ru); // код вычеркнут из адресной строки сразу
    // 29.08.2026: localStorage вместо sessionStorage — см. коммент у dcGo/gGo
    let saved=null; try{ saved=JSON.parse(localStorage.getItem('oauthState')||'null'); localStorage.removeItem('oauthState'); }catch(e){}
    if(!saved || !saved.state || state!==saved.state){
      /* 02.09.2026 «Диагностика молчаливого сбоя»: временный тост+консоль, снять после разбора
         живого бага (владелец: Google-вход никогда не засчитывается). syncAuthFail() сам не
         говорит, НА КАКОМ ИМЕННО шаге билет потерялся — не найден в localStorage вовсе (запись
         в gGo() могла молча упасть, try/catch там глотает ошибку) или найден, но state не совпал.
         Вторая попытка (v1.478.43): тост начинался теми же словами «Вход не удался», что и
         старый — глаз мог зацепиться за знакомую фразу и не долистать до сути за 1.5с, пока
         тост не погас (core.js:182). Слова теперь другие, плюс console.error — не гаснет,
         ждёт в DevTools сколько угодно. */
      const diag='ДИАГНОСТИКА БИЛЕТА: '+(saved?('найден, совпадает='+(state===saved.state)):'НЕ найден в localStorage');
      try{ console.error('[Cosmogram OAuth]', diag, {urlState:state, saved:saved}); }catch(e){}
      try{ if(typeof toast==='function') toast(diag, 'rgba(255,159,176,.5)'); }catch(e){}
      return;
    } // v1.282.8: чужой code без нашего ярлыка — не наш поход
    if(saved.provider==='dc') syncDiscordCode(code, ru);
    else if(saved.provider==='gg') syncGoogleCode(code, ru);
  }catch(e){
    /* 03.09.2026 «Тишина при реальном сбое»: этот catch ловит ЛЮБОЕ исключение во всей функции
       (например, history.replaceState() выше ничем не защищена) — раньше он просто показывал
       общий тост и молчал, какая ошибка произошла на самом деле. За сутки логов сервера — ни
       одного запроса google_login вообще, значит код падает ДО сети, где-то в этой функции, и
       без текста исключения дальше гадать бессмысленно. */
    try{ console.error('[Cosmogram OAuth] исключение в syncBootOAuth:', e && e.name, e && e.message, e); }catch(e2){}
    syncAuthFail();
  }
})();

/* Очередь в Store: переживает закрытие приложения */
function syncQueue(){ return saneArray(Store.get('syncQ',[]),[]); }
function syncEnqueue(scores){
  const q=syncQueue();
  // схлопываем: для каждой категории храним максимум (сервер монотонен, меньшее всё равно отбросит)
  const m={};
  for(const it of q) for(const c in it) m[c]=Math.max(m[c]||0, it[c]||0);
  for(const c in scores) m[c]=Math.max(m[c]||0, scores[c]||0);
  Store.set('syncQ',[m]);
}
function syncFetch(url, body){
  const ctl=(typeof AbortController==='function')?new AbortController():null;
  const t=ctl?setTimeout(()=>{ try{ctl.abort();}catch(e){} },POST_TIMEOUT):0;
  return fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json','apikey':SYNC_KEY},
    body:JSON.stringify(body), signal:ctl?ctl.signal:undefined})
    .finally(()=>{ if(t) clearTimeout(t); });
}
function syncPost(payload){
  const burnWeb=!syncInitData() && !!syncWebAuth(); // 401 по веб-сессии = подпись протухла (неделя) — сгорает, вход снова в один тап
  const burnDc=!syncInitData() && !syncWebAuth() && !!syncDcAuth(); // то же для сессии Discord
  return syncFetch(SYNC_URL,payload).then(r=>{
    if(r.status===401 && (burnWeb||burnDc)){
      if(burnWeb) Store.del('tgWebAuth');
      if(burnDc) Store.del('dcAuth');
      if(typeof syncAuthChanged==='function') syncAuthChanged();
    }
    return r;
  });
}

/* Отправка рекордов после забега. Тихая: никаких тостов/ошибок игроку.
   extra — разовые поля к этому забегу (duel_win: «я побил планку вызова»). */
function syncSubmit(scores, extra){
  syncEnqueue(scores);
  if(extra && Object.keys(extra).length) syncExtraEnqueue(extra);
  if(!syncAvailable()) return Promise.resolve();
  return syncFlush();
}
function syncExtraQueue(){ return saneArray(Store.get('syncExtraQ',[]),[]); }
function syncExtraEnqueue(extra){ Store.set('syncExtraQ',syncExtraQueue().concat([Object.assign({},extra)]).slice(-10)); }
/* v1.282.13: одна отправка за раз. Раньше два почти одновременных повода (посадка и
   мостик входа/Discord) читали одну и ту же очередь и слали батч дважды. Сервер к
   дублю почти терпим — он монотонен, — но антиспам на нём НЕ атомарен: читает
   last_submit, сверяет, потом пишет. Два запроса успевают прочитать старую метку и
   пройти оба, а разовые поля вроде duel_win уходят в бота дважды, и друг получает
   два уведомления об одной победе. Пока отправка в полёте — возвращаем её же промис. */
let _syncFlying=null;
function syncFlush(extra){
  if(!syncAvailable()) return Promise.resolve();
  /* v1.282.14: занятую линию НЕ подменяем чужим промисом, а становимся в очередь.
     Прошлая редакция возвращала промис уже летящей отправки — и это молча теряло вторую:
     её очки стирал завершающийся первый запрос (Store.set('syncQ',[])), а разовые поля
     (duel_win, ghost_beat) вообще нигде не хранятся, они живут только в аргументе.
     Живой сценарий: на старте идёт доотправка прошлой сессии (до 10с по таймауту), игрок
     за это время выигрывает дуэль — друг не получает уведомления вовсе. Плюс цепочка
     afterSubmit в gameOver резолвилась по чужому давнему запросу, и призрак снова уходил
     раньше рекорда, ради чего вся правка и делалась. */
  if(_syncFlying) return (_syncFlying = _syncFlying.catch(()=>{}).then(()=>syncFlush(extra)));
  if(typeof isLabEnv==='function' && isLabEnv()){ Store.set('syncQ',[]); return Promise.resolve(); } // v1.108.1: печать лаборатории — тестовый забег не долетает до боевого топа
  /* v1.282.20 «Ничья отправка не съедает чужую».
     Прошлая редакция чинила только половину беды: промис больше не подменялся, а очередь
     по-прежнему затиралась целиком (Store.set('syncQ',[])). Живой сценарий: на старте идёт
     доотправка прошлой сессии (до 10с), игрок за это время садится, выиграв дуэль. Его очки
     легли в очередь, вторая отправка встала в цепочку — и тут первая приходит с 200 и сносит
     запись второй. Цепочка просыпается, видит пустую очередь и выходит НЕ ОТПРАВИВ НИЧЕГО:
     вместе с очками теряются разовые поля, которые нигде больше не живут — duel_win (друг не
     узнаёт о победе), ghost_beat, паспорт забега и дневник дней.
     Лечим тем же приёмом, что уже выучен в «Почте неба»: вычитаем ровно доставленное, а не
     перезаписываем очередь. И extra отправляем ВСЕГДА — даже когда очков в очереди нет: разовые
     поля не имеют к очереди никакого отношения. */
  const q=syncQueue(), extraQ=syncExtraQueue();
  const batch=q.length?q[0]:{};
  const sentExtra=extraQ.length?extraQ[0]:(extra||{});
  const hasExtra=!!Object.keys(sentExtra).length;
  if(!q.length && !hasExtra) return Promise.resolve();
  const sent=batch;
  function drain(){ // вычесть доставленное: то, что положили ПОКА мы летели, остаётся в очереди
    const cur=syncQueue(); if(!cur.length) return;
    const m={}; for(const it of cur) for(const c in it) m[c]=Math.max(m[c]||0, it[c]||0);
    let left=false;
    for(const c in m){ if(m[c]>(sent[c]||0)) left=true; else delete m[c]; }
    Store.set('syncQ', left?[m]:[]);
  }
  function drainExtra(){ Store.set('syncExtraQ',syncExtraQueue().filter(x=>x!==sentExtra)); }
  const p=syncPost(Object.assign({action:'submit'}, syncAuth(), {scores:batch, lang:(typeof langEff!=='undefined'?langEff:'ru')}, sentExtra)).then(r=>{
    /* 27.08.2026 «Replay-защита записи рекорда»: 409 значит «этот же nonce уже обработан» —
       то есть более ранняя попытка ЭТОГО ЖЕ забега (см. runNonce в ui.js) уже долетела и
       была принята сервером, а её ответ до нас просто не дошёл (сеть оборвалась после того,
       как сервер записал, но раньше, чем клиент получил 200). Для очереди это тот же исход,
       что и honest ok — переотправлять больше нечего, а не «ошибка, попробуй ещё раз». */
    if(r.ok || r.status===401 || r.status===400 || r.status===409){ // принято (или отказ навсегда) — вычитаем доставленное
      drain();
      if(r.ok || r.status===400 || r.status===409) drainExtra();
    } else if(r.status===429){ drain(); } // extra остаётся: уведомление повторится после антифлуда
    // 5xx / сеть — оставляем в очереди до следующего gameOver
    /* v1.282.20: раньше отправка резолвилась пустотой — звавшему нечего было узнать об
       исходе. Дневнику это нужно: он вычёркивает дни только по ответу сервера. Возвращаем
       разобранное тело (или null), поведение очереди при этом не меняется ни на строку. */
    return r.ok ? r.json().catch(()=>null) : null;
  }).catch(()=>null /* офлайн: очередь ждёт */)
    .finally(()=>{ _syncFlying=null; }); // поводок снят — следующий забег отправит заново
  _syncFlying=p;
  return p;
}

/* Публичная витрина таблицы (13.08.2026). Отдельный адрес и отдельная функция на сервере —
   она умеет ТОЛЬКО читать. Временная: как только чтение переедет внутрь cosmogram-sync,
   здесь останется один адрес вместо двух. Форма ответа у обеих одна, поэтому разбор ниже
   не знает, откуда пришли данные, и знать не должен. */
const TOP_URL='https://cwpijvgdrrvnvldhnmbj.supabase.co/functions/v1/cosmogram-top';

/* Топ-100 + моё место. Возвращает Promise с данными или null.
   13.08.2026: гость больше не получает отказ. Раньше первая строка возвращала null без входа —
   и экран показывал «войди через Telegram» вместо пятнадцати живых игроков. Таблица рекордов
   публична по природе: её видит любой вошедший, и прятать её от невошедшего значило выдавать
   витрину за клуб. Своего места у гостя нет (сервер не знает, кто он) — его посчитает экран. */
function syncTop(category){
  if(!syncAvailable()){
    return syncFetch(TOP_URL,{category:category}).then(r=>{
      if(!r.ok) return null;
      return r.json().catch(()=>null);
    }).catch(()=>null);
  }
  return syncPost(Object.assign({action:'top', category:category}, syncAuth())).then(r=>{
    if(!r.ok) return null;
    return r.json().catch(()=>null);
  }).catch(()=>null);
}

/* ---------- Дуэль: вызов друга ----------
   Планка — верифицированный рекорд дистанции вызвавшего, живёт на сервере:
   цифру в ссылке подделать бессмысленно, её там просто нет. Только чтение. */
function syncMyId(){ try{ const u=tg && tg.initDataUnsafe && tg.initDataUnsafe.user; if(u && u.id) return u.id; }catch(e){}
  const w=syncWebAuth(); if(w) return w.id;
  const c=syncDcAuth(); if(c && c.pid) return c.pid; // у Discord-игрока — наш внутренний id из сессии
  const g=syncGAuth(); return g && g.pid ? g.pid : null; // 30.08.2026: тот же приём для Google — раньше здесь не проверялся, «Вызов» молчал именно для этого входа
}
function syncDuel(pid){
  if(!syncAvailable()) return Promise.resolve(null);
  return syncPost(Object.assign({action:'duel', player_id:pid}, syncAuth())).then(r=>{
    if(!r.ok) return null;
    return r.json().catch(()=>null);
  }).catch(()=>null);
}
function syncDuelAccept(pid){ // v1.108.1: сообщаем серверу о смене активного вызова — старый вызывающий
  // узнает, что его вызов заменили, а не потерян бесследно. Тихо, как syncSubmit: не блокирует UI,
  // не ждёт ответа — сам вызов уже применён локально к этому моменту (см. duelBoot → apply()).
  if(!syncAvailable()) return;
  syncPost(Object.assign({action:'duel_accept', challenger_pid:pid}, syncAuth())).catch(()=>{});
}

/* ---------- Эксклюзивные скины за Stars (04.09.2026) ----------
   Цена и название — только на сервере (PREMIUM_SKINS, cosmogram-sync), тело запроса шлёт
   только skinId. Сама оплата — Telegram.WebApp.openInvoice(link), не отсюда: этот вызов
   только получает ссылку на инвойс. Владение подтверждает исключительно сервер
   (premium_purchases) — S.ownedSkins для premium-id — локальный кэш последнего известного
   состояния, не источник истины. */
function syncBuySkinInvoice(skinId){
  if(!syncAvailable()) return Promise.resolve(null);
  return syncPost(Object.assign({action:'buy_skin_invoice', skinId:skinId}, syncAuth())).then(r=>{
    if(!r.ok) return null;
    return r.json().catch(()=>null);
  }).catch(()=>null);
}
function syncPremiumOwned(){
  if(!syncAvailable()) return Promise.resolve(null);
  return syncPost(Object.assign({action:'premium_owned'}, syncAuth())).then(r=>{
    if(!r.ok) return null;
    return r.json().catch(()=>null);
  }).catch(()=>null);
}

/* ---------- Призрак из топа: загрузка/скачивание треков ----------
   Сервер не даст загрузить трек сильнее верифицированного рекорда — подделка бессмысленна. */
function syncGhostUp(o){ // {category, track, skin, best, seed} — тихо, как syncSubmit
  if(!syncAvailable()) return Promise.resolve(false);
  return syncPost(Object.assign({action:'ghost_up',
    category:o.category, track:o.track, skin:o.skin, best:o.best, seed:o.seed, share:true}, syncAuth())).then(r=>r.ok).catch(()=>false);
}
function syncGhostGet(pid, cat){ // чужой трек: {ok,track,skin,best,name} | {ok:false} | null (сеть)
  if(!syncAvailable()) return Promise.resolve(null);
  return syncPost(Object.assign({action:'ghost_get', player_id:pid, category:cat}, syncAuth())).then(r=>{
    if(!r.ok) return null;
    return r.json().catch(()=>null);
  }).catch(()=>null);
}
/* 23.08.2026: syncGhostShare() убрана — тумблер приватности призрака отменён 22.08.2026
   («Призрак — улика, не украшение»), сервер теперь принимает старое действие лишь как
   пустышку для совместимости со старыми кэшами — новый код его больше не вызывает.
   Единственный вызов жил в устаревшем черновике ui_backup_before_ghost_fix.js, тоже убран. */

/* ---------- v1.100.1 «Трибуна чемпиона»: прыжки дня и спектакль лучшего ----------
   Отдельная комната на сервере (cosmogram-daily): таблица рекордов её не касается.
   Посадка дня шлёт результат и ленту (в коридорных координатах); трибуна отдаёт
   полёт лучшего — и только тому, кто сам сегодня прыгал: призрак не подсказка. */
const SYNC_DAILY_URL='https://cwpijvgdrrvnvldhnmbj.supabase.co/functions/v1/cosmogram-daily';
function syncDailyPost(payload){
  return syncFetch(SYNC_DAILY_URL,payload).catch(()=>null); // v1.282.13: тот же поводок, что у основной двери — без него запрос дня висел вечно
}
function syncDailyQueue(){ return saneArray(Store.get('dailyQ',[]),[]); }
function syncDailyEnqueue(o){
  if(!o || !o.day) return;
  const q=syncDailyQueue().filter(x=>x&&x.day!==o.day);
  q.push(Object.assign({},o));
  Store.set('dailyQ',q.slice(-14));
}
let _dailyFlying=null;
function syncDailyFlush(){
  // 30.08.2026: было симметрично со старой (уже исправленной) редакцией syncFlush — второй
  // вызов во время полёта первого получал ТОТ ЖЕ промис и молчал, второй (новый) счёт дня
  // не отправлялся автоматически следом, ждал следующего постороннего триггера. syncFlush
  // (выше в этом файле, v1.282.14) уже чинил ровно это — та же цепочка здесь.
  if(_dailyFlying) return (_dailyFlying = _dailyFlying.catch(()=>{}).then(()=>syncDailyFlush()));
  if(!syncAvailable() || (typeof navigator!=='undefined' && navigator.onLine===false)) return Promise.resolve(null);
  const q=syncDailyQueue(), item=q[0]; if(!item) return Promise.resolve(null);
  const p=syncDailyPost(Object.assign({action:'daily_submit'},syncAuth(),item)).then(r=>{
    if(!r || !r.ok) return null;
    Store.set('dailyQ',syncDailyQueue().filter(x=>x!==item));
    return r;
  }).catch(()=>null).finally(()=>{ _dailyFlying=null; });
  _dailyFlying=p; return p;
}
function syncDailySubmit(o){ // {day, score, skin, track?} — сохраняем до подтверждения сервера
  if(typeof isLabEnv==='function' && isLabEnv()) return Promise.resolve(false);
  syncDailyEnqueue(o);
  return syncDailyFlush().then(r=>!!(r&&r.ok));
}
if(typeof window!=='undefined'){
  window.addEventListener('online',()=>syncDailyFlush());
  setTimeout(()=>syncDailyFlush(),4000);
}
function syncDailyChampion(day){ // {ok,champion:{name,score,skin,track,me}} | {ok:false,reason} | null (сеть)
  if(!syncAvailable()) return Promise.resolve(null);
  return syncDailyPost(Object.assign({action:'daily_champion', day:day}, syncAuth())).then(r=>{
    if(!r || !r.ok) return null;
    return r.json().catch(()=>null);
  });
}
function syncDailyTop(day){ // 03.09.2026: {ok,day,top:[{pid,name,username,provider,best,me}],me:{rank,best}|null} — тот же контракт, что у syncTop()
  if(!syncAvailable()) return Promise.resolve(null);
  return syncDailyPost(Object.assign({action:'daily_top', day:day}, syncAuth())).then(r=>{
    if(!r || !r.ok) return null;
    return r.json().catch(()=>null);
  });
}
function syncDailyStats(day){ // v1.100.2: {ok, flyers, catchers} — «звезду взяли N из M»; та же дверь fly_first на сервере
  if(!syncAvailable()) return Promise.resolve(null);
  return syncDailyPost(Object.assign({action:'daily_stats', day:day}, syncAuth())).then(r=>{
    if(!r || !r.ok) return null;
    return r.json().catch(()=>null);
  });
}

/* 03.09.2026 «Спидран получает свою таблицу» — зеркало очереди daily_submit выше, но СВОЯ
   очередь (Store 'speedrunQ', свой _speedrunFlying): если переиспользовать dailyQ, забег дня
   и забег спидрана в один день затёрли бы друг друга — syncDailyEnqueue дедупит только по
   полю day, без различия действия. Тот же самый Edge Function (cosmogram-daily), другое
   действие в payload — новый URL не нужен. */
function syncSpeedrunQueue(){ return saneArray(Store.get('speedrunQ',[]),[]); }
function syncSpeedrunEnqueue(o){
  if(!o || !o.day) return;
  const q=syncSpeedrunQueue().filter(x=>x&&x.day!==o.day);
  q.push(Object.assign({},o));
  Store.set('speedrunQ',q.slice(-14));
}
let _speedrunFlying=null;
function syncSpeedrunFlush(){
  if(_speedrunFlying) return (_speedrunFlying = _speedrunFlying.catch(()=>{}).then(()=>syncSpeedrunFlush()));
  if(!syncAvailable() || (typeof navigator!=='undefined' && navigator.onLine===false)) return Promise.resolve(null);
  const q=syncSpeedrunQueue(), item=q[0]; if(!item) return Promise.resolve(null);
  const p=syncDailyPost(Object.assign({action:'speedrun_submit'},syncAuth(),item)).then(r=>{
    if(!r || !r.ok) return null;
    Store.set('speedrunQ',syncSpeedrunQueue().filter(x=>x!==item));
    return r;
  }).catch(()=>null).finally(()=>{ _speedrunFlying=null; });
  _speedrunFlying=p; return p;
}
function syncSpeedrunSubmit(o){ // {day, time_sec, skin, track?} — сохраняем до подтверждения сервера
  if(typeof isLabEnv==='function' && isLabEnv()) return Promise.resolve(false);
  syncSpeedrunEnqueue(o);
  return syncSpeedrunFlush().then(r=>!!(r&&r.ok));
}
if(typeof window!=='undefined'){
  window.addEventListener('online',()=>syncSpeedrunFlush());
  setTimeout(()=>syncSpeedrunFlush(),4000);
}
function syncSpeedrunTop(day){ // {ok,day,top:[{pid,name,username,provider,best,me}],me:{rank,best}|null} — тот же контракт, что у syncDailyTop()
  if(!syncAvailable()) return Promise.resolve(null);
  return syncDailyPost(Object.assign({action:'speedrun_top', day:day}, syncAuth())).then(r=>{
    if(!r || !r.ok) return null;
    return r.json().catch(()=>null);
  });
}

/* Текущие локальные рекорды пакетом — для отправки */
/* v1.282.20 «Заявка с потолком». Хранилище — не источник правды о забеге, а лишь
   средство восстановления после офлайна. Правдоподобие проверять обязан сервер, но
   отправлять заведомую чушь клиент не должен даже случайно: испорченный ключ
   (`bestDist:1e15`, отрицательное число) раньше уезжал в мировую таблицу как есть.
   Потолок выбран заведомо выше любого настоящего результата — он режет мусор и
   грубую подделку, а честному рекордсмену не мешает. */
const SCORE_CEIL=5000000;
function saneScore(v){ const n=saneNumber(v,0); return (isFinite(n)&&n>0) ? Math.min(Math.floor(n),SCORE_CEIL) : 0; }
function syncLocalScores(){
  return {
    gyro: saneScore(Store.get('bestGyro',0)),
    touch: saneScore(Store.get('bestTouch',0)),
    bullet: saneScore(Store.get('bestBullet',0)),
    dist: saneScore(Store.get('bestDist',0)),
    keys: saneScore(Store.get('bestKeys',0)),
    caravan: saneScore(Store.get('bestCaravan',0)) // 05.09.2026: единая таблица Caravan, не по управлению
  };
}
