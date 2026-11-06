# UI Standards — Button

Read when: adding a button, icon button, link-style action or row action.

- **UI-BTN-01** One primary button per view or dialog. Other actions use secondary or ghost.
- **UI-BTN-02** Label is verb + object in sentence case, at most 3 words, one line: "Save changes", "Delete invoice", "New laptop". Never "OK", "Submit", "Click here" or all caps. (check: ui-btn-02)
- **UI-BTN-03** An action is a `<button type="button|submit">`. A navigation is an `<a href>`. Never a `<div>` or `<span>` with a click handler. (check: a11y-05)
- **UI-BTN-04** Target is at least 24x24 CSS px; on touch (`pointer: coarse`) at least 44x44. (browser)
- **UI-BTN-05** Loading keeps the button width, changes the label to the progressive form ("Saving…"), shows a spinner, sets `aria-busy="true"`, and ignores a second click.
- **UI-BTN-06** Do not disable a button to signal invalid input. Disable only for a temporary state, and show the reason as visible text, a tooltip or `aria-describedby`. An action the user may not perform is hidden, not disabled.
- **UI-BTN-07** An icon-only button has an accessible name that includes the object ("Edit LT-0042") and a tooltip with the same text on hover and focus. (check: ui-btn-07)
- **UI-BTN-08** A destructive action uses the danger style, never the primary style, and is never the default focus in a confirm dialog.
- **UI-BTN-09** Buttons side by side share one height, and a field on the same row matches it.
- **UI-BTN-10** Variants: primary (filled, one main action per view), secondary (surface with a border, other actions), ghost (no border or fill, low emphasis and table actions), danger (filled, only inside confirmation dialogs), link (underlined text, navigation inside text).
- **UI-BTN-11** Sizes: `xs` 28 px (tables, chips, compact toolbars), `sm` 32 px (filter bar, card headers, drawer and menu footers), `md` 36 px default (page header, forms, dialogs), touch 44 px automatically under `pointer: coarse`. Radius 6 px, icon 16 px, gap 6 px, font 13 or 14 px weight 600, `md` minimum width 80 px.
- **UI-BTN-12** Every button implements default, hover, focus-visible (2 px ring with 2 px offset), pressed, disabled (45% opacity, `aria-disabled="true"`) and loading.
- **UI-BTN-13** A text button may have one 16 px leading icon, decorative (`aria-hidden`). Trailing icons are only for menus (chevron) and external links.
- **UI-BTN-14** Row actions in a table are `xs` ghost icon buttons only: at most 2 inline icons, then ⋯ More. No "View" button (the identifier link opens the record). No filled, outlined or text buttons in rows. Destructive actions live only in ⋯.
- **UI-BTN-15** In any group the primary is the last control, preceded by secondary buttons. Cancel is always secondary and always before the primary. Page header, form action bar, dialog and drawer footers follow this order.
- **UI-BTN-16** A Save button is never disabled for validation (`forms.md`).
- **UI-BTN-17** Full width only on phones (action bars, sheets) and in narrow drawer footers. On desktop buttons size to content.
- **UI-BTN-18** Colours come from tokens: primary and on-primary, field border, hover tint, danger solid and on-danger, focus ring.
