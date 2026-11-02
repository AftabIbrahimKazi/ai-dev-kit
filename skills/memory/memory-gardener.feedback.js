#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrub = scrub;
exports.run = run;
// Collects lessons that would help any project (not just this one) into a local, never-committed file, for memory-gardener.
// It never pushes, sends or opens anything. Sharing a lesson with a public kit repo is a manual step by the owner.
//
//   node feedback.js add --skill <name> --text "<lesson>" [--cwd D]
//   node feedback.js cost <--sid ID | --last N | --all> [--min-turns N] [--dir D] [--cwd D]
//                                          one token-cost line per session from the budget-ledger (totals, cost, top tool sinks); re-running updates the same session's line
//   node feedback.js check [--cwd D]       scrub-check the whole file; exit 1 if anything is flagged
//   node feedback.js list  [--cwd D]       first 30 bullets
//
// The file is kit-feedback.md in the project root. It is created only by `add`, and the script adds it to .gitignore.
// `add` refuses a lesson the scrub flags (URL, email, IP, absolute path, long token, or a word in a deny list).
// Deny lists, one word or phrase per line: .kit-feedback-deny in the project root (also gitignored) and
// ~/.ai-dev-kit/feedback-deny.txt for words that apply to every project, such as an employer name.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const FILE = 'kit-feedback.md';
const DENY_LOCAL = '.kit-feedback-deny';
const HEADER = [
    '# Kit feedback (local only)',
    '',
    'Lessons that may help any project. This file is in .gitignore and is never pushed by any kit script.',
    'This kit is public: before sharing any of this, remove company, client and product details.',
    '',
    '',
].join('\n');
const PATTERNS = [
    { name: 'URL', re: /\bhttps?:\/\/\S+/i },
    { name: 'email address', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
    { name: 'IP address', re: /\b\d{1,3}(\.\d{1,3}){3}\b/ },
    { name: 'absolute path', re: /(^|[\s`(])([A-Za-z]:[\\/]|\/(home|Users|var|etc|opt|srv|mnt)\/|\\\\[\w-]+\\)/ },
    { name: 'internal host name', re: /\b[\w-]+\.(internal|corp|local|intra|lan)\b/i },
    { name: 'long token (possible key)', re: /\b[A-Za-z0-9_-]{32,}\b/ },
];
function denyWords(cwd) {
    const words = [];
    for (const f of [path.join(cwd, DENY_LOCAL), path.join(os.homedir(), '.ai-dev-kit', 'feedback-deny.txt')]) {
        try {
            for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
                const w = l.trim();
                if (w && !w.startsWith('#'))
                    words.push(w.toLowerCase());
            }
        }
        catch { /* no list here */ }
    }
    return words;
}
// Why a line should not be shared, or an empty list when it looks clean.
function scrub(line, deny) {
    const why = [];
    for (const p of PATTERNS)
        if (p.re.test(line))
            why.push(p.name);
    const low = line.toLowerCase();
    for (const w of deny)
        if (low.includes(w))
            why.push('deny-list entry "' + w + '"');
    return why;
}
function ensureIgnored(cwd, entries) {
    const gi = path.join(cwd, '.gitignore');
    const body = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    const have = new Set(body.split(/\r?\n/).map((l) => l.trim()));
    const missing = entries.filter((e) => !have.has(e));
    if (!missing.length)
        return;
    const sep = body && !body.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gi, body + sep + missing.join('\n') + '\n');
}
function arg(argv, name) {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
}
const COST_TAG = '[token-cost]';
const COST_MIN_TURNS = 3;
const COST_TOP_TOOLS = 4;
const TOOL_NAME_MAX = 28; // keeps long MCP tool names under the long-token scrub
const CHARS_PER_TOKEN = 4; // estimate, same as session-budget report.js
function readLedgerRows(dir) {
    if (!fs.existsSync(dir))
        return [];
    const rows = [];
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
        for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
            if (!l.trim())
                continue;
            try {
                rows.push(JSON.parse(l));
            }
            catch { /* skip a torn line */ }
        }
    }
    return rows;
}
// One scrub-safe line per session: totals, cost, and which tools put the most result text into context.
function costLine(sid, rows) {
    const sorted = rows.slice().sort((a, b) => a.ts.localeCompare(b.ts));
    const n = (v) => v.toLocaleString('en-US');
    const sum = (k) => sorted.reduce((s, r) => s + r[k], 0);
    const prompt = sum('in') + sum('cr') + sum('cw');
    const usd = sorted[sorted.length - 1].usd;
    const byTool = new Map();
    const skills = new Map();
    for (const r of sorted)
        for (const c of r.tools || []) {
            const name = c.t.slice(0, TOOL_NAME_MAX);
            byTool.set(name, (byTool.get(name) || 0) + c.c);
            if (c.t === 'Skill')
                skills.set(c.k, (skills.get(c.k) || 0) + 1);
        }
    const tools = [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, COST_TOP_TOOLS)
        .map(([k, v]) => k + ' ' + n(Math.round(v / CHARS_PER_TOKEN))).join(', ') || 'none';
    const skillText = [...skills.entries()].map(([k, v]) => k + ' x' + v).join(', ') || 'none';
    return '- ' + COST_TAG + ' ' + sorted[0].ts.slice(0, 10) + ' sid ' + sid.slice(0, 8) + ': ' + sorted.length + ' turns, '
        + (usd == null ? 'cost n/a' : '$' + usd.toFixed(2)) + ', ' + [...new Set(sorted.map((r) => r.model))].join('+')
        + ', out ' + n(sum('out')) + ', cache read ' + n(sum('cr')) + ', cache write ' + n(sum('cw'))
        + ', cache hit ' + (prompt ? Math.round((sum('cr') / prompt) * 100) : 0) + '%, ctx peak ' + Math.max(0, ...sorted.map((r) => r.ctxPct || 0))
        + '%; tool results (est. tokens): ' + tools + '; skills loaded: ' + skillText;
}
function runCost(argv, file, cwd, deny) {
    const dir = arg(argv, '--dir') ?? path.join(os.homedir(), '.ai-dev-kit', 'ledger');
    const sidArg = arg(argv, '--sid');
    const last = Number(arg(argv, '--last') ?? 0);
    const minTurns = Number(arg(argv, '--min-turns') ?? COST_MIN_TURNS);
    const bySid = new Map();
    for (const r of readLedgerRows(dir)) {
        if (!r.sid)
            continue;
        if (!bySid.has(r.sid))
            bySid.set(r.sid, []);
        bySid.get(r.sid).push(r);
    }
    let sids = [...bySid.keys()].sort((a, b) => bySid.get(a)[0].ts.localeCompare(bySid.get(b)[0].ts));
    if (sidArg)
        sids = sids.filter((s) => s.startsWith(sidArg));
    else if (last > 0)
        sids = sids.slice(-last);
    else if (!argv.includes('--all'))
        return { code: 2, out: 'usage: feedback.js cost <--sid ID | --last N | --all> [--min-turns N] [--dir D] [--cwd D]' };
    if (!sidArg)
        sids = sids.filter((s) => bySid.get(s).length >= minTurns);
    const lines = new Map();
    let skipped = 0;
    for (const s of sids) {
        const line = costLine(s, bySid.get(s));
        if (scrub(line, deny).length)
            skipped++;
        else
            lines.set(s.slice(0, 8), line);
    }
    if (!lines.size)
        return { code: 0, out: 'no sessions to record' + (skipped ? ' (' + skipped + ' flagged by the scrub)' : '') };
    const existing = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : HEADER).split(/\r?\n/);
    const kept = existing.filter((l) => !(l.includes(COST_TAG) && [...lines.keys()].some((k) => l.includes(' sid ' + k + ':'))));
    const body = kept.join('\n').replace(/\n*$/, '\n') + [...lines.values()].join('\n') + '\n';
    fs.writeFileSync(file, body);
    ensureIgnored(cwd, [FILE, DENY_LOCAL]);
    return { code: 0, out: 'recorded ' + lines.size + ' session cost line(s) in ' + FILE + (skipped ? ', ' + skipped + ' skipped by the scrub' : '') };
}
function run(argv) {
    const cmd = argv[0];
    const cwd = path.resolve(arg(argv, '--cwd') ?? process.cwd());
    const file = path.join(cwd, FILE);
    const deny = denyWords(cwd);
    if (cmd === 'add') {
        const skill = (arg(argv, '--skill') ?? '').trim();
        const text = (arg(argv, '--text') ?? '').replace(/\s+/g, ' ').trim();
        if (!/^[a-z0-9-]+$/.test(skill) || !text)
            return { code: 2, out: 'usage: feedback.js add --skill <name> --text "<lesson>"' };
        const why = scrub(text, deny);
        if (why.length)
            return { code: 2, out: 'not written: the lesson contains ' + why.join(', ') + '. Rewrite it so it names no company, client, URL or path.' };
        const n = new Date();
        const date = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); // local date
        const body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : HEADER;
        const line = '- [' + skill + '] ' + date + ' ' + text + '\n';
        if (body.includes(' ' + text + '\n'))
            return { code: 0, out: 'already recorded' };
        fs.writeFileSync(file, body + (body.endsWith('\n') ? '' : '\n') + line);
        ensureIgnored(cwd, [FILE, DENY_LOCAL]);
        return { code: 0, out: 'added to ' + FILE + ' (local only, in .gitignore)' };
    }
    if (cmd === 'cost')
        return runCost(argv, file, cwd, deny);
    if (cmd === 'check') {
        if (!fs.existsSync(file))
            return { code: 0, out: 'no ' + FILE + ' here' };
        const flagged = [];
        fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((l, i) => {
            if (!l.startsWith('- ['))
                return;
            const why = scrub(l, deny);
            if (why.length)
                flagged.push('line ' + (i + 1) + ': ' + why.join(', '));
        });
        return flagged.length
            ? { code: 1, out: flagged.length + ' line(s) flagged, do not share yet:\n' + flagged.join('\n') }
            : { code: 0, out: 'clean: no URLs, emails, IPs, paths, long tokens or deny-list words found. Still read it once before sharing.' };
    }
    if (cmd === 'list') {
        if (!fs.existsSync(file))
            return { code: 0, out: 'no ' + FILE + ' here' };
        const bullets = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- ['));
        return { code: 0, out: bullets.slice(0, 30).join('\n') + (bullets.length > 30 ? '\n... ' + (bullets.length - 30) + ' more' : '') };
    }
    return { code: 2, out: 'usage: feedback.js <add|cost|check|list> [options]' };
}
if (require.main === module) {
    const r = run(process.argv.slice(2));
    (r.code === 0 ? console.log : console.error)(r.out);
    process.exit(r.code);
}
