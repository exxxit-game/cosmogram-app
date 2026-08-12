'use strict';
/* star.js — «Звезда-статус» (v1.98.0): свежий рекорд → фирменная искра в эмодзи-статус игрока.
   Тихая дверь на экране итога: видна лишь когда рекорд + Telegram 8.0+ + Premium + живая подпись.
   Церемония в три касания: мост спрашивает разрешение → сервер отдаёт custom_emoji_id искры
   (набор создаётся один раз на стороне бота) → мост надевает статус на 3 дня.
   Статус — награда, не украшение: гаснет сам, новый рекорд зажигает снова.
   Модуль не трогает ядро: одна точка входа starStatusGate(rec) зовётся из gameOver (ui.js). */

function starStatusSupported(){
  return typeof tg!=='undefined' && tg && tg.setEmojiStatus && tg.requestEmojiStatusAccess &&
    tg.initData && typeof tgv==='function' && tgv('8.0') && typeof SYNC_URL!=='undefined';
}
function starStatusGate(rec){ // rec — был ли этот забег рекордом (категория или дистанция)
  const b=$('statusBtn'); if(!b) return;
  const prem=typeof tg!=='undefined' && tg && tg.initDataUnsafe && tg.initDataUnsafe.user &&
    !!tg.initDataUnsafe.user.is_premium;
  b.classList.toggle('hidden', !(rec && prem && starStatusSupported()));
}
async function statusStarAsk(){
  const b=$('statusBtn'); if(!b || b._busy) return;
  if(typeof isLabEnv==='function' && isLabEnv()){ toast('Печать лаборатории: статус не меняем на верстаке'); return; } // v1.108.1
  b._busy=true;
  try{
    sfx.click();
    const allowed=await new Promise(res=>{ // мост спрашивает у Telegram: можно ли менять статус
      try{ tg.requestEmojiStatusAccess(ok=>res(!!ok)); }catch(e){ res(false); }
    });
    if(!allowed){ toast(L.statusStarDeny); haptic('error'); return; }
    const r=await fetch(SYNC_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'status_emoji',initData:tg.initData})});
    const ans=await r.json().catch(()=>({}));
    if(!r.ok || !ans.ok || !ans.emoji_id){ toast(L.statusStarErr); haptic('error'); return; }
    tg.setEmojiStatus(ans.emoji_id,{duration:259200},ok=>{ // 3 дня: награда за рекорд гаснет сама
      if(ok){ toast(L.statusStarOk); haptic('success'); b.classList.add('hidden'); // искра надета — дверь закрылась
        if(typeof BEACON!=='undefined') BEACON.signal('star_ok',''); } // v1.108.1: раньше не было подтверждения, что фича вообще у кого-то срабатывает
      else { toast(L.statusStarErr); haptic('error'); }
    });
  }catch(e){ toast(L.statusStarErr); haptic('error'); }
  finally{ b._busy=false; }
}
$('statusBtn').addEventListener('click', statusStarAsk);
