# UI Standards — Tabs, Segmented Control, Accordion

Read when: adding tabs, a view switcher, a segmented control or an accordion. Page-level section tabs with their own URLs: `page-header.md`.

- **UI-TAB-01** Tabs switch views of one object. They are not steps and not site navigation.
- **UI-TAB-02** In-page tabs use `role="tablist"`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`. One Tab stop; ← → (Home, End) move and activate; Tab moves into the panel. Page-level URL tabs are links and do not use these roles. (browser)
- **UI-TAB-03** The selected tab has `aria-selected="true"` and a cue that is not colour alone. The URL records the tab (fragment or query such as `?panel=software`) so reload and shared links return to it.
- **UI-TAB-04** At most 6 in-page tabs (7 for page-level tabs), labels of at most 2 words. Never nest tabs in tabs.
- **UI-TAB-05** Switching a tab keeps unsaved input or warns first.
- **UI-TAB-06** An accordion header is a `<button>` with `aria-expanded` and `aria-controls`, inside a real heading.
- **UI-TAB-07** Never hide a required field, an error or a primary action in a collapsed section. An error inside a collapsed section opens it. Forms use sections instead.
- **UI-TAB-08** In-page tabs sit at the top of the card they control: 36 px text tabs, 20 px apart, a 2 px primary underline and weight 600 on the active tab, secondary colour on the others, an optional neutral count badge, and a 1 px divider under the row.
- **UI-TAB-09** A segmented control only switches view modes (2 to 4 options). It is 32 px high in a neutral track with the active segment raised and weight 600; each segment is a toggle button with `aria-pressed`. Never for form values (use Select) or navigation.
- **UI-TAB-10** Accordion headers are 44 px, with a 16 px start chevron (rotated when open), a 14 px weight 600 title and an optional muted value at the end. Sections are split by 1 px dividers and several may be open at once.
- **UI-TAB-11** On phones tabs scroll sideways and never wrap, segmented controls stretch to full width, and accordion headers are 48 px.
