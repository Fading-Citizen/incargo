# Paridad del administrador legacy — inventario previo a implementación

Fecha: 2026-11-03. Base nueva: `8026e356aa1991d4c990f0a84366016ec4068213`. `/admin` público y `logistica-1.0.0/admin.html` coinciden byte a byte: SHA-256 `fd6b9f2dd954d666c211801652581abf4e8dc38669d693f7a4fb2af580dbefd7`. No se modifica el legacy. No hay AGENTS.md ni `.agents/skills` del proyecto en este checkout; `/workspace/.agents` está vacío. La instalación excluida no se inspecciona.

## Origen, destino y límites

Origen funcional: admin.html, apps-script-v2.js, checklist.html y vinculacion.html. Origen de datos: Apps Script con `action=list` y `action=vinculaciones`. El archivo Apps Script usa la hoja activa, no acredita qué spreadsheet ni qué versión del script están desplegados. `incargo-app/legacy-mapping.md` registra una fuente previamente inspeccionada; sus conteos históricos no son conteos actuales.

Destino nuevo: panel React `panel/src`, publicado mediante assets estáticos en `/operaciones`, con sesión por pestaña validada por Supabase y rol `operations`. Las inspecciones NO son entregas; vinculaciones contractuales NO son solicitudes de acceso de clientes. Existen transformadores de staging y un esquema privado propuesto, no una importación ejecutada.

## Inventario completo por acción visible

| Función legacy / evidencia | Correspondencia nueva antes del cambio | Trabajo y límite de paridad |
| --- | --- | --- |
| Login compartido, Enter, restaurar sesión, salir (`admin.html:252–276`) | Login Supabase por usuario y salida | Reutilizar sesión individual; no copiar clave compartida ni equiparar roles sin autorización |
| Cargar / refrescar inspecciones (`278–305`) | No existe | Adaptador de lectura autenticado, apagado hasta aprobar audiencia |
| Total, recibidas hoy, alertas MALO, placas únicas (`480–485`) | Resumen de entregas distinto | KPIs de inspecciones consultadas, día Bogotá, desconocidos explícitos |
| Buscar placa/conductor/ciudad (`464–478`) | Solo entregas/flota | Filtro combinado de inspecciones |
| Fecha y estado MALO/OK (`464–478`) | No existe | Conservar MALO literal; JSON inválido no equivale a OK; BAJO visible |
| Lista inversa, fecha, placa, conductor, vehículo/modelo, ciudad, estado (`487–505`) | No existe | Mesa de inspecciones con procedencia y límites de consulta |
| Detalle datos generales (`706–724`) | Expediente de entrega distinto | Todos los campos legacy, sin convertir identificaciones a números |
| Ítems, escalas, observaciones (`707–725`) | No existe | Lista completa; no omitir BAJO ni valores desconocidos |
| Fotos, firma y alerta de truncamiento (`731–747`) | Soporte de entrega distinto | Raster embebido validado, incompleto/ausente explícitos; no URLs externas |
| Editar 15 campos generales (`524–552`, `629–648`) | No existe | Preparación de corrección sin sobrescritura; persistencia bloqueada por contrato y permisos |
| Reemplazar fotos y firma, previsualizar/cancelar (`558–624`) | No existe | Preparación local con originales conservados; guardar versiones requiere backend aprobado |
| Guardar y recargar (`626–682`) | No existe | No reproducir POST opaco ni actualización solo por fila; hace falta ID/versionado/acuse/auditoría |
| CSV de todas las inspecciones, independiente del filtro (`946–965`) | No existe | Exportar conjunto consultado o filtrado explícito; proteger fórmulas de hoja |
| PDF de listado completo (`968–1002`) | No existe | Vista imprimible local / guardar como PDF sin proveedor externo |
| Certificado individual, nombre/cargo y firma fija supervisor (`750–944`) | No existe | Copia imprimible de inspección sin certificar aprobación; emisión con firma pendiente de autorización |
| Total vinculaciones y recibidas hoy (`320–325`) | Accesos de cliente, entidad distinta | KPIs de expedientes contractuales separados |
| Mostrar/ocultar vinculaciones y actualizar (`453–457`) | No existe | Pestaña propia con refresco independiente |
| Lista fecha, identidad, tipo, correo, aceptación, firma (`326–336`) | No existe | Conservar valores literales y ausencias, sin otorgar cuenta ni rol |
| Contrato PDF con datos, texto actual y firma (`339–442`) | No existe | Exportar copia de expediente; contrato histórico bloqueado hasta resolver versión/documento |
| Estados vacíos, error, reintento y notificaciones | Existen en otros módulos | Distinguir acceso denegado, fuente inaccesible, resultado vacío y documento incompleto |
| Datos demo si endpoint sin configurar (`279–284`, `1006–1009`) | No hay demo en producción | No trasladar; configuración ausente es estado no habilitado |

