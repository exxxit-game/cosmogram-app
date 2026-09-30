# 🎮 Архитектурные паттерны игр — Game Programming Patterns (Robert Nystrom)

> **Источник:** Robert Nystrom «Game Programming Patterns»  
> **Статус:** 🔴 Фундаментальная база для циклов, пулов и состояний

---

## 1. Game Loop с Fixed Timestep и защитой от спирали смерти

Фиксированный шаг физики (Fixed Timestep 60Hz) отделяет расчет движения от переменного времени отрисовки:

```javascript
// Паттерн Glenn Fiedler + Robert Nystrom
const STEP = 1 / 60; // 16.666 ms
let acc = 0;
let lastT = performance.now();

function loop(nowT) {
  let dt = (nowT - lastT) / 1000;
  lastT = nowT;
  if (dt > 0.25) dt = 0.25; // Защита от сна вкладки
  acc += dt;

  let n = 0;
  // Play catch-up с лимитом шагов против спирали смерти
  while (acc >= STEP && n < 4) {
    update(STEP);
    acc -= STEP;
    n++;
    if (!S.running || S.paused) { acc = 0; break; }
  }
  if (n === 4) acc = 0; // Сброс при критическом отставании

  const alpha = acc / STEP; // Коэффициент интерполяции для рендера
  render(alpha);
  requestAnimationFrame(loop);
}
```

---

## 2. Object Pool со связанным списком (Free-List) и сбросом инвариантов

Пул памяти исключает паузы сборщика мусора (GC) во время 60/120 FPS игры:

```javascript
function makePool(maxCap) {
  const free = [];
  return {
    take() {
      return free.pop() || {};
    },
    give(o) {
      if (free.length < maxCap) {
        // Обязательный сброс динамических полей для исключения утечек памяти
        o._tint = null;
        o._path = null;
        o._tg = null;
        o._tgk = undefined;
        free.push(o);
      }
    }
  };
}
```

---

## 3. Command Pattern (5 способов управления)

Входные события от клавиатуры, мыши, гироскопа, тача и геймпада преобразуются в абстрактные команды штурвала:
- Целевая координата `(targetX, targetY)`.
- Вектор смещения `(dx, dy)`.
- Арбитраж «Суда компасов» для выявления врущего датчика.
