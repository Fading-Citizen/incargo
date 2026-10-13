# Primer operador: estado y paso administrativo

Persona y dirección autorizadas por Lenu: `cepaal12@gmail.com`. A las 21:36 UTC del 13 de octubre de 2026, el recuento de `auth.users` para esa dirección era cero; no había invitación registrada ni cuenta confirmada. **No se ha enviado correo, creado usuario, insertado membresía ni establecido contraseña.**

La página `https://www.incargo.co/activacion.html` acepta el fragmento de invitación de Supabase (`#access_token=...&type=invite` o `#token_hash=...&type=invite`), lo retira de la barra de direcciones, valida la sesión con Supabase Auth y permite a la persona establecer su propia contraseña. La portada redirige esos fragmentos a esa página si la invitación usa la Site URL raíz. La prueba local con respuestas ficticias cubre éxito, contraseña inválida, reintento, enlace caducado y error del proveedor. **No se ha probado con un correo/invitación real.**

Bloqueos administrativos concretos:

1. El conector Supabase disponible expone SQL, migraciones, proyecto y funciones Edge, pero no `inviteUserByEmail`, creación de usuario Auth ni lectura de configuración de redirecciones. Las únicas variables Vercel comprobadas son URL y clave publicable; no hay servicio administrativo disponible para enviar invitación sin configurar acceso nuevo. No crear un usuario con SQL directo en `auth.users` ni obtener una clave de servicio para sortearlo.
2. Un administrador de Supabase Incargo debe verificar **Authentication → URL Configuration**: Site URL en `https://www.incargo.co` o redirección permitida a `https://www.incargo.co/activacion.html`. Si necesita cambiar esa configuración, solicitar autorización específica antes de hacerlo.
3. Con esa ruta verificada, el administrador usa **Authentication → Users → Invite user** una sola vez para `cepaal12@gmail.com`, con redirección a la página de activación si la interfaz lo admite. Si la invitación se envía pero el resultado es incierto, comprobar primero `auth.users.invited_at` para ese correo; no repetir automáticamente.
4. Solo cuando exista el usuario Auth, insertar una membresía de operaciones para el UUID **exacto** de ese correo (no para una coincidencia parcial). Ejemplo administrativo para revisar, aún no ejecutado:

```sql
insert into public.incargo_memberships(user_id,role)
select id,'operations'
from auth.users
where id = '<UUID_VERIFICADO_EN_AUTH_USERS>'::uuid
  and lower(email)=lower('cepaal12@gmail.com');
```

Comprobar que se insertó exactamente una fila. Lenu establece personalmente la contraseña desde su correo y entra por `/operaciones.html`; no afirmar que el inicio de sesión funciona hasta que él lo pruebe. No incluir el enlace personal ni códigos en tickets, chat o logs.

## Fuente heredada confirmada

`Inspecciones Incargo` se confirmó como fuente oficial. `legacy-mapping.md` y `legacy-schema.proposal.sql` describen la migración de 20 inspecciones y seis vinculaciones; el SQL **no se aplicó**. Para importar estos datos personales hay que aprobar primero el esquema privado, audiencia de lectura, retención y manejo de evidencias incompletas. La confirmación de la fuente no decide por sí sola esas políticas. El historial de viajes/entregas continúa siendo un dominio aparte sin fuente verificada.
