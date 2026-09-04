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

function cardCapture(sc,opts){ // вызывается из gameOver/mapOver, когда все флаги уже известны
  opts=opts||{};
  cardData.sc=sc; cardData.rec=!!opts.rec; cardData.win=!!opts.win;
  cardData.mode=S.mode||'classic'; cardData.mission=S.mission;
  cardData.dist=Math.floor(S.dist); cardData.stars=S.starsCollected;
  cardData.combo=S.comboMax; cardData.custom=S.customName||'';
}

function cardModeName(){
  const names={ classic:function(){return L.modeClassic;},
    speedrun:function(){return L.modeSpeedrun;}, daily:function(){return L.modeDaily;},
    caravan:function(){return L.modeCaravan;} }; // 05.09.2026
  if(cardData.mode==='custom') return '«'+(cardData.custom||L.forgeDefName)+'»';
  return names[cardData.mode]?names[cardData.mode]():names.classic();
}

/* ---------- Редизайн 01.09.2026 (владелец, макет macet-01-09-karta-redkoe-yavlenie.html) ----------
   Тот же визуальный язык (рамка+звёзды+свечение, самолёт в разрыве лучей), но текст и цвет
   рамки управляются ТОЛЬКО честными данными cardData (rec/win/mode) — никакой придуманной
   «редкости»/«явления». Круглая иконка-медальон (icon-180.png) заменена настоящим силуэтом
   самолёта — теми же координатами, что render.js:drawPlane, и настоящим скином игрока
   (SKINS[S.skin]), не всегда дефолтным бумажным. Статы упрощены до одной дистанции — волна/
   звёзды/комбо были жаргоном, непонятным тому, кто не играл (владелец, 31.08.2026). */
function cardRR(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }
function cardStar4(x,cx,cy,r){ x.beginPath();
  x.moveTo(cx,cy-r); x.bezierCurveTo(cx+r*.12,cy-r*.12,cx+r*.88,cy-r*.88,cx+r,cy);
  x.bezierCurveTo(cx+r*.12,cy+r*.12,cx+r*.88,cy+r*.88,cx,cy+r);
  x.bezierCurveTo(cx-r*.12,cy+r*.12,cx-r*.88,cy+r*.88,cx-r,cy);
  x.bezierCurveTo(cx-r*.12,cy-r*.12,cx-r*.88,cy-r*.88,cx,cy-r); x.closePath(); }
