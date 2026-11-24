const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/workflow/resolve-conflicts.scope.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const git = (d, ...a) => { const r = spawnSync('git', a, { cwd: d, encoding: 'utf8' }); return r; };
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const run = (d, ...a) => spawnSync('node', [SCRIPT, ...a, '--cwd', d], { encoding: 'utf8' });

// A repo whose merge of "feature" into "main" conflicts in ui/a.txt, server/b.txt and package-lock.json.
function conflicted(roles) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'config', 'user.email', 't@t.t'); git(d, 'config', 'user.name', 't'); git(d, 'config', 'commit.gpgsign', 'false');
  for (const f of ['ui/a.txt', 'server/b.txt', 'package-lock.json']) put(d, f, 'base\n');
  git(d, 'add', '-A'); git(d, 'commit', '-qm', 'base');
  git(d, 'checkout', '-qb', 'feature');
  for (const f of ['ui/a.txt', 'server/b.txt', 'package-lock.json']) put(d, f, 'feature\n');
  git(d, 'commit', '-qam', 'feature');
  git(d, 'checkout', '-q', 'main');
  for (const f of ['ui/a.txt', 'server/b.txt', 'package-lock.json']) put(d, f, 'main\n');
  git(d, 'commit', '-qam', 'main');
  git(d, 'merge', 'feature');
  if (roles) put(d, '.claude/conflict-roles.json', JSON.stringify(roles));
  return d;
}
const FRONTEND = { roles: { frontend: { in: ['ui/**'], out: ['server/**'], outOfScope: 'leave' } } };

t('list reports the merge legend, hunks and kind for every conflicted file', () => {
  const d = conflicted();
  const r = run(d, 'list');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^merge: ours = main; theirs = feature/);
  assert.match(r.stdout, /ui\/a\.txt {2}hunks=1 {2}code {2}scope=-/);
  assert.match(r.stdout, /package-lock\.json {2}hunks=1 {2}generated/);
});
t('role splits files into in and out of scope; a file matching neither list is out when "in" is set', () => {
  const d = conflicted(FRONTEND);
  const rows = JSON.parse(run(d, 'list', '--role', 'frontend', '--json').stdout).rows;
  const scope = Object.fromEntries(rows.map((x) => [x.file, x.scope]));
  assert.deepStrictEqual(scope, { 'package-lock.json': 'out', 'server/b.txt': 'out', 'ui/a.txt': 'in' });
});
t('an unknown role is an error, not a silent all-in-scope', () => {
  const d = conflicted(FRONTEND);
  const r = run(d, 'list', '--role', 'backend');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /role "backend" is not defined/);
});
t('check fails while a marker remains in an in-scope file', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  const r = run(d, 'check', '--role', 'frontend');
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /FAIL ui\/a\.txt {2}conflict markers remain/);
  assert.match(r.stdout, /LEFT server\/b\.txt/);
});
t('policy leave: in-scope resolved and out-of-scope untouched passes', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  put(d, 'ui/a.txt', 'main\nfeature\n'); git(d, 'add', 'ui/a.txt');
  const r = run(d, 'check', '--role', 'frontend');
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /3 conflicted, 0 failed, 2 left for the owner/);
});
t('policy leave: resolving an out-of-scope file fails', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  put(d, 'ui/a.txt', 'ok\n'); put(d, 'server/b.txt', 'sneaky\n'); git(d, 'add', '-A');
  const r = run(d, 'check', '--role', 'frontend');
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /FAIL server\/b\.txt {2}out of scope but was resolved/);
});
t('policy theirs: out-of-scope file must equal their side', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend', '--out', 'theirs');
  put(d, 'ui/a.txt', 'ok\n'); put(d, 'server/b.txt', 'feature\n'); put(d, 'package-lock.json', 'feature\n');
  git(d, 'add', '-A');
  assert.strictEqual(run(d, 'check', '--role', 'frontend', '--out', 'theirs').status, 0);
  put(d, 'server/b.txt', 'main\n'); git(d, 'add', '-A');
  const bad = run(d, 'check', '--role', 'frontend', '--out', 'theirs');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /server\/b\.txt {2}out of scope; must equal theirs/);
});
t('no role: every file is in scope and all markers must go', () => {
  const d = conflicted();
  run(d, 'list');
  assert.strictEqual(run(d, 'check').status, 1);
  for (const f of ['ui/a.txt', 'server/b.txt', 'package-lock.json']) put(d, f, 'merged\n');
  git(d, 'add', '-A');
  assert.strictEqual(run(d, 'check').status, 0);
});
t('check without a saved set tells the user to run list', () => {
  const d = conflicted();
  const r = run(d, 'check');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /run "list" before resolving/);
});

