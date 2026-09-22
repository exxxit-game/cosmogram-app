# 📨 Inline mode как третий путь для шеринга «Играй со мной» (20.09.2026)

> Вопрос владельца: можно ли ботом/пользователем через inline mode (`@botname запрос` в любом
> чате, включая вызов из Mini App через `switchInlineQuery`) отправить сообщение с картинкой/GIF
> И настоящей inline-кнопкой Telegram (`reply_markup`/`inline_keyboard`, `callback_data` или URL) —
> как делают Gamee/Gorilla Case — третьему человеку, который сам бота не запускал. Контекст:
> прямая рассылка ботом непроверенным пользователям уже отклонена (запрещена правилами Telegram) —
> inline mode кандидат в качестве обходного легального пути, до этой сессии не проверялся.
> Read-only исследование, без правок кода. Источники — официальная документация
> `core.telegram.org/bots/api` и `core.telegram.org/api/bots/inline`, по местам где прямой fetch
> огромной страницы `bots/api` обрывался до нужного раздела (страница даже без JS ~600+ КБ,
> контент inline-секции идёт после «Stickers», глубоко в документе) — подтверждено зеркалом
> python-telegram-bot (PTB), чья документация генерируется из тех же официальных описаний полей
> API дословно, плюс перекрёстная проверка через GramIO/aiogram/Pyrogram и один реальный баг-репорт
> с живой ошибкой API. Ссылки — под каждым пунктом.

---

## 1. Может ли один результат `answerInlineQuery` содержать И фото/GIF, И `reply_markup` с кнопками?

**Да, подтверждено.** Все проверенные типы `InlineQueryResult*` с медиа имеют оба поля —
и поле картинки/анимации, и `reply_markup: InlineKeyboardMarkup` — как равноправные опциональные
поля одного объекта, не взаимоисключающие:

| Тип | Обязательные поля медиа | `reply_markup` |
|---|---|---|
| `InlineQueryResultPhoto` | `photo_url`, `thumbnail_url` | есть, опционален |
| `InlineQueryResultCachedPhoto` | `photo_file_id` | есть, опционален |
| `InlineQueryResultGif` | `gif_url`, `thumbnail_url` | есть, опционален |
| `InlineQueryResultCachedGif` | `gif_file_id` | есть, опционален |
| `InlineQueryResultMpeg4Gif` | `mpeg4_url`, `thumbnail_url` | есть, опционален |
| `InlineQueryResultCachedMpeg4Gif` | `mpeg4_file_id` | есть, опционален |

