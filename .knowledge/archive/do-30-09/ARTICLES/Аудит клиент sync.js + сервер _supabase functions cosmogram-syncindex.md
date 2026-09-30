# Аудит: клиент js/sync.js + сервер _supabase/functions/cosmogram-sync/index.ts
## Дата: 17.08.2026 · Код: v1.400.2
## Статус: оба файла прочитаны целиком; сверено с .knowledge (PROJECT, KNOWN-BUGS,
ERROR-CATALOG, STYLE-GUIDE, PERFORMANCE), Чемоданчиком, Каталогом ошибок, RELEASE-NOTES-1.400.2.

## 1. Законы и пункты — статус

| Пункт | Статус | По коду |
|---|---|---|
| K3 (призрак после рекорда) | ✅ закрыт | `_syncFlying`-цепочка; комментарий v1.282.14 про afterSubmit |
| K4 (200 ≠ успех) | ⚠️ перенесён | в пути рекордов антиспам = HTTP 429 `{error:'rate'}`; кейс «200 {quiet:true}» из Каталога ошибок №9 относится к beacon (Почта неба) — проверить beacon.js |
| K5 (пустой catch → потеря Store) | ⚠️ по базе лечится | аудит 11.08 (core.js:337–340) + STYLE-GUIDE §4.A (v1.282.14) — построчно core.js не читался |
| A4 (dailyQ переживает offline/timeout/5xx) | ✅ закрыт | удаление только при `r && r.ok`; navigator.onLine false → return; timeout → null; повтор по online + 4000 мс; лимит 14 |
| D1 (duel_win/ghost_beat переживают 429) | ✅ закрыт | 429 → `drain()` очков; `drainExtra()` не вызывается; extra `slice(-10)` |
| N3 (висящие fetch) | ✅ закрыт | POST_TIMEOUT=10000 + AbortController (v1.282.13 «Поводок») |
| N5 (двойная отправка батча) | ✅ закрыт | `_syncFlying` + вычитание доставленного (v1.282.20) |
| N6 (syncDcClientId кэширует 5xx) | ✅ закрыт | 5xx → throw → .catch без кэша |
| CSRF входа Discord | ✅ закрыт | v1.282.8: state crypto.randomUUID, сверка, history.replaceState |

## 2. Найдено (зафиксировано, НЕ правки)

- share_ghost v23 «Лента — доказательство»: выкл тумблера НЕ стирает ленту (улика под
  рекордом обязана жить); ghost_get отказывает; стирание — только руками экипажа (privacy.html).
  Клиентский комментарий sync.js «удалит сразу» устарел.
- Дублирование PNG-валидации в share_card и card_url (regex, лимит 4M, сигнатура, upload
  cards/{pid}/card.png) — вынести в helper.
- Потолки: CAPS.dist=2М (рекорды) vs readDays dist=20М (дневник); физический предел дистанции
  ~83 м/с × 6ч ≈ 1,797 млн — запас ~11%. SCORE_CEIL клиента 5М < CAPS сервера 10М — согласовано.
- cosmogram-app (зеркало) снята 13.08 (410); в KNOWN-BUGS перечислены только ct-test и
  mirror-sync — дополнить.
- Развёрнутая версия сервера: Чемоданчик(14.08): v22 в бою / v23 в песочнице; код main — v23
  (стражи 127,128). Сверить в панели.

## 3. Подтверждено сервером (без расхождений)

- Паспорт v12: категория ≤ run.score, дистанция ≤ run.dist; RUN_CATS=[gyro,touch,bullet,keys];
  RUN_MAX_SEC=6ч; RATE_SCORE=2000/с; RATE_DIST=120 м/с; score_strict='1' — строгий режим.
- Триггер scores_guard: прирост ≤100 000 очков / 50 000 м за отправку (Чемоданчик; проверено вживую).
- Три личности: initData(HMAC WebAppData) → webAuth(SHA256 bot_token) → dcAuth(HMAC-сессия);
  секреты только в config БД.
- Уведомления (корона/дуэль/призрак) — только по фактически принятым accepted; подделка невозможна.
- Дневник v13: days_ack только реально записанные; стаж считает сервер; тумблер выкл → наблюдательное стирается.
- Morning report: Bearer-токен из config (MORNING-REPORT.md), в коде — нет.