/* ---------- Мозг неба · Уровень 1 «Адаптивное небо» (v1.108.1) ----------
   Идея пришла из документа пользователя, но реализация — под настоящий код, не под
   вымышленный API. Работает ТОЛЬКО в «Своей трассе» (S.mode==='custom') — единственном
   режиме, чей счёт уже НЕ идёт в общую таблицу (см. gameOver() в ui.js: custom возвращается
   до syncSubmit). В Классике/Bullet/Трассе дня/Дуэлях это сломало бы честность сравнения
   между игроками — тут ломать нечего, зачёта и так нет.
   Множитель НАКЛАДЫВАЕТСЯ на плотность/скорость автора трассы (S.customD/S.customS),
   не заменяет их — воля автора трассы остаётся главной, Мозг лишь чуть подкручивает.
   Профиль — экспоненциально сглаженное среднее время жизни + причины смерти, копится
   локально через Store (тот же механизм, что и остальные настройки игрока). */
const Adaptive = {
  KEY: 'adaptiveProfile',
  /* v1.282.13 «Профиль не роняет взлёт»: раньше значение из Store отдавалось как есть, и
     любой профиль без поля deathsByKind (частичная запись, скос версий, зеркало из облака
     Telegram) валил mult() на Object.values(undefined) — TypeError прилетал прямо из
     startGame(), и забег просто не начинался. Store ничего не валидирует по замыслу, значит
     проверять обязан тот, кто читает. Санитайзер того же покроя, что saneNumber в ядре:
     любой мусор молча становится честным нулём, а не поводом уронить небо. */
  profile(){
    const p = Store.get(this.KEY, null);
    const num = (v)=>{ const n = +v; return isFinite(n) && n >= 0 ? n : 0; }; // NaN/строка/минус → 0
    const src = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    const rawKinds = (src.deathsByKind && typeof src.deathsByKind === 'object' && !Array.isArray(src.deathsByKind))
      ? src.deathsByKind : {};
    const deathsByKind = {};
    for (const k in rawKinds){ const n = num(rawKinds[k]); if (n > 0) deathsByKind[k] = n; }
    return { avgSurvival: num(src.avgSurvival), deathsByKind, runs: num(src.runs) };
  },
  save(p){ Store.set(this.KEY, p); },
  // Зовётся один раз при гибели в «Своей трассе» — survivalSec/hitKind те же данные,
  // что уже летят в анонимную телеметрию BEACON.signal('death', ...), просто копим их и локально.
  onDeath(survivalSec, hitKind){
    const p = this.profile();
    p.avgSurvival = p.runs===0 ? survivalSec : p.avgSurvival*0.7 + survivalSec*0.3; // недавние забеги весят больше старых
    // v1.282.2: deathsByKind раньше рос вечным пожизненным счётчиком, никогда не забывая —
    // единственный сигнал профиля БЕЗ той же логики недавнего веса, что уже есть у avgSurvival
    // строкой выше. Игрок, выучившийся не врезаться в камни месяц назад, всё ещё получал бы
    // подстройку под камни сегодня. Тот же принцип «недавнее весит больше»: старые причины
    // смерти тихо выцветают на каждой новой смерти, не пропадают резко.
    // v1.282.13: выцветшее до неразличимости — выпалываем. Умножение на 0.92 стремит вес
    // к нулю, но ключ жил вечно: профиль в хранилище рос монотонно длинными хвостами
    // дробей, а Store пишет весь blob целиком на каждую запись.
    for (const k in p.deathsByKind){
      const v = p.deathsByKind[k] * 0.92;
      if (v < 0.01) delete p.deathsByKind[k]; else p.deathsByKind[k] = Math.round(v*1000)/1000;
    }
    p.deathsByKind[hitKind||'?'] = (p.deathsByKind[hitKind||'?']||0) + 1;
    p.runs++;
    this.save(p);
  },
  tier(p){
    if (p.runs < 3) return 'unknown'; // меньше 3 забегов — данных мало, не подстраиваем вслепую
    if (p.avgSurvival < 15) return 'newbie';
    if (p.avgSurvival < 45) return 'casual';
    if (p.avgSurvival < 90) return 'pro';
    return 'ace';
  },
  /* {d,s} — d читается как «доля плотности неба» (0.6 = небо на 60% плотности), s — как
     множитель скорости. ВАЖНО для того, кто будет это применять: в game.js customD попадает
     в ПАУЗУ между спавнами, значит применять d нужно делением, а не умножением, иначе знак
     переворачивается и новичок получает небо плотнее, чем ас (так и было до v1.282.20). */
  mult(){
    const p = this.profile();
    const t = this.tier(p);
    const BY_TIER = {
      unknown: {d:1,    s:1},
      newbie:  {d:0.6,  s:0.85},
      casual:  {d:0.85, s:0.95},
      pro:     {d:1.1,  s:1.05},
      ace:     {d:1.3,  s:1.15},
    };
    let {d, s} = BY_TIER[t];
    // Один и тот же вид препятствий убивает больше половины раз — общий темп чуть тише.
    // Не трогаем веса конкретных видов спавна — это авторский E-фильтр, Мозг его не обходит.
    const totalDeaths = Object.values(p.deathsByKind).reduce((a,b)=>a+b,0);
    if (totalDeaths >= 5) {
      const top = Object.entries(p.deathsByKind).sort((a,b)=>b[1]-a[1])[0];
      if (top && top[1]/totalDeaths > 0.5) d *= 0.9;
    }
    return {d, s};
  },
};
