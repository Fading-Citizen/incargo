# Contratos empresariales propuestos — NO aplicados a producción

Se prueban exclusivamente en Postgres 17 desechable. No hay fixtures productivos, cambios de credenciales ni habilitación automática de usuarios.

Orden de revisión:
1. `enterprise-model.proposal.sql`: tablas nuevas en esquema cerrado, RLS activa, sin permisos de aplicación. Cotización, aceptación, pedido independiente del viaje, enlace a entregas, factura administrativa, recibos, aplicaciones, reversos, idempotencia y auditoría.
2. `enterprise-lifecycle.proposal.sql`: revisiones inmutables de cotización, cancelación sólo antes de ejecución/facturación y notas administrativas sin efectos monetarios. Se carga antes de ejecutar los contratos base, que usan estas columnas.
3. `enterprise-read.proposal.sql`: consultas de pedidos, factura/detalle y saldo con comprobación de identidad/rol.
4. `enterprise-activation.proposal.sql`, `enterprise-receipts.proposal.sql` y `lifecycle-activation.proposal.sql`: **activación propuesta que requiere aprobación específica**. Nuevos RPC comerciales para el rol existente operations; los RPC financieros requieren además inscripción explícita en `finance_operators`. No se inscribe ningún usuario. Anon/cliente/conductor no tienen esos accesos. Helpers y tablas permanecen inaccesibles directamente.

5. `resources-model.proposal.sql`: modelo cerrado de proveedores/costos/flota/procedencia. Debe cargarse antes de ejecutar cancelaciones, para comprobar también los costos atribuidos. No concede acceso ni ofrece mutaciones de aplicación. Cualquier futura escritura de costos de pedido deberá bloquear la fila de pedido y rechazar cancelados, igual que enlaces y facturas. Las reglas de aprobación/corrección de costos siguen pendientes.

El orden exacto reproducible se mantiene en `run-local-tests.sh`; las pruebas no convierten estas propuestas en migraciones productivas.

## Decisiones pendientes de Lenu

- Sistema emisor y alcance administrativo frente a integración fiscal: sólo se registra un documento ya emitido y sus importes, no se calcula normativa ni se emite/cobra.
- Responsables financieros concretos: no inferir que todo operations puede facturar o registrar abonos. Identidades a resolver antes de una activación, nunca crear accesos por nombre.
- Cardinalidad de pedido/entregas: la propuesta soporta división en varias entregas con vínculo explícito; no activa ese proceso ni altera deliveries.trip_id. La relación factura-servicio también debe revisarse contra el proceso de Incargo.
- Cambios posteriores de cuenta de una entrega vinculada: definir si se bloquean o se resuelven con una desvinculación auditada antes de activar el contrato. No se añadió un trigger que altere silenciosamente el flujo actual.

## Controles implementados y límites

- Importes `numeric(14,2)`, sin conversión de monedas ni impuestos automáticos. Límite técnico de 999.999.999.999,99 por documento/recibo; cantidades hasta tres decimales y precio/impuesto explícitos hasta dos. Cualquier ampliación debe conservar precisión en JSON/UI.
- La cotización aceptada crea exactamente un pedido; no exige un viaje y no modifica entregas históricas.
- Vínculo de entrega exige cuenta comercial igual al pedido. La reasignación posterior requiere la decisión indicada arriba.
- No se editan facturas registradas. El número externo es único por emisor; correcciones comerciales/fiscales y notas crédito requieren diseño posterior y no se sustituyen por borrado.
- Un recibo registra un hecho informado con soporte; no mueve dinero. Aplicación comprueba cuenta, moneda y saldos con bloqueos transaccionales. Reverso conserva fila, actor y motivo.
- Idempotencia por UUID, actor, acción y payload exacto; el mismo intento no duplica datos y un payload distinto produce conflicto.
- Una revisión crea un nuevo registro enlazado, conserva el anterior, bloquea bifurcaciones/aceptaciones obsoletas y no cambia de cuenta. Una versión aceptada permanece inmutable.
- Sólo se propone cancelar pedidos sin entregas, facturas ni costos. La cancelación deja autor/fecha/motivo, sale del Kanban activo y bloquea enlaces posteriores. Cancelación, vínculo y facturación bloquean la misma fila del pedido; no se ejecutan reembolsos, penalizaciones ni reversos de ejecución.
- Notas administrativas son observaciones con soporte, no notas crédito/débito. No cambian saldo; no tienen operación de borrar/editar. Corregir una observación requiere otra nota que aclare la anterior. Las notas financieras mantienen el requisito de finanzas.
- `resources-model.proposal.sql` es un diseño cerrado de proveedores, costos, vehículos y procedencia documental. No agrega RPC ni grants. Costos con moneda/monto explícitos y una única atribución, sin tarifas/impuestos/pagos ni reparto inferido. Las pruebas de restricciones se revierten al finalizar.
- Cancelación con ejecución o factura, notas crédito/débito, aprobaciones/correcciones/reparto de costos, catálogo verificado de flota y migración de procesos externos permanecen abiertos. Ver `../audit/external-process-transition.md`.

## Prueba reproducible

Con dependencias de `panel` instaladas y assets compilados:

```sh
bash panel/database/run-local-tests.sh
```

El script usa únicamente el socket Docker local, crea y elimina su contenedor. Rechaza reemplazar un contenedor existente. Prueba permisos, duplicados, saldos, reversos, concurrencia y navegador conectado a Postgres local mediante un adaptador de prueba, incluyendo recarga de página. No es un servidor incluido en producción ni una simulación de persistencia del navegador.
