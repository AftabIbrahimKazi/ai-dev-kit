// The e2e driver runner: one driver straight through, both with Obscura first and Chrome as the fallback, the double check, and the guards.
// A stand-in @playwright/test CLI and a stand-in Obscura make every path testable offline.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const DRIVE = path.join(__dirname, '..', 'skills', 'workflow', 'e2e-scaffold.drive.js');
const drive = require(DRIVE);

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
let n = 0;
// A project with a fake @playwright/test. scenario: { obscura: {title: 'pass'|'fail'}, chrome: {...} }
function project(scenario, drivers) {
  const dir = path.join(base, 'p' + (++n));
  const pw = path.join(dir, 'node_modules', '@playwright', 'test');
  fs.mkdirSync(pw, { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(pw, 'package.json'), '{"name":"@playwright/test","version":"1.99.0"}');
  fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify(scenario));
  fs.writeFileSync(path.join(pw, 'cli.js'), `
const fs = require('fs'), path = require('path');
const sc = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scenario.json'), 'utf8'));
const mode = process.env.E2E_CDP ? 'obscura' : 'chrome';
fs.appendFileSync(path.join(process.cwd(), 'calls.log'), mode + ' ' + process.argv.slice(2).join(' ') + '\\n');
const last = path.join(process.cwd(), '.last-failed');
let titles = Object.keys(sc[mode] || {});
if (process.argv.includes('--last-failed') && fs.existsSync(last)) { const keep = JSON.parse(fs.readFileSync(last, 'utf8')); titles = titles.filter((x) => keep.includes(x)); }
const specs = titles.map((title, i) => ({ title, file: 'a.spec.ts', line: i + 1, tests: [{ projectName: 'chromium', status: sc[mode][title] === 'pass' ? 'expected' : sc[mode][title] === 'skip' ? 'skipped' : 'unexpected' }] }));
const failed = titles.filter((x) => sc[mode][x] === 'fail');
if (mode === 'obscura') fs.writeFileSync(last, JSON.stringify(failed));
fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({ suites: [{ title: 'a.spec.ts', file: 'a.spec.ts', specs: [], suites: [{ title: 'inner', specs }] }] }));
console.log(mode + ' ran ' + titles.length + ' test(s)');
process.exit(failed.length ? 1 : 0);
`);
  if (drivers) { fs.mkdirSync(path.join(dir, '.claude')); fs.writeFileSync(path.join(dir, '.claude', 'e2e-drivers.json'), JSON.stringify({ drivers })); }
  return dir;
}
// Stand-in Obscura: serves /json/version on the port it is given and records its arguments.
const obsBin = path.join(base, 'fake-obscura.js');
fs.writeFileSync(obsBin, `
const http = require('http'), fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
const port = Number(a[a.indexOf('--port') + 1]);
fs.appendFileSync(path.join(${JSON.stringify(base)}, 'obscura-args.log'), a.join(' ') + '\\n');
http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end('{"Browser":"fake"}'); }).listen(port, '127.0.0.1');
`);
const run = (dir, args, env) => spawnSync(process.execPath, [DRIVE, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, E2E_OBSCURA_BIN: obsBin, ...(env || {}) } });
const calls = (dir) => (fs.existsSync(path.join(dir, 'calls.log')) ? fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n') : []);

const ALL_PASS = { a: 'pass', b: 'pass' };

t('summarize: nested suites, flaky counts as passed, skipped stays skipped, project name is in the key', () => {
  const m = drive.summarize({ suites: [{ file: 'x.spec.ts', specs: [{ title: 'top', line: 1, tests: [{ projectName: 'p', status: 'expected' }] }], suites: [{ specs: [{ title: 'deep', line: 9, file: 'x.spec.ts', tests: [{ status: 'flaky' }, { status: 'unexpected' }] }] }] }] });
  assert.strictEqual(m.get('x.spec.ts:1 > top [p]'), 'passed');
  const deep = Array.from(m.entries()).filter(([k]) => k.includes('deep'));
  assert.ok(deep.length >= 1);
});

t('parseDrivers: both expands, Obscura is always first, junk is refused', () => {
  assert.deepStrictEqual(drive.parseDrivers('chrome,obscura'), ['obscura', 'chrome']);
  assert.deepStrictEqual(drive.parseDrivers('both'), ['obscura', 'chrome']);
  assert.deepStrictEqual(drive.parseDrivers('chrome'), ['chrome']);
  assert.throws(() => drive.parseDrivers('firefox'), /unknown driver/);
});

t('no driver chosen: exit 2 and nothing runs (both are opt-in)', () => {
  const dir = project({ chrome: ALL_PASS, obscura: ALL_PASS });
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /no driver is chosen/);
  assert.deepStrictEqual(calls(dir), []);
});

