// implicit-state-audit scanner: the boolean-explosion fixture fails with the impossible state named, a clean union passes,
// the DOM and timer rules fire, the cache works, and the hook mode is silent when clean.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scanText, scanFiles, formatTable, stripComments, blankLongStrings, isTestFile } = require('../skills/standards/implicit-state-audit.scan.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sa-'));
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const BIN = path.join(__dirname, '..', 'skills', 'standards', 'implicit-state-audit.scan.js');

const BAD = `import { useState } from 'react';
export function Panel() {
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  return null;
}
`;
const CLEAN = `type Status = 'idle' | 'loading' | 'success' | 'error';
export function Panel() {
  const [status, setStatus] = useState<Status>('idle');
  const [isOpen, setIsOpen] = useState(false);
  return null;
}
`;

t('boolean explosion: isLoading, isError, isSuccess is a FAIL naming the impossible state and the fix', () => {
  const f = scanText('a.tsx', BAD);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].rule, 'bool-flags');
  assert.strictEqual(f[0].level, 'fail');
  assert.ok(f[0].impossible.includes('{ isLoading: true, isSuccess: true }'), f[0].impossible.join('|'));
  assert.ok(/'idle' \| 'loading' \| 'success' \| 'error'/.test(f[0].fix));
  assert.strictEqual(f[0].line, 3);
});

t('a discriminated union with one other flag passes', () => {
  assert.deepStrictEqual(scanText('a.tsx', CLEAN), []);
});

t('three flags without a lifecycle trio is a WARN; two flags is nothing', () => {
  const three = 'function A() {\n let isOpen = false;\n let isVisible = false;\n let isActive = true;\n}\n';
  const f = scanText('a.js', three);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].level, 'warn');
  assert.deepStrictEqual(scanText('a.js', 'function A() {\n let isOpen = false;\n let isVisible = false;\n}\n'), []);
});

t('flags in different functions are not grouped together', () => {
  const src = 'function A() { let isOpen = false; }\nfunction B() { let isError = false; }\nfunction C() { let isLoading = false; }\n';
  assert.deepStrictEqual(scanText('a.js', src), []);
});

t('object literal state: isLoading, isError, isSuccess keys in one literal', () => {
  const src = 'const state = {\n  isLoading: false,\n  isError: false,\n  isSuccess: false,\n};\n';
  assert.strictEqual(scanText('a.js', src)[0].level, 'fail');
});

t('class fields: this.isX assignments in one class', () => {
  const src = 'class M {\n constructor() {\n  this.isOpen = false;\n  this.isBusy = false;\n  this.isDone = false;\n }\n}\n';
  assert.strictEqual(scanText('a.js', src)[0].rule, 'bool-flags');
});

t('flags named in comments are ignored', () => {
  assert.deepStrictEqual(scanText('a.js', '// let isOpen = false; let isError = false; let isDone = false;\nfunction A() {}\n'), []);
  assert.ok(!/isOpen/.test(stripComments('/* let isOpen = false */ x')));
});

t('code inside a long or multi-line string (a fixture, a sample) is not state; short strings still count', () => {
  const fixture = 'const SAMPLE = `\nfunction A() {\n let isLoading = false;\n let isError = false;\n let isSuccess = false;\n}\n`;\n';
  assert.deepStrictEqual(scanText('a.js', fixture), []);
  assert.strictEqual(blankLongStrings("x('is-open') y"), "x('is-open') y");
  assert.ok(!/isLoading/.test(blankLongStrings("const s = 'let isLoading = false; let isError = false; let isSuccess = false;';")));
});

