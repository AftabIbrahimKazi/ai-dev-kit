# UI Standards — Stepper

Read when: adding a multi-step flow such as onboarding, a data import or a multi-stage approval.

- **UI-STP-01** Use a stepper only for a real sequence where each step depends on the previous one. Editing a record is one form with sections, never a stepper.
- **UI-STP-02** On desktop it is horizontal with at most 5 steps: 28 px circles (done: primary fill with ✓; current: primary ring, number, bold label; upcoming: neutral ring, muted; error: danger ring with "!"), labels of 1 to 3 words below, and 2 px connecting lines in primary for completed segments.
- **UI-STP-03** Each step has Back (secondary) and Next (primary; "Finish" or a specific verb on the last step) in the action bar. Next validates the current step. A completed step may be revisited by clicking it; an upcoming step cannot be skipped. Save progress per step so users can leave and resume.
- **UI-STP-04** Show "Step <n> of <total> · <label>" under the stepper or in the action bar.
- **UI-STP-05** The stepper is an `<ol>`. The current step has `aria-current="step"`. Each step's state is in its accessible text ("Sites, current step"). Focus moves to the step heading when the step changes.
- **UI-STP-06** Below 768 px it collapses to "Step 2 of 4 · Sites" with a 4 px progress bar, and Back and Next sit in the sticky bottom action bar.
- **UI-STP-07** Colours come from tokens: primary, on-primary, field border, danger text, text tones.
