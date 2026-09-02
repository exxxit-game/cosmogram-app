'use strict';
/* ============================================================
   RENDER: отрисовка, авто-качество по FPS, кэш градиентов,
   главный цикл (fixed timestep, рендер независимый).
   Зависит от core.js, game.js.
   ============================================================ */
/* Глоссарий коротких глобалов (см. также core.js) — переименование отклонено 22.08.2026:
     Q  — профиль адаптивного качества графики, объявлен чуть ниже: level (0=low 1=med
          2=high 3=ultra), fps, mode ('auto' или ручной выбор игрока), служебные счётчики
          автоподстройки (_acc/_n/_t/_up/_dn/_hold/_ceil/_prove).
     S  — центральное состояние забега (game.js). AC — AudioContext (core.js). */

/* ---------- Авто-качество (Блок 3/10): shadowBlur — главный мобильный тормоз ---------- */
const Q = { level:2, fps:60, mode:'auto', _acc:0, _n:0, _t:0, _up:0, _dn:0, _hold:0, _ceil:-1, _prove:0, _elapsed:0, _baseFps:null }; // 0=low 1=med 2=high 3=ultra; mode — настройка игрока
/* v1.477.26 «Разогрев отличим от слабого» (найдено 27.08.2026, веб-исследование про тепловой
   троттлинг): fps_drop/fps_drop_severe раньше несли только текущий Q.fps — по нему нельзя было
   отличить «телефон слабый с самого начала» от «телефон разогрелся и просел». Решение владельца:
   мерить средний FPS первых 60 секунд забега как ориентир (Q._baseFps, снимается один раз за
   сессию — Q не пересоздаётся между рестартами — и дальше не сдвигается), дальше нести в сигнале
   отношение текущего Q.fps к этому ориентиру. Геймплей (темп/сложность) НЕ меняет — это только
   диагностика, чтобы решить дальнейший шаг по живым данным, а не гадать. Страж 143. */
function qBaseInfo(){ return Q._baseFps ? ' base'+Math.round(Q._baseFps)+' ratio'+(Q.fps/Q._baseFps).toFixed(2) : ' base?'; }
function qThr(){ // пороги авто-качества: под тир GPU и под частоту экрана (v1.12.0) — на 120 Гц считаем по-честному; v1.35.0 — чуть мягче вверх, чтобы не гонять уровень туда-сюда
  const t=gfxTier(), hz=Store.get('dispHz',60);
  if (hz>=100) return {dn:Math.round(hz*.45), up:Math.round(hz*.85)};
  if (t>=2) return {dn:38, up:54};
  if (t===1) return {dn:36, up:50};
  return {dn:32, up:45};
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
  Q._acc+=dt; Q._n++; Q._t+=dt; Q._elapsed+=dt;
  if(Q._t>=1){
    const f = Q._n/Math.max(Q._acc,.001);
    Q.fps = lerp(Q.fps, f, .6);
    Q._acc=0; Q._n=0; Q._t=0;
    if (Q._baseFps===null && Q._elapsed>=60) Q._baseFps = Q.fps;
    const applyLevelChange = (nextLevel, signal) => {
      const prev = Q.level;
      if (nextLevel === prev) return false;
      Q.level = nextLevel;
      Q._dn=0; Q._up=0; Q._prove=0; Q._hold=8;
      if (typeof signal === 'number') Q._ceil = signal;
      Store.set('gfxLv',Q.level); Store.set('gfxCeil', Q._ceil); gfxCap(); resize();
      return true;
    };
    if (Q._hold>0){
      // v1.282.1 «Аварийный выход»: карантин был всегда ровно 8с независимо от тяжести —
      // тройной обвал (60→20 fps, настоящий троттлинг) спускался по ступеням МЕДЛЕННО:
      // 3с обнаружения + 8с карантина на каждую ступень, до ~24-33с заикания подряд, прежде
      // чем стабилизироваться. Погранично плохой fps (чуть ниже dn) по-прежнему ждёт полный
      // карантин — защита от дребезга жива. Только по-настоящему тяжёлая, устойчивая просадка
      // (заметно ниже dn) пробивает карантин раньше срока.
      const {dn:dnEarly}=qThr();
      if (Q.fps < dnEarly*.6 && Q.level>0){
        Q._ceil = Q.level;
        const changed = applyLevelChange(Q.level-1, Q._ceil);
        if (changed && typeof BEACON!=='undefined') BEACON.signal('fps_drop_severe', Math.round(Q.fps)+' '+frameProfileSnapshot()+qBaseInfo());
        return;
      }
      Q._hold--; Q._up=0; Q._dn=0; Q._prove=0; return; // карантин после смены уровня: небо не дёргается
    }
    /* 28.08.2026 «Доказательство лучше догадки»: потолок авто-подъёма был gfxUltraOk()?3:2 —
       статическая догадка по железу (строка GPU/ядра/память), которая на десктопном Firefox
       и подобных браузерах, прячущих GPU, ошибалась (владелец: ноутбук с рабочей видеокартой
       не мог подняться выше «Высокой»). Здесь же, чуть ниже, уже 8 секунд подряд ЖИВОГО fps
       выше `up` нужно, чтобы вообще подняться на ступень, и аварийный откат при просадке
       (см. Q._hold/Q._ceil выше) — та же страховка на каждом шаге. Потолок снят: живой подъём
       теперь может дойти до «Ультра» само́й доказанной стабильностью, а не догадкой о чипе.
       Ручной выбор «Ультра» в Настройках по-прежнему смотрит на gfxUltraOk() — там нет
       автооткада при просадке (ручной режим выключает qualityTick целиком), рисковать
       безопасно можно только там, где есть кому вовремя откатить. */
    const {dn,up}=qThr(), cap=3; // v1.7.0: среднему тиру красоту бережём до последнего; v1.12.0: флагману доступна «Ультра»
    const ceil = Q._ceil>=0 ? Math.min(cap,Q._ceil-1) : cap; // v1.35.0: уровень, с которого упали, авто не штурмует, пока устройство не докажет стабильность
    if(Q.fps<dn && Q.level>0){ if(++Q._dn>=3){ // 3 секунды просадки подряд — жертвуем и эффектами, и резолюцией
      Q._ceil = Q.level;
      const changed = applyLevelChange(Q.level-1, Q._ceil);
      if (changed && typeof BEACON!=='undefined') BEACON.signal('fps_drop', Math.round(Q.fps)+' '+frameProfileSnapshot()+qBaseInfo()); } } // v1.108.1: тихая автокоррекция теперь долетает до почты — раньше об этом узнавал только тот, кто сам зашёл в Сервисный центр
    else if(Q.fps>up && Q.level<ceil){ Q._dn=0; if(++Q._up>=8){ const old = Q.level; Q.level++; Q._up=0; Q._prove=0; Q._hold=8; Store.set('gfxLv',Q.level); gfxCap(); if (old !== Q.level) resize(); } } // v1.282.15: и разрешение поднимаем обратно — обе ветки понижения это делают, ветка повышения не делала, и после одной случайной просадки картинка оставалась мыльной до конца сессии // выученный уровень запоминаем между сессиями
    else if(Q.fps>up){ Q._dn=0; Q._up=0; if(Q._ceil>=0 && ++Q._prove>=20){ Q._ceil=-1; Q._prove=0; Store.set('gfxCeil',-1); } } // v1.284.22: устройство доказало запас — забываем потолок и в хранилище тоже, иначе он держал бы уровень внизу вечно // 20 секунд уверенного запаса — потолок-памятка снимается
    else { Q._up=0; Q._dn=0; Q._prove=0; }
  }
}
const DEBUG_FPS = /[?&#]debug/.test(location.href);
const frameProfile={bg:0,stars:0,sky:0,field:0,fx:0,update:0,n:0,last:0};
/* 22.08.2026 «Профиль летит в почту»: сводка по секциям (bg/stars/sky/field/fx) раньше
   считалась ТОЛЬКО при ?debug в адресной строке — у обычного игрока эти пять
   performance.now() не выполнялись вовсе, и в момент реальной просадки на слабом
   устройстве узнать, что именно ест кадр, было нечем: один тестовый телефон в руках
   разработчика — не представительная выборка. Сам расчёт (пять вызовов performance.now()
   на кадр, дёшево) теперь идёт всегда; под DEBUG_FPS остаётся только видимый на экране
   оверлей fpsPill. Снимок коротким текстом уезжает вместе с fps_drop/fps_drop_severe —
   тем же путём, что уже возит cal_storm разбор по источникам. */
function frameProfileSnapshot(){
  if(frameProfile.n<30) return '';
  const n=frameProfile.n;
  return 'bg:'+(frameProfile.bg/n).toFixed(1)+' st:'+(frameProfile.stars/n).toFixed(1)+
    ' sk:'+(frameProfile.sky/n).toFixed(1)+' fl:'+(frameProfile.field/n).toFixed(1)+
    ' fx:'+(frameProfile.fx/n).toFixed(1)+' upd:'+(frameProfile.update/n).toFixed(1); // 24.08.2026: физика ни разу не измерялась — единственное непокрытое место в бюджете кадра
}
function profileReport(){
  if(frameProfile.n<30) return;
  const now=performance.now();
  if(now-frameProfile.last<250) return;
  const n=frameProfile.n, el=DEBUG_FPS?$('fpsPill'):null;
  if(el){
    el.dataset.profile='1';
    // 26.08.2026: владелец разбирал этот же замер по кадрам с Samsung A3 (самое слабое
    // устройство с гироскопом, что нашлось) — 6мс наших фаз при 27мс бюджете кадра на 37fps,
    // а какой уровень качества (Q.level) автокачество выбрало на этом устройстве, строка не
    // говорила вовсе. Без этого нельзя было понять, легла ли автокачество на дно или ещё
    // есть куда снижать. Добавлена та же цифра, что уже есть в соседнем, более коротком
    // debug-выводе (строка ниже, el.dataset.profile ещё не выставлен).
    el.textContent=Q.fps.toFixed(0)+' fps | Q'+Q.level+' | bg '+(frameProfile.bg/n).toFixed(1)+' | stars '+(frameProfile.stars/n).toFixed(1)+' | sky '+(frameProfile.sky/n).toFixed(1)+' | field '+(frameProfile.field/n).toFixed(1)+' | fx '+(frameProfile.fx/n).toFixed(1)+' | upd '+(frameProfile.update/n).toFixed(1)+' ms';
  }
  frameProfile.bg=0; frameProfile.stars=0; frameProfile.sky=0; frameProfile.field=0; frameProfile.fx=0; frameProfile.update=0; frameProfile.n=0; frameProfile.last=now;
}
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
/* v1.475.0 «Безопасное мерцание»: комментарий выше уже фиксировал превышение (5.5 Гц против
   порога WCAG 2.3.1 в 3 Гц) — но тогдашнее решение гасило его только под системным флагом
   `prefers-reduced-motion`. Игрок, который этот флаг не включал (подавляющее большинство,
   включая тех, кто просто не знает о такой настройке ОС), по-прежнему получал мерцание выше
   порога при каждом ударе. WCAG 2.3.1 — требование ко ВСЕМ игрокам, не только к тем, кто
   явно попросил «бережное небо». Интервал увеличен с 90 до 180 мс: полный цикл теперь
   ~2.78 Гц, с запасом ниже порога, независимо от RM. */
function invulnDim(){ return RM ? true : (Math.floor(performance.now()/180)%2===0); }
let frameDt=1/60, _lastDrawT=0;
function frameTick(t){ const d=(t-_lastDrawT)/1000; _lastDrawT=t; frameDt=(d>0&&d<0.25)?d:1/60; }

/* кисть скруглённых форм (v1.105.0 «Свет и дым»): мир не бывает прямоугольной наклейкой —
   приборы могут быть плоскими, мир не может */
function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }

/* ---------- Кэш градиентов (пересоздаём только при смене волны/размера) ---------- */
let bgCache={h:-1,w:-1,ht:-1,g:null};
/* 01.09.2026 «Настроение неба»: m=50 — сегодняшний вид без изменений (62/58/70 sat, 10/16/26
   light — те же числа, что были зашиты намертво), m двигает насыщенность/яркость всех трёх
   точек вместе, оттенок не трогает. Формула и диапазоны — из macet-01-09-nastroenie-neba.html,
   численно сверены verify-mood.js (5008 проверок, 0 расхождений) и глазами на 3 оттенках×5 значений. */