No hay borrado, aprobación de inspecciones, creación de usuarios, vinculación de vehículos al catálogo ni creación de inspección dentro de `/admin`. Los formularios públicos `/checklist` y `/vinculacion` son fuentes relacionadas, no acciones administrativas que deban reemplazarse silenciosamente.

## Decisiones bloqueantes

1. Audiencia autorizada: usuarios individuales frente a todos los actuales `operations`. El permiso de push/migraciones no autoriza ampliar acceso. La propuesta requiere lista explícita además de rol validado y no está habilitada.
2. Confirmar hoja y versión desplegada del Apps Script. El código existente edita por `_rowNumber`, sobrescribe imágenes y no tiene revisión esperada/ID de petición; no permite garantizar concurrencia, repetición ni preservación de evidencia.
3. Aprobar almacenamiento de versiones, retención y permisos antes de aplicar el esquema privado o importar. Los transformadores conservan `ready_for_import=false`.
4. Vincular cada versión contractual al documento realmente aceptado; no usar el HTML actual para acreditar un contrato histórico.
5. Autorizar firmante y condiciones de emisión de certificados. No reutilizar automáticamente una firma fija.

La autorización de despliegue previa correspondía al dashboard y sus dos correcciones; este alcance nuevo no se despliega. Publicar una rama puede generar un preview automático de Vercel: se entregará un commit local hasta confirmar la publicación de nueva funcionalidad.

## Evidencia de origen obtenida en esta sesión

Se hicieron exclusivamente GET a los dos endpoints existentes; las respuestas se procesaron en memoria, sin copiar registros personales ni imágenes a Git. Se exigió JSON completo con límite de 20 MB (un exceso habría fallado, no truncado). Resultados al 2026-11-03:

| Consulta | Registros | Con `_rowNumber` | Registros con marcador `[TRUNC]` en firma/fotos | SHA-256 de la respuesta completa |
| --- | ---: | ---: | ---: | --- |
| `action=list` | 27 | 27 | 8 | `5ee3cb30e5f7f96e7a9ee341c8f9172d9a40d44125c6212689cb2eead6c3b227` |
| `action=vinculaciones` | 8 | 8 | 0 | `082e05096ca50118c39f67d7de77255c107a87cebf97dfc9ee36412a5e10aadf` |

`[TRUNC]` está dentro del JSON del proveedor, no es un límite de visualización de la herramienta. `apps-script-v2.js:73–77,104` añade el marcador al recortar firmas de inspección, y `181–185` define la regla de firma de vinculación. Esto NO prueba pérdida irreversible del original, daño del archivo ni coincidencia de la versión desplegada del script con este archivo. La recuperación exige inspeccionar la celda/exportación original y sus respaldos con autorización; no se reconstruyeron firmas. Un hash acredita los bytes recibidos en esta consulta, no autenticidad de firma, identidad estable de la fila ni integridad de la hoja original.

Consulta de metadatos a Supabase `gmjsqboyuvierfwruspv`: 8 tablas públicas `incargo_*` con RLS habilitada; no se encontraron tablas en `incargo_legacy` ni `incargo_admin`. No se consultaron filas de negocio de Supabase. El asesor de seguridad reportó avisos preexistentes (tablas RLS sin políticas, funciones definer ejecutables y protección de contraseñas filtradas deshabilitada); no se modificó configuración. La exposición de una función definer requiere revisar su autorización interna, no demuestra por sí sola una fuga. Estos avisos no validan ni invalidan el esquema nuevo, que solo existe en una base local descartable.

## Estado concreto del incremento

