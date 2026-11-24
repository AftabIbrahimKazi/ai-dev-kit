// Role loadouts: labeled prompts must resolve to the wanted role (or none), and every skill, standards file and command a role
// names must exist in the kit. Pure matching, no model call, no tokens.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const { loadRoles, resolveRole, loadout, line } = require('../skills/meta/skill-scope.role.js');
const rf = loadRoles(path.join(root, 'skills/meta/skill-scope.roles.json'));

const rows = [
  ['you are a frontend dev, fix the card spacing', 'frontend', 'named'],
  ['role: devops, the deploy pipeline keeps failing', 'devops', 'named'],
  ['/role seo', 'seo', 'named'],
  ['act as the QA engineer', 'qa', 'named'],
  ['as a full stack developer add a settings page', 'fullstack', 'named'],
  ['update the docs for the new flag', null],
  ['security of the login form is fine, ship it', null],
  ['the modal layout breaks and the button style is off', 'frontend', 'inferred'],
  ['add an endpoint and a database migration for sessions', 'backend', 'inferred'],
  ['the sitemap and meta tags need a canonical', 'seo', 'inferred'],
  ['write playwright tests and check flaky coverage', 'qa', 'inferred'],
  ['docker deploy pipeline with github actions', 'devops', 'inferred'],
  ['fix the modal css and the api endpoint query', 'fullstack', 'inferred'],
  ['add aria labels, check contrast and keyboard nav', 'accessibility', 'inferred'],
  ['rename this variable', null],
  ['make it better', null],
];
const bad = [];
for (const [q, want, how] of rows) {
  const r = resolveRole(q, rf);
  const got = r ? r.id : null;
  if (got !== want || (want && r.how !== how)) bad.push(`"${q}" wanted ${want}/${how}, got ${got}/${r && r.how}`);
}
console.log(`role rows ${rows.length - bad.length}/${rows.length}`);
bad.forEach((l) => console.log('  FAIL ' + l));

// Every name a role points at must exist.
const skillNames = new Set();
for (const d of ['meta', 'standards', 'workflow', 'addons', 'stack', 'libraries', 'cloud', 'mcp', 'models', 'memory']) {
  const dir = path.join(root, 'skills', d);
  if (!fs.existsSync(dir)) continue;
  for (const n of fs.readdirSync(dir)) { const m = /^([a-z0-9-]+)\.md$/.exec(n); if (m) skillNames.add(m[1]); }
}
const cmdNames = new Set(fs.readdirSync(path.join(root, 'skills/commands')).map((n) => '/' + n.replace(/\.md$/, '')));
const missing = [];
for (const id of Object.keys(rf.roles)) {
  const l = loadout(id, rf);
  l.skills.forEach((s) => { if (!skillNames.has(s)) missing.push(`${id}: skill ${s}`); });
  l.standards.forEach((s) => { if (!fs.existsSync(path.join(root, 'coding-standards', s))) missing.push(`${id}: standards ${s}`); });
  l.commands.forEach((c) => { if (!cmdNames.has(c)) missing.push(`${id}: command ${c}`); });
}
missing.forEach((m) => console.log('  MISSING ' + m));

const l = line(resolveRole('role: seo', rf), rf, ['perf-audit'], ['optimize-assets']);
try {
  assert.strictEqual(bad.length, 0, 'role rows failed');
  assert.strictEqual(missing.length, 0, 'dangling names in roles file');
  assert.ok(/skills: perf-audit/.test(l) && /archived, run \/unarchive <name> if needed: optimize-assets/.test(l), 'installed/archived split: ' + l);
  console.log('ok   skill-scope roles');
} catch (e) { console.log('FAIL ' + e.message); process.exitCode = 1; }

