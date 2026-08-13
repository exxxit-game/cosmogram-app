// Cosmogram sync: честная таблица рекордов + дуэли + призраки рекордных забегов.
// v13 «Дневник борта»: профиль игрока и дневник дней.
//   Счётное (дней в игре, забеги, экономика, рекорды) пишется всегда — это факты того же
//   аккаунта, что уже стоит в таблице рекордов. Наблюдательное (чем играет, от чего гибнет,
//   какое устройство) приходит ТОЛЬКО при включённом тумблере отчётов; если его нет в теле
//   запроса — соответствующие поля в базе стираются, а не остаются от прошлых времён.
//   Дни считаются сервером по таблице player_days, а не по счётчику клиента: смена телефона
//   больше не обнуляет стаж и не надувает его.
// v12 «Паспорт забега»: рекорд поднимается только до того, что реально дал ЭТОТ забег.
//   Раньше в таблицу уходило не событие («я пролетел столько-то»), а чтение localStorage —
//   пять ключей, взятых как есть. Подпись Telegram удостоверяет личность, но не результат.
//   Теперь клиент 1.282.18+ прикладывает паспорт забега (категория, счёт, дистанция, время,
//   сид, режим, версия). Правила: категория, в которой забег шёл, поднимается не выше
//   run.score; дистанция — не выше run.dist; остальные категории считаются переносом истории
//   и растут по старым потолкам, но помечаются неподтверждёнными.
//   Совместимость: клиент без паспорта (в вебе живёт 1.282.12) работает как раньше —
//   строгий режим включается рубильником config.score_strict='1', когда новая сборка разойдётся.
//   Нижний слой защиты живёт в самой базе: триггер public.scores_guard подрезает и абсолютный
//   потолок, и прирост за одну отправку — он сработает, даже если эта функция ошибётся.
// v11 «Звезда-статус»: status_emoji — custom_emoji_id фирменной искры (набор создаётся один раз).
// v10 «Сторис»: card_url — публичный адрес карточки для shareToStory.
// v9 «Живая карточка»: share_card — PNG игрока → публичное хранилище → savePreparedInlineMessage.
// v8 «Второй вход»: Discord рядом с Telegram. Три способа аутентификации в ОДНУ таблицу —
//   1) initData (мини-апп Telegram): HMAC ключ 'WebAppData' → провайдер 'tg';
//   2) webAuth (Telegram Login Widget): secret = SHA256(bot_token) → провайдер 'tg';
//   3) dcAuth (Discord OAuth2): сервер меняет code на токен, выдаёт свою HMAC-сессию → провайдер 'dc'.
// Личность → паспорт (identities) → игрок (players.id). У tg-игроков players.id == tg id (совместимость),
// у остальных провайдеров — синтетический id из player_id_seq. Связывание аккаунтов = новая строка паспорта.
// JWT не используется, секреты (bot_token, discord_client_secret, session_secret) живут только в config внутри БД.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CATS = ['gyro', 'touch', 'bullet', 'dist', 'keys'];
const GHOST_CATS = ['gyro', 'touch', 'bullet', 'dist', 'keys']; // v1.280.0 «Хартия»: призраки у всего, кроме Своей трассы — она и так не в зачёте
const CAT_NAME: Record<string, Record<string, string>> = {
  ru: { gyro: 'гироскоп', touch: 'тач', bullet: 'Bullet Time', dist: 'дистанция', keys: 'клавиатура' },
  en: { gyro: 'gyro', touch: 'touch', bullet: 'Bullet Time', dist: 'distance', keys: 'keyboard' },
  es: { gyro: 'giroscopio', touch: 'táctil', bullet: 'Bullet Time', dist: 'distancia', keys: 'teclado' },
  pt: { gyro: 'giroscópio', touch: 'toque', bullet: 'Bullet Time', dist: 'distância', keys: 'teclado' },
  fr: { gyro: 'gyroscope', touch: 'tactile', bullet: 'Bullet Time', dist: 'distance', keys: 'clavier' },
};
const LOCALE: Record<string, string> = { ru: 'ru-RU', en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' };
const DIST_UNIT: Record<string, string> = { ru: ' м', en: ' m', es: ' m', pt: ' m', fr: ' m' };
function langOf(v: any): string { return ['ru','en','es','pt','fr'].includes(v) ? v : 'ru'; } // v1.108.1: честный дефолт
function fmt(n: number, lang: string): string { return n.toLocaleString(LOCALE[lang] || 'ru-RU'); }
// v1.108.1 «Родная речь»: раньше уведомления бота были жёстко на русском независимо от языка
// получателя — прямое следствие того, что интерфейс уже на 4 языках, а сервер об этом не знал.
const NOTIFY_TXT: Record<string, (lang: string, p: any) => { text: string; btn: string }> = {
  crown: (lang, p) => {
    const u = DIST_UNIT[lang] || ' ';
    const cat = CAT_NAME[lang][p.cat];
    const nb = fmt(p.newBest, lang), ob = fmt(p.oldBest, lang);
    if (lang === 'en') return { text: `👑 Your #1 record was beaten (${cat})! ${p.name} — ${nb}${u} vs your ${ob}${u}. Reclaim the crown?`, btn: '👑 Reclaim crown' };
    if (lang === 'es') return { text: `👑 ¡Tu récord #1 fue superado (${cat})! ${p.name} — ${nb}${u} frente a tus ${ob}${u}. ¿Recuperar la corona?`, btn: '👑 Recuperar corona' };
    if (lang === 'pt') return { text: `👑 Seu recorde #1 foi superado (${cat})! ${p.name} — ${nb}${u} contra seus ${ob}${u}. Recuperar a coroa?`, btn: '👑 Recuperar coroa' };
    if (lang === 'fr') return { text: `👑 Ton record #1 a été battu (${cat}) ! ${p.name} — ${nb}${u} contre tes ${ob}${u}. Reprendre la couronne ?`, btn: '👑 Reprendre la couronne' };
    return { text: `👑 Твой рекорд #1 побит (${cat})! ${p.name} — ${nb}${u} против твоих ${ob}${u}. Вернуть корону?`, btn: '👑 Вернуть корону' };
  },
  duel: (lang, p) => {
    const u = DIST_UNIT[lang] || ' ';
    const a = fmt(p.newDist, lang), b = fmt(p.oldBest, lang);
    if (lang === 'en') return { text: `🏆 Your challenge was beaten! ${p.name} flew ${a}${u} vs your ${b}${u}. Rematch?`, btn: '⚔️ Rematch' };
    if (lang === 'es') return { text: `🏆 ¡Tu desafío fue superado! ${p.name} voló ${a}${u} frente a tus ${b}${u}. ¿Revancha?`, btn: '⚔️ Revancha' };
    if (lang === 'pt') return { text: `🏆 Seu desafio foi superado! ${p.name} voou ${a}${u} contra seus ${b}${u}. Revanche?`, btn: '⚔️ Revanche' };
    if (lang === 'fr') return { text: `🏆 Ton défi a été battu ! ${p.name} a volé ${a}${u} contre tes ${b}${u}. Revanche ?`, btn: '⚔️ Revanche' };
    return { text: `🏆 Твой вызов побит! ${p.name} пролетел ${a}${u} против твоих ${b}${u}. Реванш?`, btn: '⚔️ Реванш' };
  },
  ghost: (lang, p) => {
    const cat = CAT_NAME[lang][p.cat];
    const a = fmt(p.newBest, lang), b = fmt(p.oldBest, lang);
    if (lang === 'en') return { text: `👻 Your ghost was defeated (${cat})! ${p.name} — ${a} vs your ${b}. Get revenge?`, btn: '👻 Revenge' };
    if (lang === 'es') return { text: `👻 ¡Tu fantasma fue derrotado (${cat})! ${p.name} — ${a} frente a tus ${b}. ¿Vengarte?`, btn: '👻 Vengarme' };
    if (lang === 'pt') return { text: `👻 Seu fantasma foi derrotado (${cat})! ${p.name} — ${a} contra seus ${b}. Vingar-se?`, btn: '👻 Vingar-se' };
    if (lang === 'fr') return { text: `👻 Ton fantôme a été vaincu (${cat}) ! ${p.name} — ${a} contre tes ${b}. Te venger ?`, btn: '👻 Vengeance' };
    return { text: `👻 Твой призрак повержен (${cat})! ${p.name} — ${a} против твоих ${b}. Отомстить?`, btn: '👻 Отомстить' };
  },
  // v1.108.1: сторона «друг А узнаёт о замене вызова» — не про рекорд, а про то, что место занято
  // другим соперником. Существительное «соперник», не глагол, согласованный с полом игрока —
  // тот же приём, что уже применён в duelShareText, обходит гендерную проблему в русском.
  duel_replaced: (lang, p) => {
    if (lang === 'en') return { text: `👋 Your challenge to ${p.name} — someone else has taken your spot now.`, btn: '🚀 New challenge' };
    if (lang === 'es') return { text: `👋 Tu desafío a ${p.name} — ahora hay otro rival en tu lugar.`, btn: '🚀 Nuevo desafío' };
    if (lang === 'pt') return { text: `👋 Seu desafio a ${p.name} — agora há outro rival no seu lugar.`, btn: '🚀 Novo desafio' };
    if (lang === 'fr') return { text: `👋 Ton défi à ${p.name} — quelqu’un d’autre a pris ta place maintenant.`, btn: '🚀 Nouveau défi' };
    return { text: `👋 Твой вызов у ${p.name} — теперь там другой соперник.`, btn: '🚀 Новый вызов' };
  },
};
// Потолки правдоподобия: щедрые для честных, отсекают детский чит «много девяток»
const CAPS: Record<string, number> = { gyro: 10_000_000, touch: 10_000_000, bullet: 10_000_000, dist: 2_000_000, keys: 10_000_000 };
const MIN_INTERVAL_MS = 5000;       // забег не может заканчиваться чаще, чем раз в 5 секунд
const AUTH_MAX_AGE_SEC = 7 * 86400; // подпись не старше недели (и initData, и webAuth, и сессии)
const TRACK_MIN = 60, TRACK_MAX = 4200; // упакованный трек: 3 символа на сэмпл, ~3.5 мин полёта
const BOT_APP_URL = 'https://t.me/realcosmogrambot/app';

/* ---------- v13 «Дневник борта» ----------
   Те же правила, что у паспорта забега: читаем недоверчиво, любое несоответствие —
   «этого поля нет», а не отказ игроку. Потолки грубые: их дело — не пускать в базу чушь,
   а не спорить с длинным вечером. Ниже них стоит триггер player_days_guard, который
   сработает даже в обход этой функции. */
const DAYS_MAX = 90;               // за одну отправку — не больше дневника за три месяца
const DAY_MIN = '2026-01-01';
function clampInt(v: any, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  if (!isFinite(n)) return lo;
  return n < lo ? lo : (n > hi ? hi : n);
}
/* Наблюдательный словарик: {ключ: сколько раз}. Ключи короткие и из известного алфавита,
   значения — целые. Чужие ключи не пускаем: это поле приходит от клиента, а jsonb хранит
   что угодно, включая мусор на мегабайт. */
function tallyOf(raw: any, limit = 12): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  let n = 0;
  for (const k of Object.keys(raw)) {
    if (n >= limit) break;
    if (!/^[a-z0-9_?-]{1,16}$/i.test(k)) continue;
    const v = clampInt(raw[k], 0, 100000);
    if (v > 0) { out[k] = v; n++; }
  }
  return n ? out : null;
}
type DayRow = { d: string; runs: number; best: number; dist: number; sec: number; stars: number;
                modes: Record<string, number> | null; ctl: Record<string, number> | null; deaths: Record<string, number> | null };
