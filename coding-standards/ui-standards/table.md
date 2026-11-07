# UI Standards — Table and Record List

Read when: adding a table, a record list, row actions, selection, sorting, pagination, inline edit or totals. Search and filters: `filters.md`. Export: `export.md`.

Detail in `ui-standards/table.ref.md`: inline edit and totals, quality. Read it only when the task covers one of these.

## Structure

- **UI-TBL-01** Tabular data uses a native `<table>`, `<th scope="col">` and a visually hidden `<caption>` stating entity, sort and page ("Laptops, sorted by Updated: newest first. Page 1 of 10."). `aria-sort` on the sorted header. No ARIA grid roles on a read-only table. Never a grid of `<div>`. (check: ui-tbl-01)
- **UI-TBL-13** One shared data-table component serves every business list, configured by a column definition: `key`, `label`, `type` (text, link, number, currency, date, relative-date, status, person, boolean), `sortable`, `hideable` (default true), `locked`, `defaultVisible`, `editable`, `summable`, `cardField` (phone), `width`. Pages never hand-build list table markup.
- **UI-TBL-14** At most 7 columns by default, not counting the checkbox and actions columns. The identifier column (ID or name) comes first after the checkbox and is `locked`.
- **UI-TBL-06** Format by type. Text, link, status, person: start-aligned, one line. Number and currency: end-aligned, tabular figures, locale grouping, unit in the header ("Value (₹)"), a minus sign for negatives (never colour alone). Date: one format. Relative date ("Today", "3 days ago"): `<time datetime>` with the absolute date in a tooltip. Status: a chip with text. Person: 22 px avatar and name. Boolean: "Yes" or "No". An empty cell shows "—" with visually hidden "Empty".
- **UI-TBL-15** A cell stays on one line, truncates with an ellipsis at the column width, and exposes the full value in a tooltip and to assistive technology.
- **UI-TBL-10** The header row is sticky below the sticky filter bar. When columns exceed the card, the table scrolls sideways inside the card, never the page, with the checkbox and identifier columns sticky at the start. The scroll container is keyboard-focusable. Under 768 px use the card layout.


## Rows and actions

- **UI-TBL-05** The identifier cell is a real link to the record; the whole row may also open it, except a click on a checkbox, menu, editable cell or link. Row hover uses the row-hover token.
- **UI-TBL-16** Each row ends with `xs` (28 px) ghost icon buttons: at most 2 inline (✎ "Edit <identifier>", with tooltips), then an always-visible ⋯ button named "Actions for <identifier>". Never text, filled or outlined buttons, and never hover-only actions. Menu order: View details, Edit, other actions, divider, destructive actions in the danger colour. A destructive action asks confirmation.
- **UI-TBL-08** The header checkbox selects the page. When the whole page is selected and more records exist, the selection bar offers "Select all N <entity>" as a separate explicit action. Selection persists across pages and clears when filters or search change.
- **UI-TBL-17** While rows are selected, a selection bar replaces the filter toolbar in the same place: "Clear selection" ✕, "N selected" (polite live region), "Select all N" when applicable, up to 3 bulk buttons, and ⋯ for more. A bulk destructive action lives in ⋯ and confirms with the count ("Delete 12 laptops?"). A bulk job over 10 s runs in the background with a progress notification. The server reports per-record failures ("10 updated, 2 failed — no access to LT-0051, LT-0057").


## Sorting, columns, density, pagination

- **UI-TBL-18** A sortable header is a `<button>` that toggles ascending and descending, shows the direction icon on the active column (neutral icon on others), and sets `aria-sort`. One sort column at a time. Each list defines a default sort. The toolbar Sort menu offers the same sorts as named presets ("Updated: newest first"). Sort lives in the URL and in views. (UI-TBL-04 applies.)
- **UI-TBL-04** A sortable header is a `<button>`. The sorted column sets `aria-sort`.
- **UI-TBL-19** The Columns menu shows "N of M columns shown", a checkbox per column (locked ones disabled with "Always shown"), Move up and Move down per column, the row-density control, and "Reset columns". Drag reorder may exist but is never the only way. Choices are stored per user per list and in saved views.
- **UI-TBL-20** Rows are 48 px (Comfortable, default) or 40 px (Compact, 13 px text, 12 px cell padding). On coarse pointers rows stay at least 48 px.
- **UI-TBL-02** A business list paginates on the server. Default page size is 25. Show the total count. Infinite scroll only for feeds (activity logs, notifications, chat), never for records users must find or compare.
- **UI-TBL-03** Sort, filter, page and page size live in the URL.
- **UI-TBL-11** Pagination is numbered below the table: "Rows per page" (10, 25, 50, 100; default 25, saved per user per list), the range "1–25 of 248", and Prev, first, current ±1, last, Next with "…" gaps. `aria-current="page"` on the current page. A change of filter, search or sort returns to page 1.
- **UI-TBL-12** Compute sort, totals and counts on the server. Show the exact total up to 10,000, then "10,000+" with Previous and Next only. Render at most 100 rows per page.


## States and phones

- **UI-TBL-09** First load keeps the real header row (labels, sort controls, fixed widths) and the filter bar usable (count reads "Loading…"), with 8 skeleton rows shaped by type: short bar for identifiers, varied-width bars for text, 22 px circle and bar for people, a pill for status, right-aligned bar for numbers, a 16 px square for the checkbox. The totals row and pagination keep their space with placeholders (Next disabled). Skeleton rows are `aria-hidden`; the region sets `aria-busy="true"`. Rows replace placeholders without anything moving. Later changes dim existing rows to 60% with a 2 px progress bar instead; cancel superseded requests. A failed load shows an inline alert ("Couldn't load <entity>", cause, Retry) inside the card and keeps loaded rows.
- **UI-TBL-22** No records at all shows the first-use empty state with the page's primary action. No matches shows the filter no-results state (`filters.md`). Never a table with only headers.
- **UI-TBL-23** Below 768 px the table becomes cards: identifier link and status on the first line, up to 3 `cardField` values, and a 44 px ⋯ button. A "Select" button turns on checkboxes (never long-press-only) and the selection bar; "Done" leaves it. Pagination becomes "Load N more" (25 per load).
