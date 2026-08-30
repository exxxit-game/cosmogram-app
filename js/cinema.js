'use strict';
/* ============================================================
   CINEMA (модуль «Кино полёта» — см. владелец, 28.08.2026, и
   .knowledge/FLIGHT-CINEMA-ARCHITECTURE.md). Шаг 1 — подбор
   кодека. Шаг 2 — сама запись живого канваса в mp4 через
   VideoEncoder + вендоренный упаковщик (js/vendor/mp4-muxer.min.js,
   Vanilagy/mp4-muxer, MIT). Пока не вызывается ниоткуда из игры —
   следующий шаг подключит автозапись первого полёта.

   Порядок и сами кодеки — по живым пробам webcodecsProbe()
   (js/beacon.js) из таблицы beacons (проверено 28.08.2026, 110
   проб: 82 android, 20 Win32, 3 ios, несколько linux/tdesktop):
     H.264 — 0% и на Android, и на Win32 (аппаратно и программно),
             но 100% на iOS (3 из 3 проб, hw и sw) — пробуем первым,
             дёшево для платформ, где он есть.
     VP9   — программно ~72% Android, 90% Win32, 100% iOS.
   VP8 из списка убран 28.08.2026: mp4-muxer (см. build/mp4-muxer.d.ts,
   VideoOptions.codec) принимает только 'avc'|'hevc'|'vp9'|'av1' —
   контейнер MP4 не может нести VP8 вообще, он не стандартный кодек
   для этого контейнера. AV1 не пробуем: 63% Android, ниже соседей.
   Примерно у 28% проверенных Android-устройств не собрался НИ ОДИН
   кодек — на них pickVideoCodec() честно вернёт null, а не подменит
   отказ подделкой. */
/* ---------- Реплики к моменту (30.08.2026, владелец, черновик по-русски, остальные 4 языка — мой
   черновой перевод, НЕ сверен носителем — качество ES/PT/FR ниже, чем у RU/EN) ----------
   По языку игрока (langEff, см. ui.js applyLangPref — единый источник «на каком языке мы сейчас»).
   Пока просто плоский пул на язык, случайный выбор без защиты от повтора — антиповтор имеет смысл,
   когда пул вырастет заметно больше 8 строк на категорию. */
