import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(r=>setTimeout(r,20));
const source=fs.readFileSync('portal-assistant.js','utf8');

function page({member=false,citizen=false,hash='#/login',body='<form id="citizen-login"></form>',fetchImpl}={}){
 const dom=new JSDOM(`<div id="portal-app"><main id="portal-main">${body}</main></div>`,{url:'https://fixture.invalid/portal.html'+hash,runScripts:'outside-only'}),w=dom.window,spoken=[],requests=[];
 w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 w.speechSynthesis={getVoices:()=>[{lang:'vi-VN',name:'Tiếng Việt'}],cancel(){},speak(u){spoken.push(u.text);u.onend?.();}};
 const state={member,citizen};
 w.PortalAuth={isMember:()=>state.member,client:()=>({auth:{getSession:async()=>({data:{session:{access_token:'member-token'}}})}})};
 w.PortalAPI={url:'https://api.invalid',key:'publishable',memberId:()=>state.member?'one':null};
 w.CitizenRepository={hasCitizenSession:()=>state.citizen,citizenAccessToken:async()=>'citizen-token'};
 w.fetch=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return fetchImpl?fetchImpl():{ok:true,json:async()=>({answer:'Bước 1: vào Hồ sơ yêu cầu.'})};};
 w.eval(source);
 return {w,d:w.document,spoken,requests,state,close:()=>w.close()};
}

test('Guests can hear login steps read aloud but cannot open the AI box',()=>{
 const p=page();try{
  assert.equal(p.d.querySelector('.va-ask').hidden,true);
  p.d.querySelector('.va-listen').click();
  const said=p.spoken.join(' ');assert.match(said,/12 chữ số/);assert.match(said,/mật khẩu/);assert.doesNotMatch(said,/Hỏi trợ lý/);
 }finally{p.close();}
});

test('OTP step guidance mentions Telegram and reads visible error messages',()=>{
 const p=page({body:'<form id="otp-form"></form><p role="alert">Mã xác thực chưa đúng.</p>'});try{
  p.d.querySelector('.va-listen').click();const said=p.spoken.join(' ');
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
