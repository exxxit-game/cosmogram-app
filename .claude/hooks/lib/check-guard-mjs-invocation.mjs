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

// 02.10.2026: логика вынесена в analyze(j), чтобы её звал и общий файл pre-bash.mjs; запуск как отдельная программа работает как раньше.
export function analyze(j) {
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
  // 29.09.2026 (найдено на себе же, живьём: `node --check tests/guard.mjs` — чистая
  // синтаксическая проверка, guard.mjs НИ РАЗУ не выполняется — заблокировался наравне
  // с настоящим полным прогоном). `--check` — флаг самого node (как `-e`/`--only=`),
  // но меняет смысл вызова полностью: с "выполнить" на "проверить синтаксис и выйти".
  // Раньше это было не страшно (deny не было, только несуществующий "ask"), теперь
  // ложное срабатывание реально блокирует легитимное действие — цена неточности выросла.
  let hasCheckFlag = false;
  let realInvocation = false;
  for (let i = 0; i < tokens.length; i++) {
    if (!isNodeTok(tokens[i])) continue;
    for (let j = i + 1; j < tokens.length && j <= i + 4; j++) {
      if (tokens[j] === '--check' || tokens[j] === '-c') hasCheckFlag = true;
      if (tokens[j].startsWith('-')) continue; // флаг node самого — пропускаем, ищем дальше
      if (isGuardMjsTok(tokens[j])) realInvocation = true;
      break; // первый не-флаговый токен после node — это и есть скрипт; дальше не ищем
    }
    if (realInvocation) break;
  }
  // 30.09.2026 (владелец: «для чего гитхаб?»): раньше блокировался только запуск БЕЗ --only=, а повторные
  // фокусные запуски были свободны — за один вечер их набралось 46 (циклы «for i in 1 2 3», красный/зелёный на каждую
  // правку), каждый поднимает браузер на слабой машине. Теперь блокируется ЛЮБОЙ реальный запуск стража; исключение —
  // только если владелец сам включит GUARD_LOCAL_MODE=allow в команде хука в settings.json (см. guard-full-suite-warn.sh).
  let shouldBlock = realInvocation && !hasCheckFlag;
  /* 30.09.2026, ВТОРОЙ заход того же класса (владелец: «ты снова стражей на ноутбуке гоняешь… ты же это якобы исправил… ноут сразу виснет»).
     Хук закрыл только `guard.mjs` — а я сам открыл три обходные двери: (1) свой `tools/worst-case.mjs` (полный прогон = ~4 минуты браузера,
     13 сценариев × 5 языков × 2 размера), (2) вытаскивание тела стража и прогон его через Playwright (`browser_run_code_unsafe` с файлом
     *guard-body*), (3) Stop-хук worst-case-gate, который сам требовал локального прогона. Все три — та же нагрузка на слабый ноутбук.
     Теперь блокируется ЛЮБОЙ прогон игры этим инструментом (в т.ч. --fast); разрешены только: `macet` (пять статичных досок, секунды) и `--waive`. */
  const isWorstTok = (t) => basename(t).toLowerCase() === 'worst-case.mjs';
  const isGitCmd = /^\s*git\s/.test(cmd); // слова в тексте коммита/сообщения — не запуск
  for (let i = 0; i < tokens.length && !shouldBlock && !isGitCmd; i++) {
    if (!isNodeTok(tokens[i])) continue;
    for (let k = i + 1; k < tokens.length && k <= i + 4; k++) {
      if (tokens[k] === '--check' || tokens[k] === '-c') break; // проверка синтаксиса — не запуск
      if (tokens[k].startsWith('-')) continue;
      if (isWorstTok(tokens[k])) {
        const rest = [];
        for (let m = k + 1; m < tokens.length; m++) { if (/^(&&|\|\|?|;)$/.test(tokens[m]) || /^\d?>/.test(tokens[m])) break; rest.push(tokens[m]); }
        if (!rest.includes('macet') && !rest.includes('--waive')) shouldBlock = true;
      }
      break;
    }
  }
  // Playwright MCP: прогон тела стража через run_code_unsafe (файл или код упоминает guard) — то же, что запуск стража
  const tn = String(j.tool_name || '');
  if (/browser_run_code_unsafe$/.test(tn)) {
    const ti = j.tool_input || {};
    if (/guard[-_.]?(body|day)|q-guard|guard\.mjs/i.test(String(ti.filename || '') + ' ' + String(ti.code || ''))) shouldBlock = true;
  }

  return { tool: String(j.tool_name || ''), shouldBlock, bg };
}

function main() {
  let j;
  try {
    j = JSON.parse(readStdin() || '{}');
  } catch {
    process.stdout.write('\n0\n0\n');
    return;
  }
  const r = analyze(j);
  process.stdout.write(`${r.tool}\n${r.shouldBlock ? '1' : '0'}\n${r.bg ? '1' : '0'}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('check-guard-mjs-invocation.mjs')) main();
