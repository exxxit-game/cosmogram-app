'use strict';
/* ============================================================
   ПАРТИТУРА (часть «Конструктора», 01.09.2026) — точная расстановка
   событий по дистанции: точки на ленте, стикеры пауза/заметка/8 видов
   препятствий, перетаскивание, список с секундами до каждой точки.
   Источник — macet-31-08-kuznica-partitura.html («Кузница целиком»,
   владелец подтвердил как цель). Первый заход — только UI и запись
   в forgeCfg.sc (схема уже есть в forge.js, никакой новой правки
   формата). Игровой эффект (game.js честно выполняет pause/kind) —
   отдельный следующий шаг, здесь не трогаем.
   Зависит от core.js ($, sfx, haptic), forge.js (forgeCfg, FORGE_KINDS,
   forgeSyncWidgets — куда добавлен один вызов ptRender()).
   ============================================================ */

const PT_KIND_LABEL={rock:'Астероид',debris:'Обломок',drift:'Дрейфер',mine:'Мина',sat:'Спутник',comet:'Комета',seeker:'Ловец',gate:'Ворота'}; // сверено с js/i18n.js: fkRock..fkGate
/* 17.09.2026 (владелец, живой разговор): у Астероида/Кометы почти один и тот же оранжевый
   (реально измерено: rock hue≈33°, comet hue≈25° — 8° разницы) и у Передышки/Обломка не только
   один синий, но ещё и похожие иконки (две полосы, просто повёрнутые) — то же синее семейство у
   Обломка/Спутника тоже. Тот же приём, что уже применён к mine/seeker 08.09.2026 (развести по
   кругу, не подбирать на глаз): rock — нейтральный камень (не спорит по тону ни с чем), debris —
   зелёный (было синим, конфликтовало с Передышкой и Спутником). comet/mine/seeker/gate/drift не
   трогаю — они и так не путаются ни с кем. Пары «Передышка»/«Заметка» (index.html, не тут — их
   цвет отдельный, роль не «преграда») сдвинуты тем же заходом. */
// 20.09.2026 (владелец, живой разговор): «не вижу смысла, чтобы обломок был зелёного цвета» —
// зелёный в игре везде читается «безопасно/растёт», не подходит опасности по смыслу. Своп с
// Передышкой буквально его же словами: «передышке цвет как у обломка, обломку — её цвет» — оба
// значения уже были в игре (index.html .sticker.pause), просто меняются местами, не выдуманы.
const PT_KIND_COLOR={rock:'#9c8a72',debris:'#8fd9c4',drift:'#b073ea',mine:'#ff5f6d',sat:'#4f7fe6',comet:'#ff9a52',seeker:'#ffe14a',gate:'#22b8dd'}; // seeker сверен с render.js (08.09.2026: ярко-жёлтый вместо янтарного)
const PT_ICON_SVG={
  pause:'<svg viewBox="0 0 24 24" width="22" height="22"><rect x="6.5" y="4" width="4" height="16" rx="1.5" fill="currentColor"/><rect x="13.5" y="4" width="4" height="16" rx="1.5" fill="currentColor"/></svg>',
  marker:'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 21l1.2-5.6L15.6 3.9a1.6 1.6 0 0 1 2.3 0l2.2 2.2a1.6 1.6 0 0 1 0 2.3L8.6 19.8 3 21z" fill="currentColor"/></svg>',
  rock:'<svg viewBox="0 0 24 24" width="22" height="22"><polygon points="12,2.5 18,6.5 20.5,13 16,20 8,19.5 3.5,13.5 5.5,6" fill="currentColor"/></svg>',
  // 17.09.2026 (владелец, живой разговор + реальный скрин полёта): было два неверных захода на
  // глаз (сперва «камни-осколки», потом «плита с трещиной»), пока владелец не прислал живой скрин
  // самого полёта — там обломок реально виден: светлый/серебристый вытянутый КАПСУЛОВИДНЫЙ
  // предмет (полностью скруглённые торцы), не плита. Сверено с кодом отдельно: это ровно
  // bakeDebrisSprite() skin=3 «бак» (rr(x,-hw,-hh,o.w,o.h,hh) — радиус скругления = половина
  // высоты = полное скругление торцов, буквально капсула). Две поперечные риски — тот же приём,
  // что у скина «бак» в render.js (внутренние линии-перегородки). */
  debris:'<svg viewBox="0 0 24 24" width="22" height="22"><g transform="rotate(-18 12 12)"><rect x="3" y="9" width="18" height="6" rx="3" fill="currentColor"/><line x1="9" y1="9" x2="9" y2="15" stroke="rgba(20,28,52,.35)" stroke-width="1"/><line x1="15" y1="9" x2="15" y2="15" stroke="rgba(20,28,52,.35)" stroke-width="1"/></g></svg>',
  drift:'<svg viewBox="0 0 24 24" width="22" height="22"><polygon points="2,12 7,5.5 17,5 22,12 16,19 6,18.5" fill="currentColor"/></svg>',
  // 20.09.2026 (владелец, повторил трижды подряд, живой скрин панели фильтра Мастерской):
  // у «Ловца» два тёмных КВАДРАТИКА внутри тела читаются как глаза, у «Ворот» два круглых
  // пилона тоже читаются как глаза (владелец сам это заметил и указал) — мине владелец явно
  // попросил КРУГЛЫЕ глаза, не квадратные, «разделять их», не повторять форму ловца один в один.
  // 20.09.2026, продолжение (тот же живой отчёт): на лотке (крупный размер) глаза читаются
  // хорошо, но в фильтре Мастерской (16px) те же самые r=1.3 глаза почти теряются среди
  // шипов — не другой SVG, тот же самый, просто относительно мелкая деталь на маленьком
  // размере. Увеличены (r 1.3→1.7, разведены чуть шире, чтобы не слиться) — тот же приём,
  // что уже дал «Воротам» читаемые глаза при этом фиксе (см. gate ниже).
  mine:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="6" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="12" x2="22" y2="12"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="7.8" y1="16.2" x2="4.9" y2="19.1"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="7.8" y1="7.8" x2="4.9" y2="4.9"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/></g><circle cx="9.9" cy="11.5" r="1.7" fill="#2a2230"/><circle cx="14.1" cy="11.5" r="1.7" fill="#2a2230"/></svg>',
  sat:'<svg viewBox="0 0 24 24" width="22" height="22"><rect x="10" y="9.5" width="4" height="5" rx="1" fill="currentColor"/><rect x="1.5" y="8.5" width="6" height="7" rx="1.3" fill="currentColor" opacity=".85"/><rect x="16.5" y="8.5" width="6" height="7" rx="1.3" fill="currentColor" opacity=".85"/><line x1="7.5" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.6"/><line x1="14" y1="12" x2="16.5" y2="12" stroke="currentColor" stroke-width="1.6"/></svg>',
  comet:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="16" cy="8" r="3.4" fill="currentColor"/><path d="M14 10.2C10 12 5.5 15 2 21c5.5-2.6 9.5-5.3 12.6-9.4z" fill="currentColor" opacity=".55"/></svg>',
  // 17.09.2026 (владелец: «проверь каждую по факту»): было 3 концентрических кольца-мишень —
  // в полёте (render.js, ветка mine/seeker) ловец физически та же колючая сфера, что мина, просто
  // квадратные «глаза» вместо круглых, тупые шипы-штрихи вместо острых треугольных, плюс тонкое
  // внешнее кольцо-прицел (o.r+11). Иконка теперь повторяет ЭТУ форму, не отдельную мишень.
  // 20.09.2026: тот же фикс легибости, что у mine выше — квадратные глаза увеличены
  // (2.4×2.4 → 3.2×3.2), центры не сдвинуты, чтобы не задеть уже проверенное позиционирование
  // относительно колец/шипов.
  seeker:'<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="12" cy="12" r="6.3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.6"><line x1="12" y1="2.7" x2="12" y2="5.3"/><line x1="12" y1="18.7" x2="12" y2="21.3"/><line x1="2.7" y1="12" x2="5.3" y2="12"/><line x1="18.7" y1="12" x2="21.3" y2="12"/><line x1="5.6" y1="5.6" x2="7.4" y2="7.4"/><line x1="16.6" y1="16.6" x2="18.4" y2="18.4"/><line x1="18.4" y1="5.6" x2="16.6" y2="7.4"/><line x1="7.4" y1="16.6" x2="5.6" y2="18.4"/></g><rect x="8.6" y="9.9" width="3.2" height="3.2" fill="#2a2230"/><rect x="12.2" y="9.9" width="3.2" height="3.2" fill="#2a2230"/></svg>',
  // 20.09.2026 (владелец, живой отчёт, дважды подряд, скрин реальной игры): «Ворота» тоже
  // должны читаться как глаза (сам пилон = один зрачок), но иконка была ПОЛОЙ обводкой
  // (fill:none) — вместо глаза просто «синее заходит», ни тела, ни зрачка. Сверено с реальным
  // полётом (render.js:3407-3421, drawObstacle ветка 'gate'): там пилон — ЗАЛИТЫЙ круг
  // (fillStyle='#3d5a80') с блеском-радужкой и мигающим тёмным зрачком, «тот же язык, что уже
  // у Мины/Ловца» (комментарий 17.09.2026 в самом render.js). Иконка теперь повторяет эту
  // форму: залитое тело пилона + тёмный зрачок (#2a2230 — тот же цвет глаз, что у mine/seeker
  // выше, не новый), не выдумано заново.
  gate:'<svg viewBox="0 0 24 24" width="22" height="22"><line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="5" cy="12" r="4.2" fill="currentColor"/><circle cx="19" cy="12" r="4.2" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="#2a2230"/><circle cx="19" cy="12" r="1.6" fill="#2a2230"/></svg>'
};
/* 20.09.2026 (владелец, живой разговор + макет konstruktor-karta-tochechnaya-komfort-20-09-2026.html):
   «вес» значков в лотке (canvas ink%, живой замер на #ptTray) плясал 13.4%-41.2% при одинаковом
   42px боксе — та же ловушка, что вчера была с кубиком в Мастерской: одинаковая рамка, разный
   визуальный вес значка внутри. Множители к среднему ≈26% — только для мест с ЭТИМ конкретным
   размером (лоток 42px/60% и «Преграды» Точечной настройки 22px, тот же относительный масштаб
   значка внутри своего кружка); НЕ трогает PT_ICON_SVG сам по себе — фильтр Мастерской
   (.wFilterObChip, 16px/100%, уже проверен и исправлен отдельно 20.09.2026 раньше вечером) и
   свотчи «Точечная настройка»/список событий (партитура) рисуют значок в другой относительной
   пропорции контейнера — тот же множитель там дал бы новый перекос, не решение. */
