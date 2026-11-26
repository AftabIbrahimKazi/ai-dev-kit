// Install-time text stripping: the pure renderer, the lint, and the library's own marked files (every combination must render clean).
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v = require('../skills/meta/install-kit.variants.js');

let failed = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };
const ctx = (over = {}) => ({ ...v.buildVariantCtx('claude', {}, 'win32'), ...over });

t('a block is kept when its condition holds and dropped when not; marker lines vanish with no blank gap', () => {
  const text = 'a\n<!--if tool=claude-->\nclaude only\n<!--/if-->\nb\n';
  assert.strictEqual(v.renderVariants(text, ctx()), 'a\nclaude only\nb\n');
  assert.strictEqual(v.renderVariants(text, ctx({ tool: 'codex' })), 'a\nb\n');
});

t('else: the other branch is kept when the condition fails', () => {
  const text = 'x\n<!--if os=windows-->\nwin\n<!--else-->\nunix\n<!--/if-->\ny';
  assert.strictEqual(v.renderVariants(text, ctx()), 'x\nwin\ny');
  assert.strictEqual(v.renderVariants(text, ctx({ os: 'linux' })), 'x\nunix\ny');
});

t('operators: = != with | for OR, ~ and !~ on lists, comma for AND', () => {
  const c = ctx({ tool: 'opencode', 'ai.review': ['code', 'ollama'] });
  const r = (cond) => v.renderVariants(`<!--if ${cond}-->\nYES\n<!--else-->\nNO\n<!--/if-->`, c);
  assert.strictEqual(r('tool=opencode|codex'), 'YES');
  assert.strictEqual(r('tool!=opencode'), 'NO');
  assert.strictEqual(r('ai.review~ollama'), 'YES');
  assert.strictEqual(r('ai.review~unified'), 'NO');
  assert.strictEqual(r('ai.review!~unified'), 'YES');
  assert.strictEqual(r('ai.review~ollama|unified'), 'YES');
  assert.strictEqual(r('tool=opencode,ai.review~unified'), 'NO', 'AND needs both');
  assert.strictEqual(r('tool=opencode,ai.review~code'), 'YES');
});

t('a file with no markers comes back byte for byte, and CRLF files stay CRLF', () => {
  assert.strictEqual(v.renderVariants('plain\r\ntext\r\n', ctx()), 'plain\r\ntext\r\n');
  const out = v.renderVariants('a\r\n<!--if tool=claude-->\r\nb\r\n<!--/if-->\r\nc\r\n', ctx());
  assert.strictEqual(out, 'a\r\nb\r\nc\r\n');
});

t('malformed blocks throw: nesting, unclosed, stray else or end, marker mid-line, unknown key, bad condition', () => {
  const bad = (text, re) => assert.throws(() => v.renderVariants(text, ctx()), re);
  bad('<!--if tool=claude-->\n<!--if os=windows-->\nx\n<!--/if-->\n<!--/if-->', /do not nest/);
  bad('<!--if tool=claude-->\nx', /never closed/);
  bad('x\n<!--else-->\ny', /without a matching/);
  bad('x\n<!--/if-->', /without a matching/);
  bad('text <!--if tool=claude--> more\n<!--/if-->', /alone on its line/);
  bad('<!--if colour=red-->\nx\n<!--/if-->', /unknown key/);
  bad('<!--if tool claude-->\nx\n<!--/if-->', /bad condition/);
  bad('<!--if tool=claude-->\na\n<!--else-->\nb\n<!--else-->\nc\n<!--/if-->', /without a matching/);
});

t('lintVariants reports a problem and passes a clean file', () => {
  assert.deepStrictEqual(v.lintVariants('<!--if tool=claude-->\nx\n<!--/if-->'), []);
  assert.strictEqual(v.lintVariants('<!--if tool=claude-->\nx').length, 1);
  assert.deepStrictEqual(v.lintVariants('no markers at all'), []);
});

