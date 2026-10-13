import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from import_preview import preview


class PreviewTest(unittest.TestCase):
    def test_counts_and_rejections(self):
        fixture = Path(__file__).with_name('fixture_deliveries.csv')
        self.assertEqual(preview(fixture), {
            'rows': 4,
            'accepted_deliveries': 2,
            'referenced_trips': 1,
            'rejected': {'duplicate_source_id': 1, 'required_field_blank': 1},
        })


if __name__ == '__main__':
    unittest.main()
