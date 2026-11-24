const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { areasOf, plan, settle, mark, readState } = require('../skills/workflow/pre-merge-gate.scope.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const sh = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); return r.stdout.trim(); };
const write = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text); };
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-'));
  sh(d, 'init', '-q', '-b', 'main'); sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'commit.gpgsign', 'false');
  write(d, 'README.md', 'x\n'); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'init');
  return d;
}
const commit = (d, msg) => { sh(d, 'add', '.'); sh(d, 'commit', '-qm', msg); };
const lines = (n) => Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n';

t('areasOf maps files to areas and adds security by path', () => {
  assert.deepStrictEqual(areasOf('a/b.css'), ['css']);
  assert.deepStrictEqual(areasOf('src/page.html'), ['markup']);
  assert.deepStrictEqual(areasOf('src/util.js'), ['script']);
  assert.deepStrictEqual(areasOf('src/auth/login.ts'), ['script', 'security']);
  assert.deepStrictEqual(areasOf('docs/guide.md'), []);
});

t('docs-only change needs no reviewer; a small script change is trivial; a larger one needs one', () => {
  const d = repo();
  write(d, 'docs/a.md', 'more\n'); commit(d, 'docs');
  assert.deepStrictEqual(plan(d, 'HEAD~1'), []);
  write(d, 'src/a.js', lines(2)); commit(d, 'small');
  const small = plan(d, 'HEAD~1');
  assert.deepStrictEqual(small.map((p) => [p.area, p.needsReviewer]), [['script', false]]);
  write(d, 'src/b.js', lines(30)); commit(d, 'big');
  assert.deepStrictEqual(plan(d, 'HEAD~1').map((p) => [p.area, p.needsReviewer]), [['script', true]]);
});

t('settle is recorded once per line; mark moves the last-reviewed commit and narrows the next scope', () => {
  const d = repo();
  write(d, 'src/a.js', lines(30)); commit(d, 'one');
  settle(d, 'script', 'one-caller helpers are fine here: the names document steps');
  settle(d, 'script', 'one-caller helpers are fine here: the names document steps');
  assert.strictEqual(plan(d, 'HEAD~1')[0].settled.length, 1);
  mark(d, ['script']);
  assert.strictEqual(readState(d).areas.script.lastReviewed, sh(d, 'rev-parse', 'HEAD'));
  write(d, 'src/c.js', lines(30)); commit(d, 'two');
  const p = plan(d);
  assert.deepStrictEqual(p[0].files, ['src/c.js']);
});

const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'pre-merge-gate.scope.js');
const cli = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const rewrite = (d, rel, fn) => write(d, rel, fn(fs.readFileSync(path.join(d, rel), 'utf8').split('\n')).join('\n'));

t('reviewer threshold: 4 changed lines is trivial, 5 needs a reviewer; changed lines are added plus deleted', () => {
  const d = repo();
  write(d, 'src/a.js', lines(4)); commit(d, 'base');
  rewrite(d, 'src/a.js', (l) => { l[0] = 'const q = 1;'; l[1] = 'const r = 2;'; return l; }); commit(d, 'edit two');
  const p = plan(d, 'HEAD~1')[0];
  assert.strictEqual(p.changedLines, 4);
  assert.strictEqual(p.needsReviewer, false);
  write(d, 'src/b.js', lines(5)); commit(d, 'five');
  const q = plan(d, 'HEAD~1')[0];
  assert.strictEqual(q.changedLines, 5);
  assert.strictEqual(q.needsReviewer, true);
});

t('audit findings are kept only inside the changed lines, ends included', () => {
  const d = repo();
  write(d, 'src/a.js', 'var a = 1;\nconst b = 2;\nconst c = 3;\nvar d = 4;\n'); commit(d, 'base');
  rewrite(d, 'src/a.js', (l) => { l[1] = 'console.log(1);'; l[2] = 'var e = 5;'; return l; }); commit(d, 'edit');
  const f = plan(d, 'HEAD~1')[0].findings;
  assert.deepStrictEqual(f.map((x) => [x.line, x.rule]), [[2, 'js-03'], [3, 'js-09']]);
});