t('buildVariantCtx: a missing or junk list takes the scripts default; an empty list stays empty', () => {
  const c = v.buildVariantCtx('opencode', { review: ['code'], tests: 'oops', coding: [] }, 'darwin');
  assert.deepStrictEqual([c.tool, c.os, c['ai.review'], c['ai.tests'], c['ai.image'], c['ai.coding'], c['ai.goldfish']], ['opencode', 'mac', ['code'], ['ollama', 'kaggle'], [], [], []]);
  assert.deepStrictEqual(v.buildVariantCtx('claude', {})['ai.coding'], ['kaggle'], 'no list: kaggle only, like codingSteps');
  assert.strictEqual(v.osName('linux'), 'linux');
  assert.strictEqual(v.buildVariantCtx(undefined, {}).tool, 'claude');
});

// ---- the library's own files ----
const SKILLS = path.join(__dirname, '..', 'skills');
function mdFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__pycache__') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) mdFiles(f, out); else if (/\.md$/i.test(e.name)) out.push(f);
  }
  return out;
}
const marked = mdFiles(SKILLS).filter((f) => v.hasVariants(fs.readFileSync(f, 'utf8')));

t('every library file with variant blocks lints clean', () => {
  for (const f of marked) assert.deepStrictEqual(v.lintVariants(fs.readFileSync(f, 'utf8')), [], path.relative(SKILLS, f));
});

t('every combination of tool and os renders each marked file with no marker left and some text left', () => {
  for (const f of marked) {
    const text = fs.readFileSync(f, 'utf8');
    for (const tool of ['claude', 'opencode', 'codex']) for (const osn of ['windows', 'mac', 'linux']) {
      const out = v.renderVariants(text, ctx({ tool, os: osn }));
      assert.ok(!/<!--(if |else-->|\/if-->)/.test(out), `${path.relative(SKILLS, f)} ${tool}/${osn}: a marker is left`);
      assert.ok(out.trim().length > 200, `${path.relative(SKILLS, f)} ${tool}/${osn}: nothing left`);
    }
  }
});

t('the installer renders a skill body and a companion for the chosen tool and keeps them in step on update', () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'vlib-'));
  const mk = (rel, body) => { const f = path.join(lib, 'skills', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
  mk('workflow/demo.md', '---\nname: demo\ndescription: d\n---\n# Demo\n<!--if tool=claude-->\nCLAUDE\n<!--else-->\nOTHER\n<!--/if-->\nend\n');
  mk('workflow/demo.extras.md', 'x\n<!--if ai.tests~unified-->\nROUTER\n<!--/if-->\nz\n');
  const inst = require('../skills/meta/install-kit.cli.js');
  const catalog = inst.listSkills(lib);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vroot-'));
  const run = (tool, ai) => inst.installOneSkill(lib, path.join(root, 'sk'), catalog, 'demo', { variantCtx: inst.variantCtxFor(root, tool, ai) });
  run('claude', { tests: ['unified'] });
  assert.ok(/CLAUDE/.test(fs.readFileSync(path.join(root, 'sk', 'demo', 'SKILL.md'), 'utf8')) && !/OTHER/.test(fs.readFileSync(path.join(root, 'sk', 'demo', 'SKILL.md'), 'utf8')));
  assert.ok(/ROUTER/.test(fs.readFileSync(path.join(root, 'sk', 'demo', 'extras.md'), 'utf8')));
  const again = run('claude', { tests: ['unified'] });
  assert.strictEqual(again.changed, false, 'a second run with the same answers changes nothing');
  run('codex', {});
  const body = fs.readFileSync(path.join(root, 'sk', 'demo', 'SKILL.md'), 'utf8');
  assert.ok(/OTHER/.test(body) && !/CLAUDE/.test(body), 'a different answer re-renders');
  assert.ok(!/ROUTER/.test(fs.readFileSync(path.join(root, 'sk', 'demo', 'extras.md'), 'utf8')));
  const broken = inst.installOneSkill(lib, path.join(root, 'sk2'), catalog, 'demo', { variantCtx: { tool: 'claude' } });
  assert.strictEqual(broken.error, undefined, 'a context missing a key does not fail the install');
});

if (failed) process.exit(1);
