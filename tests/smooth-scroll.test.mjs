import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function page(){
 const dom=new JSDOM('<body><div id="plain">Nội dung</div><div id="nested" style="overflow-y:auto"><p id="child">Nội dung trong hộp thoại</p></div><input><textarea></textarea><div contenteditable="true">Soạn thảo</div><svg id="graph"></svg></body>',{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window,d=w.document,frames=new Map();let id=0,time=0,on=true;
 Object.defineProperty(w,'scrollY',{configurable:true,writable:true,value:0});Object.defineProperty(w,'innerHeight',{configurable:true,value:600});Object.defineProperty(d.documentElement,'scrollHeight',{configurable:true,value:2600});w.scrollTo=({top})=>{w.scrollY=top;};
 const nested=d.querySelector('#nested');Object.defineProperties(nested,{clientHeight:{value:200},scrollHeight:{value:1000}});nested.scrollTop=100;nested.scrollTo=({top})=>{nested.scrollTop=top;};
 w.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};w.cancelAnimationFrame=id=>frames.delete(id);w.Nhom12Motion={enabled:()=>on};
 w.eval(fs.readFileSync('smooth-scroll.js','utf8'));
 const tick=()=>{const jobs=[...frames.values()];frames.clear();time+=16;for(const job of jobs)job(time);};
 const flush=()=>{for(let i=0;frames.size&&i<150;i++)tick();assert.equal(frames.size,0,'scroll must settle');};
 const wheel=(target,deltaY,options={})=>{const event=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY,...options});target.dispatchEvent(event);return event;};
 return {w,d,nested,frames,tick,flush,wheel,setEnabled:value=>{on=value;w.dispatchEvent(new w.Event('nhom12motionchange'));},close:()=>w.close()};
}
test('All six website entry pages load smooth scrolling after the shared motion policy',()=>{for(const name of ['index','section','editor','portal','database','report']){const s=fs.readFileSync(name+'.html','utf8');assert(s.includes('smooth-scroll.js?v=20261103-scroll2'),name);assert(s.indexOf('motion.js?')<s.indexOf('smooth-scroll.js?'),name);}});
test('Document wheel scroll interpolates, settles at the requested position and reverses immediately',()=>{
 const p=page();try{assert(p.wheel(p.d.querySelector('#plain'),240).defaultPrevented);assert.equal(p.w.scrollY,0);p.tick();assert(p.w.scrollY>0&&p.w.scrollY<240);const reverseFrom=p.w.scrollY;p.wheel(p.d.querySelector('#plain'),-20);p.flush();assert.equal(p.w.scrollY,Math.max(0,reverseFrom-20));p.wheel(p.d.querySelector('#plain'),3000);p.flush();assert.equal(p.w.scrollY,2000);}finally{p.close();}
});
test('Scrollable reading regions use their own smooth position and chain to the document only at an uncontained edge',()=>{
 const p=page();try{assert(p.wheel(p.d.querySelector('#child'),300).defaultPrevented);p.flush();assert.equal(p.nested.scrollTop,400);assert.equal(p.w.scrollY,0);p.nested.scrollTop=800;p.wheel(p.d.querySelector('#child'),120);p.flush();assert.equal(p.w.scrollY,120);p.nested.style.overscrollBehaviorY='contain';assert.equal(p.wheel(p.d.querySelector('#child'),120).defaultPrevented,false);assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,120);}finally{p.close();}
});
test('Editing, zoom gestures, horizontal scrolling and ERD wheel handlers retain native ownership',()=>{
 const p=page();try{
  for(const selector of ['input','textarea','[contenteditable]'])assert.equal(p.wheel(p.d.querySelector(selector),80).defaultPrevented,false);
  assert.equal(p.wheel(p.d.querySelector('#plain'),80,{ctrlKey:true}).defaultPrevented,false);assert.equal(p.wheel(p.d.querySelector('#plain'),20,{deltaX:120}).defaultPrevented,false);
  const graph=p.d.querySelector('#graph');graph.addEventListener('wheel',e=>e.preventDefault());assert(p.wheel(graph,80).defaultPrevented);assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,0);
 }finally{p.close();}
});
test('Keyboard, motion-off and external scrolling stop pending wheel motion',()=>{
 const p=page();try{
  const target=p.d.querySelector('#plain');p.wheel(target,240);p.tick();p.w.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'PageDown'}));assert.equal(p.frames.size,0);
  p.wheel(target,240);p.tick();p.w.scrollY=800;p.tick();assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,800);
  p.wheel(target,240);assert(p.frames.size>0);p.setEnabled(false);assert.equal(p.frames.size,0);assert.equal(p.wheel(target,120).defaultPrevented,false);
 }finally{p.close();}
});
test('Modal boundaries never animate the document behind them and detached scroll regions stop immediately',()=>{
 const p=page();try{
  const dialog=p.d.createElement('dialog');dialog.setAttribute('open','');dialog.innerHTML='<p>Nội dung hộp thoại</p>';p.d.body.append(dialog);
  assert.equal(p.wheel(dialog.querySelector('p'),120).defaultPrevented,false);assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,0);
  p.wheel(p.d.querySelector('#child'),120);assert(p.frames.size>0);p.nested.remove();p.tick();assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,0);
 }finally{p.close();}
});
test('Hovering an unfocused filter continues document momentum without changing its selection',()=>{
 const p=page();try{
  const select=p.d.createElement('select');select.innerHTML='<option value="all">Tất cả</option><option value="male">Nam</option>';p.d.body.append(select);
  p.wheel(p.d.querySelector('#plain'),80);p.tick();assert(p.wheel(select,120).defaultPrevented);p.flush();assert.equal(p.w.scrollY,200);assert.equal(select.value,'all');
  select.focus();assert(p.wheel(select,80).defaultPrevented);p.flush();assert.equal(p.w.scrollY,280);assert.equal(select.value,'all');
  const matches=select.matches.bind(select);select.matches=selector=>selector===':open'?true:matches(selector);
  assert.equal(p.wheel(select,80).defaultPrevented,false);assert.equal(p.frames.size,0);assert.equal(p.w.scrollY,280);
  select.blur();select.multiple=true;assert.equal(p.wheel(select,80).defaultPrevented,false);
  select.multiple=false;select.size=4;assert.equal(p.wheel(select,80).defaultPrevented,false);
  select.size=0;select.matches=selector=>{if(selector===':open')throw new p.w.DOMException('Unsupported selector','SyntaxError');return matches(selector);};select.focus();assert.equal(p.wheel(select,80).defaultPrevented,false);
 }finally{p.close();}
});
test('Hovering a closed select in a reading region scrolls that region instead of the page',()=>{
 const p=page();try{const select=p.d.createElement('select');select.innerHTML='<option>Tất cả nhóm tuổi</option>';p.nested.append(select);assert(p.wheel(select,160).defaultPrevented);p.flush();assert.equal(p.nested.scrollTop,260);assert.equal(p.w.scrollY,0);}finally{p.close();}
});
