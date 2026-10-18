# Staging local de inspecciones: datos sintéticos

Base 77c3ef255bf76a2f989a1e4696454dee1ecb9651. Se comprobó árbol limpio antes de escribir. No se encontraron AGENTS.md en los directorios padre, raíz, incargo-app ni tests consultados. No se aplican skills de Supabase a esta transformación puramente local: no utiliza conexiones, SDK ni DB.

legacy_transform.py añade clasificación por fila y resultado JSON determinista. Admite únicamente los tres órdenes de columnas documentados, con/sin cabecera; el formato inicial admite ausencia de la columna opcional de fotos. La primera fila de datos nunca se descarta como cabecera por su posición. Cabeceras desconocidas, posiciones JSON ambiguas, filas cortas/extra, JSON inválido, evidencias truncadas/no decodificables y duplicados exactos quedan explícitos en cuarentena. Filas vacías y cabeceras se contabilizan aparte.

Cada registro conserva raw, source_row, hash del contenido, clave snapshot+fila, campos documentados sin coerción, motivos, items interpretados solo como lista JSON y evidencias originales. No se deduplican silenciosamente registros. Los hashes son de representación canónica de celdas; la CLI además conserva el texto CSV original y su SHA-256 de bytes, incluidos BOM/saltos de línea. Es una identidad dentro del snapshot, no una clave permanente para sincronizar hojas editadas.

No se interpretan fechas ambiguas ni se normaliza a UTC. America/Bogota se registra como contexto documentado, con timezone_applied=false. Identificaciones y placas retienen ceros iniciales. complete_encoding solo acredita sintaxis base64, no integridad del archivo ni autenticidad de firma. Falta de firma/foto se conserva como missing, sin inventarla ni asumir que su ausencia invalida jurídicamente un registro. Todo registro tiene ready_for_import=false, incluso staged: el significado de los ítems y la autorización de datos siguen pendientes.

Uso exclusivo sobre fixtures sintéticas en este incremento:

```text
python -B legacy_transform.py synthetic-input.csv new-local-output.json
```

stdout muestra solo conciliación agregada; el resultado detallado se escribe exclusivamente en el archivo local indicado y no sobrescribe archivos existentes. No contiene rutinas de importación ni llamadas externas. Los resultados detallados no deben incorporarse a Git si en el futuro contienen información real.

legacy_preview.py reutiliza la clasificación para el resumen de inspecciones y mantiene las claves de conteos anteriores; deja de aceptar silenciosamente el primer JSON de una fila ambigua y tolera filas iniciales vacías. El resumen de vinculaciones no cambió. Este incremento no transforma vinculaciones ni supone que inspecciones equivalgan a viajes/entregas.

Validación: 18 tests Python (con subcasos de los tres formatos y cabeceras) cubren bruto inmutable, conciliación, JSON, evidencia, determinismo, duplicados y CLI sin sobrescritura. No acredita una migración real. Siguiente paso: revisar contrato de staging con operaciones y confirmar fuente/snapshot autorizados antes de procesar datos reales; esquema, importación, accesos, retención y corte permanecen separados.

Revisión final: CSV mal formado se rechaza antes de crear salida, sin unir silenciosamente registros. JSON con claves duplicadas, números no finitos o anidamiento no interpretable se conserva bruto y va a cuarentena. Duplicados de filas de formato desconocido también se identifican. No se confunden duplicados exactos con identidades comerciales ni se infieren claves entre snapshots. El resultado se mantiene completo en memoria: no es todavía un importador para exportaciones grandes.

Validacion final ejecutada: 18/18 pruebas Python y 79/79 pruebas Node aprobadas; sintaxis Python y git diff --check sin errores. El anidamiento JSON admite hasta 100 niveles de contenedores; el exceso queda en cuarentena. Solo cuatro archivos de codigo, pruebas y documentacion; no se incorporan exportaciones ni datos reales. No cambia UI, servicios remotos, esquema ni permisos.
