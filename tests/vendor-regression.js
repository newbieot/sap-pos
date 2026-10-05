'use strict';

// Exercise the actual pinned SheetJS build against a local workbook. The source
// workbook and independent audit remain outside version control.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../assets/js/workbook-parser.js');
const converters = require('../assets/js/converters.js');
const exporter = require('../assets/js/export.js');
const validation = require('../assets/js/validation.js');

async function main() {
  const [sourcePath, sheetjsPath, auditPath] = process.argv.slice(2);
  if (!sourcePath || !sheetjsPath) throw new Error('Usage: node tests/vendor-regression.js <source.xlsx> <sheetjs.js> [independent-audit.json]');
  const xlsx = require(path.resolve(sheetjsPath));
  const parsed = parser.parseWorkbook(fs.readFileSync(sourcePath), xlsx);
  const audit = auditPath ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : null;
  let outputCount = 0;
  let outputRecords = 0;
  let codTotal = 0;
  const uniqueFilenames = new Set();

  for (const sheet of parsed.sheets) {
    for (const type of ['cod', 'nonCod']) {
      const records = sheet[type]?.records || [];
      if (!records.length) continue;
      const isCod = type === 'cod';
      const columns = isCod ? converters.COD_COLUMNS : converters.NON_COD_COLUMNS;
      const data = isCod ? converters.convertCod(records) : converters.convertNonCod(records);
      const filename = converters.createOutputFilename(type, new Date(2026, 9, 3), sheet.sourceSheetName);
      assert.ok(!uniqueFilenames.has(filename), 'Output filenames must be distinct');
      uniqueFilenames.add(filename);
      const file = exporter.createWorkbookFile({
        xlsx, data, columns, filename, type, sourceSheetName: sheet.sourceSheetName,
        textColumns: isCod ? ['telp_penerima', 'instruksi_pengiriman', 'ref_no']
          : ['origin_data_customer_phone', 'destination_data_customer_phone', 'ref_no']
      });
      try {
        const roundtrip = xlsx.read(new Uint8Array(await file.blob.arrayBuffer()), { type: 'array' });
        assert.deepEqual(roundtrip.SheetNames, [sheet.sourceSheetName]);
        const rows = xlsx.utils.sheet_to_json(roundtrip.Sheets[sheet.sourceSheetName], { header: 1, raw: true, defval: '' });
        assert.deepEqual(rows[0], columns);
        assert.ok(!rows[0].includes('INS'));
        assert.equal(rows.length - 1, records.length);
        const sortColumn = columns.indexOf(isCod ? 'harga_barang' : 'destination_data_customer_name');
        for (let i = 2; i < rows.length; i += 1) {
          const previous = rows[i - 1][sortColumn];
          const current = rows[i][sortColumn];
          assert.ok(isCod ? previous <= current : previous.localeCompare(current, 'id', { sensitivity: 'base', numeric: true }) <= 0,
            `${sheet.sourceSheetName} ${type}: Excel rows ${i} and ${i + 1} must be sorted`);
        }
        if (!isCod) assert.deepEqual(rows.slice(1).map((row) => row[columns.indexOf('connote_code')]), records.map((_, index) => index + 1));
        const byAwb = new Map(records.map((record) => [converters.sanitizeOutputText(record.awb, { identifier: true }), record]));
        for (const row of rows.slice(1)) {
          row.forEach((value) => {
            if (typeof value === 'string') assert.doesNotMatch(value, /[^\p{L}\p{N} .\-,()]/u);
          });
          const record = byAwb.get(row[columns.indexOf('ref_no')]);
          assert.ok(record, 'Every output reference must match a source AWB');
          assert.equal(row[columns.indexOf(isCod ? 'telp_penerima' : 'destination_data_customer_phone')], converters.normalizeOutputPhone(record.phone));
          assert.equal(row[columns.indexOf(isCod ? 'nama_penerima' : 'destination_data_customer_name')], converters.sanitizeOutputText(record.recipientName));
          assert.equal(row[columns.indexOf(isCod ? 'alamat_penerima' : 'destination_data_customer_address')], converters.sanitizeOutputText(record.address));
          if (isCod) codTotal += row[columns.indexOf('harga_barang')];
        }
        outputCount += 1;
        outputRecords += records.length;
      } finally {
        exporter.revokeFile(file);
      }
    }
  }
  assert.equal(outputRecords, (parsed.cod?.records.length || 0) + (parsed.nonCod?.records.length || 0));
  if (audit) {
    // Audit shape is normalized below so temporary readers can keep their own
    // top-level metadata without changing this verifier.
    const expectedSheets = Array.isArray(audit.sheets) ? audit.sheets : Object.entries(audit.sheets).map(([name, sheet]) => ({ name, ...sheet }));
    for (const expected of expectedSheets) {
      const actual = parsed.sheets.find((sheet) => sheet.sourceSheetName === (expected.name || expected.sheetName));
      assert.ok(actual);
      assert.equal(actual.headerRow, expected.headerRow);
      assert.equal(actual.records.length, expected.records.length);
      const actualByRow = new Map(actual.records.map((record) => [record.sourceRow, record]));
      for (const record of expected.records) {
        const result = actualByRow.get(record.sourceRow);
        assert.ok(result);
        for (const key of ['awb', 'type', 'recipientName', 'phone', 'address', 'weight', 'sender']) assert.equal(parser.normalizeText(result[key]), parser.normalizeText(record[key]), `${actual.sourceSheetName} row ${record.sourceRow} ${key}`);
        assert.equal(result.description, parser.normalizeText(record.description || record.shipmentType || ''));
        assert.equal(converters.cleanCurrency(result.codAmount).value, Number(record.codAmount || 0));
      }
    }
  }
  validation.validateWorkbook(parsed);
  console.log(JSON.stringify({ sheets: parsed.sheets.length, cod: parsed.cod?.records.length || 0, nonCod: parsed.nonCod?.records.length || 0, outputs: outputCount, records: outputRecords, codTotal, independentAudit: Boolean(audit) }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
