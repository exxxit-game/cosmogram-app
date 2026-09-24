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
  echo "⚠ Резервная копия памяти (git) не коммитилась $age_days дн., незакоммиченных файлов: $dirty. Рассмотри commit в $MEM_DIR." >&2
fi
exit 0
