'use strict';
/* ============================================================
   CANVAS EFFECTS: 5 слоёв продвинутого рендеринга для Cosmogram
   - Слой 1: Процедурный фон с эхо-памятью сообщества
   - Слой 2: Динамическое освещение через композитинг
   - Слой 3: Детерминированные частицы с эхо-трассами
   - Слой 4: Адаптивный параллакс с реакцией на скорость
   - Слой 5: Звуко-хаптическая визуализация волн

   Зависит от: core.js (saneNumber, deadzone, lerp), input.js, 
   game.js (S, particles), render.js (ctx, W, H, DPR, SC, Q)

   Комбинаторная новизна: сочетание детерминизма (сид),
   эхо-паттернов (Supabase), синтеза звука, хаптики и Canvas 2D.
   ============================================================ */

/* ─────────────────────────────────────────────────────────────
   СЛОЙ 1: ПРОЦЕДУРНЫЙ ФОН С ЭХО-ПАМЯТЬЮ
   ─────────────────────────────────────────────────────────────
   Фон генерируется из:
   - Сида дня (детерминированная текстура)
   - Веса эхо-паттернов (где игроки активны — там теплее)
   Результат: уникальный для каждого дня фон, отражающий активность
*/

const ProceduralBg = {
  cache: { seed: -1, hueShift: -1, echoMap: null, bitmap: null },
  
  // Простой шум через сумму синусов (детерминированный, быстрый)
  noise2d(seed, x, y, octaves = 3) {
    let val = 0;
    let prng = this.xorshift(seed + x * 73856093 ^ y * 19349663);
    for (let oct = 0; oct < octaves; oct++) {
      const freq = 1 / (1 << oct);
      const amp = 1 / (oct + 1);
      val += amp * (Math.sin(x * freq * 0.01) * Math.cos(y * freq * 0.01));
      prng = this.xorshift(prng);
    }
    return (val / 2 + 0.5); // нормализуем в [0, 1]
  },
  
  // XORShift для детерминированного PRNG
  xorshift(x) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return x;
  },
  
  // Получить эхо-веса от сообщества (заглушка; в реальности из Supabase)
  async getEchoWeights() {
    // TODO: загрузить из /api/echo и кэшировать в localStorage
    return {}; // пока пусто
  },
  
  // Сгенерировать процедурный фон
  async generate(currentSeed, hueShift, echoWeights = {}) {
    const hq = Math.round(hueShift / 60); // квант для кэша
    if (
      this.cache.seed === currentSeed &&
      this.cache.hueShift === hq &&
      this.cache.bitmap
    ) {
      return this.cache.bitmap;
    }

    // Создаём offscreen-канвас полного размера
    let offscreen;
    try {
      offscreen = new OffscreenCanvas(
        Math.round(W * skyPx()),
        Math.round(H * skyPx())
      );
    } catch (e) {
      // Fallback для старых браузеров
      offscreen = document.createElement('canvas');
      offscreen.width = Math.round(W * skyPx());
      offscreen.height = Math.round(H * skyPx());
    }

    const x = offscreen.getContext('2d');
    if (!x) return null;

    // Заполняем пиксель-за-пиксель через ImageData (быстро)
    const imageData = x.createImageData(
      Math.round(W * skyPx()),
      Math.round(H * skyPx())
    );
    const data = imageData.data;
    const prng = this.xorshift(currentSeed);

    for (let py = 0; py < Math.round(H * skyPx()); py++) {
      for (let px = 0; px < Math.round(W * skyPx()); px++) {
        const x_norm = px / (W * skyPx());
        const y_norm = py / (H * skyPx());

        // Шум с несколькими октавами
        let noise = this.noise2d(
          currentSeed,
          px * 0.01,
          py * 0.01,
          4
        );

        // Добавляем эхо-вес (мягко, +20% от диапазона)
        const echoKey = Math.floor(x_norm * 10) + ',' + Math.floor(y_norm * 10);
        const echoWeight = echoWeights[echoKey] || 0;
        noise = Math.max(0, Math.min(1, noise + echoWeight * 0.1));

        // Преобразуем в RGB (холодные → тёплые на основе шума)
        const hue = 220 + noise * 40; // 220 (синий) → 260 (фиолетовый)
        const sat = 60 + noise * 20; // 60% → 80%
        const light = 15 + noise * 25; // 15% → 40%

        const rgb = this.hslToRgb(hue, sat, light);
        const idx = (py * Math.round(W * skyPx()) + px) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }

    x.putImageData(imageData, 0, 0);

    // Преобразуем в ImageBitmap для быстрого drawImage
    let bitmap;
    try {
      bitmap = offscreen.transferToImageBitmap?.()
        ? await Promise.resolve(offscreen.transferToImageBitmap())
        : offscreen;
    } catch (e) {
      bitmap = offscreen;
    }

    this.cache = { seed: currentSeed, hueShift: hq, echoMap: echoWeights, bitmap };
    return bitmap;
  },

  hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color);
    };
    return { r: f(0), g: f(8), b: f(4) };
  },

  draw(ctx, x, y, w, h) {
    if (this.cache.bitmap) {
      ctx.drawImage(this.cache.bitmap, x, y, w, h);
    }
  }
};

