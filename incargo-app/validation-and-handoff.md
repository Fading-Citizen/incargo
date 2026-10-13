# Validación de permisos y habilitación

## Estado remoto verificado

- Repo `Fading-Citizen/incargo`, `main`: `5a698603d56341ed000b53b2872e29b2222a8de5`; árbol local limpio antes de esta documentación. Vercel proyecto `incargo-36wq` desplegó ese SHA como `dpl_UFU14NM17w7APijy4gePKtEEw2yd`, estado `READY`, URL de despliegue `https://incargo-36wq-k552ejlpu-fading.vercel.app`, alias `https://www.incargo.co` y `https://incargo.co`.
- Supabase proyecto `gmjsqboyuvierfwruspv`: migraciones `20261013200254 incargo_operations_v1`, `20261013200326 incargo_permissions_fix`, `20261013200539 incargo_hardening`, `20261013200700 incargo_anon_revoke`. Función Edge `incargo-tracking`, versión 1, `ACTIVE`. `verify_jwt=false` porque la función autentica la consulta mediante un token aleatorio de 256 bits. Comprueba el origen para CORS, pero el origen HTTP no es una barrera de seguridad. El RPC de lectura solo es ejecutable por `service_role` dentro de la función.
- Cinco tablas públicas vacías, una tabla privada de enlaces, bucket privado `incargo-proofs`, cero usuarios Auth. No hay fixtures productivos ni historial importado.

## Matriz de autorización

`bash incargo-app/tests/policy-local.sh` arranca Postgres 17 efímero, instala el mismo SQL con esquemas mínimos de Auth/Storage y ejecuta fixtures sintéticos. La última corrida pasó. Es una prueba aislada del SQL; Supabase Auth/Storage/Edge en producción solo admite pruebas negativas mientras no existan identidades y entregas reales.

| Caso | Resultado aislado comprobado | Pendiente productivo |
| --- | --- | --- |
| Operaciones | Lee dos viajes y dos entregas, reasigna conductor con rol, inserta entrega, crea enlaces | Inicio de sesión y flujo real con primer operador |
| Conductor asignado | Lee solo un viaje, una entrega y su membresía; crea novedad y confirma con objeto de su entrega | Subida real por navegador, foto y tamaño en Storage |
| Conductor no asignado | RPC de novedad y subida a ruta ajena rechazados; no puede insertar viaje ni cambiar asignación | Comprobar con dos usuarios reales y logs de API |
| Usuario autenticado sin rol | Lee cero viajes/entregas; RPC de enlace rechazado | Inicio de sesión real |
| Anónimo | Sin grants de tabla ni ejecución del RPC de seguimiento; token inválido da `404` en Edge | Ataques de tasa y observabilidad con tráfico real |
| Cliente con token | Dos tokens devuelven solo su entrega respectiva; token inválido, revocado o caducado devuelve nulo | Enlace válido y soporte firmado a través de Edge con datos reales |
| Estado/repetición | Novedad y confirmación repetidas con el mismo `request_id` producen un solo evento; novedad o segunda confirmación tras entrega se rechazan | Reintentos de red del navegador y objeto huérfano si falla RPC tras subir archivo |

Comprobaciones remotas negativas: `anon` no tiene `SELECT` en viajes, `INSERT` en entregas ni `EXECUTE` del RPC de seguimiento; `authenticated` carece de `UPDATE` de `deliveries.status`; bucket privado. La función Edge rechazó un token inválido (`404`). Se verificaron con navegador anónimo la pantalla de ingreso y el rechazo de fragmento inválido. El asesor de seguridad señala `SECURITY DEFINER` para RPCs autenticados: cada RPC comprueba rol o asignación. La alerta de `tracking_links` sin policy es informativa: el esquema es privado y solo las funciones autorizadas lo consultan.

### Límites que no se deben declarar validados

No existe cuenta para ejecutar una prueba positiva de Auth, RLS y Storage en la instancia productiva. El contenedor usa tablas mínimas de Storage, por lo que no demuestra la aplicación del límite de 10 MB ni la inspección real de MIME por la API Storage; esos controles están configurados en el bucket y comprobados en la UI. Tampoco se ha probado un soporte firmado real por la función Edge ni revocación/caducidad por HTTP con un token real. La interfaz crea un `request_id` nuevo en cada envío: el RPC es idempotente para repetir **ese mismo ID**, pero el cliente aún no conserva el ID frente a un fallo de red. Un fallo después de subir la foto puede dejar un objeto privado huérfano; requiere flujo de reintento/limpieza antes de operación intensiva.

## Primer operador: procedimiento pendiente de consentimiento y aprobación específica

La ruta actual es `https://www.incargo.co/operaciones` → correo y contraseña → Supabase Auth `/auth/v1/token?grant_type=password` → lectura de `incargo_memberships`. Configuración observada: proveedor email habilitado, registro no deshabilitado y autoconfirmación por correo desactivada. La página deliberadamente **no ofrece registro ni recuperación** y no crea cuentas ni envía mensajes. Con cero usuarios Auth, nadie puede entrar todavía.

1. Lenu designa explícitamente a la persona y correo del primer operador, obtiene su consentimiento, y aprueba la creación de esa identidad y el mensaje de invitación o el método seguro de entrega de contraseña. Decidir además cómo se establecerá la contraseña; esta web no implementa el callback de invitación.
2. Un administrador autorizado crea/verifica la identidad en **Supabase Incargo → Authentication → Users** con el método de email/contraseña elegido, sin usar claves de servicio en navegador o repo. Confirma el UUID del usuario y que el correo quedó verificado. No marcar otra persona como operador por coincidencia parcial de correo.
3. Tras esa aprobación, el administrador inserta exactamente ese UUID en `public.incargo_memberships` con rol `operations` y verifica la fila. La tabla no concede `INSERT` a usuarios web, por lo que este paso administrativo es necesario. No ejecutar un `UPDATE` de rol amplio ni crear una membresía por patrón de email.
4. La persona entra en `/operaciones` y se prueba creación, asignación y lectura con un viaje ficticio acordado **solo si Lenu autoriza usar fixtures productivos**; de lo contrario se prueba en entorno aislado. Para conductores se repite el alta con rol `driver` y se confirma lectura solo de sus asignaciones.

La decisión faltante para empezar es **identidad y consentimiento del destinatario, mecanismo de contraseña/invitación y autorización del alta/membresía**. Ninguno de esos pasos se ha ejecutado.

## Procesos heredados

Ver `legacy-mapping.md`. La hoja verificada contiene 20 inspecciones y seis vinculaciones; el historial de viajes/entregas no se encuentra allí. La migración de inspecciones/vinculaciones puede prepararse por separado sin esperar una fuente de viajes, pero necesita aprobar el esquema privado, manejo de evidencias truncadas y conciliación antes de importar. El `admin.html` heredado contiene una contraseña en JavaScript del cliente y lee por Apps Script; sigue operativo durante la transición y requiere un plan de sustitución antes de alojar esos registros en la nueva app.
