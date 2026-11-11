const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The install-kit CLI's feature-usage switch: --usage and --usage-notify flags, the interactive question, and the config file
// it writes (the same file the feature-usage mod and session-budget/usage.js read). Uses the real library and a temp home.
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'meta', 'install-kit.cli.js');
const LIB = path.join(__dirname, '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const cfg = (home) => path.join(home, '.ai-dev-kit', 'usage', 'config.json');
const run = (home, args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input: opts.input, env: { ...process.env, AI_DEV_KIT_HOME: home, ...(opts.env || {}) } });
const base = (root) => ['install', '--library', LIB, '--root', root, '--tool', 'claude', '--skills', 'handover', '--signature', 'none'];

t('--usage on --usage-notify off writes the config and reports it; nothing is written into the project for it', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  const r = run(home, [...base(root), '--usage', 'on', '--usage-notify', 'off', '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual([j.usage.track, j.usage.notify], [true, false]);
  assert.strictEqual(path.resolve(j.usage.file), path.resolve(cfg(home)));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(cfg(home), 'utf8')), { track: true, notify: false });
  assert.ok(!fs.readdirSync(root).some((f) => /usage/i.test(f)), 'no usage file in the project');
});

t('--usage off turns it off and keeps the notice setting; only the keys given change', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  run(home, [...base(root), '--usage', 'on', '--usage-notify', 'on']);
  run(home, [...base(tmp('uroot ')), '--usage', 'off']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(cfg(home), 'utf8')), { track: false, notify: true });
});

t('without the flags and without a terminal, an install leaves the usage config alone', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  const r = run(home, [...base(root), '--json']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).usage, undefined);
  assert.ok(!fs.existsSync(cfg(home)));
});

t('a bad value exits 2 with one error line and writes nothing', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  for (const bad of [['--usage', 'maybe'], ['--usage-notify', 'yes'], ['--usage']]) {
    const r = run(home, [...base(root), ...bad]);
    assert.strictEqual(r.status, 2, bad.join(' ') + ' -> ' + r.status);
    assert.match(r.stderr, /must be on or off/);
  }
  assert.ok(!fs.existsSync(cfg(home)));
});

t('interactive: the install asks about usage tracking (Enter takes yes, and no notices) and writes the answer', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  const r = run(home, base(root), { input: '\n'.repeat(30), env: { AI_DEV_KIT_INTERACTIVE: '1' } });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout + r.stderr, /Keep track of which kit features get used\?/);
  assert.match(r.stdout + r.stderr, /costs no tokens/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(cfg(home), 'utf8')), { track: true, notify: false });
});

t('interactive: a flag already given is never asked again', () => {
  const home = tmp('uhome '), root = tmp('uroot ');
  const r = run(home, [...base(root), '--usage', 'off'], { input: '\n'.repeat(30), env: { AI_DEV_KIT_INTERACTIVE: '1' } });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  assert.ok(!/Keep track of which kit features get used\?/.test(r.stdout + r.stderr));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(cfg(home), 'utf8')), { track: false, notify: false });
});
