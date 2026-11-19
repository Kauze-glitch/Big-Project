import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,20));
const source=fs.readFileSync('portal-assistant.js','utf8');

function page({member=false,citizen=false,hash='#/login',body='<form id="citizen-login"></form>',fetchImpl,preload,voices=[{lang:'vi-VN',name:'Tiếng Việt'}]}={}){
 const dom=new JSDOM(`<div id="portal-app"><main id="portal-main">${body}</main></div>`,{url:'https://fixture.invalid/portal.html'+hash,runScripts:'outside-only'}),w=dom.window,spoken=[],requests=[],utterances=[];
 w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 w.speechSynthesis={getVoices:()=>voices,cancel(){},speak(u){spoken.push(u.text);utterances.push(u);u.onend?.();}};preload?.(w);
 const state={member,citizen};
 w.PortalAuth={isMember:()=>state.member,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:'member-token'}}})}})};
 w.PortalAPI={url:'https://api.invalid',key:'publishable',memberId:()=>state.member?'one':null};
 w.CitizenRepository={hasCitizenSession:()=>state.citizen,citizenAccessToken:async()=>'citizen-token'};
 w.fetch=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return fetchImpl?fetchImpl():{ok:true,json:async()=>({answer:'Bước 1: vào Hồ sơ yêu cầu.'})};};
 w.eval(source);
 return {w,d:w.document,spoken,requests,utterances,state,close:()=>w.close()};
}

test('Guests can hear login steps read aloud but cannot open the AI box',async()=>{
 const p=page();try{
  assert.equal(p.d.querySelector('.va-ask').hidden,true);
  p.d.querySelector('.va-listen').click();await tick();
  const said=p.spoken.join(' ');assert.match(said,/12 chữ số/);assert.match(said,/mật khẩu/);assert.doesNotMatch(said,/Hỏi trợ lý/);
 }finally{p.close();}
});

test('OTP step guidance mentions Telegram and reads visible error messages',async()=>{
 const p=page({body:'<form id="otp-form"></form><p role="alert">Mã xác thực chưa đúng.</p>'});try{
  p.d.querySelector('.va-listen').click();await tick();const said=p.spoken.join(' ');
  assert.match(said,/Telegram/);assert.match(said,/Mã xác thực chưa đúng/);
 }finally{p.close();}
});

test('Verified citizen asks by text: request uses guide mode and citizen token, answer is shown as text and spoken',async()=>{
 const p=page({citizen:true,hash:'#/profile/requests',body:'<h1>Hồ sơ yêu cầu</h1>'});try{
  const ask=p.d.querySelector('.va-ask');assert.equal(ask.hidden,false);ask.click();
  p.d.querySelector('#va-question').value='Làm sao sửa địa chỉ?';p.d.querySelector('.va-form').requestSubmit();await tick();
  assert.equal(p.requests.length,1);const r=p.requests[0];
  assert.equal(r.url,'https://api.invalid/functions/v1/gemini-assistant');assert.equal(r.options.headers.authorization,'Bearer citizen-token');
  assert.deepEqual({operation:r.body.operation,question:r.body.question,page:r.body.page},{operation:'guide',question:'Làm sao sửa địa chỉ?',page:'Hồ sơ yêu cầu'});
  assert.match(p.d.querySelector('.va-log').textContent,/Bước 1: vào Hồ sơ yêu cầu/);assert(p.spoken.some(t=>/Bước 1/.test(t)));
  assert.equal(p.d.querySelector('.va-model:last-child p').innerHTML.includes('<'),false);
 }finally{p.close();}
});

