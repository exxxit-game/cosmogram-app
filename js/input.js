'use strict';
/* ============================================================
   INPUT (Блок 2): гироскоп с калибровкой, тач/мышь, клавиатура.
   Зависит от core.js (clamp, lerp, deadzone, audio, haptic, toast, L).
   ============================================================ */
const PLATFORM = (tg && tg.platform) || 'web';
// Input Fallback System: есть ли датчик ориентации вообще (п.1 автоопределения)
const HAS_GYRO = typeof window.DeviceOrientationEvent!=='undefined';
// iOS 13+: датчик есть, но нужно явное разрешение пользователя (красивая кнопка в меню)
const NEEDS_TILT_PERMISSION = HAS_GYRO && typeof DeviceOrientationEvent.requestPermission==='function';
const input = { tiltX:0, tiltY:0, useGyro:false, touchX:null, touchY:null,
  keyL:false, keyR:false, keyU:false, keyD:false, baseG:null, baseB:null,
  _t:0, // время последнего пакета датчика — сторож «датчик замолчал»
  sens: PLATFORM==='android' ? 1.05 : 1 };
let lastGamma=null, lastBeta=null, lastAlpha=null;

/* Стабильная автокалибровка (v1.4.5→v1.4.6). Ноль принимаем из неподвижной
   позы: 3 подряд пакета в пределах 4° (≈50мс на 60Гц — раньше, чем игрок
   успеет реагировать на препятствия). Ноль валиден ТОЛЬКО в системе координат
   канала, где снят: кадры моста Telegram и веба различаются на десятки градусов
   (одна поза: мост γ-2°, веб γ79°) — калибровка «веба» + руление «мостом»
   вечно зажимало самолёт влево (живая регрессия на Android). Поэтому смена
   канала обнуляет калибровку (gyroChanIn). Запасные пути, чтобы гироскоп не
   молчал вечно: после 14 пакетов без неподвижности — среднее ВСЕГО окна
   (махи влево-вправо взаимоуничтожаются), после 40 — последний пакет.

   v1.100.3 «Тихий ноль»: среднеполётный сброс (смена канала, переворот,
   залипший ноль) взводит ТИХИЙ режим — ноль принимается лишь из 10 подряд
   ровных пакетов (~160мс настоящей неподвижности), поспешные запасные пути
   закрыты. Недуг с чёрного ящика: у сингулярности Эйлера поток давал ровный
   дикий блип из 3 пакетов (−81°/143°) посреди бури — старая «поза» принимала
   его за ноль, руль залипал, страж сбрасывал, и петля повторялась 11 раз за
   полёт. Лавочка честности: 80 пакетов без тишины — ноль всё же принимается
   (среднее окна), гироскоп не молчит вечно. Первый взлёт и ручная калибровка
   тихий режим не взводят — старт остаётся быстрым. */
