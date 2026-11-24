const assert = require('node:assert');
const { evaluate } = require('../skills/meta/ab-gate.js');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };

t('a tie rejects', () => assert.strictEqual(evaluate({ a: 1, b: 0 }, { a: 1, b: 0 }).action, 'reject'));
t('clear gain with no loss accepts', () => assert.strictEqual(evaluate({ a: 0.5, b: 0.5 }, { a: 0.7, b: 0.5 }).action, 'accept'));
t('mean up but one task worse rejects', () => {
  const r = evaluate({ a: 0.2, b: 0.9 }, { a: 0.9, b: 0.8 });
  assert.strictEqual(r.action, 'reject');
  assert.deepStrictEqual(r.regressed.map((x) => x.task), ['b']);
});
t('--allow-regress falls back to the mean gate', () => assert.strictEqual(evaluate({ a: 0.2, b: 0.9 }, { a: 0.9, b: 0.8 }, { noRegression: false }).action, 'accept'));
t('tolerance forgives a small drop', () => assert.strictEqual(evaluate({ a: 0.2, b: 0.9 }, { a: 0.9, b: 0.88 }, { tolerance: 0.05 }).action, 'accept'));
t('a task missing from the candidate rejects', () => assert.strictEqual(evaluate({ a: 1, b: 1 }, { a: 1 }).action, 'reject'));
t('NaN score rejects', () => assert.strictEqual(evaluate({ a: 1 }, { a: NaN }).action, 'reject'));
t('empty baseline rejects', () => assert.strictEqual(evaluate({}, {}).action, 'reject'));
t('min-gain raises the bar', () => assert.strictEqual(evaluate({ a: 0.5 }, { a: 0.55 }, { minGain: 0.1 }).action, 'reject'));

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const GATE = path.join(__dirname, '..', 'skills', 'meta', 'ab-gate.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abgate-'));
const file = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p; };
const gate = (...a) => spawnSync(process.execPath, [GATE, ...a], { encoding: 'utf8' });

t('a non-numeric baseline score rejects and names the task', () => {
  const r = evaluate({ a: 'x', b: 1 }, { a: 1, b: 1 });
  assert.strictEqual(r.action, 'reject');
  assert.match(r.reason, /missing or non-numeric score for: a$/);
});

t('improved lists only tasks that beat the baseline by more than the tolerance', () => {
  assert.deepStrictEqual(evaluate({ a: 0.5, b: 0.5, c: 0.5 }, { a: 0.6, b: 0.55, c: 0.5 }, { tolerance: 0.05 }).improved, ['a']);
});

t('cli: accept exits 0, reject exits 1, missing files exit 2', () => {
  const base = file('base.json', { a: 0.5, b: 0.5 });
  assert.strictEqual(gate('--base', base, '--cand', file('up.json', { a: 0.9, b: 0.5 })).status, 0);
  assert.strictEqual(gate('--base', base, '--cand', file('same.json', { a: 0.5, b: 0.5 })).status, 1);
  const none = gate('--base', base);
  assert.strictEqual(none.status, 2);
  assert.match(none.stderr, /^usage: ab-gate\.js/);
  assert.strictEqual(gate('--cand', base).status, 2);
});

t('cli: --min-gain, --tolerance, --allow-regress and --json are read', () => {
  const base = file('b2.json', { a: 0.2, b: 0.9 });
  const cand = file('c2.json', { a: 0.9, b: 0.88 });
  assert.strictEqual(gate('--base', base, '--cand', cand).status, 1);
  assert.strictEqual(gate('--base', base, '--cand', cand, '--tolerance', '0.05').status, 0);
  assert.strictEqual(gate('--base', base, '--cand', cand, '--allow-regress').status, 0);
  assert.strictEqual(gate('--base', base, '--cand', cand, '--allow-regress', '--min-gain', '0.9').status, 1);
  const j = JSON.parse(gate('--base', base, '--cand', cand, '--tolerance', '0.05', '--json').stdout);
  assert.strictEqual(j.action, 'accept');
  assert.strictEqual(j.tasks, 2);
  assert.match(gate('--base', base, '--cand', cand, '--tolerance', '0.05').stdout, /^ACCEPT: mean up/);
});

t('a gain exactly equal to the tolerance is not an improvement', () => {
  assert.deepStrictEqual(evaluate({ a: 0.5 }, { a: 0.75 }, { tolerance: 0.25 }).improved, []);
});
