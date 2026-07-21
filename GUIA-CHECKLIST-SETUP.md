# 🚛 Inspección Preoperacional de Vehículos — Guía de Setup

Sistema completo para que los conductores diligencien el checklist desde el celular y tú tengas control total de los vehículos.

**Stack:** HTML estático (Vercel) + Google Sheets (base de datos) + Google Apps Script (receptor).

**Costo:** $0 — todo en el plan gratuito.

---

## ⏱️ Tiempo de implementación

**≈ 25 minutos**, una sola vez.

---

## 📋 PASO 1 — Crear la base de datos (Google Sheets) · 5 min

1. Ve a https://sheets.new (crea una hoja nueva automática).
2. Nómbrala: `Inspecciones Incargo`.
3. En la primera hoja, renombra la pestaña como **`INSPECCIONES`**.
4. En la fila 1 coloca estos encabezados (en este orden):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TIMESTAMP | FECHA | CIUDAD | PLACA | CONDUCTOR | LICENCIA | EMPRESA | VEHICULO | MODELO | GPS | SOAT | TECNOMEC | ITEMS_JSON | FIRMA_B64 | FOTO_B64 |

> No importa que la fila 1 quede en gris con encabezados — el script la usa tal cual.

---

## 📋 PASO 2 — Crear el receptor (Google Apps Script) · 8 min

1. En la hoja de Google: **Extensiones → Apps Script**.
2. Borra lo que haya en `Code.gs` y pega **todo** este código:

````javascript
// filepath: Google Apps Script (Code.gs)

const SHEET_NAME = 'INSPECCIONES';

function doPost(e) {
  try {
    const lock = LockService.getScriptLock();
    lock.tryLock(10000);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);
    
    const data = JSON.parse(e.postData.contents);
    
    // Helper para truncar imágenes y no saturar la hoja
    const truncateB64 = (s, maxLen = 50000) => {
      if (!s) return '';
      return s.length > maxLen ? s.substring(0, maxLen) + '...[TRUNC]' : s;
    };
    
    sheet.appendRow([
      new Date(),
      data.fecha || '',
      data.ciudad || '',
      (data.placa || '').toUpperCase(),
      data.conductor || '',
      data.licencia || '',
      data.empresa || '',
      data.claseVehiculo || '',
      data.modelo || '',
      data.gps || '',
      data.fechaSoat || '',
      data.fechaTecno || '',
      JSON.stringify(data.items || []),
      truncateB64(data.firma),
      truncateB64(data.fotoPlaca)
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
  // Listar todas las inspecciones (para el dashboard)
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const headers = rows.shift() || [];
    
    const data = rows.map(row => {
      const obj = { ts: row[0] ? new Date(row[0]).toISOString() : '' };
      headers.forEach((h, i) => {
        if (i === 0) return;
        const key = String(h).toLowerCase().replace('timestamp', 'ts')
          .replace('fecha', i === 1 ? 'fecha' : (String(h).includes('soat') ? 'fechasoat' : (String(h).includes('tecnomec') ? 'fechatecno' : '')))
          .replace('ciudad','ciudad')
          .replace('placa','placa')
          .replace('conductor','conductor')
          .replace('licencia','licencia')
          .replace('empresa','empresa')
          .replace('vehiculo','clasevehiculo')
          .replace('modelo','modelo')
          .replace('items_json','items')
          .replace('firma_b64','firma')
          .replace('foto_b64','fotoplaca')
          .replace(/[^a-z]/g,'');
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
````

3. **Ctrl+S** para guardar.
4. Click en **Implementar → Nueva implementación**.
5. Tipo: **Aplicación web**.
6. Configuración:
   - Descripción: `Receptor de inspecciones`
   - Ejecutar como: **Yo** (tu correo)
   - Quién tiene acceso: **Cualquier persona**
7. Click **Implementar** → autoriza con tu cuenta de Google.
8. **Copia la URL** que termina en `/exec` — esa es tu `ENDPOINT_URL`.

Ejemplo: `https://script.google.com/macros/s/AKfycbx.../exec`

---

## 📋 PASO 3 — Pegar el endpoint en el HTML · 3 min

En tu editor, abre `checklist.html` y `admin.html`, busca:

```javascript
const ENDPOINT_URL = 'PEGAR_AQUI_TU_URL_DE_GOOGLE_APPS_SCRIPT';
```

Reemplaza por tu URL real (en ambos archivos).

En `admin.html` también cambia:
```javascript
const ADMIN_PASSWORD = 'incargo2024';
```
por la contraseña que quieras (mínimo 8 caracteres, sin caracteres especiales).

---

## 📋 PASO 4 — Subir a Vercel · 5 min

Ya tienes el repo conectado a Vercel. Solo haz commit y push:

```powershell
cd "c:\Users\Lenu\Documents\Incargo\incargo\logistica-1.0.0"
git add -A
git commit -m "Add: preoperational checklist system + admin dashboard"
git push
```

Vercel desplegará automáticamente en 1-2 minutos.

---

## 📋 PASO 5 — Probar · 3 min

### Formulario del conductor
1. Abre `https://www.incargo.co/checklist` desde el celular.
2. Llena todos los campos → marca todos los items → firma → envía.
3. Confirma que en tu Google Sheet **aparezca una fila nueva** con todos los datos.

### Dashboard
1. Abre `https://www.incargo.co/admin` desde el computador.
2. Ingresa con tu contraseña.
3. Verás KPIs + tabla. Click en 👁️ para ver el detalle de una inspección.

---

## 🎁 EXTRA — Compartir con los conductores

Una vez que todo funcione, comparte el link con un mensaje tipo:

> 🛡️ **Inspección preoperacional del vehículo**
>
> Antes de cada turno, completa este formulario desde tu celular (toma ~3 minutos).
>
> 👉 https://www.incargo.co/checklist
>
> Mantén la ubicación de tu vehículo **activa** por seguridad.

---

## 🛟 Soporte / Extensiones posibles

Cuando crezca el volumen, podemos migrar esta misma estructura a Supabase en 1 hora sin perder nada. La lógica HTML es 100% portable.

Posibles mejoras futuras:
- 📧 Notificación por email cuando hay un item MALO
- 📍 GPS automático del conductor al enviar
- 🔐 Login por conductor con código (para que cada uno vea su historial)
- 📊 Reportes mensuales automáticos

---

## 📂 Archivos creados

| Archivo | Para quién |
|---|---|
| `logistica-1.0.0/checklist.html` | Conductores (móvil) |
| `logistica-1.0.0/admin.html` | Tú / supervisor (computador) |
| `GUIA-CHECKLIST-SETUP.md` | Este documento |
