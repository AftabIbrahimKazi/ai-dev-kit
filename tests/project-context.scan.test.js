const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/project-context.scan.js');
const S = require(SCRIPT);

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, ...a) => spawnSync('node', [SCRIPT, ...a, '--cwd', cwd], { encoding: 'utf8' });
const proj = (files = {}) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
  for (const [f, s] of Object.entries(files)) put(d, f, s);
  return d;
};
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const git = (d, ...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' });
const ctx = (d, ...a) => path.join(d, S.ROOT, ...a);
const init = (d, folders, extra = {}) => S.init({ ...S.parseArgs(['init', '--folders', folders.join(',')]), cwd: d, ...extra });
const stampOf = (d, f) => S.stamp({ ...S.parseArgs(['stamp', f]), cwd: d });
const changedOf = (d, ...f) => S.changed({ ...S.parseArgs(['changed', ...f]), cwd: d });

t('arguments: analyze is an alias of changed, no command means status, bad input is an error', () => {
  assert.strictEqual(S.parseArgs(['analyze', 'design']).cmd, 'changed');
  assert.strictEqual(S.parseArgs([]).cmd, 'status');
  assert.deepStrictEqual(S.parseArgs(['init', '--folders', 'a, b']).folders, ['a', 'b']);
  assert.throws(() => S.parseArgs(['status', '--nope']), /unknown option/);
  assert.throws(() => S.parseArgs(['init', '--type', 'desktop']), /--type must be one of/);
});

t('project type is guessed from the files a project has', () => {
  const pkg = (deps) => ({ 'package.json': JSON.stringify({ dependencies: deps }) });
  assert.strictEqual(S.guessType(proj(pkg({ astro: '1' }))), 'web');
  assert.strictEqual(S.guessType(proj(pkg({ express: '1' }))), 'backend');
  assert.strictEqual(S.guessType(proj(pkg({ expo: '1', react: '1' }))), 'mobile');
  assert.strictEqual(S.guessType(proj({ 'pubspec.yaml': 'name: x' })), 'mobile');
  assert.strictEqual(S.guessType(proj({ 'composer.json': '{}' })), 'backend');
  assert.strictEqual(S.guessType(proj({ 'notes.txt': 'x' })), 'generic');
});

t('detect finds existing docs by name and by folder, sorts them into folders, skips noise', () => {
  const d = proj({
    'docs/PRD.md': 'x', 'docs/brand-guide.pdf': 'x', 'design/home.fig': 'x', 'roadmap.md': 'x', 'docs/misc-notes.md': 'x',
    'README.md': 'x', 'src/app.js': 'x', 'node_modules/a/spec.md': 'x', 'project-context/requirements/old.md': 'x', 'package.json': '{"dependencies":{"astro":"1"}}',
  });
  const r = S.detect(d);
  const by = Object.fromEntries(r.candidates.map((c) => [c.file, c.folder]));
  assert.deepStrictEqual(by, { 'design/home.fig': 'design', 'docs/PRD.md': 'requirements', 'docs/brand-guide.pdf': 'taste', 'docs/misc-notes.md': 'other', 'roadmap.md': 'features' });
  assert.deepStrictEqual(r.autoFolders.sort(), ['design', 'features', 'other', 'requirements', 'taste']);
  assert.strictEqual(r.type, 'web');
  assert.ok(r.recommended.some((x) => x.name === 'design'));
});

t('init without --folders prints the three setup options instead of creating anything', () => {
  const d = proj({ 'docs/PRD.md': 'x', 'package.json': '{"dependencies":{"next":"1"}}' });
  const r = cli(d, 'init');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /A {2}Auto-detect/);
  assert.match(r.stdout, /B {2}Recommended for a web project: .*design/);
  assert.match(r.stdout, /C {2}Other/);
  assert.ok(!fs.existsSync(ctx(d)));
});

t('init creates folders with an INDEX.md, a root index table and one .gitignore entry, and is safe to repeat', () => {
  const d = proj();
  const r = init(d, ['requirements', 'design']);
  assert.deepStrictEqual(r.created, ['requirements', 'design']);
  assert.strictEqual(r.gitignoreUpdated, true);
  assert.match(fs.readFileSync(ctx(d, 'design', 'INDEX.md'), 'utf8'), /Purpose: figma links, tokens/);
  const root = fs.readFileSync(ctx(d, 'INDEX.md'), 'utf8');
  assert.match(root, /\| design \| 0 \| not analyzed \| figma links/);
  const again = init(d, ['requirements', 'design']);
  assert.deepStrictEqual([again.created, again.gitignoreUpdated], [[], false]);
  assert.strictEqual(fs.readFileSync(path.join(d, '.gitignore'), 'utf8').split('project-context/').length - 1, 1);
});

t('init rejects folder names that could escape or are not kebab-case', () => {
  const d = proj();
  assert.throws(() => init(d, ['../outside']), /must be lowercase/);
  assert.throws(() => init(d, ['Design']), /must be lowercase/);
  assert.ok(!fs.existsSync(path.join(path.dirname(d), 'outside')));
});

