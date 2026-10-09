const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run, findCli, MODELS } = require('../skills/workflow/plan-first.delegate.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); };
function repo() { const d = tmp('dg-'); sh(d, 'init', '-q', '-b', 'main'); sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'init'); return d; }
// A fake Claude CLI: records its args and stdin, writes out.txt, prints the JSON the real one prints.
function fakeCli(dir, mode = 'ok') {
  const f = path.join(dir, 'fake-claude.js');
  fs.writeFileSync(f, `
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const args = process.argv.slice(2);
if (${JSON.stringify(mode)} === 'badjson') { console.log('this is not json'); process.exit(0); }
if (${JSON.stringify(mode)} === 'fail') { console.error('boom'); process.exit(3); }
if (${JSON.stringify(mode)} === 'edit-dirty') fs.appendFileSync('a.txt', 'and again by the executor\\n');
fs.writeFileSync('out.txt', 'made by executor');
console.log(JSON.stringify({ result: 'did it. model=' + args[args.indexOf('--model') + 1] + ' effort=' + args[args.indexOf('--effort') + 1] + ' planBytes=' + Buffer.byteLength(input), total_cost_usd: 0.0052, num_turns: 4,
  usage: { input_tokens: 8, output_tokens: 1796, cache_read_input_tokens: 144739, cache_creation_input_tokens: 13095 }, is_error: false }));
`);
  return f;
}
const plan = (d, text = 'step 1: do it\n') => { const p = path.join(d, 'plan.md'); fs.writeFileSync(p, text); return p; };

