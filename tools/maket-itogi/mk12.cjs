const fs=require('fs');
let s=fs.readFileSync('dcopy/js/ui.js','utf8');
if(!s.includes("mode==='slalom')") ){ const a="mode==='caravan'||mode==='speedrun'),"; if(!s.includes(a)) throw new Error('нет sa'); s=s.replace(a,()=>"mode==='caravan'||mode==='speedrun'||mode==='slalom'),"); fs.writeFileSync('dcopy/js/ui.js',s); }
let m=fs.readFileSync('mk11.cjs','utf8');
function r(a,b,l){ if(!m.includes(a)) throw new Error('нет: '+l); m=m.split(a).join(b); }
r("cat:'speedrun'","cat:'slalom'",'cat');
r("val:'9:59'","val:'2:59'",'val');
r("−60 с к рекорду","−20 с к рекорду",'delta');
r("<span>Цель 10 000</span><b>Не хватило 1</b>","<span>Дистанция 4 500 м</span><b>Не хватило 1 м</b>",'goal');
r("rgba(255,122,61,.28)","rgba(95,240,232,.3)",'c1');
r("linear-gradient(90deg,#ff7a3d,#ffb27a)","linear-gradient(90deg,#2fd6cf,#7ff5ee)",'c3');
r("#ffb27a","#7ff5ee",'c2');
r("p-spw","p-slw",'w'); r("p-spd","p-slf",'d');
fs.writeFileSync('mk12.tmp.cjs',m);
console.log('ok');
