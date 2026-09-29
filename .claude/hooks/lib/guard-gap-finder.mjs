#!/usr/bin/env node
/*
 * guard-gap-finder.mjs — 29.09.2026, владелец: «мы, кажется, первые, кто это делает —
 * развивай сам, сделай супер-инструмент, используй все свои возможности».
 *
 * Закрывает РЕАЛЬНЫЙ разрыв, а не воображаемый: signal-trail.mjs (25.09.2026) уже умеет
 * копить затухающий сигнал и определять, что паттерн повторился (checkEscalation) — но
 * дальше, «написать guard» и «зарегистрировать его в settings.json», всё ещё делалось
 * руками, каждый раз с нуля, без единой проверки, что оба шага реально произошли. Именно
 * этот разрыв сегодня же и дал реальный баг: evidence-anchoring-guard.mjs был написан,
 * протестирован, закоммичен 27.09 — и ни разу не попал в settings.json, то есть не работал
 * ни разу за всё своё существование (найдено только сегодняшним ручным аудитом).
 *
 * Владелец явно выбрал (AskUserQuestion 29.09.2026, три вопроса):
 *   1) Автономность: «находить + предлагать черновик» — НЕ полный автоцикл. Этот скрипт
 *      никогда не пишет в settings.json и не решает сам, что готово. Черновик — предложение,
 *      не факт. Регистрация — отдельный явный шаг с «да» владельца, как и раньше.
 *   2) Порог: оставить текущий эмпирический 3-5 (feedback_vigilance_do_avtomatizacii_23_09),
 *      не выдумывать новую формулу под этот конкретный инструмент.
 *   3) Строить сейчас, параллельно искать более широкие источники (агент research запущен
 *      отдельно, не блокирует эту работу).
 *
 * Два РАЗНЫХ вида разрыва, которые ловит эта команда:
 *
 * A) "Необшитый паттерн" (trail=uncovered) — когда Я САМ (Claude), во время работы или
 *    вечернего разбора, замечаю, что что-то из памяти (feedback_*) нарушилось СНОВА, уже
 *    не первый раз, и для этого класса ещё нет механического guard'а — записываю сигнал
 *    вручную (та же команда, что bugfix-skill уже использует для категорий багов):
 *      node .claude/hooks/lib/signal-trail.mjs record "pattern:<slug>" <severity 1-5> \
 *        "<кратко что случилось>" --trail=uncovered --just-culture=violation
 *    Как только один и тот же slug накопил ≥3 таких записей (нижняя граница «правила
 *    3-5») — `scan` пишет ЧЕРНОВИК hook-файла в .claude/hooks/drafts/, не трогая
 *    settings.json. Черновик — скелет с TODO на месте детектирующей логики, не готовый
 *    к работе код; писать саму проверку внутри него — моя отдельная работа после `scan`.
 *
 * B) "Не подключено" (существующий баг-класс, feedback_novoe_ne_podklyuchennoe_vezde,
 *    сегодня — 8-й реальный случай) — файл guard'а физически существует в .claude/hooks/,
 *    но не упомянут ни в одном hooks-массиве settings.json (та же проверка, что вручную
 *    делал check-orphan-hooks.mjs сегодня, — теперь встроена сюда постоянно, не одноразовым
 *    скриптом в C:/tmp). Обратный случай — battled reference: путь встречается в
 *    settings.json, а файла на диске нет (переименовали/удалили, забыли поправить settings).
 *
 * Использование:
 *   node .claude/hooks/lib/guard-gap-finder.mjs scan
 *
 * Ничего не меняет технически необратимо: settings.json не трогает никогда, единственная
 * запись на диск — новый файл в .claude/hooks/drafts/ (существующий черновик того же имени
 * не перезаписывается молча — пропускается с пометкой, чтобы не затереть уже начатую
 * ручную правку черновика).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEntries, computeHeat } from './signal-trail.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(HOOKS_DIR, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const DRAFTS_DIR = path.join(HOOKS_DIR, 'drafts');
// 29.09.2026 (владелец: «проверяй дальше» — нашлось, что crew держит ОТДЕЛЬНУЮ копию
// части этих же хуков, и она отстала: 3 хука там всё ещё были на "ask" уже ПОСЛЕ того,
// как app-версии починены). «app+crew — одна игра» (уже принцип whole-game-health-check.sh) —
// разделы Б/Г/Д ниже теперь проверяют ОБА репозитория одним прогоном, не только тот, где
// живёт сам скрипт. Если crew не найден рядом (другая машина/раскладка) — секции для него
// молча пропускаются, не падают.
const CREW_DIR = path.join(PROJECT_ROOT, '..', 'cosmogram-crew');
const CREW_HOOKS_DIR = path.join(CREW_DIR, '.claude', 'hooks');
const CREW_SETTINGS_PATH = path.join(CREW_DIR, '.claude', 'settings.json');

const UNCOVERED_TRAIL = 'uncovered';
const UNCOVERED_THRESHOLD = 3; // нижняя граница «правила 3-5», владелец выбрал не менять

// ---------- A) необшитые паттерны ----------

function slugify(category) {
  // "pattern:not-wired-everywhere" -> "not-wired-everywhere"; голая категория без "pattern:" тоже ок
  return String(category).replace(/^pattern:/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function findUncoveredCandidates() {
  const entries = readEntries(UNCOVERED_TRAIL);
  const byCategory = {};
  for (const e of entries) {
    (byCategory[e.category] ||= []).push(e);
  }
  const candidates = [];
  for (const [category, list] of Object.entries(byCategory)) {
    if (list.length >= UNCOVERED_THRESHOLD) {
      const messages = list.map((e) => e.message).filter(Boolean);
      candidates.push({ category, count: list.length, messages, lastTs: Math.max(...list.map((e) => e.ts)) });
    }
  }
  return candidates.sort((a, b) => b.count - a.count);
}

function draftTemplate({ category, count, messages, slug }) {
  const envVar = slug.replace(/-/g, '_').toUpperCase() + '_GUARD_MODE';
  const dateStr = new Date().toISOString().slice(0, 10);
  const messageList = messages.map((m) => ` *   - ${m}`).join('\n');
  return `#!/usr/bin/env node
/*
 * ${slug}-guard.DRAFT.mjs — ЧЕРНОВИК, сгенерирован guard-gap-finder.mjs ${dateStr}.
 *
 * НЕ ЗАРЕГИСТРИРОВАН в settings.json и НЕ ДОЛЖЕН быть, пока владелец явно не подтвердит,
 * что это правильный guard для этого паттерна. Имя файла нарочно с .DRAFT — чтобы не
 * спутать с рабочим hook'ом и не подключить по ошибке.
 *
 * Почему возник: паттерн "${category}" отмечен ${count} раз(а) в signal-trail
 * (trail=${UNCOVERED_TRAIL}, порог ${UNCOVERED_THRESHOLD} — правило 3-5,
 * feedback_vigilance_do_avtomatizacii_23_09). Свежие сообщения-сигналы:
${messageList || ' *   (сообщения не переданы при записи)'}
 *
 * TODO (это не готовый код, это скелет):
 *   1. Перечитать сообщения-сигналы выше — они должны быть КОНКРЕТНЫМИ реальными
 *      случаями (что именно произошло, когда), не пересказом общего ощущения
 *      "тут что-то было не так". Если хоть одно сообщение расплывчато — вернуться
 *      и записать заново точнее, прежде чем писать guard под него.
 *   2. Сформулировать точное условие срабатывания — что именно проверять во входных
 *      данных hook'а (какой инструмент, какие поля tool_input/tool_response). Условие
 *      должно быть УЗКИМ — activate только для тех действий, где паттерн реально
 *      наблюдался, не "для всех Edit/Write на всякий случай" (AgentGuard,
 *      arXiv:2609.16287, 300 реальных прогонов: широкие guard'ы дали 19.3%
 *      over-refusal — почти каждая пятая задача зря заблокирована/пропущена, и в
 *      2% случаев сам guard внёс НОВУЮ аномалию, которой не было без него).
 *   3. Решить: PreToolUse (блокирует/предупреждает ДО действия) или PostToolUse/Stop
 *      (проверяет ПОСЛЕ)? Смотри на соседние guard'ы в .claude/hooks/ как на образец.
 *   4. Написать детектирующую логику вместо заглушки ниже.
 *   5. Страж (тест) — сначала показать красным на синтетическом кейсе, потом зелёным.
 *   6. Только после явного "да" владельца — добавить строку в settings.json (руками,
 *      не этим скриптом) и убрать суффикс .DRAFT из имени файла.
 *
 * Осторожность (Phantom Guardrails, arXiv:2607.13083): LLM, которой поручают
 * предлагать guard, в 25% случаев выдумывает нарушение, которого не было — но
 * ТОЛЬКО когда совпадают три условия разом: (а) паттерн похож по форме на настоящее
 * правило, (б) набор правил открыт/неопределён, (в) сама постановка задачи намекает
 * "здесь есть проблема, найди её". У этого черновика (б) и (в) сняты структурно —
 * записи в trail=${UNCOVERED_TRAIL} появляются только когда УЖЕ подтверждено, что
 * нарушился конкретный существующий feedback_*-файл, не когда кого-то попросили
 * "поискать проблемы". Но пункт 1 выше всё равно нужен — порог в ${UNCOVERED_THRESHOLD}
 * записи не спасает, если сами записи расплывчаты.
 *
 * Режим: ${envVar}=off отключает (тот же стиль, что у остальных hook'ов).
 */
