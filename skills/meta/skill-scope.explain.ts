// Plain-language explanations for the mistakes kit scripts hit most. No AI, no network: a table of detect rule,
// explanation and fix. A script calls explain(err, ctx) from its catch block and prints the message instead of a
// raw stack trace; tidyTask() repairs task text mangled by the shell. Plain Node, no dependencies.
//
//   node skill-scope.explain.js            prints every known mistake (for docs and the test)

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ExplainCtx { cwd?: string; root?: string; script?: string; tool?: string }
export interface Known { id: string; test: (msg: string, ctx: ExplainCtx) => boolean; say: (msg: string, ctx: ExplainCtx) => string; recover?: 'chdir-root' }

const q = (s: string | undefined): string => (s ? s.replace(/\\/g, '/') : 'the project root');

export const KNOWN: Known[] = [
  {
    id: 'wrong-cwd',
    test: (m, c) => /MODULE_NOT_FOUND|Cannot find module/.test(m) && !!c.root && !!c.cwd && path.resolve(c.cwd) !== path.resolve(c.root),
    say: (_m, c) => `Wrong folder: your terminal is in ${q(c.cwd)}, but kit scripts run from your project root (${q(c.root)}). Run it from there, or use the slash command, which finds the root itself.`,
    recover: 'chdir-root',
  },
  {
    id: 'script-missing',
    test: (m) => /is not installed in this project|ENOENT.*\.js|Cannot find module/.test(m),
    say: (_m, c) => `The script ${c.script ? q(c.script) + ' ' : ''}is not installed in this project. Run install-kit again (or /unarchive <skill> if the skill was archived).`,
  },
  {
    id: 'no-manifest',
    test: (m) => /no install manifest|no --root and no \.ai-dev-kit\.json/.test(m),
    say: (_m, c) => `No kit install found in ${q(c.cwd)}. Move to the project root that holds .ai-dev-kit.json, or run install-kit first.`,
  },
  {
    id: 'split-task',
    test: (m) => /first word must be tsk-note or tsk-start/.test(m),
    say: () => 'The task text must start with tsk-note or tsk-start. Put the whole task in one go, for example: /next tsk-note fix the login page.',
  },
  {
    id: 'backslash-path',
    test: (m) => /[A-Za-z]:[^\s\\/]+[A-Za-z]/.test(m) && !/[A-Za-z]:[\\/]/.test(m),
    say: (m) => `A path lost its backslashes in the shell: "${m.match(/[A-Za-z]:[^\s]+/)?.[0] ?? ''}". Use forward slashes, for example C:/Users/you/file.svg, or put the path in quotes.`,
  },
  {
    id: 'no-node',
    test: (m) => /node: command not found|'node' is not recognized/.test(m),
    say: () => 'Node.js is not installed or not on PATH. Install Node 18 or newer from nodejs.org, then open a new terminal.',
  },
  {
    id: 'no-chrome',
    test: (m) => /no (Chrome|Edge|browser)|chrome.*not found|CHROME_PATH/i.test(m),
    say: () => 'No Chrome or Edge was found. Install one, or set CHROME_PATH to its executable. Without it this step is skipped.',
  },
  {
    id: 'no-ollama',
    test: (m) => /ollama|11434|ECONNREFUSED.*11434/i.test(m),
    say: () => 'Ollama is not running. Start it (ollama serve) or turn the local-model option off. Nothing else depends on it.',
  },
];

// Newlines in task text, doubled spaces and Windows paths (backslashes become forward slashes) are repaired, not rejected.
export function tidyTask(words: string[]): string {
  return words.join(' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/(^|[\s"'(])([A-Za-z]:(?:\\[^\\"'\n]*)+)/g, (_m, pre: string, p: string) => pre + p.replace(/\\/g, '/'))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Returns the message to print. Unknown errors get one line of cause and one of "what to try", never a stack trace.
export function explain(err: unknown, ctx: ExplainCtx = {}): { message: string; id: string; recover?: 'chdir-root' } {
  const msg = err instanceof Error ? err.message : String(err);
  const hit = KNOWN.find((k) => k.test(msg, ctx));
  if (hit) return { message: hit.say(msg, ctx), id: hit.id, recover: hit.recover };
  return { message: `Something failed: ${msg.split('\n')[0].slice(0, 160)}. Try running the same command from the project root; if it repeats, run /kit to check the install.`, id: 'unknown' };
}

// Walks up from a folder to the nearest one holding .ai-dev-kit.json; null when there is none.
export function findRoot(from: string): string | null {
  let d = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(d, '.ai-dev-kit.json'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

if (require.main === module) for (const k of KNOWN) console.log(k.id);
