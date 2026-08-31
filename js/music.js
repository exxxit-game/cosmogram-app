/* ---------- Музыка (Фаза А: генеративный эмбиент — синтез, ноль ассетов) ----------
   Пэды меню, адаптивный полёт (слои по волне/жизням), коды смерти/рекорда.
   Цепочка: голоса → musicGain → [dry + ConvolverNode(генерированный импульс)] → out.
   Уважает MUTED (общий звук) и MUSIC_ON (своя настройка 'music').
   Не трогает sfx: у музыки своя ветка громкости.
   Глоссарий коротких глобалов (см. core.js) — переименование отклонено 22.08.2026:
     AC — AudioContext (core.js). S — состояние забега (game.js): здесь читается S.mission/
     S.lives/S.running/S.speed/S.slowmo/S.skin для слоёв музыки и профиля звука двигателя. */
let MUSIC_ON = true; // boot: Store 'music'

const music = (()=>{
  let mg=null, conv=null, wet=null;      // master gain + реверб-ветка
  let theme=null, ducked=false, pendingTheme=null;          // 'menu' | 'game' | null; pendingTheme — ждёт границы такта (22.08.2026)
  let timer=null, nextBar=0, chordIx=0, walk=76;
  let layerState={pulse:false, arp:false, tension:false};
  /* v1.282.26 (партия 24): «плывущий центр» — корень дрона медленно ходит по соседним ступеням
     минорной пентатоники (A3,C4,D4,E4,G4), вместо того чтобы стоять на A3 всю игру. Старт —
     всегда индекс 0 (ровно прежний звук A3), дрейф включается только со временем — не чинит то,
     что не сломано, только не даёт застыть надолго. Квинта/тревога считаются ОТ корня (+7/+13
     полутонов), а не абсолютными нотами — интервалы сохраняются при любом сдвиге корня. */
  const DRONE_ROOTS=[57,60,62,64,67]; // A3,C4,D4,E4,G4
  let droneRootIx=0;
  const stats={pads:0, notes:0, stings:0, kicks:0}; // счётчики для тестового стенда

  function midi(m){ return 440*Math.pow(2,(m-69)/12); }
  /* v1.282.26 (партия 24): приём Брайана Ино — «неточность делает звук живым». Ни одна нота
     не должна звучать дважды буквально идентично, иначе через N циклов мозг заучивает узор
     и музыка начинает раздражать (материал прислан владельцем, сверено с кодом — сама идея
     подтверждена, но music.js уже был генеративным синтезом, это его усиление, не новая
     система). ±3% по высоте — на слух как «живое», не как «расстроенное». Панорама — мягкая
     ([-0.6,0.6]), не крайности стерео, чтобы не потерять узкий динамик телефона в моно. */
  function jitterFreq(f){ return f*(1+(Math.random()*2-1)*0.03); }
  function jitterPan(){ return (Math.random()*2-1)*0.6; }
  function panNode(ac,v){ // StereoPannerNode есть не везде (старый Safari) — тихий пропуск, не критично для эмбиента
    if (typeof ac.createStereoPanner!=='function') return null;
    const p=ac.createStereoPanner(); p.pan.value=v; return p;
  }
  /* 27.08.2026 «Оба вместе не звучат» (владелец): кик и риф-арпеджио раньше уходили в тот же
     2.8-секундный реверб-хвост, что и медленные пэды/дрон (реверб слался ОДИН РАЗ, из mg
     целиком — см. ensureChain ниже, было mg.connect(conv)). Резкий искажённый удар через
     реверб, рассчитанный на медленный эмбиент, размывается в кашу — классическая причина,
     почему ритмичный слой и спокойный эмбиент не дружат при смешивании. Реверб-посыл
     перенесён СЮДА, на уровень отдельного голоса (sendWet, по умолчанию true — пэды/
     колокольчики/пульс не потеряли ничего) — риф вызывает toMix(...,false) ниже, кик и так
     не ходил через toMix, при новой схеме автоматически остался сухим. */
  function toMix(node,ac,sendWet){ // подключить голос к музыкальной шине, по возможности через случайную панораму
    const pn=panNode(ac,jitterPan());
    const tap=pn||node;
    if(pn) node.connect(pn);
    tap.connect(mg);
    if(sendWet!==false) tap.connect(conv);
  }
  function impulse(ac,dur,decay){ // «космический хвост»: шум с экспоненциальным затуханием
    /* 22.08.2026: сырой белый шум как импульсная характеристика реверба звучит буквально
       шипением — конволюция размазывает весь спектр шума под каждую ноту эмбиента (жалоба
       владельца: OPPO A78 через Telegram, «эмбиент шипит»). Сглаживаем однополюсным lowpass
       ПЕРЕД амплитудной огибающей: настоящий реверб — не белый, а тёплый затухающий хвост.
       smooth=0.18 — заметное потепление, но не «утопленный» гул: страж reverb-impulse-guard
       проверяет сглаженность объективно, не на слух. */
    const rate=ac.sampleRate, len=Math.floor(rate*dur);
    const buf=ac.createBuffer(2,len,rate);
    const smooth=.18;
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
      let prev=0;
      for(let i=0;i<len;i++){
        prev += smooth*((Math.random()*2-1)-prev);
        d[i]=prev*Math.pow(1-i/len,decay);
      } }
    return buf;
  }
  function ensureChain(){
    if(MUTED||!MUSIC_ON) return null;
    const ac=audio(); if(!ac) return null;
    if(mg && mg.context!==ac){ // 26.08.2026: старые узлы держали ссылку на контекст, который умер и
      // был пересоздан (закрытие браузером / восстановление после «тихой заморозки», core.js
      // audioSample()) — connect() между разными AudioContext не работает, музыка молчала бы
      // до перезагрузки страницы, хотя новый контекст рядом жив и здоров
      mg=null; conv=null; wet=null; theme=null; pendingTheme=null;
      if(timer){ clearInterval(timer); timer=null; }
    }
    if(!mg){
      mg=ac.createGain(); mg.gain.value=0;
      conv=ac.createConvolver(); conv.buffer=impulse(ac,2.8,2.2);
      wet=ac.createGain(); wet.gain.value=.55;
      const dry=ac.createGain(); dry.gain.value=.85;
      mg.connect(dry); dry.connect(ac.destination);
      // 27.08.2026: было mg.connect(conv) — реверб слался ОДНИМ куском на весь микс сразу,
      // кик/риф размывались в том же хвосте, что и пэды (см. пометку у toMix выше). Теперь
      // conv питается ИЗ ГОЛОСОВ напрямую (toMix), не из mg — эта строка убрана насовсем.
      conv.connect(wet); wet.connect(ac.destination);
    }
    return ac;
  }
  let hardCurveCache=null;
  function hardCurve(){ // 22.08.2026: жёсткое индустриальное искажение (стиль Daft Punk, владелец) —
    // насыщающий tanh с крутым множителем, не мягкий линейный клип. Общая на кик и риф арпеджио,
    // НЕ на пэды/дрон/колокольчики меню — им искажение чуждо, эмбиент должен остаться чистым.
    if(hardCurveCache) return hardCurveCache;
    const n=256, curve=new Float32Array(n);
    for(let i=0;i<n;i++){ const x=i*2/n-1; curve[i]=Math.tanh(x*2)*.75; }
    /* 23.08.2026: было tanh(x*6)*.9 — на тихом сигнале (0.05) съедало разницу с громким
       (выход 0.262, впятеро раздуто), кик и риф арпеджио сливались в «кашу» (владелец).
       Смягчено: тихий сигнал остаётся тихим (0.05→0.075), максимум с запасом (1.0→0.723).
       Характер искажения не пропал, просто не съедает всю динамику разом. */
    hardCurveCache=curve;
    return curve;
  }
  function kickDrum(ac,t,vol){ // 22.08.2026: барабанный кик (не путать с music.kick() — тот сайдчейн-дак от удара)
    // синтез 808-стиль: синус с падающим питчем + жёсткое искажение — центр, без панорамы (моно-динамик телефона)
    const osc=ac.createOscillator(); osc.type='sine';
    osc.frequency.setValueAtTime(150,t);
    osc.frequency.exponentialRampToValueAtTime(45,t+.09);
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.006);
    g.gain.exponentialRampToValueAtTime(.001,t+.26);
    const shaper=ac.createWaveShaper(); shaper.curve=hardCurve(); shaper.oversample='2x';
    osc.connect(g); g.connect(shaper); shaper.connect(mg); // напрямую в mg — кик держим по центру, не через toMix (без случайной панорамы)
    osc.start(t); osc.stop(t+.3);
    stats.kicks++;
  }
  function padVoice(ac,t,f,dur,vol){ // мягкий пэд: два расстроенных треугольника + фильтр
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+dur*.35);
    g.gain.linearRampToValueAtTime(0,t+dur);
    const flt=ac.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=1300; flt.Q.value=.4;
    for(const det of [-5,5]){
      const o=ac.createOscillator(); o.type='triangle';
      o.frequency.value=jitterFreq(f); o.detune.value=det;
      o.connect(flt); o.start(t); o.stop(t+dur+.05);
    }
    flt.connect(g); toMix(g,ac); stats.pads++;
  }
  function note(ac,t,f,dur,vol,type,distort){ // колокольчик/пульс/арпеджио; distort — только риф (22.08.2026, стиль Daft Punk)
    const o=ac.createOscillator(); o.type=type||'sine'; o.frequency.value=jitterFreq(f);
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.02);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);
    if(distort){ const shaper=ac.createWaveShaper(); shaper.curve=hardCurve(); shaper.oversample='2x'; g.connect(shaper); toMix(shaper,ac,false); } // 27.08.2026: риф — без реверба (см. пометку у toMix)
    else toMix(g,ac);
    o.start(t); o.stop(t+dur+.05); stats.notes++;
  }

  /* Темы: меню — медленные аккорды Am→F→G→Em с редкими колокольчиками;
     полёт — дрон A всегда, пульс с 3-й волны, арпеджио с 5-й, тревога на последней жизни.
     Регистр поднят на октаву: динамики телефонов не воспроизводят 110–160 Гц —
     музыка должна звучать именно на телефоне, а не в наушниках студии. */
  const MENU_CHORDS=[[57,64,69,72,76],[53,60,65,69,72],[55,62,67,71,74],[52,59,64,67,71]];
  const MENU_BAR=7, BEAT=60/124, GAME_BAR=BEAT*4; // 22.08.2026: 124 BPM (владелец, стиль Daft Punk) — такт честные 4 доли, не произвольные 3с
  const PENTA=[69,72,74,76,79,81,84];
  /* 22.08.2026 «Риффотека» (приём Ballblazer «Riffology», 1984, Питер Лэнгстон): арпеджио
     раньше было чистым случайным блужданием по ступеням на каждую долю — ни одной узнаваемой
     формы, только шум по гамме. Riffology не импровизирует с нуля каждую ноту — она «делает
     динамически взвешенный случайный выбор» готовой фразы из библиотеки. Три коротких
     мотива (смещения ступеней от текущей опорной, восемь долей на такт — та же сетка,
     что и раньше): выбирается ОДИН на весь такт, не блуждание нота за нотой. */
  const ARP_MOTIFS=[
    [0,1,2,1,2,3,2,1], // волна: вверх и обратно
    [0,2,0,2,1,3,1,0], // качели: прыжок через ступень
    [0,1,0,2,1,3,2,0]  // трель с редким взлётом
  ];
  const MG_MENU=.9, MG_GAME=.9; // целевая громкость мастер-шины (v1.48.0 «Микс»: кровать музыки слышна под эффектами)
  const MG={menu:MG_MENU, game:MG_GAME};
  /* Микс-стол голосов (v1.48.0): прежняя кровать (~.05 на выходе) тонула под пиками эффектов (.15–.3) —
     поднято ~×2.5, чтобы музыку было слышно всегда, а эффекты больше не кричат */
  const MIX={menuPad:.075, menuBell:.12, drone:.07, quint:.05, tension:.04,
             pulse:.085, pulseT:.105, arp:.07, stingD:.12, stingR:.11, stingPad:.06, kick:.13}; // kick — якорь ритма, заметнее пульса (22.08.2026)

  /* 22.08.2026 «Слои прорастают, а не переключаются»: пульс и арпеджио включались жёстким
     порогом волны (wave>=3, wave>=5) — щелчок, не нарастание, и для среднего забега (34.4с
     по боевым данным) арпеджио почти никогда не успевало включиться вовсе (порог требовал
     ~60+с полёта). Приём из исследования build-up в эмбиенте: непрерывный параметр 0..1,
     слой прорастает из тишины, не появляется по клику. waveRamp(wave,start,full) — линейное
     нарастание от 0 на wave<=start до 1 на wave>=full. */
  function waveRamp(wave,start,full){
    if(wave<=start) return 0;
    if(wave>=full) return 1;
    return (wave-start)/(full-start);
  }
  /* 22.08.2026 «Прилив кика» (владелец): не по целой волне скачком (щёлкнет на границе),
     а по непрерывной дистанции — тот же дух, что и pulseAmt/arpAmt. Два полных прилива-отлива
     на пути к волне 7 (0..3900м, период 1950м), дальше — кик свободный (1.0) до конца.
     Чистая функция цели; фактическая громкость сглаживается лерпом в kickAmtSmooth ниже,
     чтобы переход на границе волны 7 не рвался щелчком, даже если цель скакнула. */
  function kickTideTarget(dist,mission){
    if(mission>=7) return 1;
    return .35 + .65*(.5-.5*Math.cos(dist/975*Math.PI));
  }
  let kickAmtSmooth=0;
  function gameLayers(){ // желаемые слои прямо сейчас: волна и жизни могли смениться между тактами
    const wave=(typeof S!=='undefined')?(S.mission||1):1;
    const lives=(typeof S!=='undefined')?(S.lives==null?3:S.lives):3;
    const dist=(typeof S!=='undefined')?(S.dist||0):0;
    kickAmtSmooth = lerp(kickAmtSmooth, kickTideTarget(dist,wave), .12); // сглаживание — цель может скакнуть на границе волны 7, факт не должен
    // пульс прорастает волны 1→3, арпеджио — волны 1→4 (было жёстко на wave>=5, среднему забегу не хватало времени)
    return {pulseAmt:waveRamp(wave,1,3), arpAmt:waveRamp(wave,1,4), tension:lives===1, kickAmt:kickAmtSmooth};
  }
  function scheduleBar(ac,t){
    if(theme==='menu'){
      const ch=MENU_CHORDS[chordIx%MENU_CHORDS.length]; chordIx++;
      for(const m of ch) padVoice(ac,t,midi(m),MENU_BAR+1.2,MIX.menuPad);
      if(Math.random()<.7) note(ac,t+2+Math.random()*3,midi(PENTA[(Math.random()*PENTA.length)|0]),1.8,MIX.menuBell);
      return MENU_BAR;
    }
    if(theme==='game'){
      const ly=layerState;
      // v1.282.26: редкий, случайный шаг ±1 по DRONE_ROOTS — «плывущий центр», не тикающий метроном
      if(Math.random()<.035) droneRootIx=Math.max(0,Math.min(DRONE_ROOTS.length-1,droneRootIx+((Math.random()<.5)?-1:1)));
      const root=DRONE_ROOTS[droneRootIx];
      padVoice(ac,t,midi(root),GAME_BAR+1.5,MIX.drone); // дрон — слышен на телефоне
      padVoice(ac,t,midi(root+7),GAME_BAR+1.5,MIX.quint); // квинта — шире пространство
      if(ly.tension) padVoice(ac,t,midi(root+13),GAME_BAR+1.5,MIX.tension); // тревожный полутон над корнем
      if(ly.pulseAmt>0) for(let b=0;b<4;b++) note(ac,t+b*BEAT,midi(root),.16,(ly.tension?MIX.pulseT:MIX.pulse)*ly.pulseAmt); // громкость сама прорастает — не щелчок вкл/выкл
      if(ly.kickAmt>0.02) for(let b=0;b<4;b++) kickDrum(ac,t+b*BEAT,MIX.kick*ly.kickAmt); // 22.08.2026: four-on-the-floor — приливная интенсивность (0.02 порог — не тратить голоса на почти неслышимое)
      if(ly.arpAmt>0 && !ly.tension){ // риффотека: один мотив на весь такт (v1.415.2, приём Riffology), не блуждание нота за нотой; громкость прорастает вместе с волной (v1.456.1)
        const motif=ARP_MOTIFS[(Math.random()*ARP_MOTIFS.length)|0]; // «динамически взвешенный случайный выбор» из библиотеки
        const baseIx=Math.max(0,PENTA.indexOf(walk)); // продолжаем от того, где закончился прошлый такт — без скачка регистра
        let lastPitch=walk;
        for(let b=0;b<8;b++){
          const ix=Math.max(0,Math.min(PENTA.length-1,baseIx+motif[b]));
          lastPitch=PENTA[ix];
          note(ac,t+b*BEAT/2,midi(lastPitch),.5,MIX.arp*ly.arpAmt,'triangle',true); // distort=true — жёсткий риф, стиль Daft Punk (владелец, 22.08.2026)
        }
        walk=lastPitch; // следующий такт продолжит с этой ноты — мотивы связаны, не рвутся
      }
      return GAME_BAR;
    }
    return 1;
  }
  function tick(){
    if(!theme||!mg) return;
    const ac=AC; if(!ac) return;
    layerState = theme==='game' ? gameLayers() : {pulseAmt:0,arpAmt:0,tension:false,kickAmt:0};
    if(nextBar < ac.currentTime-.3) nextBar = ac.currentTime+.05; // после сна контекста — не играем прошлое пачкой, начинаем с чистого такта (v1.20.0)
    while(nextBar < ac.currentTime + .9){
      if(pendingTheme){ // граница такта — самый момент переключиться, не обрывая уже идущий
        theme=pendingTheme; pendingTheme=null; chordIx=0; walk=76; droneRootIx=0;
        fadeTo(MG[theme]||MG_GAME,1.0);
        layerState = theme==='game' ? gameLayers() : {pulseAmt:0,arpAmt:0,tension:false,kickAmt:0};
      }
      nextBar += scheduleBar(ac, nextBar);
    }
  }
  function fadeTo(v,sec){
    if(!mg||!AC) return;
    mg.gain.cancelScheduledValues(AC.currentTime);
    mg.gain.setValueAtTime(mg.gain.value,AC.currentTime);
    mg.gain.linearRampToValueAtTime(v,AC.currentTime+sec);
  }
  return {
    start(th){
      if(MUTED||!MUSIC_ON){ theme=null; pendingTheme=null; return; }
      const ac=ensureChain(); if(!ac){ theme=null; pendingTheme=null; return; }
      /* v1.282.14: приглушение снимаем ДО раннего выхода. Флаг ducked жил дольше причины:
         пауза ставила его, а «Заново» звало start('game') с той же темой — ранний выход,
         гейн так и оставался на трети, и весь новый забег музыка играла вполголоса.
         Через «В меню» тема менялась, гейн возвращался, но флаг оставался true — и тогда
         следующая пауза уже НЕ приглушала (duck выходит по ducked===on), а kick() при ударе
         целился в base*0.3 и ронял музыку до конца забега. У двигателя такая строка есть
         с самого начала (engine.start ставит ducked=false) — у музыки не было. */
      ducked=false;
      if(theme===th){ pendingTheme=null; if(mg) fadeTo(MG[th]||MG_GAME,.4); return; }
      if(!theme){ // ничего не играло — начинать сразу, ждать нечего, приём такта не нужен
        theme=th; pendingTheme=null; chordIx=0; walk=76; droneRootIx=0; nextBar=ac.currentTime+.08;
        fadeTo(MG[th]||MG_GAME,1.6);
        if(!timer) timer=setInterval(tick,200);
        tick();
        return;
      }
      /* 22.08.2026 «Переход по такту, не по клику» (приём iMUSE): раньше тема менялась
         мгновенно — chordIx/walk/droneRootIx сбрасывались посреди уже звучащей фразы,
         такт обрывался на любом месте. Теперь смена откладывается: уже идущий такт
         доигрывает естественно (его ноты уже запланированы в Web Audio, никто их не трогает),
         а переключение случается в tick(), прямо перед планированием СЛЕДУЮЩЕГО такта. */
      pendingTheme=th;
    },
    stop(fade){
      theme=null; pendingTheme=null; ducked=false; // v1.282.14: флаг не переживает остановку темы
      if(mg&&AC) fadeTo(0,fade||1.2);
      if(timer){ clearInterval(timer); timer=null; }
    },
    duck(on){
      if(ducked===on) return; ducked=on;
      if(mg&&theme) fadeTo((MG[theme]||MG_GAME)*(on?.3:1),.4);
    },
    kick(){ // сайдчейн (v1.48.0 «Микс»): удар/Сверхновая прижимают музыку на 0.8с — эффекту не нужно кричать, чтобы пробиться
      if(!mg||!theme||!AC) return;
      const base=MG[theme]||MG_GAME, now=AC.currentTime;
      mg.gain.cancelScheduledValues(now);
      mg.gain.setValueAtTime(Math.max(mg.gain.value,base*.34),now);
      mg.gain.linearRampToValueAtTime(base*.32,now+.05);
      mg.gain.linearRampToValueAtTime(base*(ducked?.3:1),now+.8);
      stats.kicks++;
    },
    sting(kind){ // кода: смерть — три ноты вниз; рекорд — фанфарный подъём + аккорд
      if(MUTED||!MUSIC_ON) return;
      const ac=ensureChain(); if(!ac) return;
      const t=ac.currentTime+.05;
      if(kind==='record'){
        [69,72,76,81].forEach((m,i)=>note(ac,t+i*.09,midi(m),.4,MIX.stingR,'triangle'));
        [57,61,64,69].forEach(m=>padVoice(ac,t+.4,midi(m),1.6,MIX.stingPad));
      } else {
        [64,60,57].forEach((m,i)=>note(ac,t+i*.3,midi(m),.55,MIX.stingD,'triangle'));
      }
      stats.stings++;
    },
    /* --- для стенда --- */
    _stats:stats,
    _theme:()=>theme,
    _gain:()=>mg?mg.gain.value:null, // 31.08.2026: реальная громкость шины — вердикт (blackbox.js)
      // раньше проверял только состояния (тема выбрана? контекст жив?), не саму цифру — гейн
      // мог застрять у нуля (дак не довелся до конца), а вердикт всё равно говорил «ОК»
    _layers:()=>({...layerState}),
    _ducked:()=>ducked,
    _levels:()=>({menu:MG_MENU, game:MG_GAME}), // страж громкости: не вернуть «тихую» музыку
    _mix:()=>({...MIX}),
    _jitterFreq:jitterFreq, _jitterPan:jitterPan, // партия 24 — стенд проверяет разброс напрямую
    _droneRoot:()=>DRONE_ROOTS[droneRootIx],
    _kickDrift(dir){ droneRootIx=Math.max(0,Math.min(DRONE_ROOTS.length-1,droneRootIx+(dir||1))); } // партия 24 — принудительный шаг для теста, минуя случайность
  };
})();