const CAL_NEED=3, CAL_TOL=4, CAL_MAX=14, CAL_DEAD=40;
const CAL_QUIET=10, CAL_QUIET_ESC=80; // v1.100.3: тишина после бури и её лавочка
const FOREIGN_ESC=60; // v1.104.0: лавочка карантина — 60 пакетов ровной позы перевешивают чужое свидетельство
let calN=0, calSeen=0, calG=0, calB=0, calAllG=0, calAllB=0, calRefG=0, calRefB=0, calToast=false, calQuiet=0;
let prevG=null, prevB=null, flipN=0; // страж выбросов: скачок >55° между пакетами — не рука, а сингулярность углов Эйлера при перевороте
let poseSG=null, poseSB=null; // v1.100.4 «Верная рука»: медленный следопыт позы руки (в кадре канала, после remap) — стражу, что смотрит на руку
let steerChan='none'; // 'none' | 'tg' | 'web' — чей кадр сейчас снимает ноль и рулит
function calReset(toast,quiet){ input.baseG=null; input.baseB=null; calN=0; calSeen=0; calAllG=0; calAllB=0; calToast=!!toast; calQuiet=quiet?CAL_QUIET:0; prevG=null; prevB=null; flipN=0; poseSG=null; poseSB=null; foreignN=0; if(typeof BEACON!=='undefined') BEACON.calTick(); } // v1.100.4: след руки сеем заново из нового потока; v1.104.0: и счётчик лавочки карантина; v1.107.0: частые перекалибровки — симптом, почта считает
function gyroChanIn(chan){
  if(steerChan!==chan && typeof BB!=='undefined') BB.log('chan','steer '+chan); // v1.99.7 «Чёрный ящик»: эстафета — на ленту
  if(steerChan!=='none' && steerChan!==chan) calReset(false,true); // смена канала = смена системы координат: старый ноль врёт; v1.100.3: после эстафеты пьём только из настоящей тишины
  steerChan=chan;
}
let foreignNoteT=0; // v1.102.2: запись карантина на ленту — не чаще раза в секунду
let foreignN=0; // v1.104.0: сколько подряд пакетов поза сидит под карантином — счётчик лавочки
function calFeed(g,b,rawB){
  if(steerChan!=='none' && chanSpread(steerChan)>STORM_SPREAD) return false; // v1.99.8: из мутного колодца не пьём — в шторм нуль не принимаем
  /* v1.102.2 «Два компаса»: ноль — только с согласия дышащего соседа о том, где низ.
     β — ось гравитации: в шторм Эйлера бредит γ, а β у честных каналов совпадает (та же
     рука, тот же низ). Сосед ДЫШИТ, а его β в 40°+ от кандидата — один из компасов врёт:
     ноль удерживаем, пьём дальше. Свидетельство живёт ровно окно стража (2с): сосед
     замолчал или согласился — карантин снимается сам, вечного молчания не бывает.
     Замороженный лжец (β1° при ровном пульсе) свидетелем не бывает: не дышит — молчит. */
  const oth=steerChan==='tg'?'web':'tg';
  const oh=(steerChan!=='none')?chanHist[oth]:null;
  const othB=(oh&&oh.length)?oh[oh.length-1].b:null;
  const foreign=(typeof rawB==='number') && othB!=null && chanAlive(oth) && !chanLiar(oth) && Math.abs(othB-rawB)>40; // v1.104.0: осуждённый лжец не свидетельствует — его слово залога не держит
  calSeen++; calAllG+=g; calAllB+=b;
  if(calN===0 || Math.abs(g-calRefG)>CAL_TOL || Math.abs(b-calRefB)>CAL_TOL){ calRefG=g; calRefB=b; calG=g; calB=b; calN=1; } // поза движется — отсчёт заново от новой точки
  else { calG+=g; calB+=b; calN++; }
  let done=false, candG=0, candB=0, how=''; // v1.102.2: кандидат НЕ пишется в ноль, пока компасы не согласились
  const need=calQuiet||CAL_NEED; // v1.100.3: после бури — только долгая тишина
  if(calN>=need){ candG=calG/calN; candB=calB/calN; done=true; how='pose'; }                     // неподвижная поза — точный ноль
  else if(!calQuiet && calSeen>=CAL_DEAD){ candG=g; candB=b; done=true; how='dead'; }            // поток шумит — гироскоп не должен молчать вечно
  else if(!calQuiet && calSeen>=CAL_MAX){ candG=calAllG/calSeen; candB=calAllB/calSeen; done=true; how='avg'; }   // среднее всего окна
  else if(calQuiet && calSeen>=CAL_QUIET_ESC){ candG=calAllG/calSeen; candB=calAllB/calSeen; done=true; how='esc'; } // v1.100.3: лавочка — вечного молчания не бывает
  if(done){
    if(foreign){ // сосед дышит и не согласен, где низ, — ноль удержан; счётчики живут, следующий пакет спросит снова
      foreignN++;
      // v1.104.0 «Компас и лжец»: лавочка карантина. Живая регрессия: дрожащий лжец
      // (β1°±1°) держал честный ноль веба в залоге 15–25с — пилот гиб без гироскопа.
      // Карантин — подозрение, не приговор: минута ровной позы (60 пакетов) — настоящая
      // рука, и собственный кандидат канала самосогласован. Ломают залог только позы —
      // средние и запасные (avg/dead/esc) шумны, им доверия нет.
      if(how==='pose' && foreignN>=FOREIGN_ESC){
        if(typeof BB!=='undefined') BB.log('zero','hatch: поза простояла под карантином '+foreignN+' пакетов ('+oth+' β'+Math.round(othB)+' против β'+Math.round(rawB)+') — залог не вечен, ноль принят');
        foreignN=0;
      } else {
        if(typeof BB!=='undefined' && performance.now()-foreignNoteT>900){ foreignNoteT=performance.now();
          BB.log('zero','foreign: кандидат β'+Math.round(rawB)+' против '+oth+' β'+Math.round(othB)+' — ноль удержан'); }
        return false;
      }
    } else foreignN=0;
    input.baseG=candG; input.baseB=candB; // согласие есть — кандидат становится нулём
    if(typeof BB!=='undefined') BB.log('zero','accept '+Math.round(input.baseG)+'/'+Math.round(input.baseB)+' ('+how+')');
    calN=0; calSeen=0; calAllG=0; calAllB=0; calQuiet=0; // v1.100.3: тишина испитa — режим снят
    if(calToast){ calToast=false; haptic('light'); svcToast(L.calibrated,'rgba(143,255,159,.5)'); } // v1.103.0: сервисный сорт — в полёте молчит
    return true;
  }
  return false;
}

