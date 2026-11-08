const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sig = require('../skills/meta/install-kit.signature.js');
const company = require('../skills/meta/install-kit.company.js');
const { doInstall, doUpdate, doUninstall, readManifest } = require('../skills/meta/install-kit.cli.js');
const { checkText, RULES } = require('../skills/standards/code-audit.audit.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sig-'));
const write = (root, rel, text) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const ROW = '| Selector signature | [e.g. `ex-` / `ct-` / `my-`] |';
const CLI = path.join(__dirname, '../skills/meta/install-kit.cli.js');
const cli = (...a) => spawnSync('node', [CLI, ...a], { encoding: 'utf8', input: '' });
const AUDIT = path.join(__dirname, '../skills/standards/code-audit.audit.js');

function makeLibrary() {
  const lib = tmp();
  write(lib, 'skills/workflow/handover.md', '---\nname: handover\n---\n# handover\n');
  write(lib, 'coding-standards/index.md', '# index\n');
  write(lib, 'coding-standards/CLAUDE.example.md',
    '# T\n\nPreamble.\n\n---\n\n# [CLAUDE.md | AGENTS.md] -- [Project]\n\n## Project-Specific Context\n\n| Property | Value |\n|---|---|\n| Context code | [x] |\n' + ROW + '\n[CX]\n');
  return lib;
}
const install = (lib, root, extra = {}) => doInstall({ library: lib, root, tool: 'claude', skills: ['handover'], standards: true, contextCode: 'none', ...extra });

t('one alias derives the three places; the alias is validated', () => {
  assert.deepStrictEqual(sig.sigForms('abc'), { selector: 'abc-', data: 'data-abc-', component: 'Abc' });
  assert.strictEqual(sig.normalizeAlias('ABC-'), 'abc');
  for (const bad of ['a', '1ab', 'a_b', 'toolongname', '']) assert.throws(() => sig.normalizeAlias(bad), /2 to 6 letters or digits/);
});

t('install with a chosen alias stores it once and fills the project table row; verify still passes', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = install(lib, root, { signature: 'abc' });
  assert.strictEqual(readManifest(root).signature.alias, 'abc');
  assert.match(read(root, 'CLAUDE.md'), /\| Selector signature \| `abc-` \(set at install: data attributes `data-abc-`, shared components `Abc`\) \|/);
  assert.ok(r.verify.ok, JSON.stringify(r.verify.findings));
});

t('no alias, or "none": nothing is written and the row stays as the template has it', () => {
  const lib = makeLibrary();
  for (const extra of [{}, { signature: 'none' }]) {
    const root = tmp();
    install(lib, root, extra);
    assert.strictEqual(readManifest(root).signature, undefined);
    assert.ok(read(root, 'CLAUDE.md').includes(ROW));
  }
});

t('the alias is the user\'s choice: any valid alias works, nothing is hard-coded', () => {
  const lib = makeLibrary();
  for (const a of ['zq', 'ct', 'acme']) {
    const root = tmp();
    install(lib, root, { signature: a });
    assert.ok(read(root, 'CLAUDE.md').includes('`' + a + '-`'));
  }
});

