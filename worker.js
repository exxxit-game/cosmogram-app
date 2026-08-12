/**
 * CosmoCoder Proxy — Cloudflare Worker
 * ------------------------------------
 * Прячет API-ключ Anthropic на сервере. dev-chat.html стучится сюда,
 * а не напрямую в api.anthropic.com — ключ никогда не попадает в браузер.
 *
 * Деплой (см. DEV_CHAT_SETUP.md):
 *   1. workers.cloudflare.com → Create Worker → вставь этот код
 *   2. Settings → Variables → Secret: ANTHROPIC_API_KEY = sk-ant-...
 *   3. Settings → Variables → ALLOWED_ORIGIN = https://superduck77.github.io
 *   4. Deploy, скопируй URL воркера в dev-chat.html (CONFIG.workerUrl)
 */

const SYSTEM_PROMPT = `Ты — CosmoCoder, ассистент разработчика игры Cosmogram (Telegram Mini App).

Проект:
- Космический раннер: уворачивайся от астероидов, лови бонусы, ставь рекорды.
- Vanilla JS + canvas, БЕЗ сборки и фреймворков — код должен читаться как книга.
- Файлы: core.js (утилиты, Telegram init, хранилище), render.js (рендер),
  game.js (игровой цикл), ui.js (экраны/навигация), input.js (штурвалы),
  forge.js (конструктор трасс), gyro.js (гироскоп), sync.js (облако).
- Детерминизм "seed + лента": один seed = одна трасса на любом экране.
- Object Pooling для всех движущихся объектов, кадровый бюджет 16 мс.
- Safe-area для чёлок/notch, гироскоп с low-pass фильтром и deadzone 0.07.
- Целевые устройства: слабые Android (2 ГБ RAM), средние, флагманы — три тира графики.
- Экран мерится эталоном 390×844, "Потолок листа" — не больше 2560px по длинной стороне.

Хартия неба (правила для любого нового кода):
1. Улучшает ли игру?
2. Читается ли с полёта?
3. Не пугает ли зря?
4. Не крадёт ли кадры?
Декор никогда не входит в коридор столкновений. Механика одинакова для всех устройств —
масштабируются только украшения, никогда препятствия. Один модуль = один коммит = один пуш.

Отвечай кодом в этом стиле: без лишних абстракций, с комментариями-пояснениями "почему",
по-русски. Если не уверен в контексте конкретного файла — говори прямо, что нужно увидеть код.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (allowedOrigin !== '*' && origin !== allowedOrigin) {
      return new Response('Forbidden origin', { status: 403, headers: corsHeaders });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      const data = await upstream.json();

      if (!upstream.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || 'Upstream error' }), {
          status: upstream.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