// remap осей под ориентацию экрана — ЕДИНСТВЕННОЕ место логики
function remapAxes(g,b){
  const ang=(screen.orientation&&screen.orientation.angle!=null?screen.orientation.angle:(window.orientation||0));
  if(ang===90||ang===-270) return [b,-g];
  if(ang===-90||ang===270) return [-b,g];
  if(Math.abs(ang)===180)  return [-g,-b];
  return [g,b];
}

function onTilt(e){
  if(e.gamma==null) return;
  let g=e.gamma, b=(e.beta==null?0:e.beta);
  if(!isFinite(g)||!isFinite(b)) return; // мусор с датчика не должен убивать координаты
  lastGamma=g; lastBeta=b; if(typeof e.alpha==='number'&&isFinite(e.alpha)) lastAlpha=e.alpha;
  input._t=performance.now();
  if(!tiltBtnGone){ const tb=$('tiltBtn'); if(tb){ tb.classList.add('hidden'); tiltBtnGone=true; } } // датчик жив — просьба о разрешении не нужна; DOM трогаем один раз (v1.66.1)
  const rb=b; // v1.102.2: сырая β до remap — свидетельство о гравитации для «Двух компасов»
  const m=remapAxes(g,b); g=m[0]; b=m[1];
  if(poseSG==null){ poseSG=g; poseSB=b; } else { poseSG=lerp(poseSG,g,.08); poseSB=lerp(poseSB,b,.08); } // v1.100.4: след руки — медленный, ветер пакетов не качает
  if(input.baseG==null){ // ноль ещё не принят: ждём неподвижную позу, руления до калибровки нет
    prevG=g; prevB=b;
    if(!calFeed(g,b,rb)) return;
  }
  if(prevG!=null && (Math.abs(g-prevG)>55 || Math.abs(b-prevB)>55)){ // «дёрнуло набок» при перевороте: выброс в руление не пускаем
    flipN++; prevG=g; prevB=b;
    if(flipN>=3){ flipN=0; calReset(false,true); } // телефон действительно перевернули — заново найдём ноль новой позы; v1.100.3: после кульбита — только из тишины
    return;
  }
  flipN=0; prevG=g; prevB=b;
  const rx=clamp((g-input.baseG)/24*input.sens,-1,1);
  const ry=clamp((b-input.baseB)/24*input.sens,-1,1);
  input.tiltX=lerp(input.tiltX, deadzone(rx), .2); // low-pass
  input.tiltY=lerp(input.tiltY, deadzone(ry), .2);
  input.useGyro=true;
}
/* ---------- Два канала данных датчика ----------
   1) Родной мост Telegram (Bot API 8.0, tg.DeviceOrientation) — единственный
      надёжный путь в iOS-Telegram: там WKWebView по web-событию deviceorientation
      либо молчит, либо requestPermission мгновенно отвечает denied без диалога.
   2) Web deviceorientation — Android-Telegram, браузеры, десктоп.
   Пока мост жив (пакеты свежие, <1с), веб-канал игнорируем — физически это тот
   же датчик. Но «жив» — это поток, а не флаг: на части Android-клиентов мост
   стартует, шлёт пару пакетов и глохнет. Замолчал >1с — эксклюзив снимается,
   веб-канал подхватывает эстафету автоматически.

   Страж живых значений (v1.89.0): на части Android-мостов пакеты бегут вечно,
   но углы внутри заморожены (γ0° β1° всегда, tx 0) — сторож тишины такой канал
   считает живым, и здоровый веб-канал голодает за эксклюзивом. Поэтому каждому
   каналу меряем не пульс, а дыхание: разброс углов за скользящее окно (~2с).
   Замороженный канал теряет эксклюзив, даже если пакеты бегут; рулит тот, чьи
   значения живо меняются. Телефон на столе — легальный штиль: оба канала тихи,
   штурман не переходит, вреда нет; поднял — кто первый ожил, тот и штурман. */
