#!/usr/bin/env node
/*
 * skin-lab-guard.mjs — 02.10.2026, по прямому слову владельца («делай хук… обязательный, такой,
 * который ты никогда не обойдёшь»). Сбой: скины макета делались без эталона, без замера скорости
 * и без проверки на телефоне, а выяснялось это после вопроса владельца.
 *
 * Опора — запись tools/maket-skiny/.lab-ok.json, которую пишет ТОЛЬКО tools/skin-lab.mjs после настоящего
 * прогона на телефоне. Запись привязана к содержимому проверенного макета (sha256), к версии самого skin-lab
 * и к найденным провалам. Изменил макет или сам skin-lab — запись перестаёт совпадать, нужен новый прогон.
 *
 * Два режима (argv[2]):
 *   stop    — событие Stop: если за ход изменился исходник макета (template*.html), а собранный макет
 *             не пересобран или не прошёл skin-lab зелёным, ход закончить нельзя (один раз за ход:
 *             stop_hook_active пропускает, чтобы не зациклиться; на следующем ходу снова не пустит).
 *             С 02.10 эту проверку зовёт и объединённый stop-checks.mjs (функция skinLabStopReason).
 *   publish — событие PreToolUse инструмента Artifact: макет скинов (есть drawShip и NATIVE.) нельзя
 *             опубликовать, если для ЭТОГО файла нет зелёной записи skin-lab.
 * Честный предел: подделку записи руками хук не заметит; обойти его случайно или «по лени» нельзя.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.CLAUDE_PROJECT_DIR || path.resolve(HERE, '..', '..');
const DIR = path.join(PROJECT, 'tools', 'maket-skiny');
const LAB = path.join(PROJECT, 'tools', 'skin-lab.mjs');
const RECORD = path.join(DIR, '.lab-ok.json');
const STATE = path.join(PROJECT, '.claude', 'state', 'skin-lab-guard.json');
// исходник → собранный макет
const PAIRS = [['template.html', 'maket-skiny.dc.html'], ['template-aside.html', 'otlozhennye-risunki.dc.html']];

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const shaFile = f => { try { return sha(fs.readFileSync(f)); } catch { return ''; } };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const HOW = 'Запусти: node tools/maket-skiny/build.mjs, затем node tools/skin-lab.mjs <макет.html> <serial телефона> (телефоны: R7STA05K3BK, cf3beda0). Зелёная запись пишется только после настоящего прогона на телефоне.';

// проверка одного макета: { ok, why }
function verify(file) {
  const h = shaFile(file);
  if (!h) return { ok: false, why: `файл не найден: ${file}` };
  const rec = readJson(RECORD, {})[h];
  if (!rec) return { ok: false, why: `для этого файла (${path.basename(file)}) нет записи skin-lab: он правился или не проверялся на телефоне.` };
  if (rec.labSha !== shaFile(LAB)) return { ok: false, why: 'после проверки менялся сам skin-lab.mjs: нужен новый прогон.' };
  if (!rec.ok) return { ok: false, why: `прошлый прогон skin-lab красный: ${(rec.failures || []).slice(0, 6).join('; ')}` };
  return { ok: true };
}

/** Проверка конца хода: текст требования или '' (всё в порядке). При успехе запоминает проверенное состояние исходников. */
export function skinLabStopReason() {
  const state = readJson(STATE, {});
  const next = { ...state };
  const problems = [];
  for (const [src, built] of PAIRS) {
    const sf = path.join(DIR, src), bf = path.join(DIR, built);
    if (!fs.existsSync(sf)) continue;
    const sh = shaFile(sf);
    if (state[src] === sh) continue; // с прошлой проверки не менялся
    let mt = 0, bt = 0;
    try { mt = fs.statSync(sf).mtimeMs; bt = fs.statSync(bf).mtimeMs; } catch { /* нет собранного */ }
    if (!bt || bt < mt) { problems.push(`${src} изменён, а ${built} не пересобран (node tools/maket-skiny/build.mjs).`); continue; }
    const body = fs.readFileSync(bf, 'utf8');
    if (!(/drawShip/.test(body) && /NATIVE\./.test(body))) { next[src] = sh; continue; } // не макет скинов (старые прямоугольные карточки): skin-lab неприменим
    const v = verify(bf);
    if (!v.ok) { problems.push(`${built}: ${v.why}`); continue; }
    next[src] = sh;
  }
  if (!problems.length) {
    try { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(next)); } catch { /* не критично */ }
    return '';
  }
  return `Хук skin-lab-guard (по слову владельца 02.10: «хук, который ты не обойдёшь»): скины правились, а проверки на телефоне нет.\n- ${problems.join('\n- ')}\n${HOW}\nВ ответе владельцу приведи таблицу skin-lab (что запускал → что вышло). Без неё не заканчивай ход.`;
}

// запуск как отдельная программа; при import из stop-checks.mjs ничего ниже не выполняется
if (process.argv[1] && process.argv[1].endsWith('skin-lab-guard.mjs')) {
  const input = (() => { try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; } })();
  const mode = process.argv[2];

  if (mode === 'publish') {
    const ti = input.tool_input || {};
    const act = ti.action || 'publish';
    const f = ti.file_path;
    if (act !== 'publish' || ti.asset || !f || !/\.html?$/i.test(f) || !fs.existsSync(f)) process.exit(0);
    const body = fs.readFileSync(f, 'utf8');
    if (!(/drawShip/.test(body) && /NATIVE\./.test(body))) process.exit(0); // не макет скинов
    const v = verify(f);
    if (v.ok) process.exit(0);
    process.stderr.write(`Публикация макета скинов остановлена хуком skin-lab-guard: ${v.why}\n${HOW}\n`);
    process.exit(2);
  }

  if (mode === 'stop') {
    if (input.stop_hook_active) process.exit(0);
    const reason = skinLabStopReason();
    if (!reason) process.exit(0);
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
  }

  process.exit(0);
}
