// Token and structure audit: compares the git baseline (HEAD) with the working tree. Tokens ~ chars / 4.
// Usage: node audit.js <kitRepo> <scratchProj>
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const [kit, proj] = process.argv.slice(2);
const tok = (s) => Math.round(s.length / 4);
const git = (args) => spawnSync('git', args, { cwd: kit, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout;
const headFiles = git(['ls-tree', '-r', 'HEAD', '--name-only']).split('\n').filter(Boolean);
const readHead = (f) => git(['show', `HEAD:${f}`]);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === '.git' || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const nowFiles = walk(kit).map((f) => path.relative(kit, f).split(path.sep).join('/'));
const readNow = (f) => fs.readFileSync(path.join(kit, f), 'utf8').split('\r\n').join('\n');

const fm = (text) => { const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return null; const o = {}; for (const l of m[1].split(/\r?\n/)) { const k = /^(\w[\w-]*):\s*(.*)$/.exec(l); if (k) o[k[1]] = k[2]; } return o; };
function surface(files, read) {
  const s = { skills: [], commands: [], contract: 0, aiStd: 0, skillBodies: {} };
  for (const f of files) {
    if (/^skills\/commands\/[^/]+\.md$/.test(f)) { const o = fm(read(f)); if (o) s.commands.push({ name: path.basename(f, '.md'), desc: o.description || '' }); }
    else if (/^skills\/.+\.md$/.test(f)) { const t = read(f); const o = fm(t); if (o && o.name) { s.skills.push({ name: o.name, desc: o.description || '', file: f }); s.skillBodies[o.name] = tok(t); } }
  }
  const c = files.includes('coding-standards/CLAUDE.example.md') ? read('coding-standards/CLAUDE.example.md') : '';
  s.contract = tok(c);
  s.aiStd = tok(files.includes('coding-standards/ai-standards.md') ? read('coding-standards/ai-standards.md') : '');
  return s;
}
const before = surface(headFiles, readHead);
const after = surface(nowFiles, readNow);
// the always-on description cost of a typical Claude Code install: universal + workflow + standards + memory + meta + claude models
const typical = (s) => s.skills.filter((x) => !/\/(addons|mcp|stack|libraries)\//.test(x.file) && !/opencode|big-pickle|deepseek|devstral|glm-5|gpt-oss|kimi|local-small|mimo|minimax|qwen3/.test(x.name) && x.name !== 'install-kit');
const sum = (arr, f) => arr.reduce((n, x) => n + tok(f(x)), 0);
const nameDelta = (a, b) => b.filter((x) => !a.some((y) => y.name === x.name)).map((x) => x.name);

console.log('== always-on surface (tokens ~ chars/4) ==');
const row = (label, b, a) => console.log(`${label.padEnd(44)} before ${String(b).padStart(6)}   after ${String(a).padStart(6)}   delta ${String(a - b >= 0 ? '+' + (a - b) : a - b).padStart(6)}`);
const tb = typical(before); const ta = typical(after);
row(`skill descriptions, typical install (${tb.length} -> ${ta.length} skills)`, sum(tb, (x) => x.name + ' ' + x.desc), sum(ta, (x) => x.name + ' ' + x.desc));
row(`command descriptions (${before.commands.length} -> ${after.commands.length})`, sum(before.commands, (x) => '/' + x.name + ' ' + x.desc), sum(after.commands, (x) => '/' + x.name + ' ' + x.desc));
row('CLAUDE.example.md (loaded every session)', before.contract, after.contract);
row('ai-standards.md (loaded with the standards)', before.aiStd, after.aiStd);
console.log('\n== new skills and commands ==');
for (const n of nameDelta(before.skills, after.skills)) { const x = after.skills.find((y) => y.name === n); console.log(`skill ${n.padEnd(18)} desc ${String(x.desc.split(/\s+/).length).padStart(3)} words / ${String(tok(x.desc)).padStart(3)} tok   body ${String(after.skillBodies[n]).padStart(5)} tok`); }
for (const n of nameDelta(before.commands, after.commands)) { const x = after.commands.find((y) => y.name === n); console.log(`command /${n.padEnd(16)} desc ${String(x.desc.split(/\s+/).length).padStart(3)} words / ${String(tok(x.desc)).padStart(3)} tok`); }
console.log('\n== changed existing skills (body tokens before -> after) ==');
for (const x of after.skills) { const b = before.skillBodies[x.name]; if (b !== undefined && b !== after.skillBodies[x.name]) console.log(`${x.name.padEnd(20)} ${b} -> ${after.skillBodies[x.name]}`); }
console.log('\n== skill-writer checklist on new skills ==');
for (const n of nameDelta(before.skills, after.skills)) {
  const x = after.skills.find((y) => y.name === n); const t = readNow(x.file);
  const lines = t.split('\n').length; const words = x.desc.split(/\s+/).length;
  const flags = [];
  if (!/^Use whenever|^Opt-in/.test(x.desc.replace(/^"|"$/g, ''))) flags.push('description not situation-first');
  if (!/Load this BEFORE/.test(x.desc)) flags.push('no "Load this BEFORE"');
  if (words > 40) flags.push(`description ${words} words (cap ~40)`);
  if (lines > 120) flags.push(`${lines} lines (cap ~120)`);
  if (!/Self-improvement/.test(t)) flags.push('no self-improvement loop');
  console.log(`${n.padEnd(18)} ${lines} lines, desc ${words} words  ${flags.length ? 'FLAGS: ' + flags.join('; ') : 'ok'}`);
}
console.log('\n== command templates point at real installed companions ==');
for (const f of nowFiles.filter((x) => /^skills\/commands\/[^/]+\.md$/.test(x))) {
  const t = readNow(f);
  for (const m of t.matchAll(/\{\{skill-root\}\}\/([\w-]+)\/([\w.-]+)/g)) {
    const p = path.join(proj, '.claude', 'skills', m[1], m[2]);
    if (!fs.existsSync(p)) console.log(`MISSING ${path.basename(f)} -> ${m[1]}/${m[2]}`);
  }
}
console.log('(no MISSING lines above means every command resolves)');
