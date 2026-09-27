#!/usr/bin/env bash
# 25.09.2026 (урок «Тяньгун Кайу» — единственная копия ремесленного знания без
# институциональной защиты уязвима; резервный git-коммит памяти найден просроченным
# на 2 дня при живой проверке, не в теории). SessionStart-хук: смотрит возраст
# последнего коммита в git-репозитории памяти, предупреждает, если давно не
# коммитилось — не коммитит сам автоматически (решение коммитить остаётся ручным,
# как у whole-game-health-check.sh — это отчётный сигнал, не молчаливое действие).
set -uo pipefail
MEM_DIR="$(dirname "$0")/../../../.claude/projects/C--Users-admin-Documents-GitHub-cosmogram-app/memory"
[ -d "$MEM_DIR/.git" ] || MEM_DIR="$HOME/.claude/projects/C--Users-admin-Documents-GitHub-cosmogram-app/memory"
[ -d "$MEM_DIR/.git" ] || exit 0

STALE_DAYS=1
now=$(date +%s)
last_commit=$(cd "$MEM_DIR" && git log -1 --format=%ct 2>/dev/null)
[ -n "$last_commit" ] || exit 0
age_days=$(( (now - last_commit) / 86400 ))
dirty=$(cd "$MEM_DIR" && git status --short 2>/dev/null | wc -l)

if [ "$age_days" -gt "$STALE_DAYS" ] && [ "$dirty" -gt 0 ]; then
  # 25.09.2026: подключено к тому же живому следу (rules), что REPEAT-LOG и другие
  # хуки — если это повторится в будущих сессиях, а не разово, рейтинг это покажет,
  # не только разовое предупреждение, которое легко пропустить мимо глаз.
  SEV=$(( age_days > 5 ? 5 : age_days ))
  node "$(dirname "$0")/lib/signal-trail.mjs" record memory-backup-stale "$SEV" "просрочено на ${age_days}дн, ${dirty} незакоммиченных" --trail=rules --half-life-hours=720 --just-culture=atrisk >/dev/null 2>&1
  echo "⚠ Резервная копия памяти (git) не коммитилась $age_days дн., незакоммиченных файлов: $dirty. Рассмотри commit в $MEM_DIR." >&2
fi
exit 0
