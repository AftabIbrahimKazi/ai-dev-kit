const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  listSkills, doInstall, doUpdate, doUninstall, doArchive, doUnarchive, doMergeHooks, mergeHooks, extractCoreHooks,
  readManifest, applyContextCode, stripTemplatePreamble, detectStackSignals, eligibleCatalogNames, STACK_PRESETS,
  loadSkillPurposes,
} = require('../skills/meta/install-kit.cli.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'install-cli-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

// Builds a tiny fake library with the same shape as the real one: a plain skill, a skill with two
// companions (one .js, one directory), comment-style, a coding-standards folder, and a rename ledger.
function makeLibrary() {
  const lib = tmp();
  write(lib, 'skills/workflow/handover.md', '---\nname: handover\n---\n# handover v1\n');
  write(lib, 'skills/workflow/role-session.md', '---\nname: role-session\n---\n# role-session\n');
  write(lib, 'skills/workflow/role-session.protocol.md', '# protocol\n');
  write(lib, 'skills/workflow/role-session.templates.md', '# templates\n');
  write(lib, 'skills/workflow/session-budget.md', '---\nname: session-budget\n---\n# budget\n');
  write(lib, 'skills/workflow/session-budget.compact.js', '// compact\n');
  write(lib, 'skills/addons/personality.md', '---\nname: personality\n---\n# personality\n');
  write(lib, 'skills/addons/personality.inject.js', '// inject\n');
  write(lib, 'skills/addons/personality.personas/male-pro.md', '# male-pro\n');
  write(lib, 'skills/standards/comment-style.md', '---\nname: comment-style\n---\n# comment-style\n**Active level: none**\n');
  write(lib, 'skills/meta/install-kit.md', '# orchestrator, excluded from catalog\n');
  write(lib, 'skills/meta/install-kit.cli.js', '// self, excluded\n');
  write(lib, 'skills/README.md', '# excluded\n');
  write(lib, 'coding-standards/index.md', '# index\n');
  write(lib, 'coding-standards/css-standards.md', '# css\n');
  write(
    lib,
    'coding-standards/CLAUDE.example.md',
    '# CLAUDE.example.md\n\nTemplate preamble line.\n\n---\n\n' +
      '# [CLAUDE.md | AGENTS.md] — [Project Name]\n\n' +
      '| Property | Value |\n|---|---|\n' +
      '| Context code | [2–4 chars you choose, e.g. `X7` — letters+digit, not a common string like `OK` or `007`; delete this row to use bare `[CX]`] |\n' +
      '| Project name | [Your project name] |\n\n---\n\n' +
      '## Skill Triggers\n\n' +
      'Load the skill BEFORE the action. Remove rows for skills not installed.\n\n' +
      '| Situation | Skill |\n|---|---|\n' +
      '| About to commit | `pre-commit` |\n' +
      '| A task touching 3+ files | `plan-first` |\n\n---\n\n' +
      '## Parallel-Session Coordination\n\n' +
      '(Remove this section if the project does not use the parallel-session system.)\n\n' +
      'Before claiming or resuming any task, read `handover/PROTOCOL.md`.\n\n---\n\n' +
      '## Project State\n\nFor current project state read `handover.md`.\n',
  );
  write(lib, 'migrations/RENAMES.md', '| Date | Old name | New name | Notes |\n|---|---|---|---|\n| 2026-01-01 | `old-handover` | `handover` | renamed |\n');
  write(
    lib,
    'skills/models/claude/hooks-enforcement.md',
    '---\nname: hooks-enforcement\n---\n# hooks-enforcement\n\n' +
      '<!-- hook:core -->\n```json\n{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "echo one" }] }] } }\n```\n' +
      '<!-- hook:core -->\n```json\n{ "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "echo two" }] }] } }\n```\n' +
      'not core:\n```json\n{ "hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "echo superseded" }] }] } }\n```\n',
  );
  return lib;
}

t('listSkills finds plain skills, multi-companion skills, and a companion directory, excluding install-kit/README', () => {
  const lib = makeLibrary();
  const catalog = listSkills(lib);
  assert.ok(catalog.handover);
  assert.strictEqual(catalog.handover.companions.length, 0);
  assert.ok(!catalog['install-kit']);
  assert.ok(catalog['role-session']);
  const roleTargets = catalog['role-session'].companions.map((c) => c.target).sort();
  assert.deepStrictEqual(roleTargets, ['protocol.md', 'templates.md']);
  const personalityTargets = catalog.personality.companions.map((c) => c.target).sort();
  assert.deepStrictEqual(personalityTargets, ['inject.js', 'personas']);
});

t('install copies a skill, its companions, the commonjs shield, and writes a manifest', () => {
  const lib = makeLibrary();
  const target = tmp();
  const res = doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover', 'session-budget'] });
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/handover/SKILL.md')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/session-budget/compact.js')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/package.json')));
  assert.match(fs.readFileSync(path.join(target, '.claude/skills/package.json'), 'utf8'), /"type":\s*"commonjs"/);
  const manifest = readManifest(target);
  assert.ok(manifest.skills.handover);
  assert.ok(manifest.skills['session-budget']);
  assert.strictEqual(res.verify.ok === false, true); // no session-protocol file yet in this test -- expected
});

