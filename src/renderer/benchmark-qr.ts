import {validateBenchmarkManifest,type BenchmarkManifest} from '../shared/benchmark';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

type PageImages={renderPageImage(pageNumber:number,width:number):Promise<ImageData|null>};
let reader:Promise<typeof import('zxing-wasm/reader')>|null=null;
/** zxing is loaded on first use from the bundled wasm, never from the network. */
function zxing(){
 return reader??=import('zxing-wasm/reader').then(async z=>{const wasmBinary=await (await fetch(wasmUrl)).arrayBuffer();await z.prepareZXingModule({overrides:{wasmBinary},fireImmediately:true});return z;});
}

/** Reads a benchmark manifest from the QR code printed on the PDF's last page, or null when there is none. */
export async function scanBenchmarkQr(pages:PageImages,pageCount:number):Promise<BenchmarkManifest|null>{
 const image=await pages.renderPageImage(pageCount,1200);if(!image)return null;
 const [code]=await (await zxing()).readBarcodes(image,{formats:['QRCode'],tryHarder:true,maxNumberOfSymbols:1});
 if(!code?.isValid)return null;
 try{return validateBenchmarkManifest(JSON.parse(code.text));}catch{return null;}
}
