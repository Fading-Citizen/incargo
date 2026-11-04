# Importación real verificada — 2026-11-04

Este informe reemplaza el estado pendiente del corte del 3 de noviembre. La solicitud histórica de la herramienta no acreditaba un bloqueo vigente. El mismo conector aceptó las migraciones complementarias y los doce lotes; no se utilizó otra ruta para eludir permisos.

## Datos guardados en Supabase real

Proyecto `gmjsqboyuvierfwruspv`, esquema privado `incargo_admin`.

| Tipo | Registros | Verificados por hash y payload | Coinciden con snapshot | Marcados `[TRUNC]` |
| --- | ---: | ---: | ---: | ---: |
| Inspecciones | 27 | 27 | 27 | 8 |
| Vinculaciones | 8 | 8 | 8 | 0 |

Dos snapshots completos preservados:

- Inspecciones: 1.311.229 bytes, SHA-256 `5ee3cb30e5f7f96e7a9ee341c8f9172d9a40d44125c6212689cb2eead6c3b227`.
- Vinculaciones: 114.931 bytes, SHA-256 `082e05096ca50118c39f67d7de77255c107a87cebf97dfc9ee36412a5e10aadf`.

Hashes del conjunto ordenado de hashes de registros:

- Inspecciones: `86e3fa43289660b61ecf37ccb42a8c6ce5ced28f5132a31c3c1b7479e77e3717`.
- Vinculaciones: `8fca8fdbaed4aaf8a5fa10c41659ac36d0eb904c94b5c139a325dee08c031d93`.

Los GET actuales coincidieron con la copia anterior. El runtime JavaScript y el importador Python produjeron las mismas identidades. Las consultas posteriores a la importación verificaron todos los originales contra los elementos del snapshot, las huellas y los payloads. No hay revisiones de negocio creadas durante la importación. No se guardaron datos personales en Git.

## Permisos y activación

Aplicadas las migraciones `legacy_operations_versions`, `legacy_snapshot_parts` y `legacy_revision_export`. Todas las tablas privadas tienen RLS. `authenticated` carece de acceso directo a ellas; `anon` no puede ejecutar las tres RPC. Las RPC autenticadas comprueban el membership vigente `operations`, incluidos futuros miembros, sin lista fija de UUID. Las dos memberships existentes no se cambiaron.

`INCARGO_LEGACY_READ_ENABLED=true` se configuró para production/preview en el proyecto Vercel Incargo, después de verificar la importación. La integración del PR #5 despliega esta configuración; su resultado exacto debe comprobarse en Vercel y en el commit de main. No se crea sesión de usuario ni se atribuye QA autenticado a pruebas locales.

## Pruebas y límites

En esta reanudación: TypeScript y 29 pruebas de panel/API PASS; identidades de los 35 registros comprobadas contra JavaScript; conciliación real y permisos en Supabase PASS. Las pruebas anteriores de navegador, sesión, concurrencia y reintentos están documentadas en `legacy-admin-validation.md` y usan fixtures cuando así se indica.

El legacy respondió HTTP 200 y conserva SHA-256 `fd6b9f2dd954d666c211801652581abf4e8dc38669d693f7a4fb2af580dbefd7`, igual al repositorio. No se borró ni modificó. Se migraron los datos expuestos por ambos endpoints, no se afirma haber recuperado originales omitidos por Google Sheets o imágenes que ya llegaban con `[TRUNC]`. Ese marcador se conserva literalmente y no prueba pérdida irreversible.

La sincronización administrativa inicial queda reemplazada por la sincronización automática documentada en [legacy-sync-20261104.md](legacy-sync-20261104.md). No hay doble escritura a Apps Script. La emisión con firma exige firmante y condiciones autorizadas; el contrato histórico requiere su documento por versión. Facturación permanece deshabilitada y la instalación excluida no se inspeccionó ni modificó.
