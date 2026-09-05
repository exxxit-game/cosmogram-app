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
        if (changed && typeof BEACON!=='undefined') BEACON.signalShot('fps_drop_severe', Math.round(Q.fps)+' '+frameProfileSnapshot()+qBaseInfo()); // 02.09.2026: снимок холста — просадка кадра видна НА canvas, значит есть смысл смотреть на неё, не только читать число
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
      if (changed && typeof BEACON!=='undefined') BEACON.signalShot('fps_drop', Math.round(Q.fps)+' '+frameProfileSnapshot()+qBaseInfo()); } } // v1.108.1: тихая автокоррекция теперь долетает до почты — раньше об этом узнавал только тот, кто сам зашёл в Сервисный центр; 02.09.2026: + снимок холста, просадка видна НА canvas
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
/* 04.09.2026 «Премиум-скины за Stars»: общий гранёный камень для приёмов корпуса —
   Спутники/Грани/Инкрустация/Филигрань/Прицел ставят его в разных местах со своей логикой
   блика, сама форма камня одна и та же маленькая огранка. Отобрано владельцем живьём через
   макет (см. project_premium_skins_visual_language в памяти) — здесь тот же код, что там,
   просто с skin.trail вместо демо-цвета.
   04.09.2026, второй заход («сливается с корпусом»): камень и оправа красились в тот же
   оттенок, что сам корпус (skin.trail), просто прозрачнее — на пастельных скинах разница
   цвета физически низкая. METAL — тёплое старое золото, независимое от цвета борта,
   держит контраст на любом скине; metalStroke — общий помощник для линий этим металлом.
   Первая попытка контраста была тёмной бронзой (96,72,48) — владелец: «читается как
   грязно-чёрное». Текущий оттенок — светлее и теплее, проверено живьём. */
const METAL='rgba(198,152,74,';
function metalStroke(ctx, drawPath, a, w, col){ // col: необязательный — своя окраска вместо METAL (нужно материалам ниже)
  ctx.save(); ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle=col||(METAL+a+')'); ctx.lineWidth=w;
  ctx.beginPath(); drawPath(ctx); ctx.stroke();
  ctx.restore();
}
function drawSkinGem(g, skin, x, y, r, glint){
  g.save(); g.translate(x,y);
  g.fillStyle=skin.trail+'.75)';
  g.beginPath(); g.moveTo(0,-r); g.lineTo(r*.7,0); g.lineTo(0,r); g.lineTo(-r*.7,0); g.closePath(); g.fill();
  g.fillStyle='rgba(255,255,255,.28)'; // всегда видимая белая сердцевина, не только на блике
  g.beginPath(); g.moveTo(0,-r*.5); g.lineTo(r*.32,0); g.lineTo(0,r*.5); g.lineTo(-r*.32,0); g.closePath(); g.fill();
  metalStroke(g, c=>{ c.moveTo(0,-r); c.lineTo(r*.7,0); c.lineTo(0,r); c.lineTo(-r*.7,0); c.closePath(); }, .8, .35);
  if(glint>0.02){
    g.save(); g.globalCompositeOperation='lighter';
    g.fillStyle='rgba(255,255,255,'+(glint*.95).toFixed(2)+')';
    g.beginPath(); g.moveTo(0,-r); g.lineTo(r*.7,0); g.lineTo(0,r); g.lineTo(-r*.7,0); g.closePath(); g.fill();
    g.strokeStyle='rgba(255,255,255,'+glint.toFixed(2)+')'; g.lineWidth=.4;
    g.beginPath(); g.moveTo(-r*1.6,0); g.lineTo(r*1.6,0); g.moveTo(0,-r*1.6); g.lineTo(0,r*1.6); g.stroke();
    g.restore();
  }
  g.restore();
}
/* «мощный кристалл» вместо цветочка у Спутников — сросток из трёх шипов (главный +
   два боковых поменьше), тот же металлический контур, что у остального. */