t('changing the alias keeps the original row; removing restores it exactly', () => {
  const lib = makeLibrary(); const root = tmp();
  install(lib, root, { signature: 'abc' });
  sig.setSignature(root, 'xyz');
  assert.ok(read(root, 'CLAUDE.md').includes('`xyz-`') && !read(root, 'CLAUDE.md').includes('abc'));
  assert.match(readManifest(root).signature.row, /\[e\.g\. `ex-`/);
  const r = sig.setSignature(root, 'none');
  assert.ok(read(root, 'CLAUDE.md').includes(ROW));
  assert.strictEqual(readManifest(root).signature, undefined);
  assert.match(r.notes.join(' '), /removed/);
});

t('--dry-run reports and writes nothing', () => {
  const lib = makeLibrary(); const root = tmp();
  install(lib, root);
  const before = read(root, 'CLAUDE.md'); const m = fs.readFileSync(path.join(root, '.ai-dev-kit.json'), 'utf8');
  const r = sig.setSignature(root, 'abc', true);
  assert.match(r.notes.join(' '), /would set the signature abc/);
  assert.strictEqual(read(root, 'CLAUDE.md'), before);
  assert.strictEqual(fs.readFileSync(path.join(root, '.ai-dev-kit.json'), 'utf8'), m);
});

t('update keeps the signature; uninstall --all gives the row back', () => {
  const lib = makeLibrary(); const root = tmp();
  install(lib, root, { signature: 'abc' });
  doUpdate({ library: lib, root, tool: 'claude', skills: [], all: true });
  assert.strictEqual(readManifest(root).signature.alias, 'abc');
  doUninstall({ library: lib, root, skills: [], all: true });
  assert.ok(read(root, 'CLAUDE.md').includes(ROW));
  assert.strictEqual(readManifest(root).signature, undefined);
});

t('the signature works without any company standards, and with them it joins the block and the index', () => {
  const lib = makeLibrary(); const root = tmp();
  const co = tmp();
  write(co, 'docs/a.md', '# A\n\nUse `data-zq-page` and `data-zq-theme` and `data-zq-x`; ZqButton, ZqInput, ZqSelect.\n');
  write(co, 'docs/b.md', '# B\n\n`data-zq-collapsed` and `data-zq-filter`.\n');
  const r = install(lib, root, { signature: 'mine', company: true, companyFrom: co, companyDefaults: 'keep' });
  assert.match(read(root, 'CLAUDE.md'), /Signature `mine`\*\* \(chosen at install\)/);
  assert.match(read(root, 'coding-standards/company/INDEX.md'), /Signature `mine`/);
  // the user already chose, so the company's own prefix is neither applied nor suggested
  assert.ok(!read(root, 'CLAUDE.md').includes('`zq-`'));
  assert.ok(!r.company.notes.some((n) => /use the prefix/.test(n)), JSON.stringify(r.company.notes));
});

t('with no alias chosen, the company docs\' prefix is only a hint: reported, never applied', () => {
  const lib = makeLibrary(); const root = tmp(); const co = tmp();
  write(co, 'docs/a.md', '# A\n\nUse `data-zq-page` and `data-zq-theme` and `data-zq-x`; ZqButton, ZqInput, ZqSelect.\n');
  write(co, 'docs/b.md', '# B\n\n`data-zq-collapsed` and `data-zq-filter`.\n');
  const r = install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  assert.ok(r.company.notes.some((n) => /use the prefix "zq".*your choice.*signature set zq/.test(n)), JSON.stringify(r.company.notes));
  assert.strictEqual(readManifest(root).signature, undefined);
  assert.ok(read(root, 'CLAUDE.md').includes(ROW));
});

t('"signature set" after a company install refreshes the block; remove takes it out again', () => {
  const lib = makeLibrary(); const root = tmp();
  const co = tmp(); write(co, 'docs/a.md', '# A\n\ntext\n');
  install(lib, root, { company: true, companyFrom: co, companyDefaults: 'keep' });
  assert.ok(!read(root, 'CLAUDE.md').includes('Signature `'));
  assert.strictEqual(cli('signature', 'set', 'abc', '--root', root).status, 0);
  assert.match(read(root, 'CLAUDE.md'), /Signature `abc`/);
  assert.strictEqual(cli('signature', 'remove', '--root', root).status, 0);
  assert.ok(!read(root, 'CLAUDE.md').includes('Signature `'));
  assert.ok(read(root, 'CLAUDE.md').includes(ROW));
});

t('the signature command: usage line and exit 2 without a root, an action or an alias; show reports it', () => {
  const lib = makeLibrary(); const root = tmp();
  install(lib, root, { signature: 'abc' });
  for (const args of [['signature', 'set', 'abc'], ['signature', '--root', root], ['signature', 'set', '--root', root]]) {
    const r = cli(...args);
    assert.strictEqual(r.status, 2, args.join(' '));
    assert.match(r.stderr, /usage: install-kit\.cli\.js signature/);
  }
  assert.deepStrictEqual(JSON.parse(cli('signature', 'show', '--root', root).stdout), { alias: 'abc' });
  assert.strictEqual(cli('signature', 'set', 'toolongname', '--root', root).status, 1);
});

// ---- the check covers the project's own code only ----
const sigHits = (rel, text, cfg = {}) => checkText(rel, text, { signature: 'abc', ...cfg }).filter((f) => f.rule === 'css-11').map((f) => f.msg.split(' does not')[0]);

t('own classes, ids and data attributes without the alias are flagged; ones with it, and no alias set, are not', () => {
  const css = '.abc-card { color: var(--c); }\n.card__title { color: var(--c); }\n#main { color: var(--c); }\n';
  assert.deepStrictEqual(sigHits('src/a.css', css), ['class .card__title', 'id #main']);
  assert.deepStrictEqual(sigHits('src/a.html', '<div data-abc-open="x" data-open="y"></div>\n'), ['data attribute data-open']);
  assert.deepStrictEqual(checkText('src/a.css', css).filter((f) => f.rule === 'css-11'), []);
});

t('package, vendor, minified and generated code is never checked', () => {
  const css = '.card__title { color: var(--c); }\n';
  for (const rel of ['node_modules/pkg/a.css', 'vendor/lib/a.css', 'public/vendor/a.css', 'src/third-party/a.css', 'assets/app.min.css', 'dist/app-min.css']) assert.deepStrictEqual(sigHits(rel, css), [], rel);
  assert.deepStrictEqual(sigHits('src/gen.css', '/* @generated */\n' + css), []);
  assert.deepStrictEqual(sigHits('src/a.bundle.css', css), []);
});

t('framework and library names are left alone: built-in data attributes, a signatureExempt list and a signatureIgnore list', () => {
  assert.deepStrictEqual(sigHits('src/a.html', '<div data-bs-toggle="x" data-aos="fade" data-swiper-slide="1" data-testid="t"></div>\n'), []);
  const css = '.btn { color: var(--c); }\n.swiper-slide { color: var(--c); }\n.mine { color: var(--c); }\n';
  assert.deepStrictEqual(sigHits('src/a.css', css, { signatureExempt: ['btn', 'swiper'] }), ['class .mine']);
  assert.deepStrictEqual(sigHits('src/legacy/a.css', css, { signatureIgnore: ['src/legacy/**'] }), []);
});

t('the audit reads the alias from the manifest and the package names from package.json (Bootstrap is not blamed for .btn)', () => {
  const lib = makeLibrary(); const root = tmp();
  install(lib, root, { signature: 'abc' });
  write(root, 'package.json', JSON.stringify({ dependencies: { bootstrap: '5.3.0' } }));
  write(root, 'src/a.css', '.btn-primary { color: var(--c); }\n.col-md-6 { color: var(--c); }\n.card__title { color: var(--c); }\n.abc-ok { color: var(--c); }\n');
  write(root, 'vendor/x.css', '.nothing { color: var(--c); }\n');
  const out = JSON.parse(spawnSync('node', [AUDIT, '--json', '--no-git', '--no-fail', '--cwd', root, 'src', 'vendor'], { encoding: 'utf8' }).stdout);
  const hits = out.findings.filter((f) => f.rule === 'css-11');
  assert.deepStrictEqual(hits.map((f) => `${f.file}:${f.msg.split(' ')[1]}`), ['src/a.css:.card__title']);
});

t('the rule text tells the AI the alias is for its own code only', () => {
  assert.match(sig.signatureLine('abc'), /project's own code only: never rename, prefix or restyle a class, attribute or component that comes from a package, framework or library/);
});

// ---- component names, strict mode and banned imports ----
const { projectConfig } = require('../skills/standards/code-audit.audit.js');
const { check } = require('../skills/workflow/pre-commit.check.js');
const git = (d, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d, encoding: 'utf8' });
const repo = () => { const d = tmp(); git(d, 'init', '-q'); return d; };
const compHits = (rel, text, cfg = {}) => checkText(rel, text, { signature: 'abc', ...cfg }).filter((f) => f.rule === 'css-11-component').map((f) => f.msg.split(' ')[1]);

t('shared component names: those without the capitalised alias are flagged in components/ ui/ shared/ only', () => {
  const tsx = 'export function Button() { return null }\nexport function AbcCard() { return null }\nexport const Modal = () => null;\nexport const CONFIG = { a: 1 };\nexport default class Abcdef {}\nexport interface Props {}\n';
  assert.deepStrictEqual(compHits('src/components/x.tsx', tsx), ['Button', 'Modal', 'Abcdef']);
  assert.deepStrictEqual(compHits('src/pages/Home.tsx', tsx), []);
  assert.deepStrictEqual(compHits('src/components/Button.test.tsx', tsx), []);
  assert.deepStrictEqual(compHits('src/lib/x.tsx', tsx), []);
  assert.deepStrictEqual(compHits('node_modules/p/components/x.tsx', tsx), []);
  assert.deepStrictEqual(compHits('src/widgets/x.tsx', tsx, { signatureComponentDirs: ['widgets'] }), ['Button', 'Modal', 'Abcdef']);
});

t('component names: vue, svelte and dart widgets; a Pascal-case exempt prefix; no alias set means no check', () => {
  assert.deepStrictEqual(compHits('src/components/Button.vue', '<template/>'), ['Button']);
  assert.deepStrictEqual(compHits('src/components/AbcButton.vue', '<template/>'), []);
  assert.deepStrictEqual(compHits('lib/ui/card.dart', 'class Card extends StatelessWidget {}\nclass AbcTile extends StatefulWidget {}\n'), ['Card']);
  assert.deepStrictEqual(compHits('src/components/x.tsx', 'export function MuiThing() {}\n', { signatureExempt: ['Mui'] }), []);
  assert.deepStrictEqual(checkText('src/components/x.tsx', 'export function Button() {}\n').filter((f) => f.rule === 'css-11-component'), []);
});

t('signatureMode strict puts the signature rules in the per-edit set; review (the default) keeps them out', () => {
  const css = '.card__title { color: var(--c); }\n';
  const edit = (cfg) => checkText('src/a.css', css, { signature: 'abc', ...cfg }, 'edit').map((f) => f.rule);
  assert.deepStrictEqual(edit({}), []);
  assert.deepStrictEqual(edit({ signatureMode: 'strict' }), ['css-11']);
  assert.deepStrictEqual(checkText('src/components/x.tsx', 'export function Button() {}\n', { signature: 'abc', signatureMode: 'strict' }, 'edit').map((f) => f.rule), ['css-11-component']);
});

t('banned imports are a hard rule: names, sub-paths and globs, with the company message; nothing else matches', () => {
  const ban = ['jquery', { pattern: '@mui/*', message: 'use the shared component' }];
  const js = "import $ from 'jquery';\nconst m = require('@mui/material');\nimport x from 'jquery-ui-extras';\nimport y from 'jquery/dist/jquery.slim';\nimport ok from './jquery';\n";
  const f = checkText('src/a.js', js, { bannedImports: ban }, 'edit').filter((x) => x.rule === 'ban-01');
  assert.deepStrictEqual(f.map((x) => x.line), [1, 2, 4]);
  assert.match(f[1].msg, /@mui\/material.*use the shared component/);
  assert.strictEqual(checkText('src/a.css', "@import 'jquery';\n", { bannedImports: ban }).filter((x) => x.rule === 'ban-01').length, 1);
  assert.deepStrictEqual(checkText('node_modules/p/a.js', js, { bannedImports: ban }).filter((x) => x.rule === 'ban-01'), []);
  assert.deepStrictEqual(checkText('src/a.js', js).filter((x) => x.rule === 'ban-01'), []);
});

t('projectConfig merges code-audit.json, the install manifest and package.json in one place', () => {
  const root = tmp();
  write(root, '.ai-dev-kit.json', JSON.stringify({ signature: { alias: 'abc' } }));
  write(root, '.claude/code-audit.json', JSON.stringify({ signatureMode: 'strict', bannedImports: ['jquery'], signatureExempt: ['legacy'] }));
  write(root, 'package.json', JSON.stringify({ dependencies: { swiper: '1' } }));
  const pc = projectConfig(root);
  assert.strictEqual(pc.signature, 'abc');
  assert.strictEqual(pc.signatureMode, 'strict');
  assert.deepStrictEqual(pc.bannedImports, ['jquery']);
  assert.ok(pc.signatureExempt.includes('legacy') && pc.signatureExempt.includes('swiper'));
  assert.strictEqual(pc.ui, false);
});

t('edit-check enforces the stored signature and the ban list when configured, and says nothing otherwise', () => {
  const root = repo();
  write(root, 'coding-standards/index.md', '# i\n');
  write(root, '.ai-dev-kit.json', JSON.stringify({ signature: { alias: 'abc' } }));
  write(root, 'src/a.css', '.card__title { color: var(--c); }\n');
  write(root, 'src/a.js', "import $ from 'jquery';\n");
  const EC = path.join(__dirname, '../skills/workflow/pre-merge-gate.edit-check.js');
  const run = (f) => spawnSync('node', [EC, f, '--cwd', root], { encoding: 'utf8' }).stdout;
  assert.strictEqual(run('src/a.css').trim(), '');
  assert.strictEqual(run('src/a.js').trim(), '');
  write(root, '.claude/code-audit.json', JSON.stringify({ signatureMode: 'strict', bannedImports: ['jquery'] }));
  assert.match(run('src/a.css'), /a\.css:1 {2}css-11 {2}class \.card__title does not start with abc-/);
  assert.match(run('src/a.js'), /a\.js:1 {2}ban-01 {2}import of banned library "jquery"/);
});

t('strict commit check: a strict signature or a banned import on an ADDED line blocks; old lines and a valid DEVIATION do not', () => {
  const d = repo();
  write(d, '.ai-dev-kit.json', JSON.stringify({ signature: { alias: 'abc' } }));
  write(d, '.claude/edit-check.json', JSON.stringify({ strict: true }));
  write(d, '.claude/code-audit.json', JSON.stringify({ signatureMode: 'strict', bannedImports: ['jquery'] }));
  write(d, 'src/a.css', '.old__thing { color: var(--c); }\n');
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
  write(d, 'src/a.css', '.old__thing { color: var(--c); }\n.abc-ok { color: var(--c); }\n.new__thing { color: var(--c); }\n');
  write(d, 'src/b.js', "import $ from 'jquery';\n");
  git(d, 'add', '.');
  const blocks = () => check({ mode: 'staged', cwd: d }).findings.filter((f) => f.kind === 'standard').map((f) => `${f.file}:${f.line} ${f.msg.split(' ')[0]}`).sort();
  assert.deepStrictEqual(blocks(), ['src/a.css:3 css-11', 'src/b.js:1 ban-01']);
  write(d, 'src/a.css', '.old__thing { color: var(--c); }\n.abc-ok { color: var(--c); }\n/* DEVIATION: css-11 vendor markup needs this exact name */\n.new__thing { color: var(--c); }\n');
  git(d, 'add', '.');
  assert.deepStrictEqual(blocks(), ['src/b.js:1 ban-01']);
});

// ---- the interactive prompts, walked end to end on piped answers (AI_DEV_KIT_INTERACTIVE=1 forces them on) ----
const walk = (lib, root, answers, extra = []) => spawnSync('node', [CLI, 'install', '--library', lib, '--root', root, '--tool', 'claude', '--skills', 'handover', '--context-code', 'none', '--json', ...extra], {
  encoding: 'utf8', input: answers.join('\n') + (answers.length ? '\n' : ''), env: { ...process.env, AI_DEV_KIT_INTERACTIVE: '1', NO_COLOR: '1' }, timeout: 60000,
});
// --json is passed so the prompts stay off; this helper runs without it, reading the prompts from stdout before the JSON result.
const walkPrompts = (lib, root, answers, extra = []) => spawnSync('node', [CLI, 'install', '--library', lib, '--root', root, '--tool', 'claude', '--skills', 'handover', '--context-code', 'none', ...extra], {
  encoding: 'utf8', input: answers.join('\n') + (answers.length ? '\n' : ''), env: { ...process.env, AI_DEV_KIT_INTERACTIVE: '1', NO_COLOR: '1' }, timeout: 60000,
});
const zedDocs = () => { const co = tmp(); write(co, 'docs/a.md', '# A\n\nUse `data-zed-page`, `data-zed-theme`, `data-zed-x`; ZedButton, ZedInput, ZedSelect.\n'); write(co, 'docs/b.md', '# B\n\n`data-zed-collapsed` and `data-zed-filter`.\n'); return co; };

t('prompts: answering the signature question stores the alias; the question explains it and says it is for your own code only', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['n', 'acme', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /A signature is a short alias that watermarks the code.*your own code only, never to packages or libraries/);
  assert.match(r.stdout, /Project signature \(2 to 6 letters, or press Enter for none\)/);
  assert.strictEqual(readManifest(root).signature.alias, 'acme');
  assert.strictEqual(readManifest(root).standards, true);
  assert.ok(read(root, 'CLAUDE.md').includes('`acme-`'));
});

