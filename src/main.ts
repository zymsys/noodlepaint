import './style.css';
import {createTutorial} from './tutorial';
import {Engine,BLENDS,MAX_LAYERS,newId,type Blend} from './engine';
import {SketchStore,SaveQueue,newDoc,type Doc} from './storage';
import {Renderer} from './render';
import {DEFAULT_PALETTE,DEFAULT_NAMES,loadPalette,savePalette} from './palette';
import {createMixer} from './mixer';
import {bundle,unbundle} from './backup';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('canvas'),panel=$<HTMLDialogElement>('panel'),menu=$<HTMLDialogElement>('menu'),library=$<HTMLDialogElement>('library'),layers=$<HTMLDialogElement>('layers'),widthSheet=$<HTMLDialogElement>('width-sheet');
const engine=new Engine(),renderer=new Renderer(canvas,engine),store=new SketchStore();
renderer.loadBlob=key=>store.getBlob(key);
let doc:Doc=newDoc('Drawing 1',engine.drawing);
let ready=false,loadFailed=false,updateReady=false,storageMessage='Opening local storage…',checkpoint=0;
const queue=new SaveQueue<Doc>(d=>store.write(d),status);
const sheetOpen=()=>!!document.querySelector('dialog[open]')||!$('picker').hidden;

// ---- Status, saving, feedback
function status(){
 const saved=ready&&!loadFailed&&!queue.error&&queue.savedRevision===engine.revision;
 const label=loadFailed?'Local save unavailable':queue.error?'Not saved · retry':saved?'Saved on this device':'Saving on this device…';
 $('status').textContent=label+(updateReady?' · Update ready':'');
 const badge=loadFailed||queue.error?'alert':updateReady?'update':'';$('more').dataset.badge=badge;$('help-badge').dataset.badge=badge;
 $('storage-detail').textContent=loadFailed?storageMessage:queue.error?'Save failed. Your drawing is still open. Retry or save a backup.':saved?'Saved on this device. Backups keep it safe.':'Saving your editable brush samples…';
 $('retry').hidden=!queue.error||loadFailed;
}
function persist(){if(!ready||loadFailed)return Promise.resolve();return queue.request(engine.revision,{...doc,updated:Date.now(),drawing:engine.snapshot()});}
let toastTimer=0;
function toast(message:string){const t=$('toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.hidden=true,1400);}
engine.notify=toast;
// Library thumbnails refresh a moment after drawing stops.
let thumbTimer=0,thumbRevision=-1;
function scheduleThumb(){clearTimeout(thumbTimer);if(engine.down||!ready||loadFailed)return;thumbTimer=window.setTimeout(()=>void saveThumb(),1500);}
async function saveThumb(){clearTimeout(thumbTimer);if(!ready||loadFailed||thumbRevision===engine.revision)return;const revision=engine.revision,id=doc.id;try{await store.setThumb(id,await renderer.thumb(engine.drawing));thumbRevision=revision;}catch{}}
function changed(){
 renderer.request();$('hint').hidden=!engine.empty||engine.pointers.size>0||tutorial.active;$('pen-state').textContent=engine.down?(engine.tool==='erase'?'Erasing':'Making a mark'):engine.tool==='erase'?'Eraser raised':'Brush raised';$('pen-dot').classList.toggle('down',engine.down);$('width-number').textContent=String(Math.round(engine.drawing.cursor.w));$('width-locked').hidden=!engine.widthLocked;$('width-button').setAttribute('aria-label',`Brush width ${Math.round(engine.drawing.cursor.w)}${engine.widthLocked?', locked':''}. Set width`);if(widthSheet.open)showWidth();
 $<HTMLButtonElement>('undo').disabled=!engine.history.length;$<HTMLButtonElement>('redo').disabled=!engine.future.length;$<HTMLButtonElement>('clear').disabled=engine.empty;
 $('eraser').setAttribute('aria-pressed',String(engine.tool==='erase'));showPalette();
 if(layers.open)showLayers();status();scheduleThumb();tutorial.update();
}
engine.changed=changed;
const tutorial=createTutorial(engine,changed);$('tutorial-start').onclick=()=>tutorial.start();$('open-tutorial').onclick=()=>tutorial.start();
async function init(){try{doc=await store.open();engine.restore(doc.drawing);queue.savedRevision=engine.revision;}catch{loadFailed=true;storageMessage='Could not read local storage. Existing data has not been replaced. Save an editable backup before closing.';}ready=true;renderer.resize();changed();}
void init();
const observer=new ResizeObserver(()=>{engine.suspend();renderer.resize();changed();void persist();});observer.observe(canvas);

// ---- Painting input
canvas.addEventListener('pointerdown',e=>{if(!ready||sheetOpen()||e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();engine.downPointer(e.pointerId,e.clientX,e.clientY,e.pointerType,e.timeStamp);try{canvas.setPointerCapture(e.pointerId);}catch{engine.cancelPointer(e.pointerId);}changed();});
canvas.addEventListener('pointermove',e=>{if(!engine.pointers.has(e.pointerId))return;e.preventDefault();const samples=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];for(const p of samples.length?samples:[e])engine.movePointer(e.pointerId,p.clientX,p.clientY,engine.transform.scale);});
function up(e:PointerEvent){engine.upPointer(e.pointerId,e.timeStamp);changed();if(!engine.pointers.size)void persist();}
window.addEventListener('pointerup',up);
window.addEventListener('pointercancel',e=>{engine.cancelPointer(e.pointerId);changed();void persist();});
canvas.addEventListener('lostpointercapture',e=>{if(engine.steer===e.pointerId||engine.pressure===e.pointerId){engine.cancelPointer(e.pointerId);changed();void persist();}});
// Touching anything else ends a painting gesture. Only refresh when one was live: a refresh rebuilds open sheets, which would eat this tap.
document.addEventListener('pointerdown',e=>{if(e.target!==canvas&&engine.pointers.size){engine.suspend();changed();void persist();}},true);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();
 // Ctrl+wheel (also a trackpad pinch) zooms about the pointer.
 if(e.ctrlKey){if(!engine.pointers.size){engine.navigate(e.clientX,e.clientY,1,e.clientX,e.clientY,Math.exp(-e.deltaY*.01));engine.endNavigation();}return;}
 if(!engine.pointers.size||engine.pointers.get(engine.steer!)?.type==='mouse')engine.resize(-Math.sign(e.deltaY)*2);},{passive:false});