test('Model HTML is shown as plain text and server errors are read out',async()=>{
 const p=page({member:true,fetchImpl:()=>({ok:false,json:async()=>({error:'Bạn đã hỏi nhiều lần. Hãy nghỉ một lát rồi hỏi lại.'})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='<img src=x onerror=alert(1)>';p.d.querySelector('.va-form').requestSubmit();await tick();
  assert.equal(p.requests[0].options.headers.authorization,'Bearer member-token');assert.equal(p.d.querySelector('.va-log img'),null);
  assert.match(p.d.querySelector('.va-status').textContent,/nhiều lần/);assert(p.spoken.some(t=>/nhiều lần/.test(t)));
 }finally{p.close();}
});

test('Signing out hides the AI box and clears the conversation',async()=>{
 const p=page({citizen:true});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Mã OTP ở đâu?';p.d.querySelector('.va-form').requestSubmit();await tick();
  assert.match(p.d.querySelector('.va-log').textContent,/Mã OTP ở đâu/);
  p.state.citizen=false;p.w.dispatchEvent(new p.w.HashChangeEvent('hashchange'));
  assert.equal(p.d.querySelector('.va-ask').hidden,true);assert.equal(p.d.querySelector('.va-panel').hidden,true);assert.doesNotMatch(p.d.querySelector('.va-log').textContent,/Mã OTP ở đâu/);
 }finally{p.close();}
});

// Fake microphone: each start() is recorded; the test decides what was "heard".
function withMic(options={}){
 const mics=[];
 const p=(()=>{const dom=page({...options,citizen:true,hash:'#/profile/requests',body:'<h1>Hồ sơ yêu cầu</h1>',preload:w=>{w.SpeechRecognition=class{constructor(){mics.push(this);}start(){this.started=true;}abort(){this.aborted=true;}};}});return dom;})();
 const hear=(text)=>{const r=mics.at(-1);r.onresult?.({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});r.onend();};
 return {...p,mics,hear};
}

test('One press opens the assistant and starts listening; the spoken question is sent and the answer read aloud',async()=>{
 const p=withMic();try{
  p.d.querySelector('.va-ask').click();
  assert.equal(p.d.querySelector('.va-panel').hidden,false);assert.equal(p.mics.length,1);assert(p.mics[0].started);
  assert.equal(p.mics[0].lang,'vi-VN');assert.equal(p.d.querySelector('.va-state').dataset.state,'listening');
  p.hear('Làm sao sửa địa chỉ');await tick();
  assert.equal(p.requests.length,1);assert.equal(p.requests[0].body.question,'Làm sao sửa địa chỉ');
  assert(p.spoken.some(t=>/Bước 1/.test(t)));
 }finally{p.close();}
});

test('Continuous mode listens again after the answer; turning it off stops after one answer',async()=>{
 const p=withMic();try{
  p.d.querySelector('.va-ask').click();p.hear('Mã xác thực ở đâu');await tick();
  assert.equal(p.mics.length,2,'listens again after answering');assert.equal(p.d.querySelector('.va-state').dataset.state,'listening');
  p.mics[1].onend();assert.equal(p.d.querySelector('.va-state').dataset.state,'idle','silence does not loop');assert.equal(p.mics.length,2);
  const toggle=p.d.querySelector('[name=continuous]');toggle.checked=false;toggle.dispatchEvent(new p.w.Event('change'));
  p.d.querySelector('.va-mic').click();p.hear('Cảm ơn');await tick();
  assert.equal(p.mics.length,3);assert.equal(p.d.querySelector('.va-state').dataset.state,'idle');
 }finally{p.close();}
});

test('Natural Vietnamese voices are preferred and speaking speed is remembered',async()=>{
 const p=withMic({voices:[{lang:'vi-VN',name:'Microsoft An - Vietnamese (Vietnam)',localService:true},{lang:'vi-VN',name:'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)',localService:false},{lang:'en-US',name:'Google US English'}]});try{
  const rate=p.d.querySelector('[name=rate]');rate.value='0.75';rate.dispatchEvent(new p.w.Event('change'));
  p.d.querySelector('.va-listen').click();await tick();
  assert.match(p.utterances[0].voice.name,/HoaiMy/);assert.equal(p.utterances[0].rate,0.75);
  assert.equal(JSON.parse(p.w.localStorage.getItem('nhom12-voice')).rate,0.75);
  assert.deepEqual([...p.d.querySelectorAll('[name=voice] option')].map(o=>o.value).slice(2),['Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)','Microsoft An - Vietnamese (Vietnam)']);
 }finally{p.close();}
});

test('AI answer opens the page it names, highlights the control, and says where the user is',async()=>{
 const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1><button id="new-citizen-request">Gửi yêu cầu</button>',fetchImpl:()=>({ok:true,json:async()=>({answer:'Mình đã mở trang Hồ sơ yêu cầu. Bước 1: bấm Gửi yêu cầu.',target:'profile_requests'})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Tôi muốn sửa địa chỉ';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();
  assert.equal(p.w.location.hash,'#/profile/requests');
  assert(p.d.getElementById('new-citizen-request').classList.contains('va-spotlight'));
  assert.match(p.d.querySelector('.va-nav').textContent,/Hồ sơ yêu cầu/);assert(p.spoken.some(t=>/Bước 1/.test(t)));
 }finally{p.close();}
});

test('A target outside the user role or unknown is ignored',async()=>{
 for(const target of ['admin','javascript:alert(1)','__proto__']){
  const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',fetchImpl:()=>({ok:true,json:async()=>({answer:'Trả lời.',target})})});try{
   p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Câu hỏi';p.d.querySelector('.va-form').requestSubmit();await tick();
   assert.equal(p.w.location.hash,'#/profile/personal',target);assert.equal(p.d.querySelector('.va-nav'),null);
  }finally{p.close();}
 }
});

