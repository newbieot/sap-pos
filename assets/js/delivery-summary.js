(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SAPXDeliverySummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Pemerintah Kota Batam, Kompilasi Statistik Sektoral 2025, Tabel 2.2,
  // printed pages 20–22 (PDF pages 46–48). All 12 kecamatan / 64 kelurahan.
  const SOURCES = Object.freeze([
    Object.freeze({
      title: 'Kompilasi Statistik Sektoral Pemerintah Kota Batam 2025',
      url: 'https://satudata.batam.go.id/web/wp-content/uploads/2025/07/Kompilasi-Statistik-Sektoral-Tahun-2025.pdf',
      table: 'Tabel 2.2, halaman 20–22',
      verifiedOn: '2026-10-03'
    })
  ]);

  const DISTRICTS = Object.freeze({
    'Nongsa': ['Batu Besar', 'Kabil', 'Ngenang', 'Sambau'],
    'Batam Kota': ['Baloi Permai', 'Belian', 'Sukajadi', 'Sungai Panas', 'Taman Baloi', 'Teluk Tering'],
    'Bengkong': ['Bengkong Indah', 'Bengkong Laut', 'Sadai', 'Tanjung Buntung'],
    'Batu Ampar': ['Batu Merah', 'Kampung Seraya', 'Sungai Jodoh', 'Tanjung Sengkuang'],
    'Lubuk Baja': ['Baloi Indah', 'Batu Selicin', 'Kampung Pelita', 'Lubuk Baja Kota', 'Tanjung Uma'],
    'Sekupang': ['Patam Lestari', 'Sungai Harapan', 'Tanjung Pinggir', 'Tanjung Riau', 'Tiban Baru', 'Tiban Indah', 'Tiban Lama'],
    'Belakang Padang': ['Kasu', 'Pecong', 'Pemping', 'Pulau Terong', 'Sekanak Raya', 'Tanjung Sari'],
    'Batu Aji': ['Bukit Tempayan', 'Buliang', 'Kibing', 'Tanjung Uncang'],
    'Sagulung': ['Sagulung Kota', 'Sungai Binti', 'Sungai Langkai', 'Sungai Lekop', 'Sungai Pelunggut', 'Tembesi'],
    'Sungai Beduk': ['Duriangkang', 'Mangsang', 'Muka Kuning', 'Tanjung Piayu'],
    'Galang': ['Air Raja', 'Galang Baru', 'Karas', 'Pulau Abang', 'Rempang Cate', 'Sembulang', 'Sijantung', 'Subang Mas'],
    'Bulang': ['Batu Legong', 'Bulang Lintang', 'Pantai Gelam', 'Pulau Buluh', 'Pulau Setokok', 'Temoyong']
  });
  Object.values(DISTRICTS).forEach(Object.freeze);

  const UNKNOWN = 'Belum teridentifikasi';

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKC')
      .toLocaleUpperCase('id-ID').replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function titleCase(value) {
    return normalize(value).toLocaleLowerCase('id-ID').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('id-ID'));
  }

  function normalizeAddress(value) {
    return String(value == null ? '' : value).normalize('NFKC').toLocaleUpperCase('id-ID')
      .replace(/\b(SEI|TJ|KEC|KEL)\./g, '$1 ')
      .replace(/[^A-Z0-9\s]+/g, ' | ').replace(/\s+/g, ' ').trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function aliases(name, kind) {
    const values = [name];
    if (name.startsWith('Sungai ')) values.push(name.replace('Sungai ', 'Sei '));
    if (name.startsWith('Tanjung ')) values.push(name.replace('Tanjung ', 'Tj '));
    if (kind === 'district' && name.includes(' ')) values.push(name.replace(/ /g, ''));
    if (name === 'Sungai Beduk') values.push('Sei Sungai Beduk', 'Seisungai Beduk', 'Sei Beduk', 'Seibeduk');
    if (kind === 'kelurahan' && name === 'Pulau Setokok') values.push('Setokok');
    return unique(values.map(normalize));
  }

  const districtEntries = Object.keys(DISTRICTS).map((name) => ({ name, aliases: aliases(name, 'district') }));
  const kelurahanEntries = Object.entries(DISTRICTS).flatMap(([district, names]) => names.map((name) => ({
    name, district, aliases: aliases(name, 'kelurahan')
  })));
  const districtLookup = new Map(districtEntries.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.name])));
  const kelurahanLookup = new Map(kelurahanEntries.flatMap((entry) => entry.aliases.map((alias) => [alias, entry])));

  function canonicalDistrict(value) {
    return districtLookup.get(normalize(value).replace(/^(?:KECAMATAN|KEC) /, '')) || '';
  }

  function canonicalKelurahan(value) {
    return kelurahanLookup.get(normalize(value).replace(/^(?:KELURAHAN|KEL|DESA) /, '')) || null;
  }

  function matches(text, entries) {
    const hits = [];
    entries.forEach((entry) => {
      entry.aliases.forEach((alias) => {
        const pattern = new RegExp(`(?:^|[ |])(${alias})(?=[ |]|$)`, 'g');
        let match;
        while ((match = pattern.exec(text))) {
          const start = match.index + (/^[ |]/.test(match[0]) ? 1 : 0);
          const prefix = text.slice(Math.max(0, start - 32), start);
          // A road or business named after an area is not evidence of its location.
          if (/(?:^|[ |])(?:JL|JLN|JALAN|TOKO|MASJID|GEREJA|PT|CV|BANK)[ |]+$/.test(prefix)) continue;
          if (/(?:^|[ |])(?:JL|JLN|JALAN)[ |]+(?:RAYA|UTAMA|BESAR|KECIL|BARU|LAMA)[ |]+$/.test(prefix)) continue;
          if (entry.district && /(?:^|[ |])(?:KEC|KECAMATAN)[ |]*$/.test(prefix)) continue;
          // Without a kelurahan label, "Lubuk Baja Kota Batam" can mean
          // kecamatan Lubuk Baja followed by the city, not Lubuk Baja Kota.
          if (entry.district && alias.endsWith(' KOTA') && /^[ |]+BATAM(?:[ |]|$)/.test(text.slice(start + alias.length))) continue;
          hits.push({ ...entry, alias, start, end: start + alias.length });
        }
      });
    });
    // Lubuk Baja inside the full kelurahan name Lubuk Baja Kota is not a second district mention.
    return hits.filter((hit) => !hits.some((other) => other.name !== hit.name && other.start <= hit.start && other.end > hit.end));
  }

  function labeledMatches(text, entries, kind) {
    const marker = kind === 'district' ? '(?:KECAMATAN|KEC)' : '(?:KELURAHAN|KEL|DESA)';
    const hits = [];
    entries.forEach((entry) => entry.aliases.forEach((alias) => {
      const pattern = new RegExp(`(?:^|[ |])${marker}[ |]*(?:DESA[ |]+)?(${alias})(?=[ |]|$)`, 'g');
      if (pattern.test(text)) hits.push(entry);
    }));
    return unique(hits.map((entry) => entry.name)).map((name) => hits.find((entry) => entry.name === name));
  }

  function firstValue(record, fields) {
    for (const field of fields) {
      const value = record[field];
      if (value != null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function classifyRecord(record) {
    const row = record || {};
    const address = normalizeAddress(row.address || row.recipientAddress);
    const rawDistrict = firstValue(row, ['district', 'kecamatan', 'destinationDistrict']);
    const rawKelurahan = firstValue(row, ['kelurahan', 'subdistrict', 'destinationSubdistrict']);
    const destinationLabel = firstValue(row, ['destinationLabel']);
    const destinationCity = firstValue(row, ['destinationCity']);
    const normalizedCity = normalize(destinationCity).replace(/^(?:KOTA|KABUPATEN|KAB) /, '');
    const outsideBatam = Boolean(normalizedCity && normalizedCity !== 'BATAM');
    const fieldDistrict = canonicalDistrict(rawDistrict);
    const fieldKelurahan = canonicalKelurahan(rawKelurahan);
    const labelDistricts = labeledMatches(address, districtEntries, 'district');
    const labelKelurahan = labeledMatches(address, kelurahanEntries, 'kelurahan');
    const conflicts = [];
    let district = '';
    let kelurahan = '';
    let districtSource = '';
    let kelurahanSource = '';
    let inferred = false;
    let ambiguous = false;
    let reason = '';

    if (rawDistrict && normalize(rawDistrict) !== 'BATAM') {
      district = fieldDistrict || titleCase(rawDistrict.replace(/^(?:kecamatan|kec\.?)[\s:]+/i, ''));
      districtSource = 'source_field';
    } else if (labelDistricts.length === 1) {
      district = labelDistricts[0].name;
      districtSource = 'address_label';
    } else if (labelDistricts.length > 1) {
      ambiguous = true;
      reason = 'Alamat menyebut lebih dari satu kecamatan.';
    }

    if (district && labelDistricts.some((entry) => entry.name !== district)) {
      conflicts.push('Kolom kecamatan berbeda dengan kecamatan berlabel di alamat.');
    }

    let selectedKelurahan = fieldKelurahan;
    let selectedKelurahanSource = fieldKelurahan ? 'source_field' : '';
    if (fieldKelurahan && labelKelurahan.some((entry) => entry.name !== fieldKelurahan.name)) {
      conflicts.push('Kolom kelurahan berbeda dengan kelurahan berlabel di alamat.');
    }
    if (!selectedKelurahan && labelKelurahan.length === 1) {
      selectedKelurahan = labelKelurahan[0];
      selectedKelurahanSource = 'address_label';
    } else if (!selectedKelurahan && labelKelurahan.length > 1) {
      ambiguous = true;
      reason = 'Alamat menyebut lebih dari satu kelurahan.';
    }

    if (selectedKelurahan) {
      if (!district && !ambiguous) {
        district = selectedKelurahan.district;
        districtSource = `${selectedKelurahanSource}_hierarchy`;
      }
      if (district === selectedKelurahan.district) {
        kelurahan = selectedKelurahan.name;
        kelurahanSource = selectedKelurahanSource;
      } else if (district) {
        conflicts.push('Kelurahan berlabel tidak termasuk kecamatan yang disebut di sumber.');
      }
    } else if (rawKelurahan && district && !fieldDistrict) {
      // Explicit fields may name administrative areas outside the Batam dictionary.
      kelurahan = titleCase(rawKelurahan);
      kelurahanSource = 'source_field';
    }

    if (!outsideBatam) {
      const bareDistricts = unique(matches(address, districtEntries).map((entry) => entry.name));
      const bareKelurahan = matches(address, kelurahanEntries);
      const bareParents = unique(bareKelurahan.map((entry) => entry.district));

      if (!district && !ambiguous) {
        const candidateDistricts = unique([...bareDistricts, ...bareParents]);
        if (candidateDistricts.length === 1) {
          district = candidateDistricts[0];
          districtSource = 'address_dictionary';
          inferred = true;
        } else if (candidateDistricts.length > 1) {
          ambiguous = true;
          reason = 'Nama wilayah di alamat mengarah ke beberapa kecamatan.';
        }
      }

      if (district && !kelurahan && !selectedKelurahan && !ambiguous) {
        const candidates = unique(bareKelurahan.filter((entry) => entry.district === district).map((entry) => entry.name));
        if (candidates.length === 1) {
          kelurahan = candidates[0];
          kelurahanSource = 'address_dictionary';
          inferred = true;
        } else if (candidates.length > 1) {
          ambiguous = true;
          reason = 'Nama wilayah di alamat mengarah ke beberapa kelurahan dalam kecamatan yang sama.';
        }
      }
    }

    const fallbackDistrict = canonicalDistrict(destinationLabel);
    // "Tujuan" is a logistics label, not an explicit kecamatan column. The
    // provided KARDUS file has many incorrect destination labels, so this field
    // is useful for discrepancy warnings but must not fill unknown geography.
    if (district && fallbackDistrict && fallbackDistrict !== district) {
      conflicts.push('Tujuan sumber berbeda dengan wilayah penerima yang teridentifikasi.');
    }

    if (!district && !reason) {
      reason = outsideBatam ? 'Tujuan di luar kamus wilayah Batam; kecamatan belum diketahui.' : 'Alamat belum memberi wilayah yang cukup jelas.';
    }

    const status = ambiguous ? 'ambiguous' : (!district ? 'unknown' : (inferred ? 'inferred' : 'explicit'));
    return {
      awb: String(row.awb || ''),
      sourceRow: row.sourceRow || null,
      sheetName: row.sourceSheetName || row.sheetName || row.sheet || '',
      type: row.type === 'cod' ? 'cod' : 'nonCod',
      district: district || null,
      kelurahan: kelurahan || null,
      status,
      source: districtSource || 'unknown',
      districtSource: districtSource || 'unknown',
      kelurahanSource: kelurahanSource || 'unknown',
      inferred,
      ambiguous,
      conflicts: unique(conflicts),
      reason,
      destinationLabel,
      destinationCity
    };
  }

  function newGroup(name) {
    return { name, count: 0, cod: 0, nonCod: 0, percentage: 0, inferredCount: 0, conflictCount: 0, sheets: Object.create(null) };
  }

  function increment(group, record) {
    group.count += 1;
    group[record.type] += 1;
    group.inferredCount += Number(record.inferred);
    group.conflictCount += Number(record.conflicts.length > 0);
    const sheet = record.sheetName || UNKNOWN;
    if (!group.sheets[sheet]) group.sheets[sheet] = { count: 0, cod: 0, nonCod: 0 };
    group.sheets[sheet].count += 1;
    group.sheets[sheet][record.type] += 1;
  }

  function compareGroups(a, b) {
    return b.count - a.count || a.name.localeCompare(b.name, 'id-ID');
  }

  function summarize(records) {
    const classifications = (Array.isArray(records) ? records : []).map(classifyRecord);
    const total = classifications.length;
    const groups = new Map();
    classifications.forEach((record) => {
      const district = record.district || UNKNOWN;
      if (!groups.has(district)) groups.set(district, { ...newGroup(district), district, children: new Map() });
      const group = groups.get(district);
      increment(group, record);
      const kelurahan = record.kelurahan || UNKNOWN;
      if (!group.children.has(kelurahan)) group.children.set(kelurahan, newGroup(kelurahan));
      increment(group.children.get(kelurahan), record);
    });

    const districts = [...groups.values()].map((group) => {
      const { children, ...view } = group;
      view.percentage = total ? view.count * 100 / total : 0;
      view.kelurahan = [...children.values()].map((child) => ({
        ...child, percentage: group.count ? child.count * 100 / group.count : 0
      })).sort(compareGroups);
      return view;
    }).sort(compareGroups);
    const known = districts.filter((group) => group.district !== UNKNOWN);
    const topDistrict = known[0] || null;
    const unknownDistrict = classifications.filter((record) => !record.district).length;
    return {
      total,
      cod: classifications.filter((record) => record.type === 'cod').length,
      nonCod: classifications.filter((record) => record.type === 'nonCod').length,
      knownDistrict: total - unknownDistrict,
      unknownDistrict,
      knownKelurahan: classifications.filter((record) => record.kelurahan).length,
      unknownKelurahan: classifications.filter((record) => !record.kelurahan).length,
      inferredCount: classifications.filter((record) => record.inferred).length,
      ambiguousCount: classifications.filter((record) => record.ambiguous).length,
      conflictCount: classifications.filter((record) => record.conflicts.length > 0).length,
      districts,
      topDistrict,
      topDistrictTies: topDistrict ? known.filter((group) => group.count === topDistrict.count).map((group) => group.district) : [],
      unknownDominates: unknownDistrict > 0 && (!topDistrict || unknownDistrict >= topDistrict.count),
      classifications,
      sources: SOURCES
    };
  }

  return {
    DISTRICTS,
    SOURCES,
    UNKNOWN,
    normalize,
    canonicalDistrict,
    canonicalKelurahan,
    classifyRecord,
    summarize,
    summarizeDeliveries: summarize
  };
});
