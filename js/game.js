'use strict';
/* ============================================================
   GAME: состояние, пулы (с капами), спавн, логика, коллизии, HUD.
   Зависит от core.js и input.js.
   ============================================================ */
/* Глоссарий коротких глобалов (см. также core.js) — переименование отклонено 22.08.2026:
     S  — центральное состояние забега, объявлено ниже. Ключевые поля: running/paused,
          score/combo/comboMax, speed/dist, lives/shield/magnet/slowmo/dash, timeScale,
          mode ('classic'|...), skin/hueShift, gyroSec/manSec. Полный список — в самом
          объявлении const S={...} чуть ниже.
     Q  — профиль качества графики (render.js). AC — AudioContext (core.js). */

/* ---------- Кэш DOM-ссылок (не дёргаем getElementById в тиках) ---------- */
const elScore=$('score'), elCombo=$('combo'), elLivesC=$('livesCanvas'),
      elPillStarsN=$('pillStarsN'), elDistN=$('distN'),
      elBanner=$('banner'), elVignette=$('vignette'),
      // v1.282.21: табло дисциплин искалось getElementById В КАЖДОМ КАДРЕ Спидрана, Трассы дня,
      // Театра и Своей трассы — при том, что шапка этого файла прямо запрещает такое в тиках.
      // Остальные узлы HUD честно закэшированы с самого начала, эти два забыли.
      elModeHud=$('modeHud'), elSmoothFill=$('smoothFill');

/* ---------- Пулы объектов с капом (Блок 3, без GC-лагов и без утечек) ---------- */
const POOL_CAP=64, PARTICLE_CAP=(typeof isAndroidGo==='function'&&isAndroidGo())?120:220; // v1.108.1: Go Edition — площе лимит памяти на вкладку, меньше частиц одновременно
function makePool(){ const free=[]; return {
  take(){ return free.pop()||{}; },
  give(o){ if(free.length<POOL_CAP) free.push(o); }
}; }
const poolOb=makePool(), poolStar=makePool(), poolPow=makePool(), poolPart=makePool(), poolPop=makePool();
function killIdx(arr,i,pool){ pool.give(arr[i]); const l=arr.length-1; arr[i]=arr[l]; arr.pop(); }

/* ---------- Состояние ---------- */
const SKINS=[ // v1.44.0: палитра разведена по цветовому кругу — соседи больше не близнецы
  /* v1.282.20 «Магазин снова закрыт»: временные цены сняты. С v1.46.0 здесь стояла заглушка
     «все скины по 10 ✦ — проверка перед релизом», и она пережила 236 версий. Итог: награды за
     достижения (130 ✦) превышали стоимость ВСЕЙ коллекции (80 ✦) — игрок открывал магазин
     целиком, не сделав ни одного забега, и весь смысл копить звёзды исчезал. Возвращены
     авторские тир-цены: 150/400/800 — стандартные (только цвет), 1500/2500/4000 — яркие
     (фирменная фишка), 7000/12000 — легендарные (уникальное поведение корпуса). */
  // Тир 1 — стандартные: только цвет (никаких фишек — правило №1)
  {id:0,name:0,price:0,   body:'#efeee9',fold:'#cdcabf',glow:'rgba(230,229,225,.9)',trail:'rgba(200,198,190,'}, // Бумажный — нейтральная бумага
  {id:1,name:1,price:150,   body:'#d6e8ff',fold:'#9cc0ee',glow:'rgba(96,164,255,.95)',trail:'rgba(96,164,255,'},   // Лазурь — чистый синий (не циан!)
  {id:2,name:2,price:400,   body:'#fff3c8',fold:'#ecd38a',glow:'rgba(255,226,85,.95)', trail:'rgba(255,226,85,'},  // Золото — жёлтое золото (тон 50°)
  {id:3,name:3,price:800,   body:'#ffd9dd',fold:'#e88a96',glow:'rgba(255,80,95,.95)',  trail:'rgba(255,80,95,'},    // Алый — настоящий красный
  // Тир 2 — яркие: фирменная фишка + богатый след (только визуал, никаких бонусов!)
  {id:4,name:4,price:1500,   fx:'neon',   body:'#e4ffd6',fold:'#9fe081',glow:'rgba(120,255,80,.95)', trail:'rgba(120,255,80,'}, // Неон — кислотно-зелёный
  {id:5,name:5,price:2500,   fx:'aurora', body:'#e6dcff',fold:'#b0a0e8',glow:'rgba(170,130,255,.95)',trail:'rgba(160,120,255,'}, // Аврора — фиолет
  {id:6,name:6,price:4000,   fx:'plasma', body:'#ffe4cc',fold:'#f09c62',glow:'rgba(255,135,60,.95)', trail:'rgba(255,125,55,'}, // Плазма — глубокий апельсин (тон 23°)
  // Тир 3 — легендарные: уникальное поведение корпуса
  {id:7,name:7,price:7000,   fx:'chrome', body:'#eceff3',fold:'#a7aeba',glow:'rgba(196,200,208,.95)',trail:'rgba(175,182,196,'}, // Хром — нейтральная сталь
  {id:8,name:8,price:12000,  fx:'ghost',  body:'#d8f4fa',fold:'#9cd8e4',glow:'rgba(130,235,245,.9)', trail:'rgba(120,225,240,'}  // Призрак — ледяной циан (тон 185°, единственный!)
];
const S = {
  running:false, paused:false, score:0, best:0, wallet:0,
  mission:1, lives:3, invuln:0, // волна — событие; шаг до неё считает waveDistTarget (v1.31.0)
  speed:3.4, dist:0, combo:0, comboMax:0, starsCollected:0,
  shield:0, magnet:0, slowmo:0, dash:0, time:0, flash:0, shake:0, timeScale:1, bullet:false, bt:0, // v1.40.0 «Шесть жестов»: классика + Таран (dash) + Сверхновая; time — часы полёта для лотереи
  mode:'classic', hits:0, bonuses:0, // v1.42.0 «Пять дисциплин»: режим забега + счётчики паспорта (v1.70.0: Пакт и «Без ударов» удалены)
  dying:0, dyingT:0, pausing:0, // «Склейка»: slow-mo занавес смерти / плавная остановка паузы
  smooth:1, // Smooth Flight: плавность пилотирования 0.5..1.0 → финальный множитель 0.75..1.0
  hueShift:0, skin:0, ownedSkins:[0],
  gyroSec:0, manSec:0 // секунды руления гироскопом / пальцем-мышью-клавишами
};
const plane = { x:0, y:0, vx:0, vy:0, bank:0, r:16 };
let obstacles=[], stars=[], powerups=[], particles=[], bgStars=[], popups=[];
let spawnT=0, starT=0, powT=0;
let lastScoreShown=-1, lastDistShown=-1; // чтобы не писать в DOM без изменений

/* ---------- Профиль игрока: счётчики для статистики и достижений (модуль ach.js) ---------- */
let Stats = {games:0,deaths:0,totalStars:0,nearMiss:0,
  totalDist:0,bestCombo:0,bestWave:0,bulletRuns:0,
  perfectRuns:0,gGames:0,tGames:0,bGames:0,kGames:0,e42:0,e9000:0,e1337:0,recBeats:0,duelsSent:0,duelsWon:0}; // v1.282.5: kGames — своя же сегодняшняя регрессия, ++ на undefined давал NaN навсегда с первой игры на клавиатуре, найдена аудитом
function saveStats(){ Store.set('stats',Stats); }

function initBg(){
  bgStars=[];
  for(let i=0;i<140;i++) bgStars.push({x:Math.random(),y:Math.random(),z:rand(.2,1),s:rand(.5,1.8)}); // v1.38.0: 140 — «Ультра» рисует все, остальные ступени первые 90 (эталон)
}
initBg();

/* ================= СПАВН ================= */
function difficulty(){ // волна + полёт; ранний ramp делает первые секунды живыми, затем затухает
  if (S.mode==='custom' && S.customFlat) return Math.min(1, (S.customW-1)*0.20); // «Ровный жар» (v1.69.0): без разгона по дистанции
  const base=(S.mission-1)*0.20 + S.dist/6000;
  const opening=.62*(1-Math.exp(-S.dist/100))*Math.exp(-S.dist/900); // к ~5с даёт живой темп, к поздней игре почти исчезает
  return Math.min(1, base+opening); }
const SR_GOAL=10000; // Спидран: цель по очкам — решение режиссёра (v1.42.0)
function fmtTime(t){ const m=Math.floor(t/60), sec=t-m*60; return m+':'+(sec<10?'0':'')+sec.toFixed(1); } // хронометраж паспорта и спидрана
/* v1.282.24 (партия 23): волна на минуте была 6, стала 5 после честных правок партий 8
   (волну общего неба двигает только дистанция) и 10 (убрана дыра — щит давал бесплатные
   очки за риск) — бот-замер это подтвердил числом, не ощущением. Владелец выбрал: «поднять
   шаг волны на 10-15%», не трогая ни детерминизм общего неба, ни закрытую дыру щита.
   WAVE_PACE сокращал дистанцию до каждой следующей волны равномерно на 12.5%.
   v1.284.17 (партия 45, решение владельца 0б): множитель убран вместе с «Дыханием неба».
   Он опирался на телеметрию, которая тогда же оказалась негодной (почти все смерти в выборке —
   с одного тестового устройства). Очная ставка приборами против 1.108.0 показала: небо стало
   реже на 12.7%, а треть пути пустая — два изменения тянули игру в разные стороны и в сумме
   дали скуку. Возврат ровно в 1.108.0: шаг волны 400,500,600…1000 м без множителя. Дальше
   сложность меняется по одному осознанному шагу, а не остатком чужой правки. */
function waveDistTarget(m){ return m<=7 ? 300*m+50*m*(m+1) : 4900+1000*(m-7); } // накопленная дистанция перехода: шаг 400,500,600…1000 м (v1.31.0)
const GYRO_ASSIST=.85; // «Страховка штурвала» (v1.31.0): наклон — непрямое управление, окно уклонения
// физически короче. Пока рулишь гироскопом — мир на 15% медленнее, преграды реже на ту же долю
// (шаг в метрах сохраняется). Честно: рекорды гироскопа соревнуются только с гироскопом.
// Неуязвимость не трогаем — 2.2 с для всех (решение режиссёра).

