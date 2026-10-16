# Área de cliente: contrato pendiente

Estado al 16 de octubre de 2026. Documento de diseño; **no es una migración ni habilita acceso**.

## Hallazgo en la implementación actual

- `logistica-1.0.0/operaciones.html` y `incargo-app.js` admiten únicamente `operations` y `driver`. El panel «Mi perfil» agregado muestra correo de Auth y rol; no es un área de cliente.
- `public.incargo_memberships.role` solo acepta `operations` o `driver`. La pantalla de ingreso rechaza cualquier otro rol.
- `public.incargo_deliveries.customer_name` es texto libre. No hay `customer_id`, cuenta comercial ni vínculo entre una identidad Auth y las entregas. La coincidencia de nombre, correo, factura o remesa no prueba propiedad.
- Las políticas RLS de entregas, eventos y soportes solo permiten lectura a operaciones o al conductor asignado. No hay permiso de lectura de «mis entregas» para cliente.
- `/seguimiento.html#token=…` consulta una entrega mediante un token aleatorio, limitado, revocable y con vencimiento. No enumera todos los envíos de una cuenta y no equivale a un perfil autenticado.
- La fuente canónica de viajes y entregas y el procedimiento de alta real siguen pendientes según `README.md` y `validation-and-handoff.md`. No hay evidencia local de una identidad de cliente ya vinculada a datos.

## Contrato mínimo que requiere decisión y autorización

1. **Identidad comercial canónica.** Definir cómo se representa un cliente/empresa y qué personas pueden ver sus envíos. Recomendación: identificador interno estable de cuenta comercial, vínculo administrado entre `auth.users.id` y esa cuenta con rol de cliente, y asociación explícita de cada entrega a la cuenta. No derivar autorización de `customer_name` ni de metadatos editables del usuario.
2. **Asignación y conciliación.** Operaciones debe asociar entregas nuevas a la cuenta correcta a partir de una fuente verificada. Para entregas existentes, preparar un mapeo revisado y conciliación antes de asignarlas; las ambiguas quedan sin asignar. No migrar automáticamente por texto de cliente, email o número de factura.
3. **Lectura acotada en servidor.** Exponer una lista de entregas para la cuenta de la identidad autenticada, con RLS o una API servidor que derive el alcance de `auth.uid()` y la relación administrada. El cliente no debe poder cambiar estado, asignación, relación de cuenta ni datos de terceros. Definir si personas de una misma empresa comparten visibilidad y cómo revocar acceso.
4. **Campos permitidos.** Lista inicial: referencia autorizada, estado, fecha de actualización y destino solo si el dueño de los datos lo aprueba. Detalle: secuencia de estados y soporte temporal solo si la autorización de lectura y el alcance del archivo privado están probados. Evitar nombres de terceros, datos de conductor, observaciones internas y rutas completas sin decisión expresa.
5. **Cuenta y sesión.** Definir invitación/alta de clientes, verificación de correo, recuperación, expiración/renovación de sesión y cierre. Una sesión expirada debe limpiar la vista y solicitar nuevo ingreso. No reutilizar el token de seguimiento como sustituto de la relación de cuenta.

## UI una vez exista el contrato

Ruta propuesta: `/cliente` o `/mis-envios`, con acceso desde una entrada separada del acceso operativo. Estados: sin sesión, cargando, lista vacía, error recuperable, sesión vencida y lista/detalle. Cada estado debe ocultar datos anteriores al cambiar de cuenta o perder autorización. Diseño responsive y accesible, sin edición de identidad ni credenciales en esta fase.

## Pruebas obligatorias antes de publicar la vista

- Dos clientes A/B, cada uno con entrega propia, y un usuario sin rol: A solo obtiene A; B solo obtiene B; sin rol obtiene cero datos. Probar tanto API/RLS como interfaz, no únicamente filtros de navegador.
- Cuenta con cero entregas, error de red y token de sesión vencido: estados claros, sin retener datos de la cuenta anterior.
- Revocación de vínculo y de enlace de seguimiento; acceso directo a IDs ajenos y a soportes privados rechazado.
- Fixtures sintéticos aislados; ninguna cuenta, envío, correo o archivo real de prueba sin autorización específica.

## Decisión pendiente

Confirmar el modelo de cuenta comercial y las personas autorizadas, la fuente que asigna cada entrega a esa cuenta, y el subconjunto de datos que un cliente puede ver. Con eso se puede revisar una propuesta de esquema, RLS/API y migración antes de aplicarla; solo después se implementa la UI conectada.

## Propuesta SQL concreta (sin aplicar)

`client-portal.proposal.sql` define `incargo_client_accounts` (cuenta comercial), `incargo_client_memberships` (`auth.users.id` exacto → una cuenta; sin deducción por dominio de correo), `incargo_client_delivery_links` (una entrega → una cuenta explícita) y `incargo_private.client_link_audit`. Las tres tablas públicas tienen RLS activado y ninguna lectura directa para `anon` o `authenticated`.

