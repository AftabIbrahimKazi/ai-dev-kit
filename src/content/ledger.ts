export const LEDGER_READOUT = {
  figure: "About 5,500",
  unit: "tokens",
  label: "Always-on context added by a default Claude Code install with the standards.",
  qualifier: "Estimated from character counts, not a tokenizer. Measured 2026-11-27: 3,227 for the 13 pinned skills alone, 5,542 for the default install (30 skills archived), 7,372 with every skill kept active. Source: the Skills page, install cost chapter.",
  source: "README, what an install costs; measured 2026-11-27",
} as const;

export const LEDGER_MEASURE = {
  text: "To see your own numbers, the budget-ledger mod logs real token use and cost per turn, and /token-report shows where the tokens went.",
  source: "README, guaranteed-layer table and mods table",
} as const;