function moodSL(m){
  const dm=(m-50)/50;
  return {
    S0:clamp(62+dm*18,15,90), L0:clamp(10+dm*14,3,45),
    S1:clamp(58+dm*20,15,90), L1:clamp(16+dm*16,4,50),
    S2:clamp(70+dm*15,20,95), L2:clamp(26+dm*20,8,60),
  };
}
function bgGradient(h1,h2,mood){
  const hq0=Math.round(S.hueShift); // квант: плавный дрейф не пересобирает кэш каждый кадр (v1.24.0)
  const mq0=Math.round(isFinite(mood)?mood:50);
  if(bgCache.h!==hq0||bgCache.w!==W||bgCache.ht!==H||bgCache.m!==mq0){
    const sl=moodSL(mq0);
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,`hsl(${h1},${sl.S0}%,${sl.L0}%)`);
    g.addColorStop(.55,`hsl(${h1},${sl.S1}%,${sl.L1}%)`);
    g.addColorStop(1,`hsl(${h2},${sl.S2}%,${sl.L2}%)`);
    bgCache={h:hq0,w:W,ht:H,m:mq0,g};
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
    /* 23.08.2026 «Виньетка не плющится»: раньше радиус считался от min(W,H)/max(W,H) по
       отдельности — на портрете (390×844, боевая версия) это давало мягкое пятно шире
       экрана, на широком браузере (жалоба владельца, скриншот) — узкую вертикальную
       полосу, читавшуюся как отдельное фиолетовое пятно, не виньетку. Теперь радиус —
       от диагонали (Math.hypot), коэффициенты подобраны так, что портрет остаётся
       МАТЕМАТИЧЕСКИ ТЕМ ЖЕ (136.5px/658.3px) — не выдуманный новый вид для телефона,
       точное сохранение старого. На широких экранах разрыв сокращается (не исчезает
       полностью — полное совпадение портрета и широкого вида это отдельная, более
       крупная развилка на будущее: не растягивать виньетку на неигровые поля вовсе). */
    /* 23.08.2026 «Виньетка живёт в коридоре, не в окне» (второй заход — диагональ смягчила
       пятно, но не убрала: владелец, «пятно вижу»). Эффективная ширина ограничена шириной
       коридора (fieldW()=390 мер) — тем же приёмом, что уже применён к #topHud. На портрете
       W и так ≤390, min ничего не меняет — численно проверено, что портрет остаётся тем же.
       На широком экране радиус перестаёт расти вместе с окном: внешняя граница гаснет
       внутри игровой полосы, а не растягивается на пустые поля по бокам. */
    const effW=Math.min(W,fieldW()), diag=Math.hypot(effW,H), k0=0.1468, k1=0.7081;
    const g=x.createRadialGradient(W/2,H*.45,diag*k0, W/2,H*.55, diag*k1);
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
/* 28.08.2026 «Переливается, а не дёргается»: было 60 (~50с) — форма и оттенок стояли почти
   весь обычный забег, менялись одним заметным скачком. Владелец: хочет постепенное движение,
   не статику. 20 (~17с) — втрое чаще пересборка (та же однократная работа при пересборке,
   что и была: 15 blob(), больше НЕ 240 точек пыли — она снята выше), от «833мс» — исходной
   поломки, которую квантование чинило изначально, — всё ещё дальше на два порядка, дно не
   почувствует. Три маленьких шага вместо одного большого на тот же отрезок полёта. */
const NF_HUE_STEP=20; // единиц hueShift на одну пересборку: ~17 секунд полёта
let nfCache={w:-1,ht:-1,h:-1,d:-1,s:-1,c:null};
let nfSeed=0;         // узор трассы: ставится один раз за забег, от оттенка не зависит
function nebulaReseed(){ nfSeed=((Math.floor(Math.random()*4294967296))>>>0)||1; nfCache.h=-1; }
const NF_MARGIN=.14; // запас на панораму — доля от размера текстуры с каждой стороны (22.08.2026)
function nfPanOffset(tN,marginW,marginH){ // 22.08.2026 «Небо тоже плывёт»: главная текстура стояла на месте почти весь забег —
  // одно зерно на весь полёт, пересборка раз в ~50с меняла только оттенок, не форму. Владелец
  // подтвердил на разных устройствах: «туман не двигается, такой же как был». Медленная
  // панорама внутри запаса, две независимые (несинхронные) синусоиды — не дёргается, не
  // закольцовывается заметно за один забег (период в сотни секунд).
  // 26.08.2026: тот же класс жалобы, но про «звёздную пыль» ВНУТРИ этой самой текстуры
  // (nebulaField, 240 точек, v1.282.21) — период в сотни секунд означал, что за один
  // обычный полёт пыль физически не успевала показать, что вообще движется, и выглядела
  // прибитой гвоздями рядом с быстро летящим передним планом. Ускорено в ~6.7 раза —
  // численно проверено коротким скриптом ДО правки: заметный сдвиг уже за 30с, больше
  // половины оборота за 90с — по-прежнему плавно, не дёргано и не закольцовывается видимо
  // за короткий полёт, но и не воспринимается «неподвижной».
  return { x: marginW*(0.5+0.5*Math.sin(tN*.08)), y: marginH*(0.5+0.5*Math.cos(tN*.06)) };
}
function nebulaField(h1,h2){
  const hq=Math.round(S.hueShift/NF_HUE_STEP);
  if(nfCache.w===W&&nfCache.ht===H&&nfCache.h===hq&&nfCache.d===DPR&&nfCache.s===SC) return nfCache.c;
  const px=skyPx(); // v1.282.20: настоящие пиксели экрана, а не меры неба
  const baseCw=Math.round(W*px), baseChh=Math.round(H*px);
  const marginPxX=Math.round(baseCw*NF_MARGIN), marginPxY=Math.round(baseChh*NF_MARGIN);
  const cw=baseCw+marginPxX*2, chh=baseChh+marginPxY*2; // холст шире экрана — есть куда панорамировать
  let c=nfCache.c;
  if(!c || c.width!==cw || c.height!==chh){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
  const x=ctx2d(c);
  x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh); // переиспользуем холст — чистим, а не выбрасываем
  x.setTransform(px,0,0,px,marginPxX,marginPxY); // начало координат сдвинуто — контент кладём на увеличенное поле, не на старое
  let seed=(((nfSeed||1)^Math.imul(hq+1,2654435761))>>>0)||1; // 28.08.2026: hq в сид — форма меняется на каждой пересборке, не только оттенок
  const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const blob=(bx,by,r,hue,li,a,sq)=>{
    x.save(); x.translate(bx,by); x.scale(1,sq||1);
    const g=x.createRadialGradient(0,0,0,0,0,r);
    g.addColorStop(0,'hsla('+hue+',80%,'+li+'%,'+a+')');
    g.addColorStop(.6,'hsla('+(hue+20)+',75%,'+Math.max(li-12,8)+'%,'+(a*.5)+')');
    g.addColorStop(1,'hsla('+hue+',75%,'+li+'%,0)');
    x.fillStyle=g; x.beginPath(); x.arc(0,0,r,0,6.283); x.fill(); x.restore();
  };
  const fldW=W*(1+2*NF_MARGIN), fldH=H*(1+2*NF_MARGIN); // увеличенное поле — пятна расставляются на нём, не на старом W/H, иначе край панорамы пуст
  const m=Math.max(fldW,fldH);
  // холодная база — глубина в цвете волны
  blob(fldW*(.1+R()*.25), fldH*(.15+R()*.2), m*.45, h1+30, 42, .30, .8);
  blob(fldW*(.7+R()*.25), fldH*(.5+R()*.25), m*.4, h2+50, 40, .26, .85);
  // тёплые пурпурные волокна — акцент как на эталонном макете
  blob(fldW*(.2+R()*.5), fldH*(.55+R()*.3), m*.36, h1+300, 55, .20, .55);
  blob(fldW*(.5+R()*.4), fldH*(.1+R()*.25), m*.3, h1+285, 52, .15, .6);
  // бирюзовые разводы
  blob(fldW*(.02+R()*.3), fldH*(.6+R()*.3), m*.32, h2+150, 50, .18, .7);
  // млечная полоса по диагонали — глубина и направление взгляда
  const x0=fldW*.05, y0=fldH*.82, x1=fldW*.95, y1=fldH*.12;
  for(let i=0;i<9;i++){
    const t=i/8;
    blob(lerp(x0,x1,t)+(R()-.5)*fldW*.08, lerp(y0,y1,t)+(R()-.5)*fldH*.06, m*.17, h1+40, 68, .07, .5);
  }
  /* 28.08.2026 «Пыль убрана, форма живая»: точечная пыль (240 штук, звёздная россыпь) убрана
     целиком — владелец: фон (bgStars) уже прекрасно мерцает сам, вторая мигающая система
     поверх туманности была лишней, спорила с ним же. Взамен — форма самой туманности (блобы
     ниже) больше не одна и та же весь забег: раньше seed=nfSeed был неизменен всю игру, blob()
     каждую пересборку (раз в ~NF_HUE_STEP, см. правку там же) рисовал ТЕ ЖЕ самые пятна, менялся
     только оттенок. Подмешиваем hq (номер пересборки) в сид тем же приёмом хэширования, что уже
     в этом файле (nebulaSprite: hue*2654435761) — каждая пересборка кладёт новые пятна на новые
     места, without extra cost: тот же разовый проход, что и был, просто с другим числом на входе. */
  c.marginPxX=marginPxX; c.marginPxY=marginPxY; c.baseCw=baseCw; c.baseChh=baseChh; // на САМ canvas — функция возвращает его, не nfCache
  nfCache={w:W,ht:H,h:hq,d:DPR,s:SC,c:c};
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
/* 31.08.2026 «Гранёный камень» (владелец, макет-сравнение «мыло»/«гранёное», три раунда
   правок по живым скриншотам): испечённый спрайт вместо живого fill+clip+3×drawImage на
   каждый кадр — тот же принцип экономии, что уже даёт powGlow/nebulaSprite/vignetteSprite
   выше в этом файле. Форма/кратеры камня (o._path/o._decor) не меняю — они уже кэшированы
   и уже используют mapRand (общий детерминированный RNG уровня, от него зависит Daily
   Challenge/тень). Новая случайность (угол света, вершина-зачинщик грани, зонирование
   граней, джиттер цвета/шума, вытяжение силуэта) — СВОЙ приватный LCG, засеянный от уже
   сгенерированных o.verts/o.r, ни одного нового обращения к mapRand: тот же принцип «свой
   LCG — глобальный RNG не трогаем», что уже применён у nebulaSprite чуть выше. */
function rockLcgSeed(o){
  let h=0;
  for(const v of o.verts) h=(h*31+((v.r*100000)|0))>>>0;
  return ((h^((o.r*1000)|0))>>>0)||1;
}
function jitterHex(hex,R,amt){ // свой оттенок на камень — даже одна и та же палитра (5 тонов) перестаёт быть одним пикселем
  const n=parseInt(hex.slice(1),16), r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const cl=(c)=>Math.max(0,Math.min(255,Math.round(c+(R()-.5)*2*amt)));
  return 'rgb('+cl(r)+','+cl(g)+','+cl(b)+')';
}
function mixTone(rgbOrHex,k,towards){ // towards: 255 к белому, 0 к чёрному; принимает и 'rgb(...)', и '#hex'
  let r,g,b;
  if(rgbOrHex[0]==='#'){ const n=parseInt(rgbOrHex.slice(1),16); r=(n>>16)&255; g=(n>>8)&255; b=n&255; }
  else { const m=rgbOrHex.match(/\d+/g); r=+m[0]; g=+m[1]; b=+m[2]; }
  const mix=(c)=>Math.round(c+(towards-c)*k);
  return 'rgb('+mix(r)+','+mix(g)+','+mix(b)+')';
}
function bakeRockSprite(o){
  const px=skyPx(); // те же реальные пиксели холста, что у vignetteSprite — иначе замылится на широком экране/планшете (тот же урок, что уже был у виньетки)
  if(o._sprite && o._spritePx===px) return o._sprite;
  const tint=planetRockTint(o);
  let s=rockLcgSeed(o);
  const R=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const stretchX=.84+R()*.38, stretchY=.84+R()*.38; // силуэт визуально вытянут/приплюснут — хитбокс (game.js: круг по o.r) не затронут
  const jTint=jitterHex(tint,R,14);
  const weather=.06+R()*.16; // сила выветренности — своя на камень
  const lightAng=R()*6.283;
  const lightDir={x:Math.cos(lightAng),y:Math.sin(lightAng)};
  const n=o.verts.length;
  const apexI=Math.floor(R()*n); // вершина-зачинщик скола — своя на камень (веер не от центра, иначе «кристалл вокруг сердцевины» на любом камне)
  const apexV=o.verts[apexI];
  const ax=Math.cos(apexV.a)*apexV.r*o.r, ay=Math.sin(apexV.a)*apexV.r*o.r;
  const padCss=8, cssSize=o.r*2*1.25+padCss*2, cw=Math.ceil(cssSize*px);
  const c=document.createElement('canvas'); c.width=c.height=cw;
  const x=ctx2d(c);
  x.setTransform(px,0,0,px,cw/2,cw/2); x.scale(stretchX,stretchY);
  let zoneLeft=0, zoneTone=null;
  for(let k=1;k<n-1;k++){ // веер от вершины apexI ко всем остальным по кругу — та же схема, что макет
    const i0=(apexI+k)%n, i1=(apexI+k+1)%n;
    const v0=o.verts[i0], v1=o.verts[i1];
    const x0=Math.cos(v0.a)*v0.r*o.r, y0=Math.sin(v0.a)*v0.r*o.r;
    const x1=Math.cos(v1.a)*v1.r*o.r, y1=Math.sin(v1.a)*v1.r*o.r;
    if(zoneLeft<=0){ // грани сгруппированы в зоны 1-3 — свои на камень (кто-то крупно колот, кто-то мелко)
      zoneLeft=1+Math.floor(R()*3);
      const cx=(ax+x0+x1)/3, cy=(ay+y0+y1)/3;
      const cl=Math.hypot(cx,cy)||1;
      const facing=(cx/cl)*lightDir.x+(cy/cl)*lightDir.y;
      const jitter=(R()-.5)*weather;
      const facingJ=Math.max(-1,Math.min(1,facing+jitter));
      zoneTone=facingJ>0?mixTone(jTint,facingJ*.32,255):mixTone(jTint,-facingJ*.36,0);
    }
    zoneLeft--;
    x.fillStyle=zoneTone;
    x.beginPath(); x.moveTo(ax,ay); x.lineTo(x0,y0); x.lineTo(x1,y1); x.closePath(); x.fill();
  }
  // зерно — та же техника точек, что и у nebulaSprite/starDot в этом файле; свой генератор, не mapRand
  x.save(); x.clip(o._path);
  let gs=((s*7+3)>>>0)||1;
  const G=()=>{ gs=(gs*1664525+1013904223)>>>0; return gs/4294967296; };
  for(let i=0;i<70;i++){
    const gx=(G()-.5)*o.r*2.1, gy=(G()-.5)*o.r*2.1;
    x.globalAlpha=.05+G()*.10;
    x.fillStyle=G()<.5?'#000000':'#ffffff';
    const sz=.6+G()*1.3;
    x.fillRect(gx,gy,sz,sz);
  }
  x.globalAlpha=1;
  // кратеры — как и раньше, из o._decor (mapRand, не трогаю)
  const dc=o._decor;
  x.globalAlpha=.13; x.drawImage(powGlow('#ffffff'), dc.light.x-dc.light.r, dc.light.y-dc.light.r, dc.light.r*2, dc.light.r*2);
  x.globalAlpha=.27; x.drawImage(powGlow('#000000'), dc.darkSmall.x-dc.darkSmall.r, dc.darkSmall.y-dc.darkSmall.r, dc.darkSmall.r*2, dc.darkSmall.r*2);
  x.globalAlpha=.40; x.drawImage(powGlow('#000000'), dc.darkBig.x-dc.darkBig.r, dc.darkBig.y-dc.darkBig.r, dc.darkBig.r*2, dc.darkBig.r*2);
  x.globalAlpha=1;
  x.restore();
  o._sprite=c; o._spritePx=px; o._spriteCss=cssSize;
  return c;
}
/* 31.08.2026 «Спутник не клон» (владелец: o.r у спутника ВСЕГДА 18, без разброса — все
   спутники одного «лица» были пиксель в пиксель одинаковы, gradCache тоже ключевался от
   этого фиксированного размера). После трёх раундов правок по живым скриншотам (баг зазора,
   баг угла, баг асимметрии) владелец прямо попросил форму не трогать вовсе — только цвет.
   Печётся один раз в свой офскрин (не в общий gradCache — джиттерные цвета иначе раздували
   бы его на каждый новый оттенок), маячок (мигает по времени) и ядро-ауреола остаются вне
   спрайта, рисуются живьём как и раньше. Сид — из o.ph/o.amp (уже случайны при спавне,
   игре не нужно новое поле), ни одного обращения к mapRand — та же причина, что и у камня. */
function bakeSatSprite(o){
  const px=skyPx();
  if(o._sprite && o._spritePx===px) return o._sprite;
  const r2=o.r;
  let s=((Math.abs(o.ph)*100000+Math.abs(o.amp||0)*37)|0)>>>0 || 1;
  const R=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const panelC0=jitterHex('#4a629a',R,22), panelC1=jitterHex('#33487c',R,18), panelC2=jitterHex('#263a66',R,14);
  const bodyC0=jitterHex('#8ea6d8',R,22), bodyC1=jitterHex('#6c83b8',R,18), bodyC2=jitterHex('#4c5f8e',R,14);
  const size=Math.ceil(r2*6.5*px);
  const c=document.createElement('canvas'); c.width=c.height=size;
  const x=ctx2d(c);
  x.setTransform(px,0,0,px,size/2,size/2);
  const satPanel=(px_,py,pw,ph2)=>{
    const g=x.createLinearGradient(0,py,0,py+ph2);
    g.addColorStop(0,panelC0); g.addColorStop(.5,panelC1); g.addColorStop(1,panelC2);
    x.fillStyle=g; rr(x,px_,py,pw,ph2,2.5); x.fill();
    x.strokeStyle='rgba(180,210,250,.4)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(px_+2,py+.5); x.lineTo(px_+pw-2,py+.5); x.stroke();
  };
  const satBody=(bw,bh,brad)=>{
    const g=x.createLinearGradient(0,-bh/2,0,bh/2);
    g.addColorStop(0,bodyC0); g.addColorStop(.45,bodyC1); g.addColorStop(1,bodyC2);
    x.fillStyle=g; rr(x,-bw/2,-bh/2,bw,bh,brad); x.fill();
    x.strokeStyle='rgba(220,235,255,.4)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(-bw/2+3,-bh/2+.5); x.lineTo(bw/2-3,-bh/2+.5); x.stroke();
  };
  const satLens=(lx,ly,lr2)=>{
    const g=x.createRadialGradient(lx-2,ly-2,1,lx,ly,lr2||.1);
    g.addColorStop(0,'#f4f8ff'); g.addColorStop(1,'#b9c8ec');
    x.fillStyle=g; x.beginPath(); x.arc(lx,ly,lr2,0,6.283); x.fill();
  };
  const sk=o.skin||0;
  // те же числа, что и раньше в render.js — форма не джиттерится, только цвет
  if(sk===1){
    satPanel(-r2*1.9,-r2*.14,r2*1.05,r2*.28); satPanel(r2*.85,-r2*.14,r2*1.05,r2*.28);
    satPanel(-r2*.14,-r2*.9,r2*.28,r2*.55);
    satBody(r2*1.3,r2*1.3,3); satLens(0,0,r2*.3);
  } else if(sk===2){
    satPanel(-r2*1.9,-r2*.26,r2*.8,r2*.52); satPanel(r2*1.1,-r2*.26,r2*.8,r2*.52);
    satBody(r2*1.5,r2*1.0,8);
    x.strokeStyle='#9fabca'; x.lineWidth=2;
    x.beginPath(); x.moveTo(0,-r2*.5); x.lineTo(0,-r2*.78); x.stroke();
    const dg=x.createLinearGradient(0,-r2*.78*1.05,0,-r2*.78*.7);
    dg.addColorStop(0,bodyC0); dg.addColorStop(1,bodyC2);
    x.fillStyle=dg; x.beginPath(); x.arc(0,-r2*.78,r2*.26,Math.PI,0); x.fill();
    satLens(0,2,r2*.24);
  } else if(sk===3){
    satPanel(-r2*1.9,-r2*.2,r2*.8,r2*.4);
    satBody(r2*2.1,r2*.85,9);
    x.fillStyle='rgba(20,28,52,.35)'; x.beginPath(); x.arc(r2*.62,0,r2*.3,0,6.283); x.fill();
    x.fillStyle='rgba(150,200,255,.5)'; x.beginPath(); x.arc(r2*.62,0,r2*.16,0,6.283); x.fill();
    satLens(-r2*.15,0,r2*.2);
  } else {
    satPanel(-r2*1.9,-r2*.32,r2*.85,r2*.64); satPanel(r2*1.05,-r2*.32,r2*.85,r2*.64);
    satBody(r2*1.8,r2*1.1,4); satLens(0,0,r2*.28);
  }
  o._sprite=c; o._spritePx=px; o._spriteCss=r2*6.5;
  return c;
}
/* 31.08.2026 «Обломок — то же самое, дешевле»: без повода менять вид (уже варьируется
   размером и 5 «лицами», жалоб не было) — спрайт копирует ровно тот же путь отрисовки,
   что и раньше, пиксель в пиксель (проверено визуально и сканом разницы на макете), только
   печётся один раз вместо fill+stroke заново на каждый кадр. Аудитория/сигнальный огонёк
   (sh-гейтятся, могут появиться/исчезнуть на лету при смене качества графики автоподбором)
   остаются живыми снаружи спрайта — тот же приём, что и у маячка спутника: спрайт держит
   только то, что не зависит ни от времени, ни от текущей ступени графики. */
function bakeDebrisSprite(o){
  const px=skyPx();
  if(o._sprite && o._spritePx===px) return o._sprite;
  const sk=o.skin||0, hw=o.w/2, hh=o.h/2;
  const pad=10, cssW=o.w+pad*2, cssH=o.h+pad*2, cssSize=Math.max(cssW,cssH);
  const cw=Math.ceil(cssSize*px);
  const c=document.createElement('canvas'); c.width=c.height=cw;
  const x=ctx2d(c);
  x.setTransform(px,0,0,px,cw/2,cw/2);
  const qh=Math.round(hh*4)/4;
  const mg=x.createLinearGradient(0,-qh,0,qh);
  mg.addColorStop(0,sk===3?'#d2dbeb':'#cdd7ea'); mg.addColorStop(.4,sk===3?'#aeb9d0':'#a9b6cf'); mg.addColorStop(1,'#7e8ba4');
  x.fillStyle=mg;
  if(sk===1){
    x.save(); x.rotate(.14); rr(x,-hw,-hh,hw+1,o.h,3); x.fill(); x.restore();
    x.save(); x.rotate(-.14); rr(x,-1,-hh,hw+1,o.h,3); x.fill(); x.restore();
    x.strokeStyle='rgba(255,255,255,.3)'; x.lineWidth=1.1;
    x.beginPath(); x.moveTo(-hw+4,-hh+2); x.lineTo(-2,-hh-1);
    x.moveTo(2,-hh-1); x.lineTo(hw-4,-hh+2); x.stroke();
    x.fillStyle='rgba(20,28,52,.3)';
    x.beginPath(); x.arc(-o.w*.26,2,1.1,0,6.283); x.arc(o.w*.26,2,1.1,0,6.283); x.fill();
  } else if(sk===2){
    rr(x,-hw,-hh,o.w,o.h,3.5); x.fill();
    x.strokeStyle='rgba(255,255,255,.35)'; x.lineWidth=1.2;
    x.beginPath(); x.moveTo(-hw+4,-hh+1); x.lineTo(hw-4,-hh+1); x.stroke();
    x.strokeStyle='#9fabca'; x.lineWidth=2.4; x.lineCap='round';
    x.beginPath(); x.moveTo(-6,0); x.lineTo(8,-hh+2); x.stroke();
    x.fillStyle='#d8e0ee'; x.beginPath(); x.arc(9,-hh+1.5,2,0,6.283); x.fill();
  } else if(sk===3){
    rr(x,-hw,-hh,o.w,o.h,hh); x.fill();
    x.strokeStyle='rgba(255,255,255,.4)'; x.lineWidth=1.2;
    x.beginPath(); x.moveTo(-hw+8,-hh+2); x.lineTo(hw-8,-hh+2); x.stroke();
    x.strokeStyle='rgba(20,28,52,.3)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(-10,-hh+2); x.lineTo(-10,hh-2);
    x.moveTo(10,-hh+2); x.lineTo(10,hh-2); x.stroke();
  } else if(sk===4){
    rr(x,-hw,-hh,o.w,o.h,3.5); x.fill();
    x.strokeStyle='rgba(255,255,255,.35)'; x.lineWidth=1.2;
    x.beginPath(); x.moveTo(-hw+4,-hh+1); x.lineTo(hw-4,-hh+1); x.stroke();
    const lr=Math.min(hh,hw)*.62;
    const lg=x.createRadialGradient(-lr*.3,-lr*.3,lr*.1,0,0,lr);
    lg.addColorStop(0,'#eef2fa'); lg.addColorStop(1,'#8b98b5');
    x.fillStyle=lg; x.beginPath(); x.arc(0,0,lr,0,6.283); x.fill();
    x.strokeStyle='rgba(20,28,52,.4)'; x.lineWidth=1;
    x.beginPath(); x.arc(0,0,lr,0,6.283); x.stroke();
  } else {
    rr(x,-hw,-hh,o.w,o.h,3.5); x.fill();
    x.strokeStyle='rgba(255,255,255,.35)'; x.lineWidth=1.2;
    x.beginPath(); x.moveTo(-hw+4,-hh+1); x.lineTo(hw-4,-hh+1); x.stroke();
    x.strokeStyle='rgba(20,28,52,.28)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(-hw+3,2); x.lineTo(hw-3,2); x.stroke();
    x.fillStyle='rgba(20,28,52,.35)';
    for(const px_ of [-hw+8,-8,8,hw-8]){ x.beginPath(); x.arc(px_,-3,1.1,0,6.283); x.fill(); }
  }
  o._sprite=c; o._spritePx=px; o._spriteCss=cssSize;
  return c;
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
const SGN2=[-1,1]; // двуполюсные циклы без аллокации массива в кадре
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
  corrCache={w:-1,ht:-1,d:-1,s:-1,fl:-1,fw:-1,c:null};
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
  // 26.08.2026: на «Дне»/lowPower это пятно — единственная деталь тумана (см. drawNebulas,
  // ветка Q.level===0): ни одной точки текстуры, только гладкий градиент — жалоба владельца
  // «выглядит как пятно». Та же звёздная пыль, что маскирует бандинг в nebulaField() (v1.282.21,
  // 240 точек), здесь щедро урезана — 40 точек, и кэшируется вместе со спрайтом (редко, не
  // каждый кадр). Сид детерминирован от hue — не Math.random() (закон Д1), чистый декор без
  // связи с mapRNG, на трассу не влияет.
  let seed=(hue*2654435761)>>>0||1;
  const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  for(let i=0;i<40;i++){
    x.globalAlpha=.06+R()*.18;
    x.fillStyle=R()<.8?'#dfe9ff':'#ffe9c8';
    const sz=.6+R()*1.2;
    x.fillRect(R()*200,R()*200,sz,sz);
  }
  x.globalAlpha=1;
  return c;
}
let lowPowerMemo={t:0,v:false};
function isLowPowerDevice(frameNow){
  const t=(typeof frameNow==='number')?frameNow:performance.now();
  if(t-lowPowerMemo.t>1500 || lowPowerMemo.t===0){
    lowPowerMemo.t=t;
    lowPowerMemo.v = gfxTier()<=0 || !!(typeof isAndroidGo==='function' && isAndroidGo());
  }
  return lowPowerMemo.v;
}
function drawNebulas(h1,h2,tN,lowPower){
  if(typeof lowPower!=='boolean') lowPower=isLowPowerDevice();
  /* 31.08.2026: два плоских круглых пятна на дне/средней владелец разобрал как «портят
     картинку, статичные — тем более» — макет сравнения «как сейчас»/«убрано»/«неровная
     форма» решил в пользу «без пятен лучше». Убраны целиком для lowPower/Q.level<2; ничего
     больше печь для этих ступеней не нужно — nebCache/nebulaField существуют только ради
     HD/Ультра ниже. */
  if(lowPower || Q.level<2) return;
  const hq1=Math.round(S.hueShift/NF_HUE_STEP); // v1.282.15: тот же грубый квант — иначе два спрайта 200×200 пеклись каждые 833мс
  if(nebCache.h!==hq1){
    nebCache={h:hq1,a:nebulaSprite(h1+40),b:nebulaSprite(h2+60)};
  }
  // HD/Ультра: богатое поле туманностей + живые дрейфующие пятна поверх
  const nf=nebulaField(h1,h2);
  const pan=nfPanOffset(tN, nf.marginPxX||0, nf.marginPxY||0);
  ctx.drawImage(nf, pan.x, pan.y, nf.baseCw||W, nf.baseChh||H, 0,0,W,H); // окно-кроп из увеличенного поля — сама текстура плывёт, не только пятна поверх
  // 28.08.2026: точечная пыль (nf.dust) убрана целиком — bgStars уже мерцают сами, вторая
  // мигающая система поверх туманности была лишней (владелец). См. правку формы в nebulaField().
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
}

/* ================= DRAW ================= */
function drawFx(hq,sh){ // частицы + попапы: и в игре, и поверх оверлеев (конфетти рекорда)
  if(!particles.length && !popups.length) return;
  const lowFx = isLowPowerDevice() || (Q.mode==='auto' && Q.fps<48);
  const maxDraw = !lowFx ? particles.length : (Q.fps<40 ? 90 : 140);
  let drawn = 0;
  if(hq) ctx.globalCompositeOperation='lighter';
  let aurSp=null;
  for (let pi=particles.length-1;pi>=0;pi--){
    if(drawn>=maxDraw) break;
    const p=particles[pi];
    if(!inView(p.x,p.y,12,12)) continue;
    ctx.globalAlpha = clamp(p.life,0,1);
    if(hq && p.fx==='aurora'){ // звёздный след Авроры — крошечные мерцающие звёздочки
      if(!aurSp) aurSp=starDot('w');
      const s=p.size*3.4;
      ctx.drawImage(aurSp,p.x-s/2,p.y-s/2,s,s);
      drawn++;
      continue;
    }
    ctx.fillStyle = partCol(p.color, p.life*.9);
    ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    drawn++;
  }
  ctx.globalAlpha=1;
  if(hq) ctx.globalCompositeOperation='source-over';
  /* 27.08.2026: попап («Впритык», «Щит», «Ворота» и т.д.) владелец разглядел как «просто
     текст». Пробовали сменить шрифт на фирменный Exo 2 — владелец вернул системный
     (решение владельца, шрифт не трогаем). Осталась только тёмная обводка — читаемость
     на любом фоне неба, не только на тёмном; вес обводки уменьшен вдвое (было 3, владелец —
     «сильно жирный»). */
  ctx.textAlign='center'; ctx.font='500 15px -apple-system,"Segoe UI",Roboto,sans-serif';
  ctx.lineJoin='round';
  for (const p of popups){
    if(!inView(p.x,p.y,140,42)) continue;
    const life=clamp(p.life,0,1);
    ctx.globalAlpha=life;
    if(sh){ ctx.save(); ctx.translate(p.x,p.y); ctx.scale(1.12,1.12); // v1.66.0: ореол попапа — прозрачный дубль крупнее
      ctx.globalAlpha=life*.35; ctx.fillStyle=p.color; ctx.fillText(p.txt,0,0); ctx.restore();
      ctx.globalAlpha=life; }
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(10,14,28,.55)'; ctx.strokeText(p.txt,p.x,p.y);
    ctx.fillStyle=p.color;
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
    case 'dash': { const k=1.15; // 27.08.2026 «Симметрия силуэтов»: было — три тонких шеврона
      // («ты снаряд», см. старый коммент); жалоба владельца — таран читается хуже жизни и
      // щита. Разбор: дело не в толщине линий, а в том, что щит/замедление/магнит — сплошные
      // фигуры без внутренних пустот, а три раздельных шеврона — дырявые по конструкции.
      // Сплошной клин-«остриё» и площадью больше (13.5%→17.8% от круга бонуса, вровень со
      // щитом, посчитано численно шнурком/растровой заливкой), и по смыслу ближе к слову
      // «Таран» — старые шевроны читались как «перемотка/скорость», не как «пробиваю».
      x.moveTo(-6*k,-5*k); x.lineTo(2*k,-5*k); x.lineTo(6.6*k,0);
      x.lineTo(2*k,5*k); x.lineTo(-6*k,5*k); x.lineTo(-2*k,0); x.closePath(); } break;
    case 'nova': { const k=1.5; // Сверхновая: та же восьмилучевая звезда, крупнее целиком.
      // 27.08.2026: при проверке площади всех шести силуэтов оказалась самой тонкой из всех
      // (7.2% — тоньше даже старого тарана), хотя владелец её не называл — подтянута туда же.
      for(let i=0;i<16;i++){ const a=i/16*6.283, rad=(i%2?2.2:6.6)*k;
        i?x.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):x.moveTo(Math.cos(a)*rad,Math.sin(a)*rad); }
      x.closePath(); } break;
  }
}
function drawGlyph(ctx,kind){
  ctx.save();
  /* 27.08.2026 «Симметрия силуэтов»: раньше силуэт красился в тот же col, что и фон-ауреола
     (полупрозрачная, силуэт на ней читался). Теперь под силуэтом плотный цветной диск-жетон
     (см. powTokenGrad ниже) — силуэт того же col утонул бы в диске того же оттенка, нулевой
     контраст. Тёмная заливка вместо этого держит контраст на любом из шести цветов; двух
     тёмных тонов (не шести) — жизни отдельно тёплый тёмно-бордовый (её диск розовый, тёмно-
     синий на нём смотрелся мутно), остальным пяти — один тёмно-синий. Кэш по тёмному тону,
     не по col — было 6 записей кэша, стало 2. */
  /* 27.08.2026, позже тем же днём: владелец на живом устройстве — «сверху что-то подсвечивает,
     режет глаза, перекрывает саму иконку». Причина — белый стоп-кадр градиента ниже («свет
     сверху, как у всего мира») был скопирован с ДРУГИХ глифов, где силуэт красился в СВЕТЛЫЙ
     col — там белый верх сливался в общий светлый тон, почти не заметен. Сегодняшний тёмный
     силуэт (см. коммент выше) с тем же белым стопом даёт резкий белый блик поверх тёмной
     заливки — то, что и назвал владелец. Ровная заливка без градиента, без блика. */
  const dcol = kind==='life' ? '#5a1633' : '#0c1430';
  if(kind==='magnet'){ // подкова — жирной дугой с круглыми концами
    ctx.strokeStyle=dcol; ctx.lineWidth=4.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-4.4,4.8); ctx.lineTo(-4.4,-0.8);
    ctx.arc(0,-0.8,4.4,Math.PI,0); ctx.lineTo(4.4,4.8); ctx.stroke();
  } else if(kind==='life'){ // крест — два бруска, крупнее целиком: 9.6%→17.6% площади
    // значка (посчитано численно, вровень со щитом) — владелец заметил, что «жирнее линию»
    // недостаточно, у щита/замедления/магнита нет внутренних пустот, а у тонкого креста есть
    ctx.fillStyle=dcol;
    rr(ctx,-2.6,-6.5,5.2,13,1.6); ctx.fill();
    rr(ctx,-6.5,-2.6,13,5.2,1.6); ctx.fill();
  } else {
    fillGlyphPath(ctx,kind); ctx.fillStyle=dcol; ctx.fill();
  }
  if(kind==='slowmo'){ // стрелки — светлый вырез (циферблат теперь тёмный, был светлый)
    ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=2.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-3.1); ctx.lineTo(0,0); ctx.lineTo(2.6,1.6); ctx.stroke();
  }
  ctx.restore();
}

