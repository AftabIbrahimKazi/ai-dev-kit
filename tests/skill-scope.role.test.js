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
