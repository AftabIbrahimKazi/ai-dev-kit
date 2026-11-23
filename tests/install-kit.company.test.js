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

t('company-only path: the CX rule block carries the Context code, verify checks it, sync keeps it', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  const r = install(lib, root, { company: true, companyFrom: co, companyDefaults: 'drop', contextCode: 'X7' });
  const body = read(root, 'CLAUDE.md');
  assert.ok(body.includes('Begin every response with `[CX X7]`') && /\| Context code \| X7 \|/.test(body));
  assert.ok(r.verify.ok, JSON.stringify(r.verify.findings));
  c.doCompanySync({ library: lib, root, companyDefaults: 'drop' });
  assert.ok(read(root, 'CLAUDE.md').includes('[CX X7]'));
  assert.strictEqual((read(root, 'CLAUDE.md').match(/ai-dev-kit:cx:start/g) || []).length, 1);
});

t('company-only path: verify fails when the CX block is stripped', () => {
  const lib = makeLibrary(); const root = tmp(); const co = makeCompany();
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'drop', contextCode: 'none' });
  const p = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<!-- ai-dev-kit:cx:start -->[\s\S]*?<!-- ai-dev-kit:cx:end -->/, ''));
  const v = require('../skills/meta/install-kit.verify.js').verify({ root, tool: 'claude' });
  assert.ok(!v.ok && v.findings.some((f) => f.check === 'session-protocol' && /CX/.test(f.message)), JSON.stringify(v.findings));
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

// ---- gaps found by `invariants probe` on install-kit.company.js ----
// Regenerate the golden on purpose with UPDATE_GOLDEN=1 node tests/install-kit.company.test.js, then read the diff.
const BSL = String.fromCharCode(92), CRL = String.fromCharCode(13);
const cleanJson = (v, roots) => {
	let out = JSON.stringify(v, null, 1).split(BSL + BSL).join('/').split(CRL).join('');
	for (const [r, name] of roots) out = out.split(r.split(BSL).join('/')).join(name);
	return out;
};
const listDir = (root, rel) => { const abs = path.join(root, rel); const acc = []; const go = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? go(p) : acc.push(path.relative(abs, p).split(BSL).join('/')); } }; go(abs); return acc.sort(); };

// A company set that overlaps many disciplines: dedicated css, html, accessibility, git and qa docs, plus a design system
// big enough to count as a replacement, and a data-ct- signature used in several files.
function makeRichCompany() {
	const co = tmp();
	write(co, 'docs/AI-INSTRUCTIONS.md', '# AI Instructions\n\n| If you build | Read |\n|---|---|\n| ANY button | `components/button.md` |\n| ANY form | `patterns/forms.md` |\n');
	for (const [rel, body] of Object.entries({
		'components/button.md': '# Button\n\nA component. Use data-ct-role and data-ct-kind. See CtButton and CtIcon.\n',
		'components/input.md': '# Input component\n\nUse data-ct-field. CtInput wraps it.\n',
		'components/modal.md': '# Modal component\n\nUse data-ct-open. CtModal.\n',
		'patterns/forms.md': '# Forms pattern\n\nLayout of a form.\n', 'patterns/filter-bar.md': '# Filter bar pattern\n\nNavigation filters.\n',
		'layout/header.md': '# Header layout\n\nApp header.\n', 'foundations/tokens.md': '# Design tokens\n\nTheming tokens.\n',
		'css.md': '# CSS rules\n\nSelectors, specificity and BEM names.\n', 'css-naming.md': '# CSS naming\n\nStylesheet selectors.\n',
		'html.md': '# HTML rules\n\nSemantic element use and markup.\n', 'html-forms.md': '# HTML forms\n\nMarkup for forms.\n',
		'accessibility.md': '# Accessibility\n\nWCAG and ARIA.\n', 'a11y-checks.md': '# A11y checks\n\nWCAG checks.\n',
		'git-flow.md': '# Git flow\n\nBranch and commit rules.\n', 'git-review.md': '# Git review\n\nPull request rules.\n',
		'qa/checklist.md': '# QA checklist\n\nDefinition of done and test plan.\n', 'qa/e2e.md': '# E2E\n\nE2E QA tests.\n',
		'seo.md': '# SEO\n\nSitemap only.\n', 'notes.md': '# Notes\n\nPlain notes.\n', 'readme-sample.txt': 'not markdown',
	})) write(co, 'docs/' + rel, body);
	write(co, 'node_modules/x/readme.md', '# ignored\n');
	return co;
}

