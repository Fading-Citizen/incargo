# Incargo: primer incremento local

Esta carpeta conserva una web app responsive **de demostración**. Abre `index.html` en un servidor HTTP local. Todos los nombres, direcciones, placas y facturas de esa maqueta son ficticios. Los cambios viven únicamente en la memoria de la pestaña y se pierden al recargar. La interfaz conectada está separada en `logistica-1.0.0/operaciones.html` y `seguimiento.html`. El sitio público y el proceso actual de inspecciones/vinculaciones siguen funcionando por separado.

## Inventario comprobado (13 octubre 2026)

- Base Git: `ce6b2b399ba3fabb856010c4c8c8b941410f6ff7`, árbol limpio antes de estos archivos.
- `logistica-1.0.0/`: HTML, CSS y JavaScript estáticos. `checklist.html` y `admin.html` llaman a Apps Script.
- `apps-script-v2.js`: hojas `INSPECCIONES` y `VINCULACIONES`; contienen datos personales, firmas y fotos codificadas. `GUIA-CHECKLIST-SETUP.md` documenta ese proceso.
- El único CSV local es un formato de inspección preoperacional, no una exportación de viajes/entregas. No se ha abierto ni copiado contenido personal.
- No se encontró fuente local de viajes, entregas ni reglas de asignación. Se requiere la ubicación autorizada o exportación de esas hojas/libros, diccionario de columnas y ejemplos anonimizados. No asumir que el CSV de inspección representa las entregas.
- Referencia visual `image(20261013-190623).png` inspeccionada: creación de viaje con ruta/fecha/vehículo/conductor y entregas; lista móvil buscable; novedad; confirmación con soporte, receptor y observación; enlace del cliente con estados y soporte.

## Modelo candidato

`trips` agrupa ruta, fecha y asignación. `deliveries` representa cada parada con clave de origen estable, cliente, destino, factura/remesa y estado. `delivery_events` conserva la secuencia de estados y novedades, con actor y hora. `delivery_proofs` guarda metadatos de archivos privados, receptor y observación; el archivo debe vivir en un bucket privado. `app_memberships` vincula identidades autenticadas a rol operativo o conductor; `client_access` representa un acceso limitado a una sola entrega mediante un token aleatorio cuyo hash se guarda en servidor. Los nombres y reglas se deben contrastar con los datos reales.

Permisos previstos: operaciones crea y asigna viajes y entregas, consulta todos los registros y corrige con auditoría; conductor solo ve viajes asignados, registra eventos y confirma sus entregas; cliente solo consulta estados y soporte de su entrega mediante enlace limitado. Ningún documento se servirá desde bucket público. La consulta de cliente requiere una API de servidor que valide token, caducidad y alcance; nunca se enviará la clave de servicio al navegador. Los detalles de Auth, RLS, grants y Storage están pendientes de revisión y aprobación antes de cualquier aplicación.

## Migración propuesta

1. Identificar los Excel/Sheets canónicos y sus propietarios, columnas, fórmulas, catálogos, zona horaria, valores vacíos, identificadores y reglas de negocio. Inventariar también adjuntos y permisos. Conservar exportación y conteos de origen en ubicación privada, sin poner datos reales en Git.
2. Definir mapeo por columna y claves de origen inmutables (`source_system`, `source_id`). Separar filas rechazadas y duplicados. Ejecutar primero una transformación de lectura a staging local con datos anonimizados.
3. Conciliar por fuente y fecha: número de viajes, entregas, estados, asignaciones, documentos y suma de registros rechazados; muestrear casos límite con operaciones. Repetir importación de prueba y verificar que las claves de origen evitan duplicados.
4. Tras aprobación agrupada del diseño, respaldar y aplicar migraciones, políticas y bucket privado; importar en lotes idempotentes; comparar nuevamente conteos y muestras. Mantener las hojas activas durante validación paralela y definir corte y reversión por escrito.

## Primer incremento implementado

`index.html`, `styles.css` y `app.js` implementan creación/lista local de viajes, búsqueda de entregas, novedad, confirmación con foto local y vista de cliente limitada a la entrega confirmada/seleccionada. El botón de restablecimiento recupera los fixtures. No existe autenticación, enlace real, persistencia ni envío. La vista de cliente es una simulación dentro de la misma pestaña: **no constituye control de acceso**. Antes de producción hacen falta API, Auth, políticas RLS, validación de transiciones, bucket privado, tratamiento de imágenes y auditoría.

