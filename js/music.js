/* ---------- Музыка (27.09.2026: полная замена — партитура нотами, без случайности) ----------
   Откуда: владелец прислал 7 любимых треков (Worakls — Salzburg, Jon Hopkins — Everything
   Connected, Kiasmos — Burnt, Kid Francescoli — Moon, Teho — Elephants, HVOB — 2/16,
   Sascha Funke — Mango); разобраны численно (темп, лад, строение, грув), общее:
   118–132 BPM; мажор с тенью своей минорной пары; круг из 2–4 аккордов на весь трек;
   «моторчик» из шестнадцатых; долгое вступление, одна большая передышка, возвращение.
   Музыка написана по этим законам и утверждена владельцем на слух в макетах (варианты 1–4,
   6-минутная версия, версия с ложным финалом, версия без «тик-так» — хэт/шейкер/блеск сняты
   по его слову: «щелчки, наверное это оно»).
   Чем была прежняя: «генеративный эмбиент» с разбросом ±3% на КАЖДУЮ ноту (до ±51 цента —
   почти четверть тона: аккорды звучали фальшиво) и случайным выбором мотивов — запомнить
   было нечего. Страж 98 раньше стерёг этот разброс, теперь стережёт обратное.
   Лёгкость: частые ноты (бас на 1/16, арпеджио, флейта, второй голос) играют «постоянные
   инструменты» — созданы один раз, ноты — только автоматизация; редкие звуки (аккорд раз в
   такт, бочка, голос, колокольчик) — по ноте, как в утверждённом макете, чтобы звучание
   совпало один в один (сверено спектрограммой такт за тактом: 0.979, ни одного такта ниже
   0.95). Нагрузка в полёте — ~30% ядра против ~40% у прежней музыки (офлайн-замер).
   Размер: движок ~3,5 КБ и партитура ~0,9 КБ в сжатом виде — дух js13kGames (ZzFXM и др.):
   музыка — ноты-данные плюс крошечный синтезатор, ноль аудиофайлов.
   Ложный финал (Notion «Дорожная карта», 31.08.2026; решение владельца 27.09.2026 — «сразу с
   финалом по волне 10»): когда забег ДОЛЕТАЕТ до волны 10, на ближайшем начале круга —
   удар и «аминь»-каденция (фа → до), 11 тактов затишья (20,6 с), затем второй этап той же
   песни. Один раз за забег; забег, начатый уже с волны ≥10 (Своё небо), финала не даёт.
   Глоссарий коротких глобалов (см. core.js): AC — AudioContext, S — состояние забега. */
let MUSIC_ON = true; // boot: Store 'music'

