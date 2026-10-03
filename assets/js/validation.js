(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./converters.js') : root.SAPXConverters
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (converters) {
  'use strict';

  const HEADER_LABELS = Object.freeze({
    awb: 'AWB',
    recipientName: 'recipient name',
    recipientPhone: 'recipient phone',
    recipientAddress: 'recipient address',
    description: 'item description',
    weight: 'weight',
    codAmount: 'COD amount',
    sender: 'sender'
  });
  const EXPECTED_HEADERS = Object.freeze({
    awb: 'No. AWB', recipientName: 'Penerima', recipientPhone: 'Tlp1 / Telepon',
    recipientAddress: 'Alamat Penerima', description: 'Keterangan Barang',
    weight: 'Berat', codAmount: 'Nilai COD', sender: 'Pengirim', codIndicator: 'Status COD'
  });
  const SOURCE_FIELDS = Object.freeze({ phone: 'recipientPhone', address: 'recipientAddress' });

  function blank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function validWeight(value) {
    if (blank(value)) return true;
    const number = typeof value === 'number'
      ? value
      : Number(String(value).replace(',', '.').trim());
    return Number.isFinite(number) && number > 0;
  }

  function validPhone(value) {
    if (blank(value)) return false;
    const digits = String(value).replace(/[^0-9]/g, '');
    return digits.length >= 8 && digits.length <= 16;
  }

  function issue(id, status, title, explanation, count, sheetType, scope, details) {
    return { id, status, title, explanation, count, sheetType, scope: scope || 'record', details: details || [] };
  }

  function sourceFieldName(field) {
    return SOURCE_FIELDS[field] || field;
  }

  function sourceValue(record, field) {
    const metadata = record.sourceFields && record.sourceFields[sourceFieldName(field)];
    let value;
    if (metadata) value = metadata.originalValue;
    else if (field === 'phone') value = record.phoneDisplay ?? record.phone;
    else if (field === 'awb') value = record.awbDisplay ?? record.awb;
    else if (field === 'codAmount') value = record.codAmountDisplay ?? record.codAmountRaw ?? record.codAmount;
    else if (field === 'weight') value = record.weightDisplay ?? record.weight;
    else value = record[field];
    return blank(value) ? '' : value;
  }

  function outputValue(record, field, type) {
    if (field === 'phone') return converters.normalizeOutputPhone(record.phone);
    if (field === 'awb') return converters.sanitizeOutputText(record.awb, { identifier: true });
    if (field === 'weight') {
      if (blank(record.weight)) return type === 'cod' ? converters.COD_CONSTANTS.defaultWeight : converters.NON_COD_CONSTANTS.defaultWeight;
      return typeof record.weight === 'string' ? converters.sanitizeOutputText(record.weight) : record.weight;
    }
    if (field === 'codAmount') return type === 'cod' ? converters.cleanCurrency(record.codAmount).value : converters.NON_COD_CONSTANTS.itemValue;
    if (field === 'sender') return converters.sanitizeOutputText(record.sender || converters.NON_COD_CONSTANTS.fallbackSenderName);
    if (field === 'codIndicator') return type === 'cod' ? 'COD' : 'Non-COD';
    return converters.sanitizeOutputText(record[field]);
  }

  function recordDetail(sheet, record, field, reason, action, result) {
    const key = sourceFieldName(field);
    const column = (record.sourceFields && record.sourceFields[key]) || (sheet.fieldColumns && sheet.fieldColumns[key]);
    return {
      sourceSheetName: record.sourceSheetName || sheet.sourceSheetName || '',
      sourceRow: Number.isInteger(record.sourceRow) ? record.sourceRow : null,
      awb: record.awb || '',
      recipientName: record.recipientName || '',
      field,
      column: column ? column.column : `${EXPECTED_HEADERS[key] || key} (missing column)`,
      originalValue: sourceValue(record, field),
      outputValue: result === undefined ? outputValue(record, field, record.type || sheet.type) : result,
      reason,
      action
    };
  }

  function headerDetail(sheet, field) {
    const expected = EXPECTED_HEADERS[field] || field;
    let fallback = '';
    if (field === 'recipientPhone') fallback = '0';
    if (field === 'weight') fallback = sheet.type === 'cod' ? converters.COD_CONSTANTS.defaultWeight : converters.NON_COD_CONSTANTS.defaultWeight;
    if (field === 'sender') fallback = converters.NON_COD_CONSTANTS.fallbackSenderName;
    if (field === 'codAmount') fallback = 0;
    if (field === 'awb') fallback = 'Not exported';
    const fallbackText = fallback === '' ? 'The output field stays empty.' : `The operational fallback is ${fallback}.`;
    return {
      sourceSheetName: sheet.sourceSheetName || '',
      sourceRow: Number.isInteger(sheet.headerRow) ? sheet.headerRow : null,
      awb: '', recipientName: '', field,
      column: `${expected} (missing header)`, expectedColumnLabel: expected,
      originalValue: '', outputValue: fallback,
      reason: `No recognized ${HEADER_LABELS[field] || field} header was found. ${fallbackText}`,
      action: `Add a recognized ${expected} header on this Excel header row and provide the correct values for shipments.`
    };
  }

  function sheetDetail(sheet, reason, action) {
    return {
      sourceSheetName: sheet.sourceSheetName || '',
      sourceRow: Number.isInteger(sheet.headerRow) ? sheet.headerRow : null,
      awb: '', recipientName: '', field: 'worksheet', column: '',
      originalValue: '', outputValue: 'Not exported', reason, action
    };
  }

  function skippedDetail(sheet, row) {
    const amountIssue = row.code === 'invalid-cod-amount' || row.code === 'missing-cod-amount';
    const field = amountIssue ? 'codAmount' : 'awb';
    const action = amountIssue ? 'Correct the COD amount in the source workbook and inspect the workbook again.'
      : row.code === 'repeated-header' ? 'Remove the repeated header from the shipment data if it is unintended.'
        : 'Provide a valid shipment AWB in the source cell and inspect the workbook again.';
    return recordDetail(sheet, row, field, row.reason || 'The source row is excluded.', action, 'Not exported');
  }

  function workbookDetail(reason, action, originalValue) {
    return {
      sourceSheetName: '', sourceRow: null, awb: '', recipientName: '', field: 'workbook', column: '',
      originalValue: originalValue || '', outputValue: 'Not exported', reason, action
    };
  }

  function validateSheet(sheet) {
    if (!sheet) return [];
    const label = `${sheet.sourceSheetName ? `${sheet.sourceSheetName} · ` : ''}${sheet.type === 'cod' ? 'COD' : 'Non-COD'}`;
    const issues = [];

    if (sheet.isEmpty) {
      issues.push(issue(
        `${sheet.type}-empty`, 'incomplete', `${label} worksheet is empty`,
        'The supported worksheet was detected, but no source data rows were found.', 1, sheet.type,
        'sheet', [sheetDetail(sheet, 'No shipment data rows were found below the header.', 'Add shipment data below the detected header row.')]
      ));
    }

    if (!sheet.hasAwbHeader) {
      issues.push(issue(
        `${sheet.type}-awb-header`, 'invalid', `${label} AWB column is missing`,
        'Use one of the supported headers: No. AWB, No.AWB, AWB, or ref_no.', 1, sheet.type,
        'header', [headerDetail(sheet, 'awb')]
      ));
    }

    const relevantMissingHeaders = sheet.missingHeaders.filter((field) => {
      if (field === 'sender') return sheet.type === 'nonCod';
      if (field === 'codAmount') return sheet.type === 'cod';
      return field !== 'awb';
    });
    if (relevantMissingHeaders.length) {
      issues.push(issue(
        `${sheet.type}-headers`, 'warning', `${label} has unrecognized columns`,
        `Missing recognized header${relevantMissingHeaders.length === 1 ? '' : 's'}: ${relevantMissingHeaders.map((field) => HEADER_LABELS[field]).join(', ')}. Empty output values or documented fallbacks will be used.`,
        relevantMissingHeaders.length, sheet.type,
        'header', relevantMissingHeaders.map((field) => headerDetail(sheet, field))
      ));
    }

    if (sheet.skippedRows.length) {
      issues.push(issue(
        `${sheet.type}-skipped`, 'skipped', `${sheet.skippedRows.length} ${label} row${sheet.skippedRows.length === 1 ? '' : 's'} skipped`,
        'These source rows did not contain a valid AWB, matching the existing conversion rule.',
        sheet.skippedRows.length, sheet.type,
        'record', sheet.skippedRows.map((row) => skippedDetail(sheet, row))
      ));
    }

    if (sheet.hasAwbHeader && !sheet.isEmpty && sheet.records.length === 0) {
      issues.push(issue(
        `${sheet.type}-no-valid`, 'invalid', `${label} has no valid AWB records`,
        'The worksheet was found, but every non-empty row was skipped because AWB was empty.', 1, sheet.type,
        'sheet', sheet.skippedRows.length ? sheet.skippedRows.map((row) => skippedDetail(sheet, row))
          : [sheetDetail(sheet, 'No valid shipment AWBs were found.', 'Check the source AWB header and shipment rows.')]
      ));
    }

    const affected = {
      recipientName: [], phone: [], invalidPhone: [], address: [], description: [],
      weight: [], invalidWeight: [], invalidCod: [], duplicateAwb: []
    };
    const seenAwb = new Map();

    sheet.records.forEach((record) => {
      if (blank(record.recipientName)) affected.recipientName.push(record);
      if (blank(record.phone)) affected.phone.push(record);
      else if (!validPhone(record.phone)) affected.invalidPhone.push(record);
      if (blank(record.address)) affected.address.push(record);
      if (blank(record.description)) affected.description.push(record);
      if (blank(record.weight)) affected.weight.push(record);
      else if (!validWeight(record.weight)) affected.invalidWeight.push(record);

      if (sheet.type === 'cod') {
        const cleaned = converters.cleanCurrency(record.codAmount);
        if (!cleaned.valid) affected.invalidCod.push(record);
      }

      const normalizedAwb = String(record.awb || '').trim().toLocaleLowerCase('en-US');
      const current = seenAwb.get(normalizedAwb) || [];
      current.push(record);
      seenAwb.set(normalizedAwb, current);
    });
    seenAwb.forEach((records) => {
      if (records.length > 1) affected.duplicateAwb.push(...records);
    });

    const fieldIssues = [
      ['recipientName', 'warning', 'recipient name', 'The output keeps the field empty; verify the recipient before upload.'],
      ['phone', 'warning', 'recipient phone', 'Empty recipient phones are exported as text 0.'],
      ['invalidPhone', 'warning', 'unusual phone value', 'Recipient phones shorter than 8 digits are exported as text 0. Longer values remain text; verify values over 16 digits.'],
      ['address', 'warning', 'recipient address', 'The output keeps the field empty; verify the destination before upload.'],
      ['description', 'warning', 'item description', 'The output keeps the field empty; verify the shipment content before upload.'],
      ['weight', 'warning', 'weight', 'The documented default weight of 1 is used when this field is empty.'],
      ['invalidWeight', 'warning', 'invalid weight', 'The source value is preserved for compatibility, but it should be corrected before downstream use.'],
      ['invalidCod', 'warning', 'invalid COD value', 'The exported numeric value falls back to 0, matching prior behavior, and is now reported transparently.'],
      ['duplicateAwb', 'warning', 'duplicate AWB', 'Duplicate AWBs are preserved because the existing converter does not remove them.']
    ];

    fieldIssues.forEach(([key, status, name, explanation]) => {
      const count = affected[key].length;
      if (!count) return;
      const details = affected[key].map((record) => {
        if (key === 'phone') {
          return recordDetail(sheet, record, 'phone', 'The source recipient phone is empty; export writes the text 0.',
            'Enter the correct recipient phone with 8 to 16 digits in this source cell.');
        }
        if (key === 'invalidPhone') {
          const digits = String(record.phone).replace(/[^0-9]/g, '').length;
          const reason = digits < 8
            ? `The source phone contains ${digits} digit${digits === 1 ? '' : 's'}, fewer than 8; export writes the text 0.`
            : `The source phone contains ${digits} digits, more than 16; export preserves the cleaned phone text.`;
          return recordDetail(sheet, record, 'phone', reason,
            'Verify this recipient phone and correct the source cell to the intended 8 to 16 digits.');
        }
        if (key === 'weight') {
          return recordDetail(sheet, record, 'weight', 'The source weight is empty; export uses the documented default weight of 1.',
            'Enter the actual positive shipment weight if the default is not appropriate.');
        }
        if (key === 'invalidWeight') {
          return recordDetail(sheet, record, 'weight', 'The source weight is not a valid positive number; export keeps its existing value after text cleaning.',
            'Correct the source weight to a positive number before using the exported workbook.');
        }
        if (key === 'invalidCod') {
          return recordDetail(sheet, record, 'codAmount', 'The non-empty COD amount cannot be parsed; this legacy COD export uses numeric 0.',
            'Enter the correct COD amount in this source cell and inspect the workbook again.');
        }
        if (key === 'duplicateAwb') {
          const matching = seenAwb.get(String(record.awb || '').trim().toLocaleLowerCase('en-US'));
          const rows = matching.map((entry) => entry.sourceRow).join(', ');
          return recordDetail(sheet, record, 'awb', `This AWB appears on Excel rows ${rows} in this shipment group; all matching rows are retained.`,
            'Compare these source rows and correct or remove an unintended duplicate before upload.');
        }
        const field = key;
        const reasons = {
          recipientName: 'The source recipient name is empty; the exported recipient name stays empty.',
          address: 'The source recipient address is empty; the exported recipient address stays empty.',
          description: 'The item description is empty and no source shipment-kind fallback is available; the exported description stays empty.'
        };
        const actions = {
          recipientName: 'Enter the correct recipient name in this source cell before upload.',
          address: 'Enter the complete recipient address in this source cell before upload.',
          description: 'Enter the shipment contents in this source cell before upload.'
        };
        return recordDetail(sheet, record, field, reasons[key], actions[key]);
      });
      issues.push(issue(
        `${sheet.type}-${key}`, status,
        `${count} ${label} record${count === 1 ? '' : 's'} with ${name}`,
        explanation, count, sheet.type, 'record', details
      ));
    });

    return issues;
  }

  function validateWorkbook(parsed) {
    const issues = [];
    if (!parsed || !Array.isArray(parsed.sheetNames)) {
      return {
        status: 'invalid', issues: [issue('workbook-invalid', 'invalid', 'Workbook is invalid', 'The workbook could not be inspected.', 1, null,
          'workbook', [workbookDetail('The workbook could not be inspected.', 'Select a readable XLSX or XLS source workbook.')])],
        warningCount: 0, invalidCount: 1, skippedCount: 0
      };
    }

    if (parsed.supportedSheetCount === 0) {
      issues.push(issue(
        'no-supported-sheet', 'invalid', 'No supported worksheet found',
        'No worksheet contains recognized AWB and recipient shipment headers.', 1, null,
        'workbook', [workbookDetail('No recognized shipment header was found in the source worksheets.',
          'Provide recognized AWB and recipient shipment headers within the first 100 rows.', parsed.sheetNames.join(', '))]
      ));
    }

    if (Array.isArray(parsed.sheets)) {
      parsed.sheets.forEach((source, sourceIndex) => {
        for (const sheet of [source.cod, source.nonCod]) {
          issues.push(...validateSheet(sheet).map((entry) => ({
            ...entry, id: `sheet-${sourceIndex}-${entry.id}`, sourceSheetName: source.sourceSheetName
          })));
        }
        if (source.skippedRows.length) {
          const reasons = [...new Set(source.skippedRows.map((row) => row.reason))].join('; ');
          issues.push(issue(`sheet-${sourceIndex}-skipped`, 'skipped',
            `${source.sourceSheetName}: ${source.skippedRows.length} source rows excluded`,
            `${reasons}. Exact Excel rows and source values are available in the row details.`, source.skippedRows.length, null,
            'record', source.skippedRows.map((row) => skippedDetail(source, row))));
        }
        const classificationIssues = source.classificationIssues || [];
        classificationIssues.forEach((entry, index) => {
          const record = [...source.records, ...(source.unclassifiedRecords || [])]
            .find((row) => row.sourceRow === entry.sourceRow) || entry;
          const isConflict = entry.code === 'cod-type-conflict';
          const field = isConflict && record.sourceFields && record.sourceFields.codIndicator ? 'codIndicator' : 'codAmount';
          const action = isConflict
            ? 'Verify the shipment type and COD amount, then correct the conflicting source field.'
            : 'Enter the correct COD amount and inspect the source workbook again before exporting this row.';
          const result = isConflict ? undefined : 'Not exported';
          issues.push(issue(`sheet-${sourceIndex}-classification-${index}`, entry.status || 'warning',
            `${source.sourceSheetName}: check COD classification at row ${entry.sourceRow}`,
            entry.message, 1, null,
            'record', [recordDetail(source, record, field, entry.message, action, result)]));
        });
      });
    } else {
      issues.push(...validateSheet(parsed.cod), ...validateSheet(parsed.nonCod));
    }

    const invalidCount = issues.filter((entry) => entry.status === 'invalid').length;
    const warningCount = issues
      .filter((entry) => entry.status === 'warning' || entry.status === 'incomplete')
      .reduce((sum, entry) => sum + entry.count, 0);
    const skippedCount = issues
      .filter((entry) => entry.status === 'skipped')
      .reduce((sum, entry) => sum + entry.count, 0);
    const status = invalidCount > 0 ? 'invalid' : issues.length > 0 ? 'warning' : 'ready';

    return { status, issues, warningCount, invalidCount, skippedCount };
  }

  return { blank, validWeight, validPhone, validateSheet, validateWorkbook };
});
