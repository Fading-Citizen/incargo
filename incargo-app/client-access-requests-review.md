# Activation verified 2026-10-20

Approved by Lenu (Sentinel_c6852628ce4081918c274cdc287461da). The SQL proposal below was applied through the authenticated Incargo Dashboard as one transaction; it is not recorded as a CLI migration. Production postflight confirmed the private table with RLS and owner-only table ACL, all eight functions with empty search_path and execute limited to owner/authenticated, public invoker wrappers and private definer helpers. No request or commercial membership was created for testing. The frontend flag is now enabled. Validation: 86/86 Node and isolated Postgres tests passed after activation. CUA inspected the active client portal and operations request UI against isolated fixtures; synthetic approval removed the pending request. Earlier mobile QA at 355px remains applicable because activation changes only the feature flag. No production customer request was submitted or approved for QA. Historical preparation notes below describe the pre-approval state.
# Solicitudes de cliente: preparación sin activación

Base publicada: a683de78a151bed480aeaa376b663584f38987f9 (origen/carga). Autorización de desarrollo: Lenu Sentinel_bd59a2b32a448191bcfce40b856b8f44. No autoriza aplicar permisos de solicitudes: SQL solo propuesto, flag `IncargoAccessRequests.enabled=false`, sin push ni despliegue de este flujo.

## Qué permiten hoy los contratos

El registro crea/verifica credenciales Auth, no una solicitud. `incargo_client_link_user(p_account,p_user)` ya permite al operador vincular un UUID exacto y genera auditoría; no verifica correo confirmado. La pantalla actual crea cuentas comerciales, vincula UUID y asigna entregas. No puede descubrir solicitantes por correo con esos contratos. El flujo histórico de admin.html es distinto y no se modifica. No se añade un rol cliente a incargo_memberships.

## Flujo preparado

1. Desde Mis envíos aparece un enlace a Solicitar acceso cuando se habilite el flag. La página solicita ingreso con credenciales existentes y nombre de empresa; explica que debe estar verificado y que enviar no concede acceso. Sesión solo en memoria, caducidad original, sin localStorage ni refresh token persistido. Recargar requiere ingresar de nuevo y recupera estado del servidor. El endpoint comprueba el correo confirmado directamente en Auth; no confía en metadata ni email enviado por el navegador.
2. En Operaciones → Accesos de cliente, la sección Solicitudes muestra únicamente quienes enviaron una solicitud explícita, con correo verificado y empresa indicada. Lista hasta 100 pendientes, las más antiguas primero; al procesarlas se muestran las siguientes. No enumera todos los usuarios Auth, no crea solicitudes para registros anteriores y no ofrece un buscador global de identidades.
3. El operador elige una cuenta comercial existente (inicialmente ninguna) y confirma haber verificado identidad/empresa. Aprobar envía ID del solicitante, cuenta elegida y updated_at de la solicitud vista. No asocia por similitud de nombre o correo. Si la cuenta aún no existe, el formulario actual de creación sigue disponible.
4. El servidor bloquea la solicitud, revalida operations, correo confirmado/no eliminado y sin cambio de email, revisa versión y ausencia de vínculo previo, y crea membresía + auditoría + estado aprobado en una transacción. Conflictos no reasignan. Una repetición idéntica es idempotente; una repetición tras desvinculación no reabre acceso. Dos aprobaciones concurrentes para cuentas distintas tienen un único ganador.
5. El cliente consulta pendiente/aprobada o revisión requerida tras revocación. No se envía correo ni se aprueba una cuenta automáticamente. No hay rechazo, borrado o reapertura automatizada en este primer alcance. Las solicitudes ya aprobadas no se reutilizan para restablecer acceso revocado.

## Cambio exacto que requiere aprobación

Aplicar exclusivamente `client-access-requests.proposal.sql` a Incargo gmjsqboyuvierfwruspv después de preflight:

