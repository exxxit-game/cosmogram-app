'use strict';
/* ============================================================
   RENDER: отрисовка, авто-качество по FPS, кэш градиентов,
   главный цикл (fixed timestep, рендер независимый).
   Зависит от core.js, game.js.
   ============================================================ */

/* ---------- Авто-качество (Блок 3/10): shadowBlur — главный мобильный тормоз ---------- */
const Q = { level:2, fps:60, mode:'auto', _acc:0, _n:0, _t:0, _up:0, _dn:0, _hold:0, _ceil:-1, _prove:0 }; // 0=low 1=med 2=high 3=ultra; mode — настройка игрока
function qThr(){
  const t=gfxTier(), hz=Store.get('dispHz',60);
  if (hz>=100) return {dn:Math.round(hz*.45), up:Math.round(hz*.85)};
  if (t>=2) return {dn:38, up:54};
  if (t===1) return {dn:36, up:50};
  return {dn:32, up:45};
}
function qualityTick(dt){
  if (Q.mode!=='auto'){ Q.level = Q.mode==='low'?0:(Q.mode==='med'?1:(Q.mode==='ultra'&&gfxUltraOk()?3:2)); return; }
  Q._acc+=dt; Q._n++; Q._t+=dt;
  if(Q._t>=1){
    const f = Q._n/Math.max(Q._acc,.001);
    Q.fps = lerp(Q.fps, f, .6);
    Q._acc=0; Q._n=0; Q._t=0;
    const applyLevelChange = (nextLevel, signal) => {
      const prev = Q.level;
      if (nextLevel === prev) return false;
      Q.level = nextLevel;
      Q._dn=0; Q._up=0; Q._prove=0; Q._hold=8;
      if (typeof signal === 'number') Q._ceil = signal;
      Store.set('gfxLv',Q.level); Store.set('gfxCeil', Q._ceil); gfxCap(); resize();
      return true;
    };
    if (Q._hold>0){
      const {dn:dnEarly}=qThr();
      if (Q.fps < dnEarly*.6 && Q.level>0){
        Q._ceil = Q.level;
        const changed = applyLevelChange(Q.level-1, Q._ceil);
        if (changed && typeof BEACON!=='undefined') BEACON.signal('fps_drop_severe', Math.round(Q.fps)+'');
        return;
      }
      Q._hold--; Q._up=0; Q._dn=0; Q._prove=0; return;
    }
    const {dn,up}=qThr(), cap=gfxUltraOk()?3:2;
    const ceil = Q._ceil>=0 ? Math.min(cap,Q._ceil-1) : cap;
    if(Q.fps<dn && Q.level>0){ if(++Q._dn>=3){
      Q._ceil = Q.level;
      const changed = applyLevelChange(Q.level-1, Q._ceil);
      if (changed && typeof BEACON!=='undefined') BEACON.signal('fps_drop', Math.round(Q.fps)+''); } }
    else if(Q.fps>up && Q.level<ceil){ Q._dn=0; if(++Q._up>=8){ const old = Q.level; Q.level++; Q._up=0; Q._prove=0; Q._hold=8; Store.set('gfxLv',Q.level); gfxCap(); if (old !== Q.level) resize(); } }
    else if(Q.fps>up){ Q._dn=0; Q._up=0; if(Q._ceil>=0 && ++Q._prove>=20){ Q._ceil=-1; Q._prove=0; Store.set('gfxCeil',-1); } }
    else { Q._up=0; Q._dn=0; Q._prove=0; }
  }
}
const DEBUG_FPS = /[?&#]debug/.test(location.href);
const frameProfile={bg:0,stars:0,sky:0,field:0,fx:0,n:0,last:0};
function profileReport(){
  if(!DEBUG_FPS || frameProfile.n<30) return;
  const now=performance.now();
  if(now-frameProfile.last<250) return;
  const n=frameProfile.n, el=$('fpsPill');
  if(el){
    el.dataset.profile='1';
    el.textContent=Q.fps.toFixed(0)+' fps | bg '+(frameProfile.bg/n).toFixed(1)+' | stars '+(frameProfile.stars/n).toFixed(1)+' | sky '+(frameProfile.sky/n).toFixed(1)+' | field '+(frameProfile.field/n).toFixed(1)+' | fx '+(frameProfile.fx/n).toFixed(1)+' ms';
  }
  frameProfile.bg=0; frameProfile.stars=0; frameProfile.sky=0; frameProfile.field=0; frameProfile.fx=0; frameProfile.n=0; frameProfile.last=now;
}
function invulnDim(){ return RM ? true : (Math.floor(performance.now()/90)%2===0); }
let frameDt=1/60, _lastDrawT=0;
function frameTick(t){ const d=(t-_lastDrawT)/1000; _lastDrawT=t; frameDt=(d>0&&d<0.25)?d:1/60; }

function rr(x,px,py,w,h,r){ x.beginPath(); x.moveTo(px+r,py); x.arcTo(px+w,py,px+w,py+h,r);
  x.arcTo(px+w,py+h,px,py+h,r); x.arcTo(px,py+h,px,py,r); x.arcTo(px,py,px+w,py,r); x.closePath(); }

let bgCache={h:-1,w:-1,ht:-1,g:null};
function bgGradient(h1,h2){
  const hq0=Math.round(S.hueShift);
  if(bgCache.h!==hq0||bgCache.w!==W||bgCache.ht!==H){
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,`hsl(${h1},62%,10%)`);
    g.addColorStop(.55,`hsl(${h1},58%,16%)`);
    g.addColorStop(1,`hsl(${h2},70%,26%)`);
    bgCache={h:hq0,w:W,ht:H,g};
  }
  return bgCache.g;
}
let coneGrad=null;
let starGlowSprite=null;
function starGlow(){
  if(!starGlowSprite){
    const c=document.createElement('canvas'); c.width=c.height=48;
    const x=ctx2d(c);
    const g=x.createRadialGradient(24,24,2,24,24,24);
    g.addColorStop(0,juicy('rgba(255,235,170,.9)','color(display-p3 1 .95 .72 / .9)'));
    g.addColorStop(.4,juicy('rgba(255,215,106,.35)','color(display-p3 1 .87 .42 / .35)'));
    g.addColorStop(1,juicy('rgba(255,215,106,0)','color(display-p3 1 .87 .42 / 0)'));
    x.fillStyle=g; x.fillRect(0,0,48,48);
    starGlowSprite=c;
  }
  return starGlowSprite;
}
function skyPx(){ return DPR*SC; }
let vignCache={w:-1,ht:-1,d:-1,s:-1,c:null};
function vignetteSprite(){
  if(vignCache.w!==W||vignCache.ht!==H||vignCache.d!==DPR||vignCache.s!==SC){
    const px=skyPx();
    const cw=Math.round(W*px), chh=Math.round(H*px);
    let c=vignCache.c;
    if(c && (c.width!==cw || c.height!==chh)){ c.width=0; c.height=0; c=null; }
    if(!c){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
    const x=ctx2d(c);
    x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh);
    x.setTransform(px,0,0,px,0,0);
    const g=x.createRadialGradient(W/2,H*.45,Math.min(W,H)*.35, W/2,H*.55, Math.max(W,H)*.78);
    g.addColorStop(0,'rgba(2,4,14,0)'); g.addColorStop(1,'rgba(2,4,14,.42)');
    x.fillStyle=g; x.fillRect(0,0,W,H);
    vignCache={w:W,ht:H,d:DPR,s:SC,c};
  }
  return vignCache.c;
}
const starDotCache={};
function starDot(tint){
  if(!starDotCache[tint]){
    const c=document.createElement('canvas'); c.width=c.height=16;
    const x=ctx2d(c);
    const col=tint==='w'?'255,247,228':tint==='c'?'186,230,255':'218,230,255';
    const g=x.createRadialGradient(8,8,0,8,8,8);
    g.addColorStop(0,'rgba('+col+',1)'); g.addColorStop(.35,'rgba('+col+',.8)');
    g.addColorStop(1,'rgba('+col+',0)');
    x.fillStyle=g; x.fillRect(0,0,16,16);
    starDotCache[tint]=c;
  }
  return starDotCache[tint];
}
const trailGlowCache={};
function trailGlow(skin){
  if(!trailGlowCache[skin.id]){
    const c=document.createElement('canvas'); c.width=c.height=48;
    const x=ctx2d(c);
    const g=x.createRadialGradient(24,24,2,24,24,24);
    g.addColorStop(0,skin.trail+'.55)'); g.addColorStop(.5,skin.trail+'.22)'); g.addColorStop(1,skin.trail+'0)');
    x.fillStyle=g; x.fillRect(0,0,48,48);
    trailGlowCache[skin.id]=c;
  }
  return trailGlowCache[skin.id];
}
const planeGlowCache={};
function planeGlow(skin){
  if(!planeGlowCache[skin.id]){
    const c=document.createElement('canvas'); c.width=c.height=64;
    const x=ctx2d(c);
    const base=skin.glow.slice(0,skin.glow.lastIndexOf(',')+1);
    const g=x.createRadialGradient(32,32,4,32,32,32);
    g.addColorStop(0,base+'.5)'); g.addColorStop(.55,base+'.18)'); g.addColorStop(1,base+'0)');
    x.fillStyle=g; x.fillRect(0,0,64,64);
    planeGlowCache[skin.id]=c;
  }
  return planeGlowCache[skin.id];
}
let sheenSpr=null;
function sheenSprite(){
  if(!sheenSpr){
    const c=document.createElement('canvas'); c.width=18; c.height=48;
    const x=ctx2d(c);
    const g=x.createLinearGradient(0,0,18,0);
    g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.5,'rgba(255,255,255,.55)'); g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.fillRect(0,0,18,48);
    sheenSpr=c;
  }
  return sheenSpr;
}
const NEON_HUES=[]; for(let i=0;i<360;i++) NEON_HUES.push('hsla('+i+',100%,65%,');
const PLASMA_HUES=[]; for(let i=0;i<40;i++) PLASMA_HUES.push('hsl('+i+',95%,58%)');
const NF_HUE_STEP=60;
let nfCache={w:-1,ht:-1,h:-1,d:-1,s:-1,c:null};
let nfSeed=0;
function nebulaReseed(){ nfSeed=((Math.floor(Math.random()*4294967296))>>>0)||1; nfCache.h=-1; }
function nebulaField(h1,h2){
  const hq=Math.round(S.hueShift/NF_HUE_STEP);
  if(nfCache.w===W&&nfCache.ht===H&&nfCache.h===hq&&nfCache.d===DPR&&nfCache.s===SC) return nfCache.c;
  const px=skyPx();
  const cw=Math.round(W*px), chh=Math.round(H*px);
  let c=nfCache.c;
  if(!c || c.width!==cw || c.height!==chh){ c=document.createElement('canvas'); c.width=cw; c.height=chh; }
  const x=ctx2d(c);
  x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,cw,chh);
  x.setTransform(px,0,0,px,0,0);
  let seed=(nfSeed||1);
  const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const blob=(bx,by,r,hue,li,a,sq)=>{
    x.save(); x.translate(bx,by); x.scale(1,sq||1);
    const g=x.createRadialGradient(0,0,0,0,0,r);
    g.addColorStop(0,'hsla('+hue+',80%,'+li+'%,'+a+')');
    g.addColorStop(.6,'hsla('+(hue+20)+',75%,'+Math.max(li-12,8)+'%,'+(a*.5)+')');
    g.addColorStop(1,'hsla('+hue+',75%,'+li+'%,0)');
    x.fillStyle=g; x.beginPath(); x.arc(0,0,r,0,6.283); x.fill(); x.restore();
  };
  const m=Math.max(W,H);
  blob(W*(.1+R()*.25), H*(.15+R()*.2), m*.45, h1+30, 42, .30, .8);
  blob(W*(.7+R()*.25), H*(.5+R()*.25), m*.4, h2+50, 40, .26, .85);
  blob(W*(.2+R()*.5), H*(.55+R()*.3), m*.36, h1+300, 55, .20, .55);
  blob(W*(.5+R()*.4), H*(.1+R()*.25), m*.3, h1+285, 52, .15, .6);
  blob(W*(.02+R()*.3), H*(.6+R()*.3), m*.32, h2+150, 50, .18, .7);
  const x0=W*.05, y0=H*.82, x1=W*.95, y1=H*.12;
  for(let i=0;i<9;i++){
    const t=i/8;
    blob(lerp(x0,x1,t)+(R()-.5)*W*.08, lerp(y0,y1,t)+(R()-.5)*H*.06, m*.17, h1+40, 68, .07, .5);
  }
  for(let i=0;i<240;i++){
    const t=R(), near=R()<.6;
    const sx=near? lerp(x0,x1,t)+(R()-.5)*W*.32 : R()*W;
    const sy=near? lerp(y0,y1,t)+(R()-.5)*H*.24 : R()*H;
    x.globalAlpha=.04+R()*.2;
    x.fillStyle=R()<.8?'#dfe9ff':'#ffe9c8';
    const sz=.4+R()*1.1;
    x.fillRect(sx,sy,sz,sz);
  }
  x.globalAlpha=1;
  nfCache={w:W,ht:H,h:Math.round(S.hueShift/NF_HUE_STEP),d:DPR,s:SC,c:c};
  return c;
}
let planeGradCache={skin:-1,g:null};
function planeGrad(skin){
  if(planeGradCache.skin!==skin.id){
    const g=ctx.createLinearGradient(0,-22,0,16);
    g.addColorStop(0,'#ffffff'); g.addColorStop(.45,skin.body); g.addColorStop(1,skin.fold);
    planeGradCache={skin:skin.id,g};
  }
  return planeGradCache.g;
}
const powGlowCache={};
function powGlow(color){
  if(!powGlowCache[color]){
    const c=document.createElement('canvas'); c.width=c.height=56;
    const x=ctx2d(c);
    const g=x.createRadialGradient(28,28,2,28,28,28);
    g.addColorStop(0,hexToRgba(color)+'.55)'); g.addColorStop(1,hexToRgba(color)+'0)');
    x.fillStyle=g; x.fillRect(0,0,56,56);
    powGlowCache[color]=c;
  }
  return powGlowCache[color];
}
const partColC={};
function partCol(prefix, a){
  const q=a<=0?0:(a>=1?40:Math.round(a*40));
  const k=prefix+q;
  let v=partColC[k];
  if(!v){ v=prefix+(q/40).toFixed(3)+')'; partColC[k]=v; }
  return v;
}
const STREAK_COL=['rgba(255,247,228,.9)','rgba(186,230,255,.9)','rgba(218,230,255,.9)'];
const SGN2=[-1,1];
const gradCache={}; let gradN=0;
function gradPut(k,g){ if(gradN>400){ for(const q in gradCache) delete gradCache[q]; gradN=0; } gradCache[k]=g; gradN++; return g; }
let nebCache={h:-1,a:null,b:null};
function gfxInvalidate(){
  bgCache={h:-1,w:-1,ht:-1,g:null};
  coneGrad=null;
  starGlowSprite=null;
  vignCache={w:-1,ht:-1,d:-1,s:-1,c:null};
  nfCache={w:-1,ht:-1,h:-1,d:-1,s:-1,c:null};
  planeGradCache={skin:-1,g:null};
  nebCache={h:-1,a:null,b:null};
  sheenSpr=null;
  for(const k in starDotCache) delete starDotCache[k];
  for(const k in trailGlowCache) delete trailGlowCache[k];
  for(const k in planeGlowCache) delete planeGlowCache[k];
  for(const k in powGlowCache) delete powGlowCache[k];
  for(const k in gradCache) delete gradCache[k]; gradN=0;
  for(const k in partColC) delete partColC[k];
  if (typeof PLANET!=='undefined' && PLANET._gfxReset) PLANET._gfxReset();
  if (typeof GOLD!=='undefined' && GOLD._gfxReset) GOLD._gfxReset();
  if (typeof obstacles!=='undefined') for(const o of obstacles){ if(o.kind==='comet'){ o._tg=null; o._tgk=undefined; } }
}
function nebulaSprite(hue){
  const c=document.createElement('canvas'); c.width=c.height=200;
  const x=ctx2d(c);
  const g=x.createRadialGradient(100,100,0,100,100,100);
  g.addColorStop(0,`hsl(${hue},75%,64%)`); g.addColorStop(.45,`hsl(${hue+18},70%,45%)`); g.addColorStop(1,'transparent');
  x.fillStyle=g; x.fillRect(0,0,200,200);
  return c;
}
let lowPowerMemo={t:0,v:false};
function isLowPowerDevice(frameNow){
  const t=(typeof frameNow==='number')?frameNow:performance.now();
  if(t-lowPowerMemo.t>1500 || lowPowerMemo.t===0){
    lowPowerMemo.t=t;
    lowPowerMemo.v = gfxTier()<=0 || !!(typeof isAndroidGo==='function' && isAndroidGo());
  }
  return lowPowerMemo.v;
}
function drawNebulas(h1,h2,tN,lowPower){
  if(Q.level===0) return;
  if(typeof lowPower!=='boolean') lowPower=isLowPowerDevice();
  if(lowPower && Q.level<=1){ return; }
  const hq1=Math.round(S.hueShift/NF_HUE_STEP);
  if(nebCache.h!==hq1){
    nebCache={h:hq1,a:nebulaSprite(h1+40),b:nebulaSprite(h2+60)};
  }
  if(lowPower){
    ctx.globalAlpha=.18;
    ctx.drawImage(nebCache.a, W*.15, H*.25, W*.7, H*.55);
    ctx.globalAlpha=1;
    return;
  }
  if(Q.level>=2){
    ctx.drawImage(nebulaField(h1,h2),0,0,W,H);
    ctx.globalAlpha=.09;
    ctx.drawImage(nebCache.a, W*.2+Math.sin(tN*.05)*40-W*.28, H*.3-W*.28, W*.56, W*.56);
    ctx.globalAlpha=.08;
    ctx.drawImage(nebCache.b, W*.85-W*.25, H*.7+Math.cos(tN*.04)*50-W*.25, W*.5, W*.5);
    ctx.globalAlpha=1;
    if(Q.level>=3){
      ctx.globalAlpha=.07;
      ctx.drawImage(nebCache.a, W*.55-W*.22, H*.12+Math.sin(tN*.06)*30-W*.22, W*.44, W*.44);
      ctx.globalAlpha=1;
    }
    return;
  }
  ctx.globalAlpha=.11;
  ctx.drawImage(nebCache.a, W*.2+Math.sin(tN*.05)*40-W*.28, H*.3-W*.28, W*.56, W*.56);
  ctx.globalAlpha=.09;
  ctx.drawImage(nebCache.b, W*.85-W*.25, H*.7+Math.cos(tN*.04)*50-W*.25, W*.5, W*.5);
  ctx.globalAlpha=1;
}