function drawMightyCrystal(ctx, trail, x, y, r, glint){
  ctx.save(); ctx.translate(x,y);
  const shapes=[
    [[-r*.15,-r*.35],[-r*.9,r*.1],[-r*.4,r*.55],[-r*.05,r*.15]],
    [[r*.15,-r*.35],[r*.9,r*.1],[r*.4,r*.55],[r*.05,r*.15]],
    [[0,-r*1.5],[r*.5,r*.15],[0,r*.85],[-r*.5,r*.15]],
  ];
  shapes.forEach((pts,i)=>{
    ctx.fillStyle=trail+(i===2?'.8)':'.6)');
    ctx.beginPath(); pts.forEach(([px,py],j)=>j===0?ctx.moveTo(px,py):ctx.lineTo(px,py)); ctx.closePath(); ctx.fill();
    metalStroke(ctx, c=>{ pts.forEach(([px,py],j)=>j===0?c.moveTo(px,py):c.lineTo(px,py)); c.closePath(); }, .8, .3);
  });
  if(glint>0.02){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(255,255,255,'+(glint*.9).toFixed(2)+')';
    const main=shapes[2];
    ctx.beginPath(); main.forEach(([px,py],j)=>j===0?ctx.moveTo(px,py):ctx.lineTo(px,py)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,'+glint.toFixed(2)+')'; ctx.lineWidth=.4;
    ctx.beginPath(); ctx.moveTo(-r*1.4,0); ctx.lineTo(r*1.4,0); ctx.moveTo(0,-r*1.9); ctx.lineTo(0,r*1.1); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
/* «наконечник» Прицела — крупный, свой собственный силуэт (вытянутый, острее обычного
   камня), не общий drawSkinGem: он один такой на весь борт, ему можно быть особенным. */
function drawSpearGem(ctx, trail, x, y, r, glint){
  ctx.save(); ctx.translate(x,y);
  const pts=(c)=>{ c.moveTo(0,-r*1.3); c.lineTo(r*.55,0); c.lineTo(0,r*.75); c.lineTo(-r*.55,0); c.closePath(); };
  ctx.fillStyle=trail+'.8)';
  ctx.beginPath(); pts(ctx); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.32)';
  ctx.beginPath(); ctx.moveTo(0,-r*.7); ctx.lineTo(r*.26,0); ctx.lineTo(0,r*.4); ctx.lineTo(-r*.26,0); ctx.closePath(); ctx.fill();
  metalStroke(ctx, pts, .85, .4);
  if(glint>0.02){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(255,255,255,'+(glint*.95).toFixed(2)+')';
    ctx.beginPath(); pts(ctx); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,'+glint.toFixed(2)+')'; ctx.lineWidth=.45;
    ctx.beginPath(); ctx.moveTo(-r*1.1,0); ctx.lineTo(r*1.1,0); ctx.moveTo(0,-r*1.7); ctx.lineTo(0,r*1.1); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
const FACET_PARTS=[ // грани корпуса для fx:'facets' — координаты те же, что макет
  { pts:[[0,-22],[-16,14],[-8,10]], base:'.10', cx:-8 },
  { pts:[[0,-22],[-8,10],[0,6]],    base:'.22', cx:-2.7 },
  { pts:[[0,-22],[0,6],[8,10]],     base:'.16', cx:2.7 },
  { pts:[[0,-22],[8,10],[16,14]],   base:'.26', cx:8 },
];
// углы корпуса (нос + оба кончика крыла) — общие точки для Граней/Прицела
const CORNER_NOSE=[0,-22], CORNER_LWING=[-16,14], CORNER_RWING=[16,14];
/* 04.09.2026 (владелец, живое устройство: «кривые линии»): координаты были на глаз, теперь
   считаны — [1] и [2] стоят РОВНО на серединах рёбер крыльев ((0,-22)-(-16,14) и
   (0,-22)-(16,14) → (-8,-4)/(8,-4)), оправа-«паутинка» рисуется от вершины носа (0,-22) до
   этих же точек — то есть буквально по кромке крыла, не наискось через корпус. [0] — на
   линии сгиба (x=0), в оправу не входит, отдельный камень. */
const GEM_SLOTS=[ {x:0,y:-14,r:2.1,ph:0}, {x:-8,y:-4,r:1.7,ph:2.4}, {x:8,y:-4,r:1.7,ph:4.8} ]; // для fx:'inlay'
// «на конце крыльев камни, что будут мигать» (владелец) — отдельные слоты на кончиках,
// своя фаза мигания
const WINGTIP_SLOTS=[ {x:-16,y:14,r:1.5,ph:1.2}, {x:16,y:14,r:1.5,ph:3.6} ];
/* 04.09.2026, второй заход (владелец, живьём): формула поворота на 90° не знает, какая
   сторона «внутрь» для конкретного ребра — для правого ребра (b-a=(16,36)) она честно
   давала внутрь корпуса, для левого (b-a=(-16,36), другой знак dx) — по той же формуле,
   но фактически НАРУЖУ (насечки торчали в пустое небо рядом с бортом). Разворачиваю
   знак ТОЛЬКО у левой кромки (ei===0), правую не трогаю — она была верна с самого начала. */
const FIL_MARKS=(()=>{ // насечки вдоль кромки крыльев для fx:'filigree'
  const edges=[ [[0,-22],[-16,14]], [[0,-22],[16,14]] ], marks=[];
  edges.forEach(([a,b],ei)=>{
    const n=6;
    for(let i=1;i<n;i++){
      const f=i/n;
      const x=a[0]+(b[0]-a[0])*f, y=a[1]+(b[1]-a[1])*f;
      let nx=-(b[1]-a[1]), ny=(b[0]-a[0]);
      if(ei===0){ nx=-nx; ny=-ny; }
      const len=Math.hypot(nx,ny);
      marks.push({x,y,ux:nx/len,uy:ny/len,f});
    }
  });
  return marks;
})();

/* 05.09.2026 «добавляй все скины в игру»: 30 доп. премиум-скинов (id15-44 в SKINS,
   game.js) — отобраны владельцем через макеты этой же сессии, 17 «материалов» (тело
   перекрашено целиком, не пятно на нейтральном листе), 9 символов-сигилов (нейтральный
   борт + один гравированный знак строго по центру, вписан в контур с запасом — тот же
   SYM_R, что уже проверен по расстоянию до наклонной кромки в макете), 4 приёма
   иллюзии формы. ВРЕМЕННО БЕСПЛАТНЫ (game.js: premium:false, price:0) — владелец сам
   проверяет каждый на слабом устройстве, время отрисовки шлётся в диагностику отдельно
   (см. premSkinPerfTick ниже) — после анализа переводятся на ⭐ и настоящую цену.
   Единая точка входа — drawPremiumFx2(), общая для render.js:drawPlane и ui.js:angarShip
   (тот файл грузится позже), чтобы не дублировать 30 блоков дважды, как пришлось бы
   при повторении схемы первых шести. */
function clipShipBody(ctx){ ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.clip(); }
function edgeHalfWidth(y){ return Math.max(0,(y+22)/36*16); }

/* --- материалы: Золото/Серебро/Бронза — веерная сеть прямых прожилок из 4 узлов --- */
function genCracks(ox,oy,dirs,lenBase,segs){
  const branches=[];
  dirs.forEach((d,i)=>{
    const len=lenBase+((i*37)%4);
    const pts=[[ox,oy]];
    let x=ox,y=oy, dx=d[0],dy=d[1];
    for(let s=1;s<=segs;s++){
      const jitter=((i*13+s*7)%5-2)*0.5;
      x+=dx*(len/segs)+jitter*dy*0.3;
      y+=dy*(len/segs)+jitter*dx*0.3;
      pts.push([x,y]);
    }
    branches.push(pts);
    if(i%2===0){
      const forkFrom=pts[2];
      branches.push([forkFrom,[forkFrom[0]+d[1]*2.4, forkFrom[1]-d[0]*2.4]]);
    }
  });
  return branches;
}
const METAL_VEINS=[].concat(
  genCracks(0,-15,[[-0.5,-1],[0.5,-1],[-0.9,0.4],[0.9,0.4]],5,3),
  genCracks(-7,-2,[[-1,-0.3],[-0.6,1],[0.4,-0.9]],5,3),
  genCracks(7,-2,[[1,-0.3],[0.6,1],[-0.4,-0.9]],5,3),
  genCracks(0,7,[[-0.7,0.7],[0.7,0.7],[0,-1]],4.5,3)
);
function drawMetalVeins(ctx,col){
  METAL_VEINS.forEach(pts=>{
    metalStroke(ctx, c=>{ pts.forEach(([x,y],i)=>i===0?c.moveTo(x,y):c.lineTo(x,y)); }, .7, .4, col);
  });
}
function fxMatGold(ctx){ drawMetalVeins(ctx,'rgba(198,152,74,.7)'); }
function fxMatSilver(ctx){ drawMetalVeins(ctx,'rgba(140,155,175,.7)'); }
function fxMatBronze(ctx){ drawMetalVeins(ctx,'rgba(150,88,44,.7)'); }

/* --- материалы: огранка по всей площади (Лёд/Изумруд/Лава) --- */
function buildFacets(rows){
  const facets=[];
  for(let r=0;r<rows.length-1;r++){
    const y0=rows[r], y1=rows[r+1];
    const hw0=edgeHalfWidth(y0), hw1=edgeHalfWidth(y1);
    const n=r+2;
    for(let i=0;i<n;i++){
      const fx0=-hw0+(2*hw0*i/n), fx1=-hw0+(2*hw0*(i+1)/n);
      const gx=-hw1+(2*hw1*(i+0.5)/(n+1));
      facets.push([[fx0,y0],[fx1,y0],[gx,y1]]);
    }
  }
  return facets;
}
const ICE_FACETS=buildFacets([-22,-15,-8,-1,6,14]);
const GEM_FACETS=buildFacets([-22,-14,-6,2,10,14]);
function fxFacetSweep(ctx,nowMs,facets,cyc,fillBase,strokeCol,glowSq){
  ctx.save(); clipShipBody(ctx);
  const sweepY=-22+((nowMs%cyc)/cyc)*36;
  facets.forEach((pts,i)=>{
    const cy=(pts[0][1]+pts[2][1])/2;
    const shade=0.06+((i*13)%6)*0.025;
    ctx.fillStyle=fillBase+shade.toFixed(2)+')';
    ctx.beginPath(); pts.forEach(([x,y],j)=>j===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();
    metalStroke(ctx, c=>{ pts.forEach(([x,y],j)=>j===0?c.moveTo(x,y):c.lineTo(x,y)); c.closePath(); }, .3, .3, strokeCol);
    const glint=Math.max(0,1-Math.abs(cy-sweepY)/6);
    if(glint>0.05){
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.fillStyle='rgba(255,255,255,'+((glowSq?glint*glint:glint)*.85).toFixed(2)+')';
      ctx.beginPath(); pts.forEach(([x,y],j)=>j===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
  ctx.restore();
}
function fxMatIce(ctx,sk,nowMs){ fxFacetSweep(ctx,nowMs,ICE_FACETS,2600,'rgba(90,180,225,','rgba(255,255,255,.35)',false); }
function fxMatEmerald(ctx,sk,nowMs){ fxFacetSweep(ctx,nowMs,GEM_FACETS,2200,'rgba(60,210,130,','rgba(60,210,130,.5)',true); }

/* --- материал: Лава — та же огранка, что Изумруд, но в трещинах пульсирует магма --- */
function fxMatLava(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  const pulse=0.5+0.5*Math.sin(nowMs/900);
  GEM_FACETS.forEach((pts,i)=>{
    const shade=0.03+((i*11)%5)*0.02;
    ctx.fillStyle='rgba(60,45,38,'+shade.toFixed(2)+')';
    ctx.beginPath(); pts.forEach(([x,y],j)=>j===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,120,40,'+(0.35+0.25*pulse).toFixed(2)+')'; ctx.lineWidth=.4;
    ctx.beginPath(); pts.forEach(([x,y],j)=>j===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

/* --- материал: Обсидиан — одна точка удара, 8 прямых трещин строго через 45° --- */
const OBSIDIAN_ORIGIN=[0,-2], OBSIDIAN_R=42, OBSIDIAN_RAYS=8;
function fxMatObsidian(ctx){
  ctx.save(); clipShipBody(ctx);
  const [ox,oy]=OBSIDIAN_ORIGIN;
  for(let i=0;i<OBSIDIAN_RAYS;i++){
    const a0=(i/OBSIDIAN_RAYS)*6.2832, a1=((i+1)/OBSIDIAN_RAYS)*6.2832;
    ctx.fillStyle='rgba(10,8,16,'+(i%2===0?'.10':'.22')+')';
    ctx.beginPath(); ctx.moveTo(ox,oy); ctx.arc(ox,oy,OBSIDIAN_R,a0,a1); ctx.closePath(); ctx.fill();
  }
  for(let i=0;i<OBSIDIAN_RAYS;i++){
    const a=(i/OBSIDIAN_RAYS)*6.2832;
    metalStroke(ctx, c=>{ c.moveTo(ox,oy); c.lineTo(ox+Math.cos(a)*OBSIDIAN_R, oy+Math.sin(a)*OBSIDIAN_R); }, .8, .4, 'rgba(220,225,240,.55)');
  }
  for(let i=0;i<OBSIDIAN_RAYS;i+=2){
    const a=(i/OBSIDIAN_RAYS)*6.2832, b=((i+1)/OBSIDIAN_RAYS)*6.2832;
    const p1=[ox+Math.cos(a)*OBSIDIAN_R*0.6, oy+Math.sin(a)*OBSIDIAN_R*0.6];
    const p2=[ox+Math.cos(b)*OBSIDIAN_R*0.6, oy+Math.sin(b)*OBSIDIAN_R*0.6];
    metalStroke(ctx, c=>{ c.moveTo(p1[0],p1[1]); c.lineTo(p2[0],p2[1]); }, .6, .3, 'rgba(220,225,240,.4)');
  }
  ctx.restore();
}

/* --- материал: Мрамор v2 — одна точка на осевой линии, прямые лучи строго через
   равный угол (05.09.2026: первая попытка с раскиданными узлами читалась как «кривая»,
   хотя технически была прямыми линиями — исправлено на формулу Обсидиана, см.
   feedback_macet_geometry_pitfalls в памяти, пункт 6). --- */
function fxMatMarble(ctx){
  ctx.save(); clipShipBody(ctx);
  const ox=0, oy=-3, n=10;
  for(let i=0;i<n;i++){
    const ang=i*(Math.PI*2/n);
    const len=i%2===0?30:20;
    const x2=ox+Math.cos(ang)*len, y2=oy+Math.sin(ang)*len;
    metalStroke(ctx, c=>{ c.moveTo(ox,oy); c.lineTo(x2,y2); }, .5, .34, 'rgba(115,112,120,.34)');
    metalStroke(ctx, c=>{ c.moveTo(ox+.14,oy-.14); c.lineTo(x2+.14,y2-.14); }, .18, .18, 'rgba(255,255,255,.45)');
  }
  ctx.fillStyle='rgba(140,138,148,.4)';
  ctx.beginPath(); ctx.arc(ox,oy,.4,0,6.283); ctx.fill();
  ctx.restore();
}

/* --- материал: Туманность/галактика — цветные облака + звёздная пыль, без единой линии --- */
const NEB_STARS=(()=>{ const s=[]; for(let i=0;i<60;i++){ const x=((i*37)%32)-16, y=((i*53)%36)-22; s.push({x,y,ph:(i*17)%100/100}); } return s; })();
const NEB_CLOUDS=[ [-6,-8,10,'110,80,220'], [6,4,11,'40,150,190'], [-2,10,9,'200,70,140'], [3,-14,8,'90,60,180'] ];
function fxMatNebula(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  NEB_CLOUDS.forEach(([x,y,r,rgb])=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba('+rgb+',.55)'); g.addColorStop(1,'rgba('+rgb+',0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();
  });
  NEB_STARS.forEach(s=>{
    const tw=0.4+0.6*Math.max(0,Math.sin(nowMs/900+s.ph*6.283));
    ctx.fillStyle='rgba(255,255,255,'+(tw*.85).toFixed(2)+')';
    ctx.beginPath(); ctx.arc(s.x,s.y,.35+.2*tw,0,6.283); ctx.fill();
  });
  ctx.restore();
}

/* --- материал: Опал — бегущая радужная полоса на молочном фоне, без линий --- */
function fxMatOpal(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  const bandY=-22+((nowMs%3200)/3200)*44;
  for(let i=0;i<3;i++){
    const y=bandY-14+i*14;
    const hue=((nowMs/12)+i*70)%360;
    const g=ctx.createLinearGradient(0,y-6,0,y+6);
    g.addColorStop(0,'hsla('+hue+',75%,72%,0)');
    g.addColorStop(.5,'hsla('+hue+',75%,72%,.4)');
    g.addColorStop(1,'hsla('+hue+',75%,72%,0)');
    ctx.fillStyle=g; ctx.fillRect(-20,y-8,40,16);
  }
  ctx.restore();
}

/* --- материал: Окисленная медь — пятна патины, не линии --- */
const PATINA=(()=>{ const p=[]; for(let i=0;i<9;i++){ const x=((i*29)%26)-13, y=((i*41)%34)-20; p.push({x,y,r:2.4+((i*13)%4)}); } return p; })();
function fxMatVerdigris(ctx){
  ctx.save(); clipShipBody(ctx);
  PATINA.forEach(p=>{
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
    g.addColorStop(0,'rgba(80,160,130,.55)'); g.addColorStop(.7,'rgba(80,160,130,.3)'); g.addColorStop(1,'rgba(80,160,130,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill();
  });
  ctx.restore();
}

/* --- материал: Ржавое железо — пятна + питтинг + прямые потёки вниз --- */
const RUST_SPOTS=(()=>{ const p=[]; for(let i=0;i<11;i++){ const x=((i*31)%28)-14, y=((i*47)%36)-20; p.push({x,y,r:1.8+((i*17)%5)}); } return p; })();
const RUST_PITS=(()=>{ const p=[]; for(let i=0;i<26;i++){ const x=((i*13)%30)-15, y=((i*23)%36)-20; p.push({x,y}); } return p; })();
const RUST_STREAKS=[[-4,-14,10],[6,-8,16],[-9,2,8],[2,-2,20]];
function fxMatRust(ctx){
  ctx.save(); clipShipBody(ctx);
  RUST_SPOTS.forEach(p=>{
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
    g.addColorStop(0,'rgba(150,70,30,.6)'); g.addColorStop(.7,'rgba(120,55,25,.35)'); g.addColorStop(1,'rgba(120,55,25,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fill();
  });
  RUST_STREAKS.forEach(([x,y0,len])=>{
    const g=ctx.createLinearGradient(x,y0,x,y0+len);
    g.addColorStop(0,'rgba(90,45,20,.5)'); g.addColorStop(1,'rgba(90,45,20,0)');
    ctx.fillStyle=g; ctx.fillRect(x-.6,y0,1.2,len);
  });
  ctx.fillStyle='rgba(60,32,16,.55)';
  RUST_PITS.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,.35,0,6.283); ctx.fill(); });
  ctx.restore();
}

/* --- материал: Карбон — частое плетение + бегущий блик --- */
function fxMatCarbon(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  for(let k=-40;k<=40;k+=2.2){
    ctx.strokeStyle='rgba(70,75,85,.5)'; ctx.lineWidth=.35;
    ctx.beginPath(); ctx.moveTo(-24+k,-24); ctx.lineTo(24+k,24); ctx.stroke();
  }
  for(let k=-40;k<=40;k+=2.2){
    ctx.strokeStyle='rgba(45,48,55,.5)'; ctx.lineWidth=.35;
    ctx.beginPath(); ctx.moveTo(-24+k,24); ctx.lineTo(24+k,-24); ctx.stroke();
  }
  const sx=-30+((nowMs*0.06)%60);
  const g=ctx.createLinearGradient(sx-6,0,sx+6,0);
  g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.5,'rgba(255,255,255,.22)'); g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g; ctx.fillRect(sx-6,-24,12,48);
  ctx.restore();
}

/* --- материал: Соты/янтарь — гексагональная сетка на весь борт --- */
const HONEY_CELLS=(()=>{
  const cells=[]; const r=2.6; const w=r*Math.sqrt(3);
  for(let row=-9;row<=6;row++){
    const cy=row*r*1.5; const off=(row%2===0)?0:w/2;
    for(let col=-6;col<=6;col++) cells.push([col*w+off,cy]);
  }
  return cells;
})();
function hexPath(ctx,cx,cy,r){
  for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; const x=cx+r*Math.cos(a), y=cy+r*Math.sin(a); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
  ctx.closePath();
}
function fxMatHoney(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  HONEY_CELLS.forEach(([cx,cy],i)=>{
    const shade=0.5+0.25*Math.sin((i*1.7)+0.3);
    ctx.fillStyle='rgba(214,150,50,'+shade.toFixed(2)+')';
    ctx.beginPath(); hexPath(ctx,cx,cy,2.55); ctx.fill();
    ctx.strokeStyle='rgba(90,55,15,.7)'; ctx.lineWidth=.22;
    ctx.beginPath(); hexPath(ctx,cx,cy,2.55); ctx.stroke();
  });
  const glow=0.15+0.1*Math.sin(nowMs/1100);
  ctx.fillStyle='rgba(255,220,140,'+glow.toFixed(2)+')';
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* --- материал: Плазма — широкие текущие полосы света на тёмном ядре --- */
const PLASMA_BANDS=[ {sp:0.00,w:9,hue:280,sc:0.05}, {sp:0.33,w:7,hue:200,sc:0.07}, {sp:0.66,w:8,hue:320,sc:0.045} ];
function fxMatPlasma(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  PLASMA_BANDS.forEach(b=>{
    const cyc=((nowMs*b.sc/1000)+b.sp)%1;
    const y=-26+cyc*52;
    const g=ctx.createLinearGradient(0,y-b.w,0,y+b.w);
    g.addColorStop(0,'hsla('+b.hue+',85%,60%,0)');
    g.addColorStop(.5,'hsla('+b.hue+',85%,60%,.42)');
    g.addColorStop(1,'hsla('+b.hue+',85%,60%,0)');
    ctx.fillStyle=g; ctx.fillRect(-20,y-b.w,40,b.w*2);
  });
  ctx.restore();
}

/* --- материал: Кварц — огранка ромбами, другая решётка, чем у Льда/Изумруда --- */
const QUARTZ_CELLS=(()=>{
  const cells=[]; const s=4.2;
  for(let row=-8;row<=6;row++) for(let col=-6;col<=6;col++) cells.push([col*s+(row%2?s/2:0), row*s*0.72, s*0.72]);
  return cells;
})();
function rhombPath(ctx,cx,cy,s){ ctx.moveTo(cx,cy-s); ctx.lineTo(cx+s*0.72,cy); ctx.lineTo(cx,cy+s); ctx.lineTo(cx-s*0.72,cy); ctx.closePath(); }
function fxMatQuartz(ctx,sk,nowMs){
  ctx.save(); clipShipBody(ctx);
  QUARTZ_CELLS.forEach(([cx,cy,s],i)=>{
    const shade=0.08+((i*37)%9)*0.02;
    ctx.fillStyle='rgba(200,150,175,'+shade.toFixed(2)+')';
    ctx.beginPath(); rhombPath(ctx,cx,cy,s); ctx.fill();
    ctx.strokeStyle='rgba(150,100,130,.4)'; ctx.lineWidth=.22;
    ctx.beginPath(); rhombPath(ctx,cx,cy,s); ctx.stroke();
  });
  const sp=(nowMs/900)%(Math.PI*2);
  [0.25,0.6].forEach((f,i)=>{
    const yy=-22+f*36+2*Math.sin(sp+i*2);
    const g=ctx.createLinearGradient(-16,yy,16,yy);
    g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.5,'rgba(255,255,255,.5)'); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.fillRect(-16,yy-.6,32,1.2);
  });
  ctx.restore();
}

/* --- материал: Дерево — прямые слои волокна + два сучка-кольца --- */
const WOOD_GRAIN=(()=>{ const l=[]; for(let i=0;i<15;i++) l.push(-16+i*2.3+(i%3)*0.4); return l; })();
function fxMatWood(ctx){
  ctx.save(); clipShipBody(ctx);
  WOOD_GRAIN.forEach((x,i)=>{
    ctx.strokeStyle='rgba(110,65,25,'+(0.25+((i*7)%4)*0.08).toFixed(2)+')';
    ctx.lineWidth=.45+((i*3)%3)*0.15;
    ctx.beginPath(); ctx.moveTo(x,-24); ctx.lineTo(x,24); ctx.stroke();
  });
  [[-4,-6,2.6],[5,7,1.9]].forEach(([x,y,r])=>{
    for(let k=3;k>=1;k--){
      ctx.strokeStyle='rgba(90,50,18,'+(0.55/k).toFixed(2)+')'; ctx.lineWidth=.35;
      ctx.beginPath(); ctx.ellipse(x,y,r*k/3*1.4,r*k/3,0,0,6.283); ctx.stroke();
    }
  });
  const g=ctx.createLinearGradient(-16,-22,16,22);
  g.addColorStop(0,'rgba(255,220,170,.1)'); g.addColorStop(.5,'rgba(255,220,170,0)'); g.addColorStop(1,'rgba(60,30,10,.15)');
  ctx.fillStyle=g; ctx.fillRect(-20,-24,40,48);
  ctx.restore();
}

/* --- символы-сигилы: 9 штук, общий центр/радиус, вписаны в контур с запасом
   (расстояние до наклонной кромки 9x+4y+88=0 от (0,-3) ≈7.72, взят SYM_R=7.3) --- */
const SYM_CX=0, SYM_CY=-3, SYM_R=7.3;
function sigGlow(ctx,a){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')'; }
const PENTA_PTS=(()=>{ const pts=[]; for(let k=0;k<10;k++){ const ang=-Math.PI/2+k*(Math.PI/5); const r=k%2===0?SYM_R:SYM_R*0.382; pts.push([SYM_CX+Math.cos(ang)*r, SYM_CY+Math.sin(ang)*r]); } return pts; })();
function fxSigPenta(ctx,sk,nowMs){
  const glow=0.5+0.5*Math.sin(nowMs/1200);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R,0,6.283); }, .5, .35);
  metalStroke(ctx, c=>{ PENTA_PTS.forEach(([x,y],i)=>i===0?c.moveTo(x,y):c.lineTo(x,y)); c.closePath(); }, .85, .5);
  sigGlow(ctx,0.12+0.06*glow);
  ctx.beginPath(); PENTA_PTS.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function triPts(cx,cy,r,rot){ const pts=[]; for(let k=0;k<3;k++){ const ang=rot+k*(Math.PI*2/3); pts.push([cx+Math.cos(ang)*r, cy+Math.sin(ang)*r]); } return pts; }
function fxSigHexa(ctx,sk,nowMs){
  const glow=0.5+0.5*Math.sin(nowMs/1200);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R,0,6.283); }, .5, .35);
  const tri1=triPts(SYM_CX,SYM_CY,SYM_R,-Math.PI/2), tri2=triPts(SYM_CX,SYM_CY,SYM_R,Math.PI/2);
  [tri1,tri2].forEach(tri=>metalStroke(ctx, c=>{ tri.forEach(([x,y],i)=>i===0?c.moveTo(x,y):c.lineTo(x,y)); c.closePath(); }, .85, .5));
  sigGlow(ctx,0.1+0.06*glow);
  [tri1,tri2].forEach(tri=>{ ctx.beginPath(); tri.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill(); });
  ctx.restore();
}
function fxSigMandala(ctx,sk,nowMs){
  const petals=8, glow=0.5+0.5*Math.sin(nowMs/1000);
  for(let i=0;i<petals;i++){
    const ang=i*(6.2832/petals);
    ctx.save(); ctx.translate(SYM_CX,SYM_CY); ctx.rotate(ang);
    metalStroke(ctx, c=>{ c.moveTo(0,0); c.quadraticCurveTo(SYM_R*.3,-SYM_R*.35,0,-SYM_R*.92); c.quadraticCurveTo(-SYM_R*.3,-SYM_R*.35,0,0); }, .8, .4);
    ctx.restore();
  }
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R*.22,0,6.283); }, .9, .45);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R*1.02,0,6.283); }, .4, .3);
  sigGlow(ctx,0.4+0.3*glow);
  ctx.beginPath(); ctx.arc(SYM_CX,SYM_CY,SYM_R*.13,0,6.283); ctx.fill();
  ctx.restore();
}
function fxSigTriquetra(ctx,sk,nowMs){
  const glow=0.5+0.5*Math.sin(nowMs/1200), R=SYM_R*0.85;
  for(let i=0;i<3;i++){
    const ang=-Math.PI/2+i*(Math.PI*2/3);
    const lx=SYM_CX+Math.cos(ang)*R*0.58, ly=SYM_CY+Math.sin(ang)*R*0.58;
    ctx.save(); ctx.translate(lx,ly); ctx.rotate(ang+Math.PI/2);
    metalStroke(ctx, c=>{ c.moveTo(0,-R*0.62); c.quadraticCurveTo(R*0.62,-R*0.1,0,R*0.62); c.quadraticCurveTo(-R*0.62,-R*0.1,0,-R*0.62); }, .85, .5);
    ctx.restore();
  }
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,R*0.62,0,6.283); }, .35, .3);
  sigGlow(ctx,0.15+0.08*glow);
  for(let i=0;i<3;i++){
    const ang=-Math.PI/2+i*(Math.PI*2/3);
    const lx=SYM_CX+Math.cos(ang)*R*0.58, ly=SYM_CY+Math.sin(ang)*R*0.58;
    ctx.save(); ctx.translate(lx,ly); ctx.rotate(ang+Math.PI/2);
    ctx.beginPath(); ctx.moveTo(0,-R*0.62); ctx.quadraticCurveTo(R*0.62,-R*0.1,0,R*0.62); ctx.quadraticCurveTo(-R*0.62,-R*0.1,0,-R*0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function fxSigCompass(ctx,sk,nowMs){
  const glow=0.5+0.5*Math.sin(nowMs/1200);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R*0.3,0,6.283); }, .5, .3);
  for(let i=0;i<8;i++){
    const ang=-Math.PI/2+i*(Math.PI/4);
    const len=i%2===0?SYM_R:SYM_R*0.5, w=i%2===0?.5:.35;
    metalStroke(ctx, c=>{ c.moveTo(SYM_CX,SYM_CY); c.lineTo(SYM_CX+Math.cos(ang)*len, SYM_CY+Math.sin(ang)*len); }, .85, w);
  }
  sigGlow(ctx,0.3+0.25*glow);
  ctx.beginPath(); ctx.arc(SYM_CX,SYM_CY,SYM_R*0.14,0,6.283); ctx.fill();
  ctx.restore();
}
function fxSigYinyang(ctx){
  const R=SYM_R*0.9;
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,R,0,6.283); }, .5, .35);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY-R/2,R/2,Math.PI*0.5,Math.PI*1.5,true); c.arc(SYM_CX,SYM_CY+R/2,R/2,Math.PI*1.5,Math.PI*0.5,true); }, .85, .45);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY-R/2,R*0.15,0,6.283); }, .85, .35);
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY+R/2,R*0.15,0,6.283); }, .85, .35);
  ctx.save(); ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=METAL+'.14)';
  ctx.beginPath();
  ctx.arc(SYM_CX,SYM_CY,R,-Math.PI/2,Math.PI/2);
  ctx.arc(SYM_CX,SYM_CY+R/2,R/2,Math.PI/2,-Math.PI/2,true);
  ctx.arc(SYM_CX,SYM_CY-R/2,R/2,Math.PI/2,-Math.PI/2,false);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function fxSigFlower(ctx){
  const r=SYM_R*0.42;
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,r,0,6.283); }, .7, .35);
  for(let i=0;i<6;i++){
    const ang=i*(Math.PI/3), cx=SYM_CX+Math.cos(ang)*r, cy=SYM_CY+Math.sin(ang)*r;
    metalStroke(ctx, c=>{ c.arc(cx,cy,r,0,6.283); }, .6, .32);
  }
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,r*2,0,6.283); }, .35, .3);
}
function malteseArm(ctx,r0,r1,halfw){
  ctx.moveTo(-halfw,r0); ctx.quadraticCurveTo(0,r0+(r1-r0)*0.35,halfw,r0);
  ctx.lineTo(halfw*1.6,r1); ctx.quadraticCurveTo(0,r1-(r1-r0)*0.15,-halfw*1.6,r1); ctx.closePath();
}
function fxSigMaltese(ctx){
  const r0=SYM_R*0.22, r1=SYM_R*0.95;
  for(let i=0;i<4;i++){
    const ang=i*(Math.PI/2);
    ctx.save(); ctx.translate(SYM_CX,SYM_CY); ctx.rotate(ang);
    ctx.fillStyle=METAL+'.14)';
    ctx.beginPath(); malteseArm(ctx,r0,r1,SYM_R*0.26); ctx.fill();
    metalStroke(ctx, c=>malteseArm(c,r0,r1,SYM_R*0.26), .85, .4);
    ctx.restore();
  }
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,r0*0.9,0,6.283); }, .6, .3);
}
function fxSigSnowflake(ctx){
  for(let i=0;i<6;i++){
    const ang=i*(Math.PI/3)-Math.PI/2;
    ctx.save(); ctx.translate(SYM_CX,SYM_CY); ctx.rotate(ang);
    metalStroke(ctx, c=>{ c.moveTo(0,0); c.lineTo(0,-SYM_R); }, .85, .45);
    [0.42,0.62,0.82].forEach(f=>{
      const y=-SYM_R*f, bw=SYM_R*(0.34-f*0.18);
      metalStroke(ctx, c=>{ c.moveTo(0,y); c.lineTo(bw,y-bw*0.55); }, .7, .32);
      metalStroke(ctx, c=>{ c.moveTo(0,y); c.lineTo(-bw,y-bw*0.55); }, .7, .32);
    });
    ctx.restore();
  }
  metalStroke(ctx, c=>{ c.arc(SYM_CX,SYM_CY,SYM_R*0.12,0,6.283); }, .9, .35);
}

