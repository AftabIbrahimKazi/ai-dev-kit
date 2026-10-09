const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { analyse, pickSessions } = require('../skills/workflow/session-budget.report.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const row = (o) => ({ v: 1, ts: '2026-10-09T10:00:00.000Z', sid: 's1', turnId: 't', model: 'm', in: 10, out: 5, cr: 0, cw: 0, ms: 1, usd: 0.01, ctxPct: 5, tools: [], ...o });
const ses = (rows) => analyse({ sid: 's1', rows });

t('totals, cost from last row, models', () => {
  const a = ses([row({ ts: '2026-10-09T10:00:01Z', in: 100, out: 10, cr: 900, cw: 0, usd: 0.5 }), row({ ts: '2026-10-09T10:00:02Z', in: 50, out: 20, cr: 950, cw: 0, usd: 0.9 })]);
  assert.strictEqual(a.tokens.in, 150);
  assert.strictEqual(a.tokens.out, 30);
  assert.strictEqual(a.tokens.prompt, 2000);
  assert.strictEqual(a.costUsd, 0.9);
  assert.strictEqual(Math.round(a.cacheHit * 100), 93);
  assert.deepStrictEqual(a.models, ['m']);
});
t('repeat read flagged only when file unchanged', () => {
  const a = ses([row({ ts: '1', tools: [{ t: 'Read', k: 'a.js', c: 100 }, { t: 'Read', k: 'a.js', c: 100 }, { t: 'Read', k: 'b.js', c: 100 }, { t: 'Edit', k: 'b.js', c: 5 }, { t: 'Read', k: 'b.js', c: 100 }] })]);
  assert.deepStrictEqual(a.repeatReads, ['a.js']);
});
t('large read flagged with token estimate', () => {
  const a = ses([row({ tools: [{ t: 'Read', k: 'big.js', c: 80000 }, { t: 'Read', k: 'small.js', c: 1000 }] })]);
  assert.deepStrictEqual(a.largeReads, [{ k: 'big.js', tokens: 20000 }]);
});
t('repeated identical grep flagged', () => {
  const a = ses([row({ tools: [{ t: 'Grep', k: 'foo', c: 10 }, { t: 'Grep', k: 'foo', c: 10 }, { t: 'Grep', k: 'bar', c: 10 }] })]);
  assert.deepStrictEqual(a.repeatGreps, [{ k: 'foo', n: 2 }]);
});
t('low cache turn flagged, first turn and small prompts ignored', () => {
  const a = ses([row({ ts: '1', in: 30000, cr: 0 }), row({ ts: '2', in: 30000, cr: 0 }), row({ ts: '3', in: 100, cr: 0 }), row({ ts: '4', in: 1000, cr: 29000 })]);
  assert.deepStrictEqual(a.lowCacheTurns, [2]);
});
t('subagent turns are counted apart', () => {
  const a = ses([row({ ts: '1' }), row({ ts: '2', agentId: 'x' })]);
  assert.strictEqual(a.turns, 1);
  assert.strictEqual(a.subagentTurns, 1);
});
t('skills counted', () => {
  const a = ses([row({ tools: [{ t: 'Skill', k: 'plan-first', c: 1 }, { t: 'Skill', k: 'plan-first', c: 1 }, { t: 'Skill', k: 'handover', c: 1 }] })]);
  assert.deepStrictEqual(a.skills, [{ k: 'plan-first', n: 2 }, { k: 'handover', n: 1 }]);
});
t('top tools ranked by result size', () => {
  const a = ses([row({ tools: [{ t: 'Bash', k: 'ls', c: 400 }, { t: 'Read', k: 'x', c: 4000 }] })]);
  assert.strictEqual(a.topTools[0].k, 'Read');
  assert.strictEqual(a.topTools[0].tokens, 1000);
});
t('missing cost stays null', () => {
  assert.strictEqual(ses([row({ usd: null })]).costUsd, null);
});
t('pickSessions takes the most recent N', () => {
  const rows = [row({ sid: 'a', ts: '2026-10-01' }), row({ sid: 'b', ts: '2026-10-02' }), row({ sid: 'c', ts: '2026-10-03' })];
  assert.deepStrictEqual(pickSessions(rows, { last: 2 }).map((s) => s.sid), ['b', 'c']);
  assert.deepStrictEqual(pickSessions(rows, { sid: 'a' }).map((s) => s.sid), ['a']);
});
t('cli skips a torn line and prints a report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-'));
  const f = path.join(dir, 'd.jsonl');
  fs.writeFileSync(f, JSON.stringify(row({})) + '\n{"broken":\n' + JSON.stringify(row({ ts: '2026-10-09T10:00:05Z' })) + '\n');
  const r = spawnSync('node', [path.join(__dirname, '../skills/workflow/session-budget.report.js'), '--file', f], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('session s1 | 2 turns'), r.stdout);
});
t('cli with no ledger exits 1', () => {
  const r = spawnSync('node', [path.join(__dirname, '../skills/workflow/session-budget.report.js'), '--dir', path.join(os.tmpdir(), 'nope-' + Date.now())], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
});
