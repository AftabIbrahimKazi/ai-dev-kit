const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { build, level, gender, NAMES } = require('../skills/addons/personality.inject.js');
const SCRIPT = path.join(__dirname, '../skills/addons/personality.inject.js');
const PERSONAS = path.join(__dirname, '../skills/addons/personality.personas');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const sandbox = () => { const home = fs.mkdtempSync(path.join(os.tmpdir(), 'per-')); return { home, env: { ...process.env, HOME: home, USERPROFILE: home } }; };
const run = (env, input, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { env, input, encoding: 'utf8' });

t('six built-in personas exist, three per gender, one per level', () => {
  const files = fs.readdirSync(PERSONAS).sort();
  assert.deepStrictEqual(files, ['female-mid.md', 'female-novice.md', 'female-pro.md', 'male-mid.md', 'male-novice.md', 'male-pro.md']);
  for (const g of Object.keys(NAMES)) for (const l of ['novice', 'mid', 'pro']) {
    assert.ok(fs.readFileSync(path.join(PERSONAS, `${g}-${l}.md`), 'utf8').includes(NAMES[g][l]));
  }
});
t('every persona stays small enough to inject cheaply', () => {
  for (const f of fs.readdirSync(PERSONAS)) assert.ok(fs.readFileSync(path.join(PERSONAS, f), 'utf8').length < 700, f);
});
t('levels accept aliases and refuse nonsense', () => {
  assert.strictEqual(level('junior'), 'novice'); assert.strictEqual(level('Senior'), 'pro'); assert.strictEqual(level('mid'), 'mid');
  assert.strictEqual(level('wizard'), null); assert.strictEqual(gender('robot'), null);
});
t('build adds the persona and the wording-only rules, and nothing when unset', () => {
  const text = build({ gender: 'female', level: 'pro' });
  assert.ok(text.includes('Vera') && text.includes('Wording only'));
  assert.strictEqual(build(null), '');
});
t('--set saves, --status reports, --off clears', () => {
  const { home, env } = sandbox();
  assert.ok(run(env, '', '--set', 'male', 'junior').stdout.includes('Leo (male, novice)'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'personality.json'), 'utf8')), { gender: 'male', level: 'novice' });
  assert.ok(run(env, '', '--status').stdout.includes('Leo'));
  assert.ok(run(env, '', '--off').stdout.includes('off'));
  assert.ok(run(env, '', '--status').stdout.includes('off'));
});
t('bad --set values are refused and save nothing', () => {
  const { home, env } = sandbox();
  assert.ok(run(env, '', '--set', 'robot', 'pro').stdout.startsWith('use --set'));
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'personality.json')));
});
t('hook mode prints SessionStart context only when a persona is chosen', () => {
  const { home, env } = sandbox();
  assert.strictEqual(run(env, '{}').stdout, '');
  run(env, '', '--set', 'female', 'mid');
  const out = JSON.parse(run(env, JSON.stringify({ cwd: home })).stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('Nora'));
});
t('hook mode survives empty and broken input and exits 0', () => {
  const { env } = sandbox();
  for (const input of ['', 'junk']) { const r = run(env, input); assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, ''); }
});
t('a project choice overrides the user choice', () => {
  const { home, env } = sandbox();
  run(env, '', '--set', 'female', 'novice');
  const proj = path.join(home, 'proj'); fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'personality.json'), JSON.stringify({ gender: 'male', level: 'pro' }));
  assert.ok(JSON.parse(run(env, JSON.stringify({ cwd: proj })).stdout).hookSpecificOutput.additionalContext.includes('Victor'));
});
t('a persona file in ~/.claude/personas replaces the built-in one', () => {
  const { home, env } = sandbox();
  run(env, '', '--set', 'female', 'pro');
  fs.mkdirSync(path.join(home, '.claude', 'personas'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'personas', 'female-pro.md'), '# Custom — speak like a pirate');
  const ctx = JSON.parse(run(env, '{}').stdout).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('pirate') && !ctx.includes('Vera') && ctx.includes('Wording only'));
});