function inView(x,y,mx,my){
  return x>=-mx && x<=W+mx && y>=-my && y<=H+my;
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
/* 27.08.2026 «Симметрия силуэтов»: значок-жетон (владелец выбрал это из трёх показанных
   направлений на artifact-мокапе, плюс искра из другого направления). Диск того же
   принципа, что и градиент силуэта чуть выше — кэш по цвету, не пересобирается в кадре. */
function powTokenGrad(ctx,col){
  const gk='powTok'+col; let g=gradCache[gk];
  if(!g){ g=ctx.createRadialGradient(-3,-4,1,0,0,16); // свет сверху-слева, тот же приём, что у остальных дисков игры
    g.addColorStop(0,hexToRgba(col)+'.92)'); g.addColorStop(1,hexToRgba(col)+'.58)'); gradPut(gk,g); }
  return g;
}
let corrCache={w:-1,ht:-1,d:-1,s:-1,fl:-1,fw:-1,c:null};
/* 22.08.2026 «Видимый край неба»: жалоба владельца — на ноутбуке/широком экране коридор
   («коридор чести», fieldL()..fieldL()+fieldW(), фиксирован в 390 мер ради честности сида
   между устройствами) окружён мёртвой зоной без единого визуального намёка на границу.
   Самолётик просто перестаёт двигаться дальше — невидимая стена. render.js ни разу не
   обращался к fieldL()/fieldW() раньше. Лекарство — мягкая светящаяся линия точно по краю
   коридора + едва заметное затемнение мёртвой зоны снаружи: граница читается с полёта
   (Хартия, суд №2), но не выглядит агрессивной стеной, чуждой космическому духу игры.
   Тот же проверенный приём кэширования, что vignetteSprite — px=skyPx(), не голый DPR,
   иначе повтор бага №15 (мыльные спрайты на нестандартном масштабе). */
function corridorEdgeSprite(){
  const fl=fieldL(), fw=fieldW();
  if(corrCache.w!==W||corrCache.ht!==H||corrCache.d!==DPR||corrCache.s!==SC||corrCache.fl!==fl||corrCache.fw!==fw){
    const px=skyPx();
    const cw=Math.round(W*px), chh=Math.round(H*px);
    let c=corrCache.c;
    if(c && (c.width!==cw || c.height!==chh)){ c.width=0; c.height=0; c=null; }
    if(!c){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
    const x=ctx2d(c);
    x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh);
    if(fl>0){ // мёртвая зона есть только когда экран шире коридора
      x.setTransform(px,0,0,px,0,0);
      x.fillStyle='rgba(2,4,14,.3)'; // едва заметное затемнение снаружи — не чернота, лёгкая тень
      x.fillRect(0,0,fl,H); x.fillRect(fl+fw,0,W-fl-fw,H);
      for(const edge of [fl, fl+fw]){
        const g=x.createLinearGradient(edge-14,0,edge+14,0);
        g.addColorStop(0,'rgba(159,232,255,0)'); g.addColorStop(.5,'rgba(159,232,255,.22)'); g.addColorStop(1,'rgba(159,232,255,0)');
        x.fillStyle=g; x.fillRect(edge-14,0,28,H);
      }
    }
    corrCache={w:W,ht:H,d:DPR,s:SC,fl,fw,c};
  }
  return corrCache.c;
}
function draw(){
  if(typeof canvasContextLost!=='undefined' && canvasContextLost) return;
  const nowMs=performance.now();
  const nowS=nowMs/1000;
  const profileOn=true; // 22.08.2026: замер всегда включён — экран (fpsPill) по-прежнему только под ?debug, см. profileReport()
  let profileMark=nowMs;
  const shk = RM?0:S.shake; // v1.99.2 «Бережное небо»: при системном флаге экран не трясём
  const shx = shk>0?rand(-6,6)*shk:0, shy = shk>0?rand(-6,6)*shk:0;
  ctx.save(); ctx.translate(shx,shy);

  // 01.09.2026 «Свой фон»: своя трасса дышит от СВОИХ стартовых оттенков (customH1/H2 —
  // любые, не только производные от одного числа sky), обычные режимы — от прежних 232/200,
  // не тронуты. Скорость дрейфа (hueShift*.3) одна и та же для всех — только стартовая точка
  // разная, дыхание неба выглядит одинаково знакомым в любом режиме.
  const baseH1 = (S.mode==='custom') ? S.customH1 : 232, baseH2 = (S.mode==='custom') ? S.customH2 : 200;
  const h1 = baseH1+S.hueShift*.3, h2 = baseH2+S.hueShift*.3;
  const mood = (S.mode==='custom') ? S.customMood : 50; // 01.09.2026 «Настроение неба»: только «Свой фон», обычные режимы — прежний вид (m=50)
  ctx.fillStyle=bgGradient(h1,h2,mood); ctx.fillRect(-20,-20,W+40,H+40);
  const lowPower = isLowPowerDevice(nowMs);
  /* 26.08.2026: было nowS (часы браузера) — туман плыл и на паузе, и в меню, пока весь
     остальной мир честно стоял (жалоба владельца, тот же класс, что и мерцание звёзд ниже).
     S.time растёт только пока update() реально тикает (S.running && !S.paused, см. loop()
     в этом же файле) — на паузе и вне полёта застывает вместе со всем остальным. */
  drawNebulas(h1,h2,S.time,lowPower);
  // 22.08.2026: линии коридора убраны из игрового вида целиком — владелец не просил менять сам вид полёта,
  // просили только видимость края на широких экранах МЕНЮ/пауз, а не поверх активного полёта. Решение отменено.
  // corridorEdgeSprite() оставлена в файле неиспользуемой — вдруг понадобится в другом виде, но НЕ здесь.
  if(profileOn){ frameProfile.bg+=performance.now()-profileMark; profileMark=performance.now(); }

  const sh = Q.level>=1, hq = Q.level>=2, uq = Q.level>=3; // sh — свечение, hq — полная графика, uq — ультра

  // параллакс-звёзды (на hq — мягкие тонированные точки + мерцание + блики)
  // 26.08.2026: было nowMs (часы браузера) — мерцание шло даже на паузе и вне полёта, пока
  // позиция звёзд (ниже, через S.timeScale) честно замирала. Владелец увидел это как одну
  // конкретную звезду — совпадение высокого s.z (ярче базой) с пустым участком неба, где
  // ничего не отвлекает взгляд. S.time растёт только пока реально тикает update() — теперь
  // мерцание останавливается вместе со всем остальным миром. Тот же час, что у nfPanOffset.
  /* 27.08.2026 «Что ещё бесплатно достанется дну»: twT считался только для hq (Q.level>=2) —
     на 0 и 1 уровнях звёзды светились ровно, без мерцания вовсе. Цена включить мерцание и там
     не в этом делении (оно и так почти бесплатно) — цена в строке ниже (globalAlpha), а там
     всё равно уже цикл по каждой звезде каждый кадр, один синус в него не меняет бюджет
     кадра заметно. Не трогаем расчёт позиции/количество — только яркость. */
  const twT = S.time/.38;
  /* 27.08.2026: потолки 48/90 были голым числом, не плотностью — на широком экране (мир
     шире эталонных 390 мер, см. initBg() в game.js) тот же потолок давал видимо более
     пустое небо даже на средней/слабой ступени графики, раз пул под ним (bgStars) вырос,
     а потолок — нет. Тот же коэффициент W/390, что и там, не новое число из воздуха. */
  const wScale = Math.max(1, W/390);
  /* 28.08.2026 «Живой замер плотности», итог: было 48/90/140 (эталон при ширине 390) — влад-
     елец сравнил 100/150/200% на своём устройстве через временную кнопку в Сервисном центре
     (снята вместе с cycleStarDensityDbg) и выбрал 200%. Пул bgStars (game.js: initBg())
     уже вырос до 280*scale, «ультра» по-прежнему рисует его целиком — bgStars.length. */
  let nStars = lowPower ? Math.min(Math.round(96*wScale),bgStars.length) : (uq ? bgStars.length : Math.min(Math.round(180*wScale),bgStars.length)); // На слабых телефонах убираем лишние тысячи вычислений на бэкграунде
  if(Q.mode==='auto'){ // при просадках FPS режем только декоративный фон, не трогая геймплей
    if(Q.fps<40) nStars=Math.max(28,Math.floor(nStars*.5));
    else if(Q.fps<48) nStars=Math.max(36,Math.floor(nStars*.7));
  }
  // Скоростные полосы полностью удалены из игры. Рендер фонового неба теперь работает
  // только как обычное движение точек/света без дополнительного флага и без лишних линий.
  if(!hq) ctx.fillStyle='#cfe0ff';
  /* 28.08.2026 «Глубина мерцания»: амплитуда/скорость мерцания зависели только от ступени
     графики — дальняя и ближняя звезда мигали одинаково, разной была только база (globalAlpha
     ниже уже читает s.z как расстояние). Владелец попросил ощутимее почувствовать разное
     расстояние. zt нормирует s.z (диапазон .2–1 из initBg(), game.js) в 0..1: дальние (zt→0)
     мерцают быстрее и мельче (freqMul>1, ampMul<1) — мелкое дрожание; ближние (zt→1) —
     медленнее и глубже (freqMul<1, ampMul>1) — крупная пульсация. ampTier — прежний потолок
     амплитуды по ступени (uq .16 / hq .12 / дно .09), не новая шкала, ampMul крутится вокруг него. */
  const ampTier = uq?.16:(hq?.12:.09);
  for (let si=0;si<nStars;si++){ const s=bgStars[si];
    s.y += .024*frameDt*S.speed*S.timeScale*(1+s.z); // v1.282.15: по времени, а не по кадру. Единственная симуляция внутри draw() — на дисплее 120 Гц фон летел ВДВОЕ быстрее препятствий, параллакс выворачивался наизнанку, а на замершей паузе почти стоял (0.0004×60 = 0.024)
    if (s.y>1) s.y-=1;
    const zt=(s.z-.2)/.8, freqMul=1.6-.8*zt, ampMul=.55+.7*zt;
    ctx.globalAlpha = .25+s.z*.55 + Math.sin(twT*freqMul+s.x*40)*(ampTier*ampMul); // 27.08.2026: было 0 на не-hq — плоский квадратик без глянца спрайта чуть тише, .09 вместо .12/.16
    const sx=s.x*W, sy=s.y*H;
    if(hq){ // оттенок стабилен на звезду: хешируем по x и z (y ползёт!)
      const hh=(s.x*6.13+s.z*3.7)%1;
      const sp=starDot(hh<.16?'w':hh<.38?'c':'b');
      const sz=s.s*(s.z>0.82?(uq?5.2:4.6):(uq?3.8:3.4));
      ctx.drawImage(sp,sx-sz/2,sy-sz/2,sz,sz);
    } else if (s.z>0.82) {
      // 31.08.2026 (владелец): частичный вариант — только яркие/близкие звёзды становятся
      // круглым спрайтом на дне/средней, не все. Измерено (синтетический бенчмарк): круглый
      // спрайт на всю плотность (280) дороже квадрата в 4-6 раз; z>0.82 — примерно четверть
      // звёзд, цена ближе к дешёвому концу, а видимый эффект — именно там, где взгляд
      // задерживается (крупные яркие звёзды), не на фоновой мелочи.
      const sp=starDot('w');
      const sz=s.s*4.6;
      ctx.drawImage(sp,sx-sz/2,sy-sz/2,sz,sz);
    } else {
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    if (hq && s.z>0.82){ // крестовидный блик у самых ярких звёзд — без дополнительных полос и режима скорости
      const fl=1.4+Math.sin(twT*1.3*freqMul+s.x*40)*.7; // 28.08.2026: тот же freqMul глубины — блик у ближних звёзд пульсирует медленнее, не отдельным ритмом
      ctx.strokeStyle='rgba(220,235,255,.3)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx-3*fl,sy); ctx.lineTo(sx+3*fl,sy);
      ctx.moveTo(sx,sy-3*fl); ctx.lineTo(sx,sy+3*fl); ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
  if(profileOn){ frameProfile.stars+=performance.now()-profileMark; profileMark=performance.now(); }

  /* 26.08.2026: было nowS (часы браузера) — маяк в углу неба (PLANET.sky, W*.82×H*.13,
     рядом с жизнями) мигал даже на паузе/в меню/на «Итогах», пока весь остальной мир честно
     стоял — та же болезнь, что уже вылечили у мерцания звёзд и у панорамы тумана чуть выше
     в этом же файле (тот же день, коммит 8981195), только не дошла досюда. Жалоба владельца
     «мигающая точка около жизней» (видео + свежие скрины 26.08.2026) — это маяк, не звезда:
     доказано стражем 139 (guard.mjs) — яркость угла неба на паузе менялась ДО этой строки. */
  planetSky(S.time); // v1.100.0 «Планетарий»: метеор, маяк, созвездие, станция, отметины пути
  if(profileOn){ frameProfile.sky+=performance.now()-profileMark; profileMark=performance.now(); }

  // Экраны поверх (меню, итоги, настройки, ангар): спокойный космос — без поля,
  // но с эффектами (конфетти рекорда). Поле — только в игре и на паузе (под диммером)
  if (screenName!=='game' && screenName!=='pause'){
    drawFx(hq,sh);
    if(profileOn){ frameProfile.fx+=performance.now()-profileMark; frameProfile.n++; profileReport(); }
    ctx.restore(); return;
  }

  // звёзды (монеты): спрайт-свечение вместо shadowBlur — мягче и дешевле
  /* 26.08.2026: владелец сфотографировал место появления звезды на своём телефоне и красной
     линией отметил границу — она легла ровно на REAL_STAR_HUD_DEADZONE+STAR_FADE_BAND (20%+4%
     высоты экрана). Дедзона не пряталась под HUD — она НЕ РИСОВАЛА звезду вовсе (continue
     ниже), а полоса плавного появления шириной 4% экрана пролетается на игровой скорости
     примерно за 90мс — короче, чем человек различает как «плавно». Фикс от 22-26.08.2026
     не убрал резкое появление, а лишь закрепил его кодом на том же месте, где оно и было.
     Убрано целиком: звёзды и бонусы теперь рисуются по тому же правилу, что и препятствия
     (inView() и ничего больше) — ровно то, что владелец назвал «эталоном». */
  for (const s of stars){
    if(!inView(s.x,s.y,32,32)) continue;
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

  /* бонусы: значок-жетон — 27.08.2026 «Симметрия силуэтов» (владелец). Раньше —
     ауреола по цвету + полупрозрачный круг + цветной обвод + пульсирующее/пунктирное кольцо.
     Показан artifact-мокап с тремя направлениями и численной проверкой площади силуэтов —
     владелец выбрал направление «В» (плотный цветной диск под силуэтом вместо полупрозрачного
     круга — контрастнее на пёстром фоне) плюс летающую искру из направления «А». Заодно
     подтянута площадь силуэта у жизни (9.6%→17.6%), тарана (форма сменилась на «остриё»,
     8.5%→17.8%) и сверхновой (7.2%→16.2%, владелец её не называл — нашлась при численной
     проверке остальных) — вровень со щитом/замедлением/магнитом (16-19%), см. правки в
     fillGlyphPath/drawGlyph выше. Мокап: .knowledge/ не хранит скриншоты — обсуждение в
     диалоге с владельцем 27.08.2026. */
  const PR=powRing(); // v1.66.0: готовые строки цветов — не собираем объекты в каждом кадре
  for (const p of powerups){
    if(!inView(p.x,p.y,32,36)) continue;
    ctx.save(); ctx.translate(p.x, p.y+Math.sin(p.ph)*3);
    const col=POW_COLORS[p.kind]; // v1.40.0 «Шесть жестов»; v1.43.1: Таран — плазменный синий, янтарь остаётся ловцу
    ctx.globalAlpha=.7; ctx.drawImage(powGlow(col),-20,-20,40,40); ctx.globalAlpha=1; // v1.37.0: ауреола всем ступеням — кэш-спрайт
    ctx.fillStyle=powTokenGrad(ctx,col);
    ctx.beginPath(); ctx.arc(0,0,p.r+2,0,6.283); ctx.fill();
    ctx.strokeStyle='rgba(6,10,22,.5)'; ctx.lineWidth=1.4; ctx.stroke(); // тёмный ободок — отделяет диск от пёстрого фона
    if(sh){ // внешнее кольцо дышит (v1.37.0: со средней ступени)
      ctx.strokeStyle=PR[p.kind][0]; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,p.r+9+Math.sin(p.ph*1.3)*2,0,6.283); ctx.stroke();
    }
    if(uq){ // ультра: летающая искра по орбите вокруг жетона (вместо старого пунктирного кольца)
      const sa=p.ph*1.6, sr=p.r+16;
      ctx.globalAlpha=.6+Math.sin(p.ph*2)*.3;
      ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(Math.cos(sa)*sr,Math.sin(sa)*sr,1.6,0,6.283); ctx.fill();
      ctx.globalAlpha=1;
    }
    drawGlyph(ctx,p.kind); ctx.restore(); // 27.08.2026: силуэт сам решает тёмный тон по kind, не по col
  }

  // препятствия
  for (const o of obstacles){
    const ovx=(o.kind==='gate')?(o.gap/2+o.r+28):((o.w&&o.h)?(o.w*.6+22):(o.r+22));
    const ovy=(o.w&&o.h)?(o.h*.6+22):(o.r+22);
    if(!inView(o.x,o.y,ovx,ovy)) continue;
    ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.rot);
    if (o.kind==='debris'){ // семья обломков (v1.105.0 «Свет и дым»): один смысл «рукотворный
      // мусор», четыре лица; габарит o.w×o.h священен — читаемость столкновения не меняется
      /* 31.08.2026 «Обломок — то же самое, дешевле»: см. bakeDebrisSprite() выше по файлу —
         спрайт держит форму, ауреола и сигнальный огонёк (оба sh-гейтятся, реагируют на
         живую смену ступени графики) остаются вне спрайта. */
      const sk=o.skin||0, hw=o.w/2, hh=o.h/2;
      if(sh){ ctx.globalAlpha=.4; ctx.drawImage(powGlow('#aebbd2'),-hw-9,-hh-9,o.w+18,o.h+18); ctx.globalAlpha=1; } // спрайт-ауреола
      const spr=bakeDebrisSprite(o);
      const cs=o._spriteCss;
      ctx.drawImage(spr, -cs/2, -cs/2, cs, cs);
      if(sh && (sk===3 || sk===0)){ // сигнальный огонёк — только у бака и панели, как и раньше
        if(sk===3){ ctx.drawImage(powGlow('#ffe2b0'),hw-14,-5,10,10);
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-9,0,1.4,0,6.283); ctx.fill(); }
        else { ctx.drawImage(powGlow('#ffe2b0'),hw-12,-8,12,12);
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-6,-2,1.5,0,6.283); ctx.fill(); }
      }
    } else if (o.kind==='mine' || o.kind==='seeker'){
      const col = o.kind==='seeker' ? '#ffa53a' : '#ff5f6d'; // ловец — янтарный
      const colBase = hexToRgba(col);
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
        ctx.strokeStyle=partCol(colBase,.35); ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,o.r*.55,0,6.283); ctx.stroke();
      }
      if(uq){ // ультра: вращающийся пунктир — телеграф опасности
        ctx.strokeStyle=partCol(colBase,.55); ctx.lineWidth=1.2;
        ctx.setLineDash([5,7]); ctx.lineDashOffset=-nowMs/40;
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
      /* 31.08.2026 «Спутник не клон»: панели/корпус/линза испечены в свой спрайт —
         bakeSatSprite() выше по файлу, форма не изменилась ни на число, джиттерится
         только цвет. Ауреола и маячок остаются живыми (маячок мигает по времени,
         Math.sin(o.ph*2.2) — не заморозить в статичном спрайте). */
      const sk=o.skin||0, r2=o.r;
      const beaconAt = sk===1?{x:0,y:-r2*.86} : sk===2?{x:r2*.42,y:-r2*.4} : sk===3?{x:-r2*.5,y:-r2*.5} : {x:0,y:-r2*.75};
      if(sh){ ctx.globalAlpha=.6; ctx.drawImage(powGlow('#78b4ff'),-r2,-r2,r2*2,r2*2); ctx.globalAlpha=1; } // ядро — спрайт
      const spr=bakeSatSprite(o);
      const cs=o._spriteCss;
      ctx.drawImage(spr, -cs/2, -cs/2, cs, cs);
      ctx.globalAlpha=.4+.6*Math.abs(Math.sin(o.ph*2.2));
      if(sh) ctx.drawImage(powGlow('#ff7a6a'),beaconAt.x-6,beaconAt.y-6,12,12);
      ctx.fillStyle='#ff8a7a'; ctx.beginPath(); ctx.arc(beaconAt.x,beaconAt.y,2,0,6.283); ctx.fill(); ctx.globalAlpha=1;
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
      /* 23.08.2026 «Ауреола вместо кольца»: отдельное жёсткое кольцо на Ультра (тонкая
         чёткая обводка) не сливалось с остальным мягким свечением кометы — разной природы
         (линия против градиента), владелец: «выглядит отдельно». Убрано целиком. Вместо
         нового элемента — усилена существующая ауреола: крупнее и ярче именно на Ультра,
         без пульса и новых частей, богатство даёт то же самое свечение, не добавка. */
      const auraSize = uq ? 52 : 40, auraAlpha = uq ? 1 : .9;
      ctx.globalAlpha=auraAlpha; ctx.drawImage(powGlow('#ffd28f'),-auraSize/2,-auraSize/2,auraSize,auraSize); ctx.globalAlpha=1; // v1.37.0: тёплая ауреола ядра всем ступеням
      // v1.66.0: shadowBlur ядра убран — ауреола выше уже даёт свечение
      ctx.fillStyle='#fff3d8'; ctx.beginPath(); ctx.arc(0,0,o.r,0,6.283); ctx.fill();
      ctx.fillStyle='#ffcf8f'; ctx.beginPath(); ctx.arc(-o.r*.2,-o.r*.2,o.r*.45,0,6.283); ctx.fill();
    } else if (o.kind==='gate'){ // ворота: два пилона + луч между ними
      const g2=o.gap/2;
      /* 22.08.2026 «Затягивающиеся ворота»: чем уже текущий просвет — тем крупнее выглядят
         пилоны (иллюзия приближения). Только отрисовка: масштаб — ЛОКАЛЬНАЯ переменная,
         o.r не меняется нигде — хитбокс столкновения (js/game.js) остаётся честным. */
      const pylonScale = o.breathe ? (1 + (1 - clamp((o.gap-(o.gapMid-o.gapAmp))/(o.gapAmp*2),0,1))*.32) : 1;
      const pr = o.r*pylonScale;
      // v1.66.0: свечение ворот — широкий полупрозрачный дубль луча + спрайты пилонов вместо shadowBlur
      /* 31.08.2026: было под if(sh) — тот же кэш-спрайт powGlow(), что уже бесплатен на всех
         ступенях у мины/обломка/спутника/кометы/тёмного кратера камня рядом в этом же файле;
         ворота остались забытым исключением. Ворота — самый частый игровой элемент, включено
         везде (владелец). */
      ctx.strokeStyle='rgba(159,232,255,.22)'; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
      ctx.globalAlpha=.55;
      for (const sgn of SGN2) ctx.drawImage(powGlow('#9fe8ff'),sgn*g2-pr-6,-pr-6,(pr+6)*2,(pr+6)*2);
      ctx.globalAlpha=1;
      if(sh && !o.passed){ // бегущая энергия по лучу (v1.37.0: со средней)
        ctx.setLineDash([7,7]); ctx.lineDashOffset=-nowMs/28;
      }
      ctx.strokeStyle=o.passed?'rgba(159,232,255,.25)':'rgba(159,232,255,.8)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
      if(sh) ctx.setLineDash([]);
      ctx.fillStyle='#3d5a80';
      for (const sgn of SGN2){
        ctx.beginPath(); ctx.arc(sgn*g2,0,pr,0,6.283); ctx.fill();
        ctx.strokeStyle='#9fe8ff'; ctx.lineWidth=2; ctx.stroke();
        if(sh){ // внутреннее кольцо пилона (v1.37.0: со средней)
          ctx.strokeStyle='rgba(159,232,255,.35)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(sgn*g2,0,pr*.55,0,6.283); ctx.stroke();
        }
        ctx.fillStyle='#9fe8ff'; ctx.beginPath(); ctx.arc(sgn*g2,0,3,0,6.283); ctx.fill();
        ctx.fillStyle='#3d5a80';
      }
    } else {
      ctx.fillStyle=planetRockTint(o); // v1.100.0 «Планетарий»: тон камня — база, лёд или железо (мина остаётся красной)
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
        /* 23.08.2026 «Блик без обрывов»: раньше дуга блика опиралась на фиксированный
           радиус o.r*.9 — а силуэт камня (случайный семиугольник, радиус вершин .7-1.15
           от o.r) у части камней УЖЕ, чем 90% на отдельных вершинах. Обрезка (ctx.clip)
           срезала дугу там, где контур уже неё — один блик разваливался на несколько
           огрызков (жалоба владельца, дважды). Теперь радиус — минимум по РЕАЛЬНЫМ
           вершинам ЭТОГО камня, с запасом .85: хорда между соседними вершинами (прямая
           линия) провисает ещё уже, чем сама вершина, запас держит дугу гарантированно
           внутри на любом угле. Кэшируется вместе с силуэтом — не считаем заново в кадре. */
        let minVertR=o.verts[0].r;
        for(const v of o.verts) if(v.r<minVertR) minVertR=v.r;
        o._blikR = o.r*minVertR*.85;
        /* 26.08.2026 «Не штамп»: блик, тень и оба кратера сидели на ЖЁСТКО зашитых углах/
           координатах — у каждого камня в игре было идентичное «лицо» поверх случайного
           контура. Владелец разглядел это как «две дуги, будто скобки ( )» — не баг (дуги
           математически не выходят за силуэт, 200к+600к прогонов проверено численно
           заранее), а штамп: одно и то же на каждом камне бросается в глаза, когда камней
           несколько в кадре. Теперь угол блика/тени и положение обоих кратеров случайны на
           каждый камень — но каждое пятно кладётся внутри уже доказанного безопасного круга
           радиуса o._blikR (|центр| + свой_радиус ≤ o._blikR), так что гарантия «не вылезает
           за контур» наследуется от уже проверенной формулы, а не строится заново на глаз. */
        const mkSpot=(rMin,rMax)=>{ const r=mapRand(rMin,rMax)*o.r;
          const budget=Math.max(0,o._blikR-r), d=mapRand(0,budget), a=mapRand(0,6.283);
          return { x:Math.cos(a)*d, y:Math.sin(a)*d, r }; };
        /* 27.08.2026 «Дуг больше нет», окончательный заход. Первые попытки (полоса-исключение,
           потом короткая дуга, потом дуга→новое пятно ПОВЕРХ старых кратеров) не годились:
           последняя завела лишние пятна рядом со старыми — «пятно на пятне», грязное скопление
           кружков в одном месте. Решение: НЕ добавлять новые пятна вместо дуг — просто убрать
           дуги (ctx.arc+.stroke) совсем, оставить ровно те три кратера, что уже были
           (light/darkSmall/darkBig, mkSpot()/o._blikR без изменений) — это ЕДИНСТВЕННЫЙ
           источник тени/объёма камня теперь. Дуг не рисуем нигде — у закрашенного круга нет
           формы скобки. Тон/цвет/заметность камня не менялись ни разу за все три захода. */
        o._decor={ light:mkSpot(.15,.24), darkSmall:mkSpot(.12,.18), darkBig:mkSpot(.24,.34) };
      }
      /* 31.08.2026 «Гранёный камень»: плоская заливка+кратеры (fill+clip+3×drawImage живьём
         каждый кадр) заменены на один испечённый спрайт — см. bakeRockSprite() выше по
         файлу. Форма (o._path) и кратеры (o._decor) не изменились ни на пиксель, добавлены
         только грани/зерно/цвет внутри самого спрайта. */
      const spr=bakeRockSprite(o);
      const cs=o._spriteCss;
      ctx.drawImage(spr, -cs/2, -cs/2, cs, cs);
    }
    ctx.restore();
  }

  if(profileOn){ frameProfile.field+=performance.now()-profileMark; profileMark=performance.now(); }

  // v1.105.0 «Свет и дым»: «бегущая кромка света» на камнях снята (суд глаза: белая дуга
  // читалась как царапина); тон камней — лёд/железо — остаётся, он даёт разнообразие без крика

  /* 23.08.2026 «Заряженная пара»: нить рисуется отдельным проходом в мировых координатах —
     она соединяет ДВЕ разные позиции, локальный translate одного объекта для неё не годится.
     Партнёр проверяется на живость тем же приёмом, что и в физике (game.js) — не рисуем
     нить к чужому переиспользованному объекту, если партнёр уже уничтожен/вылетел. */
  for (const o of obstacles){
    if (o.kind!=='seeker' || !o.paired || !o.pairLead) continue;
    if (!o.pairMate || obstacles.indexOf(o.pairMate)===-1) continue;
    const mate=o.pairMate;
    if(!inView((o.x+mate.x)/2,(o.y+mate.y)/2, Math.abs(o.x-mate.x)/2+40, Math.abs(o.y-mate.y)/2+40)) continue;
    const charging = o.beamPhase==='charge';
    const a = charging ? .15+.55*(o.beamT/1.3) : 1; // нарастание видно честно — не угадайка
    ctx.save();
    ctx.strokeStyle = charging ? 'rgba(255,165,58,'+a.toFixed(3)+')' : 'rgba(255,220,150,.95)';
    ctx.lineWidth = charging ? 2+3*(o.beamT/1.3) : 10; // толщина сама растёт к разряду, на ударе — честная зона поражения видна как есть
    if(!charging){ ctx.globalCompositeOperation='lighter'; }
    ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(mate.x,mate.y); ctx.stroke();
    ctx.restore();
  }

  // Bullet Time: мир замедлен — холодные гало вокруг препятствий + лёгкая вуаль.
  // Вместо shadowBlur — кэш-спрайт powGlow: тот же motion-glow без нагрузки на слабые устройства
  if (S.bt>0 && S.timeScale<.95){
    const k=1-S.timeScale; // 0..0.6 — сила эффекта, затухает вместе с таймером
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=k*.9;
    const g=powGlow('#8fd0ff');
    for (const o of obstacles){
      const r=o.r*3.2;
      if(!inView(o.x,o.y,r,r)) continue;
      ctx.drawImage(g,o.x-r,o.y-r,r*2,r*2);
    }
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
      // 29.08.2026: был общий ключ L.again с настройками — один текст на два разных места
      // означал, что смена подписи в Настройках молча меняла и эту плавающую надпись над
      // собственной тенью в полёте. Разведено: ghostTag — только здесь, свой текст, свой тон.
      const tag = ghostForeign ? (ghostName||'') : ((typeof L!=='undefined' && L && L.ghostTag) ? L.ghostTag : '');
      if (tag){
        ctx.save(); ctx.globalAlpha=clamp(ghostTagT,0,1)*.85;
        ctx.fillStyle=gCol; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.font='500 12px "Exo 2",-apple-system,"Segoe UI",Roboto,sans-serif'; // 28.08.2026: один шрифт на всю игру
        ctx.fillText(String(tag).toUpperCase(), ghostX, ghostY-30);
        ctx.restore();
      }
    }
  }

  drawMorse(); // морзянка: позывной в шлейфе (v1.53.0)

  drawPlane(sh,nowMs);
  drawLaunchFlash(); // 29.08.2026: первые 0.45с забега — если куплена и надета
  planetPlaneFx(nowS); // v1.100.0 «Планетарий»: вспышка крыла при крене + искры звезды

  drawFx(hq,sh); // частицы + попапы (общий блок, в оверлеях тоже)
  if(profileOn){ frameProfile.fx+=performance.now()-profileMark; frameProfile.n++; profileReport(); }

  // аура Пули — огненное свечение за самолётиком (v1.40.0, логика v1.19.0; v1.41.0: все ступени — низкой спрайт, ультре шире)
  if (S.dash>0){
    ctx.save();
    if(sh) ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.5+Math.sin(nowMs/(uq?90:110))*.2;
    const ar=uq?39:29;
    ctx.drawImage(powGlow('#a9bcff'),renderPlaneX-ar,renderPlaneY-ar,ar*2,ar*2); // v1.43.1: плазма, не янтарь
    ctx.restore();
  }

  // кольцо щита
  if (S.shield>0){
    const shPulse=.4+Math.sin(nowMs/150)*.2;
    ctx.save(); ctx.translate(renderPlaneX,renderPlaneY);
    ctx.strokeStyle=`rgba(127,216,255,${shPulse})`;
    ctx.lineWidth=2;
    if(sh){ ctx.strokeStyle='rgba(127,216,255,.18)'; ctx.lineWidth=7; // v1.66.0: ореол щита — широкий мягкий дубль
      ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
      ctx.strokeStyle=`rgba(127,216,255,${shPulse})`; ctx.lineWidth=2; }
    ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
    if(hq){ // внешнее кольцо вращается
      ctx.strokeStyle='rgba(127,216,255,.35)'; ctx.lineWidth=1.5;
      ctx.setLineDash([5,8]); ctx.lineDashOffset=nowMs/35;
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
    if(el){
      el.style.display='block';
      if(!el.dataset.profile) el.textContent = Q.fps.toFixed(0)+' fps · Q'+Q.level+' · p'+particles.length;
    }
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

/* 29.08.2026 «правая сторона, со светом»: общая точка для отрисовки вендоренной SVG-иконки —
   зовётся и из полёта (ниже), и из превью ангара (ui.js:angarShip), чтобы два места не
   разошлись по геометрии. cx/cy — целевая точка в локальных координатах борта (для правой,
   тёмной sh.fold-панели это (5.3,-0.7) — зеркало декальной точки левой панели (-5.3,-0.7),
   тот же треугольник (0,-22)/(0,6)/(16,14), тот же счёт центроида). Красим не в sh.fold (та
   же тень = тот же фон, иконка утонет), а в sh.glow — яркий акцентный цвет борта, свой у
   каждого скина (тот же, что даёт аура корпуса и след), но всегда заметно светлее fold, на
   котором стоит иконка — то есть иконка снова «под скин», как и была на левой панели, но
   не сливается с тёмным фоном справа (владелец, 29.08.2026: «пропала возможность под цвет
   скина подстраиваться» — вернул, только опорный цвет сменился с fold на glow). Двойной
   проход (широкий полупрозрачный ореол + чёткий силуэт) вместо ctx.shadowBlur: дёшево на
   каждый кадр, не требует кэш-спрайта, как planeGlow(). */
/* 02.09.2026 «Декали разного размера»: эмодзи-декали (в отличие от векторных иконок, у которых
   уже есть нормализация s=9/max(vb)) рисовались одним фиксированным font-size=9px для всех —
   но у разных эмодзи разная НАСТОЯЩАЯ ширина при том же размере шрифта (замерено вживую:
   6.3px у «Италии» до 13.1px у «Фудзиямы», почти двукратный разброс — владелец поймал: одни
   эмодзи вылезают за сгиб корпуса, другие нет). ctx.measureText() — не дешёвая операция, но
   ширина ОДНОГО и того же символа при ОДНОМ и том же font-size не меняется от кадра к кадру —
   меряем раз на декаль (при первой отрисовке ЛЮБЫМ бортом), дальше только умножение, как уже
   у иконок. Кэш — по символу, не по id декали: разные декали с одним и тем же ch (если такие
   появятся) меряются один раз на двоих. */
const DECAL_W_CACHE=new Map();
const DECAL_TARGET_W=9; // тот же запас у сгиба, что и в исходном расчёте (см. комментарий выше в drawPlane)
function decalFontSize(dc, ctx){
  let w=DECAL_W_CACHE.get(dc.ch);
  if(w===undefined){
    const prevFont=ctx.font; ctx.font='9px sans-serif';
    w=ctx.measureText(dc.ch).width||9; // 0/NaN (несуществующий глиф) — не даём делению на ноль улететь в бесконечность
    ctx.font=prevFont;
    DECAL_W_CACHE.set(dc.ch,w);
  }
  return clamp(9*DECAL_TARGET_W/w, 4, 20); // зажато — сломанный/крошечный глиф не раздувается в исполинский шрифт
}
function drawDecalSvg(c, dc, cx, cy, skin){
  const vb=dc.vb, s=9/Math.max(vb[2],vb[3]), path=new Path2D(dc.svg), vcx=vb[0]+vb[2]/2, vcy=vb[1]+vb[3]/2;
  const base=(skin||SKINS[0]).glow.slice(0, (skin||SKINS[0]).glow.lastIndexOf(',')+1); // 'rgba(r,g,b,' — тот же приём, что в drawLaunchFlash
  const col=a=>base+Math.max(0,a).toFixed(2)+')';
  c.save();
  c.translate(cx,cy); c.scale(s,s); c.translate(-vcx,-vcy);
  c.save(); c.translate(vcx,vcy); c.scale(1.10,1.10); c.translate(-vcx,-vcy);
  c.fillStyle=col(.15); c.fill(path);
  c.restore();
  c.fillStyle=col(.95); c.fill(path);
  /* 30.08.2026 «Тень позади иконки» (баг владельца): glow почти совпадал с fold на нескольких
     скинах (посчитано — контраст 1.10-1.36 вместо нужных ~1.5+), особенно на «Бумажном»
     (стартовый скин у всех новых игроков) — силуэт тонул в панели, оставался виден только
     широкий ореол выше, который и читался как «тень». Тёмная обводка держит контур видимым
     на любом скине, не трогая саму заливку (она по-прежнему цвет скина — решение владельца
     от 29.08.2026 выше по файлу).
     02.09.2026: та самая «тень» сама стала жалобой — без размытия плоская копия на 35%
     крупнее/30% непрозрачности читалась как жёсткое кольцо-контур вокруг иконки, не как
     мягкая тень (владелец вживую, скриншот). Макет (macet-02-09-tenj-ikonki.html), три
     варианта — владелец выбрал «В»: тень тише (1.10/×0.15 вместо 1.35/×0.30), кольцо
     исчезает, лёгкий отблеск остаётся. */
  c.lineJoin='round'; c.lineWidth=Math.max(vb[2],vb[3])*0.035; c.strokeStyle='rgba(8,12,26,.5)';
  c.stroke(path);
  c.restore();
}
/* 29.08.2026 «Вспышка при старте» — третий независимый слот тюнинга (FLASHES/S.launchFx,
   game.js). Держим на самом дешёвом таймере, какой уже есть: S.time — часы полёта, растут
   только пока update() реально тикает (пауза не портит), обнуляются на новый забег сами —
   отдельная метка времени старта не нужна. Окно — первые 0.45с, дальше функция не рисует
   вообще (первая же проверка). Все узоры красятся в skin.glow (тот же цвет, что аура борта
   и след) — самый очевидный «правильный» цвет для вспышки именно ЭТОГО борта, ничего
   отдельно решать не пришлось. Десять style — десять простых формул r(p)/alpha(p) от
   p=S.time/0.45 (0..1), без ctx.shadowBlur (дорого каждый кадр) — просто заливка/обводка
   с растущим радиусом и падающей прозрачностью, тот же класс дешёвого приёма, что уже
   проверен на decal-иконках (drawDecalSvg). */
/* renderFlashPattern — сам узор, без привязки к S/ctx глобальным: принимает canvas-контекст
   `c` (может быть и жетон в Ангаре, не только полётный ctx) и готовую функцию цвета `col`
   (число альфы → строка rgba). Так драка полёта (drawLaunchFlash ниже) и честное превью
   плитки в ui.js:angarBuildGrid() зовут ровно один и тот же код — жетон не врёт о том,
   как это выглядит на самом деле. */
function renderFlashPattern(c, style, p, col){
  const ring=(rp,widthFrom,widthTo)=>{
    if(rp<=0) return;
    c.strokeStyle=col(1-rp); c.lineWidth=widthTo+(widthFrom-widthTo)*(1-rp);
    c.beginPath(); c.arc(0,0,10+rp*34,0,6.2832); c.stroke();
  };
  const dots=(n,rot)=>{
    c.fillStyle=col(1-p);
    for(let i=0;i<n;i++){
      const ang=i*(6.2832/n)+rot, r=6+p*28;
      c.beginPath(); c.arc(Math.cos(ang)*r,Math.sin(ang)*r,2.2*(1-p*.6),0,6.2832); c.fill();
    }
  };
  const rays=(n,len0,len1,lw,offset)=>{
    c.strokeStyle=col(1-p); c.lineWidth=lw;
    for(let i=0;i<n;i++){
      const ang=i*(6.2832/n)+offset;
      c.beginPath();
      c.moveTo(Math.cos(ang)*len0,Math.sin(ang)*len0);
      c.lineTo(Math.cos(ang)*(len0+p*(len1-len0)),Math.sin(ang)*(len0+p*(len1-len0)));
      c.stroke();
    }
  };
  switch(style){
    case 'ring': ring(p,3.5,.5); break;
    case 'star': rays(7,8,38,2,0); break;
    case 'particles': dots(10,0); break;
    case 'spiral': dots(10,p*2.5); break;
    case 'sphere': c.fillStyle=col((1-p)*(1-p)); c.beginPath(); c.arc(0,0,4+p*18,0,6.2832); c.fill(); break;
    /* 29.08.2026 «14 разных, не 10 с дублями» — девять новых узоров, ни один не повторяет
       ни старые пять выше, ни друг друга по силуэту (см. коммент над FLASHES в game.js). */
    case 'comet': { // единственный несимметричный: хвост-полоса в одну сторону (за кормой), не кольцом вокруг
      const n=8, tailLen=10+p*40;
      for(let i=0;i<n;i++){
        const t=i/(n-1), r=t*tailLen;
        c.fillStyle=col((1-p)*(1-t*.75));
        c.beginPath(); c.arc(0,r,(1-t)*4*(1-p*.3),0,6.2832); c.fill();
      }
      break;
    }
    case 'saturn': { // наклонный эллипс, не окружность
      c.strokeStyle=col(1-p); c.lineWidth=2.5;
      const rx=10+p*30;
      c.save(); c.rotate(-.35);
      c.beginPath(); c.ellipse(0,0,rx,rx*.35,0,0,6.2832); c.stroke();
      c.restore();
      break;
    }
    case 'shards': { // залитые треугольники-обломки, развёрнутые наружу
      c.fillStyle=col(1-p);
      const n=6;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n)+.3, r=6+p*32, sz=3.5*(1-p*.4);
        c.save(); c.translate(Math.cos(ang)*r,Math.sin(ang)*r); c.rotate(ang);
        c.beginPath(); c.moveTo(0,-sz); c.lineTo(sz*.6,sz); c.lineTo(-sz*.6,sz); c.closePath(); c.fill();
        c.restore();
      }
      break;
    }
    case 'galaxy': { // несколько закрученных рукавов точек — не просто вращающиеся точки, как Вихрь
      c.fillStyle=col(1-p);
      const arms=3, perArm=5;
      for(let a=0;a<arms;a++){
        const armOff=a*(6.2832/arms);
        for(let i=0;i<perArm;i++){
          const t=i/(perArm-1), r=t*(8+p*30), ang=armOff+t*2.4+p*1.5;
          c.beginPath(); c.arc(Math.cos(ang)*r,Math.sin(ang)*r,1.8,0,6.2832); c.fill();
        }
      }
      break;
    }
    case 'snowflake': { // шесть лучей с боковыми ответвлениями — не просто прямые лучи
      c.strokeStyle=col(1-p); c.lineWidth=1.8;
      const len=8+p*30;
      for(let i=0;i<6;i++){
        const ang=i*(6.2832/6), dx=Math.cos(ang), dy=Math.sin(ang), px=-dy, py=dx;
        c.beginPath(); c.moveTo(0,0); c.lineTo(dx*len,dy*len); c.stroke();
        const bx=dx*len*.6, by=dy*len*.6, bl=len*.25;
        c.beginPath(); c.moveTo(bx,by); c.lineTo(bx+px*bl,by+py*bl); c.stroke();
        c.beginPath(); c.moveTo(bx,by); c.lineTo(bx-px*bl,by-py*bl); c.stroke();
      }
      break;
    }
    case 'flower': { // залитые лепестки-эллипсы, не прямые лучи
      c.fillStyle=col((1-p)*.85);
      const n=6;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n), r=6+p*26;
        c.save(); c.translate(Math.cos(ang)*r*.5,Math.sin(ang)*r*.5); c.rotate(ang);
        c.beginPath(); c.ellipse(0,0,r*.55,r*.22,0,0,6.2832); c.fill();
        c.restore();
      }
      break;
    }
    case 'corona': { // залитое волнистое пятно, не дискретные лучи/кольцо
      c.fillStyle=col((1-p)*.7);
      const n=24, baseR=6+p*24;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const ang=i*(6.2832/n), r=baseR*(1+.28*Math.sin(ang*7));
        const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.closePath(); c.fill();
      break;
    }
    case 'wings': { // два крыла по бокам — единственная двусторонняя, не радиальная симметрия
      c.fillStyle=col((1-p)*.8);
      const len=8+p*30;
      [-1,1].forEach(side=>{
        c.beginPath(); c.moveTo(0,0);
        c.quadraticCurveTo(side*len*.5,-len*.3, side*len,-len*.1);
        c.quadraticCurveTo(side*len*.6,len*.15, 0,0);
        c.fill();
      });
      break;
    }
    case 'honeycomb': { // маленькие шестиугольники по кругу — не окружности/точки
      c.strokeStyle=col(1-p); c.lineWidth=1.5;
      const n=6, hexR=3+p*3;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n), r=8+p*26, cx=Math.cos(ang)*r, cy=Math.sin(ang)*r;
        c.beginPath();
        for(let k=0;k<6;k++){
          const a2=k*(6.2832/6), x=cx+Math.cos(a2)*hexR, y=cy+Math.sin(a2)*hexR;
          if(k===0) c.moveTo(x,y); else c.lineTo(x,y);
        }
        c.closePath(); c.stroke();
      }
      break;
    }
  }
}
/* 29.08.2026 «Вспышка при старте» — третий независимый слот тюнинга (FLASHES/S.launchFx,
   game.js). Держим на самом дешёвом таймере, какой уже есть: S.time — часы полёта, растут
   только пока update() реально тикает (пауза не портит), обнуляются на новый забег сами —
   отдельная метка времени старта не нужна. Окно — первые 0.45с, дальше функция не рисует
   вообще (первая же проверка). Красится в skin.glow (тот же цвет, что аура борта и след) —
   самый очевидный «правильный» цвет для вспышки именно ЭТОГО борта. Без ctx.shadowBlur
   (дорого каждый кадр) — тот же класс дешёвого приёма, что уже проверен на decal-иконках
   (drawDecalSvg). */
