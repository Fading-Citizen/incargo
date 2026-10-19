# Origen y carga: preparación, NO activado

Base productiva 308e84bc05927ba866f727f161255b35b4f8c246. El usuario autorizó desarrollar captura y presentación; esta preparación no aplica SQL remoto ni amplía acceso productivo. No se publica un despliegue con marcadores vacíos. `IncargoCargo.enabled` permanece false en el archivo servido.

## Convenciones y alcance

Se revisaron el modelo SQL, migraciones, frontend operativo y cliente y herramientas de importación versionadas. No hay columnas equivalentes de origen/descripcion de carga/bultos/peso en esos modelos; las menciones anteriores eran propuestas. Antes de activar, ejecutar `client-cargo-preflight.sql` para comprobar posibles cambios remotos o modelos adicionales: no se afirma un inventario actual de todas las tablas remotas.

Datos por entrega, no por viaje ni por empresa. `destination_text`, ruta y fecha permanecen en el contrato publicado. Cuatro columnas nuevas nullable, sin DEFAULT ni backfill: origin_text (hasta 200 caracteres), cargo_description (hasta 500), package_count (entero positivo) y gross_weight_kg (numeric positivo, hasta 999999999.999 kg y máximo tres decimales). Límites técnicos revisables, no máximos comerciales. Campos vacíos se guardan null; no cero, una unidad asumida ni texto inferido. Peso siempre rotulado kg. No se extrae descripción de notas privadas; servicio no equivale a descripción y no se añade en este lote.

Captura preparada en Agregar entrega al viaje, dentro de un fieldset oculto y deshabilitado hasta activación. Informa que los campos se compartirán con el cliente vinculado. Conserva valores si la solicitud falla, bloquea doble envío simultáneo y limpia el borrador al cerrar/cambiar sesión. El alta usa la INSERT existente y no asigna automáticamente cuenta comercial. La vista operativa y conductor muestra los campos después de recargar cuando la función se habilite. Los registros anteriores siguen vacíos: editar/completar carga de entregas existentes no está incluido, porque los UPDATE actuales conceden una lista de columnas que no incluye estas nuevas. No se amplía ese permiso silenciosamente.

## Propuesta mínima agrupada de activación

1. Verificar proyecto Incargo, ausencia de columnas/funciones conflictivas y permisos/políticas actuales con el preflight. Si existen campos equivalentes, detener y adaptar; no ejecutar ADD duplicados ni IF NOT EXISTS que oculte diferencias.
2. Aprobar y aplicar en una transacción `client-cargo.proposal.sql`: cuatro columnas con restricciones; helper privado SECURITY DEFINER/STABLE/search_path vacío y envoltorio público SECURITY INVOKER. Nuevas funciones `incargo_private.client_delivery_cargo(uuid)` y `public.incargo_client_delivery_cargo(uuid)`; EXECUTE únicamente propietario y authenticated, revocado a PUBLIC/anon/service_role. Devuelve delivery_id más esos cuatro campos, con auth.uid → membresía → vínculo explícito. La RPC logística existente no cambia.
3. Verificar definiciones/ACL y el alcance comercial antes de habilitar. Revisar que las tablas ya permitan INSERT de operaciones bajo RLS. Las concesiones SELECT de tabla existentes implican lectura operativa y de conductor asignado sobre las nuevas columnas; la aprobación debe incluir esa consecuencia. Cliente continúa sin lectura directa. No se cambia RLS/Auth ni grants de tabla.
4. Tras postflight, activar `enabled:true`, ejecutar QA visual con fixtures y lectura real autorizada, publicar conjuntamente el frontend operativo y cliente. No habilitar la UI antes del esquema y RPC. En rollback de interfaz volver a false; conservar columnas/datos y revisar separadamente revocación de RPC. No borrar datos para revertir.

**Decisión concreta pendiente:** autorizar almacenar estos cuatro campos y exponerlos al cliente vinculado mediante las dos funciones nuevas (además de la lectura ya existente de operaciones/conductor asignado); luego habilitar la captura de nuevas entregas. No se pide acceso a otras empresas, datos históricos, proveedores ni mapas. La propuesta no incluye edición histórica, importación ni nuevas concesiones UPDATE.

## Evidencia

- PostgreSQL aislado: 9/9, incluye operaciones INSERT y denegación a driver/cliente, restricciones numéricas/texto, nulos, A/B, ID ajeno, helper directo, doble rol, revocación/reasignación y ACL. Datos sintéticos en servidor loopback desechable, detenido al finalizar.
- Pruebas de valores y cliente: 41/41. Incluyen flag deshabilitado, null, límites, coma decimal, errores/reintento, contenido literal y respuestas tardías 200/500/401 ante cerrar, logout, filtrar, refrescar o seleccionar otra entrega.
- Regresión de sesiones e integración operativa: 31/31, incluyendo dos pruebas nuevas de captura, payload null, recarga, validación, borrador tras error y bloqueo de INSERT simultánea. También se aprobaron codificación y presentación operativa en la ejecución conjunta previa (81/81 antes de añadir estas dos pruebas).
- No se ha hecho QA visual de la nueva captura habilitada ni una lectura real de origen/carga. Son comprobaciones previas a la activación/publicación, no pruebas acreditadas por estas suites.

La preparación usa las convenciones existentes; no modifica infraestructura, credenciales, otros proyectos o datos remotos.
