export const LEDGER_READOUT = {
  figure: "About 3,900",
  unit: "tokens",
  label: "Always-on context added by a full Claude Code install.",
  qualifier: "Estimated, not measured. Source: the kit README.",
  source: "README line 7; content-facts",
} as const;

export const LEDGER_MEASURE = {
  text: "To see your own numbers, the budget-ledger mod logs real token use and cost per turn, and /token-report shows where the tokens went.",
  source: "README, guaranteed-layer table and mods table",
} as const;
