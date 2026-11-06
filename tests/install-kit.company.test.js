const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const c = require('../skills/meta/install-kit.company.js');
const { doInstall, doUpdate, doUninstall, readManifest } = require('../skills/meta/install-kit.cli.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'company-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const has = (root, rel) => fs.existsSync(path.join(root, rel));
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// A tiny library: one skill, the default standards, and a protocol template with an Active Standards table.
function makeLibrary() {
  const lib = tmp();
  write(lib, 'skills/workflow/handover.md', '---\nname: handover\n---\n# handover\n');
  for (const f of ['index.md', 'css-standards.md', 'html-standards.md', 'design-standards.md', 'accessibility-standards.md', 'ai-standards.md', 'css-standards/token-files.md']) write(lib, 'coding-standards/' + f, '# ' + f + '\n');
  write(lib, 'coding-standards/CLAUDE.example.md',
    '# T\n\nPreamble.\n\n---\n\n# [CLAUDE.md | AGENTS.md] -- [Project]\n\n## Active Standards\n\n| Standard | Active |\n|---|---|\n' +
    '| CSS standard | `coding-standards/css-standards.md` |\n| HTML standard | `coding-standards/html-standards.md` |\n| Accessibility standard | `coding-standards/accessibility-standards.md` |\n' +
    '| Design standard | `coding-standards/design-standards.md` |\n| AI standard | `coding-standards/ai-standards.md` |\n\n## Project-Specific Context\n\n| Property | Value |\n|---|---|\n| Context code | [2-4 chars you choose, e.g. `X7`] |\n| Selector signature | [e.g. `ex-` / `ct-` / `my-`] |\n[CX]\n');
  return lib;
}

// A company doc set shaped like a design system: an instructions file with a routing table, components, patterns, tokens.
function makeCompany() {
  const co = tmp();
  write(co, 'docs/AI-INSTRUCTIONS.md', '---\ntitle: AI Instructions\n---\n# AI Instructions\n\n| If you build | Read |\n|---|---|\n| ANY button or row action | `components/button.md` |\n| ANY form | `patterns/forms.md` |\n| prose | `nonexistent.md` |\n');
  write(co, 'docs/components/button.md', '# Button\n\nButtons trigger actions.\n\n## Rules\n');
  write(co, 'docs/components/input.md', '# Input\n\nText fields.\n');
  write(co, 'docs/components/modal.md', '# Modal\n\nDialogs.\n');
  write(co, 'docs/patterns/forms.md', '# Forms\n\nForm layout.\n');
  write(co, 'docs/patterns/filter-bar.md', '# Filter bar\n\nFilters.\n');
  write(co, 'docs/layout/header.md', '# Header\n\nApp header.\n');
  write(co, 'docs/foundations/tokens.md', '# Tokens\n\nDesign tokens.\n');
  write(co, 'tokens/build/app.css', ':root{}');
  write(co, 'node_modules/x/readme.md', '# ignored\n');
  return co;
}

const install = (lib, root, extra = {}) => doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none', ...extra });

t('scan: titles, summaries, tokens; node_modules and non-md files are not indexed', () => {
  const co = makeCompany();
  const { docs, other } = c.scanCompany(co);
  assert.ok(docs.every((d) => !d.rel.includes('node_modules')));
  assert.strictEqual(other, 1);
  const b = docs.find((d) => d.rel === 'docs/components/button.md');
  assert.strictEqual(b.title, 'Button');
  assert.strictEqual(b.summary, 'Buttons trigger actions.');
  assert.ok(b.tokens > 0);
});

t('routes: a company routing table is imported; rows that do not resolve to exactly one file are dropped', () => {
  const co = makeCompany();
  const { docs } = c.scanCompany(co);
  assert.deepStrictEqual(c.importRoutes(docs, co).map((r) => r.rel), ['docs/components/button.md', 'docs/patterns/forms.md']);
});

t('auto-detect: design is covered and droppable; a partial mention keeps the default; protected ones are never dropped', () => {
  const { docs } = c.scanCompany(makeCompany());
  const f = Object.fromEntries(c.detectOverlap(docs).map((x) => [x.key, x]));
  assert.strictEqual(f.design.drop, true);
  assert.strictEqual(f.css.drop, false);
  assert.strictEqual(f.accessibility.drop, false);
  const more = [...docs, { rel: 'a11y/accessibility-rules.md', title: 'Accessibility rules', summary: '', tokens: 1, headings: [] }, { rel: 'a11y/wcag.md', title: 'WCAG', summary: '', tokens: 1, headings: [] }];
  const a = c.detectOverlap(more).find((x) => x.key === 'accessibility');
  assert.strictEqual(a.verdict, 'covered');
  assert.strictEqual(a.drop, false);
});

t('auto-detect: a file merely written for AI agents does not count as an AI standard', () => {
  const docs = [{ rel: 'AI-INSTRUCTIONS.md', title: 'AI Instructions for UI Work', summary: '', tokens: 1, headings: [] }, { rel: 'start.md', title: 'How to use this standard for AI tools', summary: '', tokens: 1, headings: [] }];
  assert.strictEqual(c.detectOverlap(docs).find((x) => x.key === 'ai').drop, false);
});

t('install with company: folder, index, skill, protocol block, manifest; defaults kept in keep mode', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  const r = install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  assert.ok(has(root, 'coding-standards/company/INDEX.md'));
  assert.ok(has(root, 'coding-standards/company/docs/components/button.md'));
  assert.ok(has(root, '.claude/skills/company-standards/SKILL.md'));
  assert.ok(has(root, 'coding-standards/design-standards.md'));
  assert.match(read(root, 'CLAUDE.md'), /ai-dev-kit:company-standards:start/);
  assert.match(read(root, 'coding-standards/company/INDEX.md'), /ANY button or row action/);
  assert.strictEqual(readManifest(root).company.mode, 'keep');
  assert.ok(r.verify.ok, JSON.stringify(r.verify.findings));
});

