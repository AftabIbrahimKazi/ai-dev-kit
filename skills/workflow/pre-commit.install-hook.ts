#!/usr/bin/env node
// Installs the pre-commit skill's check.js as real git hooks, so the mechanical checks also run for human
// commits and for tools with no mods (OpenCode, Codex). Plain Node + git, no dependencies.
//
//   node install-hook.js [install|uninstall|status] [--cwd D] [--force]
//
// Writes two POSIX-sh hooks into the repo's hooks folder (git's own answer, so core.hooksPath and worktrees work):
//   pre-commit   node check.js --staged                           fails before the editor opens on secrets, secret files
//   commit-msg   node check.js --staged --message-file <message>  adds the message-format check (merge/revert/fixup skipped)
// Only BLOCK findings fail a commit; warnings print and pass. A hook never bricks commits: a missing node or engine
// prints one line and passes. `git commit --no-verify` skips hooks, which the pre-commit skill forbids.
// A hook this script did not write is never overwritten without --force, and --force keeps it as <name>.pre-ai-dev-kit.
import fs = require('node:fs');
import path = require('node:path');
import childProcess = require('node:child_process');

const { spawnSync } = childProcess;

const MARK = '# ai-dev-kit git hook';
const HOOKS = ['pre-commit', 'commit-msg'];

const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const fwd = (p: string): string => p.split(path.sep).join('/');

function engineHere(): string | null {
  for (const n of ['check.js', 'pre-commit.check.js']) {
    const p = path.join(__dirname, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function script(name: string, engineRef: string): string {
  const head = [
    '#!/bin/sh',
    `${MARK} (${name}); installed by install-hook.js, remove with: node install-hook.js uninstall`,
    `ENGINE="${engineRef}"`,
    'ROOT=$(git rev-parse --show-toplevel)',
    'case "$ENGINE" in /*|[A-Za-z]:*) E="$ENGINE" ;; *) E="$ROOT/$ENGINE" ;; esac',
    'if ! command -v node >/dev/null 2>&1 || [ ! -f "$E" ]; then echo "ai-dev-kit hook: node or the check script is missing, skipping" >&2; exit 0; fi',
  ];
  if (name === 'pre-commit') return [...head, 'node "$E" --staged', 'exit $?', ''].join('\n');
  return [
    ...head,
    'first=$(head -n 1 "$1")',
    'case "$first" in "Merge "*|"Revert "*|"fixup!"*|"squash!"*|"amend!"*) exit 0 ;; esac',
    'tmp=$(mktemp)',
    'grep -v "^#" "$1" > "$tmp"',
    'node "$E" --staged --message-file "$tmp"',
    'rc=$?',
    'rm -f "$tmp"',
    'exit $rc',
    '',
  ].join('\n');
}

function locate(cwd: string): { root: string; dir: string } {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  if (top.status !== 0) throw new Error('not inside a git repository');
  const root = top.stdout.trim();
  const hp = git(cwd, 'rev-parse', '--git-path', 'hooks');
  const dir = path.resolve(cwd, hp.stdout.trim());
  return { root, dir };
}

const isOurs = (file: string): boolean => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARK);

export function install(cwd: string, force: boolean): string[] {
  const engine = engineHere();
  if (!engine) throw new Error('check.js not found next to this script; install the pre-commit skill first');
  const { root, dir } = locate(cwd);
  const rel = path.relative(root, engine);
  const ref = rel.startsWith('..') || path.isAbsolute(rel) ? fwd(engine) : fwd(rel);
  fs.mkdirSync(dir, { recursive: true });
  const done: string[] = [];
  for (const name of HOOKS) {
    const file = path.join(dir, name);
    if (fs.existsSync(file) && !isOurs(file)) {
      if (!force) { done.push(`${name}: another hook exists, left alone (use --force to keep it as ${name}.pre-ai-dev-kit and replace it)`); continue; }
      fs.renameSync(file, `${file}.pre-ai-dev-kit`);
    }
    fs.writeFileSync(file, script(name, ref), { mode: 0o755 });
    try { fs.chmodSync(file, 0o755); } catch { /* Windows */ }
    done.push(`${name}: installed -> ${ref}`);
  }
  return done;
}

export function uninstall(cwd: string): string[] {
  const { dir } = locate(cwd);
  const done: string[] = [];
  for (const name of HOOKS) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { done.push(`${name}: not installed`); continue; }
    if (!isOurs(file)) { done.push(`${name}: not ours, left alone`); continue; }
    fs.rmSync(file);
    const bak = `${file}.pre-ai-dev-kit`;
    if (fs.existsSync(bak)) { fs.renameSync(bak, file); done.push(`${name}: removed, previous hook restored`); } else done.push(`${name}: removed`);
  }
  return done;
}

export function status(cwd: string): string[] {
  const { dir } = locate(cwd);
  return HOOKS.map((name) => {
    const file = path.join(dir, name);
    return `${name}: ${!fs.existsSync(file) ? 'not installed' : isOurs(file) ? 'installed' : 'a different hook is present'}`;
  });
}

function main(argv: string[]): number {
  let cmd = 'install', cwd = process.cwd(), force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cwd') cwd = path.resolve(argv[++i] || '.');
    else if (argv[i] === '--force') force = true;
    else if (['install', 'uninstall', 'status'].includes(argv[i])) cmd = argv[i];
    else { console.error('usage: node install-hook.js [install|uninstall|status] [--cwd D] [--force]'); return 2; }
  }
  try {
    const out = cmd === 'install' ? install(cwd, force) : cmd === 'uninstall' ? uninstall(cwd) : status(cwd);
    console.log(out.join('\n'));
    return 0;
  } catch (e) {
    console.error(`install-hook: ${(e as Error).message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