test('When the AI is unavailable, keywords still take the user to the right page with a spoken guide',async()=>{
 const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1><form id="citizen-password-form"></form>',fetchImpl:()=>({ok:false,json:async()=>({error:'Chưa cấu hình Gemini trên máy chủ.'})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Tôi quên mật khẩu thì làm sao';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();
  assert.equal(p.w.location.hash,'#/profile/security');assert(p.d.getElementById('citizen-password-form').classList.contains('va-spotlight'));
  assert.match(p.d.querySelector('.va-log').textContent,/Bảo mật tài khoản/);assert(p.spoken.some(t=>/mật khẩu/.test(t)));
  assert.equal(p.d.querySelector('.va-status').textContent,'');
 }finally{p.close();}
});

test('Keyword fallback does not confuse "như thế nào" with the ID card or "đăng nhập" with data import',async()=>{
 const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',fetchImpl:()=>({ok:false,json:async()=>({error:'Lỗi.'})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Làm như thế nào để đăng nhập';p.d.querySelector('.va-form').requestSubmit();await tick();
  assert.equal(p.w.location.hash,'#/profile/personal');assert.match(p.d.querySelector('.va-status').textContent,/Lỗi/);
 }finally{p.close();}
});

// Records every real playback (the silent unlock clip is ignored); ended fires only if the source did not change.
function audioStub(w,{fail=false}={}){const played=[];w.Audio=class{constructor(src){this.src=src||'';}play(){const src=this.src;if(fail){const e=new Error('blocked');e.name='NotAllowedError';return Promise.reject(e);}if(!(src.startsWith('data:audio/wav;base64,')&&src.length>500))played.push({src,playing:true});setTimeout(()=>{if(this.src===src)this.onended?.();},0);return Promise.resolve();}pause(){this.paused=true;}};return played;}

test('Answers with server audio play the natural female voice instead of the device voice',async()=>{
 let played;const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',preload:w=>{played=audioStub(w);},fetchImpl:()=>({ok:true,json:async()=>({answer:'Xin chào bạn.',target:'none',audio:{mime:'audio/wav',data:'UklGRg=='}})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Chào';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();
  assert.equal(p.requests[0].body.audio,true);
  assert.equal(played.length,1);assert.equal(played[0].src,'data:audio/wav;base64,UklGRg==');assert(played[0].playing);
  assert.equal(p.spoken.length,0,'device voice not used');assert.equal(p.d.querySelector('.va-state').dataset.state,'idle');
  p.d.querySelector('.va-model:last-child .va-again').click();await tick();assert.equal(played.length,2,'replay uses the same natural voice');
 }finally{p.close();}
});

