(function (root, factory) {
  const converters = typeof module === 'object' && module.exports
    ? require('./converters.js')
    : root.SAPXConverters;
  const api = factory(converters);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (converters) {
  'use strict';

  const PHONE_COLUMNS = new Set([
    'telp_penerima',
    'origin_data_customer_phone',
    'destination_data_customer_phone'
  ]);

  function sanitizeExportValue(column, value, isCod) {
    if (PHONE_COLUMNS.has(column)) return converters.normalizeOutputPhone(value);
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return value;
    const identifier = column === 'ref_no' || (isCod && column === 'instruksi_pengiriman');
    return converters.sanitizeOutputText(value, { identifier });
  }

  function calculateColumnWidths(data, columns) {
    return columns.map((key) => {
      let maxLength = String(key).length;
      data.slice(0, 50).forEach((row) => {
        const value = row[key] == null ? '' : String(row[key]);
        maxLength = Math.max(maxLength, value.length);
      });
      return { wch: Math.min(maxLength + 2, 60) };
    });
  }

  function enforceTextColumns(worksheet, columns, rowCount) {
    columns.forEach((columnName) => {
      const headerCell = Object.keys(worksheet).find((cellRef) => worksheet[cellRef] && worksheet[cellRef].v === columnName);
      if (!headerCell) return;
      const columnLetters = headerCell.replace(/[0-9]/g, '');
      for (let row = 2; row <= rowCount + 1; row += 1) {
        const ref = `${columnLetters}${row}`;
        if (!worksheet[ref]) continue;
        worksheet[ref].t = 's';
        worksheet[ref].v = String(worksheet[ref].v == null ? '' : worksheet[ref].v);
        worksheet[ref].z = '@';
      }
    });
  }

  function createWorkbookFile(options) {
    const { xlsx, data, columns, filename, type, sourceSheetName, sheetName, textColumns = [] } = options || {};
    if (!xlsx || !xlsx.utils || typeof xlsx.write !== 'function') {
      throw new Error('SheetJS is unavailable. Refresh the page and try again.');
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('There are no valid records to export.');
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new Error('The export column format is unavailable.');
    }

    const exportColumns = columns.filter((column) => String(column).trim().toUpperCase() !== 'INS');
    if (exportColumns.length === 0) {
      throw new Error('The export column format is unavailable.');
    }
    // SheetJS appends object keys outside its header list, so project rows first.
    const isCod = type === 'cod' || exportColumns.includes('COD');
    const exportData = data.map((row) => Object.fromEntries(
      exportColumns.map((column) => [column, sanitizeExportValue(column, row[column], isCod)])
    ));

    const worksheet = xlsx.utils.json_to_sheet(exportData, { header: exportColumns });
    worksheet['!cols'] = calculateColumnWidths(exportData, exportColumns);
    if (textColumns.length) enforceTextColumns(worksheet, textColumns, data.length);

    const workbook = xlsx.utils.book_new();
    const outputSheetName = converters.sanitizeOutputText(sheetName || sourceSheetName || 'Sheet1')
      .slice(0, 31)
      .trim() || 'Sheet1';
    xlsx.utils.book_append_sheet(workbook, worksheet, outputSheetName);
    const bytes = xlsx.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);

    return {
      type,
      filename,
      sourceSheetName: sourceSheetName == null ? '' : String(sourceSheetName),
      sheetName: outputSheetName,
      records: data.length,
      blob,
      url,
      workbook
    };
  }

  function downloadFile(file) {
    if (!file || !file.url || !file.filename) throw new Error('The generated file is unavailable.');
    const anchor = document.createElement('a');
    anchor.href = file.url;
    anchor.download = file.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function revokeFile(file) {
    if (file && file.url) URL.revokeObjectURL(file.url);
  }

  return { calculateColumnWidths, createWorkbookFile, downloadFile, revokeFile };
});