canvas.addEventListener('keydown',e=>{if(!ready||engine.pointers.size)return;const c=engine.drawing.cursor;const amount=(e.shiftKey?20:4)/engine.transform.scale;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)engine.redo();else engine.undo();void persist();}
 else if(e.code==='Space'){e.preventDefault();engine.begin();}else if(e.key==='+'||e.key==='='){e.preventDefault();engine.resize(2);}else if(e.key==='-'){e.preventDefault();engine.resize(-2);}else if(e.key.startsWith('Arrow')){e.preventDefault();const dx=e.key==='ArrowLeft'?-amount:e.key==='ArrowRight'?amount:0,dy=e.key==='ArrowUp'?-amount:e.key==='ArrowDown'?amount:0;c.x=Math.max(0,Math.min(engine.drawing.width,c.x+dx));c.y=Math.max(0,Math.min(engine.drawing.height,c.y+dy));engine.sample();}});
canvas.addEventListener('keyup',e=>{if(e.code==='Space'){engine.end();void persist();}});
canvas.addEventListener('blur',()=>{engine.suspend();changed();void persist();});
function checkpointNow(){engine.resetPointers();changed();void persist();void saveThumb();}
window.addEventListener('blur',checkpointNow);window.addEventListener('pagehide',checkpointNow);document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpointNow();});
// Saving copies the whole drawing on the main thread, so it never runs while a finger is down: a stall there turns the next finger movement into one straight jump. Lifting, backgrounding and pagehide all save.
checkpoint=window.setInterval(()=>{if(ready&&!engine.pointers.size&&queue.savedRevision!==engine.revision)void persist();},500);
void checkpoint;

