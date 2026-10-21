'use strict';
(() => {
  const A=window.GocViet,$=A.$;
  let current=null,base=null,blocks=[],identity='',dirty=false,revision=0,persistedRevision=-1,epoch=0,saving=false,discarding=false,uploading=false,draftTimer,selection=null,activeId=null,dragId=null,fileIntent=null,lastRemoved=null,draftQueue=Promise.resolve();
  const key=()=>`v2:${identity}:${current?.slug}`;
  const owns=()=>A.canEdit(current);
  const status=(message,error=false)=>{$('editor-status').textContent=message;$('editor-status').classList.toggle('error-notice',error);};
  const fingerprint=content=>JSON.stringify(A.decode(content).blocks.map(({id,...block})=>block));
  function counts(){const text=blocks.filter(b=>b.type==='text').map(b=>{const div=document.createElement('div');div.innerHTML=b.html;return div.textContent;}).join(' ').trim();$('word-count').textContent=(text?text.split(/\s+/u).length:0)+' từ';$('document-count').textContent=blocks.length+' khối · '+blocks.filter(b=>b.type==='visual').length+' bảng ảnh / sơ đồ';}
  function saveDraft(){
    clearTimeout(draftTimer);if(!current||!dirty||!identity)return draftQueue;
    const snapshot={title:$('title-input').value,blocks:structuredClone(blocks),baseUpdatedAt:base.updated_at,baseContent:base.updated_at?undefined:base.content,updatedAt:Date.now()},draftKey=key(),version=revision;
    draftQueue=draftQueue.catch(()=>{}).then(()=>A.drafts.put(draftKey,snapshot)).then(()=>{if(current&&key()===draftKey&&revision===version){persistedRevision=version;$('draft-status').textContent='● Chưa đăng · Bản nháp được giữ trên thiết bị';}}).catch(()=>{if(current&&key()===draftKey)$('draft-status').textContent='Chưa lưu được bản nháp. Giữ trang này mở và lưu lên website.';});return draftQueue;
  }
  function change(){dirty=true;revision++;counts();$('draft-status').textContent='Đang giữ bản nháp…';clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,450);}
  function authUI(){
    $('editor-workspace').hidden=!owns();$('save-btn').disabled=!owns()||saving||uploading||discarding;$('restore-btn').disabled=saving||uploading||discarding;
    if(!A.user)status('Đăng nhập bằng tài khoản thành viên để chỉnh sửa nội dung.');
    else if(!A.isMember())status('Tài khoản này chưa được phân công trang nội dung. Bạn vẫn có thể sửa tên trong “Hồ sơ của tôi”.');
    else if(!owns())status('Trang này do thành viên khác phụ trách. Chọn trang của bạn trong thanh bên trái.');
    else status('Trang của bạn · Chèn nhiều ảnh, sơ đồ và đoạn văn theo thứ tự tùy ý.');
    document.querySelectorAll('#editor-nav button').forEach(button=>{const section=A.sections.find(s=>s.slug===button.dataset.slug);button.classList.toggle('active',current?.slug===section?.slug);button.title=A.canEdit(section)?'Trang của bạn':'Trang của thành viên khác';if(section)button.querySelector('.nav-title').textContent=section.title||'Chưa đặt tiêu đề';});
  }
  async function choose(section,restore=true){
    const token=++epoch;await saveDraft();if(token!==epoch)return;
    current=section;base=structuredClone(section);identity=A.user?.id||'';dirty=false;revision++;selection=null;activeId=null;lastRemoved=null;$('undo-remove').hidden=true;
    $('editor-workspace').hidden=true;
    blocks=A.decode(section.content).blocks;$('title-input').value=section.title;
    history.replaceState(null,'','?section='+encodeURIComponent(section.slug));$('preview-link').href='section.html?section='+encodeURIComponent(section.slug);
    if(restore&&owns()){
      try{
        let draft=await A.drafts.get(key());
        if(!draft){const old=JSON.parse(localStorage.getItem(`gocviet:draft:${identity}:${section.slug}`)||'null');if(old){const migrated=A.decode(JSON.stringify({format:'gocviet-v1',html:old.html,diagram:old.diagram}));draft={title:old.title,blocks:migrated.blocks,baseUpdatedAt:section.updated_at};}}
        if(token!==epoch||identity!==A.user?.id)return;
        if(draft){blocks=A.cleanBlocks(draft.blocks);$('title-input').value=String(draft.title||'');dirty=true;if(draft.baseUpdatedAt!==undefined)base.updated_at=draft.baseUpdatedAt;if(draft.baseContent!==undefined)base.content=draft.baseContent;}
      }catch(_){A.toast('Không đọc được bản nháp trên thiết bị. Nội dung đã lưu vẫn có sẵn.');}
    }
    if(token!==epoch)return;persistedRevision=revision;renderBlocks();$('draft-status').textContent=dirty?'● Đã khôi phục bản nháp · Chưa đăng':'Nội dung đã lưu trên website';authUI();
    if(dirty&&base.updated_at!==section.updated_at)status('Bản online đã thay đổi sau bản nháp này. Hãy xem trang đã lưu trước khi quyết định bỏ hoặc giữ bản nháp.',true);
  }
  const makeButton=(text,action,label)=>{const el=A.el('button','block-action',text);el.type='button';if(label){el.setAttribute('aria-label',label);el.title=label;}el.onclick=action;return el;};
  function gap(index){
    const el=A.el('div','insert-gap');el.dataset.index=index;
    el.append(A.el('span','gap-line'),makeButton('＋ Văn bản',()=>insert(A.textBlock(),{index})),makeButton('▧ Ảnh',()=>requestImages({index})),makeButton('⌘ Sơ đồ ở đây',()=>insert(A.visualBlock(),{index})),A.el('span','gap-line'));
    el.addEventListener('dragover',event=>{if(dragId){event.preventDefault();el.classList.add('drop-target');}});el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));
    el.addEventListener('drop',event=>{event.preventDefault();el.classList.remove('drop-target');if(!dragId)return;const from=blocks.findIndex(b=>b.id===dragId);if(from<0)return;const [item]=blocks.splice(from,1);blocks.splice(index>from?index-1:index,0,item);dragId=null;selection=null;renderBlocks();change();});return el;
  }
  function moveBlock(id,delta){const index=blocks.findIndex(b=>b.id===id),next=index+delta;if(next<0||next>=blocks.length)return;[blocks[index],blocks[next]]=[blocks[next],blocks[index]];selection=null;renderBlocks();change();}
  function removeBlock(id){const index=blocks.findIndex(b=>b.id===id);lastRemoved={block:blocks[index],index};blocks.splice(index,1);if(!blocks.length)blocks.push(A.textBlock());selection=null;renderBlocks();change();$('undo-remove').hidden=false;A.toast('Đã xóa khối. Bạn có thể bấm “Khôi phục khối” trên thanh công cụ.');}
  function renderBlocks(){
    const host=$('content-blocks');host.replaceChildren();
    blocks.forEach((block,index)=>{
      host.append(gap(index));const wrap=A.el('section','content-block '+(block.type==='visual'?'visual-block':'text-block'));wrap.dataset.id=block.id;
      const bar=A.el('div','block-bar'),handle=makeButton('⋮⋮',()=>{},'Kéo để di chuyển khối');handle.classList.add('block-drag');handle.draggable=true;
      handle.addEventListener('dragstart',event=>{dragId=block.id;event.dataTransfer.setData('text/plain',block.id);event.dataTransfer.effectAllowed='move';wrap.classList.add('dragging');});handle.addEventListener('dragend',()=>{dragId=null;wrap.classList.remove('dragging');document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));});
      const up=makeButton('↑',()=>moveBlock(block.id,-1),'Di chuyển khối lên'),down=makeButton('↓',()=>moveBlock(block.id,1),'Di chuyển khối xuống');up.disabled=index===0;down.disabled=index===blocks.length-1;
      bar.append(handle,A.el('span','block-label',String(index+1).padStart(2,'0')+' / '+(block.type==='text'?'VĂN BẢN':'ẢNH & SƠ ĐỒ')),up,down,makeButton('×',()=>removeBlock(block.id),'Xóa khối'));wrap.append(bar);
      if(block.type==='text'){
        const area=A.el('div','writing-area');area.contentEditable='true';area.setAttribute('role','textbox');area.setAttribute('aria-multiline','true');area.setAttribute('aria-label','Nội dung khối '+(index+1));area.dataset.placeholder='Viết nội dung tại đây…';area.innerHTML=block.html;
        area.addEventListener('focus',()=>{activeId=block.id;});area.addEventListener('input',event=>{A.normalizeTyping(area,event);block.html=A.sanitize(area.innerHTML);change();});
        area.addEventListener('compositionend',event=>{A.normalizeTyping(area,{inputType:'insertText',data:event.data});block.html=A.sanitize(area.innerHTML);change();});
        area.addEventListener('paste',event=>{event.preventDefault();const images=[...event.clipboardData.files].filter(f=>f.type.startsWith('image/'));if(images.length)processImages(images,captureIntent());else{const html=event.clipboardData.getData('text/html');document.execCommand(html?'insertHTML':'insertText',false,html?A.sanitize(html):event.clipboardData.getData('text/plain'));block.html=A.sanitize(area.innerHTML);change();}});
        area.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});area.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length)processImages([...event.dataTransfer.files],{index:blocks.findIndex(b=>b.id===block.id)+1});});wrap.append(area);
      }else{
        wrap.addEventListener('pointerdown',()=>{activeId=block.id;selection=null;});const host=A.el('div','board-editor');wrap.append(host);new A.BoardEditor(host,block.board,change,()=>requestImages({boardId:block.id}));
        const caption=A.el('input','board-caption');caption.placeholder='Chú thích cho ảnh / sơ đồ (không bắt buộc)';caption.setAttribute('aria-label','Chú thích bảng '+(index+1));caption.maxLength=200;caption.value=block.caption;caption.oninput=()=>{block.caption=caption.value;change();};wrap.append(caption);
      }
      host.append(wrap);
    });host.append(gap(blocks.length));counts();
  }
  function captureIntent(){return {activeId,range:selection?.range.cloneRange(),blockId:selection?.blockId};}
  function insert(block,intent=captureIntent()){
    if(!owns())return;
    if(blocks.length>=118){A.toast('Trang đã có nhiều khối. Hãy tách nội dung sang trang khác.');return;}
    const range=intent.range,sourceBlock=blocks.find(b=>b.id===intent.blockId),start=range?.startContainer,area=(start?.nodeType===1?start:start?.parentElement)?.closest('.writing-area');
    if(sourceBlock?.type==='text' && area?.isConnected && area.contains(range.startContainer)){
      const before=document.createRange(),after=document.createRange();before.selectNodeContents(area);before.setEnd(range.startContainer,range.startOffset);after.selectNodeContents(area);after.setStart(range.startContainer,range.startOffset);
      const a=A.el('div'),b=A.el('div');a.append(before.cloneContents());b.append(after.cloneContents());const index=blocks.indexOf(sourceBlock);sourceBlock.html=A.sanitize(a.innerHTML);blocks.splice(index,1,sourceBlock,block,A.textBlock(b.innerHTML));
    }else{
      const index=intent.index!==undefined?intent.index:intent.activeId?blocks.findIndex(b=>b.id===intent.activeId)+1:blocks.length;blocks.splice(Math.max(0,index),0,block);
    }
    selection=null;activeId=block.id;renderBlocks();change();
    const added=[...$('content-blocks').querySelectorAll('.content-block')].find(el=>el.dataset.id===block.id);added?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});if(block.type==='text')added?.querySelector('.writing-area').focus();
  }
  function requestImages(intent){if(!owns()||uploading)return;fileIntent={...intent,epoch};$('image-file').value='';$('image-file').click();}
  async function processImages(files,intent){
    if(!owns()||uploading)return;const token=intent.epoch??epoch;uploading=true;authUI();status('Đang tối ưu ảnh…');
    try{
      const imageFiles=files.slice(0,12),images=[];for(const file of imageFiles)images.push(await A.loadImage(file));
      if(token!==epoch||!owns()){A.toast('Bạn đã chuyển trang. Hãy thêm ảnh lại vào trang cần dùng.');return;}
      const total=JSON.stringify(blocks).length+JSON.stringify(images).length;if(total>4500000)throw new Error('Trang đang có nhiều ảnh lớn. Hãy giảm số ảnh hoặc kích thước ảnh trước khi thêm.');
      let block=intent.boardId?blocks.find(b=>b.id===intent.boardId):null;
      if(intent.boardId&&!block)throw new Error('Bảng đã được xóa. Hãy chọn vị trí khác.');
      if(!block)block=A.visualBlock();if(block.board.images.length+images.length>30)throw new Error('Mỗi bảng hỗ trợ tối đa 30 ảnh.');
      images.forEach((image,i)=>{image.x=Math.min(960-image.w,40+i*35);image.y=Math.min(block.board.height-image.h,40+i*35);block.board.images.push(image);});
      if(intent.boardId){renderBlocks();change();}else insert(block,intent);A.toast('Đã thêm ảnh. Kéo ảnh để bố trí và kéo góc ảnh để đổi kích thước.');
    }catch(error){A.toast(error.message);}finally{uploading=false;authUI();}
  }
  $('image-file').addEventListener('change',()=>{if($('image-file').files.length)processImages([...$('image-file').files],fileIntent||captureIntent());});
  $('insert-text').onclick=()=>insert(A.textBlock());$('insert-diagram').onclick=()=>insert(A.visualBlock());$('insert-image').onclick=()=>requestImages(captureIntent());
  const undo=A.el('button','btn btn-quiet','↶ Khôi phục khối');undo.id='undo-remove';undo.hidden=true;undo.onclick=()=>{if(lastRemoved){blocks.splice(Math.min(lastRemoved.index,blocks.length),0,lastRemoved.block);lastRemoved=null;undo.hidden=true;renderBlocks();change();}};document.querySelector('.insert-toolbar').append(undo);
  document.querySelectorAll('.compose-toolbar button').forEach(button=>button.addEventListener('mousedown',event=>event.preventDefault()));
  document.addEventListener('selectionchange',()=>{const sel=getSelection();if(!sel.rangeCount)return;const range=sel.getRangeAt(0),anchor=sel.anchorNode,area=(anchor?.nodeType===1?anchor:anchor?.parentElement)?.closest('.writing-area');if(area&&area.contains(sel.focusNode)){const blockId=area.closest('.content-block').dataset.id;selection={blockId,range:range.cloneRange()};activeId=blockId;}});
  A.initRichText(()=>{
    const block=blocks.find(b=>b.id===selection?.blockId);if(!block||!owns())return null;
    const wrap=[...document.querySelectorAll('.content-block')].find(el=>el.dataset.id===block.id),area=wrap?.querySelector('.writing-area');
    if(!area||!selection.range.startContainer.isConnected||!area.contains(selection.range.endContainer))return null;
    return {area,range:selection.range.cloneRange(),commit(){block.html=A.sanitize(area.innerHTML);const sel=getSelection();if(sel.rangeCount&&area.contains(sel.anchorNode)&&area.contains(sel.focusNode))selection={blockId:block.id,range:sel.getRangeAt(0).cloneRange()};change();}};
  });
  $('title-input').addEventListener('input',change);
  $('restore-btn').onclick=()=>{if(owns()&&!saving&&!uploading&&!discarding)$('discard-dialog').showModal();};$('discard-cancel').onclick=()=>{if(!discarding)$('discard-dialog').close();};
  $('discard-dialog').addEventListener('cancel',event=>{if(discarding)event.preventDefault();});
  $('discard-confirm').onclick=async()=>{
    if(!owns()||saving||discarding)return;
    const token=epoch,draftKey=key(),userId=identity,slug=current.slug;discarding=true;authUI();$('discard-confirm').disabled=true;$('discard-cancel').disabled=true;
    try{
      await A.load();
      if(token!==epoch||A.user?.id!==userId)throw new Error('Tài khoản hoặc trang đã thay đổi. Bản nháp được giữ lại.');
      const fresh=A.sections.find(s=>s.slug===slug);if(!fresh||!A.canEdit(fresh))throw new Error('Không đọc được phiên bản mới nhất. Bản nháp được giữ lại.');
      clearTimeout(draftTimer);await draftQueue;await A.drafts.delete(draftKey);localStorage.removeItem(`gocviet:draft:${userId}:${slug}`);
      dirty=false;await choose(fresh,false);$('discard-dialog').close();
    }catch(error){A.toast(error.message||'Chưa bỏ được bản nháp. Hãy thử lại.');}
    finally{discarding=false;$('discard-confirm').disabled=false;$('discard-cancel').disabled=false;authUI();}
  };
  $('save-btn').onclick=async()=>{
    if(!owns()||saving||uploading||discarding)return;const title=$('title-input').value.trim();if(!title)return A.toast('Hãy nhập tiêu đề trang.');
    const content=A.encode(blocks,A.decode(current.content).author);if(content.length>4500000)return A.toast('Nội dung ảnh quá lớn. Hãy bớt ảnh hoặc dùng ảnh nhỏ hơn.');
    const token=epoch,version=revision,saveKey=key(),target=structuredClone(base);saving=true;authUI();$('save-btn').textContent='Đang lưu…';
    try{
      const saved=await A.updateSection(target,{title,content});
      if(token===epoch){
        base=structuredClone(saved);current=A.sections.find(s=>s.slug===saved.slug);
        clearTimeout(draftTimer);await draftQueue;
        if(token===epoch&&version===revision){
          try{
            await A.drafts.delete(saveKey);
            try{localStorage.removeItem(`gocviet:draft:${identity}:${saved.slug}`);}catch(_){}
            if(token===epoch&&version===revision){dirty=false;persistedRevision=revision;$('draft-status').textContent='✓ Đã lưu văn bản, ảnh và sơ đồ';}
            else if(token===epoch)await saveDraft();
          }catch(_){if(token===epoch){dirty=true;await saveDraft();$('draft-status').textContent='Đã đăng nội dung; chưa dọn được bản nháp trên thiết bị.';}}
        }else if(token===epoch)await saveDraft();
      }
      const nav=[...document.querySelectorAll('#editor-nav button')].find(el=>el.dataset.slug===target.slug);if(nav)nav.querySelector('.nav-title').textContent=title;A.toast('Đã lưu trang nội dung.');
    }catch(error){saveDraft();A.toast(error.message);}finally{saving=false;$('save-btn').textContent='Lưu và hiển thị ↑';authUI();}
  };
  window.addEventListener('profilechange',()=>{if(current&&base&&fingerprint(current.content)===fingerprint(base.content)){base=structuredClone(current);if(dirty)saveDraft();}});
  window.addEventListener('authchange',()=>{if(!A.ready)return;const next=A.user?.id||'';if(next!==identity){const section=A.sections.find(s=>s.slug===current?.slug&&s.owner_id===next)||A.sections.find(s=>s.owner_id===next)||current||A.sections[0];if(section)choose(section);}else authUI();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft();});window.addEventListener('pagehide',saveDraft);
  window.addEventListener('beforeunload',event=>{if(uploading||saving||(dirty&&persistedRevision!==revision)){saveDraft();event.preventDefault();event.returnValue='';}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();$('save-btn').click();}});
  async function init(){try{await A.load();$('editor-nav').replaceChildren();for(const [index,section] of A.sections.entries()){const button=A.navItem(section,index,'button');button.dataset.slug=section.slug;button.onclick=()=>choose(section);$('editor-nav').append(button);}const slug=new URLSearchParams(location.search).get('section');const initial=A.sections.find(s=>s.slug===slug)||A.sections.find(s=>A.canEdit(s))||A.sections[0];if(initial)await choose(initial);else status('Chưa có trang nội dung nào.');}catch(error){status(error.message,true);const retry=A.el('button','btn btn-quiet','Thử lại');retry.onclick=init;$('editor-status').append(retry);}}
  // Rebuild only navigation so reordering never replaces unsaved editor blocks.
  window.addEventListener('sectionorderchange',()=>{
    $('editor-nav').replaceChildren();
    for(const [index,section] of A.sections.entries()){
      const button=A.navItem(section,index,'button');button.dataset.slug=section.slug;button.onclick=()=>choose(section);$('editor-nav').append(button);
    }
    authUI();
  });
  window.addEventListener('focus',async()=>{if(A.ready){await A.refreshSectionOrder();window.dispatchEvent(new Event('sectionorderchange'));}});
  init();
})();