test('Blocked audio playback falls back to the device voice; turning AI voice off asks for no audio',async()=>{
 const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',preload:w=>audioStub(w,{fail:true}),fetchImpl:()=>({ok:true,json:async()=>({answer:'Bước 1: mở trang.',target:'none',audio:{mime:'audio/wav',data:'UklGRg=='}})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Câu hỏi';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();
  assert(p.spoken.some(t=>/Bước 1/.test(t)));
  const voice=p.d.querySelector('[name=voice]');voice.value='';voice.dispatchEvent(new p.w.Event('change'));
  p.d.querySelector('#va-question').value='Câu khác';p.d.querySelector('.va-form').requestSubmit();await tick();
  assert.equal(p.requests[1].body.audio,false);assert.equal(JSON.parse(p.w.localStorage.getItem('nhom12-voice')).aiVoice,false);
 }finally{p.close();}
});

test('Device voice prefers a Vietnamese female voice over a male one',async()=>{
 const p=page({voices:[{lang:'vi-VN',name:'Microsoft NamMinh Online (Natural) - Vietnamese (Vietnam)',localService:false},{lang:'vi-VN',name:'Microsoft An - Vietnamese (Vietnam)',localService:true},{lang:'vi-VN',name:'Google Tiếng Việt',localService:false}]});try{
  p.d.querySelector('.va-listen').click();await tick();assert.equal(p.utterances[0].voice.name,'Google Tiếng Việt');
 }finally{p.close();}
});

test('"Nghe hướng dẫn" plays the recorded female voice, then reads current errors with the device voice',async()=>{
 let played;const p=page({body:'<form id="otp-form"></form><p role="alert">Mã xác thực chưa đúng.</p>',preload:w=>{played=audioStub(w);},fetchImpl:()=>({ok:true,json:async()=>({url:'https://api.invalid/storage/v1/object/public/assistant-voice/login_otp-abc.wav'})})});try{
  p.d.querySelector('.va-listen').click();await tick();await tick();
  assert.deepEqual(p.requests[0].body,{operation:'guide_audio',key:'login_otp'});assert.equal(p.requests[0].options.headers.authorization,undefined);
  assert.equal(played[0].src,'https://api.invalid/storage/v1/object/public/assistant-voice/login_otp-abc.wav');
  assert.equal(p.spoken.join(' '),'Có thông báo: Mã xác thực chưa đúng.');
  p.d.querySelector('.va-listen').click();await tick();await tick();assert.equal(p.requests.length,1,'clip URL is cached');
 }finally{p.close();}
});

test('A clip URL outside the project storage is ignored and the device voice reads the guide',async()=>{
 let played;const p=page({preload:w=>{played=audioStub(w);},fetchImpl:()=>({ok:true,json:async()=>({url:'https://evil.invalid/x.wav'})})});try{
  p.d.querySelector('.va-listen').click();await tick();await tick();
  assert.equal(played.length,0);assert.match(p.spoken.join(' '),/12 chữ số/);
 }finally{p.close();}
});