t('tiers map to the current model ids', () => {
  assert.deepStrictEqual(MODELS, { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' });
});
t('dry run shows the exact command and runs nothing', () => {
  const d = repo(); const cli = fakeCli(d);
  const r = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: cli, dryRun: true });
  assert.strictEqual(r.code, 0);
  for (const s of ['--model claude-haiku-5-5', '--effort low', '--output-format json', '--no-session-persistence', '--permission-mode acceptEdits', '--disallowedTools Bash(git commit:*) Bash(git push:*)']) assert.ok(r.text.includes(s), s);
  assert.ok(!fs.existsSync(path.join(d, 'out.txt')));
});
t('bad tier, missing plan and missing binary are clear errors with code 2', () => {
  const d = repo();
  assert.strictEqual(run({ planFile: plan(d), tier: 'gpt', cwd: d }).code, 2);
  assert.strictEqual(run({ planFile: path.join(d, 'nope.md'), tier: 'haiku', cwd: d }).code, 2);
  const r = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: path.join(d, 'no-such-claude') });
  assert.strictEqual(r.code, 2);
  assert.ok(/binary not found/.test(r.text));
});
t('a run reports cost, tokens, new changed files and the executor report; plan goes in on stdin', () => {
  const d = repo(); const home = tmp('dgh-');
  fs.writeFileSync(path.join(d, 'a.txt'), 'edited before the run\n'); // already dirty: must not count as the executor's work
  const r = run({ planFile: plan(d, '12345'), tier: 'sonnet', cwd: d, cliPath: fakeCli(d), home });
  assert.strictEqual(r.code, 0, r.text);
  assert.ok(r.text.includes('sonnet (claude-sonnet-5-5, effort low) exit 0'), r.text);
  assert.ok(r.text.includes('cost $0.0052') && r.text.includes('out 1,796') && r.text.includes('cache r 144,739'), r.text);
  assert.ok(r.text.includes('changed: out.txt (1 file(s) changed by this run)') && !r.text.includes('a.txt'), r.text);
  assert.ok(r.text.includes('model=claude-sonnet-5-5 effort=low planBytes=5'), r.text);
  assert.ok(r.text.includes('not proof'));
});
t('a file that was already dirty and is edited again by the executor is reported', () => {
  const d = repo(); const home = tmp('dgh-');
  fs.writeFileSync(path.join(d, 'a.txt'), 'edited before the run\n');
  const r = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d, 'edit-dirty'), home });
  assert.ok(/changed: (a\.txt, out\.txt|out\.txt, a\.txt) \(2 file\(s\)/.test(r.text), r.text);
  assert.ok(/git diff [0-9a-f]{12}/.test(r.text), r.text); // points at the pre-run snapshot
  assert.strictEqual(fs.readFileSync(path.join(d, 'a.txt'), 'utf8'), 'edited before the run\nand again by the executor\n'); // snapshot touched nothing
});
t('a repo with no commit yet still reports the new files', () => {
  const d = tmp('dg0-'); sh(d, 'init', '-q', '-b', 'main'); const home = tmp('dgh-');
  const r = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d), home });
  assert.ok(r.text.includes('out.txt'), r.text);
});
t('every run appends one row to the delegate ledger', () => {
  const d = repo(); const home = tmp('dgh-');
  run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d), home });
  run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d), home });
  const rows = fs.readFileSync(path.join(home, 'ledger', 'delegate.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(rows.length, 2);
  assert.ok(rows[0].tier === 'haiku' && rows[0].usd === 0.0052 && rows[0].out === 1796);
});
t('non-JSON output and a failing executor give code 1 and say so', () => {
  const d = repo(); const home = tmp('dgh-');
  const bad = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d, 'badjson'), home });
  assert.strictEqual(bad.code, 1); assert.ok(/not JSON/.test(bad.text));
  const fail = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d, 'fail'), home });
  assert.strictEqual(fail.code, 1); assert.ok(/exit 3/.test(fail.text));
});
t('outside a git repo the changed-files line says unknown', () => {
  const d = tmp('dgn-'); const home = tmp('dgh-');
  const r = run({ planFile: plan(d), tier: 'haiku', cwd: d, cliPath: fakeCli(d), home });
  assert.ok(r.text.includes('changed: unknown'), r.text);
});
t('findCli: explicit path wins; newest VS Code extension copy is the fallback', () => {
  const d = tmp('dgc-');
  assert.strictEqual(findCli(path.join(d, 'nope')), null);
  assert.strictEqual(findCli(fakeCli(d)), path.join(d, 'fake-claude.js'));
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude']).status === 0;
  if (onPath) return console.log('     (claude is on PATH here: extension fallback skipped)');
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const v of ['2.1.9', '2.1.294', '2.1.100']) {
    const bin = path.join(d, '.vscode', 'extensions', `anthropic.claude-code-${v}-win32-x64`, 'resources', 'native-binary');
    fs.mkdirSync(bin, { recursive: true }); fs.writeFileSync(path.join(bin, exe), '');
  }
  assert.ok(findCli(undefined, d, {}).includes('claude-code-2.1.294'));
});
t('findCli on Windows: skips the npm sh shim, takes a .exe, or turns claude.cmd into its cli.js', () => {
  const d = tmp('dgw-'); const home = tmp('dgwh-');
  const shim = path.join(d, 'claude'), cmd = path.join(d, 'claude.cmd'), exe = path.join(d, 'claude.exe');
  assert.strictEqual(findCli(undefined, home, {}, () => [shim], 'win32'), null); // the shim alone cannot be spawned
  assert.strictEqual(findCli(undefined, home, {}, () => [shim, exe], 'win32'), exe);
  const js = path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  fs.mkdirSync(path.dirname(js), { recursive: true }); fs.writeFileSync(js, '');
  assert.strictEqual(findCli(undefined, home, {}, () => [shim, cmd], 'win32'), js);
  assert.strictEqual(findCli(undefined, home, {}, () => [shim], 'linux'), shim); // elsewhere the first hit is fine
});
t('cli: prints the summary and sets the exit code', () => {
  const d = repo(); const home = tmp('dgh-');
  const r = spawnSync('node', [path.join(__dirname, '../skills/workflow/plan-first.delegate.js'), plan(d), '--tier', 'haiku', '--cwd', d, '--cli', fakeCli(d)], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: home } });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  assert.ok(r.stdout.startsWith('delegate: haiku'));
});
