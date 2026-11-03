# Control administrativo — 3 de noviembre de 2026

El módulo «Control operativo» transforma los registros ya consultados por la sesión en tarjetas por estado, prioridades y una mesa de seguimiento con búsqueda combinada (cliente, referencia, origen/destino, ruta y placa), filtros y lotes de 20 filas. Las novedades se muestran primero. Cada entrega abre su expediente; el regreso identifica el módulo de origen.

Los indicadores son conteos del Snapshot existente, no totales globales ni métricas históricas. Carga desconocida se representa con «—»; una cantidad registrada de cero sigue siendo cero. Un viaje ausente del Snapshot no se clasifica como viaje sin conductor. No se añaden consultas, permisos ni escrituras al backend.

## Verificación local

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 10 pruebas; incluye orden, búsqueda combinada, referencias vacías, viaje desconocido y snapshot vacío.
- `npm run build`: PASS; assets estáticos regenerados.
- `npm run test:browser`: PASS; nuevo resumen, búsqueda, filtros, falta de cantidad, ausencia de coincidencias, snapshot vacío y recuperación mediante actualización, apertura/regreso de expediente; regresiones de roles, navegación, fallos de consulta y bloqueo de finanzas.
- `npm run test:public`: PASS; seguimiento público y navegación existente.
- QA visual: 1440 × 1000 y 390 × 844; sin desbordamiento horizontal en móvil. Capturas completas en `control-overview-desktop.png` y `control-overview-mobile.png`.

Las capturas y pruebas de navegador utilizan fixtures interceptados, identificados como empresas de prueba. No representan datos de producción. No se usó una sesión real del usuario para validar contenido privado; se conserva la integración autenticada existente. No se ejecutaron migraciones ni cambios financieros. No hubo cargos, merge, despliegue a producción ni cambios relacionados con la instalación de Lirien.
