# QA — Bug Reporting Format

Read [index.md](index.md) first.

---

## RULE QA-REPORT-01 — Bugs are reported with a standard format

When Claude identifies a bug or security issue during a QA pass it must
report it using this format:

```
[SEVERITY] — [short title]

File: [file path and line number if known]
Type: [logic error | security | standards violation | accessibility | performance | e2e]

What is wrong:
[clear description of the problem]

Impact:
[what breaks or what risk this creates]

Fix:
[what needs to change — or "developer decision required" if Claude cannot resolve it]
```

---

## RULE QA-REPORT-02 — Severity levels

| Severity | Meaning | Action |
|---|---|---|
| `[CRITICAL]` | Security vulnerability or data loss risk | Block — must be fixed before any other work continues |
| `[HIGH]` | Broken functionality or significant standards violation | Fix before promoting to next branch |
| `[MEDIUM]` | Degraded behaviour, edge case failure, minor standards violation | Fix before beta |
| `[LOW]` | Code quality issue, naming inconsistency, missing comment | Fix before main |
| `[INFO]` | Observation with no immediate action required | Log for awareness |
