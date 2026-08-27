/* ============================================================
   ПЛАНЕТАРИЙ (v1.100.0): десять кистей живого неба.
   Модуль: вся логика здесь, ядро получает по одной строке-вызову.
   Законы модуля:
   — свой LCG, mapRNG не трогаем: от него зависит честность сида;
   — декорация никогда не мешает читать камни;
   — Q0 молчит, Q1 получает запечённое, Q2+ — живое;
   — RM (бережное небо): всполохи приглушены.
   ============================================================ */
const PLANET=(()=>{
  let _seed=(Date.now()^0x9e3779b9)>>>0;
  const R=()=>{ _seed=(_seed*1664525+1013904223)>>>0; return _seed/4294967296; };

  /* ---------- дальний план: метеор, маяк, станция ---------- */
  let metT=8+R()*10, met=null;        // метеор: следующий через 8-18 секунд полёта
  let staT=70+R()*60, sta=null;       // станция: редкая гостья
  let mile=0, mileT=0;                // отметины пути: последняя тысяча, таймер всполоха
  // v1.105.0 «Свет и дым»: созвездие-самолётик ушло на полку идей навсегда (суд глаза:
  // подпись неба читалась как грязь); «бегущая кромка» на камнях снята вместе с ним

  /* кисть скруглённых форм — мир не бывает прямоугольной наклейкой (v1.105.0) */
  function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
    x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }

  function sky(tN){
    // 26.08.2026: маяк (v1.280.0, пульсирующая точка правее жизней) снят целиком по
    // прямой просьбе владельца — «в игре нам не нужен этот маяк». Раньше он же мигал
    // настоящими часами браузера на паузе (KNOWN-BUGS.md, «мигающая точка около
    // жизней»), но это была не причина убрать декорацию, а отдельный, уже починенный
    // баг таймера — здесь удаление по вкусу, а не по ошибке.
    if(Q.level===0) return;
    const dt=Math.min(.05, tN-(sky._p||tN)); sky._p=tN; // честные секунды кадра
    const inGame=S.running&&!S.paused;
    if(!inGame){ mileT=0; return; }

    // отметина пути: каждая тысяча метров — всполох над горизонтом
    const km=Math.floor(S.dist/1000);
    if(km>mile){ mile=km; mileT=1; }
    if(mileT>0){
      mileT-=dt; // тающий таймер
      const a=mileT*(typeof RM!=='undefined'&&RM?.10:.22);
      if(a>0){ ctx.globalAlpha=a;
        ctx.drawImage(powGlow('#ffe9b8'), W*.5-W*.7, -H*.12, W*1.4, H*.3);
        ctx.globalAlpha=1; }
    }

    // метеор: раз в 18-40 секунд — полоса света через верх неба
    metT-=dt;
    if(metT<=0&&!met){
      const x0=W*(.15+R()*.7), y0=H*(.04+R()*.1);
      met={x:x0,y:y0,vx:(R()<.5?-1:1)*(5+R()*3),vy:3.4+R()*1.6,life:1};
      metT=18+R()*22;
    }
    if(met){
      met.x+=met.vx*dt*60; met.y+=met.vy*dt*60; met.life-=dt*1.2;
      if(met.life<=0||met.y>H*.6) met=null;
      else{
        const a=Math.min(1,met.life*2)*.8;
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=a*.5;
        ctx.drawImage(powGlow('#dcecff'), met.x-12, met.y-12, 24, 24);
        ctx.strokeStyle='rgba(220,238,255,'+(a*.8).toFixed(3)+')';
        ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(met.x,met.y);
        ctx.lineTo(met.x-met.vx*7, met.y-met.vy*7); ctx.stroke();
        ctx.restore(); ctx.globalAlpha=1;
      }
    }

    // станция: редкая гостья глубины (только богатое небо)
    if(Q.level>=2){
      staT-=dt;
      if(staT<=0&&!sta){
        sta={x:R()<.5?-80:W+80, y:H*(.1+R()*.14), vx:.45};
        if(sta.x<0) sta.vx=Math.abs(sta.vx); else sta.vx=-Math.abs(sta.vx);
        staT=45+R()*35; // v1.284.22: и повтор соразмерен забегу, а не сессии
      }
      if(sta){
        sta.x+=sta.vx*dt*60;
        if(sta.x<-110||sta.x>W+110) sta=null;
        else{
          ctx.save(); ctx.translate(sta.x,sta.y);
          // v1.105.0 «Свет и дым»: та же Т-форма и тот же размер, но силуэт в свете —
          // ореол глубины, объёмный корпус, стальные панели, тёплые иллюминаторы
          ctx.globalAlpha=.30; ctx.drawImage(powGlow('#6f93cf'),-70,-56,140,112);
          ctx.globalAlpha=.42;
          // корпус: объёмный градиент (свет сверху, тень снизу)
          ctx.fillStyle=staGrad('hull'); rr(ctx,-14,-9,28,18,4); ctx.fill();
          // ферма
          ctx.fillStyle=staGrad('mast'); rr(ctx,-2,-22,4,44,2); ctx.fill();
          // панели: холодная сталь с кромкой света только сверху — никаких рамок
          for(const p of STA_PANELS){
            ctx.fillStyle=staGrad('pan'+p[1]);
            rr(ctx,p[0],p[1],p[2],p[3],2.5); ctx.fill();
            ctx.strokeStyle='rgba(170,205,250,.35)'; ctx.lineWidth=1;
            ctx.beginPath(); ctx.moveTo(p[0]+2,p[1]+.5); ctx.lineTo(p[0]+p[2]-2,p[1]+.5); ctx.stroke();
          }
          // купол стыковочного узла
          ctx.fillStyle='#31497a'; ctx.beginPath(); ctx.arc(0,-9,4.5,Math.PI,0); ctx.fill();
          // иллюминаторы: тёплые светящиеся точки
          for(const px of [-8,-1,6]){
            ctx.drawImage(powGlow('#ffd9a0'),px-4,-9,8,8);
            ctx.fillStyle='rgba(255,236,190,.95)'; ctx.beginPath(); ctx.arc(px+1.5,-3,1.4,0,6.283); ctx.fill();
          }
          if(Math.sin(tN*3.57)>0){             // бортовой огонь мигает и светится
            ctx.drawImage(powGlow('#ff7a6a'),38,-20,16,16);
            ctx.fillStyle='rgba(255,120,100,.95)'; ctx.beginPath(); ctx.arc(47.5,-10.5,1.6,0,6.283); ctx.fill(); }
          ctx.restore(); ctx.globalAlpha=1;
        }
      }
    }
  }

  /* ---------- камни: тональность (реальные типы астероидов) ---------- */
  /* 27.08.2026: владелец вспомнил тёплый коричневый тон и попросил взять реальные цвета
     похожих космических тел, а не рисовать на глаз. По данным (см. AI-DECISION-REGISTRY.md
     или KNOWN-BUGS.md — источники поиска 27.08.2026): C-тип астероидов (~75% всех, самый
     частый) — тёмно-серые, пепельные, с лёгким холодным/синеватым оттенком (альбедо .03-.09,
     реальные снимки Bennu/Ryugu их так и описывают — «craggy, ashen gray»). S-тип
     (силикатный) и M-тип (металлический) заметно теплее — красновато-коричневые, из-за
     железо-магниевых силикатов и никель-железа. Пять тонов ниже — 2 холодных (C-тип,
     обычный и потемневший от космического выветривания) и 3 тёплых (S-тип, M-тип,
     базальтовый) — та же светлота, что была у старой палитры («лёд» была наименее
     реалистичной меткой — астероиды в основном не ледяные, это скорее для комет). */
  function rockTint(o){
    if(o._tint) return o._tint;
    const h=(o.r*7+((o.rot||0)*13))|0;
    if(o.kind==='drift'){
      o._tint=['#7d6f8f','#75688c','#847394'][h%3<0?-h%3:h%3];
    }else{
      const v=['#6b7484','#5f6672','#8a7360','#786a5c','#6e6355'][((h%5)+5)%5]; // C-тип / C-тип тёмный / S-тип / M-тип / базальт
      o._tint=v;
    }
    return o._tint;
  }

  /* ---------- самолётик: крыло сверкает при крене, искры летят к герою ---------- */
  /* v1.282.21 «Станция не печёт градиенты каждый кадр».
     Партия 11 закрыла обломки, спутники и значки бонусов в render.js — а этот модуль остался
     в стороне. Станция создавала ШЕСТЬ CanvasGradient в каждом кадре (корпус, ферма, четыре
     панели) плюс литерал массива панелей: 360 объектов в секунду всё время, пока она ползёт
     по экрану, и каждый со своим разбором цветов. При этом вся геометрия здесь ПОСТОЯННАЯ —
     рисуется в местных координатах после translate. Значит кэш даже без ключа по размеру:
     один раз навсегда. */
  const STA_PANELS=[[-48,-15,30,10],[18,-15,30,10],[-44,7,22,8],[22,7,22,8]];
  const staG={};
  function staGrad(k){
    let g=staG[k];
    if(!g){
      if(k==='hull'){ g=ctx.createLinearGradient(0,-9,0,9);
        g.addColorStop(0,'#2a3d66'); g.addColorStop(.5,'#1a2947'); g.addColorStop(1,'#101b33'); }
      else if(k==='mast'){ g=ctx.createLinearGradient(0,-22,0,22);
        g.addColorStop(0,'#24385f'); g.addColorStop(1,'#14213c'); }
      else { const y=+k.slice(3); g=ctx.createLinearGradient(0,y,0,y+(y<0?10:8));
        g.addColorStop(0,'#3d5a8f'); g.addColorStop(1,'#22365e'); }
      staG[k]=g;
    }
    return g;
  }
  let _bank=0, flash=null;
  const sparks=[]; // {x,y,vx,vy,life}
  function spark(x,y){ // крюк из collectStar: золото догоняет самолётик
    for(let i=0;i<3;i++) sparks.push({x:x+(R()-.5)*10, y:y+(R()-.5)*10, life:1});
  }
  function planeFx(tN){
    // v1.280.0 «Утечка на дне»: planetSpark() кладёт искры в sparks[] БЕЗ проверки уровня графики
    // при каждом сборе золотой звезды (game.js) — а это единственное место, что их вычищает.
    // При Q0 функция раньше выходила сразу же: массив рос без предела через все сессии подряд
    // (нигде больше не сбрасывается), именно на самых слабых устройствах. Сами искры дёшевы
    // (маленький drawImage, ~1с жизни, максимум пара штук разом) — правильный фикс это не «выключить
    // подешевле», а вообще не иметь такой утечки; заодно Q0 получает искры как честный бонус.
    const dt=Math.min(.05, tN-(planeFx._p||tN)); planeFx._p=tN;
    if(S.running&&!S.paused){
      // вспышка крыла: резкий крен — солнце сверкнуло
      if(Q.level>=2){
        const d=plane.bank-_bank;
        if(Math.abs(d)>.55&&!flash){
          const s=plane.bank>0?1:-1;
          flash={x:plane.x+s*13, y:plane.y-4, life:1};
        }
      }
      _bank=plane.bank;
    }
    if(flash){
      flash.life-=dt*3.2;
      if(flash.life<=0) flash=null;
      else{
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=flash.life*.8;
        ctx.drawImage(starDot('w'), flash.x-7, flash.y-7, 14, 14);
        ctx.restore(); ctx.globalAlpha=1;
      }
    }
    // искры звезды: летят к самолётику и гаснут у цели
    for(let i=sparks.length-1;i>=0;i--){
      const s=sparks[i];
      const dx=plane.x-s.x, dy=plane.y-s.y, d=Math.hypot(dx,dy)||1;
      const sp=7+(1-s.life)*9; // разгоняются по пути
      s.x+=dx/d*sp; s.y+=dy/d*sp; s.life-=dt*1.1;
      if(d<18||s.life<=0){ sparks.splice(i,1); continue; }
      if(s.x<-20||s.x>W+20||s.y<-20||s.y>H+20) continue;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=Math.min(1,s.life*2)*.85;
      ctx.drawImage(starGlow(), s.x-9, s.y-9, 18, 18);
      ctx.restore(); ctx.globalAlpha=1;
    }
  }

  /* ---------- двигатель дышит со скоростью ---------- */
  function engineK(){
    if(typeof S==='undefined'||!S.running) return 1;
    return 1+Math.min(.5, (S.speed-1)*.16); // разгон — аура кормы разгорается
  }

  /* новый взлёт — отметины тысяч считаются заново (нашёл страж П5, v1.106.0):
     иначе после краха вторая попытка молчала до прошлого максимума */
  /* v1.282.20: сброс был неполным — чистились только вёрсты. Искры золота, недоигранная
     вспышка крыла, метеор и станция посреди траектории переживали посадку и всплывали в
     первых кадрах СЛЕДУЮЩЕГО забега: «из ниоткуда прилетают золотые искры», станция
     появляется из середины пролёта. Тот же класс, что модуль уже лечил в v1.280.0. */
  /* v1.284.22 (партия 49): окно первого появления станции — 12–38 с вместо 70–130.
     Владелец: «я до сих пор не вижу станцию, раньше она была постоянно». Проверено.
     До v1.282.20 счётчик станции не сбрасывался между забегами — он шёл сквозь всю сессию,
     и станция появлялась регулярно. Правка v1.282.20 честно вылечила другую беду (станция
     всплывала «из середины пролёта» в первых кадрах следующего забега) и добавила сброс,
     оставив ПРЕЖНЕЕ окно — «те же окна, что при загрузке модуля». Но забег это не сессия:
     замер по боевым записям — средний забег 34.4 с (54 забега, 1856 секунд), лучший за день
     69 с. То есть станция стала недостижима: чтобы её увидеть, надо прожить дольше, чем
     минимальная задержка её появления. Декорация, которую нельзя увидеть, — мёртвый код.
     Нижняя граница 12 с намеренно не ноль: с неё начиналась та самая беда «всплывает
     из середины пролёта», и возвращать её нельзя. Страж 150 сторожит обе границы. */
  function reset(){ mile=0; mileT=0; sparks.length=0; flash=null; met=null; sta=null; _bank=0;
    metT=8+R()*10; staT=12+R()*26;
    /* 27.08.2026: sky._p (метка времени последнего кадра) жила на самой функции и не
       чистилась здесь — S.time для нового забега стартует заново с нуля, а sky._p
       оставался от предыдущего забега/превью меню. Первый sky() нового забега получал
       ОТРИЦАТЕЛЬНЫЙ dt (tN уже меньше старого sky._p) — все таймеры декора (станция,
       метеор, всполох мили) на один кадр тикали НАЗАД вместо вперёд. Найдено стражами
       89/103 (guard.mjs): _poke('station') ставит staT=0, а станция всё равно не
       появлялась — отрицательный dt откатывал её обратно. sky._p=0 — тот же приём,
       что уже применяет сам sky() для первого-в-жизни кадра (dt=tN-(sky._p||tN)=0
       через `||tN`, раз 0 ложно). */
    sky._p=0; }

  /* v1.282.23 «Станция переживает восстановление холста» (партия 27): staG кэшировал
     градиенты станции «один раз навсегда» (см. комментарий у staGrad выше) — но после
     потери GPU-контекста (contextlost/contextrestored, партия «Потеря холста» v1.282.20)
     старые CanvasGradient становятся мусором, а gfxInvalidate() в render.js про staG не
     знал: станцию латали от печки-в-каждом-кадре, но не от протухания после потери
     контекста — тот же класс беды, другая половина. _gfxReset() — мостик для ядра. */
  function gfxReset(){ for(const k in staG) delete staG[k]; }
  return { sky, rockTint, planeFx, spark, engineK, reset,
    // мостик стража: заглянуть внутрь и подтолкнуть редких гостей (тесты, не игра)
    _state:()=>({metT, met:!!met, staT, sta:!!sta, staX:sta?Math.round(sta.x):-1, staY:sta?Math.round(sta.y):-1, sparks:sparks.length, mile, mileT, flash:!!flash}),
    _poke:(w)=>{ if(w==='meteor') metT=0; if(w==='station') staT=0; if(w==='mile'){ mile=Math.floor(S.dist/1000); } },
    _gradCount:()=>Object.keys(staG).length, _gfxReset:gfxReset };
})();
// прямые мостики в ядро — без обёрток: ошибка должна попасть в самописец, а не утонуть
const planetSky=(tN)=>PLANET.sky(tN);
const planetRockTint=(o)=>PLANET.rockTint(o);
const planetPlaneFx=(tN)=>PLANET.planeFx(tN);
const planetSpark=(x,y)=>PLANET.spark(x,y);
const planetEngineK=()=>PLANET.engineK();
const planetReset=()=>PLANET.reset();
