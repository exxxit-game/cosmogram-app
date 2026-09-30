# ⚡ WebGL vs Canvas 2D: Сравнительный анализ для Cosmogram

> **Источник:** Cosmogram Engineering Research & Performance Profiling  
> **Статус:** 🟢 Стратегическое руководство по рендерингу

---

## 1. Пороги производительности и плотности объектов

| Объектов на экране | Canvas 2D (оптимизированный) | WebGL | Вердикт для Cosmogram |
| :--- | :--- | :--- | :--- |
| **10–50** | 60/120 FPS ✅ | 60/120 FPS ✅ | Canvas 2D полностью достаточен |
| **50–200** | 60 FPS ✅ (с Path2D кэшем) | 60/120 FPS ✅ | Стабильная зона Cosmogram (30–80 объектов) |
| **200–1000** | 20–45 FPS ⚠️ | 60/120 FPS ✅ | Потребуется батчинг или гибридный WebGL слой |
| **> 1000** | < 15 FPS ❌ | 60 FPS ✅ | Нужен WebGL ParticleContainer |

---

## 2. Разница архитектурных подходов

### Canvas 2D: Последовательные вызовы API
Каждый камень и бонус требует отдельной команды отрисовки в контексте:
```javascript
// ~400 вызовов API на 100 астероидов
for (const rock of obstacles) {
  ctx.setTransform(cos, sin, -sin, cos, rock.x | 0, rock.y | 0);
  ctx.drawImage(rockSprite, -16, -16);
}
```

### WebGL: Единый Draw Call (Sprite Batching)
Все координаты, UV-развертки и углы упаковываются в непрерывный `Float32Array` буфер:
```javascript
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
gl.drawArrays(gl.TRIANGLES, 0, count * 6);
```

---

## 3. Риски WebGL в Telegram Mini Apps (iOS WKWebView)

1. **Потеря контекста (`webglcontextlost`):** WKWebView на iOS агрессивно сбрасывает WebGL-контекст при нехватке памяти или сворачивании шторки Telegram.
2. **Память текстур:** На экранах Retina с DPR=3 полноэкранная текстура холста занимает десятки мегабайт видеопамяти.
3. **Холодный старт:** Компиляция GLSL-шейдеров добавляет 200–500 мс к запуску на слабых чипах Android Go.

---

## 4. Архитектурный вердикт для Cosmogram

- **Текущий этап:** Оставаться на чистом Canvas 2D. Использовать предрендеринг свечений, Path2D кэш и целочисленные координаты.
- **Перспектива:** Внедрение интерфейса `Renderer` (паттерн Strategy) для бесшовного подключения WebGL-слоя частиц при необходимости.
