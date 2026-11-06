# UI Standards — Table and Record List (reference)

Read when: the task covers inline edit and totals, quality. The everyday rules are in `ui-standards/table.md`.

## Inline edit and totals

- **UI-TBL-21** Only columns marked `editable`, and only for users who may edit that field, can be edited in place; identifiers and system fields never. An editable cell is a button named "Edit <field> for <identifier>, <value>" with a ✎ on hover and focus. Activating it swaps in a focused editor (input for text, number, currency; select for status). Enter (or choosing an option) saves, Esc cancels, one cell at a time. An invalid value keeps the editor open with a danger border and a message under it, linked by `aria-describedby`. Success shows a ✓ for 2 s; a server rejection restores the old value with "Couldn't save. Try again." A conflict restores it with "This record changed. Refresh to see the latest value." Spreadsheet-style grids are a different pattern.
- **UI-TBL-07** A total says its scope: "Total · N <entity>" in the identifier column (all filtered rows) or "Total (this page)". Compute it on the server across the filtered set, only over `summable` columns, in the column's number format, in `<tfoot>`, hidden when there are no records. On phones it is one line above the cards ("Total value ₹…").


## Quality

- **UI-TBL-24** Every checkbox, menu button and editable cell has an accessible name that includes the record identifier. Sorting, selecting, menus, inline edit and pagination work by keyboard. Targets are at least 24 × 24 px (32 px in the table, 44 px on phones).
- **UI-TBL-25** Authorise and validate every inline edit and bulk action per record on the server. Exports respect active filters, visible columns and permissions. Escape cell output.
- **UI-TBL-26** Render at most 100 rows; sorting and paging cause no full reload; column widths come from the config and never change when data arrives; reserve avatar space so nothing shifts. Back end: paginate in the database, index filter and sort columns, avoid N+1 queries, cache large counts and totals.
- **UI-TBL-27** Colours come from tokens: header on the page surface, row hover, selected row, subtle borders, totals row with a 2 px top border, fixed status colours for chips.
- **UI-TBL-28** Edge cases: 1 record shows "1–1 of 1" with Prev and Next disabled; 20 or more columns keep 7 by default; very long values are one line with a tooltip; a read-only role has no checkboxes, no ✎, and ⋯ offers View details only.
