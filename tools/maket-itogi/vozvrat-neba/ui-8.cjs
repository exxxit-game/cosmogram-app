const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rx(/: cat==='dist'\?'bestDist' : cat==='caravan'\?'bestCaravan' : null;/,": cat==='dist'?'bestDist' : null;",'myBestFor');
u.rx(/    : \(askCat==='speedrun' && typeof syncSpeedrunTop==='function'\)\n    \? syncSpeedrunTop\([^\n]*\n/,"",'topPromise speedrun');
u.rx(/    : \(askCat==='biathlon' && typeof syncBiathlonTop==='function'\)\n    \? syncBiathlonTop\([^\n]*\n/,"",'topPromise biathlon');
u.rx(/const topFmt = v => \(askCat==='speedrun'\|\|askCat==='slalom'\|\|askCat==='biathlon'\) \? fmtTime\(v\)/,"const topFmt = v => (askCat==='slalom') ? fmtTime(v)",'topFmt');
u.rx(/const vyshe = \(askCat==='speedrun'\|\|askCat==='slalom'\|\|askCat==='biathlon'\) \? spisok/,"const vyshe = (askCat==='slalom') ? spisok",'vyshe');
u.save();
