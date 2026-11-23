const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const stale = require('../skills/memory/memory-gardener.stale.js');
const SCRIPT = path.join(__dirname, '../skills/memory/memory-gardener.stale.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));

t('path-looking tokens are found; urls, globs, placeholders and plain words are not', () => {
  const p = stale.pathsIn;
  assert.deepStrictEqual(p('- use `src/a.ts` and `./lib/b.js:12` plus `main.css`'), ['src/a.ts', 'lib/b.js', 'main.css']);
  assert.deepStrictEqual(p('- see `https://x.dev/a.md`, `src/**/*.ts`, `<skill-root>/x.js`, `~/a.js`, `/etc/a.conf.json`, `C:/a/b.js`'), []);
  assert.deepStrictEqual(p('- the `useState` hook and `npm test` and `README` and `notes.md`'), []);
  assert.deepStrictEqual(p('- not here: `node_modules/x/y.js` or `dist/app.js`'), []);
  assert.deepStrictEqual(p('- the standard names `.ts` and `.css` files, not `src/.ts`'), []);
});

t('a bullet naming a deleted file is reported with its location; one naming a live file is not', () => {
  const d = proj();
  put(d, 'src/live.ts', 'x');
  put(d, '.claude/skills/foo/learnings.md', '# L\n- 2026-01-01 `src/live.ts` needs await\n- 2026-01-02 `src/gone.ts` broke on import\n- general lesson with no file\n');
  const r = stale.scan(d);
  assert.strictEqual(r.bullets, 3);
  assert.strictEqual(r.stale.length, 1);
  assert.strictEqual(r.stale[0].file, '.claude/skills/foo/learnings.md');
  assert.strictEqual(r.stale[0].line, 3);
  assert.deepStrictEqual(r.stale[0].missing, ['src/gone.ts']);
});

t('memory-bank, handover.md and handover/*.md are scanned; handover/locks.d is not touched', () => {
  const d = proj();
  put(d, 'memory-bank/decision.md', '- we moved `old/place.js` away\n');
  put(d, 'handover.md', '- resume at `missing.ts`\n');
  put(d, 'handover/tester.md', '- check `gone/x.css`\n');
  put(d, 'handover/locks.d/claim/owner.md', '- `never/read.js`\n');
  const files = stale.scan(d).stale.map((s) => s.file).sort();
  assert.deepStrictEqual(files, ['handover.md', 'handover/tester.md', 'memory-bank/decision.md']);
});

t('a bare file name that exists elsewhere in the project is not stale', () => {
  const d = proj();
  put(d, 'src/deep/nav.ts', 'x');
  put(d, '.opencode/skills/foo/learnings.md', '- `nav.ts` leaks a listener\n- `src/nav.ts` is the entry\n');
  const r = stale.scan(d);
  assert.deepStrictEqual(r.stale.map((s) => s.missing[0]), ['src/nav.ts']);
});

t('the CLI is report only: exit 0, files unchanged, --json parses', () => {
  const d = proj();
  const f = '.claude/skills/foo/learnings.md';
  put(d, f, '- `src/gone.ts` broke\n');
  const before = fs.readFileSync(path.join(d, f), 'utf8');
  const r = spawnSync('node', [SCRIPT, '--cwd', d], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /1 of 1 bullet\(s\) name a file that no longer exists/);
  assert.match(r.stdout, /learnings\.md:1  missing src\/gone\.ts/);
  assert.strictEqual(fs.readFileSync(path.join(d, f), 'utf8'), before);
  assert.strictEqual(JSON.parse(spawnSync('node', [SCRIPT, '--cwd', d, '--json'], { encoding: 'utf8' }).stdout).stale.length, 1);
  assert.strictEqual(spawnSync('node', [SCRIPT, '--bogus'], { encoding: 'utf8' }).status, 2);
});

t('a project with no memory files reports zero without error', () => {
  const r = spawnSync('node', [SCRIPT, '--cwd', proj()], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /0 of 0 bullet/);
});

// ---- gaps found by `invariants probe` on memory-gardener.stale.js ----
t('handover/ is scanned for .md files only: other files and a folder named x.md are skipped', () => {
  const d = proj();
  put(d, 'handover/a.md', '- 2026 `src/gone.ts` broke\n');
  put(d, 'handover/notes.txt', '- 2026 `src/gone.ts` broke\n- another\n');
  put(d, 'handover/sub.md/inner.md', '- 2026 `src/gone.ts` broke\n');
  let r;
  assert.doesNotThrow(() => { r = stale.scan(d); });
  assert.strictEqual(r.bullets, 1);
  assert.strictEqual(r.stale[0].file, 'handover/a.md');
});

t('a path that exists only nested deeper in the project counts as present', () => {
  const d = proj();
  put(d, 'pkg/lib/b.js', 'x');
  put(d, '.claude/skills/foo/learnings.md', '- 2026 `lib/b.js` needs await\n- 2026 `lib/missing.js` broke\n');
  const r = stale.scan(d);
  assert.strictEqual(r.stale.length, 1);
  assert.deepStrictEqual(r.stale[0].missing, ['lib/missing.js']);
});

t('node_modules, .git, dist and .next are not searched when deciding a file exists', () => {
  const d = proj();
  put(d, 'node_modules/x/only1.js', 'x'); put(d, '.git/x/only2.js', 'x'); put(d, 'dist/x/only3.js', 'x'); put(d, '.next/x/only4.js', 'x');
  put(d, 'src/real.js', 'x');
  put(d, '.claude/skills/foo/learnings.md', '- 2026 `only1.js` a\n- 2026 `only2.js` b\n- 2026 `only3.js` c\n- 2026 `only4.js` d\n- 2026 `real.js` e\n');
  const r = stale.scan(d);
  assert.deepStrictEqual(r.stale.map((s) => s.missing[0]).sort(), ['only1.js', 'only2.js', 'only3.js', 'only4.js']);
});