t('prompts: a bad alias is explained and asked again; nothing is written before a good one', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['n', 'x', 'toolongname', 'acme', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual((r.stdout.match(/the signature must be 2 to 6 letters or digits/g) || []).length, 2);
  assert.strictEqual(readManifest(root).signature.alias, 'acme');
});

t('prompts: pressing Enter at the signature question means none', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['n', '', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(readManifest(root).signature, undefined);
  assert.ok(read(root, 'CLAUDE.md').includes(ROW));
});

t('prompts: with company docs the signature question shows their prefix as a hint, and the choice stays yours', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['1', 'mine'], ['--company-from', zedDocs()]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Your company docs use "zed"; you can use it or pick another/);
  assert.strictEqual(readManifest(root).signature.alias, 'mine');
  assert.ok(!read(root, 'CLAUDE.md').includes('zed'));
});

t('prompts: choosing "install the default standards too" does not ask about the standards a second time', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['1', ''], ['--company-from', zedDocs()]), again = /Install the default coding-standards too/;
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!again.test(r.stdout), r.stdout);
  assert.strictEqual(readManifest(root).standards, true);
  assert.strictEqual(readManifest(root).company.mode, 'keep');
});

t('prompts: choosing "don\'t install the default standards" skips the standards questions and installs none', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['2', ''], ['--company-from', zedDocs()]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/Install the default coding-standards too|Script standard/.test(r.stdout));
  assert.strictEqual(readManifest(root).company.mode, 'drop');
  assert.deepStrictEqual(fs.readdirSync(path.join(root, 'coding-standards')), ['company']);
});

