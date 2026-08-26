# 🛡️ QA Guardrails: стража + процесс релиза

> **Стандарт:** страж-тест ×3 прогона перед релизом.
> **Число стражей:** не хранится здесь как число — только в `tests/guard.mjs`, актуальное
> значение считать оттуда при каждом релизе. Число стражей — не цель, а производное.
> Известные пробелы в реестре (например, временно отсутствующий страж) — смотреть
> `KNOWN-BUGS.md`, не здесь: там живёт актуальный список, этот файл — только про процесс.

## 1. Обзор

**Цель:** предотвратить регрессии в детерминизме, производительности и UI.

**Процесс:** 
- стража-теста запускаются локально перед каждым коммитом
- 3 прогона × 3 устройства (iOS Safari, Android Chrome, Desktop Chrome)
- Автоматический запуск через GitHub Actions CI
- Есть ручной чеклист для релизов в Telegram Mini App

(известные пробелы в реестре стражей — см. актуальный список в KNOWN-BUGS.md)

## 2. Категории стражей

### A. Детерминизм (строгость: высокая)
- `det-sim-replay-match`: seed + tape → идентичный replay на всех платформах
- `no-math-random`: запрет Math.random() в game.js, render.js
- `mulberry32-seed-match`: проверка, что все режимы используют mulberry32(S.runSeed)
- `tape-monotonicity`: input-события строго возрастают по времени

### B. Производительность (строгость: высокая)
- `fps-stability`: 60 FPS на Redmi 9A, FPS > 55 на iPhone SE 2020
- `zero-gc-frame`: heap не растёт в течение 1000 кадров
- `render-budget`: < 16.67ms на кадр, split: 8ms update / 6ms render / 2.67ms reserve
- `memory-leak-guard`: heap_size остаётся стабильным после 10 раундов

### C. Telegram Mini App (строгость: средняя)
- `tg-initdata-validate`: проверка подписи initData на backend
- `tg-cloudstorage`: 1024 ключа на игрока, persistence после обновления
- `tg-haptics-suppressed`: haptic feedback не вызывается без user gesture
- `tg-fullscreen-mode`: requestFullscreen() работает без layout shift

### D. UI/UX (строгость: низкая — ручная проверка)
- `touch-zone-safe-area`: игровые тач-зоны не пересекаются с iOS edge gestures
- `hud-no-overlap`: HUD не перекрывает игровую зону (> 100px safe area)
- `menu-navigable`: все кнопки доступны без скролла на 360px ширине
