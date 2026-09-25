#!/usr/bin/env node
/* 25.09.2026 (владелец: «почему сразу не использовал», «придумай инструмент получше») —
   у меня нет отдельного «инструмента для видео» как встроенной способности (вижу картинки
   напрямую, видеопоток — нет), и первый раз я ошибочно принял «нет именованного инструмента»
   за «невозможно». Реально задача решается связкой Bash + уже стоящий на машине `ffmpeg`
   (тот же путь уже применялся в проекте раньше для живых GIF из hwshot-кадров) — просто
   раньше это была разовая команда вручную, теперь один инструмент вместо пересборки её
   заново каждый раз.

   Использование:
     node tools/video-frames.mjs <путь-к-видео.mp4> [outDir] [--fps=1] [--count=N]
       — по умолчанию 1 кадр/секунду в <scratchpad>/video-frames/, либо в outDir, если
         указан. --count=N вместо --fps берёт ровно N кадров, равномерно по всей длине
         видео (полезно для короткого ролика, где 1 кадр/сек даёт слишком много/мало).

   Печатает длительность видео и список сохранённых файлов — дальше их читать обычным
   Read (это уже встроенная способность, картинки я вижу напрямую). */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const [, , src, ...rest] = process.argv;
if (!src) {
  console.error('usage: node tools/video-frames.mjs <видео.mp4> [outDir] [--fps=1] [--count=N]');
  process.exit(1);
}
if (!existsSync(src)) { console.error(`нет такого файла: ${src}`); process.exit(1); }

let outDir = null, fps = null, count = null;
for (const a of rest) {
  if (a.startsWith('--fps=')) fps = a.slice(6);
  else if (a.startsWith('--count=')) count = Number(a.slice(8));
  else outDir = a;
}
if (!outDir) outDir = path.join(path.dirname(src), 'video-frames');
mkdirSync(outDir, { recursive: true });

const probe = execSync(`ffmpeg -i "${src}" 2>&1 || true`, { encoding: 'utf8' });
const durMatch = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
const durationSec = durMatch ? (+durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3]) : null;
if (durationSec) console.log(`длительность: ${durationSec.toFixed(1)}с`);

const vf = count
  ? `fps=${(count / (durationSec || count)).toFixed(4)}`
  : `fps=${fps || 1}`;
execSync(`ffmpeg -y -i "${src}" -vf "${vf}" "${path.join(outDir, 'frame_%03d.png')}"`, { stdio: 'inherit' });

const files = readdirSync(outDir).filter(f => f.startsWith('frame_')).sort();
console.log(`\nсохранено ${files.length} кадров в ${outDir}:`);
files.forEach(f => console.log(' ', path.join(outDir, f)));