t('prompts: input that ends early takes every default (no company, no signature, no standards) and never hangs', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, []);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.notStrictEqual(r.signal, 'SIGTERM');
  assert.strictEqual(readManifest(root).signature, undefined);
  assert.strictEqual(readManifest(root).standards, false);
  assert.strictEqual(readManifest(root).company, undefined);
});

t('prompts are off on piped input unless forced: no question text, and no hang', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = spawnSync('node', [CLI, 'install', '--library', lib, '--root', root, '--tool', 'claude', '--skills', 'handover', '--context-code', 'none'], { encoding: 'utf8', input: '', timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/Project signature|Does this project follow/.test(r.stdout));
});

t('a bad --signature flag stops the install before anything is written', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = cli('install', '--library', lib, '--root', root, '--tool', 'claude', '--skills', 'handover', '--signature', 'toolongname');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /the signature must be 2 to 6 letters or digits/);
  assert.ok(!fs.existsSync(path.join(root, '.ai-dev-kit.json')));
  assert.ok(!fs.existsSync(path.join(root, '.claude')));
});

// ---- wider component detection, exemptions learned from installed packages, --suggest-exempt ----
const tsxHits = (text) => compHits('src/components/x.tsx', text);

t('component export styles: export lists, aliases, default exports, wrapped (HOC) exports and classes are all seen', () => {
  assert.deepStrictEqual(tsxHits('function Button() { return <div/> }\nexport { Button }\n'), ['Button']);
  assert.deepStrictEqual(tsxHits('const Modal = () => <div/>;\nexport default Modal;\n'), ['Modal']);
  assert.deepStrictEqual(tsxHits('function Card() { return <i/> }\nexport { Card as AbcCard }\n'), []);
  assert.deepStrictEqual(tsxHits('function Tile() { return <i/> }\nexport { Tile as Square }\n'), ['Square']);
  assert.deepStrictEqual(tsxHits('function Panel() { return <i/> }\nexport default connect(mapState)(Panel);\n'), ['Panel']);
  assert.deepStrictEqual(tsxHits('const Row = memo(function Row() { return <tr/> });\nexport default Row;\n'), ['Row']);
  assert.deepStrictEqual(tsxHits('export class Foo extends React.Component { render() { return <i/> } }\n'), ['Foo']);
  assert.deepStrictEqual(tsxHits('function Item() { return <i/> }\nmodule.exports = Item;\n'), ['Item']);
});

