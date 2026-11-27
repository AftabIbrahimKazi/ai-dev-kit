#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__testApi = exports.AI_BACKENDS = exports.STANDARD_ROW_LABELS = exports.STACK_PRESETS = exports.ARCHIVABLE_SKILLS = exports.doUnarchive = exports.doArchive = exports.writeManifest = exports.readManifest = void 0;
exports.listCommands = listCommands;
exports.syncCommands = syncCommands;
exports.pruneCommands = pruneCommands;
exports.listSkills = listSkills;
exports.extractCoreHooks = extractCoreHooks;
exports.mergeHooks = mergeHooks;
exports.doMergeHooks = doMergeHooks;
exports.hasKitHooks = hasKitHooks;
exports.removeKitHooks = removeKitHooks;
exports.variantCtxFor = variantCtxFor;
exports.installOneSkill = installOneSkill;
exports.stripTemplatePreamble = stripTemplatePreamble;
exports.applyContextCode = applyContextCode;
exports.pruneSkillTriggers = pruneSkillTriggers;
exports.removeParallelSessionSection = removeParallelSessionSection;
exports.applyActiveStandards = applyActiveStandards;
exports.installStandards = installStandards;
exports.findExistingProtocols = findExistingProtocols;
exports.parseE2eDriver = parseE2eDriver;
exports.writeE2eDrivers = writeE2eDrivers;
exports.syncExternals = syncExternals;
exports.batchMod = batchMod;
exports.parseAiFlag = parseAiFlag;
exports.writeAiBackends = writeAiBackends;
exports.claudeBin = claudeBin;
exports.excludeKitFromGit = excludeKitFromGit;
exports.ensureUsageMod = ensureUsageMod;
exports.ensureMod = ensureMod;
exports.skillPairedMod = skillPairedMod;
exports.webDigestMod = webDigestMod;
exports.webSearchMod = webSearchMod;
exports.setWebSearchSift = setWebSearchSift;
exports.setUsageTracking = setUsageTracking;
exports.doInstall = doInstall;
exports.parseChangelog = parseChangelog;
exports.whatsNew = whatsNew;
exports.doUpdate = doUpdate;
exports.parseRenameLedger = parseRenameLedger;
exports.applyRenameMigrations = applyRenameMigrations;
exports.doUninstall = doUninstall;
exports.eligibleCatalogNames = eligibleCatalogNames;
exports.detectStackSignals = detectStackSignals;
exports.loadSkillPurposes = loadSkillPurposes;
exports.topCategory = topCategory;
exports.orderedCategories = orderedCategories;
exports.setMenuIO = setMenuIO;
// Mechanical half of install-kit: install/update/uninstall/archive/unarchive skills by moving files,
// deterministically. Claude still decides WHAT to install (mode, stack, addon opt-ins, context-code
// value, comment-style level, which skills a session doesn't need) -- this script only executes that
// decision reliably, instead of Claude hand-copying or hand-moving each file across a long narrated
// session. See skills/meta/install-kit.md (install/update/uninstall) and the `handover` skill (archive).
//
//   node install-kit.cli.js list      --library <path> [--json]
//   node install-kit.cli.js install   --library <path> --root <target> --tool claude|opencode|codex [--no-commands] [--keep-active]
//                                      --skills a,b,c[:companion+companion] [--standards]
//                                      [--script-standard js|ts|js-and-ts] [--active-standards a,b|all|none]
//                                      [--comment-style-level none|terse|descriptive] [--context-code X7|none]
//                                      [--force] [--json]
//   node install-kit.cli.js update    --library <path> --root <target> [--skills a,b | --all] [--no-commands]
//                                      [--context-code X7|none] [--apply-migrations a,b|all] [--json]
//   node install-kit.cli.js uninstall [--library <path>] --root <target> [--skills a,b | --all] [--remove-standards] [--remove-hooks] [--json]
//   node install-kit.cli.js archive   --root <target> [--skills a,b | --all] [--json]
//   node install-kit.cli.js unarchive --root <target> [--skills a,b | --all] [--json]
//   node install-kit.cli.js merge-hooks --library <path> --root <target> [--json]
//   node install-kit.cli.js company <sync|remove|status> --root <target> [--library <path>] [--company-from <folder>]
//                                      [--company-defaults keep|drop|auto] [--force] [--dry-run] [--purge]   (install also takes the company flags)
//   node install-kit.cli.js signature <set <alias>|remove|show> --root <target> [--dry-run]   (install takes --signature <alias|none>)
//   install also takes --usage on|off and --usage-notify on|off: the feature-usage switch (which skills, commands and scripts get used, kept by a script)
//   node install-kit.cli.js mods --root <target> [--library <kit>] [--batch on|off]   (install also takes --batch)
//     the batch mod (one read-only tool, mcp__batch__run): reports whether it is enabled (user or project settings), offers the install,
//     warns when it is enabled without the session-budget skill; --batch on|off runs claude plugin install|uninstall batch@ai-dev-kit-mods --scope project
//
// Testing the prompts: AI_DEV_KIT_INTERACTIVE=1 forces them on piped input (one answer per line; a closed input means Enter).
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
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const childProcess = require("node:child_process");
const verifyModule = require("./install-kit.verify");
const select = require("./install-kit.select");
const company = require("./install-kit.company");
const sig = require("./install-kit.signature");
const variants = require("./install-kit.variants");
const ext = require("./install-kit.external");
const skill_scope_move_1 = require("./skill-scope.move");
Object.defineProperty(exports, "readManifest", { enumerable: true, get: function () { return skill_scope_move_1.readManifest; } });
Object.defineProperty(exports, "writeManifest", { enumerable: true, get: function () { return skill_scope_move_1.writeManifest; } });
Object.defineProperty(exports, "doArchive", { enumerable: true, get: function () { return skill_scope_move_1.doArchive; } });
Object.defineProperty(exports, "doUnarchive", { enumerable: true, get: function () { return skill_scope_move_1.doUnarchive; } });
const { verify, ROOTS } = verifyModule;
const EXCLUDE_DIRS = new Set(['commands']);
const EXCLUDE_NAMES = new Set(['README.md']);
// UNIVERSAL_SKILLS mirrors skill-scope.md's classification -- keep both in sync by hand. The archivable
// list below is derived from skill-scope.triggers.json. Used only by the terminal interactive fallback (fillInteractive)
// to build an Auto-detect default without dumping the full catalog as one typed multiselect.
const UNIVERSAL_SKILLS = [
    'skill-scope', 'handover', 'coding-standards', 'comment-style', 'session-budget',
    'agent-usage', 'mode-kernel', 'pre-merge-gate', 'pre-commit', 'debug-protocol',
    'intent-capture', 'plan-first', 'interpretation-checkpoint',
];
// Read from skill-scope.triggers.json (the single source) so a new archivable skill needs no edit here.
exports.ARCHIVABLE_SKILLS = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'skill-scope.triggers.json'), 'utf8')).skills);
// ---- Slash commands: copied from skills/commands/*.md, tracked in the manifest, refreshed by update, removed by uninstall.
// A command needs one skill. It is read from the template: `auto.js run <skill>` first (an archivable skill's command),
// else the first `{{skill-root}}/<skill>/` path. Templates with no script name theirs here.
const COMMAND_NEEDS_FALLBACK = { eta: 'plan-first', kit: null, format: null, pickup: 'handover' };
function listCommands(libraryRoot) {
    const dir = path.join(libraryRoot, 'skills', 'commands');
    if (!fs.existsSync(dir))
        return [];
    return fs.readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => {
        const body = fs.readFileSync(path.join(dir, n), 'utf8');
        const name = n.slice(0, -3);
        const run = /(?:auto\.js|"\$A") run ([a-z0-9-]+)/.exec(body);
        const path1 = /\{\{skill-root\}\}\/([a-z0-9-]+)\//.exec(body);
        const needs = run ? run[1] : path1 ? path1[1] : (name in COMMAND_NEEDS_FALLBACK ? COMMAND_NEEDS_FALLBACK[name] : undefined);
        if (needs === undefined)
            throw new Error(`command "${name}" names no skill and has no entry in COMMAND_NEEDS_FALLBACK`);
        return { name, needs, body };
    });
}
function commandsDirOf(manifest) {
    if (manifest.tool === 'codex' || !manifest.skillRoot)
        return null; // Codex has no command folder
    return path.join(path.dirname(manifest.skillRoot), 'commands');
}
// A `!` line runs in the shell's current folder, so a relative skill path breaks after a `cd` into a subfolder.
// The git root is no anchor: a project nested inside a larger repo has its install below that root, not at it.
// So node walks up from the current folder to the nearest one holding the installed file, falling back to the relative path.
// `node <script> args` becomes ONE node process: `node -e "<walker>" -- args`. The older form nested a `$(node -p ...)` substitution inside the
// command, which PowerShell reads differently (the first argument was taken as a module path and the command crashed). The walker holds no `$`,
// backtick or double quote, so bash and PowerShell pass it through unchanged; `--` keeps flags like --write away from node itself.
function nodeLauncher(rel) {
    const js = `let d=process.cwd(),f='${rel}',p;for(;;){p=d+'/'+f;if(require('fs').existsSync(p))break;let u=require('path').dirname(d);if(u===d){p=f;break}d=u}process.exit(require('child_process').spawnSync(process.execPath,[p,...process.argv.slice(1)],{stdio:'inherit'}).status)`;
    return `node -e "${js}" --`;
}
function anchored(rel) {
    const js = `let d=process.cwd();const f='${rel}';for(;;){if(require('fs').existsSync(d+'/'+f))break;const p=require('path').dirname(d);if(p===d){d='.';break}d=p}d+'/'+f`;
    return `"$(node -p "${js}")"`;
}
function renderCommand(body, manifest) {
    const root = manifest.skillRoot.split(path.sep).join('/');
    return body.replace(/\bnode \{\{skill-root\}\}(\/[^\s`]*)/g, (_m, rest) => nodeLauncher(root + rest))
        .replace(/\{\{skill-root\}\}(\/[^\s`]*)/g, (_m, rest) => anchored(root + rest))
        .replace(/\{\{skill-root\}\}/g, root);
}
const sha = (text) => crypto.createHash('sha1').update(text).digest('hex');
// A command written by its own skill's setup script (narrate's setup.js copies /narration) is left to that script.
// Every other command, add-on ones included (/diagram, /teardown, /persona, /ctx), is installed here once its skill is.
const SELF_INSTALLED_COMMANDS = new Set(['narration']);
function eligibleCommand(c, manifest, catalog) {
    if (c.needs === null)
        return true;
    if (SELF_INSTALLED_COMMANDS.has(c.name))
        return false;
    if (!manifest.skills[c.needs] && !manifest.archived[c.needs])
        return false;
    return !!catalog[c.needs];
}
function syncCommands(root, manifest, library, opts) {
    const result = { added: [], updated: [], removed: [], kept: [] };
    const dirRel = commandsDirOf(manifest);
    if (!dirRel)
        return result;
    manifest.commands = manifest.commands || {};
    const catalog = listSkills(library);
    const libraryCommands = listCommands(library);
    // A command the kit no longer ships: remove the unedited copy it wrote; an edited one stays, untracked.
    if (libraryCommands.length) {
        const shipped = new Set(libraryCommands.map((c) => c.name));
        for (const [name, rec] of Object.entries(manifest.commands)) {
            if (shipped.has(name))
                continue;
            const gone = path.join(root, rec.file);
            if (!fs.existsSync(gone)) { /* already removed by hand */ }
            else if (sha(fs.readFileSync(gone, 'utf8')) === rec.sha) {
                fs.rmSync(gone);
                result.removed.push(rec.file);
            }
            else
                result.kept.push(`/${name}: no longer shipped by the kit, edited since it was written, left alone`);
            delete manifest.commands[name];
        }
    }
    for (const c of libraryCommands) {
        if (!eligibleCommand(c, manifest, catalog))
            continue;
        const rel = path.join(dirRel, c.name + '.md');
        const abs = path.join(root, rel);
        const text = renderCommand(c.body, manifest);
        const tracked = manifest.commands[c.name];
        const exists = fs.existsSync(abs);
        if (!exists) {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, text);
            manifest.commands[c.name] = { file: rel.split(path.sep).join('/'), sha: sha(text) };
            result.added.push(c.name);
        }
        else if (tracked) {
            const current = fs.readFileSync(abs, 'utf8');
            if (sha(current) === tracked.sha) {
                if (current !== text) {
                    fs.writeFileSync(abs, text);
                    manifest.commands[c.name].sha = sha(text);
                    result.updated.push(c.name);
                }
            }
            else if (opts.force) {
                fs.writeFileSync(abs, text);
                manifest.commands[c.name].sha = sha(text);
                result.updated.push(c.name);
            }
            else {
                result.kept.push(`/${c.name}: edited since the kit wrote it, left alone (pass --force to overwrite)`);
            }
        }
        else if (opts.force) {
            fs.writeFileSync(abs, text);
            manifest.commands[c.name] = { file: rel.split(path.sep).join('/'), sha: sha(text) };
            result.updated.push(c.name);
        }
        else {
            result.kept.push(`/${c.name}: a file of that name already exists and the kit did not write it, left alone`);
        }
    }
    return result;
}
// Removes tracked commands that are unedited and whose skill is gone (or all of them with all=true).
function pruneCommands(root, manifest, all, library) {
    const removed = [], kept = [];
    if (!manifest.commands)
        return { removed, kept };
    const needs = new Map();
    if (library) {
        try {
            for (const c of listCommands(library))
                needs.set(c.name, c.needs);
        }
        catch { /* fall through: treated as unknown */ }
    }
    for (const [name, rec] of Object.entries(manifest.commands)) {
        const need = needs.get(name);
        const skillGone = need !== undefined && need !== null && !manifest.skills[need] && !manifest.archived[need];
        if (!all && !skillGone)
            continue;
        const abs = path.join(root, rec.file);
        if (!fs.existsSync(abs)) {
            delete manifest.commands[name];
            continue;
        }
        if (sha(fs.readFileSync(abs, 'utf8')) === rec.sha) {
            fs.rmSync(abs);
            removed.push(rec.file);
        }
        else
            kept.push(`${rec.file}: edited since the kit wrote it, left alone`);
        delete manifest.commands[name];
    }
    const dir = commandsDirOf(manifest);
    if (dir && fs.existsSync(path.join(root, dir)) && fs.readdirSync(path.join(root, dir)).length === 0)
        fs.rmdirSync(path.join(root, dir));
    return { removed, kept };
}
// Archived skills live under <tool-dir>/skills-archive/; install, update and uninstall must reach them there.
function archiveRootOf(root, manifest) {
    return path.join(root, path.dirname(manifest.skillRoot), 'skills-archive');
}
// Categories skill-scope.md says are "never part of Everything/Pick/Auto-detect by default" --
// excluded from both the Auto-detect default and the Everything preset; still reachable through
// "Pick individually".
const OPT_IN_DIR_PREFIXES = ['addons', 'mcp', 'cloud'];
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
// Companions that always install with their skill, even when a companion filter names only some (mcp-manager:stitch).
const CORE_COMPANIONS = { 'mcp-manager': ['config', 'backends'] };
function companionStem(targetName) {
    // "install-hook.js" -> "install-hook"; "roles.example.json" -> "roles.example"
    const dot = targetName.lastIndexOf('.');
    return dot === -1 ? targetName : targetName.slice(0, dot);
}
const ACTIVE_LEVEL_RE = /\*\*Active level:\s*([a-z]*)\*\*/;
const CONTEXT_CODE_ROW_RE = /(\|\s*Context code\s*\|\s*)(.*?)(\s*\|)/;
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
// Hooks an older kit installed and this one deliberately dropped. They are removed on merge so a project is not left running them.
// Skill archiving is user-triggered only now (/next, /archive, /unarchive), so the session-start and per-prompt skill-scope hooks go.
const RETIRED_HOOK_RE = /skill-scope\/auto\.js apply\b/;
// Merges one or more { hooks: { <Event>: [entry, ...] } } configs into <root>/.claude/settings.json,
// adding only entries not already present (by deep equality) and never touching anything else in the file.
function mergeHooks(root, configs) {
    const p = path.join(root, '.claude', 'settings.json');
    let settings = {};
    if (fs.existsSync(p))
        settings = JSON.parse(fs.readFileSync(p, 'utf8'));
    settings.hooks = settings.hooks || {};
    const added = [];
    const retired = [];
    for (const [event, entries] of Object.entries(settings.hooks)) {
        const keep = entries.filter((e) => !(e.hooks || []).some((h) => RETIRED_HOOK_RE.test(h.command || '')));
        if (keep.length !== entries.length) {
            retired.push(event);
            settings.hooks[event] = keep;
            if (!keep.length)
                delete settings.hooks[event];
        }
    }
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
    return { added, retired, path: path.join('.claude', 'settings.json') };
}
function doMergeHooks(args) {
    const configs = extractCoreHooks(args.library);
    return mergeHooks(args.root, configs);
}
function coreEntries(configs) {
    return configs.flatMap((c) => Object.entries(c.hooks || {}).flatMap(([event, entries]) => entries.map((e) => ({ event, json: JSON.stringify(e) }))));
}
function readSettings(root) {
    const p = path.join(root, '.claude', 'settings.json');
    if (!fs.existsSync(p))
        return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
// True when settings.json already holds at least one entry identical to a kit core hook: the project opted in earlier.
function hasKitHooks(root, configs) {
    const settings = readSettings(root);
    if (!settings || !settings.hooks)
        return false;
    const core = coreEntries(configs);
    return Object.entries(settings.hooks).some(([event, entries]) => entries.some((e) => core.some((c) => c.event === event && c.json === JSON.stringify(e))));
}
// Removes only entries identical to a kit core hook; every other hook and setting stays.
function removeKitHooks(root, configs) {
    const p = path.join(root, '.claude', 'settings.json');
    const settings = readSettings(root);
    if (!settings || !settings.hooks)
        return 0;
    const core = coreEntries(configs);
    let removed = 0;
    for (const event of Object.keys(settings.hooks)) {
        const kept = settings.hooks[event].filter((e) => {
            const hit = core.some((c) => c.event === event && c.json === JSON.stringify(e));
            if (hit)
                removed++;
            return !hit;
        });
        if (kept.length)
            settings.hooks[event] = kept;
        else
            delete settings.hooks[event];
    }
    if (!Object.keys(settings.hooks).length)
        delete settings.hooks;
    if (removed)
        fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
    return removed;
}
function coreHooksOrNull(library) {
    try {
        return extractCoreHooks(library || defaultLibraryGuess());
    }
    catch {
        return null;
    }
}
// Keeps the part of a variant block that matches this install (see install-kit.variants.ts). A malformed block leaves the text
// as it is: extra text in a skill is better than missing text.
function applyVariants(text, ctx) {
    if (!ctx || !variants.hasVariants(text))
        return text;
    try {
        return variants.renderVariants(text, ctx);
    }
    catch {
        return text;
    }
}
// What a render sees: this install's tool and OS, and the backend lists the project allows. The new --ai answers win over the file
// only where writeAiBackends would write them (a key already in the file is kept unless --force), so install and update agree.
function variantCtxFor(root, tool, ai, force) {
    let cur = {};
    try {
        cur = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'ai-backends.json'), 'utf8'));
    }
    catch { /* none yet */ }
    const eff = { ...cur };
    for (const [f, list] of Object.entries(ai || {}))
        if (!(f in cur) || force)
            eff[f] = list;
    return variants.buildVariantCtx(tool, eff);
}
// Copies one companion file or folder, rendering variant blocks in the .md files. Returns whether anything changed on disk.
function syncCompanion(src, dest, ctx) {
    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        let changed = false;
        for (const name of fs.readdirSync(src))
            if (syncCompanion(path.join(src, name), path.join(dest, name), ctx))
                changed = true;
        return changed;
    }
    if (ctx && /\.md$/i.test(src)) {
        const text = applyVariants(fs.readFileSync(src, 'utf8'), ctx);
        if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === text)
            return false;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, text);
        return true;
    }
    if (!filesDiffer(src, dest))
        return false;
    copyRecursive(src, dest);
    return true;
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
    let newBody = applyVariants(fs.readFileSync(srcSkillFile, 'utf8'), opts.variantCtx);
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
    const core = CORE_COMPANIONS[name] ?? [];
    const companions = only ? entry.companions.filter((c) => only.has(companionStem(c.target)) || core.includes(companionStem(c.target))) : entry.companions;
    for (const c of companions) {
        const src = path.join(libraryRoot, 'skills', entry.dir, c.src);
        const dest = path.join(destDir, c.target);
        if (syncCompanion(src, dest, opts.variantCtx))
            changed = true;
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
// The Active Standards table's row label -> the key used to select/deselect it. "Script standard"
// (resolved separately, below -- it names a file, not a yes/no) and "Framework"/"CSS Framework"
// (left untouched -- no reliable auto-detected value to fill in from the terminal flow) are
// deliberately absent, so pruning never touches those three rows.
exports.STANDARD_ROW_LABELS = {
    css: 'CSS standard',
    html: 'HTML standard',
    git: 'Git standard',
    versioning: 'Versioning standard',
    seo: 'SEO standard',
    performance: 'Performance standard',
    accessibility: 'Accessibility standard',
    qa: 'QA standard',
    ai: 'AI standard',
    design: 'Design standard',
    ui: 'UI standard',
};
const ACTIVE_STANDARDS_SECTION_RE = /## Active Standards[\s\S]*?(?=\n## |\s*$)/;
const SCRIPT_STANDARD_ROW_RE = /(\|\s*Script standard\s*\|\s*`coding-standards\/)\[js-standards OR ts-standards OR js-and-ts-standards\](\.md`\s*\|)/;
// Resolves the Script-standard placeholder to the one file that actually applies (RULE from
// index.md: "a project uses exactly one script standard"), and -- per coding-standards/README.md's
// own setup instructions ("Update the Active Standards table... Remove rows for standards that do
// not apply") -- drops the rows for standards the project doesn't use, instead of leaving every
// one of the ten present for the user to prune by hand later.
function applyActiveStandards(body, opts) {
    let out = body;
    if (opts.scriptStandard) {
        out = out.replace(SCRIPT_STANDARD_ROW_RE, `$1${opts.scriptStandard}-standards$2`);
    }
    if (opts.active) {
        const m = ACTIVE_STANDARDS_SECTION_RE.exec(out);
        if (m) {
            const kept = m[0].split('\n').filter((line) => {
                const row = /^\|\s*([^|]+?)\s*\|/.exec(line);
                if (!row)
                    return true;
                const label = row[1].trim();
                const key = Object.keys(exports.STANDARD_ROW_LABELS).find((k) => exports.STANDARD_ROW_LABELS[k] === label);
                return !key || opts.active.has(key);
            });
            out = out.slice(0, m.index) + kept.join('\n') + out.slice(m.index + m[0].length);
        }
    }
    return out;
}
function installStandards(libraryRoot, root, protocolFile, opts) {
    const result = { copied: [], protocolCreated: false, refused: false };
    const srcDir = path.join(libraryRoot, 'coding-standards');
    const destDir = path.join(root, 'coding-standards');
    if (fs.existsSync(destDir) && !opts.force) {
        for (const f of (0, skill_scope_move_1.walkFiles)(srcDir)) {
            const rel = path.relative(srcDir, f);
            if (rel === 'CLAUDE.example.md' || company.isOmitted(rel, opts.omit))
                continue;
            const dest = path.join(destDir, rel);
            if (filesDiffer(f, dest)) {
                copyRecursive(f, dest);
                result.copied.push(rel);
            }
        }
    }
    else {
        for (const f of (0, skill_scope_move_1.walkFiles)(srcDir)) {
            const rel = path.relative(srcDir, f);
            if (rel === 'CLAUDE.example.md' || company.isOmitted(rel, opts.omit))
                continue;
            copyRecursive(f, path.join(destDir, rel));
            result.copied.push(rel);
        }
    }
    const buildBody = () => {
        let body = stripTemplatePreamble(fs.readFileSync(path.join(srcDir, 'CLAUDE.example.md'), 'utf8'));
        if (opts.contextCode)
            body = applyContextCode(body, opts.contextCode);
        if (opts.installedNames) {
            body = pruneSkillTriggers(body, opts.installedNames);
            body = removeParallelSessionSection(body, opts.installedNames.has('role-session'));
        }
        if (opts.activeStandards)
            body = applyActiveStandards(body, opts.activeStandards);
        return body;
    };
    // Only the tool's OWN file is replaced or appended to: with tool claude an AGENTS.md (written for other tools) is never touched, a CLAUDE.md is
    // created beside it instead. The context code is still refreshed in every protocol file that carries the kit's markers.
    const all = findExistingProtocols(root, protocolFile);
    const existing = all.filter((p) => path.basename(p).toLowerCase() === protocolFile.toLowerCase());
    let protocolAbs = path.join(root, protocolFile);
    if (!existing.length) {
        fs.writeFileSync(protocolAbs, buildBody());
        result.protocolCreated = true;
    }
    else {
        protocolAbs = existing[0];
        const mode = opts.existing || 'keep';
        if (mode === 'replace') {
            fs.copyFileSync(protocolAbs, protocolAbs + '.bak');
            fs.writeFileSync(protocolAbs, buildBody());
            result.protocolCreated = true;
            result.replaced = path.basename(protocolAbs);
        }
        else if (mode === 'append') {
            const old = fs.readFileSync(protocolAbs, 'utf8');
            if (!old.includes(APPEND_MARKER)) {
                fs.writeFileSync(protocolAbs, old.replace(/\n*$/, '\n\n') + APPEND_MARKER + '\n\n' + buildBody());
                result.appended = path.basename(protocolAbs);
            }
        }
        else if (opts.contextCode) {
            const old = fs.readFileSync(protocolAbs, 'utf8');
            const next = ensureContextCode(old, opts.contextCode);
            if (next !== old)
                fs.writeFileSync(protocolAbs, next);
            else if (opts.contextCode !== 'none' && !new RegExp('\\|\\s*Context code\\s*\\|\\s*' + escapeRe(opts.contextCode) + '\\s*\\|').test(old)) {
                result.contextCodeFailed = path.basename(protocolAbs);
            }
        }
    }
    if (opts.contextCode) {
        for (const p of all) {
            if (p === protocolAbs)
                continue;
            const old = fs.readFileSync(p, 'utf8');
            if (!/ai-dev-kit:cx:start|\|\s*Context code\s*\|/.test(old))
                continue;
            const next = ensureContextCode(old, opts.contextCode);
            if (next !== old)
                fs.writeFileSync(p, next);
        }
    }
    if (opts.agentReady)
        applyAgentReady(root, protocolAbs);
    result.protocolFile = path.basename(protocolAbs);
    if (isGitIgnored(root, result.protocolFile))
        result.ignoredProtocol = result.protocolFile;
    return result;
}
// A protocol file the project's .gitignore hides (a blanket `*.md` rule) is installed but never reaches teammates or CI; say so.
function isGitIgnored(root, rel) {
    try {
        return childProcess.spawnSync('git', ['check-ignore', '-q', '--', rel], { cwd: root, timeout: 15000 }).status === 0;
    }
    catch {
        return false;
    }
}
const APPEND_MARKER = '<!-- ai-dev-kit: coding-standards protocol appended below -->';
function escapeRe(s) {
    return s.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}
// Every CLAUDE.md / AGENTS.md variant (any letter case) already in the project root, the tool's own file first.
function findExistingProtocols(root, protocolFile) {
    let names = [];
    try {
        names = fs.readdirSync(root);
    }
    catch { /* unreadable root */ }
    const hits = names.filter((n) => /^(claude|agents)(\.local)?\.md$/i.test(n) && fs.statSync(path.join(root, n)).isFile());
    // the tool's own file first, then the other shared file, then a private .local file last
    const own = (n) => (n.toLowerCase() === protocolFile.toLowerCase() ? 0 : /\.local\.md$/i.test(n) ? 2 : 1);
    hits.sort((a, b) => own(a) - own(b));
    return hits.map((n) => path.join(root, n));
}
// Sets the Context code in an existing protocol file; inserts the row when the file has none.
function ensureContextCode(body, contextCode) {
    if (contextCode === 'none' || CONTEXT_CODE_ROW_RE.test(body))
        return applyContextCode(body, contextCode);
    const row = `| Context code | ${contextCode} |`;
    const sec = /## Project-Specific Context[\s\S]*?(?=\n## |\n---\s*\n|\s*$)/.exec(body);
    const table = '| Property | Value |\n|---|---|\n' + row + '\n';
    if (sec) {
        const lines = sec[0].split('\n');
        let last = -1;
        lines.forEach((l, i) => { if (l.startsWith('|'))
            last = i; });
        if (last >= 0) {
            lines.splice(last + 1, 0, row);
            return body.slice(0, sec.index) + lines.join('\n') + body.slice(sec.index + sec[0].length);
        }
        return body.slice(0, sec.index) + sec[0].replace(/\s*$/, '') + '\n\n' + table + body.slice(sec.index + sec[0].length);
    }
    return body.replace(/\n*$/, '\n\n') + '## Project-Specific Context\n\n' + table;
}
const AGENT_READY_LINE = 'This project is agent-ready: apply UI-BTN-19 (`data-agent-confirm` on a confirming button for an irreversible action).';
function applyAgentReady(root, protocolAbs) {
    const body = fs.readFileSync(protocolAbs, 'utf8');
    if (!body.includes(AGENT_READY_LINE))
        fs.writeFileSync(protocolAbs, body.replace(/\n*$/, '\n\n') + AGENT_READY_LINE + '\n');
    const cfgPath = path.join(root, '.claude', 'code-audit.json');
    let cfg = {};
    try {
        cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
    catch { /* none yet */ }
    if (cfg.agentReady === true)
        return;
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, agentReady: true }, null, 2) + '\n');
}
const E2E_DRIVER_FILE = ['.claude', 'e2e-drivers.json'];
function parseE2eDriver(v) {
    const s = v.trim().toLowerCase();
    if (s === 'none' || s === 'off')
        return [];
    if (s === 'both')
        return ['obscura', 'chrome'];
    if (s === 'obscura' || s === 'chrome')
        return [s];
    throw new Error('--e2e-driver must be obscura, chrome, both or none');
}
function writeE2eDrivers(root, v, hasScaffold) {
    if (v === undefined)
        return undefined;
    const drivers = parseE2eDriver(v);
    const file = path.join(root, ...E2E_DRIVER_FILE);
    if (!hasScaffold)
        return { drivers, note: 'the e2e-scaffold skill is not installed here, so no driver choice was written; install it first' };
    if (!drivers.length) {
        fs.rmSync(file, { force: true });
        return { drivers, note: 'no driver chosen; any earlier choice was removed' };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ drivers }, null, 2) + '\n');
    return { file, drivers };
}
function syncExternals(want, refreshPresent, force) {
    const ids = new Set(want || []);
    if (refreshPresent) {
        try {
            for (const r of ext.loadRegistry())
                if (r.fetch !== 'skill' && ext.detect(r).stale)
                    ids.add(r.id);
        }
        catch { /* registry unreadable */ }
    }
    if (!ids.size)
        return undefined;
    const res = { ok: true, fetched: [], credits: [] };
    for (const id of ids) {
        const r = ext.findRef(id);
        if (!r) {
            res.fetched.push({ id, ok: false, error: 'unknown external tool (not in install-kit.external.json)', credit: '' });
            res.ok = false;
            continue;
        }
        const have = ext.detect(r);
        if (have.present && !have.stale && !force) {
            res.fetched.push({ id, ok: true, path: have.where, ref: have.fetchedRef || have.pinned, credit: ext.creditLine(r), already: true });
            continue;
        }
        const out = ext.fetchRef(r, force);
        res.fetched.push(out);
        if (out.ok)
            res.credits.push(out.credit);
        else
            res.ok = false;
    }
    return res;
}
const BATCH_ID = 'batch@ai-dev-kit-mods';
// A mod is enabled when settings.enabledPlugins names it: project scope in <root>/.claude, user scope in the Claude config folder.
function modScope(name, root) {
    const userDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const enabledIn = (file) => {
        try {
            return Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).enabledPlugins || {}).some(([k, v]) => k.startsWith(name + '@') && v !== false);
        }
        catch {
            return false;
        }
    };
    if (enabledIn(path.join(root, '.claude', 'settings.json')) || enabledIn(path.join(root, '.claude', 'settings.local.json')))
        return 'project';
    return enabledIn(path.join(userDir, 'settings.json')) ? 'user' : undefined;
}
function batchMod(root, library, paired, want) {
    const r = { enabled: false, paired };
    const market = library ? path.join(library, 'mods') : '<ai-dev-kit>/mods';
    if (want) {
        r.action = want === 'on' ? 'install' : 'uninstall';
        // AI_DEV_KIT_CLAUDE_BIN replaces the claude command (tests); a .js file is run with node. The arguments are constants.
        const out = spawnClaude(['plugin', r.action, BATCH_ID, '--scope', 'project'], root);
        r.ok = out.status === 0;
        if (!r.ok)
            r.error = String(out.error?.message || out.stderr || out.stdout || `claude plugin ${r.action} failed`).trim().split('\n')[0];
    }
    r.scope = modScope('batch', root);
    r.enabled = r.scope !== undefined;
    if (!r.enabled && paired)
        r.hint = `Optional batch mod (read-heavy tasks used about 28-34% fewer tokens in the kit's test): run claude plugin marketplace add "${market}" once, then claude plugin install ${BATCH_ID} --scope project, or re-run this command with --batch on.`;
    if (r.enabled && !paired)
        r.warning = 'the batch mod is enabled but the session-budget skill is not installed, so nothing tells the model when to use mcp__batch__run. Install session-budget.';
    return r;
}
exports.AI_BACKENDS = ['code', 'ollama', 'kaggle', 'unified'];
const AI_NEEDS = { review: 'implicit-state-audit', goldfish: 'plan-first', tests: 'test-run', image: 'mcp-manager', coding: 'kaggle' };
function parseAiFlag(v) {
    const m = /^(review|goldfish|tests|image|coding)=(.*)$/.exec(v || '');
    if (!m)
        return null;
    const words = m[2] === 'none' || m[2] === '' ? [] : m[2].split(/[+,]/);
    if (!words.every((w) => exports.AI_BACKENDS.includes(w)))
        return null;
    return { feature: m[1], list: exports.AI_BACKENDS.filter((b) => words.includes(b)) };
}
// Merges the chosen features into <root>/.claude/ai-backends.json. A feature already in the file is kept unless --force.
function writeAiBackends(root, ai, installed, force) {
    const file = path.join(root, '.claude', 'ai-backends.json');
    let cur = {};
    try {
        cur = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch { /* none yet */ }
    let changed = false;
    for (const [f, list] of Object.entries(ai)) {
        if (!installed.includes(AI_NEEDS[f]) || (f in cur && !force))
            continue;
        cur[f] = list;
        changed = true;
    }
    if (!changed)
        return undefined;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
    return file;
}
const USAGE_MOD = 'feature-usage';
// True when the feature-usage mod is enabled in the user's Claude settings (any scope key naming it).
function usageModEnabled() {
    const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
        return Object.entries(j.enabledPlugins || {}).some(([k, v]) => k.startsWith(USAGE_MOD + '@') && v !== false);
    }
    catch {
        return false;
    }
}
// The tracking switch is only a file; the mod that reads it must be installed in Claude Code, or nothing is ever logged and no
// notice ever shows. So turning tracking on installs the mod too (marketplace add, then plugin install at user scope) and checks the
// result in settings.json, so the user never has to ask the AI to finish the job. A failure returns the two commands to run by hand.
// The claude command: AI_DEV_KIT_CLAUDE_BIN (tests), then PATH, then the copy the VS Code extension ships (a shell that cannot find `claude`
// still has it there). Returns null when none exists, so the caller says so plainly instead of printing a raw "not recognized" error.
function claudeBin() {
    if (process.env.AI_DEV_KIT_CLAUDE_BIN)
        return process.env.AI_DEV_KIT_CLAUDE_BIN;
    const names = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
        for (const n of names) {
            try {
                if (fs.statSync(path.join(dir, n)).isFile())
                    return path.join(dir, n);
            }
            catch { /* next */ }
        }
    }
    try {
        const ext = path.join(os.homedir(), '.vscode', 'extensions');
        const dirs = fs.readdirSync(ext).filter((d) => d.startsWith('anthropic.claude-code-')).sort().reverse();
        for (const d of dirs) {
            for (const n of ['claude.exe', 'claude']) {
                const p = path.join(ext, d, 'resources', 'native-binary', n);
                if (fs.existsSync(p))
                    return p;
            }
        }
    }
    catch { /* no extensions folder */ }
    return null;
}
// One spawn path for every claude call. A .js stand-in runs through node; a .cmd shim on Windows needs a shell, so it gets ONE fully quoted
// command string (an args array plus shell:true is deprecated, DEP0190, and breaks on paths with spaces); everything else spawns directly.
function spawnClaude(args, cwd) {
    const bin = claudeBin();
    if (!bin)
        return { status: null, signal: null, output: [], pid: 0, stdout: '', stderr: '', error: new Error('the claude command was not found') };
    const opts = { cwd, encoding: 'utf8', timeout: 120000 };
    if (/\.(c|m)?js$/.test(bin))
        return childProcess.spawnSync(process.execPath, [bin, ...args], opts);
    if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin))
        return childProcess.spawnSync(bin, args, opts);
    const quote = (x) => (/[\s"&|<>^()%!]/.test(x) ? '"' + x.replace(/"/g, '\\"') + '"' : x);
    return childProcess.spawnSync([bin, ...args].map(quote).join(' '), { ...opts, shell: true });
}
function runClaude(args, cwd) { return spawnClaude(args, cwd); }
// The kit cloned inside the project it installs into shows up as untracked and gets scanned by repo-wide skills: keep it out of git status.
function excludeKitFromGit(root, library) {
    if (!library)
        return undefined;
    const rel = path.relative(root, library);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
        return undefined;
    try {
        if (!fs.statSync(path.join(root, '.git')).isDirectory())
            return undefined;
        const file = path.join(root, '.git', 'info', 'exclude');
        const entry = '/' + rel.split(path.sep).join('/') + '/';
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        if (cur.split(/\r?\n/).includes(entry))
            return undefined;
        fs.appendFileSync(file, (cur && !cur.endsWith('\n') ? '\n' : '') + entry + '\n');
        return entry;
    }
    catch {
        return undefined;
    }
}
function ensureUsageMod(library) {
    return ensureMod(USAGE_MOD, 'user', os.homedir(), library, usageModEnabled);
}
// Installs one mod of the kit's marketplace (add the marketplace, re-point it when another kit copy owns it, install, then confirm settings.json names it).
function ensureMod(name, scope, cwd, library, isEnabled) {
    if (isEnabled())
        return { state: 'enabled' };
    const market = path.join(library || '<ai-dev-kit>', 'mods');
    const manual = `claude plugin marketplace add "${market}" then claude plugin install ${name}@ai-dev-kit-mods --scope ${scope}`;
    if (!claudeBin())
        return { state: 'failed', warning: `the ${name} mod was NOT installed: the claude command was not found on PATH or in the VS Code extension. In a shell where claude works, run: ${manual}` };
    const add = runClaude(['plugin', 'marketplace', 'add', market], cwd);
    const addText = String(add.stderr || add.stdout || '');
    if (add.status !== 0 && !/already/i.test(addText))
        return { state: 'failed', warning: `could not add the mods marketplace (${(add.error?.message || addText || 'unknown error').trim().split('\n')[0]}). Run: ${manual}` };
    if (add.status !== 0) {
        // "already registered" can mean ANOTHER copy of the kit (a different project's clone). Point it at this one when the list does not show this path.
        const list = runClaude(['plugin', 'marketplace', 'list'], cwd);
        const shown = String(list.stdout || '') + String(list.stderr || '');
        if (list.status === 0 && !shown.replace(/\\/g, '/').toLowerCase().includes(market.replace(/\\/g, '/').toLowerCase())) {
            runClaude(['plugin', 'marketplace', 'remove', 'ai-dev-kit-mods'], cwd);
            const again = runClaude(['plugin', 'marketplace', 'add', market], cwd);
            if (again.status !== 0)
                return { state: 'failed', warning: `the mods marketplace is registered from another kit copy and could not be re-pointed to ${market} (${String(again.stderr || again.stdout || 'unknown error').trim().split('\n')[0]}). Run: ${manual}` };
        }
    }
    const inst = runClaude(['plugin', 'install', `${name}@ai-dev-kit-mods`, '--scope', scope], cwd);
    if (inst.status !== 0 && !/already/i.test(String(inst.stderr || inst.stdout || '')))
        return { state: 'failed', warning: `could not install the ${name} mod (${String(inst.error?.message || inst.stderr || inst.stdout || 'unknown error').trim().split('\n')[0]}). Run: ${manual}` };
    if (!isEnabled())
        return { state: 'failed', warning: `the ${name} mod is not enabled in settings.json after the install. Run: ${manual}` };
    return { state: 'installed' };
}
// A mod that only works with a same-named skill (its script does the work): project scope, opt-in, refuses 'on' without the skill.
function skillPairedMod(name, root, library, installed, want) {
    const r = { enabled: false, skill: installed.includes(name) };
    if (want === 'on') {
        r.action = 'install';
        if (!r.skill) {
            r.ok = false;
            r.error = `the ${name} skill is not installed here (install it first: install-kit install --skills ${name}), so the mod would do nothing`;
        }
        else {
            const m = ensureMod(name, 'project', root, library, () => modScope(name, root) !== undefined);
            r.ok = m.state !== 'failed';
            if (m.warning)
                r.error = m.warning;
        }
    }
    else if (want === 'off') {
        r.action = 'uninstall';
        const out = spawnClaude(['plugin', 'uninstall', `${name}@ai-dev-kit-mods`, '--scope', 'project'], root);
        r.ok = out.status === 0;
        if (!r.ok)
            r.error = String(out.error?.message || out.stderr || out.stdout || 'claude plugin uninstall failed').trim().split('\n')[0];
    }
    r.enabled = modScope(name, root) !== undefined;
    if (r.enabled && !r.skill)
        r.warning = `the ${name} mod is enabled but the ${name} skill is not installed, so it does nothing (the built-in tool runs as normal). Install the skill.`;
    return r;
}
// The web-digest mod answers WebFetch with a short digest. Needs Obscura to do anything; says so when it is missing.
function webDigestMod(root, library, installed, want) {
    const r = skillPairedMod('web-digest', root, library, installed, want);
    if (r.enabled) {
        const o = ext.findRef('obscura');
        if (!o || !ext.detect(o).present)
            r.tools = 'Obscura is not installed, so every fetch falls through to Claude (install: node install-kit.cli.js install --external obscura).';
    }
    return r;
}
// The web-search mod answers WebSearch with a compact hit list from the free router's /v1/search. Needs the router key; says so when it is missing.
function webSearchMod(root, library, installed, want) {
    const r = skillPairedMod('web-search', root, library, installed, want);
    if (r.enabled && !unifiedKeySet())
        r.tools = 'No UNIFIED_API_KEY (shell or ~/.ai-dev-kit/.env), so every search falls through to Claude.';
    return r;
}
// The scripts' rule: AI_DEV_KIT_HOME IS the kit folder (default ~/.ai-dev-kit).
const kitFolder = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
function unifiedKeySet() {
    if (process.env.UNIFIED_API_KEY)
        return true;
    try {
        return /^UNIFIED_API_KEY=\s*\S/m.test(fs.readFileSync(path.join(kitFolder(), '.env'), 'utf8'));
    }
    catch {
        return false;
    }
}
function setWebSearchSift(v) {
    const file = path.join(kitFolder(), 'web-search.json');
    let cur = {};
    try {
        cur = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch { /* none yet */ }
    cur.sift = v;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
    const r = { file, sift: v };
    if (v === 'router' && !unifiedKeySet())
        r.warning = 'the router sifter needs UNIFIED_API_KEY (shell or ~/.ai-dev-kit/.env); without it searches use the sentence scoring.';
    return r;
}
// The on/off switch for feature-usage tracking, written to the file the mod and session-budget/usage.js read:
// <home>/.ai-dev-kit/usage/config.json (AI_DEV_KIT_HOME replaces the home folder, for tests). Only the keys given change.
function setUsageTracking(track, notify) {
    if (track === undefined && notify === undefined)
        return undefined;
    const file = path.join(process.env.AI_DEV_KIT_HOME || os.homedir(), '.ai-dev-kit', 'usage', 'config.json');
    const cur = { track: true, notify: true };
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        cur.track = j.track !== false;
        cur.notify = j.notify !== false;
    }
    catch { /* no config yet: the defaults */ }
    if (track !== undefined)
        cur.track = track === 'on';
    if (notify !== undefined)
        cur.notify = notify === 'on';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
    return { file, ...cur };
}
function doInstall(args) {
    if (args.signature !== undefined && !/^(none|off|no)$/i.test(args.signature))
        sig.normalizeAlias(args.signature); // a bad alias stops here, before anything is written
    const tool = ROOTS[args.tool];
    if (!tool)
        throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
    const catalog = listSkills(args.library);
    const absSkillRoot = path.join(args.root, tool.skills);
    const manifest = (0, skill_scope_move_1.readManifest)(args.root);
    manifest.tool = args.tool;
    manifest.skillRoot = tool.skills;
    manifest.protocolFile = tool.protocol;
    const knownBefore = new Set([...Object.keys(manifest.skills), ...Object.keys(manifest.archived)]);
    const results = [];
    for (const token of args.skills || []) {
        const r = installOneSkill(args.library, absSkillRoot, catalog, token, {
            commentStyleLevel: args.commentStyleLevel,
            variantCtx: variantCtxFor(args.root, args.tool, args.ai, args.force),
        });
        results.push(r);
        if (!r.error) {
            manifest.skills[r.name] = { dir: catalog[r.name].dir, companions: r.companions };
            if (manifest.archived[r.name]) {
                fs.rmSync(path.join(archiveRootOf(args.root, manifest), r.name), { recursive: true, force: true });
                delete manifest.archived[r.name];
            }
        }
    }
    if ((0, skill_scope_move_1.ensureShield)(absSkillRoot))
        results.push({ name: '(shield)', changed: true });
    // "Don't install default standards": the kit defaults are skipped entirely; the company folder is all there is.
    if (args.company && args.companyDefaults === 'drop')
        args.standards = false;
    let standardsResult = null;
    if (args.standards) {
        const activeStandards = (args.scriptStandard || args.activeStandardsKeys)
            ? { scriptStandard: args.scriptStandard, active: args.activeStandardsKeys ? new Set(args.activeStandardsKeys) : undefined }
            : undefined;
        standardsResult = installStandards(args.library, args.root, tool.protocol, {
            contextCode: args.contextCode,
            existing: args.existingProtocol,
            agentReady: args.agentReady,
            force: args.force,
            installedNames: new Set(Object.keys(manifest.skills)),
            activeStandards,
            omit: company.companyOmit(manifest.company),
        });
        manifest.standards = true;
    }
    if (standardsResult?.protocolFile)
        manifest.protocolFile = standardsResult.protocolFile; // the file actually written, so update refreshes the same one
    if (standardsResult?.ignoredProtocol)
        console.error(`warning: ${standardsResult.ignoredProtocol} is ignored by this project's .gitignore, so it will not be committed. Add an exception such as !${standardsResult.ignoredProtocol}`);
    if (args.commentStyleLevel)
        manifest.commentStyleLevel = args.commentStyleLevel;
    if (standardsResult?.replaced)
        console.error(standardsResult.replaced + ' replaced with the kit protocol (old copy saved as ' + standardsResult.replaced + '.bak)');
    if (standardsResult?.appended)
        console.error('kit protocol appended to existing ' + standardsResult.appended);
    if (standardsResult?.contextCodeFailed)
        console.error('warning: could not set the context code in ' + standardsResult.contextCodeFailed + '; add "| Context code | ' + args.contextCode + ' |" by hand');
    if (args.contextCode && !standardsResult?.contextCodeFailed)
        manifest.contextCode = args.contextCode;
    const commandsResult = args.noCommands ? undefined : syncCommands(args.root, manifest, args.library, { force: args.force, install: true });
    const hasScaffold = !!(manifest.skills['e2e-scaffold'] || manifest.archived['e2e-scaffold']);
    const e2eDrivers = writeE2eDrivers(args.root, args.e2eDriver, hasScaffold);
    if (e2eDrivers?.note)
        console.error('note: ' + e2eDrivers.note);
    const wantExternals = e2eDrivers?.file && e2eDrivers.drivers.includes('obscura') ? Array.from(new Set([...(args.external || []), 'obscura'])) : args.external;
    const externalsResult = syncExternals(wantExternals, false, args.force);
    manifest.lastSeen = latestChangelogDate(args.library) ?? manifest.lastSeen;
    (0, skill_scope_move_1.writeManifest)(args.root, manifest);
    const signatureResult = args.signature !== undefined && !/^(none|off|no)$/i.test(args.signature) ? sig.setSignature(args.root, args.signature) : undefined;
    const companyResult = args.company
        ? company.doCompanySync({ library: args.library, root: args.root, tool: args.tool, companyFrom: args.companyFrom, companyDefaults: args.companyDefaults })
        : undefined;
    const usageResult = setUsageTracking(args.usage, args.usageNotify);
    if (usageResult && usageResult.track) {
        const m = ensureUsageMod(args.library);
        usageResult.mod = m.state;
        if (m.warning) {
            usageResult.warning = m.warning;
            console.error(m.warning);
        }
        else if (m.state === 'installed')
            console.error('feature-usage mod installed; it starts logging in your next Claude Code session (or run /reload-plugins).');
    }
    if (usageResult?.warning && !usageResult.mod)
        console.error(usageResult.warning);
    const batchPaired = Object.keys(manifest.skills).includes('session-budget');
    const batchResult = args.batch !== undefined || batchPaired ? batchMod(args.root, args.library, batchPaired, args.batch) : undefined;
    if (batchResult?.warning)
        console.error(batchResult.warning);
    const webDigestResult = args.webDigest !== undefined || Object.keys(manifest.skills).includes('web-digest') ? webDigestMod(args.root, args.library, Object.keys(manifest.skills), args.webDigest) : undefined;
    if (webDigestResult?.error)
        console.error('web-digest: ' + webDigestResult.error);
    if (webDigestResult?.warning)
        console.error(webDigestResult.warning);
    if (webDigestResult?.tools)
        console.error(webDigestResult.tools);
    const webSearchResult = args.webSearch !== undefined || Object.keys(manifest.skills).includes('web-search') ? webSearchMod(args.root, args.library, Object.keys(manifest.skills), args.webSearch) : undefined;
    if (webSearchResult?.error)
        console.error('web-search: ' + webSearchResult.error);
    if (webSearchResult?.warning)
        console.error(webSearchResult.warning);
    if (webSearchResult?.tools)
        console.error(webSearchResult.tools);
    const siftResult = args.webSearchSift ? setWebSearchSift(args.webSearchSift) : undefined;
    if (siftResult?.warning)
        console.error(siftResult.warning);
    // Outside-model choices live in one small file the scripts and mods read. Only written when a choice was made; delete a feature's
    // key (or the file) to go back to the default (Claude, or the free scan for the review). --force replaces an existing key.
    if (args.ai)
        writeAiBackends(args.root, args.ai, Object.keys(manifest.skills), args.force);
    // Nobody knows the first task yet, so a fresh install starts lean: the per-session archivable skills are archived now, the pinned ones stay.
    // /next <task>, /role, /unarchive <name> or a command that needs one brings it back. A skill the project already had (active or archived) keeps its state.
    let archivedNow;
    if (!args.keepActive) {
        const fresh = results.filter((r) => !r.error && exports.ARCHIVABLE_SKILLS.includes(r.name) && !knownBefore.has(r.name)).map((r) => r.name);
        if (fresh.length)
            archivedNow = (0, skill_scope_move_1.doArchive)({ root: args.root, skills: fresh, by: 'auto' }).archived;
    }
    const keptOut = excludeKitFromGit(args.root, args.library);
    if (keptOut)
        console.error(`note: the kit is cloned inside the project; added ${keptOut} to .git/info/exclude so it stays out of git status. Move it outside the project when you can.`);
    const verifyResult = verify({ root: args.root, tool: args.tool });
    return { archived: archivedNow, skills: results, standards: standardsResult, verify: verifyResult, commands: commandsResult, company: companyResult, signature: signatureResult, usage: usageResult, batch: batchResult, webDigest: webDigestResult, webSearch: webSearchResult, webSearchSift: siftResult, externals: externalsResult, e2eDrivers };
}
const NEWS_CAP = 12;
function parseChangelog(text) {
    const out = [];
    let date = '', kind = '';
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const d = /^##\s+(\d{4}-\d{2}-\d{2})\b/.exec(line);
        if (d) {
            date = d[1];
            kind = '';
            continue;
        }
        const k = /^###\s+(.+?)\s*$/.exec(line);
        if (k) {
            kind = k[1];
            continue;
        }
        const b = /^-\s+(.+)$/.exec(line);
        if (b && date) {
            const first = b[1].split(/(?<=[.!?])\s/)[0];
            out.push({ date, kind, headline: first.length > 160 ? first.slice(0, 157) + '...' : first });
        }
    }
    return out;
}
// since = the project's lastSeen. With none (first update after tracking began) the newest two dated sections count as new.
function whatsNew(library, since) {
    let text;
    try {
        text = fs.readFileSync(path.join(library, 'CHANGELOG.md'), 'utf8');
    }
    catch {
        return undefined;
    }
    const all = parseChangelog(text);
    if (!all.length)
        return undefined;
    const dates = [...new Set(all.map((e) => e.date))].sort().reverse();
    const picked = since ? all.filter((e) => e.date > since) : all.filter((e) => dates.slice(0, 2).includes(e.date));
    return { since: since ?? null, latest: dates[0], baseline: !since, entries: picked.slice(0, NEWS_CAP), more: Math.max(0, picked.length - NEWS_CAP) };
}
function latestChangelogDate(library) {
    try {
        return parseChangelog(fs.readFileSync(path.join(library, 'CHANGELOG.md'), 'utf8')).map((e) => e.date).sort().pop();
    }
    catch {
        return undefined;
    }
}
function doUpdate(args) {
    const manifest = (0, skill_scope_move_1.readManifest)(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, skill_scope_move_1.MANIFEST_NAME) + ' -- run install first');
    const tool = ROOTS[(args.tool || manifest.tool)];
    if (!tool)
        throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
    const catalog = listSkills(args.library);
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const absArchiveRoot = archiveRootOf(args.root, manifest);
    const names = args.all ? [...Object.keys(manifest.skills), ...Object.keys(manifest.archived)] : (args.skills || []);
    const results = [];
    for (const token of names) {
        const { name } = parseSkillToken(token);
        const archived = !manifest.skills[name] && !!manifest.archived[name];
        if (!manifest.skills[name] && !archived) {
            results.push({ name, error: 'not installed by this kit (not in manifest) -- skipped' });
            continue;
        }
        // An archived skill is refreshed where it sits; it stays archived.
        const r = installOneSkill(args.library, archived ? absArchiveRoot : absSkillRoot, catalog, token, {
            commentStyleLevel: args.commentStyleLevel || manifest.commentStyleLevel || undefined,
            variantCtx: variantCtxFor(args.root, manifest.tool, args.ai, args.force),
        });
        results.push(r);
        if (!r.error)
            (archived ? manifest.archived : manifest.skills)[r.name] = { dir: catalog[r.name].dir, companions: r.companions };
    }
    (0, skill_scope_move_1.ensureShield)(absSkillRoot);
    const migrations = applyRenameMigrations(args.library, args.root, manifest, args.applyMigrations);
    const omit = company.companyOmit(manifest.company);
    if (manifest.standards && args.contextCode) {
        installStandards(args.library, args.root, manifest.protocolFile, { contextCode: args.contextCode, omit });
    }
    else if (manifest.standards) {
        installStandards(args.library, args.root, manifest.protocolFile, { omit });
    }
    company.refreshCompany(args.root, manifest);
    if (args.contextCode)
        manifest.contextCode = args.contextCode;
    // update re-pins machine-wide tools that are present but behind the registry pin
    const externalsResult = syncExternals(args.external, true, args.force);
    const news = whatsNew(args.library, manifest.lastSeen);
    if (news)
        manifest.lastSeen = news.latest;
    (0, skill_scope_move_1.writeManifest)(args.root, manifest);
    // A newer kit can add hook blocks. Merge them only where the project already opted in to kit hooks.
    let hooksAdded = [];
    let hooksRetired = [];
    const core = manifest.tool === 'claude' ? coreHooksOrNull(args.library) : null;
    if (core && hasKitHooks(args.root, core)) {
        const merged = mergeHooks(args.root, core);
        hooksAdded = merged.added;
        hooksRetired = merged.retired;
    }
    const commandsResult = args.noCommands ? undefined : syncCommands(args.root, manifest, args.library, { force: args.force, install: false });
    (0, skill_scope_move_1.writeManifest)(args.root, manifest);
    const verifyResult = verify({ root: args.root, tool: manifest.tool });
    return { skills: results, migrations, verify: verifyResult, hooksAdded, hooksRetired, commands: commandsResult, whatsNew: news, externals: externalsResult };
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
                if (fs.existsSync(oldLearnings)) {
                    const dest = path.join(absSkillRoot, newName, 'learnings.md');
                    if (fs.existsSync(dest))
                        fs.appendFileSync(dest, `\n## From ${oldName}\n` + fs.readFileSync(oldLearnings, 'utf8'));
                    else
                        copyRecursive(oldLearnings, dest);
                }
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
    const manifest = (0, skill_scope_move_1.readManifest)(args.root);
    if (!manifest.tool)
        return { removed: [], kept: [], note: 'no install manifest found -- nothing tracked to remove' };
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const absArchiveRoot = archiveRootOf(args.root, manifest);
    const names = args.all ? [...Object.keys(manifest.skills), ...Object.keys(manifest.archived)] : (args.skills || []);
    const removed = [];
    const kept = [];
    for (const name of names) {
        if (manifest.skills[name]) {
            const dir = path.join(absSkillRoot, name);
            if (fs.existsSync(dir))
                fs.rmSync(dir, { recursive: true, force: true });
            delete manifest.skills[name];
            removed.push(`${manifest.skillRoot}/${name}`);
        }
        else if (manifest.archived[name]) {
            fs.rmSync(path.join(absArchiveRoot, name), { recursive: true, force: true });
            delete manifest.archived[name];
            removed.push(`${path.dirname(manifest.skillRoot)}/skills-archive/${name}`);
        }
        else {
            kept.push(`${name}: not tracked in manifest, left alone`);
        }
    }
    if (fs.existsSync(absArchiveRoot) && fs.readdirSync(absArchiveRoot).length === 0)
        fs.rmdirSync(absArchiveRoot);
    if ((args.all || names.includes('e2e-scaffold')) && fs.existsSync(path.join(args.root, ...E2E_DRIVER_FILE))) {
        fs.rmSync(path.join(args.root, ...E2E_DRIVER_FILE), { force: true });
        removed.push(E2E_DRIVER_FILE.join('/'));
    }
    if ((0, skill_scope_move_1.removeShieldIfUnneeded)(absSkillRoot))
        removed.push(`${manifest.skillRoot}/package.json (shield, no longer needed)`);
    const cmd = pruneCommands(args.root, manifest, !!args.all, args.library || (() => { try {
        return defaultLibraryGuess();
    }
    catch {
        return undefined;
    } })());
    removed.push(...cmd.removed);
    kept.push(...cmd.kept);
    const core = coreHooksOrNull(args.library);
    if (args.removeHooks && core) {
        const n = removeKitHooks(args.root, core);
        if (n)
            removed.push(`.claude/settings.json (${n} kit hook${n === 1 ? '' : 's'})`);
    }
    else if (core && hasKitHooks(args.root, core)) {
        kept.push('.claude/settings.json kit hooks left in place (pass --remove-hooks to remove only the entries the kit added)');
    }
    if (args.removeStandards && manifest.standards) {
        // company/ holds the user's own files: never swept up with the kit's defaults.
        const dir = path.join(args.root, 'coding-standards');
        if (fs.existsSync(dir))
            for (const e of fs.readdirSync(dir))
                if (e !== company.COMPANY_DIR)
                    fs.rmSync(path.join(dir, e), { recursive: true, force: true });
        if (fs.existsSync(dir) && !fs.readdirSync(dir).length)
            fs.rmdirSync(dir);
        removed.push('coding-standards/ (the kit defaults)');
        manifest.standards = false;
        kept.push(`${manifest.protocolFile} left in place -- it may carry project-specific edits; remove it by hand if no longer wanted`);
    }
    else if (manifest.standards) {
        kept.push('coding-standards/ left in place (pass --remove-standards to remove it)');
    }
    (0, skill_scope_move_1.writeManifest)(args.root, manifest);
    if (manifest.company && (args.all || args.removeStandards || args.purgeCompany)) {
        const c = company.doCompanyRemove({ root: args.root, library: args.library || (() => { try {
                return defaultLibraryGuess();
            }
            catch {
                return undefined;
            } })(), purge: args.purgeCompany, noRestore: !!args.removeStandards });
        removed.push(...c.removed);
        kept.push(...c.kept);
    }
    else if (manifest.company) {
        kept.push('company standards left in place (run `company remove` to take them out)');
    }
    if (args.all && (0, skill_scope_move_1.readManifest)(args.root).signature) {
        const r = sig.setSignature(args.root, 'none');
        removed.push(...r.notes);
    }
    return { removed, kept };
}
// Prompts run on a real terminal (stdin and stdout both a TTY). AI_DEV_KIT_INTERACTIVE=1 forces them on piped input so the whole
// flow can be tested by feeding answers; the answers still come one line per question, and a closed input means "press Enter".
function isInteractive() {
    return process.env.AI_DEV_KIT_INTERACTIVE === '1' || (!!process.stdout.isTTY && !!process.stdin.isTTY);
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
// A small, semantic palette instead of one undifferentiated dim/plain split -- each role gets its
// own color so the eye can tell them apart at a glance without reading every word. Respects the
// NO_COLOR convention (no-color.org) and, separately, whether this is really an interactive TTY --
// red() is also used in main()'s catch/usage path, which runs outside fillInteractive's own gate
// (a --json call, or any piped/non-interactive run, must never leak raw escape codes into output
// someone is scripting against). Never applied to the final `console.log(JSON.stringify(res, ...))`
// in main() regardless -- that output is for piping, and an escape code embedded in it would
// corrupt a `--json` caller's parse even when color is otherwise enabled.
const COLOR_ENABLED = !process.env.NO_COLOR && isInteractive();
// The question itself, on every ask* prompt -- the one constant anchor to orient on before reading
// a long list of choices.
function bold(s) {
    return COLOR_ENABLED ? `\x1b[1m${s}\x1b[22m` : s;
}
// Secondary, descriptive text that explains a choice rather than being one -- a skill's purpose, a
// category's skill count, "type numbers separated by commas" style instructions.
function dim(s) {
    return COLOR_ENABLED ? `\x1b[2m${s}\x1b[22m` : s;
}
// A running tally of what's already chosen (the category picker's "Selected so far" line) -- its
// own color so a cumulative-state line never reads as just another skill name or description.
function cyan(s) {
    return COLOR_ENABLED ? `\x1b[36m${s}\x1b[39m` : s;
}
// Something the tool found, matched, or assumed on the project's behalf -- a detected stack signal,
// the auto-assumed --root, detected-tool evidence. Positive, confirmatory information.
function green(s) {
    return COLOR_ENABLED ? `\x1b[32m${s}\x1b[39m` : s;
}
// A notice worth a second look without being an error -- a stack preset's known coding-standards
// gap, categories left unreviewed when picking finished early.
function yellow(s) {
    return COLOR_ENABLED ? `\x1b[33m${s}\x1b[39m` : s;
}
// Actual failures only (main()'s caught-error and usage lines) -- never used for anything the user
// chose on purpose, so red stays a reliable "something went wrong" signal.
function red(s) {
    return COLOR_ENABLED ? `\x1b[31m${s}\x1b[39m` : s;
}
// Matches install-kit.md's nine Pick-mode categories (models/opencode and models/claude both
// collapse to "models", the top-level grouping the skill scan already uses).
const CATEGORY_ORDER = ['models', 'workflow', 'standards', 'memory', 'stack', 'libraries', 'meta', 'addons', 'mcp', 'cloud'];
function topCategory(dir) {
    return dir.split('/')[0] || '(uncategorized)';
}
function orderedCategories(present) {
    const known = CATEGORY_ORDER.filter((c) => present.includes(c));
    const rest = present.filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...known, ...rest];
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
            console.log(green(`Target project: ${parent}`) + dim(`  (this kit is cloned inside that folder, so that's assumed to be your project -- pass --root to use a different one)`));
            return parent;
        }
    }
    return askText('Target project path', cwd);
}
// One shared readline interface for the whole run, opened on first use and closed once
// fillInteractive is done with it -- never left open, or the process would hang on exit.
let rl = null;
// Lines that arrive before a question is asked (piped input) wait here instead of being dropped.
const queuedLines = [];
let waiting = null;
let inputEnded = false;
function closeRl() { if (rl) {
    rl.close();
    rl = null;
} queuedLines.length = 0; waiting = null; inputEnded = false; }
// Going back: typing "<" at any prompt (or "b" / "back" at a menu or yes/no) undoes the current step and returns to the
// previous one that asked something. canGoBack is false on the first question, where there is nothing to return to.
class BackSignal extends Error {
}
let canGoBack = false;
let askCount = 0;
let backTipShown = false;
function goBackIfAsked(ans) {
    if (canGoBack && /^(b|back)$/i.test(ans.trim()))
        throw new BackSignal();
}
async function ask(question) {
    if (canGoBack && !backTipShown) {
        backTipShown = true;
        console.log(dim('Tip: type < at any prompt to go back one step.'));
    }
    for (;;) {
        const line = await rawAsk(question);
        askCount++;
        if (line.trim() !== '<')
            return line;
        if (canGoBack)
            throw new BackSignal();
        console.log(dim('This is the first step; there is nothing to go back to.'));
    }
}
function rawAsk(question) {
    if (!rl) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.on('line', (l) => { if (waiting) {
            const w = waiting;
            waiting = null;
            if (!process.stdin.isTTY)
                process.stdout.write(l + '\n');
            w(l);
        }
        else
            queuedLines.push(l); });
        rl.on('close', () => { inputEnded = true; if (waiting) {
            const w = waiting;
            waiting = null;
            w('');
        } }); // input ended: take the default
    }
    if (queuedLines.length) {
        const l = queuedLines.shift();
        process.stdout.write(question + l + '\n');
        return Promise.resolve(l);
    }
    if (inputEnded) {
        process.stdout.write(question + '\n');
        return Promise.resolve('');
    } // nothing more to read: Enter, the default
    return new Promise((resolve) => { waiting = resolve; rl.setPrompt(question); rl.prompt(); });
}
// --yes: every question takes its default (the pre-selected, recommended answer) and nothing is asked.
let autoYes = false;
async function askText(message, initial) {
    if (autoYes)
        return initial;
    const ans = (await ask(`${bold(message)} [${initial}]: `)).trim();
    return ans || initial;
}
// ---- Arrow-key menus (a real terminal only; a pipe, --json or AI_DEV_KIT_NO_MENUS=1 keeps the numbered prompts) ----
// Every answer is remembered by its question: going back pre-selects it, and Right replays it (redo) until an earlier
// answer changes, which forgets the later ones. The log feeds the summary screen shown before anything is written.
let menuIOOverride = null; // a test drives the menus through a fake terminal
function setMenuIO(io) { menuIOOverride = io; }
const menuIO = () => menuIOOverride ?? { input: process.stdin, output: process.stdout, color: COLOR_ENABLED };
// Test hook: the prompt layer with the step runner, so a fake terminal can drive back, redo and the summary screen.
exports.__testApi = {
    runSteps: (args, steps) => { stepNo = 0; keysShown = false; memory.clear(); memOrder.length = 0; answerLog.length = 0; canGoBack = false; askCount = 0; return runSteps(args, steps); },
    askYesNo: (m, d) => askYesNo(m, d),
    askSelect: (m, c, i) => askSelect(m, c, i),
    askMultiselect: (m, c, o) => askMultiselect(m, c, o),
    askCompany: (a, ask) => askCompany(a, ask),
    skillChoices: (cat, purposes) => skillChoices(cat, purposes),
};
function useMenus() {
    if (menuIOOverride)
        return true;
    const i = process.stdin;
    return !!i.isTTY && !!process.stdout.isTTY && typeof i.setRawMode === 'function' && process.env.AI_DEV_KIT_NO_MENUS !== '1' && !process.env.AI_DEV_KIT_INTERACTIVE;
}
let stepNo = 0;
let stepTotal = 0;
let keysShown = false;
const memory = new Map();
const memOrder = [];
const answerLog = [];
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
function remember(q, vals, shown) {
    const prev = memory.get(q);
    const pos = memOrder.indexOf(q);
    if (prev && prev.join('\u0000') !== vals.join('\u0000') && pos >= 0) {
        for (const later of memOrder.slice(pos + 1))
            memory.delete(later);
        memOrder.length = pos + 1;
    }
    memory.set(q, vals);
    if (pos < 0)
        memOrder.push(q);
    const at = answerLog.findIndex((e) => e.q === q);
    const entry = { step: stepNo - 1, q: plain(q), a: shown };
    if (at >= 0)
        answerLog[at] = entry;
    else
        answerLog.push(entry);
}
async function menuPick(message, choices, multi, fallback) {
    closeRl(); // raw mode owns stdin while a menu is open
    if (!keysShown) {
        keysShown = true;
        console.log(dim('Keys: Up/Down move, Space ticks, Enter confirms, Left goes back (undo), Right replays an answer you went back over (redo), q quits. Nothing is written until the last screen.'));
    }
    const prev = memory.get(message);
    const initial = prev ? prev.map((v) => choices.findIndex((c) => c.value === v)).filter((x) => x >= 0) : fallback;
    const r = await select.runMenu(menuIO(), {
        header: `Step ${stepNo} of ${stepTotal}`, question: message, items: choices.map((c) => ({ title: c.title })),
        multi, initial, canBack: canGoBack, canRedo: !!prev,
    });
    askCount++;
    if (r.kind === 'back')
        throw new BackSignal();
    const vals = r.picked.map((i) => choices[i].value);
    remember(message, vals, r.picked.map((i) => plain(choices[i].title).split('  ')[0].split(' -- ')[0]).join(', ') || 'none');
    return vals;
}
async function askYesNo(message, initialYes) {
    if (autoYes)
        return initialYes;
    if (useMenus()) {
        const v = await menuPick(message, [{ title: 'Yes', value: 'yes' }, { title: 'No', value: 'no' }], false, [initialYes ? 0 : 1]);
        return v[0] === 'yes';
    }
    const ans = (await ask(`${bold(message)} (${initialYes ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
    goBackIfAsked(ans);
    if (!ans)
        return initialYes;
    return ans.startsWith('y');
}
// A plain numbered menu -- "1) claude  2) opencode" -- typed instead of arrow-keyed, so it behaves
// the same in every terminal (PowerShell, cmd.exe, any SSH session) with no raw-mode surprises.
async function askSelect(message, choices, initialIndex) {
    if (autoYes)
        return choices[initialIndex].value;
    if (useMenus())
        return (await menuPick(message, choices, false, [initialIndex]))[0];
    console.log(bold(message));
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
    for (;;) {
        const ans = (await ask(`Type a number [${initialIndex + 1}]: `)).trim();
        goBackIfAsked(ans);
        if (!ans)
            return choices[initialIndex].value;
        const n = Number(ans);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length)
            return choices[n - 1].value;
        console.log(`Please type a number from 1 to ${choices.length}, or press Enter for ${initialIndex + 1}.`);
    }
}
async function askMultiselect(message, choices, opts = {}) {
    if (autoYes)
        return opts.defaultAll ? choices.map((c) => c.value) : [];
    if (useMenus())
        return menuPick(message, choices, true, opts.defaultAll ? choices.map((_, i) => i) : []);
    console.log(bold(message));
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
    const defaultWord = opts.defaultAll ? 'all' : 'none';
    console.log(dim(`Type the numbers you want, separated by commas (example: 1,3,4), or "all"${opts.defaultAll ? ' or "none"' : ''}. Press Enter for ${defaultWord}.`));
    for (;;) {
        const ans = (await ask('Your choice: ')).trim().toLowerCase();
        goBackIfAsked(ans);
        if (!ans)
            return opts.defaultAll ? choices.map((c) => c.value) : [];
        if (ans === 'all')
            return choices.map((c) => c.value);
        if (ans === 'none')
            return [];
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
        return { title: purpose ? `${base} ${dim('— ' + truncate(purpose, 80))}` : base, value: name };
    });
}
// Splits "Pick individually" into one category at a time instead of either a flat list of every
// skill in the library, or a single upfront multi-pick of categories that then runs to completion
// with no way back -- this loops: pick one category, pick skills from it, see the running tally
// (in its own color, distinct from both plain names and dimmed purposes), then choose whether to
// keep going. Finishing early states plainly which categories were never reviewed (skipped, not
// silently installed), so "did picking stop because I'm done, or because something broke" never
// has to be guessed at.
async function pickSkillsByCategory(catalog, purposes, exclude = new Set()) {
    const groups = {};
    for (const [name, entry] of Object.entries(catalog)) {
        if (exclude.has(name))
            continue;
        const cat = topCategory(entry.dir);
        (groups[cat] = groups[cat] || []).push(name);
    }
    const allCategories = orderedCategories(Object.keys(groups));
    if (!allCategories.length)
        return [];
    const picked = [];
    const remaining = new Set(allCategories);
    const DONE = '__done__';
    for (;;) {
        if (picked.length) {
            console.log(cyan(`Selected so far (${picked.length}): ${picked.join(', ')}`));
        }
        if (!remaining.size)
            break;
        const info = `${remaining.size} ${remaining.size === 1 ? 'category' : 'categories'} not yet reviewed`;
        const catChoices = allCategories
            .filter((c) => remaining.has(c))
            .map((c) => ({ title: `${c}  ${dim(`(${groups[c].length} skills)`)}`, value: c }));
        catChoices.push({ title: picked.length ? 'Done -- finish picking' : 'Skip -- pick nothing', value: DONE });
        const choice = await askSelect(`Pick a category ${dim(`(${info})`)}:`, catChoices, catChoices.length - 1);
        if (choice === DONE) {
            if (remaining.size)
                console.log(yellow(`Not reviewed, so not installed: ${[...remaining].join(', ')}`));
            break;
        }
        remaining.delete(choice);
        const subCatalog = Object.fromEntries(groups[choice].map((n) => [n, catalog[n]]));
        const sel = await askMultiselect(`${choice} skills:`, skillChoices(subCatalog, purposes));
        picked.push(...sel);
    }
    return picked;
}
// Fills in only the flags actually missing, on a real terminal -- never overrides a flag the
// caller already passed, and never fires for a --json or non-TTY (scripted/agent) call. See the
// "Interactive mode" note at the top of the file.
// Company standards questions: whether to add the folder, where its files come from, and what happens to the kit defaults.
async function askCompany(args, ask) {
    if (args.company === undefined && ask) {
        args.company = await askYesNo("Does this project follow your own company's standards (a design system, style guide, standards docs)? Yes adds a separate coding-standards/company/ folder for them", false);
    }
    if (!args.company && !(args.companyAction === 'sync' || (!ask && args.root)))
        return;
    args.company = true;
    const m = (0, skill_scope_move_1.readManifest)(args.root);
    const dir = company.companyDir(args.root);
    if (!args.companyFrom && !(fs.existsSync(dir) && company.scanCompany(dir).docs.length)) {
        const p = (await askText('Folder to copy your company standards from (blank: you will drop files into coding-standards/company/ yourself)', '')).trim();
        if (p)
            args.companyFrom = p;
    }
    if (!args.companyDefaults && !m.company) {
        console.log(dim('Auto-detect is a guess from file names, titles and headings; it never removes the accessibility, QA, git or versioning defaults, and "company remove" puts back anything it removed.'));
        args.companyDefaults = await askSelect("What about the default coding standards (the kit's own)?", [
            { title: `Install the default standards too ${dim('-- company rules win where they conflict')}`, value: 'keep' },
            { title: `Don't install the default standards ${dim('-- your company rules are the only standards')}`, value: 'drop' },
            { title: `Auto-detect ${dim('-- reads your files, drops only the defaults your company clearly replaces')}`, value: 'auto' },
        ], 0);
    }
}
// The project signature is the user's own choice: an alias that watermarks code written to the standards, or none.
// Feature-usage tracking is the user's own choice and never touches the project: it writes one small config file in the home folder.
async function askUsage(args) {
    if (args.usage !== undefined || autoYes)
        return; // --yes alone is no request for tracking: it must not install the mod
    console.log(dim('Usage tracking: a script, not the AI (so it costs no tokens), writes one local line each time a skill loads, a slash command is typed or a kit script runs. Names only, never your prompts, files or code, and nothing leaves this machine. It needs the optional feature-usage mod (Claude Code only). See it with /kit-usage report; turn it off any time with /kit-usage off.'));
    args.usage = (await askYesNo('Keep track of which kit features get used?', true)) ? 'on' : 'off';
    if (args.usage === 'on' && args.usageNotify === undefined)
        args.usageNotify = (await askYesNo('Also show a one-line notice the first time each feature is used in a session? (terminal and Desktop only; in the VS Code panel use /kit-usage report)', true)) ? 'on' : 'off';
}
// External tools the kit links but never bundles (install-kit.external.json). Opt-in, default No, and --yes asks nothing: a download is never a default.
// Only tools that can be fetched on this machine and are not already there are offered.
// Only offered when the e2e-scaffold skill is part of this install. Two yes/no questions (both default No) so each browser is its own opt-in.
async function askE2eDriver(args, hasScaffold) {
    if (args.e2eDriver !== undefined || autoYes || !hasScaffold)
        return;
    console.log(dim('Playwright tests can run on Obscura (a small headless browser, no browser download, quick to start), on the project\'s own browser (Chrome), or on both: Obscura first, Chrome taking over when a test fails there. Each is optional.'));
    const o = await askYesNo('Run the Playwright suite on Obscura?', false);
    const c = await askYesNo('Run the Playwright suite on the project\'s own browser (Chrome)?', false);
    args.e2eDriver = o && c ? 'both' : o ? 'obscura' : c ? 'chrome' : 'none';
}
async function askExternals(args) {
    if (args.external !== undefined || autoYes)
        return;
    let offer = [];
    try {
        offer = ext.loadRegistry().filter((r) => r.optIn && r.fetch !== 'skill' && (!r.platform || r.platform === process.platform) && !ext.detect(r).present && !(r.id === 'obscura' && /obscura|both/.test(args.e2eDriver || '')));
    }
    catch {
        return;
    }
    const pick = [];
    for (const r of offer) {
        console.log(dim(`${r.name} (${r.licence}, ${r.repo}): installed once for the whole machine (skipped if it is already there), fetched from its authors, hash-checked, kept in ~/.ai-dev-kit/external/ and never bundled in this kit. Used for: ${r.usedBy.join(', ')}.`));
        if (await askYesNo(`Fetch ${r.name} now?`, false))
            pick.push(r.id);
    }
    if (pick.length)
        args.external = pick;
}
// Which outside models may do a job so Claude spends fewer tokens. Tick any; scripts try them in a fixed order and Claude is the
// last step. --yes ticks nothing (no network, nothing leaves the machine), the same rule the old reviewer question had.
const AI_TITLES = {
    code: 'Free script scan -- no AI; runs on every edit of UI code and finds the hidden-state patterns',
    ollama: 'Ollama -- a model on this machine; nothing leaves it',
    kaggle: 'Kaggle GPU -- your own notebook over a tunnel (needs LOCAL_LLM_URL; the text leaves this machine, secrets masked)',
    unified: 'Unified API -- the free router (needs UNIFIED_API_KEY; the text leaves this machine, secrets masked; free tiers may keep inputs)',
};
async function askBackends(args, feature, intro, message, offer) {
    const wants = (s) => { const t = parseSkillToken(s); return t.name === AI_NEEDS[feature] && (feature !== 'image' || !t.only || t.only.has('image-gen')); };
    if (args.ai?.[feature] !== undefined || !args.skills.some(wants))
        return;
    if (autoYes)
        return;
    console.log(dim(intro));
    const picked = await askMultiselect(message, offer.map((b) => ({ title: AI_TITLES[b].replace(/ -- (.*)$/, (_m, d) => ` ${dim('-- ' + d)}`), value: b })));
    args.ai = { ...args.ai, [feature]: exports.AI_BACKENDS.filter((b) => picked.includes(b)) };
}
const askReviewer = (args) => askBackends(args, 'review', 'Hidden-state bugs: the free scan needs no model. Models can also read the files, so Claude spends no tokens on them; they are tried in the order listed, then Claude. Models other than Ollama send the file off this machine. With only models ticked, a model reads every edited UI file (slower). Nothing ticked: the free scan only.', 'Who reads your UI code for hidden-state bugs? (Space to tick, Enter to confirm)', ['code', 'ollama', 'kaggle', 'unified']);
const askGoldfish = (args) => askBackends(args, 'goldfish', 'Goldfish plan review: fresh reviewers read a plan before it runs. By default Claude does it itself. Tick models to run the five stages on them instead (free, slower); they are tried in the order listed, then Claude. The plan text leaves this machine for Kaggle and Unified.', 'Who runs the goldfish plan review? (Space to tick, Enter to confirm)', ['ollama', 'kaggle', 'unified']);
const askImageGen = (args) => askBackends(args, 'image', 'Image generation: a model makes your site images, not Claude, so no Claude tokens are spent. Only the Unified API makes images here; your prompt goes to it. Nothing ticked: a labelled placeholder instead of an image.', 'May the Unified API generate your site images? (Space to tick, Enter to confirm)', ['unified']);
const askCoding = (args) => askBackends(args, 'coding', 'Coding tasks from a finished plan: a model writes the files, Claude plans and reviews, so Claude spends far fewer tokens. Kaggle GPU: your own notebook, free about 30 hours a week, 5 minutes to start. Unified API: the free router from this machine, no setup beyond the key. Both are tried in that order, then Claude. The plan text leaves this machine, secrets masked. Nothing ticked: Claude writes the code.', 'Who writes the code for your plans? (Space to tick, Enter to confirm)', ['kaggle', 'unified']);
const askTests = (args) => askBackends(args, 'tests', 'Test runs: a script runs your tests and Claude sees only a short digest. A model can first condense a long failure digest (free, slower), but only for a log with 5 or fewer distinct errors, which is rare: the digest is already grouped by cause. The ticked ones are tried in the order listed, then Claude. Kaggle and Unified send the digest off this machine, secrets masked. Nothing ticked: Claude only.', 'Who condenses long test-failure digests? (Space to tick, Enter to confirm)', ['ollama', 'kaggle', 'unified']);
async function askSignature(args) {
    if (args.signature !== undefined)
        return;
    let hint = '';
    const dir = company.companyDir(args.root);
    const src = args.companyFrom ? path.resolve(args.companyFrom) : dir;
    const h = fs.existsSync(src) ? company.detectSignature(company.scanCompany(src).docs, src) : null;
    if (h)
        hint = ` Your company docs use "${h.alias}"; you can use it or pick another.`;
    console.log(dim('A signature is a short alias that watermarks the code you write to the standards: abc- classes and ids, data-abc- data attributes, Abc shared components. It applies to your own code only, never to packages or libraries.' + hint));
    for (;;) {
        const v = (await askText('Project signature (2 to 6 letters, or press Enter for none)', '')).trim();
        if (v === '') {
            args.signature = 'none';
            return;
        }
        try {
            sig.normalizeAlias(v);
            args.signature = v;
            return;
        }
        catch (e) {
            console.log(yellow(e.message));
        }
    }
}
function printCompany(r) {
    console.error(bold(`Company standards: ${r.files} files (~${r.tokens} tokens), ${r.routes} routes imported, defaults: ${r.mode}`));
    if (r.findings) {
        for (const f of r.findings)
            console.error(`  ${f.drop ? yellow('drop') : green('keep')}  ${f.label.padEnd(24)} ${dim(f.reason)}`);
        for (const line of r.disclaimer || [])
            console.error(dim('  ' + line));
    }
    for (const n of r.notes)
        console.error(yellow('  note: ' + n));
}
// Copy of the answers so far, so a step can be undone exactly (the arrays are copied, not shared).
function snapshotArgs(a) {
    return { ...a, skills: [...a.skills], activeStandardsKeys: a.activeStandardsKeys ? [...a.activeStandardsKeys] : undefined, ai: a.ai ? { ...a.ai } : undefined };
}
// Runs the questions one step at a time. A step that asked nothing (its answer came from a flag) is passed over in both
// directions; going back restores the answers exactly as they were before the step being returned to.
async function runSteps(args, steps) {
    const snaps = [];
    const asked = [];
    let i = 0;
    // Restores the answers exactly as they were before step j, and forgets the log lines from j on (they are asked again).
    const rewind = (j) => {
        for (const k of Object.keys(args))
            delete args[k];
        Object.assign(args, snaps[j]);
        asked.length = j;
        for (let k = answerLog.length - 1; k >= 0; k--)
            if (answerLog[k].step >= j)
                answerLog.splice(k, 1);
        i = j;
    };
    stepTotal = steps.length;
    for (;;) {
        while (i < steps.length) {
            snaps[i] = snapshotArgs(args);
            canGoBack = asked.slice(0, i).some(Boolean);
            stepNo = i + 1;
            const before = askCount;
            try {
                await steps[i]();
                asked[i] = askCount > before;
                i++;
            }
            catch (e) {
                if (!(e instanceof BackSignal))
                    throw e;
                let j = i - 1;
                while (j >= 0 && !asked[j])
                    j--;
                if (j < 0) {
                    i = 0;
                    continue;
                }
                rewind(j);
                console.log(dim('Back one step.'));
            }
        }
        // Summary screen: nothing has been written yet. Install, change one answer (its step is asked again, the other
        // answers stay pre-selected), or cancel.
        if (autoYes || !useMenus() || !answerLog.length)
            return;
        const io = menuIO();
        console.log(bold('\nYour answers:'));
        for (const e of answerLog)
            console.log(`  ${e.q}  ${cyan(e.a)}`);
        const what = await select.runMenu(io, { header: 'Review', question: 'Ready to write the files?', items: [{ title: 'Install' }, { title: 'Change an answer' }, { title: 'Cancel (nothing is written)' }], canBack: false, initial: [0] });
        const pick = what.kind === 'pick' ? what.picked[0] : 0;
        if (pick === 0)
            return;
        if (pick === 2)
            throw new select.QuitSignal('cancel');
        const which = await select.runMenu(io, { header: 'Review', question: 'Which answer?', items: answerLog.map((e) => ({ title: e.q.slice(0, 70), hint: e.a })), canBack: true, initial: [0] });
        if (which.kind === 'pick')
            rewind(answerLog[which.picked[0]].step);
    }
}
async function fillInteractive(cmd, args) {
    autoYes = !!args.yes;
    if (args.json || (!isInteractive() && !autoYes))
        return;
    canGoBack = false;
    askCount = 0;
    backTipShown = false;
    stepNo = 0;
    stepTotal = 0;
    keysShown = false;
    memory.clear();
    memOrder.length = 0;
    answerLog.length = 0;
    try {
        const steps = [];
        if (['list', 'install', 'update', 'merge-hooks', 'company'].includes(cmd) && !args.library) {
            steps.push(async () => { if (!args.library)
                args.library = await askText('Path to the ai-dev-kit library', defaultLibraryGuess()); });
        }
        if (['install', 'update', 'uninstall', 'archive', 'unarchive', 'merge-hooks', 'company', 'signature'].includes(cmd) && !args.root) {
            steps.push(async () => { if (!args.root)
                args.root = await resolveRoot(); });
        }
        if (cmd === 'company' && (args.companyAction || 'sync') === 'sync')
            steps.push(() => askCompany(args, false));
        if (cmd === 'install') {
            steps.push(async () => {
                if (!args.tool) {
                    const evidence = detectToolEvidence(args.root);
                    const tools = Object.keys(ROOTS);
                    const choices = tools.map((t) => ({ title: evidence[t] ? `${t}  ${green('— ' + evidence[t])}` : t, value: t }));
                    const detectedIndex = tools.findIndex((t) => evidence[t]);
                    args.tool = await askSelect('Target tool:', choices, detectedIndex >= 0 ? detectedIndex : 0);
                }
            });
            steps.push(async () => {
                if (!args.skills.length) {
                    const catalog = listSkills(args.library);
                    const purposes = loadSkillPurposes(args.library);
                    const standard = Array.from(new Set([...UNIVERSAL_SKILLS, ...exports.ARCHIVABLE_SKILLS])).filter((n) => catalog[n]);
                    const detected = detectStackSignals(args.root, args.tool).filter((d) => catalog[d.name]);
                    const autoStats = detected.length
                        ? `${standard.length} standard skills + ${detected.length} matched to this project`
                        : `${standard.length} standard skills, no framework match found here`;
                    const mode = await askSelect('Skills to install:', [
                        { title: `Auto-detect ${green('(recommended)')} ${dim('-- ' + autoStats)}`, value: 'auto' },
                        { title: `Everything ${dim('-- every skill in the library (addons/MCP/mods stay opt-in, asked separately)')}`, value: 'everything' },
                        { title: 'Pick individually from the full catalog', value: 'pick' },
                    ], 0);
                    if (mode === 'everything') {
                        args.skills = eligibleCatalogNames(catalog);
                    }
                    else if (mode === 'pick') {
                        args.skills = await pickSkillsByCategory(catalog, purposes);
                    }
                    else {
                        let extra = detected.map((d) => d.name);
                        if (detected.length) {
                            console.log(green('Matched to this project:'));
                            for (const d of detected) {
                                const purpose = purposes[d.name];
                                console.log(purpose ? `  ${d.name} ${dim(purpose)}  ${green('(' + d.evidence + ')')}` : `  ${d.name} ${green('(' + d.evidence + ')')}`);
                            }
                        }
                        else {
                            const presetEntries = Object.entries(exports.STACK_PRESETS);
                            const presetChoice = await askSelect('No framework signal detected -- pick a stack preset instead?', [
                                ...presetEntries.map(([key, p]) => ({ title: p.label, value: key })),
                                { title: `None ${dim('-- just the standard set')}`, value: 'none' },
                            ], presetEntries.length);
                            const preset = exports.STACK_PRESETS[presetChoice];
                            if (preset) {
                                extra = preset.skills.filter((n) => catalog[n]);
                                if (preset.gap)
                                    console.log(yellow(`Note: ${preset.gap}`));
                            }
                        }
                        args.skills = Array.from(new Set([...standard, ...extra]));
                        if (await askYesNo('Add any other skills on top of this set?', false)) {
                            const picked = await pickSkillsByCategory(catalog, purposes, new Set(args.skills));
                            args.skills = Array.from(new Set([...args.skills, ...picked]));
                        }
                    }
                }
            });
            steps.push(() => askCompany(args, true));
            steps.push(() => askSignature(args));
            steps.push(async () => {
                if (args.company && args.companyDefaults === 'drop')
                    args.standards = false;
                else if (args.company && args.companyDefaults && args.standards === undefined)
                    args.standards = true; // keep or auto: the defaults were chosen in the company question
                if (args.standards === undefined) {
                    args.standards = await askYesNo(args.company ? 'Install the default coding-standards too (company rules win where they conflict)?' : 'Install the coding-standards system too?', false);
                }
            });
            steps.push(async () => {
                if (!args.standards)
                    return;
                if (!args.scriptStandard) {
                    const pkg = readJsonSafe(path.join(args.root, 'package.json'));
                    const looksTs = fs.existsSync(path.join(args.root, 'tsconfig.json')) || hasDependency(pkg, 'typescript');
                    args.scriptStandard = await askSelect('Script standard for this project (index.md: exactly one applies):', [
                        { title: 'TypeScript only', value: 'ts' },
                        { title: 'JavaScript only', value: 'js' },
                        { title: 'JS and TS together', value: 'js-and-ts' },
                    ], looksTs ? 0 : 1);
                }
            });
            steps.push(async () => {
                if (!args.standards)
                    return;
                if (!args.activeStandardsKeys) {
                    const choices = Object.entries(exports.STANDARD_ROW_LABELS).map(([key, label]) => ({ title: label, value: key }));
                    args.activeStandardsKeys = await askMultiselect("Which of these apply to this project? Most projects keep all of them -- deselect only what genuinely doesn't apply (its row is then removed from the Active Standards table, not just left unchecked):", choices, { defaultAll: true });
                }
            });
            steps.push(async () => {
                if (args.skills.some((s) => parseSkillToken(s).name === 'comment-style') && !args.commentStyleLevel) {
                    args.commentStyleLevel = await askSelect('Comment style:', [
                        { title: `none ${green('(recommended)')} ${dim('— no comments except rule-mandated ones')}`, value: 'none' },
                        { title: `terse ${dim('— one short line, only when the why is non-obvious')}`, value: 'terse' },
                        { title: `descriptive ${dim('— up to 3 short plain-language lines for tricky parts')}`, value: 'descriptive' },
                    ], 0);
                }
            });
            steps.push(async () => {
                if (!(args.standards || args.company) || args.existingProtocol)
                    return;
                const found = findExistingProtocols(args.root, ROOTS[args.tool]?.protocol || 'CLAUDE.md');
                if (!found.length)
                    return;
                args.existingProtocol = await askSelect(path.basename(found[0]) + ' already exists in this project:', [
                    { title: 'Replace it with the kit protocol ' + green('(recommended)') + ' ' + dim('— old copy saved as .bak'), value: 'replace' },
                    { title: 'Append the kit protocol to the existing file ' + dim('— keeps your content'), value: 'append' },
                ], 0);
            });
            steps.push(async () => {
                // RULE AI-01 belongs to every standards path (defaults, company, both): the company-only path gets its own CX block.
                if ((args.standards || args.company) && !args.contextCode) {
                    const suggestion = randomContextCode();
                    args.contextCode = await askText(`Context code (2-4 chars, or "none")`, suggestion);
                }
            });
            // last, so the questions above keep their order; the answer only writes a small file in the home folder
            steps.push(() => askReviewer(args));
            steps.push(() => askGoldfish(args));
            steps.push(() => askTests(args));
            steps.push(() => askImageGen(args));
            steps.push(() => askCoding(args));
            steps.push(() => askUsage(args));
            steps.push(() => askE2eDriver(args, args.skills.some((s) => /^e2e-scaffold(\b|:)/.test(s)) || !!(0, skill_scope_move_1.readManifest)(args.root).skills['e2e-scaffold']));
            steps.push(() => askExternals(args));
        }
        if (['update', 'uninstall', 'archive', 'unarchive'].includes(cmd) && !args.all && !args.skills.length) {
            steps.push(async () => {
                const manifest = (0, skill_scope_move_1.readManifest)(args.root);
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
            });
        }
        await runSteps(args, steps);
    }
    catch (e) {
        if (!(e instanceof select.QuitSignal))
            throw e;
        console.log('\nCancelled. Nothing was written.');
        process.exit(130); // no fetch is open here, so exit() is safe
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
        else if (k === '--remove-hooks')
            a.removeHooks = true;
        else if (k === '--no-commands')
            a.noCommands = true;
        else if (k === '--keep-active')
            a.keepActive = true;
        else if (k === '--yes' || k === '-y')
            a.yes = true;
        else if (k === '--reviewer') {
            const v = argv[++i];
            if (v !== 'auto' && v !== 'ollama' && v !== 'static') {
                console.error(red('error: --reviewer must be auto, ollama or static'));
                process.exit(2);
            }
            a.ai = { ...a.ai, review: v === 'static' ? ['code'] : ['code', 'ollama'] };
        } // legacy: auto used to try Gemini first
        else if (k === '--ai') {
            const v = parseAiFlag(argv[++i]);
            if (!v) {
                console.error(red('error: --ai must look like review=code+ollama, goldfish=unified, tests=ollama+unified, image=unified or coding=kaggle+unified (backends: code, ollama, kaggle, unified; none for an empty list)'));
                process.exit(2);
            }
            a.ai = { ...a.ai, [v.feature]: v.list };
        }
        else if (k === '--script-standard')
            a.scriptStandard = argv[++i];
        else if (k === '--active-standards') {
            const v = argv[++i];
            a.activeStandardsKeys = v === 'all' ? undefined : v === 'none' ? [] : v.split(',').filter(Boolean);
        }
        else if (k === '--comment-style-level')
            a.commentStyleLevel = argv[++i];
        else if (k === '--context-code')
            a.contextCode = argv[++i];
        else if (k === '--agent-ready')
            a.agentReady = true;
        else if (k === '--existing-protocol') {
            const v = argv[++i];
            if (v !== 'replace' && v !== 'append' && v !== 'keep') {
                console.error(red('error: --existing-protocol must be replace, append or keep'));
                process.exit(2);
            }
            a.existingProtocol = v;
        }
        else if (k === '--apply-migrations') {
            const v = argv[++i];
            a.applyMigrations = v === 'all' ? 'all' : v.split(',').filter(Boolean);
        }
        else if (k === '--company')
            a.company = true;
        else if (k === '--company-from') {
            a.companyFrom = argv[++i];
            a.company = true;
        }
        else if (k === '--company-defaults') {
            const v = argv[++i];
            if (v !== 'keep' && v !== 'drop' && v !== 'auto') {
                console.error(red('error: --company-defaults must be keep, drop or auto'));
                process.exit(2);
            }
            a.companyDefaults = v;
            a.company = true;
        }
        else if (k === '--signature')
            a.signature = argv[++i];
        else if (k === '--usage' || k === '--usage-notify') {
            const v = argv[++i];
            if (v !== 'on' && v !== 'off') {
                console.error(red(`error: ${k} must be on or off`));
                process.exit(2);
            }
            if (k === '--usage')
                a.usage = v;
            else
                a.usageNotify = v;
        }
        else if (k === '--e2e-driver') {
            const v = argv[++i] || '';
            try {
                parseE2eDriver(v);
            }
            catch (e) {
                console.error(red('error: ' + e.message));
                process.exit(2);
            }
            a.e2eDriver = v;
        }
        else if (k === '--external')
            a.external = (argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
        else if (k === '--web-search-sift') {
            const v = argv[++i];
            if (v !== 'router' && v !== 'off') {
                console.error(red('error: --web-search-sift must be router or off'));
                process.exit(2);
            }
            a.webSearchSift = v;
        }
        else if (k === '--web-search') {
            const v = argv[++i];
            if (v !== 'on' && v !== 'off') {
                console.error(red('error: --web-search must be on or off'));
                process.exit(2);
            }
            a.webSearch = v;
        }
        else if (k === '--web-digest') {
            const v = argv[++i];
            if (v !== 'on' && v !== 'off') {
                console.error(red('error: --web-digest must be on or off'));
                process.exit(2);
            }
            a.webDigest = v;
        }
        else if (k === '--batch') {
            const v = argv[++i];
            if (v !== 'on' && v !== 'off') {
                console.error(red('error: --batch must be on or off'));
                process.exit(2);
            }
            a.batch = v;
        }
        else if (k === '--purge-company' || k === '--purge')
            a.purgeCompany = true;
        else if (k === '--dry-run')
            a.dryRun = true;
        else if (k === '--force')
            a.force = true;
        else if (k === '--json')
            a.json = true;
        // An unknown flag used to be dropped silently, so a mistyped or unsupported one (--dry-run) ran the real install.
        else if (k.startsWith('-')) {
            console.error(red(`error: unknown option ${k}`));
            process.exit(2);
        }
    }
    return a;
}
async function main() {
    const cmd = process.argv[2];
    const args = parseArgs(process.argv);
    if (cmd === 'company' && process.argv[3] && !process.argv[3].startsWith('-'))
        args.companyAction = process.argv[3];
    if (cmd === 'signature') {
        args.signatureAction = process.argv[3];
        if (process.argv[4] && !process.argv[4].startsWith('-'))
            args.signature = process.argv[4];
    }
    let res;
    try {
        await fillInteractive(cmd, args);
        if (['uninstall', 'archive', 'unarchive'].includes(cmd) && !args.all && !args.skills.length) {
            console.error(red(`${cmd} needs --skills a,b or --all`));
            process.exit(2);
            return;
        }
        // A dry run that quietly became a real run is the worst failure here: only `company` implements --dry-run, so refuse it elsewhere.
        if (args.dryRun && cmd !== 'company' && cmd !== 'signature') {
            console.error(red('error: --dry-run is supported by the company and signature commands only'));
            process.exit(2);
            return;
        }
        if (cmd === 'company' && !args.root) {
            console.error(red('usage: install-kit.cli.js company <sync|remove|status> --root <target> [--company-from <folder>] [--company-defaults keep|drop|auto] [--force] [--dry-run] [--purge]'));
            process.exit(2);
            return;
        }
        if (cmd === 'signature') {
            const action = args.signatureAction;
            if (!args.root || !['set', 'remove', 'show'].includes(action || '') || (action === 'set' && !args.signature)) {
                console.error(red('usage: install-kit.cli.js signature <set <alias>|remove|show> --root <target> [--dry-run]'));
                process.exit(2);
                return;
            }
            if (action === 'show')
                res = sig.showSignature(args.root);
            else {
                res = sig.setSignature(args.root, action === 'remove' ? 'none' : args.signature, args.dryRun);
                if (!args.dryRun) {
                    const m = (0, skill_scope_move_1.readManifest)(args.root);
                    if (m.company) {
                        company.refreshCompany(args.root, m);
                        (0, skill_scope_move_1.writeManifest)(args.root, m);
                    }
                }
            }
        }
        else if (cmd === 'company') {
            const action = args.companyAction || 'sync';
            if (action === 'sync')
                res = company.doCompanySync({ library: args.library, root: args.root, tool: args.tool, companyFrom: args.companyFrom, companyDefaults: args.companyDefaults, dryRun: args.dryRun, force: args.force });
            else if (action === 'remove')
                res = company.doCompanyRemove({ library: args.library || (() => { try {
                        return defaultLibraryGuess();
                    }
                    catch {
                        return undefined;
                    } })(), root: args.root, purge: args.purgeCompany, dryRun: args.dryRun });
            else if (action === 'status')
                res = company.companyStatus(args.root);
            else {
                console.error(red('usage: install-kit.cli.js company <sync|remove|status> --root <target> [--company-from <folder>] [--company-defaults keep|drop|auto] [--purge]'));
                process.exit(2);
                return;
            }
            if (isInteractive() && !args.json && action === 'sync')
                printCompany(res);
        }
        else if (cmd === 'mods') {
            if (!args.root) {
                console.error(red('usage: install-kit.cli.js mods --root <target> [--library <kit>] [--batch on|off] [--web-digest on|off] [--web-search on|off] [--web-search-sift router|off]'));
                process.exit(2);
                return;
            }
            res = { batch: batchMod(args.root, args.library, Object.keys((0, skill_scope_move_1.readManifest)(args.root).skills).includes('session-budget'), args.batch), webDigest: webDigestMod(args.root, args.library, Object.keys((0, skill_scope_move_1.readManifest)(args.root).skills), args.webDigest), webSearch: webSearchMod(args.root, args.library, Object.keys((0, skill_scope_move_1.readManifest)(args.root).skills), args.webSearch), webSearchSift: args.webSearchSift ? setWebSearchSift(args.webSearchSift) : undefined };
        }
        else if (cmd === 'list')
            res = listSkills(args.library);
        else if (cmd === 'install')
            res = doInstall(args);
        else if (cmd === 'update')
            res = doUpdate(args);
        else if (cmd === 'archive')
            res = (0, skill_scope_move_1.doArchive)(args);
        else if (cmd === 'unarchive')
            res = (0, skill_scope_move_1.doUnarchive)(args);
        else if (cmd === 'uninstall')
            res = doUninstall(args);
        else if (cmd === 'merge-hooks')
            res = doMergeHooks(args);
        else {
            console.error(red('usage: install-kit.cli.js <list|install|update|uninstall|archive|unarchive|merge-hooks|company|signature|mods> [options]'));
            process.exit(2);
            return;
        }
    }
    catch (e) {
        console.error(red('error: ' + e.message));
        process.exit(1);
        return;
    }
    console.log(JSON.stringify(res, null, 2));
    const vr = res.verify;
    const um = res.usage;
    if (um && um.mod === 'failed')
        console.error(red('feature-usage mod NOT installed (the commands to run by hand are in the message above).'));
    if (vr && !vr.ok) {
        // A skills-only install (no --standards) has no protocol file by choice, so that one finding is not an exit-code failure; every other fail is.
        const standardsAsked = !!res.standards;
        const hard = vr.findings.filter((x) => x.level === 'fail' && (x.check !== 'session-protocol' || standardsAsked));
        for (const f of hard)
            console.error(red(`verify FAILED ${f.check}: ${f.message}`));
        if (hard.length)
            process.exitCode = 1;
    }
    const ex = res.externals;
    if (ex && !ex.ok) {
        for (const f of ex.fetched.filter((x) => !x.ok))
            console.error(red(`external ${f.id} FAILED: ${f.error}`));
        process.exit(1);
    }
    if (ex)
        for (const f of ex.fetched.filter((x) => x.ok && x.already))
            console.error(`${f.id} is already installed on this machine (${f.path}); nothing to fetch`);
    if (ex)
        for (const c of ex.credits)
            console.error('credit: ' + c);
    if (ex)
        for (const f of ex.fetched.filter((x) => x.ok && x.note && !x.already))
            console.error(`next (${f.id}): ${f.note}`);
    if (um && um.mod === 'failed')
        process.exitCode = 1;
}
if (require.main === module)
    void main();
