#!/usr/bin/env node
"use strict";
// The /kit cheat sheet as code: which kit command fits a situation. With words it prints the single best command and one
// line on how to use it; with none it prints the whole table. Plain Node, no network, reads nothing.
//
//   node kit.js [situation words...]   best command for the situation, or the table when none is given
//   node kit.js --json [words...]      the same as one JSON document
//   node kit.js --list                 the table
//
// Scoring: each keyword that appears in the situation (whole word, plural s/es allowed, or a phrase) adds its length, so a
// specific phrase beats a loose word. A tie keeps the table order. No match prints the table and says so.
// Exit codes: 0 done, 2 bad usage.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROWS = void 0;
exports.score = score;
exports.best = best;
exports.table = table;
exports.ROWS = [
    { situation: 'Health check of the whole project', use: '`/audit` (optional: `--standard css,html`, a path)', keys: ['audit', 'health check', 'standards', 'lint the project', 'violations', 'code quality'] },
    { situation: 'About to commit', use: '`/commit-check` (optional: `--message "feat: x"`)', keys: ['commit', 'before commit', 'staged', 'stage', 'ready to commit', 'secrets in'] },
    { situation: 'Keep files out of the Changes tree', use: '`/untrack hide <paths>` (`show` to undo, `list` to see)', keys: ['untrack', 'stop tracking', 'hide files', 'changes tree', 'gitignore a tracked', 'hide from git'] },
    { situation: 'Session feels expensive', use: 'the mod\'s `/budget` (Claude Code)', keys: ['expensive', 'budget', 'tokens', 'cost', 'spend', 'usage'] },
    { situation: 'A noisy test or build run', use: '`/quiet npm test`', keys: ['noisy', 'quiet', 'verbose output', 'too much output', 'long output'] },
    { situation: 'Something fails, cause unknown', use: '`/debug-protocol <what happened>`', keys: ['fails', 'failing', 'broken', 'bug', 'crash', 'error', 'not working', 'cause unknown', 'debug'] },
    { situation: 'Big or many-file task', use: '`/plan-first <task>`', keys: ['big task', 'many files', 'refactor', 'migrate', 'migration', 'rewrite', 'plan first', 'large change'] },
    { situation: 'How long is this going to take', use: '`/eta`', keys: ['how long', 'eta', 'estimate', 'time left', 'duration'] },
    { situation: 'Vague request', use: '`/intent-capture <request>`', keys: ['vague', 'make it better', 'improve', 'not sure what', 'unclear request', 'polish'] },
    { situation: 'Start a session', use: '`/pickup`', keys: ['start a session', 'resume', 'pick up', 'pickup', 'continue where', 'new session', 'last session'] },
    { situation: 'End a session', use: '`/wrap-up` (optional: the next task)', keys: ['end a session', 'wrap up', 'wrap-up', 'handover', 'finish the session', 'done for today', 'hand over'] },
    { situation: 'Memory notes may be out of date', use: '`/stale`', keys: ['stale', 'out of date notes', 'memory notes', 'prune memory', 'old notes', 'outdated memory'] },
    { situation: 'Check or install git hooks', use: '`/githooks`', keys: ['git hooks', 'githooks', 'pre-commit hook', 'install hooks'] },
    { situation: 'Merge or rebase stopped with conflicts', use: '`/resolve-conflicts` (optional: `ours`, `theirs`, `step`, `--role backend`)', keys: ['conflict', 'conflicts', 'merge stopped', 'rebase stopped', 'cherry-pick', 'rebase', 'merge'] },
    { situation: 'Does this page work at every screen size', use: '`/responsive-check` (optional: `--range 600-900`, `--width 375`, `--detect`)', keys: ['responsive', 'screen size', 'breakpoint', 'viewport', 'mobile layout', 'every width', 'phone layout'] },
    { situation: 'A skill seems missing, or one is not needed', use: '`/unarchive <name>`, `/archive <name>` (no name lists what is archived)', keys: ['skill missing', 'archived', 'unarchive', 'archive a skill', 'skill not loaded', 'restore a skill'] },
    { situation: 'Queue the next task and load only its skills, without starting', use: '`/next tsk-note <task>`', keys: ['queue', 'next task', 'note the task', 'tsk-note', 'later task'] },
    { situation: 'Same, and start it now', use: '`/next tsk-start <task>`', keys: ['start it now', 'tsk-start', 'begin the task', 'start the next task'] },
    { situation: 'Bump a package version and its changelog entry', use: '`/version-bump <major|feature|patch|alpha|beta|rc|release>` (optional: a scope path, `--dry-run`)', keys: ['version', 'bump', 'release', 'changelog', 'semver'] },
    { situation: 'Images, video or fonts are too heavy', use: '`/optimize-assets` (optional: `convert src/img --to webp,avif`, `precompress dist`)', keys: ['images', 'image size', 'video', 'fonts', 'too heavy', 'compress', 'webp', 'avif', 'assets', 'optimize'] },
    { situation: 'Is the site heavy or slow to load', use: '`/perf` (optional: `--dist build`)', keys: ['slow', 'perf', 'performance', 'page weight', 'load time', 'bundle', 'lighthouse', 'heavy site', 'vitals'] },
    { situation: 'Set up Playwright end-to-end tests', use: '`/e2e status`, then `/e2e init` (optional: `--port 3100`, `--dry-run`)', keys: ['playwright', 'e2e', 'end-to-end', 'end to end', 'browser tests'] },
    { situation: 'Start a security audit with a map of the code', use: '`/recon`', keys: ['security', 'recon', 'attack surface', 'vulnerabilities', 'pentest', 'owasp', 'security audit'] },
    { situation: 'A project with requirement docs, brand notes or Figma', use: '`/ctx init`, then `/figma <export folder>` (opt-in add-on)', keys: ['figma', 'requirements', 'brand notes', 'design docs', 'project context', 'project-context'] },
    { situation: 'Turn an exported Figma SVG into HTML and CSS that matches it pixel for pixel', use: '`/figma-code build <file.svg> --download-fonts` (or no file if it is in `project-context/design/`), then `standards <dir>`, `adapt <dir>` (opt-in `figma-code` add-on, needs Chrome or Edge)', keys: ['svg to html', 'svg to code', 'figma to code', 'figma to html', 'pixel perfect', 'pixel match', 'pixel diff', 'convert the design', 'design to code', 'export to html'] },
    { situation: 'A diagram of the stack or folder structure, for a README or site', use: '`/diagram detect` (or `--structure`), then `/diagram build <spec>` (opt-in `diagram` add-on)', keys: ['diagram', 'architecture', 'folder structure', 'stack picture', 'draw the stack'] },
    { situation: 'A 3D simulator, cutaway or exploded view of a machine', use: '`/teardown detect --about "<the machine>"`, then `init <name>`, `check <dir>`, `sheet <dir>` (opt-in `teardown` add-on, uses Triforge)', keys: ['teardown', '3d', 'simulator', 'cutaway', 'exploded view', 'machine model', 'engine model'] },
    { situation: 'A video or a score for a simulator', use: '`/teardown-film film <dir> --preview`, `/teardown-sound sound <dir>` (opt-in add-ons on top of `teardown`)', keys: ['film', 'score', 'soundtrack', 'teardown video', 'teardown sound'] },
    { situation: 'Read answers aloud, mute or tune the voice', use: '`/narration mute|unmute|voice male|volume 80|speed 1.2|pitch 2` (opt-in `narrate` add-on)', keys: ['read aloud', 'narration', 'voice', 'mute', 'unmute', 'speak', 'volume', 'tts'] },
    { situation: 'Change how answers are worded for your skill level', use: '`/persona set female|male novice|mid|pro`, `/persona off` (opt-in `personality` add-on)', keys: ['persona', 'wording', 'skill level', 'novice', 'tone', 'personality'] },
    { situation: 'Change how answers are shaped', use: '`/format table|bullets|oneline|bool` (`/format reset` for the default)', keys: ['format', 'answer shape', 'as a table', 'bullets', 'one line', 'shorter answers'] },
    { situation: 'Set up or update a project', use: 'run `install-kit` from the ai-dev-kit repo; it removes its own copy from a project once setup verifies clean', keys: ['install', 'set up the kit', 'setup', 'update the kit', 'install-kit', 'new project'] },
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hit = (text, k) => new RegExp('(?<![a-z0-9])' + esc(k) + (/\s|-/.test(k) ? '' : '(?:e?s)?') + '(?![a-z0-9])', 'i').test(text);
function score(text, row) {
    return row.keys.reduce((n, k) => n + (hit(text, k) ? k.length : 0), 0);
}
function best(text) {
    let top = null;
    let topScore = 0;
    for (const r of exports.ROWS) {
        const s = score(text, r);
        if (s > topScore) {
            top = r;
            topScore = s;
        }
    }
    return top;
}
function table() {
    return ['| Situation | Use |', '|---|---|', ...exports.ROWS.map((r) => `| ${r.situation} | ${r.use} |`)].join('\n');
}
function main() {
    const a = process.argv.slice(2);
    const json = a.includes('--json');
    if (a.some((x) => x.startsWith('--') && x !== '--json' && x !== '--list')) {
        console.error('usage: kit.js [--json] [--list] [situation words...]');
        process.exitCode = 2;
        return;
    }
    const words = a.filter((x) => !x.startsWith('--')).join(' ').trim();
    const row = words && !a.includes('--list') ? best(words) : null;
    if (json) {
        console.log(JSON.stringify(row ? { match: row.situation, use: row.use } : { match: null, table: exports.ROWS.map((r) => ({ situation: r.situation, use: r.use })) }));
        return;
    }
    if (row) {
        console.log(`Best fit: ${row.use}\nFor: ${row.situation}.`);
        return;
    }
    if (words && !a.includes('--list'))
        console.log('No command matched that situation; the full table:\n');
    console.log(table());
    console.log('\nMost checks run without a command (mods and git hooks). Commands are for the moments you choose.');
}
if (require.main === module)
    main();
