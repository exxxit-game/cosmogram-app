'use strict';
/* 13.09.2026 «Ворота финиша» — владелец, пункт 5 из собранных багов: долёт до цели («Длина»/
   Слалом/Биатлон/Эстафета) обрывался резко, без ощущения финиша — startDying() (крен, падение,
   дым) честно взят из СМЕРТИ и один на все исходы, победу от гибели отличал только текст
   ПОСЛЕ, на экране итогов. Разобрано с владельцем через 15+ живых макетов (снятые по пути:
   «лента» — буквальная реализация вместо метафоры; «точка»-маяк — теряется на фоне звёзд;
   метеоритный рой — читается как препятствие, от которого уворачиваются, не как цель; стены
   коридора — не существуют на телефоне, DOM #corrEdge живёт только на широких экранах).
   Одобрено явным «да»: арка растёт по мере приближения (видна заранее — «разбился рядом, но
   видел, что почти долетел»), на пересечении сама арка разлетается цветным салютом (набор
   confetti() — тот же язык, что уже читается как победа при рекорде, не третий отдельный).

   Законы модуля — тот же приём, что у goldstar.js (свой self-contained IIFE, мосты finishX):
   — LEAD_M метров до цели арка входит в поле зрения (владелец выбрал явно, 13.09.2026);
   — у целей БЕЗ честного «оставшегося расстояния» (Спидран — по очкам, Caravan — по времени)
     remain остаётся null — арки заранее не бывает, салют идёт прямо на месте корабля в момент
     победы, ровно как раньше делал startDying(), только не смерть;
   — игра ничего не знает о частицах отсюда: finishSetRemain(m) — кормить честным расстоянием
     каждый кадр (или null), finishTrigger() — вместо startDying() в момент победы;
   — сам модуль ничего не знает о режимах — не модальный монолит, а чистая функция состояния. */
