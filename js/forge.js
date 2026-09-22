'use strict';
/* ============================================================
   FORGE v1.69.0 «Своя трасса»: конструктор забега — полная редакция.
   10 ручек в трёх группах: сложность / состав / настроение.
   Карта = компактный бит-пак конфига → код CG2.xxx → ссылка Telegram
   (?startapp=map_...). Сервер не нужен: конфиг едет в самой ссылке.
   Старые коды CG1.* (JSON→base64, схемы 1-4) по-прежнему читаются.
   Забег по трассе — НЕ в зачёт (ни рекордов, ни кошелька): иначе
   лёгкие карты стали бы фермой звёзд. Честно — как разведка Пакта.
   Зависит от core.js ($, Store, L, clamp, toast, tg), ui.js (setScreen).
   ============================================================ */
/* 23.08.2026: свой локальный wireOn — forge.js грузится РАНЬШЕ ui.js (и раньше card.js,
   где есть такой же свой хелпер) — общий wireOn() из ui.js ещё не объявлен в момент
   выполнения кода верхнего уровня этого файла (низ файла — привязка кнопок сразу
   при загрузке). Тот же приём, свой экземпляр под порядок загрузки. */
function wireOnLocal(id, ev, fn){
  const el=$(id);
  if(el){ el.addEventListener(ev, fn); }
  else if(typeof BEACON!=='undefined' && BEACON.signal){ BEACON.signal('dom_missing', id); }
}

/* ---------- Схема конфига и кодек ---------- */
const FORGE_KINDS=['rock','debris','drift','mine','sat','comet','seeker','gate']; // порядок = веса в spawnObstacle
// 22.09.2026: FORGE_RESET_ICON и forgeResetBtn (отдельная кнопка-корзина) убраны — см.
// комментарий у ptWireOnce() в js/partitura.js, работа переехала на долгое нажатие ptUndoBtn.
// 20.09.2026, лента .wAuthorRibbon (index.html) — долгий вечер поисков (текст → «Космо-звезда»
// → 5 звёзд-рейтинга → созвездие, дважды поправленное геометрически → отказ от идеи вовсе).
// Два моргающих «глаза» с бровками — CSS-анимация, не картинка. Разметка — простые div'ы.
// eyeL/eyeR — нужны характеру «Волна» (моргают по очереди, не синхронно), остальные
// характеры целятся в общий класс .eye и не различают лево/право.
const WORKSHOP_RIBBON_EYES=
  '<div class="browRow"><div class="brow"></div><div class="brow"></div></div>'+
  '<div class="eye eyeL"></div><div class="eye eyeR"></div>';
// «Семья характеров» (владелец: «у всех будет по-разному... намного больше жизни») — 4 личных
// топ-пика владельца из 11 предложенных (масштаб проверен: masterskaya-lenta-bolshoy-nabor-
// harakterov-20-09-2026.html), закреплены ДЕТЕРМИНИРОВАННО за кодом трассы, не рандом на
// каждый показ — тот же код всегда даёт тот же характер. Простой хэш (djb2-подобный), не
// криптографический — детерминизм важнее равномерности распределения.
// 20.09.2026: было 4 (личный топ-выбор владельца) — владелец: «зачем нам 4? если все 12
// разные, пусть все и будут... идём с расчётом, что будет много игроков» — все 12
// предложенных (masterskaya-lenta-bolshoy-nabor-harakterov-20-09-2026.html), не только топ.
const WORKSHOP_RIBBON_CHARS=['char-bouncy','char-sparkle','char-wave','char-droopy',
  'char-calm','char-sleepy','char-curious','char-nervous','char-sideeye','char-surprised',
  'char-googly','char-dramatic'];
function workshopRibbonCharClass(code){
  let h=5381;
  for(let i=0;i<code.length;i++){ h=((h<<5)+h+code.charCodeAt(i))|0; }
  return WORKSHOP_RIBBON_CHARS[Math.abs(h)%WORKSHOP_RIBBON_CHARS.length];
}
/* 20.09.2026 «Разные при каждом заходе» (владелец, прямое слово — переворачивает решение
   того же дня «детерминировано по коду»): «любой из двенадцати, каждый раз по-разному... но
   чтобы не одинаковые были, если на одном экране» — трасса больше не привязана навсегда к
   одному характеру; вместо этого один общий перетасованный набор на весь текущий показ списка,
   раздаётся по кругу — при 12 характерах и ≤12 одновременно видимых лент повторов не бывает
   вообще, а сам порядок меняется заново при каждом workshopRenderList(). workshopRibbonCharClass()
   выше оставлена как есть (страж 318 её тоже проверяет отдельно) — просто больше не вызывается
   из рендера списка. Fisher-Yates, свой источник случайности не нужен — Math.random() тут не
   про честность результата, чисто украшение. */
// 21.09.2026 «Лента для всех, не только featured» (владелец: «если это только мне возможность
// останется, это глупо») — та же логика перетасовки, что уже была у характеров (WORKSHOP_RIBBON_CHARS
// выше), теперь и для формы: один общий перетасованный набор на весь текущий показ списка.
const WORKSHOP_RIBBON_SHAPES=['dot','star','tri','diamond','hex','cross','ring'];
function workshopRibbonShapeHtml(shape){
  if(shape==='star') return '<svg class="eye eyeL" viewBox="0 0 24 24" fill="#2c1f08"><use href="#i-star5-outline"></use></svg>'+
    '<svg class="eye eyeR" viewBox="0 0 24 24" fill="#2c1f08"><use href="#i-star5-outline"></use></svg>';
  return '<div class="eye eyeL shp-'+shape+'"></div><div class="eye eyeR shp-'+shape+'"></div>';
}
// 22.09.2026 «Лестница уровней неба» (владелец, макет masterskaya-lestnitsa-urovney-22-09-2026.html,
// явное «Устраивай, делай») — награда за реальный рост трека (запуски+лайки с сервера, t.plays/
// t.hearts — оба уже приходят с бэкенда, см. использование t.hearts у .wVote выше), не за
// придуманный статус. ПОРОГИ ЗАВЕДОМО ВРЕМЕННЫЕ (владелец прямо попросил пометить): реальная
// база сейчас — максимум 4 запуска, 1 лайк на всю игру (Supabase, 22.09.2026), числа взяты
// маленькими нарочно, поднять позже, когда игроков станет больше. НЕ считать эти числа
// финальными при следующей правке.
//
// 22.09.2026, продолжение того же вечера (владелец: «добавляй их в мастерскую... возможность
// выбора цвета... что-то такое, надо уже сделать это») — уровни 3/4 добавлены. Цвета — из
// палитры 10 (macet palitra-lent-10-tsvetov-22-09-2026.html): золото/серебро уже заняты
// (метка владельца / база), рубин ушёл в кошелёк Коллекции (index.html, .angarWalletBand,
// ОТДЕЛЬНАЯ роль, не эта лестница). Аврора НЕ включена — владелец сам засомневался, что она
// слишком похожа на изумруд, и сам сказал, что перепроверит отдельно; не додумывать за него.
// ВЫБОР АВТОМАТИЧЕСКИЙ, НЕ РУЧНОЙ (владелец, явный выбор из двух вариантов: «автоматически
// (рекомендую)») — тот же приём хэша, что уже у формы/характера на уровне 2, не пишет в живую
// базу, ноль риска. Он же сам сказал: «пока будет автоматически, а потом уже поднастроим,
// когда живые люди будут — запиши, что это не конечное решение» — НЕ финал, пересмотреть,
// когда наберётся реальная активность игроков.
const WORKSHOP_RIBBON_COLORS_TIER3=['copper','steel','sapphire']; // первые 3 — открывается на уровне 3
const WORKSHOP_RIBBON_COLORS_TIER4=[...WORKSHOP_RIBBON_COLORS_TIER3,'emerald','amethyst','nebula']; // +3 = 6 — уровень 4
function workshopRibbonColorClass(code, pool){
  let h=5381; const salted='c:'+code;
  for(let i=0;i<salted.length;i++){ h=((h<<5)+h+salted.charCodeAt(i))|0; }
  return 'tier-'+pool[Math.abs(h)%pool.length];
}
const WORKSHOP_TIER_THRESHOLDS=[ // [уровень, мин.запусков, мин.лайков]
  [1,5,0], [2,10,0], [3,15,2], [4,25,5]
];
function workshopTrackLevel(t){
  const plays=t.plays||0, hearts=t.hearts||0;
  let lvl=0;
  for(let i=0;i<WORKSHOP_TIER_THRESHOLDS.length;i++){
    const th=WORKSHOP_TIER_THRESHOLDS[i];
    if(plays>=th[1] && hearts>=th[2]) lvl=th[0];
  }
  return lvl;
}
// Уровень 2 «обжилось»: форма/характер перестают тасоваться при каждом показе — закрепляются
// детерминированно за кодом трассы (тот же приём, что уже есть у workshopRibbonCharClass выше,
// просто применяется выборочно, не для всех). Соль 's:' у формы — чтобы форма и характер одного
// трека не совпадали механически из-за одного и того же хэша.
function workshopRibbonShapeClass(code){
  let h=5381; const salted='s:'+code;
  for(let i=0;i<salted.length;i++){ h=((h<<5)+h+salted.charCodeAt(i))|0; }
  return WORKSHOP_RIBBON_SHAPES[Math.abs(h)%WORKSHOP_RIBBON_SHAPES.length];
}
function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    const tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
  }
  return arr;
}
const FORGE_LENS=[1000,1500,4000,5000,0]; // 0 = бесконечная; 30.08.2026 (владелец): 500 снят — «почти нечего лететь», 1000 стал новым минимумом; 2500 стал 5000 — «мало»
const FORGE_SKYS=[0,60,120,180,240,300]; // сдвиг оттенка неба: синее → индиго → фиолет → пурпур → маджента → роза
/* v1.282.23 (партия 22): forgeSkyLoop() искал свой экран через getElementById на КАЖДОМ
   кадре, пока «Своя трасса» открыта — тот же класс, что уже чинили для HUD (game.js,
   v1.282.21). Узел статичный (из index.html), forge.js — defer, значит DOM уже разобран
   к моменту исполнения — безопасно взять ссылку один раз и переиспользовать её и в
   цикле, и в forgeSkyKick(), которая раньше искала тот же узел отдельно и заново. */
const elForgeScreen=(typeof document!=='undefined')?document.getElementById('forgeScreen'):null;
// по умолчанию — ровная средняя трасса на полтора километра
/* v1.282.15: схема v3. Правка v1.282.13 сняла волновой гейт для видов, выбранных автором
   (иначе трасса из одних Ворот на «Ровном жаре» давала вечные камни) — но применилась она
   и к УЖЕ РОЗДАННЫМ кодам, то есть молча переписала чужие трассы: у карты, вылизанной под
   свой рекорд, преграды поехали с первой секунды. Признак wg («волновой гейт») разводит
   поколения: коды v1 и v2 читаются со старым поведением, новые пишутся с новым. */
const FORGE_DEF={v:3,n:'',d:50,s:50,e:15,l:1500,lv:3,w:1,fl:0,b:2,sky:0,fog:0,wg:0,hs:0,sc:[]};
/* 31.08.2026 «Партитура»/«Расстановка», MVP: точное авторское размещение поверх статистических
   ручек. Три типа события: 'pause' (гарантия передышки в этой точке), 'kind' (в этой точке —
   заданный вид препятствия, не случайный) и 'marker' (заметка для себя — текст в игру и в код
   НЕ едет вовсе, решение владельца 31.08.2026: заметка живёт только у автора локально в
   Кузнице; здесь у marker-события используется только at, kind всегда 0 и игнорируется).
   Максимум 50 событий на трассу — защита от разрастания кода, число из плана, не выдумано
   заново здесь. */
const FORGE_SC_TYPES=['pause','kind','marker']; // индекс = 2 бита в кодеке ниже (влезает: 0-2 из 0-3)
const FORGE_SC_MAX=50;
/* 02.09.2026 «Пресеты — рабочие примеры, не только числа»: раньше 8 готовых сценариев были
   чистыми пресетами параметров (плотность/скорость/состав/цвет) — что реально выпадет на
   трассе, решал случай при каждом полёте, окно ленты ничего не показывало. Владелец: «оно
   должно быть точно» — плюс пресеты учат Партитуре на примере, раз лента теперь рисует точки
   сама (forgeSyncWidgets→ptRender, готово с сегодняшнего коммита). Каждый пресет ниже получил
   sc — авторские точки (все укладываются в свой l с запасом, максимум 22 из разрешённых 50).
   Длины подросли по просьбе владельца: от 1500 у «Разминки» и дальше. */
// 08.09.2026 «Витрина, а не повтор» (владелец, живой скрин: 2 пары пресетов давали ОДИНАКОВЫЙ
// фон — Разминка/Дрейф оба sky=0, Дождь/Пульсар оба sky=120, потому что FORGE_SKYS даёт только
// 6 сдвигов на 8 пресетов): каждому пресету — свой h1/h2 явно, в обход общей формулы sky*.3.
// Взяты не наугад, а те же 8 пар, что и в PT_SAFE_PAIRS (partitura.js) — том же наборе, что
// стоит за кнопкой «Случайное небо». Владелец прямо попросил покрасить пресеты в те же
// цвета, что и сама кнопка — витрина и генератор берут из одного места, не расходятся.
// sky/fog оставлены как были — только для старых кодов без явного h1/h2.
// Минное поле и Туманная ночь делят соседнюю зелёную зону (78-118 / 122-162, 44° — ближе
// всех восьми друг к другу, владелец поймал это на живой Галерее) — развёл не оттенком
// (дальше уже некуда, весь остаток круга занят другими шестью), а «настроением»: у Минного
// поля mood:15 (темнее/приглушённее), у Туманной ночи — обычные дефолтные 50.
const FORGE_PRESETS=[ // точки входа: тапнул — и сразу летишь; докрутить можно под себя
  {k:'fpWarm', c:{n:'',d:25,s:40,e:15,l:1500,lv:3,w:1,fl:0,b:3,sky:0,h1:0,h2:40,fog:0,sc:[ // мягкое знакомство: редкие камни, одна передышка, одни ворота как «выпускной»
    {at:100,type:'pause'},{at:300,type:'kind',kind:0},{at:500,type:'kind',kind:0},{at:700,type:'pause'},
    {at:900,type:'kind',kind:1},{at:1100,type:'kind',kind:0},{at:1300,type:'kind',kind:7}]}},
  {k:'fpRain', c:{n:'',d:90,s:65,e:35,l:4000,lv:3,w:3,fl:1,b:2,sky:120,h1:36,h2:76,fog:0,sc:[ // плотный шторм камней/обломков + кометы поочерёдно слева-справа — витрина направления
    {at:150,type:'kind',kind:0},{at:300,type:'kind',kind:1},{at:450,type:'kind',kind:0},{at:600,type:'kind',kind:0},
    {at:750,type:'kind',kind:5,dir:1},{at:900,type:'kind',kind:1},{at:1050,type:'kind',kind:0},{at:1200,type:'kind',kind:5,dir:-1},
    {at:1350,type:'kind',kind:0},{at:1500,type:'kind',kind:1},{at:1650,type:'kind',kind:0},{at:1800,type:'kind',kind:5,dir:1},
    {at:1950,type:'kind',kind:0},{at:2100,type:'kind',kind:1},{at:2250,type:'kind',kind:5,dir:-1},{at:2400,type:'kind',kind:0},
    {at:2550,type:'kind',kind:1},{at:2700,type:'kind',kind:5,dir:1},{at:2850,type:'kind',kind:0},{at:3000,type:'kind',kind:5,dir:-1},
    {at:3150,type:'kind',kind:1},{at:3300,type:'kind',kind:0}]}},
  {k:'fpMines', c:{n:'',d:55,s:45,e:136,l:3500,lv:3,w:3,fl:0,b:2,sky:300,h1:78,h2:118,mood:15,fog:0,sc:[ // 08.09.2026, замена «Ад на одну жизнь» (дублировал Створ): мины+ворота, скорость нарочно ниже средней — ставка на выбор пути, не на реакцию, щедрые паузы, чтобы успеть посмотреть и решить
    {at:250,type:'kind',kind:3},{at:550,type:'kind',kind:7},{at:850,type:'pause'},
    {at:1150,type:'kind',kind:3},{at:1450,type:'kind',kind:3},{at:1750,type:'kind',kind:7},
    {at:2050,type:'pause'},{at:2350,type:'kind',kind:3},{at:2650,type:'kind',kind:7},
    {at:2950,type:'kind',kind:3},{at:3250,type:'kind',kind:7}]}},
  {k:'fpFog',  c:{n:'',d:45,s:50,e:13,l:2500,lv:3,w:2,fl:0,b:2,sky:180,h1:122,h2:162,fog:2,sc:[ // туман режет видимость — препятствия предсказуемые, разнесённые, щедрые паузы
    {at:150,type:'pause'},{at:400,type:'kind',kind:4},{at:700,type:'kind',kind:2},{at:1000,type:'pause'},
    {at:1300,type:'kind',kind:4},{at:1600,type:'kind',kind:2},{at:1900,type:'pause'},{at:2200,type:'kind',kind:4}]}},
  // v1.83.0 «Галерея мастера»: эталонные трассы с выверенным характером — карты в галерее рядом с базовыми
  {k:'fpDrift', c:{n:'',d:50,s:55,e:4,l:4000,lv:3,w:3,fl:0,b:2,sky:0,h1:180,h2:220,fog:0,sc:[ // 08.09.2026, замена «Кометного сада» (дублировал «Метеоритный дождь» — та же комета): чистая витрина Дрейфера, направление чередуется — у него до этого не было своего пресета вообще
    {at:200,type:'kind',kind:2,dir:1},{at:550,type:'kind',kind:2,dir:-1},{at:900,type:'pause'},
    {at:1250,type:'kind',kind:2,dir:1},{at:1600,type:'kind',kind:2,dir:1},{at:1950,type:'kind',kind:2,dir:-1},
    {at:2300,type:'pause'},{at:2650,type:'kind',kind:2,dir:-1},{at:3000,type:'kind',kind:2,dir:1},
    {at:3350,type:'kind',kind:2,dir:-1},{at:3700,type:'kind',kind:2,dir:1}]}},
  {k:'fpSlalom', c:{n:'',d:55,s:70,e:132,l:4500,lv:3,w:3,fl:0,b:2,sky:60,h1:216,h2:256,fog:0,sc:[ // почти сплошные ворота подряд — витрина «дышащих» ворот с первой волны, узкие просветы
    {at:200,type:'kind',kind:7},{at:450,type:'kind',kind:7},{at:700,type:'kind',kind:2},{at:950,type:'kind',kind:7},
    {at:1200,type:'kind',kind:7},{at:1450,type:'kind',kind:2},{at:1700,type:'kind',kind:7},{at:1950,type:'kind',kind:7},
    {at:2200,type:'pause'},{at:2450,type:'kind',kind:7},{at:2700,type:'kind',kind:7},{at:2950,type:'kind',kind:2},
    {at:3200,type:'kind',kind:7},{at:3450,type:'kind',kind:7},{at:3700,type:'kind',kind:2},{at:3950,type:'kind',kind:7},{at:4200,type:'kind',kind:7}]}}, // дрейфы+врата в индиго — чистое мастерство
  {k:'fpHunt',  c:{n:'',d:60,s:60,e:72,l:3500,lv:2,w:4,fl:1,b:1,sky:240,h1:291,h2:331,fog:1,sc:[ // ловцы преследуют, спутники между ними — ощущение погони
    {at:200,type:'kind',kind:6},{at:450,type:'kind',kind:4},{at:700,type:'kind',kind:6},{at:950,type:'kind',kind:4},
    {at:1200,type:'pause'},{at:1450,type:'kind',kind:6},{at:1700,type:'kind',kind:6},{at:1950,type:'kind',kind:4},
    {at:2200,type:'kind',kind:6},{at:2450,type:'pause'},{at:2700,type:'kind',kind:6},{at:2950,type:'kind',kind:4},{at:3200,type:'kind',kind:6}]}},
  {k:'fpPulse', c:{n:'',d:70,s:95,e:17,l:2000,lv:2,w:5,fl:0,b:3,sky:120,h1:324,h2:4,fog:0,sc:[ // короткий рваный спринт: пачки препятствий, разделённые крошечными паузами, как пульс
    {at:150,type:'kind',kind:0},{at:200,type:'kind',kind:0},{at:250,type:'pause'},{at:500,type:'kind',kind:4},
    {at:550,type:'kind',kind:0},{at:600,type:'pause'},{at:850,type:'kind',kind:0},{at:900,type:'kind',kind:1},
    {at:950,type:'kind',kind:0},{at:1000,type:'pause'},{at:1250,type:'kind',kind:4},{at:1300,type:'kind',kind:0},
    {at:1350,type:'pause'},{at:1600,type:'kind',kind:0},{at:1650,type:'kind',kind:4},{at:1700,type:'pause'},{at:1900,type:'kind',kind:7}]}}
];
/* 06.09.2026 «Переосмысление» (владелец, живой скриншот: «Готовые сценарии»/Мастерская —
   зачем разделять, это одно и то же): раньше здесь оставались 2 быстрых примера отдельной
   витриной (FORGE_PRESETS_VISIBLE), 6 остальных уже жили в Мастерской как трассы автора
   (seed-migration, см. .knowledge/PRODUCTION-MINES.md-соседний коммит). Теперь все 8 — там же,
   тем же приёмом (fpWarm/fpHell вставлены в forge_workshop, author_name='Cosmogram',
   status='pinned' — были те же 2 живых кода, что forgeEncode() тогда давал для их конфигов).
   Отдельной сетки-витрины и forgePresetMatch()/подсветки выбранной программы больше нет —
   играть/загрузить любой из 8 можно тем же путём, что и любую чужую трассу. FORGE_PRESETS сам
   остаётся полным (8) — им по-прежнему пользуется кодирование ссылок и стартовый forgeCfg
   по умолчанию (FORGE_PRESETS[0].c, «Разминка»).
   16.09.2026: живой запрос к forge_workshop показал, что это утверждение («те же коды, что
   forgeEncode() даёт сейчас») больше не верно для «Разминки» — формат бит-пака успел
   поменяться с 06.09.2026, forgeEncode(FORGE_PRESETS[0].c) сегодня даёт другую строку, чем
   реально лежит в БД. WARM_CODE ниже — код, подтверждённый прямым SQL-запросом к живой базе
   в этот день, не пересчитан из FORGE_PRESETS. */
const WARM_CODE='CG2.Hng8wYFGG3sSAAcAZAABLAgB9AgCvAADhAkETAgFFA8PBdwAAAAoMjIA'; // «Разминка», живой forge_workshop.code, сверено 16.09.2026

