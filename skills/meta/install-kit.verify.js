#!/usr/bin/env node
// Mechanical half of install-kit: checks an install actually landed the way the skill's Step 4
// claims, instead of trusting the agent's own narration of what it did. Every check here catches
// a failure mode that "looks installed" but silently breaks the first real session:
//   - a skill folder nested under its old category (tool never discovers it)
//   - a .js companion with no commonjs package.json shield (Node refuses to load it)
//   - the session-protocol file missing, or still carrying the unfilled Context-code placeholder
//   - comment-style installed but never answered (still the library's unset default)
//   - coding-standards/ present without its index.md
// Exits 0 when every check that applies passes, 1 otherwise. No network; read-only, except with --finish.
//
//   node install-kit.verify.js --root <project> --tool claude|opencode|codex [--json] [--finish]
//
// --finish: when (and only when) every check passes, delete the installed install-kit folder from the project's
// skill roots. Setup is done and the installer serves no purpose in the project; later additions run from the kit
// repo. It never removes the kit library's own install-kit and never touches anything else.
const fs = require('node:fs');
const path = require('node:path');

const ROOTS = {
  claude: { skills: '.claude/skills', protocol: 'CLAUDE.md' },
  opencode: { skills: '.opencode/skills', protocol: 'AGENTS.md' },
  codex: { skills: '.agents/skills', protocol: 'AGENTS.md' },
};

function parseArgs(argv) {
  const a = { root: '.', tool: 'claude' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--root') a.root = argv[++i];
    else if (k === '--tool') a.tool = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--finish') a.finish = true;
  }
  return a;
}

const add = (findings, level, check, message) => findings.push({ level, check, message });

function checkSkillLayout(root, skillsDir, findings) {
  const abs = path.join(root, skillsDir);
  if (!fs.existsSync(abs)) { add(findings, 'info', 'layout', `no skill root at ${skillsDir} (nothing installed yet, or a different tool)`); return []; }
  const entries = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory());
  const names = [];
  for (const e of entries) {
    const folder = path.join(abs, e.name);
    const skillFile = path.join(folder, 'SKILL.md');
    if (fs.existsSync(skillFile)) { names.push(e.name); continue; }
    // No SKILL.md directly inside: likely a leftover category folder (nested install bug) rather than a skill.
    const nested = fs.readdirSync(folder, { withFileTypes: true }).filter((x) => x.isDirectory());
    const nestedHasSkills = nested.some((n) => fs.existsSync(path.join(folder, n.name, 'SKILL.md')));
    if (nestedHasSkills) add(findings, 'fail', 'layout', `${skillsDir}/${e.name}/ nests category subfolders with their own SKILL.md -- flat layout is required, no tool discovers skills nested like this`);
    else add(findings, 'fail', 'layout', `${skillsDir}/${e.name}/ has no SKILL.md -- not a valid skill folder`);
  }
  return names.map((n) => path.join(abs, n));
}

function checkCommonjsShield(root, skillsDir, skillFolders, findings) {
  const needsShield = skillFolders.some((f) => fs.readdirSync(f).some((n) => n.endsWith('.js')));
  if (!needsShield) return;
  const pkg = path.join(root, skillsDir, 'package.json');
  if (!fs.existsSync(pkg)) { add(findings, 'fail', 'commonjs-shield', `a .js companion is installed under ${skillsDir} but ${skillsDir}/package.json is missing -- Node will refuse to load it in a "type": "module" project`); return; }
  let body = '';
  try { body = fs.readFileSync(pkg, 'utf8'); } catch { /* fall through to the next check */ }
  if (!/"type"\s*:\s*"commonjs"/.test(body)) add(findings, 'fail', 'commonjs-shield', `${skillsDir}/package.json exists but does not set "type": "commonjs"`);
}

function checkSessionProtocol(root, protocolFile, findings) {
  const abs = path.join(root, protocolFile);
  if (!fs.existsSync(abs)) { add(findings, 'fail', 'session-protocol', `${protocolFile} is missing -- the detected tool will start every session with no contract`); return; }
  const body = fs.readFileSync(abs, 'utf8');
  if (!/\[CX/.test(body)) { add(findings, 'fail', 'session-protocol', `${protocolFile} exists but has no [CX] rule -- it isn't the standards template, or it was stripped`); return; }
  if (/\[2[–-]4 chars you choose/.test(body)) add(findings, 'fail', 'session-protocol', `${protocolFile}'s Context code row still has the unfilled placeholder -- RULE AI-01 was never actually set`);
}

function checkCommentStyle(skillFolders, findings) {
  const folder = skillFolders.find((f) => path.basename(f) === 'comment-style');
  if (!folder) return;
  const body = fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8');
  const m = body.match(/\*\*Active level:\s*([a-z]*)\*\*/);
  if (!m || !['none', 'terse', 'descriptive'].includes(m[1])) add(findings, 'fail', 'comment-style', `comment-style is installed but its Active level was never set to none/terse/descriptive`);
}

function checkStandards(root, findings) {
  const dir = path.join(root, 'coding-standards');
  if (!fs.existsSync(dir)) { add(findings, 'info', 'standards', 'no coding-standards/ folder (not installed, or deliberately skipped)'); return; }
  if (!fs.existsSync(path.join(dir, 'index.md'))) add(findings, 'fail', 'standards', 'coding-standards/ exists but index.md is missing -- an incomplete or corrupted copy');
}

function verify(args) {
  const tool = ROOTS[args.tool];
  if (!tool) return { ok: false, findings: [{ level: 'fail', check: 'args', message: `--tool must be one of ${Object.keys(ROOTS).join('|')}` }] };
  const findings = [];
  const skillFolders = checkSkillLayout(args.root, tool.skills, findings);
  checkCommonjsShield(args.root, tool.skills, skillFolders, findings);
  checkSessionProtocol(args.root, tool.protocol, findings);
  checkCommentStyle(skillFolders, findings);
  checkStandards(args.root, findings);
  return { ok: !findings.some((f) => f.level === 'fail'), findings };
}

function finish(root) {
  const out = { removed: [], kept: [] };
  if (fs.existsSync(path.join(root, 'skills', 'meta', 'install-kit.md'))) { out.kept.push('this is the kit library itself; its install-kit is the source and stays'); return out; }
  for (const t of Object.values(ROOTS)) {
    const dir = path.join(root, t.skills, 'install-kit');
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); out.removed.push(`${t.skills}/install-kit`); }
    catch (e) { out.kept.push(`${t.skills}/install-kit could not be removed (${e.message}); delete it by hand`); }
  }
  if (!out.removed.length && !out.kept.length) out.kept.push('no installed install-kit found, nothing to remove');
  return out;
}

module.exports = { verify, finish, ROOTS };

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const res = verify(args);
  if (args.finish) res.finish = res.ok ? finish(args.root) : { removed: [], kept: ['install failed verification; install-kit kept so the install can be fixed'] };
  if (args.json) console.log(JSON.stringify(res));
  else {
    for (const f of res.findings) console.log(`${f.level.toUpperCase().padEnd(4)} ${f.check}: ${f.message}`);
    console.log(res.ok ? '\ninstall-kit.verify: clean' : '\ninstall-kit.verify: FAILED -- fix the above before calling the install done');
    if (res.finish) {
      for (const r of res.finish.removed) console.log(`removed ${r}`);
      for (const k of res.finish.kept) console.log(`kept: ${k}`);
    }
  }
  process.exit(res.ok ? 0 : 1);
}
