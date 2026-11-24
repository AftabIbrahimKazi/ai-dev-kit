const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const m = require('../skills/mcp/mcp-manager.config.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const CLI = path.join(__dirname, '..', 'skills', 'mcp', 'mcp-manager.config.js');
const proj = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcp space-'));
const run = (root, ...a) => spawnSync(process.execPath, [CLI, ...a, '--root', root], { encoding: 'utf8' });
const rd = (root, f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

t('claude remote entry uses ${VAR}; opencode remote uses {env:VAR}; the secret is never written', () => {
  const spec = { url: 'https://x.example/mcp', headers: [['X-Goog-Api-Key', 'STITCH_API_KEY']] };
  assert.deepStrictEqual(m.entryFor('claude', spec), { type: 'http', url: 'https://x.example/mcp', headers: { 'X-Goog-Api-Key': '${STITCH_API_KEY}' } });
  assert.deepStrictEqual(m.entryFor('opencode', spec), { type: 'remote', url: 'https://x.example/mcp', enabled: true, headers: { 'X-Goog-Api-Key': '{env:STITCH_API_KEY}' } });
});

t('local entries: claude command/args, opencode command array with a long default timeout', () => {
  const spec = { command: 'node', args: ['/p/local-vision.js', 'mcp'] };
  assert.deepStrictEqual(m.entryFor('claude', spec), { command: 'node', args: ['/p/local-vision.js', 'mcp'] });
  assert.deepStrictEqual(m.entryFor('opencode', spec), { type: 'local', command: ['node', '/p/local-vision.js', 'mcp'], enabled: true, timeout: 240000 });
  assert.strictEqual(m.entryFor('opencode', { ...spec, timeout: 9000 }).timeout, 9000);
});

t('validate rejects a literal secret where an env var name belongs, and bad shapes', () => {
  assert.match(m.validate('s', { url: 'https://x', headers: [['K', 'sk-abc123!secret']] }), /never the secret/);
  assert.match(m.validate('s', { url: 'https://x', command: 'node' }), /exactly one/);
  assert.match(m.validate('s', {}), /exactly one/);
  assert.match(m.validate('bad name', { url: 'https://x' }), /letters, digits/);
  assert.match(m.validate('s', { url: 'ftp://x' }), /http/);
  assert.match(m.validate('s', { command: 'node', env: [['K', 'V']] }, 'opencode'), /not verified/);
  assert.strictEqual(m.validate('s', { command: 'node', env: [['K', 'V']] }, 'claude'), null);
});

t('add creates .mcp.json, keeps other servers and keys, and is idempotent', () => {
  const d = proj();
  fs.writeFileSync(path.join(d, '.mcp.json'), JSON.stringify({ other: 1, mcpServers: { keep: { command: 'x' } } }));
  let r = run(d, 'add', '--tool', 'claude', '--name', 'stitch', '--url', 'https://s.example/mcp', '--header', 'X-Key=STITCH_API_KEY');
  assert.strictEqual(r.status, 0, r.stderr);
  const j = rd(d, '.mcp.json');
  assert.strictEqual(j.other, 1);
  assert.deepStrictEqual(j.mcpServers.keep, { command: 'x' });
  assert.strictEqual(j.mcpServers.stitch.headers['X-Key'], '${STITCH_API_KEY}');
  r = run(d, 'add', '--tool', 'claude', '--name', 'stitch', '--url', 'https://s.example/mcp', '--header', 'X-Key=STITCH_API_KEY');
  assert.match(r.stdout, /unchanged/);
});

t('a different entry under the same name is refused unless --replace, and only that entry changes', () => {
  const d = proj();
  run(d, 'add', '--tool', 'claude', '--name', 's', '--url', 'https://a.example');
  run(d, 'add', '--tool', 'claude', '--name', 'other', '--url', 'https://o.example');
  const refused = run(d, 'add', '--tool', 'claude', '--name', 's', '--url', 'https://b.example');
  assert.strictEqual(refused.status, 1);
  assert.strictEqual(rd(d, '.mcp.json').mcpServers.s.url, 'https://a.example');
  assert.strictEqual(run(d, 'add', '--tool', 'claude', '--name', 's', '--url', 'https://b.example', '--replace').status, 0);
  const j = rd(d, '.mcp.json');
  assert.strictEqual(j.mcpServers.s.url, 'https://b.example');
  assert.strictEqual(j.mcpServers.other.url, 'https://o.example');
});

t('opencode project file uses the mcp key and keeps the rest of the config', () => {
  const d = proj();
  fs.writeFileSync(path.join(d, 'opencode.json'), JSON.stringify({ model: 'x/y', mcp: { a: { type: 'remote', url: 'https://a', enabled: true } } }));
  assert.strictEqual(run(d, 'add', '--tool', 'opencode', '--name', 'lv', '--command', 'node', '--arg', '/p/lv.js', '--arg', 'mcp').status, 0);
  const j = rd(d, 'opencode.json');
  assert.strictEqual(j.model, 'x/y');
  assert.deepStrictEqual(Object.keys(j.mcp), ['a', 'lv']);
  assert.strictEqual(j.mcp.lv.timeout, 240000);
});

t('a file with comments or trailing commas is never rewritten; the entry is printed instead (exit 3)', () => {
  const d = proj();
  const original = '{\n  // my notes\n  "model": "x/y",\n}\n';
  fs.writeFileSync(path.join(d, 'opencode.json'), original);
  const r = run(d, 'add', '--tool', 'opencode', '--name', 's', '--url', 'https://s.example');
  assert.strictEqual(r.status, 3);
  assert.match(r.stderr, /by hand/);
  assert.match(r.stderr, /"url": "https:\/\/s.example"/);
  assert.strictEqual(fs.readFileSync(path.join(d, 'opencode.json'), 'utf8'), original);
});

t('--dry-run writes nothing', () => {
  const d = proj();
  const r = run(d, 'add', '--tool', 'claude', '--name', 's', '--url', 'https://s.example', '--dry-run');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /would be added/);
  assert.ok(!fs.existsSync(path.join(d, '.mcp.json')));
});

t('remove deletes only the named server; an absent name changes nothing', () => {
  const d = proj();
  run(d, 'add', '--tool', 'claude', '--name', 'a', '--url', 'https://a.example');
  run(d, 'add', '--tool', 'claude', '--name', 'b', '--url', 'https://b.example');
  assert.match(run(d, 'remove', '--tool', 'claude', '--name', 'a').stdout, /removed/);
  assert.deepStrictEqual(Object.keys(rd(d, '.mcp.json').mcpServers), ['b']);
  assert.match(run(d, 'remove', '--tool', 'claude', '--name', 'zzz').stdout, /absent/);
  assert.strictEqual(run(d, 'list', '--tool', 'claude').stdout.trim(), 'b');
});

t('claude user scope prints the command and writes no file', () => {
  const d = proj();
  const r = run(d, 'add', '--tool', 'claude', '--scope', 'user', '--name', 'stitch', '--url', 'https://s.example/mcp', '--header', 'X-Key=STITCH_API_KEY');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /claude mcp add --scope user --transport http stitch https:\/\/s.example\/mcp --header "X-Key: \$\{STITCH_API_KEY\}"/);
  assert.deepStrictEqual(fs.readdirSync(d), []);
});