Прямой fetch `core.telegram.org/bots/api` обрывался до раздела Inline mode (страница слишком
длинная для одного прохода инструмента) — поэтому таблицы полей сверены зеркалом
[python-telegram-bot docs](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultphoto.html)
([Gif](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultgif.html),
[CachedPhoto](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultcachedphoto.html),
[CachedGif](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultcachedgif.html),
[Mpeg4Gif](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultmpeg4gif.html),
[CachedMpeg4Gif](https://docs.python-telegram-bot.org/en/stable/telegram.inlinequeryresultcachedmpeg4gif.html)) —
эта библиотека генерирует описания полей из официального описания Bot API дословно (стандартная
практика всех типизированных обёрток), совпадение подтверждено независимо ещё и через поисковые
сниппеты GramIO/aiogram/Rust `telegram-bot-api` с идентичной структурой полей. Прямого текста
самой `core.telegram.org/bots/api` для этого пункта получить не удалось — техническое ограничение
инструмента (см. п.5), не пробел в самом знании.

## 2. Видит ли и может ли нажать кнопку получатель, который бота никогда не запускал?

**Да** — и это ключевой механизм, который делает inline mode принципиально другим путём, чем
прямая рассылка. Официальная страница
[`core.telegram.org/api/bots/inline`](https://core.telegram.org/api/bots/inline) прямо описывает:
получатель (даже не открывавший бота) видит медиа и может нажимать кнопки; нажатие кнопки
`callback_data` рождает `updateInlineBotCallbackQuery` с `InputBotInlineMessageID` — тем же
механизмом, что и `CallbackQuery.inline_message_id` в Bot API. Сообщение доставляется не ботом
(бот никого не «пушит»), а клиентом Telegram, когда отправитель сам выбрал результат и отправил
его — с точки зрения Telegram это обычное пользовательское сообщение с пометкой `via_bot_id`,
поэтому запрет на «бот не может писать незнакомцу первым» тут не применяется: первым пишет
человек, а не бот.

**Важная оговорка (не додумано, а из документации): не все типы кнопок одинаково работают.**
- `callback_data`-кнопки и обычные `url`-кнопки — работают без ограничений, получатель может
  нажать, даже не запуская бота.
- Кнопка `web_app` (открывает Mini App прямо, с `initData`) — **официально ограничена**:
  «Available only in private chats between a user and the bot» — подтверждено дословной цитатой
  из [PTB `InlineKeyboardButton`](https://docs.python-telegram-bot.org/en/stable/telegram.inlinekeyboardbutton.html),
  которая мирроит официальное описание поля Bot API.
  **И это не просто «не откроется» — Telegram отклоняет сам вызов `answerInlineQuery`** с
  `web_app`-кнопкой в `reply_markup` ошибкой `400: Bad Request: BUTTON_TYPE_INVALID` — живой
  репорт с этой самой ошибкой:
  [telegraf/telegraf issue #1936](https://github.com/telegraf/telegraf/issues/1936)
  (не официальный источник, но это лог реальной ошибки от Telegram Bot API, а не мнение автора
  репорта). Значит кнопку «Играть», открывающую Mini App, через inline mode нельзя сделать
  `web_app`-кнопкой в принципе — нужен обходной путь (п.3).

## 3. Как реально работает `switchInlineQuery` и это ли механизм Gamee/Gorilla Case?

Подтверждено [`core.telegram.org/bots/webapps`](https://core.telegram.org/bots/webapps) (через
Mini App JS API) и перекрёстно через документацию клиентских библиотек: `switchInlineQuery(query)`
вставляет `@botname query` в поле ввода выбранного пользователем чата — пользователь жмёт кнопку
внутри Mini App → Telegram просит выбрать чат (или открывает текущий) → подставляет текст запроса
→ клиент бота получает `answerInlineQuery` с результатами → пользователь тапает один результат →
Telegram отправляет его как обычное сообщение в выбранный чат. Три варианта поведения
(`switch_inline_query_current_chat`, `switch_inline_query` (выбор чата), `switch_inline_query_chosen_chat`
(с фильтром типов чатов — приватные/группы/каналы/боты) — это ровно тот паттерн «выбери, кому
отправить приглашение», которым и пользуются игры уровня Gamee.

**Как именно Gamee технически собирает кнопку «Играть» — подтверждено косвенно, не первоисточником
самого Gamee (у них нет публичного техотчёта), но логически единственный путь, совместимый с
ограничением из п.2:**
- Либо классическая **Telegram Games Platform** (`core.telegram.org/bots/games`, старый
  предшественник Mini Apps) — `InlineQueryResultGame` + кнопка `callback_game` (обязана быть
  первой в первой строке) — Telegram сам подставляет кнопку «Играть», нажатие рождает
  `CallbackQuery` с `game_short_name`, бот отвечает `answerCallbackQuery(url=...)` со ссылкой на
  HTML5-страницу игры. Этот путь официально существует именно для таких кейсов и не имеет
  ограничения «только приватный чат».
- Либо (актуальный путь для Mini Apps, не игровой платформы) — обычная **`url`-кнопка**, а не
  `web_app`, со ссылкой формата **Direct Link Mini App** `https://t.me/<bot>/<short_name>?startapp=...`
  ([`core.telegram.org/bots/webapps`](https://core.telegram.org/bots/webapps), раздел Direct Link
  Mini Apps). `url`-поле `InlineKeyboardButton` не имеет ограничения «только приватный чат»
  (в отличие от `web_app`) — подтверждено дословным описанием поля через PTB-зеркало: «HTTP or
  tg:// url to be opened when the button is pressed», без оговорки про приватность. По внешним
  источникам такая прямая ссылка открывается тапом даже теми, кто бота не запускал — это
  подтверждено формулировкой официальной доки про предназначение Direct Link Mini Apps
  («доступны для расшаривания в любом чате»), но дословную цитату именно этой фразы
  зафиксировать не удалось (инструмент дал перефраз, не цитату) — **этот конкретный момент стоит
  считать «весьма вероятно, но не железно процитировано из первоисточника»**, если для решения
  важна стопроцентная гарантия — стоит проверить один живой тест (создать тестовую inline-кнопку
  с `url` на Direct Link Mini App, отправить в чат со вторым, ранее не открывавшим бота аккаунтом).

## 4. Гочи/ограничения/настройка

- **BotFather**: inline mode для бота нужно явно включить (`/setinline`) — стандартный,
  многократно подтверждённый факт во всех источниках, включая официальный
  [`core.telegram.org/api/bots/inline`](https://core.telegram.org/api/bots/inline).
- **`cache_time`**: параметр `answerInlineQuery`, по умолчанию **300 секунд** — результаты могут
  кэшироваться сервером Telegram на это время; при изменяющихся данных (например, счёт игрока)
  разумно ставить меньше или 0. Подтверждено согласованно несколькими зеркалами документации
  (R-обёртка [`telegram.bot`](https://rdrr.io/cran/telegram.bot/man/answerInlineQuery.html),
  [python-telegram-bot](https://docs.python-telegram-bot.org/en/v13.9/telegram.bot.html)) —
  дословный текст самой `core.telegram.org/bots/api` для этого поля не зафетчился напрямую
  (то же техническое ограничение из п.5), но независимое совпадение в нескольких source-of-truth
  обёртках даёт высокую уверенность.
- **`is_personal`**: если результаты персональные (например, зависят от текущего счёта игрока) —
  обязательно `true`, иначе Telegram может отдать чужой закэшированный ответ другому пользователю
  с тем же текстом запроса.
- **Картинка по URL vs `file_id`**: `InlineQueryResultPhoto`/`Gif`/`Mpeg4Gif` тянут файл по
  публичному HTTPS URL «на лету» (Telegram сам скачивает и кэширует при первом использовании) —
  никакой предзагрузки не требуется, но URL должен быть стабильно доступен. `InlineQueryResultCached*`
  требует, чтобы файл уже был на серверах Telegram (обычно — заранее один раз загружен ботом
  через `sendPhoto`/`sendAnimation` и `file_id` сохранён) — это быстрее и не требует держать
  свой хостинг под нагрузкой в реальном времени, но требует шаг предзагрузки.
- **Формат/размер фото**: JPEG, не более 5 МБ — подтверждено PTB-документацией (мирроит
  официальное ограничение). Для GIF/MPEG4GIF конкретные лимиты по размеру у Telegram отдельно не
  зафиксированы дословно в этой сессии — если для функции это критично, стоит проверить отдельным
  вопросом/живым тестом, не додумывать число.
- **Жёсткая несовместимость**: `web_app`-кнопка внутри результата `answerInlineQuery` —
  Telegram отклоняет вызов целиком (`BUTTON_TYPE_INVALID`, см. п.2) — это не «баг, который может
  починиться», а официальное ограничение поля `web_app` («только приватный чат с ботом»),
  проявляющееся здесь как жёсткая ошибка API, а не как «кнопка есть, но не работает».

## 5. Источники и что осталось неподтверждённым дословной цитатой

**Официальные первоисточники, процитированные напрямую в этой сессии:**
- [`core.telegram.org/api/bots/inline`](https://core.telegram.org/api/bots/inline) — end-to-end
  механизм inline mode, поведение для получателя без стартованного бота, `switch_pm`.
- [`core.telegram.org/bots/webapps`](https://core.telegram.org/bots/webapps) — `switchInlineQuery`,
  Direct Link Mini Apps, `web_app` vs `url` кнопки.

**Официальный источник, до которого не удалось дотянуться прямой цитатой в этой сессии:**
- [`core.telegram.org/bots/api`](https://core.telegram.org/bots/api) — сама страница описания
  Bot API методов/типов слишком длинная для одного прохода fetch-инструмента в этой среде; раздел
  Inline mode идёт после раздела Stickers, глубоко в документе, и инструмент обрывался раньше.
  Для полей (`reply_markup`, `cache_time`, `is_personal`, лимиты полей `InlineQueryResult*`)
  использовано зеркало python-telegram-bot (генерируется из тех же официальных описаний,
  независимо перепроверено через GramIO/aiogram/Rust-обёртку/R-обёртку — совпадение полное).
  Если владельцу нужна стопроцентная дословная цитата именно с `core.telegram.org/bots/api` —
  это можно дочитать вручную по частям (постранично/через поиск по якорям в браузере), не через
  fetch-инструмент этой сессии.
- Живого технического отчёта именно от Gamee/Gorilla Case о том, какой конкретно механизм
  (Games Platform vs Direct Link Mini App через `url`-кнопку) они используют, не нашлось — вывод
  в п.3 логический (единственные два способа, совместимые с официальным ограничением `web_app`),
  не факт из первых уст разработчиков этих ботов.

## Итоговый ответ на вопрос владельца

**Да, третий путь реален и подтверждается официальной документацией**: `answerInlineQuery` с
`InlineQueryResultPhoto`/`Gif`/`CachedPhoto`/`CachedGif`/... поддерживает одновременно картинку/GIF
и `reply_markup` с `inline_keyboard`; получатель, не открывавший бота, видит медиа и может нажимать
`callback_data`- и `url`-кнопки (это не блокируется). **Одно жёсткое архитектурное ограничение**:
кнопку с прямым открытием Mini App нельзя сделать типом `web_app` внутри inline-результата
(Telegram отклонит вызов) — нужна `url`-кнопка на Direct Link Mini App
(`t.me/<bot>/<short_name>?startapp=...`) или переход на классическую Games Platform. Это меняет
дизайн кнопки «Играть»/«Вызов», но не саму принципиальную осуществимость идеи.
