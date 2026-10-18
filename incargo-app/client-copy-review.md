> Estado vigente: ver integration-readiness.md. Este documento conserva evidencia cronológica; las referencias a bloqueo Git, aprobación o activación pendiente describen el momento de su redacción.

# Corrección local de textos del portal cliente

Se repararon 27 caracteres U+FFFD en cliente.html y 61 en incargo-client.js. Se retiró el signo «?» residual junto a INCARGO. Se conservaron estructura, estilos, llamadas, permisos y flujo; las expresiones que reconocen mensajes de sesión se corrigieron junto con sus textos. No se añadieron funciones ni operaciones.

Los literales dañados de cuatro archivos de pruebas también se actualizaron. client-encoding.test.cjs exige UTF-8 válido, ausencia de U+FFFD/mojibake y textos españoles esperados. Incluye activacion.html e incargo-activation.js, que ya estaban correctos y no se editaron. Dos casos nuevos comprueban mensajes de lista vacía, error de consulta, recuperación, validación, cierre de sesión, hitos y acceso revocado.

Validación: 79/79 pruebas Node, incluyendo En ruta y reintentos de confirmación. QA en navegador contra servidor loopback sintético con conexiones externas bloqueadas: acceso, registro (sin envío), recuperación (sin envío), vacío, error 500, acceso caducado 401 y estado/hito En ruta. Capturas escritorio y móvil; ancho móvil DOM 355 px, sin overflow en la vista de error. No se usaron sesiones, correos o entregas reales.

Capturas en C:/Users/PC/Documents/Codex/2026-10-17/task-2/: client-copy-desktop.png, client-copy-recovery-mobile.png, client-copy-error-mobile.png, client-copy-milestone-mobile.png. Copias previas en before-client-copy/.

No se reintentó Git ni se publicó por otra ruta. Sin SQL remoto. La propuesta En ruta y su autorización específica permanecen pendientes; ver in-transit-review.md. El error Git conservado dice: `Program 'git.exe' failed to run ... working directory 'C:\'. Acceso denegado.` Ese es el texto retenido, no una transcripción completa reconstruida. Se produjo al intentar ejecutar el binario portable-git para comandos de lectura; no acredita rechazo de commit/push ni identifica la aprobación manager pendiente.
