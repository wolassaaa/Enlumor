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
