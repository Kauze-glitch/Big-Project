'use strict';
(() => {
  const A=window.GocViet,R=window.ReportExport,$=id=>document.getElementById(id);
  let busy=false,loaded=false,sections=[],prepared=null,pdfDoc=null,pdfTask=null,pdfRender=null,pdfPage=1,pdfSession=0,selectionVersion=0;
  const scripts=new Map(),buttons=['export-word','export-pdf','preview-pdf'];
  $('report-title').value=A.projectTitle;
  function chosen(){return [...$('report-sections').querySelectorAll('input:checked')].map(el=>sections.find(s=>s.slug===el.value)).filter(Boolean);}
  function controls(){const disabled=busy||!loaded||!chosen().length||!$('report-title').value.trim()||!$('report-group').value.trim();buttons.forEach(id=>$(id).disabled=disabled);$('refresh-report').disabled=busy;for(const el of document.querySelectorAll('.report-options input,.report-options textarea'))el.disabled=busy;}
  function members(){const profiles=A.memberProfiles(),used=new Set();const result=A.roster.map(member=>{const match=profiles.find(p=>p.profile?.memberKey===member.key);if(match)used.add(match.owner);return match?.profile?.name?match.profile:member;});profiles.filter(p=>p.profile?.name&&!used.has(p.owner)).forEach(p=>result.push(p.profile));return result;}
  function reportBase(){return {title:$('report-title').value.trim(),group:$('report-group').value.trim(),cover:$('include-cover').checked,toc:$('include-toc').checked,members:members(),date:new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})};}
  function label(text){return A.el('p','',text);}
  function renderPreview(){
    const version=++selectionVersion,target=$('report-preview');target.querySelectorAll('.visual-reader').forEach(el=>el.cleanup?.());target.replaceChildren();target.setAttribute('aria-busy','false');
    const selected=chosen(),base=reportBase();$('report-count').textContent=selected.length+' / '+sections.length+' phần';controls();
    if(!selected.length){target.append(A.el('div','report-empty','Chọn ít nhất một phần để tạo báo cáo.'));return;}
    if(base.cover){const cover=A.el('article','report-paper report-cover');cover.append(A.el('p','cover-subtitle','BÁO CÁO ĐỀ TÀI'),A.el('h1','',base.title),A.el('h2','',base.group));const table=A.el('table','report-team'),head=A.el('tr');for(const text of ['Họ và tên','Vai trò','Nhiệm vụ'])head.append(A.el('th','',text));table.append(head);for(const member of base.members){const row=A.el('tr');for(const text of [member.name,member.role||'Thành viên',member.task||''])row.append(A.el('td','',text));table.append(row);}cover.append(table,label(base.date));target.append(cover);}
    if(base.toc){const toc=A.el('article','report-paper');toc.append(A.el('h2','','Mục lục'));const list=A.el('ol');selected.forEach((s,i)=>{const li=A.el('li'),link=A.el('a','',s.title||'Chưa đặt tiêu đề');link.href='#report-section-'+i;li.append(link);list.append(li);});toc.append(list);target.append(toc);}
    selected.forEach((s,i)=>{const page=A.el('article','report-paper');page.id='report-section-'+i;page.append(A.el('h2','',`${i+1}. ${s.title||'Chưa đặt tiêu đề'}`));const decoded=A.decode(s.content);for(const block of decoded.blocks){if(block.type==='text'){const div=A.el('div');div.innerHTML=A.sanitize(block.html);page.append(div);}else{const figure=A.el('figure');figure.dataset.boardId=block.id;figure.append(label('Ảnh / sơ đồ sẽ xuất cùng bố cục đã lưu.'));if(block.caption)figure.append(A.el('figcaption','',block.caption));page.append(figure);}}if(!A.hasContent(decoded.blocks))page.append(label('Chưa có nội dung được đăng.'));target.append(page);});
    // Draw only the current preview; changing the selection invalidates older work.
    (async()=>{for(const [index,s] of selected.entries()){for(const b of A.decode(s.content).blocks){if(b.type!=='visual')continue;try{const image=await R.boardImage(b.board);if(version!==selectionVersion)return;const figure=[...$('report-section-'+index).querySelectorAll('figure')].find(el=>el.dataset.boardId===b.id);if(figure){const img=A.el('img');img.src=image.src;img.alt=b.caption||'Ảnh và sơ đồ';figure.firstChild.replaceWith(img);}}catch(error){if(version===selectionVersion)$('report-error').textContent=error.message;}}}})();
  }
  function changed(){prepared=null;$('report-error').textContent='';$('report-status').textContent='Chọn định dạng để tải báo cáo.';renderPreview();}
  async function load(){
    if(busy)return;busy=true;loaded=false;prepared=null;selectionVersion++;controls();$('report-status').textContent='Đang tải các phần và thứ tự đã lưu…';$('report-error').textContent='';$('report-preview').setAttribute('aria-busy','true');
    try{await A.load();if(A.sectionOrderAvailable===false)throw new Error('Chưa tải được thứ tự các phần. Hãy thử lại để xuất đúng thứ tự đã lưu.');sections=structuredClone(A.sections);if(!sections.length)throw new Error('Website chưa có phần nào để xuất.');const box=$('report-sections');box.replaceChildren();for(const s of sections){const row=A.el('label','section-choice'),input=A.el('input');input.type='checkbox';input.value=s.slug;input.checked=true;input.addEventListener('change',changed);const text=A.el('span','',s.title||'Chưa đặt tiêu đề');text.append(A.el('small','',A.progressLabels[A.progressValue(s.progress_status)]));row.append(input,text);box.append(row);}loaded=true;$('report-status').textContent='Đã lấy nội dung đã đăng. Sẵn sàng xuất báo cáo.';renderPreview();}
    catch(error){$('report-error').textContent=error.message;$('report-status').textContent='Chưa thể xuất. Bấm “Tải nội dung mới nhất” để thử lại.';$('report-preview').setAttribute('aria-busy','false');}
    finally{busy=false;controls();}
  }
  function loadScript(name){if(scripts.has(name))return scripts.get(name);const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>done(new Error('Tải công cụ xuất quá lâu. Kiểm tra mạng rồi thử lại.')),25000);function done(error){clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();}script.src=name;script.onload=()=>done();script.onerror=()=>done(new Error('Không tải được công cụ xuất. Hãy kiểm tra kết nối rồi thử lại.'));document.head.append(script);}).catch(e=>{scripts.delete(name);throw e;});scripts.set(name,promise);return promise;}
  async function data(){if(!prepared)prepared=await R.prepare(chosen(),text=>$('report-status').textContent=text);return {...reportBase(),sections:prepared};}
  function download(blob,extension){const url=URL.createObjectURL(blob),link=A.el('a');link.href=url;link.download='Bao-cao-Nhom-12-'+new Date().toISOString().slice(0,10)+'.'+extension;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function pdfBlob(report){await loadScript('pdfmake-report.min.js');await loadScript('report-fonts.js');return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Báo cáo quá lớn hoặc có bảng không thể dàn trang. Hãy thử xuất ít phần hơn.')),60000);try{window.pdfMake.createPdf(R.pdfDefinition(report)).getBlob(blob=>{clearTimeout(timer);resolve(blob);});}catch(e){clearTimeout(timer);reject(e);}});}
  async function exportReport(kind){
    if(busy||!loaded||!chosen().length)return;busy=true;controls();$('report-error').textContent='';$('report-status').textContent='Đang chuẩn bị báo cáo…';
    try{const report=await data();$('report-status').textContent='Đang tạo '+(kind==='word'?'Word':'PDF')+'…';
      if(kind==='word'){await loadScript('docx-report.js');const blob=await window.docx.Packer.toBlob(R.wordDocument(report));download(blob,'docx');$('report-status').textContent='Đã tạo Word. Trong Word, cập nhật mục lục bằng chuột phải → Update Field để bổ sung số trang mục lục.';}
      else{const blob=await pdfBlob(report);if(kind==='preview'){await openPdfPreview(blob);$('report-status').textContent='PDF đã sẵn sàng để xem trước.';}else{download(blob,'pdf');$('report-status').textContent=report.toc?'Đã tạo PDF với mục lục và số trang.':'Đã tạo PDF với số trang.';}}
    }catch(error){console.error('Report export failed:',error);$('report-error').textContent='Chưa xuất được báo cáo. '+(error.message||'Hãy kiểm tra ảnh, bảng hoặc thử chọn ít phần hơn.');$('report-status').textContent='Nội dung trên website vẫn được giữ nguyên.';}
    finally{busy=false;controls();}
  }
  for(const id of ['report-title','report-group'])$(id).addEventListener('input',changed);
  for(const id of ['include-cover','include-toc'])$(id).addEventListener('change',changed);
  $('refresh-report').onclick=load;$('export-word').onclick=()=>exportReport('word');$('export-pdf').onclick=()=>exportReport('pdf');$('preview-pdf').onclick=()=>exportReport('preview');$('close-pdf').onclick=()=>$('pdf-dialog').close();
  async function showPdfPage(pageNumber){
    if(!pdfDoc||pdfRender)return;const token=pdfSession;const doc=pdfDoc;
    $('pdf-prev').disabled=$('pdf-next').disabled=true;
    try{const page=await doc.getPage(pageNumber);if(token!==pdfSession)return;
      const canvas=$('pdf-canvas'),original=page.getViewport({scale:1}),displayWidth=Math.max(250,Math.min(850,$('pdf-pages').clientWidth-32)),scale=displayWidth/original.width*Math.min(2,devicePixelRatio||1),viewport=page.getViewport({scale});
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=displayWidth+'px';canvas.style.height='auto';
      pdfRender=page.render({canvasContext:canvas.getContext('2d'),viewport});await pdfRender.promise;
      if(token!==pdfSession)return;pdfPage=pageNumber;canvas.setAttribute('aria-label','Trang '+pdfPage+' / '+doc.numPages);$('pdf-page-label').textContent='Trang '+pdfPage+' / '+doc.numPages;$('pdf-pages').scrollTop=0;
    }catch(error){if(token===pdfSession)$('pdf-preview-error').textContent='Chưa hiển thị được trang. Bạn vẫn có thể đóng cửa sổ và tải PDF.';}
    finally{if(token===pdfSession){pdfRender=null;$('pdf-prev').disabled=pdfPage<=1;$('pdf-next').disabled=pdfPage>=doc.numPages;}}
  }
  async function openPdfPreview(blob){
    const token=++pdfSession;pdfPage=1;$('pdf-page-label').textContent='Đang mở PDF…';$('pdf-preview-error').textContent='';$('pdf-prev').disabled=$('pdf-next').disabled=true;$('pdf-dialog').showModal();
    try{const pdfjs=await import('./report-pdf.module.js');if(token!==pdfSession)return;pdfjs.GlobalWorkerOptions.workerSrc=new URL('report-pdf.worker.js',location.href).href;
      pdfTask=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useWasm:false});const doc=await pdfTask.promise;if(token!==pdfSession){doc.destroy();return;}pdfDoc=doc;await showPdfPage(1);
    }catch(error){if(token===pdfSession){$('pdf-preview-error').textContent='Chưa tải được trình xem PDF. Đóng cửa sổ và bấm Tải PDF để mở bằng ứng dụng khác.';$('pdf-page-label').textContent='Không tải được bản xem trước';}}
  }
  $('pdf-prev').onclick=()=>showPdfPage(pdfPage-1);$('pdf-next').onclick=()=>showPdfPage(pdfPage+1);
  $('pdf-dialog').addEventListener('close',()=>{pdfSession++;pdfRender?.cancel();pdfRender=null;pdfTask?.destroy();pdfTask=null;pdfDoc=null;$('pdf-canvas').width=0;$('preview-pdf').focus();});
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  load();
})();