const CINEMA_LINES={
  ru:{ record:['НОВЫЙ РЕКОРД!','Космическая скорость.','Так ещё никто не летал.','Старый рекорд в шоке.',
      'Вот это разгон!','Улетел выше космоса.','Рекорд? Обычное дело.','Небо запомнит этот полёт.'],
    nearmiss:['На волосок!','Вот это нервы.','Ещё сантиметр — и всё.','Просвистело рядом.',
      'Хладнокровный пилот.','Космос дышал в крыло.','Ювелирная работа.','Тоньше некуда.'],
    death:['Ну хоть красиво.','Астероид оказался крепче.','Не в этот раз.','Приземление... неудачное.',
      'Разбился о собственную смелость.','Полёт окончен. Слава была близко.','Космос забрал своё.','Ещё один герой пал красиво.'] },
  en:{ record:['NEW RECORD!','Cosmic speed.',"Nobody's flown like this.",'Old record: shook.',
      'What a burn!','Flew past the cosmos.','Record? Just routine.','The sky will remember this.'],
    nearmiss:['So close!','Nerves of steel.','One inch from the end.','Whistled right by.',
      'Ice-cold pilot.','Space grazed the wing.','Surgical precision.',"Couldn't be closer."],
    death:['At least it looked good.','The asteroid won this round.','Not this time.','Landing... unsuccessful.',
      'Crashed by his own courage.','Flight over. Glory was close.','Space took its due.','Another hero, fallen in style.'] },
  es:{ record:['¡NUEVO RÉCORD!','Velocidad cósmica.','Nadie ha volado así.','El récord anterior, temblando.',
      '¡Qué acelerón!','Voló más allá del cosmos.','¿Récord? Cosa de todos los días.','El cielo recordará este vuelo.'],
    nearmiss:['¡Por un pelo!','Qué nervios.','Un centímetro más y se acaba.','Pasó rozando.',
      'Piloto de sangre fría.','El espacio rozó el ala.','Precisión de relojero.','No se pudo más ajustado.'],
    death:['Al menos quedó bonito.','El asteroide ganó esta vez.','Esta vez no.','Aterrizaje... fallido.',
      'Se estrelló por su propio valor.','Vuelo terminado. La gloria estuvo cerca.','El espacio cobró lo suyo.','Otro héroe, caído con estilo.'] },
  pt:{ record:['NOVO RECORDE!','Velocidade cósmica.','Ninguém voou assim antes.','O recorde antigo tremeu.',
      'Que aceleração!','Voou além do cosmos.','Recorde? Rotina.','O céu vai lembrar deste voo.'],
    nearmiss:['Por um triz!','Que nervos.','Mais um centímetro e era o fim.','Passou raspando.',
      'Piloto de sangue frio.','O espaço roçou a asa.','Trabalho de relojoaria.','Não dava pra ser mais justo.'],
    death:['Pelo menos ficou bonito.','O asteroide venceu dessa vez.','Não dessa vez.','Pouso... malsucedido.',
      'Caiu pela própria coragem.','Voo encerrado. A glória estava perto.','O espaço cobrou o que era dele.','Mais um herói, caído com estilo.'] },
  fr:{ record:['NOUVEAU RECORD !','Vitesse cosmique.',"Personne n'a jamais volé comme ça.",'L’ancien record en tremble.',
      'Quelle accélération !','Envolé au-delà du cosmos.','Record ? Une formalité.','Le ciel se souviendra de ce vol.'],
    nearmiss:['Au poil !','Quels nerfs.','Un centimètre de plus et c’était fini.','Ça a sifflé tout près.',
      'Pilote au sang-froid.','L’espace a frôlé l’aile.','Travail de précision.','Impossible de faire plus serré.'],
    death:['Au moins, c’était beau.','L’astéroïde a gagné cette fois.','Pas cette fois.','Atterrissage... raté.',
      'Écrasé par son propre courage.','Vol terminé. La gloire était proche.','L’espace a pris son dû.','Un héros de plus, tombé avec classe.'] },
};
function cinemaPickLine(cat){
  const lang=(typeof langEff!=='undefined' && CINEMA_LINES[langEff]) ? langEff : 'ru';
  const a=CINEMA_LINES[lang][cat]; return a ? a[Math.floor(Math.random()*a.length)] : '';
}

/* ---------- Вжигание текста в кадр (30.08.2026) ----------
   Рисуем НЕ на живом канвасе игры (render.js не трогаем) — а на отдельном канвасе-компоновщике:
   копия игрового кадра + подпись поверх, и уже ЕГО кодируем. Игра выглядит как всегда, текст есть
   только в записанном ролике. 30.08.2026 (владелец): отдельный тихий водяной знак был незаметен —
   авторство переехало прямо под реплику, тем же кадром внимания, а не отдельной невзрачной меткой.
   Пока прототип: одна статичная реплика на весь ролик — тайминг (когда именно появляется реплика,
   если их несколько) не решён, это отдельный следующий шаг. */
function cinemaDrawOverlay(ctx, w, h, caption){
  if (!caption) return;
  ctx.textBaseline='alphabetic'; ctx.textAlign='center';
  const fs=Math.round(h*0.038), fs2=Math.round(h*0.02); // реплика + строка авторства помельче под ней
  const padY=fs*0.55, gap=fs*0.35, barY=h*0.10, barH=fs+fs2+gap+padY*2;
  ctx.fillStyle='rgba(6,10,20,.55)';
  ctx.fillRect(0, barY-barH/2, w, barH);
  ctx.font='700 '+fs+'px "Exo 2", sans-serif';
  ctx.fillStyle='#fff';
  ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=Math.round(h*0.004);
  const capY=barY-barH/2+padY+fs*0.78;
  ctx.fillText(caption, w/2, capY);
  ctx.font='600 '+fs2+'px "Exo 2", sans-serif';
  ctx.fillStyle='#f0c040'; // --gold-hi: тот же золотой, что у рекордов/чисел в игре
  ctx.fillText('© Cosmogram', w/2, capY+fs2+gap);
  ctx.shadowBlur=0;
}

