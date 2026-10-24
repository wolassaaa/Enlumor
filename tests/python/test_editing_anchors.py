import sys, tempfile, unittest, hashlib, json, subprocess
from pathlib import Path
import pymupdf as fitz
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'python'))
from export_pdf import editing_document, editing_page

class EditingAnchorTests(unittest.TestCase):
    def make(self, folder, rotation=0, scan=False):
        source=Path(folder)/'中文 source.pdf';doc=fitz.open();p=doc.new_page(width=400,height=500)
        if not scan:
            p.insert_text((60,90),'Repeated sentence')
            p.insert_text((220,90),'Right column')
            p.insert_text((60,130),'Repeated sentence')
            p.insert_text((60,170),'Second line')
            p.insert_text((140,280),'Diagonal',morph=(fitz.Point(140,280),fitz.Matrix(25)))
        p.set_cropbox(fitz.Rect(20,30,380,470));p.set_rotation(rotation);doc.save(source);doc.close()
        return str(source), hashlib.sha256(source.read_bytes()).hexdigest()

    def test_native_four_vertices_crop_rotations_and_source_unchanged(self):
        for rotation in (0,90,180,270):
            with self.subTest(rotation=rotation),tempfile.TemporaryDirectory() as folder:
                source,fp=self.make(folder,rotation)
                meta=editing_document(source,fp);self.assertEqual(meta['fingerprint'],fp);self.assertEqual(meta['pageCount'],1)
                self.assertEqual(meta['pageBounds'],[[20.0,30.0,380.0,470.0]])
                data=editing_page(source,fp,0);self.assertEqual(data['parserVersion'],1);self.assertEqual(data['nativeBounds'],meta['pageBounds'][0])
                lines=data['lines'];self.assertEqual([''.join(c['text'] for c in l['chars']) for l in lines[:4]],['Repeated sentence','Right column','Repeated sentence','Second line'])
                char=lines[0]['chars'][0];self.assertEqual(char['text'],'R');self.assertEqual(len(char['quad']),8)
                self.assertAlmostEqual(char['quad'][0],60,places=2);self.assertAlmostEqual(char['quad'][1],421.825,places=2)
                diagonal=lines[-1];self.assertNotEqual(diagonal['direction'][1],0);self.assertNotEqual(diagonal['chars'][0]['quad'][1],diagonal['chars'][0]['quad'][3])
                self.assertEqual(hashlib.sha256(Path(source).read_bytes()).hexdigest(),fp)

    def test_metadata_never_extracts_text_and_scanned_page_has_no_characters(self):
        with tempfile.TemporaryDirectory() as folder:
            source,fp=self.make(folder,scan=True)
            from unittest.mock import patch
            with patch.object(fitz.Page,'get_text',side_effect=AssertionError('metadata extracted text')):
                self.assertEqual(editing_document(source,fp)['pageCount'],1)
            self.assertEqual(editing_page(source,fp,0)['lines'],[])

    def test_native_negative_media_coordinates(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'negative.pdf';doc=fitz.open();page=doc.new_page(width=400,height=500);page.set_mediabox(fitz.Rect(-40,-50,360,450));doc.save(p);doc.close()
            fp=hashlib.sha256(p.read_bytes()).hexdigest();self.assertEqual(editing_document(str(p),fp)['pageBounds'],[[-40.0,-50.0,360.0,450.0]])

    def test_missing_changed_invalid_page_and_cli(self):
        with tempfile.TemporaryDirectory() as folder:
            source,fp=self.make(folder)
            with self.assertRaisesRegex(ValueError,'SOURCE_CHANGED'):editing_page(source,'a'*64,0)
            with self.assertRaisesRegex(ValueError,'ANCHOR_NOT_FOUND'):editing_page(source,fp,1)
            with self.assertRaisesRegex(ValueError,'ANCHOR_NOT_FOUND'):editing_page(source,fp,True)
            with self.assertRaisesRegex(ValueError,'SOURCE_MISSING'):editing_document(source+'.missing',fp)
            for operation in ('editing-document','editing-page'):
                out=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[2]/'python/export_pdf.py')],input=json.dumps({'operation':operation,'source':source,'fingerprint':fp,'pageIndex':0}).encode(),capture_output=True)
                self.assertEqual(out.returncode,0,out.stdout);self.assertTrue(json.loads(out.stdout)['ok'])

    def test_source_changed_during_extraction_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            source,fp=self.make(folder);from unittest.mock import patch
            original=fitz.Page.get_text
            def changed(page,*args,**kwargs):
                result=original(page,*args,**kwargs)
                with open(source,'ab') as f:f.write(b'\n% changed fixture')
                return result
            with patch.object(fitz.Page,'get_text',changed):
                with self.assertRaisesRegex(ValueError,'SOURCE_CHANGED'):editing_page(source,fp,0)

    def test_character_and_serialized_response_limits_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as folder:
            source,fp=self.make(folder);from unittest.mock import patch
            with fitz.open(source) as doc: raw=doc[0].get_text('rawdict')
            span=raw['blocks'][0]['lines'][0]['spans'][0];char=span['chars'][0]
            raw['blocks']=raw['blocks'][:1];raw['blocks'][0]['lines']=raw['blocks'][0]['lines'][:1];raw['blocks'][0]['lines'][0]['spans']=[span]
            for count,code in [(100001,'EDIT_TOO_LARGE'),(9000,'PDF_RESPONSE_TOO_LARGE')]:
                with self.subTest(count=count):
                    span['chars']=[char]*count
                    with patch.object(fitz.Page,'get_text',return_value=raw):
                        with self.assertRaisesRegex(ValueError,code):editing_page(source,fp,0)

if __name__=='__main__':unittest.main()
