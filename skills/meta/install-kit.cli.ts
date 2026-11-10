#!/usr/bin/env node
// Mechanical half of install-kit: install/update/uninstall/archive/unarchive skills by moving files,
// deterministically. Claude still decides WHAT to install (mode, stack, addon opt-ins, context-code
// value, comment-style level, which skills a session doesn't need) -- this script only executes that
// decision reliably, instead of Claude hand-copying or hand-moving each file across a long narrated
// session. See skills/meta/install-kit.md (install/update/uninstall) and the `handover` skill (archive).
//
//   node install-kit.cli.js list      --library <path> [--json]
//   node install-kit.cli.js install   --library <path> --root <target> --tool claude|opencode|codex [--no-commands]
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
import fs = require('node:fs');
import crypto = require('node:crypto');
import path = require('node:path');
import readline = require('node:readline');
import verifyModule = require('./install-kit.verify');
import company = require('./install-kit.company');
import sig = require('./install-kit.signature');
import {
  MANIFEST_NAME, readManifest, writeManifest, ensureShield, removeShieldIfUnneeded, walkFiles, doArchive, doUnarchive,
  type Manifest,
} from './skill-scope.move';
export type { SkillRecord, Manifest, ArchiveResult, UnarchiveResult } from './skill-scope.move';
export { readManifest, writeManifest, doArchive, doUnarchive };

const { verify, ROOTS } = verifyModule;
type Tool = verifyModule.Tool;

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
export const ARCHIVABLE_SKILLS: string[] = Object.keys(
  (JSON.parse(fs.readFileSync(path.join(__dirname, 'skill-scope.triggers.json'), 'utf8')) as { skills: Record<string, unknown> }).skills,
);

// ---- Slash commands: copied from skills/commands/*.md, tracked in the manifest, refreshed by update, removed by uninstall.
// A command needs one skill. It is read from the template: `auto.js run <skill>` first (an archivable skill's command),
// else the first `{{skill-root}}/<skill>/` path. Templates with no script name theirs here.
const COMMAND_NEEDS_FALLBACK: Record<string, string | null> = { eta: 'plan-first', kit: null, format: null, pickup: 'handover' };

export interface CommandInfo { name: string; needs: string | null; body: string }

export function listCommands(libraryRoot: string): CommandInfo[] {
  const dir = path.join(libraryRoot, 'skills', 'commands');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => {
    const body = fs.readFileSync(path.join(dir, n), 'utf8');
    const name = n.slice(0, -3);
    const run = /auto\.js run ([a-z0-9-]+)/.exec(body);
    const path1 = /\{\{skill-root\}\}\/([a-z0-9-]+)\//.exec(body);
    const needs = run ? run[1] : path1 ? path1[1] : (name in COMMAND_NEEDS_FALLBACK ? COMMAND_NEEDS_FALLBACK[name] : undefined);
    if (needs === undefined) throw new Error(`command "${name}" names no skill and has no entry in COMMAND_NEEDS_FALLBACK`);
    return { name, needs, body };
  });
}

function commandsDirOf(manifest: Manifest): string | null {
  if (manifest.tool === 'codex' || !manifest.skillRoot) return null; // Codex has no command folder
  return path.join(path.dirname(manifest.skillRoot), 'commands');
}

function renderCommand(body: string, manifest: Manifest): string {
  return body.replace(/\{\{skill-root\}\}/g, manifest.skillRoot!.split(path.sep).join('/'));
}

const sha = (text: string): string => crypto.createHash('sha1').update(text).digest('hex');

export interface CommandsResult { added: string[]; updated: string[]; removed: string[]; kept: string[] }

// A command written by its own skill's setup script (narrate's setup.js copies /narration) is left to that script.
// Every other command, add-on ones included (/diagram, /teardown, /persona, /ctx), is installed here once its skill is.
const SELF_INSTALLED_COMMANDS = new Set(['narration']);
function eligibleCommand(c: CommandInfo, manifest: Manifest, catalog: Catalog): boolean {
  if (c.needs === null) return true;
  if (SELF_INSTALLED_COMMANDS.has(c.name)) return false;
  if (!manifest.skills[c.needs] && !manifest.archived[c.needs]) return false;
  return !!catalog[c.needs];
}

export function syncCommands(root: string, manifest: Manifest, library: string, opts: { force?: boolean; install: boolean }): CommandsResult {
  const result: CommandsResult = { added: [], updated: [], removed: [], kept: [] };
  const dirRel = commandsDirOf(manifest);
  if (!dirRel) return result;
  manifest.commands = manifest.commands || {};
  const catalog = listSkills(library);
  const libraryCommands = listCommands(library);
  // A command the kit no longer ships: remove the unedited copy it wrote; an edited one stays, untracked.
  if (libraryCommands.length) {
    const shipped = new Set(libraryCommands.map((c) => c.name));
    for (const [name, rec] of Object.entries(manifest.commands)) {
      if (shipped.has(name)) continue;
      const gone = path.join(root, rec.file);
      if (!fs.existsSync(gone)) { /* already removed by hand */ }
      else if (sha(fs.readFileSync(gone, 'utf8')) === rec.sha) { fs.rmSync(gone); result.removed.push(rec.file); }
      else result.kept.push(`/${name}: no longer shipped by the kit, edited since it was written, left alone`);
      delete manifest.commands[name];
    }
  }
  for (const c of libraryCommands) {
    if (!eligibleCommand(c, manifest, catalog)) continue;
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
    } else if (tracked) {
      const current = fs.readFileSync(abs, 'utf8');
      if (sha(current) === tracked.sha) {
        if (current !== text) { fs.writeFileSync(abs, text); manifest.commands[c.name].sha = sha(text); result.updated.push(c.name); }
      } else if (opts.force) {
        fs.writeFileSync(abs, text); manifest.commands[c.name].sha = sha(text); result.updated.push(c.name);
      } else {
        result.kept.push(`/${c.name}: edited since the kit wrote it, left alone (pass --force to overwrite)`);
      }
    } else if (opts.force) {
      fs.writeFileSync(abs, text);
      manifest.commands[c.name] = { file: rel.split(path.sep).join('/'), sha: sha(text) };
      result.updated.push(c.name);
    } else {
      result.kept.push(`/${c.name}: a file of that name already exists and the kit did not write it, left alone`);
    }
  }
  return result;
}

// Removes tracked commands that are unedited and whose skill is gone (or all of them with all=true).
export function pruneCommands(root: string, manifest: Manifest, all: boolean, library?: string): { removed: string[]; kept: string[] } {
  const removed: string[] = [], kept: string[] = [];
  if (!manifest.commands) return { removed, kept };
  const needs = new Map<string, string | null>();
  if (library) { try { for (const c of listCommands(library)) needs.set(c.name, c.needs); } catch { /* fall through: treated as unknown */ } }
  for (const [name, rec] of Object.entries(manifest.commands)) {
    const need = needs.get(name);
    const skillGone = need !== undefined && need !== null && !manifest.skills[need] && !manifest.archived[need];
    if (!all && !skillGone) continue;
    const abs = path.join(root, rec.file);
    if (!fs.existsSync(abs)) { delete manifest.commands[name]; continue; }
    if (sha(fs.readFileSync(abs, 'utf8')) === rec.sha) { fs.rmSync(abs); removed.push(rec.file); }
    else kept.push(`${rec.file}: edited since the kit wrote it, left alone`);
    delete manifest.commands[name];
  }
  const dir = commandsDirOf(manifest);
  if (dir && fs.existsSync(path.join(root, dir)) && fs.readdirSync(path.join(root, dir)).length === 0) fs.rmdirSync(path.join(root, dir));
  return { removed, kept };
}

// Archived skills live under <tool-dir>/skills-archive/; install, update and uninstall must reach them there.
function archiveRootOf(root: string, manifest: Manifest): string {
  return path.join(root, path.dirname(manifest.skillRoot!), 'skills-archive');
}
// Categories skill-scope.md says are "never part of Everything/Pick/Auto-detect by default" --
// excluded from both the Auto-detect default and the Everything preset; still reachable through
// "Pick individually".
const OPT_IN_DIR_PREFIXES = ['addons', 'mcp'];
const OPT_IN_NAMES = new Set(['mod-setup', 'misfire-log']);