// категория рекорда забега: «чистый гироскоп» — наклон реально рулил, а пальцем/
// мышью/клавишами помогали меньше секунды за весь забег (случайные касания
// уже отсеяны фильтром «тап vs свайп», так что всё остальное — осознанная помощь)
function controlMode(){
  if (S.gyroSec>0 && S.manSec<1) return 'gyro';
  // v1.280.0 «Честная клавиатура»; v1.282.20: и мышь тоже не тонет в «касании» —
  // у неё пиксельная точность и мгновенный переброс курсора, это другой способ игры.
  const ms=S.mouseSec||0;
  if (ms>S.touchSec && ms>=S.keysSec) return 'keys'; // мышь судим вместе с клавиатурой: обе — «не палец»
  return (S.keysSec>S.touchSec) ? 'keys' : 'touch';
}

const MAXOB=14; // мягкий кап поля — ни на какой волне экран не переполняется
/* v1.99.9 «Протокол seed»: небо играет в эталонном коридоре 390 мер по центру поля.
   Один сид — одна геометрия на любом экране: раньше x тянулся за шириной
   (x=mapRand(30,W-30)), и одно небо на широком экране рассыпалось реже —
   статистически легче. Теперь спавн и самолётик — всегда в коридоре: нет ни
   растяжения, ни «безопасной полосы» у края, ни в одном режиме.
   v1.108.1 «Честный коридор для всех»: раньше корридор был только у зачётных
   небес (трасса дня, театр), Классика и Таран летали во всё небо — статистика
   из абзаца выше бьёт по ним ровно так же, разница была не по смыслу, а по
   спешке. Теперь одно правило на все режимы — так и было задумано изначально. */
function fieldL(){ return Math.max(0,(W-390)/2); }
function fieldW(){ return 390; }
/* v1.282.20: у коридора чести появилась ВЕРТИКАЛЬ. Горизонталь честно жила в 390 мерах,
   а всё вертикальное (потолок и пол самолётика, точка старта, цель пальца, нормировка
   ленты призрака) меряло H — то есть высоту конкретного экрана. H по построению не
   меньше 844, но у вытянутых телефонов доходит до 910: игрок на 21:9 видел небо на 8.5%
   дальше и получал +0.13с на реакцию — половину человеческого времени отклика — просто
   за форму устройства. Теперь вертикаль такая же эталонная, как горизонталь; лишняя
   высота остаётся небом сверху и снизу. */
function fieldT(){ return Math.max(0,(H-844)/2); }
function fieldH(){ return 844; }
/* v1.282.13: добавка к паузе возвращается наружу, а не пишется в spawnT изнутри.
   Прежняя строка spawnT += .4 в ветке ворот была мёртвым кодом: вызывающий код
   БЕЗУСЛОВНО присваивает spawnT сразу после возврата, затирая прибавку. Задуманная
   передышка после ворот не работала ни разу — за воротами вплотную могла встать
   следующая преграда, и связка выходила несправедливо плотной. */
/* v1.284.17 «Небо не задерживает дыхание» (партия 45, решение владельца 0б).
   Здесь жили lullCurve()/lullMul() из партии 26 — «Дыхание неба», колокол по синусу,
   удлинявший паузу между спавнами почти вдвое на окне 320 м каждые 1100 м, и «крючок
   открытия» партии 28, который выключал его до первой волны.
   Почему убрано целиком, а не подкручено: владелец сказал «скучно» и прислал 1.108.0 как
   эталон. Очная ставка приборами (tests/ochnaya-stavka.mjs против /root/v1108) перевела
   ощущение в числа и подтвердила его правоту — 227 спавнов на 5000 м против 260, треть пути
   в передышке, при том что difficulty() в обеих сборках одна и та же и потолок на 2000 м
   был и там. Значит скука шла не от потолка сложности, а от пустоты.
   Закон 10: это изменение баланса, а не уборка. Цена названа вслух — контраста пиков и
   затиший в игре снова нет; но точка отсчёта важнее контраста, потому что следующие шаги
   (потолок difficulty, первая минута) обязаны мериться от известного состояния.
   Страж 102 перевёрнут под это и требует, чтобы обеих функций не было даже следом. */
function spawnObstacle(){
  let extraGap = 0;
  if (obstacles.length>=MAXOB) return extraGap;
  const d = difficulty(), m = S.mission, kindWave=m+(S.dist>=120?1:0)+(S.dist>=300?1:0), fl = fieldL(), fw = fieldW();
  const x = fl + mapRand(30, fw-30);
  const vy = S.speed * mapRand(.9,1.25);
  // веса видов эталона (возврат v1.30.0): каждая волна — событие, новый вид в поле
  const w = [ ['rock',42], ['debris',28], ['drift', kindWave>=2?14:0], ['mine',10],
              ['sat', kindWave>=3?8:0], ['comet', kindWave>=4?6:0], ['seeker', kindWave>=5?6:0], ['gate', kindWave>=6?5:0] ];
  if (S.mode==='custom' && S.customE){ // Своя трасса (v1.68.0): только виды, выбранные автором (порядок = FORGE_KINDS)
    /* v1.282.13: выбор автора сильнее волнового гейта. Маска умела только гасить, а поднять
       вес, уже обнулённый условием m>=N, не могла — поэтому автор, собравший трассу из одних
       Ворот (гейт m>=6) и поставивший «Ровный жар» с низкой стартовой жарой, получал небо из
       одних камней НАВСЕГДА: при customFlat волна не растёт, значит гейт не откроется никогда,
       все веса остаются нулями и срабатывает страховка на камень. В обычном режиме беда
       сама лечилась по мере роста волн, поэтому и не бросалась в глаза. */
    const BASE=[42,28,14,10,8,6,6,5]; // те же веса, но без волнового гейта — воля автора вместо календаря
    for(let i=0;i<w.length;i++){
      if(!(S.customE>>i&1)) w[i][1]=0;
      else if(w[i][1]===0 && !S.customWG) w[i][1]=BASE[i]||0; // автор позвал этот вид явно — гейт снят. v1.282.15: только для кодов поколения 3; у розданных раньше расстановка обязана остаться прежней. BASE[i]||0 — страховка на случай, если в w добавят вид, а сюда забудут
    }
    if(!w.some(e=>e[1]>0)) w[0][1]=42; // страховка: всё выключено автором — летит базовый камень
  }
  let tot=0; for(const e of w) tot+=e[1];
  let r=mapRNG()*tot, kind='rock';
  for(const e of w){ r-=e[1]; if(r<=0){ kind=e[0]; break; } }
  const o = poolOb.take();
  o.kind=kind; o.nm=false; // near-miss: флаг сбрасывается при каждом взятии из пула
  o._tint=null; // v1.282.14: планетарий кэширует тон камня прямо на объекте, а объект приходит из пула. Без сброса тон переживал перерождение: дрейферы красили астероиды в лиловый, астероиды дрейферов — в серый, и собственный хэш по r/rot переставал работать
  o._path=null; // 13.08.2026: и силуэт тоже — он кэшируется на объекте, а объект переиспользуется. Тот же класс граблей, что у _tint строкой выше
  o._tg=null; o._tgk=undefined; // 13.08.2026: и градиент хвоста кометы (render.js). Третье поле того же класса:
  // ключ _tgk сторожит содержимое и потому беда латентна — но gfxInvalidate() при потере контекста
  // обходит только живой массив obstacles, а лежащие в пуле объекты выносят обратно градиент МЁРТВОГО
  // контекста. Правило простое: что бы модуль ни повесил на объект, из пула он выходит чистым. Страж 109
  o.rot=mapRand(0,6.28);
  if (kind==='rock'){ // астероид
    o.x=x; o.y=-50; o.r=mapRand(16,34+d*16); o.vy=vy; o.vx=mapRand(-.4,.4)*d;
    o.vr=mapRand(-.03,.03); o.verts=makeRockVerts(7);
  } else if (kind==='debris'){ // обломок (панель спутника)
    o.x=x; o.y=-60; o.r=mapRand(14,24); o.vy=vy; o.vx=mapRand(-.5,.5)*d;
    o.vr=mapRand(-.06,.06); o.w=mapRand(26,44); o.h=mapRand(8,14);
    o.skin=(mapRand(0,4))|0; // v1.105.0 «Свет и дым»: семья обломков — лицо тасует сид, честность записи не пострадает
  } else if (kind==='drift'){ // дрейфер — ходит горизонтально
    o.x=x; o.y=-50; o.r=mapRand(15,22); o.vy=vy*.85;
    o.vx=mapRand(1.2,2.4)*(mapRNG()<.5?-1:1); o.vr=.05; o.verts=makeRockVerts(6);
  } else if (kind==='mine'){ // мина — слабо тянется к игроку
    o.x=x; o.y=-50; o.r=16; o.vy=vy*.7; o.vx=0; o.vr=.08; o.pulse=0;
  } else if (kind==='sat'){ // спутник (волна 3+): виляет синусоидой
    o.baseX=x; o.x=x; o.y=-50; o.r=18; o.vy=vy*.9; o.vx=0; o.vr=.02;
    o.ph=mapRand(0,6.28); o.amp=mapRand(28,58);
    o.skin=(mapRand(0,4))|0; // v1.105.0: семья спутников — лицо тасует сид
  } else if (kind==='comet'){ // комета (волна 4+): быстрая, по диагонали
    o.x=fl+mapRand(fw*.2,fw*.8); o.y=-40; o.r=mapRand(13,17); o.vy=vy*mapRand(1.5,1.8);
    o.vx=(o.x<W/2?1:-1)*mapRand(1.5,3); o.vr=0; o.rot=0;
  } else if (kind==='seeker'){ // мина-ловец (волна 5+): заметно тянется к самолётику
    o.x=x; o.y=-50; o.r=17; o.vy=vy*.75; o.vx=0; o.vr=.1; o.pulse=0;
  } else { // ворота (волна 6+): два пилона, узкий проход = бонус
    o.x=fl+mapRand(110,fw-110); o.y=-60; o.r=15; o.vy=vy*.8; o.vx=0; o.vr=0; o.rot=0;
    /* 22.08.2026 «Затягивающиеся ворота»: с волны 7 (после нее «визуальное разнообразие
       по видам» кончается — новых силуэтов больше нет) проход начинает дышать — картинка
       и реальная сложность совпадают (вариант 2, решение владельца): чем ближе выглядят
       пилоны, тем уже настоящий просвет. breathe=false у всех ворот до волны 7 — без
       изменений, тот же честный статичный силуэт, что и был. */
    o.breathe = S.mission>=7;
    if (o.breathe){
      o.gapMid=mapRand(95,125); o.gapAmp=mapRand(15,25); o.ph=mapRand(0,6.28);
      o.gap=o.gapMid+o.gapAmp*Math.sin(o.ph);
    } else {
      o.gap=mapRand(95,125);
    }
    o.passed=false;
    extraGap = .4; // ворота занимают много места — следующий спавн чуть позже
  }
  obstacles.push(o);
  return extraGap;
}
function makeRockVerts(n){
  const v=[]; for(let i=0;i<n;i++){ const a=i/n*6.283; v.push({a,r:mapRand(.7,1.15)}); } return v;
}
function spawnStar(){
  const s=poolStar.take();
  s.x=fieldL()+mapRand(40,fieldW()-40); s.y=-30; s.r=11; s.vy=S.speed*mapRand(.95,1.1); s.ph=mapRand(0,6.28);
  stars.push(s);
}
function powGap(){ return lerp(12,7,difficulty()) * mapRand(.85,1.2); } // v1.36.0 «Щедрое небо»: темп следует за сложностью — чем горячее небо, тем чаще подмога
/* 22.08.2026 «Честный коридор для бонуса»: жалоба владельца — бонус мог оказаться внутри
   или за широким препятствием, «еле-еле видно край». Корень: spawnPowerup() и spawnObstacle()
   всегда были полностью независимы — каждый ставил свою x наугад, без единой сверки.
   powerupSpotFree() проверяет только препятствия, ещё не прошедшие нижнюю треть поля
   (y < H*.5) — те, что уже почти внизу, никак не пересекутся со свежим бонусом сверху. */
