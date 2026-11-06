const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkText, RULES, waivable, changedLines } = require('../skills/standards/code-audit.audit.js');
const { check } = require('../skills/workflow/pre-commit.check.js');
const EDIT_CHECK = path.join(__dirname, '../skills/workflow/pre-merge-gate.edit-check.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const hits = (rel, text, cfg = {}, profile) => checkText(rel, text, cfg, profile).map((x) => `${x.rule}@${x.line}`);
const lines = (...l) => l.join('\n') + '\n';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cas-'));
const put = (d, f, text) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), text); };
const git = (d, ...a) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: d, encoding: 'utf8' });
const repo = () => { const d = tmp(); git(d, 'init', '-q'); return d; };
const UI = { ui: true };

t('ui rules are off unless the project opts in', () => {
  const html = '<button>OK</button>\n';
  assert.deepStrictEqual(hits('a.html', html), []);
  assert.deepStrictEqual(hits('a.html', html, UI), ['ui-btn-02@1']);
});

t('ui-btn-02, ui-fbk-04, ui-mnu-02, ui-tbl-01: flagged, and the clean forms pass', () => {
  assert.deepStrictEqual(hits('a.html', lines('<button type="button">Save changes</button>', '<button>Submit</button>', '<button>Click here</button>'), UI), ['ui-btn-02@2', 'ui-btn-02@3']);
  assert.deepStrictEqual(hits('a.tsx', lines('const a = "Something went wrong";', 'const b = "Could not save the invoice. Check your connection and try again.";', 'confirm("Are you sure?")'), UI), ['ui-fbk-04@1', 'ui-fbk-04@3']);
  assert.deepStrictEqual(hits('a.html', lines('<nav aria-label="Main">', '<ul role="menu"><li>x</li></ul>', '</nav>', '<div role="menu"></div>'), UI), ['ui-mnu-02@2']);
  assert.deepStrictEqual(hits('a.html', lines('<table><tr><td>a</td></tr></table>', '<table><thead><tr><th scope="col">a</th></tr></thead></table>'), UI), ['ui-tbl-01@1']);
});

t('ui review rules: icon-only button, placeholder-only input, number input, dialog without aria-modal', () => {
  assert.deepStrictEqual(hits('a.html', lines('<button type="button"><svg></svg></button>', '<button type="button" aria-label="Close"><svg></svg></button>', '<button type="button"><img src="x.svg" alt="Close" width="16" height="16"></button>'), UI), ['ui-btn-07@1']);
  assert.deepStrictEqual(hits('a.html', lines('<input placeholder="Name">', '<input placeholder="Name" aria-label="Name">', '<input type="hidden" placeholder="x">', '<input id="a" placeholder="Name">'), UI), ['ui-fld-01@1']);
  assert.deepStrictEqual(hits('a.html', '<input type="number" id="q" aria-label="Qty">\n', UI), ['ui-fld-03@1']);
  assert.deepStrictEqual(hits('a.html', lines('<div role="dialog">x</div>', '<div role="dialog" aria-modal="true">x</div>'), UI), ['ui-mod-01@1']);
});

t('ui review rules: native select, Select2 and native date inputs', () => {
  assert.deepStrictEqual(hits('a.html', lines('<select name="site"><option>A</option></select>', '<div class="combo"></div>'), UI), ['ui-sel-12@1']);
  assert.deepStrictEqual(hits('a.js', 'import select2 from "select2";\n', UI), ['ui-sel-12@1']);
  assert.deepStrictEqual(hits('a.html', lines('<input type="date" id="d" aria-label="Due">', '<input type="text" id="e" aria-label="Name">'), UI), ['ui-dte-03@1']);
});

t('ui review rules: password autocomplete, split code boxes, confirm password, autoplay, skip link', () => {
  assert.deepStrictEqual(hits('a.html', lines('<input type="password" id="p" aria-label="Password">', '<input type="password" id="q" aria-label="Password" autocomplete="current-password">'), UI), ['ui-aut-03@1', 'ui-fld-22@1']); // both fields lack a show/hide control, reported once per file
  assert.deepStrictEqual(hits('a.html', lines('<input maxlength="1"><input maxlength="1"><input maxlength="1"><input maxlength="1">'), UI), ['ui-aut-16@1']);
  assert.deepStrictEqual(hits('a.html', lines('<input type="text" id="confirm_password" aria-label="Again">'), UI), ['ui-fld-10@1']);
  assert.deepStrictEqual(hits('a.html', lines('<video autoplay muted></video>', '<video autoplay></video>'), UI), ['ui-lnd-02@2']);
  assert.deepStrictEqual(hits('a.html', lines('<body>', '<main>x</main>', '</body>'), UI), ['ui-hdr-14@2']);
  assert.deepStrictEqual(hits('a.html', lines('<body><a href="#main-content">Skip</a>', '<main id="main-content">x</main></body>'), UI), []);
});

