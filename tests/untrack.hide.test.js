const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const HIDE = path.join(__dirname, '../skills/workflow/untrack.hide.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const sh = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const run = (cwd, ...a) => spawnSync('node', [HIDE, ...a, '--cwd', cwd], { encoding: 'utf8' });
const status = (d) => sh(d, 'status', '--porcelain').stdout;

function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ut-'));
  sh(d, 'init', '-q', '-b', 'main');
  sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'commit.gpgsign', 'false');
  put(d, 'a.txt', '1\n'); put(d, 'cfg/x.json', '{}\n'); put(d, 'cfg/y.json', '{}\n');
  sh(d, 'add', '-A'); sh(d, 'commit', '-qm', 'init');
  return d;
}

t('a tracked file with local edits disappears from status, and comes back on show', () => {
  const d = repo();
  put(d, 'a.txt', 'edited\n');
  assert.match(status(d), /M a\.txt/);
  assert.strictEqual(run(d, 'hide', 'a.txt').status, 0);
  assert.strictEqual(status(d), '');
  put(d, 'a.txt', 'edited again\n');
  assert.strictEqual(status(d), '');
  run(d, 'show', 'a.txt');
  assert.match(status(d), /M a\.txt/);
});

t('a folder hides tracked edits and untracked files, including ones created later', () => {
  const d = repo();
  put(d, 'cfg/x.json', '{"a":1}\n'); put(d, 'cfg/new.json', '{}\n');
  assert.match(run(d, 'hide', 'cfg').stdout, /2 tracked file\(s\), exclude \/cfg\//);
  put(d, 'cfg/later.json', '{}\n');
  assert.strictEqual(status(d), '');
  run(d, 'show', 'cfg');
  assert.match(status(d), /cfg\/x\.json/);
  assert.match(status(d), /\?\? cfg\//);
  assert.ok(!fs.readFileSync(path.join(d, '.git/info/exclude'), 'utf8').includes('ai-dev-kit untrack'));
});

t('a glob hides matching files only', () => {
  const d = repo();
  put(d, 'k.log', 'x\n'); put(d, 'keep.txt', 'x\n');
  run(d, 'hide', '*.log');
  assert.doesNotMatch(status(d), /k\.log/);
  assert.match(status(d), /keep\.txt/);
});

t('list reports both kinds; nothing is staged, committed or written to .gitignore', () => {
  const d = repo();
  put(d, 'n.txt', 'x\n');
  run(d, 'hide', 'a.txt', 'n.txt');
  const out = run(d, 'list').stdout;
  assert.match(out, /skip-worktree\): 1[\s\S]*a\.txt/);
  assert.match(out, /excluded locally: 1[\s\S]*\/n\.txt/);
  assert.strictEqual(sh(d, 'diff', '--cached', '--name-only').stdout, '');
  assert.ok(!fs.existsSync(path.join(d, '.gitignore')));
});

t('existing exclude lines survive hide and show; paths work from a subfolder', () => {
  const d = repo();
  fs.appendFileSync(path.join(d, '.git/info/exclude'), 'mine.tmp\n');
  put(d, 'cfg/x.json', 'e\n');
  const r = spawnSync('node', [HIDE, 'hide', 'x.json'], { cwd: path.join(d, 'cfg'), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(status(d), '');
  run(d, 'show', 'cfg/x.json');
  assert.match(fs.readFileSync(path.join(d, '.git/info/exclude'), 'utf8'), /mine\.tmp/);
});

t('bad input exits non-zero', () => {
  const d = repo();
  assert.strictEqual(run(d, 'hide').status, 2);
  assert.strictEqual(run(d, 'hide', '../elsewhere').status, 1);
});
