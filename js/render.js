'use strict';
/* ============================================================
   RENDER: отрисовка, авто-качество по FPS, кэш градиентов,
   главный цикл (fixed timestep, рендер независимый).
   Зависит от core.js, game.js.
   ============================================================ */

/* ---------- Авто-качество (Блок 3/10): shadowBlur — главный мобильный тормоз ---------- */
const Q = { level:2, fps:60, mode:'auto', _acc:0, _n:0, _t:0, _up:0, _dn:0, _hold:0, _ceil:-1, _prove:0 }; // 0=low 1=med 2=high 3=ultra; mode — настройка игрока
function qThr(){ // пороги авто-качества: под тир GPU и под частоту экрана (v1.12.0) — на 120 Гц считаем по-честному; v1.35.0 — чуть мягче вверх, чтобы не гонять уровень туда-сюда
  const t=gfxTier(), hz=Store.get('dispHz',60);
  if (hz>=100) return {dn:Math.round(hz*.45), up:Math.round(hz*.85)};
  return {dn:t===1?36:40, up:55};
}
/* v1.284.22 «Качели качества» (партия 49). Владелец: «графика прыгает». Боевая телеметрия
   подтвердила числом: сигнал fps_drop приходит с его телефона на КАЖДОЙ версии подряд —
   31, 33, 34, 35, 36, 37, 38, 39, 40 кадров при пороге понижения 40.
   Корень: автокачество помнит два числа, и переживает перезапуск только одно.
     · выученный уровень `gfxLv` — в хранилище, живёт вечно;
     · «потолок-памятка» `_ceil` (уровень, с которого только что упали, штурмовать заново
       нельзя до двадцати секунд доказанного запаса) — ТОЛЬКО в памяти вкладки.
   Значит каждый новый запуск игра идёт штурмовать ровно тот уровень, про который уже
   выяснила, что он ей не по силам. А каждая ступень вверх и вниз зовёт resize(), то есть
   пересоздаёт холст целиком: при dpr 3 это буфер в три мегапикселя, и сам этот скачок
   стоит кадра. Забеги по 35 секунд, десятки за день — качели в каждом.
   Лекарство: потолок кладётся в хранилище рядом с уровнем и снимается оттуда же, когда
   устройство докажет стабильность. Половина памяти не работает: помнить надо оба числа. */
function qualityTick(dt){
  if (Q.mode!=='auto'){ Q.level = Q.mode==='low'?0:(Q.mode==='med'?1:(Q.mode==='ultra'&&gfxUltraOk()?3:2)); return; } // ручной режим — без авто-метрики
  Q._acc+=dt; Q._n++; Q._t+=dt;
  if(Q._t>=1){
    const f = Q._n/Math.max(Q._acc,.001);
    Q.fps = lerp(Q.fps, f, .6);
    Q._acc=0; Q._n=0; Q._t=0;
    if (Q._hold>0){
      // v1.282.1 «Аварийный выход»: карантин был всегда ровно 8с независимо от тяжести —
      // тройной обвал (60→20 fps, настоящий троттлинг) спускался по ступеням МЕДЛЕННО:
      // 3с обнаружения + 8с карантина на каждую ступень, до ~24-33с заикания подряд, прежде
      // чем стабилизироваться. Погранично плохой fps (чуть ниже dn) по-прежнему ждёт полный
      // карантин — защита от дребезга жива. Только по-настоящему тяжёлая, устойчивая просадка
      // (заметно ниже dn) пробивает карантин раньше срока.
      const {dn:dnEarly}=qThr();
      if (Q.fps < dnEarly*.6 && Q.level>0){
        Q._ceil = Q.level; Q.level--; Q._dn=0; Q._up=0; Q._prove=0; Q._hold=8;
        Store.set('gfxLv',Q.level); Store.set('gfxCeil',Q._ceil); gfxCap(); resize(); // v1.284.22: потолок переживает перезапуск — см. запись у qualityTick
        if(typeof BEACON!=='undefined') BEACON.signal('fps_drop_severe', Math.round(Q.fps)+'');
        return;
      }
      Q._hold--; Q._up=0; Q._dn=0; Q._prove=0; return; // карантин после смены уровня: небо не дёргается
    }
    const {dn,up}=qThr(), cap=gfxUltraOk()?3:2; // v1.7.0: среднему тиру красоту бережём до последнего; v1.12.0: флагману доступна «Ультра»
    const ceil = Q._ceil>=0 ? Math.min(cap,Q._ceil-1) : cap; // v1.35.0: уровень, с которого упали, авто не штурмует, пока устройство не докажет стабильность
    if(Q.fps<dn && Q.level>0){ if(++Q._dn>=3){ // 3 секунды просадки подряд — жертвуем и эффектами, и резолюцией
      Q._ceil = Q.level; Q.level--; Q._dn=0; Q._up=0; Q._prove=0; Q._hold=8;
      Store.set('gfxLv',Q.level); Store.set('gfxCeil',Q._ceil); gfxCap(); resize(); // v1.284.22
      if(typeof BEACON!=='undefined') BEACON.signal('fps_drop', Math.round(Q.fps)+''); } } // v1.108.1: тихая автокоррекция теперь долетает до почты — раньше об этом узнавал только тот, кто сам зашёл в Сервисный центр
    else if(Q.fps>up && Q.level<ceil){ Q._dn=0; if(++Q._up>=8){ Q.level++; Q._up=0; Q._prove=0; Q._hold=8; Store.set('gfxLv',Q.level); gfxCap(); resize(); } } // v1.282.15: и разрешение поднимаем обратно — обе ветки понижения это делают, ветка повышения не делала, и после одной случайной просадки картинка оставалась мыльной до конца сессии // выученный уровень запоминаем между сессиями
    else if(Q.fps>up){ Q._dn=0; Q._up=0; if(Q._ceil>=0 && ++Q._prove>=20){ Q._ceil=-1; Q._prove=0; Store.set('gfxCeil',-1); } } // v1.284.22: устройство доказало запас — забываем потолок и в хранилище тоже, иначе он держал бы уровень внизу вечно // 20 секунд уверенного запаса — потолок-памятка снимается
    else { Q._up=0; Q._dn=0; Q._prove=0; }
  }
}
const DEBUG_FPS = /[?&#]debug/.test(location.href);
/* v1.282.15: сколько прошло с прошлой ОТРИСОВКИ. Нужен тому немногому внутри draw(),
   что действительно движется само (параллакс фона): фикс-степ живёт в update(), а draw
   зовётся с разной частотой — 60 в небе, 30 на оверлеях, 4 на замершей паузе. */
/* v1.282.15 «Бережное небо доделано». Мигание неуязвимости переключалось каждые 90мс —
   это 5.5 вспышки в секунду при пороге фотосенситивности WCAG в 3, и шло оно 2.2 секунды
   после каждого удара. При этом системный флаг «уменьшить движение» учитывался ровно в
   двух местах файла из полутора десятков — и пропущен был именно тот единственный эффект,
   который порог превышает. Человеку, доверившемуся флагу, показываем ровную полупрозрачность
   вместо стробоскопа. Выражение заодно собрано в одну функцию: раньше оно было размножено
   по четырём местам и рассинхронизировалось бы при первой же правке. */
function invulnDim(){ return RM ? true : (Math.floor(performance.now()/90)%2===0); }
let frameDt=1/60, _lastDrawT=0;
function frameTick(t){ const d=(t-_lastDrawT)/1000; _lastDrawT=t; frameDt=(d>0&&d<0.25)?d:1/60; }

/* кисть скруглённых форм (v1.105.0 «Свет и дым»): мир не бывает прямоугольной наклейкой —
   приборы могут быть плоскими, мир не может */
function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }

/* ---------- Кэш градиентов (пересоздаём только при смене волны/размера) ---------- */
let bgCache={h:-1,w:-1,ht:-1,g:null};
function bgGradient(h1,h2){
  const hq0=Math.round(S.hueShift); // квант: плавный дрейф не пересобирает кэш каждый кадр (v1.24.0)
  if(bgCache.h!==hq0||bgCache.w!==W||bgCache.ht!==H){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,`hsl(${h1},62%,10%)`);
    g.addColorStop(.55,`hsl(${h1},58%,16%)`);
    g.addColorStop(1,`hsl(${h2},70%,26%)`);
    bgCache={h:hq0,w:W,ht:H,g};
  }
  return bgCache.g;
}
let coneGrad=null; // статичный конус света — создаётся один раз
/* ---------- Спрайт-кэши Q2: мягкое свечение без дорогого shadowBlur ---------- */
let starGlowSprite=null;
function starGlow(){
  if(!starGlowSprite){
    const c=document.createElement('canvas'); c.width=c.height=48;
    const x=ctx2d(c);
    const g=x.createRadialGradient(24,24,2,24,24,24);
    g.addColorStop(0,juicy('rgba(255,235,170,.9)','color(display-p3 1 .95 .72 / .9)'));
    g.addColorStop(.4,juicy('rgba(255,215,106,.35)','color(display-p3 1 .87 .42 / .35)'));
    g.addColorStop(1,juicy('rgba(255,215,106,0)','color(display-p3 1 .87 .42 / 0)')); // v1.99.3 «Сочные чернила»: ауреола звезды
    x.fillStyle=g; x.fillRect(0,0,48,48);
    starGlowSprite=c;
  }
  return starGlowSprite;
}
/* v1.282.20 «Полноэкранный спрайт меряется экраном, а не небом».
   Офскрины на весь кадр рисовались размером W*DPR, где W — это МЕРЫ НЕБА (cssW/SC), а не
   css-пиксели. Потом их клали на холст через drawImage(...,0,0,W,H), то есть под линейкой
   DPR*SC. Значит на любом экране крупнее эталона (планшет, десктоп, складной) спрайт
   растягивался ровно в SC раз: на 10" планшете фон и виньетка рендерились в ~60% плотности
   и заметно мылили. Правильная мерка — настоящие пиксели холста: W*SC*DPR = cssW*DPR, то
   есть ровно размер главного холста (значит и «Потолок листа» уже учтён, лишней памяти нет).
   На массовых 390-мерных телефонах SC=1 — там не изменилось ни байта. */