t('auto mode drops only the covered default (files and its row); update does not bring it back', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'auto' });
  assert.ok(!has(root, 'coding-standards/design-standards.md'));
  assert.ok(has(root, 'coding-standards/css-standards.md'));
  const body = read(root, 'CLAUDE.md');
  assert.ok(!body.includes('| Design standard |'));
  assert.ok(body.includes('| CSS standard |'));
  doUpdate({ library: lib, root, tool: 'claude', skills: [], all: true });
  assert.ok(!has(root, 'coding-standards/design-standards.md'));
});

t('drop mode: no default standards at all, company folder only, install stays verified', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  const r = install(lib, root, { company: true, companyFrom: co, companyDefaults: 'drop' });
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'coding-standards')), ['company']);
  assert.strictEqual(r.standards, null);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.findings));
});

t('sync switches mode both ways and restores what it removed (files and rows)', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  c.doCompanySync({ library: lib, root, companyDefaults: 'drop' });
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'coding-standards')), ['company']);
  c.doCompanySync({ library: lib, root, companyDefaults: 'keep' });
  for (const f of ['index.md', 'css-standards.md', 'design-standards.md', 'css-standards/token-files.md']) assert.ok(has(root, 'coding-standards/' + f), f);
  const body = read(root, 'CLAUDE.md');
  for (const label of ['CSS standard', 'HTML standard', 'Design standard', 'AI standard']) assert.ok(body.includes(`| ${label} |`), label);
});

t('remove: generated files go, defaults come back, the company files stay; --purge deletes them', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'auto' });
  const r = c.doCompanyRemove({ library: lib, root });
  assert.ok(!has(root, 'coding-standards/company/INDEX.md'));
  assert.ok(!has(root, '.claude/skills/company-standards'));
  assert.ok(has(root, 'coding-standards/design-standards.md'));
  assert.ok(has(root, 'coding-standards/company/docs/components/button.md'));
  assert.ok(!read(root, 'CLAUDE.md').includes('company-standards:start'));
  assert.ok(read(root, 'CLAUDE.md').includes('| Design standard |'));
  assert.strictEqual(readManifest(root).company, undefined);
  assert.ok(r.kept.some((k) => /left in place/.test(k)));
  c.doCompanySync({ library: lib, root, companyDefaults: 'keep' });
  c.doCompanyRemove({ library: lib, root, purge: true });
  assert.ok(!has(root, 'coding-standards/company'));
});

