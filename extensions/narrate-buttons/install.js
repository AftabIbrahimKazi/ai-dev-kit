#!/usr/bin/env node
// Copies this extension into VS Code's extensions folder (no build, no marketplace). Restart or reload VS Code after.
//   node install.js            install or update
//   node install.js --remove   uninstall
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const dest = path.join(os.homedir(), '.vscode', 'extensions', `${pkg.publisher}.${pkg.name}-${pkg.version}`);
const stale = () => fs.readdirSync(path.dirname(dest)).filter((d) => d.startsWith(`${pkg.publisher}.${pkg.name}-`)).map((d) => path.join(path.dirname(dest), d));

fs.mkdirSync(path.dirname(dest), { recursive: true });
for (const d of stale()) fs.rmSync(d, { recursive: true, force: true });
if (process.argv.includes('--remove')) { console.log('removed'); process.exit(0); }
fs.mkdirSync(path.join(dest, 'media'), { recursive: true });
for (const f of ['package.json', 'extension.js', 'lib.js', 'media/icon.svg']) fs.copyFileSync(path.join(__dirname, f), path.join(dest, f));
console.log(`installed to ${dest}\nReload VS Code (Developer: Reload Window). The buttons appear at the right of the status bar.`);
