const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SKILLS = path.join(__dirname, '../skills/workflow');
const INSTALL = path.join(SKILLS, 'pre-commit.install-hook.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const sh = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const inst = (cwd, ...a) => spawnSync('node', [INSTALL, ...a, '--cwd', cwd], { encoding: 'utf8' });

// Installed layout: <repo>/.claude/skills/pre-commit/{check.js,install-hook.js}
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ih-'));
  sh(d, 'init', '-q', '-b', 'main');
  sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'commit.gpgsign', 'false');
  const dir = path.join(d, '.claude/skills/pre-commit');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(SKILLS, 'pre-commit.check.js'), path.join(dir, 'check.js'));
  fs.copyFileSync(INSTALL, path.join(dir, 'install-hook.js'));
  put(d, 'README.md', '# r\n');
  sh(d, 'add', '-A'); sh(d, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'chore: init');
  return d;
}
const installed = (d) => spawnSync('node', [path.join(d, '.claude/skills/pre-commit/install-hook.js'), 'install', '--cwd', d], { encoding: 'utf8' });
const commit = (d, msg) => sh(d, 'commit', '-m', msg);
const hookFile = (d, n) => path.join(d, '.git/hooks', n);

t('install writes both hooks pointing at the repo-relative engine, and status agrees', () => {
  const d = repo();
  const r = installed(d);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /pre-commit: installed -> \.claude\/skills\/pre-commit\/check\.js/);
  assert.match(fs.readFileSync(hookFile(d, 'commit-msg'), 'utf8'), /ai-dev-kit git hook/);
  assert.match(inst(d, 'status').stdout, /pre-commit: installed[\s\S]*commit-msg: installed/);
});

t('a clean commit with a conventional message goes through', () => {
  const d = repo(); installed(d);
  put(d, 'a.txt', 'hello\n'); sh(d, 'add', 'a.txt');
  const c = commit(d, 'feat: add a');
  assert.strictEqual(c.status, 0, c.stdout + c.stderr);
});

t('a leaked key is blocked before the commit exists', () => {
  const d = repo(); installed(d);
  put(d, 'k.js', 'const k = "sk-ant-' + 'a'.repeat(30) + '";\n'); sh(d, 'add', 'k.js');
  const before = sh(d, 'rev-list', '--count', 'HEAD').stdout.trim();
  const c = commit(d, 'feat: add key');
  assert.notStrictEqual(c.status, 0);
  assert.match(c.stdout + c.stderr, /BLOCK/);
  assert.strictEqual(sh(d, 'rev-list', '--count', 'HEAD').stdout.trim(), before);
});

t('a secret file is blocked', () => {
  const d = repo(); installed(d);
  put(d, '.env', 'A=1\n'); sh(d, 'add', '-f', '.env');
  assert.notStrictEqual(commit(d, 'feat: env').status, 0);
});

t('a non-conventional message is blocked; merge, revert and fixup messages are not checked', () => {
  const d = repo(); installed(d);
  put(d, 'a.txt', '1\n'); sh(d, 'add', 'a.txt');
  const bad = commit(d, 'Added the thing');
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /type: summary/);
  assert.strictEqual(commit(d, 'Revert "feat: x"').status, 0);
  put(d, 'b.txt', '2\n'); sh(d, 'add', 'b.txt');
  assert.strictEqual(commit(d, 'fixup! feat: x').status, 0);
});

t('a warning prints but does not fail the commit', () => {
  const d = repo(); installed(d);
  put(d, 'a.txt', '1\n'); sh(d, 'add', 'a.txt');
  const c = commit(d, 'feat: a header that is clearly longer than fifty characters in total');
  assert.strictEqual(c.status, 0, c.stdout + c.stderr);
});

t('another hook is left alone without --force, kept as a backup with it, and restored on uninstall', () => {
  const d = repo();
  fs.mkdirSync(path.join(d, '.git/hooks'), { recursive: true });
  fs.writeFileSync(hookFile(d, 'pre-commit'), '#!/bin/sh\necho mine\n');
  const r = installed(d);
  assert.match(r.stdout, /pre-commit: another hook exists, left alone/);
  assert.match(fs.readFileSync(hookFile(d, 'pre-commit'), 'utf8'), /echo mine/);
  const f = spawnSync('node', [path.join(d, '.claude/skills/pre-commit/install-hook.js'), 'install', '--force', '--cwd', d], { encoding: 'utf8' });
  assert.match(f.stdout, /pre-commit: installed/);
  assert.ok(fs.existsSync(hookFile(d, 'pre-commit') + '.pre-ai-dev-kit'));
  const u = inst(d, 'uninstall');
  assert.match(u.stdout, /pre-commit: removed, previous hook restored/);
  assert.match(fs.readFileSync(hookFile(d, 'pre-commit'), 'utf8'), /echo mine/);
  assert.ok(!fs.existsSync(hookFile(d, 'commit-msg')));
});

t('a missing engine or node never blocks a commit', () => {
  const d = repo(); installed(d);
  fs.rmSync(path.join(d, '.claude/skills/pre-commit/check.js'));
  put(d, 'a.txt', '1\n'); sh(d, 'add', 'a.txt');
  const c = commit(d, 'anything goes here');
  assert.strictEqual(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stderr, /skipping/);
});

t('install outside a git repository fails clearly', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ih-nogit-'));
  const dir = path.join(d, 's'); fs.mkdirSync(dir);
  fs.copyFileSync(path.join(SKILLS, 'pre-commit.check.js'), path.join(dir, 'check.js'));
  fs.copyFileSync(INSTALL, path.join(dir, 'install-hook.js'));
  const r = spawnSync('node', [path.join(dir, 'install-hook.js'), 'install', '--cwd', d], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /not inside a git repository/);
});

t('core.hooksPath is honoured', () => {
  const d = repo();
  sh(d, 'config', 'core.hooksPath', '.githooks');
  installed(d);
  assert.ok(fs.existsSync(path.join(d, '.githooks/pre-commit')));
  assert.ok(!fs.existsSync(path.join(d, '.git/hooks/pre-commit')));
});
