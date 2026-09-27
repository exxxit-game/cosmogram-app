#!/usr/bin/env node
/* deferred-fix-guard.mjs — 27.09.2026, построен по прямому требованию владельца в моменте
   ("сделай себе хук от долбоебских предложений"), после конкретного провала: нашёл реальную
   архитектурную дыру в экономике (кошелёк полностью доверяет клиенту), и вместо того чтобы
   найти настоящее решение (или сначала исследовать, если сам не знаю), предложил через
   AskUserQuestion три варианта — все три были отсрочкой/полумерой («не трогать», «сузить»,
   «задеплоить, защиту от читерства сделать отдельно потом»), ни один не решал проблему по
   существу. См. память feedback_ne_predlagat_platyr_na_krupnuyu_problemu_27_09.

   Механика: PostToolUse AskUserQuestion. Смотрим текст (question+label+description) каждой
   опции. Если ВСЕ опции похожи на отсрочку/полумеру, и НИ ОДНА не похожа на решение по корню —
   предупредить (warn, не блокировать — иногда полумера реально единственный вариант, это
   не всегда ошибка, но стоит перепроверить себя перед отправкой).
   Отключить на раз: DEFERRED_FIX_GUARD_MODE=off */
import { readFileSync } from 'node:fs';

const MODE = (process.env.DEFERRED_FIX_GUARD_MODE || 'warn').toLowerCase();
const DEFER_RE = /отдельн|отлож|потом|позже|не\s*трога|сузи|узк|оставь\s+как\s+ест|пластыр|без\s+преферен|no\s*preference|паллиатив|полумер|симптом/i;
const ROOT_CAUSE_RE = /источник\s+правды|событи|дельт|ledger|перепиш|сервер\s+сам|транзакц|redesign|authoritative|архитектур/i;

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function optionTexts(hookData) {
  const input = hookData.tool_input || {};
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const out = [];
  for (const q of questions) {
    const opts = Array.isArray(q.options) ? q.options : [];
    for (const o of opts) out.push(String(o.label || '') + ' ' + String(o.description || ''));
  }
  return out;
}

function main() {
  if (MODE === 'off') return;
  let hookData;
  try { hookData = JSON.parse(readStdin() || '{}'); } catch { return; }
  if ((hookData.tool_name || '') !== 'AskUserQuestion') return;

  const texts = optionTexts(hookData);
  if (texts.length < 2) return;

  const allDefer = texts.every(t => DEFER_RE.test(t));
  const anyRootCause = texts.some(t => ROOT_CAUSE_RE.test(t));

  if (allDefer && !anyRootCause) {
    console.error(
      `⚠ deferred-fix-guard: все ${texts.length} предложенных варианта похожи на отсрочку/` +
      `полумеру (не трогать / сузить / отдельно потом), ни один не похож на решение по корню. ` +
      `Если проблема названа владельцем критической/огромной — сначала проверить, есть ли ` +
      `известный рабочий паттерн (индустрия, или уже работающий приём в этом же кодовом ` +
      `окружении), и предложить его, а не только паллиативы.\n` +
      `Отключить на раз: DEFERRED_FIX_GUARD_MODE=off`
    );
  }
}

try { main(); } catch { /* fail-safe: тихо не мешать основной работе */ }
