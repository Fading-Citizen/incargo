# Paridad del administrador legacy — inventario y estado de migración

**Actualización 2026-11-04:** la importación real de 27 inspecciones y 8 vinculaciones está completada y verificada. Consulta [evidencia actual](../qa/legacy-import-20261104.md). Las referencias a aprobación/importación pendientes que siguen describen el corte histórico del 3 de noviembre.
Fecha: 2026-11-03. Base nueva: `8026e356aa1991d4c990f0a84366016ec4068213`. `/admin` público y `logistica-1.0.0/admin.html` coinciden byte a byte: SHA-256 `fd6b9f2dd954d666c211801652581abf4e8dc38669d693f7a4fb2af580dbefd7`. No se modifica el legacy. No hay AGENTS.md ni `.agents/skills` del proyecto en este checkout; `/workspace/.agents` está vacío. La instalación excluida no se inspecciona.

## Origen, destino y límites

Origen funcional: admin.html, apps-script-v2.js, checklist.html y vinculacion.html. Origen de datos: Apps Script con `action=list` y `action=vinculaciones`. El archivo Apps Script usa la hoja activa, no acredita qué spreadsheet ni qué versión del script están desplegados. `incargo-app/legacy-mapping.md` registra una fuente previamente inspeccionada; sus conteos históricos no son conteos actuales.

Destino nuevo: panel React `panel/src`, publicado mediante assets estáticos en `/operaciones`, con sesión por pestaña validada por Supabase y rol `operations`. Las inspecciones NO son entregas; vinculaciones contractuales NO son solicitudes de acceso de clientes. El esquema privado de revisiones ya se creó; la copia de los originales sigue pendiente de aprobación de la herramienta. Los transformadores previos se conservan.

## Inventario completo por acción visible

| Función legacy / evidencia | Correspondencia nueva antes del cambio | Trabajo y límite de paridad |
| --- | --- | --- |
| Login compartido, Enter, restaurar sesión, salir (`admin.html:252–276`) | Login Supabase por usuario y salida | Reutilizar sesión individual; no copiar clave compartida ni equiparar roles sin autorización |
| Cargar / refrescar inspecciones (`278–305`) | No existe | Adaptador autenticado por rol operations; activación pendiente de importación verificada |
| Total, recibidas hoy, alertas MALO, placas únicas (`480–485`) | Resumen de entregas distinto | KPIs de inspecciones consultadas, día Bogotá, desconocidos explícitos |
| Buscar placa/conductor/ciudad (`464–478`) | Solo entregas/flota | Filtro combinado de inspecciones |
| Fecha y estado MALO/OK (`464–478`) | No existe | Conservar MALO literal; JSON inválido no equivale a OK; BAJO visible |
| Lista inversa, fecha, placa, conductor, vehículo/modelo, ciudad, estado (`487–505`) | No existe | Mesa de inspecciones con procedencia y límites de consulta |
| Detalle datos generales (`706–724`) | Expediente de entrega distinto | Todos los campos legacy, sin convertir identificaciones a números |
| Ítems, escalas, observaciones (`707–725`) | No existe | Lista completa; no omitir BAJO ni valores desconocidos |
| Fotos, firma y alerta de truncamiento (`731–747`) | Soporte de entrega distinto | Raster embebido validado, incompleto/ausente explícitos; no URLs externas |
| Editar 15 campos generales (`524–552`, `629–648`) | No existe | Edición con revisión esperada, recibo e historial; el original permanece inmutable |
| Reemplazar fotos y firma, previsualizar/cancelar (`558–624`) | No existe | Reemplazos como nueva versión, sin truncar; evidencia anterior conservada |
| Guardar y recargar (`626–682`) | No existe | API de guardado, hash original, versión esperada, petición idempotente y auditoría |
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

## Autorización vigente y acceso

Lenu confirmó todos los usuarios actuales y futuros con rol `operations`, con lectura y edición de ambos módulos. El adaptador comprueba Auth y membership vigente; las RPC vuelven a comprobar el rol después de esperar los bloqueos. No hay lista fija de UUID ni ACL por expediente. Clientes y conductores quedan excluidos. No se crean cuentas ni se alteran memberships existentes. La base solo admite roles `operations` y `driver`; las vinculaciones de cliente viven en otra tabla. La audiencia observada tenía 2 operaciones, 0 conductores y 1 usuario vinculado a cliente.

## Preservación e integridad

