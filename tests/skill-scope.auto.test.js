const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { matchSkills, plan, loadTriggers } = require('../skills/meta/skill-scope.auto.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.auto.js');
const triggers = loadTriggers();

// A project with a manifest listing a few archivable skills, laid out like install-kit leaves it.
function makeProject(names) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope space-'));
  const skills = {};
  for (const n of names) {
    fs.mkdirSync(path.join(root, '.claude', 'skills', n), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'skills', n, 'SKILL.md'), '---\nname: ' + n + '\n---\n');
    skills[n] = { dir: 'skills/workflow', companions: [] };
  }
  fs.writeFileSync(path.join(root, '.ai-dev-kit.json'), JSON.stringify({ version: 1, tool: 'claude', skillRoot: '.claude/skills', skills, archived: {} }));
  return root;
}
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const active = (root) => fs.readdirSync(path.join(root, '.claude', 'skills')).filter((n) => n !== 'package.json').sort();

t('every trigger skill is in the skill-scope.md archivable list, and the reverse', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.md'), 'utf8');
  const line = md.split('\n').find((l) => l.startsWith('`perf-audit`'));
  const listed = [...line.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(listed, Object.keys(triggers.skills).sort());
});

t('whole-word match: "model" does not trigger mod-writer, "mod" and "hooks" do', () => {
  assert.ok(!matchSkills('tune the model', triggers).includes('mod-writer'));
  assert.ok(matchSkills('write a mod', triggers).includes('mod-writer'));
  assert.ok(matchSkills('add some hooks', triggers).includes('mod-writer'));
});

t('prefix trigger: "performance" fires perf-audit', () => {
  assert.deepStrictEqual(matchSkills('check performance', triggers), ['perf-audit']);
});

t('plan: no task archives every installed archivable skill', () => {
  const p = plan('', [], triggers, ['perf-audit', 'ui-design', 'handover'], []);
  assert.deepStrictEqual(p.archive, ['perf-audit', 'ui-design']);
  assert.deepStrictEqual(p.loaded, []);
});

t('plan: --keep overrides the task, and permanent skills are never planned', () => {
  const p = plan('fix the bug', ['perf-audit'], triggers, ['perf-audit', 'handover'], []);
  assert.deepStrictEqual(p.archive, []);
  assert.deepStrictEqual(p.loaded, ['perf-audit']);
});

t('apply with no task archives; apply with a task restores only the match', () => {
  const root = makeProject(['perf-audit', 'ui-design', 'handover']);
  assert.strictEqual(run('apply', '--root', root).status, 0);
  assert.deepStrictEqual(active(root), ['handover']);
  const r = run('apply', '--root', root, '--task', 'redesign the landing page');
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(active(root), ['handover', 'ui-design']);
  assert.ok(/ui-design/.test(r.stdout));
});

t('second apply with the same task changes nothing', () => {
  const root = makeProject(['perf-audit', 'ui-design']);
  run('apply', '--root', root, '--task', 'design');
  const before = active(root);
  run('apply', '--root', root, '--task', 'design');
  assert.deepStrictEqual(active(root), before);
});

t('--dry-run moves nothing; --json prints one document', () => {
  const root = makeProject(['perf-audit']);
  const r = run('apply', '--root', root, '--dry-run', '--json');
  assert.deepStrictEqual(active(root), ['perf-audit']);
  assert.deepStrictEqual(JSON.parse(r.stdout).archive, ['perf-audit']);
});

t('bad usage exits 2 with one usage line; no manifest exits 1', () => {
  const bad = run('nope');
  assert.strictEqual(bad.status, 2);
  assert.strictEqual(bad.stderr.trim().split('\n').length, 1);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-empty-'));
  assert.strictEqual(run('apply', '--root', empty).status, 1);
});

t('task given as plain trailing words, as /next passes $ARGUMENTS', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  run('apply', '--root', root);
  const r = run('apply', '--root', root, 'check', 'responsive', 'layout', 'on', 'mobile');
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(active(root), ['responsive-check']);
});

t('--add-only archives nothing; --quiet prints nothing unless a skill was restored', () => {
  const root = makeProject(['perf-audit', 'ui-design']);
  run('apply', '--root', root);
  const none = run('apply', '--root', root, '--add-only', '--quiet', 'fix', 'the', 'bug');
  assert.strictEqual(none.stdout, '');
  const hit = run('apply', '--root', root, '--add-only', '--quiet', 'redesign', 'the', 'theme');
  assert.deepStrictEqual(active(root), ['ui-design']);
  const later = run('apply', '--root', root, '--add-only', '--quiet', 'ok', 'continue');
  assert.deepStrictEqual(active(root), ['ui-design']);
  assert.ok(/ui-design/.test(hit.stdout));
});

t('locked theme: ux-theory restores on expansion words only; unlocked: on any theory word', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lock space-'));
  assert.ok(matchSkills('tweak the colour', triggers, root).includes('ux-theory'));
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Theme\n\n## Component inventory\n- button\n');
  assert.ok(!matchSkills('tweak the colour', triggers, root).includes('ux-theory'));
  assert.ok(matchSkills('add a new card variant', triggers, root).includes('ux-theory'));
  assert.ok(matchSkills('retheme the site', triggers, root).includes('ux-theory'));
});

t('a DESIGN.md without the inventory heading does not lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# Theme draft\n');
  assert.ok(matchSkills('pick a palette', triggers, root).includes('ux-theory'));
});
