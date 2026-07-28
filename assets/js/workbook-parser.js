(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUPPORTED_SHEETS = Object.freeze({
    cod: 'COD',
    nonCod: 'NON COD (SPESIAL HANDLING)'
  });

  const ALIASES = Object.freeze({
    awb: ['No. AWB', 'No.AWB', 'AWB'],
    recipientName: ['Penerima'],
    recipientPhone: ['Tlp1', 'Telepon'],
    recipientAddress: ['Alamat Penerima', 'Alamat'],
    description: ['Keterangan Barang', 'Isi'],
    weight: ['Berat'],
    codAmount: ['Nilai COD', 'COD'],
    sender: ['Pengirim']
  });

  function normalizeHeader(value) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('en-US');
  }

  function normalizeText(value) {
    if (value == null) return '';
    return String(value).replace(/\u00a0/g, ' ').trim();
  }

  function hasMeaningfulValue(value) {
    return value !== null && value !== undefined && normalizeText(value) !== '';
  }

  function buildHeaderMap(headers) {
    const map = new Map();
    headers.forEach((header, index) => {
      const normalized = normalizeHeader(header);
      if (!normalized) return;
      const indexes = map.get(normalized) || [];
      indexes.push(index);
      map.set(normalized, indexes);
    });
    return map;
  }

  function findColumnIndexes(headerMap, aliases) {
    const indexes = [];
    aliases.forEach((alias) => {
      const found = headerMap.get(normalizeHeader(alias));
      if (found) indexes.push(...found);
    });
    return [...new Set(indexes)];
  }

  function getValueFromIndexes(row, indexes, formatted) {
    if (!Array.isArray(row)) return '';
    let firstFound = '';
    for (const index of indexes) {
      const value = row[index];
      if (firstFound === '' && value != null) firstFound = value;
      if (hasMeaningfulValue(value)) return formatted ? normalizeText(value) : value;
    }
    return formatted ? normalizeText(firstFound) : firstFound;
  }

  function createColumnAccess(headers) {
    const headerMap = buildHeaderMap(headers);
    const indexes = {};
    Object.entries(ALIASES).forEach(([key, aliases]) => {
      indexes[key] = findColumnIndexes(headerMap, aliases);
    });
    return { headerMap, indexes };
  }

  function rowHasData(formattedRow, rawRow) {
    return [formattedRow, rawRow].some((row) => Array.isArray(row) && row.some(hasMeaningfulValue));
  }

  function parseSheet(xlsx, worksheet, type) {
    const formattedRows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 2,
      defval: '',
      raw: false,
      blankrows: false
    });
    const rawRows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      range: 2,
      defval: '',
      raw: true,
      blankrows: false
    });

    const headers = Array.isArray(formattedRows[0]) ? formattedRows[0] : [];
    const access = createColumnAccess(headers);
    const rowCount = Math.max(formattedRows.length, rawRows.length);
    const records = [];
    const skippedRows = [];
    let nonEmptySourceRows = 0;

    for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
      const formattedRow = formattedRows[rowIndex] || [];
      const rawRow = rawRows[rowIndex] || [];
      if (!rowHasData(formattedRow, rawRow)) continue;
      nonEmptySourceRows += 1;

      const text = (field) => getValueFromIndexes(formattedRow, access.indexes[field], true);
      const raw = (field) => getValueFromIndexes(rawRow, access.indexes[field], false);
      const awb = text('awb');
      const sourceRow = rowIndex + 3;

      if (!awb) {
        skippedRows.push({ sourceRow, reason: 'Missing AWB' });
        continue;
      }

      records.push({
        type,
        sourceRow,
        awb,
        recipientName: text('recipientName'),
        phone: text('recipientPhone'),
        phoneRawType: typeof raw('recipientPhone'),
        address: text('recipientAddress'),
        description: text('description'),
        weight: raw('weight'),
        weightDisplay: text('weight'),
        codAmount: raw('codAmount'),
        codAmountDisplay: text('codAmount'),
        sender: text('sender')
      });
    }

    const missingHeaders = Object.entries(access.indexes)
      .filter(([, indexes]) => indexes.length === 0)
      .map(([field]) => field);

    return {
      type,
      headers: headers.map(normalizeText),
      headerRow: 3,
      records,
      skippedRows,
      sourceRowCount: nonEmptySourceRows,
      missingHeaders,
      hasAwbHeader: access.indexes.awb.length > 0,
      isEmpty: nonEmptySourceRows === 0
    };
  }

  function parseWorkbook(arrayBuffer, xlsxInstance) {
    const xlsx = xlsxInstance || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
    if (!xlsx || typeof xlsx.read !== 'function' || !xlsx.utils) {
      throw new Error('SheetJS is unavailable. Refresh the page and try again.');
    }
    if (!(arrayBuffer instanceof ArrayBuffer) && !ArrayBuffer.isView(arrayBuffer)) {
      throw new TypeError('Workbook data must be an ArrayBuffer.');
    }

    const data = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : arrayBuffer;
    const workbook = xlsx.read(data, {
      type: 'array',
      cellText: true,
      cellDates: false,
      cellFormula: false,
      dense: false
    });

    if (!workbook || !Array.isArray(workbook.SheetNames)) {
      throw new Error('The workbook could not be read. Verify that it is a valid XLSX or XLS file.');
    }

    const codWorksheet = workbook.Sheets && workbook.Sheets[SUPPORTED_SHEETS.cod];
    const nonCodWorksheet = workbook.Sheets && workbook.Sheets[SUPPORTED_SHEETS.nonCod];
    const cod = codWorksheet ? parseSheet(xlsx, codWorksheet, 'cod') : null;
    const nonCod = nonCodWorksheet ? parseSheet(xlsx, nonCodWorksheet, 'nonCod') : null;
    const supportedNames = new Set(Object.values(SUPPORTED_SHEETS));
    const additionalSheets = workbook.SheetNames.filter((name) => !supportedNames.has(name));

    return {
      workbook,
      sheetNames: [...workbook.SheetNames],
      additionalSheets,
      cod,
      nonCod,
      supportedSheetCount: Number(Boolean(cod)) + Number(Boolean(nonCod))
    };
  }

  return {
    SUPPORTED_SHEETS,
    ALIASES,
    normalizeHeader,
    normalizeText,
    buildHeaderMap,
    parseSheet,
    parseWorkbook
  };
});
