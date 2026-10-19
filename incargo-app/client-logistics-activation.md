# Datos logísticos cliente: activado el 19/10/2026

Lenu aprobó expresamente aplicar la consulta de destino, ruta y fecha programada para el cliente vinculado (respuesta «si apruebo», evidencia de conversación Sentinel_62710103b5a0819193ba310c47ee163c). Se aplicó exclusivamente el contrato revisado en dda1597cc00b4c6936ba8b4133239f405752e16e al proyecto Incargo gmjsqboyuvierfwruspv mediante el SQL Editor autenticado del Dashboard. No se crearon columnas, modificaron RLS/Auth/grants de tablas ni escribieron datos operativos.

## Aplicación y postflight

- Preflight: funciones ausentes; columnas y tipos existentes compatibles; authenticated ya disponía de USAGE de incargo_private. Editor: https://supabase.com/dashboard/project/gmjsqboyuvierfwruspv/sql/f6b97072-3109-4ccb-b2a2-a9bb1b4298a9 .
- Transacción aplicada: respuesta «Success. No rows returned». SQL conservado en `client-logistics-applied.sql`; la propuesta original se conserva como documento histórico, aunque su cabecera diga pendiente. No volver a ejecutar CREATE FUNCTION.
- Editor usado para aplicación y después postflight: https://supabase.com/dashboard/project/gmjsqboyuvierfwruspv/sql/eb459070-8e69-4b91-b60b-425fa25220c9 . No se creó entrada en el historial de migraciones de Supabase CLI; esta es una aplicación por Dashboard documentada en Git.
- Postflight confirmó ambas definiciones, STABLE y search_path vacío: helper privado SECURITY DEFINER y envoltorio público SECURITY INVOKER. ACL de ambas: `{postgres=X/postgres,authenticated=X/postgres}`. Sin EXECUTE de PUBLIC, anon o service_role.
- El helper une auth.uid → membresía comercial → vínculo explícito de entrega → viaje y filtra p_delivery. Devuelve exclusivamente delivery_id, destination_text, route_label y scheduled_date. El rol operativo por sí solo no concede acceso comercial.
- Security Advisor consultado y refrescado: 0 errores, 18 advertencias, 5 sugerencias. La lista de advertencias mostrada corresponde a funciones existentes (incluida rls_auto_enable); no aparece la nueva RPC. No se modificaron otros permisos ni se declara el proyecto libre de advertencias.

## Interfaz y comprobaciones

El detalle cliente consulta el nuevo RPC tras revalidar identidad; presenta destino, ruta y **Fecha programada del viaje**, aclarando que no es ETA. Ausencia, null y error tienen mensajes diferentes. Los datos se limpian al cerrar/cambiar el detalle, filtrar o cambiar/cerrar sesión; una respuesta tardía no puede repoblar otra selección. Reintentar vuelve a consultar sin escribir. No hay fallback a tablas operativas.

- 63/63 pruebas Node: client-refresh, session-integration y client-encoding. Incluyen contenido renderizado como texto, respuestas inválidas, fecha sin desplazamiento de día, null, vacío, reintento y respuestas tardías 200/500/401 ante cierre, filtro, selección y logout.
- 7/7 PostgreSQL aislado del contrato (prueba previa a la activación, sin cambios al SQL): cuentas A/B, ID ajeno, helper directo, roles sin vínculo, doble rol, revocación/reasignación, ACL y denegación de lectura directa. No son pruebas multiusuario remotas.
- QA CUA con frontend real y fixtures locales, conexión externa bloqueada: escritorio y viewport móvil solicitado 390×844 (ancho efectivo 355, scrollWidth 341), campos legibles sin desbordamiento; error con reintento y ausencia comprobados. Fixtures sintéticas, no operaciones reales.
- Pestaña real https://www.incargo.co/cliente muestra formulario de ingreso. Falta lectura autenticada de estos tres campos en producción; no se creó usuario, no se extrajo token ni se cerró sesión por rutina.
- No hay build, tipos o lint configurados para esta web estática. El runner Playwright histórico no se cuenta como aprobado: su dependencia no está instalada; la QA visual se realizó con CUA.

## Origen y carga no existentes

No se inventaron valores ni se derivó origen a partir del nombre de ruta. Siguiente propuesta de captura: origin_text y service_label como texto público validado, package_count entero positivo nullable y gross_weight_kg decimal positivo nullable, con unidad kg explícita. Campos vacíos permanecen null. Requiere aprobar esquema y definir responsables/fuente operativa, edición/auditoría y carga histórica antes de crear columnas o importar. No llenar desde notas privadas ni migrar por coincidencia de nombres. El primer RPC no promete devolver campos que no existen.

## Mapa de puntos, sin GPS

Opción técnica para evaluar: MapLibre como renderizador local y MapTiler Cloud para cartografía/geocodificación. Mostrar únicamente puntos de origen/destino verificados, con fuente/fecha/precisión; no camión animado, ruta recorrida, ETA ni línea que parezca trayectoria real. Operaciones debe confirmar coordenadas antes de compartirlas. No usar ubicación del navegador.

Transferencia a aprobar: geocodificación enviaría el texto de origen/destino al proveedor; la descarga de mapas transmite IP y área/zoom solicitados (y puede revelar zona geográfica). No enviar IDs de entrega, nombres de clientes ni notas. Definir política de conservación, clave restringida por dominio y presupuesto antes de integrar. No se ha enviado ninguna dirección ni coordenada, instalado SDK, creado cuenta ni clave.

Precio consultado 19/10/2026: MapTiler publica Flex desde USD 30/mes más tráfico adicional; Free se presenta para pruebas/PoC/personal/no comercial, por lo que no se presupone adecuado para operación comercial. Falta volumen mensual para calcular coste total y límite aprobado. Fuentes: https://www.maptiler.com/cloud/pricing/ y https://docs.maptiler.com/cloud/api/geocoding/ . Alternativa de cartografía propia requiere infraestructura, almacenamiento/licencia y operación presupuestados; tampoco se activa por inferencia.

## Evidencia aislada anterior a la activación

`INCARGO_PG_RUNTIME=<runtime local> node --test incargo-app/tests/client-logistics-postgres.test.cjs`: **7/7**, seis casos más suite principal, PostgreSQL desechable en loopback. Prueba A/B y acceso por ID ajeno, helper directo, usuario sin vínculo, ID desconocido/nulo, identidad nula, rol driver/operations sin vínculo, doble rol, destino null, revocación/reasignación y ACL (incluido EXECUTE por defecto de service_role), además de ausencia de lectura directa de entregas por cliente. El servidor local se detiene al terminar. En aquel lote previo no se consultó Supabase remoto; la activación y postflight posteriores constan arriba.

La propuesta usa funciones con permisos acotados conforme a la documentación oficial: https://supabase.com/docs/guides/database/functions . El índice changelog.md no pudo recuperarse con el lector web (tipo text/markdown no soportado); no se actualizó ninguna dependencia ni API SDK.