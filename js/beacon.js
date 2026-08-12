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
  const seen=new Set(); let flushing=false, calN=0, calStormed=false;

  function on(){ return Store.get('beaconOn',1)===1; }
  /* Печать лаборатории (v1.108.0): верстак молчит — письма только с настоящего неба.
     Страж почты носит пропуск: window.__beaconLab=true снимает печать. */
  const LAB=(()=>{ try{ const h=location.hostname;
    return h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'; }catch(e){ return false; } })();
  function sealed(){ return LAB && !(typeof window!=='undefined' && window.__beaconLab===true); }
  function anon(){ let a=Store.get('beaconAnon',null);
    if(!a){ a=Math.random().toString(36).slice(2,10); Store.set('beaconAnon',a); } return a; }
  function postcard(kind,msg){
    let verdict='', tail='';
    try{ verdict=bbVerdict(); }catch(e){}
    try{ tail=BB._tape().slice(-12).map(e=>'['+e.t+'] '+e.ev+(e.d?': '+e.d:'')).join('\n'); }catch(e){}
    let pf='?'; try{ pf=(typeof tg!=='undefined'&&tg&&tg.platform)||navigator.platform||'?'; }catch(e){}
    return { v:(typeof GAME_VERSION!=='undefined'?GAME_VERSION:'?'), pf:pf, kind:kind,
      msg:String(msg==null?'':msg).slice(0,300), verdict:verdict, tail:tail,
      ua:(navigator.userAgent||'').slice(0,200), anon:anon(), ts:Date.now() };
  }
  async function send(pc){
    const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pc)});
    return !!(r&&r.ok);
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

  async function flush(){ if(flushing||!on()||sealed()) return; flushing=true; // печать: с верстака не летит
    try{
      const q=Store.get('beaconQ',[]); const left=[];
      for(const pc of q){
        let okSend=false;
        try{ okSend=await send(pc); }catch(e){}
        if(okSend){ note(); }
        else left.push(pc);
      }
      Store.set('beaconQ',left.slice(-10));
    } finally{ flushing=false; }
  }
  function drop(kind,msg){ if(!on()||sealed()) return; // выкл значит выкл: ни писем, ни очереди; печать — то же молчание
    const key=kind+'|'+String(msg==null?'':msg).slice(0,60);
    if(seen.has(key)) return; seen.add(key); // дедуп: одна ошибка — одно письмо за сессию
    const q=Store.get('beaconQ',[]); q.push(postcard(kind,msg));
    Store.set('beaconQ',q.slice(-10)); // очередь — не архив: десять последних
    flush();
  }
  // падения борта — те же события, что пишет самописец (свои слушатели, чужой мост не трогаем)
  window.addEventListener('error',e=>{ if(e&&e.message) drop('error',e.message); });
  window.addEventListener('unhandledrejection',e=>drop('error','promise: '+String(e&&e.reason)));

  /* сигналы-симптомы — крючки-однострочники зовут оттуда, где родился симптом:
     gfx_fix (нажал «Снизить графику» — кадры болели), liar (суд нашёл лжеца —
     датчик врёт), cal_storm (калибруется без конца — ноль не держится) */
  function signal(kind,msg){ drop('signal',kind+(msg?': '+msg:'')); }
  function calTick(){ calN++; if(calN>=5&&!calStormed){ calStormed=true; signal('cal_storm','calReset ×'+calN+' за сессию'); } }

  setTimeout(flush,4000); // доотправка очереди прошлой сессии — как syncFlush
  return { signal, calTick, _flush:flush, _state:()=>({q:Store.get('beaconQ',[]).length,on:on(),seen:seen.size}) };
})();
