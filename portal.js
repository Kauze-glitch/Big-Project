'use strict';
(() => {
  const R = window.CitizenRepository, $ = id => document.getElementById(id);
  const root = $('portal-app'), recordDialog = $('record-dialog'), confirmDialog = $('confirm-dialog');
  const isMember = () => window.PortalAuth?.isMember() === true;
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
  const saveMessage = text => toast(R.storageWarning ? text + ' Không thể lưu dữ liệu lâu dài trên thiết bị. Các thay đổi có thể mất khi tải lại trang.' : text + ' Dữ liệu được lưu trên trình duyệt hiện tại.');
  function header() {
    return `<header class="portal-header"><a href="portal.html" class="brand"><span class="brand-mark">12.</span><span>Hồ sơ công dân<small>ĐỒ ÁN MÔN HỌC · NHÓM 12</small></span></a><div class="header-links"><a href="index.html" class="text-link">← Về báo cáo đề tài</a>${isMember() ? '<a href="database.html" class="btn secondary small">Sơ đồ database</a>' : ''}<a href="#/login" class="btn secondary small">Đăng nhập công dân</a></div></header>`;
  }
  function footer() { return '<footer class="portal-footer">Nhóm 12 · Phân tích và thiết kế hệ thống quản lý hồ sơ công dân</footer>'; }
  function navigate(path) { if (location.hash === '#' + path) render(); else location.hash = path; }
  function nav(active) {
    return `<aside class="workspace-nav" aria-label="Điều hướng quản lý hồ sơ"><p class="nav-label">QUẢN LÝ HỒ SƠ</p>${isMember() ? `<a href="#/admin" class="${active === 'admin' ? 'active' : ''}" ${active === 'admin' ? 'aria-current="page"' : ''}>▦ &nbsp; Hồ sơ công dân</a><a href="database.html">Sơ đồ database</a>` : ''}<a href="#/login" class="${active === 'login' ? 'active' : ''}">↗ &nbsp; Đăng nhập công dân</a>${active === 'profile' ? '<a href="#/profile" class="active" aria-current="page">◉ &nbsp; Hồ sơ của tôi</a>' : ''}<a href="index.html">⌂ &nbsp; Báo cáo đề tài</a><div class="nav-bottom"><strong>Phạm vi đồ án</strong>Dữ liệu minh họa được lưu trên thiết bị. Chức năng quản lý dành cho thành viên dự án đã đăng nhập.</div></aside>`;
  }
  function login() {
    clearInterval(timer);
    if (!isMember()) tab = 'citizen';
    root.innerHTML = header() + `<main id="portal-main" class="login-layout arrive" tabindex="-1"><section class="login-intro"><p class="eyebrow">CỔNG THÔNG TIN CÔNG DÂN</p><h1>Quản lý hồ sơ<br><em>công dân.</em></h1><p>Hỗ trợ quản lý, tra cứu thông tin cá nhân và theo dõi trạng thái tài khoản công dân.</p><div class="intro-art" aria-hidden="true"><div class="art-card"><div class="art-avatar"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="16" r="8"/><path d="M9 42v-4a15 15 0 0 1 30 0v4"/></svg></div><div class="art-lines"><i></i><i></i><i></i></div></div><div class="art-check">✓</div></div><div class="intro-footer"><span>01 · Đăng nhập</span><span>02 · Xác thực OTP</span><span>03 · Tra cứu hồ sơ</span></div></section><section class="login-card" aria-label="Đăng nhập hệ thống"><div class="tabs" role="tablist" aria-label="Loại tài khoản"><button role="tab" id="tab-citizen" aria-selected="${tab === 'citizen'}" aria-controls="login-panel">Công dân</button>${isMember() ? `<button role="tab" id="tab-member" aria-selected="${tab === 'member'}" aria-controls="login-panel">Thành viên dự án</button>` : ''}</div><div id="login-panel" role="tabpanel" aria-labelledby="tab-${tab}"></div></section></main>` + footer();
    $('tab-citizen').onclick = () => { tab = 'citizen'; pending = null; login(); $('tab-citizen').focus(); };
    if ($('tab-member')) $('tab-member').onclick = () => { tab = 'member'; pending = null; login(); $('tab-member').focus(); };
    for (const id of ['tab-citizen','tab-member'].filter(id => $(id))) $(id).onkeydown = e => { if (isMember() && ['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); $(id === 'tab-citizen' ? 'tab-member' : 'tab-citizen').click(); } };
    if (tab === 'member') {
      $('login-panel').innerHTML = `<p class="eyebrow">DÀNH CHO THÀNH VIÊN DỰ ÁN</p><h2>Quản lý hồ sơ và tài khoản</h2><p class="muted small-text">Thực hiện các nghiệp vụ lập hồ sơ, cập nhật thông tin, cấp và quản lý trạng thái tài khoản công dân.</p><div class="sample-note">Tài khoản của bạn đã được xác nhận là thành viên dự án. Chức năng quản lý sử dụng dữ liệu minh họa trong phạm vi đồ án.</div><a class="btn full" href="#/admin">Truy cập quản lý hồ sơ →</a><a class="btn secondary full" href="database.html" style="margin-top:12px">Xem sơ đồ database →</a><div class="form-foot">Tài khoản thành viên dự án được sử dụng tại trang báo cáo: <a href="index.html">truy cập trang đề tài để đăng nhập</a>.</div>`;
    } else if (pending) { otpPanel(); }
    else credentialsPanel();
  }
  function credentialsPanel() {
    $('login-panel').innerHTML = `<div class="steps"><span class="current">01 · Tài khoản</span><span>02 · Xác thực OTP</span></div><h2>Đăng nhập hệ thống</h2><p class="muted small-text">Vui lòng nhập số căn cước công dân và mật khẩu của tài khoản đã được cấp.</p><form id="citizen-login"><label class="field"><span>Số căn cước công dân (CCCD)</span><input id="demo-cccd" inputmode="numeric" autocomplete="off" maxlength="12" pattern="000[0-9]{9}" placeholder="000000000001" required><small>Dữ liệu mô phỏng: sử dụng 12 chữ số bắt đầu bằng 000.</small></label><label class="field"><span>Mật khẩu</span><div class="password-wrap"><input id="demo-password" type="password" autocomplete="off" placeholder="Nhập mật khẩu" required><button id="toggle-password" type="button" aria-label="Hiện mật khẩu">Hiện</button></div></label><p id="login-error" class="error" role="alert"></p><button class="btn full" type="submit">Tiếp tục →</button></form><div class="sample-note"><strong>Tài khoản phục vụ đánh giá đồ án</strong><br>CCCD: <code>000000000001</code> · Mật khẩu: <code>demo123</code><br><button id="fill-example" class="btn secondary small">Sử dụng tài khoản minh họa</button></div><div class="form-foot">Tài khoản được cấp sau khi hồ sơ được thành viên dự án tạo${isMember() ? ' tại <a href="#/admin">trang quản lý hồ sơ</a>' : ''}. Chỉ sử dụng dữ liệu giả lập trong phạm vi đồ án.</div>`;
    $('fill-example').onclick = () => { $('demo-cccd').value = '000000000001'; $('demo-password').value = 'demo123'; $('demo-cccd').focus(); };
    $('toggle-password').onclick = () => { const hidden = $('demo-password').type === 'password'; $('demo-password').type = hidden ? 'text' : 'password'; $('toggle-password').textContent = hidden ? 'Ẩn' : 'Hiện'; $('toggle-password').setAttribute('aria-label', (hidden ? 'Ẩn' : 'Hiện') + ' mật khẩu'); };
    $('citizen-login').onsubmit = e => {
      e.preventDefault();
      try { const r = R.checkLogin($('demo-cccd').value.trim(), $('demo-password').value); pending = { id: r.id, expires: Date.now() + 120000, sent: Date.now(), attempts: 0 }; setSession(null); login(); $('demo-otp').focus(); }
      catch (error) { $('login-error').textContent = error.message; }
    };
  }
  function otpPanel() {
    const r = R.get(pending.id);
    if (!r || r.account !== 'active') { pending = null; login(); toast('Tài khoản không còn ở trạng thái hoạt động.'); return; }
    $('login-panel').innerHTML = `<div class="steps"><span>✓ · Tài khoản</span><span class="current">02 · Xác thực OTP</span></div><p class="eyebrow">XÁC THỰC TÀI KHOẢN</p><h2>Nhập mã xác thực OTP</h2><p class="muted small-text">Số điện thoại liên kết với hồ sơ: <strong>${esc(r.phone.slice(0,3))} •••• ${esc(r.phone.slice(-3))}</strong>.</p><div class="sample-note"><strong>Xác thực mô phỏng trong phạm vi đồ án.</strong><br>Mã minh họa: <code>123456</code>. Hệ thống chưa gửi mã qua Telegram. Mã có hiệu lực 2 phút và giới hạn 5 lần nhập.</div><form id="otp-form"><label class="field"><span>Mã xác thực OTP</span><input id="demo-otp" class="otp-input" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="••••••" required></label><p id="otp-error" class="error" role="alert"></p><button id="verify-otp" class="btn full" type="submit">Xác thực và truy cập hồ sơ →</button></form><div class="otp-actions"><button id="otp-back">← Quay lại đăng nhập</button><button id="resend-otp" disabled>Cấp lại mã mô phỏng</button></div><p id="otp-timer" class="muted small-text" role="timer"></p>`;
    const tick = () => {
      if (!pending || !$('otp-timer')) return;
      const remaining = Math.max(0, Math.ceil((pending.expires - Date.now()) / 1000)), cooldown = Math.max(0, 30 - Math.floor((Date.now() - pending.sent) / 1000));
      $('otp-timer').textContent = remaining ? `Mã xác thực còn hiệu lực ${remaining} giây.` : 'Mã xác thực đã hết hạn. Vui lòng yêu cầu cấp lại mã.';
      $('resend-otp').disabled = cooldown > 0; $('resend-otp').textContent = cooldown ? `Cấp lại sau ${cooldown} giây` : 'Cấp lại mã mô phỏng';
      $('verify-otp').disabled = !remaining || pending.attempts >= 5;
    };
    tick(); timer = setInterval(tick, 1000);
    $('otp-back').onclick = () => { pending = null; login(); };
    $('resend-otp').onclick = () => { pending.expires = Date.now() + 120000; pending.sent = Date.now(); pending.attempts = 0; $('otp-error').textContent = ''; $('demo-otp').value = ''; tick(); toast('Đã cấp lại mã mô phỏng 123456. Mã không được gửi qua Telegram.'); };
    $('otp-form').onsubmit = e => {
      e.preventDefault();
      if (!pending || pending.expires <= Date.now() || pending.attempts >= 5) { tick(); return; }
      const fresh = R.get(pending.id);
      if (!fresh || fresh.account !== 'active') { pending = null; login(); toast('Tài khoản đã bị khóa hoặc không còn tồn tại.'); return; }
      pending.attempts++;
      if ($('demo-otp').value.trim() !== '123456') { $('otp-error').textContent = pending.attempts >= 5 ? 'Đã sử dụng hết 5 lần nhập mã. Vui lòng yêu cầu cấp lại mã.' : `Mã xác thực không chính xác. Số lần nhập còn lại: ${5 - pending.attempts}.`; tick(); return; }
      setSession(fresh.id); pending = null; clearInterval(timer); navigate('/profile');
    };
  }
  function memberAccess() {
    const checking = window.PortalAuth?.status() === 'checking';
    root.innerHTML = header() + `<main id="portal-main" class="login-card" style="max-width:600px;margin:60px auto" tabindex="-1"><p class="eyebrow">QUYỀN TRUY CẬP</p><h1>${checking ? 'Đang kiểm tra tài khoản' : 'Khu vực dành cho thành viên dự án'}</h1><p class="muted small-text" role="status">${checking ? 'Vui lòng chờ hệ thống xác nhận quyền truy cập.' : 'Vui lòng đăng nhập bằng tài khoản thành viên tại trang báo cáo đề tài, sau đó quay lại Cổng công dân.'}</p><a href="index.html" class="btn full">Về trang báo cáo đề tài</a><button id="retry-access" class="btn secondary full" style="margin-top:12px">Kiểm tra lại quyền truy cập</button></main>` + footer();
    $('retry-access').onclick = async () => { $('retry-access').disabled = true; await window.PortalAuth?.refresh(); render(); };
  }
  async function requireMember() {
    if (await window.PortalAuth?.refresh()) return true;
    render(); toast('Không có quyền quản lý hồ sơ. Vui lòng đăng nhập bằng tài khoản thành viên dự án.');
    return false;
  }
  function admin() {
    if (!isMember()) { memberAccess(); return; }
    const records = R.list();
    root.innerHTML = header() + `<div class="workspace arrive">${nav('admin')}<main id="portal-main" class="workspace-main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">QUẢN LÝ THÔNG TIN CÔNG DÂN</p><h1>Hồ sơ công dân</h1><p>Tiếp nhận, cập nhật hồ sơ và quản lý trạng thái tài khoản công dân.</p></div><button class="btn" id="new-record">＋ Thêm hồ sơ</button></div><section class="stats-grid" aria-label="Thống kê hồ sơ">${[['Tổng hồ sơ', records.length,'primary'],['Tài khoản đang hoạt động',records.filter(r=>r.account==='active').length,''],['Chưa cấp tài khoản',records.filter(r=>r.account==='not-issued').length,''],['Tài khoản đã khóa',records.filter(r=>r.account==='locked').length,'']].map(([label,n,cls])=>`<div class="stat ${cls}"><span class="stat-label">${label}</span><strong>${String(n).padStart(2,'0')}</strong></div>`).join('')}</section><section class="panel"><div class="panel-heading"><div><h2>Danh sách công dân</h2><p>Tra cứu và thực hiện các nghiệp vụ quản lý hồ sơ.</p></div><button id="reset-demo" class="btn ghost small">Khôi phục dữ liệu minh họa</button></div><div class="toolbar"><div class="search-wrap"><input id="citizen-search" class="search-input" type="search" aria-label="Tìm công dân" placeholder="Tìm theo họ tên, CCCD hoặc số điện thoại…" value="${esc(search)}"></div><select id="account-filter" class="filter-select" aria-label="Lọc trạng thái tài khoản"><option value="">Tất cả trạng thái</option>${Object.entries(labels).map(([v,t])=>`<option value="${v}" ${filter===v?'selected':''}>${t}</option>`).join('')}</select><select id="ward-filter" class="filter-select" aria-label="Lọc khu vực"><option value="">Tất cả khu vực</option>${['Phường Mẫu A','Phường Mẫu B','Phường Mẫu C'].map(w=>`<option ${ward===w?'selected':''}>${w}</option>`).join('')}</select></div><div id="citizen-results"></div></section><p class="workspace-note">Dữ liệu phục vụ đồ án được lưu trên trình duyệt hiện tại và chưa đồng bộ giữa các thiết bị. Mật khẩu chung của tài khoản minh họa: <strong>demo123</strong>.</p><section class="panel activity-panel"><div class="panel-heading"><h2>Hoạt động gần đây</h2><span class="panel-badge">Trên thiết bị này</span></div><div id="recent-activity"></div></section></main></div>` + footer();
    $('new-record').onclick = () => editRecord();
    $('citizen-search').oninput = e => { search = e.target.value; page = 1; table(); };
    $('account-filter').onchange = e => { filter = e.target.value; page = 1; table(); };
    $('ward-filter').onchange = e => { ward = e.target.value; page = 1; table(); };
    $('reset-demo').onclick = () => confirmAction('Xác nhận khôi phục dữ liệu minh họa', 'Toàn bộ chỉnh sửa hồ sơ trên trình duyệt hiện tại sẽ được thay thế bằng 12 hồ sơ minh họa ban đầu. Thao tác này không thay đổi nội dung báo cáo đề tài.', 'Khôi phục dữ liệu minh họa', async () => { if (!await requireMember()) return; R.reset(); setSession(null); search = filter = ward = ''; page = 1; admin(); saveMessage('Đã khôi phục 12 hồ sơ minh họa ban đầu.'); });
    table();
    const events = R.events().slice(0,5);
    $('recent-activity').innerHTML = events.length ? `<ul class="activity-list">${events.map(e=>`<li><span><strong>${esc(e.action)}</strong> · ${esc(e.name)}</span><time>${new Date(e.at).toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})}</time></li>`).join('')}</ul>` : '<div class="empty small-text">Chưa ghi nhận hoạt động quản lý hồ sơ hoặc tài khoản.</div>';
  }
  function table() {
    if (!isMember()) return;
    const query = fold(search.trim()), records = R.list().filter(r=>(!filter||r.account===filter)&&(!ward||r.ward===ward)&&(!query||fold(r.name+' '+r.cccd+' '+r.phone).includes(query)));
    const pages = Math.max(1, Math.ceil(records.length/6)); page = Math.min(page,pages);
    const rows = records.slice((page-1)*6,page*6);
    $('citizen-results').innerHTML = (rows.length ? `<div class="table-wrap"><table class="citizen-table"><thead><tr><th scope="col">HỌ VÀ TÊN</th><th scope="col">SỐ CCCD</th><th scope="col">KHU VỰC</th><th scope="col">TÀI KHOẢN</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="person"><span class="avatar" aria-hidden="true">${esc(initials(r.name))}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.phone)}</small></span></div></td><td>${esc(r.cccd)}</td><td>${esc(r.ward)}</td><td>${badge(r.account)}</td><td><div class="row-actions"><button data-edit="${esc(r.id)}" aria-label="Sửa hồ sơ ${esc(r.name)}">Sửa hồ sơ</button><button data-account="${esc(r.id)}" aria-label="${r.account==='not-issued'?'Cấp tài khoản':r.account==='active'?'Khóa tài khoản':'Mở khóa tài khoản'} ${esc(r.name)}">${r.account==='not-issued'?'Cấp tài khoản':r.account==='active'?'Khóa tài khoản':'Mở khóa tài khoản'}</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>Không tìm thấy hồ sơ</strong>Vui lòng kiểm tra từ khóa tìm kiếm hoặc điều chỉnh bộ lọc.<br><button id="clear-filters" class="btn secondary small" style="margin-top:16px">Xóa bộ lọc</button></div>') + `<div class="pagination"><span role="status">${records.length ? `${(page-1)*6+1}–${Math.min(page*6,records.length)} trong ${records.length}` : '0'} hồ sơ</span><div><button id="previous-page" class="btn secondary small" ${page===1?'disabled':''} aria-label="Trang trước">←</button><span>Trang ${page} / ${pages}</span><button id="next-page" class="btn secondary small" ${page===pages?'disabled':''} aria-label="Trang sau">→</button></div></div>`;
    $('previous-page').onclick = () => { page--; table(); }; $('next-page').onclick = () => { page++; table(); };
    if ($('clear-filters')) $('clear-filters').onclick = () => { search=filter=ward=''; page=1; admin(); $('citizen-search').focus(); };
    for (const button of root.querySelectorAll('[data-edit]')) button.onclick = () => editRecord(button.dataset.edit);
    for (const button of root.querySelectorAll('[data-account]')) button.onclick = () => {
      const r=R.get(button.dataset.account); if(!r)return;
      const title=r.account==='not-issued'?'Xác nhận cấp tài khoản':r.account==='active'?'Xác nhận khóa tài khoản':'Xác nhận mở khóa tài khoản';
      const text=r.account==='not-issued'?`${r.name} sẽ được cấp tài khoản minh họa với số CCCD ${r.cccd} và mật khẩu demo123.`:r.account==='active'?`${r.name} sẽ không thể đăng nhập cho đến khi tài khoản được mở khóa.`:`Cho phép ${r.name} đăng nhập lại bằng mật khẩu minh họa demo123.`;
      confirmAction(title,text,r.account==='active'?'Khóa tài khoản':'Xác nhận',async()=>{ if (!await requireMember()) return; try{R.setAccount(r.id,r.account==='active'?'locked':'active');admin();saveMessage('Đã cập nhật trạng thái tài khoản.');}catch(e){toast(e.message);} });
    };
  }
  function confirmAction(title,text,label,action) {
    confirmDialog.innerHTML=`<div class="dialog-head"><h2 id="confirm-title">${esc(title)}</h2><button class="close-btn" aria-label="Đóng xác nhận">×</button></div><div class="dialog-body"><p class="muted small-text">${esc(text)}</p></div><div class="dialog-actions"><button class="btn secondary" id="cancel-confirm">Hủy</button><button class="btn" id="accept-confirm">${esc(label)}</button></div>`;
    confirmDialog.querySelector('.close-btn').onclick=()=>confirmDialog.close();$('cancel-confirm').onclick=()=>confirmDialog.close();$('accept-confirm').onclick=()=>{confirmDialog.close();action();};confirmDialog.showModal();$('cancel-confirm').focus();
  }
  function editRecord(id=null) {
    if (!isMember()) { render(); return; }
    const r=id?R.get(id):{name:'',cccd:'',dob:'',gender:'Nam',phone:'',email:'',address:'',ward:'Phường Mẫu A',occupation:''};
    if(!r){toast('Không tìm thấy hồ sơ.');return;}
    Object.assign(r,{cardIssuedOn:r.identityCard?.issuedOn||'',cardExpiresOn:r.identityCard?.expiresOn||'',cardIssuer:r.identityCard?.issuer||'',cardStatus:r.identityCard?.status||'active'});
    const field=(key,label,type='text',max=100,placeholder='')=>`<label class="field"><span>${label}</span><input name="${key}" type="${type}" value="${esc(r[key])}" maxlength="${max}" placeholder="${placeholder}" ${['name','cccd','dob','phone','address'].includes(key)?'required':''} ${key==='cccd'?'pattern="000[0-9]{9}" inputmode="numeric"':''} ${key==='phone'?'pattern="000[0-9]{7}" inputmode="numeric"':''} ${key==='dob'?`min="1900-01-01" max="${new Date().toISOString().slice(0,10)}"`:''} autocomplete="off"></label>`;
    recordDialog.innerHTML=`<form id="record-form"><div class="dialog-head"><div><h2 id="record-title">${id?'Chỉnh sửa hồ sơ':'Thêm hồ sơ công dân'}</h2><p>Nhập đầy đủ thông tin hồ sơ. Các trường có dấu * là bắt buộc.</p></div><button type="button" class="close-btn" aria-label="Đóng hồ sơ">×</button></div><div class="dialog-body"><div class="dialog-hint">CCCD: 12 số bắt đầu 000 · Điện thoại: 10 số bắt đầu 000.<br>Email minh họa sử dụng đuôi @example.invalid. Chỉ nhập dữ liệu giả lập.</div><div class="form-grid">${field('name','Họ và tên *','text',80,'Ví dụ: Nguyễn Minh An')}${field('cccd','Số CCCD *','text',12,'000000000013')}${field('dob','Ngày sinh *','date')}<label class="field"><span>Giới tính *</span><select name="gender">${['Nam','Nữ','Khác'].map(g=>`<option ${r.gender===g?'selected':''}>${g}</option>`).join('')}</select></label>${field('phone','Số điện thoại *','text',10,'0000000013')}${field('email','Địa chỉ email','email',100,'congdan13@example.invalid')}<label class="field"><span>Khu vực *</span><select name="ward">${['Phường Mẫu A','Phường Mẫu B','Phường Mẫu C'].map(w=>`<option ${r.ward===w?'selected':''}>${w}</option>`).join('')}</select></label>${field('occupation','Nghề nghiệp','text',100,'Ví dụ: Sinh viên')}<label class="field wide"><span>Địa chỉ cư trú *</span><textarea name="address" maxlength="200" required placeholder="Ví dụ: 20 đường Minh Họa, Khu dân cư Mẫu">${esc(r.address)}</textarea></label>${field('nationality','Quốc tịch','text',80)}${field('ethnicity','Dân tộc','text',80)}${field('religion','Tôn giáo','text',80)}${field('hometown','Quê quán','text',200)}${field('birthplace','Nơi sinh','text',200)}${field('birthRegistration','Nơi đăng ký khai sinh','text',200)}${field('maritalStatus','Tình trạng hôn nhân','text',80)}${field('temporaryAddress','Nơi tạm trú','text',200)}${field('currentAddress','Nơi ở hiện tại (để trống nếu cùng thường trú)','text',200)}${field('householdCode','Mã hộ','text',80)}${field('householdHead','Chủ hộ','text',80)}${field('householdRelation','Quan hệ với chủ hộ','text',80)}</div><details class="citizen-request-detail"><summary>Thông tin thẻ căn cước / CCCD</summary><p class="small-text muted">Điền đủ ngày cấp, ngày hết hạn và nơi cấp để hiển thị thẻ. Thông tin được lưu theo lần cấp.</p><div class="form-grid">${field('cardIssuedOn','Ngày cấp thẻ','date')}${field('cardExpiresOn','Ngày hết hạn thẻ','date')}${field('cardIssuer','Nơi cấp thẻ','text',200)}<label class="field"><span>Trạng thái thẻ</span><select name="cardStatus">${Object.entries({active:'Còn hiệu lực',expired:'Hết hạn',replaced:'Đã thay thế',lost:'Đã báo mất',revoked:'Đã thu hồi'}).map(([key,label])=>`<option value="${key}" ${r.cardStatus===key?'selected':''}>${label}</option>`).join('')}</select></label></div></details><p id="record-error" class="error" role="alert"></p><p class="small-text muted">${id?'Việc cập nhật hồ sơ không làm thay đổi trạng thái tài khoản.':'Sau khi lưu hồ sơ, chọn “Cấp tài khoản” trong danh sách để thực hiện cấp tài khoản công dân.'}</p></div><div class="dialog-actions"><button type="button" id="cancel-record" class="btn secondary">Hủy</button><button type="submit" class="btn">Lưu hồ sơ</button></div></form>`;
    recordDialog.querySelector('.close-btn').onclick=()=>recordDialog.close();$('cancel-record').onclick=()=>recordDialog.close();
    $('record-form').onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target)),submit=e.target.querySelector('[type=submit]');submit.disabled=true;if (!await requireMember()) return;try{R.save(values,id);recordDialog.close();search=filter=ward='';page=1;admin();saveMessage('Đã lưu thông tin hồ sơ.');}catch(error){$('record-error').textContent=error.message;}finally{submit.disabled=false;}};
    recordDialog.showModal();recordDialog.querySelector('[name=name]').focus();
  }
  function profile(page='personal') {
    const r=sessionId?R.get(sessionId):null;
    if(!r||r.account!=='active'){setSession(null);navigate('/login');toast('Vui lòng đăng nhập bằng tài khoản đang hoạt động để truy cập hồ sơ.');return;}
    root.innerHTML=header()+window.CitizenProfile.html(r,page,isMember())+footer();
    window.CitizenProfile.bind(r);
    $('citizen-logout').onclick=()=>{setSession(null);tab='citizen';pending=null;navigate('/login');toast('Đã đăng xuất khỏi hệ thống.');};
  }
  function render() {
    clearInterval(timer);recordDialog.close();confirmDialog.close();
    const route=location.hash.replace(/^#/,'')||'/login';
    if(route!=='/login')pending=null;
    if(route==='/admin')admin();else if(route==='/profile'||route.startsWith('/profile/'))profile(route.split('/')[2]||'personal');else login();
    window.scrollTo({top:0,behavior:'instant'});
  }
  window.addEventListener('hashchange',()=>{render();$('portal-main')?.focus({preventScroll:true});});
  window.addEventListener('storage',e=>{if(e.key==='nhom12-citizen-demo-v1')render();});
  document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('portal-main')?.focus();};
  let knownMember = isMember();
  window.addEventListener('portalauthchange', () => {
    const changed = knownMember !== isMember(); knownMember = isMember();
    if (changed || location.hash === '#/admin') render();
  });
  render();
  if(R.storageWarning)toast('Không thể đọc dữ liệu đã lưu. Hệ thống đang hiển thị bộ hồ sơ minh họa ban đầu.');
})();