El validador `import_preview.py` solo cuenta filas de un CSV previamente mapeado; no importa datos. La integración real se habilitará después de obtener las hojas, aprobar mapeo y permisos, y aplicar la infraestructura. La propuesta de SQL en `schema.draft.sql` es solo para revisión: no es una migración ejecutable ni se ha aplicado.

Pruebas locales: `python3 -m unittest discover -s tests -v`; el flujo de navegador está en `tests/browser.test.cjs` y requiere Chromium y Playwright disponibles en el entorno de desarrollo. Cubre navegación móvil/escritorio, validación, búsqueda sin resultados, confirmación local, acción repetida, alcance de la vista cliente, viaje vacío, novedad y restablecimiento. Las capturas de QA se escriben en `/tmp/incargo-mobile-qa.png` y `/tmp/incargo-desktop-qa.png`.

Decisiones necesarias: fuente canónica de viajes y entregas; significado y transiciones de los estados; qué identifica inequívocamente una entrega; qué puede ver el cliente en el soporte; método de acceso de conductores y plazo del enlace del cliente; política de despliegue y push para este repositorio.

## Integración autorizada, estado 13 octubre 2026

La conciliación detallada de las pestañas heredadas está en `legacy-mapping.md`; matriz de permisos, evidencia de pruebas y primer operador en `validation-and-handoff.md`.

El proyecto Supabase Incargo `gmjsqboyuvierfwruspv` contiene las migraciones `incargo_operations_v1`, `incargo_permissions_fix`, `incargo_hardening` e `incargo_anon_revoke`, en ese orden. Los SQL locales correspondientes son `migration.sql`, `migration_permissions_fix.sql`, `migration_hardening.sql` y `migration_anon_revoke.sql`. Hay cinco tablas públicas vacías con RLS, una tabla privada de enlaces y un bucket privado `incargo-proofs` limitado a PNG/JPEG/WebP de 10 MB. La función Edge `incargo-tracking` recibe un token aleatorio por POST, verifica vigencia y revocación, y entrega solo estado, eventos y un enlace de soporte de 60 segundos. El token no se coloca en la URL de solicitud al servidor; la página usa el fragmento `#token=`.

La interfaz conectada usa inicio de sesión por contraseña de Supabase para cuentas existentes. No ofrece registro ni envía correos. **No hay usuarios Auth en el proyecto al momento de la comprobación**, por lo que todavía no se puede probar un flujo productivo autenticado ni operar la app. El alta de cuentas y asignación de roles requiere un procedimiento autorizado; nunca se inserta automáticamente una membresía de operaciones. Las pruebas de interfaz usan respuestas simuladas, no registros productivos.

Seguridad: operaciones puede crear viajes, asignar conductores que ya tengan rol `driver`, crear entregas y administrar enlaces. El conductor solo lee viajes asignados y registra novedades o confirmaciones mediante RPC que verifica asignación y bloquea la fila. No se permite cambiar el estado directamente por REST. Las fotos se suben al bucket privado bajo el ID de la entrega; la confirmación comprueba propietario del objeto. El cliente recibe por función Edge los datos mínimos de su entrega y un URL temporal para el soporte; los tokens son aleatorios, se guardan solo como hash, vencen y pueden revocarse.

Limitaciones de verificación: con cero usuarios y cero entregas no se pudo realizar una prueba real de RLS con conductor asignado, enlace válido ni carga de soporte de punta a punta. El asesor de seguridad todavía muestra una advertencia para funciones `SECURITY DEFINER` ejecutables por `authenticated`: es intencional para los RPC de operaciones/conductor, y cada uno comprueba rol o asignación; la función de lectura de enlace solo admite `service_role`. Una advertencia adicional sobre `rls_auto_enable` pertenece a infraestructura Supabase ajena a Incargo.

Reversión no destructiva: ante un problema, retirar las rutas nuevas del despliegue o deshabilitar sus enlaces de navegación, revocar enlaces activos y retirar acceso a los RPC nuevos; conservar las tablas, el bucket privado y los registros para análisis. No borrar hojas originales. No aplicar `DROP TABLE` ni eliminar soportes como parte de una reversión automática.

La hoja identificada en Drive es **Inspecciones Incargo** (zona horaria America/Bogota), con pestañas `INSPECCIONES` y `VINCULACIONES`. La primera contiene registros desde la primera fila, no una tabla de viajes; la segunda tiene encabezados de vinculación. El Apps Script local apunta a esas pestañas. Se comprobó una fila mínima para verificar estructura, sin copiar contenido personal al repositorio; no se importó historial. Para importar viajes/entregas hace falta una fuente canónica distinta y un mapeo verificado, con conciliación previa y posterior.