t('shipped example config: frontend and backend are mirror images', () => {
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, '../skills/workflow/resolve-conflicts.roles.example.json'), 'utf8'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  put(d, '.claude/conflict-roles.json', JSON.stringify(example));
  const { loadRole, scopeOf } = require(SCRIPT);
  const fe = loadRole(d, 'frontend');
  const be = loadRole(d, 'backend');
  const files = { 'src/components/Nav.tsx': ['in', 'out'], 'styles/site.css': ['in', 'out'], 'api/users.php': ['out', 'in'], 'migrations/001.sql': ['out', 'in'], 'composer.lock': ['out', 'in'], 'package-lock.json': ['in', 'in'], 'README.md': ['out', 'out'] };
  for (const [f, [wantFe, wantBe]] of Object.entries(files)) {
    assert.strictEqual(scopeOf(fe, f), wantFe, `frontend ${f}`);
    assert.strictEqual(scopeOf(be, f), wantBe, `backend ${f}`);
  }
  assert.strictEqual(loadRole(d, null).name, 'frontend');
});

t('the role file is found in .opencode/ and .agents/ as well as .claude/', () => {
  const { loadRole } = require(SCRIPT);
  for (const dir of ['.opencode', '.agents']) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
    put(d, `${dir}/conflict-roles.json`, JSON.stringify(FRONTEND));
    assert.strictEqual(loadRole(d, 'frontend').name, 'frontend', dir);
  }
});

const lib = require(SCRIPT);

t('parseArgs: saving is on by default and --no-save turns it off', () => {
  assert.strictEqual(lib.parseArgs(['list']).save, true);
  assert.strictEqual(lib.parseArgs(['list', '--no-save']).save, false);
});

t('--no-save writes no conflict set, so check has nothing to compare with', () => {
  const d = conflicted();
  assert.strictEqual(run(d, 'list', '--no-save').status, 0);
  const r = run(d, 'check');
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /no saved conflict set/);
});

t('loadRole: a role with only "in" has no out patterns and leaves out-of-scope files alone by default', () => {
  const d = conflicted({ roles: { r: { in: ['ui/**'] } } });
  const role = lib.loadRole(d, 'r');
  assert.strictEqual(role.outRe.length, 0);
  assert.strictEqual(role.outOfScope, 'leave');
  assert.strictEqual(role.inRe.length, 1);
});

t('check policy: --out wins, then the saved one, then leave', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  assert.strictEqual(JSON.parse(run(d, 'check', '--role', 'frontend', '--json').stdout).policy, 'leave');
  assert.strictEqual(JSON.parse(run(d, 'check', '--role', 'frontend', '--out', 'ours', '--json').stdout).policy, 'ours');
  const e = conflicted();
  run(e, 'list');
  assert.strictEqual(JSON.parse(run(e, 'check', '--json').stdout).policy, 'leave');
  const f = conflicted(FRONTEND);
  run(f, 'list', '--role', 'frontend', '--out', 'theirs');
  assert.strictEqual(JSON.parse(run(f, 'check', '--json').stdout).policy, 'theirs');
});

t('policy leave: an out-of-scope file still unmerged counts as left even with its markers edited away; a resolved one fails', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  put(d, 'server/b.txt', 'hand edited, not added\n');
  const left = JSON.parse(run(d, 'check', '--role', 'frontend', '--json').stdout);
  assert.ok(left.left.includes('server/b.txt'), JSON.stringify(left));
  git(d, 'add', 'server/b.txt');
  const done = JSON.parse(run(d, 'check', '--role', 'frontend', '--json').stdout);
  assert.ok(done.fails.some((f) => /server\/b\.txt {2}out of scope but was resolved/.test(f)), JSON.stringify(done));
});

t('policy leave: an out-of-scope file that is no longer unmerged but still has markers counts as left', () => {
  const d = conflicted(FRONTEND);
  run(d, 'list', '--role', 'frontend');
  put(d, 'server/b.txt', '<<<<<<< ours\nx\n=======\ny\n>>>>>>> theirs\n');
  git(d, 'add', 'server/b.txt');
  const r = JSON.parse(run(d, 'check', '--role', 'frontend', '--json').stdout);
  assert.ok(r.left.includes('server/b.txt'), JSON.stringify(r));
  assert.ok(!r.fails.some((f) => /server\/b\.txt/.test(f)), JSON.stringify(r));
});

t('list saves the chosen --out policy, with or without a role', () => {
  const d = conflicted(FRONTEND);
  assert.strictEqual(JSON.parse(run(d, 'list', '--role', 'frontend', '--out', 'ours', '--json').stdout).outOfScope, 'ours');
  const e = conflicted();
  assert.strictEqual(JSON.parse(run(e, 'list', '--out', 'theirs', '--json').stdout).outOfScope, 'theirs');
  assert.strictEqual(JSON.parse(run(conflicted(FRONTEND), 'list', '--role', 'frontend', '--json').stdout).outOfScope, 'leave');
  assert.strictEqual(JSON.parse(run(conflicted(), 'list', '--json').stdout).outOfScope, null);
});

t('the legend names a rebase when either rebase folder exists', () => {
  for (const marker of ['rebase-merge', 'rebase-apply']) {
    const d = conflicted();
    fs.mkdirSync(path.join(d, '.git', marker), { recursive: true });
    const legend = JSON.parse(run(d, 'list', '--json').stdout).legend;
    assert.strictEqual(legend.op, 'rebase', marker);
    assert.match(legend.theirs, /your commit being replayed/);
  }
});
