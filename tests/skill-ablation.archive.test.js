const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { archive, restore, archives } = require('../skills/memory/skill-ablation.archive.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'memory', 'skill-ablation.archive.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'abl space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--root', cwd], { encoding: 'utf8' });
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function fixture() {
  const d = proj();
  write(d, 'CLAUDE.md', '# C\n');
  write(d, '.claude/skills/handover/SKILL.md', 'h');
  write(d, '.claude/skills/plan-first/SKILL.md', 'p');
  write(d, '.claude/commands/next.md', 'n');
  write(d, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(node:*)'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } }, null, 2) + '\n');
  write(d, '.gitignore', 'node_modules\n');
  write(d, 'src/app.js', 'untouched');
  return d;
}

t('archive moves session file, skills, commands and the hooks block; keeps permissions and source; writes a manifest', () => {
  const d = fixture();
  const m = archive(d, false, '2026-11-11');
  assert.deepStrictEqual(m.moved.map((x) => x.from), ['CLAUDE.md', '.claude/skills', '.claude/commands']);
  assert.deepStrictEqual(m.moved[1].skills, ['handover', 'plan-first']);
  assert.ok(!exists(d, 'CLAUDE.md') && !exists(d, '.claude/skills') && !exists(d, '.claude/commands'));
  assert.ok(exists(d, '.ablation-archive/2026-11-11/CLAUDE.md'));
  assert.ok(exists(d, '.ablation-archive/2026-11-11/.claude/skills/handover/SKILL.md'));
  assert.ok(exists(d, '.ablation-archive/2026-11-11/manifest.json'));
  const settings = JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8'));
  assert.deepStrictEqual(settings, { permissions: { allow: ['Bash(node:*)'] } });
  assert.strictEqual(fs.readFileSync(path.join(d, 'src/app.js'), 'utf8'), 'untouched');
  assert.match(fs.readFileSync(path.join(d, '.gitignore'), 'utf8'), /\.ablation-archive\//);
  assert.deepStrictEqual(archives(d), ['2026-11-11']);
});

t('restore puts everything back, including hooks, and removes the emptied archive', () => {
  const d = fixture();
  archive(d, false, '2026-11-11');
  const r = restore(d, {});
  assert.deepStrictEqual(r.restored, ['CLAUDE.md', '.claude/skills', '.claude/commands', 'hooks in .claude/settings.json']);
  assert.ok(exists(d, 'CLAUDE.md') && exists(d, '.claude/skills/plan-first/SKILL.md') && exists(d, '.claude/commands/next.md'));
  assert.ok(JSON.parse(fs.readFileSync(path.join(d, '.claude/settings.json'), 'utf8')).hooks.Stop);
  assert.deepStrictEqual(archives(d), []);
});

t('restore --only brings back named skills and leaves the rest archived', () => {
  const d = fixture();
  archive(d, false, '2026-11-11');
  const r = restore(d, { only: ['plan-first'] });
  assert.deepStrictEqual(r.restored, ['.claude/skills/plan-first']);
  assert.ok(exists(d, '.claude/skills/plan-first/SKILL.md'));
  assert.ok(!exists(d, '.claude/skills/handover'));
  assert.ok(!exists(d, 'CLAUDE.md'));
  assert.ok(r.kept.some((k) => k.includes('handover')) && r.kept.includes('CLAUDE.md') && r.kept.includes('hooks'));
  const s = restore(d, { only: ['session', 'hooks'] });
  assert.deepStrictEqual(s.restored, ['CLAUDE.md', 'hooks in .claude/settings.json']);
});

t('--dry-run moves nothing; archive twice on the same day is refused; restore into an existing file is refused', () => {
  const d = fixture();
  const r = run(d, 'archive', '--dry-run');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /would archive/);
  assert.ok(exists(d, 'CLAUDE.md') && !exists(d, '.ablation-archive'));
  archive(d, false, '2026-11-11');
  assert.throws(() => archive(d, false, '2026-11-11'), /already exists/);
  write(d, 'CLAUDE.md', 'new one');
  assert.throws(() => restore(d, {}), /CLAUDE\.md already exists/);
  assert.strictEqual(fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8'), 'new one');
});

t('nothing to archive or restore exits 3; status lists archives; bad usage exits 2', () => {
  const d = proj();
  assert.strictEqual(run(d, 'archive').status, 3);
  assert.strictEqual(run(d, 'restore').status, 3);
  assert.match(run(d, 'status').stdout, /no ablation archive/);
  const f = fixture();
  archive(f, false, '2026-11-11');
  assert.match(run(f, 'status').stdout, /2026-11-11: CLAUDE\.md, \.claude\/skills \(2\), \.claude\/commands, hooks/);
  for (const bad of [['nope'], ['archive', '--wat'], ['restore', '--date', 'yesterday']]) {
    const r = run(d, ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});

t('invalid settings.json blocks the archive before anything moves', () => {
  const d = fixture();
  write(d, '.claude/settings.json', '{ not json');
  assert.throws(() => archive(d, false, '2026-11-11'), /not valid JSON/);
  assert.ok(exists(d, 'CLAUDE.md') && exists(d, '.claude/skills'));
});
