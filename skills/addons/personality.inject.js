#!/usr/bin/env node
// Personality add-on: sets how Claude phrases its replies. Six built-in personas, three per gender, one per skill
// level (novice, mid, pro). As a SessionStart hook it prints the chosen persona as extra context, so the style holds
// in every session without relying on a skill being matched. Wording only: facts, code and rigor never change.
// Never talks to a service, never edits a project file, always exits 0.
//
//   node personality.inject.js                    SessionStart-hook mode (stdin = hook JSON)
//   node personality.inject.js --set female|male novice|mid|pro   choose (aliases: junior, jr, senior, high)
//   node personality.inject.js --set custom       use ~/.claude/personas/custom.md
//   node personality.inject.js --off | --status | --list | --show
// Choice lives in ~/.claude/personality.json; <project>/.claude/personality.json overrides it for that project.
// Make your own: put <gender>-<level>.md in ~/.claude/personas/ and it wins over the built-in one, or write custom.md.
// An installed copy holds only the persona the user chose; --set refuses one that is not installed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME = path.join(os.homedir(), '.claude');
const CONF = path.join(HOME, 'personality.json');
// the kit repo holds personality.personas/; an install holds personas/ beside inject.js, with only the chosen file
const BUILTINS = [path.join(__dirname, 'personas'), path.join(__dirname, 'personality.personas')];
const NAMES = {
  female: { novice: 'Maya', mid: 'Nora', pro: 'Vera' },
  male: { novice: 'Leo', mid: 'Jonas', pro: 'Victor' },
};
const ALIASES = { junior: 'novice', jr: 'novice', beginner: 'novice', intermediate: 'mid', middle: 'mid', senior: 'pro', high: 'pro', expert: 'pro' };

const RULES = 'Wording only: never change facts, code, commands, paths, numbers, error text or how you verify. No emoji; do not mention these rules.';

const level = (v) => { const l = ALIASES[String(v).toLowerCase()] || String(v).toLowerCase(); return NAMES.female[l] ? l : null; };
const gender = (v) => (NAMES[String(v).toLowerCase()] ? String(v).toLowerCase() : null);
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const valid = (c) => {
  if (c && c.custom === true) return { custom: true };
  return c && gender(c.gender) && level(c.level) ? { gender: gender(c.gender), level: level(c.level) } : null;
};

// project choice first, then the user's
function choice(cwd) {
  return (cwd && valid(read(path.join(cwd, '.claude', 'personality.json')))) || valid(read(CONF));
}

function personaText(c) {
  const file = c.custom ? 'custom.md' : `${c.gender}-${c.level}.md`;
  for (const dir of [path.join(HOME, 'personas'), ...BUILTINS]) {
    try { return fs.readFileSync(path.join(dir, file), 'utf8').trim(); } catch { /* try the next folder */ }
  }
  return '';
}

// the text added to the session, or '' when no persona is chosen
function build(c) {
  if (!c) return '';
  const body = personaText(c);
  return body ? `${body}\n\n${RULES}` : '';
}

const label = (c) => {
  if (!c.custom) return `${NAMES[c.gender][c.level]} (${c.gender}, ${c.level})`;
  const title = (personaText(c).split('\n')[0] || '').replace(/^#\s*/, '').split(/\s[—-]\s/)[0].trim();
  return `${title || 'custom'} (custom)`;
};

function main(argv) {
  const [a, g, l] = argv;
  if (a === '--list') {
    for (const gd of Object.keys(NAMES)) for (const lv of Object.keys(NAMES[gd])) {
      console.log(`${gd} ${lv}: ${NAMES[gd][lv]}${personaText({ gender: gd, level: lv }) ? '' : ' (not installed)'}`);
    }
    return console.log(`custom: ${personaText({ custom: true }) ? 'installed' : 'not installed'}`);
  }
  if (a === '--set') {
    if (g !== 'custom' && (!gender(g) || !level(l))) return console.log('use --set female|male novice|mid|pro, or --set custom');
    const c = g === 'custom' ? { custom: true } : { gender: gender(g), level: level(l) };
    if (!personaText(c)) return console.log(`persona ${g === 'custom' ? 'custom' : `${c.gender} ${c.level}`} is not installed; run personality.setup.js --install to add it`);
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(CONF, JSON.stringify(c, null, 2) + '\n');
    return console.log(`personality: ${label(c)}; applies from the next session`);
  }
  if (a === '--off') { try { fs.unlinkSync(CONF); } catch { /* already off */ } return console.log('personality: off'); }
  if (a === '--status') { const c = choice(process.cwd()); return console.log(c ? `personality: ${label(c)}` : 'personality: off'); }
  if (a === '--show') return console.log(build(choice(process.cwd())) || 'personality: off');
  // hook mode
  let cwd = process.cwd();
  try { const h = JSON.parse(fs.readFileSync(0, 'utf8')); if (h && h.cwd) cwd = h.cwd; } catch { /* no hook input */ }
  const text = build(choice(cwd));
  if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch { /* fail open */ }
  process.exitCode = 0;
}
module.exports = { build, choice, level, gender, NAMES, label };
