'use strict';
(() => {
  const A=window.GocViet;
  let slides=[],index=0,hadFullscreen=false,returnFocus=null,run=0,stale=false,presenterId=null;
  const launch=A.el('button','btn presentation-launch','▣ Trình chiếu 3 phần');launch.type='button';launch.disabled=true;
  document.querySelector('.header-actions').prepend(launch);
  const dialog=A.el('dialog','presentation-dialog');dialog.setAttribute('aria-label','Trình chiếu các phần');
  const panel=A.el('div','presentation-panel');
  const header=A.el('header','presentation-header'),label=A.el('span','presentation-brand','NHÓM 12 · TRÌNH CHIẾU');
  const exit=A.el('button','btn btn-quiet','Thoát · Esc');exit.type='button';header.append(label,exit);
  const viewport=A.el('div','presentation-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','Nội dung trình chiếu, cuộn để đọc tiếp');
  const footer=A.el('footer','presentation-footer'),prev=A.el('button','btn btn-quiet','← Phần trước'),next=A.el('button','btn','Phần tiếp →');prev.type=next.type='button';
  const picker=A.el('nav','presentation-picker');picker.setAttribute('aria-label','Chọn phần trình chiếu');
  const hint=A.el('p','presentation-hint','Nội dung đã lưu · ← → chuyển phần · ↑ ↓ hoặc cuộn để đọc tiếp');
  const live=A.el('span','sr-only');live.setAttribute('aria-live','polite');
  footer.append(prev,picker,next);panel.append(header,viewport,hint,footer,live);dialog.append(panel);document.body.append(dialog);
  const clean=()=>viewport.querySelectorAll('.visual-reader').forEach(el=>el.cleanup?.());
  function draw(){
    clean();viewport.replaceChildren();viewport.scrollTop=0;
    const slide=slides[index],article=A.el('article','presentation-slide');
    article.append(A.el('div','presentation-kicker','PHẦN '+(index+1)+' / '+slides.length),A.el('h1','presentation-title',slide.title||'Chưa đặt tiêu đề'));
    if(slide.isDraft){const notice=A.el('p','presentation-draft-notice','Bản nháp chưa đăng · Đang trình chiếu bản riêng trên thiết bị của bạn.');notice.setAttribute('role','status');article.append(notice);}
    if(stale)article.append(A.el('p','presentation-draft-notice','Chưa tải được bản mới nhất. Đang dùng nội dung đã tải trên thiết bị.'));
    const body=A.el('div','presentation-content');A.renderBlocks(body,slide.blocks);
    if(!A.hasContent(slide.blocks)){
      body.append(A.el('p','empty-content',A.canEdit(slide)?'Phần này chưa có nội dung đã lưu hoặc bản nháp trên thiết bị. Mở biên soạn để thêm nội dung.':'Phần này chưa có nội dung được đăng. Nếu bạn đã soạn bản nháp, hãy đăng nhập đúng tài khoản trên thiết bị đã soạn.'));
    }
    article.append(body);viewport.append(article);
    prev.disabled=index===0;next.disabled=index===slides.length-1;
    picker.replaceChildren();slides.forEach((s,i)=>{const b=A.el('button','presentation-dot',String(i+1));b.type='button';b.title=s.title;b.setAttribute('aria-label','Phần '+(i+1)+': '+s.title);b.setAttribute('aria-current',i===index?'step':'false');b.onclick=()=>go(i);picker.append(b);});
    live.textContent='Phần '+(index+1)+' trên '+slides.length+': '+slide.title;
    let motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;try{if(localStorage.getItem('nhom12-motion')==='off')motion=false;}catch{}
    if(motion)article.animate([{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
  }
  function go(to){if(to<0||to>=slides.length||to===index)return;index=to;draw();viewport.focus({preventScroll:true});}
  async function prepare(token){
    stale=false;
    try{await A.load();}catch{stale=true;}
    if(token!==run||!dialog.open)return;
    const resolved=await Promise.all(A.sections.slice(0,3).map(section=>A.readSection(structuredClone(section))));
    if(token!==run||!dialog.open)return;
    slides=resolved;
    if(!slides.length){viewport.replaceChildren(A.el('p','empty-content','Chưa tải được nội dung trình chiếu. Hãy thoát và thử lại.'));return;}
    draw();
  }
  async function close(){
    if(!dialog.open)return;++run;clean();dialog.close();document.documentElement.classList.remove('is-presenting');
    if(document.fullscreenElement===panel){try{await document.exitFullscreen();}catch{}}
    viewport.replaceChildren();hadFullscreen=false;returnFocus?.focus({preventScroll:true});
  }
  launch.onclick=()=>{
    if(!A.sections.length)return;
    hint.textContent='← → chuyển phần · ↑ ↓ hoặc cuộn để đọc tiếp · Esc thoát';
    slides=[];index=0;returnFocus=document.activeElement;hadFullscreen=false;presenterId=A.user?.id||null;
    const token=++run;prev.disabled=next.disabled=true;picker.replaceChildren();
    viewport.replaceChildren(A.el('p','empty-content','Đang tải nội dung trình chiếu…'));
    window.Nhom12Scroll?.stop();document.documentElement.classList.add('is-presenting');dialog.showModal();viewport.focus({preventScroll:true});
    // Fullscreen must be requested directly from this user gesture. The modal is the fallback.
    if(panel.requestFullscreen)panel.requestFullscreen().then(()=>{if(!dialog.open){if(document.fullscreenElement===panel)document.exitFullscreen().catch(()=>{});}else hadFullscreen=true;}).catch(()=>{hint.textContent='Chế độ trình chiếu trong cửa sổ · ← → chuyển phần · cuộn để đọc tiếp';});
    prepare(token).catch(()=>{if(token===run&&dialog.open)viewport.replaceChildren(A.el('p','empty-content','Không đọc được nội dung. Hãy thoát trình chiếu và thử lại.'));});
  };
  exit.onclick=close;prev.onclick=()=>go(index-1);next.onclick=()=>go(index+1);
  window.addEventListener('authchange',()=>{if(dialog.open&&(A.user?.id||null)!==presenterId)close();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===panel)hadFullscreen=true;else if(hadFullscreen)close();});
  dialog.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const key=event.key;
    if(key==='Escape'){event.preventDefault();close();}
    else if(key==='ArrowRight'){event.preventDefault();go(index+1);}
    else if(key==='ArrowLeft'){event.preventDefault();go(index-1);}
    else if(key==='Home'){event.preventDefault();go(0);}
    else if(key==='End'){event.preventDefault();go(slides.length-1);}
    else if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(key)){
      event.preventDefault();const down=key==='ArrowDown'||key==='PageDown';
      const edge=down?viewport.scrollTop+viewport.clientHeight>=viewport.scrollHeight-2:viewport.scrollTop<=1;
      if(key.startsWith('Page')&&edge)go(index+(down?1:-1));
      else viewport.scrollBy({top:(down?1:-1)*(key.startsWith('Page')?viewport.clientHeight*.8:80),behavior:'instant'});
    }
  });
  A.presentation={refresh(){launch.disabled=!A.sections.length;launch.textContent='▣ Trình chiếu '+Math.min(3,A.sections.length||3)+' phần';}};
})();