t('golden: company scan, routes, overlap, signature and sync in each defaults mode', () => {
	const co = makeRichCompany();
	const dir = path.join(co, 'docs');
	const scan = c.scanCompany(dir);
	const out = { scan, routes: c.importRoutes(scan.docs, dir), overlap: c.detectOverlap(scan.docs), signature: c.detectSignature(scan.docs, dir), omitted: [c.isOmitted('css-standards.md', ['css-standards.md']), c.isOmitted('x.md', ['css-standards.md']), c.isOmitted('css-standards/a.md', ['css-standards/'])] };
	out.modes = {};
	for (const mode of ['keep', 'drop', 'auto']) {
		const lib = makeLibrary(); const root = tmp();
		doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
		const roots = [[root, '<root>'], [co, '<co>'], [lib, '<lib>']];
		const dry = c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: dir, companyDefaults: mode, dryRun: true });
		const dryWrote = listDir(root, 'coding-standards/company');
		const sync = c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: dir, companyDefaults: mode });
		const refreshed = c.doCompanySync({ library: lib, root, tool: 'claude' });
		const status = c.companyStatus(root);
		const files = { standards: listDir(root, 'coding-standards'), index: fs.existsSync(path.join(root, 'coding-standards/company/INDEX.md')) ? read(root, 'coding-standards/company/INDEX.md') : null, protocol: read(root, 'CLAUDE.md') };
		const removed = c.doCompanyRemove({ library: lib, root, tool: 'claude' });
		const after = { standards: listDir(root, 'coding-standards'), status: c.companyStatus(root), protocol: read(root, 'CLAUDE.md') };
		out.modes[mode] = JSON.parse(cleanJson({ dry, dryWrote, sync, refreshed, status, files, removed, after }, roots));
	}
	const file = path.join(__dirname, 'fixtures', 'company', 'sync.json');
	const text = JSON.stringify(out, null, 1) + '\n';
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return; }
	assert.ok(fs.existsSync(file), 'missing golden (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs.readFileSync(file, 'utf8').split(CRL).join(''));
});

t('company remove with --purge deletes the company folder; without it the folder stays', () => {
	const co = makeRichCompany(); const dir = path.join(co, 'docs');
	for (const purge of [false, true]) {
		const lib = makeLibrary(); const root = tmp();
		doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
		c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: dir, companyDefaults: 'auto' });
		c.doCompanyRemove({ library: lib, root, tool: 'claude', purge });
		assert.strictEqual(fs.existsSync(path.join(root, 'coding-standards', 'company')), !purge, 'purge ' + purge);
	}
});

// ---- second round: the survivors left after the golden ----
const docsOf = (files) => { const d = tmp(); for (const [rel, body] of Object.entries(files)) write(d, rel, body); return { d, scan: c.scanCompany(d) }; };

t('doc titles come from the first top-level heading; summaries and route triggers are clipped at their limits', () => {
	const sum110 = 'a'.repeat(110), sum111 = 'b'.repeat(111);
	const { scan } = docsOf({ 'sub-first.md': '## Sub heading\n\n# Real title\n\nbody text here\n', 'two-h1.md': '# First\n\n# Second\n\ntext\n', 's110.md': '# S\n\n' + sum110 + '\n', 's111.md': '# S\n\n' + sum111 + '\n' });
	const by = Object.fromEntries(scan.docs.map((d) => [d.rel, d]));
	assert.strictEqual(by['sub-first.md'].title, 'Real title');
	assert.strictEqual(by['two-h1.md'].title, 'First');
	assert.strictEqual(by['s110.md'].summary, sum110);
	assert.strictEqual(by['s111.md'].summary, 'b'.repeat(109) + '\u2026');
	const t100 = 'x'.repeat(100), t101 = 'y'.repeat(101);
	const r = docsOf({ 'components/a.md': '# A\n', 'components/b.md': '# B\n', 'AI.md': '| If you build | Read |\n|---|---|\n| ' + t100 + ' | components/a.md |\n| ' + t101 + ' | components/b.md |\n' });
	const routes = c.importRoutes(r.scan.docs, r.d);
	assert.deepStrictEqual(routes.map((x) => x.trigger), [t100, 'y'.repeat(99) + '\u2026']);
});

t('route table paths match a document by full path, by suffix, or by a longer prefixed path, and only when unique', () => {
	const { d, scan } = docsOf({ 'AI.md': '| If you build | Read |\n|---|---|\n| a modal | modal.md |\n| an input | docs/components/input.md |\n| a button | components/button.md |\n| a clash | notes.md |\n', 'components/modal.md': '# Modal\n', 'components/input.md': '# Input\n', 'components/button.md': '# Button\n', 'a/notes.md': '# N1\n', 'b/notes.md': '# N2\n' });
	const routes = c.importRoutes(scan.docs, d);
	assert.deepStrictEqual(routes.map((x) => x.trigger + ' -> ' + x.rel).sort(), ['a button -> components/button.md', 'a modal -> components/modal.md', 'an input -> components/input.md']);
});

