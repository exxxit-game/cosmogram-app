#!/usr/bin/env node
/*
 * pre-bash.mjs — 02.10.2026 (владелец: «хуки по смыслу одинаковые, надо объединить»). Один запуск на каждую Bash-команду вместо шести
 * отдельных (раньше: version-guard.sh, bash-safety-guard.sh, no-broad-git-add.sh, no-secrets-in-commit.sh, guard-full-suite-warn.sh,
 * tool-usage-read-guard.mjs; каждый .sh на Windows запускал bash и ещё node, 0,5–1,2 с). Правила перенесены без изменений, старые файлы
 * лежат рядом и не подключены (откат: вернуть их команды в settings.json).
 *
 * Порядок: первое совпадение сразу даёт отказ. Проверки:
 *  1) двойной фон (run_in_background и завершающий &)   2) redirect в C:\...   3) taskkill /IM
 *  4) git add -A / . / --all / корень репо   5) git commit игровых файлов без GAME_VERSION   6) секреты в застейдженном diff
 *  7) запуск стража и полный worst-case на ноутбуке (то же для mcp browser_run_code_unsafe)   8) node tools/ИМЯ.mjs без чтения файла
 *  9) английское описание команды (было в наборе 13.09, возвращено 02.10).
 * Переключатели владельца (правкой команды этого хука в settings.json): GUARD_LOCAL_MODE=allow, TOOL_USAGE_READ_MODE=off|warn.
 * Тесты ставят GUARD_HOOK_TEST=1 и SIGNAL_TRAIL_DIR, чтобы не писать в живой журнал.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = (f) => import(pathToFileURL(path.join(here, 'lib', f)).href);
const { analyze } = await lib('check-guard-mjs-invocation.mjs');
const { evaluate: readGuard } = await import(pathToFileURL(path.join(here, 'tool-usage-read-guard.mjs')).href);
let recordSignal = () => {};
try { ({ recordSignal } = await lib('signal-trail.mjs')); } catch { /* журнал необязателен */ }

const deny = (reason) => { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }) + '\n'); process.exit(0); };
const trail = (cat, sev, msg, opts) => { try { recordSignal(cat, sev, msg, opts); } catch { /* журнал необязателен */ } };
const git = (args, cwd) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

let d = {};
try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const tool = String(d.tool_name || '');
const ti = d.tool_input || {};
const cwd = d.cwd || process.cwd();
const raw = String(ti.command || '');
const cmdNl = raw.replace(/\n/g, '\\n');   // переводы строк экранированы (для проверок, привязанных к концу строки)
const cmd = raw.replace(/\n/g, ' ');       // переводы строк схлопнуты в пробел

// 7) страж на ноутбуке: Bash и mcp browser_run_code_unsafe
if ((tool === 'Bash' || /browser_run_code_unsafe$/.test(tool)) && process.env.GUARD_LOCAL_MODE !== 'allow') {
  const r = analyze(d);
  if (r.shouldBlock) {
    if (!process.env.GUARD_HOOK_TEST) trail('guard-full-suite-attempt', 3, 'попытка запуска стража локально', { trail: 'rules', justCulture: 'atrisk' });
    deny('ЗАПРЕЩЕНО: любой запуск стража (guard.mjs, в том числе с --only= и циклом), полный прогон tools/worst-case.mjs (в т.ч. --fast) и прогон тела стража через Playwright на локальной машине владельца («ноут сразу виснет»). Правило владельца 30.09.2026: «для чего гитхаб?» — за один вечер набралось 46 локальных запусков, каждый поднимает браузер на слабом ноутбуке. Красный/зелёный/×3 идут ТОЛЬКО на GitHub Actions (cosmogram-crew/.github/workflows/guard.yml): после push сам, или владелец вручную через workflow_dispatch. Разрешить локально может только владелец, правкой команды этого хука в settings.json (GUARD_LOCAL_MODE=allow). node --check по файлу стража разрешён.');
  }
}
if (tool !== 'Bash') process.exit(0);

// 9) английское описание (поле description у Bash-вызова)
{
  const desc = String(ti.description || '');
  if (desc) {
    const cyr = (desc.match(/[а-яёА-ЯЁ]/g) || []).length, lat = (desc.match(/[A-Za-z]/g) || []).length;
    if (cyr === 0 && lat >= 8) deny('Поле description похоже на английскую прозу (' + lat + ' латинских букв, 0 кириллических): "' + desc.slice(0, 80) + '". feedback_always_russian.md — ABSOLUTE, уже 6 раз повторялось именно в этом поле (короткая метка, заполняется рефлекторно в плотной серии технических вызовов). Перепиши description по-русски.');
  }
}

