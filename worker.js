/**
 * CosmoCoder Proxy v2 — Cloudflare Worker
 * --------------------------------------
 * Прячет ключ Anthropic на сервере: страница чата стучится сюда, а не в api.anthropic.com,
 * и ключ никогда не попадает в браузер.
 *
 * Что изменилось против v1 (14.08.2026):
 *   1. МОДЕЛЬ. Было `claude-sonnet-4-6` — такой модели не существует, API отвечал ошибкой.
 *      Теперь модель берётся из переменной MODEL, по умолчанию `claude-sonnet-5`.
 *      Сменить модель — это правка переменной в панели, а не правка кода.
 *   2. ЗАМОК. Проверка Origin осталась, но она НЕ защита: заголовок Origin ставит браузер,
 *      а curl ставит любой. Настоящий замок — секрет DEV_KEY, который страница шлёт
 *      в заголовке `x-cosmo-key`. Секрет не лежит в репозитории: вводится один раз
 *      в браузере и живёт в хранилище устройства.
 *   3. СРАВНЕНИЕ СЕКРЕТА постоянное по времени — как в cosmogram-sync и cosmogram-daily.
 *   4. ПОТОЛКИ на размер тела и длину переписки: чужой не сможет прислать мегабайт.
 *
 * Переменные (Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY — Secret, ключ sk-ant-...            (обязательна)
 *   DEV_KEY           — Secret, ваш личный пароль входа     (обязательна)
 *   ALLOWED_ORIGIN    — текст, https://superduck77.github.io (желательна)
 *   MODEL             — текст, claude-sonnet-5              (необязательна)
 *   MAX_TOKENS        — текст, 8000                         (необязательна)
 *
 * И отдельно, в консоли Anthropic: поставьте месячный потолок трат. Это последний слой,
 * который переживёт утечку и ключа, и секрета. Закон проекта: проверку кладут туда,
 * где её нельзя обойти.
 */

const SYSTEM_PROMPT = `Ты — CosmoCoder, помощник инженера игры «Космограмма» (Telegram Mini App).

Устройство:
- Аркадный раннер: уворачиваешься от преград, ловишь бонусы, ставишь рекорды.
- Ванильный JS + Canvas 2D, БЕЗ сборки и без зависимостей — код читается как книга.
- Ядро: core.js (утилиты, мост Telegram, хранилище), game.js (игровой цикл), render.js (рисование).
  Ядро не меняют без прямой просьбы владельца.
- Модули: input (штурвалы), ui (экраны), sync (облако), ach, forge (Кузница), planetarium,
  goldstar (звезда дня), music, gyro, adaptive, card, star, beacon (Почта неба), blackbox.
- Сервер: семь edge-функций Supabase, все с verify_jwt:false — защита внутри кода функции.
- Детерминизм «сид + лента»: один сид = одна трасса на любом экране. У каждого спавна свой
  подпоток из ключа дня; номер спавна тратится, даже если преграду поставить некуда.
- Фиксированный шаг STEP=1/60, максимум 4 подшага за кадр; рисование отдельно от логики.
- «Метр неба»: эталон 390×844, поле ровно 390 мер по центру («коридор чести»),
  «потолок листа» 2560 px по длинной стороне. Пулы объектов, бюджет кадра 16.7 мс.

Хартия неба — четыре вопроса к любому новому коду:
1. Улучшает ли игру? 2. Читается ли с полёта? 3. Не пугает ли зря? 4. Не крадёт ли кадры?
Декор никогда не входит в коридор столкновений. Механика одинакова для всех устройств:
масштабируются только украшения, никогда препятствия.

Законы, которые ты обязан соблюдать в ответах:
- Разбор цены до кода: противоречия, цена, время, 2–3 варианта, рекомендация. Стоп до «да».
- Страж пишется ДО правки и обязан сначала покраснеть. Зелёный страж — не доказательство.
- Одна фича — один полный цикл. Не объединять правки «заодно».
- Не выдавать догадку за факт: если не видел код файла — скажи прямо, что нужно его увидеть,
  и не сочиняй номера строк, имена переменных и версии.
- Комментарий ставится строкой ВЫШЕ и объясняет «почему», а не «что».
- Всё по-русски: и ответ, и комментарии в коде, и любой текст, попадающий на экран игры.`;

/* Сравнение секретов постоянное по времени: посимвольный XOR, без раннего выхода.
   Ранний выход по первому несовпадению выдаёт длину общего префикса через время ответа. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const MAX_BODY_BYTES = 256 * 1024; // тело запроса: четверть мегабайта с запасом
const MAX_MESSAGES = 60;           // длина переписки, дальше страница обязана обрезать сама

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cosmo-key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status) => new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Только POST' }, 405);

    // Первый слой — вежливость: отсекает случайные заходы из браузера, но не curl.
    if (allowedOrigin !== '*' && origin && origin !== allowedOrigin) {
      return json({ error: 'Чужой origin' }, 403);
    }

    // Второй слой — настоящий замок.
    if (!env.DEV_KEY) return json({ error: 'DEV_KEY не настроен в воркере' }, 500);
    if (!sameSecret(request.headers.get('x-cosmo-key') || '', env.DEV_KEY)) {
      return json({ error: 'Не тот ключ. Нажми «сменить ключ» и введи заново.' }, 401);
    }

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY не настроен' }, 500);

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY_BYTES) return json({ error: 'Слишком длинный запрос' }, 413);

    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'Тело не разобралось как JSON' }, 400); }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json({ error: 'Пустой разговор' }, 400);
    if (messages.length > MAX_MESSAGES) return json({ error: 'Слишком длинная переписка' }, 413);

    const model = env.MODEL || 'claude-sonnet-5';
    const maxTokens = Number(env.MAX_TOKENS || 8000);

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages }),
      });

      const data = await upstream.json();

      /* Неуспех наверху обязан долетать словами, а не молчанием: без этого «не работает»
         невозможно отличить от «не тот ключ», «нет такой модели» и «кончились деньги». */
      if (!upstream.ok) {
        const msg = (data && data.error && data.error.message) || ('Ответ ' + upstream.status);
        return json({ error: msg, model }, upstream.status);
      }

      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      const u = data.usage || {};
      return json({ text, model, usage: { in: u.input_tokens || 0, out: u.output_tokens || 0 } });
    } catch (e) {
      return json({ error: 'Не достучался до api.anthropic.com' }, 502);
    }
  },
};
