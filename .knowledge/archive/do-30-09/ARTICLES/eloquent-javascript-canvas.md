# 📖 Глубокий конспект: Eloquent JavaScript (Главы 14–16)

> **Источник:** Marijn Haverbeke «Eloquent JavaScript»  
> **Статус:** 🟢 Фундаментальное руководство для `render.js`, `ui.js`, `input.js`

---

## 1. Глава 14: The Document Object Model (DOM)

### Layout Thrashing & Reflow (Смерть 60 FPS)
Чтение геометрических свойств элемента (`offsetWidth`, `clientHeight`, `getBoundingClientRect()`) после записи стилей принудительно запускает синхронный пересчёт макета (Reflow/Layout Thrashing).

```javascript
// ❌ ПЛОХО (Layout Thrashing в цикле):
for (let i = 0; i < items.length; i++) {
  items[i].style.top = (box.offsetHeight + 10) + 'px'; // Чтение + Запись в каждой итерации
}

// ✅ ПРАВИЛЬНО (Батчинг: сначала всё прочитать, потом всё записать):
const offset = box.offsetHeight + 10;
for (let i = 0; i < items.length; i++) {
  items[i].style.top = offset + 'px';
}
```

### Применение в Cosmogram:
- В `ui.js` анимация `.pop` очков использует трюк `void elScore.offsetWidth` — это осознанный **разовый** reflow для перезапуска CSS-анимации. Он никогда не вызывается в горячем цикле рендера.

---

## 2. Глава 15: Handling Events (Событийная модель)

### Coalesced Events & Passive Listeners
1. **Пассивные слушатели (`{ passive: true }`):**
   Сообщают браузеру, что обработчик `touchstart`/`touchmove` не будет вызывать `e.preventDefault()`, что позволяет браузеру мгновенно прокручивать страницу без задержек.
   *В Cosmogram:* На игровом холсте используется `touch-action: none` в CSS, а слушатели тача обрабатываются с минимальным лагом.

2. **Pointer Events vs Mouse/Touch:**
   Использование универсального API `pointerdown`, `pointermove`, `pointerup` объединяет стилус, палец и мышь в единый поток событий без дублирующих эмуляций `mousedown`/`mouseup`.

---

## 3. Глава 16: Drawing on Canvas

### Преобразования координат и матрица трансформации
Canvas 2D использует аффинную матрицу трансформации 3×2:
$$\begin{pmatrix} x' \\ y' \\ 1 \end{pmatrix} = \begin{pmatrix} a & c & e \\ b & d & f \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x \\ y \\ 1 \end{pmatrix}$$

```javascript
// Замена тяжелых ctx.save() + translate() + rotate() + scale() + restore()
// на один прямой вызов setTransform():
const cos = Math.cos(angle) * scale;
const sin = Math.sin(angle) * scale;
ctx.setTransform(cos, sin, -sin, cos, Math.floor(x), Math.floor(y));
ctx.drawImage(sprite, -w / 2, -h / 2);
```
