# Mapeo verificado de procesos existentes (solo preparación)

Fuente autorizada: Google Sheet `1-h7vBy9CJW6Rnfkp2dk8Ahb5xkeNBVlXqxD_j22lB9Y`, título **Inspecciones Incargo**, zona horaria `America/Bogota`. Pestañas `INSPECCIONES` (gid `0`) y `VINCULACIONES` (gid `364997768`). El código local `apps-script-v2.js` usa `SpreadsheetApp.getActiveSpreadsheet()` y esos dos nombres; `checklist.html` y `admin.html` llaman al mismo endpoint Apps Script. El código **no contiene el spreadsheet ID ni la versión de implementación**, por lo que la coincidencia exacta entre ese endpoint desplegado y este libro sigue por comprobarse administrativamente. No se consultó el endpoint ni se modificó la hoja.

## INSPECCIONES

La hoja tiene **20 filas con timestamp en A**, incluida la primera: **A1 es un registro, no cabecera**. No omitirla. Hay formatos mixtos reconocidos por `getNoHeaderIndexes()` en el Apps Script; el detector debe usar la posición del `ITEMS_JSON`, no un ancho fijo por pestaña.

| Formato | A–H | Campos variables | Checklist y evidencia |
| --- | --- | --- | --- |
| Inicial | A timestamp; B fecha; C ciudad; D placa; E conductor; F licencia; G empresa; H clase vehículo | I modelo; J GPS; K SOAT; L tecnomecánica | M items JSON; N firma; O fotos si existe |
| Intermedio | A–H iguales | I carrocería; J placa semirremolque; K modelo; L GPS; M SOAT; N tecnomecánica; O tipo transporte | P items JSON; Q firma; R fotos |
| Actual | A–H iguales | I carrocería; J placa semirremolque; K modelo; L GPS; M tarjeta de propiedad; N SOAT; O tecnomecánica; P tipo transporte | Q items JSON; R firma; S fotos |

La muestra autorizada confirma JSON en M para las dos primeras filas, P para una fila y Q para las demás filas examinadas; algunas firmas contienen `...[TRUNC]` por truncamiento del Apps Script. Esas evidencias **no se deben reconstruir ni marcar como completas**. El código v2 trunca firma de inspección a 30 000 caracteres y concatena fotos con `|`; esa regla necesita conciliación por fila antes de extraer imágenes. `ITEMS_JSON` debe conservarse como JSON validado, junto con el texto original para auditoría. Fechas/timestamps requieren interpretación explícita en `America/Bogota`; placa y licencia son texto, no números. `GPS` es un campo documental existente, no autorización para seguimiento continuo.

## VINCULACIONES

Fila 1 tiene once cabeceras: `TIMESTAMP`, `CORREO_REGISTRO`, `TIPO_VINCULACION`, `TIPO_VINCULACION_OTRO`, `NOMBRE_COMPLETO`, `TIPO_IDENTIFICACION`, `NUMERO_IDENTIFICACION`, `CORREO_ELECTRONICO`, `ACEPTA_CONTRATO`, `ACEPTADO_EN`, `VERSION_CONTRATO`. Hay **seis filas de datos** según la columna A. La columna L no tiene cabecera ni firma en esas filas. El Apps Script v2 prevé `FIRMA_B64` en L y versión literal `001` para nuevas filas, pero esta fuente observada carece de esa columna; conservar las versiones tal como están, sin inferir que son `001` ni inventar firmas.

`ACEPTA_CONTRATO='SI'` y `ACEPTADO_EN` son evidencia registrada, no prueba independiente de validez jurídica. Preservar valor original, instante, versión y vínculo a la versión del contrato presentada. `TIPO_VINCULACION` puede ser una lista unida por coma; guardar original y normalización por separado. Documentos de identidad y correos se tratan como texto protegido. Si se exportan imágenes o firmas, usar almacenamiento privado y conservar marca `truncated` cuando corresponda.

## Migración no destructiva propuesta

1. Confirmar con el propietario que el Apps Script desplegado está vinculado a este spreadsheet ID y obtener una copia/exportación privada inmutable de cada pestaña. Registrar fecha, zona horaria, gid, número de filas, nombres/orden de columnas y checksum del archivo en un manifiesto privado.
2. Ejecutar `legacy_preview.py` sobre exportaciones autorizadas: solo emite conteos agregados. Para inspecciones, conservar fila 1 y clasificar cada fila por posición del JSON; mandar a cuarentena las filas desconocidas, JSON inválido o evidencia truncada. Para vinculaciones, exigir las once cabeceras y registrar presencia/ausencia de firma y aceptación sin modificar el original.
3. Proponer tablas nuevas **privadas y separadas** para inspecciones, ítems, adjuntos y aceptaciones de vinculación. Clave idempotente inicial: `(spreadsheet_id, gid, snapshot_id, row_number)`; guardar también hash del contenido original para detectar cambios. El número de fila solo es estable dentro del snapshot: al hacer delta, conciliar por hash/identificadores verificados antes de reasignar filas.
4. Comparar origen y staging por formato y por fila: 20 inspecciones y 6 vinculaciones como línea de base observada, más cualquier alta posterior. Conciliar número de firmas/fotos completas, truncadas y ausentes; estados de aceptación y versiones exactas. Revisar manualmente excepciones con operaciones sin imprimir datos personales en logs.
5. **Antes de importar**, aprobar esquema, reglas de retención, acceso y manejo de contrato/soportes; respaldar Supabase. Importar en lotes idempotentes, repetir la conciliación y mantener Sheets/App Script operativos durante operación paralela. Definir corte y reversión por escrito. No borrar ni apagar la fuente.

Actualmente no se ha creado esquema de inspecciones/vinculaciones en Supabase ni se han importado registros. Las tablas de viajes/entregas ya publicadas permanecen vacías y son un proceso distinto; falta la fuente canónica para un historial de viajes si existe.
