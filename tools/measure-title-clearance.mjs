#!/usr/bin/env node
/* 18.09.2026 (владелец: «что мешает сразу измерять более точно... а не по 15 раз одно и то же
   делай») — раньше проверка «не наезжает ли screenTitle на нативную кнопку "Назад" Telegram»
   делалась вручную: инжект одного маркера → просьба сфоткать → прикидка на глаз → неточность
   (разбор того же дня: маркер по старой методике давал ~76px, реальный край текста «Назад»
   оказался ~74.5px CSS на ДВУХ разных телефонах — то есть сама методика была рабочей, но
   разового прогона и общения с владельцем на каждое число уходило слишком много кругов).
   Этот скрипт делает то же самое ОДНИМ вызовом, без npm-зависимостей (только fs/zlib/child_process/
   глобальный WebSocket — уже есть в Node 22+, проект принципиально без новых npm-пакетов):
   1) инжектит в открытую страницу (через CDP, ws://localhost:PORT) линейку с делениями
      каждые 10px CSS (подписи каждые 20px) от левого края экрана и переключает на нужный экран;
   2) снимает НАСТОЯЩИЙ снимок экрана через adb screencap (не Page.captureScreenshot — тот ловит
      только то, что WebView успел закомпозить, включая «шахматку» фона для неактивной/свёрнутой
      вкладки, и НИКОГДА не видит нативную «Назад» — она рисуется поверх самим Telegram);
   3) сам разбирает PNG (минимальный декодер поверх zlib.inflateSync, без pngjs): калибрует
      физические пиксели в CSS через деления линейки (обычно ×2 dpr), находит правый край
      БЕЛОГО текста «Назад» (кластер белых пикселей в строке заголовка слева направо) — самый
      надёжный кросс-девайсный сигнал, и левый край текста заголовка сразу за ним.
   Использование:
     node tools/measure-title-clearance.mjs <deviceSerial> <cdpPort> <titleElId> <screenName> [outPngPrefix]
   Пример:
     node tools/measure-title-clearance.mjs R7STA05K3BK 9333 gratitudeTitle gratitude /c/tmp/samsung_gratitude
   Предполагает: adb forward tcp:<cdpPort> localabstract:webview_devtools_remote_<pid> уже сделан,
   и на странице уже открыт живой Cosmogram В РЕАЛЬНОМ TELEGRAM (не десктоп-браузер — нативную
   капсулу «Назад» рисует само приложение Telegram, в браузере её попросту нет). */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [serial, port, titleId, screenName, outPrefix] = process.argv.slice(2);
if (!serial || !port || !titleId || !screenName) {
  console.error('usage: node measure-title-clearance.mjs <serial> <cdpPort> <titleElId> <screenName> [outPngPrefix]');
  process.exit(1);
}
const OUT = outPrefix || `/c/tmp/measure_${screenName}_${serial}`;

async function cdpEval(pageId, expr, wsPort){
  return new Promise((resolve, reject)=>{
    const ws = new WebSocket(`ws://localhost:${wsPort}/devtools/page/${pageId}`);
    let id = 1;
    ws.addEventListener('open', ()=> ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })));
    ws.addEventListener('message', (ev)=>{ const msg = JSON.parse(ev.data); if (msg.id) { ws.close(); resolve(msg.result.result); } });
    ws.addEventListener('error', (e)=> reject(new Error('ws error')));
    setTimeout(()=> reject(new Error('cdp eval timeout')), 10000);
  });
}

/* ---- минимальный PNG-декодер: только 8-бит RGB(A), без interlace — этого достаточно для
   adb screencap. Возвращает {width,height,getPixel(x,y)->[r,g,b]}. */