const SETUP = path.join(__dirname, '../skills/addons/personality.setup.js');
const { parseArgs, CHOICES } = require(SETUP);
const setup = (env, ...a) => spawnSync(process.execPath, [SETUP, ...a], { env, encoding: 'utf8' });
const tree = (d) => fs.readdirSync(d, { recursive: true }).map((f) => f.split(path.sep).join('/')).sort();

t('setup offers eight choices: six personas, none, custom', () => {
  assert.strictEqual(CHOICES.length, 8);
  assert.ok(CHOICES.includes('none') && CHOICES.includes('custom'));
  assert.throws(() => parseArgs(['--install', 'wizard']));
  assert.throws(() => parseArgs([]));
});
t('installing one persona copies only that persona, the injector and the doc', () => {
  const { home, env } = sandbox();
  const to = path.join(home, 'proj', 'addons');
  assert.ok(setup(env, '--install', 'female-pro', '--to', to).stdout.includes('female-pro installed'));
  assert.deepStrictEqual(tree(to), ['SKILL.md', 'inject.js', 'personas', 'personas/female-pro.md']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'personality.json'), 'utf8')), { gender: 'female', level: 'pro' });
});
t('the installed copy works for its persona and refuses the ones it does not hold', () => {
  const { home, env } = sandbox();
  const to = path.join(home, 'addons');
  setup(env, '--install', 'male-mid', '--to', to);
  const inst = path.join(to, 'inject.js');
  const ctx = JSON.parse(spawnSync(process.execPath, [inst], { env, input: '{}', encoding: 'utf8' }).stdout).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes('Jonas'));
  const r = spawnSync(process.execPath, [inst, '--set', 'female', 'pro'], { env, encoding: 'utf8' }).stdout;
  assert.ok(r.includes('not installed'));
  assert.ok(spawnSync(process.execPath, [inst, '--list'], { env, encoding: 'utf8' }).stdout.includes('female pro: Vera (not installed)'));
});
t('choosing none installs nothing and clears the saved choice', () => {
  const { home, env } = sandbox();
  run(env, '', '--set', 'female', 'mid');
  const to = path.join(home, 'addons');
  assert.ok(setup(env, '--install', 'none', '--to', to).stdout.includes('nothing installed'));
  assert.ok(!fs.existsSync(to));
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'personality.json')));
});
t('custom writes an editable starter, then injects it', () => {
  const { home, env } = sandbox();
  assert.ok(setup(env, '--install', 'custom', '--to', path.join(home, 'addons')).stdout.includes('edit it'));
  const f = path.join(home, '.claude', 'personas', 'custom.md');
  assert.ok(fs.readFileSync(f, 'utf8').includes('Your persona'));
  fs.writeFileSync(f, '# Captain — speak briefly like a ship captain\n\nShort orders only.');
  const inst = path.join(home, 'addons', 'inject.js');
  assert.ok(spawnSync(process.execPath, [inst, '--status'], { env, encoding: 'utf8' }).stdout.includes('Captain (custom)'));
  assert.ok(JSON.parse(spawnSync(process.execPath, [inst], { env, input: '{}', encoding: 'utf8' }).stdout).hookSpecificOutput.additionalContext.includes('ship captain'));
});
t('custom copies a given file and refuses a missing one', () => {
  const { home, env } = sandbox();
  const mine = path.join(home, 'mine.md'); fs.writeFileSync(mine, '# Zed — plain and brief');
  assert.ok(setup(env, '--install', 'custom', '--file', mine).stdout.includes('custom persona at'));
  assert.strictEqual(fs.readFileSync(path.join(home, '.claude', 'personas', 'custom.md'), 'utf8'), '# Zed — plain and brief');
  assert.ok(setup(env, '--install', 'custom', '--file', path.join(home, 'none.md')).stdout.includes('missing or empty'));
});