t('init --copy copies existing docs into their folder and leaves the originals where they are', () => {
  const d = proj({ 'docs/PRD.md': '# prd', 'docs/other.md': 'x' });
  const r = init(d, ['requirements'], { copy: true });
  assert.deepStrictEqual(r.copied, ['docs/PRD.md -> project-context/requirements/']);
  assert.ok(fs.existsSync(ctx(d, 'requirements', 'PRD.md')) && fs.existsSync(path.join(d, 'docs', 'PRD.md')));
  assert.ok(!fs.existsSync(ctx(d, 'requirements', 'other.md')));
});

t('status and changed follow a folder through empty, not analyzed, current and stale', () => {
  const d = proj();
  init(d, ['requirements']);
  const folder = () => S.status(d).folders[0];
  assert.strictEqual(folder().files, 0);
  put(d, 'project-context/requirements/prd.md', 'goals');
  assert.deepStrictEqual([folder().files, folder().analyzed, folder().stale], [1, null, true]);
  assert.deepStrictEqual(changedOf(d)[0].added.map((f) => f.rel), ['prd.md']);
  stampOf(d, 'requirements');
  assert.deepStrictEqual([folder().stale, folder().added], [false, 0]);
  assert.deepStrictEqual(changedOf(d), []);
  put(d, 'project-context/requirements/prd.md', 'goals changed');
  put(d, 'project-context/requirements/sub/new.md', 'n');
  const c = changedOf(d)[0];
  assert.deepStrictEqual([c.modified.map((f) => f.rel), c.added.map((f) => f.rel), c.unchanged], [['prd.md'], ['sub/new.md'], 0]);
  stampOf(d, 'requirements');
  fs.rmSync(ctx(d, 'requirements', 'prd.md'));
  assert.deepStrictEqual(changedOf(d)[0].deleted, ['prd.md']);
});

t('INDEX.md and the stamp file are never counted as user files, and an unchanged folder is skipped by changed', () => {
  const d = proj();
  init(d, ['design', 'assets']);
  put(d, 'project-context/design/a.fig', 'x');
  stampOf(d, 'design');
  const names = changedOf(d, 'design')[0];
  assert.strictEqual(names.added.length + names.modified.length, 0);
  assert.deepStrictEqual(changedOf(d).map((f) => f.name), []);
  assert.strictEqual(S.status(d).folders.find((f) => f.name === 'design').files, 1);
});

t('stamp needs an INDEX.md; the root table shows the analyzed date and the folder purpose, and keeps hand-written text', () => {
  const d = proj();
  init(d, ['design']);
  fs.rmSync(ctx(d, 'design', 'INDEX.md'));
  assert.throws(() => stampOf(d, 'design'), /write project-context\/design\/INDEX.md before stamping/);
  put(d, 'project-context/design/INDEX.md', '# design\n\nPurpose: Figma tokens for the marketing site\n');
  put(d, 'project-context/design/t.md', 'x');
  stampOf(d, 'design');
  fs.writeFileSync(ctx(d, 'INDEX.md'), fs.readFileSync(ctx(d, 'INDEX.md'), 'utf8') + '\nHand-written note.\n');
  S.buildRoot(d);
  const root = fs.readFileSync(ctx(d, 'INDEX.md'), 'utf8');
  assert.match(root, new RegExp(`\\| design \\| 1 \\| ${new Date().toISOString().slice(0, 10)} \\| Figma tokens for the marketing site`));
  assert.match(root, /Hand-written note\./);
});

t('leak guard: a tracked file under project-context/ fails status with the fix named; ignored once init has run', () => {
  const d = proj({ 'a.txt': 'x' });
  git(d, 'init', '-q', '-b', 'main'); git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'user.name', 't'); git(d, 'config', 'commit.gpgsign', 'false');
  init(d, ['requirements']);
  assert.strictEqual(S.status(d).ignored, true);
  put(d, 'project-context/requirements/secret.md', 'private');
  assert.strictEqual(git(d, 'add', '-f', 'project-context/requirements/secret.md').status, 0);
  const r = cli(d, 'status');
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /WARN 1 file\(s\); run git rm -r --cached project-context/);
});

t('status with no folder says how to start; with the folder it reports gitignore ok', () => {
  const d = proj();
  assert.match(cli(d, 'status').stdout, /does not exist\. Run \/ctx init/);
  init(d, ['features']);
  assert.match(cli(d, 'status').stdout, /gitignore: ok/);
});

t('add copies files in, skips existing ones, and reports a missing file or folder', () => {
  const d = proj({ 'brand.pdf': 'p', 'logo.svg': 's' });
  init(d, ['assets']);
  const rows = S.addFiles({ ...S.parseArgs(['add', 'assets', 'brand.pdf', 'logo.svg', 'nope.png']), cwd: d });
  assert.deepStrictEqual(rows.map((r) => r.status), ['copied', 'copied', 'error']);
  assert.strictEqual(S.addFiles({ ...S.parseArgs(['add', 'assets', 'brand.pdf']), cwd: d })[0].status, 'skipped-exists');
  assert.throws(() => S.addFiles({ ...S.parseArgs(['add', 'missing', 'brand.pdf']), cwd: d }), /does not exist; run init first/);
});

t('detect never offers the kit own installed standards as project docs', () => {
  const d = proj({ 'coding-standards/css-standards/token-files.md': 'x', 'coding-standards/qa/spec-notes.md': 'x', 'docs/PRD.md': 'x' });
  assert.deepStrictEqual(S.detect(d).candidates.map((c) => c.file), ['docs/PRD.md']);
});
