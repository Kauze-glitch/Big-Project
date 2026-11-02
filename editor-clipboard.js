'use strict';
(() => {
  const A=window.GocViet,types=['image/png','image/jpeg','image/webp'];
  // Read during the trusted paste event; never request clipboard permission or fetch file/remote URLs.
  A.captureClipboard=data=>{
    const files=[...data.files];
    if(!files.length)for(const item of data.items||[])if(item.kind==='file'){const file=item.getAsFile();if(file)files.push(file);}
    return {html:data.getData('text/html'),text:data.getData('text/plain'),rtf:data.getData('text/rtf'),files};
  };
  A.clipboardHasImages=data=>data.files.some(f=>f.type.startsWith('image/'))||/<(?:img|v:imagedata)\b/i.test(data.html)||/\\pict\b/.test(data.rtf);
  function rtfImages(rtf){
    if(rtf.length>12*1024*1024)throw new Error('Nội dung sao chép quá lớn. Hãy dán từng phần hoặc nhập file .docx.');
    const files=[];let start=0;
    while(files.length<13&&(start=rtf.indexOf('{\\pict',start))!==-1){
      let depth=1,p=start+1,body='';
      for(;p<rtf.length&&depth;p++){
        const char=rtf[p];
        if(char==='\\'&&/[{}\\]/.test(rtf[p+1]||'')){p++;continue;}
        if(char==='{'){if(depth===1)body+=' ';depth++;continue;}if(char==='}'){depth--;if(depth===1)body+=' ';continue;}
        if(depth===1)body+=char;
      }
      start=p;if(depth||/\\bin\d/.test(body))continue;
      const type=/\\pngblip\b/.test(body)?'image/png':/\\jpegblip\b/.test(body)?'image/jpeg':null;if(!type)continue;
      const hex=body.replace(/\\[a-z]+-?\d* ?/gi,'').replace(/\s/g,'');
      if(!hex||hex.length%2||!/^[\da-f]+$/i.test(hex))continue;
      const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
      files.push(new File([bytes],'Ảnh từ Word.'+(type==='image/png'?'png':'jpg'),{type}));
    }
    return files;
  }
  A.prepareClipboard=async data=>{
    if(data.html.length>1000000||data.text.length>1000000)throw new Error('Nội dung sao chép quá dài. Hãy dán từng phần.');
    const template=document.createElement('template');template.innerHTML=data.html;
    const pictures=[...template.content.querySelectorAll('img, v\\:imagedata')],warnings=new Set(),blocks=[];
    let files=data.files.filter(f=>types.includes(f.type)),cursor=0,html='',imageCount=0;
    if(data.files.some(f=>f.type.startsWith('image/')&&!types.includes(f.type)))warnings.add('Một định dạng ảnh không được hỗ trợ. Hãy chuyển sang PNG/JPG hoặc nhập .docx.');
    if(!files.length&&/\\pict\b/.test(data.rtf))files=rtfImages(data.rtf);
    if(files.length>12||pictures.length>12)throw new Error('Mỗi lần dán hỗ trợ tối đa 12 ảnh. Hãy chia nhỏ nội dung.');
    const loaded=new Map();
    const flush=()=>{const clean=A.sanitize(html);if(A.elText(clean).trim()||/<(?:table|hr)\b/.test(clean))blocks.push(A.textBlock(clean));html='';};
    const imageBlock=async(file,alt)=>{const image=await A.loadImage(file);image.id=A.uid();image.alt=(alt||'Ảnh từ Word').slice(0,180);blocks.push(A.visualBlock({height:Math.max(280,image.h+80),images:[image]}));imageCount++;};
    const picture=async img=>{
      const src=img.getAttribute('src')||'',key=src||'image-'+cursor;let file=loaded.get(key);
      if(!file){
        if(A.safeImage(src)){
          const [header,base64]=src.split(','),binary=atob(base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
          file=new File([bytes],'Ảnh từ Word',{type:header.slice(5,header.indexOf(';'))});
        }else file=files[cursor++];
        if(file)loaded.set(key,file);
      }
      if(file)await imageBlock(file,img.getAttribute('alt'));else warnings.add('Word chưa cung cấp dữ liệu của một ảnh/sơ đồ. Dùng “Nhập Word” với file .docx hoặc sao chép riêng ảnh đó.');
    };
    for(const node of [...template.content.childNodes]){
      if(node.nodeType===3){html+=A.el('p','',node.textContent).outerHTML;continue;}if(node.nodeType!==1)continue;
      const images=[...node.querySelectorAll('img, v\\:imagedata')];if(node.matches('img, v\\:imagedata'))images.unshift(node);
      for(const img of images)img.remove();if(!node.matches('img, v\\:imagedata'))html+=node.outerHTML;
      if(images.length){flush();if(node.tagName==='TABLE')warnings.add('Ảnh trong bảng được đặt sau bảng để dễ bố trí.');for(const img of images)await picture(img);}
    }
    flush();
    if(!blocks.some(b=>b.type==='text')&&data.text.trim())blocks.unshift(A.textBlock(A.el('div','',data.text).outerHTML.replace(/\r?\n/g,'<br>')));
    // Browsers can expose a bitmap without an HTML <img>. Keep the accompanying text too.
    if(!pictures.length)for(const file of files)await imageBlock(file);
    if(!blocks.length)throw new Error('Không đọc được nội dung clipboard. Hãy thử “Nhập Word” với file .docx.');
    if(blocks.length>118||A.encode(blocks,null).length>4500000)throw new Error('Nội dung vượt dung lượng trang. Hãy dán từng phần hoặc giảm kích thước ảnh.');
    return {blocks,imageCount,warnings:[...warnings]};
  };
  // Construct the whole replacement before changing editor state, including both ends of a selection.
  A.spliceClipboard=(blocks,incoming,blockId,area,range)=>{
    const next=structuredClone(blocks),index=next.findIndex(b=>b.id===blockId);
    if(index<0||next[index].type!=='text'||!area.isConnected||!area.contains(range.startContainer)||!area.contains(range.endContainer))throw new Error('Vị trí dán đã thay đổi. Hãy đặt lại con trỏ rồi dán lại.');
    const before=document.createRange(),after=document.createRange();before.selectNodeContents(area);before.setEnd(range.startContainer,range.startOffset);after.selectNodeContents(area);after.setStart(range.endContainer,range.endOffset);
    const left=A.el('div'),right=A.el('div');left.append(before.cloneContents());right.append(after.cloneContents());
    next.splice(index,1,{...next[index],html:A.sanitize(left.innerHTML)},...incoming,A.textBlock(right.innerHTML));return next;
  };
})();
