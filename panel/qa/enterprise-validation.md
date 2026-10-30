# Evidencias del núcleo empresarial

Capturas de pruebas sintéticas; no contienen registros de producción.

- enterprise-desktop/mobile/form-mobile: navegación operativa con API interceptada, roles y contratos actuales.
- business-orders-desktop y business-finance-desktop/mobile: navegador conectado mediante adaptador de prueba a PostgreSQL 17 desechable. Cotización aceptada crea pedido sin viaje; factura de 123,45 recibe aplicación de 50,00 y mantiene saldo de 73,45 tras recargar. Reversión posterior verificada en base de datos.
- No constituyen evidencia de activación en Supabase ni de integración fiscal.

Ver los comandos reproducibles y límites en ../README.md y ../database/README.md.

Segundo lote: revisión de cotización, aceptación de versión vigente, nota administrativa y cancelación previa a ejecución con recarga. `lifecycle-revision-mobile.png` muestra el editor aislado de revisión; `fleet-mobile.png` usa únicamente viajes y accesos sintéticos del contrato operativo existente. Se inspeccionaron los píxeles y se verificó el ancho móvil.

Las pruebas SQL también rechazan cancelación con costos y acceso a notas financieras sin autorización financiera. Los modelos de proveedores/vehículos/documentos no tienen grants ni RPC.
