'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../assets/js/workbook-parser.js');
const converters = require('../assets/js/converters.js');
const validation = require('../assets/js/validation.js');
const exporter = require('../assets/js/export.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function fakeXlsx(workbook) {
  return {
    read() { return workbook; },
    utils: {
      sheet_to_json(sheet, options) { return options.raw ? sheet.rawRows : sheet.formattedRows; },
      json_to_sheet(data, options) {
        const ws = { '!ref': `A1:${String.fromCharCode(64 + options.header.length)}${data.length + 1}` };
        options.header.forEach((header, index) => {
          const col = String.fromCharCode(65 + index);
          ws[`${col}1`] = { v: header, t: 's' };
          data.forEach((row, rowIndex) => {
            const value = row[header];
            ws[`${col}${rowIndex + 2}`] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
          });
        });
        return ws;
      },
      book_new() { return { SheetNames: [], Sheets: {} }; },
      book_append_sheet(wb, ws, name) { wb.SheetNames.push(name); wb.Sheets[name] = ws; }
    },
    write(workbook, options) {
      assert.equal(options.bookType, 'xlsx');
      assert.deepEqual(workbook.SheetNames, ['Sheet1']);
      return new Uint8Array([80, 75, 3, 4]).buffer;
    }
  };
}

const headers = [' No.  AWB ', 'PENERIMA', 'Telepon', 'Alamat', 'Isi', 'Berat', 'Nilai COD', 'Pengirim', ''];
const codFormatted = [headers,
  ['001234567890', 'Zara', '081234567890', 'Batam', 'Paket A', '2', 'Rp 25.000', 'Sender A', ''],
  ['', 'No AWB', '0811', 'Batam', 'Paket B', '1', '10.000', 'Sender A', ''],
  ['009876543210', 'Adi', '081298765432', 'Bintan', 'Paket C', '', 'invalid', '', '']
];
const codRaw = [headers,
  ['001234567890', 'Zara', '081234567890', 'Batam', 'Paket A', 2, 'Rp 25.000', 'Sender A', ''],
  ['', 'No AWB', '0811', 'Batam', 'Paket B', 1, '10.000', 'Sender A', ''],
  ['009876543210', 'Adi', '081298765432', 'Bintan', 'Paket C', '', 'invalid', '', '']
];
const nonCodFormatted = [headers,
  ['NC002', 'Zed', '081300000002', 'Tanjungpinang', 'Docs', '1', '', '', ''],
  ['NC001', 'Ana', '081300000001', 'Batam', 'Docs', '1', '', 'SAP OFFICE', '']
];
const nonCodRaw = JSON.parse(JSON.stringify(nonCodFormatted));
const workbook = {
  SheetNames: ['COD', 'NON COD (SPESIAL HANDLING)', 'NOTES'],
  Sheets: {
    COD: { formattedRows: codFormatted, rawRows: codRaw },
    'NON COD (SPESIAL HANDLING)': { formattedRows: nonCodFormatted, rawRows: nonCodRaw },
    NOTES: { formattedRows: [['x']], rawRows: [['x']] }
  }
};
const xlsx = fakeXlsx(workbook);
const parsed = parser.parseWorkbook(new Uint8Array([1, 2, 3]), xlsx);

test('normalizes case, surrounding spaces, and duplicate spaces in headers', () => {
  assert.equal(parser.normalizeHeader('  No.   AWB  '), 'no. awb');
  assert.equal(parsed.cod.records.length, 2);
});

test('detects exact supported sheets and leaves additional sheets informational', () => {
  assert.equal(parsed.supportedSheetCount, 2);
  assert.deepEqual(parsed.additionalSheets, ['NOTES']);
});

test('skips rows without AWB and preserves formatted phone strings', () => {
  assert.equal(parsed.cod.skippedRows.length, 1);
  assert.equal(parsed.cod.records[0].phone, '081234567890');
  assert.equal(parsed.cod.records[0].awb, '001234567890');
});

test('cleans formatted COD values and reports invalid non-empty values', () => {
  assert.deepEqual(converters.cleanCurrency(' Rp 25.000 '), { value: 25000, valid: true, wasEmpty: false });
  assert.deepEqual(converters.cleanCurrency('invalid'), { value: 0, valid: false, wasEmpty: false });
  assert.deepEqual(converters.cleanCurrency(''), { value: 0, valid: true, wasEmpty: true });
});

