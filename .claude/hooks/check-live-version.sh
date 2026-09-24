#!/usr/bin/env bash
# 24.09.2026 (владелец: «размышляй дальше, ищи»). CLAUDE.md уже требует текстом:
# «в начале сессии... сверить GAME_VERSION в js/core.js с тем, что реально отдаёт
# https://exxxit-game.github.io/cosmogram-app/» — но чисто текстовое правило,
# без технической опоры, того же класса риска, что claim-check (слепой на
# русский) и guard-full-suite-warn (условие не ловило реальный кейс) — легко
# пропустить в спешке марафонской сессии. SessionStart — тот же штатный путь,
# что уже используется в reinject-session-state.sh, просто для другого чека.
LOCAL_FILE="$(dirname "$0")/../../js/core.js"
if [ ! -f "$LOCAL_FILE" ]; then
  echo "=== check-live-version: js/core.js не найден по ожидаемому пути, пропуск проверки ==="
  exit 0
fi
LOCAL_VER=$(grep -oE "GAME_VERSION *= *'[^']+'" "$LOCAL_FILE" | head -1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
if [ -z "$LOCAL_VER" ]; then
  echo "=== check-live-version: не удалось прочитать локальный GAME_VERSION ==="
  exit 0
fi
LIVE_JS=$(curl -s --max-time 5 "https://exxxit-game.github.io/cosmogram-app/js/core.js" 2>/dev/null)
if [ -z "$LIVE_JS" ]; then
  echo "=== check-live-version: живой сайт не ответил за 5с (нет сети или сайт недоступен) — сверка версии пропущена, не считать это подтверждением совпадения ==="
  exit 0
fi
LIVE_VER=$(echo "$LIVE_JS" | grep -oE "GAME_VERSION *= *'[^']+'" | head -1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
if [ -z "$LIVE_VER" ]; then
  echo "=== check-live-version: не удалось прочитать версию с живого сайта ==="
  exit 0
fi
if [ "$LOCAL_VER" != "$LIVE_VER" ]; then
  echo "=== ВНИМАНИЕ: локальная версия ($LOCAL_VER) НЕ совпадает с живым сайтом ($LIVE_VER). Это ожидаемо, если есть незапушенные коммиты — сверить git log/git status ПЕРЕД тем как считать текущую рабочую папку правильной по умолчанию (CLAUDE.md: 'несколько несвязанных копий папки одновременно'). ==="
else
  echo "=== check-live-version: локальная ($LOCAL_VER) и живая ($LIVE_VER) версии совпадают — рабочая папка в сихронизации с сайтом. ==="
fi
