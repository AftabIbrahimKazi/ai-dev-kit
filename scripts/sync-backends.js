#!/usr/bin/env node
// Build step: the shared backend cascade is compiled once (plan-first.backends.js) and copied, byte for byte, next to each skill
// that uses it. The installer ships companions per skill and has no shared-library mechanism, so every consumer carries its own copy.
// tests/plan-first.backends.test.js fails if a copy drifts. Add a consumer by listing it here.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SOURCE = 'skills/workflow/plan-first.backends.js';
const COPIES = ['skills/workflow/test-run.backends.js', 'skills/mcp/mcp-manager.backends.js'];

const src = fs.readFileSync(path.join(root, SOURCE));
for (const c of COPIES) {
  const dest = path.join(root, c);
  if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(src)) { fs.writeFileSync(dest, src); console.log('synced ' + c); }
}
