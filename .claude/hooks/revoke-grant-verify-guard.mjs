#!/usr/bin/env node
/*
 * revoke-grant-verify-guard.mjs — 29.09.2026, механизация ABSOLUTE-правила CLAUDE.md
 * (06.09.2026, «REVOKE/GRANT — success:true не значит, что права легли туда, куда
 * думал»): та же схема REVOKE, что казалась рабочей, реально осела на псевдо-роли
 * PUBLIC, а не на конкретных ролях — обнаружено только потому, что права ПЕРЕЧИТАЛИ
 * заново из information_schema, не поверили статусу выполнения команды. До этого
 * хука правило держалось только на памяти в моменте — claim-check-hook.mjs уже
 * требует СЯКУЮ запись после execute_sql (см. его же комментарий про REVOKE/GRANT),
 * но не проверяет, что проверка была ИМЕННО перечитыванием реальных прав, а не
 * просто «я посмотрел на success:true и поверил».
 *
 * Механика: Stop-хук. В текущем ходу (от последней настоящей пользовательской
 * реплики) ищем execute_sql-вызовы, чей SQL содержит REVOKE или GRANT. Если такой
 * есть — требуем, чтобы ПОЗЖЕ в этом же ходу был ещё один execute_sql, чей SQL
 * похож на перечитывание реальных прав (information_schema.role_*_grants,
 * has_function_privilege, has_table_privilege, aclexplode). Нет такого — блок.
 *
 * Тот же класс поведения, что claim-check-hook.mjs (transcript-скан с начала хода),
 * не переизобретено с нуля — используется тот же read-transcript-tail.mjs.
 *
 * Режимы (REVOKE_GRANT_VERIFY_ENFORCE_MODE): warn (по умолчанию) | block | off
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let readTail;
{
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'read-transcript-tail.mjs');
  ({ readTail } = await import(pathToFileURL(modPath).href));
}

const DEFAULT_MODE = 'warn';
const REVOKE_GRANT_RE = /\b(REVOKE|GRANT)\b/i;
const VERIFY_RE = /(information_schema\.role_\w+_grants|has_function_privilege|has_table_privilege|aclexplode)/i;

function emitOk() {
  process.stdout.write('{"continue": true, "suppressOutput": true}\n');
  process.exit(0);
}
function emitWarn(msg) {
  process.stdout.write(JSON.stringify({ continue: true, systemMessage: msg }) + '\n');
  process.exit(0);
}
function emitBlock(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
  process.exit(0);
}

function isRealUserTurn(entry) {
  if (!entry || entry.type !== 'user') return false;
  const content = entry.message && entry.message.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  return content.every((b) => b && b.type !== 'tool_result');
}

function sqlOf(input) {
  return String((input && (input.query || input.sql)) || '');
}

// Возвращает {hadRevokeGrant, hadVerifyAfter} — порядок важен: проверочный запрос
// должен идти ПОСЛЕ последнего REVOKE/GRANT, не просто где-то в ходу (та же логика,
// что уже применена в claim-check-hook.mjs для дорогих вызовов).
function scanTurn(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return { hadRevokeGrant: false, hadVerifyAfter: false };
  let lines;
  try {
    lines = readTail(transcriptPath).split('\n');
  } catch {
    return { hadRevokeGrant: false, hadVerifyAfter: false };
  }
  const entries = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch { /* обрубленная хвостом строка */ }
  }
  let turnStart = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealUserTurn(entries[i])) {
      turnStart = i;
      break;
    }
  }
  let lastRevokeGrantIdx = -1;
  let hadVerifyAfter = false;
  let seq = 0;
  const calls = [];
  for (let i = turnStart; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== 'assistant') continue;
    const content = e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || b.type !== 'tool_use') continue;
      // 30.09.2026: REVOKE/GRANT в apply_migration тоже надо перечитывать, но проверкой служит только чтение через execute_sql.
      const isSql = /__execute_sql$/.test(b.name || '');
      if (!isSql && !/__apply_migration$/.test(b.name || '')) continue;
      const sql = sqlOf(b.input);
      calls.push({ seq, isRevokeGrant: REVOKE_GRANT_RE.test(sql), isVerify: isSql && VERIFY_RE.test(sql) });
      seq++;
    }
  }
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].isRevokeGrant) lastRevokeGrantIdx = i;
  }
  if (lastRevokeGrantIdx === -1) return { hadRevokeGrant: false, hadVerifyAfter: false };
  for (let i = lastRevokeGrantIdx + 1; i < calls.length; i++) {
    if (calls[i].isVerify) { hadVerifyAfter = true; break; }
  }
  return { hadRevokeGrant: true, hadVerifyAfter };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const mode = (process.env.REVOKE_GRANT_VERIFY_ENFORCE_MODE || DEFAULT_MODE).toLowerCase();
  if (mode === 'off') emitOk();

  let hookData;
  try {
    hookData = JSON.parse(readStdin() || '{}');
  } catch {
    emitOk();
  }
  if (hookData.stop_hook_active === true) emitOk();

  const { hadRevokeGrant, hadVerifyAfter } = scanTurn(hookData.transcript_path);
  if (!hadRevokeGrant || hadVerifyAfter) emitOk();

  const reason =
    `⚠️  REVOKE/GRANT без перечитывания реальных прав после — в этом ходу был execute_sql\n` +
    `с REVOKE или GRANT, но ни один более поздний execute_sql не похож на проверку\n` +
    `(information_schema.role_*_grants / has_function_privilege / has_table_privilege /\n` +
    `aclexplode). CLAUDE.md, 06.09.2026: «success:true не значит, что права легли туда,\n` +
    `куда думал» — реальный случай, REVOKE от конкретных ролей не подействовал, потому\n` +
    `что грант реально висел на псевдо-роли PUBLIC.\n\n` +
    `Перед завершением хода: выполни execute_sql, читающий реальные права\n` +
    `(information_schema.role_routine_grants или role_table_grants) для затронутого\n` +
    `объекта, и сверь результат с тем, что предполагалось.\n\n` +
    `Отключить на раз: REVOKE_GRANT_VERIFY_ENFORCE_MODE=warn или =off`;

  if (mode === 'warn') emitWarn(reason);
  emitBlock(reason);
}

try {
  main();
} catch {
  emitOk();
}
