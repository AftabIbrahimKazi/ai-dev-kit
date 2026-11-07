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
