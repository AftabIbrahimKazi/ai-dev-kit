const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compact, finish, quoteArg, FAILURE } = require('../skills/workflow/session-budget.compact.js');
const SCRIPT = path.join(__dirname, '../skills/workflow/session-budget.compact.js');
const FIX = path.join(__dirname, 'fixtures', 'compact');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const norm = (s) => s.replace(ANSI, '').trim();

// THE CORRECTNESS GATE: every failure-looking line of the original must still be in the output.
// Merged duplicates keep the text, so containment is checked on the line text.
function lostFailureLines(original, out) {
  const outText = out.split('\n').map((l) => l.replace(/\s+\(x\d+\)$/, '')).join('\n');
  return original.replace(/\r\n/g, '\n').split('\n').map(norm).filter((l) => l && FAILURE.test(l) && !/^\s*(✓|✔|√)\s/.test(l)).filter((l) => !outText.includes(l));
}

const fixtures = fs.readdirSync(FIX).filter((f) => f.endsWith('.log'));
const table = [];
for (const f of fixtures) {
  const text = fs.readFileSync(path.join(FIX, f), 'utf8');
  t(`real log ${f}: no failure line is lost`, () => {
    const out = finish(text, { max: 150 });
    const lost = lostFailureLines(text, out);
    assert.deepStrictEqual(lost, [], `lost: ${lost.slice(0, 3).join(' | ')}`);
    table.push([f, text.split('\n').length, out.split('\n').length, text.length, out.length]);
  });
  t(`real log ${f}: also safe with a tight budget (max 40)`, () => {
    const lost = lostFailureLines(text, finish(text, { max: 40 }));
    assert.deepStrictEqual(lost, [], `lost: ${lost.slice(0, 3).join(' | ')}`);
  });
}

