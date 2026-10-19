# Mis envíos: filtros y cierre del detalle — 2026-10-19

Base local y remoto: 07d9d8f12d09361502a0510260510163fb16887a; árbol limpio antes de editar. Sin AGENTS.md encontrados en repo/padres consultados. Git portable oficial independiente 2.56.0.windows.2 instalado bajo Documentos/Codex/2026-10-17/task-2/git-independent-2.56.0.2, sin cambios globales; firma Authenticode válida de Johannes Schindelin y SHA256 075e158ef8e1f0ab80b347e245405d3eca735c2dc88fd8e032e137d0ca61f61b coincidente con release oficial git-for-windows/git v2.56.0.windows.2. No se utilizó la instalación prohibida.

Buscar remesa y Estado se intersectan sobre las filas ya cargadas y autorizadas. Se informa el número visible y el total cargado; Cargar más sigue accesible con filtros. Limpiar restablece ambos controles sin pedir datos. Actualizar mantiene filtros; cerrar sesión los limpia. Una recarga de documento comienza con controles vacíos. Los mensajes de error/carga se conservan al filtrar y no se confunden con lista vacía.

Cerrar detalle y Escape invalidan respuestas tardías, limpian los hitos y devuelven el foco al botón de apertura, o a buscar remesa si ese botón fue sustituido. Abrir mueve el foco al encabezado del detalle. Cambiar filtros cierra el detalle para evitar asociarlo con otro resultado.

Verificación: 51 pruebas relevantes Node (cliente/refresh/sesiones/codificación), incluyendo cinco nuevas regresiones: composición y limpieza sin requests; paginación/error/reintento; cierre/Escape con respuestas tardías 200/500/401; filtro durante detalle; foco de respaldo. Sintaxis y diff check. No hay scripts de build/tipos/lint configurados para esta interfaz estática. No cambia Auth, RLS, API, esquema ni escrituras.

QA browser con fixture local y CSP connect-src none: desktop y breakpoint móvil solicitado390px (viewport interno observado355px por escala del navegador), sin desbordamiento; búsqueda+estado, limpiar, detalle, Escape/foco, error persistente y vacío. Tamaño del navegador restaurado. Datos sintéticos, sin backend real.

QA cliente real anterior a este cambio: sesión autenticada con PRUEBA-QA-20261016-001 Pendiente; detalle sin hitos; actualizar y recarga restauran listado/sesión. Ese resultado no acredita estos controles nuevos hasta comprobar publicación.

Conductor: prueba local adicional previa driver-late-load-review.test.cjs (en directorio de tarea) aprobó respuesta inicial tardía de A después de iniciar B, variantes200/401. No se repitió ni se presenta como E2E productivo. Siguen pendientes conductor autenticado, aislamiento backend entre empresas/roles y transiciones reales; no se crearon cuentas ni operaciones. La imagen original y migración histórica mantienen sus límites previos.