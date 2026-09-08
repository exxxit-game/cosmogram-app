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
   status='pinned' — те же 2 живых кода, что forgeEncode() уже даёт для их конфигов). Отдельной
   сетки-витрины и forgePresetMatch()/подсветки выбранной программы больше нет — играть/
   загрузить любой из 8 можно тем же путём, что и любую чужую трассу. FORGE_PRESETS сам
   остаётся полным (8) — им по-прежнему пользуется кодирование ссылок и стартовый forgeCfg
   по умолчанию (FORGE_PRESETS[0].c, «Разминка»). */

function forgeSanitize(c){ // вход недоверенный — код приходит извне; режем всё до рамок
  if(!c||typeof c!=='object') c={};
  const o={v:3};
  o.n=(typeof sanitizeTrackName==='function') ? sanitizeTrackName(c.n) : String(c.n==null?'':c.n).replace(/[<>&"'\\]/g,'').trim().slice(0,17); // 17 — безопасный кириллический остаток байтового бюджета; путь дублирует sanitizeTrackName только если она недоступна
  o.d=clamp(Math.round(isFinite(+c.d)?+c.d:50),10,100);
  o.s=clamp(Math.round(isFinite(+c.s)?+c.s:50),10,100);
  o.e=clamp(Math.round(isFinite(+c.e)?+c.e:15),1,255); // минимум один вид преград
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
  o.hs=c.hs?1:0; // 31.08.2026 «Высокая ставка»: форсирует 1 жизнь и бонусы выкл — не отдельная механика,
  // а форс уже существующих полей; принудительно поверх любых значений полей выше, а не только
  // как совет в интерфейсе — иначе чужой код с hs=1, но подкрученными lv/b, тихо давал бы больше
  // жизней/бонусов, чем ставка обещает.
  if(o.hs){ o.lv=1; o.b=0; }
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
  const extFlags=[1|2|4|8];
  const lenTail=[(cfg.l>>8)&255, cfg.l&255];
  const colorTail=[(cfg.h1>>8)&255, cfg.h1&255, (cfg.h2>>8)&255, cfg.h2&255, cfg.dens&255];
  const moodTail=[cfg.mood&255];
  const windTail=[cfg.wind&255];
  return new Uint8Array(head.concat(nameBytes.length, nameBytes, scOut, extFlags, lenTail, colorTail, moodTail, windTail));
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
  let l=FORGE_LENS[lIdx], h1, h2, dens, mood, wind;
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
  }
  return { n, d, s, e, l, lv, w, fl, b, sky:FORGE_SKYS[skyIdx], h1, h2, dens, mood, fog, hs, seed, wind, wg:0, sc:sc };
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
let _fSkyT=0, _fSkyRun=false;
function forgeSkyPaint(dt){ // живое мини-небо конструктора: выбранные небо/туман/состав/жар летают в превью
  const cv=$('forgePreview'); if(!cv||!cv.getContext) return;
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
  for(let i=0;i<70;i++){ // звёздный фон: статичный сид + мягкое дыхание
    const sx=rnd()*W, sy=(rnd()*H+_fSkyT*(8+cfg.s*.25)*(0.3+rnd()))%H;
    x.globalAlpha=.25+rnd()*.55; x.fillStyle=rnd()>.85?'#ffe9b8':'#dfe8ff';
    x.beginPath(); x.arc(sx,sy,rnd()*1.4+.4,0,6.283); x.fill();
  }
  x.globalAlpha=1;
  const kinds=FORGE_KINDS.filter(function(k,i){ return cfg.e>>i&1; });
  if(!kinds.length) kinds.push('rock'); // пустой состав — не повод для мёртвого неба
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
  // совсем, не заменено — настоящий эффект «Туман» в полёте это другой, рабочий механизм
  // (радиальная виньетка #fog.f1/.f2 в index.html/ui.js), preview-баг его не касался.
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
    b.className='forgeChip';
    b.addEventListener('click',function(){ set(!get()?1:0); forgeSyncWidgets(); sfx.click(); haptic('light'); });
    el.appendChild(b);
  }
  el._text=text;
  el._sync=function(){ el.children[0].textContent=el._text; el.children[0].classList.toggle('sel',!!get()); };
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
    ['forgeHeatLbl',L.forgeHeat],['forgeEnLbl',L.forgeEn],['forgeLenLbl',L.forgeLen],
    ['forgeLivesLbl',L.forgeLives],['forgeWaveLbl',L.forgeWave],['forgeWaveHint',L.forgeWaveHint],['forgeBonusLbl',L.forgeBonus],
    ['forgeSkyLbl',L.forgeSky],['forgeFogLbl',L.forgeFog],
    ['forgePlay',L.forgePlayBtn],['forgeShareMapBtn',L.forgeShareMapBtn],['forgeResetBtn',L.forgeResetBtn]];
  // 07.09.2026: «Начать по-другому»/forgeStartOverLbl снята вместе с общей рамкой — «Сбросить
  // всё» и «Небо друга» разъехались по разным местам экрана, общей подписи над ними больше нет.
    // 28.08.2026: forgeBack — круглая иконка, текст ей не пишем (см. index.html)
    // 02.09.2026: «Поделиться небом» вернулась в Конструктор — mapShare() существовала
    // с v1.87.0, но не была вызвана ни одной кнопкой (см. wireOnLocal ниже)
  for(const pair of LBL){ const el=$(pair[0]); if(el) el.textContent=pair[1]; }
  // 30.08.2026: три заголовка групп стали .setGrp (аккордеон) — текст живёт в дочернем .setGrpT,
  // а не прямо в узле (тот же приём, что grpT() в ui.js для Настроек) — el.textContent затёр бы span
  // 05.09.2026: #modeForge убран из «Соревнований» вместе с самой кнопкой (Конструктор
  // переехал на главный экран, id="konstruktorBtn") — строка, что красила её подпись,
  // больше не на что указывать, снята вместе с ней.
  const fnEl=$('forgeName'); if(fnEl) fnEl.placeholder=L.forgeNamePh;
  // враги
  const names=[L.fkRock,L.fkDebris,L.fkDrift,L.fkMine,L.fkSat,L.fkComet,L.fkSeeker,L.fkGate];
  const chips=$('forgeChips');
  if(chips && chips.children.length!==8){
    chips.innerHTML='';
    FORGE_KINDS.forEach(function(k,i){
      const b=document.createElement('button');
      b.className='forgeChip'; b.dataset.bit=i; b.textContent=names[i];
      b.addEventListener('click',function(){
        forgeCfg.e^=(1<<i); if(!forgeCfg.e) forgeCfg.e=(1<<i); // последний вид не гасим — небо не бывает пустым насовсем
        sfx.click(); haptic('light');
        /* v1.282.13: пересобираем всё, а не только свой класс. Раньше чип красил сам себя и
           замолкал — мини-небо продолжало показывать прошлый состав, а подсветка пресета
           врала, пока не тронешь другой виджет. forgeSyncWidgets и класс проставит, и небо
           перерисует: обещание модуля «небо перерисовывается на каждый поворот ручки»
           наконец выполняется и для видов преград. */
        forgeSyncWidgets();
      });
      chips.appendChild(b);
    });
  }
  if(chips) for(let i=0;i<8;i++) chips.children[i].textContent=names[i];
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
    function(){return forgeCfg.lv;},function(v){ if(!forgeCfg.hs) forgeCfg.lv=v; });
  forgeSegBuild($('forgeWaveSeg'),[{v:1,t:'1'},{v:2,t:'2'},{v:3,t:'3'},{v:4,t:'4'},{v:5,t:'5'},{v:6,t:'6'}],
    function(){return forgeCfg.w;},function(v){forgeCfg.w=v;});
  forgeSegBuild($('forgeBonusSeg'),[{v:0,t:L.bOff},{v:1,t:L.bRare},{v:2,t:L.bNorm},{v:3,t:L.bOften}],
    function(){return forgeCfg.b;},function(v){ if(!forgeCfg.hs) forgeCfg.b=v; });
  forgeSegBuild($('forgeFogSeg'),[{v:0,t:L.fog0},{v:1,t:L.fog1},{v:2,t:L.fog2}],
    function(){return forgeCfg.fog;},function(v){forgeCfg.fog=v;});
  forgeChipBuild($('forgeFlatChip'),L.forgeFlat,function(){return forgeCfg.fl;},function(v){forgeCfg.fl=v;});
  forgeChipBuild($('forgeHSChip'),L.forgeHS,function(){return forgeCfg.hs;},function(v){
    forgeCfg.hs=v; if(v){ forgeCfg.lv=1; forgeCfg.b=0; } // 31.08.2026: форс сразу виден в сегментах, не только на старте
  });
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
  const denEl=$('forgeDen'), denVEl=$('forgeDenV'); if(denEl) denEl.value=forgeCfg.d; if(denVEl) denVEl.textContent=forgeCfg.d;
  const spdEl=$('forgeSpd'), spdVEl=$('forgeSpdV'); if(spdEl) spdEl.value=forgeCfg.s; if(spdVEl) spdVEl.textContent=forgeCfg.s;
  const windEl=$('forgeWind'), windVEl=$('forgeWindV'); if(windEl) windEl.value=forgeCfg.wind||0; if(windVEl) windVEl.textContent=forgeCfg.wind||0; // 06.09.2026 «Солнечный ветер»
  const heat=$('forgeHeat'); if(heat){ heat.value=forgeHeatGet(); const hV=$('forgeHeatV'); if(hV) hV.textContent=forgeHeatGet(); } // «Жар» следует за плотностью автора
  const chips=$('forgeChips'); if(chips) for(let i=0;i<chips.children.length;i++)
    chips.children[i].classList.toggle('sel',!!(forgeCfg.e>>i&1));
  const livesSegEl=$('forgeLivesSeg'), bonusSegEl=$('forgeBonusSeg'); // 02.09.2026: те же два, что set() теперь игнорирует под «Высокой ставкой» — видно сразу, не только по бездействию тапа
  if(livesSegEl) livesSegEl.classList.toggle('locked',!!forgeCfg.hs);
  if(bonusSegEl) bonusSegEl.classList.toggle('locked',!!forgeCfg.hs);
  // 02.09.2026: forgeHSChip строится тем же forgeChipBuild(), что и forgeFlatChip — обоим
  // нужен вызов _sync() отсюда, иначе кнопка навсегда остаётся без подписи (владелец вживую:
  // «под кнопкой часто видно пустую кнопку»). Забыли добавить соседа в список — страж 147.
  ['forgeSeg','forgeLivesSeg','forgeWaveSeg','forgeBonusSeg','forgeFogSeg','forgeFlatChip','forgeHSChip'].forEach(function(id){
    const el=$(id); if(el&&el._sync) el._sync();
  });
  forgeSkyKick(); // небо перерисовывается на каждый поворот ручки
  if(typeof ptRender==='function'){ ptSelIdx=-1; ptRender(); if(typeof ptRenderRuler==='function') ptRenderRuler(); if(typeof ptSyncLenUI==='function') ptSyncLenUI(); if(typeof ptSyncColorUI==='function') ptSyncColorUI(); } // 01.09.2026: пресет/код друга сменил forgeCfg.sc/.l/.h1/.h2/.dens — лента и ползунки Партитуры должны это увидеть
  if(typeof ptSyncTrayAvailability==='function') ptSyncTrayAvailability(); // 02.09.2026: «Состав» мог включить/выключить вид — лоток стикеров должен это честно показать
}
function forgeOpen(){ forgeCfg=forgeSanitize(Store.get('forgeLast',null)||forgeCfg); forgeFill(); forgeSkyKick(); if(typeof ptFill==='function') ptFill();
  forgeTabSet('play'); workshopFillLabels(); workshopRenderList(); // 06.09.2026: «Играть/Создать» — вход всегда на «Играть», Мастерская больше не отдельный экран
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
  if(forgeTab==='play') workshopRenderList(); // список мог устареть, пока игрок был на «Создать»
  if(forgeTab==='create') forgeSubTabSet('arrange'); // 06.09.2026 «Переосмысление, часть 2»: вход в «Создать» всегда начинается с Расстановки
}
wireOnLocal('forgeTabPlayBtn','click',function(){ sfx.click(); haptic('light'); forgeTabSet('play'); });
wireOnLocal('forgeTabCreateBtn','click',function(){ sfx.click(); haptic('light'); forgeTabSet('create'); });

