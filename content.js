'use strict';
(() => {
  const A=window.GocViet;
  const legacyDecode=A.decode;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));
  A.cleanProfile=value=>value&&typeof value==='object'?{name:String(value.name||'').slice(0,80),role:String(value.role||'').slice(0,100),task:String(value.task||'').slice(0,800),memberKey:A.roster.some(r=>r.key===value.memberKey)?value.memberKey:'',updatedAt:String(value.updatedAt||'')}:null;
  A.safeImage=src=>typeof src==='string' && /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(src) && src.length<4500000;
  A.cleanBoard=input=>{
    const height=clamp(input?.height||540,280,1600),diagram=A.cleanDiagram(input,height),images=[];
    for(const raw of (Array.isArray(input?.images)?input.images:[]).slice(0,30)){
      if(!raw || !A.safeImage(raw.src))continue;
      const w=clamp(raw.w||300,60,960),h=clamp(raw.h||200,40,height);
      images.push({id:typeof raw.id==='string'?raw.id:A.uid(),src:raw.src,alt:String(raw.alt||'').slice(0,180),x:clamp(raw.x,0,960-w),y:clamp(raw.y,0,height-h),w,h});
    }
    return {...diagram,images,height};
  };
  A.elText=html=>{const el=document.createElement('div');el.innerHTML=A.sanitize(html);return el.textContent||'';};
  A.textBlock=(html='')=>({id:A.uid(),type:'text',html:A.sanitize(html)});
  A.visualBlock=(board={})=>({id:A.uid(),type:'visual',caption:'',board:A.cleanBoard(board)});
  A.cleanBlocks=blocks=>{
    const result=[],ids=new Set();
    for(const block of (Array.isArray(blocks)?blocks:[]).slice(0,120)){
      if(!block || !['text','visual'].includes(block.type))continue;
      let id=typeof block.id==='string'?block.id:A.uid();if(ids.has(id))id=A.uid();ids.add(id);
      result.push(block.type==='text'?{id,type:'text',html:A.sanitize(block.html||'')}:{id,type:'visual',caption:String(block.caption||'').slice(0,200),board:A.cleanBoard(block.board)});
    }
    return result.length?result:[A.textBlock()];
  };
  A.decode=content=>{
    try{const data=JSON.parse(content);if(data?.format==='gocviet-v2')return {blocks:A.cleanBlocks(data.blocks),author:A.cleanProfile(data.author)};}catch(_){}
    const data=legacyDecode(content),blocks=[A.textBlock(data.html)];
    if(data.diagram.nodes.length)blocks.push(A.visualBlock(data.diagram));
    return {blocks,author:null};
  };
  A.encode=(blocks,author)=>JSON.stringify({format:'gocviet-v2',blocks:A.cleanBlocks(blocks),author:A.cleanProfile(author)});
  A.hasContent=blocks=>blocks.some(b=>b.type==='visual'?(b.board.nodes.length||b.board.images.length):A.elText(b.html).trim());
  // Reading and presentation must resolve the same private draft for its owner.
  A.readSection=async section=>{
    const published={...section,blocks:A.decode(section.content).blocks,isDraft:false},userId=A.user?.id;
    if(!userId||!A.canEdit(section))return published;
    try{
      let draft=await A.drafts.get('v2:'+userId+':'+section.slug);
      if(!draft){const old=JSON.parse(localStorage.getItem('gocviet:draft:'+userId+':'+section.slug)||'null');if(old)draft={title:old.title,blocks:A.decode(JSON.stringify({format:'gocviet-v1',html:old.html,diagram:old.diagram})).blocks};}
      if(!draft||A.user?.id!==userId||!A.canEdit(section))return published;
      const blocks=A.cleanBlocks(draft.blocks),title=draft.title||section.title;
      if(!A.hasContent(blocks))return published;
      const comparable=value=>JSON.stringify(value.map(({id,...block})=>block));
      if(comparable(blocks)===comparable(published.blocks)&&title===section.title)return published;
      return {...published,title,blocks,isDraft:true};
    }catch{return published;}
  };
  A.renderBoard=(board)=>{
    const frame=A.el('div','visual-reader'),canvas=A.el('div','visual-canvas'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    canvas.style.height=board.height+'px';svg.id='edges-'+A.uid();svg.classList.add('diagram-edges');svg.style.height=board.height+'px';svg.setAttribute('viewBox',`0 0 960 ${board.height}`);canvas.append(svg);A.drawEdges(svg,board);
    for(const item of board.images){const img=A.el('img','board-image-read');img.src=item.src;img.alt=item.alt||'Ảnh minh họa';img.loading='lazy';Object.assign(img.style,{left:item.x+'px',top:item.y+'px',width:item.w+'px',height:item.h+'px'});canvas.append(img);}
    for(const node of board.nodes)canvas.append(A.nodeElement(node));
    frame.append(canvas);
    let ro=new ResizeObserver(()=>{if(!frame.isConnected){ro.disconnect();return;}const scale=frame.clientWidth/960;canvas.style.transform=`scale(${scale})`;frame.style.height=board.height*scale+'px';});ro.observe(frame);
    frame.cleanup=()=>ro.disconnect();return frame;
  };
  A.renderBlocks=(parent,blocks)=>{
    for(const block of blocks){
      if(block.type==='text'){const text=A.el('div','section-body');text.innerHTML=A.sanitize(block.html);parent.append(text);}
      else {const figure=A.el('figure','visual-figure');figure.append(A.renderBoard(block.board));if(block.caption)figure.append(A.el('figcaption','',block.caption));parent.append(figure);}
    }
  };
  A.loadImage=async file=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Chọn ảnh JPG, PNG hoặc WebP.');
    if(file.size>15*1024*1024)throw new Error('Ảnh quá lớn. Hãy chọn ảnh dưới 15 MB.');
    const url=URL.createObjectURL(file),img=new Image();
    try{
      img.src=url;await img.decode();const ratio=Math.min(1,1600/img.naturalWidth,1600/img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const src=canvas.toDataURL('image/webp',.82);if(!A.safeImage(src))throw new Error('Ảnh quá lớn sau khi tối ưu. Hãy chọn ảnh nhỏ hơn.');
      const scale=Math.min(400/canvas.width,340/canvas.height,1);
      return {id:A.uid(),src,alt:file.name.replace(/\.[^.]+$/,''),x:40,y:40,w:Math.round(canvas.width*scale),h:Math.round(canvas.height*scale)};
    }finally{URL.revokeObjectURL(url);}
  };
  let database;
  const openDB=()=>database||(database=new Promise((resolve,reject)=>{const request=indexedDB.open('nhom12-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};}));
  const transaction=async(mode,key,value)=>{const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('drafts');const request=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(value,key);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Không lưu được bản nháp'));});};
  A.drafts={get:key=>transaction('get',key),put:(key,value)=>transaction('put',key,value),delete:key=>transaction('delete',key)};
})();