t('the project signature needs three uses in two files', () => {
	const sig = (files) => { const { d, scan } = docsOf(files); return c.detectSignature(scan.docs, d); };
	assert.deepStrictEqual(sig({ 'a.md': 'data-ct-a data-ct-b', 'b.md': 'data-ct-c' }), { alias: 'ct', attrs: 3, components: 0 });
	assert.strictEqual(sig({ 'a.md': 'data-ct-a', 'b.md': 'data-ct-b' }), null);
	assert.strictEqual(sig({ 'a.md': 'data-ct-a data-ct-b data-ct-c' }), null);
});

t('ensureCxBlock adds the block once, reports a change only when it wrote, and leaves a template placeholder alone', () => {
	const root = tmp();
	assert.strictEqual(c.ensureCxBlock(root, 'CLAUDE.md', 'ab'), true, 'creates the protocol file with the block');
	assert.ok(read(root, 'CLAUDE.md').includes('ai-dev-kit:cx:start'));
	assert.strictEqual(c.ensureCxBlock(root, 'CLAUDE.md', 'ab'), false, 'second call changes nothing');
	assert.strictEqual(c.ensureCxBlock(root, 'CLAUDE.md', 'cd'), true, 'a new code rewrites it');
	const tpl = tmp(); write(tpl, 'CLAUDE.md', '# T\n\n| Context code | [CX] |\n');
	assert.strictEqual(c.ensureCxBlock(tpl, 'CLAUDE.md', 'ab'), false);
	assert.ok(!read(tpl, 'CLAUDE.md').includes('ai-dev-kit:cx:start'));
});

t('company standards follow a protocol file other than CLAUDE.md, and a missing Active Standards table is survived', () => {
	const co = makeRichCompany(); const dir = path.join(co, 'docs');
	const lib = makeLibrary(); const root = tmp();
	doInstall({ library: lib, root, tool: 'codex', skills: ['handover'], standards: true, contextCode: 'none' });
	const proto = readManifest(root).protocolFile;
	assert.strictEqual(proto, 'AGENTS.md');
	c.doCompanySync({ library: lib, root, tool: 'codex', companyFrom: dir, companyDefaults: 'auto' });
	assert.ok(read(root, 'AGENTS.md').includes('## Company Standards'), 'block written to AGENTS.md');
	assert.ok(!has(root, 'CLAUDE.md'), 'no CLAUDE.md invented');
	const body = read(root, 'AGENTS.md');
	fs.writeFileSync(path.join(root, 'AGENTS.md'), body.replace(/## Active Standards[\s\S]*?(?=\n## )/, ''));
	assert.doesNotThrow(() => c.doCompanyRemove({ library: lib, root, tool: 'codex' }));
	assert.ok(!read(root, 'AGENTS.md').includes('## Company Standards'), 'block removed from AGENTS.md');
});

t('company remove with nothing installed does nothing; with a record but a deleted folder it still cleans up', () => {
	const lib = makeLibrary(); const root = tmp();
	doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
	const before = read(root, 'CLAUDE.md');
	const none = c.doCompanyRemove({ library: lib, root, tool: 'claude' });
	assert.deepStrictEqual([none.removed, none.restored], [[], []]);
	assert.strictEqual(read(root, 'CLAUDE.md'), before);
	const co = makeRichCompany();
	c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: path.join(co, 'docs'), companyDefaults: 'auto' });
	fs.rmSync(path.join(root, 'coding-standards', 'company'), { recursive: true });
	const r = c.doCompanyRemove({ library: lib, root, tool: 'claude' });
	assert.ok(r.removed.length > 0, JSON.stringify(r));
	assert.ok(!read(root, 'CLAUDE.md').includes('## Company Standards'));
});

t('the generated company README names the sync command and the project placeholder', () => {
	const co = makeRichCompany(); const lib = makeLibrary(); const root = tmp();
	doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
	c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: path.join(co, 'docs'), companyDefaults: 'keep' });
	assert.ok(read(root, 'coding-standards/company/README.md').includes('company sync --root <your-project>'));
});

// ---- third round: README line and repeat sync ----
t('the company README shows the full sync command, and syncing twice in auto mode changes nothing the second time', () => {
	const co = makeRichCompany(); const dir = path.join(co, 'docs'); const lib = makeLibrary(); const root = tmp();
	doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none' });
	c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: dir, companyDefaults: 'auto' });
	assert.ok(read(root, 'coding-standards/company/README.md').includes('node <ai-dev-kit>/skills/meta/install-kit.cli.js company sync --root <your-project>'));
	const once = read(root, 'CLAUDE.md'); const listing = fs.readdirSync(path.join(root, 'coding-standards')).sort();
	c.doCompanySync({ library: lib, root, tool: 'claude', companyFrom: dir, companyDefaults: 'auto' });
	assert.strictEqual(read(root, 'CLAUDE.md'), once, 'a second identical sync leaves the protocol file alone');
	assert.deepStrictEqual(fs.readdirSync(path.join(root, 'coding-standards')).sort(), listing);
});
