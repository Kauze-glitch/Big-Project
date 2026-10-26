'use strict';
(() => {
  const A=window.GocViet,$=A.$;
  let failed='',loaded=false,pageAnimation=null,renderVersion=0,loading=null;
  let motion=true;
  try{motion=localStorage.getItem('nhom12-motion')!=='off';}catch{}
  function animatePage(){
    pageAnimation?.cancel();
    if(!motion)return;
    pageAnimation=$('page-view').animate([
      {opacity:0,transform:'translateY(24px)',filter:'blur(2px)'},
      {opacity:1,transform:'translateY(0)',filter:'blur(0)'}
    ],{duration:380,easing:'cubic-bezier(.22,.68,.18,1)'});
  }
  const motionButton=A.el('button','btn btn-quiet');
  function motionLabel(){motionButton.textContent=motion?'Chuyển động: Bật':'Chuyển động: Tắt';motionButton.setAttribute('aria-pressed',String(motion));}
  motionLabel();motionButton.title='Bật hoặc tắt cuộn mượt và hiệu ứng chuyển trang';
  motionButton.onclick=()=>{window.Nhom12Scroll?.stop();motion=!motion;try{localStorage.setItem('nhom12-motion',motion?'on':'off');}catch{}motionLabel();if(motion)animatePage();else pageAnimation?.cancel();};
  document.querySelector('.header-actions').prepend(motionButton);
  const currentSlug=()=>new URLSearchParams(location.search).get('section');
  function cleanup(){$('page-view').querySelectorAll('.visual-reader').forEach(el=>el.cleanup?.());}
  function route(href){try{history.pushState(null,'',href);}catch{location.href=href;return;}render(true);}
  function link(href,text,className){const el=A.el('a',className,text);el.href=href;el.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();route(href);});return el;}
  function renderNav(){
    $('section-nav').replaceChildren();$('nav-count').textContent=String(A.sections.length).padStart(2,'0');
    for(const [index,section] of A.sections.entries()){
      const el=A.navItem(section,index);el.href='section.html?section='+encodeURIComponent(section.slug);el.classList.toggle('active',currentSlug()===section.slug);if(currentSlug()===section.slug)el.setAttribute('aria-current','page');
      el.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();route(el.getAttribute('href'));});$('section-nav').append(el);
    }
    if(!loaded)$('section-nav').append(A.el('span','muted',failed?'Chưa tải được mục lục':'Đang tải mục lục…'));
    document.querySelectorAll('.overview-link').forEach(el=>el.classList.toggle('active',!currentSlug()));
    $('studio-link').hidden=!A.isMember();A.presentation?.refresh();
  }
  function home(view){
    document.title='Nhóm 12 · Quản lý hồ sơ công dân';$('page-breadcrumb').textContent='Tổng quan đề tài';
    const hero=A.el('section','project-hero');
    const eyebrow=A.el('div','eyebrow','NHÓM 12');const badge=A.el('span','project-badge','ĐỀ TÀI 21');const top=A.el('div','hero-top');top.append(eyebrow,badge);
    const title=A.el('h1');title.append(document.createTextNode('Phân tích thiết kế hệ thống '),A.el('em','','quản lý hồ sơ công dân.'));
    hero.append(top,title);view.append(hero);
    const team=A.el('section','team-section'),head=A.el('div','team-heading');head.append(A.el('h2','','Thành viên thực hiện'),A.el('span','','03 THÀNH VIÊN'));team.append(head);
    const profiles=A.memberProfiles(),used=new Set(),grid=A.el('div','team-grid');
    const addCard=(member,profile,owner,index)=>{
      const data=profile||member,card=A.el('article','member-card');const top=A.el('div','member-top');top.append(A.el('span','member-avatar',data.name.split(' ').filter(Boolean).slice(-2).map(w=>w[0]).join('')),A.el('span','member-index','0'+(index+1)));card.append(top,A.el('h3','',data.name),A.el('div','member-role',data.role||'Thành viên'),A.el('p','member-task',data.task||'Chưa cập nhật nhiệm vụ.'));
      const mine=!!owner&&A.user?.id===owner;
      if(mine){const edit=A.el('button','profile-edit','Sửa hồ sơ của tôi ↗');edit.onclick=A.showProfile;card.append(edit);}
      grid.append(card);
    };
    A.roster.forEach((member,index)=>{const found=profiles.find(p=>p.profile?.memberKey===member.key);if(found)used.add(found.owner);addCard(member,found?.profile,found?.owner,index);});
    profiles.filter(p=>p.profile?.name&&!used.has(p.owner)).forEach((p,index)=>addCard(null,p.profile,p.owner,index+3));
    team.append(grid);
    if(A.isMember()&&!A.myProfile().memberKey){const setup=A.el('button','btn btn-quiet team-setup','Thiết lập tên, vai trò và nhiệm vụ của tôi →');setup.onclick=A.showProfile;team.append(setup);}
    view.append(team);
    if(failed){const retry=A.el('button','btn btn-quiet','Thử tải lại nội dung');retry.onclick=load;view.append(A.el('p','muted',failed),retry);}
  }
  function detail(view,slug){
    const section=A.sections.find(s=>s.slug===slug);
    if(!section){const state=A.el('div','state-card',!loaded&&!failed?'Đang tải nội dung…':failed||'Không tìm thấy trang này.');if(failed){const retry=A.el('button','btn','Thử tải lại nội dung');retry.onclick=load;state.append(retry);}state.append(link('index.html','Về trang giới thiệu','btn btn-quiet'));view.append(state);return;}
    const index=A.sections.indexOf(section);document.title=section.title+' · Nhóm 12';$('page-breadcrumb').textContent=section.title;
    const article=A.el('article','chapter-page'),meta=A.el('div','chapter-meta');meta.append(link('index.html','← Tổng quan đề tài','chapter-back'),A.el('span','eyebrow','NỘI DUNG / '+String(index+1).padStart(2,'0')));article.append(meta);
    const title=A.el('h1','chapter-title',section.title);article.append(title);
    if(A.canEdit(section)){const rename=A.el('button','btn btn-quiet rename-section','✎ Đổi tên phần');rename.type='button';rename.onclick=()=>openRename(section);article.append(rename);}
    const owner=A.memberProfiles().find(p=>p.owner===section.owner_id)?.profile;
    const action=A.el('div','chapter-byline');action.append(A.progressBadge(section));action.append(A.el('span','',owner?.name?'Biên soạn bởi '+owner.name:'Nhóm 12 · Phân tích & thiết kế hệ thống'));
    if(A.canEdit(section)){const edit=A.el('a','btn','✎ Chỉnh sửa trang này');edit.href='editor.html?section='+encodeURIComponent(slug);action.append(edit);}else if(A.isMember()){const mine=A.el('a','btn btn-quiet','Mở trang của tôi →');mine.href='editor.html';action.append(mine);}article.append(action);
    const content=A.el('div','chapter-content'),doc=A.decode(section.content);A.renderBlocks(content,doc.blocks);
    if(!content.textContent.trim()&&!doc.blocks.some(b=>b.type==='visual'))content.append(A.el('p','empty-content','Chưa có nội dung được đăng.'));
    article.append(content);
    const footer=A.el('nav','chapter-navigation');footer.setAttribute('aria-label','Chuyển trang');
    if(index>0)footer.append(link('section.html?section='+encodeURIComponent(A.sections[index-1].slug),'← '+A.sections[index-1].title,'chapter-prev'));
    if(index<A.sections.length-1)footer.append(link('section.html?section='+encodeURIComponent(A.sections[index+1].slug),A.sections[index+1].title+' →','chapter-next'));
    article.append(footer);view.append(article);
  }
  const renameDialog=A.el('dialog','dialog rename-dialog');
  renameDialog.setAttribute('aria-label','Đổi tên phần');
  renameDialog.innerHTML='<form><h2>Đổi tên phần</h2><label for="section-name">Tên hiển thị trong mục lục và trình chiếu</label><input id="section-name" maxlength="240" required autocomplete="off"><p class="rename-error error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn btn-quiet rename-cancel">Hủy</button><button class="btn rename-save" type="submit">Lưu tên mới</button></div></form>';
  document.body.append(renameDialog);let renameTarget=null,renameBusy=false;
  function openRename(section){renameTarget=structuredClone(section);renameDialog.querySelector('input').value=section.title;renameDialog.querySelector('.rename-error').textContent='';renameDialog.showModal();renameDialog.querySelector('input').focus();renameDialog.querySelector('input').select();}
  renameDialog.querySelector('.rename-cancel').onclick=()=>{if(!renameBusy)renameDialog.close();};
  renameDialog.addEventListener('cancel',event=>{if(renameBusy)event.preventDefault();});
  renameDialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(renameBusy||!A.canEdit(renameTarget))return;
    const title=renameDialog.querySelector('input').value.trim(),error=renameDialog.querySelector('.rename-error');if(!title){error.textContent='Hãy nhập tên phần.';return;}
    if(title===renameTarget.title){renameDialog.close();return;}
    renameBusy=true;renameDialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);error.textContent='';
    try{
      const userId=A.user.id,oldUpdated=renameTarget.updated_at,saved=await A.updateSection(renameTarget,{title});
      try{const key='v2:'+userId+':'+saved.slug,draft=await A.drafts.get(key);if(draft){draft.title=title;if(draft.baseUpdatedAt===oldUpdated)draft.baseUpdatedAt=saved.updated_at;await A.drafts.put(key,draft);}}catch{}
      renameDialog.close();render();document.querySelector('.rename-section')?.focus({preventScroll:true});A.toast('Đã đổi tên phần. Mục lục và trình chiếu đã cập nhật.');
    }catch(err){error.textContent=err.message;}finally{renameBusy=false;renameDialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  };
  async function showOwnDraft(view,version){
    const section=A.sections.find(s=>s.slug===currentSlug()),userId=A.user?.id;
    if(!section||!A.canEdit(section))return;
    try{
      const draft=await A.readSection(section);
      if(!draft.isDraft||version!==renderVersion||A.user?.id!==userId||!view.isConnected)return;
      const blocks=draft.blocks;
      const article=view.querySelector('.chapter-page'),content=article?.querySelector('.chapter-content');if(!content)return;
      const notice=A.el('div','draft-preview-notice');notice.setAttribute('role','status');
      const text=A.el('div');text.append(A.el('strong','','Bản nháp trên thiết bị — chỉ bạn nhìn thấy'),A.el('p','','Nội dung dưới đây chưa được đăng. Mở biên soạn và bấm “Lưu và hiển thị” để mọi người xem được.'));
      const edit=A.el('a','btn','Chỉnh sửa và đăng →');edit.href='editor.html?section='+encodeURIComponent(section.slug);notice.append(text,edit);
      content.querySelectorAll('.visual-reader').forEach(el=>el.cleanup?.());content.replaceChildren();A.renderBlocks(content,blocks);content.before(notice);
      article.querySelector('.chapter-title').textContent=draft.title||section.title;
    }catch{ /* A local draft must not prevent the published page from rendering. */ }
  }
  function render(animate=false){
    const version=++renderVersion;cleanup();const view=$('page-view');view.replaceChildren();renderNav();
    if(currentSlug()){detail(view,currentSlug());showOwnDraft(view,version);}else home(view);
    if(animate){window.Nhom12Scroll?.stop();window.scrollTo({top:0,behavior:'instant'});animatePage();$('main').focus({preventScroll:true});}
  }
  async function load(){if(loading)return loading;loading=(async()=>{failed='';const first=!loaded;if(first)render();try{await A.load();loaded=true;}catch(error){failed=error.message;}render(first&&!!currentSlug());})().finally(()=>loading=null);return loading;}
  document.querySelectorAll('.home-link').forEach(el=>el.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();route('index.html');}));
  window.addEventListener('popstate',()=>render(true));window.addEventListener('authchange',()=>render());window.addEventListener('profilechange',()=>render());
  window.addEventListener('sectionorderchange',()=>render());
  if(!currentSlug()&&location.hash.startsWith('#phan'))history.replaceState(null,'','section.html?section='+encodeURIComponent(location.hash.slice(1)));
  window.addEventListener('focus',()=>{if(loaded)load();});
  window.addEventListener('storage',event=>{if(loaded&&event.key==='nhom12-section-saved')load();});
  render(true);load();
})();

