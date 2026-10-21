'use strict';
(() => {
  const A=window.GocViet;
  // Reject oversized archives before decompression (DOCX is a ZIP container).
  function validateArchive(buffer){
    const view=new DataView(buffer),bad=()=>{throw new Error('File không phải .docx hợp lệ, bị hỏng hoặc có mật khẩu. Hãy mở và lưu lại bằng Word.');};
    if(view.byteLength<22)bad();
    let end=-1;
    for(let p=view.byteLength-22;p>=Math.max(0,view.byteLength-65557);p--){
      if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===view.byteLength){end=p;break;}
    }
    if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))bad();
    const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
    if(!count||count>2000||offset+size>end)bad();
    let p=offset,total=0,documentFound=false;
    for(let i=0;i<count;i++){
      if(p+46>end||view.getUint32(p,true)!==0x02014b50)bad();
      const flags=view.getUint16(p+8,true),expanded=view.getUint32(p+24,true),nameLength=view.getUint16(p+28,true);
      const next=p+46+nameLength+view.getUint16(p+30,true)+view.getUint16(p+32,true);
      if(flags&1||next>end||expanded===0xffffffff)bad();
      total+=expanded;
      if(total>40*1024*1024)throw new Error('Tài liệu sau giải nén vượt quá 40 MB. Hãy giảm ảnh hoặc chia nhỏ file.');
      const name=new TextDecoder().decode(new Uint8Array(buffer,p+46,nameLength));
      if(name==='word/document.xml')documentFound=true;
      p=next;
    }
    if(!documentFound||p!==offset+size)bad();
  }
  function convert(buffer,signal){
    return new Promise((resolve,reject)=>{
      const worker=new Worker('word-worker.js?v=20261022-word1');
      const finish=(err,data)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);worker.terminate();err?reject(err):resolve(data);};
      const cancel=()=>finish(new DOMException('Đã hủy nhập Word.','AbortError'));
      const timer=setTimeout(()=>finish(new Error('Đọc tài liệu quá lâu. Hãy chia nhỏ file rồi thử lại.')),30000);
      signal.addEventListener('abort',cancel,{once:true});
      worker.onerror=()=>finish(new Error('Không tải được bộ đọc Word. Hãy tải lại trang rồi thử lại.'));
      worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data);
      if(signal.aborted)cancel();else worker.postMessage(buffer,[buffer]);
    });
  }
  async function prepare(file,signal){
    if(!/\.docx$/i.test(file.name))throw new Error('Chỉ hỗ trợ .docx. Với .doc cũ, hãy mở trong Word và lưu thành .docx.');
    if(file.size>15*1024*1024)throw new Error('File vượt quá 15 MB. Hãy giảm ảnh hoặc chia nhỏ tài liệu.');
    const buffer=await file.arrayBuffer();signal.throwIfAborted();validateArchive(buffer);
    const result=await convert(buffer,signal);signal.throwIfAborted();
    // A template is inert: imported links/images are never loaded into the page.
    const template=document.createElement('template');template.innerHTML=result.html;
    const blocks=[],warnings=new Set(result.warnings);let html='',imageCount=0;
    const flush=()=>{const clean=A.sanitize(html);if(A.elText(clean).trim()||/<(?:table|hr)\b/.test(clean))blocks.push(A.textBlock(clean));html='';};
    for(const node of template.content.childNodes){
      signal.throwIfAborted();
      if(node.nodeType===3){const p=A.el('p','',node.textContent);html+=p.outerHTML;continue;}
      if(node.nodeType!==1)continue;
      const pictures=[...node.querySelectorAll('img')];if(node.tagName==='IMG')pictures.unshift(node);
      for(const img of pictures)img.remove();
      if(node.tagName!=='IMG')html+=node.outerHTML;
      if(pictures.length)flush();
      if(pictures.length&&node.tagName==='TABLE')warnings.add('Ảnh trong bảng được tách thành khối ảnh ngay sau bảng để dễ chỉnh sửa.');
      for(const img of pictures){
        const match=/^word-image-(\d+)$/.exec(img.getAttribute('src')||'');
        const raw=match&&result.images[Number(match[1])];if(!raw)continue;
        // GIF is flattened to its first frame when optimizing for the board.
        const blob=new Blob([raw.buffer],{type:raw.type});
        let image;
        if(raw.type==='image/gif'){
          const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
          const ratio=Math.min(1,1600/bitmap.width,1600/bitmap.height);canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
          canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
          const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
          if(!png)throw new Error('Không chuyển được ảnh GIF trong tài liệu.');
          image=await A.loadImage(new File([png],'Ảnh Word.png',{type:'image/png'}));
        }else image=await A.loadImage(new File([blob],'Ảnh Word',{type:raw.type}));
        signal.throwIfAborted();image.alt=(img.getAttribute('alt')||'Ảnh từ Word').slice(0,180);
        const block=A.visualBlock({height:Math.max(280,image.h+80),images:[image]});blocks.push(block);imageCount++;
      }
      if(html.length>80000)flush();
    }
    flush();
    if(!blocks.length)throw new Error('Không tìm thấy văn bản, bảng hoặc ảnh có thể nhập trong tài liệu.');
    if(blocks.length>118||A.encode(blocks,null).length>4500000)throw new Error('Nội dung vượt giới hạn một trang. Hãy chia nhỏ tài liệu.');
    return {blocks,imageCount,warnings:[...warnings]};
  }
  A.initWordImport=bridge=>{
    const launch=A.el('button','btn btn-quiet','↥ Nhập Word');launch.type='button';launch.id='import-word';
    document.querySelector('.editor-actionbar .action-group').prepend(launch);
    const picker=A.el('input');picker.type='file';picker.accept='.docx';picker.hidden=true;document.body.append(picker);
    const dialog=A.el('dialog','dialog word-import-dialog');dialog.setAttribute('aria-labelledby','word-import-title');
    dialog.innerHTML=`<h2 id="word-import-title">Nhập từ Word</h2><p class="word-file-name"></p><p class="muted">Nhập vào bản nháp. Chỉ công khai khi bạn bấm “Lưu và hiển thị”.</p><p class="word-import-status" role="status"></p><div class="word-warnings" role="note"></div><div class="word-preview" aria-label="Xem trước nội dung Word" tabindex="0"></div><fieldset class="word-import-mode" hidden><legend>Cách nhập nội dung</legend><label><input type="radio" name="word-mode" value="append" checked> Thêm vào cuối phần hiện tại</label><label><input type="radio" name="word-mode" value="replace"> Thay thế nội dung phần hiện tại</label><p class="word-replace-note" hidden>Nội dung đang soạn sẽ được thay thế. Có thể bấm “Hoàn tác nhập Word” trước khi chuyển phần hoặc tải lại trang.</p></fieldset><div class="dialog-actions"><button type="button" class="btn btn-quiet word-cancel">Hủy</button><button type="button" class="btn word-apply" disabled>Nhập vào bản nháp</button></div>`;
    document.body.append(dialog);
    const preview=dialog.querySelector('.word-preview'),status=dialog.querySelector('.word-import-status'),apply=dialog.querySelector('.word-apply'),mode=dialog.querySelector('fieldset');
    dialog.insertBefore(mode,preview);
    dialog.querySelector('.word-replace-note').textContent='Nội dung đang soạn sẽ được thay thế. Có thể “Hoàn tác nhập Word” ngay sau khi nhập, trước lần chỉnh sửa tiếp theo hoặc khi rời trang.';
    let controller=null,context=null,pending=null;
    const clearPreview=()=>{preview.querySelectorAll('.visual-reader').forEach(el=>el.cleanup?.());preview.replaceChildren();};
    const cancel=()=>{controller?.abort();controller=null;pending=null;clearPreview();};
    dialog.addEventListener('close',()=>{cancel();launch.focus();});
    dialog.querySelector('.word-cancel').onclick=()=>dialog.close();
    dialog.querySelectorAll('[name="word-mode"]').forEach(input=>input.onchange=()=>{dialog.querySelector('.word-replace-note').hidden=dialog.querySelector('[value="replace"]').checked!==true;});
    launch.onclick=()=>{if(!bridge.allowed())return;context=bridge.context();picker.value='';picker.click();};
    picker.onchange=async()=>{
      const file=picker.files[0];if(!file||!bridge.valid(context))return;
      cancel();const active=new AbortController();controller=active;
      dialog.querySelector('.word-file-name').textContent=file.name;status.textContent='Đang đọc tài liệu…';status.classList.remove('error');
      dialog.querySelector('.word-warnings').replaceChildren();mode.hidden=true;apply.disabled=true;
      dialog.querySelector('[value="append"]').checked=true;dialog.querySelector('.word-replace-note').hidden=true;
      dialog.showModal();
      try{
        const result=await prepare(file,active.signal);if(controller!==active||!dialog.open)return;
        if(!bridge.valid(context))throw new Error('Trang hoặc nội dung đã thay đổi. Đóng cửa sổ rồi nhập lại.');
        pending=result;A.renderBlocks(preview,result.blocks);
        status.textContent=`${result.blocks.length} khối nội dung · ${result.imageCount} ảnh. Kiểm tra bản xem trước trước khi nhập.`;
        const notes=['Giữ nội dung và định dạng cơ bản; bố cục, phông chữ và SmartArt có thể khác Word. Ảnh được tách thành khối ngay sau đoạn chứa ảnh.',...result.warnings];
        notes.forEach(note=>dialog.querySelector('.word-warnings').append(A.el('p','',note)));
        mode.hidden=false;apply.disabled=false;
      }catch(error){if(active.signal.aborted)return;status.textContent=error.message;status.classList.add('error');}
    };
    apply.onclick=()=>{
      if(!pending||!bridge.valid(context)){status.textContent='Trang, tài khoản hoặc nội dung đã thay đổi. Hãy đóng và nhập lại.';status.classList.add('error');apply.disabled=true;return;}
      try{bridge.apply(pending.blocks,dialog.querySelector('[value="replace"]').checked);dialog.close();A.toast('Đã nhập Word vào bản nháp. Kiểm tra rồi bấm “Lưu và hiển thị”.');}
      catch(error){status.textContent=error.message;status.classList.add('error');}
    };
    window.addEventListener('authchange',()=>{if(dialog.open&&!bridge.valid(context))dialog.close();});
  };
})();
