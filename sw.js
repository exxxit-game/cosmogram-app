/* Космограмма · Service Worker (v1.8.2 «Вторая дверь»)
   Статика игры — кэш-first (ассеты версионируются ?v=), страница — сеть-first
   с откатом в кэш офлайн. Чужие домены (API синка) не перехватываем.
   v1.14.1: мост Telegram — свой, в шелле (вендоринг, больше никакого telegram.org).
   v1.108.1 «Один источник»: версия раньше повторялась вручную в каждой строке —
   забыть одну означало тихо раздать игроку смесь старого и нового файла. Теперь
   она называется один раз здесь, остальное собирается из неё же. */
const V = '1.478.17';
const CACHE = 'cosmogram-v' + V;
// 26.08.2026: i18n.js вынесен из core.js, должен грузиться первым — 'core' его использует
// 01.09.2026: partitura.js добавлен в index.html вместе с Партитурой, но забыт здесь — страж 29
// поймал (файл грузился игроку, но не кэшировался офлайн). Место в списке — сразу за forge, как
// и в index.html (partitura.js зависит от forgeCfg/FORGE_KINDS).
const JS_FILES = [
  'i18n','core','blackbox','beacon','input','game','ach','sync','render','planetarium',
  'goldstar','music','gyro','forge','partitura','adaptive','card','star','cinema','ui','vendor/telegram-web-app','vendor/mp4-muxer.min'
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
  'js/vendor/mp4-muxer-license/LICENSE', // 28.08.2026: MIT-текст рядом с вендором, тот же приём, что у шрифтов
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  'icons/icon-maskable-512.png', 'icons/favicon-32.png', 'icons/og-image.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => { // старые релизы убираем за собой
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
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
