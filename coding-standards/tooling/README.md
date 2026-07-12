# Tooling — Machine Enforcement

Standards that can be checked mechanically are enforced by tooling so violations cannot be committed. The docs remain the source of truth; configs here cite the rule they enforce and never introduce rules of their own.

| Config | Enforces | Requires |
|---|---|---|
| `stylelint.config.cjs` | css-standards RULES 04, 05, 10, 12, 13 (partial), 14, 15 (partial), 23 (nesting ban) | `npm i -D stylelint stylelint-order` |

## Usage

```bash
npx stylelint "public/css/**/*.css" --config coding-standards/tooling/stylelint.config.cjs
```

Adjust the glob per project. Recommended wiring: a `lint:css` npm script + pre-commit hook + CI step.

## Not machine-checkable (docs + review only)

Selector signature/suffix convention (RULE 11), variables-store-values-only (RULE 02), gradients at point of use (RULE 03), purposeless properties (RULE 15 in full), img-vs-background (RULE 16), range-based media queries (RULE 17), framework-first (RULE 18/19), package exceptions (RULE 20), state-driven CSS placement (RULE 21), top/bottom file halves (RULE 22). These stay AI/human-enforced via the standards chain.

## Keeping in sync

Any edit to a machine-checkable rule in `css-standards.md` must update the config in the same commit, and vice versa. If they disagree, the doc wins — fix the config.
