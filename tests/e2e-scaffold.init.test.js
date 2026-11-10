const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { detect, status, init, readTemplates } = require('../skills/workflow/e2e-scaffold.init.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'workflow', 'e2e-scaffold.init.js');
const SKILL_DIR = path.join(__dirname, '..', 'skills', 'workflow');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'e2e space-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const run = (cwd, ...a) => spawnSync(process.execPath, [CLI, ...a, '--cwd', cwd], { encoding: 'utf8' });
const pkg = (extra) => JSON.stringify({ name: 'x', scripts: { dev: 'astro dev' }, devDependencies: { typescript: '5' }, ...extra }, null, 2) + '\n';

t('templates companion parses into three files', () => {
  const tpl = readTemplates(SKILL_DIR);
  assert.deepStrictEqual(Object.keys(tpl).sort(), ['playwright.config.ts', 'tests/e2e/fixtures.ts', 'tests/e2e/smoke.spec.ts']);
  assert.match(tpl['playwright.config.ts'], /\{\{PORT\}\}/);
});

t('detect: framework, port, package manager, playwright presence', () => {
  const d = proj();
  write(d, 'package.json', pkg({}));
  write(d, 'pnpm-lock.yaml', '');
  const s = detect(d);
  assert.strictEqual(s.framework, 'astro');
  assert.strictEqual(s.port, 4321);
  assert.strictEqual(s.manager, 'pnpm');
  assert.strictEqual(s.devCommand, 'pnpm dev');
  assert.strictEqual(s.playwright, false);
  assert.strictEqual(s.typescript, true);
});

t('detect: an explicit --port in the script and a port in vite.config win over the default', () => {
  const d = proj();
  write(d, 'package.json', JSON.stringify({ scripts: { dev: 'vite --port 3100' } }));
  assert.strictEqual(detect(d).port, 3100);
  const e = proj();
  write(e, 'package.json', JSON.stringify({ scripts: { dev: 'vite' } }));
  write(e, 'vite.config.ts', 'export default { server: { port: 8081 } }');
  assert.strictEqual(detect(e).port, 8081);
});

t('init writes the three files, wires package.json and .gitignore, names the install command', () => {
  const d = proj();
  write(d, 'package.json', pkg({}));
  write(d, '.gitignore', 'node_modules\n');
  const r = init(d, { templatesDir: SKILL_DIR });
  assert.deepStrictEqual(r.wrote.sort(), ['playwright.config.ts', 'tests/e2e/fixtures.ts', 'tests/e2e/smoke.spec.ts']);
  const cfg = fs.readFileSync(path.join(d, 'playwright.config.ts'), 'utf8');
  assert.match(cfg, /const PORT = 4321;/);
  assert.match(cfg, /command: 'npm run dev'/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).scripts['test:e2e'], 'playwright test');
  assert.match(fs.readFileSync(path.join(d, '.gitignore'), 'utf8'), /\/playwright-report/);
  assert.match(r.install, /npm i -D @playwright\/test && npx playwright install chromium/);
});

t('a second init is refused with exit 3; status reports the scaffold', () => {
  const d = proj();
  write(d, 'package.json', pkg({}));
  init(d, { templatesDir: SKILL_DIR });
  const r = run(d, 'init');
  assert.strictEqual(r.status, 3);
  assert.match(r.stderr, /already present/);
  assert.strictEqual(status(d).scaffolded, true);
  assert.match(run(d, 'status').stdout, /scaffold present/);
});

t('--dry-run writes nothing; --port and --command override detection; JS project gets .js files', () => {
  const d = proj();
  write(d, 'package.json', JSON.stringify({ scripts: { start: 'node server.js' } }));
  const r = run(d, 'init', '--dry-run', '--port', '9000', '--command', 'npm start');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /would write playwright\.config\.js/);
  assert.match(r.stdout, /port 9000/);
  assert.ok(!fs.existsSync(path.join(d, 'playwright.config.js')));
  assert.ok(!fs.existsSync(path.join(d, '.gitignore')));
});

t('no package.json and no --command is an error; playwright already installed means no install line', () => {
  const d = proj();
  const r = run(d, 'init');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--command/);
  const e = proj();
  write(e, 'package.json', pkg({ devDependencies: { '@playwright/test': '1', typescript: '5' } }));
  assert.strictEqual(init(e, { templatesDir: SKILL_DIR }).install, null);
});

t('--json prints one document; bad usage exits 2', () => {
  const d = proj();
  write(d, 'package.json', pkg({}));
  const j = JSON.parse(run(d, 'status', '--json').stdout);
  assert.strictEqual(j.stack.framework, 'astro');
  for (const bad of [['nope'], ['init', '--port', 'x'], ['status', '--wat']]) {
    const r = run(d, ...bad);
    assert.strictEqual(r.status, 2, bad.join(' '));
    assert.strictEqual(r.stderr.trim().split('\n').length, 1);
  }
});