function powerupSpotFree(x,obs,fieldH){
  for(const o of obs){
    if(o.y > fieldH*.5) continue;
    const gap=(o.w?o.w/2:o.r)+24;
    if(Math.abs(x-o.x) < gap) return false;
  }
  return true;
}
function spawnPowerup(forceKind){ // forceKind — урок III «Ловец бонусов»: бонус по расписанию
  // слот спавна один (пауза ~10-14с на старте, ~6-8с на пике) — новые бонусы делят его со старыми, поле не переполняется
  const kinds=['shield','magnet','slowmo','life','dash','nova']; // v1.40.0 «Шесть жестов»: классика + Таран + Сверхновая
  const lifeCap=(S.mode==='custom')?(S.customLv||3):3; // v1.70.0: потолок жизней — у своей трассы он авторский, иначе бонус ломал бы «Ад на одну жизнь»
  const weights=[3,3,2,1,1,1]; // фиксированный диапазон: состояние игрока не сдвигает весь seed-поток
  let r=mapRNG()*9, kind='shield';
  for(let i=0;i<kinds.length;i++){ r-=weights[i]; if(r<=0){kind=kinds[i];break;} }
  if (typeof forceKind==='string') kind=forceKind;
  if (kind==='life' && S.lives>=lifeCap) kind='shield'; // v1.46.0: жизнь — только раненым. Страж абсолютный: даже принудительный спавн не выдаст жизнь при полном корпусе
  if (kind==='nova' && S.time<45) kind='shield'; // слот сверхновой сохраняется, но ранняя награда остаётся безопасной
  const p=poolPow.take();
  let px=fieldL()+mapRand(50,fieldW()-50);
  for(let tries=0; tries<5 && !powerupSpotFree(px,obstacles,fieldH()); tries++) px=fieldL()+mapRand(50,fieldW()-50); // v1.415.2: до пяти попыток найти свободный коридор; на пятой — используем как есть, щедрое небо важнее идеала
  p.x=px; p.y=-30; p.r=14; p.vy=S.speed; p.kind=kind; p.ph=0;
  powerups.push(p);
}

/* ---------- Единая награда за звезду ---------- */
function collectStar(x,y){ // единственное место, где звезда превращается в награду — палец или магнит
  S.combo++; S.comboMax=Math.max(S.comboMax,S.combo);
  S.starsCollected++;
  const mult = 1+Math.min(S.combo,10)*.3;
  const pts = Math.round(50*mult);
  S.score += pts;
  showPopup('+'+pts, x, y, juicy('#ffd76a','color(display-p3 1 .86 .44)')); // v1.99.3 «Сочные чернила»: золото очков
  burst(x,y,juicy('#ffd76a','color(display-p3 1 .86 .44)'), Q.level>=3?12:(Q.level>=2?10:8)); // v1.37.0: салют по ступени графики; v1.99.3: сочный флагману
  planetSpark(x,y); // v1.100.0 «Планетарий»: золотые искры догоняют самолётик
  sfx.coin(Math.min(S.combo,10));
  if(S.combo>=5 && S.combo%5===0) sfx.combo(S.combo); // вехи ×5/×10/×15… — восходящий перезвон
  haptic('light');
  updateCombo(); updateStarsHud();
  elScore.classList.remove('pop'); void elScore.offsetWidth; elScore.classList.add('pop'); // v1.77.0: пульс счёта — награда видна без слов
}

/* ---------- Smooth Flight: резкость активного способа руления ---------- */
let prevTiltX=0, prevTiltY=0, prevTX=null, prevTY=null;
function smoothStep(){
  /* v1.282.20: на занавесе смерти замер останавливается. Плавность росла и после
     последнего удара — измерено, за 54 кадра занавеса она поднималась с 0.5 до 0.71,
     то есть каждая гибель сама по себе дарила до +10% к итогу, и тем больше, чем грязнее
     игрок летел. Итог считается снимком в момент смерти, так что это была чистая добавка
     ни за что. Заодно закрывает приём «последние две секунды не трогай палец». */
  if (S.dying) return;
  let jerk=-1; // -1 = нет активного руления (нейтральный кадр)
  if (input.touchX!=null){
    if (prevTX!=null) jerk=(Math.abs(input.touchX-prevTX)+Math.abs(input.touchY-prevTY))/28; // px → усл. ед.
    prevTX=input.touchX; prevTY=input.touchY;
  } else {
    prevTX=null; prevTY=null;
    if (input.useGyro && (Math.abs(input.tiltX)>0.08||Math.abs(input.tiltY)>0.08)){
      jerk=(Math.abs(input.tiltX-prevTiltX)+Math.abs(input.tiltY-prevTiltY))/.22;
    }
    /* v1.282.15: клавиатура и геймпад тоже платят за резкость. Плавность мерилась только
       для пальца и гироскопа, поэтому руление клавишами всегда давало ×1.0 к итогу (палец
       платит до −25%) и засчитывало «безупречный полёт» КАЖДЫЙ забег. Ветка keys появилась
       в v1.280.0 в controlMode, а сюда не дошла. Смена направления — рывок, ровное
       удержание — ноль. */
    const kx=(input.keyR?1:0)-(input.keyL?1:0), ky=(input.keyD?1:0)-(input.keyU?1:0);
    if (kx||ky||prevKX||prevKY) jerk=Math.max(jerk,(Math.abs(kx-prevKX)+Math.abs(ky-prevKY))*0.9);
    prevKX=kx; prevKY=ky;
  }
  prevTiltX=input.tiltX; prevTiltY=input.tiltY;
  if (jerk>1) S.smooth=clamp(S.smooth-.03*Math.min(jerk,2.5), .5, 1); // резкий рывок — падение
  else S.smooth=clamp(S.smooth+(jerk<0?.0012:.0025), .5, 1); // 22.08.2026: рост замедлен вдвое (было .002/.004) — индикатор реагирует на обычное пилотирование, не только на грубые ошибки
}
let lastSmoothShown=-1;
function updateSmoothHud(){
  const v=Math.round(S.smooth*100);
  if (v===lastSmoothShown) return; lastSmoothShown=v;
  const el=elSmoothFill; if(!el) return;
  el.style.transform='scaleX('+Math.max(0,(S.smooth-.5)*2)+')'; // v1.66.0: compositor-only
  el.style.background = S.smooth>.92?'#8fff9f':S.smooth>.75?'#ffd76a':'#ff9f8f'; // 22.08.2026: пороги сужены (было .85/.65) — «пустая механика» больше не пустая
}

/* ---------- Личный призрак: запись траектории рекордного забега ---------- */
/* Сэмпл каждые 10 кадров: x и y по 92 уровня (~4-5px), дельта дистанции.
   Упаковка по 3 символа — влезает в лимит CloudStorage 4096 (~1300 сэмплов ≈ 3.5 мин). */
let prevKX=0, prevKY=0; // v1.282.15: прошлое положение клавиш — для замера резкости руления
let rec=[], recFrame=0, ghost=null, ghostIdx=0, ghostX=0, ghostY=0, ghostOn=false,
    ghostFade=0, ghostA=0, ghostTagT=0, ghostForeign=false, ghostSkin=-1, ghostName='',
    ghostPid=0, ghostBest=0, ghostCat=''; // чей призрак (месть): владелец, его рекорд, категория
