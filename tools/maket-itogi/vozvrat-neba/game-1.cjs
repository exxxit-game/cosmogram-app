const W=require('../cutlib.cjs'); const g=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/game.js');
g.cut("const SR_GOAL=10000;","const SLALOM_DIST=","",'SR_GOAL, CARAVAN_TIME');
g.cut("// 06.09.2026 «Биатлон»: скорость+точность в одном забеге","// 06.09.2026 «Эстафета»: открытая цепочка на всех","",'константы Биатлона');
g.line("  if(cat && cat.indexOf('caravan')===0) return 'caravan';",'bucket caravan');
g.line("  if(runMode==='caravan') return 'ghostRun_caravan';",'ghostRunKey caravan');
g.rx(/const ownSky = \(runMode==='classic' \|\| runMode==='caravan'\);[^\n]*\n/,"const ownSky = (runMode==='classic'); // 01.10.2026: Caravan удалён\n",'ownSky');
g.rx(/    if \(\(runMode==='classic' \|\| runMode==='caravan'\) && grSeed && typeof keyRNG==='function'\)\{[^\n]*\n/,"    if ((runMode==='classic') && grSeed && typeof keyRNG==='function'){\n",'grSeed');
g.rx(/    \/\/ 06\.09\.2026 «Биатлон»: звёзды идут только внутри рубежа[^\n]*\n    \/\/ отрезки нарочно пустые[^\n]*\n    const biathlonGate = [^\n]*\n    if \(biathlonGate\) spawnStar\(\);\n/,"    spawnStar();\n",'biathlonGate');
// HUD режимов: остаются слалом, эстафета, театр, своя трасса
g.cut("  if (S.mode==='speedrun'){ // Спидран: таймер + цель","  else if (S.mode==='slalom'){","",'HUD speedrun+caravan');
g.rx(/  else if \(S\.mode==='slalom'\)\{ \/\/ 06\.09\.2026: время \+ прогресс по трассе/,"  if (S.mode==='slalom'){ // 06.09.2026: время + прогресс по трассе",'HUD slalom if');
g.cut("  else if (S.mode==='biathlon'){ // 06.09.2026: скорость+рубежи","  else if (S.mode==='relay'){","",'HUD biathlon');
g.save();