/* 06.09.2026 «Переосмысление, часть 2»: три саб-вкладки внутри «Создать» — тот же приём
   переключения, что у forgeTabSet() выше, просто на уровень ниже (Расстановка/Небо/Сложность
   вместо Играть/Создать). */
let forgeSub='arrange';
function forgeSubTabSet(s){
  forgeSub=(s==='sky')?'sky':(s==='hard')?'hard':'arrange';
  const arrangeBtn=$('forgeSubArrangeBtn'), skyBtn=$('forgeSubSkyBtn'), hardBtn=$('forgeSubHardBtn');
  if(arrangeBtn) arrangeBtn.classList.toggle('sel', forgeSub==='arrange');
  if(skyBtn) skyBtn.classList.toggle('sel', forgeSub==='sky');
  if(hardBtn) hardBtn.classList.toggle('sel', forgeSub==='hard');
  const arrangeEl=$('forgeSubArrange'), skyEl=$('forgeSubSky'), hardEl=$('forgeSubHard');
  if(arrangeEl) arrangeEl.classList.toggle('hidden', forgeSub!=='arrange');
  if(skyEl) skyEl.classList.toggle('hidden', forgeSub!=='sky');
  if(hardEl) hardEl.classList.toggle('hidden', forgeSub!=='hard');
}
wireOnLocal('forgeSubArrangeBtn','click',function(){ sfx.click(); haptic('light'); forgeSubTabSet('arrange'); });
wireOnLocal('forgeSubSkyBtn','click',function(){ sfx.click(); haptic('light'); forgeSubTabSet('sky'); });
wireOnLocal('forgeSubHardBtn','click',function(){ sfx.click(); haptic('light'); forgeSubTabSet('hard'); });

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
function mapAskPublish(code, name){
  if(typeof workshopSubmit!=='function') return;
  if(!forgeIsVerified(code)){ toast(L.forgeNeedRealRun||'Сначала пролети это небо по-настоящему — потом можно опубликовать','rgba(255,159,176,.5)'); return; }
  const msg=L.forgePublishConfirm||'Опубликовать это небо в Галерее — увидят все?';
  const go=()=>{ workshopSubmit(code, name).then(res=>{
    if(res && res.ok) toast(L.forgePublished||'Опубликовано в Галерее','rgba(255,215,106,.5)');
  }).catch(()=>{}); };
  if(tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, ok=>{ if(ok) go(); }); }
  else if(typeof confirm==='function'){ if(confirm(msg)) go(); }
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
  try{ window.open(shareUrl,'_blank'); }catch(e2){}
  haptic('success'); mapAskPublish(code, cfg.n);
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
function forgeWorkshopPlay(code){ // «Играть»: применить + честно засчитать «сыграли» + взлёт, тот же незачётный забег, что у любой чужой трассы
  if(!forgeWorkshopApply(code)){ toast(L.forgeBadCode,'rgba(255,159,176,.5)'); haptic('light'); return; }
  if(typeof workshopPlayed==='function') workshopPlayed(code);
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
   в избранное», зелёная точка на живом скрине под сердечком): 10 свободных ячеек, копируем
   только сами данные неба (h1/h2/густота/настроение/туман), не весь конфиг трассы — экран
   просмотра/выбора ячейки ещё не построен, это отдельная задача. */
