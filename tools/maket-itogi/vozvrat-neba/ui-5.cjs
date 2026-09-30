const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rx(/cardCapture\(sc,\{rec:isRecord\|\|srNewBest\}\);/,"cardCapture(sc,{rec:isRecord});",'cardCapture');
u.cut("  // 03.09.2026 «Спидран получает свою таблицу»: тот же приём, что у Трассы дня","  // 06.09.2026 «Слалом»: тот же приём, что у Спидрана","",'speedrun submit');
u.cut("  // 06.09.2026 «Биатлон»: тот же приём — S.time на этот момент уже несёт штрафы за промахи","  /* 30.09.2026 «Финиш по времени»: карточка «Ты в мире #N» для времени","",'biathlon submit');
u.rx(/    const genT=runNow\(\), tMode=S\.mode, tRsg=!!S\.speedrunRSG;\n    const tDay=\(tMode==='speedrun'\) \? \(tRsg\?SPEEDRUN_RSG_DAY:SPEEDRUN_ETERNAL_DAY\) : \(tMode==='slalom' \? SLALOM_ETERNAL_DAY : BIATHLON_ETERNAL_DAY\);\n/,"    const genT=runNow(), tMode=S.mode;\n    const tDay=SLALOM_ETERNAL_DAY;\n",'tDay');
u.rx(/      const topFn=\(tMode==='speedrun'\) \? syncSpeedrunTop : \(tMode==='slalom' \? syncSlalomTop : syncBiathlonTop\);\n/,"      const topFn=syncSlalomTop;\n",'topFn');
u.rx(/      overTimeRankFill\(d, tMode, tRsg\);/,"      overTimeRankFill(d, tMode, false);",'overTimeRankFill call');
u.save();
