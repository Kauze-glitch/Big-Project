'use strict';
(() => {
 const R=window.CitizenRepository,T=window.PortalTransfer,API=window.PortalAPI,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('dialog');dialog.className='transfer-dialog';dialog.setAttribute('aria-label','Nhập dữ liệu công dân');document.body.append(dialog);
 let context=null,busy=false,epoch=0,onDone=()=>{};
 const $=id=>dialog.querySelector('#'+id);
 function controls(value){busy=value;dialog.querySelectorAll('input,button,select').forEach(el=>el.disabled=value);if(!value){const invalid=context?.preview?.some(r=>r.errors.length),valid=context?.preview?.some(r=>!r.errors.length);$('import-confirm').disabled=!valid||(invalid&&!$('import-partial').checked)||!!context?.completed;$('import-previous').disabled=!context||context.page<=1;$('import-next').disabled=!context||context.page>=Math.ceil((context.preview?.length||0)/20);}}
 function draw(){
  const rows=context?.preview||[],page=context?.page||1,valid=rows.filter(r=>!r.errors.length).length,updates=rows.filter(r=>!r.errors.length&&r.action==='update').length;
  $('import-summary').textContent=rows.length?`${rows.length} dòng · ${valid} hợp lệ · ${rows.length-valid} cần sửa · ${updates} cập nhật hồ sơ đã có`:'Chưa chọn tệp dữ liệu.';
  $('import-preview').innerHTML=rows.length?`<div class="table-wrap"><table class="citizen-table import-table"><thead><tr><th>Dòng</th><th>Họ và tên</th><th>CCCD</th><th>Thao tác</th><th>Kết quả kiểm tra</th></tr></thead><tbody>${rows.slice((page-1)*20,page*20).map(row=>`<tr class="${row.errors.length?'import-invalid':''}"><td>${row.row}</td><td>${esc(row.data?.name)}</td><td>${esc(row.data?.cccd)}</td><td>${row.action==='update'?'Cập nhật':'Thêm mới'}</td><td>${row.errors.length?row.errors.map(esc).join('<br>'):'Hợp lệ'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Dùng tệp mẫu để giữ đúng tiêu đề cột. Số CCCD và điện thoại cần đặt kiểu Text trong Excel.</div>';
  $('import-page').textContent=`Trang ${page} / ${Math.max(1,Math.ceil(rows.length/20))}`;controls(busy);
 }
 async function preview(){
  const token=++epoch,source=context;if(!source)return;controls(true);$('import-error').textContent='';$('import-progress').textContent='Đang đọc và kiểm tra dữ liệu…';
  try{
   const mode=$('import-mode').value;const rows=source.legacy?source.legacy.map((data,i)=>({row:i+2,data,localErrors:[]})):await T.readFile(source.file,mode);
   if(token!==epoch||context!==source)return;
   const checked=await R.previewImport(rows.map(({row,data})=>({row,data})),mode);if(token!==epoch||context!==source)return;
   context.mode=mode;context.preview=rows.map(r=>{const remote=checked.find(x=>x.row===r.row);return {...r,data:remote?.data||r.data,action:remote?.action||'create',expectedVersion:remote?.expectedVersion??null,errors:[...(r.localErrors||[]),...(remote?.error?[API.problem(remote.error).message]:[])]};});context.page=1;context.completed=false;context.operation=crypto.randomUUID();
   $('import-progress').textContent='Dữ liệu chưa được ghi. Kiểm tra bảng xem trước rồi xác nhận nhập.';draw();
  }catch(error){if(token===epoch){context.preview=[];$('import-error').textContent=error.message;$('import-progress').textContent='Chưa ghi thay đổi nào lên hệ thống.';draw();}}
  finally{if(token===epoch)controls(false);}
 }
 function mount({file=null,legacy=null,done=()=>{}}={}){
  epoch++;context={file,legacy,preview:[],page:1,operation:crypto.randomUUID(),completed:false};onDone=done;busy=false;
  dialog.innerHTML=`<div class="dialog-head"><div><p class="eyebrow">NHẬP DỮ LIỆU CÔNG DÂN</p><h2>Kiểm tra trước khi nhập</h2><p>Hệ thống kiểm tra lại trên máy chủ khi ghi dữ liệu. Tối đa 500 dòng, tệp dưới 10 MB.</p></div><button id="import-close" class="close-btn" aria-label="Đóng nhập dữ liệu">×</button></div><div class="dialog-body"><div class="transfer-filebar"><label class="field"><span>Tệp dữ liệu</span><input id="import-file" type="file" accept=".xlsx,.csv"></label><label class="field"><span>Cách nhập</span><select id="import-mode"><option value="create">Chỉ thêm hồ sơ mới</option><option value="merge">Thêm mới và cập nhật hồ sơ trùng CCCD</option></select></label><button id="import-recheck" class="btn secondary small">Kiểm tra lại</button></div><p id="import-filename" class="small-text"></p><p class="transfer-warning">${legacy?'Dữ liệu cũ được lấy từ trình duyệt hiện tại. Mật khẩu chung và trạng thái tài khoản cũ không được chuyển lên máy chủ; hãy cấp tài khoản riêng sau khi nhập.':'Nhận sheet đầu tiên của Excel. Ngày dùng YYYY-MM-DD hoặc DD/MM/YYYY. Không nhập mật khẩu hay trạng thái tài khoản qua tệp.'}</p><div class="transfer-template"><span>Tệp mẫu có một dòng minh họa:</span><button id="template-xlsx" class="btn secondary small">Tải mẫu Excel</button><button id="template-csv" class="btn secondary small">Tải mẫu CSV</button></div><p id="import-progress" role="status"></p><p id="import-error" class="error" role="alert"></p><strong id="import-summary"></strong><div id="import-preview"></div><div class="pagination"><span id="import-page"></span><div><button id="import-previous" class="btn secondary small">Trang trước</button><button id="import-next" class="btn secondary small">Trang sau</button></div></div><label class="transfer-partial"><input id="import-partial" type="checkbox"> Chỉ nhập các dòng hợp lệ và bỏ qua dòng lỗi. Nếu không chọn, có lỗi sẽ hủy toàn bộ đợt nhập.</label></div><div class="dialog-actions"><button id="import-cancel" class="btn secondary">Đóng</button><button id="import-confirm" class="btn" disabled>Xác nhận nhập dữ liệu</button></div>`;
  $('import-filename').textContent=file?.name||(legacy?'Nguồn: dữ liệu cũ trên trình duyệt':'');
  $('import-file').onchange=()=>{if(!$('import-file').files.length)return;context={file:$('import-file').files[0],legacy:null,page:1,preview:[],operation:crypto.randomUUID(),completed:false};$('import-filename').textContent=context.file.name;preview();};
  $('import-mode').onchange=()=>{if(context.file||context.legacy)preview();};$('import-recheck').onclick=()=>{if(context.file||context.legacy)preview();};
  for(const id of ['import-close','import-cancel'])$(id).onclick=()=>{if(!busy)dialog.close();};
  $('import-partial').onchange=()=>controls(false);$('import-previous').onclick=()=>{context.page--;draw();};$('import-next').onclick=()=>{context.page++;draw();};
  for(const [id,format] of [['template-xlsx','xlsx'],['template-csv','csv']])$(id).onclick=async()=>{try{await T.exportRecords([T.example()],format,'Mau-nhap-ho-so-cong-dan');}catch(e){$('import-error').textContent=e.message;}};
  $('import-confirm').onclick=async()=>{
   if(busy||context.completed||!context.preview.some(r=>!r.errors.length))return;controls(true);$('import-error').textContent='';$('import-progress').textContent='Đang ghi dữ liệu. Nếu kết nối gián đoạn, có thể thử lại an toàn với cùng mã đợt nhập.';
   const partial=$('import-partial').checked,rows=context.preview.map(r=>({row:r.row,data:r.data,expectedVersion:r.expectedVersion,clientErrors:r.localErrors||[]}));
   try{
    const result=await R.commitImport(rows,context.mode||'create',String(context.file?.name||'du-lieu-cu-trinh-duyet.csv').slice(0,180),context.operation,partial);
    context.completed=true;$('import-progress').textContent=`Đã nhập: ${result.created} hồ sơ mới, ${result.updated} hồ sơ cập nhật; ${result.failed} dòng lỗi. Mã đợt: ${result.batchId}.`;
    for(const row of context.preview){const outcome=result.rows.find(x=>x.row===row.row);row.errors=outcome?.error?[API.problem(outcome.error).message]:[];}
    draw();await onDone(result);
   }catch(error){$('import-error').textContent=error.message;$('import-progress').textContent=error.portalCode==='IMPORT_HAS_ERRORS'?'Đã hủy toàn bộ đợt nhập. Không có hồ sơ nào được ghi.':'Chưa xác nhận được kết quả. Hãy thử lại với cùng tệp và mã đợt nhập để tránh tạo trùng.';if(error.detail?.rows){for(const row of context.preview){const result=error.detail.rows.find(x=>x.row===row.row);if(result?.error)row.errors=[API.problem(result.error).message];}draw();}}
   finally{controls(false);}
  };
  dialog.showModal();draw();if(file||legacy)preview();
 }
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>{epoch++;context=null;});
 window.addEventListener('portalauthchange',()=>{if(!window.PortalAuth?.isMember()){epoch++;busy=false;if(dialog.open)dialog.close();}});
 window.PortalImport=Object.freeze({open:options=>mount(options),openLegacy:done=>mount({legacy:R.legacyRows(),done})});
})();
