#!/usr/bin/env node
/*
 * new-function-revoke-guard.mjs — 30.09.2026. PreToolUse-хук: запрос в базу (execute_sql или
 * apply_migration) создаёт функцию, но в ТОМ ЖЕ запросе не закрывает её права для PUBLIC, anon
 * и authenticated — блокируется ДО отправки в живую базу.
 *
 * Зачем: CLAUDE.md, 06.09.2026 — у проекта ALTER DEFAULT PRIVILEGES сам выдаёт anon и
 * authenticated право вызывать каждую новую функцию, а реальный грант ещё висит на псевдо-роли
 * PUBLIC. Закрытие правами «следующим шагом» уже оставляло функцию открытой (3 промаха за вечер).
 * revoke-grant-verify-guard ловит только «был REVOKE — проверь права после»; про функцию, для
 * которой REVOKE не написан вообще, он ничего не знает. Этот хук закрывает именно её.
 *
 * Для каждой функции из CREATE [OR REPLACE] FUNCTION в запросе нужна REVOKE-команда, где названа
 * эта функция и роли public, anon, authenticated (можно несколькими командами). Комментарии и
 * тела в $$...$$ и '...' перед разбором вырезаются: слово REVOKE в тексте не считается командой.
 * CREATE OR REPLACE тоже требует REVOKE: заменить может и ещё не существующую функцию, а лишняя
 * строка REVOKE безвредна (повторный запуск ничего не ломает).
 *
 * Режимы (NEW_FUNCTION_REVOKE_MODE): block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';

const REQUIRED_ROLES = ['public', 'anon', 'authenticated'];

function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); process.exit(0); }
const ok = () => out({ continue: true, suppressOutput: true });

/** Убирает комментарии, тела в $tag$...$tag$ и строки '...' — чтобы искать только настоящие команды. */
function stripNoise(sql) {
  let s = String(sql);
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/--[^\n]*/g, ' ');
  s = s.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' $$ $$ ');
  s = s.replace(/'(?:[^']|'')*'/g, " '' ");
  return s;
}

const bare = (name) => name.replace(/"/g, '').split('.').pop().toLowerCase();

/** Имена функций, которые создаёт запрос. */
function createdFunctions(clean) {
  const names = [];
  const re = /\bcreate\s+(?:or\s+replace\s+)?function\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?)/gi;
  let m;
  while ((m = re.exec(clean))) names.push(bare(m[1].replace(/\s+/g, '')));
  return names;
}

/** Для каждой функции — какие из трёх ролей закрыты REVOKE-командами, где эта функция названа. */
function revokedRoles(clean, fnName) {
  const covered = new Set();
  for (const stmt of clean.split(';')) {
    const m = stmt.match(/^\s*revoke\s+(?:all|execute)\b([\s\S]*?)\bfrom\b([\s\S]*)$/i);
    if (!m) continue;
    const target = m[1].replace(/"/g, '').toLowerCase();
    const targetsFn = new RegExp('(^|[\\s.,])' + fnName.replace(/[$]/g, '\\$') + '\\s*(\\(|,|$|\\s)').test(target);
    if (!targetsFn) continue;
    const roles = m[2].replace(/"/g, '').toLowerCase().split(/[\s,]+/).filter(Boolean);
    for (const r of REQUIRED_ROLES) if (roles.includes(r)) covered.add(r);
  }
  return covered;
}

function main() {
  const mode = (process.env.NEW_FUNCTION_REVOKE_MODE || 'block').toLowerCase();
  if (mode === 'off') ok();

  let d = {};
  try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { ok(); }
  const tool = String(d.tool_name || '');
  if (!/(execute_sql|apply_migration)$/.test(tool)) ok();

  const ti = d.tool_input || {};
  const clean = stripNoise(ti.query || ti.sql || '');
  const fns = createdFunctions(clean);
  if (!fns.length) ok();

  const problems = [];
  for (const fn of new Set(fns)) {
    const covered = revokedRoles(clean, fn);
    const missing = REQUIRED_ROLES.filter((r) => !covered.has(r));
    if (missing.length) problems.push(`${fn}: не закрыто для ${missing.join(', ')}`);
  }
  if (!problems.length) ok();

  const reason =
    `Запрос создаёт функцию, но в этом же запросе не закрывает её права: ${problems.join('; ')}.\n` +
    `У проекта новые функции автоматически открываются ролям anon и authenticated, а грант ещё висит на PUBLIC (CLAUDE.md, 06.09.2026: три промаха за вечер).\n` +
    `Добавь в ТОТ ЖЕ запрос по одной строке на функцию:\n` +
    `  revoke execute on function public.<имя>(<типы аргументов>) from public, anon, authenticated;\n` +
    `Потом (в этом же ходу) перечитай права из information_schema.role_routine_grants и проверь настоящим анонимным ключом: ждать 42501. Порядок — в скилле supabase-permissions.\n` +
    `Отключить на раз: NEW_FUNCTION_REVOKE_MODE=off`;

  if (mode === 'warn') out({ continue: true, systemMessage: reason });
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

try { main(); } catch { ok(); }
