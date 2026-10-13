"""Read-only shape/reconciliation check for authorized Incargo CSV exports.

Prints aggregate counts only. Never prints records, names, document IDs or payloads.
"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

VINC_COLUMNS = ('TIMESTAMP','CORREO_REGISTRO','TIPO_VINCULACION',
                'TIPO_VINCULACION_OTRO','NOMBRE_COMPLETO','TIPO_IDENTIFICACION',
                'NUMERO_IDENTIFICACION','CORREO_ELECTRONICO','ACEPTA_CONTRATO',
                'ACEPTADO_EN','VERSION_CONTRATO')


def inspect_rows(rows):
    counts = Counter()
    if not rows:
        return dict(counts)
    headered = rows[0][0].strip().upper() == 'TIMESTAMP'
    if headered:
        headers = [h.strip().upper() for h in rows[0]]
        rows = rows[1:]
        if 'ITEMS_JSON' not in headers:
            raise ValueError('missing ITEMS_JSON header')
        items_index = headers.index('ITEMS_JSON')
    for row in rows:
        if not any(cell.strip() for cell in row):
            continue
        counts['source_rows'] += 1
        if headered:
            index = items_index
            counts['headered'] += 1
        else:
            candidates = [i for i, cell in enumerate(row) if cell.lstrip().startswith('[')]
            index = candidates[0] if candidates else -1
            if index == 12:
                counts['legacy_14_columns'] += 1
            elif index == 15:
                counts['legacy_18_columns'] += 1
            elif index == 16:
                counts['current_19_columns'] += 1
            else:
                counts['unknown_layout'] += 1
                continue
        try:
            if not isinstance(json.loads(row[index]), list):
                counts['invalid_items_json'] += 1
        except (IndexError, json.JSONDecodeError):
            counts['invalid_items_json'] += 1
        signature = row[index+1] if len(row)>index+1 else ''
        photos = row[index+2] if len(row)>index+2 else ''
        if signature:
            counts['signature_present'] += 1
        if photos:
            counts['photos_present'] += 1
        if '[TRUNC]' in signature or '[TRUNC]' in photos:
            counts['truncated_evidence'] += 1
    return dict(counts)


def inspect_vinculaciones(rows):
    if not rows:
        return {}
    headers = [h.strip().upper() for h in rows[0]]
    if tuple(headers[:len(VINC_COLUMNS)]) != VINC_COLUMNS:
        raise ValueError('unexpected vinculación headers')
    counts = Counter()
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        counts['source_rows'] += 1
        accepted = row[8].strip().upper() if len(row)>8 else ''
        counts['accepted' if accepted=='SI' else 'not_accepted'] += 1
        if len(row)>11 and row[11].strip():
            counts['signature_present'] += 1
            if '[TRUNC]' in row[11]:
                counts['truncated_evidence'] += 1
        if len(row)<=10 or not row[10].strip():
            counts['missing_contract_version'] += 1
    return dict(counts)


def preview(path, kind):
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.reader(stream))
    return inspect_rows(rows) if kind=='inspecciones' else inspect_vinculaciones(rows)


if __name__=='__main__':
    if len(sys.argv)!=3 or sys.argv[1] not in ('inspecciones','vinculaciones'):
        raise SystemExit('usage: python3 legacy_preview.py inspecciones|vinculaciones authorized-export.csv')
    print(json.dumps(preview(sys.argv[2],sys.argv[1]),sort_keys=True))
