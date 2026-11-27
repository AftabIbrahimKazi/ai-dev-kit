// B3: which protocol file the installer touches, the exit code of a failed verify, the claude binary lookup, the mods marketplace
// re-point, the nested-kit git exclude, and the gitignored-protocol warning. Fake homes and a stand-in claude; no network.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const LIB = path.join(__dirname, '..');
const CLI = path.join(LIB, 'skills', 'meta', 'install-kit.cli.js');
const kit = require(CLI);
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const run = (root, args, env) => spawnSync(process.execPath, [CLI, 'install', '--library', LIB, '--root', root, '--tool', 'claude', '--signature', 'none', ...args], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
const manifest = (root) => JSON.parse(fs.readFileSync(path.join(root, '.ai-dev-kit.json'), 'utf8'));
const STD = ['--skills', 'handover', '--standards', '--context-code', 'TST'];

t('finder: the tool file first, the other shared file next, a private .local file last', () => {
  const root = tmp('prot-');
  for (const n of ['CLAUDE.local.md', 'AGENTS.md', 'CLAUDE.md']) fs.writeFileSync(path.join(root, n), 'x');
  assert.deepStrictEqual(kit.findExistingProtocols(root, 'CLAUDE.md').map((p) => path.basename(p)), ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md']);
  assert.deepStrictEqual(kit.findExistingProtocols(root, 'AGENTS.md').map((p) => path.basename(p)), ['AGENTS.md', 'CLAUDE.md', 'CLAUDE.local.md']);
});

t('tool claude with only an AGENTS.md: AGENTS.md is left alone, CLAUDE.md is created, the manifest names CLAUDE.md', () => {
  const root = tmp('prot-');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'my agents file\n');
  const r = run(root, [...STD, '--existing-protocol', 'replace']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'my agents file\n');
  assert.ok(fs.existsSync(path.join(root, 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md.bak')), 'no backup of a file that was never touched');
  assert.strictEqual(manifest(root).protocolFile, 'CLAUDE.md');
});

t('the manifest names the file that was actually written when the project uses a different letter case', () => {
  const root = tmp('prot-');
  fs.writeFileSync(path.join(root, 'claude.md'), '# mine\n');
  const r = run(root, [...STD, '--existing-protocol', 'append']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(manifest(root).protocolFile.toLowerCase(), 'claude.md');
});

t('the context code is refreshed in every protocol file that carries the kit markers, not only the manifest file', () => {
  const root = tmp('prot-');
  assert.strictEqual(run(root, STD).status, 0);
  const claude = path.join(root, 'CLAUDE.md');
  const body = fs.readFileSync(claude, 'utf8');
  assert.match(body, /\| Context code \| TST \|/);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), body); // a second file with the same markers
  const r = spawnSync(process.execPath, [CLI, 'update', '--library', LIB, '--root', root, '--all', '--context-code', 'NEW'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(claude, 'utf8'), /\| Context code \| NEW \|/);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /\| Context code \| NEW \|/);
});

t('a failed verify exits 1 and prints the finding (standards were asked for but the context code was left unfilled)', () => {
  const root = tmp('prot-');
  const r = run(root, ['--skills', 'handover', '--standards']);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /verify FAILED session-protocol/);
  assert.match(r.stderr, /unfilled placeholder/);
});

t('skills only, no standards: a missing protocol file is not an exit-code failure', () => {
  const root = tmp('prot-');
  const r = run(root, ['--skills', 'handover']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/verify FAILED/.test(r.stderr));
});

t('a protocol file hidden by .gitignore is reported with the exception to add', () => {
  const root = tmp('prot-');
  git(root, 'init', '-q');
  fs.writeFileSync(path.join(root, '.gitignore'), '*.md\n');
  const r = run(root, STD);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /CLAUDE\.md is ignored by this project's \.gitignore/);
  assert.match(r.stderr, /!CLAUDE\.md/);
});

t('a kit cloned inside the project is added to .git/info/exclude once', () => {
  const root = tmp('prot-');
  git(root, 'init', '-q');
  const lib = path.join(root, 'ai-dev-kit');
  fs.mkdirSync(lib);
  assert.strictEqual(kit.excludeKitFromGit(root, lib), '/ai-dev-kit/');
  assert.strictEqual(kit.excludeKitFromGit(root, lib), undefined, 'second call adds nothing');
  const ex = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.strictEqual(ex.split(/\r?\n/).filter((l) => l === '/ai-dev-kit/').length, 1);
  assert.strictEqual(kit.excludeKitFromGit(root, path.join(os.tmpdir(), 'elsewhere')), undefined, 'a kit outside the project is not excluded');
});

// ---- the claude command and the feature-usage mod

function standIn(dir, behaviour) {
  const file = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(file, `
const fs = require('fs'), path = require('path');
const log = path.join(${JSON.stringify(dir)}, 'calls.log');
const state = path.join(${JSON.stringify(dir)}, 'state.json');
const a = process.argv.slice(2).join(' ');
fs.appendFileSync(log, a + '\\n');
const st = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { removed: false };
const mode = ${JSON.stringify(behaviour)};
if (a.startsWith('plugin marketplace list')) { console.log(mode === 'other-copy' && !st.removed ? 'ai-dev-kit-mods  C:/some/other/kit/mods' : 'ai-dev-kit-mods  ' + process.env.EXPECT_MARKET); process.exit(0); }
if (a.startsWith('plugin marketplace remove')) { st.removed = true; fs.writeFileSync(state, JSON.stringify(st)); process.exit(0); }
if (a.startsWith('plugin marketplace add')) { if (mode === 'other-copy' && !st.removed) { console.error('marketplace already registered'); process.exit(1); } process.exit(0); }
if (a.startsWith('plugin install')) {
  const cfg = path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json');
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, JSON.stringify({ enabledPlugins: { 'feature-usage@ai-dev-kit-mods': true } }));
  process.exit(0);
}
process.exit(0);
`);
  return file;
}
const usageEnv = (dir, extra) => ({ AI_DEV_KIT_HOME: path.join(dir, 'home'), CLAUDE_CONFIG_DIR: path.join(dir, 'cfg'), USERPROFILE: dir, HOME: dir, ...(extra || {}) });

t('claudeBin: the override wins, then PATH, then the VS Code extension copy, otherwise null', () => {
  const dir = tmp('bin-');
  const saved = { ...process.env };
  try {
    process.env.AI_DEV_KIT_CLAUDE_BIN = 'X:/override.js';
    assert.strictEqual(kit.claudeBin(), 'X:/override.js');
    delete process.env.AI_DEV_KIT_CLAUDE_BIN;
    process.env.PATH = path.join(dir, 'empty'); process.env.USERPROFILE = dir; process.env.HOME = dir;
    assert.strictEqual(kit.claudeBin(), null);
    const ext = path.join(dir, '.vscode', 'extensions', 'anthropic.claude-code-9.9.9', 'resources', 'native-binary');
    fs.mkdirSync(ext, { recursive: true });
    fs.writeFileSync(path.join(ext, process.platform === 'win32' ? 'claude.exe' : 'claude'), 'x');
    assert.ok(kit.claudeBin().includes('anthropic.claude-code-9.9.9'));
  } finally { process.env = saved; }
});

t('--usage on with no claude anywhere: plain failure text, exit 1, nothing hidden', () => {
  const dir = tmp('usage-');
  const root = tmp('prot-');
  const r = run(root, [...STD, '--usage', 'on', '--json'], { ...usageEnv(dir), AI_DEV_KIT_CLAUDE_BIN: '', PATH: path.join(dir, 'empty') });
  assert.strictEqual(r.status, 1, r.stderr);
  assert.match(r.stderr, /feature-usage mod NOT installed/);
  assert.match(r.stderr, /claude command was not found/);
  assert.strictEqual(JSON.parse(r.stdout).usage.mod, 'failed');
});

t('--usage on with a working claude installs the mod and exits 0', () => {
  const dir = tmp('usage-');
  fs.mkdirSync(path.join(dir, 'home'), { recursive: true });
  const bin = standIn(dir, 'fresh');
  const root = tmp('prot-');
  const r = run(root, [...STD, '--usage', 'on', '--json'], { ...usageEnv(dir), AI_DEV_KIT_CLAUDE_BIN: bin, EXPECT_MARKET: path.join(LIB, 'mods') });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).usage.mod, 'installed');
});

