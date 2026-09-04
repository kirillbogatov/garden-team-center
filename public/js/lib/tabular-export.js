// Небольшой экспорт табличных данных без внешних зависимостей.
// XLSX собирается как минимальный OOXML-архив ZIP (store, без сжатия),
// чтобы экспорт Check-in работал офлайн и не тянул тяжёлую библиотеку.

const TabularExport = (() => {
  const encoder = new TextEncoder();

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function csvCell(value) {
    const text = String(value ?? '').replace(/\r?\n/g, '\n');
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(headers, rows) {
    // BOM + ';' дружелюбнее к Excel в русской локали.
    return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  }

  function mdCell(value) {
    return String(value ?? '')
      .replace(/\r?\n/g, '<br>')
      .replace(/\|/g, '\\|');
  }

  function toMarkdown(headers, rows) {
    const line = (row) => `| ${row.map(mdCell).join(' | ')} |`;
    return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
  }

  function xml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function columnName(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
      n -= 1;
      out = String.fromCharCode(65 + (n % 26)) + out;
      n = Math.floor(n / 26);
    }
    return out;
  }

  function sheetXml(headers, rows) {
    const data = [headers, ...rows];
    const body = data.map((row, rowIndex) => {
      const cells = row.map((value, colIndex) => {
        // Excel ограничивает строку в ячейке 32767 символами.
        const safe = String(value ?? '').slice(0, 32767);
        const ref = `${columnName(colIndex)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(safe)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    const lastCol = columnName(Math.max(0, headers.length - 1));
    const lastRow = Math.max(1, data.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData><autoFilter ref="A1:${lastCol}${lastRow}"/></worksheet>`;
  }

  let crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function set16(view, offset, value) { view.setUint16(offset, value, true); }
  function set32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function zipStore(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      set32(lv, 0, 0x04034b50);
      set16(lv, 4, 20);
      set16(lv, 6, 0x0800); // UTF-8 filename
      set16(lv, 8, 0); // store
      set16(lv, 10, 0);
      set16(lv, 12, 0);
      set32(lv, 14, crc);
      set32(lv, 18, data.length);
      set32(lv, 22, data.length);
      set16(lv, 26, name.length);
      set16(lv, 28, 0);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      set32(cv, 0, 0x02014b50);
      set16(cv, 4, 20);
      set16(cv, 6, 20);
      set16(cv, 8, 0x0800);
      set16(cv, 10, 0);
      set16(cv, 12, 0);
      set16(cv, 14, 0);
      set32(cv, 16, crc);
      set32(cv, 20, data.length);
      set32(cv, 24, data.length);
      set16(cv, 28, name.length);
      set16(cv, 30, 0);
      set16(cv, 32, 0);
      set16(cv, 34, 0);
      set16(cv, 36, 0);
      set32(cv, 38, 0);
      set32(cv, 42, localOffset);
      central.set(name, 46);
      centralParts.push(central);

      localOffset += local.length + data.length;
    }

    const central = concatBytes(centralParts);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    set32(ev, 0, 0x06054b50);
    set16(ev, 4, 0);
    set16(ev, 6, 0);
    set16(ev, 8, entries.length);
    set16(ev, 10, entries.length);
    set32(ev, 12, central.length);
    set32(ev, 16, localOffset);
    set16(ev, 20, 0);

    return concatBytes([...localParts, central, end]);
  }

  function toXlsx(headers, rows) {
    const entries = [
      {
        name: '[Content_Types].xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      },
      {
        name: '_rels/.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      {
        name: 'xl/workbook.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Check-in" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml(headers, rows) },
    ];
    return zipStore(entries);
  }

  function download({ headers, rows, format, filename }) {
    const safeFormat = String(format || '').toLowerCase();
    if (safeFormat === 'csv') {
      downloadBlob(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
      return;
    }
    if (safeFormat === 'md') {
      downloadBlob(new Blob([toMarkdown(headers, rows)], { type: 'text/markdown;charset=utf-8' }), `${filename}.md`);
      return;
    }
    if (safeFormat === 'xlsx') {
      downloadBlob(new Blob([toXlsx(headers, rows)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
      return;
    }
    throw new Error(`Unsupported export format: ${format}`);
  }

  return { download, toCsv, toMarkdown, toXlsx };
})();
