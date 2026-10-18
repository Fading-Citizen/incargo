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
    from legacy_transform import transform_inspections
    counts = Counter()
    for record in transform_inspections(rows)['rows']:
        if record['classification'] in ('blank', 'header'):
            continue
        counts['source_rows'] += 1
        layout = record['layout']
        if layout and layout.startswith('headered_'):
            counts['headered'] += 1
        elif layout:
            counts[{'legacy_14': 'legacy_14_columns', 'legacy_18': 'legacy_18_columns',
                    'current_19': 'current_19_columns'}[layout]] += 1
        else:
            counts['unknown_layout'] += 1
        if 'invalid_items_json' in record['reasons']:
            counts['invalid_items_json'] += 1
        evidence = record['evidence']
        if evidence and evidence[0]['raw']:
            counts['signature_present'] += 1
        if any(e['raw'] for e in evidence[1:]):
            counts['photos_present'] += 1
        if 'truncated_evidence' in record['reasons']:
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