let tgOrientLive=false, tgOrientLast=0, gyroSrc='none'; // 'none' | 'tg' | 'web' — диагностика для настроек
let tgPkt=0, webPkt=0; // счётчики пакетов мост/веб — видно, какой канал реально течёт
const LIVE_WIN=2000, LIVE_MIN=8, LIVE_SPREAD=0.4; // окно стража, мин. пакетов для суда, порог разброса (°)
const chanHist={tg:[],web:[]}; // {t,g,b} — скользящие окна дыхания каналов
function chanFeed(chan,g,b){
  const h=chanHist[chan], now=performance.now();
  h.push({t:now,g:g,b:b});
  while(h.length && now-h[0].t>LIVE_WIN) h.shift();
  liarCourt(); // v1.104.0: каждый пакет — улика; суд компасов заседает на свежих окнах
}
function chanSpread(chan){ // разброс (γ+β) в окне; -1 — судить рано (окно не набрано)
  const h=chanHist[chan]; if(h.length<LIVE_MIN) return -1;
  let mn=Infinity, mx=-Infinity;
  for(let i=0;i<h.length;i++){ const v=h[i].g+h[i].b; if(v<mn)mn=v; if(v>mx)mx=v; }
  return mx-mn;
}
function chanSilent(chan){ const h=chanHist[chan]; return !h.length || performance.now()-h[h.length-1].t>1000; }
function chanAlive(chan){ return !chanSilent(chan) && chanSpread(chan)>=LIVE_SPREAD; } // пакеты свежие и значения дышат
function chanFrozen(chan){ return !chanSilent(chan) && chanSpread(chan)>=0 && chanSpread(chan)<LIVE_SPREAD; } // пакеты бегут, значения мертвы
function maySteer(x){ // арбитраж штурвала: продолжение руля — всегда; смена — по молчанию, по смерти значений, по приговору
  if(steerChan===x || steerChan==='none') return true;
  const y=x==='tg'?'web':'tg';
  if(chanSilent(y)) return true;                                  // штурман замолчал — эстафета (старое правило тишины)
  if(chanLiar(x)) return false;                                   // v1.104.0: осуждённый лжец штурвал не отбирает
  if((chanFrozen(y)||chanLiar(y)) && chanAlive(x)) return true;   // штурман мёртв или осуждён, а мы живы — забираем штурвал
  return false;                                                   // оба дышат честно или оба замерли — штурман не переходит, калибровка цела
}
/* v1.99.8 «Тихий штурман»: шторм — сигнал мечется быстрее любой руки (±80° за 2с;
   руль в полном размахе даёт лишь ~48°), тишь — дыхание руки до 40°. Живая регрессия:
   поза β~80° рядом с сингулярностью Эйлера гнала веб-канал в бред (нули 89° → −84°),
   а мост в те же секунды был тих — но арбитраж видел лишь «молчит/замёрз», не «бредит». */
const STORM_SPREAD=80, CALM_SPREAD=40;
/* v1.104.0 «Компас и лжец»: суд компасов. Живая регрессия с чёрного ящика (Android,
   180 событий): мост дрожал рядом с нулём (β1°±1°) — страж дыхания его пропускал
   (разброс ≥0.4°), а он врал, где низ: рука честно держала β85°. Итоги: вечный
   карантин нуля (15–25с без гироскопа, пилот гиб) и мёртвый штурвал (шторм отдавал
   руль «тихому живому» лжецу — самолёт не слушался 1–2с).
   Закон: рука одна — низ один. Тихий канал (разброс <LIAR_QUIET) при ТРЕЗВОМ соседе
   (разброс CALM..STORM: рука в движении, сам не в шторме — его медиане β верим),
   чья медиана β в 40°+ от его медианы, — ЛЖЕЦ. Штормящий свидетель не судит:
   в шторм Эйлера его β бредит, улика нечиста. Приговор липнет — молчание не
   реабилитирует; реабилитирует только настоящее дыхание (≥LIAR_QUIET) плюс
   согласие о низе (≤LIAR_AGREE): лжец чинится, когда клиент прогревается.
   Осуждённый теряет права: штурвал в шторм ему не отдают (gyro.js), живой сосед
   штурвал забирает (maySteer), его слово не держит карантин нуля (calFeed). */
