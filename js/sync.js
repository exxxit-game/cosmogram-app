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
const TG_BOT_USERNAME='realcosmogrambot'; // Login Widget: вход из браузера в ту же таблицу (v1.51.0 «Одна таблица»)

/* ---------- Два входа, одна таблица (v1.51.0) ----------
   initData — внутри мини-аппа; webAuth — Telegram Login Widget в браузере.
   Анонимов в таблице нет и не будет: ник без подписи = флуд и стертое доверие. */
function syncInitData(){ return (tg && tg.initData) || null; } // подпись есть только внутри Telegram
function syncWebAuth(){ const w=Store.get('tgWebAuth',null); return (w && w.id && w.hash) ? w : null; } // веб-сессия виджета (живёт ~неделю, потом вход в один тап)
function syncDcAuth(){ const w=Store.get('dcAuth',null); return (w && w.sess) ? w : null; } // сессия Discord: HMAC-подпись нашего сервера (v1.52.0 «Второй вход»)
function syncAuth(){ const d=syncInitData(); if(d) return {initData:d}; const w=syncWebAuth(); if(w) return {webAuth:w}; const c=syncDcAuth(); if(c) return {dcAuth:c}; return null; }
function syncAvailable(){ return !!syncAuth(); }
function syncAuthName(){ // имя для «ты в таблице как …»
  try{ const u=tg && tg.initDataUnsafe && tg.initDataUnsafe.user; if(u && u.first_name) return String(u.first_name); }catch(e){}
  const w=syncWebAuth(); if(w) return String(w.first_name||'Игрок');
  const c=syncDcAuth(); return c ? String(c.name||'Игрок') : null;
}

/* Кнопка входа Telegram (только браузер): виджет сам рисует себя в контейнере.
   Требует /setdomain у BotFather для домена, где живёт игра. */
function tgWidgetMount(el){
  if(!el || typeof document==='undefined') return false;
  el.innerHTML=''; el.classList.remove('wgOff');
  const s=document.createElement('script');
  s.src='https://telegram.org/js/telegram-widget.js?22';
  s.async=true;
  s.setAttribute('data-telegram-login',TG_BOT_USERNAME);
  s.setAttribute('data-size','medium');
  s.setAttribute('data-userpic','false');
  s.setAttribute('data-onauth','onTelegramAuth(user)');
  el.appendChild(s);
  // v1.84.0 «Финал в полголоса»: домен не привязан (/setdomain) — виджет пишет игроку сырой
  // «Bot domain invalid». Это не для сцены: если за 5с кнопка-iframe не родилась — тишина,
  // а в сервисный центр уходит тихая строка диагностики.
  setTimeout(()=>{ if(el.isConnected && !el.querySelector('iframe')){ el.classList.add('wgOff'); window.__tgWgSilent=1; } },5000);
  return true;
}
window.onTelegramAuth=function(u){ // ответ виджета — уже подписан Telegram, сервер проверит HMAC
  if(!u || !u.id || !u.hash) return;
  Store.set('tgWebAuth',u);
  Store.set('syncQ',[]); // чистим, чтобы залить свежие локальные максимумы гостя
  syncSubmit(syncLocalScores()); // гостевой мостик: полёты встают в общую таблицу (сервер монотонен)
  if(typeof syncAuthChanged==='function') syncAuthChanged();
};

/* ---------- Второй вход: Discord (v1.52.0) ----------
   Кнопка появляется, только когда сервер настроен (public_config отдаёт client_id —
   он публичен по природе: виден в URL авторизации). Код живёт в адресной строке один раз,
   вычёркивается сразу; обмен кода на личность — только на сервере (секрет не покидает БД). */
