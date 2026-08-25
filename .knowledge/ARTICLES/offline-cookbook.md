# 🌐 The Offline Cookbook — Стратегии кэширования Service Worker (Jake Archibald)

> **Источник:** Google Web Development & Jake Archibald  
> **Статус:** 🔴 Обязательное руководство для `sw.js`

---

## 1. Архитектура офлайн-доставки Cosmogram

В игре `sw.js` использует комбинированную стратегию:

1. **Cache-First (Кэш в первую очередь):**
   - Шрифты (`fonts/exo2-*.woff2`)
   - Графика и иконки (`icons/icon-*.png`)
   - Мост Telegram (`js/vendor/telegram-web-app.js`)
   - Если ресурс есть в кэше — он отдается мгновенно (0 мс задержки сети).

2. **Network-First с fallback в кэш (Сеть в первую очередь):**
   - HTML-страница (`index.html`)
   - Скрипты с версионированием (`js/*.js?v=1.400.2`)
   - Гарантирует, что игрок сразу получает актуальное «Новое небо», если есть интернет.

3. **Generic Offline Fallback:**
   - Если сеть недоступна и ресурса нет в кэше — отдается `caches.match('./')`.

---

## 2. Атомарность установки Service Worker

```javascript
// Паттерн безопасной установки (избегаем отказа всего install из-за одного 404)
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Кэшируем критичные ресурсы
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});
```

---

## 3. Чеклист для sw.js

- [ ] Версия кэша строго синхронизирована с версией игры (`cosmogram-v1.400.2`).
- [ ] Старые кэши удаляются в событии `'activate'`.
- [ ] Сетевые запросы к серверу синка рекордов (`sync.js`) не кэшируются.