t('test, spec, story and fixture files are skipped in automatic runs but scanned when named', () => {
  for (const f of ['src/a.test.tsx', 'src/a.spec.ts', 'src/A.stories.tsx', 'tests/a.js', 'src/__tests__/a.js', 'e2e/a.ts', 'fixtures/a.js']) assert.ok(isTestFile(f), f);
  for (const f of ['src/Panel.tsx', 'src/latest.ts', 'src/contest.js']) assert.ok(!isTestFile(f), f);
  const d = tmp();
  put(d, 'src/P.test.tsx', BAD); put(d, 'src/P.tsx', BAD);
  const all = JSON.parse(spawnSync(process.execPath, [BIN, 'src', '--json', '--root', d, '--no-cache'], { encoding: 'utf8' }).stdout);
  assert.deepStrictEqual(all.findings.map((f) => f.file), ['src/P.tsx']);
  const named = JSON.parse(spawnSync(process.execPath, [BIN, 'src/P.test.tsx', '--json', '--root', d, '--no-cache'], { encoding: 'utf8' }).stdout);
  assert.strictEqual(named.findings.length, 1);
});

t('scattered DOM state: 3 distinct class and attribute names in 2 functions', () => {
  const src = "function open(el) { el.classList.add('is-open'); el.setAttribute('aria-expanded', 'true'); }\nfunction close(el) { el.classList.remove('is-open'); el.dataset.state = 'closed'; }\n";
  const f = scanText('a.js', src);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].rule, 'scattered-toggle');
  assert.deepStrictEqual(scanText('a.js', "function one(el) { el.classList.add('a'); el.classList.remove('a'); el.classList.add('b'); el.classList.add('c'); }\n"), []);
});

t('timer sequencing: two setTimeout callbacks that change state', () => {
  const src = "function go(el) {\n setTimeout(() => el.classList.add('a'), 100);\n setTimeout(() => setStep(2), 300);\n}\n";
  assert.strictEqual(scanText('a.js', src)[0].rule, 'timer-sequencing');
  assert.deepStrictEqual(scanText('a.js', "setTimeout(() => console.log(1), 5);\nsetTimeout(() => console.log(2), 9);\n"), []);
});

t('cache: the second run reads from the cache, an edited file is rescanned, and nothing is written into the project', () => {
  const d = tmp();
  const home = tmp();
  process.env.AI_DEV_KIT_HOME = home;
  put(d, 'src/a.tsx', BAD);
  const first = scanFiles(d, ['src/a.tsx']);
  assert.deepStrictEqual([first.cached, first.findings.length], [0, 1]);
  assert.ok(fs.existsSync(path.join(home, 'cache', 'state-audit')));
  assert.ok(!fs.existsSync(path.join(d, '.claude')), 'no .claude folder was created in the project');
  assert.strictEqual(scanFiles(d, ['src/a.tsx']).cached, 1);
  put(d, 'src/a.tsx', CLEAN);
  const third = scanFiles(d, ['src/a.tsx']);
  assert.deepStrictEqual([third.cached, third.findings.length], [0, 0]);
  delete process.env.AI_DEV_KIT_HOME;
});

t('formatTable lists file, line, flags, impossible states and the fix', () => {
  const s = formatTable(scanText('src/a.tsx', BAD));
  assert.ok(/FAIL src\/a\.tsx:3/.test(s) && /impossible:/.test(s) && /fix:/.test(s) && /1 fail, 0 warn/.test(s));
});

t('CLI: --hook is silent and exits 0 on a clean or out-of-scope file, prints and exits 1 on a bad one', () => {
  const d = tmp();
  put(d, 'ok.tsx', CLEAN); put(d, 'bad.tsx', BAD); put(d, 'notes.md', BAD); put(d, 'node_modules/x/y.js', BAD);
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a, '--root', d], { encoding: 'utf8' });
  for (const f of ['ok.tsx', 'notes.md', 'node_modules/x/y.js', 'missing.tsx']) { const r = run('--hook', f); assert.deepStrictEqual([r.status, r.stdout, r.stderr], [0, '', ''], f); }
  const bad = run('--hook', 'bad.tsx');
  assert.strictEqual(bad.status, 1);
  assert.ok(/impossible: .*\{ isLoading: true, isSuccess: true \}/.test(bad.stdout), bad.stdout);
});

