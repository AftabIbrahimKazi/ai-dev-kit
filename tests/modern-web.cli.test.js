// modern-web wrapper: tolerant JSON parsing, vendor filtering, kit-wins notes, cache, skips, and the CLI, with a fake scanner.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mw = require('../skills/addons/modern-web.cli.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mw-'));
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };
const BIN = path.join(__dirname, '..', 'skills', 'addons', 'modern-web.cli.js');

// Shaped after the scanner's documented fields: a guide id, a retrieve command, a keepWhen rubric, findings with file, line, lineContent.
const SCAN = { rules: [
  { guideId: 'native-dialog-modal', retrieveCommand: 'npx modern-web-guidance retrieve native-dialog-modal', keepWhen: ['The modal is a custom jQuery overlay with no dialog element'], findings: [
    { file: 'src/app.js', line: 2, lineContent: "$('#modal').fadeIn(200);" },
    { file: 'node_modules/x/y.js', line: 9, lineContent: 'vendor' },
    { file: 'assets/lib.min.js', line: 1, lineContent: 'minified' } ] },
  { guideId: 'fetch-over-xhr', retrieveCommand: 'npx modern-web-guidance retrieve fetch-over-xhr', findings: [{ file: 'src\\app.js', line: 4, lineContent: 'var xhr = new XMLHttpRequest();' }] },
] };

// A fake scanner script: prints JSON (or fails) and counts its runs in a file next to it.
function runner(dir, body) {
  const f = path.join(dir, 'fake-scanner.js');
  fs.writeFileSync(f, `const fs=require('fs');const c=${JSON.stringify(path.join(dir, 'runs.txt'))};fs.appendFileSync(c,'x');${body}`);
  return f;
}
const runs = (dir) => { try { return fs.readFileSync(path.join(dir, 'runs.txt'), 'utf8').length; } catch { return 0; } };
const env = (extra) => ({ ...process.env, AI_DEV_KIT_HOME: tmp(), ...extra });

t('extractHits: finds file and line pairs under their guide, normalises backslashes, keeps the rubric and retrieve command', () => {
  const h = mw.extractHits(SCAN);
  assert.strictEqual(h.length, 4);
  assert.deepStrictEqual([h[0].file, h[0].line, h[0].guide], ['src/app.js', 2, 'native-dialog-modal']);
  assert.ok(h[0].retrieve.includes('native-dialog-modal') && /custom jQuery overlay/.test(h[0].verify));
  assert.strictEqual(h[3].file, 'src/app.js');
});

t('extractHits: other shapes work (flat array, no guide), junk gives nothing', () => {
  assert.strictEqual(mw.extractHits([{ file: 'a.js', line: 1, text: 'x' }])[0].guide, 'unknown');
  assert.deepStrictEqual(mw.extractHits({ ok: true, items: [] }), []);
  assert.deepStrictEqual(mw.extractHits(null), []);
});

t('kit-wins note on a modal guide, none on an unrelated one', () => {
  const h = mw.extractHits(SCAN);
  assert.ok(/kit modal standard wins/.test(h[0].note));
  assert.strictEqual(h[3].note, '');
});

t('formatTable: rows, the kit note, a cap with a "more" line, and the empty case', () => {
  const hits = mw.extractHits(SCAN).filter((x) => !/node_modules|\.min\./.test(x.file));
  const s = mw.formatTable(hits, 1, 4);
  assert.ok(/src\/app\.js:2  native-dialog-modal/.test(s) && /kit: kit modal standard wins/.test(s) && /and 1 more/.test(s) && /keepWhen/.test(s));
  assert.ok(/no legacy patterns/.test(mw.formatTable([], 25, 0)));
});

t('runnerCommand: pinned version through npx, the runner override, and a path-free argument list', () => {
  const c = mw.runnerCommand({}, 'linux');
  assert.deepStrictEqual(c, { cmd: 'npx', args: ['--yes', 'modern-web-guidance@1.0.0', 'legacy-scan', '.', '--json'] });
  assert.ok(!c.args.some((a) => /latest/.test(a)));
  assert.deepStrictEqual(mw.runnerCommand({ MODERN_WEB_RUNNER: '/x/r.js' }, 'linux').args, ['/x/r.js', 'legacy-scan', '.', '--json']);
});

