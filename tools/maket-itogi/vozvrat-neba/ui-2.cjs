const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rep("const names={classic:L.modeClassic,speedrun:L.modeSpeedrun,daily:L.modeDaily,custom:L.modeForge,caravan:L.modeCaravan,slalom:L.modeSlalom,biathlon:L.modeBiathlon,relay:L.modeRelay};","const names={classic:L.modeClassic,daily:L.modeDaily,custom:L.modeForge,slalom:L.modeSlalom,relay:L.modeRelay};",'names');
u.line("  const srRSG = runMode==='speedrun' && typeof speedrunRSGGet==='function'",'srRSG');
u.line("    : (runMode==='speedrun' && !srRSG) ? (SPEEDRUN_ETERNAL_DAY+'·speedrun')",'mapSeedKey speedrun');
u.line("    : (runMode==='speedrun' && !srRSG) ? keyRNG(SPEEDRUN_ETERNAL_DAY+'·speedrun')",'mapRNG speedrun');
u.rx(/srWin:0,caravanTimeUp:0,starsSpawned:0,/,"starsSpawned:0,",'S init srWin');
u.rx(/    caravanTime:\(runMode==='caravan'\?caravanTierGet\(\):60\),[^\n]*\n    speedrunRSG:srRSG,[^\n]*\n    biathlonWin:0,biathlonR1Done:0,biathlonMisses:0,biathlonSnapSpawned:0,biathlonSnapCollected:0,relayLegDone:0,/,"    relayLegDone:0,",'S init caravan/biathlon');
u.save();