t('install with a companion filter installs only the chosen companion', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['personality:inject'] });
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/personality/inject.js')));
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/personality/personas')));
});

t('install with --standards copies coding-standards and creates a filled session-protocol file', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'X7' });
  assert.ok(fs.existsSync(path.join(target, 'coding-standards/index.md')));
  const body = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.ok(!/Template preamble line/.test(body));
  assert.match(body, /\| Context code \| X7 \|/);
});

t('install with --standards prunes Skill Triggers rows for skills not installed and drops Parallel-Session Coordination when role-session is absent', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'X7' });
  const body = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.ok(!/pre-commit/.test(body));
  assert.ok(!/plan-first/.test(body));
  assert.ok(!/Parallel-Session Coordination/.test(body));
  assert.match(body, /## Project State/);
});

t('install with --standards keeps a Skill Triggers row and the Parallel-Session section when those skills are installed', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover', 'role-session'], standards: true, contextCode: 'X7' });
  const body = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.match(body, /Parallel-Session Coordination/);
  assert.match(body, /handover\/PROTOCOL\.md/);
});

t('install with context-code "none" removes the Context code row', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
  const body = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.ok(!/Context code/.test(body));
});

t('install never overwrites an existing session-protocol file', () => {
  const lib = makeLibrary();
  const target = tmp();
  write(target, 'CLAUDE.md', '# my own hand-written file\n');
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'X7' });
  const body = fs.readFileSync(path.join(target, 'CLAUDE.md'), 'utf8');
  assert.strictEqual(body, '# my own hand-written file\n');
});

t('comment-style level is written on install and carried forward on update without re-passing it', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['comment-style'], commentStyleLevel: 'terse' });
  assert.match(fs.readFileSync(path.join(target, '.claude/skills/comment-style/SKILL.md'), 'utf8'), /Active level: terse/);
  write(lib, 'skills/standards/comment-style.md', '---\nname: comment-style\n---\n# comment-style v2\n**Active level: none**\n');
  doUpdate({ library: lib, root: target, skills: ['comment-style'] });
  const body = fs.readFileSync(path.join(target, '.claude/skills/comment-style/SKILL.md'), 'utf8');
  assert.match(body, /comment-style v2/);
  assert.match(body, /Active level: terse/);
});

t('update only touches skills recorded in the manifest, skipping an unmanifested folder', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'] });
  write(target, '.claude/skills/hand-authored/SKILL.md', '---\nname: hand-authored\n---\n# mine\n');
  const res = doUpdate({ library: lib, root: target, skills: ['hand-authored'] });
  assert.ok(res.skills[0].error);
  assert.ok(fs.readFileSync(path.join(target, '.claude/skills/hand-authored/SKILL.md'), 'utf8').includes('mine'));
});

t('update --all re-syncs every manifested skill and picks up a changed companion', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['session-budget'] });
  write(lib, 'skills/workflow/session-budget.compact.js', '// compact v2\n');
  doUpdate({ library: lib, root: target, all: true });
  assert.match(fs.readFileSync(path.join(target, '.claude/skills/session-budget/compact.js'), 'utf8'), /v2/);
});

