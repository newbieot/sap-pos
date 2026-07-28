(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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
    const { xlsx, data, columns, filename, type, textColumns = [] } = options || {};
    if (!xlsx || !xlsx.utils || typeof xlsx.write !== 'function') {
      throw new Error('SheetJS is unavailable. Refresh the page and try again.');
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('There are no valid records to export.');
    }

    const worksheet = xlsx.utils.json_to_sheet(data, { header: columns });
    worksheet['!cols'] = calculateColumnWidths(data, columns);
    if (textColumns.length) enforceTextColumns(worksheet, textColumns, data.length);

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const bytes = xlsx.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);

    return { type, filename, records: data.length, blob, url, workbook };
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
