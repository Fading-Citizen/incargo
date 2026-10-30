# Incargo — núcleo empresarial en revisión

Este trabajo **no declara completo el sistema de la empresa**. Corrige la entrega `f47aeae`, que sólo añadía primitivas y consultas sobre formularios legacy. El alcance y las brechas están en [la auditoría del sistema](audit/2026-10-30-system-gap-matrix.md).

## Estado por lote

| Área | Implementado | Activación |
| --- | --- | --- |
| Shell y navegación | Espacio único por módulos, marca Incargo, eliminación de doble menú/hero y corrección del modo oscuro del sistema | Código de esta rama |
| Kanban de envíos | Estados reales, búsqueda, filtro por viaje, ordenación por columna, límite de tarjetas, acción/drag con confirmación para salida autorizada | Usa RPC actuales; no amplía estados |
| Viajes / entregas | Formularios React directos, asignación, validaciones y UUID estable por intento de creación | API limitada sobre request/revalidación existentes |
| Expediente | Recorrido/carga, eventos, prueba privada autenticada, crear/revocar enlace limitado | Contratos actuales; sin enviar mensajes |
| Clientes | Cuentas canónicas, crear/vincular/revocar, solicitudes y aprobación verificada | RPC actuales; no agrupa nombres como identidad |
| Cotizaciones / pedidos | Líneas explícitas, revisiones inmutables, aceptación de versión vigente, pedido antes del viaje, Kanban derivado y cancelación documentada sólo sin ejecución/facturación/costos | UI y PostgreSQL local probados; contratos propuestos **no activados en producción** |
| Facturación / cartera | Registro de documentos externos, conceptos, cuenta/moneda, abonos, aplicación parcial, saldo y reverso auditado | UI y PostgreSQL local probados; permisos financieros pendientes de aprobación |
| Fiscal / proveedores | Sin emisión electrónica, cobro ni conexión a proveedor | Decisión del sistema emisor pendiente |
| Notas administrativas | Observaciones append-only con autor y soporte en expediente de pedido/factura; no cambian saldos | Contrato y UI probados sólo en entorno aislado |
| Vehículos / conductores | Consulta de asignaciones sobre viajes y accesos existentes, filtro por placa/ruta/conductor | Sin catálogo, disponibilidad ni cumplimiento inferidos |
| Costos / proveedores / catálogo flota / documentos externos | Modelo cerrado con atribución de costo, precisión monetaria y procedencia de evidencia | Sin RPC/grants ni operación activada |
| Cancelación con ejecución, notas crédito/débito y procesos Apps Script/Formspree | Documentados con restricciones y plan de transición | Requieren definición de proceso; no se presentan como resueltos |

## Arquitectura y protección de lo existente

`operaciones.html` conserva la sesión y el acceso del conductor. Los módulos React operativos usan `IncargoOperations`, una interfaz limitada que no expone tokens ni request genérico: cada operación conserva la revalidación del rol en servidor y RLS. Se eliminó `go()` y los clicks sintéticos como integración funcional. El DOM legacy se conserva como compatibilidad cuando la mejora no carga; sus formularios no son el backend del panel nuevo.

Cliente, activación, seguimiento y landing mantienen sus rutas y archivos. No se cambia la raíz de Vercel ni se configura hosting. El panel usa componentes React extraídos/adaptados de la fuente Next; no se confunde un cambio de framework con el desarrollo de entidades y contratos.

Los módulos comerciales/financieros sólo aparecen cuando el servidor devuelve capacidades habilitadas. Un RPC aún no instalado no se sustituye por fixtures o almacenamiento del navegador. La consulta financiera además requiere autorización específica; operaciones no implica finanzas.

## Fuente Xtreme

Fuente sólo lectura: `EFO-Latam/xtmpanel`, main `564ded98c7b447d5a50b1554616efebb79dee277`.

