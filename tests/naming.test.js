const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const SKILLS = path.join(__dirname, '..', 'skills');
const MAX_FILE = 30;
const MAX_SKILL = 24;
const MAX_MD_COMPANIONS = 2;
// Old names that predate the convention. Do not add to these lists.
const LEGACY_FILES = new Set([
  'hooks-enforcement.pre-commit-clear.sh', 'hooks-enforcement.pre-commit-gate.sh',
  'resolve-conflicts.roles.example.json', 'system1-prefilter.prefilter-mcp.js',
]);
const LEGACY_SKILLS = new Set(['interpretation-checkpoint']);
const LEGACY_MANY_COMPANIONS = new Set(['mcp-manager']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { out.push({ p, dir: true, name: e.name }); walk(p, out); }
    else out.push({ p, dir: false, name: e.name });
  }
  return out;
}
const all = walk(SKILLS).filter((e) => e.name !== 'README.md' && !e.name.endsWith('.ts'));

t('no file or folder name is over ' + MAX_FILE + ' characters (legacy names excepted)', () => {
  const bad = all.filter((e) => e.name.length > MAX_FILE && !LEGACY_FILES.has(e.name));
  assert.deepStrictEqual(bad.map((e) => path.relative(SKILLS, e.p)), []);
});

t('skill names are ' + MAX_SKILL + ' characters or fewer (legacy names excepted)', () => {
  const stems = new Map();
  for (const e of all.filter((x) => !x.dir && x.name.endsWith('.md'))) {
    const stem = e.name.slice(0, -3);
    const dir = path.dirname(e.p);
    if (dir.endsWith(path.sep + 'commands')) continue;
    if (!stems.has(dir)) stems.set(dir, []);
    stems.get(dir).push(stem);
  }
  const bad = [];
  for (const list of stems.values()) {
    for (const s of list) {
      const isCompanion = list.some((o) => o !== s && s.startsWith(o + '.'));
      if (!isCompanion && s.length > MAX_SKILL && !LEGACY_SKILLS.has(s)) bad.push(s);
    }
  }
  assert.deepStrictEqual(bad, []);
});

t('a skill has at most ' + MAX_MD_COMPANIONS + ' .md companions; more go in a folder', () => {
  const bad = [];
  for (const dir of new Set(all.filter((x) => !x.dir).map((x) => path.dirname(x.p)))) {
    if (dir.endsWith(path.sep + 'commands')) continue;
    const names = all.filter((x) => !x.dir && path.dirname(x.p) === dir && x.name.endsWith('.md')).map((x) => x.name.slice(0, -3));
    for (const s of names) {
      const n = names.filter((o) => o.startsWith(s + '.')).length;
      if (n > MAX_MD_COMPANIONS && !LEGACY_MANY_COMPANIONS.has(s)) bad.push(s + ' has ' + n);
    }
  }
  assert.deepStrictEqual(bad, []);
});
