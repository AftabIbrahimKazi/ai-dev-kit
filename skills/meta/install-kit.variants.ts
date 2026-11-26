// Install-time text stripping: a library .md can hold text for one setup only, and the installer keeps just the part that matches
// the project's answers. Plain code, no model: the same input always gives the same output, so an `update` re-renders it.
//
//   <!--if tool=claude-->         kept when the condition holds
//   text for Claude Code only
//   <!--else-->                   optional
//   text for every other tool
//   <!--/if-->
//
// Conditions (comma = AND, | inside a value = OR):  key=a|b   key!=a   key~a (the list holds a)   key!~a
// Keys: tool (claude, opencode, codex), os (windows, mac, linux), ai.review, ai.goldfish, ai.tests, ai.image, ai.coding (lists of
// allowed backends). Marker lines sit on their own line and are removed with the text they hide; blocks do not nest.
// The library copy keeps every variant. Skills read straight from the repo (not installed) show every variant and no markers.
export type VariantValue = string | string[];
export type VariantCtx = Record<string, VariantValue>;

export const VARIANT_KEYS = ['tool', 'os', 'ai.review', 'ai.goldfish', 'ai.tests', 'ai.image', 'ai.coding'];
const IF = /^[ \t]*<!--if ([^>]*?)-->[ \t]*$/;
const ELSE = /^[ \t]*<!--else-->[ \t]*$/;
const END = /^[ \t]*<!--\/if-->[ \t]*$/;
export const hasVariants = (text: string): boolean => /<!--(if |else-->|\/if-->)/.test(text);

export function osName(platform: string = process.platform): string {
  return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
}

function holds(cond: string, ctx: VariantCtx): boolean {
  return cond.split(',').every((part) => {
    const m = /^\s*([a-z.]+)\s*(!=|!~|=|~)\s*(\S+?)\s*$/.exec(part);
    if (!m) throw new Error(`bad condition "${part.trim()}"`);
    const [, key, op, raw] = m;
    if (!(key in ctx)) throw new Error(`unknown key "${key}"`);
    const want = raw.split('|');
    const have = ctx[key];
    const hit = Array.isArray(have) ? want.some((w) => have.includes(w)) : want.includes(have);
    return op === '=' || op === '~' ? hit : !hit;
  });
}

// Returns the text with every block resolved. Throws on a malformed block or an unknown key, so a bad edit fails loudly in tests
// and the installer falls back to the unrendered text (a skill with extra text is better than a skill with missing text).
export function renderVariants(text: string, ctx: VariantCtx): string {
  if (!hasVariants(text)) return text;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const out: string[] = [];
  let state: { keep: boolean; inElse: boolean; cond: boolean } | null = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`;
    const mIf = IF.exec(line);
    if (mIf) {
      if (state) throw new Error(`${at}: blocks do not nest`);
      const cond = holds(mIf[1], ctx);
      state = { keep: cond, inElse: false, cond };
      return;
    }
    if (ELSE.test(line)) {
      if (!state || state.inElse) throw new Error(`${at}: <!--else--> without a matching <!--if-->`);
      state = { keep: !state.cond, inElse: true, cond: state.cond };
      return;
    }
    if (END.test(line)) {
      if (!state) throw new Error(`${at}: <!--/if--> without a matching <!--if-->`);
      state = null;
      return;
    }
    if (/<!--(if |else-->|\/if-->)/.test(line)) throw new Error(`${at}: a marker must sit alone on its line`);
    if (!state || state.keep) out.push(line);
  });
  if (state) throw new Error('an <!--if--> block is never closed');
  return out.join(nl);
}

// Same checks without a context: balanced, not nested, markers alone on their line, only known keys. Returns problems.
export function lintVariants(text: string): string[] {
  const probe: VariantCtx = Object.fromEntries(VARIANT_KEYS.map((k) => [k, k.startsWith('ai.') ? [] : '']));
  try { renderVariants(text, probe); return []; } catch (e) { return [(e as Error).message]; }
}

// What a feature does when the project has no list for it, the same defaults the scripts use (an empty list is a different thing:
// nothing allowed).
export const AI_DEFAULTS: Record<string, string[]> = { review: ['code'], goldfish: [], tests: ['ollama', 'kaggle'], image: [], coding: ['kaggle'] };

// The answers a render sees: the tool and OS of this install, and the backend lists the project allows.
export function buildVariantCtx(tool: string | undefined, ai: Record<string, unknown>, platform?: string): VariantCtx {
  const ctx: VariantCtx = { tool: tool || 'claude', os: osName(platform) };
  for (const f of Object.keys(AI_DEFAULTS)) ctx[`ai.${f}`] = Array.isArray(ai[f]) ? (ai[f] as unknown[]).map(String) : AI_DEFAULTS[f];
  return ctx;
}