const GHOST_CAP=1300;
function ghostRec(){
  if (++recFrame%10!==0 || rec.length>=GHOST_CAP) return;
  const xq=clamp(Math.round(plane.x/W*91),0,91);   // 92 уровня по X (~4px) — без видимых скачков
  const yq=clamp(Math.round((plane.y-H*.22)/(H*.78-50)*91),0,91); // 92 уровня по Y (было 16 ≈ 33px скачок)
  rec.push([xq,yq,S.dist]);
}
/* «ЕЩЁ РАЗ?» (13.08.2026, решение владельца). Своя тень летит рядом ПЕРВЫЕ ТРИ забега
   с установки и всегда носит подпись, после третьего гаснет сама; вернуть — тумблером.
   Это разворот решения v1.280.0, где окно онбординга (тогда 7 игр) сняли намеренно
   со словами «призрак больше не тренировочные колёса». Разворот осознанный, не починка.
   Три состояния, а не два — иначе «погас сам» и «выключил игрок» станут неотличимы,
   и на четвёртом забеге тумблер выглядел бы выключенным, хотя его никто не трогал:
     'auto' (по умолчанию) — считаем забеги, 1 — всегда, 0 — никогда.
   Считаем ДО инкремента: Stats.games растёт в конце startGame (ui.js), а ghostLoad
   зовётся раньше — значит в первом забеге здесь ещё 0, и «<3» даёт ровно три забега.
   Чужих призраков (топ, дуэль) это не касается вовсе: они приходят по нажатию игрока,
   и гасить их тумблером значило бы ломать кнопку мести. */
const AGAIN_RUNS = 3;
function ghostActive(){
  const s = Store.get('ghostAgain', 'auto');
  if (s === 1 || s === '1') return true;
  if (s === 0 || s === '0') return false;
  return (typeof Stats !== 'undefined' && Stats ? saneNumber(Stats.games, 0) : 0) < AGAIN_RUNS;
}
function ghostOff(){ ghost=null; ghostOn=false; ghostTagT=0; ghostFade=0; ghostA=0; ghostMorseBuf=[]; ghostMorseArc=0; }

/* ---------- Морзянка (v1.53.0): шлейф пишет позывной ----------
   morseRec кладёт точку каждый кадр с накопленной дугой пути — рендер режет её
   на точки/тире по паттерну. Буфер короткий (64 кадра ≈ 1 сек), старые точки тают. */
let morseBuf=[], morseArc=0, morsePat='', morseElems=[], ghostMorseElems=[],
    ghostMorseBuf=[], ghostMorseArc=0, ghostMorsePat='', ghostMorseName='';
const MORSE_CAP=150, MORSE_GCAP=110, MORSE_UNIT=7; // окно ~2.5с: позывной виден целиком; MORSE_UNIT px = одна «единица» азбуки по дуге
function morseArm(){ // зовёт startGame: паттерн от позывного, чистые буферы
  morsePat = morseOn() ? morseUnits(myCallsign()) : '';
  morseElems = morseElemsOf(morsePat);
  morseBuf=[]; morseArc=0;
  ghostMorseBuf=[]; ghostMorseArc=0; ghostMorsePat=''; ghostMorseName=''; ghostMorseElems=[];
}
function morseRec(){
  if (!morsePat) return;
  const n=morseBuf.length;
  if (n){ const p=morseBuf[n-1]; morseArc+=Math.hypot(plane.x-p[0], plane.y-p[1]); }
  morseBuf.push([plane.x,plane.y,morseArc]);
  if (morseBuf.length>MORSE_CAP) morseBuf.shift();
}
function ghostPack(a){ // массив сэмплов [xq,yq,dist] → упакованная строка (3 символа на сэмпл)
  let s='', pd=0;
  for (const r of a){
    const dq=clamp(Math.round((r[2]-pd)/3),0,93); pd+=dq*3;
    s+=String.fromCharCode(35+r[0], 35+r[1], 33+dq);
  }
  return s;
}
function ghostParse(s){ // упакованная строка → {xs,ys,ds} (или null, если мусор/короткая)
  if (typeof s!=='string' || s.length<60) return null;
  const n=Math.floor(s.length/3), xs=[], ys=[], ds=[];
  let d=0;
  for(let i=0;i<n;i++){
    xs.push((s.charCodeAt(i*3)-35)/91);
    ys.push((s.charCodeAt(i*3+1)-35)/91);
    d+=(s.charCodeAt(i*3+2)-33)*3; ds.push(d);
  }
  return {xs:xs, ys:ys, ds:ds};
}
function ghostPackDaily(){ // v1.100.1 «Трибуна чемпиона»: лента дня в КОРИДОРНЫХ координатах — полёт чемпиона читается на любом экране, а не только на его собственном
  const fl=fieldL(), fw=fieldW();
  return ghostPack(rec.map(r=>[clamp(Math.round(((r[0]/91*W-fl)/fw)*91),0,91), r[1], r[2]]));
}
function ghostSave(){ // вызывается из gameOver при новом рекорде (только обычный режим)
  if (!ghostActive() || rec.length<20) return; // короткий забег — призрака не будет
  Store.set('ghostRun', {track: ghostPack(rec), seed: S.seed}); // v1.280.0: сид едет вместе с треком — иначе будущей гонке нечего восстанавливать
}
function ghostLoad(){ // вызывается из startGame
  ghost=null; ghostIdx=0; ghostOn=false; ghostFade=0; ghostA=0;
  ghostForeign=false; ghostSkin=-1; ghostName=''; ghostPid=0; ghostBest=0; ghostCat='';
  const fg=(typeof ghostTakeForeign==='function')?ghostTakeForeign():null; // чужой призрак из топа: разовый, вне окна онбординга
  if (fg){
    const g=ghostParse(fg.track);
    if (g){ ghost=g; ghostForeign=true; ghostSkin=fg.skin; ghostName=fg.name||''; ghostTagT=4;
      ghostPid=fg.pid||0; ghostBest=fg.best||0; ghostCat=fg.cat||''; // призрак из топа несёт цель мести
      // v1.280.0 «Честная гонка»: старые призраки (записаны до этой версии) сида не несут — тогда
      // молча остаёмся на уже поставленном свежем сиде этого забега, гонка просто менее точная, не падает.
      /* v1.282.20: сид призрака берём ТОЛЬКО там, где небо личное. Прошлая версия
         подменяла ключ трассы в любом режиме — а ghostLoad зовётся из startGame для всех,
         кроме Театра, уже ПОСЛЕ того, как поставлен ключ дня/спидрана/автора. Итог: и
         «Трасса дня», и Спидран, и чужой код летели по сиду призрака, то есть «одно небо
         на всех» снова переставало существовать, а игрок неделями получал одну и ту же
         заученную трассу. Гонка с призраком имеет смысл только на общем поле; в зачётных
         режимах поле задаёт день, и призрак там просто тень. */
      const ownSky = (runMode==='classic'||runMode==='bullet');
      if (ownSky && fg.seed && typeof keyRNG==='function'){ mapRNG=keyRNG(String(fg.seed)); mapSeedKey=String(fg.seed); mapSeqReset(); S.seed=fg.seed; } }
    return;
  }
  if (!ghostActive()) return;
  const gr=Store.get('ghostRun', null); // v1.280.0: раньше — просто строка; теперь {track,seed} — оба формата читаются
  const grTrack=(gr && typeof gr==='object') ? gr.track : (typeof gr==='string' ? gr : '');
  const grSeed=(gr && typeof gr==='object') ? gr.seed : null;
  const g=ghostParse(grTrack);
  if (g){ ghost=g; ghostTagT=4; // первые 4 секунды — подпись «ЕЩЁ РАЗ?» (v1.87.0 отобрала у своей тени слова, 13.08.2026 вернула по просьбе владельца)
    // v1.282.20: то же правило для своего призрака — сид поднимаем только в личном небе
    if ((runMode==='classic'||runMode==='bullet') && grSeed && typeof keyRNG==='function'){
      mapRNG=keyRNG(String(grSeed)); mapSeedKey=String(grSeed); mapSeqReset(); S.seed=grSeed; } }
}
function ghostStep(){ // призрак идёт по своей траектории синхронно с текущей дистанцией
  if (!ghost){ ghostOn=false; return; }
  const ds=ghost.ds, n=ds.length;
  while (ghostIdx<n-1 && ds[ghostIdx+1]<S.dist) ghostIdx++;
  if (S.dist>=ds[n-1]){ ghostOn=false; return; }
  const i=ghostIdx, d0=i?ds[i-1]:0, d1=ds[i];
  const f=d1>d0?clamp((S.dist-d0)/(d1-d0),0,1):0;
  const xf=lerp(i?ghost.xs[i-1]:ghost.xs[i], ghost.xs[i], f);
  const tx=ghost.cx ? fieldL()+xf*fieldW() : xf*W; // v1.100.1 «Трибуна чемпиона»: коридорная лента чужого неба ложится в мой коридор чести
  const ty=lerp(i?ghost.ys[i-1]:ghost.ys[i], ghost.ys[i], f)*(fieldH()*.78-50)+fieldT()+fieldH()*.22;
  if (!ghostOn){ ghostX=tx; ghostY=ty; } // появление — сразу на месте, без пролёта через экран
  else { ghostX=lerp(ghostX,tx,.18); ghostY=lerp(ghostY,ty,.18); } // сглаживание — никаких рывков
  ghostOn=true;
  ghostFade=clamp(ghostFade+.04,0,1); // плавное проявление
  const fadeOut=clamp((ds[n-1]-S.dist)/15,0,1); // плавное растворение в конце трека
  ghostA=.3*ghostFade*fadeOut;
  if (morseOn()){ // призрак пишет ИМЯ ВЛАДЕЛЬЦА — чужой след в твоём небе
    if (ghostMorseName!==ghostName){ ghostMorseName=ghostName; ghostMorsePat=morseUnits(ghostName||myCallsign()); ghostMorseElems=morseElemsOf(ghostMorsePat); }
    if (ghostMorsePat){
      const n=ghostMorseBuf.length;
      if (n){ const p=ghostMorseBuf[n-1]; ghostMorseArc+=Math.hypot(ghostX-p[0],ghostY-p[1]); }
      ghostMorseBuf.push([ghostX,ghostY,ghostMorseArc]);
      if (ghostMorseBuf.length>MORSE_GCAP) ghostMorseBuf.shift();
    }
  }
}

