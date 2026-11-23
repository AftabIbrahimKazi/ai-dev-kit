const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/invariants.cli.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a], { cwd, encoding: 'utf8' });
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });

// A tiny "payment" project: charge() must not charge twice for the same order id.
const CHARGE = "const seen = new Set();\nexports.charge = (id) => { if (seen.has(id)) return false; seen.add(id); return true; };\n";
const GOOD_CHECK = 'node -e "const c=require(\'./charge.js\');process.exit(c.charge(1)&&!c.charge(1)?0:1)"';
const proj = (rules) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inv test-'));
	fs.writeFileSync(path.join(d, 'charge.js'), CHARGE);
	fs.mkdirSync(path.join(d, 'invariants'));
	fs.writeFileSync(path.join(d, 'invariants/invariants.json'), JSON.stringify(rules, null, 2));
	return d;
};
const rule = (extra = {}) => ({
	id: 'INV-1', rule: 'An order is never charged twice.', covers: ['charge.js'], check: GOOD_CHECK,
	mutate: { file: 'charge.js', find: 'if (seen.has(id)) return false; ', replace: '' }, ...extra,
});
const statusOf = (r) => r.stdout.trim().split(/\s+/)[0];

t('real check goes red under its mutation: PASS, exit 0, file restored', () => {
	const d = proj([rule()]);
	const r = cli(d, 'run');
	assert.strictEqual(statusOf(r), 'PASS', r.stdout + r.stderr);
	assert.strictEqual(r.status, 0);
	assert.strictEqual(fs.readFileSync(path.join(d, 'charge.js'), 'utf8'), CHARGE);
});

t('vacuous check that never looks at the rule is flagged VACUOUS, exit 1', () => {
	const d = proj([rule({ check: 'node -e "process.exit(0)"' })]);
	const r = cli(d, 'run');
	assert.strictEqual(statusOf(r), 'VACUOUS', r.stdout);
	assert.strictEqual(r.status, 1);
	assert.strictEqual(fs.readFileSync(path.join(d, 'charge.js'), 'utf8'), CHARGE);
});

t('check failing on current code is FAIL and does not mutate', () => {
	const d = proj([rule()]);
	fs.writeFileSync(path.join(d, 'charge.js'), CHARGE.replace('if (seen.has(id)) return false; ', ''));
	const r = cli(d, 'run');
	assert.strictEqual(statusOf(r), 'FAIL');
	assert.strictEqual(r.status, 1);
});

t('rule without a mutation is UNPROVEN but not an error', () => {
	const r0 = rule(); delete r0.mutate;
	const r = cli(proj([r0]), 'run');
	assert.strictEqual(statusOf(r), 'UNPROVEN');
	assert.strictEqual(r.status, 0);
});

t('mutation text missing from the file is BADMUTATION, exit 1', () => {
	const r = cli(proj([rule({ mutate: { file: 'charge.js', find: 'nope', replace: '' } })]), 'run');
	assert.strictEqual(statusOf(r), 'BADMUTATION');
	assert.strictEqual(r.status, 1);
});

t('--json output parses and --id selects one rule', () => {
	const d = proj([rule(), rule({ id: 'INV-2' })]);
	const out = JSON.parse(cli(d, 'run', '--id', 'INV-2', '--json').stdout);
	assert.deepStrictEqual(out.map(x => x.id), ['INV-2']);
});

t('stamp records HEAD; stale is clean, then reports a change to a covered file', () => {
	const d = proj([rule()]);
	git(d, 'init', '-q'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
	assert.strictEqual(cli(d, 'stale').status, 1, 'never verified counts as stale');
	assert.strictEqual(cli(d, 'stamp').status, 0);
	git(d, 'add', '.'); git(d, 'commit', '-qm', 'stamped');
	assert.strictEqual(cli(d, 'stale').status, 0, 'unchanged covered file');
	fs.appendFileSync(path.join(d, 'charge.js'), '// edit\n');
	const r = cli(d, 'stale');
	assert.strictEqual(r.status, 1);
	assert.ok(/stale: charge\.js/.test(r.stdout), r.stdout);
});

t('bad input: unknown command exits 2, bad rules file exits 1', () => {
	const d = proj([rule()]);
	assert.strictEqual(cli(d, 'bogus').status, 2);
	assert.strictEqual(cli(d, 'run', '--wat').status, 2);
	fs.writeFileSync(path.join(d, 'invariants/invariants.json'), '[{"id":"A"}]');
	assert.strictEqual(cli(d, 'check').status, 1);
});

// ---- probe ----
const LIB = "exports.f = (a, b) => (a > b ? 1 : 0);\n// x > y && z\nexports.s = 'a > b || c';\nexports.r = /[<>]/.test('x');\n";
const WEAK = 'node -e "process.exit(require(\'./lib.js\').f(2,1)===1?0:1)"';
const STRONG = 'node -e "const f=require(\'./lib.js\').f;process.exit(f(2,1)===1&&f(1,1)===0?0:1)"';
const lib = (check, extra = {}) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inv probe-'));
	fs.writeFileSync(path.join(d, 'lib.js'), LIB);
	fs.mkdirSync(path.join(d, 'invariants'));
	fs.writeFileSync(path.join(d, 'invariants/invariants.json'), JSON.stringify([{ id: 'P1', rule: 'f is strict', covers: ['lib.js'], check, ...extra }]));
	return d;
};
const probeJson = (d, ...a) => JSON.parse(cli(d, 'probe', '--json', ...a).stdout);

