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

function checkWiring() {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  const referenced = new Set();
  function walk(hooks) {
    for (const group of hooks || []) {
      for (const h of group.hooks || []) {
        const cmd = h.command || '';
        const m = cmd.match(/\.claude\/hooks\/[^\s"]+/);
        if (m) referenced.add(m[0].replace(/\\/g, '/'));
      }
    }
  }
  for (const evt of Object.keys(settings.hooks || {})) walk(settings.hooks[evt]);

  const allFiles = fs
    .readdirSync(HOOKS_DIR)
    .filter((f) => (f.endsWith('.mjs') || f.endsWith('.sh')) && !f.startsWith('.'));

  const orphans = [];
  for (const f of allFiles) {
    const found = [...referenced].some((r) => r.endsWith(f));
    if (!found) orphans.push('.claude/hooks/' + f);
  }

  const broken = [];
  for (const ref of referenced) {
    const rel = ref.replace(/^\.claude\/hooks\//, '');
    const abs = path.join(HOOKS_DIR, rel);
    if (!fs.existsSync(abs)) broken.push(ref);
  }

  return { orphans, broken, referencedCount: referenced.size, fileCount: allFiles.length };
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

  console.log('');
  console.log('════════ Б) не подключено / битая ссылка (settings.json ↔ файлы на диске) ════════');
  const { orphans, broken, referencedCount, fileCount } = checkWiring();
  console.log(`Файлов в .claude/hooks (и /lib): ${fileCount}. Упомянуто в settings.json: ${referencedCount}.`);
  const realOrphans = orphans.filter((o) => !KNOWN_MANUAL.has(o));
  if (realOrphans.length) {
    for (const o of realOrphans) console.log(`⚠ существует на диске, НЕ упомянут в settings.json: ${o}`);
  } else {
    console.log('Сирот нет (кроме заведомо ручных файлов — log-claim.mjs и т.п., это не баг).');
  }
  if (broken.length) {
    for (const b of broken) console.log(`⚠ упомянут в settings.json, файла на диске НЕТ: ${b}`);
  } else {
    console.log('Битых ссылок нет.');
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
  console.log('════════ конец отчёта — ничего не записано в settings.json, регистрация всегда отдельным шагом ════════');
}

main();
