#!/usr/bin/env node
// Mechanical half of the e2e-scaffold skill: detect the stack, write the Playwright plumbing from the templates
// companion, wire package.json and .gitignore. The model only confirms the dev command and runs the smoke test.
//
//   node init.js status  [--cwd D] [--json]                 is the scaffold there? stack, port, package manager, playwright dep
//   node init.js init    [--cwd D] [--port N] [--command "pnpm dev"] [--dry-run] [--force] [--json]
//
// init refuses when playwright.config.* and tests/e2e/fixtures.* both exist (extend them instead; --force overwrites).
// Templates come from templates.md next to this script (e2e-scaffold.templates.md in the library). Never installs
// packages: it prints the install command for the detected package manager. No network.
// Exit codes: 0 done, 1 error, 2 bad usage, 3 scaffold already present.
import fs = require('node:fs');
import path = require('node:path');

export interface Stack { manager: 'npm' | 'pnpm' | 'yarn' | 'bun'; devScript: string | null; devCommand: string; port: number; framework: string; playwright: boolean; typescript: boolean }
export interface Status { configFile: string | null; fixturesFile: string | null; scaffolded: boolean; stack: Stack | null }

const FRAMEWORK_PORT: [RegExp, string, number][] = [
  [/\bnext\b/, 'next', 3000], [/\bnuxt\b/, 'nuxt', 3000], [/\bastro\b/, 'astro', 4321], [/\bvite\b/, 'vite', 5173],
  [/\bremix\b/, 'remix', 3000], [/\bsvelte-kit|\bvite dev\b/, 'sveltekit', 5173], [/\bgatsby\b/, 'gatsby', 8000],
  [/\bng serve|\bangular\b/, 'angular', 4200], [/\bphp artisan serve/, 'laravel', 8000], [/\breact-scripts\b/, 'cra', 3000],
];

export function detect(cwd: string): Stack | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts: Record<string, string> = pkg.scripts || {};
  const devScript = ['dev', 'start', 'serve'].find((s) => scripts[s]) ?? null;
  const manager: Stack['manager'] = fs.existsSync(path.join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(cwd, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock')) ? 'bun' : 'npm';
  const run = manager === 'npm' ? 'npm run ' : manager + ' ';
  const text = devScript ? scripts[devScript] : '';
  let framework = 'unknown', port = 3000;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [re, name, p] of FRAMEWORK_PORT) if (re.test(text) || deps[name]) { framework = name; port = p; break; }
  const explicit = /(?:--port|-p)[= ](\d{2,5})/.exec(text) ?? /PORT=(\d{2,5})/.exec(text);
  if (explicit) port = Number(explicit[1]);
  for (const cfg of ['vite.config.ts', 'vite.config.js', 'astro.config.mjs', 'astro.config.ts', 'nuxt.config.ts']) {
    const p = path.join(cwd, cfg);
    if (!fs.existsSync(p)) continue;
    const m = /port\s*:\s*(\d{2,5})/.exec(fs.readFileSync(p, 'utf8'));
    if (m) port = Number(m[1]);
  }
  return { manager, devScript, devCommand: devScript ? run + devScript : '', port, framework, playwright: '@playwright/test' in deps, typescript: 'typescript' in deps || fs.existsSync(path.join(cwd, 'tsconfig.json')) };
}

export function status(cwd: string): Status {
  const configFile = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'].map((f) => path.join(cwd, f)).find((p) => fs.existsSync(p)) ?? null;
  const fixturesFile = ['fixtures.ts', 'fixtures.js'].map((f) => path.join(cwd, 'tests', 'e2e', f)).find((p) => fs.existsSync(p)) ?? null;
  return { configFile: configFile && path.relative(cwd, configFile), fixturesFile: fixturesFile && path.relative(cwd, fixturesFile), scaffolded: !!(configFile && fixturesFile), stack: detect(cwd) };
}

