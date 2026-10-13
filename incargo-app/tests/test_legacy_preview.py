import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from legacy_preview import inspect_rows,inspect_vinculaciones,VINC_COLUMNS


class LegacyPreviewTest(unittest.TestCase):
    def test_first_row_kept_and_layouts(self):
        rows=[['2026-01-01']+['ficticio']*11+['[]','data:image/png;base64,AAAA'],
              ['2026-01-02']+['ficticio']*14+['[]','data:image/png;base64,AAAA',''],
              ['2026-01-03']+['ficticio']*15+['[]','data:image/png;base64,AAA...[TRUNC]','']]
        result=inspect_rows(rows)
        self.assertEqual(result['source_rows'],3)
        self.assertEqual(result['legacy_14_columns'],1)
        self.assertEqual(result['legacy_18_columns'],1)
        self.assertEqual(result['current_19_columns'],1)
        self.assertEqual(result['truncated_evidence'],1)

    def test_acceptance_preserves_missing_signature(self):
        rows=[list(VINC_COLUMNS),['t','correo ficticio','tipo','','nombre','CC','id','correo','SI','t','1']]
        result=inspect_vinculaciones(rows)
        self.assertEqual(result['source_rows'],1)
        self.assertEqual(result['accepted'],1)
        self.assertNotIn('signature_present',result)


if __name__=='__main__':
    unittest.main()
