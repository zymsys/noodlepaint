// Serve the production build over LAN HTTPS (mkcert) so an iPhone can install and update the real PWA.
// Rebuild in another terminal (`npm run build`), then foreground the app on the phone to receive the update.
import {preview} from 'vite';import {execSync} from 'node:child_process';import {existsSync,readFileSync} from 'node:fs';import {createServer} from 'node:http';import {hostname} from 'node:os';
// The Bonjour name (what the iPhone resolves), not os.hostname(), which can differ.
const host=(()=>{try{return execSync('scutil --get LocalHostName').toString().trim();}catch{return hostname().replace(/\.local$/,'');}})().toLowerCase()+'.local';
if(!existsSync('.certs/cert.pem')){console.error(`No LAN certificate. Run:\n  mkdir -p .certs && mkcert -cert-file .certs/cert.pem -key-file .certs/key.pem ${host} localhost 127.0.0.1`);process.exit(1);}
execSync('npm run build',{stdio:'inherit'});
await preview({preview:{host:'0.0.0.0',port:4173,strictPort:true,allowedHosts:[host],https:{cert:readFileSync('.certs/cert.pem'),key:readFileSync('.certs/key.pem')}}});
// One-time phone setup: the public root certificate over plain HTTP (never the key).
const ca=readFileSync(execSync('mkcert -CAROOT').toString().trim()+'/rootCA.pem');
createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="noodlepaint-dev-ca.pem"'});res.end(ca);}).listen(4174,'0.0.0.0');
console.log(`\nOpen on iPhone:  https://${host}:4173/\nFirst time only: http://${host}:4174/ installs the dev certificate (then Settings → General → VPN & Device Management → install, and Settings → General → About → Certificate Trust Settings → enable).\n`);
