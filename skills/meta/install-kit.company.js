#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_DISCLAIMER = exports.COMPANY_README = exports.DISCIPLINES = exports.COMPANY_DIR = void 0;
exports.companyDir = companyDir;
exports.scanCompany = scanCompany;
exports.importRoutes = importRoutes;
exports.detectOverlap = detectOverlap;
exports.detectSignature = detectSignature;
exports.buildIndex = buildIndex;
exports.buildSkill = buildSkill;
exports.protocolBlock = protocolBlock;
exports.companyOmit = companyOmit;
exports.isOmitted = isOmitted;
exports.doCompanySync = doCompanySync;
exports.refreshCompany = refreshCompany;
exports.doCompanyRemove = doCompanyRemove;
exports.companyStatus = companyStatus;
// Company standards for install-kit: a separate coding-standards/company/ folder where a company drops its own
// rules (a design system, a style guide, any docs). The kit never edits those files. It scans them and writes
// four small things: company/INDEX.md (a routing table), a thin company-standards skill, a marked block in the
// session-protocol file, and a manifest record. Removing the feature deletes exactly those, and puts back any
// default standard it took out. Imported by install-kit.cli; the `company` command is wired there.
// No network, no dependencies.
const fs = require("node:fs");
const path = require("node:path");
const skill_scope_move_1 = require("./skill-scope.move");
const install_kit_signature_1 = require("./install-kit.signature");
exports.COMPANY_DIR = 'company';
const START = '<!-- ai-dev-kit:company-standards:start -->';
const END = '<!-- ai-dev-kit:company-standards:end -->';
const README_MARK = '<!-- ai-dev-kit:company-readme -->';
const INDEX_MARK = '<!-- ai-dev-kit:company-index -->';
// Why four are never auto-dropped: they are the floor (security and accessibility live in QA and a11y, git and
// versioning are team process). A company can still drop them by choosing "don't install defaults".
exports.DISCIPLINES = {
    css: { label: 'CSS standard', files: ['css-standards.md', 'css-standards/'], droppable: true, probe: /\bs?css\b|stylesheet|selector|\bbem\b|specificity/i },
    html: { label: 'HTML standard', files: ['html-standards.md', 'html-standards/'], droppable: true, probe: /\bhtml\b|markup|semantic element/i },
    script: { label: 'Script standard', files: ['js-standards.md', 'js-standards/', 'ts-standards.md', 'ts-standards/', 'js-and-ts-standards.md', 'js-and-ts-standards/'], droppable: true, probe: /javascript|typescript|\bjs\b|\bts\b|eslint/i },
    ui: { label: 'UI standard', files: ['ui-standards.md', 'ui-standards/'], droppable: true, probe: /design[- ]system|\bui\b|\bux\b|component|pattern|layout|navigation|theming|\btokens?\b/i },
    design: { label: 'Design standard', files: ['design-standards.md'], droppable: true, probe: /design[- ]system|\bui\b|\bux\b|component|pattern|layout|navigation|theming|\btokens?\b/i },
    seo: { label: 'SEO standard', files: ['seo-standards.md'], droppable: true, probe: /\bseo\b|structured data|sitemap|meta tags?/i },
    performance: { label: 'Performance standard', files: ['performance-standards.md'], droppable: true, probe: /performance|web vitals|\blcp\b|budget/i },
    ai: { label: 'AI standard', files: ['ai-standards.md'], droppable: true, probe: /\bai[- ](standards|rules|coding|usage)|\bllm\b|prompt(ing)? (rules|standards)/i },
    accessibility: { label: 'Accessibility standard', files: ['accessibility-standards.md'], droppable: false, probe: /accessib|\ba11y\b|wcag|aria/i },
    qa: { label: 'QA standard', files: ['qa/'], droppable: false, probe: /\bqa\b|test plan|definition of done|\be2e\b/i },
    git: { label: 'Git standard', files: ['git-standards.md'], droppable: false, probe: /\bgit\b|commit|branch|merge request|pull request/i },
    versioning: { label: 'Versioning standard', files: ['versioning-standards.md'], droppable: false, probe: /versioning|semver|changelog/i },
};
const EXTRA_ROWS = ['Framework', 'CSS Framework'];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__']);
const toSlash = (p) => p.split(path.sep).join('/');
const strip = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
function companyDir(root) { return path.join(root, 'coding-standards', exports.COMPANY_DIR); }
exports.COMPANY_README = `${README_MARK}
# Company standards

Drop your company's own rules in this folder: a design system, a style guide, a standards repo. Any folder
layout works. Markdown files are indexed; other files (tokens, fonts, scripts) are kept but not read by the AI.

This folder is yours. The kit never edits or deletes what you put here (unless you remove with \`--purge\`).
After adding or changing files, run:

    node <ai-dev-kit>/skills/meta/install-kit.cli.js company sync --root <your-project>

That rebuilds \`INDEX.md\` (a short routing table so the AI reads only the file a task needs) and the
\`company-standards\` skill. To take it all out again: \`company remove\` (add \`--purge\` to delete these files too).
`;
// ---- scanning ----
function readDoc(abs, rel) {
    const text = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    let body = text;
    let title = '';
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (fm) {
        const t = /^title:\s*(.+)$/m.exec(fm[1]);
        if (t)
            title = strip(t[1].replace(/^["']|["']$/g, ''));
        body = text.slice(fm[0].length);
    }
    const lines = body.split('\n');
    const headings = [];
    let summary = '';
    for (const l of lines) {
        const h = /^(#{1,3})\s+(.+?)\s*#*$/.exec(l);
        if (h) {
            if (h[1].length === 1 && !title)
                title = strip(h[2]);
            else if (h[1].length >= 2 && headings.length < 14)
                headings.push(strip(h[2]));
            continue;
        }
        if (!summary && l.trim() && !/^(\||>|!!!|===|```|<|---|[-*]\s*\[|\d+\.)/.test(l.trim()))
            summary = clip(strip(l), 110);
    }
    if (!title)
        title = path.basename(rel, path.extname(rel));
    return { rel, title, summary, tokens: Math.ceil(Buffer.byteLength(text) / 4), headings };
}
function scanCompany(dir) {
    const docs = [];
    let other = 0;
    if (!fs.existsSync(dir))
        return { docs, other };
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (SKIP_DIRS.has(e.name) || e.name.startsWith('.'))
                continue;
            const abs = path.join(d, e.name);
            if (e.isDirectory()) {
                walk(abs);
                continue;
            }
            const rel = toSlash(path.relative(dir, abs));
            if (!/\.mdx?$/i.test(e.name)) {
                other++;
                continue;
            }
            if (rel === 'INDEX.md' || rel === 'README.md' && fs.readFileSync(abs, 'utf8').includes(README_MARK))
                continue;
            docs.push(readDoc(abs, rel));
        }
    };
    walk(dir);
    docs.sort((a, b) => a.rel.localeCompare(b.rel));
    return { docs, other };
}
// A company's own "when you build X, read Y" table, if it has one. Rows whose file cannot be matched to exactly
// one scanned document are dropped, so prose tables never leak in.
function importRoutes(docs, dir) {
    const resolve = (p) => {
        const clean = p.replace(/^\.?\//, '');
        const hit = docs.filter((d) => d.rel === clean || d.rel.endsWith('/' + clean) || clean.endsWith('/' + d.rel) || clean.endsWith(d.rel));
        return hit.length === 1 ? hit[0].rel : null;
    };
    const ordered = [...docs].sort((a, b) => Number(/instruction|agent|claude/i.test(b.rel)) - Number(/instruction|agent|claude/i.test(a.rel)));
    const seen = new Set();
    const routes = [];
    for (const d of ordered) {
        let text;
        try {
            text = fs.readFileSync(path.join(dir, d.rel), 'utf8');
        }
        catch {
            continue;
        }
        for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
            const m = /^\|\s*(.+?)\s*\|\s*`?([\w./-]+\.md)`?\s*\|?\s*$/.exec(line);
            if (!m || /^-+$/.test(m[1]))
                continue;
            const rel = resolve(m[2]);
            if (!rel || seen.has(rel))
                continue;
            seen.add(rel);
            routes.push({ trigger: clip(strip(m[1]), 100), rel });
        }
    }
    return routes;
}
// Reads file names, titles and headings only, never rule text. A discipline counts as covered only when the
// company has a file dedicated to it (the probe hits a file's name) plus at least one more related
// file; design needs five related files by path. Everything else keeps the kit default.
function detectOverlap(docs) {
    return Object.entries(exports.DISCIPLINES).map(([key, d]) => {
        const evidence = docs.filter((x) => d.probe.test(`${x.rel} ${x.title} ${x.headings.join(' ')}`)).length;
        const dedicated = docs.filter((x) => d.probe.test(path.posix.basename(x.rel))).length;
        const covered = key === 'design' || key === 'ui' ? evidence >= 5 : dedicated >= 1 && evidence >= 2;
        const verdict = covered ? 'covered' : evidence > 0 ? 'partial' : 'none';
        const drop = covered && d.droppable;
        const reason = drop ? `company has ${evidence} related file${evidence === 1 ? '' : 's'}${dedicated ? `, ${dedicated} dedicated to it` : ''}: default removed`
            : covered ? 'company covers it, but this one is never auto-removed (safety floor): default kept'
                : verdict === 'partial' ? `only ${evidence} related file${evidence === 1 ? '' : 's'}, not a full replacement: default kept`
                    : 'no company coverage: default kept';
        return { key, label: d.label, verdict, files: evidence, droppable: d.droppable, drop, reason };
    });
}
exports.AUTO_DISCLAIMER = [
    'Auto-detect is a guess from file names, titles and headings. It does not read your rule text.',
    'It removes a default standard only when your company has a file dedicated to that subject and at least one more related file.',
    'It never removes the accessibility, QA, git or versioning defaults. A wrong "covered" would silently drop a rule you needed, so partial overlap keeps the default.',
    'Review the table below. Nothing is lost: removed defaults come back with `company remove`, and you can override with --company-defaults keep or drop.',
];
// ---- signature hint ----
// The alias itself is a core installer setting (install-kit.signature.ts), chosen by the user. Here the company docs only
// suggest one: the prefix they use for data attributes, if one stands out.
// Attribute prefixes that belong to frameworks and tools, never to a company.
const FRAMEWORK_DATA = new Set(['bs', 'aria', 'toggle', 'target', 'dismiss', 'testid', 'test', 'cy', 'turbo', 'astro', 'reactroot', 'radix', 'headlessui', 'wp', 'v', 'ng', 'svelte', 'lazy', 'src']);
// The prefix the company docs use for data attributes, if one stands out (3 uses in 2 files at least). A hint: never applied by itself.
function detectSignature(docs, dir) {
    const counts = new Map();
    const files = new Map();
    const texts = [];
    for (const d of docs) {
        let text;
        try {
            text = fs.readFileSync(path.join(dir, d.rel), 'utf8');
        }
        catch {
            continue;
        }
        texts.push(text);
        for (const m of text.matchAll(/data-([a-z][a-z0-9]{1,5})-[a-z]/g)) {
            if (FRAMEWORK_DATA.has(m[1]))
                continue;
            counts.set(m[1], (counts.get(m[1]) || 0) + 1);
            if (!files.has(m[1]))
                files.set(m[1], new Set());
            files.get(m[1]).add(d.rel);
        }
    }
    const best = [...counts.entries()].filter(([a, n]) => n >= 3 && files.get(a).size >= 2).sort((a, b) => b[1] - a[1])[0];
    if (!best)
        return null;
    const cap = (0, install_kit_signature_1.sigForms)(best[0]).component;
    const re = new RegExp('\\b' + cap + '[A-Z][a-z]+', 'g');
    return { alias: best[0], attrs: best[1], components: texts.reduce((n, t) => n + (t.match(re) || []).length, 0) };
}
// ---- generated files ----
function topics(docs) {
    const seen = new Set();
    for (const d of docs) {
        const seg = d.rel.split('/');
        if (seg.length > 1)
            seen.add(seg[seg.length - 2]);
    }
    return [...seen].slice(0, 8);
}
function precedence(mode, dropped) {
    if (mode === 'drop')
        return 'Company rules are the only standards here; the kit defaults are not installed.';
    const gone = dropped.length ? ` Removed because the company covers them: ${dropped.join(', ')}.` : '';
    return `Where a company rule and a kit default disagree, the company rule wins. Kit defaults still apply where the company docs are silent.${gone}`;
}
function buildIndex(docs, routes, mode, dropped, other, alias) {
    const total = docs.reduce((n, d) => n + d.tokens, 0);
    const byRel = new Map(docs.map((d) => [d.rel, d]));
    const routed = new Set(routes.map((r) => r.rel));
    const entries = docs.filter((d) => /instruction|agent|claude/i.test(path.posix.basename(d.rel)));
    const out = [
        INDEX_MARK, '# Company standards index', '',
        `Generated by install-kit from ${docs.length} files (~${total} tokens in all). Do not edit; run \`company sync\` after changing the folder. Paths are relative to \`coding-standards/company/\`.`,
        '', `**Precedence.** ${precedence(mode, dropped)} A missing rule is a gap: write "STANDARDS GAP:" and ask; never invent.`, '',
        ...(alias ? [(0, install_kit_signature_1.signatureLine)(alias), ''] : []),
    ];
    if (entries.length) {
        out.push('## Read first, once per session', ...entries.map((d) => `- \`${d.rel}\` — ${d.title} (~${d.tokens} tokens)`), '');
    }
    if (routes.length) {
        out.push('## Routes: read the file for each thing you build or change', '| If you build or change | Read |', '|---|---|', ...routes.map((r) => `| ${r.trigger.replace(/\|/g, '/')} | \`${r.rel}\` (~${byRel.get(r.rel).tokens}) |`), '');
    }
    const rest = docs.filter((d) => !routed.has(d.rel) && !entries.includes(d));
    if (rest.length) {
        out.push(routes.length ? '## Other files' : '## Files: read the one that matches the task', '| File | Covers | ~tokens |', '|---|---|---|', ...rest.map((d) => `| \`${d.rel}\` | ${d.title.replace(/\|/g, '/')}${d.summary ? ': ' + d.summary.replace(/\|/g, '/') : ''} | ${d.tokens} |`), '');
    }
    if (other)
        out.push(`${other} non-markdown file${other === 1 ? '' : 's'} in the folder (tokens, fonts, scripts) are kept but not indexed.`, '');
    return out.join('\n');
}
// Description stays under skill-writer's 40-word cap: it loads into every session whether the skill fires or not.
function buildSkill(docs) {
    const t = topics(docs).slice(0, 5);
    const covers = t.length ? ` (${t.join(', ')})` : '';
    return `---
name: company-standards
description: Use whenever you create or change UI, styles, markup or components${covers} that this company has written standards for. Load this BEFORE writing, then read coding-standards/company/INDEX.md and only the files it routes to.
---

# Company standards

Stops UI work that ignores the company's own rules or invents values they already define.

## Self-improvement (first and last)
1. **At start:** apply \`learnings.md\` if the \`learnings-inject\` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a route that picked the wrong file, a rule that kept being misread). Most uses add nothing.

## Rules
1. Read \`coding-standards/company/INDEX.md\` once per session (it routes; it is short).
2. For each thing you build or change, read the file it routes to before writing. Implement every MUST rule.
3. A rule that is missing is a gap: write \`STANDARDS GAP:\` and ask. Never invent a rule, value or component.
4. Finish with a short self-check naming the rule IDs you applied.

Generated by install-kit. Rules live in \`coding-standards/company/\`; remove with \`company remove\`.
`;
}
function protocolBlock(mode, dropped, alias) {
    return `${START}
## Company Standards

This project follows company standards in \`coding-standards/company/\`. Before editing code or UI they cover, read \`coding-standards/company/INDEX.md\` once per session, then only the files it routes to. ${precedence(mode, dropped)} A missing rule is a gap: write \`STANDARDS GAP:\` and ask; never invent.${alias ? '\n' + (0, install_kit_signature_1.signatureLine)(alias) : ''}
${END}`;
}
// ---- protocol file edits (marked block, Active Standards rows) ----
const SECTION_RE = /## Active Standards[\s\S]*?(?=\n## |\s*$)/;
function upsertBlock(body, block) {
    const re = new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`);
    if (re.test(body))
        return body.replace(re, `\n${block}\n`);
    return body.replace(/\s*$/, '') + `\n\n${block}\n`;
}
function removeBlock(body) {
    return body.replace(new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n?`), '\n');
}
function takeRows(body, labels) {
    const rows = {};
    const m = SECTION_RE.exec(body);
    if (!m)
        return { body, rows };
    const kept = m[0].split('\n').filter((line) => {
        const r = /^\|\s*([^|]+?)\s*\|/.exec(line);
        if (r && labels.includes(r[1])) {
            rows[r[1]] = line;
            return false;
        }
        return true;
    });
    return { body: body.slice(0, m.index) + kept.join('\n') + body.slice(m.index + m[0].length), rows };
}
function putRows(body, rows) {
    const m = SECTION_RE.exec(body);
    if (!m || !rows.length)
        return body;
    const lines = m[0].split('\n');
    let last = -1;
    lines.forEach((l, i) => { if (/^\|/.test(l))
        last = i; });
    if (last < 0)
        return body;
    lines.splice(last + 1, 0, ...rows);
    return body.slice(0, m.index) + lines.join('\n') + body.slice(m.index + m[0].length);
}
// Copies a folder in. A file that already exists and differs is left alone (listed in `skipped`) unless force is set:
// the company folder is the user's, so nothing in it is overwritten silently.
function copyTree(src, dest, force, st, base = src) {
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name))
            continue;
        const s = path.join(src, e.name);
        const d = path.join(dest, e.name);
        if (e.isDirectory()) {
            copyTree(s, d, force, st, base);
            continue;
        }
        if (fs.existsSync(d)) {
            if (fs.readFileSync(s).equals(fs.readFileSync(d)))
                continue;
            if (!force) {
                st.skipped.push(toSlash(path.relative(base, s)));
                continue;
            }
        }
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
        st.copied++;
    }
}
function takeFiles(stds, prefixes) {
    const gone = [];
    if (!fs.existsSync(stds))
        return gone;
    const under = (p) => prefixes.some((x) => (x.endsWith('/') ? p.startsWith(x) : p === x));
    for (const f of [...(0, skill_scope_move_1.walkFiles)(stds)]) {
        const rel = toSlash(path.relative(stds, f));
        if (rel.startsWith(exports.COMPANY_DIR + '/') || !under(rel))
            continue;
        fs.rmSync(f);
        gone.push(rel);
    }
    for (const x of prefixes)
        if (x.endsWith('/'))
            fs.rmSync(path.join(stds, x), { recursive: true, force: true });
    return gone;
}
// Everything under coding-standards/ except company/ -- the "don't install defaults" mode.
function takeAllDefaults(stds) {
    const gone = [];
    if (!fs.existsSync(stds))
        return gone;
    for (const e of fs.readdirSync(stds, { withFileTypes: true })) {
        if (e.name === exports.COMPANY_DIR)
            continue;
        const abs = path.join(stds, e.name);
        if (e.isDirectory())
            for (const f of (0, skill_scope_move_1.walkFiles)(abs))
                gone.push(toSlash(path.relative(stds, f)));
        else
            gone.push(e.name);
        fs.rmSync(abs, { recursive: true, force: true });
    }
    return gone;
}
// Prefixes that stay out of coding-standards/ on install and update.
function companyOmit(rec) {
    if (!rec)
        return [];
    if (rec.mode === 'drop')
        return ['*'];
    return rec.dropped.flatMap((k) => exports.DISCIPLINES[k]?.files ?? []);
}
function isOmitted(rel, omit) {
    if (!omit?.length || rel.startsWith(exports.COMPANY_DIR + '/'))
        return false;
    return omit.some((x) => x === '*' || (x.endsWith('/') ? rel.startsWith(x) : rel === x));
}
function writeGenerated(root, manifest, docs, routes, mode, dropped, other) {
    const written = [];
    const dir = companyDir(root);
    fs.writeFileSync(path.join(dir, 'INDEX.md'), buildIndex(docs, routes, mode, dropped, other, manifest.signature?.alias));
    written.push('coding-standards/company/INDEX.md');
    let skill = null;
    if (manifest.skillRoot) {
        skill = `${manifest.skillRoot}/company-standards/SKILL.md`;
        fs.mkdirSync(path.join(root, path.dirname(skill)), { recursive: true });
        fs.writeFileSync(path.join(root, skill), buildSkill(docs));
        written.push(skill);
    }
    const protocol = manifest.protocolFile || 'CLAUDE.md';
    const abs = path.join(root, protocol);
    const body = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : `# ${protocol}\n`;
    fs.writeFileSync(abs, upsertBlock(body, protocolBlock(mode, dropped, manifest.signature?.alias)));
    written.push(`${protocol} (marked "Company Standards" block)`);
    return { written, skill };
}
function doCompanySync(args) {
    const root = args.root;
    const manifest = (0, skill_scope_move_1.readManifest)(root);
    const prev = manifest.company;
    const mode = args.companyDefaults || prev?.mode || 'keep';
    const dir = companyDir(root);
    const stds = path.join(root, 'coding-standards');
    const notes = [];
    if (!args.companyDefaults && !prev)
        notes.push('--company-defaults not given: "keep" assumed (the kit defaults stay installed)');
    if (args.companyFrom) {
        const from = path.resolve(args.companyFrom);
        if (!fs.existsSync(from) || !fs.statSync(from).isDirectory())
            throw new Error(`--company-from is not a folder: ${from}`);
        if (path.resolve(from) === path.resolve(dir))
            throw new Error('--company-from points at the company folder itself');
    }
    if (args.dryRun)
        return dryRunSync(args, mode, prev, notes);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, 'README.md')))
        fs.writeFileSync(path.join(dir, 'README.md'), exports.COMPANY_README);
    if (args.companyFrom) {
        const st = { copied: 0, skipped: [] };
        copyTree(path.resolve(args.companyFrom), dir, !!args.force, st);
        notes.push(`copied ${st.copied} files from ${path.resolve(args.companyFrom)}`);
        if (st.skipped.length)
            notes.push(`${st.skipped.length} existing file${st.skipped.length === 1 ? '' : 's'} differ and were left alone (pass --force to overwrite): ${st.skipped.slice(0, 5).join(', ')}${st.skipped.length > 5 ? ', …' : ''}`);
    }
    const { docs, other } = scanCompany(dir);
    const routes = importRoutes(docs, dir);
    if (!manifest.signature) {
        const h = detectSignature(docs, dir);
        if (h)
            notes.push(`the company docs use the prefix "${h.alias}" (${h.attrs} data attributes${h.components ? `, ${h.components} components` : ''}). The project signature is your choice: run \`signature set ${h.alias}\` to use it, or pick another alias, or none.`);
    }
    let findings;
    const restore = new Set(prev?.restore ?? []);
    const rows = { ...(prev?.rows ?? {}) };
    let dropped = mode === 'drop' ? ['*'] : [...(prev?.dropped ?? [])];
    if (mode === 'auto') {
        if (!docs.length)
            notes.push('auto-detect has nothing to read yet: defaults kept. Add files and run `company sync`.');
        else {
            findings = detectOverlap(docs);
            dropped = findings.filter((f) => f.drop).map((f) => f.key);
        }
    }
    else if (mode === 'keep')
        dropped = [];
    // Take out what is newly dropped; put back what is no longer dropped.
    const wantAll = mode === 'drop';
    const wanted = wantAll ? ['*'] : dropped;
    const prevDropped = prev ? (prev.mode === 'drop' ? ['*'] : prev.dropped) : [];
    const protocolAbs = path.join(root, manifest.protocolFile || 'CLAUDE.md');
    let body = fs.existsSync(protocolAbs) ? fs.readFileSync(protocolAbs, 'utf8') : null;
    const toRestore = prevDropped.includes('*') ? (wantAll ? [] : ['*']) : wantAll ? [] : prevDropped.filter((k) => !wanted.includes(k));
    if (toRestore.length) {
        if (args.library)
            restoreFiles(args.library, stds, restore, toRestore);
        else
            notes.push('defaults that are no longer dropped were not put back: pass --library <path to ai-dev-kit>');
        const labels = toRestore.includes('*') ? Object.keys(rows) : toRestore.map((k) => exports.DISCIPLINES[k]?.label).filter((l) => !!l && l in rows);
        if (body)
            body = putRows(body, labels.map((l) => rows[l]));
        for (const l of labels)
            delete rows[l];
    }
    if (wantAll && !prevDropped.includes('*')) {
        for (const f of takeAllDefaults(stds))
            restore.add(f);
        if (body) {
            const t = takeRows(body, [...Object.values(exports.DISCIPLINES).map((d) => d.label), ...EXTRA_ROWS]);
            body = t.body;
            Object.assign(rows, t.rows);
        }
    }
    else if (!wantAll) {
        const fresh = wanted.filter((k) => !prevDropped.includes(k));
        for (const k of fresh)
            for (const f of takeFiles(stds, exports.DISCIPLINES[k].files))
                restore.add(f);
        if (fresh.length && body) {
            const t = takeRows(body, fresh.map((k) => exports.DISCIPLINES[k].label));
            body = t.body;
            Object.assign(rows, t.rows);
        }
    }
    if (body !== null)
        fs.writeFileSync(protocolAbs, body);
    const gen = writeGenerated(root, manifest, docs, routes, mode, dropped.filter((k) => k !== '*'), other);
    manifest.company = { mode, dropped, restore: [...restore], rows, skill: gen.skill, files: docs.length, generatedAt: new Date().toISOString() };
    (0, skill_scope_move_1.writeManifest)(root, manifest);
    const tokens = docs.reduce((n, d) => n + d.tokens, 0);
    if (docs.length === 0)
        notes.push('the company folder has no markdown files yet: add them to coding-standards/company/ and run `company sync`.');
    return { mode, files: docs.length, routes: routes.length, tokens, findings, dropped, written: gen.written, notes, disclaimer: mode === 'auto' ? exports.AUTO_DISCLAIMER : undefined };
}
// --dry-run: scan the source (or the existing folder), decide, and report. Writes nothing.
function dryRunSync(args, mode, prev, notes) {
    const src = args.companyFrom ? path.resolve(args.companyFrom) : companyDir(args.root);
    const { docs } = scanCompany(src);
    const routes = importRoutes(docs, src);
    const findings = mode === 'auto' && docs.length ? detectOverlap(docs) : undefined;
    const dropped = mode === 'drop' ? ['*'] : findings ? findings.filter((f) => f.drop).map((f) => f.key) : mode === 'keep' ? [] : prev?.dropped ?? [];
    const stds = path.join(args.root, 'coding-standards');
    const prefixes = dropped.includes('*') ? ['*'] : dropped.flatMap((k) => exports.DISCIPLINES[k]?.files ?? []);
    const gone = fs.existsSync(stds) && prefixes.length ? [...(0, skill_scope_move_1.walkFiles)(stds)].map((f) => toSlash(path.relative(stds, f))).filter((rel) => isOmitted(rel, prefixes)).length : 0;
    notes.unshift('dry run: nothing was written');
    if (!(0, skill_scope_move_1.readManifest)(args.root).signature) {
        const h = detectSignature(docs, src);
        if (h)
            notes.push(`the company docs use the prefix "${h.alias}"; the project signature is your choice (signature set ${h.alias}, another alias, or none)`);
    }
    if (gone)
        notes.push(`would remove ${gone} installed default standards files (put back by "company remove")`);
    return { mode, files: docs.length, routes: routes.length, tokens: docs.reduce((n, d) => n + d.tokens, 0), findings, dropped, written: [], notes, disclaimer: mode === 'auto' ? exports.AUTO_DISCLAIMER : undefined };
}
function restoreFiles(library, stds, restore, keys) {
    const prefixes = keys.includes('*') ? ['*'] : keys.flatMap((k) => exports.DISCIPLINES[k]?.files ?? []);
    for (const rel of [...restore]) {
        if (!isOmitted(rel, prefixes))
            continue;
        const src = path.join(library, 'coding-standards', rel);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(path.join(stds, rel)), { recursive: true });
            fs.copyFileSync(src, path.join(stds, rel));
        }
        restore.delete(rel);
    }
}
// Regenerates INDEX.md and the skill from the current folder; never changes which defaults are installed.
function refreshCompany(root, manifest) {
    const rec = manifest.company;
    if (!rec || !fs.existsSync(companyDir(root)))
        return;
    const { docs, other } = scanCompany(companyDir(root));
    const routes = importRoutes(docs, companyDir(root));
    const gen = writeGenerated(root, manifest, docs, routes, rec.mode, rec.dropped.filter((k) => k !== '*'), other);
    rec.skill = gen.skill;
    rec.files = docs.length;
    rec.generatedAt = new Date().toISOString();
}
function doCompanyRemove(args) {
    const root = args.root;
    const manifest = (0, skill_scope_move_1.readManifest)(root);
    const rec = manifest.company;
    const out = { removed: [], restored: [], kept: [] };
    const stds = path.join(root, 'coding-standards');
    const dir = companyDir(root);
    if (!rec && !fs.existsSync(dir)) {
        out.kept.push('no company standards found: nothing to remove');
        return out;
    }
    if (args.dryRun) {
        out.kept.push('dry run: nothing was changed');
        out.removed.push('coding-standards/company/INDEX.md', `the "Company Standards" block in ${manifest.protocolFile || 'CLAUDE.md'}`);
        if (rec?.skill)
            out.removed.push(path.dirname(rec.skill));
        if (rec?.restore.length && !args.noRestore)
            out.restored.push(`${rec.restore.length} default standards files and ${Object.keys(rec.rows).length} Active Standards rows`);
        out.kept.push(args.purge ? 'would delete your files in coding-standards/company/ (--purge)' : 'your files in coding-standards/company/ would stay');
        return out;
    }
    if (rec) {
        const restore = new Set(rec.restore);
        if (args.noRestore) { /* defaults are being removed with the rest of coding-standards/ */ }
        else if (args.library && restore.size) {
            const before = restore.size;
            restoreFiles(args.library, stds, restore, ['*']);
            out.restored.push(...rec.restore.filter((f) => !restore.has(f)));
            if (restore.size === before)
                out.kept.push('removed defaults could not be restored: pass --library <path to ai-dev-kit>, or run `update` later');
        }
        else if (restore.size)
            out.kept.push(`${restore.size} removed default files not restored: pass --library <path to ai-dev-kit>`);
        const protocolAbs = path.join(root, manifest.protocolFile || 'CLAUDE.md');
        if (fs.existsSync(protocolAbs)) {
            let body = removeBlock(fs.readFileSync(protocolAbs, 'utf8'));
            if (restore.size === 0)
                body = putRows(body, Object.values(rec.rows));
            // A protocol file the company step created (just its heading) goes with it; anything else stays.
            if (body.trim() === `# ${manifest.protocolFile || 'CLAUDE.md'}`)
                fs.rmSync(protocolAbs);
            else
                fs.writeFileSync(protocolAbs, body);
            out.removed.push(`${manifest.protocolFile || 'CLAUDE.md'} (Company Standards block)`);
            if (restore.size === 0 && Object.keys(rec.rows).length)
                out.restored.push(`${Object.keys(rec.rows).length} Active Standards rows`);
        }
        if (rec.skill) {
            fs.rmSync(path.join(root, path.dirname(rec.skill)), { recursive: true, force: true });
            out.removed.push(path.dirname(rec.skill));
        }
    }
    fs.rmSync(path.join(dir, 'INDEX.md'), { force: true });
    out.removed.push('coding-standards/company/INDEX.md');
    if (args.purge) {
        fs.rmSync(dir, { recursive: true, force: true });
        out.removed.push('coding-standards/company/ (your files, --purge)');
        if (fs.existsSync(stds) && !fs.readdirSync(stds).length)
            fs.rmdirSync(stds);
    }
    else {
        const left = scanCompany(dir);
        if (!left.docs.length && !left.other) {
            fs.rmSync(dir, { recursive: true, force: true });
            out.removed.push('coding-standards/company/ (was empty)');
        }
        else
            out.kept.push('coding-standards/company/ left in place: your files (add --purge to delete them)');
    }
    delete manifest.company;
    (0, skill_scope_move_1.writeManifest)(root, manifest);
    return out;
}
function companyStatus(root) {
    const rec = (0, skill_scope_move_1.readManifest)(root).company;
    if (!rec)
        return { installed: false };
    const { docs } = scanCompany(companyDir(root));
    return { installed: true, mode: rec.mode, files: docs.length, indexed: rec.files, stale: docs.length !== rec.files, dropped: rec.dropped };
}