const LIAR_QUIET=10, LIAR_AGREE=25;
const liarMark={tg:0,web:0}; // приговор: метка времени последнего суда; 0 — чист
function chanBetaMed(chan){ // медиана β окна — где канал видит низ; -1 — судить рано
  const h=chanHist[chan]; if(h.length<LIVE_MIN) return -1;
  const a=h.map(p=>p.b).sort((x,y)=>x-y); return a[a.length>>1];
}
function liarCourt(){
  for(const c of ['tg','web']){
    const o=c==='tg'?'web':'tg';
    const sc=chanSpread(c), so=chanSpread(o);
    if(sc<0||so<0) continue; // окна не набраны — судить рано
    const mc=chanBetaMed(c), mo=chanBetaMed(o); if(mc<0||mo<0) continue;
    const sober=!chanSilent(o) && so>=CALM_SPREAD && so<STORM_SPREAD; // сосед: рука в движении, сам не в шторме
    if(sober && sc<LIAR_QUIET && Math.abs(mc-mo)>40){ // тихий врёт, где низ, — при движущейся руке
      if(!liarMark[c] && typeof BB!=='undefined') BB.log('liar',c+' осуждён: штиль '+Math.round(sc)+'° β'+Math.round(mc)+' при руке '+o+' β'+Math.round(mo)+' (разброс '+Math.round(so)+'°)');
      if(!liarMark[c] && typeof BEACON!=='undefined') BEACON.signal('liar',c); // v1.107.0 «Почта неба»: приговор лжецу — симптом железа, летит экипажу
      liarMark[c]=performance.now();
    } else if(liarMark[c] && sc>=LIAR_QUIET && sc<STORM_SPREAD && Math.abs(mc-mo)<=LIAR_AGREE){ // задышал и согласен — реабилитирован
      if(typeof BB!=='undefined') BB.log('liar',c+' реабилитирован: дышит '+Math.round(sc)+'°, β'+Math.round(mc)+' ≈ '+o+' β'+Math.round(mo));
      liarMark[c]=0;
    }
  }
}
function chanLiar(chan){ return liarMark[chan]>0; } // осуждён, пока не реабилитирован
const TG_ORIENT = (tg && tgv('8.0') && tg.DeviceOrientation && typeof tg.DeviceOrientation.start==='function')
  ? tg.DeviceOrientation : null;

function gyroStatus(){
  const el=$('gyroStat'); if(!el) return;
  const live=(lastGamma!=null) ? ' · γ'+Math.round(lastGamma)+'° β'+Math.round(lastBeta==null?0:lastBeta)+'°'+(lastAlpha!=null?' α'+Math.round(lastAlpha)+'°':'') : ''; // живые углы: крутишь телефон — цифры должны меняться; замёрзли = WebView шлёт мёртвые пакеты
  const cal=(input.baseG==null && lastGamma!=null) ? ' · '+L.calIng : ''; // идёт стабильная калибровка нуля — держи позу
  const zero=(input.baseG!=null) ? ' · '+L.calZero+' '+Math.round(input.baseG)+'°' : ''; // принятый ноль: γ сильно расходится с нулём = перекос кадров каналов
  const tx=(Math.abs(input.tiltX)>0.005) ? ' · tx '+input.tiltX.toFixed(2) : ''; // реальный сигнал руления после калибровки и deadzone
  el.innerHTML = ic('gyro')+(gyroSrc==='tg' ? L.gyroStatTg : (gyroSrc==='web' ? L.gyroStatWeb : L.gyroStatNone))+' · '+tgPkt+'/'+webPkt+
    (gyroLastErr ? ' · '+gyroLastErr : '')+live+cal+zero+tx;
  if (typeof diagRefresh==='function') diagRefresh(); // сервисный центр: живые галочки, пока спойлер открыт
}

