# Verificación independiente de observaciones del PR #5

## Presupuesto compartido entre documentos — discussion_r4467552049

Válido en la versión revisada del PR #5, pero corregido posteriormente: PR #6 añadió `legacy-size:<kind>` antes del bloqueo individual y PR #7 comprueba la respuesta completa. La función instalada en Supabase contiene ambas protecciones (verificación de solo lectura). No hace falta otra migración.

Nueva regresión en PostgreSQL desechable: dos correcciones de documentos distintos quedan esperando simultáneamente el mismo bloqueo de tipo. Cada una cabe por separado, pero sus evidencias combinadas excederían el presupuesto. Al liberar el bloqueo, solo una confirma; la otra falla por límite. Solo hay una nueva revisión, los originales conservan su contenido y el panel sigue por debajo de 2,9 MB. Se mantienen las pruebas existentes de repetición, revocación, conflictos e importación atómica. Todo el contenido de esta prueba es sintético, nunca enviado a producción.

## Procedencia de copias corregidas — discussion_r4467552163

Vigente en producción anterior: la impresión usaba `record.data` corregido y `record.hash` original sin número de revisión. Se corrige el documento imprimible para mostrar «Revisión reproducida: N (corrección guardada)» y «SHA-256 del contenido original». La revisión cero se identifica como contenido original; si falta revisión, se indica que no es posible identificarla, sin suponer cero.

Regresiones cubren inspecciones/vinculaciones, detalle/listado y revisiones cero, uno, dos y desconocida. Las copias conservan su advertencia informativa: no certifican aprobación ni autenticidad de firmas y no reconstruyen contratos. No se modifica evidencia ni se inventa una firma.

Validación: 27 unitarias, TypeScript, lint, build, navegador local y PostgreSQL desechable. No se resuelven ni cierran automáticamente los comentarios de GitHub. La comprobación de producción autenticada sigue limitada por ausencia de sesión autorizada.
