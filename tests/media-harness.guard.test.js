const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const bench = path.join(__dirname, '..', 'skills', 'addons', 'media-harness', 'bench');
const { checkPrompt, NEGATIVE, TERMS } = require(path.join(bench, 'guard.js'));

t('plain art prompts pass', () => {
  for (const p of ['abstract flowing ribbons of teal and gold light', 'minimal geometric landscape at dusk', 'macro photograph of iridescent oil on water']) assert.ok(checkPrompt(p).ok, p);
});
t('adult terms are blocked, any case', () => {
  assert.strictEqual(checkPrompt('a NUDE figure in a studio').rule, 'adult');
  assert.strictEqual(checkPrompt('uncensored portrait').rule, 'adult');
});
t('sexualised-minor markers are blocked', () => assert.strictEqual(checkPrompt('underage portrait').rule, 'minor'));
t('ordinary words are NOT blocked (guard must not change normal features)', () => {
  for (const p of ['a child playing in a field', 'kids learning app hero banner', 'baby blue gradient background', 'explicit typing in a code editor', 'teen mobile banking dashboard']) assert.ok(checkPrompt(p).ok, p);
});
t('graphic violence is blocked', () => assert.strictEqual(checkPrompt('gory battle scene').rule, 'graphic'));
t('whole words only: Essex and cumulus are fine', () => {
  assert.ok(checkPrompt('a village in Essex under cumulus clouds').ok);
  assert.ok(checkPrompt('assessment dashboard').ok);
});
t('empty prompt is refused', () => assert.strictEqual(checkPrompt('  ').rule, 'empty'));
t('negative prompt is safety terms only, no quality or style words', () => {
  assert.ok(/nsfw/.test(NEGATIVE) && /gore/.test(NEGATIVE));
  for (const w of ['text', 'blurry', 'low quality', 'watermark', 'child', 'minors']) assert.ok(!NEGATIVE.includes(w), w);
});
t('CLI exits 4 with a reason on a blocked prompt, 0 on an allowed one', () => {
  const bad = spawnSync(process.execPath, [path.join(bench, 'guard.js'), 'nsfw portrait'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 4); assert.ok(/blocked \(adult\)/.test(bad.stderr));
  assert.strictEqual(spawnSync(process.execPath, [path.join(bench, 'guard.js'), 'teal waves'], { encoding: 'utf8' }).status, 0);
});
t('every benchmark prompt in bench.py passes the guard', () => {
  const py = fs.readFileSync(path.join(bench, 'bench.py'), 'utf8');
  const block = py.slice(py.indexOf('PROMPTS = ['), py.indexOf(']', py.indexOf('PROMPTS = [')));
  const prompts = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(prompts.length === 6, 'found ' + prompts.length);
  for (const p of prompts) assert.ok(checkPrompt(p).ok, p);
});
t('bench.py ships the guard and keeps screening OUT of the timed region', () => {
  const py = fs.readFileSync(path.join(bench, 'bench.py'), 'utf8');
  assert.ok(py.includes('"__GUARD_JSON__"') && py.includes('negative_prompt=NEG') && py.includes('def safe('));
  assert.ok(!py.includes('screen_img'), 'old in-timing screen left in');
  // every safe() call sits after its timed(...) call, never inside a gen() body
  const lines = py.split(String.fromCharCode(10));
  const gens = [];
  lines.forEach((ln, i) => { if (/^\s+def gen2?\(\):$/.test(ln)) { const ind = ln.search(/\S/); let j = i + 1; const body = []; while (j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > ind)) body.push(lines[j++]); gens.push(body.join(' ')); } });
  assert.ok(gens.length >= 2);
  for (const g of gens) assert.ok(!g.includes('safe('), 'safe() inside a timed gen()');
  assert.ok(!/negative_prompt/.test(py.slice(py.indexOf('def wan('), py.indexOf('def two_workers'))), 'Wan call must be unchanged');
});
t('run.js injects the real rules into the pushed kernel', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-run-'));
  fs.mkdirSync(path.join(tmp, 'kaggle'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'kaggle', 'config.json'), JSON.stringify({ username: 'someone' }));
  const r = spawnSync(process.execPath, [path.join(bench, 'run.js'), '--dry-run'], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: tmp, KAGGLE_API_TOKEN: 'fake' } });
  assert.strictEqual(r.status, 0, r.stderr);
  const pushed = fs.readFileSync(fs.readdirSync(path.join(tmp, 'kaggle'), { recursive: true }).map((f) => path.join(tmp, 'kaggle', String(f))).find((f) => f.endsWith(path.join('push', 'bench.py'))), 'utf8');
  assert.ok(!pushed.includes('__GUARD_JSON__'), 'placeholder left in');
  assert.ok(pushed.includes('nsfw') && pushed.includes(TERMS.minor[0]));
  fs.rmSync(tmp, { recursive: true, force: true });
});
