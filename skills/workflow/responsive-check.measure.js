#!/usr/bin/env node
// Browser half of the responsive-check skill: loads a page at each viewport width and reports layout problems.
// Needs Playwright in the project (the e2e-scaffold skill installs it); the kit itself has no dependencies.
//
//   node measure.js --url URL --widths 320,448,575 [--height 900] [--tap 44] [--shots DIR] [--cwd D] [--json]
//
// Per width: overflow-x (with up to 5 offending selectors), tap targets under --tap px (inline links are exempt),
// and text clipped by overflow:hidden without an ellipsis. Widths are whole pixels: pass the plan's "viewport" values.
// Exit 1 when any width has a finding, 2 on a usage or setup error.
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const o = { url: null, widths: [], height: 900, tap: 44, shots: null, cwd: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') o.url = argv[++i];
    else if (a === '--widths') o.widths = String(argv[++i]).split(',').map(Number);
    else if (a === '--height') o.height = Number(argv[++i]);
    else if (a === '--tap') o.tap = Number(argv[++i]);
    else if (a === '--shots') o.shots = path.resolve(argv[++i]);
    else if (a === '--cwd') o.cwd = path.resolve(argv[++i]);
    else if (a === '--json') o.json = true;
  }
  if (!o.url) throw new Error('--url is required');
  if (!o.widths.length || o.widths.some((w) => !Number.isInteger(w) || w <= 0)) throw new Error('--widths needs whole pixel widths, e.g. 320,448,575');
  return o;
}

function loadChromium(cwd, names = ['playwright', '@playwright/test', 'playwright-core']) {
  for (const name of names) {
    try { return require(require.resolve(name, { paths: [cwd] })).chromium; } catch { /* try the next package */ }
  }
  throw new Error(`Playwright is not installed for ${cwd}; run the e2e-scaffold skill, or: npm i -D playwright && npx playwright install chromium`);
}

// Runs inside the page.
function inspect(minTap) {
  const vw = document.documentElement.clientWidth;
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''));
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const all = [...document.querySelectorAll('body *')];
  const overflowX = document.documentElement.scrollWidth > vw + 1;
  return {
    overflowX,
    offenders: overflowX ? all.filter((e) => shown(e) && e.getBoundingClientRect().right > vw + 1).slice(0, 5).map(name) : [],
    taps: [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button]')]
      .filter((e) => shown(e) && getComputedStyle(e).display !== 'inline')
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width < minTap || r.height < minTap; })
      .slice(0, 10).map(name),
    clipped: all.filter((e) => { const s = getComputedStyle(e); return (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1; }).slice(0, 5).map(name),
  };
}

async function measure(o) {
  const chromium = loadChromium(o.cwd);
  const browser = await chromium.launch();
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.goto(o.url, { waitUntil: 'load' });
    for (const width of o.widths) {
      await page.setViewportSize({ width, height: o.height });
      await page.waitForTimeout(150);
      const r = await page.evaluate(inspect, o.tap);
      if (o.shots) { fs.mkdirSync(o.shots, { recursive: true }); await page.screenshot({ path: path.join(o.shots, `w${width}.png`) }); }
      rows.push({ width, ...r, ok: !r.overflowX && !r.taps.length && !r.clipped.length });
    }
  } finally { await browser.close(); }
  return rows;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const rows = await measure(o);
  if (o.json) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) {
    console.log(`${r.width}  ${r.ok ? 'ok' : 'FINDING'}`);
    if (r.overflowX) console.log(`  overflow-x: ${r.offenders.join(', ') || 'page wider than viewport'}`);
    if (r.taps.length) console.log(`  tap targets under ${o.tap}px: ${r.taps.join(', ')}`);
    if (r.clipped.length) console.log(`  clipped text: ${r.clipped.join(', ')}`);
  }
  if (rows.some((r) => !r.ok)) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error('error: ' + e.message); process.exitCode = 2; });
module.exports = { parseArgs, loadChromium };