const PT_ICON_WEIGHT_SCALE={pause:1.08,marker:1.07,rock:.84,debris:1.19,drift:.85,mine:.85,sat:1.13,comet:1.39,seeker:.79,gate:1.02};
const PT_MAX=150; // 09.09.2026 (владелец): было 50, поднято по прямой просьбе
let ptSelIdx=-1;

/* 01.09.2026 «Настроение неба» — гармония и случайное небо. Источник: обычный поворот круга
   (180°/120°/30°) даёт столкновения в некоторых зонах оттенка (владелец поймал живьём: красный+
   зелёный читается как «ёлочная гирлянда», зелёный+пурпур — как «гниль») — вместо формулы 18
   пар подобраны и проверены глазами (macet-01-09-nastroenie-neba.html), «Случайное небо» и
   авто-гармония берут пары только отсюда, не вычисляют угол.
   08.09.2026 «Витрина, а не повтор» (владелец, живой скрин 8 пресетов с одинаковым фоном):
   из исходных 18 половина толкалась в одной сине-фиолетовой зоне (посчитано скриптом —
   расстояние между парами по обеим осям оттенка, с учётом переворота), зелёных/жёлтых не
   было вообще ни одной. Владелец прямо попросил не держаться числа 18, «сколько реально
   можно, но пусть будут полностью разные» — три захода подряд ловил у меня повторы (одна и
   та же зелёная/фиолетовая зона под разными числами), поймано его собственным глазом на
   присланных скринах, не моим. Финальный список привязан к его же референсу Material
   Design (реальные HEX 17 названных семейств, не мои цифры) — но при проверке выяснилось,
   что сама формула настроения/яркости (moodSL) сжимает часть соседних семейств Material
   (весь тёплый угол amber/orange/deepOrange/brown/lime/yellow) в одно и то же оливковое
   пятно — держаться всех 17 бессмысленно. Итог — 8, каждая пара по отдельности проверена
   глазами на реальных карточках (render_final_pairs, 08.09.2026), не только по числам. */
const PT_SAFE_PAIRS=[
  [0,40],[36,76],[78,118],[122,162],[180,220],[216,256],[291,331],[324,4],
];
function ptHueDist(a,b){ const d=Math.abs(a-b)%360; return d>180?360-d:d; }
let ptH2Touched=false; // сброшен при каждом открытии экрана — авто-гармония работает, пока автор сам не тронул второй цвет
function ptAutoHarmonize(h1){
  let best=null,bestD=1e9;
  PT_SAFE_PAIRS.forEach(function(p){
    const d0=ptHueDist(h1,p[0]); if(d0<bestD){ bestD=d0; best=p[1]; }
    const d1=ptHueDist(h1,p[1]); if(d1<bestD){ bestD=d1; best=p[0]; }
  });
  return best===null?h1:best;
}
function ptRandomSky(){
  const p=PT_SAFE_PAIRS[Math.floor(Math.random()*PT_SAFE_PAIRS.length)];
  const flip=Math.random()<0.5;
  forgeCfg.h1=flip?p[0]:p[1]; forgeCfg.h2=flip?p[1]:p[0];
  forgeCfg.mood=20+Math.floor(Math.random()*60); // те же безопасные границы, что в макете — не полные 0/100
  ptH2Touched=true; // случайная пара уже согласована сама с собой — авто-гармония не должна её тут же переписать
  ptSyncColorUI();
  if(typeof forgeSkyKick==='function') forgeSkyKick();
  sfx.click(); haptic('medium');
}

function ptPins(){ if(!forgeCfg.sc) forgeCfg.sc=[]; return forgeCfg.sc; }
function ptLen(){ return forgeCfg.l>0?forgeCfg.l:5000; } // «бесконечная» (l=0) — лента размечена под условную длину, точки всё равно ставятся в метрах

function ptRenderRuler(){
  const ruler=$('ptRuler'); if(!ruler) return; ruler.innerHTML='';
  const len=ptLen(), steps=4;
  for(let i=0;i<=steps;i++){
    const s=document.createElement('span');
    s.textContent=Math.round(len*i/steps)+(L.unitM||'м');
    ruler.appendChild(s);
  }
}
function ptXToAt(track,clientX){
  const r=track.getBoundingClientRect();
  const p=Math.max(0,Math.min(1,(clientX-r.left)/r.width));
  return Math.round(p*ptLen()/5)*5;
}
/* 16.09.2026 (живой скрин с телефона, поймано сразу же после увеличения ленты до 130px):
   точка у самого начала трассы (at≈0) рисовалась центром ровно в left:0 — при мелких пинах
   (16px, была лента 60px) это едва задевало угловые кнопки, но при новых крупных (до 52px)
   пин целиком наезжал на «7»/«Отменить», цифра тонула под ним. ТОЛЬКО для отрисовки самой
   точки/подписи (не для перетаскивания/тапа — те свою математику берут из ptXToAt, реальных
   пиксельных координат пальца, эту функцию не трогаем, чтобы не разъехалось «куда тащу» vs
   «куда встало»).
   17.09.2026 (владелец, живой скрин с телефона, второй заход того же вечера: «стикеры прям
   очень большие, не соответствует одно другому» + перегруженная лента с наездами точек друг
   на друга): 52px пинов при 92/58 резерве почти не оставляли места для самих точек — умерил
   пины до 36px максимум (см. ptPinSizeFor ниже), резерв сузился следом до 84/52 (минимум,
   при котором даже самый крупный 36px пин не касается кнопок, проверено verify-track-moderate.mjs).
   17.09.2026 (владелец, повторно: «комфорт почти не вижу» — угловые кнопки подняты 26px→36px,
   index.html): первый пересчёт (104/62) не учёл радиус САМОЙ точки (до 18px у крупного 36px
   пина) — точка садится ЦЕНТРОМ на границе безопасной зоны, край точки уходит на pinRadius
   дальше кнопки. Проверено вживую (getBoundingClientRect в браузере): при 104/62 зазор
   оказался 2px, не ~20px, как задумано. 122=84(правый край левого кластера)+20(запас)+18
   (радиус крупного пина); 80=42(правый кластер)+20(запас)+18(тот же радиус). */
