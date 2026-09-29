#!/usr/bin/env node
/*
 * tool-usage-log.mjs — 30.09.2026 (владелец: «какие инструменты ты не использовал, хотя нужно было, и
 * когда именно нужно было»). До этого хука ответить на этот вопрос было НЕЧЕМ: хуки ловят нарушения
 * (то, что сделано не так), но ничего не записывало, что вообще ни разу не вызывалось — из-за этого
 * скилл deploy-edge, поиск по документации Supabase, субагенты и т.п. могли простаивать неделями, а
 * заметили мы это только когда владелец сам спросил. Здесь — только МЕРА: тихо пишем «этот инструмент
 * вызвали» в общий журнал сигналов (trail=usage), а вывод «что простаивает» делает гэп-финдер, раздел Ж
 * (он же входит в отчёт, который сам запускается на старте сессии).
 *
 * PostToolUse, матчер ^(Skill|Agent|mcp__.*)$ — не на каждый Read/Grep (сотни за сессию), а только на
 * те вызовы, где вопрос «использовал ли вообще» имеет смысл: скиллы, субагенты, MCP-инструменты.
 * Молчит всегда (ничего не выводит), любая ошибка — тихий выход: журнал не должен мешать работе.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function done() { process.exit(0); }

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const name = String(input.tool_name || '');
  const ti = input.tool_input || {};
  let category = '';
  if (name === 'Skill') category = 'skill:' + String(ti.skill || '?');
  else if (name === 'Agent') category = 'agent:' + String(ti.subagent_type || 'general-purpose');
  else if (name.startsWith('mcp__')) category = 'mcp:' + name.split('__').slice(2).join('__');
  if (!category) done();

  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'signal-trail.mjs');
  const { recordSignal } = await import(pathToFileURL(modPath).href);
  recordSignal('use:' + category, 1, '', { trail: 'usage' });
} catch { /* журнал использования не имеет права ломать работу */ }
done();