t('a pending rename migration is reported but not applied without --apply-migrations', () => {
  const lib = makeLibrary();
  const target = tmp();
  write(target, '.claude/skills/old-handover/SKILL.md', '---\nname: old-handover\n---\n# old\n');
  const manifest = readManifest(target);
  manifest.tool = 'claude'; manifest.skillRoot = '.claude/skills'; manifest.protocolFile = 'CLAUDE.md'; manifest.skills['old-handover'] = { dir: 'workflow', companions: [] };
  require('../skills/meta/install-kit.cli.js').writeManifest(target, manifest);
  const res = doUpdate({ library: lib, root: target, skills: [] });
  assert.strictEqual(res.migrations.length, 1);
  assert.strictEqual(res.migrations[0].applied, false);
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/old-handover/SKILL.md')));
});

t('applying a rename migration moves learnings.md forward and removes the old folder', () => {
  const lib = makeLibrary();
  const target = tmp();
  write(target, '.claude/skills/old-handover/SKILL.md', '---\nname: old-handover\n---\n# old\n');
  write(target, '.claude/skills/old-handover/learnings.md', '- learned something\n');
  const manifest = readManifest(target);
  manifest.tool = 'claude'; manifest.skillRoot = '.claude/skills'; manifest.protocolFile = 'CLAUDE.md'; manifest.skills['old-handover'] = { dir: 'workflow', companions: [] };
  require('../skills/meta/install-kit.cli.js').writeManifest(target, manifest);
  doUpdate({ library: lib, root: target, skills: [], applyMigrations: 'all' });
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/old-handover')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/handover/SKILL.md')));
  assert.match(fs.readFileSync(path.join(target, '.claude/skills/handover/learnings.md'), 'utf8'), /learned something/);
});

t('uninstall removes only manifested skills and leaves an untracked folder alone', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover', 'session-budget'] });
  write(target, '.claude/skills/hand-authored/SKILL.md', '---\nname: hand-authored\n---\n# mine\n');
  const res = doUninstall({ root: target, skills: ['handover', 'hand-authored'] });
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/handover')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/hand-authored')));
  assert.ok(res.kept.some((k) => k.includes('hand-authored')));
});

t('uninstall drops the commonjs shield once no companion skill still needs it', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['session-budget'] });
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/package.json')));
  doUninstall({ root: target, all: true });
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/package.json')));
});

t('uninstall leaves coding-standards and the session-protocol file alone unless told to remove them', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'X7' });
  doUninstall({ root: target, skills: ['handover'] });
  assert.ok(fs.existsSync(path.join(target, 'coding-standards/index.md')));
  assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
});

t('uninstall --remove-standards removes coding-standards but still never deletes the protocol file', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'X7' });
  doUninstall({ root: target, skills: ['handover'], removeStandards: true });
  assert.ok(!fs.existsSync(path.join(target, 'coding-standards')));
  assert.ok(fs.existsSync(path.join(target, 'CLAUDE.md')));
});

t('archive moves a manifested skill into skills-archive/, drops the shield, and updates the manifest', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover', 'session-budget'] });
  const res = doArchive({ root: target, skills: ['session-budget'] });
  assert.deepStrictEqual(res.archived.filter((a) => !a.startsWith('(')), ['session-budget']);
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/session-budget')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills-archive/session-budget/SKILL.md')));
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills/package.json')));
  const manifest = readManifest(target);
  assert.ok(!manifest.skills['session-budget']);
  assert.ok(manifest.archived['session-budget']);
  assert.ok(manifest.skills.handover); // untouched
});

t('unarchive restores a skill and reinstates the shield if it needs one', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['session-budget'] });
  doArchive({ root: target, skills: ['session-budget'] });
  const res = doUnarchive({ root: target, skills: ['session-budget'] });
  assert.deepStrictEqual(res.restored, ['session-budget']);
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/session-budget/compact.js')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/package.json')));
  assert.ok(!fs.existsSync(path.join(target, '.claude/skills-archive/session-budget')));
  const manifest = readManifest(target);
  assert.ok(manifest.skills['session-budget']);
  assert.ok(!manifest.archived['session-budget']);
});

t('archive --all only touches currently-installed (not already-archived) skills, and leaves an untracked folder alone', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover', 'session-budget'] });
  write(target, '.claude/skills/hand-authored/SKILL.md', '---\nname: hand-authored\n---\n# mine\n');
  const res = doArchive({ root: target, all: true });
  assert.ok(res.archived.includes('handover'));
  assert.ok(res.archived.includes('session-budget'));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills/hand-authored')));
  assert.ok(fs.existsSync(path.join(target, '.claude/skills-archive/handover/SKILL.md')));
});