Solo una persona con rol existente `operations` puede ejecutar los RPC de alta de cuenta, vínculo/desvínculo de usuario y asignación/desasignación de entrega. La UI de cliente usaría `incargo_client_my_deliveries()` y `incargo_client_delivery_milestones(delivery_id)`, que obtienen el alcance desde `auth.uid()` y las relaciones administradas. Entregas sin vínculo no aparecen. Un vínculo a otra cuenta se rechaza por la clave primaria y requiere desasignación explícita con auditoría. No se amplían las políticas de lectura existentes de viajes, entregas, eventos ni Storage.

Los campos de lectura propuestos son referencia de remesa ya existente, estado, fecha de creación y último hito; el detalle agrega solo tipo y fecha de los eventos. Quedan fuera notas internas, soporte/fotos, nombre de receptor, identidad del conductor, otras cuentas y datos de dirección. Mostrar más campos exige otra revisión.

El esquema base limita `event_type` a `created`, `in_transit`, `exception` y `delivered`. Los RPC filtran expresamente esos cuatro hitos tanto en el detalle como al calcular `last_event_at`; no devuelven `note` ni `actor_user_id`. `exception` conserva el estado real de novedad sin revelar la nota interna. Si el esquema incorpora nuevos tipos de evento, no se expondrán al cliente hasta aprobarlos.

Antes de aprobar la migración hay que confirmar quién verifica el UUID exacto de cada usuario y asigna entregas, si una cuenta comercial representa a varias personas explícitamente vinculadas, si una entrega siempre tiene un único cliente visible y si la remesa puede mostrarse como referencia al cliente. Las pruebas aisladas deben cubrir cliente A/B, entrega sin vínculo, usuario sin vínculo, sesión caducada, revocación y acceso a ID ajeno. Ningún dato histórico se asignará automáticamente.

## Verificación local de la propuesta

`bash incargo-app/tests/client-portal-proposal-local.sh` pasó el 16 de octubre de 2026 en un contenedor Postgres 17 desechable. Probó aislamiento A/B, cuenta vinculada sin entregas, usuario sin vínculo, sesión sin `auth.uid()`, rechazo de asignación por cliente, rechazo de segundo dueño de una entrega, revocación del vínculo y ausencia de lectura directa de la tabla de vínculos. Es una prueba aislada del SQL propuesto, no de Supabase productivo ni de la futura UI. No se aplicó migración, no se crearon cuentas reales y no se publicó el portal.

## Implementación local pendiente de despliegue

`logistica-1.0.0/cliente.html` y `incargo-client.js` presentan una vista de remesas con estados e hitos, sin notas ni datos de conductor. `operaciones.html` añade controles para crear cuenta y vincular/desvincular UUID de usuario y entrega explícitos; no crea usuarios Auth ni vincula por correo. El área cliente no está enlazada desde la navegación pública mientras los RPC no existan en el proyecto.

La propuesta añade `incargo_client_identity()` para distinguir una cuenta vinculada de una lista vacía, `incargo_client_admin_accounts()` solo para operaciones y paginación de 50 entregas por cursor. `node incargo-app/tests/client-ui.test.cjs`, `node incargo-app/tests/live-ui.test.cjs` y `bash incargo-app/tests/client-portal-proposal-local.sh` pasan con fixtures locales. Estas pruebas no sustituyen una sesión real ni validan el proyecto remoto.

**Estado de aplicación:** el 16 de octubre de 2026 se verificó por HTTPS la Management API oficial del proyecto `gmjsqboyuvierfwruspv`, se confirmó que la propuesta no estaba aplicada y se ejecutó exactamente el SQL con SHA-256 `c3082b62ec7ada903aaed3a753d98b50d40168545763f9c394c3c1d3ff205d4c` mediante la operación oficial de migración. Quedó registrada la versión `20261016035917`, nombre `incargo_client_portal_v1`. La verificación posterior confirmó las cuatro tablas con RLS, sin lectura directa para `anon` ni `authenticated`, y las nueve funciones con `EXECUTE` solo para `authenticated`. No se crearon cuentas, vínculos ni entregas de prueba remotas; la UI dependiente no se publicó.

## Activación local pendiente de publicación

La navegación pública enlaza a `cliente.html` como «Mis envíos». El panel «Accesos de cliente» se muestra tras iniciar sesión con rol `operations`; si falla la carga de cuentas, sus formularios quedan desactivados hasta reintentar. La ruta de cliente presenta mensajes separados para falta de vínculo, lista vacía, error de red, sesión vencida y revocación. El 16 de octubre se verificaron con fixtures aisladas la entrada desde la navegación móvil, el reintento del RPC de cuentas, el panel operativo, el acceso por roles, la paginación, las carreras de sesión y la ausencia de desbordamiento horizontal en móvil; las pruebas de UI y SQL locales pasaron. No se usaron cuentas ni entregas reales para este QA y no se publicó el frontend.
