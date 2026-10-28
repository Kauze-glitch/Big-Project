'use strict';
(() => {
  const R = window.CitizenRepository, $ = id => document.getElementById(id);
  const root = $('portal-app'), recordDialog = $('record-dialog'), confirmDialog = $('confirm-dialog');
  const labels = { 'active': 'Đang hoạt động', 'locked': 'Đã khóa', 'not-issued': 'Chưa cấp tài khoản' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = name => name.trim().split(/\s+/).slice(-2).map(s => s[0]).join('').toUpperCase();
  const formatDate = date => new Date(date).toLocaleDateString('vi-VN');
  const badge = status => `<span class="badge ${status}">${labels[status]}</span>`;
  const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
  let tab = 'citizen', pending = null, sessionId = null, timer, toastTimer, search = '', filter = '', ward = '', page = 1;
  try { sessionId = sessionStorage.getItem('nhom12-citizen-demo-session'); } catch (_) {}
  function setSession(id) {
    sessionId = id;
    try { if(id) sessionStorage.setItem('nhom12-citizen-demo-session', id); else sessionStorage.removeItem('nhom12-citizen-demo-session'); } catch (_) {}
  }
  function toast(message) {
    $('portal-toast').textContent = message; $('portal-toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('portal-toast').classList.remove('show'), 4200);
  }
  const saveMessage = text => toast(R.storageWarning ? text + ' Trình duyệt không lưu bền vững được dữ liệu; thay đổi có thể mất khi tải lại.' : text + ' Chỉ lưu trong trình duyệt này.');
  function header() {
    return `<header class="portal-header"><a href="portal.html" class="brand"><span class="brand-mark">12.</span><span>Cư dân<small>KHÔNG GIAN DEMO · NHÓM 12</small></span></a><div class="header-links"><a href="index.html" class="text-link">← Về báo cáo đề tài</a><a href="#/login" class="btn secondary small">Thử đăng nhập công dân</a></div></header>`;
  }
  function footer() { return '<footer class="portal-footer">Nhóm 12 · Phân tích & thiết kế hệ thống quản lý hồ sơ công dân</footer>'; }
  function navigate(path) { if (location.hash === '#' + path) render(); else location.hash = path; }
  function nav(active) {
    return `<aside class="workspace-nav" aria-label="Điều hướng demo"><p class="nav-label">KHÔNG GIAN QUẢN LÝ MẪU</p><a href="#/admin" class="${active === 'admin' ? 'active' : ''}" ${active === 'admin' ? 'aria-current="page"' : ''}>▦ &nbsp; Hồ sơ công dân</a><a href="#/login" class="${active === 'login' ? 'active' : ''}">↗ &nbsp; Thử đăng nhập</a>${active === 'profile' ? '<a href="#/profile" class="active" aria-current="page">◉ &nbsp; Hồ sơ của tôi</a>' : ''}<a href="index.html">⌂ &nbsp; Báo cáo đề tài</a><div class="nav-bottom"><strong>Bản xem trước giao diện</strong>Quyền quản lý ở đây là mô phỏng. Tài khoản dự án thật vẫn dùng trang báo cáo hiện tại.</div></aside>`;
  }
  function login() {
    clearInterval(timer);
    root.innerHTML = header() + `<main id="portal-main" class="login-layout arrive" tabindex="-1"><section class="login-intro"><p class="eyebrow">MỘT NƠI KẾT NỐI THÔNG TIN</p><h1>Hồ sơ của bạn.<br><em>Rõ ràng, gần gũi.</em></h1><p>Trải nghiệm tra cứu hồ sơ công dân và quản lý thông tin trong đồ án của Nhóm 12.</p><div class="intro-art" aria-hidden="true"><div class="art-card"><div class="art-avatar"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="16" r="8"/><path d="M9 42v-4a15 15 0 0 1 30 0v4"/></svg></div><div class="art-lines"><i></i><i></i><i></i></div></div><div class="art-check">✓</div></div><div class="intro-footer"><span>01 · Đăng nhập</span><span>02 · Xác nhận mã</span><span>03 · Xem hồ sơ</span></div></section><section class="login-card" aria-label="Đăng nhập demo"><div class="tabs" role="tablist" aria-label="Loại tài khoản"><button role="tab" id="tab-citizen" aria-selected="${tab === 'citizen'}" aria-controls="login-panel">Công dân</button><button role="tab" id="tab-member" aria-selected="${tab === 'member'}" aria-controls="login-panel">Thành viên dự án</button></div><div id="login-panel" role="tabpanel" aria-labelledby="tab-${tab}"></div></section></main>` + footer();
    $('tab-citizen').onclick = () => { tab = 'citizen'; pending = null; login(); $('tab-citizen').focus(); };
    $('tab-member').onclick = () => { tab = 'member'; pending = null; login(); $('tab-member').focus(); };
    for (const id of ['tab-citizen','tab-member']) $(id).onkeydown = e => { if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); $(id === 'tab-citizen' ? 'tab-member' : 'tab-citizen').click(); } };
    if (tab === 'member') {
      $('login-panel').innerHTML = `<p class="eyebrow">KHÔNG GIAN THÀNH VIÊN</p><h2>Cùng quản lý, cùng hoàn thiện.</h2><p class="muted small-text">Khám phá giao diện quản lý bằng dữ liệu mẫu. Ba tài khoản dự án hiện tại vẫn được giữ nguyên.</p><div class="sample-note">Trang quản lý này mở để xem thử giao diện, chưa áp dụng quyền thành viên thật và không kết nối hồ sơ trên Supabase.</div><a class="btn full" href="#/admin">Mở trang quản lý mẫu →</a><div class="form-foot">Để chỉnh sửa nội dung báo cáo bằng tài khoản hiện tại: <a href="index.html">về trang đề tài và chọn Đăng nhập</a>.</div>`;
    } else if (pending) { otpPanel(); }
    else credentialsPanel();
  }
  function credentialsPanel() {
    $('login-panel').innerHTML = `<div class="steps"><span class="current">01 · Tài khoản</span><span>02 · Xác nhận OTP</span></div><h2>Chào bạn trở lại.</h2><p class="muted small-text">Tài khoản công dân được cấp từ trang quản lý của nhóm.</p><form id="citizen-login"><label class="field"><span>CCCD mẫu</span><input id="demo-cccd" inputmode="numeric" autocomplete="off" maxlength="12" pattern="000[0-9]{9}" placeholder="000000000001" required><small>Chỉ dùng mã giả lập 12 số bắt đầu bằng 000.</small></label><label class="field"><span>Mật khẩu mẫu</span><div class="password-wrap"><input id="demo-password" type="password" autocomplete="off" placeholder="Nhập mật khẩu thử nghiệm" required><button id="toggle-password" type="button" aria-label="Hiện mật khẩu mẫu">Hiện</button></div></label><p id="login-error" class="error" role="alert"></p><button class="btn full" type="submit">Tiếp tục →</button></form><div class="sample-note"><strong>Thử ngay bằng tài khoản mẫu</strong><br>CCCD: <code>000000000001</code> · Mật khẩu: <code>demo123</code><br><button id="fill-example" class="btn secondary small">Điền tài khoản mẫu</button></div><div class="form-foot">Chưa có tài khoản? Thành viên sẽ nhập hồ sơ và cấp tài khoản tại <a href="#/admin">trang quản lý mẫu</a>. Không dùng mật khẩu hoặc thông tin cá nhân thật.</div>`;
    $('fill-example').onclick = () => { $('demo-cccd').value = '000000000001'; $('demo-password').value = 'demo123'; $('demo-cccd').focus(); };
    $('toggle-password').onclick = () => { const hidden = $('demo-password').type === 'password'; $('demo-password').type = hidden ? 'text' : 'password'; $('toggle-password').textContent = hidden ? 'Ẩn' : 'Hiện'; $('toggle-password').setAttribute('aria-label', (hidden ? 'Ẩn' : 'Hiện') + ' mật khẩu mẫu'); };
    $('citizen-login').onsubmit = e => {
      e.preventDefault();
      try { const r = R.checkLogin($('demo-cccd').value.trim(), $('demo-password').value); pending = { id: r.id, expires: Date.now() + 120000, sent: Date.now(), attempts: 0 }; setSession(null); login(); $('demo-otp').focus(); }
      catch (error) { $('login-error').textContent = error.message; }
    };
  }
  function otpPanel() {
    const r = R.get(pending.id);
    if (!r || r.account !== 'active') { pending = null; login(); toast('Tài khoản mẫu không còn hoạt động.'); return; }
    $('login-panel').innerHTML = `<div class="steps"><span>✓ · Tài khoản</span><span class="current">02 · Xác nhận OTP</span></div><p class="eyebrow">OTP TELEGRAM · MÔ PHỎNG</p><h2>Xác nhận bước cuối.</h2><p class="muted small-text">Luồng dự kiến gửi mã đến Telegram của số <strong>${esc(r.phone.slice(0,3))} •••• ${esc(r.phone.slice(-3))}</strong> đã được lưu trong hồ sơ.</p><div class="sample-note"><strong>Chưa gửi tin nhắn thật.</strong><br>Dùng mã thử <code>123456</code> để trải nghiệm. Mã mẫu có hiệu lực 2 phút, tối đa 5 lần nhập.</div><form id="otp-form"><label class="field"><span>Mã xác nhận mẫu</span><input id="demo-otp" class="otp-input" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="••••••" required></label><p id="otp-error" class="error" role="alert"></p><button id="verify-otp" class="btn full" type="submit">Xác nhận và xem hồ sơ →</button></form><div class="otp-actions"><button id="otp-back">← Đổi tài khoản</button><button id="resend-otp" disabled>Gửi lại mã mẫu</button></div><p id="otp-timer" class="muted small-text" role="timer"></p>`;
    const tick = () => {
      if (!pending || !$('otp-timer')) return;
      const remaining = Math.max(0, Math.ceil((pending.expires - Date.now()) / 1000)), cooldown = Math.max(0, 30 - Math.floor((Date.now() - pending.sent) / 1000));
      $('otp-timer').textContent = remaining ? `Mã mẫu còn hiệu lực ${remaining} giây.` : 'Mã mẫu đã hết hạn. Hãy gửi lại mã.';
      $('resend-otp').disabled = cooldown > 0; $('resend-otp').textContent = cooldown ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã mẫu';
      $('verify-otp').disabled = !remaining || pending.attempts >= 5;
    };
    tick(); timer = setInterval(tick, 1000);
    $('otp-back').onclick = () => { pending = null; login(); };
    $('resend-otp').onclick = () => { pending.expires = Date.now() + 120000; pending.sent = Date.now(); pending.attempts = 0; $('otp-error').textContent = ''; $('demo-otp').value = ''; tick(); toast('Đã tạo lại mã mô phỏng 123456. Không có tin nhắn thật.'); };
    $('otp-form').onsubmit = e => {
      e.preventDefault();
      if (!pending || pending.expires <= Date.now() || pending.attempts >= 5) { tick(); return; }
      const fresh = R.get(pending.id);
      if (!fresh || fresh.account !== 'active') { pending = null; login(); toast('Tài khoản mẫu đã bị khóa hoặc không còn tồn tại.'); return; }
      pending.attempts++;
      if ($('demo-otp').value.trim() !== '123456') { $('otp-error').textContent = pending.attempts >= 5 ? 'Đã hết 5 lần thử. Hãy gửi lại mã mẫu.' : `Mã chưa đúng. Còn ${5 - pending.attempts} lần thử.`; tick(); return; }
      setSession(fresh.id); pending = null; clearInterval(timer); navigate('/profile');
    };
  }
  function admin() {
    const records = R.list();
    root.innerHTML = header() + `<div class="workspace arrive">${nav('admin')}<main id="portal-main" class="workspace-main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">QUẢN LÝ DỮ LIỆU MẪU</p><h1>Hồ sơ công dân</h1><p>Mỗi hồ sơ, một nguồn thông tin rõ ràng.</p></div><button class="btn" id="new-record">＋ Thêm hồ sơ</button></div><section class="stats-grid" aria-label="Thống kê hồ sơ mẫu">${[['Tổng hồ sơ', records.length,'primary'],['Đã cấp · hoạt động',records.filter(r=>r.account==='active').length,''],['Chưa cấp tài khoản',records.filter(r=>r.account==='not-issued').length,''],['Tài khoản đã khóa',records.filter(r=>r.account==='locked').length,'']].map(([label,n,cls])=>`<div class="stat ${cls}"><span class="stat-label">${label}</span><strong>${String(n).padStart(2,'0')}</strong></div>`).join('')}</section><section class="panel"><div class="panel-heading"><div><h2>Danh sách công dân</h2><p>Dữ liệu giả lập phục vụ trình bày đồ án</p></div><button id="reset-demo" class="btn ghost small">Khôi phục mẫu</button></div><div class="toolbar"><div class="search-wrap"><input id="citizen-search" class="search-input" type="search" aria-label="Tìm công dân" placeholder="Tìm theo họ tên, CCCD hoặc số điện thoại…" value="${esc(search)}"></div><select id="account-filter" class="filter-select" aria-label="Lọc trạng thái tài khoản"><option value="">Tất cả trạng thái</option>${Object.entries(labels).map(([v,t])=>`<option value="${v}" ${filter===v?'selected':''}>${t}</option>`).join('')}</select><select id="ward-filter" class="filter-select" aria-label="Lọc khu vực"><option value="">Tất cả khu vực</option>${['Phường Mẫu A','Phường Mẫu B','Phường Mẫu C'].map(w=>`<option ${ward===w?'selected':''}>${w}</option>`).join('')}</select></div><div id="citizen-results"></div></section><p class="workspace-note">Chỉ dùng thông tin giả lập. Các thay đổi lưu trong trình duyệt này, chưa đồng bộ cho thành viên khác. Mật khẩu của mọi tài khoản mẫu được cấp là <strong>demo123</strong>.</p><section class="panel activity-panel"><div class="panel-heading"><h2>Hoạt động gần đây</h2><span class="panel-badge">Trên thiết bị này</span></div><div id="recent-activity"></div></section></main></div>` + footer();
    $('new-record').onclick = () => editRecord();
    $('citizen-search').oninput = e => { search = e.target.value; page = 1; table(); };
    $('account-filter').onchange = e => { filter = e.target.value; page = 1; table(); };
    $('ward-filter').onchange = e => { ward = e.target.value; page = 1; table(); };
    $('reset-demo').onclick = () => confirmAction('Khôi phục dữ liệu mẫu?', 'Các chỉnh sửa demo trên trình duyệt này sẽ được thay bằng 12 hồ sơ ban đầu. Nội dung báo cáo và Supabase không bị ảnh hưởng.', 'Khôi phục mẫu', () => { R.reset(); setSession(null); search = filter = ward = ''; page = 1; admin(); saveMessage('Đã khôi phục 12 hồ sơ mẫu.'); });
    table();
    const events = R.events().slice(0,5);
    $('recent-activity').innerHTML = events.length ? `<ul class="activity-list">${events.map(e=>`<li><span><strong>${esc(e.action)}</strong> · ${esc(e.name)}</span><time>${new Date(e.at).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</time></li>`).join('')}</ul>` : '<div class="empty small-text">Chưa có hoạt động. Thử thêm hồ sơ hoặc cấp một tài khoản mẫu.</div>';
  }
  function table() {
    const query = fold(search.trim()), records = R.list().filter(r=>(!filter||r.account===filter)&&(!ward||r.ward===ward)&&(!query||fold(r.name+' '+r.cccd+' '+r.phone).includes(query)));
    const pages = Math.max(1, Math.ceil(records.length/6)); page = Math.min(page,pages);
    const rows = records.slice((page-1)*6,page*6);
    $('citizen-results').innerHTML = (rows.length ? `<div class="table-wrap"><table class="citizen-table"><thead><tr><th scope="col">HỌ VÀ TÊN</th><th scope="col">CCCD MẪU</th><th scope="col">KHU VỰC</th><th scope="col">TÀI KHOẢN</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="person"><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.phone)}</small></span></div></td><td>${esc(r.cccd)}</td><td>${esc(r.ward)}</td><td>${badge(r.account)}</td><td><div class="row-actions"><button data-edit="${esc(r.id)}" aria-label="Sửa hồ sơ ${esc(r.name)}">Sửa hồ sơ</button><button data-account="${esc(r.id)}" aria-label="${r.account==='not-issued'?'Cấp tài khoản':r.account==='active'?'Khóa tài khoản':'Mở khóa'} ${esc(r.name)}">${r.account==='not-issued'?'Cấp TK':r.account==='active'?'Khóa':'Mở khóa'}</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>Không tìm thấy hồ sơ</strong>Thử tên khác hoặc bỏ bớt bộ lọc.<br><button id="clear-filters" class="btn secondary small" style="margin-top:16px">Xóa bộ lọc</button></div>') + `<div class="pagination"><span role="status">${records.length ? `${(page-1)*6+1}–${Math.min(page*6,records.length)} trong ${records.length}` : '0'} hồ sơ</span><div><button id="previous-page" class="btn secondary small" ${page===1?'disabled':''} aria-label="Trang trước">←</button><span>Trang ${page} / ${pages}</span><button id="next-page" class="btn secondary small" ${page===pages?'disabled':''} aria-label="Trang sau">→</button></div></div>`;
    $('previous-page').onclick = () => { page--; table(); }; $('next-page').onclick = () => { page++; table(); };
    if ($('clear-filters')) $('clear-filters').onclick = () => { search=filter=ward=''; page=1; admin(); $('citizen-search').focus(); };
    for (const button of root.querySelectorAll('[data-edit]')) button.onclick = () => editRecord(button.dataset.edit);
    for (const button of root.querySelectorAll('[data-account]')) button.onclick = () => {
      const r=R.get(button.dataset.account); if(!r)return;
      const title=r.account==='not-issued'?'Cấp tài khoản mẫu?':r.account==='active'?'Khóa tài khoản mẫu?':'Mở khóa tài khoản mẫu?';
      const text=r.account==='not-issued'?`${r.name} sẽ đăng nhập bằng CCCD ${r.cccd} và mật khẩu mẫu demo123. Chưa tạo tài khoản thật.`:r.account==='active'?`${r.name} sẽ không thể đăng nhập vào khu demo cho đến khi được mở khóa.`:`Cho phép ${r.name} đăng nhập lại bằng mật khẩu mẫu demo123.`;
      confirmAction(title,text,r.account==='active'?'Khóa tài khoản':'Xác nhận',()=>{ try{R.setAccount(r.id,r.account==='active'?'locked':'active');admin();saveMessage('Đã cập nhật tài khoản mẫu.');}catch(e){toast(e.message);} });
    };
  }
  function confirmAction(title,text,label,action) {
    confirmDialog.innerHTML=`<div class="dialog-head"><h2 id="confirm-title">${esc(title)}</h2><button class="close-btn" aria-label="Đóng xác nhận">×</button></div><div class="dialog-body"><p class="muted small-text">${esc(text)}</p></div><div class="dialog-actions"><button class="btn secondary" id="cancel-confirm">Hủy</button><button class="btn" id="accept-confirm">${esc(label)}</button></div>`;
    confirmDialog.querySelector('.close-btn').onclick=()=>confirmDialog.close();$('cancel-confirm').onclick=()=>confirmDialog.close();$('accept-confirm').onclick=()=>{confirmDialog.close();action();};confirmDialog.showModal();$('cancel-confirm').focus();
  }
  function editRecord(id=null) {
    const r=id?R.get(id):{name:'',cccd:'',dob:'',gender:'Nam',phone:'',email:'',address:'',ward:'Phường Mẫu A',occupation:''};
    if(!r){toast('Không tìm thấy hồ sơ.');return;}
    const field=(key,label,type='text',max=100,placeholder='')=>`<label class="field"><span>${label}</span><input name="${key}" type="${type}" value="${esc(r[key])}" maxlength="${max}" placeholder="${placeholder}" ${['name','cccd','dob','phone','address'].includes(key)?'required':''} ${key==='cccd'?'pattern="000[0-9]{9}" inputmode="numeric"':''} ${key==='phone'?'pattern="000[0-9]{7}" inputmode="numeric"':''} ${key==='dob'?`min="1900-01-01" max="${new Date().toISOString().slice(0,10)}"`:''} autocomplete="off"></label>`;
    recordDialog.innerHTML=`<form id="record-form"><div class="dialog-head"><div><h2 id="record-title">${id?'Chỉnh sửa hồ sơ':'Thêm hồ sơ mẫu'}</h2><p>Nhập thông tin giả lập để thử giao diện quản lý.</p></div><button type="button" class="close-btn" aria-label="Đóng hồ sơ">×</button></div><div class="dialog-body"><div class="dialog-hint">CCCD: 12 số bắt đầu 000 · Điện thoại: 10 số bắt đầu 000.<br>Email tùy chọn: dùng đuôi @example.invalid. Không nhập dữ liệu thật.</div><div class="form-grid">${field('name','Họ và tên *','text',80,'Ví dụ: Nguyễn Minh An')}${field('cccd','CCCD mẫu *','text',12,'000000000013')}${field('dob','Ngày sinh *','date')}<label class="field"><span>Giới tính *</span><select name="gender">${['Nam','Nữ','Khác'].map(g=>`<option ${r.gender===g?'selected':''}>${g}</option>`).join('')}</select></label>${field('phone','Số điện thoại mẫu *','text',10,'0000000013')}${field('email','Email mẫu','email',100,'congdan13@example.invalid')}<label class="field"><span>Khu vực *</span><select name="ward">${['Phường Mẫu A','Phường Mẫu B','Phường Mẫu C'].map(w=>`<option ${r.ward===w?'selected':''}>${w}</option>`).join('')}</select></label>${field('occupation','Nghề nghiệp','text',100,'Ví dụ: Sinh viên')}<label class="field wide"><span>Địa chỉ mẫu *</span><textarea name="address" maxlength="200" required placeholder="Ví dụ: 20 đường Minh Họa, Khu dân cư Mẫu">${esc(r.address)}</textarea></label></div><p id="record-error" class="error" role="alert"></p><p class="small-text muted">${id?'Sửa hồ sơ không tự thay đổi trạng thái tài khoản.':'Hồ sơ mới chưa có tài khoản. Sau khi lưu, chọn “Cấp TK” trong danh sách.'}</p></div><div class="dialog-actions"><button type="button" id="cancel-record" class="btn secondary">Hủy</button><button type="submit" class="btn">Lưu hồ sơ mẫu</button></div></form>`;
    recordDialog.querySelector('.close-btn').onclick=()=>recordDialog.close();$('cancel-record').onclick=()=>recordDialog.close();
    $('record-form').onsubmit=e=>{e.preventDefault();try{R.save(Object.fromEntries(new FormData(e.target)),id);recordDialog.close();search=filter=ward='';page=1;admin();saveMessage('Đã lưu hồ sơ mẫu.');}catch(error){$('record-error').textContent=error.message;}};
    recordDialog.showModal();recordDialog.querySelector('[name=name]').focus();
  }
  function profile() {
    const r=sessionId?R.get(sessionId):null;
    if(!r||r.account!=='active'){setSession(null);navigate('/login');toast('Hãy đăng nhập bằng tài khoản mẫu đang hoạt động để xem hồ sơ.');return;}
    const item=(label,value,wide=false)=>`<div class="${wide?'wide':''}"><dt>${label}</dt><dd>${esc(value||'Chưa cập nhật')}</dd></div>`;
    root.innerHTML=header()+`<div class="workspace arrive">${nav('profile')}<main id="portal-main" class="workspace-main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">KHÔNG GIAN CÔNG DÂN</p><h1>Hồ sơ của tôi</h1><p>Thông tin đã được nhập từ trang quản lý mẫu.</p></div><button id="citizen-logout" class="btn secondary">Đăng xuất demo</button></div><section class="profile-banner"><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><div><p>HỒ SƠ CÔNG DÂN · DỮ LIỆU GIẢ LẬP</p><h2>${esc(r.name)}</h2><span class="badge">Tài khoản mẫu đang hoạt động</span></div></section><div class="profile-grid"><section class="panel"><div class="panel-heading"><h2>Thông tin cá nhân</h2><span class="panel-badge">Chỉ xem</span></div><dl class="detail-grid">${item('Họ và tên',r.name)}${item('CCCD mẫu',r.cccd)}${item('Ngày sinh',formatDate(r.dob))}${item('Giới tính',r.gender)}${item('Nghề nghiệp',r.occupation)}${item('Khu vực',r.ward)}${item('Địa chỉ cư trú mẫu',r.address,true)}</dl></section><section class="panel"><div class="panel-heading"><h2>Liên hệ & tài khoản</h2></div><dl class="detail-grid">${item('Điện thoại mẫu',r.phone,true)}${item('Email mẫu',r.email,true)}${item('Cập nhật gần nhất',formatDate(r.updatedAt),true)}</dl><div class="info-box"><h3>✓ Đã hoàn tất luồng OTP mẫu</h3><p>Bạn vừa trải nghiệm hai bước đăng nhập. Chưa có xác thực danh tính hoặc tin nhắn Telegram thật.</p></div></section></div><div class="profile-help"><strong>Thông tin cần điều chỉnh?</strong><br>Trong luồng dự kiến, công dân liên hệ thành viên phụ trách để cập nhật. Ở bản demo, bạn có thể <a href="#/admin">mở trang quản lý mẫu</a> để thử sửa và quay lại xem kết quả.</div></main></div>`+footer();
    $('citizen-logout').onclick=()=>{setSession(null);tab='citizen';pending=null;navigate('/login');toast('Đã kết thúc phiên demo.');};
  }
  function render() {
    clearInterval(timer);recordDialog.close();confirmDialog.close();
    const route=location.hash.replace(/^#/,'')||'/login';
    if(route!=='/login')pending=null;
    if(route==='/admin')admin();else if(route==='/profile')profile();else login();
    window.scrollTo({top:0,behavior:'instant'});
  }
  window.addEventListener('hashchange',()=>{render();$('portal-main')?.focus({preventScroll:true});});
  window.addEventListener('storage',e=>{if(e.key==='nhom12-citizen-demo-v1')render();});
  document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('portal-main')?.focus();};
  render();
  if(R.storageWarning)toast('Không đọc được dữ liệu đã lưu. Đang hiển thị bộ hồ sơ mẫu.');
})();
