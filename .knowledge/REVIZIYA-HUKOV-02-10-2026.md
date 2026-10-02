# Ревизия хуков проекта (02.10.2026)

Считано по файлам: папка `.claude/hooks/`, текущий `settings.json`, прежний полный набор `settings.do-13-09-full.json` (решение владельца 30.09: сократить до 12 хуков).

- Файлов-хуков в папке: **53**
- Подключены сейчас: **15**
- Были в наборе 13.09, но сейчас НЕ подключены: **37**
- Файлы, которых нет ни в одном наборе: **1**
- Подключено в `settings.local.json`: **0**

## A. Подключены сейчас

| Файл | Событие и условие | Для чего (из шапки файла) |
| --- | --- | --- |
| `ask-then-act-guard.mjs` | Stop (block) | 26.09.2026, по прямому требованию владельца после |
| `bash-safety-guard.sh` | PreToolUse [Bash] | 30.09.2026 (владелец: «что может стать лучше, где может |
| `check-live-version.sh` | SessionStart [compact|startup|resume] | 24.09.2026 (владелец: «размышляй дальше, ищи»). CLAUDE.md уже требует текстом: |
| `guard-deploy-content.sh` | PreToolUse [mcp__.*__deploy_edge_function] | 27.08.2026 |
| `guard-full-suite-warn.sh` | PreToolUse [Bash]; PreToolUse [mcp__.*__browser_run_code_unsafe] | 19.09.2026 (владелец, напрямую, после того как ноут завис ~40 минут): |
| `guard-supabase-write.sh` | PreToolUse [mcp__.*__(execute_sql|apply_migration)] | 22.09.2026 (владелец, по итогам ревизии инструментов после марафона): та же логика, что |
| `new-function-revoke-guard.mjs` | PreToolUse [mcp__.*__(execute_sql|apply_migration)] (block) | 30.09.2026. PreToolUse-хук: запрос в базу (execute_sql или |
| `no-broad-git-add.sh` | PreToolUse [Bash] |  |
| `no-secrets-in-commit.sh` | PreToolUse [Bash] | 16.09.2026 (исследование: "плагины/скрипты, убирающие у тебя ошибки"). Лёгкий сканер секретов |
| `only-what-owner-said.mjs` | UserPromptSubmit; Stop | 01.10.2026, по прямому слову владельца («тут надо противодействие, |
| `protect-core.sh` | PreToolUse [Edit|Write] | закреплено |
| `skin-lab-guard.mjs` | PreToolUse [Artifact]; Stop | 02.10.2026, по прямому слову владельца («делай хук… обязательный, такой, |
| `syntax-check-js.sh` | PostToolUse [Edit|Write] | 16.09.2026 (исследование по просьбе владельца: "какие плагины/скрипты уберут у тебя лишние |
| `tool-usage-read-guard.mjs` | PreToolUse [Bash] (block) | 30.09.2026. PreToolUse-хук на Bash: команда запускает инструмент проекта |
| `version-guard.sh` | PreToolUse [Bash] |  |

## B. Были в наборе 13.09, сейчас не подключены

| Файл | Событие и условие | Для чего (из шапки файла) |
| --- | --- | --- |
| `category-db-verify-guard.mjs` | Stop [*] (block) | 30.09.2026. Stop-хук: в этом ходу правились списки категорий рекордов |
| `check-memory-backup-age.sh` | SessionStart [compact|startup|resume] | единственная копия ремесленного знания без |
| `check-tooling-currency.sh` | SessionStart [compact|startup|resume] | 30.09.2026 (владелец: «инструменты лежали без дела»; «я только сегодня узнал, что 3 дня |
| `claim-check-hook.mjs` | Stop [*] (block) | Node.js порт claim_check_hook.py (PrimeFoldTools/andon, |
| `claudemd-rule-mechanism-guard.mjs` | PostToolUse [Edit|Write] (block) | 30.09.2026. PostToolUse на Edit/MultiEdit/Write: в CLAUDE.md |
| `commit-tracker.sh` | PostToolUse [Bash] | ставит метку category=commit в тот же |
| `deferral-record-guard.mjs` | Stop [*] (block) | 30.09.2026. Stop-хук: в ответе есть обещание отложить дело |
| `deferred-fix-guard.mjs` | PostToolUse [AskUserQuestion] | 27.09.2026, построен по прямому требованию владельца в моменте |
| `deploy-readback-guard.mjs` | Stop [*] (block) | 30.09.2026. Stop-хук: в этом ходу была выкладка серверной функции |
| `device-claim-guard.mjs` | Stop [*] (block) | 26.09.2026, шорт-лист аудита памяти, пункт #3. |
| `device-eval-vs-hwshot-guard.mjs` | PostToolUse [Bash] | 27.09.2026, построен по прямому требованию владельца |
| `device-idle-nudge.mjs` | PostToolUse [Edit|Write]; PostToolUse [Bash] | 26.09.2026, построен по прямому требованию владельца в моменте |
| `evidence-anchoring-guard.mjs` | Stop [*] (warn) | 27.09.2026, по прямому требованию владельца после |
| `excuse-words-guard.mjs` | Stop [*] (block) | 26.09.2026, из аудита журнала правил (кластер #13, |
| `feedback-needs-mechanism-guard.mjs` | PostToolUse [Edit|Write] | 30.09.2026. Владелец, зло: «если ты будешь просто это записывать, |
| `function-family-sync-guard.mjs` | Stop [*] (block) | 30.09.2026. Stop-хук: в этом ходу правилась функция Supabase |
| `geometry-measure-guard.mjs` | PreToolUse [Edit|Write] | 26.09.2026, шорт-лист аудита памяти, пункт #5 |
| `guard-memory-index-format.sh` | PreToolUse [Edit|Write] | 25.09.2026 (владелец, после реального раздутия указателя в MEMORY.md: «я тебе не |
| `invented-names-guard.mjs` | PostToolUse [Edit|Write] | 30.09.2026. Противоядие от «выдуманных имён» (владелец, после падения стражей |
| `memory-typo-check.sh` | PostToolUse [Edit|Write] | 23.09.2026 (владелец, прямо, после того как поймал мусор-опечатку "høvenj" в свежем файле |
| `mockup-unseen-guard.mjs` | Stop [*] (block) | Stop-хук (30.09.2026, владелец: «пожалуйста, чтобы больше не |
| `post-commit-drift-check.sh` | PostToolUse [Bash] | 25.09.2026 (владелец: «раз в день бессмысленно, ловить надо мгновенно, у нас и так раз |
| `reinject-session-state.sh` | SessionStart [compact|startup|resume] | 19.09.2026 (владелец, напрямую: «шахматное мышление» исчезает при каждом |
| `remind-connect-phones.sh` | SessionStart [compact|startup|resume] | подключить ОБА |
| `repeat-edit-tracker.sh` | PostToolUse [Edit|Write] | 26.09.2026: механизация «правило пяти попыток» (feedback_pyat_popytok_dazhe_s_novoy_gipotezoy.md, |
| `revoke-grant-verify-guard.mjs` | Stop [*] (block) | 29.09.2026, механизация ABSOLUTE-правила CLAUDE.md |
| `russian-description-guard.sh` | PreToolUse [Bash] | надо больше, чем |
| `scan-code-mixed-script.sh` | PostToolUse [Edit|Write] | 25.09.2026 (владелец прямо: «это не иронично, это сбой, исследуй причину»). За эту же |
| `screen-back-registered-guard.mjs` | PostToolUse [Edit|Write] (block) | 30.09.2026. PostToolUse на Edit/Write файла js/ui.js: каждый экран, |
| `shared-constant-guard.mjs` | PreToolUse [Edit|Write] | 26.09.2026, из аудита журнала правил (кластер #9, |
| `skin-fit-registered-guard.mjs` | PostToolUse [Edit|Write] | 26.09.2026, построен в моменте (владелец: «просто записывать |
| `swear-pause-check.sh` | UserPromptSubmit [*] | 26.09.2026: механизация правила «10+ матов подряд = сигнал остановиться, не сигнал |
| `tool-read-log.mjs` | PostToolUse [Read|Grep|Bash] | 30.09.2026. PostToolUse-хук на Read/Grep/Bash: если вызов открыл для чтения файл |
| `tool-usage-log.mjs` | PostToolUse [^(Skill|Agent|Task|mcp__.*)$] | 30.09.2026 (владелец: «какие инструменты ты не использовал, хотя нужно было, и |
| `visual-file-nudge.sh` | PostToolUse [Edit|Write] | 30.09.2026 (владелец: «полностью применил метод или отступил на первой сложности?»). |
| `whole-game-health-check.sh` | SessionStart [compact|startup|resume] | 25.09.2026 (владелец: «нестандартные подходы, с разных сторон» + постоянное напоминание |
| `worst-case-gate.mjs` | Stop [*] (block) | Stop-хук (30.09.2026): «проверять на САМОМ ТЯЖЁЛОМ РЕАЛИСТИЧНОМ случае» — не текстом, а делом. |

## C. Файлы без подключения ни в одном наборе

| Файл | Событие и условие | Для чего (из шапки файла) |
| --- | --- | --- |
| `log-claim.mjs` | — | Node.js порт log_claim.py (PrimeFoldTools/andon). Пишет запись, |
