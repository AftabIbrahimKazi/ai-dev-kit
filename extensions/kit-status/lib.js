// Pure helpers for the kit status extension (no vscode import, so tests/kit-status.test.js runs them in plain Node).
// Reads what the feature-usage mod writes: one name-only row per use in ~/.ai-dev-kit/usage/log/<date>-<session>.jsonl.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const logDir = (h = home()) => path.join(h, 'usage', 'log');

// Same rule as the mod (mods/feature-usage/hooks/match.ts slug): rows carry this key, not the folder path.
const slug = (cwd) => String(cwd).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project';

// {track, notify}: no file means tracking on and notices on (the mod's defaults); only an explicit false turns one off.
function readConfig(h = home()) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(h, 'usage', 'config.json'), 'utf8'));
    return { track: j.track !== false, notify: j.notify !== false };
  } catch { return { track: true, notify: true }; }
}

// Rows from text. A line that is not valid JSON, or is not a row, is skipped (a write can be caught half done).
function parseRows(text) {
  const out = [];
  for (const l of String(text).split(/\r?\n/)) {
    if (!l.trim()) continue;
    try { const r = JSON.parse(l); if (r && typeof r.name === 'string' && r.kind) out.push(r); } catch { /* partial line */ }
  }
  return out;
}

// Reads only what was appended since `offsets[file]`, so a long log is never re-read. The partial last line (no newline yet) is
// left for the next poll. Returns the rows and the new offsets. With `skipExisting`, it only records where each file ends.
function readNew(dir, offsets, skipExisting = false) {
  const rows = [];
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { return { rows, offsets }; }
  const next = { ...offsets };
  for (const n of names) {
    const file = path.join(dir, n);
    let size;
    try { size = fs.statSync(file).size; } catch { continue; }
    if (skipExisting) { next[file] = size; continue; }
    const from = next[file] === undefined ? 0 : next[file];
    if (size < from) { next[file] = 0; continue; } // truncated or replaced
    if (size === from) continue;
    let buf = '';
    try {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(size - from);
      fs.readSync(fd, b, 0, b.length, from);
      fs.closeSync(fd);
      buf = b.toString('utf8');
    } catch { continue; }
    const cut = buf.lastIndexOf('\n');
    if (cut < 0) continue; // no complete line yet
    next[file] = from + Buffer.byteLength(buf.slice(0, cut + 1), 'utf8');
    rows.push(...parseRows(buf.slice(0, cut + 1)));
  }
  return { rows, offsets: next };
}

// What a row is called on screen: "skill code-audit", "script skill-scope/role.js show".
const labelOf = (r) => `${r.kind} ${r.name}${r.detail ? ' ' + r.detail : ''}`;

// Session state: how many uses and how many distinct features, plus which rows are the first of their feature this session.
function createTally(project) {
  const seen = new Set();
  const uses = new Map();
  let total = 0;
  return {
    // Returns { first, row } when the row counts for this folder, else null.
    add(r) {
      if (project && r.project !== project) return null;
      const id = `${r.sid}|${r.kind}|${r.name}`;
      const first = !seen.has(id);
      seen.add(id);
      total++;
      const key = `${r.kind} ${r.name}`;
      uses.set(key, (uses.get(key) || 0) + 1);
      return { first, row: r };
    },
    total: () => total,
    features: () => uses.size,
    list: () => [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`),
  };
}

const barText = (tally, cfg) => (!cfg.track ? '$(circle-slash) kit: off' : `$(pulse) kit: ${tally.features()}`);

module.exports = { home, logDir, slug, readConfig, parseRows, readNew, labelOf, createTally, barText };