test('Blocked autoplay is explained on screen and an answer without audio says the device voice is used',async()=>{
 const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',preload:w=>audioStub(w,{fail:true}),fetchImpl:()=>({ok:true,json:async()=>({answer:'Bước 1.',target:'none',audio:{mime:'audio/wav',data:'UklGRg=='}})})});try{
  p.d.querySelector('.va-ask').click();p.d.querySelector('#va-question').value='Hỏi';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();
  assert.match(p.d.querySelector('.va-status').textContent,/chặn phát giọng AI/);assert(p.spoken.some(t=>/Bước 1/.test(t)));
 }finally{p.close();}
 const q=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',fetchImpl:()=>({ok:true,json:async()=>({answer:'Trả lời.',target:'none'})})});try{
  q.d.querySelector('.va-ask').click();q.d.querySelector('#va-question').value='Hỏi';q.d.querySelector('.va-form').requestSubmit();await tick();
  assert.match(q.d.querySelector('.va-status').textContent,/Chưa tạo được giọng AI/);
 }finally{q.close();}
});

test('A click unlocks one shared audio element that later plays the delayed AI answer',async()=>{
 const elements=[];let plays=[];const p=page({citizen:true,hash:'#/profile/personal',body:'<h1>Thông tin cá nhân</h1>',preload:w=>{w.Audio=class{constructor(){elements.push(this);this.src='';}play(){plays.push(this.src.slice(0,30));return Promise.resolve();}pause(){}};},fetchImpl:async()=>{await tick();return {ok:true,json:async()=>({answer:'Xin chào.',target:'none',audio:{mime:'audio/wav',data:'UklGRg=='}})};}});try{
  p.d.querySelector('.va-ask').click();
  assert.equal(elements.length,1);assert.match(plays[0],/^data:audio\/wav;base64,/,'silent unlock played inside the click');
  p.d.querySelector('#va-question').value='Chào';p.d.querySelector('.va-form').requestSubmit();await tick();await tick();await tick();
  assert.equal(elements.length,1,'same element reused');assert.equal(plays.at(-1),'data:audio/wav;base64,UklGRg==');
 }finally{p.close();}
});

test('Voice picker offers the female AI voice first, labels device voices, and "Nghe thử" plays the selected voice',async()=>{
 let played;const p=page({voices:[{lang:'vi-VN',name:'Microsoft An - Vietnamese (Vietnam)',localService:true}],preload:w=>{played=audioStub(w);},fetchImpl:()=>({ok:true,json:async()=>({url:'https://api.invalid/storage/v1/object/public/assistant-voice/portal_home-1.wav'})})});try{
  const select=p.d.querySelector('[name=voice]');
  assert.deepEqual([...select.options].map(o=>o.textContent),['Giọng nữ AI tự nhiên (khuyên dùng)','Giọng của máy: tự chọn','Giọng của máy: An (nam)']);
  assert.equal(select.value,'ai');
  p.d.querySelector('.va-try').click();await tick();await tick();
  assert.deepEqual(p.requests[0].body,{operation:'guide_audio',key:'portal_home'});assert.match(played.at(-1).src,/portal_home/);assert.equal(p.spoken.length,0);
  select.value='Microsoft An - Vietnamese (Vietnam)';select.dispatchEvent(new p.w.Event('change'));
  p.d.querySelector('.va-try').click();await tick();assert.deepEqual(p.spoken,['Bạn đang ở Cổng công dân.']);
  const saved=JSON.parse(p.w.localStorage.getItem('nhom12-voice'));assert.equal(saved.aiVoice,false);assert.equal(saved.voice,'Microsoft An - Vietnamese (Vietnam)');
 }finally{p.close();}
});

test('On Brave the microphone is hidden and the user is told to type instead',()=>{
 const p=page({citizen:true,preload:w=>{Object.defineProperty(w.navigator,'brave',{value:{isBrave:async()=>true}});w.SpeechRecognition=class{start(){throw new Error('must not start');}};}});try{
  assert.equal(p.d.querySelector('.va-mic').hidden,true);assert.match(p.d.querySelector('.va-label').textContent,/Brave không hỗ trợ nói/);
  assert.match(p.d.querySelector('.va-ask').textContent,/Hỏi trợ lý/);
  p.d.querySelector('.va-ask').click();assert.equal(p.d.querySelector('.va-state').dataset.state,'idle');
 }finally{p.close();}
});
