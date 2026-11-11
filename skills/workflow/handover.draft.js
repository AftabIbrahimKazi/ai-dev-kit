"use strict";
// Mechanical half of /wrap-up: the facts a handover needs that no model has to re-derive. Prints the header line, the commits
// since the last handover, the uncommitted files, the size check and (with --journal) what the session journal recorded.
// Claude then writes only the judgment sections (Current state, Decisions & why, Known issues, Next steps, gotchas).
//
//   node draft.js [--cwd <project>] [--journal] [--json]
//
// Reads git and handover.md; with --journal it also reads the newest file in ~/.ai-dev-kit/sessions/<project>/ written by the
// session-journal mod (read only; if there is none it says so and gives git facts only). Never edits anything. No network.
// Exit codes: 0 done, 2 bad usage.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.slug = void 0;
exports.lastUpdated = lastUpdated;
exports.nextTaskLine = nextTaskLine;
exports.journalFacts = journalFacts;
exports.draft = draft;
exports.render = render;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const git = (cwd, args) => {
    const r = (0, node_child_process_1.spawnSync)('git', args, { cwd, encoding: 'utf8' });
    return r.status === 0 ? (r.stdout || '').trim() : '';
};
// Same rule as the session-journal mod, so the folder name matches.
const slug = (cwd) => cwd.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-60) || 'project';
exports.slug = slug;
function lastUpdated(handover) {
    const m = /^Updated:\s*(\d{4}-\d{2}-\d{2})/m.exec(handover);
    return m ? m[1] : null;
}
function nextTaskLine(handover) {
    const m = /^## Next task\s*\r?\n+([^\r\n]+)/m.exec(handover);
    return m ? m[1].trim() : null;
}
// Pure: journal lines in, a short plain-text block out. Asks (last 8), files edited (last 25), failed commands (last 5).
function journalFacts(lines) {
    const es = [];
    for (const l of lines) {
        try {
            es.push(JSON.parse(l));
        }
        catch { /* skip a damaged line */ }
    }
    if (!es.length)
        return null;
    const files = [...new Set(es.flatMap((x) => x.edited ?? []))].slice(-25);
    const fails = es.flatMap((x) => (x.cmds ?? []).filter((c) => c.startsWith('!'))).slice(-5).map((c) => c.slice(1));
    const asks = es.slice(-8).map((x) => '  - ' + String(x.ask ?? '').slice(0, 120));
    return [`${es.length} turns`, files.length ? 'files edited: ' + files.join(', ') : 'files edited: none', fails.length ? 'failed commands: ' + fails.join(' | ') : '', 'recent requests:', ...asks].filter(Boolean).join('\n');
}
function newestJournal(cwd) {
    const dir = path.join(os.homedir(), '.ai-dev-kit', 'sessions', (0, exports.slug)(cwd));
    try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
        return files.length ? path.join(dir, files[0].f) : null;
    }
    catch {
        return null;
    }
}
function sizeCheck(cwd) {
    const here = path.dirname(__filename);
    const script = [path.join(here, 'size.js'), path.join(here, 'handover.size.js')].find((p) => fs.existsSync(p));
    if (!script)
        return 'size check script not found';
    const r = (0, node_child_process_1.spawnSync)(process.execPath, [script, 'check', '--cwd', cwd], { encoding: 'utf8' });
    return (r.stdout || '').trim() || 'within limits';
}
function draft(cwd, withJournal) {
    const hf = path.join(cwd, 'handover.md');
    const text = fs.existsSync(hf) ? fs.readFileSync(hf, 'utf8') : '';
    const since = lastUpdated(text);
    const log = since ? git(cwd, ['log', `--since=${since}T00:00:00`, '--format=%h %s']) : git(cwd, ['log', '-10', '--format=%h %s']);
    let journal = null;
    let journalNote = null;
    if (withJournal) {
        const j = newestJournal(cwd);
        if (!j)
            journalNote = 'no session journal for this project (the session-journal mod is not installed, or nothing was recorded): git facts only';
        else
            journal = journalFacts(fs.readFileSync(j, 'utf8').split('\n').filter(Boolean));
        if (j && !journal)
            journalNote = 'the session journal is empty: git facts only';
    }
    return {
        updated: new Date().toISOString().slice(0, 10),
        branch: git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
        since,
        commits: log.split('\n').filter(Boolean).slice(0, 20),
        uncommitted: git(cwd, ['status', '--short']).split('\n').filter(Boolean).slice(0, 15),
        nextTask: nextTaskLine(text),
        size: sizeCheck(cwd),
        journal,
        journalNote,
    };
}
function render(d) {
    const L = [`Updated: ${d.updated} · Branch: ${d.branch}`, '', '## Facts (script-made: use them, do not re-derive)'];
    L.push(d.commits.length ? `Commits since ${d.since ?? 'the last 10'} (${d.commits.length}):` : `No commits since ${d.since ?? 'the start'}.`, ...d.commits.map((c) => '  ' + c));
    L.push(d.uncommitted.length ? `Uncommitted (${d.uncommitted.length}):` : 'Working tree clean.', ...d.uncommitted.map((c) => '  ' + c));
    if (d.journal)
        L.push('Session journal:', ...d.journal.split('\n').map((x) => '  ' + x));
    if (d.journalNote)
        L.push('Note: ' + d.journalNote);
    L.push(d.nextTask ? `Existing next task (keep exactly, unless this session finished it): ${d.nextTask}` : 'No existing next task.');
    L.push('Size check: ' + d.size);
    return L.join('\n');
}
function main() {
    const a = process.argv.slice(2);
    let cwd = process.cwd(), journal = false, json = false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--cwd')
            cwd = path.resolve(a[++i] ?? '');
        else if (a[i] === '--journal')
            journal = true;
        else if (a[i] === '--json')
            json = true;
        else {
            console.error('usage: draft.js [--cwd <project>] [--journal] [--json]');
            process.exitCode = 2;
            return;
        }
    }
    const d = draft(cwd, journal);
    console.log(json ? JSON.stringify(d) : render(d));
}
if (require.main === module)
    main();
