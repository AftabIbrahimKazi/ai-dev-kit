// Stand-in for the claude command in install-kit tests: records its arguments and, on a plugin install, enables the plugin in settings.json.
const fs = require('node:fs');
const path = require('node:path');
const a = process.argv.slice(2);
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, a.join(' ') + '\n');
if (process.env.FAKE_CLAUDE_FAIL === 'marketplace' && a[1] === 'marketplace') { console.error('boom: no network'); process.exit(1); }
if (process.env.FAKE_CLAUDE_FAIL === 'install' && a[1] === 'install') { console.error('boom: install refused'); process.exit(1); }
if (a[0] === 'plugin' && a[1] === 'install' && process.env.FAKE_CLAUDE_FAIL !== 'silent') {
  const dir = process.env.CLAUDE_CONFIG_DIR;
  const file = path.join(dir, 'settings.json');
  let j = {}; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  j.enabledPlugins = { ...(j.enabledPlugins || {}), [a[2]]: true };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(j));
}
