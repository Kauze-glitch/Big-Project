/* Demo repository. Replace this adapter with authenticated server calls later. */
'use strict';
(() => {
  const KEY = 'nhom12-citizen-demo-v1';
  const states = ['not-issued', 'active', 'locked'];
  const names = ['Nguyễn An Minh', 'Trần Ngọc Hà', 'Lê Hoàng Nam', 'Phạm Thanh Mai', 'Đỗ Gia Huy', 'Vũ Thu Linh', 'Bùi Đức Anh', 'Đặng Khánh Vy', 'Ngô Hải Sơn', 'Hoàng Bảo Ngọc', 'Dương Nhật Quang', 'Võ Minh Châu'];
  const seed = () => names.map((name, i) => ({
    id: 'demo-' + (i + 1), cccd: '000000' + String(i + 1).padStart(6, '0'), name,
    dob: `${1994 + i}-0${i % 8 + 1}-12`, gender: i % 2 ? 'Nữ' : 'Nam',
    phone: '000' + String(i + 1).padStart(7, '0'), email: `congdan${i + 1}@example.invalid`,
    address: `${12 + i * 4} đường Minh Họa, Khu dân cư Mẫu`, ward: ['Phường Mẫu A', 'Phường Mẫu B', 'Phường Mẫu C'][i % 3],
    occupation: ['Nhân viên văn phòng', 'Sinh viên', 'Kinh doanh', 'Kỹ thuật viên'][i % 4],
    account: i === 2 || i === 8 ? 'locked' : i === 4 || i === 7 || i === 10 ? 'not-issued' : 'active',
    updatedAt: '2026-10-28T08:00:00+07:00'
  }));
  let volatile = null, storageWarning = false;
  function read() {
    if (volatile) return structuredClone(volatile);
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { records: seed(), events: [] };
      const data = JSON.parse(raw);
      if (!Array.isArray(data.records) || !Array.isArray(data.events) || data.records.length > 1000) throw new Error();
      const ids = new Set(), numbers = new Set();
      for (const r of data.records) {
        if (!r || typeof r.id !== 'string' || ids.has(r.id) || numbers.has(r.cccd) || !/^000\d{9}$/.test(r.cccd) || !states.includes(r.account)) throw new Error();
        for (const key of ['name','dob','gender','phone','email','address','ward','occupation','updatedAt']) if (typeof r[key] !== 'string' || r[key].length > 500) throw new Error();
        ids.add(r.id); numbers.add(r.cccd);
      }
      return data;
    } catch (_) {
      storageWarning = true;
      return { records: seed(), events: [] };
    }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); volatile = null; }
    catch (_) { volatile = structuredClone(data); storageWarning = true; }
  }
  function log(data, action, record) {
    data.events.unshift({ action, name: record.name, at: new Date().toISOString() });
    data.events = data.events.slice(0, 30);
  }
  function normalize(input, existing, records) {
    const r = {};
    for (const key of ['name','cccd','dob','gender','phone','email','address','ward','occupation']) r[key] = String(input[key] || '').trim();
    if (r.name.length < 2 || r.name.length > 80) throw new Error('Tên mẫu cần từ 2 đến 80 ký tự.');
    if (!/^000\d{9}$/.test(r.cccd)) throw new Error('CCCD mẫu cần 12 chữ số, bắt đầu bằng 000.');
    if (records.some(x => x.id !== existing?.id && x.cccd === r.cccd)) throw new Error('CCCD này đã có trong danh sách mẫu.');
    const date = new Date(r.dob + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dob) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== r.dob || r.dob < '1900-01-01' || r.dob > new Date().toISOString().slice(0, 10)) throw new Error('Ngày sinh chưa hợp lệ.');
    if (!['Nam','Nữ','Khác'].includes(r.gender)) throw new Error('Hãy chọn giới tính.');
    if (!/^000\d{7}$/.test(r.phone)) throw new Error('Số điện thoại mẫu cần 10 chữ số, bắt đầu bằng 000.');
    if (r.email && !/^[^\s@]+@example\.invalid$/.test(r.email)) throw new Error('Email mẫu dùng đuôi @example.invalid.');
    if (!['Phường Mẫu A','Phường Mẫu B','Phường Mẫu C'].includes(r.ward)) throw new Error('Hãy chọn khu vực mẫu.');
    if (!r.address || r.address.length > 200 || r.occupation.length > 100) throw new Error('Địa chỉ cần từ 1–200 ký tự; nghề nghiệp tối đa 100 ký tự.');
    return { ...r, id: existing?.id || crypto.randomUUID(), account: existing?.account || 'not-issued', updatedAt: new Date().toISOString() };
  }
  window.CitizenRepository = {
    mode: 'demo', password: 'demo123',
    get storageWarning() { return storageWarning; },
    list: () => read().records,
    get: id => read().records.find(r => r.id === id) || null,
    events: () => read().events,
    save(input, id = null) {
      const data = read(), existing = id ? data.records.find(r => r.id === id) : null;
      if (id && !existing) throw new Error('Hồ sơ không còn tồn tại. Hãy tải lại danh sách.');
      if (!id && data.records.length >= 1000) throw new Error('Bản demo hỗ trợ tối đa 1.000 hồ sơ mẫu.');
      const record = normalize(input, existing, data.records);
      if (existing) data.records[data.records.indexOf(existing)] = record; else data.records.unshift(record);
      log(data, existing ? 'Cập nhật hồ sơ' : 'Thêm hồ sơ', record); save(data); return record;
    },
    setAccount(id, next) {
      const data = read(), record = data.records.find(r => r.id === id);
      if (!record) throw new Error('Hồ sơ không tồn tại.');
      if (!(record.account === 'not-issued' && next === 'active') && !(record.account === 'active' && next === 'locked') && !(record.account === 'locked' && next === 'active')) throw new Error('Thao tác tài khoản không hợp lệ.');
      const action = record.account === 'not-issued' ? 'Cấp tài khoản mẫu' : next === 'locked' ? 'Khóa tài khoản mẫu' : 'Mở khóa tài khoản mẫu';
      record.account = next; record.updatedAt = new Date().toISOString(); log(data, action, record); save(data); return record;
    },
    checkLogin(cccd, password) {
      const r = read().records.find(r => r.cccd === cccd);
      if (!r || password !== this.password) throw new Error('CCCD hoặc mật khẩu mẫu chưa đúng.');
      if (r.account === 'not-issued') throw new Error('Hồ sơ này chưa được cấp tài khoản. Hãy cấp tài khoản trong trang quản lý mẫu.');
      if (r.account === 'locked') throw new Error('Tài khoản mẫu đang bị khóa. Hãy mở khóa trong trang quản lý.');
      return r;
    },
    reset() { volatile = null; storageWarning = false; save({ records: seed(), events: [] }); }
  };
})();
