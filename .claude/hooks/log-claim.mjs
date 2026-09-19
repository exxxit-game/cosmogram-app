#!/usr/bin/env node
/*
 * log-claim.mjs — Node.js порт log_claim.py (PrimeFoldTools/andon). Пишет запись,
 * которую ищет claim-check-hook.mjs. Запускать СРАЗУ после того, как реально
 * проверил заявление «готово»:
 *
 *   node .claude/hooks/log-claim.mjs "что утверждаю" "как проверил"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAIM_CHECKS_LOG = path.resolve(
  process.env.CLAIM_CHECKS_LOG_PATH ||
    path.join(os.homedir(), '.claude', 'state', 'claim_checks', 'log.jsonl')
);

function main() {
  const claim = process.argv[2] || '';
  const verification = process.argv[3] || '';
  if (!claim || !verification) {
    process.stderr.write('usage: node log-claim.mjs "<что утверждаю>" "<как проверил>"\n');
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(CLAIM_CHECKS_LOG), { recursive: true });
  const entry = { timestamp: new Date().toISOString(), claim, verification };
  fs.appendFileSync(CLAIM_CHECKS_LOG, JSON.stringify(entry) + '\n', 'utf8');
  console.log(`logged → ${CLAIM_CHECKS_LOG}`);
}

main();