function onTgOrient(e){ // пакет с моста Telegram; данные в this у события или в полях объекта
  let g=(e && typeof e.gamma==='number') ? e.gamma : (TG_ORIENT && typeof TG_ORIENT.gamma==='number' ? TG_ORIENT.gamma : null);
  let b=(e && typeof e.beta==='number')  ? e.beta  : (TG_ORIENT && typeof TG_ORIENT.beta==='number'  ? TG_ORIENT.beta  : 0);
  const a=(e && typeof e.alpha==='number') ? e.alpha : (TG_ORIENT && typeof TG_ORIENT.alpha==='number' ? TG_ORIENT.alpha : null);
  if(g==null || !isFinite(g) || !isFinite(b)) return;
  tgOrientLive=true; tgOrientLast=performance.now(); tgPkt++; gyroLastErr='';
  chanFeed('tg',g,b); // v1.89.0: стражу — каждый пакет, даже если рулит не мост
  if(!maySteer('tg')){ gyroStatusTick(); return; } // мост мёртв по значениям — живой веб-канал не сдаёт штурвал
  gyroSrc='tg';
  gyroChanIn('tg');
  onTilt({gamma:g, beta:b, alpha:a});
  gyroStatusTick(); // v1.66.1: DOM — только когда настройки открыты
}

let gyroLastErr=''; // последняя причина отказа моста — выводится в диагностику настроек
let tiltBtnGone=false; // v1.66.1: кнопка разрешения скрыта — больше не спрашиваем DOM на каждый пакет
let gyroHudT=0;
function gyroStatusTick(){ // v1.66.1: DOM-диагностика — только при открытых настройках и не чаще ~3 Гц;
  if (screenName!=='settings' && screenName!=='diag') return; // v1.66.3: + экран сервисного центра; в полёте пакеты идут 60 Гц — и ни одной записи в DOM
  const now=performance.now(); if (now-gyroHudT<300) return; gyroHudT=now;
  gyroStatus();
}
function gyroKick(){ // идемпотентный перезапуск моста: клиенты Telegram нередко глушат датчик до первого жеста — пинаем при каждом старте забега
  if (!TG_ORIENT) return false;
  try { TG_ORIENT.start({refresh_rate:60}); return true; }
  catch(err){ gyroLastErr=('kick:'+String(err&&err.message||err)).slice(0,48); gyroStatus(); return false; }
}
function gyroTgFailed(e){ // мост ответил отказом: эксклюзив снят (веб-канал свободен), причина — в диагностику
  tgOrientLive=false;
  const r=(e && (e.error||e.message)) || (typeof e==='string'?e:'');
  gyroLastErr=('fail'+(r?':'+r:'')).slice(0,48);
  if(typeof BB!=='undefined') BB.log('tgfail',gyroLastErr); // v1.99.7 «Чёрный ящик»: отказ моста — на ленту
  if (NEEDS_TILT_PERMISSION){ const b=$('tiltBtn'); if(b){ b.classList.remove('hidden'); tiltBtnGone=false; } } // v1.66.1: кнопка снова видна — пакетам позволено её скрыть
  gyroStatus();
}
if (TG_ORIENT){
  try {
    tg.onEvent('deviceOrientationChanged', function(){ onTgOrient(this); });
    tg.onEvent('deviceOrientationFailed', gyroTgFailed);
    gyroKick();
  } catch(err){}
}

window.addEventListener('deviceorientation', e=>{
  const g=e.gamma, b=(e.beta==null?0:e.beta);
  if(typeof g==='number' && isFinite(g) && isFinite(b)) chanFeed('web',g,b); // v1.89.0: стражу — каждый пакет, даже отфильтрованный
  if (tgOrientLive && performance.now()-tgOrientLast<1000 && steerChan!=='web' && !((chanFrozen('tg')||chanLiar('tg')) && chanAlive('web'))) return; // мост свеж и дышит — не дублируем; мост мёртв или осуждён, а веб жив — принимаем эстафету. v1.99.8: действующий штурман не тонет в шлюзе — иначе оживший мост глушил веб, а сам не рулил (руль замирал при двух живых каналах). v1.104.0: осуждённый лжец эксклюзив не держит
  if (tgOrientLive && performance.now()-tgOrientLast>=1000) tgOrientLive=false; // мост замолчал >1с — эксклюзив снят
  if (!maySteer('web')) return; // штурман жив, а веб мёртв — штурвал не отбираем
  gyroSrc='web'; webPkt++; gyroStatusTick(); // v1.66.1: DOM — только когда настройки открыты
  gyroChanIn('web');
  onTilt(e);
});
// Поворот экрана: оси меняются, старый ноль врёт — пересчитаем на следующем пакете
window.addEventListener('orientationchange', ()=>calReset(false,true)); // v1.100.3: поворот экрана — тоже буря для осей, ноль — из тишины

