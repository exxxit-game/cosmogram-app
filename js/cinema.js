'use strict';
/* ============================================================
   CINEMA (модуль «Кино полёта» — см. владелец, 28.08.2026, и
   .knowledge/FLIGHT-CINEMA-ARCHITECTURE.md). Шаг 1 — подбор
   кодека. Шаг 2 — сама запись живого канваса в mp4 через
   VideoEncoder + вендоренный упаковщик (js/vendor/mp4-muxer.min.js,
   Vanilagy/mp4-muxer, MIT). Пока не вызывается ниоткуда из игры —
   следующий шаг подключит автозапись первого полёта.

   Порядок и сами кодеки — по живым пробам webcodecsProbe()
   (js/skymail.js) из таблицы beacons (проверено 28.08.2026, 110
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
/* 30.08.2026: «не хватило N очков» — русское числительное+сущ. не терпит наивной подстановки
   ({n} очков ломается на 1/2/3/4: «1 очков», «2 очков» — неверно). ruPtsWord() — тот же класс
   проблемы, что уже правили в i18n.js (dailyLeft/день-дня-дней), здесь для «очко». Остальные языки
   (EN/ES/PT/FR) — простое единственное/множественное число, тоже через функцию, не голой строкой. */
function ruPtsWord(n){ const a=Math.abs(n)%100, b=a%10;
  if (a>=11 && a<=14) return 'очков';
  if (b===1) return 'очко';
  if (b>=2 && b<=4) return 'очка';
  return 'очков'; }
const CINEMA_LINES={
  ru:{ record:['НОВЫЙ РЕКОРД!','Космическая скорость.','Так ещё никто не летал.','Старый рекорд в шоке.',
      'Вот это разгон!','Улетел выше космоса.','Рекорд? Обычное дело.','Небо запомнит этот полёт.'],
    nearmiss:['На волосок!','Вот это нервы.','Ещё сантиметр — и всё.','Просвистело рядом.',
      'Хладнокровный пилот.','Космос дышал в крыло.','Ювелирная работа.','Тоньше некуда.'],
    death:['Ну хоть красиво.','Астероид оказался крепче.','Не в этот раз.','Приземление... неудачное.',
      'Разбился о собственную смелость.','Полёт окончен. Слава была близко.','Космос забрал своё.','Ещё один герой пал красиво.'],
    nearrecord:[n=>`Не хватило ${n} ${ruPtsWord(n)} до рекорда.`,'Так близко к рекорду!',
      n=>`Ещё ${n} — и рекорд твой.`,'Почти переписал историю.',n=>`До рекорда — всего ${n} ${ruPtsWord(n)}.`,
      'В следующий раз — точно.',n=>`${n} ${ruPtsWord(n)} до величия.`,'Рекорд был совсем рядом.'] },
  en:{ record:['NEW RECORD!','Cosmic speed.',"Nobody's flown like this.",'Old record: shook.',
      'What a burn!','Flew past the cosmos.','Record? Just routine.','The sky will remember this.'],
    nearmiss:['So close!','Nerves of steel.','One inch from the end.','Whistled right by.',
      'Ice-cold pilot.','Space grazed the wing.','Surgical precision.',"Couldn't be closer."],
    death:['At least it looked good.','The asteroid won this round.','Not this time.','Landing... unsuccessful.',
      'Crashed by his own courage.','Flight over. Glory was close.','Space took its due.','Another hero, fallen in style.'],
    nearrecord:[n=>`${n} ${n===1?'point':'points'} short of the record.`,'So close to the record!',
      n=>`${n} more and it's yours.`,'Almost rewrote history.',n=>`Just ${n} ${n===1?'point':'points'} from the record.`,
      'Next time, for sure.',n=>`${n} ${n===1?'point':'points'} from greatness.`,'The record was so close.'] },
  es:{ record:['¡NUEVO RÉCORD!','Velocidad cósmica.','Nadie ha volado así.','El récord anterior, temblando.',
      '¡Qué acelerón!','Voló más allá del cosmos.','¿Récord? Cosa de todos los días.','El cielo recordará este vuelo.'],
    nearmiss:['¡Por un pelo!','Qué nervios.','Un centímetro más y se acaba.','Pasó rozando.',
      'Piloto de sangre fría.','El espacio rozó el ala.','Precisión de relojero.','No se pudo más ajustado.'],
    death:['Al menos quedó bonito.','El asteroide ganó esta vez.','Esta vez no.','Aterrizaje... fallido.',
      'Se estrelló por su propio valor.','Vuelo terminado. La gloria estuvo cerca.','El espacio cobró lo suyo.','Otro héroe, caído con estilo.'],
    nearrecord:[n=>`A ${n} ${n===1?'punto':'puntos'} del récord.`,'¡Tan cerca del récord!',
      n=>`${n} más y era tuyo.`,'Casi reescribes la historia.',n=>`Solo ${n} ${n===1?'punto':'puntos'} del récord.`,
      'La próxima, seguro.',n=>`A ${n} ${n===1?'punto':'puntos'} de la gloria.`,'El récord estuvo tan cerca.'] },
  pt:{ record:['NOVO RECORDE!','Velocidade cósmica.','Ninguém voou assim antes.','O recorde antigo tremeu.',
      'Que aceleração!','Voou além do cosmos.','Recorde? Rotina.','O céu vai lembrar deste voo.'],
    nearmiss:['Por um triz!','Que nervos.','Mais um centímetro e era o fim.','Passou raspando.',
      'Piloto de sangue frio.','O espaço roçou a asa.','Trabalho de relojoaria.','Não dava pra ser mais justo.'],
    death:['Pelo menos ficou bonito.','O asteroide venceu dessa vez.','Não dessa vez.','Pouso... malsucedido.',
      'Caiu pela própria coragem.','Voo encerrado. A glória estava perto.','O espaço cobrou o que era dele.','Mais um herói, caído com estilo.'],
    nearrecord:[n=>`A ${n} ${n===1?'ponto':'pontos'} do recorde.`,'Tão perto do recorde!',
      n=>`Mais ${n} e era seu.`,'Quase reescreveu a história.',n=>`Só ${n} ${n===1?'ponto':'pontos'} do recorde.`,
      'Da próxima vez, com certeza.',n=>`A ${n} ${n===1?'ponto':'pontos'} da glória.`,'O recorde ficou tão perto.'] },
  fr:{ record:['NOUVEAU RECORD !','Vitesse cosmique.',"Personne n'a jamais volé comme ça.",'L’ancien record en tremble.',
      'Quelle accélération !','Envolé au-delà du cosmos.','Record ? Une formalité.','Le ciel se souviendra de ce vol.'],
    nearmiss:['Au poil !','Quels nerfs.','Un centimètre de plus et c’était fini.','Ça a sifflé tout près.',
      'Pilote au sang-froid.','L’espace a frôlé l’aile.','Travail de précision.','Impossible de faire plus serré.'],
    death:['Au moins, c’était beau.','L’astéroïde a gagné cette fois.','Pas cette fois.','Atterrissage... raté.',
      'Écrasé par son propre courage.','Vol terminé. La gloire était proche.','L’espace a pris son dû.','Un héros de plus, tombé avec classe.'],
    nearrecord:[n=>`À ${n} ${n===1?'point':'points'} du record.`,'Si près du record !',
      n=>`${n} de plus et c'était le tien.`,'Presque réécrit l\'histoire.',n=>`Seulement ${n} ${n===1?'point':'points'} du record.`,
      'La prochaine fois, c\'est sûr.',n=>`À ${n} ${n===1?'point':'points'} de la gloire.`,'Le record était si proche.'] },
};
function cinemaPickLine(cat, n){
  const lang=(typeof langEff!=='undefined' && CINEMA_LINES[langEff]) ? langEff : 'ru';
  const a=CINEMA_LINES[lang][cat]; if (!a) return '';
  const line=a[Math.floor(Math.random()*a.length)];
  return (typeof line==='function') ? line(n) : line;
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
  ctx.fillText('© COSMOGRAM', w/2, capY+fs2+gap);
  ctx.shadowBlur=0;
}

const CINEMA_CODECS=[
  {id:'h264', str:'avc1.42001E', mux:'avc'},
  {id:'vp9',  str:'vp09.00.10.08', mux:'vp9'},
];
async function pickVideoCodec(w, h, bitrate){
  w = w||1080; h = h||1920;
  if (typeof VideoEncoder==='undefined') return null; // старый браузер — честно ничего, не гадаем
  for (const codec of CINEMA_CODECS){
    const cfg={ codec:codec.str, width:w, height:h, bitrate:bitrate||2_000_000, framerate:30, hardwareAcceleration:'no-preference' };
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
  let adapter; // 18.09.2026: makeMuxer теперь асинхронный адаптер (Mediabunny/legacy), см. makeMuxerAdapter выше
  try{ adapter = await makeMuxer(); }
  catch(e){ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_muxer_start_fail', String((e&&e.message)||e).slice(0,60)); return null; } // тот же класс отказа, что в cinemaStart() выше — единственный вызывающий (cinemaStop) уже подстрахован своим try/catch, но не полагаемся на это молча
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
      await adapter.addChunk(chunkToAdd, meta);
      firstChunk = false;
    }
    const lastE = seg[seg.length-1];
    offset += (lastE.ts - segStart) + (lastE.chunk.duration || 33333); // следующий сегмент начинается сразу после этого
  }
  const buf = await adapter.finalize();
  if (!buf) return null;
  return new Blob([buf], { type: 'video/mp4' });
}
/* 18.09.2026 (владелец: «везде подключи, чтобы было правильно» — перевод самого кольцевого
   движка на Mediabunny, отдельная крупная задача, ранее сознательно отложенная). Официальный
   гайд миграции mp4-muxer→Mediabunny (vanilagy.github.io/mp4-muxer/MIGRATION-GUIDE.html) даёт
   низкоуровневый класс ИМЕННО под этот случай — EncodedVideoPacketSource принимает уже
   закодированные чанки (как EncodedVideoChunk от VideoEncoder), сама не кодирует ничего заново.
   Это значит: вся кольцевая логика ниже (grab()/trimRing()/markRecord()/cinemaMuxSegments —
   обрезка окна, закреплённый момент рекорда, склейка сегментов) работает с сырыми чанками
   и НЕ МЕНЯЕТСЯ ВООБЩЕ — меняется только то, что делает финальную упаковку в mp4 из уже
   готовых чанков. adapter{addChunk,finalize} — общий интерфейс для обеих версий (Mediabunny/
   старый mp4-muxer), остальной код кольца зовёт только его, не знает, какая версия внутри.
   Честный запасной путь на старый mp4-muxer остаётся — тот же принцип, что уже у
   loadMediabunny()/cinemaExportHighlightCardMB ниже, не выдуман заново. */
