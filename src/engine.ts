export type Sample = { x: number; y: number; w: number };
export type Stroke = { color: string; samples: Sample[]; erase?: boolean };
export const BLENDS = ['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'] as const;
export type Blend = typeof BLENDS[number];
// Photo pixels live in the IndexedDB blob store under `key`; x/y/w/h place them in world units.
export type LayerImage = { key: string; x: number; y: number; w: number; h: number };
export type Layer = { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blend: Blend; strokes: Stroke[]; image?: LayerImage };
export type Drawing = { version: 2; width: number; height: number; layers: Layer[]; active: number; cursor: Sample; color: string };
export type Tool = 'brush' | 'erase';
type Snapshot = { layers: Layer[]; active: number };
export type View = { zoom: number; x: number; y: number };
// Second-finger sizing: travel (client px) ignored before width starts changing, then width units per world unit of travel.
export const WIDTH_DEADZONE = 24, WIDTH_RATE = 0.15;
// Multi-finger taps: all fingers down within TAP_SPREAD ms, all up within TAP_TIME ms of the first, none moving beyond TAP_SLOP client px.
export const TAP_SPREAD = 150, TAP_TIME = 350, TAP_SLOP = 12;
// Pan and zoom: two fingers landing together (within TAP_SPREAD) navigate instead of painting; zoom is relative to the fitted paper.
export const MAX_ZOOM = 10, VIEW_MARGIN = 24;
export const MAX_LAYERS = 20, HISTORY = 200, RESTORE_UNDO = 100;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const blankLayer = (name: string): Layer => ({id: newId(), name, visible: true, locked: false, opacity: 1, blend: 'source-over', strokes: []});
export const blankDrawing = (): Drawing => ({version: 2, width: 900, height: 1600, layers: [blankLayer('Layer 1')], active: 0, cursor: {x: 450, y: 790, w: 18}, color: '#293355'});
// Snapshots copy layer records and stroke lists but share stroke objects, which never change once ended.
const copyLayers = (layers: Layer[]) => layers.map(l => ({...l, strokes: l.strokes.slice()}));
export class Engine {
  drawing: Drawing = blankDrawing();
  tool: Tool = 'brush';
  active: Stroke | null = null;
  steer: number | null = null;
  pressure: number | null = null;
  travel = 0;
  sizing = false;
  pointers = new Map<number, {x: number; y: number; type: string; ox: number; oy: number}>();
  blocked = false;
  history: Snapshot[] = [];
  future: Snapshot[] = [];
  tap: {start: number; count: number; valid: boolean; mark: number; future: Snapshot[]} | null = null;
  // view pans in CSS px of the canvas (left/top are its client offset); navigating holds while any navigating finger is down.
  view: View = {zoom: 1, x: 0, y: 0};
  viewport = {left: 0, top: 0, w: 0, h: 0};
  navigating = false;
  revision = 0;
  changed = () => {};
  notify = (_message: string) => {};
  get down() { return this.active !== null; }
  get layer() { return this.drawing.layers[this.drawing.active]; }
  get empty() { return this.drawing.layers.every(l => !l.strokes.length && !l.image); }
  // World to canvas CSS px: the paper fitted to the viewport, then zoomed about the canvas origin and panned.
  get transform() {const d=this.drawing,{w,h}=this.viewport,f=Math.min(w/d.width,h/d.height)||1,z=this.view.zoom;return {scale:f*z,ox:(w-d.width*f)/2*z+this.view.x,oy:(h-d.height*f)/2*z+this.view.y};}
  setViewport(left:number,top:number,w:number,h:number) {this.viewport={left,top,w,h};this.setView(this.view);}
  // The zoomed viewport always covers the screen, so the paper can never be lost off an edge; zoom 1 is the fitted view.
  setView(v:View) {const z=clamp(v.zoom,1,MAX_ZOOM),{w,h}=this.viewport;this.view={zoom:z,x:clamp(v.x,w*(1-z),0),y:clamp(v.y,h*(1-z),0)};}
  // Pinch about the fingers' midpoint: the point under the old midpoint ends up under the new one.
  navigate(ax:number,ay:number,ad:number,bx:number,by:number,bd:number) {const v=this.view,z=ad>0&&bd>0?v.zoom*bd/ad:v.zoom,k=clamp(z,1,MAX_ZOOM)/v.zoom,ox=ax-this.viewport.left,oy=ay-this.viewport.top;this.setView({zoom:v.zoom*k,x:bx-this.viewport.left-(ox-v.x)*k,y:by-this.viewport.top-(oy-v.y)*k});this.touch();}
  // After navigating, a cursor left off screen is pulled just inside the visible part of the paper.
  endNavigation() {
    this.navigating=false;const {scale,ox,oy}=this.transform,{w,h}=this.viewport,c=this.drawing.cursor,m=VIEW_MARGIN;
    const fit=(v:number,lo:number,hi:number,max:number)=>clamp(v,clamp(lo,0,max),clamp(hi,0,max));
    c.x=fit(c.x,(m-ox)/scale,(w-m-ox)/scale,this.drawing.width);c.y=fit(c.y,(m-oy)/scale,(h-m-oy)/scale,this.drawing.height);this.touch();
  }
  touch() { this.revision++; this.changed(); }
  sample() { if (this.active) this.active.samples.push({...this.drawing.cursor}); this.touch(); }
  capture(): Snapshot { return {layers: copyLayers(this.drawing.layers), active: this.drawing.active}; }
  apply(s: Snapshot) { this.drawing.layers = copyLayers(s.layers); this.drawing.active = clamp(s.active, 0, s.layers.length - 1); }
  checkpoint() { this.history.push(this.capture()); if (this.history.length > HISTORY) { this.history.shift(); if (this.tap) this.tap.mark--; } this.future = []; }
  // Every undoable document change goes through edit(): it ends any gesture, records the prior state and clears redo.
  edit(fn: () => void) { this.suspend(); this.checkpoint(); fn(); this.touch(); }
  begin() {
    if (this.active) return;
    const l = this.layer;
    if (!l.visible || l.locked) { this.notify(l.locked ? 'Layer is locked' : 'Layer is hidden'); return; }
    this.checkpoint();
    this.active = {color: this.drawing.color, samples: [{...this.drawing.cursor}], ...(this.tool === 'erase' ? {erase: true} : {})};
    l.strokes.push(this.active); this.touch();
  }
  end() { if (this.active) { this.active = null; this.touch(); } }
  downPointer(id:number, x:number, y:number, type='touch', time?:number) {
    if (this.pointers.has(id)) return;
    if (type === 'touch' && time !== undefined) {
      if (!this.pointers.size) this.tap = {start: time, count: 0, valid: true, mark: this.history.length, future: this.future};
      if (this.tap) { this.tap.count++; if (time - this.tap.start > TAP_SPREAD) this.tap.valid = false; }
    }
    const together=type==='touch'&&!!this.tap&&this.tap.valid&&this.tap.count===2&&this.pressure===null&&this.steer!==null&&this.pointers.get(this.steer)?.type==='touch';
    this.pointers.set(id,{x,y,type,ox:x,oy:y});
    if(this.navigating||this.blocked) return;
    if(together){this.steer=null;this.navigating=true;return;}
    if(this.steer === null) {this.steer=id; if(type==='mouse'||type==='pen') this.begin();}
    else if(this.pressure === null && this.pointers.get(this.steer)?.type==='touch' && type==='touch') {this.pressure=id;this.travel=0;this.sizing=false;this.begin();}
  }
  movePointer(id:number,x:number,y:number,scale=1) {
    const p=this.pointers.get(id); if(!p) return;
    if(this.navigating){const [a,b]=[...this.pointers.values()].filter(q=>q.type==='touch'),before=b?[(a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(a.x-b.x,a.y-b.y)]:[a.x,a.y,0];p.x=x;p.y=y;
      if(this.tap&&Math.hypot(x-p.ox,y-p.oy)>TAP_SLOP) this.tap.valid=false;if(p!==a&&p!==b)return;
      const after=b?[(a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(a.x-b.x,a.y-b.y)]:[a.x,a.y,0];this.navigate(before[0],before[1],before[2],after[0],after[1],after[2]);return;}
    const dx=x-p.x, dy=y-p.y; p.x=x;p.y=y;
    if(this.tap&&Math.hypot(x-p.ox,y-p.oy)>TAP_SLOP) this.tap.valid=false;
    if(this.blocked) return;
    if(id===this.steer) {const c=this.drawing.cursor;c.x=clamp(c.x+dx/scale,0,this.drawing.width);c.y=clamp(c.y+dy/scale,0,this.drawing.height); if(dx||dy) this.sample();}
    if(id===this.pressure && dy) this.size(dy,scale);
  }
  // Small drift of a resting finger never sizes; once past the dead zone, only the excess counts and sizing stays live until lift.
  size(dy:number,scale:number) {if(!this.sizing){this.travel+=dy;if(Math.abs(this.travel)<=WIDTH_DEADZONE)return;dy=this.travel-Math.sign(this.travel)*WIDTH_DEADZONE;this.sizing=true;}this.resize(-dy*WIDTH_RATE/scale);}
  resize(delta:number) {this.drawing.cursor.w=clamp(this.drawing.cursor.w+delta,2,120);this.sample();}
  upPointer(id:number, time?:number) {
    if (!this.pointers.delete(id)) return;
    if(id===this.pressure) {this.end();this.pressure=null;}
    // Lifting the steering finger while the painting finger stays down is a clutch, like lifting a mouse: the stroke waits for a new steering finger.
    if(id===this.steer) {this.steer=null;if(this.pressure===null||!this.pointers.has(this.pressure)){this.end();this.pressure=null;this.blocked=this.pointers.size>0;}}
    if(!this.pointers.size) {if(this.navigating)this.endNavigation();this.blocked=false;this.finishTap(time);}
  }
  // A 2-finger tap undoes and a 3-finger tap redoes. The dot the tap itself painted is retracted first, leaving no trace in either stack.
  finishTap(time?:number) {
    const t=this.tap;this.tap=null;
    if(!t||!t.valid||time===undefined||time-t.start>TAP_TIME||t.count<2||t.count>3) return;
    if(this.history.length>t.mark){this.apply(this.history[t.mark]);this.history.length=t.mark;}
    this.future=t.future;
    if(t.count===2?this.undo():this.redo()) this.notify(t.count===2?'Undo':'Redo'); else this.touch();
  }
  cancelPointer(id:number) {if(this.tap)this.tap.valid=false;if(id===this.steer||id===this.pressure) this.suspend();this.upPointer(id);}
  suspend() {this.end();this.steer=null;this.pressure=null;if(this.navigating)this.endNavigation();this.blocked=this.pointers.size>0;}
  resetPointers() {this.suspend();this.pointers.clear();this.blocked=false;this.tap=null;}
  undo() {this.suspend();const prev=this.history.pop();if(!prev)return false;this.future.push(this.capture());this.apply(prev);this.touch();return true;}
  redo() {this.suspend();const next=this.future.pop();if(!next)return false;this.history.push(this.capture());this.apply(next);this.touch();return true;}
  // Clear canvas keeps the layer stack and its settings but empties every layer.
  clear() {if(!this.empty)this.edit(()=>{for(const l of this.drawing.layers){l.strokes=[];delete l.image;}});}
  clearLayer(i=this.drawing.active) {const l=this.drawing.layers[i];if(l&&(l.strokes.length||l.image))this.edit(()=>{l.strokes=[];delete l.image;});}
  addLayer(name?:string,image?:LayerImage) {
    if(this.drawing.layers.length>=MAX_LAYERS){this.notify(`Up to ${MAX_LAYERS} layers`);return false;}
    this.edit(()=>{const d=this.drawing,l=blankLayer(name??`Layer ${d.layers.length+1}`);if(image)l.image=image;d.layers.splice(d.active+1,0,l);d.active++;});return true;
  }
  removeLayer(i=this.drawing.active) {
    if(this.drawing.layers.length<2){this.clearLayer(i);return;}
    // Deleting the active layer selects the one below it.
    this.edit(()=>{const d=this.drawing;d.layers.splice(i,1);if(d.active===i)d.active=Math.max(0,i-1);else if(d.active>i)d.active--;});
  }
  moveLayer(i:number,by:number) {
    const d=this.drawing,j=i+by;if(j<0||j>=d.layers.length)return;
    this.edit(()=>{const [l]=d.layers.splice(i,1);d.layers.splice(j,0,l);if(d.active===i)d.active=j;else if(d.active===j)d.active=i;});
  }
  // Pass undoable=false for the live updates of one continuous adjustment whose first step was undoable.
  setLayer(i:number,patch:Partial<Pick<Layer,'name'|'visible'|'locked'|'opacity'|'blend'>>,undoable=true) {
    const l=this.drawing.layers[i];if(!l)return;
    if(undoable)this.edit(()=>Object.assign(l,patch));else{Object.assign(l,patch);this.touch();}
  }
  selectLayer(i:number) {if(i!==this.drawing.active&&this.drawing.layers[i]){this.suspend();this.drawing.active=i;this.touch();}}
  restore(d:Drawing) {
    this.resetPointers();this.drawing=d;this.future=[];this.history=[];this.setView({zoom:1,x:0,y:0});
    // Recent restored strokes stay individually undoable (bounded, since each step holds a copy of every stroke list).
    const order=d.layers.flatMap((l,li)=>l.strokes.map((_,si)=>[li,si] as const));
    for(let k=Math.max(0,order.length-RESTORE_UNDO);k<order.length;k++){const [li,si]=order[k];this.history.push({layers:d.layers.map((l,i)=>({...l,strokes:i<li?l.strokes.slice():i===li?l.strokes.slice(0,si):[]})),active:d.active});}
    this.revision=0;
  }
  snapshot():Drawing {return structuredClone(this.drawing);}
}
// Version 1 drawings were a single stroke list; they become one layer.
export function migrate(value:unknown):unknown {
  const v=value as {version?:number;strokes?:unknown;width:number;height:number;cursor:Sample;color:string};
  if(v&&v.version===1&&Array.isArray(v.strokes)) return {version:2,width:v.width,height:v.height,layers:[{...blankLayer('Layer 1'),strokes:v.strokes}],active:0,cursor:v.cursor,color:v.color};
  return value;
}
export function validate(value:unknown):Drawing {
 const d=migrate(value) as Drawing;const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
 if(!d||d.version!==2||!finite(d.width)||!finite(d.height)||d.width<100||d.height<100||d.width>10000||d.height>10000||!Array.isArray(d.layers)||!d.layers.length||d.layers.length>MAX_LAYERS||!Number.isInteger(d.active)||d.active<0||d.active>=d.layers.length) throw Error('Invalid drawing');
 const color=(s:unknown)=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
 const sample=(s:Sample)=>s&&finite(s.x)&&finite(s.y)&&finite(s.w)&&s.x>=0&&s.x<=d.width&&s.y>=0&&s.y<=d.height&&s.w>=2&&s.w<=120;
 if(!sample(d.cursor)||!color(d.color)) throw Error('Invalid brush');
 let strokes=0,total=0;
 for(const l of d.layers){
  if(!l||typeof l.id!=='string'||typeof l.name!=='string'||l.name.length>80||typeof l.visible!=='boolean'||typeof l.locked!=='boolean'||!finite(l.opacity)||l.opacity<0||l.opacity>1||!BLENDS.includes(l.blend)||!Array.isArray(l.strokes)||(strokes+=l.strokes.length)>20000) throw Error('Invalid layer');
  if(l.image!==undefined){const i=l.image;if(!i||typeof i.key!=='string'||![i.x,i.y,i.w,i.h].every(finite)||i.w<=0||i.h<=0)throw Error('Invalid image');}
  for(const s of l.strokes){if(!s||!color(s.color)||(s.erase!==undefined&&typeof s.erase!=='boolean')||!Array.isArray(s.samples)||!s.samples.length||(total+=s.samples.length)>2000000||!s.samples.every(sample))throw Error('Invalid stroke');}
 }
 return d;
}
