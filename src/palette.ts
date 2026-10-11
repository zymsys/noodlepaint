export type Hsv={h:number;s:number;v:number};
export const DEFAULT_PALETTE=['#293355','#217a71','#d15b68','#9866b5'],DEFAULT_NAMES=['Midnight','Lagoon','Guava','Lilac'];
const HEX=/^#[0-9a-f]{6}$/,KEY='noodlepaint-palette';
export function hsvToHex({h,s,v}:Hsv){const f=(n:number)=>{const k=(n+h/60)%6;return Math.round(255*(v-v*s*Math.max(0,Math.min(k,4-k,1))));};return '#'+[f(5),f(3),f(1)].map(c=>c.toString(16).padStart(2,'0')).join('');}
export function hexToHsv(hex:string):Hsv{
 const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,v=Math.max(r,g,b),d=v-Math.min(r,g,b);
 const h=!d?0:v===r?60*(((g-b)/d+6)%6):v===g?60*((b-r)/d+2):60*((r-g)/d+4);
 return {h,s:v?d/v:0,v};
}
// Swatch colours are a per-device convenience: any storage failure falls back to the defaults.
export function parsePalette(raw:string|null):string[]{try{const p=JSON.parse(raw??'null');if(Array.isArray(p)&&p.length===DEFAULT_PALETTE.length&&p.every(c=>typeof c==='string'&&HEX.test(c)))return p;}catch{}return DEFAULT_PALETTE.slice();}
export function loadPalette(){try{return parsePalette(localStorage.getItem(KEY));}catch{return DEFAULT_PALETTE.slice();}}
export function savePalette(p:string[]){try{localStorage.setItem(KEY,JSON.stringify(p));}catch{}}
