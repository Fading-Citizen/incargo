# Validación de paridad legacy — 2026-11-03

**Actualización 2026-11-04:** la importación real de 27 inspecciones y 8 vinculaciones está completada y verificada. Consulta [evidencia actual](../qa/legacy-import-20261104.md). Las referencias a aprobación/importación pendientes que siguen describen el corte histórico del 3 de noviembre.
Inventario completo y estado real: [legacy-admin-parity.md](../audit/legacy-admin-parity.md).

## Pruebas

- TypeScript, ESLint, build, `node --check` de API/puente y `git diff --check`: PASS.
- `npm test --prefix panel`: 29/29 PASS. Incluye rol vigente sin lista de UUID, clientes/conductores excluidos, originales no inventables desde el navegador, procedencia, cambios del origen, errores, límites, CSV y firmas incompletas.
- Suites Node de sesión, pestañas y reintentos: 59/59 PASS. Respuestas tardías de consulta, guardado e historial descartadas al cambiar de usuario.
- Transformadores/importador Python: 32/32 PASS. Incluye rechazos de identidad numérica ambigua, duplicados y preservación literal/SQL seguro.
- `bash panel/database/run-legacy-tests.sh`: PASS en PostgreSQL 17 descartable. Operaciones actual y futuro, clientes/conductores denegados, rol revocado, acceso directo a tablas denegado, aceptación contractual protegida, originales inmutables, recibos, conflicto de revisión/petición, reintentos simultáneos y revocación mientras una escritura espera un bloqueo.
- Navegador local: PASS. Consulta/filtros/detalle, preparación de corrección, respuesta perdida, mismo intento congelado y reintentado, recibo confirmado, historial y descarga individual de versión, regreso conservando filtros, CSV/PDF, vinculaciones, errores/vacío/403, móvil y aislamiento del conductor. Fixtures sintéticos, no datos reales.
- Seguimiento público: PASS; mantiene validación, actualización, revocación y navegación pública.

## Integridad del origen real en una base LOCAL descartable

GET completos: 27 inspecciones / 8 vinculaciones; 1.311.229 / 114.931 bytes. Se archivaron snapshots y originales dos veces sin duplicados, con 0 revisiones. Todos los payloads y hashes coincidieron. Identidades calculadas por Python se contrastaron con `JSON.stringify` del runtime. Esto valida el procedimiento y la respuesta recibida, NO una importación en producción ni la autenticidad de evidencias.

`validate-legacy-import.sh` acepta un directorio privado preparado por `prepare-legacy-import.py`; los archivos SQL contienen datos personales y se mantienen fuera de Git. El manifiesto no sensible contiene conteos y hashes. La importación reanudable usa partes inmutables y comprueba el hash de la respuesta completa reconstruida, sin truncar.

## Estado de Supabase real y publicación

La migración `legacy_operations_versions` se aplicó. Después, el intento de importación completo devolvió `Request body is too large`; verificación posterior: 0 documentos, 0 snapshots, 0 revisiones. Se mostró solicitud pendiente de aprobación para `supabase.execute_sql`. Se detuvo la importación; no se intenta otra conexión para eludirla.

Migraciones de partes y exportación individual preparadas, aún no aplicadas. No se cambiaron memberships ni credenciales. La rama puede publicarse con el módulo cerrado por defecto; no se activa producción hasta importar y verificar. No hay sesión real del usuario para QA autenticado. No se crean usuarios, se introducen contraseñas ni se elude el error de certificado del navegador.

## Evidencia visual y límites

Capturas [escritorio](legacy-inspections-desktop.png) y [móvil](legacy-inspections-mobile.png), datos sintéticos. Vista 1440×1000 / 390×844, móvil sin desbordamiento horizontal. Las etiquetas HTML del caso de prueba se muestran como texto.

El legacy permanece sin cambios. `[TRUNC]` existe en 8 registros del proveedor; no es truncamiento de herramienta ni prueba de pérdida irreversible. Se conserva literalmente. Certificados firmados requieren firmante/condiciones autorizados; contratos históricos requieren documento por versión. No se inventan firmas, consentimiento ni métricas. Facturación sigue deshabilitada; no se inspeccionó ni modificó la instalación excluida.