function drawFx(hq,sh){
  if(!particles.length && !popups.length) return;
  const lowFx = isLowPowerDevice() || (Q.mode==='auto' && Q.fps<48);
  const maxDraw = !lowFx ? particles.length : (Q.fps<40 ? 90 : 140);
  let drawn = 0;
  if(hq) ctx.globalCompositeOperation='lighter';
  let aurSp=null;
  for (let pi=particles.length-1;pi>=0;pi--){
    if(drawn>=maxDraw) break;
    const p=particles[pi];
    if(!inView(p.x,p.y,12,12)) continue;
    ctx.globalAlpha = clamp(p.life,0,1);
    if(hq && p.fx==='aurora'){
      if(!aurSp) aurSp=starDot('w');
      const s=p.size*3.4;
      ctx.drawImage(aurSp,p.x-s/2,p.y-s/2,s,s);
      drawn++;
      continue;
    }
    ctx.fillStyle = partCol(p.color, p.life*.9);
    ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    drawn++;
  }
  ctx.globalAlpha=1;
  if(hq) ctx.globalCompositeOperation='source-over';
  ctx.textAlign='center'; ctx.font='500 15px -apple-system,"Segoe UI",Roboto,sans-serif';
  for (const p of popups){
    if(!inView(p.x,p.y,140,42)) continue;
    const life=clamp(p.life,0,1);
    ctx.globalAlpha=life;
    ctx.fillStyle=p.color;
    if(sh){ ctx.save(); ctx.translate(p.x,p.y); ctx.scale(1.12,1.12);
      ctx.globalAlpha=life*.35; ctx.fillText(p.txt,0,0); ctx.restore();
      ctx.globalAlpha=life; }
    ctx.fillText(p.txt,p.x,p.y);
  }
  ctx.globalAlpha=1;
}

