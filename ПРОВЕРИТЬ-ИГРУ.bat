@echo off
chcp 65001 >nul
title Проверка целостности игры
echo Проверяю app + crew + память...
echo (Supabase здесь не проверяется — для этого нужен я, спроси меня отдельно)
echo.
"C:\Program Files\Git\bin\bash.exe" "%~dp0.claude\hooks\whole-game-health-check.sh"
echo.
echo ═══════════════════════════════════════════════
echo Нажми любую клавишу, чтобы закрыть окно.
pause >nul
