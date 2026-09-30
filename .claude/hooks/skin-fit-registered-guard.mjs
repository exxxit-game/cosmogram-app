#!/usr/bin/env node
/* skin-fit-registered-guard.mjs — 26.09.2026, построен в моменте (владелец: «просто записывать
   толку мало, надо что-то делать») сразу после того, как живой замер на телефоне подтвердил:
   ~98 скинов (id113-210) добавлены в SKINS (game.js) с fx, но НИ ОДИН не зарегистрирован в
   ANGAR_PV_FIT_COLOR (ui.js) — седьмой по счёту случай ровно того же класса бага, что уже
   ABSOLUTE-правило (feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md): «новое»
   добавлено в одно место (SKINS), второе место (таблица калибровки зума явления) молчит.

   Механика: при правке js/game.js ИЛИ js/ui.js — вытащить регуляркой все id из SKINS, у
   которых есть fx (и id>0, id0 — Бумажный, исключение по коду), и все ключи ANGAR_PV_FIT_COLOR
   из ui.js; если есть fx-скин без записи в таблице — предупредить (не блокировать: сам факт
   отсутствия записи не значит, что скин реально переполняет холст, нужен живой замер, но
   ЗАМЕТИТЬ отсутствие регистрации хук может механически, без замера).
   30.09.2026 (владелец, окна выбора): warn → block, но блок ТОЛЬКО на правку game.js, которая САМА
   добавляет fx-скин без записи в ANGAR_PV_FIT_COLOR (по old_string/new_string правки; для Write —
   против версии из git HEAD). Старый долг (8 скинов без записи на момент решения: 130, 156, 157,
   159, 198, 204, 208, 209) блока не вызывает — остаётся предупреждением, иначе каждая правка
   game.js/ui.js стояла бы, пока эти 8 не откалиброваны замером на телефоне.
   Режимы SKIN_FIT_GUARD_MODE: block (по умолчанию) | warn (только предупреждения) | off. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const MODE = (process.env.SKIN_FIT_GUARD_MODE || 'block').toLowerCase();
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const GAME_JS = join(REPO_ROOT, 'js', 'game.js');
const UI_JS = join(REPO_ROOT, 'js', 'ui.js');

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractFxSkinIds(gameSrc) {
  // каждая запись SKINS — один объектный литерал в фигурных скобках на своей строке(ах);
  // берём id и fx из одного и того же {...} блока, не просто "любой id рядом с любым fx"
  const ids = [];
  const re = /\{id:\s*(\d+)[^{}]*?\}/gs;
  let m;
  while ((m = re.exec(gameSrc))) {
    const block = m[0];
    if (/fx:\s*'[^']+'/.test(block)) {
      const id = Number(m[1]);
      if (id > 0) ids.push(id); // id0 (Бумажный) — явное исключение по коду (angarShip без явления)
    }
  }
  return ids;
}

function extractFitTableIds(uiSrc) {
  const m = uiSrc.match(/const ANGAR_PV_FIT_COLOR\s*=\s*\{([^}]*)\}/s);
  if (!m) return null; // таблица переименована/пропала — не наше дело здесь, молчим
  const ids = new Set();
  const re = /(\d+)\s*:/g;
  let mm;
  while ((mm = re.exec(m[1]))) ids.add(Number(mm[1]));
  return ids;
}

/** fx-скины, которые ЭТА правка game.js добавила и которых нет в таблице ANGAR_PV_FIT_COLOR. */
function newlyAddedMissing(hookData, file, fitIds) {
  const ti = hookData.tool_input || {};
  let before, after;
  if (hookData.tool_name === 'Edit') {
    before = String(ti.old_string || '');
    after = String(ti.new_string || '');
  } else if (hookData.tool_name === 'Write') {
    try {
      before = execFileSync('git', ['-C', dirname(file), 'show', 'HEAD:./' + basename(file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    } catch { return []; }
    try { after = readFileSync(file, 'utf8'); } catch { after = String(ti.content || ''); }
  } else return [];
  const had = new Set(extractFxSkinIds(before));
  return [...new Set(extractFxSkinIds(after))].filter((id) => !had.has(id) && !fitIds.has(id));
}

function main() {
  if (MODE === 'off') return 0;
  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { return; }
  const file = String((hookData.tool_input && hookData.tool_input.file_path) || '');
  if (!/[\\/]js[\\/](game|ui)\.js$/.test(file)) return;
  if (!existsSync(GAME_JS) || !existsSync(UI_JS)) return;

  const gameSrc = readFileSync(GAME_JS, 'utf8');
  const uiSrc = readFileSync(UI_JS, 'utf8');
  const fxIds = extractFxSkinIds(gameSrc);
  const fitIds = extractFitTableIds(uiSrc);
  if (!fitIds) return 0;

  if (MODE === 'block' && /[\\/]js[\\/]game\.js$/.test(file)) {
    const added = newlyAddedMissing(hookData, file, fitIds);
    if (added.length) {
      console.error(
        `❌ skin-fit-registered-guard: правка добавила fx-скин(ы) без записи в ANGAR_PV_FIT_COLOR (js/ui.js) — id: ${added.join(', ')}.\n` +
        `  Так пропустили партию id113-210 (седьмой случай «новое подключено не везде», feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md).\n` +
        `  Скин с fx не считается добавленным, пока для него нет записи подгонки под зум «явления». Калибровка — живым замером (angarPvZoomOpen + getImageData), число не выдумывать.\n` +
        `  Отключить на раз: SKIN_FIT_GUARD_MODE=warn или =off`);
      return 2;
    }
  }

  const missing = fxIds.filter(id => !fitIds.has(id));
  if (missing.length === 0) return;

  // не шумим на КАЖДОЙ правке одним и тем же большим списком, который уже известен —
  // но раз это warn-хук без состояния между вызовами, просто не блокируем и печатаем сжато
  const shown = missing.slice(0, 8);
  console.error(
    `⚠ skin-fit-registered-guard: ${missing.length} fx-скин(ов) есть в SKINS, но НЕТ в ` +
    `ANGAR_PV_FIT_COLOR (js/ui.js) — id: ${shown.join(', ')}${missing.length > 8 ? ', …' : ''}. ` +
    `Это не обязательно баг (нужен живой замер, отсутствие записи = дефолт fit=1), но именно ` +
    `так пропустили партию id113-210 (feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md, ` +
    `случай 7) — проверить живьём перед тем, как считать добавление скина законченным.\n` +
    `Отключить на раз: SKIN_FIT_GUARD_MODE=off`
  );
}

let code = 0;
try { code = main() || 0; } catch { /* fail-safe: тихо не мешать основной работе */ }
process.exit(code);
