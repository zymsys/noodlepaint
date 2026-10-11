import {validate, type Drawing} from './engine';
export class SketchStore {
 db:IDBDatabase|null=null;
 async open():Promise<Drawing|null> {
  this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('noodlepaint',1);r.onupgradeneeded=()=>r.result.createObjectStore('sketch');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Storage blocked by another tab'));});
  this.db.onversionchange=()=>{this.db?.close();this.db=null;};
  const value=await new Promise<unknown>((resolve,reject)=>{const tx=this.db!.transaction('sketch');const r=tx.objectStore('sketch').get('drawing');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return value===undefined?null:validate(value);
 }
 async write(d:Drawing) {validate(d);if(!this.db)throw Error('Storage is unavailable');await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction('sketch','readwrite');tx.objectStore('sketch').put(d,'drawing');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save interrupted'));});}
}
export class SaveQueue {
 savedRevision=-1;pending:{revision:number;drawing:Drawing}|null=null;running:Promise<void>|null=null;error:unknown=null;
 constructor(private write:(drawing:Drawing)=>Promise<void>,private notify:()=>void){}
 request(revision:number,drawing:Drawing){if(revision===this.savedRevision&&!this.error)return this.running??Promise.resolve();this.pending={revision,drawing};if(!this.running){this.running=this.drain().finally(()=>{this.running=null;this.notify();});}return this.running;}
 private async drain(){while(this.pending){const item=this.pending;this.pending=null;try{await this.write(item.drawing);this.savedRevision=item.revision;this.error=null;}catch(e){this.error=e;this.pending=null;break;}this.notify();}}
}
