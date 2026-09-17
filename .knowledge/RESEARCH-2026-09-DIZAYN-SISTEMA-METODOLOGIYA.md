# Методология дизайн-системы для UI/меню — как безопасно вести «огромные заходы» (17.09.2026)

> Владелец сказал прямо: «дизайна особо и нет», хочет заняться дизайном ВСЕЙ игры,
> возможно «огромными заходами» переделывать целиком все меню — не по мелочи, и
> прямо попросил изучить, как лучше всего через Claude Code создавать дизайн, «чтобы
> у нас не возникало постоянной ерунды». Это НЕ повтор `RESEARCH-2026-09-MENU-REDESIGN-*`
> (те — про конкретику экрана выбора режима) и НЕ повтор `RESEARCH-2026-09-MENU-STYLE-AUDIT`
> (тот — аудит того, что уже есть в коде). Это методология процесса: каким артефактом и
> в каком порядке вести саму работу дизайна, до того как макет №1 вообще нарисован.
> Поиск на английском, русском, японском, китайском. Код не трогался, макетов не
> создавалось, ничего не коммитилось — только один файл исследования.

## 1. Методология дизайн-систем на практике

### Atomic Design (Brad Frost)

[Atomic Design Methodology, Chapter 2](https://atomicdesign.bradfrost.com/chapter-2/) — сам
первоисточник:

> «Atoms are UI elements that can't be broken down any further and serve as the elemental
> building blocks of an interface.»

> «Atomic design is not a linear process, but rather a mental model to help us think of our
> user interfaces as both a cohesive whole and a collection of parts at the same time.»

> «Molecules are collections of atoms that form relatively simple UI components. Organisms
> are relatively complex components that form discrete sections of an interface. Templates
> place components within a layout and demonstrate the design's underlying content structure.
> Pages apply real content to templates and articulate variations to demonstrate the final UI.»

Ключевая формулировка методологии в целом (не с сайта Фроста, а из вторичного разбора):
[designsystems.com — «Brad Frost's Atomic Design: build systems, not pages»](https://www.designsystems.com/brad-frosts-atomic-design-build-systems-not-pages/) —
лозунг «build systems, not pages» — думать не «нарисуй экран Х», а «собери набор
переиспользуемых частей, из которых экран Х складывается».

Практическая ценность для Cosmogram не в пятиступенчатой иерархии названий (atom/molecule/
organism — это терминология, не обязательная сама по себе), а в том, ЧТО менять первым:
не «сделай красивый экран Настроек», а «reusable-кнопка/карточка/вкладка, из которой потом
собираются ВСЕ экраны» — что дословно совпадает с уже найденным в
`RESEARCH-2026-09-MENU-STYLE-AUDIT.md` фактом: `.setGrp/.setPanel/.setRow` уже переиспользуются
на 4+ экранах игры одним и тем же CSS-классом. Игра уже частично «атомарна» стихийно, просто
без явного каталога.

### Design Tokens — W3C Design Tokens Community Group (DTCG)

[W3C DTCG — «Design Tokens specification reaches first stable version»](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) —
первая стабильная версия спецификации 2025.10 вышла 28.10.2025, поддержана 40+ организациями
(Adobe, Figma, Google, Microsoft, Shopify, Salesforce). [Формат](https://www.designtokens.org/tr/drafts/format/):
токен — это `$value` + `$type`, токены могут ссылаться друг на друга по пути — это и делает
«семантические» токены переносимыми между инструментами вместо привязки к одному инструменту.

Важное для Cosmogram — токены сами по себе НЕ требуют билд-пайплайна. Отдельная находка
именно про это: [CSS-Tricks/dev.to — «CSS Custom Properties: The Modern Way to Manage Design
Tokens»](https://dev.to/snappy_tools/css-custom-properties-the-modern-way-to-manage-design-tokens-1ohg):

> «CSS variables are browser-native, requiring no build process, and can be scoped to
> selectors, inherited through the DOM, and modified at runtime with JavaScript.»

И прямая рекомендация именно для проектов без сборки:
> «For most projects, starting with CSS custom properties directly without additional tooling
> is the right call — the system works, is debuggable in DevTools, doesn't introduce
> build-step dependencies, and can be extended with tooling later if needed.»

Контраст (важно не спутать): русскоязычные источники про дизайн-токены почти все описывают
именно ПОЛНЫЙ конвейер со сборкой — [Habr, «Дизайн-токены способны на большее»](https://habr.com/ru/companies/badoo/articles/491948/)
и [Habr, «Дизайн-токены: полный гайд по архитектуре»](https://habr.com/ru/articles/1012980/)
описывают связку Figma Tokens → Style Dictionary → CI → сборка CSS/Swift/Android-переменных.
Это НЕ путь для Cosmogram («никакого билд-пайплайна» — прямое правило CLAUDE.md) — но сама
ИДЕЯ токена («переменная дизайна с именем вместо сырого значения», `primary/500` вместо
`#1A73E8`) переносится без всякой сборки один в один на голый `:root{--var}` в CSS игры.
Именно так был устроен ЕДИНСТВЕННЫЙ уже существующий у проекта элемент дизайн-системы —
мотив «планета с кольцом» в `AI-DECISION-REGISTRY.md` — это фактически уже токенизированное
решение уровня компонента, просто без общего документа-каталога вокруг него.

### Refactoring UI (Adam Wathan, Steve Schoger)

Сводка через [заметки читателя](https://iamaatoh.com/essays/refactoring-ui.html) и
[обзор UpDivision](https://updivision.com/blog/post/book-review-refactoring-ui-by-adam-wathan-steve-schoger):

> «Visual design is actually a decision system that non-designers (chiefly developers) can
> learn.»

Ключевые некреативные, механически применимые правила (для нединозайнера, не для
художника — то, что нужно Claude при массовой генерации):
- **Иерархия через вычитание, не добавление**: «The solution is almost always to reduce the
  prominence of secondary elements rather than to amplify the primary one» — если непонятно,
  на что смотреть в меню, чаще правильный шаг — приглушить второстепенное, а не выделить
  главное ещё сильнее.
- **Дизайн через ограничение**: «Good design is subtraction and constraint, not addition and
  freedom — remove white space rather than add it, limit colors and sizes to predefined
  scales, design in grayscale before color, withhold labels, use fewer borders.»
- **Типографика**: не чистый чёрный на белом; не больше двух гарнитур; не полагаться на
  один лишь размер шрифта, чтобы показать важность.
- Формат самой книги — «before/one-or-two-fixes/after» — практический урок и для методологии
  показа вариантов: не «вот 10 картинок», а «вот исходная проблема → вот 1-2 конкретных
  правки → вот результат», проверяемо и по одному вопросу за раз (что уже требует CLAUDE.md).

### Material Design 3 / Apple HIG как СТРУКТУРА (не стиль)

[m3.material.io — Design tokens](https://m3.material.io/foundations/design-tokens),
[Color roles](https://m3.material.io/styles/color/roles): трёхслойная архитектура —
**reference tokens** (сырые значения, «13 тональных ступеней цвета») → **system tokens**
(роли: `primary`, `on-primary`, `surface`, `outline` — 26 стандартных ролей в 6 группах) →
**component tokens** (точечные переопределения для конкретного компонента). Прямая цитата
про ценность именно ролей, а не сырых hex:
> «This decoupling is what makes theming possible... changing your brand's primary color
> requires updating only the reference tokens. All system tokens and component tokens that
> depend on them update automatically.»

[Apple Human Interface Guidelines — Foundations](https://developers.apple.com/design/human-interface-guidelines/foundations/overview):
документация делится на 4 слоя на каждой платформе — **Foundations** (цвет, типографика,
layout, доступность — самый общий уровень философии) → **Patterns** (типовые задачи:
поиск, обратная связь, множественные задачи) → **Components** (конкретные готовые элементы)
→ **Technologies**. Порядок изложения — от общей философии к точным спекам, не наоборот.

**Вывод для структуры документа Cosmogram**: не копировать визуальный стиль Google/Apple
(это чужой брендинг), но скопировать САМУ СТРУКТУРУ уровней — «сырое значение → роль →
конкретный компонент» и «от общего принципа к конкретной цифре» — это универсальный скелет
дизайн-документа независимо от того, насколько велика команда.

## 2. Как безопасно проводить большие, разовые редизайны

### Screen-by-screen vs system-first

[dev.to — «Building Systems, Not Screens»](https://dev.to/builtwithintent/building-systems-not-screens-4784):
> «The difference between building screens and building systems is that screens introduce
> users to software, but systems allow that software to survive years of changing technology,
> growing businesses and evolving customer expectations.»

Практическая рекомендация для больших изменений — переключаться с «экран за экраном» на
«поток за потоком» ДО начала правок: «When a redesign touches a large part of the product,
it's helpful to stop thinking in terms of screens and start thinking in terms of flows»
([userpilot.com — product redesign playbook](https://userpilot.com/blog/product-redesign/)).

### NN/g: радикальный редизайн — когда оправдан, а когда нет

[NN/g — «Radical Redesign or Incremental Change?»](https://www.nngroup.com/articles/radical-incremental-redesign/) —
главная позиция NN/g консервативна:
> «Never make radical changes when minimal adjustments will suffice.»

Риски радикального (big-bang) редизайна по NN/g:
- **Сопротивление пользователей**: «People don't like change» — когнитивная нагрузка на
  переучивание есть даже когда новый интерфейс объективно лучше.
- **Организационная цена**: «The cost and effort of getting an entire organization and senior
  stakeholders to agree on the new website is enormous.»
- **Непреднамеренная поломка**: «Radical changes have a higher chance of inadvertently
  breaking something critical for users.»
- **Подмена диагноза эстетикой**: радикальные правки нередко продиктованы личным вкусом
  дизайнера, а не реальной причиной проблемы в контенте/структуре.

Когда радикальный редизайн ВСЁ ЖЕ оправдан (та же статья): когда точечные улучшения уже
исчерпали себя, технология фундаментально устарела, архитектура сломана в основе, либо
конкурентный анализ показывает явное отставание — это близко к самоописанию Cosmogram
владельцем («дизайна особо и нет»), то есть здесь «огромный заход» — не самодурство, а
осмысленный выбор именно ПОТОМУ что мелкие правки объективно не могут закрыть отсутствие
системы с нуля.

### Кейс успеха: Airbnb Design Language System (DLS)

[wearepresta.com / addictaco.com — Airbnb design system case](https://addictaco.com/case-study-how-airbnbs-design-system-improved-their-ux/):
до системы — «icons, buttons, font sizes, line spacing, and even corner radii varied
unpredictably across screens, and navigation controls like "back" and "cancel" appeared in
different locations and styles» (узнаваемо близко к тому, что нашёл
`RESEARCH-2026-09-MENU-STYLE-AUDIT.md` в Cosmogram). Решение — «a team of engineers and
designers created the first version of Airbnb's Design Language System (DLS)... to establish
a common design language to keep teams in sync», построена на токенах цвета/типографики/
отступов/elevation. Критично: даже с целой командой и токенами **раскатка шла постепенно**
(«rolled out gradually, starting with the mobile app and then moving on to the website, with
extensive testing... throughout the rollout process»), не единым щелчком по всем экранам
разом.

### Кейс провала: Snapchat 2018

[Forbes — «What Startups Can Learn From The Snapchat Redesign»](https://www.forbes.com/sites/katetalbot/2018/03/05/what-startups-can-learn-from-the-snapchat-redesign/),
[Medium — «What we can learn from Snapchat's failed redesign»](https://medium.com/radical-product/what-we-can-learn-from-the-snapchats-failed-redesign-edbe80cea568):
редизайн 2018 года выкатили сразу всем — 1.2 млн подписей за откат, падение DAU, потеря
$1.3 млрд капитализации за один день. Урок из разбора: «Snapchat should have beta tested the
features... gradually implemented the revamped features» — не то, что редизайн был плохим
по содержанию (частично он решал реальную проблему смешения контента друзей и медиа), а то,
что его ввели без промежуточного шага показа и обратной связи. Для Cosmogram это прямое
структурное совпадение с уже действующим правилом «один шаг — одна проверка» и «макет + явное
да владельца» — не абстрактная осторожность, а задокументированный чужой провал того же рода.

### Резюмирующая позиция по «big bang vs incremental»

[WalkMe — Incremental vs Big Bang](https://www.walkme.com/blog/incremental-change/):
> «Big-bang redesigns are remarkably expensive, very time-consuming endeavors that are risky...
> The bigger the change, the more employees must learn and adapt.»

Но это про ПОЛЬЗОВАТЕЛЕЙ живого продукта с базой; у Cosmogram другая структура риска — новый
макет не публикуется в игру автоматически (правило «макет = закон, только явное да»), то есть
классический риск big-bang («выкатили сразу всем плохое») у проекта уже снят процессом. Риск
для Cosmogram другой: не пользовательский бунт, а внутренняя рассинхронизация — 10 макетов
подряд без общего документа окажутся красивыми поодиночке и вразнобой вместе (см. п.4 ниже
про клише и п.5 про бриф — типичный AI-риск без явного констрейнта).

## 3. Игровые арт-библии / UI style guide — практика геймдева

### Общее определение (англоязычный геймдев)

[Meno G Creative — «Style Guides & Art Bible Creation»](https://www.menogcreative.com/style-guide-art-bible):
> «a style guide is the visual rulebook with palette, line weight, and proportion ratios,
> while an art bible is the broader container that usually includes the style guide plus
> supporting material like mood references and narrative context.»

[nastyrodent.com — «Game Art Bible: The AAA Style Guide Studios Actually Use»](https://nastyrodent.com/game-art-bible/):
арт-библия — производственная документация для унификации команды, включая правило, что
цветовое решение обязано «survive translation into engine-rendered materials and lighting» —
то, что выглядит верно на картинке-концепте, может иначе читаться в реальном рендере (для
Cosmogram — реальном Canvas2D/CSS на настоящем телефоне, не на макете-картинке; прямое
эхо уже действующего правила «визуальное не готово без реального скриншота»).

### Японский геймдев

[hanasaqutto.com — про важность стайлгайда](https://hanasaqutto.com/3248/game_ui_guideline/game-ui-design-guidelines/):
> «スタイルガイドを作る際は、まず自社のゲームやWebサービスの世界観、概要などをしっかり理解した
> うえでそれぞれのルール策定をする必要があり」(при создании стайлгайда сначала нужно чётко
> понять мировоззрение/概要 собственной игры, и уже потом формулировать каждое правило —
> не наоборот).

Прямая формулировка про роль стайлгайда для команды (найдена в японском поиске, источник —
[game-creators.jp глоссарий](https://game-creators.jp/media/game-word/%E3%82%B9%E3%82%BF%E3%82%A4%E3%83%AB%E3%82%AC%E3%82%A4%E3%83%89%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3/)):
> «スタイルガイドとは開発にあたる共通ルールの事を指し、初期開発から機能を追加/UIを調整したり
> する際、このスタイルガイドの内容が決まっている事で、個々人の感覚ベースでの開発ではなく、
> プロダクトのブランドコンセプトを崩さずに開発を進めることが出来ます」(стайлгайд — это общее
> правило разработки; когда его содержание уже определено, разработка идёт не на основе личного
> чувства каждого отдельного человека, а без разрушения общей концепции бренда продукта).

Это прямое попадание в задачу Claude здесь: без документа Claude каждый раз «додумывает
на глаз» заново — ровно то, что японский источник называет проблемой отсутствия стайлгайда.

### Китайский геймдев

[Zhihu — «一个策划眼中的手游UI规范设计»](https://zhuanlan.zhihu.com/p/26930112) (сама страница
отдала 403 при повторном заходе — цитирую по сохранённому сниппету поискового индекса, честно
помечено как непрямая цитата) и параллельный источник [站酷 ZCOOL — «游戏ui设计风格的统一»](https://www.zcool.com.cn/article/ZMTYxMzIxNg==.html):
> «制定设计规范是统一UI界面风格最有效的方法，设定好设计规范并严格按照规范执行，就能让UI界面
> 风格统一」(разработка規范 (стандарта) — самый эффективный способ унифицировать стиль UI;
> когда规范 задан и строго соблюдается, стиль UI автоматически становится единым).

Конкретные числовые практики из китайских источников (не для копирования в Cosmogram буквально,
а как пример, что регламент бывает численным, не только словесным):
> «在游戏界面设计中，一般会将色彩控制在3到4个，颜色的分配一般为60%的主色调，30%的辅助色，
> 10%的强调色」(в дизайне игрового интерфейса цвет обычно ограничивают 3-4 цветами: 60%
> основной, 30% вспомогательный, 10% акцент — вариант «правила 60-30-10» из графдизайна,
> адаптированный под игровой UI).
> «在规定界面排版的时候，一般用偶数单位（如4或者8的倍数），能适应大部分的手机屏幕分辨率」
> (при разметке интерфейса обычно используют чётные единицы — кратные 4 или 8 — для
> совместимости с большинством разрешений телефонных экранов) — это узнаваемо совпадает с
> общепринятой западной практикой «8pt grid» (Material Design и большинство мобильных
> дизайн-систем используют тот же кратный-8 шаг отступов).

### Пересечение всех языков

Независимо от языка источника (английский арт-библия / японский стайлгайд / китайский规范)
структура одна и та же: 1) единый словарь ЦВЕТА (не «использовать любой цвет», а роли с
пропорцией), 2) единый словарь ОТСТУПОВ (кратная шкала, не произвольные числа), 3) единый
словарь КОМПОНЕНТОВ (какая карточка/кнопка когда используется), 4) документ существует ДО
того, как рисуется конкретный экран, а не собирается постфактум из уже нарисованного.

## 4. AI-специфичные клише — как избежать «типично ИИ-сгенерированного» вида

### Механизм появления клише

[dev.to — «Why Every AI-Built Website Looks the Same (Blame Tailwind's Indigo-500)»](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p):
причинная цепочка — Tailwind CSS сделал `bg-indigo-500` цветом кнопки по умолчанию → тысячи
туториалов и шаблонов использовали его не меняя → языковые модели, обученные на этом
веб-коде, статистически усвоили «фиолетовый — это то, как выглядят веб-кнопки» → AI-сайты
сами попадают в интернет и усиливают то же смещение в следующих циклах обучения — самоусиливающаяся
петля. Дословно:
> «The AI isn't designing. It's averaging.»

### Конкретный список клише (сведено из нескольких источников)

[developersdigest.tech — «AI Design Slop: 16 Patterns That Out Your App as Vibe-Coded»](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it):

**Шрифты**: Inter повсюду, особенно в центрированных заголовках-хиро; повторяющиеся связки
(Space Grotesk + Instrument Serif + Geist); засечковый курсив как акцентный шрифт поверх
в остальном Inter-страницы.

**Цвет**: «VibeCode Purple» — конкретный лавандовый оттенок, «протёкший» из генерации
изображений; постоянный тёмный режим с серым текстом среднего тона и капслок-подписями;
контраст текста ниже WCAG AA в тёмных темах; градиенты повсюду; крупные цветные свечения/тени.

**Layout**: центрированный хиро на обычном sans-serif; бейдж над заголовком H1; цветные рамки
у карточек (обычно сверху или слева); одинаковые карточки-фичи с иконками сверху; нумерованные
последовательности «1, 2, 3»; полосы со статистикой; сайдбар/навигация с эмодзи-иконками;
заголовки и подписи секций КАПСЛОКОМ.

[925studios.co — «AI Slop Fonts and Gradients»](https://www.925studios.co/blog/ai-slop-design-tells)
и параллельный источник независимо подтверждают тот же список (три карточки в ряд,
Inter-шрифт, эмодзи-иконки, «hero» с градиентом) — совпадение по нескольким независимым
разборам, не один источник.

Прямая формулировка порога распознавания:
> «A website was almost certainly AI generated when several default choices appear together:
> a violet-to-indigo gradient, three feature cards of equal weight, Inter as the only font,
> an emoji used as an icon, and a three-tier pricing table with the middle plan highlighted.
> One of these is a coincidence. Four or more is a confession.»

### Как практикующие с этим борются

Единая рекомендация по всем найденным источникам — не «попроси ИИ сделать красивее», а
**явные, конкретные, письменные ограничения**:
> «Explicit constraints like "No cards. No gradients. No centered heroes. No default fonts"
> produce better designs than any single clever prompt could.»

> «Document your constraints: Use a DESIGN.md file or system prompt so your AI tool reads
> design decisions every session, preventing defaults from leaking through automatically.»

Это прямо совпадает с задачей владельца — «чтобы не возникало постоянной ерунды» решается
не более осторожной генерацией на глазок, а письменным документом-ограничением, который
читается КАЖДЫЙ раз перед генерацией, а не держится в памяти диалога.

## 5. Creative brief — как формулировать бриф до генерации вариантов

### Структура классического рекламного брифа

[HubSpot — «How to Write a Creative Brief in 11 Simple Steps»](https://blog.hubspot.com/marketing/creative-brief):
11 компонентов — название проекта, бэкграунд компании, цель проекта, целевая аудитория,
конкуренты, ключевое сообщение, ключевая выгода потребителя, **Attitude** («three to five
adjectives that describe the tone and voice» — 3-5 прилагательных, задающих тон), призыв к
действию, план дистрибуции, согласование со стейкхолдерами. Важно: бриф создаётся ДО начала
любой творческой работы — «Create a creative brief at the very start of a project, before any
creative work begins and before assigning the project to a designer.»

Русский источник подтверждает ту же логику: [practicum.yandex.ru — бриф для графического
дизайнера](https://practicum.yandex.ru/blog/brif-v-graficheskom-dizayne/):
> «Бриф на разработку дизайна — это структурированный документ-опросник, который заказчик
> заполняет до старта работ... фиксирует цели, аудиторию, требования и критерии успеха
> проекта до старта работ, экономит время и бюджет, снижает число правок.»

### Как получить осмысленно РАЗНЫЕ варианты, а не 10 случайных попыток

Ни англоязычные, ни русские источники про классический рекламный бриф явно НЕ описывают шаг
«сгенерировать N намеренно разных направлений» — это скорее находка из практики
дизайн-инструментов и divergent-thinking методологии:
[ideum.com — «Before We Refine, We Explore: Five Benefits of Divergent Thinking During Concept
Design»](https://ideum.com/news/benefits-of-divergent-thinking-during-concept-design) —
идея в том, что дивергентная фаза (много принципиально разных направлений) должна быть
явно отделена от конвергентной (выбор одного и его полировка), и что варианты должны
различаться не деталью (три оттенка одного и того же), а самим ПРИНЦИПОМ (например: строгий
минимализм / тёплый рукописный / технологичный холодный — как категориально разные ответы
на один и тот же бриф, а не 10 шумовых вариаций одной идеи).

Один из найденных инструментов явно формализует это как «5 different visual concepts... each
with different color palettes, typography, imagery styles, and overall personality» — то есть
критерий «разные» операционализируется как «отличаются минимум по 3 независимым осям сразу»
(палитра + типографика + общий характер), не по одной. Это прямое противоядие от
существующего в проекте правила «мерить, а не гадать по одному свойству за раз» — оно уже
верно для отладки, и та же логика переносится на генерацию вариантов: 10 макетов, различающихся
только цветом кнопки — это не 10 разных ответов на бриф, а один ответ с 10 перекрасками.

## Синтез для Cosmogram

### Что стоит создать ПЕРВЫМ — до переделки первого же меню

Не макет экрана, а **один документ уровня «дизайн-система»**, физически — новый файл
в `.knowledge/` (например `DESIGN-SYSTEM.md`, решение о точном имени — за владельцем при
первом обсуждении) плюс параллельно набор `:root{--var}` CSS-переменных прямо в игровом коде
(это ЕДИНСТВЕННОЕ технически осмысленное перенесение «дизайн-токенов» без билд-пайплайна —
раздел 1 выше). Документ должен содержать, по структуре «сырое значение → роль → компонент»
(та же структура, что у Material/Apple, п.1):

1. **Роли, не сырые значения.** Не «этот синий», а «этот цвет = роль ФОН-СТЕКЛА»,
   «этот золотой = роль ТРАЧУ/ПОДТВЕРЖДАЮ» (уже частично открыто владельцем в
   `AI-DECISION-REGISTRY.md` про заливку кнопок — это уже, не осознавая того, первый токен
   уровня роли, просто нигде не собранный в одном месте).
2. **Кратная шкала отступов** (например шаг 4 или 8px — п.3, независимо подтверждено и
   западной, и китайской практикой) — не произвольные числа по вкусу на каждом экране.
3. **Шкала типографики** — ограниченное число размеров/весов, не «на глаз каждый раз».
4. **Каталог уже существующих переиспользуемых компонентов** — вкладка (как `.achTab`),
   карточка-настройка (как `.setRow`), кнопка со стеклом, кнопка круглая (мотив «планета с
   кольцом» из реестра решений) — с явным правилом «когда используется какая», чтобы новый
   макет ссылался на существующий компонент вместо изобретения похожего с нуля. Это прямое
   применение Atomic Design («build systems, not pages», п.1) и прямое продолжение уже
   сделанного `RESEARCH-2026-09-MENU-STYLE-AUDIT.md` (там факт единой системы уже НАЙДЕН,
   но нигде не записан как явный переиспользуемый каталог).
5. **Явный список запрещённых клише** (раздел ниже) — как письменный DESIGN.md-констрейнт
   (п.4 выше), читаемый Claude перед КАЖДОЙ генерацией макета, а не удерживаемый в памяти
   диалога, которая обнуляется между сессиями.
6. **Мини-бриф-шаблон** (не полный рекламный бриф из 11 пунктов — избыточно для инди-проекта
   без бюджета/дистрибуции/конкурентного анализа, но 3 поля обязательны перед КАЖДЫМ большим
   заходом): (а) какую конкретную проблему решает этот заход (не «сделай красивее», а что
   именно не так — из аудита или из слов владельца), (б) 3-5 прилагательных-Attitude (тон:
   например «спокойный/технологичный», не «весёлый/яркий» — конкретный выбор владельца, не
   додуманный Claude по правилу «не додумывать конкретику»), (в) на каких экранах это
   применяется в этом заходе, а на каких сознательно нет.

Этот документ создаётся ОДИН раз явным обсуждением с владельцем (роли/шкалы/Attitude — все
конкретные числа и слова здесь ПОДПАДАЮТ под правило CLAUDE.md «не додумывать конкретику
внутри общего „сделай так-то"» — то есть сам документ должен собираться через
AskUserQuestion с вариантами, не единолично Claude), и дальше живёт как единственный источник
истины для всех последующих макетов — не переписывается заново на каждый заход.

### Как затем вести «огромные заходы» безопасно

- **Порядок**: сначала документ-система (once) → потом каждый «огромный заход» = один макет,
  показывающий СРАЗУ несколько экранов, использующих одни и те же роли/компоненты из
  документа (не единственный экран, но и не буквально «все меню разом за один показ» — п.2,
  риск Snapchat 2018 в том, что выкатили без промежуточного шага показа; у Cosmogram
  промежуточный шаг уже есть структурно — макет вместо прямой правки, явное «да» вместо
  тишины — этот механизм НЕ трогать, он и есть защита от риска big-bang).
- **Дивергенция перед конвергенцией (п.5)**: на «огромный заход» — 2-3 категориально РАЗНЫХ
  направления (не 10 перекрасок одного), различающихся минимум по 3 независимым осям сразу
  (тон/форма компонента/плотность), не по одной. Показывать пакетом, не по одному, что уже
  требует память Claude («batch~100», «Batch known fixes together») и CLAUDE.md
  («несколько задач в одном файле... довести весь пакет до готовности... внести целиком»).
- **После выбора направления** — конвергентная фаза: макет применяет ВЫБРАННОЕ направление
  сразу к нескольким экранам за раз (это и есть смысл «огромного захода» — не 14 отдельных
  сессий по экрану, а один системный проход), но каждый макет всё равно проходит через
  «да» владельца перед внесением в игру — большой размер захода не снимает этот шаг, а
  делает его более критичным (у Airbnb даже с готовой системой раскатка шла постепенно —
  п.2).
- **Что НЕ считается «огромным заходом» законно**: правка одного значения токена, которое
  автоматически меняет 10 экранов сразу (как в Material «changing your brand's primary color
  requires updating only the reference tokens») — технически это один маленький PR, а
  визуально это выглядит как «вся игра поменялась» для владельца. Такие правки МОЖНО и НУЖНО
  показывать как один макет с несколькими экранами внутри — это ровно то преимущество,
  ради которого стоит завести документ-систему.

### Конкретный список клише — не использовать по умолчанию при генерации макетов Cosmogram

Из раздела 4 выше, сведено в проверочный список (не как «эти цвета запрещены навсегда» — это
методологический список TELLS, что макет получился «на автомате», не осмысленно):
- Один и тот же лавандово-фиолетовый градиент как способ «оживить» фон по умолчанию.
- Шрифт Inter (или системный sans-serif) без явного обсуждения — потому что это дефолт, а не
  выбор.
- Три одинаковые карточки в ряд с иконкой сверху как решение «покажи варианты» по умолчанию.
- Эмодзи как замена иконке/маркеру раздела.
- Всё по центру, «hero»-блок с бейджем над заголовком — паттерн, скопированный из
  маркетинг-лендингов, не из игрового UI.
- Капслок-подписи секций без обоснования (у Cosmogram капслок УЖЕ используется на `.btn`
  осмысленно, п. «Технически» CLAUDE.md — то есть это не «капслок запрещён», а «капслок не
  должен появляться ПРОСТО ПОТОМУ ЧТО так делает каждый второй AI-макет», без осознанного
  повторения существующего правила игры).
- Скругления `rounded-lg`-по-умолчанию везде без разбора, где скругление уже задаёт смысл
  (стекло/карточка/кнопка) — игра уже имеет разную геометрию для разных ролей, это стоит
  сверять с документом-системой, а не унифицировать бездумно.
- Готовые «карточки статистики» рядом (stat-banner) — паттерн из SaaS-лендингов, чужероден
  игровому меню без явной причины.

### Что НЕ входит в этот документ (по прямой просьбе владельца)

Никаких конкретных цветов/шрифтов/макетов здесь не предложено — методология и процесс, не
контент. Конкретика — отдельная задача с владельцем, через макет, после того как документ-
система и бриф-шаблон согласованы явным словом.

## Итоговый список источников (все URL, использованные выше)

**Английский**: [atomicdesign.bradfrost.com](https://atomicdesign.bradfrost.com/chapter-2/),
[designsystems.com](https://www.designsystems.com/brad-frosts-atomic-design-build-systems-not-pages/),
[w3.org/community/design-tokens](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/),
[designtokens.org](https://www.designtokens.org/tr/drafts/format/),
[dev.to CSS custom properties](https://dev.to/snappy_tools/css-custom-properties-the-modern-way-to-manage-design-tokens-1ohg),
[iamaatoh.com Refactoring UI notes](https://iamaatoh.com/essays/refactoring-ui.html),
[updivision.com Refactoring UI review](https://updivision.com/blog/post/book-review-refactoring-ui-by-adam-wathan-steve-schoger),
[m3.material.io design tokens](https://m3.material.io/foundations/design-tokens),
[m3.material.io color roles](https://m3.material.io/styles/color/roles),
[developer.apple.com HIG Foundations](https://developers.apple.com/design/human-interface-guidelines/foundations/overview),
[dev.to Building Systems Not Screens](https://dev.to/builtwithintent/building-systems-not-screens-4784),
[userpilot.com product redesign](https://userpilot.com/blog/product-redesign/),
[nngroup.com radical vs incremental](https://www.nngroup.com/articles/radical-incremental-redesign/),
[addictaco.com Airbnb case study](https://addictaco.com/case-study-how-airbnbs-design-system-improved-their-ux/),
[forbes.com Snapchat redesign](https://www.forbes.com/sites/katetalbot/2018/03/05/what-startups-can-learn-from-the-snapchat-redesign/),
[medium.com Snapchat lessons](https://medium.com/radical-product/what-we-can-learn-from-the-snapchats-failed-redesign-edbe80cea568),
[walkme.com incremental vs big bang](https://www.walkme.com/blog/incremental-change/),
[menogcreative.com style guide/art bible](https://www.menogcreative.com/style-guide-art-bible),
[nastyrodent.com Game Art Bible](https://nastyrodent.com/game-art-bible/),
[dev.to Tailwind indigo-500](https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p),
[developersdigest.tech AI Design Slop 16 patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it),
[925studios.co AI slop tells](https://www.925studios.co/blog/ai-slop-design-tells),
[blog.hubspot.com creative brief](https://blog.hubspot.com/marketing/creative-brief),
[ideum.com divergent thinking](https://ideum.com/news/benefits-of-divergent-thinking-during-concept-design),
[picsart.com brand scoping skill](https://picsart.com/tutorials/generate-multiple-brand-direction-concepts-from-a-creative-brief-with-skills/).

**Русский**: [practicum.yandex.ru бриф дизайнера](https://practicum.yandex.ru/blog/brif-v-graficheskom-dizayne/),
[habr.com Дизайн-токены (Badoo)](https://habr.com/ru/companies/badoo/articles/491948/),
[habr.com Дизайн-токены полный гайд](https://habr.com/ru/articles/1012980/),
[habr.com Дизайн UI в играх NieR:Automata](https://habr.com/ru/articles/340610/).

**Японский**: [hanasaqutto.com game UI guideline](https://hanasaqutto.com/3248/game_ui_guideline/game-ui-design-guidelines/),
[game-creators.jp スタイルガイド](https://game-creators.jp/media/game-word/%E3%82%B9%E3%82%BF%E3%82%A4%E3%83%AB%E3%82%AC%E3%82%A4%E3%83%89%E3%83%87%E3%82%B6%E3%82%A4%E3%83%B3/),
[goodpatch.com デザインシステム構築](https://goodpatch.com/blog/2024-08-designsystem-solve-problem)
(структура/малый старт — «いきなり大規模なデザインシステムを構築するのではなく、小規模なものから
作成し、運用しながらデザインシステムを完成させることが重要」— не строить сразу гигантскую
систему, а начинать с малого и достраивать в процессе использования — независимое японское
подтверждение того же вывода, что и «design system first, но не «все токены сразу»»).

**Китайский**: [zcool.com.cn 游戏ui设计风格的统一](https://www.zcool.com.cn/article/ZMTYxMzIxNg==.html),
[gameres.com 十位游戏开发者共话游戏UI](https://www.gameres.com/892780.html),
[zhuanlan.zhihu.com 手游UI规范设计](https://zhuanlan.zhihu.com/p/26930112) (страница отдала 403
при повторном заходе — цитата в разделе 3 взята из сохранённого поискового сниппета, честно
помечена как непрямая).

## Что честно НЕ найдено

- Прямых франко-/немецко-/скандинавоязычных источников по методологии дизайн-систем для
  инди-геймдева конкретно (в отличие от `RESEARCH-2026-09-MENU-REDESIGN-WEST.md`, где эти
  языки давали хоть что-то про конкретные экраны, здесь — про сам процесс работы с
  дизайн-системой — почти всё найденное на этих языках оказывалось переводом/пересказом тех
  же английских источников или общими SEO-статьями без специфики). Не выдумано, честно не
  закрыто.
- Ни один источник (ни английский, ни русский) прямо не описывает шаг «сгенерировать
  намеренно разные направления» как формальную часть КЛАССИЧЕСКОГО рекламного брифа — это
  пришлось собирать из смежной области (divergent thinking в концепт-дизайне) отдельно от
  структуры самого брифа. Указано в разделе 5 как явный синтез, не как цитата одного
  источника.
