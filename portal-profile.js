'use strict';
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => esc(value || 'Chưa cập nhật');
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(value + 'T12:00:00').toLocaleDateString('vi-VN') : 'Chưa cập nhật';
  const field = (label, value, wide = false) => `<div class="${wide ? 'wide' : ''}"><dt>${esc(label)}</dt><dd>${text(value)}</dd></div>`;
  const box = (title, body) => `<section class="citizen-panel"><h2>${esc(title)}</h2>${body}</section>`;
  const details = rows => `<dl class="citizen-details">${rows.map(row => field(...row)).join('')}</dl>`;
  const portrait = '<svg viewBox="0 0 80 100" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="40" cy="29" r="17"/><path d="M10 90V77a30 30 0 0 1 60 0v13"/></svg>';
  const pages = { personal: 'Thông tin cá nhân', card: 'Căn cước / CCCD', residence: 'Thông tin cư trú', requests: 'Hồ sơ yêu cầu' };
  function cardState(card, today = new Date().toISOString().slice(0, 10)) {
    if (!card) return {label:'Chưa cập nhật', active:false};
    const status = {active:'Còn hiệu lực', expired:'Hết hạn', replaced:'Đã thay thế', lost:'Đã báo mất', revoked:'Đã thu hồi'};
    if (card.status !== 'active') return {label:status[card.status] || 'Chưa xác định', active:false};
    if (!card.issuedOn || card.issuedOn > today) return {label:'Chưa có hiệu lực', active:false};
    if (card.expiresOn && card.expiresOn < today) return {label:'Hết hạn', active:false};
    return {label:'Còn hiệu lực', active:true};
  }
  function personal(r) {
    const initials = r.name.trim().split(/\s+/).slice(-2).map(s=>s[0]).join('').toUpperCase();
    return `<div class="citizen-summary"><span class="citizen-avatar" aria-hidden="true">${esc(initials)}</span><div><p class="eyebrow">HỒ SƠ CÔNG DÂN</p><h2>${esc(r.name)}</h2><p>Số định danh: •••• •••• ${esc(r.cccd.slice(-4))}</p></div><span class="badge">Đang hoạt động</span></div>` +
      box('Thông tin cơ bản', details([
        ['Họ và tên khai sinh',r.name],['Tên gọi khác',r.otherName],['Ngày sinh',date(r.dob)],['Giới tính',r.gender],
        ['Quốc tịch',r.nationality],['Dân tộc',r.ethnicity],['Tôn giáo',r.religion],['Nghề nghiệp',r.occupation],
        ['Nơi sinh',r.birthplace],['Nơi đăng ký khai sinh',r.birthRegistration],['Quê quán',r.hometown],['Tình trạng hôn nhân',r.maritalStatus]
      ])) + box('Thông tin liên hệ',details([['Số điện thoại liên hệ',r.phone],['Địa chỉ email',r.email]]) + '<p class="citizen-note">Số điện thoại liên hệ được quản lý riêng với số đăng ký nhận mã OTP.</p>') +
      box('Quan hệ nhân thân', details([['Cha',r.fatherName],['Mẹ',r.motherName],['Người đại diện hợp pháp',r.representativeName,true]])) +
      `<div class="citizen-guidance"><strong>Điều chỉnh thông tin</strong><p>Công dân liên hệ người phụ trách khi cần bổ sung hoặc điều chỉnh hồ sơ.</p><a href="#/profile/requests" class="btn secondary small">Xem hồ sơ yêu cầu →</a></div>`;
  }
  function card(r) {
    const c = r.identityCard;
    if (!c || typeof c !== 'object') return box('Thông tin căn cước', '<div class="empty"><strong>Chưa cập nhật thông tin căn cước</strong>Vui lòng liên hệ người phụ trách để bổ sung ngày cấp, hạn sử dụng và nơi cấp thẻ.</div>');
    const state = cardState(c), number = c.number || r.cccd;
    const title = c.type === 'can_cuoc' ? 'CĂN CƯỚC' : 'CĂN CƯỚC CÔNG DÂN';
    return `<section class="citizen-panel"><div class="identity-card"><div class="identity-card-head"><b>${title}</b><small>HỒ SƠ ĐỒ ÁN<br>NHÓM 12</small></div><div id="identity-front"><div class="identity-card-body"><div class="identity-portrait" aria-label="Ảnh đại diện mặc định">${portrait}</div><div><div class="identity-label">Số định danh cá nhân</div><div id="identity-number" class="identity-number">•••• •••• ${esc(String(number).slice(-4))}</div><div class="identity-label">Họ và tên theo giấy tờ</div><div class="identity-name">${text(c.fullName || r.name)}</div><div class="identity-mini"><div><span class="identity-label">Ngày sinh</span>${date(c.dob || r.dob)}</div><div><span class="identity-label">Giới tính</span>${text(c.gender || r.gender)}</div><div><span class="identity-label">Quốc tịch</span>${text(c.nationality)}</div></div></div></div><div class="identity-card-foot">DỮ LIỆU MINH HỌA PHỤC VỤ ĐỒ ÁN MÔN HỌC</div></div><div id="identity-back" hidden>${details([['Ngày cấp',date(c.issuedOn)],['Có giá trị đến',date(c.expiresOn)],['Nơi cấp',c.issuer,true],['Nơi cư trú theo giấy tờ',c.address,true]])}</div></div><div class="identity-actions"><span class="badge ${state.active ? '' : 'locked'}">${state.label}</span><div><button id="identity-reveal" class="btn secondary small" aria-pressed="false">Hiện số định danh</button><button id="identity-flip" class="btn small" aria-pressed="false">Xem mặt sau</button></div></div></section>` +
      box('Chi tiết giấy tờ', details([['Loại giấy tờ',c.type === 'can_cuoc' ? 'Căn cước' : 'Căn cước công dân'],['Trạng thái',state.label],['Ngày cấp',date(c.issuedOn)],['Ngày hết hạn',date(c.expiresOn)],['Nơi cấp',c.issuer,true],['Quê quán theo giấy tờ',c.hometown,true]])) +
      box('Thông tin theo lần cấp', '<p class="citizen-note">Nội dung trên thẻ được giữ theo lần cấp. Thông tin cư trú hiện tại được tra cứu riêng.</p><a href="#/profile/residence" class="btn secondary small">Xem thông tin cư trú →</a>');
  }
  function residence(r) {
    const address = [r.address,r.ward].filter(Boolean).join(', ');
    return `<div class="citizen-residence-grid">${box('Nơi thường trú',`<p class="citizen-address">${text(address)}</p>`)}${box('Nơi tạm trú',`<p class="citizen-address">${text(r.temporaryAddress)}</p>`)}</div>` +
      box('Nơi ở hiện tại',details([['Địa chỉ',r.currentAddress || address,true],['Cập nhật gần nhất',r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('vi-VN') : '',true]])) +
      box('Hộ gia đình',details([['Mã hộ',r.householdCode],['Chủ hộ',r.householdHead],['Quan hệ với chủ hộ',r.householdRelation],['Đơn vị quản lý',r.ward]])) +
      '<div class="citizen-guidance"><strong>Lịch sử cư trú</strong><p>Lịch sử chuyển hộ và thay đổi nơi cư trú sẽ được hiển thị sau khi các nghiệp vụ tương ứng được ghi nhận.</p></div>';
  }
  function requests(r) {
    const rows = Array.isArray(r.requests) ? r.requests.filter(x=>x && typeof x === 'object').slice(0,50) : [];
    if (!rows.length) return box('Hồ sơ đã gửi','<div class="empty"><strong>Chưa có hồ sơ yêu cầu</strong>Khi có yêu cầu được ghi nhận cho tài khoản của bạn, nội dung và tiến trình giải quyết sẽ xuất hiện tại đây.</div>');
    const statuses = {processing:'Đang xử lý',complete:'Hoàn thành',received:'Đã tiếp nhận',supplement:'Cần bổ sung',rejected:'Từ chối'};
    return `<div class="citizen-request-stats"><div><strong>${rows.length}</strong><span>Tổng hồ sơ</span></div><div><strong>${rows.filter(x=>x.status !== 'complete' && x.status !== 'rejected').length}</strong><span>Đang giải quyết</span></div><div><strong>${rows.filter(x=>x.status === 'complete').length}</strong><span>Hoàn thành</span></div></div>` + rows.map(x=>
      `<section class="citizen-panel"><div class="citizen-request-title"><div><p class="eyebrow">${text(x.code)}</p><h2>${text(x.title)}</h2></div><span class="badge">${statuses[x.status] || 'Chưa xác định'}</span></div>${details([['Ngày gửi',date(x.submittedOn)],['Đơn vị tiếp nhận',x.unit]])}<details class="citizen-request-detail"><summary>Xem nội dung và tiến trình</summary>${details([['Nội dung đề nghị',x.description,true],['Phản hồi / kết quả',x.result,true]])}<ol class="citizen-timeline">${(Array.isArray(x.history) ? x.history : []).filter(e=>e&&typeof e==='object').slice(0,30).map(e=>`<li><time>${date(e.date)}</time><strong>${text(e.title)}</strong><p>${text(e.description)}</p></li>`).join('')}</ol></details></section>`).join('');
  }
  function html(r, page, member) {
    page = Object.hasOwn(pages,page) ? page : 'personal';
    const bodies = {personal,card,residence,requests};
    return `<div class="workspace citizen-workspace arrive"><aside class="workspace-nav citizen-nav"><p class="nav-label">HỒ SƠ CỦA TÔI</p><nav aria-label="Điều hướng hồ sơ công dân">${Object.entries(pages).map(([key,label])=>`<a href="#/profile/${key}" ${key===page?'class="active" aria-current="page"':''}>${label}</a>`).join('')}</nav>${member ? '<div class="nav-bottom"><a href="#/admin">Quản lý hồ sơ</a><a href="database.html">Sơ đồ database</a></div>' : ''}</aside><main id="portal-main" class="workspace-main citizen-main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">CỔNG THÔNG TIN CÁ NHÂN</p><h1>${pages[page]}</h1><p>Thông tin theo hồ sơ đã được ghi nhận trên hệ thống.</p></div><button id="citizen-logout" class="btn secondary small">Đăng xuất</button></div>${bodies[page](r)}</main></div>`;
  }
  function bind(r) {
    const reveal = document.getElementById('identity-reveal'), flip = document.getElementById('identity-flip');
    if (reveal) reveal.onclick = () => {
      const show = reveal.getAttribute('aria-pressed') !== 'true'; reveal.setAttribute('aria-pressed',String(show));
      reveal.textContent = show ? 'Ẩn số định danh' : 'Hiện số định danh';
      const number = String(r.identityCard.number || r.cccd);
      document.getElementById('identity-number').textContent = show ? number.replace(/(\d{4})(?=\d)/g,'$1 ') : '•••• •••• '+number.slice(-4);
    };
    if (flip) flip.onclick = () => {
      const back = flip.getAttribute('aria-pressed') !== 'true'; flip.setAttribute('aria-pressed',String(back));
      flip.textContent = back ? 'Xem mặt trước' : 'Xem mặt sau';
      document.getElementById('identity-front').hidden = back; document.getElementById('identity-back').hidden = !back;
    };
  }
  window.CitizenProfile = Object.freeze({html,bind,cardState});
})();