// 1) двойной фон
if (ti.run_in_background && /[^&]&\s*(#.*)?$/.test(cmdNl)) {
  deny('Команда уже помечена run_in_background:true, а сама строка ЕЩЁ РАЗ заканчивается на & — это двойной фон: харнесс рапортует «завершено» почти сразу, а настоящий процесс живёт независимо и не отслеживается. Убери завершающий & из самой команды (харнесс уже фонит её целиком), redirect (> log 2>&1) можно оставить.');
}
// 2) redirect в C:\...
if (/>\s*["']?[A-Za-z]:\\/.test(cmd)) {
  trail('windows-path-redirect', 2, '> C:\\... вместо /c/...', { trail: 'rules', justCulture: 'atrisk' });
  deny('Redirect (>/>>) целится в путь вида C:\\... — в Git Bash это дважды (14.09.2026) тихо создавало мусорный файл C:tmpXXX прямо в текущей папке вместо реального пути, без единой ошибки. Используй прямые слэши: /c/tmp/... вместо C:\\tmp\\...');
}
// 3) taskkill /IM
{
  const low = cmd.toLowerCase();
  if (!/^\s*git\s+commit/.test(low) && low.includes('taskkill') && low.includes('/im')) {
    deny('taskkill по имени образа (/IM) может задеть ВСЕ процессы этого имени разом — для claude.exe/node.exe это соседние сессии и вкладки владельца, риск уронить всё приложение (feedback_close_tools_when_done.md, 07.09.2026). Убивать только конкретный, заранее подтверждённый /PID.');
  }
}
// 4) широкий git add
if (/(^|[;&|]) *git +add +(-A\b|--all\b|["']?\.\/?["']?( |$)|-["']?\.\/?["']?( |$))/.test(cmdNl)) {
  deny('git add -A/--all/. добавляет всё накопившееся в рабочем дереве, не осознанный список — правило CLAUDE.md. Укажи конкретные файлы по имени (git add path/to/file1 path/to/file2).');
}
if (/(^|[;&|]) *git +add\b/.test(cmdNl)) {
  const root = git(['rev-parse', '--show-toplevel'], cwd).trim();
  if (root) {
    const esc = root.replace(/[.[\]*^$/\\+?(){}|]/g, '\\$&');
    if (new RegExp('git +add +["\']?' + esc + '/?["\']?( |$)').test(cmdNl)) deny('git add с полным путём до корня репозитория — то же самое, что git add -A, просто другим текстом. Укажи конкретные файлы по имени.');
  }
}
// 5) коммит игровых файлов без поднятия версии (как раньше: только команда, НАЧИНАЮЩАЯСЯ с «git commit»)
if (raw.startsWith('git commit')) {
  const staged = git(['diff', '--cached', '--name-only'], cwd).split('\n');
  const GAME = ['js/core.js', 'js/game.js', 'js/render.js', 'js/input.js', 'js/ach.js', 'js/skymail.js', 'js/blackbox.js', 'js/card.js', 'js/forge.js', 'js/goldstar.js', 'js/gyro.js', 'js/music.js', 'js/planetarium.js', 'js/star.js', 'js/sync.js', 'js/ui.js', 'js/i18n.js', 'index.html', 'sw.js'];
  if (GAME.some((f) => staged.includes(f))) {
    const verTouched = git(['diff', '--cached', '--', 'js/core.js'], cwd).split('\n').filter((l) => /GAME_VERSION\s*=/.test(l)).length;
    if (verTouched === 0) deny('Закон К10: в этом коммите меняются игровые файлы, а GAME_VERSION (js/core.js) не тронута. Адрес модуля (?v=) не сменится — браузер вправе отдать старый кэш. Сначала поднять версию в трёх местах (sw.js const V, js/core.js GAME_VERSION, все ?v= в index.html — tools/bump-version.mjs), потом коммит.');
  }
}
// 6) секреты в застейдженном diff (любой git commit в составной строке, git -C, commit -a)
if (/(^|[;&|]\s*)git(\s+-[cC]\s+\S+)*\s+commit(\s|$)/.test(cmdNl)) {
  const mC = cmdNl.match(/git\s+-C\s+(\S+)/);
  const dir = mC ? mC[1].replace(/["']/g, '') : cwd;
  const all = /commit[^;&|]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)(\s|$)/.test(cmdNl);
  const diff = git(all ? ['diff', 'HEAD'] : ['diff', '--cached'], dir);
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  const pats = [
    [/AKIA[0-9A-Z]{16}/, 'AWS Access Key ID'], [/-----BEGIN[ A-Z]*PRIVATE KEY-----/, 'приватный ключ (PEM)'],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'похоже на JWT (service_role/anon ключ Supabase?)'],
    [/sk-(live|proj)-[A-Za-z0-9]{20,}/, 'ключ вида sk-live-/sk-proj- (Stripe/OpenAI-подобный)'], [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
    [/ghp_[A-Za-z0-9]{36}/, 'GitHub personal access token (classic)'], [/github_pat_[A-Za-z0-9_]{60,}/, 'GitHub fine-grained personal access token'],
    [/sk-ant-[A-Za-z0-9-]{20,}/, 'ключ вида sk-ant- (Anthropic)'], [/AIza[A-Za-z0-9_-]{35}/, 'ключ вида AIza (Google API)'],
    [/\b\d{8,10}:[A-Za-z0-9_-]{34,35}\b/, 'похоже на Telegram bot_token'], [/GOCSPX-[A-Za-z0-9_-]{28,}/, 'похоже на Google OAuth client_secret'],
    [/sb_secret_[A-Za-z0-9_-]{20,}/, 'ключ вида sb_secret_ (Supabase, новый формат)']
  ];
  const hit = (pats.find(([re]) => re.test(added)) || [])[1];
  if (hit) {
    trail('secrets', 5, 'похоже на секрет в застейдженном diff: ' + hit);
    deny('В застейдженных изменениях найдено похожее на секрет: ' + hit + '. Если это ложное срабатывание (пример в комментарии/тесте) — сказать явно, и на этот раз выполнить коммит другим путём/временно снять хук. Если реальный ключ — убрать и перевыпустить, не коммитить.');
  }
}
// 8) инструмент проекта без чтения его файла
{
  const r = readGuard(d);
  if (r) {
    if (r.mode === 'warn') { process.stdout.write(JSON.stringify({ continue: true, systemMessage: r.reason }) + '\n'); process.exit(0); }
    deny(r.reason);
  }
}
process.exit(0);
