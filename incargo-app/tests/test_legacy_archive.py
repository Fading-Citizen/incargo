import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('legacy_archive',Path(__file__).resolve().parents[2]/'panel/scripts/prepare-legacy-import.py')
archive=importlib.util.module_from_spec(spec);spec.loader.exec_module(archive)
class ArchiveTests(unittest.TestCase):
    def prepare(self,rows):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        root=Path(temp.name)
        for name,data in [('inspections',rows),('affiliations',[{'name':'Synthetic'}])]:
            (root/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False))
        audit=archive.prepare([root/'inspections.json',root/'affiliations.json'],root/'output')
        return root/'output',audit
    def test_bounded_complete_snapshot_and_literal_escaping(self):
        out,audit=self.prepare([{'ciudad':"O'Hare; --",'firma':'[TRUNC]','payload':'x'*130000}])
        scripts=[p.read_text() for p in sorted(out.glob('*.sql'))]
        self.assertTrue(all(len(s.encode())<281000 for s in scripts))
        self.assertIn("O''Hare; --",''.join(scripts))
        self.assertEqual(audit[0]['truncated'],1)
        self.assertIn('string_agg(content', ''.join(scripts))
        self.assertIn('Source manifest mismatch',''.join(scripts))
    def test_identical_source_rows_require_reconciliation(self):
        with self.assertRaisesRegex(ValueError,'Identical'):self.prepare([{'a':'b'},{'a':'b'}])
    def test_noncanonical_numbers_are_not_silently_imported(self):
        for value in [1.0,9007199254740992]:
            with self.assertRaisesRegex(ValueError,'numeric'):self.prepare([{'value':value}])
    def test_empty_source_has_explicit_manifest(self):
        _,audit=self.prepare([]);self.assertEqual(audit[0]['records'],0)
if __name__=='__main__':unittest.main()
