const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rx(/  const caravanOtherTier = S\.mode==='caravan'[^\n]*\n  const cat=caravanOtherTier\?[^\n]*\n  const modeKey=caravanOtherTier\?[^\n]*\n/,
"  const cat=(S.mode==='relay'?'relay':mode);\n  const modeKey=(S.mode==='relay'?'bestRelayLeg':(mode==='gyro'?'bestGyro':(mode==='keys'?'bestKeys':'bestTouch')));\n",'cat/modeKey');
u.rx(/  const foreignRecordMode = S\.mode==='daily'\|\|S\.mode==='speedrun'\|\|S\.mode==='slalom'\|\|S\.mode==='biathlon';/,"  const foreignRecordMode = S.mode==='daily'||S.mode==='slalom';",'foreignRecordMode');
u.cut("  let srNewBest=false;","  let slalomNewBest=false;","",'srNewBest');
u.cut("  let biathlonNewBest=false;","  // 30.09.2026 «Финиш по времени» (макет, владелец: «вноси все три режима»)","",'biathlonNewBest');
u.rx(/OF_FIN=\{ on:!!\(\(S\.mode==='speedrun'&&S\.srWin\)\|\|\(S\.mode==='slalom'&&S\.slalomWin\)\|\|\(S\.mode==='biathlon'&&S\.biathlonWin\)\), prev:finPrev, rec:!!\(srNewBest\|\|slalomNewBest\|\|biathlonNewBest\), sc:sc, raw:Math\.floor\(S\.score\), end:\(\(S\.mode==='caravan'&&S\.caravanTimeUp\)\?'caravan':\(\(S\.mode==='relay'&&S\.relayLegDone\)\?'relay':''\)\) \};/,
"OF_FIN={ on:!!(S.mode==='slalom'&&S.slalomWin), prev:finPrev, rec:!!slalomNewBest, sc:sc, raw:Math.floor(S.score), end:((S.mode==='relay'&&S.relayLegDone)?'relay':'') };",'OF_FIN');
u.rx(/const noMissNow = \(\(S\.mode==='speedrun'&&S\.srWin\) \|\| \(S\.mode==='caravan'&&S\.caravanTimeUp\) \|\| \(S\.mode==='slalom'&&S\.slalomWin\) \|\| \(S\.mode==='biathlon'&&S\.biathlonWin\) \|\| \(S\.mode==='relay'&&S\.relayLegDone\)\) && S\.hits===0;/,
"const noMissNow = ((S.mode==='slalom'&&S.slalomWin) || (S.mode==='relay'&&S.relayLegDone)) && S.hits===0;",'noMissNow');
u.rx(/  \/\/ Caravan \(05\.09\.2026\): своей медали-иконки нет[^\n]*\n  \/\/ проекта визуал идёт только через макет\.[^\n]*\n  \/\/ ниже \(recChips\)[^\n]*\n/,"",'комментарий Caravan медали');
u.rx(/  if \(isRecord && S\.mode!=='caravan' && S\.mode!=='relay'\) medals\.push\(/,"  if (isRecord && S.mode!=='relay') medals.push(",'медаль');
u.line("  if (S.mode==='caravan' && isRecord) recChips.push(",'плашка Caravan');
u.save();
