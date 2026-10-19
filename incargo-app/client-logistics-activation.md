# Datos logísticos cliente: activación pendiente

Base 508f2d7e9dcc322e5605536cfec9ceb7cc888df8. Lenu autorizó mostrar al cliente de cada envío origen/destino, ruta, fecha programada y carga conforme se registren; confirmó que Incargo no tiene GPS. Esta autorización comercial no se interpreta como aprobación automática de nuevos permisos de ejecución. No se aplicó SQL remoto ni se modificó frontend en este lote.

## Cambio concreto listo para aprobación

Aplicar exclusivamente `client-logistics.proposal.sql` al proyecto Incargo gmjsqboyuvierfwruspv, tras verificar definiciones/esquema y ausencia de conflicto de nombres:

- Crear `incargo_private.client_delivery_logistics(uuid)` SECURITY DEFINER, STABLE, search_path vacío, que une el usuario de auth.uid con su membresía comercial, vínculo explícito de entrega y viaje.
- Crear `public.incargo_client_delivery_logistics(uuid)` SECURITY INVOKER como envoltorio.
- Revocar EXECUTE heredado a PUBLIC, anon, authenticated y service_role en esas dos funciones; conceder EXECUTE exclusivamente a authenticated (además del propietario). El helper aplica el mismo alcance si se invoca directamente.
- Retornar únicamente delivery_id, destination_text, route_label y scheduled_date. Ningún operador obtiene datos de otra cuenta mediante este RPC por tener rol operations: debe tener el vínculo comercial correspondiente.
- No crear tablas/columnas, cambiar RLS, grants de tablas, Auth, funciones existentes ni enlaces comerciales. No escribir registros ni notificar.

**Riesgo nuevo exacto:** los usuarios ya vinculados podrán leer el destino textual y la etiqueta/fecha del viaje que antes solo veía operaciones. Destinos pueden contener direcciones completas y las etiquetas de ruta pueden contener texto libre: revisar la calidad de esos campos antes de habilitarlos. La prueba SQL no acredita el contenido de los registros remotos. El script es una propuesta revisable, no una migración registrada ni aplicada; si se aprueba, generar/registrar la migración por el procedimiento acordado, conservar SQL/hash y ejecutar postflight de ACL/definiciones.

Tras aprobar y verificar la activación: conectar el detalle cliente a este RPC, renderizar solo sus cuatro columnas, volver a validar identidad y selección ante respuestas tardías, mostrar ausencia/error por separado, y etiquetar scheduled_date como **Fecha programada del viaje**, nunca ETA. Si no devuelve fila, limpiar información logística; no consultar tablas operativas como fallback. La ficha e historial publicados en 508f2d7 siguen disponibles mientras tanto.

## Origen y carga no existentes

No se inventaron valores ni se derivó origen a partir del nombre de ruta. Siguiente propuesta de captura: origin_text y service_label como texto público validado, package_count entero positivo nullable y gross_weight_kg decimal positivo nullable, con unidad kg explícita. Campos vacíos permanecen null. Requiere aprobar esquema y definir responsables/fuente operativa, edición/auditoría y carga histórica antes de crear columnas o importar. No llenar desde notas privadas ni migrar por coincidencia de nombres. El primer RPC no promete devolver campos que no existen.

## Mapa de puntos, sin GPS

Opción técnica para evaluar: MapLibre como renderizador local y MapTiler Cloud para cartografía/geocodificación. Mostrar únicamente puntos de origen/destino verificados, con fuente/fecha/precisión; no camión animado, ruta recorrida, ETA ni línea que parezca trayectoria real. Operaciones debe confirmar coordenadas antes de compartirlas. No usar ubicación del navegador.

Transferencia a aprobar: geocodificación enviaría el texto de origen/destino al proveedor; la descarga de mapas transmite IP y área/zoom solicitados (y puede revelar zona geográfica). No enviar IDs de entrega, nombres de clientes ni notas. Definir política de conservación, clave restringida por dominio y presupuesto antes de integrar. No se ha enviado ninguna dirección ni coordenada, instalado SDK, creado cuenta ni clave.

Precio consultado 19/10/2026: MapTiler publica Flex desde USD 30/mes más tráfico adicional; Free se presenta para pruebas/PoC/personal/no comercial, por lo que no se presupone adecuado para operación comercial. Falta volumen mensual para calcular coste total y límite aprobado. Fuentes: https://www.maptiler.com/cloud/pricing/ y https://docs.maptiler.com/cloud/api/geocoding/ . Alternativa de cartografía propia requiere infraestructura, almacenamiento/licencia y operación presupuestados; tampoco se activa por inferencia.

## Evidencia aislada

`INCARGO_PG_RUNTIME=<runtime local> node --test incargo-app/tests/client-logistics-postgres.test.cjs`: **7/7**, seis casos más suite principal, PostgreSQL desechable en loopback. Prueba A/B y acceso por ID ajeno, helper directo, usuario sin vínculo, ID desconocido/nulo, identidad nula, rol driver/operations sin vínculo, doble rol, destino null, revocación/reasignación y ACL (incluido EXECUTE por defecto de service_role), además de ausencia de lectura directa de entregas por cliente. El servidor local se detiene al terminar. No se consultó Supabase remoto.

La propuesta usa funciones con permisos acotados conforme a la documentación oficial: https://supabase.com/docs/guides/database/functions . El índice changelog.md no pudo recuperarse con el lector web (tipo text/markdown no soportado); no se actualizó ninguna dependencia ni API SDK.