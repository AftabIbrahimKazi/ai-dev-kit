// Scores the semantic skill check against tests/fixtures/skill-triggers.semantic.json using the live local Laya model.
// Like production, a skill is only asked about when the keyword rules did not already name it for that prompt.
// Needs Laya running (default 127.0.0.1:8000); without it this prints "skipped" and exits 0, so it never breaks a plain
// test run. It reads the thresholds from skill-scope.semantic.js, prints a sweep, and fails if recall or false hints at
// the shipped thresholds cross the floors below.
//
//   node tests/skill-scope.semantic.eval.js [--sweep] [--verbose]
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sem = require('../skills/meta/skill-scope.semantic.js');

const MIN_RECALL = 0.85;
const MAX_FALSE_RATE = 0.1; // of rows that should not hint this skill
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

const src = fs.readFileSync(path.join(__dirname, '../mods/skill-hint/hooks/match.ts'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports, require);
const { DEFAULT_RULES, mergeRules, matchSkills } = mod.exports;
const scope = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/meta/skill-scope.triggers.json'), 'utf8'));
const rules = mergeRules(DEFAULT_RULES, scope);
const { rows } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/skill-triggers.semantic.json'), 'utf8'));

async function scores(skill, prompts) {
  const out = [];
  for (let i = 0; i < prompts.length; i += 20) {
    const r = await fetch(`${sem.resolveBase({})}/v1/systemone/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ states: prompts.slice(i, i + 20).map((p) => 'Prompt: ' + p), questions: { q: { type: 'noul', instructions: sem.SEMANTIC[skill].q } } }),
    });
    if (!r.ok) throw new Error('Laya batch call failed: ' + r.status);
    out.push(...(await r.json()).results.map((x) => x.answers.q.noul));
  }
  return out;
}

(async () => {
  try {
    const h = await fetch(`${sem.resolveBase({})}/health`, { signal: AbortSignal.timeout(1500) });
    if (!h.ok) throw new Error('health ' + h.status);
  } catch { console.log('skipped: Laya is not running (start it with the system1-prefilter laya-ctl.js)'); return; }

  let failed = false;
  const skills = Object.keys(sem.SEMANTIC);
  for (const skill of skills) {
    // production gating: rows the keyword rules already name for this skill are never sent to the model
    const asked = rows.filter((r) => !matchSkills(r.q, rules).includes(skill));
    const kwCaught = rows.filter((r) => r.want.includes(skill) && matchSkills(r.q, rules).includes(skill)).length;
    const sc = await scores(skill, asked.map((r) => r.q));
    const pos = asked.map((r, i) => ({ r, s: sc[i] })).filter((x) => x.r.want.includes(skill));
    const neg = asked.map((r, i) => ({ r, s: sc[i] })).filter((x) => !x.r.want.includes(skill));
    const t = sem.SEMANTIC[skill].t;
    const hit = pos.filter((x) => x.s >= t), fals = neg.filter((x) => x.s >= t);
    const recall = pos.length ? hit.length / pos.length : 1;
    const frate = neg.length ? fals.length / neg.length : 0;
    console.log(`\n${skill} (threshold ${t}): ${pos.length} keyword-free positives, ${neg.length} negatives, ${kwCaught} positives already caught by keywords`);
    console.log(`  recall ${hit.length}/${pos.length} = ${(recall * 100).toFixed(0)}%   false ${fals.length}/${neg.length} = ${(frate * 100).toFixed(0)}%`);
    const tags = [...new Set(rows.map((r) => r.tag))];
    for (const tag of tags) {
      const p = pos.filter((x) => x.r.tag === tag), n = neg.filter((x) => x.r.tag === tag);
      if (p.length) console.log(`    ${tag}: recall ${p.filter((x) => x.s >= t).length}/${p.length}`);
      if (n.length) console.log(`    ${tag}: false ${n.filter((x) => x.s >= t).length}/${n.length}`);
    }
    for (const x of pos.filter((x) => x.s < t)) console.log(`  MISS  ${x.s.toFixed(2)} "${x.r.q.slice(0, 90)}"`);
    for (const x of fals) console.log(`  FALSE ${x.s.toFixed(2)} "${x.r.q.slice(0, 90)}"`);
    if (args.includes('--sweep')) for (const th of [0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7]) { console.log(`  t=${th}: recall ${pos.filter((x) => x.s >= th).length}/${pos.length}, false ${neg.filter((x) => x.s >= th).length}/${neg.length}`); if (th <= 0.3) for (const x of neg.filter((y) => y.s >= th && y.s < (th === 0.2 ? 0.25 : 1))) console.log(`      false@${th} ${x.s.toFixed(2)} "${x.r.q.slice(0, 70)}"`); }
    if (verbose) for (const x of [...pos, ...neg]) console.log(`  ${x.s.toFixed(2)} ${x.r.want.includes(skill) ? '+' : '-'} ${x.r.q.slice(0, 80)}`);
    if (recall < MIN_RECALL) { console.log(`FAIL ${skill}: recall ${(recall * 100).toFixed(0)}% under ${MIN_RECALL * 100}%`); failed = true; }
    if (frate > MAX_FALSE_RATE) { console.log(`FAIL ${skill}: false rate ${(frate * 100).toFixed(0)}% over ${MAX_FALSE_RATE * 100}%`); failed = true; }
  }
  if (!failed) console.log('\nok   semantic skill check meets its floors');
  else process.exitCode = 1;
})();