- Se archiva la respuesta completa del proveedor y cada JSON original con SHA-256; el identificador depende del contenido original, nunca del número de fila aislado. La importación administrativa valida identidad JSON igual a `JSON.stringify` del runtime.
- Los usuarios operativos pueden corregir originales archivados, pero no crear originales ni inventar procedencia mediante la RPC. Nuevos contenidos en la fuente requieren sincronizar la copia íntegra con el importador administrativo; se muestran sin edición hasta entonces. No se interpretan como el mismo expediente cuando cambia su contenido.
- La lectura combina la fuente actual con las versiones guardadas. Si el origen cambia, conserva el expediente archivado separado y marcado histórico. La fuente continúa siendo dependencia de la consulta general; un fallo se muestra como error, nunca como conjunto vacío ficticio.
- Cada corrección agrega actor, fecha, motivo, petición, parche y versión completa. Los triggers impiden modificar/borrar originales, snapshots y revisiones. No hay permisos directos sobre tablas para usuarios autenticados ni anónimos.
- La revisión esperada evita sobrescribir a otro editor. Un reintento idéntico devuelve el recibo anterior; reutilizar una petición con otro contenido falla. La UI congela el intento tras enviarlo, y solo anuncia guardado al recibir un recibo válido. Rechaza resultados de una sesión anterior.
- Las vinculaciones permiten corregir datos identificativos y de contacto. La aceptación, fecha, versión contractual y firma registradas permanecen inmutables; editar un nombre no concede consentimiento nuevo.
- No hay escritura de retorno a Apps Script, borrado, sustitución del legacy ni cambios financieros.

## Evidencia real del origen

GET completos del 2026-11-03, sin contraseñas ni credenciales reenviadas al proveedor:

| Tipo | Registros | Bytes | SHA-256 respuesta completa | Registros con `[TRUNC]` |
| --- | ---: | ---: | --- | ---: |
| Inspecciones | 27 | 1311229 | `5ee3cb30e5f7f96e7a9ee341c8f9172d9a40d44125c6212689cb2eead6c3b227` | 8 |
| Vinculaciones | 8 | 114931 | `082e05096ca50118c39f67d7de77255c107a87cebf97dfc9ee36412a5e10aadf` | 0 |

`[TRUNC]` es un literal dentro del JSON del proveedor. No es truncamiento de salida de la herramienta ni prueba de pérdida irreversible o daño del archivo original. `apps-script-v2.js` contiene lógica que recorta firmas y añade ese marcador; no está comprobado que sea exactamente la versión desplegada ni qué libro está activo. Los hashes acreditan los bytes recibidos, no autenticidad de firma ni integridad de una hoja no inspeccionada. La copia conserva el marcador, no inventa la parte faltante.

## Estado de aplicación y publicación al corte

- **Código:** consulta, filtros, detalle, evidencias, CSV/PDF informativo, correcciones de ambos tipos, historial descargable, errores, aislamiento de sesión y reintentos implementados.
- **Supabase real:** migración `legacy_operations_versions` aplicada satisfactoriamente. Añade tablas privadas/RLS/triggers y dos RPC autenticadas con comprobación de rol. Consulta posterior: 0 originales, 0 snapshots, 0 revisiones.
- **Importación:** petición completa rechazada con `Request body is too large`; no se ejecutó. La interfaz de la herramienta mostró aprobación pendiente para `supabase.execute_sql`. No se sustituye ese permiso con otra vía. La transferencia por partes está preparada y probada localmente; migraciones `legacy_snapshot_parts` y `legacy_revision_export` aún no aplicadas.
- **Verificación local con datos reales:** los 27 + 8 originales y ambos snapshots se importaron dos veces en PostgreSQL descartable. Conteos, payloads y hashes completos coinciden; 0 revisiones; no duplicados. Esto NO acredita que estén importados en Supabase real.
- **Producción:** todavía no activada para este incremento. Push/preview y despliegue están autorizados, pero la activación espera importación verificada. No hay sesión real para QA autenticado.

## Decisiones imprescindibles restantes

1. **Permiso de herramienta pendiente:** aprobar la operación Supabase de importación, cuyo efecto es añadir copias inmutables en `incargo_admin` del proyecto Incargo. No es una nueva decisión de audiencia.
2. **Certificado con firma:** identificar firmante autorizado, condiciones y plantilla/versionado. Sin esto solo se emite copia informativa; no se reutiliza la imagen fija como aprobación.
3. **Contrato histórico:** obtener correspondencia entre `versionContrato` y documento inmutable/hash realmente aceptado. Alternativa disponible: copia del expediente con la aceptación literal y advertencia explícita. El texto actual no sustituye el documento histórico.

No hay decisión adicional necesaria para editar los datos documentales autorizados, conservar versiones o publicar la rama.

Límites de transporte: API de 3 MB; nuevas versiones limitadas a 2,5 MB y conjunto vigente a 2,7 MB antes de confirmar una escritura, para no volver ilegible la consulta. El historial lista metadatos y descarga cada versión por separado; no trunca imágenes. Un exceso se rechaza sin guardar y permite seleccionar archivos menores al reabrir la corrección.
