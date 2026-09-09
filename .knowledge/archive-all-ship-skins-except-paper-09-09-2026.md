# Архив: все скины корабля кроме «Бумажный» — сняты с игры 09.09.2026

Владелец: убрать из игры (`js/game.js` → `SKINS[]`) все скины, кроме id:0 «Бумажный»,
полностью, переместить сюда как черновик идей — не потерять, не отклонить, просто снять
с продажи/выдачи прямо сейчас. Ничего из этого не удалено безвозвратно — это честная
копия того, что реально лежало в `SKINS[]` на момент архивации (v1.478.175, до правки).

Причина в словах владельца не пояснена отдельно — задача сама по себе: каталог скинов
пересматривается с нуля, в игре остаётся только нейтральный дефолтный «Бумажный», всё
остальное — на паузу до отдельного решения, что и в каком виде возвращать.

## Что НЕ тронуто (важно, не путать со снятием с игры)
- Функции отрисовки в `render.js` (`PREM_FX_MAP` и все `fxMatXxx`/`fxSigXxx`/`fxIllXxx`/
  `fxPatXxx`/`fxCosXxx`/`fxCulPersian` и т.д.) — НЕ удалены, остаются в файле. Убраны
  только записи в `SKINS[]`, которые на них ссылались (id) — сами функции просто больше
  ничем не вызываются, безвредный неиспользуемый код, не крашится.
- `SKINS_BY_ID.get(id)` для любого из этих id теперь честно вернёт `undefined` — везде
  по кодовой базе уже стоит `SKINS_BY_ID.get(x)||SKINS[0]` (проверено 09.09.2026 по всем
  файлам: card.js, core.js, game.js, music.js, render.js, ui.js) — ничего не падает,
  игрок просто увидит Бумажный корпус вместо снятого скина.
- Декали/Вспышки/Следы/Иконки (отдельные категории, свои независимые массивы —
  `DECALS`, `FLASHES`, `TRAILS`, значки и т.д.) — НЕ тронуты, задача была только про
  скины корабля (цвет/материал корпуса).
- **Не тронут сервер** (`cosmogram-sync`, `PREMIUM_SKINS`) — на нём всё ещё числятся
  premium-скины (были id49, 52-57) как покупаемые за Stars. Это отдельный, более
  опасный шаг (живой платёжный каталог) — не сделан молча, ждёт отдельного явного слова.
  Пока сервер не поправлен: технически можно попытаться купить скин, которого в клиенте
  больше нет — по нажатию клиент просто не найдёт что показывать, но деньги спишутся.
  **Нужно решить: снять эти id с продажи на сервере тоже, до следующего реального
  визита живого магазина.**

## Читаемый список — что где, без кода (по просьбе владельца: «как понять, где какой скин»)

### Тир 2 — яркие (фирменная фишка + след)
| id | Название | Как выглядит | Цена |
|---|---|---|---|
| 4 | Неон | Кислотно-зелёный корпус | 1500✦ |
| 5 | Аврора | Фиолетовый корпус | 2500✦ |
| 6 | Плазма | Глубокий апельсин | 4000✦ |

### Тир 3 — легендарные (уникальное поведение корпуса)
| id | Название | Как выглядит | Цена |
|---|---|---|---|
| 7 | Хром | Нейтральная сталь, бегущий блик-полоса | 7000✦ |
| 8 | Призрак | Ледяной циан, мигает/полупрозрачный | 12000✦ |

### Физика/культура, партия 2 (были на id9-14, потом на id52-57 — Stars)
| id | Название | Как выглядит | Цена |
|---|---|---|---|
| 52 | Спиральная галактика | Волна плотности вращается как целое, синий | 100⭐ |
| 53 | Аккреционный диск | Дифф. ротация + мерцающий джет, светлый | 100⭐ |
| 54 | Квазикристалл | Апериодичная 10-лучевая диаграмма, розовый | 100⭐ |
| 55 | Дамасская сталь | Блеск бежит по волнистым полосам «воды», золото | 100⭐ |
| 56 | Кольчуга | Полотно собирается кольцо за кольцом, зелёный | 100⭐ |
| 57 | Персидский ковёр | Ткётся узел за узлом снизу вверх, голубой | 100⭐ |