// Named shortcuts for the common case of a brand-new project with nothing yet on disk for
// detectStackSignals to find. Mirrors install-kit.md's Stack table (Step 1) -- add a row here and
// there together the next time a stack gets a dedicated skill or coding-standards override; a
// preset is only ever a shortcut to real, already-classified content, never a new classification.
export interface StackPreset { label: string; skills: string[]; gap?: string }
export const STACK_PRESETS: Record<string, StackPreset> = {
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

function isMeta(relDir: string, name: string): boolean {
  return relDir === 'meta' && name.startsWith('install-kit');
}

export interface CompanionEntry { src: string; target: string }
export interface CatalogEntry { dir: string; companions: CompanionEntry[] }
export type Catalog = Record<string, CatalogEntry>;

// Discover every skill + its companions under the library's skills/ tree.
export function listSkills(libraryRoot: string): Catalog {
  const skillsRoot = path.join(libraryRoot, 'skills');
  const out: Catalog = {};

  function walk(absDir: string, relDir: string): void {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    const names = entries
      .map((e) => e.name)
      // .ts files are dev-time source for a compiled .js companion -- never an installable artifact.
      .filter((n) => !EXCLUDE_NAMES.has(n) && !isMeta(relDir, n) && !n.endsWith('.ts'));
    const mdStems = names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3));
    const skillNames = mdStems.filter((s) => !mdStems.some((other) => other !== s && s.startsWith(other + '.')));
    const claimed = new Set(skillNames.map((s) => s + '.md'));

    for (const skillName of skillNames) {
      if (out[skillName]) throw new Error(`duplicate skill name "${skillName}" found in ${relDir} and ${out[skillName].dir}`);
      const companions: CompanionEntry[] = [];
      for (const n of names) {
        if (n === skillName + '.md') continue;
        if (n.startsWith(skillName + '.')) {
          companions.push({ src: n, target: n.slice(skillName.length + 1) });
          claimed.add(n);
        }
      }
      out[skillName] = { dir: relDir, companions };
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (EXCLUDE_DIRS.has(e.name)) continue;
      if (claimed.has(e.name)) continue; // consumed as a companion directory (e.g. personality.personas/)
      walk(path.join(absDir, e.name), relDir ? `${relDir}/${e.name}` : e.name);
    }
  }

  walk(skillsRoot, '');
  return out;
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyRecursive(path.join(src, name), path.join(dest, name));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function filesDiffer(a: string, b: string): boolean {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return true;
  const sa = fs.statSync(a), sb = fs.statSync(b);
  if (sa.isDirectory() || sb.isDirectory()) return true;
  return !fs.readFileSync(a).equals(fs.readFileSync(b));
}

interface ParsedToken { name: string; only: Set<string> | null }

// Parses an entry like "mcp-manager:stitch+image-gen" or "handover" into { name, only: Set|null }.
function parseSkillToken(token: string): ParsedToken {
  const [name, companionList] = token.split(':');
  const only = companionList ? new Set(companionList.split('+').filter(Boolean)) : null;
  return { name: name.trim(), only };
}

function companionStem(targetName: string): string {
  // "install-hook.js" -> "install-hook"; "roles.example.json" -> "roles.example"
  const dot = targetName.lastIndexOf('.');
  return dot === -1 ? targetName : targetName.slice(0, dot);
}

const ACTIVE_LEVEL_RE = /\*\*Active level:\s*([a-z]*)\*\*/;
const CONTEXT_CODE_ROW_RE = /(\|\s*Context code\s*\|\s*)(.*?)(\s*\|)/;

interface HookEntry { matcher?: string; hooks: { type: string; command: string }[] }
interface HookConfig { hooks?: Record<string, HookEntry[]> }
interface Settings { hooks?: Record<string, HookEntry[]>; [key: string]: unknown }

// Pulls the `<!-- hook:core -->`-marked JSON blocks out of hooks-enforcement.md, so the merge can never
// drift from what that file documents -- there is exactly one source of truth for the sample hooks.
export function extractCoreHooks(libraryRoot: string): HookConfig[] {
  const p = path.join(libraryRoot, 'skills', 'models', 'claude', 'hooks-enforcement.md');
  const body = fs.readFileSync(p, 'utf8');
  const re = /<!-- hook:core -->\s*```json\s*([\s\S]*?)```/g;
  const configs: HookConfig[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) configs.push(JSON.parse(m[1]));
  return configs;
}

export interface MergeHooksResult { added: string[]; retired: string[]; path: string }

// Hooks an older kit installed and this one deliberately dropped. They are removed on merge so a project is not left running them.
// Skill archiving is user-triggered only now (/next, /archive, /unarchive), so the session-start and per-prompt skill-scope hooks go.
const RETIRED_HOOK_RE = /skill-scope\/auto\.js apply\b/;

