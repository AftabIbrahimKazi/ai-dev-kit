// Every environment variable the kit's code reads must be listed in docs/env-variables.md, so the page never drifts.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, 'docs', 'env-variables.md'), 'utf8');
const OS_VARS = new Set(['HOME', 'USERPROFILE', 'PREFIX', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA', 'PATH', 'TMP', 'TEMP', 'APPDATA', 'NODE_ENV', 'CI', 'TERM', 'USER', 'USERNAME', 'SHELL', 'PWD', 'CLAUDE_PROJECT_DIR']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.next|tests|_sandbox|site|cloude|dist)$/.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };

const found = new Map();
for (const f of [...walk(path.join(root, 'skills')), ...walk(path.join(root, 'mods'))]) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_()]*)['"]\]|env\.get\(['"]([A-Z][A-Z0-9_]*)['"]\)/g)) {
    const name = m[1] || m[2] || m[3];
    if (!found.has(name)) found.set(name, path.relative(root, f));
  }
}

t('the scan finds the variables (guards against a broken regex)', () => {
  assert.ok(found.size >= 25, 'found ' + found.size);
  assert.ok(found.has('GEMINI_API_KEY') && found.has('LAYA_PORT'));
});

t('every variable the code reads is documented in docs/env-variables.md', () => {
  const missing = [...found].filter(([n]) => !OS_VARS.has(n) && !doc.includes('`' + n + '`')).map(([n, f]) => `${n} (${f})`);
  assert.deepStrictEqual(missing, []);
});

t('every secret in the code is marked secret on the page', () => {
  for (const n of found.keys()) {
    if (/(_API_KEY|_TOKEN|_ACCOUNT_ID)$/.test(n)) {
      const row = doc.split('\n').find((l) => l.includes('`' + n + '`')) || '';
      assert.ok(/\*\*secret\*\*/.test(row), n + ' is not marked secret');
    }
  }
});

if (failed) { console.log('env-dictionary.test: FAILED'); process.exit(1); }
console.log('env-dictionary.test: ok');
