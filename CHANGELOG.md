# Changelog

All notable changes to the SAPX to MILE Converter are documented here.

## Unreleased — 2026-10-03

### Added

- Shipment-sheet detection from recognized headers within the first 100 rows, including the ten-sheet vendor format with `karung A` through `karung I` and the 94-column `KARDUS` report.
- Source-sheet inspection, preview filtering, and separate COD/Non-COD outputs for each sheet with eligible records. Filenames and worksheet tabs use the source name; cleaned filename collisions receive a suffix.
- Per-sheet COD classification from the amount: positive amounts are COD, while zero or empty amounts are Non-COD. Invalid or negative mixed-sheet amounts and explicit COD rows without amounts are quarantined and reported with their actual Excel row.
- Delivery-area summaries with kecamatan-to-kelurahan grouping, source filters, and visible inferred, unknown, ambiguous, and conflicting assignments. The Batam hierarchy uses the city's published 12 kecamatan and 64 kelurahan; address inference remains subject to source quality.
- Real pinned SheetJS workbook roundtrip and browser regression tooling, plus independent comparisons against private source-row audits.
- Expandable warning details with original Excel rows, source sheet and column, AWB, recipient, source/output values, reasons, and corrective actions. All affected rows are available through pagination and exact `row:223` search; missing-column warnings refer to the header row.

### Changed

- Use `SAP Batam` for `origin_data_customer_name` when the source sender name is absent.
- Removed `INS` from both export schemas.
- Cleaned output content to letters, numbers, spaces, and `.`, `-`, `,`, `(`, `)`, while preserving required schema headers. Other characters become spaces in descriptions and are removed from identifiers.
- Exported empty phone values and values with fewer than eight digits as text `0`.
- Preserved source sheet names, actual row numbers across blanks, and per-sheet sorting. Legacy named COD and Non-COD sheets remain supported.

### Fixed

- KARDUS output `ref_no` now uses `No. AWB`, never the unrelated `No. Referensi`, sender address, or contact fields. Blank descriptions use the source shipment-kind field when available.
- Mixed-sheet currency notation uses the same parsed amount for classification and conversion, including values such as `Rp 1.500,00`.
- Expanded scientific-notation phones and AWBs from safe underlying numeric cells without removing existing formatted leading zeroes.
- Excluded repeated headers, summary rows, invalid AWBs, and ambiguous COD amounts instead of interpreting them as shipments.

### Verified

- The supplied vendor workbook contains 725 shipments across ten sheets: 198 COD and 527 Non-COD, producing 17 files. All 346 KARDUS records are Non-COD.
- The older 24 September workbook remains readable: two sheets and five shipment rows.
- Private source workbooks and independent audit files remain outside version control. See `TESTING.md` for current and historical test evidence.

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
