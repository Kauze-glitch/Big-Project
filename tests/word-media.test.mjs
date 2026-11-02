import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const png='data:image/png;base64,iVBORw0KGgo=';
function fixture(){
  const dom=new JSDOM('<body><div id="auth-dialogs"></div><div id="toast"></div><button id="login-btn"></button><button id="logout-btn"></button></body>',{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=dom.window,observers=[];
  w.CSS={supports:()=>true};
  w.structuredClone=structuredClone;w.ResizeObserver=class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  for(const path of ['shared.js','content.js','editor-clipboard.js','board.js'])w.eval(fs.readFileSync(path,'utf8'));
  const A=w.GocViet,loaded=[],loadImage=A.loadImage;A.loadImage=async file=>{loaded.push(file);return {id:A.uid(),src:png,alt:file.name,x:40,y:40,w:880,h:510};};
  return {dom,w,A,loaded,loadImage,observers,close:()=>w.close()};
}
const data=(html='',text='',files=[],rtf='')=>({html,text,files,rtf});

test('Mixed Word paste keeps styled text, table cells and the clipboard image in order',async()=>{
  const f=fixture();try{
    const file=new f.w.File(['bitmap'],'Word.png',{type:'image/png'});
    const result=await f.A.prepareClipboard(data('<p><strong>Tiêu đề</strong><span style="color:#c00000;font-size:18pt"> Nội dung</span></p><table><tr><td colspan="2">Bảng số liệu</td></tr></table><p><img src="file:///private/image.png"></p><p>Kết thúc</p>','',[file]));
    assert.equal(result.imageCount,1);assert.equal(result.blocks.length,3);assert.match(result.blocks[0].html,/<strong>Tiêu đề<\/strong>/);assert.match(result.blocks[0].html,/font-size: ?18pt/);assert.match(result.blocks[0].html,/colspan="2"/);assert.equal(result.blocks[1].type,'visual');assert.match(result.blocks[2].html,/Kết thúc/);assert.equal(result.blocks[1].board.height,590);assert.equal(f.loaded.length,1);
  }finally{f.close();}
});
test('Bitmap-only clipboard preserves its accompanying plain text and line breaks',async()=>{
  const f=fixture();try{const result=await f.A.prepareClipboard(data('','Dòng 1\nDòng 2',[new f.w.File(['x'],'picture.png',{type:'image/png'})]));assert.equal(result.blocks.length,2);assert.match(result.blocks[0].html,/Dòng 1<br>Dòng 2/);assert.equal(result.imageCount,1);}finally{f.close();}
});
test('Inline data images and repeated references are imported without network or file access',async()=>{
  const f=fixture();try{const result=await f.A.prepareClipboard(data(`<p><img src="${png}"></p><p><img src="${png}"></p>`));assert.equal(result.imageCount,2);assert.equal(f.loaded[0],f.loaded[1]);assert.notEqual(result.blocks[0].board.images[0].id,result.blocks[1].board.images[0].id);}finally{f.close();}
});
test('Word RTF picture data supplies images referenced by inaccessible file URLs',async()=>{
  const f=fixture();try{const rtf='{\\rtf1{\\pict\\pngblip\\picw100{\\*\\blipuid 0123}89504e470d0a1a0a}}',result=await f.A.prepareClipboard(data('<p>Văn bản<img src="file:///word/clip.png"></p>','',[],rtf));assert.equal(result.imageCount,1);assert.equal(f.loaded[0].type,'image/png');assert.equal(f.loaded[0].size,8);assert.match(result.blocks[0].html,/Văn bản/);}finally{f.close();}
});
test('RTF-only image paste is accepted',async()=>{
  const f=fixture();try{const result=await f.A.prepareClipboard(data('','',[],'{\\rtf1{\\pict\\jpegblip ffd8ffd9}}'));assert.equal(result.imageCount,1);assert.equal(f.loaded[0].type,'image/jpeg');}finally{f.close();}
});
test('Missing or unsupported Word diagrams give a useful warning while keeping text',async()=>{
  const f=fixture();try{const result=await f.A.prepareClipboard(data('<p>Nội dung<img src="https://untrusted.invalid/x.png"></p>'));assert.match(result.blocks[0].html,/Nội dung/);assert.equal(result.imageCount,0);assert.match(result.warnings.join(' '),/\.docx/);assert.equal(f.loaded.length,0);}finally{f.close();}
});
test('Clipboard HTML never inserts executable markup, links, or remote images',async()=>{
  const f=fixture();try{const result=await f.A.prepareClipboard(data('<p onclick="alert(1)"><b>Giữ lại</b><img src="javascript:alert(1)"></p><script>alert(2)</script><iframe src="https://evil.invalid"></iframe>'));assert.match(result.blocks[0].html,/<b>Giữ lại<\/b>/);assert.doesNotMatch(JSON.stringify(result.blocks),/onclick|<script|<iframe|javascript:/);}finally{f.close();}
});
test('Oversized paste and image decode failures reject before changing editor content',async()=>{
  const f=fixture();try{await assert.rejects(f.A.prepareClipboard(data('a'.repeat(1000001))),/quá dài/);f.A.loadImage=async()=>{throw Error('Ảnh hỏng');};await assert.rejects(f.A.prepareClipboard(data('<p>Nội dung</p>','',[new f.w.File(['x'],'broken.png',{type:'image/png'})])),/Ảnh hỏng/);}finally{f.close();}
});
test('Mixed paste replaces exactly the selected text and keeps both surrounding fragments',()=>{
  const f=fixture();try{const area=f.w.document.createElement('div');area.innerHTML='<p>trước CHỌN sau</p>';f.w.document.body.append(area);const range=f.w.document.createRange(),text=area.querySelector('p').firstChild;range.setStart(text,6);range.setEnd(text,10);const original=[f.A.textBlock(area.innerHTML)],next=f.A.spliceClipboard(original,[f.A.textBlock('<p>DÁN</p>')],original[0].id,area,range);assert.equal(next.length,3);assert.equal(f.A.elText(next[0].html),'trước ');assert.equal(f.A.elText(next[1].html),'DÁN');assert.equal(f.A.elText(next[2].html),' sau');assert.match(original[0].html,/CHỌN/);area.remove();assert.throws(()=>f.A.spliceClipboard(original,[],original[0].id,area,range),/Vị trí dán/);}finally{f.close();}
});
test('Single-image readers crop unused board space without changing saved positions',()=>{
  const f=fixture();try{const board=f.A.cleanBoard({height:540,images:[{id:'img',src:png,x:40,y:40,w:400,h:240}]}),before=JSON.stringify(board),bounds=f.A.boardBounds(board);assert.equal(bounds.w,416);assert.equal(bounds.h,256);assert.equal(bounds.x,32);const reader=f.A.renderBoard(board);f.w.document.body.append(reader);Object.defineProperty(reader.querySelector('.visual-window'),'clientWidth',{value:832});f.observers[0].fn();assert.equal(reader.querySelector('.visual-window').style.height,'512px');assert.match(reader.querySelector('.visual-canvas').style.transform,/scale\(2\)/);assert.equal(JSON.stringify(board),before);reader.cleanup();assert(f.observers[0].disconnected);}finally{f.close();}
});
test('Zoom controls open, enlarge, reset and close with independent SVG marker IDs',()=>{
  const f=fixture();try{const board=f.A.cleanBoard({nodes:[{id:'a',text:'A',x:10,y:10},{id:'b',text:'B',x:300,y:120}],edges:[{from:'a',to:'b'}]}),reader=f.A.renderBoard(board);f.w.document.body.append(reader);reader.querySelector('button').click();const dialog=f.w.document.querySelector('.visual-zoom-dialog'),buttons=[...dialog.querySelectorAll('button')],svg=dialog.querySelector('svg');assert(dialog.open);assert.notEqual(svg.id,reader.querySelector('svg').id);assert.equal(svg.querySelector('marker').id,svg.id+'-arrow');buttons.find(b=>b.textContent==='+').click();assert.equal(dialog.querySelector('.visual-zoom-head span').textContent,'125%');buttons.find(b=>b.textContent==='100%').click();assert.equal(dialog.querySelector('.visual-zoom-head span').textContent,'100%');buttons.find(b=>b.textContent==='Đóng').click();assert.equal(f.w.document.querySelector('.visual-zoom-dialog'),null);reader.cleanup();}finally{f.close();}
});
test('Image fitting keeps aspect ratio and grows the board instead of clipping tall images',()=>{
  const f=fixture();try{const host=f.w.document.createElement('div');f.w.document.body.append(host);const board=f.A.cleanBoard({height:540,images:[{id:'img',src:png,w:200,h:500,x:0,y:0}]}),editor=new f.A.BoardEditor(host,board,()=>{},()=>{});editor.pick('image','img');[...host.querySelectorAll('button')].find(b=>b.textContent==='Vừa chiều rộng').click();const image=board.images[0];assert.equal(image.h/image.w,2.5);assert(image.w>200);assert(image.y+image.h<=board.height);assert(board.height<=1600);assert.equal(Number(editor.heightInput.value),board.height);}finally{f.close();}
});
test('Every content reader loads viewer CSS and the editor loads clipboard support before its handler',()=>{
  for(const page of ['index','section','editor','report']){const html=fs.readFileSync(page+'.html','utf8');assert.match(html,/media-viewer\.css\?v=20261102-word2/);assert.match(html,/content\.js\?v=20261102-word2/);if(page==='editor')assert(html.indexOf('editor-clipboard.js')<html.indexOf('src="editor.js'));}
});
test('New images retain higher source resolution and start at readable width without distorting aspect ratio',async()=>{
  const f=fixture();try{let canvas;f.w.Image=class{naturalWidth=3200;naturalHeight=1600;async decode(){}};f.w.URL.createObjectURL=()=> 'blob:fixture';f.w.URL.revokeObjectURL=()=>{};f.w.HTMLCanvasElement.prototype.getContext=function(){canvas=this;return {drawImage(){}};};f.w.HTMLCanvasElement.prototype.toDataURL=()=>png;const image=await f.loadImage(new f.w.File(['png'],'Diagram.png',{type:'image/png'}));assert.equal(canvas.width,2560);assert.equal(canvas.height,1280);assert.equal(image.w,880);assert.equal(image.h,440);await assert.rejects(f.loadImage(new f.w.File(['svg'],'unsafe.svg',{type:'image/svg+xml'})),/JPG, PNG hoặc WebP/);}finally{f.close();}
});
test('Exported Word/PDF image uses the same cropped image bounds as the reader',async()=>{
  const f=fixture();try{const calls=[];f.w.HTMLCanvasElement.prototype.getContext=()=>({scale(){},translate:(...args)=>calls.push(args),fillRect(){},drawImage(){}});f.w.HTMLCanvasElement.prototype.toDataURL=()=>png;f.w.Image=class{naturalWidth=800;naturalHeight=480;async decode(){}};f.w.eval(fs.readFileSync('report-core.js','utf8'));const result=await f.w.ReportExport.boardImage({height:540,images:[{src:png,x:40,y:40,w:400,h:240}]});assert.equal(result.width,416);assert.equal(result.height,256);assert.deepEqual(calls,[[-32,-32]]);}finally{f.close();}
});
