const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROWS, best, table } = require('../skills/meta/skill-scope.kit.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.kit.js');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const COMMANDS = path.join(__dirname, '..', 'skills', 'commands');
// Skills the host also exposes as slash commands (/debug-protocol, /plan-first, /intent-capture): a skill file named like the command.
const SKILLS = new Set(fs.readdirSync(path.join(__dirname, '..', 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => fs.readdirSync(path.join(__dirname, '..', 'skills', d.name)).filter((f) => /^[a-z0-9-]+\.md$/.test(f)).map((f) => f.slice(0, -3))));

t('every command named in the table exists as a command file, or is a mod command', () => {
  const MOD_COMMANDS = new Set(['budget']); // shipped by a mod, not a command file
  for (const r of ROWS) {
    for (const m of r.use.matchAll(/`\/([a-z][a-z0-9-]*)/g)) {
      if (MOD_COMMANDS.has(m[1])) continue;
      assert.ok(fs.existsSync(path.join(COMMANDS, m[1] + '.md')) || SKILLS.has(m[1]), `${r.situation}: /${m[1]} is neither a command file nor a skill`);
    }
  }
});

t('every row has keywords and a unique situation', () => {
  assert.ok(ROWS.every((r) => r.keys.length >= 3 && r.use && r.situation));
  assert.strictEqual(new Set(ROWS.map((r) => r.situation)).size, ROWS.length);
});

t('plain situations pick the right command', () => {
  const cases = [
    ['the site is slow to load', '/perf'],
    ['check the project against our standards', '/audit'],
    ['about to commit, are there secrets in the staged files', '/commit-check'],
    ['my build keeps failing and I do not know why', '/debug-protocol'],
    ['images are too heavy', '/optimize-assets'],
    ['start a new session and resume', '/pickup'],
    ['wrap up and hand over', '/wrap-up'],
    ['we hit merge conflicts after the rebase', '/resolve-conflicts'],
    ['map the attack surface for a security audit', '/recon'],
    ['set up playwright tests', '/e2e'],
    ['turn the figma export into design docs', '/figma'],
    ['is this page responsive on a phone', '/responsive-check'],
  ];
  for (const [text, cmd] of cases) assert.ok(best(text) && best(text).use.includes(cmd), `${text} -> ${best(text) && best(text).use}`);
});

t('no match prints the table and says so; no words prints the table; bad flag exits 2', () => {
  assert.match(run('zzzz qqqq').stdout, /^No command matched/);
  assert.ok(run().stdout.includes(table()));
  assert.strictEqual(run('--wat').status, 2);
  const j = JSON.parse(run('--json', 'the site is slow').stdout);
  assert.ok(j.use.includes('/perf'));
});
