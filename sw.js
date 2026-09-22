/* Космограмма · Service Worker (v1.8.2 «Вторая дверь»)
   Статика игры — кэш-first (ассеты версионируются ?v=), страница — сеть-first
   с откатом в кэш офлайн. Чужие домены (API синка) не перехватываем.
   v1.14.1: мост Telegram — свой, в шелле (вендоринг, больше никакого telegram.org).
   v1.108.1 «Один источник»: версия раньше повторялась вручную в каждой строке —
   забыть одну означало тихо раздать игроку смесь старого и нового файла. Теперь
   она называется один раз здесь, остальное собирается из неё же. */
const V = '1.478.521';
const CACHE = 'cosmogram-v' + V;
// 26.08.2026: i18n.js вынесен из core.js, должен грузиться первым — 'core' его использует
// 01.09.2026: partitura.js добавлен в index.html вместе с Партитурой, но забыт здесь — страж 29
// поймал (файл грузился игроку, но не кэшировался офлайн). Место в списке — сразу за forge, как
// и в index.html (partitura.js зависит от forgeCfg/FORGE_KINDS).
const JS_FILES = [
  'i18n','core','blackbox','skymail','input','game','ach','sync','render','planetarium',
  'goldstar','finish','music','gyro','forge','partitura','adaptive','card','star','cinema','ui','vendor/telegram-web-app','vendor/mp4-muxer.min','vendor/eruda.min','vendor/mediabunny.min'
];
const SHELL = [
  './', 'index.html', 'manifest.ru.json', 'manifest.en.json', 'manifest.es.json', 'manifest.pt.json', 'manifest.fr.json', // v1.108.1: манифест по языку — все варианты в кеше
  ...JS_FILES.map(f => 'js/' + f + '.js?v=' + V),
  /* v1.282.13: fonts/OFL.txt был убран отсюда — файла не было на диске, а caches.addAll
     атомарен: один 404 роняет весь install, воркер не активируется, офлайна нет. Мина
     лежала ровно под ту минуту, когда PWA включат.
     v1.282.20: файл возвращён в репозиторий из дистрибутива Exo 2 (SIL OFL требует класть
     текст лицензии рядом со шрифтом), поэтому и строка возвращается сюда. Страж 29 проверяет
     каждый путь этого списка на самом деле, а не на слово. */
  'fonts/exo2-cyrillic.woff2', 'fonts/exo2-latin.woff2', 'fonts/OFL.txt', // v1.46.0: Exo 2 вместо Russo One
  'fonts/roboto400-cyrillic.woff2', 'fonts/roboto400-latin.woff2', 'fonts/OFL-Roboto.txt', // 26.08.2026: кнопки входа — своя копия Roboto (400, не 500 — Regular)
  'fonts/russoone-cyrillic.woff2', 'fonts/russoone-latin.woff2', 'fonts/OFL-RussoOne.txt', // 03.09.2026: лого-вордмарка «Марс» на главном
  'fonts/jura-cyrillic.woff2', 'fonts/jura-latin.woff2', 'fonts/OFL-Jura.txt', // 04.09.2026: только карточка exxxit game studio на «Написать разработчику»
  'js/vendor/mp4-muxer-license/LICENSE', // 28.08.2026: MIT-текст рядом с вендором, тот же приём, что у шрифтов
  'js/vendor/eruda-license/LICENSE', // 17.09.2026: тот же приём — MIT-текст рядом с вендором
  'js/vendor/mediabunny-license/LICENSE', // 18.09.2026: тот же приём — MPL-2.0 текст рядом с вендором
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  'icons/icon-maskable-512.png', 'icons/favicon-32.png', 'icons/og-image.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
      /* 18.09.2026 (владелец, готовим PWA к включению при частых правках): раньше сбой
         установки (один сломанный путь в SHELL — caches.addAll атомарен) проходил СОВСЕМ без
         следа — браузер тихо остаётся на старой версии, никто не узнаёт, что именно этот
         деплой не применился. Пробрасываем ошибку дальше (install и должен провалиться,
         поведение не меняем), но сперва пишем её в консоль — единственный шанс её вообще
         увидеть, раз своей телеметрии у воркера нет. */
      .catch(err => { console.error('[sw] install провалился — SHELL содержит нерабочий путь, новая версия НЕ применена:', err); throw err; })
  );
});

self.addEventListener('activate', e => { // старые релизы убираем за собой
  e.waitUntil(
    caches.keys()
      /* 18.09.2026 (владелец, готовим PWA к включению): было — один неудачный caches.delete()
         роняет весь Promise.all, self.clients.claim() тогда не звался НИКОГДА, уже открытые
         вкладки застревали на старом воркере до ручного переоткрытия. Ловим ошибку у КАЖДОГО
         delete по отдельности — один неудачный не должен мешать остальным подчиститься и не
         должен мешать claim() выполниться. */
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k).catch(err => console.error('[sw] не удалось удалить старый кэш', k, err)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // только своя статика
  if (e.request.mode === 'navigate'){ // страница: свежая из сети, офлайн — из кэша
    e.respondWith(
      fetch(e.request)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)); return r; })
        .catch(() => caches.match('index.html').then(m => m || caches.match('./')))
    );
    return;
  }
  e.respondWith( // ассеты: кэш-first, промах — сеть и доклад в кэш
    caches.match(e.request, { ignoreSearch: false }).then(hit => hit ||
      fetch(e.request).then(r => {
        if (r.ok){ const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
        return r;
      })
    )
  );
});
