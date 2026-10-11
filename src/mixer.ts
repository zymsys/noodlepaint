import {hexToHsv,hsvToHex,type Hsv} from './palette';
const unit=(n:number)=>Math.max(0,Math.min(1,n));
// Hue/shade sheet. Resolves with the mixed hex, or null when cancelled (button, Escape).
export function createMixer(){
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=$<HTMLDialogElement>('mixer'),shade=$('shade'),thumb=$('shade-thumb'),hue=$<HTMLInputElement>('hue'),preview=$('mixer-preview');
 let hsv:Hsv={h:0,s:0,v:0},fallback='#000000';
 function paint(){const hex=hsvToHex(hsv);shade.style.setProperty('--hue',`hsl(${hsv.h} 100% 50%)`);thumb.style.left=hsv.s*100+'%';thumb.style.top=(1-hsv.v)*100+'%';thumb.style.background=hex;preview.style.background=hex;hue.value=String(Math.round(hsv.h));shade.setAttribute('aria-valuenow',String(Math.round(hsv.s*100)));shade.setAttribute('aria-valuetext',`${Math.round(hsv.s*100)}% colour, ${Math.round(hsv.v*100)}% light, ${hex}`);}
 function pick(e:PointerEvent){const r=shade.getBoundingClientRect();hsv.s=unit((e.clientX-r.left)/r.width);hsv.v=1-unit((e.clientY-r.top)/r.height);paint();}
 shade.onpointerdown=e=>{e.preventDefault();shade.setPointerCapture(e.pointerId);pick(e);};
 shade.onpointermove=e=>{if(shade.hasPointerCapture(e.pointerId))pick(e);};
 shade.onkeydown=e=>{const step=e.shiftKey?.1:.02,keys:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]},k=keys[e.key];if(!k)return;e.preventDefault();hsv.s=unit(hsv.s+k[0]);hsv.v=unit(hsv.v+k[1]);paint();};
 hue.oninput=()=>{hsv.h=+hue.value;paint();};
 $('mixer-reset').onclick=()=>{hsv=hexToHsv(fallback);paint();};
 $('mixer-cancel').onclick=()=>dialog.close('');
 $('mixer-use').onclick=()=>dialog.close(hsvToHex(hsv));
 return (hex:string,reset:string)=>new Promise<string|null>(resolve=>{hsv=hexToHsv(hex);fallback=reset;paint();dialog.returnValue='';dialog.addEventListener('close',()=>resolve(dialog.returnValue||null),{once:true});dialog.showModal();});
}
