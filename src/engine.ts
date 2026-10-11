export type Sample = { x: number; y: number; w: number };
export type Stroke = { color: string; samples: Sample[] };
export type Drawing = { version: 1; width: number; height: number; strokes: Stroke[]; cursor: Sample; color: string };
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export class Engine {
  drawing: Drawing = { version: 1, width: 900, height: 1600, strokes: [], cursor: { x: 450, y: 790, w: 18 }, color: '#293355' };
  active: Stroke | null = null;
  steer: number | null = null;
  pressure: number | null = null;
  pointers = new Map<number, {x: number; y: number; type: string}>();
  blocked = false;
  history: Stroke[][] = [];
  revision = 0;
  changed = () => {};
  get down() { return this.active !== null; }
  touch() { this.revision++; this.changed(); }
  sample() { if (this.active) this.active.samples.push({...this.drawing.cursor}); this.touch(); }
  begin() { if (this.active) return; this.history.push(this.drawing.strokes.slice()); this.active = {color: this.drawing.color, samples: [{...this.drawing.cursor}]}; this.drawing.strokes.push(this.active); this.touch(); }
  end() { if (this.active) { this.active = null; this.touch(); } }
  downPointer(id:number, x:number, y:number, type='touch') {
    if (this.pointers.has(id)) return;
    this.pointers.set(id,{x,y,type});
    if(this.blocked) return;
    if(this.steer === null) {this.steer=id; if(type==='mouse'||type==='pen') this.begin();}
    else if(this.pressure === null && this.pointers.get(this.steer)?.type==='touch' && type==='touch') {this.pressure=id;this.begin();}
  }
  movePointer(id:number,x:number,y:number,scale=1) {
    const p=this.pointers.get(id); if(!p) return;
    const dx=x-p.x, dy=y-p.y; p.x=x;p.y=y;
    if(this.blocked) return;
    if(id===this.steer) {const c=this.drawing.cursor;c.x=clamp(c.x+dx/scale,0,this.drawing.width);c.y=clamp(c.y+dy/scale,0,this.drawing.height); if(dx||dy) this.sample();}
    if(id===this.pressure && dy) this.resize(-dy*0.35/scale);
  }
  resize(delta:number) {this.drawing.cursor.w=clamp(this.drawing.cursor.w+delta,2,120);this.sample();}
  upPointer(id:number) {
    this.pointers.delete(id);
    if(id===this.pressure) {this.end();this.pressure=null;}
    if(id===this.steer) {this.end();this.steer=null;this.pressure=null;this.blocked=this.pointers.size>0;}
    if(!this.pointers.size) this.blocked=false;
  }
  cancelPointer(id:number) {if(id===this.steer||id===this.pressure) this.suspend();this.upPointer(id);}
  suspend() {this.end();this.steer=null;this.pressure=null;this.blocked=this.pointers.size>0;}
  resetPointers() {this.suspend();this.pointers.clear();this.blocked=false;}
  undo() {this.suspend();const prev=this.history.pop();if(prev){this.drawing.strokes=prev;this.touch();}}
  clear() {this.suspend();if(this.drawing.strokes.length){this.history.push(this.drawing.strokes.slice());this.drawing.strokes=[];this.touch();}}
  restore(d:Drawing) {this.resetPointers();this.drawing=d;this.history=d.strokes.map((_,i)=>d.strokes.slice(0,i));this.revision=0;}
  snapshot():Drawing {return structuredClone(this.drawing);}
}
export function validate(value:unknown):Drawing {
 const d=value as Drawing;const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
 if(!d||d.version!==1||!finite(d.width)||!finite(d.height)||d.width<100||d.height<100||d.width>10000||d.height>10000||!Array.isArray(d.strokes)||d.strokes.length>20000) throw Error('Invalid drawing');
 const color=(s:unknown)=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
 const sample=(s:Sample)=>s&&finite(s.x)&&finite(s.y)&&finite(s.w)&&s.x>=0&&s.x<=d.width&&s.y>=0&&s.y<=d.height&&s.w>=2&&s.w<=120;
 if(!sample(d.cursor)||!color(d.color)) throw Error('Invalid brush');
 let total=0;for(const s of d.strokes){if(!s||!color(s.color)||!Array.isArray(s.samples)||!s.samples.length||(total+=s.samples.length)>2000000||!s.samples.every(sample))throw Error('Invalid stroke');}
 return d;
}