function readDays(raw: any): DayRow[] {
  if (!Array.isArray(raw)) return [];
  const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // завтра по UTC: часовые пояса впереди Гринвича — не повод отказать
  const out: DayRow[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (out.length >= DAYS_MAX) break;
    if (!r || typeof r !== 'object') continue;
    const d = String(r.d || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d < DAY_MIN || d > today) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push({ d,
      runs: clampInt(r.runs, 0, 2000),
      best: clampInt(r.best, 0, CAPS.touch),
      dist: clampInt(r.dist, 0, 20_000_000),
      sec: clampInt(r.sec, 0, 86400),
      stars: clampInt(r.stars, 0, 200_000),
      modes: tallyOf(r.modes), ctl: tallyOf(r.ctl), deaths: tallyOf(r.deaths) });
  }
  return out;
}
type Profile = { first: string | null; streak: number; runs: number; stars: number; spent: number;
                 wallet: number; skins: number; dist: number; wave: number; v: string; obs: any };
function readProfile(raw: any): Profile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const first = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.first || '')) ? String(raw.first) : null;
  let obs: any = null;
  if (raw.obs && typeof raw.obs === 'object' && !Array.isArray(raw.obs)) {
    obs = {
      tier: String(raw.obs.tier ?? '?').slice(0, 8),
      w: clampInt(raw.obs.w, 0, 100000), h: clampInt(raw.obs.h, 0, 100000),
      dpr: Math.min(Math.max(Number(raw.obs.dpr) || 1, 0.1), 8),
      g: clampInt(raw.obs.g, 0, 1_000_000), t: clampInt(raw.obs.t, 0, 1_000_000),
      k: clampInt(raw.obs.k, 0, 1_000_000), b: clampInt(raw.obs.b, 0, 1_000_000),
      perfect: clampInt(raw.obs.perfect, 0, 1_000_000),
      gyroOn: raw.obs.gyroOn ? 1 : 0,
    };
  }
  return { first,
    streak: clampInt(raw.streak, 0, 100000),
    runs: clampInt(raw.runs, 0, 10_000_000),
    stars: clampInt(raw.stars, 0, 100_000_000),
    spent: clampInt(raw.spent, 0, 100_000_000),
    wallet: clampInt(raw.wallet, 0, 100_000_000),
    skins: clampInt(raw.skins, 0, 200),
    dist: clampInt(raw.dist, 0, 1_000_000_000),
    wave: clampInt(raw.wave, 0, 100000),
    v: String(raw.v || '').slice(0, 24),
    obs };
}

