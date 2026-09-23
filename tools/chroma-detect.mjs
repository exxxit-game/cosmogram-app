#!/usr/bin/env node
/* 23.09.2026 (владелец: «ты нихуя не сделал, я дал образец, работай с ним по-настоящему») —
   настоящий гармонический анализ аудиофайла: не темп/громкость (см. bpm-detect.mjs), а
   РЕАЛЬНЫЕ ноты/аккорды, которые там звучат. Метод: алгоритм Гёрцеля (Goertzel) — точечный
   детектор энергии на конкретной частоте, без полного FFT — считаем энергию каждой из 12
   ступеней хроматической гаммы (C,C#,D...B) по нескольким октавам сразу (сумма даёт
   «хрому», октава неважна для определения тональности/аккорда), по скользящим окнам вдоль
   всего трека. Даёт: (1) общую хрому трека → вероятная тональность (мажор/минор, корень),
   (2) хрому по 8 равным отрезкам → как меняются доминирующие ноты во времени (аккорды).
   Честная оговорка: это не нотный транскрибатор, это оценка по энергии частот — для
   плотного микса (бас+бит+пэды одновременно) может путать реальный аккорд с обертонами
   ударных, но для «в какой тональности и какие ноты доминируют» — рабочий, проверяемый метод. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: node tools/chroma-detect.mjs <audio-file> [ffmpeg-path]'); process.exit(1); }
const ffmpeg = process.argv[3] || 'ffmpeg';
const SR = 11025; // ниже, чем в bpm-detect — тут нужна точность по частоте, не по времени, экономим на скорости
const rawPath = path.join(os.tmpdir(), 'chroma-detect-' + Date.now() + '.pcm');

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteFreq(pitchClass, octave) { // C0 = MIDI 12
  const midi = 12 + octave * 12 + pitchClass;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
// Гёрцель: энергия сигнала на частоте targetFreq внутри окна samples[start..start+N)
function goertzelEnergy(samples, start, N, targetFreq, sr) {
  const k = Math.round(N * targetFreq / sr);
  const w = (2 * Math.PI / N) * k;
  const cw = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    s0 = samples[start + i] + cw * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return s1 * s1 + s2 * s2 - cw * s1 * s2;
}
function chromaVector(samples, start, N, sr) {
  const chroma = new Array(12).fill(0);
  for (let pc = 0; pc < 12; pc++) {
    for (let oct = 2; oct <= 5; oct++) { // октавы 2..5 — реальный диапазон баса/пэдов/лида в миксе
      const f = noteFreq(pc, oct);
      if (f * 2 > sr) continue; // выше половины частоты дискретизации — не считаем (Найквист)
      chroma[pc] += goertzelEnergy(samples, start, N, f, sr);
    }
  }
  return chroma;
}
function normalize(v) { const m = Math.max(...v) || 1; return v.map(x => +(x / m).toFixed(3)); }
function topNotes(chroma, n) {
  return chroma.map((v, i) => [NOTE_NAMES[i], v])
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, v]) => name + ':' + v.toFixed(2));
}
// профили мажор/минор (Крумхансл-Шмуклер, упрощённо — относительные веса ступеней от тоники)
const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function correlate(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
function guessKey(chroma) {
  let best = { score: -Infinity, root: 0, mode: 'major' };
  for (let root = 0; root < 12; root++) {
    const rotated = chroma.slice(root).concat(chroma.slice(0, root));
    const majS = correlate(rotated, MAJOR_PROFILE);
    const minS = correlate(rotated, MINOR_PROFILE);
    if (majS > best.score) best = { score: majS, root, mode: 'major' };
    if (minS > best.score) best = { score: minS, root, mode: 'minor' };
  }
  return { key: NOTE_NAMES[best.root] + ' ' + best.mode, confidence: +best.score.toFixed(3) };
}

try {
  execFileSync(ffmpeg, ['-y', '-i', inPath, '-ac', '1', '-ar', String(SR), '-f', 's16le', rawPath], { stdio: 'pipe' });
  const buf = fs.readFileSync(rawPath);
  const n = buf.length / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(i * 2) / 32768;

  const winSamples = Math.floor(SR * 1.5); // 1.5с окно — достаточно для низких нот баса, не слишком долгое для смены аккорда

  // --- общая хрома всего трека (пропускаем окна, не подряд — экономим время) ---
  const globalChroma = new Array(12).fill(0);
  let winCount = 0;
  for (let start = 0; start + winSamples < n; start += winSamples * 4) {
    const c = chromaVector(samples, start, winSamples, SR);
    for (let i = 0; i < 12; i++) globalChroma[i] += c[i];
    winCount++;
  }
  const globalNorm = normalize(globalChroma);
  const key = guessKey(globalChroma);

  // --- хрома по 8 равным отрезкам — смена доминирующих нот во времени (аккорды) ---
  const segCount = 8;
  const segLen = Math.floor(n / segCount);
  const segments = [];
  for (let s = 0; s < segCount; s++) {
    const segStart = s * segLen;
    const c = chromaVector(samples, segStart, Math.min(winSamples, segLen), SR);
    segments.push({ seg: s, topNotes: topNotes(c, 4) });
  }

  console.log(JSON.stringify({
    estimatedKey: key,
    globalChromaNormalized: NOTE_NAMES.map((n, i) => n + ':' + globalNorm[i]),
    topNotesOverall: topNotes(globalChroma, 6),
    chordProgressionBySegment: segments,
    note: 'Метод Гёрцеля по энергии частот, не нотный транскрибатор — доминирующие ступени, не гарантированно точный аккорд нота-в-ноту, особенно в плотном миксе.'
  }, null, 2));
} finally {
  try { fs.unlinkSync(rawPath); } catch {}
}
