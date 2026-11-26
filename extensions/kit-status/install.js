#!/usr/bin/env node
// Copies this extension into VS Code's extensions folder (no build, no marketplace). Reload VS Code after.
//   node install.js            install or update
//   node install.js --remove   uninstall
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const root = path.join(os.homedir(), '.vscode', 'extensions');
const dest = path.join(root, `${pkg.publisher}.${pkg.name}-${pkg.version}`);
const stale = () => (fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith(`${pkg.publisher}.${pkg.name}-`)).map((d) => path.join(root, d)) : []);

for (const d of stale()) fs.rmSync(d, { recursive: true, force: true });
if (process.argv.includes('--remove')) { console.log('removed'); process.exit(0); }
fs.mkdirSync(dest, { recursive: true });
for (const f of ['package.json', 'extension.js', 'lib.js']) fs.copyFileSync(path.join(__dirname, f), path.join(dest, f));
console.log(`installed to ${dest}\nReload VS Code (Developer: Reload Window). A "kit: N" counter appears at the right of the status bar.`);
