const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  bumpVersion, findPackageJsons, planPackage, applyPlan, changelogBlock, insertChangelog,
} = require('../skills/workflow/version-bump.bump.js');
const SCRIPT = path.join(__dirname, '../skills/workflow/version-bump.bump.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vb-'));
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const run = (args, cwd) => spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });

t('major resets feature and patch', () => {
  assert.strictEqual(bumpVersion('1.4.3', 'major'), '2.0.0');
});
t('feature increments and resets patch', () => {
  assert.strictEqual(bumpVersion('1.2.5', 'feature'), '1.3.0');
});
t('patch increments only', () => {
  assert.strictEqual(bumpVersion('1.2.4', 'patch'), '1.2.5');
});
t('alpha with no prerelease requires --for', () => {
  assert.throws(() => bumpVersion('1.2.5', 'alpha'), /--for/);
  assert.strictEqual(bumpVersion('1.2.5', 'alpha', { for: 'feature' }), '1.3.0-alpha.1');
});
t('same-stage prerelease increments its counter', () => {
  assert.strictEqual(bumpVersion('1.3.0-alpha.1', 'alpha'), '1.3.0-alpha.2');
});
t('moving forward a stage resets the counter to 1', () => {
  assert.strictEqual(bumpVersion('1.3.0-alpha.3', 'beta'), '1.3.0-beta.1');
});
t('moving backward a stage is blocked without --force', () => {
  assert.throws(() => bumpVersion('1.3.0-rc.1', 'alpha'), /--force/);
  assert.strictEqual(bumpVersion('1.3.0-rc.1', 'alpha', { force: true }), '1.3.0-alpha.1');
});
t('release strips the prerelease suffix', () => {
  assert.strictEqual(bumpVersion('1.3.0-rc.2', 'release'), '1.3.0');
  assert.throws(() => bumpVersion('1.3.0', 'release'), /no prerelease/);
});
t('malformed version is rejected', () => {
  assert.throws(() => bumpVersion('1.2', 'patch'), /not \[major\]/);
});

t('findPackageJsons on a directory recurses but skips node_modules and dotdirs', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  put(d, 'frontend/package.json', '{"name":"frontend","version":"1.0.0"}');
  put(d, 'node_modules/dep/package.json', '{"name":"dep","version":"1.0.0"}');
  put(d, '.git/package.json', '{"name":"nope","version":"1.0.0"}');
  const found = findPackageJsons(d).map((p) => path.relative(d, p).replace(/\\/g, '/'));
  assert.deepStrictEqual(found.sort(), ['frontend/package.json', 'package.json']);
});
t('findPackageJsons on a direct file path returns just that one', () => {
  const d = tmp();
  put(d, 'a/package.json', '{"name":"a","version":"1.0.0"}');
  assert.deepStrictEqual(findPackageJsons(path.join(d, 'a/package.json')), [path.join(d, 'a/package.json')]);
});

t('changelogBlock only emits headings that have bullets', () => {
  const block = changelogBlock('1.3.0', '2026-06-21', { added: ['Planet overlay'], fixed: ['Z-index bug'] });
  assert.strictEqual(block, '## [1.3.0] — 2026-06-21\n\n### Added\n- Planet overlay\n\n### Fixed\n- Z-index bug');
});
t('insertChangelog puts the new entry right after the header, before existing entries', () => {
  const d = tmp();
  const f = path.join(d, 'CHANGELOG.md');
  fs.writeFileSync(f, '# Changelog\n\n## [1.0.0] — 2026-10-09\n\n### Added\n- first\n');
  insertChangelog(f, changelogBlock('1.1.0', '2026-10-31', { added: ['second'] }));
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(text.indexOf('[1.1.0]') < text.indexOf('[1.0.0]'), 'newest entry should come first');
  assert.ok(text.startsWith('# Changelog\n\n## [1.1.0]'));
});
t('insertChangelog creates a header when the file does not exist', () => {
  const d = tmp();
  const f = path.join(d, 'CHANGELOG.md');
  insertChangelog(f, changelogBlock('1.0.0', '2026-10-31', { added: ['init'] }));
  assert.ok(fs.readFileSync(f, 'utf8').startsWith('# Changelog\n\n## [1.0.0]'));
});

