import type {Sample,Stroke,Layer,Drawing,Engine} from './engine';
export const PAPER='#fcfbff',ROOM='#edeaf5';
function dot(ctx:CanvasRenderingContext2D,s:Sample){ctx.beginPath();ctx.arc(s.x,s.y,s.w/2,0,Math.PI*2);ctx.fill();}
export function segment(ctx:CanvasRenderingContext2D,a:Sample,b:Sample){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len){const q=(a.w-b.w)/(2*len);if(Math.abs(q)<1){const h=Math.sqrt(1-q*q),ux=dx/len,uy=dy/len,nx=ux*q-uy*h,ny=uy*q+ux*h,mx=ux*q+uy*h,my=uy*q-ux*h;ctx.beginPath();ctx.moveTo(a.x+nx*a.w/2,a.y+ny*a.w/2);ctx.lineTo(b.x+nx*b.w/2,b.y+ny*b.w/2);ctx.lineTo(b.x+mx*b.w/2,b.y+my*b.w/2);ctx.lineTo(a.x+mx*a.w/2,a.y+my*a.w/2);ctx.closePath();ctx.fill();}}dot(ctx,b);
}
// Draws samples [from, end) of a stroke; erase strokes cut through everything already on the layer.
function strokePart(ctx:CanvasRenderingContext2D,s:Stroke,from:number){ctx.globalCompositeOperation=s.erase?'destination-out':'source-over';ctx.fillStyle=s.erase?'#000':s.color;if(!from){dot(ctx,s.samples[0]);from=1;}for(let i=from;i<s.samples.length;i++)segment(ctx,s.samples[i-1],s.samples[i]);ctx.globalCompositeOperation='source-over';}
export type Images=Map<string,ImageBitmap|HTMLImageElement|'loading'|'missing'>;
// Paints one layer's own pixels (photo, then strokes) into ctx, already transformed to world units.
function paintLayer(ctx:CanvasRenderingContext2D,l:Layer,images:Images){const i=l.image&&images.get(l.image.key);if(l.image&&i&&typeof i!=='string')ctx.drawImage(i,l.image.x,l.image.y,l.image.w,l.image.h);for(const s of l.strokes)strokePart(ctx,s,0);}
// Composites paper plus visible layers (opacity, blend) for a drawing at pixel scale k; used for export and thumbnails.
export function compose(d:Drawing,k:number,images:Images){
 const out=document.createElement('canvas');out.width=Math.round(d.width*k);out.height=Math.round(d.height*k);const ctx=out.getContext('2d')!;ctx.fillStyle=PAPER;ctx.fillRect(0,0,out.width,out.height);
 const layer=document.createElement('canvas');layer.width=out.width;layer.height=out.height;const lc=layer.getContext('2d')!;
 for(const l of d.layers){if(!l.visible)continue;lc.setTransform(1,0,0,1,0,0);lc.clearRect(0,0,layer.width,layer.height);lc.setTransform(k,0,0,k,0,0);paintLayer(lc,l,images);ctx.globalAlpha=l.opacity;ctx.globalCompositeOperation=l.blend;ctx.drawImage(layer,0,0);}
 ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';return out;
}
type Cache={canvas:HTMLCanvasElement;strokes:Stroke[]|null;count:number;samples:number;image:string|undefined;imageReady:boolean};
export class Renderer {
 scale=1;ox=0;oy=0;w=0;h=0;dpr=1;frame=0;px=1;view='';
 // Layer caches and the composite cover the screen (not the paper), so zoomed views stay sharp at any zoom.
 layers=new Map<string,Cache>();comp=document.createElement('canvas');images:Images=new Map();
 // While navigating, the last sharp composite and a whole-paper preview are stretched instead of repainting every stroke per frame.
 frozen:{canvas:HTMLCanvasElement;base:HTMLCanvasElement;scale:number;ox:number;oy:number}|null=null;
 // Supplied by main: fetches a photo blob from storage.
 loadBlob:(key:string)=>Promise<Blob|undefined>=async()=>undefined;
 constructor(public canvas:HTMLCanvasElement,public engine:Engine){}
 resize(){const r=this.canvas.getBoundingClientRect(),d=this.engine.drawing;this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,3);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.engine.setViewport(r.left,r.top,this.w,this.h);this.comp.width=Math.max(1,this.canvas.width);this.comp.height=Math.max(1,this.canvas.height);this.layers.clear();this.frozen=null;this.place();this.request();}
 place(){const t=this.engine.transform;this.scale=t.scale;this.ox=t.ox;this.oy=t.oy;this.px=this.scale*this.dpr;}
 request(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
 // Decodes photo layers on demand; a finished decode repaints.
 image(key:string){const i=this.images.get(key);if(i)return typeof i==='string'?null:i;this.images.set(key,'loading');void this.loadBlob(key).then(b=>b?createImageBitmap(b):null).then(bmp=>{this.images.set(key,bmp??'missing');this.request();},()=>{this.images.set(key,'missing');this.request();});return null;}
 async ready(d:Drawing){for(const l of d.layers)if(l.image)this.image(l.image.key);while(d.layers.some(l=>l.image&&this.images.get(l.image.key)==='loading'))await new Promise(r=>setTimeout(r,30));}
 // Each layer keeps its own paper-sized pixels; new samples are appended incrementally and any other change repaints that layer.
 private layer(l:Layer):HTMLCanvasElement{
  let c=this.layers.get(l.id);
  if(!c){const canvas=document.createElement('canvas');canvas.width=this.comp.width;canvas.height=this.comp.height;c={canvas,strokes:null,count:0,samples:0,image:undefined,imageReady:false};this.layers.set(l.id,c);}
  const ctx=c.canvas.getContext('2d')!,img=l.image?this.image(l.image.key):null,last=l.strokes.length-1;
  const appendable=c.strokes===l.strokes&&c.image===l.image?.key&&c.imageReady===!!img&&c.count===l.strokes.length&&last>=0&&c.samples<=l.strokes[last].samples.length;
  if(appendable&&c.samples===l.strokes[last].samples.length)return c.canvas;
  const at=()=>ctx.setTransform(this.px,0,0,this.px,this.ox*this.dpr,this.oy*this.dpr);at();
  if(appendable){strokePart(ctx,l.strokes[last],c.samples);}
  else if(c.strokes===l.strokes&&c.image===l.image?.key&&c.imageReady===!!img&&c.count<l.strokes.length&&c.count>0&&c.samples===l.strokes[c.count-1].samples.length){for(let i=c.count;i<l.strokes.length;i++)strokePart(ctx,l.strokes[i],0);}
  else{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.canvas.width,c.canvas.height);at();if(img&&l.image)ctx.drawImage(img,l.image.x,l.image.y,l.image.w,l.image.h);for(const s of l.strokes)strokePart(ctx,s,0);}
  c.strokes=l.strokes;c.count=l.strokes.length;c.samples=last>=0?l.strokes[last].samples.length:0;c.image=l.image?.key;c.imageReady=!!img;return c.canvas;
 }
 draw(){const e=this.engine,d=e.drawing;const ctx=this.canvas.getContext('2d')!,comp=this.comp.getContext('2d')!;
  this.place();const key=`${this.scale},${this.ox},${this.oy}`;
  if(e.navigating&&!this.frozen&&this.view){const canvas=document.createElement('canvas');canvas.width=this.comp.width;canvas.height=this.comp.height;canvas.getContext('2d')!.drawImage(this.comp,0,0);const [s,ox,oy]=this.view.split(',').map(Number);this.frozen={canvas,base:compose(d,Math.min(1,this.dpr*s),this.images),scale:s,ox,oy};}
  if(!e.navigating)this.frozen=null;
  const paper=[this.ox,this.oy,d.width*this.scale,d.height*this.scale];
  ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle=ROOM;ctx.fillRect(0,0,this.w,this.h);
  if(this.frozen){const f=this.frozen,k=this.scale/f.scale;ctx.drawImage(f.base,paper[0],paper[1],paper[2],paper[3]);ctx.save();ctx.beginPath();ctx.rect(paper[0],paper[1],paper[2],paper[3]);ctx.clip();ctx.drawImage(f.canvas,this.ox-f.ox*k,this.oy-f.oy*k,this.w*k,this.h*k);ctx.restore();}
  else{
   if(key!==this.view){for(const c of this.layers.values())c.strokes=null;this.view=key;}
   comp.setTransform(1,0,0,1,0,0);comp.globalAlpha=1;comp.globalCompositeOperation='source-over';comp.clearRect(0,0,this.comp.width,this.comp.height);comp.fillStyle=PAPER;comp.fillRect(paper[0]*this.dpr,paper[1]*this.dpr,paper[2]*this.dpr,paper[3]*this.dpr);
   const live=new Set<string>();for(const l of d.layers){live.add(l.id);if(!l.visible)continue;const pixels=this.layer(l);comp.globalAlpha=l.opacity;comp.globalCompositeOperation=l.blend;comp.drawImage(pixels,0,0);}
   comp.globalAlpha=1;comp.globalCompositeOperation='source-over';for(const id of this.layers.keys())if(!live.has(id))this.layers.delete(id);
   // Ink that spills past the paper's edge is clipped away, as on export.
   ctx.save();ctx.beginPath();ctx.rect(paper[0],paper[1],paper[2],paper[3]);ctx.clip();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.comp,0,0);ctx.restore();
  }
  ctx.setTransform(this.px,0,0,this.px,this.ox*this.dpr,this.oy*this.dpr);
  // The ring shows the ink colour; the eraser ring is dashed.
  const c=d.cursor,r=c.w/2+3/this.scale,ink=e.tool==='erase'?'#293355':d.color;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.strokeStyle=PAPER;ctx.lineWidth=4/this.scale;ctx.stroke();ctx.strokeStyle=ink;ctx.lineWidth=1.4/this.scale;if(e.tool==='erase')ctx.setLineDash([4/this.scale,3/this.scale]);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(c.x,c.y,1.5/this.scale,0,Math.PI*2);ctx.fillStyle=ink;ctx.fill();
 }
 // Colour of the composed painting (no cursor) under a client point, or null off the paper.
 sample(clientX:number,clientY:number):string|null{const r=this.canvas.getBoundingClientRect(),d=this.engine.drawing,wx=(clientX-r.left-this.ox)/this.scale,wy=(clientY-r.top-this.oy)/this.scale,x=Math.floor((clientX-r.left)*this.dpr),y=Math.floor((clientY-r.top)*this.dpr);if(wx<0||wy<0||wx>=d.width||wy>=d.height||x<0||y<0||x>=this.comp.width||y>=this.comp.height)return null;const [R,G,B]=this.comp.getContext('2d')!.getImageData(x,y,1,1).data;return '#'+[R,G,B].map(v=>v.toString(16).padStart(2,'0')).join('');}
 async png(d:Drawing,k=2){await this.ready(d);return await new Promise<Blob>((resolve,reject)=>compose(d,k,this.images).toBlob(b=>b?resolve(b):reject(Error('Export failed')),'image/png'));}
 async thumb(d:Drawing){await this.ready(d);return await new Promise<Blob>((resolve,reject)=>compose(d,240/d.width,this.images).toBlob(b=>b?resolve(b):reject(Error('Thumbnail failed')),'image/jpeg',.82));}
}
