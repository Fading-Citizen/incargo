# Detalle y seguimiento cliente — 2026-10-19

Base: main `8fdfe8f89876801b6a4eaf8577854def2e694d55`. Incremento de frontend, sin nuevos endpoints, datos remotos ni permisos. La prueba de hito anterior no se repite: el usuario informó que la ejecutó desde admin. La pestaña disponible en este entorno sigue mostrando sesión cliente caducada; no se afirma haber leído su nuevo estado.

## Alcance implementado

El detalle identifica remesa y estado, explica su significado, muestra registro y último evento, cronología ordenada con fechas/horas de Colombia (UTC−5), número de hitos y hora de consulta independiente. Registro no equivale a recepción física. En ruta no equivale a coordenadas actuales. No se construye una barra de progreso con pasos inferidos, ni ETA ni mapa ficticio.

Abre la ficha desplazándola a la vista y enfocando el título. Cierre y Escape regresan al control original; los filtros cierran el detalle. Errores y respuestas malformadas ofrecen reintento de historial sin repetir una escritura. Cambio de remesa, logout, filtros y actualización invalidan respuestas tardías y limpian los datos anteriores.

El contrato leído en `client-portal.proposal.sql` retorna solo delivery_id, reference, status, created_at, last_event_at y eventos event_type/occurred_at. La ficha consume únicamente esos campos. No muestra información adicional aunque el payload contenga notas o direcciones inesperadas. La disponibilidad de ubicación/carga se explica con texto, sin lienzo de mapa ni solicitud de GPS.

## Propuesta para una siguiente fase (no implementada ni autorizada por este documento)

1. Aprobar una lista explícita de campos de lectura cliente: origen/destino (decidir ciudad o dirección completa), referencia pública de ruta, fecha programada de viaje, servicio, cantidad de bultos, peso y unidad. `scheduled_date` es planificación del viaje, no fecha prometida de entrega. Destino/ruta/fecha ya existen en operaciones; origen/carga/servicio necesitan modelo y fuente de captura. No convertir ausencia en cero, ni deducir empresa por nombre.
2. Diseñar un RPC de detalle que reciba delivery_id y derive cuenta de auth.uid y vínculos existentes, con la misma exclusión de entregas ajenas/no vinculadas. Responder exclusivamente campos aprobados y nullable; nunca teléfonos de conductor, placa, identidad de receptor, notas privadas, firma, foto o documento por defecto. Revisar y autorizar el cambio de contrato SQL antes de aplicarlo. UI debe distinguir no registrado/no compartido de error y conservar el aislamiento ante reasignación.
3. Para ubicación de último evento: punto opcional (lat/lon), occurred_at, received_at, fuente, precisión y alcance de visibilidad, ligado a entrega/evento. Definir quién registra y valida el punto, retención y revocación. Un punto de hito es una observación histórica, no movimiento continuo. No geocodificar direcciones sin aprobar el destino externo de esos datos.
4. Para rastreo continuo: identificar proveedor GPS ya contratado, consentimiento y vínculo vehículo/viaje/entrega; adaptar ingestión en servidor con deduplicación, marcas de tiempo y reglas de obsolescencia. Exponer solo la posición permitida durante el tramo autorizado, sin historial personal del conductor. Acordar frecuencia, umbral de desactualización y retención antes de operar. No se solicita ubicación del navegador.
5. Elegir proveedor de mapas/cartografía y aprobar costes, claves, dominios y transferencias. El mapa estático de contacto del sitio no acredita integración logística. Mientras no existan fuente y contrato aprobados, mostrar ausencia de ubicación sin simular posiciones, ruta ni ETA.

Validación requerida para esa fase: clientes A/B, sin vínculo, entrega no vinculada, revocación/cambio de empresa, campo ausente, punto antiguo/futuro/inválido, diferencia occurred_at/received_at, proveedor caído, autorización de soportes separada y revisión de límites de API/paginación. Escala logística también requiere fuentes operativas conciliadas, búsqueda/paginación en servidor y observabilidad; la ficha no acredita migración completa de Excel/Sheets.

## Evidencia de este incremento

Pruebas Node: client-refresh, session-integration y client-encoding; 56/56 antes de la revisión visual. Nuevos casos: campos autorizados y fechas de Colombia, historial malformado/reintento, errores, fechas inválidas y carrera entre remesas A/B con respuestas 200/500/401. La suite existente cubre cierre, logout, cambio de cuenta y filtros.

QA con HTML/CSS/JS reales y fetch/identidad sintéticos en loopback; CSP bloquea conexiones externas. Capturas inspeccionadas en escritorio (1745 px) y móvil (355 px efectivos); sin overflow horizontal. Verificados foco/Escape, detalle visible y error con reintento. No equivale a E2E autenticada, ni comprueba RLS remoto o datos comerciales.

Verificación final: 56/56 pruebas del grupo principal y 18/18 adicionales de tab-session/operations-presentation; sintaxis JS y diff --check correctos. El runner histórico client-auth.test.cjs no pudo iniciar porque Playwright no está instalado en este entorno; no se cuenta como aprobado. Se realizó QA visual por el navegador conectado, sin instalar dependencias ni alterar infraestructura. No hay build/tipos/lint configurados para esta web estática.