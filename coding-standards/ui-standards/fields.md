# UI Standards — Fields

Read when: adding a text, number, textarea, password, checkbox, radio or switch control. Dropdowns: `select.md`. Dates: `date.md`.

- **UI-FLD-01** Every field has a visible `<label for>`. A placeholder never replaces the label. (check: ui-fld-01)
- **UI-FLD-02** Set the correct `type`, `inputmode` and `autocomplete` (`email`, `tel`, `one-time-code`, `current-password`).
- **UI-FLD-03** Number and money fields are text inputs with `inputmode="decimal"`. No native spinner. Format on blur; store the raw number. (check: ui-fld-03)
- **UI-FLD-04** Accept typed dates, show the expected format as a hint, validate on blur. Show users the locale format, never `2026-10-07`. A range is two linked fields.
- **UI-FLD-05** Choice control by count: 2 options yes/no is a switch (applies at once) or a checkbox (saved with the form); 2-4 exclusive options are radios; 5 or more is a select; 7 or more is a searchable select.
- **UI-FLD-06** Mark required fields with text, not colour, and set `required`. If most fields are required, mark the optional ones "(optional)".
- **UI-FLD-07** An error is text under the field, linked by `aria-describedby`, with `aria-invalid="true"`. Colour alone is never the signal.
- **UI-FLD-08** Help text stays visible. It is never only in a tooltip.
- **UI-FLD-09** Never block paste. Use `readonly`, not `disabled`, for a value the user may copy.
- **UI-FLD-10** A password field has a show/hide toggle, allows password managers, and has no confirm-password field.
- **UI-FLD-11** A searchable select (7 or more options) follows `select.md`: filter as you type, "No results" row, full keyboard and `role="combobox"` support.
- **UI-FLD-12** An async select queries 300 ms after the last keystroke with at least 2 characters, shows a loading row, cancels a stale request, and pages at 50 (`select.md`).
- **UI-FLD-13** A multi-select shows chips with remove buttons named "Remove <value>" and a maximum count when there is one (`select.md`).
- **UI-FLD-14** Date, date-time and range fields follow `date.md`.
- **UI-FLD-15** A counter shows when a limit is under 500 characters and 20% or less remains. Trim whitespace on blur. A textarea grows to at most 10 lines.
- **UI-FLD-16** A parent checkbox over a group is tri-state: `aria-checked="mixed"` when only some children are on. A radio group sits in a `<fieldset>` with a `<legend>`. A switch shows On and Off as text.
- **UI-FLD-17** Inputs are 36 px high in forms, 32 px in filter bars and toolbars, 44 px on coarse pointers, with a 1 px field border, 6 px radius, 10 px inline padding, 14 px text. Width follows the form's field grid.
- **UI-FLD-18** States: default; hover (border darkens); focus (primary border and a soft 3 px ring); error (2 px danger border, `aria-invalid`, message below); disabled (dimmed, reason shown below); read-only (plain text without a box).
- **UI-FLD-19** A placeholder shows only a format example ("e.g. LT-0042") in muted text. It never replaces the label or holds instructions.
- **UI-FLD-20** A currency symbol is a prefix, a unit ("km", "%") a suffix; the value is right-aligned in tabular digits and formatted on blur. Adornments are muted, not part of the value, and are in the accessible description. A leading icon is allowed only on search.
- **UI-FLD-21** Search and `clearable` fields show a 28 px clear ✕ button ("Clear search") only when they hold text; clearing returns focus to the field.
- **UI-FLD-22** A password field's toggle is an icon button with `aria-pressed` named "Show password" or "Hide password". Use `autocomplete="current-password"` or `"new-password"`; never pre-fill it from the server.
- **UI-FLD-23** A textarea starts at 3 rows, grows to 8, then scrolls, with no resize handle. With `maxLength` a counter "N / max" shows from 80% and turns danger above 96%.
- **UI-FLD-24** A Confidential or Restricted field is masked with show/hide, `autocomplete="off"`, `spellcheck="false"`, and never appears in URLs, toasts or logs.
- **UI-FLD-25** Output shown back in inputs, read-only text and messages is escaped.
- **UI-FLD-26** On phones inputs are 44 px, full width, and at least 16 px text on the web (stops iOS zoom). The focused field scrolls above the keyboard.
- **UI-FLD-27** A checkbox is a 16 px square with a 4 px radius and 1.5 px border; checked fills primary with a check mark; indeterminate shows a bar. The label sits 8 px away and the whole row is clickable, at least 32 px high (44 px coarse).
- **UI-FLD-28** A checkbox that must be ticked to continue is never pre-ticked. If left unticked on submit it shows a danger border and "Confirm the details to continue" under it, linked by `aria-describedby`.
- **UI-FLD-29** Radios are for a Yes/No question only: a `radiogroup` labelled by the question, "Yes" and "No" side by side, nothing preselected unless the record has a value. The group is one Tab stop; arrows move and select.
- **UI-FLD-30** A switch is a 36 × 20 px track with a 16 px knob; on fills primary, off is neutral with a border; the touch target is at least 44 × 44 px on phones; label and description at the start, switch at the end.
- **UI-FLD-31** A switch applies at once with no Save button and confirms with an inline "✓ Saved" (`role="status"`); on failure it flips back with an inline error. Never use a switch inside a form saved by a button.
- **UI-FLD-32** A disabled checkbox, radio or switch is dimmed to 45–55%, `aria-disabled="true"`, with a visible reason ("Required by your organization"). Enforce locked settings on the server.
- **UI-FLD-33** Labels are positive statements in sentence case ("Email me when assigned"), one line, with an optional one-line muted description.
- **UI-FLD-34** Prefer native inputs, styled. A custom control exposes `role="checkbox"`, `"radio"` or `"switch"`, `aria-checked` (`true`, `false`, `mixed`), Space activation and a visible focus ring.
- **UI-FLD-35** Validate submitted values on the server (booleans, allowed keys, ranges), not only in the UI.
