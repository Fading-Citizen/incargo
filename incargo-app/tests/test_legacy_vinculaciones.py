import copy
import csv
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from legacy_transform import VINC_COLUMNS, transform_vinculaciones


def row():
    return ['03/04/2026 05:06', 'synthetic@example.invalid', 'Conductor, Propietario',
            '', 'Persona sintetica', 'CC', '0000123', 'other@example.invalid',
            'SI', '04/03/2026', '0007']


class VinculacionesTest(unittest.TestCase):
    def check(self, rows):
        original = copy.deepcopy(rows)
        result = transform_vinculaciones(rows)
        self.assertEqual(rows, original)
        self.assertEqual([r['raw'] for r in result['rows']], original)
        self.assertEqual(result, transform_vinculaciones(rows))
        self.assertEqual(result['reconciliation']['input_rows'], len(rows))
        self.assertEqual(result['reconciliation']['accounted_rows'], len(rows))
        self.assertEqual(len({r['source_key'] for r in result['rows']}), len(rows))
        self.assertTrue(all(r['ready_for_import'] is False for r in result['rows']))
        self.assertTrue(all(r['date_interpretation'] == 'not_attempted' for r in result['rows']))
        self.assertTrue(all(r['consent_interpretation'] == 'not_attempted' for r in result['rows']))
        self.assertTrue(all(r['contract_document_resolution'] == 'unverified' for r in result['rows']))
        self.assertTrue(all('accepted' not in r for r in result['rows']))
        self.assertFalse(result['timezone_applied'])
        return result

    def test_documented_layouts_and_literal_values(self):
        for signature in (None, '', 'data:image/png;base64,AAAA'):
            with self.subTest(signature=signature):
                header = list(VINC_COLUMNS) + ([] if signature is None else ['FIRMA_B64'])
                cells = row() + ([] if signature is None else [signature])
                record = self.check([header, cells])['rows'][1]
                self.assertEqual(record['classification'], 'staged')
                self.assertEqual(record['fields']['NUMERO_IDENTIFICACION'], '0000123')
                self.assertEqual(record['fields']['TIPO_VINCULACION'], 'Conductor, Propietario')
                self.assertEqual(record['contract_version_literal'], '0007')
                self.assertEqual(record['acceptance_literal'], 'SI')
                self.assertEqual(record['consent_interpretation'], 'not_attempted')
                self.assertEqual(record['contract_document_resolution'], 'unverified')
                self.assertEqual(record['signature_column_present'], signature is not None)
                self.assertEqual(record['evidence'][0]['status'], 'complete_encoding' if signature else 'missing')
                self.assertNotIn('accepted', record)

    def test_acceptance_is_not_normalized_or_inferred(self):
        for value in ('SI', 'NO', 'si', ' SI ', 'Sí', 'TRUE', '', '1', 'SI...[TRUNC]'):
            with self.subTest(value=value):
                cells = row(); cells[8] = value
                record = self.check([list(VINC_COLUMNS), cells])['rows'][1]
                self.assertEqual(record['acceptance_literal'], value)
                self.assertEqual('unknown_acceptance_literal' in record['reasons'], value not in ('SI', 'NO'))

    def test_missing_version_or_instants_remain_missing(self):
        for index in (0, 9, 10):
            cells = row(); cells[index] = '  '
            record = self.check([list(VINC_COLUMNS), cells])['rows'][1]
            self.assertEqual(record['classification'], 'quarantine')
            self.assertIn('missing_' + VINC_COLUMNS[index].lower(), record['reasons'])
            self.assertEqual(record['fields'][VINC_COLUMNS[index]], '  ')

    def test_unknown_missing_reordered_and_duplicate_headers(self):
        headers = [[], list(reversed(VINC_COLUMNS)), list(VINC_COLUMNS[:-1]),
                   list(VINC_COLUMNS) + [''], list(VINC_COLUMNS) + ['UNKNOWN'],
                   list(VINC_COLUMNS) + ['FIRMA_B64', 'FIRMA_B64']]
        for header in headers:
            with self.subTest(header=header):
                result = self.check([header, row()])
                for record in result['rows']:
                    if record['classification'] != 'blank':
                        self.assertEqual(record['classification'], 'quarantine')
                        self.assertEqual(record['fields'], {})
                        self.assertIn('missing_or_unsupported_header', record['reasons'])
        result = self.check([row(), row()])
        self.assertEqual(result['rows'][0]['raw'], row())
        self.assertIn('duplicate_raw_row', result['rows'][1]['reasons'])

    def test_header_normalization_preserves_raw_and_repeated_header_quarantined(self):
        header = [' ' + c.lower() + ' ' for c in VINC_COLUMNS]
        result = self.check([[], [' '], header, row(), header])
        self.assertEqual(result['reconciliation'], dict(input_rows=5, header=1, blank=2, staged=1, quarantine=1, accounted_rows=5))
        self.assertIn('repeated_header', result['rows'][-1]['reasons'])

    def test_all_short_lengths_and_extra_columns(self):
        for width in (11, 12):
            header = list(VINC_COLUMNS) + (['FIRMA_B64'] if width == 12 else [])
            full = row() + ([''] if width == 12 else [])
            for length in range(1, width):
                record = self.check([header, full[:length]])['rows'][1]
                self.assertIn('short_row', record['reasons'])
            record = self.check([header, full + ['data:image/png;base64,AAAA']])['rows'][1]
            self.assertIn('extra_columns', record['reasons'])
            self.assertEqual(record['evidence'][0]['status'], 'missing')

    def test_signature_states_and_raw(self):
        for signature, expected in [('', 'missing'), ('  ', 'missing'),
                                    ('data:image/png;base64,AAAA', 'complete_encoding'),
                                    ('data:image/png;base64,AAA...[TRUNC]', 'truncated'),
                                    ('data:image/png;base64,@@@', 'invalid_encoding'),
                                    ('https://example.invalid/signature', 'invalid_encoding')]:
            with self.subTest(expected=expected):
                record = self.check([list(VINC_COLUMNS) + ['FIRMA_B64'], row() + [signature]])['rows'][1]
                self.assertEqual(record['evidence'][0]['raw'], signature)
                self.assertEqual(record['evidence'][0]['status'], expected)
                if expected in ('truncated', 'invalid_encoding'):
                    self.assertEqual(record['classification'], 'quarantine')
                if expected == 'complete_encoding':
                    self.assertIn('authenticity unverified', record['evidence'][0]['validation'])

    def test_duplicates_retained_not_deduplicated(self):
        result = self.check([list(VINC_COLUMNS), row(), row()])
        self.assertEqual(result['rows'][2]['duplicate_of_row'], 2)
        self.assertIn('duplicate_raw_row', result['rows'][2]['reasons'])
        self.assertEqual(result['reconciliation']['quarantine'], 1)

    def test_empty_header_only_and_nonstring(self):
        for rows in ([], [list(VINC_COLUMNS)], [[], ['  ']]):
            self.check(rows)
        with self.assertRaises(ValueError):
            transform_vinculaciones([list(VINC_COLUMNS), [None]])

    def test_cli_deterministic_raw_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic.csv'
            with source.open('w', encoding='utf-8-sig', newline='') as stream:
                csv.writer(stream).writerows([VINC_COLUMNS, row()])
            original = source.read_bytes()
            script = Path(__file__).resolve().parents[1] / 'legacy_transform.py'
            outputs = [Path(directory) / name for name in ('one.json', 'two.json')]
            for target in outputs:
                run = subprocess.run([sys.executable, '-B', str(script), 'vinculaciones', str(source), str(target)], capture_output=True, text=True)
                self.assertEqual(run.returncode, 0, run.stderr)
                self.assertNotIn('synthetic@example.invalid', run.stdout + run.stderr)
                self.assertEqual(json.loads(run.stdout)['accounted_rows'], 2)
            self.assertEqual(outputs[0].read_bytes(), outputs[1].read_bytes())
            result = json.loads(outputs[0].read_text(encoding='utf-8'))
            self.assertEqual(result['kind'], 'vinculaciones')
            self.assertEqual(result['raw_csv_text'].encode('utf-8'), original)
            self.assertEqual(result['source_file_sha256'], hashlib.sha256(original).hexdigest())
            for target in (outputs[0], source):
                before = target.read_bytes()
                run = subprocess.run([sys.executable, '-B', str(script), 'vinculaciones', str(source), str(target)], capture_output=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertEqual(target.read_bytes(), before)
            self.assertEqual(source.read_bytes(), original)

    def test_cli_errors_create_no_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic.csv'
            target = Path(directory) / 'out.json'
            script = Path(__file__).resolve().parents[1] / 'legacy_transform.py'
            for content, kind in [(b'"unterminated\nprivate-fixture', 'vinculaciones'),
                                  (b'\xff', 'vinculaciones'), (b'', 'unknown')]:
                source.write_bytes(content)
                run = subprocess.run([sys.executable, '-B', str(script), kind, str(source), str(target)], capture_output=True)
                self.assertNotEqual(run.returncode, 0)
                self.assertFalse(target.exists())
                self.assertNotIn(b'private-fixture', run.stdout + run.stderr)


if __name__ == '__main__':
    unittest.main()