function cardFitText(x,text,maxW,startPx,minPx,weight,family){
  let px=startPx; x.font=weight+' '+px+'px "'+family+'"';
  while (x.measureText(text).width>maxW && px>minPx){ px-=1; x.font=weight+' '+px+'px "'+family+'"'; }
  return px;
}
function cardStarSprite(tint){
  const c=document.createElement('canvas'); c.width=c.height=24;
  const g=c.getContext('2d');
  const col=tint==='w'?'255,247,228':tint==='c'?'186,230,255':'218,230,255';
  const rg=g.createRadialGradient(12,12,0,12,12,12);
  rg.addColorStop(0,'rgba('+col+',1)'); rg.addColorStop(.35,'rgba('+col+',.8)'); rg.addColorStop(1,'rgba('+col+',0)');
  g.fillStyle=rg; g.fillRect(0,0,24,24);
  return c;
}
const _cardStarSprites={w:cardStarSprite('w'),c:cardStarSprite('c'),b:cardStarSprite('b')};
function cardBakeNebula(W,H,seed){
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const x=c.getContext('2d');
  const rnd0=(function(s){ let v=s>>>0||1; return function(){ v=(v*1664525+1013904223)>>>0; return v/4294967296; }; })(seed*13+7);
  const h1=232, h2=200;
  const bg=x.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,`hsl(${h1},62%,10%)`); bg.addColorStop(.55,`hsl(${h1},58%,16%)`); bg.addColorStop(1,`hsl(${h2},70%,26%)`);
  x.fillStyle=bg; x.fillRect(0,0,W,H);
  x.globalCompositeOperation='lighter';
  const blobs=[
    {bx:.18,by:.14,r:.55,hue:h1+30,a:.30},{bx:.78,by:.32,r:.48,hue:h2+50,a:.24},
    {bx:.28,by:.42,r:.5,hue:h1+300,a:.18},{bx:.62,by:.6,r:.42,hue:h1+285,a:.16},
    {bx:.12,by:.68,r:.46,hue:h2+150,a:.20},{bx:.85,by:.78,r:.4,hue:h1+40,a:.14},
    {bx:.5,by:.24,r:.34,hue:h1+40,a:.20},
  ];
  for(const b of blobs){
    const cx=b.bx*W+(rnd0()-.5)*40, cy=b.by*H+(rnd0()-.5)*40, r=b.r*Math.max(W,H)*.55;
    const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,`hsla(${b.hue},75%,60%,${b.a})`); g.addColorStop(.5,`hsla(${b.hue+18},70%,45%,${b.a*.5})`); g.addColorStop(1,'transparent');
    x.fillStyle=g; x.fillRect(0,0,W,H);
  }
  x.globalCompositeOperation='source-over';
  const rnd1=(function(s){ let v=s>>>0||1; return function(){ v=(v*1664525+1013904223)>>>0; return v/4294967296; }; })(seed*7+3);
  for(let i=0;i<260;i++){ x.globalAlpha=.04+rnd1()*.10; x.fillStyle=rnd1()<.8?'#dfe9ff':'#ffe9c8';
    const sz=.5+rnd1()*1.1; x.fillRect(rnd1()*W,rnd1()*H,sz,sz); }
  x.globalAlpha=1;
  const vg=x.createRadialGradient(W/2,H*0.4,H*0.2,W/2,H*0.4,H*0.78);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.5)');
  x.fillStyle=vg; x.fillRect(0,0,W,H);
  return c;
}
function cardDrawPlane(x, cx, cy, scale, skin){
  x.save(); x.translate(cx,cy); x.scale(scale,scale);
  const cone=x.createLinearGradient(0,10,0,150);
  cone.addColorStop(0,'rgba(190,220,255,.28)'); cone.addColorStop(1,'rgba(190,220,255,0)');
  x.fillStyle=cone;
  x.beginPath(); x.moveTo(-6,10); x.lineTo(6,10); x.lineTo(34,150); x.lineTo(-34,150); x.closePath(); x.fill();
  x.fillStyle=skin.body;
  x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
  x.fillStyle=skin.fold;
  x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
  x.strokeStyle='rgba(255,255,255,.32)'; x.lineWidth=1.1;
  x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.moveTo(0,-22); x.lineTo(16,14); x.stroke();
  x.fillStyle=skin.trail+'.95)';
  x.beginPath(); x.arc(0,11,2.8,0,6.283); x.fill();
  x.restore();
}
function cardDrawReveal(x,cx,cy,glow){
  const rays=14, baseR=48, len=78;
  x.save();
  for(let i=0;i<rays;i++){
    const ang=(i/rays)*6.283;
    const r2=baseR+len*0.82;
    const g=x.createLinearGradient(cx+Math.cos(ang)*baseR,cy+Math.sin(ang)*baseR,cx+Math.cos(ang)*r2,cy+Math.sin(ang)*r2);
    g.addColorStop(0,'rgba('+glow+',.5)'); g.addColorStop(1,'rgba('+glow+',0)');
    x.strokeStyle=g; x.lineWidth=2.2;
    x.beginPath(); x.moveTo(cx+Math.cos(ang)*baseR,cy+Math.sin(ang)*baseR); x.lineTo(cx+Math.cos(ang)*r2,cy+Math.sin(ang)*r2); x.stroke();
  }
  const core=x.createRadialGradient(cx,cy,4,cx,cy,baseR+10);
  core.addColorStop(0,'rgba('+glow+',.35)'); core.addColorStop(1,'rgba('+glow+',0)');
  x.fillStyle=core; x.beginPath(); x.arc(cx,cy,baseR+10,0,6.283); x.fill();
  x.restore();
}
function cardIconRuler(x, cx, cy, s, col){
  x.save(); x.translate(cx-s/2,cy-s/2); x.scale(s/24,s/24);
  x.lineWidth=1.8; x.lineCap='round'; x.lineJoin='round';
  x.fillStyle=col; x.beginPath(); x.arc(4.5,19.5,1.3,0,6.283); x.fill();
  x.strokeStyle='#9fe8ff';
  x.beginPath(); x.moveTo(6.5,17.7); x.lineTo(8.3,15.9); x.moveTo(10.1,14.1); x.lineTo(11.9,12.3);
  x.moveTo(13.7,10.5); x.lineTo(15.5,8.7); x.moveTo(17.3,6.9); x.lineTo(18.7,5.5); x.stroke();
  x.strokeStyle='#c9a45c';
  x.beginPath(); x.moveTo(15.3,4.3); x.lineTo(19,3.2); x.lineTo(17.9,6.9); x.stroke();
  x.restore();
}
function cardDraw(){
  const cv=$('cardCanvas'); if(!cv) return;
  const x=cv.getContext('2d'), W=cv.width, H=cv.height;
  const seed=((cardData.sc+1)*7919+13)>>>0;
  const rnd=(function(s){ let v=s>>>0||1; return function(){ v=(v*1664525+1013904223)>>>0; return v/4294967296; }; })(seed*3+1);

  // --- честный статус: рекорд — золото, всё остальное (победа/обычный режим) — нейтральный
  // синий, тот же выбор цвета, что был у старой карточки (строка 71, теперь просто перенесён
  // на рамку, не выдуман заново)
  const isRec=!!cardData.rec;
  const tierA=isRec?'#ffd76a':'#8fa3c8', tierGlow=isRec?'255,210,110':'150,165,200';
  const badgeTxt=(isRec?L.cardRec:(cardData.win?L.forgeWin:cardModeName())).toUpperCase();

  x.drawImage(cardBakeNebula(W,H,seed),0,0);
  for(let i=0;i<90;i++){
    const sx=rnd()*W, sy=rnd()*H, z=.2+rnd()*.8, sz=(1+rnd()*1.6)*(z>0.82?5.6:4);
    const tint=rnd()<.16?'w':(rnd()<.4?'c':'b');
    x.globalAlpha=Math.max(.15,.35+z*.5);
    x.drawImage(_cardStarSprites[tint],sx-sz/2,sy-sz/2,sz,sz);
  }
  x.globalAlpha=1;
  x.textAlign='center'; x.textBaseline='alphabetic';

  // --- рамка-бейдж статуса — вычислена из размера текста (та же формула, что в одобренном макете)
  const badgePx=cardFitText(x,badgeTxt,W-150,32,20,'700','Exo 2');
  const badgeHalf=x.measureText(badgeTxt).width/2;
  const starR=badgePx*0.24, starOffset=badgeHalf+22, EDGE_PAD=17;
  const frameHalfW=starOffset+starR+EDGE_PAD;
  const capH=badgePx*0.72, descH=badgePx*0.22, V_PAD=15;
  const baseline=64, frameY=baseline-capH-V_PAD, frameH=capH+descH+V_PAD*2;
  x.save();
  x.shadowColor='rgba('+tierGlow+',.55)'; x.shadowBlur=16;
  cardRR(x,W/2-frameHalfW,frameY,frameHalfW*2,frameH,frameH/2);
  x.fillStyle='rgba(10,14,28,.55)'; x.fill();
  x.lineWidth=1.5; x.strokeStyle=tierA; x.stroke();
  x.shadowBlur=0;
  cardRR(x,W/2-frameHalfW+3,frameY+3,frameHalfW*2-6,frameH-6,frameH/2-3);
  x.lineWidth=1; x.strokeStyle='rgba(255,255,255,.18)'; x.stroke();
  x.restore();
  x.shadowColor='rgba('+tierGlow+',.75)'; x.shadowBlur=20;
  x.fillStyle=tierA;
  x.fillText(badgeTxt,W/2,baseline);
  x.shadowBlur=0;
  [-1,1].forEach(function(side){
    const sx=W/2+side*starOffset, sy=baseline-badgePx*0.34;
    const g=x.createRadialGradient(sx,sy,0,sx,sy,14);
    g.addColorStop(0,'rgba(240,192,64,.55)'); g.addColorStop(1,'rgba(240,192,64,0)');
    x.fillStyle=g; x.beginPath(); x.arc(sx,sy,14,0,6.283); x.fill();
    cardStar4(x,sx,sy,badgePx*0.24); x.fillStyle='#f0c040'; x.fill();
  });

  // --- самолёт в разрыве лучей — настоящий скин игрока, не всегда бумажный
  const skin=(typeof SKINS!=='undefined' && SKINS[S.skin])||(typeof SKINS!=='undefined' && SKINS[0])||{body:'#efeee9',fold:'#cdcabf',trail:'rgba(200,198,190,'};
  cardDrawReveal(x,W/2,238,tierGlow);
  cardDrawPlane(x,W/2,244,1.7,skin);

  // --- счёт: как и раньше, честный герой карточки
  x.fillStyle='#f0c040'; x.font='800 88px "Exo 2",sans-serif';
  x.shadowColor='rgba(240,192,64,.35)'; x.shadowBlur=14;
  x.fillText(fmtN(cardData.sc),W/2,404);
  x.shadowBlur=0;

  x.strokeStyle='rgba(201,164,92,.35)'; x.lineWidth=1;
  x.beginPath(); x.moveTo(W/2-80,432); x.lineTo(W/2+80,432); x.stroke();

  // --- дистанция — единственный стат, понятный тому, кто не играл (владелец, 31.08.2026:
  // «волна 5? о чём это»; звёзды/комбо — тот же жаргон, тоже убраны)
  cardIconRuler(x,W/2-66,460,20,'#dfe8ff');
  x.fillStyle='#dfe8ff'; x.font='600 24px "Exo 2",sans-serif'; x.textAlign='left';
  x.fillText(fmtN(cardData.dist)+' '+(L.unitM||'м'),W/2-44,467);
  x.textAlign='center';

  // --- бренд + ссылка — внизу, в золоте (не блёклые, владелец 01.09.2026)
  cardStar4(x,W/2-52,660,4.5); x.fillStyle='#f0c040'; x.fill();
  x.fillStyle='#ffd76a'; x.font='600 15px "Exo 2",sans-serif'; x.letterSpacing='.1em';
  x.shadowColor='rgba(240,192,64,.4)'; x.shadowBlur=6;
  x.fillText('COSMOGRAM',W/2+8,663); x.shadowBlur=0; x.letterSpacing='0px';
  x.fillStyle='#c9a45c'; x.font='500 16px "Exo 2",sans-serif';
  x.fillText('@realcosmogrambot',W/2,690);
}

