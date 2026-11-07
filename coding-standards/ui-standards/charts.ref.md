# UI Standards — Charts and Dashboards (reference)

Read when: the task covers numbers, axes, text, big charts and data. The everyday rules are in `ui-standards/charts.md`.

## Numbers, axes, text

- **UI-CHT-15** Axis labels and KPI values use the locale's compact format (en-IN: ₹1.42 L, ₹3.25 Cr, 18.5K; other locales K, M, B); tooltips and tables show full values (₹1,42,300.00). Percentages show no decimals on axes and up to 2 in tooltips. Negatives use a minus sign (−₹12.5K).
- **UI-CHT-02** Bar and area axes start at zero. Every axis has a label and a unit. Use 4 to 5 "nice" ticks, hide overlapping labels, light horizontal gridlines only, axis text 11 px muted, dates as month names ("Jan", "Wk 30", "16 Jul").
- **UI-CHT-04** A tooltip opens on hover and on keyboard focus (data points are focusable), shows the period label, every visible series with its full value and, when comparing, the change ("▲ 71%"), marks partial periods "(so far)", uses the inverted tooltip colours, and never covers the hovered point.
- **UI-CHT-09** The title states the takeaway and the period. Show the legend above the plot, start-aligned, only for 2 or more series; each item is a toggle button (`aria-pressed`) that hides or shows its series, and at least one stays visible.
- **UI-CHT-16** Clicking a bar, segment or KPI SHOULD open the list filtered to that value ("In repair · Pune") as a real link.
- **UI-CHT-05** Every chart has a text summary (`aria-label`, ECharts `aria`) giving type, range and latest value, one sentence, and a "View as table" alternative with the same data.


## Big charts and data

- **UI-CHT-17** A big chart has a header (title such as "Repair requests · 2026 year to date"), a subtitle stating active filters, a measure switch for several measures, View as table, Download (PNG, CSV) and Full screen, plus a filter row (relevant filters such as site chips, Group by Day / Week / Month with Month default, "Compare with <previous year>") and the point count.
- **UI-CHT-06** The server aggregates by the chosen grain and filters and never sends raw records, and never more than 1,000 raw points. The client samples for display (ECharts `sampling: 'lttb'`) above 120 points and uses the canvas renderer above 2,000 points. Tooltips and the table always use exact values. Cancel requests when filters change.
- **UI-CHT-18** Big charts offer zoom presets (Full year, Q1 to Q4, Last 90 days) and an overview strip showing the full range with the zoomed window highlighted; wheel or pinch zoom may be added.
- **UI-CHT-19** Shade periods after today ("Not yet happened") and never draw them as zero. Label the current partial period "(so far)". "No data" differs from zero.
- **UI-CHT-07** Each widget has its own loading, empty and error state.
- **UI-CHT-20** On phones KPIs are 2 per row, widgets stack full width, axis labels thin out, legends wrap above the plot, big charts default to Month, and a tap shows the tooltip.
- **UI-CHT-21** A dashboard shows "Updated <time ago>" and a manual refresh. Auto-refresh may be enabled for operations dashboards (minimum 5 minutes) and pauses when the tab is hidden.
- **UI-CHT-22** Dashboard and chart endpoints apply the same record permissions as the lists behind them. Aggregated numbers never reveal data the user cannot see in detail.
