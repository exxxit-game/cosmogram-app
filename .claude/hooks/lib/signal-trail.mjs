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
// 25.09.2026: параметризовано под ВТОРОЕ применение — та же математика (затухающий
// вес + схождение), но для совсем другой временной шкалы. Хуки сигналят «прямо сейчас
// в этой сессии» (часы), а живая версия таблицы «симптом → частота бага»
// (RESEARCH-2026-09-SYMPTOM-FREQUENCY-DIAGNOSIS.md) должна жить неделями разработки —
// один и тот же 6-часовой период полураспада для обоих был бы математически неверен
// (комбинация из четырёх методов: дифдиагностика+Парето+Бернулли+этот след — владелец
// прямо попросил тестировать многоходовые комбинации методов учёных). Трейл по
// умолчанию (хуки) не сдвинут — обратная совместимость с уже подключёнными хуками.
//
// Используется как CLI: node signal-trail.mjs record <category> <severity 1-5> <message> [--trail=NAME] [--half-life-hours=N]
//                        node signal-trail.mjs heat [--trail=NAME] [--half-life-hours=N]
// И как модуль: import {recordSignal, computeHeat, checkConvergence} from './signal-trail.mjs'

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// .claude/hooks/lib/ -> .claude/state/
const STATE_DIR = join(__dirname, '..', '..', 'state');
const DEFAULT_HALF_LIFE_HOURS = 6; // след хуков теряет половину «яркости» за 6 часов —
// подобрано так, чтобы событие внутри одной рабочей сессии оставалось горячим

function trailPath(trail) {
  const name = trail && trail !== 'default' ? `signal-trail-${trail}.jsonl` : 'signal-trail.jsonl';
  return join(STATE_DIR, name);
}

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

// 25.09.2026, 5-компонентная комбинация (владелец: «соединяй дальше, до пяти и
// больше») — добавлена классификация Just Culture (Dekker): 'honest' (честная
// ошибка, не было прецедента) / 'atrisk' (срезал угол, знал правило) / 'violation'
// (нарушил уже написанное ABSOLUTE-правило). Три категории требуют РАЗНОГО
// обращения (уже записано в REPEAT-LOG 25.09) — значит должны быть данными, не
// смешиваться в одну кучу. Необязательный параметр — старые 3 вызова (drift/
// claim-check/secrets) не передают его и не ломаются (undefined = не классифицировано).
const JC_WEIGHT = { honest: 1, atrisk: 1.5, violation: 2 }; // нарушение весит вдвое —
// то же самое правило признаёт эскалацию обязательной, не опциональной, для violation

export function recordSignal(category, severity, message, { trail = 'default', justCulture } = {}) {
  ensureDir();
  const sev = Math.max(1, Math.min(5, Number(severity) || 1));
  const jc = ['honest', 'atrisk', 'violation'].includes(justCulture) ? justCulture : undefined;
  const entry = { ts: Date.now(), category: String(category), severity: sev, message: String(message || ''), ...(jc ? { justCulture: jc } : {}) };
  appendFileSync(trailPath(trail), JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function readEntries(trail) {
  const file = trailPath(trail);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* повреждённая строка — пропускаем, не роняем весь файл */ }
  }
  return out;
}

function decayWeight(entry, nowMs, halfLifeHours) {
  const ageHours = (nowMs - entry.ts) / 3_600_000;
  if (ageHours < 0) return 0; // часы съехали/тест с будущей меткой — не даём отрицательный вес
  const jcMult = entry.justCulture ? JC_WEIGHT[entry.justCulture] : 1; // без классификации — вес ×1
  return entry.severity * jcMult * Math.pow(0.5, ageHours / halfLifeHours);
}

// «Насколько горячо» по каждой категории и в целом — сумма затухающих весов, не просто счётчик
export function computeHeat({ now = Date.now(), trail = 'default', halfLifeHours = DEFAULT_HALF_LIFE_HOURS } = {}) {
  const entries = readEntries(trail);
  const byCategory = {};
  let total = 0;
  for (const e of entries) {
    const w = decayWeight(e, now, halfLifeHours);
    byCategory[e.category] = (byCategory[e.category] || 0) + w;
    total += w;
  }
  return { total, byCategory, entryCount: entries.length };
}

