# Cierre de regresiones del conductor — 2026-10-19

Base local y main remoto comprobados: `185ee6c2ecf3a1c4463b756e5ba92171897bb695`, árbol limpio antes de trabajar. Este incremento cambia exclusivamente pruebas y documentación; no modifica aplicación, Auth, RLS, migraciones ni datos remotos.

## Evidencia nueva reproducible

```sh
node --test incargo-app/tests/session-integration.test.cjs incargo-app/tests/confirmation-retry.test.cjs incargo-app/tests/tab-session.test.cjs
```

Resultado: **52/52**, sin omitidas. Se agregan cuatro casos al harness existente, sin duplicarlo:

- Respuesta inicial 200 del conductor A después de logout e ingreso de B: conserva sesión, lista y aviso de B; no vuelve a mostrar destino/remesa de A.
- La misma carrera con respuesta 401: no cierra la sesión nueva de B.
- La misma carrera con rechazo de red: no reemplaza el aviso ni los datos de B.
- Recarga de conductor previamente con asignaciones cuando el servidor devuelve listas vacías: mensajes explícitos de viajes/entregas no asignados, sin selección, formularios ocultos; buscar y limpiar no inventa coincidencias ni emite mutaciones.

Los escenarios 200/401 se habían ensayado fuera del repositorio; ahora forman parte de la suite mantenida. La cobertura de confirmación existente ya prueba pérdida de respuesta de subida/RPC, doble envío, timeout, respuesta tardía, reintento solo de lista, revocación y salida durante subida. No se agregaron copias de esos tests.

## Qué demuestra cada capa

| Evidencia | Alcance y límite |
| --- | --- |
| DOM/fetch simulados de estas 52 pruebas | Comprueban comportamiento de JavaScript y separación entre sesiones. El mock entrega deliberadamente filas A/B; no prueba que RLS filtre una consulta real. No contactan Auth, Storage, Edge ni Supabase. |
| Fixtures SQL documentadas en `validation-and-handoff.md`, `client-portal-contract.md` e `in-transit-review.md` | Cubren aislamiento cliente A/B, conductor asignado/no asignado, ausencia de vínculo, idempotencia y concurrencia según cada suite. Son antecedentes de PostgreSQL desechable; no se volvieron a ejecutar aquí y no prueban el esquema remoto vigente. |
| QA cliente autenticada del lote 185ee6c | Antecedente ya completado: filtros y detalle de la remesa autorizada. No se repitió; no demuestra escritura de operaciones, confirmación de conductor ni aislamiento entre identidades reales. |
| Deploy READY | Acredita despliegue del código asociado, no la cadena funcional ni la separación de datos. |

Operaciones mantiene el alcance global del proyecto ya implementado. No se afirma aislamiento de operadores por empresa: no existe ese contrato. Los vínculos de cliente son explícitos y su contexto de sesión es independiente del operativo; ser ambos roles no concede acceso a otra empresa.

## Pendiente para una E2E real

1. Entorno y conjunto de datos aprobados expresamente para pruebas de escritura, con identidades ya autorizadas de operaciones, dos conductores de asignaciones distintas y clientes A/B de cuentas distintas. Esta tarea no crea esas identidades ni solicita ampliar sus permisos. No reutilizar operaciones reales como fixtures.
2. Recorrer en navegador operaciones → asignación y salida En ruta → lectura del conductor asignado → novedad/confirmación con soporte → lectura de estado/hitos por el cliente vinculado. Comprobar que el cliente no recibe notas internas, dirección ni datos de conductor fuera de su contrato.
3. Con esos datos de prueba autorizados, verificar API y UI de ambos clientes y conductores, IDs ajenos, listas vacías y pérdida de vínculo/asignación. La respuesta del servidor debe negar o excluir el dato; ocultarlo en UI no basta. Las alteraciones de vínculos necesarias para esta prueba requieren autorización específica.
4. Verificar carga real de Storage (tipo/tamaño, objeto privado y pertenencia), lectura temporal de soporte por el flujo de seguimiento autorizado, caducidad/revocación del enlace y reintento ante corte de red. Un mock de archivo no prueba las restricciones de la API Storage ni un soporte firmado por Edge. No crear enlaces ni subir archivos reales bajo la autorización actual.
5. Registrar SHA exacto, entorno, rol, caso, resultado esperado/observado y evidencia redactada sin tokens, contraseñas ni datos personales; cerrar el ciclo de conciliación de eventos y objetos únicamente dentro del conjunto de prueba aprobado.

La confirmación conserva el intento en memoria; no hay recuperación durable del intento después de perder la pestaña. Esta limitación conocida no se resuelve con una prueba de reintento en la misma página. La migración completa de Excel/Sheets y la equivalencia con la imagen original tampoco quedan acreditadas por este cierre.

Los documentos antiguos conservan observaciones históricas (por ejemplo, cero usuarios o frontend aún no publicado); no deben tratarse como inventario actual. No se consultaron cuentas ni registros remotos en esta revisión. No hay nuevo bloqueo funcional descubierto por estas pruebas.