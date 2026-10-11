import type {Sample,Stroke,Engine} from './engine';
function dot(ctx:CanvasRenderingContext2D,s:Sample){ctx.beginPath();ctx.arc(s.x,s.y,s.w/2,0,Math.PI*2);ctx.fill();}
export function segment(ctx:CanvasRenderingContext2D,a:Sample,b:Sample){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len){const q=(a.w-b.w)/(2*len);if(Math.abs(q)<1){const h=Math.sqrt(1-q*q),ux=dx/len,uy=dy/len,nx=ux*q-uy*h,ny=uy*q+ux*h,mx=ux*q+uy*h,my=uy*q-ux*h;ctx.beginPath();ctx.moveTo(a.x+nx*a.w/2,a.y+ny*a.w/2);ctx.lineTo(b.x+nx*b.w/2,b.y+ny*b.w/2);ctx.lineTo(b.x+mx*b.w/2,b.y+my*b.w/2);ctx.lineTo(a.x+mx*a.w/2,a.y+my*a.w/2);ctx.closePath();ctx.fill();}}dot(ctx,b);
}
export function stroke(ctx:CanvasRenderingContext2D,s:Stroke){ctx.fillStyle=s.color;dot(ctx,s.samples[0]);for(let i=1;i<s.samples.length;i++)segment(ctx,s.samples[i-1],s.samples[i]);}
export class Renderer {
 scale=1;ox=0;oy=0;w=0;h=0;dpr=1;frame=0;
 cache=document.createElement('canvas');cacheCount=0;sampleCounts:number[]=[];lastStrokes:Stroke[]|null=null;
 constructor(public canvas:HTMLCanvasElement,public engine:Engine){}
 resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,3);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.cache.width=this.canvas.width;this.cache.height=this.canvas.height;this.lastStrokes=null;this.scale=Math.min(this.w/this.engine.drawing.width,this.h/this.engine.drawing.height);this.ox=(this.w-this.engine.drawing.width*this.scale)/2;this.oy=(this.h-this.engine.drawing.height*this.scale)/2;this.request();}
 request(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
 transform(ctx:CanvasRenderingContext2D){ctx.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,this.ox*this.dpr,this.oy*this.dpr);}
 draw(){const e=this.engine,d=e.drawing;const ctx=this.canvas.getContext('2d')!,cache=this.cache.getContext('2d')!;
  if(this.lastStrokes!==d.strokes||d.strokes.length<this.cacheCount){cache.setTransform(1,0,0,1,0,0);cache.clearRect(0,0,this.cache.width,this.cache.height);this.cacheCount=0;this.sampleCounts=[];this.lastStrokes=d.strokes;}
  this.transform(cache);cache.save();cache.beginPath();cache.rect(0,0,d.width,d.height);cache.clip();for(let i=Math.max(0,this.cacheCount-1);i<d.strokes.length;i++){const s=d.strokes[i];cache.fillStyle=s.color;let count=this.sampleCounts[i]||0;if(!count){dot(cache,s.samples[0]);count=1;}for(;count<s.samples.length;count++)segment(cache,s.samples[count-1],s.samples[count]);this.sampleCounts[i]=count;}this.cacheCount=d.strokes.length;cache.restore();
  ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#edeaf5';ctx.fillRect(0,0,this.w,this.h);ctx.fillStyle='#fcfbff';ctx.fillRect(this.ox,this.oy,d.width*this.scale,d.height*this.scale);
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.cache,0,0);this.transform(ctx);
  const c=d.cursor,r=c.w/2+3/this.scale;ctx.beginPath();ctx.arc(c.x,c.y,r,0,Math.PI*2);ctx.strokeStyle='#fcfbff';ctx.lineWidth=4/this.scale;ctx.stroke();ctx.strokeStyle=d.color;ctx.lineWidth=1.4/this.scale;ctx.stroke();ctx.beginPath();ctx.arc(c.x,c.y,1.5/this.scale,0,Math.PI*2);ctx.fillStyle=d.color;ctx.fill();
 }
}
