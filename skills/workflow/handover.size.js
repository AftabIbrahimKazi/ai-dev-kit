"use strict";
// Size check for the notes every session pays for: handover.md (and handover/<role>.md) and each skill's learnings.md.
// Prints nothing when everything is within its limit, so a session-start hook costs no tokens until a limit is crossed.
//
//   node size.js check [--cwd <project>] [--max-lines 120] [--max-bullets 30] [--quiet] [--strict] [--json]
//
// check:  handover files over --max-lines, handover files with more than one session section (the log failure mode),
//         learnings.md files over --max-bullets. One line per problem, then one line naming the memory-gardener skill.
// --strict exits 1 when a limit is crossed (default exit 0). --quiet is accepted for hooks and changes nothing: silence
// is already the default. Reads files only; never edits anything. No network. Exit codes: 0 done, 1 strict failure, 2 bad usage.
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
exports.MAX_BULLETS = exports.MAX_LINES = void 0;
exports.countSessionSections = countSessionSections;
exports.countBullets = countBullets;
exports.check = check;
exports.describe = describe;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.MAX_LINES = 120;
exports.MAX_BULLETS = 30;
function countLines(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
}
// A "session section" is a level-2 heading that names a session; the rule is exactly one, called "Last session".
function countSessionSections(text) {
    return text.split(/\r?\n/).filter((l) => /^##\s+/.test(l) && /session/i.test(l)).length;
}
function countBullets(text) {
    return text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
}
function handoverFiles(cwd) {
    const out = [];
    const root = path.join(cwd, 'handover.md');
    if (fs.existsSync(root))
        out.push(root);
    const dir = path.join(cwd, 'handover');
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        for (const n of fs.readdirSync(dir)) {
            const p = path.join(dir, n);
            if (n.endsWith('.md') && n !== 'board.md' && fs.statSync(p).isFile())
                out.push(p);
        }
    }
    return out;
}
function learningsFiles(cwd) {
    const out = [];
    for (const root of ['.claude/skills', '.opencode/skills', '.agents/skills']) {
        const abs = path.join(cwd, root);
        if (!fs.existsSync(abs))
            continue;
        for (const n of fs.readdirSync(abs)) {
            const p = path.join(abs, n, 'learnings.md');
            if (fs.existsSync(p))
                out.push(p);
        }
    }
    return out;
}
function check(cwd, maxLines = exports.MAX_LINES, maxBullets = exports.MAX_BULLETS) {
    const problems = [];
    const rel = (p) => path.relative(cwd, p).split(path.sep).join('/');
    for (const f of handoverFiles(cwd)) {
        const text = fs.readFileSync(f, 'utf8');
        const lines = countLines(text);
        if (lines > maxLines)
            problems.push({ file: rel(f), kind: 'lines', found: lines, limit: maxLines });
        const sessions = countSessionSections(text);
        if (sessions > 1)
            problems.push({ file: rel(f), kind: 'sessions', found: sessions, limit: 1 });
    }
    for (const f of learningsFiles(cwd)) {
        const bullets = countBullets(fs.readFileSync(f, 'utf8'));
        if (bullets > maxBullets)
            problems.push({ file: rel(f), kind: 'bullets', found: bullets, limit: maxBullets });
    }
    return problems;
}
function describe(p) {
    if (p.kind === 'lines')
        return `${p.file}: ${p.found} lines (limit ${p.limit})`;
    if (p.kind === 'sessions')
        return `${p.file}: ${p.found} session sections (want 1, "## Last session")`;
    return `${p.file}: ${p.found} bullets (limit ${p.limit})`;
}
function parse(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== 'check')
        return null;
    const a = { cwd: process.cwd(), maxLines: exports.MAX_LINES, maxBullets: exports.MAX_BULLETS, strict: false, json: false };
    for (let i = 0; i < rest.length; i++) {
        const f = rest[i];
        if (f === '--cwd')
            a.cwd = path.resolve(rest[++i] ?? '');
        else if (f === '--max-lines')
            a.maxLines = Number(rest[++i]);
        else if (f === '--max-bullets')
            a.maxBullets = Number(rest[++i]);
        else if (f === '--strict')
            a.strict = true;
        else if (f === '--json')
            a.json = true;
        else if (f === '--quiet')
            continue;
        else
            return null;
    }
    if (!(a.maxLines > 0) || !(a.maxBullets > 0))
        return null;
    return a;
}
function main() {
    const a = parse(process.argv.slice(2));
    if (!a) {
        console.error('usage: size.js check [--cwd <project>] [--max-lines N] [--max-bullets N] [--quiet] [--strict] [--json]');
        process.exitCode = 2;
        return;
    }
    const problems = check(a.cwd, a.maxLines, a.maxBullets);
    if (a.json)
        console.log(JSON.stringify({ ok: problems.length === 0, problems }));
    else if (problems.length) {
        console.log('Notes over their limit (every session pays for these):');
        for (const p of problems)
            console.log('- ' + describe(p));
        console.log('Run the memory-gardener skill to demote or delete, then keep one "## Last session" block.');
    }
    if (a.strict && problems.length)
        process.exitCode = 1;
}
if (require.main === module)
    main();
