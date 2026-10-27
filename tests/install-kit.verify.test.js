const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verify } = require('../skills/meta/install-kit.verify.js');
const SCRIPT = path.join(__dirname, '../skills/meta/install-kit.verify.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'install-verify-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const skillMd = (name) => `---\nname: ${name}\n---\n# ${name}\n`;
const okProtocol = '# proj\n1. Begin every response with `[CX X7]`\n| Context code | X7 |\n';
const unfilledProtocol = '# proj\n1. Begin every response with `[CX]`\n| Context code | [2–4 chars you choose, e.g. `X7`] |\n';
const findingsOf = (res, level) => res.findings.filter((f) => f.level === level).map((f) => f.check);

t('a clean Claude Code install passes with no fail-level findings', () => {
  const d = tmp();
  write(d, '.claude/skills/handover/SKILL.md', skillMd('handover'));
  write(d, 'CLAUDE.md', okProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(findingsOf(res, 'fail'), []);
});

t('a nested category folder (old install bug) fails the layout check', () => {
  const d = tmp();
  write(d, '.claude/skills/workflow/handover/SKILL.md', skillMd('handover'));
  write(d, 'CLAUDE.md', okProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.strictEqual(res.ok, false);
  assert.ok(findingsOf(res, 'fail').includes('layout'));
});

t('a skill folder with no SKILL.md fails the layout check', () => {
  const d = tmp();
  write(d, '.claude/skills/handover/notes.md', 'x');
  write(d, 'CLAUDE.md', okProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('layout'));
});

t('a .js companion with no commonjs package.json fails the shield check', () => {
  const d = tmp();
  write(d, '.claude/skills/session-budget/SKILL.md', skillMd('session-budget'));
  write(d, '.claude/skills/session-budget/compact.js', '// x');
  write(d, 'CLAUDE.md', okProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('commonjs-shield'));
});

t('a commonjs package.json at the skill root clears the shield check', () => {
  const d = tmp();
  write(d, '.claude/skills/session-budget/SKILL.md', skillMd('session-budget'));
  write(d, '.claude/skills/session-budget/compact.js', '// x');
  write(d, '.claude/skills/package.json', '{ "type": "commonjs" }');
  write(d, 'CLAUDE.md', okProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(!findingsOf(res, 'fail').includes('commonjs-shield'));
});

t('a missing session-protocol file fails', () => {
  const d = tmp();
  write(d, '.claude/skills/handover/SKILL.md', skillMd('handover'));
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('session-protocol'));
});

t('an unfilled Context-code placeholder fails even though the file exists', () => {
  const d = tmp();
  write(d, 'CLAUDE.md', unfilledProtocol);
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('session-protocol'));
});

t('a protocol file missing the [CX] rule entirely fails as not the real template', () => {
  const d = tmp();
  write(d, 'CLAUDE.md', '# just a readme, not the standards template\n');
  const res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('session-protocol'));
});

t('comment-style installed but never answered fails; a set level clears it', () => {
  const d = tmp();
  write(d, 'CLAUDE.md', okProtocol);
  write(d, '.claude/skills/comment-style/SKILL.md', '---\nname: comment-style\n---\n## Active level\n**Active level: </choose: none|terse|descriptive>**\n');
  let res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('comment-style'));
  write(d, '.claude/skills/comment-style/SKILL.md', '---\nname: comment-style\n---\n## Active level\n**Active level: terse**\n');
  res = verify({ root: d, tool: 'claude' });
  assert.ok(!findingsOf(res, 'fail').includes('comment-style'));
});

t('coding-standards/ without index.md fails; with it, passes', () => {
  const d = tmp();
  write(d, 'CLAUDE.md', okProtocol);
  write(d, 'coding-standards/css-standards.md', '# css');
  let res = verify({ root: d, tool: 'claude' });
  assert.ok(findingsOf(res, 'fail').includes('standards'));
  write(d, 'coding-standards/index.md', '# index');
  res = verify({ root: d, tool: 'claude' });
  assert.ok(!findingsOf(res, 'fail').includes('standards'));
});

