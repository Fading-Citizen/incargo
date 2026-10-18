> Estado vigente: ver integration-readiness.md. Este documento conserva evidencia cronológica; las referencias a bloqueo Git, aprobación o activación pendiente describen el momento de su redacción.

# Confirmación y foto: reintentos dentro del contrato existente

Base: `df4cd09bf9b2750848426fcdd2438c19221c7a0f`. Cambio preparado en `C:/Users/PC/Documents/Codex/incargo/git-main`; aún sin commit ni push de este incremento.

## Demostración previa

Cuatro pruebas aisladas fallaron contra la implementación inicial: respuesta perdida de Storage generaba 2 objetos tras reintentar; respuesta perdida del RPC generaba otra foto y un request_id distinto; dos llamadas simultáneas al submit producían 2 subidas; fallo antes de guardar cambiaba la ruta al reintentar. El código original tampoco tenía un timeout explícito y leía `selectedId`/observación después de esperar la subida, permitiendo mezclar una foto de A con una selección posterior B.

## Contrato comprobado en código

`incargo-app/migration.sql`, función `incargo_confirm_delivery`, bloquea la fila, comprueba la asignación del conductor y reconoce `(request_id, delivery_id, actor_user_id, event_type='delivered')` antes de rechazar una entrega ya completada. Comprueba la propiedad del objeto en Storage antes de insertar soporte/evento y cambiar estado. Las tres escrituras están en la misma función transaccional. `policy-assert.sql` ya contiene prueba de repetir el mismo ID y rechazo de una segunda confirmación con otro ID.

No se ejecutó SQL remoto ni se leyó ningún secreto. Tampoco se repitió aquí el SQL aislado: no hay Docker accesible y WSL informa que no está instalado. Esta revisión del contrato se apoya en el código versionado y las pruebas SQL existentes; las pruebas nuevas usan un backend simulado, no certifican el contrato productivo de nuevo.

La documentación oficial de Storage indica que subir a una ruta existente devuelve conflicto y que upsert sobrescribe. Este cambio NO usa upsert y NO interpreta un conflicto como prueba de éxito: https://supabase.com/docs/guides/storage/uploads/standard-uploads . El índice changelog.md no se pudo recuperar con el lector web por su Content-Type Markdown.

## Implementación

- Un intento inmutable en memoria conserva entrega, archivo File, receptor, observación, request_id y ruta de objeto.
- Guarda de ejecución única contra doble submit, además del botón desactivado. Se bloquean selección de entrega, campos y novedad mientras hay una confirmación pendiente.
- Primer intento: subir a ruta única y ejecutar RPC. Reintento: ejecutar primero el mismo RPC y payload. Si ya se confirmó, su idempotencia devuelve éxito; si la foto existe, verifica propiedad y confirma; solo `400 proof missing` permite subir otra vez a la MISMA ruta con el MISMO archivo.
- Fallos de red, timeout, conflicto o permisos nunca se convierten en éxito supuesto. Se conserva el intento para verificar; no se borran fotos, no se sobreescriben objetos.
- Timeout de 60 segundos por fase: subida, RPC y actualización posterior. AbortSignal y comprobaciones de sesión impiden que respuestas tardías reanuden pasos con otra identidad.
- Si el RPC confirmó pero falló la actualización de lista, `Actualizar vista` solo vuelve a leer; no repite foto ni RPC.
- Al cerrar sesión se eliminan el intento y los campos. Un beforeunload avisa si el resultado sigue pendiente; es una ayuda de UX, no una garantía de persistencia.

## Evidencia

63/63 tests Node: `confirmation-retry`, `client-refresh`, `session-integration`, `tab-session`, `visible-encoding`; 3/3 Python y `node --check`. Los 12 tests nuevos cubren pérdida de ambas respuestas, timeout de ambas fases y de refresh, respuesta tardía, doble llamada, intento inmutable, fallo antes de guardar, rechazo de autorización, revocación de rol, logout y segunda entrega independiente.

QA navegador real con servidor de fixtures sin conexiones externas: tras perder respuesta del RPC, la pantalla conservó los campos y mostró `Verificar y reintentar`; al pulsarlo quedó `Entrega y soporte guardados`, con 1 subida, 1 objeto, 2 llamadas idempotentes al RPC y 1 evento. Móvil: ancho DOM 355 px, sin overflow. Consola sin errores capturados. Capturas: `retry-pending-desktop.png`, `retry-pending-mobile.png`, `retry-success-mobile.png` dentro de esta tarea.

El selector local de archivos de la extensión no permite subir sin habilitar acceso a file URLs. No se cambió ese permiso. La QA usó un File sintético en memoria generado por el propio fixture; no verifica carga nativa de archivos ni Storage productivo. Ninguna sesión ni entrega real se modificó.

## Límite y decisión pendiente para recuperación durable

La garantía está limitada a reintentos del mismo intento mientras esta pestaña conserva su memoria y la sesión sigue autorizada. Recargar/cerrar/caer el navegador o expirar sesión pierde el archivo y el payload en memoria. Si ya hubo commit, la lectura normal mostrará el estado entregado; si solo se subió la foto puede quedar un objeto privado huérfano. No se promete exactamente-una-vez entre pestañas, reinicios ni dispositivos.

Para garantizar recuperación después de perder la pestaña, preparar un contrato de intento durable: registro único por identidad/entrega/request_id con payload inmutable, ruta y hash del archivo, estados pendiente/subido/confirmado, consulta autenticada de resultado, y política explícita de caducidad/revisión de objetos huérfanos. El servidor debe validar asignación en cada paso, mantener el bloqueo/commit atómico actual y rechazar reutilización del ID con payload distinto. La UI puede retener solo el identificador y pedir el mismo archivo si aún falta, verificando su hash. No implementar ni desplegar este contrato sin autorización específica de esquema/RPC/permisos, conservación de datos y eventual limpieza de Storage. La limpieza no forma parte de este cambio.

## Publicación

La solicitud pendiente correspondía exclusivamente a una carga de archivo del ensayo local, no a commit/push. No se repite esa carga. La publicación del incremento está autorizada mediante los controles de ejecución correspondientes.

El incremento está preparado para publicación autorizada. La carga del ensayo local permanece separada y no se repite.


Actualización del incremento En ruta: documentación incorporada localmente al repo; publicación aún detenida. Se preservó la implementación de confirmación y se ejecutaron sus 12 regresiones dentro de las 73 pruebas Node.