// ---- Inks, eraser, mixer
// The chosen slot, not just the colour, is highlighted: two slots may hold the same ink.
let chosen=-1;
const palette=loadPalette(),mix=createMixer((x,y)=>renderer.sample(x,y)),swatches=[...document.querySelectorAll<HTMLButtonElement>('[data-color]')];
function showPalette(){swatches.forEach((b,i)=>{b.dataset.color=palette[i];b.style.setProperty('--ink',palette[i]);b.setAttribute('aria-label',`${palette[i]===DEFAULT_PALETTE[i]?DEFAULT_NAMES[i]:'Mixed'} ink. Press and hold to mix.`);b.setAttribute('aria-pressed',String(engine.tool==='brush'&&palette[i]===engine.drawing.color&&(chosen<0||palette[chosen]!==engine.drawing.color?palette.indexOf(engine.drawing.color)===i:chosen===i)));});}
function choose(i:number){chosen=i;engine.suspend();engine.tool='brush';engine.drawing.color=palette[i];engine.touch();void persist();}
async function remix(i:number){engine.suspend();changed();void persist();const hex=await mix(palette[i],DEFAULT_PALETTE[i]);if(!hex)return;palette[i]=hex;savePalette(palette);choose(i);}
// Tap picks a swatch; press-and-hold (or right-click / context-menu key) opens the mixer for it.
swatches.forEach((b,i)=>{let timer=0,held=false,x=0,y=0;
 b.onpointerdown=e=>{held=false;x=e.clientX;y=e.clientY;clearTimeout(timer);timer=window.setTimeout(()=>{held=true;void remix(i);},450);};
 b.onpointermove=e=>{if(Math.hypot(e.clientX-x,e.clientY-y)>10)clearTimeout(timer);};
 b.onpointerup=b.onpointercancel=b.onpointerleave=()=>clearTimeout(timer);
 b.oncontextmenu=e=>{e.preventDefault();clearTimeout(timer);if(!held&&!$<HTMLDialogElement>('mixer').open)void remix(i);};
 b.onclick=()=>{if(held){held=false;return;}choose(i);};
});
$('eraser').onclick=()=>{engine.suspend();engine.tool=engine.tool==='erase'?'brush':'erase';changed();};
$('undo').onclick=()=>{engine.undo();void persist();};
$('redo').onclick=()=>{engine.redo();void persist();};
$('clear').onclick=()=>{engine.clear();void persist();menu.close();};
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-close]'))b.onclick=()=>b.closest('dialog')!.close();
function sheet(d:HTMLDialogElement){engine.suspend();changed();void persist();for(const o of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))if(o!==d)o.close();d.showModal();}

// ---- Brush width: the pill opens an exact setter; the slider is logarithmic so fine widths get most of its travel.
const LOCK_KEY='noodlepaint-width-lock',widthRange=$<HTMLInputElement>('width-range'),toSlider=(w:number)=>Math.round(1000*Math.log(w/2)/Math.log(60)),fromSlider=(v:number)=>2*60**(v/1000);
try{engine.widthLocked=localStorage.getItem(LOCK_KEY)==='1';}catch{}
function showWidth(){const w=engine.drawing.cursor.w,px=Math.max(1,w*engine.transform.scale);widthRange.value=String(toSlider(w));$('width-value').textContent=String(Math.round(w));const dot=$('width-preview').querySelector('i')!;dot.style.width=dot.style.height=`${Math.min(px,128)}px`;dot.style.setProperty('--ink',engine.tool==='erase'?'#9da3b6':engine.drawing.color);const lock=$('width-lock');lock.setAttribute('aria-pressed',String(engine.widthLocked));lock.textContent=engine.widthLocked?'Width locked':'Lock width';}
function setWidth(w:number){engine.setWidth(Math.round(w));changed();}
$('width-button').onclick=()=>{sheet(widthSheet);showWidth();};
widthRange.oninput=()=>setWidth(fromSlider(+widthRange.value));widthRange.onchange=()=>void persist();
$('width-down').onclick=()=>{setWidth(engine.drawing.cursor.w-1);void persist();};
$('width-up').onclick=()=>{setWidth(engine.drawing.cursor.w+1);void persist();};
$('width-lock').onclick=()=>{engine.widthLocked=!engine.widthLocked;try{localStorage.setItem(LOCK_KEY,engine.widthLocked?'1':'0');}catch{}changed();};

