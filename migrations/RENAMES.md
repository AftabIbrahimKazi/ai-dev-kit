# Skill Rename Ledger

**Purpose:** informs existing project installs about library renames/merges so they can update carefully without disturbing their working flow. Read by the install-kit's migration step (Step 3b) on every re-install. **Not a skill, not temporary — never delete this file or its rows**; the rows are the only record old installs can be matched against.

When a library skill is renamed or merged, add a row here (newest first).

| Date | Old name | New name | Notes |
|---|---|---|---|
| 2026-07-15 | `all-models` | `claude-all-models` | Standardized collective files to `<brand>-all-models` |
| 2026-07-15 | `opencode-open-models` | `opencode-all-models` | Same convention; renamed shortly after creation |
