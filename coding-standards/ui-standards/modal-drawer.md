# UI Standards — Modal and Drawer

Read when: adding a modal, dialog, drawer or side panel.

## Modal

- **UI-MOD-01** Use `<dialog>` or `role="dialog"` with `aria-modal="true"`, named by its title (`aria-labelledby`) and described by its main text (`aria-describedby`). A confirmation uses `role="alertdialog"`. (check: ui-mod-01)
- **UI-MOD-02** On open, focus moves inside: to the first field, or to Cancel for a destructive confirmation. Focus stays trapped, background content is `inert`, and on close focus returns to the opener. Esc closes unless the form is dirty. (browser)
- **UI-MOD-03** A modal is for a confirmation, a short decision with at most 2 fields, export or print options, or a focused preview. A record create or edit form is a page; a quick edit is a drawer. A success message is never a modal.
- **UI-MOD-04** Never stack modals. A second step replaces the content of the first. A confirmation started from a drawer opens above it and returns focus to it.
- **UI-MOD-05** The title names the action and the object ("Change status", "Delete laptop LT-0044?"). The primary button repeats the verb ("Export PDF"). Never "OK" or "Yes/No".
- **UI-MOD-06** Sizes: `sm` 400 px (confirmations), `md` 560 px (choices, export), `lg` 800 px (previews); centred, 12 px radius, raised surface, max height 80 vh. The body scrolls; the 52 px header (title and a 32 px close button) and the footer (end-aligned Cancel, then primary) stay fixed. The page behind does not scroll.
- **UI-MOD-07** The close control has an accessible name. ✕, Cancel, Esc and a scrim click close it, except when it holds unsaved input (the discard guard in `forms.md` applies) and while the primary action is loading.
- **UI-MOD-09** Under 768 px a modal without fields is a bottom sheet; a modal with fields is full screen with the title bar on top and the action bar at the bottom (44 px full-width buttons).

## Drawer

- **UI-MOD-08** A drawer is for a quick edit (at most 4 fields), the Filters panel, the theme customizer, or a read-only record preview. It opens from the end side, 400 px (`md`) or 560 px (`lg`) wide, full height, over a scrim. Under 768 px it is full screen with the same header and a bottom action bar of 44 px full-width buttons.
- **UI-MOD-10** Layout: a sticky 52 to 56 px header (title, optional context line, ✕), a scrolling body, a sticky footer (Cancel, then primary). Focus trap, Esc, focus return and the discard guard follow the modal rules. `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- **UI-MOD-11** A drawer never holds tabs, another drawer or a full record form. A task that grows past that becomes a page.
- **UI-MOD-12** Colours and layers come from tokens: raised surface, scrim, overlay shadow, dialog and drawer z-index.
- **UI-MOD-13** An off-canvas panel (drawer, navigation drawer, bottom sheet) is in the markup from first render with its state attribute set to closed, never inserted on open. Opening locks page scroll without moving the page (`scrollbar-gutter: stable` on the scroll root, no padding hacks), sizes to `100dvh` and pads for `env(safe-area-inset-*)`. Menus and selects opened inside it follow `tokens.md` UI-TOK-17 (layer 550). Test it open at 360 px and on a phone browser with the address bar showing and hidden. (browser)
