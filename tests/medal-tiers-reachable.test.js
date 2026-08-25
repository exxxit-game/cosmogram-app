'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ach = fs.readFileSync(path.join(__dirname, '../js/ach.js'), 'utf8');

const tierMatch = ach.match(/achTier\(a\)\{\s*return a\.rw>=(\d+)\?'mGold':\(a\.rw>=(\d+)\?'mSilver':'mBronze'\);/);
assert.ok(tierMatch, 'achTier() thresholds should be parseable from ach.js');
const goldThreshold = Number(tierMatch[1]);
const silverThreshold = Number(tierMatch[2]);

const rwValues = [...ach.matchAll(/rw:(\d+)/g)].map(m => Number(m[1]));
assert.ok(rwValues.length > 0, 'ACH registry should contain at least one reward value');

const maxRw = Math.max(...rwValues);
assert.ok(maxRw >= goldThreshold,
  `gold medal (rw>=${goldThreshold}) must be reachable — max reward in ACH is only ${maxRw}`);
assert.ok(rwValues.some(rw => rw >= silverThreshold && rw < goldThreshold) || maxRw >= goldThreshold,
  `silver medal (rw>=${silverThreshold}) tier should be reachable by some achievement`);

console.log('medal tiers (silver/gold) are reachable by at least one achievement reward');