t('uninstall --remove-standards never deletes the company files', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  doUninstall({ library: lib, root, skills: [], all: true, removeStandards: true });
  assert.ok(!has(root, 'coding-standards/css-standards.md'));
  assert.ok(has(root, 'coding-standards/company/docs/components/button.md'));
  assert.ok(!has(root, 'coding-standards/company/INDEX.md'));
});

t('a company-only protocol file the step created is removed with it', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'drop' });
  assert.ok(has(root, 'CLAUDE.md'));
  c.doCompanyRemove({ library: lib, root, purge: true });
  assert.ok(!has(root, 'CLAUDE.md'));
  assert.ok(!has(root, 'coding-standards'));
});

t('auto with an empty folder keeps every default and says so', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = install(lib, root, { company: true, companyDefaults: 'auto' });
  assert.deepStrictEqual(r.company.dropped, []);
  assert.ok(r.company.notes.some((n) => /nothing to read/.test(n)));
  assert.ok(has(root, 'coding-standards/design-standards.md'));
});

// ---- cli-writer checklist: dry run, no silent overwrite, usage on a missing root, re-run is safe, skill description cap ----
const { spawnSync } = require('node:child_process');
const CLI = path.join(__dirname, '../skills/meta/install-kit.cli.js');
const cli = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8', input: '' });
const snapshot = (root) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : out.push(path.relative(root, p) + ':' + fs.statSync(p).size); } }; walk(root); return out.sort().join('|'); };

t('--dry-run on sync and remove reports the plan and writes nothing', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: false });
  const before = snapshot(root);
  const r = c.doCompanySync({ library: lib, root, companyFrom: co, companyDefaults: 'auto', dryRun: true });
  assert.ok(r.notes.some((n) => /dry run: nothing was written/.test(n)));
  assert.ok(r.notes.some((n) => /would remove \d+ installed default/.test(n)));
  assert.ok(r.findings && r.dropped.includes('design'));
  assert.strictEqual(snapshot(root), before);
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'auto' });
  const mid = snapshot(root);
  const rm = c.doCompanyRemove({ library: lib, root, dryRun: true });
  assert.ok(rm.kept.some((k) => /dry run/.test(k)) && rm.removed.length);
  assert.strictEqual(snapshot(root), mid);
});

t('--company-from leaves a differing existing file alone and says so; --force overwrites it', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  const mine = path.join(root, 'coding-standards/company/docs/components/button.md');
  fs.writeFileSync(mine, '# my edited button rules\n');
  const r = c.doCompanySync({ library: lib, root, companyFrom: co });
  assert.strictEqual(fs.readFileSync(mine, 'utf8'), '# my edited button rules\n');
  assert.ok(r.notes.some((n) => /1 existing file differ.*left alone.*--force/.test(n)), JSON.stringify(r.notes));
  c.doCompanySync({ library: lib, root, companyFrom: co, force: true });
  assert.match(fs.readFileSync(mine, 'utf8'), /Buttons trigger actions/);
});

t('a second sync changes nothing in the generated files', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'auto' });
  const gen = () => ['coding-standards/company/INDEX.md', '.claude/skills/company-standards/SKILL.md', 'CLAUDE.md'].map((f) => read(root, f)).join('\n--\n');
  const a = gen();
  c.doCompanySync({ library: lib, root });
  assert.strictEqual(gen(), a);
});

t('the company command with no --root prints one usage line and exits 2 (no prompt, no stack trace)', () => {
  const r = cli('company', 'sync');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: install-kit\.cli\.js company/);
  assert.ok(!/at .*\.js:\d+/.test(r.stderr));
});

t('--dry-run on any other command is refused, never run for real', () => {
  const root = tmp();
  const r = cli('install', '--root', root, '--tool', 'claude', '--library', path.join(__dirname, '..'), '--skills', 'handover', '--dry-run');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--dry-run is supported by the company and signature commands only/);
  assert.ok(!has(root, '.ai-dev-kit.json'));
});

t('the generated skill description stays within the 40-word cap', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  const desc = /^description: (.*)$/m.exec(read(root, '.claude/skills/company-standards/SKILL.md'))[1];
  assert.ok(desc.split(/\s+/).length <= 40, desc.split(/\s+/).length + ' words');
  assert.match(read(root, '.claude/skills/company-standards/SKILL.md'), /## Self-improvement/);
});
