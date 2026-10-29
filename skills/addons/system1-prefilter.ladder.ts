// Deterministic escalation logic for system1-prefilter. No dependencies.
// Never re-derive these thresholds in an LLM call — run this script against
// the raw API response instead; it costs zero LLM tokens.

type Probabilities = Record<string, number>;
export interface MCQAnswer { choice: string; probabilities: Probabilities }

/**
 * MCQ case: single-choice question with a ranked probability distribution.
 * Returns the ordered list of candidate ids to actually read.
 */
export function resolveMCQ(answer: MCQAnswer): string[] {
  const { probabilities } = answer;
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const [topId, topP] = ranked[0];

  if (topP >= 0.9) return [topId];
  if (topP >= 0.8) return ranked.slice(0, 2).map(([id]) => id);
  return ranked.slice(0, 3).map(([id]) => id);
}

export interface BooleanAnswer { choice: 'yes' | 'no'; confidence: number }
export interface BooleanResolution { toRead: string[]; toReVerify: string[] }

/**
 * Boolean case: one independent yes/no question per candidate, batched.
 * `answers` is a map of candidate id -> { choice: "yes"|"no", confidence }.
 * Returns { toRead, toReVerify } — items flagged "yes" plus any item
 * (yes or no) below the confidence floor, which gets a manual check
 * instead of being trusted outright.
 */
export function resolveBoolean(answers: Record<string, BooleanAnswer>, confidenceFloor = 0.7): BooleanResolution {
  const toRead: string[] = [];
  const toReVerify: string[] = [];

  for (const [id, { choice, confidence }] of Object.entries(answers)) {
    if (choice === 'yes') toRead.push(id);
    if (confidence < confidenceFloor) toReVerify.push(id);
  }

  return { toRead, toReVerify };
}

type LayaAnswer =
  | { type: 'choice'; choice: string; probabilities: Probabilities }
  | { type: 'noul'; noul: number };

export interface LayaResponse { answers?: Record<string, LayaAnswer> }
export interface LayaResolved { mcq: Record<string, MCQAnswer>; boolean: Record<string, BooleanAnswer> }

/**
 * Laya adapter (local provider). Laya's response is `answers[id]` with
 * type "choice" (+ probabilities) or "noul" (yes-probability, 0..1).
 * Returns the shapes the resolvers above take: { mcq, boolean }.
 * A noul answer's confidence is max(p, 1 - p), same as Laya reports.
 */
export function fromLaya(response: LayaResponse): LayaResolved {
  const mcq: Record<string, MCQAnswer> = {};
  const boolean: Record<string, BooleanAnswer> = {};
  for (const [id, a] of Object.entries(response.answers || {})) {
    if (a.type === 'choice') mcq[id] = { choice: a.choice, probabilities: a.probabilities };
    else if (a.type === 'noul') boolean[id] = { choice: a.noul >= 0.5 ? 'yes' : 'no', confidence: Math.max(a.noul, 1 - a.noul) };
  }
  return { mcq, boolean };
}
