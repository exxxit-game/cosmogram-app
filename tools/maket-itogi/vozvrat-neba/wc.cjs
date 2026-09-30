const W=require('../cutlib.cjs'); const w=W('C:/Users/admin/Documents/GitHub/cosmogram-app/tools/worst-case.mjs');
for (const k of ['    sp_pct_better:','    sp_win_deep:','    sp_win_slower:','    sp_death:','    bi_win:','    bi_death:','    caravan:']) w.line(k, k.trim());
w.rx(/srWin: 0, slalomWin: 0, slalomFail: 0, biathlonWin: 0, biathlonMisses: 0, wasRestored: 0, speedrunRSG: 0,/,"slalomWin: 0, slalomFail: 0, wasRestored: 0,",'сброс S');
w.save();
