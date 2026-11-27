const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'skills', 'meta', 'external-refs.json');
const raw = fs.readFileSync(FILE, 'utf8');
const data = JSON.parse(raw);
const refs = data.refs;
const credits = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
const KINDS = ['clone', 'release-zip', 'pip', 'npm-npx'];

t('registry has entries', () => assert.ok(Array.isArray(refs) && refs.length > 0));

t('ids are unique, lowercase and path-safe', () => {
  const seen = new Set();
  for (const r of refs) {
    assert.match(r.id, /^[a-z0-9][a-z0-9-]*$/, 'bad id ' + r.id);
    assert.ok(!seen.has(r.id), 'duplicate id ' + r.id);
    seen.add(r.id);
  }
});

t('required fields present on every entry', () => {
  for (const r of refs) {
    for (const k of ['id', 'name', 'repo', 'licence', 'kind', 'ref', 'usedBy', 'detect', 'credit']) {
      assert.ok(r[k] !== undefined && r[k] !== '', r.id + ' missing ' + k);
    }
    assert.ok(KINDS.includes(r.kind), r.id + ' bad kind ' + r.kind);
    assert.ok(Array.isArray(r.usedBy) && r.usedBy.length > 0, r.id + ' usedBy empty');
  }
});

t('repo is a plain https URL (the backlink)', () => {
  for (const r of refs) assert.match(r.repo, /^https:\/\/[a-z0-9.-]+\/[^\s]+$/i, r.id + ' bad repo');
});

t('every entry is pinned, or live with a stated reason', () => {
  for (const r of refs) {
    if (r.ref === 'live') assert.ok(r.refNote && r.refNote.length > 20, r.id + ' live ref needs refNote');
    else assert.match(r.ref, /^(v?\d[\w.-]*|[0-9a-f]{7,40})$/, r.id + ' ref is not a tag or commit');
  }
});

t('release-zip entries carry asset and sha256', () => {
  for (const r of refs.filter(x => x.kind === 'release-zip')) {
    assert.ok(r.asset, r.id + ' missing asset');
    assert.match(r.sha256, /^[0-9a-f]{64}$/, r.id + ' bad sha256');
  }
});

t('every entry has a CREDITS.md row naming it and linking the repo', () => {
  for (const r of refs) {
    assert.ok(credits.includes(r.credit), r.id + ' CREDITS.md has no ' + r.credit);
    assert.ok(credits.includes(r.repo), r.id + ' CREDITS.md lacks the repo link ' + r.repo);
  }
});

t('stealth builds are never registered', () => {
  for (const r of refs) assert.ok(!/stealth/i.test(r.asset || ''), r.id + ' registers a stealth build');
});

t('no secrets in the registry', () => {
  assert.ok(!/(api[_-]?key|token|secret|password|bearer)\s*"?\s*[:=]\s*"[^"]{8,}/i.test(raw), 'secret-looking value');
  assert.ok(!/\b(sk-|ghp_|AIza|xox[bp]-)[A-Za-z0-9_-]{10,}/.test(raw), 'key-shaped string');
});