t('component export styles: non-components, hooks, prefixed names and un-exported helpers are left alone', () => {
  assert.deepStrictEqual(tsxHits('export function ConfigLoader() { return 1 }\n'), ['ConfigLoader']); // functions are camelCase, so a Pascal-case one in a components folder is a component
  assert.deepStrictEqual(compHits('src/lib/x.tsx', 'export function ConfigLoader() { return 1 }\n'), []); // outside the component folders it is left alone
  assert.deepStrictEqual(tsxHits('export function useThing() { return <b/> }\n'), []);
  assert.deepStrictEqual(tsxHits('function Inner() { return <i/> }\nexport function AbcOuter() { return <Inner/> }\n'), []);
  assert.deepStrictEqual(tsxHits('export const CONFIG = { a: 1 };\nexport type Props = {};\n'), []);
  assert.deepStrictEqual(tsxHits('function Button() { return <div/> }\nexport { Button as AbcButton }\n'), []);
});

// ---- learned exemptions ----
const harvestRoot = (css) => {
  const root = tmp();
  write(root, '.ai-dev-kit.json', JSON.stringify({ signature: { alias: 'abc' } }));
  write(root, 'package.json', JSON.stringify({ dependencies: { mylib: '1.0.0', '@scope/kit': '2.0.0' } }));
  write(root, 'node_modules/mylib/dist/mylib.css', '.mylib-card { color: red } .mylib-card--on { color: blue }\n/* .not-a-class */');
  write(root, 'node_modules/@scope/kit/styles/kit.css', '.kit_row { color: red }\n');
  write(root, 'src/a.css', css);
  return root;
};
const auditJson = (root, ...extra) => JSON.parse(spawnSync('node', [AUDIT, '--json', '--no-git', '--no-fail', '--cwd', root, 'src', ...extra], { encoding: 'utf8' }).stdout);

