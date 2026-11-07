# UI Standards — Charts and Dashboards

Read when: adding a chart, a dashboard, a KPI tile or a data visualisation.

Detail in `ui-standards/charts.ref.md`: numbers, axes, text, big charts and data. Read it only when the task covers one of these.

## Layout

- **UI-CHT-10** A dashboard page header has the title, "Updated <time ago>", a refresh icon button and the page date-range picker (default "Last 30 days", showing exact dates). Below: a KPI row (at most 4 per row, 2 on phones); small widgets on the 12-column grid (spans 4, 6 or 8); optional big charts full width below the small widgets; lists and tables last. A dashboard has no primary page action.
- **UI-CHT-11** A KPI card shows label, value (compact format, full value in a tooltip), and the change against the previous equal period with an arrow and text ("▲ 18% vs previous 30 days"). Whether up is good is set per KPI: good in the success colour, bad in danger, unchanged muted "– no change". It links to the filtered list behind it.
- **UI-CHT-12** A chart widget has a title naming what is measured (`<h2>`), a subtitle with period and unit ("Last 12 weeks · count"), a legend when there is more than one series, a "View as table" toggle, and its own loading, error and empty states. Widgets load and fail independently.
- **UI-CHT-13** Small widgets (31 points or fewer) follow the page date range and have no own filters. Big charts (full width, 520 to 560 px high) are for long periods and have their own toolbar. A dashboard may hold both; big charts sit below the small widgets or on their own analysis page.


## Choosing and colouring

- **UI-CHT-01** Use a chart only when the pattern matters more than the value. One number is a big number. By question: change over time, a line (up to 5 series; area fill only for one series); compare categories, a horizontal bar sorted descending; share across groups, a stacked bar (100% to compare shares); share of one whole, a donut with 5 parts or fewer and the total in the centre, else a bar; distribution, a histogram; on target, a KPI with a bullet or progress bar and a target marker; two measures related, a scatter. Never 3D, a pie or donut over 5 parts, dual y-axes, decorative gauges or speedometers, or radar charts for business data. Two measures in different units use a measure switch or two charts.
- **UI-CHT-14** Series use the chart palette in fixed order, separate light and dark values (`tokens.md`), each at least 3:1 against its chart background. Status colours only when the series is a status (In use, Overdue). Charts use ECharts, fl_chart or Victory Native XL, nothing else.
- **UI-CHT-03** Colour is never the only encoding: the second line series is dashed, a previous-period comparison is dashed grey, legends, direct labels or tooltips name every series. Use at most 6 series and group the rest into "Other". One entity keeps one colour across all charts.
- **UI-CHT-08** Charts switch palette, gridlines, axis text and tooltip colours with the theme; chart images are never inverted. Honour `prefers-reduced-motion`.
