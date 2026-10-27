const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/workflow/optimize-assets.convert.js');
const { parseArgs, scan, refs, precompress, compressAll, convertFile, pickEngine, buildSpec, outPath, readDims } = require(SCRIPT);

const t = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (...a) => spawnSync('node', [SCRIPT, ...a], { encoding: 'utf8' });
const proj = (files = {}) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-'));
  for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), s); }
  return d;
};

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w, h) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const all = { sharp: '/x/sharp', magick: true, ffmpeg: true, svgo: { bin: 'svgo', pre: [] }, woff2: true, oxipng: true };
const none = { sharp: null, magick: false, ffmpeg: false, svgo: null, woff2: false, oxipng: false };
const opts = (extra = {}) => ({ ...parseArgs(['convert', 'x', '--to', 'webp']), ...extra });
const writer = (size) => async (spec) => { fs.writeFileSync(spec.out || spec.args[spec.args.length - 1], Buffer.alloc(size, 1)); return { ok: true }; };

(async () => {
  await t('arguments: convert needs --to, rejects unknown options and bad numbers, presets fill gaps only', () => {
    assert.throws(() => parseArgs(['convert', 'a.png']), /needs --to/);
    assert.throws(() => parseArgs(['convert', 'a.png', '--to', 'gif']), /--to must be one of/);
    assert.throws(() => parseArgs(['scan', '--nope']), /unknown option/);
    assert.throws(() => parseArgs(['scan', '--min-kb', '0']), /positive number/);
    const p = parseArgs(['convert', 'a.png', '--preset', 'claude', '--quality', '60']);
    assert.deepStrictEqual([p.to, p.quality, p.maxEdge], ['jpg', 60, 1568]);
    assert.strictEqual(parseArgs(['convert', 'a.jpg', '--to', 'jpeg']).to, 'jpg');
    assert.strictEqual(parseArgs(['src/img']).cmd, 'scan');
  });

  await t('readDims reads png, gif, jpeg and webp headers', () => {
    const d = proj();
    fs.writeFileSync(path.join(d, 'a.png'), png(300, 40));
    fs.writeFileSync(path.join(d, 'a.gif'), Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x20, 0x03, 0x58, 0x02])]));
    const jpg = Buffer.alloc(40); jpg.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20]);
    fs.writeFileSync(path.join(d, 'a.jpg'), jpg);
    const webp = Buffer.alloc(40); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8X', 12); webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(599, 27, 3);
    fs.writeFileSync(path.join(d, 'a.webp'), webp);
    assert.deepStrictEqual(readDims(path.join(d, 'a.png')), [300, 40]);
    assert.deepStrictEqual(readDims(path.join(d, 'a.gif')), [800, 600]);
    assert.deepStrictEqual(readDims(path.join(d, 'a.jpg')), [800, 600]);
    assert.deepStrictEqual(readDims(path.join(d, 'a.webp')), [800, 600]);
  });

  await t('scan flags big, wide, legacy and font assets, sorts by size, skips vendor and built folders', () => {
    const d = proj({ 'src/small.png': png(10, 10), 'src/wide.png': png(3000, 20), 'src/old.bmp': Buffer.alloc(2048), 'src/f.ttf': Buffer.alloc(2048), 'src/v.mp4': Buffer.alloc(5000), 'node_modules/x/n.png': png(4000, 10), 'dist/b.png': png(4000, 10) });
    const s = scan({ ...parseArgs(['scan', '--min-kb', '4']), cwd: d, paths: [] });
    const by = Object.fromEntries(s.rows.map((r) => [r.file, r]));
    assert.deepStrictEqual(Object.keys(by).sort(), ['src/f.ttf', 'src/old.bmp', 'src/v.mp4', 'src/wide.png']);
    assert.deepStrictEqual(by['src/wide.png'].flags, ['wide']);
    assert.strictEqual(by['src/wide.png'].width, 3000);
    assert.deepStrictEqual(by['src/v.mp4'].flags, ['big']);
    assert.strictEqual(by['src/v.mp4'].suggest, 're-encode mp4');
    assert.deepStrictEqual(by['src/f.ttf'].flags, ['font-legacy']);
    assert.strictEqual(by['src/f.ttf'].suggest, 'woff2');
    assert.strictEqual(s.assets, 5);
    assert.deepStrictEqual(s.rows.map((r) => r.kb), [...s.rows.map((r) => r.kb)].sort((a, b) => b - a));
  });

  await t('engine choice per kind, preference, and no engine', () => {
    assert.strictEqual(pickEngine('image', 'webp', all), 'sharp');
    assert.strictEqual(pickEngine('image', 'webp', { ...all, sharp: null }), 'magick');
    assert.strictEqual(pickEngine('image', 'avif', { ...none, ffmpeg: true }), null);
    assert.strictEqual(pickEngine('image', 'webp', all, 'ffmpeg'), 'ffmpeg');
    assert.strictEqual(pickEngine('image', 'webp', none, 'sharp'), null);
    assert.strictEqual(pickEngine('video', 'mp4', all), 'ffmpeg');
    assert.strictEqual(pickEngine('font', 'woff2', none), null);
  });

  await t('commands: magick resize guard, gif to mp4 gets even dimensions, sharp edge, woff2 sibling', () => {
    const o = opts({ quality: 70, maxEdge: 1600 });
    assert.deepStrictEqual(buildSpec('magick', 'image', '/a/p.gif', '/a/p.webp', 'webp', o, all).args, ['/a/p.gif[0]', '-resize', '1600x1600>', '-quality', '70', '/a/p.webp']);
    const v = buildSpec('ffmpeg', 'video', '/a/p.gif', '/a/p.mp4', 'mp4', opts(), all);
    assert.ok(v.args.includes('scale=trunc(iw/2)*2:trunc(ih/2)*2') && v.args.includes('+faststart'));
    const s = buildSpec('sharp', 'image', '/a/p.png', '/a/p.jpg', 'jpg', o, all);
    assert.deepStrictEqual([s.to, s.quality, s.maxEdge], ['jpeg', 70, 1600]);
    assert.strictEqual(buildSpec('woff2', 'font', '/f/a.ttf', '/f/a.woff2', 'woff2', opts(), all).sibling, '/f/a.woff2');
  });

  await t('output names: new extension beside the source, .opt when unchanged, mirrored under --out', () => {
    const o = opts({ cwd: '/p' });
    assert.strictEqual(outPath('/p/img/a.png', 'webp', o), path.join('/p/img', 'a.webp'));
    assert.strictEqual(outPath('/p/img/a.png', 'png', o), path.join('/p/img', 'a.opt.png'));
    assert.strictEqual(outPath('/p/img/a.jpeg', 'jpg', o), path.join('/p/img', 'a.opt.jpg'));
    assert.strictEqual(outPath('/p/img/a.png', 'webp', { ...o, out: 'min' }), path.join(path.resolve('/p/min'), 'img', 'a.webp'));
  });

  await t('convert: smaller output is kept, the original is untouched', async () => {
    const d = proj({ 'a.png': Buffer.alloc(5000, 7) });
    const r = await convertFile(path.join(d, 'a.png'), opts({ cwd: d }), { tools: all, exec: writer(1000) });
    assert.deepStrictEqual([r.status, r.from, r.to, r.out], ['converted', 5000, 1000, 'a.webp']);
    assert.strictEqual(fs.statSync(path.join(d, 'a.png')).size, 5000);
    assert.ok(fs.existsSync(path.join(d, 'a.webp')));
  });
  await t('convert: a larger output is deleted and reported kept-original; --keep-larger keeps it', async () => {
    const d = proj({ 'a.png': Buffer.alloc(1000, 7) });
    const r = await convertFile(path.join(d, 'a.png'), opts({ cwd: d }), { tools: all, exec: writer(3000) });
    assert.strictEqual(r.status, 'kept-original');
    assert.ok(!fs.existsSync(path.join(d, 'a.webp')));
    const k = await convertFile(path.join(d, 'a.png'), opts({ cwd: d, keepLarger: true }), { tools: all, exec: writer(3000) });
    assert.strictEqual(k.status, 'converted');
  });
  await t('convert: an existing output is skipped unless --force', async () => {
    const d = proj({ 'a.png': Buffer.alloc(5000), 'a.webp': Buffer.alloc(10, 9) });
    const r = await convertFile(path.join(d, 'a.png'), opts({ cwd: d }), { tools: all, exec: writer(100) });
    assert.strictEqual(r.status, 'skipped-exists');
    assert.strictEqual(fs.statSync(path.join(d, 'a.webp')).size, 10);
    assert.strictEqual((await convertFile(path.join(d, 'a.png'), opts({ cwd: d, force: true }), { tools: all, exec: writer(100) })).status, 'converted');
  });
  await t('convert: no converter gives an install hint; a wrong pairing is an error; dry-run writes nothing', async () => {
    const d = proj({ 'a.png': Buffer.alloc(5000), 'a.mp3': Buffer.alloc(5000) });
    const noEngine = await convertFile(path.join(d, 'a.png'), opts({ cwd: d }), { tools: none, exec: writer(1) });
    assert.match(noEngine.error, /no converter for image to webp: install sharp/);
    const wrong = await convertFile(path.join(d, 'a.mp3'), opts({ cwd: d }), { tools: all, exec: writer(1) });
    assert.match(wrong.error, /cannot convert \.mp3 to webp/);
    const dry = await convertFile(path.join(d, 'a.png'), opts({ cwd: d, dry: true }), { tools: all, exec: writer(1) });
    assert.strictEqual(dry.status, 'planned');
    assert.ok(!fs.existsSync(path.join(d, 'a.webp')));
  });
  await t('convert: a failing converter leaves no partial output', async () => {
    const d = proj({ 'a.png': Buffer.alloc(5000) });
    const exec = async (spec) => { fs.writeFileSync(spec.out, ''); return { ok: false, error: 'boom' }; };
    const r = await convertFile(path.join(d, 'a.png'), opts({ cwd: d }), { tools: all, exec });
    assert.deepStrictEqual([r.status, r.error], ['error', 'boom']);
    assert.ok(!fs.existsSync(path.join(d, 'a.webp')));
  });
  await t('convert: woff2_compress output beside the source moves to the requested place', async () => {
    const d = proj({ 'f/a.ttf': Buffer.alloc(9000) });
    const exec = async (spec) => { fs.writeFileSync(spec.sibling, Buffer.alloc(3000)); return { ok: true }; };
    const r = await convertFile(path.join(d, 'f/a.ttf'), { ...parseArgs(['convert', 'x', '--to', 'woff2', '--out', 'min']), cwd: d }, { tools: all, exec });
    assert.strictEqual(r.status, 'converted');
    assert.ok(fs.existsSync(path.join(d, 'min', 'f', 'a.woff2')) && !fs.existsSync(path.join(d, 'f', 'a.woff2')));
  });

  await t('refs lists every file and line that mentions an asset name', () => {
    const d = proj({ 'index.html': '<img src="img/hero.png">\n<p>x</p>\n', 'css/a.css': '.a{background:url(../img/hero.png)}', 'notes.txt': 'hero.png' });
    const r = refs({ ...parseArgs(['refs', 'img/hero.png']), cwd: d });
    assert.deepStrictEqual(r['img/hero.png'].sort(), ['css/a.css:1', 'index.html:1']);
  });

  await t('avif: --to takes a comma list, the web preset is webp plus avif, ffmpeg alone cannot make avif', () => {
    assert.deepStrictEqual(parseArgs(['convert', 'a.png', '--to', 'webp,avif']).targets, ['webp', 'avif']);
    assert.deepStrictEqual(parseArgs(['convert', 'a.png', '--preset', 'web']).targets, ['webp', 'avif']);
    assert.throws(() => parseArgs(['convert', 'a.png', '--to', 'webp,gif']), /--to must be one of/);
    assert.strictEqual(pickEngine('image', 'avif', { ...none, ffmpeg: true }), null);
    assert.strictEqual(buildSpec('sharp', 'image', '/a/p.png', '/a/p.avif', 'avif', opts(), all).to, 'avif');
  });
  await t('avif: both targets are written side by side from one source', async () => {
    const d = proj({ 'a.png': Buffer.alloc(8000, 7) });
    const base = parseArgs(['convert', 'a.png', '--to', 'webp,avif']);
    const rows = [];
    for (const to of base.targets) rows.push(await convertFile(path.join(d, 'a.png'), { ...base, cwd: d, to }, { tools: all, exec: writer(to === 'avif' ? 1500 : 2500) }));
    assert.deepStrictEqual(rows.map((r) => [r.out, r.status]), [['a.webp', 'converted'], ['a.avif', 'converted']]);
  });

  await t('compress: png and jpeg keep their format under an .opt name; gif and bmp are skipped with a pointer to convert', async () => {
    const d = proj({ 'img/a.png': Buffer.alloc(5000, 1), 'img/b.jpeg': Buffer.alloc(5000, 1), 'img/c.gif': Buffer.alloc(100), 'img/a.opt.png': Buffer.alloc(10) });
    const o = { ...parseArgs(['compress', 'img']), cwd: d };
    const rows = await compressAll(o, { tools: all, exec: writer(1000) });
    assert.deepStrictEqual(rows.map((r) => [r.file, r.out, r.status]).sort(), [['img/a.png', 'img/a.opt.png', 'skipped-exists'], ['img/b.jpeg', 'img/b.opt.jpg', 'converted']]);
    const named = await compressAll({ ...parseArgs(['compress', 'img/c.gif']), cwd: d }, { tools: all, exec: writer(1) });
    assert.match(named[0].error, /use convert/);
  });
  await t('a gif is never flattened to one frame unless --first-frame is given; mp4 is fine', async () => {
    const d = proj({ 'a.gif': Buffer.alloc(9000, 1) });
    const gif = path.join(d, 'a.gif');
    const blocked = await convertFile(gif, opts({ cwd: d }), { tools: all, exec: writer(100) });
    assert.match(blocked.error, /may be animated/);
    assert.strictEqual((await convertFile(gif, opts({ cwd: d, firstFrame: true }), { tools: all, exec: writer(100) })).status, 'converted');
    assert.strictEqual((await convertFile(gif, opts({ cwd: d, to: 'mp4' }), { tools: all, exec: writer(100) })).status, 'converted');
  });
  await t('compress: --lossless sends a png to oxipng only when it is installed', () => {
    assert.strictEqual(pickEngine('image', 'png', all, null, true), 'oxipng');
    assert.strictEqual(pickEngine('image', 'png', { ...all, oxipng: false }, null, true), 'sharp');
    assert.strictEqual(pickEngine('image', 'png', all, null, false), 'sharp');
    assert.deepStrictEqual(buildSpec('oxipng', 'image', '/a/p.png', '/a/p.opt.png', 'png', opts(), all).args, ['-o', '4', '--strip', 'safe', '--out', '/a/p.opt.png', '/a/p.png']);
  });
  await t('compress: an output that is not smaller leaves the original and no file behind', async () => {
    const d = proj({ 'a.png': Buffer.alloc(1000, 1) });
    const rows = await compressAll({ ...parseArgs(['compress', 'a.png']), cwd: d }, { tools: all, exec: writer(2000) });
    assert.strictEqual(rows[0].status, 'kept-original');
    assert.ok(!fs.existsSync(path.join(d, 'a.opt.png')));
  });

  await t('precompress writes real, decodable .gz and .br copies of text assets only when smaller', () => {
    const zlib = require('node:zlib');
    const css = '.card { color: red; padding: 8px; }\n'.repeat(200);
    const d = proj({ 'a.css': css, 'tiny.js': 'x', 'logo.png': Buffer.alloc(3000), 'font.woff2': Buffer.alloc(3000) });
    const rows = precompress({ ...parseArgs(['precompress', '.']), cwd: d, paths: ['.'] });
    const by = Object.fromEntries(rows.map((r) => [r.out, r.status]));
    assert.deepStrictEqual(by, { 'a.css.gz': 'converted', 'a.css.br': 'converted', 'tiny.js.gz': 'kept-original', 'tiny.js.br': 'kept-original' });
    assert.strictEqual(zlib.gunzipSync(fs.readFileSync(path.join(d, 'a.css.gz'))).toString(), css);
    assert.strictEqual(zlib.brotliDecompressSync(fs.readFileSync(path.join(d, 'a.css.br'))).toString(), css);
    assert.ok(!fs.existsSync(path.join(d, 'tiny.js.gz')));
  });
  await t('precompress: --gzip alone, existing outputs skipped, --dry-run writes nothing', () => {
    const d = proj({ 'a.css': '.card { color: red; }\n'.repeat(300) });
    const dry = precompress({ ...parseArgs(['precompress', 'a.css', '--gzip', '--dry-run']), cwd: d });
    assert.deepStrictEqual(dry.map((r) => [r.out, r.status]), [['a.css.gz', 'planned']]);
    assert.ok(!fs.existsSync(path.join(d, 'a.css.gz')));
    precompress({ ...parseArgs(['precompress', 'a.css', '--gzip']), cwd: d });
    const again = precompress({ ...parseArgs(['precompress', 'a.css', '--gzip']), cwd: d });
    assert.strictEqual(again[0].status, 'skipped-exists');
  });

  await t('cli: tools --json lists the six engines; scan runs; a bad option exits 2; convert of a missing path exits 2', () => {
    assert.deepStrictEqual(Object.keys(JSON.parse(cli('tools', '--json').stdout)).sort(), ['ffmpeg', 'magick', 'oxipng', 'sharp', 'svgo', 'woff2']);
    const d = proj({ 'a.bmp': Buffer.alloc(100) });
    const s = cli('scan', '--cwd', d, '--json');
    assert.strictEqual(JSON.parse(s.stdout).flagged, 1);
    assert.strictEqual(cli('scan', '--bogus').status, 2);
    assert.strictEqual(cli('convert', 'nope.png', '--to', 'webp', '--cwd', d).status, 2);
  });
})();

(async () => {
  await t('readDims ignores a file whose bytes are not the format its name claims', () => {
    const d = proj({ 'fake.png': Buffer.alloc(200, 1), 'fake.gif': Buffer.alloc(50, 1) });
    assert.strictEqual(readDims(path.join(d, 'fake.png')), null);
    assert.strictEqual(readDims(path.join(d, 'fake.gif')), null);
    const s = scan({ ...parseArgs(['scan', '--min-kb', '100000']), cwd: d, paths: [] });
    assert.deepStrictEqual(s.rows, []);
  });
})();

(async () => {
  await t('the vision preset and its claude alias are the same settings', () => {
    const a = parseArgs(['convert', 'x.png', '--preset', 'vision']);
    const b = parseArgs(['convert', 'x.png', '--preset', 'claude']);
    assert.deepStrictEqual([a.targets, a.quality, a.maxEdge], [b.targets, b.quality, b.maxEdge]);
    assert.strictEqual(a.maxEdge, 1568);
  });
})();
