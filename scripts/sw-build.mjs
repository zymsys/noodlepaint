import {readdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const assets=(await readdir('dist/assets')).map(f=>'./assets/'+f);const shell=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png',...assets];
const hash=createHash('sha256');for(const f of shell.filter(f=>f!=='./'))hash.update(await readFile('dist/'+f.slice(2)));const template=await readFile('src/sw-template.js','utf8');hash.update(template);const version=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',template.replace('__VERSION__',version).replace('__SHELL__',JSON.stringify(shell)));