function skyPx(){ return DPR*SC; }
let vignCache={w:-1,ht:-1,d:-1,s:-1,c:null}; // мягкое затемнение краёв — глубина кадра
function vignetteSprite(){
  if(vignCache.w!==W||vignCache.ht!==H||vignCache.d!==DPR||vignCache.s!==SC){
    const px=skyPx();
    const cw=Math.round(W*px), chh=Math.round(H*px);
    /* 13.08.2026: переиспользуем холст, как это с v1.282.20 делает соседняя nebulaField().
       Раньше здесь на каждую смену W/H/DPR/SC создавался НОВЫЙ холст, а старый бросался
       как есть. На iOS WKWebView суммарная память канвасов ограничена (~384 МБ, на части
       устройств меньше), и брошенный холст держит её, пока не дойдёт сборщик мусора —
       а он не спешит. Если размер тот же, чистим и рисуем поверх; если другой — старому
       явно ставим нулевой размер, это единственный способ отдать его память сразу. */
    let c=vignCache.c;
    if(c && (c.width!==cw || c.height!==chh)){ c.width=0; c.height=0; c=null; }
    if(!c){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
    const x=ctx2d(c);
    x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh);
    x.setTransform(px,0,0,px,0,0);
    const g=x.createRadialGradient(W/2,H*.45,Math.min(W,H)*.35, W/2,H*.55, Math.max(W,H)*.78);
    g.addColorStop(0,'rgba(2,4,14,0)'); g.addColorStop(1,'rgba(2,4,14,.42)');
    x.fillStyle=g; x.fillRect(0,0,W,H);
    vignCache={w:W,ht:H,d:DPR,s:SC,c};
  }
  return vignCache.c;
}
/* Мягкие круглые звёзды трёх оттенков — вместо квадратных пикселей (hq) */
const starDotCache={};
function starDot(tint){
  if(!starDotCache[tint]){
    const c=document.createElement('canvas'); c.width=c.height=16;
    const x=ctx2d(c);
    const col=tint==='w'?'255,247,228':tint==='c'?'186,230,255':'218,230,255';
    const g=x.createRadialGradient(8,8,0,8,8,8);
    g.addColorStop(0,'rgba('+col+',1)'); g.addColorStop(.35,'rgba('+col+',.8)');
    g.addColorStop(1,'rgba('+col+',0)');
    x.fillStyle=g; x.fillRect(0,0,16,16);
    starDotCache[tint]=c;
  }
  return starDotCache[tint];
}
/* Аура двигателя по цвету скина — тёплое свечение кормы (hq) */
const trailGlowCache={};
function trailGlow(skin){
  if(!trailGlowCache[skin.id]){
    const c=document.createElement('canvas'); c.width=c.height=48;
    const x=ctx2d(c);
    const g=x.createRadialGradient(24,24,2,24,24,24);
    g.addColorStop(0,skin.trail+'.55)'); g.addColorStop(.5,skin.trail+'.22)'); g.addColorStop(1,skin.trail+'0)');
    x.fillStyle=g; x.fillRect(0,0,48,48);
    trailGlowCache[skin.id]=c;
  }
  return trailGlowCache[skin.id];
}
/* v1.66.0: корпусное свечение скина — кэш-спрайт вместо shadowBlur в каждом кадре */
const planeGlowCache={};
function planeGlow(skin){
  if(!planeGlowCache[skin.id]){
    const c=document.createElement('canvas'); c.width=c.height=64;
    const x=ctx2d(c);
    const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1); // 'rgba(r,g,b,'
    const g=x.createRadialGradient(32,32,4,32,32,32);
    g.addColorStop(0,base+'.5)'); g.addColorStop(.55,base+'.18)'); g.addColorStop(1,base+'0)');
    x.fillStyle=g; x.fillRect(0,0,64,64);
    planeGlowCache[skin.id]=c;
  }
  return planeGlowCache[skin.id];
}
/* v1.66.0: бегущий блик Хрома — узкий спрайт-полоса вместо градиента в каждом кадре */
let sheenSpr=null;
function sheenSprite(){
  if(!sheenSpr){
    const c=document.createElement('canvas'); c.width=18; c.height=48;
    const x=ctx2d(c);
    const g=x.createLinearGradient(0,0,18,0);
    g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.5,'rgba(255,255,255,.55)'); g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.fillRect(0,0,18,48);
    sheenSpr=c;
  }
  return sheenSpr;
}
/* v1.66.0: строки оттенков Неона/Плазмы — посчитаны один раз, в кадре берём готовое */
const NEON_HUES=[]; for(let i=0;i<360;i++) NEON_HUES.push('hsla('+i+',100%,65%,');
const PLASMA_HUES=[]; for(let i=0;i<40;i++) PLASMA_HUES.push('hsl('+i+',95%,58%)');
/* HD-поле туманностей: пред-рендер на весь экран (цветные пятна + млечная
   полоса + звёздная пыль). Кадр = один drawImage; пересоздаётся только при
   смене волны/размера/DPR. Свой LCG — глобальный RNG не трогаем (от него
   зависит Daily Challenge). */
/* v1.282.15 «Фон перестал дёргаться каждую секунду».
   Комментарий выше обещал «пересоздаётся только при смене волны», а ключ кэша брал
   Math.round(S.hueShift) — величину, которая растёт на 1.2 в СЕКУНДУ (game.js: фон
   дышит непрерывно). То есть кэш промахивался каждые 833 мс, и на каждый промах
   приходилось: новый холст W*DPR × H*DPR (на телефоне это ~12 МБ), пять полноэкранных
   градиентных заливок и 240 точек пыли — синхронно, внутри кадра. Ровное подёргивание
   раз в секунду весь полёт. Авто-качество этого не ловило: один тяжёлый кадр из
   шестидесяти даёт средние 57 fps, до порога далеко.
   Хуже того, сид тоже шился из hueShift — поэтому весь узор туманностей и вся звёздная
   пыль ТЕЛЕПОРТИРОВАЛИСЬ на новые места раз в секунду ради изменения цвета на 0.3°.
   Лечим тремя ходами: сид фиксируем на забег (узор стоит на месте), квант кэша грубеем
   до 60 единиц оттенка (это и есть «смена волны» — примерно раз в 50 секунд), и холст
   переиспользуем, а не выбрасываем по 12 МБ в сборщик мусора. */
const NF_HUE_STEP=60; // единиц hueShift на одну пересборку: ~50 секунд полёта
let nfCache={w:-1,ht:-1,h:-1,d:-1,s:-1,c:null};
let nfSeed=0;         // узор трассы: ставится один раз за забег, от оттенка не зависит
function nebulaReseed(){ nfSeed=((Math.floor(Math.random()*4294967296))>>>0)||1; nfCache.h=-1; }
function nebulaField(h1,h2){
  const hq=Math.round(S.hueShift/NF_HUE_STEP);
  if(nfCache.w===W&&nfCache.ht===H&&nfCache.h===hq&&nfCache.d===DPR&&nfCache.s===SC) return nfCache.c;
  const px=skyPx(); // v1.282.20: настоящие пиксели экрана, а не меры неба
  const cw=Math.round(W*px), chh=Math.round(H*px);
  let c=nfCache.c;
  if(!c || c.width!==cw || c.height!==chh){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
  const x=ctx2d(c);
  x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh); // переиспользуем холст — чистим, а не выбрасываем
  x.setTransform(px,0,0,px,0,0);
  let seed=(nfSeed||1);
  const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const blob=(bx,by,r,hue,li,a,sq)=>{
    x.save(); x.translate(bx,by); x.scale(1,sq||1);
    const g=x.createRadialGradient(0,0,0,0,0,r);
    g.addColorStop(0,'hsla('+hue+',80%,'+li+'%,'+a+')');
    g.addColorStop(.6,'hsla('+(hue+20)+',75%,'+Math.max(li-12,8)+'%,'+(a*.5)+')');
    g.addColorStop(1,'hsla('+hue+',75%,'+li+'%,0)');
    x.fillStyle=g; x.beginPath(); x.arc(0,0,r,0,6.283); x.fill(); x.restore();
  };
  const m=Math.max(W,H);
  // холодная база — глубина в цвете волны
  blob(W*(.1+R()*.25), H*(.15+R()*.2), m*.45, h1+30, 42, .30, .8);
  blob(W*(.7+R()*.25), H*(.5+R()*.25), m*.4, h2+50, 40, .26, .85);
  // тёплые пурпурные волокна — акцент как на эталонном макете
  blob(W*(.2+R()*.5), H*(.55+R()*.3), m*.36, h1+300, 55, .20, .55);
  blob(W*(.5+R()*.4), H*(.1+R()*.25), m*.3, h1+285, 52, .15, .6);
  // бирюзовые разводы
  blob(W*(.02+R()*.3), H*(.6+R()*.3), m*.32, h2+150, 50, .18, .7);
  // млечная полоса по диагонали — глубина и направление взгляда
  const x0=W*.05, y0=H*.82, x1=W*.95, y1=H*.12;
  for(let i=0;i<9;i++){
    const t=i/8;
    blob(lerp(x0,x1,t)+(R()-.5)*W*.08, lerp(y0,y1,t)+(R()-.5)*H*.06, m*.17, h1+40, 68, .07, .5);
  }
  // звёздная пыль: сотни мелких точек, гуще у полосы; маскирует бандинг градиента
  for(let i=0;i<240;i++){
    const t=R(), near=R()<.6;
    const sx=near? lerp(x0,x1,t)+(R()-.5)*W*.32 : R()*W;
    const sy=near? lerp(y0,y1,t)+(R()-.5)*H*.24 : R()*H;
    x.globalAlpha=.04+R()*.2;
    x.fillStyle=R()<.8?'#dfe9ff':'#ffe9c8';
    const sz=.4+R()*1.1;
    x.fillRect(sx,sy,sz,sz);
  }
  x.globalAlpha=1;
  nfCache={w:W,ht:H,h:Math.round(S.hueShift/NF_HUE_STEP),d:DPR,s:SC,c:c};
  return c;
}
let planeGradCache={skin:-1,g:null}; // градиент корпуса по скину
function planeGrad(skin){
  if(planeGradCache.skin!==skin.id){
    const g=ctx.createLinearGradient(0,-22,0,16);
    g.addColorStop(0,'#ffffff'); g.addColorStop(.45,skin.body); g.addColorStop(1,skin.fold);
    planeGradCache={skin:skin.id,g};
  }
  return planeGradCache.g;
}
const powGlowCache={}; // спрайт свечения любого цвета — бонусы, комета, призрак
function powGlow(color){
  if(!powGlowCache[color]){
    const c=document.createElement('canvas'); c.width=c.height=56;
    const x=ctx2d(c);
    const g=x.createRadialGradient(28,28,2,28,28,28);
    g.addColorStop(0,hexToRgba(color)+'.55)'); g.addColorStop(1,hexToRgba(color)+'0)');
    x.fillStyle=g; x.fillRect(0,0,56,56);
    powGlowCache[color]=c;
  }
  return powGlowCache[color];
}
/* v1.282.20 «Градиент — не расходник».
   Обломки, спутники и значки бонусов создавали свои градиенты ЗАНОВО в каждом кадре: у
   спутника это 3–6 штук (панели, корпус, линза, тарелка), у обломка один, у каждого значка
   один. При десятке предметов на экране выходило 2400–4800 объектов CanvasGradient в
   секунду — каждый со своим разбором цветов и своей текстурой ramp'а, и весь этот мусор
   потом собирает сборщик, подёргивая кадр.
   Геометрия у них зависит только от размера предмета, а размеров — конечный набор. Кэшируем
   по округлённому размеру (четверть меры неба — глазом неразличимо на плавном переходе).
   Счётчик — страховка от бесконечного роста: набор ключей заведомо мал, но если когда-нибудь
   появится непрерывный параметр, кэш обнулится, а не съест память. */
