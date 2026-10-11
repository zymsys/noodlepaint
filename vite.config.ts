import {defineConfig} from 'vite';import {readFileSync} from 'node:fs';import {execSync} from 'node:child_process';
const {version}=JSON.parse(readFileSync('package.json','utf8'));
const sha=(()=>{try{return execSync('git rev-parse --short HEAD').toString().trim();}catch{return 'unknown';}})();
// Release builds (GitHub Actions) show the plain version; anything built on this Mac is marked local so phone testing can tell them apart.
const label=process.env.GITHUB_ACTIONS?version:`${version}-local (${sha})`;
// Relative asset URLs so the build works under any sub-path, e.g. GitHub Pages' /noodlepaint/.
export default defineConfig({base:'./',define:{__APP_VERSION__:JSON.stringify(label)}});
