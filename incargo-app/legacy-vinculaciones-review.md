# Vinculaciones: transformacion local pendiente de revision

Base revisada: `7b18e8bdfac7ffdf46d52581add873d88eca5ac7`, arbol limpio antes de editar. No se encontraron AGENTS.md en el repositorio ni en sus directorios padre consultados. Trabajo puramente local: ninguna conexion a hojas, DB, SDK, importacion o creacion de cuentas; no requiere operar Supabase ni desplegar servicios.

## Contrato de origen suficiente para staging

`legacy-mapping.md` documenta las once cabeceras historicas, en orden, sin firma. `apps-script-v2.js:28` define las mismas once mas `FIRMA_B64`; `guardarVinculacion` escribe aceptacion literal SI/NO, version 001 para nuevas filas y firma truncable a 120000 caracteres. Esto acredita los dos formatos de codigo, no que el endpoint desplegado o todos los registros historicos coincidan.

Se admiten exactamente esas dos secuencias de cabeceras (11 y 12). Solo se normalizan espacios exteriores y mayusculas de cabeceras para reconocerlas; el original se conserva. Sin cabecera, con reordenamiento, duplicados de nombres, columna vacia adicional u otro nombre: cuarentena sin asignar campos. Con cabecera valida, filas cortas/largas y cabeceras repetidas: cuarentena, conservando todas las celdas. Una L sin nombre nunca se interpreta como firma.

## Comportamiento y limites

- Cada fila conserva bruto, numero, hash, clave snapshot+fila, motivos y `ready_for_import=false`, incluidos cabeceras y blancos. Conciliacion contabiliza todas las filas; duplicados exactos se retienen y marcan. No se deducen identidades entre snapshots.
- Aceptacion permanece literal. Solo SI/NO son valores conocidos por el escritor local; variantes como si, SI con espacios, vacio o TRUE quedan en cuarentena. Ninguno se transforma en consentimiento, booleano de aceptacion ni validez legal.
- Version contractual, documentos, correos, tipos de vinculacion y fechas permanecen texto sin coercion. No se asigna 001 a registros historicos. Faltas de timestamp, aceptado_en o version van a cuarentena como excepciones de datos para revision, no como conclusiones juridicas. Fechas no vacias ambiguas se conservan sin parsear ni convertir; America/Bogota es solo contexto, `timezone_applied=false`.
- No se separa una lista de roles por comas: falta un contrato inequívoco para normalizar valores libres sin perder significado. Tampoco se enlazan personas, empresas o cuentas.
- Firma distingue columna ausente, columna presente vacia, codificacion completa, truncada e invalida. `complete_encoding` solo comprueba base64, no integridad visual, autoria o autenticidad. Ausencia no se convierte en invalidez legal; truncamiento/invalidez de codificacion va a cuarentena y conserva original.
- `contract_document_resolution=unverified` y `consent_interpretation=not_attempted` en todas las filas. Falta un manifiesto aprobado que vincule cada version literal al documento realmente presentado (archivo inmutable/hash y procedencia). El HTML actual y el literal 001 del escritor no demuestran esa relacion historica. Esa resolucion, snapshot autorizado, esquema, acceso, retencion e importacion quedan pendientes.
- `staged` significa solo estructura reconocida; nunca permiso de importacion. El procesamiento sigue en memoria y no valida semanticamente documentos, direcciones de correo ni contenido contractual.

## Uso local y verificacion

```text
python -B legacy_transform.py vinculaciones synthetic-input.csv new-local-output.json
```

La CLI anterior de dos argumentos sigue procesando inspecciones. La nueva seleccion explicita acepta inspecciones o vinculaciones; tipos desconocidos fallan antes de crear salida. CSV mal formado/UTF-8 invalido falla sin salida. Se conserva CSV bruto, BOM, saltos de linea y SHA de bytes. La salida usa creacion exclusiva y no sobrescribe ni siquiera el archivo de entrada; stdout contiene solamente conteos. El resumen historico `legacy_preview.py` no cambia: sus conteos de accepted/not_accepted no sustituyen esta clasificacion literal.

Validacion local: 29/29 tests Python (18 anteriores + 11 nuevos con subcasos), 79/79 Node. Casos nuevos: formatos 11/12, firma ausente/vacia/truncada/invalida, literales, versiones y ceros iniciales, cabeceras invalidas/repetidas, todas las longitudes cortas, extras, blancos, duplicados, fechas sin interpretar, inmutabilidad, conciliacion, determinismo de funcion y bytes CLI, errores de entrada y no sobrescritura de salida/origen. Sintaxis Python y diff check revisados. Fixtures exclusivamente sinteticas; ningun resultado con datos reales incorporado.

Alcance revisado para publicacion autorizada: legacy_transform.py, tests/test_legacy_vinculaciones.py y este documento. La publicacion de este incremento no ejecuta el transformador ni habilita importaciones; no cambia UI.

Revision previa a publicacion: aceptacion ausente o truncada no se interpreta como SI; firma truncada queda en cuarentena y firma ausente permanece missing. Todos los subcasos comprueban que no existe booleano accepted, consentimiento no interpretado y documento contractual sin verificar. FIRMA_B64 solo se reconoce como duodecima cabecera de la secuencia documentada. Pendiente contractual conservado, sin pedir ni ejecutar nuevas operaciones de datos.
