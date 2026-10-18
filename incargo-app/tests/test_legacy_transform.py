import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from legacy_transform import LAYOUTS, transform_inspections
from legacy_preview import inspect_rows


def row(index=16, signature='', photos=''):
    cells = ['synthetic'] * index + ['[]', signature, photos]
    cells[0] = '01/02/2026 03:04'
    cells[1] = '02/03/2026'
    cells[3] = '000123'
    cells[5] = '000045'
    return cells


class TransformTest(unittest.TestCase):
    def test_all_documented_formats_with_and_without_headers(self):
        for index, columns in LAYOUTS.items():
            for header in (False, True):
                with self.subTest(index=index, header=header):
                    rows = ([list(columns)] if header else []) + [row(index)]
                    result = transform_inspections(rows)
                    record = result['rows'][-1]
                    self.assertEqual(record['classification'], 'staged')
                    self.assertEqual(record['fields']['PLACA'], '000123')
                    self.assertEqual(record['fields']['LICENCIA'], '000045')
                    self.assertEqual(record['raw'], rows[-1])
                    self.assertEqual(result['reconciliation']['accounted_rows'], len(rows))

    def test_initial_format_optional_photo_column(self):
        for rows in ([row(12)[:-1]], [list(LAYOUTS[12][:-1]), row(12)[:-1]]):
            self.assertEqual(transform_inspections(rows)['rows'][-1]['classification'], 'staged')

    def test_blank_rows_short_rows_and_no_lost_first_record(self):
        rows = [[], [' ', ''], row(12), ['short'], row(16)[:-2]]
        result = transform_inspections(rows)
        self.assertEqual(result['reconciliation'], dict(input_rows=5, header=0, blank=2,
                                                       staged=1, quarantine=2, accounted_rows=5))
        self.assertEqual([r['source_row'] for r in result['rows']], [1, 2, 3, 4, 5])
        self.assertIn('short_row', result['rows'][-1]['reasons'])
        self.assertEqual(inspect_rows(rows)['source_rows'], 3)

    def test_invalid_and_ambiguous_json_are_quarantined(self):
        for bad in ('[broken', '{}', 'null'):
            cells = row(); cells[16] = bad
            result = transform_inspections([list(LAYOUTS[16]), cells])
            self.assertIn('invalid_items_json', result['rows'][1]['reasons'])
        cells = row(); cells[12] = '[]'
        self.assertIn('ambiguous_json_position', transform_inspections([cells])['rows'][0]['reasons'])
        self.assertEqual(inspect_rows([cells])['unknown_layout'], 1)

    def test_unknown_header_and_extra_columns_are_not_mapped(self):
        header = list(LAYOUTS[16]); header[3] = 'UNKNOWN'
        result = transform_inspections([header, row()])
        self.assertEqual(result['reconciliation']['quarantine'], 2)
        self.assertEqual(result['rows'][1]['fields'], {})
        self.assertIn('extra_columns', transform_inspections([row()+['unexpected']])['rows'][0]['reasons'])

    def test_evidence_is_preserved_and_not_claimed_authentic(self):
        encoded = 'data:image/png;base64,QUFBQQ=='
        cells = row(16, encoded, encoded+'|data:image/png;base64,AA...[TRUNC]')
        record = transform_inspections([cells])['rows'][0]
        self.assertEqual([e['status'] for e in record['evidence']],
                         ['complete_encoding', 'complete_encoding', 'truncated'])
        self.assertEqual(record['raw'], cells)
        self.assertIn('truncated_evidence', record['reasons'])
        self.assertIn('unverified', record['evidence'][0]['validation'])
        self.assertEqual(transform_inspections([row()])['rows'][0]['evidence'][0]['status'], 'missing')
        self.assertIn('invalid_encoding_evidence', transform_inspections([row(12, 'not-base64')])['rows'][0]['reasons'])

    def test_dates_not_interpreted_and_results_are_deterministic(self):
        rows = [row()]; before = copy.deepcopy(rows)
        first = transform_inspections(rows)
        self.assertEqual(first, transform_inspections(rows))
        self.assertEqual(rows, before)
        self.assertEqual(first['rows'][0]['fields']['FECHA'], '02/03/2026')
        self.assertFalse(first['timezone_applied'])
        self.assertFalse(first['rows'][0]['ready_for_import'])
        self.assertEqual(json.loads(json.dumps(first))['rows'][0]['raw'], rows[0])

    def test_duplicate_is_retained_not_silently_dropped(self):
        result = transform_inspections([row(), row()])
        self.assertEqual(result['reconciliation']['input_rows'], 2)
        self.assertIn('duplicate_raw_row', result['rows'][1]['reasons'])
        self.assertEqual(result['rows'][1]['duplicate_of_row'], 1)
        self.assertNotEqual(result['rows'][0]['source_key'], result['rows'][1]['source_key'])

    def test_empty_and_header_only(self):
        self.assertEqual(transform_inspections([])['reconciliation']['accounted_rows'], 0)
        result = transform_inspections([[], list(LAYOUTS[16])])
        self.assertEqual(result['reconciliation']['header'], 1)
        self.assertEqual(result['reconciliation']['blank'], 1)
        self.assertEqual(inspect_rows([[], list(LAYOUTS[16])]), {})

    def test_no_inference_for_unknown_layout_or_non_text_cells(self):
        self.assertIn('unknown_layout', transform_inspections([['not a mapped record']])['rows'][0]['reasons'])
        with self.assertRaises(ValueError):
            transform_inspections([[123]])

    def test_cli_preserves_csv_bytes_text_and_never_overwrites(self):
        import csv
        import io
        import hashlib
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic.csv'
            buffer = io.StringIO(newline='')
            csv.writer(buffer).writerow(row())
            original = ('\ufeff' + buffer.getvalue()).encode('utf-8')
            source.write_bytes(original)
            output = Path(directory) / 'staged.json'
            script = Path(__file__).resolve().parents[1] / 'legacy_transform.py'
            command = [sys.executable, '-B', str(script), str(source), str(output)]
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            result = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(result['raw_csv_text'].encode('utf-8'), original)
            self.assertEqual(result['source_file_sha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual(json.loads(run.stdout)['staged'], 1)
            self.assertNotIn('synthetic', run.stdout)
            before = output.read_bytes()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(output.read_bytes(), before)
            self.assertEqual(source.read_bytes(), original)

    def test_nonstandard_json_constants_are_quarantined(self):
        cells = row(); cells[16] = '[NaN]'
        self.assertIn('invalid_items_json', transform_inspections([cells])['rows'][0]['reasons'])

    def test_duplicate_unknown_rows_remain_explicit(self):
        result = transform_inspections([['unknown'], ['unknown']])
        self.assertIn('duplicate_raw_row', result['rows'][1]['reasons'])
        self.assertEqual(result['reconciliation']['quarantine'], 2)

    def test_lossy_json_interpretations_are_quarantined(self):
        for value in ('[{"x":1,"x":2}]', '[1e999]', '[' * 1200 + ']' * 1200):
            cells = row(); cells[16] = value
            record = transform_inspections([cells])['rows'][0]
            self.assertIn('invalid_items_json', record['reasons'])
            self.assertEqual(record['raw'][16], value)
            self.assertFalse(record['ready_for_import'])

    def test_malformed_csv_fails_without_creating_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic.csv'
            source.write_text('"unterminated\nsecond record', encoding='utf-8')
            output = Path(directory) / 'staged.json'
            script = Path(__file__).resolve().parents[1] / 'legacy_transform.py'
            run = subprocess.run([sys.executable, '-B', str(script), str(source), str(output)],
                                 capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse(output.exists())
            self.assertNotIn('second record', run.stdout + run.stderr)


if __name__ == '__main__':
    unittest.main()