/* ---------- Голос самолётика (Фаза В) ----------
   Непрерывный шелест полёта: зацикленный шум → lowpass → gain.
   Тон и громкость следуют за скоростью;
   слоумо — замирает. Характер скина: Плазма грубее (+саб),
   Призрак — шёпот, остальные — ровный шелест. Звуковой эффект (MUTED),
   не музыка: тумблер «Музыка» его не трогает. */
const engine=(()=>{
  let src=null, flt=null, g=null, sub=null, timer=null, on=false, ducked=false, gen=0;
  let lastG=0, lastF=0; // последние целевые значения — для стенда
  function stopNodes(){
    try{ src&&src.stop(); }catch(e){}
    try{ sub&&sub.stop(); }catch(e){}
    src=sub=flt=g=null;
  }
  function profile(){ // характер по скину
    const fx=(typeof SKINS!=='undefined'&&typeof S!=='undefined'&&SKINS[S.skin]&&SKINS[S.skin].fx)||'';
    if(fx==='ghost') return {gm:.35, sub:0};      // шёпот
    if(fx==='plasma') return {gm:1.25, sub:.012}; // грубее, с рокочущим сабом
    if(fx==='neon') return {gm:.9, sub:0};
    return {gm:1, sub:0};
  }
  function loop(){
    if(!on||!g||!AC) return;
    const run=(typeof S!=='undefined'&&S.running);
    const sp=run?S.speed:0;
    const calm=run&&S.slowmo>0; // спокойствие — только у slowmo; скоростных бонусов нет (v1.22.0)
    const pr=profile();
    lastG=(.03+Math.min(sp,10)*.004)*(calm?.35:1)*(ducked?.15:1)*pr.gm;
    lastF=Math.min((420+sp*90)*(calm?.5:1),2400);
    const t=AC.currentTime;
    g.gain.setTargetAtTime(lastG,t,.12);
    flt.frequency.setTargetAtTime(lastF,t,.12);
  }
  return {
    start(){
      if(MUTED) return;
      const ac=audio(); if(!ac) return;
      if(on && g && g.context!==ac) on=false; // 26.08.2026: та же беда, что у music-цепи выше —
        // флаг «уже играю» пережил смерть контекста, шелест молчал бы до конца полёта
      if(on) return;
      stopNodes();
      src=ac.createBufferSource(); src.buffer=noiseBuf(ac); src.loop=true;
      flt=ac.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=500; flt.Q.value=.5;
      g=ac.createGain(); g.gain.value=0;
      const pr=profile();
      if(pr.sub){ // саб Плазмы
        sub=ac.createOscillator(); sub.type='sawtooth'; sub.frequency.value=55;
        const sg=ac.createGain(); sg.gain.value=pr.sub;
        sub.connect(sg); sg.connect(g); sub.start();
      }
      src.connect(flt); flt.connect(g); g.connect(ac.destination);
      src.start(); on=true; ducked=false; gen++; // новое поколение — отложенная чистка от stop() его не тронет
      if(!timer) timer=setInterval(loop,150);
      loop();
    },
    stop(){
      on=false;
      if(g&&AC) g.gain.setTargetAtTime(0,AC.currentTime,.1);
      const g0=gen; // гонка «стоп → быстрый рестарт»: чистим узлы, только если нового старта не было
      setTimeout(()=>{ if(gen===g0) stopNodes(); },400);
      if(timer){ clearInterval(timer); timer=null; }
    },
    duck(d){ ducked=!!d; loop(); },
    _on:()=>on,
    _dbg:()=>({g:lastG, f:lastF})
  };
})();
