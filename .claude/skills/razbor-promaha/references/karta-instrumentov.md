# Карта: ситуация → что брать

Составлена 02.10.2026 по реальным файлам проекта. Устарела карта, когда что-то из списка исчезло или появилось: поправить строку (это и есть починка причины).

## Скиллы (`.claude/skills`)

| Ситуация | Что брать |
|---|---|
| Просят изменить внешний вид, экран, цвет, иконку | `maket` (сначала макет), перед макетом `references/karta-ekrana.md` |
| Нужны новые скины, темы, явления, «что у нас есть по темам» | СНАЧАЛА база владельца: `.knowledge/archive/do-30-09/tyuning/` (239 разборов с источниками; отбор тем: `STARTOVY-NABOR-100-SKINOV-CHERNOVIK-18-09-2026.md`, `PRIORITY-INDEX.md`, `REFERENSY-DLYA-BUDUSHIH-SKINOV-24-09-2026.md`) и список скинов в `js/game.js`; интернет только для одной цифры, которой в базе нет |
| Несколько просьб сразу, правка видимого, перед «готово» | `vse-srazu` (список просьб, причина, весь экран, проверка удобства) |
| Пришла новая тема, пока старая не закончена | `odno-za-drugim` |
| Баг в игре | `bugfix`; если баг на телефоне или в Telegram — сначала `device-bug` |
| Собираюсь написать «готово», «работает», назвать причину | `myshlenie-uchyonyh` (проверено ли) и `tiraniya-slov` (как написать) |
| «Исследуй», «подумай хорошо», задача не решилась дважды | `deep-search` |
| Коммит, версия, финал правки | `release` |
| Конфликт слияния, «правки пропали» | `git-conflict` |
| Выкладка Edge Function на сервер | `deploy-edge` (+ `no-manual-transcription` для переноса файла) |
| Новая функция или права в базе | `supabase-permissions` |
| Система дизайна устарела | `ds-sync` |
| Вычитка и правка текстов (Хартия, подписи, переводы), запятые, двойные отрицания | `proverka-teksta` |
| Новый язык или письменность (арабский, китайский, японский, хинди…), «квадраты вместо букв» | `perevod-yazykov` |
| Владелец говорит «ты не пользовался тем, что есть» | `razbor-promaha` (этот скилл) |

## Инструменты (`tools/`)

| Что нужно | Команда |
|---|---|
| Поднять версию игры перед коммитом | `node tools/bump-version.mjs` |
| Где используется константа или поле (оба репозитория) | `node tools/where-used.mjs "<ИМЯ>"` |
| Измерить весь экран (пустоты, наложения, языки) | `node tools/screen-audit.mjs --spec=tools/screen-specs/<экран>.json` |
| Самый тяжёлый реалистичный случай для макета | `node tools/worst-case.mjs macet <папка>` (потолки в `tools/worst-case-fixtures.json`, `tools/data-fixtures.json`) |
| Измерить настоящий телефон (adb) | `node tools/live-device.mjs devices` → `forward` → `pages` → `eval` |
| Отступ от шапки Telegram | `node tools/measure-title-clearance.mjs` |
| Правка файла без возни с кавычками и слэшами на Windows | `node tools/patch.mjs` |
| Начало сессии: какая папка рабочая, версия сайта | `node tools/session-orientation.mjs` |
| Потерянные файлы памяти после чистки индекса | `node tools/check-memory-orphans.mjs` |
| Подбор цветов режимов по различимости (в том числе дальтонизм) | `node tools/mode-palette-search.mjs` |

## Знание и память

| Что | Где |
|---|---|
| Задачи по игре, порядок | `ЗАДАЧИ.md` («работай дальше» = верхняя из «Сейчас») |
| Решения по архитектуре (смотреть до архитектурной правки) | `.knowledge/AI-DECISION-REGISTRY.md` |
| Состояние прошлой сессии | `.knowledge/SESSION-STATE.md` |
| Исследования | `.knowledge/RESEARCH-*.md`, старые в `.knowledge/archive/do-30-09/` |
| Оглавление памяти | `memory/MEMORY.md`; старые записи `memory/archive/` |
| Правила проекта | `CLAUDE.md` |

## Плагины, которые работают в сессии

| Что нужно | Что брать |
|---|---|
| Проверка доступности (контраст, зоны нажатия 44×44, подписи) | `design:accessibility-review` |
| Скорость и доступность страницы | Lighthouse и профиль в `chrome-devtools` (`lighthouse_audit`, `performance_start_trace`) |
| Браузерные проверки и снимки | `playwright` (локально, в Node) |
| Права и RLS в Supabase | `supabase:supabase` (официальные правила) вместе с `supabase-permissions` |
| Свой новый скилл или правка скилла | `skill-creator` |
| Ревью кода и PR | `pr-review-toolkit`, `code-review` |

## Хуки, которые реально включены (12)

`protect-core.sh` (ядро и `ui.js`, `index.html`), `version-guard.sh`, `bash-safety-guard.sh`, `no-broad-git-add.sh`, `no-secrets-in-commit.sh`, `guard-full-suite-warn.sh`, `guard-deploy-content.sh`, `guard-supabase-write.sh`, `new-function-revoke-guard.mjs`, `syntax-check-js.sh`, `check-live-version.sh`, `only-what-owner-said.mjs`. Всё остальное в `.claude/hooks` отключено; скилл не должен на него ссылаться.
