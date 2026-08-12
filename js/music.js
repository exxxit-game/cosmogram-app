/* ---------- Музыка (Фаза А: генеративный эмбиент — синтез, ноль ассетов) ----------
   Пэды меню, адаптивный полёт (слои по волне/жизням), коды смерти/рекорда.
   Цепочка: голоса → musicGain → [dry + ConvolverNode(генерированный импульс)] → out.
   Уважает MUTED (общий звук) и MUSIC_ON (своя настройка 'music').
   Не трогает sfx: у музыки своя ветка громкости. */
let MUSIC_ON = true; // boot: Store 'music'

const music = (()=>{
  let mg=null, conv=null, wet=null;      // master gain + реверб-ветка
  let theme=null, ducked=false;          // 'menu' | 'game' | null
  let timer=null, nextBar=0, chordIx=0, walk=76;
  let layerState={pulse:false, arp:false, tension:false};
  const stats={pads:0, notes:0, stings:0, kicks:0}; // счётчики для тестового стенда

  function midi(m){ return 440*Math.pow(2,(m-69)/12); }
  function impulse(ac,dur,decay){ // «космический хвост»: шум с экспоненциальным затуханием
    const rate=ac.sampleRate, len=Math.floor(rate*dur);
    const buf=ac.createBuffer(2,len,rate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay); }
    return buf;
  }
  function ensureChain(){
    if(MUTED||!MUSIC_ON) return null;
    const ac=audio(); if(!ac) return null;
    if(!mg){
      mg=ac.createGain(); mg.gain.value=0;
      conv=ac.createConvolver(); conv.buffer=impulse(ac,2.8,2.2);
      wet=ac.createGain(); wet.gain.value=.55;
      const dry=ac.createGain(); dry.gain.value=.85;
      mg.connect(dry); dry.connect(ac.destination);
      mg.connect(conv); conv.connect(wet); wet.connect(ac.destination);
    }
    return ac;
  }
  function padVoice(ac,t,f,dur,vol){ // мягкий пэд: два расстроенных треугольника + фильтр
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+dur*.35);
    g.gain.linearRampToValueAtTime(0,t+dur);
    const flt=ac.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=1300; flt.Q.value=.4;
    for(const det of [-5,5]){
      const o=ac.createOscillator(); o.type='triangle';
      o.frequency.value=f; o.detune.value=det;
      o.connect(flt); o.start(t); o.stop(t+dur+.05);
    }
    flt.connect(g); g.connect(mg); stats.pads++;
  }
  function note(ac,t,f,dur,vol,type){ // колокольчик/пульс/арпеджио
    const o=ac.createOscillator(); o.type=type||'sine'; o.frequency.value=f;
    const g=ac.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+.02);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g); g.connect(mg); o.start(t); o.stop(t+dur+.05); stats.notes++;
  }

  /* Темы: меню — медленные аккорды Am→F→G→Em с редкими колокольчиками;
     полёт — дрон A всегда, пульс с 3-й волны, арпеджио с 5-й, тревога на последней жизни.
     Регистр поднят на октаву: динамики телефонов не воспроизводят 110–160 Гц —
     музыка должна звучать именно на телефоне, а не в наушниках студии. */
  const MENU_CHORDS=[[57,64,69,72,76],[53,60,65,69,72],[55,62,67,71,74],[52,59,64,67,71]];
  const MENU_BAR=7, GAME_BAR=3, BEAT=.75;
  const PENTA=[69,72,74,76,79,81,84];
  const MG_MENU=.9, MG_GAME=.9; // целевая громкость мастер-шины (v1.48.0 «Микс»: кровать музыки слышна под эффектами)
  const MG={menu:MG_MENU, game:MG_GAME};
  /* Микс-стол голосов (v1.48.0): прежняя кровать (~.05 на выходе) тонула под пиками эффектов (.15–.3) —
     поднято ~×2.5, чтобы музыку было слышно всегда, а эффекты больше не кричат */
  const MIX={menuPad:.075, menuBell:.12, drone:.07, quint:.05, tension:.04,
             pulse:.085, pulseT:.105, arp:.07, stingD:.12, stingR:.11, stingPad:.06};

  function gameLayers(){ // желаемые слои прямо сейчас: волна и жизни могли смениться между тактами
    const wave=(typeof S!=='undefined')?(S.mission||1):1;
    const lives=(typeof S!=='undefined')?(S.lives==null?3:S.lives):3;
    return {pulse:wave>=3, arp:wave>=5, tension:lives===1};
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
      padVoice(ac,t,midi(57),GAME_BAR+1.5,MIX.drone); // дрон A3 — слышен на телефоне
      padVoice(ac,t,midi(64),GAME_BAR+1.5,MIX.quint); // квинта E4 — шире пространство
      if(ly.tension) padVoice(ac,t,midi(70),GAME_BAR+1.5,MIX.tension); // Bb4 — тревожный полутон
      if(ly.pulse) for(let b=0;b<4;b++) note(ac,t+b*BEAT,midi(57),.16,ly.tension?MIX.pulseT:MIX.pulse);
      if(ly.arp && !ly.tension){ // арпеджио: случайная прогулка по пентатонике
        for(let b=0;b<8;b++){
          if(Math.random()<.55){
            walk=PENTA[Math.max(0,Math.min(PENTA.length-1,PENTA.indexOf(walk)+((Math.random()*3)|0)-1))]||76;
            note(ac,t+b*BEAT/2,midi(walk),.5,MIX.arp,'triangle');
          }
        }
      }
      return GAME_BAR;
    }
    return 1;
  }
  function tick(){
    if(!theme||!mg) return;
    const ac=AC; if(!ac) return;
    layerState = theme==='game' ? gameLayers() : {pulse:false,arp:false,tension:false};
    if(nextBar < ac.currentTime-.3) nextBar = ac.currentTime+.05; // после сна контекста — не играем прошлое пачкой, начинаем с чистого такта (v1.20.0)
    while(nextBar < ac.currentTime + .9) nextBar += scheduleBar(ac, nextBar);
  }
  function fadeTo(v,sec){
    if(!mg||!AC) return;
    mg.gain.cancelScheduledValues(AC.currentTime);
    mg.gain.setValueAtTime(mg.gain.value,AC.currentTime);
    mg.gain.linearRampToValueAtTime(v,AC.currentTime+sec);
  }
  return {
    start(th){
      if(MUTED||!MUSIC_ON){ theme=null; return; }
      const ac=ensureChain(); if(!ac){ theme=null; return; }
      /* v1.282.14: приглушение снимаем ДО раннего выхода. Флаг ducked жил дольше причины:
         пауза ставила его, а «Заново» звало start('game') с той же темой — ранний выход,
         гейн так и оставался на трети, и весь новый забег музыка играла вполголоса.
         Через «В меню» тема менялась, гейн возвращался, но флаг оставался true — и тогда
         следующая пауза уже НЕ приглушала (duck выходит по ducked===on), а kick() при ударе
         целился в base*0.3 и ронял музыку до конца забега. У двигателя такая строка есть
         с самого начала (engine.start ставит ducked=false) — у музыки не было. */
      ducked=false;
      if(theme===th){ if(mg) fadeTo(MG[th]||MG_GAME,.4); return; }
      theme=th; chordIx=0; walk=76; nextBar=ac.currentTime+.08;
      fadeTo(MG[th]||MG_GAME,1.6);
      if(!timer) timer=setInterval(tick,200);
      tick();
    },
    stop(fade){
      theme=null; ducked=false; // v1.282.14: флаг не переживает остановку темы
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
    _layers:()=>({...layerState}),
    _ducked:()=>ducked,
    _levels:()=>({menu:MG_MENU, game:MG_GAME}), // страж громкости: не вернуть «тихую» музыку
    _mix:()=>({...MIX})
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
      if(MUTED||on) return;
      const ac=audio(); if(!ac) return;
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