// Б1 «Оплата за страх» (v1.92.0): «впритык» — плата за риск. Под слоу-мо, Bullet Time или тараном
// риска нет — сближение честно засчитывается (статистика, свист, триггер BT), но монет не приносит.
// Неуязвимость и занавес смерти закрыты снаружи (S.invuln<=0): там впритык даже не регистрируется.
// v1.282.20: щит добавлен к списку «риска нет». 14 секунд щита позволяли нырять в самую
// гущу и снимать по 25×комбо за каждый пролёт впритык — до полутора тысяч очков с одного
// бонуса, без единого шанса погибнуть. Остальные три страховки в списке уже были.
function fullRisk(){ return S.slowmo<=0 && S.bt<=0 && S.dash<=0 && S.shield<=0; }

/* ================= UPDATE (fixed step 1/60) ================= */
/* 22.08.2026 «Впритык только когда честно мимо»: жалоба владельца — «впритык»
   засчитывался, когда препятствие само же тебя ударило мгновение спустя. Корень —
   проверка была чисто дистанционной: объект на прямом сближении проходит кольцо
   «впритык» на пути К игроку, а не мимо него, и через 1-2 тика (16-32мс) входит в
   радиус удара — тот же объект. Лекарство (исследование near-miss паттернов,
   closing-velocity gate): считать «впритык» только когда объект уже ОТДАЛЯЕТСЯ —
   dot(dr,dv) >= 0, где dr — вектор от игрока к объекту, dv — относительная скорость.
   Отрицательный dot = сближение (объект летит НА игрока, впритык рано); неотрицательный
   = момент сближения уже пройден, объект уходит — честный грейз. */
