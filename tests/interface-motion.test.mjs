import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const wait=()=>new Promise(r=>setTimeout(r,20));
test('Shared dialog preference follows the saved toggle and storage changes',()=>{
 const dom=new JSDOM('<body data-interface="portal"><dialog><button>Đóng</button></dialog></body>',{url:'https://fixture.invalid/portal.html',runScripts:'outside-only'}),w=dom.window;
 try{w.localStorage.setItem('nhom12-motion','off');w.eval(fs.readFileSync('site-polish.js','utf8'));assert.equal(w.document.documentElement.dataset.motion,'off');w.localStorage.setItem('nhom12-motion','on');w.dispatchEvent(new w.StorageEvent('storage',{key:'nhom12-motion'}));assert.equal(w.document.documentElement.dataset.motion,'on');}finally{w.close();}
});

test('Native dialog opening animates once; closing and removal cancel effects without delaying native state',async()=>{
 const dom=new JSDOM('<body data-interface="portal"><dialog><button>Đóng</button></dialog></body>',{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window,d=w.document,calls=[];
 try{
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.Element.prototype.animate=function(){const effect={target:this,cancelled:false,cancel(){this.cancelled=true;}};calls.push(effect);return effect;};w.eval(fs.readFileSync('motion.js','utf8'));
  const dialog=d.querySelector('dialog');dialog.setAttribute('open','');await wait();assert.equal(calls.length,1);assert.equal(calls[0].target,dialog);
  dialog.removeAttribute('open');assert.equal(dialog.open,false);await wait();assert(calls[0].cancelled);
  dialog.setAttribute('open','');await wait();assert.equal(calls.length,2);dialog.remove();await wait();assert(calls[1].cancelled);assert.equal(dialog.isConnected,false);
 }finally{w.close();}
});

test('Disabling shared motion cancels portal entry and prevents dialog effects until explicitly enabled',async()=>{
 const dom=new JSDOM('<body data-interface="portal"><main></main><dialog></dialog></body>',{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window,d=w.document,calls=[];
 try{
  w.matchMedia=()=>({matches:false});w.Element.prototype.animate=function(){const a={cancelled:false,cancel(){this.cancelled=true;}};calls.push(a);return a;};w.eval(fs.readFileSync('motion.js','utf8'));
  d.querySelector('main').innerHTML='<div class="arrive">Hồ sơ công dân</div>';await wait();assert.equal(calls.length,1);
  w.Nhom12Motion.setPreference('off');assert(calls[0].cancelled);d.querySelector('dialog').setAttribute('open','');await wait();assert.equal(calls.length,1);
  w.Nhom12Motion.setPreference('on');d.querySelector('dialog').removeAttribute('open');await wait();d.querySelector('dialog').setAttribute('open','');await wait();assert.equal(calls.length,2);
 }finally{w.close();}
});
