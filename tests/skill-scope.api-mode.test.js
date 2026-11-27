// api-mode: round trips, half-stripped states, the one-time snapshot, doctor layers and the escape hatch, all on a fake home.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const SCRIPT = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.api-mode.js');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'apimode-'));
const home = path.join(base, 'home');
const elsewhere = path.join(base, 'elsewhere');
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.mkdirSync(path.join(home, '.ai-dev-kit'), { recursive: true });
fs.mkdirSync(elsewhere);
fs.mkdirSync(path.join(base, '.git')); // the project walk stops at a git root, so the real home's .claude is never reached
const SETTINGS = path.join(home, '.claude', 'settings.json');
const FAKE_KEY_TEXT = 'placeholder-value-for-tests';
fs.writeFileSync(path.join(home, '.ai-dev-kit', '.env'), 'UNIFIED_API_KEY=' + FAKE_KEY_TEXT + '\n');
const env = { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData', 'Roaming') };
for (const k of Object.keys(env)) if (/^ANTHROPIC_|^CLAUDE_CODE_/.test(k)) delete env[k];
const run = (args, cwd, extraEnv) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: cwd || elsewhere, env: { ...env, ...(extraEnv || {}) }, encoding: 'utf8' });
const settings = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
const reset = (obj) => { fs.rmSync(SETTINGS + '.pre-api-mode', { force: true }); fs.rmSync(SETTINGS + '.api-mode.bak', { force: true }); fs.writeFileSync(SETTINGS, JSON.stringify(obj, null, 2)); };
const USER = { theme: 'dark', permissions: { allow: ['Bash(git status)'] }, env: { MY_OWN: 'keep' } };

