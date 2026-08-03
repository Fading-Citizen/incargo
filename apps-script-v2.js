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
    }

    const data = JSON.parse(e.postData.contents);

    const truncateB64 = (s, maxLen = 30000) => {
      if (!s) return '';
      return s.length > maxLen ? s.substring(0, maxLen) + '...[TRUNC]' : s;
    };

    const fotosJoined = Array.isArray(data.fotos)
      ? data.fotos.map(f => truncateB64(f)).join('|')
      : truncateB64(data.fotoPlaca);

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
    const rows = sheet.getDataRange().getValues();
    const headers = rows.shift() || [];

    const data = rows.map(row => {
      const obj = { ts: row[0] ? new Date(row[0]).toISOString() : '' };
      headers.forEach((h, i) => {
        if (i === 0) return;
        const key = headerToKey(String(h), i);
        if (key) obj[key] = row[i];
      });
      return obj;
    });

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function headerToKey(h, idx) {
  const norm = h.toLowerCase().replace(/\s|_/g, '');
  const map = {
    'timestamp':'ts','fecha':'fecha','ciudad':'ciudad','placa':'placa',
    'conductor':'conductor','licencia':'licencia','empresa':'empresa',
    'clasevehiculo':'clasevehiculo','tipocarroceria':'tipocarroceria',
    'placasemirremolque':'placasemirremolque','modelo':'modelo',
    'gps':'gps','soat':'fechasoat','tecnomec':'fechatecno',
    'tipotransporte':'tipotransporte','itemsjson':'items',
    'firmab64':'firma','fotosb64':'fotos'
  };
  return map[norm] || norm;
}
