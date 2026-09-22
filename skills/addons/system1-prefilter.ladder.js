// Deterministic escalation logic for system1-prefilter. No dependencies.
// Never re-derive these thresholds in an LLM call — run this script against
// the raw API response instead; it costs zero LLM tokens.

/**
 * MCQ case: single-choice question with a ranked probability distribution.
 * Returns the ordered list of candidate ids to actually read.
 */
function resolveMCQ(answer) {
  const { choice, probabilities } = answer;
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const [topId, topP] = ranked[0];

  if (topP >= 0.9) return [topId];
  if (topP >= 0.8) return ranked.slice(0, 2).map(([id]) => id);
  return ranked.slice(0, 3).map(([id]) => id);
}

/**
 * Boolean case: one independent yes/no question per candidate, batched.
 * `answers` is a map of candidate id -> { choice: "yes"|"no", confidence }.
 * Returns { toRead, toReVerify } — items flagged "yes" plus any item
 * (yes or no) below the confidence floor, which gets a manual check
 * instead of being trusted outright.
 */
function resolveBoolean(answers, confidenceFloor = 0.7) {
  const toRead = [];
  const toReVerify = [];

  for (const [id, { choice, confidence }] of Object.entries(answers)) {
    if (choice === "yes") toRead.push(id);
    if (confidence < confidenceFloor) toReVerify.push(id);
  }

  return { toRead, toReVerify };
}

module.exports = { resolveMCQ, resolveBoolean };
