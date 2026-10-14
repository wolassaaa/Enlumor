"""One JSON request per process; never writes the source PDF."""
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import pymupdf as fitz

def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def inspect_pdf(source):
    with fitz.open(source) as doc:
        if doc.needs_pass:
            raise ValueError('PASSWORD_REQUIRED: 首期暂不打开加密 PDF')
        if not doc.is_pdf or doc.page_count < 1:
            raise ValueError('INVALID_PDF: 文件不是有效 PDF')
        return {'pageCount': doc.page_count}

def export_pdf(source, target, fingerprint, annotations):
    source, target = Path(source).resolve(), Path(target).resolve()
    if source == target or (target.exists() and os.path.samefile(source, target)):
        raise ValueError('SOURCE_OVERWRITE: 请另存为新文件')
    if digest(source) != fingerprint:
        raise ValueError('SOURCE_CHANGED: 原 PDF 内容发生变化')
    fd, temporary = tempfile.mkstemp(prefix='.enlumor-', suffix='.pdf', dir=target.parent)
    os.close(fd)
    try:
        with fitz.open(source) as doc:
            if doc.needs_pass:
                raise ValueError('PASSWORD_REQUIRED')
            original_count = sum(len(list(page.annots() or [])) for page in doc)
            ids = set()
            for item in annotations:
                if item['id'] in ids:
                    raise ValueError('INVALID_ANNOTATION: duplicate id')
                ids.add(item['id'])
                index = item['pageIndex']
                if type(index) is not int or not 0 <= index < len(doc):
                    raise ValueError('INVALID_PAGE')
                if item['type'] not in ('highlight', 'note') or not item['quads']:
                    raise ValueError('INVALID_ANNOTATION')
                page = doc[index]
                # PyMuPDF's rotated-page transformation_matrix loses crop translation.
                # Temporarily derotate, then use the native PDF -> MuPDF matrix.
                rotation = page.rotation
                page.set_rotation(0)
                matrix = page.transformation_matrix
                quads = []
                for q in item['quads']:
                    if len(q) != 8 or any(type(n) not in (int, float) or not math.isfinite(n) for n in q):
                        raise ValueError('INVALID_GEOMETRY')
                    quad = fitz.Quad([fitz.Point(q[i], q[i+1]) * matrix for i in (0, 2, 4, 6)])
                    if not quad.is_convex or quad.is_empty:
                        raise ValueError('INVALID_GEOMETRY')
                    quads.append(quad)
                color = item.get('color', '#f4cf58')
                if len(color) != 7 or color[0] != '#': raise ValueError('INVALID_COLOR')
                rgb = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5))
                if item['type'] == 'highlight':
                    annotation = page.add_highlight_annot(quads)
                else:
                    annotation = page.add_text_annot(quads[0].ul, item.get('note', ''))
                annotation.set_colors(stroke=rgb)
                annotation.set_info(title='Enlumor', content=item.get('note') or item.get('quote', ''), subject=item['id'])
                annotation.update()
                page.set_rotation(rotation)
            doc.save(temporary, garbage=3, deflate=True)
        with fitz.open(temporary) as result:
            actual = sum(len(list(page.annots() or [])) for page in result)
            if actual != original_count + len(annotations):
                raise ValueError('EXPORT_VERIFY_FAILED')
        if digest(source) != fingerprint: raise ValueError('SOURCE_CHANGED')
        with open(temporary, 'r+b') as stream: os.fsync(stream.fileno())
        os.replace(temporary, target)
        return {'path': str(target), 'annotationCount': len(annotations)}
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        result = inspect_pdf(request['source']) if request['operation'] == 'inspect' else export_pdf(request['source'], request['target'], request['fingerprint'], request['annotations'])
        print(json.dumps({'ok': True, 'value': result}, ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=True))
        sys.exit(1)
