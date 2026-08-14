// Cosmogram daily (v1.100.2): прыжки дня, их ленты и знак золотой звезды.
// Отдельная комната рядом с cosmogram-sync: таблица рекордов не тронута.
//   daily_submit   {day, score, skin, track?, star?} — посадка дня: результат + лента (коридорные координаты) + знак звезды
//   daily_champion {day} — лучший лётчик дня с лентой; дверь только тому, кто сам сегодня прыгал.
//   daily_stats    {day} — «звезду взяли N из M»; та же дверь fly_first.
// JWT не используется; три личности — как в основной функции (initData / webAuth / dcAuth).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AUTH_MAX_AGE_SEC = 7 * 86400;
const TRACK_MIN = 60, TRACK_MAX = 4200; // упакованная лента: 3 символа на сэмпл
const SCORE_CAP = 10_000_000;
const MIN_INTERVAL_MS = 5000;

type Identity = { provider: string; providerId: string; name: string; uname: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function validateInitData(initData: string, botToken: string): Promise<Identity | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const enc = new TextEncoder();
    const k1 = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', k1, enc.encode(botToken));
    const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc.encode(dataCheck)));
    const calc = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (calc.length !== hash.length) return null;
    let diff = 0;
    for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff !== 0) return null;
    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > AUTH_MAX_AGE_SEC) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || typeof user.id !== 'number') return null;
    return { provider: 'tg', providerId: String(user.id),
      name: String(user.first_name || 'Игрок').slice(0, 64),
      uname: user.username ? String(user.username).slice(0, 64) : null };
  } catch { return null; }
}

async function validateWebAuth(auth: any, botToken: string): Promise<Identity | null> {
  try {
    if (!auth || typeof auth !== 'object') return null;
    const hash = String(auth.hash || '');
    if (!/^[0-9a-f]{64}$/i.test(hash)) return null;
    const pairs: string[] = [];
    for (const k of Object.keys(auth)) {
      if (k === 'hash') continue;
      const v = auth[k];
      if (v === undefined || v === null || v === '') continue;
      pairs.push(`${k}=${String(v)}`);
    }
    pairs.sort();
    const enc = new TextEncoder();
    const secret = await crypto.subtle.digest('SHA-256', enc.encode(botToken));
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(pairs.join('\n'))));
    const calc = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
    let diff = 0;
    for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff !== 0) return null;
    const authDate = Number(auth.auth_date || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > AUTH_MAX_AGE_SEC) return null;
    const id = Number(auth.id);
    if (!isFinite(id) || id <= 0) return null;
    return { provider: 'tg', providerId: String(id),
      name: String(auth.first_name || 'Игрок').slice(0, 64),
      uname: auth.username ? String(auth.username).slice(0, 64) : null };
  } catch { return null; }
}

function b64decode(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  // v6: здесь был [...sig] прямо по ArrayBuffer — а ArrayBuffer не итерируется, и весь
  // вход через Discord падал TypeError'ом внутрь общего catch в validateSession, отдавая
  // игроку молчаливый 401 на каждое действие Трассы дня. В cosmogram-sync тот же баг был
  // найден и починен (v12), сюда правка не доехала: закон №25 — правка класса ошибок не
  // закончена, пока не проверены ВСЕ, кто умеет делать то же самое. Страж 118.
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function validateSession(sess: string, secret: string): Promise<{ provider: string; providerId: string; playerId: number; name: string } | null> {
  try {
    const dot = sess.lastIndexOf('.');
    if (dot < 0) return null;
    const payload = b64decode(sess.slice(0, dot));
    const hash = sess.slice(dot + 1);
    if (!/^[0-9a-f]{64}$/i.test(hash)) return null;
    const calc = await hmacHex(secret, payload);
    let diff = 0;
    for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff !== 0) return null;
    const p = payload.split('|');
    if (p.length !== 5) return null;
    const exp = Number(p[4]);
    if (!isFinite(exp) || exp < Date.now() / 1000) return null;
    const playerId = Number(p[2]);
    if (!isFinite(playerId) || playerId <= 0) return null;
    return { provider: p[0], providerId: p[1], playerId, name: p[3] };
  } catch { return null; }
}