t('ui-tbl-11 and ui-fld-22: pagination markers and the password show/hide control', () => {
  const bad = '<nav class="pagination"><a href="?p=1">1</a></nav>\n';
  assert.deepStrictEqual(hits('a.html', bad, UI), ['ui-tbl-11@1', 'ui-tbl-11@1']);
  const good = '<nav class="pagination"><a href="?p=1" aria-current="page">1</a></nav><span>1–25 of 248</span><label>Rows per page</label>\n';
  assert.deepStrictEqual(hits('a.html', good, UI), []);
  assert.deepStrictEqual(hits('a.html', '<input type="password" id="p" aria-label="Password" autocomplete="current-password">\n', UI), ['ui-fld-22@1']);
  assert.deepStrictEqual(hits('a.html', '<input type="password" id="p" aria-label="Password" autocomplete="current-password"><button type="button">Show password</button>\n', UI), []);
});

t('ui-btn-08: a destructive button in a dialog needs the danger style; outside a dialog it is not checked', () => {
  const bad = '<dialog><button class="btn">Cancel</button><button class="btn btn-primary">Delete invoice</button></dialog>\n';
  assert.deepStrictEqual(hits('a.html', bad, UI), ['ui-btn-08@1']);
  const good = '<dialog><button class="btn">Cancel</button><button class="btn btn-danger">Delete invoice</button></dialog>\n';
  assert.deepStrictEqual(hits('a.html', good, UI), []);
  assert.deepStrictEqual(hits('a.html', '<button class="btn">Delete invoice</button>\n', UI), []);
});

t('ui-aut-09 only fires on a cookie option, not on other secure: false (nodemailer, tls)', () => {
  assert.deepStrictEqual(hits('a.ts', lines('res.cookie("sid", id, { httpOnly: false, secure: true })', 'const mail = { host: "h", secure: false }'), UI), ['ui-aut-09@1']);
});

t('ui-pwa-01: a manifest missing fields is flagged; a complete one, an extension manifest and other manifests are not', () => {
  const good = JSON.stringify({ name: 'App', short_name: 'App', id: '/', start_url: '/', scope: '/', display: 'standalone', theme_color: '#fff', background_color: '#fff', icons: [{ src: 'a.png', sizes: '192x192' }, { src: 'b.png', sizes: '512x512', purpose: 'any maskable' }] });
  assert.deepStrictEqual(hits('public/manifest.webmanifest', good, UI), []);
  const bad = checkText('public/manifest.json', JSON.stringify({ name: 'App', short_name: 'A very long short name', display: 'browser', icons: [] }), UI);
  assert.strictEqual(bad.length, 1);
  assert.match(bad[0].msg, /id.*start_url.*scope.*theme_color.*background_color.*over 12.*standalone.*192x192.*512x512.*maskable/);
  assert.deepStrictEqual(hits('manifest.json', JSON.stringify({ manifest_version: 3, name: 'ext' }), UI), []);
  assert.deepStrictEqual(hits('dist/manifest.json', JSON.stringify({ 'app.js': 'app.123.js' }), UI), []);
});

t('DEVIATION waives that rule on its own line and the next, and is counted', () => {
  const f = checkText('a.html', lines('<!-- DEVIATION: ui-btn-02 legacy dialog copy is fixed by the vendor -->', '<button>OK</button>', '<button>OK</button>'), UI);
  assert.deepStrictEqual(f.map((x) => `${x.rule}@${x.line}`).sort(), ['dev-count@1', 'ui-btn-02@3']);
  assert.match(f.find((x) => x.rule === 'dev-count').msg, /waived ui-btn-02: legacy dialog copy/);
});

t('DEVIATION without a reason, for an unknown rule, or for an unwaivable rule is ignored and reported', () => {
  assert.deepStrictEqual(hits('a.html', lines('<!-- DEVIATION: ui-btn-02 -->', '<button>OK</button>'), UI).sort(), ['dev-invalid@1', 'ui-btn-02@2']);
  assert.deepStrictEqual(hits('a.html', lines('<!-- DEVIATION: no-such-rule because -->', '<p>x</p>'), UI), ['dev-invalid@1']);
  const f = checkText('a.html', lines('<!-- DEVIATION: a11y-05 the card is clickable by design -->', '<div onclick="go()">x</div>'), UI);
  assert.deepStrictEqual(f.map((x) => `${x.rule}@${x.line}`).sort(), ['a11y-05@2', 'dev-invalid@1']);
  assert.ok(!waivable('a11y-05') && !waivable('ui-aut-09') && waivable('ui-btn-02') && !waivable('nope'));
});

