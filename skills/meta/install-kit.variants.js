"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_DEFAULTS = exports.hasVariants = exports.VARIANT_KEYS = void 0;
exports.osName = osName;
exports.renderVariants = renderVariants;
exports.lintVariants = lintVariants;
exports.buildVariantCtx = buildVariantCtx;
exports.VARIANT_KEYS = ['tool', 'os', 'ai.review', 'ai.goldfish', 'ai.tests', 'ai.image', 'ai.coding'];
const IF = /^[ \t]*<!--if ([^>]*?)-->[ \t]*$/;
const ELSE = /^[ \t]*<!--else-->[ \t]*$/;
const END = /^[ \t]*<!--\/if-->[ \t]*$/;
const hasVariants = (text) => /<!--(if |else-->|\/if-->)/.test(text);
exports.hasVariants = hasVariants;
function osName(platform = process.platform) {
    return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
}
function holds(cond, ctx) {
    return cond.split(',').every((part) => {
        const m = /^\s*([a-z.]+)\s*(!=|!~|=|~)\s*(\S+?)\s*$/.exec(part);
        if (!m)
            throw new Error(`bad condition "${part.trim()}"`);
        const [, key, op, raw] = m;
        if (!(key in ctx))
            throw new Error(`unknown key "${key}"`);
        const want = raw.split('|');
        const have = ctx[key];
        const hit = Array.isArray(have) ? want.some((w) => have.includes(w)) : want.includes(have);
        return op === '=' || op === '~' ? hit : !hit;
    });
}
// Returns the text with every block resolved. Throws on a malformed block or an unknown key, so a bad edit fails loudly in tests
// and the installer falls back to the unrendered text (a skill with extra text is better than a skill with missing text).
function renderVariants(text, ctx) {
    if (!(0, exports.hasVariants)(text))
        return text;
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    const out = [];
    let state = null;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
        const at = `line ${i + 1}`;
        const mIf = IF.exec(line);
        if (mIf) {
            if (state)
                throw new Error(`${at}: blocks do not nest`);
            const cond = holds(mIf[1], ctx);
            state = { keep: cond, inElse: false, cond };
            return;
        }
        if (ELSE.test(line)) {
            if (!state || state.inElse)
                throw new Error(`${at}: <!--else--> without a matching <!--if-->`);
            state = { keep: !state.cond, inElse: true, cond: state.cond };
            return;
        }
        if (END.test(line)) {
            if (!state)
                throw new Error(`${at}: <!--/if--> without a matching <!--if-->`);
            state = null;
            return;
        }
        if (/<!--(if |else-->|\/if-->)/.test(line))
            throw new Error(`${at}: a marker must sit alone on its line`);
        if (!state || state.keep)
            out.push(line);
    });
    if (state)
        throw new Error('an <!--if--> block is never closed');
    return out.join(nl);
}
// Same checks without a context: balanced, not nested, markers alone on their line, only known keys. Returns problems.
function lintVariants(text) {
    const probe = Object.fromEntries(exports.VARIANT_KEYS.map((k) => [k, k.startsWith('ai.') ? [] : '']));
    try {
        renderVariants(text, probe);
        return [];
    }
    catch (e) {
        return [e.message];
    }
}
// What a feature does when the project has no list for it, the same defaults the scripts use (an empty list is a different thing:
// nothing allowed).
exports.AI_DEFAULTS = { review: ['code'], goldfish: [], tests: ['ollama', 'kaggle'], image: [], coding: ['kaggle'] };
// The answers a render sees: the tool and OS of this install, and the backend lists the project allows.
function buildVariantCtx(tool, ai, platform) {
    const ctx = { tool: tool || 'claude', os: osName(platform) };
    for (const f of Object.keys(exports.AI_DEFAULTS))
        ctx[`ai.${f}`] = Array.isArray(ai[f]) ? ai[f].map(String) : exports.AI_DEFAULTS[f];
    return ctx;
}
