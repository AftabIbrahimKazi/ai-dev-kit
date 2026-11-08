export type GateVerdict = "denied" | "passed";

export interface GateAttempt {
  id: string;
  attempt: string;
  verdict: GateVerdict;
  verdictLabel: string;
}

export const MODS_INTRO = {
  text: "Mods run in code, so unlike skills they fire every time. precommit-gate gates git commit and git push.",
  source: "README, Claude Code mods section; precommit-gate row",
} as const;

export const GATE_ATTEMPTS: readonly GateAttempt[] = [
  { id: "secret", attempt: "A leaked secret", verdict: "denied", verdictLabel: "Blocked" },
  { id: "secret-file", attempt: "A secret file", verdict: "denied", verdictLabel: "Blocked" },
  { id: "message", attempt: "A bad commit message", verdict: "denied", verdictLabel: "Blocked" },
  { id: "no-verify", attempt: "git commit --no-verify", verdict: "denied", verdictLabel: "Blocked" },
  { id: "clean", attempt: "A commit with none of these", verdict: "passed", verdictLabel: "Not blocked" },
];

export const MODS_CAVEAT = {
  text: "It also warns once on stray files and debug leftovers. Mods are optional and fail open: if one breaks, your work continues.",
  source: "README, Claude Code mods section, precommit-gate row",
} as const;
