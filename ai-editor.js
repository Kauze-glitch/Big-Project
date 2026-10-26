'use strict';
(() => {
  const A=window.GocViet;
  A.initAIEditor=bridge=>{
    const launch=A.el('button','btn btn-quiet','✦ Sửa đoạn với AI');launch.type='button';launch.id='ai-edit-launch';
    launch.addEventListener('mousedown',event=>event.preventDefault());
    document.querySelector('.insert-toolbar').append(launch);
    const dialog=A.el('dialog','dialog ai-edit-dialog');dialog.setAttribute('aria-labelledby','ai-edit-title');
    dialog.innerHTML=`<div class="ai-edit-heading"><div><div class="eyebrow">HỖ TRỢ BIÊN SOẠN</div><h2 id="ai-edit-title">Chỉnh đoạn văn với AI</h2></div><button type="button" class="btn btn-quiet ai-edit-close" aria-label="Đóng chỉnh sửa AI">×</button></div><p class="ai-edit-notice">Chỉ đoạn bạn chọn được gửi đến Google Gemini. Không gửi thông tin nhạy cảm. Kiểm tra tên, số liệu và ý nghĩa trước khi áp dụng.</p><label for="ai-edit-mode">Bạn muốn chỉnh thế nào?</label><div class="ai-edit-controls"><select id="ai-edit-mode"><option value="clear">Viết rõ hơn</option><option value="shorten">Rút gọn</option><option value="proofread">Sửa chính tả, ngữ pháp</option></select><button type="button" class="btn ai-edit-generate">Tạo đề xuất</button></div><div class="ai-edit-columns"><div><label for="ai-edit-original">Bản gốc · đoạn đang chọn</label><textarea id="ai-edit-original" readonly></textarea></div><div><label for="ai-edit-result">Bản đề xuất · bạn có thể sửa thêm</label><textarea id="ai-edit-result" maxlength="12000" placeholder="Bấm Tạo đề xuất để xem nội dung ở đây…" disabled></textarea></div></div><p class="ai-edit-status" role="status"></p><p class="ai-edit-hint">Chỉ thay đoạn đã chọn bằng văn bản mới. Định dạng riêng trong đoạn có thể thay đổi. Chưa đăng lên website cho đến khi bấm “Lưu và hiển thị”.</p><div class="dialog-actions"><button type="button" class="btn btn-quiet ai-edit-cancel">Hủy</button><button type="button" class="btn ai-edit-apply" disabled>Thay vào bản nháp</button></div>`;
    document.body.append(dialog);
    const $=s=>dialog.querySelector(s),original=$('#ai-edit-original'),result=$('#ai-edit-result'),mode=$('#ai-edit-mode'),generate=$('.ai-edit-generate'),apply=$('.ai-edit-apply'),status=$('.ai-edit-status');
    let context=null,controller=null,generation=0;
    function stop(){generation++;controller?.abort();controller=null;}
    function controls(busy){mode.disabled=busy;generate.disabled=busy;result.disabled=busy||!result.value;apply.disabled=busy||!result.value.trim()||!bridge.valid(context);generate.textContent=busy?'Đang tạo…':'Tạo đề xuất';}
    dialog.addEventListener('close',()=>{stop();context=null;original.value='';result.value='';launch.focus();});
    $('.ai-edit-close').onclick=$('.ai-edit-cancel').onclick=()=>dialog.close();
    launch.onclick=()=>{
      try{context=bridge.capture();if(!context)throw new Error('Hãy bôi đen một đoạn trong khối văn bản của bạn trước.');
        if(context.text.length>6000)throw new Error('Mỗi lần chọn tối đa 6.000 ký tự. Hãy chọn một đoạn ngắn hơn.');
        stop();original.value=context.text;result.value='';mode.value='clear';status.textContent='';controls(false);dialog.showModal();
      }catch(error){A.toast(error.message);}
    };
    mode.onchange=()=>{result.value='';status.textContent='';controls(false);};
    result.oninput=()=>{apply.disabled=!result.value.trim()||!bridge.valid(context);};
    generate.onclick=async()=>{
      if(controller)return;if(!bridge.valid(context)){status.textContent='Đoạn văn hoặc tài khoản đã thay đổi. Hãy đóng rồi chọn lại.';apply.disabled=true;return;}
      const token=++generation,active=new AbortController();controller=active;const timer=setTimeout(()=>active.abort(),45000);
      result.value='';controls(true);status.textContent='Gemini đang xử lý đoạn được chọn…';
      try{
        const response=await A.askAssistant({operation:'rewrite',mode:mode.value,section:context.slug,text:context.text},active.signal);
        if(token!==generation||!dialog.open)return;
        if(!bridge.valid(context))throw new Error('Đoạn gốc đã thay đổi. Hãy đóng rồi chọn lại để tránh ghi đè.');
        if(response.partial)throw new Error('Đề xuất bị cắt do giới hạn độ dài. Hãy chọn đoạn ngắn hơn rồi thử lại.');
        result.value=response.answer;status.textContent='Đề xuất đã sẵn sàng. So sánh và chỉnh lại trước khi áp dụng.';
      }catch(error){if(token===generation)status.textContent=active.signal.aborted?'Phản hồi quá lâu. Bạn có thể thử lại; bản gốc vẫn được giữ.':error.message;}
      finally{clearTimeout(timer);if(token===generation){controller=null;controls(false);}}
    };
    apply.onclick=()=>{
      if(controller||!result.value.trim())return;
      if(!bridge.valid(context)){status.textContent='Nội dung đã thay đổi. Hãy đóng rồi chọn lại.';apply.disabled=true;return;}
      try{bridge.apply(context,result.value);dialog.close();A.toast('Đã thay đoạn trong bản nháp. Có thể bấm “Hoàn tác AI” ngay sau đó.');}
      catch(error){status.textContent=error.message;}
    };
    for(const event of ['authchange','editorcontextchange'])window.addEventListener(event,()=>{if(dialog.open&&!bridge.valid(context))dialog.close();});
  };
})();