/* --- иллюзия формы: Кожаная стёжка / Топография / Оригами / Плетёная решётка --- */
const QUILT_NODES=(()=>{ const nodes=[]; for(let row=-18;row<=12;row+=8){ for(let col=-16;col<=16;col+=8){ const off=((Math.round((row+18)/8))%2)*4; nodes.push([col+off,row]); } } return nodes; })();
function fxIllLeather(ctx){
  ctx.save(); clipShipBody(ctx);
  QUILT_NODES.forEach(([x,y])=>{ metalStroke(ctx, c=>{ c.moveTo(x-8,y); c.lineTo(x,y-8); c.lineTo(x+8,y); c.lineTo(x,y+8); c.closePath(); }, .35, .3); });
  QUILT_NODES.forEach(([x,y])=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,1.6);
    g.addColorStop(0,'rgba(255,255,255,.35)'); g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,1.6,0,6.283); ctx.fill();
    metalStroke(ctx, c=>{ c.arc(x,y,.6,0,6.283); }, .8, .3);
  });
  ctx.restore();
}
function blobPath(ctx,cx,cy,scale){
  const pts=[[0,-9],[7,-5],[8,3],[2,9],[-6,6],[-9,-2],[-4,-8]];
  ctx.moveTo(cx+pts[0][0]*scale, cy+pts[0][1]*scale);
  for(let i=1;i<pts.length;i++){
    const [px,py]=pts[i], [qx,qy]=pts[(i+1)%pts.length];
    ctx.quadraticCurveTo(cx+px*scale, cy+py*scale, cx+((px+qx)/2)*scale, cy+((py+qy)/2)*scale);
  }
  ctx.closePath();
}
const TOPO_LEVELS=[1.7,1.4,1.1,.8,.5,.25];
function fxIllTopo(ctx){
  ctx.save(); clipShipBody(ctx);
  TOPO_LEVELS.forEach(s=>metalStroke(ctx, c=>blobPath(c,0,-2,s), .55, .35));
  ctx.restore();
}
const ORIGAMI_TRIS=(()=>{
  const tris=[]; const rows=[-22,-14,-6,2,10,14];
  for(let r=0;r<rows.length-1;r++){
    const y0=rows[r], y1=rows[r+1], hw0=edgeHalfWidth(y0), hw1=edgeHalfWidth(y1), n=r+2;
    for(let i=0;i<n;i++){
      const fx0=-hw0+(2*hw0*i/n), fx1=-hw0+(2*hw0*(i+1)/n);
      const gx0=-hw1+(2*hw1*i/(n+1)), gx1=-hw1+(2*hw1*(i+1)/(n+1));
      tris.push({pts:[[fx0,y0],[fx1,y0],[(gx0+gx1)/2,y1]], shade:(i%2===0)?'.10':'.22'});
    }
  }
  return tris;
})();
function fxIllOrigami(ctx,sk){
  ctx.save(); clipShipBody(ctx);
  ORIGAMI_TRIS.forEach(tri=>{
    ctx.fillStyle=sk.trail+tri.shade+')';
    ctx.beginPath(); tri.pts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.closePath(); ctx.fill();
    metalStroke(ctx, c=>{ tri.pts.forEach(([x,y],i)=>i===0?c.moveTo(x,y):c.lineTo(x,y)); c.closePath(); }, .35, .25);
  });
  ctx.restore();
}
function fxIllLattice(ctx){
  ctx.save(); clipShipBody(ctx);
  for(let k=-40;k<=40;k+=5){ const bold=(Math.round((k+40)/5))%2===0; metalStroke(ctx, c=>{ c.moveTo(-24+k,-24); c.lineTo(24+k,24); }, bold?.65:.35, bold?.7:.4); }
  for(let k=-40;k<=40;k+=5){ const bold=(Math.round((k+40)/5))%2===1; metalStroke(ctx, c=>{ c.moveTo(-24+k,24); c.lineTo(24+k,-24); }, bold?.65:.35, bold?.7:.4); }
  ctx.restore();
}

/* 05.09.2026 «Из макета в игру» — 4 новых материала. Координаты Пенроуза — тот же кусок,
   что уже проверен скриптом (одна длина стороны, 2 угла) в макете, просто уменьшен под
   размер корпуса (S=0.5) вместо холста 100×100. */
function fxPatCircles(ctx, sk){ // Плед из кругов
  ctx.save(); clipShipBody(ctx);
  [[-8,-8],[8,-8],[-8,6],[8,6],[0,-16]].forEach(([x,y],i)=>{
    ctx.fillStyle=sk.trail+(i%2===0?'.18)':'.3)');
    ctx.beginPath(); ctx.arc(x,y,8,0,6.2832); ctx.fill();
  });
  ctx.restore();
}
function fxPatLattice2(ctx, sk){ // Цветочная решётка
  ctx.save(); clipShipBody(ctx);
  [-16,-4,8].forEach(x=>{ [-14,0,10].forEach(y=>{
    metalStroke(ctx, c=>{ c.moveTo(x-6,y); c.quadraticCurveTo(x,y-8,x+6,y); c.quadraticCurveTo(x,y+8,x-6,y); }, .4, .35, sk.trail+'.5)');
  }); });
  ctx.restore();
}
const PAT_PENROSE=[{type:'thin',pts:[[-16.23,0],[-10.03,0],[-8.12,5.9],[-14.32,5.9]]},{type:'thin',pts:[[-3.1,-21.33],[3.1,-21.33],[5.02,-15.44],[-1.18,-15.44]]},{type:'thick',pts:[[-14.32,5.9],[-8.12,5.9],[-13.13,9.54],[-19.33,9.54]]},{type:'thick',pts:[[1.92,5.9],[8.12,5.9],[3.1,9.54],[-3.1,9.54]]},{type:'thin',pts:[[-3.1,2.25],[3.1,2.25],[5.02,-3.64],[-1.18,-3.64]]},{type:'thick',pts:[[-5.02,-3.64],[-3.1,2.25],[-1.18,-3.64],[-3.1,-9.54]]}];
function fxPatPenrose(ctx, sk){ // Пенроуз — компактный кусок уже проверенной мозаики (де Брёйн), масштаб 0.5 под корпус
  ctx.save(); clipShipBody(ctx);
  PAT_PENROSE.forEach(r=>{
    ctx.fillStyle=sk.trail+(r.type==='thick'?'.4)':'.2)');
    ctx.beginPath(); r.pts.forEach(([x,y],i)=>{ const xx=x*.5, yy=y*.5-4; if(i===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); }); ctx.closePath(); ctx.fill();
    metalStroke(ctx, c=>{ r.pts.forEach(([x,y],i)=>{ const xx=x*.5, yy=y*.5-4; if(i===0)c.moveTo(xx,yy); else c.lineTo(xx,yy); }); c.closePath(); }, .2, .2);
  });
  ctx.restore();
}
function fxIllCrystal(ctx){ // Кристалл — гранёный корпус, тот же приём, что «Кристалл-огранка» во Вспышке
  ctx.save(); clipShipBody(ctx);
  metalStroke(ctx, c=>{ c.moveTo(0,-20); c.lineTo(10,-8); c.lineTo(10,6); c.lineTo(0,16); c.lineTo(-10,6); c.lineTo(-10,-8); c.closePath(); }, .6, .5);
  metalStroke(ctx, c=>{ c.moveTo(-10,-8); c.lineTo(10,-8); }, .3, .3);
  metalStroke(ctx, c=>{ c.moveTo(-10,6); c.lineTo(10,6); }, .3, .3);
  metalStroke(ctx, c=>{ c.moveTo(0,-20); c.lineTo(0,16); }, .25, .25);
  ctx.restore();
}
const PREM_FX_MAP={
  matGold:fxMatGold, matSilver:fxMatSilver, matBronze:fxMatBronze, matIce:fxMatIce, matEmerald:fxMatEmerald,
  matObsidian:fxMatObsidian, matMarble:fxMatMarble, matNebula:fxMatNebula, matOpal:fxMatOpal, matVerdigris:fxMatVerdigris,
  matCarbon:fxMatCarbon, matLava:fxMatLava, matRust:fxMatRust, matHoney:fxMatHoney, matPlasma:fxMatPlasma,
  matQuartz:fxMatQuartz, matWood:fxMatWood,
  sigPenta:fxSigPenta, sigHexa:fxSigHexa, sigMandala:fxSigMandala, sigTriquetra:fxSigTriquetra, sigCompass:fxSigCompass,
  sigYinyang:fxSigYinyang, sigFlower:fxSigFlower, sigMaltese:fxSigMaltese, sigSnowflake:fxSigSnowflake,
  illLeather:fxIllLeather, illTopo:fxIllTopo, illOrigami:fxIllOrigami, illLattice:fxIllLattice,
  patPenrose:fxPatPenrose, patLattice2:fxPatLattice2, patCircles:fxPatCircles, illCrystal:fxIllCrystal,
};
/* время выполнения — в диагностику, отдельно от frameProfile.fx выше (та величина
   мерит другой, более ранний слой — фон/поле, не отрисовку скина). Копится в буфер,
   один сигнал на весь полёт (при посадке), не каждый кадр — не спамить BEACON. */
