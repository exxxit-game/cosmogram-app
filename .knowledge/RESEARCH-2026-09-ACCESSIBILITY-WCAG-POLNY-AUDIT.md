# ♿ Полный аудит доступности: WCAG 2.2 применительно к Canvas-игре (17.09.2026)

> Пункт №5 из открытого списка `.knowledge/PLAN-OBUCHENIYA-CLAUDE.md` («Доступность —
> уже есть CALM_FX 40%, но не сверено с полным чек-листом WCAG отдельно»). Read-only
> исследование: код не трогался, коммитов нет. Метод — сначала перечитать, что уже
> реально задокументировано и что реально в живом коде (grep, не память), потом искать
> вглубь многоязычно (английский — официальные стандарты и форумы разработчиков; русский
> — рунет/Хабр; немецкий и французский — другая юридическая/практическая культура),
> до честного падения отдачи. Ниже — не техзадание и не список правок; по правилу проекта
> «не додумывать конкретику» конкретные пороги/подходы не предлагаются, только находки.

---

## 0. Что уже сделано и НЕ переоткрывается здесь

Прочитано целиком перед началом поиска — эти темы закрыты, ниже они не дублируются:

- **`.knowledge/COLOR-REGISTRY.md`** (08.09.2026, свежий) — дальтонизм полностью закрыт:
  симуляция Brettel/Viénot/Mollon, палитра Okabe-Ito (не Тол, как было в ТЗ — в файле
  именно Okabe-Ito, 8 цветов, Color Universal Design 2002), формула WCAG-контраста
  `(L1+0.05)/(L2+0.05)` с порогом 3:1 для нетекстовой графики (SC 1.4.11), плюс честная
  оговорка, что даже 3:1+ не гарантия при полупрозрачном свечении — нужен живой рендер.
- **`.knowledge/RESEARCH-2026-09-MENU-REDESIGN-RU-ACCESSIBILITY.md`** (15.09.2026) —
  карусель режимов главного экрана: авто-прокрутка без паузы (нарушение WCAG SC 2.2.2),
  нет ARIA-разметки позиции слайда, свайп без однокликовой альтернативы (SC 2.5.1),
  порог choice-overload (>7 вариантов) уже достигнут 7 карточками. Уже найдено и
  задокументировано — здесь только ссылаюсь, не переисследую.
- **`.knowledge/ACCESSIBILITY-GUIDE.md`** §7 (27.08.2026) — Canvas и скринридеры:
  главный `<canvas>` без атрибутов доступности, `aria-live` только на `#toast`,
  WCAG 1.1.1 (Non-Text Content) без исключения для игр (проверено по тексту стандарта),
  EAA не включает геймплей в Annex I напрямую. Ниже это подтверждается заново живым
  кодом (раздел 2) и расширяется новыми источниками (раздел 4), но не переоткрывается
  с нуля.
- **`.knowledge/PLAYER-EXPERIENCE-GUIDELINES.md`** — motion actuation (WCAG 2.5.4),
  фотосенситивность (2.3.1), coyote time (закрыт как ложная тревога формулировки,
  не идеи), буфер ввода, прощающий хитбокс (уже есть).
- **`.knowledge/CHARTER.md`** гл. II ст. 6-10 — прочитана, сверена с кодом в разделе 5
  ниже («Разрыв между декларацией и кодом»).

---

## 1. Живой код на 17.09.2026 (grep, не по памяти)

Версия на момент проверки: `GAME_VERSION = '1.478.354'` (`js/core.js:537`).

**Есть в коде:**
- `* { ...; -webkit-tap-highlight-color:transparent; }` (`index.html:252`) — глобальный
  сброс, но БЕЗ глобального `outline:none` и без `:focus-visible` нигде в файле (0
  совпадений). То есть `role="button" tabindex="0"` (используется массово — `#pauseBtn`,
  все `.setRow`, свитчи настроек, ~40+ мест) держат браузерный focus ring по умолчанию,
  своего кастомного фокус-индикатора нет вообще. Это не нарушение SC 2.4.7 (какой-то
  индикатор есть), но и не проверенное поведение — реальный вид дефолтного ринга на
  тёмном фоне игры в WebView Telegram (Android/iOS) не проверялся визуально в рамках
  этого исследования (правило «мерить, не гадать» — для этого нужен живой скриншот,
  не код).
