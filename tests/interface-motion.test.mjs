import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const wait=()=>new Promise(r=>setTimeout(r,20));
async function page({reduced=false,off=false,supported=true}={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://fixture.invalid/index.html',runScripts:'outside-only'}),w=dom.window,d=w.document,animations=[];
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:reduced});w.structuredClone=structuredClone;
 if(off)w.localStorage.setItem('nhom12-motion','off');
 if(supported)w.Element.prototype.animate=function(frames,options){const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
 const el=(tag,cls='',text)=>{const x=d.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x;};
 w.GocViet={el,$:id=>d.getElementById(id),user:null,sections:[1,2,3].map(i=>({slug:'phan'+i,title:'Phần '+i,content:'Nội dung '+i})),roster:[],memberProfiles:()=>[],isMember:()=>false,canEdit:()=>false,load:async()=>{},decode:content=>({blocks:[{text:content}]}),renderBlocks:(target,blocks)=>target.append(el('p','section-body',blocks.map(b=>b.text).join(' '))),navItem:section=>el('a','nav-item',section.title),progressBadge:()=>el('span','','Đã đăng')};
 const errors=[];w.addEventListener('error',e=>errors.push(e.error));w.eval(fs.readFileSync('app.js','utf8'));await wait();
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
