#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realCounts = realCounts;
exports.auditReadme = auditReadme;
// Mechanical half of the readme-writer skill: checks a README against the repository, with no AI and no network.
// Plain Node, no dependencies.
//
//   node audit.js [README.md] [--root <dir>] [--json]
//
// Checks: relative links resolve; count parity (the "N skills / mods / commands" claims in the first 60 lines match the
// folders); flag parity (a --flag on an install-kit line exists in some script source); metrics carry a sample size;
// size (lines outside <details> blocks, long sections outside <details>).
// Exit codes: 0 no failures (warnings allowed), 1 at least one failure, 2 bad usage.
const fs = require("node:fs");
const path = require("node:path");
const MAX_MAIN_LINES = 400;
const WARN_MAIN_LINES = 250;
const MAX_SECTION_LINES = 60;
const HERO_LINES = 60;
function walk(dir, out = [], skip = /^(node_modules|\.git|\.next|_sandbox|site|cloude)$/) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        if (skip.test(e.name))
            continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory())
            walk(p, out, skip);
        else
            out.push(p);
    }
    return out;
}
// Real counts, taken from the folders. A skill is a .md under skills/ whose frontmatter has a name (commands and READMEs excluded).
function realCounts(root) {
    const skills = walk(path.join(root, 'skills')).filter((f) => f.endsWith('.md') && !/[\\/]commands[\\/]/.test(f) && path.basename(f) !== 'README.md' && /^---\r?\n[\s\S]*?\bname:/.test(fs.readFileSync(f, 'utf8').slice(0, 600))).length;
    const modsDir = path.join(root, 'mods');
    const mods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(modsDir, e.name, '.claude-plugin'))).length : 0;
    const cmdDir = path.join(root, 'skills', 'commands');
    const commands = fs.existsSync(cmdDir) ? fs.readdirSync(cmdDir).filter((n) => n.endsWith('.md')).length : 0;
    return { skills, mods, commands };
}
function knownFlags(root) {
    const flags = new Set();
    for (const f of walk(path.join(root, 'skills')).concat(walk(path.join(root, 'mods')))) {
        if (!/\.(ts|js)$/.test(f))
            continue;
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`](--[a-z][a-z0-9-]*)/g))
            flags.add(m[1]);
    }
    return flags;
}
function auditReadme(root, file) {
    const out = [];
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const add = (level, check, line, msg) => { out.push({ level, check, line, msg }); };
    // Mark every line inside a fenced block or a <details> block (and which are in details).
    const fenced = [];
    const inDetails = [];
    let fence = false, depth = 0;
    lines.forEach((l, i) => {
        if (/^\s*(```|~~~)/.test(l))
            fence = !fence;
        fenced[i] = fence;
        if (!fence && /<details\b/i.test(l))
            depth++;
        inDetails[i] = depth > 0;
        if (!fence && /<\/details>/i.test(l))
            depth = Math.max(0, depth - 1);
    });
    // 1. Relative links resolve.
    lines.forEach((l, i) => {
        if (fenced[i])
            return;
        for (const m of l.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
            const target = m[1].split('#')[0];
            if (!target || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(m[1]))
                continue;
            const abs = path.resolve(path.dirname(file), decodeURIComponent(target));
            if (!fs.existsSync(abs))
                add('fail', 'link', i + 1, `relative link does not resolve: ${m[1]}`);
        }
    });
    // 2. Count parity in the hero.
    const real = realCounts(root);
    lines.slice(0, HERO_LINES).forEach((l, i) => {
        if (fenced[i])
            return;
        for (const m of l.matchAll(/\b(\d+)\+?\s+(skills?|mods?|slash commands?|commands?)\b/gi)) {
            const kind = /skill/i.test(m[2]) ? 'skills' : /mod/i.test(m[2]) ? 'mods' : 'commands';
            if (Number(m[1]) !== real[kind])
                add('fail', 'count', i + 1, `says ${m[1]} ${kind}, the folders hold ${real[kind]}`);
        }
    });
    // 3. Flag parity: a --flag on a line that names install-kit must exist in some script.
    const known = knownFlags(root);
    lines.forEach((l, i) => {
        if (!/install-kit/.test(l))
            return;
        for (const m of l.matchAll(/(?<![\w-])(--[a-z][a-z0-9-]*)/g))
            if (!known.has(m[1]))
                add('fail', 'flag', i + 1, `${m[1]} is not a flag in any script`);
    });
    // 4. Metrics carry a sample size on the same line (or the line below).
    lines.forEach((l, i) => {
        if (fenced[i] || /^\s*#/.test(l))
            return;
        if (!/\b\d+(\.\d+)?\s?(%|x\b)|\bsav(es|ed|ing)\b|\bfewer\b/i.test(l))
            return;
        if (!/\b(token|cost|faster|slower|accura|recall|fewer|latency)/i.test(l))
            return;
        const ctx = l + ' ' + (lines[i + 1] || '');
        if (!/\bn\s?=\s?\d|\b\d+\s+(runs?|samples?|trials?|prompts?|cases?|files?)\b|\bsample\b|\bper arm\b/i.test(ctx))
            add('warn', 'sample-size', i + 1, 'a measured claim with no sample size');
    });
    // 5. Size: main path outside <details>, and long sections outside <details>.
    const main = lines.filter((_, i) => !inDetails[i]).length;
    if (main > MAX_MAIN_LINES)
        add('fail', 'size', 1, `${main} lines outside <details> (limit ${MAX_MAIN_LINES}); move depth to docs/ or collapse it`);
    else if (main > WARN_MAIN_LINES)
        add('warn', 'size', 1, `${main} lines outside <details> (aim for ${WARN_MAIN_LINES} or fewer)`);
    let start = -1, count = 0, title = '';
    const closeSection = () => { if (start >= 0 && count > MAX_SECTION_LINES)
        add('warn', 'section', start + 1, `section "${title}" is ${count} lines outside <details> (cap ${MAX_SECTION_LINES})`); };
    lines.forEach((l, i) => {
        if (!fenced[i] && /^##\s/.test(l)) {
            closeSection();
            start = i;
            count = 0;
            title = l.replace(/^##\s+/, '');
        }
        else if (!inDetails[i])
            count++;
    });
    closeSection();
    return out;
}
function main() {
    const argv = process.argv.slice(2);
    let root = process.cwd(), json = false;
    const files = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--root')
            root = path.resolve(argv[++i] || '');
        else if (argv[i] === '--json')
            json = true;
        else if (argv[i].startsWith('--')) {
            console.error('usage: readme-writer audit [README.md] [--root <dir>] [--json]');
            process.exitCode = 2;
            return;
        }
        else
            files.push(argv[i]);
    }
    const file = path.resolve(root, files[0] || 'README.md');
    if (!fs.existsSync(file)) {
        console.error(`error: ${file} does not exist. Pass the README path, or run from the project root.`);
        process.exitCode = 1;
        return;
    }
    const found = auditReadme(root, file);
    if (json)
        console.log(JSON.stringify({ file, findings: found }));
    else {
        for (const f of found)
            console.log(`${f.level.toUpperCase().padEnd(4)} ${f.check.padEnd(11)} line ${f.line}: ${f.msg}`);
        console.log(`readme audit: ${found.filter((f) => f.level === 'fail').length} fail, ${found.filter((f) => f.level === 'warn').length} warn`);
    }
    if (found.some((f) => f.level === 'fail'))
        process.exitCode = 1;
}
if (require.main === module)
    main();
