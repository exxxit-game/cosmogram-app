/* v1.100.2 «Золотая звезда дня» — один снич на всё небо дня.
   Законы модуля:
   — место шьёт СВОЙ кубик из даты (mapRNG не тронут ни на бит: трасса байт-в-байт та же);
   — звезда стоит на 1800 м, в коридоре чести, в одной и той же доле коридора у всех игроков мира;
   — это квест, а не декор: видна на ВСЕХ ступенях графики (Q0 — скромно, но видна);
   — поимка даёт честь, не очки: ноль влияния на счёт, трассу и честность;
   — в театре звезда пролетает мимо, как все звёзды (закон v1.94.0). */
const GOLD=(()=>{
  const GOLD_DIST=1800;       // метр дня: глубина, где стоит звезда
  const LOOKAHEAD_M=95;       // за столько метров до неё звезда входит в небо сверху
  let _seed=0;
  function R(){ _seed=(_seed*1664525+1013904223)>>>0; return _seed/4294967296; }
  function hashDay(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

  let day='', frac=.5, spawned=false, star=null, caught=false, catchT=0, sparkA=[], t0=0;

  function reset(){ // зовёт startGame: новый взлёт — новая постановка маяка
    day=S.dailyDay||trackDayKey(); // v1.282.20: место звезды — от дня трассы, он общий для всех
    _seed=(hashDay(day+'·gold')^0x5bd1e995)>>>0;
    frac=.3+R()*.4; // доля коридора: середина-половина — досягаемо на любом небе, одинаково у всех
    star=null; spawned=false; caught=false; catchT=0; sparkA=[]; t0=performance.now()/1000;
    S.goldStar=false; // знак не переживает взлёт: S обновляется заплатками, и вчерашняя честь не должна просочиться в завтра
  }
  /* v1.284.4: Театр обслуживает две разные сцены. Спектакль дня — небо, которому звезда
     принадлежит. Повтор чужого рекорда Классики — чужой забег, не принадлежащий никакому
     дню: звезда там взошла бы над полётом, в котором её не было, и рекордсмен выглядел бы
     так, будто прошёл мимо неё. Флаг ставит ui.js на входе в сцену. Страж 126. */
  function onSky(){ if (typeof theaterRecord!=='undefined' && theaterRecord) return false;
    return S.mode==='daily'||S.mode==='theater'; } // звезда принадлежит небу дня — и его сцене

  function tick(dt){
    if (!onSky()){ star=null; spawned=false; caught=false; catchT=0; return; }
    if (catchT>0) catchT=Math.max(0,catchT-dt);
    if (!spawned && !caught && S.dist>=GOLD_DIST-LOOKAHEAD_M){
      spawned=true;
      const fw=fieldW();
      star={ x:fieldL()+fw*frac, y:-30, r:13, vy:S.speed*.95, ph:R()*6.28 };
    }
    if (!star) return;
    star.y+=star.vy*S.timeScale; star.ph+=dt*3;
    /* v1.282.13: ловим там же, где рисуем. Спрайт качается по горизонтали (sin(ph)*4),
       а поимка считалась по неподвижному star.x — у края звезды выходил и промах по
       видимой звезде, и захват по пустому месту. Качание считаем один раз за кадр и
       кладём на саму звезду, чтобы отрисовка ниже брала ту же цифру, а не свою. */
    star.sx = star.x + Math.sin(star.ph)*4;
    if (S.mode==='daily' && !S.dying && !caught){
      const dx=star.sx-plane.x, dy=star.y-plane.y;
      if (dx*dx+dy*dy < (plane.r+star.r+10)*(plane.r+star.r+10)){
        caught=true; catchT=.8; S.goldStar=true; // знак дня твой — честь, не очки
        sparkA=[]; for(let i=0;i<12;i++) sparkA.push(Math.random()*6.283);
        burst(star.sx,star.y,juicy('#ffd76a','color(display-p3 1 .86 .44)'), Q.level>=2?16:10); // v1.282.13: салют там же, где звезда видна
        planetSpark(star.sx,star.y); planetSpark(star.sx+8,star.y-8); // золотые искры догоняют героя — дважды, это ведь снич
        showPopup('★', star.sx, star.y, '#ffe9a8');
        sfx.coin(10); haptic('success');
        if (typeof BB!=='undefined') BB.log('goldstar','day '+day); // взлётная лента помнит миг
        star=null;
        return;
      }
    }
    if (star && star.y>H+60) star=null; // пролетела мимо — попытка одна, звезда ждёт завтра в новом месте
  }

  /* Кэши золотой звезды: ключ — только округлённый радиус, остальное постоянно. */
  const gsG={}, gsRingC={}, gsNeedC={};
  function gsGrad(k){
    let g=gsG[k];
    if(!g){
      if(k==='beam'){ g=ctx.createLinearGradient(0,-130,0,0);
        g.addColorStop(0,'rgba(255,214,120,0)'); g.addColorStop(1,'rgba(255,214,120,.22)'); }
      else if(k.slice(0,4)==='aura'){ const R=(+k.slice(4))||1; g=ctx.createRadialGradient(0,0,0,0,0,R);
        g.addColorStop(0,'rgba(255,222,130,.5)'); g.addColorStop(.45,'rgba(255,190,90,.15)'); g.addColorStop(1,'rgba(255,180,80,0)'); }
      else { const R=(+k.slice(4))||1; g=ctx.createRadialGradient(0,0,0,0,0,R);
        g.addColorStop(0,'#fff7dd'); g.addColorStop(.55,'#ffd76a'); g.addColorStop(1,'#f0a83e'); }
      gsG[k]=g;
    }
    return g;
  }
  function gsRing(a){ const q=Math.round(a*40); return gsRingC[q]||(gsRingC[q]='rgba(255,214,120,'+(q/40).toFixed(3)+')'); }
  function gsNeedle(a){ const q=Math.round(a*40); return gsNeedC[q]||(gsNeedC[q]='rgba(255,232,170,'+(q/40).toFixed(3)+')'); }

  /* 24.08.2026 «Свечение — не расходник»: ctx.shadowBlur пересчитывался браузером В КАЖДОМ
     кадре, пока звезда дня в небе — прямое нарушение абсолютного запрета проекта (тень
     разрешена только в предрендеренных спрайтах). Объект здесь один, не поток из десятков
     камней — но правило абсолютное по принципу, не по объёму: тень остаётся тенью, даже
     если объект один. Тот же приём кэширования, что уже применён к gsGrad/staGrad в этом
     же файле — только вместо одного градиента кэшируется вся звезда целиком, со свечением,
     уже запечённым внутрь. Тень считается ОДИН РАЗ при рождении спрайта; дальше — только
     drawImage(). Радиус звезды на деле всегда 13 (star.r в reset() — константа), но кэш
     всё равно ключуется по r, как и gsGrad — тот же приём на случай, если радиус когда-нибудь
     станет переменным. */
  const gsCoreC={};
  function gsCoreSprite(r){
    const key=Math.round(r);
    let c=gsCoreC[key];
    if(!c){
      const blur=r*1.5, pad=Math.ceil(r+blur*2.2), size=pad*2; // запас под мягкий край тени, не только под тело звезды
      c=document.createElement('canvas'); c.width=c.height=size;
      const x=ctx2d(c);
      x.translate(pad,pad);
      x.beginPath();
      for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2? r*.45 : r;
        const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
        i? x.lineTo(px,py) : x.moveTo(px,py); }
      x.closePath();
      x.shadowColor='rgba(255,200,90,.9)'; x.shadowBlur=blur;
      x.fillStyle=gsGrad('core'+key); x.fill();
      gsCoreC[key]=c;
    }
    return c;
  }
  function draw(){
    const tN=performance.now()/1000-t0;
    const pulse=RM? .85 : .75+.25*Math.sin(tN*2.4);
    if (catchT>0){ // вспышка поимки: свет, кольцо, золотые иглы
      const k=1-catchT/.8, fade=1-k, cx=plane.x, cy=plane.y-6;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,150+60*k);
      g.addColorStop(0,'rgba(255,240,190,'+(.8*fade)+')');
      g.addColorStop(.4,'rgba(255,210,110,'+(.35*fade)+')');
      g.addColorStop(1,'rgba(255,180,80,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,210,0,7); ctx.fill();
      ctx.strokeStyle='rgba(255,224,150,'+(.7*fade)+')'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,cy,20+90*k,0,7); ctx.stroke();
      ctx.strokeStyle='rgba(255,220,140,'+(.9*fade)+')';
      for(const a of sparkA){ const d=40+130*k;
        ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*d*.6, cy+Math.sin(a)*d*.6);
        ctx.lineTo(cx+Math.cos(a)*d, cy+Math.sin(a)*d); ctx.stroke(); }
      ctx.restore();
    }
    if (!star) return;
    const x=(star.sx!=null?star.sx:star.x+Math.sin(star.ph)*4), y=star.y, r=star.r; // v1.282.13: одна цифра качания на отрисовку и на поимку
    /* v1.282.21: три градиента звезды создавались заново в КАЖДОМ кадре — до 240 объектов в
       секунду, пока она в небе. Мешали две вещи: координаты (звезда качается) и дыхание альфы.
       Обе снимаются без потери картинки: рисуем в местных координатах через translate, а дыхание
       отдаём globalAlpha — все стопы и так множились на pulse ЦЕЛИКОМ, значит вынести множитель
       наружу это тождественная замена, пиксель в пиксель. Строки цвета кольца и игл квантуются
       по альфе тем же приёмом, что уже принят для морзянки. */
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.translate(x,y);
    if (Q.level>0 && y<H*.45){ // маяк-столбик: далёкая звезда зовёт однозначно, не путается с монетной
      ctx.globalAlpha=pulse;
      ctx.fillStyle=gsGrad('beam'); ctx.fillRect(-2.5,-130,5,130);
      ctx.globalAlpha=1;
    }
    const R0=Q.level>0? r*3.4 : r*2.2;
    ctx.globalAlpha=pulse;
    ctx.fillStyle=gsGrad('aura'+Math.round(R0)); ctx.beginPath(); ctx.arc(0,0,R0,0,7); ctx.fill();
    ctx.globalAlpha=1;
    if (Q.level>0){
      ctx.strokeStyle=gsRing(.28*pulse); ctx.lineWidth=1.5; // ореол-кольцо: дыхание «я здесь»
      ctx.beginPath(); ctx.arc(0,0,r*2.1+(RM?0:3*Math.sin(tN*2.4)),0,7); ctx.stroke();
      ctx.strokeStyle=gsNeedle(.75*pulse); ctx.lineWidth=1.3; // лучи-иглы
      for(let i=0;i<4;i++){ const a=i*Math.PI/2+(RM?0:tN*.15), L=r*1.85;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.75, Math.sin(a)*r*.75);
        ctx.lineTo(Math.cos(a)*L, Math.sin(a)*L); ctx.stroke(); }
    }
    if (Q.level>0){ // тело со свечением — готовый спрайт, тень уже запечена внутрь
      const spr=gsCoreSprite(r), half=spr.width/2;
      ctx.drawImage(spr, -half, -half, spr.width, spr.width);
    } else { // Q0: тот же прежний путь — тело без тени, дёшево, без изменений
      ctx.beginPath(); // тело: пять лучей, белое сердце в золоте
      for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2? r*.45 : r;
        const px=Math.cos(a)*rr, py=Math.sin(a)*rr;
        i? ctx.lineTo(px,py) : ctx.moveTo(px,py); }
      ctx.closePath();
      ctx.fillStyle=gsGrad('core'+Math.round(r)); ctx.fill();
    }
    ctx.restore();
  }

  /* v1.282.23 «Звезда дня переживает восстановление холста» (партия 27): та же беда, что
     у станции (см. planetarium.js) — gsG кэширует градиенты «один раз навсегда», а
     gfxInvalidate() про него не знал. После потери GPU-контекста звезда дня рисовалась бы
     мёртвыми градиентами до перезагрузки страницы. */
  function gfxReset(){ for(const k in gsG) delete gsG[k]; for(const k in gsCoreC) delete gsCoreC[k]; }
  return { reset, tick, draw,
    _state:()=>({ day, frac, spawned, star:!!star,
      x:star?Math.round(star.x):-1, y:star?Math.round(star.y):-1, caught, flash:catchT>0 }),
    _poke:()=>{ S.dist=Math.max(S.dist,GOLD_DIST-LOOKAHEAD_M-2); }, // страж: пригнать миг появления
    _catch:()=>{ if(star){ plane.x=star.x; plane.y=star.y; } },  // страж: поднести самолётик к звезде
    _gradCount:()=>Object.keys(gsG).length, _spriteCount:()=>Object.keys(gsCoreC).length, _gfxReset:gfxReset };
})();
const goldReset=()=>GOLD.reset();   // мосты — как у Планетария: без try/catch, ошибки летят в самописец
const goldTick=(dt)=>GOLD.tick(dt);
const goldDraw=()=>GOLD.draw();
