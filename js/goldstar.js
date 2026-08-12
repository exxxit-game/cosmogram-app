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
    day=S.dailyDay||todayKey();
    _seed=(hashDay(day+'·gold')^0x5bd1e995)>>>0;
    frac=.3+R()*.4; // доля коридора: середина-половина — досягаемо на любом небе, одинаково у всех
    star=null; spawned=false; caught=false; catchT=0; sparkA=[]; t0=performance.now()/1000;
    S.goldStar=false; // знак не переживает взлёт: S обновляется заплатками, и вчерашняя честь не должна просочиться в завтра
  }
  function onSky(){ return S.mode==='daily'||S.mode==='theater'; } // звезда принадлежит небу дня — и его сцене

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
    if (S.mode==='daily' && !S.dying && !caught){
      const dx=star.x-plane.x, dy=star.y-plane.y;
      if (dx*dx+dy*dy < (plane.r+star.r+10)*(plane.r+star.r+10)){
        caught=true; catchT=.8; S.goldStar=true; // знак дня твой — честь, не очки
        sparkA=[]; for(let i=0;i<12;i++) sparkA.push(Math.random()*6.283);
        burst(star.x,star.y,juicy('#ffd76a','color(display-p3 1 .86 .44)'), Q.level>=2?16:10);
        planetSpark(star.x,star.y); planetSpark(star.x+8,star.y-8); // золотые искры догоняют героя — дважды, это ведь снич
        showPopup('★', star.x, star.y, '#ffe9a8');
        sfx.coin(10); haptic('success');
        if (typeof BB!=='undefined') BB.log('goldstar','day '+day); // взлётная лента помнит миг
        star=null;
        return;
      }
    }
    if (star && star.y>H+60) star=null; // пролетела мимо — попытка одна, звезда ждёт завтра в новом месте
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
    const x=star.x+Math.sin(star.ph)*4, y=star.y, r=star.r;
    ctx.save(); ctx.globalCompositeOperation='lighter';
    if (Q.level>0 && y<H*.45){ // маяк-столбик: далёкая звезда зовёт однозначно, не путается с монетной
      const bg=ctx.createLinearGradient(0,y-130,0,y);
      bg.addColorStop(0,'rgba(255,214,120,0)');
      bg.addColorStop(1,'rgba(255,214,120,'+(.22*pulse)+')');
      ctx.fillStyle=bg; ctx.fillRect(x-2.5,y-130,5,130);
    }
    const R0=Q.level>0? r*3.4 : r*2.2;
    const g=ctx.createRadialGradient(x,y,0,x,y,R0);
    g.addColorStop(0,'rgba(255,222,130,'+(.5*pulse)+')');
    g.addColorStop(.45,'rgba(255,190,90,'+(.15*pulse)+')');
    g.addColorStop(1,'rgba(255,180,80,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,R0,0,7); ctx.fill();
    if (Q.level>0){
      ctx.strokeStyle='rgba(255,214,120,'+(.28*pulse)+')'; ctx.lineWidth=1.5; // ореол-кольцо: дыхание «я здесь»
      ctx.beginPath(); ctx.arc(x,y,r*2.1+(RM?0:3*Math.sin(tN*2.4)),0,7); ctx.stroke();
      ctx.strokeStyle='rgba(255,232,170,'+(.75*pulse)+')'; ctx.lineWidth=1.3; // лучи-иглы
      for(let i=0;i<4;i++){ const a=i*Math.PI/2+(RM?0:tN*.15), L=r*1.85;
        ctx.beginPath(); ctx.moveTo(x+Math.cos(a)*r*.75, y+Math.sin(a)*r*.75);
        ctx.lineTo(x+Math.cos(a)*L, y+Math.sin(a)*L); ctx.stroke(); }
    }
    ctx.beginPath(); // тело: пять лучей, белое сердце в золоте
    for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2? r*.45 : r;
      const px=x+Math.cos(a)*rr, py=y+Math.sin(a)*rr;
      i? ctx.lineTo(px,py) : ctx.moveTo(px,py); }
    ctx.closePath();
    if (Q.level>0){ ctx.shadowColor='rgba(255,200,90,.9)'; ctx.shadowBlur=r*1.5; }
    const cg=ctx.createRadialGradient(x,y,0,x,y,r);
    cg.addColorStop(0,'#fff7dd'); cg.addColorStop(.55,'#ffd76a'); cg.addColorStop(1,'#f0a83e');
    ctx.fillStyle=cg; ctx.fill();
    ctx.restore();
  }

  return { reset, tick, draw,
    _state:()=>({ day, frac, spawned, star:!!star,
      x:star?Math.round(star.x):-1, y:star?Math.round(star.y):-1, caught, flash:catchT>0 }),
    _poke:()=>{ S.dist=Math.max(S.dist,GOLD_DIST-LOOKAHEAD_M-2); }, // страж: пригнать миг появления
    _catch:()=>{ if(star){ plane.x=star.x; plane.y=star.y; } } };  // страж: поднести самолётик к звезде
})();
const goldReset=()=>GOLD.reset();   // мосты — как у Планетария: без try/catch, ошибки летят в самописец
const goldTick=(dt)=>GOLD.tick(dt);
const goldDraw=()=>GOLD.draw();