// Jidoka-эскалация: violation эскалируется ОБЯЗАТЕЛЬНО с первого раза (не опция);
// honest/atrisk — только если категория повторилась (heat выше её собственной
// одной свежей записи среднего severity) — т.е. это уже НЕ первый случай.
export function checkEscalation({ now = Date.now(), trail = 'default', halfLifeHours = DEFAULT_HALF_LIFE_HOURS } = {}) {
  const entries = readEntries(trail);
  const byCategory = {};
  for (const e of entries) {
    (byCategory[e.category] ||= []).push(e);
  }
  const result = [];
  for (const [category, list] of Object.entries(byCategory)) {
    const hasViolation = list.some(e => e.justCulture === 'violation');
    const heat = list.reduce((s, e) => s + decayWeight(e, now, halfLifeHours), 0);
    const avgSeverity = list.reduce((s, e) => s + e.severity, 0) / list.length;
    const recurred = list.length >= 2; // повторилось хотя бы раз
    const shouldEscalate = hasViolation || (recurred && heat >= avgSeverity);
    if (shouldEscalate) {
      result.push({ category, reason: hasViolation ? 'violation' : 'recurred', heat, count: list.length });
    }
  }
  return result.sort((a, b) => b.heat - a.heat);
}

// «Сошлось ли несколько РАЗНЫХ категорий рядом по времени» — сила боидов не в одном,
// а в том, что несколько независимых сработали в одном окне
export function checkConvergence({ windowHours = 2, minDistinctCategories = 2, now = Date.now(), trail = 'default' } = {}) {
  const entries = readEntries(trail);
  const windowMs = windowHours * 3_600_000;
  const recent = entries.filter(e => (now - e.ts) <= windowMs && (now - e.ts) >= 0);
  const categories = new Set(recent.map(e => e.category));
  const converged = categories.size >= minDistinctCategories;
  return { converged, distinctCategories: [...categories], windowHours, recentCount: recent.length };
}

// Топ категорий по затухающему весу, убывание — для живого рейтинга «что сейчас горячее всего»
export function rankCategories({ now = Date.now(), trail = 'default', halfLifeHours = DEFAULT_HALF_LIFE_HOURS } = {}) {
  const { byCategory } = computeHeat({ now, trail, halfLifeHours });
  return Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, heat]) => ({ category, heat }));
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (const a of args) {
    const m = a.match(/^--([a-z-]+)=(.*)$/);
    if (m) flags[m[1]] = m[2]; else rest.push(a);
  }
  return { flags, rest };
}

// CLI-обвязка
if (process.argv[1] && process.argv[1].endsWith('signal-trail.mjs')) {
  const [, , cmd, ...rawArgs] = process.argv;
  const { flags, rest } = parseFlags(rawArgs);
  const trail = flags.trail || 'default';
  const halfLifeHours = flags['half-life-hours'] ? Number(flags['half-life-hours']) : DEFAULT_HALF_LIFE_HOURS;
  if (cmd === 'record') {
    const [category, severity, ...msgParts] = rest;
    if (!category) { console.error('usage: signal-trail.mjs record <category> <severity 1-5> <message> [--trail=NAME] [--just-culture=honest|atrisk|violation]'); process.exit(1); }
    const entry = recordSignal(category, severity, msgParts.join(' '), { trail, justCulture: flags['just-culture'] });
    console.log(JSON.stringify(entry));
  } else if (cmd === 'heat') {
    const heat = computeHeat({ trail, halfLifeHours });
    const conv = checkConvergence({ trail });
    const ranked = rankCategories({ trail, halfLifeHours });
    const escalate = checkEscalation({ trail, halfLifeHours });
    console.log(JSON.stringify({ heat, convergence: conv, ranked, escalate }, null, 2));
  } else {
    console.error('usage: signal-trail.mjs record|heat ... [--trail=NAME] [--half-life-hours=N] [--just-culture=...]');
    process.exit(1);
  }
}