// Merges one or more { hooks: { <Event>: [entry, ...] } } configs into <root>/.claude/settings.json,
// adding only entries not already present (by deep equality) and never touching anything else in the file.
export function mergeHooks(root: string, configs: HookConfig[]): MergeHooksResult {
  const p = path.join(root, '.claude', 'settings.json');
  let settings: Settings = {};
  if (fs.existsSync(p)) settings = JSON.parse(fs.readFileSync(p, 'utf8'));
  settings.hooks = settings.hooks || {};
  const added: string[] = [];
  const retired: string[] = [];
  for (const [event, entries] of Object.entries(settings.hooks)) {
    const keep = entries.filter((e) => !(e.hooks || []).some((h) => RETIRED_HOOK_RE.test(h.command || '')));
    if (keep.length !== entries.length) { retired.push(event); settings.hooks[event] = keep; if (!keep.length) delete settings.hooks[event]; }
  }
  for (const config of configs) {
    for (const [event, entries] of Object.entries(config.hooks || {})) {
      settings.hooks[event] = settings.hooks[event] || [];
      for (const entry of entries) {
        const exists = settings.hooks[event].some((e) => JSON.stringify(e) === JSON.stringify(entry));
        if (!exists) { settings.hooks[event].push(entry); added.push(event); }
      }
    }
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
  return { added, retired, path: path.join('.claude', 'settings.json') };
}

export function doMergeHooks(args: CliArgs): MergeHooksResult {
  const configs = extractCoreHooks(args.library!);
  return mergeHooks(args.root!, configs);
}

function coreEntries(configs: HookConfig[]): { event: string; json: string }[] {
  return configs.flatMap((c) => Object.entries(c.hooks || {}).flatMap(([event, entries]) => entries.map((e) => ({ event, json: JSON.stringify(e) }))));
}

function readSettings(root: string): Settings | null {
  const p = path.join(root, '.claude', 'settings.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as Settings; } catch { return null; }
}

// True when settings.json already holds at least one entry identical to a kit core hook: the project opted in earlier.
export function hasKitHooks(root: string, configs: HookConfig[]): boolean {
  const settings = readSettings(root);
  if (!settings || !settings.hooks) return false;
  const core = coreEntries(configs);
  return Object.entries(settings.hooks).some(([event, entries]) => entries.some((e) => core.some((c) => c.event === event && c.json === JSON.stringify(e))));
}

// Removes only entries identical to a kit core hook; every other hook and setting stays.
export function removeKitHooks(root: string, configs: HookConfig[]): number {
  const p = path.join(root, '.claude', 'settings.json');
  const settings = readSettings(root);
  if (!settings || !settings.hooks) return 0;
  const core = coreEntries(configs);
  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const kept = settings.hooks[event].filter((e) => {
      const hit = core.some((c) => c.event === event && c.json === JSON.stringify(e));
      if (hit) removed++;
      return !hit;
    });
    if (kept.length) settings.hooks[event] = kept; else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  if (removed) fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
  return removed;
}

function coreHooksOrNull(library: string | undefined): HookConfig[] | null {
  try { return extractCoreHooks(library || defaultLibraryGuess()); } catch { return null; }
}

export interface InstallOneResult { name: string; error?: string; changed?: boolean; companions?: string[] }
interface InstallOneOpts { commentStyleLevel?: string }

// Copies one skill (by name) from the library into the target skill root.
export function installOneSkill(libraryRoot: string, absSkillRoot: string, catalog: Catalog, token: string, opts: InstallOneOpts): InstallOneResult {
  const { name, only } = parseSkillToken(token);
  const entry = catalog[name];
  if (!entry) return { name, error: `not found in library: ${name}` };

  const destDir = path.join(absSkillRoot, name);
  const srcSkillFile = path.join(libraryRoot, 'skills', entry.dir, name + '.md');
  const destSkillFile = path.join(destDir, 'SKILL.md');

  let changed = false;
  let newBody = fs.readFileSync(srcSkillFile, 'utf8');

  if (name === 'comment-style') {
    const existing = fs.existsSync(destSkillFile) ? fs.readFileSync(destSkillFile, 'utf8') : null;
    const existingLevel = existing && ACTIVE_LEVEL_RE.exec(existing);
    const level = opts.commentStyleLevel || (existingLevel && existingLevel[1]) || null;
    if (level) newBody = newBody.replace(ACTIVE_LEVEL_RE, `**Active level: ${level}**`);
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
    if (filesDiffer(src, dest)) { copyRecursive(src, dest); changed = true; }
  }

  return { name, changed, companions: companions.map((c) => c.target) };
}

export function stripTemplatePreamble(body: string): string {
  const marker = /^# \[?CLAUDE\.md \| AGENTS\.md\]?/m;
  const m = marker.exec(body);
  return m ? body.slice(m.index) : body;
}

export function applyContextCode(body: string, contextCode: string | null | undefined): string {
  if (contextCode === 'none' || !contextCode) {
    return body.replace(/^\|\s*Context code\s*\|.*?\|\n?/m, '');
  }
  return body.replace(CONTEXT_CODE_ROW_RE, (_match, a, _b, c) => `${a}${contextCode}${c}`);
}

// Deletes Skill-Triggers rows whose `Skill` column names a skill not in `installedNames` -- the
// template ships with rows for the common universal skills, but a bare install may lack one of them.
export function pruneSkillTriggers(body: string, installedNames: Set<string>): string {
  const sectionRe = /## Skill Triggers[\s\S]*?(?=\n## |\s*$)/;
  const m = sectionRe.exec(body);
  if (!m) return body;
  const kept = m[0].split('\n').filter((line) => {
    const row = /^\|(.+)\|(.+)\|\s*$/.exec(line);
    if (!row) return true;
    const cell = row[2].trim();
    if (!cell || /^-+$/.test(cell) || cell.toLowerCase() === 'skill') return true;
    const code = /`([^`]+)`/.exec(cell);
    return code ? installedNames.has(code[1]) : true;
  });
  return body.slice(0, m.index) + kept.join('\n') + body.slice(m.index + m[0].length);
}

// Drops the whole Parallel-Session Coordination section unless role-session is installed -- it only
// applies to projects actually running the parallel-session system.
export function removeParallelSessionSection(body: string, roleSessionInstalled: boolean): string {
  if (roleSessionInstalled) return body;
  return body.replace(/\n?## Parallel-Session Coordination[\s\S]*?(?=\n## |\s*$)/, '');
}

// The Active Standards table's row label -> the key used to select/deselect it. "Script standard"
// (resolved separately, below -- it names a file, not a yes/no) and "Framework"/"CSS Framework"
// (left untouched -- no reliable auto-detected value to fill in from the terminal flow) are
// deliberately absent, so pruning never touches those three rows.
export const STANDARD_ROW_LABELS: Record<string, string> = {
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

export interface ActiveStandardsOpts {
  scriptStandard?: 'js' | 'ts' | 'js-and-ts';
  // Keys of STANDARD_ROW_LABELS to KEEP. Omit the whole opts object (not this field) to leave the
  // Active Standards table untouched; an empty Set here means "drop every one of the ten rows".
  active?: Set<string>;
}

// Resolves the Script-standard placeholder to the one file that actually applies (RULE from
// index.md: "a project uses exactly one script standard"), and -- per coding-standards/README.md's
// own setup instructions ("Update the Active Standards table... Remove rows for standards that do
// not apply") -- drops the rows for standards the project doesn't use, instead of leaving every
// one of the ten present for the user to prune by hand later.
export function applyActiveStandards(body: string, opts: ActiveStandardsOpts): string {
  let out = body;
  if (opts.scriptStandard) {
    out = out.replace(SCRIPT_STANDARD_ROW_RE, `$1${opts.scriptStandard}-standards$2`);
  }
  if (opts.active) {
    const m = ACTIVE_STANDARDS_SECTION_RE.exec(out);
    if (m) {
      const kept = m[0].split('\n').filter((line) => {
        const row = /^\|\s*([^|]+?)\s*\|/.exec(line);
        if (!row) return true;
        const label = row[1].trim();
        const key = Object.keys(STANDARD_ROW_LABELS).find((k) => STANDARD_ROW_LABELS[k] === label);
        return !key || opts.active!.has(key);
      });
      out = out.slice(0, m.index) + kept.join('\n') + out.slice(m.index + m[0].length);
    }
  }
  return out;
}

interface StandardsOpts { contextCode?: string; force?: boolean; installedNames?: Set<string>; activeStandards?: ActiveStandardsOpts; omit?: string[] }
export interface StandardsResult { copied: string[]; protocolCreated: boolean; refused: boolean }

export function installStandards(libraryRoot: string, root: string, protocolFile: string, opts: StandardsOpts): StandardsResult {
  const result: StandardsResult = { copied: [], protocolCreated: false, refused: false };
  const srcDir = path.join(libraryRoot, 'coding-standards');
  const destDir = path.join(root, 'coding-standards');
  if (fs.existsSync(destDir) && !opts.force) {
    for (const f of walkFiles(srcDir)) {
      const rel = path.relative(srcDir, f);
      if (rel === 'CLAUDE.example.md' || company.isOmitted(rel, opts.omit)) continue;
      const dest = path.join(destDir, rel);
      if (filesDiffer(f, dest)) { copyRecursive(f, dest); result.copied.push(rel); }
    }
  } else {
    for (const f of walkFiles(srcDir)) {
      const rel = path.relative(srcDir, f);
      if (rel === 'CLAUDE.example.md' || company.isOmitted(rel, opts.omit)) continue;
      copyRecursive(f, path.join(destDir, rel));
      result.copied.push(rel);
    }
  }

  const protocolAbs = path.join(root, protocolFile);
  if (!fs.existsSync(protocolAbs)) {
    let body = stripTemplatePreamble(fs.readFileSync(path.join(srcDir, 'CLAUDE.example.md'), 'utf8'));
    if (opts.contextCode) body = applyContextCode(body, opts.contextCode);
    if (opts.installedNames) {
      body = pruneSkillTriggers(body, opts.installedNames);
      body = removeParallelSessionSection(body, opts.installedNames.has('role-session'));
    }
    if (opts.activeStandards) body = applyActiveStandards(body, opts.activeStandards);
    fs.writeFileSync(protocolAbs, body);
    result.protocolCreated = true;
  } else if (opts.contextCode) {
    const body = fs.readFileSync(protocolAbs, 'utf8');
    fs.writeFileSync(protocolAbs, applyContextCode(body, opts.contextCode));
  }
  return result;
}

export interface CliArgs {
  library?: string;
  root?: string;
  tool?: string;
  skills: string[];
  all?: boolean;
  standards?: boolean;
  removeStandards?: boolean;
  removeHooks?: boolean;
  noCommands?: boolean;
  scriptStandard?: 'js' | 'ts' | 'js-and-ts';
  activeStandardsKeys?: string[];
  commentStyleLevel?: string;
  contextCode?: string;
  applyMigrations?: 'all' | string[];
  // Company standards: --company turns it on for install; --company-from copies a folder in; --company-defaults picks what happens to the kit defaults.
  company?: boolean;
  companyFrom?: string;
  companyDefaults?: company.DefaultsMode;
  signature?: string; // project signature: an alias of 2 to 6 letters, or "none"
  signatureAction?: string;
  companyAction?: string;
  purgeCompany?: boolean;
  dryRun?: boolean; // company sync and remove only: report, write nothing
  force?: boolean;
  json?: boolean;
}

export interface DoInstallResult { skills: InstallOneResult[]; standards: StandardsResult | null; verify: ReturnType<typeof verify>; commands?: CommandsResult; company?: company.CompanyResult; signature?: sig.SignatureResult }

export function doInstall(args: CliArgs): DoInstallResult {
  if (args.signature !== undefined && !/^(none|off|no)$/i.test(args.signature)) sig.normalizeAlias(args.signature); // a bad alias stops here, before anything is written
  const tool = ROOTS[args.tool as Tool];
  if (!tool) throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
  const catalog = listSkills(args.library!);
  const absSkillRoot = path.join(args.root!, tool.skills);
  const manifest = readManifest(args.root!);
  manifest.tool = args.tool!;
  manifest.skillRoot = tool.skills;
  manifest.protocolFile = tool.protocol;

  const results: InstallOneResult[] = [];
  for (const token of args.skills || []) {
    const r = installOneSkill(args.library!, absSkillRoot, catalog, token, {
      commentStyleLevel: args.commentStyleLevel,
    });
    results.push(r);
    if (!r.error) {
      manifest.skills[r.name] = { dir: catalog[r.name].dir, companions: r.companions! };
      if (manifest.archived[r.name]) {
        fs.rmSync(path.join(archiveRootOf(args.root!, manifest), r.name), { recursive: true, force: true });
        delete manifest.archived[r.name];
      }
    }
  }

  if (ensureShield(absSkillRoot)) results.push({ name: '(shield)', changed: true });

  // "Don't install default standards": the kit defaults are skipped entirely; the company folder is all there is.
  if (args.company && args.companyDefaults === 'drop') args.standards = false;
  let standardsResult: StandardsResult | null = null;
  if (args.standards) {
    const activeStandards = (args.scriptStandard || args.activeStandardsKeys)
      ? { scriptStandard: args.scriptStandard, active: args.activeStandardsKeys ? new Set(args.activeStandardsKeys) : undefined }
      : undefined;
    standardsResult = installStandards(args.library!, args.root!, tool.protocol, {
      contextCode: args.contextCode,
      force: args.force,
      installedNames: new Set(Object.keys(manifest.skills)),
      activeStandards,
      omit: company.companyOmit(manifest.company as company.CompanyRecord | undefined),
    });
    manifest.standards = true;
  }
  if (args.commentStyleLevel) manifest.commentStyleLevel = args.commentStyleLevel;
  if (args.contextCode) manifest.contextCode = args.contextCode;

  const commandsResult = args.noCommands ? undefined : syncCommands(args.root!, manifest, args.library!, { force: args.force, install: true });
  manifest.lastSeen = latestChangelogDate(args.library!) ?? manifest.lastSeen;
  writeManifest(args.root!, manifest);
  const signatureResult = args.signature !== undefined && !/^(none|off|no)$/i.test(args.signature) ? sig.setSignature(args.root!, args.signature) : undefined;
  const companyResult = args.company
    ? company.doCompanySync({ library: args.library, root: args.root, tool: args.tool, companyFrom: args.companyFrom, companyDefaults: args.companyDefaults })
    : undefined;
  const verifyResult = verify({ root: args.root!, tool: args.tool! });
  return { skills: results, standards: standardsResult, verify: verifyResult, commands: commandsResult, company: companyResult, signature: signatureResult };
}

export interface MigrationEntry { oldName: string; newName: string; applied: boolean }
export interface DoUpdateResult { skills: InstallOneResult[]; migrations: MigrationEntry[]; verify: ReturnType<typeof verify>; hooksAdded: string[]; hooksRetired: string[]; commands?: CommandsResult; whatsNew?: WhatsNew }

// ---- What's new: CHANGELOG.md sections newer than the date this project last saw ----
export interface NewsEntry { date: string; kind: string; headline: string }
export interface WhatsNew { since: string | null; latest: string; baseline: boolean; entries: NewsEntry[]; more: number }
const NEWS_CAP = 12;

export function parseChangelog(text: string): NewsEntry[] {
  const out: NewsEntry[] = [];
  let date = '', kind = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const d = /^##\s+(\d{4}-\d{2}-\d{2})\b/.exec(line);
    if (d) { date = d[1]; kind = ''; continue; }
    const k = /^###\s+(.+?)\s*$/.exec(line);
    if (k) { kind = k[1]; continue; }
    const b = /^-\s+(.+)$/.exec(line);
    if (b && date) {
      const first = b[1].split(/(?<=[.!?])\s/)[0];
      out.push({ date, kind, headline: first.length > 160 ? first.slice(0, 157) + '...' : first });
    }
  }
  return out;
}

// since = the project's lastSeen. With none (first update after tracking began) the newest two dated sections count as new.
export function whatsNew(library: string, since: string | undefined): WhatsNew | undefined {
  let text: string;
  try { text = fs.readFileSync(path.join(library, 'CHANGELOG.md'), 'utf8'); } catch { return undefined; }
  const all = parseChangelog(text);
  if (!all.length) return undefined;
  const dates = [...new Set(all.map((e) => e.date))].sort().reverse();
  const picked = since ? all.filter((e) => e.date > since) : all.filter((e) => dates.slice(0, 2).includes(e.date));
  return { since: since ?? null, latest: dates[0], baseline: !since, entries: picked.slice(0, NEWS_CAP), more: Math.max(0, picked.length - NEWS_CAP) };
}
function latestChangelogDate(library: string): string | undefined {
  try { return parseChangelog(fs.readFileSync(path.join(library, 'CHANGELOG.md'), 'utf8')).map((e) => e.date).sort().pop(); } catch { return undefined; }
}

export function doUpdate(args: CliArgs): DoUpdateResult {
  const manifest = readManifest(args.root!);
  if (!manifest.tool) throw new Error('no install manifest found at ' + path.join(args.root!, MANIFEST_NAME) + ' -- run install first');
  const tool = ROOTS[(args.tool || manifest.tool) as Tool];
  if (!tool) throw new Error(`--tool must be one of ${Object.keys(ROOTS).join('|')}`);
  const catalog = listSkills(args.library!);
  const absSkillRoot = path.join(args.root!, manifest.skillRoot!);

  const absArchiveRoot = archiveRootOf(args.root!, manifest);
  const names = args.all ? [...Object.keys(manifest.skills), ...Object.keys(manifest.archived)] : (args.skills || []);
  const results: InstallOneResult[] = [];
  for (const token of names) {
    const { name } = parseSkillToken(token);
    const archived = !manifest.skills[name] && !!manifest.archived[name];
    if (!manifest.skills[name] && !archived) { results.push({ name, error: 'not installed by this kit (not in manifest) -- skipped' }); continue; }
    // An archived skill is refreshed where it sits; it stays archived.
    const r = installOneSkill(args.library!, archived ? absArchiveRoot : absSkillRoot, catalog, token, {
      commentStyleLevel: args.commentStyleLevel || manifest.commentStyleLevel || undefined,
    });
    results.push(r);
    if (!r.error) (archived ? manifest.archived : manifest.skills)[r.name] = { dir: catalog[r.name].dir, companions: r.companions! };
  }
  ensureShield(absSkillRoot);

  const migrations = applyRenameMigrations(args.library!, args.root!, manifest, args.applyMigrations);

  const omit = company.companyOmit(manifest.company as company.CompanyRecord | undefined);
  if (manifest.standards && args.contextCode) {
    installStandards(args.library!, args.root!, manifest.protocolFile!, { contextCode: args.contextCode, omit });
  } else if (manifest.standards) {
    installStandards(args.library!, args.root!, manifest.protocolFile!, { omit });
  }
  company.refreshCompany(args.root!, manifest);
  if (args.contextCode) manifest.contextCode = args.contextCode;

  const news = whatsNew(args.library!, manifest.lastSeen);
  if (news) manifest.lastSeen = news.latest;
  writeManifest(args.root!, manifest);
  // A newer kit can add hook blocks. Merge them only where the project already opted in to kit hooks.
  let hooksAdded: string[] = [];
  let hooksRetired: string[] = [];
  const core = manifest.tool === 'claude' ? coreHooksOrNull(args.library) : null;
  if (core && hasKitHooks(args.root!, core)) { const merged = mergeHooks(args.root!, core); hooksAdded = merged.added; hooksRetired = merged.retired; }
  const commandsResult = args.noCommands ? undefined : syncCommands(args.root!, manifest, args.library!, { force: args.force, install: false });
  writeManifest(args.root!, manifest);
  const verifyResult = verify({ root: args.root!, tool: manifest.tool });
  return { skills: results, migrations, verify: verifyResult, hooksAdded, hooksRetired, commands: commandsResult, whatsNew: news };
}

interface RenameRow { oldName: string; newName: string }

export function parseRenameLedger(libraryRoot: string): RenameRow[] {
  const p = path.join(libraryRoot, 'migrations', 'RENAMES.md');
  if (!fs.existsSync(p)) return [];
  const body = fs.readFileSync(p, 'utf8');
  const rows: RenameRow[] = [];
  for (const line of body.split('\n')) {
    const m = /^\|\s*[\d-]+\s*\|\s*`?([\w.-]+)`?\s*\|\s*`?([\w.-]+)`?\s*\|/.exec(line);
    if (m) rows.push({ oldName: m[1], newName: m[2] });
  }
  return rows;
}

export function applyRenameMigrations(libraryRoot: string, root: string, manifest: Manifest, apply: 'all' | string[] | undefined): MigrationEntry[] {
  const ledger = parseRenameLedger(libraryRoot);
  const absSkillRoot = path.join(root, manifest.skillRoot!);
  const pending: MigrationEntry[] = [];
  if (!fs.existsSync(absSkillRoot)) return pending;
  const existing = fs.readdirSync(absSkillRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const applySet = apply === 'all' ? null : new Set(apply || []);

  for (const { oldName, newName } of ledger) {
    if (!existing.includes(oldName)) continue;
    const entry: MigrationEntry = { oldName, newName, applied: false };
    const shouldApply = apply === 'all' || (applySet && applySet.has(oldName));
    if (shouldApply) {
      const catalog = listSkills(libraryRoot);
      if (catalog[newName]) {
        const r = installOneSkill(libraryRoot, absSkillRoot, catalog, newName, {});
        manifest.skills[newName] = { dir: catalog[newName].dir, companions: r.companions || [] };
        const oldLearnings = path.join(absSkillRoot, oldName, 'learnings.md');
        if (fs.existsSync(oldLearnings)) {
          const dest = path.join(absSkillRoot, newName, 'learnings.md');
          if (fs.existsSync(dest)) fs.appendFileSync(dest, `\n## From ${oldName}\n` + fs.readFileSync(oldLearnings, 'utf8'));
          else copyRecursive(oldLearnings, dest);
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

export interface UninstallResult { removed: string[]; kept: string[]; note?: string }

export function doUninstall(args: CliArgs): UninstallResult {
  const manifest = readManifest(args.root!);
  if (!manifest.tool) return { removed: [], kept: [], note: 'no install manifest found -- nothing tracked to remove' };
  const absSkillRoot = path.join(args.root!, manifest.skillRoot!);
  const absArchiveRoot = archiveRootOf(args.root!, manifest);
  const names = args.all ? [...Object.keys(manifest.skills), ...Object.keys(manifest.archived)] : (args.skills || []);

  const removed: string[] = [];
  const kept: string[] = [];
  for (const name of names) {
    if (manifest.skills[name]) {
      const dir = path.join(absSkillRoot, name);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      delete manifest.skills[name];
      removed.push(`${manifest.skillRoot}/${name}`);
    } else if (manifest.archived[name]) {
      fs.rmSync(path.join(absArchiveRoot, name), { recursive: true, force: true });
      delete manifest.archived[name];
      removed.push(`${path.dirname(manifest.skillRoot!)}/skills-archive/${name}`);
    } else {
      kept.push(`${name}: not tracked in manifest, left alone`);
    }
  }
  if (fs.existsSync(absArchiveRoot) && fs.readdirSync(absArchiveRoot).length === 0) fs.rmdirSync(absArchiveRoot);
  if (removeShieldIfUnneeded(absSkillRoot)) removed.push(`${manifest.skillRoot}/package.json (shield, no longer needed)`);

  const cmd = pruneCommands(args.root!, manifest, !!args.all, args.library || (() => { try { return defaultLibraryGuess(); } catch { return undefined; } })());
  removed.push(...cmd.removed);
  kept.push(...cmd.kept);

  const core = coreHooksOrNull(args.library);
  if (args.removeHooks && core) {
    const n = removeKitHooks(args.root!, core);
    if (n) removed.push(`.claude/settings.json (${n} kit hook${n === 1 ? '' : 's'})`);
  } else if (core && hasKitHooks(args.root!, core)) {
    kept.push('.claude/settings.json kit hooks left in place (pass --remove-hooks to remove only the entries the kit added)');
  }

  if (args.removeStandards && manifest.standards) {
    // company/ holds the user's own files: never swept up with the kit's defaults.
    const dir = path.join(args.root!, 'coding-standards');
    if (fs.existsSync(dir)) for (const e of fs.readdirSync(dir)) if (e !== company.COMPANY_DIR) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
    if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
    removed.push('coding-standards/ (the kit defaults)');
    manifest.standards = false;
    kept.push(`${manifest.protocolFile} left in place -- it may carry project-specific edits; remove it by hand if no longer wanted`);
  } else if (manifest.standards) {
    kept.push('coding-standards/ left in place (pass --remove-standards to remove it)');
  }

  writeManifest(args.root!, manifest);
  if (manifest.company && (args.all || args.removeStandards || args.purgeCompany)) {
    const c = company.doCompanyRemove({ root: args.root, library: args.library || (() => { try { return defaultLibraryGuess(); } catch { return undefined; } })(), purge: args.purgeCompany, noRestore: !!args.removeStandards });
    removed.push(...c.removed);
    kept.push(...c.kept);
  } else if (manifest.company) {
    kept.push('company standards left in place (run `company remove` to take them out)');
  }
  if (args.all && readManifest(args.root!).signature) {
    const r = sig.setSignature(args.root!, 'none');
    removed.push(...r.notes);
  }
  return { removed, kept };
}

// Prompts run on a real terminal (stdin and stdout both a TTY). AI_DEV_KIT_INTERACTIVE=1 forces them on piped input so the whole
// flow can be tested by feeding answers; the answers still come one line per question, and a closed input means "press Enter".
function isInteractive(): boolean {
  return process.env.AI_DEV_KIT_INTERACTIVE === '1' || (!!process.stdout.isTTY && !!process.stdin.isTTY);
}

function defaultLibraryGuess(): string {
  // This compiled file lives at <library>/skills/meta/install-kit.cli.js.
  return path.resolve(__dirname, '..', '..');
}

function detectToolEvidence(root: string): Partial<Record<Tool, string>> {
  const out: Partial<Record<Tool, string>> = {};
  const hasOpencode = fs.existsSync(path.join(root, '.opencode')) || fs.existsSync(path.join(root, 'opencode.json'));
  const hasClaude = fs.existsSync(path.join(root, '.claude')) || fs.existsSync(path.join(root, 'CLAUDE.md'));
  const hasAgentsDir = fs.existsSync(path.join(root, '.agents'));
  const hasAgentsFile = fs.existsSync(path.join(root, 'AGENTS.md'));
  if (hasOpencode) out.opencode = '.opencode/ or opencode.json found';
  if (hasClaude) out.claude = '.claude/ or CLAUDE.md found';
  if (hasAgentsDir || (hasAgentsFile && !hasOpencode)) out.codex = '.agents/ or a bare AGENTS.md found';
  return out;
}

function isOptInOnly(entry: CatalogEntry, name: string): boolean {
  if (OPT_IN_NAMES.has(name)) return true;
  return OPT_IN_DIR_PREFIXES.some((p) => entry.dir === p || entry.dir.startsWith(p + '/'));
}

// Everything, minus the categories skill-scope.md says never belong to Everything/Pick/Auto-detect
// by default (addons, MCP, mod-setup, misfire-log) -- those stay reachable only via Pick individually.
export function eligibleCatalogNames(catalog: Catalog): string[] {
  return Object.keys(catalog).filter((name) => !isOptInOnly(catalog[name], name));
}

function readJsonSafe(p: string): any {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function hasDependency(pkg: any, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function hasDependencyPrefix(pkg: any, prefix: string): boolean {
  if (!pkg) return false;
  const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  return names.some((n) => n.startsWith(prefix));
}

export interface StackMatch { name: string; evidence: string }

// Scans the target for skill-scope.md's conditional-pinned signals -- only the objective, file-based
// ones (a dependency, a config file, an existing folder). The model-lineup signals need a judgment
// call ("which model is this project driven by") and are deliberately left out here, same spirit as
// install-kit.md: cite the signal found, never pin on a guess.
export function detectStackSignals(root: string, tool: string | undefined): StackMatch[] {
  const out: StackMatch[] = [];
  const pkgPath = path.join(root, 'package.json');
  const pkg = fs.existsSync(pkgPath) ? readJsonSafe(pkgPath) : null;

  if (hasDependency(pkg, 'three')) out.push({ name: 'threejs-scene', evidence: '"three" in package.json dependencies' });

  const astroConfig = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.cjs']
    .find((f) => fs.existsSync(path.join(root, f)));
  if (astroConfig || hasDependency(pkg, 'astro')) {
    out.push({ name: 'astro-page', evidence: astroConfig ? `${astroConfig} present` : '"astro" in package.json dependencies' });
  }

  if (hasDependencyPrefix(pkg, 'strata')) out.push({ name: 'strata-css', evidence: 'a "strata*" package in package.json' });
  if (hasDependencyPrefix(pkg, '@triforge/')) out.push({ name: 'triforge', evidence: 'a "@triforge/*" package in package.json' });

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
export function loadSkillPurposes(libraryRoot: string): Record<string, string> {
  const p = path.join(libraryRoot, 'skills', 'README.md');
  const out: Record<string, string> = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = README_CATALOG_ROW_RE.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(MD_LINK_RE, '$1');
  }
  return out;
}

function truncate(s: string, max: number): string {
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
function bold(s: string): string {
  return COLOR_ENABLED ? `\x1b[1m${s}\x1b[22m` : s;
}
// Secondary, descriptive text that explains a choice rather than being one -- a skill's purpose, a
// category's skill count, "type numbers separated by commas" style instructions.
function dim(s: string): string {
  return COLOR_ENABLED ? `\x1b[2m${s}\x1b[22m` : s;
}
// A running tally of what's already chosen (the category picker's "Selected so far" line) -- its
// own color so a cumulative-state line never reads as just another skill name or description.
function cyan(s: string): string {
  return COLOR_ENABLED ? `\x1b[36m${s}\x1b[39m` : s;
}
// Something the tool found, matched, or assumed on the project's behalf -- a detected stack signal,
// the auto-assumed --root, detected-tool evidence. Positive, confirmatory information.
function green(s: string): string {
  return COLOR_ENABLED ? `\x1b[32m${s}\x1b[39m` : s;
}
// A notice worth a second look without being an error -- a stack preset's known coding-standards
// gap, categories left unreviewed when picking finished early.
function yellow(s: string): string {
  return COLOR_ENABLED ? `\x1b[33m${s}\x1b[39m` : s;
}
// Actual failures only (main()'s caught-error and usage lines) -- never used for anything the user
// chose on purpose, so red stays a reliable "something went wrong" signal.
function red(s: string): string {
  return COLOR_ENABLED ? `\x1b[31m${s}\x1b[39m` : s;
}

// Matches install-kit.md's nine Pick-mode categories (models/opencode and models/claude both
// collapse to "models", the top-level grouping the skill scan already uses).
const CATEGORY_ORDER = ['models', 'workflow', 'standards', 'memory', 'stack', 'libraries', 'meta', 'addons', 'mcp'];
export function topCategory(dir: string): string {
  return dir.split('/')[0] || '(uncategorized)';
}
export function orderedCategories(present: string[]): string[] {
  const known = CATEGORY_ORDER.filter((c) => present.includes(c));
  const rest = present.filter((c) => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...rest];
}

function randomContextCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // skip I/O -- easily confused with 1/0
  return `${letters[Math.floor(Math.random() * letters.length)]}${Math.floor(Math.random() * 10)}`;
}

interface Choice { title: string; value: string }

// A folder nobody actually means when they leave --root out: the filesystem root or the user's
// own home directory. Installing `.claude/skills/` straight into either would be a real mistake,
// so this is the one case the assume-first guess below refuses to make silently.
function isUnsafeAssumeTarget(dir: string): boolean {
  const resolved = path.resolve(dir);
  if (resolved === path.parse(resolved).root) return true;
  try { if (resolved === path.resolve(require('node:os').homedir())) return true; } catch { /* no homedir -- not unsafe on that account */ }
  return false;
}

// The common pattern is cloning the kit directly inside the project you want it in (open a
// terminal in your project, `git clone` the kit right there) -- cwd is then the kit's own clone
// folder, one level below the real target. Assume that's what happened and use the parent folder
// with no question asked (printing what was assumed, so it's never silent); only fall back to
// asking when there's no such folder to assume (running from somewhere unrelated to the clone) or
// assuming would land on the filesystem root or the home directory.
async function resolveRoot(): Promise<string> {
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
let rl: readline.Interface | null = null;
// Lines that arrive before a question is asked (piped input) wait here instead of being dropped.
const queuedLines: string[] = [];
let waiting: ((line: string) => void) | null = null;
let inputEnded = false;
function closeRl(): void { if (rl) { rl.close(); rl = null; } queuedLines.length = 0; waiting = null; inputEnded = false; }
// Going back: typing "<" at any prompt (or "b" / "back" at a menu or yes/no) undoes the current step and returns to the
// previous one that asked something. canGoBack is false on the first question, where there is nothing to return to.
class BackSignal extends Error {}
let canGoBack = false;
let askCount = 0;
let backTipShown = false;
function goBackIfAsked(ans: string): void {
  if (canGoBack && /^(b|back)$/i.test(ans.trim())) throw new BackSignal();
}
async function ask(question: string): Promise<string> {
  if (canGoBack && !backTipShown) { backTipShown = true; console.log(dim('Tip: type < at any prompt to go back one step.')); }
  for (;;) {
    const line = await rawAsk(question);
    askCount++;
    if (line.trim() !== '<') return line;
    if (canGoBack) throw new BackSignal();
    console.log(dim('This is the first step; there is nothing to go back to.'));
  }
}
function rawAsk(question: string): Promise<string> {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; if (!process.stdin.isTTY) process.stdout.write(l + '\n'); w(l); } else queuedLines.push(l); });
    rl.on('close', () => { inputEnded = true; if (waiting) { const w = waiting; waiting = null; w(''); } }); // input ended: take the default
  }
  if (queuedLines.length) { const l = queuedLines.shift()!; process.stdout.write(question + l + '\n'); return Promise.resolve(l); }
  if (inputEnded) { process.stdout.write(question + '\n'); return Promise.resolve(''); } // nothing more to read: Enter, the default
  return new Promise((resolve) => { waiting = resolve; rl!.setPrompt(question); rl!.prompt(); });
}

async function askText(message: string, initial: string): Promise<string> {
  const ans = (await ask(`${bold(message)} [${initial}]: `)).trim();
  return ans || initial;
}

async function askYesNo(message: string, initialYes: boolean): Promise<boolean> {
  const ans = (await ask(`${bold(message)} (${initialYes ? 'Y/n' : 'y/N'}): `)).trim().toLowerCase();
  goBackIfAsked(ans);
  if (!ans) return initialYes;
  return ans.startsWith('y');
}

// A plain numbered menu -- "1) claude  2) opencode" -- typed instead of arrow-keyed, so it behaves
// the same in every terminal (PowerShell, cmd.exe, any SSH session) with no raw-mode surprises.
async function askSelect(message: string, choices: Choice[], initialIndex: number): Promise<string> {
  console.log(bold(message));
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
  for (;;) {
    const ans = (await ask(`Type a number [${initialIndex + 1}]: `)).trim();
    goBackIfAsked(ans);
    if (!ans) return choices[initialIndex].value;
    const n = Number(ans);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
    console.log(`Please type a number from 1 to ${choices.length}, or press Enter for ${initialIndex + 1}.`);
  }
}

async function askMultiselect(message: string, choices: Choice[], opts: { defaultAll?: boolean } = {}): Promise<string[]> {
  console.log(bold(message));
  choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.title}`));
  const defaultWord = opts.defaultAll ? 'all' : 'none';
  console.log(dim(`Type the numbers you want, separated by commas (example: 1,3,4), or "all"${opts.defaultAll ? ' or "none"' : ''}. Press Enter for ${defaultWord}.`));
  for (;;) {
    const ans = (await ask('Your choice: ')).trim().toLowerCase();
    goBackIfAsked(ans);
    if (!ans) return opts.defaultAll ? choices.map((c) => c.value) : [];
    if (ans === 'all') return choices.map((c) => c.value);
    if (ans === 'none') return [];
    const nums = ans.split(',').map((s) => Number(s.trim()));
    if (nums.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length)) return nums.map((n) => choices[n - 1].value);
    console.log(`Please type numbers from 1 to ${choices.length}, separated by commas, or "all".`);
  }
}

function skillChoices(catalog: Catalog, purposes: Record<string, string>, exclude: Set<string> = new Set()): Choice[] {
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
async function pickSkillsByCategory(catalog: Catalog, purposes: Record<string, string>, exclude: Set<string> = new Set()): Promise<string[]> {
  const groups: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(catalog)) {
    if (exclude.has(name)) continue;
    const cat = topCategory(entry.dir);
    (groups[cat] = groups[cat] || []).push(name);
  }
  const allCategories = orderedCategories(Object.keys(groups));
  if (!allCategories.length) return [];

  const picked: string[] = [];
  const remaining = new Set(allCategories);
  const DONE = '__done__';

  for (;;) {
    if (picked.length) {
      console.log(cyan(`Selected so far (${picked.length}): ${picked.join(', ')}`));
    }
    if (!remaining.size) break;

    const info = `${remaining.size} ${remaining.size === 1 ? 'category' : 'categories'} not yet reviewed`;
    const catChoices: Choice[] = allCategories
      .filter((c) => remaining.has(c))
      .map((c) => ({ title: `${c}  ${dim(`(${groups[c].length} skills)`)}`, value: c }));
    catChoices.push({ title: picked.length ? 'Done -- finish picking' : 'Skip -- pick nothing', value: DONE });

    const choice = await askSelect(`Pick a category ${dim(`(${info})`)}:`, catChoices, catChoices.length - 1);
    if (choice === DONE) {
      if (remaining.size) console.log(yellow(`Not reviewed, so not installed: ${[...remaining].join(', ')}`));
      break;
    }

    remaining.delete(choice);
    const subCatalog: Catalog = Object.fromEntries(groups[choice].map((n) => [n, catalog[n]]));
    const sel = await askMultiselect(`${choice} skills:`, skillChoices(subCatalog, purposes));
    picked.push(...sel);
  }
  return picked;
}

// Fills in only the flags actually missing, on a real terminal -- never overrides a flag the
// caller already passed, and never fires for a --json or non-TTY (scripted/agent) call. See the
// "Interactive mode" note at the top of the file.
// Company standards questions: whether to add the folder, where its files come from, and what happens to the kit defaults.
async function askCompany(args: CliArgs, ask: boolean): Promise<void> {
  if (args.company === undefined && ask) {
    args.company = await askYesNo("Does this project follow your own company's standards (a design system, style guide, standards docs)? Yes adds a separate coding-standards/company/ folder for them", false);
  }
  if (!args.company && !(args.companyAction === 'sync' || (!ask && args.root))) return;
  args.company = true;
  const m = readManifest(args.root!);
  const dir = company.companyDir(args.root!);
  if (!args.companyFrom && !(fs.existsSync(dir) && company.scanCompany(dir).docs.length)) {
    const p = (await askText('Folder to copy your company standards from (blank: you will drop files into coding-standards/company/ yourself)', '')).trim();
    if (p) args.companyFrom = p;
  }
  if (!args.companyDefaults && !m.company) {
    console.log(dim('Auto-detect is a guess from file names, titles and headings; it never removes the accessibility, QA, git or versioning defaults, and "company remove" puts back anything it removed.'));
    args.companyDefaults = await askSelect("What about the default coding standards (the kit's own)?", [
      { title: `Install the default standards too ${dim('-- company rules win where they conflict')}`, value: 'keep' },
      { title: `Don't install the default standards ${dim('-- your company rules are the only standards')}`, value: 'drop' },
      { title: `Auto-detect ${dim('-- reads your files, drops only the defaults your company clearly replaces')}`, value: 'auto' },
    ], 0) as company.DefaultsMode;
  }
}

