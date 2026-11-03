const apiBase = "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api";
const mailerApiBase = "https://zyro-club-form.onrender.com/api/admin";

const state = {
  auth: "",
  config: null,
  savedConfig: null,
  updatedAt: null,
  registrations: [],
  counts: { all: 0, new: 0, approved: 0, rejected: 0 },
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1, from: 0, to: 0 },
  statusFilter: "all",
  search: "",
  sort: "newest",
  selected: new Set(),
  activeDetail: null,
  optionCategory: "duration",
  emailTemplateKey: "approved",
  pendingDecision: null,
  dirty: false,
  dirtyChanges: [],
  configRevision: 0,
  savingConfig: false,
  saveError: "",
  deleting: new Set(),
  requestSequence: 0,
  mailSenderConfigured: false,
};

const loginView = document.querySelector("[data-login-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginStatus = document.querySelector("[data-login-status]");
const shell = document.querySelector("[data-admin-shell]");
const updatedLabel = document.querySelector("[data-updated]");
const screenTitle = document.querySelector("[data-screen-title]");
const registrationList = document.querySelector("[data-registration-list]");
const registrationStatus = document.querySelector("[data-registration-status]");
const searchInput = document.querySelector("[data-search]");
const sortSelect = document.querySelector("[data-sort]");
const pageSizeSelect = document.querySelector("[data-page-size]");
const selectPage = document.querySelector("[data-select-page]");
const bulkBar = document.querySelector("[data-bulk-bar]");
const selectedCount = document.querySelector("[data-selected-count]");
const pageInfo = document.querySelector("[data-page-info]");
const pagePrev = document.querySelector("[data-page-prev]");
const pageNext = document.querySelector("[data-page-next]");
const saveStatus = document.querySelector("[data-save-status]");
const saveButton = document.querySelector("[data-save-config]");
const revertButton = document.querySelector("[data-revert-config]");
const refreshButton = document.querySelector("[data-refresh]");
const syncStatus = document.querySelector("[data-sync-status]");
const changeIndicator = document.querySelector("[data-change-indicator]");
const changeSummary = document.querySelector("[data-change-summary]");
const changeHint = document.querySelector("[data-change-hint]");
const changeCount = document.querySelector("[data-change-count]");
const changeList = document.querySelector("[data-change-list]");
const toastRegion = document.querySelector("[data-toast-region]");
const confirmDialog = document.querySelector("[data-confirm-dialog]");
const confirmTitle = document.querySelector("[data-confirm-title]");
const confirmMessage = document.querySelector("[data-confirm-message]");
const confirmAccept = document.querySelector("[data-confirm-accept]");
const confirmCancel = document.querySelector("[data-confirm-cancel]");
const detailBackdrop = document.querySelector("[data-detail-backdrop]");
const detailDrawer = document.querySelector("[data-detail-drawer]");
const detailStatus = document.querySelector("[data-detail-status]");
const detailAction = document.querySelector("[data-detail-approve]");
const emailDialog = document.querySelector("[data-email-dialog]");
const emailComposeForm = document.querySelector("[data-email-compose-form]");
const emailComposeTitle = document.querySelector("[data-email-compose-title]");
const emailComposeDescription = document.querySelector("[data-email-compose-description]");
const composeRecipient = document.querySelector("[data-compose-recipient]");
const composeSend = document.querySelector("[data-compose-send]");
const composeEmailHelp = document.querySelector("[data-compose-email-help]");
const composeRejectOptions = document.querySelector("[data-compose-reject-options]");
const composeTemplateFields = document.querySelector("[data-compose-template-fields]");
const composeCustomFields = document.querySelector("[data-compose-custom-fields]");
const composeReason = document.querySelector("[data-compose-reason]");
const composeSubject = document.querySelector("[data-compose-subject]");
const composeBody = document.querySelector("[data-compose-body]");
const composePreview = document.querySelector("[data-compose-preview]");
const composeConfirm = document.querySelector("[data-email-compose-confirm]");
const mailSenderStatus = document.querySelector("[data-mail-sender-status]");
const mailSenderEmail = document.querySelector("[data-mail-sender-email]");
const mailTestRecipient = document.querySelector("[data-mail-test-recipient]");
const mailVerifyButton = document.querySelector("[data-mail-verify]");
const mailSendTestButton = document.querySelector("[data-mail-send-test]");
const mailSenderMessage = document.querySelector("[data-mail-sender-message]");

const statusLabels = {
  new: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

const DEFAULT_REJECTION_REASON = "Hiện tại CLB ưu tiên những bạn có thể sinh hoạt cùng nhóm lâu dài.";

const defaultEmailTemplates = {
  design: {
    logoUrl: "https://zyro-volleyball-club.onrender.com/assets/zyro-logo.webp",
    brandName: "ZYRO VOLLEYBALL CLUB",
    tagline: "PLAY TOGETHER. GROW TOGETHER.",
    headerColor: "#0b2d5f",
    accentColor: "#d71e32",
    footerText: "Email tự động từ ZYRO Volleyball Club. Vui lòng không trả lời email này.",
  },
  approved: {
    subject: "ZYRO | Đăng ký của bạn đã được chấp nhận!",
    preheader: "Chào mừng bạn đến với ZYRO Volleyball Club.",
    title: "Bạn đã được ZYRO chấp nhận!",
    showProfile: true,
    bodyHtml: "<p>Chào <strong>{{zalo_name}}</strong>! 🏐</p><p>Ban quản trị ZYRO đã xem xét và chấp nhận đơn đăng ký của bạn.</p><p>Yêu cầu tham gia nhóm Zalo hiện đang chờ phó nhóm phê duyệt. Bạn vui lòng chờ thông báo nhé!</p><p>Hẹn gặp bạn trên sân!</p>",
  },
  rejected: {
    subject: "ZYRO | Phản hồi đăng ký thành viên",
    preheader: "Cảm ơn bạn đã quan tâm đến ZYRO Volleyball Club.",
    title: "Cảm ơn bạn đã quan tâm đến ZYRO",
    showProfile: true,
    bodyHtml: "<p>Chào <strong>{{zalo_name}}</strong>,</p><p>Sau khi xem xét thông tin đăng ký và mong muốn tham gia của bạn, Ban quản trị rất tiếc hiện tại chưa thể chấp nhận đăng ký.</p><p><strong>Lý do:</strong> {{reason}}</p><p>Cảm ơn bạn đã dành thời gian tìm hiểu và đăng ký tham gia ZYRO. Chúc bạn luôn có những trận đấu vui vẻ!</p>",
  },
};

function ensureEmailTemplates(config) {
  const current = config.emailTemplates || {};
  config.emailTemplates = {
    design: { ...defaultEmailTemplates.design, ...(current.design || {}) },
    approved: { ...defaultEmailTemplates.approved, ...(current.approved || {}) },
    rejected: { ...defaultEmailTemplates.rejected, ...(current.rejected || {}) },
  };
  return config.emailTemplates;
}

function authHeaders(extra = {}) {
  return { Authorization: state.auth, ...extra };
}

async function api(path, options = {}, needsAuth = false) {
  const response = await fetch(`${apiBase}${path}`, {
    cache: "no-store",
    ...options,
    headers: needsAuth ? authHeaders(options.headers || {}) : (options.headers || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function mailerApi(path, options = {}) {
  const response = await fetch(mailerApiBase + path, {
    cache: "no-store",
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Không kết nối được dịch vụ email.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function setMailSenderMessage(message, stateName = "") {
  mailSenderMessage.textContent = message;
  mailSenderMessage.dataset.state = stateName;
}

async function loadMailSenderSettings() {
  if (!state.auth) return;
  mailSenderStatus.textContent = "Đang kiểm tra Google Apps Script…";
  mailSenderStatus.dataset.state = "";
  try {
    const data = await mailerApi("/email-settings");
    state.mailSenderConfigured = Boolean(data.configured);
    mailSenderEmail.value = data.senderEmail || "";
    mailSenderStatus.dataset.state = data.configured ? "ready" : "missing";
    mailSenderStatus.textContent = data.configured
      ? "Google Apps Script đã kết nối" + (data.senderEmail ? ": " + data.senderEmail : "") + (Number.isFinite(data.remainingDailyQuota) ? " · còn " + data.remainingDailyQuota + " lượt nhận trong hạn mức hôm nay" : "")
      : "Chưa cấu hình Google Apps Script Mail Relay trên Render.";
  } catch (error) {
    mailSenderStatus.dataset.state = "error";
    mailSenderStatus.textContent = error.message || "Chưa kết nối được Google Apps Script.";
  }
}

async function verifyMailSender() {
  mailVerifyButton.disabled = true;
  mailVerifyButton.textContent = "Đang kiểm tra…";
  setMailSenderMessage("Đang kiểm tra kết nối HTTPS tới Google Apps Script…", "loading");
  try {
    const result = await mailerApi("/email-settings/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setMailSenderMessage(result.message || "Kết nối Google Apps Script thành công.", "success");
    await loadMailSenderSettings();
  } catch (error) {
    setMailSenderMessage(error.message || "Không kiểm tra được Google Apps Script.", "error");
  } finally {
    mailVerifyButton.disabled = false;
    mailVerifyButton.textContent = "Kiểm tra kết nối";
  }
}

async function sendTestMail() {
  const to = mailTestRecipient.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    setMailSenderMessage("Nhập email của bạn để nhận thư thử.", "error");
    mailTestRecipient.focus();
    return;
  }
  mailSendTestButton.disabled = true;
  mailSendTestButton.textContent = "Đang gửi…";
  setMailSenderMessage("Đang gửi email thử đến " + to + "…", "loading");
  try {
    const result = await mailerApi("/email-settings/test-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    setMailSenderMessage(result.message || ("Google đã tiếp nhận email thử đến " + to + ". Hãy kiểm tra cả hộp thư Spam nếu chưa thấy."), "success");
    await loadMailSenderSettings();
  } catch (error) {
    setMailSenderMessage(error.message || "Không gửi được email thử qua Google Apps Script.", "error");
  } finally {
    mailSendTestButton.disabled = false;
    mailSendTestButton.textContent = "Gửi email thử";
  }
}


function clone(value) {
  return structuredClone(value);
}

function collectConfigChanges(before, after, path = [], changes = []) {
  if (Array.isArray(before) || Array.isArray(after)) {
    const oldItems = Array.isArray(before) ? before : [];
    const newItems = Array.isArray(after) ? after : [];
    const toMap = (items) => new Map(items.map((item, index) => [
      item && typeof item === "object" && item.id ? String(item.id) : String(index),
      { item, index },
    ]));
    const oldMap = toMap(oldItems);
    const newMap = toMap(newItems);
    const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

    keys.forEach((key) => {
      const oldEntry = oldMap.get(key);
      const newEntry = newMap.get(key);
      if (!newEntry) {
        changes.push({ path: [...path, oldEntry.index], kind: "removed", item: oldEntry.item });
      } else if (!oldEntry) {
        changes.push({ path: [...path, newEntry.index], kind: "added", item: newEntry.item });
      } else {
        collectConfigChanges(oldEntry.item, newEntry.item, [...path, newEntry.index], changes);
      }
    });
    return changes;
  }

  if (before && after && typeof before === "object" && typeof after === "object") {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((key) => collectConfigChanges(before[key], after[key], [...path, key], changes));
    return changes;
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    changes.push({ path, kind: "updated" });
  }
  return changes;
}

function configChangeLabel(change) {
  const [section, ...rest] = change.path;
  const sectionLabels = {
    hero: "Trang chủ",
    schedule: "Lịch sân",
    principles: "Nguyên tắc nhóm",
    signup: "Form đăng ký",
    contacts: "Người liên hệ",
    formOptions: "Tuỳ chọn form",
    emailTemplates: "Email duyệt & từ chối",
  };
  const fieldLabels = {
    titleLine1: "Tiêu đề dòng 1",
    titleLine2: "Tiêu đề dòng 2",
    lead: "Mô tả",
    day: "Ngày",
    start: "Giờ bắt đầu",
    end: "Giờ kết thúc",
    title: "Tiêu đề",
    body: "Nội dung",
    intro: "Giới thiệu",
    privacyNote: "Ghi chú bảo mật",
    successTitle: "Tiêu đề thành công",
    successMessage: "Thông báo thành công",
    name: "Tên",
    role: "Chức vụ",
    phone: "Số điện thoại",
    label: "Nhãn hiển thị",
    description: "Mô tả",
  };
  const optionLabels = {
    duration: "Thời gian tham gia",
    gender: "Giới tính",
    position: "Vị trí",
    level: "Trình độ",
  };
  const sectionLabel = sectionLabels[section] || section;
  const actionLabel = change.kind === "added" ? "Đã thêm" : change.kind === "removed" ? "Đã xóa" : "Đã sửa";

  if (change.kind !== "updated") {
    if (section === "formOptions") {
      const category = optionLabels[rest[0]] || rest[0];
      const itemLabel = change.item?.label || `Lựa chọn ${Number(rest[1]) + 1}`;
      return `${sectionLabel} · ${category} · ${itemLabel} · ${actionLabel}`;
    }
    if (section === "schedule") return `${sectionLabel} · ${change.item?.day || `Buổi ${Number(rest[0]) + 1}`} · ${actionLabel}`;
    if (section === "contacts") return `${sectionLabel} · ${change.item?.name || `Người liên hệ ${Number(rest[0]) + 1}`} · ${actionLabel}`;
    if (section === "principles") return `${sectionLabel} · ${change.item?.title || `Nguyên tắc ${Number(rest[0]) + 1}`} · ${actionLabel}`;
    const itemIndex = Number(rest.at(-1));
    const itemLabel = Number.isInteger(itemIndex) ? `Mục ${itemIndex + 1}` : "Mục";
    return `${sectionLabel} · ${itemLabel} · ${actionLabel}`;
  }

  if (section === "formOptions") {
    const category = optionLabels[rest[0]] || rest[0];
    const itemIndex = Number(rest[1]);
    const itemLabel = Number.isInteger(itemIndex) ? `Lựa chọn ${itemIndex + 1}` : "Lựa chọn";
    return `${sectionLabel} · ${category} · ${itemLabel} · ${fieldLabels[rest[2]] || rest[2]}`;
  }

  if (["schedule", "principles", "contacts"].includes(section)) {
    const itemIndex = Number(rest[0]);
    const item = state.config?.[section]?.[itemIndex];
    const itemLabel = section === "schedule"
      ? (item?.day || `Buổi ${itemIndex + 1}`)
      : section === "contacts"
        ? (item?.name || `Người liên hệ ${itemIndex + 1}`)
        : (item?.title || `Nguyên tắc ${itemIndex + 1}`);
    return `${sectionLabel} · ${itemLabel} · ${fieldLabels[rest[1]] || rest[1]}`;
  }

  return `${sectionLabel} · ${fieldLabels[rest[0]] || rest[0]}`;
}

function updateChangeTracker() {
  const count = state.dirtyChanges.length;
  state.dirty = count > 0;
  changeCount.textContent = String(count);
  changeSummary.textContent = count ? `${count} thay đổi chưa lưu` : "Chưa có thay đổi chưa lưu";
  changeHint.textContent = count
    ? "Các mục dưới đây chỉ được áp dụng lên website sau khi lưu."
    : state.updatedAt
      ? `Đã lưu lần cuối ${new Date(state.updatedAt).toLocaleString("vi-VN")}.`
      : "Cấu hình đã đồng bộ với website public.";
  changeList.replaceChildren();
  state.dirtyChanges.slice(0, 6).forEach((change) => {
    const item = document.createElement("li");
    item.textContent = configChangeLabel(change);
    changeList.append(item);
  });
  if (count > 6) {
    const item = document.createElement("li");
    item.textContent = `Và ${count - 6} thay đổi khác`;
    changeList.append(item);
  }
  changeList.hidden = count === 0;
  changeIndicator.hidden = count === 0;
  changeIndicator.textContent = count ? `${count} chưa lưu` : "";
  saveButton.disabled = !state.dirty || state.savingConfig;
  revertButton.disabled = !state.dirty || state.savingConfig;

  if (state.savingConfig) {
    saveStatus.textContent = "Đang lưu cấu hình…";
    saveStatus.className = "save-status is-saving";
  } else if (state.saveError) {
    saveStatus.textContent = `Lưu thất bại: ${state.saveError}`;
    saveStatus.className = "save-status is-error";
  } else if (count) {
    saveStatus.textContent = `Có ${count} thay đổi chưa lưu.`;
    saveStatus.className = "save-status is-dirty";
  } else if (state.updatedAt) {
    saveStatus.textContent = "Đã lưu và website public đang sử dụng cấu hình mới nhất.";
    saveStatus.className = "save-status is-success";
  } else {
    saveStatus.textContent = "";
    saveStatus.className = "save-status";
  }
}

function setSyncStatus(message, tone = "") {
  syncStatus.textContent = message;
  syncStatus.dataset.tone = tone;
}

function notify(message, type = "info", duration = 4200) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  const copy = document.createElement("p");
  copy.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Đóng thông báo");
  close.textContent = "×";
  toast.append(copy, close);
  toastRegion.append(toast);

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.remove();
  };
  const update = (nextMessage, nextType = type, nextDuration = 4200) => {
    copy.textContent = nextMessage;
    type = nextType;
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    if (timer) clearTimeout(timer);
    if (nextDuration > 0) timer = setTimeout(dismiss, nextDuration);
  };
  close.addEventListener("click", dismiss);
  if (duration > 0) timer = setTimeout(dismiss, duration);
  return { dismiss, update };
}

let confirmPending = false;

function confirmAction({ title, message, confirmLabel = "Tiếp tục", danger = true }) {
  if (confirmPending) return Promise.resolve(false);
  confirmPending = true;
  confirmDialog.returnValue = "";
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmAccept.textContent = confirmLabel;
  confirmAccept.classList.toggle("danger-button", danger);
  confirmAccept.classList.toggle("primary-button", !danger);
  return new Promise((resolve) => {
    confirmDialog.addEventListener("close", () => {
      confirmPending = false;
      resolve(confirmDialog.returnValue === "confirm");
    }, { once: true });
    confirmDialog.showModal();
    confirmCancel.focus();
  });
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((cursor, key) => cursor[key], object);
  target[last] = value;
}

function optionLabel(category, value) {
  return state.config?.formOptions?.[category]?.find((item) => item.id === value)?.label || value || "Chưa có";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function emailTokenValues(item = {}, reason = "") {
  return {
    zalo_name: escapeHtml(item.zaloName || "Minh Anh"),
    duration: escapeHtml(optionLabel("duration", item.duration || "long")),
    gender: escapeHtml(optionLabel("gender", item.gender || "female")),
    position: escapeHtml(optionLabel("position", item.position || "attacker")),
    level: escapeHtml(optionLabel("level", item.level || "newbie")),
    goal: escapeHtml(item.goal || "Mình muốn chơi vui và làm quen những người bạn mới.").replace(/\n/g, "<br>"),
    created_at: escapeHtml(item.createdAt ? formatDate(item.createdAt, true) : "03/11/2026"),
    reason: escapeHtml(reason || DEFAULT_REJECTION_REASON),
  };
}

function renderEmailDocument(template, item = {}, reason = "", bodyOverride = null) {
  const templates = ensureEmailTemplates(state.config || {});
  const design = templates.design;
  const headerColor = /^#[0-9a-f]{6}$/i.test(design.headerColor) ? design.headerColor : "#0b2d5f";
  const accentColor = /^#[0-9a-f]{6}$/i.test(design.accentColor) ? design.accentColor : "#d71e32";
  let logoUrl = String(design.logoUrl || "").trim();
  if (!logoUrl) logoUrl = `${window.location.origin}/assets/zyro-logo.webp`;
  else if (logoUrl.startsWith("/")) logoUrl = `${window.location.origin}${logoUrl}`;
  const values = emailTokenValues(item, reason);
  const sourceBody = bodyOverride ?? template.bodyHtml ?? "";
  const body = String(sourceBody).replace(/\{\{([a-z_]+)\}\}/g, (_match, key) => values[key] ?? "");
  const profile = template.showProfile ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f1f5f9;border-radius:12px;margin:24px 0;">
      <tr><td colspan="2" style="padding:18px 18px 10px;font:700 13px Arial,sans-serif;letter-spacing:.06em;color:#0b2d5f;">THÔNG TIN ĐĂNG KÝ</td></tr>
      ${[["Tên Zalo",values.zalo_name],["Thời gian tham gia",values.duration],["Giới tính",values.gender],["Vị trí chơi",values.position],["Trình độ",values.level],["Ngày đăng ký",values.created_at]].map(([label,value]) => `<tr><td style="padding:7px 18px;color:#64748b;font:13px Arial,sans-serif;">${label}</td><td align="right" style="padding:7px 18px;color:#17263c;font:600 13px Arial,sans-serif;">${value}</td></tr>`).join("")}
      <tr><td colspan="2" style="padding:10px 18px 6px;color:#64748b;font:12px Arial,sans-serif;">MONG MUỐN KHI THAM GIA</td></tr>
      <tr><td colspan="2" style="padding:0 18px 18px;color:#334155;font:13px/1.6 Arial,sans-serif;">${values.goal}</td></tr>
    </table>` : "";

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(template.title || "ZYRO Volleyball Club")}</title></head>
  <body style="margin:0;padding:24px 10px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#17263c;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(template.preheader || "Thông báo từ ZYRO Volleyball Club")}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:18px;overflow:hidden;">
      <tr><td align="center" style="padding:26px 24px 24px;background:${headerColor};">
        <img src="${escapeHtml(logoUrl)}" alt="ZYRO" width="112" style="display:block;width:112px;max-width:100%;height:auto;margin:0 auto 10px;">
        <div style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.12em;">${escapeHtml(design.brandName || "ZYRO VOLLEYBALL CLUB")}</div>
        <div style="margin-top:7px;color:#dbe7f5;font-size:10px;letter-spacing:.13em;">${escapeHtml(design.tagline || "PLAY TOGETHER. GROW TOGETHER.")}</div>
      </td></tr>
      <tr><td style="padding:30px 28px 20px;">
        <div style="width:42px;height:4px;margin-bottom:18px;background:${accentColor};border-radius:8px;"></div>
        <h1 style="margin:0 0 18px;color:#0b2d5f;font-size:25px;line-height:1.25;">${escapeHtml(template.title || "Thông báo từ ZYRO")}</h1>
        <div style="font-size:15px;line-height:1.75;color:#475569;">${body}</div>
        ${profile}
        <div style="padding-top:18px;border-top:1px solid #e2e8f0;text-align:center;color:#0b2d5f;font-size:14px;font-weight:700;">ZYRO VOLLEYBALL CLUB</div>
      </td></tr>
      <tr><td align="center" style="padding:16px 24px 20px;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.6;">${escapeHtml(design.footerText || "Email tự động từ ZYRO Volleyball Club.")}</td></tr>
    </table>
  </body></html>`;
}

function updateEmailTemplatePreview() {
  if (!state.config?.emailTemplates) return;
  const template = state.config.emailTemplates[state.emailTemplateKey];
  const bodyEditor = document.querySelector("[data-email-body-editor]");
  const preview = document.querySelector("[data-email-preview]");
  if (template && bodyEditor && preview) {
    preview.srcdoc = renderEmailDocument(template, {}, "", bodyEditor.innerHTML);
  }
}

function renderEmailSettings() {
  const templates = ensureEmailTemplates(state.config);
  const template = templates[state.emailTemplateKey];
  document.querySelectorAll("[data-email-template-tab]").forEach((button) => {
    const active = button.dataset.emailTemplateTab === state.emailTemplateKey;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-email-bind]").forEach((input) => {
    const key = input.dataset.emailBind;
    const value = template[key];
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value || "";
    input.oninput = () => {
      template[key] = input.type === "checkbox" ? input.checked : input.value;
      markDirty();
      updateEmailTemplatePreview();
    };
    input.onchange = input.oninput;
  });

  const bodyEditor = document.querySelector("[data-email-body-editor]");
  bodyEditor.innerHTML = template.bodyHtml || "";
  bodyEditor.oninput = () => {
    template.bodyHtml = bodyEditor.innerHTML;
    markDirty();
    updateEmailTemplatePreview();
  };

  document.querySelectorAll("[data-email-design]").forEach((input) => {
    const key = input.dataset.emailDesign;
    input.value = templates.design[key] || "";
    input.oninput = () => {
      templates.design[key] = input.value;
      markDirty();
      updateEmailTemplatePreview();
    };
    input.onchange = input.oninput;
  });
  updateEmailTemplatePreview();
}

function insertTextAtCursor(editor, text) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) {
    editor.append(document.createTextNode(text));
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function currentRejectMode() {
  return document.querySelector("[data-compose-mode]:checked")?.value || "template";
}

function updateComposePreview() {
  const pending = state.pendingDecision;
  if (!pending || !state.config?.emailTemplates) return;
  const isApproval = pending.status === "approved";
  const mode = isApproval ? "template" : currentRejectMode();
  const template = state.config.emailTemplates[isApproval ? "approved" : "rejected"];
  const bodyOverride = isApproval || mode === "custom" ? composeBody.innerHTML : null;
  composePreview.srcdoc = renderEmailDocument(template, pending.item, composeReason.value, bodyOverride);
  composeEmailHelp.textContent = composeRecipient.value.trim()
    ? `Email sẽ được gửi đến ${composeRecipient.value.trim()} khi bạn xác nhận.`
    : "Chưa có email trong hồ sơ. Có thể nhập email tại đây hoặc chỉ cập nhật trạng thái mà không gửi email.";
  composeConfirm.textContent = composeSend.checked
    ? (isApproval ? "Gửi email & duyệt thành viên" : "Gửi email & từ chối")
    : "Chỉ cập nhật trạng thái";
  composeSend.disabled = !composeRecipient.value.trim();
  if (!composeRecipient.value.trim()) composeSend.checked = false;
}

function updateComposeMode() {
  const mode = currentRejectMode();
  composeReason.setCustomValidity("");
  composeTemplateFields.hidden = mode !== "template";
  composeCustomFields.hidden = mode !== "custom";
  if (mode === "custom" && !composeBody.dataset.customInitialized) {
    composeSubject.value = "ZYRO | Phản hồi riêng từ Ban quản trị";
    composeBody.innerHTML = "<p>Chào <strong>{{zalo_name}}</strong>,</p><p></p><p>Thân mến,<br>Ban quản trị ZYRO Volleyball Club</p>";
    composeBody.dataset.customInitialized = "true";
  }
  updateComposePreview();
}

function openDecisionComposer(item, nextStatus) {
  if (!new Set(["approved", "rejected"]).has(nextStatus)) return;
  state.pendingDecision = { item, status: nextStatus };
  const isApproval = nextStatus === "approved";
  const template = state.config.emailTemplates[isApproval ? "approved" : "rejected"];
  emailComposeTitle.textContent = isApproval ? "Chấp nhận đăng ký" : "Từ chối đăng ký";
  emailComposeDescription.textContent = `Bạn đang xử lý hồ sơ của ${item.zaloName}. Kiểm tra nội dung trước khi xác nhận.`;
  composeRecipient.value = item.email || "";
  composeSend.checked = Boolean(item.email);
  composeSend.disabled = !item.email;
  composeRejectOptions.hidden = isApproval;
  composeTemplateFields.hidden = isApproval;
  composeCustomFields.hidden = !isApproval;
  composeReason.value = "";
  composeSubject.value = template.subject;
  composeBody.innerHTML = template.bodyHtml;
  composeBody.dataset.customInitialized = isApproval ? "true" : "";
  document.querySelectorAll("[data-compose-mode]").forEach((radio) => { radio.checked = radio.value === "template"; });
  if (isApproval) composeCustomFields.hidden = false;
  updateComposePreview();
  emailDialog.showModal();
  composeRecipient.focus();
}

function closeEmailComposer() {
  if (emailDialog.open) emailDialog.close();
  state.pendingDecision = null;
}

async function submitDecision(event) {
  event.preventDefault();
  const pending = state.pendingDecision;
  if (!pending) return;
  composeRecipient.setCustomValidity("");
  composeReason.setCustomValidity("");
  const email = composeRecipient.value.trim();
  const sendEmail = composeSend.checked;
  const isApproval = pending.status === "approved";
  const mode = isApproval ? "template" : currentRejectMode();
  const reason = composeReason.value.trim();
  const subject = composeSubject.value.trim();
  const bodyHtml = composeBody.innerHTML.trim();

  if (sendEmail && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    composeRecipient.setCustomValidity("Nhập email hợp lệ để gửi thông báo.");
    composeRecipient.reportValidity();
    composeRecipient.focus();
    return;
  }
  composeRecipient.setCustomValidity("");
  if (!isApproval && mode === "template" && sendEmail && reason.length > 0 && reason.length < 5) {
    composeReason.setCustomValidity("Nhập lý do cụ thể để ứng viên hiểu phản hồi của CLB.");
    composeReason.reportValidity();
    composeReason.focus();
    return;
  }
  if (!isApproval && mode === "template" && sendEmail && !state.config.emailTemplates.rejected.bodyHtml.includes("{{reason}}")) {
    notify("Mẫu từ chối cần có biến {{reason}} để đưa lý do riêng vào email. Hãy thêm biến này trong phần cài đặt mẫu.", "warning", 6500);
    return;
  }
  composeReason.setCustomValidity("");
  if ((isApproval || mode === "custom") && sendEmail && (!subject || !bodyHtml)) {
    notify("Email cần có tiêu đề và nội dung trước khi gửi.", "warning");
    return;
  }

  composeConfirm.disabled = true;
  composeConfirm.textContent = sendEmail ? "Đang gửi email…" : "Đang cập nhật…";
  try {
    const body = await api(`/registrations/${encodeURIComponent(pending.item.id)}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: pending.status,
        email,
        sendEmail,
        emailMode: mode,
        reason,
        subject: isApproval || mode === "custom" ? subject : undefined,
        bodyHtml: isApproval || mode === "custom" ? bodyHtml : undefined,
      }),
    }, true);

    pending.item.email = email;
    applyStatusLocally(pending.item.id, pending.status);
    const name = pending.item.zaloName;
    closeEmailComposer();
    if (!detailDrawer.hidden) closeDetail();
    notify(body.emailSent ? `Đã gửi email và cập nhật trạng thái cho ${name}.` : `Đã cập nhật trạng thái của ${name}; không gửi email.`, "success");
    void loadRegistrations({ keepSelection: true, silent: true });
  } catch (error) {
    notify(error.message || "Không xử lý được quyết định này.", "error", 6500);
  } finally {
    composeConfirm.disabled = false;
    if (state.pendingDecision) updateComposePreview();
  }
}

function markDirty() {
  state.configRevision += 1;
  state.dirtyChanges = state.savedConfig
    ? collectConfigChanges(state.savedConfig, state.config)
    : [];
  if (!state.dirtyChanges.length) state.saveError = "";
  updateChangeTracker();
}

function markSaved(updatedAt, savedConfig = state.config) {
  state.savedConfig = clone(savedConfig);
  state.updatedAt = updatedAt;
  state.saveError = "";
  updatedLabel.textContent = updatedAt ? `Cập nhật ${new Date(updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
  state.dirtyChanges = collectConfigChanges(state.savedConfig, state.config);
  updateChangeTracker();
}

function switchScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name;
  });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.nav === name);
  });
  screenTitle.textContent = name === "settings" ? "Giao diện & nội dung" : "Đăng ký";
}

function renderCounts() {
  Object.entries(state.counts).forEach(([key, value]) => {
    const node = document.querySelector(`[data-count-status="${key}"]`);
    if (node) node.textContent = value;
  });
}

function renderPagination() {
  const { page, totalPages, total, from, to } = state.pagination;
  pageInfo.textContent = total ? `Trang ${page} / ${totalPages}` : "Trang 1 / 1";
  pagePrev.disabled = page <= 1;
  pageNext.disabled = page >= totalPages || total === 0;
  registrationStatus.textContent = total
    ? `Đang xem ${from}–${to} / ${total} đăng ký`
    : "0 đăng ký";
}

function renderSelection() {
  const selectedOnPage = state.registrations.filter((item) => state.selected.has(item.id)).length;
  const allSelected = state.registrations.length > 0 && selectedOnPage === state.registrations.length;
  selectPage.checked = allSelected;
  selectPage.indeterminate = selectedOnPage > 0 && !allSelected;

  selectedCount.textContent = state.selected.size;
  bulkBar.hidden = state.selected.size === 0;
}

function formatDate(value, includeTime = false) {
  const options = includeTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "2-digit" };
  return new Date(value).toLocaleString("vi-VN", options);
}

function updateDetailActionLabel() {
  detailAction.textContent = detailStatus.value === "approved"
    ? "Duyệt thành viên"
    : detailStatus.value === "rejected"
      ? "Từ chối đăng ký"
      : "Đưa về chờ duyệt";
}

function openDetail(item) {
  state.activeDetail = item;
  document.querySelector("[data-detail-name]").textContent = item.zaloName;
  document.querySelector("[data-detail-date]").textContent = `Gửi lúc ${formatDate(item.createdAt, true)}`;
  document.querySelector("[data-detail-email]").textContent = item.email || "Chưa cung cấp";
  document.querySelector("[data-detail-duration]").textContent = optionLabel("duration", item.duration);
  document.querySelector("[data-detail-gender]").textContent = optionLabel("gender", item.gender);
  document.querySelector("[data-detail-position]").textContent = optionLabel("position", item.position);
  document.querySelector("[data-detail-level]").textContent = optionLabel("level", item.level);
  document.querySelector("[data-detail-goal]").textContent = item.goal;
  document.querySelector("[data-detail-goal-count]").textContent = `${item.goal.length} / 500 ký tự`;
  detailStatus.value = item.status;
  updateDetailActionLabel();
  detailBackdrop.hidden = false;
  detailDrawer.hidden = false;
  document.body.classList.add("detail-open");
  shell.inert = true;
  detailDrawer.querySelector("[data-detail-close]")?.focus();
}

function closeDetail() {
  state.activeDetail = null;
  detailBackdrop.hidden = true;
  detailDrawer.hidden = true;
  document.body.classList.remove("detail-open");
  shell.inert = false;
}

function createRegistrationRow(item) {
  const row = document.createElement("article");
  row.className = "registration-row";
  row.dataset.registrationId = item.id;

  const selectCell = document.createElement("label");
  selectCell.className = "select-cell";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selected.has(item.id);
  checkbox.setAttribute("aria-label", `Chọn ${item.zaloName}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.selected.add(item.id);
    else state.selected.delete(item.id);
    renderSelection();
  });
  selectCell.append(checkbox);

  const name = document.createElement("div");
  name.className = "registration-name";
  const strong = document.createElement("strong");
  strong.textContent = item.zaloName;
  const duration = document.createElement("span");
  duration.textContent = optionLabel("duration", item.duration);
  name.append(strong, duration);

  const profile = document.createElement("div");
  profile.className = "registration-profile";
  profile.textContent = `${optionLabel("gender", item.gender)} · ${optionLabel("position", item.position)} · ${optionLabel("level", item.level)}`;

  const goal = document.createElement("div");
  goal.className = "registration-goal";
  const goalPreview = document.createElement("p");
  goalPreview.className = "registration-goal-preview";
  goalPreview.textContent = item.goal;
  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.className = "detail-open";
  detailButton.textContent = item.goal.length > 110 ? "Xem đầy đủ" : "Xem chi tiết";
  detailButton.addEventListener("click", () => openDetail(item));
  goal.append(goalPreview, detailButton);

  const date = document.createElement("time");
  date.className = "registration-date";
  date.dateTime = item.createdAt;
  date.textContent = formatDate(item.createdAt);

  const select = document.createElement("select");
  select.setAttribute("aria-label", `Trạng thái của ${item.zaloName}`);
  Object.entries(statusLabels).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === item.status;
    select.append(option);
  });
  select.addEventListener("change", async () => {
    const previous = item.status;
    const nextStatus = select.value;
    if (nextStatus === previous) return;
    if (nextStatus !== "new") {
      select.value = previous;
      openDecisionComposer(item, nextStatus);
      return;
    }
    select.disabled = true;
    row.setAttribute("aria-busy", "true");
    const loadingToast = notify(`Đang cập nhật trạng thái của ${item.zaloName}…`, "loading", 0);
    try {
      await api(`/registrations/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      }, true);
      applyStatusLocally(item.id, nextStatus);
      loadingToast.update(`Đã cập nhật trạng thái của ${item.zaloName}.`, "success");
      void loadRegistrations({ keepSelection: true, silent: true });
    } catch (error) {
      select.value = previous;
      loadingToast.update(error.message || "Không cập nhật được trạng thái.", "error");
    } finally {
      select.disabled = false;
      row.removeAttribute("aria-busy");
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-delete-button";
  deleteButton.textContent = "Xóa";
  deleteButton.setAttribute("aria-label", `Xóa đăng ký của ${item.zaloName}`);
  deleteButton.addEventListener("click", () => deleteRegistration(item, deleteButton));

  const actions = document.createElement("div");
  actions.className = "registration-actions";
  actions.append(select, deleteButton);

  row.append(selectCell, name, profile, goal, date, actions);
  return row;
}

function applyStatusLocally(registrationId, nextStatus) {
  const item = state.registrations.find((registration) => registration.id === registrationId);
  if (!item || item.status === nextStatus) return;
  const previousStatus = item.status;
  item.status = nextStatus;
  state.counts[previousStatus] = Math.max(0, (state.counts[previousStatus] || 0) - 1);
  state.counts[nextStatus] = (state.counts[nextStatus] || 0) + 1;

  if (state.statusFilter !== "all" && state.statusFilter !== nextStatus) {
    state.registrations = state.registrations.filter((registration) => registration.id !== registrationId);
    state.selected.delete(registrationId);
    state.pagination.total = Math.max(0, state.pagination.total - 1);
    state.pagination.totalPages = Math.max(1, Math.ceil(state.pagination.total / state.pagination.pageSize));
    if (state.pagination.page > state.pagination.totalPages) state.pagination.page = state.pagination.totalPages;
  }
  const start = (state.pagination.page - 1) * state.pagination.pageSize;
  state.pagination.from = state.pagination.total ? start + 1 : 0;
  state.pagination.to = Math.min(start + state.registrations.length, state.pagination.total);
  renderRegistrations();
  if (state.statusFilter !== "all" && !state.registrations.length && state.pagination.total > 0) {
    void loadRegistrations({ keepSelection: true, silent: true });
  }
}

async function deleteRegistration(item, button) {
  if (state.deleting.has(item.id)) return;
  const confirmed = await confirmAction({
    title: "Xóa đăng ký này?",
    message: `Đăng ký của ${item.zaloName} sẽ bị xóa khỏi danh sách. Thao tác này không thể hoàn tác.`,
    confirmLabel: "Xóa đăng ký",
  });
  if (!confirmed) return;

  state.deleting.add(item.id);
  const row = button.closest(".registration-row");
  button.disabled = true;
  row?.setAttribute("aria-busy", "true");
  const loadingToast = notify(`Đang xóa đăng ký của ${item.zaloName}…`, "loading", 0);

  try {
    await api(`/registrations/${encodeURIComponent(item.id)}`, { method: "DELETE" }, true);
    state.registrations = state.registrations.filter((registration) => registration.id !== item.id);
    state.selected.delete(item.id);
    state.counts.all = Math.max(0, (state.counts.all || 0) - 1);
    state.counts[item.status] = Math.max(0, (state.counts[item.status] || 0) - 1);
    state.pagination.total = Math.max(0, state.pagination.total - 1);
    state.pagination.totalPages = Math.max(1, Math.ceil(state.pagination.total / state.pagination.pageSize));

    if (!state.registrations.length && state.pagination.page > 1) {
      state.pagination.page = Math.min(state.pagination.page - 1, state.pagination.totalPages);
    }
    const start = (state.pagination.page - 1) * state.pagination.pageSize;
    state.pagination.from = state.pagination.total ? start + 1 : 0;
    state.pagination.to = Math.min(start + state.registrations.length, state.pagination.total);
    renderRegistrations();
    loadingToast.update(`Đã xóa đăng ký của ${item.zaloName}.`, "success");

    try {
      const refreshed = await loadRegistrations({ keepSelection: true, silent: true, throwOnError: true });
      if (!refreshed) throw new Error("Danh sách chưa được xác nhận đồng bộ.");
    } catch (refreshError) {
      notify(`Đã xóa đăng ký của ${item.zaloName}, nhưng chưa tải lại được danh sách. Hãy nhấn Đồng bộ để cập nhật.`, "warning", 6500);
    }
  } catch (error) {
    const deleteRouteUnavailable = error.status === 405
      || (error.status === 404 && error.message === "Not found");
    const message = deleteRouteUnavailable
      ? "API hiện chưa bật thao tác xóa. Cần triển khai bản cập nhật zyro-api trước khi sử dụng."
      : (error.message || "Không xóa được đăng ký. Vui lòng thử lại.");
    loadingToast.update(message, "error");
    if (row?.isConnected) row.removeAttribute("aria-busy");
    if (button.isConnected) button.disabled = false;
  } finally {
    state.deleting.delete(item.id);
  }
}

function renderRegistrations() {
  renderCounts();
  renderPagination();

  if (!state.registrations.length) {
    const empty = document.createElement("p");
    empty.className = "empty-row";
    empty.textContent = state.search
      ? "Không tìm thấy tên Zalo phù hợp."
      : "Không có đăng ký trong trạng thái này.";
    registrationList.replaceChildren(empty);
    renderSelection();
    return;
  }

  registrationList.replaceChildren(...state.registrations.map(createRegistrationRow));
  renderSelection();
}

async function loadRegistrations({ keepSelection = false, silent = false, throwOnError = false } = {}) {
  const sequence = ++state.requestSequence;
  registrationStatus.textContent = "Đang tải…";
  registrationList.setAttribute("aria-busy", "true");

  const params = new URLSearchParams({
    page: String(state.pagination.page),
    pageSize: String(state.pagination.pageSize),
    status: state.statusFilter,
    sort: state.sort,
  });
  if (state.search) params.set("search", state.search);

  try {
    const body = await api(`/registrations?${params}`, {}, true);
    if (sequence !== state.requestSequence) return false;

    if (body.pagination?.total > 0 && body.pagination.page > body.pagination.totalPages) {
      state.pagination.page = body.pagination.totalPages;
      return loadRegistrations({ keepSelection, silent, throwOnError });
    }

    state.registrations = body.registrations || [];
    state.counts = body.counts || state.counts;
    state.pagination = body.pagination || state.pagination;
    if (!keepSelection) state.selected.clear();
    renderRegistrations();
    return true;
  } catch (error) {
    if (sequence !== state.requestSequence) return false;
    registrationStatus.textContent = error.status === 401
      ? "Phiên đăng nhập không còn hợp lệ."
      : "Không tải được danh sách đăng ký.";
    if (!silent) notify(error.status === 401 ? "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." : (error.message || "Không tải được danh sách đăng ký."), "error");
    if (throwOnError) throw error;
    return false;
  } finally {
    if (sequence === state.requestSequence) registrationList.removeAttribute("aria-busy");
  }
}

async function updateBulkStatus(status) {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (status !== "new") {
    notify("Để duyệt hoặc từ chối, hãy mở từng hồ sơ để chọn mẫu email và nội dung phù hợp.", "warning");
    return;
  }
  const label = "đưa về chờ duyệt";
  if (!await confirmAction({
    title: `Đưa ${ids.length} hồ sơ về chờ duyệt?`,
    message: "Các hồ sơ đã chọn sẽ trở lại trạng thái chờ duyệt. Thao tác này không gửi email.",
    confirmLabel: "Đưa về chờ duyệt",
    danger: false,
  })) return;

  const buttons = [...bulkBar.querySelectorAll("button")];
  buttons.forEach((button) => { button.disabled = true; });
  registrationStatus.textContent = `Đang ${label} ${ids.length} đăng ký…`;
  const loadingToast = notify(`Đang ${label} ${ids.length} đăng ký…`, "loading", 0);
  try {
    const body = await api("/registrations/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    }, true);
    const selectedIds = new Set(ids);
    let removedFromFilter = 0;
    state.registrations.forEach((item) => {
      if (!selectedIds.has(item.id) || item.status === status) return;
      state.counts[item.status] = Math.max(0, (state.counts[item.status] || 0) - 1);
      state.counts[status] = (state.counts[status] || 0) + 1;
      item.status = status;
      if (state.statusFilter !== "all" && state.statusFilter !== status) removedFromFilter += 1;
    });
    if (removedFromFilter) {
      state.registrations = state.registrations.filter((item) => item.status === state.statusFilter);
      state.pagination.total = Math.max(0, state.pagination.total - removedFromFilter);
      state.pagination.totalPages = Math.max(1, Math.ceil(state.pagination.total / state.pagination.pageSize));
      if (state.pagination.page > state.pagination.totalPages) state.pagination.page = state.pagination.totalPages;
    }
    const start = (state.pagination.page - 1) * state.pagination.pageSize;
    state.pagination.from = state.pagination.total ? start + 1 : 0;
    state.pagination.to = Math.min(start + state.registrations.length, state.pagination.total);
    state.selected.clear();
    renderRegistrations();
    const updatedCount = Number.isFinite(body.updated) ? body.updated : ids.length;
    const resultMessage = updatedCount === ids.length
      ? `Đã cập nhật ${updatedCount} đăng ký.`
      : `Máy chủ xác nhận đã cập nhật ${updatedCount}/${ids.length} đăng ký.`;
    loadingToast.update(resultMessage, updatedCount === ids.length ? "success" : "warning");
    void loadRegistrations({ keepSelection: true, silent: true });
  } catch (error) {
    loadingToast.update(error.message || "Không cập nhật được các đăng ký đã chọn.", "error");
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function inputField(labelText, value, onInput, type = "text") {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  label.append(span, input);
  return label;
}

function removeButton(onRemove) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-button";
  button.textContent = "Xóa";
  button.setAttribute("aria-label", "Xóa dòng");
  button.addEventListener("click", onRemove);
  return button;
}

function renderScheduleEditor() {
  const container = document.querySelector("[data-schedule-editor]");
  container.replaceChildren(...state.config.schedule.map((slot, index) => {
    const row = document.createElement("div");
    row.className = "repeat-row schedule-row";

    const dayLabel = document.createElement("label");
    const dayText = document.createElement("span");
    dayText.textContent = "Ngày";
    const daySelect = document.createElement("select");
    ["T2","T3","T4","T5","T6","T7","CN"].forEach((day) => {
      const option = document.createElement("option");
      option.value = day;
      option.textContent = day;
      option.selected = day === slot.day;
      daySelect.append(option);
    });
    daySelect.addEventListener("change", () => { slot.day = daySelect.value; markDirty(); });
    dayLabel.append(dayText, daySelect);

    const start = inputField("Bắt đầu", slot.start, (value) => { slot.start = value; markDirty(); }, "time");
    const end = inputField("Kết thúc", slot.end, (value) => { slot.end = value; markDirty(); }, "time");
    row.append(dayLabel, start, end, removeButton(() => {
      state.config.schedule.splice(index, 1);
      markDirty();
      renderScheduleEditor();
    }));
    return row;
  }));
}

function renderPrinciplesEditor() {
  const container = document.querySelector("[data-principles-editor]");
  container.replaceChildren(...state.config.principles.map((item, index) => {
    const row = document.createElement("div");
    row.className = "repeat-row principle-row";
    row.append(
      inputField("Tiêu đề", item.title, (value) => { item.title = value; markDirty(); }),
      inputField("Mô tả", item.body, (value) => { item.body = value; markDirty(); }),
      removeButton(() => {
        state.config.principles.splice(index, 1);
        markDirty();
        renderPrinciplesEditor();
      })
    );
    return row;
  }));
}

function renderContactsEditor() {
  const container = document.querySelector("[data-contacts-editor]");
  container.replaceChildren(...state.config.contacts.map((item, index) => {
    const row = document.createElement("div");
    row.className = "repeat-row contact-row";
    row.append(
      inputField("Tên", item.name, (value) => { item.name = value; markDirty(); }),
      inputField("Vai trò", item.role, (value) => { item.role = value; markDirty(); }),
      inputField("Số điện thoại", item.phone, (value) => { item.phone = value; markDirty(); }, "tel"),
      removeButton(() => {
        state.config.contacts.splice(index, 1);
        markDirty();
        renderContactsEditor();
      })
    );
    return row;
  }));
}

function renderOptionsEditor() {
  const container = document.querySelector("[data-options-editor]");
  const options = state.config.formOptions[state.optionCategory] || [];
  const withDescription = state.optionCategory === "duration";
  container.replaceChildren(...options.map((item, index) => {
    const row = document.createElement("div");
    row.className = `repeat-row option-row${withDescription ? " has-description" : ""}`;
    row.append(inputField("Nhãn hiển thị", item.label, (value) => { item.label = value; markDirty(); }));
    if (withDescription) {
      row.append(inputField("Mô tả", item.description || "", (value) => { item.description = value; markDirty(); }));
    }
    row.append(removeButton(() => {
      if (options.length <= 1) return;
      options.splice(index, 1);
      markDirty();
      renderOptionsEditor();
    }));
    return row;
  }));
}

function renderSettings() {
  document.querySelectorAll("[data-bind]").forEach((input) => {
    const path = input.dataset.bind;
    const value = path.split(".").reduce((cursor, key) => cursor?.[key], state.config);
    input.value = value || "";
    input.oninput = () => {
      setPath(state.config, path, input.value);
      markDirty();
    };
  });
  renderScheduleEditor();
  renderPrinciplesEditor();
  renderContactsEditor();
  renderOptionsEditor();
  renderEmailSettings();
}

async function loadData() {
  const configBody = await api("/config");
  state.config = clone(configBody.config);
  ensureEmailTemplates(state.config);
  state.savedConfig = clone(state.config);
  state.updatedAt = configBody.updatedAt;
  state.configRevision = 0;
  updatedLabel.textContent = state.updatedAt ? `Cập nhật ${new Date(state.updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
  renderSettings();
  markSaved(state.updatedAt, state.savedConfig);
  setSyncStatus("Đã đồng bộ", "success");
  await loadRegistrations({ throwOnError: true, silent: true });
  await loadMailSenderSettings();
}

async function refreshAll() {
  if (refreshButton.disabled) return;
  refreshButton.disabled = true;
  refreshButton.textContent = "Đang đồng bộ…";
  setSyncStatus("Đang đồng bộ dữ liệu…", "loading");
  const loadingToast = notify("Đang đồng bộ danh sách và cấu hình…", "loading", 0);
  let preserveDraft = state.dirty;
  const configRevision = state.configRevision;

  try {
    const registrationTask = loadRegistrations({ keepSelection: true, silent: true });
    const configTask = preserveDraft
      ? Promise.resolve(true)
      : api("/config").then((body) => {
        if (state.dirty || state.configRevision !== configRevision) {
          preserveDraft = true;
          return true;
        }
        state.config = clone(body.config);
        ensureEmailTemplates(state.config);
        state.savedConfig = clone(state.config);
        state.updatedAt = body.updatedAt;
        renderSettings();
        markSaved(body.updatedAt, body.config);
        return true;
      }).catch((error) => {
        setSyncStatus("Không đồng bộ được cấu hình", "error");
        loadingToast.update(error.message || "Không đồng bộ được cấu hình website.", "error");
        return false;
      });

    const [registrationsOk, configOk] = await Promise.all([registrationTask, configTask]);
    if (!registrationsOk) {
      setSyncStatus("Không đồng bộ được danh sách", "error");
      loadingToast.update("Không tải được danh sách đăng ký. Dữ liệu đang hiển thị được giữ nguyên.", "error");
      return;
    }
    if (!configOk) return;

    if (preserveDraft) {
      setSyncStatus("Danh sách đã đồng bộ · cấu hình nháp được giữ", "warning");
      loadingToast.update("Đã đồng bộ danh sách. Cấu hình chưa lưu được giữ nguyên.", "warning");
    } else {
      const stamp = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "vừa xong";
      updatedLabel.textContent = state.updatedAt ? `Cập nhật ${new Date(state.updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
      setSyncStatus(`Đã đồng bộ lúc ${stamp}`, "success");
      loadingToast.update("Đã đồng bộ danh sách và cấu hình mới nhất.", "success");
    }
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Đồng bộ";
  }
}

async function requestSwitchScreen(name) {
  if (name !== "settings" && state.dirty) {
    const accepted = await confirmAction({
      title: "Cấu hình còn thay đổi chưa lưu",
      message: "Các thay đổi vẫn được giữ khi chuyển màn hình trong phiên này. Nếu đăng xuất hoặc tải lại trang, chúng sẽ mất. Bạn vẫn muốn tiếp tục?",
      confirmLabel: "Chuyển màn hình",
      danger: false,
    });
    if (!accepted) return;
  }
  switchScreen(name);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginButton = loginForm.querySelector("button[type='submit']");
  if (loginButton.disabled) return;
  loginButton.disabled = true;
  loginButton.textContent = "Đang kiểm tra…";
  loginStatus.textContent = "Đang kiểm tra…";
  const formData = new FormData(loginForm);
  state.auth = `Basic ${btoa(`${formData.get("username")}:${formData.get("password")}`)}`;
  try {
    await loadData();
    loginView.hidden = true;
    shell.hidden = false;
    loginForm.reset();
    loginStatus.textContent = "";
  } catch (error) {
    state.auth = "";
    loginStatus.textContent = error.status === 401 ? "Sai tên đăng nhập hoặc mật khẩu." : "Không kết nối được hệ thống quản trị.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Đăng nhập";
  }
});

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => requestSwitchScreen(button.dataset.nav));
});

document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
  if (state.dirty) {
    const accepted = await confirmAction({
      title: "Đăng xuất khi còn thay đổi chưa lưu?",
      message: "Các thay đổi cấu hình chưa lưu sẽ bị bỏ khi đăng xuất.",
      confirmLabel: "Đăng xuất",
      danger: true,
    });
    if (!accepted) return;
  }
  state.auth = "";
  state.mailSenderConfigured = false;
  state.selected.clear();
  if (state.savedConfig) state.config = clone(state.savedConfig);
  state.dirtyChanges = [];
  state.dirty = false;
  state.saveError = "";
  closeDetail();
  shell.hidden = true;
  loginView.hidden = false;
  updateChangeTracker();
}));