let _dcCid=undefined; // undefined — ещё не спрашивали; null — не настроено
function syncDcClientId(){
  if(_dcCid!==undefined) return Promise.resolve(_dcCid);
  return syncPost({action:'public_config'}).then(r=>r.ok?r.json():null)
    .then(d=>{ _dcCid=(d && d.ok && d.discord_client_id) || null; return _dcCid; })
    .catch(()=>null); // сеть упала — не кэшируем, спросим в следующий раз
}
function dcMount(el){
  if(!el || typeof document==='undefined') return;
  el.innerHTML='';
  syncDcClientId().then(cid=>{
    if(!cid || !el.isConnected) return;
    const b=document.createElement('button');
    b.className='btn ghost small dcBtn'; b.type='button'; b.textContent=L.dcLogin;
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
  try{ sessionStorage.setItem('dcState',state); }catch(e){}
  location.href='https://discord.com/oauth2/authorize?client_id='+cid+'&response_type=code'+
    '&redirect_uri='+encodeURIComponent(ru)+'&scope=identify&state='+encodeURIComponent(state);
}
function syncDiscordCode(code, ru){ // возврат из Discord: код → сессия → мостик гостя
  return syncPost({action:'discord_login', code:code, redirect_uri:ru}).then(r=>r.ok?r.json():null).then(d=>{
    if(d && d.ok && d.dcAuth){
      Store.set('dcAuth',d.dcAuth);
      Store.set('syncQ',[]);
      syncSubmit(syncLocalScores());
      if(typeof syncAuthChanged==='function') syncAuthChanged();
    }
  }).catch(()=>{});
}
(function syncBootDiscord(){
  try{
    const q=new URLSearchParams(location.search), code=q.get('code'), state=q.get('state');
    if(!code) return;
    const ru=location.origin+location.pathname;
    history.replaceState(null,'',ru); // код вычеркнут из адресной строки сразу
    let expected=null; try{ expected=sessionStorage.getItem('dcState'); sessionStorage.removeItem('dcState'); }catch(e){}
    if(!expected || state!==expected) return; // v1.282.8: чужой code без нашего ярлыка — не наш поход, молчим
    syncDiscordCode(code, ru);
  }catch(e){}
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
function syncPost(payload){
  const burnWeb=!syncInitData() && !!syncWebAuth(); // 401 по веб-сессии = подпись протухла (неделя) — сгорает, вход снова в один тап
  const burnDc=!syncInitData() && !syncWebAuth() && !!syncDcAuth(); // то же для сессии Discord
  return fetch(SYNC_URL,{method:'POST',
    headers:{'Content-Type':'application/json','apikey':SYNC_KEY},
    body:JSON.stringify(payload)}).then(r=>{
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
  if(!syncAvailable()) return Promise.resolve();
  syncEnqueue(scores);
  return syncFlush(extra);
}
function syncFlush(extra){
  if(!syncAvailable()) return Promise.resolve();
  if(typeof isLabEnv==='function' && isLabEnv()){ Store.set('syncQ',[]); return Promise.resolve(); } // v1.108.1: печать лаборатории — тестовый забег не долетает до боевого топа
  const q=syncQueue(); if(!q.length) return Promise.resolve();
  const batch=q[0];
  return syncPost(Object.assign({action:'submit'}, syncAuth(), {scores:batch, lang:(typeof langEff!=='undefined'?langEff:'ru')}, extra||{})).then(r=>{
    if(r.ok || r.status===401 || r.status===400){ // принято (или отказ навсегда) — очередь чистим
      Store.set('syncQ',[]);
    } else if(r.status===429){ Store.set('syncQ',[]); } // антиспам: следующий забег отправит свежее, старое не важно
    // 5xx / сеть — оставляем в очереди до следующего gameOver
  }).catch(()=>{ /* офлайн: очередь ждёт */ });
}

/* Топ-100 + моё место. Возвращает Promise с данными или null. */
function syncTop(category){
  if(!syncAvailable()) return Promise.resolve(null);
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
  const c=syncDcAuth(); return c && c.pid ? c.pid : null; // у Discord-игрока — наш внутренний id из сессии
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
function syncGhostShare(share){ // приватность: выкл — сервер удаляет мои треки сразу
  if(!syncAvailable()) return Promise.resolve(false);
  return syncPost(Object.assign({action:'ghost_share', share:!!share}, syncAuth())).then(r=>r.ok).catch(()=>false);
}

/* ---------- v1.100.1 «Трибуна чемпиона»: прыжки дня и спектакль лучшего ----------
   Отдельная комната на сервере (cosmogram-daily): таблица рекордов её не касается.
   Посадка дня шлёт результат и ленту (в коридорных координатах); трибуна отдаёт
   полёт лучшего — и только тому, кто сам сегодня прыгал: призрак не подсказка. */
const SYNC_DAILY_URL='https://cwpijvgdrrvnvldhnmbj.supabase.co/functions/v1/cosmogram-daily';
function syncDailyPost(payload){
  return fetch(SYNC_DAILY_URL,{method:'POST',
    headers:{'Content-Type':'application/json','apikey':SYNC_KEY},
    body:JSON.stringify(payload)}).catch(()=>null);
}
function syncDailySubmit(o){ // {day, score, skin, track?} — тихо, как вся синхронизация
  if(!syncAvailable()) return Promise.resolve(false);
  return syncDailyPost(Object.assign({action:'daily_submit'}, syncAuth(), o)).then(r=>!!(r&&r.ok));
}
function syncDailyChampion(day){ // {ok,champion:{name,score,skin,track,me}} | {ok:false,reason} | null (сеть)
  if(!syncAvailable()) return Promise.resolve(null);
  return syncDailyPost(Object.assign({action:'daily_champion', day:day}, syncAuth())).then(r=>{
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

/* Текущие локальные рекорды пакетом — для отправки */
function syncLocalScores(){
  return {
    gyro: saneNumber(Store.get('bestGyro',0),0),
    touch: saneNumber(Store.get('bestTouch',0),0),
    bullet: saneNumber(Store.get('bestBullet',0),0),
    dist: saneNumber(Store.get('bestDist',0),0),
    keys: saneNumber(Store.get('bestKeys',0),0)
  };
}