// The project signature is the user's own choice: an alias that watermarks code written to the standards, or none.
async function askSignature(args: CliArgs): Promise<void> {
  if (args.signature !== undefined) return;
  let hint = '';
  const dir = company.companyDir(args.root!);
  const src = args.companyFrom ? path.resolve(args.companyFrom) : dir;
  const h = fs.existsSync(src) ? company.detectSignature(company.scanCompany(src).docs, src) : null;
  if (h) hint = ` Your company docs use "${h.alias}"; you can use it or pick another.`;
  console.log(dim('A signature is a short alias that watermarks the code you write to the standards: abc- classes and ids, data-abc- data attributes, Abc shared components. It applies to your own code only, never to packages or libraries.' + hint));
  for (;;) {
    const v = (await askText('Project signature (2 to 6 letters, or press Enter for none)', '')).trim();
    if (v === '') { args.signature = 'none'; return; }
    try { sig.normalizeAlias(v); args.signature = v; return; } catch (e) { console.log(yellow((e as Error).message)); }
  }
}

function printCompany(r: company.CompanyResult): void {
  console.error(bold(`Company standards: ${r.files} files (~${r.tokens} tokens), ${r.routes} routes imported, defaults: ${r.mode}`));
  if (r.findings) {
    for (const f of r.findings) console.error(`  ${f.drop ? yellow('drop') : green('keep')}  ${f.label.padEnd(24)} ${dim(f.reason)}`);
    for (const line of r.disclaimer || []) console.error(dim('  ' + line));
  }
  for (const n of r.notes) console.error(yellow('  note: ' + n));
}

