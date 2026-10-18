"""Offline inspection staging. No DB/network; accepted means structurally staged only."""
import base64
import binascii
import hashlib
import json
import math
from collections import Counter

COMMON = ('TIMESTAMP', 'FECHA', 'CIUDAD', 'PLACA', 'CONDUCTOR', 'LICENCIA',
          'EMPRESA', 'CLASE_VEHICULO')
TAIL = ('ITEMS_JSON', 'FIRMA_B64', 'FOTOS_B64')
LAYOUTS = {
    12: COMMON + ('MODELO', 'GPS', 'SOAT', 'TECNOMEC') + TAIL,
    15: COMMON + ('TIPO_CARROCERIA', 'PLACA_SEMIRREMOLQUE', 'MODELO', 'GPS',
                  'SOAT', 'TECNOMEC', 'TIPO_TRANSPORTE') + TAIL,
    16: COMMON + ('TIPO_CARROCERIA', 'PLACA_SEMIRREMOLQUE', 'MODELO', 'GPS',
                  'TARJETA_PROPIEDAD', 'SOAT', 'TECNOMEC', 'TIPO_TRANSPORTE') + TAIL,
}
LAYOUT_NAMES = {12: 'legacy_14', 15: 'legacy_18', 16: 'current_19'}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':'),
                                     sort_keys=True).encode('utf-8')).hexdigest()


def items_candidates(row):
    # Detect ambiguity rather than accepting the first JSON-looking cell.
    return [i for i, cell in enumerate(row) if cell.lstrip().startswith(('[', '{'))]


def reject_constant(value):
    raise ValueError('Nonstandard JSON constant')


def strict_float(value):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError('Non-finite JSON number')
    return result


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON object key')
        result[key] = value
    return result


def validate_depth(value):
    # Explicit bound independent of the Python JSON decoder's recursion limit.
    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if isinstance(item, (list, dict)):
            if depth >= 100:
                raise ValueError('JSON nesting exceeds staging limit')
            children = item.values() if isinstance(item, dict) else item
            pending.extend((child, depth + 1) for child in children)


def evidence(value, kind):
    result = {'kind': kind, 'raw': value, 'status': 'missing'}
    if not value.strip():
        return result
    result['sha256'] = hashlib.sha256(value.encode('utf-8')).hexdigest()
    if '[TRUNC]' in value:
        result['status'] = 'truncated'
        return result
    try:
        prefix, payload = value.split(',', 1)
        if prefix not in ('data:image/png;base64', 'data:image/jpeg;base64',
                          'data:image/webp;base64'):
            raise ValueError('unsupported encoding')
        decoded = base64.b64decode(payload, validate=True)
        if not decoded:
            raise ValueError('empty payload')
        result.update(status='complete_encoding', decoded_bytes=len(decoded),
                      validation='base64_only; image integrity and authenticity unverified')
    except (ValueError, binascii.Error):
        result['status'] = 'invalid_encoding'
    return result


def transform_inspections(rows):
    """Keep every CSV row/cell. No date parsing, identifier coercion or inferred linkage."""
    rows = [list(row) for row in rows]
    if any(not isinstance(cell, str) for row in rows for cell in row):
        raise ValueError('CSV cells must be strings')
    snapshot = digest(rows)
    first = next((i for i, row in enumerate(rows) if any(c.strip() for c in row)), None)
    header = None
    header_index = None
    invalid_header = False
    if first is not None and rows[first] and rows[first][0].strip().upper() == 'TIMESTAMP':
        header_index = first
        header = tuple(c.strip().upper() for c in rows[first])
        # Only documented columns/orders; do not map unknown headers by resemblance.
        invalid_header = header not in tuple(LAYOUTS.values()) + (LAYOUTS[12][:-1],)
    output = []
    seen = {}
    for number, raw in enumerate(rows, 1):
        record = {'source_row': number, 'source_key': f'{snapshot}:{number}',
                  'raw': raw, 'row_sha256': digest(raw), 'classification': 'quarantine',
                  'reasons': [], 'layout': None, 'fields': {}, 'evidence': [],
                  'date_interpretation': 'not_attempted', 'ready_for_import': False}
        output.append(record)
        if not any(c.strip() for c in raw):
            record['classification'] = 'blank'
            continue
        if number - 1 == header_index:
            record['classification'] = 'quarantine' if invalid_header else 'header'
            if invalid_header:
                record['reasons'].append('unsupported_header')
            continue
        if record['row_sha256'] in seen:
            record['reasons'].append('duplicate_raw_row')
            record['duplicate_of_row'] = seen[record['row_sha256']]
        else:
            seen[record['row_sha256']] = number
        if invalid_header:
            record['reasons'].append('unsupported_header')
            continue
        candidates = items_candidates(raw)
        if header is not None:
            index = header.index('ITEMS_JSON')
            columns = header
            record['layout'] = 'headered_' + LAYOUT_NAMES[index]
        elif len(candidates) != 1 or candidates[0] not in LAYOUTS:
            record['reasons'].append('ambiguous_json_position' if len(candidates) > 1 else 'unknown_layout')
            continue
        else:
            index = candidates[0]
            columns = LAYOUTS[index]
            record['layout'] = LAYOUT_NAMES[index]
        minimum = len(columns) if header else (14 if index == 12 else len(columns))
        if len(raw) < minimum:
            record['reasons'].append('short_row')
        if len(raw) > len(columns):
            record['reasons'].append('extra_columns')
        if header is not None and any(i != index for i in candidates):
            record['reasons'].append('ambiguous_json_position')
        record['fields'] = dict(zip(columns, raw))
        try:
            parsed = json.loads(raw[index], parse_constant=reject_constant,
                                parse_float=strict_float, object_pairs_hook=unique_object)
            if not isinstance(parsed, list):
                raise ValueError('not a list')
            validate_depth(parsed)
            record['items'] = parsed  # Item semantics are deliberately not invented.
        except (ValueError, IndexError, RecursionError):
            record['reasons'].append('invalid_items_json')
        signature = raw[index+1] if len(raw) > index+1 else ''
        photos = raw[index+2] if len(raw) > index+2 else ''
        record['evidence'] = [evidence(signature, 'signature')] + [
            evidence(photo, 'photo') for photo in (photos.split('|') if photos else [''])]
        for status in ('truncated', 'invalid_encoding'):
            if any(e['status'] == status for e in record['evidence']):
                record['reasons'].append(status + '_evidence')
        if not record['reasons']:
            record['classification'] = 'staged'
    counts = Counter(r['classification'] for r in output)
    return {'format_version': 1, 'kind': 'inspecciones', 'snapshot_sha256': snapshot,
            'source_timezone': 'America/Bogota', 'timezone_applied': False,
            'rows': output, 'reconciliation': {'input_rows': len(rows),
            **{k: counts[k] for k in ('header', 'blank', 'staged', 'quarantine')},
            'accounted_rows': sum(counts.values())}}


if __name__ == '__main__':
    import csv
    import io
    import sys
    from pathlib import Path
    if len(sys.argv) != 3:
        raise SystemExit('usage: python legacy_transform.py synthetic-input.csv new-local-output.json')
    source = Path(sys.argv[1]).read_bytes()
    result = transform_inspections(list(csv.reader(io.StringIO(source.decode('utf-8-sig')), strict=True)))
    result['raw_csv_text'] = source.decode('utf-8')
    result['source_file_sha256'] = hashlib.sha256(source).hexdigest()
    # Never overwrite a previous snapshot/output. stdout contains counts only.
    with Path(sys.argv[2]).open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(result, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write('\n')
    print(json.dumps(result['reconciliation'], sort_keys=True))
