import './style.css';
import {Engine,validate} from './engine';
import {SketchStore,SaveQueue} from './storage';
import {Renderer} from './render';
import {DEFAULT_PALETTE,DEFAULT_NAMES,loadPalette,savePalette} from './palette';
import {createMixer} from './mixer';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('canvas'),panel=$<HTMLDialogElement>('panel');
const engine=new Engine(),renderer=new Renderer(canvas,engine),store=new SketchStore();
let ready=false,loadFailed=false,updateReady=false,storageMessage='Opening local storage…',checkpoint=0;
const queue=new SaveQueue(d=>store.write(d),status);
function status(){
 const saved=ready&&!loadFailed&&!queue.error&&queue.savedRevision===engine.revision;
 const label=loadFailed?'Local save unavailable':queue.error?'Not saved · retry':saved?'Saved on this device':'Saving on this device…';
 $('status').textContent=label+(updateReady?' · Update ready':'');
 $('storage-detail').textContent=loadFailed?storageMessage:queue.error?'Save failed. Your drawing is still open. Retry or save a backup.':saved?'Saved on this device. Backups keep it safe.':'Saving your editable brush samples…';
 $('retry').hidden=!queue.error||loadFailed;
}
function persist(){if(!ready||loadFailed)return Promise.resolve();return queue.request(engine.revision,engine.snapshot());}
function changed(){renderer.request();$('hint').hidden=engine.drawing.strokes.length>0||engine.pointers.size>0;$('pen-state').textContent=engine.down?'Making a mark':'Brush raised';$('pen-dot').classList.toggle('down',engine.down);$('width').textContent=String(Math.round(engine.drawing.cursor.w));$<HTMLButtonElement>('undo').disabled=!engine.history.length;$<HTMLButtonElement>('clear').disabled=!engine.drawing.strokes.length;status();}
engine.changed=changed;
async function init(){try{const d=await store.open();if(d)engine.restore(d);showPalette();queue.savedRevision=engine.revision;}catch(e){loadFailed=true;storageMessage='Could not read local storage. Existing data has not been replaced. Save an editable backup before closing.';}ready=true;renderer.resize();changed();}
void init();
const observer=new ResizeObserver(()=>{engine.suspend();renderer.resize();changed();void persist();});observer.observe(canvas);
canvas.addEventListener('pointerdown',e=>{if(!ready||panel.open||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();engine.downPointer(e.pointerId,e.clientX,e.clientY,e.pointerType);try{canvas.setPointerCapture(e.pointerId);}catch{engine.cancelPointer(e.pointerId);}changed();if(engine.down)void persist();});
canvas.addEventListener('pointermove',e=>{if(!engine.pointers.has(e.pointerId))return;e.preventDefault();const samples=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];for(const p of samples.length?samples:[e])engine.movePointer(e.pointerId,p.clientX,p.clientY,renderer.scale);});
function up(e:PointerEvent){const wasDown=engine.down;engine.upPointer(e.pointerId);changed();if(wasDown&&!engine.down)void persist();}
window.addEventListener('pointerup',up);
window.addEventListener('pointercancel',e=>{engine.cancelPointer(e.pointerId);changed();void persist();});
canvas.addEventListener('lostpointercapture',e=>{if(engine.steer===e.pointerId||engine.pressure===e.pointerId){engine.cancelPointer(e.pointerId);changed();void persist();}});
document.addEventListener('pointerdown',e=>{if(e.target!==canvas){engine.suspend();changed();void persist();}},true);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!engine.pointers.size||engine.pointers.get(engine.steer!)?.type==='mouse')engine.resize(-Math.sign(e.deltaY)*2);},{passive:false});
canvas.addEventListener('keydown',e=>{if(!ready||engine.pointers.size)return;const c=engine.drawing.cursor;const amount=(e.shiftKey?20:4)/renderer.scale;if(e.code==='Space'){e.preventDefault();engine.begin();}else if(e.key==='+'||e.key==='='){e.preventDefault();engine.resize(2);}else if(e.key==='-'){e.preventDefault();engine.resize(-2);}else if(e.key.startsWith('Arrow')){e.preventDefault();const dx=e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0,dy=e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0;c.x=Math.max(0,Math.min(engine.drawing.width,c.x+dx));c.y=Math.max(0,Math.min(engine.drawing.height,c.y+dy));engine.sample();}});
canvas.addEventListener('keyup',e=>{if(e.code==='Space'){engine.end();void persist();}});
canvas.addEventListener('blur',()=>{engine.suspend();changed();void persist();});
function checkpointNow(){engine.resetPointers();changed();void persist();}
window.addEventListener('blur',checkpointNow);window.addEventListener('pagehide',checkpointNow);document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpointNow();});
checkpoint=window.setInterval(()=>{if(ready&&queue.savedRevision!==engine.revision)void persist();},500);
void checkpoint;
const palette=loadPalette(),mix=createMixer(),swatches=[...document.querySelectorAll<HTMLButtonElement>('[data-color]')];
function showPalette(){swatches.forEach((b,i)=>{b.dataset.color=palette[i];b.style.setProperty('--ink',palette[i]);b.setAttribute('aria-label',`${palette[i]===DEFAULT_PALETTE[i]?DEFAULT_NAMES[i]:'Mixed'} ink. Press and hold to mix.`);b.setAttribute('aria-pressed',String(palette[i]===engine.drawing.color));});}
function choose(i:number){engine.suspend();engine.drawing.color=palette[i];showPalette();engine.touch();void persist();}
async function remix(i:number){engine.suspend();changed();void persist();const hex=await mix(palette[i],DEFAULT_PALETTE[i]);if(!hex)return;palette[i]=hex;savePalette(palette);choose(i);}
// Tap picks a swatch; press-and-hold (or right-click / context-menu key) opens the mixer for it.
swatches.forEach((b,i)=>{let timer=0,held=false,x=0,y=0;
 b.onpointerdown=e=>{held=false;x=e.clientX;y=e.clientY;clearTimeout(timer);timer=window.setTimeout(()=>{held=true;void remix(i);},450);};
 b.onpointermove=e=>{if(Math.hypot(e.clientX-x,e.clientY-y)>10)clearTimeout(timer);};
 b.onpointerup=b.onpointercancel=b.onpointerleave=()=>clearTimeout(timer);
 b.oncontextmenu=e=>{e.preventDefault();clearTimeout(timer);if(!held&&!$<HTMLDialogElement>('mixer').open)void remix(i);};
 b.onclick=()=>{if(held){held=false;return;}choose(i);};
});
showPalette();
$('undo').onclick=()=>{engine.undo();void persist();};$('clear').onclick=()=>{engine.clear();void persist();};
function help(){engine.suspend();changed();void persist();panel.showModal();}
$('help').onclick=help;$('status').onclick=help;$('close').onclick=()=>panel.close();$('retry').onclick=()=>void persist();
$('export').onclick=()=>{const data=JSON.stringify(engine.snapshot());const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download='noodlepaint-sketch.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);};
// Backup import stays in the help panel; it is always undoable.
const importButton=document.createElement('button');importButton.textContent='Open backup';const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;$('export').parentElement!.append(importButton,picker);importButton.onclick=()=>picker.click();picker.onchange=async()=>{const f=picker.files?.[0];if(!f)return;try{if(f.size>64000000)throw Error('Too large');const d=validate(JSON.parse(await f.text()));if(d.width!==engine.drawing.width||d.height!==engine.drawing.height)throw Error('Different paper size');engine.suspend();engine.history.push(engine.drawing.strokes.slice());engine.drawing.strokes=d.strokes;engine.drawing.cursor=d.cursor;engine.touch();void persist();}catch{alert('This backup could not be opened. Your current drawing is unchanged.');}picker.value='';};
let registration:ServiceWorkerRegistration|undefined;
async function checkOffline(){
 const detail=$('offline-detail');if(!('serviceWorker' in navigator)){detail.textContent='Offline support is not available in this browser.';return;}
 try{registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
 const inspect=()=>{if(registration?.waiting){$('update').hidden=false;updateReady=true;status();}const worker=navigator.serviceWorker.controller;if(!worker){detail.textContent='Preparing offline copy. Keep this app open online.';return;}const channel=new MessageChannel();const timer=setTimeout(()=>{detail.textContent='Offline copy has not been verified. Keep this app online.';},5000);channel.port1.onmessage=e=>{clearTimeout(timer);detail.textContent=e.data?.ready?'Offline ready in this app. Saved drawings remain on this device.':'Offline copy incomplete. Reopen online to retry.';channel.port1.close();};worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);};
 navigator.serviceWorker.addEventListener('controllerchange',inspect);registration.addEventListener('updatefound',()=>{const w=registration?.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'||w.state==='activated')inspect();});});inspect();
 }catch{detail.textContent='Offline setup failed. Hosting or this browser may restrict service workers. You can still paint online.';}
}
void checkOffline();
// Installed apps rarely reload, so look for a new version whenever the app comes back to the foreground.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void registration?.update().catch(()=>{});});
$('update').onclick=async()=>{engine.suspend();await persist();if(loadFailed||queue.error||queue.savedRevision!==engine.revision){$('offline-detail').textContent='Save your drawing before updating. Export a backup if local saving is unavailable.';return;}if(!registration?.waiting)return;navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting.postMessage({type:'ACTIVATE'});};
// The storage permission is requested only after a deliberate backup/save action.
$('export').addEventListener('click',()=>{if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>false);});
// Test-only read access; never enabled in the production bundle.
if(import.meta.env.DEV)Object.assign(window,{__noodlepaint:{engine,renderer,queue}});