/* ---------- v12 «Паспорт забега» ----------
   Категории, в которых забег МОЖЕТ идти. 'dist' сюда не входит: дистанция набирается в любом
   забеге и сверяется отдельным полем паспорта.
   Потолки скорости набора выведены из самого кода игры, а не подобраны на глаз:
   максимальная скорость мира 8.0 меры/шаг, Таран ×1.3, дистанция растёт как speed*dt*8 —
   то есть физический предел около 83 м/с. Берём 120 с запасом: задача этих потолков —
   ловить «девять миллионов за две секунды», а не спорить с отличным полётом. */
const RUN_CATS = ['gyro', 'touch', 'bullet', 'keys'];
const RUN_MAX_SEC = 6 * 3600;   // забег длиной больше шести часов — не забег
const RATE_SCORE = 2000;        // очков в секунду: при мировом максимуме ~70/с это 28-кратный запас
const RATE_DIST = 120;          // метров в секунду: физический предел игры ~83

type RunPass = { cat: string; score: number; dist: number; sec: number; seed: number | null; mode: string; restored: boolean; v: string };

/* Паспорт читается недоверчиво: любое несоответствие превращает его в «паспорта нет», а не в
   отказ игроку. Ошибка в клиенте не должна запирать человека снаружи собственной таблицы. */
function readRun(raw: any): RunPass | null {
  if (!raw || typeof raw !== 'object') return null;
  const cat = String(raw.cat || '');
  if (!RUN_CATS.includes(cat)) return null;
  const score = Math.floor(Number(raw.score));
  const dist = Math.floor(Number(raw.dist));
  const sec = Math.floor(Number(raw.sec));
  if (!isFinite(score) || score < 0 || score > CAPS[cat]) return null;
  if (!isFinite(dist) || dist < 0 || dist > CAPS.dist) return null;
  if (!isFinite(sec) || sec < 1 || sec > RUN_MAX_SEC) return null;
  if (score > sec * RATE_SCORE) return null;   // очков больше, чем можно набрать за это время
  if (dist > sec * RATE_DIST) return null;     // метров больше, чем можно пролететь за это время
  const seedRaw = Number(raw.seed);
  return {
    cat, score, dist, sec,
    seed: isFinite(seedRaw) ? Math.floor(seedRaw) : null,
    mode: String(raw.mode || '').slice(0, 24),
    restored: !!raw.restored,
    v: String(raw.v || '').slice(0, 24),
  };
}

// v11 «Звезда-статус»: фирменная искра 512×512 (PNG, base64) — custom-emoji для статуса игрока.
const STATUS_OWNER_ID = 7152386017; // владелец набора (user_id при createNewStickerSet)
const STATUS_SET_NAME = 'cosmogram_star_by_realcosmogrambot';
const STATUS_STAR_PNG_B64 = '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';

