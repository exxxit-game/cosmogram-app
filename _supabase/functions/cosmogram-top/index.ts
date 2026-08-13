// cosmogram-top (13.08.2026) — публичная витрина таблицы рекордов. ТОЛЬКО ЧТЕНИЕ.
//
// Зачем отдельная комната. Гость жал «ТОП» и получал пустоту с надписью «войди через
// Telegram» — при том, что в таблице пятнадцать живых игроков. Выглядело как отказ по его
// вине. Корень: в cosmogram-sync одна дверь на все действия (`if (!idn) ... 401`), и за ней
// оказалось чтение, которое никакой подписи не требует по смыслу.
//
// Правильное место для этой правки — сама cosmogram-sync, и патч для неё уже написан и лежит
// в репозитории. Но развернуть её можно только целиком, а это 860 строк, которые пришлось бы
// передавать одним куском: риск оборвать передачу на середине оказался выше выигрыша.
// Поэтому пока — эта комната. Она ВРЕМЕННАЯ и обратима: как только появится Supabase CLI,
// чтение переезжает внутрь cosmogram-sync, а эта функция удаляется. «Одна дверь» никуда
// не делась, она просто придёт позже.
//
// Что здесь можно и чего нельзя:
//   можно  — попросить список первых ста по одной из пяти категорий;
//   нельзя — записать, изменить, удалить хоть что-нибудь. Здесь нет ни одной операции
//            записи, и добавлять её сюда запрещено: у комнаты одна дверь и одно назначение.
// Наружу уходят те же поля, что видел любой вошедший игрок: имя, ник, провайдер, счёт,
// отметка подтверждения. Ни одного НОВОГО поля мы не открываем.
// Своего места гость не получает — его нет, пока он не представился. Клиент считает
// «ты был бы N-м» сам, по уже полученному списку, без второго запроса.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CATS = ['gyro', 'touch', 'bullet', 'dist', 'keys'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  /* POST, как и все наши функции: у чтения нет причины отличаться формой запроса от соседей,
     а одинаковая форма — это на одну неожиданность меньше в клиенте. */
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  /* Категория приходит от клиента, то есть от кого угодно. Не проверяем её на «плохие символы»,
     а сверяем со списком известных: всё, чего нет в списке, становится 'touch'. Отказ игроку
     из-за опечатки в запросе — худший исход, чем показать ему таблицу не той категории. */
  const cat = CATS.includes(body?.category) ? body.category : 'touch';

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows, error } = await sb
    .from('scores')
    .select('player_id, best, verified, players(first_name, username, provider)')
    .eq('category', cat)
    .order('best', { ascending: false })
    .limit(100);
  if (error) return json({ ok: false, reason: 'db' }, 500);

  const top = (rows || []).map((r: any) => ({
    pid: r.player_id,                                  // нужен клиенту для кнопки «лететь с призраком»
    name: r.players?.first_name || 'Игрок',
    username: r.players?.username || null,
    provider: r.players?.provider || 'tg',
    best: r.best,
    verified: r.verified === true,
    me: false,                                         // гость не в списке: он ещё не представился
  }));

  /* Форма ответа — ровно та же, что у действия 'top' в cosmogram-sync. Это не совпадение,
     а условие: клиент разбирает оба ответа одним и тем же кодом, и в день переезда чтения
     обратно в cosmogram-sync менять в клиенте будет нечего, кроме адреса. */
  return json({ ok: true, category: cat, top, me: null, guest: true });
});