function cardShareRecordGlow(){ // 30.08.2026: разовое свечение «Поделиться» — только в момент рекорда
  const btn=$('cardShare'); if(!btn) return;
  btn.classList.remove('glow'); void btn.offsetWidth; // сброс всегда — иначе старое свечение переживало обычный заход после рекордного (найдено живьём)
  if(cardData.rec && !btn.classList.contains('hidden')) btn.classList.add('glow');
}
function cardOpen(){
  if(typeof document!=='undefined' && document.fonts && document.fonts.ready)
    document.fonts.ready.then(cardDraw); // Exo 2 локальный — к моменту финала загружен, но перестрахуемся
  cardDraw();
  cardChatGate(); // v1.97.0: золотая дверь решает, видна ли она в этой среде
  cardStoryGate(); // v1.97.1: и сторис-дверь рядом
  cardShareGate(); // 30.08.2026: и системное «Поделиться» — своя дверь, не завязана на Telegram
  cardShareRecordGlow(); // 30.08.2026: после gate — глядим на актуальную видимость кнопки
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
  if(L.share){ const t7=$('cardShare'); if(t7) t7.textContent=L.share; }
}
/* v1.96.0 «Одна дверь», шаг Б «Сохранить карточку»: PNG уходит файлом —
   в Telegram 8.0+ через tg.downloadFile, вне него — якорем download. Скриншот больше не обязателен. */
