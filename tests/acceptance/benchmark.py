"""Benchmark PDFs carry their own test: a QR code on an appended last page, and the same manifest as an
embedded file the harness reads without decoding images.

  add:  benchmark.py add <paper.pdf> <manifest.json> <out.pdf>   (works for any paper)
  read: benchmark.py read <benchmark.pdf>                         (prints the manifest JSON)
"""
import io, json, sys
import pymupdf as fitz

NAME = 'enlumor-benchmark.json'

def add(source, manifest_path, out):
    manifest = json.load(open(manifest_path, encoding='utf-8'))
    if manifest.get('enlumorBenchmark') != 1 or not isinstance(manifest.get('checks'), list): raise ValueError('not an Enlumor benchmark manifest')
    data = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    import segno
    # One vector path (via SVG) stays sharp at any render size; raster images and per-module squares get
    # smoothed seams and stop decoding.
    svg = io.BytesIO(); segno.make(data, error='l', micro=False).save(svg, kind='svg', scale=10, border=4, xmldecl=False)
    doc = fitz.open(source)
    rect = doc[-1].rect
    page = doc.new_page(width=rect.width, height=rect.height)
    side = min(rect.width, rect.height) * 0.7
    with fitz.open(stream=svg.getvalue(), filetype='svg') as qr:
        page.show_pdf_page(fitz.Rect((rect.width - side) / 2, (rect.height - side) / 2, (rect.width + side) / 2, (rect.height + side) / 2), fitz.open('pdf', qr.convert_to_pdf()), 0)
    if NAME in doc.embfile_names(): doc.embfile_del(NAME)
    doc.embfile_add(NAME, data, filename=NAME, desc='Enlumor benchmark manifest')
    doc.save(out)
    verify_qr(out, manifest)

def verify_qr(path, manifest):
    """Confirms the printed QR decodes back to the manifest, when OpenCV is installed (its ArUco decoder is the reliable one)."""
    try:
        import cv2, numpy as np
    except ImportError:
        print('QR not verified: install opencv-python-headless to check it decodes'); return
    with fitz.open(path) as doc:
        pix = doc[-1].get_pixmap(dpi=150, colorspace=fitz.csGRAY)
    image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w).copy()
    text = cv2.QRCodeDetectorAruco().detectAndDecode(image)[0]
    if not text or json.loads(text) != manifest: raise ValueError('the printed QR code does not decode back to the manifest')
    print('QR verified')

def read(path):
    with fitz.open(path) as doc:
        if NAME not in doc.embfile_names(): raise ValueError('no Enlumor benchmark manifest in this PDF')
        return json.loads(doc.embfile_get(NAME).decode('utf-8'))

if __name__ == '__main__':
    if sys.argv[1] == 'add': add(sys.argv[2], sys.argv[3], sys.argv[4])
    # ASCII-only output survives a GBK Windows console between Python and the Node harness.
    elif sys.argv[1] == 'read': print(json.dumps(read(sys.argv[2]), ensure_ascii=True))
    else: raise SystemExit(__doc__)
