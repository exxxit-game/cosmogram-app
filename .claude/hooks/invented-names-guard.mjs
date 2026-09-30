#!/usr/bin/env node
/* invented-names-guard.mjs — 30.09.2026. Противоядие от «выдуманных имён» (владелец, после падения стражей
   в CI «I18N is not defined»: «два месяца одна и та же хуйня, записи не помогают, нужно противоядие»).

   Что делает: PostToolUse на Edit|Write. Берёт ТОЛЬКО что написанный текст (new_string / content) и сверяет
   имена в нём с реальной игрой:
     1) ключи словаря: L.KEY, ovT('KEY'), ballText('KEY'), I18N.<язык>.KEY — должны быть в I18N.ru
        (словарь читается из настоящего js/i18n.js);
     2) id элементов: $('id'), getElementById('id') — должны быть в index.html, в id="…" из js/*.js
        или объявлены в самом новом тексте.
   Нашёл несуществующее — exit 2 + список: правка считается недоделанной, пока имя не проверено по файлу.
   Проверяет только НОВЫЙ текст, поэтому старые «висящие» ссылки (L.bbVLiar, L.forgeEn) не шумят.
   Область: js/*.js игры и tests/guard.mjs (крю). Не проверяет: имена функций/переменных (нужен парсер) —
   это остаётся на живой проверке.
   Режим: INVENTED_NAMES_MODE=block (по умолчанию) | warn | off. Любая внутренняя ошибка — тихо exit 0. */
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const MODE = (process.env.INVENTED_NAMES_MODE || 'block').toLowerCase();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const norm = p => String(p || '').replace(/\\/g, '/');

function main() {
  if (MODE === 'off') return 0;
  let d; try { d = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  const ti = d.tool_input || {};
  const file = norm(ti.file_path);
  const isGameJs = /\/js\/[^/]+\.js$/.test(file) && basename(file) !== 'i18n.js';
  const isGuard = /\/tests\/guard\.mjs$/.test(file);
  if (!isGameJs && !isGuard) return 0;
  const text = String(ti.new_string != null ? ti.new_string : (ti.content != null ? ti.content : ''));
  if (!text) return 0;

  // 1) словарь
  const I = vm.runInNewContext(readFileSync(join(ROOT, 'js/i18n.js'), 'utf8') + ';I18N',
    { console, window: {}, document: {}, navigator: { language: 'ru' }, localStorage: { getItem() { return null; } } }, { timeout: 5000 });
  const ru = I.ru;
  const localL = /\b(?:const|let|var)\s+L\b|\(\s*L\s*[,)]|\bL\s*=>/.test(text); // в этом тексте L — своя локальная переменная
  const keyRes = [
    ...(localL || isGuard ? [] : [/(?<![\w.$])L\.([A-Za-z_]\w*)/g]),
    /(?<![\w.$])ovT\(\s*['"]([A-Za-z_]\w*)['"]/g,
    /(?<![\w.$])ballText\(\s*['"]([A-Za-z_]\w*)['"]/g,
    /(?<![\w$])I18N\.(?:ru|en|es|pt|fr)\.([A-Za-z_]\w*)/g,
  ];
  const badKeys = new Set();
  for (const re of keyRes) for (const m of text.matchAll(re)) if (!Object.prototype.hasOwnProperty.call(ru, m[1])) badKeys.add(m[1]);

  // 2) id элементов
  const known = new Set();
  const addIds = t => {
    for (const m of t.matchAll(/\bid\s*=\s*\\?["']([A-Za-z_][\w-]*)\\?["']/g)) known.add(m[1]);
    for (const m of t.matchAll(/\.id\s*=\s*['"]([\w-]+)['"]/g)) known.add(m[1]);
    for (const m of t.matchAll(/setAttribute\(\s*['"]id['"]\s*,\s*['"]([\w-]+)['"]/g)) known.add(m[1]);
  };
  addIds(readFileSync(join(ROOT, 'index.html'), 'utf8'));
  for (const f of readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'))) addIds(readFileSync(join(ROOT, 'js', f), 'utf8'));
  addIds(text);
  const badIds = new Set();
  if (isGameJs) for (const m of text.matchAll(/(?<![\w.$])\$\(\s*['"]([A-Za-z_][\w-]*)['"]\s*\)|getElementById\(\s*['"]([A-Za-z_][\w-]*)['"]\s*\)/g)) {
    const id = m[1] || m[2]; if (!known.has(id)) badIds.add(id);
  }

  if (!badKeys.size && !badIds.size) return 0;
  const lines = [`❌ invented-names-guard: в только что написанном (${basename(file)}) есть имена, которых НЕТ в реальной игре:`];
  if (badKeys.size) lines.push(`  • ключи словаря (нет в I18N.ru, js/i18n.js): ${[...badKeys].join(', ')}`);
  if (badIds.size) lines.push(`  • id элементов (нет ни в index.html, ни в id="…" из js/*.js): ${[...badIds].join(', ')}`);
  lines.push('  Это тот самый класс ошибок («выдуманные имена», 30.09.2026). Не гадать: открыть файл, найти настоящее имя',
    '  (grep по js/i18n.js / index.html) и исправить — либо, если имя новое намеренно, добавить его туда, где оно объявляется.',
    '  Отключить на раз: INVENTED_NAMES_MODE=warn или =off');
  console.error(lines.join('\n'));
  return MODE === 'warn' ? 0 : 2;
}

let code = 0;
try { code = main(); } catch { code = 0; /* fail-safe: не мешать основной работе */ }
process.exit(code);
