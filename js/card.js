'use strict';
/* ============================================================
   CARD v1.73.0 «Карточка для скриншота»: красивый итог забега —
   игрок сам жмёт скриншот и шлёт друзьям. Telegram не даёт мини-
   приложениям слать картинки без сервера бота, поэтому хитрость:
   мы рисуем карточку на весь экран, человек делает скриншот.
   Ноль инфраструктуры, текстовый шеринг не тронут.
   Зависит от core.js ($, L, fmtN), ui.js (setScreen, S).
   ============================================================ */
/* 23.08.2026: свой локальный wireOn — card.js грузится РАНЬШЕ ui.js (порядок в sw.js),
   значит общий wireOn() из ui.js ещё не объявлен в момент выполнения кода верхнего
   уровня этого файла (низ файла — привязка кнопок сразу при загрузке). Тот же приём,
   что и wireOn() в ui.js, но свой, без зависимости от порядка загрузки. */
function wireOnLocal(id, ev, fn){
  const el=$(id);
  if(el){ el.addEventListener(ev, fn); }
  else if(typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}

const cardData={ sc:0, rec:false, win:false, mode:'classic', mission:1, dist:0, stars:0, combo:0, custom:'' };
const cardImg=new Image(); let cardImgOk=false;
cardImg.onload=function(){ cardImgOk=true; };
cardImg.src='icons/icon-180.png'; // фирменный самолётик — тот же, что на иконке приложения

function cardCapture(sc,opts){ // вызывается из gameOver/mapOver, когда все флаги уже известны
  opts=opts||{};
  cardData.sc=sc; cardData.rec=!!opts.rec; cardData.win=!!opts.win;
  cardData.mode=S.mode||'classic'; cardData.mission=S.mission;
  cardData.dist=Math.floor(S.dist); cardData.stars=S.starsCollected;
  cardData.combo=S.comboMax; cardData.custom=S.customName||'';
}

function cardModeName(){
  const names={ classic:function(){return L.modeClassic;}, bullet:function(){return L.bullet;},
    speedrun:function(){return L.modeSpeedrun;}, daily:function(){return L.modeDaily;} };
  if(cardData.mode==='custom') return '«'+(cardData.custom||L.forgeDefName)+'»';
  return names[cardData.mode]?names[cardData.mode]():names.classic();
}

function cardDraw(){
  const cv=$('cardCanvas'); if(!cv) return;
  const x=cv.getContext('2d'), W=cv.width, H=cv.height;
  // --- небо: глубокий градиент + звёзды; сиды от счёта — карточка стабильна при переоткрытии
  const g=x.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#070b18'); g.addColorStop(.55,'#0b1626'); g.addColorStop(1,'#0d1a30');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  let seed=((cardData.sc+1)*7919+13)>>>0;
  const rnd=function(){ seed=(seed*1103515245+12345)>>>0; return seed/4294967296; };
  for(let i=0;i<110;i++){
    x.globalAlpha=.2+rnd()*.65; x.fillStyle=rnd()>.85?'#ffe9b8':'#dfe8ff';
    x.beginPath(); x.arc(rnd()*W,rnd()*H,rnd()*1.5+.3,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  x.textAlign='center'; x.textBaseline='alphabetic';
  // --- шапка
  x.fillStyle='#c9a45c'; x.font='600 24px "Exo 2",sans-serif';
  x.fillText('C O S M O G R A M',W/2,58);
  // --- самолётик в мягком сиянии
  const glow=x.createRadialGradient(W/2,160,8,W/2,160,110);
  glow.addColorStop(0,'rgba(140,170,255,.28)'); glow.addColorStop(1,'rgba(140,170,255,0)');
  x.fillStyle=glow; x.fillRect(W/2-120,40,240,240);
  if(cardImgOk){ // круглый клип: иконка как медальон в сиянии — квадратной подложки нет
    x.save();
    x.beginPath(); x.arc(W/2,160,62,0,6.283); x.clip();
    x.drawImage(cardImg,W/2-66,94,132,132);
    x.restore();
  }
  // --- счёт
  x.fillStyle='#f0c040'; x.font='800 92px "Exo 2",sans-serif';
  x.fillText(fmtN(cardData.sc),W/2,322);
  x.fillStyle=cardData.rec?'#ffd76a':'#8fa3c8'; x.font='500 23px "Exo 2",sans-serif';
  x.fillText((cardData.rec?L.cardRec:(cardData.win?L.forgeWin:cardModeName())).toUpperCase(),W/2,362);
  // --- разделитель
  x.strokeStyle='rgba(201,164,92,.4)'; x.lineWidth=1;
  x.beginPath(); x.moveTo(W/2-90,398); x.lineTo(W/2+90,398); x.stroke();
  // --- статы забега
  x.fillStyle='#dfe8ff'; x.font='500 25px "Exo 2",sans-serif';
  x.fillText((L.missionLbl+' '+cardData.mission+'  ·  '+fmtN(cardData.dist)+' '+(L.unitM||'м')).toUpperCase(),W/2,452);
  x.fillText('✦ '+cardData.stars+'  ·  ×'+cardData.combo,W/2,494);
  // --- призыв
  x.fillStyle='#c9a45c'; x.font='italic 500 24px "Exo 2",sans-serif';
  x.fillText(L.cardBeat.toUpperCase(),W/2,642);
  x.fillStyle='#5d6f92'; x.font='400 19px "Exo 2",sans-serif';
  x.fillText('@realcosmogrambot',W/2,682);
}

function cardOpen(){
  if(typeof document!=='undefined' && document.fonts && document.fonts.ready)
    document.fonts.ready.then(cardDraw); // Exo 2 локальный — к моменту финала загружен, но перестрахуемся
  cardDraw();
  cardChatGate(); // v1.97.0: золотая дверь решает, видна ли она в этой среде
  cardStoryGate(); // v1.97.1: и сторис-дверь рядом
  setScreen('card'); sfx.click(); haptic('light');
}
function cardFill(){ // подписи по языку (вызывается из applyLang)
  if(typeof L==='undefined'||!L.cardTitle) return;
  const t1=$('cardTitle'); if(t1) t1.textContent=L.cardTitle;
  const t2=$('cardHint'); if(t2) t2.textContent=L.cardHint;
  const t3=$('cardBtn'); if(t3) t3.textContent=L.cardBtn;
  if(L.cardChat){ const t4=$('cardChat'); if(t4) t4.textContent=L.cardChat; }
  if(L.cardStory){ const t5=$('cardStory'); if(t5) t5.textContent=L.cardStory; }
  if(L.cardSave){ const t6=$('cardSave'); if(t6) t6.textContent=L.cardSave; }
  if(L.cardShare){ const t7=$('cardShare'); if(t7) t7.textContent=L.cardShare; }
  const t8=$('cardBack'); if(t8) t8.textContent=L.back;
}
/* v1.96.0 «Одна дверь», шаг Б «Сохранить карточку»: PNG уходит файлом —
   в Telegram 8.0+ через tg.downloadFile, вне него — якорем download. Скриншот больше не обязателен. */
function cardSave(){
  const cv=$('cardCanvas'); if(!cv) return;
  let url=''; try{ url=cv.toDataURL('image/png'); }catch(e){ return; }
  const name='cosmogram-'+(cardData.sc||0)+'.png';
  if(typeof tg!=='undefined' && tg && tg.downloadFile && typeof tgv==='function' && tgv('8.0')){
    try{ tg.downloadFile({url:url,file_name:name},function(){ haptic('light'); }); sfx.click(); return; }catch(e){}
  }
  const a=document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove(); sfx.click(); haptic('light');
}
/* v1.97.0 «Живая карточка»: золотая дверь «В чат». PNG уходит на сервер (share_card),
   сервер готовит сообщение (savePreparedInlineMessage), игра шлёт его tg.shareMessage(id) —
   картинка с кнопкой «Играть» летит в чат сама, без скриншотов.
   Дверь видна только там, где мост умеет shareMessage (8.0+) и есть подпись initData. */
function cardChatGate(){
  const b=$('cardChat'); if(!b) return;
  const can=typeof tg!=='undefined' && tg && tg.shareMessage && tg.initData &&
    typeof tgv==='function' && tgv('8.0') && typeof SYNC_URL!=='undefined';
  b.classList.toggle('hidden', !can);
}
async function cardSend(){
  const b=$('cardChat'), cv=$('cardCanvas');
  if(!b||!cv||b._busy) return; b._busy=1;
  try{
    const png=cv.toDataURL('image/png');
    const caption=(typeof shareTextFor==='function')?shareTextFor():('Cosmogram: '+cardData.sc);
    const r=await syncFetch(SYNC_URL,{action:'share_card',initData:tg.initData,png,caption});
    const ans=await r.json();
    if(!r.ok||!ans.ok||!ans.id) throw new Error(ans.error||('http_'+r.status));
    tg.shareMessage(ans.id,function(ok){ if(ok){ haptic('success'); } });
    sfx.click();
  }catch(e){ if(typeof toast==='function') toast(L.cardChatErr||'Не вышло — сохрани файлом','rgba(255,159,176,.5)'); haptic('error'); }
  b._busy=0;
}
/* v1.97.1 «Сторис»: та же карточка — в истории. PNG → сервер (card_url) → публичный адрес →
   tg.shareToStory(media_url, {widget_link}) — у истории кнопка «Играть». Дорога уже построена шагом Г. */
function cardStoryGate(){
  const b=$('cardStory'); if(!b) return;
  const can=typeof tg!=='undefined' && tg && tg.shareToStory && tg.initData &&
    typeof tgv==='function' && tgv('7.8') && typeof SYNC_URL!=='undefined';
  b.classList.toggle('hidden', !can);
}
async function cardStory(){
  const b=$('cardStory'), cv=$('cardCanvas');
  if(!b||!cv||b._busy) return; b._busy=1;
  try{
    const png=cv.toDataURL('image/png');
    const r=await syncFetch(SYNC_URL,{action:'card_url',initData:tg.initData,png});
    const ans=await r.json();
    if(!r.ok||!ans.ok||!ans.url) throw new Error(ans.error||('http_'+r.status));
    tg.shareToStory(ans.url,{widget_link:{url:'https://t.me/realcosmogrambot/app',name:L.cardStoryBtn||'Играть'}});
    sfx.click(); haptic('light');
  }catch(e){ if(typeof toast==='function') toast(L.cardChatErr||'Не вышло — сохрани файлом','rgba(255,159,176,.5)'); haptic('error'); }
  b._busy=0;
}
/* v1.96.0 «Одна дверь», шаг В: тихая текстовая дверь живёт внутри карточки.
   Особая вода: на своей трассе шлём саму трассу (mapShare) — восторг заразителен сразу полётом. */
function cardShare(){
  if(S.mode==='custom' && typeof mapShare==='function'){ sfx.click(); mapShare(); return; }
  shareScore();
}
wireOnLocal('cardBtn','click',cardOpen);
wireOnLocal('cardChat','click',cardSend);
wireOnLocal('cardStory','click',cardStory);
wireOnLocal('cardSave','click',cardSave);
wireOnLocal('cardShare','click',cardShare);
wireOnLocal('cardBack','click',function(){ sfx.click(); setScreen('over'); });
cardChatGate(); // при загрузке: среда уже известна
cardStoryGate(); // и сторис-дверь при загрузке
