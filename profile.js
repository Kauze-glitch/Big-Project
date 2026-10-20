'use strict';
(() => {
  const A=window.GocViet,$=A.$;
  A.memberProfiles=()=>{
    const owners=[...new Set(A.sections.map(s=>s.owner_id).filter(Boolean))];
    return owners.map(owner=>{const section=A.sections.find(s=>s.owner_id===owner);return {owner,section,profile:A.decode(section.content).author};});
  };
  A.myProfile=()=>{
    const publicProfile=A.memberProfiles().find(p=>p.owner===A.user?.id)?.profile;
    return publicProfile || A.cleanProfile(A.user?.user_metadata?.project_profile) || {name:'',role:'Thành viên',task:'',memberKey:''};
  };
  const dialog=A.el('dialog','dialog profile-dialog');dialog.id='profile-dialog';
  dialog.innerHTML='<form id="profile-form"><div class="eyebrow">HỒ SƠ CỦA TÔI</div><h2>Mỗi người, một dấu ấn.</h2><p class="muted">Tên, vai trò và nhiệm vụ này sẽ hiển thị trên trang giới thiệu nhóm.</p><label for="profile-member">Bạn là thành viên nào trong danh sách?</label><select id="profile-member"><option value="">Chọn tên trong danh sách nhóm</option></select><label for="profile-name">Tên hiển thị</label><input id="profile-name" maxlength="80" required autocomplete="name"><label for="profile-role">Vai trò</label><input id="profile-role" maxlength="100" placeholder="Ví dụ: Trưởng nhóm, Thành viên…"><label for="profile-task">Nhiệm vụ của bạn</label><textarea id="profile-task" rows="3" maxlength="800" placeholder="Mô tả phần việc bạn phụ trách…"></textarea><p id="profile-error" class="error" role="alert"></p><div class="dialog-actions"><button id="profile-cancel" type="button" class="btn btn-quiet">Để sau</button><button id="profile-save" class="btn" type="submit">Lưu hồ sơ</button></div></form>';
  document.body.append(dialog);
  for(const member of A.roster){const option=A.el('option','',member.name);option.value=member.key;$('profile-member').append(option);}
  A.showProfile=()=>{
    if(!A.user)return;
    const profile=A.myProfile();$('profile-name').value=profile.name;$('profile-role').value=profile.role;$('profile-task').value=profile.task;$('profile-member').value=profile.memberKey;$('profile-error').textContent='';
    const taken=new Set(A.memberProfiles().filter(p=>p.owner!==A.user.id).map(p=>p.profile?.memberKey));
    for(const option of $('profile-member').options)option.disabled=!!option.value&&taken.has(option.value);
    $('profile-member').closest('form').querySelector('label[for="profile-member"]').hidden=!A.isMember();$('profile-member').hidden=!A.isMember();
    dialog.querySelector('p.muted').textContent=A.isMember()?'Tự sửa tên, vai trò và nhiệm vụ của bạn trên trang giới thiệu nhóm.':'Cập nhật tên hiển thị của tài khoản. Chỉ tài khoản được phân công nội dung mới xuất hiện trong nhóm.';
    dialog.showModal();$('profile-name').focus();
  };
  $('profile-btn').addEventListener('click',A.showProfile);$('profile-cancel').addEventListener('click',()=>dialog.close());
  $('profile-member').addEventListener('change',()=>{const member=A.roster.find(r=>r.key===$('profile-member').value);if(member){$('profile-name').value=member.name;$('profile-role').value=member.role;}});
  $('profile-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!A.user)return;const userId=A.user.id;
    const profile=A.cleanProfile({name:$('profile-name').value.trim(),role:$('profile-role').value.trim()||'Thành viên',task:$('profile-task').value.trim(),memberKey:$('profile-member').value,updatedAt:new Date().toISOString()});
    if(!profile.name){$('profile-error').textContent='Hãy nhập tên hiển thị.';return;}
    if(A.isMember()&&!profile.memberKey){$('profile-error').textContent='Chọn tên của bạn trong danh sách để gắn hồ sơ đúng thành viên. Sau đó bạn có thể đổi tên hiển thị tùy ý.';return;}
    $('profile-save').disabled=true;$('profile-error').textContent='';
    try{
      const primary=A.sections.find(s=>s.owner_id===userId);
      if(primary){
        const {data:fresh,error}=await A.db.from('sections').select('*').eq('slug',primary.slug).eq('owner_id',userId).single();
        if(error||!fresh)throw new Error('Chưa đọc được hồ sơ hiện tại. Hãy thử lại.');
        const doc=A.decode(fresh.content);await A.updateSection(fresh,{content:A.encode(doc.blocks,profile)});
        window.dispatchEvent(new CustomEvent('profilechange',{detail:{userId}}));
      }
      const {error}=await A.db.auth.updateUser({data:{display_name:profile.name,project_profile:profile}});
      if(error)throw new Error(primary?'Đã cập nhật hồ sơ trên trang nhóm, nhưng tên tài khoản chưa đồng bộ. Bấm lưu để thử lại.':'Chưa lưu được hồ sơ tài khoản. Hãy thử lại.');
      if(A.user?.id===userId){dialog.close();A.toast('Đã cập nhật tên, vai trò và nhiệm vụ.');window.dispatchEvent(new Event('profilechange'));}
    }catch(error){$('profile-error').textContent=error.message;}
    finally{$('profile-save').disabled=false;}
  });
})();
