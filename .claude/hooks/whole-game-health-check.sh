#!/usr/bin/env bash
# 25.09.2026 (владелец: «нестандартные подходы, с разных сторон» + постоянное напоминание
# весь вечер «app+crew+Supabase — это ОДНА игра, не три отдельных»). До этого момента каждая
# проверка сегодня была РАЗДЕЛЬНОЙ: git status app отдельно, git status crew отдельно,
# Supabase advisors отдельно, память отдельно — ни разу одним взглядом сразу. Комбинация
# (не изобретение с нуля) — как «зум + вращение», не отдельные оси, а одна фигура сразу
# по всем поверхностям игры. Читает уже существующие проверки (audit-memory-index.sh,
# git), выводит ОДИН консолидированный отчёт. НЕ подключён как блокирующий hook — это
# отчётный инструмент, запускать вручную или из будущего SessionStart, не в PreToolUse
# (риск ломать реальные действия слишком высок для только что написанного скрипта).
set -uo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CREW_DIR="${CREW_DIR:-$APP_DIR/../cosmogram-crew}"
MEM_DIR="$(dirname "$0")/../../../.claude/projects/C--Users-admin-Documents-GitHub-cosmogram-app/memory"
# резервный путь на случай другого расположения .claude/projects
[ -d "$MEM_DIR" ] || MEM_DIR="$HOME/.claude/projects/C--Users-admin-Documents-GitHub-cosmogram-app/memory"

echo "════════ ЦЕЛОСТНОСТЬ ИГРЫ (app + crew + память) — единый отчёт $(date '+%Y-%m-%d %H:%M') ════════"
echo ""

echo "── cosmogram-app ──"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  branch=$(git branch --show-current 2>/dev/null)
  ahead_behind=$(git status -sb 2>/dev/null | head -1)
  dirty=$(git status --short 2>/dev/null | grep -cv '^??')
  untracked=$(git status --short 2>/dev/null | grep -c '^??')
  echo "  ветка: $branch | $ahead_behind"
  echo "  незакоммичено (изменено): $dirty | неотслеживаемо: $untracked"
  local_ver=$(grep -oE "GAME_VERSION *= *'[^']+'" js/core.js 2>/dev/null | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
  echo "  локальная версия: ${local_ver:-?}"
else
  echo "  НЕ НАЙДЕН по пути $APP_DIR"
fi
echo ""

echo "── cosmogram-crew ──"
if [ -d "$CREW_DIR/.git" ]; then
  cd "$CREW_DIR"
  branch=$(git branch --show-current 2>/dev/null)
  ahead_behind=$(git status -sb 2>/dev/null | head -1)
  dirty=$(git status --short 2>/dev/null | grep -cv '^??')
  echo "  ветка: $branch | $ahead_behind"
  echo "  незакоммичено (изменено): $dirty"
else
  echo "  НЕ НАЙДЕН по пути $CREW_DIR (переопредели CREW_DIR=... при запуске, если путь другой)"
fi
echo ""

echo "── Согласованность app↔crew ──"
if [ -d "$APP_DIR/.git" ] && [ -d "$CREW_DIR/.git" ]; then
  app_dirty_total=$(cd "$APP_DIR" && git status --short | wc -l)
  crew_dirty_total=$(cd "$CREW_DIR" && git status --short | wc -l)
  if [ "$app_dirty_total" -gt 0 ] && [ "$crew_dirty_total" -eq 0 ]; then
    echo "  ⚠ В app есть незакоммиченные правки, а в crew — ни одной. Если сегодняшняя задача"
    echo "    трогала игровую логику — вероятно, страж под неё забыт (см. feedback_crew_i_app_odna_igra)."
  elif [ "$crew_dirty_total" -gt 0 ] && [ "$app_dirty_total" -eq 0 ]; then
    echo "  ⚠ В crew есть незакоммиченные правки, а в app — ни одной — сверить, не оторвался ли страж от кода."
  else
    echo "  OK — оба репозитория либо оба чистые, либо оба с незакоммиченными правками."
  fi
fi
echo ""

echo "── Память (audit-memory-index.sh) ──"
if [ -f "$MEM_DIR/audit-memory-index.sh" ]; then
  bash "$MEM_DIR/audit-memory-index.sh" "$MEM_DIR" 2>&1 | sed 's/^/  /'
else
  echo "  audit-memory-index.sh не найден по пути $MEM_DIR"
fi
echo ""

echo "════════ Supabase — свериться ОТДЕЛЬНО через MCP get_advisors (нет CLI-доступа из bash-hook) ════════"
echo ""
echo "════════ конец отчёта ════════"
