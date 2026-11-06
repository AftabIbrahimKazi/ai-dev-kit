# UI Standards — Forms

Read when: building or changing a create/edit form, a settings page or a validation flow. Field controls: `fields.md`, `select.md`, `date.md`.

Detail in `ui-standards/forms.ref.md`: failures, security, access, wizard. Read it only when the task covers one of these.

## Structure

- **UI-FRM-01** Use a 12-column grid at 992 px and up, 6 columns at 768–991 px, one column below, with 16 px row and 20 px column gaps. Related fields share a row (Purchase date, Warranty until, Value); unrelated fields are not squeezed into a row to fill it. Focus order runs start to end, then top to bottom. Spans at 992 px (768–991 px): code, ID, date, time, amount, quantity, PIN 3 (3); choice of up to 3 options or short text 4 (3); name, model, title 5 (6); person, select, email, phone, secret 6 (6); choice of 4 to 5 options 8 (6); textarea, address, rich text, upload 12 (6). Group fields in `<fieldset>` with `<legend>`.
- **UI-FRM-09** Full create and edit forms are pages, never centred modals. A quick edit (one action, at most 4 fields) is a drawer. Settings are pages with sections.
- **UI-FRM-13** Start with "Fields marked * are required." when any field is required, then one card whose sections are split by 1 px dividers. Each section has an `<h2>` (15 to 16 px weight 600) with an optional one-line description. Content is at most 1120 px wide; section padding 18 to 24 px on desktop, 16 px on phones.
- **UI-FRM-14** A field is a visible `<label>` above the control (4 px gap), the control, then one message line. The line shows help text; an error replaces it in the same place. A required field shows a red `*` (`aria-hidden`), visually hidden "(required)" and `aria-required="true"`; optional fields are unmarked.
- **UI-FRM-15** Pick the control by data: any list of 2 or more options is a searchable select; a Yes/No condition in a saved form is Yes/No radios; a setting that applies at once is a switch; agreement or one opt-in is a checkbox; dates use the date picker; an amount is a text input with `inputmode="decimal"`, currency prefix, right-aligned; long text is a textarea with a counter from 80% of `maxlength`.
- **UI-FRM-16** Set `type`, `inputmode` and `autocomplete` (`email`, `tel`, `name`, `street-address`, `postal-code`, `current-password`, `new-password`, `one-time-code`). Personal-data fields have an `autocomplete` token. Never block paste.


## Validation

- **UI-FRM-02** Validate on blur after the first touch and on submit. Never on the first keystroke. After an error shows, re-validate on every change so it clears when the value is valid.
- **UI-FRM-03** Submitting with errors: Save stays enabled, the page scrolls to and focuses the first invalid field, and the sticky action bar shows "⚠ <N> field(s) need attention · Go to first", announced once with `role="alert"`. No separate error summary at the top of the page.
- **UI-FRM-04** Validate on the server always. Map each 422 field error onto its field by name; errors for unknown fields show in the action bar. Keep every value the user typed.
- **UI-FRM-17** An error sits directly under its field: icon and message in the danger colour, a 2 px danger border, `aria-invalid="true"`, linked by `aria-describedby`. A field error never uses `role="alert"` and is never shown only in a toast.
- **UI-FRM-18** An error message says what to do, in sentence case, without blame: "Enter …", "Choose …", "Use …", with the expected format or range ("Enter a date like 12 Mar 2026", "Enter an amount, e.g. 92400.50"). Never "Invalid input", technical text (`SQLSTATE`) or "You entered a wrong value".


## Saving

- **UI-FRM-05** Save is never disabled for validation. While the request runs it shows a spinner and "Saving…", sets `aria-busy="true"` and blocks a second submit. A critical create endpoint (payment, order) also uses an idempotency key.
- **UI-FRM-07** The action bar puts Cancel (secondary) and Save (primary) in the same order on every form. Create and edit pages end with a bar sticky to the bottom, holding from the start: "● Unsaved changes" when dirty, the error status, flexible space, Cancel, optional "Save and add another", primary Save ("Save <entity>" on create, "Save changes" on edit). Below 768 px buttons are full width and 44 px high.
- **UI-FRM-19** "Save and add another" appears only on create forms flagged `dataEntry: true`, never on edit forms, settings or drawers. After saving it toasts "<identifier> created", resets the form except fields flagged `repeatable` (marked "↻ Kept for the next <entity>"), focuses the first empty field and shows "<N> added in this session" in the action bar.
- **UI-FRM-06** Warn before leaving a dirty form by Cancel, close, in-app navigation, Back or tab close. Use an `alertdialog` titled "Discard unsaved changes?" with "You changed <N> field(s) (<labels>). If you leave now, these changes will be lost.", a danger-outlined "Discard changes" and a primary "Keep editing" (focused; Esc keeps editing). Tab close and reload use the browser prompt. A clean form shows no warning. (browser)
- **UI-FRM-20** After create, land on the new record's detail page with a toast "<Entity> <identifier> created". After edit, the detail page with "Changes saved". After a quick-edit drawer, close it, update the row in place and toast ("LT-0044 assigned to Rahul Mehta").
- **UI-FRM-21** A user without edit permission sees plain label-and-value text ("—" when empty), no inputs and no action bar, with "You can view this <entity> but not edit it." A disabled control is only for a temporarily unavailable option and shows the reason on the message line.
- **UI-FRM-22** On a settings page a switch applies at once with an inline "✓ Saved" (`role="status"`). A group of text, select or radio settings has its own section Save with an unsaved indicator. No page-level Save.
- **UI-FRM-08** Do not autosave business records. Autosave drafts only, with a visible "Saved" status.
- **UI-FRM-23** A quick-edit drawer opens from the end, 400 px wide (full screen below 768 px), titled "<Action> <identifier>" ("Assign LT-0044"), with a one-line context ("HP EliteBook 840 · Pune · currently unassigned"), at most 4 fields, and a footer with Cancel and a verb button ("Assign"). The unsaved guard applies; Esc and Close act like Cancel.
