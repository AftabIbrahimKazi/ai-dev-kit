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