- `outline:none` встречается 5 раз — все на текстовых `<input>`/`<textarea>`
  (`.forgeValInput`, `.atval input`, `.csInput`, диалог обратной связи), и все — с заменой
  на `border-color`-эффект при `:focus`. Это стандартный, не проблемный паттерн.
- `aria-live="polite" role="status"` — только на `#toast` (`index.html:3731`), как и
  зафиксировано в ACCESSIBILITY-GUIDE.md §7 — подтверждено заново, актуально.
- `role="button"`/`role="switch"`/`aria-checked`/`aria-label`/`aria-hidden` — используются
  последовательно и грамотно в экранах настроек, обратной связи, Мастерской, Кузницы.
  Привычка размечать доступность в проекте есть — просто не везде (карусель, canvas).
- `<canvas id="game">` (`index.html:3712`) — **ноль атрибутов доступности**: ни `role`,
  ни `aria-label`, ни `aria-hidden`, ни fallback-контента внутри тега. Подтверждено
  заново.
- `alt=` — **ноль совпадений во всём `index.html`**. У игры нет обычных `<img>` — всё
  через inline SVG (`<use href="#i-...">`) или Canvas 2D, поэтому это не автоматически
  нарушение SC 1.1.1 (у SVG свой путь через `aria-hidden`/`<title>`, у игры он
  частично используется — `aria-hidden="true"` на декоративных иконках корректно), но
  ни одна иконка не несёт содержательного `aria-label` кроме кнопок «Назад»/«Видео
  полётов»/«Пожаловаться».
- `prefers-reduced-motion` — 6 мест в `index.html`/`js/core.js`/`js/render.js`,
  включая глобальное `*{ animation:none !important; transition:none !important; }`
  (`index.html:795`). Подтверждено, работает на уровне CSS для UI-анимаций; для
  игрового canvas-рендера подключено через `RM` флаг в `core.js:1370` отдельно.
- **`A11Y_SPEED`** (`js/game.js:1431`) — объявлена как `let A11Y_SPEED=1` и передаётся
  в `baseTimeScale()` (`game.js:2012`) как один из потолков замедления времени (наравне
  со `slowmo`, `dying`, `pausing`). **Находка: переменная существует в цепочке расчёта,
  но нигде в коде не присваивается никакое другое значение — нет тумблера в настройках,
  нет UI, который бы её менял.** То есть архитектурный крючок для «пилот с тремором
  получает замедление времени» (Хартия ст. 8) технически уже проложен на уровне
  движка, но не подключён ни к какому переключателю — это открытие для раздела 5,
  не для тихой правки.
- Клавиатурное управление (`js/input.js:805-824`) — `ArrowLeft/KeyA`, `ArrowRight/KeyD`
  реализовано и рабочее (одно из «5 штурвалов»). Полей `ArrowUp/ArrowDown` в этой же
  функции не встретилось при выборке (см. offset выше) — не проверялось глубже, не
  входило в задачу этого исследования.
- `coyote`, `sonar`, `radar`, `эхолокац` — 0 совпадений в `js/*.js` (grep), подтверждает
  ACCESSIBILITY-GUIDE.md: звуковой радар — роадмап, не код.
- Полей ввода типа `password`/промокод/инвайт-код с требованием запомнить/ввести код
  — 0 совпадений в `index.html`. Значимо для раздела 4.5 (Accessible Authentication).

---

## 2. WCAG 2.2 применительно именно к Canvas-игре — что применимо, что нет