async function makeMuxerAdapter(mb, muxCodec, width, height, frameRate){
  if (mb){
    // 18.09.2026 (пойман живым прогоном стража): fastStart:'reserve' (пример из гайда миграции)
    // требует заранее знать maximumPacketCount — у кольцевого буфера длина заранее не известна
    // (окно постоянно подрезается/растягивается). Без опции — тот же режим по умолчанию, что уже
    // работает в cinemaExportHighlightCardMB/cinemaAngarZoomShareMB ниже, не выдумываю новый.
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format:new mb.Mp4OutputFormat(), target });
    const videoSource = new mb.EncodedVideoPacketSource(muxCodec);
    output.addVideoTrack(videoSource, { frameRate });
    await output.start();
    return {
      target,
      addChunk: async (chunk, meta) => { try{ await videoSource.add(mb.EncodedPacket.fromEncodedChunk(chunk), meta); }catch(e){} },
      finalize: async () => { try{ await output.finalize(); }catch(e){ return null; } return target.buffer; },
    };
  }
  const target = new Mp4Muxer.ArrayBufferTarget();
  const muxer = new Mp4Muxer.Muxer({ target, video:{ codec:muxCodec, width, height, frameRate }, fastStart:'in-memory', firstTimestampBehavior:'offset' });
  return {
    target,
    addChunk: async (chunk, meta) => { try{ muxer.addVideoChunk(chunk, meta); }catch(e){} },
    finalize: async () => { try{ muxer.finalize(); }catch(e){ return null; } return target.buffer; },
  };
}
// 30.08.2026 (владелец, экстренно): живое зависание на A03 Core И на Oppo при ручном тесте
// FPS-записи — механизм явно тяжелее, чем показала песочница на компьютере. Рубильник в одном
// месте вместо трёх точек запуска (первый полёт/ручной тест/авто-момент) — останавливает запись
// целиком, пока причина не найдена. Гипотеза, не диагноз: подозревается сам cinemaStart
// (VideoEncoder+канвас), не конкретно новая авто-развилка по порогу — владелец ловил зависание
// именно на РУЧНОЙ кнопке теста, которая живёт с самого начала этого модуля.
// 31.08.2026 (владелец): включает обратно для нового живого теста. Причина зависания
// НЕ найдена и не чинилась — это не «баг исправлен», а повторная проверка того же самого
// подозреваемого пути на реальном устройстве. Лента Samsung, присланная в тот же день, не
// довод — запись всё это время была выключена этим же рубильником, значит в той ленте
// cinemaStart вообще ни разу не вызывался, ей нечем ни подтвердить, ни опровергнуть баг.
const CINEMA_DISABLED = false;
async function cinemaStart(canvas, ringWindowUs, maxWindowUs, overlayCaption, bitrate){
  if (CINEMA_DISABLED) return false;
  if (_cinemaRec) return false; // уже пишем — вторая запись поверх первой не начинается
  if (!canvas || !canvas.width || !canvas.height) return false;
  const picked = await pickVideoCodec(canvas.width, canvas.height, bitrate);
  if (!picked) return false; // честный отказ — на этом устройстве нет рабочего кодека

  // 30.08.2026: прототип вжигания текста — отдельный канвас-компоновщик, живой канвас игры не трогаем
  let ov=null;
  if (overlayCaption){
    const oc = document.createElement('canvas'); oc.width=canvas.width; oc.height=canvas.height;
    ov = { oc, octx: oc.getContext('2d') };
  }

  // 18.09.2026: makeMuxer пробует Mediabunny первой (mb!=null), честный запасной путь на
  // старый mp4-muxer — makeMuxerAdapter() сама решает, обе ветки дают одинаковый {addChunk,finalize}.
  const mb = await loadMediabunny();
  const makeMuxer = () => makeMuxerAdapter(mb, picked.mux, canvas.width, canvas.height, 30);

  const ring = ringWindowUs ? [] : null;
  let adapter=null, decoderConfig=null, pinnedUs=null, snapshot=null, snapshotGrowUntil=0;
  // 30.08.2026: VideoEncoder кладёт decoderConfig только в meta САМОГО ПЕРВОГО чанка сессии, не в каждый
  // ключевой — обрезка кольца выбрасывает тот чанк, и новый муксер без decoderConfig на своём первом чанке
  // падал в finalize() (проверено живьём: mp4-muxer.min.js TypeError на null.colorSpace). Запоминаем его
  // один раз и подставляем обратно первому чанку в обрезанном окне (и в снимке — см. markRecord ниже).
  if (!ring){
    // 18.09.2026 (второй аудит другими методами): await output.start() внутри makeMuxerAdapter()
    // не был обёрнут — если муксер бросит (кодек принят isConfigSupported(), но отвергнут самим
    // муксером, или внутренняя ошибка Streams API), reject летел необработанным исключением из
    // cinemaStart(), а cinemaFirstFlightStart() зовёт её НАМЕРЕННО без await/catch («взлёт не
    // должен ждать подбор кодека») — тишина и для игрока, и для BEACON. Тот же честный «false»,
    // что и у остальных отказов этой функции (нет канваса/нет кодека), не новый путь.
    try{ adapter = await makeMuxer(); }
    catch(e){ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_muxer_start_fail', String((e&&e.message)||e).slice(0,60)); return false; }
  }

  const encoder = new VideoEncoder({
    output: async (chunk, meta) => {
      if (meta && meta.decoderConfig && !decoderConfig) decoderConfig = meta.decoderConfig;
      if (ring){
        const entry = { chunk, meta, ts: chunk.timestamp, key: chunk.type==='key' };
        ring.push(entry);
        trimRing(ring, ringWindowUs, pinnedUs, maxWindowUs);
        if (snapshot && entry.ts <= snapshotGrowUntil) snapshot.push(entry); // снимок момента растёт своим окном, кольцо его не подрежет
      }
      else { await adapter.addChunk(chunk, meta); }
    },
    error: (e) => { if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_enc_err', String((e&&e.message)||e)); },
  });
  try{ encoder.configure(picked.config); }catch(e){ return false; }

  const frameMs = 1000/30;
  const t0 = performance.now();
  let frameN = 0, lastGrabAt = -Infinity;
  /* 18.09.2026 (владелец, живой тест «Поделиться явлением»: «не было плавности... часть
     изображения терялась») — раньше кадр захватывался отдельным setInterval(33мс), НЕ связанным
     с циклом, который рисует сам холст (requestAnimationFrame — у angarPvStoryDraw и у главного
     рендер-цикла игры). Два независимых ритма на одном холсте: setInterval мог поймать кадр
     СЕРЕДИНОЙ перерисовки (рваный кадр — «часть терялась») и плыл по времени сам по себе, не по
     реальному ритму отрисовки браузера (рывки — «не было кинематографичности»). Первый фикс того
     же вечера (свой независимый requestAnimationFrame здесь же) снял рассинхрон таймера, но не был
     тем же тиком, что рисование — сам код честно предупреждал: «для полного решения нужен захват
     кадра ИЗ ТОГО ЖЕ тика, что и рисование».
     19.09.2026 (страж 267 поймал регрессию: 2 кадра за 300мс в headless-тесте; живой замер на
     подключённом телефоне cf3beda0/CPH2631 через CDP — 0 кадров за 300мс). Настоящий фикс: grab()
     больше не планирует сам себя — это просто функция, вызываемая СНАРУЖИ, из того же тика, что и
     реальное рисование (render.js:loop(), сразу после draw(), см. cinemaOnFrameDrawn() ниже).
     Троттлинг до целевых ~30 кадров/сек остаётся (игровой цикл тикает чаще, особенно на 90/120Гц
     экранах) — раньше он решал «когда вообще проснуться», теперь — «взять этот тик или пропустить».
     Отдельного таймера для остановки в cinemaStop() больше не нужно — синхронный вызов, нечего
     отменять. */
  const grab = () => {
    if (!_cinemaRec) return;
    const now = performance.now();
    if (now - lastGrabAt < frameMs) return; // держим целевую частоту кадров, не каждый вызов
    lastGrabAt = now;
    // 30.08.2026 (владелец, экстренно — живое зависание на A03 Core и Oppo): без этой проверки
    // encoder.encode() звался бы независимо от того, успевает ли кодировщик — на слабом
    // устройстве программное кодирование одного кадра может занять дольше 33мс, и очередь внутри
    // VideoEncoder росла без остановки (задокументированная ловушка WebCodecs, encodeQueueSize —
    // MDN/спецификация). Порог 2 — общепринятое значение из примеров WebCodecs, не выдуман с нуля.
    // Пропущенный кадр здесь не «баг», а нормальная просадка частоты клипа под нагрузкой.
    if (encoder.encodeQueueSize > 2) return;
    let frame; // 30.08.2026: объявлен снаружи try — если encode() бросит, frame.close() всё равно
      // должен выполниться (VideoFrame держит нативный/GPU-буфер, не обычный JS-объект под GC).
      // Раньше close() стоял ПОСЛЕ encode() последней строкой — ошибка кодировщика (реалистичнее
      // всего именно на слабом/нестабильном устройстве) пропускала close() и кадр утекал молча.
    try{
      let src = canvas;
      if (ov){ ov.octx.drawImage(canvas,0,0); cinemaDrawOverlay(ov.octx, canvas.width, canvas.height, overlayCaption); src = ov.oc; }
      frame = new VideoFrame(src, { timestamp: Math.round((now-t0)*1000) });
      // ключевой кадр раз в ~2 сек (и всегда самый первый) — иначе обрезке кольца не от чего оттолкнуться
      encoder.encode(frame, { keyFrame: (frameN % 60 === 0) });
      frameN++;
    }catch(e){} // один пропущенный кадр не должен уронить всю запись
    finally{ if (frame) frame.close(); }
  };
  _cinemaRec = { encoder, adapter, ring, ringWindowUs, maxWindowUs, makeMuxer, grab,
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
    getSnapshot: () => snapshot };
  return true;
}
function cinemaMarkRecord(){ if (_cinemaRec && _cinemaRec.markRecord) _cinemaRec.markRecord(); } // 30.08.2026: снаружи, без правки ядра — вызывающий код сам решает, когда счёт обогнал рекорд
/* 19.09.2026: захват кадра для видео больше не планирует себя сам (см. разбор в cinemaStart) —
   этот вызов должен звучать из того же тика, что и настоящее рисование канваса. Единственный
   зовущий — render.js:loop(), сразу после каждого реального draw() (все 4 места, где он
   вызывается: полёт, оверлеи ~30fps, пауза, принудительный кадр). Проверка _cinemaRec пустая
   почти всегда (запись не идёт) — дешёвый ранний выход, не нагружает обычный кадр игры. */
function cinemaOnFrameDrawn(){ if (_cinemaRec && _cinemaRec.grab) _cinemaRec.grab(); }
async function cinemaStop(){
  if (!_cinemaRec) return null;
  const { encoder, adapter, ring, ringWindowUs, maxWindowUs, makeMuxer, getDecoderConfig, getPinnedUs, getSnapshot } = _cinemaRec;
  _cinemaRec = null; // 19.09.2026: сама эта присвоение — единственное, что нужно для остановки захвата; grab() выше проверяет _cinemaRec первой же строкой, нечего отменять
  try{ await encoder.flush(); }catch(e){} // сбой flush() (нестабильное устройство) не должен пропускать close() ниже
  try{ encoder.close(); }catch(e){} // 30.08.2026: раньше стоял внутри общего try сразу после flush() — сбой flush() пропускал close(), кодировщик (и его нативный ресурс) не освобождался
  try{
    if (ring){
      const dc = getDecoderConfig();
      const pinLost = trimRing(ring, ringWindowUs, getPinnedUs(), maxWindowUs); // последняя подрезка — flush() мог дописать ещё несколько чанков
      const snapshot = getSnapshot();
      if (pinLost && snapshot && snapshot.length){
        // рекорд не поместился даже с потолком — снимок момента + обычный короткий хвост, встык (см. cinemaMuxSegments)
        trimRing(ring, ringWindowUs, null, ringWindowUs); // ring — теперь просто обычный короткий хвост, без пина
        return await cinemaMuxSegments(makeMuxer, dc, [snapshot, ring]);
      }
      // 18.09.2026 (пойман живым прогоном стража 300: обрезанное видео проигрывалось ПОЛНОЙ
      // длиной записи, не окном — старый Mp4Muxer сам перебазировал штампы первого чанка в 0
      // через firstTimestampBehavior:'offset', у нового упаковщика такого нет, а после обрезки
      // кольца первый оставшийся чанк несёт большой «настоящий» штамп времени от начала записи,
      // не от начала окна). cinemaMuxSegments уже умеет перебазировать штампы правильно (тот
      // же приём нужен и здесь) — зовём её с одним сегментом вместо повторения той же логики
      // второй раз в двух местах.
      return await cinemaMuxSegments(makeMuxer, dc, [ring]);
    }
    const buf = await adapter.finalize();
    if (!buf) return null;
    return new Blob([buf], { type: 'video/mp4' });
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
  }catch(e){ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_idb_save_fail', 'first:'+String((e&&e.message)||e).slice(0,50)); return false; } // 18.09.2026 (второй аудит): «святое воспоминание» могло не дойти до хранилища без единого следа
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
  }catch(e){ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_idb_save_fail', 'delete_first:'+String((e&&e.message)||e).slice(0,50)); return false; } // 18.09.2026 (второй аудит): раньше firstFlightDelete() закрывала плеер и перерисовывала галерею, как будто удаление удалось, даже если оно тихо не удалось
}

/* ---------- Галерея видео-рекордов (16.09.2026, владелец: «не просто одно видео... галерея») ----------
   Тот же IndexedDB-стор (CINEMA_STORE), 6 именованных слотов по ключу 'gal_'+cat — Эстафета не
   входит (у неё нет своего рекорда, см. cinemaGalleryCat ниже). Слот принимает УЖЕ готовый Blob
   (см. cinemaHighlightStop) — здесь только хранение, кодирование не трогаем. */
const CINEMA_GALLERY_CATS=['touch','daily','speedrun','caravan','slalom','biathlon'];
async function cinemaSaveGallery(cat, blob){
  try{
    const db = await cinemaDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readwrite');
      tx.objectStore(CINEMA_STORE).put(blob, 'gal_'+cat);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  }catch(e){ if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_idb_save_fail', 'gallery:'+String((e&&e.message)||e).slice(0,50)); return false; } // 18.09.2026 (второй аудит): галерея видео-рекордов могла молча не сохранить новый рекорд
}
async function cinemaLoadGallery(cat){
  try{
    const db = await cinemaDb();
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readonly');
      const req = tx.objectStore(CINEMA_STORE).get('gal_'+cat);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return blob;
  }catch(e){ return null; }
}
/* Какой из 6 слотов относится к ТЕКУЩЕМУ полёту — тот же охват категорий, что у heroRecordFor()/
   recordBadge (ui.js): Score Attack — один бакет на все три способа управления, Caravan — только
   основной таймер 60с (доп. тиры 15/180 — личный рекорд, не в бейдж и не в галерею), Театр/Своя
   трасса/Эстафета — вне галереи вообще (у Эстафеты нет своего рекорда, см. hc-relay — там никогда
   не было recordBadge). */
function cinemaGalleryCat(){
  if (typeof S==='undefined') return null;
  if (typeof runMode!=='undefined' && (runMode==='theater' || runMode==='custom')) return null;
  if (S.mode==='relay') return null;
  if (S.mode==='caravan') return (S.caravanTime && S.caravanTime!==60) ? null : 'caravan';
  if (S.mode==='daily') return 'daily';
  if (S.mode==='speedrun') return 'speedrun';
  if (S.mode==='slalom') return 'slalom';
  if (S.mode==='biathlon') return 'biathlon';
  return 'touch';
}

/* ---------- Жизненный цикл: взлёт → посадка ----------
   Только самый первый полёт на этом устройстве — не спрашивая, «святое воспоминание»
   (решение владельца 28.08.2026). Любой следующий полёт эту запись не трогает —
   ручной способ записывать ещё что-то, помимо первого раза, обсуждается отдельно,
   здесь не реализован. */
/* 20.09.2026 (владелец, живой Oppo, реальный запуск полёта): «первый полёт» и «Момент полёта»
   вызываются друг за другом СИНХРОННО (ui.js: cinemaFirstFlightStart, следующей строкой
   cinemaHighlightStart) — оба без await. Старая проверка «занято?» смотрела на cinemaActive()
   (т.е. на _cinemaRec), а он выставляется только ГЛУБОКО внутри cinemaStart(), после нескольких
   await (подбор кодека/Mediabunny/VideoEncoder) — в момент проверки он ещё пустой. Итог, живьём
   подтверждено дважды с чистой перезагрузки: _cinemaOwner='first' тут же перезаписывался на
   'highlight' следующей же строкой, «первый полёт» никогда не сохранялся ни на одном устройстве,
   где cinemaHighlightEligible() истинна (то есть почти везде). Плюс — два cinemaStart() гонялись
   одновременно за один и тот же _cinemaRec, лишняя нагрузка на кодек ровно там, где эту нагрузку
   специально старались не удваивать. Правильная проверка — _cinemaOwner, он выставляется
   СИНХРОННО, до всех await, и ловит гонку в тот же тик, когда она случается. */
function cinemaFirstFlightStart(canvas){
  if (Store.get('cinemaFirstDone', 0)) return; // уже было — не пишем второй раз поверх
  if (_cinemaOwner || cinemaActive()) return; // 20.09.2026: _cinemaOwner ловит гонку раньше, чем cinemaActive() успевает узнать
  _cinemaOwner='first';
  // 20.09.2026: раньше не было .then() совсем — при отказе кодека _cinemaOwner='first' застревал
  // навсегда (ничего его не сбрасывало), блокируя вообще любую запись до конца вкладки.
  cinemaStart(canvas).then(ok=>{ if(!ok && _cinemaOwner==='first') _cinemaOwner=null; }); // намеренно без await на верхнем уровне — взлёт не должен ждать подбор кодека
}
async function cinemaFirstFlightStop(){
  if (_cinemaOwner!=='first') return; // не наша очередь (перехвачено/ещё не начиналось) — тихо, без ошибки
  _cinemaOwner=null; // 20.09.2026: сброс СРАЗУ, а не только при удачной cinemaActive() — иначе owner застревал при слишком быстрой посадке (кодек не успел выставить _cinemaRec)
  Store.set('cinemaFirstDone', 1); // помечаем «было» независимо от успеха — вторая попытка не начнётся молча поверх первой
  if (!cinemaActive()) return; // кодек не успел/не нашёлся — нечего останавливать и сохранять
  const blob = await cinemaStop();
  if (blob) await cinemaSaveFirst(blob);
  if (typeof galleryBtnRefresh==='function') galleryBtnRefresh(); // 16.09.2026: дверь на главном — без ожидания следующего захода в меню
}

/* ---------- Тест «цена записи в бою» (30.08.2026, владелец, живое устройство Samsung A03
   Core — самый слабый борт в парке, куплен специально для таких проверок; 30.08.2026, позже:
   владелец — оставить не на один раз, а насовсем, как способ увидеть, где и почему проседает
   FPS, и не сразу винить телефон, а сначала проверить, не наша ли это вина) ----------
   Отдельная, самая простая запись поверх «Первого полёта»: один явный тест по кнопке
   в Сервисном центре, не вместо памяти первого полёта, ей не мешает. Считает Q.fps
   (уже живая, render.js) каждые 500мс всё время полёта — и сравнивает со СВОИМ же
   Q._baseFps (среднее первых 60 сек СЕССИИ на этом устройстве без записи, снимается
   один раз и не сдвигается разогревом — см. страж 143/qualityTick в render.js). Так число
   не голое — сразу видно, эта просадка от записи или устройство и так еле тянет игру. */
function cinemaTestArm(){ Store.set('cinemaTestArmed',1); }
let _cinemaTestSamples=null, _cinemaTestTimer=0, _cinemaTestOn=false;
function cinemaTestStart(canvas){
  _cinemaTestOn=false; _cinemaTestSamples=[];
  if (_cinemaOwner || cinemaActive()) return; // 20.09.2026: _cinemaOwner — та же правка гонки, что у cinemaFirstFlightStart выше
  _cinemaOwner='test';
  cinemaStart(canvas).then(ok=>{
    _cinemaTestOn=ok;
    if(!ok){ _cinemaOwner=null; if(typeof toast==='function') toast('Кодек не нашёлся на этом устройстве','rgba(255,159,176,.5)'); return; }
    _cinemaTestTimer=setInterval(()=>{ if(typeof Q!=='undefined') _cinemaTestSamples.push(Q.fps); },500);
  });
}
async function cinemaTestStop(){
  if(_cinemaTestTimer){ clearInterval(_cinemaTestTimer); _cinemaTestTimer=0; }
  if(_cinemaOwner!=='test'){ _cinemaTestOn=false; return; } // не наша очередь — тихо
  const wasOn=_cinemaTestOn;
  _cinemaTestOn=false; _cinemaOwner=null; // 20.09.2026: сброс всегда, не только при wasOn — иначе owner='test' мог застрять, если посадка случилась раньше, чем кодек успел ответить
  if(!wasOn) return; // кодек не успел даже стартовать — нечего останавливать и показывать
  const blob=await cinemaStop();
  const s=_cinemaTestSamples||[];
  const avg=s.length?+(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1):0;
  const min=s.length?+Math.min(...s).toFixed(1):0;
  const base=(typeof Q!=='undefined' && Q._baseFps!=null) ? +Q._baseFps.toFixed(1) : null;
  // база ещё не снята (меньше ~60 сек живой игры за сессию) — сравнивать не с чем, честно говорим об этом,
  // а не подставляем выдуманное число
  const baseTxt = base!=null ? ('база '+base+' fps') : 'база ещё не снята — налетай ещё немного без теста';
  const dropTxt = base!=null ? (', просадка '+Math.max(0,Math.round((1-avg/base)*100))+'%') : '';
  const msg='avg:'+avg+' min:'+min+' base:'+(base??'null')+' n:'+s.length+' saved:'+(!!blob);
  if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_test_fps', msg);
  if(typeof toast==='function') toast('Запись: avg '+avg+' fps, мин '+min+' · '+baseTxt+dropTxt,'rgba(140,220,180,.5)');
  if(blob){ try{ const db=await cinemaDb();
    await new Promise((res,rej)=>{ const tx=db.transaction(CINEMA_STORE,'readwrite'); tx.objectStore(CINEMA_STORE).put(blob,'test'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
    db.close();
  }catch(e){} }
}

/* ---------- Момент полёта: авто-запись под «Поделиться» (30.08.2026, владелец) ----------
   «Больше не важно, слабый телефон или нет — у нас есть решение для тех и тех»: слабое
   устройство молча получает только картинку (уже готова и работает у всех), способное —
   само включает запись, без кнопки, без участия игрока. Порог CINEMA_HIGHLIGHT_MIN_FPS —
   намеренно осторожное временное число (близко к «явно достаточно»), НЕ измеренное на
   реальном слабом устройстве — у обоих исходов ошибки есть безопасный запасной путь
   (картинка всё равно работает), так что ошибиться в диапазоне не критично, точная
   калибровка — по данным теста на A03 Core, когда будут. */
const CINEMA_HIGHLIGHT_MIN_FPS = 40;
/* 17.09.2026 (владелец: «первый рекорд тоже должен записаться, а не только следующий») —
   раньше ждали ТОЛЬКО Q._baseFps: он снимается один раз за вкладку, но лишь после 60 секунд
   суммарного времени полёта (render.js qualityTick) — число, измеренное для СОВСЕМ другой
   задачи (диагностика просадок кадров, fps_drop), а не для решения «писать видео или нет».
   Первый рекорд свежего режима почти всегда ставится раньше этой минуты — запись пропускалась
   целиком, а следующий рекорд (уже после минуты) писался. Пока живого замера ещё нет — решаем
   по уже готовой оценке мощности телефона (gfxTier(), core.js — та же, по которой само
   авто-качество графики решает уровень эффектов): слабый (0) по-прежнему без записи, средний
   и флагман (1/2) пишут сразу. Как только Q._baseFps появится — точный живой замер побеждает,
   как и раньше. Страж 266. */
function cinemaHighlightEligible(){
  if (typeof Q==='undefined') return false;
  if (Q._baseFps!=null) return Q._baseFps >= CINEMA_HIGHLIGHT_MIN_FPS;
  return typeof gfxTier==='function' && gfxTier()>=1;
}
let _cinemaHighlightWatcher=0, _cinemaHighlightBest=0;
function cinemaHighlightStart(canvas){
  if (!cinemaHighlightEligible()) return; // слабое/неизвестное устройство — тихо пропускаем, картинка всё равно есть
  if (_cinemaOwner || cinemaActive()) return; // 20.09.2026: _cinemaOwner — та же правка гонки, что у cinemaFirstFlightStart выше (без неё эта строка и крала 'first' себе)
  _cinemaOwner='highlight';
  const mode = (typeof controlMode==='function') ? controlMode() : 'touch'; // game.js, только чтение — как и S/Store/Q везде в этом файле
  const modeKey = (typeof S!=='undefined' && S.mode==='caravan') ? 'bestCaravan' : (mode==='gyro'?'bestGyro':(mode==='keys'?'bestKeys':'bestTouch')); // 05.09.2026: Caravan — свой рекорд, не по управлению (тот же приём, что в ui.js gameOver())
  _cinemaHighlightBest = (typeof Store!=='undefined') ? saneNumberSafe(Store.get(modeKey, 0)) : 0; // та же формула, что ui.js/gameOver считает рекордом
  cinemaStart(canvas, 12_000_000, 20_000_000).then(ok=>{
    if(!ok){ _cinemaOwner=null; return; }
    _cinemaHighlightWatcher=setInterval(()=>{
      if (typeof S!=='undefined' && S.score>_cinemaHighlightBest) cinemaMarkRecord(); // первое пересечение — markRecord сама не даст сработать дважды
    }, 200);
  });
}
function saneNumberSafe(v){ v=+v; return (isFinite(v) && v>=0) ? v : 0; } // Store иногда отдаёт мусор из старых версий — тот же дух, что saneNumber в ui.js, но без зависимости от него
/* 31.08.2026 «Момент полёта, куратор» (владелец: «клип сохраняется на КАЖДОЙ подходящей
   посадке, рекорд был или нет — это не куратор, это просто хвост последнего полёта, нужно
   исправить»): клип теперь сохраняется ТОЛЬКО когда реально что-то поймано — рекорд побит
   (record) или упущен в пределах 10% (nearrecord, владелец выбрал порог явно, не додумано).
   Обычная посадка — cinemaStop() всё равно вызывается (иначе VideoEncoder/VideoFrame не
   освободятся, та же утечка, что уже один раз ловили), но результат никуда не пишется и
   кнопка не появляется — реального «момента» не было, показывать нечего.
   Реплика («НОВЫЙ РЕКОРД»/«не хватило N очков») решается не здесь и не вжигается в кадр —
   запись стартует на взлёте, а исход узнаётся только на посадке, вжигать было бы рано (см.
   разбор с владельцем). Категория и число сохраняются, cinemaClipOpen() достаёт их и
   зовёт cinemaPickLine() в момент открытия плеера. */
async function cinemaHighlightStop(){
  if (_cinemaHighlightWatcher){ clearInterval(_cinemaHighlightWatcher); _cinemaHighlightWatcher=0; }
  if (_cinemaOwner!=='highlight') return; // не наша очередь — тихо
  _cinemaOwner=null; // 20.09.2026: сброс до проверки cinemaActive() — иначе owner='highlight' мог застрять при слишком быстрой посадке (см. cinemaFirstFlightStop выше, та же правка)
  if (!cinemaActive()) return; // кодек не успел/не нашёлся — нечего останавливать
  const score = typeof S!=='undefined' ? S.score : 0;
  const wasRecord = score>_cinemaHighlightBest;
  const wasNear = !wasRecord && _cinemaHighlightBest>0 && score>=_cinemaHighlightBest*0.9; // владелец: «в пределах 10% от рекорда»
  if (!wasRecord && !wasNear){ await cinemaStop(); return; } // обычная посадка — момент не пойман, клип не сохраняем совсем
  const blob = await cinemaStop();
  if (blob){ try{ const db=await cinemaDb();
    await new Promise((res,rej)=>{ const tx=db.transaction(CINEMA_STORE,'readwrite'); tx.objectStore(CINEMA_STORE).put(blob,'highlight'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
    db.close();
    const cat = wasRecord ? 'record' : 'nearrecord';
    const n = wasRecord ? 0 : Math.round(_cinemaHighlightBest-score);
    if (typeof cinemaClipRefresh==='function') cinemaClipRefresh(cat, n); // ui.js: показать кнопку «Клип» на «Итогах» + подсветить один раз
    // 16.09.2026 «Галерея видео-рекордов»: тот же уже готовый Blob, без повторного кодирования —
    // только настоящий рекорд (не «почти»), владелец: «новый рекорд заменяет старое видео».
    // Честный нюанс (сказано владельцу прямо): wasRecord здесь — тот же грубый бакет по способу
    // управления, что и раньше в этой функции, не точная формула heroRecordFor() с бейджа карточки —
    // для Небо месяца/Спидрана/Слалома/Биатлона изредка может разойтись с числом на бейдже.
    if (wasRecord){ const gc=cinemaGalleryCat(); if (gc){ await cinemaSaveGallery(gc, blob);
      if (typeof galleryBtnRefresh==='function') galleryBtnRefresh(); } }
  }catch(e){} }
}
async function cinemaLoadHighlight(){
  try{
    const db = await cinemaDb();
    const blob = await new Promise((res, rej) => {
      const tx = db.transaction(CINEMA_STORE, 'readonly');
      const req = tx.objectStore(CINEMA_STORE).get('highlight');
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return blob;
  }catch(e){ return null; }
}

/* ---------- Дверь на главном экране + экран галереи + плеер ----------
   28.08.2026, переработано 16.09.2026 «Галерея видео-рекордов» (владелец, макет
   galereya-video-rekordov-16-09-2026.html, вариант В): вместо одной широкой карточки —
   компактная дверь (#flightGalleryBtn/#flightGalleryDoor, index.html) с числом накопленных
   видео, за ней — обычный экран (setScreen('flightGallery')), не отдельная накладка, как раньше
   у карточки. Плеер (#firstFlightPlayer) остаётся своей независимой накладкой (тот же приём,
   что у achClaimShow/Hide в ach.js) — открытие/закрытие не меняет экран под собой.
   Блоб-ссылки (URL.createObjectURL) держатся в _galUrls, пока экран галереи открыт — отзываются
   перед каждым новым заполнением, чтобы не копить объекты в памяти вкладки.
   18.09.2026 (владелец: «кнопку шеринга надо вернуть в тех моментах, где у нас есть видео —
   в Коллекции, в видео») — _galBlobs рядом с _galUrls: сам Blob нужен «Поделиться» отдельно от
   URL (video.src берёт URL, navigator.share({files}) берёт File из Blob — разные потребители
   одного и того же объекта, проще один раз сохранить оба, чем перезапрашивать IndexedDB заново
   при каждом тапе «Поделиться»). */
let _galUrls={}, _galBlobs={}, _galCurrentIsFirst=false, _galCurrentId=null;
let _ffShareMode='clip'; // 'clip' — «Момент полёта» с Итогов (пересборка с рамкой/репликой через mediabunny); 'gallery' — сырое видео из Коллекции/«Первого полёта» (делится как есть, без пересборки)
async function galleryCount(){
  let n=0;
  if (await cinemaLoadFirst()) n++;
  for (const cat of CINEMA_GALLERY_CATS){ if (await cinemaLoadGallery(cat)) n++; }
  return n;
}
async function galleryBtnRefresh(){
  const door=$('flightGalleryDoor'); if(!door) return;
  const n=await galleryCount();
  const badge=$('flightGalleryBadge');
  if (n>0){ door.classList.remove('hidden'); if(badge) badge.textContent=String(n); }
  else door.classList.add('hidden');
}
function galleryFillCard_(id, blob){
  const card=$(id); if(!card) return;
  const thumb=card.querySelector('.galThumb'); const play=card.querySelector('.galPlay');
  let v=thumb.querySelector('video');
  if (blob){
    if (!v){ v=document.createElement('video'); v.muted=true; v.playsInline=true; v.preload='metadata'; thumb.insertBefore(v,thumb.firstChild); }
    const url=URL.createObjectURL(blob); _galUrls[id]=url; _galBlobs[id]=blob; v.src=url; // 18.09.2026: blob кэшируется рядом с URL — cinemaGalleryShare() открывает карточку уже с готовым превью, blob должен быть тут же, не только при первом же открытии плеера

    card.classList.remove('galEmpty'); if(play) play.classList.remove('hidden');
  } else {
    if (v) v.remove();
    card.classList.add('galEmpty'); if(play) play.classList.add('hidden');
  }
}
async function galleryFill(){
  Object.keys(_galUrls).forEach(k=>{ try{ URL.revokeObjectURL(_galUrls[k]); }catch(e){} });
  _galUrls={}; _galBlobs={}; // 18.09.2026: blob-кэш чистится вместе с URL-кэшем, тот же жизненный цикл
  galleryFillCard_('galCardFirst', await cinemaLoadFirst());
  for (const cat of CINEMA_GALLERY_CATS){ galleryFillCard_('galCard_'+cat, await cinemaLoadGallery(cat)); }
}
function galleryFillLabels(){
  if (typeof L==='undefined') return;
  const t=$('flightGalleryTitle'); if(t && L.galTitle) t.textContent=L.galTitle;
  const lbl=$('flightGalleryLbl'); if(lbl && L.galDoorLbl) lbl.textContent=L.galDoorLbl;
  const pin=$('galPinLbl'); if(pin && L.galPinFirst) pin.textContent=L.galPinFirst;
  const nameFirst=$('galNameFirst'); if(nameFirst && L.ffcTitle) nameFirst.textContent=L.ffcTitle;
  // 16.09.2026: имена режимов в галерее — те же ключи, что уже наполняют карусель на главном
  // экране (modeClassic/modeDaily/...), не свои новые/захардкоженные — незачем дублировать перевод
  const GAL_NAME_KEY={touch:'modeClassic',daily:'modeDaily',speedrun:'modeSpeedrun',caravan:'modeCaravan',slalom:'modeSlalom',biathlon:'modeBiathlon'};
  Object.keys(GAL_NAME_KEY).forEach(cat=>{ const el=$('galName_'+cat); if(el && L[GAL_NAME_KEY[cat]]) el.textContent=L[GAL_NAME_KEY[cat]]; });
  const nameRelay=$('galName_relay'); if(nameRelay && L.modeRelay) nameRelay.textContent=L.modeRelay;
  document.querySelectorAll('#flightGalleryGrid .galEmptyLbl').forEach(el=>{ if(el.id!=='galEmptyFirst' && el.id!=='galEmptyRelay' && L.galEmptySlot) el.textContent=L.galEmptySlot; });
  const emptyFirst=$('galEmptyFirst'); if(emptyFirst && L.galEmptyFirst) emptyFirst.textContent=L.galEmptyFirst;
  const emptyRelay=$('galEmptyRelay'); if(emptyRelay && L.galRelayNote) emptyRelay.textContent=L.galRelayNote;
  const del=$('ffDelBtn'); if(del && L.ffcDel) del.setAttribute('aria-label', L.ffcDel);
  const close=$('firstFlightClose'); if(close && L.ffcClose) close.setAttribute('aria-label', L.ffcClose);
}
async function galleryOpen(){
  galleryFillLabels();
  await galleryFill();
  if (typeof setScreen==='function') setScreen('flightGallery');
  if (typeof sfx!=='undefined' && sfx.click) sfx.click();
}
/* 16.09.2026 (владелец, живое устройство: «просто можно видеть, что оно там есть, но нельзя
   посмотреть») — было: url=_galUrls[id] и тихий return, если кэш ещё не готов. galleryFill()
   заполняет _galUrls асинхронно (IndexedDB), и на реальном устройстве (медленнее локальной
   раздачи) окно гонки между «карточка уже нарисована» и «URL уже в кэше» реально ловится —
   тап в это окно ничего не делал и не жаловался. Теперь при промахе кэша грузим блоб заново
   напрямую, без тихого выхода. */
async function galleryCardOpen(id, cat){
  const card=$(id); if(!card || card.classList.contains('galEmpty')) return;
  let url=_galUrls[id];
  if(!url){
    const blob = id==='galCardFirst' ? await cinemaLoadFirst() : (cat ? await cinemaLoadGallery(cat) : null);
    if(!blob) return; // настоящей записи и правда нет (не гонка, а честно пусто) — .galEmpty к этому моменту уже должен был скрыть тап, но на всякий случай не открываем пустой плеер
    url = URL.createObjectURL(blob);
    _galUrls[id]=url; _galBlobs[id]=blob;
  }
  _galCurrentIsFirst = (id==='galCardFirst'); _galCurrentId = id;
  playerOpen(url, ''); // без реплики — тот же выбор, что раньше был у «Первого полёта»
  // 18.09.2026 (владелец: «кнопку шеринга надо вернуть в тех моментах, где у нас есть видео») —
  // раньше «Поделиться»/«В сторис» гасились здесь целиком («своя история клипа с «Итогов»,
  // не эта галерея»). «Поделиться» теперь работает и тут — делится сырым видео как есть, без
  // пересборки карточки (нет реплики/категории рекорда для сырой записи, пересобирать нечего).
  // «В сторис» остаётся только у клипа — там понятная реплика/повод для сторис, у произвольной
  // сохранённой записи такого повода нет, не выдумываю его здесь.
  _ffShareMode='gallery';
  cinemaClipShareGate();
  const st=$('ffStoryBtn'); if(st) st.classList.add('hidden');
  const del=$('ffDelBtn'); if(del) del.classList.toggle('hidden', !_galCurrentIsFirst); // «Удалить» — только у «Первого полёта», как и раньше
}
/* 18.09.2026 (владелец: «кнопку шеринга надо вернуть в тех моментах, где у нас есть видео»)
   — сырое видео из Коллекции/«Первого полёта» делится КАК ЕСТЬ, без пересборки: у него нет
   реплики/категории рекорда, вжигать в кадр нечего, а сама пересборка (VideoEncoder+муксер)
   существует только ради рамки-бейджа у клипа. Простой File+navigator.share, тот же путь, что
   у cardShare()/cinemaAngarZoomShare() — не изобретаю новый. */
let _cinemaGalleryShareBusy=false;
async function cinemaGalleryShare(){
  if (_cinemaGalleryShareBusy) return; _cinemaGalleryShareBusy=true;
  const b=$('ffShareBtn'); const oldTxt=b?b.textContent:'';
  if(b) b.disabled=true;
  try{
    const blob=_galBlobs[_galCurrentId];
    if(!blob){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }
    const file=new File([blob],'cosmogram-video.mp4',{type:'video/mp4'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file]});
      if (typeof haptic==='function') haptic('light');
    } else if (typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Поделиться файлом не умеет этот браузер','rgba(255,159,176,.5)');
  }catch(e){} // отказ игрока в системном окне — не ошибка, молчим (тот же дух, что cardShare())
  finally{ _cinemaGalleryShareBusy=false; if(b){ b.disabled=false; b.textContent=oldTxt; } }
}
function firstFlightDelete(){
  const go=()=>{ cinemaDeleteFirst().then(()=>{ if(typeof galleryBtnRefresh==='function') galleryBtnRefresh(); if(typeof galleryFill==='function') galleryFill(); playerClose(); }); };
  const msg=(typeof L!=='undefined' && L.ffcDelConfirm)||'Delete this video forever?';
  if (typeof tg!=='undefined' && tg && typeof tg.showConfirm==='function'){ tg.showConfirm(msg, ok=>{ if(ok) go(); }); }
  else if (typeof confirm==='function'){ if(confirm(msg)) go(); }
  else go(); // нет способа спросить — тот же честный компромисс, что у duelReplaceQ выше в ui.js
}

/* ---------- «Момент полёта»: кнопка «Клип» на «Итогах» + тот же плеер (31.08.2026) ----------
   Реплика решается на посадке (cinemaHighlightStop выше передаёт категорию record/nearrecord
   и число очков), не вжигается в кадр — рисуется поверх, средствами плеера. Кнопка гасится
   на каждом новом взлёте (см. gameOver() в ui.js) — не донашивает клип с прошлой посадки,
   если в этом полёте «Момент» не сработал (слабое устройство/обычная посадка без момента —
   клип тогда и не сохраняется вовсе, см. cinemaHighlightStop). */
function cinemaClipRefresh(cat, n){
  Store.set('cinemaClipCat', cat);
  Store.set('cinemaClipN', n||0);
  const b=$('cinemaClipBtn'); if(!b) return;
  b.classList.remove('hidden');
  b.classList.remove('glow'); void b.offsetWidth; b.classList.add('glow'); // перезапуск анимации, если сработало дважды подряд
}
function cinemaClipHide(){ const b=$('cinemaClipBtn'); if(b){ b.classList.add('hidden'); b.classList.remove('glow'); } }
let _clipUrl=null;
async function cinemaClipOpen(){
  const blob = await cinemaLoadHighlight(); if(!blob) return;
  if (_clipUrl) URL.revokeObjectURL(_clipUrl);
  _clipUrl = URL.createObjectURL(blob);
  const cat = typeof Store!=='undefined' ? Store.get('cinemaClipCat','') : '';
  const n = typeof Store!=='undefined' ? saneNumberSafe(Store.get('cinemaClipN',0)) : 0;
  const cap = cat ? cinemaPickLine(cat, n) : ''; // 'record' — без числа, 'nearrecord' — «не хватило N очков»
  playerOpen(_clipUrl, cap);
  // 18.09.2026: раньше «Поделиться» показывался здесь безусловно (единственное место в игре без
  // гейта — см. аудит RESEARCH-2026-09-VIDEO-SHARE-VENDOR-AUDIT.md, находка Б); теперь та же
  // проверка возможности (navigator.share/canShare), что уже у cardShareGate/angarPvZoomShareGate.
  _ffShareMode='clip';
  cinemaClipShareGate();
  if(typeof L!=='undefined' && L.cardStory){ const st=$('ffStoryBtn'); if(st) st.textContent=L.cardStory; } // тот же ключ, что у карточки — не заводим новый перевод
  cinemaClipStoryGate(); // «В сторис» — тоже только у клипа, и только там, где мост это умеет
}
/* 18.09.2026 (аудит RESEARCH-2026-09-VIDEO-SHARE-VENDOR-AUDIT.md, находка Б): единственная из
   шести кнопок «поделиться» в игре без проверки возможности — игрок видел кнопку, тапал, ждал
   сборку, и только тогда узнавал, что браузер не умеет. Тот же приём, что уже у
   angarPvZoomShareGate() (ui.js) — пробный File, тот же MIME. */
function cinemaClipShareGate(){
  const b=$('ffShareBtn'); if(!b) return;
  let can=false;
  try{
    const probe=new File(['x'],'t.mp4',{type:'video/mp4'});
    can=!!(navigator.share && navigator.canShare && navigator.canShare({files:[probe]}));
  }catch(e){}
  b.classList.toggle('hidden', !can);
}

/* ---------- Экспорт клипа как карточки (01.09.2026) ----------
   Тот же приём, что cinemaDrawOverlay() выше (вжигание текста в кадр), но пост-обработкой уже
   сохранённого клипа, не вживую во время записи — реплика (cinemaPickLine) известна только на
   посадке, вжигать во время самой записи поздно. Источник кадров — канвас игры, не экран
   телефона: #score/#topHud — отдельные HTML-узлы поверх канваса (index.html), canvas.getContext
   их не рисовал никогда — значит HUD в записи нет вообще, обрезка кадра не нужна (проверено
   чтением разметки, не на глаз — см. разбор с владельцем 01.09.2026).
   Вид рамки/звёзд/свечения — тот же язык, что утверждён в макете
   macet-01-09-karta-redkoe-yavlenie.html, перенесён сюда один в один, не заново придуман. */
function cinemaRR(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }
function cinemaStar4(x,cx,cy,r){ x.beginPath();
  x.moveTo(cx,cy-r); x.bezierCurveTo(cx+r*.12,cy-r*.12,cx+r*.88,cy-r*.88,cx+r,cy);
  x.bezierCurveTo(cx+r*.12,cy+r*.12,cx+r*.88,cy+r*.88,cx,cy+r);
  x.bezierCurveTo(cx-r*.12,cy+r*.12,cx-r*.88,cy+r*.88,cx-r,cy);
  x.bezierCurveTo(cx-r*.12,cy-r*.12,cx-r*.88,cy-r*.88,cx,cy-r); x.closePath(); }
function cinemaFitText(x,text,maxW,startPx,minPx,weight,family){
  let px=startPx; x.font=weight+' '+px+'px "'+family+'"';
  while (x.measureText(text).width>maxW && px>minPx){ px-=1; x.font=weight+' '+px+'px "'+family+'"'; }
  return px;
}
const CINEMA_CARD_TIER={ // рекорд — золото (легендарный тон), почти рекорд — голубой (на ступень тише)
  record:{a:'#ffd76a', glow:'255,210,110'},
  nearrecord:{a:'#7fd8ff', glow:'130,210,255'},
};
function cinemaDrawCardBadge(x, realW, caption, tc){
  const DESIGN_W=540; // тот же опорный размер, что в одобренном макете — пропорции не плывут на любом реальном разрешении канваса
  const s=realW/DESIGN_W;
  x.save(); x.scale(s,s);
  const w=DESIGN_W;
  x.textAlign='center'; x.textBaseline='alphabetic';
  const badgePx=cinemaFitText(x,caption,w-150,32,20,'700','Exo 2');
  const badgeHalf=x.measureText(caption).width/2;
  const starR=badgePx*0.24, starOffset=badgeHalf+22, EDGE_PAD=17;
  const frameHalfW=starOffset+starR+EDGE_PAD;
  const capH=badgePx*0.72, descH=badgePx*0.22, V_PAD=15;
  const baseline=68, frameY=baseline-capH-V_PAD, frameH=capH+descH+V_PAD*2;
  x.save();
  x.shadowColor='rgba('+tc.glow+',.55)'; x.shadowBlur=16;
  cinemaRR(x,w/2-frameHalfW,frameY,frameHalfW*2,frameH,frameH/2);
  x.fillStyle='rgba(10,14,28,.55)'; x.fill();
  x.lineWidth=1.5; x.strokeStyle=tc.a; x.stroke();
  x.shadowBlur=0;
  cinemaRR(x,w/2-frameHalfW+3,frameY+3,frameHalfW*2-6,frameH-6,frameH/2-3);
  x.lineWidth=1; x.strokeStyle='rgba(255,255,255,.18)'; x.stroke();
  x.restore();
  x.shadowColor='rgba('+tc.glow+',.75)'; x.shadowBlur=20;
  x.fillStyle=tc.a;
  x.fillText(caption,w/2,baseline);
  x.shadowBlur=0;
  [-1,1].forEach(function(side){
    const sx=w/2+side*starOffset, sy=baseline-badgePx*0.34;
    const g=x.createRadialGradient(sx,sy,0,sx,sy,14);
    g.addColorStop(0,'rgba(240,192,64,.55)'); g.addColorStop(1,'rgba(240,192,64,0)');
    x.fillStyle=g; x.beginPath(); x.arc(sx,sy,14,0,6.283); x.fill();
    cinemaStar4(x,sx,sy,badgePx*0.24); x.fillStyle='#f0c040'; x.fill();
  });
  x.fillStyle='#ffd76a'; x.font='600 13px "Exo 2",sans-serif'; x.letterSpacing='.08em';
  x.shadowColor='rgba(0,0,0,.6)'; x.shadowBlur=4;
  x.fillText('© COSMOGRAM', w/2, frameY+frameH+26);
  x.shadowBlur=0; x.letterSpacing='0px';
  x.restore();
}

/* Пересобирает уже сохранённый клип: та же запись + вжигаем рамку/реплику этим разом.
   Возвращает Blob('video/mp4') или null (честный отказ — старое устройство/нет клипа/кодек
   не собрался), вызывающий код (cinemaClipShare) сам решает, что показать при null. */
/* 18.09.2026 (владелец, после аудита RESEARCH-2026-09-VIDEO-SHARE-VENDOR-AUDIT.md: «убирай
   старую устаревшую хрень, раз есть новая») — пересборка карточки клипа переезжает на
   Mediabunny (js/vendor/mediabunny.min.js), тем же приёмом, что уже проверен вживую в
   cinemaAngarZoomShareMB() выше в этом файле (Output+Mp4OutputFormat+BufferTarget+CanvasSource
   вместо ручного VideoEncoder+Mp4Muxer.Muxer). Цикл чтения кадров (video.currentTime+'seeked')
   не тронут — он не имеет отношения к муксеру, работает одинаково с любой библиотекой сборки.
   Старый mp4-muxer путь остаётся честным запасным (cinemaExportHighlightCardLegacy), если
   Mediabunny не подгрузится — тот же принцип, что уже у loadMediabunny()/mediabunny_load_fail
   в cinemaAngarZoomShareEntry ниже, не выдуман заново. */
async function cinemaExportHighlightCard(){
  const mb = await loadMediabunny();
  return mb ? await cinemaExportHighlightCardMB(mb) : await cinemaExportHighlightCardLegacy();
}
async function cinemaExportHighlightCardMB(mb){
  const blob = await cinemaLoadHighlight(); if(!blob) return null;
  const cat = typeof Store!=='undefined' ? Store.get('cinemaClipCat','') : '';
  const n = typeof Store!=='undefined' ? saneNumberSafe(Store.get('cinemaClipN',0)) : 0;
  const caption = cat ? cinemaPickLine(cat, n) : ''; if(!caption) return null;
  const tc = CINEMA_CARD_TIER[cat] || CINEMA_CARD_TIER.nearrecord;

  const v=document.createElement('video'); v.muted=true; v.playsInline=true;
  const srcUrl=URL.createObjectURL(blob); v.src=srcUrl;
  let videoSource=null;
  try{
    await new Promise((res,rej)=>{ v.addEventListener('loadedmetadata',res,{once:true}); v.addEventListener('error',()=>rej(new Error('video_load')),{once:true}); });
    const W=v.videoWidth, H=v.videoHeight;
    const codec = await mb.getFirstEncodableVideoCodec(['avc','vp9'], { width:W, height:H });
    if (!codec) return null;

    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const xc=cv.getContext('2d');
    const output = new mb.Output({ format:new mb.Mp4OutputFormat(), target:new mb.BufferTarget() });
    videoSource = new mb.CanvasSource(cv, { codec, quality:new mb.Quality(0.8) });
    output.addVideoTrack(videoSource);
    await output.start();

    const FPS=20, frameS=1/FPS, N=Math.max(1,Math.floor(v.duration*FPS));
    for(let i=0;i<N;i++){
      const t=i/FPS;
      v.currentTime=Math.min(t, Math.max(0,v.duration-0.001));
      await new Promise(res=>v.addEventListener('seeked',res,{once:true}));
      xc.drawImage(v,0,0,W,H);
      cinemaDrawCardBadge(xc, W, caption, tc);
      try{ await videoSource.add(t, frameS); }catch(e){}
    }
    videoSource.close(); videoSource=null;
    await output.finalize();
    return new Blob([output.target.buffer], { type:'video/mp4' });
  }catch(e){
    if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_card_enc_err', String((e&&e.message)||e));
    return null;
  } finally { URL.revokeObjectURL(srcUrl); if(videoSource){ try{videoSource.close();}catch(e){} } }
}
async function cinemaExportHighlightCardLegacy(){
  const blob = await cinemaLoadHighlight(); if(!blob) return null;
  const cat = typeof Store!=='undefined' ? Store.get('cinemaClipCat','') : '';
  const n = typeof Store!=='undefined' ? saneNumberSafe(Store.get('cinemaClipN',0)) : 0;
  const caption = cat ? cinemaPickLine(cat, n) : ''; if(!caption) return null;
  const tc = CINEMA_CARD_TIER[cat] || CINEMA_CARD_TIER.nearrecord;

  const v=document.createElement('video'); v.muted=true; v.playsInline=true;
  const srcUrl=URL.createObjectURL(blob); v.src=srcUrl;
  try{
    await new Promise((res,rej)=>{ v.addEventListener('loadedmetadata',res,{once:true}); v.addEventListener('error',()=>rej(new Error('video_load')),{once:true}); });
    const W=v.videoWidth, H=v.videoHeight;
    const picked=await pickVideoCodec(W,H);
    if(!picked) return null;

    const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const xc=cv.getContext('2d');
    const target=new Mp4Muxer.ArrayBufferTarget();
    const muxer=new Mp4Muxer.Muxer({ target, video:{codec:picked.mux,width:W,height:H,frameRate:20}, fastStart:'in-memory', firstTimestampBehavior:'offset' });
    const encoder=new VideoEncoder({
      output:(chunk,meta)=>{ try{ muxer.addVideoChunk(chunk,meta); }catch(e){} },
      error:(e)=>{ if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_card_enc_err', String((e&&e.message)||e)); },
    });
    try{ encoder.configure(picked.config); }catch(e){ return null; }

    const FPS=20, N=Math.max(1,Math.floor(v.duration*FPS));
    for(let i=0;i<N;i++){
      const t=i/FPS;
      v.currentTime=Math.min(t, Math.max(0,v.duration-0.001));
      await new Promise(res=>v.addEventListener('seeked',res,{once:true}));
      xc.drawImage(v,0,0,W,H);
      cinemaDrawCardBadge(xc, W, caption, tc);
      let frame;
      try{ frame=new VideoFrame(cv,{ timestamp: Math.round(t*1e6) }); encoder.encode(frame,{ keyFrame: i===0 }); }
      catch(e){}
      finally{ if(frame) frame.close(); }
    }
    try{ await encoder.flush(); }catch(e){}
    try{ encoder.close(); }catch(e){}
    try{ muxer.finalize(); }catch(e){ return null; }
    return new Blob([target.buffer], { type:'video/mp4' });
  } finally { URL.revokeObjectURL(srcUrl); }
}

/* «Поделиться» на «Клипе» — системное окно (тот же путь, что cardShare() в card.js), тут же
   собирает карточку из сырой записи (никогда не хранится с вжатым текстом — реплика решается
   каждый раз заново из тех же cat/n, чтобы при повторном показе не залипала одна и та же фраза
   из восьми вариантов). Кнопка гасится на время сборки — повторный тап поверх уже идущей не
   запускает вторую сборку одновременно. */
let _cinemaShareBusy=false;
async function cinemaClipShare(){
  if (_cinemaShareBusy) return; _cinemaShareBusy=true;
  const b=$('ffShareBtn'); const oldTxt=b?b.textContent:'';
  if(b){ b.disabled=true; b.textContent=(typeof L!=='undefined'&&L.cinemaShareBusy)||'Собираю…'; }
  try{
    const blob=await cinemaExportHighlightCard();
    if(!blob){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }
    const file=new File([blob],'cosmogram-clip.mp4',{type:'video/mp4'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file]});
      if (typeof haptic==='function') haptic('light');
    } else if (typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Поделиться файлом не умеет этот браузер','rgba(255,159,176,.5)');
  }catch(e){} // отказ игрока в системном окне — не ошибка, молчим (тот же дух, что cardShare())
  finally{ _cinemaShareBusy=false; if(b){ b.disabled=false; b.textContent=oldTxt; } }
}

/* 10.09.2026 «Смотреть явление крупно» (владелец, часть рекламной кампании — статичный
   скриншот теряет анимацию, значит нужен настоящий видео-шаринг): тот же путь, что
   cinemaClipShare() выше (системное «Поделиться», File+navigator.share), но пишет не
   игровой хайлайт, а канвас окна «явление» напрямую, простым cinemaStart/cinemaStop без
   кольцевой обрезки — ролик не привязан к моменту рекорда, просто N секунд подряд.
   Длительность (владелец, изучено WebSearch — TikTok/Reels для обучающего контента,
   плюс собственный цикл анимации узоров 3-6с, паттерн должен повториться хотя бы пару
   раз): 15 секунд, не 1-2 — короче теряет смысл, никто не успеет разглядеть впервые
   увиденное явление. */
/* 11.09.2026, владелец: «зачем нам нужно было 15 секунд? разве явление требует 15 секунд?» —
   верно, то число было выбрано под вирусность в сторис (нужно успеть разглядеть незнакомое
   явление); для личного «поделиться файлом» не нужно — узор обычно зациклен за несколько
   секунд, дольше только раздувает время записи и файл без пользы. 4 секунды — чуть больше
   одного цикла у самых медленных явлений (проверено по cycleMs в fx-партиях, большинство
   1600-4600мс). Заодно поднят битрейт (владелец: «подними качество, пробуй варианты») — при
   таком коротком ролике 6 Мбит/с даёт файл сопоставимого размера со старым (15с×2Мбит/с),
   но втрое плотнее бит на кадр — меньше плоских градиентов от сжатия. */
const CINEMA_ANGAR_ZOOM_MS = 4000;
const CINEMA_ANGAR_ZOOM_BITRATE = 6_000_000;
let _cinemaAngarZoomBusy=false;
function cinemaAngarZoomBusy(){ return _cinemaAngarZoomBusy; }
async function cinemaAngarZoomShare(canvas, onStart, onEnd){
  if (_cinemaAngarZoomBusy || cinemaActive()) return;
  _cinemaAngarZoomBusy=true;
  if (typeof onStart==='function') onStart();
  try{
    _cinemaOwner='angarZoom';
    const ok = await cinemaStart(canvas, null, null, null, CINEMA_ANGAR_ZOOM_BITRATE);
    if (!ok){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }
    await new Promise(r=>setTimeout(r, CINEMA_ANGAR_ZOOM_MS));
    const blob = await cinemaStop();
    if (!blob){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }
    const file=new File([blob],'cosmogram-yavlenie.mp4',{type:'video/mp4'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file]});
      if (typeof haptic==='function') haptic('light');
    } else if (typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Поделиться файлом не умеет этот браузер','rgba(255,159,176,.5)');
  }catch(e){} // отказ игрока в системном окне — не ошибка, молчим (тот же дух, что cardShare())
  finally{ _cinemaOwner=null; _cinemaAngarZoomBusy=false; if (typeof onEnd==='function') onEnd(); }
}

/* ---------- Mediabunny: запись явления для «Поделиться» (18.09.2026) ----------
   Вендоренная ESM-библиотека (js/vendor/mediabunny.min.js, Vanilagy/mediabunny, MPL-2.0) —
   официальный преемник mp4-muxer (автор сам объявил mp4-muxer устаревшим, см. коммит
   «cinemaHighlightEligible»/памятка владельца [[feedback_vendor_bibliotek_...]]). Живой тест
   владельца («Поделиться явлением», Коллекция): «не было плавности... часть изображения
   терялась». Причина (страж 267) — отдельный от отрисовки таймер захвата. Здесь — не
   полумера (синхронизация через requestAnimationFrame), а корень: рисование и захват кадра
   идут В ОДНОМ И ТОМ ЖЕ тике одного цикла, второго таймера просто НЕТ вообще —
   `CanvasSource` Mediabunny создан именно под этот приём («один холст, свой цикл, каждый
   кадр — в файл», см. документация mediabunny.dev/guide/media-sources).
   Область применения — НАРОЧНО только этот один путь (запись явления, без кольцевой
   обрезки/подрезки). Кольцевой движок cinemaStart/cinemaStop (первый полёт, хайлайт
   рекорда — там подрезка последних N секунд, склейка сегментов) НЕ трогается здесь —
   отдельная, более крупная задача, не в этом заходе. */
let _mediabunnyMod=null, _mediabunnyLoadFailed=false;
async function loadMediabunny(){
  if (_mediabunnyMod) return _mediabunnyMod;
  if (_mediabunnyLoadFailed) return null;
  try{ _mediabunnyMod = await import('./vendor/mediabunny.min.js?v='+GAME_VERSION); return _mediabunnyMod; }
  catch(e){ _mediabunnyLoadFailed=true; if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('mediabunny_load_fail', String((e&&e.message)||e).slice(0,60)); return null; }
}
async function cinemaAngarZoomShareMB(mb, onStart, onEnd){
  _cinemaAngarZoomBusy=true;
  if (typeof onStart==='function') onStart();
  let videoSource=null;
  try{
    const d=Math.min(window.devicePixelRatio||1, (typeof dprCap!=='undefined'?dprCap:2));
    const BW=270, BH=480; // логический короб 9:16, тот же приём «короб × dpr», что был у angarPvStoryCanvasStart
    const cv=document.createElement('canvas');
    cv.width=Math.round(BW*d); cv.height=Math.round(BH*d);
    const x=cv.getContext('2d');
    x.setTransform(d,0,0,d,0,0);

    const codec = await mb.getFirstEncodableVideoCodec(['avc','vp9'], { width:cv.width, height:cv.height });
    if (!codec){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }

    const output = new mb.Output({ format:new mb.Mp4OutputFormat(), target:new mb.BufferTarget() });
    videoSource = new mb.CanvasSource(cv, { codec, quality:new mb.Quality(0.8) });
    output.addVideoTrack(videoSource);
    await output.start();

    const frameMs = 1000/30, t0 = performance.now();
    let lastGrabAt = -Infinity; // 18.09.2026: штамп времени и длительность кадра — из РЕАЛЬНЫХ часов
      // (elapsed/сколько реально прошло с прошлого захвата), не из счётчика «кадр №N при 30/сек» —
      // тот подсчёт молча предполагал, что кадры и правда идут строго по 33мс. На практике сам
      // await videoSource.add() иногда занимает дольше (кодировщик занят) — счётчик кадров начинал
      // отставать от настоящих часов, и итоговое видео получалось короче настоящих 4 секунд записи
      // (страж 268 поймал живьём: 2.1с вместо ~4с). Реальные часы этой ошибке не подвержены.
    await new Promise((resolve)=>{
      const loop=async ()=>{
        const now = performance.now(), elapsed = now-t0;
        angarPvStoryDraw(x, BW, BH, elapsed); // рисуем
        if (now-lastGrabAt >= frameMs){ // и тут же, в ЭТОМ ЖЕ тике, захватываем — не отдельным циклом
          const gapS = (lastGrabAt===-Infinity ? frameMs : (now-lastGrabAt))/1000;
          lastGrabAt = now;
          try{ await videoSource.add(elapsed/1000, gapS); }catch(e){}
        }
        if (elapsed >= CINEMA_ANGAR_ZOOM_MS){ resolve(); return; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    videoSource.close(); videoSource=null;
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type:'video/mp4' });
    const file = new File([blob],'cosmogram-yavlenie.mp4',{type:'video/mp4'});
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file]});
      if (typeof haptic==='function') haptic('light');
    } else if (typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Поделиться файлом не умеет этот браузер','rgba(255,159,176,.5)');
  }catch(e){
    try{ if(videoSource) videoSource.close(); }catch(_){}
    /* 18.09.2026 (второй аудит другими методами): раньше ЛЮБОЕ исключение здесь молчало —
       настоящий отказ игрока в системном окне («Поделиться» → «Отмена») И непредвиденная
       ошибка (например, output.start() бросил) падали в один и тот же немой catch. navigator.
       share() у настоящего отказа игрока отклоняет промис DOMException'ом с name==='AbortError' —
       отличаем по этому имени, не гадаем по типу исключения. */
    if (!e || e.name!=='AbortError'){
      if (typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)');
      if (typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_angar_mb_fail', String((e&&e.message)||e).slice(0,60));
    }
  }
  finally{ _cinemaAngarZoomBusy=false; if (typeof onEnd==='function') onEnd(); }
}
/* Точка входа (зовётся из ui.js вместо отдельной пары angarPvStoryCanvasStart+
   cinemaAngarZoomShare): пробует Mediabunny — та САМА создаёт и ведёт свой холст (один
   цикл на рисование и захват, см. выше), поэтому здесь НЕ создаём холст заранее — иначе
   старый angarPvStoryCanvasStart() запустил бы свой ВТОРОЙ, никому не нужный цикл рисования
   параллельно. Падает на старый путь (cinemaStart/cinemaStop, уже с фиксом рассинхрона —
   страж 267) только если библиотека не загрузилась вообще — честный, дешёвый запасной путь,
   не выдуманный «на всякий случай». */
async function cinemaAngarZoomShareEntry(onStart, onEnd){
  if (_cinemaAngarZoomBusy || cinemaActive()) return;
  const mb = await loadMediabunny();
  if (mb) return cinemaAngarZoomShareMB(mb, onStart, onEnd);
  const sc = angarPvStoryCanvasStart();
  return cinemaAngarZoomShare(sc.canvas, onStart, ()=>{ sc.stop(); if (typeof onEnd==='function') onEnd(); });
}

/* «В сторис» на «Клипе» (05.09.2026, «Доделать Кино полёта») — тот же путь, что cardStory()
   в card.js для картинки, только вместо PNG → mp4: экспортируем клип с вжатой рамкой
   (cinemaExportHighlightCard — та же функция, что уже кормит системное «Поделиться» выше),
   грузим на сервер (action:'clip_url', сервер уже готов — см. decodeAndUploadClipMp4 в
   cosmogram-sync, был задеплоен 30.08.2026 вместе с «Моментом полёта», просто не был вызван
   ни одной кнопкой до сих пор), получаем публичный URL, зовём tg.shareToStory(url) — без
   widget_link (11.09.2026, убрано по просьбе владельца, см. выше). Дверь видна только там,
   где мост версии 7.8+ уже умеет shareToStory — тот же принцип
   feature-gating, что у cardStoryGate(). */
function blobToDataURL(blob){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=()=>rej(r.error||new Error('read_fail'));
    r.readAsDataURL(blob);
  });
}
function cinemaClipStoryGate(){
  const b=$('ffStoryBtn'); if(!b) return;
  const can=typeof tg!=='undefined' && tg && tg.shareToStory && tg.initData &&
    typeof tgv==='function' && tgv('7.8') && typeof SYNC_URL!=='undefined';
  b.classList.toggle('hidden', !can);
}
let _cinemaStoryBusy=false;
async function cinemaClipStory(){
  if (_cinemaStoryBusy) return; _cinemaStoryBusy=true;
  const b=$('ffStoryBtn'); const oldTxt=b?b.textContent:'';
  if(b){ b.disabled=true; b.textContent=(typeof L!=='undefined'&&L.cinemaShareBusy)||'Собираю…'; }
  try{
    const blob=await cinemaExportHighlightCard();
    if(!blob){ if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)'); return; }
    const dataUrl=await blobToDataURL(blob);
    const r=await syncFetch(SYNC_URL,{action:'clip_url',initData:tg.initData,mp4:dataUrl});
    const ans=await r.json();
    if(!r.ok||!ans.ok||!ans.url) throw new Error(ans.error||('http_'+r.status));
    tg.shareToStory(ans.url);
    if (typeof haptic==='function') haptic('light');
  }catch(e){
    if(typeof BEACON!=='undefined' && BEACON.signal) BEACON.signal('cinema_story_fail', String((e&&e.message)||e).slice(0,60));
    if(typeof toast==='function') toast((typeof L!=='undefined'&&L.cinemaShareErr)||'Не вышло — попробуй ещё раз','rgba(255,159,176,.5)');
  }
  finally{ _cinemaStoryBusy=false; if(b){ b.disabled=false; b.textContent=oldTxt; } }
}

/* ---------- Общий плеер: свои кнопки вместо системных Android (31.08.2026, владелец) ----------
   Один плеер на «Первый полёт» и «Клип» — переиспользуется целиком, не два экрана.
   currentTime/duration — обычные свойства <video>, слушаем timeupdate/loadedmetadata, ничего
   не переизобретаем сверх плеера. */
function fmtClipT(s){ s=Math.max(0,Math.floor(s||0)); const m=(s/60)|0, sec=s%60; return m+':'+(sec<10?'0':'')+sec; }
function playerOpen(url, caption){
  const v=$('firstFlightVideo'); if(!v) return;
  v.src=url; v.currentTime=0;
  const capEl=$('ffCaption'), capMain=$('ffCapMain');
  if (caption){ if(capMain) capMain.textContent=caption; if(capEl) capEl.classList.remove('hidden'); }
  else if (capEl) capEl.classList.add('hidden');
  const fill=$('ffScrubFill'); if(fill) fill.style.width='0%';
  const cur=$('ffTimeCur'); if(cur) cur.textContent='0:00';
  const p=$('firstFlightPlayer'); if(p) p.classList.remove('hidden');
  const playBtn=$('ffPlayBtn'); if(playBtn) playBtn.classList.remove('playing');
  v.play().then(()=>{ if(playBtn) playBtn.classList.add('playing'); }).catch(()=>{}); // автовоспроизведение может быть отклонено — плеер всё равно открыт, кнопка play доступна
  if (typeof sfx!=='undefined' && sfx.click) sfx.click();
}
function playerClose(){
  const v=$('firstFlightVideo'); if(v){ v.pause(); }
  const p=$('firstFlightPlayer'); if(p) p.classList.add('hidden');
}
function playerToggle(){
  const v=$('firstFlightVideo'), b=$('ffPlayBtn'); if(!v) return;
  if (v.paused){ v.play().then(()=>{ if(b) b.classList.add('playing'); }).catch(()=>{}); }
  else { v.pause(); if(b) b.classList.remove('playing'); }
}
(function playerWire(){ // грузится раньше ui.js — свои обработчики без общего wireOn()
  // 16.09.2026 «Галерея видео-рекордов»: дверь (#flightGalleryBtn) и «Назад» (#flightGalleryBackBtn)
  // используют setScreen()/wireOn() — определены в ui.js, которая грузится ПОСЛЕ этого файла,
  // поэтому их обработчики стоят там же, рядом с остальными экранами (не здесь). Здесь — только
  // то, что своё, внутреннее: клик по карточке галереи и «Удалить» внутри плеера.
  const grid=$('flightGalleryGrid');
  if (grid) grid.addEventListener('click', e=>{
    const c=e.target.closest('.galCard'); if(!c || c.classList.contains('galEmpty')) return;
    const id=c.id, cat=id.indexOf('galCard_')===0 ? id.slice(8) : null;
    galleryCardOpen(id, cat);
  });
  const del=$('ffDelBtn'); if(del) del.addEventListener('click', e=>{ e.stopPropagation(); firstFlightDelete(); });
  const close=$('firstFlightClose'); if(close) close.addEventListener('click', playerClose);
  const clipBtn=$('cinemaClipBtn'); if(clipBtn) clipBtn.addEventListener('click', cinemaClipOpen);
  // 18.09.2026: одна и та же кнопка теперь обслуживает два разных сценария (клип с
  // пересборкой карточки / сырое видео из Коллекции) — режим ставит galleryCardOpen()/
  // cinemaClipOpen() в _ffShareMode перед показом кнопки, здесь только развилка по нему.
  const shareBtn=$('ffShareBtn'); if(shareBtn) shareBtn.addEventListener('click', e=>{ e.stopPropagation(); if(_ffShareMode==='gallery') cinemaGalleryShare(); else cinemaClipShare(); });
  const storyBtn=$('ffStoryBtn'); if(storyBtn) storyBtn.addEventListener('click', e=>{ e.stopPropagation(); cinemaClipStory(); });
  const v=$('firstFlightVideo');
  if (v){
    v.addEventListener('click', playerToggle);
    v.addEventListener('ended', ()=>{ const b=$('ffPlayBtn'); if(b) b.classList.remove('playing'); });
    v.addEventListener('timeupdate', ()=>{
      if(!v.duration) return;
      const fill=$('ffScrubFill'); if(fill) fill.style.width=(v.currentTime/v.duration*100)+'%';
      const cur=$('ffTimeCur'); if(cur) cur.textContent=fmtClipT(v.currentTime);
      const dur=$('ffTimeDur'); if(dur) dur.textContent=fmtClipT(v.duration);
    });
  }
  const playBtn=$('ffPlayBtn'); if(playBtn) playBtn.addEventListener('click', e=>{ e.stopPropagation(); playerToggle(); });
  const track=$('ffScrubTrack');
  if (track) track.addEventListener('click', e=>{
    e.stopPropagation();
    if(!v || !v.duration) return;
    const r=track.getBoundingClientRect();
    v.currentTime = Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*v.duration;
  });
})();