function forgeSanitize(c){ // вход недоверенный — код приходит извне; режем всё до рамок
  if(!c||typeof c!=='object') c={};
  const o={v:3};
  o.n=(typeof sanitizeTrackName==='function') ? sanitizeTrackName(c.n) : String(c.n==null?'':c.n).replace(/[<>&"'\\]/g,'').trim().slice(0,17); // 17 — безопасный кириллический остаток байтового бюджета; путь дублирует sanitizeTrackName только если она недоступна
  o.d=clamp(Math.round(isFinite(+c.d)?+c.d:50),10,100);
  o.s=clamp(Math.round(isFinite(+c.s)?+c.s:50),10,100);
  o.e=clamp(Math.round(isFinite(+c.e)?+c.e:(1<<FORGE_KINDS.length)-1),1,255); // 09.09.2026: дефолт «пусто» = все текущие виды разрешены (было зашитое 15 = только первые 4 вида, протухло, когда добавили sat/comet/seeker/gate — «Сбросить всё» возвращало старую узкую маску); минимум один вид преград остаётся нижней границей
  // 01.09.2026 «Непрерывная длина»: раньше — строго одно из 5 значений FORGE_LENS. Теперь —
  // любое значение 1000-10000 шагом 250 (37 вариантов), либо 0 (бесконечная). Старые 5 значений
  // сами кратны 250 — ничего не ломается для уже розданных кодов/пресетов. Проверено численно
  // (verify-len2.js, 5017 прогонов, 0 расхождений) до этой правки, включая обратную
  // совместимость: код без нового хвоста (см. forgeBitsPack/Unpack ниже) читает старое
  // 3-битное поле как раньше.
  o.l=(+c.l===0)?0:clamp(Math.round((isFinite(+c.l)&&+c.l>0?+c.l:1500)/250)*250,1000,25000);
  o.lv=clamp(Math.round(isFinite(+c.lv)?+c.lv:3),1,3);
  o.w=clamp(Math.round(isFinite(+c.w)?+c.w:1),1,6);
  o.fl=c.fl?1:0;
  o.b=clamp(Math.round(isFinite(+c.b)?+c.b:2),0,3);
  o.sky=FORGE_SKYS.indexOf(+c.sky)>=0?+c.sky:0;
  // 01.09.2026 «Свой фон»: свободный цвет неба — h1/h2 (0-359°, верх/низ) + густота звёзд и
  // туманностей (10-100, тот же диапазон, что у d/s). Раньше небо — один из 6 готовых сдвигов
  // оттенка (sky). Когда автор не трогал ползунки свободного цвета явно, h1/h2 выводятся из
  // legacy sky ТОЙ ЖЕ формулой, что уже рисует forgeSkyPaint()/render.js (232+sky*.3, 200+sky*.3)
  // — старые пресеты и уже розданные коды визуально не меняются. Проверено численно
  // (verify-color2.js, 5029 прогонов) до этой правки.
  const _defH1=Math.round(232+o.sky*.3)%360, _defH2=Math.round(200+o.sky*.3)%360;
  o.h1=clamp(Math.round(isFinite(+c.h1)?+c.h1:_defH1),0,359);
  o.h2=clamp(Math.round(isFinite(+c.h2)?+c.h2:_defH2),0,359);
  o.dens=clamp(Math.round(isFinite(+c.dens)?+c.dens:50),10,100);
  // 01.09.2026 «Настроение неба»: 0-100, по умолчанию 50 — двигает насыщенность/яркость всех
  // точек градиента ВМЕСТЕ (не оттенок), от «глубокий космос» (0) до «яркая туманность» (100).
  // 50 = сегодняшние зашитые числа, без изменений. Диапазон подобран и проверен глазами на
  // трёх разных оттенках (macet-01-09-nastroenie-neba.html) до этой правки.
  o.mood=clamp(Math.round(isFinite(+c.mood)?+c.mood:50),0,100);
  o.fog=clamp(Math.round(isFinite(+c.fog)?+c.fog:0),0,2);
  // 06.09.2026 «Солнечный ветер»: 0-100, по умолчанию 0 (выкл — старые коды/пресеты без поля
  // ничего не почувствуют). Сила порывов, не постоянный снос — сама механика в game.js.
  o.wind=clamp(Math.round(isFinite(+c.wind)?+c.wind:0),0,100);
  // v1.108.1 «Честный жар»: seed теперь часть конфига — тот же код у друга даёт ту же расстановку,
  // не только те же настройки. Своя новая трасса — свежий seed; чужой код — seed едет вместе с ним.
  o.seed=(isFinite(+c.seed)&&+c.seed>0)?Math.floor(+c.seed):Math.floor(Math.random()*4294967296);
  o.wg=c.wg?1:0; // 1 — старая раскладка: волновой гейт держит выбранные автором виды до своей волны
  // 31.08.2026 «Высокая ставка», расширено 23.09.2026 «Ставка ×8»: forgeCfg.hsTier — 0=выкл,
  // 1=×4 (жизни=1, бонусы=выкл), 2=×8 (то же + стартовая жара=макс). forgeCfg.hs остаётся
  // булевым дублем (hsTier>=1) — читают старые части кода (js/ui.js S.customHS) и старые CG2-
  // коды без нового extFlags-бита (см. forgeBitsUnpack: код без бита4 даёт hsTier=undefined,
  // сюда приходит только c.hs — деградирует к tier=1/×4, не к максимальному ×8, безопасная
  // сторона ошибки). Форс принудительный поверх любых значений полей выше, а не только как
  // совет в интерфейсе — иначе чужой код с hsTier=2, но подкрученными lv/b/w, тихо давал бы
  // больше жизней/бонусов/мягче старт, чем ставка обещает — тот же принцип, что был у hs.
  o.hsTier=clamp(Math.round(isFinite(+c.hsTier)?+c.hsTier:(c.hs?1:0)),0,2);
  o.hs=o.hsTier>=1?1:0;
  if(o.hsTier>=1){ o.lv=1; o.b=0; }
  if(o.hsTier>=2){ o.w=6; }
  // 31.08.2026 «Партитура»: вход недоверенный (код приходит извне) — не клэмпим мусорное
  // событие до валидного, а выбрасываем целиком, как и требует план («at — конечное
  // неотрицательное число, иначе событие отбрасывается»). Максимум 50 — лишние отрезаны.
  o.sc=[];
  if(Array.isArray(c.sc)){
    for(const ev of c.sc){
      if(o.sc.length>=FORGE_SC_MAX) break;
      if(!ev || typeof ev!=='object') continue;
      const at=+ev.at;
      if(!isFinite(at) || at<0) continue;
      const type=FORGE_SC_TYPES.indexOf(ev.type)>=0 ? ev.type : null;
      if(!type) continue;
      const kind=clamp(Math.round(isFinite(+ev.kind)?+ev.kind:0),0,FORGE_KINDS.length-1);
      // 01.09.2026 «Направление»: сторона кометы/дрейфера — -1 (влево) / 1 (вправо) / 0 (случайно,
      // умолчание). Для остальных видов поле просто не читается game.js — валидировать «только
      // для этих двух видов» здесь не нужно, лишнее значение молча бездействует.
      const dir=(+ev.dir===1||+ev.dir===-1)?+ev.dir:0;
      o.sc.push({at:Math.round(at), type:type, kind:kind, dir:dir});
    }
    o.sc.sort(function(a,b){ return a.at-b.at; }); // отсортировано по дистанции — так их читает game.js по одному разу
  }
  return o;
}
/* 31.08.2026 «Компактный код» (CG2): CG1 (JSON.stringify → base64) был впритык к диплинку
   Telegram (~64 символа) уже с ПУСТЫМ именем — любое имя переполняло лимит (замерено вживую:
   64 символа на пустое, 76-126 с именем). Причина — двойной оверхед: знаки JSON (скобки/
   запятые/кавычки строки) поверх base64 (+33%), хотя почти все поля — маленькие числа,
   влезающие в несколько бит. CG2 — та же схема полей, но бит-упаковка вместо JSON. Числовая
   проверка ДО правки (скрипт, 2000 случайных конфигов + граничные значения d/s/e/seed) — 0
   расхождений между упаковкой и распаковкой. Новые коды пишутся как CG2; CG1 остаётся
   читаемым — старые розданные коды/ссылки не ломаются (тот же принцип, что уже трижды
   применялся к схеме v1→v4 внутри самого CG1). «Партитура» (события) — отдельный хвост байт
   ПОСЛЕ имени (см. ниже), не переделка этого блока: код без событий (старые CG2, до
   31.08.2026) читается ровно как раньше, лишних байт после имени у него просто нет.
   Раскладка (71 бит скаляров, MSB-first, 9 байт с 1 запасным битом в хвосте):
   d-10(7) s-10(7) e(8) lIdx(3) lv-1(2) w-1(3) fl(1) b(2) skyIdx(3) fog(2) hs(1) seed(32)
   + 1 байт — длина имени В БАЙТАХ + сырые UTF-8 байты имени (без JSON-строки и её кавычек)
   + [«Партитура», 31.08.2026] 1 байт — число событий (0-50) + по 3 байта на событие:
   at>>8, at&255, (typeIdx<<3)|kind — проверено численно (скрипт, 2000 прогонов + граничные
   значения) до правки. Хвост опционален: 0 событий = 1 байт (счётчик 0), ничего больше.
   [«Направление», 01.09.2026] те же 3 байта, биты 5-6 3-го байта (были всегда 0) —
   dirCode: 0=случайно, 1=вправо, 2=влево. Старые события читаются как «случайно» без миграции.
   + [«Непрерывная длина» + «Свой фон» + «Настроение неба», 01.09.2026] 1 байт extFlags —
   бит0 = точная длина, бит1 = свободный цвет неба, бит2 = настроение — ОБЩИЙ на все три
   расширения, не отдельные байты каждому. Если бит0: 2 байта длины в метрах. Если бит1:
   2 байта h1 + 2 байта h2 (оттенки 0-359°, big-endian) + 1 байт густоты (10-100). Если бит2:
   1 байт настроения (0-100). Живёт ПОСЛЕ хвоста Партитуры, тем же приёмом («сложи хвост на
   хвост», не переделывай нижние слои). Старые 3-битное lIdx и sky выше по-прежнему пишутся —
   только ближайшим/производным приближением, для приложений до этой правки, которым
   достанется чужой новый код. Проверено численно (verify-len2.js — 5017 прогонов,
   verify-color2.js — 5029 прогонов, verify-mood.js — 5008 прогонов, включая обратную
   совместимость кода без этих хвостов) до правки. */
function forgeNearestLegacyLen(l){ // старое 3-битное поле — ближайшее из 5 старых значений,
  // для приложений ДО этой правки, читающих новый код (graceful degradation, не крах)
  if(l===0) return FORGE_LENS.indexOf(0);
  let best=0, bestD=Infinity;
  for(let i=0;i<FORGE_LENS.length;i++){
    if(FORGE_LENS[i]===0) continue;
    const d=Math.abs(FORGE_LENS[i]-l);
    if(d<bestD){ bestD=d; best=i; }
  }
  return best;
}
function forgeBitsPack(cfg){
  const bits=[];
  const put=(val,n)=>{ for(let i=n-1;i>=0;i--) bits.push((val>>>i)&1); };
  put(cfg.d-10,7); put(cfg.s-10,7); put(cfg.e,8);
  put(forgeNearestLegacyLen(cfg.l),3); put(cfg.lv-1,2); put(cfg.w-1,3);
  put(cfg.fl,1); put(cfg.b,2); put(FORGE_SKYS.indexOf(cfg.sky),3); put(cfg.fog,2);
  put(cfg.hs,1); put((cfg.seed||0)>>>0,32);
  const head=[];
  for(let i=0;i<bits.length;i+=8){ let by=0; for(let j=0;j<8;j++) by=(by<<1)|(bits[i+j]||0); head.push(by); }
  const nameBytes=Array.from(new TextEncoder().encode(cfg.n||''));
  const sc=Array.isArray(cfg.sc)?cfg.sc:[];
  const scOut=[Math.min(sc.length,FORGE_SC_MAX)];
  for(let i=0;i<scOut[0];i++){
    const ev=sc[i], at=Math.max(0,Math.min(65535,Math.round(ev.at)));
    const typeIdx=Math.max(0,FORGE_SC_TYPES.indexOf(ev.type));
    // 01.09.2026 «Направление»: kind занимает биты 0-2, typeIdx — биты 3-4, биты 5-7 3-го байта
    // были всегда нулями (проверено чтением декодера ниже: маски &7 и >>3&3 их не трогают) —
    // свободное место без нового байта на событие. dirCode: 0=случайно, 1=вправо(+1), 2=влево(-1).
    const dirCode=ev.dir===1?1:ev.dir===-1?2:0;
    scOut.push(at>>8, at&255, ((typeIdx<<3)|(ev.kind&7)|(dirCode<<5))&255);
  }
  // 01.09.2026 «Непрерывная длина» + «Свой фон» + «Настроение неба»: один extFlags-байт на
  // все три расширения — бит0 = точная длина (2 байта метров), бит1 = свободный цвет (2б h1,
  // 2б h2, 1б густота), бит2 = настроение (1б, 0-100). Все три бита сейчас всегда 1 — новый
  // интерфейс всегда пишет все поля. Проверено численно (verify-len2.js, verify-color2.js,
  // verify-mood.js) до правки.
  // 06.09.2026 «Солнечный ветер»: бит3 extFlags — 1 байт силы порывов (0-100), тем же приёмом,
  // что уже трижды применён выше (сложи хвост на хвост, не переделывай нижние слои). Всегда 1 —
  // новый интерфейс всегда пишет поле, старые коды без этого бита читаются как wind=0 (выкл).
  // 23.09.2026 «Ставка ×8»: бит4 extFlags — 1 байт hsTier (0-2), тот же приём. СУЩЕСТВУЮЩИЙ
  // 1-битный hs в головном 71-битном блоке НЕ ТРОГАЕМ (менять его размер сдвинуло бы все поля
  // после него, включая seed — сломало бы уже розданные коды) — старое поле остаётся булевым
  // дублем (hsTier>=1) для приложений до этой правки: они видят «высокая ставка есть», просто
  // не знают про ×8, честно играют как ×4 (мягкая деградация, не крах и не выдуманный ×8 без
  // спроса). Новое приложение, читая НОВЫЙ код — использует hsTier из хвоста, не старый бит.
  const extFlags=[1|2|4|8|16];
  const lenTail=[(cfg.l>>8)&255, cfg.l&255];
  const colorTail=[(cfg.h1>>8)&255, cfg.h1&255, (cfg.h2>>8)&255, cfg.h2&255, cfg.dens&255];
  const moodTail=[cfg.mood&255];
  const windTail=[cfg.wind&255];
  const hsTierTail=[(cfg.hsTier||0)&255];
  return new Uint8Array(head.concat(nameBytes.length, nameBytes, scOut, extFlags, lenTail, colorTail, moodTail, windTail, hsTierTail));
}
function forgeBitsUnpack(bytes){
  const HEAD=9; // Math.ceil(71/8)
  const bits=[];
  for(let i=0;i<HEAD;i++) for(let j=7;j>=0;j--) bits.push((bytes[i]>>>j)&1);
  let pos=0; const get=(n)=>{ let v=0; for(let i=0;i<n;i++) v=(v<<1)|(bits[pos++]||0); return v>>>0; };
  const d=get(7)+10, s=get(7)+10, e=get(8);
  const lIdx=get(3), lv=get(2)+1, w=get(3)+1;
  const fl=get(1), b=get(2), skyIdx=get(3), fog=get(2), hs=get(1), seed=get(32);
  const nameLen=bytes[HEAD]||0;
  const nameBytes=bytes.slice(HEAD+1, HEAD+1+nameLen);
  const n=new TextDecoder().decode(nameBytes);
  // «Партитура»: хвост опционален — код без него (или обрезанный/битый хвост) просто даёт sc=[]
  const scOff=HEAD+1+nameLen;
  const sc=[];
  let cursor=scOff;
  if(scOff<bytes.length){
    const scN=bytes[scOff]||0;
    for(let i=0;i<scN;i++){
      const b=scOff+1+i*3;
      if(b+2>=bytes.length) break; // обрезанный хвост — не падаем, просто меньше событий
      const at=(bytes[b]<<8)|bytes[b+1], tb=bytes[b+2];
      const dirCode=(tb>>5)&3; // 01.09.2026 «Направление»: старые коды (биты 5-7 всегда были 0) читаются как dirCode=0 — «случайно», без единой строчки миграции
      sc.push({at:at, type:FORGE_SC_TYPES[(tb>>3)&3]||'pause', kind:tb&7, dir:dirCode===1?1:dirCode===2?-1:0});
    }
    cursor=scOff+1+scN*3;
  }
  // «Непрерывная длина» / «Свой фон»: код БЕЗ этого хвоста (розданный до 01.09.2026) просто
  // не доходит сюда — l остаётся старым приближением из lIdx, h1/h2 выводятся из legacy sky
  // в forgeSanitize (та же формула, что уже рисовала это небо раньше), ровно как читалось раньше.
  let l=FORGE_LENS[lIdx], h1, h2, dens, mood, wind, hsTier;
  if(cursor<bytes.length){
    const extFlags=bytes[cursor]||0;
    let p=cursor+1;
    if((extFlags&1) && p+1<bytes.length){ l=(bytes[p]<<8)|bytes[p+1]; p+=2; }
    if((extFlags&2) && p+4<bytes.length){
      h1=(bytes[p]<<8)|bytes[p+1]; p+=2;
      h2=(bytes[p]<<8)|bytes[p+1]; p+=2;
      dens=bytes[p]; p+=1;
    }
    if((extFlags&4) && p<bytes.length){ mood=bytes[p]; p+=1; }
    // 06.09.2026 «Солнечный ветер»: бит3, 1 байт — код без него (розданный до этой правки)
    // просто не доходит сюда, wind остаётся undefined → forgeSanitize подставит 0 (выкл).
    if((extFlags&8) && p<bytes.length){ wind=bytes[p]; p+=1; }
    // 23.09.2026 «Ставка ×8»: бит4, 1 байт — код без него (розданный до этой правки, включая
    // все коды с обычной «Высокой ставкой» ×4 до сегодня) даёт hsTier=undefined —
    // forgeSanitize сама выведет его из старого булева hs (hs?1:0), то есть старые коды с
    // hs=1 корректно читаются как tier=1/×4, не теряют смысл и не разгоняются до ×8 без спроса.
    if((extFlags&16) && p<bytes.length){ hsTier=bytes[p]; p+=1; }
  }
  return { n, d, s, e, l, lv, w, fl, b, sky:FORGE_SKYS[skyIdx], h1, h2, dens, mood, fog, hs, hsTier, seed, wind, wg:0, sc:sc };
}
function forgeEncode(cfg){
  const bytes=forgeBitsPack(cfg);
  let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
  const b=btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'CG2.'+b;
}
function forgeDecodeV1(s){ // 31.08.2026: старый JSON-путь (CG1, схемы 1-4) — без изменений, отделён от CG2 ниже
  let b=s.slice(4).replace(/-/g,'+').replace(/_/g,'/');
  while(b.length%4) b+='=';
  const a=JSON.parse(decodeURIComponent(escape(atob(b))));
  if(!Array.isArray(a)) return null;
  // v1.282.15: у поколений 1 и 2 поднимаем флаг старой раскладки — их расстановка обязана
  // остаться той же, какой была, когда автор делился ссылкой.
  if(a[0]===1) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5],wg:1}); // v1: остальное — дефолты
  if(a[0]===2) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5],lv:a[6],w:a[7],fl:a[8],b:a[9],sky:a[10],fog:a[11],seed:a[12],wg:1});
  if(a[0]===3) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5],lv:a[6],w:a[7],fl:a[8],b:a[9],sky:a[10],fog:a[11],seed:a[12],wg:0});
  if(a[0]===4) return forgeSanitize({n:a[1],d:a[2],s:a[3],e:a[4],l:a[5],lv:a[6],w:a[7],fl:a[8],b:a[9],sky:a[10],fog:a[11],seed:a[12],wg:0,hs:a[13]}); // 31.08.2026 «Высокая ставка»
  return null;
}
function forgeDecode(str){ // принимает код, полную ссылку t.me или startapp-строку; CG1 (JSON, схемы 1-4) и CG2 (бит-пак)
  try{
    let s=String(str||'').trim();
    const m=s.match(/map_(CG[12]\.[A-Za-z0-9\-_]+)/); if(m) s=m[1]; // вытащили из ссылки
    if(s.indexOf('CG2.')===0){
      let b=s.slice(4).replace(/-/g,'+').replace(/_/g,'/');
      while(b.length%4) b+='=';
      const bin=atob(b); const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return forgeSanitize(forgeBitsUnpack(bytes));
    }
    if(s.indexOf('CG1.')===0) return forgeDecodeV1(s);
    return null;
  }catch(e){ return null; }
}
function forgeDensityMul(d){ return 1.6-(d/100)*1.05; } // 10→×1.5 (пустое небо) … 100→×0.55 (метеоритный дождь)
function forgeSpeedMul(s){ return 0.8+(s/100)*0.5; }     // 10→×0.85 … 100→×1.3
function forgeBonusGapMul(b){ return b===1?2:b===3?.55:1; } // редко ×2 пауза … норма ×1 … часто ×0.55

/* ---------- v1.85.0 «Сначала небо»: ручка «Жар» и живое мини-небо ---------- */
function forgeHeatSet(h){ // одна ручка вместо трёх: плотность + скорость + стартовая жара
  h=clamp(Math.round(h)||4,1,10);
  forgeCfg.d=Math.min(100,8+h*9); forgeCfg.s=15+h*8; forgeCfg.w=Math.max(1,Math.round(h/2));
}
function forgeHeatGet(){ return clamp(Math.round((forgeCfg.d-8)/9),1,10); } // обратно: из плотности автора

/* 01.09.2026 «Настроение неба»: та же дельта (dm), что в moodSL() (render.js), но применена к
   СВОИМ базовым числам превью (60/22, 65/10) — превью и раньше отличалось от настоящего полёта
   (нарочно светлее), при mood=50 (по умолчанию) вид превью/ленты не меняется вообще. Общая для
   forgeSkyPaint() и ptPaintTrackBg() (partitura.js, грузится после forge.js) — одна формула,
   не две похожие копии. */
