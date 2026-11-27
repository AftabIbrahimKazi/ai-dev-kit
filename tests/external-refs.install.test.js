// End to end: install, update, verify and uninstall of an external tool against a local fixture (no network).
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const LIB = path.join(__dirname, '..');
const CLI = path.join(LIB, 'skills', 'meta', 'install-kit.cli.js');
const REFS = path.join(LIB, 'skills', 'meta', 'install-kit.external.js');
const VERIFY = path.join(LIB, 'skills', 'meta', 'install-kit.verify.js');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'extrefs-'));
const home = path.join(base, 'home');
const proj = path.join(base, 'proj');
const src = path.join(base, 'src');
fs.mkdirSync(home); fs.mkdirSync(proj); fs.mkdirSync(src);
fs.writeFileSync(path.join(src, 'tool.txt'), 'fixture tool');
const zip = path.join(base, 'fixture.zip');
// Minimal stored (uncompressed) zip, so the test needs no zip tool.
function makeZip(file, name, data) {
  const n = Buffer.from(name); const crc = require('node:zlib').crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(n.length, 28);
  const off = lh.length + n.length + data.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length + n.length, 12); end.writeUInt32LE(off, 16);
  fs.writeFileSync(file, Buffer.concat([lh, n, data, cd, n, end]));
}
makeZip(zip, 'tool.txt', Buffer.from('fixture tool'));
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
const entry = (id, hash) => ({ id, name: 'Fixture ' + id, repo: 'https://example.com/' + id, licence: 'MIT', kind: 'release-zip', ref: 'v1.0.0', assetUrl: zip, asset: 'fixture.zip', sha256: hash, marker: 'tool.txt', usedBy: ['test'], detect: 'x', credit: 'Fixture' });
const registry = path.join(base, 'registry.json');
fs.writeFileSync(registry, JSON.stringify({ refs: [entry('fixture', sha), entry('badhash', 'f'.repeat(64))] }));
const env = { ...process.env, AI_DEV_KIT_HOME: home, AI_DEV_KIT_REGISTRY: registry };
const elsewhere = os.tmpdir(); // run from a different cwd on purpose
const run = (file, args) => spawnSync(process.execPath, [file, ...args], { cwd: elsewhere, env, encoding: 'utf8' });
const cli = (args) => run(CLI, [...args, '--library', LIB, '--root', proj, '--tool', 'claude']);
const manifest = () => JSON.parse(fs.readFileSync(path.join(proj, '.ai-dev-kit.json'), 'utf8'));
const toolFile = path.join(home, 'external', 'fixture', 'tool.txt');

t('install --external fetches, records, prints the credit', () => {
  const r = cli(['install', '--skills', 'handover', '--standards', '--context-code', 'TST', '--external', 'fixture']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(toolFile), 'tool not fetched');
  assert.strictEqual(manifest().external.fixture.ref, 'v1.0.0');
  assert.ok(/credit: Fixture/.test(r.stderr), 'credit line missing: ' + r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).verify.ok, true);
});

t('status sees it as present, with its pin', () => {
  const s = JSON.parse(run(REFS, ['status', '--json']).stdout);
  const f = s.find((x) => x.id === 'fixture');
  assert.ok(f.present && f.pinned === 'v1.0.0' && !f.stale);
});

t('update re-fetches when the folder is gone', () => {
  fs.rmSync(path.join(home, 'external', 'fixture'), { recursive: true, force: true });
  const r = cli(['update', '--all']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(toolFile));
});

t('update re-pins when the registry pin moves', () => {
  const moved = { refs: [{ ...entry('fixture', sha), ref: 'v1.1.0' }] };
  fs.writeFileSync(registry, JSON.stringify(moved));
  assert.ok(JSON.parse(run(REFS, ['status', '--json']).stdout)[0].stale, 'should be stale');
  const r = cli(['update', '--all']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(manifest().external.fixture.ref, 'v1.1.0');
  fs.writeFileSync(registry, JSON.stringify({ refs: [entry('fixture', sha), entry('badhash', 'f'.repeat(64))] }));
  assert.strictEqual(cli(['update', '--all', '--force']).status, 0);
});

t('verify fails loudly, exit 1, when the tool is missing', () => {
  fs.rmSync(path.join(home, 'external', 'fixture'), { recursive: true, force: true });
  const r = run(VERIFY, ['--root', proj, '--tool', 'claude']);
  assert.strictEqual(r.status, 1);
  assert.ok(/external tool fixture is recorded but missing/.test(r.stdout), r.stdout);
  assert.strictEqual(cli(['update', '--all']).status, 0); // heals it
  assert.strictEqual(run(VERIFY, ['--root', proj, '--tool', 'claude']).status, 0);
});

t('a hash mismatch installs nothing and exits non-zero', () => {
  const r = cli(['install', '--skills', 'handover', '--external', 'badhash']);
  assert.strictEqual(r.status, 1);
  assert.ok(/hash mismatch/.test(r.stderr), r.stderr);
  assert.ok(!fs.existsSync(path.join(home, 'external', 'badhash')), 'partial install left behind');
  assert.ok(!fs.readdirSync(path.join(home, 'external')).some((d) => d.includes('.tmp-')), 'temp folder left behind');
  assert.ok(!manifest().external.badhash);
});

t('an unknown id fails, it is not ignored', () => {
  const r = cli(['install', '--skills', 'handover', '--external', 'nope']);
  assert.strictEqual(r.status, 1);
  assert.ok(/unknown external tool/.test(r.stderr));
});

t('uninstall drops tracking and keeps the shared folder', () => {
  const r = cli(['uninstall', '--all']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!manifest().external);
  assert.ok(fs.existsSync(toolFile), 'shared folder must survive');
  assert.ok(/shared folder .* kept/.test(r.stdout));
  assert.strictEqual(JSON.parse(run(REFS, ['remove', 'fixture']).stdout).removed, true);
  assert.ok(!fs.existsSync(toolFile));
});

t('a stealth build is refused', () => {
  fs.writeFileSync(registry, JSON.stringify({ refs: [{ ...entry('s', sha), asset: 'x-stealth.zip' }] }));
  const r = run(REFS, ['fetch', 's', '--json']);
  assert.strictEqual(r.status, 1);
  assert.ok(/stealth/.test(r.stdout));
});

fs.rmSync(base, { recursive: true, force: true });