function isReceding(dx,dy,dvx,dvy,pvx,pvy){
  const rvx=dvx-pvx, rvy=dvy-pvy;
  return (dx*rvx + dy*rvy) >= 0;
}
function update(dt){
  input.useGyro = gyroUnlocked() && performance.now()-input._t<600; // сторож + замок: гироскоп рулит только после «Полёта без рук», молчащий датчик не держит старый наклон
  let ts = S.slowmo>0 ? .45 : 1;
  if (S.bt>0) ts=Math.min(ts,.4); // Bullet Time: мир на 0.4, пока горит таймер
  if (S.dying) ts=Math.min(ts,.12); // «Склейка»: смерть — slow-mo занавес перед экраном итогов
  if (S.pausing) ts=Math.min(ts,.05); // «Склейка»: пауза — мир замирает плавно, не срезом
  S.timeScale = RM ? ts : lerp(S.timeScale, ts, .1); // v1.99.2 «Бережное небо»: при системном флаге время не плавает — переключается сразу
  /* v1.284.10: `!S.dying` — тот же запрет, что стоит в pauseGame(), но там он проверялся
     только на входе. Если смерть начиналась ПОСЛЕ начала паузы, время мира падало ниже
     порога уже под занавесом, и пауза вставала посреди него: занавес замирал намертво
     (dyingT так и оставался на месте), gameOver() не наступал никогда — а вместе с ним
     не записывались ни рекорд, ни звёзды, ни статистика. Гибель, доведённая до конца,
     дешевле гибели, стёртой вместе с забегом. */
  /* И обратное: начавшаяся смерть отменяет незавершённую паузу. Без этой строки `S.pausing`
     остаётся взведённым и зажимает время мира на 5% — занавес не замирает, но ползёт в
     двадцать раз дольше положенного, и игрок сидит перед стоп-кадром почти двадцать секунд.
     Приоритет тот же, что в pauseGame(): занавес сильнее паузы. */
  if (S.dying && S.pausing) S.pausing=0;
  if (S.pausing && S.timeScale<.08 && !S.dying){ S.pausing=0; S.paused=true; } // доехали до остановки — на 5% скорости это незаметно
  const d = difficulty();
  if (typeof gyroUpdate==='function') gyroUpdate(dt); // «Полёт без рук» (v1.16.0): оффер гироскопа после двух минут неба + золотая секунда

  S.speed = (3.4 + d*4.6) * (input.useGyro ? GYRO_ASSIST : 1); // старт 3.4, потолок 8.0 — эталон; под штурвалом мир на 15% медленнее (v1.31.0)
  if (S.dash>0) S.speed*=1.3; // Таран: ты снаряд, а не ловушка (v1.40.0, логика v1.19.0)
  if (S.mode==='custom') S.speed*=S.customS||1; // Своя трасса: темп автора (v1.68.0)
  /* v1.282.15: и сам спавн, и пауза до следующего берутся из ЛИЧНОГО потока этого спавна.
     Раньше всё это черпалось из общего кубика подряд, и любое расхождение (пропуск при
     полном поле, другой вид преграды с другим числом выборок, волна, поднятая очками)
     сдвигало поток навсегда — две «одинаковые» трассы дня расходились. Теперь спавн №N
     у любого игрока получает ровно свой кубик, а порядок и количество выборок внутри
     ничего не решают. Номер тратится и при переполненном поле — расписание трассы едино
     для всех, даже когда конкретную преграду поставить некуда. */
  const basePace=3.4+d*4.6;
  const paceFactor=basePace>0?S.speed/basePace:1;
  const trackDt=dt*S.timeScale*paceFactor;
  spawnT -= trackDt;
  if (spawnT<=0){
    spawnT = withTrack('ob', function(){
      const extraGap = spawnObstacle();
      /* Передышка после ворот теперь ВНУТРИ множителей: снаружи она нарушала закон v1.31.0
         («под штурвалом реже ровно настолько, чтобы шаг в метрах сохранился») — плоские
         0.4с при 85% скорости давали гироскописту более короткую паузу, чем пальцевику. */
      return (lerp(.85, .26, d) * mapRand(.75,1.25) + (extraGap||0))
        * (input.useGyro ? 1/GYRO_ASSIST : 1) * (S.mode==='custom'?(S.customD||1):1); // множитель передышки убран в партии 45 — см. запись у spawnObstacle
    });
  }
  starT -= trackDt;
  /* v1.282.20: звёзды и бонусы получают ту же поправку на штурвал, что и преграды.
     Под гироскопом мир идёт на 15% медленнее (GYRO_ASSIST), и паузу между преградами
     честно растягивали обратно — а звёзды и бонусы считались в секундах, то есть на
     метр трассы их выпадало на 17.6% БОЛЬШЕ. Это давало фору в общих таблицах
     (дистанция, Затишье, Трасса дня — там категории управления нет) и вдобавок ломало
     сам закон сида: на одной и той же трассе дня у гироскописта N-я звезда стояла на
     другой дистанции, чем у пальцевика. */
  if (starT<=0){ starT = withTrack('st', function(){ spawnStar(); return mapRand(.8,1.5) * (input.useGyro ? 1/GYRO_ASSIST : 1); }); } // честный базовый темп (эталон v1.10.0)
  powT -= trackDt;
  if (powT<=0){ powT = withTrack('pw', function(){
    if (!(S.mode==='custom' && S.customB===0)) spawnPowerup();
    return powGap() * (S.mode==='custom'?forgeBonusGapMul(S.customB):1) * (input.useGyro ? 1/GYRO_ASSIST : 1); }); } // v1.282.20: та же поправка на штурвал // бонусы интуитивны (v1.16.0); темп — за сложностью (v1.36.0); Своя трасса: частота автора, «выкл» = пустое небо (v1.69.0)

  // ---- движение самолётика + учёт способа руления (категория рекорда) ----
  pollTouchHold(); // «тап vs свайп»: удержание >0.2с включает тач-руление
  const accel = .32, maxV = 7.5;
  let ax=0, ay=0;
  if (input.touchX!=null){
    /* v1.282.20: цель пальца зажимаем КОРИДОРОМ с постоянным запасом за стеной, а не
     шириной экрана. Управление позиционное (скорость = 0.12 от расстояния до цели), и
     запас за стеной решал всё: на телефоне 390 мер запас был 4 меры — самолёт замирал в
     четырёх мерах от стены и физически не мог к ней прижаться; на десктопе (W=1500) запас
     был 500 мер, то есть прижим шёл на полной скорости мгновенно. Один и тот же манёвр
     «уйти в край под астероид» был невозможен на одних устройствах и бесплатен на других.
     Постоянные 70 мер за стеной уравнивают всех. */
  const txfl=fieldL(), txfr=txfl+fieldW();
  const txft=fieldT(), txfh=fieldH();
  const tx = clamp(input.touchX, txfl-70, txfr+70), ty = clamp(input.touchY-90, txft+txfh*.25, txft+txfh-60); // v1.282.20: вертикаль тоже коридорная
    plane.vx = lerp(plane.vx, clamp((tx-plane.x)*.12,-maxV,maxV), .25);
    plane.vy = lerp(plane.vy, clamp((ty-plane.y)*.10,-maxV,maxV), .2);
    // v1.282.20: мышь считается отдельно — у неё нет гейта «тап против свайпа», которым
    // палец платит 200мс за каждое возобновление руления. Категория ниже разводит их.
    S.manSec+=dt; if(input.byMouse) S.mouseSec+=dt; else S.touchSec+=dt;
  } else {
    if (input.useGyro){ ax += input.tiltX*accel*2.2; ay += input.tiltY*accel*2.2; }
    if (input.keyL) ax -= accel*2; if (input.keyR) ax += accel*2;
    if (input.keyU) ay -= accel*2; if (input.keyD) ay += accel*2;
    plane.vx = clamp(plane.vx+ax, -maxV, maxV) * .94;
    plane.vy = clamp(plane.vy+ay, -maxV, maxV) * .94;
    if (input.keyL||input.keyR||input.keyU||input.keyD){ S.manSec+=dt; S.keysSec+=dt; } // v1.280.0: клавиатура/геймпад — свой счётчик, не тонет в manSec неразличимо от пальца
    if (input.useGyro && (Math.abs(input.tiltX)>0.08||Math.abs(input.tiltY)>0.08)) S.gyroSec+=dt;
  }
  if (S.dying){ // «Склейка»: крен, падение, дымный след — ввод ниже почти не влияет (заглушен занавесом)
    S.dyingT-=dt;
    plane.vx=lerp(plane.vx,0,.06); plane.vy=lerp(plane.vy,3,.05);
    plane.bank=lerp(plane.bank,1.15,.04);
    if (Math.random()<.3) burst(plane.x+rand(-6,6), plane.y+10, 'rgba(160,165,180,.45)', 2);
    if (S.dyingT<=0){ S.dying=0; gameOver(); return; }
  }
  const flPlane=fieldL(); // v1.99.9: в коридоре чести нет безопасной полосы у края
  plane.x = clamp(plane.x + plane.vx, 20+flPlane, W-20-flPlane);
  plane.y = clamp(plane.y + plane.vy, fieldT()+fieldH()*.22, fieldT()+fieldH()-50); // v1.282.20: потолок и пол — от коридора, не от высоты экрана
  if (!S.dying) plane.bank = lerp(plane.bank, clamp(plane.vx/maxV,-1,1), .15); // при занавесе крен задаёт падение
  smoothStep(); // Smooth Flight: замер резкости после обработки ввода
  ghostRec();  // призрак: запись сэмпла (каждый 10-й кадр внутри)
  morseRec();  // морзянка: точка шлейфа (каждый кадр, буфер короткий)
  ghostStep(); // призрак: позиция по текущей дистанции

  if (runMode==='theater'){ // v1.94.0 «Театр призраков» Т1: зрительский автопилот — самолётик идёт по ленте дня, руки со штурвала убраны
    if (ghost && ghost.ds){
      const dxT=ghostX-plane.x; plane.x=ghostX; plane.y=ghostY; plane.vx=0; plane.vy=0;
      plane.bank=lerp(plane.bank,clamp(dxT/8,-1,1),.3); // крен следует за лентой — повтор выглядит полётом, не линейкой
      ghostA=0; S.invuln=1e9; // тень выключена (зритель смотрит самолётик), небо пролетает сквозь героя (мигание благодати в рендере заглушено)
      if (S.dist>=ghost.ds[ghost.ds.length-1]){ endTheater(); return; } // лента кончилась — занавес
    }
    /* v1.282.13: нет ленты — нет спектакля. И неуязвимость, и занавес по концу ленты
       жили ВНУТРИ проверки выше, поэтому театр без трека (трек стёрт, скос версий,
       битое хранилище) превращался в обычный смертный забег, который к тому же
       никогда не заканчивался сам: зритель гиб по-настоящему, гибель шла через полный
       тракт посадки — писала статистику, near-miss-очки в рекорд категории — и съедала
       билет. Закон v1.94.0 «в театре касса молчит» должен держаться и в этом углу. */
    else { endTheater(); return; }
  }

  if (S.invuln>0) S.invuln-=dt;
  if (S.shield>0) S.shield-=dt;
  if (S.magnet>0) S.magnet-=dt;
  if (S.slowmo>0) S.slowmo-=dt;
  if (S.dash>0) S.dash-=dt; // Таран: 4 секунды пробоя (v1.40.0)
  S.time += dt; // часы полёта — по ним сверхновая узнаёт, что старт позади
  if (S.bt>0) S.bt-=dt; // Bullet Time: 0.5с реального времени (не растянутого)
  if (S.flash>0) S.flash-=dt; // вспышка — чисто визуальная (золотая секунда)
  if (ghostTagT>0) ghostTagT-=dt; // подпись призрака живёт первые 4 секунды
  S.dist += S.speed*dt*S.timeScale*8;
  S.hueShift += dt*1.2; // фон дышит непрерывно — без скачков по миссиям (v1.24.0)
  if (S.shake>0) S.shake-=dt*2.2;

  // ---- волна — событие, как в эталоне (v1.30.0): она открывает преграды и ведёт сложность.
  // Переход (v1.31.0): ступень РАСТЁТ вместе с игроком — 400/500/600…1000 м: первое
  // событие на ~15-й секунде (казуал не ждёт), к полному жару — эталонный шаг.
  // ИЛИ 500 очков за волну — мастерство обгоняет дистанцию. Счёт честный, без капли.
  /* v1.282.15: волну поднимает ТОЛЬКО пройденная дистанция. Прежде её поднимали ещё и
     очки (S.score >= mission*500), а очки — это собранные звёзды и пролёты впритык, то
     есть чистое мастерство игрока. Волна меняет таблицу весов преград, значит два игрока
     на одном сиде получали в одной и той же точке трассы РАЗНЫЕ препятствия — и дальше
     поля расходились навсегда. Дистанция же одинакова по определению: это координата на
     трассе. Побочно уходит и лавина волн от Сверхновой (до 11 «дингов» подряд за 180мс),
     потому что мгновенный скачок очков больше ничего не двигает. */
  if (!(S.mode==='custom' && S.customFlat) && S.dist >= waveDistTarget(S.mission)){ // «Ровный жар»: волна заморожена (v1.69.0)
    S.mission++;
    S.flash=Math.max(S.flash,.25); // мягкий золотой «динг» — глаза целы, событие видно
    sfx.mission(); haptic('medium');
  }
  if (S.mode==='custom' && S.customL>0 && S.dist>=S.customL && !S.dying){ // Своя трасса: финиш на длине автора — занавес как у Спидрана (v1.68.0)
    startDying(); S.mapWin=1;
  }

  // ---- препятствия ----
  for (let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i];
    o.y += o.vy*S.timeScale;
    o.x += (o.vx||0)*S.timeScale*paceFactor;
    o.rot += o.vr*S.timeScale*paceFactor;
    if (o.kind==='drift'){ const dfl=fieldL(), dfr=dfl+fieldW(); if (o.x<dfl+o.r||o.x>dfr-o.r) o.vx*=-1; } // v1.282.15: отбиваемся от стенок КОРИДОРА, а не экрана — иначе на планшете дрейфер уходил далеко в сторону и один сид давал разную геометрию
    if (o.kind==='mine'){
      o.pulse+=dt*5*paceFactor;
      o.vx = lerp(o.vx, clamp((plane.x-o.x)*.006,-1,1), .02*paceFactor);
    }
    if (o.kind==='sat'){ // синусоида вокруг базовой линии
      o.ph+=dt*2*S.timeScale*paceFactor;
      { const sfl=fieldL(), sfr=sfl+fieldW(); o.x=clamp(o.baseX+Math.sin(o.ph)*o.amp, sfl+o.r, sfr-o.r); } // v1.282.15: качание спутника подрезается коридором, а не шириной экрана
    }
    if (o.kind==='seeker'){ // ловец: наведение вдвое сильнее мины
      o.pulse+=dt*5*paceFactor;
      o.vx = lerp(o.vx, clamp((plane.x-o.x)*.012,-1.8,1.8), .04*paceFactor);
    }
    if (o.kind==='gate' && o.breathe){ // 22.08.2026 «Затягивающиеся ворота»: проход дышит — тот же приём, что у спутника выше
      o.ph += dt*1.9*paceFactor; // ~3.3с на полный вдох-выдох — успеваешь прочитать ритм, не угадать
      o.gap = o.gapMid + o.gapAmp*Math.sin(o.ph);
    }
    if (o.y>H+80){ killIdx(obstacles,i,poolOb); continue; }
    if (o.kind==='gate'){ // ворота: два пилона, проход между ними — бонус
      const pr=o.r+plane.r-6;
      let ghit=false, gnm=false;
      for (const sgn of [-1,1]){
        const px=o.x+sgn*o.gap/2, gdx=px-plane.x, gdy=o.y-plane.y, gd2=gdx*gdx+gdy*gdy;
        if (gd2<pr*pr) ghit=true;
        else if (!o.nm && gd2<(pr+24)*(pr+24) && isReceding(gdx,gdy,o.vx||0,o.vy,plane.vx,plane.vy)) gnm=true;
      }
      if (S.invuln<=0 && ghit){
        if (S.dash>0){ // Таран: ворота разбиваются об самолётик (v1.40.0, логика v1.19.0)
          killIdx(obstacles,i,poolOb);
          const pts=Math.round(50*(1+Math.min(S.combo,10)*.3));
          S.score+=pts; showPopup('+'+pts,o.x,o.y,'#a9bcff');
          burst(o.x,o.y,'#a9bcff',16); sfx.smash(); haptic('medium'); S.shake=Math.max(S.shake,.5);
        } else if (S.shield>0){
          S.shield=0; killIdx(obstacles,i,poolOb);
          burst(o.x,o.y,'#7fd8ff',14); sfx.shieldBlock(); haptic('medium');
          showPopup(L.shieldDown, plane.x, plane.y-40, '#7fd8ff');
        } else {
          hitPlane('gate');
          killIdx(obstacles,i,poolOb);
          if (S.lives<=0){ if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':gate'); startDying(); return; } // v1.108.1: волна+причина, анонимно — балансовая телеметрия
        }
        continue;
      }
      if (S.invuln<=0 && gnm){ // впритык к пилону — обычный near-miss
        o.nm=true; Stats.nearMiss=(Stats.nearMiss||0)+1;
        sfx.nearMiss();
        haptic('light');
        if (fullRisk()){ // Б1: монеты — только за настоящий риск
          const pts=Math.round(25*(1+Math.min(S.combo,10)*.3));
          S.score+=pts;
          showPopup(L.nearMiss+' +'+pts, o.x, o.y, '#eef4ff'); // 22.08.2026: развели с щитом/воротами — нейтральный, не спорит с будущим лабрадоритом
        }
        if (S.bullet) S.bt=.5; // Bullet Time: триггер замедления (ворота)
      }
      if (runMode!=='theater' && !o.passed && o.y>plane.y){ // ворота пролетели — был ли самолётик в проходе (v1.94.0: в театре касса молчит)
        o.passed=true;
        if (Math.abs(plane.x-o.x) < o.gap/2-plane.r-6){
          const pts=Math.round(150*(1+Math.min(S.combo,10)*.3));
          S.score+=pts;
          showPopup(L.gate+' +'+pts, o.x, plane.y-50, '#5eead4'); // 22.08.2026: насыщенная бирюза — холоднее и щита, и слоумо
          sfx.gate(); haptic('medium');
        }
      }
      continue;
    }
    if (S.invuln<=0){
      const dx=o.x-plane.x, dy=o.y-plane.y, rr=o.r+plane.r-6, d2=dx*dx+dy*dy;
      if (d2 < rr*rr){
        if (S.dash>0){ // Таран: ты снаряд — опасность в пыль и очки (v1.40.0, логика v1.19.0)
          killIdx(obstacles,i,poolOb);
          const pts=Math.round(50*(1+Math.min(S.combo,10)*.3));
          S.score+=pts; showPopup('+'+pts,o.x,o.y,'#a9bcff');
          burst(o.x,o.y,'#a9bcff',16); sfx.smash(); haptic('medium'); S.shake=Math.max(S.shake,.5);
        } else if (S.shield>0){
          S.shield=0; killIdx(obstacles,i,poolOb);
          burst(o.x,o.y,'#7fd8ff',14); sfx.shieldBlock(); haptic('medium');
          showPopup(L.shieldDown, plane.x, plane.y-40, '#7fd8ff');
        } else {
          hitPlane(o.kind);
          killIdx(obstacles,i,poolOb);
          if (S.lives<=0){ if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':'+S.lastHitKind); startDying(); return; } // v1.108.1: волна+причина, анонимно — балансовая телеметрия
        }
      } else if (!o.nm && d2 < (rr+24)*(rr+24) && isReceding(dx,dy,o.vx||0,o.vy,plane.vx,plane.vy)){ // near miss: пролетел вплотную и уже уходит — не летит на таран
        o.nm=true; Stats.nearMiss=(Stats.nearMiss||0)+1;
        sfx.nearMiss(); // свист пролёта
        haptic('light');
        if (fullRisk()){ // Б1: под бонусом — честь и свист, монет нет
          const pts=Math.round(25*(1+Math.min(S.combo,10)*.3))*(o.kind==='comet'?2:1); // комета: двойной бонус
          S.score+=pts;
          showPopup(L.nearMiss+' +'+pts, o.x, o.y, '#eef4ff'); // 22.08.2026: развели с щитом/воротами — нейтральный, не спорит с будущим лабрадоритом
        }
        if (S.bullet) S.bt=.5; // Bullet Time: триггер замедления
      }
    }
  }

  // ---- звёзды ----
  for (let i=stars.length-1;i>=0;i--){
    const s=stars[i];
    s.y += s.vy*S.timeScale; s.ph+=dt*4;
    if (S.magnet>0){
      const dx=plane.x-s.x, dy=plane.y-s.y, dd=Math.hypot(dx,dy);
      if (dd<170){ s.x+=dx/dd*6; s.y+=dy/dd*6; }
    }
    const dx=s.x-plane.x, dy=s.y-plane.y;
    if (!S.dying && runMode!=='theater' && dx*dx+dy*dy < (plane.r+s.r+6)**2){ // занавес: звёзды пролетают мимо; v1.94.0: в театре — тоже мимо
      collectStar(s.x,s.y);
      killIdx(stars,i,poolStar);
      continue;
    }
    if (s.y>H+40){
      if (S.combo>0){ S.combo=0; updateCombo(); } // пропустил звезду — серия сгорела, честно (заморозка вычеркнута v1.18.0)
      killIdx(stars,i,poolStar);
    }
  }
  goldTick(dt); // v1.100.2 «Золотая звезда дня»: маяк дня живёт рядом со звёздами — один тик, ноль влияния на трассу

  // ---- бонусы ----
  for (let i=powerups.length-1;i>=0;i--){
    const p=powerups[i]; p.y+=p.vy*S.timeScale; p.ph+=dt*3;
    const dx=p.x-plane.x, dy=p.y-plane.y;
    if (!S.dying && runMode!=='theater' && dx*dx+dy*dy < (plane.r+p.r+8)**2){ // v1.94.0: в театре бонусы пролетают мимо — мир чистый, как в записи
      sfx.power(p.kind); haptic('medium'); // у каждого бонуса — свой тембр
      S.bonuses++; // v1.42.0: взятые бонусы — в паспорт забега
      if (p.kind==='shield'){ S.shield=14; showPopup(L.shield,p.x,p.y,'#7fd8ff'); }
      if (p.kind==='magnet'){ S.magnet=12; showPopup(L.magnet,p.x,p.y,'#c58fff'); }
      if (p.kind==='slowmo'){ S.slowmo=6; showPopup(L.slowmo,p.x,p.y,'#8fff9f'); }
      // v1.282.20: потолок жизней авторский, как и на спавне — иначе две одновременно
      // висящие в небе жизни пробивали «Ад на одну жизнь» (customLv=1) до трёх.
      if (p.kind==='life'){ S.lives=Math.min((S.mode==='custom')?(S.customLv||3):3, S.lives+1); showPopup(L.life,p.x,p.y,'#ffa1d9'); updateLives(); } // жизнь существует только для раненого: страж спавна (v1.46.0) не пускает её в небо при полном корпусе — никаких лишних жизней; v1.105.0: розовая, вне красной семьи тревоги
      if (p.kind==='dash'){ S.dash=4; showPopup(L.dash,p.x,p.y,'#a9bcff'); } // Таран: 4 секунды пробоя (v1.40.0)
      if (p.kind==='nova'){ if (typeof music!=='undefined'&&music.kick) music.kick(); // взрыв — музыка приседает (v1.48.0)
        // Сверхновая: вспышка сжигает все опасности на экране — каждая в очки (вес 1, редкий праздник, v1.40.0)
        const mult=1+Math.min(S.combo,10)*.3;
        let pts=0;
        for(let j=obstacles.length-1;j>=0;j--){ const o=obstacles[j];
          pts+=Math.round(100*mult);
          burst(o.x,o.y,'#fff0a8',12);
          killIdx(obstacles,j,poolOb);
        }
        S.score+=pts; S.flash=.45; S.shake=1;
        if (pts>0) showPopup('+'+pts,p.x,p.y,'#fff0a8');
        else showPopup(L.nova,p.x,p.y,'#fff0a8'); // небо и так было чистым — просто салют
      }
      burst(p.x,p.y,'#fff',12);
      killIdx(powerups,i,poolPow); continue;
    }
    if (p.y>H+40) killIdx(powerups,i,poolPow);
  }

  updateFx(dt);

  // тягач-частицы (кап частиц + авто-качество)
  const thrusterP = Q.level>=3 ? .8 : Q.level===2 ? .6 : Q.level===1 ? .35 : .18; // v1.38.0: «Ультра» — самый густой след (был перекос: получала минимум)
  const fxK = (Q.mode==='auto' && Q.fps<48) ? (Q.fps<40 ? .55 : .75) : 1;
  if (RNG()<(thrusterP*fxK) && particles.length<(Q.level>=3?340:PARTICLE_CAP)){
    const t=poolPart.take(), sk=SKINS[S.skin]||SKINS[0];
    t.x=plane.x+rand(-3,3); t.y=plane.y+16; t.vx=rand(-.3,.3); t.vy=rand(1,2.4);
    t.life=rand(.4,.8); t.color=sk.trail; t.size=rand(1,2.5);
    t.fx=sk.fx||''; // фирменный след скина (читается в drawFx)
    if(sk.fx==='plasma'){ t.life=rand(.6,1.05); t.size=rand(1.5,3); t.vy=rand(1.4,2.8); } // длинный огненный шлейф
    else if(sk.fx==='neon'){ t.life=rand(.3,.6); t.size=rand(.8,2); } // короткие искры
    particles.push(t);
  }
  if (S.dash>0 && RNG()<.7) burst(plane.x+rand(-9,9), plane.y+12+rand(0,18), '#a9bcff', 1); // плазменный след Пули (v1.43.1) (v1.40.0, логика v1.19.0)

  // счёт в DOM — только при изменении
  const sc=Math.floor(S.score);
  if(sc!==lastScoreShown){ lastScoreShown=sc; elScore.textContent=sc; }
  const d5=Math.floor(S.dist/5); // расстояние в HUD: живой счётчик, шаг 5 м — без DOM-флуда
  if(d5!==lastDistShown){ lastDistShown=d5; elDistN.textContent=d5*5; }
  if (S.mode==='speedrun'){ // Спидран: таймер + цель; 10 000 — финиш (v1.42.0)
    const elMH=elModeHud, tSec=Math.floor(S.time*10)/10;
    if (elMH && elMH._t!==tSec){ elMH._t=tSec;
      elMH.textContent=fmtTime(S.time)+' · '+L.srGoal+' '+fmtN(SR_GOAL); }
    if (S.score>=SR_GOAL && !S.dying){ startDying(); S.srWin=1; } // занавес как при смерти, но это победа
  }
  else if (S.mode==='daily'){ // Трасса дня: метка ритуала на табло — это небо сегодня одно на всех (v1.47.0)
    // v1.284.3: подпись общего события берётся общим временем — trackDayKey (UTC), тем же,
    // из которого шьётся сама трасса. Здесь стоял todayKey() — личная дата: в UTC+3 вечером
    // игрок видел завтрашнее число при сегодняшней трассе. Закон №17. Страж 122.
    const elMH=elModeHud, tk=trackDayKey(); if (elMH && !elMH._t){ elMH._t=1;
      elMH.textContent=L.modeDaily+' · '+tk.slice(8)+'.'+tk.slice(5,7); } }
  else if (S.mode==='theater'){ // Театр призраков (v1.94.0): табло зрителя — не счёт, а название спектакля
    const elMH=elModeHud; if (elMH && !elMH._t){ elMH._t=1; elMH.textContent=L.theaterChip; } }
  else if (S.mode==='custom'){ // Своя трасса (v1.68.0): имя автора + живой прогресс до финиша (шаг 5 м, как distHud)
    const elMH=elModeHud;
    if (elMH){
      const step=S.customL>0?Math.floor(S.dist/5):-1; // -1 = бесконечная: подпись ставится раз и не дёргается
      if (elMH._t2!==step){ elMH._t2=step; // свой флаг: _t занят дисциплинами и сбрасывается в 0 на старте
        elMH.textContent='«'+(S.customName||L.forgeDefName)+'»'+(S.customL>0?' · '+step*5+'/'+S.customL+' '+(L.unitM||'м'):''); }
    } }
  updateSmoothHud();
}