import fs from 'node:fs';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const mode = (process.env.${envVar} || 'warn').toLowerCase();
  if (mode === 'off') {
    process.stdout.write('{"continue": true, "suppressOutput": true}\\n');
    return;
  }

  let hookData;
  try {
    hookData = JSON.parse(readStdin() || '{}');
  } catch {
    process.stdout.write('{"continue": true, "suppressOutput": true}\\n');
    return;
  }

  // TODO: реальная проверка вместо этой заглушки — сейчас черновик никогда не
  // предупреждает, чтобы случайное подключение по ошибке ничего не сломало.
  void hookData;

  process.stdout.write('{"continue": true, "suppressOutput": true}\\n');
}

try {
  main();
} catch {
  process.stdout.write('{"continue": true, "suppressOutput": true}\\n');
}
`;
}

function writeDrafts(candidates) {
  const written = [];
  const skipped = [];
  if (!candidates.length) return { written, skipped };
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  for (const c of candidates) {
    const slug = slugify(c.category);
    const filePath = path.join(DRAFTS_DIR, `${slug}-guard.DRAFT.mjs`);
    if (fs.existsSync(filePath)) {
      skipped.push({ ...c, slug, filePath, reason: 'черновик уже существует, не перезаписан' });
      continue;
    }
    fs.writeFileSync(filePath, draftTemplate({ ...c, slug }), 'utf8');
    written.push({ ...c, slug, filePath });
  }
  return { written, skipped };
}

// ---------- B) не подключено / битая ссылка ----------

// 30.09.2026: crew больше не держит СВОИ копии хуков — ссылается на app по пути
// `../cosmogram-app/.claude/hooks/...` (одна правда вместо двух расходящихся копий;
// найдено живьём: копия guard-full-suite-warn.sh в crew отстала от app на баг, починенный
// ещё 26.09). Поэтому ссылка бывает и локальной (`.claude/hooks/x`), и внешней (`../<репо>/...`):
// внешнюю проверяем от корня репозитория, а отсутствующая локальная папка хуков — не ошибка.
function listDir(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

function checkWiring(hooksDir, settingsPath) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const repoRoot = path.dirname(path.dirname(settingsPath)); // <корень>/.claude/settings.json → <корень>
  const referenced = new Set();
  const external = new Set();
  function walk(hooks) {
    for (const group of hooks || []) {
      for (const h of group.hooks || []) {
        const cmd = h.command || '';
        const m = cmd.match(/(?:\.\.\/[^\/\s"]+\/)?\.claude\/hooks\/[^\s"]+/);
        if (!m) continue;
        const p = m[0].replace(/\\/g, '/');
        if (p.startsWith('../')) external.add(p); else referenced.add(p);
      }
    }
  }
  for (const evt of Object.keys(settings.hooks || {})) walk(settings.hooks[evt]);

  const allFiles = listDir(hooksDir).filter((f) => (f.endsWith('.mjs') || f.endsWith('.sh')) && !f.startsWith('.'));

  const orphans = [];
  for (const f of allFiles) {
    const found = [...referenced].some((r) => r.endsWith(f));
    if (!found) orphans.push(f);
  }

  const broken = [];
  for (const ref of referenced) {
    const rel = ref.replace(/^\.claude\/hooks\//, '');
    const abs = path.join(hooksDir, rel);
    if (!fs.existsSync(abs)) broken.push(ref);
  }
  for (const ref of external) {
    if (!fs.existsSync(path.resolve(repoRoot, ref))) broken.push(ref);
  }

  return { orphans, broken, referencedCount: referenced.size + external.size, externalCount: external.size, fileCount: allFiles.length };
}

// Известные намеренно-ручные файлы — не hook'и вообще, не ошибка, что их нет в settings.json
const KNOWN_MANUAL = new Set([
  '.claude/hooks/log-claim.mjs',
  '.claude/hooks/whole-game-health-check.sh',
  '.claude/hooks/lib/signal-trail.mjs',
  '.claude/hooks/lib/guard-gap-finder.mjs',
  '.claude/hooks/lib/read-transcript-tail.mjs',
  '.claude/hooks/lib/check-guard-mjs-invocation.mjs',
]);

// ---------- В) активность хуков — периодическая проверка "изменилось ли поведение" ----------
// 29.09.2026 (владелец: «покрыть все непокрытые моменты» + CLAUDE.md «раз в
// memory-консолидацию проверять не сработал ли хук технически, а изменилось ли реальное
// поведение», WHO-checklist Ontario-провал — без живой проверки скатывается в галочку).
// Список известных категорий синхронизирован вручную с recordSignal-вызовами в hooks/*.mjs —
// если добавляешь новый recordSignal с новой категорией, добавь её и сюда.
const KNOWN_HOOK_CATEGORIES = [
  'excuse-words', 'ask-then-act', 'claim-check', 'evidence-anchoring',
  'device-claim', 'shared-constant', 'geometry-measure',
];
const ACTIVITY_WINDOW_DAYS = 30;

function checkHookActivity() {
  const entries = readEntries('default');
  const now = Date.now();
  const windowMs = ACTIVITY_WINDOW_DAYS * 24 * 3_600_000;
  const rows = [];
  for (const category of KNOWN_HOOK_CATEGORIES) {
    const forCat = entries.filter((e) => e.category === category);
    const recent = forCat.filter((e) => now - e.ts <= windowMs);
    const lastTs = forCat.length ? Math.max(...forCat.map((e) => e.ts)) : null;
    rows.push({ category, totalEver: forCat.length, recentCount: recent.length, lastTs });
  }
  return rows;
}

// ---------- Г) POSIX-путь → node fs — статическая защита от целого класса бага ----------
// 29.09.2026 (владелец: «пути постоянно ломаются у Windows... надо противодействие сделать»).
// Реальный найденный баг: `pwd` под git-bash даёт POSIX-путь (/c/...), node на Windows читает
// его нормально ТОЛЬКО как свой entry-script argv (`node "$DIR/x.mjs"`), но fs.existsSync/
// readFileSync ВНУТРИ запущенного JS такой путь не понимают (проверено численно). Эвристика
// (не идеальная, может дать ложный "проверить руками" — это лучше, чем тихо пропустить):
// файл считается ПОДОЗРИТЕЛЬНЫМ, если в нём есть command substitution с "голым" `pwd`
// (без `-W`) И где-то в файле есть fs-вызов (существующий из существующих или node -e
// с existsSync/readFileSync/writeFileSync/readdirSync/appendFileSync) — то есть оба условия
// разом, не одно из двух (bare pwd сам по себе безопасен, если используется только как
// node-entry-script argv, как в commit-tracker.sh — проверено, не флагуется).
function checkWindowsPathRisk(hooksDir) {
  const shFiles = listDir(hooksDir).filter((f) => f.endsWith('.sh'));
  const suspicious = [];
  for (const f of shFiles) {
    const filePath = path.join(hooksDir, f);
    // 29.09.2026: первая версия ловила слово "pwd" в объясняющих КОММЕНТАРИЯХ про сам баг
    // (ложное срабатывание на уже починенном repeat-edit-tracker.sh) — убрать строки-комментарии
    // (начинаются с # после пробелов) перед проверкой, смотреть только на реальный код.
    const codeOnly = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const withoutSafePwd = codeOnly.replace(/pwd\s+-W/g, '');
    const hasBarePwd = /\bpwd\b/.test(withoutSafePwd);
    const hasFsCall = /(existsSync|readFileSync|writeFileSync|readdirSync|appendFileSync)\s*\(/.test(codeOnly);
    if (hasBarePwd && hasFsCall) suspicious.push(f);
  }
  return suspicious;
}

// ---------- Д) permissionDecision:"ask" — документированно ненадёжен в этом окружении ----------
// 29.09.2026 (владелец: «мы вроде что-то сделали против повтора, а они повторяются и
// повторяются» — прямая, точная претензия). Урок «ask не показывает окно владельцу»
// существовал уже 5 раз (guard-full-suite-warn.sh, 17.09-25.09) ДО того, как protect-core.sh/
// no-windows-path-redirect.sh/no-secrets-in-commit.sh всё равно построились на ask —
// потому что урок жил ТОЛЬКО текстом в одном комментарии, не проверялся кодом при
// написании нового хука. Записать ещё раз текстом (feedback_ask_permission_nenadezhen_29_09)
// решает эту сессию, не решает в принципе — тот же класс провала, что уже доказан
// исследованием этого же вечера (McMillan/Huang et al.: текст не удерживается надёжно).
// Это — код, не текст: при каждом scan автоматически находит ЛЮБОЙ .sh-хук, который всё
// ещё использует ask, независимо от того, помню я урок в моменте или нет.
function checkAskUsage(hooksDir) {
  const shFiles = listDir(hooksDir).filter((f) => f.endsWith('.sh'));
  const found = [];
  for (const f of shFiles) {
    const codeOnly = fs.readFileSync(path.join(hooksDir, f), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    if (/permissionDecision[\\"']*\s*:\s*[\\"']*ask/.test(codeOnly)) found.push(f);
  }
  return found;
}

// ---------- Е) *_ENFORCE_MODE=warn в settings.json — тот же провал, найденный на СЕБЕ ----------
// 29.09.2026 (владелец: «проверяем всё, очень внимательно и конкретно»). Проверка claim-check-
// hook показала: warn-режим Stop-хука технически срабатывает верно, но 9+ раз подряд не привёл
// ни к какому изменению поведения — не хук молчал, молчал я. Тот же вывод, тем же вечером,
// применён к трём соседним Stop-хукам (ask-then-act/excuse-words/device-claim). Чтобы этот
// класс не всплыл в 7-й раз случайно — сканировать settings.json на любой ENFORCE_MODE=warn
// у Stop-хука автоматически. EXEMPT — хуки, у которых warn выбран НАМЕРЕННО, по дизайну
// (не забытая настройка) — evidence-anchoring-guard.mjs сам объясняет почему в своём
// заголовке: визуальное доказательство иногда однозначно само по себе, жёсткий гейт здесь
// был бы неверным по замыслу, не по недосмотру.
const WARN_MODE_EXEMPT = new Set(['evidence-anchoring-guard.mjs']);

function checkWarnModeStopHooks(settingsPath) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const stopHooks = settings.hooks && settings.hooks.Stop;
  const found = [];
  for (const group of stopHooks || []) {
    for (const h of group.hooks || []) {
      const cmd = h.command || '';
      const m = cmd.match(/_ENFORCE_MODE=warn.*?([a-zA-Z0-9_.-]+\.mjs)/);
      if (m && !WARN_MODE_EXEMPT.has(m[1])) found.push(m[1]);
    }
  }
  return found;
}

function main() {
  const cmd = process.argv[2];
  if (cmd !== 'scan') {
    console.error('usage: guard-gap-finder.mjs scan');
    process.exit(1);
  }

  console.log('════════ guard-gap-finder: А) необшитые паттерны (signal-trail, trail=uncovered) ════════');
  const candidates = findUncoveredCandidates();
  if (!candidates.length) {
    console.log(`Нет категорий с ≥${UNCOVERED_THRESHOLD} записей. (Это ожидаемо, если конвенция`);
    console.log('"record ... --trail=uncovered" ещё ни разу не использовалась в этой сессии.)');
  } else {
    const { written, skipped } = writeDrafts(candidates);
    for (const w of written) {
      console.log(`⚠ "${w.category}" — ${w.count} повтор(ов) → ЧЕРНОВИК записан: ${path.relative(PROJECT_ROOT, w.filePath)}`);
    }
    for (const s of skipped) {
      console.log(`(пропущено, черновик уже существует) "${s.category}" — ${s.count} повтор(ов): ${path.relative(PROJECT_ROOT, s.filePath)}`);
    }
  }

  // 29.09.2026: обе стороны игры разом, не только та, где физически лежит этот скрипт —
  // найдено живьём, что crew копия хуков отстаёт от app'ной незаметно, если не сверять обе.
  const repos = [{ label: 'app', hooksDir: HOOKS_DIR, settingsPath: SETTINGS_PATH }];
  if (fs.existsSync(CREW_SETTINGS_PATH)) { // папки хуков в crew может не быть вовсе — он ссылается на app
    repos.push({ label: 'crew', hooksDir: CREW_HOOKS_DIR, settingsPath: CREW_SETTINGS_PATH });
  } else {
    repos.push({ label: 'crew', missing: true });
  }

  console.log('');
  console.log('════════ Б) не подключено / битая ссылка (settings.json ↔ файлы на диске) ════════');
  for (const repo of repos) {
    if (repo.missing) { console.log(`  [${repo.label}] не найден рядом — пропущено.`); continue; }
    const { orphans, broken, referencedCount, externalCount, fileCount } = checkWiring(repo.hooksDir, repo.settingsPath);
    console.log(`  [${repo.label}] своих файлов: ${fileCount}. Упомянуто в settings.json: ${referencedCount}` +
      (externalCount ? ` (из них ${externalCount} — ссылки на соседний репозиторий).` : '.'));
    const knownManualBase = new Set([...KNOWN_MANUAL].map((k) => k.replace(/^\.claude\/hooks\//, '')));
    const realOrphans = orphans.filter((o) => !knownManualBase.has(o));
    if (realOrphans.length) {
      for (const o of realOrphans) console.log(`  ⚠ [${repo.label}] существует на диске, НЕ упомянут в settings.json: ${o}`);
    } else {
      console.log(`  [${repo.label}] сирот нет (кроме заведомо ручных файлов).`);
    }
    if (broken.length) {
      for (const b of broken) console.log(`  ⚠ [${repo.label}] упомянут в settings.json, файла на диске НЕТ: ${b}`);
    } else {
      console.log(`  [${repo.label}] битых ссылок нет.`);
    }
  }

  console.log('');
  console.log(`════════ В) активность хуков (${ACTIVITY_WINDOW_DAYS} дней, signal-trail trail=default) ════════`);
  const activity = checkHookActivity();
  const neverFired = activity.filter((r) => r.totalEver === 0);
  const silentRecently = activity.filter((r) => r.totalEver > 0 && r.recentCount === 0);
  const active = activity.filter((r) => r.recentCount > 0).sort((a, b) => b.recentCount - a.recentCount);
  for (const r of active) {
    const lastDate = new Date(r.lastTs).toISOString().slice(0, 10);
    console.log(`  ${r.category}: ${r.recentCount} раз(а) за ${ACTIVITY_WINDOW_DAYS} дней (последний раз ${lastDate}, всего за всё время ${r.totalEver})`);
  }
  if (silentRecently.length) {
    console.log(`  Молчат последние ${ACTIVITY_WINDOW_DAYS} дней (срабатывали раньше): ${silentRecently.map((r) => r.category).join(', ')}`);
  }
  if (neverFired.length) {
    console.log(`  ⚠ Ни разу не сработали за всё время (проверить, реально ли достижимы, или правда никогда не было повода): ${neverFired.map((r) => r.category).join(', ')}`);
  }
  console.log('  (тишина сама по себе не значит "сломан" — может значить "нарушений правда не было";');
  console.log('   это сырые данные для решения при memory-консолидации, не готовый вердикт.)');

  console.log('');
  console.log('════════ Г) риск POSIX-пути → node fs (pwd без -W + fs-вызов в одном файле) ════════');
  for (const repo of repos) {
    if (repo.missing) { console.log(`  [${repo.label}] не найден рядом — пропущено.`); continue; }
    const pathRisks = checkWindowsPathRisk(repo.hooksDir);
    if (pathRisks.length) {
      for (const p of pathRisks) console.log(`  ⚠ [${repo.label}] ${p} — есть "голый" pwd И fs-вызов в одном файле, проверить руками`);
    } else {
      console.log(`  [${repo.label}] риск не обнаружен эвристикой.`);
    }
  }
  console.log('  (эвристика, не доказательство ни в ту, ни в другую сторону — снимает часть ручной работы,');
  console.log('   не заменяет live-тест нового хука перед доверием к нему.)');

  console.log('');
  console.log('════════ Д) permissionDecision:"ask" — документированно ненадёжен здесь (29.09.2026) ════════');
  for (const repo of repos) {
    if (repo.missing) { console.log(`  [${repo.label}] не найден рядом — пропущено.`); continue; }
    const askHooks = checkAskUsage(repo.hooksDir);
    if (askHooks.length) {
      for (const h of askHooks) console.log(`  ⚠ [${repo.label}] ${h} — всё ещё использует "ask". Окно разрешения владельцу документированно не приходит здесь. Перевести на "deny", если ставки реальные.`);
    } else {
      console.log(`  [${repo.label}] ни один .sh-хук не использует "ask".`);
    }
  }

  console.log('');
  console.log('════════ Е) Stop-хуки на ENFORCE_MODE=warn (29.09.2026, живой провал на claim-check) ════════');
  for (const repo of repos) {
    if (repo.missing) { console.log(`  [${repo.label}] не найден рядом — пропущено.`); continue; }
    const warnHooks = checkWarnModeStopHooks(repo.settingsPath);
    if (warnHooks.length) {
      for (const h of warnHooks) console.log(`  ⚠ [${repo.label}] ${h} — Stop-хук на ENFORCE_MODE=warn. Если не в списке EXEMPT (осознанный выбор дизайна) — проверить, действительно ли warn достаточен, или нужен block.`);
    } else {
      console.log(`  [${repo.label}] все Stop-хуки либо block, либо осознанно EXEMPT.`);
    }
  }

  console.log('');
  console.log('════════ конец отчёта — ничего не записано в settings.json, регистрация всегда отдельным шагом ════════');
}

main();
