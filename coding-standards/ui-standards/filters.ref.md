# UI Standards — Search, Filters and Saved Views (reference)

Read when: the task covers saved views, filters drawer, behaviour. The everyday rules are in `ui-standards/filters.md`.

## Saved views

- **UI-FIL-11** The view selector is a menu button "View: <name>" (name only on phones). Menu order: default view "All <entity>", team views, the user's views (tagged "Mine"), each a `menuitemradio` with a check on the current one; then a divider, "Reset to “<base view>”" (only when modified), "Save current view…", "Manage views". A view stores filters, search, sort and visible columns.
- **UI-FIL-12** When filters differ from the selected view the selector keeps its name and adds a "Modified" tag (a dot on phones). At 768 px and up, text buttons "Save" and "Reset" appear beside it. Reset restores the view; Save creates a personal view. Only permitted roles create or edit team views. A view that uses a field the user lost access to drops that filter and shows "Some filters in this view are not available to you."


## Filters drawer

- **UI-FIL-14** The Filters button shows a filter icon, "Filters" and, when active, a count badge of active fields (not values) with a primary border.
- **UI-FIL-15** The drawer opens from the end, 400 px wide (full screen below 768 px), titled "Filters": a "Find a filter" search when the list has more than 6 filters; one collapsible group per field with its value summary ("Any", a value, "N selected"), groups with active values open; a footer with "Reset" and a primary "Show N results" whose count updates live. Changes apply only on "Show N results"; Close, scrim and Esc discard them.
- **UI-FIL-16** Pickers by field type: status, category, tag: checkbox list with counts and a search box above 7 options; person: search box, "Me (<name>)" first, checkboxes; date: radio list (Any time, Today, Last 7 days, Last 30 days, Last 90 days, Custom range…); number or amount: min and max inputs; Yes/No/Any: segmented control; any optional field: an extra "Is empty" option.
- **UI-FIL-17** Values within one field combine with OR; different fields with AND. No custom AND/OR builder.
- **UI-FIL-18** An option's count is the number of records it would show given all other active filters and search. A zero-count option stays selectable, dimmed to 55%. Counts above 999 show "1,000+". Options and counts include only records the user may access.


## Behaviour

- **UI-FIL-22** The URL holds view, filters, search, sort and visible columns (`?view=all&status=in_use,in_repair&site=pune&updated=30d&q=dell&sort=-updated`). Ignore unknown or invalid parameters and toast "Some filters in this link were ignored." Mask `q` in server and application logs; a list flagged `confidential` keeps search text out of the URL.
- **UI-FIL-23** Quick filters, chip edits, chip removal, views and search apply instantly; the drawer applies only on "Show N results".
- **UI-FIL-24** While results load, keep current rows at 60% opacity with a 2 px progress bar along the top of the list and `aria-busy="true"`. Never swap in skeleton rows for a filter change. Cancel superseded requests. On timeout show an inline error with Retry.
- **UI-FIL-07** Filter controls follow `fields.md`, `select.md` and `date.md`.
- **UI-FIL-25** Popovers and the drawer are labelled dialogs; Esc closes them and returns focus to the trigger; no single-key shortcuts; controls are at least 36 px high (44 px on coarse pointers). Below 768 px chips scroll sideways, Filters opens full screen, controls are 44 px.
- **UI-FIL-26** Colours come from tokens. Primary appears only for selected states: active quick-filter border, Filters badge, checked boxes, "Clear all" text, the "Show N results" button. The "Modified" tag uses the warning colours; the undo toast uses inverted page colours.
