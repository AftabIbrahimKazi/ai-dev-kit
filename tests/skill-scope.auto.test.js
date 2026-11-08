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

// run: restores an archived skill, then runs its script from the installed layout
t('run restores an archived skill and runs its script with the remaining arguments', () => {
  const { doInstall, doArchive } = require('../skills/meta/install-kit.cli.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run space-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n');
  doInstall({ library: path.join(__dirname, '..'), root, tool: 'claude', skills: ['skill-scope', 'version-bump'] });
  doArchive({ root, skills: ['version-bump'] });
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'skills', 'version-bump')));
  const r = spawnSync(process.execPath, [path.join(root, '.claude', 'skills', 'skill-scope', 'auto.js'), 'run', 'version-bump', 'bump.js', 'patch', '--dry-run', '--no-changelog'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /1\.0\.0 -> 1\.0\.1/);
  assert.ok(fs.existsSync(path.join(root, '.claude', 'skills', 'version-bump', 'bump.js')));
});

t('run with a missing script exits 1 with one error line; bad names exit 2', () => {
  const { doInstall } = require('../skills/meta/install-kit.cli.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run2-'));
  doInstall({ library: path.join(__dirname, '..'), root, tool: 'claude', skills: ['skill-scope'] });
  const auto = path.join(root, '.claude', 'skills', 'skill-scope', 'auto.js');
  const missing = spawnSync(process.execPath, [auto, 'run', 'nothing', 'x.js'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(missing.status, 1);
  assert.strictEqual(missing.stderr.trim().split('\n').length, 1);
  assert.strictEqual(spawnSync(process.execPath, [auto, 'run', '../evil', 'x.js'], { cwd: root, encoding: 'utf8' }).status, 2);
  assert.strictEqual(spawnSync(process.execPath, [auto, 'run', 'skill-scope', '../auto.js'], { cwd: root, encoding: 'utf8' }).status, 2);
});

t('/next mode words never act as task words: tsk-note and tsk-start restore what the bare task restores', () => {
  const base = makeProject(['perf-audit', 'responsive-check']);
  run('apply', '--root', base);
  run('apply', '--root', base, 'check', 'responsive', 'layout', 'on', 'mobile');
  for (const mode of ['tsk-note', 'tsk-start', 'TSK-NOTE']) {
    const root = makeProject(['perf-audit', 'responsive-check']);
    run('apply', '--root', root);
    assert.strictEqual(run('apply', '--root', root, mode, 'check', 'responsive', 'layout', 'on', 'mobile').status, 0);
    assert.deepStrictEqual(active(root), active(base), mode);
  }
});
t('a bare mode word is an empty task: everything archivable is archived', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  assert.strictEqual(run('apply', '--root', root, 'tsk-note').status, 0);
  assert.deepStrictEqual(active(root), []);
});
t('no scope trigger contains the mode words note or start', () => {
  for (const [skill, words] of Object.entries(triggers.skills)) {
    for (const w of [].concat(words.words || words)) assert.ok(!/^(note|start)/i.test(String(w)), skill + ': ' + w);
  }
});
t('drop archives only archivable skills; add restores; list and report show it', () => {
  const root = makeProject(['perf-audit', 'responsive-check', 'handover']);
  const d = run('drop', '--root', root, 'perf-audit', 'handover');
  assert.ok(/archived perf-audit/.test(d.stdout) && /pinned, not moved: handover/.test(d.stdout), d.stdout);
  assert.deepStrictEqual(active(root), ['handover', 'responsive-check']);
  assert.ok(/archived \(1\): perf-audit/.test(run('list', '--root', root).stdout));
  const a = run('add', '--root', root, 'perf-audit');
  assert.ok(/restored perf-audit -- read .*perf-audit\/SKILL\.md now/.test(a.stdout), a.stdout);
  assert.ok(/not installed: nope/.test(run('add', '--root', root, 'nope').stdout));
});
t('report lists manual moves since the last mark and --mark starts a new window', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  run('drop', '--root', root, 'perf-audit');
  run('add', '--root', root, 'perf-audit');
  const r1 = run('report', '--root', root, '--mark');
  assert.ok(/restored by you: perf-audit/.test(r1.stdout) && /archived by you: perf-audit/.test(r1.stdout), r1.stdout);
  const r2 = run('report', '--root', root);
  assert.ok(!/by you/.test(r2.stdout) && /archived now \(0\): none/.test(r2.stdout), r2.stdout);
});
t('a task-word restore shows in the report as restored by task words', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  run('apply', '--root', root);
  run('apply', '--root', root, '--add-only', '--quiet', 'why', 'is', 'it', 'slow');
  assert.ok(/restored by task words: perf-audit/.test(run('report', '--root', root).stdout));
});
t('wrap with no task moves nothing; with a task it applies it and reports', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  assert.ok(/no next task given/.test(run('wrap', '--root', root).stdout));
  assert.deepStrictEqual(active(root), ['perf-audit', 'responsive-check']);
  const r = run('wrap', '--root', root, 'speed', 'up', 'the', 'page');
  assert.ok(/archived 1/.test(r.stdout) && /active for it: perf-audit/.test(r.stdout), r.stdout);
  assert.deepStrictEqual(active(root), ['perf-audit']);
});
t('/next --require-task: empty args, bad mode word and mode word alone move nothing', () => {
  for (const args of [[], ['check', 'responsive', 'layout'], ['tsk-note'], ['tsk-start']]) {
    const root = makeProject(['perf-audit', 'responsive-check']);
    const r = run('apply', '--root', root, '--require-task', ...args);
    assert.strictEqual(r.status, 0);
    assert.ok(/no skills moved/.test(r.stdout), args.join(' ') + ': ' + r.stdout);
    assert.deepStrictEqual(active(root), ['perf-audit', 'responsive-check'], args.join(' '));
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, '.ai-dev-kit.json'), 'utf8')).scopeLog, undefined);
  }
});
t('/next --require-task: tsk-note and tsk-start with a task still apply it', () => {
  for (const mode of ['tsk-note', 'tsk-start']) {
    const root = makeProject(['perf-audit', 'responsive-check']);
    const r = run('apply', '--root', root, '--require-task', mode, 'check', 'responsive', 'layout', 'on', 'mobile');
    assert.ok(/archived 1/.test(r.stdout), r.stdout);
    assert.deepStrictEqual(active(root), ['responsive-check']);
  }
});
t('/archive with no names archives every archivable skill; /unarchive with no names restores them all', () => {
  const root = makeProject(['perf-audit', 'responsive-check', 'handover']);
  const d = run('drop', '--root', root);
  assert.ok(/archived perf-audit, responsive-check/.test(d.stdout), d.stdout);
  assert.deepStrictEqual(active(root), ['handover']);
  const a = run('add', '--root', root);
  assert.ok(/restored perf-audit, responsive-check/.test(a.stdout), a.stdout);
  assert.deepStrictEqual(active(root), ['handover', 'perf-audit', 'responsive-check']);
});
t('report names archived skills the queued next task needs, names only', () => {
  const root = makeProject(['perf-audit', 'responsive-check']);
  run('apply', '--root', root);
  fs.writeFileSync(path.join(root, 'handover.md'), '# H\n\n## Next task\ntsk-note: check responsive layout on mobile\n');
  const r = run('report', '--root', root);
  assert.ok(/next task needs archived: responsive-check -- run \/unarchive responsive-check/.test(r.stdout), r.stdout);
  assert.ok(!/perf-audit --/.test(r.stdout));
  assert.ok(!/next task needs/.test(run('report', '--root', root, '--mark').stdout));
});