const FINISH=(()=>{
  const LEAD_M=300; // 13.09.2026, владелец: за сколько метров до финиша арка входит в поле зрения
  const COLS=['255,215,106','168,200,255','255,159,176','143,255,159']; // 04.09.2026 confetti() — тот же набор 4 цветов, что уже победа/рекорд
  let remain=null, active=false, shockA=0, shards=[], textAge=0, flashAge=0, flashX=0, flashY=0, flashDurCur=.6;
  const TEXT_LIFE=1.1; // 19.09.2026 «Космо финиш»: чуть дольше самого занавеса (.9с), чтобы надпись не срезало сменой экрана

  function reset(){ remain=null; active=false; shockA=0; shards=[]; textAge=0; flashAge=0; } // зовёт startGame: новый взлёт — чистый лист
  function setRemain(m){ if(!active) remain=(m==null)?null:Math.max(0,m); }

  function farY(){ return fieldT()+fieldH()*.16; } // высоко над рабочей зоной корабля — «далеко впереди»
  function gateY(prox){ const fy=farY(); return fy+(plane.y-6-fy)*prox; } // к prox=1 арка стоит ровно там, где корабль — салют не «прыгнет» в сторону
  function gateArcPoint(u,prox){
    const fl=fieldL(), fw=fieldW(), x=fl+14+(fw-28)*u, arcH=22;
    return { x, y: gateY(prox) - Math.sin(Math.PI*u)*arcH*.55 + arcH*.5 };
  }

  function trigger(){ // вместо startDying() в момент победы — арка (если была) разлетается на месте корабля
    active=true; shockA=1; shards=[]; textAge=0.0001; // 19.09.2026 «Космо финиш»: >0, не 0 — tick() ниже проверяет textAge>0, чтобы новый reset() (0) сразу гасил старую надпись
    // 19.09.2026 «Вспышка на финише» (владелец, явное «да»): та же вспышка, что уже украшает
    // старт (js/render.js: drawFlashBurst/FLASH_SCALE, тот же тюнинг-слот S.launchFx, тот же
    // цвет борта) — не второй отдельный эффект, ОДИН источник, два момента показа. Один разовый
    // всплеск (владелец сам выбрал: «на старте — одна вспышка», финиш — тоже один, не зацикленно,
    // чтобы не соперничать с уже занятым кадром — салют+кольцо+надпись). flashDur(price) — та
    // же формула «подороже — подольше», что уже у старта, не новое правило.
    flashAge=0.0001; flashX=plane.x; flashY=plane.y-6;
    const flFin=(typeof S!=='undefined' && S.launchFx && typeof FLASHES_BY_ID!=='undefined') ? FLASHES_BY_ID.get(S.launchFx) : null;
    flashDurCur=(flFin && typeof flashDur==='function') ? flashDur(flFin.price) : .6;
    const prox=1, cx=plane.x, cy=plane.y-6, N=12; // 19.09.2026: было 26 — см. комментарий у draw() выше, вспышка теперь главная, конфетти — фон под ней — см. комментарий у draw() выше, вспышка теперь главная, конфетти — фон под ней
    for(let i=0;i<N;i++){
      const u=i/(N-1), p=remain!=null? gateArcPoint(u,prox) : {x:cx+(Math.random()-.5)*40,y:cy+(Math.random()-.5)*14};
      const ang=Math.atan2(p.y-cy,p.x-cx)+((Math.random()-.5)*.7), sp=1.7+Math.random()*3.0, flake=Math.random()<.5;
      shards.push({x:p.x,y:p.y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp-.7,
        life:.6+Math.random()*.55,age:0,size:flake?(2.4+Math.random()*2.2):(1.6+Math.random()*1.6),
        rot:Math.random()*6.283,vr:(Math.random()-.5)*9,flake,col:COLS[(Math.random()*4)|0]});
    }
    remain=null;
  }

  function tick(dt){
    if(textAge>0) textAge=Math.min(TEXT_LIFE, textAge+dt); // 19.09.2026 «Космо финиш»: своя жизнь, не завязана на active/shards — переживает их угасание
    if(flashAge>0) flashAge=Math.min(flashDurCur, flashAge+dt); // 19.09.2026 «Вспышка на финише»: тоже своя жизнь, отдельная от confetti/shockA
    if(!active) return;
    for(let i=shards.length-1;i>=0;i--){ const s=shards[i]; s.age+=dt;
      if(s.age>s.life){ shards.splice(i,1); continue; }
      s.x+=s.vx*dt*30; s.y+=s.vy*dt*30; s.vy+=dt*.7; s.rot+=s.vr*dt; }
    if(shockA>0) shockA=Math.max(0,shockA-dt*1.3);
    if(!active) return;
    if(!shards.length && shockA<=0) active=false; // всё погасло — модулю больше нечего делать
  }

  function draw(){
    if(remain!=null && remain<LEAD_M && !active){
      const prox=Math.pow(1-remain/LEAD_M,3), glowA=.14+.6*prox, lw=1.1+3.2*prox;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.shadowColor='rgba(255,215,106,'+Math.min(1,glowA+.2)+')'; ctx.shadowBlur=5+18*prox;
      const c0=gateArcPoint(0,prox), c1=gateArcPoint(1,prox);
      const g=ctx.createLinearGradient(c0.x,0,c1.x,0);
      g.addColorStop(0,'rgba(255,215,106,'+(glowA*.1)+')'); g.addColorStop(.5,'rgba(255,236,180,'+glowA+')'); g.addColorStop(1,'rgba(255,215,106,'+(glowA*.1)+')');
      ctx.strokeStyle=g; ctx.lineWidth=lw;
      ctx.beginPath();
      for(let i=0;i<=28;i++){ const p=gateArcPoint(i/28,prox); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }
      ctx.stroke();
      ctx.restore();
    }
    /* 19.09.2026: было `if(!active) return;` здесь — гасило и надпись, и (теперь) вспышку
       ВМЕСТЕ с салютом/кольцом, хотя у каждой уже своя, отдельная продолжительность жизни
       (textAge/flashAge). Скрытый риск: как только шарды+кольцо гаснут (active=false, чуть
       больше секунды), надпись/вспышка обрывались бы посреди своей анимации, если бы их
       собственный срок ещё не истёк. Теперь `if(active)` оборачивает ТОЛЬКО то, что реально
       зависит от active (кольцо+шарды) — надпись и вспышка ниже рисуются по своим таймерам,
       без оглядки на это поле. */
    if(active){
      /* 13.09.2026 (владелец, живой замер пикселей канваса: «просил цветной салют, вижу просто
         белый») — было И тонкое цветное кольцо ударной волны, И заливка ВСЕГО экрана тёплым
         белым (fillRect на весь canvas) поверх — обе они непрозрачные и крупные, сами осколки
         (1.6-4.6px) рядом с ними физически терялись. Первая правка (два кольца, gold+blue) не
         помогла — 'lighter' складывает две ЯРКИЕ полупрозрачные краски В ТОЙ ЖЕ точке в светлый,
         почти белый оттенок (это свойство аддитивного смешения, не баг конкретных чисел). Кольцо
         теперь ОДНО, приглушённое (пик .28, не .5) — маленький сдержанный акцент под настоящим
         героем сцены, самими цветными осколками, а не второй источник белого рядом с первым.
         19.09.2026, вторым заходом (владелец: «вспышки продаются в магазине, направь туда» —
         теперь, когда есть настоящая, персональная вспышка (ниже), общий безликий салют — уже
         не главный герой сцены, а фон под ней): осколков было 26, теперь 12 — вспышка не тонет
         в конфетти, но «праздник» ещё читается, не голая точка. Число см. у trigger(). */
      if(shockA>0){
        const cy=plane.y-6, r=(1-shockA)*160;
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='rgba('+COLS[0]+','+(shockA*.28)+')'; ctx.lineWidth=1.6*shockA+.4;
        ctx.beginPath(); ctx.arc(plane.x,cy,r,0,6.283); ctx.stroke();
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation='lighter';
      for(const s of shards){ const a=1-s.age/s.life; if(a<=0) continue;
        if(s.flake){ ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.rot);
          ctx.fillStyle='rgba('+s.col+','+a.toFixed(2)+')'; ctx.fillRect(-s.size*1.5,-s.size*.6,s.size*3,s.size*1.2); ctx.restore();
        } else {
          ctx.strokeStyle='rgba('+s.col+','+a.toFixed(2)+')'; ctx.lineWidth=s.size*1.1; ctx.lineCap='round';
          ctx.beginPath(); ctx.moveTo(s.x-s.vx*.4,s.y-s.vy*.4); ctx.lineTo(s.x,s.y); ctx.stroke();
          ctx.fillStyle='rgba('+s.col+','+Math.min(1,a*1.3).toFixed(2)+')';
          ctx.beginPath(); ctx.arc(s.x,s.y,s.size*.6,0,6.283); ctx.fill();
        }
      }
      ctx.restore();
    }
    /* 19.09.2026 «Вспышка на финише» (владелец, явное «да» на макет
       vspyshka-uvelichenie-19-09-2026.html): та же самая вспышка, что уже на старте —
       drawFlashBurst (js/render.js), тот же тюнинг-слот S.launchFx, та же ×~1.92 формула
       (FLASH_SCALE), не второй отдельный эффект. Нет вспышки (S.launchFx=0/'none') — просто
       не рисуется, конфетти/текст остаются достаточным подтверждением победы сами по себе. */
    if(flashAge>0 && flashAge<flashDurCur && typeof drawFlashBurst==='function' && typeof S!=='undefined' && S.launchFx && typeof FLASHES_BY_ID!=='undefined'){
      const fl=FLASHES_BY_ID.get(S.launchFx);
      if(fl && fl.style!=='none'){
        const skin=(typeof SKINS_BY_ID!=='undefined'&&typeof S!=='undefined')?(SKINS_BY_ID.get(S.skin)||SKINS[0]):null;
        if(skin){
          const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
          const col=a=>base+Math.max(0,a).toFixed(2)+')';
          drawFlashBurst(flashX,flashY,fl.style,flashAge/flashDurCur,col,base);
        }
      }
    }
    /* 19.09.2026 «Космо финиш», ВТОРЫМ заходом (владелец, живой скрин: «надпись на общественном
       туалете», «внизу», «не чувствуется как победа»). Первая попытка ошиблась дважды:
       (1) шрифт Exo 2 + мягкое additive-свечение без тёмной обводки — тускло, теряется на любом
       фоне неба (владелец УЖЕ отклонял Exo2 именно для всплывающего текста этого типа, см.
       комментарий у popups в render.js:2901-2906 — «Впритык»/«Ворота» и т.п., «читаемость на
       любом фоне» тёмной обводкой, системный шрифт, решение владельца, не Exo2);
       (2) координата «выше корабля на 46px» — у корабля разная высота на экране (у поля игры
       нижняя половина шире, там же обычно и летает), надпись то и дело утыкалась в самый низ.
       Фикс — тот же приём, что уже держит все игровые попапы (render.js): тёмная обводка
       (strokeText) под яркой золотой заливкой + halo-дубль покрупнее полупрозрачный сзади,
       системный шрифт. Позиция — фиксированная точка в верхней трети игрового поля (не завязана
       на текущий Y корабля), крупнее (22→30px), с интервалом между буквами (вручную посимвольно —
       ctx.letterSpacing не везде поддержан в WebView Telegram, надёжнее не полагаться на него). */
    if(textAge>0 && textAge<TEXT_LIFE){
      const grow=Math.min(1,textAge/.18), fadeOut=textAge>TEXT_LIFE-.3 ? Math.max(0,(TEXT_LIFE-textAge)/.3) : 1;
      const scale=grow<1 ? .7+.36*grow-.06*Math.sin(grow*Math.PI) : 1; // лёгкий перехлёст на подходе, без пружины на глаз
      const a=Math.min(1,grow*1.4)*fadeOut;
      if(a>0.01){
        const txt=(typeof L!=='undefined' && L.finishText) || 'КОСМО ФИНИШ';
        const tx=plane.x, ty=fieldT()+fieldH()*.30; // фиксированная точка верхней трети поля — не «над кораблём», корабль сам может стоять где угодно по высоте
        ctx.save();
        ctx.translate(tx,ty); ctx.scale(scale,scale);
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='800 30px -apple-system,"Segoe UI",Roboto,sans-serif';
        // посимвольный интервал (надёжнее letterSpacing в WebView) — считаем общую ширину, рисуем от левого края к центру
        const sp=3, chars=txt.split(''), widths=chars.map(c=>ctx.measureText(c).width);
        const total=widths.reduce((a,b)=>a+b,0)+sp*(chars.length-1);
        let cx=-total/2;
        ctx.globalAlpha=a*.3; ctx.fillStyle='#ffd76a'; ctx.save(); ctx.scale(1.16,1.16); ctx.fillText(txt,0,0); ctx.restore(); // halo — тот же приём, что у popups (render.js:2912-2913)
        ctx.globalAlpha=a; ctx.textAlign='left';
        ctx.lineWidth=3; ctx.lineJoin='round'; ctx.strokeStyle='rgba(10,14,28,.65)';
        ctx.fillStyle='#ffd76a';
        for(let i=0;i<chars.length;i++){ const w=widths[i], x=cx+w/2;
          ctx.strokeText(chars[i],x-w/2,0); ctx.fillText(chars[i],x-w/2,0); cx+=w+sp; }
        ctx.restore();
      }
    }
  }

  return { reset, setRemain, trigger, tick, draw,
    _state:()=>({active,remain,shardsN:shards.length,shockA,textAge}),
    _poke:(m)=>{ remain=m; } }; // страж: задать remain напрямую, без честного расстояния из S.dist
})();
const finishReset=()=>FINISH.reset();
const finishSetRemain=(m)=>FINISH.setRemain(m);
const finishTrigger=()=>FINISH.trigger();
const finishTick=(dt)=>FINISH.tick(dt);
const finishDraw=()=>FINISH.draw();
