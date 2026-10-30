# Auditoría del sistema Incargo — alcance empresarial

Base Incargo: `f47aeae9ed93a232afd0f9b09f2f27aee7823bd2`. Fuente Xtreme: `564ded98c7b447d5a50b1554616efebb79dee277`. Verificados contra main remoto. Esta auditoría corrige el alcance insuficiente de la entrega anterior; no afirma que el sistema esté completo.

## Evidencia revisada

- Captura aportada por Lenu, Library `libfile_6136098237b881918ea7ca50d75007cb`: bytes materializados y píxeles inspeccionados. Muestra cuatro vistas de consulta, jerarquía duplicada, demasiado espacio introductorio, sin Kanban ni facturación. Dos widgets adoptan estilos oscuros por preferencia del sistema y pierden coherencia/contraste: falta variante dark explícita al extraer CSS.
- Código: `panel/src/main.tsx`, scripts de operación/sesión/cliente, formularios públicos, migraciones históricas y tests.
- Esquema actual por consultas de metadatos, sin leer registros privados: ocho tablas públicas Incargo; entregas requieren `trip_id`; estados de entrega `pending`, `in_transit`, `exception`, `delivered`; no tablas de pedidos, cotizaciones, facturas, pagos, gastos, flota o tarifas.
- RLS actual: operaciones administra viajes/entregas; conductor lee asignaciones y confirma mediante RPC. Clientes reciben datos acotados por sus RPC. No existe perfil financiero verificado.
- Xtreme tiene Kanban, flujo de movimiento, filtros, ordenación, detalle fiscal y vistas de propuestas/compras/gerencia, pero la fuente usa adaptadores demo. Se reutiliza composición y comportamiento de UI, nunca su estado demo o permisos.

## Matriz de brechas

| Área / prioridad | Incargo actual | Reutilización Xtreme | Trabajo real necesario / criterio de aceptación |
| --- | --- | --- | --- |
| Pedidos activos / P0 | No existe pedido previo al viaje. Entrega exige viaje. | `lab/KanbanBoard`, `KanbanMovement`, `KanbanSortControl`, `KanbanToolbar` | Entidad pedido independiente, ligada explícitamente a cuenta y luego a entrega. Kanban con estados comerciales aprobados y progreso operativo derivado de entregas. No renombrar entrega como pedido. Crear, consultar, asignar y persistir tras recarga. |
| Operación / P0 | Viajes, entregas, salida e incidencias reales, UI legacy | Columnas, tarjetas, movimiento y detalle del Kanban | API tipada que conserva request/revalidación/RPC actuales; reemplazar `go()`/clickDOM por acciones del panel. Kanban de envíos con los cuatro estados actuales; sólo salida autorizada mueve pending→in_transit. Confirmación exige flujo del conductor y prueba. |
| Comercial/cotización / P0 | `quote.html` envía Formspree; sin expediente interno | Propuestas y cotizador / detalle de líneas | Cotización persistente con cliente, origen/destino, carga, conceptos, moneda e importes introducidos por personal. Versiones y aceptación verificable antes de generar pedido. No inventar tarifa/impuesto o consumir Formspree privado. |
| Facturación administrativa / P0 | `invoice_reference` es texto, no factura ni saldo | `facturacion/page.tsx`, `[id]/Detail.tsx`, `FiscalNavigation` | Cabecera, líneas, relación a pedidos/entregas, moneda, fechas, referencia externa, total y saldo persistentes. Diferenciar borrador interno de documento emitido fuera del panel. Control concurrente, trazabilidad y permisos financieros antes de activar escrituras. |
| Emisión electrónica / dependencia explícita | Proveedor y proceso no establecidos | Separación estados contable/fiscal/pago de Xtreme | Identificar sistema actual, integración autorizada, numeración, impuestos y requisitos. No enviar a proveedor ni atribuir validez fiscal al registro administrativo. |
| Cartera/pagos / P0-P1 | Sin tablas de abonos ni conciliación | Gerencial/caja y detalle fiscal | Abonos registrados con soporte/referencia, sin ejecutar cobros. Saldo por moneda calculado desde registros confirmados; reversos auditados; impedir doble registro y sobreaplicación. Requiere responsables autorizados. |
| Clientes / P0 | Cuentas y vínculos reales por UUID; tablero agrupa nombres | Gestión comercial y ficha cliente | Usar cuentas reales como identidad, no inferir vínculos por nombre. Ficha con pedidos/cotizaciones/facturas, conservar solicitudes y vinculación. Datos fiscales sólo según necesidad del proceso aprobado. |
| Viajes/flota/conductores / P1 | Placa y UUID de conductor en viaje; no catálogo flota | Asignación y panel de recursos | UI directa de viaje y asignación ya posible. Catálogo flota/conductores y disponibilidad necesita entidades, identidad y permisos; no GPS ni disponibilidad deducida de ausencia de datos. |
| Seguimiento/incidencias / P0 | Eventos y RPC de novedades/salida/confirmación | Detalle y timeline de orden | Panel puede consultar eventos autorizados y comprobantes existentes. Mantener idempotencia y estados de reintento. No mover a entregada por drag sin comprobante. |
| Documentos / P0-P1 | Remesa/factura como referencia; comprobantes en Storage privado | Vistas de documentos/detalle | Expediente enlazado a pedido/entrega; lectura autorizada de eventos/prueba. Futuro almacenamiento de contratos y docs fiscales con política específica. No hacer públicos soportes. |
| Gastos/costos / P1 | Sin contratos de gastos | Compras/conciliación | Gastos por viaje/pedido, concepto, moneda, monto y soporte; revisión y vinculación a pagos. Márgenes sólo cuando ingreso/costo estén verificados y en moneda comparable. |
| Informes / P1 | Contadores operativos, sin cortes temporales/financieros | ManagementDashboard, caja, widgets | Operación filtrable por fecha, estado, cuenta/viaje; KPIs derivados sin SLA inventado. Financiero tras contratos monetarios, sin sumar monedas. |
| Checklist preoperacional / P1 | `checklist.html` usa Apps Script | Formularios/expediente | Inventariar payload y permisos; conservar proceso actual. Migración o lectura requiere contrato/proveedor/identidades acordados. No consultar endpoint privado para auditoría. |
| Vinculación / P1 | `vinculacion.html` y `admin.html` usan Apps Script | Solicitudes/documentos | Incorporar flujo tras mapear estados, revisores y documentos. No sustituir backend externo ni ampliar acceso unilateralmente. |
| Permisos/auditoría / P0 transversal | operations, driver y acceso cliente; no financiero | Patrones de vistas y permisos, no roles demo | Mantener separación actual. Permisos para nuevas entidades y finanzas requieren aprobación concreta; políticas con pruebas de lectura/escritura cruzada, sin service-role en frontend. |
| Público/cliente / P0 conservación | Landing, acceso, activación, seguimiento ya operativos | Marca/composición sólo cuando útil | Compatibilidad de rutas y sesión; cliente jamás ve navegación financiera/operativa por compartir shell. |

