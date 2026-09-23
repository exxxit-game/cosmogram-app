#!/usr/bin/env node
/* 23.09.2026 (владелец: «сделай для себя инструмент», работа над музыкой по образцу
   Worakls — Salzburg) — честный, вычислительный оценщик темпа (BPM) и профиля громкости
   по времени для любого аудиофайла. Не заменяет реальное прослушивание (у ИИ его нет), но
   даёт проверяемые числа вместо гадания на слух — тот же принцип, что уже действует для
   формул/геометрии в проекте («проверь численно»), применённый к звуку.

   Метод: decode -> mono PCM -> огибающая энергии по окнам (RMS, 20мс) -> onset (только
   РОСТ энергии = атака нового звука) -> автокорреляция по задержкам, соответствующим
   70-180 BPM -> пик автокорреляции = вероятный темп. Тот же класс приёма, что у librosa/
   essentia (упрощённо, без внешних npm-пакетов — только child_process+fs, нужен только
   системный ffmpeg, ставится через Scoop: `scoop install ffmpeg`).

   Честная оговорка метода: автокорреляция по энергии — не эталонный BPM-детектор, может
   поймать половинный/двойной темп (классическая ловушка) — сверять с ожидаемым диапазоном
   жанра, не брать слепо.

   Использование:
     node tools/bpm-detect.mjs <путь-к-аудиофайлу> [путь-к-ffmpeg.exe]
   Пример (Worakls — Salzburg дал durationSec:363.1, estimatedBPM:128,
   energyProfile10Segments показал тихий старт → разгон к середине → спад к концу): */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: node tools/bpm-detect.mjs <audio-file> [ffmpeg-path]'); process.exit(1); }
const ffmpeg = process.argv[3] || 'ffmpeg';
const SR = 22050; // хватает для темпа/энергии, не для тонального анализа
const rawPath = path.join(os.tmpdir(), 'bpm-detect-' + Date.now() + '.pcm');

try {
  execFileSync(ffmpeg, ['-y', '-i', inPath, '-ac', '1', '-ar', String(SR), '-f', 's16le', rawPath], { stdio: 'pipe' });

  const buf = fs.readFileSync(rawPath);
  const n = buf.length / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(i * 2) / 32768;

  const durationSec = n / SR;

  // --- окна энергии (RMS), шаг 20мс ---
  const winSec = 0.02;
  const winLen = Math.floor(SR * winSec);
  const numWin = Math.floor(n / winLen);
  const energy = new Float32Array(numWin);
  for (let w = 0; w < numWin; w++) {
    let sum = 0;
    const start = w * winLen;
    for (let i = 0; i < winLen; i++) { const s = samples[start + i]; sum += s * s; }
    energy[w] = Math.sqrt(sum / winLen);
  }

  // --- профиль громкости по времени (10 сегментов) — видно, разгоняется трек или ровный ---
  const segCount = 10;
  const segLen = Math.floor(numWin / segCount);
  const energyProfile = [];
  for (let s = 0; s < segCount; s++) {
    let sum = 0, cnt = 0;
    for (let w = s * segLen; w < (s + 1) * segLen && w < numWin; w++) { sum += energy[w]; cnt++; }
    energyProfile.push(+(sum / cnt).toFixed(4));
  }

  // --- onset envelope: положительная разница энергии (только рост = атака) ---
  const onset = new Float32Array(numWin);
  for (let w = 1; w < numWin; w++) onset[w] = Math.max(0, energy[w] - energy[w - 1]);

  // --- автокорреляция по задержкам, соответствующим 70..180 BPM ---
  const winPerSec = 1 / winSec;
  function lagForBpm(bpm) { return Math.round(winPerSec * 60 / bpm); }
  let bestBpm = 0, bestScore = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = lagForBpm(bpm);
    if (lag < 1 || lag >= numWin) continue;
    let sum = 0, cnt = 0;
    for (let w = 0; w + lag < numWin; w++) { sum += onset[w] * onset[w + lag]; cnt++; }
    const score = cnt ? sum / cnt : 0;
    if (score > bestScore) { bestScore = score; bestBpm = bpm; }
  }

  console.log(JSON.stringify({
    durationSec: +durationSec.toFixed(1),
    estimatedBPM: bestBpm,
    autocorrelationScore: +bestScore.toFixed(6),
    energyProfile10Segments: energyProfile,
    note: 'BPM — оценка автокорреляцией по огибающей атак, не эталон (можно словить полу/двойной темп). energyProfile — относительная громкость по 10 равным долям трека.'
  }, null, 2));
} finally {
  try { fs.unlinkSync(rawPath); } catch {}
}