### 17 материалов (весь корпус перекрашен целиком, пока бесплатно — tempFree)
| id | Название | Как выглядит |
|---|---|---|
| 15 | Золото | Тёплое золото |
| 16 | Серебро | Холодное серебро |
| 17 | Бронза | Тёплая бронза |
| 18 | Лёд/Хрусталь | Ледяной голубой |
| 19 | Изумруд | Тёмно-зелёный самоцвет |
| 20 | Обсидиан | Тёмный фиолетово-чёрный вулканический камень |
| 21 | Мрамор | Светлый камень с прожилками |
| 22 | Туманность/галактика | Тёмно-фиолетовый космос |
| 23 | Опал | Светлый переливчатый |
| 24 | Окисленная медь | Ржаво-оранжевый с зелёным отливом |
| 25 | Карбон | Тёмно-серый угольный |
| 26 | Лава | Чёрный с оранжевым свечением |
| 27 | Ржавое железо | Коричнево-рыжий металл |
| 28 | Соты/янтарь | Тёплый янтарно-коричневый |
| 29 | Плазма (материал) | Тёмно-фиолетовый (не путать с id6 «Плазма»-фишкой) |
| 30 | Кварц | Розовато-серый камень |
| 31 | Дерево | Тёплое дерево |

### 9 символов-сигилов (нейтральный борт + гравированный знак по центру, пока бесплатно)
| id | Название | Как выглядит |
|---|---|---|
| 32 | Пентаграмма | Фиолетовый борт, знак-звезда |
| 33 | Гексаграмма | Оранжевый борт, знак-звезда о 6 лучах |
| 34 | Мандала-розетка | Мятный борт, круговой узор-розетка |
| 35 | Трикветра | Салатовый борт, кельтский узел |
| 36 | Роза ветров | Сиреневый борт, компас-роза |
| 37 | Инь-Янь | Серый борт, классический символ |
| 38 | Цветок жизни | Зелёный борт, геометрический цветок |
| 39 | Мальтийский крест | Розовый борт, крест |
| 40 | Кристалл-снежинка | Голубой борт, снежинка |

### 4 приёма иллюзии формы (нейтральный борт + узор внутренними линиями, пока бесплатно)
| id | Название | Как выглядит |
|---|---|---|
| 41 | Кожаная стёжка | Тёплый бежевый, стёганый узор |
| 42 | Топографические линии | Зелёный, линии как на карте высот |
| 43 | Оригами-заломы | Розовый, заломы как сгибы бумаги |
| 44 | Плетёная решётка | Голубой, плетёный узор |

### 4 паттерна (добавлены 05.09.2026 «из макета в игру»)
| id | Название | Как выглядит | Цена |
|---|---|---|---|
| 45 | Пенроуз | Настоящая апериодичная мозаика де Брёйна | 2500✦ |
| 46 | Цветочная решётка | Геометрический узор-решётка | 2500✦ |
| 47 | Плед из кругов | Узор из пересекающихся кругов | 2500✦ |
| 48 | Кристалл | Гранёный корпус вместо гладкого | 2500✦ |

### Космос, партия 1 (08.09.2026, макет fizika-kultura-map, Stars)
| id | Название | Как выглядит | Цена |
|---|---|---|---|
| 49 | Кольца Сатурна | Настоящие относительные радиусы NASA, кольца вращаются | 180⭐ |
| 50 | Форма капли, аврора мерцает | Настоящая форма магнитосферы, зелёное мерцание | 2200✦ |
| 51 | Вращающийся маяк (пульсар) | Два луча с полюсов, честный маяк-эффект | 2000✦ |

## Записи в `js/game.js` → `SKINS[]` (техническая копия кода, все кроме id:0, v1.478.175)