## Arquitectura propuesta

Mantener el sitio público y contratos de sesión mientras se reemplaza el adaptador de presentación por un cliente de aplicación tipado. React tendrá módulos reales y un único estado autorizado, con mutaciones explícitas; los formularios legacy sirven como compatibilidad temporal, no como destino de clicks ocultos. Extraer el Kanban funcional y páginas de negocio de Xtreme con adaptadores Incargo. El framework Next.js por sí solo no resuelve entidades faltantes; migrar toda la raíz ahora añade riesgo sin beneficio para estos contratos. Se revisará una exportación Next bajo la misma raíz sólo si las rutas/modularidad lo necesitan y con equivalencia de auth/hosting comprobada.

Separación de entidades propuesta:

`cuenta → cotización versionada → pedido → asignación a viaje → entrega(s) + eventos + prueba → documento administrativo/factura externa → abonos`

El pedido puede existir antes de un viaje. Las entregas existentes no se reinterpretan ni migran automáticamente; enlaces explícitos preservan su historial. El estado de ejecución se deriva de las entregas, mientras aprobación comercial/cancelación son hechos separados. No habrá tablas de fixtures en producción.

## Lotes y decisiones

1. Integración operacional directa y Kanban de envíos con contratos existentes, detalle eventos/prueba, ordenación/filtros, asignación y formularios React; corregir estilos de sistema oscuro. Sin cambios de permisos.
2. Modelo local de pedidos/cotizaciones y facturación administrativa/cartera con SQL aditivo, idempotencia, concurrencia y pruebas de roles. No activar grants/RLS nuevos en producción antes de resolver responsables y revisión concreta.
3. Implementar UI empresarial contra esos contratos; validar recorrido completo y recarga persistente en entorno aislado, luego activar lotes autorizados. Acordar pedido↔entregas para no perder trazabilidad.
4. Flota/gastos/reportes y procesos Apps Script/Formspree, con integración explícita; no importar datos ni cambiar proveedores a ciegas.

