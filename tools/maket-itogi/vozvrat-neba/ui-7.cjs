const W=require('../cutlib.cjs'); const u=W('C:/Users/admin/Documents/GitHub/cosmogram-app/js/ui.js');
u.line("function flyBiathlon(){",'flyBiathlon');
u.line("function flySpeedrun(){",'flySpeedrun');
u.line("function flyCaravan(){",'flyCaravan');
u.rx(/card\.querySelector\('\.cardFlyBtn,\.speedrunFlyBtn,\.caravanFlyBtn,\.relayFlyBtn'\)/,"card.querySelector('.cardFlyBtn,.relayFlyBtn')",'селектор кнопки');
u.line("wireOn('modeBiathlon', 'click', flyBiathlon);",'wire biathlon');
u.line("wireOn('modeSpeedrunFly', 'click', flySpeedrun);",'wire speedrun');
u.line("wireOn('modeCaravanFly', 'click', flyCaravan);",'wire caravan');
u.save();
