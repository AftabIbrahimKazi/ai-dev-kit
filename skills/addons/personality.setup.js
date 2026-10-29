#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHOICES = void 0;
exports.parseArgs = parseArgs;
exports.install = install;
// Installs the personality add-on with exactly one persona. Eight choices: the six built-ins, none, or a custom one.
//
//   node personality.setup.js --install <choice> [--to <installed skill folder>] [--file my-persona.md]
// choice: female-novice | female-mid | female-pro | male-novice | male-mid | male-pro | none | custom
// --to    the installed skill folder, e.g. .claude/skills/personality (default: this folder, so nothing is copied).
//         It gets inject.js, SKILL.md if missing, and personas/<choice>.md; the other five personas are never installed.
// none:   installs nothing and clears any saved choice.
// custom: copies --file to ~/.claude/personas/custom.md, or writes a starter there to edit. A custom persona lives in
//         the user's folder, so kit updates never touch it.
// The saved choice goes to ~/.claude/personality.json. The SessionStart hook is a separate step (see personality.md).
// Exit 1 on a usage error.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const HOME = path.join(os.homedir(), '.claude');
const CONF = path.join(HOME, 'personality.json');
const CUSTOM = path.join(HOME, 'personas', 'custom.md');
const LIBRARY = path.join(__dirname, 'personality.personas');
const SIX = ['female-novice', 'female-mid', 'female-pro', 'male-novice', 'male-mid', 'male-pro'];
exports.CHOICES = [...SIX, 'none', 'custom'];
const posix = (p) => p.split(path.sep).join('/');
const STARTER = `# Your persona — one line on the voice

Voice: describe how replies should sound, in a sentence.

- Level: who is reading (novice, mid-level or professional developer) and how much jargon to use.
- Structure: how long, whether to lead with the result, when to use a list.
- Habits: phrases to use or avoid, how to handle uncertainty and bad news.
- Keep it under about 100 words: it is added to every session. Do not ask Claude to skip checks, hide errors or invent facts.

Example. Message: "The test fails because config.js has a bad path."
"Write the same message here in your persona's voice."
`;
function parseArgs(argv) {
    const o = { to: __dirname };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--install')
            o.choice = argv[++i];
        else if (a === '--to')
            o.to = path.resolve(argv[++i]);
        else if (a === '--file')
            o.file = path.resolve(argv[++i]);
        else
            throw new Error(`unknown option ${a}`);
    }
    if (!o.choice || !exports.CHOICES.includes(o.choice))
        throw new Error(`--install needs one of: ${exports.CHOICES.join(', ')}`);
    return o;
}
function copy(src, dest) {
    if (path.resolve(src) === path.resolve(dest))
        return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}
// the injector and its doc, into the installed addons folder
function copyCore(to) {
    if (to === __dirname)
        return;
    copy(path.join(__dirname, 'personality.inject.js'), path.join(to, 'inject.js'));
    if (!fs.existsSync(path.join(to, 'SKILL.md')))
        copy(path.join(__dirname, 'personality.md'), path.join(to, 'SKILL.md'));
}
function save(c) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(CONF, JSON.stringify(c, null, 2) + '\n');
}
function install(o) {
    if (o.choice === 'none') {
        try {
            fs.unlinkSync(CONF);
        }
        catch { /* nothing saved */ }
        return 'personality: none chosen, nothing installed';
    }
    copyCore(o.to);
    if (o.choice === 'custom') {
        fs.mkdirSync(path.dirname(CUSTOM), { recursive: true });
        if (o.file) {
            if (!fs.existsSync(o.file) || !fs.readFileSync(o.file, 'utf8').trim())
                return `personality: ${o.file} is missing or empty`;
            fs.copyFileSync(o.file, CUSTOM);
        }
        else if (!fs.existsSync(CUSTOM))
            fs.writeFileSync(CUSTOM, STARTER);
        save({ custom: true });
        return `personality: custom persona at ${posix(CUSTOM)}${o.file ? '' : '; edit it to taste'}; applies from the next session`;
    }
    const src = path.join(LIBRARY, `${o.choice}.md`);
    if (!fs.existsSync(src))
        return `personality: ${o.choice} is not in this folder; run setup from the kit repo`;
    if (o.to !== __dirname)
        copy(src, path.join(o.to, 'personas', `${o.choice}.md`));
    const [gender, level] = o.choice.split('-');
    save({ gender, level });
    return `personality: ${o.choice} installed (${posix(o.to)}); applies from the next session`;
}
function main(argv) {
    let o;
    try {
        o = parseArgs(argv);
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
        return;
    }
    console.log(install(o));
}
if (require.main === module)
    main(process.argv.slice(2));
