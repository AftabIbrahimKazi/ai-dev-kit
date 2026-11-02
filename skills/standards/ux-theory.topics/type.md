# Type

Typography is the system; a typeface is the family; a font is one weight, style and size of it.

- **Pairing:** at most 2 families, or 1 superfamily. Contrast by classification (serif against sans, or display against text), never two near-identical faces.
- **Scale:** modular scale from a 16px base. Ratios: 1.125 major second (dense UI), 1.2 minor third, 1.25 major third (default), 1.333 perfect fourth, 1.5 perfect fifth (editorial). Make it fluid with `clamp()`.
- **Weights:** at most 3 in use. Hierarchy comes from size and weight together, not weight alone.
- **Measure:** 45–75ch, 66 ideal. Cap with `max-width` in `ch`.
- **Leading:** body 1.4–1.6; headings 1.1–1.25; tighter as size grows.
- **Tracking:** display sizes −0.01 to −0.03em; ALL-CAPS and small labels +0.05 to +0.1em; body untouched.
- **Rag and breaks:** `text-wrap: balance` on headings, `pretty` on body (both are progressive enhancement; `pretty` is not in Firefox). No widows or orphans in headings.
- **Numerals:** `tabular-nums` in tables, prices and counters; lining figures in UI.
- **x-height** decides perceived size: compare faces at equal x-height before pairing.
- **Loading:** variable font where available, subset, `font-display: swap`, a metric-matched fallback to avoid layout shift.
- **Floor:** body text 16px or larger; small text 12px or larger.
