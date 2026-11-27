const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// A fresh install starts lean: per-session archivable skills are archived at once, pinned ones stay, --keep-active opts out,
// and a skill that was already active is never moved by a later install.
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'meta', 'install-kit.cli.js');
const LIB = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lean-'));
const env = () => ({ ...process.env, AI_DEV_KIT_HOME: tmp(), CLAUDE_CONFIG_DIR: tmp() });
const install = (root, skills, extra = []) => {
  const r = spawnSync(process.execPath, [CLI, 'install', '--library', LIB, '--root', root, '--tool', 'claude', '--skills', skills, '--signature', 'none', '--json', ...extra], { encoding: 'utf8', env: env() });
  return JSON.parse(r.stdout);
};
const active = (root) => fs.readdirSync(path.join(root, '.claude', 'skills'));
const archived = (root) => { try { return fs.readdirSync(path.join(root, '.claude', 'skills-archive')); } catch { return []; } };

t('archivable skills are archived at install, pinned ones stay active', () => {
  const root = tmp();
  const r = install(root, 'code-audit,perf-audit,plan-first,skill-scope');
  assert.deepStrictEqual([...r.archived].sort(), ['code-audit', 'perf-audit']);
  assert.ok(active(root).includes('plan-first') && active(root).includes('skill-scope'));
  assert.ok(!active(root).includes('code-audit'));
  assert.deepStrictEqual(archived(root).sort(), ['code-audit', 'perf-audit']);
});
t('--keep-active leaves everything loaded', () => {
  const root = tmp();
  const r = install(root, 'code-audit,plan-first,skill-scope', ['--keep-active']);
  assert.strictEqual(r.archived, undefined);
  assert.ok(active(root).includes('code-audit'));
});
t('a later install never archives a skill that was already active', () => {
  const root = tmp();
  install(root, 'code-audit,plan-first,skill-scope', ['--keep-active']);
  const r = install(root, 'code-audit,perf-audit,plan-first,skill-scope');
  assert.deepStrictEqual(r.archived, ['perf-audit']);
  assert.ok(active(root).includes('code-audit'));
});

const cli = require(CLI);
const update = (root, extra = []) => JSON.parse(spawnSync(process.execPath, [CLI, 'update', '--library', LIB, '--root', root, '--tool', 'claude', '--json', ...extra], { encoding: 'utf8', env: env() }).stdout);
const legacy = (root) => { install(root, 'code-audit,perf-audit,plan-first,skill-scope', ['--keep-active']); const m = cli.readManifest(root); delete m.lean; cli.writeManifest(root, m); };
t('an update archives the active archivable skills of a pre-lean install, once', () => {
  const root = tmp();
  legacy(root);
  const r = update(root);
  assert.deepStrictEqual([...r.archived].sort(), ['code-audit', 'perf-audit']);
  assert.ok(active(root).includes('plan-first') && !active(root).includes('code-audit'));
});
t('an update never re-archives a skill the user restored after the lean start', () => {
  const root = tmp();
  legacy(root);
  update(root);
  cli.doUnarchive({ root, skills: ['code-audit'] });
  const r = update(root);
  assert.strictEqual(r.archived, undefined);
  assert.ok(active(root).includes('code-audit'));
});
t('an install made with --keep-active is not archived by a later update', () => {
  const root = tmp();
  install(root, 'code-audit,plan-first,skill-scope', ['--keep-active']);
  const r = update(root);
  assert.strictEqual(r.archived, undefined);
  assert.ok(active(root).includes('code-audit'));
});
