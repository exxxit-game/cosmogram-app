const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rx(/toggleCls\('modeHud','hidden', !\(runMode==='speedrun'\|\|runMode==='daily'\|\|runMode==='custom'\|\|runMode==='theater'\|\|runMode==='caravan'\|\|runMode==='slalom'\|\|runMode==='biathlon'\|\|runMode==='relay'\)\);/,"toggleCls('modeHud','hidden', !(runMode==='daily'||runMode==='custom'||runMode==='theater'||runMode==='slalom'||runMode==='relay'));",'modeHud');
u.save();
