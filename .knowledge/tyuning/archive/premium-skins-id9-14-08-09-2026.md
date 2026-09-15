# Архив: первые 6 Stars-скинов (id9-14) — до замены 08.09.2026

Владелец: «старые скины все уходят в блокнот, не удаляй их полностью. создай файл с
ними». Ничего не удалено из игры на момент записи этого файла — это честная копия
того, что сейчас реально лежит в `js/game.js`/`js/render.js`, на случай если захочется
вернуть один из них позже (материал, идея, конкретная анимация).

Контекст: [[project_stars_premium_skins]] — первая партия премиум-скинов за Telegram
Stars, отобрана владельцем живьём через макет 04.09.2026, реализована в v1.478.73.
Цена всех шести на момент архивации — 1⭐ (временная тестовая, не финальная).

## Записи в `js/game.js` → `SKINS[]`

```js
{id:9,  name:9,  price:1, premium:true, fx:'satellites', trailFx:'debris',   body:'#dde6ff',fold:'#9aa8e0',glow:'rgba(120,150,255,.95)',trail:'rgba(120,150,255,', cat:'stars'}, // Спутники — синь тона 230°
{id:10, name:10, price:1, premium:true, fx:'facets',     trailFx:'pearls',   body:'#f4f2ff',fold:'#c9c3ea',glow:'rgba(210,200,255,.95)',trail:'rgba(210,200,255,', cat:'stars'}, // Грани — почти белый хрусталь
{id:11, name:11, price:1, premium:true, fx:'inlay',      trailFx:'sparks',   body:'#ffe0ec',fold:'#e592b0',glow:'rgba(255,90,140,.95)', trail:'rgba(255,90,140,', cat:'stars'},  // Инкрустация — рубин, тон 340°
{id:12, name:12, price:1, premium:true, fx:'filigree',   trailFx:'cometdust',body:'#fff0d6',fold:'#e0b46a',glow:'rgba(230,170,70,.95)', trail:'rgba(230,170,70,', cat:'stars'},  // Филигрань — старое золото, тон 35°
{id:13, name:13, price:1, premium:true, fx:'core',       trailFx:'ribbon',   body:'#d8ffe8',fold:'#8ed9ac',glow:'rgba(70,220,130,.95)', trail:'rgba(70,220,130,', cat:'stars'},  // Ядро — изумруд, тон 140°
{id:14, name:14, price:1, premium:true, fx:'aim',        trailFx:'waypoints',body:'#d2f6ff',fold:'#7fc9e0',glow:'rgba(60,190,230,.95)', trail:'rgba(60,190,230,', cat:'stars'},  // Прицел — электрик, тон 195°
```

## Отрисовка в `js/render.js` → внутри `drawPlane()` (не через `PREM_FX_MAP` — этот блок старше, инлайн-цепочка `if(hq && fx==='...')`)

