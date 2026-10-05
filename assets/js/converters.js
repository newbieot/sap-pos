(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXConverters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COD_COLUMNS = Object.freeze([
    'nama_penerima',
    'telp_penerima',
    'alamat_penerima',
    'zip_code_penerima',
    'zona_penerima',
    'koli_description',
    'koli_weight',
    'koli_width',
    'koli_height',
    'koli_length',
    'account_pgm',
    'instruksi_pengiriman',
    'harga_barang',
    'ref_no',
    'Jenis_Barang',
    'COD',
    'statusRetur'
  ]);

  const NON_COD_COLUMNS = Object.freeze([
    'connote_code',
    'customer_code',
    'origin_data_customer_name',
    'origin_data_customer_phone',
    'origin_data_customer_address',
    'origin_data_customer_zip_code',
    'origin_data_zone_code',
    'destination_data_customer_name',
    'destination_data_customer_phone',
    'destination_data_customer_address',
    'destination_data_customer_zip_code',
    'destination_data_zone_code',
    'service_code',
    'connote_sub_service_code',
    'koli_data_koli_description',
    'koli_data_koli_weight',
    'koli_data_koli_width',
    'koli_data_koli_height',
    'koli_data_koli_length',
    'transaction_payment_type_name',
    'instruksi_pengiriman',
    'harga_barang',
    'ref_no',
    'Jenis_Barang',
    'statusRetur'
  ]);

  const COD_CONSTANTS = Object.freeze({
    recipientZipCode: '29411',
    recipientZone: '29400',
    defaultWeight: '1',
    width: 10,
    height: 10,
    length: 10,
    accountPgm: '0166648410',
    itemType: 'PAKET',
    codIndicator: 'COD',
    returnStatus: 0
  });

  const NON_COD_CONSTANTS = Object.freeze({
    customerCode: 'WSSAP01294A',
    fallbackSenderName: 'SAP Batam',
    senderPhone: '082169602910',
    senderAddress: 'SAP BATAM',
    originZipCode: '29411',
    originZoneCode: '29400',
    destinationZipCode: '29411',
    destinationZoneCode: '29400',
    serviceCode: 'PKH',
    subServiceCode: '911231',
    defaultWeight: '1',
    width: 10,
    height: 10,
    length: 10,
    paymentType: 'INVOICE',
    deliveryInstruction: 'Tolong diantar dengan baik',
    itemValue: 0,
    itemType: 'Paket',
    returnStatus: 'Kembali ke pengirim'
  });

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function sanitizeOutputText(value, options) {
    if (value === null || value === undefined) return '';
    const replacement = options && options.identifier ? '' : ' ';
    return String(value)
      .normalize('NFC')
      .replace(/[^\p{L}\p{N} .\-,()]/gu, replacement)
      .replace(/ +/g, ' ')
      .trim();
  }

  function normalizeOutputPhone(value) {
    const source = value === null || value === undefined ? '' : String(value);
    const digitCount = (source.match(/[0-9]/g) || []).length;
    if (digitCount < 8) return '0';
    return sanitizeOutputText(source, { identifier: true });
  }

  function cleanCurrency(value) {
    if (isBlank(value)) return { value: 0, valid: true, wasEmpty: true };
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { value: 0, valid: false, wasEmpty: false };
      return { value: Math.trunc(value), valid: true, wasEmpty: false };
    }

    const normalized = String(value)
      .replace(/Rp/gi, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, '')
      .trim();
    if (!normalized || !/^[+-]?\d+$/.test(normalized)) {
      return { value: 0, valid: false, wasEmpty: false };
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed)
      ? { value: parsed, valid: true, wasEmpty: false }
      : { value: 0, valid: false, wasEmpty: false };
  }

  function sourceWeight(record, fallback) {
    const raw = record ? record.weight : '';
    return isBlank(raw) ? fallback : typeof raw === 'string' ? sanitizeOutputText(raw) : raw;
  }

  function convertCod(records) {
    return records
      .map((record) => {
        const cod = cleanCurrency(record.codAmount);
        const awb = sanitizeOutputText(record.awb, { identifier: true });
        return {
          nama_penerima: sanitizeOutputText(record.recipientName),
          telp_penerima: normalizeOutputPhone(record.phone),
          alamat_penerima: sanitizeOutputText(record.address),
          zip_code_penerima: COD_CONSTANTS.recipientZipCode,
          zona_penerima: COD_CONSTANTS.recipientZone,
          koli_description: sanitizeOutputText(record.description),
          koli_weight: sourceWeight(record, COD_CONSTANTS.defaultWeight),
          koli_width: COD_CONSTANTS.width,
          koli_height: COD_CONSTANTS.height,
          koli_length: COD_CONSTANTS.length,
          account_pgm: COD_CONSTANTS.accountPgm,
          instruksi_pengiriman: awb,
          harga_barang: cod.value,
          ref_no: awb,
          Jenis_Barang: COD_CONSTANTS.itemType,
          COD: COD_CONSTANTS.codIndicator,
          statusRetur: COD_CONSTANTS.returnStatus
        };
      })
      .sort((a, b) => a.harga_barang - b.harga_barang);
  }

  function compareRecipientNames(a, b) {
    return sanitizeOutputText(a.recipientName).localeCompare(sanitizeOutputText(b.recipientName), 'id', {
      sensitivity: 'base',
      numeric: true
    });
  }

  function convertNonCod(records) {
    const sortedRecords = [...records].sort(compareRecipientNames);
    return sortedRecords.map((record, index) => ({
      connote_code: index + 1,
      customer_code: NON_COD_CONSTANTS.customerCode,
      origin_data_customer_name: sanitizeOutputText(record.sender || NON_COD_CONSTANTS.fallbackSenderName),
      origin_data_customer_phone: normalizeOutputPhone(NON_COD_CONSTANTS.senderPhone),
      origin_data_customer_address: NON_COD_CONSTANTS.senderAddress,
      origin_data_customer_zip_code: NON_COD_CONSTANTS.originZipCode,
      origin_data_zone_code: NON_COD_CONSTANTS.originZoneCode,
      destination_data_customer_name: sanitizeOutputText(record.recipientName),
      destination_data_customer_phone: normalizeOutputPhone(record.phone),
      destination_data_customer_address: sanitizeOutputText(record.address),
      destination_data_customer_zip_code: NON_COD_CONSTANTS.destinationZipCode,
      destination_data_zone_code: NON_COD_CONSTANTS.destinationZoneCode,
      service_code: NON_COD_CONSTANTS.serviceCode,
      connote_sub_service_code: NON_COD_CONSTANTS.subServiceCode,
      koli_data_koli_description: sanitizeOutputText(record.description),
      koli_data_koli_weight: sourceWeight(record, NON_COD_CONSTANTS.defaultWeight),
      koli_data_koli_width: NON_COD_CONSTANTS.width,
      koli_data_koli_height: NON_COD_CONSTANTS.height,
      koli_data_koli_length: NON_COD_CONSTANTS.length,
      transaction_payment_type_name: NON_COD_CONSTANTS.paymentType,
      instruksi_pengiriman: NON_COD_CONSTANTS.deliveryInstruction,
      harga_barang: NON_COD_CONSTANTS.itemValue,
      ref_no: sanitizeOutputText(record.awb, { identifier: true }),
      Jenis_Barang: NON_COD_CONSTANTS.itemType,
      statusRetur: NON_COD_CONSTANTS.returnStatus
    }));
  }

  function formatDateDDMMYYYY(date) {
    const current = date instanceof Date ? date : new Date(date || Date.now());
    const day = String(current.getDate()).padStart(2, '0');
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const year = current.getFullYear();
    return `${day}${month}${year}`;
  }

  function createOutputFilename(type, date, sourceSheetName) {
    const stamp = formatDateDDMMYYYY(date);
    const sourceName = isBlank(sourceSheetName)
      ? 'sapx'
      : sanitizeOutputText(sourceSheetName)
        .replace(/[. ]+$/g, '') || 'sheet';
    return type === 'cod'
      ? `template_cod_${sourceName}_${stamp}.xlsx`
      : `template_noncod_${sourceName}_${stamp}.xlsx`;
  }

  return {
    COD_COLUMNS,
    NON_COD_COLUMNS,
    COD_CONSTANTS,
    NON_COD_CONSTANTS,
    sanitizeOutputText,
    normalizeOutputPhone,
    cleanCurrency,
    convertCod,
    convertNonCod,
    formatDateDDMMYYYY,
    createOutputFilename
  };
});
