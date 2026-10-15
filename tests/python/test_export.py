import sys, tempfile, unittest, hashlib, subprocess, json, os
from pathlib import Path
import pymupdf as fitz
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'python'))
from export_pdf import export_pdf

class ExportTests(unittest.TestCase):
    def test_cli_accepts_utf8_chinese_paths_with_windows_legacy_encoding(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / '中文 source.pdf'
            doc = fitz.open(); doc.new_page(); doc.save(source); doc.close()
            request = json.dumps({'operation':'inspect','source':str(source)}, ensure_ascii=False).encode('utf-8')
            run = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[2] / 'python/export_pdf.py')], input=request, capture_output=True, env={**os.environ, 'PYTHONIOENCODING':'gbk', 'PYTHONUTF8':'0'})
            self.assertEqual(run.returncode, 0, run.stdout)
            self.assertEqual(json.loads(run.stdout)['value']['pageCount'], 1)

    def test_rotation_crop_native_marks_and_repeat_exports(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); source = root / '中文 original.pdf'
                doc = fitz.open(); page = doc.new_page(width=300, height=400)
                page.insert_text((60, 90), 'Evidence and original annotation')
                page.set_cropbox(fitz.Rect(20, 30, 280, 370)); page.set_rotation(rotation)
                page.add_text_annot((60, 130), 'existing'); doc.save(source); doc.close()
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                # PDF default user-space quads. Text sits near PDF y=310; crop offset matters.
                marks = [{'id':'a', 'type':'highlight', 'pageIndex':0, 'quads':[[60,325,180,325,60,305,180,305]], 'color':'#f4cf58', 'quote':'Evidence', 'note':''},
                         {'id':'b', 'type':'note', 'pageIndex':0, 'quads':[[60,280,80,280,60,260,80,260]], 'color':'#f4cf58', 'note':'Saved note'}]
                for i in range(2):
                    out = root / f'export-{i}.pdf'
                    result = export_pdf(str(source), str(out), digest, marks)
                    self.assertEqual(result['annotationCount'], 2)
                    with fitz.open(out) as exported:
                        exported_page = exported[0]
                        annotations = list(exported_page.annots())
                        self.assertEqual(len(annotations), 3)
                        highlight = next(a for a in annotations if a.type[0] == 8)
                        # independent expected: x minus crop x, y reflected then minus crop y
                        self.assertAlmostEqual(highlight.vertices[0][0], 40, places=2)
                        self.assertAlmostEqual(highlight.vertices[0][1], 45, places=2)
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)

    def test_underline_standard_subtype_crop_rotation_and_repeat_export(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation), tempfile.TemporaryDirectory() as folder:
                source=Path(folder)/'source.pdf'; doc=fitz.open(); page=doc.new_page(width=300,height=400)
                page.insert_text((60,90),'Underline evidence');page.set_cropbox(fitz.Rect(20,30,280,370));page.set_rotation(rotation)
                page.add_text_annot((40,100),'existing');doc.save(source);doc.close();fingerprint=hashlib.sha256(source.read_bytes()).hexdigest()
                mark={'id':'underline-1','type':'underline','pageIndex':0,'quads':[[60,325,180,325,60,305,180,305]],'color':'#335588','quote':'Underline evidence','note':''}
                for index in range(2):
                    target=Path(folder)/f'out-{index}.pdf';export_pdf(str(source),str(target),fingerprint,[mark])
                    with fitz.open(target) as exported:
                        page=exported[0];items=list(page.annots());self.assertEqual(len(items),2)
                        underline=next(a for a in items if a.type[0]==9)
                        self.assertAlmostEqual(underline.vertices[0][0],40,places=2);self.assertAlmostEqual(underline.vertices[0][1],45,places=2)
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),fingerprint)

    def test_strikeout_and_line_crop_rotation_repeat_exports(self):
        for rotation in (0,90,180,270):
            with self.subTest(rotation=rotation), tempfile.TemporaryDirectory() as folder:
                source=Path(folder)/'source.pdf';doc=fitz.open();page=doc.new_page(width=300,height=400)
                page.insert_text((60,90),'Marked evidence');page.set_cropbox(fitz.Rect(20,30,280,370));page.set_rotation(rotation)
                page.add_text_annot((40,100),'existing');doc.save(source);doc.close();fingerprint=hashlib.sha256(source.read_bytes()).hexdigest()
                marks=[{'id':'s','type':'strikeout','pageIndex':0,'quads':[[60,325,180,325,60,305,180,305]],'color':'#335588'},
                       {'id':'l','type':'line','pageIndex':0,'quads':[[59,326,181,326,59,304,181,304]],'points':[60,325,180,305],'color':'#335588'}]
                for index in range(2):
                    target=Path(folder)/f'out-{index}.pdf';export_pdf(str(source),str(target),fingerprint,marks)
                    with fitz.open(target) as exported:
                        page=exported[0];items=list(page.annots());self.assertEqual(len(items),3)
                        self.assertEqual(sorted(a.type[0] for a in items),[0,3,11]);line=next(a for a in items if a.type[0]==3)
                        self.assertEqual(line.vertices,[(40.0,45.0),(160.0,65.0)])
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),fingerprint)

    def test_rejects_overwrite_stale_and_invalid_without_output(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.pdf'; out = Path(folder) / 'out.pdf'
            doc = fitz.open(); doc.new_page(); doc.save(source); doc.close()
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            with self.assertRaises(Exception): export_pdf(str(source), str(source), digest, [])
            with self.assertRaises(Exception): export_pdf(str(source), str(out), 'stale', [])
            with self.assertRaises(Exception): export_pdf(str(source), str(out), digest, [{'id':'x', 'type':'highlight', 'pageIndex':99, 'quads':[]}])
            self.assertFalse(out.exists())
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), digest)

if __name__ == '__main__': unittest.main()
