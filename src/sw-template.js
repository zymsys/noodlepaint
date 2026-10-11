const CACHE='noodlepaint-__VERSION__';
const SHELL=__SHELL__;
const urls=SHELL.map(p=>new URL(p,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);try{for(const url of urls){const response=await fetch(url,{cache:'reload',redirect:'error',credentials:'same-origin'});const type=response.headers.get('content-type')||'';const expected=url.endsWith('.js')?/javascript/:url.endsWith('.css')?/text\/css/:url.endsWith('.png')?/image\/png/:url.endsWith('.webmanifest')?/json|manifest/:/text\/html/;if(!response.ok||!expected.test(type))throw Error('Invalid offline asset');await cache.put(url,response);}}catch(e){await caches.delete(CACHE);throw e;}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('noodlepaint-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE')self.skipWaiting();if(event.data?.type==='CHECK_OFFLINE')event.waitUntil((async()=>{const cache=await caches.open(CACHE);const matches=await Promise.all(urls.map(url=>cache.match(url)));event.ports[0]?.postMessage({ready:matches.every(Boolean)});})());});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 // Serve only our exact app shell; never cache sign-in or other private pages.
 if(request.mode==='navigate'&&(url.pathname===new URL('./',self.registration.scope).pathname||url.pathname===new URL('./index.html',self.registration.scope).pathname))event.respondWith((async()=>{try{return await fetch(request);}catch{const cached=await (await caches.open(CACHE)).match(new URL('./index.html',self.registration.scope).href);return cached||Response.error();}})());
 else if(urls.includes(url.href))event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(request)||fetch(request);})());
});
