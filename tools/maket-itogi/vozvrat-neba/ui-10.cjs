const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.rx(/  if \(saved && saved\.mode && saved\.mode!=='theater'\) runMode=saved\.mode;/,"  if (saved && ['speedrun','caravan','biathlon'].includes(saved.mode)){ Store.del('savedRun'); saved=undefined; } // 01.10.2026: режимы Speedrun / Caravan / Биатлон удалены — прерванный забег в них не возрождаем\n  if (saved && saved.mode && saved.mode!=='theater') runMode=saved.mode;",'автосейв удалённых режимов');
u.save();
