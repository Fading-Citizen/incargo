# Sesiones temporales por pesta�a

Clientes y Operaciones conservan �nicamente access_token, expires_at original, user_id y marcadores de versi�n/proyecto/contexto en sessionStorage. No conservan refresh tokens, contrase�as, roles ni cuentas comerciales. No renuevan la sesi�n ni ampl�an su duraci�n.

Al recargar validan el token mediante /auth/v1/user y vuelven a consultar la autorizaci�n del contexto. Una sesi�n vencida, inv�lida o sin autorizaci�n se elimina. Un error al restaurar exige ingresar nuevamente. Las claves de ambos accesos son independientes. Una autorizaci�n v�lida distinta al restaurar se obtiene del servidor; durante una sesi�n activa, un cambio de empresa o rol cierra ese contexto al siguiente acceso a datos.

El vencimiento original limpia almacenamiento y pantalla mediante un temporizador y comprobaciones antes/despu�s de solicitudes. Salir elimina el contexto de esta pesta�a e invalida respuestas pendientes. Conserva el alcance local previo: no revoca el JWT en el servidor ni cierra otras pesta�as.

sessionStorage es accesible a JavaScript del mismo origen. Duplicar/restaurar pesta�as puede copiar o conservar su contenido; el vencimiento del token y las reglas del servidor siguen siendo las barreras de acceso. No se modifican Auth, RLS ni configuraci�n de seguridad.

## Validaci�n aislada

Ejecutar con Node:

```sh
node incargo-app/tests/tab-session.test.cjs
node incargo-app/tests/session-integration.test.cjs
node incargo-app/tests/client-refresh.test.cjs
```

Las pruebas usan tokens sint�ticos, reloj controlado, fetch y DOM simulados. Cubren recarga, vencimiento, logout, autorizaci�n, respuestas tard�as, contextos separados y actualizaci�n/paginaci�n de env�os. Las pruebas Playwright existentes incluyen ahora el m�dulo compartido y fixtures de verificaci�n/expiraci�n. Requieren su entorno de navegador; no equivalen a estas pruebas aisladas.

Las sesiones abiertas antes del despliegue no se migran desde memoria: requieren un nuevo ingreso para comenzar a persistir. No se deben leer ni copiar tokens reales para migrarlas o verificar la implementaci�n.
