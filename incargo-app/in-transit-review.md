> Estado vigente: ver integration-readiness.md. Este documento conserva evidencia cronológica; las referencias a bloqueo Git, aprobación o activación pendiente describen el momento de su redacción.

# Salida por entrega: propuesta local

Base comprobada por lectura de refs: df4cd09bf9b2750848426fcdd2438c19221c7a0f. Sin commit, push ni despliegue de este incremento. No se aplicó SQL remoto.

## Contrato implementado

Operaciones dispone de «Marcar En ruta» en entregas pendientes. El conductor conserva novedades y confirmación, incluida confirmación directa desde pendiente. No se reabre una entrega con novedad o completada. El estado mostrado procede de una nueva lectura del servidor.

La función privada bloquea la membresía de operaciones FOR SHARE y la entrega FOR UPDATE. Inserta el evento y actualiza el estado en una sola transacción. El request_id identifica el intento; una repetición válida devuelve el estado actual sin restablecer estados posteriores. Otro intento sobre una entrega ya en ruta no duplica el evento. Se rechaza reutilizar el request_id para otra entrega o actor.

La UI conserva el request_id durante el intento, evita dobles acciones y usa timeout. Si el RPC confirmó pero falló la lectura, el siguiente intento solo actualiza la lista. Un RPC aún no instalado muestra un error explícito. La sesión revocada o cerrada invalida respuestas tardías. Recargar pierde el intento en memoria, pero la lectura normal y la idempotencia por estado impiden volver a generar una salida ya registrada.

## Cambio de acceso pendiente de autorización específica

`in-transit.proposal.sql` es una propuesta revisable, no una migración aplicada ni registrada. Agrega:

- `incargo_private.start_delivery(uuid,uuid)`, SECURITY DEFINER y search_path vacío, con comprobación de auth.uid y membresía operations.
- `public.incargo_start_delivery(uuid,uuid)`, envoltorio SECURITY INVOKER.
- EXECUTE para authenticated en ambas funciones, tras revocar privilegios por defecto de PUBLIC, anon y authenticated. No modifica grants de tablas, RLS, Auth ni Storage.

El acceso al esquema privado ya existe en las propuestas base. El permiso EXECUTE del helper permite invocarlo directamente si existe una ruta SQL autorizada, por lo que contiene las mismas comprobaciones de identidad/rol y bloqueo; no depende del envoltorio para autorizarlas.

El rol operations actual tiene ámbito global dentro del proyecto Incargo. No existe relación operador-empresa para atribuirle aislamiento por empresa. Los clientes A/B siguen restringidos por sus vínculos comerciales existentes. Si se desea segmentar también operaciones por empresa, requiere un contrato y autorización distintos.

La solicitud pendiente correspondía exclusivamente a una carga de archivo del ensayo local, no a commit/push. No se repite esa carga. La publicación del incremento está autorizada mediante los controles de ejecución correspondientes.

## Evidencia local

- 73/73 pruebas Node: 10 nuevas de salida, 12 de reintento de confirmación, más sesión, refresh y codificación existentes.
- PostgreSQL 18 desechable, loopback, datos exclusivamente sintéticos: 9 casos y suite principal (10/10 en TAP). Comprueba permisos de operaciones/cliente/conductor/anon, clientes A/B, idempotencia, rollback de evento y estado, dos conexiones concurrentes, novedad concurrente y revocación concurrente. La prueba carga las propuestas base y esta propuesta; no acredita el esquema remoto.
- QA navegador: operaciones escritorio y móvil (ancho DOM 355 px, sin overflow), acción solo en pendiente; cliente A recibe En ruta y su hito; conductor ve En ruta y conserva novedades/confirmación. Sin errores de consola del conductor capturados. Servidor de fixtures bloquea conexiones externas y no utiliza sesiones reales.
- Capturas en la tarea: in-transit-desktop.png, in-transit-mobile.png, in-transit-client.png.

La QA detectó texto previamente corrupto en cliente.html y textos del portal cliente (caracteres U+FFFD). No se modificaron esos archivos en este incremento. Las pruebas de codificación existentes solo cubren operaciones.html e incargo-app.js: no declarar todo el portal libre de errores UTF-8.

Se preservó el arreglo local previo de reintento de confirmación. No hay build, tipos ni lint configurados para esta web estática. Git local fue denegado por el entorno; no se eludió ni se intentó publicar. Comando afectado: `git -C C:\Users\PC\Documents\Codex\incargo\git-main status --short` (binario portable-git); error: `Program 'git.exe' failed to run ... working directory 'C:\'. Acceso denegado.` No se dispone de un diff Git final ni de SHA nuevo.


Actualización posterior: el defecto UTF-8 del portal cliente quedó corregido localmente con 79/79 pruebas Node y QA sintética móvil/escritorio. Ver client-copy-review.md. Sin publicación ni cambios remotos.


Actualización de activación: las dos funciones En ruta fueron autorizadas, aplicadas y verificadas en gmjsqboyuvierfwruspv. ACL final: propietario postgres y authenticated; anon/service_role sin EXECUTE. No se publicó frontend ni se tocaron entregas reales. Ver in-transit-activation.md para evidencia y límites.