| Área | Implementado | Probado | Pendiente |
| --- | --- | --- | --- |
| Lectura de origen | Endpoint servidor GET, identidad Supabase, rol vigente + lista de usuarios explícita, credenciales nunca enviadas al proveedor; configuración cerrada por defecto | Tests del adaptador; lectura real del endpoint legacy para inventario | Aprobar audiencia, activar variables y probar la sesión real en nuevo módulo |
| Consulta administrativa | Navegación, pestañas, indicadores, búsqueda combinada, fecha/estado, paginación, detalles completos y checklist | Navegador escritorio/móvil con fixtures y pruebas unitarias | QA con audiencia y fuente aprobadas |
| Evidencias | Ausente/truncada/inválida explícitas, imágenes raster embebidas sin URLs externas ni SVG; fallo de decodificación visible | Casos sintéticos y navegador | Conciliación y recuperación de originales con propietario |
| Exportación | CSV de todo lo consultado o del filtro; neutralización de fórmulas; listado y copia individual imprimibles/guardar PDF | Descargas CSV, apertura de impresión y pruebas de escape/CSP | Paridad visual/legal de certificados no asumida |
| Corrección de campos/fotos/firma | Formulario de los 15 campos, selección/validación de archivos, previsualización, cancelación, exportación de propuesta con original y hash | Navegador y tests de no mutación | NO guarda: falta activación del backend, política de acceso/retención y corte de escritura |
| Persistencia de revisiones | Propuesta SQL privada con original inmutable, historial, recibos, revisión esperada, repetición idempotente y ACL por expediente | PostgreSQL 17 aislado; competencia y repetición simultáneas | Importador aprobado, enlace de IDs conciliados, integración HTTP/UI de escritura y aplicación del esquema |
| Vinculaciones | Lista/detalle, aceptación y versión literales, estado de firma y copia de expediente | Navegador y tests de staging existentes | Documento contractual por versión; emisión del contrato histórico |
| Certificado con supervisor | Bloqueo visible; copia informativa sin aplicar firma fija | Prueba de ausencia de firma aplicada | Autorización del firmante, plantilla/versionado y flujo de emisión |
| Migración de datos | Transformadores existentes conservados; comprobación de metadatos y fuente | 28 pruebas Python existentes | Ninguna importación realizada ni conciliación fila a fila origen-destino |

## Cambios exactos requeridos para activar lo pendiente

1. **Lectura (decisión de acceso):** confirmar usuarios específicos o audiencia alternativa. El adaptador propuesto requiere `INCARGO_LEGACY_READ_ENABLED=true` y `INCARGO_LEGACY_ADMIN_USER_IDS` con UUID verificados, además de membership `operations`. Cambiar estas variables amplía acceso y requiere confirmación; no se configuraron. Confirmar también el libro/versión del Apps Script antes de presentar esta consulta como fuente canónica. El API falla si la respuesta completa supera 3 MB; no hay paginación del proveedor y no se truncan resultados.
2. **Guardado (implementación + decisiones):** escoger si las correcciones autorizadas vivirán en Supabase manteniendo Sheets como histórico, o si se requiere sincronización con Apps Script. La propuesta `legacy-admin-revisions.proposal.sql` cubre el primer modelo y se valida localmente. Falta aprobar retención/permisos, conciliar un snapshot verificable, asignar IDs y ACL por documento, importar con manifest y conectar una API de escritura/UI con recibos. La autorización de migraciones no sustituye la confirmación de acceso persistente. Si se requiere editar Sheets, hay que añadir ID estable, revisión esperada, deduplicación, historial y acuse en Apps Script; no usar su POST actual por número de fila. No hay doble escritura implementada.
3. **Firmas (decisión de negocio):** confirmar persona autorizada, condiciones para emitir y uso permitido de la imagen de firma. Después implementar emisión con autor/fecha/plantilla/versionado y revisión del expediente. Preparar copia sin aprobación ya está autorizado y terminado; reutilizar una firma como aprobación no se deduce de migrar la UI.
4. **Contratos (fuente que falta):** aportar el manifiesto versión literal → documento inmutable/hash realmente presentado. Después implementar la composición del contrato desde esa versión; las firmas y aceptaciones se conservarán sin reconstruirlas. El texto actual de `/vinculacion` no acredita todas las versiones históricas.
5. **Publicación (autorización de nuevo alcance):** confirmar el despliegue de esta funcionalidad nueva. No se hereda automáticamente la publicación del dashboard anterior. No hubo push, PR ni preview para este incremento porque el push dispara Vercel; el entregable es el commit local y sus evidencias.