/* ---------- эффекты живут и на паузе (частицы/попапы догорают) ---------- */
function updateFx(dt){
  for (let i=particles.length-1;i>=0;i--){
    // v1.282.15: позиция по времени, а не по кадру — жизнь и так таяла по времени, и конфетти рекорда на 120 Гц разлеталось вдвое дальше, чем на 60
    const p=particles[i]; p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.life-=dt*2;
    if (p.life<=0) killIdx(particles,i,poolPart);
  }
  for (let i=popups.length-1;i>=0;i--){
    const p=popups[i]; p.y-=dt*40; p.life-=dt*1.4;
    if (p.life<=0) killIdx(popups,i,poolPop);
  }
}

function hitPlane(kind){
  S.lives--; S.combo=0; S.invuln=2.2; S.shake=1; S.hits++; S.lastHitKind=kind||'?';
  S.smooth = clamp(S.smooth - 0.12, 0.5, 1); // v1.284.25: удар должен немедленно ухудшать "Smooth Flight" — без этого итоговый счёт не отражал реальную резкость столкновения.
  updateLives(); updateCombo();
  elLivesC.classList.remove('hit'); void elLivesC.offsetWidth; elLivesC.classList.add('hit'); // v1.77.0: пульс жизни — гаснет с микродрожью
  sfx.hit(); haptic('heavy'); if(typeof gamepadRumble==='function') gamepadRumble(.7,150); if (typeof music!=='undefined'&&music.kick) music.kick(); // сайдчейн: музыка приседает под ударом (v1.48.0)
  burst(plane.x, plane.y, '#ff8f8f', 22);
  elVignette.style.opacity=1; setTimeout(()=>elVignette.style.opacity=0, 350);
}
function startDying(){ // «Склейка»: финальный удар — slow-mo занавес 0.9с, потом экран итогов
  S.dying=1; S.dyingT=.9; S.invuln=1e9;
  burst(plane.x, plane.y, '#ffd0a0', 26); // яркая вспышка гибели
  burst(plane.x, plane.y, 'rgba(160,165,180,.5)', 14); // дым
}
function confetti(){ // фонтан при новом рекорде — вау-момент на экране итогов
  const cols=['rgba(255,215,106,','rgba(168,200,255,','rgba(255,159,176,','rgba(143,255,159,'];
  for(let b=0;b<4;b++) burst(W/2+rand(-70,70), H*.3+rand(-20,20), cols[b], 16);
}
function burst(x,y,color,n){
  if(Q.mode==='auto' && Q.fps<48){
    n=Math.min(n, Q.fps<40 ? Math.max(2,(n*.4)|0) : Math.max(3,(n*.6)|0));
  }
  if (particles.length>(Q.level>=3?340:PARTICLE_CAP)) n=Math.min(n,4); // v1.38.0: у «Ультры» кап выше
  /* v1.282.13: чернил три вида, а не два. Флагману juicy() отдаёт широкий охват строкой
     color(display-p3 …) — прежнее правило «не rgba, значит hex» резало её как hex, и
     parseInt('ol',16) давал rgba(NaN,NaN,NaN,). Canvas молча отвергает негодный цвет и
     рисует предыдущим: салют золотой звезды выходил чужого цвета именно на дорогих
     экранах. Частице нужен «хвост под альфу» — для P3 это форма со слэшем. */
  /* v1.282.14: форм чернил оказалось пять, а не три. Прошлая правка научила burst
     широкому охвату, но рядом остались два незакрытых случая, дававших тот же
     rgba(NaN,…): ПОЛНАЯ форма 'rgba(160,165,180,.45)' (дым занавеса смерти и дым взрыва —
     самая заметная сцена в игре) проходила проверку по префиксу как готовый хвост, хотя
     у неё уже есть и альфа, и закрывающая скобка; и КОРОТКИЙ hex '#fff' (салют любого
     бонуса), у которого slice(5,7) пуст. Конвенция частицы — хвост БЕЗ альфы: рендер
     сам допишет p.life и скобку. Приводим к ней все формы. */
  const c = /^rgba\([^)]*,\s*[\d.]+\s*\)\s*$/.test(color) ? color.replace(/,\s*[\d.]+\s*\)\s*$/, ',') // полная rgba(...) → срезаем альфу и скобку
          : color.startsWith('rgba') ? color                                    // уже хвост вида 'rgba(r,g,b,'
          : color.startsWith('color(') ? color.replace(/\)\s*$/, ' / ')         // color(display-p3 1 .86 .44) → «… / » + альфа + «)»
          : hexToRgba(color);
  for(let i=0;i<n;i++){
    const p=poolPart.take();
    p.x=x; p.y=y; p.vx=rand(-3,3); p.vy=rand(-3,3);
    p.life=rand(.5,1); p.color=c; p.size=rand(1.5,3.5);
    p.fx=''; // пул: стереть фирменный след прошлой жизни частицы
    particles.push(p);
  }
}
function hexToRgba(h){
  if(h.length===4) h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3]; // v1.282.14: короткая форма '#fff' давала b=NaN и молча негодный цвет
  const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return `rgba(${r},${g},${b},`; }