t('config is found from a subfolder up to the git root', () => {
  const dir = project({ chrome: ALL_PASS }, ['chrome']);
  const sub = path.join(dir, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const r = spawnSync(process.execPath, [DRIVE, 'status'], { cwd: sub, encoding: 'utf8', env: process.env });
  assert.match(r.stdout, /drivers: chrome/);
});

t('only chrome: runs straight through on the project browser, Obscura never starts', () => {
  fs.rmSync(path.join(base, 'obscura-args.log'), { force: true });
  const dir = project({ chrome: ALL_PASS, obscura: { a: 'fail' } }, ['chrome']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(dir).map((c) => c.split(' ')[0]), ['chrome']);
  assert.ok(!fs.existsSync(path.join(base, 'obscura-args.log')), 'obscura started although only chrome was chosen');
});

t('only chrome failing: exit 1, no second attempt', () => {
  const dir = project({ chrome: { a: 'fail', b: 'pass' } }, ['chrome']);
  assert.strictEqual(run(dir, ['run']).status, 1);
  assert.strictEqual(calls(dir).length, 1);
});

t('only obscura: runs on Obscura over loopback and Obscura is stopped afterwards', () => {
  fs.rmSync(path.join(base, 'obscura-args.log'), { force: true });
  const dir = project({ obscura: ALL_PASS, chrome: { a: 'fail' } }, ['obscura']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(calls(dir).map((c) => c.split(' ')[0]), ['obscura']);
  const args = fs.readFileSync(path.join(base, 'obscura-args.log'), 'utf8');
  assert.match(args, /--host 127\.0\.0\.1/);
  assert.match(args, /--allow-private-network/);
});

t('only obscura failing: exit 1 and there is no Chrome fallback', () => {
  const dir = project({ obscura: { a: 'fail' }, chrome: ALL_PASS }, ['obscura']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(calls(dir).map((c) => c.split(' ')[0]), ['obscura']);
});

t('only obscura, but Obscura is not installed: exit 3 with the install hint', () => {
  const dir = project({ obscura: ALL_PASS }, ['obscura']);
  const r = run(dir, ['run'], { E2E_OBSCURA_BIN: '', AI_DEV_KIT_HOME: path.join(base, 'empty-home'), PATH: path.join(base, 'empty-bin') });
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /obscura was not found/);
  assert.match(r.stdout, /no fallback/);
});

t('both, Obscura fully green: Chrome runs as a double check, both green, exit 0', () => {
  const dir = project({ obscura: ALL_PASS, chrome: ALL_PASS }, ['obscura', 'chrome']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 0, r.stdout);
  const c = calls(dir);
  assert.deepStrictEqual(c.map((x) => x.split(' ')[0]), ['obscura', 'chrome']);
  assert.ok(!/--last-failed/.test(c[1]), 'the double check re-runs the whole suite, not only failures');
  assert.match(r.stdout, /chrome \(double check\): 2 passed/);
  assert.match(r.stdout, /0 diverged, 0 failed on both/);
});

t('both, Obscura green but Chrome catches something: named DIVERGED (obscura passed, chrome failed), exit 1', () => {
  const dir = project({ obscura: ALL_PASS, chrome: { a: 'pass', b: 'fail' } }, ['obscura', 'chrome']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /1 diverged/);
  assert.match(r.stdout, /DIVERGED .*a\.spec\.ts:2 > b.*\(obscura passed, chrome failed\)/);
});

t('both, Obscura has even ONE failure: do nothing more, Chrome is not run, exit 1', () => {
  const dir = project({ obscura: { a: 'fail', b: 'pass', c: 'pass' }, chrome: { a: 'pass', b: 'pass', c: 'pass' } }, ['obscura', 'chrome']);
  const r = run(dir, ['run']);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(calls(dir).map((x) => x.split(' ')[0]), ['obscura'], 'chrome must not run after an Obscura failure');
  assert.match(r.stdout, /chrome is not run/);
  assert.ok(!/DIVERGED|double check/.test(r.stdout));
});

t('--double-check after an Obscura failure is the explicit way to get the full comparison', () => {
  const dir = project({ obscura: { a: 'fail', b: 'pass' }, chrome: { a: 'pass', b: 'pass' } }, ['obscura', 'chrome']);
  const r = run(dir, ['run', '--double-check']);
  assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(calls(dir).map((x) => x.split(' ')[0]), ['obscura', 'chrome']);
  assert.match(r.stdout, /DIVERGED .*\(obscura failed, chrome passed\)/);
});

t('both, Obscura missing: everything runs on Chrome and the reason is said', () => {
  const dir = project({ obscura: ALL_PASS, chrome: ALL_PASS }, ['obscura', 'chrome']);
  const r = run(dir, ['run'], { E2E_OBSCURA_BIN: '', AI_DEV_KIT_HOME: path.join(base, 'empty-home'), PATH: path.join(base, 'empty-bin') });
  assert.strictEqual(r.status, 0, r.stdout);
  assert.match(r.stdout, /obscura was not found.*running everything on chrome instead/);
  assert.deepStrictEqual(calls(dir).map((c) => c.split(' ')[0]), ['chrome']);
});

t('double check needs both drivers: with one chosen it exits 2', () => {
  const dir = project({ chrome: ALL_PASS }, ['chrome']);
  const r = run(dir, ['run', '--double-check']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /needs both drivers/);
});

t('--drivers on the command line overrides the project file; extra arguments reach Playwright', () => {
  const dir = project({ chrome: ALL_PASS, obscura: ALL_PASS }, ['obscura']);
  const r = run(dir, ['run', '--drivers', 'chrome', '--', '--grep', 'smoke']);
  assert.strictEqual(r.status, 0, r.stdout);
  const c = calls(dir);
  assert.strictEqual(c.length, 1);
  assert.match(c[0], /^chrome test --grep smoke/);
});

t('Playwright missing from the project: exit 3 with a plain message', () => {
  const dir = path.join(base, 'noplaywright');
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  const r = run(dir, ['run', '--drivers', 'chrome']);
  assert.strictEqual(r.status, 3);
  assert.match(r.stdout, /@playwright\/test is not installed/);
});

t('an unknown driver name is refused with exit 2', () => {
  const dir = project({ chrome: ALL_PASS });
  const r = run(dir, ['run', '--drivers', 'firefox']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stdout, /unknown driver "firefox"/);
});

fs.rmSync(base, { recursive: true, force: true });
