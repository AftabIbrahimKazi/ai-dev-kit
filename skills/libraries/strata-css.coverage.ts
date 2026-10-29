#!/usr/bin/env node
/**
 * strata-coverage — prints which CSS properties Strata can express as UTILITY
 * classes, and how. Run from a project that has strata-css installed:
 *
 *   node coverage.js                # full table
 *   node coverage.js padding        # only properties matching a string
 *   node coverage.js --zero         # properties you might expect but that have NO utility
 *
 * Reads the installed registry directly, so output always matches the version
 * actually in play — nothing hardcoded, nothing to go stale.
 *
 * Only the `utilities` layer is reported. Component classes (.alert, .card)
 * also set properties, but they aren't substitutes for a declaration.
 */
import path = require('node:path');

// The registry ships with the target project's own strata-css install, never with this kit --
// its shape is intentionally untyped here rather than guessed at.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadRegistry(): any {
  const tries = [
    'strata-css/src/registry/registry.js',
    path.resolve(process.cwd(), 'node_modules/strata-css/src/registry/registry.js'),
  ];
  for (const t of tries) {
    try { return require(t); } catch { /* next */ }
  }
  console.error('Could not load strata-css registry. Run from a project with strata-css installed.');
  process.exit(1);
}

const { EXACT_MAP, ARBITRARY_PATTERNS, lookup } = loadRegistry();
const BPS = ['sm', 'md', 'lg', 'xl', 'xxl'];
const PROBE = ' P ';

interface Coverage { named: Set<string>; namedBp: Set<string>; arb: Set<string>; arbBp: Set<string> }

const cov = new Map<string, Coverage>(); // property -> { named, namedBp, arb, arbBp }
const b = (p: string): Coverage => {
  if (!cov.has(p)) cov.set(p, { named: new Set(), namedBp: new Set(), arb: new Set(), arbBp: new Set() });
  return cov.get(p)!;
};