function showPopup(txt,x,y,color){
  const p=poolPop.take();
  // Каталог ошибок №31 «Канвас не слышит CSS»: text-transform:uppercase на html,body не
  // действует на канвас — без этого всплывающий текст рисовался ровно так, как записан
  // в словаре L.xxx, выбиваясь из заглавных букв всей остальной игры.
  p.txt=String(txt).toUpperCase(); p.x=x; p.y=y; p.color=color; p.life=1;
  popups.push(p);
}

/* ---------- HUD ---------- */
let bannerTimer=null;
function showBanner(html, sub){
  elBanner.innerHTML = html + (sub||'');
  elBanner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer=setTimeout(()=>elBanner.classList.remove('show'), 1500);
}
function updateCombo(){
  if (S.combo>=3){ elCombo.textContent=L.combo+' ×'+S.combo; elCombo.style.opacity=1; }
  else elCombo.style.opacity=0;
}
function updateLives(){ // жизни = мини-модельки текущего самолётика (та же форма и скин, рендер ×2 — HD)
  const c=elLivesC; if(!c) return;
  const x=c.getContext('2d');
  x.setTransform(2,0,0,2,0,0); // canvas 132×48 → css 66×24: чётко на retina
  x.clearRect(0,0,66,24);
  const skin=SKINS[S.skin]||SKINS[0];
  for(let i=0;i<3;i++){
    x.save(); x.translate(12+i*22, 13); x.scale(.5,.5);
    if (i<S.lives){ // живая — полный корпус со свечением (v1.46.0: светятся только живые — потерянная не притворяется живой)
      x.shadowColor=skin.glow; x.shadowBlur=6;
      x.fillStyle=skin.body;
      x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
      x.shadowBlur=0;
      x.fillStyle=skin.fold;
      x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.fill();
      x.strokeStyle='rgba(120,140,180,.5)'; x.lineWidth=1.6;
      x.beginPath(); x.moveTo(0,-22); x.lineTo(0,6); x.stroke();
    } else { // потерянная — пустой контур слота: видно, что место есть, а самолёта нет
      x.strokeStyle='rgba(150,170,210,.3)'; x.lineWidth=1.8;
      x.beginPath(); x.moveTo(0,-22); x.lineTo(-16,14); x.lineTo(0,6); x.lineTo(16,14); x.closePath(); x.stroke();
    }
    x.restore();
  }
}
function updateStarsHud(){ elPillStarsN.textContent = S.starsCollected;
  const c=$('starJewel'); if (c && !c._drawn){ c._drawn=1; drawStarJewel(c); } }
function drawStarJewel(c){ // v1.95.1 «Звезда-ювелирка»: счётчик звёзд — той же кистью, что жизни (v1.82.0 был плоским значком)
  const x=c.getContext('2d'); if(!x) return;
  x.setTransform(2,0,0,2,0,0); // canvas 32×32 → css 16×16: чётко на retina, как жизни
  x.clearRect(0,0,16,16);
  x.scale(16/24,16/24); // рисуем в привычной 24-сетке фирменной искры (i-star4)
  const grad=x.createLinearGradient(0,0,0,24);
  grad.addColorStop(0,'#fff3c4'); grad.addColorStop(.55,'#ffd76a'); grad.addColorStop(1,'#e8a94b'); // золото сверху вниз — как слиток
  x.shadowColor='rgba(255,200,80,.85)'; x.shadowBlur=4; // свечение — фамильное, как у живых жизней
  x.fillStyle=grad;
  x.beginPath();
  x.moveTo(12,2.8);
  x.bezierCurveTo(12.9,8, 16,11.1, 21.2,12);
  x.bezierCurveTo(16,12.9, 12.9,16, 12,21.2);
  x.bezierCurveTo(11.1,16, 8,12.9, 2.8,12);
  x.bezierCurveTo(8,11.1, 11.1,8, 12,2.8);
  x.closePath(); x.fill();
  x.shadowBlur=0;
  x.strokeStyle='rgba(255,255,255,.45)'; x.lineWidth=.8; // грань через центр — как сгиб у самолётиков-жизней
  x.beginPath(); x.moveTo(12,2.8); x.lineTo(12,21.2); x.stroke();
  x.fillStyle='#fffbe8'; x.beginPath(); x.arc(12,12,1.1,0,6.283); x.fill(); // искра в сердце — как у звёзд неба со средней ступени
}
