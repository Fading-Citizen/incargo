// filepath: Google Apps Script (Code.gs) - Incargo Inspecciones v2

const SHEET_NAME = 'INSPECCIONES';

const HEADERS = [
  'TIMESTAMP',
  'FECHA',
  'CIUDAD',
  'PLACA',
  'CONDUCTOR',
  'LICENCIA',
  'EMPRESA',
  'CLASE_VEHICULO',
  'TIPO_CARROCERIA',
  'PLACA_SEMIRREMOLQUE',
  'MODELO',
  'GPS',
  'TARJETA_PROPIEDAD',
  'SOAT',
  'TECNOMEC',
  'TIPO_TRANSPORTE',
  'ITEMS_JSON',
  'FIRMA_B64',
  'FOTOS_B64'
];

function doPost(e) {
  try {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.getRange(1, 1, 1, HEADERS.length)
        .setFontWeight('bold').setBackground('#0d6efd').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    } else {
      ensureTarjetaHeader(sheet);
    }

    const data = JSON.parse(e.postData.contents);
    if (data.action === 'update') {
      const response = actualizarInspeccion(sheet, data);
      lock.releaseLock();
      return response;
    }

    const truncateB64 = (s, maxLen = 30000) => {
      if (!s) return '';
      return s.length > maxLen ? s.substring(0, maxLen) + '...[TRUNC]' : s;
    };

    const fotosJoined = Array.isArray(data.fotos)
      ? data.fotos.join('|')
      : (data.fotoPlaca || '');

    const tipoTransporte = Array.isArray(data.tipoTransporte)
      ? data.tipoTransporte.join(', ')
      : (data.tipoTransporte || '');

    sheet.appendRow([
      new Date(),
      data.fecha || '',
      data.ciudad || '',
      (data.placa || '').toUpperCase(),
      data.conductor || '',
      data.licencia || '',
      data.empresa || '',
      data.claseVehiculo || '',
      data.tipoCarroceria || '',
      data.placaSemirremolque || '',
      data.modelo || '',
      data.gps || '',
      data.tarjetaProp || '',
      data.fechaSoat || '',
      data.fechaTecno || '',
      tipoTransporte,
      JSON.stringify(data.items || []),
      truncateB64(data.firma),
      fotosJoined
    ]);

    lock.releaseLock();

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, row: sheet.getLastRow() })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);
    const values = sheet ? sheet.getDataRange().getValues() : [];
    if (!values.length) {
      return ContentService.createTextOutput('[]')
        .setMimeType(ContentService.MimeType.JSON);
    }

    const hasHeaders = values[0].some(value => isHeader(String(value)));
    const headers = hasHeaders ? values[0] : HEADERS;
    const rows = hasHeaders ? values.slice(1) : values;
    const data = rows.map((row, index) => hasHeaders
      ? rowToObject(row, headers, index + 2)
      : rowWithoutHeadersToObject(row, index + 1));

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function isHeader(value) {
  const norm = value.toLowerCase().replace(/\s|_/g, '');
  return ['timestamp', 'fecha', 'ciudad', 'placa', 'conductor',
    'licencia', 'empresa', 'clasevehiculo', 'itemsjson'].includes(norm);
}

function rowToObject(row, headers, rowNumber) {
  const obj = { _rowNumber: rowNumber, ts: toIso(row[0]) };
  headers.forEach((h, i) => {
    if (i === 0) return;
    const key = headerToKey(String(h), i);
    if (key) obj[key] = row[i];
  });
  return obj;
}

function getNoHeaderIndexes(row) {
  const itemsIndex = row.findIndex(value =>
    typeof value === 'string' && value.trim().startsWith('['));
  return itemsIndex >= 0 && itemsIndex <= 12
    ? { items: 12, firma: 13, fotos: 14, claseVehiculo: 7, modelo: 8,
      gps: 9, tarjetaProp: null, fechaSoat: 10, fechaTecno: 11 }
    : itemsIndex === 16
    ? { items: 16, firma: 17, fotos: 18, claseVehiculo: 7,
      tipoCarroceria: 8, placasemirremolque: 9, modelo: 10, gps: 11,
      tarjetaProp: 12, fechaSoat: 13, fechaTecno: 14, tipoTransporte: 15 }
    : { items: 15, firma: 16, fotos: 17, claseVehiculo: 7,
      tipoCarroceria: 8, placasemirremolque: 9, modelo: 10, gps: 11,
      tarjetaProp: null, fechaSoat: 12, fechaTecno: 13, tipoTransporte: 14 };
}

