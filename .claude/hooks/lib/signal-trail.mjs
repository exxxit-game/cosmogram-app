#!/usr/bin/env node
// 25.09.2026 (владелец: «подойди к этой задаче так же, как к 189 независимо движущимся
// объектам» — отсылка к игровой системе с множеством независимых частиц). Перенос двух
// реальных источников: Boids (Reynolds 1986, en.wikipedia.org/wiki/Boids — сложное
// согласованное поведение БЕЗ центрального диспетчера, из простых локальных правил) и
// стигмергия (Grassé, sciencedirect.com/topics/engineering/stigmergy — муравьи оставляют
// феромонный след в общей среде; след ЗАТУХАЕТ со временем, свежий/частый путь ярче
// старого одиночного).
//
// Сейчас каждый хук в .claude/hooks/ — изолированный «боид»: знает только свою узкую
// локальную проверку, ничего не знает про остальные, а его предупреждение либо забывается
// сразу, либо живёт вечно наравне со свежим (REPEAT-LOG). Этот модуль — общая «среда»:
// любой хук может оставить метку (record), а любой другой (или отчётный скрипт) может
// спросить «насколько горячо сейчас» (heat) и «сошлось ли НЕСКОЛЬКО разных меток близко
// по времени» (convergence) — сигнал сильнее любого одного хука поодиночке, без того чтобы
// хуки знали друг про друга напрямую.
//
// Используется как CLI: node signal-trail.mjs record <category> <severity 1-5> <message>
//                        node signal-trail.mjs heat [--window-hours=N]
// И как модуль: import {recordSignal, computeHeat, checkConvergence} from './signal-trail.mjs'

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .claude/hooks/lib/ -> .claude/state/signal-trail.jsonl
const STATE_DIR = join(__dirname, '..', '..', 'state');
const TRAIL_FILE = join(STATE_DIR, 'signal-trail.jsonl');
const HALF_LIFE_HOURS = 6; // след теряет половину «яркости» за 6 часов — подобрано так,
// чтобы событие внутри одной рабочей сессии оставалось горячим, а вчерашнее — почти не влияло

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function recordSignal(category, severity, message) {
  ensureDir();
  const sev = Math.max(1, Math.min(5, Number(severity) || 1));
  const entry = { ts: Date.now(), category: String(category), severity: sev, message: String(message || '') };
  appendFileSync(TRAIL_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function readEntries() {
  if (!existsSync(TRAIL_FILE)) return [];
  const lines = readFileSync(TRAIL_FILE, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* повреждённая строка — пропускаем, не роняем весь файл */ }
  }
  return out;
}

function decayWeight(entry, nowMs) {
  const ageHours = (nowMs - entry.ts) / 3_600_000;
  if (ageHours < 0) return 0; // часы съехали/тест с будущей меткой — не даём отрицательный вес
  return entry.severity * Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

// «Насколько горячо» по каждой категории и в целом — сумма затухающих весов, не просто счётчик
export function computeHeat({ now = Date.now() } = {}) {
  const entries = readEntries();
  const byCategory = {};
  let total = 0;
  for (const e of entries) {
    const w = decayWeight(e, now);
    byCategory[e.category] = (byCategory[e.category] || 0) + w;
    total += w;
  }
  return { total, byCategory, entryCount: entries.length };
}

// «Сошлось ли несколько РАЗНЫХ категорий рядом по времени» — сила боидов не в одном,
// а в том, что несколько независимых сработали в одном окне
export function checkConvergence({ windowHours = 2, minDistinctCategories = 2, now = Date.now() } = {}) {
  const entries = readEntries();
  const windowMs = windowHours * 3_600_000;
  const recent = entries.filter(e => (now - e.ts) <= windowMs && (now - e.ts) >= 0);
  const categories = new Set(recent.map(e => e.category));
  const converged = categories.size >= minDistinctCategories;
  return { converged, distinctCategories: [...categories], windowHours, recentCount: recent.length };
}

// CLI-обвязка
if (process.argv[1] && process.argv[1].endsWith('signal-trail.mjs')) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'record') {
    const [category, severity, ...msgParts] = rest;
    if (!category) { console.error('usage: signal-trail.mjs record <category> <severity 1-5> <message>'); process.exit(1); }
    const entry = recordSignal(category, severity, msgParts.join(' '));
    console.log(JSON.stringify(entry));
  } else if (cmd === 'heat') {
    const heat = computeHeat({});
    const conv = checkConvergence({});
    console.log(JSON.stringify({ heat, convergence: conv }, null, 2));
  } else {
    console.error('usage: signal-trail.mjs record|heat ...');
    process.exit(1);
  }
}
