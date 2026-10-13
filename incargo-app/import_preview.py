"""Read-only reconciliation for an explicitly mapped, synthetic CSV export.

No database connection. Never print row contents or personal fields.
"""
import csv
import json
import sys
from collections import Counter
from pathlib import Path

REQUIRED = ('source_id', 'trip_source_id', 'customer_name')


def preview(path: Path) -> dict:
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        missing = sorted(set(REQUIRED) - set(reader.fieldnames or ()))
        if missing:
            raise ValueError('Missing mapped columns: ' + ', '.join(missing))
        ids, trips, rejected = set(), set(), Counter()
        count = 0
        for row in reader:
            count += 1
            if any(not (row.get(field) or '').strip() for field in REQUIRED):
                rejected['required_field_blank'] += 1
                continue
            source_id = row['source_id'].strip()
            if source_id in ids:
                rejected['duplicate_source_id'] += 1
                continue
            ids.add(source_id)
            trips.add(row['trip_source_id'].strip())
        return {'rows': count, 'accepted_deliveries': len(ids),
                'referenced_trips': len(trips), 'rejected': dict(rejected)}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: python3 import_preview.py mapped_export.csv')
    print(json.dumps(preview(Path(sys.argv[1])), sort_keys=True))
