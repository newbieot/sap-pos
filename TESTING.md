# Regression Testing Report

## 2026-10-03 — Vendor workbook support

The current implementation was verified with the real pinned SheetJS `0.20.3` runtime and the supplied private `vendor pos 3 okt 2026.xlsx`, alongside an independent source-row audit. Source workbooks and audit JSON files are not committed.

### Results

- Node regression tests: **21 passed, 0 failed**. Coverage includes mixed-sheet detection, accurate Excel rows across blanks, currency notation, invalid-value quarantine, KARDUS recipient/AWB mapping, output sanitization, short phones, scientific phone recovery, area grouping, and exact validation rows/source columns/values for headers, duplicates, and skipped records.
- Vendor workbook: **10 shipment sheets, 725 records, 198 COD, 527 Non-COD, 17 output files**.
- Real XLSX export roundtrip: each output's source tab name, row count, schema, omission of `INS`, cleaned text, recipient fields, phones, and AWB references were checked. Independent audit comparisons covered every source row.
- Actual-workbook browser regression: the pinned SheetJS build exercised upload, sheet counts and filtering, the 346-record KARDUS preview, all 17 exports, unique filenames, mobile page width, and workspace clearing with no page errors.
- Detailed validation audit: all **26 groups and 363 details** match independent source-row checks with no mismatches. These comprise 354 shipment rows and nine missing sender headers. Header row 2 in karung A and row 1 in B–I are reported correctly. Phone details show the source value and exported text `0`; empty descriptions remain empty and missing sender headers document the `ANGGUN` fallback.
- Warning-detail browser checks cover 25-row pages, Next, exact `row:14`/`row:223` search, original column `Q · Tlp1`, blank versus numeric zero, header scope, and expanded-card layout at mobile widths. Independent UI review also verified that hostile spreadsheet text stays literal and cannot execute scripts.
- Legacy workbook `SAP X POS TGL 24-09-2026.xlsx`: **two sheets, five shipment rows** remained readable.

| Source sheet | Records | COD | Non-COD | Outputs |
|---|---:|---:|---:|---:|
| karung A | 38 | 12 | 26 | 2 |
| karung B | 59 | 38 | 21 | 2 |
| karung C | 37 | 13 | 24 | 2 |
| karung D | 23 | 12 | 11 | 2 |
| karung E | 44 | 28 | 16 | 2 |
| karung F | 64 | 41 | 23 | 2 |
| karung G | 76 | 54 | 22 | 2 |
| karung H | 22 | 0 | 22 | 1 |
| karung I | 16 | 0 | 16 | 1 |
| KARDUS | 346 | 0 | 346 | 1 |
| **Total** | **725** | **198** | **527** | **17** |

### Accuracy checks and limitations

KARDUS has 94 source columns. Its AWB is column B (`No. AWB`), while column E (`No. Referensi`) differs in 159 rows. The row audit verified that output `ref_no` uses the AWB. Recipient name, address, and phone come from `Penerima`, `Alamat Penerima`, and `Tlp1`; unrelated sender/contact fields and `Tlp2` are not substituted. For 176 empty descriptions, the source shipment kind supplies 172 `DOKUMEN` and four `PAKET` values. Zero and blank COD amounts correctly produce Non-COD even on the two `CASH` rows.

The audit also exposed scientific display text such as `6.28177E+12` with intact underlying phone digits. The parser preserves the full safe numeric integer before phone cleaning. Empty and fewer-than-eight-digit phones export as text `0`; source leading zeroes remain when available. Digits already lost or rounded in Excel cannot be reconstructed.

Mixed-sheet invalid or negative COD amounts and explicit COD indicators without an amount are quarantined, with their source rows reported. Repeated headers, totals, and invalid AWB rows are also excluded. These synthetic edge cases are separate from the supplied vendor workbook, which had 725 valid AWBs and no skipped rows.

Delivery-area grouping uses the published Batam hierarchy of 12 kecamatan and 64 kelurahan. The supplied workbook has no explicit kecamatan or kelurahan columns. Address-based assignments therefore expose their inferred status, unknown addresses, and source conflicts; these counts are not an independently verified geographic ground truth. Area filtering and hierarchy behavior must retain the displayed unknown and conflict counts.

### Reproduction

```bash
node tests/run-tests.js
python tests/static-audit.py
node tests/vendor-regression.js "<input.xlsx>" "<cached-sheetjs-0.20.3.js>" "<independent-audit.json>"
```

The independent audit argument is optional. For the vendor-specific browser regression, use the supplied 3 October workbook and configure the local Playwright package:

```powershell
$env:PLAYWRIGHT_NODE_PATH = 'C:\path\to\playwright'
$env:CHROME_PATH = 'C:\path\to\chrome.exe'
node tests/browser-vendor-regression.js "<vendor-input.xlsx>" "<cached-sheetjs-0.20.3.js>"
```

`CHROME_PATH` is optional when Playwright's Chromium is installed. The browser harness serves the repository locally and supplies the cached official SheetJS build for the pinned CDN request. Deployment/domain checks remain separate from these local tests.

## Historical report — 2026-07-28

The following report records the earlier 2.0.0 redesign. Its fixed sheet names, row-3 header assumption, `Sheet1` exports, `INS` schema, and test-double limitation describe that historical version; the current behavior and real-runtime verification are documented above.

Date: 2026-07-28  
Target: `redesign/complete-ui-ux`

## Test strategy

Testing combines:

