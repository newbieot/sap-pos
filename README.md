# SAPX to MILE Converter

A lightweight, browser-based utility for converting operational SAPX Excel workbooks into MILE-compatible COD and Non-COD workbooks. The redesigned interface is fully English, while downstream workbook field names and required Indonesian operational values remain unchanged.

Live application: <https://sapx.posnew.com/>

> This is an independently developed utility. It should not be described as an official SAP, Pos Indonesia, MySAP, or corporate system unless written authorization exists.

## What the application does

1. Accepts one `.xlsx` or `.xls` SAPX workbook.
2. Reads the file locally in the browser with SheetJS.
3. Detects worksheets named exactly `COD` and `NON COD (SPESIAL HANDLING)`.
4. Reads the current source header row at spreadsheet row 3.
5. Inspects and validates source records without changing the business schema.
6. Skips source rows that do not contain a valid AWB and reports the skipped count.
7. Generates a COD workbook, a Non-COD workbook, or both.
8. Keeps generated files available for repeat download until the workspace is cleared.

## Supported source formats

- Excel Workbook (`.xlsx`)
- Excel 97–2003 Workbook (`.xls`)
- Maximum application upload size: 50 MB

Encrypted workbooks are not supported. The browser must support `File`, `ArrayBuffer`, `Blob`, and object URLs.

## Expected worksheet names

Worksheet names are matched exactly so unrelated worksheets are never interpreted as shipment data:

- `COD`
- `NON COD (SPESIAL HANDLING)`

Additional worksheets are displayed as informational and ignored by the converter.

## Supported source columns

Header matching is case-insensitive and safely ignores surrounding spaces, duplicate spaces, and empty columns.

| Data | Recognized source headers |
|---|---|
| AWB | `No. AWB`, `No.AWB`, `AWB` |
| Recipient name | `Penerima` |
| Recipient phone | `Tlp1`, `Telepon` |
| Recipient address | `Alamat Penerima`, `Alamat` |
| Item description | `Keterangan Barang`, `Isi` |
| Weight | `Berat` |
| COD amount | `Nilai COD`, `COD` |
| Sender | `Pengirim` |

Phone and AWB values are read from formatted spreadsheet text and exported as strings where required, reducing the risk of lost leading zeroes or scientific notation.

## COD conversion behavior

The generated COD workbook uses the original column order:

`nama_penerima`, `telp_penerima`, `alamat_penerima`, `zip_code_penerima`, `zona_penerima`, `koli_description`, `koli_weight`, `koli_width`, `koli_height`, `koli_length`, `account_pgm`, `instruksi_pengiriman`, `harga_barang`, `ref_no`, `Jenis_Barang`, `COD`, `statusRetur`, `INS`.

COD rows are sorted by `harga_barang` in ascending order. AWB is mapped to both `instruksi_pengiriman` and `ref_no`. The generated worksheet is named `Sheet1`.

COD values support numeric cells and formatted strings. Compatible cleaning removes `Rp`, periods, commas, and surrounding spaces before integer conversion. An invalid non-empty COD value still falls back to numeric `0`, matching the old export behavior, but the new interface reports a warning instead of treating it as a legitimate zero silently.

Output filename:

`template_cod_sapx_DDMMYYYY.xlsx`

## Non-COD conversion behavior

The generated Non-COD workbook preserves the original output schema and is sorted alphabetically by destination recipient name. `connote_code` is sequential in the final sorted workbook. The generated worksheet is named `Sheet1`.

Output filename:

`template_noncod_sapx_DDMMYYYY.xlsx`

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
| INS | empty / null |

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
| INS | empty / null |

## Validation behavior

Validation is transparent and non-destructive. It reports:

- missing AWB and skipped rows;
- missing recipient name, phone, address, description, or weight;
- unusual phone length;
- invalid weight;
- invalid COD value;
- duplicate AWB;
- empty supported worksheets;
- missing AWB header;
- unrecognized source columns;
- corrupt, encrypted, empty, unsupported, or oversized files;
- unavailable SheetJS dependency.

Warnings do not silently rewrite source values. Rows without AWB continue to be skipped for backward compatibility.

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
- Worksheet names remain exact by design.
- Headers are expected on spreadsheet row 3.
- Password-protected or encrypted workbooks cannot be read.
- Very large workbooks remain subject to available browser memory.
- The converter does not repair business data; warnings require an operator decision.

## Troubleshooting

**Spreadsheet engine unavailable**  
Refresh the page and verify that `cdn.sheetjs.com` is not blocked by the network or browser extension.

**No supported worksheet found**  
Confirm that the workbook includes `COD` or `NON COD (SPESIAL HANDLING)` with exact spelling.

**Worksheet found but no valid records**  
Confirm that row 3 contains a supported AWB header and that shipment rows have non-empty AWB values.

**Leading zeroes are missing in the source workbook**  
Format phone and AWB columns as text before saving the source file. The converter preserves the formatted text supplied by SheetJS but cannot restore digits already removed by Excel.

**Downloads do not start**  
Allow downloads for the site, then use the persistent download buttons in the Generated Files panel.
