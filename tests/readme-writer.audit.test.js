// readme-writer audit: a good README passes; each bad one trips exactly its check. Fixtures are built in a temp repo.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { auditReadme, realCounts } = require('../skills/workflow/readme-writer.audit.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const put = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

// A tiny repo: 2 skills, 1 command, 1 mod, a CLI with --yes and --root.
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-'));
  put(d, 'skills/workflow/a.md', '---\nname: a\ndescription: x\n---\n# a\n');
  put(d, 'skills/meta/b.md', '---\nname: b\ndescription: x\n---\n# b\n');
  put(d, 'skills/meta/README.md', '# not a skill\n');
  put(d, 'skills/commands/go.md', '---\ndescription: go\n---\n');
  put(d, 'mods/m1/.claude-plugin/plugin.json', '{}');
  put(d, 'skills/meta/cli.ts', "if (k === '--yes') a.yes = true; if (k === '--root') a.root = 1;\n");
  put(d, 'docs/guide.md', '# guide\n');
  return d;
}
const audit = (d, readme) => { put(d, 'README.md', readme); return auditReadme(d, path.join(d, 'README.md')); };
const checks = (f) => f.map((x) => `${x.level}:${x.check}`);

const GOOD = '# Kit: enforced rules for coding agents\n\nTwo skills, 1 mod and 1 command that enforce rules in code.\n\n```sh\nnode install-kit.cli.js install --yes --root .\n```\n\nSaves 30% tokens (n=5 runs, Haiku).\n\nSee [the guide](docs/guide.md) and [top](#top).\n';

t('real counts come from the folders (README, commands and non-skill md excluded)', () => {
  assert.deepStrictEqual(realCounts(repo()), { skills: 2, mods: 1, commands: 1 });
});

t('a good README has no findings', () => {
  assert.deepStrictEqual(audit(repo(), GOOD), []);
});

t('count parity: a wrong "N skills" in the hero fails', () => {
  const f = audit(repo(), '# Kit\n\n14 skills and 1 mod.\n');
  assert.ok(checks(f).includes('fail:count') && /14 skills/.test(f[0].msg), JSON.stringify(f));
});

t('count parity ignores numbers below the hero and inside code', () => {
  const body = '# Kit\n\n' + 'x\n'.repeat(70) + '99 skills\n```\n99 mods\n```\n';
  assert.ok(!checks(audit(repo(), body)).includes('fail:count'));
});

t('a broken relative link fails; web, anchor and existing links pass', () => {
  const f = audit(repo(), '# Kit\n[a](docs/missing.md) [b](https://x.dev) [c](#top) [d](docs/guide.md#part)\n');
  assert.deepStrictEqual(checks(f), ['fail:link']);
  assert.strictEqual(f[0].line, 2);
});

t('flag parity: an unknown --flag on an install-kit line fails; known flags and other lines pass', () => {
  const f = audit(repo(), '# Kit\ninstall-kit --nope --yes\nsome other tool --whatever\n');
  assert.deepStrictEqual(checks(f), ['fail:flag']);
  assert.ok(/--nope/.test(f[0].msg));
});

t('a measured claim without a sample size warns; with n= or runs it does not', () => {
  assert.deepStrictEqual(checks(audit(repo(), '# Kit\nCuts token cost by 40%.\n')), ['warn:sample-size']);
  assert.deepStrictEqual(checks(audit(repo(), '# Kit\nCuts token cost by 40% (3 runs per arm).\n')), []);
});

t('size: over 400 lines outside <details> fails; collapsed lines do not count', () => {
  const long = '# Kit\n' + 'line\n'.repeat(410);
  assert.ok(checks(audit(repo(), long)).includes('fail:size'));
  const folded = '# Kit\n<details>\n<summary>flags</summary>\n\n' + 'line\n'.repeat(410) + '</details>\n';
  assert.ok(!checks(audit(repo(), folded)).includes('fail:size'));
});

t('a section over 60 lines outside <details> warns', () => {
  const body = '# Kit\n## Big\n' + 'line\n'.repeat(70) + '## Small\nok\n';
  const f = audit(repo(), body);
  assert.ok(f.some((x) => x.check === 'section' && /Big/.test(x.msg)), JSON.stringify(f));
});

t('CLI: exit 1 on a failure, 0 on a clean README, 2 on a bad flag, 1 when the README is missing', () => {
  const d = repo();
  const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'skills', 'workflow', 'readme-writer.audit.js'), ...a], { encoding: 'utf8' });
  put(d, 'README.md', GOOD);
  assert.strictEqual(run('README.md', '--root', d).status, 0);
  put(d, 'README.md', '# Kit\n[x](nope.md)\n');
  const bad = run('README.md', '--root', d);
  assert.strictEqual(bad.status, 1);
  assert.ok(/readme audit: 1 fail/.test(bad.stdout));
  assert.strictEqual(run('--bogus').status, 2);
  assert.strictEqual(run('missing.md', '--root', d).status, 1);
  assert.ok(JSON.parse(run('README.md', '--root', d, '--json').stdout).findings.length === 1);
});


