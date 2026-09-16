#!/usr/bin/env node
/* 16.09.2026 (владелец: «туда-сюда — тупой подход, нужно быстро»; исследование —
   .knowledge/RESEARCH-2026-09-FAST-WORKFLOW.md): версия раньше поднималась вручную в три места
   (core.js GAME_VERSION, 23 хвоста ?v= в index.html, sw.js V) — три отдельных Edit/sed-вызова
   на каждую правку игрового файла. Один скрипт, один вызов:
     node tools/bump-version.mjs           — сам поднимает последний сегмент (…313 → …314)
     node tools/bump-version.mjs 1.478.320 — ставит версию явно
   Печатает старую/новую версию и число реально изменённых хвостов ?v= — так же видно вживую,
   как раньше при ручной проверке grep -c, только один шаг вместо трёх. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CORE = path.join(ROOT, 'js', 'core.js');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');

const coreSrc = readFileSync(CORE, 'utf8');
const m = coreSrc.match(/const GAME_VERSION = '([\d.]+)';/);
if (!m) { console.error('❌ GAME_VERSION не найден в js/core.js'); process.exit(1); }
const oldVersion = m[1];

let newVersion = process.argv[2];
if (!newVersion) {
  const parts = oldVersion.split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  newVersion = parts.join('.');
} else if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error(`❌ версия должна быть вида 1.478.320, получено: ${newVersion}`);
  process.exit(1);
}

writeFileSync(CORE, coreSrc.replace(`const GAME_VERSION = '${oldVersion}';`, `const GAME_VERSION = '${newVersion}';`));

const indexSrc = readFileSync(INDEX, 'utf8');
const tagRe = new RegExp(`\\?v=${oldVersion.replace(/\./g, '\\.')}`, 'g');
const tagCount = (indexSrc.match(tagRe) || []).length;
writeFileSync(INDEX, indexSrc.replace(tagRe, `?v=${newVersion}`));

const swSrc = readFileSync(SW, 'utf8');
const swM = swSrc.match(/const V = '([\d.]+)';/);
if (!swM) { console.error('❌ V не найден в sw.js'); process.exit(1); }
writeFileSync(SW, swSrc.replace(`const V = '${swM[1]}';`, `const V = '${newVersion}';`));

console.log(`✅ ${oldVersion} → ${newVersion}`);
console.log(`   js/core.js: GAME_VERSION обновлён`);
console.log(`   index.html: ${tagCount} хвостов ?v= обновлены`);
console.log(`   sw.js: V обновлён (было ${swM[1]})`);
