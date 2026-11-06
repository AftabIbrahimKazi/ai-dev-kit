# UI Standards — Search, Filters and Saved Views

Read when: adding a search box, filters, a filter bar, saved views or a "no results" state to a list.

Detail in `ui-standards/filters.ref.md`: saved views, filters drawer, behaviour. Read it only when the task covers one of these.

## Placement

- **UI-FIL-01** Search and filters run on the server against an allow-list of fields and operators in the list config. State lives in the URL, so a link and the back button restore it. Saved views store field keys and values, never raw SQL or query strings; view names are escaped on output.
- **UI-FIL-08** A list with more than one filterable field or more than 25 records has exactly one filter bar, the top section of the list card right below the page header. Filters never go in a modal, a left column or the page header. Export, import and create actions stay in the page header; bulk actions in the table selection bar.
- **UI-FIL-09** At 768 px and up the toolbar order, from the start: view selector (with Save and Reset when modified), search, quick filters (992 px and up), Filters button, flexible space, result count, Sort, Columns. A chips row appears below only when a filter is active. Below 768 px: search on its own row, then view, Filters, result count and Sort.
- **UI-FIL-10** The toolbar and chips row stick to the top of the scroll area; the scroll container sets `scroll-padding-top` of at least their combined height.


## Search and quick filters

- **UI-FIL-02** The search field sits in the bar, is `<input type="search">` in `role="search"`, has a visually hidden label "Search <entity>" and placeholder "Search <entity>…", searches only the text fields configured for the list, queries 300 ms after the last keystroke, cancels the previous request, and submits at once on Enter.
- **UI-FIL-03** At most 3 quick filters, chosen per list, shown inline only at 992 px and up (folded into the Filters drawer at 768–991 px). Never more than 3 inline; the rest go in the drawer. Label: the field name when empty, "<Field>: <value>" for one value, "<Field>: <first> +N" for more. Active ones get a primary border and weight 600, and their accessible name lists all values.
- **UI-FIL-13** A quick filter opens a labelled popover ("<Field> filter") with the field's value picker, a "Clear" text button and "Applied instantly". Changes apply at once. Esc closes it and returns focus to the button.


## Active filters and feedback

- **UI-FIL-04** Active filters show as removable chips with a "Clear all" control.
- **UI-FIL-19** A chip reads "<Field>: <values>" (three or more: "<first>, <second> +N"; a value over 32 characters truncates with a tooltip). Clicking the label opens that field's picker in place (instant); the ✕ is named "Remove filter <Field>: <values>". "Clear all" ends the row. It wraps at 768 px and up and scrolls sideways below.
- **UI-FIL-20** "Clear all" clears filters and search at once and toasts "Filters cleared" with an Undo button (`role="status"`, 10 s, paused on hover and focus). Undo restores all previous filters and the search.
- **UI-FIL-21** Show "Showing N of M <entity>" (phones "N of M") in a polite live region, updated after every change.
- **UI-FIL-05** A change of filter returns to page 1 and clears the selection.
- **UI-FIL-06** A "no results" state says "No <entity> match these filters", names the active filters, and offers "Clear all filters". If removing one filter or the search would return records, name the one that returns the most ("Remove Site: Nashik to see 2 laptops") with a primary button doing exactly that. Never a blank table.
