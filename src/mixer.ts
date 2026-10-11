import {hexToHsv,hsvToHex,type Hsv} from './palette';
const unit=(n:number)=>Math.max(0,Math.min(1,n));
// Hue/shade sheet. Resolves with the mixed hex, or null when cancelled (button, Escape).
// Pick hides the sheet for an eyedropper pass over the drawing; `sample` reads the composed painting under a client point.
export function createMixer(sample:(x:number,y:number)=>string|null){
 const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 const dialog=$<HTMLDialogElement>('mixer'),shade=$('shade'),thumb=$('shade-thumb'),hue=$<HTMLInputElement>('hue'),preview=$('mixer-preview');
 let hsv:Hsv={h:0,s:0,v:0},fallback='#000000';
 // The sheet opens under a finger that is still pressing (long-press). Its lift must not click whatever button lands under it.
 let openedAt=0,fresh=false;
 dialog.addEventListener('pointerdown',()=>fresh=true,true);
 dialog.addEventListener('click',e=>{if(!fresh&&performance.now()-openedAt<800){e.stopPropagation();e.preventDefault();}},true);
 function paint(){const hex=hsvToHex(hsv);shade.style.setProperty('--hue',`hsl(${hsv.h} 100% 50%)`);thumb.style.left=hsv.s*100+'%';thumb.style.top=(1-hsv.v)*100+'%';thumb.style.background=hex;preview.style.background=hex;hue.value=String(Math.round(hsv.h));shade.setAttribute('aria-valuenow',String(Math.round(hsv.s*100)));shade.setAttribute('aria-valuetext',`${Math.round(hsv.s*100)}% colour, ${Math.round(hsv.v*100)}% light, ${hex}`);}
 function pick(e:PointerEvent){const r=shade.getBoundingClientRect();hsv.s=unit((e.clientX-r.left)/r.width);hsv.v=1-unit((e.clientY-r.top)/r.height);paint();}
 shade.onpointerdown=e=>{e.preventDefault();shade.setPointerCapture(e.pointerId);pick(e);};
 shade.onpointermove=e=>{if(shade.hasPointerCapture(e.pointerId))pick(e);};
 shade.onkeydown=e=>{const step=e.shiftKey?.1:.02,keys:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]},k=keys[e.key];if(!k)return;e.preventDefault();hsv.s=unit(hsv.s+k[0]);hsv.v=unit(hsv.v+k[1]);paint();};
 hue.oninput=()=>{hsv.h=+hue.value;paint();};
 $('mixer-reset').onclick=()=>{hsv=hexToHsv(fallback);paint();};
 $('mixer-cancel').onclick=()=>dialog.close('');
 $('mixer-use').onclick=()=>dialog.close(hsvToHex(hsv));
 const picker=$('picker'),loupe=$('loupe');let picked:string|null=null;
 $('mixer-pick').onclick=()=>{picked=null;loupe.hidden=true;dialog.close('pick');picker.hidden=false;};
 function look(e:PointerEvent){picked=sample(e.clientX,e.clientY);loupe.hidden=!picked;loupe.style.background=picked??'';loupe.style.left=e.clientX+'px';loupe.style.top=e.clientY+'px';}
 picker.onpointerdown=e=>{if(e.target!==picker)return;e.preventDefault();picker.setPointerCapture(e.pointerId);look(e);};
 picker.onpointermove=e=>{if(picker.hasPointerCapture(e.pointerId))look(e);};
 const back=()=>{picker.hidden=true;dialog.returnValue='';fresh=false;openedAt=performance.now();dialog.showModal();};
 picker.onpointerup=e=>{if(!picker.hasPointerCapture(e.pointerId))return;look(e);if(picked){hsv=hexToHsv(picked);paint();}back();};
 picker.onpointercancel=back;$('picker-cancel').onclick=back;
 return (hex:string,reset:string)=>new Promise<string|null>(resolve=>{hsv=hexToHsv(hex);fallback=reset;paint();dialog.returnValue='';const closed=()=>{if(dialog.returnValue==='pick')return;dialog.removeEventListener('close',closed);resolve(dialog.returnValue||null);};dialog.addEventListener('close',closed);fresh=false;openedAt=performance.now();dialog.showModal();});
}
