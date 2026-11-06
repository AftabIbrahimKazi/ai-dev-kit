# UI Standards — Export

Read when: adding an Export action or generating a CSV, Excel, PDF or Word file.

Detail in `ui-standards/export.ref.md`: excel, pdf and word. Read it only when the task covers one of these.

## Metadata and naming

- **UI-EXP-10** Generate every export from one metadata object: `fileName`, `title`, `subtitle`, `date` (generation date and time with time zone), `logo` (tenant or product), `classification` (Internal or Confidential), `generatedBy`, `filters`, `sort`, `columns` (key, label, type, summable), `rowCount`, and `recordId` for a single record.
- **UI-EXP-06** A list file is named `{Product}_{Title}_{FilterSummary}_{YYYY-MM-DD}_{HHmm}.{ext}`; a single-record file `{Product}_{DocumentType}_{RecordId}_{YYYY-MM-DD}.{ext}`. Letters, digits, hyphens and underscores only, at most 80 characters. Strip user-supplied characters. No personal names, emails or internal IDs.
- **UI-EXP-11** Every Excel sheet, PDF and Word file starts with: the logo (tenant logo when white-labelled, else the product logo), the title (the page `<h1>` or document type), the subtitle (one line or the record identifier), the date directly below, then for lists a meta line with filters, sort and record count. A tenant without a logo uses the product logo.
- **UI-EXP-12** Every PDF and Word page, and every printed Excel page, has a footer: "Generated <date, time, zone> · <user> · <product>" at the start, the classification in capitals in the centre (Confidential in danger red), and "Page X of Y" at the end. (UI-EXP-04 applies.)
- **UI-EXP-04** A document carries a title, the generated date and time with time zone, the applied filters and the row count. A PDF has page numbers.


## Content

- **UI-EXP-02** An export applies the same permissions and filters as the screen. It includes only records and columns the user may view. Restricted fields are never exported; Confidential fields need the export permission. A Confidential PDF carries a light diagonal watermark "CONFIDENTIAL · <user> · <date>".
- **UI-EXP-13** By default a list export contains what the user sees: current filters and search, visible columns in their order, current sort, and totals for summable columns. The dialog may switch to "Selected rows" and "All columns I can access".
- **UI-EXP-03** Use the product's locale formats in human exports: the same date format as the UI, times with time zone, number grouping per locale, the currency unit in the column header ("Value (₹)"), "—" for empty values, status as text. Machine exports use ISO dates. In Excel numbers are numbers and dates are dates, never text. A CSV is UTF-8 with a BOM.
- **UI-EXP-01** Neutralise formula injection in Excel and CSV: a text value starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`.


## Dialog, jobs, security

- **UI-EXP-07** The page-header Export button opens a dialog: Format (Excel, CSV, PDF, Word), Rows (Current filters · N / Selected · N), Columns (Visible · N / All I can access · N), Page orientation (PDF and Word only: Automatic, Portrait, Landscape), a live file-name preview, and the note "Includes title, description, date, filters, logo and page numbers · <Classification> · This export is recorded in the audit log." The primary button names the format ("Export PDF") and its scope. With 0 matching rows the button is disabled with the tooltip "Nothing to export — no laptops match these filters".
- **UI-EXP-05** An export expected to take over 10 s (guideline: PDF or Word over 1,000 rows, Excel or CSV over 10,000) runs as a background job: progress toast, then a bell notification with a download link that expires after 24 h.
- **UI-EXP-08** Record every export in the audit log: user, type, format, filters, row count, time. Deliver through signed links that expire after 10 min; delete files from the app's storage after 24 h.
- **UI-EXP-09** A native client requests the export from the backend and opens it with the system share or preview sheet. It never builds the file on the device.
