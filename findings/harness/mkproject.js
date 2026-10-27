// Builds a scratch project with the kit installed the way install-kit does (flat skill folders, companions renamed,
// CommonJS shield, standards folder, filled-in CLAUDE.md). Usage: node mkproject.js <kitRepo> <outDir>
const fs = require('node:fs');
const path = require('node:path');
const [kit, out] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
const skillsDir = path.join(out, '.claude', 'skills');
fs.mkdirSync(skillsDir, { recursive: true });

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const all = walk(path.join(kit, 'skills')).map((f) => f.split(path.sep).join('/'));
const nameOf = (f) => { if (!f.endsWith('.md')) return null; const m = /^---\r?\nname:\s*(\S+)/.exec(fs.readFileSync(f, 'utf8')); return m ? m[1] : null; };
const skip = (f, name) => /\/skills\/(commands|mcp|stack|libraries)\//.test(f) || /\/skills\/addons\//.test(f) && name !== 'project-context' || name === 'install-kit' || /opencode/.test(name || '');
const skills = [];
for (const f of all) { const n = nameOf(f); if (n && !skip(f, n)) skills.push({ f, n }); }
for (const { f, n } of skills) {
  const dir = path.join(skillsDir, n);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(f, path.join(dir, 'SKILL.md'));
  const base = path.basename(f, '.md');
  for (const c of all) {
    if (path.dirname(c) !== path.dirname(f) || c === f || !path.basename(c).startsWith(base + '.')) continue;
    fs.copyFileSync(c, path.join(dir, path.basename(c).slice(base.length + 1)));
  }
}
fs.writeFileSync(path.join(skillsDir, 'package.json'), '{ "type": "commonjs" }');
fs.cpSync(path.join(kit, 'coding-standards'), path.join(out, 'coding-standards'), { recursive: true });
let tpl = fs.readFileSync(path.join(kit, 'coding-standards', 'CLAUDE.example.md'), 'utf8');
tpl = tpl.replace(/^\| Context code \|.*\|$/m, '| Context code | X7 |').replace('[Project Name]', 'Scratch').replace(/\[[^\]]+\]/g, (m) => (m.startsWith('[CX') || m.startsWith('[CLAUDE') ? m : m));
fs.writeFileSync(path.join(out, 'CLAUDE.md'), tpl);
// a small web project to talk about
fs.mkdirSync(path.join(out, 'src', 'styles'), { recursive: true });
fs.mkdirSync(path.join(out, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ name: 'scratch', dependencies: { astro: '5.0.0' } }));
fs.writeFileSync(path.join(out, 'src', 'index.html'), '<header class="ex-header"><nav>Home</nav></header>\n');
fs.writeFileSync(path.join(out, 'src', 'styles', 'main.css'), '.ex-header { display: flex; }\n');
fs.writeFileSync(path.join(out, 'public', 'img', 'hero.png'), Buffer.alloc(4 * 1024 * 1024, 1));
fs.writeFileSync(path.join(out, 'handover.md'), '');
fs.rmSync(path.join(out, 'handover.md'));
console.log(JSON.stringify({ skills: skills.map((s) => s.n).sort() }));
