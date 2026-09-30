# 🎲 Procedural Content Generation: Seeded PRNG & Noise (Noor Shaker et al.)

> **Источник:** PCG in Games & Mulberry32 / Xoshiro algorithms  
> **Статус:** 🔴 Фундамент «Протокола seed» (v1.99.9) и детерминизма трасс

---

## 1. Детерминированные PRNG: Mulberry32

Простой, быстрый и детерминированный 32-битный генератор случайных чисел для JavaScript:

```javascript
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

---

## 2. Изоляция потоков генерации: паттерн `withTrack`

Чтобы спавн бонусов не менял порядок генерации астероидов при разных действиях игрока:

```javascript
// Изолированные последовательности:
// mapSeedKey·ob·0, mapSeedKey·ob·1 (препятствия)
// mapSeedKey·st·0, mapSeedKey·st·1 (звёзды)
// mapSeedKey·pw·0, mapSeedKey·pw·1 (бонусы)

function withTrack(kind, fn) {
  const prev = mapRNG;
  mapRNG = keyRNG(mapSeedKey + '·' + kind + '·' + (mapSeq[kind]++));
  try {
    return fn();
  } finally {
    mapRNG = prev; // Гарантированный возврат
  }
}
```

---

## 3. Суточный ключ UTC: `trackDayKey()`

```javascript
function trackDayKey() {
  const d = new Date();
  // Формируем строгий UTC ключ YYYY-MM-DD для единой трассы по всей планете
  return d.getUTCFullYear() + '-' + 
         String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + 
         String(d.getUTCDate()).padStart(2, '0');
}
```