1. Dependency-free Node unit tests against the production parser, converters, validation, and export modules.
2. Python static audits for required files, SEO, dependency cleanup, responsive footer rules, and reduced-motion support.
3. Browser regression with Chromium and Playwright using a deterministic local SheetJS-compatible test double. The test double exercises the production UI flow without sending fixture data to a network service.
4. XLSX and XLS fixture files generated locally for upload controls and browser behavior.
5. Screenshot review at desktop and mobile viewport sizes.

The production application uses the pinned official SheetJS browser build `0.20.3`. The execution environment used for this report had no outbound DNS access, so it could not download or execute that remote CDN file during local browser tests. Parser and converter behavior was therefore tested directly, and browser UI/export orchestration was tested with the deterministic API-compatible test double. A final live-deployment smoke test with the pinned CDN remains required after Cloudflare Pages publishes the branch.

## Automated results

- Node regression tests: **11 passed, 0 failed**.
- Static repository audit: **passed**.
- JavaScript syntax checks: **passed** for all production modules.
- Browser UI regression: recorded by `tests/browser-regression.py` and screenshots in `docs/screenshots/`.

## Functional regression checklist

| Area | Test | Result |
|---|---|---|
| File input | Valid XLSX selection | Passed in browser fixture flow |
| File input | Valid XLS selection | Passed in browser fixture flow |
| File input | Drag and drop | Passed in browser automation |
| File input | Browse selection | Passed |
| File input | Remove and replace | Passed |
| File input | Unsupported extension | Passed |
| File input | Empty file | Passed |
| File input | Corrupt/encrypted workbook messaging | Production error mapping inspected; live SheetJS smoke test required |
| Worksheet detection | COD only | Unit fixture passed |
| Worksheet detection | Non-COD only | Unit fixture passed |
| Worksheet detection | Both worksheets | Unit and browser fixtures passed |
| Worksheet detection | Neither worksheet | Unit validation passed |
| Worksheet detection | Additional unrelated worksheets | Passed; shown informational and ignored |
| Worksheet detection | Empty supported worksheet | Validation path passed |
| Worksheet detection | No valid AWB | Validation path passed |
| COD | AWB aliases and normalized header matching | Passed |
| COD | Recipient fields and address aliases | Passed |
| COD | Phone preserved as string | Passed |
| COD | Default weight when empty | Passed |
| COD | Numeric and formatted COD cleaning | Passed |
| COD | Invalid COD warning and zero fallback | Passed |
| COD | Missing AWB skipped | Passed |
| COD | Amount ascending sort | Passed |
| COD | Fixed constants and output schema | Passed |
| COD | Filename pattern | Passed |
| COD | Worksheet name `Sheet1` | Passed through export API test double |
| COD | Automatic widths | Passed through export module test |
| Non-COD | Sender and fallback sender | Passed |
| Non-COD | Fixed origin/destination/service values | Passed |
| Non-COD | Phone strings and AWB reference | Passed |
| Non-COD | Alphabetical recipient sort | Passed |
| Non-COD | Sequential `connote_code` after sort | Passed |
| Non-COD | Filename pattern and output schema | Passed |
| Results | Real row, skipped, warning, and output counts | Passed in browser fixture flow |
| Results | COD and Non-COD downloads | Passed with export API test double |
| Results | Repeat download | Passed in UI automation |
| Results | Clear workspace and object URL cleanup | Code path and browser UI passed |
| Accessibility | English `lang`, skip link, landmarks, labels, live regions | Static audit passed |
| Accessibility | Keyboard focus styles and touch targets | CSS audit and screenshot review passed |
| Accessibility | Reduced-motion mode | Static audit passed |
| Responsive | Desktop, tablet logic, mobile portrait | CSS and browser screenshots passed |
| Responsive | No horizontal page overflow | Browser assertion passed |
| Footer | Template MILE desktop and mobile behavior | CSS audit and comparison screenshot passed |
| Technical | No Tailwind runtime, Google Fonts, Lucide, or unpinned SheetJS | Passed |
| Technical | No mixed Indonesian/English UI | Automated common-string audit passed; required operational export values intentionally remain Indonesian |
| Technical | Local-only data path and no sensitive console logs | Source audit passed |
| Cloudflare | Static paths, middleware redirect, headers | Repository audit passed; post-deploy smoke test required |

## Verified operational constants

All COD and Non-COD constants listed in `README.md` were asserted by automated tests. Output field names and order were compared against explicit arrays in `assets/js/converters.js`.

## Documented bug correction

### Non-COD connote sequence after sorting

- Original behavior: `connote_code` was assigned from the source row index before records were alphabetically sorted by recipient.
- Affected field: `connote_code`.
- Corrected behavior: records are sorted first, then numbered sequentially from 1.
- Reason: the final worksheet can now have a coherent sequence in its actual display order.
- Workbook impact: no column, constant, filename, or recipient order changes; only the sequence now matches the final sorted order.
- Tests: alphabetical order and final `[1, 2, ...]` sequence are asserted in `tests/run-tests.js`.

## Post-deployment checks

After Cloudflare Pages deploys the pull request preview or production branch:

1. Open the deployed URL with network access.
2. Confirm SheetJS `0.20.3` loads under the configured Content Security Policy.
3. Process the included valid XLSX and XLS fixtures with the real SheetJS runtime.
4. Open both generated workbooks in Excel or LibreOffice.
5. Compare columns, types, constants, sorting, `Sheet1`, widths, and filenames with the expected values.
6. Confirm direct custom-domain access and the legacy Pages redirect.
7. Review the browser console and Network panel for errors or unexpected record transmission.