/* v1.282.21 «Цвет — не расходник».
   Цвет частицы собирался строкой в КАЖДОМ кадре на КАЖДУЮ частицу, причём альфа была сырым
   double: 'rgba(255,120,60,' + 0.7263412... + ')'. Это не просто конкатенация — это ещё и
   печать числа, и повторный разбор CSS-цвета движком канваса. Сорок живых частиц дают 2400
   строк в секунду, на пике (кап 220, на «Ультре» 340) — до двадцати тысяч. Тот же приём, что
   уже изобрели для морзянки: квантуем альфу на 40 ступеней (глазом неразличимо) и держим
   готовые строки. Полосы скорости собирали три ОДНИ И ТЕ ЖЕ строки по 90 раз в кадр — их
   просто выносим в константы. */
const partColC={};
function partCol(prefix, a){
  const q=a<=0?0:(a>=1?40:Math.round(a*40));
  const k=prefix+q;
  let v=partColC[k];
  if(!v){ v=prefix+(q/40).toFixed(3)+')'; partColC[k]=v; }
  return v;
}
const STREAK_COL=['rgba(255,247,228,.9)','rgba(186,230,255,.9)','rgba(218,230,255,.9)'];
const gradCache={}; let gradN=0;
function gradPut(k,g){ if(gradN>400){ for(const q in gradCache) delete gradCache[q]; gradN=0; } gradCache[k]=g; gradN++; return g; }
let nebCache={h:-1,a:null,b:null};
/* v1.282.20 «Возвращение после потери холста».
   Браузер вправе отобрать графический контекст в любой момент: Android под нехваткой
   памяти, свёрнутая вкладка на слабом устройстве, смена GPU на ноутбуке. По спецификации
   после этого все ранее созданные CanvasGradient и все офскрин-битмапы становятся мусором,
   а сам холст очищается. Игра этого события не слушала вообще: после восстановления фон,
   свечения и градиенты корпуса оставались пустыми ДО ПЕРЕЗАГРУЗКИ страницы — а игрок в
   Telegram перезагрузить мини-приложение не догадывается.
   Лечение — один общий сброс всех кэшей. Каждый из них ленивый: обнулили ключ, следующий
   кадр пересоберёт заново. Ничего не рисуем здесь сами — только забываем протухшее. */
function gfxInvalidate(){
  bgCache={h:-1,w:-1,ht:-1,g:null};
  coneGrad=null;
  starGlowSprite=null;
  vignCache={w:-1,ht:-1,d:-1,s:-1,c:null};
  nfCache={w:-1,ht:-1,h:-1,d:-1,s:-1,c:null}; // холст тоже отпускаем: старый битмап после потери контекста пуст
  planeGradCache={skin:-1,g:null};
  nebCache={h:-1,a:null,b:null};
  sheenSpr=null;
  for(const k in starDotCache) delete starDotCache[k];
  for(const k in trailGlowCache) delete trailGlowCache[k];
  for(const k in planeGlowCache) delete planeGlowCache[k];
  for(const k in powGlowCache) delete powGlowCache[k];
  for(const k in gradCache) delete gradCache[k]; gradN=0;
  for(const k in partColC) delete partColC[k];
  /* v1.282.23 «Полный сброс» (партия 27): владелец сообщил — станция и другие элементы
     пропадают и не возвращаются. Причина — эта функция знала только про свои кэши: два
     модульных кэша градиентов (станция в planetarium.js, звезда дня в goldstar.js) кэшируют
     «один раз навсегда» в СВОЁМ замыкании и про потерю контекста ничего не знали. Плюс
     кэш хвоста кометы — на самом объекте препятствия, тоже мимо общего сброса. */
  if (typeof PLANET!=='undefined' && PLANET._gfxReset) PLANET._gfxReset();
  if (typeof GOLD!=='undefined' && GOLD._gfxReset) GOLD._gfxReset();
  if (typeof obstacles!=='undefined') for(const o of obstacles){ if(o.kind==='comet'){ o._tg=null; o._tgk=undefined; } }
}
function nebulaSprite(hue){ // двухтональная: яркое ядро → глубокий край
  const c=document.createElement('canvas'); c.width=c.height=200;
  const x=ctx2d(c);
  const g=x.createRadialGradient(100,100,0,100,100,100);
  g.addColorStop(0,`hsl(${hue},75%,64%)`); g.addColorStop(.45,`hsl(${hue+18},70%,45%)`); g.addColorStop(1,'transparent');
  x.fillStyle=g; x.fillRect(0,0,200,200);
  return c;
}
function drawNebulas(h1,h2,tN){
  if(Q.level===0) return; // на слабых устройствах пропускаем
  const hq1=Math.round(S.hueShift/NF_HUE_STEP); // v1.282.15: тот же грубый квант — иначе два спрайта 200×200 пеклись каждые 833мс
  if(nebCache.h!==hq1){
    nebCache={h:hq1,a:nebulaSprite(h1+40),b:nebulaSprite(h2+60)};
  }
  if(Q.level>=2){ // HD/Ультра: богатое поле туманностей + живые дрейфующие пятна поверх
    ctx.drawImage(nebulaField(h1,h2),0,0,W,H);
    ctx.globalAlpha=.09;
    ctx.drawImage(nebCache.a, W*.2+Math.sin(tN*.05)*40-W*.28, H*.3-W*.28, W*.56, W*.56);
    ctx.globalAlpha=.08;
    ctx.drawImage(nebCache.b, W*.85-W*.25, H*.7+Math.cos(tN*.04)*50-W*.25, W*.5, W*.5);
    ctx.globalAlpha=1;
    if(Q.level>=3){ // Ультра: четвёртое дыхание неба — северное пятно
      ctx.globalAlpha=.07;
      ctx.drawImage(nebCache.a, W*.55-W*.22, H*.12+Math.sin(tN*.06)*30-W*.22, W*.44, W*.44);
      ctx.globalAlpha=1;
    }
    return;
  }
  ctx.globalAlpha=.11;
  ctx.drawImage(nebCache.a, W*.2+Math.sin(tN*.05)*40-W*.28, H*.3-W*.28, W*.56, W*.56);
  ctx.globalAlpha=.09;
  ctx.drawImage(nebCache.b, W*.85-W*.25, H*.7+Math.cos(tN*.04)*50-W*.25, W*.5, W*.5);
  ctx.globalAlpha=1;
}

