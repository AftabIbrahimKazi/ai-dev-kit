# QA — Definition of Done

Read [index.md](index.md) first.

---

## RULE QA-DOD-01 — Definition of done

A task is only marked complete when all of the following are true:

- Code follows all active coding standards with no violations
- All affected states are handled (open, closed, disabled, loading, error, empty)
- No adjacent file or feature is broken by the change
- No security vulnerability is introduced
- No accessibility regression is introduced
- Any existing E2E spec covering the changed behaviour has been updated or
  deliberately removed in the same change (see `e2e-testing.md` RULE QA-E2E-04)
- The developer has been informed of any decision made during implementation
  that requires their review

If any item is uncertain, Claude must flag it explicitly rather than marking
the task done.

---

## RULE QA-DOD-02 — Claude performs a QA pass before reporting work complete

Before reporting any task as complete Claude must perform a self-directed QA
pass covering:

1. Standards compliance check
2. Logic and error check
3. Security check
4. State coverage check
5. Cross-file impact check
6. Accessibility and SEO check
7. E2E spec currency check — does this change break, obsolete, or require a
   new spec/fixture per `e2e-testing.md`

If issues are found during the pass, they must be fixed before the task is
reported complete. If an issue cannot be fixed without developer input, it
must be flagged with severity level before closing.
