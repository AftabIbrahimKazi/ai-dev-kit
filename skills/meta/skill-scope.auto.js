"use strict";
// Automatic half of skill-scope: archives every per-session-archivable skill, then restores the ones the
// stated task names. Run by the /next command and by the session hooks, so nobody has to remember it.
//
//   node skill-scope.auto.js apply  [--root <target>] [--keep a,b] [--add-only] [--quiet] [--dry-run] [--json] [task words...]
//   node skill-scope.auto.js status [--root <target>] [--json]
//   node skill-scope.auto.js run <skill> <script> [args...]
//
// run: restores <skill> if it is archived, then runs <skill>/<script> with the remaining arguments and its exit code.
// Slash commands for archivable skills call this, so they work whether or not a hook has restored the skill yet.
// It finds the project from its own location (<project>/<tool-dir>/skills/skill-scope/), not from the current folder.
//
// apply: with no --task, every archivable skill is archived (the session-start default). With a task, a
// skill whose trigger words appear in it is restored; the rest are archived. --keep forces skills on.
// --add-only restores matches and archives nothing (the per-prompt hook, so a later vague message never
// archives what an earlier one loaded). --quiet prints only when a skill was restored (hook output enters
// the model's context, so silence is the default cost). The archivable set and the trigger words live in skill-scope.triggers.json, the single source.
// Moves skills only through install-kit.cli's archive/unarchive, so it never touches a folder the kit did
// not install. No network. Exit codes: 0 done, 1 error, 2 bad usage.
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
exports.loadTriggers = loadTriggers;
exports.matchSkills = matchSkills;
exports.plan = plan;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
// Installed, companions lose the skill prefix (move.js, triggers.json); in the library they keep it.
function sibling(installed, library, load) {
    const p = path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library);
    return load(p);
}
const { doArchive, doUnarchive, readManifest, writeManifest } = sibling('move.js', 'skill-scope.move.js', (p) => require(p));
function loadTriggers(file) {
    return JSON.parse(fs.readFileSync(file ?? sibling('triggers.json', 'skill-scope.triggers.json', (p) => p), 'utf8'));
}
// 'word' is a whole word (plural s/es allowed); 'word*' is any word starting with it.
function triggerRegex(t) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return t.endsWith('*')
        ? new RegExp('(?<![a-z0-9])' + esc(t.slice(0, -1)), 'i')
        : new RegExp('(?<![a-z0-9])' + esc(t) + '(?:e?s)?(?![a-z0-9])', 'i');
}
function isLocked(l, root) {
    if (!root)
        return false;
    return l.files.some((f) => {
        try {
            return fs.readFileSync(path.join(root, f), 'utf8').toLowerCase().includes(l.contains.toLowerCase());
        }
        catch {
            return false;
        }
    });
}
function activeTriggers(e, root) {
    if (Array.isArray(e))
        return e;
    return e.locked && isLocked(e.locked, root) ? e.locked.triggers : e.triggers;
}
function matchSkills(task, triggers, root) {
    return Object.keys(triggers.skills).filter((name) => activeTriggers(triggers.skills[name], root).some((t) => triggerRegex(t).test(task)));
}
// Pure: decides what moves, given what is installed and archived right now.
function plan(task, forced, triggers, installed, archived, root) {
    const wanted = new Set([...matchSkills(task, triggers, root), ...forced]);
    const set = Object.keys(triggers.skills);
    return {
        archive: set.filter((n) => installed.includes(n) && !wanted.has(n)),
        restore: set.filter((n) => archived.includes(n) && wanted.has(n)),
        keep: set.filter((n) => installed.includes(n) && wanted.has(n)),
        loaded: set.filter((n) => wanted.has(n) && (installed.includes(n) || archived.includes(n))),
    };
}
function parseArgs(argv) {
    const a = { task: '', keep: [], dryRun: false, json: false, addOnly: false, quiet: false };
    const [cmd, ...rest] = argv;
    if (cmd !== 'apply' && cmd !== 'status')
        return null;
    a.cmd = cmd;
    for (let i = 0; i < rest.length; i++) {
        const f = rest[i];
        if (f === '--root')
            a.root = rest[++i];
        else if (f === '--task')
            a.task = rest[++i] ?? '';
        else if (f === '--keep')
            a.keep = (rest[++i] ?? '').split(',').filter(Boolean);
        else if (f === '--dry-run')
            a.dryRun = true;
        else if (f === '--json')
            a.json = true;
        else if (f === '--add-only')
            a.addOnly = true;
        else if (f === '--quiet')
            a.quiet = true;
        else if (f.startsWith('--'))
            return null;
        else
            a.task = (a.task + ' ' + f).trim();
    }
    // /next passes "tsk-note" or "tsk-start" first; the mode word is for the command, never a trigger word.
    a.task = a.task.replace(/^(?:tsk-note|tsk-start)\b\s*/i, '');
    return a;
}
// Installed layout: <project>/<tool-dir>/skills/skill-scope/auto.js, so two levels up is the skill root's parent.
function runSkillScript(argv) {
    const [skill, script, ...rest] = argv;
    if (!skill || !script || !/^[a-z0-9-]+$/.test(skill) || !/^[A-Za-z0-9._-]+$/.test(script)) {
        console.error('usage: skill-scope.auto.js run <skill> <script> [args...]');
        process.exitCode = 2;
        return;
    }
    const skillRoot = path.dirname(__dirname);
    const project = path.dirname(path.dirname(skillRoot));
    try {
        const manifest = readManifest(project);
        if (manifest.archived[skill])
            doUnarchive({ root: project, skills: [skill], by: 'auto' });
        const file = path.join(skillRoot, skill, script);
        if (!fs.existsSync(file))
            throw new Error(skill + '/' + script + ' is not installed in this project (looked in ' + path.join(skillRoot, skill) + ')');
        const r = (0, node_child_process_1.spawnSync)(process.execPath, [file, ...rest], { stdio: 'inherit' });
        process.exitCode = r.status ?? 1;
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
// Manual control and reporting. Code does the work and prints a few short lines; the model only relays them.
//   list                     what is active, archived (with trigger words) and how to bring one back
//   add <names...>           restore archived skills now (the model then reads each SKILL.md)
//   drop <names...>          archive skills now (archivable set only, so a pinned skill is never moved)
//   wrap <next task words>   what /wrap-up runs: applies the task if one was given, otherwise moves nothing
//   report [--mark]          moves since the last wrap-up; --mark starts the next window (run by /wrap-up)
function manualCmd(cmd, rest) {
    const ri = rest.indexOf('--root');
    const root = ri >= 0 ? rest[ri + 1] : fs.existsSync(path.join(process.cwd(), '.ai-dev-kit.json')) ? process.cwd() : path.dirname(path.dirname(path.dirname(__dirname)));
    const names = rest.filter((x, i) => !x.startsWith('--') && rest[i - 1] !== '--root');
    try {
        const manifest = readManifest(root);
        if (!manifest.tool)
            throw new Error('no install manifest at ' + path.join(root, '.ai-dev-kit.json') + ' -- run install-kit first');
        const trig = loadTriggers().skills;
        const set = Object.keys(trig);
        if (cmd === 'wrap') {
            // /wrap-up with a next task: archive what it does not need, restore what it does. No task, no move.
            if (!names.length) {
                console.log('no next task given: no skills moved');
                return;
            }
            const p = plan(names.join(' '), [], loadTriggers(), Object.keys(manifest.skills), Object.keys(manifest.archived), root);
            if (p.archive.length)
                doArchive({ root, skills: p.archive, by: 'manual' });
            if (p.restore.length)
                doUnarchive({ root, skills: p.restore, by: 'manual' });
            console.log('next task: archived ' + p.archive.length + (p.restore.length ? ', restored ' + p.restore.join(', ') : '') + (p.loaded.length ? '; active for it: ' + p.loaded.join(', ') : ''));
            return;
        }
        if (cmd === 'list' || ((cmd === 'add' || cmd === 'drop') && !names.length)) {
            const arch = Object.keys(manifest.archived);
            const act = set.filter((n) => manifest.skills[n]);
            const words = (n) => {
                const e = trig[n];
                const w = Array.isArray(e) ? e : e ? e.triggers : [];
                return w.length ? ' [' + w.slice(0, 4).join('/') + ']' : '';
            };
            console.log('active, archivable (' + act.length + '): ' + (act.join(', ') || 'none'));
            console.log('archived (' + arch.length + '): ' + (arch.map((n) => n + words(n)).join(', ') || 'none'));
            console.log('bring one back with /unarchive <name>; the other skills are pinned and always active.');
            return;
        }
        if ((cmd === 'add' || cmd === 'drop') && names.length) {
            const unknown = names.filter((n) => !manifest.skills[n] && !manifest.archived[n]);
            if (unknown.length)
                console.log('not installed: ' + unknown.join(', '));
            if (cmd === 'add') {
                const r = doUnarchive({ root, skills: names.filter((n) => manifest.archived[n]), by: 'manual' });
                console.log(r.restored.length ? 'restored ' + r.restored.join(', ') + ' -- read ' + r.restored.map((n) => manifest.skillRoot + '/' + n + '/SKILL.md').join(', ') + ' now' : 'nothing to restore (already active or not installed)');
            }
            else {
                const ok = names.filter((n) => manifest.skills[n] && set.includes(n));
                const pinned = names.filter((n) => manifest.skills[n] && !set.includes(n));
                if (pinned.length)
                    console.log('pinned, not moved: ' + pinned.join(', '));
                const r = ok.length ? doArchive({ root, skills: ok, by: 'manual' }) : { archived: [] };
                console.log(r.archived.length ? 'archived ' + r.archived.join(', ') : 'nothing archived');
            }
            return;
        }
        const since = manifest.scopeMark ?? '';
        const ev = (manifest.scopeLog ?? []).filter((e) => e.t > since);
        const pick = (by, a) => [...new Set(ev.filter((e) => e.by === by && e.a === a).flatMap((e) => e.n))];
        const lines = [];
        if (pick('auto', 'restore').length)
            lines.push('restored by task words: ' + pick('auto', 'restore').join(', '));
        if (pick('manual', 'restore').length)
            lines.push('restored by you: ' + pick('manual', 'restore').join(', '));
        const am = pick('manual', 'archive');
        if (am.length)
            lines.push('archived by you: ' + (am.length > 6 ? am.length + ' skills (listed below)' : am.join(', ')));
        const arch = Object.keys(manifest.archived);
        lines.push('archived now (' + arch.length + '): ' + (arch.join(', ') || 'none'));
        console.log(lines.join('\n'));
        if (rest.includes('--mark')) {
            manifest.scopeMark = new Date().toISOString();
            writeManifest(root, manifest);
        }
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
function main() {
    if (['list', 'add', 'drop', 'report', 'wrap'].includes(process.argv[2])) {
        manualCmd(process.argv[2], process.argv.slice(3));
        return;
    }
    if (process.argv[2] === 'run') {
        runSkillScript(process.argv.slice(3));
        return;
    }
    const args = parseArgs(process.argv.slice(2));
    if (!args) {
        console.error('usage: skill-scope.auto.js apply|status [--root <target>] [--keep a,b] [--add-only] [--quiet] [--dry-run] [--json] [task words...]');
        process.exitCode = 2;
        return;
    }
    let root = args.root;
    if (!root) {
        if (!fs.existsSync(path.join(process.cwd(), '.ai-dev-kit.json'))) {
            console.error('error: no --root and no .ai-dev-kit.json in the current folder. Pass --root <target project>.');
            process.exitCode = 1;
            return;
        }
        root = process.cwd();
        if (!args.quiet)
            console.error('assumed --root ' + root);
    }
    try {
        const manifest = readManifest(root);
        if (!manifest.tool)
            throw new Error('no install manifest at ' + path.join(root, '.ai-dev-kit.json') + ' -- run install-kit first');
        const p = plan(args.task, args.keep, loadTriggers(), Object.keys(manifest.skills), Object.keys(manifest.archived), root);
        if (args.addOnly)
            p.archive = [];
        if (args.cmd === 'apply' && !args.dryRun) {
            const by = args.quiet || args.addOnly ? 'auto' : 'manual'; // /next types it; only a legacy hook passes --quiet
            if (p.archive.length)
                doArchive({ root, skills: p.archive, by });
            if (p.restore.length)
                doUnarchive({ root, skills: p.restore, by });
        }
        if (args.quiet && !p.restore.length)
            return;
        if (args.json)
            console.log(JSON.stringify({ dryRun: args.dryRun, ...p }));
        else
            console.log((args.dryRun || args.cmd === 'status' ? 'would archive ' : 'archived ') + p.archive.length +
                (p.restore.length ? ', restored ' + p.restore.join(', ') + ' (read ' + p.restore.map((n) => manifest.skillRoot + '/' + n + '/SKILL.md').join(', ') + ' now)' : '') + (p.loaded.length ? '; active for this task: ' + p.loaded.join(', ') : '; none active'));
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
if (require.main === module)
    main();
