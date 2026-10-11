import {validate,blankDrawing,newId,type Drawing} from './engine';
// One record per drawing in `docs`; `cards` holds the light library entry (name, date, thumbnail) so listing never loads strokes.
// Photo pixels live in `blobs` under "<docId>/<id>", so deleting a drawing can drop its photos by key range.
export type Doc={id:string;name:string;created:number;updated:number;drawing:Drawing};
export type Card={id:string;name:string;updated:number;thumb?:Blob};
const DB='noodlepaint',VERSION=2;
const done=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save interrupted'));});
const result=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export const newDoc=(name:string,drawing=blankDrawing()):Doc=>{const now=Date.now();return {id:newId(),name,created:now,updated:now,drawing};};
export class SketchStore {
 db:IDBDatabase|null=null;
 async open():Promise<Doc> {
  this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,VERSION);
   r.onupgradeneeded=e=>{const db=r.result,tx=r.transaction!;
    if(e.oldVersion<2){for(const s of ['docs','cards','meta','blobs'])db.createObjectStore(s);}
    // Version 1 kept a single drawing in `sketch`. Move it into the library. If it does not validate, abort the upgrade: the old data stays
    // untouched and open() fails, which locks out writes exactly like any other unreadable storage.
    if(db.objectStoreNames.contains('sketch')){const get=tx.objectStore('sketch').get('drawing');get.onsuccess=()=>{if(get.result===undefined){db.deleteObjectStore('sketch');return;}let drawing:Drawing;try{drawing=validate(get.result);}catch{tx.abort();return;}const doc=newDoc('My first drawing',drawing);tx.objectStore('docs').put(doc,doc.id);tx.objectStore('cards').put({id:doc.id,name:doc.name,updated:doc.updated},doc.id);tx.objectStore('meta').put(doc.id,'current');db.deleteObjectStore('sketch');};}
   };
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Storage blocked by another tab'));});
  this.db.onversionchange=()=>{this.db?.close();this.db=null;};
  const current=await result(this.tx('meta').objectStore('meta').get('current')) as string|undefined;
  if(current){const doc=await this.getDoc(current);if(doc)return doc;throw Error('Current drawing is missing');}
  const doc=newDoc('Drawing 1');await this.write(doc);await this.setCurrent(doc.id);return doc;
 }
 private tx(stores:string|string[],mode:IDBTransactionMode='readonly'){if(!this.db)throw Error('Storage is unavailable');return this.db.transaction(stores,mode);}
 async getDoc(id:string):Promise<Doc|null>{const v=await result(this.tx('docs').objectStore('docs').get(id)) as Doc|undefined;if(!v)return null;v.drawing=validate(v.drawing);return v;}
 // Writing a drawing also refreshes its card's name/date; the thumbnail is kept.
 async write(doc:Doc){validate(doc.drawing);const tx=this.tx(['docs','cards'],'readwrite'),cards=tx.objectStore('cards');tx.objectStore('docs').put(doc,doc.id);const card=cards.get(doc.id);card.onsuccess=()=>cards.put({...(card.result as Card|undefined),id:doc.id,name:doc.name,updated:doc.updated},doc.id);await done(tx);}
 async setThumb(id:string,thumb:Blob){const tx=this.tx('cards','readwrite'),cards=tx.objectStore('cards'),card=cards.get(id);card.onsuccess=()=>{if(card.result)cards.put({...card.result,thumb},id);};await done(tx);}
 async cards():Promise<Card[]>{const all=await result(this.tx('cards').objectStore('cards').getAll()) as Card[];return all.sort((a,b)=>b.updated-a.updated);}
 async docs():Promise<Doc[]>{const all=await result(this.tx('docs').objectStore('docs').getAll()) as Doc[];return all.sort((a,b)=>b.updated-a.updated);}
 async setCurrent(id:string){const tx=this.tx('meta','readwrite');tx.objectStore('meta').put(id,'current');await done(tx);}
 async remove(id:string){const tx=this.tx(['docs','cards','blobs'],'readwrite');tx.objectStore('docs').delete(id);tx.objectStore('cards').delete(id);tx.objectStore('blobs').delete(IDBKeyRange.bound(id+'/',id+'/￿'));await done(tx);}
 async putBlob(key:string,blob:Blob){const tx=this.tx('blobs','readwrite');tx.objectStore('blobs').put(blob,key);await done(tx);}
 async getBlob(key:string):Promise<Blob|undefined>{return await result(this.tx('blobs').objectStore('blobs').get(key)) as Blob|undefined;}
}
// Serializes writes of whole documents; savedRevision only advances after a committed transaction.
export class SaveQueue<T=Doc> {
 savedRevision=-1;pending:{revision:number;value:T}|null=null;running:Promise<void>|null=null;error:unknown=null;
 constructor(private write:(value:T)=>Promise<void>,private notify:()=>void){}
 request(revision:number,value:T){if(revision===this.savedRevision&&!this.error)return this.running??Promise.resolve();this.pending={revision,value};if(!this.running){this.running=this.drain().finally(()=>{this.running=null;this.notify();});}return this.running;}
 private async drain(){while(this.pending){const item=this.pending;this.pending=null;try{await this.write(item.value);this.savedRevision=item.revision;this.error=null;}catch(e){this.error=e;this.pending=null;break;}this.notify();}}
}
