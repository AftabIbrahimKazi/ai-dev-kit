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

t('cli: status, release and git usage errors, and bad status words, all exit 1 with a usage line', () => {
  const d = proj();
  assert.strictEqual(run(d, 'claim', 's1', 'dev', 'task', 'a.js').status, 0);
  const noStatus = run(d, 'status', 's1');
  assert.strictEqual(noStatus.status, 1); assert.match(noStatus.stderr, /usage: status <session> editing\|awaiting-review/);
  const badStatus = run(d, 'status', 's1', 'napping');
  assert.strictEqual(badStatus.status, 1);
  assert.match(run(d, 'status', 's1', 'awaiting-review').stdout, /1 claim\(s\) now awaiting-review/);
  assert.match(run(d, 'release').stderr, /usage: release/);
  const gitBad = run(d, 'git', 'borrow', 's1');
  assert.strictEqual(gitBad.status, 1); assert.match(gitBad.stderr, /usage: git take\|release <session>/);
  assert.strictEqual(run(d, 'git', 'take').status, 1);
});

t('cli: git take is exclusive, release by another session is refused, id prefixes the name, bogus commands list the real ones', () => {
  const d = proj();
  assert.match(run(d, 'git', 'take', 's1').stdout, /git token taken/);
  const second = run(d, 'git', 'take', 's2');
  assert.strictEqual(second.status, 1); assert.match(second.stderr, /@git is held by s1/);
  const wrong = run(d, 'git', 'release', 's2');
  assert.strictEqual(wrong.status, 1); assert.match(wrong.stderr, /@git belongs to s1, not you/);
  assert.match(run(d, 'git', 'release', 's1').stdout, /git token released/);
  assert.match(run(d, 'id', 'bob').stdout, /^bob-[0-9a-f]{4}\n$/);
  assert.match(run(d, 'id').stdout, /^claude-[0-9a-f]{4}\n$/);
  const bogus = run(d, 'frobnicate');
  assert.strictEqual(bogus.status, 1); assert.match(bogus.stderr, /commands: id, role, free, claim, status, release, git, list, key/);
});

t('cli: release keeps the role claim unless --role is given; list shows claims, none, and --json', () => {
  const d = proj();
  run(d, 'role', 's1', 'frontend');
  run(d, 'claim', 's1', 'frontend', 'job', 'a.js');
  assert.match(run(d, 'release', 's1').stdout, /released 1$/m);
  assert.match(run(d, 'list').stdout, /@role__frontend/);
  assert.match(run(d, 'release', 's1', '--role').stdout, /released 1$/m);
  assert.match(run(d, 'list').stdout, /^no claims$/m);
  run(d, 'claim', 's2', 'dev', 'job', 'b.js');
  const rows = JSON.parse(run(d, 'list', '--json').stdout);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].owner.session, 's2');
  assert.match(run(d, 'list').stdout, /s2 \| dev \| editing/);
});

t('cli: --json and --role flags do not leak into the command arguments; free reports locked paths with exit 1', () => {
  const d = proj();
  run(d, 'claim', 's1', 'dev', 'job', 'a.js');
  const free = run(d, 'free', 'a.js', 'b.js');
  assert.strictEqual(free.status, 1);
  assert.match(free.stdout, /LOCKED a\.js by s1 \(dev, editing\)/);
  assert.match(run(d, 'free', 'b.js').stdout, /free: 1 path\(s\)/);
  assert.match(run(d, '--json', 'free', 'b.js').stdout, /free: 1 path/);
});
