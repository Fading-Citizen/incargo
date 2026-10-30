# Panel operativo Incargo

Integración React progresiva en `logistica-1.0.0/operaciones.html`, ruta operativa existente. No hay una aplicación paralela, demo, nuevo login o nueva raíz de despliegue. Los formularios y acciones reales permanecen en la misma página y usan sus adaptadores originales. Los componentes React se compilan a assets estáticos: no se migra el sitio público de HTML a Next.js ni se necesita un servidor nuevo.

## Procedencia

Fuente de solo lectura: `EFO-Latam/xtmpanel`, main verificado `564ded98c7b447d5a50b1554616efebb79dee277`.

- `src/components/PanelPrimitives.tsx`: JSX de `src/components/ui/PanelPrimitives.tsx`; se elimina únicamente el fondo neural decorativo y su almacenamiento de preferencias.
- `src/components/DashboardWidget.tsx`: JSX de `src/components/dashboard/DashboardWidget.tsx`; Link de Next sustituido por enlace nativo para el host HTML existente.
- `src/components/PanelNavigationIcon.tsx` y `src/lib/panel-navigation-icons.ts`: componentes e iconos originales, import local.
- `src/panel-design.css`: sistema de componentes original. `src/styles.css` aplica tokens Incargo verificados en `css/incargo-redesign.css`: dorado `#d5a817`, verde oscuro `#142927`, fondo `#f5f4ee`.

Esta es extracción de componentes reales del panel Next.js, no conversión de la aplicación Incargo a Next ni sustitución de su backend. No se importa el shell con permisos/datos demo de Xtreme. No se copian secretos, SDKs de negocio, proveedores ni fixtures de la fuente.

## Contratos y cobertura

| Recorrido | Integración |
| --- | --- |
| Inicio de sesión, sesión por pestaña, expiración, cambio de rol, salida | Adaptadores originales `incargo-session.js` / `incargo-app.js`, sin cambios de autorización |
| Viajes y asignación | Formulario real incorporado en la navegación, tablas `incargo_trips` y `incargo_memberships` |
| Entregas, búsqueda, carga y salida a ruta | Formulario, filtros y validaciones originales; `incargo_deliveries`, `incargo_start_delivery` |
| Enlaces limitados | Crear/listar/revocar con RPC existentes, sólo tras acción explícita; no envíos externos |
| Conductor, novedades y comprobante | Acceso separado por rol dentro de la misma página; RPC y storage existentes preservados |
| Cuentas, vínculos y solicitudes de clientes | Formularios existentes dentro del panel; RPC de administración existentes |
| Mi tablero, clientes y referencias documentales | Derivación de respuestas ya autorizadas, sin consultar tablas adicionales ni inferir identidades |
| Portal cliente, activación, solicitud de acceso y sitio público | Rutas y archivos preservados |
| Cotizaciones, costos y cartera | Pendientes: no se encontraron contratos operativos verificados; sin controles que simulen resultados |

El snapshot de presentación contiene sólo viajes y entregas ya cargados para operaciones. No contiene tokens, perfiles Auth ni usuarios. Se borra al salir; carga/error no muestran cifras anteriores como actuales. No usa localStorage ni escribe en Supabase. Las mutaciones siguen revalidando sesión/rol y RLS con los adaptadores existentes.

Verificación read-only de Supabase: proyecto Incargo `gmjsqboyuvierfwruspv`, ocho tablas `incargo_*` con RLS habilitada y RPC operativas presentes. Sin lecturas de registros personales, migraciones o escrituras productivas para QA.

## Desarrollo

```sh
cd panel
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Los assets compilados versionados en `logistica-1.0.0/panel-assets/` permiten conservar la publicación estática actual sin modificar Vercel. React no es propietario del DOM de los formularios heredados: sólo se monta en `incargo-panel-root`.