function fillGlyphPath(x,kind){
  x.beginPath();
  switch(kind){
    case 'shield': x.moveTo(0,-6.6); x.lineTo(5,-4.6); x.lineTo(5,0.4);
      x.quadraticCurveTo(5,4.8,0,7.2); x.quadraticCurveTo(-5,4.8,-5,0.4);
      x.lineTo(-5,-4.6); x.closePath(); break;
    case 'slowmo': x.arc(0,0,5.6,0,6.283); break;
    case 'dash': for(const dx of [-6.4,-2.2,2]){
      x.moveTo(dx,-4.6); x.lineTo(dx+3.6,0); x.lineTo(dx,4.6); x.lineTo(dx+1.9,4.6);
      x.lineTo(dx+5.5,0); x.lineTo(dx+1.9,-4.6); x.closePath(); } break;
    case 'nova':
      for(let i=0;i<16;i++){ const a=i/16*6.283, rad=i%2?2.2:6.6;
        i?x.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):x.moveTo(Math.cos(a)*rad,Math.sin(a)*rad); }
      x.closePath(); break;
  }
}
function drawGlyph(ctx,kind,col){
  ctx.save();
  const gk='gly'+col; let g=gradCache[gk];
  if(!g){ g=ctx.createLinearGradient(0,-7,0,7);
    g.addColorStop(0,'#ffffff'); g.addColorStop(.25,col); g.addColorStop(1,col); gradPut(gk,g); }
  if(kind==='magnet'){
    ctx.strokeStyle=g; ctx.lineWidth=4.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-4.4,4.8); ctx.lineTo(-4.4,-0.8);
    ctx.arc(0,-0.8,4.4,Math.PI,0); ctx.lineTo(4.4,4.8); ctx.stroke();
  } else if(kind==='life'){
    ctx.fillStyle=g;
    rr(ctx,-1.7,-5.2,3.4,10.4,1.2); ctx.fill();
    rr(ctx,-5.2,-1.7,10.4,3.4,1.2); ctx.fill();
  } else {
    fillGlyphPath(ctx,kind); ctx.fillStyle=g; ctx.fill();
  }
  if(kind==='slowmo'){
    ctx.strokeStyle='rgba(8,14,34,.85)'; ctx.lineWidth=2.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-3.1); ctx.lineTo(0,0); ctx.lineTo(2.6,1.6); ctx.stroke();
  }
  ctx.restore();
}