function ptAtToPctSafe(at){
  const L=122,R=80; const p=at/ptLen(); // 0..1
  return 'calc('+L+'px + (100% - '+(L+R)+'px) * '+p.toFixed(4)+')';
}
function ptClampAt(v){ return Math.max(0,Math.min(ptLen(),v)); }
function ptOverRect(x,y,el){ const r=el.getBoundingClientRect(); return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom; }
/* 10.09.2026 (владелец, живой скрин: стикеры вылезают за трассу сверху/снизу, и сами
   крупные для нового окна) — трасса (.track) стала вдвое ниже 09.09→10.09 (120px→60px,
   см. index.html:1866), а размеры стикеров/шаг между рядами остались старые — 3-рядный
   стек, рассчитанный под 120px, физически не помещался в 60px. Тот же множитель ×0.5,
   что уже применён к высоте трассы, доведён до конца: и сами стикеры, и ROW_H.
   16.09.2026 (владелец, макет konstruktor-fundament-16-09-2026.html, «Да»): трасса выросла
   до 130px — того же стандарта, что держит вся игра (heroCard/#angarSky/.wBanner).
   17.09.2026, тем же вечером (владелец, живой скрин: «стикеры прям очень большие... не
   соответствует одно другому», плюс жалоба на пустоту внизу окна): рост трассы НЕ обязан
   тянуть пины на тот же множитель — умерены до более скромных 36/30/24/20 (были 52/43/35/28),
   ближе по духу к размеру самих угловых кнопок (26px), чем к высоте всего окна. Численно
   проверено (verify-track-moderate.mjs) — все 4 размера × 3 ряда укладываются в [0,130]. */
function ptPinSizeFor(n){ if(n<=10) return 36; if(n<=20) return 30; if(n<=35) return 24; return 20; }
/* 17.09.2026 (владелец, живой скрин: «в окне снизу пустота, доставать должно до конца»):
   раньше ряд 0 (обычный случай — точки не сбились в кучу) сидел смещённым к ВЕРХУ окна,
   потому что база (pinTop) заранее резервировала место под ряды 1-2 ВНИЗ от себя — если
   рядов 1-2 не было (обычное дело), нижняя половина 130px окна честно пустовала. Теперь
   ряды раскладываются СИММЕТРИЧНО вокруг центра (0, -ROW_H, +ROW_H вместо 0,+ROW_H,+2·ROW_H) —
   обычный случай (только ряд 0) сам приходится точно на середину окна, использует его, а не
   жмётся кверху. ROW_H 30→22 (пины и сами умерены, см. ptPinSizeFor выше). */
const PT_ROW_OFFSETS=[0,-22,22];
/* 17.09.2026 (владелец, живой разговор: «нужно тестировать в самых худших условиях» — прогнал
   35 точек вперемешку, не 1-7, как весь вечер до этого): старый ptSpreadOffsets был скользящим
   счётчиком «streak», не настоящей группировкой — при плотной трассе (много точек ближе THRESH
   друг к другу подряд, не только пары-тройки) он крутил те же 3 offset'а по кругу для ДЕСЯТКОВ
   точек одновременно, они садились друг на друга и по горизонтали тоже (offset решает только
   вертикальный ряд, не расстояние по X). Настоящая группировка — ниже, ptComputeClusters:
   честные цепочки соседей ближе THRESH. Дальше в ptRenderPins() группа ≤3 точек — как раньше
   (по одной, 3 ряда), группа >3 — один маркер «+N», тап открывает список точек (тот же путь,
   что «Список точек», не новый экран). */
const PT_CLUSTER_ROW_MAX=PT_ROW_OFFSETS.length; // 3 — столько отдельных точек ряды ещё тянут не наезжая
function ptComputeClusters(pins){
  const sorted=pins.map((p,i)=>({i,at:p.at})).sort((a,b)=>a.at-b.at);
  const THRESH=ptLen()*0.035;
  const clusters=[]; let cur=[];
  for(let k=0;k<sorted.length;k++){
    if(k>0 && sorted[k].at-sorted[k-1].at<THRESH) cur.push(sorted[k].i);
    else { if(cur.length) clusters.push(cur); cur=[sorted[k].i]; }
  }
  if(cur.length) clusters.push(cur);
  return clusters;
}
function ptSpreadOffsets(pins){
  const offs=new Array(pins.length).fill(0);
  ptComputeClusters(pins).forEach(function(idxs){
    if(idxs.length>PT_CLUSTER_ROW_MAX) return; // схлопнутая группа — свой маркер, не индивидуальные offset'ы
    idxs.forEach(function(idx,pos){ offs[idx]=PT_ROW_OFFSETS[pos%PT_CLUSTER_ROW_MAX]; });
  });
  return offs;
}
function ptPinName(p){ return p.type==='pause'?'передышку':p.type==='marker'?'заметку':(PT_KIND_LABEL[FORGE_KINDS[p.kind]]||'').toLowerCase(); }

let ptToastTimer=null;
/* 14.09.2026 (владелец, живой скрин с кружком — «эта кнопка теперь лишняя»): у Тюнинга
   (angarUnwear, js/ui.js) «Снять» уже само по себе кнопка прямо на плитке — кнопка «вернуть»
   в тосте там дублировала то, что и так под рукой, снята тогда же.
   22.09.2026 (владелец, живой скрин Конструктора с обводкой — «одно и то же, дублируется
   просто функция»): та же самая причина добралась и сюда. Персистентная ptUndoBtn («4»/↺
   наверху) с 16-17.09.2026 уже делает РОВНО то же самое, что кнопка «вернуть» в тосте —
   обе снимают вершину ОДНОГО и того же ptUndoStack (см. комментарий у него ниже: «его revert
   всегда совпадает с вершиной стека»). Кнопка в тосте моргает и пропадает через 3с, ptUndoBtn
   всегда на виду — оставлена она, из тоста убрана, второй кнопки для того же действия
   больше нет. Второй параметр (undoFn) убран из сигнатуры целиком — он был нужен ТОЛЬКО
   кнопке, которой больше нет; вызывающий код по-прежнему сам зовёт ptSetUndo(revert)
   отдельно, тосту эта функция больше не нужна вообще. */
function ptShowToast(text){
  let t=document.querySelector('.ptToast');
  if(!t){ t=document.createElement('div'); t.className='ptToast';
    t.innerHTML='<span class="ptToastTxt"></span>';
    (document.getElementById('uiScaleRoot')||document.body).appendChild(t); } // 09.09.2026 «Размер текста»: внутрь масштабируемой обёртки, не мимо неё
  t.querySelector('.ptToastTxt').textContent=text;
  // 20.09.2026 (владелец, видео с реального телефона): тост садился прямо на панель точки
  // (#ptQuickEdit) — оба position:fixed снизу экрана, тост (z-index 40) частично тонул под
  // панелью (z-index 41), «Вернуть» перекрывал число метров панели. Тост теперь встаёт НАД
  // панелью, когда она открыта — считаем её реальную высоту, не гадаем числом.
  const qe=document.getElementById('ptQuickEdit');
  const qeVisible=qe && qe.classList.contains('show');
  t.style.bottom = qeVisible ? (qe.getBoundingClientRect().height+12)+'px' : '';
  t.classList.add('show');
  clearTimeout(ptToastTimer);
  ptToastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}

