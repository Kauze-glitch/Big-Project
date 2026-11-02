// Private operator tool. Never run in the browser, commit backups, or pass credentials as CLI arguments.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project='grhdawkxnrkgkahegnnd',sourceUrl='https://'+project+'.supabase.co';
const hash=data=>createHash('sha256').update(data).digest('hex');
const localHost=hostname=>['localhost','127.0.0.1','[::1]'].includes(hostname);
export function assertDisposableTarget(dbUrl,apiUrl,confirmed){
 if(!confirmed)throw Error('Restore requires --confirm-disposable and PORTAL_RESTORE_DISPOSABLE=YES.');
 for(const [value,protocols] of [[dbUrl,['postgres:','postgresql:']],[apiUrl,['http:','https:']]]){const url=new URL(value);if(!protocols.includes(url.protocol)||!localHost(url.hostname))throw Error('Restore is restricted to a disposable local Supabase instance. Production targets are refused.');}
}
function safeRelative(value){return typeof value==='string'&&/^(database\.dump|storage\/[0-9a-f-]{36}\/[0-9a-f-]{36})$/.test(value)&&!value.includes('..');}
export async function inspectArchive(directory,{allowIncomplete=false}={}){
 const root=path.resolve(directory);if(!allowIncomplete){try{await fs.lstat(path.join(root,'.incomplete'));throw Error('Backup is incomplete. Do not restore this directory.');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 if(manifest.format!=='nhom12-full-backup-v1'||!Array.isArray(manifest.files)||manifest.files.length>10000||manifest.source!==sourceUrl)throw Error('Invalid backup manifest.');
 const seen=new Set();for(const item of manifest.files){if(!safeRelative(item.file)||seen.has(item.file)||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.size)||item.size<0)throw Error('Unsafe or duplicate backup path.');seen.add(item.file);const full=path.join(root,item.file);const stat=await fs.lstat(full);if(stat.isSymbolicLink()||!stat.isFile()||stat.size!==item.size)throw Error('Backup file missing or size differs: '+item.file);const real=await fs.realpath(full),relative=path.relative(await fs.realpath(root),real);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Backup file escapes its archive.');if(hash(await fs.readFile(full))!==item.sha256)throw Error('Backup checksum differs: '+item.file);}
 if(!seen.has('database.dump'))throw Error('Database dump missing.');return manifest;
}
async function runPg(command,args,dbUrl){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PORTAL_')));env.PGDATABASE=dbUrl;
 await new Promise((resolve,reject)=>{const child=spawn(command,args,{env,stdio:['ignore','ignore','pipe'],windowsHide:true});child.stderr.resume();child.on('error',()=>reject(Error(command+' is unavailable. Install PostgreSQL client tools and add them to PATH.')));child.on('close',code=>code===0?resolve():reject(Error(command+' failed. Check database connectivity, permissions and PostgreSQL client/server versions. Credentials were not printed.')));});
}
async function inventory(apiUrl,key,fetcher){const response=await fetcher(apiUrl+'/rest/v1/rpc/cd_backup_inventory',{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('Cannot read backup inventory. Check service credentials and migration version.');return response.json();}
const comparable=inv=>JSON.stringify({schemaVersion:inv.schemaVersion,tables:inv.tables,files:inv.files});
export async function createBackup({out,dbUrl,serviceKey,fetcher=fetch,run=runPg}){
 if(!dbUrl||!serviceKey)throw Error('Set PORTAL_DB_URL and PORTAL_SERVICE_KEY privately in your shell. Do not send them in chat.');
 const parsed=new URL(dbUrl);if(!['postgres:','postgresql:'].includes(parsed.protocol)||(parsed.hostname!=='db.'+project+'.supabase.co'&&decodeURIComponent(parsed.username)!=='postgres.'+project))throw Error('Database URL must identify this Supabase project. Refusing a dump from an unrelated database.');
 const destination=path.resolve(out),working=destination;await fs.mkdir(path.dirname(destination),{recursive:true});
 try{await fs.lstat(destination);throw Error('Output already exists. Choose a new backup directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.mkdir(working,{mode:0o700});await fs.writeFile(path.join(working,'.incomplete'),'Backup not verified. Do not restore.\n',{mode:0o600});
 const before=await inventory(sourceUrl,serviceKey,fetcher),files=[];
 await run('pg_dump',['--format=custom','--no-owner','--no-acl','--schema=public','--schema=auth','--schema=storage','--file',path.join(working,'database.dump')],dbUrl);
 const dump=await fs.readFile(path.join(working,'database.dump'));files.push({file:'database.dump',size:dump.length,sha256:hash(dump)});
 for(const item of before.files){
  if(item.bucket!=='cd-documents'||!/^[-0-9a-f]{36}\/[-0-9a-f]{36}$/.test(item.path)||item.size>2097152)throw Error('Unexpected Storage object in inventory.');
  const response=await fetcher(sourceUrl+'/storage/v1/object/authenticated/cd-documents/'+item.path,{headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey}});if(!response.ok)throw Error('Cannot download a Storage object. Backup remains incomplete.');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length!==item.size)throw Error('Storage object size changed during backup.');
  const relative='storage/'+item.path,full=path.join(working,relative);await fs.mkdir(path.dirname(full),{recursive:true,mode:0o700});await fs.writeFile(full,bytes,{mode:0o600});files.push({file:relative,size:bytes.length,sha256:hash(bytes),bucket:item.bucket,objectPath:item.path,mime:item.mime});
 }
 const after=await inventory(sourceUrl,serviceKey,fetcher);if(comparable(before)!==comparable(after))throw Error('Business data changed during backup. Keep the incomplete folder private and retry during a quiet maintenance window.');
 const manifest={format:'nhom12-full-backup-v1',source:sourceUrl,createdAt:new Date().toISOString(),schemas:['public','auth','storage'],inventory:before,files};
 await fs.writeFile(path.join(working,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});await inspectArchive(working,{allowIncomplete:true});await fs.unlink(path.join(working,'.incomplete'));return {directory:destination,files:files.length};
}
export async function restoreLocal({directory,dbUrl,apiUrl,serviceKey,confirmed,fetcher=fetch,run=runPg}){
 assertDisposableTarget(dbUrl,apiUrl,confirmed);if(!serviceKey)throw Error('Set PORTAL_RESTORE_SERVICE_KEY for the disposable local Supabase instance.');const manifest=await inspectArchive(directory);
 // Explicitly destructive ONLY on the operator-confirmed localhost disposable instance.
 await run('pg_restore',['--clean','--if-exists','--no-owner','--no-acl',path.join(path.resolve(directory),'database.dump')],dbUrl);
 for(const item of manifest.files.filter(f=>f.file.startsWith('storage/'))){if(item.bucket!=='cd-documents'||item.file!=='storage/'+item.objectPath)throw Error('Invalid Storage restore path.');const bytes=await fs.readFile(path.join(directory,item.file)),response=await fetcher(apiUrl+'/storage/v1/object/cd-documents/'+item.objectPath,{method:'POST',headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'Content-Type':item.mime||'application/octet-stream','x-upsert':'true'},body:bytes});if(!response.ok)throw Error('Storage restore failed. Keep the local test instance isolated.');}
 const actual=await inventory(apiUrl,serviceKey,fetcher);if(comparable(actual)!==comparable(manifest.inventory))throw Error('Restore inventory differs from the backup. Do not use this restored instance.');return {verified:true,files:manifest.files.length};
}
async function main(){
 const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
 if(!args.length||args.includes('--help')){console.log('Backup: node scripts/backup-portal.mjs --out backups/NAME\nVerify: node scripts/backup-portal.mjs --check backups/NAME\nDisposable local restore: node scripts/backup-portal.mjs --restore backups/NAME --confirm-disposable\nSecrets are read only from PORTAL_* environment variables. Read BACKUP-RESTORE.md first.');return;}
 let result;if(args.includes('--check')){const m=await inspectArchive(get('--check'));result={verified:true,files:m.files.length};}
 else if(args.includes('--restore'))result=await restoreLocal({directory:get('--restore'),dbUrl:process.env.PORTAL_RESTORE_DB_URL,apiUrl:process.env.PORTAL_RESTORE_API_URL,serviceKey:process.env.PORTAL_RESTORE_SERVICE_KEY,confirmed:args.includes('--confirm-disposable')&&process.env.PORTAL_RESTORE_DISPOSABLE==='YES'});
 else if(args.includes('--out'))result=await createBackup({out:get('--out'),dbUrl:process.env.PORTAL_DB_URL,serviceKey:process.env.PORTAL_SERVICE_KEY});else throw Error('Unknown arguments. Use --help.');console.log(JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