function drawLaunchFlash(){
  // 29.08.2026: было S.flash — уже занято золотой вспышкой подбора звезды (см. выше в этом
  // файле, ~строка 1280), которая перетирала это значение каждый кадр. Переименовано.
  if(!S.launchFx || S.time>=.45) return;
  const fl=FLASHES_BY_ID.get(S.launchFx); if(!fl || fl.style==='none') return;
  const skin=SKINS[S.skin]||SKINS[0];
  const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1); // 'rgba(r,g,b,' — тот же приём, что уже в drawPlane для ауры
  const col=a=>base+Math.max(0,a).toFixed(2)+')';
  const p=clamp(S.time/.45,0,1);
  ctx.save(); ctx.translate(renderPlaneX,renderPlaneY);
  renderFlashPattern(ctx, fl.style, p, col);
  ctx.restore();
}
function drawPlane(sh,nowMs){
  const p=plane, skin=SKINS[S.skin]||SKINS[0], hq=Q.level>=2, uq=Q.level>=3; // v1.37.0: ультра-штрихи
  const fx=skin.fx||'';
  nowMs=typeof nowMs==='number'?nowMs:performance.now();
  // Призрак: полупрозрачность с дыханием (hq) — себя терять нельзя, минимум .65
  const ghostA=(fx==='ghost'&&hq)? .65+.1*Math.sin(nowMs/300) : 1;
  if(fx==='ghost'&&hq){ drawEchoTrail(skin);
    if(S.running&&!S.paused){ echoBuf.push({x:p.x,y:p.y,bank:p.bank}); if(echoBuf.length>40) echoBuf.shift(); } }
  ctx.save(); ctx.translate(renderPlaneX,renderPlaneY);
  if (S.invuln>0 && S.invuln<1e8 && invulnDim()) ctx.globalAlpha=(RM?.6:.35)*ghostA; // v1.94.0: театральное бессмертие (1e9) — без мигания, спектакль идёт ровно
  else if(ghostA<1) ctx.globalAlpha=ghostA;

  if(!coneGrad){
    coneGrad = ctx.createLinearGradient(0,10,0,150);
    coneGrad.addColorStop(0,'rgba(190,220,255,.30)');
    coneGrad.addColorStop(1,'rgba(190,220,255,0)');
  }
  if(hq){ // конус светится и дышит
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(RM?.9:(.75+.25*Math.sin(nowMs/90)))*(S.invuln>0?.35:1); // v1.282.15: и пульсация под бережным небом замирает
  }
  ctx.fillStyle=coneGrad;
  ctx.beginPath(); ctx.moveTo(-6,10); ctx.lineTo(6,10);
  ctx.lineTo(34,150); ctx.lineTo(-34,150); ctx.closePath(); ctx.fill();
  // v1.282.15: мигание через общую функцию — бережное небо гасит стробоскоп
  if(hq){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=S.invuln>0&&invulnDim()?(RM?.6:.35):1; }

  if(hq){ // аура двигателя: тёплое аддитивное свечение кормы, дышит с огоньком
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(.30+.12*Math.sin(nowMs/70))*(S.invuln>0?.4:1)*ghostA*planetEngineK(); // v1.100.0 «Планетарий»: корма разгорается со скоростью
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
  if(sh){ // кромки крыльев — хрусткая бумага (со средней ступени)
    ctx.strokeStyle='rgba(255,255,255,.32)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.moveTo(0,-22); ctx.lineTo(16,14); ctx.stroke();
  }
  /* 31.08.2026: блик-эллипс у носа (владелец обвёл жёлтым: «я думал ранее это какая-то
     ошибка... он мешает») — убран целиком. Огонёк двигателя владельцу, наоборот,
     понравился — вынесен из-под if(sh) и включён на всех ступенях, включая дно: один
     fillStyle+arc, та же дешёвая заливка, что уже была здесь. */
  ctx.globalAlpha=.6+.4*Math.sin(nowMs/70);
  ctx.fillStyle=skin.trail+'.95)';
  const er=fx==='plasma'? 3.4+1.6*Math.sin(nowMs/60) : (uq?3.2:2.6); // у Плазмы — живой огонь; ультра — жарче
  ctx.beginPath(); ctx.arc(0,11,er,0,6.283); ctx.fill();
  ctx.globalAlpha=ghostA;
  if(uq){ // ультра: зеркальный блик правого крыла
    ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(2,-18); ctx.lineTo(13,11); ctx.stroke();
  }
  if(hq && fx==='plasma'){ // Плазма: живой перелив корпуса оранж→синий
    const ph=nowMs/180;
    ctx.globalAlpha=(.14+.08*Math.sin(ph))*ghostA;
    ctx.fillStyle=PLASMA_HUES[Math.max(4,Math.min(32,Math.round(18+14*Math.sin(ph*.7))))]; // v1.66.0: готовая строка
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=ghostA;
  }
  if(hq && fx==='neon'){ // Неон: контур корпуса пульсирует и плывёт по спектру
    const hue=(nowMs*.06)%360|0;
    ctx.strokeStyle=NEON_HUES[hue]+(.9*ghostA)+')'; ctx.lineWidth=1.7; // v1.66.0: готовая строка оттенка
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.stroke();
  }
  if(hq && fx==='chrome'){ // Хром: бегущий блик-полоса по корпусу (дешёвый sheen)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.clip();
    const sx=-34+((nowMs*.05)%68);
    ctx.drawImage(sheenSprite(),sx-9,-26,18,48); // v1.66.0: спрайт-полоса вместо градиента в кадре
    ctx.restore();
  }
  /* 28.08.2026 «Тюнинг, шаг 1: декаль на корпусе». Левая половина корпуса — плоская видимая
     грань (fold красит только правый треугольник, см. выше); декаль кладём в её центр масс —
     геометрический центроид треугольника носа/крыла/хвоста (0,-22)/(-16,14)/(0,6):
     ((0-16+0)/3, (-22+14+6)/3) = (-5.3, -0.7), посчитано, не на глаз. Размер шрифта (9px)
     первая прикидка — половина ширины эмодзи должна остаться по эту сторону линии сгиба
     (центр в -5.3, сгиб на x=0 → запас ~5.3, эмодзи ~9px даёт запас ~0.8). Не гейтится по
     качеству — цвет корпуса тоже не гейтится, декаль такая же базовая часть облика.
     Владелец должен увидеть вживую и поправить размер/позицию по факту — не финал. */
  if(S.decal){ const dc=DECALS_BY_ID.get(S.decal);
    if(dc && dc.ch){
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font=decalFontSize(dc,ctx)+'px sans-serif';
      ctx.fillText(dc.ch,-5.3,-0.7);
    }
  }
  /* 29.08.2026 «отдельная категория, правая сторона»: иконка — независимый слот (S.icon,
     ICONS в game.js), носится одновременно с декалью выше, не вместо неё. Правая половина
     корпуса — та, что красит sh.fold (см. ctx.fillStyle=fold чуть выше по функции);
     центроид того же треугольника (0,-22)/(0,6)/(16,14): ((0+0+16)/3,(-22+6+14)/3) =
     (5.3,-0.7) — точное зеркало левой декальной точки, не на глаз. */
  if(S.icon){ const ic=ICONS_BY_ID.get(S.icon);
    if(ic && ic.svg) drawDecalSvg(ctx, ic, 5.3, -0.7, skin);
  }
  ctx.strokeStyle='rgba(120,140,180,.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.stroke();
  ctx.restore();
}

/* ================= LOOP (Блок 3: fixed timestep 60 Гц) ================= */
const STEP=1/60;
let acc=0, lastTime=0, rafId=0, menuDrawT=0, loopScr='', pauseT0=0, drawForce=false;
/* 22.08.2026 «Дёрганье на 120Гц»: при фиксированном шаге 1/60 рендер рисовал позицию
   последнего тика физики — на дисплеях 120Гц между двумя тиками физики укладывается два
   кадра рендера, и на нечётном кадре самолётик не двигался вовсе (микро-дёрганье). Лекарство —
   линейная интерполяция между прошлым и текущим тиком по остатку акк-я (alpha=acc/STEP);
   физику НЕ трогает — plane.x/plane.y как были целыми числами шага, так и остались,
   интерполяция только для трёх мест ВИЗУАЛЬНОГО рисования самолётика (сам корпус, кольцо
   щита, аура Пули — их обязательно интерполировать ВМЕСТЕ, иначе щит визуально уедет от
   корпуса). След призрака (echoBuf) и редкие кольца вспышки рекорда — по-прежнему от
   настоящей физической позиции: одному нужен подлинный путь, другому точность не важна. */
function interpPos(prev,cur,alpha){ return prev+(cur-prev)*alpha; }
let prevPlaneX=0, prevPlaneY=0, renderPlaneX=0, renderPlaneY=0;
function drawKick(){ drawForce=true; } // внешнее событие (resize) — кадр вне очереди, но БЕЗ сброса часов сна (v1.66.2)
let corrShown=false, corrWasInGame=false;
function corridorEdgesSync(inGameNow){
  if (typeof inGameNow!=='boolean'){
    // вызов без параметра (из core.js, по таймеру дребезга/скрытию) — сами смотрим на игровое состояние
    inGameNow = (typeof screenName!=='undefined' && screenName==='game' && typeof S!=='undefined' && S && S.running && !S.paused);
  }
  /* 01.09.2026: --corrEdgeTop меряет telemHud/pausePack (syncScoreHudGap, core.js) — а вне
     полёта они пустые/свёрнуты (0 высоты). Все прежние поводы для перемера (resize, смена
     --sat, готовый шрифт) уже случались ДО взлёта, отступ застывал на этом нулевом числе, и
     линия въезжала прямо в HUD (владелец поймал вживую, 01.09.2026, скрин с «▲▲▲» под линией).
     Взлёт (переход в inGameNow) — отдельный повод, которого не было: HUD как раз тогда
     наполняется реальным содержимым и раскрывается до настоящей высоты. */
  if (inGameNow && !corrWasInGame && typeof syncScoreHudGap==='function') requestAnimationFrame(syncScoreHudGap);
  corrWasInGame=inGameNow;
  const wantShow = inGameNow && (typeof corrWideOk!=='undefined' && corrWideOk);
  if (wantShow===corrShown) return; // не трогаем DOM, если ничего не изменилось — дёшево на каждый кадр
  corrShown=wantShow;
  const l=document.getElementById('corrEdgeL'), r=document.getElementById('corrEdgeR');
  if(l) l.classList.toggle('show', wantShow);
  if(r) r.classList.toggle('show', wantShow);
}
/* 01.09.2026 «Не вморожена»: владелец — статичная рамка коридора читается отдельным,
   неподвижным объектом рядом с летящим миром, «убивает» ощущение скорости.
   Первая попытка (0.024*speed*1.5, тот же коэффициент, что у фоновых звёзд) оказалась
   ошибкой того же класса, о которой предупреждает сам проект: число скопировано, не
   проверено численно под НОВЫЙ контекст. 0.024 калиброван для мелких точек, разбросанных
   по всему высокому канвасу — там медленный дрейф всё равно заметен за счёт масштаба сцены.
   У полосы коридора узор всего 96px и повторяется — на максимуме S.speed=8 то же число
   давало бы полный цикл узора за 333 секунды, то есть глазом неотличимо от статики (ровно
   то, что владелец и увидел живьём). Число ниже подобрано заново под РАЗМЕР ЭТОГО узора:
   на старте (speed=3.4) полный цикл ~2.8с, на потолке (speed=8, v1.31 game.js:2039) ~1.2с —
   отчётливо видно движение на любой стадии полёта. Скорость по-прежнему честно берётся из
   S.speed (не выдуманное отдельное число, синхронно с миром), только коэффициент — не тот
   же самый, что у фона, а свой, посчитанный под этот масштаб. Тикает ТОЛЬКО пока полоса
   реально видна (corrShown) — на паузе/в меню не расходует ничего. */
let corrScrollY=0;
function corrScrollTick(dt){
  corrScrollY=(corrScrollY+dt*S.speed*S.timeScale*10)%96;
  document.documentElement.style.setProperty('--corrScrollY',corrScrollY.toFixed(2)+'px');
}
function loop(t){
  rafId=requestAnimationFrame(loop);
  /* v1.400.3 «Не рисуем в пустоту»: боевой крэш (InvalidStateError, drawImage, render.js —
     «canvas element with a width or height of 0»). Корень — не в resize() (он и так честно
     отказывается при cssW<=0||cssH<=0), а в том, что на части Android-клиентов Telegram
     window.innerWidth/innerHeight в момент первого прохода скрипта сами ещё нулевые, и ни
     один resize() ещё не успел отработать, пока requestAnimationFrame уже крутит кадры.
     nebulaField() при W===0/H===0 создаёт офскрин-холст 0×0 и тут же отдаёт его в drawImage —
     падение. Ждём тихо: rAF уже перезаписан выше, следующий кадр проверит снова; как только
     где-то снаружи (уже существующий слушатель window resize, viewportChanged и т.д.)
     отработает настоящий resize(), геометрия появится и рисование продолжится само. */
  if (W<=0 || H<=0) return;
  let dt=(t-lastTime)/1000; lastTime=t;
  if(typeof pollGamepad==='function') pollGamepad(); // v1.99.4 «Штурвал»: опрос каждый кадр — руль и кнопки на любом экране
  if(dt>0.25)dt=0.25; if(dt<0)dt=0;
  /* v1.282.15: метрику снимаем ТОЛЬКО в небе. qualityTick считал итерации rAF, а рисуем
     мы на оверлеях намеренно вдвое реже (~30 fps), а на замершей паузе — вчетверо реже.
     То есть в меню Q.fps показывал 60 при тридцати реальных кадрах дешёвой сцены: авто
     уверенно лезло вверх по ступеням и снимало «потолок-памятку» (тот самый, что бережёт
     уровень, с которого мы упали). Постоял в меню полминуты — и следующий полёт начинается
     с заикания, пока лестница заново не спустится. На чужих экранах метрику замораживаем. */
  const inGameNow = screenName==='game' && S.running && !S.paused;
  if (inGameNow) qualityTick(dt);
  else { Q._acc=0; Q._n=0; Q._t=0; }
  corridorEdgesSync(inGameNow); // v1.415.2: рамка коридора — то же игровое состояние, мгновенно, без задержки дребезга (та живёт только у геометрии в core.js)
  if (corrShown) corrScrollTick(dt); // 01.09.2026: тикает только пока полоса реально видна — дёшево
  if (S.running && !S.paused){
    prevPlaneX=plane.x; prevPlaneY=plane.y; // снимок ДО шагов физики этого кадра
    acc+=dt;
    let n=0;
    const updT0=performance.now(); // 24.08.2026: draw() измерен весь (bg/stars/sky/field/fx), а update() — ни разу; тот же дешёвый приём, что и у остальных пяти секций
    while(acc>=STEP && n<4){ update(STEP); acc-=STEP; n++; if(!S.running||S.paused){acc=0;break;} } // v1.99.2 «Бережное небо»: пауза доехала — кадр не докручиваем, время не отскакивает
    frameProfile.update+=performance.now()-updT0;
    if(n===4) acc=0;
    const ia=Math.min(1,Math.max(0,acc/STEP));
    renderPlaneX=interpPos(prevPlaneX,plane.x,ia); renderPlaneY=interpPos(prevPlaneY,plane.y,ia);
  } else {
    updateFx(dt); // частицы и попапы догорают на паузе и оверлеях (конфетти рекорда живёт)
    renderPlaneX=plane.x; renderPlaneY=plane.y; // не в полёте — рисуем как есть, интерполировать нечего
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
