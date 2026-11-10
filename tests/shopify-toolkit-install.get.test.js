const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { install, status, skillRootFor } = require('../skills/stack/shopify-toolkit-install.get.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'stack', 'shopify-toolkit-install.get.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shop space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

// A local stand-in for Shopify's repo: git clone works on a file path, so no network is needed.
function upstream() {
  const d = proj();
  write(d, 'skills/shopify-liquid/SKILL.md', '# liquid');
  write(d, 'skills/shopify-liquid/scripts/x.js', '1');
  write(d, 'skills/shopify-dev/SKILL.md', '# dev');
  write(d, 'skills/not-a-skill/README.md', 'no SKILL.md here');
  write(d, 'README.md', 'upstream');
  git(d, 'init', '-q');
  git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
  git(d, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return d;
}
const haveGit = git(os.tmpdir(), '--version').status === 0;
if (!haveGit) { console.log('skip: git not installed'); process.exit(0); }

t('list names only folders with a SKILL.md', () => {
  const r = run('list', '--source', upstream(), '--json');
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepStrictEqual(j.skills, ['shopify-dev', 'shopify-liquid']);
  assert.match(j.commit, /^[0-9a-f]{7,}$/);
});

t('install copies chosen skills whole into the routed root, notes the snapshot, prints telemetry, cleans the scratch clone', () => {
  const up = upstream();
  const p = proj();
  write(p, '.ai-dev-kit.json', JSON.stringify({ tool: 'opencode', skillRoot: '.opencode/skills' }));
  write(p, 'AGENTS.md', '# Agents\n');
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('shopify-toolkit-')).length;
  const r = install(p, { source: up, skills: ['shopify-liquid', 'nope'] });
  assert.deepStrictEqual(r.installed, ['shopify-liquid']);
  assert.deepStrictEqual(r.missing, ['nope']);
  assert.strictEqual(r.skillRoot, '.opencode/skills');
  assert.ok(fs.existsSync(path.join(p, '.opencode', 'skills', 'shopify-liquid', 'scripts', 'x.js')));
  assert.ok(!fs.existsSync(path.join(p, '.opencode', 'skills', 'shopify-dev')));
  const note = fs.readFileSync(path.join(p, 'AGENTS.md'), 'utf8');
  assert.match(note, /shopify-toolkit:start/);
  assert.match(note, /shopify-liquid/);
  assert.match(r.telemetry, /OPT_OUT_INSTRUMENTATION/);
  assert.strictEqual(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('shopify-toolkit-')).length, before);
  assert.deepStrictEqual(status(p).present, ['shopify-liquid']);
  assert.match(status(p).commit, /^[0-9a-f]{7,}$/);
});

t('a second install keeps existing skills unless --force; the note block is replaced, not duplicated', () => {
  const up = upstream();
  const p = proj();
  write(p, 'CLAUDE.md', '# C\n');
  install(p, { source: up });
  fs.writeFileSync(path.join(p, '.claude', 'skills', 'shopify-dev', 'SKILL.md'), 'edited');
  const r = install(p, { source: up });
  assert.deepStrictEqual(r.installed, []);
  assert.deepStrictEqual(r.skipped, ['shopify-dev', 'shopify-liquid']);
  assert.strictEqual(fs.readFileSync(path.join(p, '.claude', 'skills', 'shopify-dev', 'SKILL.md'), 'utf8'), 'edited');
  assert.strictEqual((fs.readFileSync(path.join(p, 'CLAUDE.md'), 'utf8').match(/shopify-toolkit:start/g) || []).length, 1);
  const f = install(p, { source: up, force: true });
  assert.deepStrictEqual(f.installed, ['shopify-dev', 'shopify-liquid']);
  assert.strictEqual(fs.readFileSync(path.join(p, '.claude', 'skills', 'shopify-dev', 'SKILL.md'), 'utf8'), '# dev');
});

t('--dry-run writes nothing; install into the kit itself is refused', () => {
  const up = upstream();
  const p = proj();
  const r = run('install', '--root', p, '--source', up, '--dry-run');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /would install 2 skills/);
  assert.ok(!fs.existsSync(path.join(p, '.claude')));
  assert.ok(!fs.existsSync(path.join(p, 'AGENTS.md')));
  const kit = proj();
  write(kit, 'skills/meta/install-kit.md', 'x');
  const k = run('install', '--root', kit, '--source', up);
  assert.strictEqual(k.status, 1);
  assert.match(k.stderr, /library itself/);
});

t('skill root routing: manifest, then tool folders, then .claude/skills', () => {
  const p = proj();
  assert.strictEqual(skillRootFor(p), '.claude/skills');
  fs.mkdirSync(path.join(p, '.agents'));
  assert.strictEqual(skillRootFor(p), '.agents/skills');
  assert.strictEqual(skillRootFor(p, 'custom/skills'), 'custom/skills');
});

t('a bad source URL is an error (exit 1); bad usage exits 2', () => {
  const r = run('list', '--source', path.join(proj(), 'does-not-exist'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /clone failed/);
  for (const bad of [['nope'], ['install'], ['status'], ['list', '--wat']]) {
    const x = run(...bad);
    assert.strictEqual(x.status, 2, bad.join(' '));
    assert.strictEqual(x.stderr.trim().split('\n').length, 1);
  }
});
