const assert = require('node:assert');
const lint = require('../skills/meta/skill-writer.lint.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const ids = (fs) => fs.map((f) => f.rule).sort();
const skill = (desc, body = 'Rule one.\n') => `---\nname: x\ndescription: ${desc}\n---\n${body}`;

t('skill: a good description and a short body are clean', () => {
  assert.deepStrictEqual(ids(lint.lintSkill('s.md', skill('Use whenever a form fails. Load this BEFORE editing.'))), []);
});

t('skill: description cap, missing opener and missing load-before are reported', () => {
  const long = 'Use whenever ' + 'word '.repeat(60) + 'Load this BEFORE it.';
  assert.deepStrictEqual(ids(lint.lintSkill('s.md', skill(long))), ['sk-desc-cap']);
  assert.deepStrictEqual(ids(lint.lintSkill('s.md', skill('Token discipline notes.'))), ['sk-desc-load', 'sk-desc-open']);
});

t('skill: a body over about 130 lines is reported', () => {
  assert.deepStrictEqual(ids(lint.lintSkill('s.md', skill('Use whenever x. Load this BEFORE y.', 'line\n'.repeat(140)))), ['sk-lines']);
});

t('command: dmi, scoped tools, no write tool, node on the bang line, output cap', () => {
  const good = '---\ndescription: Show the thing\ndisable-model-invocation: true\nallowed-tools: Bash(node:*)\n---\n!`node {{skill-root}}/a/b.js`\nReport in three lines or fewer.\n';
  assert.deepStrictEqual(ids(lint.lintCommand('c.md', good)), []);
  const bad = '---\ndescription: Do it\nallowed-tools: Bash(*)\n---\n!`grep x y`\nReport the result.\n';
  assert.deepStrictEqual(ids(lint.lintCommand('c.md', bad)), ['cmd-cap', 'cmd-dmi', 'cmd-portable', 'cmd-tools']);
});

t('mod: a Bash-only gate, destructuring $ and writes under handover/ are reported', () => {
  assert.deepStrictEqual(ids(lint.lintMod('m.ts', "on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($) => {})")), []);
  assert.deepStrictEqual(ids(lint.lintMod('m.ts', "on('tool.call', { tool: 'Bash' }, async ($) => {})")), ['mod-shell']);
  assert.deepStrictEqual(ids(lint.lintMod('m.ts', 'const { fs } = $;\n')), ['mod-destructure']);
  assert.deepStrictEqual(ids(lint.lintMod('m.ts', "await $.fs.write('handover/x.md', 'a')")), ['mod-handover']);
});

t('script: shell strings and a bare convert call are reported; a message that says convert is not', () => {
  assert.deepStrictEqual(ids(lint.lintScript('a.ts', "execSync('ls ' + dir)")), ['sc-exec']);
  assert.deepStrictEqual(ids(lint.lintScript('a.ts', "execFile('convert', [a, b])")), ['sc-convert']);
  assert.deepStrictEqual(ids(lint.lintScript('a.ts', "throw new Error('convert needs --to')")), []);
});

t('the style rules (opener, load-before) are advisory: hidden unless strict', () => {
  const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-'));
  fs.mkdirSync(path.join(root, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'x', 'a.md'), skill('Token discipline notes.'));
  assert.deepStrictEqual(ids(lint.lintKit(root)), []);
  assert.deepStrictEqual(ids(lint.lintKit(root, '', true)), ['sk-desc-load', 'sk-desc-open']);
});

// ---- round 4: golden findings (found by the kit-wide probe) ----
// Regenerate on purpose with UPDATE_GOLDEN=1 node tests/skill-writer.lint.test.js, then read the diff.
const fs8 = require('node:fs'), os8 = require('node:os'), path8 = require('node:path'), { spawnSync: spawn8 } = require('node:child_process');
const CR8 = String.fromCharCode(13), NL8 = String.fromCharCode(10), BS8 = String.fromCharCode(92);
const gold8 = (name, text) => {
	const file = path8.join(__dirname, 'fixtures', 'lint', name);
	if (process.env.UPDATE_GOLDEN === '1') { fs8.mkdirSync(path8.dirname(file), { recursive: true }); fs8.writeFileSync(file, text); return; }
	assert.ok(fs8.existsSync(file), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs8.readFileSync(file, 'utf8').split(CR8).join(''));
};
const words8 = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
const body8 = (n) => Array.from({ length: n }, (_, i) => 'line ' + i).join(NL8);
const sk8 = (fm, body = 'Rule one.') => '---' + NL8 + fm + NL8 + '---' + NL8 + body;

t('golden: frontmatter parsing and every skill rule at its limits', () => {
	const out = { frontmatter: {}, skills: {} };
	const fmCases = { 'none': '# just a heading', 'simple': sk8('name: a' + NL8 + 'description: Use it'), 'crlf': '---' + CR8 + NL8 + 'name: a' + CR8 + NL8 + 'description: Use it' + CR8 + NL8 + '---' + CR8 + NL8 + 'body',
		'quoted': sk8('name: "a"' + NL8 + "description: 'Use it'"), 'continued': sk8('name: a' + NL8 + 'description: Use whenever' + NL8 + '  this wraps' + NL8 + '    and wraps again'), 'continuation before a key': sk8('  stray' + NL8 + 'name: a'),
		'empty value then continuation': sk8('name: a' + NL8 + 'description:' + NL8 + '  Use later'), 'dash keys': sk8('name: a' + NL8 + 'allowed-tools: Bash(node:*)' + NL8 + 'disable-model-invocation: true'), 'colon in value': sk8('name: a' + NL8 + 'description: Use it: now') };
	for (const [k, v] of Object.entries(fmCases)) out.frontmatter[k] = lint.frontmatter(v);
	const base = 'Use whenever a form fails. Load this BEFORE editing. ';
	const cases = {
		'good': sk8('name: a' + NL8 + 'description: ' + base), 'no frontmatter': 'nothing', 'no name': sk8('description: ' + base), 'no description': sk8('name: a'), 'empty description': sk8('name: a' + NL8 + 'description:'),
		'opens with When': sk8('name: a' + NL8 + 'description: When x fails. Load before'), 'opens with Run': sk8('name: a' + NL8 + 'description: Run it. Load this before'), 'opens with On': sk8('name: a' + NL8 + 'description: On start. Load before it'), 'opens lowercase': sk8('name: a' + NL8 + 'description: use it. Load before'),
		'opens badly': sk8('name: a' + NL8 + 'description: Helps with forms. Load before'), 'opens with Use only as a word': sk8('name: a' + NL8 + 'description: Used for forms. Load before'),
		'50 words': sk8('name: a' + NL8 + 'description: Use ' + words8(47) + ' before'), '51 words': sk8('name: a' + NL8 + 'description: Use ' + words8(48) + ' before'),
		'no load before': sk8('name: a' + NL8 + 'description: Use whenever a form fails.'), 'only before': sk8('name: a' + NL8 + 'description: Use whenever a form fails, before release.'), 'load before in one sentence': sk8('name: a' + NL8 + 'description: Use it. Load this first, then act before editing.'),
		'load and before in two sentences': sk8('name: a' + NL8 + 'description: Use it. Load now. Then before that.'), 'manual only': sk8('name: a' + NL8 + 'disable-model-invocation: true' + NL8 + 'description: Use it.'), 'manual false': sk8('name: a' + NL8 + 'disable-model-invocation: false' + NL8 + 'description: Use it.'),
		'130 lines': sk8('name: a' + NL8 + 'description: ' + base, body8(130)), '131 lines': sk8('name: a' + NL8 + 'description: ' + base, body8(131)), '129 lines': sk8('name: a' + NL8 + 'description: ' + base, body8(129)),
		'everything wrong': sk8('description: helps' + NL8 + 'x: y', body8(200)),
	};
	for (const [k, v] of Object.entries(cases)) out.skills[k] = lint.lintSkill('s/' + k + '.md', v);
	gold8('skills.json', JSON.stringify(out, null, 1) + NL8);
});

t('golden: command, mod and script rules', () => {
	const out = { commands: {}, mods: {}, scripts: {} };
	const cmd = (fm, body) => sk8('description: Does a thing' + NL8 + 'disable-model-invocation: true' + (fm ? NL8 + fm : ''), body);
	const okBody = 'Run it. Keep the reply under 15 lines.' + NL8 + '!' + String.fromCharCode(96) + 'node {{skill-root}}/x/cli.js' + String.fromCharCode(96);
	const cmds = {
		'good': cmd('allowed-tools: Bash(node:*)', okBody), 'no frontmatter': 'body', 'no description': sk8('disable-model-invocation: true' + NL8 + 'allowed-tools: Bash(node:*)', okBody), 'dmi missing': sk8('description: d' + NL8 + 'allowed-tools: Bash(node:*)', okBody), 'dmi false': sk8('description: d' + NL8 + 'disable-model-invocation: false', okBody),
		'bash star': cmd('allowed-tools: Bash(*)', okBody), 'star only': cmd('allowed-tools: *', okBody), 'write tool': cmd('allowed-tools: Write', okBody), 'edit tool': cmd('allowed-tools: Bash(node:*), Edit', okBody), 'notebook': cmd('allowed-tools: NotebookEdit', okBody), 'writer word inside': cmd('allowed-tools: Rewrite', okBody),
		'claude path': cmd('', okBody + NL8 + 'See .claude/skills/x'), 'claude path with root': cmd('', okBody + NL8 + 'See .claude/skills/x and {{skill-root}}/y'),
		'bang with sh': cmd('', 'Under 5 lines.' + NL8 + '!' + String.fromCharCode(96) + 'sh run.sh' + String.fromCharCode(96)), 'bang with grep': cmd('', 'Under 5 lines.' + NL8 + '!' + String.fromCharCode(96) + 'grep x y' + String.fromCharCode(96)), 'bang with cat in skill-root': cmd('', 'Under 5 lines.' + NL8 + '!' + String.fromCharCode(96) + 'node {{skill-root}}/cat/x.js' + String.fromCharCode(96)),
		'bang with bash awk sed': cmd('', 'Under 5 lines.' + NL8 + '!' + String.fromCharCode(96) + 'bash a | awk b | sed c' + String.fromCharCode(96)), 'bang not at line start': cmd('', 'Under 5 lines. x !' + String.fromCharCode(96) + 'sh a' + String.fromCharCode(96)),
		'no length cap': cmd('', 'Does things.'), 'cap: at most': cmd('', 'Reply at most 12 words.'), 'cap: three lines or fewer': cmd('', 'Say it in three lines or fewer.'), 'cap: worst first 5': cmd('', 'Show the worst 5 only.'), 'cap: word number': cmd('', 'Reply in two lines.'), 'cap: 7 lines': cmd('', 'Use 7 lines.'),
		'git commit unguarded': cmd('', 'Under 5 lines. Then git commit the work.'), 'git push guarded never': cmd('', 'Under 5 lines. Never git push.'), 'git tag only when': cmd('', 'Under 5 lines. git tag only when asked.'), 'git commit unless': cmd('', 'Under 5 lines. Do not run git commit.'), 'git word only': cmd('', 'Under 5 lines. A git history note.'),
	};
	for (const [k, v] of Object.entries(cmds)) out.commands[k] = lint.lintCommand('c/' + k + '.md', v);
	const mods = {
		'both shells': "on('tool.call', { tool: ['Bash', 'PowerShell'] })", 'bash only array': "{ tool: ['Bash'] }", 'powershell only string': "{ tool: 'PowerShell' }", 'bash only double quotes': '{ tool: "Bash" }', 'other tool': "{ tool: ['Read'] }", 'two filters one bad': "{ tool: ['Bash', 'PowerShell'] } { tool: ['Bash'] }",
		'destructure dollar': 'const { fs, session } = $;', 'destructure in params': 'register(({ fs }) => $.fs.read())', 'fine dollar': 'async ($, e, next) => { await $.fs.read(p); }', 'write handover': "$.fs.write('handover/a.md', t)", 'append handover': '$.fs.append(path + "handover/x")', 'read handover': "$.fs.read('handover/a.md')",
		'locks mention': 'reads handover/locks.d/', 'locks guarded': 'never reads handover/locks.d/', 'locks skip': 'we skip handover/locks.d', 'locks must not': 'must not touch handover/locks.d',
	};
	for (const [k, v] of Object.entries(mods)) out.mods[k] = lint.lintMod('m/' + k + '.ts', v);
	const scripts = {
		'exec string': "cp.exec('ls -la')", 'exec bare': 'exec(' + String.fromCharCode(96) + 'rm ' + String.fromCharCode(36) + '{x}' + String.fromCharCode(96) + ')', 'execSync': "execSync('git status')", 'child_process.exec': "child_process.exec('x')", 'exec with execFile': "cp.exec('x'); execFile('y', [])", 'execFile only': "execFile('node', ['x'])",
		'convert spawn': "spawnSync('convert', ['a','b'])", 'convert execFile': "execFile('convert', ['a'])", 'magick': "spawnSync('magick', ['a'])", 'convert in a string': "const s = 'convert me'",
		'cwd slash': "process.cwd() + '/x'", 'cwd join': "path.join(process.cwd(), 'x')", 'cwd double quote': 'process.cwd()+"/y"',
		'fetch remote': "fetch('https://api.example.com/x')", 'fetch local ip': "fetch('http://127.0.0.1:8000/x')", 'fetch localhost': "fetch('http://localhost:1/x')", 'fetch relative': "fetch('/api')", 'fetch backtick': 'fetch(' + String.fromCharCode(96) + 'https://x.dev/a' + String.fromCharCode(96) + ')',
	};
	for (const [k, v] of Object.entries(scripts)) { out.scripts[k] = lint.lintScript('skills/x/' + k + '.ts', v); }
	out.scripts['fetch remote under cloud'] = lint.lintScript('skills/cloud/x/a.ts', "fetch('https://api.example.com/x')");
	out.scripts['fetch remote near cloud'] = lint.lintScript('skills/cloudy/a.ts', "fetch('https://api.example.com/x')");
	out.advisory = [...lint.ADVISORY].sort();
	gold8('rules.json', JSON.stringify(out, null, 1) + NL8);
});

t('golden: a whole kit folder, with and without --strict and --only, and the CLI output', () => {
	const root = fs8.mkdtempSync(path8.join(os8.tmpdir(), 'lint kit-'));
	const put = (rel, text) => { const p = path8.join(root, rel); fs8.mkdirSync(path8.dirname(p), { recursive: true }); fs8.writeFileSync(p, text); };
	const good = 'Use whenever a form fails. Load this BEFORE editing.';
	put('skills/workflow/good.md', sk8('name: good' + NL8 + 'description: ' + good));
	for (let i = 0; i < 10; i++) put('skills/workflow/noname' + i + '.md', sk8('description: ' + good));
	put('skills/workflow/README.md', 'no frontmatter'); put('skills/workflow/extras.md', 'x'); put('skills/workflow/learnings.md', 'x'); put('skills/workflow/references/ref.md', sk8('description: bad one'));
	put('skills/node_modules/x/n.md', sk8('description: bad')); put('skills/workflow/opens-badly.md', sk8('name: ob' + NL8 + 'description: Helps. Load before'));
	put('skills/commands/c1.md', sk8('description: d' + NL8 + 'allowed-tools: Bash(*)', 'Under 5 lines.')); put('skills/commands/README.md', 'x');
	put('skills/workflow/tool.ts', "cp.exec('ls')"); put('skills/workflow/types.d.ts', "cp.exec('ls')"); put('skills/cloud/api/x.ts', "fetch('https://api.example.com/x')"); put('skills/workflow/remote.ts', "fetch('https://api.example.com/x')");
	put('mods/m1/hooks/register.ts', "{ tool: ['Bash'] }"); put('mods/m1/hooks/tests/t.ts', "{ tool: ['Bash'] }"); put('mods/m1/test/t2.ts', "{ tool: ['Bash'] }"); put('mods/m2/hooks/ok.ts', 'nothing wrong'); put('mods/m3/src/other.ts', "{ tool: ['Bash'] }");
	const out = { kit: {}, cli: {} };
	for (const [k, args] of Object.entries({ all: ['', false], strict: ['', true], skills: ['skills', false], 'skills strict': ['skills', true], commands: ['commands', false], mods: ['mods', false], 'unknown only': ['nothing', false] })) out.kit[k] = lint.lintKit(root, args[0], args[1]);
	const clean = (s) => s.split(CR8).join('').split(root).join('<root>').split(root.split(BS8).join('/')).join('<root>');
	const run = (...a) => { const r = spawn8(process.execPath, [path8.join(__dirname, '../skills/meta/skill-writer.lint.js'), ...a], { encoding: 'utf8' }); return { status: r.status, stdout: clean(r.stdout), stderr: clean(r.stderr) }; };
	out.cli.text = run('--root', root); out.cli.strict = run('--root', root, '--strict'); out.cli.json = run('--root', root, '--json'); out.cli.only = run('--root', root, '--only', 'commands'); out.cli.onlyMods = run('--root', root, '--only', 'mods', '--json');
	const small = fs8.mkdtempSync(path8.join(os8.tmpdir(), 'lint small-'));
	fs8.mkdirSync(path8.join(small, 'skills'), { recursive: true }); fs8.writeFileSync(path8.join(small, 'skills', 'g.md'), sk8('name: g' + NL8 + 'description: ' + good));
	out.cli.clean = run('--root', small); out.cli.cleanJson = run('--root', small, '--json');
	const one = fs8.mkdtempSync(path8.join(os8.tmpdir(), 'lint one-')); fs8.mkdirSync(path8.join(one, 'skills'), { recursive: true }); fs8.writeFileSync(path8.join(one, 'skills', 'g.md'), sk8('description: ' + good));
	out.cli.single = run('--root', one);
	const nine = fs8.mkdtempSync(path8.join(os8.tmpdir(), 'lint nine-')); fs8.mkdirSync(path8.join(nine, 'skills'), { recursive: true }); for (let i = 0; i < 9; i++) fs8.writeFileSync(path8.join(nine, 'skills', 'n' + i + '.md'), sk8('description: ' + good));
	out.cli.nine = run('--root', nine);
	const eight = fs8.mkdtempSync(path8.join(os8.tmpdir(), 'lint eight-')); fs8.mkdirSync(path8.join(eight, 'skills'), { recursive: true }); for (let i = 0; i < 8; i++) fs8.writeFileSync(path8.join(eight, 'skills', 'n' + i + '.md'), sk8('description: ' + good));
	out.cli.eight = run('--root', eight);
	let js8 = JSON.stringify(out, null, 1); for (const base of [root, small, one, nine, eight]) for (const form of [base, base.split(BS8).join(BS8 + BS8), base.split(BS8).join('/')]) js8 = js8.split(form).join('<root>');
	gold8('kit.json', js8 + NL8);
});
