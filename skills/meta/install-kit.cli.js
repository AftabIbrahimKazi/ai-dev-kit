#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STACK_PRESETS = void 0;
exports.listSkills = listSkills;
exports.readManifest = readManifest;
exports.writeManifest = writeManifest;
exports.extractCoreHooks = extractCoreHooks;
exports.mergeHooks = mergeHooks;
exports.doMergeHooks = doMergeHooks;
exports.installOneSkill = installOneSkill;
exports.stripTemplatePreamble = stripTemplatePreamble;
exports.applyContextCode = applyContextCode;
exports.pruneSkillTriggers = pruneSkillTriggers;
exports.removeParallelSessionSection = removeParallelSessionSection;
exports.installStandards = installStandards;
exports.doInstall = doInstall;
exports.doUpdate = doUpdate;
exports.parseRenameLedger = parseRenameLedger;
exports.applyRenameMigrations = applyRenameMigrations;
exports.doUninstall = doUninstall;
exports.doArchive = doArchive;
exports.doUnarchive = doUnarchive;
exports.eligibleCatalogNames = eligibleCatalogNames;
exports.detectStackSignals = detectStackSignals;
exports.loadSkillPurposes = loadSkillPurposes;
// Mechanical half of install-kit: install/update/uninstall/archive/unarchive skills by moving files,
// deterministically. Claude still decides WHAT to install (mode, stack, addon opt-ins, context-code
// value, comment-style level, which skills a session doesn't need) -- this script only executes that
// decision reliably, instead of Claude hand-copying or hand-moving each file across a long narrated
// session. See skills/meta/install-kit.md (install/update/uninstall) and the `handover` skill (archive).
//
//   node install-kit.cli.js list      --library <path> [--json]
//   node install-kit.cli.js install   --library <path> --root <target> --tool claude|opencode|codex
//                                      --skills a,b,c[:companion+companion] [--standards]
//                                      [--comment-style-level none|terse|descriptive] [--context-code X7|none]
//                                      [--force] [--json]
//   node install-kit.cli.js update    --library <path> --root <target> [--skills a,b | --all]
//                                      [--context-code X7|none] [--apply-migrations a,b|all] [--json]
//   node install-kit.cli.js uninstall --root <target> [--skills a,b | --all] [--remove-standards] [--json]
//   node install-kit.cli.js archive   --root <target> [--skills a,b | --all] [--json]
//   node install-kit.cli.js unarchive --root <target> [--skills a,b | --all] [--json]
//   node install-kit.cli.js merge-hooks --library <path> --root <target> [--json]
//
// Interactive mode: run any command with a required flag left out on a real terminal (stdin and
// stdout both a TTY) and the CLI prompts for exactly the missing pieces -- a plain numbered menu
// ("1) claude  2) opencode  3) codex -- type a number"), comma-separated numbers for a multi-pick,
// plain text otherwise -- then proceeds exactly as if those flags had been passed. Anything already
// given on the command line is never re-asked. Built on node:readline only, deliberately: this file
// ships as plain .js with no npm install step (the kit's install-everywhere promise), so it cannot
// depend on a package that would only exist after `npm install`. This path exists for a human running
// the script directly, or an agent with no multiple-choice widget of its own (OpenCode/Codex); Claude
// Code always passes every flag explicitly and so never triggers it, --json callers should too.
//
// No network. Reads the manifest at <target>/.ai-dev-kit.json to know what the kit itself installed
// (and, for archive/unarchive, what it moved aside), so no command ever touches a folder it didn't create.
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const verifyModule = require("./install-kit.verify");
const { verify, ROOTS } = verifyModule;
const MANIFEST_NAME = '.ai-dev-kit.json';
const EXCLUDE_DIRS = new Set(['commands']);
const EXCLUDE_NAMES = new Set(['README.md']);
// Mirrors skill-scope.md's classification -- keep both in sync by hand; nothing here is derived
// from that file automatically. Used only by the terminal interactive fallback (fillInteractive)
// to build an Auto-detect default without dumping the full catalog as one typed multiselect.
const UNIVERSAL_SKILLS = [
    'skill-scope', 'handover', 'coding-standards', 'comment-style', 'session-budget',
    'agent-usage', 'mode-kernel', 'pre-merge-gate', 'pre-commit', 'debug-protocol',
    'intent-capture', 'plan-first', 'interpretation-checkpoint',
];
const ARCHIVABLE_SKILLS = [
    'perf-audit', 'code-audit', 'resolve-conflicts', 'responsive-check', 'optimize-assets',
    'role-session', 'e2e-scaffold', 'memory-gardener', 'skill-ablation', 'skill-writer', 'mod-writer',
];
// Categories skill-scope.md says are "never part of Everything/Pick/Auto-detect by default" --
// excluded from both the Auto-detect default and the Everything preset; still reachable through
// "Pick individually".
const OPT_IN_DIR_PREFIXES = ['addons', 'mcp'];
const OPT_IN_NAMES = new Set(['mod-setup', 'misfire-log']);
exports.STACK_PRESETS = {
    astro: { label: 'Astro', skills: ['astro-page'] },
    nextjs: {
        label: 'Next.js',
        skills: [],
        gap: 'no stack skill or coding-standards framework override exists for Next.js yet (App Router / Server-Component conventions aren\'t encoded anywhere in the kit) -- only the standard skill set applies',
    },
    laravel: {
        label: 'Laravel',
        skills: [],
        gap: 'the kit has no PHP/Blade coding-standards layer yet (html-standards.md does not cover Blade syntax) -- only the standard skill set applies',
    },
};
function isMeta(relDir, name) {
    return relDir === 'meta' && name.startsWith('install-kit');
}
// Discover every skill + its companions under the library's skills/ tree.
function listSkills(libraryRoot) {
    const skillsRoot = path.join(libraryRoot, 'skills');
    const out = {};
    function walk(absDir, relDir) {
        const entries = fs.readdirSync(absDir, { withFileTypes: true });
        const names = entries
            .map((e) => e.name)
            // .ts files are dev-time source for a compiled .js companion -- never an installable artifact.
            .filter((n) => !EXCLUDE_NAMES.has(n) && !isMeta(relDir, n) && !n.endsWith('.ts'));
        const mdStems = names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3));
        const skillNames = mdStems.filter((s) => !mdStems.some((other) => other !== s && s.startsWith(other + '.')));
        const claimed = new Set(skillNames.map((s) => s + '.md'));
        for (const skillName of skillNames) {
            if (out[skillName])
                throw new Error(`duplicate skill name "${skillName}" found in ${relDir} and ${out[skillName].dir}`);
            const companions = [];
            for (const n of names) {
                if (n === skillName + '.md')
                    continue;
                if (n.startsWith(skillName + '.')) {
                    companions.push({ src: n, target: n.slice(skillName.length + 1) });
                    claimed.add(n);
                }
            }
            out[skillName] = { dir: relDir, companions };
        }
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            if (EXCLUDE_DIRS.has(e.name))
                continue;
            if (claimed.has(e.name))
                continue; // consumed as a companion directory (e.g. personality.personas/)
            walk(path.join(absDir, e.name), relDir ? `${relDir}/${e.name}` : e.name);
        }
    }
    walk(skillsRoot, '');
    return out;
}
function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(src))
            copyRecursive(path.join(src, name), path.join(dest, name));
    }
    else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}