let premFxAccum=0, premFxN=0, premFxKey=null;
function drawPremiumFx2(ctx, sk, fx, nowMs){
  const fn=PREM_FX_MAP[fx]; if(!fn) return;
  const t0=performance.now();
  fn(ctx, sk, nowMs);
  const dt=performance.now()-t0;
  if(premFxKey!==fx){ premFxAccum=0; premFxN=0; premFxKey=fx; }
  premFxAccum+=dt; premFxN++;
}
function premSkinPerfReport(){ // вызывается один раз при посадке/окончании забега (game.js)
  if(premFxN<10 || !premFxKey) return;
  try{ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('skin_perf', premFxKey+':'+(premFxAccum/premFxN).toFixed(3)+'ms:'+premFxN+'n:Q'+Q.level); }catch(_){}
  premFxAccum=0; premFxN=0; premFxKey=null;
}

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
  const fxNow = performance.now(); // 04.09.2026: для дрейфа Обломков-спутников ниже
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
    /* 04.09.2026 «Эксклюзивные скины за Stars»: 6 языков следа/частиц, каждый под свой
       премиум-скин (game.js:SKINS trailFx). Отобраны живьём через макет — тот же приём,
       что fx корпуса выше по файлу. Лента/Нить-жемчуг сюда не входят — им нужна связная
       линия между кадрами, не независимая частица, см. drawStructuredTrail() ниже. */
    if(hq && p.trailFx==='sparks'){ // Искры: мелкие частицы, редкая яркая вспышка на миг
      const flash = p.flashAt!=null && Math.abs((1-p.life)-p.flashAt)<0.08;
      ctx.fillStyle = flash ? 'rgba(255,255,255,'+clamp(p.life,0,1).toFixed(2)+')' : partCol(p.color, p.life*.8);
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*(flash?1.6:1),0,6.283); ctx.fill();
      drawn++; continue;
    }
    if(hq && p.trailFx==='cometdust'){ // Кометная пыль: вытянутые кувыркающиеся обломки
      const rot=(p.rot||0)+(1-p.life)*(p.spin||0)*8;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(rot);
      ctx.fillStyle = partCol(p.color, p.life*.85);
      const l=p.size*1.6;
      ctx.beginPath(); ctx.moveTo(-l,0); ctx.lineTo(l*.3,-l*.35); ctx.lineTo(l,0); ctx.lineTo(l*.3,l*.35); ctx.closePath(); ctx.fill();
      ctx.restore();
      drawn++; continue;
    }
    if(hq && p.trailFx==='debris'){ // Обломки-спутники: рыхлый дрейфующий рой, не строгая линия
      const dx=Math.sin(fxNow/500+(p.jx||0))*2, dy=Math.cos(fxNow/450+(p.jy||0))*2;
      ctx.fillStyle = partCol(p.color, p.life*.75);
      ctx.beginPath(); ctx.arc(p.x+dx,p.y+dy,p.size*.8,0,6.283); ctx.fill();
      drawn++; continue;
    }
    if(p.trailFx==='waypoints'){ // Метки пути: редкая гаснущая веха-крестик, не квадрат
      ctx.strokeStyle = partCol(p.color, p.life*.75); ctx.lineWidth=.9;
      ctx.beginPath();
      ctx.moveTo(p.x-p.size,p.y); ctx.lineTo(p.x+p.size,p.y);
      ctx.moveTo(p.x,p.y-p.size); ctx.lineTo(p.x,p.y+p.size);
      ctx.stroke();
      drawn++; continue;
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

  /* 04.09.2026 (владелец, явное разрешение трогать ядро): вспышка рисовалась ПОСЛЕ самолёта —
     ложилась поверх борта, а должна быть под ним (как подсветка/подложка старта, не поверх
     корпуса). Порядок был такой с 29.08.2026, никто не замечал на скорости настоящего полёта —
     нашли на спокойном превью Тюнинга, но правка касается обоих мест (см. тот же порядок в
     angarShip(), js/ui.js). */
  drawLaunchFlash(); // первые 0.45с забега — если куплена и надета
  drawPlane(sh,nowMs);
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

/* 04.09.2026 «Эксклюзивные скины за Stars»: связные следы (Лента→Ядро, Нить-жемчуг→Грани) —
   им нужна ИСТОРИЯ позиций корабля, не независимая частица из общего пула (particles),
   тот же приём, что уже есть у echoBuf ниже, только рисуем не копии корабля, а линию/цепочку. */
const trailHistBuf=[];
function trailHistReset(){ trailHistBuf.length=0; }
function drawStructuredTrail(trailStyle,trailColor,nowMs){
  // 05.09.2026: раньше принимала skin и читала skin.trailFx/skin.trail — след теперь
  // независимый выбор (TRAILS, game.js), цвет по-прежнему берётся от надетого скина.
  const n=trailHistBuf.length;
  if(n<2) return;
  if(trailStyle==='ribbon'){ // Лента: сплошная лента переменной ширины, тает с возрастом
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=1;i<n;i++){
      const a0=trailHistBuf[i-1], a1=trailHistBuf[i];
      const age=i/n; // 0 у хвоста → 1 у самолётика
      ctx.strokeStyle=trailColor+(age*.55).toFixed(2)+')';
      ctx.lineWidth=Math.max(.5, 6*age);
      ctx.beginPath(); ctx.moveTo(a0.x,a0.y); ctx.lineTo(a1.x,a1.y); ctx.stroke();
    }
    ctx.restore();
  } else if(trailStyle==='pearls'){ // Нить-жемчуг: связная цепочка бусин постоянной длины
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=trailColor+'.3)'; ctx.lineWidth=.6;
    ctx.beginPath();
    for(let i=0;i<n;i++){ const p=trailHistBuf[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
    ctx.stroke();
    for(let i=0;i<n;i+=3){ // не каждая позиция — иначе бусины сольются в кашу
      const p=trailHistBuf[i], age=i/n;
      ctx.fillStyle=trailColor+(age*.85).toFixed(2)+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,1.4*age+.3,0,6.283); ctx.fill();
    }
    ctx.restore();
  } else if(trailStyle==='loopKnot'){ // Узел-петля: лента, ширина пульсирует волной — читается как затянутый бант
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=1;i<n;i++){
      const a0=trailHistBuf[i-1], a1=trailHistBuf[i], age=i/n;
      ctx.strokeStyle=trailColor+(age*.55).toFixed(2)+')';
      ctx.lineWidth=Math.max(.5, (2+4*Math.abs(Math.sin(i*.35)))*age);
      ctx.beginPath(); ctx.moveTo(a0.x,a0.y); ctx.lineTo(a1.x,a1.y); ctx.stroke();
    }
    ctx.restore();
  } else if(trailStyle==='snakeWave'){ // Волна-змейка: путь колышется перпендикулярно направлению полёта
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    ctx.strokeStyle=trailColor+'.5)'; ctx.lineWidth=2.2;
    ctx.beginPath();
    for(let i=0;i<n;i++){
      const p=trailHistBuf[i];
      const nx = i>0? -(trailHistBuf[i].y-trailHistBuf[i-1].y) : 0, ny = i>0? (trailHistBuf[i].x-trailHistBuf[i-1].x) : 0;
      const nl=Math.hypot(nx,ny)||1, off=Math.sin(i*.4)*4;
      const x=p.x+(nx/nl)*off, y=p.y+(ny/nl)*off;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke(); ctx.restore();
  } else if(trailStyle==='heartKnot'){ // Сердце-узел: жемчужная нить, но тёплым цветом и с мягкими бусинами-сердечками
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=trailColor+'.4)'; ctx.lineWidth=.7;
    ctx.beginPath();
    for(let i=0;i<n;i++){ const p=trailHistBuf[i]; if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
    ctx.stroke();
    for(let i=0;i<n;i+=4){
      const p=trailHistBuf[i], age=i/n, r=1.6*age+.4;
      ctx.fillStyle=trailColor+(age*.9).toFixed(2)+')';
      ctx.beginPath();
      ctx.moveTo(p.x,p.y+r*.6);
      ctx.arc(p.x-r*.5,p.y,r*.5,Math.PI*.9,Math.PI*2.4);
      ctx.arc(p.x+r*.5,p.y,r*.5,Math.PI*1.6,Math.PI*3.1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  } else if(trailStyle==='trailConstellation'){ // Созвездие-след: редкие точки, соединённые тонкими линиями — растущее созвездие позади борта
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=trailColor+'.35)'; ctx.lineWidth=.5;
    let prev=null;
    for(let i=0;i<n;i+=Math.max(1,Math.floor(n/9))){
      const p=trailHistBuf[i];
      if(prev){ ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(p.x,p.y); ctx.stroke(); }
      const age=i/n;
      ctx.fillStyle=trailColor+(age*.9).toFixed(2)+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,1.8*age+.5,0,6.283); ctx.fill();
      prev=p;
    }
    ctx.restore();
  } else if(trailStyle==='paperclip'){ // Скрепка: лента с двойным нахлёстом ширины — реже и резче, чем «Узел-петля»
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=1;i<n;i++){
      const a0=trailHistBuf[i-1], a1=trailHistBuf[i], age=i/n;
      const w=(i%14<7)? 5 : 1.2;
      ctx.strokeStyle=trailColor+(age*.55).toFixed(2)+')';
      ctx.lineWidth=Math.max(.5,w*age);
      ctx.beginPath(); ctx.moveTo(a0.x,a0.y); ctx.lineTo(a1.x,a1.y); ctx.stroke();
    }
    ctx.restore();
  } else if(trailStyle==='rainbowArc'){ // Радуга-арка: основной путь + пара тонких дуг-эхо со сдвигом — на проверку
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    [0,-3,3].forEach((off,k)=>{
      ctx.strokeStyle=trailColor+(k===0?'.5)':'.22)');
      ctx.lineWidth=k===0?2:1;
      ctx.beginPath();
      for(let i=0;i<n;i++){ const p=trailHistBuf[i]; if(i===0) ctx.moveTo(p.x,p.y+off); else ctx.lineTo(p.x,p.y+off); }
      ctx.stroke();
    });
    ctx.restore();
  } else if(trailStyle==='waterWaves'){ // Волны: несколько параллельных линий рядом, как рябь за кормой — на проверку
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let k=-2;k<=2;k++){
      ctx.strokeStyle=trailColor+(0.4-Math.abs(k)*.08).toFixed(2)+')'; ctx.lineWidth=1;
      ctx.beginPath();
      for(let i=0;i<n;i++){
        const p=trailHistBuf[i];
        const nx = i>0? -(trailHistBuf[i].y-trailHistBuf[i-1].y) : 1, ny = i>0? (trailHistBuf[i].x-trailHistBuf[i-1].x) : 0;
        const nl=Math.hypot(nx,ny)||1, off=k*3;
        const x=p.x+(nx/nl)*off, y=p.y+(ny/nl)*off;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if(trailStyle==='celticTwist' || trailStyle==='celticBraid'){ // 05.09.2026 «Кельтский плетёный жгут/коса» — проекция спирали сбоку по реальным точкам хвоста (trailHistBuf), не рисунок «по мотивам». z=cos(фаза) даёт честный перед/зад — см. HUMAN-SYMBOLS.md
    const N=trailStyle==='celticTwist'?2:3, A=3.6;
    ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.lineCap='round';
    for(let i=1;i<n;i++){
      const a0=trailHistBuf[i-1], a1=trailHistBuf[i], age=i/n;
      const nx=-(a1.y-a0.y), ny=(a1.x-a0.x), nl=Math.hypot(nx,ny)||1;
      const ux=nx/nl, uy=ny/nl;
      const strands=[];
      for(let k=0;k<N;k++){
        const phase=i*.4+k*Math.PI*2/N;
        const off=A*Math.sin(phase), z=Math.cos(phase);
        strands.push({x0:a0.x+ux*off,y0:a0.y+uy*off, x1:a1.x+ux*off,y1:a1.y+uy*off, z});
      }
      strands.sort((s1,s2)=>s1.z-s2.z);
      strands.forEach(s=>{
        ctx.strokeStyle=trailColor+((0.25+0.3*((s.z+1)/2))*age).toFixed(2)+')';
        ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(s.x0,s.y0); ctx.lineTo(s.x1,s.y1); ctx.stroke();
      });
    }
    ctx.restore();
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
const MORSE_TANGENT_WIN=14; // 04.09.2026: окно сглаживания касательной, px по дуге — см. ниже
function morsePos(buf,a){ // позиция и угол касательной на дуге a (линейная интерполяция по буферу)
  if (a<=buf[0][2]) return [buf[0][0],buf[0][1],0];
  for (let i=1;i<buf.length;i++){
    if (buf[i][2]>=a){
      const p=buf[i-1], q=buf[i], d=q[2]-p[2], f=d>0?(a-p[2])/d:0;
      const x=p[0]+(q[0]-p[0])*f, y=p[1]+(q[1]-p[1])*f;
      /* 04.09.2026 (владелец, живое устройство — «при резком повороте точка/тире ложится
         почти горизонтально»): касательная раньше бралась ровно по паре (p,q) — один
         шумный/резкий кадр (гироскоп/палец/клавиша дали скачок X) давал один почти
         горизонтальный отрезок, и ровно в нём мог оказаться глиф. Теперь угол берём не
         по соседней паре, а по точкам, отстоящим минимум на MORSE_TANGENT_WIN px дуги в
         обе стороны от a (естественно сужается у краёв буфера, где столько дуги ещё/уже
         нет) — единичный скачок кадра тонет в среднем направлении окна, настоящий
         поворот (много кадров подряд) по-прежнему отражается честно. */
      let j=i-1; while(j>0 && p[2]-buf[j][2]<MORSE_TANGENT_WIN) j--;
      let k=i; while(k<buf.length-1 && buf[k][2]-q[2]<MORSE_TANGENT_WIN) k++;
      const jp=buf[j], kp=buf[k];
      const ang=(kp[2]>jp[2]) ? Math.atan2(kp[1]-jp[1],kp[0]-jp[0]) : Math.atan2(q[1]-p[1],q[0]-p[0]);
      return [x,y,ang];
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
/* renderTrailPattern — 05.09.2026, тот же приём, что renderFlashPattern выше: одна функция,
   которую зовут и жетон в Ангаре (angarBuildGrid), и — в будущем, когда понадобится — сама
   игра, чтобы плитка никогда не врала о виде следа. Формы — дословно те же координаты, что
   в самом полёте (см. p.trailFx-ветки в частицах выше и drawStructuredTrail): не рисунок
   «по мотивам», а честная заморозка. Самолётик на плитке рисует сам вызывающий код (ui.js),
   эта функция кладёт только сам след, начиная чуть ниже носа (y≈8) и вниз-назад. */
function renderTrailPattern(c, style, col){
  if(style==='debris'){ // Обломки-спутники: рыхлый дрейфующий рой
    [[-3,8,3.2,.75],[4,16,2.6,.65],[-5,24,3.6,.55],[2,32,2.8,.4],[-4,40,2.2,.25]].forEach(([x,y,r,a])=>{
      c.fillStyle=col(a); c.beginPath(); c.arc(x,y,r,0,6.2832); c.fill();
    });
  } else if(style==='pearls'){ // Нить-жемчуг: связная нить + бусины
    const pts=[[0,8,2.8,.85],[-.5,20,2.3,.65],[1,32,1.8,.45],[1.5,44,1.3,.28],[0,56,.9,.15]];
    c.strokeStyle=col(.35); c.lineWidth=.6; c.beginPath();
    pts.forEach(([x,y],i)=>{ if(i===0) c.moveTo(x,y); else c.lineTo(x,y); }); c.stroke();
    pts.forEach(([x,y,r,a])=>{ c.fillStyle=col(a); c.beginPath(); c.arc(x,y,r,0,6.2832); c.fill(); });
  } else if(style==='sparks'){ // Искры: точки + одна яркая вспышка
    c.fillStyle='rgba(255,255,255,.9)'; c.beginPath(); c.arc(2,10,4.5,0,6.2832); c.fill();
    [[-3,18,1.6,.7],[3,26,1.3,.55],[-4,34,1.8,.4],[1,44,1.1,.25]].forEach(([x,y,r,a])=>{
      c.fillStyle=col(a); c.beginPath(); c.arc(x,y,r,0,6.2832); c.fill();
    });
  } else if(style==='cometdust'){ // Кометная пыль: вытянутые «зёрнышки» под разными углами
    [[1,10,15,.75],[-1,22,-25,.6],[2,34,40,.4],[-1,46,-10,.22]].forEach(([x,y,rot,a])=>{
      c.save(); c.translate(x,y); c.rotate(rot*Math.PI/180); c.fillStyle=col(a);
      c.beginPath(); c.moveTo(-5,0); c.lineTo(1.5,-1.8); c.lineTo(5,0); c.lineTo(1.5,1.8); c.closePath(); c.fill();
      c.restore();
    });
  } else if(style==='ribbon'){ // Лента: сужается и тает к хвосту
    c.save(); c.globalCompositeOperation='lighter'; c.lineCap='round';
    const seg=[[0,8],[-1,20],[1,32],[1,42],[0,50]];
    for(let i=1;i<seg.length;i++){
      const age=1-(i-1)/(seg.length-1);
      c.strokeStyle=col(age*.75); c.lineWidth=Math.max(.6,5*age);
      c.beginPath(); c.moveTo(seg[i-1][0],seg[i-1][1]); c.lineTo(seg[i][0],seg[i][1]); c.stroke();
    }
    c.restore();
  } else if(style==='waypoints'){ // Метки пути: редкие гаснущие крестики
    c.lineWidth=1.1;
    [[0,16,.7],[-1,30,.45],[1,44,.22]].forEach(([x,y,a])=>{
      c.strokeStyle=col(a); c.beginPath();
      c.moveTo(x-3,y); c.lineTo(x+3,y); c.moveTo(x,y-3); c.lineTo(x,y+3); c.stroke();
    });
  } else if(style==='celticTwist' || style==='celticBraid'){ // 05.09.2026: статичная заморозка той же формулы, что в drawStructuredTrail ниже — см. HUMAN-SYMBOLS.md
    const N=style==='celticTwist'?2:3, A=3.6;
    for(let i=1;i<=12;i++){
      const y0=8+(i-1)*4, y1=8+i*4;
      const strands=[];
      for(let k=0;k<N;k++){
        const phase=i*.4+k*Math.PI*2/N;
        strands.push({off:A*Math.sin(phase), z:Math.cos(phase)});
      }
      strands.sort((s1,s2)=>s1.z-s2.z);
      strands.forEach(s=>{
        c.strokeStyle=col(0.35+0.4*((s.z+1)/2)); c.lineWidth=1.6;
        c.beginPath(); c.moveTo(s.off,y0); c.lineTo(s.off,y1); c.stroke();
      });
    }
  }
}
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
    case 'star': { // 04.09.2026: гранёные лепестки переменной длины вместо семи прямых лучей
      const n=7;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n), len=(i%2===0)?(10+p*32):(7+p*20);
        const w=1.6*(1-p*.3);
        c.save(); c.rotate(ang);
        c.fillStyle=col(1-p);
        c.beginPath();
        c.moveTo(0,-1.2); c.lineTo(len*.85,-w*.5); c.lineTo(len,0); c.lineTo(len*.85,w*.5); c.lineTo(0,1.2);
        c.closePath(); c.fill();
        c.restore();
      }
      break;
    }
    case 'particles': dots(10,0); break;
    case 'spiral': dots(10,p*2.5); break;
    /* 29.08.2026 «14 разных, не 10 с дублями» — девять новых узоров, ни один не повторяет
       ни старые пять выше, ни друг друга по силуэту (см. коммент над FLASHES в game.js).
       04.09.2026: sphere/comet/saturn/wings убраны из FLASHES (владелец, не нравились) —
       их case здесь тоже удалён: физически недостижим без записи в FLASHES_BY_ID. */
    case 'shards': { // 04.09.2026 «Разлёт»: реальное вращение при разлёте вместо статичных треугольников
      const n=6;
      for(let i=0;i<n;i++){
        const ang0=i*(6.2832/n)+.3;
        const r=6+p*34;
        const spin=p*(i%2?2.4:-2.0);
        const sz=5*(1-p*.3);
        c.save();
        c.translate(Math.cos(ang0)*r, Math.sin(ang0)*r);
        c.rotate(ang0+spin);
        c.fillStyle=col((1-p)*.9);
        c.beginPath();
        c.moveTo(0,-sz); c.lineTo(sz*.55,sz*.5); c.lineTo(-sz*.55,sz*.5);
        c.closePath(); c.fill();
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
    case 'flower': { // 04.09.2026: тоньше и легче (обводка вместо сплошной толстой заливки)
      const n=6, r=6+p*26;
      c.strokeStyle=col((1-p)*.9); c.lineWidth=1;
      c.fillStyle=col((1-p)*.22);
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        c.save(); c.translate(Math.cos(ang)*r*.5,Math.sin(ang)*r*.5); c.rotate(ang);
        c.beginPath(); c.ellipse(0,0,r*.55,r*.14,0,0,6.2832); c.fill(); c.stroke();
        c.restore();
      }
      break;
    }
    case 'corona': { // 04.09.2026: тонкое яркое кольцо + мягкое волнистое гало (двухслойно)
      const baseR=6+p*22;
      c.strokeStyle=col(1-p); c.lineWidth=1.3;
      c.beginPath(); c.arc(0,0,baseR,0,6.2832); c.stroke();
      c.fillStyle=col((1-p)*.35);
      const n=28;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const ang=i*(6.2832/n), r=(baseR+5)*(1+.22*Math.sin(ang*8+p*6));
        const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.closePath(); c.fill();
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
    /* 04.09.2026 «Небо месяца»→ нет, нет: «Ещё больше вспышек» (владелец, живая сессия
       брейншторма в браузере) — 40 новых узоров, каждый отдельной формой/движением,
       ни один не повторяет силуэт другого (проверено живьём, один за другим, десятками
       скриншотов настоящего превью в Ангаре — не на глаз по коду). 'spiral' здесь называется
       'swirl' — имя 'spiral' уже занято старым «Вихрём» (dots), не переименовывал старый
       стиль, чтобы не задеть уже купивших его игроков. */
    case 'pulsar': {
      const rings=3;
      c.lineWidth=1.4;
      for(let i=0;i<rings;i++){
        const t=Math.max(0, Math.min(1, p*1.6 - i*.28));
        if(t<=0) continue;
        const r=6+t*34;
        c.strokeStyle=col((1-t)*.85);
        c.beginPath(); c.arc(0,0,r,0,6.2832); c.stroke();
      }
      break;
    }
    case 'meteors': {
      const n=7;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n)+(i%2?0.15:-0.15);
        const rTip=10+p*36;
        const tailLen=8+p*14*(1-p*.3);
        const dx=Math.cos(ang), dy=Math.sin(ang);
        const grad=c.createLinearGradient(dx*(rTip-tailLen), dy*(rTip-tailLen), dx*rTip, dy*rTip);
        grad.addColorStop(0, col(0));
        grad.addColorStop(1, col(1-p));
        c.strokeStyle=grad; c.lineWidth=1.6;
        c.beginPath();
        c.moveTo(dx*(rTip-tailLen), dy*(rTip-tailLen));
        c.lineTo(dx*rTip, dy*rTip);
        c.stroke();
      }
      break;
    }
    case 'crystal': {
      const n=5;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        const r=4+p*22;
        const rot=p*1.2;
        c.save();
        c.translate(Math.cos(ang)*r, Math.sin(ang)*r);
        c.rotate(ang+rot);
        const sz=6*(0.4+p*.6);
        c.fillStyle=col((1-p)*.8);
        c.beginPath();
        c.moveTo(0,-sz); c.lineTo(sz*.4,0); c.lineTo(0,sz); c.lineTo(-sz*.4,0);
        c.closePath(); c.fill();
        c.strokeStyle=col(1-p); c.lineWidth=.6; c.stroke();
        c.restore();
      }
      break;
    }
    case 'orbit': {
      const n=3;
      for(let i=0;i<n;i++){
        const rOrb = 12+i*8;
        const speed = 2.4+i*0.7;
        const ang = p*6.2832*speed + i*2.1;
        const ex=Math.cos(ang)*rOrb, ey=Math.sin(ang)*rOrb*0.42;
        const alpha=Math.sin(Math.min(1,p*1.15)*3.1416);
        c.fillStyle=col(alpha*0.9);
        c.beginPath(); c.arc(ex,ey,1.8,0,6.2832); c.fill();
      }
      c.strokeStyle=col(0.18*(1-p*.3));
      c.lineWidth=0.6;
      c.beginPath(); c.ellipse(0,0,20,20*0.42,0,0,6.2832); c.stroke();
      break;
    }
    case 'fan': {
      const n=4;
      const spread = 0.4+p*1.5;
      [-1,1].forEach(side=>{
        for(let i=0;i<n;i++){
          const ang = side*spread*(i/(n-1)) - 1.5708;
          const len = 10+p*26;
          c.save(); c.rotate(ang);
          c.fillStyle = col((1-p)*.75);
          c.beginPath();
          c.moveTo(0,0); c.lineTo(-2.4,len); c.lineTo(2.4,len);
          c.closePath(); c.fill();
          c.restore();
        }
      });
      break;
    }
    case 'beacon': {
      const ang = p*6.2832*1.4;
      const width = 0.55;
      c.save(); c.rotate(ang);
      c.fillStyle=col((1-p*.4)*.45);
      c.beginPath();
      c.moveTo(0,0);
      c.arc(0,0,10+p*30,-width/2,width/2);
      c.closePath(); c.fill();
      c.restore();
      c.strokeStyle=col(1-p); c.lineWidth=1;
      c.beginPath(); c.arc(0,0,10+p*30,0,6.2832); c.stroke();
      break;
    }
    case 'crack': {
      const n=5;
      c.strokeStyle=col(1-p); c.lineWidth=1.4;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n)+.6;
        const len=10+p*32;
        const segs=4;
        c.save(); c.rotate(ang);
        c.beginPath();
        c.moveTo(0,0);
        for(let s=1;s<=segs;s++){
          const t=s/segs;
          const jag = (s%2?1:-1)*2.2*(1-t*.3);
          c.lineTo(len*t, jag);
        }
        c.stroke();
        c.restore();
      }
      break;
    }
    case 'origami': {
      const n=6;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n)+.5, r=8+p*30, sz=4.5*(1-p*.25);
        c.save(); c.translate(Math.cos(ang)*r,Math.sin(ang)*r); c.rotate(ang+1.57);
        c.fillStyle=col(1-p);
        c.beginPath(); c.moveTo(0,-sz); c.lineTo(sz*.75,sz*.7); c.lineTo(0,sz*.25); c.closePath(); c.fill();
        c.fillStyle=col((1-p)*.55);
        c.beginPath(); c.moveTo(0,-sz); c.lineTo(-sz*.75,sz*.7); c.lineTo(0,sz*.25); c.closePath(); c.fill();
        c.restore();
      }
      break;
    }
    case 'constellation': {
      const pts=[[0,-1],[.8,-.3],[.5,.7],[-.5,.7],[-.8,-.3],[0,-1]].map(function(pt){
        const rr=(10+p*26);
        return [pt[0]*rr, pt[1]*rr];
      });
      c.strokeStyle=col((1-p)*.6); c.lineWidth=1;
      c.beginPath();
      pts.forEach(function(pt,i){ if(i===0) c.moveTo(pt[0],pt[1]); else c.lineTo(pt[0],pt[1]); });
      c.stroke();
      c.fillStyle=col(1-p);
      pts.forEach(function(pt){ c.beginPath(); c.arc(pt[0],pt[1],1.8,0,6.2832); c.fill(); });
      break;
    }
    case 'compass': {
      const n=16, len0=8;
      c.strokeStyle=col(1-p);
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        const major=(i%4===0);
        const lw=major?2:1, lenTo=len0+p*(major?32:18);
        c.lineWidth=lw;
        c.beginPath();
        c.moveTo(Math.cos(ang)*len0,Math.sin(ang)*len0);
        c.lineTo(Math.cos(ang)*lenTo,Math.sin(ang)*lenTo);
        c.stroke();
      }
      break;
    }
    case 'gyro': {
      const rings=3;
      for(let i=0;i<rings;i++){
        const tilt = i*(3.1416/rings);
        const spin = p*6.2832*(1+i*.3);
        const r = 8+p*24;
        c.save();
        c.rotate(tilt);
        c.scale(1, 0.32);
        c.rotate(spin);
        c.strokeStyle=col((1-p)*.8);
        c.lineWidth=1.1;
        c.beginPath(); c.arc(0,0,r,0,6.2832); c.stroke();
        c.restore();
      }
      break;
    }
    case 'figure8': {
      const n=26;
      c.strokeStyle=col((1-p)*.85); c.lineWidth=1.2;
      const R=8+p*20;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const t=(i/n)*6.2832;
        const x=Math.sin(t)*R;
        const y=Math.sin(t)*Math.cos(t)*R;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.stroke();
      const t=p*6.2832*2;
      const hx=Math.sin(t)*R, hy=Math.sin(t)*Math.cos(t)*R;
      c.fillStyle=col(1);
      c.beginPath(); c.arc(hx,hy,2,0,6.2832); c.fill();
      break;
    }
    case 'pendulum': {
      const swing = Math.sin(p*6.2832*1.5)*1.0;
      const len = 14+p*16;
      const bx=Math.sin(swing)*len, by=Math.cos(swing)*len;
      c.strokeStyle=col((1-p)*.6); c.lineWidth=1;
      c.beginPath(); c.moveTo(0,0); c.lineTo(bx,by); c.stroke();
      c.fillStyle=col(1-p*.5);
      c.beginPath(); c.arc(bx,by,2.6,0,6.2832); c.fill();
      break;
    }
    case 'eclipse': {
      const R=8+p*22;
      c.strokeStyle=col(1-p); c.lineWidth=1.4;
      c.beginPath(); c.arc(0,0,R,0,6.2832); c.stroke();
      const ex = -R*1.6 + p*R*3.2;
      c.fillStyle=col((1-p)*.9);
      c.beginPath(); c.arc(ex,0,R*.55,0,6.2832); c.fill();
      break;
    }
    case 'swarm': {
      const n=9;
      c.fillStyle=col(1-p);
      for(let i=0;i<n;i++){
        const seed=i*12.9898;
        const baseAng=(seed%6.2832);
        const baseR=6+((i*37)%20);
        const jx=Math.sin(p*6.2832*(1.3+i*.11)+seed)*3;
        const jy=Math.cos(p*6.2832*(1.1+i*.09)+seed)*3;
        const r=baseR+p*14;
        const x=Math.cos(baseAng)*r+jx, y=Math.sin(baseAng)*r+jy;
        c.beginPath(); c.arc(x,y,1.4,0,6.2832); c.fill();
      }
      break;
    }
    case 'gear': {
      const teeth=8;
      const rot=p*6.2832*0.8;
      const rOut=8+p*20, rIn=rOut*0.75;
      const step=6.2832/teeth;
      c.save(); c.rotate(rot);
      c.strokeStyle=col(1-p); c.lineWidth=1.3;
      c.beginPath();
      for(let i=0;i<teeth;i++){
        const a=i*step;
        c.lineTo(Math.cos(a)*rIn, Math.sin(a)*rIn);
        c.lineTo(Math.cos(a+step*.15)*rOut, Math.sin(a+step*.15)*rOut);
        c.lineTo(Math.cos(a+step*.5)*rOut, Math.sin(a+step*.5)*rOut);
        c.lineTo(Math.cos(a+step*.65)*rIn, Math.sin(a+step*.65)*rIn);
      }
      c.closePath(); c.stroke();
      c.restore();
      break;
    }
    case 'firework': {
      const bursts=3;
      for(let b=0;b<bursts;b++){
        const t=Math.max(0, Math.min(1, p*1.8 - b*.32));
        if(t<=0) continue;
        const bang=(b*2.4+1)%6.2832;
        const bdist = 5+b*4;
        const bx=Math.cos(bang)*bdist, by=Math.sin(bang)*bdist;
        const rays=8;
        c.strokeStyle=col((1-t)); c.lineWidth=1.6;
        for(let i=0;i<rays;i++){
          const ang=i*(6.2832/rays)+b;
          const len=3+t*17;
          c.beginPath();
          c.moveTo(bx+Math.cos(ang)*2,by+Math.sin(ang)*2);
          c.lineTo(bx+Math.cos(ang)*len, by+Math.sin(ang)*len);
          c.stroke();
        }
      }
      break;
    }
    case 'frost': {
      const branches=6;
      c.strokeStyle=col(1-p); c.lineWidth=1;
      for(let i=0;i<branches;i++){
        const ang=i*(6.2832/branches);
        const len=8+p*24;
        c.save(); c.rotate(ang);
        c.beginPath(); c.moveTo(0,0); c.lineTo(0,len); c.stroke();
        const subs=3;
        for(let s=1;s<=subs;s++){
          const t=s/(subs+1);
          const y=len*t;
          const sublen=len*(1-t)*.5;
          c.beginPath(); c.moveTo(0,y); c.lineTo(sublen*.7,y+sublen*.7); c.stroke();
          c.beginPath(); c.moveTo(0,y); c.lineTo(-sublen*.7,y+sublen*.7); c.stroke();
        }
        c.restore();
      }
      break;
    }
    case 'web': {
      const rings=3, spokes=8;
      c.strokeStyle=col((1-p)*.8); c.lineWidth=.8;
      for(let s=0;s<spokes;s++){
        const ang=s*(6.2832/spokes);
        c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(ang)*(8+p*24), Math.sin(ang)*(8+p*24)); c.stroke();
      }
      for(let r=1;r<=rings;r++){
        const rr=(8+p*24)*(r/rings);
        c.beginPath();
        for(let s=0;s<=spokes;s++){
          const ang=s*(6.2832/spokes);
          const x=Math.cos(ang)*rr, y=Math.sin(ang)*rr;
          if(s===0) c.moveTo(x,y); else c.lineTo(x,y);
        }
        c.stroke();
      }
      break;
    }
    case 'cradle': {
      const n=5, spacing=6.5;
      const startX=-((n-1)/2)*spacing;
      const t=(p*2)%1;
      const leftSwing = Math.floor(p*2)%2===0;
      c.fillStyle=col(1-p*.4);
      for(let i=0;i<n;i++){
        let x=startX+i*spacing, y=6;
        const isEdge = leftSwing ? i===0 : i===n-1;
        if(isEdge){
          const ang=Math.sin(t*3.1416)*1.1*(leftSwing?1:-1);
          x += Math.sin(ang)*10;
          y = 6-(10-Math.cos(ang)*10);
        }
        c.beginPath(); c.arc(x,y,2.2,0,6.2832); c.fill();
      }
      c.strokeStyle=col(.3); c.lineWidth=.6;
      c.beginPath(); c.moveTo(startX-4,-6); c.lineTo(startX+(n-1)*spacing+4,-6); c.stroke();
      break;
    }
    case 'field': {
      const lines=4;
      c.strokeStyle=col((1-p)*.75); c.lineWidth=1;
      for(let i=1;i<=lines;i++){
        const w=i*5;
        const h=6+p*22;
        [1,-1].forEach(dir=>{
          c.beginPath();
          c.moveTo(-w, 0);
          c.quadraticCurveTo(0, dir*h, w, 0);
          c.stroke();
        });
      }
      break;
    }
    case 'lissajous': {
      const n=40;
      c.strokeStyle=col((1-p)*.85); c.lineWidth=1.1;
      const R=8+p*20;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const t=(i/n)*6.2832;
        const x=Math.sin(3*t+p*3)*R;
        const y=Math.sin(2*t)*R;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.stroke();
      break;
    }
    case 'interference': {
      const centers=[[-6,0],[6,0]];
      centers.forEach(([cx,cy])=>{
        for(let i=0;i<3;i++){
          const t=Math.max(0,Math.min(1,p*1.5-i*.25));
          if(t<=0) return;
          const r=4+t*22;
          c.strokeStyle=col((1-t)*.55);
          c.lineWidth=.8;
          c.beginPath(); c.arc(cx,cy,r,0,6.2832); c.stroke();
        }
      });
      break;
    }
    case 'turbine': {
      const n=6;
      const rot=p*6.2832*1.1;
      c.save(); c.rotate(rot);
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        c.save(); c.rotate(ang);
        c.strokeStyle=col(1-p); c.lineWidth=1.6;
        const len=8+p*26;
        c.beginPath();
        c.moveTo(0,0);
        c.quadraticCurveTo(len*.3, len*.5, len*.15, len);
        c.stroke();
        c.restore();
      }
      c.restore();
      break;
    }
    case 'doublePendulum': {
      const t=p*6.2832*2;
      const l1=10, l2=9;
      const a1=Math.sin(t*1.3)*1.6;
      const a2=Math.sin(t*2.1+1)*2.2;
      const x1=Math.sin(a1)*l1, y1=Math.cos(a1)*l1;
      const x2=x1+Math.sin(a2)*l2, y2=y1+Math.cos(a2)*l2;
      c.strokeStyle=col((1-p)*.6); c.lineWidth=1;
      c.beginPath(); c.moveTo(0,0); c.lineTo(x1,y1); c.lineTo(x2,y2); c.stroke();
      c.fillStyle=col(1-p*.4);
      c.beginPath(); c.arc(x1,y1,1.8,0,6.2832); c.fill();
      c.beginPath(); c.arc(x2,y2,2.4,0,6.2832); c.fill();
      break;
    }
    case 'molecule': {
      const pts=[[0,0],[1,-0.6],[0.7,0.8],[-0.9,0.5],[-0.6,-0.8]].map(([x,y])=>[x*(6+p*18),y*(6+p*18)]);
      c.strokeStyle=col((1-p)*.5); c.lineWidth=.8;
      for(let i=1;i<pts.length;i++){
        c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); c.lineTo(pts[i][0],pts[i][1]); c.stroke();
      }
      c.fillStyle=col(1-p);
      pts.forEach(([x,y],i)=>{
        c.beginPath(); c.arc(x,y,i===0?2.4:1.6,0,6.2832); c.fill();
      });
      break;
    }
    case 'cube': {
      const s=10+p*16;
      const rot=p*6.2832*0.7;
      const pts3d=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
      const cosr=Math.cos(rot), sinr=Math.sin(rot);
      const proj = pts3d.map(([x,y,z])=>{
        const x2=x*cosr - z*sinr, z2=x*sinr + z*cosr;
        const scale = 1/(2.2 - z2*0.3);
        return [x2*s*scale, y*s*scale*0.8];
      });
      const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      c.strokeStyle=col(1-p*.5); c.lineWidth=1.4;
      edges.forEach(([a,b])=>{
        c.beginPath(); c.moveTo(proj[a][0],proj[a][1]); c.lineTo(proj[b][0],proj[b][1]); c.stroke();
      });
      break;
    }
    case 'feathers': {
      const n=5;
      c.strokeStyle=col((1-p)*.8); c.lineWidth=1;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n)+.4;
        const len=10+p*24;
        c.save(); c.rotate(ang);
        c.beginPath(); c.moveTo(0,0); c.quadraticCurveTo(len*.3,len*.5,len*.1,len); c.stroke();
        for(let b=1;b<=4;b++){
          const t=b/5, y=len*t, spread=3*t;
          c.beginPath(); c.moveTo(len*.1*t,y); c.lineTo(len*.1*t+spread,y-2); c.stroke();
          c.beginPath(); c.moveTo(len*.1*t,y); c.lineTo(len*.1*t-spread,y-2); c.stroke();
        }
        c.restore();
      }
      break;
    }
    case 'barcode': {
      const n=9;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        const t=((p*2+i*.15)%1);
        const h=4+Math.sin(t*3.1416)*10;
        c.save(); c.rotate(ang);
        c.strokeStyle=col(1-p); c.lineWidth=1.6;
        c.beginPath(); c.moveTo(0,10); c.lineTo(0,10+h); c.stroke();
        c.restore();
      }
      break;
    }
    case 'starfish': {
      const n=5;
      c.fillStyle=col((1-p)*.75);
      c.beginPath();
      for(let i=0;i<=n*2;i++){
        const ang=i*(3.1416/n);
        const r=(i%2===0)?(8+p*24):(4+p*10);
        const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
        if(i===0) c.moveTo(x,y); else c.quadraticCurveTo(Math.cos(ang-3.1416/n/2)*r*.7,Math.sin(ang-3.1416/n/2)*r*.7,x,y);
      }
      c.closePath(); c.fill();
      break;
    }
    case 'sunrise': {
      const n=7;
      c.strokeStyle=col(1-p); c.lineWidth=1.4;
      for(let i=0;i<n;i++){
        const ang=-1.5708+(-0.9+1.8*(i/(n-1)));
        const len=10+p*30;
        c.beginPath();
        c.moveTo(Math.cos(ang)*6,Math.sin(ang)*6);
        c.lineTo(Math.cos(ang)*len,Math.sin(ang)*len);
        c.stroke();
      }
      break;
    }
    case 'pixels': {
      const n=10;
      c.fillStyle=col(1-p);
      for(let i=0;i<n;i++){
        const ang=(i*2.4)%6.2832;
        const r=6+((i*13)%20)*(0.3+p*0.9);
        const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
        const sz=2+((i*7)%3);
        c.fillRect(x-sz/2,y-sz/2,sz,sz);
      }
      break;
    }
    case 'supernova': {
      const n=16;
      c.strokeStyle=col(1-p); c.lineWidth=1.2;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const ang=i*(6.2832/n);
        const jag=(i%2===0)?1:0.6;
        const r=(6+p*30)*jag;
        const x=Math.cos(ang)*r, y=Math.sin(ang)*r;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.closePath(); c.stroke();
      break;
    }
    case 'needle': {
      const spin=p*6.2832*2.2;
      const len=8+p*22;
      c.save(); c.rotate(spin);
      c.fillStyle=col(1-p);
      c.beginPath(); c.moveTo(0,-len); c.lineTo(2,0); c.lineTo(0,3); c.lineTo(-2,0); c.closePath(); c.fill();
      c.fillStyle=col((1-p)*.4);
      c.beginPath(); c.moveTo(0,len*.4); c.lineTo(2,0); c.lineTo(0,-3); c.lineTo(-2,0); c.closePath(); c.fill();
      c.restore();
      break;
    }
    case 'flare': {
      const len=10+p*28;
      c.strokeStyle=col((1-p)*.85); c.lineWidth=1.1;
      [0,1.5708].forEach(ang=>{
        c.save(); c.rotate(ang);
        c.beginPath(); c.moveTo(-len,0); c.lineTo(len,0); c.stroke();
        c.restore();
      });
      const n=4;
      for(let i=0;i<n;i++){
        const t=i/n;
        c.strokeStyle=col((1-p)*.3);
        c.beginPath(); c.arc(0,0,4+t*8,0,6.2832); c.stroke();
      }
      break;
    }
    case 'scanline': {
      const y = -20 + p*40;
      c.strokeStyle=col(1-p); c.lineWidth=1.3;
      c.beginPath(); c.moveTo(-18,y); c.lineTo(18,y); c.stroke();
      c.fillStyle=col((1-p)*.25);
      c.fillRect(-18, y-6, 36, 6);
      break;
    }
    case 'squares': {
      const n=4;
      for(let i=0;i<n;i++){
        const t=i/n;
        const sz=(10+p*30)*(0.4+t*.6);
        const rot=p*6.2832*0.5+t*0.8;
        c.save(); c.rotate(rot);
        c.strokeStyle=col(1-p*.4); c.lineWidth=1.4;
        c.strokeRect(-sz/2,-sz/2,sz,sz);
        c.restore();
      }
      break;
    }
    case 'clock': {
      const n=12;
      c.strokeStyle=col((1-p)*.5); c.lineWidth=1;
      const R=10+p*22;
      for(let i=0;i<n;i++){
        const ang=i*(6.2832/n);
        const major=(i%3===0);
        const len=major?4:2;
        c.beginPath();
        c.moveTo(Math.cos(ang)*R, Math.sin(ang)*R);
        c.lineTo(Math.cos(ang)*(R-len), Math.sin(ang)*(R-len));
        c.stroke();
      }
      const hourAng=p*6.2832*0.6;
      const minAng=p*6.2832*2.2;
      c.strokeStyle=col(1-p);
      c.lineWidth=2.2;
      c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(hourAng-1.5708)*R*.5, Math.sin(hourAng-1.5708)*R*.5); c.stroke();
      c.lineWidth=1.3;
      c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(minAng-1.5708)*R*.85, Math.sin(minAng-1.5708)*R*.85); c.stroke();
      c.fillStyle=col(1-p);
      c.beginPath(); c.arc(0,0,1.6,0,6.2832); c.fill();
      break;
    }
    case 'string': {
      const n=30;
      const len=10+p*28;
      const freq=3;
      const amp=3*Math.sin(p*6.2832*2)*(1-p*.3);
      c.strokeStyle=col(1-p*.3); c.lineWidth=1.2;
      c.beginPath();
      for(let i=0;i<=n;i++){
        const t=i/n;
        const x=-len+t*len*2;
        const y=Math.sin(t*3.1416*freq)*amp;
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.stroke();
      break;
    }
    case 'swirl': {
      const n=24;
      c.fillStyle=col(1-p);
      for(let i=0;i<n;i++){
        const t=i/n;
        const ang=t*12.566 + p*4;
        const r=(4+t*34)*(0.3+p*0.7);
        const sz=1.6*(1-t*.5);
        c.beginPath();
        c.arc(Math.cos(ang)*r, Math.sin(ang)*r, sz, 0, 6.2832);
        c.fill();
      }
      break;
    }
    /* 05.09.2026 «Живые вспышки» — 6 новых узоров ниже читают настоящие данные (game.js:
       isMeteorShowerDay/isRealEclipseDay/S.milestoneHit/S.comebackHit/achUnlockedSet/
       dailyRNG), а не только p (прогресс 0→1 за окно вспышки). 'milestone' рисует золотым
       напрямую (не через col — тот красит в цвет скина, а веха должна быть одинаково
       золотой на любом скине, это её опознавательный цвет). */
    case 'starfall': { // Звездопад: обычно — редкие короткие штрихи, в день пика потока — густой ливень
      const special = typeof isMeteorShowerDay==='function' && isMeteorShowerDay();
      const n = special?9:3;
      c.lineCap='round'; c.strokeStyle=col(1-p); c.lineWidth=special?1.6:1.1;
      for(let i=0;i<n;i++){
        const t=n>1?i/(n-1):0.5;
        const ang=-1.05+t*.5;
        const len=(special?24:13)+p*(special?22:9);
        const x0=(t-.5)*(special?68:26), y0=-28+t*8;
        c.beginPath();
        c.moveTo(x0,y0);
        c.lineTo(x0+Math.cos(ang)*len, y0+Math.sin(ang)*len);
        c.stroke();
      }
      break;
    }
    case 'milestone': { // Веха пути: обычно — едва заметное кольцо, в момент новых круглых 100 км — золотой залп один раз
      if(typeof S!=='undefined' && S.milestoneHit){
        const gcol=a=>'rgba(255,215,106,'+Math.max(0,a).toFixed(2)+')';
        const n=12;
        c.strokeStyle=gcol(1-p); c.lineWidth=1.4;
        for(let i=0;i<n;i++){
          const ang=i*(6.2832/n), r0=14+p*4, r1=14+p*22;
          c.beginPath();
          c.moveTo(Math.cos(ang)*r0,Math.sin(ang)*r0);
          c.lineTo(Math.cos(ang)*r1,Math.sin(ang)*r1);
          c.stroke();
        }
        c.strokeStyle=gcol((1-p)*.8); c.lineWidth=1;
        c.beginPath(); c.arc(0,0,10+p*4,0,6.2832); c.stroke();
        c.fillStyle=gcol((1-p)*.9);
        c.beginPath(); c.arc(0,0,4,0,6.2832); c.fill();
      } else {
        ring(p*.5,1,1);
      }
      break;
    }
    case 'realEclipse': { // Небесное затмение: обычно — тихое кольцо, в день настоящего затмения — тёмный диск с огненным ободком
      const special = typeof isRealEclipseDay==='function' && isRealEclipseDay();
      if(special){
        c.fillStyle='rgba(6,10,20,'+(0.9*(1-p*.3)).toFixed(2)+')';
        c.beginPath(); c.arc(0,0,10+p*14,0,6.2832); c.fill();
        c.strokeStyle='rgba(255,157,74,'+(1-p).toFixed(2)+')'; c.lineWidth=2.2;
        c.beginPath(); c.arc(0,0,10+p*14,0,6.2832); c.stroke();
      } else {
        ring(p*.6,1,1);
      }
      break;
    }
    case 'comeback': { // С возвращением: обычно — едва заметное кольцо, после 7+ дней перерыва — тёплый тройной всплеск
      if(typeof S!=='undefined' && S.comebackHit){
        ring(p,2,2); ring(Math.max(0,p-.15),2,2); ring(Math.max(0,p-.3),2,2);
        c.fillStyle='rgba(255,207,138,'+(1-p).toFixed(2)+')';
        c.beginPath(); c.arc(0,0,4,0,6.2832); c.fill();
      } else {
        ring(p*.4,1,1);
      }
      break;
    }
    case 'achConstellation': { // Созвездие наград: всегда честно по числу открытых достижений (0..6 точек, фиксированные позиции)
      const n = typeof achUnlockedSet==='function' ? Math.min(6,achUnlockedSet().length) : 0;
      const pts=[[0,-26],[14,-10],[-16,2],[10,16],[-6,28],[18,30]];
      const shown = n>0?n:1;
      c.strokeStyle=col((1-p)*.6); c.lineWidth=.8;
      c.fillStyle=col(1-p);
      for(let i=0;i<shown;i++){
        const gx=pts[i][0]*(1+p*.15), gy=pts[i][1]*(1+p*.15);
        if(i>0 && n>0){
          const px=pts[i-1][0]*(1+p*.15), py=pts[i-1][1]*(1+p*.15);
          c.beginPath(); c.moveTo(px,py); c.lineTo(gx,gy); c.stroke();
        }
        c.beginPath(); c.arc(gx,gy, n>0?2.2:1.4, 0,6.2832); c.fill();
      }
      break;
    }
    case 'daysign': { // Знак дня: число колец честно от сегодняшнего общего сида (dailyRNG — тот же, что у Трассы дня)
      let rings=1;
      if(typeof dailyRNG==='function'){ const r=dailyRNG(); rings=1+Math.floor(r()*3); }
      for(let i=0;i<rings;i++) ring(Math.max(0,p-i*.12),1.6,.6);
      break;
    }
    /* 05.09.2026 «Из макета в игру» — большая партия ниже, перенесена из HTML-макетов (клип N'to,
       Vecteezy/Envato/Behance, сакральная геометрия). Координаты для проверенных фигур
       (Flower of Life/Metatron/Sri Yantra/Hat/Кубооктаэдр/Печать/гирих) взяты из уже посчитанных
       и проверенных короткими скриптами массивов — не нарисованы на глаз заново. */
    case 'spokes': {
      const n=24; c.strokeStyle=col(1-p); c.lineWidth=0.8;
      for(let i=0;i<n;i++){ const a=i*(6.2832/n);
        c.beginPath(); c.moveTo(Math.cos(a)*8,Math.sin(a)*8); c.lineTo(Math.cos(a)*(8+p*24),Math.sin(a)*(8+p*24)); c.stroke(); }
      break;
    }
    case 'nestedShapes': {
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      c.beginPath(); c.arc(0,0,p*30,0,6.2832); c.stroke();
      c.save(); c.rotate(0.35); c.strokeRect(-p*24,-p*24,p*48,p*48); c.restore();
      c.beginPath(); c.arc(0,0,p*18,0,6.2832); c.stroke();
      c.save(); c.rotate(-0.26); c.strokeRect(-p*14,-p*14,p*28,p*28); c.restore();
      break;
    }
    case 'blendCircles': {
      c.fillStyle=col((1-p)*.35);
      [[-10,-8],[8,-8],[-1,8]].forEach(([x,y])=>{ c.beginPath(); c.arc(x*p,y*p,17*p,0,6.2832); c.fill(); });
      break;
    }
    case 'rippleDot': {
      c.strokeStyle=col(1-p); c.lineWidth=0.6;
      [9,18,27,36].forEach(r=>{ c.beginPath(); c.arc(0,0,r*p,0,6.2832); c.stroke(); });
      c.fillStyle=col(1-p); c.beginPath(); c.arc(0,0,3.2,0,6.2832); c.fill();
      break;
    }
    case 'grooveDisc': {
      c.fillStyle=col((1-p)*.18); c.beginPath(); c.arc(0,0,26*p,0,6.2832); c.fill();
      c.strokeStyle=col((1-p)*.55); c.lineWidth=0.5;
      for(let i=0;i<9;i++){ c.beginPath(); c.arc(0,0,(4+i*2.6)*p,0,6.2832); c.stroke(); }
      break;
    }
    case 'fillLevel': {
      c.strokeStyle=col((1-p)*.6); c.lineWidth=1;
      c.beginPath(); c.moveTo(0,-28*p); c.lineTo(-24*p,26*p); c.lineTo(24*p,26*p); c.closePath(); c.stroke();
      c.fillStyle=col((1-p)*.35);
      c.beginPath(); c.moveTo(0,-12*p); c.lineTo(-16*p,26*p); c.lineTo(16*p,26*p); c.closePath(); c.fill();
      break;
    }
    case 'weavedBands': {
      c.strokeStyle=col(1-p); c.lineWidth=2.2*p;
      c.beginPath(); c.moveTo(-36*p,-20*p); c.quadraticCurveTo(0,5*p,36*p,-20*p); c.stroke();
      c.beginPath(); c.moveTo(-36*p,20*p); c.quadraticCurveTo(0,-5*p,36*p,20*p); c.stroke();
      c.lineWidth=1; c.beginPath(); c.arc(0,4*p,10*p,0,6.2832); c.stroke();
      break;
    }
    case 'ringCluster': {
      const pts=[[-18,-22,4],[-4,-30,3.4],[-26,-8,3],[-12,2,4.6],[8,-6,3.2],[0,-16,3.6],[-20,12,3],[-6,16,4],[12,8,3.4]];
      c.strokeStyle=col(1-p); c.lineWidth=1;
      pts.forEach(([x,y,r])=>{ c.beginPath(); c.arc(x*p,y*p,r*p,0,6.2832); c.stroke(); });
      break;
    }
    case 'moonGrid': {
      c.strokeStyle=col(1-p); c.fillStyle=col(1-p); c.lineWidth=0.6;
      for(let i=0;i<16;i++){ const cl=i%4, row=Math.floor(i/4), x=(cl*16-24)*p, y=(row*16-24)*p, ph=(i%4)/4;
        c.beginPath(); c.arc(x,y,6*p,0,6.2832); c.stroke();
        c.beginPath(); c.arc(x,y,Math.max(0.5,(6-ph*12)*p),0,6.2832); c.fill();
      }
      break;
    }
    case 'diagStairs': {
      for(let i=0;i<6;i++){ const x=(i*10-25)*p, y=(24-i*10)*p, sz=(6+i*1.2)*p;
        if(i%2===0){ c.fillStyle=col((1-p)*.5); c.save(); c.translate(x,y); c.rotate(0.7854); c.fillRect(-sz/2,-sz/2,sz,sz); c.restore(); }
        else { c.strokeStyle=col((1-p)*.6); c.lineWidth=1; c.save(); c.translate(x,y); c.rotate(0.7854); c.strokeRect(-sz/2,-sz/2,sz,sz); c.restore(); }
      }
      break;
    }
    case 'eqBars': {
      c.strokeStyle=col(1-p); c.lineCap='round';
      [0,1,2,3,4,3,2,1,0].forEach((v,i)=>{ const y=(i*6-24)*p, len=(6+v*7)*p;
        c.lineWidth=2.4; c.beginPath(); c.moveTo(-len,y); c.lineTo(len,y); c.stroke(); });
      break;
    }
    case 'isoTriangle': {
      const a=(1-p)*.85;
      c.fillStyle='rgba(255,157,138,'+a.toFixed(2)+')'; c.beginPath(); c.moveTo(0,-16*p); c.lineTo(6*p,-4*p); c.lineTo(-6*p,-4*p); c.closePath(); c.fill();
      c.fillStyle='rgba(107,63,74,'+a.toFixed(2)+')'; c.beginPath(); c.moveTo(6*p,-4*p); c.lineTo(12*p,4*p); c.lineTo(0,4*p); c.closePath(); c.fill();
      c.fillStyle='rgba(63,168,154,'+a.toFixed(2)+')'; c.beginPath(); c.moveTo(-6*p,-4*p); c.lineTo(0,4*p); c.lineTo(-12*p,4*p); c.closePath(); c.fill();
      break;
    }
    case 'shapeCollage': {
      const a=(1-p)*.55;
      c.save(); c.translate(-15*p,-13*p); c.rotate(-0.14); c.fillStyle='rgba(108,212,255,'+a.toFixed(2)+')'; c.fillRect(-13*p,-13*p,26*p,26*p); c.restore();
      c.save(); c.translate(4*p,-19*p); c.rotate(0.21); c.fillStyle='rgba(255,179,122,'+a.toFixed(2)+')'; c.fillRect(-12*p,-12*p,24*p,24*p); c.restore();
      c.fillStyle='rgba(157,124,255,'+a.toFixed(2)+')'; c.beginPath(); c.moveTo(20*p,5*p); c.lineTo(2*p,18*p); c.lineTo(-20*p,12*p); c.closePath(); c.fill();
      break;
    }
    case 'spiralClip': {
      c.save(); c.beginPath(); c.moveTo(0,-30*p); c.lineTo(26*p,18*p); c.lineTo(-26*p,18*p); c.closePath(); c.clip();
      c.strokeStyle=col(1-p); c.lineWidth=1;
      for(let i=0;i<8;i++){ c.beginPath(); c.arc(0,5*p,(4+i*4.2)*p,0,6.2832); c.stroke(); }
      c.restore();
      c.strokeStyle=col((1-p)*.4); c.lineWidth=0.6;
      c.beginPath(); c.moveTo(0,-30*p); c.lineTo(26*p,18*p); c.lineTo(-26*p,18*p); c.closePath(); c.stroke();
      break;
    }
    case 'starTunnel': {
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      for(let i=0;i<5;i++){ const r=(8+i*7)*p, rot=i*11*Math.PI/180, n=8, w=1-i*.15;
        c.globalAlpha=Math.max(0,w);
        c.beginPath();
        for(let k=0;k<n*2;k++){ const a=(k*Math.PI/n)+rot, rr=k%2===0?r:r*.45; const x=Math.cos(a)*rr, y=Math.sin(a)*rr; if(k===0)c.moveTo(x,y); else c.lineTo(x,y); }
        c.closePath(); c.stroke();
      }
      c.globalAlpha=1;
      break;
    }
    case 'spiralWeb': {
      c.strokeStyle=col(1-p); c.lineWidth=0.6;
      for(let i=0;i<16;i++){ const a=i*(6.2832/16), a2=a+1.1;
        c.beginPath(); c.moveTo(0,0); c.lineTo(Math.cos(a)*36*p,Math.sin(a)*36*p); c.stroke();
        c.beginPath(); c.moveTo(Math.cos(a)*10*p,Math.sin(a)*10*p); c.lineTo(Math.cos(a2)*36*p,Math.sin(a2)*36*p); c.stroke();
      }
      break;
    }
    case 'crossBeam': {
      c.strokeStyle=col(1-p); c.lineCap='round';
      c.lineWidth=1; c.beginPath(); c.moveTo(-40*p,-40*p); c.lineTo(40*p,40*p); c.stroke();
      c.beginPath(); c.moveTo(40*p,-40*p); c.lineTo(-40*p,40*p); c.stroke();
      c.lineWidth=0.6; c.globalAlpha=0.6;
      c.beginPath(); c.moveTo(-32*p,-36*p); c.lineTo(32*p,36*p); c.stroke();
      c.beginPath(); c.moveTo(32*p,-36*p); c.lineTo(-32*p,36*p); c.stroke();
      c.globalAlpha=1;
      break;
    }
    case 'arcFan': {
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      c.globalAlpha=0.3; c.beginPath(); c.arc(0,0,30*p,0,6.2832); c.stroke(); c.globalAlpha=1;
      for(let i=0;i<6;i++){ const h=(6+i*7)*p;
        c.beginPath(); c.moveTo(-25*p,12*p); c.quadraticCurveTo(0,12*p-h*2,25*p,12*p); c.stroke(); }
      break;
    }
    case 'diamondSphere': {
      c.strokeStyle=col(1-p); c.lineWidth=0.6; c.globalAlpha=0.85;
      c.beginPath(); c.ellipse(0,0,26*p,26*p,0,0,6.2832); c.stroke();
      c.beginPath(); c.ellipse(0,0,10*p,26*p,0,0,6.2832); c.stroke();
      c.beginPath(); c.ellipse(0,0,18*p,26*p,0,0,6.2832); c.stroke();
      c.beginPath(); c.moveTo(-24*p,0); c.lineTo(24*p,0); c.stroke();
      c.beginPath(); c.moveTo(-24*p,-16*p); c.lineTo(24*p,-16*p); c.stroke();
      c.beginPath(); c.moveTo(-24*p,16*p); c.lineTo(24*p,16*p); c.stroke();
      c.globalAlpha=1;
      break;
    }
    case 'twistedSphere': {
      c.fillStyle=col((1-p)*.12); c.beginPath(); c.arc(0,0,26*p,0,6.2832); c.fill();
      c.fillStyle=col(1-p);
      for(let i=0;i<7;i++){ const a0=i*(180/7)*Math.PI/180;
        c.globalAlpha=0.25+((i%2)*.3);
        c.beginPath(); c.moveTo(0,0);
        c.quadraticCurveTo(Math.cos(a0)*26*p,-26*p, Math.cos(a0+.3)*26*p,-24*p);
        c.quadraticCurveTo(Math.cos(a0+.15)*15*p,0,0,0);
        c.closePath(); c.fill();
      }
      c.globalAlpha=1;
      c.strokeStyle=col((1-p)*.5); c.lineWidth=0.8; c.beginPath(); c.arc(0,0,26*p,0,6.2832); c.stroke();
      break;
    }
    case 'lensPetals': {
      c.strokeStyle=col(1-p); c.lineWidth=1;
      for(let i=0;i<4;i++){ const a=i*90*Math.PI/180;
        c.save(); c.rotate(a);
        c.beginPath(); c.moveTo(0,-24*p); c.quadraticCurveTo(16*p,0,0,24*p); c.quadraticCurveTo(-16*p,0,0,-24*p); c.stroke();
        c.restore();
      }
      break;
    }
    case 'shadedBall': {
      const R=26*p;
      c.fillStyle=col((1-p)*.15); c.beginPath(); c.arc(0,0,R,0,6.2832); c.fill();
      c.strokeStyle=col((1-p)*.6); c.lineWidth=0.5;
      for(let i=0;i<12;i++){ const x=-R+(i+0.5)*(2*R/12); const hy=Math.sqrt(Math.max(0,R*R-x*x));
        c.beginPath(); c.moveTo(x,-hy); c.lineTo(x,hy); c.stroke(); }
      break;
    }
    case 'ringBow': {
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      for(let i=0;i<5;i++){ const r=(6+i*5)*p; c.globalAlpha=Math.max(0,0.8-i*.12);
        c.beginPath(); c.arc(-r*0.3,-r*0.95,r,Math.PI*1.25,Math.PI*1.75); c.stroke();
        c.beginPath(); c.arc(r*0.3,-r*0.95,r,Math.PI*1.25,Math.PI*1.75); c.stroke();
        c.beginPath(); c.arc(-r*0.3,r*0.95,r,Math.PI*0.25,Math.PI*0.75); c.stroke();
        c.beginPath(); c.arc(r*0.3,r*0.95,r,Math.PI*0.25,Math.PI*0.75); c.stroke();
      }
      c.globalAlpha=1;
      break;
    }
    case 'gemFacet': {
      c.strokeStyle=col(1-p); c.lineWidth=1;
      c.beginPath(); c.moveTo(0,-32*p); c.lineTo(18*p,-18*p); c.lineTo(18*p,8*p); c.lineTo(0,32*p); c.lineTo(-18*p,8*p); c.lineTo(-18*p,-18*p); c.closePath(); c.stroke();
      c.globalAlpha=0.5;
      c.beginPath(); c.moveTo(-18*p,-18*p); c.lineTo(18*p,-18*p); c.stroke();
      c.beginPath(); c.moveTo(-18*p,8*p); c.lineTo(18*p,8*p); c.stroke();
      c.beginPath(); c.moveTo(0,-32*p); c.lineTo(0,32*p); c.stroke();
      c.globalAlpha=1;
      break;
    }
    case 'cuboctahedron': {
      const V=[[-11.31,-6.53],[-11.31,19.6],[11.31,-19.6],[11.31,6.53],[11.31,-6.53],[11.31,19.6],[-11.31,-19.6],[-11.31,6.53],[0,13.06],[22.63,0],[-22.63,0],[0,-13.06]];
      const E=[[0,4],[0,6],[0,8],[0,10],[1,5],[1,7],[1,8],[1,10],[2,4],[2,6],[2,9],[2,11],[3,5],[3,7],[3,9],[3,11],[4,8],[4,9],[5,8],[5,9],[6,10],[6,11],[7,10],[7,11]];
      c.strokeStyle=col(1-p); c.lineWidth=0.7;
      E.forEach(([i,j])=>{ c.beginPath(); c.moveTo(V[i][0]*p,V[i][1]*p); c.lineTo(V[j][0]*p,V[j][1]*p); c.stroke(); });
      break;
    }
    case 'sriYantra': {
      const SRI=[[[-34.68,-9.65],[34.68,-9.65],[0,36]],[[-34.93,8.73],[34.93,8.73],[0,-36]],[[-18.46,25.21],[18.46,25.21],[0,-9.65]],[[-25.82,17.25],[25.82,17.25],[0,-25.88]],[[-21.43,-25.88],[21.43,-25.88],[0,3.84]],[[-24.85,-16.88],[24.85,-16.88],[0,25.21]],[[-12.62,3.84],[12.62,3.84],[0,-16.88]],[[-12.11,-5.65],[12.11,-5.65],[0,17.25]],[[-9.14,-1.87],[9.14,-1.87],[0,8.73]]];
      c.strokeStyle=col(1-p); c.lineWidth=0.45; c.globalAlpha=0.7;
      SRI.forEach(t=>{ c.beginPath(); t.forEach(([x,y],i)=>{ if(i===0)c.moveTo(x*p,y*p); else c.lineTo(x*p,y*p); }); c.closePath(); c.stroke(); });
      c.globalAlpha=1; c.fillStyle=col(1-p); c.beginPath(); c.arc(0,0,1.3,0,6.2832); c.fill();
      break;
    }
    case 'sealNested': {
      const T=[[[0,-34],[29.44,17],[-29.44,17]],[[0,34],[-29.44,-17],[29.44,-17]],[[9.81,-17],[9.81,17],[-19.63,0]],[[-9.81,17],[-9.81,-17],[19.63,0]],[[9.81,-5.67],[0,11.33],[-9.81,-5.67]],[[-9.81,5.67],[0,-11.33],[9.81,5.67]]];
      c.strokeStyle=col(1-p); c.lineWidth=0.7; c.globalAlpha=0.75;
      T.forEach(t=>{ c.beginPath(); t.forEach(([x,y],i)=>{ if(i===0)c.moveTo(x*p,y*p); else c.lineTo(x*p,y*p); }); c.closePath(); c.stroke(); });
      c.globalAlpha=1;
      break;
    }
    case 'girihDecagon': {
      const DEC=[[0,-32],[18.81,-25.89],[30.43,-9.89],[30.43,9.89],[18.81,25.89],[0,32],[-18.81,25.89],[-30.43,9.89],[-30.43,-9.89],[-18.81,-25.89]];
      const MID=[[9.4,-28.94],[24.62,-17.89],[30.43,0],[24.62,17.89],[9.4,28.94],[-9.4,28.94],[-24.62,17.89],[-30.43,0],[-24.62,-17.89],[-9.4,-28.94]];
      c.strokeStyle=col((1-p)*.4); c.lineWidth=0.5;
      c.beginPath(); DEC.forEach(([x,y],i)=>{ if(i===0)c.moveTo(x*p,y*p); else c.lineTo(x*p,y*p); }); c.closePath(); c.stroke();
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      for(let i=0;i<10;i++){ const a=MID[i], b=MID[(i+3)%10];
        c.beginPath(); c.moveTo(a[0]*p,a[1]*p); c.lineTo(b[0]*p,b[1]*p); c.stroke(); }
      break;
    }
    case 'hatTile': {
      const H=[[-17,-4.91],[-34,-14.72],[-28.33,-24.54],[-5.67,-24.54],[0,-14.72],[17,-24.54],[34,-14.72],[28.33,-4.91],[17,-4.91],[17,14.72],[0,24.54],[-5.67,14.72],[-17,14.72]];
      c.fillStyle=col((1-p)*.4);
      c.beginPath(); H.forEach(([x,y],i)=>{ if(i===0)c.moveTo(x*p,y*p); else c.lineTo(x*p,y*p); }); c.closePath(); c.fill();
      c.strokeStyle=col(1-p); c.lineWidth=1; c.stroke();
      c.globalAlpha=.65; c.lineWidth=0.4;
      H.forEach(([x,y])=>{ c.beginPath(); c.moveTo(0,0); c.lineTo(x*p,y*p); c.stroke(); });
      c.globalAlpha=1;
      break;
    }
    case 'hatMetatron': {
      const H=[[-17,-4.91],[-34,-14.72],[-28.33,-24.54],[-5.67,-24.54],[0,-14.72],[17,-24.54],[34,-14.72],[28.33,-4.91],[17,-4.91],[17,14.72],[0,24.54],[-5.67,14.72],[-17,14.72]];
      const M=[[0,0],[14,0],[28,0],[7,12.12],[14,24.25],[-7,12.12],[-14,24.25],[-14,0],[-28,0],[-7,-12.12],[-14,-24.25],[7,-12.12],[14,-24.25]];
      c.strokeStyle=col((1-p)*.5); c.lineWidth=0.7;
      c.beginPath(); H.forEach(([x,y],i)=>{ if(i===0)c.moveTo(x*p,y*p); else c.lineTo(x*p,y*p); }); c.closePath(); c.stroke();
      c.lineWidth=0.15; c.globalAlpha=0.6;
      for(let i=0;i<M.length;i++) for(let j=i+1;j<M.length;j++){ c.beginPath(); c.moveTo(M[i][0]*p*.55,M[i][1]*p*.55); c.lineTo(M[j][0]*p*.55,M[j][1]*p*.55); c.stroke(); }
      c.globalAlpha=1; c.fillStyle=col(1-p);
      M.forEach(([x,y])=>{ c.beginPath(); c.arc(x*p*.55,y*p*.55,1,0,6.2832); c.fill(); });
      break;
    }
    case 'vesicaPiscis': {
      c.strokeStyle=col(1-p); c.lineWidth=1;
      c.beginPath(); c.arc(-14*p,0,24*p,0,6.2832); c.stroke();
      c.beginPath(); c.arc(14*p,0,24*p,0,6.2832); c.stroke();
      break;
    }
    case 'yinyangFlash': {
      const R=30*p;
      c.strokeStyle=col((1-p)*.7); c.lineWidth=0.8; c.beginPath(); c.arc(0,0,R,0,6.2832); c.stroke();
      c.fillStyle=col((1-p)*.7);
      c.beginPath();
      c.arc(0,0,R,Math.PI*0.5,Math.PI*1.5,false);
      c.arc(0,-R/2,R/2,Math.PI*1.5,Math.PI*0.5,true);
      c.arc(0,R/2,R/2,Math.PI*1.5,Math.PI*0.5,false);
      c.closePath(); c.fill();
      break;
    }
    case 'goldenSpiral': {
      const FIB=[{x:0,y:0,s:1},{x:-1,y:0,s:1},{x:-1,y:1,s:2},{x:-4,y:0,s:3},{x:-4,y:-5,s:5},{x:1,y:-5,s:8},{x:-4,y:3,s:13}];
      const SC=1.6*p;
      c.strokeStyle=col(1-p); c.lineWidth=1;
      FIB.forEach(s=>{ const r=s.s*SC, x=s.x*SC, y=-s.y*SC;
        c.beginPath(); c.arc(x,y,r,-Math.PI/2,0); c.stroke(); });
      break;
    }
    case 'apollonian': {
      const A=[{r:33,x:0,y:0},{r:16.5,x:-16.5,y:0},{r:16.5,x:16.5,y:0},{r:11,x:0,y:22},{r:11,x:0,y:-22},{r:5.5,x:16.5,y:22},{r:2.2,x:0,y:8.8},{r:5.5,x:16.5,y:-22},{r:3,x:24,y:18},{r:2.36,x:11.79,y:28.29},{r:1.43,x:11.48,y:17.22},{r:0.94,x:0,y:5.66},{r:0.87,x:2.61,y:10.42},{r:3,x:24,y:-18},{r:2.36,x:11.79,y:-28.29},{r:1.43,x:11.48,y:-17.22}];
      c.strokeStyle=col((1-p)*.5); c.lineWidth=0.5;
      c.beginPath(); c.arc(0,0,A[0].r*p,0,6.2832); c.stroke();
      c.fillStyle=col(1-p); c.globalAlpha=0.35;
      for(let i=1;i<A.length;i++){ c.beginPath(); c.arc(A[i].x*p,A[i].y*p,A[i].r*p,0,6.2832); c.fill(); }
      c.globalAlpha=1;
      break;
    }
    case 'octagram': {
      const OCT=[[0,-32],[22.63,-22.63],[32,0],[22.63,22.63],[0,32],[-22.63,22.63],[-32,0],[-22.63,-22.63]];
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      c.beginPath();
      for(let i=0;i<8;i++){ const q=OCT[(i*3)%8]; if(i===0)c.moveTo(q[0]*p,q[1]*p); else c.lineTo(q[0]*p,q[1]*p); }
      c.closePath(); c.stroke();
      break;
    }
    case 'metatronCube': {
      const M=[[0,0],[14,0],[28,0],[7,12.12],[14,24.25],[-7,12.12],[-14,24.25],[-14,0],[-28,0],[-7,-12.12],[-14,-24.25],[7,-12.12],[14,-24.25]];
      c.strokeStyle=col(1-p); c.lineWidth=0.25;
      for(let i=0;i<M.length;i++) for(let j=i+1;j<M.length;j++){ c.beginPath(); c.moveTo(M[i][0]*p,M[i][1]*p); c.lineTo(M[j][0]*p,M[j][1]*p); c.stroke(); }
      c.fillStyle=col(1-p);
      M.forEach(([x,y])=>{ c.beginPath(); c.arc(x*p,y*p,1.6,0,6.2832); c.fill(); });
      break;
    }
    case 'flowerOfLife': {
      const F19=[[-28,0],[-21,12.12],[-14,24.25],[-21,-12.12],[-14,0],[-7,12.12],[0,24.25],[-14,-24.25],[-7,-12.12],[0,0],[7,12.12],[14,24.25],[0,-24.25],[7,-12.12],[14,0],[21,12.12],[14,-24.25],[21,-12.12],[28,0]];
      c.strokeStyle=col((1-p)*.55); c.lineWidth=0.6;
      F19.forEach(([x,y])=>{ c.beginPath(); c.arc(x*p,y*p,14*p,0,6.2832); c.stroke(); });
      break;
    }
    case 'bowtieTri': {
      c.fillStyle=col((1-p)*.8);
      c.beginPath(); c.moveTo(-20*p,-25*p); c.lineTo(-20*p,25*p); c.lineTo(0,0); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(20*p,-25*p); c.lineTo(20*p,25*p); c.lineTo(0,0); c.closePath(); c.fill();
      break;
    }
    /* 13 «спорных» из этой же партии — владелец проверит вживую и решит по каждой отдельно */
    case 'denseSpokes': {
      c.strokeStyle=col((1-p)*.7); c.lineWidth=0.6;
      for(let i=0;i<11;i++){ const a=i*(180/11)*Math.PI/180;
        c.beginPath(); c.moveTo(-Math.cos(a)*35*p,-Math.sin(a)*35*p); c.lineTo(Math.cos(a)*35*p,Math.sin(a)*35*p); c.stroke(); }
      break;
    }
    case 'convergeBeam': {
      c.strokeStyle=col(1-p); c.lineWidth=0.8; c.globalAlpha=0.75;
      const tip=[22*p,-20*p];
      [[-32,22],[-26,28],[-20,32],[-36,10],[-30,36]].forEach(([x,y])=>{ c.beginPath(); c.moveTo(x*p,y*p); c.lineTo(tip[0],tip[1]); c.stroke(); });
      c.globalAlpha=1;
      break;
    }
    case 'grooveClusters': {
      c.fillStyle=col((1-p)*.12); c.beginPath(); c.arc(0,0,30*p,0,6.2832); c.fill();
      c.strokeStyle=col((1-p)*.6); c.lineWidth=0.4;
      [[-10,-8],[8,-10],[-4,8]].forEach(([cx,cy])=>{ for(let i=0;i<4;i++){ c.beginPath(); c.arc(cx*p,cy*p,(3+i*2.6)*p,0,6.2832); c.stroke(); } });
      break;
    }
    case 'crescentGrooves': {
      c.save();
      c.beginPath(); c.arc(0,0,26*p,Math.PI*0.5,Math.PI*1.5); c.closePath(); c.clip();
      c.strokeStyle=col((1-p)*.7); c.lineWidth=0.6;
      for(let i=0;i<7;i++){ c.beginPath(); c.arc((-6+i*1.5)*p,0,(26-i)*p,0,6.2832); c.stroke(); }
      c.restore();
      c.strokeStyle=col((1-p)*.3); c.lineWidth=1; c.beginPath(); c.arc(0,0,26*p,0,6.2832); c.stroke();
      break;
    }
    case 'gearBurst': {
      c.fillStyle=col((1-p)*.75);
      c.beginPath();
      for(let i=0;i<24;i++){ const a=i*15*Math.PI/180, r=(i%2===0?30:21)*p; const x=Math.cos(a)*r, y=Math.sin(a)*r; if(i===0)c.moveTo(x,y); else c.lineTo(x,y); }
      c.closePath(); c.fill();
      break;
    }
    case 'pinwheelFlower': {
      c.fillStyle=col((1-p)*.8);
      for(let i=0;i<5;i++){ const a=i*72*Math.PI/180;
        c.save(); c.rotate(a);
        c.beginPath(); c.moveTo(0,0); c.quadraticCurveTo(16*p,-10*p,12*p,-26*p); c.quadraticCurveTo(4*p,-12*p,0,0); c.closePath(); c.fill();
        c.restore();
      }
      break;
    }
    case 'pieMill': {
      c.fillStyle=col((1-p)*.65);
      for(let i=0;i<8;i+=2){ const a0=i*45*Math.PI/180, a1=a0+45*Math.PI/180;
        c.beginPath(); c.moveTo(0,0); c.arc(0,0,30*p,a0,a1); c.closePath(); c.fill(); }
      c.strokeStyle=col((1-p)*.4); c.lineWidth=0.6; c.beginPath(); c.arc(0,0,30*p,0,6.2832); c.stroke();
      break;
    }
    case 'plainHex': {
      c.fillStyle=col((1-p)*.7);
      c.beginPath();
      for(let i=0;i<6;i++){ const a=i*60*Math.PI/180; const x=Math.cos(a)*22*p, y=Math.sin(a)*22*p; if(i===0)c.moveTo(x,y); else c.lineTo(x,y); }
      c.closePath(); c.fill();
      break;
    }
    case 'diamondWave': {
      c.fillStyle=col(1-p);
      for(let i=0;i<7;i++){ const x=(i*9-20)*p, y=(26-i*8)*p, sz=9*p;
        c.globalAlpha=Math.max(0,0.3+i*.09);
        c.save(); c.translate(x,y); c.rotate(0.7854); c.fillRect(-sz/2,-sz/2,sz,sz); c.restore();
      }
      c.globalAlpha=1;
      break;
    }
    case 'barMosaic': {
      c.strokeStyle=col(1-p); c.lineCap='round';
      for(let i=0;i<11;i++){ const t=i/10, x=(i*6-30)*p, h=(6+Math.sin(t*Math.PI)*22)*p;
        c.globalAlpha=Math.max(0,0.45+Math.sin(t*Math.PI)*.4); c.lineWidth=2.6;
        c.beginPath(); c.moveTo(x,-h/2); c.lineTo(x,h/2); c.stroke();
      }
      c.globalAlpha=1;
      break;
    }
    case 'triMandala': {
      c.fillStyle=col(1-p);
      [10,17,24,31].forEach((r,ri)=>{ const cnt=8+ri*4;
        c.globalAlpha=Math.max(0,0.75-ri*.13);
        for(let i=0;i<cnt;i++){ const a=i*(6.2832/cnt);
          c.beginPath();
          c.moveTo(Math.cos(a)*r*p,Math.sin(a)*r*p);
          c.lineTo(Math.cos(a+.25)*(r+5)*p,Math.sin(a+.25)*(r+5)*p);
          c.lineTo(Math.cos(a-.25)*(r+5)*p,Math.sin(a-.25)*(r+5)*p);
          c.closePath(); c.fill();
        }
      });
      c.globalAlpha=1;
      break;
    }
    case 'reuleaux': {
      const T=[[0,-28.8],[24.94,14.4],[-24.94,14.4]];
      c.strokeStyle=col(1-p); c.lineWidth=1; c.globalAlpha=0.85;
      for(let i=0;i<3;i++){
        const a=T[(i+1)%3], b=T[(i+2)%3], cx=T[i][0]*p, cy=T[i][1]*p;
        const ang1=Math.atan2(a[1]*p-cy,a[0]*p-cx), ang2=Math.atan2(b[1]*p-cy,b[0]*p-cx);
        c.beginPath(); c.arc(cx,cy,49.88*p,ang1,ang2); c.stroke();
      }
      c.globalAlpha=1;
      break;
    }
    case 'dodecagram': {
      const DOD=[[0,-32],[16,-27.71],[27.71,-16],[32,0],[27.71,16],[16,27.71],[0,32],[-16,27.71],[-27.71,16],[-32,0],[-27.71,-16],[-16,-27.71]];
      c.strokeStyle=col(1-p); c.lineWidth=0.6;
      c.beginPath();
      for(let i=0;i<12;i++){ const q=DOD[(i*5)%12]; if(i===0)c.moveTo(q[0]*p,q[1]*p); else c.lineTo(q[0]*p,q[1]*p); }
      c.closePath(); c.stroke();
      break;
    }
    /* 05.09.2026 «Суперформула Гилиса» — r(φ)=(|cos(m·φ/4)|^n2+|sin(m·φ/4)|^n3)^(-1/n1).
       ОДНА функция на все 8 записей каталога — отличаются только 4 числа в SFP. Источник
       чисел — Paul Bourke (paulbourke.net/geometry/supershape), не подобраны на глаз; полная
       теория и честные пределы формулы (что она физически не может нарисовать) — в
       .knowledge/GENERATIVE-GEOMETRY.md. Каждая фигура проверена глазами (не только
       численно на незамкнутость/NaN) до попадания сюда — тот самый урок этой же партии. */
    case 'sfRomb': case 'sfStarfish': case 'sfBlossom': case 'sfUrchin':
    case 'sfPebble': case 'sfSlab': case 'sfShield': case 'sfCrown': {
      const SFP={sfRomb:[4,1,1,1], sfStarfish:[5,0.1,1.7,1.7], sfBlossom:[6,3,8,8],
        sfUrchin:[8,0.3,0.3,0.3], sfPebble:[6,40,10,10], sfSlab:[4,1000,1000,1000],
        sfShield:[3,60,55,30], sfCrown:[14,30,30,30]};
      const [sm,sn1,sn2,sn3]=SFP[style];
      const N=64, R=30*p;
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      c.beginPath();
      for(let i=0;i<=N;i++){
        const phi=i/N*6.2832;
        const t1=Math.pow(Math.abs(Math.cos(sm*phi/4)),sn2);
        const t2=Math.pow(Math.abs(Math.sin(sm*phi/4)),sn3);
        const r=Math.pow(t1+t2,-1/sn1)*R;
        const x=r*Math.cos(phi), y=r*Math.sin(phi);
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.closePath(); c.stroke();
      break;
    }
    /* 05.09.2026 «Розы Родонеи» — r=cos(k·θ) в полярных координатах (Гвидо Гранди,
       1723-28). k нечётное даёт k лепестков за один оборот, k чётное — 2k лепестков за
       два оборота (иначе половина лепестков не дорисуется — проверено численно, замыкание
       ровно при 2 периодах для чётных k). ОДНА функция на все 7 записей — отличается
       только k в ROSE_K. См. .knowledge/GENERATIVE-GEOMETRY.md. */
    case 'roseClover': case 'roseTrefoil': case 'roseRosette': case 'rosePetals5':
    case 'roseChrysanthemum': case 'roseSeven': case 'roseFan': {
      const ROSE_K={roseClover:2, roseTrefoil:3, roseRosette:4, rosePetals5:5,
        roseChrysanthemum:6, roseSeven:7, roseFan:8};
      const k=ROSE_K[style];
      const N=90, R=32*p, periods=(k%2===0?2:1);
      c.strokeStyle=col(1-p); c.lineWidth=0.8;
      c.beginPath();
      for(let i=0;i<=N*periods;i++){
        const theta=i/N*Math.PI*2;
        const r=Math.cos(k*theta)*R;
        const x=r*Math.cos(theta), y=r*Math.sin(theta);
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.closePath(); c.stroke();
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
/* 04.09.2026 «Подороже — подольше»: раньше окно было одно на всех (.45с) — владелец
   попросил, чтобы более дорогие вспышки держались чуть дольше. flashDur() — линейная
   растяжка по цене (500→.45с, 1500→.75с, промежуточные тарифы 700/900/1200 —
   .51/.57/.66с), проверено числовым скриптом до правки (не на глаз). Бесплатные (price:0,
   ANGAR_FREEBIE) остаются на базовых .45с — та же формула, отрицательная доля клампится в 0. */
function flashDur(price){
  return .45 + Math.min(1, Math.max(0, ((price||0)-500)/1000))*.3;
}
function drawLaunchFlash(){
  // 29.08.2026: было S.flash — уже занято золотой вспышкой подбора звезды (см. выше в этом
  // файле, ~строка 1280), которая перетирала это значение каждый кадр. Переименовано.
  if(!S.launchFx) return;
  const fl=FLASHES_BY_ID.get(S.launchFx); if(!fl || fl.style==='none') return;
  const dur=flashDur(fl.price);
  if(S.time>=dur) return;
  const skin=SKINS[S.skin]||SKINS[0];
  const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1); // 'rgba(r,g,b,' — тот же приём, что уже в drawPlane для ауры
  const col=a=>base+Math.max(0,a).toFixed(2)+')';
  const p=clamp(S.time/dur,0,1);
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
  const tr=(typeof TRAILS_BY_ID!=='undefined'?TRAILS_BY_ID.get(S.trail):null)||{style:''}; // 05.09.2026: след — независимый выбор, не от скина
  const trailFx=tr.style||'';
  const STRUCTURED_TRAILS=['ribbon','pearls','loopKnot','snakeWave','heartKnot','trailConstellation','paperclip','rainbowArc','waterWaves','celticTwist','celticBraid']; // 05.09.2026: расширено — связные следы, не только 2 премиум
  if(hq && STRUCTURED_TRAILS.includes(trailFx)){
    drawStructuredTrail(trailFx,skin.trail,nowMs);
    if(S.running&&!S.paused){ trailHistBuf.push({x:p.x,y:p.y}); if(trailHistBuf.length>28) trailHistBuf.shift(); }
  }
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
    // 04.09.2026 (владелец, живьём): обводка шла только по 2 верхним рёбрам (нос→крыло),
    // нижние два (крыло→вырез хвоста) не обводились вообще — контур «обрывался» на глаз.
    // Добавлены все 4 ребра, касается ВСЕХ скинов, не только премиум.
    ctx.strokeStyle='rgba(255,255,255,.32)'; ctx.lineWidth=1.1;
    ctx.beginPath();
    ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.moveTo(0,-22); ctx.lineTo(16,14);
    ctx.moveTo(-16,14); ctx.lineTo(0,6); ctx.moveTo(0,6); ctx.lineTo(16,14);
    ctx.stroke();
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
  /* 04.09.2026 «Премиум-скины за Stars»: 6 приёмов корпуса, каждый под свой Stars-скин
     (id ещё не назначены — см. project_premium_skins_visual_language в памяти). Отобраны
     живьём владельцем через макет, гейтятся по hq той же дисциплиной, что Неон/Хром/Плазма
     выше — на слабых устройствах (Q.level<2) премиум-скин по-прежнему покупается и носится,
     просто без этой добавки, как и любой другой fx-скин сейчас. */
  if(hq && fx==='satellites'){ // Спутники: 3 орбитальные точки + мощный кристалл на носу и на хвосте
    let nearTop=0, nearBottom=0;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){
      const ph=nowMs/900+i*2.094;
      const ox=Math.cos(ph)*22, oy=-2+Math.sin(ph)*12;
      const r=2.6+0.8*Math.sin(nowMs/300+i);
      const g=ctx.createRadialGradient(ox,oy,0,ox,oy,r*2.2);
      g.addColorStop(0,skin.trail+'.95)'); g.addColorStop(1,skin.trail+'0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(ox,oy,r*2.2,0,6.283); ctx.fill();
      const a=((ph%6.283)+6.283)%6.283;
      // верх орбиты (ph≈4.71) — рядом с носом; низ (ph≈1.5708) — рядом с хвостом
      const topDist=Math.abs(a-4.71);
      nearTop=Math.max(nearTop, Math.max(0,1-topDist/0.4));
      const botDist=Math.abs(a-1.5708);
      nearBottom=Math.max(nearBottom, Math.max(0,1-botDist/0.4));
    }
    ctx.restore();
    // «меняем цветочек на мощный кристалл, на нос и назад... пусть оба мигают, когда шары
    // мимо проходят» (владелец) — два кристалла на точках орбиты, где реально пролетают
    // шары, каждый мигает от СВОЕГО прохода
    drawMightyCrystal(ctx,skin.trail,0,-15,2.6,nearTop*.85);
    drawMightyCrystal(ctx,skin.trail,0,7,2.2,nearBottom*.85);
  }
  if(hq && fx==='facets'){ // Грани: огранка с бегущим бликом-разверткой + камень в точке схода
    const cyc=2200;
    const sweep=-26+((nowMs%cyc)/cyc)*52;
    FACET_PARTS.forEach(f=>{
      ctx.fillStyle=skin.trail+f.base+')';
      ctx.beginPath(); ctx.moveTo(f.pts[0][0],f.pts[0][1]); ctx.lineTo(f.pts[1][0],f.pts[1][1]); ctx.lineTo(f.pts[2][0],f.pts[2][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle=skin.trail+'.5)'; ctx.lineWidth=.5; ctx.stroke();
      const glint=Math.max(0,1-Math.abs(f.cx-sweep)/7);
      if(glint>0.02){
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.fillStyle='rgba(255,255,255,'+(glint*glint*0.9).toFixed(2)+')';
        ctx.beginPath(); ctx.moveTo(f.pts[0][0],f.pts[0][1]); ctx.lineTo(f.pts[1][0],f.pts[1][1]); ctx.lineTo(f.pts[2][0],f.pts[2][1]); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    });
    const centerGlint=Math.max(0,1-Math.abs(sweep)/7);
    drawSkinGem(ctx,skin,0,8,1.6,centerGlint*.9);
    // «по задним граням будут драгоценности, в дополнение к той что уже по середине, и на
    // острие носа добавится» (владелец) — камни в носу и на обоих кончиках крыльев
    drawSkinGem(ctx,skin,CORNER_NOSE[0],CORNER_NOSE[1],1.2,0);
    drawSkinGem(ctx,skin,CORNER_LWING[0],CORNER_LWING[1],1.1,0);
    drawSkinGem(ctx,skin,CORNER_RWING[0],CORNER_RWING[1],1.1,0);
  }
  if(hq && fx==='inlay'){ // Инкрустация: камни в корпусе + на кончиках крыльев; оправа от вершины носа
    // (0,-22) ровно по кромке крыла до камней [1]/[2] — не наискось через корпус.
    metalStroke(ctx, c=>{
      c.moveTo(0,-22); c.lineTo(GEM_SLOTS[1].x,GEM_SLOTS[1].y);
      c.moveTo(0,-22); c.lineTo(GEM_SLOTS[2].x,GEM_SLOTS[2].y);
    }, .75, .4);
    const cyc=2400;
    // «на конце крыльев камни, что будут мигать» — WINGTIP_SLOTS добавлены к основным
    GEM_SLOTS.concat(WINGTIP_SLOTS).forEach(gm=>{
      const ph=((nowMs+gm.ph*400)%cyc)/cyc;
      const glint=Math.max(0,1-Math.abs(ph-0.15)/0.12);
      drawSkinGem(ctx,skin,gm.x,gm.y,gm.r,glint);
    });
  }
  if(hq && fx==='filigree'){ // Филигрань: гравировка по кромке, искра бежит от камня в носу по обеим сторонам разом
    /* 04.09.2026 (владелец, живьём — «доходит, камень не загорается»): проверено расчётом
       фаз, не на глаз — старая формула ph=(ei*6+i)/12 давала правой и левой кромке РАЗНЫЕ
       несовпадающие окна, а камень в носу мигал по своей отдельной формуле (nowMs/1800%1<
       0.2), никак не привязанной к пробегу вообще: правая кромка «доходила» до носа на
       42% цикла, камень к этому моменту уже гас на 20% раньше — разрыв в 22% цикла.
       Починка: искра стартует ИЗ камня (C=0) и одновременно бежит по обеим кромкам
       наружу — один физический источник времени (C) на всё, задержка насечки = f*0.5. */
    ctx.save(); ctx.globalCompositeOperation='lighter';
    metalStroke(ctx, c=>{ c.moveTo(0,-22); c.lineTo(-16,14); c.moveTo(0,-22); c.lineTo(16,14); }, .55, .35);
    const cyc=1800;
    const C=(nowMs/cyc)%1;
    FIL_MARKS.forEach(m=>{
      metalStroke(ctx, c=>{ c.moveTo(m.x,m.y); c.lineTo(m.x+m.ux*1.6,m.y+m.uy*1.6); }, .7, .4);
      const local=C-m.f*0.5;
      const glint=(local>=0&&local<0.18)?Math.max(0,1-local/0.18):0;
      if(glint>0.02){
        ctx.fillStyle='rgba(255,255,255,'+glint.toFixed(2)+')';
        ctx.beginPath(); ctx.arc(m.x+m.ux*.8,m.y+m.uy*.8,.9*glint+.2,0,6.283); ctx.fill();
      }
    });
    ctx.restore();
    const noseGlint=Math.max(0,1-C/0.15);
    drawSkinGem(ctx,skin,0,-16,1.4,noseGlint*.85);
  }
  if(hq && fx==='core'){ // Ядро: гранёный реактор в оправе-кольце + хребет от хвоста до носа + камни на крыльях
    // хребет от хвоста (0,6) до самого носа (0,-22) с бегущей точкой
    metalStroke(ctx, c=>{ c.moveTo(0,-22); c.lineTo(0,6); }, .6, .4);
    const spineT=(nowMs/2000)%1;
    const sy=-22+28*spineT;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(255,255,255,'+(Math.sin(spineT*Math.PI)*.8).toFixed(2)+')';
    ctx.beginPath(); ctx.arc(0,sy,.9,0,6.283); ctx.fill();
    ctx.restore();
    // камни на крыльях вспыхивают ровно в момент, когда бегущая точка доходит до конца хребта
    const wingGlint=Math.max(0,1-(1-spineT)/0.15);
    drawSkinGem(ctx,skin,-9,9,1.3,wingGlint);
    drawSkinGem(ctx,skin,9,9,1.3,wingGlint);
    ctx.save(); ctx.translate(0,2);
    // гранёная оправа-кольцо вокруг реактора — тёплый металл, не тон скина (была та же
    // ошибка «сливается», что у Инкрустации)
    metalStroke(ctx, c=>{
      for(let i=0;i<6;i++){ const a=i*Math.PI/3; const px=Math.cos(a)*5.4, py=Math.sin(a)*5.4; i===0?c.moveTo(px,py):c.lineTo(px,py); }
      c.closePath();
    }, .7, .4);
    ctx.strokeStyle=skin.trail+'.45)'; ctx.lineWidth=.4;
    ctx.beginPath(); ctx.arc(0,0,3.3,0,6.283); ctx.stroke();
    ctx.globalCompositeOperation='lighter';
    const pulse=0.5+0.5*Math.sin(nowMs/500);
    const coreR=1.6+pulse*.5;
    ctx.fillStyle='rgba(255,255,255,'+(0.5+0.4*pulse).toFixed(2)+')';
    ctx.beginPath(); ctx.moveTo(0,-coreR); ctx.lineTo(coreR*.6,0); ctx.lineTo(0,coreR); ctx.lineTo(-coreR*.6,0); ctx.closePath(); ctx.fill();
    if(pulse>0.85){
      const rayA=(pulse-0.85)/0.15;
      ctx.strokeStyle=skin.trail+(rayA*.8).toFixed(2)+')'; ctx.lineWidth=.5;
      for(let i=0;i<4;i++){
        const ang=i*(Math.PI/2)+Math.PI/4;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang)*2,Math.sin(ang)*2); ctx.lineTo(Math.cos(ang)*(4+rayA*3),Math.sin(ang)*(4+rayA*3)); ctx.stroke();
      }
    }
    ctx.restore();
  }
  if(hq && fx==='aim'){ // Прицел: HUD-скобки вращаются, на захвате сами фокусируются — подлетают ближе и раскрываются шире
    let anyLock=0;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    const rot=nowMs/2600;
    for(let i=0;i<4;i++){
      const ang=rot+i*(Math.PI/2);
      const top=((ang-Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
      const distToTop=Math.min(top,Math.PI*2-top);
      const lock=Math.max(0,1-distToTop/0.35);
      const R=26-lock*7, spread=4+lock*3;
      ctx.save(); ctx.rotate(ang);
      ctx.strokeStyle=lock>0.02?'rgba(255,255,255,'+(0.8+lock*0.2).toFixed(2)+')':skin.trail+'.8)';
      ctx.lineWidth=1+lock*.8;
      ctx.beginPath(); ctx.moveTo(-R,-6); ctx.lineTo(-R,-6-spread); ctx.lineTo(-R+spread,-6-spread); ctx.stroke();
      anyLock=Math.max(anyLock,lock);
      ctx.restore();
    }
    ctx.restore();
    // по камню на каждом углу крыла + свой «наконечник» в носу (не общий камень со всеми
    // остальными), крупнее и ярче отзывается на скобку, когда та проходит мимо
    drawSkinGem(ctx,skin,-14,12,1.1,0);
    drawSkinGem(ctx,skin,14,12,1.1,0);
    drawSpearGem(ctx,skin.trail,0,-17,2.6,anyLock*.9);
  }
  if(hq) drawPremiumFx2(ctx, skin, fx, nowMs); // 05.09.2026: 30 доп. премиум-скинов, единая точка входа — см. определение выше
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
