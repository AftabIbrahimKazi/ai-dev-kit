// Scores skill-hint's keyword rules against labeled prompts (tests/fixtures/skill-triggers.json): recall (wanted skill hinted)
// and false hints (anything hinted on a 'none' prompt or an unwanted skill). Pure matching, no model call, no tokens.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname, '../mods/skill-hint/hooks/match.ts'), 'utf8');
const m = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(m, m.exports, require);
const { DEFAULT_RULES, mergeRules, matchSkills } = m.exports;
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/meta/skill-scope.triggers.json'), 'utf8'));
const rules = mergeRules(DEFAULT_RULES, scope);
const { rows } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/skill-triggers.json'), 'utf8'));

let wanted = 0, hit = 0; const misses = [], falses = [];
for (const r of rows) {
  const got = matchSkills(r.q, rules);
  for (const w of r.want || []) { wanted++; if (got.includes(w)) hit++; else misses.push(`MISS  "${r.q}" wanted ${w}, got [${got}]`); }
  for (const g of got) if (!(r.want || []).includes(g)) falses.push(`FALSE "${r.q}" hinted ${g}`);
}
console.log(`recall ${hit}/${wanted}, false hints ${falses.length}`);
[...misses, ...falses].forEach((l) => console.log('  ' + l));
try { assert.strictEqual(misses.length, 0, 'missed hints'); assert.strictEqual(falses.length, 0, 'false hints'); console.log('ok   skill-hint triggers'); }
catch (e) { console.log('FAIL ' + e.message); process.exitCode = 1; }