function filesDiffer(a, b) {
    if (!fs.existsSync(a) || !fs.existsSync(b))
        return true;
    const sa = fs.statSync(a), sb = fs.statSync(b);
    if (sa.isDirectory() || sb.isDirectory())
        return true;
    return !fs.readFileSync(a).equals(fs.readFileSync(b));
}
// Parses an entry like "mcp-manager:stitch+image-gen" or "handover" into { name, only: Set|null }.
function parseSkillToken(token) {
    const [name, companionList] = token.split(':');
    const only = companionList ? new Set(companionList.split('+').filter(Boolean)) : null;
    return { name: name.trim(), only };
}
function companionStem(targetName) {
    // "install-hook.js" -> "install-hook"; "roles.example.json" -> "roles.example"
    const dot = targetName.lastIndexOf('.');
    return dot === -1 ? targetName : targetName.slice(0, dot);
}
const ACTIVE_LEVEL_RE = /\*\*Active level:\s*([a-z]*)\*\*/;
const CONTEXT_CODE_ROW_RE = /(\|\s*Context code\s*\|\s*)(.*?)(\s*\|)/;
function readManifest(root) {
    const p = path.join(root, MANIFEST_NAME);
    if (!fs.existsSync(p))
        return { version: 1, tool: null, standards: false, commentStyleLevel: null, contextCode: null, skills: {}, archived: {} };
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!m.archived)
        m.archived = {};
    return m;
}
function writeManifest(root, manifest) {
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(root, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
}
function skillRootHasJs(absSkillRoot) {
    if (!fs.existsSync(absSkillRoot))
        return false;
    for (const name of fs.readdirSync(absSkillRoot)) {
        const abs = path.join(absSkillRoot, name);
        if (fs.statSync(abs).isDirectory()) {
            for (const f of walkFiles(abs))
                if (f.endsWith('.js'))
                    return true;
        }
    }
    return false;
}
function* walkFiles(dir) {
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory())
            yield* walkFiles(abs);
        else
            yield abs;
    }
}
function ensureShield(absSkillRoot) {
    const pkg = path.join(absSkillRoot, 'package.json');
    if (fs.existsSync(pkg)) {
        const body = fs.readFileSync(pkg, 'utf8');
        if (/"type"\s*:\s*"commonjs"/.test(body))
            return false;
    }
    fs.mkdirSync(absSkillRoot, { recursive: true });
    fs.writeFileSync(pkg, '{\n  "type": "commonjs"\n}\n');
    return true;
}
function removeShieldIfUnneeded(absSkillRoot) {
    if (skillRootHasJs(absSkillRoot))
        return false;
    const pkg = path.join(absSkillRoot, 'package.json');
    if (!fs.existsSync(pkg))
        return false;
    const body = fs.readFileSync(pkg, 'utf8');
    if (!/"type"\s*:\s*"commonjs"/.test(body))
        return false;
    fs.rmSync(pkg);
    return true;
}
// Pulls the `<!-- hook:core -->`-marked JSON blocks out of hooks-enforcement.md, so the merge can never
// drift from what that file documents -- there is exactly one source of truth for the sample hooks.
function extractCoreHooks(libraryRoot) {
    const p = path.join(libraryRoot, 'skills', 'models', 'claude', 'hooks-enforcement.md');
    const body = fs.readFileSync(p, 'utf8');
    const re = /<!-- hook:core -->\s*```json\s*([\s\S]*?)```/g;
    const configs = [];
    let m;
    while ((m = re.exec(body)))
        configs.push(JSON.parse(m[1]));
    return configs;
}
// Merges one or more { hooks: { <Event>: [entry, ...] } } configs into <root>/.claude/settings.json,
// adding only entries not already present (by deep equality) and never touching anything else in the file.
function mergeHooks(root, configs) {
    const p = path.join(root, '.claude', 'settings.json');
    let settings = {};
    if (fs.existsSync(p))
        settings = JSON.parse(fs.readFileSync(p, 'utf8'));
    settings.hooks = settings.hooks || {};
    const added = [];
    for (const config of configs) {
        for (const [event, entries] of Object.entries(config.hooks || {})) {
            settings.hooks[event] = settings.hooks[event] || [];
            for (const entry of entries) {
                const exists = settings.hooks[event].some((e) => JSON.stringify(e) === JSON.stringify(entry));
                if (!exists) {
                    settings.hooks[event].push(entry);
                    added.push(event);
                }
            }
        }
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
    return { added, path: path.join('.claude', 'settings.json') };
}
function doMergeHooks(args) {
    const configs = extractCoreHooks(args.library);
    return mergeHooks(args.root, configs);
}
// Copies one skill (by name) from the library into the target skill root.
function installOneSkill(libraryRoot, absSkillRoot, catalog, token, opts) {
    const { name, only } = parseSkillToken(token);
    const entry = catalog[name];
    if (!entry)
        return { name, error: `not found in library: ${name}` };
    const destDir = path.join(absSkillRoot, name);
    const srcSkillFile = path.join(libraryRoot, 'skills', entry.dir, name + '.md');
    const destSkillFile = path.join(destDir, 'SKILL.md');
    let changed = false;
    let newBody = fs.readFileSync(srcSkillFile, 'utf8');
    if (name === 'comment-style') {
        const existing = fs.existsSync(destSkillFile) ? fs.readFileSync(destSkillFile, 'utf8') : null;
        const existingLevel = existing && ACTIVE_LEVEL_RE.exec(existing);
        const level = opts.commentStyleLevel || (existingLevel && existingLevel[1]) || null;
        if (level)
            newBody = newBody.replace(ACTIVE_LEVEL_RE, `**Active level: ${level}**`);
    }
    if (!fs.existsSync(destSkillFile) || fs.readFileSync(destSkillFile, 'utf8') !== newBody) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(destSkillFile, newBody);
        changed = true;
    }
    const companions = only ? entry.companions.filter((c) => only.has(companionStem(c.target))) : entry.companions;
    for (const c of companions) {
        const src = path.join(libraryRoot, 'skills', entry.dir, c.src);
        const dest = path.join(destDir, c.target);
        if (filesDiffer(src, dest)) {
            copyRecursive(src, dest);
            changed = true;
        }
    }
    return { name, changed, companions: companions.map((c) => c.target) };
}
function stripTemplatePreamble(body) {
    const marker = /^# \[?CLAUDE\.md \| AGENTS\.md\]?/m;
    const m = marker.exec(body);
    return m ? body.slice(m.index) : body;
}
function applyContextCode(body, contextCode) {
    if (contextCode === 'none' || !contextCode) {
        return body.replace(/^\|\s*Context code\s*\|.*?\|\n?/m, '');
    }
    return body.replace(CONTEXT_CODE_ROW_RE, (_match, a, _b, c) => `${a}${contextCode}${c}`);
}
// Deletes Skill-Triggers rows whose `Skill` column names a skill not in `installedNames` -- the
// template ships with rows for the common universal skills, but a bare install may lack one of them.
function pruneSkillTriggers(body, installedNames) {
    const sectionRe = /## Skill Triggers[\s\S]*?(?=\n## |\s*$)/;
    const m = sectionRe.exec(body);
    if (!m)
        return body;
    const kept = m[0].split('\n').filter((line) => {
        const row = /^\|(.+)\|(.+)\|\s*$/.exec(line);
        if (!row)
            return true;
        const cell = row[2].trim();
        if (!cell || /^-+$/.test(cell) || cell.toLowerCase() === 'skill')
            return true;
        const code = /`([^`]+)`/.exec(cell);
        return code ? installedNames.has(code[1]) : true;
    });
    return body.slice(0, m.index) + kept.join('\n') + body.slice(m.index + m[0].length);
}
// Drops the whole Parallel-Session Coordination section unless role-session is installed -- it only
// applies to projects actually running the parallel-session system.
function removeParallelSessionSection(body, roleSessionInstalled) {
    if (roleSessionInstalled)
        return body;
    return body.replace(/\n?## Parallel-Session Coordination[\s\S]*?(?=\n## |\s*$)/, '');
}
function installStandards(libraryRoot, root, protocolFile, opts) {
    const result = { copied: [], protocolCreated: false, refused: false };
    const srcDir = path.join(libraryRoot, 'coding-standards');
    const destDir = path.join(root, 'coding-standards');
    if (fs.existsSync(destDir) && !opts.force) {
        for (const f of walkFiles(srcDir)) {
            const rel = path.relative(srcDir, f);
            if (rel === 'CLAUDE.example.md')
                continue;
            const dest = path.join(destDir, rel);
            if (filesDiffer(f, dest)) {
                copyRecursive(f, dest);
                result.copied.push(rel);
            }
        }
    }
    else {
        for (const f of walkFiles(srcDir)) {
            const rel = path.relative(srcDir, f);
            if (rel === 'CLAUDE.example.md')
                continue;
            copyRecursive(f, path.join(destDir, rel));
            result.copied.push(rel);
        }
    }
    const protocolAbs = path.join(root, protocolFile);
    if (!fs.existsSync(protocolAbs)) {
        let body = stripTemplatePreamble(fs.readFileSync(path.join(srcDir, 'CLAUDE.example.md'), 'utf8'));
        if (opts.contextCode)
            body = applyContextCode(body, opts.contextCode);
        if (opts.installedNames) {
            body = pruneSkillTriggers(body, opts.installedNames);
            body = removeParallelSessionSection(body, opts.installedNames.has('role-session'));
        }
        fs.writeFileSync(protocolAbs, body);
        result.protocolCreated = true;
    }
    else if (opts.contextCode) {
        const body = fs.readFileSync(protocolAbs, 'utf8');
        fs.writeFileSync(protocolAbs, applyContextCode(body, opts.contextCode));
    }
    return result;
}
function doInstall(args) {
    const tool = ROOTS[args.tool];
    if (!tool)
        throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
    const catalog = listSkills(args.library);
    const absSkillRoot = path.join(args.root, tool.skills);
    const manifest = readManifest(args.root);
    manifest.tool = args.tool;
    manifest.skillRoot = tool.skills;
    manifest.protocolFile = tool.protocol;
    const results = [];
    for (const token of args.skills || []) {
        const r = installOneSkill(args.library, absSkillRoot, catalog, token, {
            commentStyleLevel: args.commentStyleLevel,
        });
        results.push(r);
        if (!r.error)
            manifest.skills[r.name] = { dir: catalog[r.name].dir, companions: r.companions };
    }
    if (ensureShield(absSkillRoot))
        results.push({ name: '(shield)', changed: true });
    let standardsResult = null;
    if (args.standards) {
        standardsResult = installStandards(args.library, args.root, tool.protocol, {
            contextCode: args.contextCode,
            force: args.force,
            installedNames: new Set(Object.keys(manifest.skills)),
        });
        manifest.standards = true;
    }
    if (args.commentStyleLevel)
        manifest.commentStyleLevel = args.commentStyleLevel;
    if (args.contextCode)
        manifest.contextCode = args.contextCode;
    writeManifest(args.root, manifest);
    const verifyResult = verify({ root: args.root, tool: args.tool });
    return { skills: results, standards: standardsResult, verify: verifyResult };
}
function doUpdate(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, MANIFEST_NAME) + ' -- run install first');
    const tool = ROOTS[(args.tool || manifest.tool)];
    if (!tool)
        throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
    const catalog = listSkills(args.library);
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const names = args.all ? Object.keys(manifest.skills) : (args.skills || []);
    const results = [];
    for (const token of names) {
        const { name } = parseSkillToken(token);
        if (!manifest.skills[name]) {
            results.push({ name, error: 'not installed by this kit (not in manifest) -- skipped' });
            continue;
        }
        const r = installOneSkill(args.library, absSkillRoot, catalog, token, {
            commentStyleLevel: args.commentStyleLevel || manifest.commentStyleLevel || undefined,
        });
        results.push(r);
        if (!r.error)
            manifest.skills[r.name] = { dir: catalog[r.name].dir, companions: r.companions };
    }
    ensureShield(absSkillRoot);
    const migrations = applyRenameMigrations(args.library, args.root, manifest, args.applyMigrations);
    if (manifest.standards && args.contextCode) {
        installStandards(args.library, args.root, manifest.protocolFile, { contextCode: args.contextCode });
    }
    else if (manifest.standards) {
        installStandards(args.library, args.root, manifest.protocolFile, {});
    }
    if (args.contextCode)
        manifest.contextCode = args.contextCode;
    writeManifest(args.root, manifest);
    const verifyResult = verify({ root: args.root, tool: manifest.tool });
    return { skills: results, migrations, verify: verifyResult };
}
function parseRenameLedger(libraryRoot) {
    const p = path.join(libraryRoot, 'migrations', 'RENAMES.md');
    if (!fs.existsSync(p))
        return [];
    const body = fs.readFileSync(p, 'utf8');
    const rows = [];
    for (const line of body.split('\n')) {
        const m = /^\|\s*[\d-]+\s*\|\s*`?([\w.-]+)`?\s*\|\s*`?([\w.-]+)`?\s*\|/.exec(line);
        if (m)
            rows.push({ oldName: m[1], newName: m[2] });
    }
    return rows;
}
function applyRenameMigrations(libraryRoot, root, manifest, apply) {
    const ledger = parseRenameLedger(libraryRoot);
    const absSkillRoot = path.join(root, manifest.skillRoot);
    const pending = [];
    if (!fs.existsSync(absSkillRoot))
        return pending;
    const existing = fs.readdirSync(absSkillRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const applySet = apply === 'all' ? null : new Set(apply || []);
    for (const { oldName, newName } of ledger) {
        if (!existing.includes(oldName))
            continue;
        const entry = { oldName, newName, applied: false };
        const shouldApply = apply === 'all' || (applySet && applySet.has(oldName));
        if (shouldApply) {
            const catalog = listSkills(libraryRoot);
            if (catalog[newName]) {
                const r = installOneSkill(libraryRoot, absSkillRoot, catalog, newName, {});
                manifest.skills[newName] = { dir: catalog[newName].dir, companions: r.companions || [] };
                const oldLearnings = path.join(absSkillRoot, oldName, 'learnings.md');
                if (fs.existsSync(oldLearnings))
                    copyRecursive(oldLearnings, path.join(absSkillRoot, newName, 'learnings.md'));
                fs.rmSync(path.join(absSkillRoot, oldName), { recursive: true, force: true });
                delete manifest.skills[oldName];
                entry.applied = true;
            }
        }
        pending.push(entry);
    }
    return pending;
}
function doUninstall(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        return { removed: [], kept: [], note: 'no install manifest found -- nothing tracked to remove' };
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const names = args.all ? Object.keys(manifest.skills) : (args.skills || []);
    const removed = [];
    const kept = [];
    for (const name of names) {
        if (!manifest.skills[name]) {
            kept.push(`${name}: not tracked in manifest, left alone`);
            continue;
        }
        const dir = path.join(absSkillRoot, name);
        if (fs.existsSync(dir))
            fs.rmSync(dir, { recursive: true, force: true });
        delete manifest.skills[name];
        removed.push(`${manifest.skillRoot}/${name}`);
    }
    if (removeShieldIfUnneeded(absSkillRoot))
        removed.push(`${manifest.skillRoot}/package.json (shield, no longer needed)`);
    if (args.removeStandards && manifest.standards) {
        const dir = path.join(args.root, 'coding-standards');
        if (fs.existsSync(dir))
            fs.rmSync(dir, { recursive: true, force: true });
        removed.push('coding-standards/');
        manifest.standards = false;
        kept.push(`${manifest.protocolFile} left in place -- it may carry project-specific edits; remove it by hand if no longer wanted`);
    }
    else if (manifest.standards) {
        kept.push('coding-standards/ left in place (pass --remove-standards to remove it)');
    }
    writeManifest(args.root, manifest);
    return { removed, kept };
}
// Moves a skill out of the active skill root into <tool-dir>/skills-archive/, keeping it on disk but
// invisible to the tool -- the mechanical half of handover's per-session archive decision.
function doArchive(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, MANIFEST_NAME) + ' -- run install first');
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const archiveRoot = path.join(args.root, path.dirname(manifest.skillRoot), 'skills-archive');
    const names = args.all ? Object.keys(manifest.skills) : (args.skills || []);
    const archived = [];
    const kept = [];
    for (const name of names) {
        if (!manifest.skills[name]) {
            kept.push(`${name}: not tracked as installed, left alone`);
            continue;
        }
        const src = path.join(absSkillRoot, name);
        const dest = path.join(archiveRoot, name);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(src, dest);
        }
        manifest.archived[name] = manifest.skills[name];
        delete manifest.skills[name];
        archived.push(name);
    }
    if (removeShieldIfUnneeded(absSkillRoot))
        archived.push('(shield removed, no longer needed)');
    writeManifest(args.root, manifest);
    return { archived, kept };
}
// Reverses doArchive: moves a skill back from skills-archive/ into the active skill root.
function doUnarchive(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, MANIFEST_NAME) + ' -- run install first');
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const archiveRoot = path.join(args.root, path.dirname(manifest.skillRoot), 'skills-archive');
    const names = args.all ? Object.keys(manifest.archived) : (args.skills || []);
    const restored = [];
    const kept = [];
    for (const name of names) {
        if (!manifest.archived[name]) {
            kept.push(`${name}: not archived, left alone`);
            continue;
        }
        const src = path.join(archiveRoot, name);
        const dest = path.join(absSkillRoot, name);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(src, dest);
        }
        manifest.skills[name] = manifest.archived[name];
        delete manifest.archived[name];
        restored.push(name);
    }
    ensureShield(absSkillRoot);
    writeManifest(args.root, manifest);
    return { restored, kept };
}
function isInteractive() {
    return !!process.stdout.isTTY && !!process.stdin.isTTY;
}
function defaultLibraryGuess() {
    // This compiled file lives at <library>/skills/meta/install-kit.cli.js.
    return path.resolve(__dirname, '..', '..');
}
function detectToolEvidence(root) {
    const out = {};
    const hasOpencode = fs.existsSync(path.join(root, '.opencode')) || fs.existsSync(path.join(root, 'opencode.json'));
    const hasClaude = fs.existsSync(path.join(root, '.claude')) || fs.existsSync(path.join(root, 'CLAUDE.md'));
    const hasAgentsDir = fs.existsSync(path.join(root, '.agents'));
    const hasAgentsFile = fs.existsSync(path.join(root, 'AGENTS.md'));
    if (hasOpencode)
        out.opencode = '.opencode/ or opencode.json found';
    if (hasClaude)
        out.claude = '.claude/ or CLAUDE.md found';
    if (hasAgentsDir || (hasAgentsFile && !hasOpencode))
        out.codex = '.agents/ or a bare AGENTS.md found';
    return out;
}
function isOptInOnly(entry, name) {
    if (OPT_IN_NAMES.has(name))
        return true;
    return OPT_IN_DIR_PREFIXES.some((p) => entry.dir === p || entry.dir.startsWith(p + '/'));
}
// Everything, minus the categories skill-scope.md says never belong to Everything/Pick/Auto-detect
// by default (addons, MCP, mod-setup, misfire-log) -- those stay reachable only via Pick individually.
function eligibleCatalogNames(catalog) {
    return Object.keys(catalog).filter((name) => !isOptInOnly(catalog[name], name));
}
function readJsonSafe(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function hasDependency(pkg, name) {
    if (!pkg)
        return false;
    return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}
function hasDependencyPrefix(pkg, prefix) {
    if (!pkg)
        return false;
    const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
    return names.some((n) => n.startsWith(prefix));
}
// Scans the target for skill-scope.md's conditional-pinned signals -- only the objective, file-based
// ones (a dependency, a config file, an existing folder). The model-lineup signals need a judgment
// call ("which model is this project driven by") and are deliberately left out here, same spirit as
// install-kit.md: cite the signal found, never pin on a guess.
function detectStackSignals(root, tool) {
    const out = [];
    const pkgPath = path.join(root, 'package.json');
    const pkg = fs.existsSync(pkgPath) ? readJsonSafe(pkgPath) : null;
    if (hasDependency(pkg, 'three'))
        out.push({ name: 'threejs-scene', evidence: '"three" in package.json dependencies' });
    const astroConfig = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
        .find((f) => fs.existsSync(path.join(root, f)));
    if (astroConfig || hasDependency(pkg, 'astro')) {
        out.push({ name: 'astro-page', evidence: astroConfig ? `${astroConfig} present` : '"astro" in package.json dependencies' });
    }
    if (hasDependencyPrefix(pkg, 'strata'))
        out.push({ name: 'strata-css', evidence: 'a "strata*" package in package.json' });
    if (hasDependencyPrefix(pkg, '@triforge/'))
        out.push({ name: 'triforge', evidence: 'a "@triforge/*" package in package.json' });
    const hasShopifyToml = fs.existsSync(path.join(root, 'shopify.theme.toml'));
    const hasShopifyCli = fs.existsSync(path.join(root, '.shopifycli'));
    const hasShopifyDirs = fs.existsSync(path.join(root, 'sections')) && fs.existsSync(path.join(root, 'snippets'));
    if (hasShopifyToml || hasShopifyCli || hasShopifyDirs) {
        out.push({
            name: 'shopify-toolkit-install',
            evidence: hasShopifyToml ? 'shopify.theme.toml present' : hasShopifyCli ? '.shopifycli present' : 'sections/ and snippets/ present',
        });
    }
    if (fs.existsSync(path.join(root, 'memory-bank'))) {
        out.push({ name: 'memory-bank', evidence: 'memory-bank/ folder already present' });
    }
    if (tool === 'claude') {
        const settings = readJsonSafe(path.join(root, '.claude', 'settings.json'));
        if (settings && settings.hooks && Object.keys(settings.hooks).length) {
            out.push({ name: 'hooks-enforcement', evidence: '.claude/settings.json already has hooks configured' });
        }
    }
    return out;
}
const README_CATALOG_ROW_RE = /^\|\s*\[([\w.-]+)\]\([^)]*\)\s*\|(.+)\|\s*$/;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
// Pulls the one-line "Purpose" column straight out of skills/README.md's per-category tables (the
// same text install-kit.md's Pick mode quotes in Claude Code's AskUserQuestion options), so the
// terminal fallback's own menus can show what a skill is for instead of a bare name. Markdown links
// inside a purpose cell (e.g. a companion doc reference) are flattened to their link text -- a
// relative .md path means nothing printed in a terminal. Returns {} if the README is missing; the
// catalog still works, menus just fall back to a bare name.
function loadSkillPurposes(libraryRoot) {
    const p = path.join(libraryRoot, 'skills', 'README.md');
    const out = {};
    if (!fs.existsSync(p))
        return out;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = README_CATALOG_ROW_RE.exec(line);
        if (!m)
            continue;
        out[m[1]] = m[2].trim().replace(MD_LINK_RE, '$1');
    }
    return out;
}
function truncate(s, max) {
    return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}
function randomContextCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // skip I/O -- easily confused with 1/0
    return `${letters[Math.floor(Math.random() * letters.length)]}${Math.floor(Math.random() * 10)}`;
}
// A folder nobody actually means when they leave --root out: the filesystem root or the user's
// own home directory. Installing `.claude/skills/` straight into either would be a real mistake,
// so this is the one case the assume-first guess below refuses to make silently.
function isUnsafeAssumeTarget(dir) {
    const resolved = path.resolve(dir);
    if (resolved === path.parse(resolved).root)
        return true;
    try {
        if (resolved === path.resolve(require('node:os').homedir()))
            return true;
    }
    catch { /* no homedir -- not unsafe on that account */ }
    return false;
}
// The common pattern is cloning the kit directly inside the project you want it in (open a
// terminal in your project, `git clone` the kit right there) -- cwd is then the kit's own clone
// folder, one level below the real target. Assume that's what happened and use the parent folder
// with no question asked (printing what was assumed, so it's never silent); only fall back to
// asking when there's no such folder to assume (running from somewhere unrelated to the clone) or
// assuming would land on the filesystem root or the home directory.
async function resolveRoot() {
    const cwd = path.resolve(process.cwd());
    const libraryGuess = path.resolve(defaultLibraryGuess());
    if (cwd === libraryGuess) {
        const parent = path.dirname(cwd);
        if (!isUnsafeAssumeTarget(parent)) {
            console.log(`Target project: ${parent}  (this kit is cloned inside that folder, so that's assumed to be your project -- pass --root to use a different one)`);
            return parent;
        }
    }
    return askText('Target project path', cwd);
}
// One shared readline interface for the whole run, opened on first use and closed once
// fillInteractive is done with it -- never left open, or the process would hang on exit.
let rl = null;
function closeRl() { if (rl) {
    rl.close();
    rl = null;
} }
function ask(question) {
    if (!rl)
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, resolve));
}
async function askText(message, initial) {
    const ans = (await ask(`${message} [${initial}]: `)).trim();
    return ans || initial;
}
async function askYesNo(message, initialYes) {
    const ans = (await ask(`${message} (${initialYes ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
    if (!ans)
        return initialYes;
    return ans.startsWith('y');
}
// A plain numbered menu -- "1) claude  2) opencode" -- typed instead of arrow-keyed, so it behaves
// the same in every terminal (PowerShell, cmd.exe, any SSH session) with no raw-mode surprises.
async function askSelect(message, choices, initialIndex) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
    for (;;) {
        const ans = (await ask(`Type a number [${initialIndex + 1}]: `)).trim();
        if (!ans)
            return choices[initialIndex].value;
        const n = Number(ans);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length)
            return choices[n - 1].value;
        console.log(`Please type a number from 1 to ${choices.length}, or press Enter for ${initialIndex + 1}.`);
    }
}
async function askMultiselect(message, choices) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
    console.log('Type the numbers you want, separated by commas (example: 1,3,4), or "all". Press Enter for none.');
    for (;;) {
        const ans = (await ask('Your choice: ')).trim();
        if (!ans)
            return [];
        if (ans.toLowerCase() === 'all')
            return choices.map((c) => c.value);
        const nums = ans.split(',').map((s) => Number(s.trim()));
        if (nums.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length))
            return nums.map((n) => choices[n - 1].value);
        console.log(`Please type numbers from 1 to ${choices.length}, separated by commas, or "all".`);
    }
}
function skillChoices(catalog, purposes, exclude = new Set()) {
    return Object.entries(catalog)
        .filter(([name]) => !exclude.has(name))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, entry]) => {
        const base = entry.dir ? `${name}  (${entry.dir})` : name;
        const purpose = purposes[name];
        return { title: purpose ? `${base} — ${truncate(purpose, 80)}` : base, value: name };
    });
}
// Fills in only the flags actually missing, on a real terminal -- never overrides a flag the
// caller already passed, and never fires for a --json or non-TTY (scripted/agent) call. See the
// "Interactive mode" note at the top of the file.
async function fillInteractive(cmd, args) {
    if (args.json || !isInteractive())
        return;
    try {
        if (['list', 'install', 'update', 'merge-hooks'].includes(cmd) && !args.library) {
            args.library = await askText('Path to the ai-dev-kit library', defaultLibraryGuess());
        }
        if (['install', 'update', 'uninstall', 'archive', 'unarchive', 'merge-hooks'].includes(cmd) && !args.root) {
            args.root = await resolveRoot();
        }
        if (cmd === 'install') {
            if (!args.tool) {
                const evidence = detectToolEvidence(args.root);
                const tools = Object.keys(ROOTS);
                const choices = tools.map((t) => ({ title: evidence[t] ? `${t} — ${evidence[t]}` : t, value: t }));
                const detectedIndex = tools.findIndex((t) => evidence[t]);
                args.tool = await askSelect('Target tool:', choices, detectedIndex >= 0 ? detectedIndex : 0);
            }
            if (!args.skills.length) {
                const catalog = listSkills(args.library);
                const purposes = loadSkillPurposes(args.library);
                const standard = Array.from(new Set([...UNIVERSAL_SKILLS, ...ARCHIVABLE_SKILLS])).filter((n) => catalog[n]);
                const detected = detectStackSignals(args.root, args.tool).filter((d) => catalog[d.name]);
                const autoTitle = detected.length
                    ? `Auto-detect (recommended) -- ${standard.length} standard skills + ${detected.length} matched to this project`
                    : `Auto-detect (recommended) -- ${standard.length} standard skills, no framework match found here`;
                const mode = await askSelect('Skills to install:', [
                    { title: autoTitle, value: 'auto' },
                    { title: 'Everything -- every skill in the library (addons/MCP/mods stay opt-in, asked separately)', value: 'everything' },
                    { title: 'Pick individually from the full catalog', value: 'pick' },
                ], 0);
                if (mode === 'everything') {
                    args.skills = eligibleCatalogNames(catalog);
                }
                else if (mode === 'pick') {
                    args.skills = await askMultiselect('Skills to install:', skillChoices(catalog, purposes));
                }
                else {
                    let extra = detected.map((d) => d.name);
                    if (detected.length) {
                        console.log('Matched to this project:');
                        for (const d of detected) {
                            const purpose = purposes[d.name];
                            console.log(purpose ? `  ${d.name} -- ${purpose}  (${d.evidence})` : `  ${d.name} -- ${d.evidence}`);
                        }
                    }
                    else {
                        const presetEntries = Object.entries(exports.STACK_PRESETS);
                        const presetChoice = await askSelect('No framework signal detected -- pick a stack preset instead?', [
                            ...presetEntries.map(([key, p]) => ({ title: p.label, value: key })),
                            { title: 'None -- just the standard set', value: 'none' },
                        ], presetEntries.length);
                        const preset = exports.STACK_PRESETS[presetChoice];
                        if (preset) {
                            extra = preset.skills.filter((n) => catalog[n]);
                            if (preset.gap)
                                console.log(`Note: ${preset.gap}`);
                        }
                    }
                    args.skills = Array.from(new Set([...standard, ...extra]));
                    if (await askYesNo('Add any other skills on top of this set?', false)) {
                        const picked = await askMultiselect('Additional skills to install:', skillChoices(catalog, purposes, new Set(args.skills)));
                        args.skills = Array.from(new Set([...args.skills, ...picked]));
                    }
                }
            }
            if (args.standards === undefined) {
                args.standards = await askYesNo('Install the coding-standards system too?', false);
            }
            if (args.skills.some((s) => parseSkillToken(s).name === 'comment-style') && !args.commentStyleLevel) {
                args.commentStyleLevel = await askSelect('Comment style:', [
                    { title: 'none — no comments except rule-mandated ones (recommended)', value: 'none' },
                    { title: 'terse — one short line, only when the why is non-obvious', value: 'terse' },
                    { title: 'descriptive — up to 3 short plain-language lines for tricky parts', value: 'descriptive' },
                ], 0);
            }
            if (args.standards && !args.contextCode) {
                const suggestion = randomContextCode();
                args.contextCode = await askText(`Context code (2-4 chars, or "none")`, suggestion);
            }
        }
        if (['update', 'uninstall', 'archive', 'unarchive'].includes(cmd) && !args.all && !args.skills.length) {
            const manifest = readManifest(args.root);
            const pool = cmd === 'unarchive' ? manifest.archived : manifest.skills;
            const names = Object.keys(pool);
            if (!names.length) {
                args.all = true;
            }
            else {
                const scope = await askSelect(`Apply ${cmd} to:`, [
                    { title: 'All tracked skills', value: 'all' },
                    { title: 'Choose specific skills', value: 'pick' },
                ], 0);
                if (scope === 'all')
                    args.all = true;
                else
                    args.skills = await askMultiselect(`Which skills to ${cmd}?`, names.map((n) => ({ title: n, value: n })));
            }
        }
    }
    finally {
        closeRl();
    }
}
function parseArgs(argv) {
    const a = { skills: [] };
    for (let i = 1; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--library')
            a.library = argv[++i];
        else if (k === '--root')
            a.root = argv[++i];
        else if (k === '--tool')
            a.tool = argv[++i];
        else if (k === '--skills')
            a.skills = argv[++i].split(',').filter(Boolean);
        else if (k === '--all')
            a.all = true;
        else if (k === '--standards')
            a.standards = true;
        else if (k === '--remove-standards')
            a.removeStandards = true;
        else if (k === '--comment-style-level')
            a.commentStyleLevel = argv[++i];
        else if (k === '--context-code')
            a.contextCode = argv[++i];
        else if (k === '--apply-migrations') {
            const v = argv[++i];
            a.applyMigrations = v === 'all' ? 'all' : v.split(',').filter(Boolean);
        }
        else if (k === '--force')
            a.force = true;
        else if (k === '--json')
            a.json = true;
    }
    return a;
}
async function main() {
    const cmd = process.argv[2];
    const args = parseArgs(process.argv);
    let res;
    try {
        await fillInteractive(cmd, args);
        if (cmd === 'list')
            res = listSkills(args.library);
        else if (cmd === 'install')
            res = doInstall(args);
        else if (cmd === 'update')
            res = doUpdate(args);
        else if (cmd === 'archive')
            res = doArchive(args);
        else if (cmd === 'unarchive')
            res = doUnarchive(args);
        else if (cmd === 'uninstall')
            res = doUninstall(args);
        else if (cmd === 'merge-hooks')
            res = doMergeHooks(args);
        else {
            console.error('usage: install-kit.cli.js <list|install|update|uninstall|archive|unarchive|merge-hooks> [options]');
            process.exit(2);
            return;
        }
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exit(1);
        return;
    }
    console.log(JSON.stringify(res, null, 2));
}
if (require.main === module)
    void main();
