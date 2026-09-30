(async()=>{ await new Promise(r=>setTimeout(r,900));
 S.relayLeg=2; OF_CHIPS=OF_CHIPS.map(h=>h.replace(/Этап \d+ сдан/,'Этап 2 сдан')); overFlightFill(); await new Promise(r=>setTimeout(r,700));
 const fl=document.getElementById('overFlight'), tot=RELAY_LEGS_TOTAL, leg=S.relayLeg;
 // 1. карточку внизу и плашку «Этап сдан» убираем
 const rk=document.getElementById('overRank'); rk.classList.add('hidden'); rk.innerHTML='';
 fl.querySelectorAll('.recRow').forEach(e=>{ if(/ЭТАП|Этап/i.test(e.textContent)) e.remove(); });
 // 2. подпись под финишем убираем, финиш — «конфетка»
 fl.querySelectorAll('.ofBox .ofCap').forEach(e=>e.remove());
 const flag='<svg viewBox="0 0 24 24" aria-hidden="true" style="width:30px;height:30px"><path d="M5.5 21V3" stroke="#3a2604" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M6.5 4h13v10h-13z" fill="#fff"/><path d="M6.5 4h3.25v3.33H6.5zM13 4h3.25v3.33H13zM9.75 7.33H13v3.34H9.75zM16.25 7.33h3.25v3.34h-3.25zM6.5 10.67h3.25V14H6.5zM13 10.67h3.25V14H13z" fill="#3a2604"/></svg>';
 fl.querySelectorAll('.ofBox .ofStk').forEach(e=>{ e.innerHTML=flag; e.style.cssText+=';width:50px;height:50px;margin:-25px 0 0 -25px;border:3px solid #fff3c4;background:radial-gradient(circle at 35% 28%,#fff0b0,#f0b83a 70%);box-shadow:0 0 0 6px rgba(255,217,102,.18),0 0 22px rgba(255,217,102,.75);'; });
 // 3. продолжение — внутри того же окна: этапы и кнопка
 const css=document.createElement('style'); css.textContent='.relFoot{margin:6px 16px 4px;padding-top:12px;border-top:1px solid rgba(155,123,224,.28)} .relRail{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:12px} .rn{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 13px/1 "Exo 2",sans-serif;color:#9fb4d8;border:2px solid rgba(155,123,224,.35);background:rgba(14,18,32,.6);box-sizing:border-box} .rn svg{width:16px;height:16px} .rn.done{color:#3a2604;border-color:#fff3c4;background:radial-gradient(circle at 35% 28%,#ffe9a0,#e3a92a 78%);box-shadow:0 0 10px rgba(240,192,64,.45)} .rn.next{color:#fff;border-color:#b79cf5;background:rgba(155,123,224,.22);box-shadow:0 0 12px rgba(155,123,224,.55)} .rl{flex:none;width:34px;height:3px;border-radius:2px;background:rgba(155,123,224,.3)} .rl.done{background:linear-gradient(90deg,#e3a92a,#ffe9a0)} .relFoot .gcGo{margin-top:0} #gameOverScreen.saNew #overFlight{padding-bottom:12px}';
 document.head.appendChild(css);
 const chk='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
 let rail=''; for(let i=1;i<=tot;i++){ const st=i<=leg?'done':(i===leg+1?'next':''); rail+=(i>1?'<i class="rl'+(i<=leg?' done':'')+'"></i>':'')+'<span class="rn '+st+'">'+(i<=leg?chk:i)+'</span>'; }
 const plane='<svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" style="width:34px;height:34px;margin:6px 0 0 6px"><path d="M3 11.5l18-8-7 18-3-7.5z"/></svg>';
 const foot=document.createElement('div'); foot.className='gcard relFoot'; foot.innerHTML='<div class="relRail" aria-label="Этапы эстафеты">'+rail+'</div><div class="gcGo"><i style="width:100%"></i><span>Продолжить эстафету</span><em>'+plane+'</em><button type="button" class="gcHit" aria-label="Продолжить эстафету"></button></div>';
 fl.appendChild(foot);
 const box=fl.querySelector('.ofBox'); if(typeof overSaPlace==='function') overSaPlace(box);
 await new Promise(r=>setTimeout(r,700));
 const R=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)]};
 return 'окно '+R('#overFlight')+' кнопки '+R('#overRow')+' плашек в пирамидке '+fl.querySelectorAll('.recRow').length; })()
