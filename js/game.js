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
  {id:8,name:8,price:12000,  fx:'ghost',  body:'#d8f4fa',fold:'#9cd8e4',glow:'rgba(130,235,245,.9)', trail:'rgba(120,225,240,'}, // Призрак — ледяной циан (тон 185°, единственный!)
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
  {id:9,  name:9,  price:1, premium:true, fx:'satellites', trailFx:'debris',   body:'#dde6ff',fold:'#9aa8e0',glow:'rgba(120,150,255,.95)',trail:'rgba(120,150,255,'}, // Спутники — синь тона 230°
  {id:10, name:10, price:1, premium:true, fx:'facets',     trailFx:'pearls',   body:'#f4f2ff',fold:'#c9c3ea',glow:'rgba(210,200,255,.95)',trail:'rgba(210,200,255,'}, // Грани — почти белый хрусталь
  {id:11, name:11, price:1, premium:true, fx:'inlay',      trailFx:'sparks',   body:'#ffe0ec',fold:'#e592b0',glow:'rgba(255,90,140,.95)', trail:'rgba(255,90,140,'},  // Инкрустация — рубин, тон 340°
  {id:12, name:12, price:1, premium:true, fx:'filigree',   trailFx:'cometdust',body:'#fff0d6',fold:'#e0b46a',glow:'rgba(230,170,70,.95)', trail:'rgba(230,170,70,'},  // Филигрань — старое золото, тон 35°
  {id:13, name:13, price:1, premium:true, fx:'core',       trailFx:'ribbon',   body:'#d8ffe8',fold:'#8ed9ac',glow:'rgba(70,220,130,.95)', trail:'rgba(70,220,130,'},  // Ядро — изумруд, тон 140°
  {id:14, name:14, price:1, premium:true, fx:'aim',        trailFx:'waypoints',body:'#d2f6ff',fold:'#7fc9e0',glow:'rgba(60,190,230,.95)', trail:'rgba(60,190,230,'},  // Прицел — электрик, тон 195°
  /* 05.09.2026 «добавляй все скины в игру, и они будут временно бесплатные»: 30 доп.
     скинов, отобраны владельцем через макеты этой сессии — render.js:PREM_FX_MAP (общий
     рендерер, не 30 копий кода, тот файл грузится раньше). tempFree:true — маркер для
     памяти/поиска, на логику не влияет: price:0 и отсутствие premium уже делают их
     обычной ✦-покупкой за 0 (как id:11 Сияние-иконка), без Stars-потока. Владелец гоняет
     каждый на слабом устройстве, время отрисовки — в BEACON('skin_perf', см. render.js:
     premSkinPerfReport) при каждой посадке. После анализа — перевести на premium:true +
     реальную цену в ⭐, tempFree убрать. */
  // 17 материалов — весь корпус перекрашен целиком, не пятно на нейтральном листе
  {id:15, name:15, price:0, tempFree:true, fx:'matGold',      body:'#fff3d6',fold:'#e0b46a',glow:'rgba(230,180,70,.95)', trail:'rgba(230,180,70,'},  // Золото
  {id:16, name:16, price:0, tempFree:true, fx:'matSilver',    body:'#f4f6fa',fold:'#c2cad8',glow:'rgba(190,202,220,.95)',trail:'rgba(190,202,220,'}, // Серебро
  {id:17, name:17, price:0, tempFree:true, fx:'matBronze',    body:'#f2ddc6',fold:'#b97a48',glow:'rgba(200,128,66,.95)', trail:'rgba(200,128,66,'},  // Бронза
  {id:18, name:18, price:0, tempFree:true, fx:'matIce',       body:'#dff2fb',fold:'#b6dced',glow:'rgba(140,200,235,.95)',trail:'rgba(90,180,225,'},  // Лёд/Хрусталь
  {id:19, name:19, price:0, tempFree:true, fx:'matEmerald',   body:'#0e5030',fold:'#0a3a22',glow:'rgba(30,150,90,.95)',  trail:'rgba(60,210,130,'},  // Изумруд
  {id:20, name:20, price:0, tempFree:true, fx:'matObsidian',  body:'#2a2438',fold:'#1c1828',glow:'rgba(130,110,180,.85)',trail:'rgba(220,225,240,'}, // Обсидиан
  {id:21, name:21, price:0, tempFree:true, fx:'matMarble',    body:'#efe7db',fold:'#d9cfba',glow:'rgba(220,210,195,.9)', trail:'rgba(190,178,160,'}, // Мрамор (прямые лучи, v2 — см. feedback_macet_geometry_pitfalls)
  {id:22, name:22, price:0, tempFree:true, fx:'matNebula',    body:'#160e2e',fold:'#100a20',glow:'rgba(130,90,200,.9)',  trail:'rgba(140,110,220,'}, // Туманность/галактика
  {id:23, name:23, price:0, tempFree:true, fx:'matOpal',      body:'#f3efe8',fold:'#d8cdbe',glow:'rgba(230,220,205,.9)', trail:'rgba(220,180,200,'}, // Опал
  {id:24, name:24, price:0, tempFree:true, fx:'matVerdigris', body:'#c97a4a',fold:'#a05f36',glow:'rgba(150,110,70,.9)',  trail:'rgba(80,160,130,'},  // Окисленная медь
  {id:25, name:25, price:0, tempFree:true, fx:'matCarbon',    body:'#181a1f',fold:'#101216',glow:'rgba(90,95,105,.85)', trail:'rgba(150,155,165,'}, // Карбон
  {id:26, name:26, price:0, tempFree:true, fx:'matLava',      body:'#241f1c',fold:'#161310',glow:'rgba(200,90,40,.9)',  trail:'rgba(255,120,40,'},  // Лава
  {id:27, name:27, price:0, tempFree:true, fx:'matRust',      body:'#8a5a3a',fold:'#6a4128',glow:'rgba(150,90,40,.9)',  trail:'rgba(150,70,30,'},   // Ржавое железо
  {id:28, name:28, price:0, tempFree:true, fx:'matHoney',     body:'#7a4f18',fold:'#5c3b10',glow:'rgba(214,150,50,.9)', trail:'rgba(214,150,50,'},  // Соты/янтарь
  {id:29, name:29, price:0, tempFree:true, fx:'matPlasma',    body:'#160b2e',fold:'#100821',glow:'rgba(150,90,220,.9)', trail:'rgba(130,90,220,'},  // Плазма (материал, не путать с id6 fx:'plasma')
  {id:30, name:30, price:0, tempFree:true, fx:'matQuartz',    body:'#e9dbe0',fold:'#cbb0bc',glow:'rgba(200,150,175,.9)',trail:'rgba(200,150,175,'}, // Кварц
  {id:31, name:31, price:0, tempFree:true, fx:'matWood',      body:'#a5713a',fold:'#7c4f22',glow:'rgba(180,130,70,.9)', trail:'rgba(180,130,70,'},  // Дерево
  // 9 символов-сигилов — нейтральный борт + один гравированный знак строго по центру
  {id:32, name:32, price:0, tempFree:true, fx:'sigPenta',     body:'#efe0ff',fold:'#c9a8ec',glow:'rgba(190,110,255,.95)',trail:'rgba(190,110,255,'}, // Пентаграмма
  {id:33, name:33, price:0, tempFree:true, fx:'sigHexa',      body:'#ffe4d6',fold:'#eb9f7a',glow:'rgba(255,110,60,.95)', trail:'rgba(255,110,60,'},  // Гексаграмма
  {id:34, name:34, price:0, tempFree:true, fx:'sigMandala',   body:'#d6fff2',fold:'#7fdfc0',glow:'rgba(60,220,180,.95)', trail:'rgba(60,220,180,'},  // Мандала-розетка
  {id:35, name:35, price:0, tempFree:true, fx:'sigTriquetra', body:'#eaffd0',fold:'#b8e07a',glow:'rgba(170,220,60,.95)', trail:'rgba(170,220,60,'},  // Трикветра
  {id:36, name:36, price:0, tempFree:true, fx:'sigCompass',   body:'#e2e0ff',fold:'#a8a0e8',glow:'rgba(120,100,255,.95)',trail:'rgba(120,100,255,'}, // Роза ветров
  {id:37, name:37, price:0, tempFree:true, fx:'sigYinyang',   body:'#f0f0f0',fold:'#b8b8b8',glow:'rgba(180,180,180,.95)',trail:'rgba(180,180,180,'}, // Инь-Янь
  {id:38, name:38, price:0, tempFree:true, fx:'sigFlower',    body:'#dcffdf',fold:'#8fdd9a',glow:'rgba(80,220,110,.95)', trail:'rgba(80,220,110,'},  // Цветок жизни
  {id:39, name:39, price:0, tempFree:true, fx:'sigMaltese',   body:'#ffe0e6',fold:'#eb8ea0',glow:'rgba(240,70,100,.95)', trail:'rgba(240,70,100,'},  // Мальтийский крест
  {id:40, name:40, price:0, tempFree:true, fx:'sigSnowflake', body:'#dcf4ff',fold:'#8fcbe8',glow:'rgba(70,190,235,.95)', trail:'rgba(70,190,235,'},  // Кристалл-снежинка
  // 4 приёма иллюзии формы — нейтральный борт + узор внутренними линиями
  {id:41, name:41, price:0, tempFree:true, fx:'illLeather',   body:'#ffe9cc',fold:'#e0ad6a',glow:'rgba(220,150,60,.95)', trail:'rgba(220,150,60,'},  // Кожаная стёжка
  {id:42, name:42, price:0, tempFree:true, fx:'illTopo',      body:'#d8ffe0',fold:'#8fdb9e',glow:'rgba(70,210,120,.95)', trail:'rgba(70,210,120,'},  // Топографические линии
  {id:43, name:43, price:0, tempFree:true, fx:'illOrigami',   body:'#ffe0f0',fold:'#e08eb8',glow:'rgba(230,90,170,.95)', trail:'rgba(230,90,170,'},  // Оригами-заломы
  {id:44, name:44, price:0, tempFree:true, fx:'illLattice',   body:'#dcf0ff',fold:'#8fc0e0',glow:'rgba(70,170,220,.95)', trail:'rgba(70,170,220,'}   // Плетёная решётка
];
/* 05.09.2026 «След — 5-я вкладка» (владелец, после разбора): раньше след жил ВНУТРИ
   skin.trailFx (id 9-14 выше) и переключался только вместе со скином. Теперь это отдельный,
   независимый выбор — те же 6 языков следа, но выбираются отдельно от цвета и надеваются
   на любой скин. Явное решение владельца: старая пара скин→след НЕ переносится — все игроки
   стартуют с id:0 «Нет», сами выбирают заново. price:0 у всех шести — это не новый платный
   контент, просто те же 6 языков следа, что уже были в игре, ставшие независимыми. */
