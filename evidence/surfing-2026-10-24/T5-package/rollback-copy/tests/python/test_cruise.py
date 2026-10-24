import sys,tempfile,unittest,hashlib
from pathlib import Path
import pymupdf as f
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python'))
from export_pdf import verify_block
class CruiseAnchorTests(unittest.TestCase):
 def test_native_crop_rotations_reject_wrong_quote_and_geometry_without_source_write(self):
  with tempfile.TemporaryDirectory() as folder:
   source=Path(folder)/'anchor.pdf';d=f.open()
   for rotation in (0,90,180,270):
    p=d.new_page(width=600,height=800);p.insert_text((60,100),'Original evidence',fontsize=14);p.set_cropbox(f.Rect(20,30,580,770));p.set_rotation(rotation)
   d.save(source);d.close();before=hashlib.sha256(source.read_bytes()).hexdigest()
   for index in range(4):
    block={'pageIndex':index,'quote':'Original evidence','quads':[[60,714,180,714,60,696,180,696]]}
    self.assertEqual(verify_block(source,before,block),{'verified':True})
    with self.assertRaisesRegex(ValueError,'CRUISE_ANCHOR_INVALID'):verify_block(source,before,{**block,'quote':'invented'})
    with self.assertRaisesRegex(ValueError,'CRUISE_ANCHOR_INVALID'):verify_block(source,before,{**block,'quads':[[300,714,420,714,300,696,420,696]]})
   self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)
if __name__=='__main__':unittest.main()