t('OpenCode and Codex both route the session protocol to AGENTS.md', () => {
  const d = tmp();
  write(d, 'AGENTS.md', okProtocol);
  assert.strictEqual(verify({ root: d, tool: 'opencode' }).ok, true);
  assert.strictEqual(verify({ root: d, tool: 'codex' }).ok, true);
});

t('a bad --tool value is a clear failure, not a crash', () => {
  const d = tmp();
  const res = verify({ root: d, tool: 'nonsense' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.findings[0].check, 'args');
});

t('cli: exit 0 on a clean install, 1 with findings printed, --json matches verify()', () => {
  const d = tmp();
  write(d, 'CLAUDE.md', okProtocol);
  const r1 = spawnSync('node', [SCRIPT, '--root', d, '--tool', 'claude'], { encoding: 'utf8' });
  assert.strictEqual(r1.status, 0);
  assert.ok(/clean/.test(r1.stdout));

  const d2 = tmp();
  const r2 = spawnSync('node', [SCRIPT, '--root', d2, '--tool', 'claude', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r2.status, 1);
  const parsed = JSON.parse(r2.stdout);
  assert.strictEqual(parsed.ok, false);
});

const finishCli = (root, ...extra) => spawnSync('node', [SCRIPT, '--root', root, '--tool', 'claude', '--finish', ...extra], { encoding: 'utf8' });
const installed = () => {
  const d = tmp();
  write(d, '.claude/skills/handover/SKILL.md', skillMd('handover'));
  write(d, '.claude/skills/install-kit/SKILL.md', skillMd('install-kit'));
  write(d, '.claude/skills/install-kit/verify.js', '// verify');
  write(d, '.claude/skills/install-kit/learnings.md', '- note');
  write(d, '.claude/skills/package.json', '{ "type": "commonjs" }');
  write(d, 'CLAUDE.md', okProtocol);
  return d;
};

t('--finish after a clean verify removes the installed install-kit and keeps every other skill and the shield', () => {
  const d = installed();
  const r = finishCli(d);
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /removed \.claude\/skills\/install-kit/);
  assert.ok(!fs.existsSync(path.join(d, '.claude/skills/install-kit')));
  assert.ok(fs.existsSync(path.join(d, '.claude/skills/handover/SKILL.md')));
  assert.ok(fs.existsSync(path.join(d, '.claude/skills/package.json')));
});
t('--finish removes install-kit from every tool root it is in', () => {
  const d = installed();
  write(d, '.opencode/skills/install-kit/SKILL.md', skillMd('install-kit'));
  const r = finishCli(d);
  assert.match(r.stdout, /removed \.claude\/skills\/install-kit/);
  assert.match(r.stdout, /removed \.opencode\/skills\/install-kit/);
  assert.ok(!fs.existsSync(path.join(d, '.opencode/skills/install-kit')));
});
t('--finish keeps install-kit when verification fails, so the install can be repaired', () => {
  const d = installed();
  fs.rmSync(path.join(d, 'CLAUDE.md'));
  const r = finishCli(d);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /kept: install failed verification/);
  assert.ok(fs.existsSync(path.join(d, '.claude/skills/install-kit/SKILL.md')));
});
t('--finish never removes the kit library own install-kit', () => {
  const d = installed();
  write(d, 'skills/meta/install-kit.md', '# the library source');
  const r = finishCli(d);
  assert.match(r.stdout, /kept: this is the kit library itself/);
  assert.ok(fs.existsSync(path.join(d, 'skills/meta/install-kit.md')));
  assert.ok(fs.existsSync(path.join(d, '.claude/skills/install-kit/SKILL.md')));
});
t('without --finish nothing is deleted, and --finish with no installed copy says so', () => {
  const d = installed();
  spawnSync('node', [SCRIPT, '--root', d, '--tool', 'claude'], { encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(d, '.claude/skills/install-kit/SKILL.md')));
  const d2 = tmp(); write(d2, 'CLAUDE.md', okProtocol);
  assert.match(finishCli(d2).stdout, /kept: no installed install-kit found/);
});