function calibrateTilt(){ // ручная калибровка — через ту же стабильную процедуру: ноль возьмётся из устоявшейся позы
  if(lastGamma==null){ toast(L.noTilt,'rgba(255,159,176,.5)'); haptic('error'); return; }
  calReset(true); svcToast(L.calWait,'rgba(159,232,255,.5)'); // v1.103.0: сервисный сорт — в полёте молчит
}
/* iOS Permission: без автозапросов. Красивая кнопка «Разрешить управление
   наклоном?» живёт в меню (ui.js), системный диалог — строго по её тапу. */

/* ---------- Тач: «Тап против Свайпа» ----------
   В полёте второстепенных кнопок нет — любое касание это попытка рулить.
   Но случайный тап (<0.2с и без движения) игнорируем: игрок на гироскопе
   просто поправил хват — режим остаётся «Гироскоп». Драг (потянул палец)
   или удержание (>0.2с) — осознанное руление: режим переключается на «Тач». */
const TAP_MS=200, MOVE_PX=12;
let tDown=false, tActive=false, tStartX=0, tStartY=0, tCurX=0, tCurY=0, tStartT=0;
window.addEventListener('touchstart',e=>{
  audio();
  if(tDown) return; // второй палец не сбрасывает жест первого
  const t=e.touches[0];
  tStartX=tCurX=t.clientX; tStartY=tCurY=t.clientY; tStartT=performance.now();
  tDown=true; tActive=false; // руление НЕ включаем — ждём, тап это или свайп
},{passive:true});
window.addEventListener('pointermove',e=>{ // v1.12.0: экраны с опросом 240+ Гц отдают пачку сэмплов за кадр — берём самый свежий
  if(e.pointerType!=='touch' || !tActive) return;
  const evs=e.getCoalescedEvents?e.getCoalescedEvents():null;
  const ev=evs&&evs.length?evs[evs.length-1]:e;
  input.touchX=ev.clientX/SC; input.touchY=ev.clientY/SC; // v1.99.0 «Метр неба»: палец говорит мерами неба
},{passive:true});
window.addEventListener('touchmove',e=>{
  e.preventDefault();
  const t=e.touches[0]; tCurX=t.clientX; tCurY=t.clientY;
  if(tDown && !tActive && Math.hypot(tCurX-tStartX,tCurY-tStartY)>MOVE_PX) tActive=true; // свайп → рулим (жест меряем пальцем, не небом)
  if(tActive){ input.touchX=tCurX/SC; input.touchY=tCurY/SC; } // v1.99.0
},{passive:false});
function touchEnd(){ tDown=false; tActive=false; input.touchX=null; input.touchY=null; }
window.addEventListener('touchend',e=>{ if(e.touches.length===0) touchEnd(); });
window.addEventListener('touchcancel',touchEnd);
// удержание на месте >0.2с — тоже осознанное руление (опрос из игрового цикла)
function pollTouchHold(){
  if(tDown && !tActive && performance.now()-tStartT>TAP_MS){
    tActive=true; input.touchX=tCurX/SC; input.touchY=tCurY/SC; // v1.99.0 «Метр неба»
  }
}
window.addEventListener('mousedown',e=>{ input.touchX=e.clientX/SC; input.touchY=e.clientY/SC; }); // v1.99.0
window.addEventListener('mousemove',e=>{ if(e.buttons){ input.touchX=e.clientX/SC; input.touchY=e.clientY/SC; } }); // v1.99.0
window.addEventListener('mouseup',()=>{ input.touchX=null; input.touchY=null; });
window.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- Клавиатура (desktop fallback: стрелки + WASD + рус. раскладка) ---------- */
/* ---------- Геймпад (v1.99.4 «Штурвал»): стик и крестовина рулят, А — взлёт, Start — пауза ---------- */
/* Рулит в том же канале, что и стрелки: физика не знает, кто за штурвалом.
   Свои флаги помечает — чужие (клавиатура) не трогает. Браузер отдаёт геймпад
   только после первого нажатия на нём — правило приватности, нам оно на руку:
   «нажми А, чтобы взлететь» — и дверь уже открыта. */