```js
if(hq && fx==='satellites'){ // Спутники: 3 орбитальные точки + мощный кристалл на носу и на хвосте
  let nearTop=0, nearBottom=0;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(let i=0;i<3;i++){
    const ph=nowMs/900+i*2.094;
    const ox=Math.cos(ph)*22, oy=-2+Math.sin(ph)*12;
    const r=2.6+0.8*Math.sin(nowMs/300+i);
    const rr=r*2.2;
    ctx.drawImage(satGlowSprite(skin), ox-rr, oy-rr, rr*2, rr*2);
    const a=((ph%6.283)+6.283)%6.283;
    const topDist=Math.abs(a-4.71);
    nearTop=Math.max(nearTop, Math.max(0,1-topDist/0.4));
    const botDist=Math.abs(a-1.5708);
    nearBottom=Math.max(nearBottom, Math.max(0,1-botDist/0.4));
  }
  ctx.restore();
  drawMightyCrystal(ctx,skin.trail,0,-15,2.6,nearTop*.85);
  drawMightyCrystal(ctx,skin.trail,0,7,2.2,nearBottom*.85);
}
if(hq && fx==='facets'){ // Грани: огранка с бегущим бликом-разверткой + камень в точке схода
  const cyc=2200;
  const sweep=-26+((nowMs%cyc)/cyc)*52;
  FACET_PARTS.forEach(f=>{
    ctx.fillStyle=skin.trail+f.base+')';
    ctx.beginPath(); ctx.moveTo(f.pts[0][0],f.pts[0][1]); ctx.lineTo(f.pts[1][0],f.pts[1][1]); ctx.lineTo(f.pts[2][0],f.pts[2][1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=skin.trail+'.5)'; ctx.lineWidth=.5; ctx.stroke();
    const glint=Math.max(0,1-Math.abs(f.cx-sweep)/7);
    if(glint>0.02){
      ctx.save(); ctx.globalCompositeOperation='lighter';
      ctx.fillStyle='rgba(255,255,255,'+(glint*glint*0.9).toFixed(2)+')';
      ctx.beginPath(); ctx.moveTo(f.pts[0][0],f.pts[0][1]); ctx.lineTo(f.pts[1][0],f.pts[1][1]); ctx.lineTo(f.pts[2][0],f.pts[2][1]); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
  const centerGlint=Math.max(0,1-Math.abs(sweep)/7);
  drawSkinGem(ctx,skin,0,8,1.6,centerGlint*.9);
  drawSkinGem(ctx,skin,CORNER_NOSE[0],CORNER_NOSE[1],1.2,0);
  drawSkinGem(ctx,skin,CORNER_LWING[0],CORNER_LWING[1],1.1,0);
  drawSkinGem(ctx,skin,CORNER_RWING[0],CORNER_RWING[1],1.1,0);
}
if(hq && fx==='inlay'){ // Инкрустация: камни в корпусе + на кончиках крыльев; оправа от вершины носа
  metalStroke(ctx, c=>{
    c.moveTo(0,-22); c.lineTo(GEM_SLOTS[1].x,GEM_SLOTS[1].y);
    c.moveTo(0,-22); c.lineTo(GEM_SLOTS[2].x,GEM_SLOTS[2].y);
  }, .75, .4);
  const cyc=2400;
  GEM_SLOTS.concat(WINGTIP_SLOTS).forEach(gm=>{
    const ph=((nowMs+gm.ph*400)%cyc)/cyc;
    const glint=Math.max(0,1-Math.abs(ph-0.15)/0.12);
    drawSkinGem(ctx,skin,gm.x,gm.y,gm.r,glint);
  });
}
if(hq && fx==='filigree'){ // Филигрань: гравировка по кромке, искра бежит от камня в носу по обеим сторонам разом
  ctx.save(); ctx.globalCompositeOperation='lighter';
  metalStroke(ctx, c=>{ c.moveTo(0,-22); c.lineTo(-16,14); c.moveTo(0,-22); c.lineTo(16,14); }, .55, .35);
  const cyc=1800;
  const C=(nowMs/cyc)%1;
  FIL_MARKS.forEach(m=>{
    metalStroke(ctx, c=>{ c.moveTo(m.x,m.y); c.lineTo(m.x+m.ux*1.6,m.y+m.uy*1.6); }, .7, .4);
    const local=C-m.f*0.5;
    const glint=(local>=0&&local<0.18)?Math.max(0,1-local/0.18):0;
    if(glint>0.02){
      ctx.fillStyle='rgba(255,255,255,'+glint.toFixed(2)+')';
      ctx.beginPath(); ctx.arc(m.x+m.ux*.8,m.y+m.uy*.8,.9*glint+.2,0,6.283); ctx.fill();
    }
  });
  ctx.restore();
  const noseGlint=Math.max(0,1-C/0.15);
  drawSkinGem(ctx,skin,0,-16,1.4,noseGlint*.85);
}
if(hq && fx==='core'){ // Ядро: гранёный реактор в оправе-кольце + хребет от хвоста до носа + камни на крыльях
  metalStroke(ctx, c=>{ c.moveTo(0,-22); c.lineTo(0,6); }, .6, .4);
  const spineT=(nowMs/2000)%1;
  const sy=-22+28*spineT;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  ctx.fillStyle='rgba(255,255,255,'+(Math.sin(spineT*Math.PI)*.8).toFixed(2)+')';
  ctx.beginPath(); ctx.arc(0,sy,.9,0,6.283); ctx.fill();
  ctx.restore();
  const wingGlint=Math.max(0,1-(1-spineT)/0.15);
  drawSkinGem(ctx,skin,-9,9,1.3,wingGlint);
  drawSkinGem(ctx,skin,9,9,1.3,wingGlint);
  ctx.save(); ctx.translate(0,2);
  metalStroke(ctx, c=>{
    for(let i=0;i<6;i++){ const a=i*Math.PI/3; const px=Math.cos(a)*5.4, py=Math.sin(a)*5.4; i===0?c.moveTo(px,py):c.lineTo(px,py); }
    c.closePath();
  }, .7, .4);
  ctx.strokeStyle=skin.trail+'.45)'; ctx.lineWidth=.4;
  ctx.beginPath(); ctx.arc(0,0,3.3,0,6.283); ctx.stroke();
  ctx.globalCompositeOperation='lighter';
  const pulse=0.5+0.5*Math.sin(nowMs/500);
  const coreR=1.6+pulse*.5;
  ctx.fillStyle='rgba(255,255,255,'+(0.5+0.4*pulse).toFixed(2)+')';
  ctx.beginPath(); ctx.moveTo(0,-coreR); ctx.lineTo(coreR*.6,0); ctx.lineTo(0,coreR); ctx.lineTo(-coreR*.6,0); ctx.closePath(); ctx.fill();
  if(pulse>0.85){
    const rayA=(pulse-0.85)/0.15;
    ctx.strokeStyle=skin.trail+(rayA*.8).toFixed(2)+')'; ctx.lineWidth=.5;
    for(let i=0;i<4;i++){
      const ang=i*(Math.PI/2)+Math.PI/4;
      ctx.beginPath(); ctx.moveTo(Math.cos(ang)*2,Math.sin(ang)*2); ctx.lineTo(Math.cos(ang)*(4+rayA*3),Math.sin(ang)*(4+rayA*3)); ctx.stroke();
    }
  }
  ctx.restore();
}
if(hq && fx==='aim'){ // Прицел: HUD-скобки вращаются, на захвате сами фокусируются — подлетают ближе и раскрываются шире
  let anyLock=0;
  ctx.save(); ctx.globalCompositeOperation='lighter';
  const rot=nowMs/2600;
  for(let i=0;i<4;i++){
    const ang=rot+i*(Math.PI/2);
    const top=((ang-Math.PI/2)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    const distToTop=Math.min(top,Math.PI*2-top);
    const lock=Math.max(0,1-distToTop/0.35);
    const R=26-lock*7, spread=4+lock*3;
    ctx.save(); ctx.rotate(ang);
    ctx.strokeStyle=lock>0.02?'rgba(255,255,255,'+(0.8+lock*0.2).toFixed(2)+')':skin.trail+'.8)';
    ctx.lineWidth=1+lock*.8;
    ctx.beginPath(); ctx.moveTo(-R,-6); ctx.lineTo(-R,-6-spread); ctx.lineTo(-R+spread,-6-spread); ctx.stroke();
    anyLock=Math.max(anyLock,lock);
    ctx.restore();
  }
  ctx.restore();
  drawSkinGem(ctx,skin,-14,12,1.1,0);
  drawSkinGem(ctx,skin,14,12,1.1,0);
  drawSpearGem(ctx,skin.trail,0,-17,2.6,anyLock*.9);
}
```

**Важно про общие помощники**: `drawSkinGem`, `metalStroke` используются и другими
скинами (сигилы и т.д.) — при удалении инлайн-блока их трогать нельзя. Только
`FACET_PARTS`, `CORNER_NOSE`/`CORNER_LWING`/`CORNER_RWING`, `GEM_SLOTS`,
`WINGTIP_SLOTS`, `FIL_MARKS`, `satGlowSprite`, `drawMightyCrystal`, `drawSpearGem` нужно
будет отдельно проверить на использование в других местах файла ПЕРЕД удалением —
не сделано на момент записи этого архива, это следующий шаг перед самой заменой.

**Статус**: архив снят, ничего в живом коде ещё не тронуто. Следующий шаг — заменить
id9-14 на 6 тем из одобренной партии `fizika-kultura-map-08-09-2026.html`, при этом
владелец подтвердил (переспрошено явно): старые уходят, цена остаётся как есть (1⭐)
до отдельного разговора о финальной цене.