const CINEMA_CODECS=[
  {id:'h264', str:'avc1.42001E', mux:'avc'},
  {id:'vp9',  str:'vp09.00.10.08', mux:'vp9'},
];
async function pickVideoCodec(w, h){
  w = w||1080; h = h||1920;
  if (typeof VideoEncoder==='undefined') return null; // старый браузер — честно ничего, не гадаем
  for (const codec of CINEMA_CODECS){
    const cfg={ codec:codec.str, width:w, height:h, bitrate:2_000_000, framerate:30, hardwareAcceleration:'no-preference' };
    try{
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r && r.supported) return { id:codec.id, mux:codec.mux, config:cfg };
    }catch(e){} // отказ этого кодека — пробуем следующий по списку, не ошибка модуля
  }
  return null; // ни один кодек не собрался — честный отказ, дальше решает вызывающий код
}

/* ---------- Шаг 2: сама запись ----------
   Кадры берутся прямо с канваса игры через VideoFrame(canvas, {timestamp}) —
   без captureStream()/MediaStreamTrackProcessor (у того капризная поддержка
   между браузерами). Кодируется и упаковывается ПОТОКОВО, кадр за кадром —
   сырые кадры не копятся в памяти (см. разбор цены с владельцем 28.08.2026 и
   AI-DECISION-REGISTRY A9/«Frame-Key Caching» — тот же класс ошибки, которого
   избегаем: 1080×1920 RGBA кадр — 8.3МБ, на 1800 кадрах (60с×30fps) это уже
   ~15ГБ, если копить сырыми). Итоговый файл — тот порядок, что в конфиге
   (bitrate 2 Мбит/с) — около 15МБ на минуту. */
let _cinemaRec=null;
let _cinemaOwner=null; // 30.08.2026: 'first' | 'test' | 'highlight' — единственная запись (_cinemaRec) на нескольких
  // потребителей, без метки Stop одного мог забрать запись, начатую Start другого (см. разбор с владельцем)

/* ---------- Кольцевая обрезка (30.08.2026, владелец: «момент смерти/рекорда», не весь полёт) ----------
   Смерть непредсказуема заранее, поэтому клип нельзя начать записывать «когда надо» — вместо этого
   пишем как обычно, но НЕ мукшим чанки сразу, а копим их (уже закодированные, не сырые кадры — тот же
   принцип «без сырых кадров в памяти», просто окно короче) и постоянно подрезаем всё старше ~12 сек.
   На Stop мукшим только то, что осталось. Готовый mp4 обязан НАЧИНАТЬСЯ с ключевого кадра — поэтому
   резать можно только по границе ключевого кадра, не как попало (см. trimRing). */
/* 30.08.2026 (владелец): «просто так оно не станет вирусным» — если рекорд случился РАНЬШЕ, чем
   началось обычное хвостовое окно, клип должен дотянуться до него, а не потерять. pinnedUs (если
   задан) отодвигает начало окна назад до момента рекорда, но не дальше maxWindowUs от текущего
   момента — потолок, чтобы очень ранний рекорд на длинном полёте не растянул клип бесконечно. */
function trimRing(ring, windowUs, pinnedUs, maxWindowUs){
  if (!ring.length) return false;
  const nowTs = ring[ring.length-1].ts;
  const hardFloor = nowTs - (maxWindowUs||windowUs); // потолок длины — дальше не тянемся, даже ради закреплённого момента
  let desired = nowTs - windowUs; // обычная цель — короткий хвост
  if (pinnedUs != null && pinnedUs < desired) desired = pinnedUs; // рекорд старше хвоста — тянемся к нему
  let pinLost = false;
  if (desired < hardFloor){ desired = hardFloor; pinLost = (pinnedUs != null); } // потолок победил — закреплённый момент не поместился
  let keepFrom = 0; // ни одного ключевого кадра в окне ещё не было — оставляем как есть (ring[0] всегда key, см. grab())
  for (let i=0;i<ring.length;i++){ if (ring[i].key && ring[i].ts <= desired) keepFrom = i; }
  if (keepFrom > 0) ring.splice(0, keepFrom);
  return pinLost;
}
/* 30.08.2026 (владелец): «два коротких куска со склейкой» — если момент рекорда не поместился даже с
   потолком (pinLost), берём его отдельным снимком (не зависящим от общей подрезки кольца) и на Stop
   склеиваем встык с обычным коротким хвостом перед смертью. Жёсткая склейка, без перехода/кроссфейда —
   это уже переисполнение (декод+рендер+перекодирование), тот самый расход памяти на сырые кадры, которого
   весь модуль сознательно избегает. CINEMA_SNAPSHOT_SPAN_US — сколько снимка вокруг момента брать. */
