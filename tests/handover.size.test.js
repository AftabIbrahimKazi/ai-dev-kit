const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check, countSessionSections, countBullets } = require('../skills/workflow/handover.size.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'handover.size.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'size space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });
const lines = (n) => Array.from({ length: n }, (_, i) => 'line ' + i).join('\n') + '\n';

t('a short handover with one Last session block is silent and exits 0', () => {
  const d = proj();
  write(d, 'handover.md', '# H\n\n## Current state\nok\n\n## Last session\ndone\n');
  const r = run(d, 'check');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

t('a handover over 120 lines is reported with its line count', () => {
  const d = proj();
  write(d, 'handover.md', lines(121));
  const r = run(d, 'check');
  assert.match(r.stdout, /handover\.md: 121 lines \(limit 120\)/);
  assert.match(r.stdout, /memory-gardener/);
});

t('exactly 120 lines is within the limit', () => {
  const d = proj();
  write(d, 'handover.md', lines(120));
  assert.strictEqual(run(d, 'check').stdout, '');
});

t('stacked session sections are reported', () => {
  const d = proj();
  write(d, 'handover.md', '# H\n## Latest session (2026-10-29)\na\n## Earlier session (2026-10-28)\nb\n## Last session\nc\n');
  assert.match(run(d, 'check').stdout, /3 session sections \(want 1/);
  assert.strictEqual(countSessionSections('## Last session\nx\n'), 1);
  assert.strictEqual(countSessionSections('### Not level two session\n'), 0);
});

t('a learnings.md over the bullet limit is reported; under it is silent', () => {
  const d = proj();
  write(d, '.claude/skills/plan-first/learnings.md', Array.from({ length: 31 }, (_, i) => '- bullet ' + i).join('\n') + '\n');
  write(d, '.claude/skills/handover/learnings.md', '- one\n- two\n');
  const out = run(d, 'check').stdout;
  assert.match(out, /\.claude\/skills\/plan-first\/learnings\.md: 31 bullets \(limit 30\)/);
  assert.ok(!out.includes('handover/learnings.md'));
  assert.strictEqual(countBullets('- a\n  - b\ntext\n* c\n-\n'), 3);
});

t('role handover files are checked each; board.md and locks.d are skipped', () => {
  const d = proj();
  write(d, 'handover/backend.md', lines(130));
  write(d, 'handover/board.md', lines(500));
  write(d, 'handover/locks.d/x.md', lines(500));
  const out = run(d, 'check').stdout;
  assert.match(out, /handover\/backend\.md: 130 lines/);
  assert.ok(!out.includes('board.md') && !out.includes('locks.d'));
});

t('--max-lines and --max-bullets change the limits', () => {
  const d = proj();
  write(d, 'handover.md', lines(10));
  assert.match(run(d, 'check', '--max-lines', '5').stdout, /10 lines \(limit 5\)/);
});

t('--json prints one document; --strict exits 1 on a problem and 0 when clean', () => {
  const d = proj();
  write(d, 'handover.md', lines(130));
  const j = JSON.parse(run(d, 'check', '--json').stdout);
  assert.strictEqual(j.ok, false);
  assert.strictEqual(j.problems[0].found, 130);
  assert.strictEqual(run(d, 'check', '--strict').status, 1);
  const clean = proj();
  assert.strictEqual(run(clean, 'check', '--strict').status, 0);
});

t('--quiet is accepted; nothing to check is silent and exit 0', () => {
  const d = proj();
  const r = run(d, 'check', '--quiet');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

t('bad usage exits 2 with one usage line', () => {
  const d = proj();
  for (const bad of [['nope'], ['check', '--wat'], ['check', '--max-lines', 'x']]) {
    const r = run(d, ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});

t('check() returns problems as data', () => {
  const d = proj();
  write(d, 'handover.md', lines(125));
  assert.deepStrictEqual(check(d).map((p) => [p.kind, p.found]), [['lines', 125]]);
});
