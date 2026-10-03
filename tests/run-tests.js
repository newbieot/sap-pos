'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../assets/js/workbook-parser.js');
const converters = require('../assets/js/converters.js');
const validation = require('../assets/js/validation.js');
const exporter = require('../assets/js/export.js');
const delivery = require('../assets/js/delivery-summary.js');

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
      sheet_to_json(sheet, options) { return (options.raw ? sheet.rawRows : sheet.formattedRows) || []; },
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
  assert.ok(!Object.hasOwn(output[0], 'INS'));
  assert.ok(!converters.COD_COLUMNS.includes('INS'));
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
  assert.ok(!Object.hasOwn(output[0], 'INS'));
  assert.ok(!converters.NON_COD_COLUMNS.includes('INS'));
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
  assert.ok(result.issues.some((entry) => /skipped$/.test(entry.id) && entry.count === 1));
  assert.ok(result.issues.some((entry) => /cod-invalidCod$/.test(entry.id) && entry.count === 1));
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

test('cleans output text while preserving allowed punctuation and numeric values', () => {
  assert.equal(converters.sanitizeOutputText('Jl. A/B: #4 & (C), D-E!'), 'Jl. A B 4 (C), D-E');
  const output = converters.convertCod([{ awb: 'ID_001/AB', recipientName: 'Nama & Nama', phone: '+6281234567890', address: 'A\nB', description: 'Paket #1', weight: 2, codAmount: 3000 }])[0];
  assert.equal(output.ref_no, 'ID001AB');
  assert.equal(output.instruksi_pengiriman, 'ID001AB');
  assert.equal(output.telp_penerima, '6281234567890');
  assert.equal(output.alamat_penerima, 'A B');
  assert.equal(output.koli_weight, 2);
  assert.equal(output.harga_barang, 3000);
});

test('exports empty and short phones as text zero and preserves leading zeroes', () => {
  for (const value of ['', null, 0, '1234567', '(0778) 12']) assert.equal(converters.normalizeOutputPhone(value), '0');
  assert.equal(converters.normalizeOutputPhone('08123456789'), '08123456789');
  assert.equal(converters.normalizeOutputPhone('(0778) 431331'), '(0778) 431331');
  assert.equal(converters.createOutputFilename('cod', new Date(2026, 9, 3), 'karung A'), 'template_cod_karung A_03102026.xlsx');
});

test('detects mixed sheets and retains true Excel row numbers across blanks', () => {
  const rows = [['Vendor export'], [], headers,
    ['A001', 'Recipient A', '081234567890', 'Address', 'Item', 1, 'Rp 1.500,00', 'Sender'],
    [], ['A002', 'Recipient B', '', 'Address', 'Item', 1, 0, 'Sender'],
    headers, ['TOTAL', '', '', '', '', '', 1500],
    ['A003', 'Recipient C', '', 'Address', 'Item', 1, 'invalid']];
  const result = parser.parseWorkbook(new Uint8Array([1]), fakeXlsx({ SheetNames: ['karung A'], Sheets: { 'karung A': { formattedRows: rows, rawRows: rows } } }));
  assert.equal(result.sheets[0].headerRow, 3);
  assert.deepEqual(result.sheets[0].records.map((record) => record.sourceRow), [4, 6]);
  assert.equal(result.cod.records[0].codAmount, 1500);
  assert.equal(converters.convertCod(result.cod.records)[0].harga_barang, 1500);
  assert.equal(result.nonCod.records.length, 1);
  assert.equal(result.sheets[0].skippedRows.length, 3);
  assert.equal(validation.validateWorkbook(result).skippedCount, 3);
});

test('KARDUS reads recipient columns and AWB instead of unrelated sender or reference fields', () => {
  const columns = ['No. Referensi', 'No. AWB', 'Kontak', 'Telepon', 'Alamat', 'Penerima', 'Tlp1', 'Alamat Penerima', 'Nilai COD', 'Berat', 'Keterangan Barang', 'Jenis Kiriman', 'Tipe Transaksi'];
  const rows = [columns, ['DIFFERENT_REF', 'CGK001', 'Sender contact', '081111111111', 'Sender address', 'Recipient', '', 'Recipient address', 0, 2, '', 'DOKUMEN', 'CASH']];
  const result = parser.parseWorkbook(new Uint8Array([1]), fakeXlsx({ SheetNames: ['KARDUS'], Sheets: { KARDUS: { formattedRows: rows, rawRows: rows } } }));
  const record = result.nonCod.records[0];
  assert.equal(record.awb, 'CGK001');
  assert.equal(record.phone, '');
  assert.equal(record.address, 'Recipient address');
  assert.equal(record.description, 'DOKUMEN');
  assert.equal(converters.convertNonCod([record])[0].ref_no, 'CGK001');
  assert.equal(converters.convertNonCod([record])[0].destination_data_customer_phone, '0');
  assert.equal(result.cod, null);
});