t('applyPlan bumps package.json in place and leaves unrelated formatting untouched', () => {
  const d = tmp();
  put(d, 'package.json', '{\n  "name": "x",\n  "version": "1.2.5",\n  "private": true\n}\n');
  put(d, 'CHANGELOG.md', '# Changelog\n\n## [1.2.5] — 2026-10-01\n\n### Fixed\n- old\n');
  const plan = planPackage(path.join(d, 'package.json'), 'feature', {});
  assert.strictEqual(plan.newVersion, '1.3.0');
  const res = applyPlan(plan, '2026-10-31', { added: ['new thing'] }, false);
  assert.strictEqual(res.changelogWritten, true);
  const pkg = fs.readFileSync(path.join(d, 'package.json'), 'utf8');
  assert.ok(pkg.includes('"version": "1.3.0"'));
  assert.ok(pkg.includes('"private": true'), 'untouched fields must survive');
  const changelog = fs.readFileSync(path.join(d, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.indexOf('[1.3.0]') < changelog.indexOf('[1.2.5]'));
});
t('applyPlan skips the changelog when the package has none', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"x","version":"1.0.0"}');
  const plan = planPackage(path.join(d, 'package.json'), 'patch', {});
  const res = applyPlan(plan, '2026-10-31', { fixed: ['x'] }, false);
  assert.strictEqual(res.changelogWritten, false);
  assert.ok(!fs.existsSync(path.join(d, 'CHANGELOG.md')));
});

t('CLI: base scope with no args bumps every package.json under cwd', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  put(d, 'frontend/package.json', '{"name":"frontend","version":"2.0.0"}');
  put(d, 'frontend/CHANGELOG.md', '# Changelog\n');
  const r = run(['patch', '--added', 'did a thing'], d);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('1.0.0 -> 1.0.1'));
  assert.ok(r.stdout.includes('2.0.0 -> 2.0.1'));
  assert.ok(fs.readFileSync(path.join(d, 'frontend/CHANGELOG.md'), 'utf8').includes('[2.0.1]'));
});
t('CLI: scoping to a subfolder only bumps packages under it (group level)', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  put(d, 'frontend/package.json', '{"name":"frontend","version":"2.0.0"}');
  const r = run(['patch', 'frontend', '--added', 'x'], d);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('2.0.0 -> 2.0.1'));
  assert.ok(!r.stdout.includes('1.0.0 ->'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version, '1.0.0');
});
t('CLI: scoping to one package.json file bumps only that one (specific level)', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  put(d, 'frontend/package.json', '{"name":"frontend","version":"2.0.0"}');
  const r = run(['patch', 'frontend/package.json', '--added', 'x'], d);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('2.0.0 -> 2.0.1'));
});
t('CLI: refuses to bump without a changelog entry or --no-changelog', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  const r = run(['patch'], d);
  assert.notStrictEqual(r.status, 0);
  assert.ok(r.stderr.includes('V-08') || r.stderr.includes('changelog'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version, '1.0.0');
});
t('CLI: --dry-run writes nothing', () => {
  const d = tmp();
  put(d, 'package.json', '{"name":"root","version":"1.0.0"}');
  const r = run(['patch', '--added', 'x', '--dry-run'], d);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('DRY-RUN'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version, '1.0.0');
});
t('CLI: an unresolvable scope fails loudly instead of silently doing nothing', () => {
  const d = tmp();
  const r = run(['patch', 'does-not-exist', '--added', 'x'], d);
  assert.notStrictEqual(r.status, 0);
});