function rowWithoutHeadersToObject(row, rowNumber) {
  const indexes = getNoHeaderIndexes(row);

  return {
    _rowNumber: rowNumber,
    ts: toIso(row[0]),
    fecha: row[1] || '',
    ciudad: row[2] || '',
    placa: row[3] || '',
    conductor: row[4] || '',
    licencia: row[5] || '',
    empresa: row[6] || '',
    claseVehiculo: row[indexes.claseVehiculo] || '',
    tipoCarroceria: row[indexes.tipoCarroceria] || '',
    placasemirremolque: row[indexes.placasemirremolque] || '',
    modelo: row[indexes.modelo] || '',
    gps: row[indexes.gps] || '',
    tarjetaProp: indexes.tarjetaProp === null ? '' : (row[indexes.tarjetaProp] || ''),
    fechaSoat: row[indexes.fechaSoat] || '',
    fechaTecno: row[indexes.fechaTecno] || '',
    tipoTransporte: row[indexes.tipoTransporte] || '',
    items: row[indexes.items] || '[]',
    firma: row[indexes.firma] || '',
    fotos: row[indexes.fotos] || ''
  };
}

function actualizarInspeccion(sheet, data) {
  const rowNumber = Number(data.rowNumber);
  const lastColumn = sheet.getLastColumn();
  if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > sheet.getLastRow()) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Fila de inspección inválida.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  const headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const hasHeaders = headerValues.some(value => isHeader(String(value)));
  const editableFields = [
    'fecha', 'ciudad', 'empresa', 'conductor', 'licencia', 'placa',
    'claseVehiculo', 'tipoCarroceria', 'placasemirremolque', 'modelo',
    'gps', 'tarjetaProp', 'fechaSoat', 'fechaTecno', 'tipoTransporte',
    'firma', 'fotos'
  ];

  if (hasHeaders) {
    headerValues.forEach((header, index) => {
      const key = headerToKey(String(header), index);
      if (editableFields.includes(key) && data[key] !== undefined) row[index] = data[key];
    });
  } else {
    const indexes = getNoHeaderIndexes(row);
    const fieldIndexes = {
      fecha: 1, ciudad: 2, empresa: 6, conductor: 4, licencia: 5,
      placa: 3, claseVehiculo: indexes.claseVehiculo,
      tipoCarroceria: indexes.tipoCarroceria,
      placasemirremolque: indexes.placasemirremolque,
      modelo: indexes.modelo, gps: indexes.gps, tarjetaProp: indexes.tarjetaProp,
      fechaSoat: indexes.fechaSoat, fechaTecno: indexes.fechaTecno,
      tipoTransporte: indexes.tipoTransporte, firma: indexes.firma, fotos: indexes.fotos
    };
    editableFields.forEach(key => {
      const index = fieldIndexes[key];
      if (index !== null && index !== undefined && data[key] !== undefined) row[index] = data[key];
    });
  }

  if (data.placa !== undefined) {
    const placaIndex = hasHeaders
      ? headerValues.findIndex(header => headerToKey(String(header), 0) === 'placa')
      : 3;
    if (placaIndex >= 0) row[placaIndex] = String(data.placa).toUpperCase();
  }
  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, row: rowNumber }))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureTarjetaHeader(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value).toLowerCase().replace(/\s|_/g, ''));
  if (headers.includes('tarjetapropiedad')) return;
  if (!headers.includes('timestamp')) return;

  sheet.insertColumnAfter(12);
  sheet.getRange(1, 13).setValue('TARJETA_PROPIEDAD')
    .setFontWeight('bold').setBackground('#0d6efd').setFontColor('#ffffff');
}

function toIso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

function headerToKey(h, idx) {
  const norm = h.toLowerCase().replace(/\s|_/g, '');
  const map = {
    'timestamp':'ts','fecha':'fecha','ciudad':'ciudad','placa':'placa',
    'conductor':'conductor','licencia':'licencia','empresa':'empresa',
    'clasevehiculo':'clasevehiculo','tipocarroceria':'tipocarroceria',
    'placasemirremolque':'placasemirremolque','modelo':'modelo',
    'gps':'gps','tarjetapropiedad':'tarjetaProp','soat':'fechasoat','tecnomec':'fechatecno',
    'tipotransporte':'tipotransporte','itemsjson':'items',
    'firmab64':'firma','fotosb64':'fotos'
  };
  return map[norm] || norm;
}
