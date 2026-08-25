'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ui = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');

const fnMatch = ui.match(/function applyLangPref\(\)\{[\s\S]*?\n\}/);
assert.ok(fnMatch, 'applyLangPref() should be parseable from ui.js');
const body = fnMatch[0];

assert.ok(/document\.documentElement\.lang\s*=\s*eff/.test(body),
  'applyLangPref() must sync document.documentElement.lang to the active language (eff), or screen readers keep using the wrong pronunciation rules');

console.log('document.documentElement.lang follows the active language');