t('scan: an old Node is skipped with the reason and no process starts', () => {
  const r = mw.scan(tmp(), { env: { AI_DEV_KIT_HOME: tmp() }, nodeVersion: '20.1.0' });
  assert.ok(/needs Node 22 or newer \(you have 20\.1\.0\)/.test(r.skipped));
});

t('CLI end to end: a fake scanner, vendor and minified files dropped, then a second run is cached', () => {
  const d = tmp();
  put(d, 'src/app.js', 'x');
  const home = tmp();
  const r1 = runner(d, `console.log(${JSON.stringify(JSON.stringify(SCAN))});`);
  const run = (...a) => spawnSync(process.execPath, [BIN, d, ...a], { encoding: 'utf8', env: env({ MODERN_WEB_RUNNER: r1, AI_DEV_KIT_HOME: home }) });
  const first = run();
  assert.strictEqual(first.status, 0, first.stderr);
  assert.ok(/src\/app\.js:2/.test(first.stdout) && /src\/app\.js:4/.test(first.stdout));
  assert.ok(!/node_modules|\.min\.js/.test(first.stdout), first.stdout);
  assert.ok(/2 candidate\(s\) of 2 raw/.test(first.stdout), first.stdout);
  assert.strictEqual(runs(d), 1);
  const second = run();
  assert.ok(/\(cached\)/.test(second.stdout));
  assert.strictEqual(runs(d), 1, 'the scanner did not run again');
  run('--refresh');
  assert.strictEqual(runs(d), 2);
  assert.strictEqual(JSON.parse(run('--json').stdout).hits.length, 2);
});

t('CLI: a failing scanner, non-JSON output and an unknown shape each print one plain line and exit 0', () => {
  const d = tmp();
  const home = tmp();
  const run = (script) => spawnSync(process.execPath, [BIN, d], { encoding: 'utf8', env: env({ MODERN_WEB_RUNNER: runner(tmp(), script), AI_DEV_KIT_HOME: home }) });
  const fail = run("process.stderr.write('ENOTFOUND registry');process.exit(1);");
  assert.strictEqual(fail.status, 0);
  assert.ok(/scan skipped: the scanner failed or the network is unreachable/.test(fail.stdout));
  const junk = run("console.log('not json');");
  assert.ok(/not JSON/.test(junk.stdout) && junk.status === 0);
  const shape = run("console.log(JSON.stringify({summary:{total:3},version:'1'}));");
  assert.ok(/no file and line pairs; keys: summary, version/.test(shape.stdout) && shape.status === 0);
});

t('CLI: --changed keeps only files git shows as changed; --dry-run downloads nothing; bad usage exits 2; a missing folder exits 1', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q'], { cwd: d });
  put(d, 'src/app.js', 'x'); put(d, 'other.js', 'y');
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init'], { cwd: d });
  put(d, 'other.js', 'changed');
  const scan = { findings: [{ file: 'src/app.js', line: 1, lineContent: 'a' }, { file: 'other.js', line: 2, lineContent: 'b' }] };
  const home = tmp();
  const e = env({ MODERN_WEB_RUNNER: runner(tmp(), `console.log(${JSON.stringify(JSON.stringify(scan))});`), AI_DEV_KIT_HOME: home });
  const ch = spawnSync(process.execPath, [BIN, d, '--changed'], { encoding: 'utf8', env: e });
  assert.ok(/other\.js:2/.test(ch.stdout) && !/src\/app\.js/.test(ch.stdout), ch.stdout);
  const dry = spawnSync(process.execPath, [BIN, d, '--dry-run'], { encoding: 'utf8', env: env({ AI_DEV_KIT_HOME: tmp() }) });
  assert.ok(/would run/.test(dry.stdout) && /nothing was downloaded/.test(dry.stdout) && /modern-web-guidance@1\.0\.0/.test(dry.stdout));
  assert.strictEqual(spawnSync(process.execPath, [BIN, '--bogus'], { encoding: 'utf8' }).status, 2);
  assert.strictEqual(spawnSync(process.execPath, [BIN, path.join(d, 'nope')], { encoding: 'utf8' }).status, 1);
});

