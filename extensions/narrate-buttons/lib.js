// Pure helpers for the kit control panel (no vscode import, so tests/narrate-buttons.test.js can run them in plain Node).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAUDE = path.join(os.homedir(), '.claude');
const LIMITS = { volume: [0, 100, 100, 10], speed: [0.5, 2, 1, 0.1], pitch: [-12, 12, 0, 1], maxSeconds: [30, 1800, 1110, 30] }; // min, max, default, step
const LABELS = { volume: 'Volume', speed: 'Speed', pitch: 'Pitch', maxSeconds: 'Reads up to (s)' };

// Each script the panel runs: where an installed copy lives under .claude/skills, and the file name in the kit checkout.
const SCRIPTS = {
  speak: ['narrate/speak.js', 'skills/addons/narrate.speak.js'],
  persona: ['personality/inject.js', 'skills/addons/personality.inject.js'],
  laya: ['system1-prefilter/laya-ctl.js', 'skills/addons/system1-prefilter.laya-ctl.js'],
};

// First existing copy of a script: an explicit path, then an install in the workspace, in the home folder, then the kit checkout.
function findScript(name, explicit, workspaces, home = os.homedir(), exists = fs.existsSync) {
  const [installed, kit] = SCRIPTS[name];
  const candidates = [explicit, ...workspaces.flatMap((w) => [path.join(w, '.claude', 'skills', installed), path.join(w, kit)]), path.join(home, '.claude', 'skills', installed)].filter(Boolean);
  return candidates.find((p) => exists(p)) || null;
}
const findSpeak = (explicit, workspaces, home, exists) => findScript('speak', explicit, workspaces, home, exists);

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
const readConf = (file = path.join(CLAUDE, 'narrate.json')) => readJson(file);
const readLast = (file = path.join(CLAUDE, 'narrate-last.json')) => readJson(file);
const isMuted = (dir = CLAUDE) => fs.existsSync(path.join(dir, 'narrate.off'));

// The value after pressing a +/- control, clamped and rounded to two places like speak.js.
function nudged(key, conf, dir) {
  const [lo, hi, def, step] = LIMITS[key];
  const cur = conf[key] !== undefined && conf[key] !== '' && Number.isFinite(Number(conf[key])) ? Number(conf[key]) : def;
  return Math.round(Math.min(hi, Math.max(lo, cur + dir * step)) * 100) / 100;
}
const modeOf = (conf) => (conf.mode === 'auto' ? 'auto' : 'manual'); // manual = a play button, like claude.ai

// Persona choices from `inject.js --list` output ("female novice: Name" lines) for a quick pick.
function parsePersonas(listOutput) {
  return listOutput.split(/\r?\n/).map((l) => /^(female|male) (novice|mid|pro): (.+?)( \(not installed\))?$/.exec(l)).filter((m) => m && !m[4]).map((m) => ({ gender: m[1], level: m[2], label: `${m[1]} ${m[2]} — ${m[3]}` }));
}

// The tree: groups of rows. `command` + `args` is what a click runs; `contextValue` selects the inline +/- buttons.
function buildTree(s) {
  const conf = s.conf || {};
  const num = (k) => (conf[k] !== undefined ? conf[k] : LIMITS[k][2]);
  const narration = [
    { id: 'play', label: s.pending ? 'Play latest reply' : 'Play last reply', description: s.pending ? 'new reply waiting' : '', icon: 'play', command: 'narrateButtons.play', highlight: !!s.pending },
    { id: 'stop', label: 'Stop speaking', icon: 'debug-stop', command: 'narrateButtons.stop' },
    { id: 'mode', label: 'When to speak', description: modeOf(conf) === 'auto' ? 'auto: every reply' : 'play button (like claude.ai)', icon: 'broadcast', command: 'narrateButtons.toggleMode' },
    { id: 'mute', label: 'Narration', description: s.muted ? 'muted' : 'on', icon: s.muted ? 'mute' : 'unmute', command: 'narrateButtons.toggleMute' },
    { id: 'voice', label: 'Voice', description: conf.gender === 'male' ? 'male' : 'female', icon: 'account', command: 'narrateButtons.switchVoice' },
    ...Object.keys(LIMITS).map((k) => ({ id: k, key: k, label: LABELS[k], description: String(num(k)), icon: 'settings', contextValue: 'stepper' })),
  ];
  return [
    { id: 'narration', label: 'Narration', icon: 'unmute', children: narration },
    { id: 'persona', label: 'Persona', icon: 'person', children: [{ id: 'persona', label: 'Persona', description: s.persona || '…', icon: 'person', command: 'narrateButtons.pickPersona' }] },
  ];
}

// The popup tray: the same rows as the sidebar, flattened under separators. Rows that change a setting keep the tray open
// (keepOpen) so volume or speed can be nudged several times; `stepper` rows get inline -/+ buttons instead of a command.
const CLOSES = new Set(['narrateButtons.play', 'narrateButtons.stop', 'narrateButtons.pickPersona', 'narrateButtons.openPanel']);
function trayItems(state) {
  const out = [];
  for (const g of buildTree(state)) {
    out.push({ separator: true, label: g.label });
    for (const c of g.children) out.push({ id: c.id, key: c.key, icon: c.icon, label: c.label, description: c.description || '', command: c.command, stepper: c.contextValue === 'stepper', keepOpen: !CLOSES.has(c.command), highlight: !!c.highlight });
  }
  out.push({ separator: true, label: 'More' }, { id: 'panel', icon: 'layout-sidebar-left', label: 'Open full panel', command: 'narrateButtons.openPanel', keepOpen: false });
  return out;
}

module.exports = { trayItems, findScript, findSpeak, readConf, readLast, isMuted, nudged, modeOf, parsePersonas, buildTree, LIMITS, SCRIPTS };