refreshButton.addEventListener("click", refreshAll);

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = searchInput.value.trim();
    state.pagination.page = 1;
    loadRegistrations();
  }, 300);
});

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;
  state.pagination.page = 1;
  loadRegistrations();
});

pageSizeSelect.addEventListener("change", () => {
  state.pagination.pageSize = Number(pageSizeSelect.value);
  state.pagination.page = 1;
  loadRegistrations();
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.statusFilter = button.dataset.statusFilter;
    state.pagination.page = 1;
    document.querySelectorAll("[data-status-filter]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    loadRegistrations();
  });
});

selectPage.addEventListener("change", () => {
  state.registrations.forEach((item) => {
    if (selectPage.checked) state.selected.add(item.id);
    else state.selected.delete(item.id);
  });
  renderRegistrations();
});

document.querySelectorAll("[data-bulk-status]").forEach((button) => {
  button.addEventListener("click", () => updateBulkStatus(button.dataset.bulkStatus));
});

document.querySelector("[data-clear-selection]").addEventListener("click", () => {
  state.selected.clear();
  renderRegistrations();
});

pagePrev.addEventListener("click", () => {
  if (state.pagination.page <= 1) return;
  state.pagination.page -= 1;
  loadRegistrations();
});

pageNext.addEventListener("click", () => {
  if (state.pagination.page >= state.pagination.totalPages) return;
  state.pagination.page += 1;
  loadRegistrations();
});