const PAD_DZ=.2; // мёртвая зона стика: дрейф без нажатия не рулит
let padPrev={a:false,st:false}, padLastId=null; // padLastId — v1.99.7: стыковка/отстыковка на ленту
const padOwn={l:false,r:false,u:false,d:false}; // какие флаги руля поставил штурвал — только их и снимает
function pollGamepad(){
  if(typeof navigator==='undefined'||typeof navigator.getGamepads!=='function') return;
  let gp=null;
  try{ const pads=navigator.getGamepads();
    for(let i=0;i<pads.length;i++){ if(pads[i]&&pads[i].connected){ gp=pads[i]; break; } }
  }catch(e){ return; }
  const pid=gp?String(gp.id||'pad'):null; // v1.99.7 «Чёрный ящик»: фронты стыковки — не каждый кадр
  if(pid!==padLastId){ if(typeof BB!=='undefined') BB.log('helm', pid!=null?'connected '+pid.slice(0,40):'disconnected'); padLastId=pid; }
  if(!gp){ padPrev.a=padPrev.st=false;
    if(padOwn.l){input.keyL=false;padOwn.l=false;} if(padOwn.r){input.keyR=false;padOwn.r=false;}
    if(padOwn.u){input.keyU=false;padOwn.u=false;} if(padOwn.d){input.keyD=false;padOwn.d=false;}
    return; } // штурвал отстыковался — сдаём только свои флаги
  const ax=gp.axes[0]||0, ay=gp.axes[1]||0;
  const btn=i=>!!(gp.buttons[i]&&gp.buttons[i].pressed);
  const L=ax<-PAD_DZ||btn(14), R=ax>PAD_DZ||btn(15), U=ay<-PAD_DZ||btn(12), D=ay>PAD_DZ||btn(13);
  if(L){input.keyL=true;padOwn.l=true;} else if(padOwn.l){input.keyL=false;padOwn.l=false;}
  if(R){input.keyR=true;padOwn.r=true;} else if(padOwn.r){input.keyR=false;padOwn.r=false;}
  if(U){input.keyU=true;padOwn.u=true;} else if(padOwn.u){input.keyU=false;padOwn.u=false;}
  if(D){input.keyD=true;padOwn.d=true;} else if(padOwn.d){input.keyD=false;padOwn.d=false;}
  const a=btn(0), st=btn(9); // фронты, не уровни: зажатая кнопка не долбит
  if(a&&!padPrev.a){ if(screenName==='menu') runStart(); else if(screenName==='over') retryRun(); }
  if(st&&!padPrev.st){ if(screenName==='game') pauseGame(); else if(screenName==='pause') resumeGame(); }
  padPrev.a=a; padPrev.st=st;
}

window.addEventListener('keydown',e=>{
  const k=e.key;
  if(k==='ArrowLeft'||k==='a'||k==='A'||k==='ф'||k==='Ф'){input.keyL=true;e.preventDefault();}
  if(k==='ArrowRight'||k==='d'||k==='D'||k==='в'||k==='В'){input.keyR=true;e.preventDefault();}
  if(k==='ArrowUp'||k==='w'||k==='W'||k==='ц'||k==='Ц'){input.keyU=true;e.preventDefault();}
  if(k==='ArrowDown'||k==='s'||k==='S'||k==='ы'||k==='Ы'){input.keyD=true;e.preventDefault();}
  if(k===' '||k==='Enter'){ if(screenName==='menu') runStart(); else if(screenName==='over') retryRun(); e.preventDefault(); } // как главная кнопка экрана: выбранная дисциплина, не всегда классика
  if(k==='Escape'||k==='p'||k==='P'){ if(screenName==='game') pauseGame(); else if(screenName==='pause') resumeGame(); }
});
window.addEventListener('keyup',e=>{
  const k=e.key;
  if(k==='ArrowLeft'||k==='a'||k==='A'||k==='ф'||k==='Ф')input.keyL=false;
  if(k==='ArrowRight'||k==='d'||k==='D'||k==='в'||k==='В')input.keyR=false;
  if(k==='ArrowUp'||k==='w'||k==='W'||k==='ц'||k==='Ц')input.keyU=false;
  if(k==='ArrowDown'||k==='s'||k==='S'||k==='ы'||k==='Ы')input.keyD=false;
});
