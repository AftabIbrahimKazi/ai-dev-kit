const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { recon } = require('../skills/standards/security-audit.recon.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'standards', 'security-audit.recon.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'recon space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });

function fixture() {
  const d = proj();
  write(d, 'package.json', JSON.stringify({ dependencies: { express: '4', pg: '8' }, bin: { tool: 'cli.js' } }));
  write(d, 'server.js', [
    "const app = require('express')();",
    "app.get('/users/:id', requireAuth, (req, res) => res.json(db.query('select * from users where id=' + req.params.id)));",
    "app.post('/admin', (req, res) => { exec('ls ' + req.body.dir); res.redirect(req.query.next); });",
    "fetch('https://api.example.com/x');",
    "const key = process.env.API_KEY; const other = process.env['DB_URL'];",
    "const token = '" + ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'].join('_') + "';", // assembled so the kit's own secret gate does not trip on this test
    "// TODO: add auth here",
    "app.use(cors());",
    "el.innerHTML = req.body.html;",
  ].join('\n'));
  write(d, 'app/api/items/route.ts', 'export async function GET() {}');
  write(d, '.env', 'SECRET=1');
  write(d, 'node_modules/x/index.js', "exec('rm -rf')");
  write(d, 'migrations/001.sql', 'create table users();');
  return d;
}

t('inventory: stack, routes, file routes, bins, auth markers, data stores', () => {
  const r = recon(fixture());
  assert.deepStrictEqual(r.stack, ['express']);
  assert.ok(r.routes.some((h) => h.text.startsWith('GET ') && h.file === 'server.js' && h.line === 2));
  assert.ok(r.routes.some((h) => h.text.startsWith('POST ')));
  assert.ok(r.routes.some((h) => h.text === 'GET ' && h.file === 'app/api/items/route.ts') || r.fileRoutes.includes('app/api/items/route.ts'));
  assert.deepStrictEqual(r.entryBins, ['cli.js']);
  assert.strictEqual(r.authMarkers.length, 1);
  assert.ok(r.dataStores.includes('pg') && r.dataStores.includes('migrations'));
});

t('env reads, outbound calls, sinks, secrets masked, obvious things; node_modules skipped', () => {
  const r = recon(fixture());
  assert.deepStrictEqual(Object.keys(r.envReads).sort(), ['API_KEY', 'DB_URL']);
  assert.strictEqual(r.outbound.length, 1);
  assert.ok(r.sinks.shell.length === 1 && r.sinks.shell[0].file === 'server.js');
  assert.ok(r.sinks['sql-string'].length === 1);
  assert.ok(r.sinks.redirect.length === 1);
  assert.ok(r.sinks['html-sink'].length === 1);
  assert.strictEqual(r.secrets.length, 1);
  assert.match(r.secrets[0].text, /GitHub token ghp_… \(44 chars\)/);
  assert.ok(!r.secrets[0].text.includes('abcdefghij'));
  const kinds = r.obvious.map((h) => h.text.split(':')[0]);
  assert.ok(kinds.includes('todo-auth') && kinds.includes('cors-any') && kinds.includes('admin-route'), kinds.join());
  assert.deepStrictEqual(r.envFilesTracked, ['.env']);
});

t('CLI renders sections and the inventory caveat; --json is one document; --top caps lists', () => {
  const d = fixture();
  const out = run(d).stdout;
  assert.match(out, /Entry points \(/);
  assert.match(out, /Sink: shell/);
  assert.match(out, /This is an inventory, not findings/);
  const j = JSON.parse(run(d, '--json').stdout);
  assert.strictEqual(j.files >= 3, true);
  for (let i = 0; i < 20; i++) write(d, 'r' + i + '.js', "app.get('/r" + i + "', h)");
  assert.strictEqual(recon(d, 2).routes.length <= 8, true);
});

t('empty project: every section says none found', () => {
  const out = run(proj()).stdout;
  assert.match(out, /Stack: unknown/);
  assert.ok((out.match(/none found/g) || []).length >= 6);
});

t('bad usage exits 2 with one usage line', () => {
  for (const bad of [['--wat'], ['--top', 'x']]) {
    const r = run(proj(), ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});

t('--summary is a grouped map under 20 lines that names no vulnerability', () => {
  const d = fixture();
  const out = run(d, '--summary').stdout;
  assert.ok(out.split('\n').length < 20, out);
  assert.match(out, /^Recon over \d+ files\. Stack: .*express/);
  assert.match(out, /Entry points: \d+ coded/);
  assert.match(out, /Route files with no auth marker/);
  assert.match(out, /Sink classes: /);
  assert.match(out, /Check first: /);
  assert.match(out, /Inventory only, no findings/);
  assert.ok(!/SQL injection|vulnerab(le|ility) found/i.test(out), out);
  assert.ok(!/^Entry points \(/m.test(out), 'no full inventory in summary mode');
});
t('--summary on an empty project says nothing stands out; bad flag still exits 2', () => {
  const d = proj();
  write(d, 'a.txt', 'x');
  assert.match(run(d, '--summary').stdout, /Check first: nothing stands out/);
  assert.strictEqual(run(d, '--wat').status, 2);
});

t('in a git work tree a gitignored folder is not scanned; outside git the skip list and file cap apply', () => {
  const d = proj();
  const sh = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' });
  sh('init', '-q');
  write(d, 'app.js', "app.get('/ok', (req, res) => res.send('x'));\n");
  write(d, '_sandbox/big/evil.js', "app.get('/hidden', (req, res) => exec(req.query.c));\n");
  write(d, '.gitignore', '_sandbox/\n');
  const r = recon(d);
  assert.strictEqual(r.source, 'git');
  assert.ok(r.routes.some((x) => x.file === 'app.js') && !r.routes.some((x) => x.file.startsWith('_sandbox')), JSON.stringify(r.routes));
  assert.match(run(d).stdout, /Scope: files git tracks or does not ignore/);
  const n = proj();
  write(n, 'app.js', "app.get('/ok', (req, res) => res.send('x'));\n");
  write(n, 'venv/lib/x.js', "app.get('/venv', (req, res) => 1);\n");
  const w = recon(n);
  assert.strictEqual(w.source, 'walk');
  assert.ok(!w.routes.some((x) => x.file.startsWith('venv')));
  assert.match(run(n).stdout, /Scope: every folder except dependency and build folders/);
});
