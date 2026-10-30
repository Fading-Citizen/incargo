# Navegación, mapas y seguimiento — 30 octubre 2026

## Auditoría y alcance comprobado

Se inspeccionó la UI previa con capturas y los contratos `incargo-app.js`, `incargo-tracking.js`, `edge/tracking/index.ts`, `migration.sql` y `client-portal.proposal.sql`. La consulta de metadatos de Supabase (`gmjsqboyuvierfwruspv`) confirmó ocho tablas públicas Incargo: no hay columnas de latitud/longitud ni telemetría. Una consulta separada de `pg_publication_tables` devolvió **cero tablas Incargo en supabase_realtime**. Sólo se leyeron metadatos, no registros de empresas/personas, enlaces reales ni comprobantes.

El endpoint público existente devuelve nombre de cliente, referencia de factura, estado, hitos y soporte firmado de una única entrega autorizada por token. No devuelve origen/destino, conductor, dirección ni ubicación. Se conserva ese alcance: el mapa no se agrega a dicho endpoint ni al portal cliente. No se cambia la Edge Function, RLS, publicación Realtime, credenciales o hosting.

## Mapa operacional local

- Se ofrece dentro del panel autorizado de operaciones. Usa los datos ya consultados por la sesión y la vinculación existente de entrega/viaje.
- Referencia geográfica de Colombia y 72 localidades de Natural Earth; se empaqueta en el bundle. No usa tiles, geocodificadores, rutas o proveedores externos en runtime; no transmite direcciones ni posiciones a un proveedor.
- Sólo coincide un nombre completo de ciudad normalizado. No extrae una ciudad de una dirección privada ni hace búsqueda difusa. Si el catálogo devuelve nombres ambiguos, no elige uno. Un origen/destino ausente puede tomar el nombre explícito del recorrido del viaje; un campo informado pero no reconocido no se sustituye silenciosamente.
- La línea discontinua une referencias urbanas. No es una carretera, distancia, ETA, posición GPS, cobertura contractual ni vehículo en movimiento. Las localidades y el contorno son generalizados; no sirven para navegación vial ni certificación territorial.
- Selección de envío, búsqueda y acceso a expediente. Los recorridos no identificables permanecen en la lista con explicación explícita.

Fuentes primarias: [Natural Earth, dominio público y condiciones](https://www.naturalearthdata.com/about/terms-of-use/), [repositorio oficial de datos](https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19). Archivos: `geojson/ne_110m_admin_0_countries.geojson` y `geojson/ne_10m_populated_places.geojson`. Regeneración manual: `python3 panel/scripts/generate-reference-map.py`; fuente fijada a ese commit, sin datos privados como entrada. El SVG se proyecta localmente en un plano de referencia; la atribución aparece en la interfaz.

## Actualización de estados, no telemetría GPS

Mapa: el operador puede activar consultas cada 60 segundos; se usa la API existente, con revalidación de sesión/rol. No se hace polling fuera de la vista de mapa, al abrir un expediente, en segundo plano u offline; se evitan consultas periódicas superpuestas y se aplica un timeout de 15 segundos. El refresco de monitoreo no repite las consultas administrativas de cuentas. El refresco silencioso conserva la selección y no desmonta formularios de otra vista. Los fallos muestran error y no afirman datos nuevos.

Seguimiento por enlace: consulta manual y cada 60 segundos, desactivable. Pausa con pestaña oculta/offline; una sola petición en vuelo, timeout de 12 segundos, abort al salir/cambiar token, generación de consulta contra respuestas tardías. Revocación/expiración borra el resultado y detiene la consulta periódica. Hora de consulta correcta y fecha del último hito se muestran por separado. Ningún reloj nuevo se presenta como nueva ubicación.

No se conserva carga/estado/tokens en localStorage ni se envían por query string. El formulario de entrada sólo acepta enlaces HTTPS del dominio Incargo y el token esperado; no es un redirector externo. Soportes navegables se limitan al host Supabase existente y al bucket/path de enlaces firmados. Texto renderizado con textContent/React, sin HTML proveniente del registro.

Referencia de ciclo de vida: [MDN visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).

## UX y sitio público

Se reemplazó la fila móvil recortada por selector desplegable con grupos, módulo actual, foco y Escape. En escritorio hay grupos de operación, gestión y módulos pendientes; finanzas conserva estado inactivo. El Kanban permite lista/tablero y inicia como lista en pantallas pequeñas. El expediente diferencia carga pendiente, error y ausencia de comprobante.

La portada prioriza tres recorridos: solicitar servicio, entrar a la cuenta y consultar un enlace. Se conserva Formspree y sus campos. Se mejoraron jerarquía, imágenes correspondientes, accesos y texto sin inventar indicadores, testimonios o GPS activo. Se retiraron enlaces sociales vacíos, una búsqueda estructurada inexistente y una cifra aspiracional no necesaria para el recorrido. El redireccionamiento de invitaciones desde el fragmento del inicio permanece intacto.

## GPS futuro: requisito separado, no activado

No se llama a Geolocation, se instala proveedor ni se crea tabla de posiciones. Para ofrecer ubicación real se necesita acordar una fuente autorizada (dispositivo/conductor con consentimiento o proveedor existente), frecuencia y precisión, conservación, acceso y motivo operativo. Un posible flujo sería iniciar/parar voluntariamente sólo durante el viaje asignado, mostrar el estado de captura y registrar fecha/precisión. Antes de almacenar latitud/longitud y trip_id en Supabase se necesita revisar/aprobar su contrato y RLS; antes de usar tiles/geocodificación externos se necesita autorización para qué datos salen, a qué proveedor y con qué condiciones. No se extiende el enlace público a posiciones privadas por defecto.

Facturación sigue bloqueada; permisos comerciales/cardinalidades siguen pendientes. Este lote no activa esos contratos ni completa el sistema empresarial.

## Evidencia

Pruebas de navegador con fixtures locales: navegación teclado/móvil, selector de mapa, cambio de estado recibido tras 60 segundos, pausa oculta, bloqueo financiero, enlaces inválidos, soporte externo rechazado, soporte autorizado conservado, offline, revocación y respuesta tardía de un token anterior descartada. No se probaron envíos/personas reales. Capturas en `panel/qa/` distinguen el mapa de referencia, navegación, seguimiento y portada; se inspeccionaron píxeles antes y después de corregir selección/jerarquía.
