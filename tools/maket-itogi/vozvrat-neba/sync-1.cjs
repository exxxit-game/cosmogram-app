const W=require('../cutlib.cjs'); const s=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/sync.js');
s.cut("/* 03.09.2026 «Спидран получает свою таблицу»","/* 06.09.2026 «Слалом»: тот же приём Set Seed/очередь","",'Speedrun очереди и запросы');
s.cut("function syncBiathlonQueue(){","/* 06.09.2026 «Эстафета»: открытая цепочка","",'Biathlon');
s.rx(/    keys: saneScore\(Store\.get\('bestKeys',0\)\),\n    caravan: saneScore\(Store\.get\('bestCaravan',0\)\)[^\n]*\n(?:    \/\/[^\n]*\n)+/,"    keys: saneScore(Store.get('bestKeys',0))\n    // 01.10.2026: Caravan удалён — bestCaravan больше не уходит на сервер (старая запись там остаётся).\n",'syncLocalScores');
s.save();
