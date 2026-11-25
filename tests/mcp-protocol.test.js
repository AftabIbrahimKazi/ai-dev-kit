// Both stdio MCP servers must answer the 2026-07-28 stateless protocol AND the legacy initialize handshake.
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const M = 'io.modelcontextprotocol/';
const modern = (v = '2026-07-28') => ({ _meta: { [M + 'protocolVersion']: v, [M + 'clientCapabilities']: {} } });
const talk = (server, msgs) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'skills', 'mcp', `mcp-manager.${server}.js`), 'mcp'],
    { input: msgs.map((m) => JSON.stringify({ jsonrpc: '2.0', ...m })).join('\n') + '\n', encoding: 'utf8', timeout: 15000 });
  return r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

for (const server of ['image-gen', 'local-vision']) {
  t(`${server}: stateless tools/list works with no initialize`, () => {
    const [r] = talk(server, [{ id: 1, method: 'tools/list', params: modern() }]);
    assert.strictEqual(r.result.resultType, 'complete');
    assert.ok(r.result.tools.length >= 1);
    assert.strictEqual(r.result.cacheScope, 'public');
  });
  t(`${server}: server/discover lists 2026-07-28 and serverInfo`, () => {
    const [r] = talk(server, [{ id: 1, method: 'server/discover', params: modern() }]);
    assert.ok(r.result.supportedVersions.includes('2026-07-28'));
    assert.strictEqual(r.result._meta[M + 'serverInfo'].name, server);
  });
  t(`${server}: missing _meta gets -32602`, () => {
    const [r] = talk(server, [{ id: 1, method: 'tools/list', params: {} }]);
    assert.strictEqual(r.error.code, -32602);
  });
  t(`${server}: unknown protocolVersion gets -32022 with supported list`, () => {
    const [r] = talk(server, [{ id: 1, method: 'tools/list', params: modern('1900-01-01') }]);
    assert.strictEqual(r.error.code, -32022);
    assert.ok(r.error.data.supported.includes('2026-07-28'));
  });
  t(`${server}: ping and logging/setLevel are method-not-found in stateless mode`, () => {
    const out = talk(server, [{ id: 1, method: 'ping' }, { id: 2, method: 'logging/setLevel', params: modern() }]);
    assert.strictEqual(out[0].error.code, -32601);
    assert.strictEqual(out[1].error.code, -32601);
  });
  t(`${server}: legacy initialize handshake still works, ping answered`, () => {
    const out = talk(server, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { method: 'notifications/initialized' },
      { id: 2, method: 'ping' },
      { id: 3, method: 'tools/list' },
    ]);
    assert.strictEqual(out[0].result.protocolVersion, '2025-06-18');
    assert.deepStrictEqual(out[1].result, {});
    assert.ok(out[2].result.tools.length >= 1);
  });
  t(`${server}: tool error still comes back as isError result with resultType`, () => {
    const [r] = talk(server, [{ id: 1, method: 'tools/call', params: { name: 'nope', arguments: {}, ...modern() } }]);
    assert.strictEqual(r.result.isError, true);
    assert.strictEqual(r.result.resultType, 'complete');
  });
}
