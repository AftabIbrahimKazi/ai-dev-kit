// Every slash command that takes arguments must carry an argument-hint, or the menu shows no variants to a first-time user.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../skills/commands');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
  t(`${f}: argument-hint present when $ARGUMENTS is used`, () => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = s.split(/^---\r?$/m)[1] || '';
    if (!s.includes('$ARGUMENTS')) return;
    const m = /^argument-hint: (.+?)\r?$/m.exec(fm);
    assert.ok(m, 'missing argument-hint');
    assert.ok(!/^\[/.test(m[1]) || /^'.*'$/.test(m[1]), 'a hint starting with [ must be single-quoted');
  });
}