t('verbose passing-test log shrinks a lot and keeps the summary', () => {
  const text = fs.readFileSync(path.join(FIX, 'vitest-verbose.log'), 'utf8');
  const out = finish(text, {});
  assert.ok(out.length < text.length * 0.65, `only ${(100 - (100 * out.length) / text.length).toFixed(0)}% smaller`);
  assert.ok(/Tests\s+6 failed \| 144 passed/.test(out));
  assert.ok(/\[compacted \d+ -> \d+ lines; dropped 14\d passing-test/.test(out), out.split('\n').pop());
});
t('short or incompressible output is returned unchanged, without a footer', () => {
  const eslint = fs.readFileSync(path.join(FIX, 'eslint.log'), 'utf8').trimEnd();
  assert.strictEqual(finish(eslint, {}), eslint);
  assert.ok(!finish('a\nb\nc', {}).includes('[compacted'));
});
t('ANSI colours and carriage-return progress are cleaned', () => {
  const body = Array.from({ length: 60 }, (_, i) => `\u001b[32mline ${i}\u001b[0m`).join('\n');
  const prog = Array.from({ length: 30 }, (_, i) => `downloading ${i}%\rdownloading ${i + 1}%`).join('\n');
  const out = finish(body + '\n' + prog + '\nERROR: boom', {});
  assert.ok(!/\u001b/.test(out) && !out.includes('\r'));
  assert.ok(out.includes('ERROR: boom'));
});
t('library stack frames are dropped but project frames and the error survive', () => {
  const frames = [];
  for (let i = 0; i < 40; i++) frames.push(`    at fn${i} (/proj/node_modules/lib/x.js:${i}:1)`);
  const text = ['Error: bad thing', '    at mine (/proj/src/a.js:10:5)', ...frames, ...Array.from({ length: 30 }, (_, i) => `info ${i}`)].join('\n');
  const out = finish(text, {});
  assert.ok(out.includes('Error: bad thing') && out.includes('at mine (/proj/src/a.js:10:5)'));
  assert.ok(!out.includes('node_modules/lib'));
});
t('consecutive duplicates merge with a count', () => {
  const text = [...Array.from({ length: 50 }, () => 'retrying connection'), 'Error: gave up', ...Array.from({ length: 10 }, (_, i) => `tail ${i}`)].join('\n');
  const out = finish(text, {});
  assert.ok(out.includes('retrying connection  (x50)') && out.includes('Error: gave up'));
});
t('a failing test marked with a check-mark style prefix is not mistaken for a pass', () => {
  const text = [...Array.from({ length: 60 }, (_, i) => ` ✓ ok test ${i}`), ' × the broken one', '   Error: expected 1 to be 2', ...Array.from({ length: 30 }, (_, i) => `x ${i}`)].join('\n');
  const out = finish(text, {});
  assert.ok(out.includes('× the broken one') && out.includes('expected 1 to be 2'));
  assert.ok(!out.includes('✓ ok test 7'));
});
t('pytest-style dot lines vanish, F/E lines stay', () => {
  const text = [...Array.from({ length: 50 }, () => '.........'), '..F..E...', 'FAILED test_a.py::t - assert 1 == 2', ...Array.from({ length: 30 }, (_, i) => `log ${i}`)].join('\n');
  const out = finish(text, {});
  assert.ok(out.includes('..F..E...') && out.includes('FAILED test_a.py'));
  assert.ok(!out.includes('\n.........\n'));
});
t('budget: failure lines always survive even when they exceed the budget', () => {
  const text = Array.from({ length: 400 }, (_, i) => (i % 3 === 0 ? `error E${i}: thing ${i} failed` : `noise line ${i}`)).join('\n');
  const out = finish(text, { max: 50 });
  assert.deepStrictEqual(lostFailureLines(text, out), []);
});
t('--save-raw keeps the full output and prunes to the newest 20', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-'));
  const text = fs.readFileSync(path.join(FIX, 'vitest-verbose.log'), 'utf8');
  for (let i = 0; i < 23; i++) fs.writeFileSync(path.join(dir, `2020-01-${String(i + 1).padStart(2, '0')}.txt`), 'old');
  const out = finish(text, { saveRaw: dir });
  const files = fs.readdirSync(dir);
  assert.strictEqual(files.length, 20);
  const m = /full output: (.+)\]$/.exec(out.trimEnd());
  assert.ok(m && fs.readFileSync(m[1], 'utf8') === text, 'raw copy differs');
});
// CLI runs get their own AI_DEV_KIT_HOME so the default raw copy never lands in the real home.
const cliEnv = () => ({ ...process.env, AI_DEV_KIT_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'cmh-')) });
t('cli: stdin mode and run mode (keeps the exit code, merges stderr)', () => {
  const text = fs.readFileSync(path.join(FIX, 'vitest-verbose.log'), 'utf8');
  const a = spawnSync('node', [SCRIPT], { input: text, encoding: 'utf8', env: cliEnv() });
  assert.strictEqual(a.status, 0); assert.ok(a.stdout.includes('[compacted'));
  const ok = spawnSync('node', [SCRIPT, '--', 'node', '-e', 'console.log(1)'], { encoding: 'utf8', env: cliEnv() });
  assert.strictEqual(ok.status, 0); assert.strictEqual(ok.stdout.trim(), '1');
  const bad = spawnSync('node', [SCRIPT, '--', 'node', '-e', "console.error('oops');process.exit(7)"], { encoding: 'utf8', env: cliEnv() });
  assert.strictEqual(bad.status, 7); assert.ok(bad.stdout.includes('oops'));
  assert.strictEqual(spawnSync('node', [SCRIPT, '--'], { encoding: 'utf8', env: cliEnv() }).status, 2);
});
t('cli run mode: an argument with spaces stays one argument, and no deprecation warning is printed', () => {
  const r = spawnSync('node', [SCRIPT, '--', 'node', '-e', 'console.log(JSON.stringify(process.argv.slice(1)))', 'a b', 'c'], { encoding: 'utf8', env: cliEnv() });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.trim(), '["a b","c"]');
  assert.doesNotMatch(r.stderr, /DEP0190|DeprecationWarning/);
  const one = spawnSync('node', [SCRIPT, '--', 'node -e "console.log(2)"'], { encoding: 'utf8', env: cliEnv() }); // one argument = the whole command line
  assert.strictEqual(one.stdout.trim(), '2');
});
t('quoteArg: plain words pass through; spaces and quotes are quoted for cmd.exe and sh', () => {
  assert.strictEqual(quoteArg('src/a-b_c.js', false), 'src/a-b_c.js');
  assert.strictEqual(quoteArg('a b', true), '"a b"');
  assert.strictEqual(quoteArg('say "hi"', true), '"say \\"hi\\""');
  assert.strictEqual(quoteArg("it's", false), "'it'\\''s'");
});
t('cli: the full output is kept under AI_DEV_KIT_HOME/raw by default; --no-save-raw keeps nothing', () => {
  const text = fs.readFileSync(path.join(FIX, 'vitest-verbose.log'), 'utf8');
  const env = cliEnv();
  const a = spawnSync('node', [SCRIPT], { input: text, encoding: 'utf8', env });
  const m = /full output: (.+)\]$/.exec(a.stdout.trimEnd());
  assert.ok(m, a.stdout.slice(-200));
  assert.ok(m[1].startsWith(path.join(env.AI_DEV_KIT_HOME, 'raw')));
  assert.strictEqual(fs.readFileSync(m[1], 'utf8'), text);
  const env2 = cliEnv();
  const b = spawnSync('node', [SCRIPT, '--no-save-raw'], { input: text, encoding: 'utf8', env: env2 });
  assert.doesNotMatch(b.stdout, /full output:/);
  assert.ok(!fs.existsSync(path.join(env2.AI_DEV_KIT_HOME, 'raw')));
});

console.log('\nreduction on real logs (lines, chars):');
for (const [f, l0, l1, c0, c1] of table) console.log(`  ${f.padEnd(22)} ${String(l0).padStart(4)} -> ${String(l1).padStart(4)} lines   ${String(c0).padStart(6)} -> ${String(c1).padStart(6)} chars  (${(100 - (100 * c1) / c0).toFixed(0)}% smaller)`);