/* ─────────────────────────────────────────────────────────────
   СЛОЙ 2: ДИНАМИЧЕСКОЕ ОСВЕЩЕНИЕ ЧЕРЕЗ КОМПОЗИТИНГ
   ─────────────────────────────────────────────────────────────
   Использует режимы наложения (multiply, lighter) и радиальные
   градиенты для создания освещения от объектов.
*/

const DynamicLighting = {
  lightMap: null,
  lightMapCtx: null,

  init() {
    try {
      this.lightMap = new OffscreenCanvas(
        Math.round(W * skyPx()),
        Math.round(H * skyPx())
      );
    } catch (e) {
      this.lightMap = document.createElement('canvas');
      this.lightMap.width = Math.round(W * skyPx());
      this.lightMap.height = Math.round(H * skyPx());
    }
    this.lightMapCtx = this.lightMap.getContext('2d');
  },

  /**
   * Рендерим карту освещения на основе объектов и амплитуды звука
   * @param {Array} objects - [{x, y, intensity, color}]
   * @param {number} audioAmplitude - 0..1 от Web Audio
   */
  renderLightMap(objects, audioAmplitude = 0) {
    if (!this.lightMapCtx) this.init();

    const ctx = this.lightMapCtx;
    const w = Math.round(W * skyPx());
    const h = Math.round(H * skyPx());

    // Чистим чёрным фоном
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    // Для каждого объекта — радиальное свечение
    objects.forEach((obj) => {
      const baseRadius = 80 + audioAmplitude * 50;
      const gradient = ctx.createRadialGradient(
        obj.x * skyPx(),
        obj.y * skyPx(),
        0,
        obj.x * skyPx(),
        obj.y * skyPx(),
        baseRadius * skyPx()
      );

      // Цвет свечения (может быть передан или дефолт белый)
      const color = obj.color || '#ffffff';
      const opacity = obj.intensity || 0.8;

      gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
      gradient.addColorStop(0.5, `rgba(200,200,200,${opacity * 0.5})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(
        obj.x * skyPx(),
        obj.y * skyPx(),
        baseRadius * skyPx(),
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
  },

  /**
   * Накладываем карту освещения поверх основной сцены
   */
  applyToScene(mainCtx) {
    if (!this.lightMap) return;
    mainCtx.globalCompositeOperation = 'multiply';
    mainCtx.drawImage(this.lightMap, 0, 0);
    mainCtx.globalCompositeOperation = 'source-over';
  }
};

/* ─────────────────────────────────────────────────────────────
   СЛОЙ 3: ДЕТЕРМИНИРОВАННЫЕ ЧАСТИЦЫ С ЭХО-ТРАССАМИ
   ─────────────────────────────────────────────────────────────
   Частицы, которые воспроизводятся из сида и отражают действия
   игрока и других игроков (эхо-призраков).
*/

const EchoParticles = {
  particles: [],
  echoTraces: {}, // {ghostId: [{x, y, frame, action}]}

  /**
   * Сгенерировать частицы от действия игрока
   * @param {number} seed - детерминированный сид для PRNG
   * @param {string} action - тип действия (jump, dash, collect)
   * @param {number} x, y - позиция
   * @param {number} count - кол-во частиц
   */
  spawnFromAction(seed, action, x, y, count = 12) {
    const prng = this.makeRNG(seed);

    for (let i = 0; i < count; i++) {
      const angle = prng() * Math.PI * 2;
      const speed = 2 + prng() * 3;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // гравитация
        life: 1,
        action,
        age: 0,
        color: this.actionColor(action)
      });
    }
  },

  /**
   * Добавить эхо-трассы от других игроков (из лент ввода)
   * @param {string} ghostId - ID призрака
   * @param {Array} actions - [{frame, actionType, x, y}]
   */
  addEchoTrace(ghostId, actions) {
    this.echoTraces[ghostId] = actions.map((a) => ({
      ...a,
      spawnedParticles: false
    }));
  },

  /**
   * Обновить и отрисовать все частицы
   */
  updateAndDraw(ctx, currentFrame) {
    this.particles = this.particles.filter((p) => p.life > 0);

    // Обновляем существующие частицы
    this.particles.forEach((p) => {
      p.vy += 0.15; // гравитация
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.age++;

      // Отрисовываем
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Обновляем эхо-трассы (порождение частиц в моменты действий призраков)
    Object.keys(this.echoTraces).forEach((ghostId) => {
      const trace = this.echoTraces[ghostId];
      trace.forEach((action) => {
        if (!action.spawnedParticles && action.frame <= currentFrame) {
          this.spawnFromAction(
            ghostId.charCodeAt(0),
            action.actionType,
            action.x,
            action.y,
            8
          );
          action.spawnedParticles = true;
        }
      });
    });

    ctx.globalAlpha = 1;
  },

  actionColor(action) {
    const colors = {
      jump: '#00ff88',
      dash: '#ff0088',
      collect: '#ffff00',
      hit: '#ff4400',
      default: '#88ccff'
    };
    return colors[action] || colors.default;
  },

  makeRNG(seed) {
    let x = seed || 1;
    return () => {
      x ^= x << 13;
      x ^= x >> 17;
      x ^= x << 5;
      return (x >>> 0) / 0xffffffff;
    };
  }
};

/* ─────────────────────────────────────────────────────────────
   СЛОЙ 4: АДАПТИВНЫЙ ПАРАЛЛАКС С РЕАКЦИЕЙ НА СКОРОСТЬ
   ─────────────────────────────────────────────────────────────
   Несколько слоёв фона, каждый с разной скоростью, масштабом
   и поворотом в зависимости от действий игрока.
*/

const ParallaxLayers = {
  layers: [], // [{bitmap, depth, offsetX, offsetY}]

  // Инициализировать слои (вызвать один раз при старте)
  init(count = 3) {
    this.layers = [];
    for (let i = 0; i < count; i++) {
      this.layers.push({
        bitmap: null,
        depth: (i + 1) / count, // 0..1
        offsetX: 0,
        offsetY: 0,
        rotation: 0
      });
    }
  },

  /**
   * Обновить параллакс на основе позиции игрока и скорости
   * @param {number} playerX, playerY - позиция игрока в мире
   * @param {number} speedFactor - скорость (0..1)
   */
  update(playerX, playerY, speedFactor = 0) {
    this.layers.forEach((layer, idx) => {
      // Базовый сдвиг
      layer.offsetX = -playerX * layer.depth + W / 2;
      layer.offsetY = -playerY * layer.depth + H / 2;

      // Масштаб зависит от глубины и скорости
      layer.scale = 1 + layer.depth * 0.05 + speedFactor * 0.02;

      // Поворот при ускорении (тонкий эффект)
      layer.rotation = speedFactor * 0.005 * layer.depth;
    });
  },

  /**
   * Отрисовать все слои
   */
  draw(ctx) {
    this.layers.forEach((layer) => {
      if (!layer.bitmap) return;

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(layer.scale, layer.scale);
      ctx.rotate(layer.rotation);
      ctx.translate(-W / 2, -H / 2);
      ctx.translate(layer.offsetX, layer.offsetY);
      ctx.drawImage(layer.bitmap, 0, 0, W, H);
      ctx.restore();
    });
  }
};

/* ─────────────────────────────────────────────────────────────
   СЛОЙ 5: ЗВУКО-ХАПТИЧЕСКАЯ ВИЗУАЛИЗАЦИЯ ВОЛН
   ─────────────────────────────────────────────────────────────
   Волны расходятся от точек событий, синхронизированы со звуком
   и вибрацией.
*/

const AudioWaves = {
  waves: [], // [{x, y, radius, maxRadius, life, color, intensity}]

  /**
   * Добавить волну от события (звука или вибрации)
   */
  addWave(x, y, intensity = 0.5, color = '#00ffff') {
    this.waves.push({
      x,
      y,
      radius: 5,
      maxRadius: 80 + intensity * 80,
      life: 1,
      color,
      intensity
    });
  },

  /**
   * Обновить и отрисовать волны
   */
  updateAndDraw(ctx, audioAmplitude = 0) {
    // Фильтруем мёртвые волны
    this.waves = this.waves.filter((w) => w.life > 0);

    this.waves.forEach((w) => {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = w.life * 0.7;
      ctx.lineWidth = 3 - w.life * 2; // толщина тает со временем
      ctx.stroke();

      // Расширение волны
      w.radius += 1.5 + audioAmplitude * 2;
      w.life -= 0.012;
    });

    ctx.globalAlpha = 1;
  },

  /**
   * Вызовите это при каждом звуковом ивенте (из Web Audio)
   */
  onSoundEvent(x, y, frequency, amplitude) {
    const hue = 180 + (frequency / 20000) * 60; // частота → цвет (180-240)
    const color = `hsl(${hue}, 100%, 50%)`;
    this.addWave(x, y, amplitude, color);
  },

  /**
   * Вызовите это при вибрации (из Telegram.HapticFeedback)
   */
  onHaptic(x, y, intensity) {
    const color = intensity > 0.7 ? '#ff0088' : '#ffff00'; // сильное → красное, слабое → жёлтое
    this.addWave(x, y, intensity, color);
  }
};

/* ─────────────────────────────────────────────────────────────
   ИНТЕГРАЦИЯ: ГЛАВНЫЙ ЦИКЛ РЕНДЕРИНГА
   ─────────────────────────────────────────────────────────────
*/

const CanvasEffectsManager = {
  initialized: false,

  init() {
    if (this.initialized) return;
    ParallaxLayers.init(3);
    DynamicLighting.init();
    EchoParticles.particles = [];
    this.initialized = true;
  },

  /**
   * Вызвать в начале основного loop draw()
   * Рендерит все слои в правильном порядке
   */
  async render(ctx, gameState) {
    if (!this.initialized) this.init();

    // Подготовка
    const currentSeed = parseInt(S.seed) || 1;
    const echoWeights = {}; // TODO: загрузить реальные эхо-веса

    // 1. Процедурный фон
    const bgBitmap = await ProceduralBg.generate(
      currentSeed,
      S.hueShift || 0,
      echoWeights
    );
    if (bgBitmap) {
      ProceduralBg.draw(ctx, 0, 0, W, H);
    }

    // 2. Параллакс слои (если заполнены)
    const speedFactor = gameState?.speed || 0;
    ParallaxLayers.update(gameState?.x || 0, gameState?.y || 0, speedFactor);
    ParallaxLayers.draw(ctx);

    // 3. Основная сцена (игрок, враги, бонусы) — рисуется обычным способом в game.js
    // [здесь должен быть вызов стандартного рендера]

    // 4. Динамическое освещение
    const lightObjects = this.extractLightSources(gameState);
    const audioAmp = typeof getAudioAmplitude === 'function'
      ? getAudioAmplitude()
      : 0;
    DynamicLighting.renderLightMap(lightObjects, audioAmp);
    DynamicLighting.applyToScene(ctx);

    // 5. Эхо-частицы
    EchoParticles.updateAndDraw(ctx, gameState?.frame || 0);

    // 6. Звуко-хаптические волны
    AudioWaves.updateAndDraw(ctx, audioAmp);
  },

  /**
   * Извлечь источники света из состояния игры
   */
  extractLightSources(gameState) {
    const sources = [];

    // Игрок
    if (gameState?.x != null && gameState?.y != null) {
      sources.push({
        x: gameState.x,
        y: gameState.y,
        intensity: 0.9,
        color: '#ffff00'
      });
    }

    // Враги (препятствия)
    if (typeof obstacles !== 'undefined' && Array.isArray(obstacles)) {
      obstacles.slice(0, 5).forEach((o) => {
        // Только ближайшие 5
        if (o.x != null && o.y != null) {
          sources.push({
            x: o.x,
            y: o.y,
            intensity: 0.4,
            color: '#ff4400'
          });
        }
      });
    }

    // Бонусы
    if (typeof powers !== 'undefined' && Array.isArray(powers)) {
      powers.slice(0, 5).forEach((p) => {
        if (p.x != null && p.y != null) {
          sources.push({
            x: p.x,
            y: p.y,
            intensity: 0.7,
            color: '#00ff88'
          });
        }
      });
    }

    return sources;
  }
};

// Убедитесь, что это экспортируется или доступно глобально
if (typeof window !== 'undefined') {
  window.CanvasEffects = CanvasEffectsManager;
  window.ProceduralBg = ProceduralBg;
  window.DynamicLighting = DynamicLighting;
  window.EchoParticles = EchoParticles;
  window.ParallaxLayers = ParallaxLayers;
  window.AudioWaves = AudioWaves;
}
