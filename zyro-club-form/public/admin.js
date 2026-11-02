const apiBase = "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api";

const state = {
  auth: "",
  config: null,
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
  dirty: false,
  requestSequence: 0,
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
const detailBackdrop = document.querySelector("[data-detail-backdrop]");
const detailDrawer = document.querySelector("[data-detail-drawer]");
const detailStatus = document.querySelector("[data-detail-status]");
const detailAction = document.querySelector("[data-detail-approve]");

const statusLabels = {
  new: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

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

function clone(value) {
  return structuredClone(value);
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

function markDirty() {
  state.dirty = true;
  saveStatus.textContent = "Có thay đổi chưa lưu.";
  saveStatus.className = "save-status is-dirty";
}

function markSaved(updatedAt) {
  state.dirty = false;
  state.updatedAt = updatedAt;
  saveStatus.textContent = "Đã lưu và website public sẽ dùng cấu hình mới.";
  saveStatus.className = "save-status is-success";
  updatedLabel.textContent = updatedAt ? `Cập nhật ${new Date(updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
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
    select.disabled = true;
    try {
      await api(`/registrations/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: select.value }),
      }, true);
      await loadRegistrations();
    } catch (error) {
      select.value = previous;
      registrationStatus.textContent = error.message || "Không cập nhật được trạng thái.";
    } finally {
      select.disabled = false;
    }
  });

  row.append(selectCell, name, profile, goal, date, select);
  return row;
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

async function loadRegistrations({ keepSelection = false } = {}) {
  const sequence = ++state.requestSequence;
  registrationStatus.textContent = "Đang tải…";

  const params = new URLSearchParams({
    page: String(state.pagination.page),
    pageSize: String(state.pagination.pageSize),
    status: state.statusFilter,
    sort: state.sort,
  });
  if (state.search) params.set("search", state.search);

  try {
    const body = await api(`/registrations?${params}`, {}, true);
    if (sequence !== state.requestSequence) return;

    if (body.pagination?.total > 0 && body.pagination.page > body.pagination.totalPages) {
      state.pagination.page = body.pagination.totalPages;
      return loadRegistrations({ keepSelection });
    }

    state.registrations = body.registrations || [];
    state.counts = body.counts || state.counts;
    state.pagination = body.pagination || state.pagination;
    if (!keepSelection) state.selected.clear();
    renderRegistrations();
  } catch (error) {
    if (sequence !== state.requestSequence) return;
    registrationStatus.textContent = error.status === 401
      ? "Phiên đăng nhập không còn hợp lệ."
      : "Không tải được danh sách đăng ký.";
  }
}

async function updateBulkStatus(status) {
  const ids = [...state.selected];
  if (!ids.length) return;
  const label = status === "approved" ? "duyệt" : "từ chối";
  if (status === "rejected" && !window.confirm(`Từ chối ${ids.length} đăng ký đã chọn?`)) return;

  bulkBar.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  registrationStatus.textContent = `Đang ${label} ${ids.length} đăng ký…`;
  try {
    const body = await api("/registrations/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    }, true);
    state.selected.clear();
    registrationStatus.textContent = `Đã cập nhật ${body.updated || ids.length} đăng ký.`;
    await loadRegistrations();
  } catch (error) {
    registrationStatus.textContent = error.message || "Không cập nhật được các đăng ký đã chọn.";
  } finally {
    bulkBar.querySelectorAll("button").forEach((button) => { button.disabled = false; });
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
}

async function loadData() {
  const configBody = await api("/config");
  state.config = clone(configBody.config);
  state.updatedAt = configBody.updatedAt;
  updatedLabel.textContent = state.updatedAt ? `Cập nhật ${new Date(state.updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
  renderSettings();
  await loadRegistrations();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
  }
});

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => switchScreen(button.dataset.nav));
});

document.querySelector("[data-logout]").addEventListener("click", () => {
  state.auth = "";
  state.selected.clear();
  closeDetail();
  shell.hidden = true;
  loginView.hidden = false;
});

document.querySelector("[data-refresh]").addEventListener("click", () => loadRegistrations());

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
    document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
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
  const id = state.activeDetail.id;
  detailAction.disabled = true;
  try {
    await api(`/registrations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: detailStatus.value }),
    }, true);
    closeDetail();
    await loadRegistrations();
  } catch (error) {
    registrationStatus.textContent = error.message || "Không cập nhật được trạng thái.";
  } finally {
    detailAction.disabled = false;
  }
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

document.querySelector("[data-add-option]").addEventListener("click", () => {
  const option = { id: id("option"), label: "Lựa chọn mới" };
  if (state.optionCategory === "duration") option.description = "Mô tả lựa chọn";
  state.config.formOptions[state.optionCategory].push(option);
  markDirty();
  renderOptionsEditor();
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  saveStatus.textContent = "Đang lưu…";
  saveStatus.className = "save-status";
  try {
    const body = await api("/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: state.config }),
    }, true);
    state.config = clone(body.config);
    renderSettings();
    renderRegistrations();
    markSaved(body.updatedAt);
  } catch (error) {
    saveStatus.textContent = error.message || "Không lưu được cấu hình.";
    saveStatus.className = "save-status";
  } finally {
    saveButton.disabled = false;
  }
});