/* 16.09.2026 (владелец, макет konstruktor-sozdat-redizayn-16-09-2026.html, «Дальше», диагноз §7)
   → 17.09.2026 (владелец, «Делай», макет konstruktor-karta-nebo-komfort-17-09-2026.html):
   был один шаг назад — между «отменить последнее» и «Сбросить всё» (ядерная кнопка) не было
   ничего: переставил 3 точки не туда — либо смирись, либо сноси всю карту. Теперь короткая
   история, до PT_UNDO_MAX шагов подряд (LIFO-стек), не один слот. ptSetUndo кладёт revert НА
   стек (не перезаписывает), ptDoUndo снимает последний и зовёт его. Тост (.ptToast, гаснет
   через 3с, не покрывает драг/сброс) по-прежнему отдельный быстрый путь — он всегда про самое
   свежее действие (у тоста один элемент на экран, ptShowToast сам перезаписывает предыдущий),
   поэтому его revert всегда совпадает с вершиной стека; тап по тосту снимает СВОЮ запись со
   стека явно (см. ptShowToast), не просто гасит один общий слот, как раньше. */
let ptUndoStack=[]; const PT_UNDO_MAX=5;
function ptSetUndo(revertFn){ ptUndoStack.push(revertFn); if(ptUndoStack.length>PT_UNDO_MAX) ptUndoStack.shift(); ptSyncUndoBtn(); }
function ptClearUndo(){ ptUndoStack.length=0; ptSyncUndoBtn(); }
function ptSyncUndoBtn(){ const b=$('ptUndoBtn'); if(b) b.classList.toggle('lookDisabled', !ptUndoStack.length); } // 22.09.2026: класс, не .disabled — см. комментарий у .ptCornerBtn.lookDisabled в index.html
function ptDoUndo(){
  if(!ptUndoStack.length) return;
  const fn=ptUndoStack.pop();
  sfx.click(); haptic('light');
  fn();
  ptSyncUndoBtn();
}

function ptRender(justPoppedIdx){
  ptRenderPins(justPoppedIdx);
  ptRenderPanel();
  ptRenderList();
}
/* 12.09.2026: вынесено из ptRender() — во время перетаскивания точки (ptStartPinDrag) нужно
   перерисовывать только сами метки на ленте на каждый кадр движения пальца, не пересобирать
   список точек и не дёргать панель (та временно спрятана во время драга). ptRender() по-прежнему
   делает всё три шага, как раньше — поведение вне драга не меняется ни на бит. */
function ptRenderPins(justPoppedIdx){
  const track=$('ptTrack'); if(!track) return;
  const pins=ptPins();
  track.querySelectorAll('.pin,.pin-lbl').forEach(e=>e.remove());
  track.classList.toggle('has-pins',pins.length>0);
  // 20.09.2026 (владелец, живой отчёт, два захода подряд): отдельный блок-подпись под лотком
  // (#ptTrayHint) убран целиком — «одноразовая подсказка уже существует» (#ptEmptyHint
  // «поставь первую точку»), не нужно было городить рядом второй текст/механизм, надо было
  // слить смысл в уже готовое место. Разница лотка/«Преграды» теперь — часть текста самого
  // #ptEmptyHintTxt (js/i18n.js, ptEmptyHint), видна тем же способом, что и раньше: пока
  // лента пуста, гаснет с первой точкой — ничего нового не добавлено.
  const pinSz=ptPinSizeFor(pins.length);
  track.style.setProperty('--pinSz',pinSz+'px');
  /* 02.09.2026→16.09.2026: раньше pinTop нарочно смещал базу ВВЕРХ, чтобы зарезервировать
     место под ряды 1-2 (ptSpreadOffsets), которые добавлялись только вниз — обычный случай
     (один ряд) утопал в верхней половине окна, нижняя половина честно пустовала.
     17.09.2026 (владелец, живой скрин: «пустота, должно доставать до конца»): ряды теперь
     симметричны вокруг центра (см. PT_ROW_OFFSETS выше) — pinTop снова простой центр, без
     сдвига. Проверено численно (verify-track-moderate.mjs) — все 4 размера стикера
     (36/30/24/20px) × 3 симметричных ряда укладываются в [0,130]. */
  const pinTop=65-pinSz/2;
  const offs=ptSpreadOffsets(pins);
  const clusters=ptComputeClusters(pins);
  // 17.09.2026: индексы, ушедшие под общий маркер «+N» ниже — по одной точке их не рисуем.
  const collapsed=new Set();
  clusters.forEach(function(idxs){ if(idxs.length>PT_CLUSTER_ROW_MAX) idxs.forEach(function(idx){ collapsed.add(idx); }); });
  pins.forEach((p,i)=>{
    if(collapsed.has(i)) return;
    const kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
    const lbl=document.createElement('div');
    lbl.className='pin-lbl'+(i===ptSelIdx?' sel':''); lbl.style.left=ptAtToPctSafe(p.at);
    // 17.09.2026: было «15+offs[i]» — верно, пока offs шёл только вниз (0/+22/+44). Теперь
    // ряды симметричны (PT_ROW_OFFSETS: 0/-22/+22) — «15+offs» для верхнего ряда (-22) уходил
    // в отрицательный top (-7px), подпись вылезала за край окна. Подпись теперь считается от
    // собственного верха точки (pinTop+offs[i]), не от зашитого «15» — остаётся над точкой в
    // любом ряду, проверено численно (verify-track-moderate.mjs, минимум +11px даже для
    // самого крупного пина в верхнем ряду).
    lbl.style.top=(pinTop+offs[i]-14)+'px';
    lbl.textContent=p.at+(L.unitM||'м')+(kindName?' · '+PT_KIND_LABEL[kindName]:'');
    track.appendChild(lbl);
    const el=document.createElement('div');
    el.className='pin '+p.type+(i===ptSelIdx?' sel':'')+(i===justPoppedIdx?' pop':'');
    el.dataset.idx=i; // 12.09.2026: пузырёк точки находит свой якорь по этому индексу (ptRenderPanel)
    el.style.left=ptAtToPctSafe(p.at);
    el.style.top=(pinTop+offs[i])+'px';
    const sw=document.createElement('div'); sw.className='sw';
    if(p.type==='kind'){ const c=PT_KIND_COLOR[kindName]||'#8fa3c8'; sw.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; sw.style.boxShadow='0 0 10px '+c+'66, inset 0 0 0 1px rgba(255,255,255,.14)'; }
    sw.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
    el.appendChild(sw);
    el.addEventListener('pointerdown',ev=>ptStartPinDrag(ev,i));
    track.appendChild(el);
  });
  // 17.09.2026: один маркер «+N» на схлопнутую группу — тап открывает уже готовый «Список точек»
  // (тот же #ptListOverlay, что у #ptListGrp), там доступна КАЖДАЯ точка группы по отдельности.
  clusters.forEach(function(idxs){
    if(idxs.length<=PT_CLUSTER_ROW_MAX) return;
    const ats=idxs.map(function(idx){ return pins[idx].at; });
    const at=Math.round((Math.min.apply(null,ats)+Math.max.apply(null,ats))/2);
    const el=document.createElement('div');
    el.className='pin cluster'+(idxs.indexOf(ptSelIdx)>=0?' sel':'');
    el.style.left=ptAtToPctSafe(at);
    el.style.top=pinTop+'px';
    el.textContent='+'+idxs.length;
    el.addEventListener('click',function(ev){
      ev.stopPropagation(); sfx.click(); haptic('light');
      ptRenderList();
      const ov=$('ptListOverlay'); if(ov) ov.classList.add('show');
    });
    track.appendChild(el);
  });
  const cnt=$('ptCnt'); if(cnt) cnt.textContent=pins.length;
  const tray=$('ptTray');
  if(tray){ tray.classList.toggle('nearMax',pins.length>=135&&pins.length<PT_MAX); tray.classList.toggle('atMax',pins.length>=PT_MAX); } // 09.09.2026: 45 было 90% от старых 50, 135 — та же доля от новых 150
}

