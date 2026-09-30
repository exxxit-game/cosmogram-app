#!/usr/bin/env node
/*
 * claudemd-rule-mechanism-guard.mjs — 30.09.2026. PostToolUse на Edit/MultiEdit/Write: в CLAUDE.md
 * добавлен НОВЫЙ пункт-правило («- …»), а в нём нет строки «Механизм:» — exit 2, запись недоделана.
 *
 * Зачем: правило в CLAUDE.md, которое ничто не исполняет, — то же самое «просто запись»:
 * 2 случая, когда в CLAUDE.md попало правило без проверки (владелец 30.09 назвал это пунктом 5
 * своего списка) и порог «механизм с первой записи» (feedback-needs-mechanism-guard делает то же
 * для файлов памяти feedback_*.md). Выбор владельца (окно выбора 30.09): требуется строка «Механизм:».
 *
 * Что считается механизмом: после слов «Механизм:» есть текст — какой хук/страж/код и где это
 * исполняет, либо честно «Механизм: нет — потому что …». Пустое «Механизм:» не считается.
 * Что НЕ проверяет: правдивость строки. Пункты, чья первая строка уже была в файле (правка тела
 * старого правила), новыми не считаются. Write сравнивается с версией из git (HEAD); нет git или
 * файла в HEAD — проверка пропускается.
 *
 * Режимы (CLAUDE_MD_RULE_MODE): block (по умолчанию) | warn | off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MECH_RE = /Механизм:(\*\*)?[ \t]*[^\s*]/;

/** Пункты верхнего уровня: строка «- …» и все следующие за ней строки с отступом. */
function bulletBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^- /.test(line)) { cur = { first: line.trim(), body: line }; blocks.push(cur); }
    else if (cur && /^[ \t]+\S/.test(line)) cur.body += '\n' + line;
    else cur = null;
  }
  return blocks;
}

/** Новые пункты без механизма: первая строка которых не встречалась в старом тексте. */
function newRulesWithoutMechanism(oldText, newText) {
  const known = new Set(bulletBlocks(oldText).map((b) => b.first));
  return bulletBlocks(newText).filter((b) => !known.has(b.first) && !MECH_RE.test(b.body));
}

function gitHead(file) {
  try {
    return execFileSync('git', ['-C', path.dirname(file), 'show', 'HEAD:./' + path.basename(file)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

function main() {
  const mode = (process.env.CLAUDE_MD_RULE_MODE || 'block').toLowerCase();
  if (mode === 'off') return 0;

  let d; try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  const tool = String(d.tool_name || '');
  const ti = d.tool_input || {};
  const file = String(ti.file_path || '').replace(/\\/g, '/');
  if (path.posix.basename(file) !== 'CLAUDE.md') return 0;

  let bad = [];
  if (tool === 'Edit') {
    bad = newRulesWithoutMechanism(ti.old_string || '', ti.new_string || '');
  } else if (tool === 'MultiEdit') {
    for (const e of Array.isArray(ti.edits) ? ti.edits : []) bad.push(...newRulesWithoutMechanism(e.old_string || '', e.new_string || ''));
  } else if (tool === 'Write') {
    const head = gitHead(file);
    if (head === null) return 0;
    let disk; try { disk = fs.readFileSync(file, 'utf8'); } catch { disk = String(ti.content || ''); }
    bad = newRulesWithoutMechanism(head, disk);
  } else return 0;

  if (!bad.length) return 0;
  const list = bad.map((b) => '  • ' + b.first.slice(0, 110)).join('\n');
  console.error(
    `❌ claudemd-rule-mechanism-guard: в CLAUDE.md добавлено правило без строки «Механизм:»:\n${list}\n` +
    `  Правило, которое ничто не исполняет, — просто запись (владелец, 30.09.2026).\n` +
    `  Допиши в пункт строку:  **Механизм:** <какой хук/страж/код и где исполняет это автоматически>\n` +
    `  либо честно:  **Механизм:** нет — потому что <причина>  (и владелец это увидит).\n` +
    `  Отключить на раз: CLAUDE_MD_RULE_MODE=warn или =off`);
  return mode === 'warn' ? 0 : 2;
}

let code = 0;
try { code = main(); } catch { code = 0; }
process.exit(code);
