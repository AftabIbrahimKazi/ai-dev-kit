const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { journalFacts, lastUpdated, nextTaskLine, slug } = require('../skills/workflow/handover.draft.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'handover.draft.js');
const sh = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); return r.stdout; };
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'draft space-'));
  sh(d, 'init', '-q', '-b', 'main'); sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'feat: first');
  return d;
}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-home-'));
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });

t('lastUpdated and nextTaskLine read the existing handover', () => {
  assert.strictEqual(lastUpdated('# H\n\nUpdated: 2026-11-10 · Branch: main\n'), '2026-11-10');
  assert.strictEqual(lastUpdated('# H\n'), null);
  assert.strictEqual(nextTaskLine('# H\n\n## Next task\ntsk-note: do x\n\n## Other\n'), 'tsk-note: do x');
  assert.strictEqual(nextTaskLine('# H\n'), null);
});

t('journalFacts keeps asks, files and failed commands, and skips damaged lines', () => {
  const lines = [JSON.stringify({ ask: 'fix the bug', edited: ['a.js', 'b.js'], cmds: ['npm test', '!npm run build'] }), 'not json', JSON.stringify({ ask: 'add a test', edited: ['a.js'], cmds: [] })];
  const f = journalFacts(lines);
  assert.match(f, /^2 turns/);
  assert.match(f, /files edited: a\.js, b\.js/);
  assert.match(f, /failed commands: npm run build/);
  assert.match(f, /- add a test/);
  assert.strictEqual(journalFacts([]), null);
});

t('draft prints the header, the commits since the last Updated date, uncommitted files and the existing next task', () => {
  const d = repo();
  fs.writeFileSync(path.join(d, 'handover.md'), '# H\n\nUpdated: 2000-01-01 · Branch: main\n\n## Next task\ntsk-note: keep me\n');
  fs.writeFileSync(path.join(d, 'new.txt'), 'x');
  const out = run(d).stdout;
  assert.match(out, /^Updated: \d{4}-\d{2}-\d{2} · Branch: main/);
  assert.match(out, /Commits since 2000-01-01 \(1\):\n {2}[0-9a-f]+ feat: first/);
  assert.match(out, /Uncommitted \(2\):/);
  assert.match(out, /Existing next task .*: tsk-note: keep me/);
  assert.match(out, /Size check: /);
  assert.ok(!/Session journal/.test(out), 'journal is opt-in');
  assert.ok(fs.readFileSync(path.join(d, 'handover.md'), 'utf8').includes('keep me'), 'never edits the handover');
});

t('--journal reads the newest journal for the project; without one it says so and gives git facts only', () => {
  const d = repo();
  assert.match(run(d, '--journal').stdout, /Note: no session journal for this project/);
  const dir = path.join(home, '.ai-dev-kit', 'sessions', slug(d));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1.jsonl'), JSON.stringify({ ask: 'old', edited: ['x.js'], cmds: [] }) + '\n');
  fs.writeFileSync(path.join(dir, '2.jsonl'), JSON.stringify({ ask: 'wire the draft', edited: ['wrap-up.md'], cmds: ['!node x'] }) + '\n');
  const t2 = new Date(Date.now() + 5000); fs.utimesSync(path.join(dir, '2.jsonl'), t2, t2);
  const out = run(d, '--journal').stdout;
  assert.match(out, /Session journal:\n {2}1 turns/);
  assert.match(out, /wire the draft/);
  assert.ok(!/- old/.test(out));
});

t('--json is one document; a bad flag exits 2', () => {
  const d = repo();
  const j = JSON.parse(run(d, '--json').stdout);
  assert.strictEqual(j.branch, 'main');
  assert.ok(Array.isArray(j.commits));
  assert.strictEqual(run(d, '--wat').status, 2);
});