detailBackdrop.addEventListener("click", closeDetail);
document.querySelector("[data-detail-close]").addEventListener("click", closeDetail);
detailStatus.addEventListener("change", updateDetailActionLabel);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !detailDrawer.hidden) closeDetail();
});

detailAction.addEventListener("click", async () => {
  if (!state.activeDetail) return;
  const registrationId = state.activeDetail.id;
  const item = state.activeDetail;
  const nextStatus = detailStatus.value;
  if (nextStatus === item.status) {
    closeDetail();
    return;
  }
  if (nextStatus !== "new") {
    openDecisionComposer(item, nextStatus);
    return;
  }
  detailAction.disabled = true;
  const loadingToast = notify("Đang cập nhật trạng thái đăng ký…", "loading", 0);
  try {
    await api(`/registrations/${encodeURIComponent(registrationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    }, true);
    applyStatusLocally(registrationId, nextStatus);
    closeDetail();
    loadingToast.update(`Đã cập nhật trạng thái của ${item.zaloName}.`, "success");
    void loadRegistrations({ keepSelection: true, silent: true });
  } catch (error) {
    loadingToast.update(error.message || "Không cập nhật được trạng thái.", "error");
  } finally {
    detailAction.disabled = false;
  }
});

confirmCancel.addEventListener("click", () => confirmDialog.close("cancel"));
confirmAccept.addEventListener("click", () => confirmDialog.close("confirm"));

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

document.querySelector("[data-add-schedule]").addEventListener("click", () => {
  state.config.schedule.push({ id: id("slot"), day: "T4", start: "18:30", end: "21:30" });
  markDirty();
  renderScheduleEditor();
});

document.querySelector("[data-add-principle]").addEventListener("click", () => {
  state.config.principles.push({ id: id("principle"), title: "Nguyên tắc mới", body: "Mô tả ngắn cho nguyên tắc này." });
  markDirty();
  renderPrinciplesEditor();
});

document.querySelector("[data-add-contact]").addEventListener("click", () => {
  state.config.contacts.push({ id: id("contact"), name: "Người phụ trách", role: "Phó nhóm", phone: "" });
  markDirty();
  renderContactsEditor();
});

const optionCategory = document.querySelector("[data-option-category]");
optionCategory.addEventListener("change", () => {
  state.optionCategory = optionCategory.value;
  renderOptionsEditor();
});

document.querySelectorAll("[data-email-template-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.emailTemplateKey = button.dataset.emailTemplateTab;
    renderEmailSettings();
  });
});

document.querySelectorAll("[data-email-command]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    const editor = document.querySelector("[data-email-body-editor]");
    const command = button.dataset.emailCommand;
    if (command === "createLink") {
      const url = window.prompt("Nhập đường dẫn HTTPS:");
      if (!url || !/^https:\/\//i.test(url)) return;
      editor.focus();
      document.execCommand(command, false, url);
    } else {
      editor.focus();
      document.execCommand(command, false, null);
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

document.querySelectorAll("[data-email-token]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => insertTextAtCursor(
    document.querySelector("[data-email-body-editor]"),
    button.dataset.emailToken,
  ));
});

document.querySelectorAll("[data-compose-command]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    composeBody.focus();
    document.execCommand(button.dataset.composeCommand, false, null);
    composeBody.dispatchEvent(new Event("input", { bubbles: true }));
    updateComposePreview();
  });
});

document.querySelectorAll("[data-compose-token]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    insertTextAtCursor(composeBody, button.dataset.composeToken);
    updateComposePreview();
  });
});

document.querySelectorAll("[data-compose-mode]").forEach((radio) => {
  radio.addEventListener("change", updateComposeMode);
});

composeRecipient.addEventListener("input", () => {
  composeRecipient.setCustomValidity("");
  updateComposePreview();
});
composeSend.addEventListener("change", updateComposePreview);
composeReason.addEventListener("input", () => {
  composeReason.setCustomValidity("");
  updateComposePreview();
});
composeSubject.addEventListener("input", updateComposePreview);
composeBody.addEventListener("input", updateComposePreview);
emailComposeForm.addEventListener("submit", submitDecision);

mailVerifyButton.addEventListener("click", verifyMailSender);
mailSendTestButton.addEventListener("click", sendTestMail);

document.querySelector("[data-email-compose-close]").addEventListener("click", closeEmailComposer);
document.querySelector("[data-email-compose-cancel]").addEventListener("click", closeEmailComposer);
emailDialog.addEventListener("close", () => { state.pendingDecision = null; });

document.querySelector("[data-add-option]").addEventListener("click", () => {
  const option = { id: id("option"), label: "Lựa chọn mới" };
  if (state.optionCategory === "duration") option.description = "Mô tả lựa chọn";
  state.config.formOptions[state.optionCategory].push(option);
  markDirty();
  renderOptionsEditor();
});

revertButton.addEventListener("click", async () => {
  if (!state.dirty || !state.savedConfig) return;
  const accepted = await confirmAction({
    title: "Hoàn tác các thay đổi chưa lưu?",
    message: "Toàn bộ chỉnh sửa hiện tại sẽ được đưa về cấu hình đã lưu gần nhất.",
    confirmLabel: "Hoàn tác thay đổi",
    danger: false,
  });
  if (!accepted) return;
  state.config = clone(state.savedConfig);
  state.saveError = "";
  renderSettings();
  markDirty();
  notify("Đã hoàn tác về cấu hình đã lưu gần nhất.", "info");
});

saveButton.addEventListener("click", async () => {
  if (!state.dirty || state.savingConfig) return;
  const snapshot = clone(state.config);
  state.saveError = "";
  state.savingConfig = true;
  saveButton.textContent = "Đang lưu…";
  updateChangeTracker();
  const loadingToast = notify("Đang lưu cấu hình website…", "loading", 0);
  try {
    const body = await api("/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: snapshot }),
    }, true);
    state.savedConfig = clone(body.config);
    state.updatedAt = body.updatedAt;
    if (JSON.stringify(state.config) === JSON.stringify(snapshot)) {
      state.config = clone(body.config);
      renderSettings();
    }
    state.dirtyChanges = collectConfigChanges(state.savedConfig, state.config);
    updateChangeTracker();
    updatedLabel.textContent = body.updatedAt ? `Cập nhật ${new Date(body.updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
    renderRegistrations();
    setSyncStatus("Cấu hình đã lưu", "success");
    const remainingChanges = state.dirtyChanges.length;
    loadingToast.update(
      remainingChanges
        ? `Đã lưu bản hiện tại; còn ${remainingChanges} thay đổi mới chưa lưu.`
        : "Đã lưu cấu hình. Website public sẽ sử dụng nội dung mới.",
      remainingChanges ? "warning" : "success",
    );
  } catch (error) {
    state.saveError = error.message || "Không lưu được cấu hình.";
    loadingToast.update(error.message || "Không lưu được cấu hình.", "error");
  } finally {
    state.savingConfig = false;
    saveButton.textContent = "Lưu thay đổi";
    updateChangeTracker();
  }
});
