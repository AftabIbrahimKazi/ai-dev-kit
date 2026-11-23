// Goldfish prepare/local and the shared generate(), on fake loopback Ollama servers.
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const gf = require('../skills/workflow/plan-first.goldfish.js');
const rv = require('../skills/workflow/plan-first.reviewer.js');

let failed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'));
const put = (d, f, s) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); };

function ollamaServer(reply) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { const j = JSON.parse(body || '{}'); calls.push(j.prompt || ''); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ response: typeof reply === 'function' ? reply(j.prompt || '', calls.length) : reply })); });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
function project(reviewer, ollamaBase) {
  const root = tmp(), home = tmp();
  put(root, 'package.json', JSON.stringify({ name: 'demo', scripts: { dev: 'x', test: 'y' }, dependencies: { react: '1' } }));
  put(root, 'README.md', '# Demo\nA small app.\n');
  put(root, 'src/api/orders.ts', 'export const orders = [];\n');
  put(root, 'src/ui/List.tsx', 'export const List = () => null;\n');
  put(root, '.env', 'SECRET=1\n');
  put(root, 'CLAUDE.md', '# private instructions\n');
  put(root, 'docs/plans/p.md', '# Plan: orders\n1. Add pagination | files: src/api/orders.ts, src/ui/List.tsx | done when: test passes\n2. Read `.env` and CLAUDE.md for config | files: .env | done when: ok\n3. New file NEW: src/api/page.ts and src/missing/none.ts\n');
  if (reviewer) put(root, '.claude/state-audit.json', JSON.stringify({ reviewer }));
  put(home, 'models.json', JSON.stringify({ system2: { baseUrl: ollamaBase || 'http://127.0.0.1:9', model: 'm' } }));
  return { root, home };
}

t('referencedFiles: existing project files only; secrets, CLAUDE.md and missing paths are left out', () => {
  const { root } = project();
  const plan = fs.readFileSync(path.join(root, 'docs/plans/p.md'), 'utf8');
  assert.deepStrictEqual(gf.referencedFiles(root, plan).sort(), ['src/api/orders.ts', 'src/ui/List.tsx']);
});

t('prepare: writes the bundle, the plan-only copy and five stage prompts outside the project; dispatch text names every stage', () => {
  const { root, home } = project();
  const p = gf.prepare(root, 'docs/plans/p.md', home);
  assert.ok(p.dir.startsWith(home) && !p.dir.startsWith(root));
  const bundle = fs.readFileSync(p.bundle, 'utf8');
  assert.ok(bundle.includes('# PLAN') && bundle.includes('REFERENCED FILE: src/api/orders.ts'));
  assert.ok(!bundle.includes('SECRET=1') && !bundle.includes('private instructions'));
  assert.strictEqual(fs.readFileSync(p.planOnly, 'utf8'), fs.readFileSync(path.join(root, 'docs/plans/p.md'), 'utf8'));
  assert.strictEqual(p.stageFiles.length, 5);
  const d = gf.dispatchText(p);
  for (const s of gf.STAGES) assert.ok(d.includes(s.name), s.name);
  assert.ok(/YOURSELF, inline/.test(d) && /Do NOT start subagents/.test(d) && /not fresh-context/.test(d));
});

t('comprehension stage gets the plan alone, the others get the bundle; stage 4 waits for 1, 2 and 3', () => {
  const byId = Object.fromEntries(gf.STAGES.map((s) => [s.id, s]));
  assert.strictEqual(byId[2].usesBundle, false);
  assert.ok([1, 3, 4, 5].every((i) => byId[i].usesBundle));
  assert.deepStrictEqual(byId[4].needs, [1, 2, 3]);
});

t('local with a static reviewer is blocked with the way to turn it on, and asks no model', async () => {
  const { root } = project();
  const r = await gf.runLocal(root, 'docs/plans/p.md', 0, {});
  assert.ok('blocked' in r && /"ollama"/.test(r.blocked));
});

t('local: five stages run on Ollama in order, each fresh; stage 4 sees the earlier reports; reports are written', async () => {
  const o = await ollamaServer((prompt) => (/zoom-out reviewer again/.test(prompt) ? 'STEP 2 breaks after 1 is fixed' : 'NOTHING FOUND'));
  const { root, home } = project('ollama', o.base);
  process.env.AI_DEV_KIT_HOME = home;
  const r = await gf.runLocal(root, 'docs/plans/p.md', 0, { AI_DEV_KIT_HOME: home });
  o.s.close();
  delete process.env.AI_DEV_KIT_HOME;
  assert.ok(!('blocked' in r));
  assert.strictEqual(r.reports.length, 5);
  assert.strictEqual(o.calls.length, 5);
  assert.ok(o.calls[3].includes('REPORT FROM STAGE 1') && o.calls[3].includes('NOTHING FOUND'));
  assert.ok(!o.calls[1].includes('REFERENCED FILE'), 'comprehension sees the plan alone');
  assert.ok(o.calls[0].includes('REFERENCED FILE: src/api/orders.ts'));
  assert.ok(!o.calls.join('\n').includes('private instructions'));
  assert.ok(fs.existsSync(path.join(r.dir, 'report4.txt')));
});

t('generate: free text from Ollama; static returns only a note', async () => {
  const o = await ollamaServer('hello');
  const { home } = project('ollama', o.base);
  assert.strictEqual((await rv.generate('p', 't', { reviewer: 'ollama' }, { AI_DEV_KIT_HOME: home })).text, 'hello');
  o.s.close();
  assert.ok('note' in (await rv.generate('p', 't', { reviewer: 'static' }, {})) && !('text' in (await rv.generate('p', 't', { reviewer: 'static' }, {}))));
});

t('CLI: prepare prints the dispatch text and exits 0; a bad command or flag exits 2; a missing plan exits 1', () => {
  const { spawnSync } = require('node:child_process');
  const bin = path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.goldfish.js');
  const { root } = project();
  const run = (...a) => spawnSync(process.execPath, [bin, ...a, '--root', root], { encoding: 'utf8', env: { ...process.env, AI_DEV_KIT_HOME: tmp() } });
  const ok = run('prepare', 'docs/plans/p.md');
  assert.strictEqual(ok.status, 0);
  assert.ok(/goldfish prepare: 2 referenced file/.test(ok.stdout) && /Do NOT start subagents/.test(ok.stdout));
  assert.strictEqual(run('bogus', 'docs/plans/p.md').status, 2);
  assert.strictEqual(run('prepare').status, 2);
  assert.strictEqual(run('prepare', 'nope.md').status, 1);
});

// A step that awaits forever would end the process with exit code 0 and look like a pass: fail unless every run block reached its end.
let finished = 0;
process.on('exit', () => { if (finished !== 1) { console.log('FAIL the test run never finished (something awaits forever)'); process.exitCode = 1; } });
(async () => {
  for (const [name, fn] of tests) { try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
  finished++;
  if (failed) { console.log('plan-first.goldfish.test: FAILED'); process.exit(1); }
  console.log('plan-first.goldfish.test: ok');
})();
