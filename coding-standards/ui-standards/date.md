# UI Standards — Date, Date-time and Range Picker

Read when: adding any date, date-time or date-range field or filter.

- **UI-DTE-01** Show dates with the month as a word, day first by default: `07 Oct 2026`; date-times `07 Oct 2026, 2:30 PM`; ranges `07 – 14 Oct 2026` in one month, `07 Oct – 14 Nov 2026` in one year, otherwise full on both sides. A project may set another readable format once. Store and send ISO 8601. Never show `2026-10-07`, `yy-mm-dd` or `10/07/2026`.
- **UI-DTE-02** The field accepts typed dates in day-first forms (`7/10/26`, `07-10-2026`, `07.10.2026`, `7 oct`, `7 Oct 2026`), reformats on blur, and assumes the current year when none is typed. Help text lists the accepted forms. An impossible date shows "Enter a real date, e.g. 28 Feb 2026".
- **UI-DTE-03** The field is 36 px high (44 px coarse), about 220 px wide for a date and 300 px for a range, with a clear ✕ when filled and a calendar icon button named "Choose <label> from calendar" at the end. Never a native browser date input.
- **UI-DTE-04** The calendar is a 272 px popover below the field: month navigation (‹ Month YYYY ›), weekdays from Monday, 32 px day cells in tabular digits, today outlined and the selected day filled in the primary colour, days outside min and max or in `disabledDates` dimmed and unselectable (reason as tooltip), and a footer with "Today" and "Clear".
- **UI-DTE-05** Follow the ARIA date-picker dialog: `role="grid"`, day buttons labelled with the full date ("12 Oct 2026, today"); arrows move by day or week, Page Up and Down by month, Home and End to week start and end, Enter selects, Escape closes and returns focus to the field. The month title is announced politely on change. (browser)
- **UI-DTE-06** With `withTime` the field shows date and time as one value and the popover adds a 12-hour list with AM/PM at `minuteStep` (default 15) that also accepts typed times ("2:30 pm", "14:30"). Show the time zone ("IST") when it differs from the user's or users span zones.
- **UI-DTE-07** The range popover shows presets on the start side (Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This quarter, Custom; configurable) and two consecutive months on the other, with a footer draft ("01 – 07 Oct 2026 · 7 days"), Cancel and Apply. Changes apply only on Apply.
- **UI-DTE-08** Custom range: first click sets the start, hover previews, second click sets the end (an earlier day swaps them). Ends are filled, days between tinted. When `maxRangeDays` is exceeded Apply is unavailable and the footer says "Choose up to 366 days". Check that start is not after end.
- **UI-DTE-09** In a filter bar a preset range is shown by its name ("Updated: Last 30 days") and recalculated against today; a custom range shows its dates. Store ranges in the URL as ISO dates or preset keys.
- **UI-DTE-10** Below 768 px the calendar and range picker are bottom sheets: one month, 40 px day cells, horizontally scrolling preset chips (range), footer buttons "Cancel" and "Apply · <N> days".
- **UI-DTE-11** Error, disabled (reason shown), read-only (plain text in the display format) and required states follow `forms.md`.
- **UI-DTE-12** Store a date-only value with no time-zone conversion (a date is a calendar day). Store date-times in UTC and show them in the user's zone.
- **UI-DTE-13** The server re-validates dates, ranges, min and max, and maximum range length. Client checks are for speed.
- **UI-DTE-14** Colours come from tokens: selected primary and on-primary, range tint, today ring, hover, raised panel with overlay shadow.