t('CLI: a folder is scanned, --json works, a bad flag exits 2, a missing path exits 1', () => {
  const d = tmp();
  put(d, 'src/bad.tsx', BAD); put(d, 'src/ok.tsx', CLEAN);
  const run = (...a) => spawnSync(process.execPath, [BIN, ...a, '--root', d], { encoding: 'utf8' });
  const j = JSON.parse(run('src', '--json').stdout);
  assert.deepStrictEqual([j.scanned, j.findings.length], [2, 1]);
  assert.strictEqual(run('--bogus').status, 2);
  assert.strictEqual(run('nope').status, 1);
});

const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const gitRepo = () => { const d = tmp(); git(d, 'init', '-q', '-b', 'main'); git(d, 'config', 'user.email', 't@t'); git(d, 'config', 'user.name', 't'); git(d, 'config', 'commit.gpgsign', 'false'); put(d, 'README.md', 'x\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'init'); return d; };
const scan = (d, ...a) => spawnSync(process.execPath, [BIN, ...a, '--root', d], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: path.join(d, '..', 'home-' + path.basename(d)) } });

const useFlag = (n) => '  const [' + n + ', set' + n[0].toUpperCase() + n.slice(1) + '] = useState(false);';

t('arrow-function bodies are scopes: flags split across two arrows are not one group, three in one arrow are', () => {
  const split = 'const a = () => {\n' + useFlag('isLoading') + '\n' + useFlag('isError') + '\n};\nconst b = () => {\n' + useFlag('isSuccess') + '\n};\n';
  assert.deepStrictEqual(scanText('x.tsx', split), []);
  const one = 'const a = () => {\n' + useFlag('isLoading') + '\n' + useFlag('isError') + '\n' + useFlag('isSuccess') + '\n};\n';
  assert.strictEqual(scanText('x.tsx', one).length, 1);
});

t('an object literal is its own group, separate from the flags of the function around it', () => {
  const mixed = 'function f() {\n' + useFlag('isLoading') + '\n' + useFlag('isError') + '\n  const o = { isSuccess: true };\n}\n';
  assert.deepStrictEqual(scanText('x.tsx', mixed), [], 'two hook flags plus one key are not three flags in one place');
  const lit = 'function f() {\n  const o = { isLoading: true, isError: false, isSuccess: false };\n' + useFlag('isLoading') + '\n}\n';
  assert.strictEqual(scanText('x.tsx', lit).length, 1);
});

t('--changed scans only changed code files in a git repo, and does nothing outside one', () => {
  const d = gitRepo();
  put(d, 'src/bad.tsx', CLEAN); put(d, 'src/bad.test.tsx', CLEAN); put(d, 'notes.md', 'x\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'files');
  put(d, 'src/bad.tsx', BAD); put(d, 'notes.md', 'isLoading isError isSuccess\n'); put(d, 'src/bad.test.tsx', BAD);
  const j = JSON.parse(scan(d, '--changed', '--json').stdout);
  assert.deepStrictEqual([j.scanned, j.findings.length, j.findings[0].file], [1, 1, 'src/bad.tsx']);
  const plain = tmp(); put(plain, 'a.tsx', BAD);
  assert.strictEqual(JSON.parse(scan(plain, '--changed', '--json').stdout).scanned, 0);
});

t('the cache is on by default and --no-cache leaves none behind', () => {
  const d = tmp(); put(d, 'a.tsx', BAD);
  const home = path.join(d, '..', 'home-' + path.basename(d));
  scan(d, 'a.tsx', '--no-cache');
  assert.ok(!fs.existsSync(path.join(home, 'cache', 'state-audit')), 'no cache written with --no-cache');
  scan(d, 'a.tsx');
  assert.ok(fs.readdirSync(path.join(home, 'cache', 'state-audit')).length === 1, 'default run writes one cache file');
});

if (failed) { console.log('implicit-state-audit.scan.test: FAILED'); process.exit(1); }
console.log('implicit-state-audit.scan.test: ok');
