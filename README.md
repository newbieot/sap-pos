# SAPX to MILE Converter

A lightweight, browser-based utility for converting operational SAPX Excel workbooks into MILE-compatible COD and Non-COD workbooks. The redesigned interface is fully English, while downstream workbook field names and required Indonesian operational values remain unchanged.

Live application: <https://sapx.posnew.com/>

> This is an independently developed utility. It should not be described as an official SAP, Pos Indonesia, MySAP, or corporate system unless written authorization exists.

## What the application does

1. Accepts one `.xlsx` or `.xls` SAPX workbook.
2. Reads the file locally in the browser with SheetJS.
3. Detects shipment headers within the first 100 rows of each worksheet, including vendor workbooks with arbitrary sheet names.
4. Preserves each source worksheet's name and the actual Excel row number, including blank rows.
5. Inspects and validates source records, with source-sheet filters and delivery-area summaries.
6. Skips source rows that do not contain a valid AWB and reports the skipped count.
7. Generates a separate COD workbook, Non-COD workbook, or both for each source sheet with eligible records.
8. Keeps generated files available for repeat download until the workspace is cleared.

## Supported source formats

- Excel Workbook (`.xlsx`)
- Excel 97–2003 Workbook (`.xls`)
- Maximum application upload size: 50 MB

Encrypted workbooks are not supported. The browser must support `File`, `ArrayBuffer`, `Blob`, and object URLs.

## Worksheet detection and grouping

The parser scans the first 100 rows for a recognized AWB column and shipment fields. For example, `vendor pos 3 okt 2026.xlsx` contains `karung A` through `karung I` and `KARDUS`; all ten sheets are processed independently. `karung A` has its header on row 2, and the others have their headers on row 1.

The legacy worksheet names remain supported, with their original fixed shipment type:

- `COD`
- `NON COD (SPESIAL HANDLING)`

Other detected shipment sheets can contain both types: a positive COD amount becomes COD; zero or an empty amount becomes Non-COD. Invalid or negative mixed-sheet amounts are quarantined and reported with the source sheet and Excel row. A row explicitly marked COD without an amount is also quarantined. Conflicting COD indicators are reported. `CASH` and `KREDIT` payment labels do not determine whether a shipment is COD.

Unrelated sheets without recognized shipment headers are displayed as ignored. Blank rows, repeated headers, missing AWBs, summary rows, and invalid AWB values do not become shipments.

## Supported source columns

Header matching is case-insensitive and tolerates surrounding spaces, duplicate spaces, and punctuation variants. Recipient-specific columns take priority over generic aliases, so empty recipient fields do not fall back to unrelated sender fields.

| Data | Recognized source headers |
|---|---|
| AWB | `No. AWB`, `No.AWB`, `AWB`, `Nomor AWB`, `AWB Number`, `awb_no`, `ref_no` |
| Recipient name | `Penerima`, `Nama Penerima`, `nama_penerima`, `destination_data_customer_name` |
| Recipient phone | `Tlp1`, `telp_penerima`, `Telepon Penerima`, `destination_data_customer_phone`, `Telepon` |
| Recipient address | `Alamat Penerima`, `alamat_penerima`, `destination_data_customer_address`, `Alamat` |
| Item description | `Keterangan Barang`, `Isi`, `koli_description`, `koli_data_koli_description`, `Deskripsi Barang` |
| Weight | `Berat`, `Berat (KG)`, `koli_weight`, `koli_data_koli_weight`, `Weight` |
| COD amount | `Nilai COD`, `Nominal COD`, `COD Amount`, `harga_barang`, numeric `COD` |
| Sender | `Pengirim`, `Nama Pengirim`, `origin_data_customer_name` |

Phone and AWB values retain formatted text and leading zeroes. When Excel displays a safe numeric integer in scientific notation, the parser uses its complete underlying digits instead. Digits already removed or rounded in the source cannot be restored.

### KARDUS mapping

The supplied `KARDUS` sheet has 94 columns. The converter selects the shipment fields and ignores the unrelated operational columns:

| Output data | KARDUS source |
|---|---|
| AWB / output `ref_no` | B: `No. AWB` |
| Sender | L: `Pengirim` |
| Recipient name | O: `Penerima` |
| Recipient address | P: `Alamat Penerima` |
| Recipient phone | Q: `Tlp1` |
| Description | T: `Keterangan Barang` |
| COD amount | U: `Nilai COD` |
| Weight | W: `Berat` |

E: `No. Referensi` is a different value and is never used as the AWB. `Kontak`, `Kontak Penerima`, `Alamat Pengirim`, and `Tlp2` do not replace recipient data. If `Keterangan Barang` is blank, the description uses the source `Jenis Kiriman`, then `Jenis Barang` when that header is the available fallback. No item description is invented.

The supplied KARDUS sheet contains 346 Non-COD shipments: 299 explicit zero amounts and 47 empty amounts. Its two `CASH` rows also have zero COD amounts.

