# Validación de paridad legacy — 2026-11-03

Inventario y límites: [legacy-admin-parity.md](../audit/legacy-admin-parity.md).

## Resultados

- `npm run typecheck --prefix panel`: PASS.
- `npm run lint --prefix panel`: PASS.
- `npm test --prefix panel`: 25/25 PASS. Fechas Bogotá, datos ambiguos, clasificación desconocida, filtros, evidencias, CSV, escape de impresión, propuestas sin mutación, configuración cerrada, roles, usuarios no autorizados, redirects, límites y errores del proveedor.
- `npm run build --prefix panel`: PASS; assets regenerados.
- `npm run test:browser --prefix panel`: PASS. Fuente deshabilitada → consulta, filtro → detalle → propuesta descargada/cancelada, regreso preservando filtros, CSV filtrado, navegación a vinculaciones, impresión de copia sin contrato inferido, errores, vacío, 403 y conductor rechazado antes de petición. Incluye regresiones anteriores y bloqueo financiero.
- `npm run test:public --prefix panel`: PASS; no cambio en seguimiento público.
- `node --test incargo-app/tests/session-integration.test.cjs incargo-app/tests/tab-session.test.cjs incargo-app/tests/confirmation-retry.test.cjs`: 57/57 PASS. Incluye respuestas tardías del nuevo adaptador tras salir y entrar con otro usuario, rechazo a conductor y respuesta inválida distinta de vacío.
- `python -B -m unittest discover -s incargo-app/tests -p 'test_legacy*.py' -v`: 28/28 PASS; transformadores de staging conservados, sin importación real.
- `bash panel/database/run-legacy-tests.sh`: PASS en contenedor PostgreSQL 17 descartable. Verifica RLS y permisos cerrados, ACL por documento, rol, revocación, original e historial inmutables, acuse repetido, conflicto de revisión y de petición. Dos correcciones concurrentes con la misma revisión producen una sola ganadora; dos reintentos simultáneos crean una sola revisión.
- `node --check` en el API nuevo y el puente de operaciones, `git diff --check`: PASS.

## Evidencia y alcance

Capturas [escritorio](legacy-inspections-desktop.png) y [móvil](legacy-inspections-mobile.png) revisadas visualmente; viewport 1440×1000 / 390×844, sin desbordamiento horizontal móvil. Datos sintéticos; el texto con etiquetas HTML es un caso de escape y aparece como texto, no como script ejecutado. No representan datos reales.

La lectura real del Apps Script solo valida conteos/forma/huellas de respuesta del inventario; no valida permiso de usuario del módulo nuevo ni conciliación con Google Sheets. Metadatos y advisors de Supabase se consultaron solo en lectura. No se crearon usuarios, permisos, tablas, políticas ni registros en producción. No se mandaron escrituras a Apps Script ni formularios públicos.

No hay sesión real del usuario disponible. Las pruebas de roles son locales/interceptadas y PostgreSQL aislado; no acreditan QA autenticado en producción. El API de lectura queda deshabilitado por defecto. El guardado del panel no está conectado a la propuesta SQL. La exportación de una propuesta no se muestra como guardado. Contratos históricos y certificados con firma permanecen pendientes de decisiones explícitas.

El admin legacy sigue idéntico por hash. No se inspeccionó ni modificó la instalación excluida. Sin cambios financieros, importación de datos, push, despliegue ni publicación de este nuevo alcance.
