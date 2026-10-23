'use strict';
(() => {
  const A=window.GocViet;if(!A)return;
  const host=A.el('div','ai-widget');
  host.innerHTML=`<button class="ai-launch" aria-controls="ai-panel" aria-expanded="false" hidden>✦ Trợ lý AI</button>
  <section id="ai-panel" class="ai-panel" aria-labelledby="ai-title" hidden>
    <header class="ai-header"><div><strong id="ai-title">Trợ lý Nhóm 12</strong><small>Hỏi đáp cùng Gemini</small></div><button class="ai-close" aria-label="Đóng trợ lý">×</button></header>
    <div class="ai-settings"><label for="ai-scope">Nội dung tham khảo</label><select id="ai-scope"><option value="all">Tất cả các phần đã lưu</option></select></div>
    <p class="ai-notice">Câu hỏi và nội dung đã lưu được gửi đến Google Gemini. Không gửi mật khẩu hay dữ liệu cá nhân nhạy cảm. Bản nháp và ảnh không được gửi.</p>
    <div class="ai-messages" role="log" aria-label="Hội thoại với trợ lý" aria-live="polite" aria-relevant="additions text"></div>
    <div class="ai-suggestions"><button>Tóm tắt nội dung</button><button>Gợi ý phần cần bổ sung</button></div>
    <form class="ai-form"><label class="ai-input-label" for="ai-question">Câu hỏi của bạn</label><textarea id="ai-question" rows="2" maxlength="2000" placeholder="Hỏi về đề tài của nhóm…" required></textarea><div class="ai-actions"><button type="button" class="ai-reset">Cuộc trò chuyện mới</button><button type="button" class="ai-stop" hidden>Dừng</button><button type="submit" class="ai-send">Gửi ↑</button></div></form>
    <p class="ai-status" role="status"></p><small class="ai-footer">AI có thể sai. Kiểm tra lại trước khi dùng trong báo cáo.</small>
  </section>`;
  document.body.append(host);
  const $=selector=>host.querySelector(selector),launch=$('.ai-launch'),panel=$('.ai-panel'),input=$('#ai-question'),scope=$('#ai-scope'),messages=$('.ai-messages'),status=$('.ai-status');
  let userId=null,history=[],controller=null,epoch=0;
  function greeting(){messages.replaceChildren(A.el('p','ai-welcome','Mình có thể tóm tắt bài, giải thích nội dung và gợi ý hoàn thiện đề tài. Bạn muốn bắt đầu từ đâu?'));}
  function busy(value){$('.ai-send').disabled=value;scope.disabled=value;$('.ai-stop').hidden=!value;input.disabled=value;host.querySelectorAll('.ai-suggestions button').forEach(b=>b.disabled=value);}
  function stop(){epoch++;controller?.abort();controller=null;busy(false);status.textContent='';}
  function clear(){stop();history=[];input.value='';greeting();}
  function close(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();}
  function sync(){
    const next=A.user?.id||null;
    if(next!==userId){clear();userId=next;panel.hidden=true;launch.setAttribute('aria-expanded','false');}
    launch.hidden=!A.isMember();
    if(launch.hidden){stop();panel.hidden=true;}
    const selected=scope.value;
    scope.replaceChildren(new Option('Tất cả các phần đã lưu','all'),...A.sections.map(s=>new Option(s.title||s.slug,s.slug)));
    if([...scope.options].some(o=>o.value===selected))scope.value=selected;
  }
  function bubble(role,text){const item=A.el('article','ai-message ai-'+role);item.append(A.el('strong','ai-speaker',role==='user'?'Bạn':'Gemini'),A.el('div','ai-text',text));messages.append(item);messages.scrollTop=messages.scrollHeight;return item;}
  async function send(question){
    if(controller||!A.isMember())return;
    question=question.trim();if(!question)return;
    if(question.length>2000){status.textContent='Câu hỏi tối đa 2.000 ký tự.';return;}
    const token=++epoch,owner=A.user.id,selected=scope.value;
    controller=new AbortController();const activeController=controller;
    const timer=setTimeout(()=>activeController.abort(),45000);
    busy(true);status.textContent='Gemini đang đọc nội dung…';
    const pending=bubble('user',question);
    try{
      const result=await A.askAssistant({question,section:selected,history:history.slice(-6)},activeController.signal);
      if(token!==epoch||A.user?.id!==owner)return;
      const answer=bubble('model',result.answer);
      const sources=A.el('div','ai-sources');sources.append(A.el('span','','Nội dung đã tham khảo: '));
      for(const source of (Array.isArray(result.sources)?result.sources:[])){
        if(!A.sections.some(s=>s.slug===source.slug))continue;
        const link=A.el('a','',source.title||source.slug);link.href='index.html?section='+encodeURIComponent(source.slug);link.target='_blank';link.rel='noopener';sources.append(link);
      }
      answer.append(sources);
      if(result.truncated)answer.append(A.el('small','ai-note','Bài dài đã được rút gọn. Chọn từng phần để hỏi chi tiết hơn.'));
      if(result.partial)answer.append(A.el('small','ai-note','Câu trả lời chạm giới hạn độ dài; hãy hỏi tiếp phần cần làm rõ.'));
      history.push({role:'user',text:question},{role:'model',text:result.answer.slice(0,6000)});history=history.slice(-6);
      input.value='';status.textContent='';messages.scrollTop=messages.scrollHeight;
    }catch(error){
      if(token!==epoch||A.user?.id!==owner)return;
      pending.remove();input.value=question;
      status.textContent=activeController.signal.aborted?'Phản hồi quá lâu. Câu hỏi được giữ lại để bạn thử lại.':error.message;
    }finally{clearTimeout(timer);if(token===epoch){controller=null;busy(false);if(!panel.hidden)input.focus();}}
  }
  greeting();
  launch.addEventListener('click',()=>{panel.hidden=!panel.hidden;launch.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){sync();input.focus();}});
  $('.ai-close').addEventListener('click',close);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();close();}});
  $('.ai-form').addEventListener('submit',event=>{event.preventDefault();send(input.value);});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();send(input.value);}});
  $('.ai-reset').addEventListener('click',()=>{clear();input.focus();});
  $('.ai-stop').addEventListener('click',()=>{stop();status.textContent='Đã dừng chờ phản hồi. Yêu cầu đã gửi có thể vẫn được tính vào hạn mức.';input.focus();});
  scope.addEventListener('change',()=>{clear();input.focus();});
  $('.ai-suggestions').addEventListener('click',event=>{if(event.target.tagName==='BUTTON'){input.value=event.target.textContent==='Tóm tắt nội dung'?'Tóm tắt nội dung đã lưu, nêu các ý chính và chỉ rõ phần nào chưa có nội dung.':'Dựa trên bài đã lưu, gợi ý những nội dung nhóm cần bổ sung cho đề tài. Phân biệt nội dung đã có với đề xuất mới.';send(input.value);}});
  window.addEventListener('authchange',sync);window.addEventListener('sectionorderchange',sync);
  A.load().then(sync).catch(()=>{});sync();
})();
