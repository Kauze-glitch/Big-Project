const allowed = {
  duration: new Set(["short", "long", "unsure"]),
  gender: new Set(["male", "female"]),
  position: new Set(["attacker", "defender", "setter", "allrounder"]),
  level: new Set(["newbie", "intermediate", "good"]),
};

function text(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateRegistration(input = {}) {
  const data = {
    zaloName: text(input.zaloName),
    duration: text(input.duration),
    gender: text(input.gender),
    position: text(input.position),
    level: text(input.level),
    goal: text(input.goal),
    email: text(input.email),
  };

  const errors = {};
  if (data.zaloName.length < 2 || data.zaloName.length > 80) {
    errors.zaloName = "Nhập tên Zalo từ 2 đến 80 ký tự.";
  }
  if (!allowed.duration.has(data.duration)) errors.duration = "Chọn thời gian bạn dự định tham gia.";
  if (!allowed.gender.has(data.gender)) errors.gender = "Chọn giới tính.";
  if (!allowed.position.has(data.position)) errors.position = "Chọn vị trí chơi.";
  if (!allowed.level.has(data.level)) errors.level = "Chọn trình độ hiện tại.";
  if (data.goal.length < 3 || data.goal.length > 500) {
    errors.goal = "Chia sẻ mong muốn của bạn trong khoảng 3 đến 500 ký tự.";
  }
  if (data.email && (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
    errors.email = "Địa chỉ email chưa đúng định dạng.";
  }

  return { ok: Object.keys(errors).length === 0, data, errors };
}