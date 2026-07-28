# Changelog

All notable changes to the SAPX to MILE Converter are documented here.

## 2.0.0 — 2026-07-28

### Added

- Complete one-page desktop and mobile workflow: Upload, Inspect, Validate, Download.
- Workbook inspection with supported worksheet status, valid row counts, skipped row counts, and informational additional worksheets.
- Record preview with COD and Non-COD tabs, search, responsive desktop table, mobile cards, sticky headers, and limited initial rows.
- Transparent validation for missing fields, invalid weight, invalid COD value, duplicate AWB, empty worksheets, unrecognized headers, and skipped AWB rows.
- Persistent Generated Files panel with repeat download actions.
- Processing summary with real worksheet, record, skipped, warning, and output counts.
- Timestamped, accessible activity log.
- Clear Workspace action that removes the selected file, parsed records, warnings, previews, output references, object URLs, summary, and activity log.
- English SEO metadata, canonical URL, Open Graph, Twitter Card, SoftwareApplication structured data, manifest, robots, sitemap, 404 page, and social preview image.
- Cloudflare Pages security and caching headers.
- Regression tests, static audit, browser regression tooling, fixtures, and testing report.

### Changed

- Migrated every visible interface string to English, including accessibility labels, errors, statuses, helper text, footer, noscript message, README, and export summaries.
- Replaced the oversized centered card with a wide operational workspace.
- Replaced Tailwind runtime CDN and inline CSS with maintainable static CSS.
- Split inline JavaScript into parser, converter, validation, export, and application modules.
- Replaced Google Fonts with a lightweight system font stack.
- Replaced Lucide dependency with accessible inline SVG icons.
- Pinned SheetJS to `0.20.3` instead of using `xlsx-latest`.
- Migrated the footer to the Template MILE structure and responsive behavior: 38 px desktop, 36 px mobile, dark navy, 2 px orange top border, compact single row.
- Improved header matching to tolerate capitalization differences, surrounding spaces, duplicate spaces, duplicate header columns, and empty columns.
- Preserved formatted phone and AWB text to reduce leading-zero and scientific-notation problems.
- Added actionable error handling without browser `alert()` or raw stack traces.
- Preserved local-only workbook processing and removed sensitive console logging.

### Preserved compatibility

- `.xlsx` and `.xls` selection and drag-and-drop.
- Exact worksheet names and header row 3.
- Existing source aliases.
- Rows without AWB remain skipped.
- COD and Non-COD output column names, order, fixed constants, field types, `Sheet1`, output filenames, and sorting rules.
- COD amount cleaning and numeric export behavior.
- Existing automatic download behavior, plus repeat downloads from the interface.

### Fixed

- Non-COD `connote_code` is now assigned after alphabetical recipient sorting, so the sequence is consistently `1..n` in final workbook order. Previously the index was assigned before sorting and could appear out of order after the sort.
- Invalid non-empty COD values are no longer silently presented as legitimate zero; export compatibility still uses numeric zero, while the UI now reports the affected rows.
- Mobile footer no longer becomes a tall vertical block.
- Generated files no longer disappear from the interface immediately after the automatic download.
- File selection now rejects unsupported, empty, and oversized files before parsing.

No account number, customer code, routing code, shipment dimension, output field name, filename pattern, or downstream operational value was changed.
