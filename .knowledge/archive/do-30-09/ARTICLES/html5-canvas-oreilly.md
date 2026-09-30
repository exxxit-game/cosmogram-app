# 🎨 HTML5 Canvas (Steve & David Fulton, O'Reilly) — Главы 5, 7, 10

> **Источник:** O'Reilly «HTML5 Canvas (2nd Edition)»  
> **Статус:** 🟢 Практическое руководство по анимации, спрайтам и архитектуре 2D игр

---

## 1. Глава 5: Animation & Math

### Квантование углов и тригонометрический LUT (Look-Up Table)
Вычисление `Math.sin()` и `Math.cos()` в горячем цикле для сотен частиц и звезд создает избыточную нагрузку на CPU:

```javascript
// Таблица предподсчитанных синусов и косинусов на 360 градусов
const SIN_LUT = new Float32Array(360);
const COS_LUT = new Float32Array(360);
const DEG_TO_RAD = Math.PI / 180;

for (let deg = 0; deg < 360; deg++) {
  SIN_LUT[deg] = Math.sin(deg * DEG_TO_RAD);
  COS_LUT[deg] = Math.cos(deg * DEG_TO_RAD);
}

function fastSin(deg) {
  const d = ((deg % 360) + 360) % 360 | 0;
  return SIN_LUT[d];
}
```

---

## 2. Глава 7: Working with Images & Sprite Sheets

### Кэширование составных спрайтов свечений
Вместо динамического рисования радиальных градиентов `createRadialGradient()` на каждый бонус в каждом кадре:

```javascript
// Предварительный рендеринг светящегося диска на скрытый OffscreenCanvas
function createGlowSprite(radius, colorStops) {
  const off = document.createElement('canvas');
  const size = radius * 2;
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  for (const [stop, col] of colorStops) {
    grad.addColorStop(stop, col);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return off;
}
```

---

## 3. Глава 10: Game Engine Architecture

### Изоляция слоёв и Fixed-Rate Physics
- Отделение времени симуляции от времени рендера.
- Усечение `dt` при переключении вкладок.
- Чистые структуры данных с непрерывным расположением в памяти.