async function resolvePlayer(sb: any, idn: Identity): Promise<number> {
  const { data: ex } = await sb.from('identities').select('player_id')
    .eq('provider', idn.provider).eq('provider_id', idn.providerId).maybeSingle();
  if (ex) return ex.player_id as number;
  let pid: number;
  if (idn.provider === 'tg') pid = Number(idn.providerId);
  else { const { data: nid } = await sb.rpc('next_player_id'); pid = Number(nid); }
  // v1.108.1 «Честная гонка» (тот же фикс, что в cosmogram-sync): claim атомарно через
  // ON CONFLICT DO NOTHING на identities — раньше два почти одновременных запроса от одной
  // ещё не встреченной личности (особенно Discord, pid из последовательности) могли создать
  // двух разных игроков. Теперь только один запрос реально вставляет identities-строку;
  // проигравший тихо промолчит (ignoreDuplicates), оба перечитывают identities и сходятся на одном pid.
  await sb.from('identities').upsert(
    { provider: idn.provider, provider_id: idn.providerId, player_id: pid },
    { onConflict: 'provider,provider_id', ignoreDuplicates: true }
  );
  const { data: won } = await sb.from('identities').select('player_id')
    .eq('provider', idn.provider).eq('provider_id', idn.providerId).maybeSingle();
  const finalPid = won ? (won.player_id as number) : pid;
  await sb.from('players').upsert(
    { id: finalPid, first_name: idn.name, username: idn.uname, provider: idn.provider },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  return finalPid;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfgRows } = await sb.from('config').select('key, value')
    .in('key', ['bot_token', 'session_secret']);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows || []) cfg[r.key] = r.value;
  if (!cfg.bot_token) return json({ error: 'not_configured' }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  let idn: Identity | null = await validateInitData(String(body?.initData || ''), cfg.bot_token);
  if (!idn && body?.webAuth) idn = await validateWebAuth(body.webAuth, cfg.bot_token);
  if (!idn && body?.dcAuth && cfg.session_secret) {
    const d = await validateSession(String(body.dcAuth.sess || ''), cfg.session_secret);
    if (d) idn = { provider: d.provider, providerId: d.providerId, name: d.name, uname: null };
  }
  if (!idn) return json({ error: 'auth' }, 401);
  const pid = await resolvePlayer(sb, idn);

  if (body.action === 'daily_submit') {
    const day = String(body.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'bad_day' }, 400);
    // v1.108.1 «Настоящий день»: раньше день проверялся только по формату — клиент мог отправить
    // daily_submit с любой датой, прошлой или будущей, задним числом переписывая Трассу дня.
    // Окно ±1.5/2.5 суток от настоящего момента сервера покрывает все часовые пояса планеты
    // (UTC-12..UTC+14 — это ~26 часов разброса) и всё равно отсекает произвольные даты.
    const dayMs = Date.parse(day + 'T00:00:00Z');
    if (!isFinite(dayMs)) return json({ error: 'bad_day' }, 400);
    const diffDays = (Date.now() - dayMs) / 86400000;
    if (diffDays < -1.5 || diffDays > 2.5) return json({ error: 'bad_day' }, 400);
    let score = Math.floor(Number(body.score));
    if (!isFinite(score) || score <= 0) return json({ error: 'bad_score' }, 400);
    if (score > SCORE_CAP) score = SCORE_CAP; // правдоподобие, как в основной таблице
    // антиспам: та же мерка, что в основной функции (по штампу собственной строки дня)
    const { data: mine } = await sb.from('daily_runs').select('score, updated_at, star')
      .eq('day', day).eq('player_id', pid).maybeSingle();
    if (mine?.updated_at && Date.now() - new Date(mine.updated_at).getTime() < MIN_INTERVAL_MS)
      return json({ error: 'rate' }, 429);
    const track = String(body.track || '');
    const trackOk = track.length >= TRACK_MIN && track.length <= TRACK_MAX && track.length % 3 === 0
      && /^[!-~]+$/.test(track); // только печатный диапазон упаковки
    const skin = Math.floor(Number(body.skin));
    const starNow = body.star === true || mine?.star === true; // v1.100.2: знак дня не сгорает — однажды поймал, навсегда поймал
    if (!mine || score > mine.score) {
      await sb.from('daily_runs').upsert({ day, player_id: pid, score,
        skin: (isFinite(skin) && skin >= 0 && skin <= 50) ? skin : 0,
        star: starNow,
        track: trackOk ? track : null, updated_at: new Date().toISOString() });
      return json({ ok: true, best: score, star: starNow });
    }
    if (starNow && !mine.star) { // счёт не рекорд, но звезда взята — знак всё равно твой
      await sb.from('daily_runs').update({ star: true, updated_at: new Date().toISOString() })
        .eq('day', day).eq('player_id', pid);
    }
    return json({ ok: true, best: mine.score, star: starNow }); // слабее своего — столик помнит лучший
  }

  if (body.action === 'daily_stats') { // v1.100.2 «Золотая звезда дня»: «сегодня её взяли N из M» — для тех, кто прыгал
    const day = String(body.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'bad_day' }, 400);
    const { data: mine } = await sb.from('daily_runs').select('score')
      .eq('day', day).eq('player_id', pid).maybeSingle();
    if (!mine) return json({ ok: false, reason: 'fly_first' });
    const { count: flyers } = await sb.from('daily_runs')
      .select('*', { count: 'exact', head: true }).eq('day', day);
    const { count: catchers } = await sb.from('daily_runs')
      .select('*', { count: 'exact', head: true }).eq('day', day).eq('star', true);
    return json({ ok: true, flyers: flyers || 0, catchers: catchers || 0 });
  }

  if (body.action === 'daily_champion') {
    const day = String(body.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'bad_day' }, 400);
    // дверь трибуны: только тому, кто сам сегодня прыгал — призрак не подсказка, а спектакль
    const { data: mine } = await sb.from('daily_runs').select('score')
      .eq('day', day).eq('player_id', pid).maybeSingle();
    if (!mine) return json({ ok: false, reason: 'fly_first' });
    const { data: rows } = await sb.from('daily_runs')
      .select('player_id, score, skin, track, players(first_name, username, share_ghost)')
      .eq('day', day).not('track', 'is', null)
      .order('score', { ascending: false }).limit(5);
    const champ = (rows || []).find((r: any) => r.players?.share_ghost !== false); // скромника не показываем
    if (!champ) return json({ ok: false, reason: 'no_champion' });
    return json({ ok: true, champion: {
      pid: champ.player_id, name: champ.players?.first_name || 'Игрок',
      username: champ.players?.username || null, score: champ.score, skin: champ.skin,
      track: champ.track, me: champ.player_id === pid } });
  }

  return json({ error: 'unknown_action' }, 400);
});