t('unarchive an unknown name is reported and left alone rather than guessed at', () => {
  const lib = makeLibrary();
  const target = tmp();
  doInstall({ library: lib, root: target, tool: 'claude', skills: ['handover'] });
  const res = doUnarchive({ root: target, skills: ['never-archived'] });
  assert.strictEqual(res.restored.length, 0);
  assert.ok(res.kept[0].includes('never-archived'));
});

t('extractCoreHooks pulls only the <!-- hook:core --> marked blocks, not the superseded one', () => {
  const lib = makeLibrary();
  const configs = extractCoreHooks(lib);
  assert.strictEqual(configs.length, 2);
  assert.ok(configs.some((c) => c.hooks.SessionStart));
  assert.ok(configs.some((c) => c.hooks.UserPromptSubmit));
  assert.ok(!configs.some((c) => c.hooks.PreToolUse));
});

t('merge-hooks writes settings.json fresh when none exists', () => {
  const lib = makeLibrary();
  const target = tmp();
  const res = doMergeHooks({ library: lib, root: target });
  assert.deepStrictEqual(res.added.sort(), ['SessionStart', 'UserPromptSubmit']);
  const settings = JSON.parse(fs.readFileSync(path.join(target, '.claude/settings.json'), 'utf8'));
  assert.strictEqual(settings.hooks.SessionStart.length, 1);
  assert.strictEqual(settings.hooks.UserPromptSubmit.length, 1);
});

t('merge-hooks merges into an existing settings.json without touching unrelated keys, and is idempotent', () => {
  const lib = makeLibrary();
  const target = tmp();
  write(target, '.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo existing' }] }] } }));
  doMergeHooks({ library: lib, root: target });
  const res2 = doMergeHooks({ library: lib, root: target }); // second run should add nothing new
  assert.strictEqual(res2.added.length, 0);
  const settings = JSON.parse(fs.readFileSync(path.join(target, '.claude/settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.permissions, { allow: ['Bash'] });
  assert.strictEqual(settings.hooks.PreToolUse.length, 1);
  assert.strictEqual(settings.hooks.PreToolUse[0].hooks[0].command, 'echo existing');
  assert.strictEqual(settings.hooks.SessionStart.length, 1);
});

t('mergeHooks never adds a duplicate of an entry that is already present', () => {
  const target = tmp();
  const config = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo x' }] }] } };
  mergeHooks(target, [config]);
  const res = mergeHooks(target, [config]);
  assert.strictEqual(res.added.length, 0);
  const settings = JSON.parse(fs.readFileSync(path.join(target, '.claude/settings.json'), 'utf8'));
  assert.strictEqual(settings.hooks.SessionStart.length, 1);
});

t('applyContextCode substitutes the row value and "none" removes the row entirely', () => {
  const row = '| Context code | [placeholder] |\n| Project name | [x] |\n';
  assert.match(applyContextCode(row, 'Z9'), /\| Context code \| Z9 \|/);
  assert.ok(!/Context code/.test(applyContextCode(row, 'none')));
});

t('stripTemplatePreamble drops everything above the CLAUDE.md|AGENTS.md heading', () => {
  const body = 'preamble\n---\n# [CLAUDE.md | AGENTS.md] — [Project Name]\nbody\n';
  assert.strictEqual(stripTemplatePreamble(body), '# [CLAUDE.md | AGENTS.md] — [Project Name]\nbody\n');
});

t('detectStackSignals finds nothing in an empty project', () => {
  assert.deepStrictEqual(detectStackSignals(tmp(), 'claude'), []);
});

t('detectStackSignals matches three.js from a package.json dependency', () => {
  const root = tmp();
  write(root, 'package.json', JSON.stringify({ dependencies: { three: '^0.160.0' } }));
  const matches = detectStackSignals(root, 'claude');
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].name, 'threejs-scene');
  assert.match(matches[0].evidence, /package\.json/);
});

t('detectStackSignals matches Astro from a config file even with no package.json', () => {
  const root = tmp();
  write(root, 'astro.config.mjs', 'export default {};\n');
  const matches = detectStackSignals(root, 'claude');
  assert.deepStrictEqual(matches.map((m) => m.name), ['astro-page']);
  assert.match(matches[0].evidence, /astro\.config\.mjs/);
});

