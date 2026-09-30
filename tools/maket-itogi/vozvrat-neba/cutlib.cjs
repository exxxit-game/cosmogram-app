// Инструмент вырезки: точные замены и блоки между маркерами; всё уникально, иначе стоп.
// Работает с текстом, приведённым к LF; при сохранении возвращает CRLF, если файл был CRLF.
const fs=require('fs');
module.exports=function(file){
  const raw=fs.readFileSync(file,'utf8'); const crlf=raw.includes('\r\n');
  let s=raw.replace(/\r\n/g,'\n'); const log=[];
  const n=x=>String(x).replace(/\r\n/g,'\n');
  const count=(a)=>s.split(a).length-1;
  return {
    rep(a,b,label){ a=n(a); b=n(b); const c=count(a); if(c!==1) throw new Error('rep не одно ('+c+'): '+(label||a.slice(0,60))); s=s.replace(a,()=>b); log.push('rep '+(label||'')); },
    // удалить от start (включительно) до end (НЕ включая end); вместо вставить repl
    cut(start,end,repl,label){ start=n(start); end=n(end); const c1=count(start); if(c1!==1) throw new Error('cut start не один ('+c1+'): '+(label||start.slice(0,60))); const i=s.indexOf(start); const j=s.indexOf(end,i+start.length); if(j<0) throw new Error('cut end не найден: '+(label||end.slice(0,60))); const removed=s.slice(i,j); s=s.slice(0,i)+n(repl||'')+s.slice(j); log.push('cut '+(label||'')+' (−'+removed.split('\n').length+' строк)'); },
    // удалить одну строку целиком по уникальному началу строки
    line(startsWith,label){ const a=n(startsWith); const c=count(a); if(c!==1) throw new Error('line не одна ('+c+'): '+(label||startsWith.slice(0,60))); const i=s.indexOf(a); const ls=s.lastIndexOf('\n',i)+1; let le=s.indexOf('\n',i); le=le<0?s.length:le+1; s=s.slice(0,ls)+s.slice(le); log.push('line '+(label||'')); },
    // замена по регулярному выражению, совпадение ровно одно
    rx(re,repl,label){ const r=new RegExp(re.source,re.flags.replace('g','')+'g'); const m=s.match(r); const c=m?m.length:0; if(c!==1) throw new Error('rx не одно ('+c+'): '+(label||re.source.slice(0,60))); s=s.replace(re,()=>n(repl)); log.push('rx '+(label||'')); },
    save(){ fs.writeFileSync(file, crlf ? s.replace(/\n/g,'\r\n') : s); console.log(file+': '+log.length+' правок\n  '+log.join('\n  ')); },
    text(){ return s; }
  };
};
