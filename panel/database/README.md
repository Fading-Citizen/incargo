# Contratos empresariales propuestos — NO aplicados a producción

Se prueban exclusivamente en Postgres 17 desechable. No hay fixtures productivos, cambios de credenciales ni habilitación automática de usuarios.

Orden de revisión:
1. `enterprise-model.proposal.sql`: tablas nuevas en esquema cerrado, RLS activa, sin permisos de aplicación. Cotización, aceptación, pedido independiente del viaje, enlace a entregas, factura administrativa, recibos, aplicaciones, reversos, idempotencia y auditoría.
2. `enterprise-read.proposal.sql`: consultas de pedidos, factura/detalle y saldo con comprobación de identidad/rol.
3. `enterprise-activation.proposal.sql` y `enterprise-receipts.proposal.sql`: **activación propuesta que requiere aprobación específica**. Nuevos RPC comerciales para el rol existente operations; los RPC financieros requieren además inscripción explícita en `finance_operators`. No se inscribe ningún usuario. Anon/cliente/conductor no tienen esos accesos. Helpers y tablas permanecen inaccesibles directamente.

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
- Cotizaciones versionadas/editables, cancelaciones de pedidos, notas/créditos, costos, flota y procesos Apps Script/Formspree siguen siendo brechas del programa completo. No se presentan como resueltas por este núcleo.

## Prueba reproducible

Con dependencias de `panel` instaladas y assets compilados:

```sh
bash panel/database/run-local-tests.sh
```

El script usa únicamente el socket Docker local, crea y elimina su contenedor. Rechaza reemplazar un contenedor existente. Prueba permisos, duplicados, saldos, reversos, concurrencia y navegador conectado a Postgres local mediante un adaptador de prueba, incluyendo recarga de página. No es un servidor incluido en producción ni una simulación de persistencia del navegador.