t('scan: the runner override skips the Node check; 22.0.0 is new enough, 21.9 is not', () => {
  const d = tmp(); const home = tmp();
  const r = runner(d, "console.log('{\"findings\":[]}');");
  const out = mw.scan(tmp(), { env: { ...process.env, MODERN_WEB_RUNNER: r, AI_DEV_KIT_HOME: home }, nodeVersion: '18.0.0' });
  assert.ok(out.json && !out.skipped, JSON.stringify(out));
  const ok22 = mw.scan(tmp(), { env: { ...process.env, MODERN_WEB_RUNNER: r, AI_DEV_KIT_HOME: home }, nodeVersion: '22.0.0' });
  assert.ok(!ok22.skipped);
  assert.ok(/you have 21\.9\.0/.test(mw.scan(tmp(), { env: { AI_DEV_KIT_HOME: home }, nodeVersion: '21.9.0' }).skipped));
  const none = mw.scan(tmp(), { env: { AI_DEV_KIT_HOME: home }, nodeVersion: '22.0.0' });
  assert.ok(!(none.skipped || '').includes('needs Node 22'));
});

t('extractHits: the rubric falls back from keepWhen to dropWhen to nothing', () => {
  const hit = { file: 'a.js', line: 1, text: 'x' };
  assert.strictEqual(mw.extractHits({ guideId: 'g', keepWhen: ['k1'], dropWhen: ['d1'], hits: [hit] })[0].verify, 'k1');
  assert.strictEqual(mw.extractHits({ guideId: 'g', dropWhen: ['d1'], hits: [hit] })[0].verify, 'd1');
  assert.strictEqual(mw.extractHits({ guideId: 'g', hits: [hit] })[0].verify, '');
});

t('formatTable: a list exactly at the limit has no "more" line', () => {
  const hits = [{ file: 'a.js', line: 1, guide: 'g', text: 'x', retrieve: '', verify: '', note: '' }, { file: 'b.js', line: 2, guide: 'g', text: 'y', retrieve: '', verify: '', note: '' }];
  assert.ok(!/more/.test(mw.formatTable(hits, 2, 2).split('\n').slice(0, -1).join('\n')));
  assert.ok(/\.\.\. and 1 more/.test(mw.formatTable(hits, 1, 2)));
});

t('CLI: bad --limit values exit 2; without --changed every hit shows even in a git repo; empty or vendor-only output is not "unknown shape"', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q'], { cwd: d });
  put(d, 'src/app.js', 'x');
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: d });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'init'], { cwd: d });
  const run = (body, ...a) => spawnSync(process.execPath, [BIN, d, ...a], { encoding: 'utf8', env: env({ MODERN_WEB_RUNNER: runner(tmp(), body), AI_DEV_KIT_HOME: tmp() }) });
  const one = "console.log(JSON.stringify({findings:[{file:'src/app.js',line:1,lineContent:'a'}]}));";
  for (const bad of ['0', 'abc', '1.5', '-2']) assert.strictEqual(run(one, '--limit', bad).status, 2, bad);
  assert.strictEqual(run(one, '--limit', '3').status, 0);
  assert.match(run(one).stdout, /src\/app\.js:1/);
  assert.match(run("console.log('{}');").stdout, /no legacy patterns/);
  assert.match(run("console.log('[]');").stdout, /no legacy patterns/);
  assert.match(run("console.log(JSON.stringify({findings:[{file:'node_modules/x.js',line:1}]}));").stdout, /no legacy patterns/);
  assert.match(run("console.log(JSON.stringify({file:'a.js'}));").stdout, /no legacy patterns/);
});

if (failed) { console.log('modern-web.cli.test: FAILED'); process.exit(1); }
console.log('modern-web.cli.test: ok');