function inView(x,y,mx,my){
  return x>=-mx && x<=W+mx && y>=-my && y<=H+my;
}

const POW_COLORS={shield:'#7fd8ff',magnet:'#c58fff',slowmo:'#8fff9f',life:'#ffa1d9',dash:'#a9bcff',nova:'#fff0a8'};
let POW_RING=null;
function powRing(){
  if(!POW_RING){ POW_RING={}; for(const k in POW_COLORS)
    POW_RING[k]=[hexToRgba(POW_COLORS[k])+'.38)', hexToRgba(POW_COLORS[k])+'.5)']; }
  return POW_RING;
}
function draw(){
  if(typeof canvasContextLost!=='undefined' && canvasContextLost) return;
  const nowMs=performance.now();
  const nowS=nowMs/1000;
  const profileOn=DEBUG_FPS;
  let profileMark=profileOn?nowMs:0;
  const shk = RM?0:S.shake;
  const shx = shk>0?rand(-6,6)*shk:0, shy = shk>0?rand(-6,6)*shk:0;
  ctx.save(); ctx.translate(shx,shy);

  const h1 = 232+S.hueShift*.3, h2 = 200+S.hueShift*.3;
  ctx.fillStyle=bgGradient(h1,h2); ctx.fillRect(-20,-20,W+40,H+40);
  const lowPower = isLowPowerDevice(nowMs);
  drawNebulas(h1,h2,nowS,lowPower);
  if(profileOn){ frameProfile.bg+=performance.now()-profileMark; profileMark=performance.now(); }

  const sh = Q.level>=1, hq = Q.level>=2, uq = Q.level>=3;

  const twT = hq ? nowMs/380 : 0;
  let nStars = lowPower ? Math.min(48,bgStars.length) : (uq ? bgStars.length : Math.min(90,bgStars.length));
  if(Q.mode==='auto'){
    if(Q.fps<40) nStars=Math.max(28,Math.floor(nStars*.5));
    else if(Q.fps<48) nStars=Math.max(36,Math.floor(nStars*.7));
  }
  if(!hq) ctx.fillStyle='#cfe0ff';
  for (let si=0;si<nStars;si++){ const s=bgStars[si];
    s.y += .024*frameDt*S.speed*S.timeScale*(1+s.z);
    if (s.y>1) s.y-=1;
    ctx.globalAlpha = .25+s.z*.55 + (hq ? Math.sin(twT+s.x*40)*(uq?.16:.12) : 0);
    const sx=s.x*W, sy=s.y*H;
    if(hq){
      const hh=(s.x*6.13+s.z*3.7)%1;
      const sp=starDot(hh<.16?'w':hh<.38?'c':'b');
      const sz=s.s*(s.z>0.82?(uq?5.2:4.6):(uq?3.8:3.4));
      ctx.drawImage(sp,sx-sz/2,sy-sz/2,sz,sz);
    } else {
      ctx.fillRect(sx, sy, s.s, s.s);
    }
    if (hq && s.z>0.82){
      const fl=1.4+Math.sin(twT*1.3+s.x*40)*.7;
      ctx.strokeStyle='rgba(220,235,255,.3)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx-3*fl,sy); ctx.lineTo(sx+3*fl,sy);
      ctx.moveTo(sx,sy-3*fl); ctx.lineTo(sx,sy+3*fl); ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
  if(profileOn){ frameProfile.stars+=performance.now()-profileMark; profileMark=performance.now(); }

  planetSky(nowS);
  if(profileOn){ frameProfile.sky+=performance.now()-profileMark; profileMark=performance.now(); }

  if (screenName!=='game' && screenName!=='pause'){
    drawFx(hq,sh);
    if(profileOn){ frameProfile.fx+=performance.now()-profileMark; frameProfile.n++; profileReport(); }
    ctx.restore(); return;
  }

  for (const s of stars){
    if(!inView(s.x,s.y,32,32)) continue;
    const glow = 6+Math.sin(s.ph)*3;
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.ph*.3);
    ctx.globalAlpha=.55+Math.sin(s.ph)*.18; ctx.drawImage(starGlow(),-15,-15,30,30); ctx.globalAlpha=1;
    ctx.fillStyle=juicy('#ffe9a8','color(display-p3 1 .93 .62)');
    ctx.beginPath();
    for(let i=0;i<8;i++){ const a=i/8*6.283, r=i%2?4:9+glow*.3;
      ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); }
    ctx.closePath(); ctx.fill();
    if(sh){
      ctx.fillStyle='#fffbe8'; ctx.beginPath(); ctx.arc(0,0,2.4,0,6.283); ctx.fill();
    }
    if(uq){
      ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
    }
    ctx.restore();
  }
  goldDraw();

  const PR=powRing();
  for (const p of powerups){
    if(!inView(p.x,p.y,32,36)) continue;
    ctx.save(); ctx.translate(p.x, p.y+Math.sin(p.ph)*3);
    const col=POW_COLORS[p.kind];
    ctx.globalAlpha=.85; ctx.drawImage(powGlow(col),-20,-20,40,40); ctx.globalAlpha=1;
    ctx.fillStyle='rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(0,0,p.r+3,0,6.283); ctx.fill();
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke();
    if(sh){
      ctx.strokeStyle=PR[p.kind][0]; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,p.r+8+Math.sin(p.ph*1.3)*2,0,6.283); ctx.stroke();
    }
    if(uq){
      ctx.strokeStyle=PR[p.kind][1]; ctx.lineWidth=1;
      ctx.setLineDash([4,6]); ctx.lineDashOffset=p.ph*8;
      ctx.beginPath(); ctx.arc(0,0,p.r+13,0,6.283); ctx.stroke(); ctx.setLineDash([]);
    }
    drawGlyph(ctx,p.kind,col); ctx.restore();
  }

  for (const o of obstacles){
    const ovx=(o.kind==='gate')?(o.gap/2+o.r+28):((o.w&&o.h)?(o.w*.6+22):(o.r+22));
    const ovy=(o.w&&o.h)?(o.h*.6+22):(o.r+22);
    if(!inView(o.x,o.y,ovx,ovy)) continue;
    ctx.save(); ctx.translate(o.x,o.y); ctx.rotate(o.rot);
    if (o.kind==='debris'){
      const sk=o.skin||0, hw=o.w/2, hh=o.h/2;
      if(sh){ ctx.globalAlpha=.4; ctx.drawImage(powGlow('#aebbd2'),-hw-9,-hh-9,o.w+18,o.h+18); ctx.globalAlpha=1; }
      const qh=Math.round(hh*4)/4, mgk='dbr'+qh+(sk===3?'a':'b'); let mg=gradCache[mgk];
      if(!mg){ mg=ctx.createLinearGradient(0,-qh,0,qh);
        mg.addColorStop(0,sk===3?'#d2dbeb':'#cdd7ea'); mg.addColorStop(.4,sk===3?'#aeb9d0':'#a9b6cf'); mg.addColorStop(1,'#7e8ba4'); gradPut(mgk,mg); }
      ctx.fillStyle=mg;
      if(sk===1){
        ctx.save(); ctx.rotate(.14); rr(ctx,-hw,-hh,hw+1,o.h,3); ctx.fill(); ctx.restore();
        ctx.save(); ctx.rotate(-.14); rr(ctx,-1,-hh,hw+1,o.h,3); ctx.fill(); ctx.restore();
        ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=1.1;
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+2); ctx.lineTo(-2,-hh-1);
        ctx.moveTo(2,-hh-1); ctx.lineTo(hw-4,-hh+2); ctx.stroke();
        ctx.fillStyle='rgba(20,28,52,.3)';
        ctx.beginPath(); ctx.arc(-o.w*.26,2,1.1,0,6.283); ctx.arc(o.w*.26,2,1.1,0,6.283); ctx.fill();
      } else if(sk===2){
        rr(ctx,-hw,-hh,o.w,o.h,3.5); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+1); ctx.lineTo(hw-4,-hh+1); ctx.stroke();
        ctx.strokeStyle='#9fabca'; ctx.lineWidth=2.4; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(8,-hh+2); ctx.stroke();
        ctx.fillStyle='#d8e0ee'; ctx.beginPath(); ctx.arc(9,-hh+1.5,2,0,6.283); ctx.fill();
      } else if(sk===3){
        rr(ctx,-hw,-hh,o.w,o.h,hh); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-hw+8,-hh+2); ctx.lineTo(hw-8,-hh+2); ctx.stroke();
        ctx.strokeStyle='rgba(20,28,52,.3)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-10,-hh+2); ctx.lineTo(-10,hh-2);
        ctx.moveTo(10,-hh+2); ctx.lineTo(10,hh-2); ctx.stroke();
        if(sh){ ctx.drawImage(powGlow('#ffe2b0'),hw-14,-5,10,10);
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-9,0,1.4,0,6.283); ctx.fill(); }
      } else {
        rr(ctx,-hw,-hh,o.w,o.h,3.5); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.lineWidth=1.2;
        ctx.beginPath(); ctx.moveTo(-hw+4,-hh+1); ctx.lineTo(hw-4,-hh+1); ctx.stroke();
        ctx.strokeStyle='rgba(20,28,52,.28)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-hw+3,2); ctx.lineTo(hw-3,2); ctx.stroke();
        ctx.fillStyle='rgba(20,28,52,.35)';
        for(const px of [-hw+8,-8,8,hw-8]){ ctx.beginPath(); ctx.arc(px,-3,1.1,0,6.283); ctx.fill(); }
        if(sh){ ctx.drawImage(powGlow('#ffe2b0'),hw-12,-8,12,12);
          ctx.fillStyle='rgba(255,236,200,.9)'; ctx.beginPath(); ctx.arc(hw-6,-2,1.5,0,6.283); ctx.fill(); }
      }
    } else if (o.kind==='mine' || o.kind==='seeker'){
      const col = o.kind==='seeker' ? '#ffa53a' : '#ff5f6d';
      const colBase = hexToRgba(col);
      const pl=1+Math.sin(o.pulse)*.12;
      ctx.scale(pl,pl);
      ctx.globalAlpha=sh?1:.8; ctx.drawImage(powGlow(col),-o.r-12,-o.r-12,(o.r+12)*2,(o.r+12)*2); ctx.globalAlpha=1;
      ctx.fillStyle='#3a2430';
      ctx.beginPath(); ctx.arc(0,0,o.r,0,6.283); ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.stroke();
      ctx.globalAlpha=.55+.45*Math.sin(o.pulse*2);
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(0,0,4,0,6.283); ctx.fill();
      ctx.globalAlpha=1;
      if(sh){
        ctx.strokeStyle=partCol(colBase,.35); ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,o.r*.55,0,6.283); ctx.stroke();
      }
      if(uq){
        ctx.strokeStyle=partCol(colBase,.55); ctx.lineWidth=1.2;
        ctx.setLineDash([5,7]); ctx.lineDashOffset=-nowMs/40;
        ctx.beginPath(); ctx.arc(0,0,o.r+7,0,6.283); ctx.stroke(); ctx.setLineDash([]);
      }
      for(let i=0;i<6;i++){ const a=i/6*6.283;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*o.r,Math.sin(a)*o.r);
        ctx.lineTo(Math.cos(a)*(o.r+6),Math.sin(a)*(o.r+6)); ctx.stroke(); }
      if (o.kind==='seeker'){
        ctx.strokeStyle='rgba(255,165,58,.5)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,o.r+11,0,6.283); ctx.stroke();
      }
    } else if (o.kind==='sat'){
      const sk=o.skin||0, r2=o.r;
      if(sh){ ctx.globalAlpha=.6; ctx.drawImage(powGlow('#78b4ff'),-r2,-r2,r2*2,r2*2); ctx.globalAlpha=1; }
      const satPanel=(px,py,pw,ph2)=>{ const qy=Math.round(py*4)/4, qh2=Math.round(ph2*4)/4;
        const k='sp'+qy+'_'+qh2; let g=gradCache[k];
        if(!g){ g=ctx.createLinearGradient(0,qy,0,qy+qh2);
          g.addColorStop(0,'#4a629a'); g.addColorStop(.5,'#33487c'); g.addColorStop(1,'#263a66'); gradPut(k,g); }
        ctx.fillStyle=g; rr(ctx,px,py,pw,ph2,2.5); ctx.fill();
        ctx.strokeStyle='rgba(180,210,250,.4)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(px+2,py+.5); ctx.lineTo(px+pw-2,py+.5); ctx.stroke(); };
      const satBody=(bw,bh,brad)=>{ const qb=Math.round(bh*2)/4;
        const k='sb'+qb; let g=gradCache[k];
        if(!g){ g=ctx.createLinearGradient(0,-qb,0,qb);
          g.addColorStop(0,'#8ea6d8'); g.addColorStop(.45,'#6c83b8'); g.addColorStop(1,'#4c5f8e'); gradPut(k,g); }
        ctx.fillStyle=g; rr(ctx,-bw/2,-bh/2,bw,bh,brad); ctx.fill();
        ctx.strokeStyle='rgba(220,235,255,.4)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(-bw/2+3,-bh/2+.5); ctx.lineTo(bw/2-3,-bh/2+.5); ctx.stroke(); };
      const satBeacon=(bx,by)=>{ ctx.globalAlpha=.4+.6*Math.abs(Math.sin(o.ph*2.2));
        if(sh) ctx.drawImage(powGlow('#ff7a6a'),bx-6,by-6,12,12);
        ctx.fillStyle='#ff8a7a'; ctx.beginPath(); ctx.arc(bx,by,2,0,6.283); ctx.fill(); ctx.globalAlpha=1; };
      const satLens=(lx,ly,lr2)=>{ const qx=Math.round(lx*4)/4, qy2=Math.round(ly*4)/4, qr=Math.round(lr2*4)/4;
        const k='sl'+qx+'_'+qy2+'_'+qr; let g=gradCache[k];
        if(!g){ g=ctx.createRadialGradient(qx-2,qy2-2,1,qx,qy2,qr||.1);
          g.addColorStop(0,'#f4f8ff'); g.addColorStop(1,'#b9c8ec'); gradPut(k,g); }
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(lx,ly,lr2,0,6.283); ctx.fill(); };
      if(sk===1){
        satPanel(-r2*1.9,-r2*.14,r2*1.05,r2*.28); satPanel(r2*.85,-r2*.14,r2*1.05,r2*.28);
        satPanel(-r2*.14,-r2*.9,r2*.28,r2*.55);
        satBody(r2*1.3,r2*1.3,3); satBeacon(0,-r2*.86); satLens(0,0,r2*.3);
      } else if(sk===2){
        satPanel(-r2*1.9,-r2*.26,r2*.8,r2*.52); satPanel(r2*1.1,-r2*.26,r2*.8,r2*.52);
        satBody(r2*1.5,r2*1.0,8);
        ctx.strokeStyle='#9fabca'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(0,-r2*.5); ctx.lineTo(0,-r2*.78); ctx.stroke();
        const qd=Math.round(r2*4)/4, dk='sd'+qd; let g=gradCache[dk];
        if(!g){ g=ctx.createLinearGradient(0,-qd*1.05,0,-qd*.7);
          g.addColorStop(0,'#8ea6d8'); g.addColorStop(1,'#4c5f8e'); gradPut(dk,g); }
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,-r2*.78,r2*.26,Math.PI,0); ctx.fill();
        satBeacon(r2*.42,-r2*.4); satLens(0,2,r2*.24);
      } else if(sk===3){
        satPanel(-r2*1.9,-r2*.2,r2*.8,r2*.4);
        satBody(r2*2.1,r2*.85,9);
        ctx.fillStyle='rgba(20,28,52,.35)'; ctx.beginPath(); ctx.arc(r2*.62,0,r2*.3,0,6.283); ctx.fill();
        ctx.fillStyle='rgba(150,200,255,.5)'; ctx.beginPath(); ctx.arc(r2*.62,0,r2*.16,0,6.283); ctx.fill();
        satBeacon(-r2*.5,-r2*.5); satLens(-r2*.15,0,r2*.2);
      } else {
        satPanel(-r2*1.9,-r2*.32,r2*.85,r2*.64); satPanel(r2*1.05,-r2*.32,r2*.85,r2*.64);
        satBody(r2*1.8,r2*1.1,4); satBeacon(0,-r2*.75); satLens(0,0,r2*.28);
      }
    } else if (o.kind==='comet'){
      const tx=-o.vx*7, ty=-o.vy*7;
      if(sh) ctx.globalCompositeOperation='lighter';
      const tk=tx*4096+ty;
      if(!o._tg || o._tgk!==tk){
        o._tg=ctx.createLinearGradient(0,0,tx,ty); o._tgk=tk;
        o._tg.addColorStop(0,'rgba(255,220,150,.85)'); o._tg.addColorStop(1,'rgba(255,120,60,0)');
      }
      ctx.strokeStyle=o._tg; ctx.lineWidth=o.r*1.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(tx,ty); ctx.stroke();
      if(sh) ctx.globalCompositeOperation='source-over';
      if(uq){
        ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=.5;
        ctx.strokeStyle='#ffe9c0'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(0,0,o.r+3+Math.sin(nowMs/300)*1.5,0,6.283); ctx.stroke();
        ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
      }
      ctx.globalAlpha=.9; ctx.drawImage(powGlow('#ffd28f'),-20,-20,40,40); ctx.globalAlpha=1;
      ctx.fillStyle='#fff3d8'; ctx.beginPath(); ctx.arc(0,0,o.r,0,6.283); ctx.fill();
      ctx.fillStyle='#ffcf8f'; ctx.beginPath(); ctx.arc(-o.r*.2,-o.r*.2,o.r*.45,0,6.283); ctx.fill();
    } else if (o.kind==='gate'){
      const g2=o.gap/2;
      if(sh){
        ctx.strokeStyle='rgba(159,232,255,.22)'; ctx.lineWidth=6;
        ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
        ctx.globalAlpha=.55;
        for (const sgn of SGN2) ctx.drawImage(powGlow('#9fe8ff'),sgn*g2-o.r-6,-o.r-6,(o.r+6)*2,(o.r+6)*2);
        ctx.globalAlpha=1; }
      if(sh && !o.passed){
        ctx.setLineDash([7,7]); ctx.lineDashOffset=-nowMs/28;
      }
      ctx.strokeStyle=o.passed?'rgba(159,232,255,.25)':'rgba(159,232,255,.8)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-g2,0); ctx.lineTo(g2,0); ctx.stroke();
      if(sh) ctx.setLineDash([]);
      ctx.fillStyle='#3d5a80';
      for (const sgn of SGN2){
        ctx.beginPath(); ctx.arc(sgn*g2,0,o.r,0,6.283); ctx.fill();
        ctx.strokeStyle='#9fe8ff'; ctx.lineWidth=2; ctx.stroke();
        if(sh){
          ctx.strokeStyle='rgba(159,232,255,.35)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.arc(sgn*g2,0,o.r*.55,0,6.283); ctx.stroke();
        }
        ctx.fillStyle='#9fe8ff'; ctx.beginPath(); ctx.arc(sgn*g2,0,3,0,6.283); ctx.fill();
        ctx.fillStyle='#3d5a80';
      }
    } else {
      ctx.fillStyle=planetRockTint(o);
      ctx.strokeStyle='rgba(200,215,240,.35)'; ctx.lineWidth=1.5;
      if(!o._path){
        const pth=new Path2D();
        o.verts.forEach((v,i)=>{ const x=Math.cos(v.a)*v.r*o.r, y=Math.sin(v.a)*v.r*o.r;
          i?pth.lineTo(x,y):pth.moveTo(x,y); });
        pth.closePath(); o._path=pth;
      }
      ctx.fill(o._path); ctx.stroke(o._path);
      ctx.save(); ctx.clip(o._path);
      if(sh){
        ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,o.r*.9,-2.7,-1.2); ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.07)';
        ctx.beginPath(); ctx.arc(o.r*.3,o.r*.25,o.r*.22,0,6.283); ctx.fill();
      }
      if(uq){
        ctx.strokeStyle='rgba(0,0,0,.18)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(0,0,o.r*.85,.4,1.8); ctx.stroke();
        ctx.fillStyle='rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.arc(o.r*.15,-o.r*.35,o.r*.16,0,6.283); ctx.fill();
      }
      ctx.fillStyle='rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.arc(-o.r*.25,-o.r*.2,o.r*.3,0,6.283); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  if(profileOn){ frameProfile.field+=performance.now()-profileMark; profileMark=performance.now(); }

  if (S.bt>0 && S.timeScale<.95){
    const k=1-S.timeScale;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=k*.9;
    const g=powGlow('#8fd0ff');
    for (const o of obstacles){
      const r=o.r*3.2;
      if(!inView(o.x,o.y,r,r)) continue;
      ctx.drawImage(g,o.x-r,o.y-r,r*2,r*2);
    }
    ctx.restore();
    ctx.fillStyle='rgba(110,160,255,'+(k*.14).toFixed(3)+')';
    ctx.fillRect(0,0,W,H);
  }

  if (ghostOn){
    const gCol=(ghostForeign && SKINS[ghostSkin]) ? SKINS[ghostSkin].body : '#bfe8ff';
    ctx.save(); ctx.translate(ghostX,ghostY); ctx.globalAlpha=ghostA;
    if(hq){ ctx.globalAlpha=ghostA*.9; ctx.drawImage(powGlow(gCol),-24,-24,48,48); ctx.globalAlpha=ghostA; }
    ctx.fillStyle=gCol;
    ctx.beginPath();
    ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha=ghostA*.55;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (ghostTagT>0){
      const tag = ghostForeign ? (ghostName||'') : ((typeof L!=='undefined' && L && L.again) ? L.again : '');
      if (tag){
        ctx.save(); ctx.globalAlpha=clamp(ghostTagT,0,1)*.85;
        ctx.fillStyle=gCol; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.font='500 12px -apple-system,"Segoe UI",Roboto,sans-serif';
        ctx.fillText(String(tag).toUpperCase(), ghostX, ghostY-30);
        ctx.restore();
      }
    }
  }

  drawMorse();

  drawPlane(sh,nowMs);
  planetPlaneFx(nowS);

  drawFx(hq,sh);
  if(profileOn){ frameProfile.fx+=performance.now()-profileMark; frameProfile.n++; profileReport(); }

  if (S.dash>0){
    ctx.save();
    if(sh) ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.5+Math.sin(nowMs/(uq?90:110))*.2;
    const ar=uq?39:29;
    ctx.drawImage(powGlow('#a9bcff'),plane.x-ar,plane.y-ar,ar*2,ar*2);
    ctx.restore();
  }

  if (S.shield>0){
    const shPulse=.4+Math.sin(nowMs/150)*.2;
    ctx.save(); ctx.translate(plane.x,plane.y);
    ctx.strokeStyle=`rgba(127,216,255,${shPulse})`;
    ctx.lineWidth=2;
    if(sh){ ctx.strokeStyle='rgba(127,216,255,.18)'; ctx.lineWidth=7;
      ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
      ctx.strokeStyle=`rgba(127,216,255,${shPulse})`; ctx.lineWidth=2; }
    ctx.beginPath(); ctx.arc(0,0,30,0,6.283); ctx.stroke();
    if(hq){
      ctx.strokeStyle='rgba(127,216,255,.35)'; ctx.lineWidth=1.5;
      ctx.setLineDash([5,8]); ctx.lineDashOffset=nowMs/35;
      ctx.beginPath(); ctx.arc(0,0,37,0,6.283); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  ctx.restore();

  if(hq) ctx.drawImage(vignetteSprite(),0,0,W,H);

  if (S.flash>0 && !RM){
    const fk=S.flash/.45;
    ctx.fillStyle=juicy('rgba(255,240,168,'+(fk*.3).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.3).toFixed(3)+')'); ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=juicy('rgba(255,240,168,'+(fk*.75).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.75).toFixed(3)+')'); ctx.lineWidth=2+5*fk;
    ctx.beginPath(); ctx.arc(plane.x,plane.y,(1-fk)*Math.max(W,H)+30,0,6.283); ctx.stroke();
    if(uq){
      ctx.strokeStyle=juicy('rgba(255,240,168,'+(fk*.4).toFixed(3)+')','color(display-p3 1 .96 .7 / '+(fk*.4).toFixed(3)+')'); ctx.lineWidth=1+3*fk;
      ctx.beginPath(); ctx.arc(plane.x,plane.y,(1-fk)*Math.max(W,H)*.7+30,0,6.283); ctx.stroke();
    }
    ctx.restore();
  }

  if (DEBUG_FPS){
    const el=$('fpsPill');
    if(el){
      el.style.display='block';
      if(!el.dataset.profile) el.textContent = Q.fps.toFixed(0)+' fps · Q'+Q.level+' · p'+particles.length;
    }
  }
}