```js
// Тир 2 — яркие: фирменная фишка + богатый след (только визуал, никаких бонусов!)
{id:4,name:4,price:1500,   fx:'neon',   body:'#e4ffd6',fold:'#9fe081',glow:'rgba(120,255,80,.95)', trail:'rgba(120,255,80,', cat:'bright'}, // Неон — кислотно-зелёный
{id:5,name:5,price:2500,   fx:'aurora', body:'#e6dcff',fold:'#b0a0e8',glow:'rgba(170,130,255,.95)',trail:'rgba(160,120,255,', cat:'bright'}, // Аврора — фиолет
{id:6,name:6,price:4000,   fx:'plasma', body:'#ffe4cc',fold:'#f09c62',glow:'rgba(255,135,60,.95)', trail:'rgba(255,125,55,', cat:'bright'}, // Плазма — глубокий апельсин (тон 23°)
// Тир 3 — легендарные: уникальное поведение корпуса
{id:7,name:7,price:7000,   fx:'chrome', body:'#eceff3',fold:'#a7aeba',glow:'rgba(196,200,208,.95)',trail:'rgba(175,182,196,', cat:'legendary'}, // Хром — нейтральная сталь
{id:8,name:8,price:12000,  fx:'ghost',  body:'#d8f4fa',fold:'#9cd8e4',glow:'rgba(130,235,245,.9)', trail:'rgba(120,225,240,', cat:'legendary'}, // Призрак — ледяной циан (тон 185°, единственный!)

// «Физика/культура, партия 2» — заменившие id9-14 (satellites/facets/inlay/filigree/core/aim,
// см. .knowledge/archive-premium-skins-id9-14-08-09-2026.md), сами перенесены с id9-14 на
// id52-57 09.09.2026 (та же ownership-id-reuse проблема, AI-DECISION-REGISTRY M2)
{id:52, name:'Спиральная галактика',       price:100, premium:true, fx:'cosGalaxy',    body:'#dde6ff',fold:'#9aa8e0',glow:'rgba(120,150,255,.95)',trail:'rgba(120,150,255,', cat:'stars'},
{id:53, name:'Аккреционный диск',          price:100, premium:true, fx:'cosAccretion', body:'#f4f2ff',fold:'#c9c3ea',glow:'rgba(210,200,255,.95)',trail:'rgba(210,200,255,', cat:'stars'},
{id:54, name:'Квазикристалл',              price:100, premium:true, fx:'cosQuasi',     body:'#ffe0ec',fold:'#e592b0',glow:'rgba(255,90,140,.95)', trail:'rgba(255,90,140,', cat:'stars'},
{id:55, name:'Дамасская сталь',            price:100, premium:true, fx:'matWootz',     body:'#fff0d6',fold:'#e0b46a',glow:'rgba(230,170,70,.95)', trail:'rgba(230,170,70,', cat:'stars'},
{id:56, name:'Кольчуга',                   price:100, premium:true, fx:'chainmail6',   body:'#d8ffe8',fold:'#8ed9ac',glow:'rgba(70,220,130,.95)', trail:'rgba(70,220,130,', cat:'stars'},
{id:57, name:'Персидский ковёр',           price:100, premium:true, fx:'persianTabriz',body:'#d2f6ff',fold:'#7fc9e0',glow:'rgba(60,190,230,.95)', trail:'rgba(60,190,230,', cat:'stars'},

// 17 материалов — весь корпус перекрашен целиком
{id:15, name:15, price:0, tempFree:true, fx:'matGold',      body:'#fff3d6',fold:'#e0b46a',glow:'rgba(230,180,70,.95)', trail:'rgba(230,180,70,', cat:'materials'},
{id:16, name:16, price:0, tempFree:true, fx:'matSilver',    body:'#f4f6fa',fold:'#c2cad8',glow:'rgba(190,202,220,.95)',trail:'rgba(190,202,220,', cat:'materials'},
{id:17, name:17, price:0, tempFree:true, fx:'matBronze',    body:'#f2ddc6',fold:'#b97a48',glow:'rgba(200,128,66,.95)', trail:'rgba(200,128,66,', cat:'materials'},
{id:18, name:18, price:0, tempFree:true, fx:'matIce',       body:'#dff2fb',fold:'#b6dced',glow:'rgba(140,200,235,.95)',trail:'rgba(90,180,225,', cat:'materials'},
{id:19, name:19, price:0, tempFree:true, fx:'matEmerald',   body:'#0e5030',fold:'#0a3a22',glow:'rgba(30,150,90,.95)',  trail:'rgba(60,210,130,', cat:'materials'},
{id:20, name:20, price:0, tempFree:true, fx:'matObsidian',  body:'#2a2438',fold:'#1c1828',glow:'rgba(130,110,180,.85)',trail:'rgba(220,225,240,', cat:'materials'},
{id:21, name:21, price:0, tempFree:true, fx:'matMarble',    body:'#efe7db',fold:'#d9cfba',glow:'rgba(220,210,195,.9)', trail:'rgba(190,178,160,', cat:'materials'},
{id:22, name:22, price:0, tempFree:true, fx:'matNebula',    body:'#160e2e',fold:'#100a20',glow:'rgba(130,90,200,.9)',  trail:'rgba(140,110,220,', cat:'materials'},
{id:23, name:23, price:0, tempFree:true, fx:'matOpal',      body:'#f3efe8',fold:'#d8cdbe',glow:'rgba(230,220,205,.9)', trail:'rgba(220,180,200,', cat:'materials'},
{id:24, name:24, price:0, tempFree:true, fx:'matVerdigris', body:'#c97a4a',fold:'#a05f36',glow:'rgba(150,110,70,.9)',  trail:'rgba(80,160,130,', cat:'materials'},
{id:25, name:25, price:0, tempFree:true, fx:'matCarbon',    body:'#181a1f',fold:'#101216',glow:'rgba(90,95,105,.85)', trail:'rgba(150,155,165,', cat:'materials'},
{id:26, name:26, price:0, tempFree:true, fx:'matLava',      body:'#241f1c',fold:'#161310',glow:'rgba(200,90,40,.9)',  trail:'rgba(255,120,40,', cat:'materials'},
{id:27, name:27, price:0, tempFree:true, fx:'matRust',      body:'#8a5a3a',fold:'#6a4128',glow:'rgba(150,90,40,.9)',  trail:'rgba(150,70,30,', cat:'materials'},
{id:28, name:28, price:0, tempFree:true, fx:'matHoney',     body:'#7a4f18',fold:'#5c3b10',glow:'rgba(214,150,50,.9)', trail:'rgba(214,150,50,', cat:'materials'},
{id:29, name:29, price:0, tempFree:true, fx:'matPlasma',    body:'#160b2e',fold:'#100821',glow:'rgba(150,90,220,.9)', trail:'rgba(130,90,220,', cat:'materials'},
{id:30, name:30, price:0, tempFree:true, fx:'matQuartz',    body:'#e9dbe0',fold:'#cbb0bc',glow:'rgba(200,150,175,.9)',trail:'rgba(200,150,175,', cat:'materials'},
{id:31, name:31, price:0, tempFree:true, fx:'matWood',      body:'#a5713a',fold:'#7c4f22',glow:'rgba(180,130,70,.9)', trail:'rgba(180,130,70,', cat:'materials'},

// 9 символов-сигилов
{id:32, name:32, price:0, tempFree:true, fx:'sigPenta',     body:'#efe0ff',fold:'#c9a8ec',glow:'rgba(190,110,255,.95)',trail:'rgba(190,110,255,', cat:'sigils'},
{id:33, name:33, price:0, tempFree:true, fx:'sigHexa',      body:'#ffe4d6',fold:'#eb9f7a',glow:'rgba(255,110,60,.95)', trail:'rgba(255,110,60,', cat:'sigils'},
{id:34, name:34, price:0, tempFree:true, fx:'sigMandala',   body:'#d6fff2',fold:'#7fdfc0',glow:'rgba(60,220,180,.95)', trail:'rgba(60,220,180,', cat:'sigils'},
{id:35, name:35, price:0, tempFree:true, fx:'sigTriquetra', body:'#eaffd0',fold:'#b8e07a',glow:'rgba(170,220,60,.95)', trail:'rgba(170,220,60,', cat:'sigils'},
{id:36, name:36, price:0, tempFree:true, fx:'sigCompass',   body:'#e2e0ff',fold:'#a8a0e8',glow:'rgba(120,100,255,.95)',trail:'rgba(120,100,255,', cat:'sigils'},
{id:37, name:37, price:0, tempFree:true, fx:'sigYinyang',   body:'#f0f0f0',fold:'#b8b8b8',glow:'rgba(180,180,180,.95)',trail:'rgba(180,180,180,', cat:'sigils'},
{id:38, name:38, price:0, tempFree:true, fx:'sigFlower',    body:'#dcffdf',fold:'#8fdd9a',glow:'rgba(80,220,110,.95)', trail:'rgba(80,220,110,', cat:'sigils'},
{id:39, name:39, price:0, tempFree:true, fx:'sigMaltese',   body:'#ffe0e6',fold:'#eb8ea0',glow:'rgba(240,70,100,.95)', trail:'rgba(240,70,100,', cat:'sigils'},
{id:40, name:40, price:0, tempFree:true, fx:'sigSnowflake', body:'#dcf4ff',fold:'#8fcbe8',glow:'rgba(70,190,235,.95)', trail:'rgba(70,190,235,', cat:'sigils'},

// 4 приёма иллюзии формы
{id:41, name:41, price:0, tempFree:true, fx:'illLeather',   body:'#ffe9cc',fold:'#e0ad6a',glow:'rgba(220,150,60,.95)', trail:'rgba(220,150,60,', cat:'illusion'},
{id:42, name:42, price:0, tempFree:true, fx:'illTopo',      body:'#d8ffe0',fold:'#8fdb9e',glow:'rgba(70,210,120,.95)', trail:'rgba(70,210,120,', cat:'illusion'},
{id:43, name:43, price:0, tempFree:true, fx:'illOrigami',   body:'#ffe0f0',fold:'#e08eb8',glow:'rgba(230,90,170,.95)', trail:'rgba(230,90,170,', cat:'illusion'},
{id:44, name:44, price:0, tempFree:true, fx:'illLattice',   body:'#dcf0ff',fold:'#8fc0e0',glow:'rgba(70,170,220,.95)', trail:'rgba(70,170,220,', cat:'illusion'},

// 4 паттерна (05.09.2026 «Из макета в игру»)
{id:45, name:45, price:2500, fx:'patPenrose',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'},
{id:46, name:46, price:2500, fx:'patLattice2',  body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'},
{id:47, name:47, price:2500, fx:'patCircles',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'},
{id:48, name:48, price:2500, fx:'illCrystal',   body:'#efeee9',fold:'#cdcabf',glow:'rgba(167,139,250,.95)', trail:'rgba(167,139,250,', cat:'patterns'},

// Космос (08.09.2026, физика/космос партия 1, макет fizika-kultura-map-08-09-2026.html)
{id:49, name:'Кольца Сатурна', price:180, premium:true, fx:'cosSaturn', body:'#efeee9',fold:'#cdcabf',glow:'rgba(230,190,120,.95)', trail:'rgba(230,190,120,', cat:'cosmos'},
{id:50, name:'Форма капли, аврора мерцает', price:2200, fx:'cosAurora', body:'#efeee9',fold:'#cdcabf',glow:'rgba(90,220,160,.95)', trail:'rgba(90,220,160,', cat:'cosmos'},
{id:51, name:'Вращающийся маяк (пульсар)', price:2000, fx:'cosPulsar', body:'#efeee9',fold:'#cdcabf',glow:'rgba(180,160,255,.95)', trail:'rgba(180,160,255,', cat:'cosmos'}
```

**Оставлено в игре**: только `{id:0,name:0,price:0, body:'#efeee9',fold:'#cdcabf',glow:'rgba(230,229,225,.9)',trail:'rgba(200,198,190,', cat:'classic'}` — «Бумажный».

**Статус**: снято с игры 09.09.2026, `GAME_VERSION` поднят. Сервер (`cosmogram-sync`
`PREMIUM_SKINS`) ещё НЕ поправлен — отдельный явный шаг, ждёт решения владельца.
