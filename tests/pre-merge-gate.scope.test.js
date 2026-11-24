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