const TRAILS=[
  {id:0, name:'Нет',              price:0, style:''},
  {id:1, name:'Обломки-спутники', price:0, style:'debris'},
  {id:2, name:'Нить-жемчуг',      price:0, style:'pearls'},
  {id:3, name:'Искры',            price:0, style:'sparks'},
  {id:4, name:'Кометная пыль',    price:0, style:'cometdust'},
  {id:5, name:'Лента',            price:0, style:'ribbon'},
  {id:6, name:'Метки пути',       price:0, style:'waypoints'},
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
  {id:573, name:'Ругань', price:60, ch:'🤬', cat:'faces'},
  {id:574, name:'Бесёнок', price:60, ch:'👿', cat:'faces'},
  {id:575, name:'Череп', price:60, ch:'💀', cat:'faces'},
  {id:576, name:'Пиратский череп', price:60, ch:'☠️', cat:'faces'},
  {id:577, name:'Какашка', price:60, ch:'💩', cat:'faces'},
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
   применяем и к ICONS/FLASHES — они сейчас совпадают позиция=id случайно (строились по
   порядку), но это ничем не гарантировано на будущее, тот же баг может вернуться после
   следующей вставки в середину. */
const DECALS_BY_ID = new Map(DECALS.map(d=>[d.id,d]));
/* 29.08.2026 «отдели их от обычных эмодзи в другую категорию» (владелец): SVG-иконки были
   пять записей внутри DECALS (cat:'icons') — теперь свой массив, свой независимый слот
   ношения (S.icon/ownedIcons, отдельно от S.decal/ownedDecals), своя вкладка в Ангаре.
   Причина не только организационная: иконка теперь садится на ПРАВУЮ (тёмную, sh.fold)
   половину корпуса, декаль-эмодзи — на левую (см. render.js) — это буквально разные
   места на борту, две независимые вещи, а не варианты одного слота. Свои id с нуля,
   как у SKINS/DECALS — отдельная коллекция, не общий счётчик. Источник контуров —
   Google Material Symbols (Apache 2.0), filled-стиль 24px, взято побайтово с
   github.com/google/material-design-icons (тот же источник, что раньше у иконки
   отпечатка пальца) — не нарисовано на глаз (правило «официальные иконки — не по
   памяти», см. STYLE-GUIDE). vb — viewBox иконки [minX,minY,width,height]. */
const ICONS=[
  {id:0, name:'Нет', price:0, cat:'none'},
  {id:1, name:'Ракета (вектор)', price:180, vb:[0,-960,960,960], cat:'iBasic', // 04.09.2026: была бесплатна — владелец поменял местами с Сетевым узлом (id28), см. ANGAR_FREEBIE (ui.js)
    svg:'m98-537 168-168q14-14 33-20t39-2l52 11q-54 64-85 116t-60 126L98-537Zm205 91q23-72 62.5-136T461-702q88-88 201-131.5T873-860q17 98-26 211T716-448q-55 55-120 95.5T459-289L303-446Zm276-120q23 23 56.5 23t56.5-23q23-23 23-56.5T692-679q-23-23-56.5-23T579-679q-23 23-23 56.5t23 56.5ZM551-85l-64-147q74-29 126.5-60T730-377l10 52q4 20-2 39.5T718-252L551-85ZM162-318q35-35 85-35.5t85 34.5q35 35 35 85t-35 85q-25 25-83.5 43T87-74q14-103 32-161t43-83Z'},
  {id:2, name:'Медаль (вектор)', price:100, vb:[0,-960,960,960], cat:'iBasic', // 04.09.2026: была бесплатна — владелец поменял местами с Сиянием (id11), см. ANGAR_FREEBIE (ui.js)
    svg:'M280-880h400v314q0 23-10 41t-28 29l-142 84 28 92h152l-124 88 48 152-124-94-124 94 48-152-124-88h152l28-92-142-84q-18-11-28-29t-10-41v-314Zm160 80v282l40 24 40-24v-282h-80Z'},
  {id:3, name:'Молния (вектор)', price:60, vb:[0,-960,960,960], cat:'iBasic',
    svg:'m320-80 40-280H160l360-520h80l-40 320h240L400-80h-80Z'},
  {id:4, name:'Бриллиант (вектор)', price:60, vb:[0,-960,960,960], cat:'iBasic',
    svg:'m368-630 106-210h12l106 210H368Zm82 474L105-570h345v414Zm60 0v-414h345L510-156Zm148-474L554-840h206l105 210H658Zm-563 0 105-210h206L302-630H95Z'},
  {id:5, name:'Щит (вектор)', price:60, vb:[0,-960,960,960], cat:'iBasic',
    svg:'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:6, name:'Спутник (Iconки)', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'M560-32v-80q117 0 198.5-81.5T840-392h80q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T560-32Zm0-160v-80q50 0 85-35t35-85h80q0 83-58.5 141.5T560-192ZM222-57q-15 0-30-6t-27-17L23-222q-11-12-17-27t-6-30q0-16 6-30.5T23-335l127-127q23-23 57-23.5t57 22.5l50 50 28-28-50-50q-23-23-23-56t23-56l57-57q23-23 56.5-23t56.5 23l50 50 28-28-50-50q-23-23-23-56.5t23-56.5l127-127q12-12 27-18t30-6q15 0 29.5 6t26.5 18l142 142q12 11 17.5 25.5T895-730q0 15-5.5 30T872-673L745-546q-23 23-56.5 23T632-546l-50-50-28 28 50 50q23 23 22.5 56.5T603-405l-56 56q-23 23-56.5 23T434-349l-50-50-28 28 50 50q23 23 22.5 57T405-207L278-80q-11 11-25.5 17T222-57Zm0-79 42-42-142-142-42 42 142 142Zm85-85 42-42-142-142-42 42 142 142Zm382-382 42-42-142-142-42 42 142 142Zm85-85 42-42-142-142-42 42 142 142Z'},
  {id:7, name:'Планета', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q20-22 36-47.5t26.5-53q10.5-27.5 16-56.5t5.5-59q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z'},
  {id:8, name:'Ночное небо', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'M240-400q48 0 88 26t59 71l10 23h25q42 0 70 29.5t28 70.5q0 42-29 71t-71 29H240q-66 0-113-47T80-240q0-67 47-113.5T240-400Zm210-440q-18 99 11 193.5T561-481q71 71 165.5 100T920-370q-26 142-135 234.5T533-40q32-26 49.5-62.5T600-180q0-68-42.5-117.5T449-357q-32-57-87.5-90T240-480q-32 0-62.5 8T120-448q2-145 94.5-255T450-840Z'},
  {id:9, name:'Звёзды', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'m320-240 160-122 160 122-60-198 160-114H544l-64-208-64 208H220l160 114-60 198ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:10, name:'Вспышка', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'M40-440v-80h240v80H40Zm270-154-84-84 56-56 84 84-56 56Zm130-86v-240h80v240h-80Zm210 86-56-56 84-84 56 56-84 84Zm30 154v-80h240v80H680Zm-200 80q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Zm198 134-84-84 56-56 84 84-56 56Zm-396 0-56-56 84-84 56 56-84 84ZM440-40v-240h80v240h-80Z'},
  {id:11, name:'Сияние', price:0, vb:[0,0,24,24], cat:'iSpace', // 04.09.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
    svg:'m19 9-1.25-2.75L15 5l2.75-1.25L19 1l1.25 2.75L23 5l-2.75 1.25Zm0 14-1.25-2.75L15 19l2.75-1.25L19 15l1.25 2.75L23 19l-2.75 1.25ZM9 20l-2.5-5.5L1 12l5.5-2.5L9 4l2.5 5.5L17 12l-5.5 2.5Z'},
  {id:12, name:'Сумерки', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'m734-556-56-58 86-84 56 56-86 86ZM80-160v-80h800v80H80Zm360-520v-120h80v120h-80ZM226-558l-84-86 56-56 86 86-58 56Zm-26 238q0-117 81.5-198.5T480-600q117 0 198.5 81.5T760-320H200Z'},
  {id:13, name:'Циклон (вектор)', price:100, vb:[0,-960,960,960], cat:'iSpace',
    svg:'M480-320q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T560-480q0-33-23.5-56.5T480-560q-33 0-56.5 23.5T400-480q0 33 23.5 56.5T480-400ZM661-80q18-56 27-100t14-70q-43 42-100 66t-122 24q-136 0-238.5-18.5T80-214v-85q56 18 100 27t70 14q-42-43-66-100t-24-122q0-137 18.5-239T214-880h85q-18 56-27.5 100T258-710q43-42 100-66t122-24q137 0 239 18.5T880-746v85q-56-18-100-27.5T710-702q42 43 66 100t24 122q0 137-18.5 239T746-80h-85ZM480-240q100 0 170-70t70-170q0-100-70-170t-170-70q-100 0-170 70t-70 170q0 100 70 170t170 70Z'},
  {id:14, name:'Премиум-медаль', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m387-412 35-114-92-74h114l36-112 36 112h114l-93 74 35 114-92-71-93 71ZM240-40v-309q-38-42-59-96t-21-115q0-134 93-227t227-93q134 0 227 93t93 227q0 61-21 115t-59 96v309l-240-80-240 80Zm240-280q100 0 170-70t70-170q0-100-70-170t-170-70q-100 0-170 70t-70 170q0 100 70 170t170 70Z'},
  {id:15, name:'Проверено', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m344-60-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm94-278 226-226-56-58-170 170-86-84-56 56 142 142Z'},
  {id:16, name:'Оценка-звезда', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z'},
  {id:17, name:'Кубок-событие', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M280-120v-80h160v-124q-49-11-87.5-41.5T296-442q-75-9-125.5-65.5T120-640v-40q0-33 23.5-56.5T200-760h80v-80h400v80h80q33 0 56.5 23.5T840-680v40q0 76-50.5 132.5T664-442q-18 46-56.5 76.5T520-324v124h160v80H280Zm0-408v-152h-80v40q0 38 22 68.5t58 43.5Zm400 0q36-13 58-43.5t22-68.5v-40h-80v152Z'},
  {id:18, name:'Гроза (вектор)', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'m462 0 94-107-80-40 116-133h106l-94 107 80 40L568 0H462ZM222 0l94-107-80-40 116-133h106l-94 107 80 40L328 0H222Zm78-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Z'},
  {id:19, name:'Торнадо', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M40-840h880L804-640H156L40-840Zm162 280h556l-70 120H272l-70-120Zm116 200h324L480-80 318-360Z'},
  {id:20, name:'Капля', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M491-200q12-1 20.5-9.5T520-230q0-14-9-22.5t-23-7.5q-41 3-87-22.5T343-375q-2-11-10.5-18t-19.5-7q-14 0-23 10.5t-6 24.5q17 91 80 130t127 35ZM480-80q-137 0-228.5-94T160-408q0-100 79.5-217.5T480-880q161 137 240.5 254.5T800-408q0 140-91.5 234T480-80Z'},
  {id:21, name:'Снежинка (вектор)', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M440-80v-166L310-118l-56-56 186-186v-80h-80L174-254l-56-56 128-130H80v-80h166L118-650l56-56 186 186h80v-80L254-786l56-56 130 128v-166h80v166l130-128 56 56-186 186v80h80l186-186 56 56-128 130h166v80H714l128 130-56 56-186-186h-80v80l186 186-56 56-130-128v166h-80Z'},
  {id:22, name:'Огонь (вектор)', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M160-400q0-105 50-187t110-138q60-56 110-85.5l50-29.5v132q0 37 25 58.5t56 21.5q17 0 32.5-7t28.5-23l18-22q72 42 116 116.5T800-400q0 88-43 160.5T644-125q17-24 26.5-52.5T680-238q0-40-15-75.5T622-377L480-516 339-377q-29 29-44 64t-15 75q0 32 9.5 60.5T316-125q-70-42-113-114.5T160-400Zm320-4 85 83q17 17 26 38t9 45q0 49-35 83.5T480-120q-50 0-85-34.5T360-238q0-23 9-44.5t26-38.5l85-83Z'},
  {id:23, name:'Вулкан (вектор)', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'m80-80 160-360h120l80-200h280L880-80H80Zm440-680v-160h80v160h-80Zm181 75-56-56 113-113 57 56-114 113Zm-282 0L306-798l56-57 113 114-56 56Z'},
  {id:24, name:'Волны (вектор)', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M80-146v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19T280-280q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-174.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-164 544.5-155t-64.5 9q-39 0-64.5-9t-46-19.5Q349-185 329-193.5t-49-8.5q-28 0-48.5 8.5t-41.5 19Q169-164 143.5-155T80-146Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19T280-458q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-352.5q-21-10.5-41-19t-49-8.5q-29 0-49.5 8.5t-41 19Q569-342 544-333t-64 9q-39 0-64.5-9t-46-19.5Q349-363 329-371.5t-49-8.5q-28 0-48.5 8.5t-41.5 19Q169-342 143.5-333T80-324Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19T280-636q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-530.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-520 544.5-511t-64.5 9q-39 0-64.5-9t-46-19.5Q349-541 329-549.5t-49-8.5q-28 0-48.5 8.5t-41.5 19Q169-520 143.5-511T80-502Zm0-178v-78q29 0 49.5-9t41.5-19.5q21-10.5 46.5-19T280-814q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q38 0 63 8.5t46 19q21 10.5 42 19.5t49 9v78q-38 0-63.5-9T770-708.5q-21-10.5-41-19t-49-8.5q-28 0-48.5 8.5t-41 19Q570-698 544.5-689t-64.5 9q-39 0-64.5-9t-46-19.5Q349-719 329-727.5t-49-8.5q-28 0-48.5 8.5t-41.5 19Q169-698 143.5-689T80-680Z'},
  {id:25, name:'Безопасность', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q97-30 162-118.5T718-480H480v-315l-240 90v207q0 7 2 18h238v316Z'},
  {id:26, name:'Проверенный', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'m438-338 226-226-57-57-169 169-84-84-57 57 141 141Zm42 258q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:27, name:'Забота о здоровье', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M420-340h120v-100h100v-120H540v-100H420v100H320v120h100v100Zm60 260q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:28, name:'Сетевой узел', price:0, vb:[0,-960,960,960], cat:'iTech', // 04.09.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
    svg:'M240-40q-50 0-85-35t-35-85q0-50 35-85t85-35q14 0 26 3t23 8l57-71q-28-31-39-70t-5-78l-81-27q-17 25-43 40t-58 15q-50 0-85-35T0-580q0-50 35-85t85-35q50 0 85 35t35 85v8l81 28q20-36 53.5-61t75.5-32v-87q-39-11-64.5-42.5T360-840q0-50 35-85t85-35q50 0 85 35t35 85q0 42-26 73.5T510-724v87q42 7 75.5 32t53.5 61l81-28v-8q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-32 0-58.5-15T739-515l-81 27q6 39-5 77.5T614-340l57 70q11-5 23-7.5t26-2.5q50 0 85 35t35 85q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-20 6.5-38.5T624-232l-57-71q-41 23-87.5 23T392-303l-56 71q11 15 17.5 33.5T360-160q0 50-35 85t-85 35Z'},
  {id:29, name:'Память/чип', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M360-360v-240h240v240H360Zm0 240v-80h-80q-33 0-56.5-23.5T200-280v-80h-80v-80h80v-80h-80v-80h80v-80q0-33 23.5-56.5T280-760h80v-80h80v80h80v-80h80v80h80q33 0 56.5 23.5T760-680v80h80v80h-80v80h80v80h-80v80q0 33-23.5 56.5T680-200h-80v80h-80v-80h-80v80h-80Zm320-160v-400H280v400h400Z'},
  {id:30, name:'Волшебная коррекция', price:300, vb:[0,0,24,24], cat:'iSpecial',
    svg:'m20 7-.95-2.05L17 4l2.05-.95L20 1l.95 2.05L23 4l-2.05.95ZM8.5 7l-.95-2.05L5.5 4l2.05-.95L8.5 1l.95 2.05L11.5 4l-2.05.95ZM20 18.5l-.95-2.05L17 15.5l2.05-.95.95-2.05.95 2.05 2.05.95-2.05.95ZM5.1 21.7l-2.8-2.8q-.3-.3-.3-.725t.3-.725L13.45 6.3q.3-.3.725-.3t.725.3l2.8 2.8q.3.3.3.725t-.3.725L6.55 21.7q-.3.3-.725.3t-.725-.3Zm9.075-10.475 1.4-1.4-1.4-1.4-1.4 1.4Z'},
  {id:31, name:'Идея', price:300, vb:[0,0,24,24], cat:'iSpecial',
    svg:'m22 10-.625-1.375L20 8l1.375-.625L22 6l.625 1.375L24 8l-1.375.625Zm-3-4-.95-2.05L16 3l2.05-.95L19 0l.95 2.05L22 3l-2.05.95ZM9 22q-.825 0-1.412-.587Q7 20.825 7 20h4q0 .825-.587 1.413Q9.825 22 9 22Zm-4-3v-2h8v2Zm.25-3q-1.725-1.025-2.737-2.75Q1.5 11.525 1.5 9.5q0-3.125 2.188-5.312Q5.875 2 9 2q3.125 0 5.312 2.188Q16.5 6.375 16.5 9.5q0 2.025-1.012 3.75-1.013 1.725-2.738 2.75Zm.6-2h6.3q1.125-.8 1.737-1.975.613-1.175.613-2.525 0-2.3-1.6-3.9T9 4Q6.7 4 5.1 5.6T3.5 9.5q0 1.35.613 2.525Q4.725 13.2 5.85 14Zm0 0q-1.125-.8-1.737-1.975Q3.5 10.85 3.5 9.5q0-2.3 1.6-3.9T9 4q2.3 0 3.9 1.6t1.6 3.9q0 1.35-.613 2.525Q13.275 13.2 12.15 14Z'},
  {id:32, name:'Спа-лист', price:300, vb:[0,-960,960,960], cat:'iSpecial',
    svg:'M480-80q-94-12-168-48t-125.5-94Q135-280 108-356.5T81-526q110 11 186 40t123.5 82Q438-351 459-271.5T480-80Zm0-337q-23-35-62.5-69T326-548q6-42 20-87t34-88.5q20-43.5 45.5-83.5t54.5-73q29 33 54.5 73t45.5 83.5q20 43.5 34 88.5t20 87q-52 27-91.5 61T480-417Zm80 321q-2-70-10.5-129.5T523-338q47-81 129.5-132T879-526q1 158-84.5 272.5T560-96Z'},
  {id:33, name:'Эко-лист', price:300, vb:[0,-960,960,960], cat:'iSpecial',
    svg:'M450-80q-33 0-66.5-7.5T315-109q12-121 70-226t149-185q-110 56-190.5 148T231-162q-4-3-7.5-6.5L216-176q-47-47-71.5-105T120-402q0-68 27-130t75-110q81-81 210-105.5t362-4.5q18 239-6 364.5T684-182q-49 49-109.5 75.5T450-80Z'},
  {id:34, name:'Размытие', price:300, vb:[0,-960,960,960], cat:'iSpecial',
    svg:'M120-380q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-160q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm120 340q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280q17 0 28.5 11.5T280-240q0 17-11.5 28.5T240-200Zm0-160q-17 0-28.5-11.5T200-400q0-17 11.5-28.5T240-440q17 0 28.5 11.5T280-400q0 17-11.5 28.5T240-360Zm0-160q-17 0-28.5-11.5T200-560q0-17 11.5-28.5T240-600q17 0 28.5 11.5T280-560q0 17-11.5 28.5T240-520Zm0-160q-17 0-28.5-11.5T200-720q0-17 11.5-28.5T240-760q17 0 28.5 11.5T280-720q0 17-11.5 28.5T240-680Zm160 340q-25 0-42.5-17.5T340-400q0-25 17.5-42.5T400-460q25 0 42.5 17.5T460-400q0 25-17.5 42.5T400-340Zm0-160q-25 0-42.5-17.5T340-560q0-25 17.5-42.5T400-620q25 0 42.5 17.5T460-560q0 25-17.5 42.5T400-500Zm0 300q-17 0-28.5-11.5T360-240q0-17 11.5-28.5T400-280q17 0 28.5 11.5T440-240q0 17-11.5 28.5T400-200Zm0-480q-17 0-28.5-11.5T360-720q0-17 11.5-28.5T400-760q17 0 28.5 11.5T440-720q0 17-11.5 28.5T400-680Zm0 580q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-720q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 480q-25 0-42.5-17.5T500-400q0-25 17.5-42.5T560-460q25 0 42.5 17.5T620-400q0 25-17.5 42.5T560-340Zm0-160q-25 0-42.5-17.5T500-560q0-25 17.5-42.5T560-620q25 0 42.5 17.5T620-560q0 25-17.5 42.5T560-500Zm0 300q-17 0-28.5-11.5T520-240q0-17 11.5-28.5T560-280q17 0 28.5 11.5T600-240q0 17-11.5 28.5T560-200Zm0-480q-17 0-28.5-11.5T520-720q0-17 11.5-28.5T560-760q17 0 28.5 11.5T600-720q0 17-11.5 28.5T560-680Zm0 580q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-720q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm160 620q-17 0-28.5-11.5T680-240q0-17 11.5-28.5T720-280q17 0 28.5 11.5T760-240q0 17-11.5 28.5T720-200Zm0-160q-17 0-28.5-11.5T680-400q0-17 11.5-28.5T720-440q17 0 28.5 11.5T760-400q0 17-11.5 28.5T720-360Zm0-160q-17 0-28.5-11.5T680-560q0-17 11.5-28.5T720-600q17 0 28.5 11.5T760-560q0 17-11.5 28.5T720-520Zm0-160q-17 0-28.5-11.5T680-720q0-17 11.5-28.5T720-760q17 0 28.5 11.5T760-720q0 17-11.5 28.5T720-680Zm120 300q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Zm0-160q-8 0-14-6t-6-14q0-8 6-14t14-6q8 0 14 6t6 14q0 8-6 14t-14 6Z'},
  {id:35, name:'Палитра', price:300, vb:[0,-960,960,960], cat:'iSpecial',
    svg:'M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80ZM260-440q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Z'},
  {id:36, name:'Робот', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M160-360q-50 0-85-35t-35-85q0-50 35-85t85-35v-80q0-33 23.5-56.5T240-760h120q0-50 35-85t85-35q50 0 85 35t35 85h120q33 0 56.5 23.5T800-680v80q50 0 85 35t35 85q0 50-35 85t-85 35v160q0 33-23.5 56.5T720-120H240q-33 0-56.5-23.5T160-200v-160Zm200-80q25 0 42.5-17.5T420-500q0-25-17.5-42.5T360-560q-25 0-42.5 17.5T300-500q0 25 17.5 42.5T360-440Zm240 0q25 0 42.5-17.5T660-500q0-25-17.5-42.5T600-560q-25 0-42.5 17.5T540-500q0 25 17.5 42.5T600-440ZM320-280h320v-80H320v80Z'},
  {id:37, name:'Инженерия', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M42-120v-112q0-33 17-62t47-44q51-26 115-44t141-18q77 0 141 18t115 44q30 15 47 44t17 62v112H42Zm320-320q-66 0-113-47t-47-113h-10q-9 0-14.5-5.5T172-620q0-9 5.5-14.5T192-640h10q0-45 22-81t58-57v38q0 9 5.5 14.5T302-720q9 0 14.5-5.5T322-740v-54q9-3 19-4.5t21-1.5q11 0 21 1.5t19 4.5v54q0 9 5.5 14.5T422-720q9 0 14.5-5.5T442-740v-38q36 21 58 57t22 81h10q9 0 14.5 5.5T552-620q0 9-5.5 14.5T532-600h-10q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T442-600H282q0 33 23.5 56.5T362-520Zm300 160-6-30q-6-2-11.5-4.5T634-402l-28 10-20-36 22-20v-24l-22-20 20-36 28 10q4-4 10-7t12-5l6-30h40l6 30q6 2 12 5t10 7l28-10 20 36-22 20v24l22 20-20 36-28-10q-5 5-10.5 7.5T708-390l-6 30h-40Zm20-70q12 0 21-9t9-21q0-12-9-21t-21-9q-12 0-21 9t-9 21q0 12 9 21t21 9Zm72-130-8-42q-9-3-16.5-7.5T716-620l-42 14-28-48 34-30q-2-5-2-8v-16q0-3 2-8l-34-30 28-48 42 14q6-6 13.5-10.5T746-798l8-42h56l8 42q9 3 16.5 7.5T848-780l42-14 28 48-34 30q2 5 2 8v16q0 3-2 8l34 30-28 48-42-14q-6 6-13.5 10.5T818-602l-8 42h-56Zm28-90q21 0 35.5-14.5T832-700q0-21-14.5-35.5T782-750q-21 0-35.5 14.5T732-700q0 21 14.5 35.5T782-650Z'},
  {id:38, name:'Биотех', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M200-120v-80h200v-80q-83 0-141.5-58.5T200-480q0-57 29-105t80-73q-4 22 1.5 43t17.5 40q-23 16-35.5 41T280-480q0 50 35 85t85 35h320v80H520v80h240v80H200Zm360-356-12-38-38 14-20-53q20-16 31-38.5t11-48.5q0-47-33-79.5T418-752l-18-50 38-14-14-36 76-28 12 38 38-14 110 300-38 14 14 38-76 28Zm-140-92q-30 0-51-21t-21-51q0-30 21-51t51-21q30 0 51 21t21 51q0 30-21 51t-51 21Z'},
  {id:39, name:'Наука (вектор)', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M200-120q-51 0-72.5-45.5T138-250l222-270v-240h-40q-17 0-28.5-11.5T280-800q0-17 11.5-28.5T320-840h320q17 0 28.5 11.5T680-800q0 17-11.5 28.5T640-760h-40v240l222 270q32 39 10.5 84.5T760-120H200Z'},
  {id:40, name:'Психология', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M440-360h80l6-50q8-3 14.5-7t11.5-9l46 20 40-68-40-30q2-8 2-16t-2-16l40-30-40-68-46 20q-5-5-11.5-9t-14.5-7l-6-50h-80l-6 50q-8 3-14.5 7t-11.5 9l-46-20-40 68 40 30q-2 8-2 16t2 16l-40 30 40 68 46-20q5 5 11.5 9t14.5 7l6 50Zm40-100q-25 0-42.5-17.5T420-520q0-25 17.5-42.5T480-580q25 0 42.5 17.5T540-520q0 25-17.5 42.5T480-460ZM240-80v-172q-57-52-88.5-121.5T120-520q0-150 105-255t255-105q125 0 221.5 73.5T827-615l52 205q5 19-7 34.5T840-360h-80v120q0 33-23.5 56.5T680-160h-80v80H240Z'},
  {id:41, name:'Датчики', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M197-197q-54-55-85.5-127.5T80-480q0-84 31.5-156.5T197-763l57 57q-44 44-69 102t-25 124q0 67 25 125t69 101l-57 57Zm113-113q-32-33-51-76.5T240-480q0-51 19-94.5t51-75.5l57 57q-22 22-34.5 51T320-480q0 33 12.5 62t34.5 51l-57 57Zm170-90q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm170 90-57-57q22-22 34.5-51t12.5-62q0-33-12.5-62T593-593l57-57q32 32 51 75.5t19 94.5q0 50-19 93.5T650-310Zm113 113-57-57q44-44 69-102t25-124q0-67-25-125t-69-101l57-57q54 54 85.5 126.5T880-480q0 83-31.5 155.5T763-197Z'},
  {id:42, name:'Сетевой узел (устройства)', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M120-120v-200h160l160-160v-128q-36-13-58-43.5T360-720q0-50 35-85t85-35q50 0 85 35t35 85q0 38-22 68.5T520-608v128l160 160h160v200H640v-122L480-402 320-242v122H120Z'},
  {id:43, name:'Зарядка', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M660-80v-120H560l140-200v120h100L660-80Zm-340 0q-17 0-28.5-11.5T280-120v-640q0-17 11.5-28.5T320-800h80v-80h160v80h80q17 0 28.5 11.5T680-760v280q-100 1-170 70.5T440-240q0 46 16 87t45 73H320Z'},
  {id:44, name:'Разряд', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M400-80v-320H280v-480h400l-80 280h160L400-80Z'},
  {id:45, name:'Точное производство', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M159-120v-120h124L181-574q-27-15-44.5-44T119-680q0-50 35-85t85-35q39 0 69.5 22.5T351-720h128v-40q0-17 11.5-28.5T519-800q9 0 17.5 4t14.5 12l68-64q9-9 21.5-11.5T665-856l156 72q12 6 16.5 17.5T837-744q-6 12-17.5 15.5T797-730l-144-66-94 88v56l94 86 144-66q11-5 23-1t17 15q6 12 1 23t-17 17l-156 74q-12 6-24.5 3.5T619-512l-68-64q-6 6-14.5 11t-17.5 5q-17 0-28.5-11.5T479-600v-40H351q-3 8-6.5 15t-9.5 15l200 370h144v120H159Zm80-520q17 0 28.5-11.5T279-680q0-17-11.5-28.5T239-720q-17 0-28.5 11.5T199-680q0 17 11.5 28.5T239-640Z'},
  {id:46, name:'Радар', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q56 0 105.5-17.5T676-227l-57-57q-29 21-64.5 32.5T480-240q-100 0-170-70t-70-170q0-100 70-170t170-70q100 0 170 70t70 170q0 39-12 75t-33 65l57 57q32-41 50-91t18-106q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-160q22 0 42.5-5.5T561-342l-61-61q-5 2-10 2.5t-10 .5q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 6-.5 11.5T557-458l60 60q11-18 17-38.5t6-43.5q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 66 47 113t113 47Z'},
  {id:47, name:'Замок', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-200q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z'},
  {id:48, name:'Открытый замок', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm240 360q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280Z'},
  {id:49, name:'Ключ-VPN', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M280-240q-100 0-170-70T40-480q0-100 70-170t170-70q81 0 141.5 45.5T506-560h414v160h-80v160H680v-160H506q-24 69-84.5 114.5T280-240Zm0-160q33 0 56.5-23.5T360-480q0-33-23.5-56.5T280-560q-33 0-56.5 23.5T200-480q0 33 23.5 56.5T280-400Z'},
  {id:50, name:'Ключ', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M280-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 120q-100 0-170-70T40-480q0-100 70-170t170-70q81 0 141.5 46T506-560h335l79 79-140 160-100-79-80 80-80-80h-14q-25 72-87 116t-139 44Z'},
  {id:51, name:'Отпечаток', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M481-781q106 0 200 45.5T838-604q7 9 4.5 16t-8.5 12q-6 5-14 4.5t-14-8.5q-55-78-141.5-119.5T481-741q-97 0-182 41.5T158-580q-6 9-14 10t-14-4q-7-5-8.5-12.5T126-602q62-85 155.5-132T481-781Zm0 94q135 0 232 90t97 223q0 50-35.5 83.5T688-257q-51 0-87.5-33.5T564-374q0-33-24.5-55.5T481-452q-34 0-58.5 22.5T398-374q0 97 57.5 162T604-121q9 3 12 10t1 15q-2 7-8 12t-15 3q-104-26-170-103.5T358-374q0-50 36-84t87-34q51 0 87 34t36 84q0 33 25 55.5t59 22.5q34 0 58-22.5t24-55.5q0-116-85-195t-203-79q-118 0-203 79t-85 194q0 24 4.5 60t21.5 84q3 9-.5 16T208-205q-8 3-15.5-.5T182-217q-15-39-21.5-77.5T154-374q0-133 96.5-223T481-687Zm0-192q64 0 125 15.5T724-819q9 5 10.5 12t-1.5 14q-3 7-10 11t-17-1q-53-27-109.5-41.5T481-839q-58 0-114 13.5T260-783q-8 5-16 2.5T232-791q-4-8-2-14.5t10-11.5q56-30 117-46t124-16Zm0 289q93 0 160 62.5T708-374q0 9-5.5 14.5T688-354q-8 0-14-5.5t-6-14.5q0-75-55.5-125.5T481-550q-76 0-130.5 50.5T296-374q0 81 28 137.5T406-123q6 6 6 14t-6 14q-6 6-14 6t-14-6q-59-62-90.5-126.5T256-374q0-91 66-153.5T481-590Zm-1 196q9 0 14.5 6t5.5 14q0 75 54 123t126 48q6 0 17-1t23-3q9-2 15.5 2.5T744-191q2 8-3 14t-13 8q-18 5-31.5 5.5t-16.5.5q-89 0-154.5-60T460-374q0-8 5.5-14t14.5-6Z'},
  {id:52, name:'Шифрование', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M420-360h120l-23-129q20-10 31.5-29t11.5-42q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 23 11.5 42t31.5 29l-23 129Zm60 280q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:53, name:'Возможная угроза', price:180, vb:[0,-960,960,960], cat:'iSecrets',
    svg:'M480-320q17 0 28.5-11.5T520-360q0-17-11.5-28.5T480-400q-17 0-28.5 11.5T440-360q0 17 11.5 28.5T480-320Zm-40-160h80v-200h-80v200Zm40 400q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:54, name:'Конфетти', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'m80-80 200-560 360 360L80-80Zm502-378-42-42 224-224q32-32 77-32t77 32l24 24-42 42-24-24q-14-14-35-14t-35 14L582-458ZM422-618l-42-42 24-24q14-14 14-34t-14-34l-26-26 42-42 26 26q32 32 32 76t-32 76l-24 24Zm80 80-42-42 144-144q14-14 14-35t-14-35l-64-64 42-42 64 64q32 32 32 77t-32 77L502-538Zm160 160-42-42 64-64q32-32 77-32t77 32l64 64-42 42-64-64q-14-14-35-14t-35 14l-64 64Z'},
  {id:55, name:'Фестиваль', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M80-80q29-74 38.5-152.5T130-390q-39-15-64.5-50T40-520v-80q115-38 234.5-116T480-880q86 86 205.5 164T920-600v80q0 45-25.5 80T830-390q2 79 11.5 157.5T880-80H80Zm156-520h488q-78-44-140.5-90.5T480-772q-41 35-103.5 81.5T236-600Zm344 140q25 0 42.5-17.5T640-520H520q0 25 17.5 42.5T580-460Zm-200 0q25 0 42.5-17.5T440-520H320q0 25 17.5 42.5T380-460Zm-200 0q25 0 42.5-17.5T240-520H120q0 25 17.5 42.5T180-460Zm6 300h107q9-60 14-119t8-119q-9-5-18-10.5T280-422q-15 15-32.5 24.5T210-383q-2 57-7 112.5T186-160Zm188 0h212q-8-55-12.5-110T566-381q-26-2-47.5-12.5T480-421q-17 17-39.5 27.5T394-381q-3 56-7.5 111T374-160Zm293 0h107q-12-55-17-110.5T750-383q-20-5-38-14.5T680-422q-8 8-17 13.5T645-398q3 60 8.5 119T667-160Zm113-300q25 0 42.5-17.5T840-520H720q0 25 17.5 42.5T780-460Z'},
  {id:56, name:'Ночная жизнь', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M200-160v-80h80v-160L40-760h560L360-400v160h80v80H200Zm36-440h168l56-80H180l56 80Zm404 440q-50 0-85-35t-35-85q0-50 35-85t85-35q11 0 21 1.5t19 6.5v-368h200v120H760v360q0 50-35 85t-85 35Z'},
  {id:57, name:'Подарок-приз', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M160-280v80h640v-80H160Zm0-440h88q-5-9-6.5-19t-1.5-21q0-50 35-85t85-35q30 0 55.5 15.5T460-826l20 26 20-26q18-24 44-39t56-15q50 0 85 35t35 85q0 11-1.5 21t-6.5 19h88q33 0 56.5 23.5T880-640v440q0 33-23.5 56.5T800-120H160q-33 0-56.5-23.5T80-200v-440q0-33 23.5-56.5T160-720Zm0 320h640v-240H596l84 114-64 46-136-184-136 184-64-46 82-114H160v240Zm200-320q17 0 28.5-11.5T400-760q0-17-11.5-28.5T360-800q-17 0-28.5 11.5T320-760q0 17 11.5 28.5T360-720Zm240 0q17 0 28.5-11.5T640-760q0-17-11.5-28.5T600-800q-17 0-28.5 11.5T560-760q0 17 11.5 28.5T600-720Z'},
  {id:58, name:'Инвентарь', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm-40-600h640v-120H160v120Zm200 280h240v-80H360v80Z'},
  {id:59, name:'Жетон (вектор)', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M600-160q-134 0-227-93t-93-227q0-134 93-227t227-93q134 0 227 93t93 227q0 134-93 227t-227 93Zm-320-10q-106-28-173-114T40-480q0-110 67-196t173-114v84q-72 25-116 87t-44 139q0 77 44 139t116 87v84Z'},
  {id:60, name:'Оплачено', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M444-200h70v-50q50-9 86-39t36-89q0-42-24-77t-96-61q-60-20-83-35t-23-41q0-26 18.5-41t53.5-15q32 0 50 15.5t26 38.5l64-26q-11-35-40.5-61T516-710v-50h-70v50q-50 11-78 44t-28 74q0 47 27.5 76t86.5 50q63 23 87.5 41t24.5 47q0 33-23.5 48.5T486-314q-33 0-58.5-20.5T390-396l-66 26q14 48 43.5 77.5T444-252v52Zm36 120q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:61, name:'Сбережения', price:100, vb:[0,-960,960,960], cat:'iParty',
    svg:'M640-520q17 0 28.5-11.5T680-560q0-17-11.5-28.5T640-600q-17 0-28.5 11.5T600-560q0 17 11.5 28.5T640-520Zm-320-80h200v-80H320v80ZM180-120q-34-114-67-227.5T80-580q0-92 64-156t156-64h200q29-38 70.5-59t89.5-21q25 0 42.5 17.5T720-820q0 5-5 23-4 11-7.5 22.5T702-751l91 91h87v279l-113 37-67 224H480v-80h-80v80H180Z'},
  {id:62, name:'Парусник', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'m120-420 320-460v460H120Zm380 0q12-28 26-98t14-142q0-72-13.5-148T500-920q61 18 121.5 67t109 117q48.5 68 79 149.5T840-420H500ZM360-200q-36 0-67-17t-53-43q-14 15-30.5 28T173-211q-35-26-59.5-64.5T80-360h800q-9 46-33.5 84.5T787-211q-20-8-36.5-21T720-260q-23 26-53.5 43T600-200q-36 0-67-17t-53-43q-22 26-53 43t-67 17ZM80-40v-80h40q32 0 62.5-10t57.5-30q27 20 57.5 29.5T360-121q32 0 62-9.5t58-29.5q27 20 57.5 29.5T600-121q32 0 62-9.5t58-29.5q28 20 58 30t62 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-59 22.5T600-40q-31 0-61-7.5T480-70q-29 15-59 22.5T360-40q-31 0-61-7.5T240-70q-29 15-59 22.5T120-40H80Z'},
  {id:63, name:'Якорь (вектор)', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M480-80q-61 0-125-22t-116-60q-52-38-85.5-89T120-360v-120l160 120-62 62q29 51 92 88t130 47v-357H320v-80h120v-47q-35-13-57.5-43.5T360-760q0-50 35-85t85-35q50 0 85 35t35 85q0 39-22.5 69.5T520-647v47h120v80H520v357q67-10 130-47t92-88l-62-62 160-120v120q0 58-33.5 109T721-162q-52 38-116 60T480-80Zm0-640q17 0 28.5-11.5T520-760q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760q0 17 11.5 28.5T480-720Z'},
  {id:64, name:'Лодка', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M158-200 82-468q-3-12 2.5-28t23.5-22l52-18v-184q0-33 23.5-56.5T240-800h120v-120h240v120h120q33 0 56.5 23.5T800-720v184l52 18q21 8 25 23.5t1 26.5l-76 268q-50 0-91-23.5T640-280q-30 33-71 56.5T480-200q-48 0-89-23.5T320-280q-30 33-71 56.5T158-200ZM80-40v-80h80q42 0 83-13t77-39q36 26 77 38t83 12q42 0 83-12t77-38q36 26 77 39t83 13h80v80h-80q-42 0-82-10t-78-30q-38 20-78.5 30T480-40q-41 0-81.5-10T320-80q-38 20-78 30t-82 10H80Zm160-522 240-78 240 78v-158H240v158Z'},
  {id:65, name:'Сёрфинг', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M80-40v-80h40q32 0 62-10t58-30q28 20 58 29.5t62 9.5q32 0 62.5-9.5T480-160q28 20 58 29.5t62 9.5q32 0 62.5-9.5T720-160q27 20 57.5 30t62.5 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-59 22.5T600-40q-31 0-61-7.5T480-70q-29 15-59 22.5T360-40q-31 0-61-7.5T240-70q-29 15-59 22.5T120-40H80Zm260-760 222 41q14 2 27 11t22 25l35 62q26 45 72 73t102 28v80q-78 0-142-39T577-621l-90 61 153 120v154q16 11 31 23t29 23q-21 18-46 29t-54 11q-36 0-67-17t-53-43q-22 26-53 43t-67 17q-10 0-19.5-1.5T322-206q-86-59-144-119t-58-104q0-31 24-41t50-10q29 0 67 8.5t81 24.5l-21-124q-4-20 4.5-39.5T352-642l86-58q-3 0-14.5-2.5t-25.5-5-25.5-5Q361-715 358-715l-113 77-45-66 140-96Zm72 284 18 106q27 13 67 34.5t63 35.5v-60L412-516Zm268-224q-33 0-56.5-23.5T600-820q0-33 23.5-56.5T680-900q33 0 56.5 23.5T760-820q0 33-23.5 56.5T680-740Z'},
  {id:66, name:'Каякинг', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M80-40v-80h40q32 0 62-10t58-30q28 20 58 30t62 10q32 0 62.5-10t57.5-30q28 20 58 30t62 10q32 0 62.5-10t57.5-30q27 20 57.5 30t62.5 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-59 22.5T600-40q-31 0-61-7.5T480-70q-29 15-59 22.5T360-40q-31 0-61-7.5T240-70q-29 15-59 22.5T120-40H80Zm280-160q-36 0-67-17t-53-43q-17 18-37.5 32.5T157-205q-41-11-83-26T0-260q54-23 132-47t153-36l54-167q11-34 41.5-45t57.5 3l102 52 113-60 66-148-20-53 53-119 128 57-53 119-53 20-148 334q93 11 186.5 38T960-260q-29 13-73.5 28.5T803-205q-25-7-45.5-21.5T720-260q-22 26-53 43t-67 17q-36 0-67-17t-53-43q-22 26-53 43t-67 17Zm203-157 38-85-61 32-70-36-28 86h38q21 0 42 .5t41 2.5Zm-83-223q-33 0-56.5-23.5T400-660q0-33 23.5-56.5T480-740q33 0 56.5 23.5T560-660q0 33-23.5 56.5T480-580Z'},
  {id:67, name:'Дайвинг', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M160-40 96-88l114-152 31-178q3-24 19-42.5t41-24.5l379-115 80-160 120-120 40 40-100 116-60 184-200 140-234 74-46 126L160-40Zm-40-320q-33 0-56.5-23.5T40-440q0-33 23.5-56.5T120-520q33 0 56.5 23.5T200-440q0 33-23.5 56.5T120-360Zm236-196q-24 7-45.5-5.5T282-598q-7-24 5.5-46t36.5-28l182-48 31 116-181 48Z'},
  {id:68, name:'Цунами', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M80-120v-80q38 0 68-14.5t65-40.5q30 25 65.5 39.5T347-201q33 0 69-14t65-40q32 28 66 41t68 13q33 0 64.5-13t69.5-41q39 30 69 42.5t62 12.5v80q-35 0-67.5-9.5T749-157q-32 20-66.5 28.5T615-120q-33 0-67.5-8.5T481-157q-29 19-64 28t-70 9q-34 0-68-9t-66-28q-31 18-64.5 27.5T80-120Zm0-180v-80q0-97 37.5-181T220-707q65-62 152.5-97.5T560-840q33 0 65.5 3.5T684-827q-21 32-32.5 67.5T640-693q0 55 39 94t94 39h107v80H773q-89 0-151-62t-62-151q0-14 2-29.5t6-30.5q-74 18-121 76.5T400-540q0 36 11.5 68.5T444-410q8-5 17-11.5t19-13.5q29 26 67 40t68 14q30 0 67-14.5t67-39.5q32 24 63.5 39.5T880-380v80q-35 0-67.5-9.5T749-337q-32 20-65 28.5t-69 8.5q-36 0-72-10t-62-27q-31 19-65 27.5t-69 9.5q-35 1-69-9t-65-28q-31 18-64.5 27.5T80-300Z'},
  {id:69, name:'Пляж', price:100, vb:[0,-960,960,960], cat:'iSea',
    svg:'M786-120 532-374l56-56 254 254-56 56Zm-546-28q-100-98-117.5-230T168-625q3 34 17 76.5t38.5 89.5q24.5 47 58.5 96.5t75 97.5L240-148Zm172-172q-48-48-84-104.5T271.5-534q-20.5-53-23-96.5T267-695q21-22 64.5-20t97 22.5q53.5 20.5 110 57T643-551L412-320Zm286-286q-47-41-96.5-74t-96-58q-46.5-25-89-39.5T340-795q115-60 246.5-41.5T814-722L698-606Z'},
  {id:70, name:'Парк', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M558-80H402v-160H120l160-240h-80l280-400 280 400h-80l160 240H558v160Z'},
  {id:71, name:'Лес', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M520-80v-120h160v120H520Zm-240 0v-160H0l154-240H80l280-400 280 400h-74l155 240H440v160H280Zm490-160L640-440h77L505-743l95-137 280 400h-74l154 240H770Z'},
  {id:72, name:'Природа (вектор)', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M200-80v-80h240v-160h-80q-83 0-141.5-58.5T160-520q0-60 33-110.5t89-73.5q9-75 65.5-125.5T480-880q76 0 132.5 50.5T678-704q56 23 89 73.5T800-520q0 83-58.5 141.5T600-320h-80v160h240v80H200Z'},
  {id:73, name:'Трава', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M80-160v-80h230q-22-85-83.5-146.5T80-470q20-5 39.5-7.5T160-480q134 0 227 93t93 227H80Zm480 0q0-42-9-83.5T525-323q42-71 114.5-114T800-480q21 0 40.5 2.5T880-470q-85 22-146 83.5T650-240h230v80H560Zm-80-239q0-65 24-122t66-100.5q42-43.5 98.5-69.5T789-719q-56 35-98 86t-65 114q-44 21-80.5 51.5T480-399Zm-73-75q-12-9-24-17t-25-16q0-6 1-12.5t1-12.5q0-76-24-144t-68-124q66 27 114.5 77.5T457-606q-18 30-31 63.5T407-474Z'},
  {id:74, name:'Компост', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M480-100q-79 0-148-30t-120.5-81.5Q160-263 130-332t-30-148q0-79 30-148t81.5-120.5Q263-800 332-830t148-30v-100l160 160-160 160v-100q-108 0-184 76t-76 184q0 66 30.5 122.5T332-266q16-28 47.5-47.5T452-338q-3-21-8-42t-12-39q-11 9-24 14t-28 5q-33 0-56.5-23.5T300-480v-40q0-17-5.5-32T280-580q50-1 89 9 34 9 62 29.5t29 61.5q0 9-1.5 16.5T453-448q-13-10-26-18t-27-14q17 13 39 40t41 64q20-49 50-96.5t70-87.5q-23 16-44 34t-41 38q-7-11-11-24.5t-4-27.5q0-42 29-71t71-29h40q23 0 38-6t25-14q11-9 17-20 4 67-7 120-9 45-34 82.5T600-440q-15 0-28.5-4T547-455q-7 19-16 50.5T517-337q38 7 67 26t44 45q51-35 81.5-91T740-480h120q0 79-30 148t-81.5 120.5Q697-160 628-130t-148 30Z'},
  {id:75, name:'Взлёт', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M120-120v-80h720v80H120Zm74-200L80-514l62-12 70 62 192-52-162-274 78-24 274 246 200-54q32-9 58 12t26 56q0 22-13.5 39T830-492L194-320Z'},
  {id:76, name:'Посадка', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M754-324 120-500v-220l60 20 28 84 192 54v-318l80 20 110 350 200 56q23 6 36.5 24.5T840-388q0 33-27 53t-59 11ZM120-120v-80h720v80H120Z'},
  {id:77, name:'Воздушный узел', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M624-104 520-280H400q-17 0-28.5-11.5T360-320q0-17 11.5-28.5T400-360h120l104-176h44l-52 176h114l30-40h40l-24 80 24 80h-40l-30-40H616l52 176h-44ZM292-424l52-176H230l-30 40h-40l24-80-24-80h40l30 40h114l-52-176h44l104 176h120q17 0 28.5 11.5T600-640q0 17-11.5 28.5T560-600H440L336-424h-44Z'},
  {id:78, name:'Спутник (простой)', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M240-280h480L570-480 450-320l-90-120-120 160Zm0-200q100 0 170-70t70-170h-68q0 72-50 122t-122 50v68Zm0-136q43 0 72.5-30.5T342-720H240v104Zm-40 496q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z'},
  {id:79, name:'Ракета (простая)', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M160-80v-237q0-20 9.5-38t26.5-29l44-29q7 84 22 143t47 131L160-80Zm209-80q-35-66-52-140t-17-153q0-125 49.5-235.5T480-856q81 57 130.5 167.5T660-453q0 78-17 151.5T591-160H369Zm111-280q33 0 56.5-23.5T560-520q0-33-23.5-56.5T480-600q-33 0-56.5 23.5T400-520q0 33 23.5 56.5T480-440ZM800-80l-149-59q32-72 47-131t22-143l44 29q17 11 26.5 29t9.5 38v237Z'},
  {id:80, name:'Замок-крепость', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M40-120v-480h80v80h80v-320h80v80h80v-80h80v80h80v-80h80v80h80v-80h80v320h80v-80h80v480H560v-120q0-33-23.5-56.5T480-320q-33 0-56.5 23.5T400-240v120H40Zm320-360h80v-120h-80v120Zm160 0h80v-120h-80v120Z'},
  {id:81, name:'Флаг (вектор)', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Z'},
  {id:82, name:'Звезда (вектор)', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m233-120 65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z'},
  {id:83, name:'Полузвезда', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m606-286-33-144 111-96-146-13-58-136v312l126 77ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Z'},
  {id:84, name:'Движение-сияние', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M480-80q-33 0-56.5-23.5T400-160v-320q0-33 23.5-56.5T480-560h320q33 0 56.5 23.5T880-480v320q0 33-23.5 56.5T800-80H480ZM240-240v-400q0-33 23.5-56.5T320-720h400v80H320v400h-80ZM80-400v-400q0-33 23.5-56.5T160-880h400v80H160v400H80Z'},
  {id:85, name:'Солнце (вектор)', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M440-800v-120h80v120h-80Zm0 760v-120h80v120h-80Zm360-400v-80h120v80H800Zm-760 0v-80h120v80H40Zm708-252-56-56 70-72 58 58-72 70ZM198-140l-58-58 72-70 56 56-70 72Zm564 0-70-72 56-56 72 70-58 58ZM212-692l-72-70 58-58 70 72-56 56Zm268 452q-100 0-170-70t-70-170q0-100 70-170t170-70q100 0 170 70t70 170q0 100-70 170t-170 70Z'},
  {id:86, name:'Светлый режим', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Z'},
  {id:87, name:'Тёмный режим', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z'},
  {id:88, name:'Облачная дымка', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M260-160q-92 0-156-64T40-380q0-73 53.5-126.5T220-560q73 0 126.5 53.5T400-380h80q0-103-64-172.5T250-640q18-74 81.5-117T480-800q118 0 199 81t81 199q63 0 111.5 56T920-340q0 75-52.5 127.5T740-160H260Z'},
  {id:89, name:'Вода (вектор)', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M80-240v-80q38 0 56.5-20t77.5-20q59 0 77.5 20t54.5 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20q38 0 55.5-20t76.5-20q59 0 77.5 20t56.5 20v80q-57 0-77.5-20T746-280q-36 0-54.5 20T614-240q-57 0-77.5-20T480-280q-38 0-56.5 20T346-240q-59 0-76.5-20T214-280q-38 0-56.5 20T80-240Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-440q-36 0-54.5 20T614-400q-57 0-77.5-20T480-440q-38 0-55.5 20T348-400q-59 0-78.5-20T214-440q-36 0-56.5 20T80-400Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-600q-36 0-54.5 20T614-560q-57 0-77.5-20T480-600q-38 0-55.5 20T348-560q-59 0-78.5-20T214-600q-36 0-56.5 20T80-560Z'},
  {id:90, name:'Потоп', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M80-80v-80q38 0 56.5-20t77.5-20q59 0 77 20t56 20q38 0 56-20t77-20q57 0 77.5 20t56.5 20q38 0 56-20t77-20q59 0 77 20t56 20v80q-58 0-77-20t-56-20q-37 0-56 20t-77 20q-58 0-77.5-20T480-120q-38 0-56 20t-77 20q-59 0-77-20t-56-20q-37 0-56 20T80-80Zm0-180v-80q38 0 56-20t77-20q6 0 12 .5t11 1.5l-38-140-55 72-63-50 311-384 461 176-29 75-84-34 81 301q14 8 27.5 15t32.5 7v80q-57-1-77-20.5T747-300q-38 0-56 20t-77 20q-57 0-77.5-20T480-300q-38 0-56 20t-77 20q-57 0-77-20t-56-20q-35 0-56 20t-78 20Zm538-81-56-212-155 41 37 136q8-2 16.5-3t19.5-1q57 0 81.5 22t56.5 17Z'},
  {id:91, name:'Яркость высокая', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-28 346-160H160v-186L28-480l132-134v-186h186l134-132 134 132h186v186l132 134-132 134v186H614L480-28Zm0-252q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280Zm0-80q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Z'},
  {id:92, name:'Яркость низкая', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-28 346-160H160v-186L28-480l132-134v-186h186l134-132 134 132h186v186l132 134-132 134v186H614L480-28Zm0-252q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280Zm0 140 100-100h140v-140l100-100-100-100v-140H580L480-820 380-720H240v140L140-480l100 100v140h140l100 100Z'},
  {id:93, name:'Яркость средняя', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-28 346-160H160v-186L28-480l132-134v-186h186l134-132 134 132h186v186l132 134-132 134v186H614L480-28Zm0-112 100-100h140v-140l100-100-100-100v-140H580L480-820 380-720H240v140L140-480l100 100v140h140l100 100Zm0-140q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680v400Z'},
  {id:94, name:'Круговое размытие', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M400-520q17 0 28.5-11.5T440-560q0-17-11.5-28.5T400-600q-17 0-28.5 11.5T360-560q0 17 11.5 28.5T400-520Zm0 160q17 0 28.5-11.5T440-400q0-17-11.5-28.5T400-440q-17 0-28.5 11.5T360-400q0 17 11.5 28.5T400-360ZM280-540q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm120 280q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6ZM280-380q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm120-280q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm160 140q17 0 28.5-11.5T600-560q0-17-11.5-28.5T560-600q-17 0-28.5 11.5T520-560q0 17 11.5 28.5T560-520Zm0-140q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm120 280q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-160q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm80-180q8 0 14-6t6-14q0-8-6-14t-14-6q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-100q17 0 28.5-11.5T600-400q0-17-11.5-28.5T560-440q-17 0-28.5 11.5T520-400q0 17 11.5 28.5T560-360Z'},
  {id:95, name:'Туман (вектор)', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M720-200q-17 0-28.5-11.5T680-240q0-17 11.5-28.5T720-280q17 0 28.5 11.5T760-240q0 17-11.5 28.5T720-200ZM280-80q-17 0-28.5-11.5T240-120q0-17 11.5-28.5T280-160q17 0 28.5 11.5T320-120q0 17-11.5 28.5T280-80Zm-40-120q-17 0-28.5-11.5T200-240q0-17 11.5-28.5T240-280h360q17 0 28.5 11.5T640-240q0 17-11.5 28.5T600-200H240ZM400-80q-17 0-28.5-11.5T360-120q0-17 11.5-28.5T400-160h280q17 0 28.5 11.5T720-120q0 17-11.5 28.5T680-80H400ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Z'},
  {id:96, name:'Переменная облачность', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M240-160q-66 0-113-47T80-320q0-66 47-113t113-47q48 0 88.5 26t58.5 71l10 23h24q42 0 70.5 29t28.5 71q0 42-29 71t-71 29H240Zm359-112q-4-63-45.5-109T449-438q-31-54-83.5-85.5T250-560q26-73 89-116.5T480-720q100 0 170 70t70 170q0 65-32 120.5T599-272ZM440-760v-160h80v160h-80Zm266 110-56-56 112-114 57 57-113 113Zm54 210v-80h160v80H760Zm2 300L650-254l56-56 114 112-58 58ZM254-650 141-763l57-57 112 114-56 56Z'},
  {id:97, name:'Ясный день', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M440-760v-160h80v160h-80Zm266 110-55-55 112-115 56 57-113 113Zm54 210v-80h160v80H760ZM440-40v-160h80v160h-80ZM254-652 140-763l57-56 113 113-56 54Zm508 512L651-255l54-54 114 110-57 59ZM40-440v-80h160v80H40Zm157 300-56-57 112-112 29 27 29 28-114 114Zm283-100q-100 0-170-70t-70-170q0-100 70-170t170-70q100 0 170 70t70 170q0 100-70 170t-170 70Z'},
  {id:98, name:'Буря', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M726-80q25-62 35-127t5-131q-39 83-116.5 130.5T480-160q-84 0-152-39.5T212-305q-48-66-74-151.5T112-634q0-63 8.5-124.5T150-880h84q-24 62-34.5 127T194-622q39-83 116.5-130.5T480-800q84 0 152 39.5T748-655q48 66 74 151.5T848-326q0 63-8.5 124.5T810-80h-84ZM480-320q66 0 113-47t47-113q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 66 47 113t113 47Zm0-80q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Z'},
  {id:99, name:'Высокая влажность', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-100q-133 0-226.5-92T160-416q0-63 24.5-120.5T254-638l170-167q12-11 26.5-17t29.5-6q15 0 29.5 6t26.5 17l170 167q45 44 69.5 101.5T800-416q0 132-93.5 224T480-100Z'},
  {id:100, name:'Разведка', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'m260-260 300-140 140-300-300 140-140 300Zm220-180q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520q17 0 28.5 11.5T520-480q0 17-11.5 28.5T480-440Zm0 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:101, name:'Поход', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'m280-40 123-622q6-29 27-43.5t44-14.5q23 0 42.5 10t31.5 30l40 64q18 29 46.5 52.5T700-529v-71h60v560h-60v-406q-48-11-89-35t-71-59l-24 120 84 80v300h-80v-240l-84-80-72 320h-84Zm17-395-85-16q-16-3-25-16.5t-6-30.5l30-157q6-32 34-50.5t60-12.5l46 9-54 274Zm243-305q-33 0-56.5-23.5T460-820q0-33 23.5-56.5T540-900q33 0 56.5 23.5T620-820q0 33-23.5 56.5T540-740Z'},
  {id:102, name:'Рюкзак', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'M240-80q-33 0-56.5-23.5T160-160v-480q0-56 34-98t86-56v-86h120v80h160v-80h120v86q52 14 86 56t34 98v480q0 33-23.5 56.5T720-80H240Zm340-240h80v-160H300v80h280v80Z'},
  {id:103, name:'Калибровка компаса', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'M480-80q-83 0-141.5-58.5T280-280q0-83 58.5-141.5T480-480q83 0 141.5 58.5T680-280q0 83-58.5 141.5T480-80ZM280-474 80-674q80-80 183.5-123T480-840q113 0 216.5 43T880-674L680-474q-41-41-92-63.5T480-560q-57 0-108 22.5T280-474Z'},
  {id:104, name:'Навигация', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'m200-120-40-40 320-720 320 720-40 40-280-120-280 120Z'},
  {id:105, name:'Курс на меня', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'M516-120 402-402 120-516v-56l720-268-268 720h-56Z'},
  {id:106, name:'Моё место', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'M440-42v-80q-125-14-214.5-103.5T122-440H42v-80h80q14-125 103.5-214.5T440-838v-80h80v80q125 14 214.5 103.5T838-520h80v80h-80q-14 125-103.5 214.5T520-122v80h-80Zm40-158q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Z'},
  {id:107, name:'Добавить точку', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'M440-400h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm40 320Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Z'},
  {id:108, name:'Улей', price:180, vb:[0,-960,960,960], cat:'iExplore',
    svg:'m651-500-68-120 68-120h134l68 120-68 120H651ZM413-360l-68-120 68-120h134l68 120-68 120H413Zm0-280-68-120 68-120h134l68 120-68 120H413ZM175-500l-68-120 68-120h134l65 120-65 120H175Zm0 280-68-120 68-120h134l65 120-65 120H175ZM417-80l-72-120 68-120h134l68 120-68 120H417Zm234-140-68-120 68-120h134l68 120-68 120H651Z'},
  {id:109, name:'Преданность', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm260 380 140-140q11-11 17.5-26t6.5-32q0-34-24-58t-58-24q-19 0-37.5 11T520-492q-30-28-47-38t-35-10q-34 0-58 24t-24 58q0 17 6.5 32t17.5 26l140 140Z'},
  {id:110, name:'Часы (вектор)', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m360-80-54-182q-48-38-77-95t-29-123q0-66 29-123t77-95l54-182h240l54 182q48 38 77 95t29 123q0 66-29 123t-77 95L600-80H360Zm120-200q83 0 141.5-58.5T680-480q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280Z'},
  {id:111, name:'Полиция (значок)', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m368-336 112-84 110 84-42-136 112-88H524l-44-136-44 136H300l110 88-42 136ZM480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:112, name:'Щит-луна', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M501-320q38 0 74.5-16t63.5-48q7-8 3-18t-14-12q-38-6-72-28.5T501-502q-20-35-23.5-75.5T488-656q4-10-2.5-18t-17.5-6q-69 13-109 65t-40 115q0 75 53.5 127.5T501-320ZM480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:113, name:'Спортивный счёт', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M360-720h80v-80h-80v80Zm160 0v-80h80v80h-80ZM360-400v-80h80v80h-80Zm320-160v-80h80v80h-80Zm0 160v-80h80v80h-80Zm-160 0v-80h80v80h-80Zm160-320v-80h80v80h-80Zm-240 80v-80h80v80h-80ZM200-160v-640h80v80h80v80h-80v80h80v80h-80v320h-80Zm400-320v-80h80v80h-80Zm-160 0v-80h80v80h-80Zm-80-80v-80h80v80h-80Zm160 0v-80h80v80h-80Zm80-80v-80h80v80h-80Z'},
  {id:114, name:'Таблица лидеров', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M80-120v-480h220v480H80Zm290 0v-720h220v720H370Zm290 0v-400h220v400H660Z'},
  {id:115, name:'Цветок (вектор)', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M480-540q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Zm0 180q-39 0-70.5-21.5T364-438q-5 0-9 .5t-9 .5q-52 0-89-37t-37-89q0-21 7-40.5t21-36.5q-13-17-20-36.5t-7-40.5q0-52 36.5-89t88.5-37q5 0 9 .5t9 .5q14-35 45.5-56.5T480-920q39 0 70.5 21.5T596-842q5 0 9-.5t9-.5q52 0 88.5 37t36.5 89q0 21-6.5 40.5T712-640q13 17 20 36.5t7 40.5q0 52-36.5 89T614-437q-5 0-9-.5t-9-.5q-14 35-45.5 56.5T480-360Zm0 280q0-74 28.5-139.5T586-334q49-49 114.5-77.5T840-440q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Zm0 0q0-74-28.5-139.5T374-334q-49-49-114.5-77.5T120-440q0 74 28.5 139.5T226-186q49 49 114.5 77.5T480-80Z'},
  {id:116, name:'Винтажный цветок', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M482-80q-57 0-101-36t-55-92q-53 17-107-2t-83-66q-30-48-22-106.5t52-97.5q-42-38-50.5-94T134-678q27-48 81.5-69.5T324-752q11-56 55-92t101-36q57 0 101 36t55 92q56-17 108.5 3t81.5 71q27 50 19.5 104.5T794-480q44 39 52.5 96.5T828-276q-29 51-81.5 68T638-208q-11 56-55 92T482-80Zm-2-240q66 0 113-47t47-113q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 66 47 113t113 47Z'},
  {id:117, name:'Растение в горшке', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M342-80q-28 0-49-17t-28-44l-45-179h520l-45 179q-7 27-28 44t-49 17H342Zm138-560q0-100 70-170t170-70q0 90-57 156t-143 80v84h320v120q0 33-23.5 56.5T760-360H200q-33 0-56.5-23.5T120-440v-120h320v-84q-86-14-143-80t-57-156q100 0 170 70t70 170Z'},
  {id:118, name:'Природа и люди', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M180-520q-26 0-43-17t-17-43q0-26 17-43t43-17q26 0 43 17t17 43q0 26-17 43t-43 17ZM120-80v-200H80v-160q0-17 11.5-28.5T120-480h120q17 0 28.5 11.5T280-440v160h-40v120h320v-200h-70q-71 0-120.5-49.5T320-530q0-53 28.5-94.5T422-686q11-65 60.5-109.5T600-840q68 0 117.5 44.5T778-686q45 20 73.5 61.5T880-530q0 71-49.5 120.5T710-360h-70v200h200v80H120Z'},
  {id:119, name:'Питомец', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M180-475q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm180-160q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm240 0q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Zm180 160q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM266-75q-45 0-75.5-34.5T160-191q0-52 35.5-91t70.5-77q29-31 50-67.5t50-68.5q22-26 51-43t63-17q34 0 63 16t51 42q28 32 49.5 69t50.5 69q35 38 70.5 77t35.5 91q0 47-30.5 81.5T694-75q-54 0-107-9t-107-9q-54 0-107 9t-107 9Z'},
  {id:120, name:'Без жестокости (заяц)', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M380-80q-75 0-127.5-52.5T200-260q0-35 17-64.5t63-75.5q6-6 11.5-12.5T306-430q-51-78-78.5-163.5T200-760q0-58 21-89t59-31q57 0 102 55t68 101q9 20 16.5 40.5T480-641q6-22 13.5-42.5T511-724q22-46 67-101t102-55q38 0 59 31t21 89q0 81-27.5 166.5T654-430q9 11 14.5 17.5T680-400q46 46 63 75.5t17 64.5q0 75-52.5 127.5T580-80q-45 0-72.5-10L480-100l-27.5 10Q425-80 380-80Zm0-80q23 0 46-5.5t43-16.5q-11-5-20-17t-9-21q0-8 11.5-14t28.5-6q17 0 28.5 6t11.5 14q0 9-9 21t-20 17q20 11 43 16.5t46 5.5q42 0 71-29t29-71q0-18-10-35t-30-34q-14-12-23-21t-29-34q-29-35-48-45.5T480-440q-41 0-60.5 10.5T372-384q-20 25-29 34t-23 21q-20 17-30 34t-10 35q0 42 29 71t71 29Zm40-130q-8 0-14-9t-6-21q0-12 6-21t14-9q8 0 14 9t6 21q0 12-6 21t-14 9Zm120 0q-8 0-14-9t-6-21q0-12 6-21t14-9q8 0 14 9t6 21q0 12-6 21t-14 9ZM363-489q11-8 25-14t31-11q-2-48-14.5-95.5T373-696q-19-40-42-67.5T285-799q-2 6-3.5 15.5T280-760q0 68 21.5 138T363-489Zm234 0q40-63 61.5-133T680-760q0-14-1.5-23.5T675-799q-23 8-46 35.5T587-696q-18 39-30.5 86.5T541-514q15 4 29 10.5t27 14.5Z'},
  {id:121, name:'Яйцо', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M480-120q-117 0-198.5-81.5T200-400q0-77 25.5-155t66-141.5Q332-760 382-800t98-40q49 0 98.5 40t90 103.5Q709-633 734.5-555T760-400q0 117-81.5 198.5T480-120Zm40-120q17 0 28.5-11.5T560-280q0-17-11.5-28.5T520-320q-50 0-85-35t-35-85q0-17-11.5-28.5T360-480q-17 0-28.5 11.5T320-440q0 83 58.5 141.5T520-240Z'},
  {id:122, name:'Жук-отчёт', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M480-120q-65 0-120.5-32T272-240H160v-80h84q-3-20-3.5-40t-.5-40h-80v-80h80q0-20 .5-40t3.5-40h-84v-80h112q14-23 31.5-43t40.5-35l-64-66 56-56 86 86q28-9 57-9t57 9l88-86 56 56-66 66q23 15 41.5 34.5T688-640h112v80h-84q3 20 3.5 40t.5 40h80v80h-80q0 20-.5 40t-3.5 40h84v80H688q-32 56-87.5 88T480-120Zm-80-200h160v-80H400v80Zm0-160h160v-80H400v80Z'},
  {id:123, name:'Электро-разряд', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'m280-80 160-300-320-40 480-460h80L520-580l320 40L360-80h-80Z'},
  {id:124, name:'Автономный разряд', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'m456-200 174-340H510v-220L330-420h126v220Zm24 120q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:125, name:'Батарея полная', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M320-80q-17 0-28.5-11.5T280-120v-640q0-17 11.5-28.5T320-800h80v-80h160v80h80q17 0 28.5 11.5T680-760v640q0 17-11.5 28.5T640-80H320Z'},
  {id:126, name:'Роутер', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M200-120q-33 0-56.5-23.5T120-200v-160q0-33 23.5-56.5T200-440h400v-160h80v160h80q33 0 56.5 23.5T840-360v160q0 33-23.5 56.5T760-120H200Zm80-120q17 0 28.5-11.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 17 11.5 28.5T280-240Zm140 0q17 0 28.5-11.5T460-280q0-17-11.5-28.5T420-320q-17 0-28.5 11.5T380-280q0 17 11.5 28.5T420-240Zm140 0q17 0 28.5-11.5T600-280q0-17-11.5-28.5T560-320q-17 0-28.5 11.5T520-280q0 17 11.5 28.5T560-240Zm10-390-58-58q26-24 58-38t70-14q38 0 70 14t58 38l-58 58q-14-14-31.5-22t-38.5-8q-21 0-38.5 8T570-630ZM470-730l-56-56q44-44 102-69t124-25q66 0 124 25t102 69l-56 56q-33-33-76.5-51.5T640-800q-50 0-93.5 18.5T470-730Z'},
  {id:127, name:'Плата разработчика', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M160-120q-33 0-56.5-23.5T80-200v-560q0-33 23.5-56.5T160-840h560q33 0 56.5 23.5T800-760v80h80v80h-80v80h80v80h-80v80h80v80h-80v80q0 33-23.5 56.5T720-120H160Zm80-160h200v-160H240v160Zm240-280h160v-120H480v120Zm-240 80h200v-200H240v200Zm240 200h160v-240H480v240Z'},
  {id:128, name:'Кабель', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M200-120q-17 0-28.5-11.5T160-160v-40h-40v-160q0-17 11.5-28.5T160-400h40v-280q0-66 47-113t113-47q66 0 113 47t47 113v400q0 33 23.5 56.5T600-200q33 0 56.5-23.5T680-280v-280h-40q-17 0-28.5-11.5T600-600v-160h40v-40q0-17 11.5-28.5T680-840h80q17 0 28.5 11.5T800-800v40h40v160q0 17-11.5 28.5T800-560h-40v280q0 66-47 113t-113 47q-66 0-113-47t-47-113v-400q0-33-23.5-56.5T360-760q-33 0-56.5 23.5T280-680v280h40q17 0 28.5 11.5T360-360v160h-40v40q0 17-11.5 28.5T280-120h-80Z'},
  {id:129, name:'DNS-узел', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720Zm0 400q-25 0-42.5 17.5T240-260q0 25 17.5 42.5T300-200q25 0 42.5-17.5T360-260q0-25-17.5-42.5T300-320ZM160-840h640q17 0 28.5 11.5T840-800v280q0 17-11.5 28.5T800-480H160q-17 0-28.5-11.5T120-520v-280q0-17 11.5-28.5T160-840Zm0 400h640q17 0 28.5 11.5T840-400v280q0 17-11.5 28.5T800-80H160q-17 0-28.5-11.5T120-120v-280q0-17 11.5-28.5T160-440Z'},
  {id:130, name:'Раздача Wi-Fi', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M204-150q-57-55-90.5-129.5T80-440q0-83 31.5-156T197-723q54-54 127-85.5T480-840q83 0 156 31.5T763-723q54 54 85.5 127T880-440q0 86-33.5 161T756-150l-56-56q46-44 73-104.5T800-440q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 69 27 129t74 104l-57 57Zm113-113q-35-33-56-78.5T240-440q0-100 70-170t170-70q100 0 170 70t70 170q0 53-21 99t-56 78l-57-57q25-23 39.5-54t14.5-66q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 36 14.5 66.5T374-320l-57 57Zm163-97q-33 0-56.5-23.5T400-440q0-33 23.5-56.5T480-520q33 0 56.5 23.5T560-440q0 33-23.5 56.5T480-360Z'},
  {id:131, name:'Глобальный поиск', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q146 0 255.5 91.5T872-559h-82q-19-73-68.5-130.5T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h80v120h-40L168-552q-3 18-5.5 36t-2.5 36q0 131 92 225t228 95v80Zm364-20L716-228q-21 12-45 20t-51 8q-75 0-127.5-52.5T440-380q0-75 52.5-127.5T620-560q75 0 127.5 52.5T800-380q0 27-8 51t-20 45l128 128-56 56ZM620-280q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Z'},
  {id:132, name:'Язык/сеть', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-82q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z'},
  {id:133, name:'Дерево связей', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M600-120v-120H440v-400h-80v120H80v-320h280v120h240v-120h280v320H600v-120h-80v320h80v-120h280v320H600Z'},
  {id:134, name:'Поделиться', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M720-80q-50 0-85-35t-35-85q0-7 1-14.5t3-13.5L322-392q-17 15-38 23.5t-44 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q23 0 44 8.5t38 23.5l282-164q-2-6-3-13.5t-1-14.5q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-23 0-44-8.5T638-672L356-508q2 6 3 13.5t1 14.5q0 7-1 14.5t-3 13.5l282 164q17-15 38-23.5t44-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Z'},
  {id:135, name:'Проверка сети', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M84-516 0-600q95-97 219.5-148.5T480-800q24 0 48 1.5t48 4.5l-60 116q-9-1-18-1.5t-18-.5q-112 0-214.5 42.5T84-516Zm170 170-84-86q57-57 131-89t155-37l-64 131q-39 11-74 31.5T254-346Zm198 180q-33-11-48-41.5t0-60.5l240-488q4-8 12-10.5t16 .5q8 3 12 10.5t2 15.5L556-214q-8 33-39.5 47t-64.5 1Zm254-180q-7-7-13.5-12.5T678-370l32-125q21 14 41.5 29.5T790-432l-84 86Zm169-169q-32-29-65.5-55T738-616l28-120q54 26 103 60t91 76l-85 85Z'},
  {id:136, name:'Вышка связи', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M196-276q-57-60-86.5-133T80-560q0-78 29.5-151T196-844l48 48q-48 48-72 110.5T148-560q0 63 24 125.5T244-324l-48 48Zm96-96q-39-39-59.5-88T212-560q0-51 20.5-100t59.5-88l48 48q-30 27-45 64t-15 76q0 36 15 73t45 67l-48 48ZM280-80l135-405q-16-14-25.5-33t-9.5-42q0-42 29-71t71-29q42 0 71 29t29 71q0 23-9.5 42T545-485L680-80h-80l-26-80H387l-27 80h-80Zm133-160h134l-67-200-67 200Zm255-132-48-48q30-27 45-64t15-76q0-36-15-73t-45-67l48-48q39 39 58 88t22 100q0 51-20.5 100T668-372Zm96 96-48-48q48-48 72-110.5T812-560q0-63-24-125.5T716-796l48-48q57 60 86.5 133T880-560q0 78-28 151t-88 133Z'},
  {id:137, name:'Мозаика сияния', price:300, vb:[0,-960,960,960], cat:'iMagic',
    svg:'M440-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h240v720Zm80-400v-320h240q33 0 56.5 23.5T840-760v240H520Zm0 400v-320h320v240q0 33-23.5 56.5T760-120H520Z'},
  {id:138, name:'Градиент', price:300, vb:[0,-960,960,960], cat:'iMagic',
    svg:'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm240-400v80h80v-80h-80Zm-160 0v80h80v-80h-80Zm80 80v80h80v-80h-80Zm160 0v80h80v-80h-80Zm-320 0v80h80v-80h-80Zm400-80v80h80v80h80v-80h-80v-80h-80ZM280-360v80h-80v80h80v-80h80v80h80v-80h80v80h80v-80h80v80h80v-80h-80v-80h-80v80h-80v-80h-80v80h-80v-80h-80Zm480-160v80-80Zm0 160v80-80Z'},
  {id:139, name:'Кисть', price:300, vb:[0,-960,960,960], cat:'iMagic',
    svg:'M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm230-240L360-470l358-358q11-11 27.5-11.5T774-828l54 54q12 12 12 28t-12 28L470-360Z'},
  {id:140, name:'Заливка цветом', price:300, vb:[0,-960,960,960], cat:'iMagic',
    svg:'M440-80q-33 0-56.5-23.5T360-160v-160H240q-33 0-56.5-23.5T160-400v-280q0-66 47-113t113-47h480v440q0 33-23.5 56.5T720-320H600v160q0 33-23.5 56.5T520-80h-80ZM240-560h480v-200h-40v160h-80v-160h-40v80h-80v-80H320q-33 0-56.5 23.5T240-680v120Z'},
  {id:141, name:'Пипетка цвета', price:300, vb:[0,-960,960,960], cat:'iMagic',
    svg:'M120-120v-190l358-358-58-56 58-56 76 76 124-124q5-5 12.5-8t15.5-3q8 0 15 3t13 8l94 94q5 6 8 13t3 15q0 8-3 15.5t-8 12.5L705-555l76 78-57 57-56-58-358 358H120Zm80-80h78l332-334-76-76-334 332v78Z'},
  {id:142, name:'Ночной режим', price:180, vb:[0,-960,960,960], cat:'iNight',
    svg:'M380-880q83 0 156 31.5T663-763q54 54 85.5 127T780-480q0 83-31.5 156T663-197q-54 54-127 85.5T380-80q-53 0-103.5-13.5T180-134q93-54 146.5-146T380-480q0-108-53.5-200T180-826q46-27 96.5-40.5T380-880Z'},
  {id:143, name:'Сон', price:180, vb:[0,-960,960,960], cat:'iNight',
    svg:'M524-40q-84 0-157.5-32t-128-86.5Q184-213 152-286.5T120-444q0-146 93-257.5T450-840q-18 99 11 193.5T561-481q71 71 165.5 100T920-370q-26 144-138 237T524-40Z'},
  {id:144, name:'Невидимость', price:180, vb:[0,-960,960,960], cat:'iNight',
    svg:'M792-56 624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM480-320q11 0 20.5-1t20.5-4L305-541q-3 11-4 20.5t-1 20.5q0 75 52.5 127.5T480-320Zm292 18L645-428q7-17 11-34.5t4-37.5q0-75-52.5-127.5T480-680q-20 0-37.5 4T408-664L306-766q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302ZM587-486 467-606q28-5 51.5 4.5T559-574q17 18 24.5 41.5T587-486Z'},
  {id:145, name:'Контраст', price:180, vb:[0,-960,960,960], cat:'iNight',
    svg:'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm40-83q119-15 199.5-104.5T800-480q0-123-80.5-212.5T520-797v634Z'},
  {id:146, name:'Расписание', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:147, name:'История', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z'},
  {id:148, name:'Обновление', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M480-120q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-480q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-840q82 0 155.5 35T760-706v-94h80v240H600v-80h110q-41-56-101-88t-129-32q-117 0-198.5 81.5T200-480q0 117 81.5 198.5T480-200q105 0 183.5-68T756-440h82q-15 137-117.5 228.5T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z'},
  {id:149, name:'Пустые песочные часы', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M320-160h320v-120q0-66-47-113t-113-47q-66 0-113 47t-47 113v120Zm160-360q66 0 113-47t47-113v-120H320v120q0 66 47 113t113 47ZM160-80v-80h80v-120q0-61 28.5-114.5T348-480q-51-32-79.5-85.5T240-680v-120h-80v-80h640v80h-80v120q0 61-28.5 114.5T612-480q51 32 79.5 85.5T720-280v120h80v80H160Z'},
  {id:150, name:'Песочные часы (начало)', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M320-160h320v-120q0-66-47-113t-113-47q-66 0-113 47t-47 113v120ZM160-80v-80h80v-120q0-61 28.5-114.5T348-480q-51-32-79.5-85.5T240-680v-120h-80v-80h640v80h-80v120q0 61-28.5 114.5T612-480q51 32 79.5 85.5T720-280v120h80v80H160Z'},
  {id:151, name:'Песочные часы (конец)', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M480-520q66 0 113-47t47-113v-120H320v120q0 66 47 113t113 47ZM160-80v-80h80v-120q0-61 28.5-114.5T348-480q-51-32-79.5-85.5T240-680v-120h-80v-80h640v80h-80v120q0 61-28.5 114.5T612-480q51 32 79.5 85.5T720-280v120h80v80H160Z'},
  {id:152, name:'Таймер', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm40 320q-74 0-139.5-28.5T226-186q-49-49-77.5-114.5T120-440q0-74 28.5-139.5T226-694q49-49 114.5-77.5T480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80Z'},
  {id:153, name:'Будильник (вектор)', price:60, vb:[0,-960,960,960], cat:'iTime',
    svg:'M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-800q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Zm112-192 56-56-128-128v-184h-80v216l152 152ZM224-866l56 56-170 170-56-56 170-170Zm512 0 170 170-56 56-170-170 56-56Z'},
  {id:154, name:'Подкаст-сигнал', price:100, vb:[0,-960,960,960], cat:'iSignals',
    svg:'M440-80v-331q-18-11-29-28.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 23-11 41t-29 28v331h-80ZM204-190q-57-55-90.5-129.5T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 86-33.5 161T756-190l-56-56q46-44 73-104.5T800-480q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 69 27 129t74 104l-57 57Zm113-113q-35-33-56-78.5T240-480q0-100 70-170t170-70q100 0 170 70t70 170q0 53-21 99t-56 78l-57-57q25-23 39.5-54t14.5-66q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 36 14.5 66.5T374-360l-57 57Z'},
  {id:155, name:'RSS-лента', price:100, vb:[0,-960,960,960], cat:'iSignals',
    svg:'M200-120q-33 0-56.5-23.5T120-200q0-33 23.5-56.5T200-280q33 0 56.5 23.5T280-200q0 33-23.5 56.5T200-120Zm480 0q0-117-44-218.5T516-516q-76-76-177.5-120T120-680v-120q142 0 265 53t216 146q93 93 146 216t53 265H680Zm-240 0q0-67-25-124.5T346-346q-44-44-101.5-69T120-440v-120q92 0 171.5 34.5T431-431q60 60 94.5 139.5T560-120H440Z'},
  {id:156, name:'Антенна-настройка', price:100, vb:[0,-960,960,960], cat:'iSignals',
    svg:'M40-480q0-92 34.5-172T169-791.5q60-59.5 140-94T480-920q91 0 171 34.5t140 94Q851-732 885.5-652T920-480h-80q0-75-28.5-140.5T734-735q-49-49-114.5-77T480-840q-74 0-139.5 28T226-735q-49 49-77.5 114.5T120-480H40Zm160 0q0-118 82-199t198-81q116 0 198 81t82 199h-80q0-83-58.5-141.5T480-680q-83 0-141.5 58.5T280-480h-80ZM360-64l-56-56 136-136v-132q-27-12-43.5-37T380-480q0-42 29-71t71-29q42 0 71 29t29 71q0 30-16.5 55T520-388v132l136 136-56 56-120-120L360-64Z'},
  {id:157, name:'Уровень сигнала', price:100, vb:[0,-960,960,960], cat:'iSignals',
    svg:'M200-160v-240h120v240H200Zm240 0v-440h120v440H440Zm240 0v-640h120v640H680Z'},
  {id:158, name:'Wi-Fi', price:100, vb:[0,-960,960,960], cat:'iSignals',
    svg:'M480-120q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM254-346l-84-86q59-59 138.5-93.5T480-560q92 0 171.5 35T790-430l-84 84q-44-44-102-69t-124-25q-66 0-124 25t-102 69ZM84-516 0-600q92-94 215-147t265-53q142 0 265 53t215 147l-84 84q-77-77-178.5-120.5T480-680q-116 0-217.5 43.5T84-516Z'},
  {id:159, name:'Инструмент', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M686-132 444-376q-20 8-40.5 12t-43.5 4q-100 0-170-70t-70-170q0-36 10-68.5t28-61.5l146 146 72-72-146-146q29-18 61.5-28t68.5-10q100 0 170 70t70 170q0 23-4 43.5T584-516l244 242q12 12 12 29t-12 29l-84 84q-12 12-29 12t-29-12Z'},
  {id:160, name:'Мастер на все руки', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M754-81q-8 0-15-2.5T726-92L522-296q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l85-85q6-6 13-8.5t15-2.5q8 0 15 2.5t13 8.5l204 204q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13l-85 85q-6 6-13 8.5T754-81Zm-549 1q-8 0-15.5-3T176-92l-84-84q-6-6-9-13.5T80-205q0-8 3-15t9-13l212-212h85l34-34-165-165h-57L80-765l113-113 121 121v57l165 165 116-116-43-43 56-56H495l-28-28 142-142 28 28v113l56-56 142 142q17 17 26 38.5t9 45.5q0 24-9 46t-26 39l-85-85-56 56-42-42-207 207v84L233-92q-6 6-13 9t-15 3Z'},
  {id:161, name:'Стройка', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M756-120 537-339l84-84 219 219-84 84Zm-552 0-84-84 276-276-68-68-28 28-51-51v82l-28 28-121-121 28-28h82l-50-50 142-142q20-20 43-29t47-9q24 0 47 9t43 29l-92 92 50 50-28 28 68 68 90-90q-4-11-6.5-23t-2.5-24q0-59 40.5-99.5T701-841q15 0 28.5 3t27.5 9l-99 99 72 72 99-99q7 14 9.5 27.5T841-701q0 59-40.5 99.5T701-561q-12 0-24-2t-23-7L204-120Z'},
  {id:162, name:'Плотник', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M619-108q-11 11-25.5 17T563-85q-16 0-31-6t-26-17l-56-56q-11-11-16.5-24.5T427-216q-1-14 3.5-28t13.5-26l6-8-326-466 156-156 509 509q11 11 17 25.5t6 30.5q0 16-6 31t-17 26L619-108Zm-56-57 169-169-56-57-170 170 57 56Z'},
  {id:163, name:'Сантехника', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M771-593 630-734l-85 84-85-84 113-114q12-12 27-17.5t30-5.5q16 0 30.5 5.5T686-848l85 85q18 17 26.5 39.5T806-678q0 23-8.5 45T771-593ZM220-409q-18-18-18-42.5t18-42.5l98-99 85 85-99 99q-17 18-41.5 18T220-409Zm-43 297q-11-12-17-26.5t-6-30.5q0-16 5.5-30.5T177-226l283-282-127-128q-18-17-18-41.5t18-42.5q17-18 42-18t43 18l127 127 57-57 112 114q12 12 12 28t-12 28q-12 12-28 12t-28-12L290-112q-12 12-26.5 17.5T234-89q-15 0-30-6t-27-17Z'},
  {id:164, name:'Ремонтная служба', price:60, vb:[0,-960,960,960], cat:'iTools',
    svg:'M360-640h240v-80H360v80ZM80-160v-200h160v40h80v-40h320v40h80v-40h160v200H80Zm0-240v-160q0-33 23.5-56.5T160-640h120v-80q0-33 23.5-56.5T360-800h240q33 0 56.5 23.5T680-720v80h120q33 0 56.5 23.5T880-560v160H720v-80h-80v80H320v-80h-80v80H80Z'},
  {id:165, name:'Зерно/шум', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M240-160q-33 0-56.5-23.5T160-240q0-33 23.5-56.5T240-320q33 0 56.5 23.5T320-240q0 33-23.5 56.5T240-160Zm320 0q-33 0-56.5-23.5T480-240q0-33 23.5-56.5T560-320q33 0 56.5 23.5T640-240q0 33-23.5 56.5T560-160ZM400-320q-33 0-56.5-23.5T320-400q0-33 23.5-56.5T400-480q33 0 56.5 23.5T480-400q0 33-23.5 56.5T400-320Zm320 0q-33 0-56.5-23.5T640-400q0-33 23.5-56.5T720-480q33 0 56.5 23.5T800-400q0 33-23.5 56.5T720-320ZM240-480q-33 0-56.5-23.5T160-560q0-33 23.5-56.5T240-640q33 0 56.5 23.5T320-560q0 33-23.5 56.5T240-480Zm320 0q-33 0-56.5-23.5T480-560q0-33 23.5-56.5T560-640q33 0 56.5 23.5T640-560q0 33-23.5 56.5T560-480ZM400-640q-33 0-56.5-23.5T320-720q0-33 23.5-56.5T400-800q33 0 56.5 23.5T480-720q0 33-23.5 56.5T400-640Zm320 0q-33 0-56.5-23.5T640-720q0-33 23.5-56.5T720-800q33 0 56.5 23.5T800-720q0 33-23.5 56.5T720-640Z'},
  {id:166, name:'Точечный узор', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M680-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM280-240q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm160-320q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Z'},
  {id:167, name:'Линейное размытие', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M200-260q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm160-180q17 0 28.5-11.5T400-480q0-17-11.5-28.5T360-520q-17 0-28.5 11.5T320-480q0 17 11.5 28.5T360-440Zm0-160q17 0 28.5-11.5T400-640q0-17-11.5-28.5T360-680q-17 0-28.5 11.5T320-640q0 17 11.5 28.5T360-600Zm-160 20q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm0 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm160 140q17 0 28.5-11.5T400-320q0-17-11.5-28.5T360-360q-17 0-28.5 11.5T320-320q0 17 11.5 28.5T360-280Zm320-20q9 0 14.5-5.5T700-320q0-9-5.5-14.5T680-340q-9 0-14.5 5.5T660-320q0 9 5.5 14.5T680-300Zm0-320q9 0 14.5-5.5T700-640q0-9-5.5-14.5T680-660q-9 0-14.5 5.5T660-640q0 9 5.5 14.5T680-620Zm0 160q9 0 14.5-5.5T700-480q0-9-5.5-14.5T680-500q-9 0-14.5 5.5T660-480q0 9 5.5 14.5T680-460ZM520-600q17 0 28.5-11.5T560-640q0-17-11.5-28.5T520-680q-17 0-28.5 11.5T480-640q0 17 11.5 28.5T520-600Zm0 160q17 0 28.5-11.5T560-480q0-17-11.5-28.5T520-520q-17 0-28.5 11.5T480-480q0 17 11.5 28.5T520-440Zm0 160q17 0 28.5-11.5T560-320q0-17-11.5-28.5T520-360q-17 0-28.5 11.5T480-320q0 17 11.5 28.5T520-280ZM120-120v-720h720v720H120Z'},
  {id:168, name:'Текстура', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M176-120q-19-4-35.5-20.5T120-176l664-664q21 5 36 20.5t21 35.5L176-120Zm-56-252v-112l356-356h112L120-372Zm0-308v-80q0-33 23.5-56.5T200-840h80L120-680Zm560 560 160-160v80q0 33-23.5 56.5T760-120h-80Zm-308 0 468-468v112L484-120H372Z'},
  {id:169, name:'Шестиугольник', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M272-120 64-480l208-360h416l208 360-208 360H272Z'},
  {id:170, name:'Категория-фигуры', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'m260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Z'},
  {id:171, name:'Цветок-звено', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'m80-520 200-360 200 360H80Zm200 400q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm240 0v-320h320v320H520Zm160-400q-57-48-95.5-81T523-659q-23-25-33-47t-10-47q0-45 31.5-76t78.5-31q27 0 50.5 12.5T680-813q16-22 39.5-34.5T770-860q47 0 78.5 31t31.5 76q0 25-10 47t-33 47q-23 25-61.5 58T680-520Z'},
  {id:172, name:'Горный пейзаж', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'m40-240 240-320 180 240h101L410-520l150-200 360 480H40Z'},
  {id:173, name:'Спица-луч', price:100, vb:[0,-960,960,960], cat:'iAbstract',
    svg:'M480-520q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM280-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm400 0q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Z'},
  {id:174, name:'Жара', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M160-400q0-105 50-187t110-138q60-56 110-85.5l50-29.5v132q0 37 25 58.5t56 21.5q17 0 32.5-7t28.5-23l18-22q72 42 116 116.5T800-400q0 88-43 160.5T644-125q17-24 26.5-52.5T680-238q0-40-15-75.5T622-377L480-516 339-377q-29 29-44 64t-15 75q0 32 9.5 60.5T316-125q-70-42-113-114.5T160-400Zm320-4 85 83q17 17 26 38t9 45q0 49-35 83.5T480-120q-50 0-85-34.5T360-238q0-23 9-44.5t26-38.5l85-83Z'},
  {id:175, name:'Тепловой насос', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M450-282v-126l-89 89q20 14 42.5 23t46.5 14Zm60-1q24-4 46.5-13t42.5-23l-89-89v125Zm131-78q14-20 22.5-42.5T677-450H552l89 89Zm-89-149h125q-5-23-13.5-45.5T641-598l-89 88Zm-42-42 89-89q-20-14-42.5-23T510-678v126Zm-30 112q17 0 28.5-11.5T520-480q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480q0 17 11.5 28.5T480-440Zm-30-112v-125q-24 4-46.5 13T361-641l89 89Zm-167 42h125l-89-88q-14 20-23 42t-13 46Zm36 149 89-89H282q5 24 14 46.5t23 42.5ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z'},
  {id:176, name:'Термостат', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M520-520v-80h200v80H520Zm0-160v-80h320v80H520ZM320-120q-83 0-141.5-58.5T120-320q0-48 21-89.5t59-70.5v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q38 29 59 70.5t21 89.5q0 83-58.5 141.5T320-120ZM200-320h240q0-29-12.5-54T392-416l-32-24v-280q0-17-11.5-28.5T320-760q-17 0-28.5 11.5T280-720v280l-32 24q-23 17-35.5 42T200-320Z'},
  {id:177, name:'Раскалено', price:100, vb:[0,-960,960,960], cat:'iElem',
    svg:'M480-80q-100 0-183.5-44T158-242l164-164 120 100 198-198v104h80v-240H480v80h104L438-414 318-514 116-312q-17-38-26.5-80.5T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:178, name:'Двор', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M480-200q0-100-70-170t-170-70q0 100 70 170t170 70Zm0-202q26 0 44-18t18-44v-6q8 6 16.5 9t19.5 3q26 0 44-18t18-44q0-20-9.5-35T604-576q17-6 26.5-21t9.5-35q0-26-18-44t-44-18q-11 0-19.5 3t-16.5 9v-6q0-26-18-44t-44-18q-26 0-44 18t-18 44v6q-8-6-16.5-9t-19.5-3q-26 0-44 18t-18 44q0 20 9.5 35t26.5 21q-17 6-26.5 21t-9.5 35q0 26 18 44t44 18q11 0 19.5-3t16.5-9v6q0 26 18 44t44 18Zm0-112q-26 0-44-17.5T418-576q0-26 18-44t44-18q26 0 44 18t18 44q0 27-18 44.5T480-514Zm0 314q100 0 170-70t70-170q-100 0-170 70t-70 170ZM160-80q-33 0-56.5-23.5T80-160v-640q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v640q0 33-23.5 56.5T800-80H160Z'},
  {id:179, name:'Терраса', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M440-80v-520H80l400-280 400 280H520v520h-80Zm-320 0v-210L88-466l78-14 30 160h164v240h-80v-160h-80v160h-80Zm480 0v-240h164l30-160 78 14-32 176v210h-80v-160h-80v160h-80Z'},
  {id:180, name:'Забор', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M200-160v-160h-80v-80h80v-80h-80v-80h80v-120l120-120 80 80 81-80 80 80 80-80 120 120v120h79v80h-79v80h79v80h-79v160H200Zm80-400h80v-87l-40-40-40 40v87Zm160 0h80v-87l-40-40-40 40v87Zm161 0h79v-87l-40-40-39 39v88ZM280-400h80v-80h-80v80Zm160 0h80v-80h-80v80Zm161 0h79v-80h-79v80ZM280-240h80v-80h-80v80Zm160 0h80v-80h-80v80Zm161 0h79v-80h-79v80Z'},
  {id:181, name:'Коттедж', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M160-120v-375l-72 55-48-64 120-92v-124h80v63l240-183 440 336-48 63-72-54v375H520v-240h-80v240H160Zm0-640q0-50 35-85t85-35q17 0 28.5-11.5T320-920h80q0 50-35 85t-85 35q-17 0-28.5 11.5T240-760h-80Z'},
  {id:182, name:'Дачный посёлок', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M80-160v-400l240-240 240 240v400H360v-200h-80v200H80Zm200-280h80v-80h-80v80Zm360 280v-433L433-800h113l174 174v466h-80Zm160 0v-499L659-800h113l108 108v532h-80Z'},
  {id:183, name:'Хижина', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M240-200h480v-80H240v80Zm0-160h480v-80H240v80Zm0-160h480v-36l-58-44H298l-58 44v36Zm162-160h156l-78-59-78 59ZM160-120v-375l-72 55-48-64 120-92v-124h80v63l240-183 440 336-48 63-72-54v375H160Zm0-640q0-50 35-85t85-35q17 0 28.5-11.5T320-920h80q0 50-35 85t-85 35q-17 0-28.5 11.5T240-760h-80Z'},
  {id:184, name:'Полёт (вектор)', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'M340-80v-60l80-60v-220L80-320v-80l340-200v-220q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v220l340 200v80L540-420v220l80 60v60l-140-40-140 40Z'},
  {id:185, name:'Авиалинии', price:180, vb:[0,-960,960,960], cat:'iFlight',
    svg:'m80-160 440-640h360L760-160H80Zm500-240q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Z'},
  {id:186, name:'Открытая книга', price:300, vb:[0,-960,960,960], cat:'iMind',
    svg:'M480-160q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740v484q51-32 107-48t113-16q36 0 70.5 6t69.5 18v-480q15 5 29.5 10.5T898-752q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59Zm80-200v-380l200-200v400L560-360Z'},
  {id:187, name:'Книга-меню', price:300, vb:[0,-960,960,960], cat:'iMind',
    svg:'M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454Zm-40 176q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q47-23 96.5-35.5T260-800q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 101.5 12.5T898-752q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59Z'},
  {id:188, name:'Историческое знание', price:300, vb:[0,-960,960,960], cat:'iMind',
    svg:'M320-160q-33 0-56.5-23.5T240-240v-120h120v-90q-35-2-66.5-15.5T236-506v-44h-46L60-680q36-46 89-65t107-19q27 0 52.5 4t51.5 15v-55h480v520q0 50-35 85t-85 35H320Zm120-200h240v80q0 17 11.5 28.5T720-240q17 0 28.5-11.5T760-280v-440H440v24l240 240v56h-56L510-514l-8 8q-14 14-29.5 25T440-464v104ZM224-630h92v86q12 8 25 11t27 3q23 0 41.5-7t36.5-25l8-8-56-56q-29-29-65-43.5T256-684q-20 0-38 3t-36 9l42 42Z'},
  {id:189, name:'Психология (альт.)', price:300, vb:[0,-960,960,960], cat:'iMind',
    svg:'M240-80v-172q-57-52-88.5-121.5T120-520q0-150 105-255t255-105q125 0 221.5 73.5T827-615l52 205q5 19-7 34.5T840-360h-80v120q0 33-23.5 56.5T680-160h-80v80H240Zm240-240q17 0 28.5-11.5T520-360q0-17-11.5-28.5T480-400q-17 0-28.5 11.5T440-360q0 17 11.5 28.5T480-320Zm-30-128h61q0-25 6.5-40.5T544-526q18-20 35-40.5t17-53.5q0-42-32.5-71T483-720q-40 0-72.5 23T365-637l55 23q7-22 24.5-35.5T483-663q22 0 36.5 12t14.5 31q0 21-12.5 37.5T492-549q-20 21-31 42t-11 59Z'},
  {id:190, name:'Саморазвитие', price:300, vb:[0,-960,960,960], cat:'iMind',
    svg:'M272-160q-30 0-51-21t-21-51q0-21 12-39.5t32-26.5l156-62v-90q-54 63-125.5 96.5T120-320v-80q68 0 123.5-28T344-508l54-64q12-14 28-21t34-7h40q18 0 34 7t28 21l54 64q45 52 100.5 80T840-400v80q-83 0-154.5-33.5T560-450v90l156 62q20 8 32 26.5t12 39.5q0 30-21 51t-51 21H400v-20q0-26 17-43t43-17h120q9 0 14.5-5.5T600-260q0-9-5.5-14.5T580-280H460q-42 0-71 29t-29 71v20h-88Zm208-480q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z'},
  {id:191, name:'Эквалайзер', price:100, vb:[0,-960,960,960], cat:'iSound',
    svg:'M280-240v-480h80v480h-80ZM440-80v-800h80v800h-80ZM120-400v-160h80v160h-80Zm480 160v-480h80v480h-80Zm160-160v-160h80v160h-80Z'},
  {id:192, name:'Эквалайзер (столбцы)', price:100, vb:[0,-960,960,960], cat:'iSound',
    svg:'M160-160v-320h160v320H160Zm240 0v-640h160v640H400Zm240 0v-440h160v440H640Z'},
  {id:193, name:'Объёмный звук', price:100, vb:[0,-960,960,960], cat:'iSound',
    svg:'M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm198 78q40-40 61-91t21-107q0-56-21-107t-61-91l-56 56q29 29 43.5 65.5T680-480q0 40-14.5 76.5T622-338l56 56Zm-396 0 56-56q-29-29-43.5-65.5T280-480q0-40 14.5-76.5T338-622l-56-56q-40 40-61 91t-21 107q0 56 21 107t61 91ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Z'},
  {id:194, name:'Пространственный звук', price:100, vb:[0,-960,960,960], cat:'iSound',
    svg:'M920-559q-72 0-138-27.5T665-665q-51-51-78.5-117T559-920h80q0 57 21 108t61 91q40 40 91 61.5T920-638v79Zm0-159q-41 0-77.5-15T777-777q-29-29-44-65.5T718-920h79q0 25 9.5 47.5T833-833q17 17 39.5 26t47.5 9v80ZM400-440q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM80-120v-112q0-33 17-62t47-44q51-26 115-44t141-18q77 0 141 18t115 44q30 15 47 44t17 62v112H80Z'},
  {id:195, name:'Мотоцикл', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M160-200q-66 0-113-47T0-360q0-57 36.5-101t93.5-55l-28-24H0v-60h180l100 60 160-60h126l-62-80H400v-80h142l84 108 134-68v120h-92l70 92q15-6 30.5-9t31.5-3q66 0 113 47t47 113q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-27 9.5-52.5T676-460l-20-24-136 204H400l-80-70q-5 63-51 106.5T160-200Zm0-80q33 0 56.5-23.5T240-360q0-33-23.5-56.5T160-440q-33 0-56.5 23.5T80-360q0 33 23.5 56.5T160-280Zm640 0q33 0 56.5-23.5T880-360q0-33-23.5-56.5T800-440q-33 0-56.5 23.5T720-360q0 33 23.5 56.5T800-280Z'},
  {id:196, name:'Электромобиль', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M240-360v40q0 17-11.5 28.5T200-280h-40q-17 0-28.5-11.5T120-320v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-280h-40q-17 0-28.5-11.5T720-320v-40H240Zm-8-360h496l-42-120H274l-42 120Zm68 240q25 0 42.5-17.5T360-540q0-25-17.5-42.5T300-600q-25 0-42.5 17.5T240-540q0 25 17.5 42.5T300-480Zm360 0q25 0 42.5-17.5T720-540q0-25-17.5-42.5T660-600q-25 0-42.5 17.5T600-540q0 25 17.5 42.5T660-480ZM520-40 280-160h160v-80l240 120H520v80Z'},
  {id:197, name:'Заправка для электро', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M240-560h240v-200H240v200Zm-80 440v-640q0-33 23.5-56.5T240-840h240q33 0 56.5 23.5T560-760v280h50q29 0 49.5 20.5T680-410v185q0 17 14 31t31 14q18 0 31.5-14t13.5-31v-375h-10q-17 0-28.5-11.5T720-640v-80h20v-60h40v60h40v-60h40v60h20v80q0 17-11.5 28.5T840-600h-10v375q0 42-30.5 73.5T725-120q-43 0-74-31.5T620-225v-185q0-5-2.5-7.5T610-420h-50v300H160Zm180-80 100-160h-60v-120L280-320h60v120Z'},
  {id:198, name:'Грузовик', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M240-160q-50 0-85-35t-35-85H40v-440q0-33 23.5-56.5T120-800h560v160h120l120 160v200h-80q0 50-35 85t-85 35q-50 0-85-35t-35-85H360q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T280-280q0-17-11.5-28.5T240-320q-17 0-28.5 11.5T200-280q0 17 11.5 28.5T240-240Zm480 0q17 0 28.5-11.5T760-280q0-17-11.5-28.5T720-320q-17 0-28.5 11.5T680-280q0 17 11.5 28.5T720-240Zm-40-200h170l-90-120h-80v120Z'},
  {id:199, name:'Трамвай', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M160-260v-380q0-97 85-127t195-33l30-60H280v-60h400v60H550l-30 60q119 3 199.5 32.5T800-640v380q0 59-40.5 99.5T660-120l60 60v20h-80l-80-80H400l-80 80h-80v-20l60-60q-59 0-99.5-40.5T160-260Zm320 20q25 0 42.5-17.5T540-300q0-25-17.5-42.5T480-360q-25 0-42.5 17.5T420-300q0 25 17.5 42.5T480-240ZM240-480h480v-120H240v120Z'},
  {id:200, name:'Метро', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M80-80v-526q0-85 44-147.5T248-848q54-21 115-26.5t117-5.5q56 0 117 5.5T712-848q80 32 124 94.5T880-606v526H80Zm284-80 60-60h110l60 60h66v-20l-42-42q44-6 73-39.5t29-78.5v-260q0-78-70-99t-170-21q-91 0-165.5 21T240-600v260q0 45 29 78.5t73 39.5l-42 42v20h64Zm-64-280v-160h360v160H300Zm320 140q-17 0-28.5-11.5T580-340q0-17 11.5-28.5T620-380q17 0 28.5 11.5T660-340q0 17-11.5 28.5T620-300Zm-280 0q-17 0-28.5-11.5T300-340q0-17 11.5-28.5T340-380q17 0 28.5 11.5T380-340q0 17-11.5 28.5T340-300Z'},
  {id:201, name:'Велосипед', price:100, vb:[0,-960,960,960], cat:'iVehicles',
    svg:'M200-160q-85 0-142.5-57.5T0-360q0-85 58.5-142.5T200-560q77 0 129.5 46T396-400h26l-72-200h-70v-80h200v80h-44l14 40h192l-58-160H480v-80h104q26 0 46.5 14t29.5 38l68 186h32q83 0 141.5 58.5T960-362q0 84-58 143t-142 59q-72 0-126.5-45T564-320H396q-14 69-68 114.5T200-160Zm0-160h112v-80H200v80Zm308-80h56q5-23 13.5-43t22.5-37H478l30 80Zm212 54 76-28-40-106-74 28 38 106Z'},
  {id:202, name:'Казино', price:60, vb:[0,-960,960,960], cat:'iGames',
    svg:'M300-240q25 0 42.5-17.5T360-300q0-25-17.5-42.5T300-360q-25 0-42.5 17.5T240-300q0 25 17.5 42.5T300-240Zm0-360q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600Zm180 180q25 0 42.5-17.5T540-480q0-25-17.5-42.5T480-540q-25 0-42.5 17.5T420-480q0 25 17.5 42.5T480-420Zm180 180q25 0 42.5-17.5T720-300q0-25-17.5-42.5T660-360q-25 0-42.5 17.5T600-300q0 25 17.5 42.5T660-240Zm0-360q25 0 42.5-17.5T720-660q0-25-17.5-42.5T660-720q-25 0-42.5 17.5T600-660q0 25 17.5 42.5T660-600ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z'},
  {id:203, name:'Пазл', price:60, vb:[0,-960,960,960], cat:'iGames',
    svg:'M352-120H200q-33 0-56.5-23.5T120-200v-152q48 0 84-30.5t36-77.5q0-47-36-77.5T120-568v-152q0-33 23.5-56.5T200-800h160q0-42 29-71t71-29q42 0 71 29t29 71h160q33 0 56.5 23.5T800-720v160q42 0 71 29t29 71q0 42-29 71t-71 29v160q0 33-23.5 56.5T720-120H568q0-50-31.5-85T460-240q-45 0-76.5 35T352-120Z'},
  {id:204, name:'Игровой контроллер', price:60, vb:[0,-960,960,960], cat:'iGames',
    svg:'M160-240q-33 0-56.5-23.5T80-320v-320q0-33 23.5-56.5T160-720h640q33 0 56.5 23.5T880-640v320q0 33-23.5 56.5T800-240H160Zm120-120h80v-80h80v-80h-80v-80h-80v80h-80v80h80v80Zm300 0q25 0 42.5-17.5T640-420q0-25-17.5-42.5T580-480q-25 0-42.5 17.5T520-420q0 25 17.5 42.5T580-360Zm120-120q25 0 42.5-17.5T760-540q0-25-17.5-42.5T700-600q-25 0-42.5 17.5T640-540q0 25 17.5 42.5T700-480Z'},
  {id:205, name:'Игрушки', price:60, vb:[0,-960,960,960], cat:'iGames',
    svg:'M280-160q-45 0-78.5-28.5T162-262q-38-20-60-57t-22-81q0-53 30.5-94.5T192-552l-72-72-12 12q-11 11-28 11t-28-11q-11-11-11-28t11-28l80-80q11-11 28-11t28 11q11 11 11 28t-11 28l-12 12 56 56 32-94q12-37 43.5-59.5T378-800h204q39 0 70.5 22.5T696-718l54 162q57 11 93.5 55T880-400q0 44-22 81t-60 57q-6 45-39.5 73.5T680-160q-38 0-68.5-22T568-240H392q-13 36-43.5 58T280-160Zm16-400h144v-160h-62q-13 0-23 7.5T340-692l-44 132Zm224 0h144l-44-132q-5-13-15-20.5t-23-7.5h-62v160ZM280-240q17 0 28.5-11.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 17 11.5 28.5T280-240Zm400 0q17 0 28.5-11.5T720-280q0-17-11.5-28.5T680-320q-17 0-28.5 11.5T640-280q0 17 11.5 28.5T680-240Z'},
  {id:206, name:'Облако', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Z'},
  {id:207, name:'Облако-загрузка', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M440-160H260q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520v-286l64 62 56-56-160-160-160 160 56 56 64-62v286Z'},
  {id:208, name:'Облако-скачивание', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q23-81 85.5-136T440-797v323l-64-62-56 56 160 160 160-160-56-56-64 62v-323q103 14 171.5 92.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Z'},
  {id:209, name:'Облако-контур', price:60, vb:[0,0,24,24], cat:'iSky',
    svg:'M6.5 20q-2.275 0-3.887-1.575Q1 16.85 1 14.575q0-1.95 1.175-3.475Q3.35 9.575 5.25 9.15q.625-2.3 2.5-3.725Q9.625 4 12 4q2.925 0 4.962 2.037Q19 8.075 19 11q1.725.2 2.863 1.487Q23 13.775 23 15.5q0 1.875-1.312 3.188Q20.375 20 18.5 20Z'},
  {id:210, name:'Облако-готово', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'m414-280 226-226-58-58-169 169-84-84-57 57 142 142ZM260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Z'},
  {id:211, name:'Облако в круге', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M340-320h300q50 0 85-35t35-85q0-50-35-85t-85-35q-8-58-53-99t-101-41q-51 0-92.5 26T332-600q-57 5-94.5 43.5T200-460q0 58 41 99t99 41ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'},
  {id:212, name:'Ночной светильник', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M560-80q-82 0-155-31.5t-127.5-86Q223-252 191.5-325T160-480q0-83 31.5-155.5t86-127Q332-817 405-848.5T560-880q54 0 105 14t95 40q-91 53-145.5 143.5T560-480q0 112 54.5 202.5T760-134q-44 26-95 40T560-80Z'},
  {id:213, name:'Град', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M160-80v-240h120v240H160Zm200 0v-476q-50 17-65 62.5T280-400h-80q0-128 75-204t205-76q100 0 150-49.5T680-880h80q0 88-37.5 157.5T600-624v544h-80v-240h-80v240h-80Zm120-640q-33 0-56.5-23.5T400-800q0-33 23.5-56.5T480-880q33 0 56.5 23.5T560-800q0 33-23.5 56.5T480-720Z'},
  {id:214, name:'Зонт', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M480-80q-12 0-22.5-6.5T442-107L240-717l140 34 60-46v-95q0-40 29-68t71-28q42 0 71 28t29 68v24h-80v-24q0-8-6-13.5t-14-5.5q-8 0-14 5.5t-6 13.5v95l60 46 140-34-202 609q-5 14-15.5 21T480-80Zm40-288 78-238-36 9-42-31v260Zm-80 0v-260l-42 32-37-10 79 238Z'},
  {id:215, name:'Сильный холод', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M800-560q-17 0-28.5-11.5T760-600q0-17 11.5-28.5T800-640q17 0 28.5 11.5T840-600q0 17-11.5 28.5T800-560ZM400-80v-144L296-120l-56-56 160-160v-64h-64L176-240l-56-56 104-104H80v-80h144L120-584l56-56 160 160h64v-64L240-704l56-56 104 104v-144h80v144l104-104 56 56-160 160v64h320v80H656l104 104-56 56-160-160h-64v64l160 160-56 56-104-104v144h-80Zm360-600v-200h80v200h-80Z'},
  {id:216, name:'Воздух', price:60, vb:[0,-960,960,960], cat:'iSky',
    svg:'M460-160q-50 0-85-35t-35-85h80q0 17 11.5 28.5T460-240q17 0 28.5-11.5T500-280q0-17-11.5-28.5T460-320H80v-80h380q50 0 85 35t35 85q0 50-35 85t-85 35ZM80-560v-80h540q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43h-80q0-59 40.5-99.5T620-840q59 0 99.5 40.5T760-700q0 59-40.5 99.5T620-560H80Zm660 320v-80q26 0 43-17t17-43q0-26-17-43t-43-17H80v-80h660q59 0 99.5 40.5T880-380q0 59-40.5 99.5T740-240Z'},
  {id:217, name:'Пейзаж', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'m40-240 240-320 180 240h101L410-520l150-200 360 480H40Z'},
  {id:218, name:'Земледелие', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M240-160q-83 0-141.5-58.5T40-360q0-83 58.5-141.5T240-560q83 0 141.5 58.5T440-360q0 83-58.5 141.5T240-160Zm0-140q-25 0-42.5-17.5T180-360q0-25 17.5-42.5T240-420q25 0 42.5 17.5T300-360q0 25-17.5 42.5T240-300Zm540 140q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41ZM160-600q-17 0-28.5-11.5T120-640q0-17 11.5-28.5T160-680h120q33 0 56.5 23.5T360-600H160Zm80 360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm540 0q25 0 42.5-17.5T840-300q0-25-17.5-42.5T780-360q-25 0-42.5 17.5T720-300q0 25 17.5 42.5T780-240Zm-304-80h126q10-72 62.5-115T783-478q25 0 49.5 7t47.5 21v-190q0-33-23.5-56.5T800-720H548l-42-44 56-56-28-28-142 142 30 28 56-56 42 42v92q0 33-23.5 56.5T440-520h-22q30 33 45.5 74t15.5 86q0 10-.5 20t-2.5 20Z'},
  {id:219, name:'Эко-энергия', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'m433-307 184-164q9-8 5-19t-16-13l-144-14 86-119q3-5 3.5-9.5T548-654q-4-5-10-4.5t-11 4.5L344-490q-9 8-5 19t16 13l144 14-87 119q-3 5-3 9.5t4 8.5q4 4 9.5 4t10.5-4Zm47 147q-56 0-105.5-17.5T284-227l-55 55q-6 6-13.5 9t-15.5 3q-17 0-28.5-11.5T160-200q0-8 3-15.5t9-13.5l55-55q-32-41-49.5-90.5T160-480q0-134 93-227t227-93h320v320q0 134-93 227t-227 93Z'},
  {id:220, name:'Природа-эмблема', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'m720-600-32 28q-14 13-33 13t-33-11q-14-11-19-28t1-36l16-50-34-20q-16-9-22.5-26t-1.5-34q5-17 20-26.5t34-9.5h40l12-38q6-19 20.5-30.5T720-880q17 0 31.5 11.5T772-838l12 38h40q19 0 33.5 9.5T878-764q7 18 0 35t-22 25l-36 20 16 50q6 19 1 36.5T818-570q-15 11-33.5 11T752-572l-32-28Zm0-80q17 0 28.5-11.5T760-720q0-17-11.5-28.5T720-760q-17 0-28.5 11.5T680-720q0 17 11.5 28.5T720-680ZM552-244q23 60-15 112T430-80q-33 0-62.5-17T324-142q-83 12-137.5-42.5T142-324q-30-17-46-46.5T80-438q0-61 55.5-98.5T244-552l62 26q20-31 53-50.5t71-21.5v-82h60v90q37 11 61 34.5t41 65.5h88v60h-82q-2 38-20.5 71T528-306l24 62ZM230-384q32 0 56.5-8t63.5-32l-120-50q-29-12-49.5.5T160-434q0 26 17 38t53 12Zm200 224q25 0 40.5-17.5T478-214l-54-136q-19 32-29.5 64T384-228q0 33 11.5 50.5T430-160Zm66-222q10-10 16-26.5t6-34.5q0-32-21-54t-52-22q-18 0-34 6t-27 17l78 36 34 78Z'},
  {id:221, name:'Переработка', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'m368-592 89-147-59-98q-12-20-34.5-20T329-837l-98 163 137 82Zm387 272-89-148 139-80 64 107q11 17 12 38t-9 39q-10 20-29.5 32T800-320h-45ZM640-40 480-200l160-160v80h190l-58 116q-11 20-30 32t-42 12h-60v80Zm-387-80q-20 0-36.5-10.5T192-158q-8-16-7.5-33.5T194-224l34-56h172v160H253Zm-99-114L89-364q-9-18-8.5-38.5T92-441l16-27-68-41 219-55 55 220-69-42-91 152Zm540-342-219-55 69-41-125-208h141q21 0 39.5 10.5T629-841l52 87 68-42-55 220Z'},
  {id:222, name:'Молекула CO2', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M440-360q-17 0-28.5-11.5T400-400v-160q0-17 11.5-28.5T440-600h120q17 0 28.5 11.5T600-560v160q0 17-11.5 28.5T560-360H440Zm20-60h80v-120h-80v120Zm-300 60q-17 0-28.5-11.5T120-400v-160q0-17 11.5-28.5T160-600h120q17 0 28.5 11.5T320-560v40h-60v-20h-80v120h80v-20h60v40q0 17-11.5 28.5T280-360H160Zm520 120v-100q0-17 11.5-28.5T720-380h80v-40H680v-60h140q17 0 28.5 11.5T860-440v60q0 17-11.5 28.5T820-340h-80v40h120v60H680Z'},
  {id:223, name:'Оползень', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M80-80v-170l160 52 441-147L880-80H80Zm160-202L80-336v-74l160 52 276-92 102 41-378 127Zm500-118 180-80v-160l-180-40-100 80v120l100 80Zm-500-42L80-496v-144h240l103 137-183 61Zm240-198 200-80v-200l-200-40-120 80v160l120 80Z'},
  {id:224, name:'Камин', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M424-282q13 11 27.5 15.5T480-262q29 0 52.5-18.5T560-334q5-47-29-69.5T480-462q-5 14-5 26t3 26q3 17 7 32t1 32q-5 18-22 37t-40 27ZM80-80v-800h800v800H80Zm80-80h80v-80h90q-23-29-36.5-61T280-362q0-46 10-86.5t36.5-78.5q26.5-38 73.5-75.5T520-680q-11 44 9.5 93.5T606-496q33 24 53.5 56.5T680-360q0 35-11 64.5T640-240h80v80h80v-640H160v640Z'},
  {id:225, name:'Ветряк', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M400-40q0-33 23.5-56.5T480-120v-229q9 4 19 6t21 2q42 0 70.5-28.5T619-440v-9l128 31q16 4 29 14t21 24l91 164q15 27 11 57t-26 52q-27 27-64.5 27T744-107L560-291v171q33 0 56.5 23.5T640-40H400Zm-280-80v-80h200v80H120Zm166-170-180-51q-29-8-47.5-32.5T40-429q0-38 26.5-64.5T131-520h330q-19 14-29.5 34.5T421-440q0 23 9 42t25 33l-105 67q-14 8-30.5 10.5T286-290Zm234-90q-25 0-42.5-17.5T460-440q0-25 17.5-42.5T520-500q25 0 42.5 17.5T580-440q0 25-17.5 42.5T520-380Zm92-98q-11-27-35.5-44T520-539q-11 0-21 2t-19 6v-158q0-17 6.5-32t18.5-26l137-128q23-22 53.5-25t56.5 13q32 20 41.5 56.5T783-762L612-478ZM40-600v-80h200v80H40Zm120-160v-80h240v80H160Z'},
  {id:226, name:'Солнечная батарея', price:60, vb:[0,-960,960,960], cat:'iNature',
    svg:'M120-800v-80h120v80H120ZM80-80h360v-160H112L80-80Zm165-507-57-56 85-85 57 56-85 85ZM128-320h312v-160H160l-32 160Zm352-360q-83 0-141.5-58.5T280-880h400q0 83-58.5 141.5T480-680Zm-40 160v-120h80v120h-80Zm80 440h360l-32-160H520v160Zm0-240h312l-32-160H520v160Zm195-267-84-85 56-56 85 84-57 57Zm5-213v-80h120v80H720Z'},
  {id:227, name:'Горные лыжи', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M740-40q-26 0-50.5-4T642-56L80-261l20-57 276 101 69-178-143-149q-27-28-21.5-66.5T320-669l139-80q17-10 34.5-11.5T528-755q17 6 29.5 19t18.5 31l13 43q13 43 42.5 76t70.5 50l21-64 57 18-45 138q-74-12-131-58t-84-114l-101 58 121 138-89 230 124 45 84-257q14 5 28 9t29 7l-85 262 31 11q18 6 37.5 9.5T740-100q26 0 49.5-5t45.5-15l45 45q-32 17-67 26t-73 9Zm-80-660q-33 0-56.5-23.5T580-780q0-33 23.5-56.5T660-860q33 0 56.5 23.5T740-780q0 33-23.5 56.5T660-700Z'},
  {id:228, name:'Сноуборд', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M751-60q-9 0-18.5-1T714-64L209-172q-44-9-76.5-35.5T83-272q-2-4-2-18 3-12 13-19t23-5q7 2 12 6.5t8 10.5q12 25 33.5 43t50.5 24l19 4 140-94-32-140q-4-15-1-30.5t11-29.5l100-160h-94l-76 122-68-42 100-160h228q27 0 43.5 15t22.5 28l21 48q20 48 64.5 78.5T800-560v80q-70 0-128-33.5T579-602l-72 115 133 107 40 248 46 9q6 2 12.5 2.5t12.5.5q24 0 43-8t36-22q5-5 26-6 13 2 19.5 13t4.5 22q-1 5-3.5 9t-6.5 8q-25 22-56 33t-63 11Zm-155-90-30-186-114-81 18 133-121 81 247 53Zm44-610q-33 0-56.5-23.5T560-840q0-33 23.5-56.5T640-920q33 0 56.5 23.5T720-840q0 33-23.5 56.5T640-760Z'},
  {id:229, name:'Снегоступы', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M340-40q-18 0-43.5-19T255-98l-95-122 47-38 46 59 115-81 64-325-72 28v137h-80v-189l165-69q32-14 47-18t28-4q21 0 38.5 11t29.5 29l40 63q26 41 70.5 69T800-520v80q-66 0-123.5-28T580-541l-24 120 84 80v241q15-1 28.5-5t25.5-11q4-2 7.5-3t7.5-1q14 0 22.5 9.5T740-90q0 8-3.5 14.5T725-64q-20 12-42.5 18T635-40H480v-60h80v-181l-84-80-36 129-137 97 3 4q9 12 20.5 20T352-98q9 5 14 10.5t5 16.5q0 13-9 22t-22 9Zm240-700q-33 0-56.5-23.5T500-820q0-33 23.5-56.5T580-900q33 0 56.5 23.5T660-820q0 33-23.5 56.5T580-740Z'},
  {id:230, name:'Санки', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M765-40q-19 0-31.5-2T710-48L40-266l18-57 158 51 18-57-157-51 19-57 64 21v-164l219-94q8-4 15.5-5t16.5-1q34 0 55 29.5t10 64.5l-42 130 86-14q27-5 50.5 8t35.5 38l83 180 77 25-18 57-133-43-19 57 133 43q8 2 16.5 3.5T765-100q36 0 65.5-29.5T860-195q0-34-16.5-60T790-295l19-57q52 17 81.5 59t29.5 98q0 62-46.5 108.5T765-40ZM539-166l19-58-267-86-18 57 266 87Zm46-112-47-102-159 35 206 67Zm-305-99q-6-13-7.5-27.5T276-433l41-127-77 33v137l40 13Zm200-323q-33 0-56.5-23.5T400-780q0-33 23.5-56.5T480-860q33 0 56.5 23.5T560-780q0 33-23.5 56.5T480-700Z'},
  {id:231, name:'Снегоход', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M320-160H80q-38 0-59-25T0-240q0-20 10-39t32-31l140-76L0-440l80-160 360 40 122-91-32-29h-90v-80h122l285 265q19 17 26 33.5t7 31.5q0 43-33 76.5T747-320l86 80h7q17 0 28.5-11.5T880-280h80q0 50-35 85t-85 35H600v-80h117l-80-80H480q0 66-47 113t-113 47ZM80-240h240q33 0 56.5-23.5T400-320l-110-33L80-240Z'},
  {id:232, name:'Параплан', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M480-280q-33 0-56.5-23.5T400-360q0-33 23.5-56.5T480-440q33 0 56.5 23.5T560-360q0 33-23.5 56.5T480-280ZM360 0v-144q-85-29-122.5-98.5T200-400h80q0 101 51 150.5T480-200q98 0 149-49.5T680-400h80q0 88-37.5 157.5T600-144V0H360ZM200-440l-80-188q-5 3-17 10.5T80-610q-17 0-28.5-11.5T40-650v-140q0-71 129-120.5T480-960q182 0 311 49.5T920-790v140q0 17-11.5 28.5T880-610q-11 0-23-7.5T840-628l-80 188h-80l-60-251q-33-5-68-7t-72-2q-37 0-72 2t-68 7l-60 251h-80Zm35-70 41-171q-28 6-53 13t-48 16l60 142Zm490-1 60-141q-23-9-48-16t-53-13l41 170Z'},
  {id:233, name:'Кайтсёрфинг', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M80-40v-80h40q32 0 62.5-10t57.5-30q26 18 55 28t60 11q33 1 65-9t60-30q26 19 57 29t63 10q32 0 62-9.5t58-29.5q28 20 58.5 30t61.5 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-58.5 22.5T600-40q-31 0-61-7.5T480-70q-29 16-61 23.5T355-40q-30-1-59-8.5T240-70q-29 15-58.5 22.5T120-40H80Zm280-160q-26 0-51.5-10T260-240q14-11 29-23t31-23l-62-119q-9-17-13.5-36t-4.5-39v-160q0-33 23.5-56.5T320-720h120q40 0 76.5-15t65.5-43l56 56q-41 40-92 61t-106 21h-56v140h112l68 75q65-27 115.5-41t86.5-14q35 0 54.5 13.5T840-429q0 39-54 98.5T638-206q-9 3-18.5 4.5T600-200q-32 0-64-15.5T480-260q-24 29-55.5 44.5T360-200Zm33-136q16-10 46-27t49-26l-28-31-100 4 33 80Zm-73-424q-33 0-56.5-23.5T240-840q0-33 23.5-56.5T320-920q33 0 56.5 23.5T400-840q0 33-23.5 56.5T320-760Zm342-20-42-42 98-98h84L662-780Z'},
  {id:234, name:'Гребля', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M720 0 600-120v-60L316-464q-9 2-18 3t-18 1v-88q50 2 102-21.5t84-58.5l56-62q13-15 30.5-22.5T590-720q38 0 64 26t26 64v230q0 26-9.5 47.5T644-314L500-456v-92q-20 17-43 31t-49 25l252 252h60l120 120L720 0ZM220-140l-60-60 180-180 100 100h-80L220-140Zm380-620q-33 0-56.5-23.5T520-840q0-33 23.5-56.5T600-920q33 0 56.5 23.5T680-840q0 33-23.5 56.5T600-760Z'},
  {id:235, name:'Бассейн', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M80-120v-80q38 0 57-20t75-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 75 20t57 20v80q-59 0-77.5-20T748-160q-36 0-57 20t-77 20q-56 0-77-20t-57-20q-36 0-57 20t-77 20q-56 0-77-20t-57-20q-36 0-54.5 20T80-120Zm0-180v-80q38 0 57-20t75-20q56 0 77.5 20t56.5 20q36 0 57-20t77-20q56 0 77 20t57 20q36 0 57-20t77-20q56 0 75 20t57 20v80q-59 0-77.5-20T748-340q-36 0-55.5 20T614-300q-57 0-77.5-20T480-340q-38 0-56.5 20T346-300q-59 0-78.5-20T212-340q-36 0-54.5 20T80-300Zm196-204 133-133-40-40q-33-33-70-48t-91-15v-100q75 0 124 16.5t96 63.5l256 256q-17 11-33 17.5t-37 6.5q-36 0-57-20t-77-20q-56 0-77 20t-57 20q-21 0-37-6.5T276-504Zm392-336q42 0 71 29.5t29 70.5q0 42-29 71t-71 29q-42 0-71-29t-29-71q0-41 29-70.5t71-29.5Z'},
  {id:236, name:'Дом на воде', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M80-200v-80q38 0 56-20t77-20q58 0 78 20t55 20q38 0 56.5-20t77.5-20q59 0 77.5 20t56.5 20q35 0 55-20t78-20q59 0 77 20t56 20v80q-57 0-78-20t-56-20q-36 0-56 20t-77 20q-59 0-77-20t-56-20q-38 0-56 20t-77 20q-57 0-77-20t-56-20q-35 0-56 20t-78 20Zm150-160q-24 0-46-9t-39-26l-55-55 56-56 55 54q6 6 13.5 9t15.5 3h50v-135l-53 39-47-64 300-220 300 220-47 65-53-39v134h50q8 0 15.5-3t13.5-9l55-54 56 56-55 55q-17 17-39 26t-46 9H230Zm210-80h80v-80h-80v80Z'},
  {id:237, name:'Указатель', price:180, vb:[0,-960,960,960], cat:'iAdventure',
    svg:'M440-80v-160H240L120-360l120-120h200v-80H160v-240h280v-80h80v80h200l120 120-120 120H520v80h280v240H520v160h-80Z'},
  {id:238, name:'Шале', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M700-520v-48l-30 30-28-28 58-58v-36h-36l-58 58-28-28 30-30h-48v-40h48l-30-30 28-29 58 58h36v-35l-58-58 28-28 30 30v-48h40v48l30-30 28 28-58 58v36h36l58-58 28 28-30 30h48v40h-48l30 30-28 28-58-58h-36v36l58 58-28 28-30-30v48h-40ZM200-160v-188l-44 44-56-56 300-300 300 300-56 57-44-44v187H440v-200h-80v200H200Z'},
  {id:239, name:'Крепость', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M40-120v-160l80-80v-240l-80-80v-160h80v80h80v-80h80v80h80v-80h80v160l-80 80v40h240v-40l-80-80v-160h80v80h80v-80h80v80h80v-80h80v160l-80 80v240l80 80v160H560v-120q0-33-23.5-56.5T480-320q-33 0-56.5 23.5T400-240v120H40Z'},
  {id:240, name:'Многоэтажка', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z'},
  {id:241, name:'Здание-офис', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M80-120v-720h400v160h400v560H80Zm80-80h240v-80H160v80Zm0-160h240v-80H160v80Zm0-160h240v-80H160v80Zm0-160h240v-80H160v80Zm320 480h320v-400H480v400Zm80-240v-80h160v80H560Zm0 160v-80h160v80H560Z'},
  {id:242, name:'Завод', price:60, vb:[0,-960,960,960], cat:'iHomes',
    svg:'M80-80v-481l280-119v80l200-80v120h320v480H80Zm360-160h80v-160h-80v160Zm-160 0h80v-160h-80v160Zm320 0h80v-160h-80v160Zm272-380H687l34-260h119l32 260Z'},
  {id:243, name:'Андроид', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M40-240q9-107 65.5-197T256-580l-74-128q-6-9-3-19t13-15q8-5 18-2t16 12l74 128q86-36 180-36t180 36l74-128q6-9 16-12t18 2q10 5 13 15t-3 19l-74 128q94 53 150.5 143T920-240H40Zm240-110q21 0 35.5-14.5T330-400q0-21-14.5-35.5T280-450q-21 0-35.5 14.5T230-400q0 21 14.5 35.5T280-350Zm400 0q21 0 35.5-14.5T730-400q0-21-14.5-35.5T680-450q-21 0-35.5 14.5T630-400q0 21 14.5 35.5T680-350Z'},
  {id:244, name:'Хранилище', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M120-160v-160h720v160H120Zm80-40h80v-80h-80v80Zm-80-440v-160h720v160H120Zm80-40h80v-80h-80v80Zm-80 280v-160h720v160H120Zm80-40h80v-80h-80v80Z'},
  {id:245, name:'Фонарик', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M240-760v-120h480v120H240Zm240 420q25 0 42.5-17.5T540-400q0-25-17.5-42.5T480-460q-25 0-42.5 17.5T420-400q0 25 17.5 42.5T480-340ZM320-80v-440l-80-120v-40h480v40l-80 120v440H320Z'},
  {id:246, name:'Пульс-монитор', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M160-160q-33 0-56.5-23.5T80-240v-200h215l69 138q5 11 15 16.5t21 5.5q11 0 21-5.5t15-16.5l124-248 44 88q5 11 15 16.5t21 5.5h240v200q0 33-23.5 56.5T800-160H160ZM80-520v-200q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v200H665l-69-138q-5-11-15-15.5t-21-4.5q-11 0-21 4.5T524-658L400-410l-44-88q-5-11-15-16.5t-21-5.5H80Z'},
  {id:247, name:'Бесконечность (кольца)', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M220-260q-92 0-156-64T0-480q0-92 64-156t156-64q37 0 71 13t61 37l68 62-60 54-62-56q-16-14-36-22t-42-8q-58 0-99 41t-41 99q0 58 41 99t99 41q22 0 42-8t36-22l310-280q27-24 61-37t71-13q92 0 156 64t64 156q0 92-64 156t-156 64q-37 0-71-13t-61-37l-68-62 60-54 62 56q16 14 36 22t42 8q58 0 99-41t41-99q0-58-41-99t-99-41q-22 0-42 8t-36 22L352-310q-27 24-61 37t-71 13Z'},
  {id:248, name:'Радио', price:180, vb:[0,-960,960,960], cat:'iTech',
    svg:'M160-80q-33 0-56.5-23.5T80-160v-534l556-226 26 66-330 134h468q33 0 56.5 23.5T880-640v480q0 33-23.5 56.5T800-80H160Zm160-120q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29ZM160-520h480v-80h80v80h80v-120H160v120Z'},
  {id:249, name:'Бейдж', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M160-80q-33 0-56.5-23.5T80-160v-440q0-33 23.5-56.5T160-680h200v-120q0-33 23.5-56.5T440-880h80q33 0 56.5 23.5T600-800v120h200q33 0 56.5 23.5T880-600v440q0 33-23.5 56.5T800-80H160Zm80-160h240v-18q0-17-9.5-31.5T444-312q-20-9-40.5-13.5T360-330q-23 0-43.5 4.5T276-312q-17 8-26.5 22.5T240-258v18Zm320-60h160v-60H560v60Zm-200-60q25 0 42.5-17.5T420-420q0-25-17.5-42.5T360-480q-25 0-42.5 17.5T300-420q0 25 17.5 42.5T360-360Zm200-60h160v-60H560v60ZM440-600h80v-200h-80v200Z'},
  {id:250, name:'Аналитика-вспышка', price:300, vb:[0,0,24,24], cat:'iStatus',
    svg:'M3 20q-.825 0-1.412-.587Q1 18.825 1 18q0-.825.588-1.413Q2.175 16 3 16h.263q.112 0 .237.05l4.55-4.55Q8 11.375 8 11.262V11q0-.825.588-1.413Q9.175 9 10 9t1.413.587Q12 10.175 12 11q0 .05-.05.5l2.55 2.55q.125-.05.238-.05h.524q.113 0 .238.05l3.55-3.55q-.05-.125-.05-.238V10q0-.825.587-1.413Q20.175 8 21 8q.825 0 1.413.587Q23 9.175 23 10q0 .825-.587 1.412Q21.825 12 21 12h-.262q-.113 0-.238-.05l-3.55 3.55q.05.125.05.238V16q0 .825-.587 1.413Q15.825 18 15 18q-.825 0-1.412-.587Q13 16.825 13 16v-.262q0-.113.05-.238l-2.55-2.55q-.125.05-.238.05H10q-.05 0-.5-.05L4.95 17.5q.05.125.05.238V18q0 .825-.588 1.413Q3.825 20 3 20ZM4 9.975l-.625-1.35L2.025 8l1.35-.625L4 6.025l.625 1.35L5.975 8l-1.35.625ZM15 9l-.95-2.05L12 6l2.05-.95L15 3l.95 2.05L18 6l-2.05.95Z'},
  {id:251, name:'Оповещение-рупор', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M720-440v-80h160v80H720Zm48 280-128-96 48-64 128 96-48 64Zm-80-480-48-64 128-96 48 64-128 96ZM200-200v-160h-40q-33 0-56.5-23.5T80-440v-80q0-33 23.5-56.5T160-600h160l200-120v480L320-360h-40v160h-80Zm360-146v-268q27 24 43.5 58.5T620-480q0 41-16.5 75.5T560-346Z'},
  {id:252, name:'Закладка', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Z'},
  {id:253, name:'Новинка-звезда', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m344-60-76-128-144-32 14-148-98-112 98-112-14-148 144-32 76-128 136 58 136-58 76 128 144 32-14 148 98 112-98 112 14 148-144 32-76 128-136-58-136 58Zm94-278 226-226-56-58-170 170-86-84-56 56 142 142Z'},
  {id:254, name:'Опасно', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm36-190 114-114 114 114 56-56-114-114 114-114-56-56-114 114-114-114-56 56 114 114-114 114 56 56Z'},
  {id:255, name:'Щит-политика', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 63-16.5 122.5T736-280L618-398q11-19 16.5-39.5T640-480q0-66-47-113t-113-47q-66 0-113 47t-47 113q0 66 47 113t113 47q21 0 41.5-5.5T560-342l129 128q-42 49-94.5 84T480-80Zm0-320q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Z'},
  {id:256, name:'Подсказка приватности', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Z'},
  {id:257, name:'Ярлык', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'m240-160 40-160H120l20-80h160l40-160H180l20-80h160l40-160h80l-40 160h160l40-160h80l-40 160h160l-20 80H660l-40 160h160l-20 80H600l-40 160h-80l40-160H360l-40 160h-80Zm140-240h160l40-160H420l-40 160Z'},
  {id:258, name:'Токен', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M364-590 162-703l318-177 318 177-202 113q-23-24-53-37t-63-13q-33 0-63 13t-53 37Zm76 488L120-280v-355l205 115q-3 10-4 19.5t-1 20.5q0 55 33 98t87 57v223Zm40-298q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm40 298v-223q54-14 87-57t33-98q0-11-1-20.5t-4-19.5l205-115v355L520-102Z'},
  {id:259, name:'Улучшение камеры', price:300, vb:[0,0,24,24], cat:'iStatus',
    svg:'M12 17.5q1.875 0 3.188-1.312Q16.5 14.875 16.5 13q0-1.875-1.312-3.188Q13.875 8.5 12 8.5q-1.875 0-3.188 1.312Q7.5 11.125 7.5 13q0 1.875 1.312 3.188Q10.125 17.5 12 17.5Zm0-1-1.1-2.4L8.5 13l2.4-1.1L12 9.5l1.1 2.4 2.4 1.1-2.4 1.1ZM4 21q-.825 0-1.412-.587Q2 19.825 2 19V7q0-.825.588-1.412Q3.175 5 4 5h3.15L9 3h6l1.85 2H20q.825 0 1.413.588Q22 6.175 22 7v12q0 .825-.587 1.413Q20.825 21 20 21Z'},
  {id:260, name:'Сигнал SOS', price:300, vb:[0,-960,960,960], cat:'iStatus',
    svg:'M420-280q-33 0-56.5-23.5T340-360v-240q0-33 23.5-56.5T420-680h120q33 0 56.5 23.5T620-600v240q0 33-23.5 56.5T540-280H420Zm-380 0v-80h160v-80h-80q-33 0-56.5-23.5T40-520v-80q0-33 23.5-56.5T120-680h160v80H120v80h80q33 0 56.5 23.5T280-440v80q0 33-23.5 56.5T200-280H40Zm640 0v-80h160v-80h-80q-33 0-56.5-23.5T680-520v-80q0-33 23.5-56.5T760-680h160v80H760v80h80q33 0 56.5 23.5T920-440v80q0 33-23.5 56.5T840-280H680Zm-260-80h120v-240H420v240Z'},
  {id:261, name:'Багаж', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'M280-120q-33 0-56.5-23.5T200-200v-440q0-33 23.5-56.5T280-720h80v-80q0-33 23.5-56.5T440-880h80q33 0 56.5 23.5T600-800v80h80q33 0 56.5 23.5T760-640v440q0 33-23.5 56.5T680-120q0 17-11.5 28.5T640-80q-17 0-28.5-11.5T600-120H360q0 17-11.5 28.5T320-80q-17 0-28.5-11.5T280-120Zm80-120h80v-360h-80v360Zm160 0h80v-360h-80v360Zm-80-480h80v-80h-80v80Z'},
  {id:262, name:'Авиабилет', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'m354-334 356-94q15-4 22.5-18.5T736-476q-4-15-17.5-22.5T690-502l-98 26-160-150-56 14 96 168-96 24-50-38-38 10 66 114Zm446 174H160q-33 0-56.5-23.5T80-240v-160q33 0 56.5-23.5T160-480q0-33-23.5-56.5T80-560v-160q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160Z'},
  {id:263, name:'Колесо аттракциона', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'m233-80 54-122q-14-11-27-21.5T235-246q-8 3-15.5 4.5T203-240q-33 0-56.5-23.5T123-320q0-20 8.5-36.5T155-384q-8-23-11-46.5t-3-49.5q0-26 3-49.5t11-46.5q-15-11-23.5-27.5T123-640q0-33 23.5-56.5T203-720q9 0 16.5 1.5T235-714q33-36 75.5-60t90.5-36q5-30 27.5-50t52.5-20q30 0 52.5 20.5T561-810q48 12 90.5 35.5T727-716q8-3 15-4.5t15-1.5q33 0 56.5 23.5T837-642q0 20-8 35.5T807-580q8 24 11 49t3 51q0 26-3 50.5T807-382q14 11 22 26.5t8 35.5q0 33-23.5 56.5T757-240q-8 0-15-1.5t-15-4.5q-12 12-24.5 23.5T675-200l52 120h-74l-38-88q-14 6-27 10.5t-27 7.5q-5 29-27.5 49.5T481-80q-30 0-52.5-20T401-150q-15-3-28.5-7.5T345-168l-38 88h-74Zm76-174 62-140q-14-18-22-40t-8-46q0-57 41.5-98.5T481-620q57 0 98.5 41.5T621-480q0 24-8.5 47T589-392l62 138q9-8 17.5-14.5T685-284q-5-8-6.5-17.5T677-320q0-32 22-55t54-25q6-20 9-39.5t3-40.5q0-21-3-41.5t-9-40.5q-32-2-54-25t-22-55q0-9 2.5-17.5T685-676q-29-29-64-49t-74-31q-11 17-28 26.5t-38 9.5q-21 0-38-9.5T415-756q-41 11-76 31.5T275-674q3 8 5.5 16.5T283-640q0 32-21 54.5T209-560q-6 20-9 39.5t-3 40.5q0 21 3 40.5t9 39.5q32 2 53 25t21 55q0 9-1.5 17.5T275-286q8 9 16.5 16.5T309-254Zm60 34q11 5 22.5 9t23.5 7q11-17 28-26.5t38-9.5q21 0 38 9.5t28 26.5q12-3 22.5-7t21.5-9l-58-130q-12 5-25 7.5t-27 2.5q-15 0-28.5-3t-25.5-9l-58 132Z'},
  {id:264, name:'Панорама', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm80-160h480L570-520 450-360l-90-120-120 160Z'},
  {id:265, name:'Театральные маски', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'M480-240q-38 0-73.5-10.5T341-281q-44-3-90-19t-84-53q-38-37-62.5-97T80-600v-20q0-42 29-71t71-29q39 0 67.5 27t31.5 65q28-8 50-20t45-23q23-12 48-20.5t58-8.5q34 0 58.5 8.5T586-671q22 11 44.5 23t50.5 20q3-39 31.5-65.5T780-720q42 0 71 29t29 71v20q0 90-24.5 150T793-353q-38 37-84 53t-90 19q-30 20-65.5 30.5T480-240ZM260-361q-19-30-29.5-65.5T220-500v-120q0-17-11.5-28.5T180-660q-17 0-28.5 11.5T140-620v20q0 110 37 164t83 75Zm100-149q22-6 38-14.5t30-16.5q14-8 25.5-13.5T480-560q15 0 26.5 5.5T532-541q14 8 29.5 16.5T600-510v-42q-15-5-26-11l-22-12q-16-10-32.5-17.5T480-600q-23 0-39.5 7.5T407-575l-22 12q-11 6-25 11v42Zm340 149q46-21 83-75t37-164v-20q0-17-11.5-28.5T780-660q-17 0-28.5 11.5T740-620v120q0 38-10 73.5T700-361Z'},
  {id:266, name:'Гриль на природе', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'M640-320q50 0 85 35t35 85q0 50-35 85t-85 35q-38 0-68.5-22T528-160H274l-40 62q-9 14-25.5 17.5T178-86q-14-9-17.5-25.5T166-142l158-242q-72-33-118-101.5T160-640h560q0 86-46 154.5T556-384l23 36q-21 10-34.5 20T515-300l-40-62q-8 2-17 2h-36q-9 0-17-2l-79 122h202q13-36 43.5-58t68.5-22Zm0 160q17 0 28.5-11.5T680-200q0-17-11.5-28.5T640-240q-17 0-28.5 11.5T600-200q0 17 11.5 28.5T640-160ZM336-680q5-29-1.5-49T307-775q-20-26-26.5-49.5T279-880h40q-5 29 1.5 48.5T348-786q21 26 27 49.5t1 56.5h-40Zm100 0q5-29-1-49t-27-46q-21-25-27.5-48.5T379-880h40q-5 29 1.5 48.5T448-786q20 25 26.5 48.5T476-680h-40Zm100 0q5-29-1-49t-27-46q-21-25-27.5-48.5T479-880h40q-5 29 1.5 48.5T548-786q20 25 26.5 48.5T576-680h-40Z'},
  {id:267, name:'Торт', price:100, vb:[0,-960,960,960], cat:'iTravel',
    svg:'M160-80q-17 0-28.5-11.5T120-120v-160q0-33 23.5-56.5T200-360h560q33 0 56.5 23.5T840-280v160q0 17-11.5 28.5T800-80H160Zm40-360v-120q0-33 23.5-56.5T280-640h160v-58q-18-12-29-29t-11-41q0-15 6-29.5t18-26.5l56-56 56 56q12 12 18 26.5t6 29.5q0 24-11 41t-29 29v58h160q33 0 56.5 23.5T760-560v120H200Z'},
];
const ICONS_BY_ID = new Map(ICONS.map(d=>[d.id,d])); // см. DECALS_BY_ID выше — тот же приём и то же обоснование
/* 29.08.2026 «Вспышка при старте» — третья независимая категория тюнинга (после Декали и
   Иконок), опять свой слот (S.launchFx/ownedLaunchFx — не S.flash, см. ниже), не пересекается с decal/icon. Рисуется
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
  {id:1, name:'Кольцо', price:0, style:'ring'}, // 29.08.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
  {id:2, name:'Звёздный всплеск', price:0, style:'star'}, // 29.08.2026: бесплатна — см. ANGAR_FREEBIE (ui.js); узор переделан 04.09.2026, цена не менялась
  {id:3, name:'Всплеск частиц', price:500, style:'particles'},
  {id:6, name:'Вихрь', price:500, style:'spiral'}, // 04.09.2026: было 650 — простой тир при переоценке всего каталога
  // 04.09.2026 (владелец, живое устройство): id 8/11/12/18 (sphere/comet/saturn/wings)
  // убраны целиком — не нравятся, не «каркас на доработку», а совсем не то. Осиротевший
  // FLASHES_BY_ID.get(id) у уже владеющих игроков вернёт undefined — все места чтения уже
  // защищены `if(fl && fl.style...)` (см. renderFlashPattern/angarShip), просто не рисуют
  // ничего, не падают. Дыры в номерах — уже была такая же (3→6) до этой правки, ничего
  // нового не переизобретаем.
  {id:13, name:'Разлёт', price:1200, style:'shards'}, // 04.09.2026: было «Осколки», 500 — переделан (реальное вращение при разлёте), вау-тир
  {id:14, name:'Галактика', price:700, style:'galaxy'}, // 04.09.2026: было 650
  {id:15, name:'Снежинка', price:500, style:'snowflake'},
  {id:16, name:'Цветок', price:1200, style:'flower'}, // 04.09.2026: было 500 — переделан (тоньше, обводка вместо заливки), вау-тир
  {id:17, name:'Корона', price:1200, style:'corona'}, // 04.09.2026: было 650 — переделана (кольцо+гало вместо одного пятна), вау-тир
  {id:19, name:'Соты', price:500, style:'honeycomb'}, // 04.09.2026: было 650 — простой тир при переоценке всего каталога
  {id:20, name:"Орбита", price:1500, style:"orbit"},
  {id:21, name:"Квадраты", price:1500, style:"squares"},
  {id:22, name:"Двойной маятник", price:1500, style:"doublePendulum"},
  {id:23, name:"Кристалл", price:1500, style:"crystal"},
  {id:24, name:"Маятник", price:1200, style:"pendulum"},
  {id:25, name:"Гироскоп", price:1200, style:"gyro"},
  {id:26, name:"Лиссажу", price:1200, style:"lissajous"},
  {id:27, name:"Пульсар", price:1200, style:"pulsar"},
  {id:28, name:"Метеоры", price:1200, style:"meteors"},
  {id:29, name:"Маятник Ньютона", price:1200, style:"cradle"},
  {id:30, name:"Спираль", price:900, style:"swirl"},
  {id:31, name:"Веер", price:900, style:"fan"},
  {id:32, name:"Маяк", price:900, style:"beacon"},
  {id:33, name:"Оригами", price:900, style:"origami"},
  {id:34, name:"Созвездие", price:900, style:"constellation"},
  {id:35, name:"Компас", price:900, style:"compass"},
  {id:36, name:"Восьмёрка", price:900, style:"figure8"},
  {id:37, name:"Затмение", price:900, style:"eclipse"},
  {id:38, name:"Шестерня", price:900, style:"gear"},
  {id:39, name:"Иней", price:900, style:"frost"},
  {id:40, name:"Сеть", price:900, style:"web"},
  {id:41, name:"Турбина", price:900, style:"turbine"},
  {id:42, name:"Молекула", price:900, style:"molecule"},
  {id:43, name:"Разряд", price:700, style:"crack"},
  {id:44, name:"Рой", price:700, style:"swarm"},
  {id:45, name:"Магнитное поле", price:700, style:"field"},
  {id:46, name:"Интерференция", price:700, style:"interference"},
  {id:47, name:"Куб", price:700, style:"cube"},
  {id:48, name:"Перья", price:700, style:"feathers"},
  {id:49, name:"Морская звезда", price:700, style:"starfish"},
  {id:50, name:"Рассвет", price:700, style:"sunrise"},
  {id:51, name:"Пиксели", price:700, style:"pixels"},
  {id:52, name:"Сверхновая", price:700, style:"supernova"},
  {id:53, name:"Стрелка", price:700, style:"needle"},
  {id:54, name:"Блик", price:700, style:"flare"},
  {id:55, name:"Часы", price:700, style:"clock"},
  {id:56, name:"Скан-линия", price:500, style:"scanline"},
  {id:57, name:"Штрихкод", price:500, style:"barcode"},
  {id:58, name:"Фейерверк", price:500, style:"firework"},
  {id:59, name:"Струна", price:500, style:"string"},
  /* 05.09.2026 «Живые вспышки»: шесть НОВЫХ отдельных пунктов (не один совмещённый товар —
     первая версия плана была неверной, поправлено владельцем). Каждый реагирует на настоящие
     данные игрока/календаря, не только рисует один и тот же узор. Названия/style нарочно не
     «Метеоры»/«Затмение»/«Созвездие» — те id28/37/34 уже заняты обычными нереагирующими
     узорами, дублировать имя нельзя. Цены — по существующей шкале каталога, подтверждены
     владельцем построчно (не выдуманы). */
  {id:60, name:"Звездопад", price:1200, style:"starfall"}, // особая версия — в день пика настоящего метеорного потока (проверенные даты, см. METEOR_SHOWERS ниже)
  {id:61, name:"Веха пути", price:1500, style:"milestone"}, // золотой залп ОДИН раз — когда пожизненный налёт (Stats.totalDist) впервые пересекает круглые 100 км
  {id:62, name:"Небесное затмение", price:1200, style:"realEclipse"}, // особая версия — в день настоящего затмения (проверенные даты, см. REAL_ECLIPSES ниже)
  {id:63, name:"С возвращением", price:900, style:"comeback"}, // тёплая особая версия — если не заходил 7+ дней подряд
  {id:64, name:"Созвездие наград", price:700, style:"achConstellation"}, // всегда честно по числу открытых достижений (ACH из ach.js)
  {id:65, name:"Знак дня", price:500, style:"daysign"}, // число колец — от сегодняшнего общего сида (dailyRNG, тот же что у Трассы дня)
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
  shield:0, magnet:0, slowmo:0, dash:0, time:0, flash:0, shake:0, timeScale:1, // v1.40.0 «Шесть жестов»: классика + Таран (dash) + Сверхновая; time — часы полёта для лотереи
  mode:'classic', hits:0, bonuses:0, nearMiss:0, everDash:0, everNova:0, // v1.42.0 «Пять дисциплин»: режим забега + счётчики паспорта (v1.70.0: Пакт и «Без ударов» удалены)
    // 05.09.2026: nearMiss — счётчик ЭТОГО забега (сброс на взлёте), отдельно от Stats.nearMiss
    // (тот пожизненный, никогда не обнуляется) — паспорт полёта («Подробности полёта») хочет
    // именно «сколько было впритык В ЭТОМ полёте», как у dist/time/starsCollected рядом.
  dying:0, dyingT:0, pausing:0, // «Склейка»: slow-mo занавес смерти / плавная остановка паузы
  smooth:1, // Smooth Flight: плавность пилотирования 0.5..1.0 → финальный множитель 0.75..1.0
  hueShift:0, skin:0, ownedSkins:[0],
  decal:0, ownedDecals:[0,1,2], // 28.08.2026 «Тюнинг, шаг 1»: та же пара, что у skin/ownedSkins, отдельная независимая категория. 29.08.2026: id1,2 сразу во владении бесплатно — см. ANGAR_FREEBIE в ui.js
  icon:0, ownedIcons:[0,1,2], // 29.08.2026 «правая сторона, отдельная категория»: та же пара, что у decal/ownedDecals, но свой слот — носится одновременно с decal, не вместо. id1,2 бесплатны — см. ANGAR_FREEBIE
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
function baseTimeScale(slowmoOn, dying, pausing, a11ySpeed){
  let ts = slowmoOn ? .45 : 1;
  if (dying) ts=Math.min(ts,.12);
  if (pausing) ts=Math.min(ts,.05);
  ts=Math.min(ts, a11ySpeed);
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
  if (!forceKind && S.mission>=8 && obstacles.length<MAXOB-1 && mapRand(0,1)<.05){
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
  const kinds=['shield','magnet','slowmo','life','dash','nova']; // v1.40.0 «Шесть жестов»: классика + Таран + Сверхновая
  const lifeCap=(S.mode==='custom')?(S.customLv||3):3; // v1.70.0: потолок жизней — у своей трассы он авторский, иначе бонус ломал бы «Ад на одну жизнь»
  const weights=[3,3,2,1,1,1]; // фиксированный диапазон: состояние игрока не сдвигает весь seed-поток
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
function fullRisk(){ return S.slowmo<=0 && S.dash<=0 && S.shield<=0; }

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
  let ts = baseTimeScale(S.slowmo>0, S.dying, S.pausing, A11Y_SPEED); // v1.476.0: та же цепочка потолков, что раньше жила прямо здесь — вынесена, чтобы её можно было проверить стражем отдельно от всего update()
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
  if (starT<=0){ starT = withTrack('st', function(){ spawnStar(); return mapRand(.8,1.5); }); } // честный базовый темп (эталон v1.10.0)
  powT -= trackDt;
  if (powT<=0){ powT = withTrack('pw', function(){
    if (!(S.mode==='custom' && S.customB===0) && S.mode!=='ironman') spawnPowerup(); // 05.09.2026: Ironman — 0 бонусов, часть цены за ×4 очков
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
      if (runMode!=='theater' && !o.passed && o.y>plane.y){ // ворота пролетели — был ли самолётик в проходе (v1.94.0: в театре касса молчит)
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
    const sk=SKINS[S.skin]||SKINS[0];
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
  else if (S.mode==='daily1cc'||S.mode==='daily'){ // Трасса дня: метка ритуала на табло — это небо сегодня одно на всех (v1.47.0); 05.09.2026: 'daily' последним — страж 122 ищет `S.mode==='daily'){` регуляркой
    // v1.284.3: подпись общего события берётся общим временем — trackDayKey (UTC), тем же,
    // из которого шьётся сама трасса. Здесь стоял todayKey() — личная дата: в UTC+3 вечером
    // игрок видел завтрашнее число при сегодняшней трассе. Закон №17. Страж 122.
    const elMH=elModeHud, tk=trackDayKey(); if (elMH && !elMH._t){ elMH._t=1;
      elMH.textContent=(S.mode==='daily1cc'?'1CC':L.modeDaily)+' · '+tk.slice(8)+'.'+tk.slice(5,7); } } // 05.09.2026: 1CC — та же дата, своя метка
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
  const maxLives=(S.mode==='ironman'||S.mode==='daily1cc')?1:3; // 05.09.2026: Ironman/1CC — один слот, не три с двумя пустыми контурами
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