const CINEMA_SNAPSHOT_SPAN_US = 4_000_000; // ~4 сек — предложенное число, не проверено с владельцем отдельно
async function cinemaMuxSegments(makeMuxer, decoderConfig, segments){
  const made = makeMuxer();
  let offset = 0, firstChunk = true;
  for (const seg of segments){
    if (!seg || !seg.length) continue;
    const segStart = seg[0].ts;
    for (const e of seg){
      const newTs = e.ts - segStart + offset;
      let chunkToAdd = e.chunk, meta = e.meta;
      if (newTs !== e.ts){ // склейка второго сегмента — его штампы времени продолжают первый, EncodedVideoChunk неизменяем
        const buf = new Uint8Array(e.chunk.byteLength);
        e.chunk.copyTo(buf);
        chunkToAdd = new EncodedVideoChunk({ type: e.chunk.type, timestamp: newTs, duration: e.chunk.duration, data: buf });
      }
      if (firstChunk && decoderConfig && !(meta && meta.decoderConfig)) meta = { ...(meta||{}), decoderConfig };
      try{ made.muxer.addVideoChunk(chunkToAdd, meta); }catch(err){}
      firstChunk = false;
    }
    const lastE = seg[seg.length-1];
    offset += (lastE.ts - segStart) + (lastE.chunk.duration || 33333); // следующий сегмент начинается сразу после этого
  }
  made.muxer.finalize();
  return new Blob([made.target.buffer], { type: 'video/mp4' });
}
async function cinemaStart(canvas, ringWindowUs, maxWindowUs, overlayCaption){
  if (_cinemaRec) return false; // уже пишем — вторая запись поверх первой не начинается
  if (!canvas || !canvas.width || !canvas.height) return false;
  const picked = await pickVideoCodec(canvas.width, canvas.height);
  if (!picked) return false; // честный отказ — на этом устройстве нет рабочего кодека

  // 30.08.2026: прототип вжигания текста — отдельный канвас-компоновщик, живой канвас игры не трогаем
  let ov=null;
  if (overlayCaption){
    const oc = document.createElement('canvas'); oc.width=canvas.width; oc.height=canvas.height;
    ov = { oc, octx: oc.getContext('2d') };
  }

  const muxCfg = { video: { codec: picked.mux, width: canvas.width, height: canvas.height, frameRate: 30 },
    fastStart: 'in-memory', firstTimestampBehavior: 'offset' }; // кадры идут от performance.now() — не с нуля, см. d.ts
  const makeMuxer = () => {
    const t = new Mp4Muxer.ArrayBufferTarget();
    const m = new Mp4Muxer.Muxer({ target: t, ...muxCfg });
    return { target: t, muxer: m };
  };

  const ring = ringWindowUs ? [] : null;
  let target=null, muxer=null, decoderConfig=null, pinnedUs=null, snapshot=null, snapshotGrowUntil=0;
  // 30.08.2026: VideoEncoder кладёт decoderConfig только в meta САМОГО ПЕРВОГО чанка сессии, не в каждый
  // ключевой — обрезка кольца выбрасывает тот чанк, и новый муксер без decoderConfig на своём первом чанке
  // падал в finalize() (проверено живьём: mp4-muxer.min.js TypeError на null.colorSpace). Запоминаем его
  // один раз и подставляем обратно первому чанку в обрезанном окне (и в снимке — см. markRecord ниже).
  if (!ring){ const made = makeMuxer(); target = made.target; muxer = made.muxer; }

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && !decoderConfig) decoderConfig = meta.decoderConfig;
      if (ring){
        const entry = { chunk, meta, ts: chunk.timestamp, key: chunk.type==='key' };
        ring.push(entry);
        trimRing(ring, ringWindowUs, pinnedUs, maxWindowUs);
        if (snapshot && entry.ts <= snapshotGrowUntil) snapshot.push(entry); // снимок момента растёт своим окном, кольцо его не подрежет
      }
      else { try{ muxer.addVideoChunk(chunk, meta); }catch(e){} }
    },
    error: (e) => { if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_enc_err', String((e&&e.message)||e)); },
  });
  try{ encoder.configure(picked.config); }catch(e){ return false; }

  const frameMs = 1000/30;
  const t0 = performance.now();
  let frameN = 0;
  const grab = () => {
    if (!_cinemaRec) return;
    try{
      let src = canvas;
      if (ov){ ov.octx.drawImage(canvas,0,0); cinemaDrawOverlay(ov.octx, canvas.width, canvas.height, overlayCaption); src = ov.oc; }
      const frame = new VideoFrame(src, { timestamp: Math.round((performance.now()-t0)*1000) });
      // ключевой кадр раз в ~2 сек (и всегда самый первый) — иначе обрезке кольца не от чего оттолкнуться
      encoder.encode(frame, { keyFrame: (frameN % 60 === 0) });
      frame.close();
      frameN++;
    }catch(e){} // один пропущенный кадр не должен уронить всю запись
  };
  _cinemaRec = { encoder, muxer, target, ring, ringWindowUs, maxWindowUs, makeMuxer,
    getDecoderConfig: () => decoderConfig,
    markRecord: () => { // первое пересечение рекорда — единственное, второе не бывает
      if (pinnedUs!=null || !ring) return;
      pinnedUs = Math.round((performance.now()-t0)*1000);
      let from = 0; // снимок стартует с последнего ключевого кадра на момент рекорда (или раньше — если такого ещё не было)
      for (let i=0;i<ring.length;i++){ if (ring[i].key && ring[i].ts <= pinnedUs) from = i; }
      snapshot = ring.slice(from);
      snapshotGrowUntil = pinnedUs + CINEMA_SNAPSHOT_SPAN_US;
    },
    getPinnedUs: () => pinnedUs,
    getSnapshot: () => snapshot,
    timer: setInterval(grab, frameMs) };
  return true;
}
function cinemaMarkRecord(){ if (_cinemaRec && _cinemaRec.markRecord) _cinemaRec.markRecord(); } // 30.08.2026: снаружи, без правки ядра — вызывающий код сам решает, когда счёт обогнал рекорд
async function cinemaStop(){
  if (!_cinemaRec) return null;
  const { encoder, muxer, target, timer, ring, ringWindowUs, maxWindowUs, makeMuxer, getDecoderConfig, getPinnedUs, getSnapshot } = _cinemaRec;
  clearInterval(timer);
  _cinemaRec = null;
  try{
    await encoder.flush();
    encoder.close();
    if (ring){
      const dc = getDecoderConfig();
      const pinLost = trimRing(ring, ringWindowUs, getPinnedUs(), maxWindowUs); // последняя подрезка — flush() мог дописать ещё несколько чанков
      const snapshot = getSnapshot();
      if (pinLost && snapshot && snapshot.length){
        // рекорд не поместился даже с потолком — снимок момента + обычный короткий хвост, встык (см. cinemaMuxSegments)
        trimRing(ring, ringWindowUs, null, ringWindowUs); // ring — теперь просто обычный короткий хвост, без пина
        return await cinemaMuxSegments(makeMuxer, dc, [snapshot, ring]);
      }
      const made = makeMuxer();
      ring.forEach((e, i) => {
        const meta = (i===0 && dc && !(e.meta && e.meta.decoderConfig)) ? { ...e.meta, decoderConfig: dc } : e.meta;
        try{ made.muxer.addVideoChunk(e.chunk, meta); }catch(err){}
      });
      made.muxer.finalize();
      return new Blob([made.target.buffer], { type: 'video/mp4' });
    }
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  }catch(e){ return null; }
}
function cinemaActive(){ return !!_cinemaRec; }