test('preserves COD constants, schema order, filename, and ascending amount sort', () => {
  const output = converters.convertCod(parsed.cod.records);
  assert.deepEqual(Object.keys(output[0]), converters.COD_COLUMNS);
  assert.deepEqual(output.map((row) => row.harga_barang), [0, 25000]);
  assert.equal(output[0].account_pgm, '0166648410');
  assert.equal(output[0].zip_code_penerima, '29411');
  assert.equal(output[0].zona_penerima, '29400');
  assert.equal(output[0].Jenis_Barang, 'PAKET');
  assert.equal(output[0].COD, 'COD');
  assert.equal(output[0].statusRetur, 0);
  assert.equal(output[0].INS, null);
  assert.equal(output[1].telp_penerima, '081234567890');
  assert.equal(converters.createOutputFilename('cod', new Date(2026, 6, 28)), 'template_cod_sapx_28072026.xlsx');
});

test('preserves Non-COD constants and sorts alphabetically with sequential connote codes', () => {
  const output = converters.convertNonCod(parsed.nonCod.records);
  assert.deepEqual(Object.keys(output[0]), converters.NON_COD_COLUMNS);
  assert.deepEqual(output.map((row) => row.destination_data_customer_name), ['Ana', 'Zed']);
  assert.deepEqual(output.map((row) => row.connote_code), [1, 2]);
  assert.equal(output[0].customer_code, 'WSSAP01294A');
  assert.equal(output[0].origin_data_customer_name, 'SAP OFFICE');
  assert.equal(output[1].origin_data_customer_name, 'ANGGUN');
  assert.equal(output[0].origin_data_customer_phone, '082169602910');
  assert.equal(output[0].origin_data_customer_address, 'SAP BATAM');
  assert.equal(output[0].service_code, 'PKH');
  assert.equal(output[0].connote_sub_service_code, '911231');
  assert.equal(output[0].transaction_payment_type_name, 'INVOICE');
  assert.equal(output[0].instruksi_pengiriman, 'Tolong diantar dengan baik');
  assert.equal(output[0].Jenis_Barang, 'Paket');
  assert.equal(output[0].statusRetur, 'Kembali ke pengirim');
  assert.equal(converters.createOutputFilename('nonCod', new Date(2026, 6, 28)), 'template_noncod_sapx_28072026.xlsx');
});

test('uses default weight only when source weight is empty', () => {
  const output = converters.convertCod(parsed.cod.records);
  assert.equal(output[0].koli_weight, '1');
  assert.equal(output[1].koli_weight, 2);
});

test('validation reports skipped rows and invalid COD without silently dropping records', () => {
  const result = validation.validateWorkbook(parsed);
  assert.equal(result.status, 'warning');
  assert.ok(result.issues.some((entry) => entry.id === 'cod-skipped' && entry.count === 1));
  assert.ok(result.issues.some((entry) => entry.id === 'cod-invalidCod' && entry.count === 1));
  assert.equal(parsed.cod.records.length, 2);
});

test('rejects workbooks with no supported worksheet', () => {
  const noSupported = parser.parseWorkbook(new Uint8Array([1]), fakeXlsx({ SheetNames: ['OTHER'], Sheets: { OTHER: {} } }));
  const result = validation.validateWorkbook(noSupported);
  assert.equal(result.status, 'invalid');
  assert.ok(result.issues.some((entry) => entry.id === 'no-supported-sheet'));
});

test('creates Sheet1, automatic widths, string phone cells, and reusable Blob URL', () => {
  const output = converters.convertCod(parsed.cod.records);
  const file = exporter.createWorkbookFile({
    xlsx,
    data: output,
    columns: converters.COD_COLUMNS,
    filename: 'test.xlsx',
    type: 'cod',
    textColumns: ['telp_penerima', 'instruksi_pengiriman', 'ref_no']
  });
  assert.equal(file.filename, 'test.xlsx');
  assert.equal(file.records, 2);
  assert.ok(file.blob.size > 0);
  assert.match(file.url, /^blob:/);
  assert.ok(file.workbook.Sheets.Sheet1['!cols'].every((column) => column.wch <= 60));
  assert.equal(file.workbook.Sheets.Sheet1.B2.t, 's');
  exporter.revokeFile(file);
});

test('production HTML is fully English and avoids disallowed runtime dependencies', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /xlsx-0\.20\.3/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|unpkg\.com\/lucide|xlsx-latest/);
  assert.doesNotMatch(html, /Tarik|Proses File|Log Aktivitas|Memproses|Selesai/);
});

console.log(`\n${passed} regression tests passed.`);
