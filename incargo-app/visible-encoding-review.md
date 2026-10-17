# Codificación visible de operaciones/conductor — 2026-10-17

La QA visual detectó caracteres de reemplazo en los textos reales de operaciones.html e incargo-app.js. La investigación distinguió el código publicado del harness: los archivos son UTF-8 válido pero contienen respectivamente 10 y 41 caracteres U+FFFD (bytes EF BF BD). Los recursos públicos /operaciones e /incargo-app.js respondían HTTP 200 con charset=utf-8 y coincidían exactamente con el checkout bf2aa6dd2740a4341b2dac1562224eb74d4b62cf al normalizar CRLF/LF. La fixture también sirve UTF-8. Por tanto el daño estaba en los literales del código, no en el charset del servidor temporal.

Se restauran acentos, eñes y separadores de texto en esos dos archivos, y se elimina el signo de interrogación corrupto anterior a INCARGO. No cambian estructura HTML, CSS, lógica JS, sesión, autenticación, roles, permisos ni solicitudes.

Regresión: visible-encoding.test.cjs valida decodificación UTF-8 estricta, ausencia de caracteres de reemplazo/mojibake y textos representativos de ambos archivos. Dos pruebas fallaban antes y pasan después. Validación: 47/47 pruebas Node (visible-encoding, client-refresh, session-integration, tab-session), 3/3 unittest Python, node --check y git diff --check. Sitio estático sin build/tipos declarados.

QA visual real con Brave/cua_repl y fixture local con CSP connect-src none, identidad en memoria y respuestas sintéticas: operaciones y conductor muestran los textos correctos; Enter abre el perfil, Escape lo cierra y enfoca profile-toggle, aria-expanded=false. Ancho real 982 px; viewport 982x1628; sin overflow horizontal en conductor. document.characterSet=UTF-8 y ningún U+FFFD en el DOM. Sin errores de consola capturados. Capturas en la tarea de QA: incargo-encoding-fixed-operations.jpg e incargo-encoding-fixed-driver.jpg, comparables con las capturas anteriores. No se realizó login, operación ni modificación de datos reales.

Alcance limitado a operaciones/conductor; no se afirma una auditoría de codificación de todo el sitio ni QA productiva autenticada. No se accedió a D:, secretos o DB; se preservaron las sesiones existentes.