test('recovers full raw digits from scientific notation and quarantines COD without amounts', () => {
  const columns = ['AWB', 'Penerima', 'Telepon', 'Alamat', 'Status COD'];
  const formatted = [columns, ['NUM001', 'Recipient', '6.28177E+12', 'Address', 'NON COD'], ['BAD001', 'Recipient', '', 'Address', 'COD']];
  const raw = [columns, ['NUM001', 'Recipient', 6281770007229, 'Address', 'NON COD'], ['BAD001', 'Recipient', '', 'Address', 'COD']];
  const result = parser.parseWorkbook(new Uint8Array([1]), fakeXlsx({ SheetNames: ['Vendor'], Sheets: { Vendor: { formattedRows: formatted, rawRows: raw } } }));
  assert.equal(result.nonCod.records[0].phone, '6281770007229');
  assert.equal(result.sheets[0].records.length, 1);
  assert.equal(result.sheets[0].classificationIssues[0].code, 'missing-cod-amount');
});

test('area hierarchy totals reconcile and ambiguous addresses remain unknown', () => {
  const records = [
    { awb: 'A1', type: 'cod', sourceSheetName: 'A', address: 'Kelurahan Kabil, Kecamatan Nongsa, Kota Batam' },
    { awb: 'A2', type: 'nonCod', sourceSheetName: 'A', address: 'Kel. Kabil, Kec. Nongsa, Batam' },
    { awb: 'A3', type: 'nonCod', sourceSheetName: 'B', address: 'Alamat tanpa wilayah' },
    { awb: 'A4', type: 'nonCod', sourceSheetName: 'B', address: 'Nongsa / Sekupang' }
  ];
  const result = delivery.summarize(records);
  assert.equal(result.total, 4);
  assert.equal(result.cod, 1);
  assert.equal(result.nonCod, 3);
  assert.equal(result.unknownDistrict, 2);
  assert.equal(result.topDistrict.name, 'Nongsa');
  assert.equal(result.topDistrict.kelurahan[0].name, 'Kabil');
  assert.equal(result.districts.reduce((sum, group) => sum + group.count, 0), 4);
  result.districts.forEach((group) => assert.equal(group.kelurahan.reduce((sum, child) => sum + child.count, 0), group.count));
});

test('area matching respects address boundaries and flags unreliable source destination labels', () => {
  const comma = delivery.classifyRecord({ address: 'Jl. Mawar, Lubuk Baja, Kota Batam' });
  assert.equal(comma.district, 'Lubuk Baja');
  assert.equal(comma.kelurahan, null);
  const conflict = delivery.classifyRecord({ address: 'Kabil, Nongsa Kota Batam', destinationLabel: 'BELAKANG PADANG', destinationCity: 'BATAM' });
  assert.equal(conflict.district, 'Nongsa');
  assert.equal(conflict.kelurahan, 'Kabil');
  assert.ok(conflict.conflicts.length > 0);
  const noAddress = delivery.classifyRecord({ address: 'Alamat tanpa wilayah', destinationLabel: 'BELAKANG PADANG', destinationCity: 'BATAM' });
  assert.equal(noAddress.district, null);
  const external = delivery.classifyRecord({ address: 'Batu Ampar', destinationCity: 'JAKARTA' });
  assert.equal(external.district, null);
  const road = delivery.classifyRecord({ address: 'Jl. Raya Sungai Panas No.2, Kota Batam' });
  assert.equal(road.district, null);
  assert.equal(road.kelurahan, null);
  const sourceConflict = delivery.classifyRecord({ kelurahan: 'Mangsang', address: 'Kelurahan Tembesi' });
  assert.ok(sourceConflict.conflicts.length > 0);
});

console.log(`\n${passed} regression tests passed.`);
