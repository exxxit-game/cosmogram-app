#!/usr/bin/env node
/*
 * screen-back-registered-guard.mjs — 30.09.2026. PostToolUse на Edit/Write файла js/ui.js: каждый экран,
 * который setScreen() умеет показывать, обязан иметь свою ветку в backAction() — иначе родная и
 * аппаратная кнопка «Назад» на этом экране молча ничего не делает. Нарушено, и исправлено вручную,
 * четыре раза подряд: forgeBack (08.09), relayMine (15.09), equality/gratitude (15.09),
 * flightGallery (17.09) — feedback_novoe_ne_podklyuchennoe_vezde_povtoryayushiysya_bag.md, случаи 1-3.
 *
 * Как проверяет: из тела setScreen() берёт имена экранов по строкам
 * toggleCls('…Screen','hidden', name!=='ИМЯ'), из тела backAction() — имена по screenName==='ИМЯ'.
 * Экран без ветки → exit 2. 'menu' — дом, ветка не нужна; 'game' проверяется так же, как все.
 * Что НЕ проверяет: круглую кнопку «Назад» в index.html и заголовок экрана (следующие пары мест),
 * правильность самого перехода (куда ведёт ветка).
 *
 * Режимы (SCREEN_BACK_GUARD_MODE): block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';

const HOME = new Set(['menu']);

/** Текст функции: от «function name(» до первой строки, которая начинается с «}» в первой колонке. */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  return src.slice(start, end === -1 ? src.length : end);
}

function main() {
  const mode = (process.env.SCREEN_BACK_GUARD_MODE || 'block').toLowerCase();
  if (mode === 'off') return 0;

  let d; try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  if (!/^(Edit|Write|MultiEdit)$/.test(String(d.tool_name || ''))) return 0;
  const file = String((d.tool_input && d.tool_input.file_path) || '');
  if (path.basename(file.replace(/\\/g, '/')) !== 'ui.js') return 0;

  let src; try { src = fs.readFileSync(file, 'utf8'); } catch { return 0; }
  const setBody = fnBody(src, 'setScreen');
  const backBody = fnBody(src, 'backAction');
  if (!setBody || !backBody) return 0;

  const screens = new Set();
  const reS = /toggleCls\(\s*'\w+Screen'\s*,\s*'hidden'\s*,\s*name\s*!==\s*'(\w+)'\s*\)/g;
  let m; while ((m = reS.exec(setBody))) screens.add(m[1]);
  const branches = new Set();
  const reB = /screenName\s*===\s*'(\w+)'/g;
  while ((m = reB.exec(backBody))) branches.add(m[1]);

  const missing = [...screens].filter((s) => !HOME.has(s) && !branches.has(s));
  if (!missing.length) return 0;

  console.error(
    `❌ screen-back-registered-guard: у экрана(ов) нет ветки в backAction() (js/ui.js): ${missing.join(', ')}.\n` +
    `  Родная и аппаратная «Назад» Telegram на таком экране молча ничего не делает — так уже было четыре раза (forge, relayMine, equality/gratitude, flightGallery).\n` +
    `  Добавь в backAction() строку  else if(screenName==='ИМЯ') <куда вести>;  — куда именно вести, решает поведение экрана, не угадывай.\n` +
    `  Отключить на раз: SCREEN_BACK_GUARD_MODE=warn или =off`);
  return mode === 'warn' ? 0 : 2;
}

let code = 0;
try { code = main(); } catch { code = 0; }
process.exit(code);