function statusStarBytes(): Uint8Array {
  const bin = atob(STATUS_STAR_PNG_B64);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function botCall(token: string, method: string, payload: unknown): Promise<any> {
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return r.json();
}

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

// Telegram Login Widget (браузер): секрет = SHA256(bot_token), hash = HMAC_SHA256(secret, data-check-string)
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

/* ---------- Наша сессия (для OAuth-провайдеров): b64(payload).hmac ----------
   payload = provider|providerId|playerId|name|exp — подписана session_secret из config.
   Серверу не нужно дёргать Discord на каждый запрос: подпись проверяется локально. */
function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
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
  // v12: раньше здесь был [...sig] прямо по ArrayBuffer — а ArrayBuffer не итерируется, и вся
  // ветка входа через Discord падала бы на первой же сессии. В бою не всплыло только потому,
  // что ни одной личности 'dc' в базе так и не завелось. Оборачиваем в Uint8Array, как в
  // соседних validateInitData/validateWebAuth.
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function makeSession(provider: string, providerId: string, playerId: number, name: string, secret: string): Promise<string> {
  const clean = name.replace(/[|\r\n]/g, ' ').slice(0, 64);
  const payload = [provider, providerId, String(playerId), clean, String(Math.floor(Date.now() / 1000) + AUTH_MAX_AGE_SEC)].join('|');
  return b64encode(payload) + '.' + await hmacHex(secret, payload);
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

/* Личность → игрок. Паспорт есть → его player_id; нет → создаём игрока и паспорт.
   Telegram: players.id = tg id (совместимость с уже живущими строками). */
async function resolvePlayer(sb: any, idn: Identity): Promise<number> {
  const { data: ex } = await sb.from('identities').select('player_id')
    .eq('provider', idn.provider).eq('provider_id', idn.providerId).maybeSingle();
  if (ex) return ex.player_id as number;
  let pid: number;
  if (idn.provider === 'tg') pid = Number(idn.providerId);
  else { const { data: nid } = await sb.rpc('next_player_id'); pid = Number(nid); }
  // v1.108.1 «Честная гонка»: claim атомарно через ON CONFLICT DO NOTHING на identities —
  // раньше два почти одновременных запроса от одной ещё не встреченной личности (особенно
  // Discord, где pid из последовательности, не детерминирован) могли создать двух разных
  // игроков. Теперь только один запрос реально вставляет identities-строку; проигравший
  // тихо промолчит (ignoreDuplicates), оба перечитывают identities и сходятся на одном pid.
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
// Уведомления ходят только через Telegram-бота: ищем tg-паспорт игрока
async function tgChatOf(sb: any, pid: number): Promise<{ chat: number; lang: string } | null> {
  const { data } = await sb.from('identities').select('provider_id')
    .eq('player_id', pid).eq('provider', 'tg').maybeSingle();
  if (!data) return null;
  const { data: pl } = await sb.from('players').select('lang').eq('id', pid).maybeSingle();
  return { chat: Number(data.provider_id), lang: langOf(pl?.lang) };
}

async function notifyBot(botToken: string, chatId: number, text: string, btn: string, retriesLeft = 1): Promise<string> {
  // тихая отправка: Telegram откажет, если игрок не запускал бота — это норма, не ошибка
  // v1.108.1 «Честный повтор»: у Bot API общий предел ~30 сообщений/сек на весь бот. Один Edge
  // Function-запрос сам по себе шлёт максимум 1-3 письма (корона/дуэль/призрак), но при росте
  // аудитории МНОГО параллельных запросов от разных игроков вместе могут упереться в лимит.
  // Полная очередь с воркером — избыточна для сегодняшнего трафика (тот же принцип, что и решение
  // не включать pg_cron раньше времени). Соразмерный шаг: Telegram сам подсказывает в 429, сколько
  // секунд ждать (retry_after) — одна честная попытка повтора превращает «письмо потеряно молча»
  // в «письмо доставлено на пару секунд позже». Потолок 5с — не заставляем игрока ждать своего
  // ответа on submit слишком долго, если Telegram просит ждать неразумно много.
  try {
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text,
        reply_markup: { inline_keyboard: [[{ text: btn, url: BOT_APP_URL }]] } }),
    });
    if (r.ok) return 'sent';
    if (r.status === 429 && retriesLeft > 0) {
      const errBody: any = await r.json().catch(() => null);
      const retryAfter = errBody?.parameters?.retry_after;
      if (typeof retryAfter === 'number' && retryAfter > 0 && retryAfter <= 5) {
        await new Promise((res) => setTimeout(res, retryAfter * 1000));
        return notifyBot(botToken, chatId, text, btn, retriesLeft - 1);
      }
    }
    return 'tg_' + r.status;
  } catch { return 'net'; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfgRows } = await sb.from('config').select('key, value')
    .in('key', ['bot_token', 'session_secret', 'discord_client_id', 'discord_client_secret', 'score_strict']);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows || []) cfg[r.key] = r.value;
  if (!cfg.bot_token) return json({ error: 'not_configured' }, 503); // токен бота ещё не внесён

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  // Публичная конфигурация для клиента: client_id Discord публичен по своей природе (он в URL авторизации)
  if (body.action === 'public_config')
    return json({ ok: true, discord_client_id: cfg.discord_client_id || null });

  // Вход через Discord: обмен кода на токен (секрет только здесь), личность → наша HMAC-сессия
  if (body.action === 'discord_login') {
    if (!cfg.discord_client_id || !cfg.discord_client_secret || !cfg.session_secret)
      return json({ error: 'not_configured' }, 503); // приложение Discord ещё не внесено в config
    const code = String(body.code || '');
    const redirectUri = String(body.redirect_uri || '');
    if (!code || !redirectUri) return json({ error: 'bad_request' }, 400);
    let tok: any;
    try {
      const tr = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: cfg.discord_client_id, client_secret: cfg.discord_client_secret,
          grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      });
      if (!tr.ok) return json({ error: 'discord_exchange' }, 401);
      tok = await tr.json();
    } catch { return json({ error: 'discord_net' }, 502); }
    let me: any;
    try {
      const mr = await fetch('https://discord.com/api/users/@me', { headers: { authorization: 'Bearer ' + tok.access_token } });
      if (!mr.ok) return json({ error: 'discord_me' }, 401);
      me = await mr.json();
    } catch { return json({ error: 'discord_net' }, 502); }
    const dcId = String(me.id || '');
    if (!/^\d{5,25}$/.test(dcId)) return json({ error: 'discord_me' }, 401);
    const name = String(me.global_name || me.username || 'Игрок').slice(0, 64);
    const pid = await resolvePlayer(sb, { provider: 'dc', providerId: dcId, name, uname: me.username ? String(me.username).slice(0, 64) : null });
    const sess = await makeSession('dc', dcId, pid, name, cfg.session_secret);
    return json({ ok: true, dcAuth: { sess, name, pid } });
  }

  // Три входа в одну таблицу: initData (мини-апп) → webAuth (виджет) → dcAuth (сессия Discord)
  let idn: Identity | null = await validateInitData(String(body?.initData || ''), cfg.bot_token);
  if (!idn && body?.webAuth) idn = await validateWebAuth(body.webAuth, cfg.bot_token);
  if (!idn && body?.dcAuth && cfg.session_secret) {
    const d = await validateSession(String(body.dcAuth.sess || ''), cfg.session_secret);
    if (d) idn = { provider: d.provider, providerId: d.providerId, name: d.name, uname: null };
  }
  /* ============================================================
     13.08.2026 «Таблица — витрина, а не клуб».
     Симптом: гость жал «ТОП» и получал пустоту с надписью «войди через Telegram».
     Выглядело как отказ по его вине — при том, что в таблице пятнадцать живых игроков.
     Корень: одна дверь на все действия. Ниже стоит `if (!idn) ... 401`, и за ней
     оказалось ЧТЕНИЕ таблицы, которое никакой подписи не требует по смыслу.
     Лекарство: чтение выпускаем перед дверью. Записывать по-прежнему нельзя никому
     без подписи Telegram или Discord — закон «анонимных записей нет» не тронут.
     Ни одного нового поля наружу не уходит: имя и счёт видел любой вошедший и раньше.
     Своего места гость не получает — его попросту нет, пока он не представился;
     клиент считает «ты был бы N-м» сам, по уже полученному списку, без второго запроса.
     ============================================================ */
  if (body.action === 'top' && !idn) {
    const cat = CATS.includes(body.category) ? body.category : 'touch';
    const { data: rows } = await sb
      .from('scores')
      .select('player_id, best, verified, players(first_name, username, provider)')
      .eq('category', cat)
      .order('best', { ascending: false })
      .limit(100);
    const top = (rows || []).map((r: any) => ({
      pid: r.player_id,
      name: r.players?.first_name || 'Игрок',
      username: r.players?.username || null,
      provider: r.players?.provider || 'tg',
      best: r.best,
      verified: r.verified === true,
      me: false,                       // гость не в списке: он ещё не представился
    }));
    return json({ ok: true, category: cat, top, me: null, guest: true });
  }

  if (!idn) return json({ error: 'auth' }, 401);
  const pid = await resolvePlayer(sb, idn);
  const name = idn.name;
  const uname = idn.uname;

  if (body.action === 'share_card') {
    // v9 «Живая карточка»: PNG игрока → публичное хранилище → savePreparedInlineMessage → id для tg.shareMessage.
    // Карточка уходит в чат настоящей картинкой с кнопкой «Играть» — скриншот больше не нужен.
    // Только Telegram-личность: prepared message готовится строго под user_id отправителя.
    if (idn.provider !== 'tg') return json({ error: 'tg_only' }, 403);
    const dataUrl = String(body.png || '');
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) return json({ error: 'bad_png' }, 400);
    if (m[1].length > 4_000_000) return json({ error: 'too_big' }, 413); // ~3 МБ картинки — потолок
    let bytes: Uint8Array;
    try {
      const bin = atob(m[1]);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch { return json({ error: 'bad_png' }, 400); }
    if (bytes.length < 1000 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47)
      return json({ error: 'bad_png' }, 400); // подпись PNG: \x89PNG
    // у игрока живёт одна карточка: старую затираем, хранилище не пухнет
    const path = pid + '/card.png';
    const up = await sb.storage.from('cards').upload(path, bytes,
      { contentType: 'image/png', upsert: true, cacheControl: '60' });
    if (up.error) return json({ error: 'storage' }, 502);
    const photoUrl = Deno.env.get('SUPABASE_URL') + '/storage/v1/object/public/cards/' + path + '?t=' + Date.now();
    const caption = String(body.caption || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
    try {
      const r = await fetch('https://api.telegram.org/bot' + cfg.bot_token + '/savePreparedInlineMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: pid,
          result: { type: 'photo', id: 'card', photo_url: photoUrl, thumbnail_url: photoUrl,
            caption, reply_markup: { inline_keyboard: [[{ text: '🚀 Играть', web_app: { url: BOT_APP_URL } }]] } },
          allow_user_chats: true, allow_bot_chats: true, allow_group_chats: true, allow_channel_chats: true,
        }),
      });
      const ans = await r.json();
      if (!r.ok || !ans.ok || !ans.result?.id)
        return json({ error: 'tg_prepare', detail: ans.description || ('tg_' + r.status) }, 502);
      return json({ ok: true, id: ans.result.id });
    } catch { return json({ error: 'tg_net' }, 502); }
  }

  if (body.action === 'card_url') {
    // v10 «Сторис»: тот же PNG → тот же путь в хранилище, но без prepared message —
    // клиенту нужен лишь публичный адрес картинки для tg.shareToStory(media_url).
    const dataUrl2 = String(body.png || '');
    const m2 = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl2);
    if (!m2) return json({ error: 'bad_png' }, 400);
    if (m2[1].length > 4_000_000) return json({ error: 'too_big' }, 413);
    let bytes2: Uint8Array;
    try {
      const bin2 = atob(m2[1]);
      bytes2 = new Uint8Array(bin2.length);
      for (let i = 0; i < bin2.length; i++) bytes2[i] = bin2.charCodeAt(i);
    } catch { return json({ error: 'bad_png' }, 400); }
    if (bytes2.length < 1000 || bytes2[0] !== 0x89 || bytes2[1] !== 0x50 || bytes2[2] !== 0x4e || bytes2[3] !== 0x47)
      return json({ error: 'bad_png' }, 400);
    const path2 = pid + '/card.png';
    const up2 = await sb.storage.from('cards').upload(path2, bytes2,
      { contentType: 'image/png', upsert: true, cacheControl: '60' });
    if (up2.error) return json({ error: 'storage' }, 502);
    const url2 = Deno.env.get('SUPABASE_URL') + '/storage/v1/object/public/cards/' + path2 + '?t=' + Date.now();
    return json({ ok: true, url: url2 });
  }

  if (body.action === 'status_emoji') {
    // v11 «Звезда-статус»: отдать custom_emoji_id фирменной искры.
    // Набор создаётся один раз (идемпотентно): getStickerSet → createNewStickerSet (multipart, attach) → кэш в config.
    // Только Telegram-личность: статус ставится игроку мини-аппа.
    if (idn.provider !== 'tg') return json({ error: 'tg_only' }, 403);
    try {
      const { data: cached } = await sb.from('config').select('value').eq('key', 'status_emoji_id').maybeSingle();
      if (cached?.value) return json({ ok: true, emoji_id: cached.value });
      const gs = await botCall(cfg.bot_token, 'getStickerSet', { name: STATUS_SET_NAME });
      let emojiId: string | null = null;
      if (gs.ok && gs.result?.stickers?.length) {
        emojiId = gs.result.stickers[0].custom_emoji_id || null;
      } else {
        const fd = new FormData();
        fd.append('user_id', String(STATUS_OWNER_ID));
        fd.append('name', STATUS_SET_NAME);
        fd.append('title', 'Звезда Cosmogram');
        fd.append('stickers', JSON.stringify([{ sticker: 'attach://star', format: 'static', emoji_list: ['✨'] }]));
        fd.append('sticker_type', 'custom_emoji');
        fd.append('star', new Blob([statusStarBytes()], { type: 'image/png' }), 'star.png');
        const cr = await fetch('https://api.telegram.org/bot' + cfg.bot_token + '/createNewStickerSet', { method: 'POST', body: fd });
        const ca = await cr.json();
        if (!ca.ok) return json({ error: 'tg_stickerset', detail: ca.description || ('tg_' + cr.status) }, 502);
        const gs2 = await botCall(cfg.bot_token, 'getStickerSet', { name: STATUS_SET_NAME });
        if (gs2.ok && gs2.result?.stickers?.length) emojiId = gs2.result.stickers[0].custom_emoji_id || null;
      }
      if (!emojiId) return json({ error: 'no_emoji' }, 502);
      await sb.from('config').upsert({ key: 'status_emoji_id', value: emojiId });
      return json({ ok: true, emoji_id: emojiId });
    } catch (e) { return json({ error: 'tg_net' }, 502); }
  }

  if (body.action === 'submit') {
    // антиспам: не чаще раза в 5 секунд
    const { data: me } = await sb.from('players').select('last_submit').eq('id', pid).maybeSingle();
    if (me?.last_submit && Date.now() - new Date(me.last_submit).getTime() < MIN_INTERVAL_MS)
      return json({ error: 'rate' }, 429);

    /* v12 «Паспорт забега»: что именно только что произошло. Если паспорта нет (старый клиент)
       или он не сходится сам с собой — работаем по-прежнему, но помечаем результат
       неподтверждённым. Строгий режим (config.score_strict='1') превращает отсутствие паспорта
       в «рекорды не растут»: включать, когда новая сборка разойдётся по игрокам. */
    const run = readRun(body.run);
    const strict = cfg.score_strict === '1';

    await sb.from('players').upsert({ id: pid, first_name: name, username: uname, last_seen: new Date().toISOString(), last_submit: new Date().toISOString(), lang: langOf(body.lang), last_run: run });

    const src = body.scores && typeof body.scores === 'object' ? body.scores : {};
    const accepted: Record<string, number> = {};
    const verifiedMap: Record<string, boolean> = {};
    const clipped: string[] = [];
    const crowns: Array<{ cat: string, oldPid: number, oldBest: number, newBest: number }> = [];
    for (const cat of CATS) {
      let v = Math.floor(Number(src[cat]));
      if (!isFinite(v) || v <= 0) continue;
      if (v > CAPS[cat]) v = CAPS[cat]; // правдоподобие: выше потолка — обрезаем
      const { data: cur } = await sb.from('scores').select('best').eq('player_id', pid).eq('category', cat).maybeSingle();
      const prev = cur ? Number(cur.best) : 0;
      if (v <= prev) continue;

      /* Сколько позволено поднять ИМЕННО ЭТОЙ отправкой.
         — категория, в которой шёл забег: не выше того, что забег дал;
         — дистанция: не выше пройденной в этом забеге;
         — прочие категории: это перенос истории (новое устройство, игра без сети), паспорт их
           не объясняет — растут по-старому, но без отметки подтверждения. */
      let allow = v, isVerified = false;
      if (run && cat === 'dist') {
        allow = Math.min(v, Math.max(prev, run.dist));
        isVerified = allow <= run.dist;
      } else if (run && cat === run.cat) {
        allow = Math.min(v, Math.max(prev, run.score));
        isVerified = allow <= run.score;
      } else if (strict) {
        continue; // строгий режим: без объяснения забегом рекорд не двигается
      }
      if (allow < v) clipped.push(cat);
      v = allow;
      if (v <= prev) continue;

      // корона: кто сейчас #1 категории (ДО этой записи)? свержение — только с чужого трона
      const { data: king } = await sb.from('scores').select('player_id, best').eq('category', cat)
        .order('best', { ascending: false }).limit(1).maybeSingle();
      await sb.from('scores').upsert({ player_id: pid, category: cat, best: v, verified: isVerified, updated_at: new Date().toISOString() });
      /* Триггер public.scores_guard мог подрезать значение ещё раз (потолок прироста за отправку).
         Читаем, что реально легло, — иначе уведомления и ответ клиенту врали бы о чужой цифре. */
      const { data: after } = await sb.from('scores').select('best').eq('player_id', pid).eq('category', cat).maybeSingle();
      const landed = after ? Number(after.best) : v;
      if (landed < v && !clipped.includes(cat)) clipped.push(cat);
      accepted[cat] = landed;
      verifiedMap[cat] = isVerified;
      if (king && king.player_id !== pid && landed > king.best)
        crowns.push({ cat, oldPid: king.player_id, oldBest: king.best, newBest: landed });
    }

    // корона сменилась — бывшему #1 уведомление «твой рекорд побит» (только если у него есть tg-паспорт)
    let crown_notify = 'skip';
    if (crowns.length) {
      const results: string[] = [];
      for (const c of crowns) {
        const dest = await tgChatOf(sb, c.oldPid);
        if (!dest) { results.push(c.cat + ':no_tg'); continue; }
        const { text, btn } = NOTIFY_TXT.crown(dest.lang, { cat: c.cat, name, newBest: c.newBest, oldBest: c.oldBest });
        results.push(c.cat + ':' + await notifyBot(cfg.bot_token, dest.chat, text, btn));
      }
      crown_notify = results.join(',');
    }

    // Д3: «твой вызов побили!» — уведомление вызвавшему, когда ЭТОТ забег поднял рекорд
    // дистанции выше его планки. Подделать duel_win бессмысленно: без свежего accepted.dist — молчим.
    let duel_notify = 'skip';
    const dw = Math.floor(Number(body.duel_win));
    if (isFinite(dw) && dw > 0 && dw !== pid && accepted.dist) {
      const { data: ch } = await sb.from('scores').select('best').eq('player_id', dw).eq('category', 'dist').maybeSingle();
      const dest = await tgChatOf(sb, dw);
      if (ch && dest && accepted.dist > ch.best) {
        const { text, btn } = NOTIFY_TXT.duel(dest.lang, { name, newDist: accepted.dist, oldBest: ch.best });
        duel_notify = await notifyBot(cfg.bot_token, dest.chat, text, btn);
      }
    }

    // Призрачная месть: клиент летел с чужим призраком (ghost_beat) и этим забегом побил его рекорд.
    // Подделка молчит: нужен свежий accepted[cat] выше текущего рекорда владельца призрака.
    let ghost_notify = 'skip';
    const gb = Math.floor(Number(body.ghost_beat));
    const gcat = String(body.ghost_cat || '');
    if (isFinite(gb) && gb > 0 && gb !== pid && GHOST_CATS.includes(gcat) && accepted[gcat]) {
      const { data: bt } = await sb.from('scores').select('best').eq('player_id', gb).eq('category', gcat).maybeSingle();
      const dest = await tgChatOf(sb, gb);
      if (bt && dest && accepted[gcat] > bt.best) {
        const { text, btn } = NOTIFY_TXT.ghost(dest.lang, { cat: gcat, name, newBest: accepted[gcat], oldBest: bt.best });
        ghost_notify = await notifyBot(cfg.bot_token, dest.chat, text, btn);
      }
    }

    /* ---------- v13 «Дневник борта» ----------
       Пишем ПОСЛЕ рекордов: если что-то в дневнике пойдёт не так, таблица рекордов уже
       обновлена, и игрок не теряет свой результат из-за статистики. */
    const days = readDays(body.days);
    const days_ack: string[] = [];
    for (const d of days) {
      const { error } = await sb.from('player_days').upsert({
        player_id: pid, day: d.d, runs: d.runs, best_score: d.best, dist: d.dist,
        sec: d.sec, stars: d.stars, modes: d.modes, ctl: d.ctl, deaths: d.deaths,
      }, { onConflict: 'player_id,day' });
      /* Подтверждаем только реально записанные дни. Клиент вычёркивает день из своего
         дневника исключительно по этому списку — молчаливая потеря невозможна. */
      if (!error) days_ack.push(d.d);
    }

    const prof = readProfile(body.profile);
    if (prof) {
      /* Стаж считаем САМИ по дневнику, а не по счётчику клиента: смена телефона обнуляла
         бы его локально, а подделать его было бы нечем не сложнее, чем рекорд. */
      const { count: dayCount } = await sb.from('player_days')
        .select('*', { count: 'exact', head: true }).eq('player_id', pid);
      const { data: firstRow } = await sb.from('player_days')
        .select('day').eq('player_id', pid).order('day', { ascending: true }).limit(1).maybeSingle();
      const { data: was } = await sb.from('players').select('first_seen').eq('id', pid).maybeSingle();
      const cands = [was?.first_seen, firstRow?.day, prof.first].filter(Boolean).map(String).sort();
      await sb.from('players').upsert({
        id: pid,
        first_seen: cands.length ? cands[0] : null,   // самая ранняя известная дата, назад не откатывается
        days_played: dayCount || 0,
        streak: prof.streak,
        runs_total: prof.runs,
        stars_total: prof.stars,
        stars_spent: prof.spent,
        wallet: prof.wallet,
        skins_owned: prof.skins,
        dist_total: prof.dist,
        best_wave: prof.wave,
        app_version: prof.v,
        /* Тумблер выключен — наблюдательной части в запросе нет, и мы её СТИРАЕМ, а не
           оставляем от прошлых времён. Отказ должен действовать назад, иначе он не отказ. */
        obs: prof.obs,
      });
    }

    return json({ ok: true, accepted, verified: verifiedMap, clipped, run_seen: !!run, strict,
      days_ack, duel_notify, crown_notify, ghost_notify, pid });
  }

  if (body.action === 'top') {
    const cat = CATS.includes(body.category) ? body.category : 'touch';
    const { data: rows } = await sb
      .from('scores')
      .select('player_id, best, verified, players(first_name, username, provider)')
      .eq('category', cat)
      .order('best', { ascending: false })
      .limit(100);
    const top = (rows || []).map((r: any) => ({
      pid: r.player_id, // нужен для кнопки «👻 лететь с призраком»
      name: r.players?.first_name || 'Игрок',
      username: r.players?.username || null,
      provider: r.players?.provider || 'tg', // метка входа: честно видно, кто откуда пришёл
      best: r.best,
      verified: r.verified === true, // v12: рекорд объяснён паспортом забега, а не чтением хранилища
      me: r.player_id === pid,
    }));
    // моё место: сколько игроков строго выше моего лучшего
    const { data: mine } = await sb.from('scores').select('best').eq('player_id', pid).eq('category', cat).maybeSingle();
    let rank = null;
    if (mine) {
      const { count } = await sb.from('scores').select('*', { count: 'exact', head: true }).eq('category', cat).gt('best', mine.best);
      rank = (count || 0) + 1;
    }
    return json({ ok: true, category: cat, top, me: mine ? { rank, best: mine.best } : null });
  }

  if (body.action === 'duel') {
    // Дуэль: планка вызова — верифицированный рекорд дистанции вызвавшего.
    // Цифра живёт только на сервере: подделать ссылку бессмысленно. Только чтение.
    const pp = Math.floor(Number(body.player_id));
    if (!isFinite(pp) || pp <= 0) return json({ error: 'bad_player' }, 400);
    if (pp === pid) return json({ error: 'self' }, 400); // сам себе вызов не нужен
    const { data: row } = await sb.from('scores').select('best').eq('player_id', pp).eq('category', 'dist').maybeSingle();
    if (!row) return json({ ok: false, reason: 'no_record' }); // у вызвавшего ещё нет рекорда дистанции
    const { data: p } = await sb.from('players').select('first_name, username').eq('id', pp).maybeSingle();
    return json({ ok: true, player_id: pp, best: row.best, name: p?.first_name || 'Игрок', username: p?.username || null });
  }

  if (body.action === 'duel_accept') {
    // v1.108.1: клиент сообщает — «я только что принял вызов от challenger_pid». Если у меня уже
    // был активный вызов от КОГО-ТО ДРУГОГО — этот другой узнаёт, что его место заняли.
    // Не обязывает: если tg-паспорта у старого вызывающего нет — просто не уходит, не ошибка.
    const newChallenger = Math.floor(Number(body.challenger_pid));
    if (!isFinite(newChallenger) || newChallenger <= 0 || newChallenger === pid) return json({ error: 'bad_request' }, 400);
    const { data: existing } = await sb.from('duels_active').select('challenger_pid').eq('challenged_pid', pid).maybeSingle();
    if (existing && existing.challenger_pid !== newChallenger) {
      const dest = await tgChatOf(sb, existing.challenger_pid);
      if (dest) {
        const { text, btn } = NOTIFY_TXT.duel_replaced(dest.lang, { name });
        await notifyBot(cfg.bot_token, dest.chat, text, btn);
      }
    }
    await sb.from('duels_active').upsert({ challenged_pid: pid, challenger_pid: newChallenger, created_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (body.action === 'ghost_up') {
    // Призрак рекордного забега: трек не может быть сильнее верифицированного рекорда категории
    const cat = String(body.category || '');
    if (!GHOST_CATS.includes(cat)) return json({ error: 'bad_category' }, 400);
    const track = String(body.track || '');
    if (track.length < TRACK_MIN || track.length > TRACK_MAX || track.length % 3 !== 0)
      return json({ error: 'bad_track' }, 400);
    if (!/^[!-~]+$/.test(track)) return json({ error: 'bad_track' }, 400); // только печатный диапазон упаковки
    const best = Math.floor(Number(body.best));
    if (!isFinite(best) || best <= 0 || best > CAPS[cat]) return json({ error: 'bad_best' }, 400);
    const skin = Math.floor(Number(body.skin));
    // v1.280.0 «Честная гонка»: сид забега, из которого записан трек — без него зрителю/сопернику
    // нечего восстанавливать (обычные категории идут не по общему дню, а по своему случайному небу
    // каждого забега). Необязателен: старый клиент/ретро-вызов без сида — просто null, не ошибка.
    const seedRaw = body.seed;
    const seed = (seedRaw !== undefined && seedRaw !== null && isFinite(Number(seedRaw))) ? Math.floor(Number(seedRaw)) : null;
    const { data: cur } = await sb.from('scores').select('best').eq('player_id', pid).eq('category', cat).maybeSingle();
    if (!cur || best > cur.best) return json({ error: 'unverified' }, 403); // трек сильнее рекорда — не бывает
    await sb.from('players').upsert({ id: pid, first_name: name, username: uname, last_seen: new Date().toISOString(),
      share_ghost: body.share === false ? false : true });
    await sb.from('ghosts').upsert({ player_id: pid, category: cat, track, skin: (isFinite(skin) && skin >= 0 && skin <= 50) ? skin : 0,
      best, seed, updated_at: new Date().toISOString() });
    return json({ ok: true });
  }

  if (body.action === 'ghost_get') {
    // Чужой призрак — только если владелец делится (players.share_ghost)
    const pp = Math.floor(Number(body.player_id));
    const cat = String(body.category || '');
    if (!isFinite(pp) || pp <= 0 || !GHOST_CATS.includes(cat)) return json({ error: 'bad_request' }, 400);
    const { data: g } = await sb.from('ghosts')
      .select('track, skin, best, seed, players(first_name, username, share_ghost)')
      .eq('player_id', pp).eq('category', cat).maybeSingle();
    if (!g || g.players?.share_ghost === false) return json({ ok: false, reason: 'no_ghost' });
    return json({ ok: true, track: g.track, skin: g.skin, best: g.best, seed: g.seed,
      name: g.players?.first_name || 'Игрок', username: g.players?.username || null });
  }

  if (body.action === 'ghost_share') {
    // Приватность: выкл — призраки удаляются сразу, чужие их больше не видят
    const share = body.share !== false;
    await sb.from('players').upsert({ id: pid, first_name: name, username: uname, last_seen: new Date().toISOString(), share_ghost: share });
    if (!share) await sb.from('ghosts').delete().eq('player_id', pid);
    return json({ ok: true });
  }

  return json({ error: 'unknown_action' }, 400);
});