t('pin adds one line per server, replaces it on change, leaves the rest of the file alone, keeps CRLF', () => {
  const d = proj();
  fs.writeFileSync(path.join(d, 'CLAUDE.md'), '# Rules\r\n\r\nKeep it short.\r\n');
  fs.writeFileSync(path.join(d, 'AGENTS.md'), '# Agents\n');
  assert.strictEqual(run(d, 'pin', '--name', 'stitch', '--trigger', 'UI mockups', '--fallback', 'writing the HTML by hand').status, 0);
  const c = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  assert.ok(c.startsWith('# Rules\r\n\r\nKeep it short.\r\n\r\nMCP stitch: for UI mockups, try it FIRST'));
  assert.ok(!/[^\r]\n/.test(c.replace(/\n$/, '')), 'no bare LF added to a CRLF file');
  assert.match(fs.readFileSync(path.join(d, 'AGENTS.md'), 'utf8'), /MCP stitch: for UI mockups/);
  run(d, 'pin', '--name', 'stitch', '--trigger', 'UI work', '--fallback', 'plain HTML');
  const c2 = fs.readFileSync(path.join(d, 'CLAUDE.md'), 'utf8');
  assert.strictEqual((c2.match(/MCP stitch:/g) || []).length, 1);
  assert.match(c2, /for UI work/);
  assert.match(run(d, 'pin', '--name', 'stitch', '--trigger', 'UI work', '--fallback', 'plain HTML').stdout, /unchanged/);
});

t('pin with no instruction file present refuses unless --files names one', () => {
  const d = proj();
  assert.strictEqual(run(d, 'pin', '--name', 's', '--trigger', 't', '--fallback', 'f').status, 1);
  assert.strictEqual(run(d, 'pin', '--name', 's', '--trigger', 't', '--fallback', 'f', '--files', 'AGENTS.md').status, 0);
  assert.ok(fs.existsSync(path.join(d, 'AGENTS.md')));
});