t('a DEVIATION that matches nothing is reported as stale', () => {
  assert.deepStrictEqual(hits('a.html', lines('<!-- DEVIATION: ui-btn-02 old reason -->', '<button>Save</button>'), UI), ['dev-stale@1']);
});

t('the edit profile runs the clean-fire ui rules and dev-invalid, not the review ones or the counts', () => {
  const html = lines('<button>OK</button>', '<input placeholder="x">', '<!-- DEVIATION: ui-btn-02 -->');
  assert.deepStrictEqual(hits('a.html', html, UI, 'edit').sort(), ['dev-invalid@3', 'ui-btn-02@1']);
  for (const id of ['ui-btn-02', 'ui-fbk-04', 'ui-mnu-02', 'ui-tbl-01', 'ui-aut-09', 'dev-invalid']) assert.ok(RULES[id].edit, id);
});

t('changedLines: null for an untracked file, the changed lines for a tracked one', () => {
  const d = repo();
  put(d, 'a.css', '.a{}\n.b{}\n.c{}\n');
  assert.strictEqual(changedLines(d, 'a.css'), null);
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
  assert.deepStrictEqual([...changedLines(d, 'a.css')], []);
  put(d, 'a.css', '.a{}\n.b{color:red}\n.c{}\n.d{}\n');
  assert.deepStrictEqual([...changedLines(d, 'a.css')].sort(), [2, 4]);
});

t('audit --changed reports only the violation added since HEAD, not the old debt', () => {
  const d = repo();
  put(d, 'a.css', '.a { color: #111; }\n');
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
  put(d, 'a.css', '.a { color: #111; }\n.b { color: #222; }\n');
  const run = (...a) => JSON.parse(spawnSync('node', [path.join(__dirname, '../skills/standards/code-audit.audit.js'), '--json', '--no-fail', '--cwd', d, ...a], { encoding: 'utf8' }).stdout);
  assert.strictEqual(run().findings.filter((x) => x.rule === 'css-10').length, 2);
  assert.deepStrictEqual(run('--changed').findings.filter((x) => x.rule === 'css-10').map((x) => x.line), [2]);
});

t('edit-check: scope "changed" hides old debt; strict adds the STRICT line; both off by default', () => {
  const d = repo();
  put(d, 'coding-standards/index.md', '# idx\n');
  put(d, 'a.css', '.a { color: #111; }\n');
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
  put(d, 'a.css', '.a { color: #111; }\n.b { color: #222; }\n');
  const ec = () => spawnSync('node', [EDIT_CHECK, 'a.css', '--cwd', d], { encoding: 'utf8' }).stdout;
  assert.strictEqual(ec().trim().split('\n').length, 2);
  put(d, '.claude/edit-check.json', JSON.stringify({ scope: 'changed' }));
  assert.strictEqual(ec().trim().split('\n').length, 1);
  assert.match(ec(), /a\.css:2 {2}css-10/);
  put(d, '.claude/edit-check.json', JSON.stringify({ scope: 'changed', strict: true }));
  assert.match(ec(), /^STRICT: fix every finding/);
});

t('pre-commit strict: a hard-rule finding on an added line blocks; old code, strict off and no engine do not', () => {
  const d = repo();
  put(d, 'coding-standards/ui-standards.md', '# ui\n');
  put(d, 'a.html', '<button>OK</button>\n<p>x</p>\n');
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'init');
  put(d, 'a.html', '<button>OK</button>\n<p>x</p>\n<button>Submit</button>\n');
  git(d, 'add', '.');
  const blocks = () => check({ mode: 'staged', cwd: d }).findings.filter((f) => f.kind === 'standard');
  assert.strictEqual(blocks().length, 0); // strict is off
  put(d, '.claude/edit-check.json', JSON.stringify({ strict: true }));
  const b = blocks();
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].sev, 'BLOCK');
  assert.strictEqual(b[0].line, 3); // the old OK on line 1 does not block
  assert.match(b[0].msg, /ui-btn-02/);
  put(d, 'a.html', '<button>OK</button>\n<p>x</p>\n<!-- DEVIATION: ui-btn-02 vendor dialog text -->\n<button>Submit</button>\n');
  git(d, 'add', '.');
  assert.strictEqual(blocks().length, 0); // a valid deviation waives it
});
