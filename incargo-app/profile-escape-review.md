# Perfil de operaciones: Escape y retorno de foco — 17/10/2026

Base revisada: 9a9525167aaf81bc3e17f582f95f4b3904f16734, main local/remoto coincidentes y checkout limpio. No se encontraron AGENTS.md en el checkout ni su carpeta padre Incargo. No se modificaron sesiones, autenticacion, roles, DB, permisos ni infraestructura.

Defecto: el perfil se abria y enfocaba su titulo, pero no tenia manejador de Escape. El cierre mediante el mismo disparador tampoco restauraba expresamente el foco.

Correccion: Escape en el perfil o su boton cierra la seccion, sincroniza aria-expanded=false y enfoca Mi perfil. Tab y otras teclas conservan su comportamiento. Escape fuera del perfil no se intercepta. La limpieza por salida/fin de sesion sigue cerrando sin enfocar un boton que va a quedar oculto. El mismo componente sirve a operaciones y conductor.

Evidencia: se extendio el fixture de DOM/acciones simulados que ejecuta incargo-app.js real en node:vm. Seis casos nuevos: cinco fallaban antes, seis pasan despues. Cubren Escape para operaciones/conductor, ciclo repetido, Tab, Escape en seccion oculta, salida y cierre por disparador. Verifican que cerrar no agrega solicitudes. No usan login ni datos productivos.

Comprobaciones: 45/45 pruebas Node (client-refresh, session-integration, tab-session), 3/3 unittest Python, node --check del JS modificado y git diff --check. No hay package.json ni build/tipos declarados en este sitio estatico.

Limite visual: se redescubrieron las herramientas soportadas al inicio y tras las pruebas; no se expone cua_repl, Computer Use ni runtime de navegador. No se ejecutaron los scripts Playwright que lanzan Chromium como sustituto. Estos resultados son pruebas aisladas de comportamiento, no QA visual, tactil o de navegador real. Tampoco se realizaron operaciones reales ni cambios de registros.
