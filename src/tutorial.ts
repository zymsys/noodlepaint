import type {Engine,Stroke} from './engine';
// A hands-on walkthrough: each step watches the engine and moves on once the learner has really done it.
const finger=(cx:number,cy:number,cls='')=>`<circle class="finger ${cls}" cx="${cx}" cy="${cy}" r="13"/>`;
const ring=(cx:number,cy:number)=>`<circle class="ring" cx="${cx}" cy="${cy}" r="9"/><circle class="pip" cx="${cx}" cy="${cy}" r="1.6"/>`;
const label=(x:number,y:number,t:string)=>`<text x="${x}" y="${y}">${t}</text>`;
const art=(body:string)=>`<svg viewBox="0 0 260 100" aria-hidden="true">${body}</svg>`;
type Step={title:string;text:string;art:string;check:'steer'|'stroke'|'width'|'undo'};
export const STEPS:Step[]=[
 {title:'Steer the brush',check:'steer',text:'Put <b>one finger</b> down anywhere and slide it around. The ring follows your finger, like a mouse pointer. You never need to touch the ring itself.',
  art:art(`<g class="slide">${ring(60,26)}${label(76,30,'brush')}</g><g class="slide">${finger(40,74)}${label(58,78,'finger')}</g>`)},
 {title:'Put the brush down',check:'stroke',text:'Keep that finger down and rest a <b>second finger</b> anywhere. While it touches, the brush paints. Move the <b>first</b> finger to draw a line, then lift the second finger to stop.',
  art:art(`<line class="ink draw" x1="60" y1="26" x2="170" y2="26" pathLength="1"/><g class="slide">${ring(60,26)}</g><g class="slide">${finger(40,74)}${label(14,98,'1 steers')}</g><g class="press">${finger(225,74)}</g>${label(198,98,'2 paints')}`)},
 {title:'Change the size',check:'width',text:'Draw another line. While you do, slide the <b>second finger up</b> to make it fatter, or down to make it thinner.',
  art:art(`<mask id="coach-mask"><line class="draw" x1="52" y1="30" x2="182" y2="30" stroke="#fff" stroke-width="40" pathLength="1"/></mask><polygon class="ink-fill" mask="url(#coach-mask)" points="60,28 170,18 170,38 60,32"/><g class="slide">${ring(60,30)}</g><g class="slide">${finger(40,78)}</g><g class="rise"><g class="press">${finger(225,78)}</g></g><path class="arrow" d="M244 82V52m-5 6 5-6 5 6"/>`)},
 {title:'Oops! Undo',check:'undo',text:'Tap <b>two fingers</b> on the screen at the same moment to undo your last line. (Three fingers redoes it.)',
  art:art(`<line class="ink vanish" x1="60" y1="26" x2="200" y2="26"/><g class="tap">${finger(105,72)}${finger(150,72)}</g>${label(106,98,'tap tap')}`)},
];
export const TIPS=[
 ['Out of room?','Lift the first finger and put it down somewhere else. Keep the second finger down and your line carries on.'],
 ['Zoom','Put two fingers down together and hold, then pinch or drag. Pinch all the way out to see the whole page.'],
 ['Exact size','Tap the number at the bottom to set the size, or lock it so it can’t change by accident.'],
 ['Colours','Tap an ink to use it. Press and hold one to mix your own, or pick a colour from your drawing. The eraser sits next to them.'],
 ['Layers','The stacked-squares button keeps parts of a picture separate, so you can hide, fade or lock them, or add a photo.'],
 ['The ⋯ menu','Your library of drawings, Save to Photos, redo, clear, backups, help, and this tutorial.'],
];
const length=(s:Stroke)=>{let d=0;for(let i=1;i<s.samples.length;i++)d+=Math.hypot(s.samples[i].x-s.samples[i-1].x,s.samples[i].y-s.samples[i-1].y);return d;};
export function createTutorial(engine:Engine,changed:()=>void){
 const card=document.getElementById('coach')!,$=(id:string)=>document.getElementById(id)!;
 let step=-1,start:ReturnType<Engine['capture']>|null=null,locked=false,width=18,travel=0,last={x:0,y:0},stroke:Stroke|null=null,lo=0,hi=0,future=0,passed=false,timer=0;
 const t={get active(){return step>=0;},get step(){return step;},start:begin,update,finish};
 function note(text:string){$('coach-note').textContent=text;}
 function render(){
  const tour=step>=STEPS.length,s=STEPS[step];card.classList.toggle('tour',tour);card.classList.remove('passed');note('');
  $('coach-count').textContent=tour?'All set':`Step ${step+1} of ${STEPS.length}`;
  $('coach-title').textContent=tour?'You’ve got it!':s.title;$('coach-art').innerHTML=tour?'':s.art;
  $('coach-text').innerHTML=tour?'Here’s what else is in the room:':s.text;
  const tips=$('coach-tips');tips.replaceChildren(...(tour?TIPS:[]).map(([k,v])=>{const li=document.createElement('li'),b=document.createElement('b');b.textContent=/[?!.]$/.test(k)?k+' ':k+'. ';li.append(b,v);return li;}));
  for(const id of ['coach-next','coach-skip'])$(id).hidden=tour;for(const id of ['coach-clear','coach-done'])$(id).hidden=!tour;
  $('coach-clear').hidden=!tour||!changedSinceStart();
 }
 function changedSinceStart(){return !!start&&JSON.stringify(start.layers.map(l=>l.strokes.length))!==JSON.stringify(engine.drawing.layers.map(l=>l.strokes.length));}
 function go(i:number){
  clearTimeout(timer);step=i;passed=false;travel=0;stroke=null;future=engine.future.length;
  // Drawing steps start with the ring on the left, below the card, so a line has room to run before it meets the paper's edge.
  const s=STEPS[i];if(s&&s.check!=='steer'&&!engine.down){const d=engine.drawing;engine.setView({zoom:1,x:0,y:0});d.cursor.x=d.width*.22;d.cursor.y=d.height*(s.check==='width'?.72:.6);engine.touch();}
  last={...engine.drawing.cursor};render();
 }
 function pass(){passed=true;card.classList.add('passed');note('Nice!');timer=window.setTimeout(()=>go(step+1),900);}
 function begin(){
  for(const d of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))d.close();
  if(step<0){start=engine.capture();locked=engine.widthLocked;width=engine.drawing.cursor.w;}
  // Width practice needs a free width; the learner's lock comes back afterwards.
  engine.widthLocked=false;card.hidden=false;document.body.classList.add('coaching');go(0);changed();
 }
 function finish(clear=false){
  clearTimeout(timer);if(step<0)return;
  if(clear&&start){const s=start;engine.edit(()=>engine.apply(s));}
  // Practice changes to the brush size don't outlive the tutorial.
  engine.widthLocked=locked;engine.drawing.cursor.w=width;step=-1;start=null;card.hidden=true;document.body.classList.remove('coaching');changed();
 }
 function update(){
  if(step<0||step>=STEPS.length||passed)return;
  const c=engine.drawing.cursor,check=STEPS[step].check;
  if(check==='steer'){travel+=Math.hypot(c.x-last.x,c.y-last.y);if(travel>=150)pass();}
  else if(check==='undo'){if(engine.future.length>future)pass();future=engine.future.length;}
  else if(engine.active){if(stroke!==engine.active){stroke=engine.active;lo=hi=c.w;note('');}lo=Math.min(lo,c.w);hi=Math.max(hi,c.w);}
  else if(stroke){const s=stroke;stroke=null;
   if(length(s)<100)note('Keep the second finger down and move the first one further.');
   else if(check==='width'&&hi-lo<8)note('Now slide the second finger up or down while you draw.');else pass();}
  last={x:c.x,y:c.y};
 }
 $('coach-next').onclick=()=>go(step+1);$('coach-skip').onclick=()=>finish();$('coach-done').onclick=()=>finish();$('coach-clear').onclick=()=>finish(true);
 return t;
}
