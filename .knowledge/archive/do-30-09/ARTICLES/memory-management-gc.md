# 🧠 Управление памятью и GC в JavaScript — MDN & V8 Internals

> **Источник:** MDN Web Docs & V8 Memory Management  
> **Статус:** 🔴 Фундаментальная база для Zero-Allocation и стабильных 60/120 FPS

---

## 1. Механизм работы Garbage Collector (V8 Orinoco & Scavenger)

1. **Young Generation (Scavenge):** Новые объекты попадают в «молодое поколение». Если в цикле создаются тысячи `{ x, y }`, Scavenger запускает частые мини-паузы (1–5 мс), вызывающие микрофризы (frame drops).
2. **Old Generation (Mark-Sweep-Compact):** Долгоживущие объекты продвигаются в старое поколение. Полная сборка мусора (Major GC) может заморозить поток на 20–100 мс, вызывая визуальный лаг.

---

## 2. Анатомия утечек памяти в одностраничных Canvas-играх

| Причина утечки | Как выглядит в коде | Решение в Cosmogram |
| :--- | :--- | :--- |
| **Зависшие слушатели** | `window.addEventListener()` без `removeEventListener()` | Единая регистрация слушателей при старте `input.js`, без пересоздания |
| **Бесконечный рост кэша** | Кэширование градиентов по неограниченным ключам | Ограничение размера LRU/FIFO кэшей градиентов (`GRAD_CACHE_CAP = 128`) |
| **Мусорные замыкания** | Сохранение ссылок на большие объекты внутри `setInterval` | Использование `rAF` и плоских функций |
| **Грязные поля пула** | Возврат объектов в пул без сброса ссылок (`_tint`, `_path`) | Явная очистка полей в `pool.give(o)` |

---

## 3. Правило Zero-Allocation во время активного полёта

```javascript
// ❌ ЗАПРЕЩЕНО в update() и render():
const v = [plane.x, plane.y];        // Array allocation
const pt = { x: o.x, y: o.y };       // Object literal allocation
const str = `pos_${x}_${y}`;         // String concatenation allocation

// ✅ РАЗРЕШЕНО:
tempVec2.x = plane.x;
tempVec2.y = plane.y;
```
