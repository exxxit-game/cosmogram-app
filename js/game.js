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
let lastWaypointSpawn=0; // 04.09.2026: trailFx:'waypoints' — редкие метки, не на каждый тик тягача (иначе слипнутся в пятно)
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
  {id:0,name:0,price:0,   body:'#efeee9',fold:'#cdcabf',glow:'rgba(230,229,225,.9)',trail:'rgba(200,198,190,', cat:'classic'}, // Бумажный — нейтральная бумага
  {id:1,name:1,price:150,   body:'#d6e8ff',fold:'#9cc0ee',glow:'rgba(96,164,255,.95)',trail:'rgba(96,164,255,', cat:'classic'},   // Лазурь — чистый синий (не циан!)
  {id:2,name:2,price:400,   body:'#fff3c8',fold:'#ecd38a',glow:'rgba(255,226,85,.95)', trail:'rgba(255,226,85,', cat:'classic'},  // Золото — жёлтое золото (тон 50°)
  {id:3,name:3,price:800,   body:'#ffd9dd',fold:'#e88a96',glow:'rgba(255,80,95,.95)',  trail:'rgba(255,80,95,', cat:'classic'},    // Алый — настоящий красный
  // Тир 2 — яркие: фирменная фишка + богатый след (только визуал, никаких бонусов!)
  {id:4,name:4,price:1500,   fx:'neon',   body:'#e4ffd6',fold:'#9fe081',glow:'rgba(120,255,80,.95)', trail:'rgba(120,255,80,', cat:'bright'}, // Неон — кислотно-зелёный
  {id:5,name:5,price:2500,   fx:'aurora', body:'#e6dcff',fold:'#b0a0e8',glow:'rgba(170,130,255,.95)',trail:'rgba(160,120,255,', cat:'bright'}, // Аврора — фиолет
  {id:6,name:6,price:4000,   fx:'plasma', body:'#ffe4cc',fold:'#f09c62',glow:'rgba(255,135,60,.95)', trail:'rgba(255,125,55,', cat:'bright'}, // Плазма — глубокий апельсин (тон 23°)
  // Тир 3 — легендарные: уникальное поведение корпуса
  {id:7,name:7,price:7000,   fx:'chrome', body:'#eceff3',fold:'#a7aeba',glow:'rgba(196,200,208,.95)',trail:'rgba(175,182,196,', cat:'legendary'}, // Хром — нейтральная сталь
  {id:8,name:8,price:12000,  fx:'ghost',  body:'#d8f4fa',fold:'#9cd8e4',glow:'rgba(130,235,245,.9)', trail:'rgba(120,225,240,', cat:'legendary'}, // Призрак — ледяной циан (тон 185°, единственный!)
  /* 04.09.2026 «Эксклюзивные скины за Stars» (владелец): 6 приёмов корпуса отобраны живьём
     через макет (project_premium_skins_visual_language в памяти) — satellites/facets/inlay/
     filigree/core/aim, реализованы в render.js:drawPlane(). premium:true — метка для
     Ангара/Тюнинга: цена ниже НЕ в ✦, покупка идёт через syncBuySkinInvoice()+openInvoice
     (sync.js/ui.js), не через S.wallet. price:200 — ЗАГЛУШКА (владелец ещё не назвал
     реальные цены в Stars), заменить при первом реальном решении. Цвета — тоже черновой
     подбор по принципу «развести по кругу, не повторять 9 выше», не финал, владелец должен
     увидеть вживую. */
  /* trailFx — второй слой, отдельный от fx (приём корпуса): свой язык следа/частиц, тоже
     отобран живьём через макет. Пары подобраны по смыслу (владелец не назначал явно,
     можно перетасовать): спутники↔обломки-спутники, грани-кристалл↔нить-жемчуг,
     самоцветы↔искры, золото-гравировка↔кометная пыль, реактор-ядро↔лента-энергия,
     слежение-прицел↔метки пути. */
  {id:9,  name:9,  price:1, premium:true, fx:'satellites', trailFx:'debris',   body:'#dde6ff',fold:'#9aa8e0',glow:'rgba(120,150,255,.95)',trail:'rgba(120,150,255,', cat:'stars'}, // Спутники — синь тона 230°
  {id:10, name:10, price:1, premium:true, fx:'facets',     trailFx:'pearls',   body:'#f4f2ff',fold:'#c9c3ea',glow:'rgba(210,200,255,.95)',trail:'rgba(210,200,255,', cat:'stars'}, // Грани — почти белый хрусталь
  {id:11, name:11, price:1, premium:true, fx:'inlay',      trailFx:'sparks',   body:'#ffe0ec',fold:'#e592b0',glow:'rgba(255,90,140,.95)', trail:'rgba(255,90,140,', cat:'stars'},  // Инкрустация — рубин, тон 340°
  {id:12, name:12, price:1, premium:true, fx:'filigree',   trailFx:'cometdust',body:'#fff0d6',fold:'#e0b46a',glow:'rgba(230,170,70,.95)', trail:'rgba(230,170,70,', cat:'stars'},  // Филигрань — старое золото, тон 35°
  {id:13, name:13, price:1, premium:true, fx:'core',       trailFx:'ribbon',   body:'#d8ffe8',fold:'#8ed9ac',glow:'rgba(70,220,130,.95)', trail:'rgba(70,220,130,', cat:'stars'},  // Ядро — изумруд, тон 140°
  {id:14, name:14, price:1, premium:true, fx:'aim',        trailFx:'waypoints',body:'#d2f6ff',fold:'#7fc9e0',glow:'rgba(60,190,230,.95)', trail:'rgba(60,190,230,', cat:'stars'},  // Прицел — электрик, тон 195°
  /* 05.09.2026 «добавляй все скины в игру, и они будут временно бесплатные»: 30 доп.
     скинов, отобраны владельцем через макеты этой сессии — render.js:PREM_FX_MAP (общий
     рендерер, не 30 копий кода, тот файл грузится раньше). tempFree:true — маркер для
     памяти/поиска, на логику не влияет: price:0 и отсутствие premium уже делают их
     обычной ✦-покупкой за 0 (как id:11 Сияние-иконка), без Stars-потока. Владелец гоняет
     каждый на слабом устройстве, время отрисовки — в BEACON('skin_perf', см. render.js:
     premSkinPerfReport) при каждой посадке. После анализа — перевести на premium:true +
     реальную цену в ⭐, tempFree убрать. */
  // 17 материалов — весь корпус перекрашен целиком, не пятно на нейтральном листе
  {id:15, name:15, price:0, tempFree:true, fx:'matGold',      body:'#fff3d6',fold:'#e0b46a',glow:'rgba(230,180,70,.95)', trail:'rgba(230,180,70,', cat:'materials'},  // Золото
  {id:16, name:16, price:0, tempFree:true, fx:'matSilver',    body:'#f4f6fa',fold:'#c2cad8',glow:'rgba(190,202,220,.95)',trail:'rgba(190,202,220,', cat:'materials'}, // Серебро
  {id:17, name:17, price:0, tempFree:true, fx:'matBronze',    body:'#f2ddc6',fold:'#b97a48',glow:'rgba(200,128,66,.95)', trail:'rgba(200,128,66,', cat:'materials'},  // Бронза
  {id:18, name:18, price:0, tempFree:true, fx:'matIce',       body:'#dff2fb',fold:'#b6dced',glow:'rgba(140,200,235,.95)',trail:'rgba(90,180,225,', cat:'materials'},  // Лёд/Хрусталь
  {id:19, name:19, price:0, tempFree:true, fx:'matEmerald',   body:'#0e5030',fold:'#0a3a22',glow:'rgba(30,150,90,.95)',  trail:'rgba(60,210,130,', cat:'materials'},  // Изумруд
  {id:20, name:20, price:0, tempFree:true, fx:'matObsidian',  body:'#2a2438',fold:'#1c1828',glow:'rgba(130,110,180,.85)',trail:'rgba(220,225,240,', cat:'materials'}, // Обсидиан
  {id:21, name:21, price:0, tempFree:true, fx:'matMarble',    body:'#efe7db',fold:'#d9cfba',glow:'rgba(220,210,195,.9)', trail:'rgba(190,178,160,', cat:'materials'}, // Мрамор (прямые лучи, v2 — см. feedback_macet_geometry_pitfalls)
  {id:22, name:22, price:0, tempFree:true, fx:'matNebula',    body:'#160e2e',fold:'#100a20',glow:'rgba(130,90,200,.9)',  trail:'rgba(140,110,220,', cat:'materials'}, // Туманность/галактика
  {id:23, name:23, price:0, tempFree:true, fx:'matOpal',      body:'#f3efe8',fold:'#d8cdbe',glow:'rgba(230,220,205,.9)', trail:'rgba(220,180,200,', cat:'materials'}, // Опал
  {id:24, name:24, price:0, tempFree:true, fx:'matVerdigris', body:'#c97a4a',fold:'#a05f36',glow:'rgba(150,110,70,.9)',  trail:'rgba(80,160,130,', cat:'materials'},  // Окисленная медь
  {id:25, name:25, price:0, tempFree:true, fx:'matCarbon',    body:'#181a1f',fold:'#101216',glow:'rgba(90,95,105,.85)', trail:'rgba(150,155,165,', cat:'materials'}, // Карбон
  {id:26, name:26, price:0, tempFree:true, fx:'matLava',      body:'#241f1c',fold:'#161310',glow:'rgba(200,90,40,.9)',  trail:'rgba(255,120,40,', cat:'materials'},  // Лава
  {id:27, name:27, price:0, tempFree:true, fx:'matRust',      body:'#8a5a3a',fold:'#6a4128',glow:'rgba(150,90,40,.9)',  trail:'rgba(150,70,30,', cat:'materials'},   // Ржавое железо
  {id:28, name:28, price:0, tempFree:true, fx:'matHoney',     body:'#7a4f18',fold:'#5c3b10',glow:'rgba(214,150,50,.9)', trail:'rgba(214,150,50,', cat:'materials'},  // Соты/янтарь
  {id:29, name:29, price:0, tempFree:true, fx:'matPlasma',    body:'#160b2e',fold:'#100821',glow:'rgba(150,90,220,.9)', trail:'rgba(130,90,220,', cat:'materials'},  // Плазма (материал, не путать с id6 fx:'plasma')
  {id:30, name:30, price:0, tempFree:true, fx:'matQuartz',    body:'#e9dbe0',fold:'#cbb0bc',glow:'rgba(200,150,175,.9)',trail:'rgba(200,150,175,', cat:'materials'}, // Кварц
  {id:31, name:31, price:0, tempFree:true, fx:'matWood',      body:'#a5713a',fold:'#7c4f22',glow:'rgba(180,130,70,.9)', trail:'rgba(180,130,70,', cat:'materials'},  // Дерево
  // 9 символов-сигилов — нейтральный борт + один гравированный знак строго по центру
  {id:32, name:32, price:0, tempFree:true, fx:'sigPenta',     body:'#efe0ff',fold:'#c9a8ec',glow:'rgba(190,110,255,.95)',trail:'rgba(190,110,255,', cat:'sigils'}, // Пентаграмма
  {id:33, name:33, price:0, tempFree:true, fx:'sigHexa',      body:'#ffe4d6',fold:'#eb9f7a',glow:'rgba(255,110,60,.95)', trail:'rgba(255,110,60,', cat:'sigils'},  // Гексаграмма
  {id:34, name:34, price:0, tempFree:true, fx:'sigMandala',   body:'#d6fff2',fold:'#7fdfc0',glow:'rgba(60,220,180,.95)', trail:'rgba(60,220,180,', cat:'sigils'},  // Мандала-розетка
  {id:35, name:35, price:0, tempFree:true, fx:'sigTriquetra', body:'#eaffd0',fold:'#b8e07a',glow:'rgba(170,220,60,.95)', trail:'rgba(170,220,60,', cat:'sigils'},  // Трикветра
  {id:36, name:36, price:0, tempFree:true, fx:'sigCompass',   body:'#e2e0ff',fold:'#a8a0e8',glow:'rgba(120,100,255,.95)',trail:'rgba(120,100,255,', cat:'sigils'}, // Роза ветров
  {id:37, name:37, price:0, tempFree:true, fx:'sigYinyang',   body:'#f0f0f0',fold:'#b8b8b8',glow:'rgba(180,180,180,.95)',trail:'rgba(180,180,180,', cat:'sigils'}, // Инь-Янь
  {id:38, name:38, price:0, tempFree:true, fx:'sigFlower',    body:'#dcffdf',fold:'#8fdd9a',glow:'rgba(80,220,110,.95)', trail:'rgba(80,220,110,', cat:'sigils'},  // Цветок жизни
  {id:39, name:39, price:0, tempFree:true, fx:'sigMaltese',   body:'#ffe0e6',fold:'#eb8ea0',glow:'rgba(240,70,100,.95)', trail:'rgba(240,70,100,', cat:'sigils'},  // Мальтийский крест
  {id:40, name:40, price:0, tempFree:true, fx:'sigSnowflake', body:'#dcf4ff',fold:'#8fcbe8',glow:'rgba(70,190,235,.95)', trail:'rgba(70,190,235,', cat:'sigils'},  // Кристалл-снежинка
  // 4 приёма иллюзии формы — нейтральный борт + узор внутренними линиями
  {id:41, name:41, price:0, tempFree:true, fx:'illLeather',   body:'#ffe9cc',fold:'#e0ad6a',glow:'rgba(220,150,60,.95)', trail:'rgba(220,150,60,', cat:'illusion'},  // Кожаная стёжка
  {id:42, name:42, price:0, tempFree:true, fx:'illTopo',      body:'#d8ffe0',fold:'#8fdb9e',glow:'rgba(70,210,120,.95)', trail:'rgba(70,210,120,', cat:'illusion'},  // Топографические линии
  {id:43, name:43, price:0, tempFree:true, fx:'illOrigami',   body:'#ffe0f0',fold:'#e08eb8',glow:'rgba(230,90,170,.95)', trail:'rgba(230,90,170,', cat:'illusion'},  // Оригами-заломы
  {id:44, name:44, price:0, tempFree:true, fx:'illLattice',   body:'#dcf0ff',fold:'#8fc0e0',glow:'rgba(70,170,220,.95)', trail:'rgba(70,170,220,', cat:'illusion'},  // Плетёная решётка
  // 05.09.2026 «Из макета в игру»: 4 новых материала. Цена 2500 — тот же тир, что «Аврора»
  // (fx-эффект, не просто цвет), проставлена сразу, не додумана втихую.
  {id:45, name:45, price:10, fx:'patPenrose',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'}, // Пенроуз — настоящая мозаика де Брёйна, проверена скриптом (одна длина стороны, 2 угла у всех 40 ромбов)
  {id:46, name:46, price:10, fx:'patLattice2',  body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'}, // Цветочная решётка
  {id:47, name:47, price:10, fx:'patCircles',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'}, // Плед из кругов
  {id:48, name:48, price:10, fx:'illCrystal',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'}  // Кристалл — гранёный корпус вместо гладкого металла/бумаги
];
/* 05.09.2026 «SKINS[id] тихо ломается при пропусках в id»: та же ловушка, что FLASHES/TRAILS/
   DECALS уже решили через X_BY_ID (прямая индексация по массиву верна ТОЛЬКО пока id идут
   подряд с нуля — стоит удалить/переставить один скин или добавить их не по порядку, и
   SKINS[id] тихо вернёт чужой скин или undefined, без единой ошибки в консоли). Заведено
   превентивно, пока в этой ветке id ещё случайно совпадают с позицией — не дожидаясь того
   же падения, что уже поймала параллельная сессия на своей ветке (id49+). */
const SKINS_BY_ID = new Map(SKINS.map(d=>[d.id,d]));
/* 05.09.2026 «След — 5-я вкладка» (владелец, после разбора): раньше след жил ВНУТРИ
   skin.trailFx (id 9-14 выше) и переключался только вместе со скином. Теперь это отдельный,
   независимый выбор — те же 6 языков следа, но выбираются отдельно от цвета и надеваются
   на любой скин. Явное решение владельца: старая пара скин→след НЕ переносится — все игроки
   стартуют с id:0 «Нет», сами выбирают заново. price:0 у всех шести — это не новый платный
   контент, просто те же 6 языков следа, что уже были в игре, ставшие независимыми. */
const TRAILS=[
  {id:0, name:'Нет',              price:0, style:''},
  {id:1, name:'Обломки-спутники', price:0, style:'debris', cat:'classic'},
  {id:2, name:'Нить-жемчуг',      price:0, style:'pearls', cat:'classic'},
  {id:3, name:'Искры',            price:0, style:'sparks', cat:'classic'},
  {id:4, name:'Кометная пыль',    price:0, style:'cometdust', cat:'classic'},
  {id:5, name:'Лента',            price:0, style:'ribbon', cat:'classic'},
  {id:6, name:'Метки пути',       price:0, style:'waypoints', cat:'classic'},
  {id:7, name:'Морзянка',         price:0, style:'morse', cat:'classic'}, // 05.09.2026: доделан хвост с прошлого раза — тумблер из Настроек убран, morseOn() уже проверяет именно этот стиль следа (core.js)
  {id:8, name:'Узел-петля',       price:10, style:'loopKnot', cat:'premium'},
  {id:9, name:'Волна-змейка',     price:10, style:'snakeWave', cat:'premium'},
  {id:10, name:'Сердце-узел',     price:10, style:'heartKnot', cat:'premium'},
  {id:11, name:'Созвездие-след',  price:10, style:'trailConstellation', cat:'premium'},
  {id:12, name:'Скрепка',         price:10, style:'paperclip', cat:'premium'},
  {id:13, name:'Радуга-арка',     price:10, style:'rainbowArc', cat:'premium'}, // спорный — на проверку
  {id:14, name:'Волны',           price:10, style:'waterWaves', cat:'premium'}, // спорный — на проверку
  /* 05.09.2026 «Кельтский плетёный жгут» — проекция спирали сбоку: y_k=sin(θ+k·2π/N),
     глубина z_k=cos(θ+k·2π/N) даёт честный перед/зад (совпадают только в точке
     пересечения) — та же математика, что у витой верёвки/косы в 3D. См. HUMAN-SYMBOLS.md. */
  {id:15, name:'Кельтский жгут',  price:10, style:'celticTwist', cat:'celtic', since:'1.478.83', fact:'Та же математика, что у витой верёвки — проекция спирали сбоку: y=sin(θ+k·2π/N), у этой фигуры: N=2 нити'},
  {id:16, name:'Кельтская коса',  price:10, style:'celticBraid', cat:'celtic', since:'1.478.83', fact:'Та же математика, что у настоящей косы — проекция спирали сбоку: y=sin(θ+k·2π/N), у этой фигуры: N=3 нити'},
];
const TRAILS_BY_ID = new Map(TRAILS.map(d=>[d.id,d]));
/* 28.08.2026 «Тюнинг, шаг 1»: первая независимая категория кастомизации, кроме цвета —
   декаль поверх корпуса. Каждая — готовый символ Unicode (эмодзи), не нарисована нами:
   ноль художественной работы, ноль решений «что правильно» — то, что уже есть в стандарте.
   Флаги стран сюда намеренно НЕ включены — там своя дыра (флаг-эмодзи не рисуется на
   Windows, показывается голый код страны текстом), нужен отдельный вендоренный SVG-набор,
   не эмодзи. Названия пока на русском — перевод на 5 языков отдельным следующим заходом
   (владелец: не тащить контент и языки одним заходом, риск ошибок выше). Цена — по подгруппам
   одним числом на всю подгруппу (не 63 отдельно подобранных числа): 80 — самые массовые
   (космос/зодиак/погода/смайлики/растения/шахматы), 120 — животные, 150 — фазы Луны (сет из
   восьми, дороже как коллекция), 350 — мифические существа и драгоценности/статус (владелец:
   «редкие/статусные вещи»), 60 — музыка (дёшево, это ещё и значок категории «Звук»). */
const DECALS=[
  {id:0, name:'Нет', price:0, ch:'', cat:'none'},
  // Космос
  {id:1, name:'Ракета', price:60, ch:'🚀', cat:'space'}, {id:2, name:'Тарелка', price:60, ch:'🛸', cat:'space'}, // 04.09.2026: были бесплатны — владелец поменял местами со Звездой/Соткой, см. ANGAR_FREEBIE (ui.js)
  {id:3, name:'Звезда', price:0, ch:'🌟', cat:'space'}, {id:4, name:'Комета', price:60, ch:'☄️', cat:'space'}, // 04.09.2026: Звезда теперь бесплатна — см. ANGAR_FREEBIE
   {id:6, name:'Полумесяц', price:60, ch:'🌙', cat:'space'},
  {id:7, name:'Пришелец', price:60, ch:'👽', cat:'space'}, {id:8, name:'Искра', price:60, ch:'✨', cat:'space'},
  {id:62, name:'Спутник', price:60, ch:'🛰️', cat:'space'},
  {id:64, name:'Телескоп', price:60, ch:'🔭', cat:'space'}, // 05.09.2026: id63 «Падающая звезда»/id65 «Млечный Путь» убраны владельцем
  // Зодиак
   
   
   
   
   
   
  // Погода/стихии
  {id:21, name:'Молния', price:60, ch:'⚡', cat:'weather'}, {id:22, name:'Радуга', price:60, ch:'🌈', cat:'weather'},
  {id:23, name:'Снежинка', price:60, ch:'❄️', cat:'weather'}, {id:24, name:'Волна', price:60, ch:'🌊', cat:'weather'},
  {id:25, name:'Смерч', price:60, ch:'🌪️', cat:'weather'}, {id:26, name:'Солнце', price:60, ch:'☀️', cat:'weather'},
  {id:66, name:'Циклон', price:60, ch:'🌀', cat:'weather'},
  {id:181, name:'Термометр', price:60, ch:'🌡️', cat:'weather'}, // 05.09.2026: id121 «Туман» убран владельцем
  // Смайлики
  {id:27, name:'Улыбка', price:60, ch:'😀', cat:'faces'}, {id:28, name:'Стиль', price:60, ch:'😎', cat:'faces'},
  {id:29, name:'Огонь', price:60, ch:'🔥', cat:'faces'}, {id:30, name:'Сотка', price:0, ch:'💯', cat:'faces'}, // 04.09.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
  {id:31, name:'Смех', price:60, ch:'😂', cat:'faces'}, {id:32, name:'Праздник', price:60, ch:'🥳', cat:'faces'},
  {id:68, name:'Взрыв мозга', price:60, ch:'🤯', cat:'faces'}, {id:69, name:'Озорство', price:60, ch:'😈', cat:'faces'},
  {id:70, name:'Ниндзя', price:60, ch:'🥷', cat:'faces'},
  {id:122, name:'Влюблён', price:60, ch:'😍', cat:'faces'}, {id:123, name:'В восторге', price:60, ch:'🤩', cat:'faces'},
  {id:124, name:'Сон', price:60, ch:'😴', cat:'faces'}, {id:125, name:'Холод', price:60, ch:'🥶', cat:'faces'},
  // Растения/природа
  {id:33, name:'Сакура', price:100, ch:'🌸', cat:'nature'}, {id:34, name:'Кактус', price:100, ch:'🌵', cat:'nature'},
  {id:35, name:'Пальма', price:100, ch:'🌴', cat:'nature'}, {id:36, name:'Клевер', price:100, ch:'🍀', cat:'nature'},
  {id:71, name:'Роза', price:100, ch:'🌹', cat:'nature'}, {id:72, name:'Гриб', price:100, ch:'🍄', cat:'nature'},
  
  {id:126, name:'Подсолнух', price:100, ch:'🌻', cat:'nature'}, {id:127, name:'Клён', price:100, ch:'🍁', cat:'nature'},
  {id:182, name:'Гибискус', price:100, ch:'🌺', cat:'nature'}, {id:183, name:'Колос', price:100, ch:'🌾', cat:'nature'},
  // Шахматы/карты
  {id:37, name:'Пешка', price:60, ch:'♟️', cat:'games'}, {id:39, name:'Пики', price:60, ch:'♠️', cat:'games'}, {id:40, name:'Червы', price:60, ch:'♥️', cat:'games'},
  {id:74, name:'Бубны', price:60, ch:'♦️', cat:'games'}, {id:75, name:'Трефы', price:60, ch:'♣️', cat:'games'},
  {id:76, name:'Кости', price:60, ch:'🎲', cat:'games'}, {id:77, name:'Мишень', price:60, ch:'🎯', cat:'games'},
  {id:184, name:'Джокер', price:60, ch:'🃏', cat:'games'}, {id:185, name:'Слот-машина', price:60, ch:'🎰', cat:'games'},
  // Животные
  {id:41, name:'Орёл', price:100, ch:'🦅', cat:'animals'}, {id:42, name:'Волк', price:100, ch:'🐺', cat:'animals'},
  {id:43, name:'Лев (зверь)', price:100, ch:'🦁', cat:'animals'}, {id:44, name:'Лиса', price:100, ch:'🦊', cat:'animals'},
  {id:78, name:'Тигр', price:100, ch:'🐯', cat:'animals'}, {id:79, name:'Акула', price:100, ch:'🦈', cat:'animals'},
  {id:80, name:'Сова', price:100, ch:'🦉', cat:'animals'}, {id:81, name:'Медведь', price:100, ch:'🐻', cat:'animals'},
  {id:82, name:'Панда', price:100, ch:'🐼', cat:'animals'}, {id:83, name:'Слон', price:100, ch:'🐘', cat:'animals'},
  {id:84, name:'Носорог', price:100, ch:'🦏', cat:'animals'}, {id:85, name:'Жираф', price:100, ch:'🦒', cat:'animals'},
  {id:86, name:'Зебра', price:100, ch:'🦓', cat:'animals'}, {id:87, name:'Олень', price:100, ch:'🦌', cat:'animals'},
  {id:88, name:'Леопард', price:100, ch:'🐆', cat:'animals'}, {id:89, name:'Летучая мышь', price:100, ch:'🦇', cat:'animals'},
  {id:90, name:'Крокодил', price:100, ch:'🐊', cat:'animals'}, {id:91, name:'Скорпион', price:100, ch:'🦂', cat:'animals'},
  {id:92, name:'Паук', price:100, ch:'🕷️', cat:'animals'}, {id:93, name:'Ящерица', price:100, ch:'🦎', cat:'animals'},
  {id:94, name:'Осьминог', price:100, ch:'🐙', cat:'animals'}, {id:95, name:'Кальмар', price:100, ch:'🦑', cat:'animals'},
  {id:96, name:'Кит', price:100, ch:'🐋', cat:'animals'}, {id:97, name:'Дельфин', price:100, ch:'🐬', cat:'animals'},
  {id:98, name:'Тираннозавр', price:100, ch:'🦖', cat:'animals'}, {id:99, name:'Динозавр', price:100, ch:'🦕', cat:'animals'},
  {id:100, name:'Павлин', price:100, ch:'🦚', cat:'animals'}, {id:101, name:'Фламинго', price:100, ch:'🦩', cat:'animals'},
  {id:102, name:'Пчела', price:100, ch:'🐝', cat:'animals'}, {id:103, name:'Бабочка', price:100, ch:'🦋', cat:'animals'},
  {id:186, name:'Ленивец', price:100, ch:'🦥', cat:'animals'}, {id:187, name:'Ёж', price:100, ch:'🦔', cat:'animals'},
  {id:188, name:'Черепаха', price:100, ch:'🐢', cat:'animals'}, {id:189, name:'Попугай', price:100, ch:'🦜', cat:'animals'},
  {id:190, name:'Улитка', price:100, ch:'🐌', cat:'animals'},
  // Фазы Луны (сет)
  {id:45, name:'Новолуние', price:100, ch:'🌑', cat:'moon'}, {id:46, name:'Растущий серп', price:100, ch:'🌒', cat:'moon'},
  {id:47, name:'Первая четверть', price:100, ch:'🌓', cat:'moon'}, {id:48, name:'Растущая Луна', price:100, ch:'🌔', cat:'moon'},
  {id:49, name:'Полнолуние', price:100, ch:'🌕', cat:'moon'}, {id:50, name:'Убывающая Луна', price:100, ch:'🌖', cat:'moon'},
  {id:51, name:'Последняя четверть', price:100, ch:'🌗', cat:'moon'}, {id:52, name:'Убывающий серп', price:100, ch:'🌘', cat:'moon'},
  // Музыка (тот же значок ещё пригодится категории «Звук»)
  {id:53, name:'Нота', price:100, ch:'🎵', cat:'music'}, {id:54, name:'Гитара', price:100, ch:'🎸', cat:'music'},
  {id:55, name:'Наушники', price:100, ch:'🎧', cat:'music'},
  {id:104, name:'Пианино', price:100, ch:'🎹', cat:'music'}, {id:105, name:'Барабан', price:100, ch:'🥁', cat:'music'},
  {id:106, name:'Труба', price:100, ch:'🎺', cat:'music'}, {id:107, name:'Скрипка', price:100, ch:'🎻', cat:'music'},
  {id:191, name:'Саксофон', price:100, ch:'🎷', cat:'music'},
  // Мифические существа — редкое/статусное
  {id:56, name:'Дракон', price:300, ch:'🐉', cat:'myth'}, {id:57, name:'Единорог', price:300, ch:'🦄', cat:'myth'},
  {id:58, name:'Дракон (лицо)', price:300, ch:'🐲', cat:'myth'},
  {id:108, name:'Призрак', price:300, ch:'👻', cat:'myth'}, {id:109, name:'Джинн', price:300, ch:'🧞', cat:'myth'},
  {id:110, name:'Русалка', price:300, ch:'🧜', cat:'myth'}, {id:111, name:'Демон', price:300, ch:'👹', cat:'myth'},
  {id:112, name:'Тэнгу', price:300, ch:'👺', cat:'myth'},
  {id:192, name:'Зомби', price:300, ch:'🧟', cat:'myth'},
  // Драгоценности/статус — редкое/статусное
  {id:59, name:'Алмаз', price:300, ch:'💎', cat:'status'}, {id:60, name:'Корона', price:300, ch:'👑', cat:'status'},
  {id:61, name:'Мешок звёзд', price:300, ch:'💰', cat:'status'},
  {id:113, name:'Кубок', price:300, ch:'🏆', cat:'status'}, 
  {id:115, name:'Кольцо', price:300, ch:'💍', cat:'status'}, {id:116, name:'Трезубец', price:300, ch:'🔱', cat:'status'},
   {id:118, name:'Лилия', price:300, ch:'⚜️', cat:'status'},
   
  
  // 29.08.2026 «ещё больше разнообразия» (владелец) — семь новых категорий разом,
  // за пределами исходной темы «космос/зодиак/природа»: транспорт, еда, спорт, техника,
  // мода, символы, ландшафт. Флаги стран и религиозные символы сознательно не берём —
  // первые не рисуются на Windows (см. комментарий выше), вторые могут задеть.
  // Транспорт
  {id:128, name:'Машина', price:60, ch:'🚗', cat:'vehicles'}, {id:129, name:'Гонка', price:60, ch:'🏎️', cat:'vehicles'},
  {id:130, name:'Вертолёт', price:60, ch:'🚁', cat:'vehicles'}, {id:131, name:'Яхта', price:60, ch:'⛵', cat:'vehicles'},
  {id:132, name:'Самолёт', price:60, ch:'✈️', cat:'vehicles'}, {id:133, name:'Самолётик', price:60, ch:'🛩️', cat:'vehicles'},
  {id:134, name:'Корабль', price:60, ch:'🚢', cat:'vehicles'}, {id:135, name:'Поезд', price:60, ch:'🚂', cat:'vehicles'},
  {id:136, name:'Якорь', price:60, ch:'⚓', cat:'vehicles'},
  // Еда
  {id:137, name:'Пицца', price:60, ch:'🍕', cat:'food'}, {id:138, name:'Пончик', price:60, ch:'🍩', cat:'food'},
  {id:139, name:'Мороженое', price:60, ch:'🍦', cat:'food'}, {id:140, name:'Арбуз', price:60, ch:'🍉', cat:'food'},
  {id:141, name:'Бургер', price:60, ch:'🍔', cat:'food'}, {id:142, name:'Тако', price:60, ch:'🌮', cat:'food'},
  {id:143, name:'Вишня', price:60, ch:'🍒', cat:'food'}, {id:144, name:'Шоколад', price:60, ch:'🍫', cat:'food'},
  // Спорт
  {id:145, name:'Футбол', price:60, ch:'⚽', cat:'sport'}, {id:146, name:'Баскетбол', price:60, ch:'🏀', cat:'sport'},
  {id:147, name:'Боулинг', price:60, ch:'🎳', cat:'sport'}, {id:148, name:'Бокс', price:60, ch:'🥊', cat:'sport'},
  {id:149, name:'Регби', price:60, ch:'🏈', cat:'sport'}, {id:150, name:'Теннис', price:60, ch:'🎾', cat:'sport'},
  {id:151, name:'Волейбол', price:60, ch:'🏐', cat:'sport'}, {id:152, name:'Скейт', price:60, ch:'🛹', cat:'sport'},
  // Техника
  {id:153, name:'Ноутбук', price:180, ch:'💻', cat:'tech'}, {id:154, name:'Джойстик', price:180, ch:'🕹️', cat:'tech'},
  {id:155, name:'Антенна', price:180, ch:'📡', cat:'tech'}, {id:156, name:'Батарея', price:180, ch:'🔋', cat:'tech'},
  {id:157, name:'Камера', price:180, ch:'📷', cat:'tech'}, {id:158, name:'Лампочка', price:180, ch:'💡', cat:'tech'},
  {id:159, name:'Магнит', price:180, ch:'🧲', cat:'tech'}, {id:160, name:'Шестерёнка', price:180, ch:'⚙️', cat:'tech'},
  // Мода
  {id:161, name:'Цилиндр', price:100, ch:'🎩', cat:'fashion'}, {id:162, name:'Очки', price:100, ch:'🕶️', cat:'fashion'},
  {id:163, name:'Кроссовок', price:100, ch:'👟', cat:'fashion'}, {id:164, name:'Галстук', price:100, ch:'👔', cat:'fashion'},
  {id:165, name:'Помада', price:100, ch:'💄', cat:'fashion'}, {id:166, name:'Кепка', price:100, ch:'🧢', cat:'fashion'},
  // Символы — особенное/редкое
   
   {id:170, name:'Внимание', price:100, ch:'⚠️', cat:'symbols'},
  {id:171, name:'Радиация', price:100, ch:'☢️', cat:'symbols'}, {id:172, name:'Биоопасность', price:100, ch:'☣️', cat:'symbols'},
  {id:173, name:'Хрустальный шар', price:100, ch:'🔮', cat:'symbols'}, {id:174, name:'Компас', price:100, ch:'🧭', cat:'symbols'},
  // Ландшафт
  {id:175, name:'Вулкан', price:60, ch:'🌋', cat:'landscape'}, {id:176, name:'Гора', price:60, ch:'🏔️', cat:'landscape'},
   
   
  // Праздники
  {id:196, name:'Ёлка', price:100, ch:'🎄', cat:'holidays'}, {id:197, name:'Тыква', price:100, ch:'🎃', cat:'holidays'},
  {id:198, name:'Салют', price:100, ch:'🎆', cat:'holidays'}, {id:199, name:'Шарик', price:100, ch:'🎈', cat:'holidays'},
  {id:200, name:'Подарок', price:100, ch:'🎁', cat:'holidays'}, {id:201, name:'Свеча', price:100, ch:'🕯️', cat:'holidays'},
  // Ориентиры
   {id:203, name:'Статуя Свободы', price:180, ch:'🗽', cat:'landmarks'},
  {id:204, name:'Колесо обозрения', price:180, ch:'🎡', cat:'landmarks'}, {id:205, name:'Горки', price:180, ch:'🎢', cat:'landmarks'},
   {id:207, name:'Башня', price:180, ch:'🗼', cat:'landmarks'},
  // Наука — особенное/редкое
  {id:208, name:'Пробирка', price:180, ch:'🧪', cat:'science'}, {id:209, name:'ДНК', price:180, ch:'🧬', cat:'science'},
  {id:210, name:'Микроскоп', price:180, ch:'🔬', cat:'science'}, {id:211, name:'Чашка Петри', price:180, ch:'🧫', cat:'science'},
  {id:212, name:'Перегонный куб', price:180, ch:'⚗️', cat:'science'},
  /* 29.08.2026 «флаги стран нужно добавить, проверить» (владелец): раньше сознательно
     не брали — флаг-эмодзи на части Windows-шрифтов рисуется двумя буквами в рамке
     вместо картинки (regional indicator pair без лигатуры). Владелец попросил
     тестовую партию, проверит на своём ноуте вживую перед остальными ~190 странами —
     ровно та же дисциплина, что у любого визуального бага под конкретное устройство:
     сначала доказательство с реального экрана, потом решение брать остальные или нет. */
  {id:213, name:'Россия', price:100, ch:'🇷🇺', cat:'flags'}, {id:214, name:'США', price:100, ch:'🇺🇸', cat:'flags'},
  {id:215, name:'Испания', price:100, ch:'🇪🇸', cat:'flags'}, {id:216, name:'Португалия', price:100, ch:'🇵🇹', cat:'flags'},
  {id:217, name:'Франция', price:100, ch:'🇫🇷', cat:'flags'},
  
  {id:219, name:'Сердце-стрела', price:100, ch:'💘', cat:'hearts'},
  {id:220, name:'Сердце с лентой', price:100, ch:'💝', cat:'hearts'},
  {id:221, name:'Искрящееся сердце', price:100, ch:'💖', cat:'hearts'},
  {id:222, name:'Растущее сердце', price:100, ch:'💗', cat:'hearts'},
  {id:223, name:'Бьющееся сердце', price:100, ch:'💓', cat:'hearts'},
  {id:224, name:'Кружащиеся сердца', price:100, ch:'💞', cat:'hearts'},
  {id:225, name:'Два сердца', price:100, ch:'💕', cat:'hearts'},
  
  {id:227, name:'Сердце-восклицание', price:100, ch:'❣️', cat:'hearts'},
  {id:228, name:'Разбитое сердце', price:100, ch:'💔', cat:'hearts'},
  {id:229, name:'Красное сердце', price:100, ch:'❤️', cat:'hearts'},
  
  {id:231, name:'Оранжевое сердце', price:100, ch:'🧡', cat:'hearts'},
  {id:232, name:'Жёлтое сердце', price:100, ch:'💛', cat:'hearts'},
  {id:233, name:'Зелёное сердце', price:100, ch:'💚', cat:'hearts'},
  {id:234, name:'Синее сердце', price:100, ch:'💙', cat:'hearts'},
  
  {id:236, name:'Фиолетовое сердце', price:100, ch:'💜', cat:'hearts'},
  {id:237, name:'Коричневое сердце', price:100, ch:'🤎', cat:'hearts'},
  {id:238, name:'Чёрное сердце', price:100, ch:'🖤', cat:'hearts'},
  
  {id:240, name:'Белое сердце', price:100, ch:'🤍', cat:'hearts'},
  {id:241, name:'След поцелуя', price:180, ch:'💋', cat:'fx'},
  {id:242, name:'Символ гнева', price:180, ch:'💢', cat:'fx'},
  
  {id:244, name:'Столкновение', price:180, ch:'💥', cat:'fx'},
  {id:245, name:'Головокружение', price:180, ch:'💫', cat:'fx'},
  {id:246, name:'Капли пота', price:180, ch:'💦', cat:'fx'},
  {id:247, name:'Стремительный уход', price:180, ch:'💨', cat:'fx'},
  {id:248, name:'Дыра', price:180, ch:'🕳️', cat:'fx'},
  {id:249, name:'Речевой пузырь', price:180, ch:'💬', cat:'fx'},
  {id:250, name:'Пузырь слева', price:180, ch:'🗨️', cat:'fx'},
  {id:251, name:'Пузырь гнева', price:180, ch:'🗯️', cat:'fx'},
  {id:252, name:'Пузырь мысли', price:180, ch:'💭', cat:'fx'},
  {id:253, name:'Храп ZZZ', price:180, ch:'💤', cat:'fx'},
  {id:254, name:'Морда обезьяны', price:100, ch:'🐵', cat:'animals'},
  {id:255, name:'Обезьяна', price:100, ch:'🐒', cat:'animals'},
  {id:256, name:'Горилла', price:100, ch:'🦍', cat:'animals'},
  {id:257, name:'Орангутан', price:100, ch:'🦧', cat:'animals'},
  {id:258, name:'Морда собаки', price:100, ch:'🐶', cat:'animals'},
  {id:259, name:'Собака', price:100, ch:'🐕', cat:'animals'},
  {id:260, name:'Собака-поводырь', price:100, ch:'🦮', cat:'animals'},
  {id:261, name:'Пудель', price:100, ch:'🐩', cat:'animals'},
  {id:262, name:'Енот', price:100, ch:'🦝', cat:'animals'},
  {id:263, name:'Морда кота', price:100, ch:'🐱', cat:'animals'},
  {id:264, name:'Кот', price:100, ch:'🐈', cat:'animals'},
  {id:265, name:'Тигр (мордочка)', price:100, ch:'🐅', cat:'animals'},
  {id:266, name:'Морда лошади', price:100, ch:'🐴', cat:'animals'},
  
  
  
  {id:270, name:'Бизон', price:100, ch:'🦬', cat:'animals'},
  {id:271, name:'Морда коровы', price:100, ch:'🐮', cat:'animals'},
  {id:272, name:'Вол', price:100, ch:'🐂', cat:'animals'},
  {id:273, name:'Буйвол', price:100, ch:'🐃', cat:'animals'},
  {id:274, name:'Корова', price:100, ch:'🐄', cat:'animals'},
  {id:275, name:'Морда свиньи', price:100, ch:'🐷', cat:'animals'},
  {id:276, name:'Свинья', price:100, ch:'🐖', cat:'animals'},
  {id:277, name:'Кабан', price:100, ch:'🐗', cat:'animals'},
  {id:278, name:'Пятачок', price:100, ch:'🐽', cat:'animals'},
  {id:279, name:'Баран', price:100, ch:'🐏', cat:'animals'},
  {id:280, name:'Овца', price:100, ch:'🐑', cat:'animals'},
  {id:281, name:'Коза', price:100, ch:'🐐', cat:'animals'},
  {id:282, name:'Верблюд', price:100, ch:'🐪', cat:'animals'},
  {id:283, name:'Двугорбый верблюд', price:100, ch:'🐫', cat:'animals'},
  {id:284, name:'Лама', price:100, ch:'🦙', cat:'animals'},
  {id:285, name:'Мамонт', price:100, ch:'🦣', cat:'animals'},
  {id:286, name:'Бегемот', price:100, ch:'🦛', cat:'animals'},
  {id:287, name:'Морда мыши', price:100, ch:'🐭', cat:'animals'},
  {id:288, name:'Мышь', price:100, ch:'🐁', cat:'animals'},
  {id:289, name:'Крыса', price:100, ch:'🐀', cat:'animals'},
  {id:290, name:'Хомяк', price:100, ch:'🐹', cat:'animals'},
  {id:291, name:'Морда кролика', price:100, ch:'🐰', cat:'animals'},
  {id:292, name:'Кролик', price:100, ch:'🐇', cat:'animals'},
  {id:293, name:'Бурундук', price:100, ch:'🐿️', cat:'animals'},
  {id:294, name:'Бобр', price:100, ch:'🦫', cat:'animals'},
  {id:295, name:'Коала', price:100, ch:'🐨', cat:'animals'},
  {id:296, name:'Выдра', price:100, ch:'🦦', cat:'animals'},
  {id:297, name:'Скунс', price:100, ch:'🦨', cat:'animals'},
  {id:298, name:'Кенгуру', price:100, ch:'🦘', cat:'animals'},
  {id:299, name:'Барсук', price:100, ch:'🦡', cat:'animals'},
  {id:300, name:'Следы лап', price:100, ch:'🐾', cat:'animals'},
  {id:301, name:'Индюк', price:100, ch:'🦃', cat:'animals'},
  {id:302, name:'Курица', price:100, ch:'🐔', cat:'animals'},
  {id:303, name:'Петух', price:100, ch:'🐓', cat:'animals'},
  {id:304, name:'Вылупляющийся цыплёнок', price:100, ch:'🐣', cat:'animals'},
  {id:305, name:'Цыплёнок', price:100, ch:'🐤', cat:'animals'},
  {id:306, name:'Цыплёнок анфас', price:100, ch:'🐥', cat:'animals'},
  {id:307, name:'Птица', price:100, ch:'🐦', cat:'animals'},
  {id:308, name:'Пингвин', price:100, ch:'🐧', cat:'animals'},
  {id:309, name:'Голубь', price:100, ch:'🕊️', cat:'animals'},
  {id:310, name:'Утка', price:100, ch:'🦆', cat:'animals'},
  {id:311, name:'Лебедь', price:100, ch:'🦢', cat:'animals'},
  {id:312, name:'Додо', price:100, ch:'🦤', cat:'animals'},
  
  
  
  {id:316, name:'Лягушка', price:100, ch:'🐸', cat:'animals'},
  {id:317, name:'Змея', price:100, ch:'🐍', cat:'animals'},
  {id:318, name:'Фонтанирующий кит', price:100, ch:'🐳', cat:'sealife'},
  
  {id:320, name:'Тюлень', price:100, ch:'🦭', cat:'sealife'},
  {id:321, name:'Рыба', price:100, ch:'🐟', cat:'sealife'},
  {id:322, name:'Тропическая рыба', price:100, ch:'🐠', cat:'sealife'},
  {id:323, name:'Рыба-шар', price:100, ch:'🐡', cat:'sealife'},
  {id:324, name:'Ракушка', price:100, ch:'🐚', cat:'sealife'},
  
  
  {id:327, name:'Краб', price:100, ch:'🦀', cat:'sealife'},
  {id:328, name:'Омар', price:100, ch:'🦞', cat:'sealife'},
  {id:329, name:'Креветка', price:100, ch:'🦐', cat:'sealife'},
  {id:330, name:'Устрица', price:100, ch:'🦪', cat:'sealife'},
  {id:331, name:'Букашка', price:180, ch:'🐛', cat:'bugs'},
  {id:332, name:'Муравей', price:180, ch:'🐜', cat:'bugs'},
  
  {id:334, name:'Божья коровка', price:180, ch:'🐞', cat:'bugs'},
  {id:335, name:'Сверчок', price:180, ch:'🦗', cat:'bugs'},
  
  {id:337, name:'Паутина', price:180, ch:'🕸️', cat:'bugs'},
  {id:338, name:'Комар', price:180, ch:'🦟', cat:'bugs'},
  
  
  {id:341, name:'Микроб', price:180, ch:'🦠', cat:'bugs'},
  {id:342, name:'Букет', price:100, ch:'💐', cat:'nature'},
  {id:343, name:'Белый цветок', price:100, ch:'💮', cat:'nature'},
  {id:344, name:'Розетка-цветок', price:100, ch:'🏵️', cat:'nature'},
  {id:345, name:'Увядший цветок', price:100, ch:'🥀', cat:'nature'},
  {id:346, name:'Цветение', price:100, ch:'🌼', cat:'nature'},
  {id:347, name:'Тюльпан', price:100, ch:'🌷', cat:'nature'},
  
  {id:349, name:'Росток', price:100, ch:'🌱', cat:'nature'},
  
  {id:351, name:'Вечнозелёное дерево', price:100, ch:'🌲', cat:'nature'},
  {id:352, name:'Лиственное дерево', price:100, ch:'🌳', cat:'nature'},
  {id:353, name:'Трава-приправа', price:100, ch:'🌿', cat:'nature'},
  {id:354, name:'Трилистник', price:100, ch:'☘️', cat:'nature'},
  {id:355, name:'Опавший лист', price:100, ch:'🍂', cat:'nature'},
  {id:356, name:'Лист на ветру', price:100, ch:'🍃', cat:'nature'},
  
  
  
  {id:360, name:'Глобус: Европа-Африка', price:60, ch:'🌍', cat:'landscape'},
  {id:361, name:'Глобус: Америка', price:60, ch:'🌎', cat:'landscape'},
  {id:362, name:'Глобус: Азия-Австралия', price:60, ch:'🌏', cat:'landscape'},
  {id:363, name:'Глобус с меридианами', price:60, ch:'🌐', cat:'landscape'},
  
  
  {id:366, name:'Гора (вектор эмодзи)', price:60, ch:'⛰️', cat:'landscape'},
  
  {id:368, name:'Фудзияма', price:60, ch:'🗻', cat:'landscape'},
  {id:369, name:'Кемпинг', price:60, ch:'🏕️', cat:'landscape'},
  
  
  
  
  
  
  
  
  {id:378, name:'Хижина (эмодзи)', price:180, ch:'🛖', cat:'landmarks'},
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  {id:396, name:'Фонтан', price:180, ch:'⛲', cat:'landmarks'},
  {id:397, name:'Палатка', price:180, ch:'⛺', cat:'landmarks'},
  
  
  
  
  
  {id:403, name:'Горячие источники', price:180, ch:'♨️', cat:'landmarks'},
  {id:404, name:'Карусель', price:180, ch:'🎠', cat:'landmarks'},
  
  {id:406, name:'Вывеска парикмахерской', price:180, ch:'💈', cat:'landmarks'},
  {id:407, name:'Цирковой шатёр', price:180, ch:'🎪', cat:'landmarks'},
  {id:408, name:'Вагон', price:60, ch:'🚃', cat:'vehicles'},
  {id:409, name:'Скоростной поезд', price:60, ch:'🚄', cat:'vehicles'},
  {id:410, name:'Поезд-пуля', price:60, ch:'🚅', cat:'vehicles'},
  {id:411, name:'Поезд', price:60, ch:'🚆', cat:'vehicles'},
  {id:412, name:'Метро', price:60, ch:'🚇', cat:'vehicles'},
  {id:413, name:'Лёгкое метро', price:60, ch:'🚈', cat:'vehicles'},
  {id:414, name:'Станция', price:60, ch:'🚉', cat:'vehicles'},
  {id:415, name:'Трамвай (эмодзи)', price:60, ch:'🚊', cat:'vehicles'},
  {id:416, name:'Монорельс', price:60, ch:'🚝', cat:'vehicles'},
  {id:417, name:'Горная железная дорога', price:60, ch:'🚞', cat:'vehicles'},
  {id:418, name:'Трамвайный вагон', price:60, ch:'🚋', cat:'vehicles'},
  {id:419, name:'Автобус', price:60, ch:'🚌', cat:'vehicles'},
  {id:420, name:'Автобус навстречу', price:60, ch:'🚍', cat:'vehicles'},
  {id:421, name:'Троллейбус', price:60, ch:'🚎', cat:'vehicles'},
  {id:422, name:'Маршрутка', price:60, ch:'🚐', cat:'vehicles'},
  {id:423, name:'Скорая помощь', price:60, ch:'🚑', cat:'vehicles'},
  {id:424, name:'Пожарная машина', price:60, ch:'🚒', cat:'vehicles'},
  {id:425, name:'Полицейская машина', price:60, ch:'🚓', cat:'vehicles'},
  {id:426, name:'Полиция навстречу', price:60, ch:'🚔', cat:'vehicles'},
  {id:427, name:'Такси', price:60, ch:'🚕', cat:'vehicles'},
  {id:428, name:'Такси навстречу', price:60, ch:'🚖', cat:'vehicles'},
  {id:429, name:'Машина навстречу', price:60, ch:'🚘', cat:'vehicles'},
  {id:430, name:'Внедорожник', price:60, ch:'🚙', cat:'vehicles'},
  {id:431, name:'Пикап', price:60, ch:'🛻', cat:'vehicles'},
  {id:432, name:'Фургон доставки', price:60, ch:'🚚', cat:'vehicles'},
  {id:433, name:'Фура', price:60, ch:'🚛', cat:'vehicles'},
  {id:434, name:'Трактор (эмодзи)', price:60, ch:'🚜', cat:'vehicles'},
  {id:435, name:'Мотоцикл (эмодзи)', price:60, ch:'🏍️', cat:'vehicles'},
  {id:436, name:'Мотороллер', price:60, ch:'🛵', cat:'vehicles'},
  {id:437, name:'Инвалидная коляска', price:60, ch:'🦽', cat:'vehicles'},
  {id:438, name:'Электроколяска', price:60, ch:'🦼', cat:'vehicles'},
  {id:439, name:'Тук-тук', price:60, ch:'🛺', cat:'vehicles'},
  {id:440, name:'Велосипед (эмодзи)', price:60, ch:'🚲', cat:'vehicles'},
  {id:441, name:'Самокат', price:60, ch:'🛴', cat:'vehicles'},
  {id:442, name:'Ролик', price:60, ch:'🛼', cat:'vehicles'},
  {id:443, name:'Автобусная остановка', price:60, ch:'🚏', cat:'vehicles'},
  {id:444, name:'Автомагистраль', price:60, ch:'🛣️', cat:'vehicles'},
  {id:445, name:'Рельсы', price:60, ch:'🛤️', cat:'vehicles'},
  {id:446, name:'Бочка нефти', price:60, ch:'🛢️', cat:'vehicles'},
  {id:447, name:'Бензоколонка', price:60, ch:'⛽', cat:'vehicles'},
  
  {id:449, name:'Мигалка', price:60, ch:'🚨', cat:'vehicles'},
  {id:450, name:'Светофор (гориз.)', price:60, ch:'🚥', cat:'vehicles'},
  {id:451, name:'Светофор', price:60, ch:'🚦', cat:'vehicles'},
  
  {id:453, name:'Дорожные работы', price:60, ch:'🚧', cat:'vehicles'},
  
  {id:455, name:'Каноэ', price:60, ch:'🛶', cat:'vehicles'},
  {id:456, name:'Катер', price:60, ch:'🚤', cat:'vehicles'},
  {id:457, name:'Пассажирский лайнер', price:60, ch:'🛳️', cat:'vehicles'},
  {id:458, name:'Паром', price:60, ch:'⛴️', cat:'vehicles'},
  {id:459, name:'Моторная лодка', price:60, ch:'🛥️', cat:'vehicles'},
  {id:460, name:'Вылет самолёта', price:60, ch:'🛫', cat:'vehicles'},
  {id:461, name:'Прилёт самолёта', price:60, ch:'🛬', cat:'vehicles'},
  
  {id:463, name:'Кресло салона', price:60, ch:'💺', cat:'vehicles'},
  
  
  
  {id:467, name:'Колокольчик портье', price:180, ch:'🛎️', cat:'landmarks'},
  {id:468, name:'Чемодан', price:180, ch:'🧳', cat:'landmarks'},
  {id:469, name:'Новолуние с лицом', price:60, ch:'🌚', cat:'weather'},
  {id:470, name:'Первая четверть с лицом', price:60, ch:'🌛', cat:'weather'},
  {id:471, name:'Последняя четверть с лицом', price:60, ch:'🌜', cat:'weather'},
  {id:472, name:'Полнолуние с лицом', price:60, ch:'🌝', cat:'weather'},
  {id:473, name:'Солнце с лицом', price:60, ch:'🌞', cat:'weather'},
  {id:474, name:'Звезда (эмодзи)', price:60, ch:'⭐', cat:'weather'},
  
  
  
  
  
  
  {id:481, name:'Ветер с лицом', price:60, ch:'🌬️', cat:'weather'},
  
  
  
  
  {id:486, name:'Снеговик', price:60, ch:'☃️', cat:'weather'},
  {id:487, name:'Снеговик без снега', price:60, ch:'⛄', cat:'weather'},
  {id:488, name:'Капля (эмодзи)', price:60, ch:'💧', cat:'weather'},
  
  
  {id:491, name:'Восторг', price:60, ch:'😃', cat:'faces'},
  {id:492, name:'Радость', price:60, ch:'😄', cat:'faces'},
  {id:493, name:'Сияние', price:60, ch:'😁', cat:'faces'},
  {id:494, name:'Хохот', price:60, ch:'😆', cat:'faces'},
  {id:495, name:'Неловкость', price:60, ch:'😅', cat:'faces'},
  {id:496, name:'Ржач', price:60, ch:'🤣', cat:'faces'},
  {id:497, name:'Спокойствие', price:60, ch:'🙂', cat:'faces'},
  {id:498, name:'Вверх ногами', price:60, ch:'🙃', cat:'faces'},
  {id:499, name:'Подмигивание', price:60, ch:'😉', cat:'faces'},
  {id:500, name:'Тепло', price:60, ch:'😊', cat:'faces'},
  {id:501, name:'Ангелочек', price:60, ch:'😇', cat:'faces'},
  {id:502, name:'Обожание', price:60, ch:'🥰', cat:'faces'},
  {id:503, name:'Поцелуй', price:60, ch:'😘', cat:'faces'},
  {id:504, name:'Чмок', price:60, ch:'😗', cat:'faces'},
  {id:505, name:'Довольство', price:60, ch:'☺️', cat:'faces'},
  {id:506, name:'Нежность', price:60, ch:'😚', cat:'faces'},
  {id:507, name:'Ласка', price:60, ch:'😙', cat:'faces'},
  {id:508, name:'Растрогало', price:60, ch:'🥲', cat:'faces'},
  {id:509, name:'Вкусно', price:60, ch:'😋', cat:'faces'},
  {id:510, name:'Дразнилка', price:60, ch:'😛', cat:'faces'},
  {id:511, name:'Шалость', price:60, ch:'😜', cat:'faces'},
  {id:512, name:'Дурачество', price:60, ch:'🤪', cat:'faces'},
  {id:513, name:'Кривляние', price:60, ch:'😝', cat:'faces'},
  {id:514, name:'Жажда денег', price:60, ch:'🤑', cat:'faces'},
  {id:515, name:'Объятия', price:60, ch:'🤗', cat:'faces'},
  {id:516, name:'Хихиканье', price:60, ch:'🤭', cat:'faces'},
  {id:517, name:'Тсс', price:60, ch:'🤫', cat:'faces'},
  {id:518, name:'Раздумье', price:60, ch:'🤔', cat:'faces'},
  {id:519, name:'Молчок', price:60, ch:'🤐', cat:'faces'},
  {id:520, name:'Скепсис', price:60, ch:'🤨', cat:'faces'},
  {id:521, name:'Нейтралитет', price:60, ch:'😐', cat:'faces'},
  {id:522, name:'Пустота', price:60, ch:'😑', cat:'faces'},
  {id:523, name:'Без слов', price:60, ch:'😶', cat:'faces'},
  {id:524, name:'Ухмылка', price:60, ch:'😏', cat:'faces'},
  {id:525, name:'Скука', price:60, ch:'😒', cat:'faces'},
  {id:526, name:'Закатить глаза', price:60, ch:'🙄', cat:'faces'},
  {id:527, name:'Гримаса', price:60, ch:'😬', cat:'faces'},
  {id:528, name:'Враньё', price:60, ch:'🤥', cat:'faces'},
  {id:529, name:'Облегчение', price:60, ch:'😌', cat:'faces'},
  {id:530, name:'Задумчивость', price:60, ch:'😔', cat:'faces'},
  {id:531, name:'Дрёма', price:60, ch:'😪', cat:'faces'},
  {id:532, name:'Слюнки', price:60, ch:'🤤', cat:'faces'},
  {id:533, name:'Маска', price:60, ch:'😷', cat:'faces'},
  {id:534, name:'Простуда', price:60, ch:'🤒', cat:'faces'},
  {id:535, name:'Ушиб', price:60, ch:'🤕', cat:'faces'},
  {id:536, name:'Тошнота', price:60, ch:'🤢', cat:'faces'},
  {id:537, name:'Фу, тошнит', price:60, ch:'🤮', cat:'faces'},
  {id:538, name:'Чих', price:60, ch:'🤧', cat:'faces'},
  {id:539, name:'Жара', price:60, ch:'🥵', cat:'faces'},
  {id:540, name:'Кружится голова', price:60, ch:'🥴', cat:'faces'},
  {id:541, name:'Нокаут', price:60, ch:'😵', cat:'faces'},
  {id:542, name:'Ковбой', price:60, ch:'🤠', cat:'faces'},
  {id:543, name:'Маскировка', price:60, ch:'🥸', cat:'faces'},
  {id:544, name:'Ботан', price:60, ch:'🤓', cat:'faces'},
  {id:545, name:'Монокль', price:60, ch:'🧐', cat:'faces'},
  {id:546, name:'Недоумение', price:60, ch:'😕', cat:'faces'},
  {id:547, name:'Тревога', price:60, ch:'😟', cat:'faces'},
  {id:548, name:'Огорчение', price:60, ch:'🙁', cat:'faces'},
  {id:549, name:'Хмурость', price:60, ch:'☹️', cat:'faces'},
  {id:550, name:'Удивление', price:60, ch:'😮', cat:'faces'},
  {id:551, name:'Оторопь', price:60, ch:'😯', cat:'faces'},
  {id:552, name:'Изумление', price:60, ch:'😲', cat:'faces'},
  {id:553, name:'Смущение', price:60, ch:'😳', cat:'faces'},
  {id:554, name:'Умоляю', price:60, ch:'🥺', cat:'faces'},
  {id:555, name:'Оторопело', price:60, ch:'😦', cat:'faces'},
  {id:556, name:'Мука', price:60, ch:'😧', cat:'faces'},
  {id:557, name:'Испуг', price:60, ch:'😨', cat:'faces'},
  {id:558, name:'Волнение', price:60, ch:'😰', cat:'faces'},
  {id:559, name:'Отлегло', price:60, ch:'😥', cat:'faces'},
  {id:560, name:'Слёзы', price:60, ch:'😢', cat:'faces'},
  {id:561, name:'Рыдания', price:60, ch:'😭', cat:'faces'},
  {id:562, name:'Крик ужаса', price:60, ch:'😱', cat:'faces'},
  {id:563, name:'Смятение', price:60, ch:'😖', cat:'faces'},
  {id:564, name:'Терпение', price:60, ch:'😣', cat:'faces'},
  {id:565, name:'Разочарование', price:60, ch:'😞', cat:'faces'},
  {id:566, name:'Пот', price:60, ch:'😓', cat:'faces'},
  {id:567, name:'Изнеможение', price:60, ch:'😩', cat:'faces'},
  {id:568, name:'Устал', price:60, ch:'😫', cat:'faces'},
  {id:569, name:'Зевота', price:60, ch:'🥱', cat:'faces'},
  {id:570, name:'Пар из ушей', price:60, ch:'😤', cat:'faces'},
  {id:571, name:'Ярость', price:60, ch:'😡', cat:'faces'},
  {id:572, name:'Злость', price:60, ch:'😠', cat:'faces'},
  {id:575, name:'Череп', price:60, ch:'💀', cat:'faces'},
  {id:577, name:'Какашка', price:60, ch:'💩', cat:'faces'}, // 05.09.2026: id573 «Ругань»/id574 «Бесёнок»/id576 «Пиратский череп» убраны — политика 3+
  {id:578, name:'Клоун', price:60, ch:'🤡', cat:'faces'},
  {id:579, name:'Космический захватчик', price:60, ch:'👾', cat:'faces'},
  {id:580, name:'Робот', price:60, ch:'🤖', cat:'faces'},
  {id:581, name:'Довольный кот', price:60, ch:'😺', cat:'faces'},
  {id:582, name:'Кошачья радость', price:60, ch:'😸', cat:'faces'},
  {id:583, name:'Кошачий хохот', price:60, ch:'😹', cat:'faces'},
  {id:584, name:'Влюблённый кот', price:60, ch:'😻', cat:'faces'},
  {id:585, name:'Хитрый кот', price:60, ch:'😼', cat:'faces'},
  {id:586, name:'Кошачий поцелуй', price:60, ch:'😽', cat:'faces'},
  {id:587, name:'Испуганный кот', price:60, ch:'🙀', cat:'faces'},
  {id:588, name:'Плачущий кот', price:60, ch:'😿', cat:'faces'},
  {id:589, name:'Надутый кот', price:60, ch:'😾', cat:'faces'},
  {id:590, name:'Не вижу', price:60, ch:'🙈', cat:'faces'},
  {id:591, name:'Не слышу', price:60, ch:'🙉', cat:'faces'},
  {id:592, name:'Молчу', price:60, ch:'🙊', cat:'faces'},
  {id:593, name:'Виноград', price:60, ch:'🍇', cat:'food'},
  {id:594, name:'Дыня', price:60, ch:'🍈', cat:'food'},
  {id:595, name:'Мандарин', price:60, ch:'🍊', cat:'food'},
  {id:596, name:'Лимон', price:60, ch:'🍋', cat:'food'},
  {id:597, name:'Банан', price:60, ch:'🍌', cat:'food'},
  {id:598, name:'Ананас', price:60, ch:'🍍', cat:'food'},
  {id:599, name:'Манго', price:60, ch:'🥭', cat:'food'},
  {id:600, name:'Яблоко', price:60, ch:'🍎', cat:'food'},
  {id:601, name:'Зелёное яблоко', price:60, ch:'🍏', cat:'food'},
  {id:602, name:'Груша', price:60, ch:'🍐', cat:'food'},
  {id:603, name:'Персик', price:60, ch:'🍑', cat:'food'},
  {id:604, name:'Клубника', price:60, ch:'🍓', cat:'food'},
  {id:605, name:'Черника', price:60, ch:'🫐', cat:'food'},
  {id:606, name:'Киви', price:60, ch:'🥝', cat:'food'},
  {id:607, name:'Помидор', price:60, ch:'🍅', cat:'food'},
  {id:608, name:'Оливка', price:60, ch:'🫒', cat:'food'},
  {id:609, name:'Кокос', price:60, ch:'🥥', cat:'food'},
  {id:610, name:'Авокадо', price:60, ch:'🥑', cat:'food'},
  {id:611, name:'Баклажан', price:60, ch:'🍆', cat:'food'},
  {id:612, name:'Картофель', price:60, ch:'🥔', cat:'food'},
  {id:613, name:'Морковь', price:60, ch:'🥕', cat:'food'},
  {id:614, name:'Кукуруза', price:60, ch:'🌽', cat:'food'},
  {id:615, name:'Перец чили', price:60, ch:'🌶️', cat:'food'},
  {id:616, name:'Болгарский перец', price:60, ch:'🫑', cat:'food'},
  {id:617, name:'Огурец', price:60, ch:'🥒', cat:'food'},
  {id:618, name:'Листовая зелень', price:60, ch:'🥬', cat:'food'},
  {id:619, name:'Брокколи', price:60, ch:'🥦', cat:'food'},
  {id:620, name:'Чеснок', price:60, ch:'🧄', cat:'food'},
  {id:621, name:'Лук', price:60, ch:'🧅', cat:'food'},
  {id:622, name:'Арахис', price:60, ch:'🥜', cat:'food'},
  {id:623, name:'Каштан', price:60, ch:'🌰', cat:'food'},
  {id:624, name:'Хлеб', price:60, ch:'🍞', cat:'food'},
  {id:625, name:'Круассан', price:60, ch:'🥐', cat:'food'},
  {id:626, name:'Багет', price:60, ch:'🥖', cat:'food'},
  {id:627, name:'Лепёшка', price:60, ch:'🫓', cat:'food'},
  {id:628, name:'Крендель', price:60, ch:'🥨', cat:'food'},
  {id:629, name:'Бейгл', price:60, ch:'🥯', cat:'food'},
  {id:630, name:'Блины', price:60, ch:'🥞', cat:'food'},
  {id:631, name:'Вафля', price:60, ch:'🧇', cat:'food'},
  {id:632, name:'Сыр', price:60, ch:'🧀', cat:'food'},
  {id:633, name:'Мясо на кости', price:60, ch:'🍖', cat:'food'},
  {id:634, name:'Куриная ножка', price:60, ch:'🍗', cat:'food'},
  {id:635, name:'Стейк', price:60, ch:'🥩', cat:'food'},
  {id:636, name:'Бекон', price:60, ch:'🥓', cat:'food'},
  {id:637, name:'Картошка фри', price:60, ch:'🍟', cat:'food'},
  {id:638, name:'Хот-дог', price:60, ch:'🌭', cat:'food'},
  {id:639, name:'Сэндвич', price:60, ch:'🥪', cat:'food'},
  {id:640, name:'Буррито', price:60, ch:'🌯', cat:'food'},
  {id:641, name:'Тамале', price:60, ch:'🫔', cat:'food'},
  {id:642, name:'Шаурма', price:60, ch:'🥙', cat:'food'},
  {id:643, name:'Фалафель', price:60, ch:'🧆', cat:'food'},
  {id:644, name:'Яйцо', price:60, ch:'🥚', cat:'food'},
  {id:645, name:'Яичница', price:60, ch:'🍳', cat:'food'},
  {id:646, name:'Сковорода с едой', price:60, ch:'🥘', cat:'food'},
  {id:647, name:'Похлёбка', price:60, ch:'🍲', cat:'food'},
  {id:648, name:'Фондю', price:60, ch:'🫕', cat:'food'},
  {id:649, name:'Каша', price:60, ch:'🥣', cat:'food'},
  {id:650, name:'Салат', price:60, ch:'🥗', cat:'food'},
  {id:651, name:'Попкорн', price:60, ch:'🍿', cat:'food'},
  {id:652, name:'Масло', price:60, ch:'🧈', cat:'food'},
  {id:653, name:'Соль', price:60, ch:'🧂', cat:'food'},
  {id:654, name:'Консервы', price:60, ch:'🥫', cat:'food'},
  {id:655, name:'Бэнто', price:60, ch:'🍱', cat:'food'},
  {id:656, name:'Рисовый крекер', price:60, ch:'🍘', cat:'food'},
  {id:657, name:'Онигири', price:60, ch:'🍙', cat:'food'},
  {id:658, name:'Рис', price:60, ch:'🍚', cat:'food'},
  {id:659, name:'Карри', price:60, ch:'🍛', cat:'food'},
  {id:660, name:'Лапша', price:60, ch:'🍜', cat:'food'},
  {id:661, name:'Спагетти', price:60, ch:'🍝', cat:'food'},
  {id:662, name:'Батат', price:60, ch:'🍠', cat:'food'},
  {id:663, name:'Одэн', price:60, ch:'🍢', cat:'food'},
  {id:664, name:'Суши', price:60, ch:'🍣', cat:'food'},
  {id:665, name:'Темпура', price:60, ch:'🍤', cat:'food'},
  {id:666, name:'Наруто', price:60, ch:'🍥', cat:'food'},
  {id:667, name:'Лунный пряник', price:60, ch:'🥮', cat:'food'},
  {id:668, name:'Данго', price:60, ch:'🍡', cat:'food'},
  {id:669, name:'Пельмень', price:60, ch:'🥟', cat:'food'},
  {id:670, name:'Печенье с предсказанием', price:60, ch:'🥠', cat:'food'},
  {id:671, name:'Коробка навынос', price:60, ch:'🥡', cat:'food'},
  {id:672, name:'Колотый лёд', price:60, ch:'🍧', cat:'food'},
  {id:673, name:'Пломбир', price:60, ch:'🍨', cat:'food'},
  {id:674, name:'Печенье', price:60, ch:'🍪', cat:'food'},
  {id:675, name:'Торт', price:60, ch:'🎂', cat:'food'},
  {id:676, name:'Кусок торта', price:60, ch:'🍰', cat:'food'},
  {id:677, name:'Капкейк', price:60, ch:'🧁', cat:'food'},
  {id:678, name:'Пирог', price:60, ch:'🥧', cat:'food'},
  {id:679, name:'Конфета', price:60, ch:'🍬', cat:'food'},
  {id:680, name:'Леденец', price:60, ch:'🍭', cat:'food'},
  {id:681, name:'Крем-карамель', price:60, ch:'🍮', cat:'food'},
  {id:682, name:'Мёд', price:60, ch:'🍯', cat:'food'},
  {id:683, name:'Бутылочка', price:60, ch:'🍼', cat:'food'},
  {id:684, name:'Молоко', price:60, ch:'🥛', cat:'food'},
  {id:685, name:'Кофе', price:60, ch:'☕', cat:'food'},
  {id:686, name:'Чайник', price:60, ch:'🫖', cat:'food'},
  {id:687, name:'Чашка чая', price:60, ch:'🍵', cat:'food'},
  {id:688, name:'Стакан с трубочкой', price:60, ch:'🥤', cat:'food'},
  {id:689, name:'Бабл-ти', price:60, ch:'🧋', cat:'food'},
  {id:690, name:'Сок в коробке', price:60, ch:'🧃', cat:'food'},
  {id:691, name:'Мате', price:60, ch:'🧉', cat:'food'},
  {id:692, name:'Лёд', price:60, ch:'🧊', cat:'food'},
  {id:693, name:'Палочки', price:60, ch:'🥢', cat:'food'},
  {id:694, name:'Тарелка с приборами', price:60, ch:'🍽️', cat:'food'},
  {id:695, name:'Вилка и нож', price:60, ch:'🍴', cat:'food'},
  {id:696, name:'Ложка', price:60, ch:'🥄', cat:'food'},
  {id:697, name:'Кухонный нож', price:60, ch:'🔪', cat:'food'},
  {id:698, name:'Амфора', price:60, ch:'🏺', cat:'food'},
  {id:699, name:'Сатурн', price:60, ch:'🪐', cat:'space'},
  {id:700, name:'Монета', price:300, ch:'🪙', cat:'status'},
  {id:701, name:'Перо', price:100, ch:'🪶', cat:'animals'},
  {id:702, name:'Жук', price:180, ch:'🪲', cat:'bugs'},
  {id:703, name:'Таракан', price:180, ch:'🪳', cat:'bugs'},
  {id:704, name:'Муха', price:180, ch:'🪰', cat:'bugs'},
  {id:705, name:'Червяк', price:180, ch:'🪱', cat:'bugs'},
  {id:706, name:'Цветок в горшке', price:100, ch:'🪴', cat:'nature'},
  {id:707, name:'Камень', price:180, ch:'🪨', cat:'landmarks'},
  {id:708, name:'Дерево-брус', price:180, ch:'🪵', cat:'landmarks'},
  {id:709, name:'Парашют', price:60, ch:'🪂', cat:'vehicles'},
  
  
  
  
  
  
  {id:716, name:'Бенгальский огонь', price:180, ch:'🎇', cat:'holidays'},
  {id:717, name:'Петарда', price:180, ch:'🧨', cat:'holidays'},
  {id:718, name:'Хлопушка', price:180, ch:'🎉', cat:'holidays'},
  {id:719, name:'Конфетти', price:180, ch:'🎊', cat:'holidays'},
  {id:720, name:'Танабата', price:180, ch:'🎋', cat:'holidays'},
  {id:721, name:'Сосновое украшение', price:180, ch:'🎍', cat:'holidays'},
  {id:722, name:'Японские куклы', price:180, ch:'🎎', cat:'holidays'},
  {id:723, name:'Флаг-карп', price:180, ch:'🎏', cat:'holidays'},
  {id:724, name:'Колокольчик ветра', price:180, ch:'🎐', cat:'holidays'},
  {id:725, name:'Любование луной', price:180, ch:'🎑', cat:'holidays'},
  {id:726, name:'Красный конверт', price:180, ch:'🧧', cat:'holidays'},
  {id:727, name:'Бант', price:180, ch:'🎀', cat:'holidays'},
  {id:728, name:'Памятная лента', price:180, ch:'🎗️', cat:'holidays'},
  {id:729, name:'Билеты', price:180, ch:'🎟️', cat:'holidays'},
  {id:730, name:'Билет', price:180, ch:'🎫', cat:'holidays'},
  {id:731, name:'Бейсбол', price:60, ch:'⚾', cat:'sport'},
  {id:732, name:'Софтбол', price:60, ch:'🥎', cat:'sport'},
  {id:733, name:'Регби', price:60, ch:'🏉', cat:'sport'},
  {id:734, name:'Летающий диск', price:60, ch:'🥏', cat:'sport'},
  {id:735, name:'Крикет', price:60, ch:'🏏', cat:'sport'},
  {id:736, name:'Хоккей на траве', price:60, ch:'🏑', cat:'sport'},
  {id:737, name:'Хоккей', price:60, ch:'🏒', cat:'sport'},
  {id:738, name:'Лакросс', price:60, ch:'🥍', cat:'sport'},
  {id:739, name:'Пинг-понг', price:60, ch:'🏓', cat:'sport'},
  {id:740, name:'Бадминтон', price:60, ch:'🏸', cat:'sport'},
  {id:741, name:'Кимоно', price:60, ch:'🥋', cat:'sport'},
  {id:742, name:'Ворота', price:60, ch:'🥅', cat:'sport'},
  {id:743, name:'Флаг в лунке', price:60, ch:'⛳', cat:'sport'},
  {id:744, name:'Коньки', price:60, ch:'⛸️', cat:'sport'},
  {id:745, name:'Удочка', price:60, ch:'🎣', cat:'sport'},
  {id:746, name:'Маска для дайвинга', price:60, ch:'🤿', cat:'sport'},
  {id:747, name:'Спортивная майка', price:60, ch:'🎽', cat:'sport'},
  {id:748, name:'Лыжи', price:60, ch:'🎿', cat:'sport'},
  {id:749, name:'Санки', price:60, ch:'🛷', cat:'sport'},
  {id:750, name:'Керлинг', price:60, ch:'🥌', cat:'sport'},
  {id:751, name:'Йо-йо', price:60, ch:'🪀', cat:'games'},
  {id:752, name:'Воздушный змей', price:60, ch:'🪁', cat:'games'},
  {id:753, name:'Водяной пистолет', price:60, ch:'🔫', cat:'games'},
  {id:754, name:'Бильярдный шар', price:60, ch:'🎱', cat:'games'},
  {id:755, name:'Волшебная палочка', price:60, ch:'🪄', cat:'games'},
  {id:756, name:'Видеоигра', price:60, ch:'🎮', cat:'games'},
  {id:757, name:'Пазл', price:60, ch:'🧩', cat:'games'},
  {id:758, name:'Плюшевый мишка', price:60, ch:'🧸', cat:'games'},
  {id:759, name:'Пиньята', price:60, ch:'🪅', cat:'games'},
  {id:760, name:'Матрёшка', price:60, ch:'🪆', cat:'games'},
  {id:761, name:'Маджонг', price:60, ch:'🀄', cat:'games'},
  {id:762, name:'Игральные карты (цветы)', price:60, ch:'🎴', cat:'games'},
  {id:763, name:'Театральные маски', price:100, ch:'🎭', cat:'crafts'},
  {id:764, name:'Картина в раме', price:100, ch:'🖼️', cat:'crafts'},
  {id:765, name:'Палитра художника', price:100, ch:'🎨', cat:'crafts'},
  {id:766, name:'Нить', price:100, ch:'🧵', cat:'crafts'},
  {id:767, name:'Игла', price:100, ch:'🪡', cat:'crafts'},
  {id:768, name:'Пряжа', price:100, ch:'🧶', cat:'crafts'},
  {id:769, name:'Узел', price:100, ch:'🪢', cat:'crafts'},
  {id:770, name:'Лотос', price:100, ch:'🪷', cat:'nature'},
  {id:771, name:'Розовое сердце', price:100, ch:'🩷', cat:'hearts'},
  {id:772, name:'Голубое сердце', price:100, ch:'🩵', cat:'hearts'},
  {id:773, name:'Серое сердце', price:100, ch:'🩶', cat:'hearts'},
  {id:774, name:'Облако драки', price:180, ch:'🫯', cat:'fx'},
  {id:775, name:'Лось', price:100, ch:'🫎', cat:'animals'},
  {id:776, name:'Осёл', price:100, ch:'🫏', cat:'animals'},
  {id:777, name:'Крыло', price:100, ch:'🪽', cat:'animals'},
  {id:778, name:'Гусь', price:100, ch:'🪿', cat:'animals'},
  {id:779, name:'Косатка', price:100, ch:'🫍', cat:'sealife'},
  {id:780, name:'Коралл', price:100, ch:'🪸', cat:'sealife'},
  {id:781, name:'Медуза', price:100, ch:'🪼', cat:'sealife'},
  {id:782, name:'Гиацинт', price:100, ch:'🪻', cat:'nature'},
  {id:783, name:'Пустое гнездо', price:100, ch:'🪹', cat:'nature'},
  {id:784, name:'Гнездо с яйцами', price:100, ch:'🪺', cat:'nature'},
  {id:785, name:'Голое дерево', price:100, ch:'🪾', cat:'nature'},
  {id:786, name:'Горка на площадке', price:180, ch:'🛝', cat:'landmarks'},
  {id:787, name:'Колесо', price:60, ch:'🛞', cat:'vehicles'},
  {id:788, name:'Спасательный круг', price:60, ch:'🛟', cat:'vehicles'},
  {id:789, name:'Антарктида', price:100, ch:'🇦🇶', cat:'flags'},
  {id:792, name:'Ватикан', price:100, ch:'🇻🇦', cat:'flags'},
  {id:793, name:'Афганистан', price:100, ch:'🇦🇫', cat:'flags'}, {id:794, name:'Ангола', price:100, ch:'🇦🇴', cat:'flags'},
  {id:795, name:'Албания', price:100, ch:'🇦🇱', cat:'flags'}, {id:796, name:'Андорра', price:100, ch:'🇦🇩', cat:'flags'},
  {id:797, name:'Объединённые Арабские Эмираты', price:100, ch:'🇦🇪', cat:'flags'}, {id:798, name:'Аргентина', price:100, ch:'🇦🇷', cat:'flags'},
  {id:799, name:'Армения', price:100, ch:'🇦🇲', cat:'flags'}, {id:800, name:'Антигуа и Барбуда', price:100, ch:'🇦🇬', cat:'flags'},
  {id:801, name:'Австралия', price:100, ch:'🇦🇺', cat:'flags'}, {id:802, name:'Австрия', price:100, ch:'🇦🇹', cat:'flags'},
  {id:803, name:'Азербайджан', price:100, ch:'🇦🇿', cat:'flags'}, {id:804, name:'Бурунди', price:100, ch:'🇧🇮', cat:'flags'},
  {id:805, name:'Бельгия', price:100, ch:'🇧🇪', cat:'flags'}, {id:806, name:'Бенин', price:100, ch:'🇧🇯', cat:'flags'},
  {id:807, name:'Буркина-Фасо', price:100, ch:'🇧🇫', cat:'flags'}, {id:808, name:'Бангладеш', price:100, ch:'🇧🇩', cat:'flags'},
  {id:809, name:'Болгария', price:100, ch:'🇧🇬', cat:'flags'}, {id:810, name:'Бахрейн', price:100, ch:'🇧🇭', cat:'flags'},
  {id:811, name:'Багамские Острова', price:100, ch:'🇧🇸', cat:'flags'}, {id:812, name:'Босния и Герцеговина', price:100, ch:'🇧🇦', cat:'flags'},
  {id:813, name:'Беларусь', price:100, ch:'🇧🇾', cat:'flags'}, {id:814, name:'Белиз', price:100, ch:'🇧🇿', cat:'flags'},
  {id:815, name:'Боливия', price:100, ch:'🇧🇴', cat:'flags'}, {id:816, name:'Бразилия', price:100, ch:'🇧🇷', cat:'flags'},
  {id:817, name:'Барбадос', price:100, ch:'🇧🇧', cat:'flags'}, {id:818, name:'Бруней', price:100, ch:'🇧🇳', cat:'flags'},
  {id:819, name:'Бутан', price:100, ch:'🇧🇹', cat:'flags'}, {id:820, name:'Ботсвана', price:100, ch:'🇧🇼', cat:'flags'},
  {id:821, name:'Центральноафриканская Республика', price:100, ch:'🇨🇫', cat:'flags'}, {id:822, name:'Канада', price:100, ch:'🇨🇦', cat:'flags'},
  {id:823, name:'Швейцария', price:100, ch:'🇨🇭', cat:'flags'}, {id:824, name:'Чили', price:100, ch:'🇨🇱', cat:'flags'},
  {id:825, name:'Китай', price:100, ch:'🇨🇳', cat:'flags'}, {id:826, name:'Кот-д’Ивуар', price:100, ch:'🇨🇮', cat:'flags'},
  {id:827, name:'Камерун', price:100, ch:'🇨🇲', cat:'flags'}, {id:828, name:'Демократическая Республика Конго', price:100, ch:'🇨🇩', cat:'flags'},
  {id:829, name:'Республика Конго', price:100, ch:'🇨🇬', cat:'flags'}, {id:830, name:'Колумбия', price:100, ch:'🇨🇴', cat:'flags'},
  {id:831, name:'Коморы', price:100, ch:'🇰🇲', cat:'flags'}, {id:832, name:'Кабо-Верде', price:100, ch:'🇨🇻', cat:'flags'},
  {id:833, name:'Коста-Рика', price:100, ch:'🇨🇷', cat:'flags'}, {id:834, name:'Куба', price:100, ch:'🇨🇺', cat:'flags'},
  {id:835, name:'Кипр', price:100, ch:'🇨🇾', cat:'flags'}, {id:836, name:'Чехия', price:100, ch:'🇨🇿', cat:'flags'},
  {id:837, name:'Германия', price:100, ch:'🇩🇪', cat:'flags'}, {id:838, name:'Джибути', price:100, ch:'🇩🇯', cat:'flags'},
  {id:839, name:'Доминика', price:100, ch:'🇩🇲', cat:'flags'}, {id:840, name:'Дания', price:100, ch:'🇩🇰', cat:'flags'},
  {id:841, name:'Доминиканская Республика', price:100, ch:'🇩🇴', cat:'flags'}, {id:842, name:'Алжир', price:100, ch:'🇩🇿', cat:'flags'},
  {id:843, name:'Эквадор', price:100, ch:'🇪🇨', cat:'flags'}, {id:844, name:'Египет', price:100, ch:'🇪🇬', cat:'flags'},
  {id:845, name:'Эритрея', price:100, ch:'🇪🇷', cat:'flags'}, {id:846, name:'Эстония', price:100, ch:'🇪🇪', cat:'flags'},
  {id:847, name:'Эфиопия', price:100, ch:'🇪🇹', cat:'flags'}, {id:848, name:'Финляндия', price:100, ch:'🇫🇮', cat:'flags'},
  {id:849, name:'Фиджи', price:100, ch:'🇫🇯', cat:'flags'}, {id:850, name:'Федеративные Штаты Микронезии', price:100, ch:'🇫🇲', cat:'flags'},
  {id:851, name:'Габон', price:100, ch:'🇬🇦', cat:'flags'}, {id:852, name:'Великобритания', price:100, ch:'🇬🇧', cat:'flags'},
  {id:853, name:'Грузия', price:100, ch:'🇬🇪', cat:'flags'}, {id:854, name:'Гана', price:100, ch:'🇬🇭', cat:'flags'},
  {id:855, name:'Гвинея', price:100, ch:'🇬🇳', cat:'flags'}, {id:856, name:'Гамбия', price:100, ch:'🇬🇲', cat:'flags'},
  {id:857, name:'Гвинея-Бисау', price:100, ch:'🇬🇼', cat:'flags'}, {id:858, name:'Экваториальная Гвинея', price:100, ch:'🇬🇶', cat:'flags'},
  {id:859, name:'Греция', price:100, ch:'🇬🇷', cat:'flags'}, {id:860, name:'Гренада', price:100, ch:'🇬🇩', cat:'flags'},
  {id:861, name:'Гватемала', price:100, ch:'🇬🇹', cat:'flags'}, {id:862, name:'Гайана', price:100, ch:'🇬🇾', cat:'flags'},
  {id:863, name:'Гондурас', price:100, ch:'🇭🇳', cat:'flags'}, {id:864, name:'Хорватия', price:100, ch:'🇭🇷', cat:'flags'},
  {id:865, name:'Гаити', price:100, ch:'🇭🇹', cat:'flags'}, {id:866, name:'Венгрия', price:100, ch:'🇭🇺', cat:'flags'},
  {id:867, name:'Индонезия', price:100, ch:'🇮🇩', cat:'flags'}, {id:868, name:'Индия', price:100, ch:'🇮🇳', cat:'flags'},
  {id:869, name:'Ирландия', price:100, ch:'🇮🇪', cat:'flags'}, {id:870, name:'Иран', price:100, ch:'🇮🇷', cat:'flags'},
  {id:871, name:'Ирак', price:100, ch:'🇮🇶', cat:'flags'}, {id:872, name:'Исландия', price:100, ch:'🇮🇸', cat:'flags'},
  {id:873, name:'Израиль', price:100, ch:'🇮🇱', cat:'flags'}, {id:874, name:'Италия', price:100, ch:'🇮🇹', cat:'flags'},
  {id:875, name:'Ямайка', price:100, ch:'🇯🇲', cat:'flags'}, {id:876, name:'Иордания', price:100, ch:'🇯🇴', cat:'flags'},
  {id:877, name:'Япония', price:100, ch:'🇯🇵', cat:'flags'}, {id:878, name:'Казахстан', price:100, ch:'🇰🇿', cat:'flags'},
  {id:879, name:'Кения', price:100, ch:'🇰🇪', cat:'flags'}, {id:880, name:'Киргизия', price:100, ch:'🇰🇬', cat:'flags'},
  {id:881, name:'Камбоджа', price:100, ch:'🇰🇭', cat:'flags'}, {id:882, name:'Кирибати', price:100, ch:'🇰🇮', cat:'flags'},
  {id:883, name:'Сент-Китс и Невис', price:100, ch:'🇰🇳', cat:'flags'}, {id:884, name:'Южная Корея', price:100, ch:'🇰🇷', cat:'flags'},
  {id:885, name:'Кувейт', price:100, ch:'🇰🇼', cat:'flags'}, {id:886, name:'Лаос', price:100, ch:'🇱🇦', cat:'flags'},
  {id:887, name:'Ливан', price:100, ch:'🇱🇧', cat:'flags'}, {id:888, name:'Либерия', price:100, ch:'🇱🇷', cat:'flags'},
  {id:889, name:'Ливия', price:100, ch:'🇱🇾', cat:'flags'}, {id:890, name:'Сент-Люсия', price:100, ch:'🇱🇨', cat:'flags'},
  {id:891, name:'Лихтенштейн', price:100, ch:'🇱🇮', cat:'flags'}, {id:892, name:'Шри-Ланка', price:100, ch:'🇱🇰', cat:'flags'},
  {id:893, name:'Лесото', price:100, ch:'🇱🇸', cat:'flags'}, {id:894, name:'Литва', price:100, ch:'🇱🇹', cat:'flags'},
  {id:895, name:'Люксембург', price:100, ch:'🇱🇺', cat:'flags'}, {id:896, name:'Латвия', price:100, ch:'🇱🇻', cat:'flags'},
  {id:897, name:'Марокко', price:100, ch:'🇲🇦', cat:'flags'}, {id:898, name:'Монако', price:100, ch:'🇲🇨', cat:'flags'},
  {id:899, name:'Молдавия', price:100, ch:'🇲🇩', cat:'flags'}, {id:900, name:'Мадагаскар', price:100, ch:'🇲🇬', cat:'flags'},
  {id:901, name:'Мальдивы', price:100, ch:'🇲🇻', cat:'flags'}, {id:902, name:'Мексика', price:100, ch:'🇲🇽', cat:'flags'},
  {id:903, name:'Маршалловы Острова', price:100, ch:'🇲🇭', cat:'flags'}, {id:904, name:'Северная Македония', price:100, ch:'🇲🇰', cat:'flags'},
  {id:905, name:'Мали', price:100, ch:'🇲🇱', cat:'flags'}, {id:906, name:'Мальта', price:100, ch:'🇲🇹', cat:'flags'},
  {id:907, name:'Мьянма', price:100, ch:'🇲🇲', cat:'flags'}, {id:908, name:'Черногория', price:100, ch:'🇲🇪', cat:'flags'},
  {id:909, name:'Монголия', price:100, ch:'🇲🇳', cat:'flags'}, {id:910, name:'Мозамбик', price:100, ch:'🇲🇿', cat:'flags'},
  {id:911, name:'Мавритания', price:100, ch:'🇲🇷', cat:'flags'}, {id:912, name:'Маврикий', price:100, ch:'🇲🇺', cat:'flags'},
  {id:913, name:'Малави', price:100, ch:'🇲🇼', cat:'flags'}, {id:914, name:'Малайзия', price:100, ch:'🇲🇾', cat:'flags'},
  {id:915, name:'Намибия', price:100, ch:'🇳🇦', cat:'flags'}, {id:916, name:'Нигер', price:100, ch:'🇳🇪', cat:'flags'},
  {id:917, name:'Нигерия', price:100, ch:'🇳🇬', cat:'flags'}, {id:918, name:'Никарагуа', price:100, ch:'🇳🇮', cat:'flags'},
  {id:919, name:'Нидерланды', price:100, ch:'🇳🇱', cat:'flags'}, {id:920, name:'Норвегия', price:100, ch:'🇳🇴', cat:'flags'},
  {id:921, name:'Непал', price:100, ch:'🇳🇵', cat:'flags'}, {id:922, name:'Науру', price:100, ch:'🇳🇷', cat:'flags'},
  {id:923, name:'Новая Зеландия', price:100, ch:'🇳🇿', cat:'flags'}, {id:924, name:'Оман', price:100, ch:'🇴🇲', cat:'flags'},
  {id:925, name:'Пакистан', price:100, ch:'🇵🇰', cat:'flags'}, {id:926, name:'Панама', price:100, ch:'🇵🇦', cat:'flags'},
  {id:927, name:'Перу', price:100, ch:'🇵🇪', cat:'flags'}, {id:928, name:'Филиппины', price:100, ch:'🇵🇭', cat:'flags'},
  {id:929, name:'Палау', price:100, ch:'🇵🇼', cat:'flags'}, {id:930, name:'Папуа — Новая Гвинея', price:100, ch:'🇵🇬', cat:'flags'},
  {id:931, name:'Польша', price:100, ch:'🇵🇱', cat:'flags'}, {id:932, name:'Северная Корея', price:100, ch:'🇰🇵', cat:'flags'},
  {id:933, name:'Парагвай', price:100, ch:'🇵🇾', cat:'flags'}, {id:934, name:'Катар', price:100, ch:'🇶🇦', cat:'flags'},
  {id:935, name:'Румыния', price:100, ch:'🇷🇴', cat:'flags'}, {id:936, name:'Руанда', price:100, ch:'🇷🇼', cat:'flags'},
  {id:937, name:'Саудовская Аравия', price:100, ch:'🇸🇦', cat:'flags'}, {id:938, name:'Судан', price:100, ch:'🇸🇩', cat:'flags'},
  {id:939, name:'Сенегал', price:100, ch:'🇸🇳', cat:'flags'}, {id:940, name:'Сингапур', price:100, ch:'🇸🇬', cat:'flags'},
  {id:941, name:'Соломоновы Острова', price:100, ch:'🇸🇧', cat:'flags'}, {id:942, name:'Сьерра-Леоне', price:100, ch:'🇸🇱', cat:'flags'},
  {id:943, name:'Сальвадор', price:100, ch:'🇸🇻', cat:'flags'}, {id:944, name:'Сан-Марино', price:100, ch:'🇸🇲', cat:'flags'},
  {id:945, name:'Сомали', price:100, ch:'🇸🇴', cat:'flags'}, {id:946, name:'Сербия', price:100, ch:'🇷🇸', cat:'flags'},
  {id:947, name:'Южный Судан', price:100, ch:'🇸🇸', cat:'flags'}, {id:948, name:'Сан-Томе и Принсипи', price:100, ch:'🇸🇹', cat:'flags'},
  {id:949, name:'Суринам', price:100, ch:'🇸🇷', cat:'flags'}, {id:950, name:'Словакия', price:100, ch:'🇸🇰', cat:'flags'},
  {id:951, name:'Словения', price:100, ch:'🇸🇮', cat:'flags'}, {id:952, name:'Швеция', price:100, ch:'🇸🇪', cat:'flags'},
  {id:953, name:'Свазиленд', price:100, ch:'🇸🇿', cat:'flags'}, {id:954, name:'Сейшельские Острова', price:100, ch:'🇸🇨', cat:'flags'},
  {id:955, name:'Сирия', price:100, ch:'🇸🇾', cat:'flags'}, {id:956, name:'Чад', price:100, ch:'🇹🇩', cat:'flags'},
  {id:957, name:'Того', price:100, ch:'🇹🇬', cat:'flags'}, {id:958, name:'Таиланд', price:100, ch:'🇹🇭', cat:'flags'},
  {id:959, name:'Таджикистан', price:100, ch:'🇹🇯', cat:'flags'}, {id:960, name:'Туркмения', price:100, ch:'🇹🇲', cat:'flags'},
  {id:961, name:'Восточный Тимор', price:100, ch:'🇹🇱', cat:'flags'}, {id:962, name:'Тонга', price:100, ch:'🇹🇴', cat:'flags'},
  {id:963, name:'Тринидад и Тобаго', price:100, ch:'🇹🇹', cat:'flags'}, {id:964, name:'Тунис', price:100, ch:'🇹🇳', cat:'flags'},
  {id:965, name:'Турция', price:100, ch:'🇹🇷', cat:'flags'}, {id:966, name:'Тувалу', price:100, ch:'🇹🇻', cat:'flags'},
  {id:967, name:'Танзания', price:100, ch:'🇹🇿', cat:'flags'}, {id:968, name:'Уганда', price:100, ch:'🇺🇬', cat:'flags'},
  {id:969, name:'Украина', price:100, ch:'🇺🇦', cat:'flags'}, {id:970, name:'Уругвай', price:100, ch:'🇺🇾', cat:'flags'},
  {id:971, name:'Узбекистан', price:100, ch:'🇺🇿', cat:'flags'}, {id:972, name:'Сент-Винсент и Гренадины', price:100, ch:'🇻🇨', cat:'flags'},
  {id:973, name:'Венесуэла', price:100, ch:'🇻🇪', cat:'flags'}, {id:974, name:'Вьетнам', price:100, ch:'🇻🇳', cat:'flags'},
  {id:975, name:'Вануату', price:100, ch:'🇻🇺', cat:'flags'}, {id:976, name:'Самоа', price:100, ch:'🇼🇸', cat:'flags'},
  {id:977, name:'Йемен', price:100, ch:'🇾🇪', cat:'flags'}, {id:978, name:'Южно-Африканская Республика', price:100, ch:'🇿🇦', cat:'flags'},
  {id:979, name:'Замбия', price:100, ch:'🇿🇲', cat:'flags'}, {id:980, name:'Зимбабве', price:100, ch:'🇿🇼', cat:'flags'},
];
/* 29.08.2026 «не тот эмодзи» (владелец, реальный баг на живом устройстве): DECALS[S.decal]
   было обращением по ПОЗИЦИИ в массиве, а S.decal хранит id — держалось только пока новые
   записи дописывались строго в конец. Как только декали стали вставляться в середину уже
   существующих категорий (флаги после погоды и т.п.), позиция и id разошлись — 187 из 491
   записей на момент находки. Правильный поиск — по id, не по позиции; строим карту один раз
   при загрузке (массив не меняется в рантайме), а не сканируем на каждый кадр. Тот же приём
   применяем и к FLASHES — они сейчас совпадают позиция=id случайно (строились по
   порядку), но это ничем не гарантировано на будущее, тот же баг может вернуться после
   следующей вставки в середину. */
const DECALS_BY_ID = new Map(DECALS.map(d=>[d.id,d]));
/* 29.08.2026 «Вспышка при старте» — независимая категория тюнинга (после Декали), опять
   свой слот (S.launchFx/ownedLaunchFx — не S.flash, см. ниже), не пересекается с decal. Рисуется
   не на борту, а вокруг него, и не постоянно — только первые ~0.45с полёта (S.time, часы
   полёта из game.js, уже пауз-safe и обнуляется на новый забег — не нужен отдельный таймер
   старта). Каждый style — своя функция отрисовки в render.js (drawLaunchFlash). Владелец
   сознательно поставил цену выше любого другого тюнинга (500 минимум, «это уже редкость») —
   3 варианта дороже базовых, единственная категория с разбросом внутри себя. */
/* 29.08.2026 «Меньше дублей, больше разного» (владелец): было 10 узоров, из них 5 —
   вариации одной идеи под разными именами (Двойное кольцо/Ударная волна/Затмение —
   всё то же Кольцо; Крестовина/Молния — то же самое, что Звёздный всплеск, просто лучей
   меньше/зигзагом). Оставлены только 5 по-настоящему разных старых + 9 новых, тоже все
   разные по силуэту друг от друга (не радиальные лучи/кольца ещё раз) — Комета
   единственная несимметричная, Крылья единственная двусторонняя (не радиальная)
   симметрия, Кольца Сатурна и Соты не круглые. Итог 14 + «Нет» = 15, ровно 5 строк по 3
   клетки в сетке Ангара — владелец попросил кратное 3, чтобы не было пустых клеток
   в последнем ряду. */
/* 04.09.2026 «Ещё вспышек, побольше разнообразия» (владелец, долгая живая сессия
   брейншторма в браузере — десятки узоров показаны один за другим на настоящем превью
   Ангара, не на глаз по коду): каталог вырос с 15 до 51 (id0..19 — было, id20..59 — новые).
   Заодно владелец попросил «перераспределить ВСЕ цены от 500 до 1500, от обычных до вау и
   супер вау» — старые id13/16/17 (Осколки→Разлёт/Цветок/Корона) заметно подорожали (их
   переделанные узоры оценены как «вау»-тир), id6/14/19 (Вихрь/Галактика/Соты) наоборот
   подешевели до простого тира. Цена — сразу и тир качества: продолжительность вспышки на
   старте тоже растёт с ценой (см. flashDur() в render.js, тот же диапазон .45→.75с). */
const FLASHES=[
  {id:0, name:'Нет', price:0, style:'none'},
  {id:1, name:'Кольцо', price:0, style:'ring', cat:'classic'}, // 29.08.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
  {id:2, name:'Звёздный всплеск', price:0, style:'star', cat:'classic'}, // 29.08.2026: бесплатна — см. ANGAR_FREEBIE (ui.js); узор переделан 04.09.2026, цена не менялась
  {id:3, name:'Всплеск частиц', price:500, style:'particles', cat:'classic'},
  {id:6, name:'Вихрь', price:500, style:'spiral', cat:'classic'}, // 04.09.2026: было 650 — простой тир при переоценке всего каталога
  // 04.09.2026 (владелец, живое устройство): id 8/11/12/18 (sphere/comet/saturn/wings)
  // убраны целиком — не нравятся, не «каркас на доработку», а совсем не то. Осиротевший
  // FLASHES_BY_ID.get(id) у уже владеющих игроков вернёт undefined — все места чтения уже
  // защищены `if(fl && fl.style...)` (см. renderFlashPattern/angarShip), просто не рисуют
  // ничего, не падают. Дыры в номерах — уже была такая же (3→6) до этой правки, ничего
  // нового не переизобретаем.
  {id:13, name:'Разлёт', price:1200, style:'shards', cat:'classic'}, // 04.09.2026: было «Осколки», 500 — переделан (реальное вращение при разлёте), вау-тир
  {id:14, name:'Галактика', price:700, style:'galaxy', cat:'classic'}, // 04.09.2026: было 650
  {id:15, name:'Снежинка', price:500, style:'snowflake', cat:'classic'},
  {id:16, name:'Цветок', price:1200, style:'flower', cat:'classic'}, // 04.09.2026: было 500 — переделан (тоньше, обводка вместо заливки), вау-тир
  {id:17, name:'Корона', price:1200, style:'corona', cat:'classic'}, // 04.09.2026: было 650 — переделана (кольцо+гало вместо одного пятна), вау-тир
  {id:19, name:'Соты', price:500, style:'honeycomb', cat:'classic'}, // 04.09.2026: было 650 — простой тир при переоценке всего каталога
  {id:20, name:"Орбита", price:1500, style:"orbit", cat:'classic'},
  {id:21, name:"Квадраты", price:1500, style:"squares", cat:'classic'},
  {id:22, name:"Двойной маятник", price:1500, style:"doublePendulum", cat:'classic'},
  {id:23, name:"Кристалл", price:1500, style:"crystal", cat:'classic'},
  {id:24, name:"Маятник", price:1200, style:"pendulum", cat:'classic'},
  {id:25, name:"Гироскоп", price:1200, style:"gyro", cat:'classic'},
  {id:26, name:"Лиссажу", price:1200, style:"lissajous", cat:'classic'},
  {id:27, name:"Пульсар", price:1200, style:"pulsar", cat:'classic'},
  {id:28, name:"Метеоры", price:1200, style:"meteors", cat:'classic'},
  {id:29, name:"Маятник Ньютона", price:1200, style:"cradle", cat:'classic'},
  {id:30, name:"Спираль", price:900, style:"swirl", cat:'classic'},
  {id:31, name:"Веер", price:900, style:"fan", cat:'classic'},
  {id:32, name:"Маяк", price:900, style:"beacon", cat:'classic'},
  {id:33, name:"Оригами", price:900, style:"origami", cat:'classic'},
  {id:34, name:"Созвездие", price:900, style:"constellation", cat:'classic'},
  {id:35, name:"Компас", price:900, style:"compass", cat:'classic'},
  {id:36, name:"Восьмёрка", price:900, style:"figure8", cat:'classic'},
  {id:37, name:"Затмение", price:900, style:"eclipse", cat:'classic'},
  {id:38, name:"Шестерня", price:900, style:"gear", cat:'classic'},
  {id:39, name:"Иней", price:900, style:"frost", cat:'classic'},
  {id:40, name:"Сеть", price:900, style:"web", cat:'classic'},
  {id:41, name:"Турбина", price:900, style:"turbine", cat:'classic'},
  {id:42, name:"Молекула", price:900, style:"molecule", cat:'classic'},
  {id:43, name:"Разряд", price:700, style:"crack", cat:'classic'},
  {id:44, name:"Рой", price:700, style:"swarm", cat:'classic'},
  {id:45, name:"Магнитное поле", price:700, style:"field", cat:'classic'},
  {id:46, name:"Интерференция", price:700, style:"interference", cat:'classic'},
  {id:47, name:"Куб", price:700, style:"cube", cat:'classic'},
  {id:48, name:"Перья", price:700, style:"feathers", cat:'classic'},
  {id:49, name:"Морская звезда", price:700, style:"starfish", cat:'classic'},
  {id:50, name:"Рассвет", price:700, style:"sunrise", cat:'classic'},
  {id:51, name:"Пиксели", price:700, style:"pixels", cat:'classic'},
  {id:52, name:"Сверхновая", price:700, style:"supernova", cat:'classic'},
  {id:53, name:"Стрелка", price:700, style:"needle", cat:'classic'},
  {id:54, name:"Блик", price:700, style:"flare", cat:'classic'},
  {id:55, name:"Часы", price:700, style:"clock", cat:'classic'},
  {id:56, name:"Скан-линия", price:500, style:"scanline", cat:'classic'},
  {id:57, name:"Штрихкод", price:500, style:"barcode", cat:'classic'},
  {id:58, name:"Фейерверк", price:500, style:"firework", cat:'classic'},
  {id:59, name:"Струна", price:500, style:"string", cat:'classic'},
  /* 05.09.2026 «Живые вспышки»: шесть НОВЫХ отдельных пунктов (не один совмещённый товар —
     первая версия плана была неверной, поправлено владельцем). Каждый реагирует на настоящие
     данные игрока/календаря, не только рисует один и тот же узор. Названия/style нарочно не
     «Метеоры»/«Затмение»/«Созвездие» — те id28/37/34 уже заняты обычными нереагирующими
     узорами, дублировать имя нельзя. Цены — по существующей шкале каталога, подтверждены
     владельцем построчно (не выдуманы). */
  {id:60, name:"Звездопад", price:1200, style:"starfall", cat:'live'}, // особая версия — в день пика настоящего метеорного потока (проверенные даты, см. METEOR_SHOWERS ниже)
  {id:61, name:"Веха пути", price:1500, style:"milestone", cat:'live'}, // золотой залп ОДИН раз — когда пожизненный налёт (Stats.totalDist) впервые пересекает круглые 100 км
  {id:62, name:"Небесное затмение", price:1200, style:"realEclipse", cat:'live'}, // особая версия — в день настоящего затмения (проверенные даты, см. REAL_ECLIPSES ниже)
  {id:63, name:"С возвращением", price:900, style:"comeback", cat:'live'}, // тёплая особая версия — если не заходил 7+ дней подряд
  {id:64, name:"Созвездие наград", price:700, style:"achConstellation", cat:'live'}, // всегда честно по числу открытых достижений (ACH из ach.js)
  {id:65, name:"Знак дня", price:500, style:"daysign", cat:'live'}, // число колец — от сегодняшнего общего сида (dailyRNG, тот же что у Трассы дня)
  /* 05.09.2026 «Из макета в игру» — большая партия, собранная за один долгий заход (клип N'to,
     Vecteezy/Envato/Behance, сакральная геометрия — Flower of Life/Metatron/Sri Yantra/Hat-тайл
     проверены численно короткими скриптами до вставки сюда, не нарисованы на глаз, см. .knowledge
     при желании свериться). Цены — по той же шкале каталога (500→1500 по редкости/сложности),
     проставлены сразу, не додуманы втихую — видно в этом же коммите. 15 похожих/спорных вариантов
     из макета сюда НЕ включены — ждут отдельного решения владельца по каждому. */
  {id:66, name:"Спицы", price:10, style:"spokes", cat:'classic'},
  {id:67, name:"Матрёшка", price:10, style:"nestedShapes", cat:'classic'},
  {id:68, name:"Слияние", price:10, style:"blendCircles", cat:'classic'},
  {id:69, name:"Рябь", price:10, style:"rippleDot", cat:'classic'},
  {id:70, name:"Пластинка", price:10, style:"grooveDisc", cat:'classic'},
  {id:71, name:"Уровень", price:10, style:"fillLevel", cat:'classic'},
  {id:72, name:"Плетение", price:10, style:"weavedBands", cat:'classic'},
  {id:73, name:"Созвездие колец", price:10, style:"ringCluster", cat:'classic'},
  {id:74, name:"Лунные фазы", price:10, style:"moonGrid", cat:'classic'},
  {id:75, name:"Лестница", price:10, style:"diagStairs", cat:'classic'},
  {id:76, name:"Эквалайзер", price:10, style:"eqBars", cat:'classic'},
  {id:77, name:"Изо-треугольник", price:10, style:"isoTriangle", cat:'classic'},
  {id:78, name:"Коллаж", price:10, style:"shapeCollage", cat:'classic'},
  {id:79, name:"Спираль в треугольнике", price:10, style:"spiralClip", cat:'classic'},
  {id:80, name:"Тоннель звёзд", price:10, style:"starTunnel", cat:'classic'},
  {id:81, name:"Спиральная паутина", price:10, style:"spiralWeb", cat:'classic'},
  {id:82, name:"Крест-луч", price:10, style:"crossBeam", cat:'classic'},
  {id:83, name:"Веер дуг", price:10, style:"arcFan", cat:'classic'},
  {id:84, name:"Ромб-сфера", price:10, style:"diamondSphere", cat:'classic'},
  {id:85, name:"Скрученный шар", price:10, style:"twistedSphere", cat:'classic'},
  {id:86, name:"Лепестки-линзы", price:10, style:"lensPetals", cat:'classic'},
  {id:87, name:"Объёмный шар", price:10, style:"shadedBall", cat:'classic'},
  {id:88, name:"Бант из колец", price:10, style:"ringBow", cat:'classic'},
  {id:89, name:"Кристалл-огранка", price:10, style:"gemFacet", cat:'classic'},
  {id:90, name:"Кубооктаэдр", price:10, style:"cuboctahedron", cat:'sacred', fact:'Vector Equilibrium — 12 вершин, 24 ребра длины √2'}, // Vector Equilibrium — 12 вершин, 24 ребра длины √2, проверено скриптом
  {id:91, name:"Шри-Янтра", price:10, style:"sriYantra", cat:'sacred', fact:'Настоящие опубликованные координаты — 18 подлинных тройных пересечений'}, // раньше Sri Yantra — реальные опубликованные координаты, 18 подлинных тройных пересечений, проверено скриптом
  {id:92, name:"Печать", price:10, style:"sealNested", cat:'sacred', fact:'Наша конструкция — 3 звезды Давида, масштаб ×1/√3 и поворот +30° на слой'}, // наша конструкция — 3 звезды Давида, масштаб ×1/√3 и поворот +30° посчитаны, не подобраны
  {id:93, name:"Звезда гириха", price:10, style:"girihDecagon", cat:'sacred', fact:'Исламский геометрический узор — угол 54°, декаграмма {10/3}'}, // раньше «Гирих: декагон» — угол 54° выведен и проверен на всех 10 рёбрах
  {id:94, name:"Шляпа", price:10, style:"hatTile", cat:'sacred', fact:'Hat-тайл (Einstein, 2023) — первая известная апериодическая мозаика ОДНОЙ плиткой'}, // раньше Hat-тайл — координаты из настоящего кода автора (isohedral/hatviz), Einstein-плитка 2023 года
  {id:95, name:"Шляпа и Метатрон", price:10, style:"hatMetatron", cat:'sacred', fact:'Композиция Hat-тайла (2023) и Куба Метатрона'}, // раньше «Composite: Hat + Метатрон»
  {id:96, name:"Рыбий пузырь", price:10, style:"vesicaPiscis", cat:'sacred', fact:'Vesica Piscis — пересечение двух равных кругов через центр друг друга, древний символ'}, // раньше Vesica Piscis
  {id:97, name:"Инь-Янь", price:10, style:"yinyangFlash", cat:'sacred', fact:'Тайцзиту — классический даосский символ баланса'},
  {id:98, name:"Золотая спираль", price:10, style:"goldenSpiral", cat:'sacred', fact:'Квадраты Фибоначчи 1,1,2,3,5,8,13 — стыкуются без щелей'}, // квадраты Фибоначчи, проверено скриптом на стыковку без щелей
  {id:99, name:"Аполлониева прокладка", price:10, style:"apollonian", cat:'sacred', fact:'Теорема Декарта — каждый круг касается всех трёх соседей'}, // теорема Декарта, все касания проверены скриптом
  {id:100, name:"Октаграмма", price:10, style:"octagram", cat:'classic'},
  {id:101, name:"Куб Метатрона", price:10, style:"metatronCube", cat:'sacred', fact:'13 точек Fruit of Life, все 78 связей (C(13,2))'}, // 13 точек Fruit of Life, ровно 78 линий (C(13,2)) — проверено скриптом
  {id:102, name:"Цветок жизни", price:10, style:"flowerOfLife", cat:'sacred', fact:'19 кругов на треугольной решётке — шаг узла равен радиусу'}, // 19 кругов на настоящей треугольной решётке, шаг = радиус — проверено скриптом
  {id:103, name:"Бант-треугольники", price:10, style:"bowtieTri", cat:'classic'},
  /* 05.09.2026 — 13 «спорных» из этой же партии: владелец сам проверит вживую и решит по
     каждой отдельно (оставить/убрать), поэтому цены здесь ниже — самый дешёвый тир каталога. */
  {id:104, name:"Компас-звезда", price:10, style:"denseSpokes", cat:'classic'},
  {id:105, name:"Сноп линий", price:10, style:"convergeBeam", cat:'classic'},
  {id:106, name:"Кластер пластинок", price:10, style:"grooveClusters", cat:'classic'},
  {id:107, name:"Полумесяц колец", price:10, style:"crescentGrooves", cat:'classic'},
  {id:108, name:"Зубчатый круг", price:10, style:"gearBurst", cat:'classic'},
  {id:109, name:"Цветок-вихрь", price:10, style:"pinwheelFlower", cat:'classic'},
  {id:110, name:"Мельница", price:10, style:"pieMill", cat:'classic'},
  {id:111, name:"Гексагон", price:10, style:"plainHex", cat:'classic'},
  {id:112, name:"Волна ромбов", price:10, style:"diamondWave", cat:'classic'},
  {id:113, name:"Мозаика", price:10, style:"barMosaic", cat:'classic'},
  {id:114, name:"Треугольная мандала", price:10, style:"triMandala", cat:'classic'},
  {id:115, name:"Треугольник Рёло", price:10, style:"reuleaux", cat:'classic'},
  {id:116, name:"Додекаграмма", price:10, style:"dodecagram", cat:'classic'},
  /* 05.09.2026 «Суперформула Гилиса» — восемь новых Вспышек, ОДНА общая функция на все
     (render.js), отличаются только 4 числа на запись здесь. Параметры — из реального
     источника (Paul Bourke), не подобраны на глаз; полная теория и то, что формула
     честно НЕ может (настоящая шестерня, «почти круг») — в .knowledge/GENERATIVE-GEOMETRY.md.
     Владелец одобрил все 8 после того, как первая партия («звезда»/«капля»/«шестерня»)
     не прошла живую проверку глазами и была честно переделана/снята. */
  /* 07.09.2026, владелец (скрин с переполнением подсказки): у всех 8 записей была ОДНА
     буквенная формула без единого числа — при 8 честно разных фигурах (m/n1/n2/n3 из SFP,
     render.js) читатель, который в этом разбирается, увидел бы, что мы даже не заглянули
     в собственные числа. Числа ниже — не придуманы, взяты дословно из SFP{}. */
  {id:117, name:"Ромб", price:10, style:"sfRomb", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=4, n1=n2=n3=1'},
  {id:118, name:"Морская звезда", price:10, style:"sfStarfish", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=5, n1=0.1, n2=n3=1.7'},
  {id:119, name:"Соцветие", price:10, style:"sfBlossom", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=6, n1=3, n2=n3=8'},
  {id:120, name:"Морской ёж", price:10, style:"sfUrchin", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=8, n1=n2=n3=0.3'},
  {id:121, name:"Галька", price:10, style:"sfPebble", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=6, n1=40, n2=n3=10'},
  {id:122, name:"Плита", price:10, style:"sfSlab", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=4, n1=n2=n3=1000'},
  {id:123, name:"Щит", price:10, style:"sfShield", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=3, n1=60, n2=55, n3=30'},
  {id:124, name:"Венец", price:10, style:"sfCrown", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=14, n1=n2=n3=30'},
  /* 05.09.2026 «Розы Родонеи» — r=cos(k·θ), k нечётное → k лепестков, k чётное → 2k
     (Гвидо Гранди, 1723-28). Одна общая функция в render.js, отличаются только k.
     Проверено численно (замкнутость) и визуально до вставки — см. GENERATIVE-GEOMETRY.md. */
  {id:125, name:"Клевер", price:10, style:"roseClover", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=2'},
  {id:126, name:"Трилистник", price:10, style:"roseTrefoil", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=3'},
  {id:127, name:"Розетка", price:10, style:"roseRosette", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=4'},
  {id:128, name:"Пятилистник", price:10, style:"rosePetals5", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=5'},
  {id:129, name:"Хризантема", price:10, style:"roseChrysanthemum", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=6'},
  {id:130, name:"Семицветик", price:10, style:"roseSeven", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=7'},
  {id:131, name:"Веер", price:10, style:"roseFan", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=8'},
  /* 05.09.2026 «L-система» — F→F[+F]F[-F]F, угол 25.7°, Prusinkiewicz & Lindenmayer, «The
     Algorithmic Beauty of Plants» (1990), fig. 1.24(a). Не кривая — порождающая грамматика:
     строка переписывается n раз, потом читается черепашкой (F=шаг вперёд, +/-=поворот,
     []=запомнить/вернуть точку). n=4+ сливается в кашу на размере Вспышки — проверено
     визуально, не вставлено. См. .knowledge/GENERATIVE-GEOMETRY.md. */
  {id:132, name:"Ветвление", price:10, style:"lsysBranch", cat:'lsystem', since:'1.478.88', fact:'Prusinkiewicz & Lindenmayer, 1990 — F→F[+F]F[-F]F, угол 25.7°, у этой фигуры: 2 повторения правила'},
  {id:133, name:"Папоротник", price:10, style:"lsysFern", cat:'lsystem', since:'1.478.88', fact:'Prusinkiewicz & Lindenmayer, 1990 — F→F[+F]F[-F]F, угол 25.7°, у этой фигуры: 3 повторения правила'},
];
const FLASHES_BY_ID = new Map(FLASHES.map(d=>[d.id,d])); // см. DECALS_BY_ID выше — тот же приём и то же обоснование
/* 05.09.2026 «Живые вспышки», данные календаря — сверены поиском (AMS/IMO/timeanddate/
   Britannica), не по памяти, тот же принцип, что у брендовых логотипов («проверь, не рисуй
   на глаз»). METEOR_SHOWERS повторяется каждый год (пик плюс-минус сутки). REAL_ECLIPSES —
   конечный список конкретных дат 2026-2027, на будущие годы список нужно будет дополнить
   вручную (проверенными датами, не догадкой). */
const METEOR_SHOWERS=[
  {m:1,d:4},{m:4,d:22},{m:8,d:13},{m:10,d:21},{m:11,d:17},{m:12,d:14}
];
const REAL_ECLIPSES=[
  '2026-02-17','2026-03-02','2026-03-03','2026-08-12','2026-08-27','2026-08-28',
  '2027-02-06','2027-02-20','2027-02-21','2027-07-18','2027-08-02','2027-08-16','2027-08-17'
];
function isMeteorShowerDay(d){
  d=d||new Date();
  const today=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  return METEOR_SHOWERS.some(s=>{
    const peak=new Date(d.getFullYear(),s.m-1,s.d);
    return Math.abs(Math.round((today-peak)/86400000))<=1;
  });
}
function isRealEclipseDay(d){
  return typeof dateKey==='function' && REAL_ECLIPSES.includes(dateKey(d||new Date()));
}
/* «Веха пути»/«С возвращением» — разовые события, проверяются ОДИН раз на взлёте (тем же
   моментом, что streakDayCheck/morseDayCheck в ui.js), не каждый кадр полёта — иначе легко
   либо записать «уже показано» раньше показа, либо показывать вечно. ВАЖНО: должна
   вызываться из ui.js СТРОГО ДО streakDayCheck() — читает streakDay, который streakDayCheck
   тут же перезапишет на сегодня. */
function livingFlashCheck(){
  const prevMs=saneNumber(Store.get('flashMilestoneAck',0),0);
  const curMs=Math.floor((Stats.totalDist||0)/100000); // шаг 100 км = 100000 м (Stats.totalDist уже в метрах, см. ui.js gameOver)
  S.milestoneHit = curMs>prevMs;
  if(S.milestoneHit) Store.set('flashMilestoneAck', curMs);

  S.comebackHit=false;
  const lastDay=Store.get('streakDay','');
  if(lastDay){
    const parts=lastDay.split('-').map(Number);
    const last=new Date(parts[0],parts[1]-1,parts[2]), now=new Date();
    const gapDays=Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-last)/86400000);
    S.comebackHit = gapDays>=7;
  }
}
const S = {
  running:false, paused:false, score:0, best:0, wallet:0,
  mission:1, lives:3, invuln:0, // волна — событие; шаг до неё считает waveDistTarget (v1.31.0)
  speed:3.4, dist:0, combo:0, comboMax:0, starsCollected:0,
  shield:0, magnet:0, slowmo:0, dash:0, freeze:0, time:0, flash:0, shake:0, timeScale:1, // v1.40.0 «Шесть жестов»: классика + Таран (dash) + Сверхновая; time — часы полёта для лотереи; freeze — 06.09.2026 «Стоп-кадр», седьмой
  mode:'classic', hits:0, bonuses:0, nearMiss:0, everDash:0, everNova:0, starsSpawned:0, hundredDone:0, // v1.42.0 «Пять дисциплин»: режим забега + счётчики паспорта (v1.70.0: Пакт и «Без ударов» удалены)
    // 05.09.2026: nearMiss — счётчик ЭТОГО забега (сброс на взлёте), отдельно от Stats.nearMiss
    // (тот пожизненный, никогда не обнуляется) — паспорт полёта («Подробности полёта») хочет
    // именно «сколько было впритык В ЭТОМ полёте», как у dist/time/starsCollected рядом.
  dying:0, dyingT:0, pausing:0, // «Склейка»: slow-mo занавес смерти / плавная остановка паузы
  smooth:1, // Smooth Flight: плавность пилотирования 0.5..1.0 → финальный множитель 0.75..1.0
  hueShift:0, skin:0, ownedSkins:[0],
  decal:0, ownedDecals:[0,1,2], // 28.08.2026 «Тюнинг, шаг 1»: та же пара, что у skin/ownedSkins, отдельная независимая категория. 29.08.2026: id1,2 сразу во владении бесплатно — см. ANGAR_FREEBIE в ui.js
  // 06.09.2026: icon/ownedIcons убраны вместе со всей вкладкой «Иконки» (владелец) — 268 штук
  // держали слишком много места, мешали новым анимациям скина.
  /* 29.08.2026 «вспышка не работает» (владелец, реальный баг на устройстве): поле называлось
     flash — но S.flash УЖЕ существует (см. выше, в блоке v1.40.0) как таймер золотой вспышки
     при подборе звезды, живой, активно используемый (game.js: update(), render.js: draw()).
     Дубликат ключа в одном объекте молча выигрывает последний, а дальше геймплейный таймер
     каждый кадр затирал мой id надетой декоративной вспышки нулём — эффект не мог показаться
     физически. Переименовано в launchFx — не пересекается ни с чем (проверено grep). */
  launchFx:0, ownedLaunchFx:[0,1,2], // третий независимый слот — та же пара, что у decal/icon. id1,2 бесплатны — см. ANGAR_FREEBIE
  milestoneHit:false, comebackHit:false, // 05.09.2026 «Живые вспышки»: разовые флаги ЭТОГО забега — выставляет livingFlashCheck() на взлёте (ui.js), читает renderFlashPattern (render.js)
  /* 29.08.2026 «Избранное нам не нужно» (владелец, после трёх неудачных заходов с системой
     избранного): звёздочка-тоггл и favDecal/favIcon/favLaunchFx удалены целиком. Вместо
     выбора игроком — 2 фиксированных бесплатных, сразу во владении предмета на категорию
     (ANGAR_FREEBIE в ui.js), тем же приёмом, что бумажный скин в Цвете: пустые клетки у
     «Без украшений» заполняются не выбором, а самим составом каталога. */
  gyroSec:0, manSec:0 // секунды руления гироскопом / пальцем-мышью-клавишами
};
const plane = { x:0, y:0, vx:0, vy:0, bank:0, r:16 };
let obstacles=[], stars=[], powerups=[], particles=[], bgStars=[], popups=[];
let spawnT=0, starT=0, powT=0;
let lastScoreShown=-1, lastDistShown=-1; // чтобы не писать в DOM без изменений
let lastDistKm=0; // v1.77.0: золотая вспышка цифры расстояния на каждом пройденном километре

/* ---------- Профиль игрока: счётчики для статистики и достижений (модуль ach.js) ---------- */
let Stats = {games:0,deaths:0,totalStars:0,nearMiss:0,
  totalDist:0,bestCombo:0,bestWave:0,
  perfectRuns:0,gGames:0,tGames:0,bGames:0,kGames:0,e42:0,e9000:0,e1337:0,recBeats:0,duelsSent:0,duelsWon:0}; // v1.282.5: kGames — своя же сегодняшняя регрессия, ++ на undefined давал NaN навсегда с первой игры на клавиатуре, найдена аудитом
function saveStats(){ Store.set('stats',Stats); }

function initBg(){
  /* 27.08.2026 «Звёзды пустеют на широком экране» (владелец, сравнил ноутбук и телефон
     живьём): x/y звезды — доля [0,1] от W/H (render.js: sx=s.x*W), не абсолютный пиксель —
     это уже верно, не зависит от разрешения. Но 140 — фиксированное ЧИСЛО, а не плотность.
     На «Метре неба» (v1.99.0) широкий экран показывает больше мира по бокам того же
     коридора — то же число точек размазывается на большую площадь и выглядит пусто.
     Мобильный экран ≈ ширина коридора (390 мер, «эталон» — тот самый, под который 140
     когда-то подобрано), там W/390≈1 и ничего не меняется. Только на более широком W
     добавляем звёзд пропорционально — плотность, а не голое число. */
  /* 28.08.2026 «Живой замер плотности», итог: владелец сравнил 100/150/200% прямо на
     устройстве через временную кнопку в Сервисном центре (render.js: cycleStarDensityDbg,
     теперь снята) и выбрал 200% — эталон 140 стал 280, referStars в render.js уже читает
     готовое bgStars.length для «ультра», отдельного множителя больше нигде не осталось. */
  const ref=390, scale=Math.max(1, W/ref);
  const total=Math.round(280*scale);
  bgStars=[];
  for(let i=0;i<total;i++) bgStars.push({x:Math.random(),y:Math.random(),z:rand(.2,1),s:rand(.5,1.8)}); // v1.38.0: 140 при эталонной ширине (28.08.2026: 280) — «Ультра» рисует все, остальные ступени первые 90/180 (эталон)
}
initBg();

/* ================= СПАВН ================= */
function difficulty(){ // волна + полёт; ранний ramp делает первые секунды живыми, затем затухает
  if (S.mode==='custom' && S.customFlat) return Math.min(1, (S.customW-1)*0.20); // «Ровный жар» (v1.69.0): без разгона по дистанции
  const base=(S.mission-1)*0.20 + S.dist/6000;
  const opening=.62*(1-Math.exp(-S.dist/100))*Math.exp(-S.dist/900); // к ~5с даёт живой темп, к поздней игре почти исчезает
  return Math.min(1, base+opening); }
const SR_GOAL=10000; // Спидран: цель по очкам — решение режиссёра (v1.42.0)
const CARAVAN_TIME=60; // 05.09.2026 «Caravan» (Cave, «Caravan mode» — прочный жанровый термин, не выдумка):
  // фиксированное время вместо «пока не умер» — Score Attack на таймер. Оригинал — 5 минут, у нас средний
  // забег ~30с, поэтому 60с (владелец выбрал сам, не решение по умолчанию) — короткий, напряжённый отрезок
  // на весь отведённый срок, а не растянутая копия оригинала не по темпу игры.
const HUNDRED_DIST=200; // 05.09.2026 «100%»: короткий фиксированный отрезок из каталога идей
  // (.knowledge/GAME-MODES.md «Загадка неба» — 200м) — достаточно короткий, чтобы каждую
  // звезду было видно и помнить, достаточно длинный, чтобы обычные преграды успели пройти волну.
const SLALOM_DIST=4500; // 06.09.2026 «Слалом»: длина того же порядка, что у пресета fpSlalom
  // Конструктора (forge.js) — не переиспользуем сам пресет (это утащило бы систему авторской
  // расстановки внутрь дисциплины), только ориентир по метражу для похожего ощущения дистанции.
// 06.09.2026 «Биатлон»: скорость+точность в одном забеге, реальный формат Sprint (2 рубежа) —
// владелец выбрал числа сам. Скоростной 300м → рубеж (собери всё) 200м → скоростной 300м →
// рубеж 200м → финиш на 1000м. Штраф — как в настоящем Individual-формате (флэт-время),
// не штрафной круг (Sprint) — тот потребовал бы новой геометрии трассы, владелец выбрал проще.
const BIATHLON_LEG=300, BIATHLON_RANGE=200;
const BIATHLON_R1_START=BIATHLON_LEG;                    // 300
const BIATHLON_R1_END=BIATHLON_R1_START+BIATHLON_RANGE;  // 500
const BIATHLON_R2_START=BIATHLON_R1_END+BIATHLON_LEG;    // 800
const BIATHLON_R2_END=BIATHLON_R2_START+BIATHLON_RANGE;  // 1000
const BIATHLON_DIST=BIATHLON_R2_END;
const BIATHLON_PENALTY_SEC=3; // штраф за каждую не собранную звезду рубежа — владелец выбрал сам
// 06.09.2026 «Эстафета»: открытая цепочка на всех (в игре ещё нет системы друзей/команд —
// владелец выбрал так сам), 4 этапа по 300м. Каждый этап — свой сид (relaySeed+'·relay·'+leg),
// не один непрерывный сид на все 1200м: непрерывность здесь — в счёте/жизнях, которые
// переходят из этапа в этап, а не в буквально одной трассе (иначе пришлось бы на лету мотать
// поток случайных чисел вперёд на месте передачи — рискованно, реального выигрыша не даёт).
const RELAY_LEG_DIST=300;
const RELAY_LEGS_TOTAL=4;
/* 06.09.2026 «Эстафета»: конец ленты предыдущего этапа — вместо занавеса (как в Театре)
   передаём управление живому игроку тем же canvas'ом, тем же забегом. Дёшево, потому что
   это ровно то же самое, что уже делает обычный взлёт (startGame, ui.js) — очистка полей,
   свой сид, свои таймеры спавна — просто вызвано посреди сессии, а не с чистого листа.
   Счёт/жизни НЕ трогаем — они уже несут унаследованное значение с прошлого этапа плюс то,
   что накопилось за просмотр (ничего, просмотр очков не даёт — near-miss тоже молчит:
   S.invuln=1e9 весь просмотр, а fullRisk()/очки near-miss физически не читаются в кадрах
   Театра/просмотра — тот же путь кода, что уже работал для Театра). */
function relayHandoffToLive(){
  S.relayWatching=false;
  for(const o of obstacles) poolOb.give(o); obstacles=[];
  for(const s of stars) poolStar.give(s); stars=[];
  for(const p of powerups) poolPow.give(p); powerups=[];
  for(const p of particles) poolPart.give(p); particles=[];
  for(const p of popups) poolPop.give(p); popups=[];
  mapSeedKey = S.relaySeed+'·relay·'+S.relayLeg;
  mapRNG = keyRNG(mapSeedKey);
  mapSeqReset();
  S.dist=0; spawnT=0; starT=0; powT=0;
  S.time=0; // 06.09.2026: часы этапа считают только живой полёт — время просмотра повтора в сдаваемый time_sec не идёт
  /* 06.09.2026, найдено при повторной проверке: ghostRec()/S.dist оба безусловные (никогда не
     проверяют runMode) — во время просмотра plane.x/y ведёт ЧУЖАЯ лента, а S.dist честно растёт
     от 0 до конца чужого этапа, значит rec уже накопил сэмплы просмотра (чужие координаты,
     чужая дистанция) ДО этой строки. Без сброса лента, отправляемая на сервер этим этапом
     (ghostPackDaily() читает rec напрямую), везла бы просмотр, приклеенный перед живым куском,
     с разрывом дистанции на стыке (300→0) — соперник получил бы битый повтор. Тот же момент,
     что уже обнуляет S.dist/S.time, обязан обнулять и rec. */
  rec=[]; recFrame=0;
  S.invuln=1.5; // обычная благодать взлёта — бесконечная (1e9) была только на время показа
  ghost=null; ghostOn=false; ghostForeign=false; // тень выключена — дальше игрок правда сам
  plane.vx=0; plane.vy=0; // позиция остаётся, где её оставила лента — руль с нуля, не телепорт
}
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
/* v1.476.0 «Дополнительно» (первый шаг — только механизм, экран настроек следующим файлом):
   персистентный потолок темпа для игроков, которым нужен более медленный мир — не спор с
   буллет-таймом/смертью/паузой, а ещё один потолок в той же цепочке Math.min(), которой уже
   пользуются все временные эффекты. 1 = выкл (по умолчанию, поведение не меняется ни для
   кого, кто не открывал новый экран настроек). Значение приходит из Store в ui.js — здесь
   только сам механизм и его чистая, проверяемая стражем логика. */
let A11Y_SPEED=1;
function baseTimeScale(slowmoOn, dying, pausing, a11ySpeed, freezing){
  let ts = slowmoOn ? .45 : 1;
  if (dying) ts=Math.min(ts,.12);
  if (pausing) ts=Math.min(ts,.05);
  ts=Math.min(ts, a11ySpeed);
  // 06.09.2026 «Стоп-кадр» (новый 7-й бонус): та же цепочка потолков — мир замирает
  // (ts=0, преграды/звёзды не двигаются), самолёт по-прежнему летит на raw dt (см. update()
  // ниже — управление НЕ умножается на timeScale), значит остаётся управляемым в застывшем мире.
  if (freezing) ts=0;
  return ts;
}
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
function spawnObstacle(forceKind, forceDir){
  /* 01.09.2026 «Расстановка — реальный эффект»: раньше точка Партитуры (forgeCfg.sc) жила
     только в редакторе — «Здесь всегда будет комета» было обещанием интерфейса без кода за
     ним. Теперь на каждый спавн (кроме случая, когда forceKind уже пришёл готовым — сейчас
     такого вызова нет, но защита на будущее) сверяемся с ближайшей неизрасходованной точкой
     автора. Указатель S.customScIdx — тот же однопроходный обход, что описан в комментарии
     forge.js:120 («отсортировано по дистанции — так их читает game.js по одному разу»). */
  if (forceKind===undefined && S.mode==='custom' && S.customSc){
    while (S.customScIdx < S.customSc.length && S.customSc[S.customScIdx].at <= S.dist){
      const pt = S.customSc[S.customScIdx++];
      if (pt.type==='pause') return 0; // гарантированная передышка — этот спавн-слот пуст
      if (pt.type==='kind'){ forceKind = FORGE_KINDS[pt.kind]; forceDir = pt.dir; break; }
      // marker — не влияет на полёт, продолжаем цикл к следующей неизрасходованной точке
    }
  }
  let extraGap = 0;
  if (obstacles.length>=MAXOB) return extraGap;
  const d = difficulty(), m = S.mission, kindWave=m+(S.dist>=120?1:0)+(S.dist>=300?1:0), fl = fieldL(), fw = fieldW();
  const x = fl + mapRand(30, fw-30);
  const vy = S.speed * mapRand(.9,1.25);
  /* 23.08.2026 «Заряженная пара» (владелец): два ловца, между ними нить — 1.3с честного
     нарастания (видно, что будет удар, не угадайка), потом короткий разряд. Опасна не
     точка, а полоса вдоль отрезка между ловцами шириной 10px (запас поверх стандартных
     6px — нить менее очевидная угроза, чем твёрдый силуэт).
     ВРЕМЕННЫЙ ПОРОГ: S.mission>=8 — для проверки механики прямо сейчас, до того как
     весь биом 2 (переход, «Первый рубеж пройден», семь новых волн) будет построен.
     Когда биом 2 появится как отдельная система — этот порог заменяется на вход в биом. */
  if (!forceKind && S.mode!=='slalom' && S.mission>=8 && obstacles.length<MAXOB-1 && mapRand(0,1)<.05){
    const px1=fl+mapRand(60,fw*.4), px2=fl+fw*.6+mapRand(0,fw*.4-60);
    const o1=poolOb.take(), o2=poolOb.take();
    for (const oo of [o1,o2]){
      oo.kind='seeker'; oo.nm=false; oo._tint=null; oo._path=null; oo._tg=null; oo._tgk=undefined; oo.rot=0;
      oo.y=-50; oo.r=17; oo.vy=vy*.75; oo.vx=0; oo.vr=.1; oo.pulse=0;
      oo.paired=true; oo.beamPhase='charge'; oo.beamT=0;
    }
    o1.x=px1; o2.x=px2;
    o1.pairMate=o2; o2.pairMate=o1; o1.pairLead=true; o2.pairLead=false;
    obstacles.push(o1); obstacles.push(o2);
    return .5; // пара занимает много места — следующий спавн чуть позже
  }
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
  if (S.mode==='slalom'){ // 06.09.2026: дисциплина — только ворота, ничего кроме них
    for (const e of w) e[1]=0;
    const g=w.find(e=>e[0]==='gate'); if (g) g[1]=1;
  }
  let kind;
  if (forceKind) kind=forceKind;
  else {
    let tot=0; for(const e of w) tot+=e[1];
    let r=mapRNG()*tot; kind='rock';
    for(const e of w){ r-=e[1]; if(r<=0){ kind=e[0]; break; } }
  }
  const o = poolOb.take();
  o.kind=kind; o.nm=false; // near-miss: флаг сбрасывается при каждом взятии из пула
  o._tint=null; // v1.282.14: планетарий кэширует тон камня прямо на объекте, а объект приходит из пула. Без сброса тон переживал перерождение: дрейферы красили астероиды в лиловый, астероиды дрейферов — в серый, и собственный хэш по r/rot переставал работать
  o._path=null; // 13.08.2026: и силуэт тоже — он кэшируется на объекте, а объект переиспользуется. Тот же класс граблей, что у _tint строкой выше
  o._decor=null; // 26.08.2026: и случайные блик/тень/кратеры камня (render.js) — тот же класс граблей: без сброса переродившийся камень донашивал бы чужие «скобки»
  o._sprite=null; // 31.08.2026: и испечённый спрайт гранёного камня (render.js: bakeRockSprite) — тот же класс граблей, четвёртое поле подряд
  o._tg=null; o._tgk=undefined; // 13.08.2026: и градиент хвоста кометы (render.js). Третье поле того же класса:
  // ключ _tgk сторожит содержимое и потому беда латентна — но gfxInvalidate() при потере контекста
  // обходит только живой массив obstacles, а лежащие в пуле объекты выносят обратно градиент МЁРТВОГО
  // контекста. Правило простое: что бы модуль ни повесил на объект, из пула он выходит чистым. Страж 109
  o._blikR=null; // 23.08.2026: и безопасный радиус блика (render.js) — тот же класс, четвёртое поле подряд
  o.paired=false; o.pairMate=null; o.pairLead=false; o.beamPhase='charge'; o.beamT=0; // 02.09.2026 «Ревизия»: пятое поле того же класса — заряженная пара уничтожается, объект уходит в пул с paired=true/pairMate/beamPhase='strike', следующий спавн ЛЮБОГО вида донашивал чужую пару и получал луч к случайному камню
  o.rot=mapRand(0,6.28);
  if (kind==='rock'){ // астероид
    o.x=x; o.y=-50; o.r=mapRand(16,34+d*16); o.vy=vy; o.vx=mapRand(-.4,.4)*d;
    o.vr=mapRand(-.03,.03); o.verts=makeRockVerts(7);
  } else if (kind==='debris'){ // обломок (панель спутника)
    o.x=x; o.y=-60; o.r=mapRand(14,24); o.vy=vy; o.vx=mapRand(-.5,.5)*d;
    o.vr=mapRand(-.06,.06); o.w=mapRand(26,44); o.h=mapRand(8,14);
    o.skin=(mapRand(0,5))|0; // v1.105.0 «Свет и дым», расширено 27.08.2026 (владелец: больше лиц обломкам,
      // 4→5, добавлен иллюминатор в render.js; отдельная «ферма» пробовалась и была снята —
      // пустой каркас плохо виден на фоне неба) — лицо тасует сид, честность записи не пострадает
  } else if (kind==='drift'){ // дрейфер — ходит горизонтально
    o.x=x; o.y=-50; o.r=mapRand(15,22); o.vy=vy*.85;
    o.vx=mapRand(1.2,2.4)*(forceDir===1||forceDir===-1?forceDir:(mapRNG()<.5?-1:1)); o.vr=.05; o.verts=makeRockVerts(6);
  } else if (kind==='mine'){ // мина — слабо тянется к игроку
    o.x=x; o.y=-50; o.r=16; o.vy=vy*.7; o.vx=0; o.vr=.08; o.pulse=0;
  } else if (kind==='sat'){ // спутник (волна 3+): виляет синусоидой
    o.baseX=x; o.x=x; o.y=-50; o.r=18; o.vy=vy*.9; o.vx=0; o.vr=.02;
    o.ph=mapRand(0,6.28); o.amp=mapRand(28,58);
    o.skin=(mapRand(0,4))|0; // v1.105.0: семья спутников — лицо тасует сид
  } else if (kind==='comet'){ // комета (волна 4+): быстрая, по диагонали, летит к центру
    if (forceDir===1||forceDir===-1){
      /* сторона появления обязана совпадать с направлением полёта — комета всегда идёт
         к центру поля, значит вылетающая вправо (forceDir=1) обязана появиться в ЛЕВОЙ
         половине честного диапазона (20-80% ширины поля), а не где придётся. Считаем от
         fl/fw (координаты поля), не от W/2 — на широких экранах поле уже не на весь W. */
      o.x = forceDir===1 ? fl+mapRand(fw*.2, fw*.5) : fl+mapRand(fw*.5, fw*.8);
      o.y=-40; o.r=mapRand(13,17); o.vy=vy*mapRand(1.5,1.8); o.vx=forceDir*mapRand(1.5,3); o.vr=0; o.rot=0;
    } else {
      o.x=fl+mapRand(fw*.2,fw*.8); o.y=-40; o.r=mapRand(13,17); o.vy=vy*mapRand(1.5,1.8);
      o.vx=(o.x<W/2?1:-1)*mapRand(1.5,3); o.vr=0; o.rot=0;
    }
  } else if (kind==='seeker'){ // мина-ловец (волна 5+): заметно тянется к самолётику
    o.x=x; o.y=-50; o.r=17; o.vy=vy*.75; o.vx=0; o.vr=.1; o.pulse=0;
  } else { // ворота (волна 6+): два пилона, узкий проход = бонус
    o.x=fl+mapRand(110,fw-110); o.y=-60; o.r=15; o.vy=vy*.8; o.vx=0; o.vr=0; o.rot=0;
    /* 22.08.2026 «Затягивающиеся ворота»: проход дышит — картинка и реальная сложность
       совпадают (вариант 2, решение владельца): чем ближе выглядят пилоны, тем уже
       настоящий просвет.
       01.09.2026: раньше дыхание держали до волны 7 («после неё визуальное разнообразие
       по видам кончается — новых силуэтов больше нет»), первые ворота (волна 6) были
       статичными. Владелец — убрать задержку: дыхание опаснее и интереснее сразу же, у
       самых первых ворот, а награда за честный пролёт впритык звучит заметно лучше, когда
       просвет и правда сужался/расширялся, а не был на глаз одинаковым всё время. */
    o.breathe = true;
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
  /* 26.08.2026: было y=-30 — в 1.5-2 раза меньше разгона, чем у препятствий (y=-40..-60),
     подтверждено живым замером спавна. Меньше пути до края поля — звезда въезжала в кадр
     заметно резче своего маленького размера, читалось как «появилась из ниоткуда». Поднято
     до -50, как у большинства препятствий (rock/mine/drift/seeker), владелец подтвердил
     это же число. */
  s.x=fieldL()+mapRand(40,fieldW()-40); s.y=-50; s.r=11; s.vy=S.speed*mapRand(.95,1.1); s.ph=mapRand(0,6.28);
  stars.push(s);
  S.starsSpawned++; // 05.09.2026 «100%»: сколько звёзд появилось за забег — база для проверки полного сбора
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
let _lastPowerupKind=null; // 30.08.2026 (владелец: «два щита подряд не нравится») — антиповтор: не то же
  // самое, что было прошлый раз. Модульная переменная, не на S — сброс не нужен, первый спавн флайта
  // не с чем сравнивать (null не совпадёт ни с одним kind), дальше сама себя поддерживает по флайту.
function spawnPowerup(forceKind){ // forceKind — урок III «Ловец бонусов»: бонус по расписанию
  // слот спавна один (пауза ~10-14с на старте, ~6-8с на пике) — новые бонусы делят его со старыми, поле не переполняется
  const kinds=['shield','magnet','slowmo','life','dash','nova','freeze']; // v1.40.0 «Шесть жестов»: классика + Таран + Сверхновая; freeze — 06.09.2026 «Стоп-кадр», седьмой
  const lifeCap=(S.mode==='custom')?(S.customLv||3):3; // v1.70.0: потолок жизней — у своей трассы он авторский, иначе бонус ломал бы «Ад на одну жизнь»
  const weights=[3,3,2,1,1,1,1]; // фиксированный диапазон: состояние игрока не сдвигает весь seed-поток; freeze весом 1 — редкий, как Таран/Сверхновая (владелец, 06.09.2026)
  // 30.08.2026: множитель был жёстко зашит *9 вместо суммы весов (3+3+2+1+1+1=11) — тот же
  // приём, что уже верно сделан в spawnObstacle() чуть выше в этом файле (tot считается из
  // массива, не вписан числом). При *9 цикл гарантированно останавливался не позже «life»
  // (3+3+2+1=9) — «dash» и «nova» были математически недостижимы ни при каком mapRNG().
  // Проверено численно (2 000 000 прогонов той же формулы): dash/nova выпадали 0 раз из 2 млн.
  let tot=0; for(const w of weights) tot+=w;
  let kind='shield';
  // 30.08.2026: до двух попыток — если первая совпала с прошлым спавном, пересдаём один раз.
  // Не бесконечный цикл (не гоняем RNG до победного), не завязано на состояние игрока (жизни/очки) —
  // только на то, что САМА RNG только что выдала, поэтому «Трасса дня»/гонка с призраком остаются
  // честно одинаковыми у всех игроков на одном сиде (тот же принцип, что уже объяснён владельцу
  // про фиксированные weights чуть выше).
  for(let attempt=0; attempt<2; attempt++){
    let r=mapRNG()*tot; kind='shield';
    for(let i=0;i<kinds.length;i++){ r-=weights[i]; if(r<=0){kind=kinds[i];break;} }
    if (kind!==_lastPowerupKind) break;
  }
  _lastPowerupKind=kind; // память — по сырому результату RNG, ДО подстановок life/nova ниже (иначе
    // память стала бы зависеть от жизней/времени игрока, а не только от потока RNG — тот же риск
    // расхождения сида между игроками, которого избегают фиксированные weights)
  if (typeof forceKind==='string') kind=forceKind;
  if (kind==='life' && S.lives>=lifeCap) kind='shield'; // v1.46.0: жизнь — только раненым. Страж абсолютный: даже принудительный спавн не выдаст жизнь при полном корпусе
  if (kind==='nova' && S.time<45) kind='shield'; // слот сверхновой сохраняется, но ранняя награда остаётся безопасной
  const p=poolPow.take();
  let px=fieldL()+mapRand(50,fieldW()-50);
  for(let tries=0; tries<5 && !powerupSpotFree(px,obstacles,fieldH()); tries++) px=fieldL()+mapRand(50,fieldW()-50); // v1.415.2: до пяти попыток найти свободный коридор; на пятой — используем как есть, щедрое небо важнее идеала
  // 26.08.2026: y=-30 -> -50, тот же фикс и то же обоснование, что у spawnStar() выше —
  // разгон сравнялся с большинством препятствий, живым замером подтверждено (владелец).
  p.x=px; p.y=-50; p.r=14; p.vy=S.speed; p.kind=kind; p.ph=0;
  powerups.push(p);
}

// 31.08.2026 «Высокая ставка»: единая точка множителя очков — вместо того, чтобы размазывать
// одно и то же условие по всем семи местам начисления (звезда/таран/near-miss/ворота/сверхновая),
// каждое из них домножает свой pts на scoreMult() один раз.
function scoreMult(){ return (S.mode==='custom' && S.customHS) ? 4 : 1; }
/* ---------- Единая награда за звезду ---------- */
function collectStar(x,y){ // единственное место, где звезда превращается в награду — палец или магнит
  S.combo++; S.comboMax=Math.max(S.comboMax,S.combo);
  S.starsCollected++;
  const mult = 1+Math.min(S.combo,10)*.3;
  const pts = Math.round(50*mult)*scoreMult();
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
/* 06.09.2026, очередь 05.09 п.3 (владелец, живая находка): «повтор полёта не показывает
   захват звёзд/бонусов — самолётик пролетает мимо, будто их не берёт, хотя забег их
   засчитал». Причина: ghostDrivenWorld гасил весь блок сбора целиком, не только очки —
   звезда/бонус просто оставались висеть в небе, хотя в РЕАЛЬНОМ полёте на этом самом месте
   (тот же сид, тот же путь) она честно исчезала. Раз путь при повторе идентичен записи,
   попадание в тот же радиус в тот же момент неизбежно — визуальный эффект здесь безопасно
   включить обратно, только очки/кошелёк/статус-эффекты остаются выключены. */
function collectStarVisual(x,y){
  burst(x,y,juicy('#ffd76a','color(display-p3 1 .86 .44)'), Q.level>=3?12:(Q.level>=2?10:8));
  planetSpark(x,y);
  sfx.coin(1);
}
function collectPowerupVisual(p){
  sfx.power(p.kind);
  burst(p.x,p.y,'#fff',12);
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
let smoothWasPerfect=true; // v1.77.0 (владелец): старт полёта S.smooth=1 — это не заслуга игрока,
  // попап должен праздновать ВОЗВРАЩЕНИЕ к идеалу после рывка, не сам факт старта с потолка
function updateSmoothHud(){
  const v=Math.round(S.smooth*100);
  if (v===lastSmoothShown) return; lastSmoothShown=v;
  const el=elSmoothFill; if(!el) return;
  el.style.transform='scaleX('+Math.max(0,(S.smooth-.5)*2)+')'; // v1.66.0: compositor-only
  el.style.background = S.smooth>.92?'#8fff9f':S.smooth>.75?'#ffd76a':'#ff9f8f'; // 22.08.2026: пороги сужены (было .85/.65) — «пустая механика» больше не пустая
  // v1.77.0 (владелец, 31.08.2026): «Плавность» есть, но невидима в моменте — реюзаем готовый
  // showPopup(), тот же приём, что у «Впритык»/«Ворота» — не новый визуальный язык.
  if (v>=99){ if(!smoothWasPerfect){ smoothWasPerfect=true; showPopup(L.smoothPerfect, plane.x, plane.y-40, '#8fff9f'); } }
  else smoothWasPerfect=false;
}

/* ---------- Личный призрак: запись траектории рекордного забега ---------- */
/* Сэмпл каждые 10 кадров: x и y по 92 уровня (~4-5px), дельта дистанции.
   Упаковка по 3 символа — влезает в лимит CloudStorage 4096 (~1300 сэмплов ≈ 3.5 мин). */
let prevKX=0, prevKY=0; // v1.282.15: прошлое положение клавиш — для замера резкости руления
let rec=[], recFrame=0, ghost=null, ghostIdx=0, ghostX=0, ghostY=0, ghostOn=false,
    ghostFade=0, ghostA=0, ghostTagT=0, ghostForeign=false, ghostSkin=-1, ghostName='',
    ghostPid=0, ghostBest=0, ghostCat=''; // чей призрак (месть): владелец, его рекорд, категория
const GHOST_CAP=1300;
/* 06.09.2026 «Толпа Неба месяца»: отдельный, лёгкий, ПАРАЛЛЕЛЬНЫЙ слой — не трогает ни одно
   поле выше (ghost/ghostX/...), которое уже используют Театр/Эстафета/Топ-призрак/Трибуна.
   До CROWD_CAP силуэтов прошлых игроков этого месяца, без имени/следа-морзянки/ауреолы —
   владелец выбрал так явно на макете. Каждая запись несёт свою мини-копию интерполяции
   ghostStep(), только по ленте, никогда по обычному самолётику (crowdGhosts не читает и не
   пишет S.invuln/hitPlane — чисто декоративный слой, столкновений с ним в принципе нет). */
let crowdGhosts=[];
const CROWD_CAP=10;
function crowdGhostsClear(){ crowdGhosts=[]; }
function crowdGhostsLoad(list){ // list: [{skin,track}] — уже отфильтровано сервером (share_ghost, не свой pid)
  crowdGhosts=[];
  if (!Array.isArray(list)) return;
  for (const it of list){
    if (crowdGhosts.length>=CROWD_CAP) break;
    const g=(it && typeof ghostParse==='function') ? ghostParse(it.track) : null;
    if (!g) continue; // битая/короткая лента — тихо пропускаем, не рушим остальную толпу
    crowdGhosts.push({g:g, idx:0, x:0, y:0, on:false, fade:0, skin:(isFinite(it.skin)?it.skin:0)});
  }
}
function crowdGhostsStep(){
  if (!crowdGhosts.length) return;
  for (const c of crowdGhosts){
    const ds=c.g.ds, n=ds.length;
    while (c.idx<n-1 && ds[c.idx+1]<S.dist) c.idx++;
    if (S.dist>=ds[n-1]){ c.on=false; continue; } // долетела до конца своей ленты — тихо гаснет, не перезапускаем по кругу (не карусель, честный слепок месяца)
    const i=c.idx, d0=i?ds[i-1]:0, d1=ds[i];
    const f=d1>d0?clamp((S.dist-d0)/(d1-d0),0,1):0;
    const xf=lerp(i?c.g.xs[i-1]:c.g.xs[i], c.g.xs[i], f);
    // все ленты толпы — только чужие daily_runs.track (ghostPackDaily(), коридорные координаты),
    // своей несжатой (rec, W-координаты) тут никогда не бывает — в отличие от одиночного ghost.cx,
    // ветвление не нужно, формула всегда одна.
    const tx=fieldL()+xf*fieldW();
    const ty=lerp(i?c.g.ys[i-1]:c.g.ys[i], c.g.ys[i], f)*(fieldH()*.78-50)+fieldT()+fieldH()*.22;
    if (!c.on){ c.x=tx; c.y=ty; } else { c.x=lerp(c.x,tx,.18); c.y=lerp(c.y,ty,.18); }
    c.on=true;
    c.fade=clamp(c.fade+.04,0,1);
  }
}
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
// v1.472.1: ghostOff() убрана — ноль вызовов во всём проекте (KNOWN-BUGS.md,
// подтверждено 24.08.2026), и не эквивалентна ни одному из трёх реальных мест сброса
// тени: не знает про поля мести (ghostForeign/ghostSkin/ghostName/ghostPid/ghostBest/
// ghostCat), а её вызов в тике полёта (ghostStep) нарушил бы Zero-GC (аллокация
// ghostMorseBuf=[] каждый кадр). Сами три места не тронуты — расхождение между ними
// осознанное, разобрано отдельно.

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
      const ownSky = (runMode==='classic');
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
    if (runMode==='classic' && grSeed && typeof keyRNG==='function'){
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

// Б1 «Оплата за страх» (v1.92.0): «впритык» — плата за риск. Под слоу-мо или тараном
// риска нет — сближение честно засчитывается (статистика, свист), но монет не приносит.
// Неуязвимость и занавес смерти закрыты снаружи (S.invuln<=0): там впритык даже не регистрируется.
// v1.282.20: щит добавлен к списку «риска нет». 14 секунд щита позволяли нырять в самую
// гущу и снимать по 25×комбо за каждый пролёт впритык — до полутора тысяч очков с одного
// бонуса, без единого шанса погибнуть. Остальные три страховки в списке уже были.
function fullRisk(){ return S.slowmo<=0 && S.dash<=0 && S.shield<=0 && S.freeze<=0; } // 06.09.2026: заморозка мира — тоже не «полный риск»

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
  /* 06.09.2026, найдено при повторной проверке: три места ниже (ворота/звёзды/бонусы) считали
     «зритель смотрит чужую ленту» только как `runMode==='theater'`, написано до Эстафеты.
     Но Эстафета (S.relayWatching) — ТОТ ЖЕ приём: чужая лента ведёт plane.x/y, а мир вокруг
     живой (тот же обычный game loop, тот же сид, значит те же звёзды/бонусы на тех же местах,
     что уже забрал автор ленты). Без этого исключения зритель повторно собирал чужие звёзды
     (S.starsCollected → реальные Stars в кошелёк на посадке), получал бонусы (S.bonuses,
     причём щит/магнит/слоумо/фриз реально взводятся и не сбрасываются в relayHandoffToLive —
     живой этап начинался бы с чужого, неотработанного щита) и очки за пролёт ворот — на пустом
     месте, до того как игрок вообще взял руль. `S.invuln=1e9` тут не защищает: near-miss/удар
     гасятся по `S.invuln<=0`, а эти три места проверяют `runMode`, не `S.invuln`, отдельно. */
  const ghostDrivenWorld = runMode==='theater' || (runMode==='relay' && S.relayWatching);
  input.useGyro = gyroUnlocked() && performance.now()-input._t<600; // сторож + замок: гироскоп рулит только после «Полёта без рук», молчащий датчик не держит старый наклон
  let ts = baseTimeScale(S.slowmo>0, S.dying, S.pausing, A11Y_SPEED, S.freeze>0); // v1.476.0: та же цепочка потолков, что раньше жила прямо здесь — вынесена, чтобы её можно было проверить стражем отдельно от всего update(); 06.09.2026: freeze — новый бонус «Стоп-кадр»
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
      /* Передышка после ворот теперь ВНУТРИ множителей — тот же порядок, что и раньше.
         25.08.2026: убран множитель ×(1/GYRO_ASSIST). paceFactor (см. выше: S.speed/basePace)
         уже перевёл trackDt в «время, эквивалентное расстоянию» — под гироскопом он и так
         течёт на GYRO_ASSIST медленнее, ровно настолько, чтобы шаг в метрах сохранился.
         Добавляя здесь ЕЩЁ раз 1/GYRO_ASSIST, паузу растягивали дважды: страж 60 намерил
         вместо честного шага в метрах расхождение 15.6% (гироскоп получал на 15% меньше
         преград на километр) — численная проверка (короткий скрипт) без второго множителя
         даёт 0.4% вместо 15.5%, подтверждая, что paceFactor компенсирует один в один. */
      return (lerp(.85, .26, d) * mapRand(.75,1.25) + (extraGap||0)) * (S.mode==='custom'?(S.customD||1):1);
    });
  }
  starT -= trackDt;
  /* v1.282.20: звёзды и бонусы получали ту же явную поправку на штурвал, что и преграды —
     тогда trackDt ещё не нормализовал темп по факту S.speed/basePace. 25.08.2026: множитель
     ×(1/GYRO_ASSIST) убран здесь же, по той же причине, что и у преград (см. запись у
     spawnObstacle) — starT/powT тоже декрементируются общим trackDt, который уже учёл
     скорость гироскопа через paceFactor. Двойная компенсация давала гироскописту на
     ~15-17% меньше звёзд/бонусов на метр, чем пальцевику — тот же класс ошибки, что и
     у преград (страж 60), просто раньше не всплывал в тексте страж, потому что страж
     останавливается на первой упавшей проверке (dObs), не доходя до dStars/dPows. */
  if (starT<=0){ starT = withTrack('st', function(){
    // 06.09.2026 «Биатлон»: звёзды идут только внутри рубежа (300-500м, 800-1000м) — скоростные
    // отрезки нарочно пустые от них, как в реальном биатлоне лыжня пуста от мишеней.
    const biathlonGate = S.mode!=='biathlon' || (S.dist>=BIATHLON_R1_START&&S.dist<BIATHLON_R1_END) || (S.dist>=BIATHLON_R2_START&&S.dist<BIATHLON_R2_END);
    if (biathlonGate) spawnStar();
    return mapRand(.8,1.5); }); } // честный базовый темп (эталон v1.10.0)
  powT -= trackDt;
  if (powT<=0){ powT = withTrack('pw', function(){
    if (!(S.mode==='custom' && S.customB===0) && S.mode!=='ironman' && S.mode!=='slalom') spawnPowerup(); // 05.09.2026: Ironman — 0 бонусов, часть цены за ×4 очков; 06.09.2026: Слалом — тоже без бонусов, они бы позволили пройти ворота без срыва
    return powGap() * (S.mode==='custom'?forgeBonusGapMul(S.customB):1); }); } // бонусы интуитивны (v1.16.0); темп — за сложностью (v1.36.0); Своя трасса: частота автора, «выкл» = пустое небо (v1.69.0)

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
  // 06.09.2026 «Солнечный ветер»: порыв как function(дистанция) — не постоянный снос, качается
  // туда-сюда, период ~7854 условных единиц S.dist. Только у своих трасс (S.customWind), обычные
  // режимы этот код не выполняют вообще. Толкает ПОЗИЦИЮ напрямую (после руления, до ограничения
  // полем) — одинаково действует на любой штурвал (тач/мышь считают vx иначе, чем гиро/клавиатура,
  // общей точки в ax/ay для них нет). Проверено численно (короткий скрипт): при wind=100
  // максимум ~2.6px/кадр, ~35% от maxV=7.5 — заметно, не рвёт управление.
  let windPush=0;
  if (S.mode==='custom' && S.customWind>0){
    windPush = Math.sin(S.dist*0.0008) * (S.customWind/100) * 2.6;
  }
  plane.x = clamp(plane.x + plane.vx + windPush, 20+flPlane, W-20-flPlane);
  plane.y = clamp(plane.y + plane.vy, fieldT()+fieldH()*.22, fieldT()+fieldH()-50); // v1.282.20: потолок и пол — от коридора, не от высоты экрана
  if (!S.dying) plane.bank = lerp(plane.bank, clamp(plane.vx/maxV,-1,1), .15); // при занавесе крен задаёт падение
  smoothStep(); // Smooth Flight: замер резкости после обработки ввода
  ghostRec();  // призрак: запись сэмпла (каждый 10-й кадр внутри)
  morseRec();  // морзянка: точка шлейфа (каждый кадр, буфер короткий)
  ghostStep(); // призрак: позиция по текущей дистанции
  if (runMode==='daily') crowdGhostsStep(); // 06.09.2026 «Толпа Неба месяца»: только в этом режиме — в остальных массив просто пуст (crowdGhostsClear() на взлёте)

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
  // 06.09.2026 «Эстафета»: тот же приём, что у Театра выше (самолётик по ленте, invuln=1e9) —
  // но в конце ленты НЕ занавес, а живая передача управления (relayHandoffToLive), тот же
  // забег продолжается тем же canvas'ом, без перезагрузки экрана.
  else if (runMode==='relay' && S.relayWatching){
    if (ghost && ghost.ds){
      const dxT=ghostX-plane.x; plane.x=ghostX; plane.y=ghostY; plane.vx=0; plane.vy=0;
      plane.bank=lerp(plane.bank,clamp(dxT/8,-1,1),.3);
      ghostA=0; S.invuln=1e9;
      if (S.dist>=ghost.ds[ghost.ds.length-1]) relayHandoffToLive();
    }
    else relayHandoffToLive(); // ленты нет (битый трек и т.п.) — сразу отдаём управление, не топим этап пустым занавесом
  }

  if (S.invuln>0) S.invuln-=dt;
  if (S.shield>0) S.shield-=dt;
  if (S.magnet>0) S.magnet-=dt;
  if (S.slowmo>0) S.slowmo-=dt;
  if (S.dash>0) S.dash-=dt; // Таран: 4 секунды пробоя (v1.40.0)
  if (S.freeze>0) S.freeze-=dt; // 06.09.2026 «Стоп-кадр»: 2 секунды, тоже в реальном времени — та же логика, что у слоумо (длительность самого эффекта не тянется вместе с замедленным миром)
  S.time += dt; // часы полёта — по ним сверхновая узнаёт, что старт позади
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
    if (o.kind==='seeker' && o.paired){
      /* 23.08.2026 «Заряженная пара»: партнёр проверяется на живость перед каждым чтением —
         если он уничтожен/вылетел, ссылка сама себя обезвреживает (падаем в обычное
         поведение одиночного ловца), не полагаемся на ручную чистку в местах удаления. */
      if (o.pairMate && obstacles.indexOf(o.pairMate)===-1){ o.pairMate=null; o.paired=false; }
      else if (o.pairMate && o.pairLead){ // цикл считает только «ведущий» — оба узнают исход через pairMate
        o.beamT += dt*paceFactor;
        if (o.beamPhase==='charge'){ if (o.beamT>=1.3){ o.beamPhase='strike'; o.beamT=0; } }
        else { if (o.beamT>=.15){ o.beamPhase='charge'; o.beamT=0; } } // сама вспышка — короткая
        o.pairMate.beamPhase=o.beamPhase; o.pairMate.beamT=o.beamT;
        if (o.beamPhase==='strike' && S.invuln<=0){ // зона поражения — полоса 10px вдоль отрезка, не линия без толщины
          const x1=o.x,y1=o.y,x2=o.pairMate.x,y2=o.pairMate.y;
          const dx=x2-x1, dy=y2-y1, lenSq=dx*dx+dy*dy;
          const t=lenSq>0?clamp(((plane.x-x1)*dx+(plane.y-y1)*dy)/lenSq,0,1):0;
          const cx=x1+t*dx, cy=y1+t*dy, ddx=plane.x-cx, ddy=plane.y-cy;
          if (ddx*ddx+ddy*ddy < (5+plane.r)*(5+plane.r)){
            if (S.shield>0){ S.shield=0; burst(plane.x,plane.y,'#7fd8ff',14); sfx.shieldBlock(); haptic('medium'); if(typeof gamepadRumble==='function') gamepadRumble(.4,90); showPopup(L.shieldDown, plane.x, plane.y-40, '#7fd8ff'); }
            else { hitPlane('beam'); if (S.lives<=0){ if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':beam'); startDying(); return; } } // 02.09.2026 «Ревизия»: у гейта/обычных столкновений эта проверка уже есть (2273, 2314) — у луча не было, забег не заканчивался на нуле жизней
          }
        }
      }
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
          const pts=Math.round(50*(1+Math.min(S.combo,10)*.3))*scoreMult();
          S.score+=pts; showPopup('+'+pts,o.x,o.y,'#a9bcff');
          burst(o.x,o.y,'#a9bcff',16); sfx.smash(); haptic('medium'); if(typeof gamepadRumble==='function') gamepadRumble(.4,90); S.shake=Math.max(S.shake,.5);
        } else if (S.shield>0){
          S.shield=0; killIdx(obstacles,i,poolOb);
          burst(o.x,o.y,'#7fd8ff',14); sfx.shieldBlock(); haptic('medium'); if(typeof gamepadRumble==='function') gamepadRumble(.4,90);
          showPopup(L.shieldDown, plane.x, plane.y-40, '#7fd8ff');
        } else if (S.mode==='slalom'){ // 06.09.2026: реальное правило слалома — любое касание рамки срывает заезд целиком, не отнимает жизнь
          if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':slalom_dq');
          S.slalomFail=1; startDying(); return;
        } else {
          hitPlane('gate');
          killIdx(obstacles,i,poolOb);
          if (S.lives<=0){ if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':gate'); startDying(); return; } // v1.108.1: волна+причина, анонимно — балансовая телеметрия
        }
        continue;
      }
      if (S.invuln<=0 && gnm){ // впритык к пилону — обычный near-miss
        o.nm=true; Stats.nearMiss=(Stats.nearMiss||0)+1; S.nearMiss++; // 05.09.2026: Stats — пожизненно, S — паспорт этого забега (см. init в ui.js:298)
        sfx.nearMiss();
        haptic('light');
        if (fullRisk()){ // Б1: монеты — только за настоящий риск
          const pts=Math.round(25*(1+Math.min(S.combo,10)*.3))*scoreMult();
          S.score+=pts;
          showPopup(L.nearMiss+' +'+pts, o.x, o.y, '#eef4ff'); // 22.08.2026: развели с щитом/воротами — нейтральный, не спорит с будущим лабрадоритом
        }
      }
      if (!ghostDrivenWorld && !o.passed && o.y>plane.y){ // ворота пролетели — был ли самолётик в проходе (v1.94.0: в театре касса молчит; 06.09.2026: + просмотр в Эстафете)
        o.passed=true;
        if (Math.abs(plane.x-o.x) < o.gap/2-plane.r-6){
          const pts=Math.round(150*(1+Math.min(S.combo,10)*.3))*scoreMult();
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
          const pts=Math.round(50*(1+Math.min(S.combo,10)*.3))*scoreMult();
          S.score+=pts; showPopup('+'+pts,o.x,o.y,'#a9bcff');
          burst(o.x,o.y,'#a9bcff',16); sfx.smash(); haptic('medium'); if(typeof gamepadRumble==='function') gamepadRumble(.4,90); S.shake=Math.max(S.shake,.5);
        } else if (S.shield>0){
          S.shield=0; killIdx(obstacles,i,poolOb);
          burst(o.x,o.y,'#7fd8ff',14); sfx.shieldBlock(); haptic('medium'); if(typeof gamepadRumble==='function') gamepadRumble(.4,90);
          showPopup(L.shieldDown, plane.x, plane.y-40, '#7fd8ff');
        } else {
          hitPlane(o.kind);
          killIdx(obstacles,i,poolOb);
          if (S.lives<=0){ if(typeof BEACON!=='undefined') BEACON.signal('death', S.mission+':'+S.lastHitKind); startDying(); return; } // v1.108.1: волна+причина, анонимно — балансовая телеметрия
        }
      } else if (!o.nm && d2 < (rr+24)*(rr+24) && isReceding(dx,dy,o.vx||0,o.vy,plane.vx,plane.vy)){ // near miss: пролетел вплотную и уже уходит — не летит на таран
        o.nm=true; Stats.nearMiss=(Stats.nearMiss||0)+1; S.nearMiss++; // 05.09.2026: Stats — пожизненно, S — паспорт этого забега (см. init в ui.js:298)
        sfx.nearMiss(); // свист пролёта
        haptic('light');
        if (fullRisk()){ // Б1: под бонусом — честь и свист, монет нет
          const pts=Math.round(25*(1+Math.min(S.combo,10)*.3))*(o.kind==='comet'?2:1)*scoreMult(); // комета: двойной бонус
          S.score+=pts;
          showPopup(L.nearMiss+' +'+pts, o.x, o.y, '#eef4ff'); // 22.08.2026: развели с щитом/воротами — нейтральный, не спорит с будущим лабрадоритом
        }
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
    if (!S.dying && dx*dx+dy*dy < (plane.r+s.r+6)**2){ // занавес: звёзды пролетают мимо
      if (ghostDrivenWorld) collectStarVisual(s.x,s.y); // театр/просмотр Эстафеты: та же звезда, тот же момент — но без очков (иначе зритель повторно собирает чужие)
      else collectStar(s.x,s.y);
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
    if (!S.dying && ghostDrivenWorld && dx*dx+dy*dy < (plane.r+p.r+8)**2){ // театр/просмотр Эстафеты: та же звезда-бонус, тот же момент — но без статус-эффектов и очков (иначе зритель получает чужой щит/магнит бесплатно)
      collectPowerupVisual(p);
      killIdx(powerups,i,poolPow); continue;
    }
    if (!S.dying && !ghostDrivenWorld && dx*dx+dy*dy < (plane.r+p.r+8)**2){ // v1.94.0: в реальном полёте — полный эффект
      sfx.power(p.kind); haptic('medium'); // у каждого бонуса — свой тембр
      S.bonuses++; // v1.42.0: взятые бонусы — в паспорт забега
      if (p.kind==='shield'){ S.shield=14; showPopup(L.shield,p.x,p.y,'#7fd8ff'); }
      if (p.kind==='magnet'){ S.magnet=12; showPopup(L.magnet,p.x,p.y,'#c58fff'); }
      if (p.kind==='slowmo'){ S.slowmo=6; showPopup(L.slowmo,p.x,p.y,'#8fff9f'); }
      if (p.kind==='freeze'){ S.freeze=2; showPopup(L.freeze,p.x,p.y,'#dff3ff'); } // 06.09.2026 «Стоп-кадр»: 2с, мир замирает (baseTimeScale), самолёт остаётся управляемым
      // v1.282.20: потолок жизней авторский, как и на спавне — иначе две одновременно
      // висящие в небе жизни пробивали «Ад на одну жизнь» (customLv=1) до трёх.
      if (p.kind==='life'){ S.lives=Math.min((S.mode==='custom')?(S.customLv||3):3, S.lives+1); showPopup(L.life,p.x,p.y,'#ffa1d9'); updateLives(); } // жизнь существует только для раненого: страж спавна (v1.46.0) не пускает её в небо при полном корпусе — никаких лишних жизней; v1.105.0: розовая, вне красной семьи тревоги
      if (p.kind==='dash'){ S.dash=4; S.everDash=1; showPopup(L.dash,p.x,p.y,'#a9bcff'); } // Таран: 4 секунды пробоя (v1.40.0); everDash — 05.09.2026 «Pacifist»: взял хоть раз — не в зачёт
      if (p.kind==='nova'){ S.everNova=1; if (typeof music!=='undefined'&&music.kick) music.kick(); // взрыв — музыка приседает (v1.48.0)
        // Сверхновая: вспышка сжигает все опасности на экране — каждая в очки (вес 1, редкий праздник, v1.40.0)
        const mult=1+Math.min(S.combo,10)*.3;
        let pts=0;
        for(let j=obstacles.length-1;j>=0;j--){ const o=obstacles[j];
          pts+=Math.round(100*mult)*scoreMult();
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
    const sk=SKINS_BY_ID.get(S.skin)||SKINS[0];
    const tr=TRAILS_BY_ID.get(S.trail)||TRAILS[0]; // 05.09.2026: след — независимый выбор, не от скина
    // 04.09.2026: Метки пути — редкие, не на каждый тик тягача (иначе слипнутся в пятно
    // под кораблём) — свой интервал поверх общего тягача, тот же приём, что MIN_INTERVAL_MS.
    const waypointsBlocked = tr.style==='waypoints' && (performance.now()-lastWaypointSpawn<450);
    if(!waypointsBlocked){
    const t=poolPart.take();
    t.x=plane.x+rand(-3,3); t.y=plane.y+16; t.vx=rand(-.3,.3); t.vy=rand(1,2.4);
    t.life=rand(.4,.8); t.color=sk.trail; t.size=rand(1,2.5);
    t.fx=sk.fx||''; // фирменный след скина (читается в drawFx)
    t.trailFx=tr.style||''; // 05.09.2026: язык частиц — от независимого выбора след, не от скина
    if(sk.fx==='plasma'){ t.life=rand(.6,1.05); t.size=rand(1.5,3); t.vy=rand(1.4,2.8); } // длинный огненный шлейф
    else if(sk.fx==='neon'){ t.life=rand(.3,.6); t.size=rand(.8,2); } // короткие искры
    else if(tr.style==='sparks'){ t.life=rand(.35,.65); t.size=rand(.7,1.8); t.flashAt=RNG()<.3?rand(.3,.7):null; }
    else if(tr.style==='cometdust'){ t.life=rand(.5,.9); t.size=rand(1.2,2.4); t.rot=rand(0,6.283); t.spin=rand(-.3,.3); }
    else if(tr.style==='debris'){ t.life=rand(.7,1.1); t.size=rand(1,1.8); t.jx=rand(0,6.283); t.jy=rand(0,6.283); }
    else if(tr.style==='waypoints'){ t.vx=0; t.vy=1.6; t.life=rand(1.0,1.2); t.size=1.6; lastWaypointSpawn=performance.now(); } // почти не летит, гаснет на месте
    particles.push(t);
    }
  }
  if (S.dash>0 && RNG()<.7) burst(plane.x+rand(-9,9), plane.y+12+rand(0,18), '#a9bcff', 1); // плазменный след Пули (v1.43.1) (v1.40.0, логика v1.19.0)

  // счёт в DOM — только при изменении
  // 04.09.2026 (владелец): HUD показывал сырой S.score, а итоги (ui.js:gameOver) домножают
  // его на штраф «Плавности» (0.5-1.0) — цифра в полёте была всегда ≥ настоящей, разница
  // выяснялась только на итогах. Тот же множитель здесь — то, что видно в полёте, и есть
  // честный будущий итог, без сюрприза в конце.
  const sc=Math.floor(S.score*(0.5+S.smooth*0.5));
  if(sc!==lastScoreShown){ lastScoreShown=sc; elScore.textContent=sc; }
  const d5=Math.floor(S.dist/5); // расстояние в HUD: живой счётчик, шаг 5 м — без DOM-флуда
  if(d5!==lastDistShown){ lastDistShown=d5; elDistN.textContent=d5*5; }
  const distKm=Math.floor(S.dist/1000); // v1.77.0 (владелец): золотая вспышка на каждом км — тот же приём, что у #score.pop/#livesCanvas.hit
  if(distKm>lastDistKm){ lastDistKm=distKm;
    elDistN.classList.remove('milestone'); void elDistN.offsetWidth; elDistN.classList.add('milestone'); }
  if (S.mode==='speedrun'){ // Спидран: таймер + цель; 10 000 — финиш (v1.42.0)
    const elMH=elModeHud, tSec=Math.floor(S.time*10)/10;
    if (elMH && elMH._t!==tSec){ elMH._t=tSec;
      elMH.textContent=fmtTime(S.time)+' · '+L.srGoal+' '+fmtN(SR_GOAL); }
    if (S.score>=SR_GOAL && !S.dying){ startDying(); S.srWin=1; } // занавес как при смерти, но это победа
  }
  else if (S.mode==='caravan'){ // Caravan (v1.478.74): обратный отсчёт вместо «пока не умер» — время решает, не смерть
    const elMH=elModeHud, left=Math.max(0,CARAVAN_TIME-S.time), tSec=Math.floor(left*10)/10;
    if (elMH && elMH._t!==tSec){ elMH._t=tSec; elMH.textContent=L.modeCaravan+' · '+fmtTime(left); }
    if (S.time>=CARAVAN_TIME && !S.dying){ startDying(); S.caravanTimeUp=1; } // занавес как при смерти, но это не смерть — время вышло
  }
  else if (S.mode==='hundred'){ // 100% (v1.478.80): фиксированный отрезок — цель не выжить, а долететь и собрать всё
    const elMH=elModeHud, distI=Math.floor(S.dist);
    if (elMH && elMH._t!==distI){ elMH._t=distI; elMH.textContent='100% · '+Math.min(distI,HUNDRED_DIST)+'/'+HUNDRED_DIST+(L.unitM||'м'); }
    if (S.dist>=HUNDRED_DIST && !S.dying){ startDying(); S.hundredDone=1; } // долетаешь до конца всегда — 100% отдельно проверяется на итогах по starsSpawned/starsCollected
  }
  else if (S.mode==='slalom'){ // 06.09.2026: время + прогресс по трассе — срыв (slalomFail) ставится отдельно, в блоке столкновения с воротами
    const elMH=elModeHud, distI=Math.floor(S.dist);
    if (elMH && elMH._t!==distI){ elMH._t=distI; elMH.textContent=fmtTime(S.time)+' · '+Math.min(distI,SLALOM_DIST)+'/'+SLALOM_DIST+(L.unitM||'м'); }
    if (S.dist>=SLALOM_DIST && !S.dying){ startDying(); S.slalomWin=1; } // доехал до конца, ни разу не задев ворота — победа
  }
  else if (S.mode==='biathlon'){ // 06.09.2026: скорость+рубежи — штраф прибавляется к S.time на выходе из каждого рубежа
    const elMH=elModeHud, distI=Math.floor(S.dist);
    if (elMH && elMH._t!==distI){ elMH._t=distI; elMH.textContent=fmtTime(S.time)+' · '+Math.min(distI,BIATHLON_DIST)+'/'+BIATHLON_DIST+(L.unitM||'м')+(S.biathlonMisses?' · +'+(S.biathlonMisses*BIATHLON_PENALTY_SEC)+'с':''); }
    if (S.dist>=BIATHLON_R1_END && !S.biathlonR1Done){
      S.biathlonR1Done=1;
      const missed=Math.max(0,S.starsSpawned-S.starsCollected);
      if(missed){ S.time+=missed*BIATHLON_PENALTY_SEC; S.biathlonMisses+=missed; }
      S.biathlonSnapSpawned=S.starsSpawned; S.biathlonSnapCollected=S.starsCollected; // 1й рубеж закрыт — со 2го считаем только новые звёзды
    }
    if (S.dist>=BIATHLON_DIST && !S.dying){
      const missed=Math.max(0,(S.starsSpawned-S.biathlonSnapSpawned)-(S.starsCollected-S.biathlonSnapCollected));
      if(missed){ S.time+=missed*BIATHLON_PENALTY_SEC; S.biathlonMisses+=missed; }
      startDying(); S.biathlonWin=1; // доехал до конца — победа, штрафы уже учтены в S.time
    }
  }
  else if (S.mode==='relay'){
    const elMH=elModeHud;
    if (S.relayWatching){
      if (elMH && elMH._t!==-1){ elMH._t=-1; elMH.textContent=L.relayWatching(S.relayLeg-1); } // смотрим этап N-1 один раз, текст не дёргается каждый кадр
    } else {
      const distI=Math.floor(S.dist);
      if (elMH && elMH._t!==distI){ elMH._t=distI; elMH.textContent=L.modeRelay+' '+S.relayLeg+'/'+RELAY_LEGS_TOTAL+' · '+Math.min(distI,RELAY_LEG_DIST)+'/'+RELAY_LEG_DIST+(L.unitM||'м'); }
      if (S.dist>=RELAY_LEG_DIST && !S.dying){ startDying(); S.relayLegDone=1; } // долетел до конца своего этапа — сдаём эстафету (ui.js gameOver)
    }
  }
  else if (S.mode==='daily'){ // Трасса дня: метка ритуала на табло — это небо сегодня одно на всех (v1.47.0); 05.09.2026: 'daily' последним — страж 122 ищет `S.mode==='daily'){` регуляркой
    // v1.284.3: подпись общего события берётся общим временем — trackDayKey (UTC), тем же,
    // из которого шьётся сама трасса. Здесь стоял todayKey() — личная дата: в UTC+3 вечером
    // игрок видел завтрашнее число при сегодняшней трассе. Закон №17. Страж 122.
    const elMH=elModeHud, tk=trackDayKey(); if (elMH && !elMH._t){ elMH._t=1;
      elMH.textContent=L.modeDaily+' · '+tk.slice(8)+'.'+tk.slice(5,7); } } // 07.09.2026: 1CC убран из игры — своя метка ('1CC'/иначе) больше не нужна
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
  const skin=SKINS_BY_ID.get(S.skin)||SKINS[0];
  const maxLives=(S.mode==='ironman'||S.mode==='slalom')?1:3; // 05.09.2026: Ironman — один слот, не три с двумя пустыми контурами; 06.09.2026: Слалом тоже — любое касание и так срывает заезд целиком; 07.09.2026: 1CC убран из игры
  for(let i=0;i<maxLives;i++){
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