// Boundary and CLI cases on a small synthetic roles file.
{
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { rx, resolveRole, loadout, line } = require('../skills/meta/skill-scope.role.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const role = (label, signals, extra = {}) => ({ label, aliases: [], signals, skills: [], standards: [], commands: [], ...extra });

t('rx: phrases need word edges, a star prefix matches word starts, plain words take a plural', () => {
  assert.ok(rx('dark mode').test('turn on dark mode now'));
  assert.ok(!rx('dark mode').test('xdark mode'));
  assert.ok(!rx('dark mode').test('dark modest'));
  assert.ok(rx('test*').test('retest') === false && rx('test*').test('testing'));
  assert.ok(rx('form').test('two forms here') && !rx('form').test('formal'));
});

t('resolveRole: one hit is not enough, two is; a tie gives none, a one-hit lead wins', () => {
  const rf = { roles: { a: role('A', ['alpha', 'beta', 'gamma']), b: role('B', ['beta', 'delta', 'gamma']) } };
  assert.strictEqual(resolveRole('only alpha here', rf), null);
  assert.deepStrictEqual(resolveRole('alpha beta', rf).hits, ['alpha', 'beta']);
  assert.strictEqual(resolveRole('alpha beta delta gamma', rf), null);
  const win = resolveRole('alpha beta gamma delta', rf);
  assert.strictEqual(win, null);
  const rf2 = { roles: { a: role('A', ['alpha', 'beta', 'gamma']), b: role('B', ['beta']) } };
  assert.strictEqual(resolveRole('alpha beta gamma', rf2).id, 'a');
});

t('resolveRole: fullstack needs two frontend and two backend hits', () => {
  const rf = { roles: { frontend: role('F', ['css', 'html', 'dom']), backend: role('B', ['sql', 'api', 'orm']), fullstack: role('FS', ['zzz']) } };
  const full = resolveRole('css html sql api', rf);
  assert.strictEqual(full.id, 'fullstack');
  assert.deepStrictEqual(full.hits, ['css', 'html', 'sql', 'api']);
  assert.strictEqual(resolveRole('css html dom sql', rf).id, 'frontend');
  assert.strictEqual(resolveRole('css sql api orm', rf).id, 'backend');
});

t('line: standards and commands are written in full', () => {
  const rf = { roles: { a: role('Alpha', ['x'], { skills: ['s1'], standards: ['one.md', 'two.md'], commands: ['/c1', '/c2'] }) } };
  assert.strictEqual(line({ id: 'a', how: 'named', hits: [] }, rf),
    'role-loadout (a suggestion, load only what the task needs): role Alpha (named by you); skills: s1; read standards: coding-standards/one.md, coding-standards/two.md; commands: /c1 /c2.');
  assert.match(line({ id: 'a', how: 'inferred', hits: ['p', 'q', 'r', 's', 't'] }, rf), /inferred from: p, q, r, s\)/);
});

t('loadout merges included roles once and ignores cycles and unknown includes', () => {
  const rf = { roles: { a: role('A', [], { skills: ['x'], includes: ['b', 'nope'] }), b: role('B', [], { skills: ['y', 'x'], includes: ['a'] }) } };
  assert.deepStrictEqual(loadout('a', rf).skills, ['x', 'y']);
});

// CLI: copy the script next to a roles file and a stub auto.js so apply is observable.
const SCRIPT = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.role.js');
function sandbox(roles) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'role-cli-'));
  fs.copyFileSync(SCRIPT, path.join(d, 'skill-scope.role.js'));
  fs.writeFileSync(path.join(d, 'skill-scope.roles.json'), roles);
  fs.writeFileSync(path.join(d, 'skill-scope.auto.js'), "console.log('AUTO ' + process.argv.slice(2).join(' '));");
  return d;
}
const run = (d, ...a) => spawnSync(process.execPath, [path.join(d, 'skill-scope.role.js'), ...a], { encoding: 'utf8' });
const ROLES = JSON.stringify({ roles: { dev: role('Dev', ['x'], { skills: ['s1', 's2'] }) } });

t('cli: show and apply refuse an unknown or missing role with exit 2 and the name in the message', () => {
  const d = sandbox(ROLES);
  for (const cmd of ['show', 'apply']) {
    const r = run(d, cmd, 'nope');
    assert.strictEqual(r.status, 2, cmd);
    assert.ok(r.stderr.startsWith('error: unknown role "nope". Run: node skill-scope/role.js list'), r.stderr);
    const none = run(d, cmd);
    assert.strictEqual(none.status, 2);
    assert.ok(none.stderr.includes('unknown role "". Run'), none.stderr);
  }
  assert.deepStrictEqual(JSON.parse(run(d, 'show', 'dev').stdout), { id: 'dev', label: 'Dev', skills: ['s1', 's2'], standards: [], commands: [] });
});

t('cli: apply adds only by default and replaces with --only; a broken roles file exits 1 with an error line', () => {
  const d = sandbox(ROLES);
  assert.strictEqual(run(d, 'apply', 'dev').stdout.split('\n')[0], 'AUTO apply --add-only --quiet --keep s1,s2');
  assert.strictEqual(run(d, 'apply', 'dev', '--only').stdout.split('\n')[0], 'AUTO apply --quiet --keep s1,s2');
  const bad = sandbox('{ nope');
  const r = run(bad, 'list');
  assert.strictEqual(r.status, 1);
  assert.ok(r.stderr.startsWith('error: '), r.stderr);
});

t('cli: no argument lists the roles and a bare role name applies it', () => {
  const d = sandbox(ROLES);
  const none = run(d);
  assert.strictEqual(none.status, 0, none.stderr);
  assert.match(none.stdout, /^dev\s+Dev: s1, s2/m);
  assert.strictEqual(run(d, 'dev').stdout.split('\n')[0], 'AUTO apply --add-only --quiet --keep s1,s2');
  assert.strictEqual(run(d, 'dev', '--only').stdout.split('\n')[0], 'AUTO apply --quiet --keep s1,s2');
  assert.strictEqual(run(d, 'bogus').status, 2);
});
}