// ---- Menu: export picture, backups
let photo:Promise<Blob>|null=null;
$('more').onclick=()=>{photo=renderer.png(engine.snapshot());photo.catch(()=>{});sheet(menu);};
const fileName=()=>doc.name.replace(/[^\w\- ]+/g,'').trim()||'NoodlePaint';
function download(blob:Blob,name:string){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
// The PNG is rendered when the menu opens so the share sheet can open inside the tap (iOS requires a fresh user gesture).
$('save-photo').onclick=async()=>{
 try{const blob=await (photo??renderer.png(engine.snapshot())),file=new File([blob],fileName()+'.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});menu.close();}catch(e){if((e as Error).name==='NotAllowedError')toast('Tap Save to Photos again');}}
  else{download(file,file.name);menu.close();}
 }catch{toast('Could not make the picture');}
};
$('backup-all').onclick=async()=>{await persist();try{const docs=loadFailed?[{...doc,drawing:engine.snapshot()}]:await store.docs();download(new Blob([JSON.stringify(await bundle(docs,k=>store.getBlob(k)))],{type:'application/json'}),`NoodlePaint backup ${new Date().toISOString().slice(0,10)}.json`);}catch{toast('Backup failed');}};
$('export').onclick=async()=>{await persist();try{download(new Blob([JSON.stringify(await bundle([{...doc,drawing:engine.snapshot()}],k=>store.getBlob(k)))],{type:'application/json'}),fileName()+'.noodlepaint.json');}catch{toast('Backup failed');}};
// The storage permission is requested only after a deliberate backup/save action.
for(const id of ['export','backup-all','save-photo'])$(id).addEventListener('click',()=>{if(navigator.storage?.persist)void navigator.storage.persist().catch(()=>false);});
const backupFile=$<HTMLInputElement>('backup-file');
$('restore-backup').onclick=()=>backupFile.click();
// Restoring adds the backup's drawings to the library and opens the first; nothing existing is replaced.
backupFile.onchange=async()=>{const f=backupFile.files?.[0];backupFile.value='';if(!f)return;
 try{if(loadFailed)throw Error('Storage unavailable');if(f.size>200000000)throw Error('Too large');const items=await unbundle(await f.text());for(const {doc:d,blobs} of items){for(const [k,b] of blobs)await store.putBlob(k,b);await store.write(d);}menu.close();await openDoc(items[0].doc);toast(items.length>1?`Restored ${items.length} drawings`:'Backup restored');}
 catch{alert('This backup could not be opened. Your drawings are unchanged.');}};
$('open-help').onclick=()=>sheet(panel);

// ---- Library
async function openDoc(next:Doc){
 engine.suspend();await persist();if(queue.error){toast('Could not save this drawing; staying here');return false;}
 await saveThumb();doc=next;engine.restore(next.drawing);thumbRevision=-1;queue.savedRevision=engine.revision;renderer.resize();await store.setCurrent(doc.id);changed();return true;
}
async function newDrawing(){if(loadFailed)return toast('Storage unavailable');const n=(await store.cards()).length+1,d=newDoc(`Drawing ${n}`);d.drawing.color=engine.drawing.color;d.drawing.cursor.w=engine.drawing.cursor.w;await store.write(d);for(const o of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))o.close();if(await openDoc(d))toast('New drawing');}
$('new-drawing').onclick=$('library-new').onclick=()=>void newDrawing();
let thumbUrls:string[]=[];
library.addEventListener('close',()=>{thumbUrls.forEach(u=>URL.revokeObjectURL(u));thumbUrls=[];});
async function showLibrary(){
 await persist();await saveThumb();const cards=await store.cards(),list=$('cards');list.replaceChildren();
 for(const c of cards){
  const item=document.createElement('div');item.className='card'+(c.id===doc.id?' current':'');
  const open=document.createElement('button');open.className='card-open';open.setAttribute('aria-label',`Open ${c.name}`);
  const img=document.createElement('img');img.alt='';if(c.thumb){const u=URL.createObjectURL(c.thumb);thumbUrls.push(u);img.src=u;}
  const name=document.createElement('span');name.className='card-name';name.textContent=c.name;
  const when=document.createElement('span');when.className='card-date';when.textContent=new Date(c.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  open.append(img,name,when);open.onclick=async()=>{if(c.id===doc.id){library.close();return;}const d=await store.getDoc(c.id).catch(()=>null);if(!d)return toast('That drawing could not be read');library.close();await openDoc(d);};
  const rename=document.createElement('button');rename.className='card-action';rename.textContent='Rename';rename.onclick=async()=>{const v=prompt('Name this drawing',c.name)?.trim().slice(0,80);if(!v)return;if(c.id===doc.id){doc={...doc,name:v};engine.touch();await persist();}else{const d=await store.getDoc(c.id);if(d)await store.write({...d,name:v});}void showLibrary();};
  const del=document.createElement('button');del.className='card-action';del.textContent='Delete';del.onclick=async()=>{if(!confirm(`Delete “${c.name}”? This cannot be undone.`))return;
   // Deleting the open drawing: flush its saves and switch away first, so no in-flight write can resurrect it.
   if(c.id===doc.id){await persist();const other=(await store.cards()).find(x=>x.id!==c.id),next=other&&await store.getDoc(other.id),target=next??newDoc('Drawing 1');if(!next)await store.write(target);doc=target;engine.restore(target.drawing);queue.savedRevision=engine.revision;thumbRevision=-1;renderer.resize();await store.setCurrent(doc.id);changed();}
   await store.remove(c.id);void showLibrary();};
  item.append(open,rename,del);list.append(item);
 }
}
$('open-library').onclick=()=>{if(loadFailed)return toast('Storage unavailable');sheet(library);void showLibrary();};

// ---- Layers
const BLEND_NAMES:Record<Blend,string>={'source-over':'Normal',multiply:'Multiply',screen:'Screen',overlay:'Overlay',darken:'Darken',lighten:'Lighten','color-dodge':'Colour dodge','color-burn':'Colour burn','hard-light':'Hard light','soft-light':'Soft light',difference:'Difference',exclusion:'Exclusion',hue:'Hue',saturation:'Saturation',color:'Colour',luminosity:'Luminosity'};
const blend=$<HTMLSelectElement>('layer-blend'),opacity=$<HTMLInputElement>('layer-opacity');
for(const b of BLENDS)blend.add(new Option(BLEND_NAMES[b],b));
const icon=(path:string)=>`<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const EYE=icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),EYE_OFF=icon('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a10 10 0 0 0 5.4-1.6"/>'),LOCK=icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),UNLOCK=icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>');
// Rebuild only when the layer stack really changed: rebuilding between a tap's pointerdown and click (focus or blur refreshes) would swallow the tap.
let layersShown='';
function showLayers(){
 const d=engine.drawing,list=$('layer-list'),key=JSON.stringify([d.active,d.layers.map(l=>[l.id,l.name,l.visible,l.locked,l.opacity,l.blend,!!l.image,l.strokes.length>0])]);if(key===layersShown&&list.childElementCount)return;layersShown=key;list.replaceChildren();
 for(let i=d.layers.length-1;i>=0;i--){const l=d.layers[i],row=document.createElement('li');row.className='layer'+(i===d.active?' active':'');
  const eye=document.createElement('button');eye.className='layer-toggle';eye.innerHTML=l.visible?EYE:EYE_OFF;eye.setAttribute('aria-label',`${l.visible?'Hide':'Show'} ${l.name}`);eye.setAttribute('aria-pressed',String(!l.visible));eye.onclick=()=>{engine.setLayer(i,{visible:!l.visible});void persist();};
  const pick=document.createElement('button');pick.className='layer-name';pick.setAttribute('aria-current',String(i===d.active));pick.innerHTML=`<span></span><small></small>`;pick.querySelector('span')!.textContent=l.name;pick.querySelector('small')!.textContent=[l.image?'Photo':'',l.blend!=='source-over'?BLEND_NAMES[l.blend]:'',l.opacity<1?Math.round(l.opacity*100)+'%':''].filter(Boolean).join(' · ');pick.onclick=()=>{engine.selectLayer(i);void persist();};
  const lock=document.createElement('button');lock.className='layer-toggle';lock.innerHTML=l.locked?LOCK:UNLOCK;lock.setAttribute('aria-label',`${l.locked?'Unlock':'Lock'} ${l.name}`);lock.setAttribute('aria-pressed',String(l.locked));lock.onclick=()=>{engine.setLayer(i,{locked:!l.locked});void persist();};
  row.append(eye,pick,lock);list.append(row);}
 const l=engine.layer;opacity.value=String(Math.round(l.opacity*100));$('opacity-value').textContent=opacity.value+'%';blend.value=l.blend;
 $<HTMLButtonElement>('layer-up').disabled=d.active>=d.layers.length-1;$<HTMLButtonElement>('layer-down').disabled=d.active<=0;$<HTMLButtonElement>('layer-clear').disabled=!l.strokes.length&&!l.image;$<HTMLButtonElement>('layer-add').disabled=$<HTMLButtonElement>('photo-add').disabled=d.layers.length>=MAX_LAYERS;
}
$('layers-button').onclick=()=>{showLayers();sheet(layers);};
// One slider drag is one undo step: the first input records it, the rest update live until `change`.
let adjusting=false;
opacity.oninput=()=>{engine.setLayer(engine.drawing.active,{opacity:+opacity.value/100},!adjusting);adjusting=true;};
opacity.onchange=()=>{adjusting=false;void persist();};
blend.onchange=()=>{engine.setLayer(engine.drawing.active,{blend:blend.value as Blend});void persist();};
$('layer-up').onclick=()=>{engine.moveLayer(engine.drawing.active,1);void persist();};
$('layer-down').onclick=()=>{engine.moveLayer(engine.drawing.active,-1);void persist();};
$('layer-rename').onclick=()=>{const v=prompt('Name this layer',engine.layer.name)?.trim().slice(0,80);if(v){engine.setLayer(engine.drawing.active,{name:v});void persist();}};
$('layer-clear').onclick=()=>{engine.clearLayer();void persist();};
$('layer-delete').onclick=()=>{engine.removeLayer();void persist();};
$('layer-add').onclick=()=>{engine.addLayer();void persist();};
// Photos are scaled to at most twice the paper resolution, stored once as a blob, and fitted inside the paper on a new layer.
const photoFile=$<HTMLInputElement>('photo-file');
$('photo-add').onclick=()=>{if(loadFailed)return toast('Storage unavailable');photoFile.click();};
photoFile.onchange=async()=>{const f=photoFile.files?.[0];photoFile.value='';if(!f)return;
 try{const bmp=await createImageBitmap(f),d=engine.drawing,k=Math.min(2*d.width/bmp.width,2*d.height/bmp.height,1),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);
  const type=/png|gif|webp/.test(f.type)?'image/png':'image/jpeg',blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Encode failed')),type,.9));
  const fit=Math.min(d.width/bmp.width,d.height/bmp.height),w=bmp.width*fit,h=bmp.height*fit,key=`${doc.id}/${newId()}`;
  await store.putBlob(key,blob);renderer.images.set(key,bmp);if(engine.addLayer('Photo',{key,x:(d.width-w)/2,y:(d.height-h)/2,w,h}))void persist();
 }catch{toast('That photo could not be opened');}};

// ---- Help, updates
$('version').textContent=__APP_VERSION__;$('close').onclick=()=>panel.close();$('retry').onclick=()=>void persist();
let registration:ServiceWorkerRegistration|undefined;
async function checkOffline(){
 const detail=$('offline-detail');if(!('serviceWorker' in navigator)){detail.textContent='Offline support is not available in this browser.';return;}
 try{registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
 const inspect=()=>{// A first install passes through 'waiting' too; it only counts as an update when an older worker controls the page.
 updateReady=!!(registration?.waiting&&navigator.serviceWorker.controller);$('update').hidden=!updateReady;status();const worker=navigator.serviceWorker.controller;if(!worker){detail.textContent='Preparing offline copy. Keep this app open online.';return;}const channel=new MessageChannel();const timer=setTimeout(()=>{detail.textContent='Offline copy has not been verified. Keep this app online.';},5000);channel.port1.onmessage=e=>{clearTimeout(timer);detail.textContent=e.data?.ready?'Offline ready in this app. Saved drawings remain on this device.':'Offline copy incomplete. Reopen online to retry.';channel.port1.close();};worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);};
 navigator.serviceWorker.addEventListener('controllerchange',inspect);registration.addEventListener('updatefound',()=>{const w=registration?.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'||w.state==='activated')inspect();});});inspect();
 }catch{detail.textContent='Offline setup failed. Hosting or this browser may restrict service workers. You can still paint online.';}
}
void checkOffline();
// Installed apps rarely reload, so look for a new version whenever the app comes back to the foreground.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void registration?.update().catch(()=>{});});
$('update').onclick=async()=>{engine.suspend();await persist();if(loadFailed||queue.error||queue.savedRevision!==engine.revision){$('offline-detail').textContent='Save your drawing before updating. Export a backup if local saving is unavailable.';return;}if(!registration?.waiting)return;navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});registration.waiting.postMessage({type:'ACTIVATE'});};
// Test-only read access; never enabled in the production bundle.
if(import.meta.env.DEV)Object.assign(window,{__noodlepaint:{engine,renderer,queue,store,get doc(){return doc;}}});
