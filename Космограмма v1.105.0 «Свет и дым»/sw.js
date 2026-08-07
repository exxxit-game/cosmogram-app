/* Космограмма · Service Worker (v1.8.2 «Вторая дверь»)
   Статика игры — кэш-first (ассеты версионируются ?v=), страница — сеть-first
   с откатом в кэш офлайн. Чужие домены (API синка) не перехватываем.
   v1.14.1: мост Telegram — свой, в шелле (вендоринг, больше никакого telegram.org). */
const CACHE = 'cosmogram-v1.105.0';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'js/core.js?v=1.105.0', 'js/blackbox.js?v=1.105.0', 'js/input.js?v=1.105.0', 'js/game.js?v=1.105.0',
  'js/ach.js?v=1.105.0', 'js/sync.js?v=1.105.0', 'js/render.js?v=1.105.0', 'js/planetarium.js?v=1.105.0', 'js/goldstar.js?v=1.105.0',
  'js/music.js?v=1.105.0', 'js/gyro.js?v=1.105.0',
  'js/forge.js?v=1.105.0', 'js/card.js?v=1.105.0', 'js/star.js?v=1.105.0', 'js/ui.js?v=1.105.0',
  'js/vendor/telegram-web-app.js?v=1.105.0',
  'fonts/exo2-cyrillic.woff2', 'fonts/exo2-latin.woff2', 'fonts/OFL.txt', // v1.46.0: Exo 2 вместо Russo One
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  'icons/icon-maskable-512.png', 'icons/favicon-32.png'
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
