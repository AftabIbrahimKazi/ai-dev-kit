const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { append, validate } = require('../skills/meta/misfire-log.append.js');
const { readRows, summarize } = require('../skills/meta/misfire-log.report.js');
const APPEND = path.join(__dirname, '../skills/meta/misfire-log.append.js');
const REPORT = path.join(__dirname, '../skills/meta/misfire-log.report.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'misfire-'));

t('append writes one row with the given fields, creating the folder', () => {
  const d = tmp();
  const file = path.join(d, '.claude', 'misfires.jsonl');
  const res = append({ kind: 'skill', name: 'mcp-manager', side: 'kit', expected: 'route to image-gen', actual: 'no tool found', file });
  assert.ok(res.ok);
  const row = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assert.strictEqual(row.kind, 'skill');
  assert.strictEqual(row.name, 'mcp-manager');
  assert.strictEqual(row.side, 'kit');
  assert.ok(row.ts);
  assert.ok(!('evidence' in row));
});

t('append includes evidence only when given', () => {
  const d = tmp();
  const file = path.join(d, 'misfires.jsonl');
  append({ kind: 'mod', name: 'guard', side: 'assistant', expected: 'x', actual: 'y', evidence: 'log.txt:3', file });
  const row = JSON.parse(fs.readFileSync(file, 'utf8').trim());
  assert.strictEqual(row.evidence, 'log.txt:3');
});

t('validate rejects a bad kind, side, or missing required field', () => {
  assert.deepStrictEqual(validate({ kind: 'bad', side: 'kit', name: 'x', expected: 'e', actual: 'a' }).length > 0, true);
  assert.deepStrictEqual(validate({ kind: 'skill', side: 'bad', name: 'x', expected: 'e', actual: 'a' }).length > 0, true);
  assert.deepStrictEqual(validate({ kind: 'skill', side: 'kit', expected: 'e', actual: 'a' }).length > 0, true);
  assert.deepStrictEqual(validate({ kind: 'skill', side: 'kit', name: 'x', actual: 'a' }).length > 0, true);
  assert.deepStrictEqual(validate({ kind: 'skill', side: 'kit', name: 'x', expected: 'e', actual: 'a' }), []);
});

t('append appends across calls instead of overwriting', () => {
  const d = tmp();
  const file = path.join(d, 'misfires.jsonl');
  append({ kind: 'skill', name: 'a', side: 'kit', expected: 'e', actual: 'a', file });
  append({ kind: 'skill', name: 'b', side: 'kit', expected: 'e', actual: 'a', file });
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
});

t('readRows tolerates a missing file and a torn line', () => {
  const d = tmp();
  assert.deepStrictEqual(readRows(path.join(d, 'nope.jsonl')), []);
  const file = path.join(d, 'misfires.jsonl');
  fs.writeFileSync(file, '{"kind":"skill","name":"a"}\n{not json\n{"kind":"mod","name":"b"}\n');
  assert.strictEqual(readRows(file).length, 2);
});

t('summarize ranks repeated (kind,name) pairs first and counts by kind/side', () => {
  const rows = [
    { kind: 'skill', name: 'mcp-manager', side: 'kit' },
    { kind: 'skill', name: 'mcp-manager', side: 'assistant' },
    { kind: 'addon', name: 'system1-prefilter', side: 'kit' },
  ];
  const sum = summarize(rows);
  assert.strictEqual(sum.total, 3);
  assert.deepStrictEqual(sum.byKind, { skill: 2, addon: 1 });
  assert.deepStrictEqual(sum.bySide, { kit: 2, assistant: 1 });
  assert.strictEqual(sum.pairs[0].pair, 'skill:mcp-manager');
  assert.strictEqual(sum.pairs[0].count, 2);
  assert.strictEqual(sum.repeated.length, 1);
});

t('cli: append then report round-trip, --json matches summarize', () => {
  const d = tmp();
  const file = path.join(d, 'misfires.jsonl');
  const r1 = spawnSync('node', [APPEND, '--kind', 'skill', '--name', 'x', '--side', 'kit', '--expected', 'e', '--actual', 'a', '--file', file], { encoding: 'utf8' });
  assert.strictEqual(r1.status, 0);
  const r2 = spawnSync('node', [REPORT, '--file', file, '--json'], { encoding: 'utf8' });
  assert.strictEqual(r2.status, 0);
  const sum = JSON.parse(r2.stdout);
  assert.strictEqual(sum.total, 1);
});

t('cli: append exits 2 with a clear message on bad args', () => {
  const r = spawnSync('node', [APPEND, '--kind', 'nonsense'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.ok(/--kind/.test(r.stderr));
});

t('cli: report exits 1 and says so when the log has nothing', () => {
  const d = tmp();
  const r = spawnSync('node', [REPORT, '--file', path.join(d, 'none.jsonl')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.ok(/no misfires logged/.test(r.stdout));
});
