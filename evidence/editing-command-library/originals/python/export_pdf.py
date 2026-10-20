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
    try:
        opened = fitz.open(source)
    except Exception as error:
        raise ValueError('INVALID_PDF: 文件损坏或不是有效 PDF') from error
    with opened as doc:
        if doc.needs_pass:
            raise ValueError('PASSWORD_REQUIRED: 首期暂不打开加密 PDF')
        if not doc.is_pdf or doc.page_count < 1:
            raise ValueError('INVALID_PDF: 文件不是有效 PDF')
        return {'pageCount': doc.page_count}

def verify_block(source, fingerprint, block):
    import unicodedata
    invalid = 'CRUISE_ANCHOR_INVALID'
    if digest(source) != fingerprint: raise ValueError('SOURCE_CHANGED')
    normalize = lambda text: ''.join(unicodedata.normalize('NFKC', text).split())
    with fitz.open(source) as doc:
        index = block.get('pageIndex')
        if type(index) is not int or not 0 <= index < len(doc): raise ValueError(invalid)
        quote, quads = block.get('quote'), block.get('quads')
        if not isinstance(quote,str) or not 0 < len(quote) <= 1200 or not isinstance(quads,list) or not 0 < len(quads) <= 100: raise ValueError(invalid)
        page=doc[index];page.set_rotation(0);matrix=page.transformation_matrix
        chars=[char for b in page.get_text('rawdict')['blocks'] if b.get('type') == 0 for line in b['lines'] for span in line['spans'] for char in span['chars']]
        fragments=[]
        for q in quads:
            if not isinstance(q,list) or len(q)!=8 or any(type(v) not in (int,float) or not math.isfinite(v) for v in q): raise ValueError(invalid)
            quad=fitz.Quad([fitz.Point(q[i],q[i+1])*matrix for i in (0,2,4,6)])
            if not quad.is_convex or quad.is_empty: raise ValueError(invalid)
            rect=quad.rect
            if not page.rect.contains(rect): raise ValueError(invalid)
            selected=[c for c in chars if rect.contains((fitz.Rect(c['bbox']).tl+fitz.Rect(c['bbox']).br)*.5)]
            selected.sort(key=lambda c:c['bbox'][0]);fragments.append(''.join(c['c'] for c in selected))
        if normalize(''.join(fragments)) != normalize(quote): raise ValueError(invalid)
    if digest(source) != fingerprint: raise ValueError('SOURCE_CHANGED')
    return {'verified':True}

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
                if item['type'] not in ('highlight', 'underline', 'strikeout', 'line', 'arrow', 'ink', 'note') or not item['quads']:
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
                elif item['type'] == 'underline':
                    annotation = page.add_underline_annot(quads)
                elif item['type'] == 'strikeout':
                    annotation = page.add_strikeout_annot(quads)
                elif item['type'] in ('line', 'arrow'):
                    points = item.get('points')
                    if not isinstance(points, list) or len(points) != 4 or any(type(n) not in (int,float) or not math.isfinite(n) for n in points) or math.hypot(points[2]-points[0],points[3]-points[1]) < 1e-6:
                        raise ValueError('INVALID_GEOMETRY')
                    annotation = page.add_line_annot(fitz.Point(points[0],points[1])*matrix, fitz.Point(points[2],points[3])*matrix)
                    if item['type'] == 'arrow':
                        annotation.set_line_ends(0,5)
                        annotation.set_border(width=1.125)
                elif item['type'] == 'ink':
                    points=item.get('points')
                    if not isinstance(points,list) or not 4 <= len(points) <= 8192 or len(points)%2 or any(type(n) not in (int,float) or not math.isfinite(n) for n in points) or not any(abs(n-points[i%2])>=1e-6 for i,n in enumerate(points) if i>=2):
                        raise ValueError('INVALID_GEOMETRY')
                    annotation=page.add_ink_annot([[tuple(fitz.Point(points[i],points[i+1])*matrix) for i in range(0,len(points),2)]])
                    annotation.set_border(width=1.125)
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
        request = json.loads(sys.stdin.buffer.read())
        if request['operation'] == 'inspect': result = inspect_pdf(request['source'])
        elif request['operation'] == 'verify-block': result = verify_block(request['source'], request['fingerprint'], request['block'])
        elif request['operation'] == 'export': result = export_pdf(request['source'], request['target'], request['fingerprint'], request['annotations'])
        else: raise ValueError('INVALID_OPERATION')
        print(json.dumps({'ok': True, 'value': result}, ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=True))
        sys.exit(1)
