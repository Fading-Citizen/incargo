# Incargo: capacidades y corrección de identificación de entregas

Revisión del 17 de octubre de 2026, base main 98db6822a510287f5857cf30812d8fdbe6a997e9. Árbol limpio al iniciar; GitHub sin PR abiertos al consultar. No se encontró AGENTS.md en raíz del repo ni sus directorios padre consultados.

## Diagnóstico

No se puede declarar la plataforma completa ni equivalente a la referencia. Library resolvió libfile_c74cb91021848191842c0f00a3d4f6f4 como image(20261013-190623).png, 1729339 bytes, versión 0. El helper oficial descargó pero falló en os.setxattr, no disponible en Windows. No se alteró el helper ni se omitieron metadatos. No se obtuvo archivo final materializado y no se inspeccionaron los píxeles. La descripción histórica en README no sustituye esa inspección.

| Capacidad | Implementado en código | Verificación y límite |
| --- | --- | --- |
| Operaciones | Crear viajes/entregas, asignar conductor, enlaces limitados y cuentas comerciales | Fixtures locales; sin operación productiva en esta revisión |
| Conductor | Viajes asignados, búsqueda, novedades, confirmación con receptor/foto/observación | Destino/remesa/viaje se consultaban pero no se mostraban. Corregido en tarjetas y selección |
| Cliente autenticado | Identidad comercial, lista paginada, actualización, hitos, estados de error y sesión | Pruebas aisladas; no demuestra acceso productivo A/B ni soporte en este portal |
| Seguimiento por enlace | Una entrega, eventos y soporte temporal mediante Edge | Ruta separada del portal de cuenta; no equivale a lista de envíos |
| Roles y perfil | Contextos cliente/operaciones por pestaña; operaciones o conductor según membresía verificada | Una persona puede tener contexto cliente y operativo; no se infiere acceso a empresas por nombre/correo |
| Estado En ruta | Etiqueta y valor de esquema existen | No se encontró acción de UI ni RPC de transición en las migraciones revisadas; falta cerrar el flujo auditado antes de prometer seguimiento completo |
| Excel/Sheets | Validadores y propuestas; inspecciones/vinculaciones siguen en Apps Script | No hay evidencia de conciliación/importación completa de histórico ni fuente canónica de viajes confirmada |
| Móvil | Web responsive | QA aislada conductor a ancho DOM 355 px y operaciones a 1745 px, sin overflow; no app nativa ni prueba offline |

Fuente de verdad prevista: operaciones escribe viajes/entregas en Supabase; conductor registra eventos/soporte mediante RPC; cliente lee solo relaciones comerciales verificadas mediante RPC, y el enlace limitado usa Edge. Las hojas heredadas siguen siendo otro flujo. No se consultó ni modificó la DB remota en esta revisión.

## Cambio y evidencia

Destino, remesa y viaje aparecen ahora en tarjetas operativas, tarjetas del conductor y entrega seleccionada. Búsqueda por remesa y destino, campos faltantes explícitos, texto renderizado con textContent, ajuste de líneas largas. El portal cliente no recibe campos adicionales y las consultas/permisos no cambian.

51/51 pruebas Node (sesión, refresh cliente, integración, UTF-8), 3/3 Python, node --check y git diff --check. Cuatro pruebas nuevas cubren ambos roles, empresas sintéticas A/B, cambio de cuenta, datos faltantes, búsqueda, selección repetida, recarga y fallo de red. No son pruebas del aislamiento RLS remoto. No hay build, tipos o lint declarados para esta web estática.

QA con navegador real y fixture local de CSP connect-src none: tarjetas, búsqueda por REM-A, selección y recarga. Sin errores de consola capturados; sesiones reales preservadas. Capturas internas: C:/Users/PC/Documents/Codex/2026-10-17/task-2/operations-qa.png y driver-mobile-qa.png. La captura fullPage agotó tiempo; se guardaron capturas de viewport.

## Pendientes concretos

1. Recuperar referencia con metadatos en un entorno compatible y contrastar píxeles.
2. Diseñar transición En ruta con validación de asignación y evento idempotente; su aplicación requiere autorización específica de DB/migración.
3. Resolver reintentos de confirmación: el código actual genera IDs nuevos por envío y puede dejar foto huérfana tras fallo de RPC; además revisar cambio de selección durante subida.
4. Confirmar fuente canónica, mapeo, conciliación y corte de Excel/Sheets; no migrar por nombre ni inferir empresa.
5. E2E autenticado cliente/operaciones/conductor con fixture acordada, soporte, revocación y dos cuentas/empresas. No se crearon usuarios, envíos, correos ni datos reales.
