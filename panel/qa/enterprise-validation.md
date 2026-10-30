# Evidencias del núcleo empresarial

Capturas de pruebas sintéticas; no contienen registros de producción.

- enterprise-desktop/mobile/form-mobile: navegación operativa con API interceptada, roles y contratos actuales.
- business-orders-desktop y business-finance-desktop/mobile: navegador conectado mediante adaptador de prueba a PostgreSQL 17 desechable. Cotización aceptada crea pedido sin viaje; factura de 123,45 recibe aplicación de 50,00 y mantiene saldo de 73,45 tras recargar. Reversión posterior verificada en base de datos.
- No constituyen evidencia de activación en Supabase ni de integración fiscal.

Ver los comandos reproducibles y límites en ../README.md y ../database/README.md.

Segundo lote: revisión de cotización, aceptación de versión vigente, nota administrativa y cancelación previa a ejecución con recarga. `lifecycle-revision-mobile.png` muestra el editor aislado de revisión; `fleet-mobile.png` usa únicamente viajes y accesos sintéticos del contrato operativo existente. Se inspeccionaron los píxeles y se verificó el ancho móvil.

Las pruebas SQL también rechazan cancelación con costos y acceso a notas financieras sin autorización financiera. Los modelos de proveedores/vehículos/documentos no tienen grants ni RPC.

Release retenido: `finance-held-mobile.png` y `finance-held-desktop.png` muestran el estado no activado. El test operativo anuncia intencionalmente finance=true desde el servidor mock y comprueba que nueve entradas financieras no despachan ninguna solicitud. El test SQL verifica denegación aun con inscripción financiera local. Las capturas anteriores de facturas son exclusivamente del entorno aislado de prueba, no de producción.

UI/seguimiento (30 octubre): capturas `ux-*` del selector móvil, mapa de referencia, portada y seguimiento. El mapa y el tracking se probaron con fixtures locales autorizados por el harness; no muestran vehículos ni clientes reales. Se verificaron actualización de estado a 60 segundos, pausa oculta/offline, descarte de respuestas entre tokens, revocación y bloqueo financiero. La portada conserva proveedor/campos del formulario y la redirección de invitación. No hay nueva telemetría GPS. Ver `../audit/maps-and-tracking.md` para metadatos verificados y fuentes.