function cardSave(){
  const cv=$('cardCanvas'); if(!cv) return;
  let url=''; try{ url=cv.toDataURL('image/png'); }
  catch(e){ if(typeof BEACON!=='undefined') BEACON.signal('card_save_fail','todataurl: '+String(e&&e.message||e).slice(0,60)); return; }
  const name='cosmogram-'+(cardData.sc||0)+'.png';
  if(typeof tg!=='undefined' && tg && tg.downloadFile && typeof tgv==='function' && tgv('8.0')){
    try{ tg.downloadFile({url:url,file_name:name},function(){ haptic('light'); }); sfx.click(); return; }
    catch(e){ if(typeof BEACON!=='undefined') BEACON.signal('card_save_fail','downloadfile_threw: '+String(e&&e.message||e).slice(0,60)); }
  }
  // 02.09.2026 (владелец вживую — «сохранить полностью тишина»): якорь-download — известно хрупкий
  // способ внутри Telegram WebView (клиенты часто тихо глотают клик без tg.downloadFile, 8.0+).
  // Сигнал шлём только когда мы ВНУТРИ Telegram и всё равно скатились на якорь (это и есть
  // подозрительный случай) — вне Telegram якорь и так единственный штатный путь, не беда.
  if(typeof tg!=='undefined' && tg && typeof BEACON!=='undefined') BEACON.signal('card_save_fail','anchor_fallback_in_tg');
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
    const caption=(typeof L!=='undefined' && L.shareText)?L.shareText(cardData.sc):('Cosmogram: '+cardData.sc); // shareTextFor() никогда не существовала — подпись всегда падала в голую заглушку
    const r=await syncFetch(SYNC_URL,{action:'share_card',initData:tg.initData,png,caption});
    const ans=await r.json();
    if(!r.ok||!ans.ok||!ans.id) throw new Error(ans.error||('http_'+r.status));
    tg.shareMessage(ans.id,function(ok){
      if(ok){ haptic('success'); }
      else {
        // 02.09.2026: тост один и тот же что при сетевом сбое ниже, а причины разные — сервер
        // тут уже успешно отдал ans.id, отказал сам tg.shareMessage на стороне клиента Telegram.
        if(typeof BEACON!=='undefined') BEACON.signal('card_chat_fail','share_rejected_after_id');
        if(typeof toast==='function') toast(L.cardChatErr||'Не вышло — сохрани файлом','rgba(255,159,176,.5)'); haptic('error');
      } // 28.08.2026: раньше отказ (ok=false) был полной тишиной — владелец: «в чат не работает»
    });
    sfx.click();
  }catch(e){
    // 02.09.2026: сеть/сервер не дошли до ans.id вообще — сообщение e.message несёт код причины
    // (http_XXX от нашей функции, или error-поле сервера: tg_only/tg_prepare/tg_net/not_configured).
    if(typeof BEACON!=='undefined') BEACON.signal('card_chat_fail','no_id: '+String(e&&e.message||e).slice(0,60));
    if(typeof toast==='function') toast(L.cardChatErr||'Не вышло — сохрани файлом','rgba(255,159,176,.5)'); haptic('error');
  }
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
/* 30.08.2026 «Одна дверь для всех»: вместо отдельных кнопок под каждую соцсеть (у большинства
   веб-ссылка на шаринг несёт только текст+ссылку, картинку прицепить нельзя — ограничение самих
   платформ; у Instagram веб-ссылки для шаринга нет вовсе) — системное окно «Поделиться»
   (Web Share API, files). Оно само показывает все установленные у игрока приложения с картинкой
   внутри, а не гадает, под какую сеть строить обходной путь. */
