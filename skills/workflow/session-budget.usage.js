#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slug = exports.logDir = exports.configFile = exports.usageDir = exports.home = void 0;
exports.readConfig = readConfig;
exports.writeConfig = writeConfig;
exports.readRows = readRows;
exports.catalog = catalog;
exports.summarize = summarize;
exports.report = report;
exports.render = render;
// Which kit features actually get used, kept by a script and never by a model. The feature-usage mod appends one row per
// skill, slash command and kit script it sees to ~/.ai-dev-kit/usage/log/; this script turns that into a report, shows
// which installed features were never used, and holds the on/off switch (so install-kit, a person typing, or the mod's
// /kit-usage command all flip the same file). Works without the mod on any log in the same format. No network.
//
//   node usage.js status [--json]
//   node usage.js on | off                     tracking on or off (the mod reads this before every row)
//   node usage.js notify on | off              a one-line toast for the first use of each feature per session
//   node usage.js report [--days N] [--all-projects] [--cwd D] [--json]
//   node usage.js reset --yes                  delete the log (the config stays)
//
// Default is ON when no config file exists: installing the mod is the opt-in. Rows hold the kind (skill, command, script),
// the name and a short detail such as "build"; never prompts, arguments, paths or file contents.
// Environment: AI_DEV_KIT_HOME replaces the home folder (tests). Exit codes: 0 done, 2 bad usage.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const home = () => process.env.AI_DEV_KIT_HOME || os.homedir();
exports.home = home;
const usageDir = () => path.join((0, exports.home)(), '.ai-dev-kit', 'usage');
exports.usageDir = usageDir;
const configFile = () => path.join((0, exports.usageDir)(), 'config.json');
exports.configFile = configFile;
const logDir = () => path.join((0, exports.usageDir)(), 'log');
exports.logDir = logDir;
// Same rule as the session-journal mod, so a project's folder name matches across the kit.
const slug = (cwd) => cwd.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project';
exports.slug = slug;
function readConfig() {
    try {
        const j = JSON.parse(fs.readFileSync((0, exports.configFile)(), 'utf8'));
        return { config: { track: j.track !== false, notify: j.notify === true }, fromFile: true };
    }
    catch {
        return { config: { track: true, notify: false }, fromFile: false };
    }
}
function writeConfig(c) {
    fs.mkdirSync((0, exports.usageDir)(), { recursive: true });
    fs.writeFileSync((0, exports.configFile)(), JSON.stringify(c, null, 2) + '\n');
}
function readRows() {
    const out = [];
    let files = [];
    try {
        files = fs.readdirSync((0, exports.logDir)()).filter((f) => f.endsWith('.jsonl'));
    }
    catch {
        return out;
    }
    for (const f of files) {
        for (const l of fs.readFileSync(path.join((0, exports.logDir)(), f), 'utf8').split('\n')) {
            if (!l)
                continue;
            try {
                const r = JSON.parse(l);
                if (r && r.kind && r.name && r.t)
                    out.push(r);
            }
            catch { /* skip a damaged line */ }
        }
    }
    return out;
}
// What is installed in a project, read from its folders: skills by folder, commands by file, and each skill's scripts.
function catalog(cwd) {
    const skills = [], commands = [], scripts = [];
    for (const root of ['.claude', '.opencode', '.agents']) {
        const sk = path.join(cwd, root, 'skills');
        let names = [];
        try {
            names = fs.readdirSync(sk, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
        }
        catch { /* none */ }
        for (const n of names) {
            if (!skills.includes(n))
                skills.push(n);
            let fl = [];
            try {
                fl = fs.readdirSync(path.join(sk, n));
            }
            catch { /* none */ }
            for (const f of fl)
                if (/\.(js|cjs|mjs)$/.test(f) && !/\.test\./.test(f)) {
                    const s = `${n}/${f}`;
                    if (!scripts.includes(s))
                        scripts.push(s);
                }
        }
        let cm = [];
        try {
            cm = fs.readdirSync(path.join(cwd, root, 'commands')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
        }
        catch { /* none */ }
        for (const c of cm)
            if (!commands.includes(c))
                commands.push(c);
    }
    return { skills: skills.sort(), commands: commands.sort(), scripts: scripts.sort() };
}
function summarize(rows) {
    const m = new Map();
    for (const r of rows) {
        const k = r.kind + ':' + r.name;
        let x = m.get(k);
        if (!x) {
            x = { e: { kind: r.kind, name: r.name, uses: 0, sessions: 0, last: '', details: [] }, sids: new Set(), det: new Map() };
            m.set(k, x);
        }
        x.e.uses++;
        x.sids.add(r.sid);
        if (r.t > x.e.last)
            x.e.last = r.t;
        if (r.detail)
            x.det.set(r.detail, (x.det.get(r.detail) || 0) + 1);
    }
    return [...m.values()].map((x) => ({ ...x.e, sessions: x.sids.size, details: [...x.det].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d, n]) => `${d} x${n}`) })).sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
}
function report(o) {
    const { config, fromFile } = readConfig();
    const cutoff = o.days ? new Date(Date.now() - o.days * 86400000).toISOString() : '';
    const proj = (0, exports.slug)(o.cwd);
    const rows = readRows().filter((r) => (!cutoff || r.t >= cutoff) && (o.allProjects || r.project === proj));
    const entries = summarize(rows);
    const used = new Set(entries.map((e) => e.kind + ':' + e.name));
    const cat = catalog(o.cwd);
    // A skill counts as used when it loaded or when any of its scripts ran; a command, when it was typed.
    const scriptSkills = new Set(entries.filter((e) => e.kind === 'script').map((e) => e.name.split('/')[0]));
    const unused = o.allProjects ? null : {
        skills: cat.skills.filter((s) => !used.has('skill:' + s) && !scriptSkills.has(s)),
        commands: cat.commands.filter((c) => !used.has('command:' + c)),
        scripts: cat.scripts.filter((s) => !used.has('script:' + s)),
    };
    return { days: o.days ?? null, scope: o.allProjects ? 'all projects' : `project ${proj}`, rows: rows.length, sessions: new Set(rows.map((r) => r.sid)).size, entries, unused, tracking: config, fromFile };
}
const cap = (xs, n) => (xs.length > n ? xs.slice(0, n).join(', ') + `, ... (+${xs.length - n})` : xs.join(', ') || 'none');
function render(r) {
    const L = [];
    L.push(`kit usage, ${r.scope}${r.days ? `, last ${r.days} day(s)` : ''}: ${r.rows} use(s) in ${r.sessions} session(s). Tracking is ${r.tracking.track ? 'ON' : 'OFF'}${r.fromFile ? '' : ' (default)'}, notices ${r.tracking.notify ? 'ON' : 'OFF'}.`);
    if (!r.rows)
        L.push(r.tracking.track ? 'Nothing recorded yet for this scope. The feature-usage mod writes a row each time a skill loads, a command is typed or a kit script runs.' : 'Tracking is off, so nothing is being recorded. Turn it on with: node usage.js on');
    for (const [kind, title] of [['script', 'Scripts run'], ['skill', 'Skills loaded'], ['command', 'Commands typed']]) {
        const es = r.entries.filter((e) => e.kind === kind);
        if (!es.length)
            continue;
        L.push('', `${title} (${es.length}):`);
        for (const e of es.slice(0, 12))
            L.push(`  ${String(e.uses).padStart(4)}x  ${e.name}${e.details.length ? '  [' + e.details.join(', ') + ']' : ''}  (${e.sessions} session${e.sessions === 1 ? '' : 's'}, last ${e.last.slice(0, 10)})`);
        if (es.length > 12)
            L.push(`  (+${es.length - 12} more)`);
    }
    if (r.unused) {
        L.push('', 'Installed here and not used in this window:');
        L.push(`  skills:   ${cap(r.unused.skills, 14)}`);
        L.push(`  commands: ${cap(r.unused.commands, 14)}`);
        L.push(`  scripts:  ${cap(r.unused.scripts, 10)}`);
    }
    L.push('', 'Not seen: what mods do inside (hints, gates) and scripts a slash command runs for you; the command itself is counted.');
    return L.join('\n');
}
function main() {
    const a = process.argv.slice(2);
    const cmd = a[0];
    const flags = new Set(a.filter((x) => x.startsWith('--')));
    const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
    const json = flags.has('--json');
    const usage = () => { console.error('usage: usage.js status | on | off | notify on|off | report [--days N] [--all-projects] [--cwd D] [--json] | reset --yes'); process.exitCode = 2; };
    const out = (text, obj) => { console.log(json ? JSON.stringify(obj) : text); };
    const state = () => { const { config, fromFile } = readConfig(); return `tracking ${config.track ? 'ON' : 'OFF'}${fromFile ? '' : ' (default, no config file yet)'}, notices ${config.notify ? 'ON' : 'OFF'}. Log: ${(0, exports.logDir)()}`; };
    if (cmd === 'status') {
        out(state(), { ...readConfig(), logDir: (0, exports.logDir)() });
        return;
    }
    if (cmd === 'on' || cmd === 'off') {
        const c = readConfig().config;
        c.track = cmd === 'on';
        writeConfig(c);
        out('feature-usage: ' + state(), c);
        return;
    }
    if (cmd === 'notify') {
        if (a[1] !== 'on' && a[1] !== 'off') {
            usage();
            return;
        }
        const c = readConfig().config;
        c.notify = a[1] === 'on';
        writeConfig(c);
        out('feature-usage: ' + state(), c);
        return;
    }
    if (cmd === 'report') {
        const days = val('--days') !== undefined ? Number(val('--days')) : undefined;
        if (days !== undefined && !(days > 0)) {
            usage();
            return;
        }
        const r = report({ days, allProjects: flags.has('--all-projects'), cwd: path.resolve(val('--cwd') || process.cwd()) });
        out(render(r), r);
        return;
    }
    if (cmd === 'reset') {
        if (!flags.has('--yes')) {
            console.error('reset deletes every recorded row; run it again with --yes to confirm');
            process.exitCode = 2;
            return;
        }
        let n = 0;
        try {
            for (const f of fs.readdirSync((0, exports.logDir)()))
                if (f.endsWith('.jsonl')) {
                    fs.rmSync(path.join((0, exports.logDir)(), f));
                    n++;
                }
        }
        catch { /* no log */ }
        out(`feature-usage: deleted ${n} log file(s); the config was kept`, { deleted: n });
        return;
    }
    usage();
}
if (require.main === module)
    main();
