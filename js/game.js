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
  {id:0,name:0,price:0,   body:'#efeee9',fold:'#cdcabf',glow:'rgba(230,229,225,.9)',trail:'rgba(200,198,190,', cat:'classic'}, // Бумажный — нейтральная бумага, единственный бесплатный/стандартный
  /* 09.09.2026 (владелец, явная просьба, «временная цена по 100 игровых звёзд»): партия
     «физика/культура 2» из macets/fizika-kultura-map-08-09-2026.html, ОДОБРЕНА владельцем
     (design-level, «все одобрено»). Цена 100✦ ВРЕМЕННАЯ, не premium (обычная ✦-покупка,
     не Telegram Stars) — владелец явно уточнил «игровых звёзд», не настоящих денег.
     Первая волна — 15 тем физики/космоса (id58-72). Формулы проверены числом заранее
     (см. project_fizika_kultura_maket_odobren_08_09 в памяти), 3 честные оговорки внесены
     в макет 09.09.2026 (мыльная плёнка/панцирь/сонолюминесценция — текст не завышает
     то, что реально нарисовано). Вторая волна (29 тем ремёсел, id73-101) — отдельным заходом. */
  {id:58, name:'Квазикристалл — дифракция',    price:100, extra:true, fx:'cosQuasi',    body:'#dcf6ff',fold:'#7fd0e8',glow:'rgba(70,200,230,.95)', trail:'rgba(70,200,230,', cat:'cosmos', fact:'10 лучей ровно через 36°, радиусы соседних пятен растут в φ=1.618 раз — та самая картина, которую предсказала математика Пенроуза до открытия Шехтмана (1982)'},
  {id:59, name:'Кольца Сатурна',                price:100, extra:true, fx:'cosSaturn',   body:'#f5ecd6',fold:'#d4b878',glow:'rgba(230,190,120,.95)',trail:'rgba(230,190,120,', cat:'cosmos', fact:'Настоящие относительные радиусы колец NASA — щель Кассини ~4590 км, внутренние кольца честно обгоняют внешние (ω∝r⁻¹·⁵)'},
  {id:60, name:'Хвосты комет',                  price:100, extra:true, fx:'cosComet',    body:'#e0eeff',fold:'#a8c4e8',glow:'rgba(150,190,255,.95)',trail:'rgba(150,190,255,', cat:'cosmos', fact:'Ионный хвост — прямая линия от Солнца (магнитное поле ветра); пылевой — изогнутая кривая (давление света + орбитальная скорость) — два разных механизма сразу'},
  {id:61, name:'Пульсар-маяк',                  price:100, extra:true, fx:'cosPulsar',   body:'#e6dcff',fold:'#b0a0e8',glow:'rgba(180,160,255,.95)',trail:'rgba(180,160,255,', cat:'cosmos', fact:'Два луча с двух магнитных полюсов честно разделены 180° и обходят круг за один оборот звезды — вспышка только когда луч смотрит на наблюдателя'},
  {id:62, name:'Биполярная туманность',         price:100, extra:true, fx:'cosNebula',   body:'#ffe0f5',fold:'#e08ec8',glow:'rgba(230,90,180,.95)', trail:'rgba(230,90,180,', cat:'cosmos', fact:'Быстрый звёздный ветер, сжатый медленным экваториальным поясом, раздувает две полярные доли — реальный механизм, ~13% планетарных туманностей биполярны'},
  {id:63, name:'Аврора — форма магнитосферы',   price:100, extra:true, fx:'cosAurora',   body:'#dcffe8',fold:'#7ee6a8',glow:'rgba(90,220,160,.95)', trail:'rgba(90,220,160,', cat:'cosmos', fact:'Тупая подсолнечная сторона + хвост длиннее в разы (реально >200 радиусов Земли против ~10) — не декоративный овал, настоящая форма'},
  {id:64, name:'Спиральная галактика — Grand-design', price:100, extra:true, fx:'cosGalaxy',     body:'#dde6ff',fold:'#9aa8e0',glow:'rgba(120,150,255,.95)',trail:'rgba(120,150,255,', cat:'cosmos', fact:'Волна плотности (Лин-Шу) держит угол закрутки ровно 15° — узор рукавов вращается как целое, не звёзды по отдельности'},
  {id:65, name:'Спиральная галактика — Flocculent',   price:100, extra:true, fx:'cosGalaxyFloc', body:'#d6f0ff',fold:'#8fc4e0',glow:'rgba(100,190,230,.95)',trail:'rgba(100,190,230,', cat:'cosmos', fact:'Короткие несвязанные рукава честно вращаются с разной скоростью каждый (дифференциальная ротация) — другой реальный механизм, не Grand-design'},
  {id:66, name:'Фигуры Лихтенберга — позитивный', price:100, extra:true, fx:'cosLichtPos', body:'#dceeff',fold:'#8fbfe8',glow:'rgba(100,180,240,.95)',trail:'rgba(100,180,240,', cat:'cosmos', fact:'Настоящее ветвящееся дерево (модель диэлектрического пробоя Нимайер-Пьетронеро-Вайсман, 1984) реально прорастает волной от центра к краю'},
  {id:67, name:'Фигуры Лихтенберга — негативный', price:100, extra:true, fx:'cosLichtNeg', body:'#d8f0ff',fold:'#85c0e0',glow:'rgba(90,190,230,.9)', trail:'rgba(90,190,230,', cat:'cosmos', fact:'Концентрические кольца реально расходятся наружу, как круги на воде — другой знак напряжения, другая форма разряда'},
  {id:68, name:'Мыльная плёнка — законы Плато',   price:100, extra:true, fx:'cosPlateau',  body:'#f0f4ff',fold:'#c8d4f0',glow:'rgba(200,210,255,.9)', trail:'rgba(200,210,255,', cat:'cosmos', fact:'Плёнки сходятся ровно тройками под 120° (честная гексагональная решётка) — доказанная геометрия минимальной поверхности, не «примерно круглое»'},
  {id:69, name:'Филлотаксис — золотой угол',     price:100, extra:true, fx:'cosPhyllo',   body:'#fff3d6',fold:'#e0c080',glow:'rgba(230,190,90,.95)', trail:'rgba(230,190,90,', cat:'cosmos', fact:'Настоящая формула подсолнечника (Фогель, 1979): r=√n, θ=n·137.5077° — семена появляются одно за другим, не готовым узором'},
  {id:70, name:'Сонолюминесценция',              price:100, extra:true, fx:'cosSono',     body:'#e0f4ff',fold:'#a0d0e8',glow:'rgba(140,210,240,.95)',trail:'rgba(140,210,240,', cat:'cosmos', fact:'Пузырёк расширяется в ~10 раз (4.5→45 микрон), затем резко схлопывается — вспышка света ровно в момент коллапса'},
  {id:71, name:'Аккреционный диск чёрной дыры',  price:100, extra:true, fx:'cosAccretion',body:'#f4f2ff',fold:'#c9c3ea',glow:'rgba(210,200,255,.95)',trail:'rgba(210,200,255,', cat:'cosmos', fact:'Внутренние орбиты честно вращаются быстрее внешних (Кеплер, ω∝r⁻¹·⁵), джет турбулентно мерцает — не стабильный луч'},
  {id:72, name:'Волны Фарадея',                  price:100, extra:true, fx:'cosFaraday',  body:'#dcf0ff',fold:'#8fc8e0',glow:'rgba(90,190,230,.95)', trail:'rgba(90,190,230,', cat:'cosmos', fact:'Параметрическая неустойчивость жидкости — честный отклик ровно на половине частоты возбуждения (субгармоника), не при любой вибрации'},
  // 09.09.2026 «физика/культура партия 2», вторая волна (владелец: «добавляй его и все
  // скины с этой партии в игру. временная цена по 100», игровые ✦, не Stars) — 29 тем
  // ремёсел/материалов из fizika-kultura-map-08-09-2026.html, счёт по варианту (44 всего):
  {id:73, name:'Тонганская тапа (нгату)', price:100, extra:true, fx:'culTapa', body:'#3a2210',fold:'#c98a3a',glow:'rgba(220,170,90,.95)', trail:'rgba(220,170,90,', cat:'culture', fact:'Крупный мотив «манулуа» реально появляется блок за блоком, как настоящее натирание резной доски (купеси)'},
  {id:74, name:'Андское ткачество', price:100, extra:true, fx:'culAndesFront', body:'#141a3a',fold:'#c94f4f',glow:'rgba(210,90,90,.95)', trail:'rgba(210,90,90,', cat:'culture', fact:'Комплементарная перевязка нарастает снизу вверх, как на настоящем ткацком станке'},
  {id:75, name:'Палестинская татрииз', price:100, extra:true, fx:'culTatreez', body:'#1a1420',fold:'#c94f4f',glow:'rgba(220,100,100,.95)', trail:'rgba(220,100,100,', cat:'culture', fact:'Счётный крест реально растёт кольцами от центра наружу, как настоящая вышивка'},
  {id:76, name:'Навахо — Two Grey Hills', price:100, extra:true, fx:'culNavajoTwoGrey', body:'#cdbfa3',fold:'#5a4a30',glow:'rgba(150,120,80,.95)', trail:'rgba(150,120,80,', cat:'culture', fact:'Только натуральная небелёная шерсть — ряды реально нарастают снизу вверх на станке'},
  {id:77, name:'Навахо — Ganado', price:100, extra:true, fx:'culNavajoGanado', body:'#8a1f1f',fold:'#e8ecf7',glow:'rgba(230,235,250,.95)', trail:'rgba(230,235,250,', cat:'culture', fact:'Крупные ступенчатые ромбы реально нарастают от края к центру, насыщенный красный фон'},
  {id:78, name:'Навахо — Crystal', price:100, extra:true, fx:'culNavajoCrystal', body:'#9c8a5a',fold:'#4a3f28',glow:'rgba(180,160,110,.95)', trail:'rgba(180,160,110,', cat:'culture', fact:'Приглушённые растительные красители, полосы без каймы реально нарастают рядами'},
  {id:79, name:'Турецкий чинтемани', price:100, extra:true, fx:'culCintemani', body:'#f0e6d2',fold:'#c94f2f',glow:'rgba(220,110,70,.95)', trail:'rgba(220,110,70,', cat:'culture', fact:'Три круга + тигровые полосы — настоящая османская имперская композиция, мотив реально оставляется резным штампом одним за другим'},
  {id:80, name:'Монгольский войлок — Өлзий', price:100, extra:true, fx:'culOlzii', body:'#1c2a1c',fold:'#e8c860',glow:'rgba(230,200,100,.95)', trail:'rgba(230,200,100,', cat:'culture', fact:'Замкнутая непрерывная лента реально трассируется от начала до узла, часть «8 благих символов»'},
  {id:81, name:'Монгольский войлок — Алхан хээ', price:100, extra:true, fx:'culAlkhanKhee', body:'#1c2a1c',fold:'#e8c860',glow:'rgba(230,200,100,.95)', trail:'rgba(230,200,100,', cat:'culture', fact:'Одна непрерывная открытая лента реально прокладывается, повороты только 90° — тот же принцип, что греческий меандр'},
  {id:82, name:'Эфиопский плетёный крест', price:100, extra:true, fx:'culEthiopia', body:'#241a10',fold:'#d8b860',glow:'rgba(220,190,100,.95)', trail:'rgba(220,190,100,', cat:'culture', fact:'Плетение «вечность» реально прокладывается луч за лучом вокруг каждого конца креста; известно более 100 реальных региональных форм'},
  {id:83, name:'Бенгальский джамдани', price:100, extra:true, fx:'culJamdani', body:'#e0dac0',fold:'#a8905a',glow:'rgba(210,190,150,.95)', trail:'rgba(210,190,150,', cat:'culture', fact:'Дополнительный уток вплетён только в местах узора — мотивы честно мерцают на просвет, как на настоящей муслиновой ткани'},
  {id:84, name:"Филиппинский т'налак", price:100, extra:true, fx:'culTnalak', body:'#3a1f14',fold:'#c9a03a',glow:'rgba(210,170,80,.95)', trail:'rgba(210,170,80,', cat:'culture', fact:'Ikat — нити основы завязаны и окрашены до тканья, цвет реально проступает полосой за полосой, с размытым краем'},
  {id:85, name:'Финский рюйю', price:100, extra:true, fx:'culRyijy', body:'#2a1c30',fold:'#c060a0',glow:'rgba(210,110,180,.95)', trail:'rgba(210,110,180,', cat:'culture', fact:'Длинноворсовая текстура — короткие пучки ворса честно покачиваются, симметричный свадебный мотив читается сквозь штриховку'},
  {id:86, name:'Дамасская сталь — Вуц', price:100, extra:true, fx:'matWootz', body:'#1a1a1e',fold:'#b8bcc4',glow:'rgba(200,205,215,.9)', trail:'rgba(200,205,215,', cat:'culture', fact:'Волнистые полосы кристаллизации карбидов ОДНОГО сплава реально бликуют на свету'},
  {id:87, name:'Дамаскирование', price:100, extra:true, fx:'matPatternWeld', body:'#1a1a1e',fold:'#c8c8d0',glow:'rgba(210,210,220,.9)', trail:'rgba(210,210,220,', cat:'culture', fact:'Параллельные слои РАЗНЫХ сталей реально проступают по мере проковки-скручивания заготовки'},
  {id:88, name:'Кольчуга — 4-в-1', price:100, extra:true, fx:'matChainmail4', body:'#141418',fold:'#b8c0c8',glow:'rgba(200,208,216,.9)', trail:'rgba(200,208,216,', cat:'culture', fact:'Европейское плетение — каждое кольцо продето ровно через 4 соседних, полотно реально нарастает кольцо за кольцом'},
  {id:89, name:'Кольчуга — 6-в-1', price:100, extra:true, fx:'chainmail6', body:'#141418',fold:'#c8d0d8',glow:'rgba(210,216,224,.9)', trail:'rgba(210,216,224,', cat:'culture', fact:'Каждое кольцо продето через 6 соседних — другой граф связности, не просто гуще плетение, чем 4-в-1'},
  {id:90, name:'Мраморные жилы', price:100, extra:true, fx:'matMarbleVein', body:'#e8e4da',fold:'#5a5a5f',glow:'rgba(150,150,158,.9)', trail:'rgba(150,150,158,', cat:'culture', fact:'Угловатое ветвление без единой иерархии реально прорастает со временем — настоящий геологический процесс минерализации трещин'},
  {id:91, name:'Иней / дендриты', price:100, extra:true, fx:'matFrost', body:'#0a1420',fold:'#a8e0f0',glow:'rgba(170,225,240,.95)', trail:'rgba(170,225,240,', cat:'culture', fact:'Гексагональная симметрия льда Ih — ветви дендрита реально прорастают наружу под 60°, не произвольным углом'},
  {id:92, name:'Панцирь черепахи', price:100, extra:true, fx:'matShellHex', body:'#1a2a1a',fold:'#c9a83a',glow:'rgba(210,180,80,.95)', trail:'rgba(210,180,80,', cat:'culture', fact:'Шестиугольная решётка реально нарастает от центра кольцо за кольцом — та же геометрическая семья, что геодезический купол'},
  {id:93, name:'Перламутр', price:100, extra:true, fx:'matNacre', body:'#12141c',fold:'#8ad0c8',glow:'rgba(150,215,205,.95)', trail:'rgba(150,215,205,', cat:'culture', fact:'Слои со сдвигом рядов, цвет иризации честно плывёт по углу — тот же оптический эффект, что у настоящего перламутра'},
  {id:94, name:'Суахилийская канга', price:100, extra:true, fx:'culKanga', body:'#c9482f',fold:'#f0d840',glow:'rgba(240,220,80,.95)', trail:'rgba(240,220,80,', cat:'culture', fact:'Тёмная полоса — место под реальную суахилийскую пословицу (джина); кусок ткани честно наклоняется, как в руках'},
  {id:95, name:'Плетение корзин — койлинг', price:100, extra:true, fx:'culBasketCoil', body:'#3a2a18',fold:'#c9a860',glow:'rgba(210,180,110,.95)', trail:'rgba(210,180,110,', cat:'culture', fact:'Спираль из сосновой хвои реально сшивается виток за витком от центра наружу'},
  {id:96, name:'Плетение корзин — плейтинг', price:100, extra:true, fx:'culBasketPlait', body:'#3a2a18',fold:'#e8c878',glow:'rgba(230,205,130,.95)', trail:'rgba(230,205,130,', cat:'culture', fact:'Пальмовый лист, лента реально прокладывается через одну полосу за полосой — другая структура плетения, не просто другой узор'},
  {id:97, name:'Персидский ковёр — Тебриз', price:100, extra:true, fx:'persianTabriz', body:'#7a1f1f',fold:'#e8c060',glow:'rgba(230,195,100,.95)', trail:'rgba(230,195,100,', cat:'culture', fact:'Медальон и плотные полевые цветы — ковёр реально нарастает узел за узлом снизу вверх'},
  {id:98, name:'Персидский ковёр — Исфахан', price:100, extra:true, fx:'culPersianIsfahan', body:'#8a2020',fold:'#e0a0b0',glow:'rgba(225,165,180,.9)', trail:'rgba(225,165,180,', cat:'culture', fact:'Тончайший медальон с пальметтами и вазами, ковёр реально нарастает узел за узлом'},
  {id:99, name:'Персидский ковёр — Кашан', price:100, extra:true, fx:'culPersianKashan', body:'#6a1a2a',fold:'#d89050',glow:'rgba(220,150,85,.9)', trail:'rgba(220,150,85,', cat:'culture', fact:'Медальон и арабески, ковёр реально нарастает узел за узлом'},
  {id:100, name:'Персидский ковёр — Кум', price:100, extra:true, fx:'culPersianQom', body:'#9a3030',fold:'#e0a878',glow:'rgba(225,170,125,.9)', trail:'rgba(225,170,125,', cat:'culture', fact:'Тонкий шёлк, мелкие цветы, ковёр реально нарастает узел за узлом'},
  {id:101, name:'Персидский ковёр — Наин', price:100, extra:true, fx:'culPersianNain', body:'#e8e0c8',fold:'#4a6a9a',glow:'rgba(90,120,170,.9)', trail:'rgba(90,120,170,', cat:'culture', fact:'Кремовый фон, синий медальон, ковёр реально нарастает узел за узлом'},
  /* 10.09.2026 «Оптика и материалы» (владелец, из макета .knowledge/macets/optika-materialy-15-
     tem-08-09-2026.html) — 7 из 15 тем макета: остальные 8 при проверке оказались уже в игре
     (id60/68/72/79/87/93/98 — те же fx, макет сам честно писал «готовый код») либо конфликтом
     имени без совпадения сути (id92 «Панцирь черепахи» — решение владельца отдельно, не тронут). */
  {id:102, name:'Опал — игра цвета', price:100, extra:true, fx:'matOpalPhoton', body:'#e8e6df',fold:'#c8c4b8',glow:'rgba(190,180,220,.9)', trail:'rgba(190,180,220,', cat:'cosmos', fact:'Размер кремнезёмных сфер (150-350 нм) в фотонном кристалле честно определяет цвет: мелкие — синий/фиолетовый, крупные — оранжевый/красный'},
  {id:103, name:'Лабрадорит', price:100, extra:true, fx:'matLabradorite', body:'#2a2a30',fold:'#3a3a42',glow:'rgba(70,160,220,.9)', trail:'rgba(70,160,220,', cat:'cosmos', fact:'Лабрадоресценция — яркая вспышка цвета возникает только в узком окне поворота между толстыми слоистыми пластинами, не постоянно'},
  {id:104, name:'Лунный камень', price:100, extra:true, fx:'matMoonstone', body:'#e4e8f2',fold:'#c8d0e8',glow:'rgba(200,210,240,.9)', trail:'rgba(200,210,240,', cat:'cosmos', fact:'Адуляресценция — мягкое молочно-голубое свечение из тонких параллельных слоёв, видно почти всегда, никогда резко не гаснет'},
  {id:105, name:'Бабочка Морфо', price:100, extra:true, fx:'bioMorpho', body:'#1e4fc4',fold:'#153a94',glow:'rgba(90,150,255,.95)', trail:'rgba(90,150,255,', cat:'cosmos', fact:'Структурный синий цвета крыла честно не меняется с углом поворота — пигмента синего цвета у бабочки морфо физически нет вообще'},
  {id:106, name:'Жук-скарабей', price:100, extra:true, fx:'bioBeetlePol', body:'#0a1f14',fold:'#123a26',glow:'rgba(90,220,140,.9)', trail:'rgba(90,220,140,', cat:'cosmos', fact:'Через один фильтр круговой поляризации панцирь жука ярко-металлический, через противоположный — весь блеск исчезает, поверхность полностью чёрная'},
  {id:107, name:'Гало и ложные солнца', price:100, extra:true, fx:'cosHalo', body:'#050a14',fold:'#0f1a2c',glow:'rgba(255,210,140,.9)', trail:'rgba(255,210,140,', cat:'cosmos', fact:'22° — настоящий минимальный угол преломления света в гексагональном ледяном кристалле (закон Снеллиуса, n≈1.31)'},
  {id:108, name:'Гирих-плитки', price:100, extra:true, fx:'culGirih', body:'#e8dfc8',fold:'#d4c8a8',glow:'rgba(190,110,70,.9)', trail:'rgba(190,110,70,', cat:'culture', fact:'Исламская геометрия ок. 1200 г.: 10-лучевая звезда, все углы кратны 36° — те же квазикристаллические узоры, что открыл Пенроуз, за 500 лет до него'},
  /* 10.09.2026 «Гофра и родственные конструкции» — 4 темы, одобренные владельцем ещё 06.09.2026
     по фото похожей слоёной игрушки (.knowledge/GENERATIVE-GEOMETRY.md, «седьмая волна»,
     macet_corrugated.html — сам макет с тех пор не сохранился, числа остались в базе знаний),
     докодированы только теперь. */
  {id:109, name:'Гофра — профиль C', price:100, extra:true, fx:'matCorrugC', body:'#c9a26c',fold:'#a67c47',glow:'rgba(200,160,110,.9)', trail:'rgba(200,160,110,', cat:'culture', fact:'Настоящий отраслевой профиль гофрокартона C: длина волны 7.82мм, отношение высоты к длине волны 0.512 — сверено по 2 независимым источникам'},
  {id:110, name:'Слоистая ламинация', price:100, extra:true, fx:'matLayeredLam', body:'#b8895a',fold:'#8f6438',glow:'rgba(200,155,105,.9)', trail:'rgba(200,155,105,', cat:'culture', fact:'Стилизация техники папье-крафта: форма набрана стопкой плоских срезов-контуров, каждый шов — настоящая граница между слоями'},
  {id:111, name:'Стальная стенка балки', price:100, extra:true, fx:'matSteelWall', body:'#8a94a0',fold:'#69737e',glow:'rgba(150,165,180,.9)', trail:'rgba(150,165,180,', cat:'culture', fact:'Реальная гофрированная стенка балки (рецензируемая статья MDPI Materials): волна заметно площе гофрокартона — отношение высоты к длине волны всего 0.14-0.18'},
  {id:112, name:'Металлический сильфон', price:100, extra:true, fx:'matBellows', body:'#b6c0ca',fold:'#8892a0',glow:'rgba(170,190,210,.95)', trail:'rgba(170,190,210,', cat:'culture', fact:'Реальный компенсатор US Bellows: высота 13мм, шаг 15мм — отношение 0.867, почти квадратная волна, честно U-профиль, а не синусоида'},
  // 09.09.2026 (владелец, явная просьба): ВСЕ остальные скины сняты с игры — полный список
  // (тир 2/3, космос/материалы/сигилы/иллюзии/паттерны/физика-культура-2) сохранён в
  // .knowledge/archive-all-ship-skins-except-paper-09-09-2026.md, ничего не потеряно.
  // Функции отрисовки в render.js (PREM_FX_MAP) НЕ удалены — просто больше ничем не вызываются.
  // SKINS_BY_ID.get(id) для любого снятого id честно вернёт undefined, весь код уже
  // страхуется ||SKINS[0] (проверено по всем файлам). Сервер (cosmogram-sync/PREMIUM_SKINS)
  // пока НЕ поправлен — отдельный явный шаг, ждёт решения владельца.
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
  {id:1, name:'Ракета', price:75, ch:'🚀', cat:'space'}, {id:2, name:'Тарелка', price:75, ch:'🛸', cat:'space'}, // 04.09.2026: были бесплатны — владелец поменял местами со Звездой/Соткой, см. ANGAR_FREEBIE (ui.js)
  {id:3, name:'Звезда', price:0, ch:'🌟', cat:'space'}, {id:4, name:'Комета', price:75, ch:'☄️', cat:'space'}, // 04.09.2026: Звезда теперь бесплатна — см. ANGAR_FREEBIE
   {id:6, name:'Полумесяц', price:75, ch:'🌙', cat:'space'},
  {id:7, name:'Пришелец', price:75, ch:'👽', cat:'space'}, {id:8, name:'Искра', price:75, ch:'✨', cat:'space'},
  {id:62, name:'Спутник', price:75, ch:'🛰️', cat:'space'},
  {id:64, name:'Телескоп', price:75, ch:'🔭', cat:'space'}, // 05.09.2026: id63 «Падающая звезда»/id65 «Млечный Путь» убраны владельцем
  // Зодиак
   
   
   
   
   
   
  // Погода/стихии
  {id:21, name:'Молния', price:75, ch:'⚡', cat:'weather'}, {id:22, name:'Радуга', price:75, ch:'🌈', cat:'weather'},
  {id:23, name:'Снежинка', price:75, ch:'❄️', cat:'weather'}, {id:24, name:'Волна', price:75, ch:'🌊', cat:'weather'},
  {id:25, name:'Смерч', price:75, ch:'🌪️', cat:'weather'}, {id:26, name:'Солнце', price:75, ch:'☀️', cat:'weather'},
  {id:66, name:'Циклон', price:75, ch:'🌀', cat:'weather'},
  {id:181, name:'Термометр', price:75, ch:'🌡️', cat:'weather'}, // 05.09.2026: id121 «Туман» убран владельцем
  // Смайлики
  {id:27, name:'Улыбка', price:75, ch:'😀', cat:'faces'}, {id:28, name:'Стиль', price:75, ch:'😎', cat:'faces'},
  {id:29, name:'Огонь', price:75, ch:'🔥', cat:'faces'}, {id:30, name:'Сотка', price:0, ch:'💯', cat:'faces'}, // 04.09.2026: бесплатна — см. ANGAR_FREEBIE (ui.js)
  {id:31, name:'Смех', price:75, ch:'😂', cat:'faces'}, {id:32, name:'Праздник', price:75, ch:'🥳', cat:'faces'},
  {id:68, name:'Взрыв мозга', price:75, ch:'🤯', cat:'faces'}, {id:69, name:'Озорство', price:75, ch:'😈', cat:'faces'},
  {id:70, name:'Ниндзя', price:75, ch:'🥷', cat:'faces'},
  {id:122, name:'Влюблён', price:75, ch:'😍', cat:'faces'}, {id:123, name:'В восторге', price:75, ch:'🤩', cat:'faces'},
  {id:124, name:'Сон', price:75, ch:'😴', cat:'faces'}, {id:125, name:'Холод', price:75, ch:'🥶', cat:'faces'},
  // Растения/природа
  {id:33, name:'Сакура', price:75, ch:'🌸', cat:'nature'}, {id:34, name:'Кактус', price:75, ch:'🌵', cat:'nature'},
  {id:35, name:'Пальма', price:75, ch:'🌴', cat:'nature'}, {id:36, name:'Клевер', price:75, ch:'🍀', cat:'nature'},
  {id:71, name:'Роза', price:75, ch:'🌹', cat:'nature'}, {id:72, name:'Гриб', price:75, ch:'🍄', cat:'nature'},
  
  {id:126, name:'Подсолнух', price:75, ch:'🌻', cat:'nature'}, {id:127, name:'Клён', price:75, ch:'🍁', cat:'nature'},
  {id:182, name:'Гибискус', price:75, ch:'🌺', cat:'nature'}, {id:183, name:'Колос', price:75, ch:'🌾', cat:'nature'},
  // Шахматы/карты
  {id:37, name:'Пешка', price:75, ch:'♟️', cat:'games'}, {id:39, name:'Пики', price:75, ch:'♠️', cat:'games'}, {id:40, name:'Червы', price:75, ch:'♥️', cat:'games'},
  {id:74, name:'Бубны', price:75, ch:'♦️', cat:'games'}, {id:75, name:'Трефы', price:75, ch:'♣️', cat:'games'},
  {id:76, name:'Кости', price:75, ch:'🎲', cat:'games'}, {id:77, name:'Мишень', price:75, ch:'🎯', cat:'games'},
  {id:184, name:'Джокер', price:75, ch:'🃏', cat:'games'}, {id:185, name:'Слот-машина', price:75, ch:'🎰', cat:'games'},
  // Животные
  {id:41, name:'Орёл', price:75, ch:'🦅', cat:'animals'}, {id:42, name:'Волк', price:75, ch:'🐺', cat:'animals'},
  {id:43, name:'Лев (зверь)', price:75, ch:'🦁', cat:'animals'}, {id:44, name:'Лиса', price:75, ch:'🦊', cat:'animals'},
  {id:78, name:'Тигр', price:75, ch:'🐯', cat:'animals'}, {id:79, name:'Акула', price:75, ch:'🦈', cat:'animals'},
  {id:80, name:'Сова', price:75, ch:'🦉', cat:'animals'}, {id:81, name:'Медведь', price:75, ch:'🐻', cat:'animals'},
  {id:82, name:'Панда', price:75, ch:'🐼', cat:'animals'}, {id:83, name:'Слон', price:75, ch:'🐘', cat:'animals'},
  {id:84, name:'Носорог', price:75, ch:'🦏', cat:'animals'}, {id:85, name:'Жираф', price:75, ch:'🦒', cat:'animals'},
  {id:86, name:'Зебра', price:75, ch:'🦓', cat:'animals'}, {id:87, name:'Олень', price:75, ch:'🦌', cat:'animals'},
  {id:88, name:'Леопард', price:75, ch:'🐆', cat:'animals'}, {id:89, name:'Летучая мышь', price:75, ch:'🦇', cat:'animals'},
  {id:90, name:'Крокодил', price:75, ch:'🐊', cat:'animals'}, {id:91, name:'Скорпион', price:75, ch:'🦂', cat:'animals'},
  {id:92, name:'Паук', price:75, ch:'🕷️', cat:'animals'}, {id:93, name:'Ящерица', price:75, ch:'🦎', cat:'animals'},
  {id:94, name:'Осьминог', price:75, ch:'🐙', cat:'animals'}, {id:95, name:'Кальмар', price:75, ch:'🦑', cat:'animals'},
  {id:96, name:'Кит', price:75, ch:'🐋', cat:'animals'}, {id:97, name:'Дельфин', price:75, ch:'🐬', cat:'animals'},
  {id:98, name:'Тираннозавр', price:75, ch:'🦖', cat:'animals'}, {id:99, name:'Динозавр', price:75, ch:'🦕', cat:'animals'},
  {id:100, name:'Павлин', price:75, ch:'🦚', cat:'animals'}, {id:101, name:'Фламинго', price:75, ch:'🦩', cat:'animals'},
  {id:102, name:'Пчела', price:75, ch:'🐝', cat:'animals'}, {id:103, name:'Бабочка', price:75, ch:'🦋', cat:'animals'},
  {id:186, name:'Ленивец', price:75, ch:'🦥', cat:'animals'}, {id:187, name:'Ёж', price:75, ch:'🦔', cat:'animals'},
  {id:188, name:'Черепаха', price:75, ch:'🐢', cat:'animals'}, {id:189, name:'Попугай', price:75, ch:'🦜', cat:'animals'},
  {id:190, name:'Улитка', price:75, ch:'🐌', cat:'animals'},
  // Фазы Луны (сет)
  {id:45, name:'Новолуние', price:75, ch:'🌑', cat:'moon'}, {id:46, name:'Растущий серп', price:75, ch:'🌒', cat:'moon'},
  {id:47, name:'Первая четверть', price:75, ch:'🌓', cat:'moon'}, {id:48, name:'Растущая Луна', price:75, ch:'🌔', cat:'moon'},
  {id:49, name:'Полнолуние', price:75, ch:'🌕', cat:'moon'}, {id:50, name:'Убывающая Луна', price:75, ch:'🌖', cat:'moon'},
  {id:51, name:'Последняя четверть', price:75, ch:'🌗', cat:'moon'}, {id:52, name:'Убывающий серп', price:75, ch:'🌘', cat:'moon'},
  // Музыка (тот же значок ещё пригодится категории «Звук»)
  {id:53, name:'Нота', price:75, ch:'🎵', cat:'music'}, {id:54, name:'Гитара', price:75, ch:'🎸', cat:'music'},
  {id:55, name:'Наушники', price:75, ch:'🎧', cat:'music'},
  {id:104, name:'Пианино', price:75, ch:'🎹', cat:'music'}, {id:105, name:'Барабан', price:75, ch:'🥁', cat:'music'},
  {id:106, name:'Труба', price:75, ch:'🎺', cat:'music'}, {id:107, name:'Скрипка', price:75, ch:'🎻', cat:'music'},
  {id:191, name:'Саксофон', price:75, ch:'🎷', cat:'music'},
  // Мифические существа — редкое/статусное
  {id:56, name:'Дракон', price:75, ch:'🐉', cat:'myth'}, {id:57, name:'Единорог', price:75, ch:'🦄', cat:'myth'},
  {id:58, name:'Дракон (лицо)', price:75, ch:'🐲', cat:'myth'},
  {id:108, name:'Призрак', price:75, ch:'👻', cat:'myth'}, {id:109, name:'Джинн', price:75, ch:'🧞', cat:'myth'},
  {id:110, name:'Русалка', price:75, ch:'🧜', cat:'myth'}, {id:111, name:'Демон', price:75, ch:'👹', cat:'myth'},
  {id:112, name:'Тэнгу', price:75, ch:'👺', cat:'myth'},
  {id:192, name:'Зомби', price:75, ch:'🧟', cat:'myth'},
  // Драгоценности/статус — редкое/статусное
  {id:59, name:'Алмаз', price:75, ch:'💎', cat:'status'}, {id:60, name:'Корона', price:75, ch:'👑', cat:'status'},
  {id:61, name:'Мешок звёзд', price:75, ch:'💰', cat:'status'},
  {id:113, name:'Кубок', price:75, ch:'🏆', cat:'status'}, 
  {id:115, name:'Кольцо', price:75, ch:'💍', cat:'status'}, {id:116, name:'Трезубец', price:75, ch:'🔱', cat:'status'},
   {id:118, name:'Лилия', price:75, ch:'⚜️', cat:'status'},
   
  
  // 29.08.2026 «ещё больше разнообразия» (владелец) — семь новых категорий разом,
  // за пределами исходной темы «космос/зодиак/природа»: транспорт, еда, спорт, техника,
  // мода, символы, ландшафт. Флаги стран и религиозные символы сознательно не берём —
  // первые не рисуются на Windows (см. комментарий выше), вторые могут задеть.
  // Транспорт
  {id:128, name:'Машина', price:75, ch:'🚗', cat:'vehicles'}, {id:129, name:'Гонка', price:75, ch:'🏎️', cat:'vehicles'},
  {id:130, name:'Вертолёт', price:75, ch:'🚁', cat:'vehicles'}, {id:131, name:'Яхта', price:75, ch:'⛵', cat:'vehicles'},
  {id:132, name:'Самолёт', price:75, ch:'✈️', cat:'vehicles'}, {id:133, name:'Самолётик', price:75, ch:'🛩️', cat:'vehicles'},
  {id:134, name:'Корабль', price:75, ch:'🚢', cat:'vehicles'}, {id:135, name:'Поезд', price:75, ch:'🚂', cat:'vehicles'},
  {id:136, name:'Якорь', price:75, ch:'⚓', cat:'vehicles'},
  // Еда
  {id:137, name:'Пицца', price:75, ch:'🍕', cat:'food'}, {id:138, name:'Пончик', price:75, ch:'🍩', cat:'food'},
  {id:139, name:'Мороженое', price:75, ch:'🍦', cat:'food'}, {id:140, name:'Арбуз', price:75, ch:'🍉', cat:'food'},
  {id:141, name:'Бургер', price:75, ch:'🍔', cat:'food'}, {id:142, name:'Тако', price:75, ch:'🌮', cat:'food'},
  {id:143, name:'Вишня', price:75, ch:'🍒', cat:'food'}, {id:144, name:'Шоколад', price:75, ch:'🍫', cat:'food'},
  // Спорт
  {id:145, name:'Футбол', price:75, ch:'⚽', cat:'sport'}, {id:146, name:'Баскетбол', price:75, ch:'🏀', cat:'sport'},
  {id:147, name:'Боулинг', price:75, ch:'🎳', cat:'sport'}, {id:148, name:'Бокс', price:75, ch:'🥊', cat:'sport'},
  {id:149, name:'Регби', price:75, ch:'🏈', cat:'sport'}, {id:150, name:'Теннис', price:75, ch:'🎾', cat:'sport'},
  {id:151, name:'Волейбол', price:75, ch:'🏐', cat:'sport'}, {id:152, name:'Скейт', price:75, ch:'🛹', cat:'sport'},
  // Техника
  {id:153, name:'Ноутбук', price:75, ch:'💻', cat:'tech'}, {id:154, name:'Джойстик', price:75, ch:'🕹️', cat:'tech'},
  {id:155, name:'Антенна', price:75, ch:'📡', cat:'tech'}, {id:156, name:'Батарея', price:75, ch:'🔋', cat:'tech'},
  {id:157, name:'Камера', price:75, ch:'📷', cat:'tech'}, {id:158, name:'Лампочка', price:75, ch:'💡', cat:'tech'},
  {id:159, name:'Магнит', price:75, ch:'🧲', cat:'tech'}, {id:160, name:'Шестерёнка', price:75, ch:'⚙️', cat:'tech'},
  // Мода
  {id:161, name:'Цилиндр', price:75, ch:'🎩', cat:'fashion'}, {id:162, name:'Очки', price:75, ch:'🕶️', cat:'fashion'},
  {id:163, name:'Кроссовок', price:75, ch:'👟', cat:'fashion'}, {id:164, name:'Галстук', price:75, ch:'👔', cat:'fashion'},
  {id:165, name:'Помада', price:75, ch:'💄', cat:'fashion'}, {id:166, name:'Кепка', price:75, ch:'🧢', cat:'fashion'},
  // Символы — особенное/редкое
   
   {id:170, name:'Внимание', price:75, ch:'⚠️', cat:'symbols'},
  {id:171, name:'Радиация', price:75, ch:'☢️', cat:'symbols'}, {id:172, name:'Биоопасность', price:75, ch:'☣️', cat:'symbols'},
  {id:173, name:'Хрустальный шар', price:75, ch:'🔮', cat:'symbols'}, {id:174, name:'Компас', price:75, ch:'🧭', cat:'symbols'},
  // Ландшафт
  {id:175, name:'Вулкан', price:75, ch:'🌋', cat:'landscape'}, {id:176, name:'Гора', price:75, ch:'🏔️', cat:'landscape'},
   
   
  // Праздники
  {id:196, name:'Ёлка', price:75, ch:'🎄', cat:'holidays'}, {id:197, name:'Тыква', price:75, ch:'🎃', cat:'holidays'},
  {id:198, name:'Салют', price:75, ch:'🎆', cat:'holidays'}, {id:199, name:'Шарик', price:75, ch:'🎈', cat:'holidays'},
  {id:200, name:'Подарок', price:75, ch:'🎁', cat:'holidays'}, {id:201, name:'Свеча', price:75, ch:'🕯️', cat:'holidays'},
  // Ориентиры
   {id:203, name:'Статуя Свободы', price:75, ch:'🗽', cat:'landmarks'},
  {id:204, name:'Колесо обозрения', price:75, ch:'🎡', cat:'landmarks'}, {id:205, name:'Горки', price:75, ch:'🎢', cat:'landmarks'},
   {id:207, name:'Башня', price:75, ch:'🗼', cat:'landmarks'},
  // Наука — особенное/редкое
  {id:208, name:'Пробирка', price:75, ch:'🧪', cat:'science'}, {id:209, name:'ДНК', price:75, ch:'🧬', cat:'science'},
  {id:210, name:'Микроскоп', price:75, ch:'🔬', cat:'science'}, {id:211, name:'Чашка Петри', price:75, ch:'🧫', cat:'science'},
  {id:212, name:'Перегонный куб', price:75, ch:'⚗️', cat:'science'},

  {id:219, name:'Сердце-стрела', price:75, ch:'💘', cat:'hearts'},
  {id:220, name:'Сердце с лентой', price:75, ch:'💝', cat:'hearts'},
  {id:221, name:'Искрящееся сердце', price:75, ch:'💖', cat:'hearts'},
  {id:222, name:'Растущее сердце', price:75, ch:'💗', cat:'hearts'},
  {id:223, name:'Бьющееся сердце', price:75, ch:'💓', cat:'hearts'},
  {id:224, name:'Кружащиеся сердца', price:75, ch:'💞', cat:'hearts'},
  {id:225, name:'Два сердца', price:75, ch:'💕', cat:'hearts'},
  
  {id:227, name:'Сердце-восклицание', price:75, ch:'❣️', cat:'hearts'},
  {id:228, name:'Разбитое сердце', price:75, ch:'💔', cat:'hearts'},
  {id:229, name:'Красное сердце', price:75, ch:'❤️', cat:'hearts'},
  
  {id:231, name:'Оранжевое сердце', price:75, ch:'🧡', cat:'hearts'},
  {id:232, name:'Жёлтое сердце', price:75, ch:'💛', cat:'hearts'},
  {id:233, name:'Зелёное сердце', price:75, ch:'💚', cat:'hearts'},
  {id:234, name:'Синее сердце', price:75, ch:'💙', cat:'hearts'},
  
  {id:236, name:'Фиолетовое сердце', price:75, ch:'💜', cat:'hearts'},
  {id:237, name:'Коричневое сердце', price:75, ch:'🤎', cat:'hearts'},
  {id:238, name:'Чёрное сердце', price:75, ch:'🖤', cat:'hearts'},
  
  {id:240, name:'Белое сердце', price:75, ch:'🤍', cat:'hearts'},
  {id:241, name:'След поцелуя', price:75, ch:'💋', cat:'fx'},
  {id:242, name:'Символ гнева', price:75, ch:'💢', cat:'fx'},
  
  {id:244, name:'Столкновение', price:75, ch:'💥', cat:'fx'},
  {id:245, name:'Головокружение', price:75, ch:'💫', cat:'fx'},
  {id:246, name:'Капли пота', price:75, ch:'💦', cat:'fx'},
  {id:247, name:'Стремительный уход', price:75, ch:'💨', cat:'fx'},
  {id:248, name:'Дыра', price:75, ch:'🕳️', cat:'fx'},
  {id:249, name:'Речевой пузырь', price:75, ch:'💬', cat:'fx'},
  {id:250, name:'Пузырь слева', price:75, ch:'🗨️', cat:'fx'},
  {id:251, name:'Пузырь гнева', price:75, ch:'🗯️', cat:'fx'},
  {id:252, name:'Пузырь мысли', price:75, ch:'💭', cat:'fx'},
  {id:253, name:'Храп ZZZ', price:75, ch:'💤', cat:'fx'},
  {id:254, name:'Морда обезьяны', price:75, ch:'🐵', cat:'animals'},
  {id:255, name:'Обезьяна', price:75, ch:'🐒', cat:'animals'},
  {id:256, name:'Горилла', price:75, ch:'🦍', cat:'animals'},
  {id:257, name:'Орангутан', price:75, ch:'🦧', cat:'animals'},
  {id:258, name:'Морда собаки', price:75, ch:'🐶', cat:'animals'},
  {id:259, name:'Собака', price:75, ch:'🐕', cat:'animals'},
  {id:260, name:'Собака-поводырь', price:75, ch:'🦮', cat:'animals'},
  {id:261, name:'Пудель', price:75, ch:'🐩', cat:'animals'},
  {id:262, name:'Енот', price:75, ch:'🦝', cat:'animals'},
  {id:263, name:'Морда кота', price:75, ch:'🐱', cat:'animals'},
  {id:264, name:'Кот', price:75, ch:'🐈', cat:'animals'},
  {id:265, name:'Тигр (мордочка)', price:75, ch:'🐅', cat:'animals'},
  {id:266, name:'Морда лошади', price:75, ch:'🐴', cat:'animals'},
  
  
  
  {id:270, name:'Бизон', price:75, ch:'🦬', cat:'animals'},
  {id:271, name:'Морда коровы', price:75, ch:'🐮', cat:'animals'},
  {id:272, name:'Вол', price:75, ch:'🐂', cat:'animals'},
  {id:273, name:'Буйвол', price:75, ch:'🐃', cat:'animals'},
  {id:274, name:'Корова', price:75, ch:'🐄', cat:'animals'},
  {id:275, name:'Морда свиньи', price:75, ch:'🐷', cat:'animals'},
  {id:276, name:'Свинья', price:75, ch:'🐖', cat:'animals'},
  {id:277, name:'Кабан', price:75, ch:'🐗', cat:'animals'},
  {id:278, name:'Пятачок', price:75, ch:'🐽', cat:'animals'},
  {id:279, name:'Баран', price:75, ch:'🐏', cat:'animals'},
  {id:280, name:'Овца', price:75, ch:'🐑', cat:'animals'},
  {id:281, name:'Коза', price:75, ch:'🐐', cat:'animals'},
  {id:282, name:'Верблюд', price:75, ch:'🐪', cat:'animals'},
  {id:283, name:'Двугорбый верблюд', price:75, ch:'🐫', cat:'animals'},
  {id:284, name:'Лама', price:75, ch:'🦙', cat:'animals'},
  {id:285, name:'Мамонт', price:75, ch:'🦣', cat:'animals'},
  {id:286, name:'Бегемот', price:75, ch:'🦛', cat:'animals'},
  {id:287, name:'Морда мыши', price:75, ch:'🐭', cat:'animals'},
  {id:288, name:'Мышь', price:75, ch:'🐁', cat:'animals'},
  {id:289, name:'Крыса', price:75, ch:'🐀', cat:'animals'},
  {id:290, name:'Хомяк', price:75, ch:'🐹', cat:'animals'},
  {id:291, name:'Морда кролика', price:75, ch:'🐰', cat:'animals'},
  {id:292, name:'Кролик', price:75, ch:'🐇', cat:'animals'},
  {id:293, name:'Бурундук', price:75, ch:'🐿️', cat:'animals'},
  {id:294, name:'Бобр', price:75, ch:'🦫', cat:'animals'},
  {id:295, name:'Коала', price:75, ch:'🐨', cat:'animals'},
  {id:296, name:'Выдра', price:75, ch:'🦦', cat:'animals'},
  {id:297, name:'Скунс', price:75, ch:'🦨', cat:'animals'},
  {id:298, name:'Кенгуру', price:75, ch:'🦘', cat:'animals'},
  {id:299, name:'Барсук', price:75, ch:'🦡', cat:'animals'},
  {id:300, name:'Следы лап', price:75, ch:'🐾', cat:'animals'},
  {id:301, name:'Индюк', price:75, ch:'🦃', cat:'animals'},
  {id:302, name:'Курица', price:75, ch:'🐔', cat:'animals'},
  {id:303, name:'Петух', price:75, ch:'🐓', cat:'animals'},
  {id:304, name:'Вылупляющийся цыплёнок', price:75, ch:'🐣', cat:'animals'},
  {id:305, name:'Цыплёнок', price:75, ch:'🐤', cat:'animals'},
  {id:306, name:'Цыплёнок анфас', price:75, ch:'🐥', cat:'animals'},
  {id:307, name:'Птица', price:75, ch:'🐦', cat:'animals'},
  {id:308, name:'Пингвин', price:75, ch:'🐧', cat:'animals'},
  {id:309, name:'Голубь', price:75, ch:'🕊️', cat:'animals'},
  {id:310, name:'Утка', price:75, ch:'🦆', cat:'animals'},
  {id:311, name:'Лебедь', price:75, ch:'🦢', cat:'animals'},
  {id:312, name:'Додо', price:75, ch:'🦤', cat:'animals'},
  
  
  
  {id:316, name:'Лягушка', price:75, ch:'🐸', cat:'animals'},
  {id:317, name:'Змея', price:75, ch:'🐍', cat:'animals'},
  {id:318, name:'Фонтанирующий кит', price:75, ch:'🐳', cat:'sealife'},
  
  {id:320, name:'Тюлень', price:75, ch:'🦭', cat:'sealife'},
  {id:321, name:'Рыба', price:75, ch:'🐟', cat:'sealife'},
  {id:322, name:'Тропическая рыба', price:75, ch:'🐠', cat:'sealife'},
  {id:323, name:'Рыба-шар', price:75, ch:'🐡', cat:'sealife'},
  {id:324, name:'Ракушка', price:75, ch:'🐚', cat:'sealife'},
  
  
  {id:327, name:'Краб', price:75, ch:'🦀', cat:'sealife'},
  {id:328, name:'Омар', price:75, ch:'🦞', cat:'sealife'},
  {id:329, name:'Креветка', price:75, ch:'🦐', cat:'sealife'},
  {id:330, name:'Устрица', price:75, ch:'🦪', cat:'sealife'},
  {id:331, name:'Букашка', price:75, ch:'🐛', cat:'bugs'},
  {id:332, name:'Муравей', price:75, ch:'🐜', cat:'bugs'},
  
  {id:334, name:'Божья коровка', price:75, ch:'🐞', cat:'bugs'},
  {id:335, name:'Сверчок', price:75, ch:'🦗', cat:'bugs'},
  
  {id:337, name:'Паутина', price:75, ch:'🕸️', cat:'bugs'},
  {id:338, name:'Комар', price:75, ch:'🦟', cat:'bugs'},
  
  
  {id:341, name:'Микроб', price:75, ch:'🦠', cat:'bugs'},
  {id:342, name:'Букет', price:75, ch:'💐', cat:'nature'},
  {id:343, name:'Белый цветок', price:75, ch:'💮', cat:'nature'},
  {id:344, name:'Розетка-цветок', price:75, ch:'🏵️', cat:'nature'},
  {id:345, name:'Увядший цветок', price:75, ch:'🥀', cat:'nature'},
  {id:346, name:'Цветение', price:75, ch:'🌼', cat:'nature'},
  {id:347, name:'Тюльпан', price:75, ch:'🌷', cat:'nature'},
  
  {id:349, name:'Росток', price:75, ch:'🌱', cat:'nature'},
  
  {id:351, name:'Вечнозелёное дерево', price:75, ch:'🌲', cat:'nature'},
  {id:352, name:'Лиственное дерево', price:75, ch:'🌳', cat:'nature'},
  {id:353, name:'Трава-приправа', price:75, ch:'🌿', cat:'nature'},
  {id:354, name:'Трилистник', price:75, ch:'☘️', cat:'nature'},
  {id:355, name:'Опавший лист', price:75, ch:'🍂', cat:'nature'},
  {id:356, name:'Лист на ветру', price:75, ch:'🍃', cat:'nature'},
  
  
  
  {id:360, name:'Глобус: Европа-Африка', price:75, ch:'🌍', cat:'landscape'},
  {id:361, name:'Глобус: Америка', price:75, ch:'🌎', cat:'landscape'},
  {id:362, name:'Глобус: Азия-Австралия', price:75, ch:'🌏', cat:'landscape'},
  {id:363, name:'Глобус с меридианами', price:75, ch:'🌐', cat:'landscape'},
  
  
  {id:366, name:'Гора (вектор эмодзи)', price:75, ch:'⛰️', cat:'landscape'},
  
  {id:368, name:'Фудзияма', price:75, ch:'🗻', cat:'landscape'},
  {id:369, name:'Кемпинг', price:75, ch:'🏕️', cat:'landscape'},
  
  
  
  
  
  
  
  
  {id:378, name:'Хижина (эмодзи)', price:75, ch:'🛖', cat:'landmarks'},
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  {id:396, name:'Фонтан', price:75, ch:'⛲', cat:'landmarks'},
  {id:397, name:'Палатка', price:75, ch:'⛺', cat:'landmarks'},
  
  
  
  
  
  {id:403, name:'Горячие источники', price:75, ch:'♨️', cat:'landmarks'},
  {id:404, name:'Карусель', price:75, ch:'🎠', cat:'landmarks'},
  
  {id:406, name:'Вывеска парикмахерской', price:75, ch:'💈', cat:'landmarks'},
  {id:407, name:'Цирковой шатёр', price:75, ch:'🎪', cat:'landmarks'},
  {id:408, name:'Вагон', price:75, ch:'🚃', cat:'vehicles'},
  {id:409, name:'Скоростной поезд', price:75, ch:'🚄', cat:'vehicles'},
  {id:410, name:'Поезд-пуля', price:75, ch:'🚅', cat:'vehicles'},
  {id:411, name:'Поезд', price:75, ch:'🚆', cat:'vehicles'},
  {id:412, name:'Метро', price:75, ch:'🚇', cat:'vehicles'},
  {id:413, name:'Лёгкое метро', price:75, ch:'🚈', cat:'vehicles'},
  {id:414, name:'Станция', price:75, ch:'🚉', cat:'vehicles'},
  {id:415, name:'Трамвай (эмодзи)', price:75, ch:'🚊', cat:'vehicles'},
  {id:416, name:'Монорельс', price:75, ch:'🚝', cat:'vehicles'},
  {id:417, name:'Горная железная дорога', price:75, ch:'🚞', cat:'vehicles'},
  {id:418, name:'Трамвайный вагон', price:75, ch:'🚋', cat:'vehicles'},
  {id:419, name:'Автобус', price:75, ch:'🚌', cat:'vehicles'},
  {id:420, name:'Автобус навстречу', price:75, ch:'🚍', cat:'vehicles'},
  {id:421, name:'Троллейбус', price:75, ch:'🚎', cat:'vehicles'},
  {id:422, name:'Маршрутка', price:75, ch:'🚐', cat:'vehicles'},
  {id:423, name:'Скорая помощь', price:75, ch:'🚑', cat:'vehicles'},
  {id:424, name:'Пожарная машина', price:75, ch:'🚒', cat:'vehicles'},
  {id:425, name:'Полицейская машина', price:75, ch:'🚓', cat:'vehicles'},
  {id:426, name:'Полиция навстречу', price:75, ch:'🚔', cat:'vehicles'},
  {id:427, name:'Такси', price:75, ch:'🚕', cat:'vehicles'},
  {id:428, name:'Такси навстречу', price:75, ch:'🚖', cat:'vehicles'},
  {id:429, name:'Машина навстречу', price:75, ch:'🚘', cat:'vehicles'},
  {id:430, name:'Внедорожник', price:75, ch:'🚙', cat:'vehicles'},
  {id:431, name:'Пикап', price:75, ch:'🛻', cat:'vehicles'},
  {id:432, name:'Фургон доставки', price:75, ch:'🚚', cat:'vehicles'},
  {id:433, name:'Фура', price:75, ch:'🚛', cat:'vehicles'},
  {id:434, name:'Трактор (эмодзи)', price:75, ch:'🚜', cat:'vehicles'},
  {id:435, name:'Мотоцикл (эмодзи)', price:75, ch:'🏍️', cat:'vehicles'},
  {id:436, name:'Мотороллер', price:75, ch:'🛵', cat:'vehicles'},
  {id:437, name:'Инвалидная коляска', price:75, ch:'🦽', cat:'vehicles'},
  {id:438, name:'Электроколяска', price:75, ch:'🦼', cat:'vehicles'},
  {id:439, name:'Тук-тук', price:75, ch:'🛺', cat:'vehicles'},
  {id:440, name:'Велосипед (эмодзи)', price:75, ch:'🚲', cat:'vehicles'},
  {id:441, name:'Самокат', price:75, ch:'🛴', cat:'vehicles'},
  {id:442, name:'Ролик', price:75, ch:'🛼', cat:'vehicles'},
  {id:443, name:'Автобусная остановка', price:75, ch:'🚏', cat:'vehicles'},
  {id:444, name:'Автомагистраль', price:75, ch:'🛣️', cat:'vehicles'},
  {id:445, name:'Рельсы', price:75, ch:'🛤️', cat:'vehicles'},
  {id:446, name:'Бочка нефти', price:75, ch:'🛢️', cat:'vehicles'},
  {id:447, name:'Бензоколонка', price:75, ch:'⛽', cat:'vehicles'},
  
  {id:449, name:'Мигалка', price:75, ch:'🚨', cat:'vehicles'},
  {id:450, name:'Светофор (гориз.)', price:75, ch:'🚥', cat:'vehicles'},
  {id:451, name:'Светофор', price:75, ch:'🚦', cat:'vehicles'},
  
  {id:453, name:'Дорожные работы', price:75, ch:'🚧', cat:'vehicles'},
  
  {id:455, name:'Каноэ', price:75, ch:'🛶', cat:'vehicles'},
  {id:456, name:'Катер', price:75, ch:'🚤', cat:'vehicles'},
  {id:457, name:'Пассажирский лайнер', price:75, ch:'🛳️', cat:'vehicles'},
  {id:458, name:'Паром', price:75, ch:'⛴️', cat:'vehicles'},
  {id:459, name:'Моторная лодка', price:75, ch:'🛥️', cat:'vehicles'},
  {id:460, name:'Вылет самолёта', price:75, ch:'🛫', cat:'vehicles'},
  {id:461, name:'Прилёт самолёта', price:75, ch:'🛬', cat:'vehicles'},
  
  {id:463, name:'Кресло салона', price:75, ch:'💺', cat:'vehicles'},
  
  
  
  {id:467, name:'Колокольчик портье', price:75, ch:'🛎️', cat:'landmarks'},
  {id:468, name:'Чемодан', price:75, ch:'🧳', cat:'landmarks'},
  {id:469, name:'Новолуние с лицом', price:75, ch:'🌚', cat:'weather'},
  {id:470, name:'Первая четверть с лицом', price:75, ch:'🌛', cat:'weather'},
  {id:471, name:'Последняя четверть с лицом', price:75, ch:'🌜', cat:'weather'},
  {id:472, name:'Полнолуние с лицом', price:75, ch:'🌝', cat:'weather'},
  {id:473, name:'Солнце с лицом', price:75, ch:'🌞', cat:'weather'},
  {id:474, name:'Звезда (эмодзи)', price:75, ch:'⭐', cat:'weather'},
  
  
  
  
  
  
  {id:481, name:'Ветер с лицом', price:75, ch:'🌬️', cat:'weather'},
  
  
  
  
  {id:486, name:'Снеговик', price:75, ch:'☃️', cat:'weather'},
  {id:487, name:'Снеговик без снега', price:75, ch:'⛄', cat:'weather'},
  {id:488, name:'Капля (эмодзи)', price:75, ch:'💧', cat:'weather'},
  
  
  {id:491, name:'Восторг', price:75, ch:'😃', cat:'faces'},
  {id:492, name:'Радость', price:75, ch:'😄', cat:'faces'},
  {id:493, name:'Сияние', price:75, ch:'😁', cat:'faces'},
  {id:494, name:'Хохот', price:75, ch:'😆', cat:'faces'},
  {id:495, name:'Неловкость', price:75, ch:'😅', cat:'faces'},
  {id:496, name:'Ржач', price:75, ch:'🤣', cat:'faces'},
  {id:497, name:'Спокойствие', price:75, ch:'🙂', cat:'faces'},
  {id:498, name:'Вверх ногами', price:75, ch:'🙃', cat:'faces'},
  {id:499, name:'Подмигивание', price:75, ch:'😉', cat:'faces'},
  {id:500, name:'Тепло', price:75, ch:'😊', cat:'faces'},
  {id:501, name:'Ангелочек', price:75, ch:'😇', cat:'faces'},
  {id:502, name:'Обожание', price:75, ch:'🥰', cat:'faces'},
  {id:503, name:'Поцелуй', price:75, ch:'😘', cat:'faces'},
  {id:504, name:'Чмок', price:75, ch:'😗', cat:'faces'},
  {id:505, name:'Довольство', price:75, ch:'☺️', cat:'faces'},
  {id:506, name:'Нежность', price:75, ch:'😚', cat:'faces'},
  {id:507, name:'Ласка', price:75, ch:'😙', cat:'faces'},
  {id:508, name:'Растрогало', price:75, ch:'🥲', cat:'faces'},
  {id:509, name:'Вкусно', price:75, ch:'😋', cat:'faces'},
  {id:510, name:'Дразнилка', price:75, ch:'😛', cat:'faces'},
  {id:511, name:'Шалость', price:75, ch:'😜', cat:'faces'},
  {id:512, name:'Дурачество', price:75, ch:'🤪', cat:'faces'},
  {id:513, name:'Кривляние', price:75, ch:'😝', cat:'faces'},
  {id:514, name:'Жажда денег', price:75, ch:'🤑', cat:'faces'},
  {id:515, name:'Объятия', price:75, ch:'🤗', cat:'faces'},
  {id:516, name:'Хихиканье', price:75, ch:'🤭', cat:'faces'},
  {id:517, name:'Тсс', price:75, ch:'🤫', cat:'faces'},
  {id:518, name:'Раздумье', price:75, ch:'🤔', cat:'faces'},
  {id:519, name:'Молчок', price:75, ch:'🤐', cat:'faces'},
  {id:520, name:'Скепсис', price:75, ch:'🤨', cat:'faces'},
  {id:521, name:'Нейтралитет', price:75, ch:'😐', cat:'faces'},
  {id:522, name:'Пустота', price:75, ch:'😑', cat:'faces'},
  {id:523, name:'Без слов', price:75, ch:'😶', cat:'faces'},
  {id:524, name:'Ухмылка', price:75, ch:'😏', cat:'faces'},
  {id:525, name:'Скука', price:75, ch:'😒', cat:'faces'},
  {id:526, name:'Закатить глаза', price:75, ch:'🙄', cat:'faces'},
  {id:527, name:'Гримаса', price:75, ch:'😬', cat:'faces'},
  {id:528, name:'Враньё', price:75, ch:'🤥', cat:'faces'},
  {id:529, name:'Облегчение', price:75, ch:'😌', cat:'faces'},
  {id:530, name:'Задумчивость', price:75, ch:'😔', cat:'faces'},
  {id:531, name:'Дрёма', price:75, ch:'😪', cat:'faces'},
  {id:532, name:'Слюнки', price:75, ch:'🤤', cat:'faces'},
  {id:533, name:'Маска', price:75, ch:'😷', cat:'faces'},
  {id:534, name:'Простуда', price:75, ch:'🤒', cat:'faces'},
  {id:535, name:'Ушиб', price:75, ch:'🤕', cat:'faces'},
  {id:536, name:'Тошнота', price:75, ch:'🤢', cat:'faces'},
  {id:537, name:'Фу, тошнит', price:75, ch:'🤮', cat:'faces'},
  {id:538, name:'Чих', price:75, ch:'🤧', cat:'faces'},
  {id:539, name:'Жара', price:75, ch:'🥵', cat:'faces'},
  {id:540, name:'Кружится голова', price:75, ch:'🥴', cat:'faces'},
  {id:541, name:'Нокаут', price:75, ch:'😵', cat:'faces'},
  {id:542, name:'Ковбой', price:75, ch:'🤠', cat:'faces'},
  {id:543, name:'Маскировка', price:75, ch:'🥸', cat:'faces'},
  {id:544, name:'Ботан', price:75, ch:'🤓', cat:'faces'},
  {id:545, name:'Монокль', price:75, ch:'🧐', cat:'faces'},
  {id:546, name:'Недоумение', price:75, ch:'😕', cat:'faces'},
  {id:547, name:'Тревога', price:75, ch:'😟', cat:'faces'},
  {id:548, name:'Огорчение', price:75, ch:'🙁', cat:'faces'},
  {id:549, name:'Хмурость', price:75, ch:'☹️', cat:'faces'},
  {id:550, name:'Удивление', price:75, ch:'😮', cat:'faces'},
  {id:551, name:'Оторопь', price:75, ch:'😯', cat:'faces'},
  {id:552, name:'Изумление', price:75, ch:'😲', cat:'faces'},
  {id:553, name:'Смущение', price:75, ch:'😳', cat:'faces'},
  {id:554, name:'Умоляю', price:75, ch:'🥺', cat:'faces'},
  {id:555, name:'Оторопело', price:75, ch:'😦', cat:'faces'},
  {id:556, name:'Мука', price:75, ch:'😧', cat:'faces'},
  {id:557, name:'Испуг', price:75, ch:'😨', cat:'faces'},
  {id:558, name:'Волнение', price:75, ch:'😰', cat:'faces'},
  {id:559, name:'Отлегло', price:75, ch:'😥', cat:'faces'},
  {id:560, name:'Слёзы', price:75, ch:'😢', cat:'faces'},
  {id:561, name:'Рыдания', price:75, ch:'😭', cat:'faces'},
  {id:562, name:'Крик ужаса', price:75, ch:'😱', cat:'faces'},
  {id:563, name:'Смятение', price:75, ch:'😖', cat:'faces'},
  {id:564, name:'Терпение', price:75, ch:'😣', cat:'faces'},
  {id:565, name:'Разочарование', price:75, ch:'😞', cat:'faces'},
  {id:566, name:'Пот', price:75, ch:'😓', cat:'faces'},
  {id:567, name:'Изнеможение', price:75, ch:'😩', cat:'faces'},
  {id:568, name:'Устал', price:75, ch:'😫', cat:'faces'},
  {id:569, name:'Зевота', price:75, ch:'🥱', cat:'faces'},
  {id:570, name:'Пар из ушей', price:75, ch:'😤', cat:'faces'},
  {id:571, name:'Ярость', price:75, ch:'😡', cat:'faces'},
  {id:572, name:'Злость', price:75, ch:'😠', cat:'faces'},
  {id:575, name:'Череп', price:75, ch:'💀', cat:'faces'},
  {id:577, name:'Какашка', price:75, ch:'💩', cat:'faces'}, // 05.09.2026: id573 «Ругань»/id574 «Бесёнок»/id576 «Пиратский череп» убраны — политика 3+
  {id:578, name:'Клоун', price:75, ch:'🤡', cat:'faces'},
  {id:579, name:'Космический захватчик', price:75, ch:'👾', cat:'faces'},
  {id:580, name:'Робот', price:75, ch:'🤖', cat:'faces'},
  {id:581, name:'Довольный кот', price:75, ch:'😺', cat:'faces'},
  {id:582, name:'Кошачья радость', price:75, ch:'😸', cat:'faces'},
  {id:583, name:'Кошачий хохот', price:75, ch:'😹', cat:'faces'},
  {id:584, name:'Влюблённый кот', price:75, ch:'😻', cat:'faces'},
  {id:585, name:'Хитрый кот', price:75, ch:'😼', cat:'faces'},
  {id:586, name:'Кошачий поцелуй', price:75, ch:'😽', cat:'faces'},
  {id:587, name:'Испуганный кот', price:75, ch:'🙀', cat:'faces'},
  {id:588, name:'Плачущий кот', price:75, ch:'😿', cat:'faces'},
  {id:589, name:'Надутый кот', price:75, ch:'😾', cat:'faces'},
  {id:590, name:'Не вижу', price:75, ch:'🙈', cat:'faces'},
  {id:591, name:'Не слышу', price:75, ch:'🙉', cat:'faces'},
  {id:592, name:'Молчу', price:75, ch:'🙊', cat:'faces'},
  {id:593, name:'Виноград', price:75, ch:'🍇', cat:'food'},
  {id:594, name:'Дыня', price:75, ch:'🍈', cat:'food'},
  {id:595, name:'Мандарин', price:75, ch:'🍊', cat:'food'},
  {id:596, name:'Лимон', price:75, ch:'🍋', cat:'food'},
  {id:597, name:'Банан', price:75, ch:'🍌', cat:'food'},
  {id:598, name:'Ананас', price:75, ch:'🍍', cat:'food'},
  {id:599, name:'Манго', price:75, ch:'🥭', cat:'food'},
  {id:600, name:'Яблоко', price:75, ch:'🍎', cat:'food'},
  {id:601, name:'Зелёное яблоко', price:75, ch:'🍏', cat:'food'},
  {id:602, name:'Груша', price:75, ch:'🍐', cat:'food'},
  {id:603, name:'Персик', price:75, ch:'🍑', cat:'food'},
  {id:604, name:'Клубника', price:75, ch:'🍓', cat:'food'},
  {id:605, name:'Черника', price:75, ch:'🫐', cat:'food'},
  {id:606, name:'Киви', price:75, ch:'🥝', cat:'food'},
  {id:607, name:'Помидор', price:75, ch:'🍅', cat:'food'},
  {id:608, name:'Оливка', price:75, ch:'🫒', cat:'food'},
  {id:609, name:'Кокос', price:75, ch:'🥥', cat:'food'},
  {id:610, name:'Авокадо', price:75, ch:'🥑', cat:'food'},
  {id:611, name:'Баклажан', price:75, ch:'🍆', cat:'food'},
  {id:612, name:'Картофель', price:75, ch:'🥔', cat:'food'},
  {id:613, name:'Морковь', price:75, ch:'🥕', cat:'food'},
  {id:614, name:'Кукуруза', price:75, ch:'🌽', cat:'food'},
  {id:615, name:'Перец чили', price:75, ch:'🌶️', cat:'food'},
  {id:616, name:'Болгарский перец', price:75, ch:'🫑', cat:'food'},
  {id:617, name:'Огурец', price:75, ch:'🥒', cat:'food'},
  {id:618, name:'Листовая зелень', price:75, ch:'🥬', cat:'food'},
  {id:619, name:'Брокколи', price:75, ch:'🥦', cat:'food'},
  {id:620, name:'Чеснок', price:75, ch:'🧄', cat:'food'},
  {id:621, name:'Лук', price:75, ch:'🧅', cat:'food'},
  {id:622, name:'Арахис', price:75, ch:'🥜', cat:'food'},
  {id:623, name:'Каштан', price:75, ch:'🌰', cat:'food'},
  {id:624, name:'Хлеб', price:75, ch:'🍞', cat:'food'},
  {id:625, name:'Круассан', price:75, ch:'🥐', cat:'food'},
  {id:626, name:'Багет', price:75, ch:'🥖', cat:'food'},
  {id:627, name:'Лепёшка', price:75, ch:'🫓', cat:'food'},
  {id:628, name:'Крендель', price:75, ch:'🥨', cat:'food'},
  {id:629, name:'Бейгл', price:75, ch:'🥯', cat:'food'},
  {id:630, name:'Блины', price:75, ch:'🥞', cat:'food'},
  {id:631, name:'Вафля', price:75, ch:'🧇', cat:'food'},
  {id:632, name:'Сыр', price:75, ch:'🧀', cat:'food'},
  {id:633, name:'Мясо на кости', price:75, ch:'🍖', cat:'food'},
  {id:634, name:'Куриная ножка', price:75, ch:'🍗', cat:'food'},
  {id:635, name:'Стейк', price:75, ch:'🥩', cat:'food'},
  {id:636, name:'Бекон', price:75, ch:'🥓', cat:'food'},
  {id:637, name:'Картошка фри', price:75, ch:'🍟', cat:'food'},
  {id:638, name:'Хот-дог', price:75, ch:'🌭', cat:'food'},
  {id:639, name:'Сэндвич', price:75, ch:'🥪', cat:'food'},
  {id:640, name:'Буррито', price:75, ch:'🌯', cat:'food'},
  {id:641, name:'Тамале', price:75, ch:'🫔', cat:'food'},
  {id:642, name:'Шаурма', price:75, ch:'🥙', cat:'food'},
  {id:643, name:'Фалафель', price:75, ch:'🧆', cat:'food'},
  {id:644, name:'Яйцо', price:75, ch:'🥚', cat:'food'},
  {id:645, name:'Яичница', price:75, ch:'🍳', cat:'food'},
  {id:646, name:'Сковорода с едой', price:75, ch:'🥘', cat:'food'},
  {id:647, name:'Похлёбка', price:75, ch:'🍲', cat:'food'},
  {id:648, name:'Фондю', price:75, ch:'🫕', cat:'food'},
  {id:649, name:'Каша', price:75, ch:'🥣', cat:'food'},
  {id:650, name:'Салат', price:75, ch:'🥗', cat:'food'},
  {id:651, name:'Попкорн', price:75, ch:'🍿', cat:'food'},
  {id:652, name:'Масло', price:75, ch:'🧈', cat:'food'},
  {id:653, name:'Соль', price:75, ch:'🧂', cat:'food'},
  {id:654, name:'Консервы', price:75, ch:'🥫', cat:'food'},
  {id:655, name:'Бэнто', price:75, ch:'🍱', cat:'food'},
  {id:656, name:'Рисовый крекер', price:75, ch:'🍘', cat:'food'},
  {id:657, name:'Онигири', price:75, ch:'🍙', cat:'food'},
  {id:658, name:'Рис', price:75, ch:'🍚', cat:'food'},
  {id:659, name:'Карри', price:75, ch:'🍛', cat:'food'},
  {id:660, name:'Лапша', price:75, ch:'🍜', cat:'food'},
  {id:661, name:'Спагетти', price:75, ch:'🍝', cat:'food'},
  {id:662, name:'Батат', price:75, ch:'🍠', cat:'food'},
  {id:663, name:'Одэн', price:75, ch:'🍢', cat:'food'},
  {id:664, name:'Суши', price:75, ch:'🍣', cat:'food'},
  {id:665, name:'Темпура', price:75, ch:'🍤', cat:'food'},
  {id:666, name:'Наруто', price:75, ch:'🍥', cat:'food'},
  {id:667, name:'Лунный пряник', price:75, ch:'🥮', cat:'food'},
  {id:668, name:'Данго', price:75, ch:'🍡', cat:'food'},
  {id:669, name:'Пельмень', price:75, ch:'🥟', cat:'food'},
  {id:670, name:'Печенье с предсказанием', price:75, ch:'🥠', cat:'food'},
  {id:671, name:'Коробка навынос', price:75, ch:'🥡', cat:'food'},
  {id:672, name:'Колотый лёд', price:75, ch:'🍧', cat:'food'},
  {id:673, name:'Пломбир', price:75, ch:'🍨', cat:'food'},
  {id:674, name:'Печенье', price:75, ch:'🍪', cat:'food'},
  {id:675, name:'Торт', price:75, ch:'🎂', cat:'food'},
  {id:676, name:'Кусок торта', price:75, ch:'🍰', cat:'food'},
  {id:677, name:'Капкейк', price:75, ch:'🧁', cat:'food'},
  {id:678, name:'Пирог', price:75, ch:'🥧', cat:'food'},
  {id:679, name:'Конфета', price:75, ch:'🍬', cat:'food'},
  {id:680, name:'Леденец', price:75, ch:'🍭', cat:'food'},
  {id:681, name:'Крем-карамель', price:75, ch:'🍮', cat:'food'},
  {id:682, name:'Мёд', price:75, ch:'🍯', cat:'food'},
  {id:683, name:'Бутылочка', price:75, ch:'🍼', cat:'food'},
  {id:684, name:'Молоко', price:75, ch:'🥛', cat:'food'},
  {id:685, name:'Кофе', price:75, ch:'☕', cat:'food'},
  {id:686, name:'Чайник', price:75, ch:'🫖', cat:'food'},
  {id:687, name:'Чашка чая', price:75, ch:'🍵', cat:'food'},
  {id:688, name:'Стакан с трубочкой', price:75, ch:'🥤', cat:'food'},
  {id:689, name:'Бабл-ти', price:75, ch:'🧋', cat:'food'},
  {id:690, name:'Сок в коробке', price:75, ch:'🧃', cat:'food'},
  {id:691, name:'Мате', price:75, ch:'🧉', cat:'food'},
  {id:692, name:'Лёд', price:75, ch:'🧊', cat:'food'},
  {id:693, name:'Палочки', price:75, ch:'🥢', cat:'food'},
  {id:694, name:'Тарелка с приборами', price:75, ch:'🍽️', cat:'food'},
  {id:695, name:'Вилка и нож', price:75, ch:'🍴', cat:'food'},
  {id:696, name:'Ложка', price:75, ch:'🥄', cat:'food'},
  {id:697, name:'Кухонный нож', price:75, ch:'🔪', cat:'food'},
  {id:698, name:'Амфора', price:75, ch:'🏺', cat:'food'},
  {id:699, name:'Сатурн', price:75, ch:'🪐', cat:'space'},
  {id:700, name:'Монета', price:75, ch:'🪙', cat:'status'},
  {id:701, name:'Перо', price:75, ch:'🪶', cat:'animals'},
  {id:702, name:'Жук', price:75, ch:'🪲', cat:'bugs'},
  {id:703, name:'Таракан', price:75, ch:'🪳', cat:'bugs'},
  {id:704, name:'Муха', price:75, ch:'🪰', cat:'bugs'},
  {id:705, name:'Червяк', price:75, ch:'🪱', cat:'bugs'},
  {id:706, name:'Цветок в горшке', price:75, ch:'🪴', cat:'nature'},
  {id:707, name:'Камень', price:75, ch:'🪨', cat:'landmarks'},
  {id:708, name:'Дерево-брус', price:75, ch:'🪵', cat:'landmarks'},
  {id:709, name:'Парашют', price:75, ch:'🪂', cat:'vehicles'},
  
  
  
  
  
  
  {id:716, name:'Бенгальский огонь', price:75, ch:'🎇', cat:'holidays'},
  {id:717, name:'Петарда', price:75, ch:'🧨', cat:'holidays'},
  {id:718, name:'Хлопушка', price:75, ch:'🎉', cat:'holidays'},
  {id:719, name:'Конфетти', price:75, ch:'🎊', cat:'holidays'},
  {id:720, name:'Танабата', price:75, ch:'🎋', cat:'holidays'},
  {id:721, name:'Сосновое украшение', price:75, ch:'🎍', cat:'holidays'},
  {id:722, name:'Японские куклы', price:75, ch:'🎎', cat:'holidays'},
  {id:723, name:'Флаг-карп', price:75, ch:'🎏', cat:'holidays'},
  {id:724, name:'Колокольчик ветра', price:75, ch:'🎐', cat:'holidays'},
  {id:725, name:'Любование луной', price:75, ch:'🎑', cat:'holidays'},
  {id:726, name:'Красный конверт', price:75, ch:'🧧', cat:'holidays'},
  {id:727, name:'Бант', price:75, ch:'🎀', cat:'holidays'},
  {id:728, name:'Памятная лента', price:75, ch:'🎗️', cat:'holidays'},
  {id:729, name:'Билеты', price:75, ch:'🎟️', cat:'holidays'},
  {id:730, name:'Билет', price:75, ch:'🎫', cat:'holidays'},
  {id:731, name:'Бейсбол', price:75, ch:'⚾', cat:'sport'},
  {id:732, name:'Софтбол', price:75, ch:'🥎', cat:'sport'},
  {id:733, name:'Регби', price:75, ch:'🏉', cat:'sport'},
  {id:734, name:'Летающий диск', price:75, ch:'🥏', cat:'sport'},
  {id:735, name:'Крикет', price:75, ch:'🏏', cat:'sport'},
  {id:736, name:'Хоккей на траве', price:75, ch:'🏑', cat:'sport'},
  {id:737, name:'Хоккей', price:75, ch:'🏒', cat:'sport'},
  {id:738, name:'Лакросс', price:75, ch:'🥍', cat:'sport'},
  {id:739, name:'Пинг-понг', price:75, ch:'🏓', cat:'sport'},
  {id:740, name:'Бадминтон', price:75, ch:'🏸', cat:'sport'},
  {id:741, name:'Кимоно', price:75, ch:'🥋', cat:'sport'},
  {id:742, name:'Ворота', price:75, ch:'🥅', cat:'sport'},
  {id:743, name:'Флаг в лунке', price:75, ch:'⛳', cat:'sport'},
  {id:744, name:'Коньки', price:75, ch:'⛸️', cat:'sport'},
  {id:745, name:'Удочка', price:75, ch:'🎣', cat:'sport'},
  {id:746, name:'Маска для дайвинга', price:75, ch:'🤿', cat:'sport'},
  {id:747, name:'Спортивная майка', price:75, ch:'🎽', cat:'sport'},
  {id:748, name:'Лыжи', price:75, ch:'🎿', cat:'sport'},
  {id:749, name:'Санки', price:75, ch:'🛷', cat:'sport'},
  {id:750, name:'Керлинг', price:75, ch:'🥌', cat:'sport'},
  {id:751, name:'Йо-йо', price:75, ch:'🪀', cat:'games'},
  {id:752, name:'Воздушный змей', price:75, ch:'🪁', cat:'games'},
  {id:753, name:'Водяной пистолет', price:75, ch:'🔫', cat:'games'},
  {id:754, name:'Бильярдный шар', price:75, ch:'🎱', cat:'games'},
  {id:755, name:'Волшебная палочка', price:75, ch:'🪄', cat:'games'},
  {id:756, name:'Видеоигра', price:75, ch:'🎮', cat:'games'},
  {id:757, name:'Пазл', price:75, ch:'🧩', cat:'games'},
  {id:758, name:'Плюшевый мишка', price:75, ch:'🧸', cat:'games'},
  {id:759, name:'Пиньята', price:75, ch:'🪅', cat:'games'},
  {id:760, name:'Матрёшка', price:75, ch:'🪆', cat:'games'},
  {id:761, name:'Маджонг', price:75, ch:'🀄', cat:'games'},
  {id:762, name:'Игральные карты (цветы)', price:75, ch:'🎴', cat:'games'},
  {id:763, name:'Театральные маски', price:75, ch:'🎭', cat:'crafts'},
  {id:764, name:'Картина в раме', price:75, ch:'🖼️', cat:'crafts'},
  {id:765, name:'Палитра художника', price:75, ch:'🎨', cat:'crafts'},
  {id:766, name:'Нить', price:75, ch:'🧵', cat:'crafts'},
  {id:767, name:'Игла', price:75, ch:'🪡', cat:'crafts'},
  {id:768, name:'Пряжа', price:75, ch:'🧶', cat:'crafts'},
  {id:769, name:'Узел', price:75, ch:'🪢', cat:'crafts'},
  {id:770, name:'Лотос', price:75, ch:'🪷', cat:'nature'},
  {id:771, name:'Розовое сердце', price:75, ch:'🩷', cat:'hearts'},
  {id:772, name:'Голубое сердце', price:75, ch:'🩵', cat:'hearts'},
  {id:773, name:'Серое сердце', price:75, ch:'🩶', cat:'hearts'},
  {id:774, name:'Облако драки', price:75, ch:'🫯', cat:'fx'},
  {id:775, name:'Лось', price:75, ch:'🫎', cat:'animals'},
  {id:776, name:'Осёл', price:75, ch:'🫏', cat:'animals'},
  {id:777, name:'Крыло', price:75, ch:'🪽', cat:'animals'},
  {id:778, name:'Гусь', price:75, ch:'🪿', cat:'animals'},
  {id:779, name:'Косатка', price:75, ch:'🫍', cat:'sealife'},
  {id:780, name:'Коралл', price:75, ch:'🪸', cat:'sealife'},
  {id:781, name:'Медуза', price:75, ch:'🪼', cat:'sealife'},
  {id:782, name:'Гиацинт', price:75, ch:'🪻', cat:'nature'},
  {id:783, name:'Пустое гнездо', price:75, ch:'🪹', cat:'nature'},
  {id:784, name:'Гнездо с яйцами', price:75, ch:'🪺', cat:'nature'},
  {id:785, name:'Голое дерево', price:75, ch:'🪾', cat:'nature'},
  {id:786, name:'Горка на площадке', price:75, ch:'🛝', cat:'landmarks'},
  {id:787, name:'Колесо', price:75, ch:'🛞', cat:'vehicles'},
  {id:788, name:'Спасательный круг', price:75, ch:'🛟', cat:'vehicles'},
  /* 07.09.2026, владелец: полная сверка каталога Эмодзи против официального emoji-test.txt
     (unicode.org, версия 17.0, все эмодзи-годы E0.6-E17.0) — 946 новых записей, отобранных
     владельцем лично (просмотрел весь список карточка за карточкой, зачеркнул зелёным то,
     что не нужно — 14 позиций, в основном гендерные варианты фэнтезийных ролей супергерой/
     маг/фея/вампир). Плюс отдельно исключено мной по правилу «дети 3+» (алкоголь, курение,
     похоронная тематика, оскорбительный жест «средний палец», love hotel) — 16 позиций,
     этого не было в списке для вычёркивания, добавлено по уже стоящему правилу проекта.
     Цена по группам, тот же принцип, что и у исходного каталога (80 — массовое, 120 —
     животные, 60 — символы/утилитарные/музыка, 150 — награды/сет, 350 — мифическое/
     редкое/космонавты). Названия переведены на русский вручную, не машинным переводом. */
  {id:981, name:'Тающее лицо', price:75, ch:'🫠', cat:'faces'},
  {id:982, name:'Лицо с ладонью у рта', price:75, ch:'🫢', cat:'faces'},
  {id:983, name:'Подглядывающее лицо', price:75, ch:'🫣', cat:'faces'},
  {id:984, name:'Отдающее честь лицо', price:75, ch:'🫡', cat:'faces'},
  {id:985, name:'Пунктирное лицо', price:75, ch:'🫥', cat:'faces'},
  {id:986, name:'Лицо в тумане', price:75, ch:'😶‍🌫️', cat:'faces'},
  {id:987, name:'Выдыхающее лицо', price:75, ch:'😮‍💨', cat:'faces'},
  {id:988, name:'Дрожащее лицо', price:75, ch:'🫨', cat:'faces'},
  {id:989, name:'Кивок «нет»', price:75, ch:'🙂‍↔️', cat:'faces'},
  {id:990, name:'Кивок «да»', price:75, ch:'🙂‍↕️', cat:'faces'},
  {id:991, name:'Лицо со спиралями в глазах', price:75, ch:'😵‍💫', cat:'faces'},
  {id:992, name:'Лицо с кривым ртом', price:75, ch:'🫤', cat:'faces'},
  {id:993, name:'Искажённое лицо', price:75, ch:'🫪', cat:'faces'},
  {id:994, name:'Лицо, сдерживающее слёзы', price:75, ch:'🥹', cat:'faces'},
  {id:995, name:'Лицо с символами вместо мата', price:75, ch:'🤬', cat:'faces'},
  {id:996, name:'Злое лицо с рогами', price:75, ch:'👿', cat:'faces'},
  {id:997, name:'Череп с костями', price:75, ch:'☠️', cat:'faces'},
  {id:998, name:'Любовное письмо', price:75, ch:'💌', cat:'hearts'},
  {id:999, name:'Сердце-орнамент', price:75, ch:'💟', cat:'hearts'},
  {id:1000, name:'Пылающее сердце', price:75, ch:'❤️‍🔥', cat:'hearts'},
  {id:1001, name:'Заживающее сердце', price:75, ch:'❤️‍🩹', cat:'hearts'},
  {id:1002, name:'Глаз в облаке речи', price:75, ch:'👁️‍🗨️', cat:'faces'},
  {id:1003, name:'Собака-поводырь', price:75, ch:'🐕‍🦺', cat:'animals'},
  {id:1004, name:'Чёрная кошка', price:75, ch:'🐈‍⬛', cat:'animals'},
  {id:1005, name:'Лошадь', price:75, ch:'🐎', cat:'animals'},
  {id:1006, name:'Полярный медведь', price:75, ch:'🐻‍❄️', cat:'animals'},
  {id:1007, name:'Чёрная птица', price:75, ch:'🐦‍⬛', cat:'animals'},
  {id:1008, name:'Феникс', price:75, ch:'🐦‍🔥', cat:'animals'},
  {id:1009, name:'Лайм', price:75, ch:'🍋‍🟩', cat:'food'},
  {id:1010, name:'Бобы', price:75, ch:'🫘', cat:'food'},
  {id:1011, name:'Корень имбиря', price:75, ch:'🫚', cat:'food'},
  {id:1012, name:'Стручок гороха', price:75, ch:'🫛', cat:'food'},
  {id:1013, name:'Коричневый гриб', price:75, ch:'🍄‍🟫', cat:'food'},
  {id:1014, name:'Корнеплод', price:75, ch:'🫜', cat:'food'},
  {id:1015, name:'Наливаемая жидкость', price:75, ch:'🫗', cat:'food'},
  {id:1016, name:'Банка', price:75, ch:'🫙', cat:'food'},
  {id:1017, name:'Военная медаль', price:75, ch:'🎖️', cat:'awards'},
  {id:1018, name:'Спортивная медаль', price:75, ch:'🏅', cat:'awards'},
  {id:1019, name:'Медаль за 1 место', price:75, ch:'🥇', cat:'awards'},
  {id:1020, name:'Медаль за 2 место', price:75, ch:'🥈', cat:'awards'},
  {id:1021, name:'Медаль за 3 место', price:75, ch:'🥉', cat:'awards'},
  {id:1022, name:'Зеркальный шар', price:75, ch:'🪩', cat:'games'},
  {id:1023, name:'Карта мира', price:75, ch:'🗺️', cat:'landmarks'},
  {id:1024, name:'Карта Японии', price:75, ch:'🗾', cat:'landmarks'},
  {id:1025, name:'Оползень', price:75, ch:'🛘', cat:'landmarks'},
  {id:1026, name:'Пляж с зонтом', price:75, ch:'🏖️', cat:'landmarks'},
  {id:1027, name:'Пустыня', price:75, ch:'🏜️', cat:'landmarks'},
  {id:1028, name:'Необитаемый остров', price:75, ch:'🏝️', cat:'landmarks'},
  {id:1029, name:'Национальный парк', price:75, ch:'🏞️', cat:'landmarks'},
  {id:1030, name:'Стадион', price:75, ch:'🏟️', cat:'landmarks'},
  {id:1031, name:'Античное здание', price:75, ch:'🏛️', cat:'landmarks'},
  {id:1032, name:'Стройка', price:75, ch:'🏗️', cat:'landmarks'},
  {id:1033, name:'Кирпич', price:75, ch:'🧱', cat:'landmarks'},
  {id:1034, name:'Дома', price:75, ch:'🏘️', cat:'landmarks'},
  {id:1035, name:'Заброшенный дом', price:75, ch:'🏚️', cat:'landmarks'},
  {id:1036, name:'Дом', price:75, ch:'🏠', cat:'landmarks'},
  {id:1037, name:'Дом с садом', price:75, ch:'🏡', cat:'landmarks'},
  {id:1038, name:'Офисное здание', price:75, ch:'🏢', cat:'landmarks'},
  {id:1039, name:'Японская почта', price:75, ch:'🏣', cat:'landmarks'},
  {id:1040, name:'Почта', price:75, ch:'🏤', cat:'landmarks'},
  {id:1041, name:'Больница', price:75, ch:'🏥', cat:'landmarks'},
  {id:1042, name:'Банк', price:75, ch:'🏦', cat:'landmarks'},
  {id:1043, name:'Отель', price:75, ch:'🏨', cat:'landmarks'},
  {id:1044, name:'Магазин у дома', price:75, ch:'🏪', cat:'landmarks'},
  {id:1045, name:'Школа', price:75, ch:'🏫', cat:'landmarks'},
  {id:1046, name:'Универмаг', price:75, ch:'🏬', cat:'landmarks'},
  {id:1047, name:'Завод', price:75, ch:'🏭', cat:'landmarks'},
  {id:1048, name:'Японский замок', price:75, ch:'🏯', cat:'landmarks'},
  {id:1049, name:'Замок', price:75, ch:'🏰', cat:'landmarks'},
  {id:1050, name:'Свадебная часовня', price:75, ch:'💒', cat:'landmarks'},
  {id:1051, name:'Церковь', price:75, ch:'⛪', cat:'landmarks'},
  {id:1052, name:'Мечеть', price:75, ch:'🕌', cat:'landmarks'},
  {id:1053, name:'Индуистский храм', price:75, ch:'🛕', cat:'landmarks'},
  {id:1054, name:'Синагога', price:75, ch:'🕍', cat:'landmarks'},
  {id:1055, name:'Синтоистское святилище', price:75, ch:'⛩️', cat:'landmarks'},
  {id:1056, name:'Кааба', price:75, ch:'🕋', cat:'landmarks'},
  {id:1057, name:'Туман над городом', price:75, ch:'🌁', cat:'landmarks'},
  {id:1058, name:'Ночь со звёздами', price:75, ch:'🌃', cat:'landmarks'},
  {id:1059, name:'Городской пейзаж', price:75, ch:'🏙️', cat:'landmarks'},
  {id:1060, name:'Восход над горами', price:75, ch:'🌄', cat:'landmarks'},
  {id:1061, name:'Восход', price:75, ch:'🌅', cat:'landmarks'},
  {id:1062, name:'Город в сумерках', price:75, ch:'🌆', cat:'landmarks'},
  {id:1063, name:'Закат', price:75, ch:'🌇', cat:'landmarks'},
  {id:1064, name:'Мост ночью', price:75, ch:'🌉', cat:'landmarks'},
  {id:1065, name:'Знак «Стоп»', price:75, ch:'🛑', cat:'vehicles'},
  {id:1066, name:'Подвесная железная дорога', price:75, ch:'🚟', cat:'vehicles'},
  {id:1067, name:'Горная канатная дорога', price:75, ch:'🚠', cat:'vehicles'},
  {id:1068, name:'Воздушный трамвай', price:75, ch:'🚡', cat:'vehicles'},
  {id:1069, name:'Песочные часы (закончились)', price:75, ch:'⌛', cat:'time'},
  {id:1070, name:'Песочные часы (идут)', price:75, ch:'⏳', cat:'time'},
  {id:1071, name:'Наручные часы', price:75, ch:'⌚', cat:'time'},
  {id:1072, name:'Будильник', price:75, ch:'⏰', cat:'time'},
  {id:1073, name:'Секундомер', price:75, ch:'⏱️', cat:'time'},
  {id:1074, name:'Таймер', price:75, ch:'⏲️', cat:'time'},
  {id:1075, name:'Каминные часы', price:75, ch:'🕰️', cat:'time'},
  {id:1076, name:'12:00', price:75, ch:'🕛', cat:'time'},
  {id:1077, name:'12:30', price:75, ch:'🕧', cat:'time'},
  {id:1078, name:'1:00', price:75, ch:'🕐', cat:'time'},
  {id:1079, name:'1:30', price:75, ch:'🕜', cat:'time'},
  {id:1080, name:'2:00', price:75, ch:'🕑', cat:'time'},
  {id:1081, name:'2:30', price:75, ch:'🕝', cat:'time'},
  {id:1082, name:'3:00', price:75, ch:'🕒', cat:'time'},
  {id:1083, name:'3:30', price:75, ch:'🕞', cat:'time'},
  {id:1084, name:'4:00', price:75, ch:'🕓', cat:'time'},
  {id:1085, name:'4:30', price:75, ch:'🕟', cat:'time'},
  {id:1086, name:'5:00', price:75, ch:'🕔', cat:'time'},
  {id:1087, name:'5:30', price:75, ch:'🕠', cat:'time'},
  {id:1088, name:'6:00', price:75, ch:'🕕', cat:'time'},
  {id:1089, name:'6:30', price:75, ch:'🕡', cat:'time'},
  {id:1090, name:'7:00', price:75, ch:'🕖', cat:'time'},
  {id:1091, name:'7:30', price:75, ch:'🕢', cat:'time'},
  {id:1092, name:'8:00', price:75, ch:'🕗', cat:'time'},
  {id:1093, name:'8:30', price:75, ch:'🕣', cat:'time'},
  {id:1094, name:'9:00', price:75, ch:'🕘', cat:'time'},
  {id:1095, name:'9:30', price:75, ch:'🕤', cat:'time'},
  {id:1096, name:'10:00', price:75, ch:'🕙', cat:'time'},
  {id:1097, name:'10:30', price:75, ch:'🕥', cat:'time'},
  {id:1098, name:'11:00', price:75, ch:'🕚', cat:'time'},
  {id:1099, name:'11:30', price:75, ch:'🕦', cat:'time'},
  {id:1100, name:'Падающая звезда', price:75, ch:'🌠', cat:'weather'},
  {id:1101, name:'Млечный Путь', price:75, ch:'🌌', cat:'weather'},
  {id:1102, name:'Облако', price:75, ch:'☁️', cat:'weather'},
  {id:1103, name:'Солнце за облаком', price:75, ch:'⛅', cat:'weather'},
  {id:1104, name:'Гроза', price:75, ch:'⛈️', cat:'weather'},
  {id:1105, name:'Солнце за небольшим облаком', price:75, ch:'🌤️', cat:'weather'},
  {id:1106, name:'Солнце за плотным облаком', price:75, ch:'🌥️', cat:'weather'},
  {id:1107, name:'Солнце и дождь', price:75, ch:'🌦️', cat:'weather'},
  {id:1108, name:'Дождевое облако', price:75, ch:'🌧️', cat:'weather'},
  {id:1109, name:'Снеговое облако', price:75, ch:'🌨️', cat:'weather'},
  {id:1110, name:'Облако с молнией', price:75, ch:'🌩️', cat:'weather'},
  {id:1111, name:'Туман', price:75, ch:'🌫️', cat:'weather'},
  {id:1112, name:'Закрытый зонт', price:75, ch:'🌂', cat:'weather'},
  {id:1113, name:'Зонт', price:75, ch:'☂️', cat:'weather'},
  {id:1114, name:'Зонт под дождём', price:75, ch:'☔', cat:'weather'},
  {id:1115, name:'Пляжный зонт', price:75, ch:'⛱️', cat:'weather'},
  {id:1116, name:'Очки', price:75, ch:'👓', cat:'fashion'},
  {id:1117, name:'Защитные очки', price:75, ch:'🥽', cat:'fashion'},
  {id:1118, name:'Лабораторный халат', price:75, ch:'🥼', cat:'fashion'},
  {id:1119, name:'Светоотражающий жилет', price:75, ch:'🦺', cat:'fashion'},
  {id:1120, name:'Футболка', price:75, ch:'👕', cat:'fashion'},
  {id:1121, name:'Джинсы', price:75, ch:'👖', cat:'fashion'},
  {id:1122, name:'Шарф', price:75, ch:'🧣', cat:'fashion'},
  {id:1123, name:'Перчатки', price:75, ch:'🧤', cat:'fashion'},
  {id:1124, name:'Пальто', price:75, ch:'🧥', cat:'fashion'},
  {id:1125, name:'Носки', price:75, ch:'🧦', cat:'fashion'},
  {id:1126, name:'Платье', price:75, ch:'👗', cat:'fashion'},
  {id:1127, name:'Кимоно', price:75, ch:'👘', cat:'fashion'},
  {id:1128, name:'Сари', price:75, ch:'🥻', cat:'fashion'},
  {id:1129, name:'Купальник', price:75, ch:'🩱', cat:'fashion'},
  {id:1130, name:'Плавки', price:75, ch:'🩲', cat:'fashion'},
  {id:1131, name:'Шорты', price:75, ch:'🩳', cat:'fashion'},
  {id:1132, name:'Бикини', price:75, ch:'👙', cat:'fashion'},
  {id:1133, name:'Женская одежда', price:75, ch:'👚', cat:'fashion'},
  {id:1134, name:'Складной веер', price:75, ch:'🪭', cat:'fashion'},
  {id:1135, name:'Кошелёк', price:75, ch:'👛', cat:'fashion'},
  {id:1136, name:'Сумочка', price:75, ch:'👜', cat:'fashion'},
  {id:1137, name:'Клатч', price:75, ch:'👝', cat:'fashion'},
  {id:1138, name:'Пакеты с покупками', price:75, ch:'🛍️', cat:'fashion'},
  {id:1139, name:'Рюкзак', price:75, ch:'🎒', cat:'fashion'},
  {id:1140, name:'Вьетнамки', price:75, ch:'🩴', cat:'fashion'},
  {id:1141, name:'Мужской ботинок', price:75, ch:'👞', cat:'fashion'},
  {id:1142, name:'Треккинговый ботинок', price:75, ch:'🥾', cat:'fashion'},
  {id:1143, name:'Балетка', price:75, ch:'🥿', cat:'fashion'},
  {id:1144, name:'Туфля на каблуке', price:75, ch:'👠', cat:'fashion'},
  {id:1145, name:'Женская сандалия', price:75, ch:'👡', cat:'fashion'},
  {id:1146, name:'Пуанты', price:75, ch:'🩰', cat:'fashion'},
  {id:1147, name:'Женский сапог', price:75, ch:'👢', cat:'fashion'},
  {id:1148, name:'Расчёска-гребень', price:75, ch:'🪮', cat:'fashion'},
  {id:1149, name:'Женская шляпа', price:75, ch:'👒', cat:'fashion'},
  {id:1150, name:'Академическая шапочка', price:75, ch:'🎓', cat:'fashion'},
  {id:1151, name:'Динамик без звука', price:75, ch:'🔇', cat:'music'},
  {id:1152, name:'Тихий динамик', price:75, ch:'🔈', cat:'music'},
  {id:1153, name:'Динамик средней громкости', price:75, ch:'🔉', cat:'music'},
  {id:1154, name:'Громкий динамик', price:75, ch:'🔊', cat:'music'},
  {id:1155, name:'Громкоговоритель', price:75, ch:'📢', cat:'music'},
  {id:1156, name:'Мегафон', price:75, ch:'📣', cat:'music'},
  {id:1157, name:'Почтовый рожок', price:75, ch:'📯', cat:'music'},
  {id:1158, name:'Колокольчик', price:75, ch:'🔔', cat:'music'},
  {id:1159, name:'Нотный лист', price:75, ch:'🎼', cat:'music'},
  {id:1160, name:'Ноты', price:75, ch:'🎶', cat:'music'},
  {id:1161, name:'Студийный микрофон', price:75, ch:'🎙️', cat:'music'},
  {id:1162, name:'Микшерный слайдер', price:75, ch:'🎚️', cat:'music'},
  {id:1163, name:'Ручки настройки', price:75, ch:'🎛️', cat:'music'},
  {id:1164, name:'Микрофон', price:75, ch:'🎤', cat:'music'},
  {id:1165, name:'Радио', price:75, ch:'📻', cat:'music'},
  {id:1166, name:'Тромбон', price:75, ch:'🪊', cat:'music'},
  {id:1167, name:'Аккордеон', price:75, ch:'🪗', cat:'music'},
  {id:1168, name:'Банджо', price:75, ch:'🪕', cat:'music'},
  {id:1169, name:'Африканский барабан', price:75, ch:'🪘', cat:'music'},
  {id:1170, name:'Маракасы', price:75, ch:'🪇', cat:'music'},
  {id:1171, name:'Флейта', price:75, ch:'🪈', cat:'music'},
  {id:1172, name:'Арфа', price:75, ch:'🪉', cat:'music'},
  {id:1173, name:'Мобильный телефон', price:75, ch:'📱', cat:'tech'},
  {id:1174, name:'Телефон', price:75, ch:'☎️', cat:'tech'},
  {id:1175, name:'Телефонная трубка', price:75, ch:'📞', cat:'tech'},
  {id:1176, name:'Пейджер', price:75, ch:'📟', cat:'tech'},
  {id:1177, name:'Факс', price:75, ch:'📠', cat:'tech'},
  {id:1178, name:'Разряженная батарея', price:75, ch:'🪫', cat:'tech'},
  {id:1179, name:'Электровилка', price:75, ch:'🔌', cat:'tech'},
  {id:1180, name:'Настольный компьютер', price:75, ch:'🖥️', cat:'tech'},
  {id:1181, name:'Принтер', price:75, ch:'🖨️', cat:'tech'},
  {id:1182, name:'Клавиатура', price:75, ch:'⌨️', cat:'tech'},
  {id:1183, name:'Компьютерная мышь', price:75, ch:'🖱️', cat:'tech'},
  {id:1184, name:'Трекбол', price:75, ch:'🖲️', cat:'tech'},
  {id:1185, name:'Жёсткий диск', price:75, ch:'💽', cat:'tech'},
  {id:1186, name:'Дискета', price:75, ch:'💾', cat:'tech'},
  {id:1187, name:'CD-диск', price:75, ch:'💿', cat:'tech'},
  {id:1188, name:'DVD-диск', price:75, ch:'📀', cat:'tech'},
  {id:1189, name:'Счёты', price:75, ch:'🧮', cat:'tech'},
  {id:1190, name:'Кинокамера', price:75, ch:'🎥', cat:'tech'},
  {id:1191, name:'Кинокадры', price:75, ch:'🎞️', cat:'tech'},
  {id:1192, name:'Кинопроектор', price:75, ch:'📽️', cat:'tech'},
  {id:1193, name:'Хлопушка', price:75, ch:'🎬', cat:'tech'},
  {id:1194, name:'Телевизор', price:75, ch:'📺', cat:'tech'},
  {id:1195, name:'Фотоаппарат со вспышкой', price:75, ch:'📸', cat:'tech'},
  {id:1196, name:'Видеокамера', price:75, ch:'📹', cat:'tech'},
  {id:1197, name:'Видеокассета', price:75, ch:'📼', cat:'tech'},
  {id:1198, name:'Лупа влево', price:75, ch:'🔍', cat:'tech'},
  {id:1199, name:'Лупа вправо', price:75, ch:'🔎', cat:'tech'},
  {id:1200, name:'Фонарик', price:75, ch:'🔦', cat:'tech'},
  {id:1201, name:'Красный фонарик', price:75, ch:'🏮', cat:'tech'},
  {id:1202, name:'Масляная лампа-дия', price:75, ch:'🪔', cat:'tech'},
  {id:1203, name:'Блокнот с узором', price:75, ch:'📔', cat:'office'},
  {id:1204, name:'Закрытая книга', price:75, ch:'📕', cat:'office'},
  {id:1205, name:'Открытая книга', price:75, ch:'📖', cat:'office'},
  {id:1206, name:'Зелёная книга', price:75, ch:'📗', cat:'office'},
  {id:1207, name:'Синяя книга', price:75, ch:'📘', cat:'office'},
  {id:1208, name:'Оранжевая книга', price:75, ch:'📙', cat:'office'},
  {id:1209, name:'Книги', price:75, ch:'📚', cat:'office'},
  {id:1210, name:'Блокнот', price:75, ch:'📓', cat:'office'},
  {id:1211, name:'Гроссбух', price:75, ch:'📒', cat:'office'},
  {id:1212, name:'Загнутая страница', price:75, ch:'📃', cat:'office'},
  {id:1213, name:'Свиток', price:75, ch:'📜', cat:'office'},
  {id:1214, name:'Лист бумаги', price:75, ch:'📄', cat:'office'},
  {id:1215, name:'Газета', price:75, ch:'📰', cat:'office'},
  {id:1216, name:'Свёрнутая газета', price:75, ch:'🗞️', cat:'office'},
  {id:1217, name:'Закладки', price:75, ch:'📑', cat:'office'},
  {id:1218, name:'Закладка', price:75, ch:'🔖', cat:'office'},
  {id:1219, name:'Ярлык', price:75, ch:'🏷️', cat:'office'},
  {id:1220, name:'Сундук с сокровищами', price:75, ch:'🪎', cat:'money'},
  {id:1221, name:'Банкнота йены', price:75, ch:'💴', cat:'money'},
  {id:1222, name:'Банкнота доллара', price:75, ch:'💵', cat:'money'},
  {id:1223, name:'Банкнота евро', price:75, ch:'💶', cat:'money'},
  {id:1224, name:'Банкнота фунта', price:75, ch:'💷', cat:'money'},
  {id:1225, name:'Улетающие деньги', price:75, ch:'💸', cat:'money'},
  {id:1226, name:'Банковская карта', price:75, ch:'💳', cat:'money'},
  {id:1227, name:'Чек', price:75, ch:'🧾', cat:'money'},
  {id:1228, name:'Растущий график с йеной', price:75, ch:'💹', cat:'money'},
  {id:1229, name:'Конверт', price:75, ch:'✉️', cat:'office'},
  {id:1230, name:'Эл. почта', price:75, ch:'📧', cat:'office'},
  {id:1231, name:'Входящее письмо', price:75, ch:'📨', cat:'office'},
  {id:1232, name:'Письмо со стрелкой', price:75, ch:'📩', cat:'office'},
  {id:1233, name:'Исходящие', price:75, ch:'📤', cat:'office'},
  {id:1234, name:'Входящие', price:75, ch:'📥', cat:'office'},
  {id:1235, name:'Посылка', price:75, ch:'📦', cat:'office'},
  {id:1236, name:'Закрытый почтовый ящик (флажок поднят)', price:75, ch:'📫', cat:'office'},
  {id:1237, name:'Закрытый почтовый ящик (флажок опущен)', price:75, ch:'📪', cat:'office'},
  {id:1238, name:'Открытый почтовый ящик (флажок поднят)', price:75, ch:'📬', cat:'office'},
  {id:1239, name:'Открытый почтовый ящик (флажок опущен)', price:75, ch:'📭', cat:'office'},
  {id:1240, name:'Почтовый ящик на улице', price:75, ch:'📮', cat:'office'},
  {id:1241, name:'Урна для голосования', price:75, ch:'🗳️', cat:'office'},
  {id:1242, name:'Карандаш', price:75, ch:'✏️', cat:'office'},
  {id:1243, name:'Чёрное перо', price:75, ch:'✒️', cat:'office'},
  {id:1244, name:'Перьевая ручка', price:75, ch:'🖋️', cat:'office'},
  {id:1245, name:'Ручка', price:75, ch:'🖊️', cat:'office'},
  {id:1246, name:'Кисть', price:75, ch:'🖌️', cat:'office'},
  {id:1247, name:'Восковой мелок', price:75, ch:'🖍️', cat:'office'},
  {id:1248, name:'Заметка', price:75, ch:'📝', cat:'office'},
  {id:1249, name:'Портфель', price:75, ch:'💼', cat:'office'},
  {id:1250, name:'Папка', price:75, ch:'📁', cat:'office'},
  {id:1251, name:'Открытая папка', price:75, ch:'📂', cat:'office'},
  {id:1252, name:'Разделители картотеки', price:75, ch:'🗂️', cat:'office'},
  {id:1253, name:'Календарь', price:75, ch:'📅', cat:'office'},
  {id:1254, name:'Отрывной календарь', price:75, ch:'📆', cat:'office'},
  {id:1255, name:'Блокнот на спирали', price:75, ch:'🗒️', cat:'office'},
  {id:1256, name:'Календарь на спирали', price:75, ch:'🗓️', cat:'office'},
  {id:1257, name:'Картотека', price:75, ch:'📇', cat:'office'},
  {id:1258, name:'Растущий график', price:75, ch:'📈', cat:'office'},
  {id:1259, name:'Падающий график', price:75, ch:'📉', cat:'office'},
  {id:1260, name:'Столбчатая диаграмма', price:75, ch:'📊', cat:'office'},
  {id:1261, name:'Планшет с зажимом', price:75, ch:'📋', cat:'office'},
  {id:1262, name:'Канцелярская кнопка', price:75, ch:'📌', cat:'office'},
  {id:1263, name:'Круглая кнопка', price:75, ch:'📍', cat:'office'},
  {id:1264, name:'Скрепка', price:75, ch:'📎', cat:'office'},
  {id:1265, name:'Скреплённые скрепки', price:75, ch:'🖇️', cat:'office'},
  {id:1266, name:'Линейка', price:75, ch:'📏', cat:'office'},
  {id:1267, name:'Чертёжный треугольник', price:75, ch:'📐', cat:'office'},
  {id:1268, name:'Ножницы', price:75, ch:'✂️', cat:'office'},
  {id:1269, name:'Ящик с картотекой', price:75, ch:'🗃️', cat:'office'},
  {id:1270, name:'Картотечный шкаф', price:75, ch:'🗄️', cat:'office'},
  {id:1271, name:'Мусорная корзина', price:75, ch:'🗑️', cat:'office'},
  {id:1272, name:'Закрытый замок', price:75, ch:'🔒', cat:'office'},
  {id:1273, name:'Открытый замок', price:75, ch:'🔓', cat:'office'},
  {id:1274, name:'Замок с ручкой', price:75, ch:'🔏', cat:'office'},
  {id:1275, name:'Замок с ключом', price:75, ch:'🔐', cat:'office'},
  {id:1276, name:'Ключ', price:75, ch:'🔑', cat:'office'},
  {id:1277, name:'Старый ключ', price:75, ch:'🗝️', cat:'office'},
  {id:1278, name:'Молоток', price:75, ch:'🔨', cat:'tools'},
  {id:1279, name:'Топор', price:75, ch:'🪓', cat:'tools'},
  {id:1280, name:'Кирка', price:75, ch:'⛏️', cat:'tools'},
  {id:1281, name:'Молоток и кирка', price:75, ch:'⚒️', cat:'tools'},
  {id:1282, name:'Молоток и гаечный ключ', price:75, ch:'🛠️', cat:'tools'},
  {id:1283, name:'Кинжал', price:75, ch:'🗡️', cat:'tools'},
  {id:1284, name:'Скрещенные мечи', price:75, ch:'⚔️', cat:'tools'},
  {id:1285, name:'Бомба', price:75, ch:'💣', cat:'tools'},
  {id:1286, name:'Бумеранг', price:75, ch:'🪃', cat:'tools'},
  {id:1287, name:'Лук со стрелой', price:75, ch:'🏹', cat:'tools'},
  {id:1288, name:'Щит', price:75, ch:'🛡️', cat:'tools'},
  {id:1289, name:'Пила', price:75, ch:'🪚', cat:'tools'},
  {id:1290, name:'Гаечный ключ', price:75, ch:'🔧', cat:'tools'},
  {id:1291, name:'Отвёртка', price:75, ch:'🪛', cat:'tools'},
  {id:1292, name:'Гайка с болтом', price:75, ch:'🔩', cat:'tools'},
  {id:1293, name:'Струбцина', price:75, ch:'🗜️', cat:'tools'},
  {id:1294, name:'Весы', price:75, ch:'⚖️', cat:'tools'},
  {id:1295, name:'Трость для слабовидящих', price:75, ch:'🦯', cat:'tools'},
  {id:1296, name:'Звено цепи', price:75, ch:'🔗', cat:'tools'},
  {id:1297, name:'Разорванная цепь', price:75, ch:'⛓️‍💥', cat:'tools'},
  {id:1298, name:'Цепь', price:75, ch:'⛓️', cat:'tools'},
  {id:1299, name:'Крюк', price:75, ch:'🪝', cat:'tools'},
  {id:1300, name:'Ящик с инструментами', price:75, ch:'🧰', cat:'tools'},
  {id:1301, name:'Лестница', price:75, ch:'🪜', cat:'tools'},
  {id:1302, name:'Лопата', price:75, ch:'🪏', cat:'tools'},
  {id:1303, name:'Шприц', price:75, ch:'💉', cat:'medical'},
  {id:1304, name:'Капля крови', price:75, ch:'🩸', cat:'medical'},
  {id:1305, name:'Таблетка', price:75, ch:'💊', cat:'medical'},
  {id:1306, name:'Пластырь', price:75, ch:'🩹', cat:'medical'},
  {id:1307, name:'Костыль', price:75, ch:'🩼', cat:'medical'},
  {id:1308, name:'Стетоскоп', price:75, ch:'🩺', cat:'medical'},
  {id:1309, name:'Рентген', price:75, ch:'🩻', cat:'medical'},
  {id:1310, name:'Дверь', price:75, ch:'🚪', cat:'household'},
  {id:1311, name:'Зеркало', price:75, ch:'🪞', cat:'household'},
  {id:1312, name:'Кровать', price:75, ch:'🛏️', cat:'household'},
  {id:1313, name:'Диван с лампой', price:75, ch:'🛋️', cat:'household'},
  {id:1314, name:'Стул', price:75, ch:'🪑', cat:'household'},
  {id:1315, name:'Туалет', price:75, ch:'🚽', cat:'household'},
  {id:1316, name:'Вантуз', price:75, ch:'🪠', cat:'household'},
  {id:1317, name:'Ванна', price:75, ch:'🛁', cat:'household'},
  {id:1318, name:'Мышеловка', price:75, ch:'🪤', cat:'household'},
  {id:1319, name:'Бритва', price:75, ch:'🪒', cat:'household'},
  {id:1320, name:'Флакон лосьона', price:75, ch:'🧴', cat:'household'},
  {id:1321, name:'Английская булавка', price:75, ch:'🧷', cat:'household'},
  {id:1322, name:'Метла', price:75, ch:'🧹', cat:'household'},
  {id:1323, name:'Корзина', price:75, ch:'🧺', cat:'household'},
  {id:1324, name:'Рулон бумаги', price:75, ch:'🧻', cat:'household'},
  {id:1325, name:'Ведро', price:75, ch:'🪣', cat:'household'},
  {id:1326, name:'Мыло', price:75, ch:'🧼', cat:'household'},
  {id:1327, name:'Мыльные пузыри', price:75, ch:'🫧', cat:'household'},
  {id:1328, name:'Зубная щётка', price:75, ch:'🪥', cat:'household'},
  {id:1329, name:'Губка', price:75, ch:'🧽', cat:'household'},
  {id:1330, name:'Огнетушитель', price:75, ch:'🧯', cat:'household'},
  {id:1331, name:'Тележка из магазина', price:75, ch:'🛒', cat:'household'},
  {id:1332, name:'Амулет-назар', price:75, ch:'🧿', cat:'household'},
  {id:1333, name:'Хамса', price:75, ch:'🪬', cat:'household'},
  {id:1334, name:'Статуя моаи', price:75, ch:'🗿', cat:'household'},
  {id:1335, name:'Табличка-плакат', price:75, ch:'🪧', cat:'household'},
  {id:1336, name:'Удостоверение личности', price:75, ch:'🪪', cat:'household'},
  {id:1337, name:'Значок банкомата', price:75, ch:'🏧', cat:'symbols'},
  {id:1338, name:'Знак «Мусор в урну»', price:75, ch:'🚮', cat:'symbols'},
  {id:1339, name:'Питьевая вода', price:75, ch:'🚰', cat:'symbols'},
  {id:1340, name:'Знак инвалидной коляски', price:75, ch:'♿', cat:'symbols'},
  {id:1341, name:'Мужской туалет', price:75, ch:'🚹', cat:'symbols'},
  {id:1342, name:'Женский туалет', price:75, ch:'🚺', cat:'symbols'},
  {id:1343, name:'Туалет', price:75, ch:'🚻', cat:'symbols'},
  {id:1344, name:'Знак «Пеленальный столик»', price:75, ch:'🚼', cat:'symbols'},
  {id:1345, name:'Знак WC', price:75, ch:'🚾', cat:'symbols'},
  {id:1346, name:'Паспортный контроль', price:75, ch:'🛂', cat:'symbols'},
  {id:1347, name:'Таможня', price:75, ch:'🛃', cat:'symbols'},
  {id:1348, name:'Выдача багажа', price:75, ch:'🛄', cat:'symbols'},
  {id:1349, name:'Камера хранения', price:75, ch:'🛅', cat:'symbols'},
  {id:1350, name:'Знак «Дети»', price:75, ch:'🚸', cat:'symbols'},
  {id:1351, name:'Въезд запрещён', price:75, ch:'⛔', cat:'symbols'},
  {id:1352, name:'Запрещено', price:75, ch:'🚫', cat:'symbols'},
  {id:1353, name:'Велосипеды запрещены', price:75, ch:'🚳', cat:'symbols'},
  {id:1354, name:'Курение запрещено', price:75, ch:'🚭', cat:'symbols'},
  {id:1355, name:'Мусорить запрещено', price:75, ch:'🚯', cat:'symbols'},
  {id:1356, name:'Вода непригодна для питья', price:75, ch:'🚱', cat:'symbols'},
  {id:1357, name:'Пешеходам вход запрещён', price:75, ch:'🚷', cat:'symbols'},
  {id:1358, name:'Телефоны запрещены', price:75, ch:'📵', cat:'symbols'},
  {id:1359, name:'18+', price:75, ch:'🔞', cat:'symbols'},
  {id:1360, name:'Стрелка вверх', price:75, ch:'⬆️', cat:'symbols'},
  {id:1361, name:'Стрелка вверх-вправо', price:75, ch:'↗️', cat:'symbols'},
  {id:1362, name:'Стрелка вправо', price:75, ch:'➡️', cat:'symbols'},
  {id:1363, name:'Стрелка вниз-вправо', price:75, ch:'↘️', cat:'symbols'},
  {id:1364, name:'Стрелка вниз', price:75, ch:'⬇️', cat:'symbols'},
  {id:1365, name:'Стрелка вниз-влево', price:75, ch:'↙️', cat:'symbols'},
  {id:1366, name:'Стрелка влево', price:75, ch:'⬅️', cat:'symbols'},
  {id:1367, name:'Стрелка вверх-влево', price:75, ch:'↖️', cat:'symbols'},
  {id:1368, name:'Стрелка вверх-вниз', price:75, ch:'↕️', cat:'symbols'},
  {id:1369, name:'Стрелка влево-вправо', price:75, ch:'↔️', cat:'symbols'},
  {id:1370, name:'Стрелка-разворот вправо-влево', price:75, ch:'↩️', cat:'symbols'},
  {id:1371, name:'Стрелка-разворот влево-вправо', price:75, ch:'↪️', cat:'symbols'},
  {id:1372, name:'Стрелка вправо-вверх', price:75, ch:'⤴️', cat:'symbols'},
  {id:1373, name:'Стрелка вправо-вниз', price:75, ch:'⤵️', cat:'symbols'},
  {id:1374, name:'Обновить (по часовой)', price:75, ch:'🔃', cat:'symbols'},
  {id:1375, name:'Обновить (против часовой)', price:75, ch:'🔄', cat:'symbols'},
  {id:1376, name:'Кнопка «Назад»', price:75, ch:'🔙', cat:'symbols'},
  {id:1377, name:'Кнопка «Конец»', price:75, ch:'🔚', cat:'symbols'},
  {id:1378, name:'Кнопка «Вкл»', price:75, ch:'🔛', cat:'symbols'},
  {id:1379, name:'Кнопка «Скоро»', price:75, ch:'🔜', cat:'symbols'},
  {id:1380, name:'Кнопка «Наверх»', price:75, ch:'🔝', cat:'symbols'},
  {id:1381, name:'Место поклонения', price:75, ch:'🛐', cat:'symbols'},
  {id:1382, name:'Символ атома', price:75, ch:'⚛️', cat:'symbols'},
  {id:1383, name:'Ом', price:75, ch:'🕉️', cat:'symbols'},
  {id:1384, name:'Звезда Давида', price:75, ch:'✡️', cat:'symbols'},
  {id:1385, name:'Колесо дхармы', price:75, ch:'☸️', cat:'symbols'},
  {id:1386, name:'Инь-ян', price:75, ch:'☯️', cat:'symbols'},
  {id:1387, name:'Латинский крест', price:75, ch:'✝️', cat:'symbols'},
  {id:1388, name:'Православный крест', price:75, ch:'☦️', cat:'symbols'},
  {id:1389, name:'Звезда и полумесяц', price:75, ch:'☪️', cat:'symbols'},
  {id:1390, name:'Символ мира', price:75, ch:'☮️', cat:'symbols'},
  {id:1391, name:'Менора', price:75, ch:'🕎', cat:'symbols'},
  {id:1392, name:'Пунктирная шестиконечная звезда', price:75, ch:'🔯', cat:'symbols'},
  {id:1393, name:'Кханда', price:75, ch:'🪯', cat:'symbols'},
  {id:1394, name:'Овен', price:75, ch:'♈', cat:'zodiac'},
  {id:1395, name:'Телец', price:75, ch:'♉', cat:'zodiac'},
  {id:1396, name:'Близнецы', price:75, ch:'♊', cat:'zodiac'},
  {id:1397, name:'Рак', price:75, ch:'♋', cat:'zodiac'},
  {id:1398, name:'Лев', price:75, ch:'♌', cat:'zodiac'},
  {id:1399, name:'Дева', price:75, ch:'♍', cat:'zodiac'},
  {id:1400, name:'Весы', price:75, ch:'♎', cat:'zodiac'},
  {id:1401, name:'Скорпион', price:75, ch:'♏', cat:'zodiac'},
  {id:1402, name:'Стрелец', price:75, ch:'♐', cat:'zodiac'},
  {id:1403, name:'Козерог', price:75, ch:'♑', cat:'zodiac'},
  {id:1404, name:'Водолей', price:75, ch:'♒', cat:'zodiac'},
  {id:1405, name:'Рыбы', price:75, ch:'♓', cat:'zodiac'},
  {id:1406, name:'Змееносец', price:75, ch:'⛎', cat:'zodiac'},
  {id:1407, name:'Перемешать', price:75, ch:'🔀', cat:'symbols'},
  {id:1408, name:'Повтор', price:75, ch:'🔁', cat:'symbols'},
  {id:1409, name:'Повтор одного', price:75, ch:'🔂', cat:'symbols'},
  {id:1410, name:'Play', price:75, ch:'▶️', cat:'symbols'},
  {id:1411, name:'Перемотка вперёд', price:75, ch:'⏩', cat:'symbols'},
  {id:1412, name:'Следующий трек', price:75, ch:'⏭️', cat:'symbols'},
  {id:1413, name:'Play/Пауза', price:75, ch:'⏯️', cat:'symbols'},
  {id:1414, name:'Reverse', price:75, ch:'◀️', cat:'symbols'},
  {id:1415, name:'Перемотка назад', price:75, ch:'⏪', cat:'symbols'},
  {id:1416, name:'Предыдущий трек', price:75, ch:'⏮️', cat:'symbols'},
  {id:1417, name:'Кнопка вверх', price:75, ch:'🔼', cat:'symbols'},
  {id:1418, name:'Быстро вверх', price:75, ch:'⏫', cat:'symbols'},
  {id:1419, name:'Кнопка вниз', price:75, ch:'🔽', cat:'symbols'},
  {id:1420, name:'Быстро вниз', price:75, ch:'⏬', cat:'symbols'},
  {id:1421, name:'Пауза', price:75, ch:'⏸️', cat:'symbols'},
  {id:1422, name:'Стоп', price:75, ch:'⏹️', cat:'symbols'},
  {id:1423, name:'Запись', price:75, ch:'⏺️', cat:'symbols'},
  {id:1424, name:'Извлечь', price:75, ch:'⏏️', cat:'symbols'},
  {id:1425, name:'Кинотеатр', price:75, ch:'🎦', cat:'symbols'},
  {id:1426, name:'Тусклее', price:75, ch:'🔅', cat:'symbols'},
  {id:1427, name:'Ярче', price:75, ch:'🔆', cat:'symbols'},
  {id:1428, name:'Антенна', price:75, ch:'📶', cat:'symbols'},
  {id:1429, name:'Wi-Fi', price:75, ch:'🛜', cat:'symbols'},
  {id:1430, name:'Режим вибрации', price:75, ch:'📳', cat:'symbols'},
  {id:1431, name:'Телефон выключен', price:75, ch:'📴', cat:'symbols'},
  {id:1432, name:'Женский знак', price:75, ch:'♀️', cat:'symbols'},
  {id:1433, name:'Мужской знак', price:75, ch:'♂️', cat:'symbols'},
  {id:1434, name:'Трансгендерный символ', price:75, ch:'⚧️', cat:'symbols'},
  {id:1435, name:'Умножить', price:75, ch:'✖️', cat:'symbols'},
  {id:1436, name:'Плюс', price:75, ch:'➕', cat:'symbols'},
  {id:1437, name:'Минус', price:75, ch:'➖', cat:'symbols'},
  {id:1438, name:'Разделить', price:75, ch:'➗', cat:'symbols'},
  {id:1439, name:'Равно', price:75, ch:'🟰', cat:'symbols'},
  {id:1440, name:'Бесконечность', price:75, ch:'♾️', cat:'symbols'},
  {id:1441, name:'Двойной восклицательный', price:75, ch:'‼️', cat:'symbols'},
  {id:1442, name:'Восклицательный вопрос', price:75, ch:'⁉️', cat:'symbols'},
  {id:1443, name:'Красный вопрос', price:75, ch:'❓', cat:'symbols'},
  {id:1444, name:'Белый вопрос', price:75, ch:'❔', cat:'symbols'},
  {id:1445, name:'Белый восклицательный', price:75, ch:'❕', cat:'symbols'},
  {id:1446, name:'Красный восклицательный', price:75, ch:'❗', cat:'symbols'},
  {id:1447, name:'Волнистое тире', price:75, ch:'〰️', cat:'symbols'},
  {id:1448, name:'Обмен валют', price:75, ch:'💱', cat:'symbols'},
  {id:1449, name:'Знак доллара', price:75, ch:'💲', cat:'symbols'},
  {id:1450, name:'Медицинский символ', price:75, ch:'⚕️', cat:'symbols'},
  {id:1451, name:'Переработка', price:75, ch:'♻️', cat:'symbols'},
  {id:1452, name:'Бейджик', price:75, ch:'📛', cat:'symbols'},
  {id:1453, name:'Значок «новичок»', price:75, ch:'🔰', cat:'symbols'},
  {id:1454, name:'Полый красный круг', price:75, ch:'⭕', cat:'symbols'},
  {id:1455, name:'Галочка (кнопка)', price:75, ch:'✅', cat:'symbols'},
  {id:1456, name:'Отмеченный чекбокс', price:75, ch:'☑️', cat:'symbols'},
  {id:1457, name:'Галочка', price:75, ch:'✔️', cat:'symbols'},
  {id:1458, name:'Крестик', price:75, ch:'❌', cat:'symbols'},
  {id:1459, name:'Крестик (кнопка)', price:75, ch:'❎', cat:'symbols'},
  {id:1460, name:'Завиток', price:75, ch:'➰', cat:'symbols'},
  {id:1461, name:'Двойной завиток', price:75, ch:'➿', cat:'symbols'},
  {id:1462, name:'Знак чередования части', price:75, ch:'〽️', cat:'symbols'},
  {id:1463, name:'Восьмилучевая звёздочка', price:75, ch:'✳️', cat:'symbols'},
  {id:1464, name:'Восьмиконечная звезда', price:75, ch:'✴️', cat:'symbols'},
  {id:1465, name:'Искорка', price:75, ch:'❇️', cat:'symbols'},
  {id:1466, name:'Клякса', price:75, ch:'🫟', cat:'symbols'},
  {id:1467, name:'Клавиша #', price:75, ch:'#️⃣', cat:'symbols'},
  {id:1468, name:'Клавиша *', price:75, ch:'*️⃣', cat:'symbols'},
  {id:1469, name:'Клавиша 0', price:75, ch:'0️⃣', cat:'symbols'},
  {id:1470, name:'Клавиша 1', price:75, ch:'1️⃣', cat:'symbols'},
  {id:1471, name:'Клавиша 2', price:75, ch:'2️⃣', cat:'symbols'},
  {id:1472, name:'Клавиша 3', price:75, ch:'3️⃣', cat:'symbols'},
  {id:1473, name:'Клавиша 4', price:75, ch:'4️⃣', cat:'symbols'},
  {id:1474, name:'Клавиша 5', price:75, ch:'5️⃣', cat:'symbols'},
  {id:1475, name:'Клавиша 6', price:75, ch:'6️⃣', cat:'symbols'},
  {id:1476, name:'Клавиша 7', price:75, ch:'7️⃣', cat:'symbols'},
  {id:1477, name:'Клавиша 8', price:75, ch:'8️⃣', cat:'symbols'},
  {id:1478, name:'Клавиша 9', price:75, ch:'9️⃣', cat:'symbols'},
  {id:1479, name:'Клавиша 10', price:75, ch:'🔟', cat:'symbols'},
  {id:1480, name:'Заглавные буквы', price:75, ch:'🔠', cat:'symbols'},
  {id:1481, name:'Строчные буквы', price:75, ch:'🔡', cat:'symbols'},
  {id:1482, name:'Цифры', price:75, ch:'🔢', cat:'symbols'},
  {id:1483, name:'Символы', price:75, ch:'🔣', cat:'symbols'},
  {id:1484, name:'Латинские буквы', price:75, ch:'🔤', cat:'symbols'},
  {id:1485, name:'Кнопка A', price:75, ch:'🅰️', cat:'symbols'},
  {id:1486, name:'Кнопка AB', price:75, ch:'🆎', cat:'symbols'},
  {id:1487, name:'Кнопка B', price:75, ch:'🅱️', cat:'symbols'},
  {id:1488, name:'Кнопка CL', price:75, ch:'🆑', cat:'symbols'},
  {id:1489, name:'Кнопка COOL', price:75, ch:'🆒', cat:'symbols'},
  {id:1490, name:'Кнопка FREE', price:75, ch:'🆓', cat:'symbols'},
  {id:1491, name:'Информация', price:75, ch:'ℹ️', cat:'symbols'},
  {id:1492, name:'Кнопка ID', price:75, ch:'🆔', cat:'symbols'},
  {id:1493, name:'M в круге', price:75, ch:'Ⓜ️', cat:'symbols'},
  {id:1494, name:'Кнопка NEW', price:75, ch:'🆕', cat:'symbols'},
  {id:1495, name:'Кнопка NG', price:75, ch:'🆖', cat:'symbols'},
  {id:1496, name:'Кнопка O', price:75, ch:'🅾️', cat:'symbols'},
  {id:1497, name:'Кнопка OK', price:75, ch:'🆗', cat:'symbols'},
  {id:1498, name:'Кнопка P', price:75, ch:'🅿️', cat:'symbols'},
  {id:1499, name:'Кнопка SOS', price:75, ch:'🆘', cat:'symbols'},
  {id:1500, name:'Кнопка UP!', price:75, ch:'🆙', cat:'symbols'},
  {id:1501, name:'Кнопка VS', price:75, ch:'🆚', cat:'symbols'},
  {id:1502, name:'Японский знак «здесь»', price:75, ch:'🈁', cat:'symbols'},
  {id:1503, name:'Японский знак «плата за обслуживание»', price:75, ch:'🈂️', cat:'symbols'},
  {id:1504, name:'Японский знак «ежемесячная сумма»', price:75, ch:'🈷️', cat:'symbols'},
  {id:1505, name:'Японский знак «платно»', price:75, ch:'🈶', cat:'symbols'},
  {id:1506, name:'Японский знак «занято»', price:75, ch:'🈯', cat:'symbols'},
  {id:1507, name:'Японский знак «выгодно»', price:75, ch:'🉐', cat:'symbols'},
  {id:1508, name:'Японский знак «скидка»', price:75, ch:'🈹', cat:'symbols'},
  {id:1509, name:'Японский знак «бесплатно»', price:75, ch:'🈚', cat:'symbols'},
  {id:1510, name:'Японский знак «запрещено»', price:75, ch:'🈲', cat:'symbols'},
  {id:1511, name:'Японский знак «приемлемо»', price:75, ch:'🉑', cat:'symbols'},
  {id:1512, name:'Японский знак «заявка»', price:75, ch:'🈸', cat:'symbols'},
  {id:1513, name:'Японский знак «сдано»', price:75, ch:'🈴', cat:'symbols'},
  {id:1514, name:'Японский знак «есть места»', price:75, ch:'🈳', cat:'symbols'},
  {id:1515, name:'Японский знак «поздравления»', price:75, ch:'㊗️', cat:'symbols'},
  {id:1516, name:'Японский знак «секрет»', price:75, ch:'㊙️', cat:'symbols'},
  {id:1517, name:'Японский знак «открыто»', price:75, ch:'🈺', cat:'symbols'},
  {id:1518, name:'Японский знак «мест нет»', price:75, ch:'🈵', cat:'symbols'},
  {id:1519, name:'Красный круг', price:75, ch:'🔴', cat:'symbols'},
  {id:1520, name:'Оранжевый круг', price:75, ch:'🟠', cat:'symbols'},
  {id:1521, name:'Жёлтый круг', price:75, ch:'🟡', cat:'symbols'},
  {id:1522, name:'Зелёный круг', price:75, ch:'🟢', cat:'symbols'},
  {id:1523, name:'Синий круг', price:75, ch:'🔵', cat:'symbols'},
  {id:1524, name:'Фиолетовый круг', price:75, ch:'🟣', cat:'symbols'},
  {id:1525, name:'Коричневый круг', price:75, ch:'🟤', cat:'symbols'},
  {id:1526, name:'Чёрный круг', price:75, ch:'⚫', cat:'symbols'},
  {id:1527, name:'Белый круг', price:75, ch:'⚪', cat:'symbols'},
  {id:1528, name:'Красный квадрат', price:75, ch:'🟥', cat:'symbols'},
  {id:1529, name:'Оранжевый квадрат', price:75, ch:'🟧', cat:'symbols'},
  {id:1530, name:'Жёлтый квадрат', price:75, ch:'🟨', cat:'symbols'},
  {id:1531, name:'Зелёный квадрат', price:75, ch:'🟩', cat:'symbols'},
  {id:1532, name:'Синий квадрат', price:75, ch:'🟦', cat:'symbols'},
  {id:1533, name:'Фиолетовый квадрат', price:75, ch:'🟪', cat:'symbols'},
  {id:1534, name:'Коричневый квадрат', price:75, ch:'🟫', cat:'symbols'},
  {id:1535, name:'Большой чёрный квадрат', price:75, ch:'⬛', cat:'symbols'},
  {id:1536, name:'Большой белый квадрат', price:75, ch:'⬜', cat:'symbols'},
  {id:1537, name:'Средний чёрный квадрат', price:75, ch:'◼️', cat:'symbols'},
  {id:1538, name:'Средний белый квадрат', price:75, ch:'◻️', cat:'symbols'},
  {id:1539, name:'Средне-малый чёрный квадрат', price:75, ch:'◾', cat:'symbols'},
  {id:1540, name:'Средне-малый белый квадрат', price:75, ch:'◽', cat:'symbols'},
  {id:1541, name:'Малый чёрный квадрат', price:75, ch:'▪️', cat:'symbols'},
  {id:1542, name:'Малый белый квадрат', price:75, ch:'▫️', cat:'symbols'},
  {id:1543, name:'Большой оранжевый ромб', price:75, ch:'🔶', cat:'symbols'},
  {id:1544, name:'Большой синий ромб', price:75, ch:'🔷', cat:'symbols'},
  {id:1545, name:'Малый оранжевый ромб', price:75, ch:'🔸', cat:'symbols'},
  {id:1546, name:'Малый синий ромб', price:75, ch:'🔹', cat:'symbols'},
  {id:1547, name:'Красный треугольник вверх', price:75, ch:'🔺', cat:'symbols'},
  {id:1548, name:'Красный треугольник вниз', price:75, ch:'🔻', cat:'symbols'},
  {id:1549, name:'Ромб с точкой', price:75, ch:'💠', cat:'symbols'},
  {id:1550, name:'Радиокнопка', price:75, ch:'🔘', cat:'symbols'},
  {id:1551, name:'Белая кнопка-квадрат', price:75, ch:'🔳', cat:'symbols'},
  {id:1552, name:'Чёрная кнопка-квадрат', price:75, ch:'🔲', cat:'symbols'},
  {id:1553, name:'Машущая рука', price:75, ch:'👋', cat:'hands'},
  {id:1554, name:'Поднятая тыльная сторона ладони', price:75, ch:'🤚', cat:'hands'},
  {id:1555, name:'Ладонь с растопыренными пальцами', price:75, ch:'🖐️', cat:'hands'},
  {id:1556, name:'Поднятая ладонь', price:75, ch:'✋', cat:'hands'},
  {id:1557, name:'Вулканский салют', price:75, ch:'🖖', cat:'hands'},
  {id:1558, name:'Ладонь вправо', price:75, ch:'🫱', cat:'hands'},
  {id:1559, name:'Ладонь влево', price:75, ch:'🫲', cat:'hands'},
  {id:1560, name:'Ладонь вниз', price:75, ch:'🫳', cat:'hands'},
  {id:1561, name:'Ладонь вверх', price:75, ch:'🫴', cat:'hands'},
  {id:1562, name:'Толчок влево ладонью', price:75, ch:'🫷', cat:'hands'},
  {id:1563, name:'Толчок вправо ладонью', price:75, ch:'🫸', cat:'hands'},
  {id:1564, name:'Жест ОК', price:75, ch:'👌', cat:'hands'},
  {id:1565, name:'Щепотка пальцев', price:75, ch:'🤌', cat:'hands'},
  {id:1566, name:'Щипающая рука', price:75, ch:'🤏', cat:'hands'},
  {id:1567, name:'Знак победы', price:75, ch:'✌️', cat:'hands'},
  {id:1568, name:'Скрещённые пальцы', price:75, ch:'🤞', cat:'hands'},
  {id:1569, name:'Сердечко пальцами', price:75, ch:'🫰', cat:'hands'},
  {id:1570, name:'Жест «Люблю тебя»', price:75, ch:'🤟', cat:'hands'},
  {id:1571, name:'Жест «Рога»', price:75, ch:'🤘', cat:'hands'},
  {id:1572, name:'Жест «Позвони мне»', price:75, ch:'🤙', cat:'hands'},
  {id:1573, name:'Указывает влево', price:75, ch:'👈', cat:'hands'},
  {id:1574, name:'Указывает вправо', price:75, ch:'👉', cat:'hands'},
  {id:1575, name:'Указывает вверх', price:75, ch:'👆', cat:'hands'},
  {id:1576, name:'Указывает вниз', price:75, ch:'👇', cat:'hands'},
  {id:1577, name:'Палец вверх', price:75, ch:'☝️', cat:'hands'},
  {id:1578, name:'Палец на зрителя', price:75, ch:'🫵', cat:'hands'},
  {id:1579, name:'Класс', price:75, ch:'👍', cat:'hands'},
  {id:1580, name:'Не класс', price:75, ch:'👎', cat:'hands'},
  {id:1581, name:'Поднятый кулак', price:75, ch:'✊', cat:'hands'},
  {id:1582, name:'Кулак навстречу', price:75, ch:'👊', cat:'hands'},
  {id:1583, name:'Кулак влево', price:75, ch:'🤛', cat:'hands'},
  {id:1584, name:'Кулак вправо', price:75, ch:'🤜', cat:'hands'},
  {id:1585, name:'Аплодисменты', price:75, ch:'👏', cat:'hands'},
  {id:1586, name:'Руки вверх', price:75, ch:'🙌', cat:'hands'},
  {id:1587, name:'Сердце из ладоней', price:75, ch:'🫶', cat:'hands'},
  {id:1588, name:'Открытые ладони', price:75, ch:'👐', cat:'hands'},
  {id:1589, name:'Сложенные ладони', price:75, ch:'🤲', cat:'hands'},
  {id:1590, name:'Рукопожатие', price:75, ch:'🤝', cat:'hands'},
  {id:1591, name:'Молитвенно сложенные руки', price:75, ch:'🙏', cat:'hands'},
  {id:1592, name:'Пишущая рука', price:75, ch:'✍️', cat:'hands'},
  {id:1593, name:'Лак для ногтей', price:75, ch:'💅', cat:'hands'},
  {id:1594, name:'Селфи', price:75, ch:'🤳', cat:'hands'},
  {id:1595, name:'Накачанная рука', price:75, ch:'💪', cat:'body'},
  {id:1596, name:'Механическая рука', price:75, ch:'🦾', cat:'body'},
  {id:1597, name:'Механическая нога', price:75, ch:'🦿', cat:'body'},
  {id:1598, name:'Нога', price:75, ch:'🦵', cat:'body'},
  {id:1599, name:'Стопа', price:75, ch:'🦶', cat:'body'},
  {id:1600, name:'Ухо', price:75, ch:'👂', cat:'body'},
  {id:1601, name:'Ухо со слуховым аппаратом', price:75, ch:'🦻', cat:'body'},
  {id:1602, name:'Нос', price:75, ch:'👃', cat:'body'},
  {id:1603, name:'Мозг', price:75, ch:'🧠', cat:'body'},
  {id:1604, name:'Анатомическое сердце', price:75, ch:'🫀', cat:'body'},
  {id:1605, name:'Лёгкие', price:75, ch:'🫁', cat:'body'},
  {id:1606, name:'Зуб', price:75, ch:'🦷', cat:'body'},
  {id:1607, name:'Кость', price:75, ch:'🦴', cat:'body'},
  {id:1608, name:'Глаза', price:75, ch:'👀', cat:'body'},
  {id:1609, name:'Глаз', price:75, ch:'👁️', cat:'body'},
  {id:1610, name:'Язык', price:75, ch:'👅', cat:'body'},
  {id:1611, name:'Рот', price:75, ch:'👄', cat:'body'},
  {id:1612, name:'Закушенная губа', price:75, ch:'🫦', cat:'body'},
  {id:1613, name:'Малыш', price:75, ch:'👶', cat:'person'},
  {id:1614, name:'Ребёнок', price:75, ch:'🧒', cat:'person'},
  {id:1615, name:'Мальчик', price:75, ch:'👦', cat:'person'},
  {id:1616, name:'Девочка', price:75, ch:'👧', cat:'person'},
  {id:1617, name:'Человек', price:75, ch:'🧑', cat:'person'},
  {id:1618, name:'Блондин(ка)', price:75, ch:'👱', cat:'person'},
  {id:1619, name:'Мужчина', price:75, ch:'👨', cat:'person'},
  {id:1620, name:'Человек с бородой', price:75, ch:'🧔', cat:'person'},
  {id:1621, name:'Мужчина с бородой', price:75, ch:'🧔‍♂️', cat:'person'},
  {id:1622, name:'Женщина с бородой', price:75, ch:'🧔‍♀️', cat:'person'},
  {id:1623, name:'Рыжий мужчина', price:75, ch:'👨‍🦰', cat:'person'},
  {id:1624, name:'Кудрявый мужчина', price:75, ch:'👨‍🦱', cat:'person'},
  {id:1625, name:'Седой мужчина', price:75, ch:'👨‍🦳', cat:'person'},
  {id:1626, name:'Лысый мужчина', price:75, ch:'👨‍🦲', cat:'person'},
  {id:1627, name:'Женщина', price:75, ch:'👩', cat:'person'},
  {id:1628, name:'Рыжая женщина', price:75, ch:'👩‍🦰', cat:'person'},
  {id:1629, name:'Рыжий человек', price:75, ch:'🧑‍🦰', cat:'person'},
  {id:1630, name:'Кудрявая женщина', price:75, ch:'👩‍🦱', cat:'person'},
  {id:1631, name:'Кудрявый человек', price:75, ch:'🧑‍🦱', cat:'person'},
  {id:1632, name:'Седая женщина', price:75, ch:'👩‍🦳', cat:'person'},
  {id:1633, name:'Седой человек', price:75, ch:'🧑‍🦳', cat:'person'},
  {id:1634, name:'Лысая женщина', price:75, ch:'👩‍🦲', cat:'person'},
  {id:1635, name:'Лысый человек', price:75, ch:'🧑‍🦲', cat:'person'},
  {id:1636, name:'Блондинка', price:75, ch:'👱‍♀️', cat:'person'},
  {id:1637, name:'Блондин', price:75, ch:'👱‍♂️', cat:'person'},
  {id:1638, name:'Пожилой человек', price:75, ch:'🧓', cat:'person'},
  {id:1639, name:'Старик', price:75, ch:'👴', cat:'person'},
  {id:1640, name:'Старушка', price:75, ch:'👵', cat:'person'},
  {id:1641, name:'Хмурый человек', price:75, ch:'🙍', cat:'person'},
  {id:1642, name:'Хмурый мужчина', price:75, ch:'🙍‍♂️', cat:'person'},
  {id:1643, name:'Хмурая женщина', price:75, ch:'🙍‍♀️', cat:'person'},
  {id:1644, name:'Надутый человек', price:75, ch:'🙎', cat:'person'},
  {id:1645, name:'Надутый мужчина', price:75, ch:'🙎‍♂️', cat:'person'},
  {id:1646, name:'Надутая женщина', price:75, ch:'🙎‍♀️', cat:'person'},
  {id:1647, name:'Жест «нет» (человек)', price:75, ch:'🙅', cat:'person'},
  {id:1648, name:'Жест «нет» (мужчина)', price:75, ch:'🙅‍♂️', cat:'person'},
  {id:1649, name:'Жест «нет» (женщина)', price:75, ch:'🙅‍♀️', cat:'person'},
  {id:1650, name:'Жест «ОК» (человек)', price:75, ch:'🙆', cat:'person'},
  {id:1651, name:'Жест «ОК» (мужчина)', price:75, ch:'🙆‍♂️', cat:'person'},
  {id:1652, name:'Жест «ОК» (женщина)', price:75, ch:'🙆‍♀️', cat:'person'},
  {id:1653, name:'Жест-подсказка (человек)', price:75, ch:'💁', cat:'person'},
  {id:1654, name:'Жест-подсказка (мужчина)', price:75, ch:'💁‍♂️', cat:'person'},
  {id:1655, name:'Жест-подсказка (женщина)', price:75, ch:'💁‍♀️', cat:'person'},
  {id:1656, name:'Поднятая рука (человек)', price:75, ch:'🙋', cat:'person'},
  {id:1657, name:'Поднятая рука (мужчина)', price:75, ch:'🙋‍♂️', cat:'person'},
  {id:1658, name:'Поднятая рука (женщина)', price:75, ch:'🙋‍♀️', cat:'person'},
  {id:1659, name:'Глухой человек', price:75, ch:'🧏', cat:'person'},
  {id:1660, name:'Глухой мужчина', price:75, ch:'🧏‍♂️', cat:'person'},
  {id:1661, name:'Глухая женщина', price:75, ch:'🧏‍♀️', cat:'person'},
  {id:1662, name:'Кланяющийся человек', price:75, ch:'🙇', cat:'person'},
  {id:1663, name:'Кланяющийся мужчина', price:75, ch:'🙇‍♂️', cat:'person'},
  {id:1664, name:'Кланяющаяся женщина', price:75, ch:'🙇‍♀️', cat:'person'},
  {id:1665, name:'Фейспалм (человек)', price:75, ch:'🤦', cat:'person'},
  {id:1666, name:'Фейспалм (мужчина)', price:75, ch:'🤦‍♂️', cat:'person'},
  {id:1667, name:'Фейспалм (женщина)', price:75, ch:'🤦‍♀️', cat:'person'},
  {id:1668, name:'Пожимающий плечами (человек)', price:75, ch:'🤷', cat:'person'},
  {id:1669, name:'Пожимающий плечами (мужчина)', price:75, ch:'🤷‍♂️', cat:'person'},
  {id:1670, name:'Пожимающая плечами (женщина)', price:75, ch:'🤷‍♀️', cat:'person'},
  {id:1671, name:'Медработник', price:75, ch:'🧑‍⚕️', cat:'person'},
  {id:1672, name:'Медработник', price:75, ch:'👨‍⚕️', cat:'person'},
  {id:1673, name:'Медработница', price:75, ch:'👩‍⚕️', cat:'person'},
  {id:1674, name:'Студент', price:75, ch:'🧑‍🎓', cat:'person'},
  {id:1675, name:'Студент', price:75, ch:'👨‍🎓', cat:'person'},
  {id:1676, name:'Студентка', price:75, ch:'👩‍🎓', cat:'person'},
  {id:1677, name:'Учитель', price:75, ch:'🧑‍🏫', cat:'person'},
  {id:1678, name:'Учитель', price:75, ch:'👨‍🏫', cat:'person'},
  {id:1679, name:'Учительница', price:75, ch:'👩‍🏫', cat:'person'},
  {id:1680, name:'Судья', price:75, ch:'🧑‍⚖️', cat:'person'},
  {id:1681, name:'Судья', price:75, ch:'👨‍⚖️', cat:'person'},
  {id:1682, name:'Женщина-судья', price:75, ch:'👩‍⚖️', cat:'person'},
  {id:1683, name:'Фермер', price:75, ch:'🧑‍🌾', cat:'person'},
  {id:1684, name:'Фермер', price:75, ch:'👨‍🌾', cat:'person'},
  {id:1685, name:'Женщина-фермер', price:75, ch:'👩‍🌾', cat:'person'},
  {id:1686, name:'Повар', price:75, ch:'🧑‍🍳', cat:'person'},
  {id:1687, name:'Повар', price:75, ch:'👨‍🍳', cat:'person'},
  {id:1688, name:'Женщина-повар', price:75, ch:'👩‍🍳', cat:'person'},
  {id:1689, name:'Механик', price:75, ch:'🧑‍🔧', cat:'person'},
  {id:1690, name:'Механик', price:75, ch:'👨‍🔧', cat:'person'},
  {id:1691, name:'Женщина-механик', price:75, ch:'👩‍🔧', cat:'person'},
  {id:1692, name:'Рабочий', price:75, ch:'🧑‍🏭', cat:'person'},
  {id:1693, name:'Рабочий', price:75, ch:'👨‍🏭', cat:'person'},
  {id:1694, name:'Работница', price:75, ch:'👩‍🏭', cat:'person'},
  {id:1695, name:'Офисный работник', price:75, ch:'🧑‍💼', cat:'person'},
  {id:1696, name:'Офисный работник', price:75, ch:'👨‍💼', cat:'person'},
  {id:1697, name:'Офисная работница', price:75, ch:'👩‍💼', cat:'person'},
  {id:1698, name:'Учёный', price:75, ch:'🧑‍🔬', cat:'person'},
  {id:1699, name:'Учёный', price:75, ch:'👨‍🔬', cat:'person'},
  {id:1700, name:'Женщина-учёный', price:75, ch:'👩‍🔬', cat:'person'},
  {id:1701, name:'IT-специалист', price:75, ch:'🧑‍💻', cat:'person'},
  {id:1702, name:'IT-специалист', price:75, ch:'👨‍💻', cat:'person'},
  {id:1703, name:'Женщина IT-специалист', price:75, ch:'👩‍💻', cat:'person'},
  {id:1704, name:'Певец', price:75, ch:'🧑‍🎤', cat:'person'},
  {id:1705, name:'Певец', price:75, ch:'👨‍🎤', cat:'person'},
  {id:1706, name:'Певица', price:75, ch:'👩‍🎤', cat:'person'},
  {id:1707, name:'Художник', price:75, ch:'🧑‍🎨', cat:'person'},
  {id:1708, name:'Художник', price:75, ch:'👨‍🎨', cat:'person'},
  {id:1709, name:'Художница', price:75, ch:'👩‍🎨', cat:'person'},
  {id:1710, name:'Пилот', price:75, ch:'🧑‍✈️', cat:'person'},
  {id:1711, name:'Пилот', price:75, ch:'👨‍✈️', cat:'person'},
  {id:1712, name:'Женщина-пилот', price:75, ch:'👩‍✈️', cat:'person'},
  {id:1713, name:'Космонавт', price:75, ch:'🧑‍🚀', cat:'person'},
  {id:1714, name:'Космонавт', price:75, ch:'👨‍🚀', cat:'person'},
  {id:1715, name:'Женщина-космонавт', price:75, ch:'👩‍🚀', cat:'person'},
  {id:1716, name:'Пожарный', price:75, ch:'🧑‍🚒', cat:'person'},
  {id:1717, name:'Пожарный', price:75, ch:'👨‍🚒', cat:'person'},
  {id:1718, name:'Женщина-пожарный', price:75, ch:'👩‍🚒', cat:'person'},
  {id:1719, name:'Полицейский', price:75, ch:'👮', cat:'person'},
  {id:1720, name:'Полицейский', price:75, ch:'👮‍♂️', cat:'person'},
  {id:1721, name:'Женщина-полицейский', price:75, ch:'👮‍♀️', cat:'person'},
  {id:1722, name:'Детектив', price:75, ch:'🕵️', cat:'person'},
  {id:1723, name:'Детектив', price:75, ch:'🕵️‍♂️', cat:'person'},
  {id:1724, name:'Женщина-детектив', price:75, ch:'🕵️‍♀️', cat:'person'},
  {id:1725, name:'Гвардеец', price:75, ch:'💂', cat:'person'},
  {id:1726, name:'Гвардеец', price:75, ch:'💂‍♂️', cat:'person'},
  {id:1727, name:'Женщина-гвардеец', price:75, ch:'💂‍♀️', cat:'person'},
  {id:1728, name:'Строитель', price:75, ch:'👷', cat:'person'},
  {id:1729, name:'Строитель', price:75, ch:'👷‍♂️', cat:'person'},
  {id:1730, name:'Женщина-строитель', price:75, ch:'👷‍♀️', cat:'person'},
  {id:1731, name:'Человек в короне', price:75, ch:'🫅', cat:'person'},
  {id:1732, name:'Принц', price:75, ch:'🤴', cat:'person'},
  {id:1733, name:'Принцесса', price:75, ch:'👸', cat:'person'},
  {id:1734, name:'Человек в тюрбане', price:75, ch:'👳', cat:'person'},
  {id:1735, name:'Мужчина в тюрбане', price:75, ch:'👳‍♂️', cat:'person'},
  {id:1736, name:'Женщина в тюрбане', price:75, ch:'👳‍♀️', cat:'person'},
  {id:1737, name:'Человек в тюбетейке', price:75, ch:'👲', cat:'person'},
  {id:1738, name:'Женщина в платке', price:75, ch:'🧕', cat:'person'},
  {id:1739, name:'Человек в смокинге', price:75, ch:'🤵', cat:'person'},
  {id:1740, name:'Мужчина в смокинге', price:75, ch:'🤵‍♂️', cat:'person'},
  {id:1741, name:'Женщина в смокинге', price:75, ch:'🤵‍♀️', cat:'person'},
  {id:1742, name:'Человек под вуалью', price:75, ch:'👰', cat:'person'},
  {id:1743, name:'Мужчина под вуалью', price:75, ch:'👰‍♂️', cat:'person'},
  {id:1744, name:'Невеста под вуалью', price:75, ch:'👰‍♀️', cat:'person'},
  {id:1745, name:'Беременная женщина', price:75, ch:'🤰', cat:'person'},
  {id:1746, name:'Беременный мужчина', price:75, ch:'🫃', cat:'person'},
  {id:1747, name:'Беременный человек', price:75, ch:'🫄', cat:'person'},
  {id:1748, name:'Кормление грудью', price:75, ch:'🤱', cat:'person'},
  {id:1749, name:'Женщина кормит малыша', price:75, ch:'👩‍🍼', cat:'person'},
  {id:1750, name:'Мужчина кормит малыша', price:75, ch:'👨‍🍼', cat:'person'},
  {id:1751, name:'Человек кормит малыша', price:75, ch:'🧑‍🍼', cat:'person'},
  {id:1752, name:'Ангелочек', price:75, ch:'👼', cat:'myth'},
  {id:1753, name:'Санта-Клаус', price:75, ch:'🎅', cat:'myth'},
  {id:1754, name:'Миссис Клаус', price:75, ch:'🤶', cat:'myth'},
  {id:1755, name:'Клаус', price:75, ch:'🧑‍🎄', cat:'myth'},
  {id:1756, name:'Супергерой', price:75, ch:'🦸', cat:'myth'},
  {id:1757, name:'Суперзлодей', price:75, ch:'🦹', cat:'myth'},
  {id:1758, name:'Маг', price:75, ch:'🧙', cat:'myth'},
  {id:1759, name:'Фея', price:75, ch:'🧚', cat:'myth'},
  {id:1760, name:'Вампир', price:75, ch:'🧛', cat:'myth'},
  {id:1761, name:'Тритон', price:75, ch:'🧜‍♂️', cat:'myth'},
  {id:1762, name:'Русалка', price:75, ch:'🧜‍♀️', cat:'myth'},
  {id:1763, name:'Эльф', price:75, ch:'🧝', cat:'myth'},
  {id:1764, name:'Эльф', price:75, ch:'🧝‍♂️', cat:'myth'},
  {id:1765, name:'Эльфийка', price:75, ch:'🧝‍♀️', cat:'myth'},
  {id:1766, name:'Джинн', price:75, ch:'🧞‍♂️', cat:'myth'},
  {id:1767, name:'Джинн-женщина', price:75, ch:'🧞‍♀️', cat:'myth'},
  {id:1768, name:'Зомби', price:75, ch:'🧟‍♂️', cat:'myth'},
  {id:1769, name:'Зомби-женщина', price:75, ch:'🧟‍♀️', cat:'myth'},
  {id:1770, name:'Тролль', price:75, ch:'🧌', cat:'myth'},
  {id:1771, name:'Волосатое существо', price:75, ch:'🫈', cat:'myth'},
  {id:1772, name:'Массаж', price:75, ch:'💆', cat:'person'},
  {id:1773, name:'Массаж (мужчина)', price:75, ch:'💆‍♂️', cat:'person'},
  {id:1774, name:'Массаж (женщина)', price:75, ch:'💆‍♀️', cat:'person'},
  {id:1775, name:'Стрижка', price:75, ch:'💇', cat:'person'},
  {id:1776, name:'Стрижка (мужчина)', price:75, ch:'💇‍♂️', cat:'person'},
  {id:1777, name:'Стрижка (женщина)', price:75, ch:'💇‍♀️', cat:'person'},
  {id:1778, name:'Идущий человек', price:75, ch:'🚶', cat:'person'},
  {id:1779, name:'Идущий мужчина', price:75, ch:'🚶‍♂️', cat:'person'},
  {id:1780, name:'Идущая женщина', price:75, ch:'🚶‍♀️', cat:'person'},
  {id:1781, name:'Идёт вправо', price:75, ch:'🚶‍➡️', cat:'person'},
  {id:1782, name:'Идёт вправо (женщина)', price:75, ch:'🚶‍♀️‍➡️', cat:'person'},
  {id:1783, name:'Идёт вправо (мужчина)', price:75, ch:'🚶‍♂️‍➡️', cat:'person'},
  {id:1784, name:'Стоящий человек', price:75, ch:'🧍', cat:'person'},
  {id:1785, name:'Стоящий мужчина', price:75, ch:'🧍‍♂️', cat:'person'},
  {id:1786, name:'Стоящая женщина', price:75, ch:'🧍‍♀️', cat:'person'},
  {id:1787, name:'На коленях', price:75, ch:'🧎', cat:'person'},
  {id:1788, name:'На коленях (мужчина)', price:75, ch:'🧎‍♂️', cat:'person'},
  {id:1789, name:'На коленях (женщина)', price:75, ch:'🧎‍♀️', cat:'person'},
  {id:1790, name:'На коленях, вправо', price:75, ch:'🧎‍➡️', cat:'person'},
  {id:1791, name:'На коленях, вправо (женщина)', price:75, ch:'🧎‍♀️‍➡️', cat:'person'},
  {id:1792, name:'На коленях, вправо (мужчина)', price:75, ch:'🧎‍♂️‍➡️', cat:'person'},
  {id:1793, name:'С белой тростью', price:75, ch:'🧑‍🦯', cat:'person'},
  {id:1794, name:'С белой тростью, вправо', price:75, ch:'🧑‍🦯‍➡️', cat:'person'},
  {id:1795, name:'С белой тростью (мужчина)', price:75, ch:'👨‍🦯', cat:'person'},
  {id:1796, name:'С белой тростью, вправо (мужчина)', price:75, ch:'👨‍🦯‍➡️', cat:'person'},
  {id:1797, name:'С белой тростью (женщина)', price:75, ch:'👩‍🦯', cat:'person'},
  {id:1798, name:'С белой тростью, вправо (женщина)', price:75, ch:'👩‍🦯‍➡️', cat:'person'},
  {id:1799, name:'В электроколяске', price:75, ch:'🧑‍🦼', cat:'person'},
  {id:1800, name:'В электроколяске, вправо', price:75, ch:'🧑‍🦼‍➡️', cat:'person'},
  {id:1801, name:'В электроколяске (мужчина)', price:75, ch:'👨‍🦼', cat:'person'},
  {id:1802, name:'В электроколяске, вправо (мужчина)', price:75, ch:'👨‍🦼‍➡️', cat:'person'},
  {id:1803, name:'В электроколяске (женщина)', price:75, ch:'👩‍🦼', cat:'person'},
  {id:1804, name:'В электроколяске, вправо (женщина)', price:75, ch:'👩‍🦼‍➡️', cat:'person'},
  {id:1805, name:'В инвалидной коляске', price:75, ch:'🧑‍🦽', cat:'person'},
  {id:1806, name:'В инвалидной коляске, вправо', price:75, ch:'🧑‍🦽‍➡️', cat:'person'},
  {id:1807, name:'В инвалидной коляске (мужчина)', price:75, ch:'👨‍🦽', cat:'person'},
  {id:1808, name:'В инвалидной коляске, вправо (мужчина)', price:75, ch:'👨‍🦽‍➡️', cat:'person'},
  {id:1809, name:'В инвалидной коляске (женщина)', price:75, ch:'👩‍🦽', cat:'person'},
  {id:1810, name:'В инвалидной коляске, вправо (женщина)', price:75, ch:'👩‍🦽‍➡️', cat:'person'},
  {id:1811, name:'Бегущий человек', price:75, ch:'🏃', cat:'person'},
  {id:1812, name:'Бегущий мужчина', price:75, ch:'🏃‍♂️', cat:'person'},
  {id:1813, name:'Бегущая женщина', price:75, ch:'🏃‍♀️', cat:'person'},
  {id:1814, name:'Бежит вправо', price:75, ch:'🏃‍➡️', cat:'person'},
  {id:1815, name:'Бежит вправо (женщина)', price:75, ch:'🏃‍♀️‍➡️', cat:'person'},
  {id:1816, name:'Бежит вправо (мужчина)', price:75, ch:'🏃‍♂️‍➡️', cat:'person'},
  {id:1817, name:'Артист балета', price:75, ch:'🧑‍🩰', cat:'person'},
  {id:1818, name:'Танцующая женщина', price:75, ch:'💃', cat:'person'},
  {id:1819, name:'Танцующий мужчина', price:75, ch:'🕺', cat:'person'},
  {id:1820, name:'Левитирующий в костюме', price:75, ch:'🕴️', cat:'person'},
  {id:1821, name:'Люди с ушками зайца', price:75, ch:'👯', cat:'person'},
  {id:1822, name:'Мужчины с ушками зайца', price:75, ch:'👯‍♂️', cat:'person'},
  {id:1823, name:'Женщины с ушками зайца', price:75, ch:'👯‍♀️', cat:'person'},
  {id:1824, name:'В парной', price:75, ch:'🧖', cat:'person'},
  {id:1825, name:'В парной (мужчина)', price:75, ch:'🧖‍♂️', cat:'person'},
  {id:1826, name:'В парной (женщина)', price:75, ch:'🧖‍♀️', cat:'person'},
  {id:1827, name:'Скалолаз', price:75, ch:'🧗', cat:'person'},
  {id:1828, name:'Скалолаз (мужчина)', price:75, ch:'🧗‍♂️', cat:'person'},
  {id:1829, name:'Скалолазка', price:75, ch:'🧗‍♀️', cat:'person'},
  {id:1830, name:'Фехтовальщик', price:75, ch:'🤺', cat:'person'},
  {id:1831, name:'Скачки', price:75, ch:'🏇', cat:'person'},
  {id:1832, name:'Лыжник', price:75, ch:'⛷️', cat:'person'},
  {id:1833, name:'Сноубордист', price:75, ch:'🏂', cat:'person'},
  {id:1834, name:'Гольфист', price:75, ch:'🏌️', cat:'person'},
  {id:1835, name:'Гольфист', price:75, ch:'🏌️‍♂️', cat:'person'},
  {id:1836, name:'Гольфистка', price:75, ch:'🏌️‍♀️', cat:'person'},
  {id:1837, name:'Сёрфингист', price:75, ch:'🏄', cat:'person'},
  {id:1838, name:'Сёрфингист', price:75, ch:'🏄‍♂️', cat:'person'},
  {id:1839, name:'Сёрфингистка', price:75, ch:'🏄‍♀️', cat:'person'},
  {id:1840, name:'Гребец', price:75, ch:'🚣', cat:'person'},
  {id:1841, name:'Гребец', price:75, ch:'🚣‍♂️', cat:'person'},
  {id:1842, name:'Женщина-гребец', price:75, ch:'🚣‍♀️', cat:'person'},
  {id:1843, name:'Пловец', price:75, ch:'🏊', cat:'person'},
  {id:1844, name:'Пловец', price:75, ch:'🏊‍♂️', cat:'person'},
  {id:1845, name:'Пловчиха', price:75, ch:'🏊‍♀️', cat:'person'},
  {id:1846, name:'Игрок с мячом', price:75, ch:'⛹️', cat:'person'},
  {id:1847, name:'Игрок с мячом', price:75, ch:'⛹️‍♂️', cat:'person'},
  {id:1848, name:'Женщина с мячом', price:75, ch:'⛹️‍♀️', cat:'person'},
  {id:1849, name:'Тяжелоатлет', price:75, ch:'🏋️', cat:'person'},
  {id:1850, name:'Тяжелоатлет', price:75, ch:'🏋️‍♂️', cat:'person'},
  {id:1851, name:'Тяжелоатлетка', price:75, ch:'🏋️‍♀️', cat:'person'},
  {id:1852, name:'Велосипедист', price:75, ch:'🚴', cat:'person'},
  {id:1853, name:'Велосипедист', price:75, ch:'🚴‍♂️', cat:'person'},
  {id:1854, name:'Велосипедистка', price:75, ch:'🚴‍♀️', cat:'person'},
  {id:1855, name:'Маунтинбайкер', price:75, ch:'🚵', cat:'person'},
  {id:1856, name:'Маунтинбайкер', price:75, ch:'🚵‍♂️', cat:'person'},
  {id:1857, name:'Женщина-маунтинбайкер', price:75, ch:'🚵‍♀️', cat:'person'},
  {id:1858, name:'Колесо (гимнастика)', price:75, ch:'🤸', cat:'person'},
  {id:1859, name:'Колесо (мужчина)', price:75, ch:'🤸‍♂️', cat:'person'},
  {id:1860, name:'Колесо (женщина)', price:75, ch:'🤸‍♀️', cat:'person'},
  {id:1861, name:'Борцы', price:75, ch:'🤼', cat:'person'},
  {id:1862, name:'Борцы (мужчины)', price:75, ch:'🤼‍♂️', cat:'person'},
  {id:1863, name:'Борцы (женщины)', price:75, ch:'🤼‍♀️', cat:'person'},
  {id:1864, name:'Ватерполист', price:75, ch:'🤽', cat:'person'},
  {id:1865, name:'Ватерполист', price:75, ch:'🤽‍♂️', cat:'person'},
  {id:1866, name:'Ватерполистка', price:75, ch:'🤽‍♀️', cat:'person'},
  {id:1867, name:'Гандболист', price:75, ch:'🤾', cat:'person'},
  {id:1868, name:'Гандболист', price:75, ch:'🤾‍♂️', cat:'person'},
  {id:1869, name:'Гандболистка', price:75, ch:'🤾‍♀️', cat:'person'},
  {id:1870, name:'Жонглёр', price:75, ch:'🤹', cat:'person'},
  {id:1871, name:'Жонглёр', price:75, ch:'🤹‍♂️', cat:'person'},
  {id:1872, name:'Женщина-жонглёр', price:75, ch:'🤹‍♀️', cat:'person'},
  {id:1873, name:'Медитация', price:75, ch:'🧘', cat:'person'},
  {id:1874, name:'Медитация (мужчина)', price:75, ch:'🧘‍♂️', cat:'person'},
  {id:1875, name:'Медитация (женщина)', price:75, ch:'🧘‍♀️', cat:'person'},
  {id:1876, name:'Принимает ванну', price:75, ch:'🛀', cat:'person'},
  {id:1877, name:'В постели', price:75, ch:'🛌', cat:'person'},
  {id:1878, name:'Держатся за руки', price:75, ch:'🧑‍🤝‍🧑', cat:'family'},
  {id:1879, name:'Женщины держатся за руки', price:75, ch:'👭', cat:'family'},
  {id:1880, name:'Мужчина и женщина за руки', price:75, ch:'👫', cat:'family'},
  {id:1881, name:'Мужчины держатся за руки', price:75, ch:'👬', cat:'family'},
  {id:1882, name:'Поцелуй', price:75, ch:'💏', cat:'family'},
  {id:1883, name:'Поцелуй (женщина и мужчина)', price:75, ch:'👩‍❤️‍💋‍👨', cat:'family'},
  {id:1884, name:'Поцелуй (двое мужчин)', price:75, ch:'👨‍❤️‍💋‍👨', cat:'family'},
  {id:1885, name:'Поцелуй (две женщины)', price:75, ch:'👩‍❤️‍💋‍👩', cat:'family'},
  {id:1886, name:'Пара с сердцем', price:75, ch:'💑', cat:'family'},
  {id:1887, name:'Пара с сердцем (женщина и мужчина)', price:75, ch:'👩‍❤️‍👨', cat:'family'},
  {id:1888, name:'Пара с сердцем (двое мужчин)', price:75, ch:'👨‍❤️‍👨', cat:'family'},
  {id:1889, name:'Пара с сердцем (две женщины)', price:75, ch:'👩‍❤️‍👩', cat:'family'},
  {id:1890, name:'Семья: папа, мама, сын', price:75, ch:'👨‍👩‍👦', cat:'family'},
  {id:1891, name:'Семья: папа, мама, дочь', price:75, ch:'👨‍👩‍👧', cat:'family'},
  {id:1892, name:'Семья: папа, мама, дочь и сын', price:75, ch:'👨‍👩‍👧‍👦', cat:'family'},
  {id:1893, name:'Семья: папа, мама, два сына', price:75, ch:'👨‍👩‍👦‍👦', cat:'family'},
  {id:1894, name:'Семья: папа, мама, две дочери', price:75, ch:'👨‍👩‍👧‍👧', cat:'family'},
  {id:1895, name:'Семья: два папы, сын', price:75, ch:'👨‍👨‍👦', cat:'family'},
  {id:1896, name:'Семья: два папы, дочь', price:75, ch:'👨‍👨‍👧', cat:'family'},
  {id:1897, name:'Семья: два папы, дочь и сын', price:75, ch:'👨‍👨‍👧‍👦', cat:'family'},
  {id:1898, name:'Семья: два папы, два сына', price:75, ch:'👨‍👨‍👦‍👦', cat:'family'},
  {id:1899, name:'Семья: два папы, две дочери', price:75, ch:'👨‍👨‍👧‍👧', cat:'family'},
  {id:1900, name:'Семья: две мамы, сын', price:75, ch:'👩‍👩‍👦', cat:'family'},
  {id:1901, name:'Семья: две мамы, дочь', price:75, ch:'👩‍👩‍👧', cat:'family'},
  {id:1902, name:'Семья: две мамы, дочь и сын', price:75, ch:'👩‍👩‍👧‍👦', cat:'family'},
  {id:1903, name:'Семья: две мамы, два сына', price:75, ch:'👩‍👩‍👦‍👦', cat:'family'},
  {id:1904, name:'Семья: две мамы, две дочери', price:75, ch:'👩‍👩‍👧‍👧', cat:'family'},
  {id:1905, name:'Семья: папа и сын', price:75, ch:'👨‍👦', cat:'family'},
  {id:1906, name:'Семья: папа и два сына', price:75, ch:'👨‍👦‍👦', cat:'family'},
  {id:1907, name:'Семья: папа и дочь', price:75, ch:'👨‍👧', cat:'family'},
  {id:1908, name:'Семья: папа, дочь и сын', price:75, ch:'👨‍👧‍👦', cat:'family'},
  {id:1909, name:'Семья: папа и две дочери', price:75, ch:'👨‍👧‍👧', cat:'family'},
  {id:1910, name:'Семья: мама и сын', price:75, ch:'👩‍👦', cat:'family'},
  {id:1911, name:'Семья: мама и два сына', price:75, ch:'👩‍👦‍👦', cat:'family'},
  {id:1912, name:'Семья: мама и дочь', price:75, ch:'👩‍👧', cat:'family'},
  {id:1913, name:'Семья: мама, дочь и сын', price:75, ch:'👩‍👧‍👦', cat:'family'},
  {id:1914, name:'Семья: мама и две дочери', price:75, ch:'👩‍👧‍👧', cat:'family'},
  {id:1915, name:'Говорящая голова', price:75, ch:'🗣️', cat:'person'},
  {id:1916, name:'Силуэт человека', price:75, ch:'👤', cat:'person'},
  {id:1917, name:'Силуэты людей', price:75, ch:'👥', cat:'person'},
  {id:1918, name:'Объятия', price:75, ch:'🫂', cat:'person'},
  {id:1919, name:'Семья', price:75, ch:'👪', cat:'family'},
  {id:1920, name:'Семья: 2 взрослых, ребёнок', price:75, ch:'🧑‍🧑‍🧒', cat:'family'},
  {id:1921, name:'Семья: 2 взрослых, 2 ребёнка', price:75, ch:'🧑‍🧑‍🧒‍🧒', cat:'family'},
  {id:1922, name:'Семья: взрослый и ребёнок', price:75, ch:'🧑‍🧒', cat:'family'},
  {id:1923, name:'Семья: взрослый, 2 ребёнка', price:75, ch:'🧑‍🧒‍🧒', cat:'family'},
  {id:1924, name:'Следы', price:75, ch:'👣', cat:'person'},
  {id:1925, name:'Отпечаток пальца', price:75, ch:'🫆', cat:'person'},
  {id:1926, name:'Мешки под глазами', price:75, ch:'🫩', cat:'faces'},
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
  {id:66, name:"Спицы", price:300, style:"spokes", cat:'classic'},
  {id:67, name:"Матрёшка", price:300, style:"nestedShapes", cat:'classic'},
  {id:68, name:"Слияние", price:300, style:"blendCircles", cat:'classic'},
  {id:69, name:"Рябь", price:300, style:"rippleDot", cat:'classic'},
  {id:70, name:"Пластинка", price:300, style:"grooveDisc", cat:'classic'},
  {id:71, name:"Уровень", price:300, style:"fillLevel", cat:'classic'},
  {id:72, name:"Плетение", price:300, style:"weavedBands", cat:'classic'},
  {id:73, name:"Созвездие колец", price:300, style:"ringCluster", cat:'classic'},
  {id:74, name:"Лунные фазы", price:300, style:"moonGrid", cat:'classic'},
  {id:75, name:"Лестница", price:300, style:"diagStairs", cat:'classic'},
  {id:76, name:"Эквалайзер", price:300, style:"eqBars", cat:'classic'},
  {id:77, name:"Изо-треугольник", price:300, style:"isoTriangle", cat:'classic'},
  {id:78, name:"Коллаж", price:300, style:"shapeCollage", cat:'classic'},
  {id:79, name:"Спираль в треугольнике", price:300, style:"spiralClip", cat:'classic'},
  {id:80, name:"Тоннель звёзд", price:300, style:"starTunnel", cat:'classic'},
  {id:81, name:"Спиральная паутина", price:300, style:"spiralWeb", cat:'classic'},
  {id:82, name:"Крест-луч", price:300, style:"crossBeam", cat:'classic'},
  {id:83, name:"Веер дуг", price:300, style:"arcFan", cat:'classic'},
  {id:84, name:"Ромб-сфера", price:300, style:"diamondSphere", cat:'classic'},
  {id:85, name:"Скрученный шар", price:300, style:"twistedSphere", cat:'classic'},
  {id:86, name:"Лепестки-линзы", price:300, style:"lensPetals", cat:'classic'},
  {id:87, name:"Объёмный шар", price:300, style:"shadedBall", cat:'classic'},
  {id:88, name:"Бант из колец", price:300, style:"ringBow", cat:'classic'},
  {id:89, name:"Кристалл-огранка", price:300, style:"gemFacet", cat:'classic'},
  {id:90, name:"Кубооктаэдр", price:500, style:"cuboctahedron", cat:'sacred', fact:'Vector Equilibrium — 12 вершин, 24 ребра длины √2'}, // Vector Equilibrium — 12 вершин, 24 ребра длины √2, проверено скриптом
  {id:91, name:"Шри-Янтра", price:500, style:"sriYantra", cat:'sacred', fact:'Настоящие опубликованные координаты — 18 подлинных тройных пересечений'}, // раньше Sri Yantra — реальные опубликованные координаты, 18 подлинных тройных пересечений, проверено скриптом
  {id:92, name:"Печать", price:500, style:"sealNested", cat:'sacred', fact:'Наша конструкция — 3 звезды Давида, масштаб ×1/√3 и поворот +30° на слой'}, // наша конструкция — 3 звезды Давида, масштаб ×1/√3 и поворот +30° посчитаны, не подобраны
  {id:93, name:"Звезда гириха", price:500, style:"girihDecagon", cat:'sacred', fact:'Исламский геометрический узор — угол 54°, декаграмма {10/3}'}, // раньше «Гирих: декагон» — угол 54° выведен и проверен на всех 10 рёбрах
  {id:94, name:"Шляпа", price:500, style:"hatTile", cat:'sacred', fact:'Hat-тайл (Einstein, 2023) — первая известная апериодическая мозаика ОДНОЙ плиткой'}, // раньше Hat-тайл — координаты из настоящего кода автора (isohedral/hatviz), Einstein-плитка 2023 года
  {id:95, name:"Шляпа и Метатрон", price:500, style:"hatMetatron", cat:'sacred', fact:'Композиция Hat-тайла (2023) и Куба Метатрона'}, // раньше «Composite: Hat + Метатрон»
  {id:96, name:"Рыбий пузырь", price:500, style:"vesicaPiscis", cat:'sacred', fact:'Vesica Piscis — пересечение двух равных кругов через центр друг друга, древний символ'}, // раньше Vesica Piscis
  {id:97, name:"Инь-Янь", price:500, style:"yinyangFlash", cat:'sacred', fact:'Тайцзиту — классический даосский символ баланса'},
  {id:98, name:"Золотая спираль", price:500, style:"goldenSpiral", cat:'sacred', fact:'Квадраты Фибоначчи 1,1,2,3,5,8,13 — стыкуются без щелей'}, // квадраты Фибоначчи, проверено скриптом на стыковку без щелей
  {id:99, name:"Аполлониева прокладка", price:500, style:"apollonian", cat:'sacred', fact:'Теорема Декарта — каждый круг касается всех трёх соседей'}, // теорема Декарта, все касания проверены скриптом
  {id:100, name:"Октаграмма", price:300, style:"octagram", cat:'classic'},
  {id:101, name:"Куб Метатрона", price:500, style:"metatronCube", cat:'sacred', fact:'13 точек Fruit of Life, все 78 связей (C(13,2))'}, // 13 точек Fruit of Life, ровно 78 линий (C(13,2)) — проверено скриптом
  {id:102, name:"Цветок жизни", price:500, style:"flowerOfLife", cat:'sacred', fact:'19 кругов на треугольной решётке — шаг узла равен радиусу'}, // 19 кругов на настоящей треугольной решётке, шаг = радиус — проверено скриптом
  {id:103, name:"Бант-треугольники", price:300, style:"bowtieTri", cat:'classic'},
  /* 05.09.2026 — 13 «спорных» из этой же партии: владелец сам проверит вживую и решит по
     каждой отдельно (оставить/убрать), поэтому цены здесь ниже — самый дешёвый тир каталога. */
  {id:104, name:"Компас-звезда", price:300, style:"denseSpokes", cat:'classic'},
  {id:105, name:"Сноп линий", price:300, style:"convergeBeam", cat:'classic'},
  {id:106, name:"Кластер пластинок", price:300, style:"grooveClusters", cat:'classic'},
  {id:107, name:"Полумесяц колец", price:300, style:"crescentGrooves", cat:'classic'},
  {id:108, name:"Зубчатый круг", price:300, style:"gearBurst", cat:'classic'},
  {id:109, name:"Цветок-вихрь", price:300, style:"pinwheelFlower", cat:'classic'},
  {id:110, name:"Мельница", price:300, style:"pieMill", cat:'classic'},
  {id:111, name:"Гексагон", price:300, style:"plainHex", cat:'classic'},
  {id:112, name:"Волна ромбов", price:300, style:"diamondWave", cat:'classic'},
  {id:113, name:"Мозаика", price:300, style:"barMosaic", cat:'classic'},
  {id:114, name:"Треугольная мандала", price:300, style:"triMandala", cat:'classic'},
  {id:115, name:"Треугольник Рёло", price:300, style:"reuleaux", cat:'classic'},
  {id:116, name:"Додекаграмма", price:300, style:"dodecagram", cat:'classic'},
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
  {id:117, name:"Ромб", price:500, style:"sfRomb", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=4, n1=n2=n3=1'},
  {id:118, name:"Морская звезда", price:500, style:"sfStarfish", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=5, n1=0.1, n2=n3=1.7'},
  {id:119, name:"Соцветие", price:500, style:"sfBlossom", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=6, n1=3, n2=n3=8'},
  {id:120, name:"Морской ёж", price:500, style:"sfUrchin", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=8, n1=n2=n3=0.3'},
  {id:121, name:"Галька", price:500, style:"sfPebble", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=6, n1=40, n2=n3=10'},
  {id:122, name:"Плита", price:500, style:"sfSlab", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=4, n1=n2=n3=1000'},
  {id:123, name:"Щит", price:500, style:"sfShield", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=3, n1=60, n2=55, n3=30'},
  {id:124, name:"Венец", price:500, style:"sfCrown", cat:'superformula', since:'1.478.82', fact:'Йохан Гилис, 2003, из ботаники — r=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(-1/n1), у этой фигуры: m=14, n1=n2=n3=30'},
  /* 05.09.2026 «Розы Родонеи» — r=cos(k·θ), k нечётное → k лепестков, k чётное → 2k
     (Гвидо Гранди, 1723-28). Одна общая функция в render.js, отличаются только k.
     Проверено численно (замкнутость) и визуально до вставки — см. GENERATIVE-GEOMETRY.md. */
  {id:125, name:"Клевер", price:500, style:"roseClover", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=2'},
  {id:126, name:"Трилистник", price:500, style:"roseTrefoil", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=3'},
  {id:127, name:"Розетка", price:500, style:"roseRosette", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=4'},
  {id:128, name:"Пятилистник", price:500, style:"rosePetals5", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=5'},
  {id:129, name:"Хризантема", price:500, style:"roseChrysanthemum", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=6'},
  {id:130, name:"Семицветик", price:500, style:"roseSeven", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=7'},
  {id:131, name:"Веер", price:500, style:"roseFan", cat:'roses', since:'1.478.83', fact:'«Родонея» = роза по-гречески (Гвидо Гранди, 1723-28) — r=cos(k·θ), у этой фигуры: k=8'},
  /* 05.09.2026 «L-система» — F→F[+F]F[-F]F, угол 25.7°, Prusinkiewicz & Lindenmayer, «The
     Algorithmic Beauty of Plants» (1990), fig. 1.24(a). Не кривая — порождающая грамматика:
     строка переписывается n раз, потом читается черепашкой (F=шаг вперёд, +/-=поворот,
     []=запомнить/вернуть точку). n=4+ сливается в кашу на размере Вспышки — проверено
     визуально, не вставлено. См. .knowledge/GENERATIVE-GEOMETRY.md. */
  {id:132, name:"Ветвление", price:500, style:"lsysBranch", cat:'lsystem', since:'1.478.88', fact:'Prusinkiewicz & Lindenmayer, 1990 — F→F[+F]F[-F]F, угол 25.7°, у этой фигуры: 2 повторения правила'},
  {id:133, name:"Папоротник", price:500, style:"lsysFern", cat:'lsystem', since:'1.478.88', fact:'Prusinkiewicz & Lindenmayer, 1990 — F→F[+F]F[-F]F, угол 25.7°, у этой фигуры: 3 повторения правила'},
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
  mode:'classic', hits:0, bonuses:0, nearMiss:0, everDash:0, everNova:0, starsSpawned:0, // v1.42.0 «Пять дисциплин»: режим забега + счётчики паспорта (v1.70.0: Пакт и «Без ударов» удалены; 07.09.2026: 100% удалён)
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
const RELAY_LEG_DIST=1000; // 10.09.2026 (владелец): было 300 — «полёт только начался и конец сразу», мало времени почувствовать этап
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
  const kinds=['shield','magnet','slowmo','life','dash','nova']; // v1.40.0 «Шесть жестов»: классика + Таран + Сверхновая; freeze («Стоп-кадр») убран 08.09.2026 — добавлен 06.09.2026 без отдельного явного «да» владельца (взят прямо из .knowledge/GAME-MODES.md, помеченного «каталог идей, не боевой список»), тот же класс проблемы, что уже был у Bullet Time
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
      const ownSky = (runMode==='classic' || runMode==='caravan'); // 05.09.2026: Caravan — тоже свежий случайный сид на забег, как Classic
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
    if ((runMode==='classic' || runMode==='caravan') && grSeed && typeof keyRNG==='function'){ // 05.09.2026: Caravan — тоже своё небо
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
  if (starT<=0){ starT = withTrack('st', function(){
    // 06.09.2026 «Биатлон»: звёзды идут только внутри рубежа (300-500м, 800-1000м) — скоростные
    // отрезки нарочно пустые от них, как в реальном биатлоне лыжня пуста от мишеней.
    const biathlonGate = S.mode!=='biathlon' || (S.dist>=BIATHLON_R1_START&&S.dist<BIATHLON_R1_END) || (S.dist>=BIATHLON_R2_START&&S.dist<BIATHLON_R2_END);
    if (biathlonGate) spawnStar();
    return mapRand(.8,1.5); }); } // честный базовый темп (эталон v1.10.0)
  powT -= trackDt;
  if (powT<=0){ powT = withTrack('pw', function(){
    if (!(S.mode==='custom' && S.customB===0) && S.mode!=='slalom') spawnPowerup(); // 06.09.2026: Слалом — без бонусов, они бы позволили пройти ворота без срыва; 07.09.2026: Ironman ушёл в Конструктор (там уже action тот же через customB===0)
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
        // 08.09.2026: тот же честный манёвр (пролёт впритык) начислял near-miss (game.js:3047,
        // требует S.invuln<=0) и полный бонус за пролёт по-разному — сразу после удара (2.2с
        // мигания неуязвимости) бонус за пролёт всё ещё шёл, хотя near-miss в то же окно молчал.
        // Выровнено: тот же invuln-гейт здесь, что уже стоит у near-miss.
        if (S.invuln<=0 && Math.abs(plane.x-o.x) < o.gap/2-plane.r-6){
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
    // 07.09.2026 «Пуля/Блиц»: раньше время забега было одной константой (CARAVAN_TIME=60).
    // Теперь это выбор игрока на кнопке режима (10с/60с, S.caravanTime) — CARAVAN_TIME остаётся
    // запасным значением на случай восстановленного забега без этого поля (S.wasRestored).
    const CT=S.caravanTime||CARAVAN_TIME;
    const elMH=elModeHud, left=Math.max(0,CT-S.time), tSec=Math.floor(left*10)/10;
    if (elMH && elMH._t!==tSec){ elMH._t=tSec; elMH.textContent=L.modeCaravan+' · '+fmtTime(left); }
    if (S.time>=CT && !S.dying){ startDying(); S.caravanTimeUp=1; } // занавес как при смерти, но это не смерть — время вышло
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
  const maxLives=(S.mode==='slalom')?1:3; // 06.09.2026: Слалом — один слот, любое касание и так срывает заезд целиком; 07.09.2026: 1CC убран из игры; 07.09.2026: Ironman ушёл в Конструктор
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