Decisiones indispensables: sistema actual de facturación y responsable financiero; quién puede registrar documentos/abonos/costos; relación de pedido con múltiples entregas cuando aplique. Moneda e importes deben ser explícitos por documento; ninguna tarifa, impuesto, plazo, SLA o estado fiscal se presume. La autorización amplia de construir el sistema no se interpreta como permiso para emitir fiscalmente, cobrar o ampliar roles.

## Checkpoint posterior a implementación aislada

- Se eliminó la integración basada en `go()`/clickDOM. La nueva interfaz usa API de dominio limitada sobre los contratos existentes y conserva login/driver como compatibilidad.
- Kanban de envíos, expediente con eventos/comprobante, formularios directos y cuentas canónicas implementados y probados. No se llamó «pedido» a una entrega.
- Entidades nuevas de cotización, pedido, factura administrativa, recibo, aplicación y auditoría implementadas en SQL propuesto y probadas en PostgreSQL desechable; no activadas en Supabase real.
- UI de cotizaciones/pedidos y facturación/cartera conectada a esos contratos. Prueba con recarga y saldo persistido en PostgreSQL, más prueba de concurrencia y reversos.
- No se habilitaron permisos financieros por defecto. Las decisiones ya consultadas permanecen abiertas y bloquean la activación productiva de los contratos, no la auditoría ni el trabajo local.
- No se afirma cierre de P0/P1 completo: faltan cancelación con ejecución/reversos comerciales o fiscales, relación definitiva de pedidos/facturas, operación de costos, catálogo verificado de flota, integración de proveedores y demás filas de la matriz. No se publicará este núcleo en main como «sistema completo».

## Segundo checkpoint — revisiones, cancelación y recursos

- Revisiones inmutables y aceptación de la versión vigente: SQL, UI y pruebas locales; se conserva cuenta/antecesor/motivo y se rechazan bifurcaciones o revisión de lo ya aceptado.
- Cancelación administrativa limitada a pedido sin entregas, facturas ni costos: idempotente, auditada, visible en historial separado del Kanban activo. No cancela viajes ni anula documentos externos. Casos con ejecución siguen pendientes de decisión.
- Notas administrativas append-only con soporte/autor, lectura/escritura según dominio; notas financieras requieren autorización financiera. No sustituyen notas crédito/débito ni modifican cartera.
- Vehículos y conductores: consulta integrada de asignaciones verificadas por contratos existentes; no inventa catálogo, vigencia documental o disponibilidad.
- Proveedores, costos y documentos: modelo propuesto cerrado, RLS, sin RPC ni grants. Pruebas locales de precisión/atribución/procedencia. Aún no es gestión operativa de gastos/flota.
- [Inventario y transición externa](external-process-transition.md): contratos identificados desde código, riesgos de no-cors/identidad por fila, plan de recepción verificable, deduplicación y conciliación de evidencias. Sin llamar proveedores ni modificar sus datos.

Activación pendiente de respuestas previas y revisión de permisos. Trabajo independiente concluido en esta rama; ningún resultado aislado se presenta como función ya activada en producción.

## Publicación operacional, finanzas retenidas por instrucción expresa

Lenu indicó el 30 de octubre que el sistema de facturación debe integrarse sin activarse hasta recibir los datos y una nueva indicación. Se conserva implementación aislada, se añade navegación pendiente y un bloqueo literal tanto en la capa de operaciones como en el contrato SQL. No hay activación por variables ni permisos financieros nuevos.

Puede publicarse el código operativo que usa contratos existentes. Activar pedidos/cotizaciones todavía requiere confirmar el alcance del rol operations para crear/revisar/aceptar/cancelar, así como la relación pedido-entregas. Son decisiones separadas de la facturación retenida. Los modelos de costos/proveedores/documentación siguen cerrados; la transición de fuentes externas conserva sus dependencias documentadas.

## Navegación y mapa de referencia

UI operativa reagrupada con selector móvil y mapa local, usando recorridos ya autorizados. Hitos actualizables cada minuto; no hay tablas GPS ni publicaciones Realtime de Incargo según metadata de producción consultada. El mapa se limita a operaciones y no amplía el payload del enlace público. El alcance completo, licencias y requisitos de una futura fuente GPS están en [maps-and-tracking.md](maps-and-tracking.md). No resuelve ni oculta las brechas comerciales/financieras anteriores.