function decodePng(buf){
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width=0, height=0, bitDepth=0, colorType=0;
  const idatChunks = [];
  while (off < buf.length){
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off+4, off+8);
    const dataStart = off+8;
    if (type === 'IHDR'){
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart+4);
      bitDepth = buf.readUInt8(dataStart+8);
      colorType = buf.readUInt8(dataStart+9);
    } else if (type === 'IDAT'){
      idatChunks.push(buf.subarray(dataStart, dataStart+len));
    } else if (type === 'IEND'){
      break;
    }
    off = dataStart + len + 4; // + CRC
  }
  if (bitDepth !== 8) throw new Error('only 8-bit PNG supported, got '+bitDepth);
  const channels = colorType===2 ? 3 : colorType===6 ? 4 : (()=>{throw new Error('unsupported colorType '+colorType);})();
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width*channels;
  const out = Buffer.alloc(height*stride);
  let rawOff = 0;
  for (let y=0; y<height; y++){
    const filterType = raw[rawOff]; rawOff++;
    const rowStart = y*stride;
    for (let x=0; x<stride; x++){
      const cur = raw[rawOff+x];
      const a = x>=channels ? out[rowStart+x-channels] : 0;
      const b = y>0 ? out[rowStart-stride+x] : 0;
      const c = (x>=channels && y>0) ? out[rowStart-stride+x-channels] : 0;
      let val;
      switch(filterType){
        case 0: val = cur; break;
        case 1: val = cur + a; break;
        case 2: val = cur + b; break;
        case 3: val = cur + ((a+b)>>1); break;
        case 4: { // Paeth
          const p = a+b-c;
          const pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
          const pred = (pa<=pb && pa<=pc) ? a : (pb<=pc ? b : c);
          val = cur + pred;
          break;
        }
        default: throw new Error('bad filter type '+filterType);
      }
      out[rowStart+x] = val & 0xff;
    }
    rawOff += stride;
  }
  return {
    width, height,
    getPixel(x,y){ const i=y*stride+x*channels; return [out[i], out[i+1], out[i+2]]; }
  };
}

const pagesRaw = execSync(`curl -s http://localhost:${port}/json`).toString();
const pages = JSON.parse(pagesRaw);
const page = pages.find(p=>p.type==='page') || pages[0];
if (!page){ console.error('нет доступной страницы на порту', port); process.exit(1); }
const pageId = page.id;

const RULER_JS = `(()=>{
  const old=document.getElementById('__ruler'); if(old) old.remove();
  if(typeof setScreen==='function') setScreen(${JSON.stringify(screenName)});
  const wrap=document.createElement('div'); wrap.id='__ruler';
  wrap.style.cssText='position:fixed;left:0;top:0;width:200px;height:60px;z-index:999999;pointer-events:none;';
  const top=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--js-sat')||'0');
  for(let x=0;x<=150;x+=10){
    const big=(x%20===0);
    const t=document.createElement('div');
    t.style.cssText='position:absolute;left:'+x+'px;top:'+(top-1)+'px;width:1px;height:'+(big?16:8)+'px;background:#ff00ea;';
    wrap.appendChild(t);
  }
  document.body.appendChild(wrap);
  const el=document.getElementById(${JSON.stringify(titleId)});
  const r=el?el.getBoundingClientRect():null;
  return { topInset:top, domLeft: r?r.left:null, domText: el?el.textContent:null, dpr:window.devicePixelRatio, innerWidth:window.innerWidth };
})()`;

const evalResult = await cdpEval(pageId, RULER_JS, port);
const domInfo = evalResult.value;

await new Promise(r=>setTimeout(r, 400));
execSync(`adb -s ${serial} shell screencap -p //sdcard/__measure.png`);
execSync(`adb -s ${serial} pull //sdcard/__measure.png ${OUT}.png`);
await cdpEval(pageId, `(()=>{ const e=document.getElementById('__ruler'); if(e) e.remove(); return 1; })()`, port);

const png = decodePng(readFileSync(`${OUT}.png`));
function isMagenta(r,g,b){ return r>200 && g<80 && b>150; }
function isWhitish(r,g,b){ return r>190 && g>190 && b>190; }

