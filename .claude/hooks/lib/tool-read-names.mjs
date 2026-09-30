// tool-read-names.mjs — 30.09.2026. Общая часть двух хуков: tool-read-log.mjs (PostToolUse) записывает,
// какие инструменты проекта (tools/ИМЯ.mjs) открывали в сессии, а tool-usage-read-guard.mjs (PreToolUse) по этой
// записи не даёт запустить инструмент, справку которого не читали.
//
// Почему отдельный файл записи, а не журнал сессии: журнал сессии вырастает до гигабайта (1,4 ГБ 30.09),
// целиком его прочитать нельзя (ERR_STRING_TOO_LONG), и хук, читавший журнал, молча пропускал всё.
import path from 'node:path';

const BS = String.fromCharCode(92);
export const norm = (s) => String(s || '').split(BS).join('/');

const READ_VERB = /^(?:cat|head|tail|sed|less|more|awk|grep|rg|type)\b/;
const MJS = /(?:tools\/)?([\w.-]+\.mjs)/g;

/** Имена инструментов tools/*.mjs, которые эта команда/вызов ОТКРЫВАЕТ для чтения (а не запускает). */
export function readNames(toolName, input) {
  const inp = input || {};
  const out = new Set();
  const tool = String(toolName || '');
  if (tool === 'Read') {
    const m = norm(inp.file_path).match(/(?:^|\/)tools\/([\w.-]+\.mjs)$/);
    if (m) out.add(m[1]);
  } else if (tool === 'Grep') {
    const p = norm(inp.path).match(/(?:^|\/)tools\/([\w.-]+\.mjs)$/);
    if (p) out.add(p[1]);
    const g = norm(inp.glob).match(/([\w.-]+\.mjs)$/);
    if (g) out.add(g[1]);
  } else if (tool === 'Bash') {
    for (const seg of norm(inp.command).split(/&&|\|\||[|;&\n]/)) {
      const s = seg.trim();
      if (!READ_VERB.test(s)) continue;
      let m;
      MJS.lastIndex = 0;
      while ((m = MJS.exec(s))) out.add(m[1]);
    }
  }
  return [...out];
}

/** Папка записи. TOOL_READ_STATE_DIR — для тестов (иначе .claude/state рядом с хуками). */
export function stateDir(hooksDir) {
  return process.env.TOOL_READ_STATE_DIR || path.join(hooksDir, '..', 'state');
}

export function stateFile(hooksDir, sessionId) {
  const sid = String(sessionId || 'no-session').replace(/[^\w-]/g, '_');
  return path.join(stateDir(hooksDir), 'tools-read-' + sid + '.txt');
}