t('detectStackSignals matches Astro from the dependency when there is no config file', () => {
  const root = tmp();
  write(root, 'package.json', JSON.stringify({ devDependencies: { astro: '^5.0.0' } }));
  const matches = detectStackSignals(root, 'claude');
  assert.deepStrictEqual(matches.map((m) => m.name), ['astro-page']);
  assert.match(matches[0].evidence, /package\.json/);
});

t('detectStackSignals matches Shopify from shopify.theme.toml', () => {
  const root = tmp();
  write(root, 'shopify.theme.toml', 'name = "theme"\n');
  const matches = detectStackSignals(root, 'claude');
  assert.deepStrictEqual(matches.map((m) => m.name), ['shopify-toolkit-install']);
});

t('detectStackSignals matches an existing memory-bank/ folder', () => {
  const root = tmp();
  write(root, 'memory-bank/placeholder.md', 'x');
  const matches = detectStackSignals(root, 'claude');
  assert.deepStrictEqual(matches.map((m) => m.name), ['memory-bank']);
});

t('detectStackSignals only matches hooks-enforcement for the claude tool, and only with real hooks configured', () => {
  const root = tmp();
  write(root, '.claude/settings.json', JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'x' }] }] } }));
  assert.deepStrictEqual(detectStackSignals(root, 'claude').map((m) => m.name), ['hooks-enforcement']);
  assert.deepStrictEqual(detectStackSignals(root, 'opencode'), []);

  const emptyHooksRoot = tmp();
  write(emptyHooksRoot, '.claude/settings.json', JSON.stringify({ hooks: {} }));
  assert.deepStrictEqual(detectStackSignals(emptyHooksRoot, 'claude'), []);
});

t('STACK_PRESETS has no row for a stack without a real skill or coding-standards gap note', () => {
  assert.deepStrictEqual(STACK_PRESETS.astro.skills, ['astro-page']);
  assert.strictEqual(STACK_PRESETS.astro.gap, undefined);
  assert.deepStrictEqual(STACK_PRESETS.nextjs.skills, []);
  assert.ok(STACK_PRESETS.nextjs.gap);
  assert.deepStrictEqual(STACK_PRESETS.laravel.skills, []);
  assert.ok(STACK_PRESETS.laravel.gap);
});

t('eligibleCatalogNames drops addons/MCP and the opt-in meta skills, keeps everything else', () => {
  const catalog = {
    handover: { dir: 'workflow', companions: [] },
    'coding-standards': { dir: 'standards', companions: [] },
    'threejs-scene': { dir: 'stack', companions: [] },
    narrate: { dir: 'addons', companions: [] },
    'mcp-manager': { dir: 'mcp', companions: [] },
    'mod-setup': { dir: 'meta', companions: [] },
    'misfire-log': { dir: 'meta', companions: [] },
    'skill-scope': { dir: 'meta', companions: [] },
  };
  assert.deepStrictEqual(
    eligibleCatalogNames(catalog).sort(),
    ['coding-standards', 'handover', 'skill-scope', 'threejs-scene'],
  );
});

t('loadSkillPurposes parses the Skill/Purpose README tables and flattens nested markdown links', () => {
  const lib = tmp();
  write(
    lib,
    'skills/README.md',
    '# Skills Library\n\n## workflow/\n| Skill | Purpose |\n|---|---|\n' +
      '| [handover](workflow/handover.md) | Session continuity via handover.md |\n' +
      '| [role-session](workflow/role-session.md) | Parallel-session lanes (+ [templates](workflow/role-session.templates.md)) |\n',
  );
  const purposes = loadSkillPurposes(lib);
  assert.strictEqual(purposes.handover, 'Session continuity via handover.md');
  assert.strictEqual(purposes['role-session'], 'Parallel-session lanes (+ templates)');
  assert.strictEqual(purposes['not-a-skill'], undefined);
});

t('loadSkillPurposes returns {} when the README does not exist', () => {
  assert.deepStrictEqual(loadSkillPurposes(tmp()), {});
});

process.on('exit', () => { if (process.exitCode) console.log('\ninstall-kit.cli.test: FAILED'); else console.log('\ninstall-kit.cli.test: all passed'); });
