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

  // Match complete column names: sender/contact/reference columns in the wide
  // KARDUS report are not interchangeable with recipient fields or the AWB.
  const ALIASES = Object.freeze({
    awb: ['No. AWB', 'No.AWB', 'AWB', 'Nomor AWB', 'AWB Number', 'awb_no', 'ref_no'],
    recipientName: ['Penerima', 'Nama Penerima', 'nama_penerima', 'destination_data_customer_name'],
    recipientPhone: ['Tlp1', 'telp_penerima', 'Telepon Penerima', 'destination_data_customer_phone', 'Telepon'],
    recipientAddress: ['Alamat Penerima', 'alamat_penerima', 'destination_data_customer_address', 'Alamat'],
    description: ['Keterangan Barang', 'Isi', 'koli_description', 'koli_data_koli_description', 'Deskripsi Barang'],
    weight: ['Berat', 'Berat (KG)', 'koli_weight', 'koli_data_koli_weight', 'Weight'],
    codAmount: ['Nilai COD', 'Nominal COD', 'COD Amount', 'harga_barang', 'COD'],
    sender: ['Pengirim', 'Nama Pengirim', 'origin_data_customer_name']
  });
  const COD_INDICATOR_ALIASES = ['Status COD', 'Jenis COD', 'Is COD', 'COD Flag', 'COD'];
  const ITEM_TYPE_ALIASES = ['Jenis Kiriman', 'Jenis Barang'];
  const LOCATION_ALIASES = Object.freeze({
    destinationLabel: ['Tujuan'],
    destinationCity: ['Kota/Kab Tujuan', 'Kota / Kab Tujuan', 'Kota Tujuan'],
    district: ['Kecamatan Penerima', 'Kecamatan Tujuan', 'destination_data_district', 'Kecamatan'],
    kelurahan: ['Kelurahan Penerima', 'Kelurahan Tujuan', 'Kelurahan/Desa', 'Kelurahan', 'Desa']
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

  function canonicalHeader(value) {
    return normalizeHeader(value).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
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
    // The first recognized alias wins, so a blank recipient column never falls
    // through to a generic phone/address column elsewhere in the report.
    for (const alias of aliases) {
      const key = canonicalHeader(alias);
      const indexes = [];
      headerMap.forEach((found, header) => {
        if (canonicalHeader(header) === key) indexes.push(...found);
      });
      if (indexes.length) return [...new Set(indexes)];
    }
    return [];
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
    indexes.codIndicator = findColumnIndexes(headerMap, COD_INDICATOR_ALIASES)
      .filter((index) => !indexes.codAmount.includes(index));
    indexes.itemType = findColumnIndexes(headerMap, ITEM_TYPE_ALIASES);
    Object.entries(LOCATION_ALIASES).forEach(([field, aliases]) => {
      indexes[field] = findColumnIndexes(headerMap, aliases);
    });
    return { headerMap, indexes };
  }

  function rowHasData(formattedRow, rawRow) {
    return [formattedRow, rawRow].some((row) => Array.isArray(row) && row.some(hasMeaningfulValue));
  }

  function columnLetter(index) {
    let letter = '';
    for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
      letter = String.fromCharCode(65 + ((number - 1) % 26)) + letter;
    }
    return letter;
  }

  function sourceColumnOffset(worksheet) {
    const firstCell = /^([A-Z]+)\d+/i.exec(String(worksheet['!ref'] || ''));
    if (!firstCell) return 0;
    return [...firstCell[1].toUpperCase()].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  function columnMetadata(headers, index, offset) {
    if (index === undefined) return null;
    const letter = columnLetter(index + offset);
    const label = normalizeText(headers[index]);
    return { index: index + offset, letter, label, column: `${letter} · ${label}` };
  }

  function createSourceFields(headers, access, formattedRow, rawRow, offset) {
    const fields = {};
    Object.entries(access.indexes).forEach(([field, indexes]) => {
      const index = indexes.find((candidate) => hasMeaningfulValue(formattedRow[candidate]))
        ?? indexes.find((candidate) => hasMeaningfulValue(rawRow[candidate])) ?? indexes[0];
      if (index === undefined) return;
      fields[field] = {
        ...columnMetadata(headers, index, offset),
        originalValue: formattedRow[index] == null ? '' : formattedRow[index],
        rawValue: rawRow[index] == null ? '' : rawRow[index]
      };
    });
    return fields;
  }

  function identifierText(formatted, raw) {
    const text = normalizeText(formatted);
    // Excel's General format can abbreviate an intact numeric phone/AWB.
    // Expand only safe integer cells; ordinary text and padded formats retain
    // their exact display, including leading zeros already present in Excel.
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(text)
      && typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) {
      return String(raw);
    }
    return text;
  }

  function detectHeader(rows, allowIncomplete) {
    let best = null;
    rows.slice(0, 100).forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      const access = createColumnAccess(row);
      const recognized = Object.keys(ALIASES).filter((field) => access.indexes[field].length);
      const recipientFields = ['recipientName', 'recipientPhone', 'recipientAddress']
        .filter((field) => access.indexes[field].length).length;
      const hasAwb = access.indexes.awb.length > 0;
      if (!allowIncomplete && (!hasAwb || recipientFields === 0 || recognized.length < 3)) return;
      const score = recognized.length + (hasAwb ? 10 : 0) + recipientFields;
      if (score > 0 && (!best || score > best.score)) {
        best = { rowIndex, headers: row, access, score };
      }
    });
    return best;
  }

  function parseCodAmount(value) {
    if (!hasMeaningfulValue(value)) return { valid: true, value: 0, wasEmpty: true };
    if (typeof value === 'number') {
      return { valid: Number.isFinite(value), value, wasEmpty: false };
    }
    let text = normalizeText(value).replace(/^rp\.?\s*/i, '').replace(/\s+/g, '');
    // Accept Indonesian and international currency notation without treating
    // arbitrary non-empty text or a negative amount as a zero-value shipment.
    if (/^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text)) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) {
      text = text.replace(/,/g, '');
    } else if (/^[+-]?\d+[.,]\d{1,2}$/.test(text)) {
      text = text.replace(',', '.');
    } else if (!/^[+-]?\d+$/.test(text)) {
      return { valid: false, value: NaN, wasEmpty: false };
    }
    const parsed = Number(text);
    return { valid: Number.isFinite(parsed), value: parsed, wasEmpty: false };
  }

  function explicitCodType(value) {
    const text = canonicalHeader(value);
    if (['cod', 'yes', 'true', 'ya', '1'].includes(text)) return 'cod';
    if (['non cod', 'noncod', 'no cod', 'nocod', 'no', 'false', 'tidak', '0'].includes(text)) return 'nonCod';
    return null;
  }

  function validAwb(value) {
    if (!value || ALIASES.awb.some((alias) => canonicalHeader(value) === canonicalHeader(alias))) return false;
    if (/^(?:grand\s*total|sub\s*total|total|jumlah|catatan|notes?|keterangan)$/i.test(value)) return false;
    return /^[a-z0-9][a-z0-9._\/-]*$/i.test(value);
  }

  function createSubset(sheet, type) {
    const records = sheet.records.filter((record) => record.type === type);
    if (!records.length && sheet.type !== type) return null;
    return {
      type,
      name: sheet.name,
      sourceSheetName: sheet.sourceSheetName,
      headers: sheet.headers,
      headerRow: sheet.headerRow,
      fieldColumns: sheet.fieldColumns,
      records,
      // Source-level skips are reported once, independently of the two outputs.
      skippedRows: [],
      sourceRowCount: records.length,
      missingHeaders: sheet.missingHeaders,
      hasAwbHeader: sheet.hasAwbHeader,
      isEmpty: sheet.isEmpty,
      classificationIssues: sheet.classificationIssues.filter((entry) => records.some((record) => record.sourceRow === entry.sourceRow))
    };
  }

  function parseSheet(xlsx, worksheet, type, sourceSheetName) {
    const formattedRows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1, range: 0, defval: '', raw: false, blankrows: true
    });
    const rawRows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1, range: 0, defval: '', raw: true, blankrows: true
    });
    const fixedType = type === 'cod' || type === 'nonCod' ? type : null;
    const detected = detectHeader(formattedRows, Boolean(fixedType));
    if (!detected && !fixedType) return null;
    const headerIndex = detected ? detected.rowIndex : 0;
    const headers = detected ? detected.headers : (formattedRows[headerIndex] || []);
    const access = detected ? detected.access : createColumnAccess(headers);
    const columnOffset = sourceColumnOffset(worksheet);
    const fieldColumns = {};
    Object.entries(access.indexes).forEach(([field, indexes]) => {
      fieldColumns[field] = columnMetadata(headers, indexes[0], columnOffset);
    });
    const rowCount = Math.max(formattedRows.length, rawRows.length);
    const records = [];
    const skippedRows = [];
    const classificationIssues = [];
    const unclassifiedRecords = [];
    let nonEmptySourceRows = 0;
    const sheetName = sourceSheetName || (fixedType ? SUPPORTED_SHEETS[fixedType] : '');

    for (let rowIndex = headerIndex + 1; rowIndex < rowCount; rowIndex += 1) {
      const formattedRow = formattedRows[rowIndex] || [];
      const rawRow = rawRows[rowIndex] || [];
      if (!rowHasData(formattedRow, rawRow)) continue;
      nonEmptySourceRows += 1;
      const text = (field) => getValueFromIndexes(formattedRow, access.indexes[field], true);
      const raw = (field) => getValueFromIndexes(rawRow, access.indexes[field], false);
      const sourceRow = rowIndex + 1;
      const awb = identifierText(text('awb'), raw('awb'));
      const sourceFields = createSourceFields(headers, access, formattedRow, rawRow, columnOffset);

      if (!validAwb(awb)) {
        const repeatedHeader = awb && ALIASES.awb.some((alias) => canonicalHeader(awb) === canonicalHeader(alias));
        skippedRows.push({
          sourceSheetName: sheetName, sourceRow, awb, recipientName: text('recipientName'), sourceFields,
          reason: !awb ? 'Missing AWB' : repeatedHeader ? 'Repeated header row' : 'Invalid AWB or summary row',
          code: !awb ? 'missing-awb' : repeatedHeader ? 'repeated-header' : 'invalid-awb'
        });
        continue;
      }

      const primaryDescription = text('description');
      const description = primaryDescription || text('itemType');
      const descriptionIndexes = primaryDescription ? access.indexes.description : access.indexes.itemType;
      const record = {
        type: fixedType,
        sourceSheetName: sheetName,
        sourceRow,
        sourceFields,
        awb,
        awbDisplay: text('awb'),
        recipientName: text('recipientName'),
        phone: identifierText(text('recipientPhone'), raw('recipientPhone')),
        phoneDisplay: text('recipientPhone'),
        phoneRawType: typeof raw('recipientPhone'),
        address: text('recipientAddress'),
        description,
        descriptionSource: description ? normalizeText(headers[descriptionIndexes[0]]) : '',
        descriptionFallbackUsed: Boolean(!primaryDescription && description),
        weight: raw('weight'),
        weightDisplay: text('weight'),
        codAmount: raw('codAmount'),
        codAmountRaw: raw('codAmount'),
        codAmountDisplay: text('codAmount'),
        codIndicator: text('codIndicator'),
        sender: text('sender'),
        destinationLabel: text('destinationLabel'),
        destinationCity: text('destinationCity'),
        district: text('district'),
        kelurahan: text('kelurahan'),
        classificationWarnings: []
      };
      const amount = parseCodAmount(record.codAmount);
      const amountType = amount.valid && amount.value >= 0 ? (amount.value > 0 ? 'cod' : 'nonCod') : null;
      const indicatorType = explicitCodType(record.codIndicator);
      const missingCodAmount = !fixedType && indicatorType === 'cod'
        && (amount.wasEmpty || access.indexes.codAmount.length === 0);

      if (!fixedType && (!amountType || missingCodAmount)) {
        const entry = {
          code: missingCodAmount ? 'missing-cod-amount' : 'invalid-cod-amount',
          status: 'invalid', sourceSheetName: sheetName, sourceRow, awb,
          message: missingCodAmount
            ? 'The row is marked COD but its amount is missing; the row cannot be classified safely.'
            : 'COD amount is invalid or negative; the row cannot be classified safely.'
        };
        classificationIssues.push(entry);
        record.classificationWarnings.push(entry);
        unclassifiedRecords.push(record);
        skippedRows.push({ ...entry, recipientName: record.recipientName, sourceFields, reason: entry.message });
        continue;
      }
      record.type = fixedType || amountType;
      // Mixed reports use the amount that was classified above, including
      // decimal currency notation. Keep raw/display values for source review.
      if (!fixedType) record.codAmount = amount.value;
      if ((indicatorType && indicatorType !== amountType) || (fixedType && amountType && fixedType !== amountType && !amount.wasEmpty)) {
        const entry = {
          code: 'cod-type-conflict', status: 'warning', sourceSheetName: sheetName, sourceRow, awb,
          message: fixedType
            ? 'COD amount disagrees with the legacy worksheet type; the worksheet type is preserved.'
            : 'COD indicator disagrees with the COD amount; the amount determines the output type.'
        };
        classificationIssues.push(entry);
        record.classificationWarnings.push(entry);
      }
      records.push(record);
    }

    const missingHeaders = Object.keys(ALIASES)
      .filter((field) => access.indexes[field].length === 0);
    const sheet = {
      type: fixedType || 'mixed',
      name: sheetName,
      sourceSheetName: sheetName,
      headers: headers.map(normalizeText),
      headerRow: headerIndex + 1,
      fieldColumns,
      records,
      skippedRows,
      classificationIssues,
      unclassifiedRecords,
      sourceRowCount: nonEmptySourceRows,
      missingHeaders,
      hasAwbHeader: access.indexes.awb.length > 0,
      isEmpty: nonEmptySourceRows === 0
    };
    sheet.cod = createSubset(sheet, 'cod');
    sheet.nonCod = createSubset(sheet, 'nonCod');
    return sheet;
  }

  function aggregateSheets(sheets, type) {
    const sources = sheets.filter((sheet) => sheet[type]);
    if (!sources.length) return null;
    return {
      type,
      headers: [...new Set(sources.flatMap((sheet) => sheet.headers))],
      headerRow: sources.length === 1 ? sources[0].headerRow : null,
      fieldColumns: sources.length === 1 ? sources[0].fieldColumns : {},
      records: sources.flatMap((sheet) => sheet[type].records),
      // Retain the old aggregate skip metadata for legacy consumers. New UI
      // validation uses each source sheet's skippedRows exactly once.
      skippedRows: sources.flatMap((sheet) => sheet.type === type ? sheet.skippedRows : []),
      sourceRowCount: sources.reduce((sum, sheet) => sum + sheet[type].records.length + (sheet.type === type ? sheet.skippedRows.length : 0), 0),
      missingHeaders: [...new Set(sources.flatMap((sheet) => sheet[type].missingHeaders))],
      hasAwbHeader: sources.every((sheet) => sheet.hasAwbHeader),
      isEmpty: sources.every((sheet) => sheet.isEmpty),
      sourceSheetNames: sources.map((sheet) => sheet.sourceSheetName),
      classificationIssues: sources.flatMap((sheet) => sheet[type].classificationIssues)
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
      type: 'array', cellText: true, cellDates: false, cellFormula: false, dense: false
    });
    if (!workbook || !Array.isArray(workbook.SheetNames)) {
      throw new Error('The workbook could not be read. Verify that it is a valid XLSX or XLS file.');
    }
    const sheets = [];
    const additionalSheets = [];
    workbook.SheetNames.forEach((name) => {
      const worksheet = workbook.Sheets && workbook.Sheets[name];
      const fixedType = Object.keys(SUPPORTED_SHEETS)
        .find((type) => normalizeHeader(name) === normalizeHeader(SUPPORTED_SHEETS[type]));
      const sheet = worksheet ? parseSheet(xlsx, worksheet, fixedType, name) : null;
      if (sheet) sheets.push(sheet);
      else additionalSheets.push(name);
    });
    return {
      workbook,
      sheetNames: [...workbook.SheetNames],
      additionalSheets,
      sheets,
      cod: aggregateSheets(sheets, 'cod'),
      nonCod: aggregateSheets(sheets, 'nonCod'),
      supportedSheetCount: sheets.length
    };
  }

  return {
    SUPPORTED_SHEETS,
    ALIASES,
    normalizeHeader,
    normalizeText,
    buildHeaderMap,
    parseCodAmount,
    parseSheet,
    parseWorkbook
  };
});