function ptRenderPanel(){
  const qe=$('ptQuickEdit'); if(!qe) return;
  const pins=ptPins();
  // 20.09.2026: quickEdit меняет .show здесь в обе стороны независимо от «Точечной настройки» —
  // тот же резерв места, что и у неё (forgeReserveForQuickEdit, forge.js), должен пересчитаться
  // и тут, иначе порядок «сперва открыл точку, потом настройку» не покрыт.
  if(ptSelIdx<0||!pins[ptSelIdx]){ qe.classList.remove('show'); if(typeof forgeReserveForQuickEdit==='function') requestAnimationFrame(forgeReserveForQuickEdit); return; }
  const p=pins[ptSelIdx];
  qe.classList.add('show');
  if(typeof forgeReserveForQuickEdit==='function') requestAnimationFrame(forgeReserveForQuickEdit);
  // 16.09.2026: панель — нижний лист (position:fixed, index.html), ptPositionBubble() (якорила
  // её у самой точки) больше не нужна и удалена — точку по-прежнему видно по .pin.sel на ленте.
  const kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
  const title=$('ptPanelTitle'); if(title) title.textContent=p.type==='pause'?'Передышка':p.type==='marker'?'Заметка':(PT_KIND_LABEL[kindName]||'');
  const icon=$('ptPanelIcon'); if(icon) icon.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
  const av=$('ptAtVal'); if(av) av.value=p.at;
  const kl=$('ptKindLbl'); if(kl){ kl.style.display=p.type==='kind'?'block':'none'; if(p.type==='kind') kl.textContent='Здесь всегда будет '+(PT_KIND_LABEL[kindName]||'').toLowerCase()+' — не случайный вид.'; }
  // 01.09.2026 «Направление»: сторона видна только у кометы/дрейфера — у остальных видов (и у
  // спутника, который лишь колеблется) стороны не существует физически, контрол не показываем.
  const dr=$('ptDirRow');
  if(dr){
    const showDir=p.type==='kind'&&(kindName==='comet'||kindName==='drift');
    dr.style.display=showDir?'block':'none';
    if(showDir){
      const seg=$('ptDirSeg');
      if(seg){
        seg.innerHTML='';
        [[0,'Случайно'],[-1,'Влево'],[1,'Вправо']].forEach(function(it){
          const b=document.createElement('button');
          b.className='forgeSegBtn'+((p.dir||0)===it[0]?' sel':'');
          b.textContent=it[1];
          b.addEventListener('click',function(){ p.dir=it[0]; ptRenderPanel(); sfx.click(); haptic('light'); });
          seg.appendChild(b);
        });
      }
    }
  }
  const mb=$('ptMarkerBox'); if(mb) mb.style.display=p.type==='marker'?'block':'none';
  const ph=$('ptPauseHint'); if(ph) ph.style.display=p.type==='pause'?'block':'none';
  if(p.type==='marker'){ const ta=$('ptNoteText'); if(ta){ ta.value=p.note||''; ta.oninput=()=>{ p.note=ta.value; ptRenderList(); }; } }
}

function ptFmtTime(s){ const m=Math.floor(s/60), sec=Math.round(s%60); return m+':'+String(sec).padStart(2,'0'); }
function ptSimulateFlightCurve(len){
  const pts=[{t:0,d:0}]; let dist=0,t=0; const dt=1/30;
  while(dist<len&&t<600){
    const opening=.62*(1-Math.exp(-dist/100))*Math.exp(-dist/900);
    const dd=Math.min(1,dist/6000+opening);
    const speed=3.4+dd*4.6;
    dist=Math.min(len,dist+speed*dt*8); t+=dt;
    pts.push({t,d:dist});
  }
  return {pts,total:t||1};
}
function ptTimeAtDistance(curve,dist){
  const pts=curve.pts; if(dist<=0) return 0;
  let lo=0,hi=pts.length-1;
  while(lo<hi-1){ const mid=(lo+hi)>>1; if(pts[mid].d<dist) lo=mid; else hi=mid; }
  const a=pts[lo],b=pts[hi],k=(dist-a.d)/((b.d-a.d)||1);
  return a.t+(b.t-a.t)*k;
}
function ptRenderList(){
  const listPanel=$('ptListPanel'), listSub=$('ptListSub'); if(!listPanel||!listSub) return;
  const pins=ptPins();
  const curve=ptSimulateFlightCurve(ptLen());
  listSub.textContent=pins.length?pins.length+' шт. · весь полёт ~'+ptFmtTime(curve.total):'пусто';
  listPanel.innerHTML='';
  if(!pins.length){ listPanel.innerHTML='<div class="evtEmpty">пока ничего не добавлено</div>'; return; }
  const order=pins.map((p,i)=>i).sort((a,b)=>pins[a].at-pins[b].at);
  order.forEach(i=>{
    const p=pins[i], kindName=p.type==='kind'?FORGE_KINDS[p.kind]:null;
    const row=document.createElement('div'); row.className='evtRow';
    const ic=document.createElement('div'); ic.className='ic';
    if(p.type==='kind'){ const c=PT_KIND_COLOR[kindName]||'#8fa3c8'; ic.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; }
    else ic.style.background=p.type==='pause'?'linear-gradient(180deg,rgba(160,210,255,.9),rgba(160,210,255,.65))':'linear-gradient(180deg,rgba(240,192,64,.9),rgba(240,192,64,.65))';
    ic.innerHTML=p.type==='pause'?PT_ICON_SVG.pause:p.type==='marker'?PT_ICON_SVG.marker:(PT_ICON_SVG[kindName]||'');
    const nm=document.createElement('div'); nm.className='nm'; nm.textContent=p.type==='pause'?'Передышка':p.type==='marker'?'Заметка':(PT_KIND_LABEL[kindName]||'');
    const evtT=ptTimeAtDistance(curve,p.at);
    const mt=document.createElement('div'); mt.className='mt'; mt.style.cssText='font-size:10.5px;color:var(--gold-hi);flex-shrink:0;text-align:right';
    mt.textContent=p.at+(L.unitM||'м')+' · '+ptFmtTime(evtT);
    const rm=document.createElement('div'); rm.className='rm'; rm.textContent='×';
    row.append(ic,nm,mt,rm);
    row.addEventListener('click',ev=>{
      if(ev.target===rm){ ptRemovePin(i); return; }
      ptSelIdx=i; ptRender();
      // 12.09.2026 (макет karta-s-redaktirovaniem-tochki-12-09-2026.html, одобрено): список —
      // отдельный лист поверх экрана, не соседняя панель; scrollIntoView больше не нужен,
      // панель точки и так сразу видна под лентой, как только лист закрылся
      const ov=$('ptListOverlay'); if(ov) ov.classList.remove('show');
    });
    listPanel.appendChild(row);
  });
}

function ptRemovePin(i){
  const pins=ptPins(); const p=pins[i]; if(!p) return;
  pins.splice(i,1); ptSelIdx=-1;
  sfx.click(); haptic('light');
  const revert=()=>{ pins.push(p); pins.sort((a,b)=>a.at-b.at); ptSelIdx=pins.findIndex(x=>x===p); ptRender(); };
  ptShowToast('Убрал '+ptPinName(p));
  ptSetUndo(revert);
  ptRender();
}
function ptNudge(d){
  if(ptSelIdx<0) return; const pins=ptPins(); const p=pins[ptSelIdx]; if(!p) return;
  p.at=ptClampAt(p.at+d); ptRender();
}

let ptGhostEl=null;
function ptMoveGhost(x,y){ if(ptGhostEl){ ptGhostEl.style.left=x+'px'; ptGhostEl.style.top=y+'px'; } }
/* 12.09.2026 (Vogel & Baudisch «Shift», CHI 2007, RESEARCH-2026-09-CREATOR-CONTROLS.md тема C):
   значение метров всплывает НАД пальцем во время перетаскивания — палец не закрывает то, что
   видно. #ptDragValue — отдельный плавающий бейдж, не часть пузырька (тот скрыт во время драга). */
