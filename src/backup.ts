import {validate,newId,type Drawing} from './engine';
import {newDoc,type Doc} from './storage';
// Backup files are JSON bundles of one or more drawings with photos embedded as data URLs.
// Older single-drawing backups (version 1 or 2 drawing JSON) are still accepted.
type BundleDoc={name:string;drawing:Drawing;images:Record<string,string>};
export type Bundle={app:'noodlepaint';version:2;docs:BundleDoc[]};
const toDataUrl=(b:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(r.error);r.readAsDataURL(b);});
export async function bundle(docs:Doc[],getBlob:(key:string)=>Promise<Blob|undefined>):Promise<Bundle>{
 const out:BundleDoc[]=[];
 for(const d of docs){const images:Record<string,string>={};for(const l of d.drawing.layers)if(l.image){const b=await getBlob(l.image.key);if(b)images[l.image.key]=await toDataUrl(b);}out.push({name:d.name,drawing:d.drawing,images});}
 return {app:'noodlepaint',version:2,docs:out};
}
// Parses a backup into fresh library documents. Photo keys are re-issued under each new document id; returns docs plus the blobs to store.
export async function unbundle(text:string):Promise<{doc:Doc;blobs:[string,Blob][]}[]>{
 const data=JSON.parse(text) as Partial<Bundle>&{version?:number};
 const items:BundleDoc[]=data&&data.app==='noodlepaint'&&Array.isArray(data.docs)?data.docs:[{name:'Restored drawing',drawing:data as unknown as Drawing,images:{}}];
 if(!items.length||items.length>500)throw Error('Empty backup');
 const out=[];
 for(const item of items){
  const drawing=validate(item.drawing),doc=newDoc(typeof item.name==='string'&&item.name.trim()?item.name.slice(0,80):'Restored drawing',drawing),blobs:[string,Blob][]=[];
  for(const l of drawing.layers)if(l.image){const url=item.images?.[l.image.key];if(typeof url!=='string'||!url.startsWith('data:image/'))throw Error('Missing photo');const key=`${doc.id}/${newId()}`;blobs.push([key,await (await fetch(url)).blob()]);l.image={...l.image,key};}
  out.push({doc,blobs});
 }
 return out;
}
