# Correcciones de revisión automática — PR #6

Copilot terminó el 4 de noviembre a las 13:02:39 UTC. Revisó el commit de rama `e97a2a65e4cef34e9edf1fe2611f7809b4505fdf`; su workflow asociado al merge `169aecbedd885a3835f1ba9efabb1104361cbc38` terminó success con tres observaciones. Success indica ejecución completada, no ausencia de defectos.

Las tres observaciones se confirmaron y corrigieron:

- El presupuesto anterior solo sumaba payloads. Ahora importaciones y correcciones validan la misma respuesta completa que lee el panel, incluidos identificadores/metadatos, con máximo 2,9 MB frente al límite API de 3 MB. El fallo revierte todo el lote o la corrección y conserva la copia anterior.
- Un lote compartía captured_at y acababa ordenado por hash. Ahora el orden se obtiene directamente del array conservado en el snapshot inmutable. No hace falta reimportar ni modificar originales. Los históricos quedan separados de los contenidos actuales mediante su marca existente.
- Se podía abrir un editor mientras esperaba una sincronización y perder el borrador con el refresco. Preparar corrección queda deshabilitado durante esa espera; se mantiene el bloqueo de sincronización durante edición.

Pruebas aprobadas: 26 unitarias, tipos, lint, build y navegador local; PostgreSQL local, incluyendo lote de 14.000 objetos pequeños rechazado sin escrituras parciales, corrección válida que excede el presupuesto total rechazada sin revisión/recibo persistido, orden de origen, idempotencia, concurrencia y revocación. El navegador retiene una respuesta de sincronización y confirma que no se puede abrir el editor mientras está pendiente.

La migración complementaria se aplicó en Supabase; no se ejecutó importación manual ni se enviaron formularios. Se verifican únicamente conteos, tamaño, orden y privilegios sobre datos reales, sin exponer contenido. QA autenticado real sigue pendiente de una sesión autorizada. Firma, contratos, facturación y legacy permanecen fuera de estos cambios.
