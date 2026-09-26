#!/usr/bin/env node
/*
 * check-guard-mjs-invocation.mjs — 26.09.2026. Вынесено из guard-full-suite-warn.sh
 * ПОСЛЕ того, как инлайновый `node -e "..."` внутри двойных кавычек bash сломал
 * собственный regex (bash внутри "..." схлопывает \\ в один \, [\/\\] превращался
 * в [\/\], незакрытый класс символов — SyntaxError на каждом вызове). Отдельный
 * файл убирает саму возможность этого класса бага — та же логика, что уже
 * применена к остальным hook'ам этого вечера (не инлайнить нетривиальный JS в
 * bash-строку).
 *
 * Читает stdin (тот же PreToolUse JSON), печатает три строки: tool_name,
 * shouldBlock(1/0), run_in_background(1/0) — bash-обвязка их читает как раньше.
 */
import fs from 'node:fs';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let j;
  try {
    j = JSON.parse(readStdin() || '{}');
  } catch {
    process.stdout.write('\n0\n0\n');
    return;
  }
  const cmd = (j.tool_input && j.tool_input.command) || '';
  const bg = !!(j.tool_input && j.tool_input.run_in_background);

  const tokens = cmd.split(/\s+/).map((t) => t.replace(/^['"]|['"]$/g, ''));
  const basename = (t) => {
    const parts = t.split(/[/\\]/);
    return parts[parts.length - 1] || '';
  };
  const isNodeTok = (t) => t === 'node' || basename(t).toLowerCase() === 'node' || basename(t).toLowerCase() === 'node.exe';
  const isGuardMjsTok = (t) => basename(t).toLowerCase() === 'guard.mjs';

  // 26.09.2026, найдено живьём В ЭТОЙ ЖЕ НОЧИ ещё раз (второй слой того же класса
  // бага): "node" и "guard.mjs" оба встречаются ГДЕ УГОДНО в длинной команде (типичный
  // случай — текст коммита, описывающий именно этот баг, содержит оба слова в разных,
  // не связанных предложениях) — недостаточно проверять "встречается ли каждое хоть
  // где-то", нужно "идёт ли guard.mjs СРАЗУ ПОСЛЕ node как аргумент запуска" (пропуская
  // флаги вида -e/--foo между ними, реальный вызов может быть "node --experimental-x
  // tests/guard.mjs").
  let realInvocation = false;
  for (let i = 0; i < tokens.length; i++) {
    if (!isNodeTok(tokens[i])) continue;
    for (let j = i + 1; j < tokens.length && j <= i + 4; j++) {
      if (tokens[j].startsWith('-')) continue; // флаг node самого — пропускаем, ищем дальше
      if (isGuardMjsTok(tokens[j])) realInvocation = true;
      break; // первый не-флаговый токен после node — это и есть скрипт; дальше не ищем
    }
    if (realInvocation) break;
  }
  const shouldBlock = realInvocation && !cmd.includes('--only=');

  process.stdout.write(`${j.tool_name || ''}\n${shouldBlock ? '1' : '0'}\n${bg ? '1' : '0'}\n`);
}

main();