- Crear tabla **privada** `incargo_private.client_access_requests`: user_id único (Auth), email confirmado capturado del servidor, company_claim (1–120 caracteres), estado pending/approved, fechas, cuenta elegida y operador/fecha de revisión. Sin backfill. Habilitar RLS y revocar acceso directo de PUBLIC/anon/authenticated/service_role; no políticas de lectura directa.
- Crear cuatro helpers privados SECURITY DEFINER, search_path vacío, y cuatro wrappers públicos SECURITY INVOKER. EXECUTE únicamente para authenticated y propietario, revocado de PUBLIC/anon/service_role. No conceder SELECT a Auth ni a la tabla de solicitudes.
- `incargo_request_client_access(text)` / `incargo_private.request_client_access(text)`: solo usuario actual con correo confirmado, no vinculado; crea/actualiza su propia solicitud pendiente. No admite un user_id/email arbitrario.
- `incargo_my_client_access_request()` / helper homónimo sin prefijo incargo_: solo estado/empresa/fecha de su propia solicitud. No lista otras personas o empresas.
- `incargo_pending_client_access_requests()` / helper: solo operations; devuelve ID, correo, empresa declarada y fechas de **solicitudes explícitas pendientes verificadas**. Esta es la exposición nueva de datos de identidad que debe aprobarse.
- `incargo_approve_client_access_request(uuid,uuid,timestamptz)` / helper: solo operations; crea el vínculo a cuenta elegida y registro en la auditoría existente de forma atómica. No sustituye ni amplía el antiguo link_user, no toca sus grants. No cambia RLS/Auth/políticas/grants de tablas existentes.

La aprobación requerida cubre almacenar esos datos, mostrar solicitudes verificadas al equipo operations y permitir esa aprobación atómica. No cubre listar todas las identidades Auth, asignar roles operativos, hacer importaciones, aprobar cuentas reales de prueba o enviar comunicaciones.

## Preflight y activación futura

Comprobar ausencia de tabla/funciones, columnas Auth email/email_confirmed_at/deleted_at, definición vigente de is_operations, PK de membresías y estructura de auditoría. Si difiere de lo probado, detener y adaptar la propuesta. Revisar fuentes remotas sin leer emails o secretos innecesarios. Registrar aplicación/SQL y postflight de definiciones, ACL, RLS y funciones; comprobar aislamiento antes de habilitar flag y publicar. La implementación preparada no se activa por sí sola.

## Pruebas y límites

- 8/8 PostgreSQL aislado: correo no verificado/identidad nula, restricciones y reenvío idempotente, privacidad propia, ausencia de enumeración, denegación a cliente/conductor, helper directo, aprobación/auditoría únicas, cuenta inexistente, cambio de correo/verificación, vínculo previo, revocación, solicitud modificada y concurrencia de dos operadores. Denegación de lectura directa y ejecución anon/service_role.
- 4/4 UI de operaciones: selección y confirmación explícitas, contenido literal, vacío/error, doble clic, error incierto y respuesta tardía tras reset.
- 5/5 portal: flag apagado sin llamadas, envío solo de empresa, pendiente/aprobado, doble envío/error, logout/respuesta tardía, controles tras nuevo ingreso, orden de refrescos y caducidad.
- 78/78 ejecución final conjunta de UI de solicitudes, portal y regresiones de sesión/cliente; 8/8 PostgreSQL final tras el ajuste de estado derivado.
- QA CUA local con frontend real, flag habilitado solo por fixture y CSP que bloquea conexiones externas: revisión, selección/confirmación/aprobación sintética, estado vacío; portal con ingreso y envío sintéticos. Escritorio y móvil inspeccionados, ancho efectivo 355 sin desbordamiento horizontal. No se aprobaron ni crearon cuentas reales.
- Sin QA autenticada contra RPC remota porque no está aplicada. Pendiente aprobación exacta y postflight antes de publicar. No se declara completo el onboarding real.
