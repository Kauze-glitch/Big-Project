import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
test('Mobile contents toggle supports escape and closes on navigation without changing link targets',()=>{
 const d=new JSDOM('<aside class="sidebar"><a class="brand" href="index.html">Nhóm 12</a><nav class="section-nav" id="section-nav"><a href="#part1">Phần 1</a></nav></aside>',{url:'https://fixture.invalid/',runScripts:'outside-only'});
 try{d.window.matchMedia=()=>({matches:true});d.window.eval(fs.readFileSync('site-polish.js','utf8'));const doc=d.window.document,b=doc.querySelector('button');assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(b.getAttribute('aria-controls'),'section-nav');b.click();assert.equal(b.getAttribute('aria-expanded'),'true');doc.querySelector('nav').dispatchEvent(new d.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(doc.activeElement,b);b.click();const link=doc.querySelector('nav a');link.click();assert.equal(link.getAttribute('href'),'#part1');assert.equal(b.getAttribute('aria-expanded'),'false');}finally{d.window.close();}
});
test('All website entry pages load the shared interface finish',()=>{for(const p of ['index','section','editor','report','database','portal']){const s=fs.readFileSync(p+'.html','utf8');assert.match(s,/data-interface="\w+"/);assert.match(s,/site-polish\.css\?v=20261102-site1/);assert.match(s,/site-polish\.js\?v=20261102-site1/);}});
