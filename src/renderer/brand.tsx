// Approved Enlumor mark (brand/logo-v1, light-surface variant). Used as an <img> so its gradient ids stay isolated.
import logoUrl from './brand/enlumor-logo-light.svg';

// Page silhouettes from enlumor-logo-mono.svg: left = the reader's page, right = the companion's page.
const pages={
 left:{viewBox:'10 8 230 255',d:'M20 25.5C78 4.5 143 14.5 186 50.5C215 74.5 230 98 233.5 124.5C238 163 235 210 223 259C205 243 185 235 158 230C123 222 90 224 64 211C36 197 26 173 21 141L13 39C12.2 31.5 13.3 28 20 25.5Z'},
 right:{viewBox:'224 8 200 255',d:'M227 259C242 216 250 169 239 129C254 96 278 66 313 45C347 23.5 384 13 415 11.5C419 11.1 422 11.2 421.7 17.3C419.5 74 409.5 119.5 382 150C355 181 319 191 283 208C259 219.5 242 239.5 227 259Z'}
};

export function BrandMark({className}:{className?:string}){
 return <img className={className} src={logoUrl} alt="" aria-hidden="true" draggable={false}/>;
}

export function PageGlyph({side,className}:{side:'left'|'right';className?:string}){
 const page=pages[side];
 return <svg className={className} viewBox={page.viewBox} fill="currentColor" aria-hidden="true" focusable="false"><path d={page.d}/></svg>;
}
