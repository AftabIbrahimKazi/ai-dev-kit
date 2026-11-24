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

const exclude = (d) => path.join(d, '.git', 'info', 'exclude');

t('hide counts every file in batches of 200: 200 and 201 files are both hidden in full', () => {
  for (const n of [200, 201]) {
    const d = repo();
    for (let i = 0; i < n; i++) put(d, 'many/f' + i + '.txt', 'x');
    sh(d, 'add', '-A'); sh(d, 'commit', '-qm', 'many');
    const r = run(d, 'hide', 'many');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp('hidden  many: ' + n + ' tracked file'));
    put(d, 'many/f0.txt', 'edited');
    assert.strictEqual(status(d), '');
  }
});

t('the exclude block: a file without a trailing newline keeps its text, a broken block is ignored, an empty block is removed', () => {
  const d = repo();
  fs.writeFileSync(exclude(d), 'keepme');
  put(d, 'new.txt', 'u');
  assert.strictEqual(run(d, 'hide', 'new.txt').status, 0);
  const text = fs.readFileSync(exclude(d), 'utf8');
  assert.ok(text.startsWith('keepme\n# ai-dev-kit untrack: begin'), JSON.stringify(text));
  assert.ok(text.includes('/new.txt\n# ai-dev-kit untrack: end\n'));
  const e = repo();
  fs.writeFileSync(exclude(e), '# ai-dev-kit untrack: end\nold\n# ai-dev-kit untrack: begin (managed by untrack/hide.js, edit with hide/show)\n');
  put(e, 'n.txt', 'u');
  assert.strictEqual(run(e, 'hide', 'n.txt').status, 0);
  const t2 = fs.readFileSync(exclude(e), 'utf8');
  assert.ok(t2.includes('old') && t2.includes('/n.txt'), t2);
  assert.strictEqual(run(d, 'show', 'new.txt').status, 0);
  assert.ok(!fs.readFileSync(exclude(d), 'utf8').includes('untrack: begin'), 'block removed once empty');
  assert.ok(fs.readFileSync(exclude(d), 'utf8').includes('keepme'));
});

t('usage: list needs no path, hide and show need one, an unknown command exits 2', () => {
  const d = repo();
  assert.strictEqual(run(d, 'list').status, 0);
  assert.strictEqual(run(d, 'show').status, 2);
  assert.strictEqual(run(d, 'bogus', 'a.txt').status, 2);
  assert.match(run(d, 'bogus', 'a.txt').stderr, /^usage: node hide\.js/);
  assert.strictEqual(run(d).status, 2);
});