t('probe: a weak check leaves a boundary mutant alive; comments, strings and regex are not mutated', () => {
	const d = lib(WEAK);
	const r = cli(d, 'probe');
	assert.strictEqual(r.status, 1, r.stdout);
	const j = probeJson(d)[0];
	assert.strictEqual(j.total, 1, 'only the code operator is mutated');
	assert.strictEqual(j.survivors.length, 1);
	assert.strictEqual(j.survivors[0].op, '> to >=');
	assert.strictEqual(fs.readFileSync(path.join(d, 'lib.js'), 'utf8'), LIB);
});

t('probe: a check that covers the boundary kills the mutant, exit 0', () => {
	const d = lib(STRONG);
	const r = cli(d, 'probe');
	assert.strictEqual(r.status, 0, r.stdout);
	assert.strictEqual(probeJson(d)[0].killed, 1);
});

t('probe: probe-ignore.json hides a survivor by file:line:op', () => {
	const d = lib(WEAK);
	fs.writeFileSync(path.join(d, 'invariants/probe-ignore.json'), JSON.stringify(['lib.js:1:> to >=']));
	const r = cli(d, 'probe');
	assert.strictEqual(r.status, 0, r.stdout);
	assert.strictEqual(probeJson(d)[0].ignored, 1);
});

t('probe: a check failing on the current code is reported, not probed', () => {
	const d = lib('node -e "process.exit(1)"');
	const j = probeJson(d)[0];
	assert.strictEqual(j.baselineOk, false);
	assert.strictEqual(j.total, 0);
	assert.strictEqual(cli(d, 'probe').status, 1);
});

t('probe: --max caps mutants and a bad --max exits 2', () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inv probe-'));
	fs.writeFileSync(path.join(d, 'lib.js'), 'exports.a = (x) => x > 1 && x < 9 && x !== 4 && x >= 0;\n');
	fs.mkdirSync(path.join(d, 'invariants'));
	fs.writeFileSync(path.join(d, 'invariants/invariants.json'), JSON.stringify([{ id: 'P', rule: 'r', covers: ['lib.js'], check: 'node -e "0"' }]));
	assert.strictEqual(probeJson(d, '--max', '2')[0].total, 2);
	assert.strictEqual(cli(d, 'probe', '--max', 'x').status, 2);
});

t('probe: tsc helper functions at the top of a file are skipped', () => {
	const d = lib(WEAK);
	fs.writeFileSync(path.join(d, 'lib.js'), 'var __helper = (this && this.__helper) || function (a) {\n    return a > 1 || a === 2;\n};\nexports.f = (a, b) => (a > b ? 1 : 0);\n');
	assert.strictEqual(probeJson(d)[0].total, 1);
});

t('a run killed mid-mutation is repaired by the next run from the .invariants-bak copy', () => {
  const d = proj([rule()]);
  const lib = path.join(d, 'charge.js');
  fs.writeFileSync(lib + '.invariants-bak', CHARGE);
  fs.writeFileSync(lib, '// left broken by a killed run\n');
  const r = cli(d, 'run');
  assert.match(r.stderr, /recovered charge\.js/);
  assert.strictEqual(fs.readFileSync(lib, 'utf8'), CHARGE);
  assert.ok(!fs.existsSync(lib + '.invariants-bak'), 'backup removed');
  assert.strictEqual(statusOf(r), 'PASS', r.stdout);
});

t('no backup file is left behind after a normal run or probe', () => {
  const d = proj([rule()]);
  cli(d, 'run'); cli(d, 'probe');
  assert.ok(!fs.existsSync(path.join(d, 'charge.js.invariants-bak')));
});