/* ---------- Хранение «первого воспоминания» ----------
   Готовое видео — это Blob в несколько МБ (см. разбор с владельцем: минута ≈ 15МБ
   при 2 Мбит/с) — localStorage хранит только строки и обычно ограничен единицами
   МБ, base64 внутри него раздул бы файл ещё на треть и уткнулся в квоту на первом
   же ролике. IndexedDB — штатное хранилище браузера под бинарные файлы, ровно для
   этого случая, без сторонних библиотек. */
const CINEMA_DB='cosmogram-cinema', CINEMA_STORE='clips', CINEMA_FIRST_KEY='first';
function cinemaDb(){
  return new Promise((resolve, reject) => {
    if (typeof indexedDB==='undefined'){ reject(new Error('no_idb')); return; }
    const r = indexedDB.open(CINEMA_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(CINEMA_STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function cinemaSaveFirst(blob){
  try{
    const db = await cinemaDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readwrite');
      tx.objectStore(CINEMA_STORE).put(blob, CINEMA_FIRST_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  }catch(e){ return false; }
}
async function cinemaLoadFirst(){
  try{
    const db = await cinemaDb();
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readonly');
      const req = tx.objectStore(CINEMA_STORE).get(CINEMA_FIRST_KEY);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return blob;
  }catch(e){ return null; }
}
async function cinemaDeleteFirst(){
  try{
    const db = await cinemaDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readwrite');
      tx.objectStore(CINEMA_STORE).delete(CINEMA_FIRST_KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    Store.set('cinemaFirstDone', 0); // 28.08.2026: удалил — можно, чтобы записалось заново на следующем полёте
    return true;
  }catch(e){ return false; }
}

/* ---------- Жизненный цикл: взлёт → посадка ----------
   Только самый первый полёт на этом устройстве — не спрашивая, «святое воспоминание»
   (решение владельца 28.08.2026). Любой следующий полёт эту запись не трогает —
   ручной способ записывать ещё что-то, помимо первого раза, обсуждается отдельно,
   здесь не реализован. */
function cinemaFirstFlightStart(canvas){
  if (Store.get('cinemaFirstDone', 0)) return; // уже было — не пишем второй раз поверх
  if (cinemaActive()) return; // 30.08.2026: место занято чужой записью (тест) — не перехватываем
  _cinemaOwner='first';
  cinemaStart(canvas); // намеренно без await — взлёт не должен ждать подбор кодека
}
async function cinemaFirstFlightStop(){
  if (!cinemaActive() || _cinemaOwner!=='first') return; // либо не первый полёт, либо кодек не нашёлся на старте, либо запись сейчас чужая — тихо, без ошибки
  _cinemaOwner=null;
  const blob = await cinemaStop();
  Store.set('cinemaFirstDone', 1); // помечаем «было» независимо от успеха — вторая попытка не начнётся молча поверх первой
  if (blob) await cinemaSaveFirst(blob);
  if (typeof firstFlightRefresh==='function') firstFlightRefresh(); // карточка на главном — без ожидания следующего захода в меню
}

/* ---------- Тест «цена записи в бою» (30.08.2026, владелец, живое устройство Samsung A03
   Core — самый слабый борт в парке, куплен специально для таких проверок) ----------
   Отдельная, самая простая запись поверх «Первого полёта»: один явный тест по кнопке
   в Сервисном центре, не вместо памяти первого полёта, ей не мешает. Считает Q.fps
   (уже живая, render.js) каждые 500мс всё время полёта — сравнение среднего FPS
   разговора не заменяет, но даёт число, а не ощущение. */
function cinemaTestArm(){ Store.set('cinemaTestArmed',1); }
let _cinemaTestSamples=null, _cinemaTestTimer=0, _cinemaTestOn=false;
function cinemaTestStart(canvas){
  _cinemaTestOn=false; _cinemaTestSamples=[];
  if (cinemaActive()) return; // 30.08.2026: место занято чужой записью (первый полёт) — не перехватываем
  _cinemaOwner='test';
  cinemaStart(canvas).then(ok=>{
    _cinemaTestOn=ok;
    if(!ok){ _cinemaOwner=null; if(typeof toast==='function') toast('Кодек не нашёлся на этом устройстве','rgba(255,159,176,.5)'); return; }
    _cinemaTestTimer=setInterval(()=>{ if(typeof Q!=='undefined') _cinemaTestSamples.push(Q.fps); },500);
  });
}
async function cinemaTestStop(){
  if(_cinemaTestTimer){ clearInterval(_cinemaTestTimer); _cinemaTestTimer=0; }
  if(!_cinemaTestOn || _cinemaOwner!=='test'){ _cinemaTestOn=false; return; }
  _cinemaTestOn=false; _cinemaOwner=null;
  const blob=await cinemaStop();
  const s=_cinemaTestSamples||[];
  const avg=s.length?+(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1):0;
  const min=s.length?+Math.min(...s).toFixed(1):0;
  const msg='avg:'+avg+' min:'+min+' n:'+s.length+' saved:'+(!!blob);
  if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_test_fps', msg);
  if(typeof toast==='function') toast('Запись: avg '+avg+' fps, мин '+min+' fps','rgba(140,220,180,.5)');
  if(blob){ try{ const db=await cinemaDb();
    await new Promise((res,rej)=>{ const tx=db.transaction(CINEMA_STORE,'readwrite'); tx.objectStore(CINEMA_STORE).put(blob,'test'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
    db.close();
  }catch(e){} }
}
/* ---------- Карточка на главном экране + плеер ----------
   28.08.2026. Своя, независимая от setScreen() накладка (тот же приём, что у
   achClaimShow/Hide в ach.js) — открытие/закрытие плеера не меняет текущий
   экран под собой. Блоб-ссылка (URL.createObjectURL) держится, пока карточка
   жива — отзывается перед выдачей новой, чтобы не копить объекты в памяти
   вкладки при многократных сменах языка/возвратах в меню. */
let _ffUrl=null;
async function firstFlightRefresh(){
  const card=$('firstFlightCard'); if(!card) return;
  const blob = await cinemaLoadFirst();
  if (!blob){ card.classList.add('hidden'); return; }
  if (_ffUrl) URL.revokeObjectURL(_ffUrl);
  _ffUrl = URL.createObjectURL(blob);
  const thumb=$('firstFlightThumb'); if(thumb) thumb.src=_ffUrl;
  card.classList.remove('hidden');
}
function firstFlightFill(){
  if (typeof L==='undefined' || !L.ffcTitle) return;
  const t=$('ffcTitle'); if(t) t.textContent=L.ffcTitle;
  const s=$('ffcSub'); if(s) s.textContent=L.ffcSub;
  const d=$('firstFlightDel'); if(d) d.setAttribute('aria-label', L.ffcDel);
  const c=$('firstFlightClose'); if(c) c.setAttribute('aria-label', L.ffcClose);
}
function firstFlightOpen(){
  const url=$('firstFlightThumb') && $('firstFlightThumb').src; if(!url) return;
  const v=$('firstFlightVideo'); if(!v) return;
  v.src=url; v.currentTime=0;
  const p=$('firstFlightPlayer'); if(p) p.classList.remove('hidden');
  v.play().catch(()=>{}); // автовоспроизведение может быть отклонено — плеер всё равно открыт, кнопка play доступна
  if (typeof sfx!=='undefined' && sfx.click) sfx.click();
}
function firstFlightClosePlayer(){
  const v=$('firstFlightVideo'); if(v){ v.pause(); }
  const p=$('firstFlightPlayer'); if(p) p.classList.add('hidden');
}
function firstFlightDelete(){
  const go=()=>{ cinemaDeleteFirst().then(()=>{ if(typeof firstFlightRefresh==='function') firstFlightRefresh(); }); };
  const msg=(typeof L!=='undefined' && L.ffcDelConfirm)||'Delete this video forever?';
  if (typeof tg!=='undefined' && tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, ok=>{ if(ok) go(); }); }
  else if (typeof confirm==='function'){ if(confirm(msg)) go(); }
  else go(); // нет способа спросить — тот же честный компромисс, что у duelReplaceQ выше в ui.js
}
(function firstFlightWire(){ // грузится раньше ui.js — свои обработчики без общего wireOn()
  const card=$('firstFlightCard'); if(card) card.addEventListener('click', firstFlightOpen);
  const del=$('firstFlightDel'); if(del) del.addEventListener('click', e=>{ e.stopPropagation(); firstFlightDelete(); });
  const close=$('firstFlightClose'); if(close) close.addEventListener('click', firstFlightClosePlayer);
})();
