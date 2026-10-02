#!/usr/bin/env node
/*
 * stop-checks.mjs — 02.10.2026 (владелец: «только объединяй там, где это возможно»). ОДИН Stop-хук вместо пяти отдельных процессов:
 * один раз читает вход и журнал хода и прогоняет пять проверок, ответ даёт ОДНИМ сообщением (раньше пять процессов читали один и тот же журнал).
 *  1) only-what-owner-said — за ход изменён код игры: сверь каждую правку со словами владельца (stopReason из only-what-owner-said.mjs)
 *  2) skin-lab-guard       — скины правились, а проверки на телефоне нет (skinLabStopReason из skin-lab-guard.mjs)
 *  3) ask-then-act         — вопрос владельцу и тут же действие без его ответа (askThenActCheck из ask-then-act-guard.mjs)
 *  4) done-needs-proof     — «готово/проверено» после правки без проверки (judge из done-needs-proof.mjs)
 *  5) mockup-unseen        — макет опубликован, отрисовку не смотрели (mockupUnseen из mockup-unseen-guard.mjs)
 * Сами файлы проверок остаются библиотеками и по-прежнему запускаются по отдельности (откат: вернуть их команды в settings.json).
 * Не зацикливается: stop_hook_active пропускает. Режимы: ONLY_OWNER_WORDS_MODE, ASK_THEN_ACT_ENFORCE_MODE, DONE_PROOF_MODE,
 * MOCKUP_UNSEEN_ENFORCE_MODE = block (по умолчанию) | warn | off. У skin-lab-guard режима нет (всегда блок).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const imp = (...p) => import(pathToFileURL(path.join(HERE, ...p)).href);
const modeOf = (name) => String(process.env[name] || 'block').toLowerCase();

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (input.stop_hook_active) process.exit(0);

const found = []; // { mode, text }
const add = (mode, text) => { if (text) found.push({ mode, text }); };
const safe = async (fn) => { try { return await fn(); } catch { return null; } }; // сбой одной проверки не ломает остальные

// 1) только то, что сказал владелец
const oowMode = modeOf('ONLY_OWNER_WORDS_MODE');
if (oowMode !== 'off') add(oowMode, await safe(async () => (await imp('only-what-owner-said.mjs')).stopReason(input)));

// 2) проверка скинов на телефоне
add('block', await safe(async () => (await imp('skin-lab-guard.mjs')).skinLabStopReason()));

// 3) вопрос и действие без ответа
const ataMode = modeOf('ASK_THEN_ACT_ENFORCE_MODE');
if (ataMode !== 'off') {
  const r = await safe(async () => (await imp('ask-then-act-guard.mjs')).askThenActCheck(input.transcript_path || ''));
  if (r) add(ataMode, r.reason);
}

// 4 и 5) проверки по журналу хода (журнал читается один раз)
const doneMode = modeOf('DONE_PROOF_MODE'), mockMode = modeOf('MOCKUP_UNSEEN_ENFORCE_MODE');
if (doneMode !== 'off' || mockMode !== 'off') {
  const { collectCurrentTurnBlocks } = await imp('lib', 'current-turn-blocks.mjs');
  const blocks = collectCurrentTurnBlocks(input.transcript_path || '');
  if (blocks.length) {
    if (doneMode !== 'off') {
      const hit = await safe(async () => (await imp('done-needs-proof.mjs')).judge(blocks));
      if (hit) add(doneMode, 'ХУК done-needs-proof. В этом ходу ты менял файлы, а после последней правки не запускал ни одной проверки (команда, чтение результата, снимок экрана), и при этом пишешь «' + hit + '». Либо запусти проверку и покажи, что запускал и что увидел, либо перепиши ответ: «не проверено» и что именно не проверено. «Не проверено» и «не знаю» это правильные ответы, не провал.');
    }
    if (mockMode !== 'off') {
      const unseen = await safe(async () => (await imp('mockup-unseen-guard.mjs')).mockupUnseen(blocks));
      if (unseen) add(mockMode, 'ХУК mockup-unseen. Макет опубликован, но отрисовку никто не смотрел («визуальное не готово без глаз»). Открой отрисованный экран (снимок каждого варианта, не одного), посмотри, где пустое место, стоит ли новое там, не обрезано ли что-то, и ответь заново уже с этим. Как смотреть без file:, см. скилл maket, шаг про проверку отрисовки.');
    }
  }
}

if (!found.length) process.exit(0);
const blocking = found.filter((f) => f.mode !== 'warn');
const warning = found.filter((f) => f.mode === 'warn');
if (warning.length) process.stderr.write(warning.map((f) => f.text).join('\n\n') + '\n');
if (blocking.length) process.stdout.write(JSON.stringify({ decision: 'block', reason: blocking.map((f) => f.text).join('\n\n') }));
process.exit(0);
