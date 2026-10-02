#!/usr/bin/env node
/*
 * tools/skill-profile.mjs — переключатель «режимов» скиллов (02.10.2026, владелец: «не нужно, чтобы все скиллы были включены сразу…
 * когда-то одно, когда-то другое»). Меняет ТОЛЬКО ключ skillOverrides в .claude/settings.local.json (личный файл, в git не идёт),
 * остальные настройки не трогает. Применяется сразу, без перезапуска (по документации Claude Code).
 *
 * Использование:  node tools/skill-profile.mjs <режим> [--dry]
 *   режим: обычный | сервер | баги | слияние | всё | покажи
 *   --dry  — только показать, что изменится, ничего не записывать.
 * Владельцу команда не нужна: он пишет ассистенту «режим сервер», ассистент запускает это.
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), '.claude', 'settings.local.json');
const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');
const ALWAYS = ['vse-srazu', 'odno-za-drugim', 'maket', 'bugfix', 'release', 'tiraniya-slov', 'razbor-promaha', 'proverka-teksta',
  // имя не говорит само за себя: при «только имя» слабая модель теряла их (тест 02.10.2026, 67 фраз), поэтому всегда с описанием
  'ds-sync', 'deep-search', 'myshlenie-uchyonyh', 'perevod-yazykov'];
const PROFILES = {
  'обычный': [], // пять скиллов с очевидными именами сворачиваются до «только имя»: срабатывали по одному имени у обеих моделей
  'сервер': ['deploy-edge', 'supabase-permissions', 'no-manual-transcription'],
  'баги': ['device-bug'],
  'слияние': ['git-conflict'],
  'всё': null // все включены
};

const all = fs.readdirSync(SKILLS_DIR).filter(d => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))).sort();
const arg = process.argv[2]; const dry = process.argv.includes('--dry');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { if (fs.existsSync(FILE)) { console.error('Не могу прочитать ' + FILE + ': ' + e.message); process.exit(1); } }
const cur = cfg.skillOverrides || {};

if (!arg || arg === 'покажи') {
  console.log('Сейчас:');
  for (const s of all) console.log('  ' + s.padEnd(26) + (cur[s] || 'on'));
  console.log('Режимы: ' + Object.keys(PROFILES).join(' | ')); process.exit(0);
}
if (!(arg in PROFILES)) { console.error('Неизвестный режим «' + arg + '». Есть: ' + Object.keys(PROFILES).join(', ')); process.exit(1); }

const next = {};
if (PROFILES[arg] !== null) {
  const on = new Set([...ALWAYS, ...PROFILES[arg]]);
  for (const s of all) if (!on.has(s)) next[s] = 'name-only';
}
// чужие записи (скиллов, которых нет в нашей папке) не трогаем
for (const k of Object.keys(cur)) if (!all.includes(k)) next[k] = cur[k];

const diff = []; for (const s of all) { const a = cur[s] || 'on', b = next[s] || 'on'; if (a !== b) diff.push(s + ': ' + a + ' → ' + b); }
console.log('Режим «' + arg + '»: ' + (diff.length ? diff.length + ' изменений' : 'ничего не меняется'));
diff.forEach(x => console.log('  ' + x));
if (dry) { console.log('(--dry: файл не записан)'); process.exit(0); }
if (Object.keys(next).length) cfg.skillOverrides = next; else delete cfg.skillOverrides;
fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
console.log('Записано в ' + path.relative(process.cwd(), FILE));