// The templates companion holds fenced blocks, each preceded by a `path`: line. Returns {path: code}.
export function readTemplates(dir: string): Record<string, string> {
  const file = ['templates.md', 'e2e-scaffold.templates.md'].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
  if (!file) throw new Error('templates.md not found next to ' + dir + ' (reinstall the e2e-scaffold skill)');
  const text = fs.readFileSync(file, 'utf8');
  const out: Record<string, string> = {};
  const re = /`([^`\n]+)`:\s*\r?\n```[a-z]*\r?\n([\s\S]*?)\r?\n```/g;
  for (const m of text.matchAll(re)) out[m[1]] = m[2].replace(/\r\n/g, '\n') + '\n';
  if (!Object.keys(out).length) throw new Error('no templates found in ' + file);
  return out;
}

const GITIGNORE_BLOCK = ['/test-results', '/playwright-report', '/blob-report', '/playwright/.cache'];

export interface InitResult { wrote: string[]; skipped: string[]; packageJson: string[]; gitignore: boolean; install: string | null; command: string; port: number }

export function init(cwd: string, opt: { port?: number; command?: string; dryRun?: boolean; force?: boolean; templatesDir?: string }): InitResult {
  const st = status(cwd);
  if (st.scaffolded && !opt.force) { const e = new Error('scaffold already present: ' + st.configFile + ' and ' + st.fixturesFile + ' (extend them; --force overwrites)'); (e as Error & { code: number }).code = 3; throw e; }
  const stack = st.stack;
  if (!stack && !opt.command) throw new Error('no package.json in ' + cwd + ': pass --command "<dev server command>" and --port');
  const command = opt.command ?? stack!.devCommand;
  if (!command) throw new Error('no dev/start/serve script in package.json: pass --command');
  const port = opt.port ?? stack!.port;
  const tpl = readTemplates(opt.templatesDir ?? __dirname);
  const useTs = stack ? stack.typescript : true;
  const wrote: string[] = [], skipped: string[] = [];
  for (const [rel, body] of Object.entries(tpl)) {
    const target = useTs ? rel : rel.replace(/\.ts$/, '.js');
    const abs = path.join(cwd, target);
    if (fs.existsSync(abs) && !opt.force) { skipped.push(target); continue; }
    const text = body.replace(/\{\{PORT\}\}/g, String(port)).replace(/\{\{DEV_COMMAND\}\}/g, command.replace(/'/g, "\\'"));
    if (!opt.dryRun) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); }
    wrote.push(target);
  }
  const packageJson: string[] = [];
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts['test:e2e']) { pkg.scripts['test:e2e'] = 'playwright test'; packageJson.push('scripts.test:e2e'); }
    if (packageJson.length && !opt.dryRun) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, /^\s+/m.exec(raw)?.[0].length === 4 ? 4 : 2) + (raw.endsWith('\n') ? '\n' : ''));
  }
  const giPath = path.join(cwd, '.gitignore');
  const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
  const missing = GITIGNORE_BLOCK.filter((l) => !gi.split(/\r?\n/).includes(l));
  if (missing.length && !opt.dryRun) fs.writeFileSync(giPath, gi + (gi && !gi.endsWith('\n') ? '\n' : '') + (gi ? '\n' : '') + '# playwright\n' + missing.join('\n') + '\n');
  const installCmd = stack && !stack.playwright ? ({ npm: 'npm i -D @playwright/test', pnpm: 'pnpm add -D @playwright/test', yarn: 'yarn add -D @playwright/test', bun: 'bun add -d @playwright/test' } as const)[stack.manager] + ' && npx playwright install chromium' : null;
  return { wrote, skipped, packageJson, gitignore: missing.length > 0, install: installCmd, command, port };
}

function renderStatus(s: Status): string {
  const L: string[] = [];
  L.push(s.scaffolded ? `scaffold present: ${s.configFile}, ${s.fixturesFile} -- extend, do not re-scaffold` : 'scaffold absent' + (s.configFile || s.fixturesFile ? ` (partial: ${s.configFile ?? '-'} / ${s.fixturesFile ?? '-'})` : ''));
  if (s.stack) L.push(`stack: ${s.stack.framework}, port ${s.stack.port}, ${s.stack.manager}, dev command: ${s.stack.devCommand || '(none found)'}, @playwright/test ${s.stack.playwright ? 'installed' : 'missing'}, ${s.stack.typescript ? 'TypeScript' : 'JavaScript'}`);
  else L.push('stack: no package.json (pass --command and --port to init)');
  return L.join('\n');
}

function renderInit(r: InitResult, dry: boolean): string {
  const L: string[] = [];
  const verb = dry ? 'would write' : 'wrote';
  for (const f of r.wrote) L.push(`${verb} ${f}`);
  for (const f of r.skipped) L.push(`kept ${f} (exists; --force overwrites)`);
  for (const k of r.packageJson) L.push(`${dry ? 'would add' : 'added'} ${k} to package.json`);
  if (r.gitignore) L.push(`${dry ? 'would add' : 'added'} playwright output folders to .gitignore`);
  L.push(`dev server: ${r.command} on port ${r.port} (edit playwright.config if wrong)`);
  if (r.install) L.push(`install first: ${r.install}`);
  L.push(`then run: npm run test:e2e`);
  return L.join('\n');
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  const a: { cwd: string; port?: number; command?: string; dryRun: boolean; force: boolean; json: boolean } = { cwd: process.cwd(), dryRun: false, force: false, json: false };
  let ok = cmd === 'status' || cmd === 'init';
  for (let i = 0; i < rest.length && ok; i++) {
    const f = rest[i];
    if (f === '--cwd') a.cwd = path.resolve(rest[++i] ?? '');
    else if (f === '--port') { a.port = Number(rest[++i]); if (!(a.port > 0)) ok = false; }
    else if (f === '--command') { a.command = rest[++i]; if (!a.command) ok = false; }
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--force') a.force = true;
    else if (f === '--json') a.json = true;
    else ok = false;
  }
  if (!ok) { console.error('usage: init.js status|init [--cwd D] [--port N] [--command "cmd"] [--dry-run] [--force] [--json]'); process.exitCode = 2; return; }
  try {
    if (cmd === 'status') { const s = status(a.cwd); console.log(a.json ? JSON.stringify(s) : renderStatus(s)); return; }
    const r = init(a.cwd, a);
    console.log(a.json ? JSON.stringify(r) : renderInit(r, a.dryRun));
  } catch (e) {
    const err = e as Error & { code?: number };
    console.error('error: ' + err.message);
    process.exitCode = err.code === 3 ? 3 : 1;
  }
}

if (require.main === module) main();
