# Operaciones: rediseño y verificación

Base: 80b8b54d41fe118aea40176f5167c01953d89b3b. Checkout limpio y main remoto coincidente antes de editar. Sin AGENTS.md encontrados en el repositorio y padres consultados. Alcance: presentación de /operaciones, manteniendo contratos de formularios, permisos, solicitudes y reintentos.

La pantalla anterior abría con formularios de alta y mezclaba seguimiento y administración en una página larga. Ahora Entregas es la vista inicial; Viajes y Accesos de cliente tienen paneles separados. Tarjetas con cliente, remesa, factura, estado textual y color; detalles de destino/viaje/enlaces desplegables; búsqueda local y filtro de estado con conteo real de registros visibles. El alta de entrega queda en una sección desplegable. El conductor conserva sus acciones con selección visible, aria-pressed y foco en el detalle (desplazamiento en móvil). Estética clara verde/dorado, controles de foco, campos y tarjetas responsive. Sin métricas inventadas ni dependencias externas nuevas.

El nuevo CSS solo se carga en operaciones. El controlador de presentación no hace solicitudes, no maneja credenciales y no escribe datos. La lógica de salida, asignaciones, vínculos, novedades y confirmación continúa usando las mismas solicitudes. Todos los formularios originales conservan exactamente sus campos/atributos, comprobados contra HEAD. No cambia RLS, Auth, Storage, API ni esquema.

## Evidencia

- Sesión real disponible en el navegador existente: perfil/rol, lista de la entrega de prueba y restauración tras recarga verificados solo en lectura. No se activaron botones de estado, asignación o enlaces. Identificadores personales excluidos del repositorio.
- Fixtures locales servidas en 127.0.0.1 con CSP connect-src none y fetch sintético: cuatro estados, filtro por destino/estado, conteos, detalle, navegación, formulario desplegable y foco, perfil/Escape, lista vacía, carga pendiente, fallo inicial, fallo de cuentas con acciones deshabilitadas, cambio de permiso y salida En ruta. Conductor: selección y formularios de novedad/confirmación visibles, sin subir archivos.
- QA visual revisada en escritorio 1280 x 900 y móvil 390 px de ancho; sin desbordamiento horizontal medido. Capturas antes/después fuera del repositorio en el directorio de trabajo de esta tarea. Dimensiones del navegador restauradas.
- 84/84 pruebas Node: 79 regresiones previas y 5 controles nuevos para filtros, paneles y carrera de error inicial. 29/29 Python. Sintaxis JS, IDs únicos, contratos originales de campos y git diff --check correctos.
- El runner histórico live-ui.test.cjs se ajustó para abrir los paneles y servir los nuevos assets. No se ejecutó su lanzador Linux /usr/bin/chromium en Windows: la QA visual se realizó con el navegador soportado existente. No hay build, tipos o lint configurados para esta interfaz estática.

Se corrigieron durante QA: error de carga anterior al inicio del controlador visual, foco del acceso al formulario y foco/desplazamiento de selección móvil. El contador representa solo las entregas ya cargadas por el acceso actual; los filtros no consultan otras empresas.

## Límites

No acredita E2E de escritura real: no se crearon viajes, entregas o cuentas, no se cambiaron asignaciones/estados, no se subieron pruebas ni se generaron enlaces reales. Reintentos de confirmación, respuestas perdidas y llamadas repetidas siguen cubiertos por las regresiones aisladas. No se comprobó una sesión cliente autenticada en este incremento. La referencia original sigue sin materializar; este diseño no afirma replicarla. Migración histórica sigue siendo preparación local separada.

## Cierre posterior: composición de filtros sobre error

En 0071c69 se verificó el inventario del navegador: solo había una pestaña de Incargo, Operaciones; no había pestaña de cliente propia. Se preservó Operaciones sin navegarla ni cerrar sesión. No se leyeron tokens, credenciales o enlaces privados. Por tanto siguen pendientes la sesión cliente real, su entrega de prueba/historial y la coherencia autenticada entre ambos contextos. No se presenta una pestaña nueva como recuperación de la sesión ausente.

Prueba nueva aislada: error de carga seguido de búsqueda, cambio de estado, navegación entre paneles y limpieza de filtros. Reproducción visible y test rojo: el contador pasaba de Carga pendiente a Sin entregas disponibles aunque la carga había fallado. Corrección: el contador prioriza la marca de error al recalcular filtros. Lista vacía cargada sigue diferenciada; ninguna petición o permiso cambia. Dos regresiones nuevas; 86/86 Node aprobadas, sintaxis y diff check correctos. No se repiten Python ni escrituras de entrega: no hubo cambios en esos componentes. QA visual local del mensaje corregido, sin mutar datos remotos. Los resultados aislados no acreditan E2E cliente real.