t('a marketplace already registered from ANOTHER kit copy is removed and re-added from this one', () => {
  const dir = tmp('usage-');
  fs.mkdirSync(path.join(dir, 'home'), { recursive: true });
  const bin = standIn(dir, 'other-copy');
  const root = tmp('prot-');
  const r = run(root, [...STD, '--usage', 'on', '--json'], { ...usageEnv(dir), AI_DEV_KIT_CLAUDE_BIN: bin, EXPECT_MARKET: path.join(LIB, 'mods') });
  assert.strictEqual(r.status, 0, r.stderr);
  const calls = fs.readFileSync(path.join(dir, 'calls.log'), 'utf8');
  assert.match(calls, /marketplace remove ai-dev-kit-mods/);
  assert.ok(calls.indexOf('marketplace remove') < calls.lastIndexOf('marketplace add'), 'removed before the second add');
  assert.strictEqual(JSON.parse(r.stdout).usage.mod, 'installed');
});

t('the installer never spawns claude with shell and an args array (DEP0190)', () => {
  const src = fs.readFileSync(path.join(LIB, 'skills', 'meta', 'install-kit.cli.ts'), 'utf8');
  const shells = src.split('\n').filter((l) => /shell\s*:/.test(l) && !l.trim().startsWith('//'));
  assert.strictEqual(shells.length, 1, 'one shell:true spawn at most: ' + shells.join(' | '));
  assert.ok(/join\(' '\)/.test(shells[0]), 'that spawn must pass ONE quoted command string, not an args array');
  assert.ok(!src.includes('/.(c|m)?js$/'), 'the unescaped-dot regex is back');
});
