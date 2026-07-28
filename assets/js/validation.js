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
    return digits.length >= 7 && digits.length <= 16;
  }

  function issue(id, status, title, explanation, count, sheetType) {
    return { id, status, title, explanation, count, sheetType };
  }

  function validateSheet(sheet) {
    if (!sheet) return [];
    const label = sheet.type === 'cod' ? 'COD' : 'Non-COD';
    const issues = [];

    if (sheet.isEmpty) {
      issues.push(issue(
        `${sheet.type}-empty`, 'incomplete', `${label} worksheet is empty`,
        'The supported worksheet was detected, but no source data rows were found.', 1, sheet.type
      ));
    }

    if (!sheet.hasAwbHeader) {
      issues.push(issue(
        `${sheet.type}-awb-header`, 'invalid', `${label} AWB column is missing`,
        'Use one of the supported headers: No. AWB, No.AWB, or AWB.', 1, sheet.type
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
        relevantMissingHeaders.length, sheet.type
      ));
    }

    if (sheet.skippedRows.length) {
      issues.push(issue(
        `${sheet.type}-skipped`, 'skipped', `${sheet.skippedRows.length} ${label} row${sheet.skippedRows.length === 1 ? '' : 's'} skipped`,
        'These source rows did not contain a valid AWB, matching the existing conversion rule.',
        sheet.skippedRows.length, sheet.type
      ));
    }

    if (sheet.hasAwbHeader && !sheet.isEmpty && sheet.records.length === 0) {
      issues.push(issue(
        `${sheet.type}-no-valid`, 'invalid', `${label} has no valid AWB records`,
        'The worksheet was found, but every non-empty row was skipped because AWB was empty.', 1, sheet.type
      ));
    }

    const counts = {
      recipientName: 0,
      phone: 0,
      invalidPhone: 0,
      address: 0,
      description: 0,
      weight: 0,
      invalidWeight: 0,
      invalidCod: 0,
      duplicateAwb: 0
    };
    const seenAwb = new Map();

    sheet.records.forEach((record) => {
      if (blank(record.recipientName)) counts.recipientName += 1;
      if (blank(record.phone)) counts.phone += 1;
      else if (!validPhone(record.phone)) counts.invalidPhone += 1;
      if (blank(record.address)) counts.address += 1;
      if (blank(record.description)) counts.description += 1;
      if (blank(record.weight)) counts.weight += 1;
      else if (!validWeight(record.weight)) counts.invalidWeight += 1;

      if (sheet.type === 'cod') {
        const cleaned = converters.cleanCurrency(record.codAmount);
        if (!cleaned.valid) counts.invalidCod += 1;
      }

      const normalizedAwb = String(record.awb || '').trim().toLocaleLowerCase('en-US');
      const current = seenAwb.get(normalizedAwb) || 0;
      seenAwb.set(normalizedAwb, current + 1);
    });
    seenAwb.forEach((count) => {
      if (count > 1) counts.duplicateAwb += count;
    });

    const fieldIssues = [
      ['recipientName', 'warning', 'recipient name', 'The output keeps the field empty; verify the recipient before upload.'],
      ['phone', 'warning', 'recipient phone', 'The output keeps the phone field empty; no number is invented.'],
      ['invalidPhone', 'warning', 'unusual phone value', 'Phone values remain strings, but these values have an unusual digit length.'],
      ['address', 'warning', 'recipient address', 'The output keeps the field empty; verify the destination before upload.'],
      ['description', 'warning', 'item description', 'The output keeps the field empty; verify the shipment content before upload.'],
      ['weight', 'warning', 'weight', 'The documented default weight of 1 is used when this field is empty.'],
      ['invalidWeight', 'warning', 'invalid weight', 'The source value is preserved for compatibility, but it should be corrected before downstream use.'],
      ['invalidCod', 'warning', 'invalid COD value', 'The exported numeric value falls back to 0, matching prior behavior, and is now reported transparently.'],
      ['duplicateAwb', 'warning', 'duplicate AWB', 'Duplicate AWBs are preserved because the existing converter does not remove them.']
    ];

    fieldIssues.forEach(([key, status, name, explanation]) => {
      const count = counts[key];
      if (!count) return;
      issues.push(issue(
        `${sheet.type}-${key}`, status,
        `${count} ${label} record${count === 1 ? '' : 's'} with ${name}`,
        explanation, count, sheet.type
      ));
    });

    return issues;
  }

  function validateWorkbook(parsed) {
    const issues = [];
    if (!parsed || !Array.isArray(parsed.sheetNames)) {
      return {
        status: 'invalid', issues: [issue('workbook-invalid', 'invalid', 'Workbook is invalid', 'The workbook could not be inspected.', 1, null)],
        warningCount: 0, invalidCount: 1, skippedCount: 0
      };
    }

    if (parsed.supportedSheetCount === 0) {
      issues.push(issue(
        'no-supported-sheet', 'invalid', 'No supported worksheet found',
        'We could not find a worksheet named COD or NON COD (SPESIAL HANDLING).', 1, null
      ));
    }

    issues.push(...validateSheet(parsed.cod), ...validateSheet(parsed.nonCod));

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
