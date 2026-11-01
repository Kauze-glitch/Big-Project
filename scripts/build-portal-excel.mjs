import { build } from 'esbuild';
import fs from 'node:fs';
await build({entryPoints:['scripts/portal-excel-entry.mjs'],outfile:'portal-excel.min.js',bundle:true,minify:true,format:'iife',platform:'browser',target:['es2022'],legalComments:'external'});
const names=['read-excel-file','write-excel-file','fflate','worker-f','saxen','@babel/runtime'];let text='Excel import/export dependencies bundled for the citizen portal.\n';
for(const name of names){const folder='node_modules/'+name;if(!fs.existsSync(folder))continue;const p=JSON.parse(fs.readFileSync(folder+'/package.json','utf8'));const license=['LICENSE','LICENSE.txt','LICENSE.md','LICENSE-MIT'].find(f=>fs.existsSync(folder+'/'+f));text+='\n--- '+name+' '+p.version+' ('+(p.license||'')+') ---\n'+(license?fs.readFileSync(folder+'/'+license,'utf8'):'License: '+p.license)+'\n';}fs.writeFileSync('PORTAL-EXCEL-LICENSES.txt',text);