t('class names from any installed dependency\'s own CSS are exempt, so a library that is in no table is not blamed', () => {
  const root = harvestRoot('.mylib-card--on { color: var(--c); }\n.kit_row { color: var(--c); }\n.own__thing { color: var(--c); }\n.abc-ok { color: var(--c); }\n');
  const hits = auditJson(root).findings.filter((f) => f.rule === 'css-11').map((f) => f.msg.split(' ')[1]);
  assert.deepStrictEqual(hits, ['.own__thing']);
  assert.ok(projectConfig(root).signatureExempt.includes('mylib-card') && !projectConfig(root).signatureExempt.includes('not-a-class'));
});

t('the harvested names are cached until package.json changes, and node_modules is only read when a signature is set', () => {
  const root = harvestRoot('.own { color: var(--c); }\n');
  projectConfig(root);
  const cache = path.join(root, '.claude', 'code-audit.pkg.json');
  assert.ok(fs.existsSync(cache));
  const first = fs.readFileSync(cache, 'utf8');
  write(root, 'node_modules/mylib/dist/more.css', '.later-added { color: red }\n');
  projectConfig(root);
  assert.strictEqual(fs.readFileSync(cache, 'utf8'), first); // same package.json: the cache is used
  const plain = tmp();
  write(plain, 'package.json', JSON.stringify({ dependencies: { mylib: '1' } }));
  write(plain, 'node_modules/mylib/a.css', '.mylib-x { }\n');
  assert.deepStrictEqual(projectConfig(plain).signatureExempt, []);
  assert.ok(!fs.existsSync(path.join(plain, '.claude', 'code-audit.pkg.json')));
});