function cardShareGate(){
  const b=$('cardShare'); if(!b) return;
  let can=false;
  try{
    const probe=new File(['x'],'t.png',{type:'image/png'});
    can=!!(navigator.share && navigator.canShare && navigator.canShare({files:[probe]}));
  }catch(e){}
  b.classList.toggle('hidden', !can);
}
function cardShare(){
  const b=$('cardShare'), cv=$('cardCanvas');
  if(!b||!cv||b._busy) return; b._busy=1;
  cv.toBlob(async function(blob){
    b._busy=0;
    if(!blob) return;
    try{
      const file=new File([blob], 'cosmogram-'+(cardData.sc||0)+'.png', {type:'image/png'});
      if(!navigator.canShare({files:[file]})) return;
      await navigator.share({files:[file], text:(typeof L!=='undefined' && L.shareText)?L.shareText(cardData.sc):''});
      haptic('light');
    }catch(e){} // отказ игрока в системном окне — не ошибка, молчим
  }, 'image/png');
}
wireOnLocal('cardBtn','click',cardOpen);
wireOnLocal('cardChat','click',cardSend);
wireOnLocal('cardStory','click',cardStory);
wireOnLocal('cardShare','click',cardShare);
wireOnLocal('cardSave','click',cardSave);
wireOnLocal('cardBack','click',function(){ sfx.click(); setScreen('over'); });
cardChatGate(); // при загрузке: среда уже известна
cardStoryGate(); // и сторис-дверь при загрузке
cardShareGate(); // и системное «Поделиться» тоже
