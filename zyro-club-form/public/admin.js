const list = document.querySelector("[data-list]");
const statusEl = document.querySelector("[data-status]");
const search = document.querySelector("[data-search]");
const filter = document.querySelector("[data-filter]");
let items = [];

const labels = {
  duration: { short: "Ngắn hạn", long: "Lâu dài", unsure: "Trải nghiệm trước" },
  gender: { male: "Nam", female: "Nữ" },
  position: { attacker: "Công", defender: "Thủ", setter: "Chuyền 2", allrounder: "Toàn diện" },
  level: { newbie: "Người mới", intermediate: "Trung bình", good: "Tốt" },
  status: { new: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" },
};

function escapeText(value) { return String(value ?? ""); }
function render() {
  const query = search.value.trim().toLowerCase();
  const selected = filter.value;
  const shown = items.filter((item) => (!query || item.zaloName.toLowerCase().includes(query)) && (selected === "all" || item.status === selected));
  list.replaceChildren(...shown.map(card));
  statusEl.textContent = `${shown.length} / ${items.length} đăng ký`;
}

function card(item) {
  const article = document.createElement("article");
  article.className = "registration";
  const who = document.createElement("div");
  const h2 = document.createElement("h2"); h2.textContent = escapeText(item.zaloName);
  const date = document.createElement("p"); date.className = "meta"; date.textContent = new Date(item.createdAt).toLocaleString("vi-VN");
  const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = labels.status[item.status] || item.status;
  who.append(h2, date, badge);
  const info = document.createElement("p"); info.className = "meta"; info.textContent = `${labels.gender[item.gender]} · ${labels.position[item.position]} · ${labels.level[item.level]} · ${labels.duration[item.duration]}`;
  const goal = document.createElement("p"); goal.className = "goal"; goal.textContent = item.goal;
  const actions = document.createElement("div"); actions.className = "actions";
  [["approved","Duyệt","approve"],["rejected","Từ chối","reject"],["new","Chờ","new"]].forEach(([value,label,cls]) => {
    const button = document.createElement("button"); button.type = "button"; button.className = cls; button.textContent = label; button.disabled = item.status === value; button.addEventListener("click", () => update(item.id, value)); actions.append(button);
  });
  article.append(who, info, goal, actions);
  return article;
}

async function load() {
  statusEl.textContent = "Đang tải...";
  const response = await fetch("/api/admin/registrations");
  if (!response.ok) { statusEl.textContent = "Không tải được dữ liệu."; return; }
  items = (await response.json()).registrations || [];
  render();
}
async function update(id, status) {
  const response = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  if (!response.ok) return;
  const item = items.find((entry) => entry.id === id); if (item) item.status = status; render();
}
document.querySelector("[data-refresh]").addEventListener("click", load);
search.addEventListener("input", render);
filter.addEventListener("change", render);
load();