## COD conversion behavior

The generated COD workbook uses the original column order:

`nama_penerima`, `telp_penerima`, `alamat_penerima`, `zip_code_penerima`, `zona_penerima`, `koli_description`, `koli_weight`, `koli_width`, `koli_height`, `koli_length`, `account_pgm`, `instruksi_pengiriman`, `harga_barang`, `ref_no`, `Jenis_Barang`, `COD`, `statusRetur`.

COD rows are sorted by `harga_barang` in ascending order within each source sheet. AWB is mapped to both `instruksi_pengiriman` and `ref_no`. The generated worksheet uses the source sheet name, cleaned and shortened to Excel's 31-character limit.

Mixed-sheet COD values support numeric cells and currency strings such as `Rp 25.000` and `Rp 1.500,00`; classification and export use the same parsed amount. Invalid or negative mixed-sheet values are excluded from export and reported for correction. The legacy named `COD` worksheet retains its previous integer cleaning and invalid-value warning behavior.

Output filename:

`template_cod_SOURCE-SHEET_DDMMYYYY.xlsx`

Example: `template_cod_karung A_03102026.xlsx`.

## Non-COD conversion behavior

The generated Non-COD workbook preserves the required schema, with `INS` removed, and is sorted alphabetically by destination recipient name within each source sheet. `connote_code` is sequential in the final sorted workbook. Its worksheet also uses the cleaned source sheet name.

Output filename:

`template_noncod_SOURCE-SHEET_DDMMYYYY.xlsx`

Example: `template_noncod_KARDUS_03102026.xlsx`. A sheet with only Non-COD shipments produces no empty COD file. Cleaned filename collisions receive a numeric suffix.

## Output text and phone rules

Both output formats omit the `INS` column entirely. Content cells allow letters, numbers, spaces, and only these punctuation characters: `.`, `-`, `,`, `(`, `)`. Other characters become spaces in descriptive text and are removed from identifiers such as AWBs and phones. Required schema headers keep their original underscores and spelling. Numeric cells retain their numeric type.

An empty phone or a phone containing fewer than eight digits exports as the text `0`. Longer phone values retain their allowed formatting and existing leading zeroes. Scientific notation is expanded from safe underlying numeric source cells before this rule is applied.

## Delivery-area summary

