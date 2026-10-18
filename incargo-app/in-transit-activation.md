> Estado vigente: ver integration-readiness.md. Este documento conserva evidencia cronológica; las referencias a bloqueo Git, aprobación o activación pendiente describen el momento de su redacción.

# Activación remota autorizada de En ruta

El usuario autorizó específicamente las dos funciones y el alcance global actual de operations. Aplicadas y verificadas el 18 de octubre de 2026 en Supabase Incargo, proyecto gmjsqboyuvierfwruspv, main PRODUCTION, organización Incargo, repositorio mostrado Fading-Citizen/incargo. Se utilizó la sesión existente del dashboard; no se extrajeron secretos, crearon credenciales ni utilizó el conector de EFO.

Preflight de solo lectura: las funciones no existían; columnas, restricciones de estados, FK y UNIQUE(request_id) coincidían; authenticated tenía USAGE de incargo_private; sin triggers de usuario en entregas/eventos. Solo se leyeron metadatos, no datos operativos.

Se aplicó el contenido de in-transit.proposal.sql, omitiendo comentarios y normalizando espacios por compatibilidad del editor. Un primer intento del editor mezcló el preflight y produjo `ERROR: 42601: syntax error at or near "begin" LINE 4: begin;`. No fue un rechazo de permisos. Se creó una consulta vacía, verificó su contenido completo y ejecutó la transacción correctamente: `Success. No rows returned`.

Postflight detectó EXECUTE de service_role heredado de privilegios predeterminados del esquema public. Se retiró únicamente de la nueva función public.incargo_start_delivery(uuid,uuid). No se alteraron privilegios predeterminados ni otras funciones. ACL final de ambas: `{postgres=X/postgres,authenticated=X/postgres}`; authenticated=true, anon=false y service_role=false. El propietario postgres conserva sus facultades administrativas.

Definiciones verificadas mediante pg_get_functiondef: incargo_private.start_delivery(uuid,uuid) RETURNS jsonb SECURITY DEFINER; public.incargo_start_delivery(uuid,uuid) RETURNS jsonb SECURITY INVOKER; ambas search_path vacío. Cuerpo del helper coincide con la propuesta: auth.uid, membresía operations FOR SHARE, entrega FOR UPDATE, request_id validado por actor/entrega/tipo, solo pending→in_transit, evento y estado atómicos, repetición no revierte estados posteriores. No hay filtro por empresa para operations, conforme al alcance autorizado.

Prueba remota en transacción READ ONLY con SET LOCAL ROLE authenticated y auth.uid nulo: el wrapper rechaza con SQLSTATE 42501 y mensaje `operations required`. No se invocó ninguna salida con identidad operativa ni se crearon o modificaron entregas reales. La cobertura positiva/concurrente permanece en PostgreSQL local desechable (10/10 TAP) y UI sintética; no se presenta como E2E productivo.

Security Advisor se volvió a ejecutar: 0 errores, 18 advertencias, 5 sugerencias. Las advertencias mostradas corresponden a funciones existentes (incluido public.rls_auto_enable y RPC previas), ninguna de las dos nuevas aparece. No se corrigieron objetos ajenos al alcance.

Consultas del dashboard:
- Aplicación: https://supabase.com/dashboard/project/gmjsqboyuvierfwruspv/sql/d3a23e8e-945c-4d97-a283-78742ed2f0e3
- Postflight final y restricción de service_role: https://supabase.com/dashboard/project/gmjsqboyuvierfwruspv/sql/dcb87146-d750-406d-b1ae-bf58d21c1f8a

Evidencias locales en la tarea: in-transit-remote-preflight.txt, in-transit-first-postflight.txt, in-transit-remote-postflight.txt, in-transit-advisors.txt, in-transit-applied.png e in-transit-verified.png. El SQL fue aplicado por el editor; no se creó registro en supabase_migrations ni se inventó nombre de migración CLI. in-transit-applied.sql conserva el SQL aplicado y el ajuste de ACL para su revisión/versionado posterior; no debe ejecutarse otra vez sobre estas funciones existentes.

Publicación independiente: no commit ni push, UI y reintentos permanecen locales, aprobación de publicación no resuelta por inferencia. No se volvió a ejecutar Git. La inspección de solo lectura encontró git.exe (43352 bytes, atributo Archive), pero Get-Acl devolvió `Attempted to perform an unauthorized operation.` y la lectura del stream Zone.Identifier devolvió `Acceso denegado.` Esto no determina si el origen es ACL del sistema, sandbox u otro control; no se cambiaron permisos ni seguridad. Tampoco acredita rechazo específico de commit/push.
