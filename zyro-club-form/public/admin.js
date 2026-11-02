const apiBase = "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api";

const state = {
  auth: "",
  config: null,
  updatedAt: null,
  registrations: [],
  statusFilter: "all",
  optionCategory: "duration",
  dirty: false,
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
const saveStatus = document.querySelector("[data-save-status]");
const saveButton = document.querySelector("[data-save-config]");

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
  return state.config?.formOptions?.[category]?.find((item) => item.id === value)?.label || value || "—";
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

function counts() {
  const result = { all: state.registrations.length, new: 0, approved: 0, rejected: 0 };
  state.registrations.forEach((item) => { if (result[item.status] !== undefined) result[item.status] += 1; });
  Object.entries(result).forEach(([key, value]) => {
    const node = document.querySelector(`[data-count-status="${key}"]`);
    if (node) node.textContent = value;
  });
}

function renderRegistrations() {
  counts();
  const query = searchInput.value.trim().toLowerCase();
  const filtered = state.registrations.filter((item) => {
    const matchesSearch = !query || item.zaloName.toLowerCase().includes(query);
    const matchesStatus = state.statusFilter === "all" || item.status === state.statusFilter;
    return matchesSearch && matchesStatus;
  });

  registrationStatus.textContent = `${filtered.length} / ${state.registrations.length} đăng ký`;
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "empty-row";
    empty.textContent = "Không có đăng ký trong bộ lọc này.";
    registrationList.replaceChildren(empty);
    return;
  }

  registrationList.replaceChildren(...filtered.map((item) => {
    const row = document.createElement("article");
    row.className = "registration-row";

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
    goal.textContent = item.goal;

    const date = document.createElement("time");
    date.className = "registration-date";
    date.dateTime = item.createdAt;
    date.textContent = new Date(item.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" });

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Trạng thái của ${item.zaloName}`);
    [["new","Chờ duyệt"],["approved","Đã duyệt"],["rejected","Từ chối"]].forEach(([value, label]) => {
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
        item.status = select.value;
        renderRegistrations();
      } catch {
        select.value = previous;
      } finally {
        select.disabled = false;
      }
    });

    row.append(name, profile, goal, date, select);
    return row;
  }));
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
  const [configBody, registrationsBody] = await Promise.all([
    api("/config"),
    api("/registrations", {}, true),
  ]);
  state.config = clone(configBody.config);
  state.updatedAt = configBody.updatedAt;
  state.registrations = registrationsBody.registrations || [];
  updatedLabel.textContent = state.updatedAt ? `Cập nhật ${new Date(state.updatedAt).toLocaleString("vi-VN")}` : "Đã đồng bộ";
  renderRegistrations();
  renderSettings();
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
  shell.hidden = true;
  loginView.hidden = false;
});

document.querySelector("[data-refresh]").addEventListener("click", async () => {
  registrationStatus.textContent = "Đang đồng bộ…";
  try {
    const body = await api("/registrations", {}, true);
    state.registrations = body.registrations || [];
    renderRegistrations();
  } catch {
    registrationStatus.textContent = "Không tải được dữ liệu.";
  }
});

searchInput.addEventListener("input", renderRegistrations);

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.statusFilter = button.dataset.statusFilter;
    document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderRegistrations();
  });
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