// 1) центры делений линейки — калибровка физический px -> CSS px
let bestY=-1, bestCount=-1;
for (let y=0; y<100; y++){ let c=0; for (let x=0; x<400; x++){ const [r,g,b]=png.getPixel(x,y); if (isMagenta(r,g,b)) c++; } if (c>bestCount){ bestCount=c; bestY=y; } }
let xs=[]; for (let x=0; x<400; x++){ const [r,g,b]=png.getPixel(x,bestY); if (isMagenta(r,g,b)) xs.push(x); }
let tickClusters=[]; let cur=[xs[0]];
for (let i=1; i<xs.length; i++){ if (xs[i]-xs[i-1]<=2) cur.push(xs[i]); else { tickClusters.push(cur); cur=[xs[i]]; } }
tickClusters.push(cur);
const tickCentersPhys = tickClusters.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
const stepPhys = tickCentersPhys.length>1 ? (tickCentersPhys[tickCentersPhys.length-1]-tickCentersPhys[0])/(tickCentersPhys.length-1) : (domInfo.dpr*10);
const physToCss = 10/stepPhys;

// 2) правый край белого текста «Назад» и левый край заголовка — строка с максимумом белых пикселей
let rows=[];
for (let y=90; y<140; y++){ let c=0; for (let x=0; x<700; x++){ const [r,g,b]=png.getPixel(x,y); if (isWhitish(r,g,b)) c++; } rows.push([y,c]); }
rows.sort((a,b)=>b[1]-a[1]);
const bandY = rows[0][0];
let colHasWhite=[];
for (let x=0; x<400; x++){ let has=false; for (let y=bandY-10; y<=bandY+10; y++){ const [r,g,b]=png.getPixel(x,y); if (isWhitish(r,g,b)){ has=true; break; } } colHasWhite.push(has); }
let clusters=[]; let curStart=null;
for (let x=0; x<colHasWhite.length; x++){ if (colHasWhite[x] && curStart===null) curStart=x; if (!colHasWhite[x] && curStart!==null){ clusters.push([curStart,x-1]); curStart=null; } }
if (curStart!==null) clusters.push([curStart, colHasWhite.length-1]);
/* 18.09.2026: угадывать порог «это уже межсловный разрыв, не межбуквенный» по одним пикселям
   ненадёжно — внутри «Назад» разрывы между буквами (3-14 физ.px) и разрыв до иконки-стрелки
   (~33 физ.px) могут быть БОЛЬШЕ настоящего межсловного разрыва (~23 физ.px). Вместо этого
   берём координату начала заголовка из живого DOM (domLeftCss, getBoundingClientRect — точно,
   без гадания) как якорь: ищем кластер белых пикселей, чьё начало ближе всего к этой точке —
   это и есть первая буква заголовка; «Назад» кончается на конце предыдущего кластера. */
let nazadEndPhys=null, titleStartPhys=null;
if (domInfo.domLeft != null && clusters.length){
  const domLeftPhys = domInfo.domLeft / physToCss;
  let bestIdx=-1, bestDist=Infinity;
  clusters.forEach((c,i)=>{ const d=Math.abs(c[0]-domLeftPhys); if (d<bestDist){ bestDist=d; bestIdx=i; } });
  titleStartPhys = clusters[bestIdx][0];
  if (bestIdx>0) nazadEndPhys = clusters[bestIdx-1][1];
}

const report = {
  device: serial, screen: screenName, titleId,
  domLeftCss: domInfo.domLeft, domText: domInfo.domText, dpr: domInfo.dpr,
  calibration: { tickCentersPhys, stepPhys, physToCssFactor: physToCss },
  nazadTextEndCss: nazadEndPhys!=null ? +(nazadEndPhys*physToCss).toFixed(1) : null,
  titleTextStartCss: titleStartPhys!=null ? +(titleStartPhys*physToCss).toFixed(1) : null,
  gapCss: (nazadEndPhys!=null && titleStartPhys!=null) ? +((titleStartPhys-nazadEndPhys)*physToCss).toFixed(1) : null,
  screenshotPath: `${OUT}.png`,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 2));