const echoBuf=[];
function echoReset(){ echoBuf.length=0; }
function drawEchoTrail(skin){
  const n=echoBuf.length, marks=[[n-16,.13],[n-32,.06]];
  for(let i=0;i<2;i++){
    const idx=marks[i][0]; if(idx<0) continue;
    const e=echoBuf[idx];
    ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(e.bank*.55);
    ctx.globalAlpha=marks[i][1];
    ctx.fillStyle=skin.body;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function morsePos(buf,a){
  if (a<=buf[0][2]) return [buf[0][0],buf[0][1],0];
  for (let i=1;i<buf.length;i++){
    if (buf[i][2]>=a){
      const p=buf[i-1], q=buf[i], d=q[2]-p[2], f=d>0?(a-p[2])/d:0;
      return [p[0]+(q[0]-p[0])*f, p[1]+(q[1]-p[1])*f, Math.atan2(q[1]-p[1],q[0]-p[0])];
    }
  }
  const l=buf[buf.length-1]; return [l[0],l[1],0];
}
function morseGlyphs(buf,elems,pl,colA){
  if (!elems || !elems.length || !pl || buf.length<2) return;
  const arcMin=buf[0][2], arcMax=buf[buf.length-1][2];
  if (arcMax-arcMin<MORSE_UNIT) return;
  const cycle=pl*MORSE_UNIT;
  const c0=Math.max(0,Math.floor(arcMin/cycle)), c1=Math.floor(arcMax/cycle);
  ctx.lineCap='round';
  for (let c=c0;c<=c1;c++){
    for (const el of elems){
      const a0=(c*pl+el.off)*MORSE_UNIT, a1=a0+el.len*MORSE_UNIT;
      if (a0<arcMin || a1>arcMax) continue;
      const mid=(a0+a1)/2, pos=morsePos(buf,mid);
      const age=(mid-arcMin)/(arcMax-arcMin);
      if (el.k==='dot'){
        ctx.fillStyle=colA(age);
        ctx.beginPath(); ctx.arc(pos[0],pos[1],2.8,0,6.2832); ctx.fill();
      } else {
        const hl=el.len*MORSE_UNIT*.4, ca=Math.cos(pos[2]), sa=Math.sin(pos[2]);
        ctx.strokeStyle=colA(age); ctx.lineWidth=4.5;
        ctx.beginPath(); ctx.moveTo(pos[0]-ca*hl,pos[1]-sa*hl); ctx.lineTo(pos[0]+ca*hl,pos[1]+sa*hl); ctx.stroke();
      }
    }
  }
}
const morseColCache={};
function morseCol(prefix, v){
  const q=v<=0?0:(v>=1?20:Math.round(v*20));
  const k=prefix+q;
  let s=morseColCache[k];
  if(!s){ s=prefix+(q/20).toFixed(2)+')'; morseColCache[k]=s; }
  return s;
}
function drawMorse(){
  if (!S.running || typeof morseBuf==='undefined' || typeof morseElems==='undefined') return;
  const skin=SKINS[S.skin]||SKINS[0];
  morseGlyphs(morseBuf, morseElems, morsePat.length, f=>morseCol(skin.trail, 0.18+0.6*f));
  if (ghostOn && ghostA>0)
    morseGlyphs(ghostMorseBuf, ghostMorseElems, ghostMorsePat.length, f=>morseCol('rgba(190,220,255,', ghostA*(0.5+2*f)));
}

function drawPlane(sh,nowMs){
  const p=plane, skin=SKINS[S.skin]||SKINS[0], hq=Q.level>=2, uq=Q.level>=3;
  const fx=skin.fx||'';
  nowMs=typeof nowMs==='number'?nowMs:performance.now();
  const ghostA=(fx==='ghost'&&hq)? .65+.1*Math.sin(nowMs/300) : 1;
  if(fx==='ghost'&&hq){ drawEchoTrail(skin);
    if(S.running&&!S.paused){ echoBuf.push({x:p.x,y:p.y,bank:p.bank}); if(echoBuf.length>40) echoBuf.shift(); } }
  ctx.save(); ctx.translate(p.x,p.y);
  if (S.invuln>0 && S.invuln<1e8 && invulnDim()) ctx.globalAlpha=(RM?.6:.35)*ghostA;
  else if(ghostA<1) ctx.globalAlpha=ghostA;

  if(!coneGrad){
    coneGrad = ctx.createLinearGradient(0,10,0,150);
    coneGrad.addColorStop(0,'rgba(190,220,255,.30)');
    coneGrad.addColorStop(1,'rgba(190,220,255,0)');
  }
  if(hq){
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(RM?.9:(.75+.25*Math.sin(nowMs/90)))*(S.invuln>0?.35:1);
  }
  ctx.fillStyle=coneGrad;
  ctx.beginPath(); ctx.moveTo(-6,10); ctx.lineTo(6,10);
  ctx.lineTo(34,150); ctx.lineTo(-34,150); ctx.closePath(); ctx.fill();
  if(hq){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=S.invuln>0&&invulnDim()?(RM?.6:.35):1; }

  if(hq){
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=(.30+.12*Math.sin(nowMs/70))*(S.invuln>0?.4:1)*ghostA*planetEngineK();
    ctx.drawImage(trailGlow(skin),-17,0,34,34);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=(S.invuln>0&&invulnDim()?(RM?.6:.35):1)*ghostA;
  }

  ctx.rotate(p.bank*.55);
  if(sh){ const gs=uq?58:48; ctx.globalAlpha=.85*ghostA;
    ctx.drawImage(planeGlow(skin),-gs/2,-gs/2-6,gs,gs); ctx.globalAlpha=ghostA; }
  ctx.fillStyle=sh?planeGrad(skin):skin.body;
  ctx.beginPath();
  ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  ctx.fillStyle=skin.fold;
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
  if(sh){
    ctx.strokeStyle='rgba(255,255,255,.32)'; ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.moveTo(0,-22); ctx.lineTo(16,14); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(-3,-12,2.6,5,.25,0,6.283); ctx.fill();
    ctx.globalAlpha=.6+.4*Math.sin(nowMs/70);
    ctx.fillStyle=skin.trail+'.95)';
    const er=fx==='plasma'? 3.4+1.6*Math.sin(nowMs/60) : (uq?3.2:2.6);
    ctx.beginPath(); ctx.arc(0,11,er,0,6.283); ctx.fill();
    ctx.globalAlpha=ghostA;
  }
  if(uq){
    ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(2,-18); ctx.lineTo(13,11); ctx.stroke();
  }
  if(hq && fx==='plasma'){
    const ph=nowMs/180;
    ctx.globalAlpha=(.14+.08*Math.sin(ph))*ghostA;
    ctx.fillStyle=PLASMA_HUES[Math.max(4,Math.min(32,Math.round(18+14*Math.sin(ph*.7))))];
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=ghostA;
  }
  if(hq && fx==='neon'){
    const hue=(nowMs*.06)%360|0;
    ctx.strokeStyle=NEON_HUES[hue]+(.9*ghostA)+')'; ctx.lineWidth=1.7;
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.stroke();
  }
  if(hq && fx==='chrome'){
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(-16,14); ctx.lineTo(0,6); ctx.lineTo(16,14); ctx.closePath(); ctx.clip();
    const sx=-34+((nowMs*.05)%68);
    ctx.drawImage(sheenSprite(),sx-9,-26,18,48);
    ctx.restore();
  }
  ctx.strokeStyle='rgba(120,140,180,.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,-22); ctx.lineTo(0,6); ctx.stroke();
  ctx.restore();
}

const STEP=1/60;
let acc=0, lastTime=0, rafId=0, menuDrawT=0, loopScr='', pauseT0=0, drawForce=false;
function drawKick(){ drawForce=true; }
function loop(t){
  rafId=requestAnimationFrame(loop);
  /* v1.400.3 «Ne рисуеm в пустоту»: боевой крэш (InvalidStateError, drawImage, render.js —
     «canvas element with a width or height of 0»). Корень — не в resize() (он и так честно
     отказывается при cssW<=0||cssH<=0), а в том, что на части Android-клиентов Telegram
     window.innerWidth/innerHeight в момент первого прохода скрипта сами ещё нулевые, и ни
     один resize() ещё не успел отработать, пока requestAnimationFrame уже крутит кадры.
     nebulaField() при W===0/H===0 создаёт офскрин-холст 0×0 и тут же отдаёт его в drawImage —
     падение. Ждём тихо: rAF уже перезаписан выше, следующий кадр проверит снова; как только
     где-то снаружи (уже существующий слушатель window resize, viewportChanged и т.д.)
     отработает настоящий resize(), геометрия появится и рисование продолжится само. */
  if (W<=0 || H<=0) return;
  let dt=(t-lastTime)/1000; lastTime=t;
  if(typeof pollGamepad==='function') pollGamepad();
  if(dt>0.25)dt=0.25; if(dt<0)dt=0;
  if (screenName==='game' && S.running && !S.paused) qualityTick(dt);
  else { Q._acc=0; Q._n=0; Q._t=0; }
  if (S.running && !S.paused){
    acc+=dt;
    let n=0;
    while(acc>=STEP && n<4){ update(STEP); acc-=STEP; n++; if(!S.running||S.paused){acc=0;break;} }
    if(n===4) acc=0;
  } else {
    updateFx(dt);
  }
  const scr=screenName;
  if (drawForce || scr!==loopScr){
    drawForce=false;
    if (scr!==loopScr){ loopScr=scr; if(scr==='pause') pauseT0=t; }
    frameTick(t); draw(); menuDrawT=t; return;
  }
  if (scr==='game'){ frameTick(t); draw(); return; }
  if (scr==='pause'){
    if (t-menuDrawT>=((t-pauseT0<2000)?33:250)){ frameTick(t); draw(); menuDrawT=t; }
    return;
  }
  if (t-menuDrawT>=33){ frameTick(t); draw(); menuDrawT=t; }
}
function startLoop(){ if(!rafId){ lastTime=performance.now(); rafId=requestAnimationFrame(loop); } }
function stopLoop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
