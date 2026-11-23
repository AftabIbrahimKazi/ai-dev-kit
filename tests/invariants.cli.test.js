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

// ---- gaps found by the kit-wide probe on invariants.cli.js itself ----
const plain = (rules, files = { 'lib.js': 'exports.x = 1;\n' }) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inv plain-'));
	for (const [rel, text] of Object.entries(files)) fs.writeFileSync(path.join(d, rel), text);
	fs.mkdirSync(path.join(d, 'invariants'));
	fs.writeFileSync(path.join(d, 'invariants/invariants.json'), typeof rules === 'string' ? rules : JSON.stringify(rules));
	return d;
};
const ok = (extra = {}) => ({ id: 'P', rule: 'a rule', covers: ['lib.js'], check: 'node -e "0"', ...extra });

t('messages and exit codes of the rules file checks', () => {
	const msg = (rules) => { const r = cli(plain(rules), 'check'); assert.strictEqual(r.status, 1, JSON.stringify(rules)); return r.stderr; };
	assert.ok(msg('not json').includes('cannot read '), 'unreadable or invalid file');
	assert.ok(msg('{"a":1}').includes('must be a JSON array of rules'));
	for (const bad of [[null], [{}], [{ id: 5, rule: 'r', covers: ['lib.js'], check: 'x' }], [{ id: '', rule: 'r', covers: ['lib.js'], check: 'x' }]]) assert.ok(msg(bad).includes('every rule needs an id'), JSON.stringify(bad));
	assert.ok(msg([ok({ rule: '' })]).includes('P: missing rule sentence'));
	assert.ok(msg([ok({ check: '' })]).includes('P: missing check command'));
	assert.ok(msg([ok({ covers: [] })]).includes('P: covers must list at least one file'));
	assert.ok(msg([ok({ covers: 'lib.js' })]).includes('P: covers must list at least one file'));
	assert.ok(msg([ok({ mutate: { file: 'lib.js', find: '', replace: 'x' } })]).includes('P: mutate needs file, find and replace'));
	assert.ok(msg([ok({ mutate: { file: 'lib.js', find: 'a' } })]).includes('P: mutate needs file, find and replace'));
	assert.ok(msg([ok(), ok()]).includes('duplicate id P'));
	const good = cli(plain([ok(), ok({ id: 'Q' })]), 'check');
	assert.strictEqual(good.status, 0); assert.strictEqual(good.stdout.trim(), '2 rule(s) valid');
	const noValue = cli(plain([ok()]), 'run', '--file');
	assert.strictEqual(noValue.status, 2); assert.ok(noValue.stderr.includes('--file needs a value'));
	assert.ok(cli(plain([ok()]), 'run', '--id').stderr.includes('--id needs a value'));
	assert.ok(cli(plain([ok()]), 'run', '--max').stderr.includes('--max needs a value'));
});

t('a mutation whose text starts at the very first character still applies', () => {
	const d = plain([ok({ check: 'node -e "process.exit(require(\'./lib.js\').x === 1 ? 0 : 1)"', mutate: { file: 'lib.js', find: 'exports.x = 1', replace: 'exports.x = 2' } })]);
	const r = cli(d, 'run');
	assert.strictEqual(statusOf(r), 'PASS', r.stdout);
	assert.strictEqual(fs.readFileSync(path.join(d, 'lib.js'), 'utf8'), 'exports.x = 1;\n');
});

t('probe report: exact lines for the summary and each survivor, with the ignored count', () => {
	const LIBP = 'exports.a = (x) => x > 1;\nexports.b = (x) => x > 2;\n';
	const d = plain([ok({ check: 'node -e "const l=require(\'./lib.js\');process.exit(l.a(2)&&l.b(3)?0:1)"' })], { 'lib.js': LIBP });
	let r = cli(d, 'probe');
	assert.strictEqual(r.stdout.split('\n')[0], 'lib.js: 2 mutants, 0 killed, 2 survived, 0 invalid', r.stdout);
	assert.ok(r.stdout.includes('  SURVIVED lib.js:1  > to >=  (> -> >=)'), r.stdout);
	assert.ok(r.stdout.includes('  SURVIVED lib.js:2  > to >=  (> -> >=)'), 'a second-line survivor keeps its own line number');
	fs.writeFileSync(path.join(d, 'invariants/probe-ignore.json'), JSON.stringify(['lib.js:1:> to >=']));
	r = cli(d, 'probe');
	assert.strictEqual(r.stdout.split('\n')[0], 'lib.js: 2 mutants, 0 killed, 1 survived, 0 invalid, 1 ignored', r.stdout);
	assert.strictEqual(fs.readFileSync(path.join(d, 'lib.js'), 'utf8'), LIBP);
});