/* ================= DRAW ================= */
function drawFx(hq,sh){ // частицы + попапы: и в игре, и поверх оверлеев (конфетти рекорда)
  if(hq) ctx.globalCompositeOperation='lighter';
  const aurSp=starDot('w');
  for (const p of particles){
    ctx.globalAlpha = clamp(p.life,0,1);
    if(hq && p.fx==='aurora'){ // звёздный след Авроры — крошечные мерцающие звёздочки
      const s=p.size*3.4;
      ctx.drawImage(aurSp,p.x-s/2,p.y-s/2,s,s);
      continue;
    }
    ctx.fillStyle = partCol(p.color, p.life*.9);
    ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
  }
  ctx.globalAlpha=1;
  if(hq) ctx.globalCompositeOperation='source-over';
  ctx.textAlign='center'; ctx.font='500 15px -apple-system,"Segoe UI",Roboto,sans-serif';
  for (const p of popups){
    ctx.globalAlpha=clamp(p.life,0,1);
    ctx.fillStyle=p.color;
    if(sh){ ctx.save(); ctx.translate(p.x,p.y); ctx.scale(1.12,1.12); // v1.66.0: ореол попапа — прозрачный дубль крупнее
      ctx.globalAlpha=clamp(p.life,0,1)*.35; ctx.fillText(p.txt,0,0); ctx.restore();
      ctx.globalAlpha=clamp(p.life,0,1); }
    ctx.fillText(p.txt,p.x,p.y);
  }
  ctx.globalAlpha=1;
}

/* Глифы бонусов — векторные, свои (v1.14.0). v1.105.0 «Свет и дым»: заполненные
   силуэты вместо волоса-обводки — язык самолётика и монет (они залиты, глифы были
   чужаками); суд глаза: тонкую линию с полёта не читали, созвездия-точки были кашей. */
function fillGlyphPath(x,kind){
  x.beginPath();
  switch(kind){
    case 'shield': x.moveTo(0,-6.6); x.lineTo(5,-4.6); x.lineTo(5,0.4);
      x.quadraticCurveTo(5,4.8,0,7.2); x.quadraticCurveTo(-5,4.8,-5,0.4);
      x.lineTo(-5,-4.6); x.closePath(); break;
    case 'slowmo': x.arc(0,0,5.6,0,6.283); break; // циферблат — стрелки вырезаем тёмным
    case 'dash': for(const dx of [-6.4,-2.2,2]){ // Таран: три жирных шеврона вперёд — ты снаряд
      x.moveTo(dx,-4.6); x.lineTo(dx+3.6,0); x.lineTo(dx,4.6); x.lineTo(dx+1.9,4.6);
      x.lineTo(dx+5.5,0); x.lineTo(dx+1.9,-4.6); x.closePath(); } break;
    case 'nova': // Сверхновая: восьмилучевая звезда-вспышка
      for(let i=0;i<16;i++){ const a=i/16*6.283, rad=i%2?2.2:6.6;
        i?x.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):x.moveTo(Math.cos(a)*rad,Math.sin(a)*rad); }
      x.closePath(); break;
  }
}
function drawGlyph(ctx,kind,col){
  ctx.save();
  // v1.282.20: геометрия у значка постоянная, меняется только цвет — кэш по цвету
  const gk='gly'+col; let g=gradCache[gk];
  if(!g){ g=ctx.createLinearGradient(0,-7,0,7); // свет сверху, как у всего мира
    g.addColorStop(0,'#ffffff'); g.addColorStop(.25,col); g.addColorStop(1,col); gradPut(gk,g); }
  if(kind==='magnet'){ // подкова — жирной дугой с круглыми концами
    ctx.strokeStyle=g; ctx.lineWidth=4.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-4.4,4.8); ctx.lineTo(-4.4,-0.8);
    ctx.arc(0,-0.8,4.4,Math.PI,0); ctx.lineTo(4.4,4.8); ctx.stroke();
  } else if(kind==='life'){ // крест — два бруска (составной контур rr не строим: rr зовёт beginPath)
    ctx.fillStyle=g;
    rr(ctx,-1.7,-5.2,3.4,10.4,1.2); ctx.fill();
    rr(ctx,-5.2,-1.7,10.4,3.4,1.2); ctx.fill();
  } else {
    fillGlyphPath(ctx,kind); ctx.fillStyle=g; ctx.fill();
  }
  if(kind==='slowmo'){ // стрелки — тёмный вырез
    ctx.strokeStyle='rgba(8,14,34,.85)'; ctx.lineWidth=2.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-3.1); ctx.lineTo(0,0); ctx.lineTo(2.6,1.6); ctx.stroke();
  }
  ctx.restore();
}

/* v1.66.0 «Лёгкий кадр»: цвета бонусов — константы модуля (раньше объект собирался заново
   на каждый бонус в каждом кадре); кольца — готовые строки, лениво после загрузки game.js */
