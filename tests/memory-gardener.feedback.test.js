const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scrub } = require('../skills/memory/memory-gardener.feedback.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kit-feedback-'));
const CLI = path.join(__dirname, '..', 'skills', 'memory', 'memory-gardener.feedback.js');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd], { encoding: 'utf8', env: { ...process.env, HOME: cwd, USERPROFILE: cwd } });

t('a generic lesson is written, the file is created lazily and added to .gitignore', () => {
  const d = tmp();
  assert.ok(!fs.existsSync(path.join(d, 'kit-feedback.md')));
  const r = run(d, 'add', '--skill', 'plan-first', '--text', 'A plan that lists files by glob catches renamed files that memory misses.');
  assert.strictEqual(r.status, 0, r.stderr);
  const body = fs.readFileSync(path.join(d, 'kit-feedback.md'), 'utf8');
  assert.match(body, /Local only|local only/);
  assert.match(body, /- \[plan-first\] \d{4}-\d{2}-\d{2} A plan that lists files/);
  const gi = fs.readFileSync(path.join(d, '.gitignore'), 'utf8');
  assert.match(gi, /^kit-feedback\.md$/m);
  assert.match(gi, /^\.kit-feedback-deny$/m);
});

t('a lesson with a URL, email, IP, path or long token is refused and nothing is written', () => {
  const d = tmp();
  for (const bad of ['See https://wiki.example.com/page for the rule.', 'Ask bob@example.com about it.', 'Host 10.0.0.12 was slow.',
    'Config lives in C:\\work\\app\\cfg.json here.', 'Look in /home/dev/app first.', 'Key abcdefghijklmnopqrstuvwxyz0123456789 leaked.']) {
    const r = run(d, 'add', '--skill', 'debug-protocol', '--text', bad);
    assert.strictEqual(r.status, 2, bad);
  }
  assert.ok(!fs.existsSync(path.join(d, 'kit-feedback.md')));
});

t('a word in the project or home deny list is refused, case-insensitively', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, '.kit-feedback-deny'), '# employer\nAcmeCorp\n');
  const r = run(d, 'add', '--skill', 'handover', '--text', 'The acmecorp release train needs a freeze note.');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /deny-list entry "acmecorp"/);
  fs.mkdirSync(path.join(d, '.ai-dev-kit'));
  fs.writeFileSync(path.join(d, '.ai-dev-kit', 'feedback-deny.txt'), 'Globex\n');
  const r2 = run(d, 'add', '--skill', 'handover', '--text', 'Globex uses a weekly cut.');
  assert.strictEqual(r2.status, 2);
});

t('check flags a hand-edited line and passes a clean file; list prints bullets', () => {
  const d = tmp();
  run(d, 'add', '--skill', 'plan-first', '--text', 'Keep plans to five lines.');
  assert.strictEqual(run(d, 'check').status, 0);
  fs.appendFileSync(path.join(d, 'kit-feedback.md'), '- [plan-first] 2026-11-01 see https://intranet.example/x\n');
  const r = run(d, 'check');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /line \d+: URL/);
  assert.match(run(d, 'list').stdout, /Keep plans to five lines/);
});

t('adding the same lesson twice writes it once; a bad skill name is a usage error', () => {
  const d = tmp();
  run(d, 'add', '--skill', 'plan-first', '--text', 'Same lesson.');
  run(d, 'add', '--skill', 'plan-first', '--text', 'Same lesson.');
  assert.strictEqual((fs.readFileSync(path.join(d, 'kit-feedback.md'), 'utf8').match(/Same lesson\./g) || []).length, 1);
  assert.strictEqual(run(d, 'add', '--skill', 'Bad Name', '--text', 'x').status, 2);
});

t('scrub passes ordinary technical text', () => {
  assert.deepStrictEqual(scrub('Use package.json scripts instead of global tools; src/index.ts stays relative.', []), []);
});