Главный честный вывод этого раздела, подтверждённый несколькими независимыми
источниками: **WCAG написан для веб-контента, и заметная часть его 87 критериев
(WCAG 2.2, три уровня A/AA/AAA) либо не имеет смысла для игрового canvas, либо
адресует только его немодальную обвязку** (меню, настройки, диалоги, текст) —
([abratabia.com/game-accessibility/accessibility-guidelines](https://www.abratabia.com/game-accessibility/accessibility-guidelines.php)):
«WCAG has no criteria for real-time interaction difficulty, no framework for input
remapping, no guidance on aim assist or motor accommodation in gameplay, and no
concept of adjustable game speed... WCAG was designed for static or mildly interactive
content, and games exceed its scope in fundamental ways.» Практическая формулировка
того же источника: применять WCAG 2.1 AA ко ВСЕМУ, что не является реал-тайм игровым
canvas (меню, настройки, HUD-текст, диалоги), и отдельно — «разумные» accessibility-фичи
геймплея через более специализированные своды (Xbox Accessibility Guidelines,
Game Accessibility Guidelines — см. §3).

### 2.1. Применимо к Cosmogram напрямую (вне игрового полёта)

- **SC 1.1.1 Non-text Content (A)** — применимо к canvas как единому визуальному
  объекту (см. §4 ниже, отдельная тема) и к иконкам без `aria-label`.
- **SC 1.4.3/1.4.11 Contrast (AA)** — текстовый контраст в меню/настройках не
  проверялся здесь (не входило в задачу — это UI-контраст текста, не игровых
  объектов; последний уже закрыт COLOR-REGISTRY.md). Открытый пробел, не находка.
- **SC 2.2.2 Pause, Stop, Hide (A)** — уже найдено и не переоткрывается (карусель,
  см. §0).
- **SC 2.4.7 Focus Visible (AA) / 2.4.11 Focus Not Obscured (AA, новый в 2.2)** —
  применимо к `.setRow`/кнопкам меню при клавиатурной навигации; см. находку §1 про
  отсутствие кастомного `:focus-visible` — не нарушение по факту дефолтного ринга,
  но не подтверждено визуально.
- **SC 2.5.7 Dragging Movements (AA, новый в 2.2)** — применимо к любому drag-жесту
  вне игры (не проверялось отдельно — конструктор/Мастерская используют перетаскивание
  точек, `ptUndoBtn` есть, но есть ли однокликовая альтернатива перетаскиванию — не
  проверено, честный пробел).
- **SC 2.5.8 Target Size Minimum (AA, новый в 2.2, 24×24px)** — уже задокументированное
  расхождение (`#overQuiet .btn`, 40px — выше юридического минимума 24px, ниже
  собственного стандарта проекта 44px), см. ACCESSIBILITY-GUIDE.md §4, не переоткрываю.
- **SC 3.3.7 Redundant Entry (A, новый) / 3.3.8-3.3.9 Accessible Authentication
  (новые)** — см. §4.5, применимость низкая по структурной причине.

### 2.2. Формально неприменимо или бессмысленно для реал-тайм canvas-геймплея

- Любые критерии о заголовках страниц, семантической структуре документа, порядке
  чтения DOM (SC 1.3.x «Info and Relationships», 2.4.6 «Headings and Labels» и т.п.)
  — canvas не DOM-контент, эти критерии физически не применимы к самому полёту,
  только к окружающим экранам (которые у Cosmogram и так частично размечены, см. §1).
- Критерии про формы и ввод данных (например часть 3.3.x) — у игры почти нет форм
  (кроме текстового поля обратной связи и никнейма в Кузнице/Конструкторе — не
  проверялось глубоко в рамках этого исследования).
- Согласно абратабиа.com и общей позиции индустрии — реал-тайм тайминг, точность
  прицеливания, скорость реакции внутри самого геймплея — вне словаря WCAG в принципе;
  это домен Xbox Accessibility Guidelines/Game Accessibility Guidelines, не WCAG.

---

## 3. Game Accessibility Guidelines — Basic-уровень построчно против Cosmogram

Источник: [gameaccessibilityguidelines.com/full-list](https://gameaccessibilityguidelines.com/full-list/)
— три уровня (Basic/Intermediate/Advanced), группировка Motor/Cognitive/Vision/
Hearing/Speech/General. Ниже — **полный Basic-уровень**, честно сверенный с тем, что
уже подтверждено в `.knowledge/` или найдено grep'ом в этом исследовании (раздел 1).
Не углубляюсь в Intermediate/Advanced — задача была про базовый чек-лист.

| Guideline (Basic) | У Cosmogram — что известно |
|---|---|
| **Motor** | |
| Adjust game speed | Частично — `A11Y_SPEED` в движке есть, но не подключена к UI (см. §1, находка) |
| Toggle/slider for haptics | Есть — «Виброотклик»/«Виброэфир» переключатели (`setVibroBtn`/`setMorseHapBtn`) |
| Large, well-spaced interactive elements | Частично — известное расхождение 40px vs 44px, см. §0 |
| Adjust control sensitivity | Есть — «Чувствительность» ×1 цикл-строка в настройках |
| Same input method for UI and gameplay | Не проверялось отдельно в этом исследовании |
| Simple controls / simpler alternative | 5 штурвалов заявлено (палец/гироскоп/мышь/клавиатура/геймпад) — согласуется |
| Remappable controls | Есть — `setKeyLeftBtn`/`setKeyRightBtn`/`setKeyUpBtn`/`setKeyDownBtn` |
| **Cognitive** | |
| Avoid flickering/repetitive patterns | Есть — SC 2.3.1 в PLAYER-EXPERIENCE-GUIDELINES.md, ≤3 вспышки/сек |
| Progress through text prompts at own pace | Не проверялось |
| Interactive tutorials | Не проверялось в рамках этого исследования |
| Simple clear language | Не проверялось (тема лингвистики UI, не a11y-специфика) |
| Start game without multi-level menus | Карусель режимов — 1 тап от главного экрана, но сама карусель имеет свои проблемы (см. §0) |
| Simple clear text formatting / readable font size | Есть отдельная настройка «Размер текста» (`setTextScaleBtn`, 100% цикл) |
| **Vision** | |
| High contrast text/UI vs background | Есть отдельный тумблер «Высокий контраст» (`setContrastBtn`) |
| No essential info by fixed colour alone | Частично закрыто COLOR-REGISTRY.md (дальтонизм) — геометрические маркеры минералов упомянуты в ACCESSIBILITY-GUIDE.md §3 |
| Large, well-spaced interactive elements | См. Motor выше |
| **Hearing** | |
| Separate volume controls (effects/speech/music) | Частично — «Звук»/«Музыка» раздельные тумблеры есть, речи как таковой в игре нет |
| No essential info by sound alone | Не проверялось — комбо/предупреждения дублируются визуально по описанию ACCESSIBILITY-GUIDE.md, не проверено заново здесь |
| **Speech** | Не применимо — в игре нет речевого ввода |
| **General** | |
| Solicit accessibility feedback | Есть — экран обратной связи (`feedbackBackBtn` и др.) |
| Settings saved/remembered | Не проверялось технически (вероятно да, localStorage — не подтверждено grep'ом в этом заходе) |
| Wide choice of difficulty levels | Есть игровые режимы, но «уровни сложности» в классическом смысле — не проверялось |

**Честный вывод:** из ~26 пунктов Basic-уровня GAG у Cosmogram есть явные, проверенные
кодом реализации минимум у 12-14, часть не проверялась в рамках этого захода (не
значит «нет» — значит «не смотрел»), и минимум один явный структурный пробел —
`A11Y_SPEED` объявлена, но не подключена к настройке.

---

## 4. Специфичные, менее задокументированные углы

### 4.1. Мобильные игры с управлением наклоном — практика доступности

Специфика Cosmogram (гироскоп-раннер) — предметно менее задокументированный угол, чем
клавиатурные/геймпадные игры. Академическая литература по tilt-контролю
([sciencedirect.com — Tilt-Touch Synergy](https://www.sciencedirect.com/science/article/abs/pii/S187595211730037X);
[yorku.ca/mack — Tilt-Controlled Mobile Games](https://www.yorku.ca/mack/ieeegem2014a.html))
рассматривает tilt в основном с точки зрения эргономики и точности ввода, не
доступности напрямую. Прямых предметных рекомендаций именно для акселерометр-раннеров
не нашлось — общий консенсус (AbleGamers,
[ablegamers.org — Assistive Technology for Mobile Gaming](https://ablegamers.org/assistive-technology-for-mobile-gaming-tools-and-apps-that-make-a-difference/))
сводится к тому же, что уже знает проект: обязательная сенсорная/кнопочная
альтернатива наклону, регулируемая чувствительность и мёртвая зона (см. известное
расхождение ACCESSIBILITY-GUIDE.md §5 — раздел описывает требование, `js/gyro.js`
пока не реализует ползунки). Исследование для тремор-специфичных мобильных
клинических данных существует
([ncbi.nlm.nih.gov/pmc/PMC5051962 — Democratizing Neurorehabilitation](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5051962/))
— вывод исследования: свайп/тап часто надёжнее наклона и джойстика для людей после
инсульта с гемиплегией, что косвенно подтверждает необходимость несенсорной
альтернативы, но методология исследования — реабилитация, не игровой a11y напрямую,
переносить как прямую рекомендацию нечестно.

### 4.2. Скринридеры и Canvas — честный ответ «почти никто не решает полностью»

Подтверждено многократно и независимо на трёх языках:
- **Английский**, техническая сторона: «The canvas element that renders on screen is
  not accessible to screen readers because the content is not in the DOM and has no
  accessibility semantics» ([pauljadam.com/demos/canvas](https://pauljadam.com/demos/canvas.html);
  [tpgi.com/html5-canvas-sub-dom](https://www.tpgi.com/html5-canvas-sub-dom/)).
  Практические обходы существуют (ARIA `role="img"` + `aria-label`, «shadow DOM»
  дублирующая разметка позади canvas, библиотека
  [p5.accessibility](https://github.com/evapphilips/p5.accessibility) для p5.js) —
  но все они требуют осознанной, ручной, недешёвой работы, не «включаются» сами
  собой ни одним атрибутом.
- **Форум AudioGames.net** (прямой фетч дал 403, но поисковый сниппет цитируется
  честно, не выдаётся за прямую цитату): по описанию из поиска — рабочий, но
  «far less than ideal» паттерн для VoiceOver — сфокусировать canvas как единый блок,
  дождаться, пока скринридер дочитает, нажать пробел для старта; для других
  скринридеров нестабильно.
- **Русский, Хабр**: «Для NVDA canvas — это единое растровое изображение без
  отдельных объектов (кнопок, текста), которые можно было бы опросить через API» —
  подтверждает то же самое независимо на другом языке
  ([habr.com/ru/articles/822409](https://habr.com/ru/articles/822409/)).

**Genre-релевантный контрпример, важная находка:** truly доступные для незрячих
эндлесс-раннеры **существуют**, но НЕ как патч поверх визуальной игры, а как игры,
спроектированные звуком с нуля:
- **BlindRun** (iOS) — «wasn't adapted for accessibility — it was designed for it
  from day one. Every obstacle has a unique sound, stereo audio tells you whether
  danger is on the left or right, and haptic feedback confirms every action... playable
  with VoiceOver turned on» ([apps.apple.com/blindrun](https://apps.apple.com/us/app/blindrun-accessible-game/id6781393835)).
- **FEER: The Game of Running Blind** (iOS/Android) — тот же жанр, «designed primarily
  as an audio game that is fully functional with a smartphone's screen reader»
  ([afb.org/aw/19/11/15145](https://afb.org/aw/19/11/15145)).

Это прямо подтверждает то, что уже написано в ACCESSIBILITY-GUIDE.md §7: полная
играбельность вслепую — не a11y-патч для готовой визуальной игры, а отдельное
архитектурное решение с нуля. BlindRun/FEER — доказательство, что для именно этого
жанра (эндлесс-раннер) это решаемая, но не «дописываемая сбоку» задача.
Отдельная **русская терминология** — Хабр использует слово «тифлоигры» (от
греч. Typhlos — слепой) для игр этого класса, с честной оговоркой в источнике про
рынок: «мало игр — мало игроков — мало прибыли», несмотря на ~39 млн незрячих людей
в мире по данным ВОЗ ([habr.com/ru/articles/189984](https://habr.com/ru/articles/189984/)).

### 4.3. Немецкий угол — другой юридический вывод, не просто перевод английского

Ключевая, предметная находка, отличная от англо-американского WCAG-чтения:
**официальная немецкая позиция — BITV (обязательный стандарт доступности госсектора,
BITV 2.0, май 2019) прямо НЕ применяется к играм** — «BITV guidelines cannot be used
for games, since they do not account for the special properties of computer games.
The games industry needs specially developed recommendations for avoiding barriers
in computer and video games» — источник:
[inklusive-medienarbeit.de](https://www.inklusive-medienarbeit.de/themenmonat-3-computerspiele-und-unterstuetzende-technologien-computerspiele-und-barrierefreiheit/).
Это не тот же вывод, что у EAA (EAA не включает геймплей в Annex I, но формально не
исключает игры явно, см. §0/ACCESSIBILITY-GUIDE.md) — BITV прямо и явно исключает игры
как категорию, с явным обоснованием «особые свойства компьютерных игр». Практическое
следствие для немецкой игровой индустрии — существует отдельная инициатива
«Gaming ohne Grenzen» и немецкий переводчик-энтузиаст (Daniel Heinz, Spieleratgeber
NRW) переводил Game Accessibility Guidelines на немецкий — то есть немецкая практика
идёт по тому же англоязычному своду GAG (не изобретает свой), просто явно признаёт,
что национальный юридический стандарт (BITV) для игр неприменим. Прямая ссылка на
переводную страницу (`gameaccessibility.de`) технически недоступна для проверки в
этом заходе (DNS-ошибка при фетче) — честно фиксирую, не выдаю за прочитанное.

### 4.4. Французский угол — RGAA неопределён по играм, но живая индустрия есть

**RGAA (французский юридический стандарт, актуальная версия 4.1.2, опирается на
WCAG 2.1, выравнивается с EN 301 549)** — прямого текста, включающего или исключающего
именно видеоигры, найти не удалось (честный пробел, не выдумываю формулировку). RGAA
юридически обязателен для госорганов с 2012 и для крупных компаний с 2020
([galadrim.fr — Les Normes RGAA](https://galadrim.fr/blog/les-normes-rgaa-et-laccessibilite-numerique/)),
но специфика применения к играм в найденных источниках не разбирается — та же
структурная неопределённость, что и у WCAG в целом, без немецкой прямоты BITV.

Предметно интереснее — **живая французская индустрия accessibility-в-играх смотрит
не только на цифровой compliance, а и на физические/тактильные решения**, отличие
от англо-американского digital-first чтения:
- **AccessiJeux** (с 2015, основана людьми включая слабовидящего сооснователя) —
  делает НАСТОЛЬНЫЕ игры доступными через тактильный рельеф, брайль, аудио-помощники
  ([fr.wikipedia.org/wiki/Accessijeux](https://fr.wikipedia.org/wiki/Accessijeux)) —
  показательно другой угол: французская культура доступности в играх исторически
  сильна именно в тактильном/физическом направлении, не только цифровом.
- **CapGame** и **Level 256** (Paris&Co) — именно видеоигровые французские
  инициативы, работают с киберспортом/инклюзией разработчиков-инвалидов.
- **Be Player One** — французский стартап, аппаратные технические средства для
  игроков с сильно ограниченной подвижностью/силой.
(Источники: подборка через [portail-handicap.fr/jeu-video-accessible](https://portail-handicap.fr/sport-loisirs-culture/jeu-video-accessible/),
[slate.fr — Lentement mais sûrement](https://www.slate.fr/story/185076/gamers-situation-handicap-bataille-accessibilite-jeux-video).)
Для Cosmogram (чисто цифровая TMA-игра, без физического распространения/устройств)
французский тактильный угол малоприменим напрямую, но подтверждает: доступность в
играх — не только про соответствие стандарту, но и про альтернативные физические
каналы, тема, которую англоязычный WCAG-чеклист не поднимает вообще.

### 4.5. Когнитивная доступность WCAG 2.2 — применимость к казуальной аркаде

Девять новых критериев WCAG 2.2
([w3.org/WAI/standards-guidelines/wcag/new-in-22](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)):
2.4.11/2.4.12 Focus Not Obscured, 2.4.13 Focus Appearance, 2.5.7 Dragging Movements,
2.5.8 Target Size Minimum, 3.2.6 Consistent Help, **3.3.7 Redundant Entry**,
**3.3.8/3.3.9 Accessible Authentication**.

Именно когнитивные из них — Redundant Entry и Accessible Authentication — **структурно
малоприменимы к Cosmogram**, и это честный, проверенный вывод, не отговорка: игра не
имеет собственной формы логина/пароля (grep §1 — 0 полей типа `password`, 0
промо/инвайт-кодов) — вход идёт через делегированный OAuth Telegram/Discord/Google,
то есть само требование «cognitive function test» (запомнить пароль/решить головоломку)
физически происходит НЕ в UI игры, а на стороне внешней платформы, вне её
контроля. Redundant Entry (не заставлять повторно вводить то, что уже вводили) —
применимо только если в игре появятся многошаговые формы (сейчас, по данным grep,
нет ни одной многошаговой формы с повторным вводом одних данных). Более широкая
W3C COGA-программа (Cognitive Accessibility Task Force,
[w3.org/TR/coga-usable](https://www.w3.org/TR/coga-usable/introduction.html)) даёт
общие паттерны («используйте уже знакомые иконки/термины, не изобретайте новые») —
применимо в принципе к любому UI, но не даёт специфики именно для игр, и предметных
готовых чек-листов для аркад в найденных источниках нет — честный пробел, не
натягиваю общий совет на конкретную рекомендацию.

---

## 5. Разрыв между декларацией Хартии и кодом

Только честное перечисление находок, без предложений решения — правило «не
додумывать конкретику» и правило «Хартия — ценности, не факт реализации».

1. **Ст. 8: «Незрячий пилот летит по звуковому радару»** — не реализовано. Grep по
   `sonar|radar|эхолокац|beep|proximity|ping` в `js/*.js` не находит игровой механики
   близости для незрячих (подтверждено заново, см. §1 и уже задокументировано в
   ACCESSIBILITY-GUIDE.md §7). Жанрово это решаемо (BlindRun/FEER, §4.2 доказывают
   это на том же типе игры), но требует архитектуры с нуля, не патча.
2. **Ст. 8: «Пилот с тремором получает замедление времени»** — частично, новая
   находка этого исследования. `A11Y_SPEED` уже встроена в `baseTimeScale()`
   (`js/game.js:1431, 2012`) как один из потолков расчёта скорости времени — то есть
   инженерный крючок для этого пункта Хартии уже существует в движке. Но переменная
   нигде не изменяется никаким UI-переключателем — то есть между «крючок в движке
   есть» и «пилот с тремором реально может это включить» разрыв остаётся.
3. **Ст. 6-7: «Одно небо для зрячего и незрячего»** — canvas `<canvas id="game">`
   не несёт ни `role`, ни `aria-label`, ни fallback-контента (подтверждено заново,
   §1). Без звукового радара (п.1) незрячий пилот физически не может участвовать в
   полёте ни при какой настройке экрана — расхождение прямое, не косвенное.
4. **Настройка чувствительности/мёртвой зоны наклона** (заявлена в
   ACCESSIBILITY-GUIDE.md §5 как требование Хартии в широком смысле «пилот выбирает,
   как летать») — `js/gyro.js` не содержит ползунков, только «откалибровано» тост на
   однократный сброс нуля. Уже задокументированное расхождение, подтверждено, что
   актуально на 17.09.2026 (версия не менялась в части gyro с 27.08.2026 по имеющимся
   данным — не проверялось построчно заново, полагаюсь на предыдущую фиксацию).
5. **Ст. 9-10: категории рекордов «Стандартное небо»/«Небо с поддержкой»** — не
   проверялось в этом заходе, требует отдельного исследования по таблицам рекордов/
   Supabase-схеме, вне объёма этого файла (честно помечаю как непроверенное, не
   «отсутствует»).

---

## 6. Приоритизированный список для будущего разговора с владельцем

Без предложения конкретных решений/порогов — только что обсуждать первым и почему.
Порядок — по комбинации (а) дешевизны находки и (б) степени, в которой она уже
подтверждена (не гипотеза).

1. **`A11Y_SPEED` — крючок есть, переключателя нет.** Самая дешёвая находка этого
   исследования: инженерная работа уже частично сделана (движок считает потолок
   времени с этой переменной), не хватает только решения, как и где её включать
   игроку. Стоит обсуждать первым, потому что здесь не нужно решать архитектуру
   заново — только принять решение об интерфейсе переключателя.
2. **Canvas без единого атрибута доступности.** Дёшево технически (одна атрибутная
   правка, не переделка рендера — как уже отмечено в ACCESSIBILITY-GUIDE.md §7), но
   не решает саму проблему незрячего игрока без звукового радара — обсуждать вместе
   с пунктом 3, не как самостоятельное «решение accessibility».
3. **Звуковой радар (Хартия ст. 8) — архитектурное решение, не патч.** BlindRun/FEER
   доказывают жанровую реализуемость, но ценой полного проектирования звука с нуля,
   не поверх существующего визуального рендера. Самый дорогой пункт из всех — стоит
   обсуждать, только когда/если владелец готов рассматривать это как отдельный
   архитектурный проект, не быстрый фикс.
4. **Ползунки чувствительности/мёртвой зоны наклона.** Уже задокументированное,
   не новое расхождение — но стоит держать в списке приоритетов, потому что это
   прямое, недорогое (UI + существующая калибровка) улучшение мотор-доступности,
   которое реально спроектировано в документе, просто не реализовано в `js/gyro.js`.
5. **Карусель режимов (WCAG 2.2.2/2.5.1).** Уже найдено 15.09.2026, не новое — но
   стоит в списке, потому что она единственный вход в игру с главного экрана,
   и найденное нарушение (авто-прокрутка без паузы) формально буквально совпадает
   с текстом критерия, не «похоже на».
6. **Target size 40px vs 44px (`#overQuiet .btn`).** Самый низкий приоритет из
   перечисленного — не нарушение закона (WCAG 2.5.8 = 24px минимум, у игры 40px),
   расхождение только с собственным более строгим стандартом проекта.

---

## Источники (сводка)

**Официальные стандарты:**
- [w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/) — WCAG 2.2 полный текст
- [w3.org/WAI/standards-guidelines/wcag/new-in-22](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) — 9 новых критериев
- [w3.org/TR/coga-usable/introduction](https://www.w3.org/TR/coga-usable/introduction.html) — W3C COGA
- [gameaccessibilityguidelines.com/full-list](https://gameaccessibilityguidelines.com/full-list/) — GAG Basic/Intermediate/Advanced

**Английский, аналитика/практика:**
- [abratabia.com/game-accessibility/accessibility-guidelines](https://www.abratabia.com/game-accessibility/accessibility-guidelines.php) — WCAG vs XAG для игр
- [pauljadam.com/demos/canvas](https://pauljadam.com/demos/canvas.html), [tpgi.com/html5-canvas-sub-dom](https://www.tpgi.com/html5-canvas-sub-dom/) — canvas и скринридеры
- [github.com/evapphilips/p5.accessibility](https://github.com/evapphilips/p5.accessibility)
- [apps.apple.com/blindrun](https://apps.apple.com/us/app/blindrun-accessible-game/id6781393835), [afb.org/aw/19/11/15145](https://afb.org/aw/19/11/15145) — жанровые примеры
- [sciencedirect.com Tilt-Touch Synergy](https://www.sciencedirect.com/science/article/abs/pii/S187595211730037X), [ablegamers.org](https://ablegamers.org/assistive-technology-for-mobile-gaming-tools-and-apps-that-make-a-difference/), [ncbi.nlm.nih.gov/pmc/PMC5051962](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5051962/)
- [playerresearch.com — EAA & Video Games, June 2025](https://www.playerresearch.com/blog/european-accessibility-act-video-games-going-over-the-facts-june-2025/), [igda-gasig.org — Demystifying EAA & GPSR](https://igda-gasig.org/what-and-why/demystifying-eaa-gpsr/)

**Немецкий:**
- [inklusive-medienarbeit.de — Computerspiele und Barrierefreiheit](https://www.inklusive-medienarbeit.de/themenmonat-3-computerspiele-und-unterstuetzende-technologien-computerspiele-und-barrierefreiheit/) — BITV не применим к играм
- `gameaccessibility.de` — немецкий перевод GAG, упомянут, прямой фетч не удался (DNS)

**Французский:**
- [galadrim.fr — Les Normes RGAA](https://galadrim.fr/blog/les-normes-rgaa-et-laccessibilite-numerique/)
- [fr.wikipedia.org/wiki/Accessijeux](https://fr.wikipedia.org/wiki/Accessijeux)
- [portail-handicap.fr/jeu-video-accessible](https://portail-handicap.fr/sport-loisirs-culture/jeu-video-accessible/)
- [slate.fr — Lentement mais sûrement](https://www.slate.fr/story/185076/gamers-situation-handicap-bataille-accessibilite-jeux-video)

**Русский:**
- [habr.com/ru/articles/822409](https://habr.com/ru/articles/822409/) — обзор игр для незрячих, canvas/NVDA
- [habr.com/ru/articles/189984](https://habr.com/ru/articles/189984/) — «BLIND GAMES — экзамен для игрового разработчика», термин «тифлоигры»

**Живой код проекта (grep 17.09.2026):**
- `index.html` — `#3712` `<canvas id="game">`, `#252` глобальный `*{}`, `#795`
  `prefers-reduced-motion`, `#3731` `#toast aria-live`, ~40 мест `role="button"
  tabindex="0"`, 5 мест `outline:none` (все на текстовых полях)
- `js/game.js` — `#1431` `let A11Y_SPEED=1`, `#2012` использование в `baseTimeScale()`
- `js/core.js` — `#537` `GAME_VERSION`, `#1370` `RM` флаг
- `js/input.js` — `#805-824` клавиатурное управление
- `.knowledge/CHARTER.md` — глава II, статьи 6-10