t('--suggest-exempt groups the flagged names by first word and prints the config line to paste', () => {
  const root = tmp();
  write(root, '.ai-dev-kit.json', JSON.stringify({ signature: { alias: 'abc' } }));
  write(root, 'src/a.css', '.btn-primary { color: var(--c); }\n.btn-lg { color: var(--c); }\n.btn-sm { color: var(--c); }\n.col-6 { color: var(--c); }\n.own__thing { color: var(--c); }\n');
  const out = spawnSync('node', [AUDIT, '--suggest-exempt', '--no-git', '--cwd', root, 'src'], { encoding: 'utf8' }).stdout;
  assert.match(out, /btn {2}\(3 names, e\.g\. btn-primary, btn-lg, btn-sm\)/);
  assert.match(out, /suggested: "signatureExempt": \["btn","col","own"\]/);
  assert.match(out, /own that you want to keep unprefixed need a DEVIATION comment|Names of your own/);
  const none = spawnSync('node', [AUDIT, '--suggest-exempt', '--no-git', '--cwd', tmp()], { encoding: 'utf8' }).stdout;
  assert.match(none, /nothing flagged/);
});

// ---- A11Y-09 as a code check: colour contrast of token pairs, light and dark ----
const { parseColour, contrastRatio } = require('../skills/standards/code-audit.audit.js');
const near = (a, b, tol = 1) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

t('parseColour: hex, rgb (comma and space syntax), hsl, oklch and names; anything with alpha below 1 or unknown is null', () => {
  assert.deepStrictEqual(parseColour('#fff'), [255, 255, 255]);
  assert.deepStrictEqual(parseColour('#1a2B3c'), [26, 43, 60]);
  assert.deepStrictEqual(parseColour('#1a2b3cff'), [26, 43, 60]);
  assert.deepStrictEqual(parseColour('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepStrictEqual(parseColour('rgb(10 20 30 / 100%)'), [10, 20, 30]);
  assert.deepStrictEqual(parseColour('hsl(0 100% 50%)'), [255, 0, 0]);
  assert.ok(near(parseColour('oklch(1 0 0)'), [255, 255, 255]));
  assert.ok(near(parseColour('oklch(0 0 0)'), [0, 0, 0]));
  assert.ok(near(parseColour('oklch(0.5 0 0)'), [99, 99, 99], 2));
  assert.strictEqual(parseColour('white')[0], 255);
  for (const bad of ['rgba(0,0,0,0.5)', '#1a2b3c80', 'color-mix(in srgb, red, blue)', 'light-dark(#fff, #000)', 'banana', 'var(--x)']) assert.strictEqual(parseColour(bad), null, bad);
});

t('contrastRatio matches the WCAG reference values', () => {
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio([119, 119, 119], [255, 255, 255]) - 4.48) < 0.02); // #777 on white just fails AA
  assert.ok(Math.abs(contrastRatio([118, 118, 118], [255, 255, 255]) - 4.54) < 0.02); // #767676 passes
  assert.strictEqual(contrastRatio([10, 20, 30], [10, 20, 30]), 1);
});

const TOKENS = [
  ':root {',
  '  --gray-500: #777777;',
  '  --white: #ffffff;',
  '  --color-text: var(--gray-500);',
  '  --color-surface: var(--white);',
  '  --color-text-strong: #111111;',
  '}',
  '@media (prefers-color-scheme: dark) {',
  '  :root { --color-surface: #222222; --color-text-strong: #333333; }',
  '}',
].join('\n') + '\n';
const pairs = [{ fg: '--color-text', bg: '--color-surface' }, { fg: '--color-text-strong', bg: '--color-surface' }];
const cHits = (css, cfg) => checkText('src/tokens.css', css, cfg).filter((f) => f.rule.startsWith('a11y-09')).map((f) => `${f.rule}@${f.line} ${f.msg}`);

t('a declared pair is resolved through var() per mode and flagged where it fails, with the mode and the numbers', () => {
  const hits = cHits(TOKENS, { contrastPairs: pairs });
  assert.strictEqual(hits.length, 3, JSON.stringify(hits));
  assert.match(hits[0], /^a11y-09@4 --color-text on --color-surface is 4\.48:1 in light mode, needs 4\.5:1$/);
  assert.match(hits[1], /^a11y-09@4 --color-text on --color-surface is 3\.\d\d:1 in dark mode, needs 4\.5:1$/);
  assert.match(hits[2], /^a11y-09@9 --color-text-strong on --color-surface is 1\.\d\d:1 in dark mode, needs 4\.5:1$/);
});

