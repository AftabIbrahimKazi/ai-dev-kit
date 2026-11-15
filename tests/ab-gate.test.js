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
