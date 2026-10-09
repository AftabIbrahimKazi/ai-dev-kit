const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check, detect, checkMessage } = require('../skills/workflow/pre-commit.check.js');
const SCRIPT = path.join(__dirname, '../skills/workflow/pre-commit.check.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const sh = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`); return r.stdout; };
function repo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pcc-'));
  sh(d, 'init', '-q', '-b', 'main');
  sh(d, 'config', 'user.email', 't@t'); sh(d, 'config', 'user.name', 't'); sh(d, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(d, 'README.md'), '# r\n');
  sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'chore: init');
  return d;
}
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const kinds = (res, sev) => res.findings.filter((f) => f.sev === sev).map((f) => f.kind + ':' + (f.file || ''));
const KEY = 'sk-ant-' + 'a1B2c3D4'.repeat(4);

t('clean staged change has no findings', () => {
  const d = repo(); put(d, 'src/a.js', 'const a = 1;\n'); sh(d, 'add', '.');
  assert.deepStrictEqual(check({ cwd: d }).findings, []);
});
t('debug leftovers warn with file:line, only in code files', () => {
  const d = repo(); put(d, 'src/a.js', 'const a = 1;\nconsole.log(a);\n'); put(d, 'notes.md', 'console.log(x) is documented here\n'); sh(d, 'add', '.');
  const r = check({ cwd: d });
  assert.deepStrictEqual(kinds(r, 'WARN'), ['debug:src/a.js']);
  assert.strictEqual(r.findings[0].line, 2);
});
t('debug probes are ignored in test files and in shebang CLI scripts', () => {
  const d = repo(); put(d, 'tests/a.test.js', 'console.log(1);\n'); put(d, 'tools/run.js', '#!/usr/bin/env node\nconsole.log(2);\n'); put(d, 'src/app.js', 'console.log(3);\n'); sh(d, 'add', '.');
  assert.deepStrictEqual(kinds(check({ cwd: d }), 'WARN'), ['debug:src/app.js']);
});
t('an API key blocks and the report never prints it whole', () => {
  const d = repo(); put(d, 'src/cfg.js', `export const k = "${KEY}";\n`); sh(d, 'add', '.');
  const r = check({ cwd: d });
  assert.deepStrictEqual(kinds(r, 'BLOCK'), ['secret:src/cfg.js']);
  const text = require('../skills/workflow/pre-commit.check.js').report(r);
  assert.ok(!text.includes(KEY), 'full secret leaked into the report');
  assert.ok(text.includes('Anthropic key'));
});
t('a staged .env blocks, .env.example does not', () => {
  const d = repo(); put(d, '.env', 'A=1\n'); put(d, '.env.example', 'A=\n'); sh(d, 'add', '-f', '.');
  assert.deepStrictEqual(kinds(check({ cwd: d }), 'BLOCK'), ['file:.env']);
});
t('a generic credential assignment only warns', () => {
  const d = repo(); put(d, 'src/x.js', 'const password = "correct-horse-battery-staple";\n'); sh(d, 'add', '.');
  const r = check({ cwd: d });
  assert.deepStrictEqual(kinds(r, 'BLOCK'), []);
  assert.deepStrictEqual(kinds(r, 'WARN'), ['secret:src/x.js']);
});
t('half-staged and untracked files warn', () => {
  const d = repo(); put(d, 'a.js', 'x\n'); sh(d, 'add', '.'); put(d, 'a.js', 'x\ny\n'); put(d, 'stray.log', 'z\n');
  const k = kinds(check({ cwd: d }), 'WARN');
  assert.ok(k.some((x) => x.startsWith('half-staged')) && k.some((x) => x.startsWith('untracked')), k.join());
});
t('--all sees unstaged edits to tracked files (git commit -a)', () => {
  const d = repo(); put(d, 'README.md', '# r\nconsole.log(1)\n'); put(d, 'app.js', '1\n'); sh(d, 'add', 'app.js'); sh(d, 'commit', '-qm', 'feat: app'); put(d, 'app.js', 'console.log(2);\n');
  assert.deepStrictEqual(check({ cwd: d }).findings.filter((f) => f.kind === 'debug'), []);
  assert.deepStrictEqual(kinds(check({ cwd: d, mode: 'all' }), 'WARN').filter((x) => x.startsWith('debug')), ['debug:app.js']);
});
t('--push scans commits no remote has, and stops flagging after the push', () => {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-')); sh(remote, 'init', '-q', '--bare', '-b', 'main');
  const d = repo(); sh(d, 'remote', 'add', 'origin', remote); sh(d, 'push', '-q', 'origin', 'main');
  put(d, 'k.js', `const k = "${KEY}";\n`); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'feat: add k');
  assert.deepStrictEqual(kinds(check({ cwd: d, mode: 'push' }), 'BLOCK'), ['secret:k.js']);
  sh(d, 'push', '-q', 'origin', 'main');
  assert.deepStrictEqual(check({ cwd: d, mode: 'push' }).findings, []);
});
t('handover notes get the secret scan; lane state in handover/locks.d is never read, only warned about', () => {
  const d = repo();
  put(d, 'handover/notes.md', `token was ${KEY}\n`);
  put(d, 'handover/locks.d/src__a.js/owner', `claude-a3f9 | dev | ${KEY} | editing\n`);
  sh(d, 'add', '-f', '.');
  const res = check({ cwd: d });
  assert.deepStrictEqual(kinds(res, 'BLOCK'), ['secret:handover/notes.md']);
  assert.ok(res.findings.some((f) => f.kind === 'lane-state' && f.sev === 'WARN' && /1 file\(s\) under handover\/locks\.d\/ staged/.test(f.msg)));
  assert.ok(!res.findings.some((f) => (f.file || '').includes('locks.d')));
  sh(d, 'commit', '-qm', 'chore: x');
  assert.ok(!check({ cwd: d, mode: 'push' }).findings.some((f) => (f.file || '').includes('locks.d')));
});
t('--files limits the scan to the given paths', () => {
  const d = repo(); put(d, 'a.js', 'console.log(1);\n'); put(d, 'b.js', 'console.log(2);\n'); sh(d, 'add', '.');
  assert.deepStrictEqual(kinds(check({ cwd: d, files: ['b.js'] }), 'WARN'), ['debug:b.js']);
});
t('message: valid passes, bad type blocks, long header and period warn', () => {
  assert.deepStrictEqual(checkMessage('feat: add button'), []);
  assert.strictEqual(checkMessage('added the button')[0].sev, 'BLOCK');
  assert.strictEqual(checkMessage('wip: stuff')[0].sev, 'BLOCK');
  const w = checkMessage('feat: ' + 'x'.repeat(60) + '.').map((f) => f.msg);
  assert.ok(w.some((m) => /limit 50/.test(m)) && w.some((m) => /period/.test(m)));
  assert.ok(checkMessage('fix: a\nno blank line').some((f) => /blank line/.test(f.msg)));
});
t('message: the 50-character limit is on the whole header, scope included', () => {
  assert.deepStrictEqual(checkMessage('fix: ' + 'z'.repeat(45)), []); // exactly 50
  assert.ok(checkMessage('fix: ' + 'z'.repeat(46)).some((f) => /51 chars \(limit 50\)/.test(f.msg)));
  assert.ok(checkMessage('refactor(api): ' + 'y'.repeat(40)).some((f) => /55 chars/.test(f.msg)));
  assert.strictEqual(checkMessage('fix: ' + 'z'.repeat(46))[0].sev, 'WARN'); // a warning, so the commit still goes through on retry
});
t('detect: plain commit with message', () => {
  assert.deepStrictEqual(detect('git commit -m "feat: x"'), { isCommit: true, isPush: false, all: false, amend: false, noVerify: false, force: false, stages: false, messages: ['feat: x'], unparsableMessage: false });
});
t('detect: -am, global options, chains, repeated -m', () => {
  const d = detect('cd x && git -C repo -c a=b commit -am "fix: y" -m "body"');
  assert.ok(d.isCommit && d.all);
  assert.deepStrictEqual(d.messages, ['fix: y', 'body']);
});
t('detect: text that merely mentions git commit is not a commit', () => {
  assert.strictEqual(detect('echo "run git commit next"').isCommit, false);
  assert.strictEqual(detect('grep -r "git commit" docs').isCommit, false);
  assert.strictEqual(detect('git status').isCommit, false);
});
t('detect: reports commands that change what would be committed or pushed', () => {
  assert.ok(detect('git add -A && git commit -m "a"').stages);
  assert.ok(detect('git commit -m "a" && git push').isPush);
  assert.ok(!detect('git commit -m "a"').stages);
});
t('detect: heredoc message is marked unparsable, not guessed', () => {
  const d = detect('git commit -m "$(cat <<\'EOF\'\nfeat: x\nEOF\n)"');
  assert.ok(d.isCommit && d.unparsableMessage && d.messages.length === 0);
});
t('detect: flags amend, no-verify, push and force', () => {
  const c = detect('git commit --amend --no-verify -m "fix: z"');
  assert.ok(c.amend && c.noVerify);
  const p = detect('git push --force-with-lease origin main');
  assert.ok(p.isPush && p.force && !p.isCommit);
  assert.ok(!detect('git push origin main').force);
});
t('cli: exit 1 on BLOCK, 0 otherwise; --detect prints JSON', () => {
  const d = repo(); put(d, 'k.js', `const k = "${KEY}";\n`); sh(d, 'add', '.');
  assert.strictEqual(spawnSync('node', [SCRIPT, '--cwd', d], { encoding: 'utf8' }).status, 1);
  const clean = repo(); put(clean, 'ok.js', '1\n'); sh(clean, 'add', '.');
  assert.strictEqual(spawnSync('node', [SCRIPT, '--cwd', clean], { encoding: 'utf8' }).status, 0);
  const j = JSON.parse(spawnSync('node', [SCRIPT, '--detect', 'git commit -m "a"'], { encoding: 'utf8' }).stdout);
  assert.strictEqual(j.isCommit, true);
});
t('--push without any remote scans every commit in one pass and counts them', () => {
  const d = repo();
  put(d, 'a.js', `const a = "${KEY}";\n`); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'feat: a');
  put(d, 'b.js', `const b = "${KEY}";\n`); sh(d, 'add', '.'); sh(d, 'commit', '-qm', 'feat: b');
  const res = check({ cwd: d, mode: 'push' });
  assert.strictEqual(res.label, 'push, 3 unpushed commit(s)');
  assert.deepStrictEqual(kinds(res, 'BLOCK').sort(), ['secret:a.js', 'secret:b.js']);
});
t('detect (PowerShell): here-string message, backtick escape, call operator, backslash paths', () => {
  const here = detect("git commit -m @'\r\nfeat: add x\r\n\r\nbody line\r\n'@", true);
  assert.ok(here.isCommit && !here.unparsableMessage);
  assert.deepStrictEqual(here.messages, ['feat: add x\r\n\r\nbody line']);
  assert.deepStrictEqual(detect('git commit -m "fix: say `"hi`""', true).messages, ['fix: say "hi"']);
  assert.deepStrictEqual(detect("git commit -m 'fix: it''s done'", true).messages, ["fix: it's done"]);
  assert.ok(detect('& "C:\\Program Files\\Git\\cmd\\git.exe" commit -m "fix: a"', true).isCommit);
  const c = detect('git -C C:\\work\\repo commit -m "fix: b"', true);
  assert.ok(c.isCommit); assert.deepStrictEqual(c.messages, ['fix: b']);
  assert.ok(detect('git add . ; git commit -m "a"', true).stages);
  assert.ok(detect('git commit -m "a" && git push', true).isPush);
  assert.ok(detect('git commit -m "$(Get-Content msg.txt)"', true).unparsableMessage);
});
t('cli: --detect --shell powershell parses PowerShell', () => {
  const j = JSON.parse(spawnSync('node', [SCRIPT, '--detect', "git commit -m 'fix: it''s ok'", '--shell', 'powershell'], { encoding: 'utf8' }).stdout);
  assert.deepStrictEqual(j.messages, ["fix: it's ok"]);
});