- `PanelPrimitives.tsx`, `PanelNavigationIcon.tsx`, iconos y `panel-design.css`: fuente original, rutas adaptadas y fondo neural decorativo retirado.
- `KanbanSortControl.tsx`: componente original con teclado, focus, menú y cierre exterior; textos y opciones de transporte.
- `ShipmentKanban.tsx`: composición de columna/card, DnD, ordenación y soft cap de `components/lab/KanbanBoard.tsx`, adaptadas a `Delivery` y a transiciones autorizadas de Incargo. No usa acciones demo ni permisos de laboratorio.
- `Finance.tsx`: composición lista/detalle/conceptos de `facturacion/page.tsx` y `[id]/Detail.tsx`, con contratos administrativos propios. Sin `demo/finance`, CUFE, Odoo o validación fiscal simulados.
- Identidad: logo existente `img/Logo.png`; tokens verificados `#d5a817`, `#142927`, `#f5f4ee`.

## Contratos nuevos y decisiones pendientes

[Diseño, SQL propuesto y controles](database/README.md). Los scripts `.proposal.sql` no son migraciones ejecutadas. Ningún permiso o usuario financiero se habilitó en Supabase real.

Pendientes ya consultados: sistema actual de facturación, responsables autorizados y cardinalidad pedido–entregas/viajes. La transición de procesos externos está en [el inventario de contratos y plan de conciliación](audit/external-process-transition.md). También se documenta el efecto de una reasignación posterior de cuenta y las limitaciones del primer núcleo financiero. Una revisión explícita de estos contratos precede a su activación.

## Desarrollo y pruebas

```sh
cd panel
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
npm run test:database
```

Los assets versionados en `logistica-1.0.0/panel-assets/` preservan el despliegue estático. Las pruebas de navegador usan datos interceptados o PostgreSQL local, nunca empresas ni envíos reales.

Validación del lote:

- TypeScript, lint y build correctos; pruebas de agregación, ordenación, movimientos y precisión monetaria.
- Suite existente: 148 correctas y cuatro omitidas por requerir setup Postgres propio. Dos tests antiguos del portal cliente, `client-ui.test.cjs` y `client-ui-races.test.cjs`, ya fallaban en main limpio y se documentaron en la entrega anterior; archivos del portal sin cambios.
- Navegador operativo: Kanban y confirmación, cuentas canónicas, formularios directos, expediente, recuperación de carga, contraste con modo oscuro, móvil, cierre y separación del conductor.
- PostgreSQL local: pedido sin viaje, idempotencia/conflictos, denegación de cliente/conductor y operations sin finanzas, total de documento, saldos, reversos, monedas/cuentas distintas y tablas cerradas.
- Concurrencia: dos abonos simultáneos no sobreaplican una factura; reintento simultáneo devuelve el mismo ID.
- Navegador conectado a PostgreSQL local: cotización → aceptación → pedido y factura → abono → aplicación → recarga con saldo persistido → reverso auditado. Esto no equivale todavía al recorrido completo de todos los módulos de la empresa.

Capturas bajo `qa/enterprise-*` y `qa/business-*` usan exclusivamente fixtures locales. La captura aportada por Lenu se inspeccionó por separado y no se copió al repositorio.

## Segundo lote aislado

La prueba de navegador ahora cubre revisión → aceptación de versión vigente → nota → cancelación previa a despacho → recarga. Pruebas transaccionales comprueban que dos revisiones no bifurcan una cotización, revisión y aceptación no coexisten, y cancelación y factura no pueden confirmar simultáneamente. El núcleo financiero anterior mantiene pruebas de saldos y reversos. Se verifica que notas de factura requieren finanzas y no alteran importes.

Las tablas propuestas de recursos permanecen cerradas incluso después de activar los otros contratos en el entorno de prueba. No hay catálogo de vehículos importado, pagos a proveedores, documentos fiscales ni integración productiva de fuentes externas.