function propsOf(css: unknown): Set<string> {
  const out = new Set<string>();
  const body = String(css).replace(/@media[^{]*\{/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = /(?:^|[{;])\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/g;
  let m;
  while ((m = re.exec(body))) if (!m[1].startsWith('--')) out.add(m[1]);
  return out;
}

const bpOf = (cls: string, css: unknown): boolean =>
  /@media/.test(String(css)) || BPS.some((x) => cls.includes(`-${x}-`) || cls.endsWith(`-${x}`));

// ---- named utilities (utilities layer only) ------------------------------
for (const [cls, entry] of EXACT_MAP) {
  if (cls.startsWith('!')) continue;                    // !important twin, same props
  if (!entry || entry.layer !== 'utilities') continue;  // skip components/base
  const isBp = bpOf(cls, entry.css);
  for (const p of propsOf(entry.css)) (isBp ? b(p).namedBp : b(p).named).add(cls);
}

// ---- arbitrary bracket patterns ------------------------------------------
// Build a concrete sample class from each regex, then run it through the real
// lookup() so we record what it genuinely emits rather than guessing.
// Expand every alternation branch and every optional char-class member, so a
// pattern like (m[trblxyes]?|p[trblxyes]?) yields m, mt, mx, … p, pt, px, …
// rather than only its first branch.
const CAP = 400;
function expand(parts: string[][]): string[] {
  let out = [''];
  for (const alts of parts) {
    const next: string[] = [];
    for (const prefix of out) for (const a of alts) next.push(prefix + a);
    out = next.length > CAP ? next.slice(0, CAP) : next;
  }
  return out;
}

// Recursive so alternation branches that themselves contain char classes
// (e.g. `m[trblxyes]?|p[trblxyes]?`) expand fully instead of being emitted
// as literal, invalid class names.
function variants(s: string): string[] {
  const parts: string[][] = [];
  const re = /\(([^()]*)\)|\[([^\]]*)\](\?)?|([^([]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) {
      const branches: string[] = [];
      for (const alt of m[1].split('|')) branches.push(...variants(alt));
      parts.push(branches);
    } else if (m[2] !== undefined) {
      const chars = m[2].split('');
      parts.push(m[3] ? ['', ...chars] : chars);
    } else {
      parts.push([m[4].replace(/\\/g, '')]);
    }
  }
  return parts.length ? expand(parts) : [s.replace(/\\/g, '')];
}

function samplesFrom(src: string): string[] {
  let s = src.replace(/^\^/, '').replace(/\$$/, '');
  s = s.replace(/\(!\?\)/g, '');                      // drop optional ! flag
  s = s.replace(/\\\[\(\.\+\)\\\]/g, PROBE);          // \[(.+)\] -> sentinel
  return variants(s).map((x) => x.split(PROBE).join('[1px]'));
}

const traps = new Set<string>(); // class shapes that MATCH a pattern but emit nothing
for (const pat of ARBITRARY_PATTERNS) {
  const src = pat.re.source;
  const isBp = /\(sm\|md\|lg\|xl\|xxl\)/.test(src);
  for (const sample of samplesFrom(src)) {
    if (!sample.includes('[1px]')) continue;          // not an arbitrary form
    let res = null;
    try { res = lookup(sample); } catch { continue; }
    if (!res) {
      // Matches the pattern's own regex yet produces no CSS: a silent no-op.
      // Build succeeds, no warning, style simply absent. Worth surfacing.
      if (pat.re.test(sample)) traps.add(sample.replace('[1px]', '[…]'));
      continue;
    }
    const shape = sample.replace('[1px]', '[…]');
    for (const p of propsOf(res.css)) (isBp ? b(p).arbBp : b(p).arb).add(shape);
  }
}

// ---- report ---------------------------------------------------------------
const arg = process.argv[2];
const short = (s: Set<string>, n = 4): string => {
  const a = [...s].sort();
  return a.length <= n ? a.join(' ') : `${a.slice(0, n).join(' ')} …+${a.length - n}`;
};

if (arg === '--zero') {
  // Properties commonly wanted in a migration; report the ones with nothing.
  const WANTED = ['letter-spacing', 'line-height', 'font-family', 'font-variant-numeric', 'text-overflow',
    'border-color', 'border-style', 'border-width', 'scroll-snap-type', 'scroll-snap-align', 'fill', 'stroke',
    'transform', 'transform-origin', 'aspect-ratio', 'appearance', 'animation', 'white-space', 'grid-template-columns',
    'grid-template-rows', 'padding', 'margin', 'gap', 'box-shadow', 'border-radius', 'outline', 'opacity', 'z-index',
    'flex', 'flex-direction', 'justify-content', 'align-items', 'width', 'height', 'min-height', 'max-width', 'position',
    'display', 'overflow', 'color', 'background', 'background-color', 'font-size', 'font-weight', 'cursor', 'transition'];
  console.log('Properties with NO utility of any kind (must stay real CSS):\n');
  for (const p of WANTED) if (!cov.has(p)) console.log(`  ${p}`);
  console.log('\nProperties with ONLY named utilities (no arbitrary value support):\n');
  for (const p of WANTED) {
    const c = cov.get(p);
    if (c && !c.arb.size && !c.arbBp.size) console.log(`  ${p}  → ${short(c.named, 6)}`);
  }
  process.exit(0);
}

const rows = [...cov.entries()]
  .filter(([p]) => !arg || p.includes(arg))
  .sort(([x], [y]) => x.localeCompare(y));

console.log(`strata-css utility coverage — ${rows.length} propert${rows.length === 1 ? 'y' : 'ies'}${arg ? ` matching "${arg}"` : ''}`);
console.log('[arb] arbitrary bracket · [arb-bp] breakpoint-scoped arbitrary · named-bp: breakpoint-scoped named\n');
for (const [prop, c] of rows) {
  const bits: string[] = [];
  if (c.arb.size) bits.push(`[arb]     ${short(c.arb, 6)}`);
  if (c.arbBp.size) bits.push(`[arb-bp]  ${short(c.arbBp, 3)}`);
  if (c.named.size) bits.push(`named     ${short(c.named)}`);
  if (c.namedBp.size) bits.push(`named-bp  ${short(c.namedBp, 3)}`);
  console.log(`${prop}\n    ${bits.join('\n    ')}`);
}
if (traps.size) {
  console.log(`\n⚠  SILENT NO-OPS (${traps.size}) — these match a registry pattern but emit NO CSS.`);
  console.log('   Build succeeds, nothing warns, the style is simply missing. Never use them:');
  console.log(`   ${[...traps].sort().join('  ')}`);
}
console.log('\nA property absent from this list has NO utility — it must stay real CSS.');
