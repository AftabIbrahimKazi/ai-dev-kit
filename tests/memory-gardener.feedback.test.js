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

// cost: one scrub-safe token-cost line per session, read from a budget-ledger folder
function makeLedger(dir, sid, turns, extra = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (let i = 0; i < turns; i++) {
    rows.push(JSON.stringify({
      sid, ts: '2026-11-02T10:0' + i + ':00.000Z', model: 'claude-sonnet-5-5', in: 100, out: 50, cr: 800, cw: 100, usd: 0.25 + i, ctxPct: 10 + i,
      tools: [{ t: 'Read', k: 'Read', c: 4000 }, { t: 'Skill', k: 'handover', c: 40 }], ...extra,
    }));
  }
  fs.writeFileSync(path.join(dir, sid + '.jsonl'), rows.join('\n') + '\n');
}

t('cost writes one line with totals, cost, tools and loaded skills, and ignores the file in git', () => {
  const d = tmp(), led = path.join(d, 'ledger');
  makeLedger(led, 'abcd1234-aaaa', 4);
  const r = run(d, 'cost', '--sid', 'abcd1234', '--dir', led);
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const line = fs.readFileSync(path.join(d, 'kit-feedback.md'), 'utf8').split('\n').find((l) => l.includes('[token-cost]'));
  assert.match(line, /sid abcd1234: 4 turns, \$3\.25, claude-sonnet-5-5, out 200, cache read 3,200, cache write 400/);
  assert.match(line, /tool results \(est\. tokens\): Read 4,000, Skill 40; skills loaded: handover x4/);
  assert.match(fs.readFileSync(path.join(d, '.gitignore'), 'utf8'), /^kit-feedback\.md$/m);
});

t('cost run again for the same session updates its line instead of adding a second', () => {
  const d = tmp(), led = path.join(d, 'ledger');
  makeLedger(led, 'abcd1234-aaaa', 4);
  run(d, 'cost', '--sid', 'abcd1234', '--dir', led);
  makeLedger(led, 'abcd1234-aaaa', 6);
  run(d, 'cost', '--sid', 'abcd1234', '--dir', led);
  const lines = fs.readFileSync(path.join(d, 'kit-feedback.md'), 'utf8').split('\n').filter((l) => l.includes('[token-cost]'));
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /6 turns/);
});

t('cost --all skips sessions under --min-turns; no selector is a usage error', () => {
  const d = tmp(), led = path.join(d, 'ledger');
  makeLedger(led, 'short000-aaaa', 2);
  makeLedger(led, 'longer00-aaaa', 5);
  const r = run(d, 'cost', '--all', '--dir', led);
  assert.strictEqual(r.status, 0, r.stderr);
  const body = fs.readFileSync(path.join(d, 'kit-feedback.md'), 'utf8');
  assert.ok(body.includes('sid longer00') && !body.includes('sid short000'));
  assert.strictEqual(run(d, 'cost', '--dir', led).status, 2);
});

t('cost with a missing ledger folder records nothing and exits 0', () => {
  const d = tmp();
  const r = run(d, 'cost', '--all', '--dir', path.join(d, 'nope'));
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /no sessions to record/);
  assert.ok(!fs.existsSync(path.join(d, 'kit-feedback.md')));
});