const POW_COLORS={shield:'#7fd8ff',magnet:'#c58fff',slowmo:'#8fff9f',life:'#ffa1d9',dash:'#a9bcff',nova:'#fff0a8'}; // v1.105.0: жизнь — розовая, вне красной семьи тревоги (мина/ловец): «лови» больше не читается как «бойся»
let POW_RING=null;
function powRing(){
  if(!POW_RING){ POW_RING={}; for(const k in POW_COLORS)
    POW_RING[k]=[hexToRgba(POW_COLORS[k])+'.38)', hexToRgba(POW_COLORS[k])+'.5)']; }
  return POW_RING;
}
function draw(){
  const shk = RM?0:S.shake; // v1.99.2 «Бережное небо»: при системном флаге экран не трясём
  const shx = shk>0?rand(-6,6)*shk:0, shy = shk>0?rand(-6,6)*shk:0;
  ctx.save(); ctx.translate(shx,shy);

  const h1 = 232+S.hueShift*.3, h2 = 200+S.hueShift*.3;
  ctx.fillStyle=bgGradient(h1,h2); ctx.fillRect(-20,-20,W+40,H+40);
  drawNebulas(h1,h2,performance.now()/1000);

  const sh = Q.level>=1, hq = Q.level>=2, uq = Q.level>=3; // sh — свечение, hq — полная графика, uq — ультра

  // параллакс-звёзды (на hq — мягкие тонированные точки + мерцание + блики)
  const twT = hq ? performance.now()/380 : 0;
  const nStars = uq ? bgStars.length : Math.min(90,bgStars.length); // «Ультра» — более густое звёздное поле
  // v1.280.0 «Скоростные полосы»: переключаемый эффект (Настройки → Игра и экран) — на скорости
  // точки вытягиваются в короткие штрихи. Включён по умолчанию, отдельно от самого тира графики:
  // тир решает МОЖЕТ ли устройство, переключатель — ХОЧЕТ ли игрок. Q0 не участвует (sh=false там).
  /* v1.282.15: полосы только когда мир действительно летит. S.speed обнуляется лишь в
     startGame, поэтому на экране итогов он застывал около 8 — и фон стоял застывшим
     «гиперпространственным» смазом из полос до 49 пикселей, которые никуда не движутся.
     Плюс это самый «моушенный» эффект в игре, а системное «уменьшить движение» его
     не касалось вовсе. */
  const streaksMoving = S.running && !S.paused && !S.dying && S.timeScale>.5;
  const streaksOn = (typeof SPEED_STREAKS==='undefined' || SPEED_STREAKS) && sh && !RM && streaksMoving && S.speed>0;
  for (let si=0;si<nStars;si++){ const s=bgStars[si];
    s.y += .024*frameDt*S.speed*S.timeScale*(1+s.z); // v1.282.15: по времени, а не по кадру. Единственная симуляция внутри draw() — на дисплее 120 Гц фон летел ВДВОЕ быстрее препятствий, параллакс выворачивался наизнанку, а на замершей паузе почти стоял (0.0004×60 = 0.024)
    if (s.y>1) s.y-=1;
    ctx.globalAlpha = .25+s.z*.55 + (hq ? Math.sin(twT+s.x*40)*(uq?.16:.12) : 0);
    const sx=s.x*W, sy=s.y*H;
    if(streaksOn){
      const len=(2+s.s*1.6)*(1+S.speed*.55)*(1+s.z*.5); // длина штриха — от скорости и глубины звезды
      const hh=(s.x*6.13+s.z*3.7)%1; // те же тона, что starDot()
      ctx.strokeStyle=STREAK_COL[hh<.16?0:hh<.38?1:2]; ctx.lineWidth=s.s;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx,sy-len); ctx.stroke();
    } else if(hq){ // оттенок стабилен на звезду: хешируем по x и z (y ползёт!)
      const hh=(s.x*6.13+s.z*3.7)%1;
      const sp=starDot(hh<.16?'w':hh<.38?'c':'b');
      const sz=s.s*(s.z>0.82?(uq?5.2:4.6):(uq?3.8:3.4));
      ctx.drawImage(sp,sx-sz/2,sy-sz/2,sz,sz);
    } else {
      ctx.fillStyle='#cfe0ff';
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    if (hq && s.z>0.82 && !streaksOn){ // крестовидный блик у самых ярких звёзд — не сочетается с вытянутым штрихом
      const fl=1.4+Math.sin(twT*1.3+s.x*40)*.7;
      ctx.strokeStyle='rgba(220,235,255,.3)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx-3*fl,sy); ctx.lineTo(sx+3*fl,sy);
      ctx.moveTo(sx,sy-3*fl); ctx.lineTo(sx,sy+3*fl); ctx.stroke();
    }
  }
  ctx.globalAlpha=1;

  planetSky(performance.now()/1000); // v1.100.0 «Планетарий»: метеор, маяк, созвездие, станция, отметины пути

  // Экраны поверх (меню, итоги, настройки, ангар): спокойный космос — без поля,
  // но с эффектами (конфетти рекорда). Поле — только в игре и на паузе (под диммером)
  if (screenName!=='game' && screenName!=='pause'){ drawFx(hq,sh); ctx.restore(); return; }

  // звёзды (монеты): спрайт-свечение вместо shadowBlur — мягче и дешевле
  for (const s of stars){
    const glow = 6+Math.sin(s.ph)*3;
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.ph*.3);
    ctx.globalAlpha=.55+Math.sin(s.ph)*.18; ctx.drawImage(starGlow(),-15,-15,30,30); ctx.globalAlpha=1; // v1.37.0: спрайт-ауреола всем ступеням — дешевле shadowBlur
    ctx.fillStyle=juicy('#ffe9a8','color(display-p3 1 .93 .62)'); // v1.99.3 «Сочные чернила»: тело звезды — сочное золото флагману
    ctx.beginPath();
    for(let i=0;i<8;i++){ const a=i/8*6.283, r=i%2?4:9+glow*.3;
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); }
    ctx.closePath(); ctx.fill();
    if(sh){ // искра в центре (v1.37.0: со средней ступени)
      ctx.fillStyle='#fffbe8'; ctx.beginPath(); ctx.arc(0,0,2.4,0,6.283); ctx.fill();
    }
    if(uq){ // ультра: крестовидный блик
      ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
    }
    ctx.restore();
  }
  goldDraw(); // v1.100.2 «Золотая звезда дня»: снич над монетным россыпью — маяк, ореол, вспышка поимки

  // бонусы: ауреола по цвету + пульсирующее внешнее кольцо (hq)
  const PR=powRing(); // v1.66.0: готовые строки цветов — не собираем объекты в каждом кадре
  for (const p of powerups){
    ctx.save(); ctx.translate(p.x, p.y+Math.sin(p.ph)*3);
    const col=POW_COLORS[p.kind]; // v1.40.0 «Шесть жестов»; v1.43.1: Таран — плазменный синий, янтарь остаётся ловцу
    ctx.globalAlpha=.85; ctx.drawImage(powGlow(col),-20,-20,40,40); ctx.globalAlpha=1; // v1.37.0: ауреола всем ступеням — кэш-спрайт
    ctx.fillStyle='rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(0,0,p.r+3,0,6.283); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke();
    if(sh){ // внешнее кольцо дышит (v1.37.0: со средней ступени)
      ctx.strokeStyle=PR[p.kind][0]; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,p.r+8+Math.sin(p.ph*1.3)*2,0,6.283); ctx.stroke();
    }
    if(uq){ // ультра: встречное пунктирное кольцо
      ctx.strokeStyle=PR[p.kind][1]; ctx.lineWidth=1;
      ctx.setLineDash([4,6]); ctx.lineDashOffset=p.ph*8;
      ctx.beginPath(); ctx.arc(0,0,p.r+13,0,6.283); ctx.stroke(); ctx.setLineDash([]);
    }
    drawGlyph(ctx,p.kind,col); ctx.restore(); // v1.105.0: силуэт знает свой цвет сам
  }

  // препятствия
  for (const o of obstacles){
    ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.rot);
    if (o.kind==='debris'){ // семья обломков (v1.105.0 «Свет и дым»): один смысл «рукотворный
      // мусор», четыре лица; габарит o.w×o.h священен — читаемость столкновения не меняется
      const sk=o.skin||0, hw=o.w/2, hh=o.h/2;
      if(sh){ ctx.globalAlpha=.4; ctx.drawImage(powGlow('#aebbd2'),-hw-9,-hh-9,o.w+18,o.h+18); ctx.globalAlpha=1; } // спрайт-ауреола
      // v1.282.20: мягкий металл (свет сверху, тень снизу) — кэш по высоте обломка и лицу
      const qh=Math.round(hh*4)/4, mgk='dbr'+qh+(sk===3?'a':'b'); let mg=gradCache[mgk];
      if(!mg){ mg=ctx.createLinearGradient(0,-qh,0,qh);
        mg.addColorStop(0,sk===3?'#d2dbeb':'#cdd7ea'); mg.addColorStop(.4,sk===3?'#aeb9d0':'#a9b6cf'); mg.addColorStop(1,'#7e8ba4'); gradPut(mgk,mg); }
      ctx.fillStyle=mg;
      if(sk===1){ // погнутая панель: две половины под углом
        ctx.save(); ctx.rotate(.14); rr(ctx,-hw,-hh,hw+1,o.h,3); ctx.fill(); ctx.restore();
        ctx.save(); ctx.rotate(-.14); rr(ctx,-1,-hh,hw+1,o.h,3); ctx.fill(); ctx.restore();
        ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=1.1;
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+2); ctx.lineTo(-2,-hh-1);
        ctx.moveTo(2,-hh-1); ctx.lineTo(hw-4,-hh+2); ctx.stroke();
        ctx.fillStyle='rgba(20,28,52,.3)';
        ctx.beginPath(); ctx.arc(-o.w*.26,2,1.1,0,6.283); ctx.arc(o.w*.26,2,1.1,0,6.283); ctx.fill();
      } else if(sk===2){ // обломок антенны: панель + сломанный штырь внутри габарита
        rr(ctx,-hw,-hh,o.w,o.h,3.5); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+1); ctx.lineTo(hw-4,-hh+1); ctx.stroke();
        ctx.strokeStyle='#9fabca'; ctx.lineWidth=2.4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(8,-hh+2); ctx.stroke();
        ctx.fillStyle='#d8e0ee'; ctx.beginPath(); ctx.arc(9,-hh+1.5,2,0,6.283); ctx.fill();
      } else if(sk===3){ // бак: капсула с обечайками и огоньком
        rr(ctx,-hw,-hh,o.w,o.h,hh); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-hw+8,-hh+2); ctx.lineTo(hw-8,-hh+2); ctx.stroke();
        ctx.strokeStyle='rgba(20,28,52,.3)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-10,-hh+2); ctx.lineTo(-10,hh-2);
        ctx.moveTo(10,-hh+2); ctx.lineTo(10,hh-2); ctx.stroke();
        if(sh){ ctx.drawImage(powGlow('#ffe2b0'),hw-14,-5,10,10);
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-9,0,1.4,0,6.283); ctx.fill(); }
      } else { // панель: скруглённый металл, шов и заклёпки
        rr(ctx,-hw,-hh,o.w,o.h,3.5); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2; // кромка света — линия, не полоса
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+1); ctx.lineTo(hw-4,-hh+1); ctx.stroke();
        ctx.strokeStyle='rgba(20,28,52,.28)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-hw+3,2); ctx.lineTo(hw-3,2); ctx.stroke();
        ctx.fillStyle='rgba(20,28,52,.35)';
        for(const px of [-hw+8,-8,8,hw-8]){ ctx.beginPath(); ctx.arc(px,-3,1.1,0,6.283); ctx.fill(); }
        if(sh){ ctx.drawImage(powGlow('#ffe2b0'),hw-12,-8,12,12); // сигнальный огонёк светится
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-6,-2,1.5,0,6.283); ctx.fill(); }
      }
    } else if (o.kind==='mine' || o.kind==='seeker'){
      const col = o.kind==='seeker' ? '#ffa53a' : '#ff5f6d'; // ловец — янтарный
      const pl=1+Math.sin(o.pulse)*.12;
      ctx.scale(pl,pl);
      ctx.globalAlpha=sh?1:.8; ctx.drawImage(powGlow(col),-o.r-12,-o.r-12,(o.r+12)*2,(o.r+12)*2); ctx.globalAlpha=1; // v1.66.0: опасность светится спрайтом на всех ступенях — shadowBlur ушёл
      ctx.fillStyle='#3a2430';
      ctx.beginPath(); ctx.arc(0,0,o.r,0,6.283); ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      ctx.globalAlpha=.55+.45*Math.sin(o.pulse*2); // ядро мигает — сигнал опасности
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
      ctx.globalAlpha=1;
      if(sh){ // внутреннее кольцо — детализация корпуса (v1.37.0: со средней)
        ctx.strokeStyle=partCol(hexToRgba(col),.35); ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,o.r*.55,0,6.283); ctx.stroke();
      }
      if(uq){ // ультра: вращающийся пунктир — телеграф опасности
        ctx.strokeStyle=partCol(hexToRgba(col),.55); ctx.lineWidth=1.2;
        ctx.setLineDash([5,7]); ctx.lineDashOffset=-performance.now()/40;
        ctx.beginPath(); ctx.arc(0,0,o.r+7,0,6.283); ctx.stroke(); ctx.setLineDash([]);
      }
      for(let i=0;i<6;i++){ const a=i/6*6.283;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*o.r,Math.sin(a)*o.r);
        ctx.lineTo(Math.cos(a)*(o.r+6),Math.sin(a)*(o.r+6)); ctx.stroke(); }
      if (o.kind==='seeker'){ // кольцо-прицел вокруг ловца
        ctx.strokeStyle='rgba(255,165,58,.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,o.r+11,0,6.283); ctx.stroke();
      }
    } else if (o.kind==='sat'){ // семья спутников (v1.105.0 «Свет и дым»): четыре лица
      // «рукотворного мусора»; конверт ±1.9r × ±0.9r священен — читаемость прежняя,
      // циан ушёл, пришла сталь с кромкой света; маячок и линза — у каждого лица
      const sk=o.skin||0, r2=o.r;
      if(sh){ ctx.globalAlpha=.6; ctx.drawImage(powGlow('#78b4ff'),-r2,-r2,r2*2,r2*2); ctx.globalAlpha=1; } // ядро — спрайт
      const satPanel=(px,py,pw,ph2)=>{ const qy=Math.round(py*4)/4, qh2=Math.round(ph2*4)/4;
        const k='sp'+qy+'_'+qh2; let g=gradCache[k];
        if(!g){ g=ctx.createLinearGradient(0,qy,0,qy+qh2);
          g.addColorStop(0,'#4a629a'); g.addColorStop(.5,'#33487c'); g.addColorStop(1,'#263a66'); gradPut(k,g); }
        ctx.fillStyle=g; rr(ctx,px,py,pw,ph2,2.5); ctx.fill();
        ctx.strokeStyle='rgba(180,210,250,.4)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(px+2,py+.5); ctx.lineTo(px+pw-2,py+.5); ctx.stroke(); };
      const satBody=(bw,bh,brad)=>{ const qb=Math.round(bh*2)/4; // половина высоты, четверть меры
        const k='sb'+qb; let g=gradCache[k];
        if(!g){ g=ctx.createLinearGradient(0,-qb,0,qb);
          g.addColorStop(0,'#8ea6d8'); g.addColorStop(.45,'#6c83b8'); g.addColorStop(1,'#4c5f8e'); gradPut(k,g); }
        ctx.fillStyle=g; rr(ctx,-bw/2,-bh/2,bw,bh,brad); ctx.fill();
        ctx.strokeStyle='rgba(220,235,255,.4)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-bw/2+3,-bh/2+.5); ctx.lineTo(bw/2-3,-bh/2+.5); ctx.stroke(); };
      const satBeacon=(bx,by)=>{ ctx.globalAlpha=.4+.6*Math.abs(Math.sin(o.ph*2.2));
        if(sh) ctx.drawImage(powGlow('#ff7a6a'),bx-6,by-6,12,12);
        ctx.fillStyle='#ff8a7a'; ctx.beginPath(); ctx.arc(bx,by,2,0,6.283); ctx.fill(); ctx.globalAlpha=1; };
      const satLens=(lx,ly,lr2)=>{ const qx=Math.round(lx*4)/4, qy2=Math.round(ly*4)/4, qr=Math.round(lr2*4)/4;
        const k='sl'+qx+'_'+qy2+'_'+qr; let g=gradCache[k];
        if(!g){ g=ctx.createRadialGradient(qx-2,qy2-2,1,qx,qy2,qr||.1);
          g.addColorStop(0,'#f4f8ff'); g.addColorStop(1,'#b9c8ec'); gradPut(k,g); }
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(lx,ly,lr2,0,6.283); ctx.fill(); };
      if(sk===1){ // кубсат: тонкие крылья-планки и куб
        satPanel(-r2*1.9,-r2*.14,r2*1.05,r2*.28); satPanel(r2*.85,-r2*.14,r2*1.05,r2*.28);
        satPanel(-r2*.14,-r2*.9,r2*.28,r2*.55);
        satBody(r2*1.3,r2*1.3,3); satBeacon(0,-r2*.86); satLens(0,0,r2*.3);
      } else if(sk===2){ // зонд: сфера-обтекатель и тарелка
        satPanel(-r2*1.9,-r2*.26,r2*.8,r2*.52); satPanel(r2*1.1,-r2*.26,r2*.8,r2*.52);
        satBody(r2*1.5,r2*1.0,8);
        ctx.strokeStyle='#9fabca'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,-r2*.5); ctx.lineTo(0,-r2*.78); ctx.stroke();
        const qd=Math.round(r2*4)/4, dk='sd'+qd; let g=gradCache[dk];
        if(!g){ g=ctx.createLinearGradient(0,-qd*1.05,0,-qd*.7);
          g.addColorStop(0,'#8ea6d8'); g.addColorStop(1,'#4c5f8e'); gradPut(dk,g); }
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,-r2*.78,r2*.26,Math.PI,0); ctx.fill();
        satBeacon(r2*.42,-r2*.4); satLens(0,2,r2*.24);
      } else if(sk===3){ // телескоп: труба с объективом и одна панель
        satPanel(-r2*1.9,-r2*.2,r2*.8,r2*.4);
        satBody(r2*2.1,r2*.85,9);
        ctx.fillStyle='rgba(20,28,52,.35)'; ctx.beginPath(); ctx.arc(r2*.62,0,r2*.3,0,6.283); ctx.fill();
        ctx.fillStyle='rgba(150,200,255,.5)'; ctx.beginPath(); ctx.arc(r2*.62,0,r2*.16,0,6.283); ctx.fill();
        satBeacon(-r2*.5,-r2*.5); satLens(-r2*.15,0,r2*.2);
      } else { // классика: корпус и два крыла
        satPanel(-r2*1.9,-r2*.32,r2*.85,r2*.64); satPanel(r2*1.05,-r2*.32,r2*.85,r2*.64);
        satBody(r2*1.8,r2*1.1,4); satBeacon(0,-r2*.75); satLens(0,0,r2*.28);
      }
    } else if (o.kind==='comet'){ // комета: яркое ядро + хвост по вектору полёта
      const tx=-o.vx*7, ty=-o.vy*7;
      if(sh) ctx.globalCompositeOperation='lighter'; // хвост светится аддитивно (v1.37.0: со средней)
      const tk=tx*4096+ty; // v1.66.0: градиент хвоста кэшируется на комету — скорость у неё постоянная
      if(!o._tg || o._tgk!==tk){
        o._tg=ctx.createLinearGradient(0,0,tx,ty); o._tgk=tk;
        o._tg.addColorStop(0,'rgba(255,220,150,.85)'); o._tg.addColorStop(1,'rgba(255,120,60,0)');
      }
      ctx.strokeStyle=o._tg; ctx.lineWidth=o.r*1.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(tx,ty); ctx.stroke();
      if(sh) ctx.globalCompositeOperation='source-over';
      if(uq){ // ультра: аддитивное кольцо вокруг ядра
        ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=.5;
        ctx.strokeStyle='#ffe9c0'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,o.r+3+Math.sin(performance.now()/300)*1.5,0,6.283); ctx.stroke();
        ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
      }
      ctx.globalAlpha=.9; ctx.drawImage(powGlow('#ffd28f'),-20,-20,40,40); ctx.globalAlpha=1; // v1.37.0: тёплая ауреола ядра всем ступеням
      // v1.66.0: shadowBlur ядра убран — ауреола выше уже даёт свечение
      ctx.fillStyle='#fff3d8'; ctx.beginPath(); ctx.arc(0,0,o.r,0,6.283); ctx.fill();
      ctx.fillStyle='#ffcf8f'; ctx.beginPath(); ctx.arc(-o.r*.2,-o.r*.2,o.r*.45,0,6.283); ctx.fill();
    } else if (o.kind==='gate'){ // ворота: два пилона + луч между ними
      const g2=o.gap/2;
      if(sh){ // v1.66.0: свечение ворот — широкий полупрозрачный дубль луча + спрайты пилонов вместо shadowBlur
        ctx.strokeStyle='rgba(159,232,255,.22)'; ctx.lineWidth=6;
        ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
        ctx.globalAlpha=.55;
        for (const sgn of [-1,1]) ctx.drawImage(powGlow('#9fe8ff'),sgn*g2-o.r-6,-o.r-6,(o.r+6)*2,(o.r+6)*2);
        ctx.globalAlpha=1; }
      if(sh && !o.passed){ // бегущая энергия по лучу (v1.37.0: со средней)
        ctx.setLineDash([7,7]); ctx.lineDashOffset=-performance.now()/28;
      }
      ctx.strokeStyle=o.passed?'rgba(159,232,255,.25)':'rgba(159,232,255,.8)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
      if(sh) ctx.setLineDash([]);
      ctx.fillStyle='#3d5a80';
      for (const sgn of [-1,1]){
        ctx.beginPath(); ctx.arc(sgn*g2,0,o.r,0,6.283); ctx.fill();
        ctx.strokeStyle='#9fe8ff'; ctx.lineWidth=2; ctx.stroke();
        if(sh){ // внутреннее кольцо пилона (v1.37.0: со средней)
          ctx.strokeStyle='rgba(159,232,255,.35)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(sgn*g2,0,o.r*.55,0,6.283); ctx.stroke();
        }
        ctx.fillStyle='#9fe8ff'; ctx.beginPath(); ctx.arc(sgn*g2,0,3,0,6.283); ctx.fill();
        ctx.fillStyle='#3d5a80';
      }
    } else {
      ctx.fillStyle=planetRockTint(o); // v1.100.0 «Планетарий»: тон камня — база, лёд или железо (мина остаётся красной)
      ctx.strokeStyle='rgba(200,215,240,.35)'; ctx.lineWidth=1.5;
      /* Силуэт чеканится ОДИН РАЗ на объект и живёт в нём. Форма не меняется никогда:
         o.verts и o.r ставятся при спавне и за жизнь объекта не мутируют — а считалась
         она заново в каждом кадре, семь пар Math.cos/sin на камень, около шести тысяч
         пар в секунду при полном поле. Кэш обязан сбрасываться при взятии из пула
         (см. game.js), иначе переиспользованный объект унесёт чужую форму — ровно так
         в v1.282.14 астероиды покрасились в лиловый цвет дрейферов через `_tint`. */
      if(!o._path){
        const pth=new Path2D();
        o.verts.forEach((v,i)=>{ const x=Math.cos(v.a)*v.r*o.r, y=Math.sin(v.a)*v.r*o.r;
          i?pth.lineTo(x,y):pth.moveTo(x,y); });
        pth.closePath(); o._path=pth;
      }
      ctx.fill(o._path); ctx.stroke(o._path);
      ctx.save(); ctx.clip(o._path); // v1.39.0: вся штриховка — строго внутри силуэта, блики не вылезают за края
      if(sh){ // объём: блик сверху-слева + светлый кратер (v1.37.0: со средней)
        ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,o.r*.9,-2.7,-1.2); ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.07)';
        ctx.beginPath(); ctx.arc(o.r*.3,o.r*.25,o.r*.22,0,6.283); ctx.fill();
      }
      if(uq){ // ультра: глубже рельеф — теневая дуга и второй кратер
        ctx.strokeStyle='rgba(0,0,0,.18)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,o.r*.85,.4,1.8); ctx.stroke();
        ctx.fillStyle='rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.arc(o.r*.15,-o.r*.35,o.r*.16,0,6.283); ctx.fill();
      }
      ctx.fillStyle='rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.arc(-o.r*.25,-o.r*.2,o.r*.3,0,6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // v1.105.0 «Свет и дым»: «бегущая кромка света» на камнях снята (суд глаза: белая дуга
  // читалась как царапина); тон камней — лёд/железо — остаётся, он даёт разнообразие без крика

  // Bullet Time: мир замедлен — холодные гало вокруг препятствий + лёгкая вуаль.
  // Вместо shadowBlur — кэш-спрайт powGlow: тот же motion-glow без нагрузки на слабые устройства
  if (S.bt>0 && S.timeScale<.95){
    const k=1-S.timeScale; // 0..0.6 — сила эффекта, затухает вместе с таймером
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=k*.9;
    const g=powGlow('#8fd0ff');
    for (const o of obstacles){ const r=o.r*3.2; ctx.drawImage(g,o.x-r,o.y-r,r*2,r*2); }
    ctx.restore();
    ctx.fillStyle='rgba(110,160,255,'+(k*.14).toFixed(3)+')';
    ctx.fillRect(0,0,W,H);
  }

  // личный призрак: полупрозрачный силуэт рекордного забега (та же форма самолётика)
  if (ghostOn){
    const gCol=(ghostForeign && SKINS[ghostSkin]) ? SKINS[ghostSkin].body : '#bfe8ff'; // чужой призрак — цвета его скина (живая витрина ангара)
    ctx.save(); ctx.translate(ghostX,ghostY); ctx.globalAlpha=ghostA;
    if(hq){ ctx.globalAlpha=ghostA*.9; ctx.drawImage(powGlow(gCol),-24,-24,48,48); ctx.globalAlpha=ghostA; } // холодная ауреола
    ctx.fillStyle=gCol;
    ctx.beginPath();
    ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha=ghostA*.55; // складка — тот же цвет, половинная плотность
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.restore();
    /* Подпись первые 4 секунды и тает. Чужой призрак подписан именем владельца — это
       живая витрина ангара. Своя тень с 13.08.2026 подписана «ЕЩЁ РАЗ?»: v1.87.0
       отобрала у неё слова намеренно, владелец вернул их так же намеренно.
       Текст берём из словаря — подпись попадает на экран игры, а там не должно быть
       ни одной строки на чужом для игрока языке. Заглавные — как весь текст на канвасе
       (Каталог №31: canvas не слышит text-transform из CSS). */
    if (ghostTagT>0){
      const tag = ghostForeign ? (ghostName||'') : ((typeof L!=='undefined' && L && L.again) ? L.again : '');
      if (tag){
        ctx.save(); ctx.globalAlpha=clamp(ghostTagT,0,1)*.85;
        ctx.fillStyle=gCol; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.font='500 12px -apple-system,"Segoe UI",Roboto,sans-serif';
        ctx.fillText(String(tag).toUpperCase(), ghostX, ghostY-30);
        ctx.restore();
      }
    }
  }

  drawMorse(); // морзянка: позывной в шлейфе (v1.53.0)

  drawPlane(sh);
  planetPlaneFx(performance.now()/1000); // v1.100.0 «Планетарий»: вспышка крыла при крене + искры звезды

  drawFx(hq,sh); // частицы + попапы (общий блок, в оверлеях тоже)

  // аура Пули — огненное свечение за самолётиком (v1.40.0, логика v1.19.0; v1.41.0: все ступени — низкой спрайт, ультре шире)
  if (S.dash>0){
    ctx.save();
    if(sh) ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.5+Math.sin(performance.now()/(uq?90:110))*.2;
    const ar=uq?39:29;
    ctx.drawImage(powGlow('#a9bcff'),plane.x-ar,plane.y-ar,ar*2,ar*2); // v1.43.1: плазма, не янтарь
    ctx.restore();
  }

  // кольцо щита
  if (S.shield>0){
    ctx.save(); ctx.translate(plane.x,plane.y);
    ctx.strokeStyle=`rgba(127,216,255,${.4+Math.sin(performance.now()/150)*.2})`;
    ctx.lineWidth=2;
    if(sh){ ctx.strokeStyle='rgba(127,216,255,.18)'; ctx.lineWidth=7; // v1.66.0: ореол щита — широкий мягкий дубль
      ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
      ctx.strokeStyle=`rgba(127,216,255,${.4+Math.sin(performance.now()/150)*.2})`; ctx.lineWidth=2; }
    ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
    if(hq){ // внешнее кольцо вращается
      ctx.strokeStyle='rgba(127,216,255,.35)'; ctx.lineWidth=1.5;
      ctx.setLineDash([5,8]); ctx.lineDashOffset=performance.now()/35;
      ctx.beginPath(); ctx.arc(0,0,37,0,6.283); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  ctx.restore();

  // виньетка поверх кадра — глубина (только hq, без шейка)
  /* v1.282.13: размеры назначения обязательны. Спрайт чеканится в НАСТОЯЩИХ пикселях
     (W*DPR × H*DPR), а холст в этот момент под трансформом DPR*SC — без явных W,H
     картинка ложилась в DPR раз крупнее кадра, и на телефоне (DPR 2-3) затемнение
     краёв уезжало за экран: глубины не было вовсе. На верстаке DPR=1, поэтому
     глазами беда не ловилась. Соседний nebulaField рисуется правильно — с ,0,0,W,H. */
  if(hq) ctx.drawImage(vignetteSprite(),0,0,W,H);

  // вспышка сверхновой — золотая заливка + расходящееся кольцо от самолётика (v1.18.0)
  if (S.flash>0 && !RM){ // v1.99.2 «Бережное небо»: при системном флаге вспышку заменяет тишина
    const fk=S.flash/.45;
    ctx.fillStyle=juicy('rgba(255,240,168,'+(fk*.3).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.3).toFixed(3)+')'); ctx.fillRect(0,0,W,H); // v1.99.3 «Сочные чернила»: вспышка рекорда
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=juicy('rgba(255,240,168,'+(fk*.75).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.75).toFixed(3)+')'); ctx.lineWidth=2+5*fk;
    ctx.beginPath(); ctx.arc(plane.x,plane.y,(1-fk)*Math.max(W,H)+30,0,6.283); ctx.stroke();
    if(uq){ // ультра: второе кольцо вдогонку (v1.41.0)
      ctx.strokeStyle=juicy('rgba(255,240,168,'+(fk*.4).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.4).toFixed(3)+')'); ctx.lineWidth=1+3*fk;
      ctx.beginPath(); ctx.arc(plane.x,plane.y,(1-fk)*Math.max(W,H)*.7+30,0,6.283); ctx.stroke();
    }
    ctx.restore();
  }

  if (DEBUG_FPS){
    const el=$('fpsPill');
    if(el){ el.style.display='block'; el.textContent = Q.fps.toFixed(0)+' fps · Q'+Q.level+' · p'+particles.length; }
  }
}

