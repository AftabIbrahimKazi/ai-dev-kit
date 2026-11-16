#!/usr/bin/env node
// Content guardrails for the media harness (Kaggle's terms restrict adult and other restricted content; an account
// suspension would also take the coding flow's GPU quota). Three layers, all fail-closed:
//   1. checkPrompt(): refuses prompts that name restricted content, before anything is sent to a GPU.
//   2. NEGATIVE: safety terms only, passed as the negative prompt (it has no effect at guidance <= 1, so Wan is unchanged).
//   3. bench.py runs an NSFW image classifier on the CPU AFTER each generation, outside the timed region, and drops
//      flagged files; if the classifier cannot load, outputs are dropped but generation and timing carry on.
// Usage: node guard.js "<prompt>"   exit 0 = allowed, 4 = blocked (reason on stderr)
'use strict';

// Whole-word match, case-insensitive. Kept short and plain on purpose: it catches the obvious asks and typos of intent,
// it is not a classifier. Layer 3 is what looks at the pixels.
const ADULT = ['nsfw', 'nude', 'nudes', 'naked', 'nudity', 'topless', 'porn', 'porno', 'pornographic', 'erotic', 'erotica', 'sex', 'sexual', 'sexy', 'genitals', 'genitalia', 'nipples', 'lingerie', 'fetish', 'hentai', 'orgy', 'cum', 'xxx', 'uncensored'];
const MINOR = ['loli', 'lolita', 'shota', 'underage', 'preteen'];  // only terms that are sexualised-minor markers; ordinary words like child, kid, baby or teen stay allowed (kids apps, 'baby blue')
const GRAPHIC = ['gore', 'gory', 'dismember', 'dismembered', 'mutilated', 'beheading', 'decapitated', 'snuff'];
const NEGATIVE = 'nsfw, nudity, naked, nude, sexual, erotic, genitals, nipples, gore';  // safety terms only: no quality or style words, so results are not altered

const re = (words) => new RegExp('(?<![a-z0-9])(?:' + words.join('|') + ')(?![a-z0-9])', 'i');
const RULES = [
  { id: 'adult', re: re(ADULT), why: 'adult or explicit content' },
  { id: 'minor', re: re(MINOR), why: 'sexualised-minor markers' },
  { id: 'graphic', re: re(GRAPHIC), why: 'graphic violence' },
];

function checkPrompt(prompt) {
  const text = String(prompt || '');
  if (!text.trim()) return { ok: false, rule: 'empty', why: 'empty prompt' };
  for (const r of RULES) { const m = r.re.exec(text); if (m) return { ok: false, rule: r.id, why: r.why, match: m[0] }; }
  return { ok: true };
}

module.exports = { checkPrompt, NEGATIVE, TERMS: { adult: ADULT, minor: MINOR, graphic: GRAPHIC } };

if (require.main === module) {
  const r = checkPrompt(process.argv.slice(2).join(' '));
  if (r.ok) { console.log('allowed'); process.exit(0); }
  console.error(`blocked (${r.rule}): ${r.why}${r.match ? ` [matched "${r.match}"]` : ''}`);
  process.exit(4);
}