type Step = () => Promise<void>;

// Copy of the answers so far, so a step can be undone exactly (the arrays are copied, not shared).
function snapshotArgs(a: CliArgs): CliArgs {
  return { ...a, skills: [...a.skills], activeStandardsKeys: a.activeStandardsKeys ? [...a.activeStandardsKeys] : undefined };
}

// Runs the questions one step at a time. A step that asked nothing (its answer came from a flag) is passed over in both
// directions; going back restores the answers exactly as they were before the step being returned to.
async function runSteps(args: CliArgs, steps: Step[]): Promise<void> {
  const snaps: CliArgs[] = [];
  const asked: boolean[] = [];
  let i = 0;
  while (i < steps.length) {
    snaps[i] = snapshotArgs(args);
    canGoBack = asked.slice(0, i).some(Boolean);
    const before = askCount;
    try {
      await steps[i]();
      asked[i] = askCount > before;
      i++;
    } catch (e) {
      if (!(e instanceof BackSignal)) throw e;
      let j = i - 1;
      while (j >= 0 && !asked[j]) j--;
      if (j < 0) { i = 0; continue; }
      for (const k of Object.keys(args)) delete (args as unknown as Record<string, unknown>)[k];
      Object.assign(args, snaps[j]);
      asked.length = j;
      i = j;
      console.log(dim('Back one step.'));
    }
  }
}

