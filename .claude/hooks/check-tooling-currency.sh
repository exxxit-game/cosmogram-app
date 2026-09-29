#!/usr/bin/env bash
# 30.09.2026 (владелец: «инструменты лежали без дела»; «я только сегодня узнал, что 3 дня
# назад вышла Sonnet 5.5»). Версия 2: раньше это была голая напоминалка «сходи проверь» —
# и в ней жила МОЯ ошибка: шаг «claude --version» смотрел на npm-копию (2.1.268), а сессии
# приложения гоняет ДРУГОЙ движок, который приложение само качает в
# %APPDATA%\Claude\claude-code\<версия> (на момент правки — 2.1.284, отстаёт от свежей 2.1.285
# на один релиз, не на 17). Проверено живьём Win32_Process, не по догадке.
#
# Теперь часть проверок делает сам скрипт, без моего решения «вспомнить»:
#   1) версия движка приложения (самая большая папка в ENGINE_DIR) vs последняя запись
#      официального CHANGELOG Claude Code;
#   2) список ID моделей со страницы обзора моделей vs запомненный список (known-models.txt) —
#      новый ID = вышла новая модель, о которой владелец мог не узнать.
# Остальное (Supabase changelog, сверка «моя модель vs самая новая») — только человек/ИИ
# способен прочитать и оценить, поэтому остаётся напоминанием.
# Работает, только пока штамп просрочен (STALE_DAYS) — то есть сеть дёргается раз в сутки,
# а не на каждом сжатии/возобновлении. Штамп и запомненный список обновляет `--ack` — его
# зовёт агент ПОСЛЕ того, как реально сообщил владельцу найденное (не раньше — иначе новость
# «съедается» молча, что и было проблемой).
set -uo pipefail
HOOK_DIR="$(dirname "$0")"
STATE_DIR="$HOOK_DIR/../state"
STAMP_FILE="$STATE_DIR/tooling-currency-check.stamp"
MODELS_FILE="$STATE_DIR/known-models.txt"
STALE_DAYS=1
ENGINE_DIR="$HOME/AppData/Roaming/Claude/claude-code"
CHANGELOG_URL="https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md"
MODELS_URL="https://platform.claude.com/docs/en/models/overview"

mkdir -p "$STATE_DIR" 2>/dev/null || true

fetch_models() {
  curl -sL --max-time 8 "$MODELS_URL" 2>/dev/null \
    | grep -oE 'claude-(opus|sonnet|haiku|fable|mythos)-[0-9]+(-[0-9]+)?' | sort -u
}

if [ "${1:-}" = "--ack" ]; then
  cur=$(fetch_models)
  if [ -n "$cur" ]; then
    printf '%s\n' "$cur" > "$MODELS_FILE"
    echo "принято: список моделей запомнен ($(printf '%s\n' "$cur" | wc -l) шт.)"
  else
    echo "внимание: страницу моделей получить не удалось — прежний список моделей не тронут"
  fi
  date +%s > "$STAMP_FILE"
  echo "принято: штамп проверки обновлён"
  exit 0
fi

now=$(date +%s)
last=0
[ -f "$STAMP_FILE" ] && last=$(cat "$STAMP_FILE" 2>/dev/null || echo 0)
age_days=$(( (now - last) / 86400 ))
[ "$age_days" -ge "$STALE_DAYS" ] || exit 0

node "$HOOK_DIR/lib/signal-trail.mjs" record tooling-currency-stale 2 "просрочено на ${age_days}дн" --trail=rules --half-life-hours=720 >/dev/null 2>&1

echo "🔧 Проверка актуальности инструментов просрочена (${age_days}дн, порог ${STALE_DAYS}). Автоматические результаты:" >&2

# 1) движок приложения vs последняя версия Claude Code
installed=""
[ -d "$ENGINE_DIR" ] && installed=$(ls "$ENGINE_DIR" 2>/dev/null | sort -V | tail -1)
latest=$(curl -s --max-time 8 "$CHANGELOG_URL" 2>/dev/null | grep -m1 -oE '^## \[?[0-9]+\.[0-9]+\.[0-9]+' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ -z "$installed" ] || [ -z "$latest" ]; then
  echo "   • движок: не удалось сравнить (установлен: '${installed:-?}', последний: '${latest:-?}') — нет сети или формат изменился" >&2
elif [ "$installed" = "$latest" ]; then
  echo "   • движок приложения $installed — совпадает с последним, отставания нет" >&2
elif [ "$(printf '%s\n%s\n' "$installed" "$latest" | sort -V | tail -1)" = "$latest" ]; then
  echo "   • движок приложения $installed, последний $latest — приложение обычно докачивает само; если это держится несколько дней подряд — сказать владельцу" >&2
else
  echo "   • движок приложения $installed новее записи в CHANGELOG ($latest) — странно, но не отставание" >&2
fi

# 2) новые модели
cur=$(fetch_models)
if [ -z "$cur" ]; then
  echo "   • модели: страницу получить не удалось (нет сети?)" >&2
elif [ ! -f "$MODELS_FILE" ]; then
  echo "   • модели: списка-эталона ещё нет — после ack он создастся ($(printf '%s\n' "$cur" | wc -l) ID сейчас на странице)" >&2
else
  added=$(comm -13 "$MODELS_FILE" <(printf '%s\n' "$cur"))
  if [ -n "$added" ]; then
    echo "   • НОВЫЕ МОДЕЛИ, которых не было в эталоне: $(printf '%s' "$added" | tr '\n' ' ') — СКАЗАТЬ ВЛАДЕЛЬЦУ (он узнал про Sonnet 5.5 только через 3 дня)" >&2
  else
    echo "   • модели: новых ID нет" >&2
  fi
fi

echo "   Вручную (читает только человек/ИИ):" >&2
echo "   а) WebFetch https://supabase.com/changelog.md — breaking changes (edge functions/RLS/extensions)." >&2
echo "   б) Сверить СВОЮ модель (см. системный промпт) с самой новой в списке выше — если новее, сказать владельцу." >&2
echo "   в) https://support.claude.com/en/articles/12138966-release-notes — может отставать от приложения, но вдруг." >&2
echo "   После того как РЕАЛЬНО сообщил найденное владельцу: bash .claude/hooks/check-tooling-currency.sh --ack" >&2
exit 0