function forgePreviewMoodSL(mood){
  const dm=((isFinite(mood)?mood:50)-50)/50;
  return {
    S0:clamp(60+dm*18,15,90), L0:clamp(22+dm*14,3,45),
    S1:clamp(65+dm*15,20,95), L1:clamp(10+dm*20,3,60),
  };
}
let _fSkyT=0, _fSkyRun=false, _fPvSig=''; // _fPvSig: 15.09.2026, сигнатура имя+состав превью «Создать» — не переписывать DOM каждый кадр без надобности
function forgeSkyPaint(dt){ // живое мини-небо конструктора: выбранные небо/туман/состав/жар летают в превью
  const cv=$('forgePreview'); if(!cv||!cv.getContext) return;
  /* 10.09.2026 (владелец, живой скрин): «картинка сплюснутая» — canvas без явных width/height
     рисовал в стандартный буфер браузера (300×150), а CSS вдвое ниже (75px, см. #forgePreview)
     растягивал/сжимал ЭТУ картинку в новую рамку, искажая пропорции. Ни разу не совпадало с
     реальным размером блока — просто раньше (150px) почти случайно близко подходило к буферу
     по умолчанию, поэтому искажение не бросалось в глаза. Синхронизирую буфер с настоящим
     размером блока на экране (тот же приём, что уже у angarPvZoomCv в ui.js). */
  const box=cv.getBoundingClientRect();
  if(box.width && box.height && (cv.width!==Math.round(box.width) || cv.height!==Math.round(box.height))){
    cv.width=Math.round(box.width); cv.height=Math.round(box.height);
  }
  const x=cv.getContext('2d'); if(!x) return;
  const W=cv.width, H=cv.height, cfg=forgeCfg;
  const g=x.createLinearGradient(0,0,0,H); // та же формула оттенка, что в свотчах выбора неба
  // 01.09.2026 «Свой фон»: h1/h2 читаются напрямую — не выводятся из sky каждый раз заново.
  // Для конфигов, где автор не трогал свободный цвет, forgeSanitize уже положил туда те же
  // числа, что раньше давала эта же формула (232+sky*.3, 200+sky*.3) — картинка не меняется.
  const psl=forgePreviewMoodSL(cfg.mood);
  g.addColorStop(0,'hsl('+cfg.h1+','+psl.S0+'%,'+psl.L0+'%)'); g.addColorStop(1,'hsl('+cfg.h2+','+psl.S1+'%,'+psl.L1+'%)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  _fSkyT+=dt;
  let seed=12345; const rnd=function(){ seed=(seed*1103515245+12345)>>>0; return seed/4294967296; };
  /* 11.09.2026 (владелец, макет preview-gustota-tuman-11-09-2026.html, одобрено): раньше здесь
     было жёстко «70» — «Густота» на вкладке «Цвет» вообще не читалась, менял ползунок — в окне
     ничего не менялось. Теперь число звёзд — ДОЛЯ от безопасного потолка ТЕКУЩЕГО Q.level
     (не абсолютное число из ползунка напрямую) — тот же принцип, что уже применён сегодня к
     фоновым звёздам самого полёта (STAR_TIER, render.js): автор видит свой выбор густоты честно
     на своём устройстве, а не может подсунуть более слабому зрителю чужой трассы перегруз.
     FORGE_PV_STAR_CAP — свой, отдельный от STAR_TIER потолок именно для этого маленького окна
     (оно рисуется только пока открыт экран Конструктора, не во время полёта — можно позволить
     не 90/140/180, а числа поменьше и попроще, риска нет). */
  const FORGE_PV_STAR_CAP=[24,40,56,80]; // Дно/Средний/Высокий/Ультра
  const pvQLevel=(typeof Q!=='undefined' && typeof Q.level==='number')?Q.level:1;
  const pvCap=FORGE_PV_STAR_CAP[pvQLevel]||FORGE_PV_STAR_CAP[1];
  const nStars=Math.round(12+((cfg.dens-10)/90)*(pvCap-12)); // 12 — минимум даже при Густоте=10, «пусто» должно оставаться пустым на любом устройстве
  for(let i=0;i<nStars;i++){ // звёздный фон: статичный сид + мягкое дыхание
    const sx=rnd()*W, sy=(rnd()*H+_fSkyT*(8+cfg.s*.25)*(0.3+rnd()))%H;
    x.globalAlpha=.25+rnd()*.55; x.fillStyle=rnd()>.85?'#ffe9b8':'#dfe8ff';
    x.beginPath(); x.arc(sx,sy,rnd()*1.4+.4,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  const realKinds=FORGE_KINDS.filter(function(k,i){ return cfg.e>>i&1; });
  /* 15.09.2026 «Единая карточка» (владелец): #forgePreviewName/#forgePreviewStickers — тот же
     вид, что уже на карточке Мастерской (js/forge.js workshopRenderList выше). Имя читается
     из #forgeName напрямую (тот же элемент, что «Сложность» использует при сохранении, живёт
     на другом шаге «Создать», но остаётся в DOM всегда — .hidden только на ЭКРАНЕ, не в дереве).
     Стикеры — РЕАЛЬНый realKinds (не тот kinds ниже с запасным 'rock' для анимации, который
     исказил бы состав), тот же PT_ICON_SVG/PT_KIND_COLOR, что у карточки Мастерской. Сигнатура —
     не переписывать DOM на каждый кадр без надобности.
     16.09.2026 (владелец: «на окне написано "Дайте имя", а дать его здесь нельзя — поле имени
     живёт на шаге Сохранить») — плейсхолдер-заглушка снята, пусто и есть честный ответ, пока
     имя не задано на том шаге, где его реально можно ввести. */
  const pvNameEl=$('forgePreviewName'), pvStkEl=$('forgePreviewStickers');
  if(pvNameEl && pvStkEl){
    const nameInput=$('forgeName');
    const curName=nameInput?nameInput.value.trim():'';
    const sig=curName+'|'+realKinds.join(',');
    if(sig!==_fPvSig){
      _fPvSig=sig;
      pvNameEl.textContent=curName;
      pvStkEl.innerHTML=(typeof PT_ICON_SVG!=='undefined') ? realKinds.map(function(k){
        return '<span class="wSticker" style="color:'+PT_KIND_COLOR[k]+'" title="'+(PT_KIND_LABEL[k]||k)+'">'+PT_ICON_SVG[k]+'</span>';
      }).join('') : '';
    }
  }
  const kinds=realKinds.slice();
  if(!kinds.length) kinds.push('rock'); // пустой состав — не повод для мёртвого неба (только для анимации превью, не для стикеров выше)
  for(let i=0;i<9;i++){ // дальняя стая: мелкие тусклые тени — глубина и параллакс (v1.86.0)
    const fx=(i*311+41)%W, fy=(_fSkyT*(5+cfg.s*.12)+i*83)%(H+40)-20;
    x.globalAlpha=.3; x.fillStyle='rgba(120,150,220,.5)';
    x.beginPath(); x.arc(fx,fy,3+(i%3)*2,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  const base=4, n=base+Math.round(cfg.d/11); // базовая стая: небо дышит всегда, жар добавляет к ней, а не включает с нуля (v1.86.0)
  for(let i=0;i<n;i++){
    const k=kinds[i%kinds.length], near=i<base; // первые четыре — ближние и крупные
    const ox=(i*197+53)%W, oy=(_fSkyT*(near?20+cfg.s*.45:13+cfg.s*.35)+i*61)%(H+90)-45;
    const r=near?15+(i%3)*6:7+(i%3)*4;
    x.fillStyle=near?'rgba(5,9,20,.78)':'rgba(8,12,26,.6)'; x.strokeStyle='rgba(150,180,240,.42)'; x.lineWidth=1.5;
    if(k==='gate'){ x.beginPath(); x.arc(ox,oy,r+5,0,6.283); x.stroke(); }
    else if(k==='comet'){ x.beginPath(); x.moveTo(ox+r,oy+r*.4); x.lineTo(ox-r,oy-r*.7); x.lineTo(ox+r*.1,oy+r*.5); x.closePath(); x.fill(); }
    else { x.beginPath(); x.arc(ox,oy,r,0,6.283); x.fill(); x.stroke(); }
  }
  if(cfg.b>0){ x.fillStyle='#ffd76a'; for(let i=0;i<cfg.b+1;i++){ const sx=(i*263+97)%W, sy=(_fSkyT*10+i*47)%H;
    x.globalAlpha=.8; x.beginPath(); x.arc(sx,sy,2.2,0,6.283); x.fill(); } x.globalAlpha=1; }
  // 30.08.2026 (владелец, макет): «Туман» в превью конструктора рисовался тремя плоскими
  // rgba-прямоугольниками — на глаз читалось как чёткие белые полосы, не как дымка. Убрано
  // совсем, не заменено тогда — настоящий эффект «Туман» в полёте это другой, рабочий механизм
  // (радиальная виньетка #fog.f1/.f2 в index.html/ui.js), preview-баг его не касался.
  // 11.09.2026 (владелец, тот же макет, одобрено): заменено на мягкую радиальную виньетку —
  // тот же приём, что уже одобрен и работает в forgeMiniSwatchPaint() (свотчи Мастерской) чуть
  // ниже по этому файлу, не новый рисунок. Интенсивность растёт с уровнем (Лёгкий/Густой), не
  // бинарно — Туман=0 не рисует ничего, как и раньше.
  if(cfg.fog){ const inten=cfg.fog===1?.35:.55; const v=x.createRadialGradient(W/2,H/2,10,W/2,H/2,W*.6);
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(2,4,12,'+inten+')'); x.fillStyle=v; x.fillRect(0,0,W,H); }
  if(cfg.fl){ const v=x.createRadialGradient(W/2,H/2,30,W/2,H/2,W*.55); // фонарик: свет вокруг, края тонут
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(2,4,12,.82)');
    x.fillStyle=v; x.fillRect(0,0,W,H); }
}
function forgeSkyLoop(ts){ // мягкий цикл: рисует только пока конструктор на экране
  if(!_fSkyRun) return;
  const sc=elForgeScreen;
  if(sc&&!sc.classList.contains('hidden')){ const dt=Math.min(.05,(ts-(_fSkyRun===true?ts:_fSkyRun))/1000)||0.016; _fSkyRun=ts; forgeSkyPaint(dt); }
  requestAnimationFrame(forgeSkyLoop);
}
function forgeSkyKick(){
  /* v1.282.13: небо рисуется только когда Кузница на экране. forgeSyncWidgets зовётся и
     из forgeFill, а тот — из applyLang(): смена языка на экране Настроек запускала
     холостую rAF-цепочку превью, которая жила до следующей навигации. Хуже: если
     setScreen успел погасить _fSkyRun, а кадр уже был поставлен, цепочек становилось две. */
  const scr=elForgeScreen;
  if(scr && scr.classList.contains('hidden')) return;
  if(_fSkyRun) { forgeSkyPaint(0.016); return; } _fSkyRun=true;
  forgeSkyPaint(0.016); if(typeof requestAnimationFrame==='function') requestAnimationFrame(forgeSkyLoop); }

/* ---------- Состояние конструктора ---------- */
let forgeCfg=forgeSanitize(Store.get('forgeLast',null)||Object.assign({},FORGE_PRESETS[0].c)); // последняя трасса переживает перезапуск; свежая кухня — «Разминка» уже выбрана, ноль обязательных решений (v1.86.0)
function forgeCfgGet(){ return forgeCfg; }

/* ---------- Виджеты: сегменты, чипы, свотчи ---------- */
function forgeSegBuild(el,items,get,set){ // items: [{v,t}] — значение и текст
  if(!el) return;
  if(el.children.length!==items.length){
    el.innerHTML='';
    items.forEach(function(it){
      const b=document.createElement('button');
      b.className='forgeSegBtn';
      b.addEventListener('click',function(){ set(it.v); forgeSyncWidgets(); sfx.click(); haptic('light'); });
      el.appendChild(b);
    });
  }
  el._items=items; // подписи живут здесь: язык сменился — текст перечитается в _sync
  el._sync=function(){ for(let i=0;i<el.children.length;i++){
    el.children[i].textContent=el._items[i].t;
    el.children[i].classList.toggle('sel',el._items[i].v===get());
  } };
}
function forgeChipBuild(el,text,get,set){
  if(!el) return;
  if(!el.children.length){
    const b=document.createElement('button');
    // 20.09.2026 (владелец, тот же макет: «человек не находит нужную кнопку, потому что она не
    // выглядит как кнопка») — целая строка-предложение читалась неотличимо от соседнего .hint.
    // Постоянная точка-маркер (.forgeToggleChip) — виден как тумблер до и после нажатия, не
    // только в выбранном состоянии.
    b.className='forgeChip forgeToggleChip';
    b.innerHTML='<span class="dot"></span><span class="t"></span>';
    b.addEventListener('click',function(){ set(!get()?1:0); forgeSyncWidgets(); sfx.click(); haptic('light'); });
    el.appendChild(b);
  }
  el._text=text;
  el._sync=function(){ el.children[0].querySelector('.t').textContent=el._text; el.children[0].classList.toggle('sel',!!get()); };
}
/* 01.09.2026 «Пространство в меню»: forgeSkyBuild() (свотчи «Небо») удалена — дублировала
   свободные ползунки h1/h2 в Расстановке, не зная о них. FORGE_SKYS/forgeCfg.sky остаются
   в forgeSanitize/Pack/Unpack — старые уже разосланные коды без явного h1/h2 по-прежнему
   выводят цвет из sky (обратная совместимость), просто UI-пикер для него больше не строится. */

/* ---------- Экран: наполнение и события ---------- */
function forgeFill(){ // подписи + состояние виджетов по текущему языку (вызывается из applyLang)
  if(typeof L==='undefined'||!L.forgeTitle) return;
  /* 23.08.2026: тот же класс защиты, что и в ui.js/ach.js — раньше каждая строка читала
     $(id) напрямую, отсутствие любого одного элемента (устаревший кэш index.html) обрывало
     бы заполнение экрана конструктора на середине. Список + цикл компактнее девятнадцати
     одинаковых строк с одинаковой проверкой. */
  const LBL=[['forgeTitle',L.forgeTitle],['forgeDenLbl',L.forgeDen],['forgeSpdLbl',L.forgeSpd],['forgeWindLbl',L.forgeWind],
    ['forgeWindHint',L.forgeWindHint],
    ['forgeHeatLbl',L.forgeHeat],
    ['forgeLivesLbl',L.forgeLives],['forgeWaveLbl',L.forgeWave],['forgeWaveHint',L.forgeWaveHint],
    // 20.09.2026: forgeBonusLbl (заголовок-дубль внутри бывшей подгруппы) удалён вместе с
    // разметкой — «Бонусы» теперь имя чипа (forgeBonusGrpLbl), тот же ключ L.forgeBonus.
    ['forgeBonusGrpLbl',L.forgeBonus],
    ['forgeFogLbl',L.forgeFog],
    // 15.09.2026 (аудит шага «Цвет»): 6 подписей были захардкожены прямо в index.html, только
    // на русском — не переводились ни разу. forgeSkyLbl/forgeLenLbl — убраны из списка тут же,
    // ни один из этих id не существует в текущей разметке (мёртвые записи с ~11.09.2026).
    ['ptColorLbl',L.ptColorLbl],['ptColor2Lbl',L.ptColor2Lbl],['ptDensLbl',L.ptDensLbl],
    ['ptMoodLbl',L.ptMoodLbl],['ptMoodHint',L.ptMoodHint],['forgeFavLbl',L.forgeFavLbl],['forgeFavHint',L.forgeFavHint],
    // 15.09.2026 (аудит шага «Сохранить»): те же 3 заголовка группы — тоже были только на
    // русском, id у них раньше не было вовсе (index.html), добавлены вместе с этим фиксом.
    // 20.09.2026: forgeHardSpoilerGrpT убран из цикла — сам элемент (общий заголовок-спойлер)
    // удалён при переходе на 3 чипа, ключ L.forgeHardSpoilerGrpT остался в i18n.js неиспользуемым.
    ['forgeTempoLbl',L.forgeTempoLbl],['forgeStartLbl',L.forgeStartLbl],
    ['forgeDiffMeterLbl',L.forgeDiffMeterLbl],
    ['forgePlay',L.forgePlayBtn],['forgeShareMapBtn',L.forgeShareMapBtn],
    ['forgeSaveRecapLenLbl',L.forgeRecapLen],['forgeSaveRecapPtsLbl',L.forgeRecapPts],['forgeSaveRecapFogLbl',L.forgeFog],
    ['ptEmptyHintTxt',L.ptEmptyHint]];
  // 22.09.2026: forgeResetBtn как отдельная кнопка убрана целиком (её работа — на долгом
  // нажатии ptUndoBtn, js/partitura.js). L.forgeResetBtn («Сбросить всё») не мёртв — тот же
  // текст по-прежнему подписывает НЕСВЯЗАННУЮ кнопку workshopFilterReset (см. ниже в файле).
  // 07.09.2026: «Начать по-другому»/forgeStartOverLbl снята вместе с общей рамкой — «Сбросить
  // всё» и «Небо друга» разъехались по разным местам экрана, общей подписи над ними больше нет.
    // 28.08.2026: forgeBack — круглая иконка, текст ей не пишем (см. index.html)
    // 02.09.2026: «Поделиться небом» вернулась в Конструктор — mapShare() существовала
    // с v1.87.0, но не была вызвана ни одной кнопкой (см. wireOnLocal ниже)
  for(const pair of LBL){ const el=$(pair[0]); if(el) el.textContent=pair[1]; }
  const densEl=$('ptDensLbl'); if(densEl) densEl.title=L.ptDensTitle; // подсказка (title) — отдельно, LBL выше трогает только textContent
  if(typeof forgeHarmonyFillLabels==='function') forgeHarmonyFillLabels(); // 15.09.2026 (аудит #2): кнопка/заголовок/7 схем/примечание «Гармонии цвета»
  // 30.08.2026: три заголовка групп стали .setGrp (аккордеон) — текст живёт в дочернем .setGrpT,
  // а не прямо в узле (тот же приём, что grpT() в ui.js для Настроек) — el.textContent затёр бы span
  // 05.09.2026: #modeForge убран из «Соревнований» вместе с самой кнопкой (Конструктор
  // переехал на главный экран, id="konstruktorBtn") — строка, что красила её подпись,
  // больше не на что указывать, снята вместе с ней.
  const fnEl=$('forgeName'); if(fnEl) fnEl.placeholder=L.forgeNamePh;
  // 22.09.2026: отдельная панель чипов «враги» (forgeChips/forgeObChip) убрана — переключение
  // forgeCfg.e теперь живёт на подписи под значком прямо в лотке «Карты» (js/partitura.js,
  // ptWireTray, слушатель клика по .stickerCap). ВАЖНО (замечено при удалении, не решено):
  // это была единственная точка, где имена видов шли через L.fkRock..fkGate (переведены на
  // 4 языка) — подпись в лотке всегда использовала PT_KIND_LABEL (partitura.js), жёстко русский
  // текст, ни на что не переключается. С удалением этой панели L.fkRock..fkGate становятся
  // полностью неиспользуемыми, а подпись в лотке (единственное оставшееся место) — по-прежнему
  // не переведена ни для одного языка, кроме русского. Сама подпись была нелокализована и до
  // этой правки, тут ничего не ухудшилось для игроков, но резерв на перевод (L.fk*) теперь мёртв.
  // сегменты
  forgeSegBuild($('forgeSeg'),FORGE_LENS.map(function(m){ return {v:m,t:m>0?m+' '+(L.unitM||'м'):L.forgeInf}; }),
    function(){return forgeCfg.l;},function(v){forgeCfg.l=v;});
  /* 02.09.2026: «Высокая ставка» обещает «1 жизнь, бонусов нет» — но Жизни/Бонусы
     оставались кликабельными поверх неё. Тап по «Часто» реально менял forgeCfg.b (страж
     живого замера: b 0→3), однако forgeSanitize() при сохранении/полёте всё равно
     возвращает b=0 (это уже было — see forgeSanitize «if(o.hs){ o.lv=1; o.b=0; }»)
     — тап казался рабочим, а результат тихо стирался. Владелец вживую: «сломанная
     кнопка». Теперь set() игнорирует тап, пока ставка активна — то же самое, что
     forgeSanitize уже гарантирует, только видно сразу, а не после полёта. */
  forgeSegBuild($('forgeLivesSeg'),[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'}],
    function(){return forgeCfg.lv;},function(v){ if(!forgeCfg.hsTier) forgeCfg.lv=v; });
  forgeSegBuild($('forgeWaveSeg'),[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'},{v:4,t:'4'},{v:5,t:'5'},{v:6,t:'6'}],
    function(){return forgeCfg.w;},function(v){ if(forgeCfg.hsTier!==2) forgeCfg.w=v; }); // 23.09.2026: «Ставка ×8» форсирует максимум, тот же приём, что уже у Жизни/Бонусов под ×4
  /* 23.09.2026 «Бонусы компактнее» + «Ставка ×8» (владелец, живой разбор — макет
     bonusy-i-temp-szhatie-22-09-2026.html, «делаем»): «Высокая ставка» была отдельным чипом-
     тумблером под этими же сегментами (forgeHSChip, см. историю ниже) — теперь это 5-я/6-я
     кнопка В ТОМ ЖЕ ряду. Один виджет вместо двух, один forgeCfg.hsTier (0=выкл, 1=×4, 2=×8)
     вместо булева hs — forgeCfg.hs остаётся булевым дублем (hsTier>=1) для обратной
     совместимости со старыми CG2-кодами без нового хвоста (см. forgeBitsPack/Unpack). ×8
     форсирует дополнительно ещё и Стартовую жару на максимум (6) — ×4 сам по себе оправдан
     тем, что уже забирает жизни+бонусы, а вот ×8 требует ЕЩЁ одной честной жертвы, иначе это
     просто «то же самое, но с большим числом» (владелец сам поднял этот вопрос). */
  forgeSegBuild($('forgeBonusSeg'),
    [{v:0,t:L.bOff},{v:1,t:L.bRare},{v:2,t:L.bNorm},{v:3,t:L.bOften},{v:'hs4',t:L.forgeHS4},{v:'hs8',t:L.forgeHS8}],
    function(){ return forgeCfg.hsTier===2?'hs8':forgeCfg.hsTier===1?'hs4':forgeCfg.b; },
    function(v){
      if(v==='hs4'){ forgeCfg.hsTier=1; forgeCfg.hs=1; forgeCfg.lv=1; forgeCfg.b=0; }
      else if(v==='hs8'){ forgeCfg.hsTier=2; forgeCfg.hs=1; forgeCfg.lv=1; forgeCfg.b=0; forgeCfg.w=6; }
      else { forgeCfg.hsTier=0; forgeCfg.hs=0; forgeCfg.b=v; }
    });
  forgeSegBuild($('forgeFogSeg'),[{v:0,t:L.fog0},{v:1,t:L.fog1},{v:2,t:L.fog2}],
    function(){return forgeCfg.fog;},function(v){forgeCfg.fog=v;});
  forgeChipBuild($('forgeFlatChip'),L.forgeFlat,function(){return forgeCfg.fl;},function(v){forgeCfg.fl=v;});
  // 31.08.2026-23.09.2026: forgeHSChip (отдельный чип-тумблер «Высокая ставка») удалён —
  // переехал внутрь forgeBonusSeg выше как 5-я/6-я кнопка. forgeChipBuild(forgeHSChip,...)
  // здесь стоял три недели, теперь роль полностью закрыта forgeSegBuild(forgeBonusSeg,...).
  // v1.85.0: ручка «Жар» и спойлер тонкой настройки — живут на сцене, не в сегментах
  const heat=$('forgeHeat');
  if(heat&&!heat._bound){ heat._bound=1; heat.addEventListener('input',function(){
    forgeHeatSet(+heat.value); forgeSyncWidgets(); }); }
  forgeSyncWidgets();
}
function forgeSyncWidgets(){ // конфиг → виджеты
  /* v1.282.14: имя не перетираем, пока его печатают. У #forgeName нет слушателя ввода
     (конфиг читается только в forgeReadForm при запуске), а эта функция — общая точка
     выхода всех виджетов: игрок набирал «Ад Пилота», трогал любой чип — и имя молча
     возвращалось к прежнему. Пишем в поле только когда курсор не в нём. */
  const nmEl=$('forgeName'); if(nmEl && document.activeElement!==nmEl) nmEl.value=forgeCfg.n;
  const denEl=$('forgeDen'), denVEl=$('forgeDenV'); if(denEl) denEl.value=forgeCfg.d; if(denVEl) denVEl.value=forgeCfg.d;
  const spdEl=$('forgeSpd'), spdVEl=$('forgeSpdV'); if(spdEl) spdEl.value=forgeCfg.s; if(spdVEl) spdVEl.value=forgeCfg.s;
  const windEl=$('forgeWind'), windVEl=$('forgeWindV'); if(windEl) windEl.value=forgeCfg.wind||0; if(windVEl) windVEl.value=forgeCfg.wind||0; // 06.09.2026 «Солнечный ветер»; 16.09.2026: .forgeValInput — .value, не .textContent (реальный input, не <b>)
  const heat=$('forgeHeat'); if(heat){ heat.value=forgeHeatGet(); const hV=$('forgeHeatV'); if(hV) hV.textContent=forgeHeatGet(); } // «Жар» следует за плотностью автора
  const livesSegEl=$('forgeLivesSeg'), waveSegEl=$('forgeWaveSeg'); // 02.09.2026: то же, что set() теперь игнорирует под «Ставкой» — видно сразу, не только по бездействию тапа
  if(livesSegEl) livesSegEl.classList.toggle('locked',!!forgeCfg.hsTier);
  // 23.09.2026: forgeBonusSeg сам больше не «locked» отдельно от себя — выбор Ставки теперь И
  // ЕСТЬ его собственное выбранное состояние (5-я/6-я кнопка того же ряда), а не блокировка
  // поверх соседнего виджета. Локается только forgeWaveSeg, и только под ×8 (форсирует жару=6).
  if(waveSegEl) waveSegEl.classList.toggle('locked',forgeCfg.hsTier===2);
  const hsNoteEl=$('forgeHSNote');
  if(hsNoteEl){
    const t = forgeCfg.hsTier===2?L.forgeHSNote8:forgeCfg.hsTier===1?L.forgeHSNote4:'';
    hsNoteEl.textContent=t; hsNoteEl.classList.toggle('hidden',!t);
  }
  // 02.09.2026: чипам, построенным forgeChipBuild()/forgeSegBuild(), нужен вызов _sync() отсюда,
  // иначе виджет навсегда остаётся без подписи (владелец вживую: «под кнопкой часто видно
  // пустую кнопку»). Забыли добавить соседа в список — страж 147. forgeHSChip убран из списка
  // 23.09.2026 вместе с самим элементом (см. комментарий выше в forgeFill()).
  ['forgeSeg','forgeLivesSeg','forgeWaveSeg','forgeBonusSeg','forgeFogSeg','forgeFlatChip'].forEach(function(id){
    const el=$(id); if(el&&el._sync) el._sync();
  });
  forgeSkyKick(); // небо перерисовывается на каждый поворот ручки
  if(typeof ptRender==='function'){ ptSelIdx=-1; ptRender(); if(typeof ptRenderRuler==='function') ptRenderRuler(); if(typeof ptSyncLenUI==='function') ptSyncLenUI(); if(typeof ptSyncColorUI==='function') ptSyncColorUI(); } // 01.09.2026: пресет/код друга сменил forgeCfg.sc/.l/.h1/.h2/.dens — лента и ползунки Партитуры должны это увидеть
  if(typeof ptSyncTrayAvailability==='function') ptSyncTrayAvailability(); // 02.09.2026: «Состав» мог включить/выключить вид — лоток стикеров должен это честно показать
  if(typeof forgeUpdateDiffMeter==='function') forgeUpdateDiffMeter(); // 20.09.2026: кольцо «Сложность неба» — та же общая точка выхода, что и остальные виджеты
}
function forgeOpen(){ forgeCfg=forgeSanitize(Store.get('forgeLast',null)||forgeCfg); forgeFill(); forgeSkyKick(); if(typeof ptFill==='function') ptFill();
  forgeFavRowSync(); // 10.09.2026: свежий список избранного при каждом входе — мог измениться в другой вкладке/сессии
  /* 18.09.2026 (живой тест на подключённом устройстве): workshopRenderList() убран отсюда —
     forgeTabSet('play') уже зовёт его сама (ветка if(forgeTab==='play')). Два синхронных вызова
     подряд слали ДВА параллельных запроса к workshopList(sort) — гонка иногда оставляла список
     треков пустым без сообщения «пока пусто», хотя сервер честно отдавал данные (подтверждено
     инструментированным счётчиком + ручным повтором на реальном Samsung). */
  forgeTabSet('play'); workshopFillLabels(); // 06.09.2026: «Играть/Создать» — вход всегда на «Играть», Мастерская больше не отдельный экран
} // v1.85.0: небо оживает при входе в конструктор; 01.09.2026: Партитура — своя лента, тот же вход

/* 06.09.2026 «Играть/Создать» (владелец: «два разных мира — это тупо, нужен плавный переход»):
   один экран, тап по вкладке вместо ухода на отдельный экран Мастерской. Тап по готовому
   сценарию/успешная загрузка кода друга/«В Кузницу» из Мастерской сами переводят на «Создать» —
   обещание пресетов «тапнул — сразу летишь» остаётся честным, «Лететь» просто рядом по вкладке. */
let forgeTab='play';
function forgeTabSet(t){
  forgeTab=(t==='create')?'create':'play';
  const playBtn=$('forgeTabPlayBtn'), createBtn=$('forgeTabCreateBtn');
  if(playBtn) playBtn.classList.toggle('sel', forgeTab==='play');
  if(createBtn) createBtn.classList.toggle('sel', forgeTab==='create');
  const playEl=$('forgeTabPlay'), createEl=$('forgeTabCreate');
  if(playEl) playEl.classList.toggle('hidden', forgeTab!=='play');
  if(createEl) createEl.classList.toggle('hidden', forgeTab!=='create');
  if(forgeTab==='play'){ workshopRenderList(); forgeStepExit(); } // список мог устареть, пока игрок был на «Создать»
  if(forgeTab==='create'){ forgeStepEnter(); forgeSubTabSet('arrange'); } // 06.09.2026 «Переосмысление, часть 2»: вход в «Создать» всегда начинается с Расстановки
}
wireOnLocal('forgeTabPlayBtn','click',function(){ sfx.click(); haptic('light'); forgeTabSet('play'); });
wireOnLocal('forgeTabCreateBtn','click',function(){ sfx.click(); haptic('light'); forgeTabSet('create'); });

/* 12.09.2026 (макеты karta-/tsvet-/sohranit-polnoekranny-shag-12-09-2026.html, одобрено):
   «Создать» — три полноэкранных ШАГА, не три вкладки на одной странице. Обычная шапка
   экрана (круглая «Назад» + «Конструктор» + Играть/Создать) на время шага полностью
   прячется — её сменяет forgeStepHead/forgeStepBack/forgeStepConfirmWrap. */
function forgeStepEnter(){
  const back=$('forgeBack'), title=$('forgeTitle'), tabs=$('forgeTabs');
  if(back) back.classList.add('hidden');
  if(title) title.classList.add('hidden');
  if(tabs) tabs.classList.add('hidden');
}
function forgeStepExit(){
  const back=$('forgeBack'), title=$('forgeTitle'), tabs=$('forgeTabs');
  if(back) back.classList.remove('hidden');
  if(title) title.classList.remove('hidden');
  if(tabs) tabs.classList.remove('hidden');
}
/* 22.09.2026 (владелец, живой скрин: «название гуляет, то вверх, то вниз, должно быть там,
   где кнопки Телеграма») — #forgeStepTitle стоял только на CSS-формуле padding-top
   (#forgeStepHead, index.html), той же, что держит ВСЕ остальные заголовки экранов как
   базовую позицию — но, в отличие от них, никогда не получал добавочную живую центровку
   (centerTitleOnHeader/shrinkScreenTitle, js/ui.js), которая у остальных срабатывает и на
   входе (retitleScreen), и при позднем приходе правды Telegram (tgInsetsSync → retitleScreen).
   Тот же приём, тот же код — просто дотянут до третьего заголовка, который раньше стоял в
   стороне от общей системы. Вызывается и на входе в шаг (forgeSubTabSet — единственное место,
   что меняет текст), и из retitleScreen в js/ui.js, когда шаг «Создать» реально на экране. */
function forgeStepRetitle(){
  const t=$('forgeStepTitle'); if(!t) return;
  if(typeof shrinkScreenTitle==='function') shrinkScreenTitle(t);
  if(typeof centerTitleOnHeader==='function') centerTitleOnHeader(t);
}
const FORGE_STEP_ORDER=['arrange','sky','hard'];
// 15.09.2026 (тот же аудит, что нашёл 6 подписей шага «Цвет» и 3 заголовка «Сохранить» — эти
// два объекта были ровно тем же классом бага, просто не строкой в index.html, а константой
// здесь): были захардкожены на русском при объявлении модуля, один раз навсегда, ЯЗЫК ПОСЛЕ
// СМЕНЫ НЕ ОБНОВЛЯЛСЯ ВООБЩЕ — заголовки шагов и кнопка «Подтвердить...» оставались русскими
// даже когда весь остальной экран уже переключился. Функции вместо константных объектов —
// читают L.* каждый раз заново, в момент вызова, а не один раз при загрузке файла.
function FORGE_STEP_TITLE(){ return {arrange:L.forgeStepMap, sky:L.forgeStepColor, hard:L.forgeStepSave}; }
function FORGE_STEP_CONFIRM_LBL(){ return {arrange:L.forgeConfirmMap, sky:L.forgeConfirmColor}; }
let forgeSub='arrange';
/* 17.09.2026 (владелец, «Делай», макет konstruktor-pustota-i-sohranit-17-09-2026.html): карточка-
   итог на «Сохранить» — статичный кадр той же формулой, что красит живое превью на «Цвет»
   (forgePreviewMoodSL), плюс числа, уже посчитанные в forgeCfg. Один раз при входе на шаг —
   не requestAnimationFrame, там нечего анимировать ради пары секунд на экране. */
function forgeRenderSaveRecap(){
  const sw=$('forgeSaveRecapSwatch'); if(!sw||typeof forgeCfg==='undefined') return;
  const psl=forgePreviewMoodSL(forgeCfg.mood);
  sw.style.background='linear-gradient(160deg, hsl('+forgeCfg.h1+','+psl.S0+'%,'+psl.L0+'%), hsl('+forgeCfg.h2+','+psl.S1+'%,'+psl.L1+'%))';
  const lenEl=$('forgeSaveRecapLen'); if(lenEl) lenEl.textContent=forgeCfg.l>0?(forgeCfg.l+(L.unitM||'м')):'∞';
  const ptsEl=$('forgeSaveRecapPts'); if(ptsEl) ptsEl.textContent=(forgeCfg.sc||[]).length;
  const fogEl=$('forgeSaveRecapFog'); if(fogEl) fogEl.textContent=[L.fog0,L.fog1,L.fog2][forgeCfg.fog||0]||'—';
}
function forgeSubTabSet(s){
  const leftArrange=(forgeSub==='arrange'&&s!=='arrange');
  forgeSub=(s==='sky')?'sky':(s==='hard')?'hard':'arrange';
  const arrangeEl=$('forgeSubArrange'), skyEl=$('forgeSubSky'), hardEl=$('forgeSubHard');
  if(arrangeEl) arrangeEl.classList.toggle('hidden', forgeSub!=='arrange');
  if(skyEl) skyEl.classList.toggle('hidden', forgeSub!=='sky');
  if(hardEl) hardEl.classList.toggle('hidden', forgeSub!=='hard');
  if(forgeSub==='hard') forgeRenderSaveRecap();
  if(forgeSub==='sky' && typeof forgeMoodHintMaybeShow==='function') forgeMoodHintMaybeShow();
  // 12.09.2026: уход с «Карты» закрывает её лист точек, если он остался открытым — раньше
  // это висело на кнопках-пилюлях forgeSubSkyBtn/forgeSubHardBtn (js/partitura.js), теперь
  // единственная точка перехода между шагами — здесь. Заодно снимает «взведённый» стикер,
  // закрывает пузырёк выбранной точки и гасит недоподтверждённое «Сбросить» — начатое на
  // «Карте» действие не должно тихо висеть/сработать после ухода с неё.
  if(leftArrange){
    const lov=$('ptListOverlay'); if(lov) lov.classList.remove('show');
    if(typeof ptArmedType!=='undefined') ptArmedType=null;
    document.querySelectorAll('#ptTray .stickerItem').forEach(x=>x.classList.remove('armed'));
    if(typeof ptSelIdx!=='undefined' && ptSelIdx>=0){ ptSelIdx=-1; if(typeof ptRender==='function') ptRender(); }
    ptUndoBtnCancelHold(); // 22.09.2026: было «недоподтверждённое Сбросить» на отдельной кнопке — тот же смысл, для долгого нажатия на ptUndoBtn
  }
  const t=$('forgeStepTitle'); if(t) t.textContent=FORGE_STEP_TITLE()[forgeSub];
  forgeStepRetitle(); // 22.09.2026: та же живая центровка, что у всех остальных заголовков экранов — раньше «Карта»/«Небо»/«Сохранить» стояли только на CSS-формуле, «плавали»
  const idx=FORGE_STEP_ORDER.indexOf(forgeSub);
  document.querySelectorAll('.forgeStepDot').forEach(function(d){
    const di=FORGE_STEP_ORDER.indexOf(d.dataset.sub);
    d.classList.toggle('cur', di===idx);
    d.classList.toggle('done', di<idx); // только пройденные назад — прыжок вперёд без подтверждения не даём
  });
  const cw=$('forgeStepConfirmWrap'); if(cw) cw.classList.toggle('hidden', forgeSub==='hard'); // на «Сохранить» уже есть настоящие Полёт/Поделиться
  const cl=$('forgeStepConfirmLbl'); const confirmLbl=FORGE_STEP_CONFIRM_LBL()[forgeSub]; if(cl && confirmLbl) cl.textContent=confirmLbl;
}
wireOnLocal('forgeStepBack','click',function(){
  sfx.click(); haptic('light');
  const idx=FORGE_STEP_ORDER.indexOf(forgeSub);
  if(idx<=0) forgeTabSet('play'); else forgeSubTabSet(FORGE_STEP_ORDER[idx-1]);
});
wireOnLocal('forgeStepConfirmBtn','click',function(){
  sfx.click(); haptic('light');
  const idx=FORGE_STEP_ORDER.indexOf(forgeSub);
  if(idx<FORGE_STEP_ORDER.length-1) forgeSubTabSet(FORGE_STEP_ORDER[idx+1]);
});
wireOnLocal('forgeStepDots','click',function(ev){
  const dot=ev.target.closest('.forgeStepDot'); if(!dot||!dot.classList.contains('done')) return; // вперёд без подтверждения не прыгаем
  sfx.click(); haptic('light'); forgeSubTabSet(dot.dataset.sub);
});
/* 20.09.2026 «Точечная настройка накрыта панелью точки» (владелец, живой телефон, прямое
   слово, поймано вместе в реальном времени — см. feedback_zhivoy_rezhim_telefon_vmeste_udobno):
   `.panel.quickEdit` (index.html, position:fixed, низ экрана) не знает о существовании
   раскрывшейся «Точечной настройки» — та растёт в обычном потоке `.scrBody` (flex:1 1 auto,
   overflow-y:auto), но `.scrBody` тоже не знает о quickEdit, не резервирует под неё место.
   Итог, замерено живьём: зазор между открывшейся строкой и краем панели точки — ~9px,
   визуально наложение. Тот же класс бага и то же лекарство, что уже нашли для тоста
   (ptShowToast, страж 324) — реальная высота quickEdit меряется и резервируется padding-bottom
   на скролл-контейнере, а не подбирается числом. Один и тот же вызов после КАЖДОГО действия,
   которое может изменить любую из двух высот (открыть/закрыть любой из трёх чипов Точечной
   настройки, выбрать/снять точку — quickEdit меняет .show).
   20.09.2026, продолжение (чипы вместо единого спойлера): раньше проверялся один общий
   forgeHardSpoilerGrp.open — теперь его нет, «открыта Точечная настройка» стало «открыт хотя бы
   один из трёх независимых чипов», проверяем все три явно. */
const FORGE_FINE_CHIP_IDS=['forgeTempoGrp','forgeStartGrp','forgeBonusGrp'];
function forgeReserveForQuickEdit(){
  const scrBody=document.querySelector('#forgeScreen .scrBody'); if(!scrBody) return;
  const qe=$('ptQuickEdit');
  const fineOpen=FORGE_FINE_CHIP_IDS.some(function(id){ return document.getElementById(id)?.classList.contains('open'); });
  const qeShown=!!(qe && qe.classList.contains('show'));
  if(qeShown && fineOpen){
    scrBody.style.paddingBottom=(qe.getBoundingClientRect().height+16)+'px';
  } else {
    scrBody.style.paddingBottom='';
  }
}
/* 17.09.2026 (владелец, «Делай», макет konstruktor-tochechnaya-nastroyka-vlozhennye-spoylery-
   17-09-2026.html): подразделы «Точечной настройки» (тогда — Темп неба/Старт/Преграды) — не
   аккордеон-радио, каждый переключается независимо. 20.09.2026: триггер стал компактным чипом
   (.forgeFineChip) вместо строки-спойлера — сама функция не изменилась, ей всё равно, какой
   именно элемент открывает/закрывает панель.
   20.09.2026, отменено (владелец, живой телефон, измерено): независимость двух самых длинных
   разделов, открытых вместе («Темп неба» 161px + «Старт» 464px), давала 1177px контента на
   800px реальный экран — переполнение, кнопка «Подтвердить карту» перекрывала подсказку.
   «Бонусы» выделены в свой чип (FORGE_FINE_PANEL_OF ниже), и все стали настоящим аккордеоном —
   открытие любого закрывает остальные.
   22.09.2026: «Преграды», 4-й чип, убран целиком — та же функция переехала на подпись под
   значком в лотке «Карты» (см. forgeFill() выше), сейчас в аккордеоне снова три чипа. */
const FORGE_FINE_PANEL_OF={forgeTempoGrp:'forgeTempoPanel',forgeStartGrp:'forgeStartPanel',
  forgeBonusGrp:'forgeBonusPanel'};
function forgeWireSubSpoiler(grpId, panelId){
  wireOnLocal(grpId,'click',function(){
    sfx.click(); haptic('light');
    const willOpen=!this.classList.contains('open');
    FORGE_FINE_CHIP_IDS.forEach(function(id){
      const g=$(id); if(g) g.classList.remove('open');
      const p=$(FORGE_FINE_PANEL_OF[id]); if(p) p.classList.add('hidden');
    });
    const nowOpen=willOpen;
    if(nowOpen){ this.classList.add('open'); const p=$(panelId); if(p) p.classList.remove('hidden'); }
    // 23.09.2026: одноразовые подсказки ветра/жары показываются в момент первого открытия
    // СВОЕГО чипа, не раньше — иначе сработали бы ещё до того, как игрок вообще увидел ползунок.
    if(nowOpen && grpId==='forgeTempoGrp') forgeHintMaybeShow('forgeWindHint','forgeWindHintSeen');
    if(nowOpen && grpId==='forgeStartGrp') forgeHintMaybeShow('forgeWaveHint','forgeWaveHintSeen');
    requestAnimationFrame(forgeReserveForQuickEdit);
  });
}
forgeWireSubSpoiler('forgeTempoGrp','forgeTempoPanel');
forgeWireSubSpoiler('forgeStartGrp','forgeStartPanel');
forgeWireSubSpoiler('forgeBonusGrp','forgeBonusPanel');
// 22.09.2026: forgeObstGrp/forgeObstPanel/forgeObstHint убраны целиком (см. комментарий в
// forgeFill() выше) — «Преграды» переключаются подписью в лотке «Карты», отдельного чипа/панели
// для этого больше нет. Store-флаг 'forgeObstHintSeen' остался в старых сохранённых профилях
// игроков как безвредный мёртвый ключ (ничего его больше не читает и не пишет) — не мигрируем.

/* ---------- Чтение формы / действия ---------- */
function forgeReadForm(){
  const nmEl=$('forgeName'), dEl=$('forgeDen'), sEl=$('forgeSpd');
  if(nmEl) forgeCfg.n=sanitizeTrackName(nmEl.value);
  if(dEl) forgeCfg.d=+dEl.value;
  if(sEl) forgeCfg.s=+sEl.value;
  forgeCfg=forgeSanitize(forgeCfg);
  return forgeCfg;
}
function forgePlay(){
  const cfg=forgeReadForm(); Store.set('forgeLast',cfg);
  setRunMode('custom'); sfx.click(); haptic('light'); startGame();
}
function forgeCopy(text,done){
  try{ navigator.clipboard.writeText(text).then(function(){done&&done();},function(){done&&done();}); }
  catch(e){ done&&done(); }
}
/* 08.09.2026 «Clear Check» (владелец, вдохновлено Super Mario Maker: нельзя опубликовать
   уровень, не пройдя его самому) — единственная гарантия, что публикуемое небо вообще
   пролетаемо, не просто валидный по цифрам конфиг. «Пройти» — из ui.js/gameOver(): для
   небес с длиной (customL>0) только настоящий финиш (S.mapWin), для бесконечных (customL=0,
   у них нет финиша в принципе) — любой настоящий забег до конца (естественная смерть).
   Список — последние FORGE_VERIFY_MAX кодов, не весь бесконечный журнал. */
const FORGE_VERIFY_MAX=200;
function forgeVerifyCode(code){
  if(!code) return;
  let list=Store.get('forgeVerified',[]);
  if(!Array.isArray(list)) list=[];
  const idx=list.indexOf(code);
  if(idx>=0) list.splice(idx,1); // недавно пройденный код всплывает в конец — не вытесняется раньше свежих
  list.push(code);
  if(list.length>FORGE_VERIFY_MAX) list=list.slice(list.length-FORGE_VERIFY_MAX);
  Store.set('forgeVerified',list);
}
function forgeIsVerified(code){
  const list=Store.get('forgeVerified',[]);
  return Array.isArray(list) && list.indexOf(code)>=0;
}
/* 08.09.2026 (владелец, живой разговор): «Поделиться» и «Опубликовать в Галерею» были одним
   и тем же нажатием без предупреждения — «это бред, неудобно и непонятно» (ты делишься с
   другом, а тебя тихо публикуют всем под именем). Теперь публикация — отдельный явный вопрос
   ПОСЛЕ шаринга (тот же tg.showConfirm, что уже применяется для удаления данных — не новый
   экран, готовый паттерн игры), не связанный с самим действием «отправить код другу».
   08.09.2026 «Clear Check»: вопрос вообще не задаётся, если этот ТОЧНЫЙ код ни разу не
   пройден по-настоящему — вместо диалога тост с объяснением, что нужно сделать сначала. */
/* 18.09.2026 (сквозная проверка всей игры на похожие дыры, владелец: «всей игры касается») —
   не было защиты от повторного тапа: mapShare() зовёт mapAskPublish() без единой блокировки,
   двойной тап открывает ДВА диалога подтверждения, подтвердив оба — workshopSubmit() уйдёт на
   сервер дважды. Тот же приём, что уже применён у angarBuyPremium/grSendBtn: флаг ставится ДО
   диалога (не после «да»), снимается либо на «нет», либо когда сама отправка полностью
   отработала (успех или отказ) — не сразу после показа диалога. */
let _mapPublishBusy=false;
function mapAskPublish(code, name){
  if(typeof workshopSubmit!=='function') return;
  if(!forgeIsVerified(code)){ toast(L.forgeNeedRealRun||'Сначала пролети это небо по-настоящему — потом можно опубликовать','rgba(255,159,176,.5)'); return; }
  if(_mapPublishBusy) return;
  _mapPublishBusy=true;
  const msg=L.forgePublishConfirm||'Опубликовать это небо в Галерее — увидят все?';
  const go=()=>{ workshopSubmit(code, name).then(res=>{
    // 18.09.2026 (аудит тишины-без-сигнала, владелец «да»): раньше отказ сервера (сеть/модерация/
    // антифлуд) не показывал вообще ничего — игрок не знал, опубликовано ли небо. Тот же тост,
    // что уже 6 раз применён в этом же файле для того же паттерна (workshopVote/workshopNotice и т.д.).
    if(res && res.ok) toast(L.forgePublished||'Опубликовано в Галерее','rgba(255,215,106,.5)');
    else toast(L.syncOffline,'rgba(255,159,176,.5)');
  }).catch(()=>{}).finally(()=>{ _mapPublishBusy=false; }); };
  const declined=()=>{ _mapPublishBusy=false; };
  try{
    if(tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, ok=>{ if(ok) go(); else declined(); }); }
    else if(typeof confirm==='function'){ if(confirm(msg)) go(); else declined(); }
    else declined();
  }catch(e){ declined(); }
}
function mapShare(){ // v1.87.0: «Поделиться» живёт в итогах трассы — там, где случился восторг, а не на панели кузницы
  const cfg=forgeSanitize(forgeCfg);
  const code=forgeEncode(cfg);
  const link='https://t.me/realcosmogrambot/app?startapp=map_'+code; // тот же мост, что и у дуэлей (v1.68.0)
  const txt=(L.forgeShareTxt||'').replace('%s', cfg.n||L.forgeDefName);
  forgeCopy(code, function(){ toast(L.forgeCopied,'rgba(255,215,106,.5)'); });
  const shareUrl='https://t.me/share/url?url='+encodeURIComponent(link)+'&text='+encodeURIComponent(txt);
  if(tg&&tg.openTelegramLink){ // внутри Telegram — родной диалог остаётся первым, ничего не меняем
    try{ tg.openTelegramLink(shareUrl); haptic('success'); mapAskPublish(code, cfg.n); return; }catch(e){}
  }
  if(navigator.share){ // v1.108.1 «Дверь пошире»: вне Telegram — системный лист ОС, как в shareScore()
    navigator.share({text:txt, url:link}).catch(()=>{});
    haptic('success'); mapAskPublish(code, cfg.n); return;
  }
  // 18.09.2026 (второй видео-аудит другими методами): раньше публикация предлагалась
  // независимо от того, реально ли открылось окно — блокировщик всплывающих отдаёт null
  // без исключения, «успех» был ложным. Тот же приём, что уже у duelBtn (ui.js:4168,
  // v1.282.20) — считаем успехом только реально открывшееся окно.
  let w=null; try{ w=window.open(shareUrl,'_blank'); }catch(e2){}
  if (w){ haptic('success'); mapAskPublish(code, cfg.n); }
}
/* ---------- 05.09.2026 «Мастерская»: витрина трасс поверх уже готового кода/шаринга ---------- */
function forgeWorkshopApply(code){ // тот же путь, что forgeLoadCode ниже, но код приходит не из поля ввода, а из карточки витрины
  const cfg=forgeDecode(code);
  if(!cfg) return false;
  forgeCfg=cfg; Store.set('forgeLast',cfg);
  return true;
}
function forgeWorkshopEdit(code){ // «Открыть»: открыть чужое небо под себя, не в зачёт (как и любой чужой код)
  if(!forgeWorkshopApply(code)){ toast(L.forgeBadCode,'rgba(255,159,176,.5)'); haptic('light'); return; }
  forgeSyncWidgets();
  toast(L.forgeGuest,'rgba(255,215,106,.5)'); haptic('success');
}
/* 12.09.2026 «Честный запуск» (владелец, находка сессии): раньше workshopPlayed() стреляло
   ПРЯМО ЗДЕСЬ, в момент тапа «Полёт» — до взлёта, до единого метра полёта. «Запуски» на
   карточке считали не прохождения, а нажатия кнопки. Roblox/Trackmania Exchange — тот же
   принцип, что уже применён у нас в forgeVerifyCode/S.mapWin выше (mapOver, gameOver): голос
   засчитывается только после того, как забег реально СОСТОЯЛСЯ. Здесь — тот же S.mapWin,
   не новая идея, перенос уже существующего честного правила на «Запуски».
   workshopPlayingCode запоминает, какой код летит СЕЙЧАС — mapOver() ниже решает, зачесть ли
   «сыграли» по факту (S.mapWin), не по факту тапа. */
let workshopPlayingCode = null;
function forgeWorkshopPlay(code){ // «Играть»: применить + взлёт; «сыграли» засчитывается в mapOver(), только если долетел до конца
  if(!forgeWorkshopApply(code)){ toast(L.forgeBadCode,'rgba(255,159,176,.5)'); haptic('light'); return; }
  workshopPlayingCode = code;
  forgePlay();
}
// Маленький статичный свотч карточки Мастерской — тот же язык (звёзды/дальняя стая/туман/
// фонарик), что forgeSkyPaint() выше, но БЕЗ requestAnimationFrame: список может показывать
// десятки карточек разом, а живому дышащему небу там не место (никто не просил анимировать
// список, дёшево и правильно нарисовать один раз). Сид детерминирован от самих цветов неба —
// одна и та же трасса всегда даёт один и тот же узор звёзд, не дрожит между перерисовками.
function forgeMiniSwatchPaint(cv, cfg){
  if(!cv || !cv.getContext) return;
  const x=cv.getContext('2d'); const W=cv.width, H=cv.height;
  const psl=forgePreviewMoodSL(cfg.mood);
  const g=x.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'hsl('+cfg.h1+','+psl.S0+'%,'+psl.L0+'%)'); g.addColorStop(1,'hsl('+cfg.h2+','+psl.S1+'%,'+psl.L1+'%)');
  x.fillStyle=g; x.fillRect(0,0,W,H);
  let seed=((cfg.h1|0)*7+(cfg.h2|0)*3+1)>>>0;
  const rnd=function(){ seed=(seed*1103515245+12345)>>>0; return seed/4294967296; };
  for(let i=0;i<16;i++){ x.globalAlpha=.3+rnd()*.5; x.fillStyle=rnd()>.85?'#ffe9b8':'#dfe8ff';
    x.beginPath(); x.arc(rnd()*W,rnd()*H,rnd()*1.1+.3,0,6.283); x.fill(); }
  x.globalAlpha=1;
  for(let i=0;i<3;i++){ const ox=(i*19+7)%W, oy=(i*23+11)%H, r=4+(i%2)*2;
    x.fillStyle='rgba(6,10,20,.7)'; x.strokeStyle='rgba(150,180,240,.4)'; x.lineWidth=1;
    x.beginPath(); x.arc(ox,oy,r,0,6.283); x.fill(); x.stroke(); }
  if(cfg.fog){ const v=x.createRadialGradient(W/2,H/2,4,W/2,H/2,W*.6);
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(2,4,12,.55)'); x.fillStyle=v; x.fillRect(0,0,W,H); }
  if(cfg.fl){ const v=x.createRadialGradient(W/2,H/2,6,W/2,H/2,W*.5);
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(2,4,12,.8)'); x.fillStyle=v; x.fillRect(0,0,W,H); }
}

/* 08.09.2026 «Избранная палитра» (первый шаг, владелец: «возможность скопировать небо к себе
   в избранное», зелёная точка на живом скрине под сердечком): свободные ячейки, копируем
   только сами данные неба (h1/h2/густота/настроение/туман), не весь конфиг трассы — экран
   просмотра/выбора ячейки ещё не построен, это отдельная задача.
   11.09.2026 (владелец, макет izbrannoe-v-stroku-11-09-2026.html, одобрено): было 10 — подпись
   и кружки переезжают в одну строку (см. index.html), 7 умещается вместе с подписью, 10 нет.
   Число одно — и предел сохранения, и число кружков в строке, не два разных места.
   17.09.2026 (владелец, живой разговор: «семи может быть маловато», фиксированное число проще
   открытого добавления — измерено getBoundingClientRect реальной панели (313.6px), кружок 22px
   + зазор 8px даёт 10 в ряд, 2 ряда = 20 (чётное, как просил, чтобы не мешало подписи). Подпись
   при этом переехала НАД рядом (index.html, .forgeFavHead) — 20 в одну строку с подписью уже
   физически не влезает, тот же вывод, что уже был при 10 в 10.09.2026. */
const FORGE_FAV_MAX=20;
function forgeFavSave(cfg, name, btn){
  const list=Store.get('skyFavorites')||[];
  if(list.length>=FORGE_FAV_MAX){ toast(L.workshopFavFull||'Избранное заполнено ('+FORGE_FAV_MAX+' из '+FORGE_FAV_MAX+')','rgba(255,159,176,.5)'); return; }
  list.push({h1:cfg.h1, h2:cfg.h2, dens:cfg.dens, mood:cfg.mood, fog:cfg.fog, name:name||''});
  Store.set('skyFavorites', list);
  toast(L.workshopFavSaved||'Сохранено в избранное','rgba(255,215,106,.5)');
  // 08.09.2026 (владелец: «а как это понять? она без цвета, и не говорит об этом») — экрана
  // с ячейками ещё нет, поэтому подтверждение прямо на значке: кратко заливается тем же
  // оттенком, что и само небо (formula из forgePreviewMoodSL, светлее — для видимости на тёмном фоне).
  if(btn){
    const psl=forgePreviewMoodSL(cfg.mood);
    const prevBg=btn.style.background, prevBorder=btn.style.borderColor, prevColor=btn.style.color;
    btn.style.background='hsl('+cfg.h1+','+psl.S0+'%,'+Math.min(78,psl.L0+38)+'%)';
    btn.style.borderColor='transparent'; btn.style.color='#0b1626';
    setTimeout(function(){ btn.style.background=prevBg; btn.style.borderColor=prevBorder; btn.style.color=prevColor; }, 900);
  }
}
/* 10.09.2026 «Избранное на месте» (владелец, живой скрин + макет forge-color-preview-fav-
   10-09-2026.html, одобрено): экран из 10 ячеек по-прежнему не отдельный экран (это заняло бы
   отдельную задачу) — а сам ряд прямо под вкладкой «Цвет», кружками. Тап по своему сохранённому
   кружку подставляет цвет назад на ползунки тем же путём, что и ручной ввод (forgeSyncWidgets) —
   один канал синхронизации на оба направления, не два разных.
   11.09.2026 (владелец: «сделать чтобы можно было удалить», выбрал вариант «долгое нажатие» через
   явный вопрос): долгое нажатие (550мс, forgeFavAttachPress) удаляет вместо применения — обычный
   быстрый тап по-прежнему применяет небо как раньше, долгое нажатие его не подменяет, только
   добавляется рядом. */
const FORGE_FAV_HOLD_MS=550;
function forgeFavAttachPress(b, idx){
  let timer=null, longFired=false;
  const cancel=function(){ if(timer){ clearTimeout(timer); timer=null; } b.classList.remove('pressing'); };
  b.addEventListener('pointerdown', function(){
    longFired=false; b.classList.add('pressing');
    timer=setTimeout(function(){ longFired=true; b.classList.remove('pressing'); forgeFavDelete(idx); }, FORGE_FAV_HOLD_MS);
  });
  b.addEventListener('pointerup', cancel);
  b.addEventListener('pointerleave', cancel);
  b.addEventListener('pointercancel', cancel);
  b.addEventListener('click', function(e){
    if(longFired){ e.preventDefault(); e.stopPropagation(); longFired=false; return; }
    const list=Store.get('skyFavorites')||[]; const fav=list[idx]; if(!fav) return;
    forgeCfg.h1=fav.h1; forgeCfg.h2=fav.h2; forgeCfg.dens=fav.dens; forgeCfg.mood=fav.mood; forgeCfg.fog=fav.fog;
    if(typeof ptH2Touched!=='undefined') ptH2Touched=true; // применённая пара уже согласована сама с собой — авто-гармония не должна её тут же переписать
    forgeSyncWidgets(); sfx.click(); haptic('light');
  });
}
function forgeFavDelete(idx){
  const list=Store.get('skyFavorites')||[]; if(idx<0||idx>=list.length) return;
  const msg=L.forgeFavDeleteConfirm||'Удалить это небо из избранного?';
  const go=function(){
    list.splice(idx,1); Store.set('skyFavorites', list);
    forgeFavRowSync(); toast(L.forgeFavDeleted||'Удалено из избранного','rgba(255,159,176,.5)'); haptic('light');
  };
  if(tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, function(ok){ if(ok) go(); }); }
  else if(typeof confirm==='function'){ if(confirm(msg)) go(); }
}
/* 17.09.2026 (владелец, «Делай», макет konstruktor-karta-nebo-komfort-17-09-2026.html): пустой
   ряд «Избранное» без подсказки молчал, что с ним делать — тот же приём разового объяснения,
   что уже у кошелька Коллекции (angarWalletTipMaybeShow, js/ui.js): Store-флаг, показывается
   ровно один раз за игрока и только пока список реально пуст. */
/* 17.09.2026 (владелец, живой разговор): «Бледнее и темнее ↔ ярче и солнечнее» под «Настроение»
   стояла постоянной строкой — «занимает лишнее место». Тот же разовый приём, что у кошелька и
   «Избранного» рядом — один раз за игрока, дальше никогда. */
function forgeMoodHintMaybeShow(){
  const hint=$('ptMoodHint'); if(!hint) return;
  if(Store.get('forgeMoodHintSeen',0)) return;
  Store.set('forgeMoodHintSeen',1);
  hint.classList.remove('hidden');
}
function forgeFavHintMaybeShow(isEmpty){
  const hint=$('forgeFavHint'); if(!hint) return;
  if(!isEmpty || Store.get('forgeFavHintSeen',0)){ hint.classList.add('hidden'); return; }
  Store.set('forgeFavHintSeen',1);
  hint.classList.remove('hidden');
}
/* 23.09.2026 (владелец, живой разбор: «в старте прожар тоже сделай этот текст одноразовый, чтобы
   там не висел всё время»): тот же разовый приём, что у forgeMoodHintMaybeShow/forgeFavHintMaybeShow
   выше — одна общая функция вместо третьей и четвёртой копии, разница только в id подсказки и
   ключе Store. Вызывается из forgeWireSubSpoiler ниже, в момент когда владелец открывает сам чип
   («Темп неба» → подсказка ветра, «Старт» → подсказка жары) — не на общем forgeFill/forgeSyncWidgets,
   иначе сработало бы один раз за всю игру ещё ДО того, как игрок вообще увидел ползунок. */
function forgeHintMaybeShow(hintId, storeKey){
  const hint=$(hintId); if(!hint) return;
  if(Store.get(storeKey,0)) return;
  Store.set(storeKey,1);
  hint.classList.remove('hidden');
}
/* 17.09.2026 (владелец, «Делай», макет konstruktor-sozdat-globalny-redizayn-17-09-2026.html):
   было — все FORGE_FAV_MAX (20) мест кружками всегда, почти все пунктирные пустые. Теперь —
   свои (заполненные) все видны как раньше, пустых-превью только это число, остаток — «+N»
   текстом. Число не выдумано под макет — подобрано так, чтобы пустой ряд (0 избранных) не
   выглядел ни голым (1-2 было бы мало), ни снова стеной (весь FORGE_FAV_MAX было бы старым
   поведением); 5 — тот же порядок величины, что уже был у ряда до роста лимита 7→20 09.09.2026. */
const FORGE_FAV_EMPTY_PREVIEW=5;
function forgeFavRowSync(){
  const row=$('forgeFavRow'); if(!row) return;
  const list=Store.get('skyFavorites')||[];
  forgeFavHintMaybeShow(list.length===0);
  row.innerHTML='';
  list.forEach(function(fav,i){
    const b=document.createElement('button');
    b.className='favSwatch';
    const psl=forgePreviewMoodSL(fav.mood);
    b.style.background='hsl('+fav.h1+','+psl.S0+'%,'+psl.L0+'%)';
    if(fav.name) b.title=fav.name;
    forgeFavAttachPress(b, i);
    row.appendChild(b);
  });
  const emptyLeft=FORGE_FAV_MAX-list.length;
  const emptyShown=Math.min(emptyLeft,FORGE_FAV_EMPTY_PREVIEW);
  for(let i=0;i<emptyShown;i++){
    const e=document.createElement('span');
    e.className='favEmpty';
    row.appendChild(e);
  }
  const more=emptyLeft-emptyShown;
  if(more>0){
    const m=document.createElement('span');
    m.className='favMore';
    m.textContent='+'+more;
    row.appendChild(m);
  }
}
wireOnLocal('forgeSaveFavBtn','click',function(){ forgeFavSave(forgeCfg, '', $('forgeSaveFavBtn')); forgeFavRowSync(); });

/* 11.09.2026 «Лаборатория цвета» (владелец, макет laboratoriya-tsveta-11-09-2026.html, одобрено):
   всплывающий помощник подбора пары «Цвет неба»/«Второй цвет» по одной из 7 именованных схем
   гармонии (.knowledge/COLOR-THEORY.md). Ползунки ptHue1/ptHue2 остаются главным способом —
   лаборатория лишь подставляет в НИХ готовую пару и закрывается, отдельного «применить» нет
   (тот же живой принцип, что у всей остальной вкладки). У схем с 3-4 цветами в реальном
   определении (Триадная/Сплит/Тетрада/Квадрат) — честное упрощение до ОДНОГО партнёра (у неба
   всего 2 цветовых слота, не больше), formula комментарий у каждой схемы ниже называет упрощение
   прямо, не выдаёт его за полную схему. */
/* 15.09.2026 (аудит #2): t/note раньше были литералами на русском, читались один раз при
   создании кнопок (forgeHarmonyInit ниже — IIFE, выполняется единожды при загрузке файла) и
   никогда не обновлялись при смене языка. Теперь массив хранит только структурные данные
   (k/off) и КЛЮЧИ словаря (tKey/noteKey) — сам текст читается из L каждый раз в момент показа
   (forgeHarmonyFillLabels/forgeHarmonySync), тот же приём, что у FORGE_STEP_TITLE(). */
const FORGE_HARMONY=[
  {k:'comp',  tKey:'forgeHarmComp',  off:180, noteKey:'forgeHarmCompNote'},
  {k:'analog',tKey:'forgeHarmAnalog',off:30,  noteKey:'forgeHarmAnalogNote'},
  {k:'triad', tKey:'forgeHarmTriad', off:120, noteKey:'forgeHarmTriadNote'},
  {k:'split', tKey:'forgeHarmSplit', off:150, noteKey:'forgeHarmSplitNote'},
  {k:'tetrad',tKey:'forgeHarmTetrad',off:60,  noteKey:'forgeHarmTetradNote'},
  {k:'square',tKey:'forgeHarmSquare',off:90,  noteKey:'forgeHarmSquareNote'},
  {k:'mono',  tKey:'forgeHarmMono',  off:0,   noteKey:'forgeHarmMonoNote'},
];
function forgeHarmonyFillLabels(){ // подписи кнопки/схем/примечания — свой язык, вызывается из forgeFill()
  const btnLbl=$('forgeHarmonyBtnLbl'); if(btnLbl) btnLbl.textContent=L.forgeHarmonyBtnLbl;
  const row=$('forgeHarmonySchemes');
  if(row) for(const btn of row.children){
    const sc=FORGE_HARMONY.find(function(s){ return s.k===btn.dataset.k; });
    const txt=btn.querySelector('.forgeHarmTxt'); // 17.09.2026: btn.textContent стирал бы иконку рядом — целимся в подпись отдельно
    if(sc && txt) txt.textContent=L[sc.tKey];
  }
  const note=$('forgeHarmonyNote'); const cur=FORGE_HARMONY.find(function(s){ return s.k===forgeHarmonyScheme; });
  if(note && cur) note.textContent=L[cur.noteKey];
}
let forgeHarmonyScheme='comp';
function forgeHarmonyAngle(){ return ((forgeCfg.h1%360)+360)%360; }
function forgeHarmonyTargetH2(){
  const sc=FORGE_HARMONY.find(function(s){ return s.k===forgeHarmonyScheme; })||FORGE_HARMONY[0];
  return Math.round((forgeHarmonyAngle()+sc.off)%360);
}
function forgeHarmonyMarkerPos(deg){ // угол → {left,top} в процентах внутри круга (r=42%, чуть внутри края)
  const rad=(deg-90)*Math.PI/180, r=42;
  return { left:(50+r*Math.cos(rad)).toFixed(1)+'%', top:(50+r*Math.sin(rad)).toFixed(1)+'%' };
}
function forgeHarmonySync(){
  const h1=forgeHarmonyAngle(), h2=forgeHarmonyTargetH2();
  const pa=forgeHarmonyMarkerPos(h1), pb=forgeHarmonyMarkerPos(h2);
  const ma=$('forgeHarmonyMarkA'), mb=$('forgeHarmonyMarkB');
  if(ma){ ma.style.left=pa.left; ma.style.top=pa.top; }
  if(mb){ mb.style.left=pb.left; mb.style.top=pb.top; }
  const holeTxt=$('forgeHarmonyHoleTxt'); if(holeTxt) holeTxt.textContent=h1+'°\n→ '+h2+'°';
  // 16.09.2026: полоска-подделка неба (#forgeHarmonyPreview) убрана — настоящее превью
  // (#forgePreview, forgeSkyPaint) теперь видно одновременно с этим блоком, красится само.
  const note=$('forgeHarmonyNote'); const sc=FORGE_HARMONY.find(function(s){ return s.k===forgeHarmonyScheme; });
  if(note && sc) note.textContent=L[sc.noteKey];
  const row=$('forgeHarmonySchemes');
  if(row) for(let i=0;i<row.children.length;i++) row.children[i].classList.toggle('sel', row.children[i].dataset.k===forgeHarmonyScheme);
}
function forgeHarmonyApply(){
  forgeCfg.h2=forgeHarmonyTargetH2();
  if(typeof ptH2Touched!=='undefined') ptH2Touched=true; // применённая пара уже согласована сама с собой — авто-гармония не должна её тут же переписать
  forgeSyncWidgets();
}
function forgeHarmonySetH1FromEvent(ev){
  const wheel=$('forgeHarmonyWheel'); if(!wheel) return;
  const rect=wheel.getBoundingClientRect();
  const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
  const clientX=(ev.touches&&ev.touches[0])?ev.touches[0].clientX:ev.clientX;
  const clientY=(ev.touches&&ev.touches[0])?ev.touches[0].clientY:ev.clientY;
  const ang=Math.atan2(clientY-cy, clientX-cx)*180/Math.PI+90;
  forgeCfg.h1=Math.round(((ang%360)+360)%360);
  forgeHarmonyApply(); forgeHarmonySync();
}
/* 16.09.2026: спойлер вместо модалки (index.html, .setGrp.spoiler #forgeHarmonyGrp) — та же
   логика открытия/закрытия, что у forgeHardSpoilerGrp (wireOnLocal ниже, js/forge.js:734). */
/* 17.09.2026 (владелец, повторно: «комфорт почти не вижу... подобрать гармонию легло чисто»):
   7 названий («Комплементарная»/«Сплит-комплементарная»/«Тетрада» и т.д.) — термины теории
   цвета, ничего не говорят человеку, который её не изучал (то же самое, что уже отмечало
   исследование RESEARCH-2026-09-KONSTRUKTOR-UX-CHILD-ADULT.md про «иконка без подписи не
   очевидна» — тут наоборот, подпись без иконки). Честная мини-иконка: кольцо с двумя точками
   на настоящем offset схемы (FORGE_HARMONY[].off) — механизм ВСЕГДА даёт ровно 2 цвета, даже
   у «Тетрады»/«Квадрата» (см. комментарий выше про «честное упрощение до ОДНОГО партнёра»),
   рисовать там 3-4 точки было бы враньём про то, что реально произойдёт. Не выдумано на глаз —
   угол читается из тех же чисел, что и считает сам forgeHarmonyTargetH2(). */
function forgeHarmonySchemeIconSVG(offDeg){
  const rad=(offDeg-90)*Math.PI/180; // -90: 0° рисуем как «12 часов», не «3 часа»
  const x=(12+9*Math.cos(rad)).toFixed(1), y=(12+9*Math.sin(rad)).toFixed(1);
  return '<svg class="forgeHarmIco" viewBox="0 0 24 24" aria-hidden="true">'+
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5"/>'+
    '<circle cx="12" cy="3" r="2.6" fill="currentColor"/>'+
    '<circle cx="'+x+'" cy="'+y+'" r="2.6" fill="currentColor" opacity=".55"/></svg>';
}
(function forgeHarmonyInit(){
  const row=$('forgeHarmonySchemes'); if(!row) return;
  FORGE_HARMONY.forEach(function(sc){
    const b=document.createElement('button'); b.type='button'; b.className='forgeChip'; b.dataset.k=sc.k;
    b.innerHTML=forgeHarmonySchemeIconSVG(sc.off)+'<span class="forgeHarmTxt">'+L[sc.tKey]+'</span>';
    b.addEventListener('click', function(){ forgeHarmonyScheme=sc.k; forgeHarmonyApply(); forgeHarmonySync(); sfx.click(); haptic('light'); });
    row.appendChild(b);
  });
  forgeHarmonyFillLabels(); // 15.09.2026: первая расстановка тоже идёт через L, не через мёртвый sc.t
  wireOnLocal('forgeHarmonyGrp','click',function(){
    sfx.click(); haptic('light');
    this.classList.toggle('open');
    const p=$('forgeHarmonyPanel'); if(!p) return;
    const opening=p.classList.contains('hidden');
    p.classList.toggle('hidden');
    if(opening) forgeHarmonySync(); // тот же смысл, что раньше был у forgeHarmonyOpen() — свежие позиции колеса при раскрытии
  });
  const wheel=$('forgeHarmonyWheel');
  if(wheel){
    let dragging=false;
    wheel.addEventListener('pointerdown', function(ev){ dragging=true; forgeHarmonySetH1FromEvent(ev); });
    wheel.addEventListener('pointermove', function(ev){ if(dragging) forgeHarmonySetH1FromEvent(ev); });
    window.addEventListener('pointerup', function(){ dragging=false; });
  }
})();

/* ---------- Deep-link: ?startapp=map_CG2.xxx (и #map= для браузера); CG1 — старые ссылки ---------- */
function forgeBoot(){ // true = есть трасса друга: этот запуск открывается в конструкторе, а не в полёте
  try{
    let raw='';
    const sp=tg&&tg.initDataUnsafe&&tg.initDataUnsafe.start_param;
    if(sp&&String(sp).indexOf('map_')===0) raw=String(sp);
    else if(location.hash&&location.hash.indexOf('#map=')===0) raw='map_'+location.hash.slice(5);
    if(!raw) return false;
    const cfg=forgeDecode(raw);
    if(!cfg) return false;
    forgeCfg=cfg; Store.set('forgeLast',cfg); // «трасса друга» становится последней — «Ещё раз» играет её же
    return true;
  }catch(e){ return false; }
}

/* ---------- Финиш трассы: цифры забега, но ничего не пишется (не в зачёт) ---------- */
function workshopPlayedCodes(){ return saneArray(Store.get('workshopPlayedCodes',[]),[]); } // 12.09.2026: те же коды, что честно долетены — используется, чтобы разрешить голос только после прохождения
function mapOver(sc){
  // 12.09.2026 «Честный запуск»: «сыграли» уходит на сервер и в локальный список честно
  // пройденных ТОЛЬКО если это был код из Мастерской (workshopPlayingCode) и долетел до конца
  // (S.mapWin) — умер по дороге или это своя непубличная трасса — не считается вообще, не
  // только не шлётся на сервер. Список локальный (Store), не новая таблица на сервере —
  // сервер по-прежнему не может независимо доказать прохождение, это честная client-side
  // мера, не полная защита от подмены через devtools.
  if(workshopPlayingCode){
    if(S.mapWin){
      if(typeof workshopPlayed==='function') workshopPlayed(workshopPlayingCode);
      let played=workshopPlayedCodes();
      if(played.indexOf(workshopPlayingCode)<0){
        played.push(workshopPlayingCode);
        // 18.09.2026 (сквозная проверка всей игры на неограниченный рост): тот же приём и тот
        // же потолок, что уже есть у forgeVerified (FORGE_VERIFY_MAX=200) в двух шагах выше —
        // список честно пройденных кодов раньше не подрезался вообще, в отличие от всех
        // остальных подобных списков в этом файле и в sync.js.
        if(played.length>FORGE_VERIFY_MAX) played=played.slice(played.length-FORGE_VERIFY_MAX);
        Store.set('workshopPlayedCodes',played);
      }
    }
    workshopPlayingCode=null;
  }
  ['myRank','toRecord','toLoc'].forEach(function(id){ const el=$(id); if(el) el.textContent=''; });
  ['newRecord','duelRes'].forEach(function(id){ const el=$(id); if(el) el.innerHTML=''; });
  /* v1.282.14: гасим и то, что ставит только gameOver. Своя трасса — не в зачёт, но экран
     итогов у неё общий с обычным забегом, и на нём оставались висеть виджеты предыдущего:
     «✨ В статус» (награда за рекорд — её можно было надеть по итогам незачётного забега),
     «★ Знак дня», статистика дня и мёртвая кнопка трибуны. */
  ['goldChip','dayStats','tribuneBtn','statusBtn'].forEach(function(id){ const el=$(id); if(el) el.classList.add('hidden'); });
  const fsEl=$('finalScore'); if(fsEl) fsEl.textContent=sc;
  const winPill=S.mapWin?'<span class="miniPill">'+ic('trophy')+L.forgeWin+'</span>':'';
  const statsEl=$('stats');
  // 30.08.2026 «Единый паспорт забега»: числа этого забега (миссия/дистанция/звёзды/комбо) теперь
  // строит runPassFill() (#runHead/#runPass) — здесь дублировать их старой сеткой больше не нужно,
  // остаётся только имя трассы + плашка победы.
  // 18.09.2026 (сквозная проверка всей игры на XSS): S.customName — чужие данные (имя трассы
  // из диплинка или Мастерской, см. forgeSanitize/sanitizeTrackName), сейчас безопасно только
  // потому, что опасные символы вырезаются ДО сохранения — здесь экранируем ещё раз, на месте
  // вставки в innerHTML, чтобы не зависеть от того, что апстрим-очистка никогда не даст сбой.
  if(statsEl) statsEl.innerHTML='<div class="bestPills rise" style="animation-delay:200ms"><span class="miniPill">'+ic('plane')+escapeHtml(S.customName||L.forgeDefName)+'</span>'+winPill+'</div>';
  runPassFill();
  if (typeof cardCapture==='function') cardCapture(sc,{win:!!S.mapWin}); // v1.73.0: карточка и для своей трассы — с именем автора
  const cardBtnEl2=$('cardBtn'); if(cardBtnEl2) cardBtnEl2.classList.remove('hidden'); // v1.282.10: та же кнопка, тот же возврат видимости после настоящего забега
  tryOnRevert(); music.sting(S.mapWin?'record':'death'); music.stop(2); engine.stop();
  ['stats','runPass','runHead'].forEach(function(id){ const el=$(id); if(el) el.classList.add('hidden'); });
  /* 06.09.2026, живая находка (очередь 05.09 п.1 — «подробности полёта пустые»): эта функция
     прятала цифры внутри спойлера, но не сам контейнер #overMore — если игрок держал спойлер
     открытым во время забега, после финиша он оставался открытым и пустым. gameOver() рядом
     всегда гасит #overMore explicitly — здесь это тоже нужно, тем же приёмом. */
  toggleCls('overMore','hidden',true);
  const odbEl=$('overDetailsBtn'); if(odbEl) odbEl.classList.remove('open');
  // 12.09.2026: тот же оффер «Полёт без рук», что и в gameOver() (ui.js) — своя/чужая трасса
  // из Конструктора тоже честно «первый полёт», если это он и есть.
  if (typeof gyroOverOfferDue==='function' && gyroOverOfferDue()) gyroOverOfferShow();
  setScreen('over');
  const f=$('flash');
  if(f){ f.style.transition='none'; f.style.opacity=.7;
    requestAnimationFrame(function(){ f.style.transition='opacity .5s'; f.style.opacity=0; }); }
}

/* 04.09.2026 (владелец): выбрал готовый сценарий — вернуться к пустой трассе было нечем.
   06.09.2026 (владелец, живая находка): раньше сюда клали клон FORGE_PRESETS[0] («Разминка») —
   технически «сброс», но подсветка пресета в сетке честно показывала «Разминка» выбрана,
   хотя игрок ничего не выбирал — путало. forgeSanitize({}) даёт настоящее пустое поле — те же
   умолчания, что уже проверяет сама валидация (не новые числа). (Сама сетка-витрина и
   forgePresetMatch() убраны позже, в «Переосмыслении» того же дня — обоснование выше больше
   не про подсветку тайла, но forgeSanitize({}) остаётся правильным сбросом сам по себе.) */
function forgeResetAll(){
  // 16.09.2026 «Дальше» (диагноз §7, макет konstruktor-sozdat-redizayn-16-09-2026.html): «Сбросить
  // всё» уже требует второго нажатия подряд (forgeResetBtn, forge.js), но ДО сегодня само стирание
  // было безвозвратным. Снимок всего forgeCfg (простые данные — числа/строки/массив точек, JSON
  // безопасен) даёт ptUndoBtn (index.html) настоящий откат, тем же ptSetUndo/ptClearUndo, что уже
  // у add/remove/drag точки (js/partitura.js).
  const before=JSON.parse(JSON.stringify(forgeCfg));
  forgeCfg=forgeSanitize({});
  forgeSyncWidgets(); Store.set('forgeLast',forgeCfg);
  toast(L.forgeReset||'Сброшено','rgba(160,210,255,.5)'); haptic('light');
  // 17.09.2026 «Дальше — история»: «Сбросить всё» — граница. Отменённые точечные правки ДО
  // сброса ссылались бы на объекты старого forgeCfg (этот — новый, forgeSanitize({}) выше) и
  // после отмены сброса тихо стали бы no-op — чистим стек перед тем, как класть сюда единственно
  // осмысленный шаг назад (вернуть весь снимок), не складываем его поверх устаревших записей.
  if(typeof ptSetUndo==='function'){
    if(typeof ptClearUndo==='function') ptClearUndo();
    ptSetUndo(function(){ forgeCfg=before; forgeSyncWidgets(); Store.set('forgeLast',forgeCfg); });
  }
}

/* ---------- 05.09.2026 «Мастерская»: экран-витрина — подписи, сортировка, список ---------- */
let workshopSortMode='new';
// 08.09.2026 (владелец, живой скрин): «Мои» убрано из верхнего ряда — фильтр только своих
// небес нужен исключительно авторам, а занимал место у всех подряд (переезжает во вкладку
// «Создать», отдельной задачей). На его место — «Случайные» (sort='random', см. правку
// cosmogram-workshop Edge Function того же дня) — значок перемешивания вместо слова
// («Закреплённые» было слишком длинным и большим словом, владелец). workshopSortMode/сама
// логика 'mine' в workshopRenderList() ниже не тронуты — понадобятся будущей кнопке в «Создать».
// «Избранное» тоже не отдельная вкладка — тап по уже выбранной «Лайки» ещё раз переключает
// workshopLikedOnly, подпись меняется на «Твои», список сужается до лайкнутых тобой же.
// 12.09.2026, владелец (живой макет): «выбор автора» звучало, будто остальные небеса хуже —
// заменено на простую золотую звезду без текста, как отдельный знак отличия, не категория.
// Реально работающий механизм (тот же масштаб, что PICO-8/оригинальный LittleBigPlanet «Team
// Picks» — один человек время от времени отмечает то, что понравилось, см. .knowledge/
// RESEARCH-2026-09-WORKSHOP-DISCOVERY.md, группа E): раньше был статический список кодов
// прямо в этом файле, владелец не мог пометить трек сам без правки кода — 12.09.2026 (второй
// заход) перенесено на сервер (forge_workshop.featured, действие moderate), звезда теперь
// настоящая кнопка в самой карточке, видимая владельцу всегда, остальным — только на
// реально помеченных треках.
const WORKSHOP_SORTS=['new','top','trending','fav','random','mine']; // 13.09.2026: «Сюрприз» вернулся в общий ряд пятым чипом (владелец, прямая правка) — был вынесен 12.09.2026 отдельной кнопкой из-за подписи, которая не влезала; теперь идёт значком без подписи, тем же приёмом, что уже есть у 'fav' ниже — вернулось меньше места, чем занимала отдельная кнопка снаружи ряда. «Плюс» — sort, реально отправляемый на сервер для чипа 'fav' — тот же 'top', просто с workshopLikedOnly=true, см. клик ниже
// 19.09.2026 «Мои небеса» (владелец, макет konstruktor-sozdat-svoe-nebo-19-09-2026.html, явное
// «да»): 6-й чип — ставит workshopSortMode='mine', та ветка уже существовала в
// workshopRenderList() (12.09.2026, ждала именно этой кнопки), просто нажимать было негде.
let workshopLikedOnly=false;

/* ---------- 20.09.2026, фильтр Мастерской ---------- */
// Три измерения сразу (владелец: «делай сразу всё», не по частям):
// 1) длина — двуручный ползунок по реальным границам forgeSanitize (1000-25000, шаг 250, 0=бесконечная)
// 2) сложность — НЕ сырое поле «Жизни» (владелец сам поймал: 1-2-3 «Жизни» ≠ «сложность», и
//    направление обратное — меньше жизней ЖЁСТЧЕ, не проще); составная формула ниже, веса и
//    границы взяты из реальной механики (js/game.js) и проверены численно на всех 8 официальных
//    пресетах ДО того, как попасть в код (не с ходу вписаны).
// 3) препятствия — те же 8 видов/цветов, что уже на карточке трассы (js/partitura.js), тап — исключить.
const WORKSHOP_FILTER_LEN_MIN=1000, WORKSHOP_FILTER_LEN_MAX=25000, WORKSHOP_FILTER_LEN_STEP=250;
// 20.09.2026 (владелец, живой разговор): «∞»-деление убрано — обоснование («старые уже
// разосланные коды друзей с бесконечной трассой») было выдумано, не проверено; живая проверка
// в тот же вечер (Supabase, public.forge_workshop) — 0 строк, ни одной опубликованной трассы
// вообще, владелец подтвердил, что и по прямой ссылке другу ни разу подтверждённо не сработало.
// WORKSHOP_FILTER_LEN_INF остаётся именем константы (её ждёт страж 323 и остальной код как
// «сентинел полного диапазона»), но теперь РАВНА настоящему потолку — деления «правее максимума»
// больше нет, слайдер физически кончается на 25000, как и потолок создания трассы (ptLenSlider).
const WORKSHOP_FILTER_LEN_INF=WORKSHOP_FILTER_LEN_MAX;

// Вес «опасности» вида препятствия — из реальной механики game.js, не придумано: ловец наводится
// вдвое сильнее мины (комментарий в game.js прямым текстом), ворота — точный «дышащий» просвет
// (тоже прямой комментарий); rock/debris — простейшая прямая угроза без наведения.
const WORKSHOP_DIFF_KIND_WEIGHT={rock:.15,debris:.15,drift:.25,mine:.35,sat:.25,comet:.4,seeker:.7,gate:.6};
const WORKSHOP_DIFF_KIND_SUM=FORGE_KINDS.reduce(function(s,k){ return s+WORKSHOP_DIFF_KIND_WEIGHT[k]; },0);
// Границы 1/3 и 2/3 ТЕОРЕТИЧЕСКОГО размаха формулы (не размаха 8 официальных пресетов — владелец
// прямо: «пресеты мы наделали от балды, чтобы просто были для начала», настоящий потолок сложности
// открыт только тому, кто выкрутит вообще всё на максимум). Проверено численно на всех 8 пресетах
// перед тем, как эти границы попали в код — ни один пресет не доходит до «Сложно», это ожидаемо
// и подтверждено владельцем («надо исходить от максимума, а не от того, что мы там наделали»).
const WORKSHOP_DIFF_RAW_MIN=(WORKSHOP_DIFF_KIND_WEIGHT.rock/WORKSHOP_DIFF_KIND_SUM)-0.8-0.8;
const WORKSHOP_DIFF_RAW_MAX=1+1+1+1+0.5;
const WORKSHOP_DIFF_T1=WORKSHOP_DIFF_RAW_MIN+(WORKSHOP_DIFF_RAW_MAX-WORKSHOP_DIFF_RAW_MIN)/3;
const WORKSHOP_DIFF_T2=WORKSHOP_DIFF_RAW_MIN+(WORKSHOP_DIFF_RAW_MAX-WORKSHOP_DIFF_RAW_MIN)*2/3;
function forgeDifficultyScore(cfg){
  const density=cfg.d/100, speed=cfg.s/100, wave=(cfg.w-1)/5, wind=(cfg.wind||0)/100;
  let kindSum=0;
  FORGE_KINDS.forEach(function(k,i){ if(cfg.e>>i&1) kindSum+=WORKSHOP_DIFF_KIND_WEIGHT[k]; });
  const kind=kindSum/WORKSHOP_DIFF_KIND_SUM;
  const bonusRelief=cfg.b/3, livesRelief=(cfg.lv-1)/2;
  return density+speed+wave+kind+0.5*wind-0.8*bonusRelief-0.8*livesRelief;
}
function forgeDifficultyBucket(cfg){ // 1=Просто, 2=Средне, 3=Сложно
  const s=forgeDifficultyScore(cfg);
  return s<WORKSHOP_DIFF_T1 ? 1 : (s<WORKSHOP_DIFF_T2 ? 2 : 3);
}
/* 20.09.2026 «Сложность неба» на шаге «Карта» (владелец, живой инжект-макет, «Да» на «Планета
   с кольцом»): та же формула/пороги, что уже проверены у фильтра Мастерской выше — не вторая
   отдельная система оценки. Кольцо — дуга через stroke-dasharray, окружность r=13 (см. index.html
   #forgeDiffRingArc), fraction=bucket/3 (1/3, 2/3, 3/3 заполнения). Цвета — реальные токены игры
   (--ok/--gold-hi/--danger), не новые. Вызывается из forgeSyncWidgets() (общая точка конфиг→
   виджеты) и напрямую из 'input' ползунков Плотность/Скорость/Солнечный ветер (те трое, в отличие
   от Жизней/Волны/Бонусов/Преград, не проходят через forgeSyncWidgets на каждое движение —
   см. их wireOnLocal ниже). */
const FORGE_DIFF_R=13, FORGE_DIFF_C=2*Math.PI*FORGE_DIFF_R;
const FORGE_DIFF_COLOR={1:'var(--ok)',2:'var(--gold-hi)',3:'var(--danger)'};
function forgeUpdateDiffMeter(){
  const arc=$('forgeDiffRingArc'), val=$('forgeDiffMeterVal'); if(!arc||!val) return;
  const bucket=forgeDifficultyBucket(forgeCfg);
  const color=FORGE_DIFF_COLOR[bucket];
  const label=bucket===1?L.workshopFilterDiffEasy:(bucket===2?L.workshopFilterDiffMed:L.workshopFilterDiffHard);
  const dash=FORGE_DIFF_C*(bucket/3);
  arc.style.stroke=color;
  arc.style.strokeDasharray=dash+' '+(FORGE_DIFF_C-dash);
  val.textContent=label; val.style.color=color;
}

let workshopFilterOpen=false;
let workshopFilterLenFrom=WORKSHOP_FILTER_LEN_MIN, workshopFilterLenTo=WORKSHOP_FILTER_LEN_INF; // по умолчанию — весь диапазон, фильтр неактивен
let workshopFilterDiff=0; // 0=любая, 1/2/3=бакет
const workshopFilterExcludedKinds=new Set(); // индексы FORGE_KINDS, исключённые игроком

function workshopFilterActiveCount(){
  let n=0;
  if(workshopFilterLenFrom>WORKSHOP_FILTER_LEN_MIN || workshopFilterLenTo<WORKSHOP_FILTER_LEN_INF) n++;
  if(workshopFilterDiff) n++;
  if(workshopFilterExcludedKinds.size) n++;
  return n;
}
function workshopFilterMatches(t){
  const cfg=forgeDecode(t.code);
  if(!cfg) return true; // код не читается — тот же fail-open приём, что у стикеров препятствий ниже (workshopRenderList)
  if(workshopFilterLenFrom>WORKSHOP_FILTER_LEN_MIN || workshopFilterLenTo<WORKSHOP_FILTER_LEN_INF){
    const l = cfg.l===0 ? Infinity : cfg.l;
    const from = workshopFilterLenFrom, to = workshopFilterLenTo>=WORKSHOP_FILTER_LEN_INF ? Infinity : workshopFilterLenTo;
    if(l<from || l>to) return false;
  }
  if(workshopFilterDiff && forgeDifficultyBucket(cfg)!==workshopFilterDiff) return false;
  if(workshopFilterExcludedKinds.size){
    for(const idx of workshopFilterExcludedKinds){ if(cfg.e>>idx&1) return false; }
  }
  return true;
}
function workshopFilterLenLabel(v){ return v+' '+(L.unitM||'м'); } // 20.09.2026: «∞»-деление убрано, см. комментарий у WORKSHOP_FILTER_LEN_INF выше; страж 71 — единица только из словаря, не литералом
function workshopFilterUpdateSliderUI(){
  const min=$('workshopFilterLenMin'), max=$('workshopFilterLenMax');
  if(!min||!max) return;
  min.value=workshopFilterLenFrom; max.value=workshopFilterLenTo;
  const pct=v=>(v-WORKSHOP_FILTER_LEN_MIN)/(WORKSHOP_FILTER_LEN_INF-WORKSHOP_FILTER_LEN_MIN)*100;
  const fill=$('workshopFilterLenFill');
  if(fill){ fill.style.left=pct(workshopFilterLenFrom)+'%'; fill.style.right=(100-pct(workshopFilterLenTo))+'%'; }
  const fromEl=$('workshopFilterLenFrom'), toEl=$('workshopFilterLenTo');
  if(fromEl) fromEl.textContent=workshopFilterLenFrom+' '+(L.unitM||'м'); // страж 71 — единица только из словаря
  if(toEl) toEl.textContent=workshopFilterLenLabel(workshopFilterLenTo);
}
function workshopFilterUpdateBadge(){
  const badge=$('workshopFilterBadge'), btn=$('workshopFilterBtn');
  const n=workshopFilterActiveCount();
  if(badge){ badge.textContent=n; badge.classList.toggle('hidden', !n); }
  if(btn) btn.classList.toggle('sel', !!n);
}
function workshopFilterBuildDiffChips(){
  const row=$('workshopFilterDiff'); if(!row || row.children.length) return;
  const opts=[[0,'workshopFilterDiffAny'],[1,'workshopFilterDiffEasy'],[2,'workshopFilterDiffMed'],[3,'workshopFilterDiffHard']];
  opts.forEach(function(opt){
    const b=document.createElement('button'); b.type='button'; b.className='wFilterChip'; b.dataset.diff=opt[0];
    b.addEventListener('click', function(){
      workshopFilterDiff = workshopFilterDiff===opt[0] ? 0 : opt[0];
      workshopFilterFillPanel(); workshopFilterUpdateBadge(); workshopRenderList(); sfx.click(); haptic('light');
    });
    row.appendChild(b);
  });
}
function workshopFilterBuildObChips(){
  const row=$('workshopFilterOb'); if(!row || row.children.length) return;
  FORGE_KINDS.forEach(function(k,idx){
    const b=document.createElement('button'); b.type='button'; b.className='wFilterObChip'; b.dataset.kind=idx;
    b.title=L['fk'+k.charAt(0).toUpperCase()+k.slice(1)]||k;
    b.innerHTML='<span class="ic" style="color:'+(typeof PT_KIND_COLOR!=='undefined'?PT_KIND_COLOR[k]:'#fff')+'">'+(typeof PT_ICON_SVG!=='undefined'?PT_ICON_SVG[k]:'')+'</span>';
    b.addEventListener('click', function(){
      if(workshopFilterExcludedKinds.has(idx)) workshopFilterExcludedKinds.delete(idx); else workshopFilterExcludedKinds.add(idx);
      workshopFilterFillPanel(); workshopFilterUpdateBadge(); workshopRenderList(); sfx.click(); haptic('light');
    });
    row.appendChild(b);
  });
}
function workshopFilterFillPanel(){
  if(typeof L==='undefined'||!L.workshopFilterBtn) return;
  const lenLbl=$('workshopFilterLenLbl'); if(lenLbl) lenLbl.textContent=L.forgeLen;
  const diffLbl=$('workshopFilterDiffLbl'); if(diffLbl) diffLbl.textContent=L.forgeGrpHard;
  const obLbl=$('workshopFilterObLbl'); if(obLbl) obLbl.textContent=L.forgeEn;
  const resetBtn=$('workshopFilterReset'); if(resetBtn) resetBtn.textContent=L.forgeResetBtn;
  workshopFilterBuildDiffChips();
  workshopFilterBuildObChips();
  Array.from($('workshopFilterDiff').children).forEach(function(c){ c.textContent=L['workshopFilterDiff'+(['Any','Easy','Med','Hard'][+c.dataset.diff])]; c.classList.toggle('sel', +c.dataset.diff===workshopFilterDiff); });
  Array.from($('workshopFilterOb').children).forEach(function(c){ c.classList.toggle('off', workshopFilterExcludedKinds.has(+c.dataset.kind)); });
  workshopFilterUpdateSliderUI();
  workshopFilterUpdateBadge();
}
function workshopFilterReset(){
  workshopFilterLenFrom=WORKSHOP_FILTER_LEN_MIN; workshopFilterLenTo=WORKSHOP_FILTER_LEN_INF;
  workshopFilterDiff=0; workshopFilterExcludedKinds.clear();
  workshopFilterFillPanel(); workshopRenderList();
}
function workshopFilterWireOnce(){
  const btn=$('workshopFilterBtn'); if(!btn || btn.dataset.wired) return;
  btn.dataset.wired='1';
  btn.addEventListener('click', function(){
    workshopFilterOpen=!workshopFilterOpen;
    $('workshopFilterPanel').classList.toggle('hidden', !workshopFilterOpen);
    if(workshopFilterOpen) workshopFilterFillPanel();
    sfx.click(); haptic('light');
  });
  const minEl=$('workshopFilterLenMin'), maxEl=$('workshopFilterLenMax');
  function onSlide(){
    let from=+minEl.value, to=+maxEl.value;
    if(from>to){ if(this===minEl){ to=from; maxEl.value=to; } else { from=to; minEl.value=from; } }
    workshopFilterLenFrom=from; workshopFilterLenTo=to;
    workshopFilterUpdateSliderUI(); workshopFilterUpdateBadge();
  }
  if(minEl) minEl.addEventListener('input', onSlide);
  if(maxEl) maxEl.addEventListener('input', onSlide);
  // 20.09.2026: применяется вживую по мере движения ползунка (input), но сам ререндер списка —
  // только по отпусканию (change), чтобы не гонять запрос на каждый промежуточный пиксель драга.
  function onSlideDone(){ workshopRenderList(); sfx.click(); haptic('light'); }
  if(minEl) minEl.addEventListener('change', onSlideDone);
  if(maxEl) maxEl.addEventListener('change', onSlideDone);
  const resetBtn=$('workshopFilterReset'); if(resetBtn) resetBtn.addEventListener('click', function(){ workshopFilterReset(); sfx.click(); haptic('light'); });
}

function workshopFillLabels(){ // тот же приём, что forgeFill() выше — вызывается из applyLang (ui.js)
  if(typeof L==='undefined'||!L.workshopEmpty) return;
  const LBL=[['workshopEmpty',L.workshopEmpty]]; // 06.09.2026: forgeWorkshopBtn убран вместе с отдельным экраном — Галерея теперь вкладка «Играть»; 08.09.2026: workshopSub убран целиком (см. i18n.js); заголовок workshopTitle убран целиком следом (лишняя надпись без функции)
  for(const pair of LBL){ const el=$(pair[0]); if(el) el.textContent=pair[1]; }
  const sortEl=$('workshopSort');
  if(sortEl && sortEl.children.length!==WORKSHOP_SORTS.length){
    sortEl.innerHTML='';
    WORKSHOP_SORTS.forEach(function(s){
      const b=document.createElement('button'); b.className='forgeChip'; b.dataset.sort=s;
      // 12.09.2026, владелец (живой скрин с телефона, после разъяснения — «тогда да, лайк»):
      // «Избранное» заменено на то же сердце, что уже стоит на каждой карточке (.wVote) —
      // единственный значок в этом ряду без слова, потому что смысл уже знаком игроку с этого
      // же экрана, не выдуман заново.
      // 13.09.2026, владелец (живой скрин, «лайк не закрашен»): значок рисовался fill="currentColor",
      // но currentColor наследовал общий серый/белый цвет чипа (.forgeChip/.forgeChip.sel) — сердце
      // технически было залито, просто не тем цветом, который в игре УЖЕ значит «лайк» (.wVote.voted,
      // #ff9fb0). Свой цвет через инлайновый style — не зависит от .sel, всегда узнаваемо розовое.
      if(s==='new'){
        // 18.09.2026 (макет konstruktor-znachki-filtrov-18-09-2026.html, владелец «Делай»):
        // «Новые»/«Вау»/«Растёт» были единственными тремя чипами со словом в этом ряду —
        // слово не влезало вместе с остальными icon-only соседями (♥/🎲) без переноса на
        // телефоне (живой скрин).
        // 19.09.2026 (владелец, живой скрин: «цвет не появился»): голый атрибут stroke="#.."
        // перебивался общим .forgeChip .ic{stroke:currentColor} — тот же класс ошибки, что
        // уже поймали 13.09.2026 у ♥ (см. её комментарий ниже). currentColor+inline style —
        // тот же рабочий приём, не выдумано заново.
        // 19.09.2026, восьмым заходом (владелец, макет konstruktor-sozdat-svoe-nebo-19-09-2026.html,
        // явное «да»): колокольчик «слишком заметный, привлекает внимание» — заменён на росток
        // (два листка на стебле, владелец сам предложил «фреш/свежее», уточнено до ростка,
        // не одиночного листа, чтобы не читалось как «эко» само по себе). Цвет — зелёный
        // (#5ec95e), тот же, что раньше был у «Растёт» — тот в это же время забрал синий,
        // раньше стоявший здесь (см. её комментарий ниже) — цвета просто поменялись местами,
        // новый не придуман.
        b.classList.add('iconOnly');
        // 20.09.2026, владелец, измерено (canvas ink-bbox, не на глаз): росток занимал всего
        // 57×55% площади против 65-85% у соседей — реально мельче, не показалось. scale(1.21)
        // подгоняет под то же среднее покрытие (~68%), что у уже нормальных значков (♥/➕).
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" style="transform:scale(1.21)"><path d="M12 20 V12.5" stroke="#5ec95e" stroke-width="1.7" stroke-linecap="round" fill="none"></path><ellipse cx="8.7" cy="10.3" rx="3.8" ry="2.1" transform="rotate(-32 8.7 10.3)" fill="#5ec95e"></ellipse><ellipse cx="15.3" cy="10.3" rx="3.8" ry="2.1" transform="rotate(32 15.3 10.3)" fill="#5ec95e"></ellipse></svg>';
      } else if(s==='top'){
        // «Искра» — владелец выбрал эту форму для «Вау», золотая (решил не перекрашивать в
        // розовый — не путать с ♥ рядом, два золотых значка отличаются формой, не цветом).
        // 19.09.2026: та же правка currentColor, что у «new» выше — голый fill="#.." тоже
        // перебивался общим .ic{fill:none}.
        b.classList.add('iconOnly');
        // 20.09.2026, владелец, измерено: искра занимала 79×87% площади против 65-85% у
        // соседей — заметно крупнее (особенно по высоте). scale(.82) подгоняет под среднее ~68%.
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="currentColor" style="color:#ffd76a;transform:scale(.82)" stroke="none"><path d="M12 2.5c.4 3.2 1 4.8 2.2 6C15.4 9.7 17 10.3 20.2 10.7c-3.2.4-4.8 1-6 2.2-1.2 1.2-1.8 2.8-2.2 6-.4-3.2-1-4.8-2.2-6C8.6 11.7 7 11.1 3.8 10.7 7 10.3 8.6 9.7 9.8 8.5 11 7.3 11.6 5.7 12 2.5z"></path><path d="M19 15.5c.2 1.6.5 2.4 1.1 3 .6.6 1.4.9 3 1.1-1.6.2-2.4.5-3 1.1-.6.6-.9 1.4-1.1 3-.2-1.6-.5-2.4-1.1-3-.6-.6-1.4-.9-3-1.1 1.6-.2 2.4-.5 3-1.1.6-.6.9-1.4 1.1-3z"></path></svg>';
      } else if(s==='trending'){
        // Стрелка роста — узнаваема без слова, решено раньше остальных двух в том же макете.
        // 19.09.2026: та же правка currentColor, что у «new»/«top» выше.
        // 19.09.2026, восьмым заходом (владелец): цвет отдан ростку (см. «new» выше) — забрала
        // взамен свободный синий (#6cc3ff, раньше был у колокольчика). Направление стрелки
        // (вправо-вверх) НЕ менялось — пробовал развернуть влево по просьбе, владелец тут же
        // поправил «визуально не то», вернул как было.
        b.classList.add('iconOnly');
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#6cc3ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"></polyline><polyline points="15 6 21 6 21 12"></polyline></svg>';
      } else if(s==='mine'){
        // 19.09.2026 «Мои небеса» (владелец, макет konstruktor-sozdat-svoe-nebo-19-09-2026.html,
        // явное «да»): плюсик — владелец сам выбрал эту форму («вот здесь плюсик будет
        // идеально»), после того как забраковал придуманный «планета+звезда». Коралловый —
        // не занят соседями в этом ряду. Размер — измерен getBoundingClientRect() против
        // остальных пяти значков (владелец: «плюсик уже больше, чем всё остальное»), не на глаз.
        b.classList.add('iconOnly');
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:#ff8a5c" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>';
      } else if(s==='fav'){
        b.classList.add('iconOnly');
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="currentColor" style="color:#ff9fb0"><path d="M12 20.2c-.3 0-.6-.1-.8-.3C7.6 16.8 4 13.6 4 9.9 4 7.2 6.1 5 8.7 5c1.4 0 2.7.6 3.3 1.7C12.6 5.6 13.9 5 15.3 5 17.9 5 20 7.2 20 9.9c0 3.7-3.6 6.9-7.2 10-.2.2-.5.3-.8.3z"></path></svg>';
      } else if(s==='random'){
        b.classList.add('iconOnly');
        // 17.09.2026 (владелец, референс с кубиками): свой символ (#i-dice), не общий с
        // «Перемешать» (.pvBtn) — владелец прямо поправил: не делать их одинаковыми, это
        // разные действия (сюрприз ≠ перемешать), вывод не изменился и 19.09.2026.
        // 17.09.2026, тем же вечером (владелец, живой скрин: «на фоне сердечка невзрачно,
        // нужен цвет»): свой цвет через inline style — тот же приём, что уже у сердца
        // (#ff9fb0) чуть выше, не завязан на .sel. Сиреневый — не занят соседями в этом же
        // ряду (розовый лайк, золотая звезда карточек), «космический» тон, не случайный.
        // 20.09.2026, владелец, измерено: кубик занимал всего 45×45% площади — самый мелкий
        // из всех семи значков ряда (почти вдвое меньше «Вау»). 20.09.2026, владелец, живой
        // скрин: 1.51 оказался перебором — «сюрприз теперь самый огромный». Сплошная квадратная
        // рамка кубика «весит» на глаз больше, чем тонкий контур сердца/плюса при том же %
        // площади bbox — метрика площади не учитывала форму. Сбавлено до 1.15, проверено
        // крупным кропом рядом с соседями (не общим беглым скриншотом, как в первый раз).
        b.innerHTML='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:#b39dff;transform:scale(1.15)"><use href="#i-dice"></use></svg>';
      }
      b.addEventListener('click', function(){
        if(s==='fav'){ workshopSortMode='top'; workshopLikedOnly=true; } // 12.09.2026: было спрятано за повторным тапом по «Лайки» — теперь настоящий отдельный чип, один тап
        else { workshopSortMode=s; workshopLikedOnly=false; }
        workshopFillLabels(); workshopRenderList(); sfx.click(); haptic('light');
      }); // 07.09.2026: было без workshopFillLabels() — режим менялся честно, но подсветка .sel навсегда оставалась на «Новые» (владелец, живой скрин)
      sortEl.appendChild(b);
    });
  }
  if(sortEl) WORKSHOP_SORTS.forEach(function(s,i){
    const chip=sortEl.children[i];
    // 18.09.2026: все 5 чипов ряда стали icon-only (было только у 'fav'/'random') — слово
    // нигде не выводится текстом, title остаётся везде для подсказки при наведении/скринридера
    chip.title = L['workshopSort_'+s] || s;
    // 'fav' и 'top' оба реально шлют sort='top' на сервер — различает их только workshopLikedOnly,
    // поэтому подсветка каждого чипа явно проверяет этот флаг, не только совпадение sort-строки.
    const sel = s==='fav' ? (workshopSortMode==='top' && workshopLikedOnly) : (s===workshopSortMode && !(s==='top' && workshopLikedOnly));
    chip.classList.toggle('sel', sel);
  });
  const filterBtn=$('workshopFilterBtn');
  if(filterBtn){ filterBtn.title=L.workshopFilterBtn; workshopFilterWireOnce(); workshopFilterUpdateBadge(); if(workshopFilterOpen) workshopFilterFillPanel(); }
}
function workshopMyVotes(){ return saneArray(Store.get('workshopMyVotes',[]),[]); }
function workshopRenderList(){
  const listEl=$('workshopList'), emptyEl=$('workshopEmpty');
  if(!listEl) return;
  const likedOnly = workshopSortMode==='top' && workshopLikedOnly; // 08.09.2026: «Твои» — тот же 'top', отфильтрованный клиентом по своим лайкам, не отдельный сорт на сервере
  if((workshopSortMode==='mine' || likedOnly) && !syncAvailable()){
    listEl.innerHTML=''; if(emptyEl){ emptyEl.classList.remove('hidden'); emptyEl.textContent=L.workshopSignInFirst||L.workshopEmpty; }
    return;
  }
  listEl.innerHTML='<div class="hint" style="text-align:center">…</div>';
  const requestedSort=workshopSortMode; // 05.09.2026: защита от гонки — быстрый тап по двум чипам подряд не должен дать ответу первого перезаписать второй
  workshopList(requestedSort).then(function(res){
    if(requestedSort!==workshopSortMode) return; // пока летал запрос, игрок уже переключил сортировку — этот ответ больше не актуален
    // 15.09.2026 (аудит #7): workshopList() возвращает null и при обрыве сети, и при провале
    // ответа сервера — раньше это тихо схлопывалось в tracks=[] и показывало ТУ ЖЕ фразу «пока
    // пусто», что и честная пустая категория. Игрок с реальным обрывом сети видел «поделись
    // своим небом, и оно появится здесь» — совет, который ничего не чинит, потому что причина
    // была не в отсутствии треков. offline — именно `res===null` (сеть/сервер), не пустой массив.
    const offline = !res;
    let tracks=(res && res.ok && Array.isArray(res.tracks)) ? res.tracks : [];
    const mine=workshopMyVotes();
    if(likedOnly) tracks=tracks.filter(function(t){ return mine.indexOf(t.code)>=0; }); // «Твои» — сужаем уже полученный топ по лайкам, без отдельного запроса на сервер
    // 20.09.2026, фильтр Мастерской: тем же приёмом, что и likedOnly выше — сужаем уже
    // полученный список клиентом (forgeDecode того же кода, что дальше и так декодируется
    // для стикеров/миниатюры ниже), без отдельного запроса на сервер. Нет длины/сложности/
    // препятствий в самом трек-объекте с сервера — только в его коде.
    if(workshopFilterActiveCount()) tracks=tracks.filter(workshopFilterMatches);
    // 16.09.2026 (владелец: «Разминка сделай первым, в списке она стала самой последней. Люди
    // должны с неё начинать, пусть хотя бы раз в неё сыграют, и потом она уже может
    // путешествовать по списку куда угодно»): живой запрос к forge_workshop (Supabase) нашёл
    // настоящую причину — у 7 из 8 пресетов Cosmogram status='pinned' (сервер честно держит
    // их первыми, cosmogram-workshop/index.ts), а у «Разминки» status незаметно стал 'normal' —
    // рядовая старая трасса тонет под новыми в сортировке «Новые». Основной фикс — восстановлен
    // status='pinned' в БД (та же строка). Здесь — дополнительно: пока ЭТОТ игрок ни разу честно
    // не долетел её (workshopPlayedCodes(), тот же список, что отпирает голос) — гарантированно
    // первая в любой сортировке на клиенте, не полагаясь на то, что «pinned» всегда буквально
    // означает «первая из первых» (внутри pinned-группы порядок — по дате создания, у Разминки
    // не самая ранняя). WARM_CODE — код из живой БД (не forgeEncode(FORGE_PRESETS[0].c) —
    // проверено: он с ним УЖЕ разошёлся, формат бит-пака с 06.09.2026 успел поменяться).
    if(workshopPlayedCodes().indexOf(WARM_CODE)<0){
      const wi=tracks.findIndex(function(t){ return t.code===WARM_CODE; });
      if(wi>0) tracks.unshift(tracks.splice(wi,1)[0]);
    }
    if(!tracks.length){
      listEl.innerHTML='';
      if(emptyEl){
        emptyEl.classList.remove('hidden');
        if(offline){
          emptyEl.textContent=L.syncOffline||'Нет соединения — попробуй позже';
        } else if(likedOnly){
          // 12.09.2026, владелец, живой тест руками: пустое «Избранное» было тупиком — фраза
          // без действия, непонятно, что делать дальше. Настоящая кнопка вместо тупика.
          emptyEl.innerHTML=(L.workshopEmptyFav||'пока пусто — сохрани понравившееся небо, и оно появится здесь')+
            '<br><button class="btn ghost" id="workshopFavEmptyCTA" style="margin-top:10px">'+(L.workshopFavEmptyCTA||'Смотреть Топ')+'</button>';
          const cta=$('workshopFavEmptyCTA');
          if(cta) cta.addEventListener('click', function(){
            workshopSortMode='top'; workshopLikedOnly=false;
            workshopFillLabels(); workshopRenderList(); sfx.click(); haptic('light');
          });
        } else if(workshopSortMode==='mine'){
          // 19.09.2026 «Создай своё первое небо» (владелец, макет
          // konstruktor-sozdat-svoe-nebo-19-09-2026.html, явное «да»): та же дверь, что уже
          // была у пустого «Избранное» выше (реальная кнопка вместо тупика), только ведёт на
          // вкладку «Создать» — тот же forgeTabSet('create'), что у кнопки вверху экрана.
          emptyEl.innerHTML=(L.workshopEmptyMine||'у тебя ещё нет своих небес')+
            '<br><button class="btn ghost" id="workshopMineEmptyCTA" style="margin-top:10px">'+(L.workshopMineEmptyCTA||'Создать')+'</button>';
          const mineCta=$('workshopMineEmptyCTA');
          if(mineCta) mineCta.addEventListener('click', function(){
            sfx.click(); haptic('light'); forgeTabSet('create');
          });
        } else if(L.workshopEmpty) emptyEl.textContent=L.workshopEmpty;
      }
      return;
    }
    if(emptyEl) emptyEl.classList.add('hidden');
    // 05.09.2026: isOwner решает сервер (настоящий Telegram id, не клиентский флаг) — здесь только
    // рендерим или не рендерим кнопки закрепить/скрыть по его ответу.
    const isOwner = !!(res && res.isOwner);
    const myId = (typeof syncMyId==='function') ? syncMyId() : null; // 08.09.2026: «это моё небо» — отдельно от «я модератор»
    // 15.09.2026 «Единая карточка» (владелец, макет edinaya-kartochka-standart-15-09-2026.html) —
    // небо занимает всю карточку (130px, тот же размер, что у карточки режима/превью «Создать»);
    // звезда/лайк/инфо/[Закрепить/Скрыть] — один ряд наверху; имя — над значками препятствий
    // внизу слева; Полёт/Изменить — столбиком в правом нижнем углу. Подробности — у самой
    // разметки ниже и в CSS index.html (.wRow/.wBanner/.wTopRow/.wNameStack/.wActionStack).
    // 20.09.2026: один общий перетасованный набор характеров на весь текущий показ списка —
    // см. комментарий у shuffleArray() выше. Раздаётся по кругу (% длины) — если рядов больше
    // 12, дальше начинаются повторы, это ожидаемо и честно (пул конечен).
    const ribbonCharsShuffled=shuffleArray(WORKSHOP_RIBBON_CHARS.slice());
    const ribbonShapesShuffled=shuffleArray(WORKSHOP_RIBBON_SHAPES.slice());
    listEl.innerHTML=tracks.map(function(t,ribbonIdx){
      return '<div class="wRow">'+
      '<div class="wBanner"><canvas width="300" height="150"></canvas><div class="wScrim"></div>'+
      // 19.09.2026 «Звезда автора»: лента для всех — видимость/интерактивность решает forEach
      // ниже (t.featured && !isOwner для игроков, всегда видна и нажимаема для владельца).
      // 20.09.2026: текст на ленте заменён на моргающие глаза (владелец решил в разговоре,
      // см. комментарий у WORKSHOP_RIBBON_EYES выше) — L.workshopAuthorRibbon больше не читается здесь.
      // 20.09.2026 «Лента вместо звезды у владельца» (прямое слово: «я хочу, чтобы у меня было
      // так же само, как у игроков, только нажимал бы я на эту ленточку, как раньше на
      // звёздочку»): data-act="pickstar" — та же ветка обработчика (js/forge.js ниже), что уже
      // работала со звездой, ни одной новой строчки логики клика не понадобилось. Для игрока
      // pointer-events:none (index.html) делает этот атрибут недостижимым, безопасно.
      // 21.09.2026: форма — та же перетасовка, что у характера, независимая ось. Бровки
      // (WORKSHOP_RIBBON_EYES) остаются только у кружка — они буквально «брови глаза», на
      // других формах (звезда/ромб/шестиугольник/крестик/треугольник/кольцо) не имеют смысла.
      // 22.09.2026 «Лестница уровней неба» (см. комментарий у WORKSHOP_TIER_THRESHOLDS выше):
      // от уровня 2 форма/характер больше не тасуются — закреплены хэшем кода трассы.
      (function(){
        const lvl=workshopTrackLevel(t);
        const shape=lvl>=2?workshopRibbonShapeClass(t.code):ribbonShapesShuffled[ribbonIdx%ribbonShapesShuffled.length];
        const charCls=lvl>=2?workshopRibbonCharClass(t.code):ribbonCharsShuffled[ribbonIdx%ribbonCharsShuffled.length];
        const inner=(shape==='dot'?WORKSHOP_RIBBON_EYES:workshopRibbonShapeHtml(shape));
        const tierCls=(lvl>=1?' tier1':'');
        // 22.09.2026: уровень 4 использует бОльший пул (6 цветов), уровень 3 — только первые 3 —
        // так трек, дошедший до 4, может «сменить» цвет при пересчёте на более широкий выбор
        // (тот же трек-код даёт другой индекс % на пуле другого размера) — это ожидаемо и честно,
        // не баг: у трека буквально стало больше вариантов.
        const colorCls=lvl>=4?' '+workshopRibbonColorClass(t.code,WORKSHOP_RIBBON_COLORS_TIER4)
                      :lvl>=3?' '+workshopRibbonColorClass(t.code,WORKSHOP_RIBBON_COLORS_TIER3):'';
        return '<div class="wAuthorRibbon hidden '+charCls+tierCls+colorCls+'" data-act="pickstar"><span>'+inner+'</span></div>';
      })()+
      // 16.09.2026 (владелец: «иконка, которая запускает небо, мне не нравится... вместо
      // иконки можно просто будет нажимать на небо, и всё, как у нас уже сделано на карточках
      // главного экрана» + «подсказка будет только на Разминке, один раз нажали, проверили,
      // дальше и так понятно, не нужно 500 раз объяснять»): текст-заглушка, наполняется и
      // показывается ТОЛЬКО у карточки «Разминка» (см. forEach ниже, data-role="playhint"),
      // у всех остальных карточек остаётся пустым и скрытым — не общий приём на каждую карточку.
      '<div class="wPlayHint hidden" data-role="playhint"></div>'+
      // 16.09.2026 (владелец: подсказка про «Изменить» — только на «Разминке», только ПОСЛЕ
      // того как она уже сыграна, не раньше): текст/видимость — тот же forEach ниже.
      '<div class="wEditTip hidden" data-role="edittip"></div>'+
      // 15.09.2026 «Единая карточка» (владелец, макет edinaya-kartochka-standart-15-09-2026.html,
      // несколько живых заходов): звезда/лайк/инфо — один ряд наверху, порядок слева направо
      // звезда→лайк→инфо→(Закрепить/Скрыть у владельца), инфо/Закрепить/Скрыть остаются в своём
      // привычном правом углу (justify-content:flex-end в index.html — владелец поймал живьём,
      // что без .wName в ряду значки съезжали к ЛЕВОМУ краю, поправлено). Один размер (.wCorner
      // 26px) на все значки карточки без исключений — владелец явно попросил не разные числа.
      '<div class="wTopRow">'+
      // 15.09.2026, владелец (референс-скрин «Разминка», «такой вариант правильный, нужно
      // чтобы такой был у всех»): звезда/лайк/инфо — ОДИН ряд, в этом порядке. Более ранняя
      // правка этого же дня (Изменить в этот ряд, звезда — под инфо в .wInfoStack) не подошла —
      // владелец явно указал на референс-скрин, где ряд именно такой, разметка возвращена к
      // нему. Строку про «см. её комментарий» ниже (про getBBox()) не трогать — размер значков
      // остаётся посчитанным, меняется только положение.
      '<button class="wCorner wPickStar hidden" data-act="pickstar" title="'+(L.workshopPickTitle||'Отмечено автором игры')+'"><svg class="ic" viewBox="0 0 24 24"><use href="#i-star5-outline"></use></svg></button>'+
      '<button class="wCorner wVote" data-act="vote"><svg class="ic" viewBox="0 0 24 24"><path d="M12 20.2c-.3 0-.6-.1-.8-.3C7.6 16.8 4 13.6 4 9.9 4 7.2 6.1 5 8.7 5c1.4 0 2.7.6 3.3 1.7C12.6 5.6 13.9 5 15.3 5 17.9 5 20 7.2 20 9.9c0 3.7-3.6 6.9-7.2 10-.2.2-.5.3-.8.3z"></path></svg></button>'+
      // 12.09.2026 «Что до полёта, что за (i)» (владелец, живой тест руками — «протестируй
      // как играет ребёнок и взрослый», потом отдельный разбор макета): Автор/Запуски не
      // помогают решить «лететь или нет» — убраны из видимой по умолчанию картинки.
      // «Пожаловаться» — владелец сперва просил убрать совсем на итоги полёта, сам же поймал
      // свою ошибку («на имя можно пожаловаться, не запуская игру») — осталась на карточке,
      // но переехала за этот же значок вместе с остальным второстепенным. Один значок (i)
      // вместо треугольника — открывает overlay ПОВЕРХ картинки неба (.wInfoOverlay ниже),
      // не раздвигая карточку — владелец категорически запретил раздвигающуюся панель.
      // 16.09.2026 (владелец, живой скрин: «у иконки Инфо очень слабая буква И, почти не
      // видно, надо чтобы выделялась намного лучше»): стержень/точка «i» были тонкими
      // (rect 2.6×7.4, точка r1.6) — при сравнении вживую на реальном размере значка (11px)
      // рядом с сердцем/звездой читались бледнее не из-за размера бокса (getBBox уже сведён
      // 15.09.2026), а из-за тонкой обводки самой буквы — мало закрашенной площади. Утолщено
      // (rect 3.6×9, точка r2.1), .ic-размер поднят следом до 13px (index.html), геометрия
      // круга/цвет не тронуты — просто более жирная буква, ничего не придумано заново.
      '<button class="wCorner" data-act="info" title="Подробнее"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><rect x="10.2" y="9.4" width="3.6" height="9" rx="1.8" fill="#0b1626"></rect><circle cx="12" cy="6" r="2.1" fill="#0b1626"></circle></svg></button>'+
      // 08.09.2026 (владелец, живой макет): «не вижу причин им быть под кнопкой ⋯, можно
      // без лишнего клика» — Закрепить/Скрыть тоже открытые значки в углу, залитые как
      // жалоба, «⋯»/скрывающий wModRow убраны совсем.
      (isOwner ? '<button class="wCorner wPin" data-act="pin" title="Закрепить"><svg class="ic" viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0-6.5 6.5C5.5 14 12 21 12 21s6.5-7 6.5-11.5A6.5 6.5 0 0 0 12 3z"></path><circle cx="12" cy="9.3" r="2.3" fill="#0b1626"></circle></svg></button>'+
      '<button class="wCorner wHide" data-act="hide" title="Скрыть"><svg class="ic" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6" fill="#0b1626"></circle></svg></button>' : '')+
      '</div>'+
      // 15.09.2026: имя переехало вниз, прямо над значками препятствий — оба в левом нижнем
      // углу, одной колонкой (.wNameStack), тем же приёмом, что уже был у стикеров.
      '<div class="wNameStack"><div class="wName"></div><div class="wStickerRow" data-role="stickers"></div></div>'+
      // 12.09.2026: overlay поверх самой картинки (position:absolute;inset:0 в index.html) —
      // не элемент в потоке, поэтому карточка не растёт, когда он открыт. «Скопировать палитру» —
      // тот же forgeFavSave, что раньше был значком-веером (data-act="fav" не переименован,
      // сервер/клик-хендлер не тронуты, только положение и текст вместо иконки).
      // 15.09.2026 (владелец, живой скрин): Автор/Запуски снова разъехались на две строки —
      // 12.09.2026 их объединяли ради экономии места, сегодня решение обратное. Порядок сверху
      // вниз: автор, запуски, значки действий (fav/report) — тем же .wInfoActions, что и был.
      '<div class="wInfoOverlay">'+
      '<div class="wInfoLine" data-role="info-author"></div>'+
      '<div class="wInfoLine" data-role="info-plays"></div>'+
      '<div class="wInfoActions">'+
      '<button class="wCorner" data-act="fav" title=""><svg class="ic" viewBox="0 0 24 24"><use href="#i-color-fan"></use></svg></button>'+
      '<button class="wCorner wCornerDanger" data-act="report" title=""><svg class="ic" viewBox="0 0 24 24"><path d="M12 2.5 22.5 20.5H1.5Z" stroke-linejoin="round"></path><rect x="10.7" y="9.2" width="2.6" height="6" rx="1.3" fill="#0b1626"></rect><rect x="10.7" y="16.6" width="2.6" height="2.4" rx="1.2" fill="#0b1626"></rect></svg></button>'+
      // 18.09.2026 «Показать в Случайных» (макет konstruktor-pokazat-v-sluchaynyh-18-09-2026.html,
      // владелец: «В. Флажок») — третий значок в той же панели, скрыт по умолчанию (.hidden),
      // видимость решает JS ниже: только своя трасса (is_mine с сервера) и только пока открыта
      // вкладка «Случайные» — тот же принцип, что уже решён раньше («живёт внутри 🔀»).
      '<button class="wCorner wNotice hidden" data-act="notice" title=""><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4a1 1 0 0 1 1-1h1"></path><path d="M6 3h11.5a1 1 0 0 1 .8 1.6L15.5 8l2.8 3.4a1 1 0 0 1-.8 1.6H6V3z"></path></svg></button>'+
      '</div>'+
      '</div>'+
      // 15.09.2026: Полёт/Изменить были в правом нижнем углу, столбиком.
      // 16.09.2026 (владелец, живой скрин + несколько раз повторено: «иконку редактировать
      // под иконку инфо, сразу же под ней, друг под другом, зачем внизу место занимать» +
      // отдельно «иконка полёта мне не нравится, нажатие по самому небу и подсказка вместо
      // неё»): кнопка «Полёт» убрана совсем — тап по .wBanner делает то же самое (см.
      // делегированный обработчик ниже). .wActionStack остался с одним «Изменить» и
      // переехал из низа карточки вплотную под .wTopRow (index.html: top вместо bottom) —
      // никакого отдельного столбика внизу, никакой пустой полосы между ними. */
      '<div class="wActionStack">'+
      // 16.09.2026: путь до этой иконки — круглый карандаш → «квадратик с карандашом»
      // (square-pen, Lucide) → на 15px два штриха слипались в пятно (живой скрин с телефона),
      // увеличили до 20px, обводку сузили → владелец прислал референс «тюнинг» (ползунки),
      // сначала 3 ползунка, потом «двух хватит» — остановились на настоящей Lucide settings-2
      // (raw.githubusercontent.com/lucide-icons/lucide/main/icons/settings-2.svg, не
      // нарисована на глаз), простой геометрии из двух линий и двух кружков, мельче не слипается.
      '<button class="wCorner" data-act="edit" title="'+(L.workshopEdit||'Изменить')+'"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"></path><path d="M19 7h-9"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg></button>'+
      '</div>'+
      '</div></div>'; }).join('');
    tracks.forEach(function(t,i){
      const row=listEl.children[i]; row.dataset.code=t.code;
      const status=t.status||'normal'; row.dataset.status=status;
      // 12.09.2026: значок теперь всегда существует в шаблоне (.wPickStar.hidden) — просто
      // снимаем класс, а не создаём/удаляем узел; тот же .wCorner, что у всех остальных
      // значков ряда (15.09.2026: .wTopRow, не отдельный столбик).
      // 12.09.2026 (второй заход, владелец): честный флаг с сервера (forge_workshop.featured
      // через moderate) вместо статического WORKSHOP_FEATURED_CODES — раньше пометить трек
      // мог только я правкой кода, теперь сам владелец тапом. Владельцу звезда видна всегда
      // (пустой контур на непомеченных), чтобы было чем нажать.
      // 19.09.2026 «Звезда автора» (владелец, макет, явное «да»): звезда-переключатель теперь
      // ТОЛЬКО у владельца — остальные игроки видят угловую ленту (.wAuthorRibbon) вместо неё,
      // не пустой некликабельный значок.
      // 20.09.2026: звезда-переключатель у владельца упразднена — теперь и он нажимает на ту же
      // ленту, что видят игроки (владелец, прямое слово: «чтобы так же само было, как в игре»).
      // .wPickStar остаётся в разметке (index.html), но всегда .hidden — не удаляю узел совсем,
      // тот же осторожный приём, что уже применён к самой ленте (12.09.2026, комментарий выше).
      const pickStarBtn=row.querySelector('.wPickStar');
      if(pickStarBtn) pickStarBtn.classList.add('hidden');
      const ribbonEl=row.querySelector('.wAuthorRibbon');
      if(ribbonEl){
        // 21.09.2026: лента теперь у ВСЕХ треков, не только featured (владелец: «если это
        // только мне возможность останется, это глупо») — .featured лишь красит её отдельным
        // холодным цветом (index.html: .wAuthorRibbon.featured), не решает видимость.
        ribbonEl.classList.remove('hidden');
        ribbonEl.classList.toggle('ownerPick', isOwner);
        ribbonEl.classList.toggle('featured', !!t.featured);
      }
      const cfg=forgeDecode(t.code);
      if(cfg) forgeMiniSwatchPaint(row.querySelector('canvas'), cfg);
      row.querySelector('.wName').textContent=t.name||L.forgeDefName||'';
      // 08.09.2026/12.09.2026: значки препятствий — всегда видимая часть карточки (не помогают
      // решить «лететь или нет» сами по себе, но и не текст — см. .knowledge/RESEARCH...),
      // Автор/Запуски — внутри панели (i), второстепенные. 13.09.2026: у автора есть подпись
      // «Автор:» (L.workshopAuthor) — без неё голое имя читалось непонятно, как что-то ещё.
      // 15.09.2026 (владелец, живой скрин: «иконки на имя заходят» + прямая просьба): автор и
      // запуски снова две отдельные строки (были объединены 12.09.2026 ради места, реверс).
      const infoAuthor=row.querySelector('[data-role="info-author"]');
      const infoPlays=row.querySelector('[data-role="info-plays"]');
      if(infoAuthor) infoAuthor.textContent=L.workshopAuthor?L.workshopAuthor(t.author_name||''):'Автор: '+(t.author_name||'');
      // 21.09.2026 «Лайки наконец видны» (владелец нашёл: счётчик лайков нигде не показывался,
      // жил только в title кнопки .wVote) — дописываем рядом с запусками, та же строка (i),
      // не на ленте (лента — только форма/характер, декоративная, число сюда не поместили бы
      // на скролле из многих карточек одновременно, владелец согласился: «давай пробовать»).
      if(infoPlays) infoPlays.textContent=(L.workshopPlays?L.workshopPlays(t.plays||0):'Запуски: '+(t.plays||0))+
        ' · '+(L.workshopHeartsCount?L.workshopHeartsCount(t.hearts||0):'Лайков: '+(t.hearts||0));
      // 08.09.2026 (владелец, живой макет): значки препятствий — настоящий набор Партитуры
      // (js/partitura.js PT_ICON_SVG/PT_KIND_COLOR/PT_KIND_LABEL), не текстовые таблетки —
      // тот же язык, что уже есть в Расстановке, просто переиспользован здесь. Измерено
      // живьём: все 8 иконок при 22px помещаются в ряд без переноса, обрезка не нужна.
      if(cfg && typeof PT_ICON_SVG!=='undefined'){
        const kinds=FORGE_KINDS.filter(function(k,idx){ return cfg.e>>idx&1; });
        row.querySelector('[data-role="stickers"]').innerHTML=kinds.map(function(k){
          return '<span class="wSticker" style="color:'+PT_KIND_COLOR[k]+'" title="'+(PT_KIND_LABEL[k]||k)+'">'+PT_ICON_SVG[k]+'</span>';
        }).join('');
      }
      const voted = mine.indexOf(t.code)>=0;
      // 15.09.2026: значок лайка сжат до простого кружка (.wCorner) без видимого счётчика рядом
      // (владелец: «без подписи» для всего нового ряда значков) — число лайков не потеряно,
      // осталось в title (подсказка при долгом нажатии/скринридере), тем же приёмом, что уже
      // у Пожаловаться/Скопировать палитру ниже.
      const voteBtn=row.querySelector('.wVote');
      voteBtn.title=(L.workshopHearts?L.workshopHearts(t.hearts||0):(t.hearts||0)+' лайков');
      voteBtn.classList.toggle('voted', voted); // заливка сердца — CSS (.wVote.voted .ic)
      row.querySelector('[data-act="edit"]').title=L.workshopEdit||'Изменить';
      // 16.09.2026 (владелец: «подсказка будет только на Разминке... один раз нажали,
      // проверили, дальше и так понятно, не нужно 500 раз объяснять»): подсказка живёт
      // только на карточке «Разминка» (тот же WARM_CODE, что уже держит её первой в списке),
      // и только пока этот код не сыгран честно (workshopPlayedCodes()) — у остальных карточек
      // .wPlayHint остаётся пустой и скрытой, ничего не читает и не показывает.
      const hintEl=row.querySelector('[data-role="playhint"]');
      if(hintEl){
        const showHint = (typeof WARM_CODE!=='undefined') && t.code===WARM_CODE && workshopPlayedCodes().indexOf(WARM_CODE)<0;
        hintEl.textContent = showHint ? (L.heroHintTap||'') : '';
        hintEl.classList.toggle('hidden', !showHint);
      }
      // 16.09.2026 (владелец: «после того как сыграл в Разминку и вернулся в меню — подсказка
      // про Изменить, потому что пока играл в чужое небо», явно уточнил — ТОЛЬКО после игры,
      // не раньше): тот же принцип, что playhint — одна карточка (Разминка), пока не увидена
      // (workshopEditHintSeen ставится в click-обработчике ниже при первом тапе «Изменить»).
      const editTipEl=row.querySelector('[data-role="edittip"]');
      if(editTipEl){
        const showEditTip = (typeof WARM_CODE!=='undefined') && t.code===WARM_CODE &&
          workshopPlayedCodes().indexOf(WARM_CODE)>=0 && !Store.get('workshopEditHintSeen',0);
        editTipEl.textContent = showEditTip ? (L.workshopEditTip||'') : '';
        editTipEl.classList.toggle('hidden', !showEditTip);
      }
      const reportBtn=row.querySelector('[data-act="report"]'); if(reportBtn) reportBtn.title=L.workshopReport||'Пожаловаться';
      const favBtn=row.querySelector('[data-act="fav"]'); if(favBtn) favBtn.title=L.workshopFav||'Скопировать палитру';
      // 18.09.2026 «Показать в Случайных»: видна только своя трасса (t.is_mine, честно с сервера —
      // не клиентская проверка) и только на вкладке «Случайные» (workshopSortMode==='random',
      // решено раньше — «живёт внутри 🔀»). Дни до конца кулдауна — только для подписи на кнопке;
      // сам запрет ставит сервер по своему noticed_at при клике, здесь просто отражение того же числа.
      const noticeBtn=row.querySelector('[data-act="notice"]');
      if(noticeBtn){
        const showNotice = !!t.is_mine && workshopSortMode==='random';
        noticeBtn.classList.toggle('hidden', !showNotice);
        if(showNotice){
          const NOTICE_COOLDOWN_DAYS=7; // тот же срок, что NOTICE_COOLDOWN_DAYS в cosmogram-workshop
          let daysLeft=0;
          if(t.noticed_at){
            const elapsed=(Date.now()-new Date(t.noticed_at).getTime())/86400000;
            daysLeft=Math.max(0, Math.ceil(NOTICE_COOLDOWN_DAYS-elapsed));
          }
          noticeBtn.classList.toggle('used', daysLeft>0);
          noticeBtn.title = daysLeft>0 ? (L.workshopNoticeCooldown?L.workshopNoticeCooldown(daysLeft):'') : (L.workshopNotice||'Показать в Случайных');
        }
      }
      row.dataset.featured=t.featured?'1':'0'; // 12.09.2026: читает click-обработчик ниже при тапе pickstar
      if(pickStarBtn) pickStarBtn.classList.toggle('active', !!t.featured); // заливка звезды — CSS, тот же приём, что .wPin.active
      if(ribbonEl) ribbonEl.classList.toggle('active', !!t.featured); // 20.09.2026: тот же источник, что у звезды — тусклая лента у владельца, пока не отмечено
      if(isOwner){
        const pinBtn=row.querySelector('.wPin'), hideBtn=row.querySelector('.wHide');
        pinBtn.title=L.workshopPin||'Закрепить';
        pinBtn.classList.toggle('active', status==='pinned'); // заливка — CSS
        hideBtn.title=L.workshopHide||'Скрыть';
        hideBtn.classList.toggle('active', status==='hidden');
        if(status==='hidden') hideBtn.querySelector('svg').innerHTML='<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6" fill="#0b1626"></circle><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"></path>';
      }
    });
  }).catch(function(){ listEl.innerHTML=''; if(emptyEl) emptyEl.classList.remove('hidden'); });
}
// 06.09.2026: workshopOpen()/forgeWorkshopBtn/workshopBack убраны — Мастерская больше не
// отдельный экран, заполняется прямо при входе в Конструктор (forgeOpen()) и при возврате
// на вкладку «Играть» (forgeTabSet()); «назад» из неё больше нет — это уже вкладка Конструктора,
// назад отсюда ведёт та же кнопка forgeBack, что и всегда.
wireOnLocal('workshopList','click',function(e){
  const row=e.target.closest('.wRow'); if(!row) return;
  const code=row.dataset.code; if(!code) return;
  const act=e.target.closest('[data-act]');
  if(!act){
    // 16.09.2026 (владелец: «иконка полёта мне не нравится... можно просто нажимать на небо
    // и всё, как у нас уже сделано на карточках главного экрана»): тап по самой картинке —
    // тот же полёт, что раньше отдельная кнопка. Не должен срабатывать, если открыта панель
    // (i) поверх картинки (.wInfoOverlay.open) — там уже есть на что нажать своими кнопками.
    if(!e.target.closest('.wInfoOverlay.open') && e.target.closest('.wBanner')) forgeWorkshopPlay(code);
    return;
  }
  if(act.dataset.act==='edit'){
    Store.set('workshopEditHintSeen',1); // 16.09.2026: первый тап «Изменить» где угодно — подсказка про него больше не нужна, гасится навсегда
    forgeWorkshopEdit(code); forgeTabSet('create'); return;
  } // 06.09.2026: уже на экране Конструктора — переключаем вкладку, не экран
  if(act.dataset.act==='info'){
    // 12.09.2026: overlay лежит поверх .wBanner (position:absolute;inset:0, index.html) —
    // тап только переключает класс, ничего не раздвигает; карточка одного размера всегда,
    // открыта она или закрыта (проверено вживую: 151.4px в обоих случаях).
    const overlay=row.querySelector('.wInfoOverlay'); if(overlay) overlay.classList.toggle('open');
    sfx.click(); haptic('light');
    return;
  }
  if(act.dataset.act==='vote'){
    // 12.09.2026 «Честный лайк» (владелец, находка сессии — Roblox/Trackmania Exchange:
    // «qualified play», голос не считается, если не доехал): уже поставленный лайк снять
    // можно всегда, а поставить новый — только если этот код реально долетен до конца
    // (workshopPlayedCodes, пишется в mapOver() по S.mapWin). Честно: проверка только
    // клиентская (Store), сервер не может сам доказать прохождение без отдельного журнала —
    // не полная защита, но останавливает случайный/бездумный лайк без единого запуска.
    const already = workshopMyVotes().indexOf(code)>=0;
    if(!already && workshopPlayedCodes().indexOf(code)<0){
      toast(L.workshopVoteLocked||'Долети до конца, чтобы оценить', 'rgba(255,159,176,.5)'); haptic('light'); return;
    }
    workshopVote(code).then(function(res){
      // 13.09.2026, владелец («не могу поставить лайк, даже когда прошёл небо» — прошёл
      // честно, гейт выше пропустил, но сети не было, workshopVote() молча вернул null):
      // раньше при неудаче лайк просто ничего не делал, без единой подсказки — с точки
      // зрения игрока «сломано», хотя причина честная (нет соединения). Один явный тост.
      if(!res || !res.ok){ toast(L.syncOffline||'Нет соединения — попробуй позже','rgba(255,159,176,.5)'); return; }
      // 15.09.2026 (владелец, прямое решение — реверс находки 3.1 от 14.09.2026): лайк
      // самому себе теперь разрешён, сервер (cosmogram-workshop) больше не возвращает
      // own_track для vote — ветка-тост под неё снята вместе с сервером, не только здесь.
      let mine=workshopMyVotes(); const idx=mine.indexOf(code);
      if(res.hearted && idx<0) mine.push(code); else if(!res.hearted && idx>=0) mine.splice(idx,1);
      // 18.09.2026 (сквозная проверка всей игры на неограниченный рост): тот же потолок, что и
      // у workshopPlayedCodes рядом — список лайков раньше рос без предела, если игрок никогда
      // не снимал старые лайки.
      if(mine.length>FORGE_VERIFY_MAX) mine=mine.slice(mine.length-FORGE_VERIFY_MAX);
      Store.set('workshopMyVotes',mine);
      act.classList.toggle('voted', res.hearted); // заливка сердца — CSS
      // 15.09.2026: видимого счётчика рядом со значком больше нет (единая карточка, значок
      // без подписи) — число лайков живёт в title значка, тот же приём, что у остальных
      // подсказок карточки (см. workshopRenderList выше).
      act.title=(L.workshopHearts?L.workshopHearts(res.hearts||0):(res.hearts||0)+' лайков');
    });
    haptic('light');
  }
  if(act.dataset.act==='fav'){
    const cfg=forgeDecode(code);
    if(cfg) forgeFavSave(cfg, row.querySelector('.wName').textContent, act);
    haptic('light');
  }
  if(act.dataset.act==='report'){
    // 05.09.2026: сервер сам не даёт накрутить счётчик повторной жалобой (unique код+игрок) —
    // здесь достаточно погасить кнопку визуально, чтобы не звать снова с этого же экрана без толку.
    // 08.09.2026: значок стал маленьким кружком без подписи — текстом «Готово» внутри него
    // не разместить, гасим (disabled уже даёт :disabled-стиль), подтверждение остаётся тостом.
    act.disabled=true;
    workshopReport(code); haptic('light'); toast(L.workshopReported||'Мы проверим название этого неба.', 'rgba(255,159,176,.5)');
  }
  if(act.dataset.act==='notice'){
    // 18.09.2026 «Показать в Случайных»: сервер — единственный, кто по-настоящему решает
    // владение и кулдаун (см. cosmogram-workshop, action:'notice') — кнопка здесь лишь
    // отражает последний известный ответ, не блокирует тап сама по себе (уже .used визуально
    // тусклая, но клик всё равно уходит на сервер и получает содержательный ответ).
    if(act.classList.contains('used')) { haptic('light'); return; }
    workshopNotice(code).then(function(res){
      if(!res){ toast(L.syncOffline||'Нет соединения — попробуй позже', 'rgba(255,159,176,.5)'); return; }
      if(res.error==='cooldown'){
        act.classList.add('used');
        act.title = L.workshopNoticeCooldown ? L.workshopNoticeCooldown(res.daysLeft) : '';
        toast(L.workshopNoticeCooldown ? L.workshopNoticeCooldown(res.daysLeft) : '', 'rgba(240,192,64,.5)');
        return;
      }
      if(res.error || !res.ok){ toast(L.syncOffline||'Не получилось — попробуй позже', 'rgba(255,159,176,.5)'); return; }
      act.classList.add('used');
      act.title = L.workshopNoticeCooldown ? L.workshopNoticeCooldown(7) : '';
      toast(L.workshopNoticed||'Показано в Случайных', 'rgba(240,192,64,.5)');
    });
    haptic('light');
  }
  if(act.dataset.act==='pin'){
    // 05.09.2026: один статус на трассу — закрепить снимает «скрыто», если было; сервер
    // всё равно проверяет OWNER_ID сам, кнопка здесь лишь скрыта для остальных игроков.
    const next = row.dataset.status==='pinned' ? 'normal' : 'pinned';
    workshopModerate(code, next).then(function(res){
      // 18.09.2026 (аудит тишины-без-сигнала, владелец «да»): та же дыра, что у mapAskPublish —
      // отказ сервера тихо ничего не делал, значок оставался в прежнем состоянии без объяснения.
      if(!res || !res.ok){ toast(L.syncOffline,'rgba(255,159,176,.5)'); return; }
      row.dataset.status=next;
      act.classList.toggle('active', next==='pinned'); // заливка булавки — CSS
      // 07.09.2026, владелец («не понятно что произошло после нажатия»): смена эмодзи одна,
      // без слов, легко пропустить — добавлен тот же тост, что уже есть у report.
      toast(next==='pinned' ? (L.workshopPinned||'Закреплено') : (L.workshopUnpinned||'Откреплено'), 'rgba(255,214,140,.5)');
    });
    haptic('light');
  }
  if(act.dataset.act==='pickstar'){
    // 12.09.2026 «Выбор автора»: та же логика, что pin/hide выше — кнопка видна только
    // владельцу (или уже помеченным трекам всем), сервер сам проверяет OWNER_ID ещё раз.
    const next = row.dataset.featured==='1' ? false : true;
    workshopModerateFeatured(code, next).then(function(res){
      if(!res || !res.ok){ toast(L.syncOffline,'rgba(255,159,176,.5)'); return; }
      row.dataset.featured = next ? '1' : '0';
      act.classList.toggle('active', next);
      toast(next ? (L.workshopFeatured||'Отмечено золотой звездой') : (L.workshopUnfeatured||'Метка снята'), 'rgba(255,214,140,.5)');
    });
    haptic('light');
    return;
  }
  if(act.dataset.act==='hide'){
    const next = row.dataset.status==='hidden' ? 'normal' : 'hidden';
    workshopModerate(code, next).then(function(res){
      if(!res || !res.ok){ toast(L.syncOffline,'rgba(255,159,176,.5)'); return; }
      row.dataset.status=next;
      const eyeSvg=act.querySelector('svg');
      eyeSvg.innerHTML = next==='hidden'
        ? '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6" fill="#0b1626"></circle><path d="M3.5 3.5l17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"></path>'
        : '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6" fill="#0b1626"></circle>'; // перечёркнутый глаз — «скрыто» честнее показать другой формой, не просто заливкой
      act.classList.toggle('active', next==='hidden');
      toast(next==='hidden' ? (L.workshopHidden||'Скрыто от игроков') : (L.workshopUnhidden||'Снова видно всем'), 'rgba(255,159,176,.5)');
    });
    haptic('light');
  }
});

/* ---------- Привязка событий ---------- */
wireOnLocal('forgePlay', 'click', forgePlay);
wireOnLocal('forgeShareMapBtn', 'click', mapShare); // 02.09.2026: mapShare() существовала с v1.87.0, но была ничем не вызвана
/* 12.09.2026 (макет karta-tochno-kak-referens-12-09-2026.html, одобрено): «Сбросить» —
   сбрасывает ВЕСЬ forgeCfg (не только точки), случайный тап слишком дорог.
   22.09.2026: отдельная кнопка-корзина с двойным нажатием «Точно?» убрана — то же самое
   (forgeResetAll(), защита от случайного срабатывания) теперь на долгом нажатии ptUndoBtn,
   см. ptWireOnce() в js/partitura.js. */
wireOnLocal('forgeBack', 'click', function(){ sfx.click(); setScreen('menu'); }); // 08.09.2026 (владелец, живой баг): вело в 'modes' (Соревнования) — хвост с 05.09.2026, когда кнопка Конструктора переехала с modeForge (внутри Соревнований) на главное меню, а «Назад» тогда забыли поправить. Единственный реальный вход теперь — konstruktorBtn с главного меню (проверено: «Открыть в Конструкторе» из Галереи — не отдельный вход, а переключение вкладки на уже открытом экране).
/* v1.282.13: тонкие ручки пишутся в конфиг, как «Жар» строкой выше по файлу. Раньше они
   меняли только подпись — конфиг оставался прежним, и первый же forgeSyncWidgets (любой
   другой виджет, пресет, смена языка) возвращал слайдер на старое значение: правка автора
   молча пропадала, а живое мини-небо на неё вообще не отзывалось. Здесь намеренно НЕ зовём
   forgeSyncWidgets — он переписал бы value прямо под пальцем; хватает подписи и неба. */
wireOnLocal('forgeDen', 'input', function(){ forgeCfg.d=+this.value; const v=$('forgeDenV'); if(v) v.value=this.value; forgeSkyKick(); forgeUpdateDiffMeter(); });
wireOnLocal('forgeSpd', 'input', function(){ forgeCfg.s=+this.value; const v=$('forgeSpdV'); if(v) v.value=this.value; forgeSkyKick(); forgeUpdateDiffMeter(); });
wireOnLocal('forgeWind', 'input', function(){ forgeCfg.wind=+this.value; const v=$('forgeWindV'); if(v) v.value=this.value; forgeUpdateDiffMeter(); }); // 06.09.2026 «Солнечный ветер» — не трогает превью неба, чисто игровая физика; 16.09.2026: .value, не .textContent (реальный input); 20.09.2026: живое кольцо «Сложность неба» — эти три ползунка не проходят через forgeSyncWidgets на каждое движение, зовём отдельно
// v1.282.14: имя трассы попадает в конфиг по мере набора. Санацию оставляем на forgeReadForm
// и forgeSanitize — резать текст прямо под пальцем нельзя, курсор прыгает.
wireOnLocal('forgeName', 'input', function(){ forgeCfg.n=this.value; });
