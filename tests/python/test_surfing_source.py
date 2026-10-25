import sys,tempfile,unittest,hashlib,json,subprocess
from pathlib import Path
import pymupdf as fitz
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
from export_pdf import surfing_document,verify_block
class SurfingSourceTests(unittest.TestCase):
    def source(self,root,rotation=0,empty_second=True):
        path=Path(root)/'paper.pdf';doc=fitz.open();p=doc.new_page(width=300,height=400);p.insert_text((60,90),'A real paper passage');p.set_cropbox(fitz.Rect(20,30,280,370));p.set_rotation(rotation)
        if empty_second:doc.new_page()
        doc.save(path);doc.close();return path,hashlib.sha256(path.read_bytes()).hexdigest()
    def test_all_pages_text_and_geometry_are_bound_to_unchanged_original(self):
        for rotation in (0,90,180,270):
            with self.subTest(rotation=rotation),tempfile.TemporaryDirectory() as root:
                path,fingerprint=self.source(root,rotation);result=surfing_document(str(path),fingerprint)
                self.assertEqual(result['fingerprint'],fingerprint);self.assertEqual(result['pageCount'],2);self.assertEqual([p['pageIndex'] for p in result['pages']],[0,1]);self.assertEqual(result['pages'][1]['passages'],[])
                block=result['pages'][0]['passages'][0];self.assertEqual(block['quote'],'A real paper passage');self.assertTrue(verify_block(str(path),fingerprint,{'pageIndex':0,**block})['verified']);self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),fingerprint)
    def test_deterministic_ids_and_native_geometry(self):
        with tempfile.TemporaryDirectory() as root:
            p,f=self.source(root);self.assertEqual(surfing_document(str(p),f),surfing_document(str(p),f))
    def test_wrong_fingerprint_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p,f=self.source(root)
            with self.assertRaisesRegex(ValueError,'SOURCE_CHANGED'):surfing_document(str(p),'0'*64)
    def test_limits_reject_without_truncated_success(self):
        with tempfile.TemporaryDirectory() as root:
            p,f=self.source(root)
            with self.assertRaisesRegex(ValueError,'SURFING_CONTEXT_TOO_LARGE'):surfing_document(str(p),f,max_characters=2)
            with self.assertRaisesRegex(ValueError,'SURFING_CONTEXT_TOO_LARGE'):surfing_document(str(p),f,max_pages=1)
    def test_passage_count_limit(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'two.pdf';d=fitz.open();p=d.new_page();p.insert_text((60,90),'First line');p.insert_text((60,120),'Second line');d.save(path);d.close();f=hashlib.sha256(path.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError,'SURFING_CONTEXT_TOO_LARGE'):surfing_document(str(path),f,max_passages=1)
    def test_unusable_lines_are_skipped_not_fatal(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'stamp.pdf';d=fitz.open();p=d.new_page();p.insert_text((60,90),'Body text');p.insert_text((20,700),'arXiv:2410.00001v1 [cs.CL]',rotate=90);d.save(path);d.close();f=hashlib.sha256(path.read_bytes()).hexdigest()
            result=surfing_document(str(path),f);self.assertEqual([b['quote'] for b in result['pages'][0]['passages']],['Body text'])
    def test_invalid_limits(self):
        with tempfile.TemporaryDirectory() as root:
            p,f=self.source(root)
            for value in (0,-1,True,1.5):
                with self.subTest(value=value),self.assertRaisesRegex(ValueError,'SURFING_INVALID_INPUT'):surfing_document(str(p),f,max_characters=value)
    def test_cli_exposes_only_requested_document_extraction(self):
        with tempfile.TemporaryDirectory() as root:
            p,f=self.source(root);run=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[2]/'python/export_pdf.py')],input=json.dumps({'operation':'surfing-document','source':str(p),'fingerprint':f}).encode(),capture_output=True)
            self.assertEqual(run.returncode,0,run.stdout);self.assertEqual(json.loads(run.stdout)['value']['pageCount'],2)
if __name__=='__main__':unittest.main()
