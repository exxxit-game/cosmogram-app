import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
/* Тот же поиск playwright, что и в guard.mjs: пакет стоит глобально, а не рядом с проектом. */
const chromium = (()=>{ const req=createRequire(import.meta.url); const tries=[];
  try{ tries.push(execSync('npm root -g',{encoding:'utf8'}).trim()); }catch(e){}
  tries.push('/opt/node-tools/node_modules','/usr/lib/node_modules','/usr/local/lib/node_modules');
  for(const b of tries){ try{ return req(path.join(b,'playwright')).chromium; }catch(e){} }
  return req('playwright').chromium; })();
const ROOT='/root/cosmo';
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain','.md':'text/markdown'};
const srv=http.createServer((q,r)=>{ let f=path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{ if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); r.end(d); }); });
await new Promise(res=>srv.listen(0,res)); const port=srv.address().port;
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p=await ctx.newPage(); const seen=new Map();
p.on('response', async res=>{ try{ const buf=await res.body(); seen.set(res.url().split('?')[0], buf.length); }catch(e){} });
await ctx.route('**://telegram.org/**', r=>r.abort());
await p.goto('http://127.0.0.1:'+port+'/', {waitUntil:'load', timeout:20000});
await p.waitForTimeout(4000);
let total=0; const rows=[];
for(const [u,n] of seen){ const rel=u.replace('http://127.0.0.1:'+port+'/',''); total+=n; rows.push([rel||'index.html', n]); }
rows.sort((a,b)=>b[1]-a[1]);
console.log('Файлов скачано: '+rows.length+' · всего '+(total/1024).toFixed(0)+' КБ');
for(const [r,n] of rows) console.log('  '+String((n/1024).toFixed(1)).padStart(7)+' КБ  '+r);
await b.close(); srv.close();
