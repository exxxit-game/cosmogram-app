# Ритм-синхронизация расстановки на трассе — исследование гипотезы (12.09.2026)

> Проверяемая гипотеза: можно ли сделать расстановку препятствий на «Карте» Конструктора
> (линейная трасса 1500м) синхронизированной с музыкой/ритмом — НОВАЯ категория интерфейса
> для Cosmogram, не просто улучшение точности драга. У игры уже ЕСТЬ отдельная «Партитура» —
> список точек `sc` (kind/dir), которая влияет на направление кометы/дрейфера ВО ВРЕМЯ полёта
> (см. `project_konstruktor_raskladka.md`, `project_napravlenie_poleta_syurpriz.md`) — это
> НЕ используется пока в самой расстановке (лента `#ptTrack`), только в готовой игре.
> Это исследование — только разведка чужих прецедентов, без кода, без архитектурного решения.

## 1. osu! beatmap editor — временная шкала под BPM (подтверждено)

- **Timing (таб «Timing»)** — первый шаг создания карты: offset (сдвиг начала) + BPM.
  Можно отстучать темп клавишей T по музыке, метроном по клику — osu! сам прикинет BPM,
  дальше подгоняется вручную, пока все деления таймлайна не совпадут с музыкой.
  [Beatmapping/Timing — osu! wiki](https://osu.ppy.sh/wiki/en/Beatmapping/Timing)
- **Timing points** — «красные» (uninherited, держат BPM/размер такта) и «зелёные»
  (inherited, держат скорость слайдера/громкость хитсаундов) линии на нижней шкале.
  [Client/Beatmap editor/Timing — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Timing)
- **Beat snap divisor** — 11 настроек дробления такта, от 1/1 до 1/16; самые ходовые —
  1/1, 1/2, 1/4; 1/3 и 1/6 — под вальсовые (триольные) треки. Объект при перетаскивании
  «прилипает» только к тем засечкам таймлайна, которые задаёт текущий divisor.
  [Beat snap divisor — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Beat_snap_divisor),
  [Beat snapping — osu! wiki](https://osu.ppy.sh/wiki/en/Beatmapping/Beat_snapping)
- **Compose tab** — основное место работы: таймлайн показывает объекты относительно
  divisor'а и метки времени, зум колёсиком+Alt, объекты двигаются ЛКМ, удаляются ПКМ.
  [Compose tab — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Compose)
- **Waveform в таймлайне** — не всегда была штатной; в декабре 2023 добавили «visual
  offset», чтобы волна совпадала с реальным звуком (точность ~2мс), это сделало
  «визуальную» синхронизацию по форме волны жизнеспособной альтернативой отстукиванию.
  [ppy/osu релиз 2023.1229.0](https://newreleases.io/project/github/ppy/osu/release/2023.1229.0)
- Японские источники подтверждают тот же флоу другими словами: BPM и Offset — обязательные
  первые настройки; «beat snap interval» 1/1→четверти, 1/2→восьмые, 1/4→шестнадцатые и т.д.;
  есть отдельная функция «пересобрать снап всех нот» при сдвиге offset'а (нужно временно
  выставить снап в НОК используемых значений, иначе часть нот разъедется).
  [osu!での太鼓譜面の作り方 (jp)](https://saltish.doorblog.jp/archives/50260934.html),
  [osu! Editの方法_初期設定編 (jp)](https://boronyaaaaaaaaaaaaaaaaaaaaaaaaa.hatenablog.com/entry/2019/09/17/015236)

## 2. ChroMapper (Beat Saber) — quantize-сетка + «flow» важнее точности (подтверждено)

- **Precision Snap** — по умолчанию 1/1 (блок садится в клетку сетки), меняется в меню
  (ESC/гамбургер) на 1/2, 1/4, 1/8 и т.д. — та же идея дробления такта, что у osu!, но
  применена к 3D-координатам блока, а не только к времени.
  [ChroMapper GitHub](https://github.com/Caeden117/ChroMapper), [BSMG Wiki — Mapping](https://bsmg.wiki/mapping/)
- **«Flow» как критерий качества, отдельный от технической точности сетки.** Комьюнити-гайды
  прямо противопоставляют «хорошо чувствуется» и «технически ровно»: «flow — это связь
  движения с ритмом... карта с хорошим flow почти всегда ощущается лучше карты, которая
  изо всех сил пытается впечатлить», «лучшие карты — это меньше хаотичных блоков и больше
  хореографии». Один маппер формулирует критерий буквально через танцевальность: «если я
  могу танцевать под то, что замапил, и это ощущается хорошо — я доволен flow».
  [HelloTealie — What Beat Saber Mapping Taught Me](https://hellotealie.com/guides/what-beat-saber-mapping-taught-me),
  [BSMG Wiki — Intermediate Mapping](https://bsmg.wiki/mapping/intermediate-mapping.html)
- Вывод для нас: сетка-снап (техническая точность) и «ощущение ритма» (музыкальность) —
  осознанно РАЗНЫЕ уровни в этом жанре; жёсткий снап — необходимый, но не достаточный
  инструмент, поверх него нужна оценка «чувствуется ли», которую формально не проверить.

## 3. Guitar Hero / Clone Hero charting — Moonscraper, Editor on Fire (подтверждено)

- **Moonscraper** — сетка бита должна СЛЕДОВАТЬ за музыкой, а не использовать одно
  усреднённое BPM на весь трек: маркеры BPM/такта/offset расставляются по ходу песни,
  чтобы сетка не «уезжала» к концу трека. Ноты проще ставить, когда каждая линия сетки
  совпадает со слышимым битом или музыкальным делением.
  [Moonscraper GitHub](https://github.com/FireFox2000000/Moonscraper-Chart-Editor),
  [How Do I Create My First Clone Hero Chart — moonscraper.org](https://moonscraper.org/my-first-clone-hero-chart-using-moonscraper/)
- **Editor on Fire (EOF)** — перетаскиваешь OGG/WAV/MP3, сразу видишь waveform и чартишь;
  grid snap — центральная часть процесса расстановки нот (функции «к предыдущей/следующей
  засечке снапа» работают, только если snap включён), есть встроенный beat detection.
  [EOF GitHub](https://github.com/raynebc/editor-on-fire), [Editor on Fire — CustomsForge](https://www.editoronfire.customsforge.com/eof)

## 4. DAW piano-roll — quantize/swing/humanize (подтверждено)

- **Ableton Live — система Grooves.** Не просто снап, а «*.agr» файлы, вытянутые из живых
  исполнений/классических драм-машин; 4 параметра поверх сетки: **Quantize** (0-100%, сила
  притяжения к прямой сетке), **Timing** (насколько groove сдвигает тайминг), **Random**
  (случайный дребезг — на малых значениях это и есть «очеловечивание» жёстко
  заквантованных электронных партий), **Velocity** (насколько groove меняет силу нажатия).
  Технически groove — это тоже MIDI-файл нот, используемый как «неровная», более
  «естественная» сетка вместо идеально ровной.
  [Ableton Reference Manual — Using Grooves](https://www.ableton.com/en/manual/using-grooves/)
- **FL Studio** — Ctrl+Q быстрый квантайз по текущей сетке, Alt+Q — диалог с настройкой
  силы (<100% = «подтянуть к сетке», не «прилепить намертво»); swing-ручка в Channel Rack;
  Note Randomization (Alt+R) сдвигает тайминг/длину/велосити нот случайно, имитируя живую
  игру; Shift+перетаскивание обходит сетку для ручной тонкой правки без снапа вообще.
  [FL Studio Piano Roll 101 — unison.audio](https://unison.audio/fl-studio-piano-roll/),
  [How to Quantize in FL Studio Without Killing Groove](https://flstudiopro.com/fl-studio-quantize/)
- Общий паттерн всех DAW: **снап — это стартовая точка, а не финальное состояние**; поверх
  него всегда есть управляемая «расшатывающая» надстройка (swing/random/timing%), потому
  что 100%-но заквантованная музыка звучит механически, не по-настоящему ритмично.

## 5. Честная проверка прямого прецедента — «расставь объект В ПРОСТРАНСТВЕ синхронно с музыкой»

Прямого 1:1 прецедента «линейная трасса 1500м с BPM-сеткой поверх, снап по МЕТРАМ, а не по
времени таймлайна» в найденных источниках **не обнаружено**. Дальше — по убыванию близости,
всё подтверждено ссылками:

- **A Dance of Fire and Ice — самый близкий концептуальный аналог.** Угол плитки ЯВЛЯЕТСЯ
  длительностью такта: плитка на 180° (прямая) = 1 удар, плитка на 90° = 0.5 удара. То есть
  геометрия пути *буквально кодирует* ритм — не «сетка поверх линии», а «линия и есть
  сетка». BPM/offset настраиваются на конкретной плитке, можно менять темп по ходу трассы
  через мультипликатор. Это структурно ближе всего к нашей трассе (путь = время), но жанр
  другой — там сам путь и есть весь геймплей, а не размещение отдельных препятствий вдоль
  готовой линии. Честная цитата про боль редактора: «реалтайм скроллящаяся линия, рисуешь
  уровень пока тапаешь по биту, и на глаз выставлять все углы — это кошмар» — то есть даже
  у эталонного «геометрия=ритм» редактора авторы жалуются на визуальную/пространственную
  точность синхронизации, не только техническую.
  [Tile Angles — ADOFAI Wiki](https://adofai.fandom.com/wiki/Tile_Angles),
  [Game Mechanics — ADOFAI Wiki](https://adofai.fandom.com/wiki/Game_Mechanics),
  [A Dance of Fire and Ice/Level Editor — NamuWiki](https://en.namu.wiki/w/A%20Dance%20of%20Fire%20and%20Ice/%EB%A0%88%EB%B2%A8%20%EC%97%90%EB%94%94%ED%84%B0)
- **Audiosurf** — трасса (форма, высота, скорость, расстановка цветных блоков) строится
  АВТОМАТИЧЕСКИ анализом песни (темп/битность/громкость/высота тона) — «интенсивные места
  вниз/на скорость, медленные нарастания — на подъём». Это подтверждает саму ИДЕЮ
  «пространство=музыка», но это процедурная генерация, не ручная расстановка автором —
  прямо противоположный нашему сценарию (игрок расставляет сам) полюс того же принципа.
  [Audiosurf — MobyGames](https://www.mobygames.com/game/32692/audiosurf/)
- **3Dash** — фанатский 3D-ритм-платформер (вдохновлён Geometry Dash) с собственным
  редактором уровней; заявлено, что «каждая расстановка препятствия следует ритму музыки»,
  и редакторы жанра в целом полагаются на BPM-анализ волны для расстановки битовых меток.
  Источник — геймдев-обзорные сайты о самой игре, не официальная документация редактора;
  **достоверность ниже**, чем у остальных пунктов — это малый нишевый проект, детали
  устройства самого редактора (снап-сетка конкретно) подтвердить не удалось.
  [3Dash — Geometry Dash World](https://geometry-world.com/3dash)
- **Dancing Line (комьюнити-моды)** — DLCE и особенно **Elinetro Mod** заявляют поддержку
  «BPM quantization (perfect sync)» — то есть путь (кривая, по которой едет линия) снапится
  к битовой сетке трека при рисовании в редакторе. Концептуально это ближе всего к нашему
  сценарию (рисуешь ПУТЬ вдоль линии под музыку в редакторе), но это неофициальный
  комьюнити-мод с ограниченной документацией — подтверждён сам факт существования функции,
  не подробности реализации UI.
  [DLCE — itch.io](https://fengyandl.itch.io/dlce), [Dancing Line Level Editor — Discuss Scratch](https://scratch.mit.edu/discuss/topic/532790/)

**Вывод по разделу 5, честно:** прецедент «геометрия/расстановка в пространстве кодирует
ритм» — реальный и подтверждённый (ADOFAI — сильнее всего; Audiosurf — для процедурной
генерации; Dancing Line-моды — ближе всего по жанру «нарисуй путь»), но нигде это не устроено
как «BPM-сетка НАКЛАДЫВАЕТСЯ поверх уже существующей независимой пространственной трассы» —
везде либо геометрия САМА кодирует время (ADOFAI), либо трасса ГЕНЕРИРУЕТСЯ из музыки
целиком (Audiosurf), либо это нишевый мод без документации (Dancing Line/3Dash). Ни одного
источника с точной архитектурой «наша ситуация» (готовая физическая трасса постоянной
длины + опциональный ритм-слой поверх, который можно включить/выключить) найти не удалось —
если такой прецедент существует, он не всплыл ни в англоязычном, ни в японском поиске.

## Что теоретически переносимо на трассу Конструктора — ПОМЕЧЕНО КАК СИНТЕЗ-ГИПОТЕЗА

Всё ниже — не найденный готовый прецедент, а моя экстраполяция комбинации разделов 1-4
на 1500-метровую трассу. Ничего не проверено на живых игроках, ни разу не собрано даже
как макет. Каждый пункт при переходе к реализации — отдельный явный вопрос владельцу
(конкретика, не «сделай похоже»), как того требует правило «не додумывать».

- **BPM-сетка по метрам, а не по времени.** Если скорость полёта постоянна (или известна
  на момент расстановки), метраж между битами = `скорость × (60/BPM)`; теоретически можно
  наложить вертикальные засечки на ленту `#ptTrack` каждые N метров — аналог osu! beat snap
  divisor, только ось не «секунды», а «метры трассы». Нужно сверить, действительно ли
  скорость на трассе константна во время расстановки (не проверено в этом исследовании).
- **Waveform/битовые метки вдоль ленты** (как у EOF/Moonscraper/Cascade) — чтобы снап был
  не абстрактно-равномерным, а видно было, где ФАКТИЧЕСКИ падает удар в треке.
- **Сила снапа вместо жёсткого вкл/выкл** (по примеру Ableton Groove Quantize% + Random) —
  расстановка «подтягивается» к биту, но не прилипает намертво; опциональный «человеческий»
  дребезг, чтобы не выглядело роботизированно.
- **Живое прослушивание при расстановке** (как в ChroMapper/osu!) — нужно ли это в
  Конструкторе, зависит от того, есть ли у полёта звук/музыка вообще в момент редактирования
  (не проверено — не смотрел живой код, это факт для отдельной сверки, не для домысливания).
- **Явная связь со существующей Партитурой.** У Конструктора уже есть точки `sc` (kind/dir),
  которые сейчас читаются только во время полёта, не в редакторе расстановки. Слияние двух
  систем (позиция на трассе ↔ момент в Партитуре) — архитектурный вопрос, не тема этого
  исследования; на него нужен отдельный явный разговор с владельцем, не решение внутри
  ответа на это исследование.

## Источники — сводный список

Английские:
- [Beatmapping/Timing — osu! wiki](https://osu.ppy.sh/wiki/en/Beatmapping/Timing)
- [Client/Beatmap editor/Timing — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Timing)
- [Beat snap divisor — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Beat_snap_divisor)
- [Beatmapping/Beat snapping — osu! wiki](https://osu.ppy.sh/wiki/en/Beatmapping/Beat_snapping)
- [Client/Beatmap editor/Compose — osu! wiki](https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Compose)
- [ppy/osu релиз 2023.1229.0 (waveform visual offset)](https://newreleases.io/project/github/ppy/osu/release/2023.1229.0)
- [ChroMapper — GitHub](https://github.com/Caeden117/ChroMapper)
- [BSMG Wiki — Mapping](https://bsmg.wiki/mapping/)
- [BSMG Wiki — Intermediate Mapping](https://bsmg.wiki/mapping/intermediate-mapping.html)
- [HelloTealie — What Beat Saber Mapping Taught Me](https://hellotealie.com/guides/what-beat-saber-mapping-taught-me)
- [Moonscraper Chart Editor — GitHub](https://github.com/FireFox2000000/Moonscraper-Chart-Editor)
- [My First Clone Hero Chart Using MoonScraper](https://moonscraper.org/my-first-clone-hero-chart-using-moonscraper/)
- [Editor on Fire — GitHub](https://github.com/raynebc/editor-on-fire)
- [Editor on Fire — CustomsForge](https://www.editoronfire.customsforge.com/eof)
- [Ableton Reference Manual — Using Grooves](https://www.ableton.com/en/manual/using-grooves/)
- [FL Studio Piano Roll 101 — unison.audio](https://unison.audio/fl-studio-piano-roll/)
- [How to Quantize in FL Studio Without Killing Groove](https://flstudiopro.com/fl-studio-quantize/)
- [Tile Angles — A Dance of Fire and Ice Wiki (Fandom)](https://adofai.fandom.com/wiki/Tile_Angles)
- [Game Mechanics — A Dance of Fire and Ice Wiki (Fandom)](https://adofai.fandom.com/wiki/Game_Mechanics)
- [A Dance of Fire and Ice/Level Editor — NamuWiki](https://en.namu.wiki/w/A%20Dance%20of%20Fire%20and%20Ice/%EB%A0%88%EB%B2%A8%20%EC%97%90%EB%94%94%ED%84%B0)
- [Audiosurf — MobyGames](https://www.mobygames.com/game/32692/audiosurf/)
- [3Dash — Geometry Dash World](https://geometry-world.com/3dash)
- [DLCE (Dancing Line Community Edition) — itch.io](https://fengyandl.itch.io/dlce)
- [Dancing Line Level Editor — Discuss Scratch](https://scratch.mit.edu/discuss/topic/532790/)
- [TaikoNation: Patterning-focused Chart Generation for Rhythm Action Games (arXiv, академический источник про паттерны/плотность нот)](https://arxiv.org/pdf/2107.12506)

Японские:
- [osu!での太鼓譜面の作り方 — saltish.doorblog.jp](https://saltish.doorblog.jp/archives/50260934.html)
- [osu! Editの方法【初期設定編_タイミング設定】— hatenablog](https://boronyaaaaaaaaaaaaaaaaaaaaaaaaa.hatenablog.com/entry/2019/09/17/015236)
- [太鼓さん次郎・創作譜面の作り方 — LIBERTAS](https://w.atwiki.jp/puyokei/pages/1136.html)
- [太鼓さん次郎(TJA)関連ツール — 太鼓の達人 Wiki*](https://wikiwiki.jp/taiko/%E5%A4%AA%E9%BC%93%E3%81%95%E3%82%93%E6%AC%A1%E9%83%8E(TJA)%E9%96%A2%E9%80%A3%E3%83%84%E3%83%BC%E3%83%AB)
- [製作支援ツール — 太鼓さん次郎交流 Wiki*](https://wikiwiki.jp/jiro/%E8%A3%BD%E4%BD%9C%E6%94%AF%E6%8F%B4%E3%83%84%E3%83%BC%E3%83%AB)

## Что НЕ проверено (честно, не выдумано)

- Не найдено ни одного источника, где механика была бы буквально «наша ситуация»:
  готовая ПОСТОЯННАЯ трасса + ОПЦИОНАЛЬНЫЙ ритм-слой поверх неё, который можно включить/
  выключить, не меняя саму трассу. Это либо не существует как прецедент, либо не всплыло
  в поиске — честно не знаю, какой из двух вариантов, не выдаю догадку за факт.
- Не проверялось (не входило в это исследование): есть ли у Конструктора вообще звук/
  музыка, играющая во время самой расстановки препятствий (не во время полёта) — без этого
  «слушать и снапать одновременно» технически неприменимо буквально, это нужно сверить
  с живым кодом отдельно, не здесь.
- Достоверность источника про 3Dash — ниже остальных (геймдев-агрегаторы игры, не
  официальная документация редактора); использовать как «слабый» сигнал, не как
  подтверждённый факт устройства UI.
