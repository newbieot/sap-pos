(function () {
  'use strict';

  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const PREVIEW_LIMIT = 10;
  const state = {
    file: null,
    parsed: null,
    validation: null,
    outputs: [],
    previewType: 'cod',
    showAll: false,
    search: '',
    processing: false,
    eventCount: 0
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    workspace: byId('workspace'), dropZone: byId('dropZone'), fileInput: byId('fileInput'), fileCard: byId('fileCard'),
    fileName: byId('fileName'), fileDetails: byId('fileDetails'), fileModified: byId('fileModified'),
    replaceFileButton: byId('replaceFileButton'), removeFileButton: byId('removeFileButton'), processButton: byId('processButton'),
    libraryNotice: byId('libraryNotice'), workbookEmpty: byId('workbookEmpty'), workbookDetails: byId('workbookDetails'),
    sheetCount: byId('sheetCount'), extraSheetCount: byId('extraSheetCount'), codSheetDetail: byId('codSheetDetail'),
    codSheetBadge: byId('codSheetBadge'), nonCodSheetDetail: byId('nonCodSheetDetail'), nonCodSheetBadge: byId('nonCodSheetBadge'),
    additionalSheets: byId('additionalSheets'), additionalSheetList: byId('additionalSheetList'),
    summaryPanel: byId('summaryPanel'), summaryMessage: byId('summaryMessage'), clearWorkspaceButton: byId('clearWorkspaceButton'),
    metricSheets: byId('metricSheets'), metricCod: byId('metricCod'), metricNonCod: byId('metricNonCod'),
    metricSkipped: byId('metricSkipped'), metricWarnings: byId('metricWarnings'), metricGenerated: byId('metricGenerated'),
    validationBadge: byId('validationBadge'), validationEmpty: byId('validationEmpty'), validationContent: byId('validationContent'),
    validationOverview: byId('validationOverview'), issueList: byId('issueList'),
    previewSearch: byId('previewSearch'), viewAllButton: byId('viewAllButton'), codTab: byId('codTab'), nonCodTab: byId('nonCodTab'),
    codTabCount: byId('codTabCount'), nonCodTabCount: byId('nonCodTabCount'), previewEmpty: byId('previewEmpty'),
    previewTable: byId('previewTable'), previewFooter: byId('previewFooter'), previewCountText: byId('previewCountText'),
    resultsBadge: byId('resultsBadge'), resultsEmpty: byId('resultsEmpty'), generatedFiles: byId('generatedFiles'),
    activityLog: byId('activityLog'), logCount: byId('logCount'), toastRegion: byId('toastRegion'), clearDialog: byId('clearDialog'),
    confirmClearButton: byId('confirmClearButton')
  };

  const icons = {
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4m0 3h.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></svg>'
  };


  function openFilePicker() {
    if (state.processing) return;
    elements.fileInput.value = '';
    elements.fileInput.click();
  }

  function readFileData(file) {
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The browser could not read the selected file.'));
        reader.readAsArrayBuffer(file);
      });
    }
    return Promise.reject(new Error('This browser does not support local workbook reading.'));
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : '';
  }

  function validateFile(file) {
    if (!file) return 'No file was selected.';
    if (!['xlsx', 'xls'].includes(extension(file.name))) return 'Choose a workbook in XLSX or XLS format.';
    if (file.size === 0) return 'The selected workbook is empty.';
    if (file.size > MAX_FILE_SIZE) return 'The workbook exceeds the 50 MB size limit.';
    return '';
  }

  function setBadge(element, label, status) {
    element.textContent = label;
    const styles = { ready: 'success', success: 'success', invalid: 'danger', danger: 'danger', warning: 'warning', neutral: 'neutral', info: 'info' };
    element.className = `status-badge status-badge--${styles[status] || 'neutral'}`;
  }

  function updateSteps(activeStep) {
    document.querySelectorAll('.workflow-step').forEach((item) => {
      const step = Number(item.dataset.step);
      item.classList.toggle('is-active', step === activeStep);
      item.classList.toggle('is-complete', step < activeStep);
    });
  }

  function log(message, type = 'info') {
    state.eventCount += 1;
    const item = document.createElement('li');
    item.className = `log-entry${type === 'info' ? '' : ` is-${type}`}`;
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const icon = document.createElement('span');
    icon.className = 'log-entry-icon';
    icon.innerHTML = icons[type] || icons.info;
    const copy = document.createElement('span');
    copy.className = 'log-entry-copy';
    const messageNode = document.createElement('strong');
    messageNode.textContent = message;
    const timeNode = document.createElement('time');
    timeNode.dateTime = new Date().toISOString();
    timeNode.textContent = time;
    copy.append(messageNode, timeNode);
    item.append(icon, copy);
    elements.activityLog.appendChild(item);
    elements.logCount.textContent = `${state.eventCount} event${state.eventCount === 1 ? '' : 's'}`;
    elements.activityLog.scrollTop = elements.activityLog.scrollHeight;
  }

  function toast(message, type = 'info') {
    const item = document.createElement('div');
    item.className = `toast${type === 'info' ? '' : ` is-${type}`}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.innerHTML = `<span>${icons[type] || icons.info}</span>`;
    const text = document.createElement('p');
    text.textContent = message;
    item.appendChild(text);
    elements.toastRegion.appendChild(item);
    window.setTimeout(() => {
      item.classList.add('is-leaving');
      window.setTimeout(() => item.remove(), 220);
    }, 4500);
  }

  function resetOutputs() {
    state.outputs.forEach((file) => SAPXExport.revokeFile(file));
    state.outputs = [];
    elements.generatedFiles.replaceChildren();
    elements.generatedFiles.hidden = true;
    elements.resultsEmpty.hidden = false;
    setBadge(elements.resultsBadge, 'Not generated', 'neutral');
    elements.metricGenerated.textContent = '0';
  }

  function resetInspection() {
    state.parsed = null;
    state.validation = null;
    elements.workbookEmpty.hidden = false;
    elements.workbookDetails.hidden = true;
    elements.validationEmpty.hidden = false;
    elements.validationContent.hidden = true;
    setBadge(elements.validationBadge, 'Waiting', 'neutral');
    elements.metricSheets.textContent = '0';
    elements.metricCod.textContent = '0';
    elements.metricNonCod.textContent = '0';
    elements.metricSkipped.textContent = '0';
    elements.metricWarnings.textContent = '0';
    elements.summaryMessage.textContent = state.file ? 'Inspecting the selected workbook.' : 'Select a workbook to begin.';
    elements.codTabCount.textContent = '0';
    elements.nonCodTabCount.textContent = '0';
    renderPreview();
  }

  function updateFileCard() {
    const file = state.file;
    elements.fileCard.hidden = !file;
    if (!file) return;
    const ext = extension(file.name).toUpperCase();
    elements.fileName.textContent = file.name;
    elements.fileDetails.textContent = `${formatBytes(file.size)} · ${ext}`;
    elements.fileModified.textContent = file.lastModified
      ? `Last modified ${new Date(file.lastModified).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : 'Modified date unavailable';
  }

  function setProcessing(value) {
    state.processing = value;
    elements.processButton.classList.toggle('is-loading', value);
    elements.processButton.disabled = value || !state.parsed || state.parsed.supportedSheetCount === 0 || !hasValidRecords();
    elements.dropZone.disabled = value;
    elements.removeFileButton.disabled = value;
    elements.replaceFileButton.disabled = value;
  }

  function hasValidRecords() {
    return Boolean((state.parsed?.cod?.records.length || 0) + (state.parsed?.nonCod?.records.length || 0));
  }

  function renderInspection() {
    const parsed = state.parsed;
    if (!parsed) return resetInspection();
    elements.workbookEmpty.hidden = true;
    elements.workbookDetails.hidden = false;
    elements.sheetCount.textContent = String(parsed.sheetNames.length);
    elements.extraSheetCount.textContent = String(parsed.additionalSheets.length);

    const updateSheet = (sheet, detail, badge) => {
      if (!sheet) {
        detail.textContent = 'Not detected';
        setBadge(badge, 'Missing', 'neutral');
        return;
      }
      if (!sheet.hasAwbHeader) {
        detail.textContent = 'Detected · AWB header missing';
        setBadge(badge, 'Invalid', 'invalid');
      } else if (sheet.records.length === 0) {
        detail.textContent = `Detected · ${sheet.skippedRows.length} skipped row${sheet.skippedRows.length === 1 ? '' : 's'}`;
        setBadge(badge, 'Empty', 'warning');
      } else {
        detail.textContent = `Detected · ${sheet.records.length} valid row${sheet.records.length === 1 ? '' : 's'}`;
        setBadge(badge, 'Detected', 'ready');
      }
    };
    updateSheet(parsed.cod, elements.codSheetDetail, elements.codSheetBadge);
    updateSheet(parsed.nonCod, elements.nonCodSheetDetail, elements.nonCodSheetBadge);

    elements.additionalSheetList.replaceChildren();
    parsed.additionalSheets.forEach((sheetName) => {
      const item = document.createElement('li');
      item.textContent = sheetName;
      elements.additionalSheetList.appendChild(item);
    });
    elements.additionalSheets.hidden = parsed.additionalSheets.length === 0;
  }

  function renderValidation() {
    const validation = state.validation;
    if (!validation) return;
    elements.validationEmpty.hidden = true;
    elements.validationContent.hidden = false;
    const badgeMap = { ready: ['Ready', 'ready'], warning: ['Warning', 'warning'], invalid: ['Invalid', 'invalid'] };
    const [label, style] = badgeMap[validation.status];
    setBadge(elements.validationBadge, label, style);

    elements.validationOverview.replaceChildren();
    const overviewIcon = document.createElement('span');
    overviewIcon.className = `validation-overview-icon${validation.status === 'warning' ? ' is-warning' : validation.status === 'invalid' ? ' is-danger' : ''}`;
    overviewIcon.innerHTML = validation.status === 'ready' ? icons.success : validation.status === 'invalid' ? icons.error : icons.warning;
    const overviewCopy = document.createElement('div');
    const overviewTitle = document.createElement('strong');
    const overviewText = document.createElement('span');
    overviewTitle.textContent = validation.status === 'ready'
      ? 'All detected records are ready.'
      : validation.status === 'invalid'
        ? 'The workbook cannot be generated yet.'
        : 'The workbook can be generated with warnings.';
    overviewText.textContent = validation.status === 'ready'
      ? 'No validation warnings were found in the supported worksheets.'
      : `${validation.issues.length} validation item${validation.issues.length === 1 ? '' : 's'} reported. Review the details below.`;
    overviewCopy.append(overviewTitle, overviewText);
    elements.validationOverview.append(overviewIcon, overviewCopy);

    elements.issueList.replaceChildren();
    if (validation.issues.length === 0) {
      const ready = document.createElement('div');
      ready.className = 'issue-item';
      ready.innerHTML = `<span class="issue-item-icon">${icons.success}</span><div><strong>Ready</strong><span>No missing or unusual fields detected.</span></div>`;
      elements.issueList.appendChild(ready);
      return;
    }
    validation.issues.forEach((entry) => {
      const type = entry.status === 'invalid' ? 'error' : entry.status === 'warning' || entry.status === 'incomplete' ? 'warning' : 'info';
      const item = document.createElement('article');
      item.className = 'issue-item';
      const icon = document.createElement('span');
      icon.className = `issue-item-icon${entry.status === 'invalid' ? ' is-danger' : ''}`;
      icon.innerHTML = icons[type];
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const explanation = document.createElement('span');
      explanation.textContent = entry.explanation;
      copy.append(title, explanation);
      const count = document.createElement('span');
      count.className = 'issue-item-count';
      count.textContent = String(entry.count);
      item.append(icon, copy, count);
      elements.issueList.appendChild(item);
    });
  }

  function getPreviewRecords() {
    return state.previewType === 'cod' ? (state.parsed?.cod?.records || []) : (state.parsed?.nonCod?.records || []);
  }

  function renderPreview() {
    const records = getPreviewRecords();
    const query = state.search.trim().toLocaleLowerCase('en-US');
    const filtered = query
      ? records.filter((record) => [record.awb, record.recipientName, record.phone, record.address, record.sender]
          .some((value) => String(value || '').toLocaleLowerCase('en-US').includes(query)))
      : records;
    const shown = state.showAll ? filtered : filtered.slice(0, PREVIEW_LIMIT);

    elements.previewTable.querySelector('thead').replaceChildren();
    elements.previewTable.querySelector('tbody').replaceChildren();
    elements.previewEmpty.hidden = records.length > 0;
    elements.previewTable.hidden = records.length === 0;
    elements.previewFooter.hidden = records.length === 0;
    elements.previewSearch.disabled = records.length === 0;
    elements.viewAllButton.disabled = filtered.length <= PREVIEW_LIMIT;
    elements.viewAllButton.textContent = state.showAll ? 'Show Less' : 'View All';

    if (records.length === 0) return;
    const columns = state.previewType === 'cod'
      ? [
          ['AWB', 'awb'], ['Recipient', 'recipientName'], ['Phone', 'phone'], ['Address', 'address'],
          ['Description', 'description'], ['Weight', 'weightDisplay'], ['COD amount', 'codAmountDisplay']
        ]
      : [
          ['#', 'sequence'], ['AWB', 'awb'], ['Sender', 'sender'], ['Recipient', 'recipientName'],
          ['Phone', 'phone'], ['Address', 'address'], ['Description', 'description'], ['Weight', 'weightDisplay']
        ];
    const headRow = document.createElement('tr');
    columns.forEach(([label]) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headRow.appendChild(th);
    });
    elements.previewTable.querySelector('thead').appendChild(headRow);

    shown.forEach((record, index) => {
      const row = document.createElement('tr');
      columns.forEach(([label, key]) => {
        const td = document.createElement('td');
        td.dataset.label = label;
        let value = key === 'sequence' ? index + 1 : record[key];
        if (key === 'weightDisplay' && !String(value || '').trim()) value = '1 (default)';
        if (key === 'codAmountDisplay') {
          const cleaned = SAPXConverters.cleanCurrency(record.codAmount);
          value = cleaned.valid ? new Intl.NumberFormat('en-US').format(cleaned.value) : `${String(value || '')} · invalid`;
        }
        td.textContent = value == null || value === '' ? '—' : String(value);
        if (key === 'awb') td.classList.add('cell-code');
        row.appendChild(td);
      });
      elements.previewTable.querySelector('tbody').appendChild(row);
    });
    elements.previewCountText.textContent = `Showing ${shown.length} of ${filtered.length} matching record${filtered.length === 1 ? '' : 's'}`;
  }

  function updateMetrics() {
    const cod = state.parsed?.cod?.records.length || 0;
    const nonCod = state.parsed?.nonCod?.records.length || 0;
    const skipped = (state.parsed?.cod?.skippedRows.length || 0) + (state.parsed?.nonCod?.skippedRows.length || 0);
    elements.metricSheets.textContent = String(state.parsed?.supportedSheetCount || 0);
    elements.metricCod.textContent = String(cod);
    elements.metricNonCod.textContent = String(nonCod);
    elements.metricSkipped.textContent = String(skipped);
    elements.metricWarnings.textContent = String(state.validation?.warningCount || 0);
    elements.metricGenerated.textContent = String(state.outputs.length);
    elements.codTabCount.textContent = String(cod);
    elements.nonCodTabCount.textContent = String(nonCod);
    elements.summaryMessage.textContent = `${cod + nonCod} valid shipment record${cod + nonCod === 1 ? '' : 's'} detected across ${state.parsed?.supportedSheetCount || 0} supported worksheet${state.parsed?.supportedSheetCount === 1 ? '' : 's'}.`;
  }

  function switchPreview(type) {
    state.previewType = type;
    state.search = '';
    state.showAll = false;
    elements.previewSearch.value = '';
    const codActive = type === 'cod';
    elements.codTab.classList.toggle('is-active', codActive);
    elements.nonCodTab.classList.toggle('is-active', !codActive);
    elements.codTab.setAttribute('aria-selected', String(codActive));
    elements.nonCodTab.setAttribute('aria-selected', String(!codActive));
    renderPreview();
  }

  function friendlyReadError(error) {
    const message = String(error?.message || '');
    if (/password|encrypted/i.test(message)) return 'This workbook appears to be encrypted. Save an unencrypted copy and try again.';
    if (/out of memory|allocation|memory/i.test(message)) return 'The workbook is too large for available browser memory. Close other tabs or split the workbook.';
    if (/sheetjs/i.test(message)) return message;
    if (/does not support local workbook reading|could not read the selected file/i.test(message)) return message;
    return 'The workbook could not be read. Verify that it is a valid XLSX or XLS file.';
  }

  async function readAndInspect(file) {
    resetOutputs();
    resetInspection();
    updateSteps(2);
    log(`Reading workbook: ${file.name}`);
    try {
      const data = await readFileData(file);
      state.parsed = SAPXParser.parseWorkbook(data, window.XLSX);
      state.validation = SAPXValidation.validateWorkbook(state.parsed);
      renderInspection();
      renderValidation();
      updateMetrics();
      if (state.parsed.cod) log('COD worksheet detected.', 'success');
      if (state.parsed.nonCod) log('Non-COD worksheet detected.', 'success');
      if (state.parsed.additionalSheets.length) log(`${state.parsed.additionalSheets.length} additional worksheet${state.parsed.additionalSheets.length === 1 ? '' : 's'} detected and ignored.`, 'info');
      const skipped = (state.parsed.cod?.skippedRows.length || 0) + (state.parsed.nonCod?.skippedRows.length || 0);
      if (skipped) log(`${skipped} row${skipped === 1 ? '' : 's'} skipped because AWB was empty.`, 'warning');
      if (!state.parsed.supportedSheetCount) {
        log('No supported worksheet was found.', 'error');
        toast('We could not find a worksheet named COD or NON COD (SPESIAL HANDLING).', 'error');
      } else if (!hasValidRecords()) {
        log('No valid AWB records were found.', 'error');
        toast('The supported worksheet does not contain valid AWB records.', 'error');
      } else {
        log(`${(state.parsed.cod?.records.length || 0) + (state.parsed.nonCod?.records.length || 0)} valid record${((state.parsed.cod?.records.length || 0) + (state.parsed.nonCod?.records.length || 0)) === 1 ? '' : 's'} ready for review.`, 'success');
      }
      switchPreview(state.parsed.cod?.records.length ? 'cod' : 'nonCod');
      elements.processButton.disabled = !hasValidRecords();
      updateSteps(3);
    } catch (error) {
      const message = friendlyReadError(error);
      resetInspection();
      log(message, 'error');
      toast(message, 'error');
      updateSteps(1);
    }
  }

  async function selectFile(file) {
    const error = validateFile(file);
    if (error) {
      log(error, 'error');
      toast(error, 'error');
      elements.fileInput.value = '';
      return;
    }
    state.file = file;
    updateFileCard();
    elements.clearWorkspaceButton.disabled = false;
    elements.processButton.disabled = true;
    log(`Workbook selected: ${file.name}`, 'success');
    await readAndInspect(file);
  }

  function renderGeneratedFiles() {
    elements.resultsEmpty.hidden = state.outputs.length > 0;
    elements.generatedFiles.hidden = state.outputs.length === 0;
    elements.generatedFiles.replaceChildren();
    state.outputs.forEach((file) => {
      const card = document.createElement('article');
      card.className = 'generated-file';
      const icon = document.createElement('span');
      icon.className = 'generated-file-icon';
      icon.innerHTML = icons.download;
      const copy = document.createElement('div');
      copy.className = 'generated-file-copy';
      const title = document.createElement('strong');
      title.textContent = file.type === 'cod' ? 'COD Output' : 'Non-COD Output';
      const name = document.createElement('span');
      name.textContent = file.filename;
      const details = document.createElement('small');
      details.textContent = `${file.records} record${file.records === 1 ? '' : 's'} · ${formatBytes(file.blob.size)} · Ready`;
      copy.append(title, name, details);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button--ghost button--compact download-button';
      button.innerHTML = `${icons.download}<span>Download ${file.type === 'cod' ? 'COD' : 'Non-COD'}</span>`;
      button.addEventListener('click', () => {
        try {
          SAPXExport.downloadFile(file);
          log(`${file.filename} downloaded again.`, 'success');
        } catch (error) {
          log('The generated file could not be downloaded.', 'error');
          toast('The generated file could not be downloaded. Generate the workbook again.', 'error');
        }
      });
      card.append(icon, copy, button);
      elements.generatedFiles.appendChild(card);
    });
    setBadge(elements.resultsBadge, `${state.outputs.length} ready`, 'ready');
    elements.metricGenerated.textContent = String(state.outputs.length);
  }

  async function generateOutputs() {
    if (!state.file || !state.parsed || !hasValidRecords() || state.processing) {
      toast('Select a valid workbook before generating output files.', 'error');
      return;
    }
    setProcessing(true);
    resetOutputs();
    updateSteps(4);
    log('Preparing MILE output workbooks…');
    try {
      const outputs = [];
      if (state.parsed.cod?.records.length) {
        log('Preparing COD workbook…');
        const data = SAPXConverters.convertCod(state.parsed.cod.records);
        outputs.push(SAPXExport.createWorkbookFile({
          xlsx: window.XLSX,
          data,
          columns: SAPXConverters.COD_COLUMNS,
          filename: SAPXConverters.createOutputFilename('cod'),
          type: 'cod',
          textColumns: ['telp_penerima', 'instruksi_pengiriman', 'ref_no']
        }));
        log(`${data.length} COD record${data.length === 1 ? '' : 's'} prepared.`, 'success');
      }
      if (state.parsed.nonCod?.records.length) {
        log('Preparing Non-COD workbook…');
        const data = SAPXConverters.convertNonCod(state.parsed.nonCod.records);
        outputs.push(SAPXExport.createWorkbookFile({
          xlsx: window.XLSX,
          data,
          columns: SAPXConverters.NON_COD_COLUMNS,
          filename: SAPXConverters.createOutputFilename('nonCod'),
          type: 'nonCod',
          textColumns: ['origin_data_customer_phone', 'destination_data_customer_phone', 'ref_no']
        }));
        log(`${data.length} Non-COD record${data.length === 1 ? '' : 's'} prepared.`, 'success');
      }
      state.outputs = outputs;
      renderGeneratedFiles();
      outputs.forEach((file, index) => window.setTimeout(() => SAPXExport.downloadFile(file), index * 300));
      const total = (state.parsed.cod?.records.length || 0) + (state.parsed.nonCod?.records.length || 0);
      elements.summaryMessage.textContent = `${outputs.length} output file${outputs.length === 1 ? '' : 's'} generated from ${total} valid shipment record${total === 1 ? '' : 's'}.`;
      log('Conversion completed. Download ready.', 'success');
      toast(`${outputs.length} MILE workbook${outputs.length === 1 ? '' : 's'} generated successfully.`, 'success');
      elements.summaryPanel.focus({ preventScroll: false });
    } catch (error) {
      resetOutputs();
      log('Workbook export failed. Verify that SheetJS loaded correctly and try again.', 'error');
      toast('The output workbook could not be created. Refresh the page and try again.', 'error');
      updateSteps(3);
    } finally {
      setProcessing(false);
    }
  }

  function clearWorkspace(force = false) {
    if (!force && state.file && typeof elements.clearDialog.showModal === 'function') {
      elements.clearDialog.showModal();
      return;
    }
    resetOutputs();
    state.file = null;
    state.previewType = 'cod';
    state.search = '';
    state.showAll = false;
    elements.fileInput.value = '';
    updateFileCard();
    resetInspection();
    elements.clearWorkspaceButton.disabled = true;
    elements.processButton.disabled = true;
    elements.activityLog.replaceChildren();
    state.eventCount = 0;
    elements.logCount.textContent = '0 events';
    updateSteps(1);
    elements.dropZone.focus();
  }

  function bindEvents() {
    elements.dropZone.addEventListener('click', openFilePicker);
    elements.replaceFileButton.addEventListener('click', openFilePicker);
    elements.fileInput.addEventListener('change', (event) => selectFile(event.target.files[0]));
    elements.removeFileButton.addEventListener('click', () => clearWorkspace(true));
    elements.processButton.addEventListener('click', generateOutputs);
    elements.clearWorkspaceButton.addEventListener('click', () => clearWorkspace(false));
    elements.confirmClearButton.addEventListener('click', () => window.setTimeout(() => clearWorkspace(true), 0));

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((name) => {
      elements.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, () => elements.dropZone.classList.add('is-dragging')));
    ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, () => elements.dropZone.classList.remove('is-dragging')));
    elements.dropZone.addEventListener('drop', (event) => selectFile(event.dataTransfer.files[0]));

    elements.codTab.addEventListener('click', () => switchPreview('cod'));
    elements.nonCodTab.addEventListener('click', () => switchPreview('nonCod'));
    [elements.codTab, elements.nonCodTab].forEach((tab) => {
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'ArrowLeft' || event.key === 'Home' ? elements.codTab : elements.nonCodTab;
        switchPreview(target === elements.codTab ? 'cod' : 'nonCod');
        target.focus();
      });
    });
    elements.previewSearch.addEventListener('input', (event) => {
      state.search = event.target.value;
      state.showAll = false;
      renderPreview();
    });
    elements.viewAllButton.addEventListener('click', () => {
      state.showAll = !state.showAll;
      renderPreview();
    });
    window.addEventListener('beforeunload', () => state.outputs.forEach((file) => SAPXExport.revokeFile(file)));
  }

  function init() {
    bindEvents();
    const dependenciesReady = Boolean(window.XLSX && window.SAPXParser && window.SAPXConverters && window.SAPXValidation && window.SAPXExport);
    elements.libraryNotice.hidden = dependenciesReady;
    elements.processButton.disabled = true;
    if (!dependenciesReady) {
      elements.dropZone.disabled = true;
      log('The spreadsheet engine did not load.', 'error');
    } else {
      log('Converter ready. Workbook data will be processed locally.', 'success');
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
