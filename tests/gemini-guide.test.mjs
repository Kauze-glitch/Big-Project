import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';

// Load the Edge Function in Node with Deno and the network replaced by fakes.
const code=buildSync({entryPoints:['supabase/functions/gemini-assistant/index.ts'],bundle:false,write:false,format:'esm',loader:{'.ts':'ts'}}).outputFiles[0].text;
let handler;
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://db.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_API_KEY:'gemini-key'})[name]},serve:h=>{handler=h;}};
await import('data:text/javascript,'+encodeURIComponent(code));

function backend({citizen=null,member=false,quota=true,user='u1'}={}){
 const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json(user?{id:user}:{} ,{status:user?200:401});
  if(url.endsWith('/rpc/cd_current_citizen'))return Response.json(citizen);
  if(url.includes('/rest/v1/sections'))return Response.json(member?[{owner_id:user}]:[]);
  if(url.endsWith('/rpc/reserve_ai_guide_request'))return Response.json(quota);
  if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:'**Bước 1:** mở mục Hồ sơ yêu cầu.'}]}}]});
  throw new Error('unexpected '+url);
 };
 return calls;
}
const ask=(body,auth='Bearer token')=>handler(new Request('https://fn.invalid',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({operation:'guide',question:'Sửa địa chỉ thế nào?',page:'Hồ sơ yêu cầu',...body})}));

test('Verified citizen gets a plain-text guide answer and uses the guide quota',async()=>{
 const calls=backend({citizen:'c-1'});const res=await ask({});const data=await res.json();
 assert.equal(res.status,200);assert.equal(data.answer,'Bước 1: mở mục Hồ sơ yêu cầu.');
 assert(calls.some(c=>c.url.endsWith('/rpc/reserve_ai_guide_request')&&JSON.parse(c.options.body).p_user_id==='u1'));
 const gemini=JSON.parse(calls.find(c=>c.url.includes('generativelanguage')).options.body);
 assert.match(gemini.systemInstruction.parts[0].text,/không đọc được chữ/);assert.doesNotMatch(JSON.stringify(gemini),/token/);
});

test('Project member without citizen session is allowed',async()=>{backend({member:true});assert.equal((await ask({})).status,200);});

test('Signed-in user who is neither verified citizen nor member is refused before Gemini',async()=>{
 const calls=backend({});const res=await ask({});assert.equal(res.status,403);assert(!calls.some(c=>c.url.includes('generativelanguage')||c.url.includes('reserve_ai')));
});

test('Missing token, exhausted quota and oversized input are rejected',async()=>{
 backend({citizen:'c-1'});assert.equal((await ask({},'')).status,401);
 backend({citizen:'c-1',quota:false});assert.equal((await ask({})).status,429);
 const calls=backend({citizen:'c-1'});assert.equal((await ask({question:'x'.repeat(1001)})).status,400);assert(!calls.some(c=>c.url.includes('generativelanguage')));
 backend({citizen:'c-1'});assert.equal((await ask({history:[{role:'model',text:'x'},{role:'user',text:'y'}]})).status,400);
});

function geminiReturns(text,opts){const calls=backend(opts);const base=globalThis.fetch;globalThis.fetch=async(url,o)=>url.includes('generativelanguage')?(calls.push({url,options:o}),Response.json({candidates:[{content:{parts:[{text}]}}]})):base(url,o);return calls;}

test('Guide answers carry a navigation target limited to the caller role',async()=>{
 let calls=geminiReturns(JSON.stringify({answer:'Mình đã mở trang Hồ sơ yêu cầu.',target:'profile_requests'}),{citizen:'c-1'});
 let data=await (await ask({})).json();assert.deepEqual(data,{answer:'Mình đã mở trang Hồ sơ yêu cầu.',target:'profile_requests'});
 const sent=JSON.parse(calls.find(c=>c.url.includes('generativelanguage')).options.body);
 assert.equal(sent.generationConfig.responseMimeType,'application/json');assert(sent.generationConfig.responseSchema.properties.target.enum.includes('profile_security'));assert(!sent.generationConfig.responseSchema.properties.target.enum.includes('admin'));
 geminiReturns(JSON.stringify({answer:'Trang quản lý.',target:'admin'}),{citizen:'c-1'});
 data=await (await ask({})).json();assert.equal(data.target,'none');
 geminiReturns(JSON.stringify({answer:'Trang quản lý.',target:'admin'}),{member:true});
 data=await (await ask({})).json();assert.equal(data.target,'admin');
 geminiReturns('Câu trả lời thường, không phải JSON.',{citizen:'c-1'});
 data=await (await ask({})).json();assert.deepEqual(data,{answer:'Câu trả lời thường, không phải JSON.',target:'none'});
});

