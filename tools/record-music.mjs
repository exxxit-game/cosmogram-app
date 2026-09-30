/* Перезапись музыки (28.09.2026). Музыка в игре — готовые записи music/*.mp3, сделанные ЭТИМ скриптом из
   партитуры и синтезатора в js/music.js (music._synth). Если меняется партитура или синтезатор —
   перезаписать: node tools/record-music.mjs, затем поднять REC в js/music.js и MUSIC_REC в sw.js
   (страж 364 сверяет, что они равны), иначе у игроков останутся старые записи в кэше.
   Нужны: Playwright с Chromium (как у стражей) и ffmpeg с libmp3lame в PATH (или FFMPEG=путь).
   Куски по 8 тактов (65–75 — один кусок: финал+затишье), у каждого свой хвост эха до −80 дБ;
   хранится сумма голосов ДО мастера на ×0.5 (мастер — живой, в игре). MP3 128 кбит/с — решение
   владельца после слепого теста. Коды «рекорд»/«смерть» — отдельными файлами.
   Повтор записи НЕ бит в бит: проверено 28.09.2026 — новая запись того же куска отличается от прежней
   на −41.6 дБ (тише шума самого MP3 128 кбит/с, ~−26 дБ); причина не выяснена. */
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let chromium; try{ ({ chromium }=await import('playwright')); }catch(e){
  const glob=process.env.APPDATA?path.join(process.env.APPDATA,'npm','node_modules')+path.sep:'/opt/node22/lib/node_modules/'; // Windows: глобальный npm
  ({ chromium }=createRequire(glob)('playwright')); }
/* 30.09.2026: SR=44100 → второй набор в music/44/ для телефонов, у которых звук на 44 100 (Samsung A03:
   файл 48 000 раскодировался с пересчётом частоты 4 150 мс вместо 480, страж 365). Умолчание — 48 000 в music/.
   Синтезатор ВСЕГДА играет на 48 000: на другой частоте его шум (барабаны) и эхо строятся из тех же случайных
   чисел иначе — музыка получается другая (владелец услышал 30.09; по волне −1.5 дБ). Для 44 100 готовая запись
   48 000 только пересчитывается по частоте (soxr) перед сжатием в MP3. */
const SR=48000, OUT_SR=+(process.env.SR||48000);
const FF=process.env.FFMPEG||'ffmpeg', BAR=60*4/128, TAIL=4, OUT=path.join(ROOT,'music',OUT_SR===44100?'44':'');
const src=fs.readFileSync(path.join(ROOT,'js','music.js'),'utf8').split('const engine=')[0];
const chunks=[[1,8],[9,16],[17,24],[25,32],[33,40],[41,48],[49,56],[57,64],[65,75]]; for(let a=76;a<=179;a+=8) chunks.push([a,Math.min(179,a+7)]);
const jobs=chunks.map(([a,b])=>({name:'c'+String(a).padStart(3,'0'),a,b})).concat([{name:'sting_record',kind:'record'},{name:'sting_death',kind:'death'}]);
fs.mkdirSync(OUT,{recursive:true});
const br=await chromium.launch(); let next=0;
await Promise.all(Array.from({length:+(process.env.PAGES||4)},async()=>{ const p=await br.newPage(); // PAGES=2 — легче для слабого ноутбука
  await p.addScriptTag({content:"var MUTED=false,AC=null,S={mission:1,dist:0};function audio(){return AC} function audioOut(a){return a.destination}\n"+src});
  while(next<jobs.length){ const j=jobs[next++];
    const b64=await p.evaluate(async([j,SR,BAR,TAIL])=>{
      const dur=j.kind?3.5+TAIL:(j.b-j.a+1)*BAR+TAIL, off=new OfflineAudioContext(2,Math.ceil(dur*SR),SR), s=music._synth(off,off.destination);
      if(j.kind) s.sting(0,j.kind); else for(let k=j.a;k<=j.b;k++) s.bar(k,(k-j.a)*BAR);
      const B=await off.startRendering(), L=B.getChannelData(0), R=B.getChannelData(1); let last=0;
      for(let i=0;i<L.length;i++) if(Math.max(Math.abs(L[i]),Math.abs(R[i]))>1e-4) last=i;
      const n=Math.min(L.length,last+Math.round(.05*SR)), f=new Float32Array(n*2); for(let i=0;i<n;i++){ f[2*i]=L[i]*.5; f[2*i+1]=R[i]*.5; }
      let bin=''; const u=new Uint8Array(f.buffer); for(let i=0;i<u.length;i+=32768) bin+=String.fromCharCode.apply(null,u.subarray(i,i+32768)); return btoa(bin);
    },[j,SR,BAR,TAIL]);
    const raw=path.join(OUT,j.name+'.f32'); fs.writeFileSync(raw,Buffer.from(b64,'base64'));
    execFileSync(FF,['-v','error','-y','-f','f32le','-ar',String(SR),'-ac','2','-i',raw,...(OUT_SR!==SR?['-af','aresample='+OUT_SR+':resampler=soxr:precision=28']:[]),'-c:a','libmp3lame','-b:a','128k',path.join(OUT,j.name+'.mp3')]);
    fs.unlinkSync(raw); console.log(j.name); }
  await p.close(); }));
await br.close(); console.log('готово:',jobs.length,'записей в music/');