const FORGE_FAV_MAX=10;
function forgeFavSave(cfg, name, btn){
  const list=Store.get('skyFavorites')||[];
  if(list.length>=FORGE_FAV_MAX){ toast(L.workshopFavFull||'Избранное заполнено (10 из 10)','rgba(255,159,176,.5)'); return; }
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
function mapOver(sc){
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
  if(statsEl) statsEl.innerHTML='<div class="bestPills rise" style="animation-delay:200ms"><span class="miniPill">'+ic('plane')+(S.customName||L.forgeDefName)+'</span>'+winPill+'</div>';
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
  forgeCfg=forgeSanitize({});
  forgeSyncWidgets(); Store.set('forgeLast',forgeCfg);
  toast(L.forgeReset||'Сброшено','rgba(160,210,255,.5)'); haptic('light');
}

/* ---------- 05.09.2026 «Мастерская»: экран-витрина — подписи, сортировка, список ---------- */
let workshopSortMode='new';
// 08.09.2026 (владелец, живой скрин): «Мои» убрано из верхнего ряда — фильтр только своих
// небес нужен исключительно авторам, а занимал место у всех подряд (переезжает во вкладку
// «Создать», отдельной задачей). На его место — «Закреплённые» (sort='pinned', см. правку
// cosmogram-workshop Edge Function того же дня): единственная из четырёх, что НЕ дублирует
// остальные — pinned и так уже всегда наверху у new/top/plays, тут это единственное, что видно.
// workshopSortMode/сама логика 'mine' в workshopRenderList() ниже не тронуты — понадобятся
// будущей кнопке в «Создать», просто больше не в этом списке чипов.
const WORKSHOP_SORTS=['new','top','plays','pinned'];
function workshopFillLabels(){ // тот же приём, что forgeFill() выше — вызывается из applyLang (ui.js)
  if(typeof L==='undefined'||!L.workshopEmpty) return;
  const LBL=[['workshopEmpty',L.workshopEmpty]]; // 06.09.2026: forgeWorkshopBtn убран вместе с отдельным экраном — Галерея теперь вкладка «Играть»; 08.09.2026: workshopSub убран целиком (см. i18n.js); заголовок workshopTitle убран целиком следом (лишняя надпись без функции)
  for(const pair of LBL){ const el=$(pair[0]); if(el) el.textContent=pair[1]; }
  const sortEl=$('workshopSort');
  if(sortEl && sortEl.children.length!==WORKSHOP_SORTS.length){
    sortEl.innerHTML='';
    WORKSHOP_SORTS.forEach(function(s){
      const b=document.createElement('button'); b.className='forgeChip';
      b.addEventListener('click', function(){ workshopSortMode=s; workshopFillLabels(); workshopRenderList(); sfx.click(); haptic('light'); }); // 07.09.2026: было без workshopFillLabels() — режим менялся честно, но подсветка .sel навсегда оставалась на «Новые» (владелец, живой скрин)
      sortEl.appendChild(b);
    });
  }
  if(sortEl) WORKSHOP_SORTS.forEach(function(s,i){
    sortEl.children[i].textContent = L['workshopSort_'+s] || s;
    sortEl.children[i].classList.toggle('sel', s===workshopSortMode);
  });
}
function workshopMyVotes(){ return saneArray(Store.get('workshopMyVotes',[]),[]); }
function workshopRenderList(){
  const listEl=$('workshopList'), emptyEl=$('workshopEmpty');
  if(!listEl) return;
  if(workshopSortMode==='mine' && !syncAvailable()){
    listEl.innerHTML=''; if(emptyEl){ emptyEl.classList.remove('hidden'); emptyEl.textContent=L.workshopSignInFirst||L.workshopEmpty; }
    return;
  }
  listEl.innerHTML='<div class="hint" style="text-align:center">…</div>';
  const requestedSort=workshopSortMode; // 05.09.2026: защита от гонки — быстрый тап по двум чипам подряд не должен дать ответу первого перезаписать второй
  workshopList(requestedSort).then(function(res){
    if(requestedSort!==workshopSortMode) return; // пока летал запрос, игрок уже переключил сортировку — этот ответ больше не актуален
    const tracks=(res && res.ok && Array.isArray(res.tracks)) ? res.tracks : [];
    if(!tracks.length){ listEl.innerHTML=''; if(emptyEl){ emptyEl.classList.remove('hidden'); if(L.workshopEmpty) emptyEl.textContent=L.workshopEmpty; } return; }
    if(emptyEl) emptyEl.classList.add('hidden');
    const mine=workshopMyVotes();
    // 05.09.2026: isOwner решает сервер (настоящий Telegram id, не клиентский флаг) — здесь только
    // рендерим или не рендерим кнопки закрепить/скрыть по его ответу.
    const isOwner = !!(res && res.isOwner);
    const myId = (typeof syncMyId==='function') ? syncMyId() : null; // 08.09.2026: «это моё небо» — отдельно от «я модератор»
    // 08.09.2026 «Превью — главное» (владелец, живой макет, несколько заходов): превью
    // неба — широкий баннер сверху, имя/сыграно лежат поверх затемнением снизу. Лайк —
    // крупный значок в левом углу баннера, светится при лайке. Редкие действия
    // (Пожаловаться/Закрепить/Скрыть) — за «⋯» в правом углу, не видны, пока не нужны.
    // Играть переименован в «В полёт», без иконки, стоит парой с «Изменить» тем же стилем.
    listEl.innerHTML=tracks.map(function(t){
      const own = !!(myId && t.author_id===myId); // 08.09.2026: «это моё небо», отдельно от «я модератор»
      const canReport = !own; // нельзя пожаловаться на своё же
      return '<div class="wRow">'+
      '<div class="wBanner"><canvas width="300" height="150"></canvas><div class="wScrim"></div>'+
      // 08.09.2026 (владелец, живой скрин, поправка): «избранное» сперва встало под сердечком,
      // владелец поправил — «в один ряд с лайк, а не под него». Один общий ряд слева (wLeftRow).
      // Клик по звезде — сразу в первый свободный слот (экран из 10 ячеек ещё не построен).
      '<div class="wLeftRow">'+
      '<button class="wVote" data-act="vote"><svg class="ic" viewBox="0 0 24 24"><path d="M12 20.2c-.3 0-.6-.1-.8-.3C7.6 16.8 4 13.6 4 9.9 4 7.2 6.1 5 8.7 5c1.4 0 2.7.6 3.3 1.7C12.6 5.6 13.9 5 15.3 5 17.9 5 20 7.2 20 9.9c0 3.7-3.6 6.9-7.2 10-.2.2-.5.3-.8.3z"></path></svg><span data-role="hearts"></span></button>'+
      // 08.09.2026 (владелец, живой скрин): «звезда путает, учитывая что это связано с цветом» —
      // звезда заменена на двухцветный кружок (макет A/Б/В, владелец выбрал В) — читается как
      // «образец цвета», не как обычная звезда-избранное. Пипетка (Б) отклонена — на 26px похожа
      // на карандаш «Изменить», путает с соседней кнопкой.
      '<button class="wCorner" data-act="fav" title="В избранное"><svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"></circle><path d="M12 3a9 9 0 0 1 0 18z" fill="#ffd66a"></path></svg></button>'+
      '</div>'+
      '<div class="wCornerRow">'+
      (canReport ? '<button class="wCorner wCornerDanger" data-act="report" title="Пожаловаться"><svg class="ic" viewBox="0 0 24 24"><path d="M12 2.5 22.5 20.5H1.5Z" stroke-linejoin="round"></path><rect x="10.7" y="9.2" width="2.6" height="6" rx="1.3"></rect><rect x="10.7" y="16.6" width="2.6" height="2.4" rx="1.2"></rect></svg></button>' : '')+
      // 08.09.2026 (владелец, живой макет): «не вижу причин им быть под кнопкой ⋯, можно
      // без лишнего клика» — Закрепить/Скрыть тоже открытые значки в углу, залитые как
      // жалоба, «⋯»/скрывающий wModRow убраны совсем.
      (isOwner ? '<button class="wCorner wPin" data-act="pin" title="Закрепить"><svg class="ic" viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0-6.5 6.5C5.5 14 12 21 12 21s6.5-7 6.5-11.5A6.5 6.5 0 0 0 12 3z"></path><circle cx="12" cy="9.3" r="2.3" fill="#0b1626"></circle></svg></button>'+
      '<button class="wCorner wHide" data-act="hide" title="Скрыть"><svg class="ic" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"></path><circle cx="12" cy="12" r="2.6" fill="#0b1626"></circle></svg></button>' : '')+
      '</div>'+
      '<div class="wBannerText"><div class="wPlaysHint" data-role="plays"></div><div class="wAuthorHint" data-role="author"></div>'+
      '<div class="wName"></div><div class="wStickerRow" data-role="stickers"></div></div></div>'+
      '<div class="wActionRow"><button class="btn ghost" data-act="play"></button><button class="btn ghost" data-act="edit"></button></div>'+
      '</div>'; }).join('');
    tracks.forEach(function(t,i){
      const row=listEl.children[i]; row.dataset.code=t.code;
      const status=t.status||'normal'; row.dataset.status=status;
      const cfg=forgeDecode(t.code);
      if(cfg) forgeMiniSwatchPaint(row.querySelector('canvas'), cfg);
      row.querySelector('.wName').textContent=t.name||L.forgeDefName||'';
      row.querySelector('.wAuthorHint').textContent=(L.workshopAuthor?L.workshopAuthor(t.author_name||''):'Создал: '+(t.author_name||''));
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
      row.querySelector('[data-role="hearts"]').textContent=String(t.hearts||0);
      row.querySelector('.wVote').classList.toggle('voted', voted); // заливка сердца — CSS (.wVote.voted .ic)
      row.querySelector('[data-role="plays"]').textContent=(L.workshopPlays?L.workshopPlays(t.plays||0):'Сыграно: '+(t.plays||0));
      row.querySelector('[data-act="play"]').textContent=L.workshopPlay||'В полёт';
      row.querySelector('[data-act="edit"]').textContent=L.workshopEdit||'Изменить';
      const reportBtn=row.querySelector('[data-act="report"]'); if(reportBtn) reportBtn.title=L.workshopReport||'Пожаловаться'; // 08.09.2026: значок без подписи (владелец), title остаётся для доступности
      const favBtn=row.querySelector('[data-act="fav"]'); if(favBtn) favBtn.title=L.workshopFav||'В избранное';
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
  const act=e.target.closest('[data-act]'); if(!act) return;
  if(act.dataset.act==='play'){ forgeWorkshopPlay(code); return; } // forgePlay()→startGame() сам переключит экран на 'game'
  if(act.dataset.act==='edit'){ forgeWorkshopEdit(code); forgeTabSet('create'); return; } // 06.09.2026: уже на экране Конструктора — переключаем вкладку, не экран
  if(act.dataset.act==='vote'){
    workshopVote(code).then(function(res){
      if(!res || !res.ok) return;
      const mine=workshopMyVotes(); const idx=mine.indexOf(code);
      if(res.hearted && idx<0) mine.push(code); else if(!res.hearted && idx>=0) mine.splice(idx,1);
      Store.set('workshopMyVotes',mine);
      act.classList.toggle('voted', res.hearted); // заливка сердца — CSS
      const heartsEl=row.querySelector('[data-role="hearts"]'); if(heartsEl) heartsEl.textContent=String(res.hearts||0);
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
  if(act.dataset.act==='pin'){
    // 05.09.2026: один статус на трассу — закрепить снимает «скрыто», если было; сервер
    // всё равно проверяет OWNER_ID сам, кнопка здесь лишь скрыта для остальных игроков.
    const next = row.dataset.status==='pinned' ? 'normal' : 'pinned';
    workshopModerate(code, next).then(function(res){
      if(!res || !res.ok) return;
      row.dataset.status=next;
      act.classList.toggle('active', next==='pinned'); // заливка булавки — CSS
      // 07.09.2026, владелец («не понятно что произошло после нажатия»): смена эмодзи одна,
      // без слов, легко пропустить — добавлен тот же тост, что уже есть у report.
      toast(next==='pinned' ? (L.workshopPinned||'Закреплено') : (L.workshopUnpinned||'Откреплено'), 'rgba(255,214,140,.5)');
    });
    haptic('light');
  }
  if(act.dataset.act==='hide'){
    const next = row.dataset.status==='hidden' ? 'normal' : 'hidden';
    workshopModerate(code, next).then(function(res){
      if(!res || !res.ok) return;
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
wireOnLocal('forgeResetBtn', 'click', forgeResetAll);
wireOnLocal('forgeBack', 'click', function(){ sfx.click(); setScreen('menu'); }); // 08.09.2026 (владелец, живой баг): вело в 'modes' (Соревнования) — хвост с 05.09.2026, когда кнопка Конструктора переехала с modeForge (внутри Соревнований) на главное меню, а «Назад» тогда забыли поправить. Единственный реальный вход теперь — konstruktorBtn с главного меню (проверено: «Открыть в Конструкторе» из Галереи — не отдельный вход, а переключение вкладки на уже открытом экране).
/* v1.282.13: тонкие ручки пишутся в конфиг, как «Жар» строкой выше по файлу. Раньше они
   меняли только подпись — конфиг оставался прежним, и первый же forgeSyncWidgets (любой
   другой виджет, пресет, смена языка) возвращал слайдер на старое значение: правка автора
   молча пропадала, а живое мини-небо на неё вообще не отзывалось. Здесь намеренно НЕ зовём
   forgeSyncWidgets — он переписал бы value прямо под пальцем; хватает подписи и неба. */
wireOnLocal('forgeDen', 'input', function(){ forgeCfg.d=+this.value; const v=$('forgeDenV'); if(v) v.textContent=this.value; forgeSkyKick(); });
wireOnLocal('forgeSpd', 'input', function(){ forgeCfg.s=+this.value; const v=$('forgeSpdV'); if(v) v.textContent=this.value; forgeSkyKick(); });
wireOnLocal('forgeWind', 'input', function(){ forgeCfg.wind=+this.value; const v=$('forgeWindV'); if(v) v.textContent=this.value; }); // 06.09.2026 «Солнечный ветер» — не трогает превью неба, чисто игровая физика
// v1.282.14: имя трассы попадает в конфиг по мере набора. Санацию оставляем на forgeReadForm
// и forgeSanitize — резать текст прямо под пальцем нельзя, курсор прыгает.
wireOnLocal('forgeName', 'input', function(){ forgeCfg.n=this.value; });
