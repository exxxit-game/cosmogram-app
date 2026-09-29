#!/usr/bin/env bash
# 30.09.2026 (владелец, прямо: «инструменты, которые мы для тебя создавали, лежали
# без дела — у тебя был доступ всё это время, а ты сам ни разу не сказал, что надо
# проверить»). Реальный случай в ту же ночь: WebSearch/WebFetch были доступны весь
# вечер, но проверка Supabase changelog (её же явно требует skill "supabase" первым
# шагом) и версии самого Claude Code (2.1.268 вместо свежей 2.1.285, 17 релизов
# позади) случилась только потому, что владелец спросил «какие инструменты ты не
# использовал». «Знаю, что инструмент есть» и «привычка его применить» — разные
# вещи, вторая не формируется сама без механического напоминания — тот же вывод,
# что уже применён ко всем остальным ABSOLUTE-правилам этой ночи.
#
# Не проверяет сам (SessionStart-хук — простой bash, не может рассуждать/читать
# веб) — только напоминает, ЧТО именно проверить и по каким адресам, чтобы не
# приходилось заново вспоминать/искать ссылки каждый раз. Отчётный сигнал, как
# check-memory-backup-age.sh — решение действовать остаётся за агентом в моменте.
set -uo pipefail
STATE_DIR="$(dirname "$0")/../state"
STAMP_FILE="$STATE_DIR/tooling-currency-check.stamp"
STALE_DAYS=14

mkdir -p "$STATE_DIR" 2>/dev/null || true
now=$(date +%s)
if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE" 2>/dev/null || echo 0)
else
  last=0
fi
age_days=$(( (now - last) / 86400 ))

if [ "$age_days" -ge "$STALE_DAYS" ]; then
  node "$(dirname "$0")/lib/signal-trail.mjs" record tooling-currency-stale 2 "просрочено на ${age_days}дн" --trail=rules --half-life-hours=720 >/dev/null 2>&1
  echo "🔧 Давно (${age_days}дн, порог ${STALE_DAYS}) не проверялась актуальность инструментов. Стоит сегодня:" >&2
  echo "   1. WebFetch https://supabase.com/changelog.md — breaking changes (edge functions/RLS/extensions)." >&2
  echo "   2. WebFetch https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md — хуки/permissions/settings." >&2
  echo "   3. claude --version на машине vs то, что в п.2 — не отстали ли сильно." >&2
  echo "   После проверки (не только если нашлось что-то новое — сам факт проверки):" >&2
  echo "   date +%s > $STAMP_FILE" >&2
fi
exit 0