t('probe skips an operator after a // comment starts, but not a // inside a string', () => {
	const d = plain([ok()], { 'lib.js': "exports.u = 'http://x.dev/a' > 1; // c > d\nexports.v = 2 > 1;//> tail\n" });
	const j = JSON.parse(cli(d, 'probe', '--json').stdout)[0];
	assert.deepStrictEqual(j.survivors.map((x) => x.line + ':' + x.op), ['1:> to >=', '2:> to >=']);
});

t('the bare command runs rules, probe and stale as separate sections and reports the right exit code', () => {
	const head = (d) => { spawnSync('git', ['init', '-q'], { cwd: d }); spawnSync('git', ['add', '.'], { cwd: d }); spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i'], { cwd: d }); return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: d, encoding: 'utf8' }).stdout.trim(); };
	const withRules = (rules) => { const d = plain(rules); const h = head(d); const fixed = rules.map((r) => ({ ...r, verified: h })); fs.writeFileSync(path.join(d, 'invariants/invariants.json'), JSON.stringify(fixed)); return d; };
	// everything fine: exit 0, three sections in order, text not JSON
	let d = withRules([ok({ mutate: { file: 'lib.js', find: 'exports.x = 1', replace: 'exports.x = 2' }, check: 'node -e "process.exit(require(\'./lib.js\').x === 1 ? 0 : 1)"' })]);
	let r = cli(d);
	assert.strictEqual(r.status, 0, r.stdout + r.stderr);
	const order = ['== rules', '== probe', '== stale'].map((h) => r.stdout.indexOf(h));
	assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], r.stdout);
	assert.ok(r.stdout.includes('PASS        P') && !r.stdout.includes('"status"'), 'text output');
	// a vacuous rule alone fails the run
	d = withRules([ok({ mutate: { file: 'lib.js', find: 'exports.x = 1', replace: 'exports.x = 2' } })]);
	r = cli(d);
	assert.ok(r.stdout.includes('VACUOUS'), r.stdout);
	assert.strictEqual(r.status, 1, 'vacuous rule');
	// a rule never verified fails the run even when the rules pass
	d = plain([ok()]); head(d);
	r = cli(d);
	assert.ok(r.stdout.includes('never verified'), r.stdout);
	assert.strictEqual(r.status, 1, 'stale alone');
	// a failing rule fails the run
	d = withRules([ok({ check: 'node -e "process.exit(1)"' })]);
	assert.strictEqual(cli(d).status, 1, 'failing rule');
	// a bad mutation text fails the run
	d = withRules([ok({ mutate: { file: 'lib.js', find: 'not in the file', replace: 'x' } })]);
	assert.strictEqual(cli(d).status, 1, 'bad mutation');
});

t('every option flag takes a value, an unknown flag or a stray word is refused, and each flag is accepted with a value', () => {
	const d = plain([ok()], { 'lib.js': 'exports.x = 1;\n' });
	for (const flag of ['--file', '--id', '--target', '--max']) {
		const r = cli(d, 'run', flag);
		assert.strictEqual(r.status, 2, flag);
		assert.ok(r.stderr.includes(flag + ' needs a value'), flag + ': ' + r.stderr);
	}
	const bogus = cli(d, 'run', '--bogus');
	assert.strictEqual(bogus.status, 2); assert.ok(bogus.stderr.includes('unknown flag: --bogus'));
	const stray = cli(d, 'run', 'stray');
	assert.strictEqual(stray.status, 2); assert.ok(stray.stderr.includes('unexpected argument: stray'));
	assert.strictEqual(cli(d, 'probe', '--target', 'lib.js', '--max', '5').status, 0);
	assert.strictEqual(cli(d, 'run', '--id', 'P').status, 0);
	assert.strictEqual(cli(d, 'run', '--file', 'invariants/invariants.json').status, 0);
	const none = cli(d, 'probe', '--target', 'other.js');
	assert.strictEqual(none.status, 0); assert.strictEqual(none.stdout.trim(), '');
});
