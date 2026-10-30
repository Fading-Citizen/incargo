# Transición de fuentes externas — diseño, sin consultas ni importaciones

Inspección de código a 30 de octubre de 2026. No se llamó a Apps Script ni Formspree, no se leyeron hojas ni se copiaron firmas/documentos reales. Las rutas públicas permanecen sin cambios.

| Fuente | Contrato observado en código | Lo que no demuestra el navegador | Transición necesaria |
| --- | --- | --- | --- |
| `checklist.html:491–540` | JSON de FormData, `tipoTransporte[]`, `items[{label,scale,value,obs}]`, `firma` PNG base64, `fotos[]`; POST text/plain no-cors. Admite envío incompleto o sin firma tras confirmación. | Respuesta opaca: que fetch termine no confirma persistencia. No muestra ID estable/revisión del servidor. | Conservar campos originales, etiqueta/escala y evidencias; registrar completitud como dato, no aprobación. Exigir acuse de servidor con ID estable, revisión y hash antes de mostrar éxito definitivo. |
| `vinculacion.html:279–317` | `action=vinculacion`, campos de formulario, `tipoVinculacion[]`, `aceptadoEn` del navegador, `firmaB64`; POST no-cors. | Hora de navegador no certifica recepción; firma dibujada y validación cliente no acreditan aprobación/identidad. | Expediente separado de acceso operativo: recibir vinculación no crea membership/conductor. Conservar texto contractual/versionado y firma original; definir revisores, acceso y retención. |
| `admin.html:287–311,629–674` | GET `action=list` / `action=vinculaciones`; update por `_rowNumber`; reemplazo opcional fotos/firma; recarga y comprobación parcial de evidencias. | Número de fila no es identidad durable; reordenar hoja puede cambiarlo. Coincidencia de prefijo de base64 no prueba integridad. No se ha verificado autorización en el servidor. | Identificador estable en origen, control de versión/ETag, hash completo, registro de autor. No transportar accesos actuales del HTML a roles nuevos. No sobrescribir evidencias sin conservar versión anterior. |
| `quote.html:146–169,284–302` | Formspree multipart: nombre, email, teléfono, servicio y mensaje; consulta response.ok. | Solicitud de contacto no es cotización valorizada, cliente canónico ni aceptación comercial. | Inbox comercial con ID del proveedor + deduplicación; vínculo de cuenta verificado manualmente; crear cotización sólo con conceptos/importes explícitos. Sin envíos dobles ni sustitución de proveedor. |

## Secuencia propuesta de transición

1. Obtener del responsable el contrato del servidor/exportador y autorización de lectura/retención. Confirmar fuente canónica e identidad estable; una fila de hoja sola no basta.
2. Exportación autorizada a entorno aislado, con manifiesto por fuente, clave, revisión, hash completo y número de adjuntos. Los binarios permanecen protegidos; el repo sólo contiene fixtures sintéticos.
3. Reconciliar cantidades, claves duplicadas, campos desconocidos, hashes de firmas/fotos y valores originales. Rechazar silencios: enviar conflictos a revisión, sin inferir cuenta por nombre ni persona por matrícula.
4. Probar importación idempotente por fuente/clave/revisión y concurrencia contra revisiones. No hacer doble escritura mientras no exista protocolo de recuperación/verificación de ambos sistemas.
5. Acordar acceso por entidad y validación de documentos. Lectura de un checklist no otorga edición ni autorización de operar un vehículo.
6. Ensayo de corte con congelación o delta verificable, comparación de conteos/hashes, y reversión de lectura hacia la fuente original. No borrar ni reemplazar la fuente histórica al activar una nueva interfaz.

## Entidades propuestas y límites

`source_evidence` conserva procedencia y hash, no copia datos personales ni archivos a una tabla pública. `vehicle_documents` relaciona la evidencia con un vehículo previamente verificado; una fecha reportada no significa cumplimiento. `vehicles` no se rellena agrupando placas históricas. `suppliers` no se deriva de clientes. `cost_records` registra un monto documentado y moneda con una única atribución a viaje o pedido; no crea pagos, impuestos, aprobación ni rentabilidad consolidada. Todos estos modelos están cerrados, con RLS y sin RPC/grants de aplicación.

Pendiente de definir: responsables/procedencia e identidad del proveedor, contrato de exportación/acuse, acceso a evidencias, correcciones y reparto de costos entre servicios, catálogo de vehículos y documentos requeridos. No se presume normativa, tarifa, vencimiento obligatorio ni GPS en tiempo real.