const music = (()=>{
  /* ── ПАРТИТУРА ─────────────────────────────────────────────────────────────
     До мажор, 128 BPM, круг 8 тактов по 2 такта на аккорд: C – Em – Am – F.
     Мелодия — детская «дразнилка» соль-ми-ля-соль-ми (всемирный мотив), перенесённая
     на каждый аккорд; над F — си (лидийская «парящая» нота, как в Mango).
     Сетка мелодии — 8 восьмых на такт: MIDI-нота, -1 тянуть, 0 пауза. */
  const C=[48,[60,64,67]], Em=[40,[59,64,67]], Am=[45,[60,64,69]], F=[41,[60,65,69]];
  const A=[[79,-1,76,81,79,-1,76,-1],[79,-1,76,81,79,-1,72,-1],[79,-1,76,83,79,-1,76,-1],[79,-1,76,83,79,-1,71,-1],
           [84,-1,81,86,84,-1,81,-1],[84,-1,81,86,84,-1,76,-1],[81,-1,77,83,81,-1,77,-1],[81,-1,79,-1,77,-1,74,-1]];
  const B=[[79,-1,76,81,79,-1,76,-1],[79,-1,76,81,79,76,84,-1],[79,-1,76,83,79,-1,76,-1],[79,-1,76,83,79,76,83,-1], // B: концы фраз взлетают
           [84,-1,81,86,84,-1,81,-1],[84,-1,81,86,84,81,88,-1],[81,-1,77,83,81,-1,77,-1],[81,-1,83,-1,84,-1,86,-1]];
  const H=[]; for(let k=0;k<8;k+=2){ const st=[]; A[k].forEach(n=>{ st.push(n); st.push(n>0?-1:n); }); H.push(st.slice(0,8), st.slice(8,16)); } // вдвое медленнее
  const CALM_CH=[C,C,Am,Am,F,F,C,C,Am,Am,F]; // затишье: удар на C после F, в конце — ступеньки к возвращению
  const CALM=[[84,-1,-1,-1,-1,-1,-1,-1],[0,0,0,0,0,0,0,0],[76,-1,-1,-1,72,-1,-1,-1],[0,0,0,0,0,0,0,0],[77,-1,-1,-1,81,-1,-1,-1],[0,0,0,0,0,0,0,0],
              [79,-1,76,-1,72,-1,-1,-1],[0,0,0,0,0,0,0,0],[81,-1,-1,-1,76,-1,-1,-1],[0,0,0,0,0,0,0,0],[77,-1,79,-1,81,-1,83,-1]];
  const O2=76; // второй этап отсчитывает круг заново от своего начала
  const SCORE={ bpm:128, topNote:86, chords:[C,C,Em,Em,Am,Am,F,F], melodies:{A,B,H},
    kickOff:[19,20,23,24, 78,79,82,83],                        // бочка «дразнит»: 2 такта есть — 2 нет
    breath:[16,32,40,56, 91,99,107,115,123,131,171,179],        // «вдох»: на такт уходит весь низ
    sections:[ // номера тактов — как в утверждённом макете (такт 1 = 0:00)
      {id:'menu1', from:1,  to:8,   on:['pad','top','lead']},
      {id:'menu2', from:9,  to:16,  on:['pad','top','lead','arp','bass']},
      {id:'lift',  from:17, to:24,  on:['pad','top','lead','arp','bass','kick']},
      {id:'flight',from:25, to:40,  on:['pad','top','lead','arp','bass','kick','clap']},
      {id:'rest',  from:41, to:48,  on:['pad','top','lead','arp','bell']},
      {id:'drive', from:49, to:64,  mel:'B', on:['pad','top','lead','arp','bass','kick','clap','counter']},
      {id:'finale',from:65, to:65,  origin:65, chords:CALM_CH, mel:CALM, on:['finale','top','lead','bell']},
      {id:'calm',  from:66, to:75,  origin:65, chords:CALM_CH, mel:CALM, on:['pad','top','lead','bell']},
      {id:'s2lift',  from:76, to:83,  origin:O2, on:['pad','top','lead','arp','bass','kick']},
      {id:'s2flight',from:84, to:99,  origin:O2, on:['pad','top','lead','arp','bass','kick','clap','counter']},
      {id:'s2drive', from:100,to:115, origin:O2, mel:'B', on:['pad','top','lead','arp','bass','kick','clap','counter']},
      {id:'s2hum',   from:116,to:131, origin:O2, on:['pad','top','hum','arp','bass','kick','clap']},
      {id:'s2rest',  from:132,to:147, origin:O2, mel:'H', on:['pad','top','lead','arp','bell']},
      {id:'s2climb', from:148,to:155, origin:O2, on:['pad','top','lead','arp','kickQ','riser']},
      {id:'s2peak',  from:156,to:179, origin:O2, mel:'B', on:['pad','top','lead','arp','bass','kick','clap','counter']} ] };
  // Как партитура идёт в игре: меню — такты 1-16 по кругу; полёт — с такта 17 вперёд, после 64
  // по кругу 25-64 (с передышкой внутри), пока забег не долетит до волны 10; затем финал
  // (65), затишье (66-75), второй этап 76-179 и дальше по кругу 84-179.
  const MENU=[1,16], S1=[17,64], S1LOOP=25, FIN=65, S2=[76,179], S2LOOP=84, FINALE_WAVE=10;

  /* ── СИНТЕЗАТОР ────────────────────────────────────────────────────────────── */
  function hz(m){ return 440*Math.pow(2,(m-69)/12); }
  function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  const stats={pads:0, notes:0, stings:0, kicks:0, bars:0}; // счётчики для стенда
  function createSynth(ac, dest){
    const rnd=mulberry(7), live=[];
    const out=ac.createGain(); out.gain.value=.8; /* как в утверждённом макете (27.09.2026: убрано самодеятельное ×4) */ out.connect(dest);
    const len=Math.floor(ac.sampleRate*2.2), ir=ac.createBuffer(2,len,ac.sampleRate); // реверб с фиксированным зерном — без случайности от запуска к запуску
    for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++) d[i]=(rnd()*2-1)*Math.pow(1-i/len,3); }
    const conv=ac.createConvolver(); conv.buffer=ir; const wet=ac.createGain(); wet.gain.value=.28; conv.connect(wet); wet.connect(out);
    const duck=ac.createGain(); duck.connect(out); // всё, что «дышит» от бочки
    const noise=ac.createBuffer(1,ac.sampleRate,ac.sampleRate); { const d=noise.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=rnd()*2-1; }
    function osc(type,f,det){ const o=ac.createOscillator(); o.type=type; o.frequency.value=f||440; if(det) o.detune.value=det; o.start(); live.push(o); return o; }
    function gain(v){ const g=ac.createGain(); g.gain.value=v==null?0:v; return g; }
    function filt(type,f,q){ const b=ac.createBiquadFilter(); b.type=type; b.frequency.value=f; if(q!=null) b.Q.value=q; return b; }
    function send(node,d2,rev){ node.connect(d2); if(rev){ const s=gain(rev); node.connect(s); s.connect(conv); } }
    function duckAt(t){ duck.gain.setValueAtTime(.35,t); duck.gain.setTargetAtTime(1,t+.02,.09); }
    // огибающая утверждённого макета: атака → спад к держанию → хвост ПОСЛЕ конца ноты
    function env(p,t,a,peak,d,sus,rel,end){ p.cancelScheduledValues(t); p.setValueAtTime(0,t); p.linearRampToValueAtTime(peak,t+a); p.setTargetAtTime(sus,t+a,d); p.setTargetAtTime(0,end,rel); }
    // бас: 2 постоянных голоса по очереди (пила + синус октавой ниже → lowpass с «вау»)
    const BS=[0,1].map(()=>{ const x={ o1:osc('sawtooth'), o2:osc('sine'), f:filt('lowpass',180,4), g:gain(0) };
      const m1=gain(.6), m2=gain(.9); x.o1.connect(m1); x.o2.connect(m2); m1.connect(x.f); m2.connect(x.f); x.f.connect(x.g); x.g.connect(duck); return x; }); let bsI=0;
    function bass(t,m,d,v){ const x=BS[bsI++%2]; x.o1.frequency.setValueAtTime(hz(m),t); x.o2.frequency.setValueAtTime(hz(m-12),t);
      x.f.frequency.cancelScheduledValues(t); x.f.frequency.setValueAtTime(900,t); x.f.frequency.setTargetAtTime(180,t,.06); env(x.g.gain,t,.005,v,.08,v*.6,.03,t+d); }
    // арпеджио: 3 постоянных голоса по очереди — ноты звенят внахлёст
    const AP=[0,1,2].map(()=>{ const x={ o:osc('square'), f:filt('lowpass',1500), g:gain(0) }; x.o.connect(x.f); x.f.connect(x.g); send(x.g,duck,.3); return x; }); let apI=0;
    function pluck(t,m,v,cut){ const x=AP[apI++%3]; x.o.frequency.setValueAtTime(hz(m),t); x.f.frequency.cancelScheduledValues(t); x.f.frequency.setValueAtTime(cut,t); x.f.frequency.setTargetAtTime(cut*.3,t,.05);
      x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(v,t); x.g.gain.setTargetAtTime(0,t+.005,.07); stats.notes++; }
    // флейта: 2 постоянных голоса по очереди; вибрато — свой генератор на ноту (с нуля фазы), живёт не дольше хвоста
    const FL=[0,1].map(()=>{ const x={ o1:osc('sine'), o2:osc('sine'), d1:gain(0), d2:gain(0), g:gain(0) };
      const m2=gain(.18); x.o1.connect(x.g); x.o2.connect(m2); m2.connect(x.g); x.d1.connect(x.o1.frequency); x.d2.connect(x.o2.frequency); send(x.g,out,.35); return x; }); let flI=0;
    function flute(t,m,d,v){ const x=FL[flI++%2], f=hz(m); x.o1.frequency.setValueAtTime(f,t); x.o2.frequency.setValueAtTime(2*f,t);
      const lfo=ac.createOscillator(); lfo.frequency.value=5.5; lfo.connect(x.d1); lfo.connect(x.d2); lfo.start(t); lfo.stop(t+d+.2);
      for(const [dn,k] of [[x.d1,1],[x.d2,2]]){ dn.gain.cancelScheduledValues(t); dn.gain.setValueAtTime(0,t); dn.gain.linearRampToValueAtTime(f*k*.004,t+.25); }
      env(x.g.gain,t,.012,v,.1,v*.8,.06,t+d); stats.notes++; }
    // голос «у-м»: по ноте (у постоянного голоса резкие форманты «помнят» прошлую ноту — баланс с флейтой уплывал)
    let voPrev=0;
    function vocal(t,m,d,v){ const o=ac.createOscillator(); o.type='sawtooth'; const f0=hz(m);
      if(voPrev){ o.frequency.setValueAtTime(hz(voPrev),t); o.frequency.exponentialRampToValueAtTime(f0,t+.07); } else o.frequency.setValueAtTime(f0,t); voPrev=m;
      const lfo=ac.createOscillator(), lg=gain(0); lfo.frequency.value=5.2; lg.gain.setValueAtTime(0,t); lg.gain.linearRampToValueAtTime(f0*.006,t+.3); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t+d+.4);
      const g=gain(0), sum=gain(1), lp=filt('lowpass',2600);
      for(const [fr,q,gg] of [[320,6,1],[800,9,.45],[2300,12,.12],[260,3,.6]]){ const bp=filt('bandpass',fr,q), bg=gain(gg*3); o.connect(bp); bp.connect(bg); bg.connect(sum); }
      sum.connect(lp); lp.connect(g); env(g.gain,t,.06,v,.2,v*.85,.09,t+d); send(g,out,.45); o.start(t); o.stop(t+d+.5); stats.notes++; }
    // второй голос: 2 постоянных по очереди
    const CT=[0,1].map(()=>{ const x={ o:osc('sawtooth'), f:filt('lowpass',1400), g:gain(0) }; x.o.connect(x.f); x.f.connect(x.g); send(x.g,duck,.3); return x; }); let ctI=0;
    function counter(t,m,d,v){ const x=CT[ctI++%2]; x.o.frequency.setValueAtTime(hz(m),t); env(x.g.gain,t,.02,v,.1,v*.7,.08,t+d); }
    // аккорд раз в такт: новые пилы с одной фазы — одинаковый «вдох» каждый такт (7 узлов на такт — дёшево)
    function pad(t,notes,d,v,cut){ const g=gain(0), f=filt('lowpass',cut,.5);
      notes.forEach(m=>{ for(const det of [-7,7]){ const o=ac.createOscillator(); o.type='sawtooth'; o.frequency.value=hz(m); o.detune.value=det; const og=gain(1/notes.length/2); o.connect(og); og.connect(f); o.start(t); o.stop(t+d+1.2); } });
      env(g.gain,t,.25,v,.5,v*.8,.35,t+d); f.connect(g); g.connect(duck); const s=gain(.5); g.connect(s); s.connect(conv); stats.pads++; }
    function kick(t,v){ const o=ac.createOscillator(), g=gain(0); o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(48,t+.09);
      g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.001,t+.42); o.connect(g); g.connect(out); o.start(t); o.stop(t+.45); duckAt(t); }
    function bell(t,m,v){ const g=gain(0); for(const [mul,vv] of [[1,1],[2,.35],[3.01,.12]]){ const o=ac.createOscillator(); o.type='sine'; o.frequency.value=hz(m)*mul; const og=gain(vv); o.connect(og); og.connect(g); o.start(t); o.stop(t+1.6); }
      g.gain.setValueAtTime(v,t); g.gain.setTargetAtTime(0,t+.005,.35); send(g,out,.35); stats.notes++; }
    function clap(t,v){ for(let k=0;k<3;k++){ const s=ac.createBufferSource(); s.buffer=noise; const f=filt('bandpass',1600,1.2), g=gain(0), tt=t+k*.011;
      g.gain.setValueAtTime(v,tt); g.gain.exponentialRampToValueAtTime(.001,tt+(k===2?.16:.02)); s.connect(f); f.connect(g); send(g,out,.25); s.start(tt,rnd()*.5); s.stop(tt+.2); } }
    function crash(t){ const s=ac.createBufferSource(); s.buffer=noise; s.loop=true; const f=filt('highpass',5000), g=gain(0);
      g.gain.setValueAtTime(.28,t); g.gain.setTargetAtTime(0,t+.02,.9); s.connect(f); f.connect(g); send(g,out,.5); s.start(t); s.stop(t+4.5); }
    function riser(t,d,p0,p1){ const s=ac.createBufferSource(); s.buffer=noise; s.loop=true; const f=filt('bandpass',400+p0*6000,2), g=gain(0);
      f.frequency.linearRampToValueAtTime(400+p1*6000,t+d); g.gain.setValueAtTime(.02+p0*.1,t); g.gain.linearRampToValueAtTime(.02+p1*.1,t+d); s.connect(f); f.connect(g); send(g,out,.3); s.start(t); s.stop(t+d+.02); }
    // один такт партитуры (b — номер такта с 1)
    function bar(b,t0){
      const beat=60/SCORE.bpm, BAR=beat*4, six=beat/4;
      const sec=SCORE.sections.find(s=>b>=s.from&&b<=s.to), on=new Set(sec.on), ix=b-(sec.origin||1), CH=sec.chords||SCORE.chords, [root,tri]=CH[ix%CH.length];
      if(SCORE.kickOff.includes(b)) on.delete('kick');
      if(SCORE.breath.includes(b)) ['kick','kickQ','bass','clap'].forEach(k=>on.delete(k));
      const drv=on.has('kick')||on.has('kickQ');
      if(on.has('pad')) pad(t0,tri,BAR-.05,.22,drv?2600:1400);
      if(on.has('top')) pad(t0,[SCORE.topNote],BAR-.05,.07,3000); // верхняя неподвижная нота над меняющимися аккордами
      if(on.has('finale')){ kick(t0,1); clap(t0,.6); crash(t0); pad(t0,[tri[0]-12,...tri,tri[0]+12],BAR*1.5,.28,3000); }
      if(on.has('kick')) for(let q=0;q<4;q++) kick(t0+q*beat,.9);
      if(on.has('kickQ')){ kick(t0,.8); if((b-sec.from)>=(sec.to-sec.from+1)/2) kick(t0+2*beat,.8); } // нарастание: бочка на 1, потом на 1 и 3
      if(on.has('clap')){ clap(t0+beat,.5); clap(t0+3*beat,.5); }
      if(on.has('riser')){ const n=sec.to-sec.from+1, k=b-sec.from; riser(t0,BAR,k/n,(k+1)/n); }
      if(on.has('bass')){
        if(drv) for(let k=0;k<16;k++) bass(t0+k*six,root+((k%4===2)?12:0),six*.8,(k%4===0)?.28:.22); // катящийся бас
        else for(let q=0;q<4;q++) bass(t0+q*beat+beat/2,root,beat*.45,.3);
      }
      if(on.has('arp')){ const seq=[tri[0],tri[1],tri[2],tri[1]+12], st=drv?1:2; // под мелодией, не в её регистре
        for(let k=0;k<16;k+=st) pluck(t0+k*six, seq[(k/st)%4]+12, .09, drv?2400:1500); }
      const mel=Array.isArray(sec.mel)?sec.mel:SCORE.melodies[sec.mel||'A'], mb=mel[ix%mel.length];
      for(let i=0;i<8;i++){ const n=mb[i]; if(n<=0) continue; let d=1; while(i+d<8&&mb[i+d]===-1) d++;
        const t=t0+i*beat/2, dur=d*beat/2-.02;
        if(on.has('lead')){ vocal(t,n-12,dur,.16); if(on.has('bell')) bell(t,n,drv?.11:.18); else flute(t,n,dur,drv?.11:.18); }
        if(on.has('hum')) vocal(t,n-12,dur,.2);
        if(on.has('counter')) counter(t,n-12,dur,.07); }
      stats.bars++;
      return { bar:b, sec:sec.id, cyc:((ix%8)+8)%8 };
    }
    // коды: смерть — три ноты вниз; рекорд — подъём по мажорному трезвучию + аккорд (всё в до мажоре)
    function sting(t,kind){
      if(kind==='record'){ [72,76,79,84].forEach((m,i)=>bell(t+i*.09,m,.16)); pad(t+.4,[60,64,67,72],1.6,.2,2600); }
      else [67,64,60].forEach((m,i)=>bell(t+i*.3,m,.14));
    }
    function stop(t){ live.forEach(o=>{ try{ o.stop(t); }catch(e){} }); }
    return { bar, sting, stop };
  }

  /* ── ПЛАНИРОВЩИК ─────────────────────────────────────────────────────────── */
  let mg=null, sat=null, syn=null, ana=null;
  /* 27.09.2026 ИЗМЕРИТЕЛЬ (владелец: «как только начинаешь играть — музыка сразу пропадает» + «рыпение
     с самого начала»; на компьютере в полёте музыка не пропадает — дело в телефоне, гадать по коду
     нельзя). «Отзыв» говорил «музыка играет» по одним состояниям (тема, громкость) — настоящий звук
     не мерил никто. Музыка пишет в ленту чёрного ящика (уходит с «Отзывом»), только замеры, звук не
     меняется: bench — один раз в меню, сколько телефон считает 2 такта самой плотной части (доля от
     реального времени; ближе к 100% — звук не успевает, это треск); «полёт» — через 6 с полёта:
     уровень сигнала музыки (анализатор после выхода), запас нот впереди, ход звуковых часов к
     настенным (clk<1 — звук отстаёт); тревога «такты стоят» — тема выбрана, а нот нет. Страж 362. */
  let lastTickAt=0, benchStarted=false, benchRes=null, themeAt=0, flight=null, deadSaid=false;
  function tape(d){ try{ if(typeof BB!=='undefined'&&BB.log) BB.log('music',d); }catch(e){} }
  function rmsDb(){ if(!ana) return null; const a=new Float32Array(ana.fftSize); ana.getFloatTimeDomainData(a);
    let q=0; for(let i=0;i<a.length;i++) q+=a[i]*a[i]; return 20*Math.log10(Math.sqrt(q/a.length)+1e-9); }
  function bench(){ // та же партитура на отдельном офлайн-контексте: такты 57–58 («drive» — самая плотная часть 1-го этапа)
    benchStarted=true;
    try{
      const sr=AC.sampleRate, sec=2*BAR+.5, off=new OfflineAudioContext(2,Math.ceil(sec*sr),sr);
      const keep=Object.assign({},stats), b=createSynth(off,off.destination); b.bar(57,0); b.bar(58,BAR); Object.assign(stats,keep);
      const t=performance.now();
      off.startRendering().then(()=>{ const ms=performance.now()-t; benchRes={ms:Math.round(ms), pct:Math.round(ms/10/sec)};
        tape('bench '+sec.toFixed(1)+'с→'+benchRes.ms+'мс ('+benchRes.pct+'%) '+sr+'Hz'); return benchParts(sr,sec); })
        .catch(e=>tape('bench ошибка '+String((e&&e.name)||e).slice(0,30)));
    }catch(e){ tape('bench ошибка '+String((e&&e.name)||e).slice(0,30)); }
  }
  /* 28.09.2026 (владелец: «сначала замерить реверб на лету»): выбор между «готовые части целиком» и
     «инструменты без реверба + реверб в игре» решает цена самого реверба на телефоне. Два замера тем же
     способом, что bench: bench-rev — тот же отклик 2.2 с (то же зерно mulberry(7)) на стерео-шуме;
     bench-buf — 16 готовых записей разом (цена проигрывания частей). Только замер, звук не меняется. */
  function benchParts(sr,sec){
    const run=(label,build)=>{ const off=new OfflineAudioContext(2,Math.ceil(sec*sr),sr); build(off); const t=performance.now();
      return off.startRendering().then(()=>{ const ms=performance.now()-t; tape(label+' '+sec.toFixed(1)+'с→'+Math.round(ms)+'мс ('+Math.round(ms/10/sec)+'%)'); }); };
    const noiseBuf=(off,secs)=>{ const r=mulberry(3), b=off.createBuffer(2,Math.floor(off.sampleRate*secs),off.sampleRate);
      for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<d.length;i++) d[i]=r()*2-1; } return b; };
    return run('bench-rev',off=>{ const r=mulberry(7), len=Math.floor(sr*2.2), ir=off.createBuffer(2,len,sr);
        for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<len;i++) d[i]=(r()*2-1)*Math.pow(1-i/len,3); }
        const cv=off.createConvolver(); cv.buffer=ir; const src=off.createBufferSource(); src.buffer=noiseBuf(off,sec); src.connect(cv); cv.connect(off.destination); src.start(0); })
      .then(()=>run('bench-buf',off=>{ const b=noiseBuf(off,2); for(let k=0;k<16;k++){ const s=off.createBufferSource(); s.buffer=b; s.loop=true;
        const g=off.createGain(); g.gain.value=.05; s.connect(g); g.connect(off.destination); s.start(k*.01); } }))
      .catch(e=>tape('bench-parts ошибка '+String((e&&e.name)||e).slice(0,30)));
  }
  function meter(ac){ // зовётся из tick(): копит замеры полёта и пишет одну строку через ~6 с
    const now=performance.now();
    if(theme==='menu' && !benchStarted && now-themeAt>5000) bench();
    if(theme!=='game' || !flight || flight.said) return;
    const r=rmsDb(); if(r!=null && now-themeAt>1500) flight.rms.push(r);
    if(now-flight.w0<6000) return;
    flight.said=true;
    const v=flight.rms.slice().sort((a,b)=>a-b), med=v.length?Math.round(v[v.length>>1]):'?';
    const clk=((ac.currentTime-flight.c0)/((now-flight.w0)/1000)).toFixed(2);
    let ps=''; try{ const s2=ac.playbackStats; if(s2&&s2.underrunEvents!=null) ps=' undr'+s2.underrunEvents; }catch(e){}
    tape('полёт rms'+med+'dB впереди'+(nextBar-ac.currentTime).toFixed(1)+'с clk'+clk+' lat'+Math.round(1000*(ac.baseLatency||0))+'мс'+ps);
  }
  function markTheme(){ themeAt=performance.now(); deadSaid=false;
    flight = theme==='game' && AC ? {w0:themeAt, c0:AC.currentTime, rms:[], said:false} : null; }
  const MASTER_DRIVE=1.1, MASTER_GAIN=1.0783, MASTER_RANGE=2; // выход утверждённого макета (см. ensureChain); RANGE — кривая строится на ±2
  let theme=null, ducked=false, pendingTheme=null, timer=null, nextBar=0;
  let menuBar=MENU[0], runBar=S1[0], stage=1, runStartWave=1, lastDist=0, pos=null;
  const MG_MENU=1, MG_GAME=1, // 27.09.2026: как в утверждённом макете — меню и полёт одной громкостью, шина на 1 (прижим паузы/удара — доли от неё)
        MG={menu:MG_MENU, game:MG_GAME};
  const BAR=4*60/SCORE.bpm;
  function wave(){ return (typeof S!=='undefined'&&S.mission)||1; }
  function resetRun(){ runBar=S1[0]; stage=1; runStartWave=wave(); lastDist=(typeof S!=='undefined'&&S.dist)||0; }
  function ensureChain(){
    if(MUTED||!MUSIC_ON) return null;
    const ac=audio(); if(!ac) return null;
    if(mg && mg.context!==ac){ // контекст умер и пересоздан (закрытие браузером / «тихая заморозка», core.js) — узлы старого не годятся
      try{ syn&&syn.stop(0); }catch(e){}
      mg=null; sat=null; syn=null; ana=null; theme=null; pendingTheme=null;
      if(timer){ clearInterval(timer); timer=null; }
    }
    if(!mg){
      mg=ac.createGain(); mg.gain.value=0;
      /* 27.09.2026 (владелец: «у тебя есть чёткий оригинал, который я одобрил — возьми его и ровно такой же
         помести в игру»). Выход — ровно как в утверждённом макете (fin «без тик-так», движок v2b): сумма
         голосов → tanh(1.1·x) → ×1.0783 (= 0.94 / пик после насыщения по всему 6-минутному треку, пересчитано
         тем же скриптом рендера; пересчёт совпал с утверждённым файлом до −48.5 дБ — уровень шума mp3).
         Было при вставке в игру (не утверждалось): ×4, сжатие −10 дБ 12:1, насыщение tanh(1.5·x), меню −8 дБ —
         отсюда хрип и лишние круги прослушивания. Страж 360 сверяет кривую с макетом по точкам. */
      // WaveShaper обрезает вход жёстко за ±1, а сумма голосов в макете доходит до ~1.22 (tanh там её плавно сглаживал) —
      // поэтому на вход идёт половина сигнала, а кривая построена на ±2: передаточная функция = tanh(1.1·x)·1.0783 до |x|≤2
      const pre=ac.createGain(); pre.gain.value=1/MASTER_RANGE;
      sat=ac.createWaveShaper(); { const n=4096, c=new Float32Array(n); for(let i=0;i<n;i++){ const x=(i/(n-1)*2-1)*MASTER_RANGE; c[i]=Math.tanh(MASTER_DRIVE*x)*MASTER_GAIN; } sat.curve=c; }
      mg.connect(pre); pre.connect(sat); sat.connect(audioOut(ac)); // в общую смесь (core.js) вместе со звуками игры — страж 361
      ana=ac.createAnalyser(); ana.fftSize=2048; sat.connect(ana); // измеритель: только слушает, в звук не идёт
      syn=createSynth(ac, mg);
    }
    return ac;
  }
  function nextScoreBar(){ // какой такт партитуры играть следующим
    if(theme==='menu'){ const b=menuBar; menuBar=menuBar>=MENU[1]?MENU[0]:menuBar+1; return b; }
    const d=(typeof S!=='undefined'&&S.dist)||0; if(d<lastDist-100) resetRun(); lastDist=d; // новый забег без stop() (например, «Заново» из паузы)
    if(stage===1){
      const atCycleStart=((runBar-S1[0])%8)===0;
      if(atCycleStart && runStartWave<FINALE_WAVE && wave()>=FINALE_WAVE){ stage='calm'; runBar=FIN; }
      else { const b=runBar; runBar=runBar>=S1[1]?S1LOOP:runBar+1; return b; }
    }
    if(stage==='calm'){ const b=runBar; runBar++; if(runBar>=S2[0]) stage=2; return b; }
    const b=runBar; runBar=runBar>=S2[1]?S2LOOP:runBar+1; return b;
  }
  function tick(){
    if(!theme) return;
    const hadTheme=theme, hadPending=pendingTheme; // ensureChain() при смене контекста обнуляет тему — продолжаем ту же
    const ac=ensureChain(); if(!ac||!mg) return;
    if(!theme && hadTheme){ theme=hadTheme; pendingTheme=hadPending; }
    lastTickAt=performance.now();
    if(nextBar < ac.currentTime-.3) nextBar = ac.currentTime+.05; // после сна контекста — не играем прошлое пачкой
    while(nextBar < ac.currentTime + .9){
      if(pendingTheme){ // смена темы — на границе такта, не посреди фразы
        theme=pendingTheme; pendingTheme=null; if(theme==='game') resetRun(); else menuBar=MENU[0];
        fadeTo(MG[theme]||MG_GAME,1.0); markTheme();
      }
      pos=syn.bar(nextScoreBar(), nextBar);
      nextBar+=BAR;
    }
    meter(ac);
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
      ducked=false; // v1.282.14: приглушение не переживает новый старт (иначе весь забег вполголоса)
      if(theme===th){ pendingTheme=null; if(mg) fadeTo(MG[th]||MG_GAME,.4);
        if(!deadSaid && lastTickAt && performance.now()-lastTickAt>1500){ deadSaid=true; // измеритель: тема есть, а планировщик нот молчит
          tape('такты стоят '+((performance.now()-lastTickAt)/1000).toFixed(1)+'с · '+th+' · таймер'+(timer?1:0)+' · ctx'+(mg&&mg.context===AC?'=':'≠')); }
        return; }
      if(!theme){ // ничего не играло — начинаем сразу
        theme=th; pendingTheme=null; if(th==='game') resetRun(); else menuBar=MENU[0];
        nextBar=ac.currentTime+.08; fadeTo(MG[th]||MG_GAME,1.6); markTheme();
        if(!timer) timer=setInterval(tick,200);
        tick(); return;
      }
      pendingTheme=th; // уже играет другая тема — переключимся на границе такта (приём iMUSE)
    },
    stop(fade){
      theme=null; pendingTheme=null; ducked=false;
      if(mg&&AC) fadeTo(0,fade||1.2);
      if(timer){ clearInterval(timer); timer=null; }
    },
    duck(on){ // пауза: музыка в фон, не обрываем
      if(ducked===on) return; ducked=on;
      const hadTheme=theme, hadPending=pendingTheme;
      const ac=ensureChain();
      if(!theme && hadTheme){ theme=hadTheme; pendingTheme=hadPending; }
      if(!ac||!mg||!theme) return;
      fadeTo((MG[theme]||MG_GAME)*(on?.3:1),.4);
    },
    kick(){ // удар/Сверхновая мягко прижимают музыку на 0.8с (глубина — решение 23.09.2026, не «музыка умерла»)
      const hadTheme=theme, hadPending=pendingTheme;
      const ac=ensureChain();
      if(!theme && hadTheme){ theme=hadTheme; pendingTheme=hadPending; }
      if(!ac||!mg||!theme) return;
      const base=MG[theme]||MG_GAME, now=ac.currentTime;
      mg.gain.cancelScheduledValues(now);
      mg.gain.setValueAtTime(Math.max(mg.gain.value,base*.6),now);
      mg.gain.linearRampToValueAtTime(base*.55,now+.05);
      mg.gain.linearRampToValueAtTime(base*(ducked?.3:1),now+.8);
      stats.kicks++;
    },
    sting(kind){ // кода: смерть — три ноты вниз; рекорд — фанфара
      if(MUTED||!MUSIC_ON) return;
      const ac=ensureChain(); if(!ac||!syn) return;
      syn.sting(ac.currentTime+.05,kind); stats.stings++;
    },
    /* --- для стенда --- */
    _stats:stats,
    _theme:()=>theme,
    _gain:()=>mg?mg.gain.value:null,
    _ducked:()=>ducked,
    _levels:()=>({menu:MG_MENU, game:MG_GAME}),
    _score:SCORE,
    _master:()=>({ drive:MASTER_DRIVE, gain:MASTER_GAIN, range:MASTER_RANGE, curve: sat?Array.from(sat.curve):[] }),
    _pos:()=>pos,
    _tick:()=>tick(),
    _forceNextBarDue(){ nextBar=-1; },
    _diag:()=>({ rms:rmsDb(), ahead:AC?nextBar-AC.currentTime:null, tickAge:lastTickAt?(performance.now()-lastTickAt)/1000:null, bench:benchRes })
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
    const fx=(typeof SKINS!=='undefined'&&typeof S!=='undefined'&&SKINS_BY_ID.get(S.skin)&&SKINS_BY_ID.get(S.skin).fx)||'';
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
      src.connect(flt); flt.connect(g); g.connect(audioOut(ac)); // двигатель — в общую смесь
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