t('a one-line change (hunk with no length) still scopes its finding', () => {
  const d = repo();
  write(d, 'src/a.js', 'var a = 1;\nconst b = 2;\nvar d = 4;\n'); commit(d, 'base');
  rewrite(d, 'src/a.js', (l) => { l[1] = 'console.log(1);'; return l; }); commit(d, 'edit');
  assert.deepStrictEqual(plan(d, 'HEAD~1')[0].findings.map((x) => x.line), [2]);
});

t('without a base the scope is HEAD~1, or origin/main when that ref exists, or the last reviewed commit', () => {
  const d = repo();
  write(d, 'src/a.js', lines(6)); commit(d, 'one');
  write(d, 'src/b.js', lines(6)); commit(d, 'two');
  assert.deepStrictEqual(plan(d)[0].files, ['src/b.js']);
  sh(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD~2');
  assert.deepStrictEqual(plan(d)[0].files.sort(), ['src/a.js', 'src/b.js']);
  mark(d, ['script']);
  const p = plan(d);
  assert.strictEqual(p.length, 0);
});

t('plan reports lastReviewed and settled notes, empty when none', () => {
  const d = repo();
  write(d, 'src/a.js', lines(6)); commit(d, 'one');
  const first = plan(d, 'HEAD~1')[0];
  assert.strictEqual(first.lastReviewed, null);
  assert.deepStrictEqual(first.settled, []);
  settle(d, 'script', 'note');
  mark(d, ['script']);
  const second = plan(d, 'HEAD~1')[0];
  assert.strictEqual(second.lastReviewed, sh(d, 'rev-parse', 'HEAD'));
  assert.deepStrictEqual(second.settled, ['note']);
  assert.strictEqual(second.head, sh(d, 'rev-parse', 'HEAD'));
});

t('cli: --cwd as the first flag, --json, text summary, and the no-change message', () => {
  const d = repo();
  assert.match(cli('--cwd', d, '--base', 'HEAD').stdout, /No reviewable change/);
  write(d, 'src/a.js', lines(6)); commit(d, 'one');
  const j = JSON.parse(cli('--cwd', d, '--base', 'HEAD~1', '--json').stdout);
  assert.deepStrictEqual(j.map((x) => x.area), ['script']);
  assert.strictEqual(cli('--cwd', d, '--base', 'HEAD~1').stdout.trim(), 'script: 1 file(s), 6 changed line(s), 0 audit finding(s), 0 settled, reviewer YES');
  write(d, 'src/b.js', lines(1)); commit(d, 'two');
  assert.match(cli('--cwd', d, '--base', 'HEAD~2', '--json').stdout, /"changedLines": 7/);
  const small = repo();
  write(small, 'src/a.js', lines(1)); commit(small, 'x');
  assert.match(cli('--cwd', small, '--base', 'HEAD~1').stdout, /reviewer no \(trivial\)/);
});

t('cli: --settle stores the text, --mark with and without areas', () => {
  const d = repo();
  write(d, 'src/a.js', lines(1)); commit(d, 'x');
  assert.strictEqual(cli('--cwd', d, '--settle', 'script', 'keep this').stdout.trim(), 'settled under script');
  assert.deepStrictEqual(readState(d).areas.script.settled, ['keep this']);
  assert.strictEqual(cli('--cwd', d, '--settle', 'css').status, 0);
  assert.deepStrictEqual(readState(d).areas.css.settled, ['']);
  assert.strictEqual(cli('--cwd', d, '--mark', 'css,script').stdout.trim(), 'marked css, script');
  assert.strictEqual(cli('--cwd', d, '--mark').stdout.trim(), 'marked css, markup, script, security');
  assert.strictEqual(cli('--cwd', d, '--mark', '--json').stdout.trim(), 'marked css, markup, script, security');
});

t('a small change under a security path still needs a reviewer; vendored folders and deleted files are skipped', () => {
  const d = repo();
  write(d, 'src/auth/login.js', lines(1)); write(d, 'node_modules/x/i.js', lines(9)); write(d, 'src/gone.js', lines(9)); commit(d, 'x');
  fs.rmSync(path.join(d, 'src/gone.js'));
  const p = plan(d, 'HEAD~1');
  assert.deepStrictEqual(p.map((x) => [x.area, x.files, x.needsReviewer]), [['script', ['src/auth/login.js'], false], ['security', ['src/auth/login.js'], true]]);
});
