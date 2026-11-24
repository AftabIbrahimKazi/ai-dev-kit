const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const m = require('../skills/workflow/role-session.claim.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'role-session.claim.js');
const proj = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'role space-')); fs.mkdirSync(path.join(d, 'handover', 'locks.d'), { recursive: true }); return d; };
const run = (root, ...a) => spawnSync(process.execPath, [CLI, ...a, '--root', root], { encoding: 'utf8' });

t('keys are injective: underscores, percent and at-signs are escaped before separators', () => {
  assert.strictEqual(m.keyFor('src/a/b.js'), 'src__a__b.js');
  assert.strictEqual(m.keyFor('src/my_file.js'), 'src__my%5Ffile.js');
  assert.strictEqual(m.keyFor('a\\b.js'), 'a__b.js');
  assert.notStrictEqual(m.keyFor('a__b.js'), m.keyFor('a/b.js'));
  assert.ok(!m.keyFor('@git').startsWith('@'));
});

t('claim takes every path with owner files, status editing', () => {
  const d = proj();
  const r = run(d, 'claim', 'claude-aa11', 'frontend', 'nav | toggle', 'src/nav.js', 'src/nav.css');
  assert.strictEqual(r.status, 0, r.stderr);
  const o = m.readOwner(path.join(d, 'handover', 'locks.d', 'src__nav.js'));
  assert.strictEqual(o.session, 'claude-aa11');
  assert.strictEqual(o.status, 'editing');
  assert.ok(!o.task.includes('|'));
});

t('a blocked claim takes nothing and names the holder', () => {
  const d = proj();
  run(d, 'claim', 'claude-aa11', 'frontend', 't', 'src/b.js');
  const r = run(d, 'claim', 'opencode-bb22', 'backend', 't', 'src/a.js', 'src/b.js');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /claude-aa11/);
  assert.ok(!fs.existsSync(path.join(d, 'handover', 'locks.d', 'src__a.js')), 'rolled back');
});

t('free reports locked paths and exits 1; clean paths exit 0', () => {
  const d = proj();
  run(d, 'claim', 'claude-aa11', 'frontend', 't', 'x.js');
  assert.strictEqual(run(d, 'free', 'x.js').status, 1);
  assert.strictEqual(run(d, 'free', 'y.js').status, 0);
});

t('status rewrites only the caller\'s file claims', () => {
  const d = proj();
  run(d, 'claim', 'claude-aa11', 'frontend', 't', 'x.js');
  run(d, 'claim', 'opencode-bb22', 'backend', 't', 'y.js');
  run(d, 'role', 'claude-aa11', 'frontend');
  assert.strictEqual(run(d, 'status', 'claude-aa11', 'awaiting-review').status, 0);
  const lk = path.join(d, 'handover', 'locks.d');
  assert.strictEqual(m.readOwner(path.join(lk, 'x.js')).status, 'awaiting-review');
  assert.strictEqual(m.readOwner(path.join(lk, 'y.js')).status, 'editing');
  assert.strictEqual(m.readOwner(path.join(lk, '@role__frontend')).status, 'editing');
});

t('one role, one live session', () => {
  const d = proj();
  assert.strictEqual(run(d, 'role', 'claude-aa11', 'tester').status, 0);
  const r = run(d, 'role', 'opencode-bb22', 'tester');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /claude-aa11/);
});

t('git token: second taker is refused, only the holder can release', () => {
  const d = proj();
  assert.strictEqual(run(d, 'git', 'take', 'claude-aa11').status, 0);
  assert.strictEqual(run(d, 'git', 'take', 'opencode-bb22').status, 1);
  assert.strictEqual(run(d, 'git', 'release', 'opencode-bb22').status, 1);
  assert.strictEqual(run(d, 'git', 'release', 'claude-aa11').status, 0);
  assert.ok(!fs.existsSync(path.join(d, 'handover', 'locks.d', '@git')));
});

t('release drops own claims, keeps the role unless --role, never touches another session', () => {
  const d = proj();
  run(d, 'claim', 'claude-aa11', 'frontend', 't', 'x.js');
  run(d, 'claim', 'opencode-bb22', 'backend', 't', 'y.js');
  run(d, 'role', 'claude-aa11', 'frontend');
  run(d, 'release', 'claude-aa11');
  const lk = path.join(d, 'handover', 'locks.d');
  assert.ok(!fs.existsSync(path.join(lk, 'x.js')));
  assert.ok(fs.existsSync(path.join(lk, 'y.js')));
  assert.ok(fs.existsSync(path.join(lk, '@role__frontend')));
  run(d, 'release', 'claude-aa11', '--role');
  assert.ok(!fs.existsSync(path.join(lk, '@role__frontend')));
});

t('list flags old claims and claims with no owner file as suspect', () => {
  const d = proj();
  const lk = path.join(d, 'handover', 'locks.d');
  fs.mkdirSync(path.join(lk, 'ghost'));
  m.take(d, 'old.js', { session: 's', role: 'r', task: 't', status: 'editing', claimed: new Date(Date.now() - 20 * 3600000).toISOString() });
  m.take(d, 'new.js', { session: 's', role: 'r', task: 't', status: 'editing', claimed: new Date().toISOString() });
  const rows = Object.fromEntries(m.list(d, 8).map((r) => [r.key, r.suspect]));
  assert.deepStrictEqual(rows, { ghost: true, 'new.js': false, 'old.js': true });
});

t('without handover/locks.d the script refuses and says parallel mode is off', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'role none-'));
  const r = run(d, 'claim', 'a', 'b', 'c', 'x.js');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Parallel mode is off/);
});

t('id prints tool-4hex', () => {
  const r = spawnSync(process.execPath, [CLI, 'id', 'opencode'], { encoding: 'utf8' });
  assert.match(r.stdout.trim(), /^opencode-[0-9a-f]{4}$/);
});