t('a per-pair minimum applies (3:1 for large text and interface parts)', () => {
  const hits = cHits(TOKENS, { contrastPairs: [{ fg: '--color-text', bg: '--color-surface', min: 3 }] });
  assert.deepStrictEqual(hits, []);
});

t('"auto" pairs text tokens with surface and background tokens, and skips inverse, disabled and placeholder ones', () => {
  const css = ':root { --color-text: #111; --color-text-disabled: #ccc; --color-text-inverse: #fff; --color-bg: #fff; --color-surface-inverse: #000; }\n';
  assert.deepStrictEqual(cHits(css, { contrastPairs: 'auto' }), []);
  const bad = ':root { --color-text: #bbb; --color-text-disabled: #ccc; --color-bg: #fff; }\n';
  const h = cHits(bad, { contrastPairs: 'auto' });
  assert.strictEqual(h.length, 1);
  assert.match(h[0], /--color-text on --color-bg is 1\.\d\d:1 in light mode/);
});

t('tokens that use alpha or color-mix are reported as not checked (info), never silently passed or failed', () => {
  const css = ':root { --color-text: rgba(0,0,0,0.6); --color-surface: #fff; }\n';
  const h = cHits(css, { contrastPairs: [{ fg: '--color-text', bg: '--color-surface' }] });
  assert.strictEqual(h.length, 1);
  assert.match(h[0], /^a11y-09-skip@1 --color-text on --color-surface not checked: cannot resolve rgba/);
  assert.strictEqual(RULES['a11y-09-skip'].kind, 'info');
});

t('a pair whose tokens are declared in another file is left to that file; no config means no check', () => {
  assert.deepStrictEqual(cHits(':root { --color-text: #bbb; }\n', { contrastPairs: pairs }), []);
  assert.deepStrictEqual(cHits(TOKENS), []);
  assert.deepStrictEqual(checkText('src/a.html', TOKENS, { contrastPairs: pairs }).filter((f) => f.rule === 'a11y-09'), []);
});

t('a11y-09 is in the per-edit set, and a DEVIATION cannot waive it (accessibility rules are never waivable)', () => {
  assert.strictEqual(RULES['a11y-09'].edit, true);
  assert.strictEqual(checkText('src/tokens.css', TOKENS, { contrastPairs: pairs }, 'edit').filter((f) => f.rule === 'a11y-09').length, 3);
  const waived = ':root { --color-text: #bbb; --color-surface: #fff; }\n/* DEVIATION: a11y-09 brand grey is fixed by the logo */\n';
  const r = checkText('src/tokens.css', waived, { contrastPairs: [{ fg: '--color-text', bg: '--color-surface' }] }).map((f) => f.rule).sort();
  assert.deepStrictEqual(r, ['a11y-09', 'dev-invalid']);
});

t('the audit reads contrastPairs from .claude/code-audit.json; edit-check reports them on a token file', () => {
  const root = repo();
  write(root, 'coding-standards/index.md', '# i\n');
  write(root, '.claude/code-audit.json', JSON.stringify({ contrastPairs: pairs }));
  write(root, 'src/tokens.css', TOKENS);
  const out = JSON.parse(spawnSync('node', [AUDIT, '--json', '--no-git', '--no-fail', '--cwd', root, 'src'], { encoding: 'utf8' }).stdout);
  assert.strictEqual(out.findings.filter((f) => f.rule === 'a11y-09').length, 3);
  const EC = path.join(__dirname, '../skills/workflow/pre-merge-gate.edit-check.js');
  const ec = spawnSync('node', [EC, 'src/tokens.css', '--cwd', root], { encoding: 'utf8' }).stdout;
  assert.match(ec, /tokens\.css:4 {2}a11y-09 {2}--color-text on --color-surface is 4\.48:1 in light mode/);
});

t('prompts: typing < goes back one step and the earlier answer can be changed', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['n', '<', 'n', 'acme', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tip: type < at any prompt to go back one step/);
  assert.match(r.stdout, /Back one step/);
  assert.strictEqual(readManifest(root).signature.alias, 'acme');
});

t('prompts: b at a yes/no or menu question also goes back, and the earlier step is asked again', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['n', 'acme', 'b', 'zed', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual((r.stdout.match(/Project signature \(2 to 6 letters/g) || []).length, 2);
  assert.strictEqual(readManifest(root).signature.alias, 'zed');
});

t('prompts: < on the very first question says there is nothing to go back to and asks again', () => {
  const lib = makeLibrary(); const root = tmp();
  const r = walkPrompts(lib, root, ['<', 'n', 'acme', 'y']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /first step; there is nothing to go back to/);
  assert.strictEqual(readManifest(root).signature.alias, 'acme');
});