test('Requested audio comes back as a playable WAV made with a female Gemini voice; TTS failure still answers',async()=>{
 const calls=backend({citizen:'c-1'});const base=globalThis.fetch;
 globalThis.fetch=async(url,o)=>{if(url.includes('-tts:generateContent')){calls.push({url,options:o});return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:btoa('\x01\x02\x03\x04')}}]}}]});}return base(url,o);};
 let data=await (await ask({audio:true})).json();
 const tts=calls.find(c=>c.url.includes('-tts:'));const sent=JSON.parse(tts.options.body);
 assert.deepEqual(sent.generationConfig.responseModalities,['AUDIO']);assert.equal(sent.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Leda');
 assert.equal(data.audio.mime,'audio/wav');const wav=atob(data.audio.data);assert.equal(wav.slice(0,4),'RIFF');assert.equal(wav.slice(8,12),'WAVE');assert.equal(wav.length,48);
 globalThis.fetch=async(url,o)=>url.includes('-tts:')?new Response('{}',{status:500}):base(url,o);
 data=await (await ask({audio:true})).json();assert.equal(data.answer,'Bước 1: mở mục Hồ sơ yêu cầu.');assert.equal(data.audio,undefined);
 backend({citizen:'c-1'});data=await (await ask({})).json();assert.equal(data.audio,undefined);
});

const guideAudio=(key,auth)=>handler(new Request('https://fn.invalid',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:auth}:{})},body:JSON.stringify({operation:'guide_audio',key})}));
function storage({cached=false,ttsOk=true,uploadOk=true}={}){const calls=[];globalThis.fetch=async(url,o={})=>{calls.push({url,options:o});
 if(url.includes('/storage/v1/object/public/assistant-voice/'))return new Response(null,{status:cached?200:404});
 if(url.includes('-tts:generateContent'))return ttsOk?Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;rate=24000',data:btoa('\x01\x02')}}]}}]}):new Response('{}',{status:500});
 if(url.includes('/storage/v1/object/assistant-voice/'))return new Response('{}',{status:uploadOk?200:400});
 throw new Error('unexpected '+url);};return calls;}

test('Guide audio is public but limited to fixed texts, synthesized once and then served from storage',async()=>{
 let calls=storage({cached:true});let res=await guideAudio('login_citizen');let data=await res.json();
 assert.equal(res.status,200);assert.match(data.url,/^https:\/\/db\.invalid\/storage\/v1\/object\/public\/assistant-voice\/login_citizen-[0-9a-f]{16}\.wav$/);
 assert(!calls.some(c=>c.url.includes('generativelanguage')),'cached clip costs no Gemini call');
 calls=storage();data=await (await guideAudio('profile_requests')).json();
 const upload=calls.find(c=>c.url.includes('/storage/v1/object/assistant-voice/'));assert(upload);assert.equal(upload.options.headers.authorization,'Bearer service');
 assert.match(data.url,/profile_requests-/);
 const tts=JSON.parse(calls.find(c=>c.url.includes('-tts:')).options.body);assert.match(tts.contents[0].parts[0].text,/Hồ sơ yêu cầu/);
 storage({uploadOk:false});data=await (await guideAudio('login_otp')).json();assert.equal(data.audio.mime,'audio/wav');
 calls=storage();res=await guideAudio('../../secret');assert.equal(res.status,400);assert.equal(calls.length,0);
 storage();res=await guideAudio('__proto__');assert.equal(res.status,400);
});

test('Client and server guide texts are identical',async()=>{
 const fs=await import('node:fs');const src=fs.readFileSync('portal-assistant.js','utf8');
 const clientKeys=['login_citizen','login_otp','login_member','portal_home','member_area','profile_personal','profile_card','profile_residence','profile_documents','profile_requests','profile_security'];
 // Both copies are plain constants, so evaluate them on their own.
 const start=src.indexOf('const profileGuides = {'),end=src.indexOf('function guideScript()');
 const clips=new Function(src.slice(start,end)+';return GUIDE_CLIPS;')();
 assert.deepEqual(Object.keys(clips).sort(),[...clientKeys].sort());
 const server=(await import('node:fs')).readFileSync('supabase/functions/gemini-assistant/index.ts','utf8');
 const sStart=server.indexOf('const ASK_HINT'),sEnd=server.indexOf('// Public, but limited');
 const serverClips=new Function('env',server.slice(sStart,sEnd)+';return GUIDE_CLIPS;')(()=>'' );
 assert.deepEqual(serverClips,clips);
});

test('Only allowlisted female voices are used; unknown voices fall back to the default and get their own cache entry',async()=>{
 const voiceOf=calls=>JSON.parse(calls.find(c=>c.url.includes('-tts:')).options.body).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
 const call=voice=>handler(new Request('https://fn.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'guide_audio',key:'portal_home',voice})}));
 let calls=storage();let a=await (await call('Aoede')).json();assert.equal(voiceOf(calls),'Aoede');
 calls=storage();let b=await (await call('Puck')).json();assert.equal(voiceOf(calls),'Leda');
 calls=storage();let d=await (await call(undefined)).json();assert.equal(voiceOf(calls),'Leda');
 assert.notEqual(a.url,b.url);assert.equal(b.url,d.url);
 const ask2=backend({citizen:'c-1'});const base=globalThis.fetch;globalThis.fetch=async(url,o)=>{if(url.includes('-tts:')){ask2.push({url,options:o});return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/wav',data:'UklGRg=='}}]}}]});}return base(url,o);};
 await (await ask({audio:true,voice:'Sulafat'})).json();assert.equal(voiceOf(ask2),'Sulafat');
});
