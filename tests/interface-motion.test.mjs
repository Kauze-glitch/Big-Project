import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const wait=()=>new Promise(r=>setTimeout(r,20));
async function page({reduced=false,off=false,supported=true,preference}={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://fixture.invalid/index.html',runScripts:'outside-only'}),w=dom.window,d=w.document,animations=[];
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:reduced});w.structuredClone=structuredClone;
 if(off)w.localStorage.setItem('nhom12-motion','off');
 if(preference)w.localStorage.setItem('nhom12-motion',preference);
 if(supported)w.Element.prototype.animate=function(frames,options){const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
 const el=(tag,cls='',text)=>{const x=d.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x;};
 w.GocViet={el,$:id=>d.getElementById(id),user:null,sections:[1,2,3].map(i=>({slug:'phan'+i,title:'Phần '+i,content:'Nội dung '+i})),roster:[],memberProfiles:()=>[],isMember:()=>false,canEdit:()=>false,load:async()=>{},decode:content=>({blocks:[{text:content}]}),renderBlocks:(target,blocks)=>target.append(el('p','section-body',blocks.map(b=>b.text).join(' '))),navItem:section=>el('a','nav-item',section.title),progressBadge:()=>el('span','','Đã đăng')};
 const errors=[];w.addEventListener('error',e=>errors.push(e.error));w.eval(fs.readFileSync('motion.js','utf8'));w.eval(fs.readFileSync('app.js','utf8'));await wait();
 return {w,d,animations,errors,close:()=>w.close()};
}
test('Rapid section changes cancel the previous effect and the motion toggle stops future effects without changing content',async()=>{
 const p=await page();try{
  p.d.querySelector('#section-nav a').click();const previous=p.animations.at(-1);assert.match(p.d.querySelector('.chapter-title').textContent,/Phần 1/);
  p.d.querySelectorAll('#section-nav a')[1].click();assert(previous.cancelled);assert.match(p.d.querySelector('.chapter-content').textContent,/Nội dung 2/);
  const toggle=[...p.d.querySelectorAll('.header-actions button')].find(b=>b.textContent.startsWith('Chuyển động:'));toggle.click();assert.equal(p.d.documentElement.dataset.motion,'off');assert.equal(p.w.localStorage.getItem('nhom12-motion'),'off');const count=p.animations.length;
  p.d.querySelectorAll('#section-nav a')[2].click();assert.equal(p.animations.length,count);assert.match(p.d.querySelector('.chapter-content').textContent,/Nội dung 3/);assert.deepEqual(p.errors,[]);
 }finally{p.close();}
});
test('Reduced motion, saved motion-off and missing animation API all preserve section navigation without effects',async()=>{
 for(const config of [{reduced:true},{off:true},{supported:false}]){const p=await page(config);try{p.d.querySelector('#section-nav a').click();assert.match(p.d.querySelector('.chapter-content').textContent,/Nội dung 1/);assert.equal(p.animations.length,0);assert.deepEqual(p.errors,[]);}finally{p.close();}}
});
test('Shared dialog preference follows the saved toggle and storage changes',()=>{
 const dom=new JSDOM('<body data-interface="portal"><dialog><button>Đóng</button></dialog></body>',{url:'https://fixture.invalid/portal.html',runScripts:'outside-only'}),w=dom.window;
 try{w.localStorage.setItem('nhom12-motion','off');w.eval(fs.readFileSync('site-polish.js','utf8'));assert.equal(w.document.documentElement.dataset.motion,'off');w.localStorage.setItem('nhom12-motion','on');w.dispatchEvent(new w.StorageEvent('storage',{key:'nhom12-motion'}));assert.equal(w.document.documentElement.dataset.motion,'on');}finally{w.close();}
});

test('System reduction is labelled honestly and explicitly enabling website motion works consistently',async()=>{
 const p=await page({reduced:true});try{
  const toggle=[...p.d.querySelectorAll('.header-actions button')].find(b=>b.textContent.startsWith('Chuyển động:'));
  assert.match(toggle.textContent,/Giảm theo thiết bị/);assert.equal(toggle.getAttribute('aria-pressed'),'false');assert.equal(p.animations.length,0);
  toggle.click();assert.equal(toggle.textContent,'Chuyển động: Bật');assert.equal(p.w.Nhom12Motion.preference(),'on');assert(p.animations.length>0);
  const count=p.animations.length;p.d.querySelector('#section-nav a').click();assert(p.animations.length>count);assert.match(p.d.querySelector('.chapter-content').textContent,/Nội dung 1/);
  toggle.click();const stopped=p.animations.length;p.d.querySelectorAll('#section-nav a')[1].click();assert.equal(p.animations.length,stopped);assert.equal(toggle.textContent,'Chuyển động: Tắt');
 }finally{p.close();}
 const saved=await page({reduced:true,preference:'on'});try{assert(saved.animations.length>0);assert.equal(saved.w.Nhom12Motion.enabled(),true);}finally{saved.close();}
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