The summary groups shipments by kecamatan and then kelurahan, supports source-sheet filtering, and exposes identified, inferred, unknown, ambiguous, and conflicting area assignments. The Batam hierarchy covers 12 kecamatan and 64 kelurahan from [Pemerintah Kota Batam's Kompilasi Statistik Sektoral 2025, Table 2.2](https://satudata.batam.go.id/web/wp-content/uploads/2025/07/Kompilasi-Statistik-Sektoral-Tahun-2025.pdf).

Explicit recipient area columns and labeled address fields take priority. Bounded matches against the Batam names can infer an area when no explicit field is available; `Tujuan` is only a controlled fallback and is not automatically a kecamatan. Conflicts and unrecognized addresses remain visible for review. The supplied vendor workbook has no explicit kecamatan or kelurahan columns, so its inferred area counts should not be treated as verified delivery geography.

## Fixed operational constants

**Do not change these constants without operational approval, a before/after workbook comparison, and regression testing.**

### COD constants

| Field | Value |
|---|---|
| Recipient ZIP code | `29411` |
| Recipient zone | `29400` |
| Default weight | `1` |
| Width / height / length | `10` / `10` / `10` |
| Account PGM | `0166648410` |
| Item type | `PAKET` |
| COD indicator | `COD` |
| Return status | `0` |

### Non-COD constants

| Field | Value |
|---|---|
| Customer code | `WSSAP01294A` |
| Fallback sender | `ANGGUN` |
| Sender phone | `082169602910` |
| Sender address | `SAP BATAM` |
| Origin ZIP / zone | `29411` / `29400` |
| Destination ZIP / zone | `29411` / `29400` |
| Service / sub-service | `PKH` / `911231` |
| Default weight | `1` |
| Width / height / length | `10` / `10` / `10` |
| Payment type | `INVOICE` |
| Delivery instruction | `Tolong diantar dengan baik` |
| Item value | `0` |
| Item type | `Paket` |
| Return status | `Kembali ke pengirim` |

## Validation behavior

Validation is transparent and non-destructive. It reports:

- missing AWB and skipped rows;
- missing recipient name, phone, address, description, or weight;
- unusual phone length;
- invalid weight;
- invalid COD value;
- conflicting shipment-type indicators and quarantined mixed-sheet amounts;
- short or empty phones that export as `0`;
- duplicate AWB;
- empty supported worksheets;
- missing AWB header;
- unrecognized source columns;
- corrupt, encrypted, empty, unsupported, or oversized files;
- unavailable SheetJS dependency.

Validation leaves the source workbook unchanged. Export content follows the documented cleaning, phone, and fallback rules. Skipped and quarantined rows are reported once at source-sheet level.

## Privacy and security

Shipment records can contain names, phone numbers, addresses, AWBs, and COD values. The application processes workbook contents locally in the browser.

- No workbook record is uploaded to PosNew Hub or another API.
- No shipment data is sent to analytics.
- No record is placed in a URL.
- No complete shipment row is written to the console.
- Spreadsheet-derived values are rendered with safe DOM text nodes, not unsafe `innerHTML`.
- Generated object URLs are revoked when the workspace is cleared or the page closes.

The only production dependency request is the pinned SheetJS browser build. Security headers are defined in `_headers` and tested against the current dependency list.

## Repository structure

```text
/
├── index.html
├── 404.html
├── assets/
│   ├── css/app.css
│   └── js/
│       ├── app.js
│       ├── workbook-parser.js
│       ├── converters.js
│       ├── delivery-summary.js
│       ├── validation.js
│       └── export.js
├── docs/screenshots/
├── functions/_middleware.js
├── tests/
├── favicon.svg
├── favicon-32x32.png
├── apple-touch-icon.png
├── og-cover.png
├── site.webmanifest
├── robots.txt
├── sitemap.xml
├── _headers
├── README.md
├── CHANGELOG.md
└── TESTING.md
```

## Local development

No build command or Node server is required for production. Serve the repository root through any static HTTP server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080/`. Opening `index.html` directly through `file://` is not recommended because browser security rules can affect absolute asset paths.

## Tests

Run dependency-free unit and regression tests:

```bash
node tests/run-tests.js
python tests/static-audit.py
```

Browser regression and screenshot generation use Python Playwright when available:

```bash
python tests/browser-regression.py
```

Verify a private local workbook with the real cached pinned SheetJS `0.20.3` build, optionally against an independent row audit:

```bash
node tests/vendor-regression.js "<input.xlsx>" "<cached-sheetjs-0.20.3.js>"
node tests/vendor-regression.js "<input.xlsx>" "<cached-sheetjs-0.20.3.js>" "<independent-audit.json>"
```

The vendor browser regression expects the supplied 3 October 2026 sample. It uses the real pinned runtime and a local server. In PowerShell, provide the Playwright package path and optionally a Chromium executable:

```powershell
$env:PLAYWRIGHT_NODE_PATH = 'C:\path\to\playwright'
$env:CHROME_PATH = 'C:\path\to\chrome.exe'
node tests/browser-vendor-regression.js "<vendor-input.xlsx>" "<cached-sheetjs-0.20.3.js>"
```

`CHROME_PATH` can be omitted when Playwright's Chromium is installed. Private workbooks and independent audit files are not committed.

See [`TESTING.md`](TESTING.md) for the full regression report and test limitations.

## Cloudflare Pages deployment

Recommended settings:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `/` or the repository root, depending on the dashboard wording
- Root directory: `/`
- Environment variables / secrets: none

The repository is a static application. `functions/_middleware.js` preserves the permanent redirect from `sap-pos.pages.dev` to `sapx.posnew.com`. `_headers` provides security and cache rules. Ensure the custom domain `sapx.posnew.com` remains assigned to the Pages project.

After deployment, verify:

1. `/`, `/404.html`, `/robots.txt`, `/sitemap.xml`, and `/site.webmanifest` return correctly.
2. CSS and JavaScript use the correct MIME types.
3. The pinned SheetJS URL is permitted by the Content Security Policy.
4. A valid XLSX and XLS workbook can be inspected and exported.
5. The browser console contains no errors.

## Known limitations

- One source workbook is processed at a time to preserve reliability and the existing workflow.
- Shipment headers must be recognized within the first 100 worksheet rows.
- Password-protected or encrypted workbooks cannot be read.
- Very large workbooks remain subject to available browser memory.
- The converter does not repair business data; warnings require an operator decision.
- Delivery-area inference depends on source address detail; unknown and conflicting areas require review.

## Troubleshooting

**Spreadsheet engine unavailable**  
Refresh the page and verify that `cdn.sheetjs.com` is not blocked by the network or browser extension.

**No supported worksheet found**  
Confirm that shipment sheets contain a recognized AWB header and recipient/shipment fields within their first 100 rows. Legacy `COD` and `NON COD (SPESIAL HANDLING)` sheets remain supported.

**Worksheet found but no valid records**  
Check the detected header row, valid AWB values, and reported skipped or quarantined rows. Invalid mixed-sheet COD amounts must be corrected before those rows can be exported.

**Leading zeroes are missing in the source workbook**  
Format phone and AWB columns as text before saving the source file. The converter preserves the formatted text supplied by SheetJS but cannot restore digits already removed by Excel.

**Downloads do not start**  
Allow downloads for the site, then use the persistent download buttons in the Generated Files panel.