async function fillInteractive(cmd: string, args: CliArgs): Promise<void> {
  if (args.json || !isInteractive()) return;
  canGoBack = false; askCount = 0; backTipShown = false;
  try {
    const steps: Step[] = [];
    if (['list', 'install', 'update', 'merge-hooks', 'company'].includes(cmd) && !args.library) {
      steps.push(async () => { if (!args.library) args.library = await askText('Path to the ai-dev-kit library', defaultLibraryGuess()); });
    }
    if (['install', 'update', 'uninstall', 'archive', 'unarchive', 'merge-hooks', 'company', 'signature'].includes(cmd) && !args.root) {
      steps.push(async () => { if (!args.root) args.root = await resolveRoot(); });
    }
    if (cmd === 'company' && (args.companyAction || 'sync') === 'sync') steps.push(() => askCompany(args, false));

    if (cmd === 'install') {
      steps.push(async () => {
      if (!args.tool) {
        const evidence = detectToolEvidence(args.root!);
        const tools = Object.keys(ROOTS) as Tool[];
        const choices: Choice[] = tools.map((t) => ({ title: evidence[t] ? `${t}  ${green('— ' + evidence[t])}` : t, value: t }));
        const detectedIndex = tools.findIndex((t) => evidence[t]);
        args.tool = await askSelect('Target tool:', choices, detectedIndex >= 0 ? detectedIndex : 0);
      }
      });
      steps.push(async () => {
      if (!args.skills.length) {
        const catalog = listSkills(args.library!);
        const purposes = loadSkillPurposes(args.library!);
        const standard = Array.from(new Set([...UNIVERSAL_SKILLS, ...ARCHIVABLE_SKILLS])).filter((n) => catalog[n]);
        const detected = detectStackSignals(args.root!, args.tool).filter((d) => catalog[d.name]);

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
        } else if (mode === 'pick') {
          args.skills = await pickSkillsByCategory(catalog, purposes);
        } else {
          let extra = detected.map((d) => d.name);
          if (detected.length) {
            console.log(green('Matched to this project:'));
            for (const d of detected) {
              const purpose = purposes[d.name];
              console.log(purpose ? `  ${d.name} ${dim(purpose)}  ${green('(' + d.evidence + ')')}` : `  ${d.name} ${green('(' + d.evidence + ')')}`);
            }
          } else {
            const presetEntries = Object.entries(STACK_PRESETS);
            const presetChoice = await askSelect('No framework signal detected -- pick a stack preset instead?', [
              ...presetEntries.map(([key, p]) => ({ title: p.label, value: key })),
              { title: `None ${dim('-- just the standard set')}`, value: 'none' },
            ], presetEntries.length);
            const preset = STACK_PRESETS[presetChoice];
            if (preset) {
              extra = preset.skills.filter((n) => catalog[n]);
              if (preset.gap) console.log(yellow(`Note: ${preset.gap}`));
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
      if (args.company && args.companyDefaults === 'drop') args.standards = false;
      else if (args.company && args.companyDefaults && args.standards === undefined) args.standards = true; // keep or auto: the defaults were chosen in the company question
      if (args.standards === undefined) {
        args.standards = await askYesNo(args.company ? 'Install the default coding-standards too (company rules win where they conflict)?' : 'Install the coding-standards system too?', false);
      }
      });
      steps.push(async () => {
        if (!args.standards) return;
        if (!args.scriptStandard) {
          const pkg = readJsonSafe(path.join(args.root!, 'package.json'));
          const looksTs = fs.existsSync(path.join(args.root!, 'tsconfig.json')) || hasDependency(pkg, 'typescript');
          args.scriptStandard = await askSelect('Script standard for this project (index.md: exactly one applies):', [
            { title: 'TypeScript only', value: 'ts' },
            { title: 'JavaScript only', value: 'js' },
            { title: 'JS and TS together', value: 'js-and-ts' },
          ], looksTs ? 0 : 1) as 'ts' | 'js' | 'js-and-ts';
        }
      });
      steps.push(async () => {
        if (!args.standards) return;
        if (!args.activeStandardsKeys) {
          const choices: Choice[] = Object.entries(STANDARD_ROW_LABELS).map(([key, label]) => ({ title: label, value: key }));
          args.activeStandardsKeys = await askMultiselect(
            "Which of these apply to this project? Most projects keep all of them -- deselect only what genuinely doesn't apply (its row is then removed from the Active Standards table, not just left unchecked):",
            choices,
            { defaultAll: true },
          );
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
      if (args.standards && !args.contextCode) {
        const suggestion = randomContextCode();
        args.contextCode = await askText(`Context code (2-4 chars, or "none")`, suggestion);
      }
      });
    }

    if (['update', 'uninstall', 'archive', 'unarchive'].includes(cmd) && !args.all && !args.skills.length) {
      steps.push(async () => {
      const manifest = readManifest(args.root!);
      const pool = cmd === 'unarchive' ? manifest.archived : manifest.skills;
      const names = Object.keys(pool);
      if (!names.length) {
        args.all = true;
      } else {
        const scope = await askSelect(`Apply ${cmd} to:`, [
          { title: 'All tracked skills', value: 'all' },
          { title: 'Choose specific skills', value: 'pick' },
        ], 0);
        if (scope === 'all') args.all = true;
        else args.skills = await askMultiselect(`Which skills to ${cmd}?`, names.map((n) => ({ title: n, value: n })));
      }
      });
    }

    await runSteps(args, steps);
  } finally {
    closeRl();
  }
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { skills: [] };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--library') a.library = argv[++i];
    else if (k === '--root') a.root = argv[++i];
    else if (k === '--tool') a.tool = argv[++i];
    else if (k === '--skills') a.skills = argv[++i].split(',').filter(Boolean);
    else if (k === '--all') a.all = true;
    else if (k === '--standards') a.standards = true;
    else if (k === '--remove-standards') a.removeStandards = true;
    else if (k === '--remove-hooks') a.removeHooks = true;
    else if (k === '--no-commands') a.noCommands = true;
    else if (k === '--script-standard') a.scriptStandard = argv[++i] as 'js' | 'ts' | 'js-and-ts';
    else if (k === '--active-standards') { const v = argv[++i]; a.activeStandardsKeys = v === 'all' ? undefined : v === 'none' ? [] : v.split(',').filter(Boolean); }
    else if (k === '--comment-style-level') a.commentStyleLevel = argv[++i];
    else if (k === '--context-code') a.contextCode = argv[++i];
    else if (k === '--apply-migrations') { const v = argv[++i]; a.applyMigrations = v === 'all' ? 'all' : v.split(',').filter(Boolean); }
    else if (k === '--company') a.company = true;
    else if (k === '--company-from') { a.companyFrom = argv[++i]; a.company = true; }
    else if (k === '--company-defaults') {
      const v = argv[++i];
      if (v !== 'keep' && v !== 'drop' && v !== 'auto') { console.error(red('error: --company-defaults must be keep, drop or auto')); process.exit(2); }
      a.companyDefaults = v as company.DefaultsMode; a.company = true;
    }
    else if (k === '--signature') a.signature = argv[++i];
    else if (k === '--purge-company' || k === '--purge') a.purgeCompany = true;
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--force') a.force = true;
    else if (k === '--json') a.json = true;
    // An unknown flag used to be dropped silently, so a mistyped or unsupported one (--dry-run) ran the real install.
    else if (k.startsWith('-')) { console.error(red(`error: unknown option ${k}`)); process.exit(2); }
  }
  return a;
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const args = parseArgs(process.argv);
  if (cmd === 'company' && process.argv[3] && !process.argv[3].startsWith('-')) args.companyAction = process.argv[3];
  if (cmd === 'signature') { args.signatureAction = process.argv[3]; if (process.argv[4] && !process.argv[4].startsWith('-')) args.signature = process.argv[4]; }
  let res: unknown;
  try {
    await fillInteractive(cmd, args);
    if (['uninstall', 'archive', 'unarchive'].includes(cmd) && !args.all && !args.skills.length) {
      console.error(red(`${cmd} needs --skills a,b or --all`));
      process.exit(2);
      return;
    }
    // A dry run that quietly became a real run is the worst failure here: only `company` implements --dry-run, so refuse it elsewhere.
    if (args.dryRun && cmd !== 'company' && cmd !== 'signature') { console.error(red('error: --dry-run is supported by the company and signature commands only')); process.exit(2); return; }
    if (cmd === 'company' && !args.root) { console.error(red('usage: install-kit.cli.js company <sync|remove|status> --root <target> [--company-from <folder>] [--company-defaults keep|drop|auto] [--force] [--dry-run] [--purge]')); process.exit(2); return; }
    if (cmd === 'signature') {
      const action = args.signatureAction;
      if (!args.root || !['set', 'remove', 'show'].includes(action || '') || (action === 'set' && !args.signature)) { console.error(red('usage: install-kit.cli.js signature <set <alias>|remove|show> --root <target> [--dry-run]')); process.exit(2); return; }
      if (action === 'show') res = sig.showSignature(args.root);
      else {
        res = sig.setSignature(args.root, action === 'remove' ? 'none' : args.signature!, args.dryRun);
        if (!args.dryRun) { const m = readManifest(args.root); if (m.company) { company.refreshCompany(args.root, m); writeManifest(args.root, m); } }
      }
    }
    else if (cmd === 'company') {
      const action = args.companyAction || 'sync';
      if (action === 'sync') res = company.doCompanySync({ library: args.library, root: args.root, tool: args.tool, companyFrom: args.companyFrom, companyDefaults: args.companyDefaults, dryRun: args.dryRun, force: args.force });
      else if (action === 'remove') res = company.doCompanyRemove({ library: args.library || (() => { try { return defaultLibraryGuess(); } catch { return undefined; } })(), root: args.root, purge: args.purgeCompany, dryRun: args.dryRun });
      else if (action === 'status') res = company.companyStatus(args.root!);
      else { console.error(red('usage: install-kit.cli.js company <sync|remove|status> --root <target> [--company-from <folder>] [--company-defaults keep|drop|auto] [--purge]')); process.exit(2); return; }
      if (isInteractive() && !args.json && action === 'sync') printCompany(res as company.CompanyResult);
    }
    else if (cmd === 'list') res = listSkills(args.library!);
    else if (cmd === 'install') res = doInstall(args);
    else if (cmd === 'update') res = doUpdate(args);
    else if (cmd === 'archive') res = doArchive(args);
    else if (cmd === 'unarchive') res = doUnarchive(args);
    else if (cmd === 'uninstall') res = doUninstall(args);
    else if (cmd === 'merge-hooks') res = doMergeHooks(args);
    else { console.error(red('usage: install-kit.cli.js <list|install|update|uninstall|archive|unarchive|merge-hooks|company|signature> [options]')); process.exit(2); return; }
  } catch (e) {
    console.error(red('error: ' + (e as Error).message));
    process.exit(1);
    return;
  }
  console.log(JSON.stringify(res, null, 2));
}

if (require.main === module) void main();
