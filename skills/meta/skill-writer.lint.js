"use strict";
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
exports.ADVISORY = void 0;
exports.frontmatter = frontmatter;
exports.lintSkill = lintSkill;
exports.lintCommand = lintCommand;
exports.lintMod = lintMod;
exports.lintScript = lintScript;
exports.lintKit = lintKit;
// kit-lint: the mechanical half of the skill-writer, command-writer and mod-writer review checklists, run by a script instead of re-read by the model.
// Usage: node skill-writer.lint.js [--root <kit>] [--json] [--strict] [--only skills|commands|mods]   (--strict adds the style rules most skills do not follow yet)
// Prints only problems, worst first. Exit 0 when clean, 1 when there are findings. Plain node, no dependencies.
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
// Style rules from the writer skills that many shipped skills do not follow yet: shown only with --strict.
exports.ADVISORY = new Set(['sk-desc-open', 'sk-desc-load']);
const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
function frontmatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!m)
        return null;
    const fm = {};
    let key = '';
    for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
        if (kv) {
            key = kv[1];
            fm[key] = kv[2].replace(/^["']|["']$/g, '');
        }
        else if (key && /^\s+\S/.test(line))
            fm[key] += ' ' + line.trim();
    }
    return { fm, body: text.slice(m[0].length) };
}
// A skill: description opens with a situation, stays near the 40-word cap, names a load-before instruction; body stays near 120 lines.
function lintSkill(rel, text) {
    const out = [];
    const p = frontmatter(text);
    if (!p)
        return out;
    const d = p.fm.description || '';
    if (!p.fm.name)
        out.push({ file: rel, rule: 'sk-name', msg: 'frontmatter has no name' });
    if (!d) {
        out.push({ file: rel, rule: 'sk-desc', msg: 'no description' });
        return out;
    }
    if (!/^(Use\b|When\b|Run\b|On\b)/i.test(d))
        out.push({ file: rel, rule: 'sk-desc-open', msg: 'description does not open with a situation ("Use whenever …")' });
    if (words(d) > 50)
        out.push({ file: rel, rule: 'sk-desc-cap', msg: `description is ${words(d)} words; the cap is about 40` });
    if (p.fm['disable-model-invocation'] !== 'true' && !/\bload\b[^.]*\bbefore\b/i.test(d) && !/\bbefore\b/i.test(d))
        out.push({ file: rel, rule: 'sk-desc-load', msg: 'description has no "Load this BEFORE …" instruction' });
    const lines = p.body.split(/\r?\n/).length;
    if (lines > 130)
        out.push({ file: rel, rule: 'sk-lines', msg: `${lines} lines; the target is under about 120 (move depth to a references file)` });
    return out;
}
// A slash command (skills/commands/*.md).
function lintCommand(rel, text) {
    const out = [];
    const p = frontmatter(text);
    if (!p)
        return [{ file: rel, rule: 'cmd-fm', msg: 'no frontmatter' }];
    const d = p.fm.description || '';
    if (!d)
        out.push({ file: rel, rule: 'cmd-desc', msg: 'no description' });
    if (p.fm['disable-model-invocation'] !== 'true')
        out.push({ file: rel, rule: 'cmd-dmi', msg: 'disable-model-invocation: true is mandatory' });
    const tools = p.fm['allowed-tools'] || '';
    if (/Bash\(\*\)|^\*$/.test(tools))
        out.push({ file: rel, rule: 'cmd-tools', msg: 'allowed-tools must name one scoped pattern, never Bash(*)' });
    if (/\b(Write|Edit|NotebookEdit)\b/.test(tools))
        out.push({ file: rel, rule: 'cmd-tools', msg: 'a command takes no write tool' });
    if (/\.claude\//.test(p.body) && !/\{\{skill-root\}\}/.test(p.body))
        out.push({ file: rel, rule: 'cmd-path', msg: 'hardcodes .claude/; use {{skill-root}}' });
    const bang = p.body.split(/\r?\n/).filter((l) => l.startsWith('!`'));
    for (const l of bang)
        if (/\b(sh|grep|cat|awk|sed|bash)\b/.test(l.replace(/\{\{skill-root\}\}[^\s`]*/g, '')))
            out.push({ file: rel, rule: 'cmd-portable', msg: 'the ! line must call node, never sh, grep, cat, awk or sed' });
    if (!/\b(under|at most|no more than|worst|first|three lines or fewer|\d+ lines?)\b[^.\n]*\d|\d+ lines? or fewer|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve) lines?\b/i.test(p.body))
        out.push({ file: rel, rule: 'cmd-cap', msg: 'no stated output cap (a number of lines or items)' });
    if (/git (commit|push|tag)\b/.test(p.body) && !/(never|do not|don't|only when|unless)[^.\n]*git (commit|push|tag)|git (commit|push|tag)[^.\n]*(never|only when|unless)/i.test(p.body))
        out.push({ file: rel, rule: 'cmd-writes', msg: 'mentions commit, push or tag without a stated limit' });
    return out;
}
// A mod: a shell-tool gate must name both Bash and PowerShell; no destructuring of $; nothing writes under handover/.
function lintMod(rel, text) {
    const out = [];
    for (const m of text.matchAll(/tool:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
        const t = m[1];
        if (/Bash|PowerShell/.test(t) && !(/Bash/.test(t) && /PowerShell/.test(t)))
            out.push({ file: rel, rule: 'mod-shell', msg: `tool filter ${t.replace(/\s+/g, ' ')} names only one shell; match both Bash and PowerShell` });
    }
    if (/\{\s*[\w\s,]*\}\s*=\s*\$\b/.test(text) || /\(\s*\{[^}]*\}\s*\)\s*=>[^\n]*\$\./.test(text) === false && /const\s*\{[^}]*\}\s*=\s*\$\s*[;\n]/.test(text))
        out.push({ file: rel, rule: 'mod-destructure', msg: 'never destructure $; write each call in full' });
    if (/\$\.fs\.(write|append|remove|mkdir)\([^)]*handover\//.test(text))
        out.push({ file: rel, rule: 'mod-handover', msg: 'never write under handover/' });
    if (/handover\/locks\.d/.test(text) && !/never|must not|skip/i.test(text))
        out.push({ file: rel, rule: 'mod-locks', msg: 'reads handover/locks.d/' });
    return out;
}
// A kit script (skills/**/*.ts companions): no shell strings, no bare convert, no hand-built paths.
function lintScript(rel, text) {
    const out = [];
    if (/\b(child_process|cp)\.exec\(|\bexecSync\(|\bexec\(\s*[`'"]/.test(text) && !/execFile/.test(text))
        out.push({ file: rel, rule: 'sc-exec', msg: 'runs a shell string; use execFile with an argument array' });
    if (/(execFile|execFileSync|spawn|spawnSync)\(\s*['"`]convert['"`]/.test(text))
        out.push({ file: rel, rule: 'sc-convert', msg: 'bare convert is a Windows system tool; use magick' });
    if (/process\.cwd\(\)\s*\+\s*['"`]\//.test(text))
        out.push({ file: rel, rule: 'sc-path', msg: 'builds a path with "/"; use path.join' });
    return out;
}
const walk = (dir, keep, acc = []) => {
    let ents = [];
    try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return acc;
    }
    for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!/^(node_modules|\.git|references)$/.test(e.name))
                walk(p, keep, acc);
        }
        else if (keep(p))
            acc.push(p);
    }
    return acc;
};
function lintKit(root, only = '', strict = false) {
    const out = [];
    const rel = (f) => path.relative(root, f).split(path.sep).join('/');
    const read = (f) => fs.readFileSync(f, 'utf8');
    if (!only || only === 'skills') {
        const skills = walk(path.join(root, 'skills'), (f) => /\.md$/.test(f) && !/(README|extras|learnings)/i.test(f) && !f.includes(path.join('skills', 'commands')));
        for (const f of skills)
            out.push(...lintSkill(rel(f), read(f)));
        for (const f of walk(path.join(root, 'skills'), (x) => /\.ts$/.test(x) && !/\.d\.ts$/.test(x)))
            out.push(...lintScript(rel(f), read(f)));
    }
    if (!only || only === 'commands')
        for (const f of walk(path.join(root, 'skills', 'commands'), (x) => /\.md$/.test(x)))
            out.push(...lintCommand(rel(f), read(f)));
    if (!only || only === 'mods')
        for (const f of walk(path.join(root, 'mods'), (x) => /hooks[\\/].*\.ts$/.test(x) && !/tests?[\\/]/.test(x)))
            out.push(...lintMod(rel(f), read(f)));
    return strict ? out : out.filter((f) => !exports.ADVISORY.has(f.rule));
}
if (require.main === module) {
    const a = process.argv.slice(2);
    const flag = (n, d = '') => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
    const root = path.resolve(flag('--root', path.join(__dirname, '..', '..')));
    const res = lintKit(root, flag('--only'), a.includes('--strict'));
    if (a.includes('--json'))
        console.log(JSON.stringify(res, null, 2));
    else if (!res.length)
        console.log('kit-lint: clean');
    else {
        const by = {};
        for (const f of res)
            (by[f.rule] = by[f.rule] || []).push(f);
        for (const [r, fs2] of Object.entries(by).sort((x, y) => y[1].length - x[1].length)) {
            console.log(`${r} (${fs2.length})`);
            for (const f of fs2.slice(0, 8))
                console.log(`  ${f.file}: ${f.msg}`);
            if (fs2.length > 8)
                console.log(`  … ${fs2.length - 8} more`);
        }
        console.log(`kit-lint: ${res.length} finding${res.length === 1 ? '' : 's'}`);
    }
    process.exit(res.length ? 1 : 0);
}
