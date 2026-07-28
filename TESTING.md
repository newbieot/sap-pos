# Regression Testing Report

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
