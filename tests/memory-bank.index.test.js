const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check, rebuild, init, parseIndex } = require('../skills/memory/memory-bank.index.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'memory', 'memory-bank.index.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mb space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

t('init creates the folders and INDEX.md; a second init changes nothing', () => {
  const d = proj();
  const made = init(d);
  assert.deepStrictEqual(made, ['memory-bank/', 'memory-bank/decisions/', 'memory-bank/context/', 'memory-bank/solutions/', 'memory-bank/INDEX.md']);
  assert.deepStrictEqual(init(d), []);
  assert.match(run(d, 'init').stdout, /already set up/);
});

t('check: unindexed entry, dead index line, too-long entry, no summary', () => {
  const d = proj();
  init(d);
  write(d, 'memory-bank/INDEX.md', '# Memory bank\n\n- [Gone](decisions/gone.md) — was here\n- [Kept](decisions/kept.md) — hook\n');
  write(d, 'memory-bank/decisions/kept.md', '# Kept\nSummary line.\n');
  write(d, 'memory-bank/solutions/new.md', '# New\nWhy it broke.\n');
  write(d, 'memory-bank/context/long.md', '# Long\n' + Array.from({ length: 25 }, (_, i) => 'l' + i).join('\n') + '\n');
  write(d, 'memory-bank/context/bare.md', '# Bare\n');
  const kinds = check(d).map((p) => p.kind + ':' + p.file).sort();
  assert.deepStrictEqual(kinds, ['dead-link:decisions/gone.md', 'no-summary:context/bare.md', 'too-long:context/long.md', 'unindexed:context/bare.md', 'unindexed:context/long.md', 'unindexed:solutions/new.md']);
  const r = run(d, 'check');
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /6 problems/);
});

t('rebuild keeps existing hooks, adds a line per unindexed file, drops dead lines, groups by folder', () => {
  const d = proj();
  init(d);
  write(d, 'memory-bank/INDEX.md', '# Project memory\n\n- [Gone](decisions/gone.md) — x\n- [Kept title](decisions/kept.md) — my sharp hook\n');
  write(d, 'memory-bank/decisions/kept.md', '# Kept\nSummary line.\n');
  write(d, 'memory-bank/solutions/new.md', '# New mystery\n**Symptom:** the build hung.\n');
  const r = rebuild(d);
  assert.deepStrictEqual(r.added, ['solutions/new.md']);
  assert.deepStrictEqual(r.dropped, ['decisions/gone.md']);
  const text = read(d, 'memory-bank/INDEX.md');
  assert.match(text, /^# Project memory\n/);
  assert.match(text, /## Decisions\n- \[Kept title\]\(decisions\/kept\.md\) — my sharp hook/);
  assert.match(text, /## Solutions\n- \[New mystery\]\(solutions\/new\.md\) — the build hung\./);
  assert.ok(!text.includes('gone.md'));
  assert.strictEqual(check(d).length, 0);
  assert.match(run(d, 'check').stdout, /consistent/);
});

t('rebuild --dry-run prints the index and writes nothing', () => {
  const d = proj();
  init(d);
  write(d, 'memory-bank/context/a.md', '# A\nhook a\n');
  const before = read(d, 'memory-bank/INDEX.md');
  const r = run(d, 'rebuild', '--dry-run');
  assert.match(r.stdout, /- \[A\]\(context\/a\.md\) — hook a/);
  assert.match(r.stdout, /would write/);
  assert.strictEqual(read(d, 'memory-bank/INDEX.md'), before);
});

t('parseIndex accepts em dash, en dash and hyphen separators and ./ prefixes', () => {
  const lines = parseIndex('- [A](a.md) — one\n* [B](./b.md) - two\n- [C](c.md) – three\n- [D](d.md)\ntext\n');
  assert.deepStrictEqual(lines.map((l) => [l.file, l.hook]), [['a.md', 'one'], ['b.md', 'two'], ['c.md', 'three'], ['d.md', '']]);
});

t('no memory-bank folder: check reports it (exit 1), rebuild errors (exit 1); bad usage exits 2', () => {
  const d = proj();
  const c = run(d, 'check');
  assert.strictEqual(c.status, 1);
  assert.match(c.stdout, /no memory-bank\/ folder/);
  assert.strictEqual(run(d, 'rebuild').status, 1);
  for (const bad of [['nope'], ['check', '--wat']]) {
    const r = run(d, ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});
