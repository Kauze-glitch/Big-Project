import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
test('Mobile contents toggle supports escape and closes on navigation without changing link targets',()=>{
 const d=new JSDOM('<aside class="sidebar"><a class="brand" href="index.html">Nhóm 12</a><nav class="section-nav" id="section-nav"><a href="#part1">Phần 1</a></nav></aside>',{url:'https://fixture.invalid/',runScripts:'outside-only'});
 try{d.window.matchMedia=()=>({matches:true});d.window.eval(fs.readFileSync('site-polish.js','utf8'));const doc=d.window.document,b=doc.querySelector('button');assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(b.getAttribute('aria-controls'),'section-nav');b.click();assert.equal(b.getAttribute('aria-expanded'),'true');doc.querySelector('nav').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(doc.activeElement,b);b.click();const link=doc.querySelector('nav a');link.click();assert.equal(link.getAttribute('href'),'#part1');assert.equal(b.getAttribute('aria-expanded'),'false');}finally{d.window.close();}
});
test('All website entry pages load the shared interface finish',()=>{for(const p of ['index','section','editor','report','database','portal']){const s=fs.readFileSync(p+'.html','utf8');assert.match(s,/data-interface="\w+"/);assert.match(s,/site-polish\.css\?v=20261102-site1/);assert.match(s,/site-polish\.js\?v=20261103-motion2/);}});

test('Every page shell has one decorative frame and fullscreen slides keep their own frame inside the panel',()=>{
 for(const name of ['index','section','editor','report','database','portal']){
  const dom=new JSDOM(fs.readFileSync(name+'.html','utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
  try{
   w.eval(fs.readFileSync('site-polish.js','utf8'));const frames=[...d.body.children].filter(el=>el.classList.contains('floral-frame'));assert.equal(frames.length,1,name);
   assert.equal(frames[0].getAttribute('aria-hidden'),'true');assert.equal(frames[0].querySelectorAll('span').length,4);assert.equal(frames[0].querySelector('button,a,input'),null);
  }finally{w.close();}
 }
 const dom=new JSDOM('<body data-interface="project"><dialog open><div class="presentation-panel"><div class="presentation-viewport">Nội dung</div></div></dialog></body>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{
  w.eval(fs.readFileSync('site-polish.js','utf8'));const panel=d.querySelector('.presentation-panel');assert.equal(panel.querySelectorAll('.floral-frame').length,1);
  Object.defineProperty(d,'fullscreenElement',{configurable:true,value:panel});for(let i=0;i<3;i++)d.dispatchEvent(new w.Event('fullscreenchange'));
  assert.equal(panel.querySelectorAll('.floral-frame').length,1);assert.equal(panel.querySelector('.floral-frame').parentElement,panel);assert.equal(panel.querySelector('.presentation-viewport').textContent,'Nội dung');
 }finally{w.close();}
});

test('Member navigation enhances once after async route changes and supports keyboard and link dismissal',async()=>{
 const dom=new JSDOM('<div id="portal-app"></div>',{url:'https://fixture.invalid/portal.html#/admin',runScripts:'outside-only'}),w=dom.window,d=w.document,wait=()=>new Promise(r=>setTimeout(r,20));
 try{
  w.matchMedia=()=>({matches:true});w.eval(fs.readFileSync('site-polish.js','utf8'));
  const root=d.querySelector('#portal-app');assert.equal(d.querySelector('.workspace-menu-toggle'),null);
  root.innerHTML='<nav class="workspace-nav"><p class="nav-label">THÀNH VIÊN</p><a href="#/admin" aria-current="page">Hồ sơ công dân</a><a href="#/requests">Xử lý yêu cầu</a></nav>';
  await wait();let toggle=d.querySelector('.workspace-menu-toggle');assert.equal(toggle.getAttribute('aria-controls'),'workspace-links');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.match(toggle.textContent,/Hồ sơ công dân/);
  toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');d.querySelector('[href="#/requests"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,toggle);
  toggle.click();d.querySelector('[href="#/requests"]').click();assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(d.querySelector('[href="#/requests"]').getAttribute('href'),'#/requests');
  root.append(d.createElement('p'));await wait();assert.equal(d.querySelectorAll('.workspace-menu-toggle').length,1);
  root.innerHTML='<nav class="workspace-nav"><a href="#/requests" aria-current="page">Xử lý yêu cầu</a></nav>';await wait();toggle=d.querySelector('.workspace-menu-toggle');assert.match(toggle.textContent,/Xử lý yêu cầu/);assert.equal(d.querySelectorAll('#workspace-links').length,1);
  root.innerHTML='<main id="portal-main">Đăng nhập công dân</main>';await wait();assert.equal(d.querySelector('.workspace-menu-toggle'),null);
 }finally{w.close();}
});

test('Native row disclosures keep one task group open and Escape returns focus to its summary',async()=>{
 const dom=new JSDOM('<div id="portal-app"><details class="row-more"><summary>Thao tác với An</summary><button>Lịch sử An</button></details><details class="row-more"><summary>Thao tác với Bình</summary><button>Lịch sử Bình</button></details></div>',{runScripts:'outside-only'}),w=dom.window,d=w.document,wait=()=>new Promise(r=>setTimeout(r,20));
 try{w.eval(fs.readFileSync('site-polish.js','utf8'));const [first,second]=d.querySelectorAll('details');first.open=true;await wait();second.open=true;await wait();assert.equal(first.open,false);assert.equal(second.open,true);second.querySelector('button').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(second.open,false);assert.equal(d.activeElement,second.querySelector('summary'));}finally{w.close();}
});