/* Эхо-шлейф Призрака: кольцевой буфер недавних позиций (рисуем 2 копии с задержкой) */
const echoBuf=[];
function echoReset(){ echoBuf.length=0; }
function drawEchoTrail(skin){
  const n=echoBuf.length, marks=[[n-16,.13],[n-32,.06]];
  for(let i=0;i<2;i++){
    const idx=marks[i][0]; if(idx<0) continue;
    const e=echoBuf[idx];
    ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(e.bank*.55);
    ctx.globalAlpha=marks[i][1];
    ctx.fillStyle=skin.body;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------- Морзянка (v1.53.0): шлейф пишет позывной ----------
   Слой идентичности: простые линии на всех ступенях графики, цвет шлейфа скина.
   Старые точки прозрачнее — позывной читается у самолётика и тает позади. */
function morsePos(buf,a){ // позиция и угол касательной на дуге a (линейная интерполяция по буферу)
  if (a<=buf[0][2]) return [buf[0][0],buf[0][1],0];
  for (let i=1;i<buf.length;i++){
    if (buf[i][2]>=a){
      const p=buf[i-1], q=buf[i], d=q[2]-p[2], f=d>0?(a-p[2])/d:0;
      return [p[0]+(q[0]-p[0])*f, p[1]+(q[1]-p[1])*f, Math.atan2(q[1]-p[1],q[0]-p[0])];
    }
  }
  const l=buf[buf.length-1]; return [l[0],l[1],0];
}
function morseGlyphs(buf,elems,pl,colA){ // телеграфная лента: точка — кружок, тире — чёрточка по касательной
  if (!elems || !elems.length || !pl || buf.length<2) return;
  const arcMin=buf[0][2], arcMax=buf[buf.length-1][2];
  if (arcMax-arcMin<MORSE_UNIT) return;
  const cycle=pl*MORSE_UNIT;
  const c0=Math.max(0,Math.floor(arcMin/cycle)), c1=Math.floor(arcMax/cycle);
  ctx.lineCap='round';
  for (let c=c0;c<=c1;c++){
    for (const el of elems){
      const a0=(c*pl+el.off)*MORSE_UNIT, a1=a0+el.len*MORSE_UNIT;
      if (a0<arcMin || a1>arcMax) continue; // глиф целиком в окне — не всплывает по краям
      const mid=(a0+a1)/2, pos=morsePos(buf,mid);
      const age=(mid-arcMin)/(arcMax-arcMin); // 0 у хвоста → 1 у самолётика
      if (el.k==='dot'){
        ctx.fillStyle=colA(age);
        ctx.beginPath(); ctx.arc(pos[0],pos[1],2.8,0,6.2832); ctx.fill();
      } else {
        const hl=el.len*MORSE_UNIT*.4, ca=Math.cos(pos[2]), sa=Math.sin(pos[2]);
        ctx.strokeStyle=colA(age); ctx.lineWidth=4.5;
        ctx.beginPath(); ctx.moveTo(pos[0]-ca*hl,pos[1]-sa*hl); ctx.lineTo(pos[0]+ca*hl,pos[1]+sa*hl); ctx.stroke();
      }
    }
  }
}
/* v1.66.1: цвет глифа — 21 готовая строка на префикс, а не toFixed-конкатенация на каждый глиф в кадре */
const morseColCache={};
function morseCol(prefix, v){
  const q=v<=0?0:(v>=1?20:Math.round(v*20));
  const k=prefix+q;
  let s=morseColCache[k];
  if(!s){ s=prefix+(q/20).toFixed(2)+')'; morseColCache[k]=s; }
  return s;
}
function drawMorse(){
  if (!S.running || typeof morseBuf==='undefined' || typeof morseElems==='undefined') return; // микс версий из кэша — молчим, не падаем
  const skin=SKINS[S.skin]||SKINS[0];
  morseGlyphs(morseBuf, morseElems, morsePat.length, f=>morseCol(skin.trail, 0.18+0.6*f));
  if (ghostOn && ghostA>0)
    morseGlyphs(ghostMorseBuf, ghostMorseElems, ghostMorsePat.length, f=>morseCol('rgba(190,220,255,', ghostA*(0.5+2*f)));
}

function drawPlane(sh){
  const p=plane, skin=SKINS[S.skin]||SKINS[0], hq=Q.level>=2, uq=Q.level>=3; // v1.37.0: ультра-штрихи
  const fx=skin.fx||'';
  // Призрак: полупрозрачность с дыханием (hq) — себя терять нельзя, минимум .65
  const ghostA=(fx==='ghost'&&hq)? .65+.1*Math.sin(performance.now()/300) : 1;
  if(fx==='ghost'&&hq){ drawEchoTrail(skin);
    if(S.running&&!S.paused){ echoBuf.push({x:p.x,y:p.y,bank:p.bank}); if(echoBuf.length>40) echoBuf.shift(); } }
  ctx.save(); ctx.translate(p.x,p.y);
  if (S.invuln>0 && S.invuln<1e8 && invulnDim()) ctx.globalAlpha=(RM?.6:.35)*ghostA; // v1.94.0: театральное бессмертие (1e9) — без мигания, спектакль идёт ровно
  else if(ghostA<1) ctx.globalAlpha=ghostA;

  if(!coneGrad){
    coneGrad = ctx.createLinearGradient(0,10,0,150);
    coneGrad.addColorStop(0,'rgba(190,220,255,.30)');
    coneGrad.addColorStop(1,'rgba(190,220,255,0)');
  }
  if(hq){ // конус светится и дышит
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(RM?.9:(.75+.25*Math.sin(performance.now()/90)))*(S.invuln>0?.35:1); // v1.282.15: и пульсация под бережным небом замирает
  }
  ctx.fillStyle=coneGrad;
  ctx.beginPath(); ctx.moveTo(-6,10); ctx.lineTo(6,10);
  ctx.lineTo(34,150); ctx.lineTo(-34,150); ctx.closePath(); ctx.fill();
  // v1.282.15: мигание через общую функцию — бережное небо гасит стробоскоп
  if(hq){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=S.invuln>0&&invulnDim()?(RM?.6:.35):1; }

  if(hq){ // аура двигателя: тёплое аддитивное свечение кормы, дышит с огоньком
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(.30+.12*Math.sin(performance.now()/70))*(S.invuln>0?.4:1)*ghostA*planetEngineK(); // v1.100.0 «Планетарий»: корма разгорается со скоростью
    ctx.drawImage(trailGlow(skin),-17,0,34,34);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=(S.invuln>0&&invulnDim()?(RM?.6:.35):1)*ghostA; // v1.282.15: то же
  }

  ctx.rotate(p.bank*.55);
  if(sh){ const gs=uq?58:48; ctx.globalAlpha=.85*ghostA; // v1.66.0: аура корпуса — кэш-спрайт; ультра светится шире
    ctx.drawImage(planeGlow(skin),-gs/2,-gs/2-6,gs,gs); ctx.globalAlpha=ghostA; }
  ctx.fillStyle=sh?planeGrad(skin):skin.body; // v1.37.0: объёмный градиент корпуса — со средней ступени
  ctx.beginPath();
  ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  ctx.fillStyle=skin.fold;
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  if(sh){ // кромки крыльев — хрусткая бумага; блик на носу + огонёк двигателя (v1.37.0: со средней ступени)
    ctx.strokeStyle='rgba(255,255,255,.32)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.moveTo(0,-22); ctx.lineTo(16,14); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(-3,-12,2.6,5,.25,0,6.283); ctx.fill();
    ctx.globalAlpha=.6+.4*Math.sin(performance.now()/70);
    ctx.fillStyle=skin.trail+'.95)';
    const er=fx==='plasma'? 3.4+1.6*Math.sin(performance.now()/60) : (uq?3.2:2.6); // у Плазмы — живой огонь; ультра — жарче
    ctx.beginPath(); ctx.arc(0,11,er,0,6.283); ctx.fill();
    ctx.globalAlpha=ghostA;
  }
  if(uq){ // ультра: зеркальный блик правого крыла
    ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(2,-18); ctx.lineTo(13,11); ctx.stroke();
  }
  if(hq && fx==='plasma'){ // Плазма: живой перелив корпуса оранж→синий
    const ph=performance.now()/180;
    ctx.globalAlpha=(.14+.08*Math.sin(ph))*ghostA;
    ctx.fillStyle=PLASMA_HUES[Math.max(4,Math.min(32,Math.round(18+14*Math.sin(ph*.7))))]; // v1.66.0: готовая строка
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=ghostA;
  }
  if(hq && fx==='neon'){ // Неон: контур корпуса пульсирует и плывёт по спектру
    const hue=(performance.now()*.06)%360|0;
    ctx.strokeStyle=NEON_HUES[hue]+(.9*ghostA)+')'; ctx.lineWidth=1.7; // v1.66.0: готовая строка оттенка
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.stroke();
  }
  if(hq && fx==='chrome'){ // Хром: бегущий блик-полоса по корпусу (дешёвый sheen)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.clip();
    const sx=-34+((performance.now()*.05)%68);
    ctx.drawImage(sheenSprite(),sx-9,-26,18,48); // v1.66.0: спрайт-полоса вместо градиента в кадре
    ctx.restore();
  }
  ctx.strokeStyle='rgba(120,140,180,.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.stroke();
  ctx.restore();
}

/* ================= LOOP (Блок 3: fixed timestep 60 Гц) ================= */
const STEP=1/60;
let acc=0, lastTime=0, rafId=0, menuDrawT=0, loopScr='', pauseT0=0, drawForce=false;
function drawKick(){ drawForce=true; } // внешнее событие (resize) — кадр вне очереди, но БЕЗ сброса часов сна (v1.66.2)
function loop(t){
  rafId=requestAnimationFrame(loop);
  let dt=(t-lastTime)/1000; lastTime=t;
  if(typeof pollGamepad==='function') pollGamepad(); // v1.99.4 «Штурвал»: опрос каждый кадр — руль и кнопки на любом экране
  if(dt>0.25)dt=0.25; if(dt<0)dt=0;
  /* v1.282.15: метрику снимаем ТОЛЬКО в небе. qualityTick считал итерации rAF, а рисуем
     мы на оверлеях намеренно вдвое реже (~30 fps), а на замершей паузе — вчетверо реже.
     То есть в меню Q.fps показывал 60 при тридцати реальных кадрах дешёвой сцены: авто
     уверенно лезло вверх по ступеням и снимало «потолок-памятку» (тот самый, что бережёт
     уровень, с которого мы упали). Постоял в меню полминуты — и следующий полёт начинается
     с заикания, пока лестница заново не спустится. На чужих экранах метрику замораживаем. */
  if (screenName==='game' && S.running && !S.paused) qualityTick(dt);
  else { Q._acc=0; Q._n=0; Q._t=0; }
  if (S.running && !S.paused){
    acc+=dt;
    let n=0;
    while(acc>=STEP && n<4){ update(STEP); acc-=STEP; n++; if(!S.running||S.paused){acc=0;break;} } // v1.99.2 «Бережное небо»: пауза доехала — кадр не докручиваем, время не отскакивает
    if(n===4) acc=0;
  } else {
    updateFx(dt); // частицы и попапы догорают на паузе и оверлеях (конфетти рекорда живёт)
  }
  // v1.66.2 «Спящая пауза»: в игре — полная частота; оверлеи (меню/настройки/итоги) — ~30 fps;
  // пауза: 2 с догорания частиц на ~30 fps, дальше ~4 fps — замороженному полю больше не нужно,
  // батарее и нагреву — почти ноль. Смена экрана или resize — свежий кадр сразу, без слота.
  const scr=screenName;
  if (drawForce || scr!==loopScr){ // принудительный кадр не трогает часы сна; смена экрана на паузу — взводит их
    drawForce=false;
    if (scr!==loopScr){ loopScr=scr; if(scr==='pause') pauseT0=t; }
    frameTick(t); draw(); menuDrawT=t; return;
  }
  if (scr==='game'){ frameTick(t); draw(); return; }
  if (scr==='pause'){
    if (t-menuDrawT>=((t-pauseT0<2000)?33:250)){ frameTick(t); draw(); menuDrawT=t; }
    return;
  }
  if (t-menuDrawT>=33){ frameTick(t); draw(); menuDrawT=t; }
}
function startLoop(){ if(!rafId){ lastTime=performance.now(); rafId=requestAnimationFrame(loop); } }
function stopLoop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
