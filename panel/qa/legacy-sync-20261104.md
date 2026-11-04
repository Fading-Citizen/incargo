# Sincronización incremental — 4 de noviembre de 2026

## Implementado y aplicado

Tres migraciones instalan transporte HTTP privado y dos trabajos pg_cron: inspecciones cada cinco minutos; vinculaciones cada cinco minutos, desplazadas dos minutos. Funcionan sin tener abierto el panel. Solo consultan por GET el Apps Script existente, sin nuevas credenciales. Los RPC públicos requieren el rol operations actual; clientes, conductores y anónimos quedan excluidos. El transporte y el trabajador privado no son ejecutables por authenticated/anon.

Cada respuesta válida se conserva íntegra como snapshot SHA-256. Sus originales se insertan por hash, sin reemplazar originales ni revisiones anteriores. El lote es atómico; bloqueos serializan importación y correcciones. Repetir no duplica. La revocación se comprueba otra vez después de esperar red/bloqueos. Las correcciones mantienen sus recibos idempotentes e historial existente.

El panel consulta Supabase independientemente del origen. Muestra último intento, última sincronización confirmada y error/antigüedad; conserva los registros cuando el origen falla. Consulta la copia cada minuto mientras la lista está visible y no hay detalle/edición; permite sincronización manual autorizada, limitada a un intento por minuto.

## Evidencia real

Primera reconciliación desde Supabase a las 12:50 UTC: 27 inspecciones y 8 vinculaciones, cero originales añadidos y mismos hashes de las copias ya importadas. Snapshot inspecciones: `5ee3cb30e5f7f96e7a9ee341c8f9172d9a40d44125c6212689cb2eead6c3b227`. Vinculaciones: `082e05096ca50118c39f67d7de77255c107a87cebf97dfc9ee36412a5e10aadf`. Primera ejecución automática de vinculaciones 12:52 UTC: succeeded, last_success actualizado, sin error ni duplicados.

## Validación

26 pruebas unitarias del panel, 60 pruebas de sesión/reintentos, TypeScript, lint, build y navegadores locales pasaron. PostgreSQL local pasó importación repetida, fallo parcial con rollback, recuperación, origen vacío sin borrar historial, respuesta inválida/duplicada, límite y timeout, concurrencia, exclusión de roles y revocación durante una espera. Las pruebas de navegador y de fallos usan fixtures locales: no constituyen una sesión real de Operaciones ni envíos reales de formularios.

## Límites explícitos

Latencia nominal hasta cinco minutos más el refresco del panel. El origen completo todavía debe descargarse: timeout de diez segundos/conexión de tres segundos; límite de respuesta 2,5 MB comprobado después de descargar; límite de colección 2,7 MB. Si se exceden, se mantiene la copia anterior y se muestra fallo; ampliar almacenamiento/paginación requiere trabajo posterior. Un original cambiado en el origen se preserva como otro hash y el anterior queda marcado histórico. Filas idénticas ambiguas provocan rechazo completo, nunca deduplicación silenciosa.

Los formularios legacy no-cors siguen sin proporcionar confirmación verificable de recepción al remitente. No se enviaron formularios de prueba ni se modificó legacy. La sincronización confirma únicamente lo que devuelve el origen. Las ocho marcas literales [TRUNC] de inspecciones se conservan; no acreditan pérdida irreversible. Firma y contratos siguen sujetos a documentos/autorizaciones existentes, sin inventarlos. Sin sesión real autorizada de navegador, QA autenticado de producción sigue pendiente.