function ptDragValueShow(panel,x,y,text){
  const dv=$('ptDragValue'); if(!dv) return;
  const panelR=panel.getBoundingClientRect();
  dv.textContent=text; dv.classList.add('show');
  dv.style.left=(x-panelR.left)+'px'; dv.style.top=(y-panelR.top)+'px';
}
function ptStartPinDrag(ev,i){
  ev.stopPropagation(); ptSelIdx=i; ptRender();
  const track=$('ptTrack'), panel=$('ptPanel'), qe=$('ptQuickEdit');
  if(qe) qe.classList.remove('show'); // прячем пузырёк на время драга — значение уже видно над пальцем
  const startPins=ptPins(), startP=startPins[i], startAt=startP?startP.at:null; // 16.09.2026 «Дальше»: точка отсчёта для undo драга — у него, в отличие от add/remove, тоста не было
  const onMove=e=>{
    const pins=ptPins(); if(!pins[i]) return;
    pins[i].at=ptXToAt(track,e.clientX); ptSelIdx=i;
    ptRenderPins(); // лёгкая перерисовка меток без пересборки панели/пузырька на каждый кадр
    if(panel) ptDragValueShow(panel,e.clientX,track.getBoundingClientRect().top,pins[i].at+(L.unitM||'м'));
  };
  const onUp=()=>{
    document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    const dv=$('ptDragValue'); if(dv) dv.classList.remove('show');
    const pins=ptPins(), p=pins[i];
    if(p && startAt!==null && p.at!==startAt){
      const prevAt=startAt;
      // 17.09.2026 «Дальше — история»: по индексу i (не объекту) был ловим только пока отмена
      // была одна на слот — со стеком в несколько шагов другое действие между драгом и его
      // отменой могло бы сдвинуть индексы массива; ищем ту же точку по ссылке startP, не по i.
      ptSetUndo(()=>{ const pp=ptPins(); const idx=pp.indexOf(startP); if(idx>=0) pp[idx].at=prevAt; ptRender(); });
    }
    ptRender();
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
}
function ptSyncTrayAvailability(){ // 02.09.2026: «Состав» может полностью выключить вид —
  // стикер того же вида в лотке обязан честно это показать, а не молча спорить с обещанием
  // «полностью исключить из игры». Тот же визуальный язык, что уже есть у .atMax (opacity .28).
  const tray=$('ptTray'); if(!tray || typeof forgeCfg==='undefined') return;
  Array.from(tray.children).forEach(function(item){
    const s=item.querySelector('.sticker'); if(!s || s.dataset.t!=='kind') return;
    const excluded=!(forgeCfg.e>>(+s.dataset.k)&1);
    item.classList.toggle('excluded',excluded);
  });
}
/* 12.09.2026 (RESEARCH-2026-09-CREATOR-CONTROLS.md тема C — WCAG 2.5.7 «tap anywhere on the
   slider track», Gmail-кейс, TapDrag: тап на источник → тап на цель обгоняет длинный драг):
   «взведённый» тип стикера — тап по стикеру взводит его, следующий тап по свободному месту
   ленты ставит точку туда. Перетаскивание стикера на ленту (ниже) остаётся рабочим как было —
   это ДОПОЛНИТЕЛЬНЫЙ способ, не замена. */
let ptArmedType=null;
function ptArmSticker(item,d){
  const same=ptArmedType&&ptArmedType.t===d.t&&ptArmedType.k===d.k;
  ptArmedType=same?null:d;
  document.querySelectorAll('#ptTray .stickerItem').forEach(x=>x.classList.remove('armed'));
  if(!same) item.classList.add('armed');
}
function ptWireTray(){
  const tray=$('ptTray'); if(!tray||tray._ptWired) return; tray._ptWired=1;
  const stickerDefs=[{t:'pause',k:0,cap:'Передышка'},{t:'marker',k:0,cap:'Заметка'}]
    .concat(FORGE_KINDS.map((k,i)=>({t:'kind',k:i,cap:PT_KIND_LABEL[k]||k})));
  tray.innerHTML='';
  stickerDefs.forEach(function(d){
    const item=document.createElement('div'); item.className='stickerItem'+(d.t==='kind'?' kind':''); // .kind — подпись становится кликабельным переключателем (см. CSS .stickerItem.kind .stickerCap), у Передышки/Заметки такого действия нет
    const s=document.createElement('div'); s.className='sticker '+(d.t==='kind'?'':d.t); s.dataset.t=d.t; s.dataset.k=d.k;
    if(d.t==='kind'){ const c=PT_KIND_COLOR[FORGE_KINDS[d.k]]||'#8fa3c8'; s.style.background='linear-gradient(180deg, '+c+', '+c+'dd)'; s.style.boxShadow='0 0 14px '+c+'77, inset 0 0 0 1px rgba(255,255,255,.28)'; }
    const ptKey=d.t==='kind'?FORGE_KINDS[d.k]:d.t;
    s.innerHTML=d.t==='kind'?(PT_ICON_SVG[FORGE_KINDS[d.k]]||''):PT_ICON_SVG[d.t];
    const ptScale=PT_ICON_WEIGHT_SCALE[ptKey]; const svgEl=s.querySelector('svg');
    if(ptScale && svgEl) svgEl.style.transform='scale('+ptScale+')';
    const cap=document.createElement('div'); cap.className='stickerCap'; cap.textContent=d.cap;
    item.appendChild(s); item.appendChild(cap);
    tray.appendChild(item);
  });
  ptSyncTrayAvailability();
  const track=$('ptTrack');
  tray.addEventListener('pointerdown',ev=>{
    const s=ev.target.closest('.sticker'); if(!s) return;
    const item=s.closest('.stickerItem');
    if(item.classList.contains('excluded')) return; // 02.09.2026: вид выключен в «Составе» — стикер не тащится, не спорит с «полностью исключить из игры»
    const pins=ptPins(); if(pins.length>=PT_MAX) return;
    const x0=ev.clientX, y0=ev.clientY; let moved=false;
    s.classList.add('dragging');
    if(!ptGhostEl){ ptGhostEl=document.createElement('div'); ptGhostEl.className='ptGhost'; (document.getElementById('uiScaleRoot')||document.body).appendChild(ptGhostEl); } // 09.09.2026 «Размер текста»: та же причина, что у ptToast выше
    ptGhostEl.style.display='flex'; ptGhostEl.style.background=getComputedStyle(s).background;
    ptGhostEl.innerHTML=s.innerHTML; ptGhostEl.style.color=getComputedStyle(s).color;
    ptMoveGhost(ev.clientX,ev.clientY);
    const onMove=e=>{
      if(Math.hypot(e.clientX-x0,e.clientY-y0)>8) moved=true;
      ptMoveGhost(e.clientX,e.clientY); if(track) track.classList.toggle('dropok',ptOverRect(e.clientX,e.clientY,track));
    };
    const onUp=e=>{
      document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
      s.classList.remove('dragging'); ptGhostEl.style.display='none'; if(track) track.classList.remove('dropok');
      if(track && ptOverRect(e.clientX,e.clientY,track)){
        const at=ptXToAt(track,e.clientX);
        const p={at,type:s.dataset.t,kind:+s.dataset.k};
        const pins=ptPins(); pins.push(p); ptSelIdx=pins.length-1;
        sfx.click(); haptic('medium');
        ptRender(ptSelIdx);
        const revert=()=>{ const idx=pins.indexOf(p); if(idx>=0) pins.splice(idx,1); ptSelIdx=-1; ptRender(); };
        ptShowToast('Поставил '+ptPinName(p));
        ptSetUndo(revert);
      } else if(!moved){
        // 12.09.2026: тап без переноса на ленту (и без промаха мимо неё) — не «ничего не
        // произошло», а «взвести этот тип», см. комментарий у ptArmedType выше
        ptArmSticker(item,{t:s.dataset.t,k:+s.dataset.k});
        sfx.click(); haptic('light');
      }
    };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });
  /* 22.09.2026 «Слияние полосы значков и Преград», пересмотрено в тот же вечер: первая версия
     держала долгое нажатие ПРЯМО НА ЗНАЧКЕ — владелец верно поймал, что перетаскивание тоже
     начинается с касания-и-паузы (человек целится, куда тащить), и 2-секундный таймер мог
     сработать раньше, чем палец сдвинется — случайное вкл/выкл вместо переноса. Перенесено на
     ПОДПИСЬ под значком (.stickerCap) — отдельная область того же стикера, тот же один «дом»
     для обеих функций (значок ставит/тащит, подпись переключает участие в случайной генерации),
     но физически не пересекается с драгом значка вообще — обычный короткий тап, без таймера. */
  tray.addEventListener('click',ev=>{
    const cap=ev.target.closest('.stickerCap'); if(!cap) return;
    const item=cap.closest('.stickerItem'); const s=item.querySelector('.sticker');
    if(!s || s.dataset.t!=='kind') return;
    const i=+s.dataset.k;
    forgeCfg.e^=(1<<i); if(!forgeCfg.e) forgeCfg.e=(1<<i); // последний вид не гасим — небо не бывает пустым насовсем, тот же приём, что раньше был у forgeChips
    sfx.click(); haptic('light');
    if(typeof forgeSyncWidgets==='function') forgeSyncWidgets(); // сама перекрасит .excluded (ptSyncTrayAvailability внутри) и пересоберёт небо
  });
  if(track) track.addEventListener('click',ev=>{
    if(ev.target.closest('.pin')) return; // клик по самой точке обрабатывается её собственным pointerdown/ptStartPinDrag
    if(ptArmedType){
      const at=ptXToAt(track,ev.clientX);
      const p={at,type:ptArmedType.t,kind:ptArmedType.k};
      const pins=ptPins(); pins.push(p); ptSelIdx=pins.length-1;
      document.querySelectorAll('#ptTray .stickerItem').forEach(x=>x.classList.remove('armed')); ptArmedType=null;
      sfx.click(); haptic('medium');
      ptRender(ptSelIdx);
      const revert=()=>{ const idx=pins.indexOf(p); if(idx>=0) pins.splice(idx,1); ptSelIdx=-1; ptRender(); };
      ptShowToast('Поставил '+ptPinName(p));
      ptSetUndo(revert);
    } else if(ptSelIdx>=0){
      ptSelIdx=-1; ptRender();
    }
  });
}
/* 22.09.2026 (владелец, живой скрин с обводкой — «одинаковые функции дублируются...
   достаточно одной удалить... стрелочка рядом с 4 тоже под вопросом... а если её зажать,
   то можно будет удалить вообще всё... тогда корзина нам не будет нужна»): forgeResetBtn
   (отдельная кнопка-корзина, js/forge.js) убрана целиком — её работу (forgeResetAll(), сброс
   ВСЕГО forgeCfg, не только точек) теперь делает ДОЛГОЕ нажатие на эту же ptUndoBtn. Короткий
   тап — как раньше, ptDoUndo() (один шаг назад). 2000мс — не выдумано, тот же порядок, что
   уже применялся в проекте для похожих жестов (Сервисный центр/Eruda). forgeResetAll() сама
   не изменилась и по-прежнему кладёт свой откат на ptUndoStack — долгое нажатие остаётся
   тоже отменяемым коротким тапом сразу после, ничего не потеряно от старого поведения. */
const PT_RESET_HOLD_MS=2000;
let ptResetHoldTimer=null, ptResetHoldFired=false;
function ptUndoBtnCancelHold(){
  clearTimeout(ptResetHoldTimer); ptResetHoldTimer=null;
  const b=$('ptUndoBtn'); if(b) b.classList.remove('holding');
}
/* 23.09.2026 «Угловые кнопки оживают» (владелец, макет karta-uglovye-knopki-glaza-23-09-2026.html,
   «делай», затем: «хочу, чтобы характер менялся, не одно и то же каждый раз» — живой разговор):
   несколько секунд бездействия на «Карте» — обе угловые кнопки (счётчик точек/«Отменить»)
   превращаются в моргающие глаза, тот же .eye/keyframes, что уже определяют «характер» ленты
   Мастерской/Кошелька («Семья характеров», 20.09.2026) — ни один не выдуман заново, только
   нацелены на .cornerEye вместо .wAuthorRibbon. 11 из 12 характеров (без «Волны» — она просто
   сдвиг .18с между глазами, а он тут уже есть у всех по умолчанию). Владелец явно попросил
   РАЗНООБРАЗИЕ — каждое новое появление выбирает случайный характер заново, не закреплён один
   на всегда (в отличие от ленты, где характер держится за кодом трассы — тут другой смысл:
   переменность ради игрока, который видит это много раз за сессию). */
const PT_IDLE_MS=8000; // середина диапазона 5-10с, который owner сам назвал
const PT_EYE_CHARS=['calm','bouncy','sparkle','droopy','sleepy','curious','nervous','sideeye','surprised','googly','dramatic'];
let ptIdleTimer=null;
function ptIdleEyesShow(){
  const track=$('ptTrack'); if(!track) return;
  const char=PT_EYE_CHARS[Math.floor(Math.random()*PT_EYE_CHARS.length)];
  track.querySelectorAll('.ptCornerBtn').forEach(function(b){
    PT_EYE_CHARS.forEach(function(c){ b.classList.remove('eyeChar-'+c); });
    b.classList.add('idleEyes','eyeChar-'+char);
  });
}
function ptIdleEyesHide(){
  const track=$('ptTrack'); if(!track) return;
  track.querySelectorAll('.ptCornerBtn').forEach(function(b){ b.classList.remove('idleEyes'); });
}
function ptIdleEyesResetTimer(){
  clearTimeout(ptIdleTimer); ptIdleTimer=null;
  ptIdleEyesHide();
  // 23.09.2026: живёт только пока виден шаг «Карта» (forgeSub, js/forge.js) — на остальных
  // шагах/экранах таймер просто не перезапускается, глаза не появятся там, где их не видно.
  if(typeof forgeSub!=='undefined' && forgeSub==='arrange') ptIdleTimer=setTimeout(ptIdleEyesShow,PT_IDLE_MS);
}
function ptWireOnce(){
  if(ptWireOnce._done) return; ptWireOnce._done=1;
  const undoBtn=$('ptUndoBtn');
  if(undoBtn){
    undoBtn.addEventListener('pointerdown', ()=>{
      ptResetHoldFired=false;
      undoBtn.classList.add('holding');
      ptResetHoldTimer=setTimeout(()=>{
        ptResetHoldFired=true;
        undoBtn.classList.remove('holding');
        sfx.click(); haptic('heavy');
        if(typeof forgeResetAll==='function') forgeResetAll();
      },PT_RESET_HOLD_MS);
    });
    undoBtn.addEventListener('pointerup', ptUndoBtnCancelHold);
    undoBtn.addEventListener('pointerleave', ptUndoBtnCancelHold);
    undoBtn.addEventListener('pointercancel', ptUndoBtnCancelHold);
    undoBtn.addEventListener('click', ()=>{
      if(ptResetHoldFired){ ptResetHoldFired=false; return; } // клик после долгого нажатия — сброс уже сделан, второй раз (отмена) не нужен
      ptDoUndo();
    });
  }
  const del=$('ptDelBtn'); if(del) del.addEventListener('click',()=>{ if(ptSelIdx>=0) ptRemovePin(ptSelIdx); });
  const m10=$('ptMinus10'); if(m10) m10.addEventListener('click',()=>ptNudge(-10));
  const m1=$('ptMinus1'); if(m1) m1.addEventListener('click',()=>ptNudge(-1));
  const p1=$('ptPlus1'); if(p1) p1.addEventListener('click',()=>ptNudge(1));
  const p10=$('ptPlus10'); if(p10) p10.addEventListener('click',()=>ptNudge(10));
  const av=$('ptAtVal'); if(av) av.addEventListener('change',ev=>{
    if(ptSelIdx<0) return; const pins=ptPins(); const v=Math.round(+ev.target.value);
    pins[ptSelIdx].at=isFinite(v)?ptClampAt(v):pins[ptSelIdx].at; ptRender();
  });
  // 12.09.2026 (макет karta-s-redaktirovaniem-tochki-12-09-2026.html, одобрено): «Точек: N»
  // теперь открывает отдельный лист снизу экрана (не аккордеон внутри страницы, как раньше)
  const lg=$('ptListGrp'), ov=$('ptListOverlay'), lc=$('ptListClose');
  if(lg&&ov) lg.addEventListener('click',()=>{ sfx.click(); haptic('light'); ptRenderList(); ov.classList.add('show'); });
  if(lc&&ov) lc.addEventListener('click',()=>{ sfx.click(); haptic('light'); ov.classList.remove('show'); });
  // 12.09.2026: уход с «Карты» на другой шаг закрывает лист — иначе он молча остаётся открытым
  // и «выпрыгивает» без причины при возврате. Раньше висело на кнопках-пилюлях (forgeSubSkyBtn/
  // forgeSubHardBtn), теперь их нет — три шага переключаются только через forgeSubTabSet
  // (js/forge.js), она и закрывает лист сама при уходе с «arrange», см. там же.
  // 01.09.2026 «Свой фон»: свободный цвет неба — формат уже поддерживает (extFlags бит1,
  // forgeBitsPack/Unpack). Лента красится живьём в эти цвета (ptPaintTrackBg), тот же приём,
  // что уже был в одобренном макете.
  const h1el=$('ptHue1');
  if(h1el) h1el.addEventListener('input',function(){
    forgeCfg.h1=+h1el.value;
    // 01.09.2026 «Авто-гармония»: пока автор не тронул второй цвет вручную сам — он едет
    // вслед за первым к ближайшей проверенной паре, чтобы новичок не мог случайно поставить
    // столкновение. Один тап по ptHue2 отключает автовождение до конца сессии в конструкторе.
    if(!ptH2Touched){ forgeCfg.h2=ptAutoHarmonize(forgeCfg.h1); }
    ptSyncColorUI();
    if(typeof forgeSkyKick==='function') forgeSkyKick();
  });
  const h2el=$('ptHue2');
  if(h2el) h2el.addEventListener('input',function(){
    forgeCfg.h2=+h2el.value; ptH2Touched=true;
    ptSyncColorUI();
    if(typeof forgeSkyKick==='function') forgeSkyKick();
  });
  const densEl=$('ptDens');
  if(densEl) densEl.addEventListener('input',function(){
    forgeCfg.dens=+densEl.value;
    ptSyncColorUI();
    if(typeof forgeSkyKick==='function') forgeSkyKick();
  });
  const moodEl=$('ptMood');
  if(moodEl) moodEl.addEventListener('input',function(){
    forgeCfg.mood=+moodEl.value;
    ptSyncColorUI();
    if(typeof forgeSkyKick==='function') forgeSkyKick();
  });
  const rndBtn=$('ptRandomSkyBtn');
  if(rndBtn) rndBtn.addEventListener('click',ptRandomSky);
  // 01.09.2026 «Непрерывная длина»: заменяет старые 5 кнопок «Длина неба» — просто ползунок.
  // Кнопка ∞ убрана в тот же день (см. комментарий у #ptLenSlider в index.html) — «5000м» на
  // линейке, пока ∞ была включена, читались как настоящий предел, противоречиво; и реальной
  // нужды в бесконечной авторской трассе не нашлось. Формат кода по-прежнему поддерживает l=0
  // (forgeSanitize, forge.js) — старые коды друзей с этим значением останутся читаемыми, новых
  // через интерфейс больше не создать.
  const ls=$('ptLenSlider');
  if(ls) ls.addEventListener('input',()=>{
    forgeCfg.l=+ls.value; ptSyncLenUI();
    ptRenderRuler(); ptRender();
    if(typeof forgeGrpSubSync==='function') forgeGrpSubSync();
  });
  // 16.09.2026 «Дальше» (диагноз §6): точный ввод числом рядом с 4 слайдерами Цвета.
  // 16.09.2026, тем же вечером (макет konstruktor-fundament-16-09-2026.html, «Да»): доведено
  // до конца — те же 3 ползунка «Точечной настройки» (Плотность/Скорость/Солнечный ветер,
  // js/forge.js, forgeDen/forgeSpd/forgeWind) получают то же поведение, не только «Цвет».
  ['ptHue1','ptHue2','ptDens','ptMood','forgeDen','forgeSpd','forgeWind'].forEach(ptWireValInput);
  // 23.09.2026 «Угловые кнопки оживают» (владелец, макет karta-uglovye-knopki-glaza-23-09-2026.html,
  // «делай»): любое касание, пока виден шаг «Карта», сбрасывает таймер бездействия. Слушатель
  // один на весь document (не на сами кнопки) — так ловит и перетаскивание точек, и тап по
  // трассе/лотку, всё, что значит «игрок тут, ему не нужна подсказка».
  document.addEventListener('pointerdown', ptIdleEyesResetTimer);
}
/* 16.09.2026: <input type=number> рядом со слайдером — на change (блюр/Enter, не на каждый
   символ, чтобы не мешать печатать) клампит в диапазон слайдера и отдаёт значение ЕМУ, тем же
   'input'-событием, что и обычный драг — вся логика применения (forgeCfg.*, ptSyncColorUI,
   forgeSkyKick) остаётся в одном месте у слайдера, не дублируется здесь. */
function ptWireValInput(rangeId){
  const numEl=$(rangeId+'V'), rangeEl=$(rangeId);
  if(!numEl||!rangeEl||numEl._ptValWired) return; numEl._ptValWired=1;
  numEl.addEventListener('change',function(){
    const min=+rangeEl.min, max=+rangeEl.max;
    let v=Math.round(+numEl.value);
    if(!isFinite(v)) v=+rangeEl.value;
    v=Math.min(max,Math.max(min,v));
    numEl.value=v; rangeEl.value=v;
    rangeEl.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
function ptSyncLenUI(){
  const ls=$('ptLenSlider'), lv=$('ptLenVal'), ib=$('ptInfBtn'); if(!ls) return;
  const inf=forgeCfg.l===0;
  ls.disabled=inf;
  if(!inf) ls.value=forgeCfg.l;
  if(lv) lv.textContent=inf?(L.forgeInf||'∞'):(ls.value+(L.unitM||'м'));
  if(ib) ib.classList.toggle('sel',inf);
}
function ptPaintTrackBg(){
  const track=$('ptTrack'); if(!track) return;
  const psl=(typeof forgePreviewMoodSL==='function')?forgePreviewMoodSL(forgeCfg.mood):{S0:60,L0:22,S1:65,L1:10};
  track.style.background='linear-gradient(180deg, hsl('+forgeCfg.h1+','+psl.S0+'%,'+psl.L0+'%), hsl('+forgeCfg.h2+','+psl.S1+'%,'+psl.L1+'%))';
}
function ptSyncColorUI(){
  const h1=$('ptHue1'), h2=$('ptHue2'), dens=$('ptDens'), mood=$('ptMood'); if(!h1) return;
  h1.value=forgeCfg.h1; h2.value=forgeCfg.h2; dens.value=forgeCfg.dens; if(mood) mood.value=forgeCfg.mood;
  // 16.09.2026 «Дальше»: .forgeVal (<b>) стал .forgeValInput (<input type=number>) — .value, не
  // .textContent; document.activeElement не проверяем — тот же приём, что уже у .atval (точка на
  // карте), там это тоже не защищено, и жалоб не было.
  const h1v=$('ptHue1V'); if(h1v) h1v.value=forgeCfg.h1;
  const h2v=$('ptHue2V'); if(h2v) h2v.value=forgeCfg.h2;
  const densv=$('ptDensV'); if(densv) densv.value=forgeCfg.dens;
  const moodv=$('ptMoodV'); if(moodv) moodv.value=forgeCfg.mood;
  const sw1=$('ptSw1'); if(sw1) sw1.style.background='hsl('+forgeCfg.h1+',60%,45%)';
  const sw2=$('ptSw2'); if(sw2) sw2.style.background='hsl('+forgeCfg.h2+',60%,45%)';
  ptPaintTrackBg();
}
function ptFill(){
  if(typeof L==='undefined'||!L.forgeTitle) return; // тот же ранний выход, что и forgeFill — язык ещё не загружен
  const t=$('ptTitle'); if(t) t.textContent='Расстановка';
  const s=$('ptSub'); if(s) s.textContent='Точки на дистанции — где будет передышка или препятствие';
  ptH2Touched=false; // новое открытие экрана — авто-гармония снова ведёт второй цвет, пока автор сам его не тронет
  const ov0=$('ptListOverlay'); if(ov0) ov0.classList.remove('show'); // 12.09.2026: свежее открытие Конструктора не должно наследовать открытый лист прошлого раза
  ptArmedType=null; ptSelIdx=-1; // 12.09.2026: тем же принципом — не наследуем взведённый стикер/выбранную точку прошлого раза
  ptWireTray();
  ptWireOnce();
  ptSyncLenUI();
  ptSyncColorUI();
  ptRender();
  ptRenderRuler();
}
