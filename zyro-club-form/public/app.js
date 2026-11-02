const apiBase = "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api";
const registrationEndpoint = `${apiBase}/registrations`;
const configEndpoint = `${apiBase}/config`;

const form = document.querySelector("#join-form");
const shell = document.querySelector("[data-form-shell]");
const success = document.querySelector("[data-success]");
const steps = [...document.querySelectorAll("[data-step]")];
const progressDots = [...document.querySelectorAll("[data-progress]")];
const progressBall = document.querySelector("[data-progress-ball]");
const stepLabel = document.querySelector("[data-step-label]");
const stepTitle = document.querySelector("[data-step-title]");
const backButton = document.querySelector("[data-back]");
const nextButton = document.querySelector("[data-next]");
const submitButton = document.querySelector("[data-submit]");
const status = document.querySelector("[data-form-status]");
const goal = document.querySelector("#goal");
const count = document.querySelector("[data-count]");

document.documentElement.classList.add("js");

const revealTargets = document.querySelectorAll(".hero-copy, .hero-brand, .club-principles article, .signup-intro, .form-shell");
revealTargets.forEach((element) => element.setAttribute("data-reveal", ""));
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((element) => revealObserver.observe(element));
} else {
  revealTargets.forEach((element) => element.classList.add("is-visible"));
}

const titles = ["Tên Zalo", "Thời gian tham gia", "Vị trí & trình độ", "Mong muốn"];
let currentStep = 0;

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function makeChoice(name, option, detailed = false) {
  const label = document.createElement("label");
  label.className = detailed ? "choice" : "";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = option.id;

  const content = document.createElement("span");
  if (detailed) {
    const strong = document.createElement("strong");
    strong.textContent = option.label;
    content.append(strong);
    if (option.description) {
      const small = document.createElement("small");
      small.textContent = option.description;
      content.append(small);
    }
  } else {
    content.textContent = option.label;
  }

  label.append(input, content);
  return label;
}

function renderConfig(config) {
  document.querySelectorAll("[data-config]").forEach((element) => {
    const value = getPath(config, element.dataset.config);
    if (typeof value === "string" && value.trim()) element.textContent = value;
  });

  const schedule = document.querySelector("[data-schedule]");
  if (schedule && Array.isArray(config.schedule)) {
    schedule.replaceChildren(...config.schedule.map((slot) => {
      const item = document.createElement("div");
      item.className = "schedule-slot";
      const day = document.createElement("strong");
      day.textContent = slot.day;
      const time = document.createElement("span");
      time.textContent = `${slot.start} — ${slot.end}`;
      item.append(day, time);
      return item;
    }));
    schedule.hidden = config.schedule.length === 0;
  }

  const principles = document.querySelector("[data-principles]");
  if (principles && Array.isArray(config.principles) && config.principles.length) {
    principles.replaceChildren(...config.principles.map((principle) => {
      const article = document.createElement("article");
      const wrap = document.createElement("div");
      const title = document.createElement("h2");
      const body = document.createElement("p");
      title.textContent = principle.title;
      body.textContent = principle.body;
      wrap.append(title, body);
      article.append(wrap);
      return article;
    }));
  }

  const optionGroups = config.formOptions || {};
  for (const name of ["duration", "gender", "position", "level"]) {
    const container = document.querySelector(`[data-options="${name}"]`);
    const options = optionGroups[name];
    if (!container || !Array.isArray(options) || !options.length) continue;
    container.replaceChildren(...options.map((option) => makeChoice(name, option, name === "duration")));
  }

  const contacts = document.querySelector("[data-contacts]");
  if (contacts && Array.isArray(config.contacts)) {
    contacts.replaceChildren(...config.contacts.map((contact) => {
      const link = document.createElement("a");
      link.className = "admin-link";
      link.href = `https://zalo.me/${String(contact.phone).replace(/\D/g, "")}`;
      link.target = "_blank";
      link.rel = "noreferrer";

      const name = document.createElement("span");
      name.textContent = contact.role ? `${contact.name} · ${contact.role}` : contact.name;
      const phone = document.createElement("strong");
      phone.textContent = contact.phone;
      link.append(name, phone);
      return link;
    }));
    contacts.hidden = config.contacts.length === 0;
  }
}

async function loadConfig() {
  try {
    const response = await fetch(configEndpoint, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json();
    if (body?.config) renderConfig(body.config);
  } catch {
    // Static HTML remains a complete fallback if config cannot be loaded.
  }
}

function value(name) {
  const field = form.elements[name];
  if (field instanceof RadioNodeList) return field.value;
  return field?.value?.trim() || "";
}

function setError(name, message = "") {
  const target = document.querySelector(`[data-error-for="${name}"]`);
  if (target) target.textContent = message;
}

function validateStep(index) {
  let valid = true;
  if (index === 0) {
    const name = value("zaloName");
    const message = name.length >= 2 ? "" : "Nhập tên Zalo để tụi mình nhận ra bạn nhé.";
    setError("zaloName", message);
    valid = !message;
  }
  if (index === 1) {
    const message = value("duration") ? "" : "Chọn một phương án để tiếp tục.";
    setError("duration", message);
    valid = !message;
  }
  if (index === 2) {
    for (const name of ["gender", "position", "level"]) {
      const message = value(name) ? "" : "Chọn một phương án.";
      setError(name, message);
      if (message) valid = false;
    }
  }
  if (index === 3) {
    const message = value("goal").length >= 3 ? "" : "Viết vài chữ về điều bạn mong muốn khi vào sân nhé.";
    setError("goal", message);
    valid = !message;
  }
  return valid;
}

function renderStep(index, shouldFocus = true) {
  currentStep = Math.max(0, Math.min(steps.length - 1, index));
  steps.forEach((step, i) => step.classList.toggle("is-active", i === currentStep));
  progressDots.forEach((dot, i) => {
    dot.classList.toggle("is-active", i === currentStep);
    dot.classList.toggle("is-done", i < currentStep);
  });
  progressBall.style.left = `${12.5 + currentStep * 25}%`;
  stepLabel.textContent = `${currentStep + 1} / ${steps.length}`;
  stepTitle.textContent = titles[currentStep];
  backButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;
  status.textContent = "";
  if (shouldFocus) {
    requestAnimationFrame(() => {
      const focusable = steps[currentStep].querySelector("input:not([type=radio]), textarea, input[type=radio]");
      focusable?.focus({ preventScroll: true });
    });
  }
}

nextButton.addEventListener("click", () => {
  if (!validateStep(currentStep)) return;
  renderStep(currentStep + 1);
});

backButton.addEventListener("click", () => renderStep(currentStep - 1));

form.addEventListener("change", (event) => {
  if (event.target.name) setError(event.target.name, "");
});

form.addEventListener("input", (event) => {
  if (event.target.name) setError(event.target.name, "");
});

goal.addEventListener("input", () => {
  count.textContent = `${goal.value.length} / 500`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep(3)) return;
  submitButton.disabled = true;
  submitButton.textContent = "Đang gửi...";
  status.textContent = "";

  const payload = {
    zaloName: value("zaloName"),
    duration: value("duration"),
    gender: value("gender"),
    position: value("position"),
    level: value("level"),
    goal: value("goal"),
  };

  try {
    const response = await fetch(registrationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Không gửi được đăng ký.");

    form.hidden = true;
    success.hidden = false;
    shell.classList.add("is-success");
    success.focus?.();
    success.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
  } catch (error) {
    status.textContent = error.message || "Có lỗi khi gửi. Vui lòng thử lại.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Gửi đăng ký";
  }
});

await loadConfig();
renderStep(0, false);