const rows = (n, w = 'text') => Array.from({ length: n }, (_, i) => w + ' ' + i).join('\n');
const SCRIPT = path.join(__dirname, '..', 'skills', 'workflow', 'readme-writer.audit.js');
const cli = (d, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd: d, encoding: 'utf8' });

t('messages carry the line number and the real figures', () => {
  const f = audit(repo(), '# Kit\n\n14 skills here.\nrun install-kit --nope now\n');
  assert.deepStrictEqual(f.map((x) => [x.check, x.line, x.msg]), [['count', 3, 'says 14 skills, the folders hold 2'], ['flag', 4, '--nope is not a flag in any script']]);
});

t('sample size may sit on the next line; without it the claim warns at its own line', () => {
  assert.deepStrictEqual(checks(audit(repo(), '# K\n\nSaves 30% of tokens.\nn=3 runs per arm.\n')), []);
  const f = audit(repo(), '# K\n\nSaves 30% of tokens.\n\nother\n');
  assert.deepStrictEqual(f.map((x) => [x.level, x.check, x.line]), [['warn', 'sample-size', 3]]);
});

t('a section is flagged past 60 lines outside details, not at 60, and a closed details block counts as outside again', () => {
  const sec = (body) => audit(repo(), '# K\n\n## Big\n' + body).filter((x) => x.check === 'section');
  assert.strictEqual(sec(rows(60)).length, 0);
  const over = sec(rows(61));
  assert.deepStrictEqual(over.map((x) => [x.line, x.msg]), [[3, 'section "Big" is 61 lines outside <details> (cap 60)']]);
  assert.strictEqual(sec('<details>\n' + rows(80) + '\n</details>').length, 0, 'inside details does not count');
  assert.strictEqual(sec('<details>\nx\n</details>\n' + rows(61)).length, 1, 'after </details> lines count again');
  const pre = audit(repo(), '# K\n\n' + rows(70) + '\n\n## After\nshort\n');
  assert.strictEqual(pre.filter((x) => x.check === 'section').length, 0, 'text before the first ## is not a section');
});

t('only mod folders with .claude-plugin count', () => {
  const d = repo();
  put(d, 'mods/plain/readme.txt', 'x'); put(d, 'mods/loose.txt', 'x');
  assert.strictEqual(realCounts(d).mods, 1);
});

t('cli: defaults to README.md in --root, exit 0 clean, 1 on a failure or missing file, 2 on an unknown flag', () => {
  const d = repo();
  put(d, 'README.md', GOOD);
  const ok = cli(d, '--root', d);
  assert.strictEqual(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /readme audit: 0 fail, 0 warn/);
  put(d, 'README.md', '# K\n\n14 skills.\n');
  const bad = cli(d, '--root', d);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /^FAIL count\s+line 3: says 14 skills/);
  assert.strictEqual(JSON.parse(cli(d, '--root', d, '--json').stdout).findings.length, 1);
  const none = cli(d, 'NOPE.md', '--root', d);
  assert.strictEqual(none.status, 1); assert.match(none.stderr, /^error: .*NOPE\.md does not exist/);
  assert.strictEqual(cli(d, '--wat').status, 2);
});

t('realCounts: only a .md with a name in its frontmatter counts, and not under commands', () => {
  const d = repo();
  put(d, 'skills/meta/plain.md', '# no frontmatter at all\n');
  put(d, 'skills/commands/named.md', '---\nname: cmd\n---\n');
  put(d, 'skills/meta/nameless.md', '---\ndescription: x\n---\n');
  assert.strictEqual(realCounts(d).skills, 2);
});

t('size: exactly 250 lines is fine, 251 warns, exactly 400 only warns, 401 fails', () => {
  const sized = (n) => audit(repo(), rows(n)).filter((x) => x.check === 'size').map((x) => x.level);
  assert.deepStrictEqual(sized(250), []);
  assert.deepStrictEqual(sized(251), ['warn']);
  assert.deepStrictEqual(sized(400), ['warn']);
  assert.deepStrictEqual(sized(401), ['fail']);
});

t('a section that starts on the very first line is measured too', () => {
  const f = audit(repo(), '## First\n' + rows(61)).filter((x) => x.check === 'section');
  assert.deepStrictEqual(f.map((x) => x.line), [1]);
});

t('metrics: a heading line or a fenced block is not a measured claim', () => {
  assert.deepStrictEqual(checks(audit(repo(), '# Saves 30% of tokens\n\nplain text\n')), []);
  assert.deepStrictEqual(checks(audit(repo(), 'intro\n\n```\nsaves 30% of tokens\n```\n')), []);
  assert.deepStrictEqual(checks(audit(repo(), 'intro\n\nSaves 30% of tokens.\n')), ['warn:sample-size']);
});

if (failed) { console.log('readme-writer.audit.test: FAILED'); process.exit(1); }
console.log('readme-writer.audit.test: ok');
