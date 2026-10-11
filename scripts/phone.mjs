// Serve the production build over an ngrok HTTPS tunnel so an iPhone can install and update the real PWA.
// Rebuild in another terminal (`npm run build`), then foreground the app on the phone to receive the update.
import {preview} from 'vite';import {spawn,execSync} from 'node:child_process';
execSync('npm run build',{stdio:'inherit'});
const server=await preview({preview:{host:'127.0.0.1',port:4173,strictPort:true}});
const ngrok=spawn('ngrok',['http','4173','--log','stdout','--log-format','json'],{stdio:['ignore','pipe','inherit']});
ngrok.stdout.on('data',chunk=>{for(const line of chunk.toString().split('\n')){try{const e=JSON.parse(line);if(e.url&&e.msg==='started tunnel')console.log(`\nOpen on iPhone: ${e.url}/\nLocal: http://127.0.0.1:4173/\n`);}catch{}}});
const stop=()=>{ngrok.kill();server.httpServer.close();process.exit();};process.on('SIGINT',stop);process.on('SIGTERM',stop);ngrok.on('exit',code=>{console.error(`ngrok exited (${code})`);server.httpServer.close();process.exit(1);});
