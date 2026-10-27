'use strict';
(() => {
  const A=window.GocViet;
  let state=null,available=false,loadTask=null;
  const sort=()=>{
    const positions=new Map((state?.slugs||[]).map((slug,index)=>[slug,index]));
    A.sections.sort((a,b)=>(positions.get(a.slug)??Infinity)-(positions.get(b.slug)??Infinity)||a.slug.localeCompare(b.slug));
  };
  async function request(query){
    const controller=new AbortController();let timer;
    try{return await Promise.race([query.abortSignal(controller.signal),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Kết nối chậm. Hãy mở lại bảng sắp xếp để kiểm tra trạng thái đã lưu.'));},10000);})]);}
    finally{clearTimeout(timer);}
  }
  A.refreshSectionOrder=async()=>{
    available=false;
    try{
      const {data,error}=await request(A.db.from('section_order').select('slugs,version').eq('id',1).single());
      if(error||!data||!Array.isArray(data.slugs))throw new Error();
      state=data;available=true;
    }catch{ /* Keep published sections readable before the database migration is installed. */ }
    A.sectionOrderAvailable=available;sort();refreshButton();
  };
  const originalLoad=A.load;
  A.load=()=>{
    if(!loadTask)loadTask=(async()=>{await originalLoad();await A.refreshSectionOrder();return A.sections;})().finally(()=>loadTask=null);
    return loadTask;
  };
  const button=A.el('button','btn btn-quiet section-order-launch','↕ Sắp xếp các phần');
  button.type='button';button.hidden=true;
  (document.getElementById('section-nav')||document.getElementById('editor-nav')).after(button);
  function refreshButton(){button.hidden=!A.isMember();button.disabled=A.sections.length<2;}
  const dialog=A.el('dialog','dialog section-order-dialog');
  dialog.setAttribute('aria-label','Sắp xếp các phần');
  dialog.innerHTML='<h2>Sắp xếp các phần</h2><p>Dùng nút lên / xuống để thay đổi thứ tự. Khi lưu, mục lục, nút chuyển phần và trình chiếu sẽ dùng thứ tự mới cho mọi người.</p><ol class="section-order-list"></ol><p class="section-order-error error" role="alert"></p><p class="sr-only order-announcement" role="status"></p><div class="dialog-actions"><button type="button" class="btn btn-quiet order-cancel">Hủy</button><button type="button" class="btn order-save">Lưu thứ tự</button></div>';
  document.body.append(dialog);
  const list=dialog.querySelector('ol'),error=dialog.querySelector('.section-order-error'),save=dialog.querySelector('.order-save'),cancel=dialog.querySelector('.order-cancel');
  let draft=[],version=0,initial='',busy=false,token=0;
  const changed=()=>JSON.stringify(draft.map(s=>s.slug))!==initial;
  function draw(focusSlug,direction){
    list.replaceChildren();
    draft.forEach((section,index)=>{
      const row=A.el('li','section-order-row');
      row.append(A.el('span','order-number',String(index+1).padStart(2,'0')),A.el('span','order-title',section.title||'Chưa đặt tiêu đề'));
      for(const [label,delta,symbol] of [['Lên',-1,'↑'],['Xuống',1,'↓']]){
        const move=A.el('button','btn btn-quiet',symbol);move.type='button';move.setAttribute('aria-label',label+': '+section.title);
        move.disabled=busy||index+delta<0||index+delta>=draft.length;
        move.onclick=()=>{const next=index+delta;[draft[index],draft[next]]=[draft[next],draft[index]];draw(section.slug,label);dialog.querySelector('.order-announcement').textContent=section.title+' ở vị trí '+(next+1)+' trên '+draft.length;};
        row.append(move);
        if(section.slug===focusSlug&&label===direction)queueMicrotask(()=>{if(!move.disabled)move.focus();else row.querySelector('button:not(:disabled)')?.focus();});
      }
      list.append(row);
    });
    save.disabled=busy||!available||!changed()||!A.isMember();cancel.disabled=busy;
  }
  button.onclick=async()=>{
    const id=++token;busy=true;draft=[];error.textContent='Đang tải thứ tự mới nhất…';draw();dialog.showModal();
    await A.load().catch(()=>{available=false;});
    if(id!==token||!dialog.open)return;
    window.dispatchEvent(new Event('sectionorderchange'));
    draft=A.sections.slice();version=state?.version||0;initial=JSON.stringify(draft.map(s=>s.slug));busy=false;
    error.textContent=available?'':'Chưa tải được cấu hình thứ tự. Kiểm tra kết nối hoặc chạy bản cập nhật Supabase 20261021_section_order.sql.';
    draw();
  };
  cancel.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{++token;button.focus({preventScroll:true});});
  save.onclick=async()=>{
    if(busy||!available||!changed()||!A.isMember())return;
    busy=true;draw();error.textContent='';const userId=A.user.id;
    try{
      const {data,error:failure}=await request(A.db.rpc('reorder_sections',{p_slugs:draft.map(s=>s.slug),p_expected_version:version}));
      if(failure)throw new Error(failure.message?.includes('ORDER_CONFLICT')?'Một thành viên vừa đổi thứ tự. Đóng và mở lại để lấy bản mới nhất.':'Chưa lưu được thứ tự. Kiểm tra kết nối và quyền thành viên rồi thử lại.');
      if(!data||!Array.isArray(data.slugs))throw new Error('Chưa xác nhận được kết quả lưu. Mở lại để kiểm tra.');
      if(A.user?.id!==userId)return;
      state=data;sort();window.dispatchEvent(new Event('sectionorderchange'));
      try{localStorage.setItem('nhom12-order-saved',String(Date.now()));}catch{}
      dialog.close();A.toast('Đã lưu thứ tự các phần cho cả nhóm.');
    }catch(err){error.textContent=err.message;}
    finally{busy=false;draw();}
  };
  window.addEventListener('authchange',()=>{refreshButton();if(dialog.open&&!A.isMember()){++token;dialog.close();}});
  window.addEventListener('storage',async event=>{
    if(event.key!=='nhom12-order-saved'||!A.ready)return;
    await A.refreshSectionOrder();window.dispatchEvent(new Event('sectionorderchange'));
  });
})();
