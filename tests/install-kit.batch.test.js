const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The install-kit CLI's wiring for the batch mod: detection in user and project settings, the install offer, the pairing with the
// session-budget skill, and --batch on|off (run through a fake claude command, never the real one).
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'meta', 'install-kit.cli.js');
const LIB = path.join(__dirname, '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const run = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: tmp('bhome '), CLAUDE_CONFIG_DIR: tmp('bcfg '), ...env } });
const install = (root, skills, extra = [], env = {}) => run(['install', '--library', LIB, '--root', root, '--tool', 'claude', '--skills', skills, '--signature', 'none', '--json', ...extra], env);
const json = (r) => JSON.parse(r.stdout);
const settings = (dir, enabled) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'batch@ai-dev-kit-mods': enabled } })); };
// A fake claude: records its arguments and working folder, and on "install" enables the mod the way the real command does.
const fakeClaude = (dir, exitCode) => {
  const f = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(f, `const fs=require('fs'),path=require('path');
fs.writeFileSync(path.join(${JSON.stringify(dir)},'args.json'),JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));
if(${exitCode}!==0){console.error('marketplace not found');process.exit(${exitCode})}
const s=path.join(process.cwd(),'.claude','settings.json');fs.mkdirSync(path.dirname(s),{recursive:true});
fs.writeFileSync(s,JSON.stringify({enabledPlugins:{'batch@ai-dev-kit-mods':process.argv[3]==='install'}}));`);
  return f;
};

t('session-budget installed, mod not enabled: the result offers the install with both commands', () => {
  const root = tmp('broot ');
  const r = install(root, 'session-budget');
  assert.strictEqual(r.status, 0, r.stderr);
  const b = json(r).batch;
  assert.strictEqual(b.enabled, false);
  assert.strictEqual(b.paired, true);
  assert.match(b.hint, /marketplace add/);
  assert.match(b.hint, /plugin install batch@ai-dev-kit-mods --scope project/);
});

t('no session-budget and no flag: the install result says nothing about the mod', () => {
  const r = install(tmp('broot '), 'handover');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(json(r).batch, undefined);
});

t('enabled in the project settings: reported as project scope, no offer', () => {
  const root = tmp('broot ');
  settings(path.join(root, '.claude'), true);
  const b = json(install(root, 'session-budget')).batch;
  assert.deepStrictEqual([b.enabled, b.scope, b.hint], [true, 'project', undefined]);
});

t('enabled in the user settings: reported as user scope', () => {
  const root = tmp('broot '), cfg = tmp('bcfg ');
  settings(cfg, true);
  const b = json(install(root, 'session-budget', [], { CLAUDE_CONFIG_DIR: cfg })).batch;
  assert.deepStrictEqual([b.enabled, b.scope], [true, 'user']);
});

t('a plugin set to false counts as not enabled', () => {
  const root = tmp('broot ');
  settings(path.join(root, '.claude'), false);
  assert.strictEqual(json(install(root, 'session-budget')).batch.enabled, false);
});

t('enabled without session-budget: a warning on stderr and in the result', () => {
  const root = tmp('broot ');
  settings(path.join(root, '.claude'), true);
  const r = install(root, 'handover', ['--batch', 'on'], { AI_DEV_KIT_CLAUDE_BIN: fakeClaude(tmp('bfake '), 0) });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(json(r).batch.warning, /session-budget/);
  assert.match(r.stderr, /session-budget/);
});

t('--batch on runs claude plugin install ... --scope project in the project folder and reports it enabled', () => {
  const root = tmp('broot '), fake = tmp('bfake ');
  const r = install(root, 'session-budget', ['--batch', 'on'], { AI_DEV_KIT_CLAUDE_BIN: fakeClaude(fake, 0) });
  assert.strictEqual(r.status, 0, r.stderr);
  const b = json(r).batch;
  assert.deepStrictEqual([b.action, b.ok, b.enabled, b.scope], ['install', true, true, 'project']);
  const seen = JSON.parse(fs.readFileSync(path.join(fake, 'args.json'), 'utf8'));
  assert.deepStrictEqual(seen.args, ['plugin', 'install', 'batch@ai-dev-kit-mods', '--scope', 'project']);
  assert.strictEqual(fs.realpathSync(seen.cwd), fs.realpathSync(root));
});

t('--batch on when claude fails: the install itself still succeeds, the error and the manual commands are reported', () => {
  const root = tmp('broot ');
  const r = install(root, 'session-budget', ['--batch', 'on'], { AI_DEV_KIT_CLAUDE_BIN: fakeClaude(tmp('bfake '), 3) });
  assert.strictEqual(r.status, 0, r.stderr);
  const b = json(r).batch;
  assert.deepStrictEqual([b.ok, b.enabled], [false, false]);
  assert.match(b.error, /marketplace not found/);
  assert.match(b.hint, /marketplace add/);
});

t('--batch off runs claude plugin uninstall and reports it disabled', () => {
  const root = tmp('broot '), fake = tmp('bfake ');
  settings(path.join(root, '.claude'), true);
  const r = run(['mods', '--root', root, '--library', LIB, '--batch', 'off'], { AI_DEV_KIT_CLAUDE_BIN: fakeClaude(fake, 0) });
  assert.strictEqual(r.status, 0, r.stderr);
  const b = json(r).batch;
  assert.deepStrictEqual([b.action, b.ok, b.enabled], ['uninstall', true, false]);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(fake, 'args.json'), 'utf8')).args[1], 'uninstall');
});

t('the mods command reports status without installing anything', () => {
  const root = tmp('broot ');
  const r = run(['mods', '--root', root, '--library', LIB]);
  assert.strictEqual(r.status, 0, r.stderr);
  const b = json(r).batch;
  assert.deepStrictEqual([b.enabled, b.action], [false, undefined]);
});

t('--batch needs on or off; mods needs --root', () => {
  assert.strictEqual(run(['mods', '--root', tmp('broot '), '--batch', 'maybe']).status, 2);
  assert.strictEqual(run(['mods']).status, 2);
});
