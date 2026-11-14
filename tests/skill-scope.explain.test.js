// Plain-language error table, task-text repair, and the root finder, plus auto.js run from a nested folder.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { KNOWN, explain, tidyTask, findRoot } = require('../skills/meta/skill-scope.explain.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };

// One input per table row; every row must produce its own message and never a stack trace.
const CASES = {
  'wrong-cwd': ['Error: Cannot find module \'x\' code: MODULE_NOT_FOUND', { cwd: 'C:/p/sub', root: 'C:/p' }],
  'script-missing': ['code-audit/audit.js is not installed in this project (looked in x)', {}],
  'no-manifest': ['no install manifest at C:/p/.ai-dev-kit.json -- run install-kit first', { cwd: 'C:/p' }],
  'split-task': ['first word must be tsk-note or tsk-start', {}],
  'backslash-path': ['cannot open C:Usersibrahdesignexport.svg', {}],
  'no-node': ['node: command not found', {}],
  'no-chrome': ['no Chrome or Edge found', {}],
  'no-ollama': ['connect ECONNREFUSED 127.0.0.1:11434', {}],
};

for (const k of KNOWN) {
  t('explain row: ' + k.id, () => {
    const c = CASES[k.id];
    assert.ok(c, 'a test input exists for ' + k.id);
    const r = explain(new Error(c[0]), c[1]);
    assert.strictEqual(r.id, k.id);
    assert.ok(r.message.length > 20 && !/\n\s+at /.test(r.message));
  });
}

t('unknown error gets a cause line and a what-to-try line, no stack', () => {
  const r = explain(new Error('weird failure\n    at foo (bar.js:1:1)'));
  assert.strictEqual(r.id, 'unknown');
  assert.ok(/weird failure/.test(r.message) && /Try/.test(r.message) && !/bar\.js/.test(r.message));
});

t('wrong-cwd explanation names both folders and asks for auto-recover', () => {
  const r = explain(new Error('MODULE_NOT_FOUND'), { cwd: 'C:\\p\\sub', root: 'C:\\p' });
  assert.ok(r.message.includes('C:/p/sub') && r.message.includes('C:/p)') && r.recover === 'chdir-root');
});

t('tidyTask joins split words, drops newlines and fixes Windows paths', () => {
  assert.strictEqual(tidyTask(['tsk-note', 'fix', 'the', 'login']), 'tsk-note fix the login');
  assert.strictEqual(tidyTask(['fix\r\nthe\nlogin  page']), 'fix the login page');
  assert.strictEqual(tidyTask(['convert', 'C:\\Users\\me\\My Designs\\a.svg', 'now']), 'convert C:/Users/me/My Designs/a.svg now');
});

t('findRoot walks up to the folder holding .ai-dev-kit.json', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kitroot-'));
  const sub = path.join(d, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });
  assert.strictEqual(findRoot(sub), null);
  fs.writeFileSync(path.join(d, '.ai-dev-kit.json'), '{}');
  assert.strictEqual(findRoot(sub), d);
});

t('auto.js status run from a nested folder finds the project instead of crashing', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kitnest-'));
  const sub = path.join(d, 'x', 'y');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(d, '.ai-dev-kit.json'), JSON.stringify({ tool: 'claude', skillRoot: '.claude/skills', skills: {}, archived: {} }));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.auto.js'), 'status'], { cwd: sub, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(/assumed --root/.test(r.stderr) && /would archive/.test(r.stdout));
});

t('auto.js with no project anywhere prints the plain message, not a stack', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kitnone-'));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.auto.js'), 'status'], { cwd: d, encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.ok(/No kit install found/.test(r.stderr) && !/\n\s+at /.test(r.stderr));
});

if (failed) { console.log('skill-scope.explain.test: FAILED'); process.exit(1); }
console.log('skill-scope.explain.test: ok');