t('free then claude then free: every other setting survives, state is exact each time', () => {
  reset(USER);
  assert.match(run(['free']).stdout, /-> free/);
  let s = settings();
  assert.strictEqual(s.env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:31415');
  assert.strictEqual(s.env.ANTHROPIC_AUTH_TOKEN, FAKE_KEY_TEXT);
  assert.strictEqual(Object.keys(s.env).length, 10); // nine router keys plus the user's own
  assert.match(run(['--status']).stdout, /free \(unified router\)/);
  assert.match(run(['claude']).stdout, /-> claude/);
  s = settings();
  assert.deepStrictEqual(s, USER, 'claude must restore the original settings exactly');
  assert.match(run(['free']).stdout, /-> free/);
  assert.match(run(['claude']).stdout, /-> claude/);
  assert.deepStrictEqual(settings(), USER);
});

t('switching works from a different cwd and from a folder with spaces', () => {
  reset(USER);
  const spaced = path.join(base, 'a folder', 'deep');
  fs.mkdirSync(spaced, { recursive: true });
  assert.match(run(['free'], spaced).stdout, /-> free/);
  assert.match(run(['claude'], spaced).stdout, /-> claude/);
});

t('the key is never printed', () => {
  reset(USER);
  const out = run(['free']);
  assert.ok(!(out.stdout + out.stderr).includes(FAKE_KEY_TEXT));
  assert.ok(!run(['--doctor']).stdout.includes(FAKE_KEY_TEXT));
  assert.ok(!run(['--doctor', '--json']).stdout.includes(FAKE_KEY_TEXT));
  run(['claude']);
});

t('the first-state snapshot is written once and never overwritten', () => {
  reset(USER);
  run(['free']);
  const snap = fs.readFileSync(SETTINGS + '.pre-api-mode', 'utf8');
  assert.deepStrictEqual(JSON.parse(snap), USER);
  run(['claude']); run(['free']); run(['claude']);
  assert.strictEqual(fs.readFileSync(SETTINGS + '.pre-api-mode', 'utf8'), snap, 'snapshot changed after later writes');
  assert.ok(fs.existsSync(SETTINGS + '.api-mode.bak'));
});

t('a half-stripped state is reported as mixed, never as claude', () => {
  reset({ env: { ANTHROPIC_MODEL: 'auto', ANTHROPIC_DEFAULT_SONNET_MODEL: 'auto' } });
  assert.match(run(['--status']).stdout, /mixed/);
  assert.match(run(['--status']).stdout, /leftover router keys/);
  reset({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:31415', ANTHROPIC_MODEL: 'auto' } });
  assert.match(run(['--status']).stdout, /mixed \(router URL set, 7 of 9 router keys missing/);
});

t('claude repairs a mixed state, including a leftover top-level model "auto"', () => {
  reset({ model: 'auto', env: { ANTHROPIC_MODEL: 'auto', KEEP: '1' } });
  assert.match(run(['--status']).stdout, /mixed/);
  assert.match(run(['claude']).stdout, /-> claude/);
  assert.deepStrictEqual(settings(), { env: { KEEP: '1' } });
});

t('free repairs a partial free state by writing all nine keys', () => {
  reset({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:31415' } });
  assert.match(run(['free']).stdout, /-> free/);
  assert.strictEqual(Object.keys(settings().env).length, 9);
  run(['claude']);
});

t('a real model choice is not touched by claude', () => {
  reset({ model: 'opus', env: {} });
  run(['free']); run(['claude']);
  assert.strictEqual(settings().model, 'opus');
});

t('another gateway is never overwritten or stripped, in either direction', () => {
  reset({ env: { ANTHROPIC_BASE_URL: 'https://corp.example/gw' } });
  assert.match(run(['free']).stdout, /refused/);
  assert.match(run(['claude']).stdout, /refused/);
  assert.strictEqual(settings().env.ANTHROPIC_BASE_URL, 'https://corp.example/gw');
});

t('free without a key refuses and writes nothing', () => {
  reset(USER);
  fs.writeFileSync(path.join(home, '.ai-dev-kit', '.env'), 'OTHER=1\n');
  const before = fs.readFileSync(SETTINGS, 'utf8');
  assert.match(run(['free']).stdout, /refused: no UNIFIED_API_KEY/);
  assert.strictEqual(fs.readFileSync(SETTINGS, 'utf8'), before);
  assert.ok(!fs.existsSync(SETTINGS + '.pre-api-mode'));
  fs.writeFileSync(path.join(home, '.ai-dev-kit', '.env'), 'UNIFIED_API_KEY=' + FAKE_KEY_TEXT + '\n');
});

t('same mode twice changes nothing; a bad argument exits 2', () => {
  reset(USER);
  assert.match(run(['claude']).stdout, /already claude/);
  assert.strictEqual(run(['sideways']).status, 2);
});

t('missing or unreadable settings.json is treated as claude, then created by free', () => {
  fs.rmSync(SETTINGS, { force: true });
  assert.match(run(['--status']).stdout, /claude \(subscription\)/);
  assert.match(run(['free']).stdout, /-> free/);
  run(['claude']);
});

t('doctor lists user, project and process layers and warns about a project pin', () => {
  reset(USER);
  const proj = path.join(base, 'proj');
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:31415', ANTHROPIC_MODEL: 'auto' } }));
  const out = run(['--doctor'], proj, { ANTHROPIC_API_KEY: 'x' });
  assert.match(out.stdout, /SETS\s+project settings/);
  assert.match(out.stdout, /SETS\s+process environment/);
  assert.match(out.stdout, /WARNING: project settings; process environment/);
  const json = JSON.parse(run(['--doctor', '--json'], proj).stdout);
  assert.ok(json.layers.some((l) => l.label === 'project settings' && l.pins.includes('ANTHROPIC_MODEL')));
});

t('doctor is quiet when only user settings exists', () => {
  reset(USER);
  const out = run(['--doctor'], elsewhere);
  assert.match(out.stdout, /ok: no other layer sets the backend/);
});

t('doctor sees backend variables in the VS Code extension setting', () => {
  reset(USER);
  const vs = path.join(home, 'AppData', 'Roaming', 'Code', 'User');
  fs.mkdirSync(vs, { recursive: true });
  fs.writeFileSync(path.join(vs, 'settings.json'), '{\n  // comment\n  "claudeCode.environmentVariables": [{ "name": "ANTHROPIC_BASE_URL", "value": "http://127.0.0.1:31415" }]\n}\n');
  if (process.platform === 'win32') assert.match(run(['--doctor']).stdout, /SETS\s+VS Code user settings/);
});

t('the escape hatch writes a standalone copy and a launcher that switches back', () => {
  reset(USER);
  run(['free']);
  const out = run(['--install-escape']);
  const copy = path.join(home, '.ai-dev-kit', 'api-mode.js');
  assert.ok(fs.existsSync(copy) && fs.existsSync(path.join(home, '.ai-dev-kit', 'use-claude.cmd')) && fs.existsSync(path.join(home, '.ai-dev-kit', 'use-claude.sh')));
  assert.ok(out.stdout.includes(copy));
  const r = spawnSync(process.execPath, [copy, 'claude'], { cwd: elsewhere, env, encoding: 'utf8' });
  assert.match(r.stdout, /-> claude/);
  assert.deepStrictEqual(settings(), USER);
});

fs.rmSync(base, { recursive: true, force: true });
